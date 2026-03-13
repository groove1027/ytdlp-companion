
import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';
import { EvolinkImageModel } from '../types';
import { useCostStore } from '../stores/costStore';
import { PRICING } from '../constants';

// === CONFIGURATION ===
const EVOLINK_BASE_URL = 'https://api.evolink.ai/v1';
const EVOLINK_V1BETA_URL = 'https://api.evolink.ai/v1beta';
const DEFAULT_EVOLINK_KEY = '';

// === KEY MANAGEMENT ===

/** localStorage에서 Evolink API 키 조회, fallback 사용 */
export const getEvolinkKey = (): string => {
    const raw = localStorage.getItem('CUSTOM_EVOLINK_KEY') || DEFAULT_EVOLINK_KEY;
    if (!raw) return '';
    // ASCII printable만 유지 (sanitize)
    return raw.replace(/[^\x21-\x7E]/g, '').trim();
};

// === TYPES ===

export interface EvolinkChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | EvolinkContentPart[];
}

export interface EvolinkContentPart {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
}

export interface EvolinkChatOptions {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    responseFormat?: { type: string; json_schema?: Record<string, unknown> };
    signal?: AbortSignal;
    /** monitoredFetch 타임아웃 (ms). 미지정 시 무제한, 긴 대본 처리 시 명시적으로 설정 */
    timeoutMs?: number;
}

export interface EvolinkChatResponse {
    id: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface EvolinkImageResponse {
    created: number;
    data: {
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
    }[];
}

/** Evolink 비동기 태스크 응답 (이미지/비디오 공용) — 공식 문서 기반 */
export interface EvolinkTaskResponse {
    created: number;
    id: string;
    model: string;
    object?: string; // e.g. 'image.generation.task'
    progress?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    task_info?: { can_cancel: boolean; estimated_time?: number };
    type?: string; // 'image' | 'video' | 'audio' | 'text'
    usage?: { billing_rule: string; credits_reserved: number; user_group: string };
}

/** Evolink 태스크 상세 응답 (폴링 결과) */
export interface EvolinkTaskDetail {
    created: number;
    id: string;
    model: string;
    object: string;
    progress: number;
    results: string[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    task_info: { can_cancel: boolean };
    type: string;
    error?: string;
    error_message?: string;
}

// === HELPER: Evolink 에러 핸들링 ===
function handleEvolinkError(status: number, errorDetail: string): never {
    if (status === 401) throw new Error('Evolink 인증 실패: API 키를 확인해주세요.');
    if (status === 402) throw new Error('Evolink 잔액 부족: 크레딧을 충전해주세요.');
    if (status === 429) throw new Error('Evolink 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    if (status === 400) throw new Error(`Evolink 요청 오류 (콘텐츠 정책 위반 가능): ${errorDetail}`);
    throw new Error(`Evolink 오류 (${status}): ${errorDetail}`);
}

// === HELPER: 429 Rate Limit 재시도 (지수 백오프 + 지터) ===
/**
 * monitoredFetch 래퍼 — HTTP 429 응답 시 지수 백오프로 최대 3회 재시도
 * 태스크 생성(이미지/비디오) + 채팅 완성 호출 모두에 사용
 * @param maxRetries 최대 재시도 횟수 (기본 3)
 * @param baseDelayMs 첫 재시도 대기 시간 (기본 2000ms, 이후 2배씩 증가)
 * @param timeoutMs monitoredFetch 타임아웃 (optional)
 */
export async function fetchWithRateLimitRetry(
    url: string,
    init: RequestInit,
    maxRetries: number = 3,
    baseDelayMs: number = 2000,
    timeoutMs?: number
): Promise<Response> {
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await monitoredFetch(url, init, timeoutMs);

        if (response.status !== 429 || attempt === maxRetries) {
            return response;
        }

        // 429 — 지수 백오프 + 랜덤 지터 대기 후 재시도 (thundering herd 방지)
        lastResponse = response;
        const jitter = Math.random() * 1500; // 0~1.5초 랜덤 지터
        const delayMs = baseDelayMs * Math.pow(2, attempt) + jitter; // 3s+j, 6s+j, 12s+j
        logger.warn(`[Evolink] 429 Rate Limit — ${Math.round(delayMs)}ms 후 재시도 (${attempt + 1}/${maxRetries})`, { url });
        logger.trackErrorChain(`HTTP 429 Rate Limit (attempt ${attempt + 1}/${maxRetries})`, 'evolinkService:fetchWithRateLimitRetry:rate_limit');
        await new Promise(r => setTimeout(r, delayMs));
    }

    // 도달하지 않는 코드이나 TypeScript 타입 안전성을 위해
    return lastResponse!;
}

async function parseEvolinkError(response: Response): Promise<string> {
    const errorText = await response.text();
    try {
        const errorJson = JSON.parse(errorText);
        return errorJson.error?.message || errorJson.message || errorText;
    } catch (e) {
        logger.trackSwallowedError('evolinkService:parseError', e);
        return errorText;
    }
}

// === CHAT COMPLETION (OpenAI Compatible) ===

/**
 * Evolink AI 채팅 완성 — Gemini 3.1 Pro Preview 모델 사용
 * OpenAI-compatible 형식
 */
export const evolinkChat = async (
    messages: EvolinkChatMessage[],
    options: EvolinkChatOptions = {}
): Promise<EvolinkChatResponse> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) {
        throw new Error('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
    }

    const {
        temperature = 0.7,
        maxTokens = 4096,
        stream = false,
        responseFormat,
        signal,
        timeoutMs
    } = options;

    const body: Record<string, unknown> = {
        model: 'gemini-3.1-pro-preview',
        messages,
        temperature,
        max_tokens: maxTokens,
        stream
    };

    // response_format은 지정 시에만 포함
    if (responseFormat) {
        body.response_format = responseFormat;
    }

    logger.info('[Evolink] Chat completion 요청', { model: body.model, messageCount: messages.length, timeoutMs });

    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    };
    if (signal) fetchOptions.signal = signal;

    // [FIX #32] 긴 대본 처리를 위한 확장 타임아웃 지원 (미지정 시 무제한)
    // [FIX #209] 429 rate limit 시 지수 백오프 재시도 (채널 DNA 분석 병렬 호출 대비)
    const response = await fetchWithRateLimitRetry(`${EVOLINK_BASE_URL}/chat/completions`, fetchOptions, 3, 3000, timeoutMs);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        handleEvolinkError(response.status, errorDetail);
    }

    const data: EvolinkChatResponse = await response.json();

    // Auto-track Gemini 3.1 Pro token-based cost
    try {
        const usage = data.usage;
        if (usage) {
            const inputCost = (usage.prompt_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
            const outputCost = (usage.completion_tokens || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
            const totalCost = inputCost + outputCost;
            if (totalCost > 0) {
                useCostStore.getState().addCost(totalCost, 'analysis');
                logger.info('[Evolink] 비용 자동 추적', {
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens,
                    costUsd: totalCost.toFixed(6)
                });
            }
        }
    } catch (e) { logger.trackSwallowedError('EvolinkService:evolinkChat/costTracking', e); }

    logger.success('[Evolink] Chat completion 성공', {
        tokens: data.usage?.total_tokens,
        finishReason: data.choices?.[0]?.finish_reason
    });

    return data;
};

/**
 * Evolink AI 스트리밍 채팅 — 실시간 텍스트 출력
 * SSE (Server-Sent Events) 형식으로 응답을 청크 단위로 수신
 */
export const evolinkChatStream = async (
    messages: EvolinkChatMessage[],
    onChunk: (text: string, accumulated: string) => void,
    options: EvolinkChatOptions = {}
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const {
        temperature = 0.7,
        maxTokens = 4096,
        responseFormat,
        timeoutMs,
        signal,
    } = options;

    const body: Record<string, unknown> = {
        model: 'gemini-3.1-pro-preview',
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
    };

    // response_format을 전달하여 JSON 출력 강제
    if (responseFormat) {
        body.response_format = responseFormat;
    }

    logger.info('[Evolink] Stream 요청 시작', {
        model: body.model,
        messageCount: messages.length,
        maxTokens,
        endpoint: `${EVOLINK_BASE_URL}/chat/completions`,
        apiKeyPrefix: apiKey.slice(0, 8) + '...',
    });

    // [FIX #178] 타임아웃 적용 — 프록시 연결 끊김(~125초) 전에 능동적으로 중단
    // [FIX #226] 429 Rate Limit 재시도 추가 — 스트리밍에도 fetchWithRateLimitRetry 적용
    const response = await fetchWithRateLimitRetry(`${EVOLINK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    }, 3, 3000, timeoutMs);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        handleEvolinkError(response.status, errorDetail);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    // [FIX #193] 스트리밍 유휴 타임아웃 — 30초 무응답 시 연결 중단
    const STREAM_IDLE_MS = 30_000;

    while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => {
                    reader.cancel().catch(() => {});
                    reject(new Error('스트리밍 30초 무응답 — 연결 중단'));
                }, STREAM_IDLE_MS);
            })
        ]).finally(() => { if (idleTimer) clearTimeout(idleTimer); });
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 형식 파싱: "data: {...}\n\n"
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 마지막 불완전 라인 보존

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                    accumulated += delta;
                    onChunk(delta, accumulated);
                }
            } catch (e) {
                logger.trackSwallowedError('evolinkService:streamChunkDelta', e);
                // 파싱 실패 무시 (불완전 청크)
            }
        }
    }

    // Auto-track estimated cost for streaming (SSE doesn't return usage)
    try {
        // Estimate: ~4 chars per token for mixed Korean/English content
        const estimatedInputTokens = messages.reduce((sum, m) => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return sum + Math.ceil(content.length / 4);
        }, 0);
        const estimatedOutputTokens = Math.ceil(accumulated.length / 4);
        const inputCost = estimatedInputTokens / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
        const outputCost = estimatedOutputTokens / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
        const totalCost = inputCost + outputCost;
        if (totalCost > 0) {
            useCostStore.getState().addCost(totalCost, 'analysis');
            logger.info('[Evolink] 스트리밍 비용 추정', {
                estInputTokens: estimatedInputTokens,
                estOutputTokens: estimatedOutputTokens,
                costUsd: totalCost.toFixed(6)
            });
        }
    } catch (e) { logger.trackSwallowedError('EvolinkService:evolinkChatStream/costTracking', e); }

    logger.success('[Evolink] 스트리밍 완료', { totalLength: accumulated.length });
    return accumulated;
};

// === GOOGLE NATIVE v1beta REQUEST ===

/**
 * 기존 모델명 → Evolink의 gemini-3.1-pro-preview로 매핑
 * 모든 Gemini 모델(pro, flash, thinking 등)을 단일 모델로 통일
 */
export const mapModelToEvolinkNative = (model: string): string => {
    // Evolink는 gemini-3.1-pro-preview 단일 모델만 지원
    return 'gemini-3.1-pro-preview';
};

/**
 * Evolink Google Native v1beta 포맷으로 직접 요청
 * requestGeminiNative()와 동일한 Google Payload 포맷 사용
 * 기술 문서 기준: contents + generationConfig(temperature, maxOutputTokens, topP, topK)만 지원
 * systemInstruction 미지원 → user 메시지에 합침 처리
 */
export const requestEvolinkNative = async (
    model: string,
    googlePayload: Record<string, unknown>,
    method: string = 'generateContent',
    timeoutMs?: number
): Promise<Record<string, unknown>> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const evolinkModel = mapModelToEvolinkNative(model);
    const url = `${EVOLINK_V1BETA_URL}/models/${evolinkModel}:${method}`;

    logger.info(`[Evolink Native] v1beta 요청: ${evolinkModel}:${method}`, { originalModel: model, timeoutMs });

    // [FIX] Evolink v1beta는 systemInstruction을 처리하지 못함 (400: "valid role: user, model")
    // → systemInstruction 텍스트를 contents 첫 번째 user 메시지에 합침
    let payload = googlePayload;
    if (googlePayload.systemInstruction) {
        payload = { ...googlePayload };
        const sysInst = payload.systemInstruction as { parts?: { text?: string }[] };
        const sysText = sysInst?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
        delete payload.systemInstruction;

        if (sysText && Array.isArray(payload.contents)) {
            const contents = (payload.contents as { role?: string; parts: { text?: string }[] }[]).map(c => ({ ...c, parts: [...c.parts] }));
            const firstUser = contents.find(c => c.role === 'user' || !c.role);
            if (firstUser && firstUser.parts.length > 0 && firstUser.parts[0].text != null) {
                firstUser.parts[0] = { ...firstUser.parts[0], text: sysText + '\n\n' + firstUser.parts[0].text };
            } else {
                contents.unshift({ role: 'user', parts: [{ text: sysText }] });
            }
            payload.contents = contents;
        }
    }

    // [FIX #32] 긴 대본 처리를 위한 확장 타임아웃 지원 (미지정 시 무제한)
    // [FIX #209/#245] 429 rate limit 시 1회 재시도 후 빠르게 폴백 (Smart Routing이 Kie로 전환)
    const response = await fetchWithRateLimitRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }, 1, 3000, timeoutMs);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        logger.error(`[Evolink Native] v1beta 실패 (${response.status})`, { error: errorDetail });
        throw new Error(`Evolink v1beta Error (${response.status}): ${errorDetail}`);
    }

    const data = await response.json();

    // Auto-track cost from Google-format usageMetadata
    try {
        const usage = data.usageMetadata;
        if (usage) {
            const inputCost = (usage.promptTokenCount || 0) / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
            const outputCost = (usage.candidatesTokenCount || 0) / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
            const totalCost = inputCost + outputCost;
            if (totalCost > 0) {
                useCostStore.getState().addCost(totalCost, 'analysis');
                logger.info('[Evolink Native] 비용 자동 추적', {
                    promptTokens: usage.promptTokenCount,
                    completionTokens: usage.candidatesTokenCount,
                    costUsd: totalCost.toFixed(6)
                });
            }
        }
    } catch (e) { logger.trackSwallowedError('EvolinkService:requestEvolinkNative/costTracking', e); }

    logger.success(`[Evolink Native] v1beta 성공`);
    return data;
};

// === NATIVE v1beta STREAMING (Google Search 그라운딩 지원) ===

/**
 * Evolink v1beta 네이티브 스트리밍 — Google Search 그라운딩 지원
 * 대본 생성 등 최신 정보가 필요한 텍스트 생성에 사용
 * OpenAI-compatible 대신 v1beta를 쓰면 tools: [{ googleSearch: {} }] 활성화 가능
 */
export const evolinkNativeStream = async (
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string, accumulated: string) => void,
    options: { temperature?: number; maxOutputTokens?: number; enableWebSearch?: boolean; signal?: AbortSignal; onFinish?: (reason: string) => void } = {}
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const { temperature = 0.7, maxOutputTokens = 16000, enableWebSearch = false, signal, onFinish } = options;

    // [FIX] Evolink v1beta는 systemInstruction 미지원 (400: "valid role: user, model")
    // → systemPrompt를 user 메시지에 합침 (requestEvolinkNative와 동일 처리)
    const payload: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
        generationConfig: { temperature, maxOutputTokens },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    };

    // [FIX #42] Google Search 그라운딩: 최신 기사/뉴스 참조 가능
    if (enableWebSearch) {
        payload.tools = [{ googleSearch: {} }];
    }

    const model = 'gemini-3.1-pro-preview';
    const url = `${EVOLINK_V1BETA_URL}/models/${model}:streamGenerateContent?alt=sse`;

    logger.info('[Evolink Native Stream] 시작', { enableWebSearch, maxOutputTokens });

    const fetchInit: RequestInit = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    };
    if (signal) fetchInit.signal = signal;

    // [FIX #226] 429 Rate Limit 재시도 추가 — 네이티브 스트리밍에도 적용
    const response = await fetchWithRateLimitRetry(url, fetchInit, 3, 3000);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        logger.error(`[Evolink Native Stream] 실패 (${response.status})`, { error: errorDetail });
        throw new Error(`Evolink v1beta 스트리밍 오류 (${response.status}): ${errorDetail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';
    let lastFinishReason = '';

    // [FIX #226] 네이티브 스트리밍 유휴 타임아웃 — 60초 무응답 시 연결 중단
    const NATIVE_STREAM_IDLE_MS = 60_000;

    while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => {
                    reader.cancel().catch(() => {});
                    reject(new Error('네이티브 스트리밍 60초 무응답 — 연결 중단'));
                }, NATIVE_STREAM_IDLE_MS);
            })
        ]).finally(() => { if (idleTimer) clearTimeout(idleTimer); });
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const json = JSON.parse(trimmed.slice(6));
                const candidate = json.candidates?.[0];
                const parts = candidate?.content?.parts;
                if (parts) {
                    for (const part of parts) {
                        if (part.text) {
                            accumulated += part.text;
                            onChunk(part.text, accumulated);
                        }
                    }
                }
                if (candidate?.finishReason) {
                    lastFinishReason = candidate.finishReason;
                }
            } catch (e) {
                logger.trackSwallowedError('evolinkService:streamChunkCandidate', e);
                // 불완전 청크 무시
            }
        }
    }

    // finishReason 콜백 (MAX_TOKENS 등 잘림 감지용)
    if (onFinish) onFinish(lastFinishReason);

    // 비용 추정
    try {
        const estInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
        const estOutputTokens = Math.ceil(accumulated.length / 4);
        const inputCost = estInputTokens / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
        const outputCost = estOutputTokens / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
        const totalCost = inputCost + outputCost;
        if (totalCost > 0) {
            useCostStore.getState().addCost(totalCost, 'analysis');
            logger.info('[Evolink Native Stream] 비용 추정', { estInputTokens, estOutputTokens, costUsd: totalCost.toFixed(6) });
        }
    } catch (e) { logger.trackSwallowedError('EvolinkService:evolinkNativeStream/costTracking', e); }

    logger.success('[Evolink Native Stream] 완료', { totalLength: accumulated.length, finishReason: lastFinishReason, webSearch: enableWebSearch });
    return accumulated;
};

// === VIDEO ANALYSIS (Gemini v1beta — fileData) ===

/**
 * Evolink v1beta 네이티브 비디오 분석 (스트리밍)
 * Gemini 3.1 Pro가 영상을 1fps 단위로 직접 분석
 * YouTube URL 또는 Cloudinary URL을 fileData로 전달
 */
export const evolinkVideoAnalysisStream = async (
    videoUri: string | string[],
    mimeType: string | string[],
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string, accumulated: string) => void,
    options: { temperature?: number; maxOutputTokens?: number; signal?: AbortSignal } = {}
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const { temperature = 0.5, maxOutputTokens = 40000, signal } = options;

    // [FIX #189] 다중 영상 지원 — 단일/배열 모두 처리
    const videoUris = Array.isArray(videoUri) ? videoUri : [videoUri];
    const mimeTypes = Array.isArray(mimeType) ? mimeType : [mimeType];
    const fileParts = videoUris.map((uri, i) => ({
        fileData: { mimeType: mimeTypes[i] || mimeTypes[0], fileUri: uri },
    }));

    // [FIX] Evolink v1beta는 systemInstruction 미지원 (400: "valid role: user, model")
    // → systemPrompt를 user 메시지에 합침 (requestEvolinkNative와 동일 처리)
    const payload = {
        contents: [{
            role: 'user',
            parts: [
                ...fileParts,
                { text: systemPrompt + '\n\n' + userPrompt },
            ],
        }],
        generationConfig: { temperature, maxOutputTokens },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    };

    const model = 'gemini-3.1-pro-preview';
    const url = `${EVOLINK_V1BETA_URL}/models/${model}:streamGenerateContent?alt=sse`;

    logger.info('[Evolink Video] v1beta 비디오 분석 스트리밍 시작', { videoCount: videoUris.length, videoUri: videoUris[0].slice(0, 80), mimeType: mimeTypes[0] });

    // [FIX #226] 429 Rate Limit 재시도 추가 — 비디오 분석 스트리밍에도 적용
    const response = await fetchWithRateLimitRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
    }, 3, 3000);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        logger.error(`[Evolink Video] v1beta 실패 (${response.status})`, { error: errorDetail });
        throw new Error(`Evolink v1beta 비디오 분석 오류 (${response.status}): ${errorDetail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    // [FIX #226] 비디오 분석 스트리밍 유휴 타임아웃 — 90초 무응답 시 중단 (영상 처리는 더 오래 걸릴 수 있음)
    const VIDEO_STREAM_IDLE_MS = 90_000;

    while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => {
                    reader.cancel().catch(() => {});
                    reject(new Error('비디오 분석 스트리밍 90초 무응답 — 연결 중단'));
                }, VIDEO_STREAM_IDLE_MS);
            })
        ]).finally(() => { if (idleTimer) clearTimeout(idleTimer); });
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const json = JSON.parse(trimmed.slice(6));
                const parts = json.candidates?.[0]?.content?.parts;
                if (parts) {
                    for (const part of parts) {
                        if (part.text) {
                            accumulated += part.text;
                            onChunk(part.text, accumulated);
                        }
                    }
                }
            } catch (e) {
                logger.trackSwallowedError('evolinkService:streamChunkVideo', e);
                // 불완전 청크 무시
            }
        }
    }

    // 비용 추정 (video stream)
    try {
        const estInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4) + 5000 * videoUris.length; // 영상 토큰 추정
        const estOutputTokens = Math.ceil(accumulated.length / 4);
        const inputCost = estInputTokens / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
        const outputCost = estOutputTokens / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
        const totalCost = inputCost + outputCost;
        if (totalCost > 0) {
            useCostStore.getState().addCost(totalCost, 'analysis');
            logger.info('[Evolink Video] 비용 추정', { estInputTokens, estOutputTokens, costUsd: totalCost.toFixed(6) });
        }
    } catch (e) { logger.trackSwallowedError('EvolinkService:evolinkVideoAnalysisStream/costTracking', e); }

    logger.success('[Evolink Video] 비디오 분석 스트리밍 완료', { totalLength: accumulated.length });
    return accumulated;
};

/**
 * Evolink v1beta 프레임 기반 멀티모달 분석 (스트리밍)
 * base64 이미지 프레임을 inlineData로 직접 전송 — OpenAI 호환 image_url 400 에러 우회
 */
export const evolinkFrameAnalysisStream = async (
    frames: { base64: string; mimeType: string; label: string }[],
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string, accumulated: string) => void,
    options: { temperature?: number; maxOutputTokens?: number; signal?: AbortSignal } = {}
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const { temperature = 0.5, maxOutputTokens = 40000, signal } = options;

    // 프레임을 inlineData parts로 변환
    const frameParts = frames.flatMap(f => [
        { text: f.label },
        { inlineData: { mimeType: f.mimeType, data: f.base64 } },
    ]);

    const payload = {
        contents: [{
            role: 'user',
            parts: [
                { text: `${systemPrompt}\n\n${userPrompt}` },
                ...frameParts,
            ],
        }],
        generationConfig: { temperature, maxOutputTokens },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    };

    const model = 'gemini-3.1-pro-preview';
    const url = `${EVOLINK_V1BETA_URL}/models/${model}:streamGenerateContent?alt=sse`;

    logger.info('[Evolink Frames] v1beta 프레임 분석 스트리밍 시작', { frameCount: frames.length });

    // [FIX #226] 429 Rate Limit 재시도 추가 — 프레임 분석 스트리밍에도 적용
    const response = await fetchWithRateLimitRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
    }, 3, 3000);

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        logger.error(`[Evolink Frames] v1beta 실패 (${response.status})`, { error: errorDetail });
        throw new Error(`Evolink v1beta 프레임 분석 오류 (${response.status}): ${errorDetail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    // [FIX #226] 프레임 분석 스트리밍 유휴 타임아웃 — 60초 무응답 시 중단
    const FRAME_STREAM_IDLE_MS = 60_000;

    while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const { done, value } = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => {
                    reader.cancel().catch(() => {});
                    reject(new Error('프레임 분석 스트리밍 60초 무응답 — 연결 중단'));
                }, FRAME_STREAM_IDLE_MS);
            })
        ]).finally(() => { if (idleTimer) clearTimeout(idleTimer); });
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const json = JSON.parse(trimmed.slice(6));
                const parts = json.candidates?.[0]?.content?.parts;
                if (parts) {
                    for (const part of parts) {
                        if (part.text) {
                            accumulated += part.text;
                            onChunk(part.text, accumulated);
                        }
                    }
                }
            } catch (e) {
                logger.trackSwallowedError('evolinkService:streamChunkFrames', e);
                // 불완전 청크 무시
            }
        }
    }

    logger.success('[Evolink Frames] 프레임 분석 스트리밍 완료', { totalLength: accumulated.length });
    return accumulated;
};

// === IMAGE GENERATION (Nanobanana 2 — Async Task-based) ===

/**
 * Evolink Nanobanana 2 이미지 생성 태스크 생성
 * 비동기: 태스크 ID 반환 → pollEvolinkTask()로 결과 확인
 */
export const createEvolinkImageTask = async (
    prompt: string,
    aspectRatio: string = '16:9',
    quality: string = '2K',
    imageUrls?: string[],
    enableWebSearch?: boolean
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');
    if (!prompt || prompt.trim().length === 0) throw new Error('이미지 생성 프롬프트가 비어있습니다.');

    const body: Record<string, unknown> = {
        model: 'gemini-3.1-flash-image-preview',
        prompt,
        size: aspectRatio,
        quality,
    };

    if (imageUrls && imageUrls.length > 0) {
        body.image_urls = imageUrls;
    }

    // [FIX] Evolink 기술 문서: web_search는 model_params 안에 위치해야 함
    if (enableWebSearch) {
        body.model_params = { web_search: true };
    }

    logger.info('[Evolink] Nanobanana 2 이미지 태스크 생성', { aspectRatio, quality, hasRefImages: !!imageUrls });

    // [FIX #129] 429 Rate Limit 시 지수 백오프 재시도 (2s→4s→8s, 최대 3회)
    const response = await fetchWithRateLimitRetry(`${EVOLINK_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        handleEvolinkError(response.status, errorDetail);
    }

    const data: EvolinkTaskResponse = await response.json();
    if (!data.id) throw new Error('Evolink 이미지 태스크 ID를 받지 못했습니다.');

    logger.info('[Evolink] 이미지 태스크 생성됨', { taskId: data.id, status: data.status });
    return data.id;
};

/**
 * Evolink 비동기 태스크 폴링 (이미지/비디오 공용)
 * GET /v1/tasks/{task_id}
 * @param maxTimeoutMs 절대 시간 제한 (기본 5분 = 300,000ms). maxAttempts와 별개로 초과 시 종료
 * @returns 완료 시 결과 URL 반환
 */
export const pollEvolinkTask = async (
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
    maxAttempts: number = 120,
    intervalMs: number = 3000,
    maxTimeoutMs: number = 300_000
): Promise<string> => {
    const opId = `pollEvolinkTask-${taskId}`;
    logger.startAsyncOp(opId, 'pollEvolinkTask', taskId);
    const apiKey = getEvolinkKey();
    if (!apiKey) {
        logger.endAsyncOp(opId, 'failed', 'Evolink API 키 없음');
        throw new Error('Evolink API 키가 설정되지 않았습니다.');
    }

    const url = `${EVOLINK_BASE_URL}/tasks/${taskId}`;
    const startTime = Date.now();

    try {
    for (let i = 0; i < maxAttempts; i++) {
        if (signal?.aborted) throw new Error('Cancelled by user');

        // MEDIUM 1: 절대 시간 제한 — maxAttempts와 별개로 wall-clock timeout 적용
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxTimeoutMs) {
            logger.error(`[Evolink] 태스크 절대 시간 초과: ${taskId}`, {
                elapsedMs: elapsed, maxTimeoutMs, attempts: i
            });
            logger.endAsyncOp(opId, 'failed', `절대 시간 초과: ${Math.round(elapsed / 1000)}초`);
            throw new Error(`Evolink 태스크 시간 초과 (${taskId}): ${Math.round(elapsed / 1000)}초 경과`);
        }

        await new Promise(r => setTimeout(r, intervalMs));

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });

            if (!response.ok) {
                if (response.status === 404) throw new Error('Evolink 태스크를 찾을 수 없습니다.');
                // [FIX #172] 402 Quota Exhausted — 즉시 중단, 재시도 무의미
                if (response.status === 402) {
                    logger.error(`[Evolink] 폴링 402 잔액 부족 — 즉시 중단`, { taskId, attempt: i + 1 });
                    throw new Error('QUOTA_EXHAUSTED: Evolink 잔액 부족 — 크레딧을 충전해주세요.');
                }
                // [FIX #129] 429 Rate Limit — 추가 5초 대기 후 재시도
                if (response.status === 429) {
                    logger.warn(`[Evolink] 폴링 429 Rate Limit — 5초 추가 대기`, { taskId, attempt: i + 1 });
                    await new Promise(r => setTimeout(r, 5000));
                }
                // MEDIUM 2: 일시적 오류 시 상태 코드와 응답 본문을 로깅
                const errorDetail = await parseEvolinkError(response);
                logger.trackRetry('Evolink 폴링', i + 1, maxAttempts, `HTTP ${response.status}: ${errorDetail}`);
                continue;
            }

            const data: EvolinkTaskDetail = await response.json();

            if (typeof data.progress === 'number' && onProgress) {
                onProgress(data.progress);
            }

            if (data.status === 'completed') {
                if (onProgress) onProgress(100);

                if (data.results && data.results.length > 0) {
                    logger.success(`[Evolink] 태스크 완료: ${taskId}`, { resultCount: data.results.length });
                    logger.endAsyncOp(opId, 'completed', data.results[0]);
                    return data.results[0];
                }
                throw new Error('Evolink 태스크 완료되었으나 결과 URL이 없습니다.');
            }

            // MEDIUM 3: failed 상태를 API 응답의 에러 메시지와 함께 명확히 처리
            if (data.status === 'failed') {
                const failReason = data.error_message || data.error || '알 수 없는 오류';
                logger.error(`[Evolink] 태스크 실패: ${taskId}`, { reason: failReason, progress: data.progress });
                throw new Error(`Evolink 태스크 실패 (${taskId}): ${failReason}`);
            }

            // pending/processing → 계속 폴링
        } catch (e: unknown) {
            if (e instanceof Error) {
                if (e.name === 'AbortError' || e.message === 'Cancelled by user') throw e;
                if (e.message.includes('태스크 실패') || e.message.includes('찾을 수 없습니다')) throw e;
                if (e.message.includes('시간 초과') || e.message.includes('완료되었으나')) throw e;
                // [FIX #172] 잔액 부족은 재시도 무의미 — 즉시 상위로 전파
                if (e.message.includes('QUOTA_EXHAUSTED') || e.message.includes('잔액 부족')) throw e;
            }
            // MEDIUM 2: 네트워크 오류 등도 로깅 후 재시도
            const errMsg = e instanceof Error ? e.message : String(e);
            logger.trackErrorChain(errMsg, 'evolinkService:pollEvolinkTask:network_retry');
            logger.trackRetry('Evolink 폴링 (네트워크)', i + 1, maxAttempts, errMsg);
        }
    }

    logger.endAsyncOp(opId, 'failed', `${maxAttempts}회 폴링 초과`);
    throw new Error(`Evolink 태스크 시간 초과 (${taskId}): ${maxAttempts}회 폴링 초과`);
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // 시간 초과 / 절대 시간 초과는 이미 endAsyncOp 호출됨
        if (!errMsg.includes('시간 초과') && !errMsg.includes('폴링 초과')) {
            logger.endAsyncOp(opId, 'failed', errMsg);
        }
        throw err;
    }
};

/**
 * Evolink Nanobanana 2 이미지 생성 (동기식 래퍼)
 * 태스크 생성 + 폴링을 한 함수로 래핑 → 호출자는 await로 URL 반환 대기
 */
export const evolinkGenerateImage = async (
    prompt: string,
    aspectRatio: string = '16:9',
    quality: string = '2K',
    imageUrls?: string[],
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
    enableWebSearch?: boolean
): Promise<string> => {
    const taskId = await createEvolinkImageTask(prompt, aspectRatio, quality, imageUrls, enableWebSearch);
    const resultUrl = await pollEvolinkTask(taskId, signal, onProgress, 120, 3000);
    return resultUrl;
};

// === VIDEO GENERATION (Veo 3.1 Fast — Async Task-based) ===

/**
 * Evolink Veo 3.1 Fast 비디오 생성 태스크 생성
 * @returns 태스크 ID
 */
export const createEvolinkVideoTask = async (
    prompt: string,
    imageUrls?: string[],
    generationType: 'TEXT' | 'FIRST&LAST' | 'REFERENCE' = 'FIRST&LAST',
    aspectRatio: '16:9' | '9:16' = '16:9',
    duration: 4 | 6 | 8 = 8,
    quality: '720p' | '1080p' | '4k' = '1080p',
    generateAudio: boolean = true
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const body: Record<string, unknown> = {
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        generation_type: generationType,
        aspect_ratio: aspectRatio,
        duration,
        quality,
        generate_audio: generateAudio,
        n: 1
    };

    if (imageUrls && imageUrls.length > 0) {
        body.image_urls = imageUrls;
    }

    logger.info('[Evolink] Veo 3.1 Fast 비디오 태스크 생성', {
        generationType, aspectRatio, duration, quality, hasImages: !!imageUrls
    });

    // [FIX #129] 429 Rate Limit 시 지수 백오프 재시도 (2s→4s→8s, 최대 3회)
    const response = await fetchWithRateLimitRetry(`${EVOLINK_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        handleEvolinkError(response.status, errorDetail);
    }

    const data: EvolinkTaskResponse = await response.json();
    if (!data.id) throw new Error('Evolink 비디오 태스크 ID를 받지 못했습니다.');

    logger.info('[Evolink] 비디오 태스크 생성됨', { taskId: data.id, status: data.status });
    return data.id;
};

// === UTILITY ===

/**
 * Evolink API 연결 테스트
 */
export const validateEvolinkConnection = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    if (!apiKey) {
        return { success: false, message: 'API 키가 입력되지 않았습니다.' };
    }

    try {
        const response = await monitoredFetch(`${EVOLINK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gemini-3.1-pro-preview',
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            })
        });

        if (response.status === 401 || response.status === 403) {
            return { success: false, message: '인증 실패: API 키를 확인해주세요.' };
        }
        if (response.ok) {
            return { success: true, message: '연결 성공!' };
        }
        return { success: false, message: `서버 응답 오류 (${response.status})` };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, message: `연결 오류: ${msg}` };
    }
};
