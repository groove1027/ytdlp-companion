
import { getKieKey, monitoredFetch } from '../apiService';
import { getEvolinkKey, requestEvolinkNative, fetchWithRateLimitRetry } from '../evolinkService';
import { PRICING } from '../../constants';
import { logger } from '../LoggerService';
import { useCostStore } from '../../stores/costStore';

// [FIX #245] Evolink 429 Rate Limit 쿨다운 — Pro 모델 429 시 Flash Lite 우선, Kie는 최후 비상
// 429는 모델별 rate limit일 수 있으므로 Pro만 쿨다운, Flash Lite는 별도 시도
let _evolinkProRateLimitedUntil = 0;
const EVOLINK_RATE_LIMIT_COOLDOWN_MS = 60_000; // 기본 60초 쿨다운 (Evolink 공식 문서: "retry after 60 seconds")
let _kieRateLimitedUntil = 0;
const KIE_RATE_LIMIT_COOLDOWN_MS = 60_000;

const markEvolinkProRateLimited = (retryAfterMs?: number) => {
    // Retry-After 헤더 값이 있으면 그 시간 사용, 없으면 기본 60초
    const cooldownMs = retryAfterMs && retryAfterMs > 0
        ? Math.min(retryAfterMs, 120_000) // 최대 120초 캡
        : EVOLINK_RATE_LIMIT_COOLDOWN_MS;
    _evolinkProRateLimitedUntil = Math.max(_evolinkProRateLimitedUntil, Date.now() + cooldownMs);
    logger.warn(`[Evolink] Pro 429 Rate Limit 감지 — ${Math.round(cooldownMs / 1000)}초간 Pro 스킵, Flash Lite 우선`);
};

const isEvolinkProRateLimited = (): boolean => Date.now() < _evolinkProRateLimitedUntil;

const markKieRateLimited = (retryAfterMs?: number) => {
    const cooldownMs = retryAfterMs && retryAfterMs > 0
        ? Math.min(retryAfterMs, 120_000)
        : KIE_RATE_LIMIT_COOLDOWN_MS;
    _kieRateLimitedUntil = Math.max(_kieRateLimitedUntil, Date.now() + cooldownMs);
    logger.warn(`[Kie] 429 Rate Limit 감지 — ${Math.round(cooldownMs / 1000)}초간 KIE 스킵`);
};

const isKieRateLimited = (): boolean => Date.now() < _kieRateLimitedUntil;

// [FIX #245] 429 응답에서 Retry-After 헤더 추출 (초 → ms 변환)
const extractRetryAfterMs = (response: Response): number | undefined => {
    const header = response.headers.get('Retry-After') || response.headers.get('retry-after');
    if (!header) return undefined;
    const sec = parseInt(header, 10);
    return (!isNaN(sec) && sec > 0) ? sec * 1000 : undefined;
};

// [NEW] Safety Settings: Disable all filters to prevent blocking innocent scripts (e.g. "drill holes")
export const SAFETY_SETTINGS_BLOCK_NONE = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

// 작업 프로필 — KIE vs Evolink 라우팅 힌트
export type TaskProfile =
    | 'structured_large_json'
    | 'long_text_generation'
    | 'file_analysis'
    | 'short_analysis'
    | 'default';

const KIE_JSON_ONLY_SYSTEM_PROMPT = "\n\n[CRITICAL OUTPUT FORMAT] You MUST respond with valid JSON only. No markdown code blocks (no ```json). No conversational text. Output ONLY the raw JSON.";

const extractStructuredJsonText = (text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const candidates = [trimmed];
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) candidates.push(codeBlockMatch[1].trim());

    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
        candidates.push(trimmed.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
        candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
    }

    for (const candidate of candidates) {
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    return null;
};

const shouldValidateKieJson = (taskProfile: TaskProfile, googlePayload: any): boolean => (
    taskProfile === 'structured_large_json' || googlePayload?.generationConfig?.responseMimeType === 'application/json'
);

const trackGeminiProxyCost = (
    usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
    model: string,
    logLabel: string
) => {
    try {
        if (!usage) return;
        const isFlash = model.includes('flash');
        const inputRate = isFlash ? PRICING.GEMINI_FLASH_INPUT_PER_1M : PRICING.GEMINI_PRO_INPUT_PER_1M;
        const outputRate = isFlash ? PRICING.GEMINI_FLASH_OUTPUT_PER_1M : PRICING.GEMINI_PRO_OUTPUT_PER_1M;
        const inputCost = (usage.prompt_tokens || 0) / 1_000_000 * inputRate;
        const outputCost = (usage.completion_tokens || 0) / 1_000_000 * outputRate;
        const totalCost = inputCost + outputCost;
        if (totalCost > 0) {
            useCostStore.getState().addCost(totalCost, 'analysis');
            logger.info(logLabel, {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                costUsd: totalCost.toFixed(6)
            });
        }
    } catch (e) {
        logger.trackSwallowedError(`${logLabel}:costTracking`, e);
    }
};

const ensureSystemInstruction = (messages: Record<string, unknown>[], instruction: string) => {
    const systemMessage = messages.find((message) => message.role === 'system');
    if (systemMessage && typeof systemMessage.content === 'string') {
        if (!systemMessage.content.includes(instruction.trim())) {
            systemMessage.content += instruction;
        }
        return;
    }
    messages.unshift({ role: 'system', content: instruction.trim() });
};

const applyKieStructuredOutput = (openAIBody: Record<string, unknown>, _googlePayload: Record<string, unknown>) => {
    const messages = Array.isArray(openAIBody.messages)
        ? openAIBody.messages as Record<string, unknown>[]
        : [];
    if (!openAIBody.response_format) return;

    // KIE strict json_schema는 빈 객체만 반환하는 사례가 있어 response_format을 제거하고
    // 시스템 프롬프트 기반 JSON 강제만 유지한다.
    delete openAIBody.response_format;
    ensureSystemInstruction(messages, KIE_JSON_ONLY_SYSTEM_PROMPT);
};

const getKieModelSlug = (model: string): 'gemini-3.1-pro' | 'gemini-3-flash' => (
    model.includes('pro') ? 'gemini-3.1-pro' : 'gemini-3-flash'
);

// Helper: Convert Google Payload to OpenAI Payload for Kie
const convertGoogleToOpenAI = (model: string, googlePayload: any) => {
    const messages = [];
    let systemInstructionText = "";

    // System Instruction -> System Message
    if (googlePayload.systemInstruction) {
        systemInstructionText = googlePayload.systemInstruction.parts
            ?.map((part: any) => typeof part?.text === 'string' ? part.text : '')
            .filter(Boolean)
            .join('\n') || "";
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
        const jsonSystemPrompt = KIE_JSON_ONLY_SYSTEM_PROMPT.trim();
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
interface GeminiProxyOptions {
    skipNative?: boolean;
    taskProfile?: TaskProfile;
}

type GeminiProxyOptionsInput = GeminiProxyOptions | TaskProfile | undefined;

const normalizeGeminiProxyOptions = (options: GeminiProxyOptionsInput): GeminiProxyOptions => {
    if (typeof options === 'string') {
        return { taskProfile: options };
    }
    return options || {};
};

const shouldPreferKieFirst = (taskProfile: TaskProfile, requiresBeta: boolean, model: string): boolean => {
    if (requiresBeta) return false;
    if (model.toLowerCase().includes('flash')) return false;
    return taskProfile === 'structured_large_json' || taskProfile === 'long_text_generation';
};

// --- CORE PROXY REQUEST FUNCTION ---
// [FIX #244] Smart Routing: 페이로드 분석 → 최적 경로 자동 선택
// - Google Search/fileData 포함 → v1beta 우선 (특수 기능 필요)
// - 텍스트 전용 → v1 우선 (안정적, 동일 Gemini 3.1 Pro, v1beta 불안정 회피)
// - Kie는 항상 최종 폴백 (Gemini 3.1 Pro — 동급 품질)
export const requestGeminiProxy = async (model: string, googlePayload: any, _retryCount: number = 0, timeoutMs?: number, options?: GeminiProxyOptionsInput): Promise<any> => {
    let lastError: any = null;
    const resolvedOptions = normalizeGeminiProxyOptions(options);
    const shouldSkipNative = resolvedOptions.skipNative || _retryCount > 0;
    const NATIVE_MAX_WAIT_MS = 60_000;
    const requiresBeta = needsV1Beta(googlePayload);
    const taskProfile = resolvedOptions.taskProfile || 'default';

    // --- [Inner Helper] Evolink v1beta (Google Native Format, Gemini 3.1 Pro) ---
    // v1beta 전용 기능: Google Search grounding, fileData(영상/오디오)
    const tryEvolinkV1Beta = async (): Promise<any> => {
        if (shouldSkipNative) throw new Error('v1beta skipped (skipNative/retry)');
        // [FIX #245] Pro 429 쿨다운 중이면 스킵 → Flash Lite로
        if (isEvolinkProRateLimited()) throw new Error('Evolink Pro rate limited (cooldown), skipping v1beta');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        const nativeTimeout = timeoutMs ? Math.min(timeoutMs, NATIVE_MAX_WAIT_MS) : NATIVE_MAX_WAIT_MS;
        logger.info(`[Gemini] Evolink v1beta (model: ${model})`, { timeoutMs, nativeTimeout });
        console.log(`[GeminiService] Trying Evolink v1beta (model: ${model}, timeout: ${nativeTimeout / 1000}s)`);
        const data = await requestEvolinkNative(model, googlePayload, 'generateContent', nativeTimeout);
        logger.success(`[Gemini] Evolink v1beta 성공`);
        return data;
    };

    // --- [Inner Helper] Evolink v1/chat/completions (OpenAI Format, Gemini 3.1 Pro) ---
    // v1beta보다 안정적, 텍스트 전용 요청의 기본 경로
    const tryEvolinkV1Chat = async (): Promise<any> => {
        // [FIX #245] Pro 429 쿨다운 중이면 스킵 → Flash Lite로
        if (isEvolinkProRateLimited()) throw new Error('Evolink Pro rate limited (cooldown), skipping v1');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        logger.info(`[Gemini] Evolink v1 Chat (model: ${model}) — 3.1 Pro`);
        console.log("[GeminiService] Trying Evolink v1/chat/completions (3.1 Pro)...");

        const evolinkV1Body = convertGoogleToOpenAI(model, googlePayload);
        evolinkV1Body.model = 'gemini-3.1-pro-preview';

        // [FIX #245] 429 재시도 1회 — Smart Routing이 Flash Lite로 빠르게 전환
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

            // [FIX #249] 응답 잘림 경고 — finishReason: "length"이면 JSON이 불완전할 수 있음
            if (choice?.finish_reason === 'length') {
                logger.warn('[Gemini] ⚠️ Evolink v1 응답 잘림 (finish_reason: length) — 토큰 제한 초과, JSON 복구 시도됨', {
                    completionTokens: json.usage?.completion_tokens
                });
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

        // [FIX #245] Pro 429 → Retry-After 헤더 기반 쿨다운 마킹
        if (evolinkV1Response.status === 429) markEvolinkProRateLimited(extractRetryAfterMs(evolinkV1Response));
        const errText = await evolinkV1Response.text();
        throw new Error(`Evolink v1 Chat Error (${evolinkV1Response.status}): ${errText}`);
    };

    // --- [FIX #245] Evolink 3.1 Flash Lite (Pro 429 시 동급 폴백) ---
    // Evolink 기술문서: gemini-3.1-flash-lite-preview — Pro와 동일 Evolink 계정, 3.1급 품질 유지
    // Pro가 rate limited 되어도 Flash Lite는 별도 모델이라 사용 가능
    const tryEvolinkFlashLite = async (): Promise<any> => {
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        logger.info(`[Gemini] Evolink Flash Lite 폴백 — 3.1 Flash Lite`);
        console.log("[GeminiService] Trying Evolink v1/chat/completions (3.1 Flash Lite)...");

        const flashBody = convertGoogleToOpenAI(model, googlePayload);
        flashBody.model = 'gemini-3.1-flash-lite-preview';

        const flashResponse = await fetchWithRateLimitRetry(
            'https://api.evolink.ai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${evolinkKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(flashBody)
            },
            1, 3000, timeoutMs
        );

        if (flashResponse.ok) {
            const json = await flashResponse.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;

            if (!toolCalls?.length && !content.trim()) {
                throw new Error(`Evolink Flash Lite 빈 응답. finish_reason: ${choice?.finish_reason || 'unknown'}`);
            }

            // [FIX #249] 응답 잘림 경고
            if (choice?.finish_reason === 'length') {
                logger.warn('[Gemini] ⚠️ Flash Lite 응답 잘림 (finish_reason: length)', {
                    completionTokens: json.usage?.completion_tokens
                });
            }

            let parts: any[] = [];
            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({ functionCall: { name: fc.name, args: JSON.parse(fc.arguments || "{}") } });
            } else {
                parts.push({ text: content });
            }

            // Flash Lite 비용 추적 (Pro보다 저렴 — 별도 가격 미확인 시 Pro 가격 적용)
            try {
                const usage = json.usage;
                if (usage) {
                    const inputCost = (usage.prompt_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
                    const outputCost = (usage.completion_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
                    const totalCost = inputCost + outputCost;
                    if (totalCost > 0) {
                        useCostStore.getState().addCost(totalCost, 'analysis');
                        logger.info('[Evolink Flash Lite] 비용 추적', { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, costUsd: totalCost.toFixed(6) });
                    }
                }
            } catch (costErr) { logger.trackSwallowedError('GeminiProxy:evolinkFlashLite/costTracking', costErr); }

            logger.success(`[Gemini] Evolink Flash Lite 성공 — 3.1 Flash Lite`);
            return { candidates: [{ content: { parts } }] };
        }

        const errText = await flashResponse.text();
        throw new Error(`Evolink Flash Lite Error (${flashResponse.status}): ${errText}`);
    };

    const tryKieChat = async (): Promise<any> => {
        const kieKey = getKieKey();
        if (!kieKey) throw new Error("Kie API Key가 설정되지 않았습니다.");
        if (isKieRateLimited()) throw new Error('Kie rate limited (cooldown), skipping');

        const kieModelSlug = getKieModelSlug(model);
        const expectsJson = shouldValidateKieJson(taskProfile, googlePayload);
        const effectiveTimeoutMs = timeoutMs ?? 60_000;

        logger.warn(`[Gemini] Kie 호출 (model: ${kieModelSlug}, taskProfile: ${taskProfile})`);
        console.log(`[GeminiService] Trying Kie (${kieModelSlug}, taskProfile: ${taskProfile})...`);

        const url = `https://api.kie.ai/${kieModelSlug}/v1/chat/completions`;
        const openAIBody = convertGoogleToOpenAI(model, googlePayload);
        openAIBody.model = kieModelSlug;
        openAIBody.stream = false;
        openAIBody.include_thoughts = false;

        const isThinkingModel = model.includes('thinking');
        openAIBody.reasoning_effort = isThinkingModel ? "high" : (googlePayload._reasoningEffort || "high");

        applyKieStructuredOutput(openAIBody, googlePayload);

        const response = await fetchWithRateLimitRetry(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kieKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(openAIBody)
        }, 3, 3000, effectiveTimeoutMs);

        if (!response.ok) {
            if (response.status === 429) markKieRateLimited(extractRetryAfterMs(response));
            const errText = await response.text();
            throw new Error(`Kie Error (${response.status}): ${errText}`);
        }

        const json = await response.json();
        const choice = json.choices?.[0];
        const content = choice?.message?.content || "";
        const toolCalls = choice?.message?.tool_calls;

        trackGeminiProxyCost(json.usage, kieModelSlug, '[Kie Chat] 비용 추적');

        if (!toolCalls?.length && !content.trim()) {
            throw new Error(`Kie 빈 응답 (model: ${kieModelSlug}). finish_reason: ${choice?.finish_reason || 'unknown'}`);
        }

        const normalizedContent = !toolCalls?.length && expectsJson
            ? extractStructuredJsonText(content)
            : content;
        if (!toolCalls?.length && expectsJson && !normalizedContent) {
            throw new Error(`Kie JSON 응답 형식 오류 (model: ${kieModelSlug}).`);
        }

        const parts: Record<string, unknown>[] = [];

        if (toolCalls && toolCalls.length > 0) {
            const fc = toolCalls[0].function;
            parts.push({
                functionCall: {
                    name: fc.name,
                    args: JSON.parse(fc.arguments || "{}")
                }
            });
        } else {
            parts.push({ text: normalizedContent || content });
        }

        return {
            candidates: [{
                content: {
                    parts
                }
            }]
        };
    };

    // --- [FIX #244/#245] Smart Routing ---
    // 텍스트 전용: v1(Pro) → v1beta(Pro) → Flash Lite → Kie 3.1 Pro
    // Google Search/fileData: v1beta(Pro) → v1(Pro) → Flash Lite → Kie 3.1 Pro
    // 전 구간 3.1급 품질 유지 — Kie도 3.1 Pro 지원 (docs.kie.ai 2026-03 확인)
    const evolinkPriorities: Array<{ name: string; fn: () => Promise<any> }> = requiresBeta
        ? [{ name: 'v1beta(Pro)', fn: tryEvolinkV1Beta }, { name: 'v1(Pro)', fn: tryEvolinkV1Chat }, { name: 'FlashLite', fn: tryEvolinkFlashLite }]
        : [{ name: 'v1(Pro)', fn: tryEvolinkV1Chat }, { name: 'v1beta(Pro)', fn: tryEvolinkV1Beta }, { name: 'FlashLite', fn: tryEvolinkFlashLite }];
    const kieFirst = shouldPreferKieFirst(taskProfile, requiresBeta, model);
    const priorities: Array<{ name: string; fn: () => Promise<any> }> = kieFirst
        ? [{ name: 'Kie', fn: tryKieChat }, ...evolinkPriorities]
        : evolinkPriorities;

    const routeLabel = kieFirst
        ? `Kie3.1→${requiresBeta ? 'v1beta(Pro)→v1(Pro)→FlashLite' : 'v1(Pro)→v1beta(Pro)→FlashLite'}`
        : (requiresBeta ? 'v1beta(Pro)→v1(Pro)→FlashLite→Kie3.1' : 'v1(Pro)→v1beta(Pro)→FlashLite→Kie3.1');
    console.log(`[GeminiService] Smart Routing (${taskProfile}): ${routeLabel}`);

    for (const { name, fn } of priorities) {
        try {
            return await fn();
        } catch (e: any) {
            logger.warn(`[Gemini] ${name} 실패: ${e.message}`);
            // [FIX #245] Pro 429 감지 → Pro만 쿨다운 (Flash Lite는 영향 없음)
            if (name.includes('Pro') && (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit'))) {
                markEvolinkProRateLimited();
            }
            if (name === 'Kie' && (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit'))) {
                markKieRateLimited();
            }
            lastError = e;
        }
    }

    // Kie (최종 폴백) — structured_large_json/long_text_generation은 이미 선시도했으므로 재시도하지 않음
    try {
        if (!kieFirst) {
            return await tryKieChat();
        }
        if (lastError) throw lastError;
        throw new Error("Evolink and Kie API Keys are missing.");
    } catch (e: any) {
        // [FIX] 1회 자동 재시도 (모든 프록시 실패 시)
        if (_retryCount < 1) {
            logger.trackRetry('GeminiProxy 전체', _retryCount + 1, 2, (lastError || e)?.message);
            await new Promise(r => setTimeout(r, 2000));
            return requestGeminiProxy(model, googlePayload, _retryCount + 1, timeoutMs, resolvedOptions);
        }
        console.error("[GeminiService] All Proxies Failed after retry.", e);
        throw new Error(`All proxies failed. Last error: ${(lastError || e)?.message || 'Unknown'}`);
    }
};

// --- KIE CHAT COMPLETIONS FALLBACK ---
// [FIX] Kie는 v1beta/generateContent 엔드포인트 없음.
// gemini-3.1-pro, gemini-3-flash chat/completions (OpenAI 호환) 지원.
// Google Native 포맷 → OpenAI 변환 → 호출 → Google 포맷 응답 반환.
export const requestKieChatFallback = async (model: string, googlePayload: any, timeoutMs?: number): Promise<any> => {
    const kieKey = getKieKey();
    if (!kieKey) throw new Error("Kie API Key가 설정되지 않았습니다.");
    if (isKieRateLimited()) throw new Error('Kie rate limited (cooldown), skipping');

    // [FIX #245] Kie Gemini 3.1 Pro 지원 (docs.kie.ai 2026-03 확인)
    const kieModelSlug = getKieModelSlug(model);
    const expectsJson = shouldValidateKieJson('default', googlePayload);
    const effectiveTimeoutMs = timeoutMs ?? 60_000;
    const url = `https://api.kie.ai/${kieModelSlug}/v1/chat/completions`;

    const openAIBody = convertGoogleToOpenAI(model, googlePayload);
    openAIBody.model = kieModelSlug;
    openAIBody.stream = false;
    openAIBody.include_thoughts = false;
    openAIBody.reasoning_effort = googlePayload?._reasoningEffort || googlePayload?.generationConfig?._reasoningEffort || "high";

    // [FIX] KIE는 response_format을 제거하고 시스템 프롬프트 기반 JSON 강제만 유지
    applyKieStructuredOutput(openAIBody, googlePayload);

    logger.info(`[Kie Chat] ${kieModelSlug} 호출`, { model, timeoutMs });

    const response = await fetchWithRateLimitRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${kieKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(openAIBody)
    }, 3, 3000, effectiveTimeoutMs);

    if (!response.ok) {
        if (response.status === 429) markKieRateLimited(extractRetryAfterMs(response));
        const errText = await response.text();
        throw new Error(`Kie Chat Error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    const choice = json.choices?.[0];
    const content = choice?.message?.content || "";
    const toolCalls = choice?.message?.tool_calls;

    trackGeminiProxyCost(json.usage, kieModelSlug, '[Kie Chat Fallback] 비용 추적');

    if (!toolCalls?.length && !content.trim()) {
        throw new Error(`Kie 빈 응답 (model: ${kieModelSlug}). finish_reason: ${choice?.finish_reason || 'unknown'}`);
    }

    const normalizedContent = !toolCalls?.length && expectsJson
        ? extractStructuredJsonText(content)
        : content;
    if (!toolCalls?.length && expectsJson && !normalizedContent) {
        throw new Error(`Kie JSON 응답 형식 오류 (model: ${kieModelSlug}).`);
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
        parts.push({ text: normalizedContent || content });
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

    // --- [Inner Helper] Evolink v1beta (Pro) ---
    const tryEvolinkV1Beta = async (): Promise<any> => {
        if (isEvolinkProRateLimited()) throw new Error('Evolink Pro rate limited (cooldown), skipping v1beta');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        console.log(`[GeminiNative] Trying Evolink v1beta (model: ${model}, maxWait: 60s${_retryCount > 0 ? `, retry #${_retryCount}` : ''})`);
        const data = await requestEvolinkNative(model, googlePayload, 'generateContent', NATIVE_MAX_WAIT_MS);
        return data;
    };

    // --- [Inner Helper] Evolink v1/chat/completions (Pro) ---
    const tryEvolinkV1Chat = async (): Promise<any> => {
        if (isEvolinkProRateLimited()) throw new Error('Evolink Pro rate limited (cooldown), skipping v1');
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        console.log("[GeminiNative] Trying Evolink v1/chat/completions (3.1 Pro)...");

        const evolinkV1Body = convertGoogleToOpenAI(model, googlePayload);
        evolinkV1Body.model = 'gemini-3.1-pro-preview';

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

            // [FIX #249] 응답 잘림 경고 (재시도 경로)
            if (choice?.finish_reason === 'length') {
                logger.warn('[Gemini] ⚠️ Evolink v1 재시도 응답 잘림 (finish_reason: length)', {
                    completionTokens: json.usage?.completion_tokens
                });
            }

            let parts: any[] = [];
            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({ functionCall: { name: fc.name, args: JSON.parse(fc.arguments || "{}") } });
            } else {
                parts.push({ text: content });
            }

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

        if (evolinkV1Response.status === 429) markEvolinkProRateLimited(extractRetryAfterMs(evolinkV1Response));
        const errText = await evolinkV1Response.text();
        throw new Error(`Evolink v1 Error (${evolinkV1Response.status}): ${errText}`);
    };

    // --- [FIX #245] Evolink 3.1 Flash Lite (Pro 429 시 동급 폴백) ---
    const tryEvolinkFlashLite = async (): Promise<any> => {
        const evolinkKey = getEvolinkKey();
        if (!evolinkKey) throw new Error('No Evolink key');
        console.log("[GeminiNative] Trying Evolink v1/chat/completions (3.1 Flash Lite)...");

        const flashBody = convertGoogleToOpenAI(model, googlePayload);
        flashBody.model = 'gemini-3.1-flash-lite-preview';

        const flashResponse = await fetchWithRateLimitRetry(
            'https://api.evolink.ai/v1/chat/completions',
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${evolinkKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(flashBody)
            },
            1, 3000
        );

        if (flashResponse.ok) {
            const json = await flashResponse.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;
            if (!toolCalls?.length && !content.trim()) throw new Error(`Evolink Flash Lite 빈 응답`);

            let parts: any[] = [];
            if (toolCalls && toolCalls.length > 0) {
                const fc = toolCalls[0].function;
                parts.push({ functionCall: { name: fc.name, args: JSON.parse(fc.arguments || "{}") } });
            } else {
                parts.push({ text: content });
            }

            try {
                const usage = json.usage;
                if (usage) {
                    const totalCost = ((usage.prompt_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M)
                        + ((usage.completion_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M);
                    if (totalCost > 0) useCostStore.getState().addCost(totalCost, 'analysis');
                }
            } catch (costErr) { logger.trackSwallowedError('GeminiNative:flashLite/costTracking', costErr); }

            logger.success(`[GeminiNative] Evolink Flash Lite 성공`);
            return { candidates: [{ content: { parts } }] };
        }

        const errText = await flashResponse.text();
        throw new Error(`Evolink Flash Lite Error (${flashResponse.status}): ${errText}`);
    };

    // --- Smart Routing: Pro → Flash Lite → Kie ---
    const priorities: Array<{ name: string; fn: () => Promise<any> }> = requiresBeta
        ? [{ name: 'v1beta(Pro)', fn: tryEvolinkV1Beta }, { name: 'v1(Pro)', fn: tryEvolinkV1Chat }, { name: 'FlashLite', fn: tryEvolinkFlashLite }]
        : [{ name: 'v1(Pro)', fn: tryEvolinkV1Chat }, { name: 'v1beta(Pro)', fn: tryEvolinkV1Beta }, { name: 'FlashLite', fn: tryEvolinkFlashLite }];

    console.log(`[GeminiNative] Smart Routing: ${requiresBeta ? 'v1beta(Pro)→v1(Pro)→FlashLite→Kie3.1' : 'v1(Pro)→v1beta(Pro)→FlashLite→Kie3.1'}`);

    for (const { name, fn } of priorities) {
        try {
            return await fn();
        } catch (e: any) {
            console.warn(`[GeminiNative] ${name} Error:`, e.message);
            if (name.includes('Pro') && (e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit'))) {
                markEvolinkProRateLimited();
            }
            lastError = e;
        }
    }

    // Kie Chat Completions 최종 폴백 (Gemini 3.1 Pro — 동급 품질)
    try {
        const kieKey = getKieKey();
        if (!kieKey) {
            if (lastError) throw lastError;
            throw new Error("Evolink and Kie API Keys are missing.");
        }

        console.log("[GeminiNative] Switching to Kie Chat Completions Fallback (3.1 Pro)...");
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

// [REMOVED] extractFunctionCall, performMockSearch — Entity Enrichment 제거로 불필요

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
