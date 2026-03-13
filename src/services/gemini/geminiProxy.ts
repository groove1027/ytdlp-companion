
import { getKieKey, monitoredFetch } from '../apiService';
import { getEvolinkKey, requestEvolinkNative, fetchWithRateLimitRetry } from '../evolinkService';
import { PRICING } from '../../constants';
import { logger } from '../LoggerService';
import { useCostStore } from '../../stores/costStore';

// [FIX #245] Evolink 429 Rate Limit 쿨다운 — 한 엔드포인트 429 시 전체 Evolink 스킵 → 즉시 Kie 폴백
let _evolinkRateLimitedUntil = 0;
const EVOLINK_RATE_LIMIT_COOLDOWN_MS = 60_000; // 60초 쿨다운

const markEvolinkRateLimited = () => {
    _evolinkRateLimitedUntil = Date.now() + EVOLINK_RATE_LIMIT_COOLDOWN_MS;
    logger.warn(`[Evolink] 429 Rate Limit 감지 — ${EVOLINK_RATE_LIMIT_COOLDOWN_MS / 1000}초간 Evolink 전체 스킵, Kie 우선`);
};

const isEvolinkRateLimited = (): boolean => Date.now() < _evolinkRateLimitedUntil;

// Local Type Definition to replace Google SDK Type enum
const SchemaType = {
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT'
};

// [NEW] Safety Settings: Disable all filters to prevent blocking innocent scripts (e.g. "drill holes")
export const SAFETY_SETTINGS_BLOCK_NONE = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

// Helper: Convert Google Payload to OpenAI Payload for Kie
const convertGoogleToOpenAI = (model: string, googlePayload: any) => {
    const messages = [];
    let systemInstructionText = "";

    // System Instruction -> System Message
    if (googlePayload.systemInstruction) {
        systemInstructionText = googlePayload.systemInstruction.parts?.[0]?.text || "";
    }

    // Contents -> User/Assistant Messages (Handling History)
    if (googlePayload.contents) {
        for (const content of googlePayload.contents) {
            const role = content.role === 'model' ? 'assistant' : 'user';

            // Handle Parts
            const parts = content.parts || [];

            // 1. Handle Function Response (User role in OpenAI, function role in some contexts, but Kie expects tool_result)
            const funcResponse = parts.find((p: any) => p.functionResponse);
            if (funcResponse) {
                messages.push({
                    role: 'tool',
                    tool_call_id: funcResponse.functionResponse.name, // Using name as ID for simplicity mapping
                    content: JSON.stringify(funcResponse.functionResponse.response)
                });
                continue;
            }

            // 2. Handle Text & Images & Function Calls
            const messageContent: any[] = [];
            const toolCalls: any[] = [];

            for (const part of parts) {
                if (part.text) {
                    messageContent.push({ type: 'text', text: part.text });
                } else if (part.inlineData) {
                    messageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        }
                    });
                } else if (part.fileData) {
                    // [FIX] Kie는 모든 미디어(이미지/영상/오디오)를 image_url 포맷으로 통일 수신
                    messageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: part.fileData.fileUri
                        }
                    });
                } else if (part.functionCall) {
                    // Map Google functionCall to OpenAI tool_calls
                    toolCalls.push({
                        id: part.functionCall.name, // Using name as ID for simple mapping logic
                        type: 'function',
                        function: {
                            name: part.functionCall.name,
                            arguments: JSON.stringify(part.functionCall.args || {})
                        }
                    });
                }
            }

            if (toolCalls.length > 0) {
                messages.push({
                    role: role,
                    content: null, // Assistant message with tool_calls usually has null content
                    tool_calls: toolCalls
                });
            } else if (messageContent.length > 0) {
                // If simple text, just pass string to save tokens/complexity, else array
                if (messageContent.length === 1 && messageContent[0].type === 'text') {
                    messages.push({ role: role, content: messageContent[0].text });
                } else {
                    messages.push({ role: role, content: messageContent });
                }
            }
        }
    }

    // Response Format (Default)
    let response_format: any = undefined;
    const isJsonRequested = googlePayload.generationConfig?.responseMimeType === 'application/json';

    if (isJsonRequested) {
        response_format = { type: "json_object" };
        // [FIX] response_format만으로는 JSON 출력이 보장되지 않음
        // 시스템 프롬프트로 JSON 출력을 이중 강제
        const jsonSystemPrompt = "[CRITICAL] You MUST respond with valid JSON ONLY. No markdown code blocks (no ```json). No conversational text (no 'Here is...'). Output ONLY the raw JSON object.";
        if (systemInstructionText) {
            systemInstructionText = jsonSystemPrompt + "\n\n" + systemInstructionText;
        } else {
            systemInstructionText = jsonSystemPrompt;
        }
    }

    // Tools Handling (Google Search -> OpenAI Function)
    let tools: any[] | undefined = undefined;
    if (googlePayload.tools) {
        const hasGoogleSearch = googlePayload.tools.some((t: any) => t.googleSearch || t.google_search);

        if (hasGoogleSearch) {
            // [FIXED] Removed parameters and description for googleSearch tool to comply with Kie API specs
            tools = [{
                type: "function",
                function: {
                    name: "googleSearch"
                }
            }];
        }
    }

    // [CRITICAL] Mutual Exclusivity: response_format AND tools cannot coexist in Kie/OpenAI
    if (tools && tools.length > 0) {
        response_format = undefined; // Disable JSON mode to prevent API Error

        // Compensate with System Instruction if JSON was requested
        if (isJsonRequested) {
            const jsonEnforcement = `
            \n\n[SYSTEM NOTICE: CRITICAL OUTPUT FORMAT]
            1. You are running in 'Function Calling' mode, but the user expects a JSON response.
            2. After using the 'googleSearch' tool (if needed), your FINAL reply MUST be a pure JSON string.
            3. Do NOT include markdown formatting (no \`\`\`json ... \`\`\`).
            4. Do NOT include any conversational text (e.g. "Here is the data").
            5. ONLY return the valid JSON object or array.
            `;
            systemInstructionText += jsonEnforcement;
        }
    }

    // Add System Message if exists
    if (systemInstructionText) {
        messages.unshift({ role: 'system', content: systemInstructionText });
    }

    // Per-task options: temperature, max_tokens
    const temperature = googlePayload.generationConfig?.temperature;
    const maxOutputTokens = googlePayload.generationConfig?.maxOutputTokens;

    const payload: any = {
        messages,
        stream: false
    };

    if (temperature !== undefined) payload.temperature = temperature;
    if (maxOutputTokens !== undefined) payload.max_tokens = maxOutputTokens;
    if (response_format) payload.response_format = response_format;
    if (tools) payload.tools = tools;

    return payload;
};

// [FIX #244] Smart Routing — v1beta 특수 기능 필요 여부 판별
// v1beta 전용 기능: Google Search grounding, fileData(영상/오디오 업로드)
// 텍스트 전용 요청은 안정적인 v1(동일 Gemini 3.1 Pro)을 우선 사용
const needsV1Beta = (googlePayload: any): boolean => {
    // Google Search grounding (tools: [{ googleSearch: {} }])
    if (googlePayload.tools?.some((t: any) => t.googleSearch || t.google_search)) return true;
    // fileData (영상/오디오 파일 — v1beta Google Native 포맷 전용)
    if (googlePayload.contents?.some((c: any) => c.parts?.some((p: any) => p.fileData))) return true;
    return false;
};

// [FIX #191] skipNative 옵션 — 재시도/Flash 폴백 시 Evolink Native 스킵
interface GeminiProxyOptions { skipNative?: boolean; }

// --- CORE PROXY REQUEST FUNCTION ---
// [FIX #244] Smart Routing: 페이로드 분석 → 최적 경로 자동 선택
// - Google Search/fileData 포함 → v1beta 우선 (특수 기능 필요)
// - 텍스트 전용 → v1 우선 (안정적, 동일 Gemini 3.1 Pro, v1beta 불안정 회피)
// - Kie는 항상 최종 폴백 (3.0 Pro 다운그레이드)
export const requestGeminiProxy = async (model: string, googlePayload: any, _retryCount: number = 0, timeoutMs?: number, options?: GeminiProxyOptions): Promise<any> => {
    let lastError: any = null;
    const shouldSkipNative = options?.skipNative || _retryCount > 0;
    const NATIVE_MAX_WAIT_MS = 60_000;
    const requiresBeta = needsV1Beta(googlePayload);

    // --- [Inner Helper] Evolink v1beta (Google Native Format, Gemini 3.1 Pro) ---
    // v1beta 전용 기능: Google Search grounding, fileData(영상/오디오)
    const tryEvolinkV1Beta = async (): Promise<any> => {
        if (shouldSkipNative) throw new Error('v1beta skipped (skipNative/retry)');
        // [FIX #245] 429 쿨다운 중이면 즉시 스킵 → Kie로 폴백
        if (isEvolinkRateLimited()) throw new Error('Evolink rate limited (cooldown active), skipping v1beta');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        const nativeTimeout = timeoutMs ? Math.min(timeoutMs, NATIVE_MAX_WAIT_MS) : NATIVE_MAX_WAIT_MS;
        logger.info(`[Gemini] Evolink v1beta (model: ${model})`, { timeoutMs, nativeTimeout });
        console.log(`[GeminiService] Trying Evolink v1beta (model: ${model}, timeout: ${nativeTimeout / 1000}s)`);
        const data = await requestEvolinkNative(model, googlePayload, 'generateContent', nativeTimeout);
        logger.success(`[Gemini] Evolink v1beta 성공`);
        return data;
    };

    // --- [Inner Helper] Evolink v1/chat/completions (OpenAI Format, 동일 Gemini 3.1 Pro) ---
    // v1beta보다 안정적, 텍스트 전용 요청의 기본 경로
    const tryEvolinkV1Chat = async (): Promise<any> => {
        // [FIX #245] 429 쿨다운 중이면 즉시 스킵 → Kie로 폴백
        if (isEvolinkRateLimited()) throw new Error('Evolink rate limited (cooldown active), skipping v1');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        logger.info(`[Gemini] Evolink v1 Chat (model: ${model}) — 3.1 Pro`);
        console.log("[GeminiService] Trying Evolink v1/chat/completions (3.1 Pro)...");

        const evolinkV1Body = convertGoogleToOpenAI(model, googlePayload);
        evolinkV1Body.model = 'gemini-3.1-pro-preview';

        // [FIX #245] 429 재시도 1회로 축소 (기존 3회 ~21초 낭비) — Smart Routing이 Kie로 빠르게 전환
        const evolinkV1Response = await fetchWithRateLimitRetry(
            'https://api.evolink.ai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${evolinkKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evolinkV1Body)
            },
            1, 3000, timeoutMs
        );

        if (evolinkV1Response.ok) {
            const json = await evolinkV1Response.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;

            if (!toolCalls?.length && !content.trim()) {
                throw new Error(`Evolink v1 빈 응답. finish_reason: ${choice?.finish_reason || 'unknown'}`);
            }

            let parts: any[] = [];
            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({ functionCall: { name: fc.name, args: JSON.parse(fc.arguments || "{}") } });
            } else {
                parts.push({ text: content });
            }

            // 비용 자동 추적
            try {
                const usage = json.usage;
                if (usage) {
                    const inputCost = (usage.prompt_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
                    const outputCost = (usage.completion_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
                    const totalCost = inputCost + outputCost;
                    if (totalCost > 0) {
                        useCostStore.getState().addCost(totalCost, 'analysis');
                        logger.info('[Evolink v1 Chat] 비용 추적', {
                            promptTokens: usage.prompt_tokens,
                            completionTokens: usage.completion_tokens,
                            costUsd: totalCost.toFixed(6)
                        });
                    }
                }
            } catch (costErr) { logger.trackSwallowedError('GeminiProxy:evolinkV1Chat/costTracking', costErr); }

            logger.success(`[Gemini] Evolink v1 Chat 성공 — 3.1 Pro`);
            return { candidates: [{ content: { parts } }] };
        }

        // [FIX #245] 429 응답 시 Evolink 전체 쿨다운 마킹 — 이후 호출은 즉시 Kie로
        if (evolinkV1Response.status === 429) markEvolinkRateLimited();
        const errText = await evolinkV1Response.text();
        throw new Error(`Evolink v1 Chat Error (${evolinkV1Response.status}): ${errText}`);
    };

    // --- [FIX #244] Smart Routing ---
    // Google Search/fileData 포함 → v1beta 우선 (특수 기능 필요)
    // 텍스트 전용 → v1(안정) 우선, v1beta 불안정 회피
    const priorities: Array<{ name: string; fn: () => Promise<any> }> = requiresBeta
        ? [{ name: 'v1beta', fn: tryEvolinkV1Beta }, { name: 'v1', fn: tryEvolinkV1Chat }]
        : [{ name: 'v1', fn: tryEvolinkV1Chat }, { name: 'v1beta', fn: tryEvolinkV1Beta }];

    console.log(`[GeminiService] Smart Routing: ${requiresBeta ? 'v1beta→v1→Kie (Google Search/fileData 감지)' : 'v1→v1beta→Kie (텍스트 전용, 안정 우선)'}`);

    for (const { name, fn } of priorities) {
        try {
            return await fn();
        } catch (e: any) {
            logger.warn(`[Gemini] ${name} 실패: ${e.message}`);
            // [FIX #245] Evolink 429 감지 → 쿨다운 마킹 (에러 메시지에서 429/rate limit 패턴 검출)
            if (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit')) {
                markEvolinkRateLimited();
            }
            lastError = e;
        }
    }

    // Kie (최종 폴백) - Gemini 3.0 Pro (3.1 대비 프롬프트 품질 저하 가능)
    try {
        const kieKey = getKieKey();
        if (!kieKey) {
            if (lastError) throw lastError;
            throw new Error("Evolink and Kie API Keys are missing.");
        }

        logger.warn(`[Gemini] Kie 최종 폴백 호출 (model: ${model}) — 3.0 Pro 다운그레이드`);
        console.log("[GeminiService] Switching to Kie Fallback (3.0 Pro downgrade)...");

        // [FIX #119] Kie는 gemini-3-pro / gemini-3-flash만 지원 (3.1 없음)
        const isThinkingModel = model.includes('thinking');
        let kieModelSlug = 'gemini-3-flash';
        if (model.includes('pro')) kieModelSlug = 'gemini-3-pro';
        else if (model.includes('flash')) kieModelSlug = 'gemini-3-flash';

        const url = `https://api.kie.ai/${kieModelSlug}/v1/chat/completions`;
        const openAIBody = convertGoogleToOpenAI(model, googlePayload);
        openAIBody.model = kieModelSlug;

        // [PERF] Kie 전용 파라미터 추가
        openAIBody.include_thoughts = false; // 앱에서 reasoning_content 미사용 — 불필요 토큰 절약
        // Thinking 모델 요청이면 reasoning_effort: "high" 강제 (Kie 기술 문서 준수)
        openAIBody.reasoning_effort = isThinkingModel ? "high" : (googlePayload._reasoningEffort || "high");

        // [FIX] Kie API response_format 호환성 처리
        // - Flash: response_format 미지원 (공식 문서에 파라미터 미포함)
        // - Pro: json_object 미지원, json_schema만 지원하나 출력 스키마가 호출마다 다름
        //   (analyzeScriptContext=object, parseScriptToScenes=array 등)
        //   → 두 경우 모두 시스템 프롬프트로 JSON 출력 강제
        if (openAIBody.response_format) {
            const jsonEnforcement = "\n\n[CRITICAL OUTPUT FORMAT] You MUST respond with valid JSON only. No markdown code blocks (no ```json). No conversational text. Output ONLY the raw JSON.";
            const sysMsg = openAIBody.messages?.find((m: any) => m.role === 'system');
            if (sysMsg) {
                sysMsg.content += jsonEnforcement;
            } else {
                openAIBody.messages.unshift({ role: 'system', content: jsonEnforcement.trim() });
            }
            delete openAIBody.response_format;
        }

        // [FIX #32] Kie 폴백에도 동일한 타임아웃 적용
        const response = await monitoredFetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kieKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(openAIBody)
        }, timeoutMs);

        if (response.ok) {
            const json = await response.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;

            // [FIX #119] 빈 응답 검증 — 200이어도 content 없으면 에러 처리
            if (!toolCalls?.length && !content.trim()) {
                throw new Error(`Kie 빈 응답 (model: ${kieModelSlug}). finish_reason: ${choice?.finish_reason || 'unknown'}`);
            }

            let parts: any[] = [];

            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({
                    functionCall: {
                        name: fc.name,
                        args: JSON.parse(fc.arguments || "{}")
                    }
                });
            } else {
                parts.push({ text: content });
            }

            return {
                candidates: [{
                    content: {
                        parts: parts
                    }
                }]
            };
        }

        const errText = await response.text();
        throw new Error(`Kie Error (${response.status}): ${errText}`);

    } catch (e: any) {
        // [FIX] 1회 자동 재시도 (모든 프록시 실패 시)
        if (_retryCount < 1) {
            logger.trackRetry('GeminiProxy 전체', _retryCount + 1, 2, (lastError || e)?.message);
            await new Promise(r => setTimeout(r, 2000));
            return requestGeminiProxy(model, googlePayload, _retryCount + 1, timeoutMs, options);
        }
        console.error("[GeminiService] All Proxies Failed after retry.", e);
        throw new Error(`All proxies failed. Last error: ${(lastError || e)?.message || 'Unknown'}`);
    }
};

// --- KIE CHAT COMPLETIONS FALLBACK ---
// [FIX] Kie는 v1beta/generateContent 엔드포인트 없음.
// gemini-3-pro, gemini-3-flash chat/completions (OpenAI 호환)만 지원.
// Google Native 포맷 → OpenAI 변환 → 호출 → Google 포맷 응답 반환.
export const requestKieChatFallback = async (model: string, googlePayload: any, timeoutMs?: number): Promise<any> => {
    const kieKey = getKieKey();
    if (!kieKey) throw new Error("Kie API Key가 설정되지 않았습니다.");

    // Kie는 gemini-3-pro / gemini-3-flash만 지원 (3.1 없음)
    const kieModelSlug = model.includes('pro') ? 'gemini-3-pro' : 'gemini-3-flash';
    const url = `https://api.kie.ai/${kieModelSlug}/v1/chat/completions`;

    const openAIBody = convertGoogleToOpenAI(model, googlePayload);
    openAIBody.model = kieModelSlug;
    openAIBody.include_thoughts = false;
    openAIBody.reasoning_effort = googlePayload?.generationConfig?._reasoningEffort || "high";

    // [FIX] Kie response_format 비호환 → 시스템 프롬프트로 JSON 강제
    if (openAIBody.response_format) {
        const jsonEnforcement = "\n\n[CRITICAL OUTPUT FORMAT] You MUST respond with valid JSON only. No markdown code blocks (no ```json). No conversational text. Output ONLY the raw JSON.";
        const sysMsg = openAIBody.messages?.find((m: any) => m.role === 'system');
        if (sysMsg) {
            sysMsg.content += jsonEnforcement;
        } else {
            openAIBody.messages.unshift({ role: 'system', content: jsonEnforcement.trim() });
        }
        delete openAIBody.response_format;
    }

    logger.info(`[Kie Chat] ${kieModelSlug} 호출`, { model, timeoutMs });

    const response = await monitoredFetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kieKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(openAIBody)
    }, timeoutMs);

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Kie Chat Error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    const choice = json.choices?.[0];
    const content = choice?.message?.content || "";
    const toolCalls = choice?.message?.tool_calls;

    if (!toolCalls?.length && !content.trim()) {
        throw new Error(`Kie 빈 응답 (model: ${kieModelSlug}). finish_reason: ${choice?.finish_reason || 'unknown'}`);
    }

    // OpenAI 응답 → Google Native 포맷 변환
    let parts: any[] = [];
    if (toolCalls && toolCalls.length > 0) {
        const fc = toolCalls[0].function;
        parts.push({
            functionCall: {
                name: fc.name,
                args: JSON.parse(fc.arguments || "{}")
            }
        });
    } else {
        parts.push({ text: content });
    }

    return {
        candidates: [{
            content: { parts }
        }]
    };
};

// --- NATIVE v1beta REQUEST FUNCTION ---
// [FIX #244] Smart Routing 적용: requestGeminiProxy와 동일한 라우팅 로직
export const requestGeminiNative = async (model: string, googlePayload: any, _retryCount: number = 0): Promise<any> => {
    let lastError: any = null;
    const NATIVE_MAX_WAIT_MS = 60_000;
    const requiresBeta = needsV1Beta(googlePayload);

    // --- [Inner Helper] Evolink v1beta ---
    const tryEvolinkV1Beta = async (): Promise<any> => {
        // [FIX #245] 429 쿨다운 중이면 즉시 스킵
        if (isEvolinkRateLimited()) throw new Error('Evolink rate limited (cooldown), skipping v1beta');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        console.log(`[GeminiNative] Trying Evolink v1beta (model: ${model}, maxWait: 60s${_retryCount > 0 ? `, retry #${_retryCount}` : ''})`);
        const data = await requestEvolinkNative(model, googlePayload, 'generateContent', NATIVE_MAX_WAIT_MS);
        return data;
    };

    // --- [Inner Helper] Evolink v1/chat/completions (동일 3.1 Pro) ---
    const tryEvolinkV1Chat = async (): Promise<any> => {
        // [FIX #245] 429 쿨다운 중이면 즉시 스킵
        if (isEvolinkRateLimited()) throw new Error('Evolink rate limited (cooldown), skipping v1');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        console.log("[GeminiNative] Trying Evolink v1/chat/completions (3.1 Pro)...");

        const evolinkV1Body = convertGoogleToOpenAI(model, googlePayload);
        evolinkV1Body.model = 'gemini-3.1-pro-preview';

        // [FIX #245] 429 재시도 1회로 축소 — Smart Routing이 Kie로 전환
        const evolinkV1Response = await fetchWithRateLimitRetry(
            'https://api.evolink.ai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${evolinkKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evolinkV1Body)
            },
            1, 3000
        );

        if (evolinkV1Response.ok) {
            const json = await evolinkV1Response.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;

            if (!toolCalls?.length && !content.trim()) {
                throw new Error(`Evolink v1 빈 응답. finish_reason: ${choice?.finish_reason || 'unknown'}`);
            }

            let parts: any[] = [];
            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({ functionCall: { name: fc.name, args: JSON.parse(fc.arguments || "{}") } });
            } else {
                parts.push({ text: content });
            }

            // 비용 추적
            try {
                const usage = json.usage;
                if (usage) {
                    const totalCost = ((usage.prompt_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M)
                        + ((usage.completion_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M);
                    if (totalCost > 0) useCostStore.getState().addCost(totalCost, 'analysis');
                }
            } catch (costErr) { logger.trackSwallowedError('GeminiNative:evolinkV1/costTracking', costErr); }

            logger.success(`[GeminiNative] Evolink v1 Chat 성공 — 3.1 Pro`);
            return { candidates: [{ content: { parts } }] };
        }

        // [FIX #245] 429 시 쿨다운 마킹
        if (evolinkV1Response.status === 429) markEvolinkRateLimited();
        const errText = await evolinkV1Response.text();
        throw new Error(`Evolink v1 Error (${evolinkV1Response.status}): ${errText}`);
    };

    // --- Smart Routing (requestGeminiProxy와 동일 로직) ---
    const priorities: Array<{ name: string; fn: () => Promise<any> }> = requiresBeta
        ? [{ name: 'v1beta', fn: tryEvolinkV1Beta }, { name: 'v1', fn: tryEvolinkV1Chat }]
        : [{ name: 'v1', fn: tryEvolinkV1Chat }, { name: 'v1beta', fn: tryEvolinkV1Beta }];

    console.log(`[GeminiNative] Smart Routing: ${requiresBeta ? 'v1beta→v1→Kie' : 'v1→v1beta→Kie (텍스트 전용)'}`);

    for (const { name, fn } of priorities) {
        try {
            return await fn();
        } catch (e: any) {
            console.warn(`[GeminiNative] ${name} Error:`, e.message);
            // [FIX #245] 429 감지 → Evolink 전체 쿨다운
            if (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit')) {
                markEvolinkRateLimited();
            }
            lastError = e;
        }
    }

    // Kie Chat Completions 최종 폴백 (3.0 Pro 다운그레이드)
    try {
        const kieKey = getKieKey();
        if (!kieKey) {
            if (lastError) throw lastError;
            throw new Error("Evolink and Kie API Keys are missing.");
        }

        console.log("[GeminiNative] Switching to Kie Chat Completions Fallback (3.0 Pro downgrade)...");
        return await requestKieChatFallback(model, googlePayload);

    } catch (e: any) {
        // 1회 자동 재시도 (2초 대기)
        if (_retryCount < 1) {
            logger.trackRetry('GeminiNative 전체', _retryCount + 1, 2, (lastError || e)?.message);
            await new Promise(r => setTimeout(r, 2000));
            return requestGeminiNative(model, googlePayload, _retryCount + 1);
        }
        console.error("[GeminiNative] All Proxies Failed after retry.", e);
        throw new Error(`All proxies failed. Last error: ${(lastError || e)?.message || 'Unknown'}`);
    }
};

export const extractTextFromResponse = (data: any): string => {
    try {
        const parts = data.candidates?.[0]?.content?.parts;
        if (!parts || parts.length === 0) return "";

        // [FIX] When thinkingConfig is enabled, parts[0] is the thinking part (thought: true).
        // The actual response text is in the LAST non-thinking part.
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].text && !parts[i].thought) {
                return parts[i].text;
            }
        }
        // Fallback: return any text part
        return parts[0]?.text || "";
    } catch (e) {
        console.error("Failed to extract text from response", data);
        return "";
    }
};

// [NEW] Helper to check for function calls
export const extractFunctionCall = (data: any) => {
    try {
        const parts = data.candidates?.[0]?.content?.parts;
        if (!parts) return null;
        // Skip thinking parts, find the first functionCall part
        for (const part of parts) {
            if (part.functionCall && !part.thought) return part.functionCall;
        }
        return null;
    } catch (e) {
        return null;
    }
};

// TODO: This is a STUB/MOCK implementation. No real Google Search grounding API is connected.
// It returns a fake result instructing the model to use internal knowledge instead.
// This exists solely to satisfy the function-calling loop when googleSearch tool is invoked,
// preventing the conversation from crashing. Replace with a real search API when available.
export const performMockSearch = async (query: string): Promise<string> => {
    console.warn(`[System] Mock Search Triggered (no real search API connected) for: ${query}`);
    return JSON.stringify({
        result: `[System Message] External search is currently simulated. Please use your internal knowledge base to provide detailed visual descriptions for '${query}'. If it is a famous person or object, describe it accurately based on your high-confidence training data.`
    });
};

export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await monitoredFetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const fetchCurrentExchangeRate = async () => {
    const now = new Date();
    const timeStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1순위: ExchangeRate-API (무료, 키 불필요, 일 1회+ 업데이트)
    try {
        const res = await monitoredFetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (res.ok) {
            const data = await res.json();
            const rate = data.rates?.KRW;
            if (rate && typeof rate === 'number') {
                return { rate: Math.round(rate * 100) / 100, date: `${timeStr}\nExchangeRate-API` };
            }
        }
    } catch (e) { logger.trackSwallowedError('GeminiProxy:getExchangeRate/exchangeRateApi', e); }

    // 2순위: Frankfurter (ECB 기반, 평일 1회 업데이트)
    try {
        const res = await monitoredFetch('https://api.frankfurter.app/latest?from=USD&to=KRW');
        if (res.ok) {
            const data = await res.json();
            const rate = data.rates?.KRW;
            if (rate && typeof rate === 'number') {
                return { rate: Math.round(rate * 100) / 100, date: `${timeStr}\nFrankfurter/ECB` };
            }
        }
    } catch (e) { logger.trackSwallowedError('GeminiProxy:getExchangeRate/frankfurter', e); }

    return {
        rate: PRICING.EXCHANGE_RATE,
        date: `${timeStr}\n고정 환율 (Fallback)`
    };
};

export const validateGeminiConnection = async () => {
    try {
        await requestGeminiProxy('gemini-3.1-pro-preview', {
            contents: [{ role: 'user', parts: [{ text: "ping" }] }]
        });
        return { success: true, message: "Gemini (Evolink/Proxy) 연결 성공!" };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
};
