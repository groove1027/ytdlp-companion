/**
 * Supertonic 2 — 브라우저 로컬 TTS 서비스
 * Supertone Inc.의 오픈소스 TTS 모델 (ONNX 런타임)
 * HuggingFace CDN에서 온디맨드 로드, Cache API로 영구 캐시
 */

import { logger } from './LoggerService';
// @ts-ignore — vendored JS module
import { loadTextToSpeech, loadVoiceStyle, writeWavFile } from './supertonicHelper.js';

// === CONFIGURATION ===
const HF_BASE_URL = 'https://huggingface.co/Supertone/supertonic-2/resolve/main';
const ONNX_DIR = `${HF_BASE_URL}/onnx`;
const VOICE_STYLE_DIR = `${HF_BASE_URL}/voice_styles`;
const CACHE_NAME = 'supertonic-v2-models';
const TOTAL_STEPS = 8; // diffusion denoising steps (quality vs speed tradeoff)

// === STATE ===
interface SupertonicState {
    tts: ReturnType<typeof loadTextToSpeech> extends Promise<infer T> ? T : never;
    isLoading: boolean;
    loadProgress: { step: string; current: number; total: number } | null;
    styleCache: Map<string, ReturnType<typeof loadVoiceStyle> extends Promise<infer T> ? T : never>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let state: { tts: any; isLoading: boolean; loadProgress: { step: string; current: number; total: number } | null; styleCache: Map<string, unknown> } = {
    tts: null,
    isLoading: false,
    loadProgress: null,
    styleCache: new Map(),
};

// Progress listeners
type ProgressCallback = (step: string, current: number, total: number) => void;
const progressListeners: Set<ProgressCallback> = new Set();

export function onLoadProgress(cb: ProgressCallback): () => void {
    progressListeners.add(cb);
    return () => { progressListeners.delete(cb); };
}

function notifyProgress(step: string, current: number, total: number) {
    state.loadProgress = { step, current, total };
    progressListeners.forEach(cb => cb(step, current, total));
}

/** 모델 로드 상태 확인 */
export function isModelLoaded(): boolean {
    return state.tts !== null;
}

/** 현재 로딩 중인지 */
export function isModelLoading(): boolean {
    return state.isLoading;
}

/** 현재 로딩 진행률 */
export function getLoadProgress(): { step: string; current: number; total: number } | null {
    return state.loadProgress;
}

// === WebGPU detection ===
async function supportsWebGPU(): Promise<boolean> {
    try {
        const nav = navigator as unknown as Record<string, unknown>;
        if (!nav.gpu) return false;
        const gpu = nav.gpu as { requestAdapter: () => Promise<unknown> };
        const adapter = await gpu.requestAdapter();
        return !!adapter;
    } catch {
        return false;
    }
}

// === INITIALIZATION ===

/**
 * Supertonic 2 모델 초기화
 * ONNX 모델 4개 (duration_predictor, text_encoder, vector_estimator, vocoder)를
 * HuggingFace CDN에서 로드하고 WebGPU/WASM 런타임으로 세션 생성
 */
export async function initSupertonic(): Promise<void> {
    if (state.tts) return; // 이미 초기화됨
    if (state.isLoading) {
        // 진행 중인 초기화 대기 (최대 30초 타임아웃)
        const INIT_TIMEOUT_MS = 30_000;
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                if (!state.isLoading) {
                    clearInterval(interval);
                    resolve();
                } else if (Date.now() - startTime >= INIT_TIMEOUT_MS) {
                    clearInterval(interval);
                    reject(new Error(`Supertonic 초기화 대기 시간 초과 (${INIT_TIMEOUT_MS / 1000}초)`));
                }
            }, 200);
        });
    }

    state.isLoading = true;
    logger.info('[Supertonic] 모델 초기화 시작');

    try {
        const useWebGPU = await supportsWebGPU();
        const executionProviders = useWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

        logger.info('[Supertonic] 런타임 선택', {
            provider: useWebGPU ? 'WebGPU (primary) + WASM (fallback)' : 'WASM only'
        });

        const sessionOptions = {
            executionProviders,
        };

        const { textToSpeech } = await loadTextToSpeech(
            ONNX_DIR,
            sessionOptions,
            (modelName: string, current: number, total: number) => {
                notifyProgress(modelName, current, total);
                logger.info(`[Supertonic] 모델 로드: ${modelName} (${current}/${total})`);
            }
        );

        state.tts = textToSpeech;
        notifyProgress('완료', 4, 4);
        logger.success('[Supertonic] 모델 초기화 완료');
    } catch (err) {
        logger.error('[Supertonic] 모델 초기화 실패', err);
        throw new Error(`Supertonic 모델 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        state.isLoading = false;
    }
}

// === VOICE STYLE LOADING ===

/**
 * 음성 스타일 로드 (캐시 적용)
 * 각 voice ID (F1~F5, M1~M5)에 대응하는 JSON 스타일 파일을 로드
 */
async function getVoiceStyle(voiceId: string): Promise<unknown> {
    if (state.styleCache.has(voiceId)) {
        return state.styleCache.get(voiceId)!;
    }

    const stylePath = `${VOICE_STYLE_DIR}/${voiceId}.json`;
    logger.info('[Supertonic] 음성 스타일 로드', { voiceId, path: stylePath });

    const style = await loadVoiceStyle([stylePath]);
    state.styleCache.set(voiceId, style);
    return style;
}

// === SPEECH GENERATION ===

/**
 * Supertonic 2로 음성 생성
 * @param text 입력 텍스트
 * @param lang 언어 코드 ('ko' | 'en' | 'fr' | 'es' | 'pt')
 * @param voiceId 음성 ID (F1~F5, M1~M5)
 * @param speed 속도 배율 (0.8~1.5, 기본 1.05)
 * @returns Blob URL + format
 */
export async function generateSpeech(
    text: string,
    lang: string,
    voiceId: string,
    speed: number = 1.05
): Promise<{ audioUrl: string; format: string }> {
    // 한국어/영어가 아닌 경우 지원 언어로 매핑
    const langMap: Record<string, string> = {
        'ko': 'ko', 'en': 'en', 'ja': 'en', // 일본어는 영어로 폴백
        'fr': 'fr', 'es': 'es', 'pt': 'pt'
    };
    const mappedLang = langMap[lang] || 'en';

    // 모델이 로드되지 않았으면 초기화
    if (!state.tts) {
        await initSupertonic();
    }

    if (!state.tts) {
        throw new Error('Supertonic 모델이 로드되지 않았습니다.');
    }

    logger.info('[Supertonic] 음성 생성 시작', { voiceId, lang: mappedLang, textLength: text.length, speed });

    // 음성 스타일 로드
    const style = await getVoiceStyle(voiceId);

    // 속도 클램핑
    const clampedSpeed = Math.max(0.8, Math.min(1.5, speed));

    // TTS 추론
    const { wav } = await state.tts.call(
        text,
        mappedLang,
        style,
        TOTAL_STEPS,
        clampedSpeed,
        0.3, // silence duration between chunks
        null  // progress callback (per-step)
    );

    // WAV 인코딩
    const sampleRate = state.tts.sampleRate || 24000;
    const wavBuffer = writeWavFile(wav, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);

    logger.success('[Supertonic] 음성 생성 완료', { voiceId, duration: `${(wav.length / sampleRate).toFixed(1)}초` });

    return { audioUrl, format: 'wav' };
}
