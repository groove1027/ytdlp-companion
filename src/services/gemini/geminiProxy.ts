
import { getKieKey, getLaozhangKey, monitoredFetch } from '../apiService';
import { getEvolinkKey, requestEvolinkNative } from '../evolinkService';
import { PRICING } from '../../constants';
import { logger } from '../LoggerService';

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
        // [FIX] response_format만으로는 JSON 출력이 보장되지 않음 (Laozhang Gemini 프록시 미지원 확인)
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

// --- CORE PROXY REQUEST FUNCTION ---
export const requestGeminiProxy = async (model: string, googlePayload: any, _retryCount: number = 0): Promise<any> => {
    let lastError: any = null;

    // 0. Try Evolink Native v1beta (Priority 0) - Google Native Format
    try {
        const evolinkKey = getEvolinkKey();
        if (evolinkKey) {
            logger.info(`[Gemini] Evolink Native 호출 (model: ${model})`);
            console.log(`[GeminiService] Trying Evolink Native (Priority 0) with model: ${model}${_retryCount > 0 ? ` (retry #${_retryCount})` : ''}`);
            const data = await requestEvolinkNative(model, googlePayload);
            logger.success(`[Gemini] Evolink Native 응답 수신 완료`);
            return data;
        }
    } catch (e: any) {
        logger.warn(`[Gemini] Evolink Native 실패: ${e.message}`);
        console.warn("[GeminiService] Evolink Native Error:", e.message);
        lastError = e;
    }

    // 1. Try Laozhang (Fallback 1) - OpenAI Compatible Format
    try {
        const laozhangKey = getLaozhangKey();
        if (laozhangKey) {
            console.log(`[GeminiService] Trying Laozhang (Primary) with model: ${model}${_retryCount > 0 ? ` (retry #${_retryCount})` : ''}`);

            // Laozhang supports OpenAI format at /v1/chat/completions
            const url = `https://api.laozhang.ai/v1/chat/completions`;

            // Use the existing converter. Laozhang accepts standard model names like 'gemini-3-flash-preview'
            const openAIBody = convertGoogleToOpenAI(model, googlePayload);
            // Ensure model field is set correctly for Laozhang
            openAIBody.model = model;

            // [FIX] Laozhang Gemini 프록시도 response_format 미지원 확인
            // response_format: json_object 전송 시 응답이 잘리거나 대화체로 반환됨
            // → 시스템 프롬프트로만 JSON 출력 강제 (convertGoogleToOpenAI에서 이미 추가됨)
            if (openAIBody.response_format) {
                delete openAIBody.response_format;
            }

            const response = await monitoredFetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${laozhangKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(openAIBody)
            });

            if (response.ok) {
                const json = await response.json();
                const choice = json.choices?.[0];
                const content = choice?.message?.content || "";
                const toolCalls = choice?.message?.tool_calls;

                // Map OpenAI response back to Google Format
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
            console.warn(`[GeminiService] Laozhang Failed (${response.status}): ${errText}`);
            lastError = new Error(`Laozhang Error: ${response.status} ${errText}`);
        } else {
            console.warn("[GeminiService] No Laozhang Key found, skipping to fallback.");
        }
    } catch (e: any) {
        console.warn("[GeminiService] Laozhang Connection Error:", e);
        lastError = e;
    }

    // 2. Try Kie (Fallback) - OpenAI Compatible Format
    try {
        const kieKey = getKieKey();
        if (!kieKey) {
            if (lastError) throw lastError;
            throw new Error("Both Laozhang and Kie API Keys are missing.");
        }

        logger.info(`[Gemini] Kie 폴백 호출 (model: ${model})`);
        console.log("[GeminiService] Switching to Kie Fallback...");

        // [FIX] Kie는 thinking 전용 모델 없음 → Pro + reasoning_effort: "high"로 매핑
        const isThinkingModel = model.includes('thinking');
        let kieModelSlug = 'gemini-3.1-flash';
        if (model.includes('pro')) kieModelSlug = 'gemini-3.1-pro';
        else if (model.includes('flash')) kieModelSlug = 'gemini-3.1-flash';

        const url = `https://api.kie.ai/${kieModelSlug}/v1/chat/completions`;
        const openAIBody = convertGoogleToOpenAI(model, googlePayload);
        openAIBody.model = kieModelSlug;

        // [PERF] Kie 전용 파라미터 추가 (Laozhang에는 미지원이므로 여기서만 설정)
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

        const response = await monitoredFetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kieKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(openAIBody)
        });

        if (response.ok) {
            const json = await response.json();
            const choice = json.choices?.[0];
            const content = choice?.message?.content || "";
            const toolCalls = choice?.message?.tool_calls;

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
            console.warn(`[GeminiService] All proxies failed. Retrying in 2s... (attempt ${_retryCount + 1})`);
            await new Promise(r => setTimeout(r, 2000));
            return requestGeminiProxy(model, googlePayload, _retryCount + 1);
        }
        console.error("[GeminiService] All Proxies Failed after retry.", e);
        throw new Error(`All proxies failed. Last error: ${(lastError || e)?.message || 'Unknown'}`);
    }
};

// --- NATIVE v1beta REQUEST FUNCTION ---
// Calls Google Native v1beta endpoint directly (NO OpenAI conversion)
// Preserves thinkingConfig, responseMimeType, safetySettings natively
export const requestGeminiNative = async (model: string, googlePayload: any, _retryCount: number = 0): Promise<any> => {
    let lastError: any = null;

    // 0. Try Evolink v1beta (Priority 0)
    try {
        const evolinkKey = getEvolinkKey();
        if (evolinkKey) {
            console.log(`[GeminiNative] Trying Evolink v1beta (Priority 0) with model: ${model}${_retryCount > 0 ? ` (retry #${_retryCount})` : ''}`);
            const data = await requestEvolinkNative(model, googlePayload);
            return data;
        }
    } catch (e: any) {
        console.warn("[GeminiNative] Evolink v1beta Error:", e.message);
        lastError = e;
    }

    // 1. Try Laozhang v1beta (Fallback 1)
    try {
        const laozhangKey = getLaozhangKey();
        if (laozhangKey) {
            console.log(`[GeminiNative] Trying Laozhang v1beta with model: ${model}${_retryCount > 0 ? ` (retry #${_retryCount})` : ''}`);

            const url = `https://api.laozhang.ai/v1beta/models/${model}:generateContent`;

            const response = await monitoredFetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${laozhangKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(googlePayload)
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`[GeminiNative] Laozhang v1beta Success`);
                return data;
            }

            const errText = await response.text();
            console.warn(`[GeminiNative] Laozhang v1beta Failed (${response.status}): ${errText}`);
            lastError = new Error(`Laozhang v1beta Error: ${response.status} ${errText}`);
        } else {
            console.warn("[GeminiNative] No Laozhang Key found, skipping to fallback.");
        }
    } catch (e: any) {
        console.warn("[GeminiNative] Laozhang v1beta Connection Error:", e);
        lastError = e;
    }

    // 2. Try Kie v1beta (Fallback)
    try {
        const kieKey = getKieKey();
        if (!kieKey) {
            if (lastError) throw lastError;
            throw new Error("Both Laozhang and Kie API Keys are missing.");
        }

        console.log("[GeminiNative] Switching to Kie v1beta Fallback...");

        const url = `https://api.kie.ai/v1beta/models/${model}:generateContent`;

        const response = await monitoredFetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kieKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(googlePayload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[GeminiNative] Kie v1beta Success`);
            return data;
        }

        const errText = await response.text();
        throw new Error(`Kie v1beta Error (${response.status}): ${errText}`);

    } catch (e: any) {
        // 1회 자동 재시도 (2초 대기)
        if (_retryCount < 1) {
            console.warn(`[GeminiNative] All v1beta proxies failed. Retrying in 2s... (attempt ${_retryCount + 1})`);
            await new Promise(r => setTimeout(r, 2000));
            return requestGeminiNative(model, googlePayload, _retryCount + 1);
        }
        console.error("[GeminiNative] All v1beta Proxies Failed after retry.", e);
        throw new Error(`All v1beta proxies failed. Last error: ${(lastError || e)?.message || 'Unknown'}`);
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
    } catch { /* fallback */ }

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
    } catch { /* fallback */ }

    return {
        rate: PRICING.EXCHANGE_RATE,
        date: `${timeStr}\n고정 환율 (Fallback)`
    };
};

export const validateGeminiConnection = async () => {
    try {
        await requestGeminiProxy('gemini-3.1-pro-preview', {
            contents: [{ parts: [{ text: "ping" }] }]
        });
        return { success: true, message: "Gemini (Evolink/Proxy) 연결 성공!" };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
};
