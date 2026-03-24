/**
 * Google 공식 Gemini API 직접 호출 서비스
 * 체험판(trial) 사용자 전용 — generativelanguage.googleapis.com
 *
 * 지원 기능:
 * - 텍스트 생성 (generateContent)
 * - 이미지 생성 (Imagen via Gemini)
 * - 영상 분석 (멀티모달)
 */
import { getGoogleGeminiKey } from './apiService';
import { logger } from './LoggerService';

const GOOGLE_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** URL에서 API 키를 마스킹 (로그 노출 방지) */
const maskKeyInUrl = (url: string): string => url.replace(/key=[^&]+/, 'key=***MASKED***');

/** Google Gemini generateContent 직접 호출 */
export const requestGoogleGeminiDirect = async (
  model: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ text: string; usageMetadata?: Record<string, unknown> }> => {
  const apiKey = getGoogleGeminiKey();
  if (!apiKey) {
    throw new Error('Google Gemini API 키가 설정되지 않았습니다. 설정 → API 키에서 등록해주세요.');
  }

  const url = `${GOOGLE_GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  logger.info(`[GoogleGemini] 직접 호출: ${maskKeyInUrl(url)}`);

  // monitoredFetch 대신 직접 fetch 사용 (monitoredFetch가 URL을 로그에 남기므로 키 노출 방지)
  const controller = new AbortController();
  const timeoutId = options?.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 429) {
      throw new Error('Google Gemini API 요청 한도 초과 — 잠시 후 다시 시도해주세요.');
    }
    if (res.status === 403) {
      throw new Error('Google Gemini API 키가 유효하지 않습니다. API 키를 확인해주세요.');
    }
    throw new Error(`Google Gemini API 오류 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p: Record<string, unknown>) => p.text || '')
    .join('') || '';

  return { text, usageMetadata: data?.usageMetadata };
};

/**
 * Google Gemini 이미지 생성 (Imagen 3 via Gemini API)
 * gemini-2.0-flash-exp 모델의 이미지 생성 기능 사용
 */
export const generateGoogleGeminiImage = async (
  prompt: string,
  aspectRatio: string,
  options?: { signal?: AbortSignal },
): Promise<{ imageBase64: string; mimeType: string }> => {
  const apiKey = getGoogleGeminiKey();
  if (!apiKey) {
    throw new Error('Google Gemini API 키가 설정되지 않았습니다.');
  }

  // Gemini 2.0 Flash의 이미지 생성 기능 사용
  const url = `${GOOGLE_GEMINI_BASE}/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
  logger.info(`[GoogleGemini] 이미지 생성: ${maskKeyInUrl(url)}`);

  const controller = new AbortController();
  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Generate an image: ${prompt}` }],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          responseMimeType: 'text/plain',
        },
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`이미지 생성 실패 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData);

  if (!imagePart?.inlineData) {
    throw new Error('이미지 생성 결과가 없습니다. 프롬프트를 조정해보세요.');
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
};

/** 체험판 사용자용 — Google Gemini API 키가 유효한지 빠르게 테스트 */
export const testGoogleGeminiKey = async (apiKey: string): Promise<boolean> => {
  try {
    const url = `${GOOGLE_GEMINI_BASE}/models?key=${apiKey}`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
};

logger.info('[GoogleGeminiDirect] 서비스 로드됨');
