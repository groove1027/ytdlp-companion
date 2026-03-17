
import { logger } from './LoggerService';
import { showToast } from '../stores/uiStore';

// Default Keys (Fallbacks)
// [DEPLOYMENT] Reset to empty before deploying. These are dev-only defaults.
const DEFAULT_GEMINI_KEY = 'REDACTED_GEMINI_KEY';
const DEFAULT_KIE_KEY = 'REDACTED_KIE_KEY';
const DEFAULT_APIMART_KEY = 'REDACTED_APIMART_KEY';
const DEFAULT_REMOVE_BG_KEY = 'REDACTED_REMOVEBG_KEY';
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

export const getXaiKey = (): string => {
    const key = localStorage.getItem('CUSTOM_XAI_KEY') || DEFAULT_XAI_KEY;
    return sanitizeKey(key);
};

export const getEvolinkKey = (): string => {
    const key = localStorage.getItem('CUSTOM_EVOLINK_KEY') || DEFAULT_EVOLINK_KEY;
    return sanitizeKey(key);
};

// ── YouTube API 키 풀 (다중 키 지원 — #271) ──
const YOUTUBE_KEYS_POOL_KEY = 'YOUTUBE_API_KEYS_POOL';
const YOUTUBE_ACTIVE_INDEX_KEY = 'YOUTUBE_API_KEY_ACTIVE_INDEX';

export const getYoutubeApiKeyPool = (): string[] => {
    try {
        const raw = localStorage.getItem(YOUTUBE_KEYS_POOL_KEY);
        if (raw) {
            const pool = JSON.parse(raw);
            if (Array.isArray(pool)) return pool.filter((k: unknown) => typeof k === 'string' && (k as string).trim());
        }
    } catch { /* parse error — return empty */ }
    return [];
};

export const saveYoutubeApiKeyPool = (keys: string[]): void => {
    const cleaned = keys.map(k => k.trim()).filter(Boolean);
    if (cleaned.length === 0) {
        localStorage.removeItem(YOUTUBE_KEYS_POOL_KEY);
        localStorage.removeItem(YOUTUBE_ACTIVE_INDEX_KEY);
    } else {
        localStorage.setItem(YOUTUBE_KEYS_POOL_KEY, JSON.stringify(cleaned));
        const idx = parseInt(localStorage.getItem(YOUTUBE_ACTIVE_INDEX_KEY) || '0', 10);
        if (idx >= cleaned.length) localStorage.setItem(YOUTUBE_ACTIVE_INDEX_KEY, '0');
    }
};

export const getYoutubeApiKeyPoolSize = (): number => getYoutubeApiKeyPool().length;

export const getActiveYoutubeKeyIndex = (): number => {
    const pool = getYoutubeApiKeyPool();
    if (pool.length === 0) return 0;
    const idx = parseInt(localStorage.getItem(YOUTUBE_ACTIVE_INDEX_KEY) || '0', 10);
    return idx % pool.length;
};

export const rotateYoutubeApiKey = (): boolean => {
    const pool = getYoutubeApiKeyPool();
    if (pool.length <= 1) return false;
    const idx = getActiveYoutubeKeyIndex();
    const newIdx = (idx + 1) % pool.length;
    localStorage.setItem(YOUTUBE_ACTIVE_INDEX_KEY, String(newIdx));
    logger.info(`[YouTube] API 키 전환: ${idx + 1} → ${newIdx + 1} / ${pool.length}개`);
    return true;
};

export const getYoutubeApiKey = (): string => {
    const pool = getYoutubeApiKeyPool();
    if (pool.length > 0) {
        return sanitizeKey(pool[getActiveYoutubeKeyIndex()]);
    }
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

export const saveApiKeys = (kie: string, cloudName?: string, uploadPreset?: string, gemini?: string, apimart?: string, removeBg?: string, xai?: string, evolink?: string, youtubeApiKey?: string, typecast?: string, ghostcutAppKey?: string, ghostcutAppSecret?: string) => {
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
        xai: localStorage.getItem('CUSTOM_XAI_KEY') || '',
        evolink: localStorage.getItem('CUSTOM_EVOLINK_KEY') || '',
        youtubeApiKey: localStorage.getItem('CUSTOM_YOUTUBE_API_KEY') || '',
        typecast: localStorage.getItem('CUSTOM_TYPECAST_KEY') || '',
        ghostcutAppKey: localStorage.getItem('CUSTOM_GHOSTCUT_APP_KEY') || '',
        ghostcutAppSecret: localStorage.getItem('CUSTOM_GHOSTCUT_APP_SECRET') || ''
    };
};

// ── 서버 동기화: API 키를 계정에 연동하여 어디서든 복원 ──

/** localStorage → 서버 필드명 매핑 */
const SETTINGS_KEY_MAP: [string, string][] = [
    ['CUSTOM_KIE_KEY', 'kie'],
    ['CUSTOM_EVOLINK_KEY', 'evolink'],
    ['CUSTOM_CLOUD_NAME', 'cloudName'],
    ['CUSTOM_UPLOAD_PRESET', 'uploadPreset'],
    ['CUSTOM_APIMART_KEY', 'apimart'],
    ['CUSTOM_REMOVE_BG_KEY', 'removeBg'],
    ['CUSTOM_XAI_KEY', 'xai'],
    ['CUSTOM_YOUTUBE_API_KEY', 'youtubeApiKey'],
    ['YOUTUBE_API_KEYS_POOL', 'youtubeApiKeyPool'],
    ['CUSTOM_TYPECAST_KEY', 'typecast'],
    ['CUSTOM_GHOSTCUT_APP_KEY', 'ghostcutAppKey'],
    ['CUSTOM_GHOSTCUT_APP_SECRET', 'ghostcutAppSecret'],
    ['CUSTOM_COUPANG_ACCESS_KEY', 'coupangAccessKey'],
    ['CUSTOM_COUPANG_SECRET_KEY', 'coupangSecretKey'],
    ['CUSTOM_COUPANG_PROXY_URL', 'coupangProxyUrl'],
];

/** 현재 localStorage의 API 키를 서버에 백업 (로그인 상태에서만 동작) */
export const syncApiKeysToServer = async (): Promise<void> => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (!token) return;

    const settings: Record<string, string> = {};
    for (const [lsKey, field] of SETTINGS_KEY_MAP) {
        const val = localStorage.getItem(lsKey);
        if (val) settings[field] = val;
    }

    // 저장할 키가 하나도 없으면 스킵
    if (Object.keys(settings).length === 0) return;

    try {
        await fetch('/api/auth/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, settings }),
        });
    } catch (e) {
        logger.trackSwallowedError('apiService:syncApiKeysToServer', e);
    }
};

/** 서버에서 API 키를 가져와 localStorage에 복원 (로그인 직후 호출) */
export const restoreApiKeysFromServer = async (): Promise<boolean> => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (!token) return false;

    try {
        const res = await fetch('/api/auth/get-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        if (!res.ok) return false;

        const data = await res.json();
        if (!data.settings) return false;

        let restored = 0;
        for (const [lsKey, field] of SETTINGS_KEY_MAP) {
            const val = data.settings[field];
            if (val && typeof val === 'string' && val.trim()) {
                localStorage.setItem(lsKey, val.trim());
                restored++;
            }
        }

        if (restored > 0) {
            logger.info(`API 키 ${restored}개를 서버에서 복원했습니다.`);
            showToast(`저장된 API 키 ${restored}개가 자동으로 복원되었습니다.`, 4000);
        }
        return restored > 0;
    } catch (e) {
        logger.trackSwallowedError('apiService:restoreApiKeysFromServer', e);
        return false;
    }
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
                } catch (e) {
                    logger.trackSwallowedError('apiService:parseErrorBody', e);
                    errorBody = text;
                }
            } catch (e) {
                errorBody = "[Body Read Failed]";
            }

            logger.endApiTiming(timingId, response.status);
            logger.apiLog('error', `❌ API Error ${response.status}: ${method} ${url}`, duration, errorBody);
            logger.trackApiFailure({
                timestamp: new Date().toISOString(),
                url: url.substring(0, 200),
                method,
                status: response.status,
                durationMs: duration,
                requestSnippet: !isBinaryUpload && typeof options.body === 'string'
                    ? options.body.substring(0, 500)
                    : isBinaryUpload ? '[Binary/FormData]' : undefined,
                responseSnippet: typeof errorBody === 'string'
                    ? errorBody.substring(0, 500)
                    : JSON.stringify(errorBody).substring(0, 500),
                responseHeaders: [
                    response.headers.get('x-ratelimit-remaining') ? `ratelimit-remaining: ${response.headers.get('x-ratelimit-remaining')}` : '',
                    response.headers.get('retry-after') ? `retry-after: ${response.headers.get('retry-after')}` : '',
                    response.headers.get('x-request-id') ? `x-request-id: ${response.headers.get('x-request-id')}` : '',
                ].filter(Boolean).join(', ') || undefined,
            });
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
        logger.trackApiFailure({
            timestamp: new Date().toISOString(),
            url: url.substring(0, 200),
            method,
            status: error.name === 'AbortError' ? 'timeout' : 'network-error',
            durationMs: duration,
            requestSnippet: !isBinaryUpload && typeof options.body === 'string'
                ? options.body.substring(0, 500)
                : undefined,
            responseSnippet: error.message,
        });
        throw error;
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
};
