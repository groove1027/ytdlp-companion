
import { logger } from './LoggerService';

// Default Keys (Fallbacks)
// [DEPLOYMENT] Reset to empty before deploying. These are dev-only defaults.
const DEFAULT_GEMINI_KEY = 'REDACTED_GEMINI_KEY';
const DEFAULT_KIE_KEY = 'REDACTED_KIE_KEY';
const DEFAULT_LAOZHANG_KEY = 'REDACTED_LAOZHANG_KEY';
const DEFAULT_APIMART_KEY = 'REDACTED_APIMART_KEY';
const DEFAULT_REMOVE_BG_KEY = 'REDACTED_REMOVEBG_KEY';
const DEFAULT_WAVESPEED_KEY = '';
const DEFAULT_XAI_KEY = 'REDACTED_XAI_KEY';
const DEFAULT_EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const DEFAULT_YOUTUBE_API_KEY = 'REDACTED_YOUTUBE_KEY';
const DEFAULT_TYPECAST_KEY = '';
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

// [UPDATED] 라오장 키를 1순위로 사용하고, 없을 시 Kie 키를 폴백으로 사용
export const getGeminiKey = (): string => {
    const laozhangKey = getLaozhangKey();
    if (laozhangKey) {
        return laozhangKey;
    }
    return getKieKey();
};

export const getKieKey = (): string => {
    const key = localStorage.getItem('CUSTOM_KIE_KEY') || DEFAULT_KIE_KEY;
    return sanitizeKey(key);
};

export const getLaozhangKey = (): string => {
    const key = localStorage.getItem('CUSTOM_LAOZHANG_KEY') || DEFAULT_LAOZHANG_KEY;
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

export const getCloudinaryConfig = () => {
    return {
        cloudName: sanitizeKey(localStorage.getItem('CUSTOM_CLOUD_NAME') || DEFAULT_CLOUD_NAME),
        uploadPreset: sanitizeKey(localStorage.getItem('CUSTOM_UPLOAD_PRESET') || DEFAULT_UPLOAD_PRESET)
    };
};

export const getFeedbackUrl = (): string => {
    return DEFAULT_FEEDBACK_URL;
};

export const saveApiKeys = (kie: string, laozhang: string, cloudName?: string, uploadPreset?: string, gemini?: string, apimart?: string, removeBg?: string, wavespeed?: string, xai?: string, evolink?: string, youtubeApiKey?: string, typecast?: string) => {
    // Save raw input, but sanitized on retrieval
    if (kie.trim()) localStorage.setItem('CUSTOM_KIE_KEY', kie.trim());
    else localStorage.removeItem('CUSTOM_KIE_KEY');

    if (laozhang.trim()) {
        localStorage.setItem('CUSTOM_LAOZHANG_KEY', laozhang.trim());
        // [MODIFIED] 편의를 위해 Gemini 키 위치에도 동일하게 저장하거나, 기존 값을 제거하여 통합 유도
        localStorage.setItem('CUSTOM_GEMINI_KEY', laozhang.trim());
    } else {
        localStorage.removeItem('CUSTOM_LAOZHANG_KEY');
        localStorage.removeItem('CUSTOM_GEMINI_KEY');
    }
    
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
};

export const getStoredKeys = () => {
    return {
        gemini: localStorage.getItem('CUSTOM_GEMINI_KEY') || '',
        kie: localStorage.getItem('CUSTOM_KIE_KEY') || '',
        laozhang: localStorage.getItem('CUSTOM_LAOZHANG_KEY') || '',
        apimart: localStorage.getItem('CUSTOM_APIMART_KEY') || '',
        removeBg: localStorage.getItem('CUSTOM_REMOVE_BG_KEY') || '',
        cloudName: localStorage.getItem('CUSTOM_CLOUD_NAME') || '',
        uploadPreset: localStorage.getItem('CUSTOM_UPLOAD_PRESET') || '',
        wavespeed: localStorage.getItem('CUSTOM_WAVESPEED_KEY') || '',
        xai: localStorage.getItem('CUSTOM_XAI_KEY') || '',
        evolink: localStorage.getItem('CUSTOM_EVOLINK_KEY') || '',
        youtubeApiKey: localStorage.getItem('CUSTOM_YOUTUBE_API_KEY') || '',
        typecast: localStorage.getItem('CUSTOM_TYPECAST_KEY') || ''
    };
};

// [NEW] Centralized Fetch Wrapper for Logging
export const monitoredFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const method = options.method || 'GET';
    
    // Don't log full body for binary uploads (too large)
    const isBinaryUpload = options.body instanceof FormData || options.body instanceof Blob;
    const logBody = isBinaryUpload ? '[Binary/FormData]' : options.body;

    logger.info(`📡 API Request: ${method} ${url}`, isBinaryUpload ? undefined : logBody);

    try {
        const response = await fetch(url, options);

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

            logger.error(`❌ API Error ${response.status}: ${url}`, errorBody);
        } else {
            // Optional: Log success if needed, but keeping it quiet to reduce noise
            // logger.success(`✅ API Success ${response.status}: ${url}`);
        }
        return response;
    } catch (error: any) {
        logger.error(`🔥 Network Error: ${url}`, error.message);
        throw error;
    }
};
