
import { logger } from './LoggerService';

// Default Keys (Fallbacks)
// [DEPLOYMENT] Reset to empty before deploying. These are dev-only defaults.
const DEFAULT_GEMINI_KEY = 'REDACTED_GEMINI_KEY';
const DEFAULT_KIE_KEY = 'REDACTED_KIE_KEY';
const DEFAULT_APIMART_KEY = 'REDACTED_APIMART_KEY';
const DEFAULT_REMOVE_BG_KEY = 'REDACTED_REMOVEBG_KEY';
const DEFAULT_WAVESPEED_KEY = '';
const DEFAULT_XAI_KEY = 'REDACTED_XAI_KEY';
const DEFAULT_EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const DEFAULT_YOUTUBE_API_KEY = 'REDACTED_YOUTUBE_KEY';
const DEFAULT_TYPECAST_KEY = '';
const DEFAULT_GHOSTCUT_APP_KEY = '';
const DEFAULT_GHOSTCUT_APP_SECRET = '';
const DEFAULT_COUPANG_ACCESS_KEY = '';
const DEFAULT_COUPANG_SECRET_KEY = '';
const DEFAULT_COUPANG_PROXY_URL = '';
const DEFAULT_CLOUD_NAME = 'dji3gtb5r';
const DEFAULT_UPLOAD_PRESET = 'storyboard';
// [FEEDBACK] Google Apps Script Web App URL — 개발자가 한 번 설정
// 설정 방법: Google Sheets → 확장 프로그램 → Apps Script → doPost 배포 → URL 붙여넣기
const DEFAULT_FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbzbZTaYcOM7WBPHNvuwA-mDV3xQf-mowSwcehf6QY2LTMDnH-Tj9UsriXHSMc_n0ECFLg/exec';

// Helper to remove non-ASCII characters that break HTTP headers
const sanitizeKey = (key: string | undefined | null): string => {
    if (!key) return '';
    // Keep only printable ASCII (33-126). This removes spaces, control characters, and Unicode (Korean, Emoji, etc).
    return key.replace(/[^\x21-\x7E]/g, '').trim();
};

// [UPDATED] Kie 키를 Gemini 폴백으로 사용
export const getGeminiKey = (): string => {
    return getKieKey();
};

export const getKieKey = (): string => {
    const key = localStorage.getItem('CUSTOM_KIE_KEY') || DEFAULT_KIE_KEY;
    return sanitizeKey(key);
};

export const getApimartKey = (): string => {
    const key = localStorage.getItem('CUSTOM_APIMART_KEY') || DEFAULT_APIMART_KEY;
    return sanitizeKey(key);
};

export const getRemoveBgKey = (): string => {
    const key = localStorage.getItem('CUSTOM_REMOVE_BG_KEY') || DEFAULT_REMOVE_BG_KEY;
    return sanitizeKey(key);
};

export const getWaveSpeedKey = (): string => {
    const key = localStorage.getItem('CUSTOM_WAVESPEED_KEY') || DEFAULT_WAVESPEED_KEY;
    return sanitizeKey(key);
};

export const getXaiKey = (): string => {
    const key = localStorage.getItem('CUSTOM_XAI_KEY') || DEFAULT_XAI_KEY;
    return sanitizeKey(key);
};

export const getEvolinkKey = (): string => {
    const key = localStorage.getItem('CUSTOM_EVOLINK_KEY') || DEFAULT_EVOLINK_KEY;
    return sanitizeKey(key);
};

export const getYoutubeApiKey = (): string => {
    const key = localStorage.getItem('CUSTOM_YOUTUBE_API_KEY') || DEFAULT_YOUTUBE_API_KEY;
    return sanitizeKey(key);
};

export const getTypecastKey = (): string => {
    const key = localStorage.getItem('CUSTOM_TYPECAST_KEY') || DEFAULT_TYPECAST_KEY;
    return sanitizeKey(key);
};

export const getGhostCutKeys = (): { appKey: string; appSecret: string } => {
    return {
        appKey: sanitizeKey(localStorage.getItem('CUSTOM_GHOSTCUT_APP_KEY') || DEFAULT_GHOSTCUT_APP_KEY),
        appSecret: sanitizeKey(localStorage.getItem('CUSTOM_GHOSTCUT_APP_SECRET') || DEFAULT_GHOSTCUT_APP_SECRET),
    };
};

export const getCoupangAccessKey = (): string => {
    const key = localStorage.getItem('CUSTOM_COUPANG_ACCESS_KEY') || DEFAULT_COUPANG_ACCESS_KEY;
    return sanitizeKey(key);
};

export const getCoupangSecretKey = (): string => {
    const key = localStorage.getItem('CUSTOM_COUPANG_SECRET_KEY') || DEFAULT_COUPANG_SECRET_KEY;
    return sanitizeKey(key);
};

export const getCoupangProxyUrl = (): string => {
    const url = localStorage.getItem('CUSTOM_COUPANG_PROXY_URL') || DEFAULT_COUPANG_PROXY_URL;
    return url.trim();
};

export const getCloudinaryConfig = () => {
    return {
        cloudName: sanitizeKey(localStorage.getItem('CUSTOM_CLOUD_NAME') || DEFAULT_CLOUD_NAME),
        uploadPreset: sanitizeKey(localStorage.getItem('CUSTOM_UPLOAD_PRESET') || DEFAULT_UPLOAD_PRESET)
    };
};

export const getFeedbackUrl = (): string => {
    return DEFAULT_FEEDBACK_URL;
};

export const saveApiKeys = (kie: string, cloudName?: string, uploadPreset?: string, gemini?: string, apimart?: string, removeBg?: string, wavespeed?: string, xai?: string, evolink?: string, youtubeApiKey?: string, typecast?: string, ghostcutAppKey?: string, ghostcutAppSecret?: string) => {
    // Save raw input, but sanitized on retrieval
    if (kie.trim()) localStorage.setItem('CUSTOM_KIE_KEY', kie.trim());
    else localStorage.removeItem('CUSTOM_KIE_KEY');

    if (apimart && apimart.trim()) {
        localStorage.setItem('CUSTOM_APIMART_KEY', apimart.trim());
    } else {
        localStorage.removeItem('CUSTOM_APIMART_KEY');
    }

    if (removeBg && removeBg.trim()) {
        localStorage.setItem('CUSTOM_REMOVE_BG_KEY', removeBg.trim());
    } else {
        localStorage.removeItem('CUSTOM_REMOVE_BG_KEY');
    }

    if (cloudName?.trim()) localStorage.setItem('CUSTOM_CLOUD_NAME', cloudName.trim());
    else localStorage.removeItem('CUSTOM_CLOUD_NAME');

    if (uploadPreset?.trim()) localStorage.setItem('CUSTOM_UPLOAD_PRESET', uploadPreset.trim());
    else localStorage.removeItem('CUSTOM_UPLOAD_PRESET');

    if (wavespeed && wavespeed.trim()) localStorage.setItem('CUSTOM_WAVESPEED_KEY', wavespeed.trim());
    else localStorage.removeItem('CUSTOM_WAVESPEED_KEY');

    if (xai && xai.trim()) localStorage.setItem('CUSTOM_XAI_KEY', xai.trim());
    else localStorage.removeItem('CUSTOM_XAI_KEY');

    if (evolink && evolink.trim()) localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink.trim());
    else localStorage.removeItem('CUSTOM_EVOLINK_KEY');

    if (youtubeApiKey && youtubeApiKey.trim()) localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtubeApiKey.trim());
    else localStorage.removeItem('CUSTOM_YOUTUBE_API_KEY');

    if (typecast && typecast.trim()) localStorage.setItem('CUSTOM_TYPECAST_KEY', typecast.trim());
    else localStorage.removeItem('CUSTOM_TYPECAST_KEY');

    if (ghostcutAppKey && ghostcutAppKey.trim()) localStorage.setItem('CUSTOM_GHOSTCUT_APP_KEY', ghostcutAppKey.trim());
    else localStorage.removeItem('CUSTOM_GHOSTCUT_APP_KEY');

    if (ghostcutAppSecret && ghostcutAppSecret.trim()) localStorage.setItem('CUSTOM_GHOSTCUT_APP_SECRET', ghostcutAppSecret.trim());
    else localStorage.removeItem('CUSTOM_GHOSTCUT_APP_SECRET');
};

export const saveCoupangKeys = (accessKey: string, secretKey: string, proxyUrl: string) => {
    if (accessKey.trim()) localStorage.setItem('CUSTOM_COUPANG_ACCESS_KEY', accessKey.trim());
    else localStorage.removeItem('CUSTOM_COUPANG_ACCESS_KEY');

    if (secretKey.trim()) localStorage.setItem('CUSTOM_COUPANG_SECRET_KEY', secretKey.trim());
    else localStorage.removeItem('CUSTOM_COUPANG_SECRET_KEY');

    if (proxyUrl.trim()) localStorage.setItem('CUSTOM_COUPANG_PROXY_URL', proxyUrl.trim());
    else localStorage.removeItem('CUSTOM_COUPANG_PROXY_URL');
};

export const getStoredKeys = () => {
    return {
        gemini: localStorage.getItem('CUSTOM_GEMINI_KEY') || '',
        kie: localStorage.getItem('CUSTOM_KIE_KEY') || '',
        apimart: localStorage.getItem('CUSTOM_APIMART_KEY') || '',
        removeBg: localStorage.getItem('CUSTOM_REMOVE_BG_KEY') || '',
        cloudName: localStorage.getItem('CUSTOM_CLOUD_NAME') || '',
        uploadPreset: localStorage.getItem('CUSTOM_UPLOAD_PRESET') || '',
        wavespeed: localStorage.getItem('CUSTOM_WAVESPEED_KEY') || '',
        xai: localStorage.getItem('CUSTOM_XAI_KEY') || '',
        evolink: localStorage.getItem('CUSTOM_EVOLINK_KEY') || '',
        youtubeApiKey: localStorage.getItem('CUSTOM_YOUTUBE_API_KEY') || '',
        typecast: localStorage.getItem('CUSTOM_TYPECAST_KEY') || '',
        ghostcutAppKey: localStorage.getItem('CUSTOM_GHOSTCUT_APP_KEY') || '',
        ghostcutAppSecret: localStorage.getItem('CUSTOM_GHOSTCUT_APP_SECRET') || ''
    };
};

// [NEW] Centralized Fetch Wrapper for Logging (v2: timing + success logging + timeout)
// timeoutMs: AbortController 기반 타임아웃 (기본 0 = 무제한, 양수 시 해당 ms 후 AbortError)
export const monitoredFetch = async (url: string, options: RequestInit = {}, timeoutMs: number = 0): Promise<Response> => {
    const method = options.method || 'GET';
    const startTime = performance.now();

    // Don't log full body for binary uploads (too large)
    const isBinaryUpload = options.body instanceof FormData || options.body instanceof Blob;

    // [DIAGNOSTIC] API 타이밍 워터폴 기록
    const timingId = logger.startApiTiming(url, method);

    logger.info(`📡 API Request: ${method} ${url}`, isBinaryUpload ? '[Binary/FormData]' : undefined);

    // [FIX #32] AbortController 기반 타임아웃 — 긴 AI 요청의 브라우저/네트워크 타임아웃 방지
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let mergedSignal = options.signal;

    if (timeoutMs > 0 && !options.signal) {
        // 호출자가 signal을 제공하지 않은 경우에만 타임아웃 AbortController 생성
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        mergedSignal = controller.signal;
    }

    try {
        const response = await fetch(url, { ...options, signal: mergedSignal });
        const duration = Math.round(performance.now() - startTime);

        if (!response.ok) {
            // Clone response to read body without consuming it for the caller
            const clone = response.clone();
            let errorBody: any = "";
            try {
                const text = await clone.text();
                try {
                    errorBody = JSON.parse(text);
                } catch {
                    errorBody = text;
                }
            } catch (e) {
                errorBody = "[Body Read Failed]";
            }

            logger.endApiTiming(timingId, response.status);
            logger.apiLog('error', `❌ API Error ${response.status}: ${method} ${url}`, duration, errorBody);
        } else {
            // Success response summary (status + content info)
            const contentType = response.headers.get('content-type') || '';
            const contentLength = response.headers.get('content-length');
            const sizeHint = contentLength ? ` ${Math.round(parseInt(contentLength) / 1024)}KB` : '';
            const typeHint = contentType.includes('json') ? 'json' : contentType.includes('text') ? 'text' : contentType.split(';')[0] || '';
            logger.endApiTiming(timingId, response.status);
            logger.apiLog('success', `✅ ${response.status} ${method} ${url}`, duration, sizeHint || typeHint ? `${typeHint}${sizeHint}` : undefined);
        }
        return response;
    } catch (error: any) {
        const duration = Math.round(performance.now() - startTime);
        // AbortError를 타임아웃 메시지로 변환 (호출자가 signal을 직접 넘긴 경우는 원래 에러 유지)
        if (error.name === 'AbortError' && timeoutId !== undefined) {
            const timeoutSec = Math.round(timeoutMs / 1000);
            logger.endApiTiming(timingId, 'timeout');
            logger.apiLog('error', `⏱️ Timeout (${timeoutSec}s): ${method} ${url}`, duration, `요청이 ${timeoutSec}초를 초과했습니다.`);
            throw new Error(`네트워크 타임아웃: ${method} ${url} (${timeoutSec}초 초과). 대본이 길 경우 처리 시간이 오래 걸릴 수 있습니다.`);
        }
        logger.endApiTiming(timingId, 'error');
        logger.apiLog('error', `🔥 Network Error: ${method} ${url}`, duration, error.message);
        throw error;
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
};
