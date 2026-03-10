
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

async function parseEvolinkError(response: Response): Promise<string> {
    const errorText = await response.text();
    try {
        const errorJson = JSON.parse(errorText);
        return errorJson.error?.message || errorJson.message || errorText;
    } catch {
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
        signal
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

    logger.info('[Evolink] Chat completion 요청', { model: body.model, messageCount: messages.length });

    const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    };
    if (signal) fetchOptions.signal = signal;

    const response = await monitoredFetch(`${EVOLINK_BASE_URL}/chat/completions`, fetchOptions);

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
    } catch { /* cost tracking should not break API calls */ }

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

    const response = await monitoredFetch(`${EVOLINK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorDetail = await parseEvolinkError(response);
        handleEvolinkError(response.status, errorDetail);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다.');

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
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
            } catch {
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
    } catch { /* cost tracking should not break API calls */ }

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
 * thinkingConfig, responseMimeType, safetySettings 네이티브 지원
 */
export const requestEvolinkNative = async (
    model: string,
    googlePayload: Record<string, unknown>,
    method: string = 'generateContent'
): Promise<Record<string, unknown>> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const evolinkModel = mapModelToEvolinkNative(model);
    const url = `${EVOLINK_V1BETA_URL}/models/${evolinkModel}:${method}`;

    logger.info(`[Evolink Native] v1beta 요청: ${evolinkModel}:${method}`, { originalModel: model });

    const response = await monitoredFetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(googlePayload)
    });

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
    } catch { /* cost tracking should not break API calls */ }

    logger.success(`[Evolink Native] v1beta 성공`);
    return data;
};

// === VIDEO ANALYSIS (Gemini v1beta — fileData) ===

/**
 * Evolink v1beta 네이티브 비디오 분석 (스트리밍)
 * Gemini 3.1 Pro가 영상을 1fps 단위로 직접 분석
 * YouTube URL 또는 Cloudinary URL을 fileData로 전달
 */
export const evolinkVideoAnalysisStream = async (
    videoUri: string,
    mimeType: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string, accumulated: string) => void,
    options: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> => {
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const { temperature = 0.5, maxOutputTokens = 40000 } = options;

    const payload = {
        contents: [{
            role: 'user',
            parts: [
                { fileData: { mimeType, fileUri: videoUri } },
                { text: userPrompt },
            ],
        }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
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

    logger.info('[Evolink Video] v1beta 비디오 분석 스트리밍 시작', { videoUri: videoUri.slice(0, 80), mimeType });

    const response = await monitoredFetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

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

    while (true) {
        const { done, value } = await reader.read();
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
            } catch {
                // 불완전 청크 무시
            }
        }
    }

    // 비용 추정
    try {
        const estInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4) + 5000; // 영상 토큰 추정
        const estOutputTokens = Math.ceil(accumulated.length / 4);
        const inputCost = estInputTokens / 1_000_000 * PRICING.GEMINI_PRO_INPUT_PER_1M;
        const outputCost = estOutputTokens / 1_000_000 * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
        const totalCost = inputCost + outputCost;
        if (totalCost > 0) {
            useCostStore.getState().addCost(totalCost, 'analysis');
            logger.info('[Evolink Video] 비용 추정', { estInputTokens, estOutputTokens, costUsd: totalCost.toFixed(6) });
        }
    } catch { /* cost tracking should not break */ }

    logger.success('[Evolink Video] 비디오 분석 스트리밍 완료', { totalLength: accumulated.length });
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

    // [OFFICIAL DOC] Evolink web_search: 웹 검색으로 실존 인물/장소 정확도 향상
    if (enableWebSearch) {
        body.web_search = true;
    }

    logger.info('[Evolink] Nanobanana 2 이미지 태스크 생성', { aspectRatio, quality, hasRefImages: !!imageUrls });

    const response = await monitoredFetch(`${EVOLINK_BASE_URL}/images/generations`, {
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
    const apiKey = getEvolinkKey();
    if (!apiKey) throw new Error('Evolink API 키가 설정되지 않았습니다.');

    const url = `${EVOLINK_BASE_URL}/tasks/${taskId}`;
    const startTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
        if (signal?.aborted) throw new Error('Cancelled by user');

        // MEDIUM 1: 절대 시간 제한 — maxAttempts와 별개로 wall-clock timeout 적용
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxTimeoutMs) {
            logger.error(`[Evolink] 태스크 절대 시간 초과: ${taskId}`, {
                elapsedMs: elapsed, maxTimeoutMs, attempts: i
            });
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
            }
            // MEDIUM 2: 네트워크 오류 등도 로깅 후 재시도
            const errMsg = e instanceof Error ? e.message : String(e);
            logger.trackRetry('Evolink 폴링 (네트워크)', i + 1, maxAttempts, errMsg);
        }
    }

    throw new Error(`Evolink 태스크 시간 초과 (${taskId}): ${maxAttempts}회 폴링 초과`);
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

    const response = await monitoredFetch(`${EVOLINK_BASE_URL}/videos/generations`, {
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
