/**
 * Google Flow Veo 3.1 영상 생성 서비스
 * - Google 쿠키 기반 무료 영상 생성 (Veo 3.1 Fast)
 * - Cloudflare Pages Function 프록시 (/api/google-proxy) 경유
 * - whisk-api (rohitaryal) 리버스 엔지니어링 기반
 */

import { monitoredFetch } from './apiService';
import { getGoogleAccessToken } from './googleImageService';
import { logger } from './LoggerService';

const PROXY_PATH = '/api/google-proxy';
const GOOGLE_VIDEO_GENERATE_URL = 'https://aisandbox-pa.googleapis.com/v1/whisk:generateVideo';
const GOOGLE_VIDEO_POLL_URL = 'https://aisandbox-pa.googleapis.com/v1:runVideoFxSingleClipsStatusCheck';
const GOOGLE_MEDIA_URL = 'https://aisandbox-pa.googleapis.com/v1/media';
const GOOGLE_CREDITS_URL = 'https://aisandbox-pa.googleapis.com/v1/credits';
const GOOGLE_SESSION_EXPIRED_MESSAGE = 'Google 세션이 만료됐어요. API 설정에서 쿠키를 다시 연결해주세요.';

// 화면비 매핑
const VIDEO_ASPECT_MAP: Record<string, string> = {
  '16:9': 'ASPECT_RATIO_LANDSCAPE',
  '9:16': 'ASPECT_RATIO_PORTRAIT',
  '1:1': 'ASPECT_RATIO_SQUARE',
  'landscape': 'ASPECT_RATIO_LANDSCAPE',
  'portrait': 'ASPECT_RATIO_PORTRAIT',
  'square': 'ASPECT_RATIO_SQUARE',
};

/** 프록시를 통해 Google API 호출 */
async function proxyFetch(targetUrl: string, options: {
  method?: string;
  body?: string;
  cookie?: string;
  token?: string;
}): Promise<Response> {
  return monitoredFetch(PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: options.method,
      body: options.body,
      cookie: options.cookie,
      token: options.token,
    }),
  });
}

async function throwGoogleSessionExpired(): Promise<never> {
  try {
    const { useGoogleCookieStore } = await import('../stores/googleCookieStore');
    useGoogleCookieStore.getState().clearCookie();
  } catch { /* ignore */ }
  throw new Error(GOOGLE_SESSION_EXPIRED_MESSAGE);
}

export interface GoogleVideoResult {
  videoUrl: string;
  mediaId: string;
}

/**
 * Google Flow Veo 3.1 영상 생성 태스크 생성
 * @returns 태스크 토큰 (폴링에 사용)
 */
export async function createGoogleVideoTask(
  prompt: string,
  imageUrl: string,
  aspectRatio: string,
  cookie: string,
): Promise<string> {
  const { token } = await getGoogleAccessToken(cookie);
  const googleAspect = VIDEO_ASPECT_MAP[aspectRatio] || 'ASPECT_RATIO_LANDSCAPE';

  logger.info('[Google Veo 3.1] 영상 생성 요청', {
    prompt: prompt.slice(0, 50),
    aspectRatio: googleAspect,
    hasImage: !!imageUrl,
  });

  // Image-to-Video 요청 바디
  const body: Record<string, unknown> = {
    generationRequest: {
      prompt,
      model: 'VEO_3_1_I2V_12STEP',
      aspectRatio: googleAspect,
    },
    clientContext: {
      sessionId: `;${Date.now()}`,
      tool: 'VIDEO_FX',
    },
  };

  // 이미지가 있으면 참조 이미지로 추가
  if (imageUrl) {
    (body.generationRequest as Record<string, unknown>).imageUrl = imageUrl;
  }

  const res = await proxyFetch(GOOGLE_VIDEO_GENERATE_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    cookie,
    token,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return throwGoogleSessionExpired();
    }
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Veo 3.1 영상 생성 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const rawText = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('Google Veo 3.1: 예기치 않은 응답 (JSON 파싱 실패). Google reCAPTCHA가 필요할 수 있습니다.');
  }

  // 응답에서 태스크 토큰 추출
  const taskToken = data?.videoGenerationToken
    || data?.token
    || data?.generationToken
    || data?.name
    || data?.operationName
    || '';

  if (!taskToken) {
    throw new Error('Google Veo 3.1: 태스크 토큰을 받지 못했습니다. 잠시 후 다시 시도해주세요.');
  }

  logger.info('[Google Veo 3.1] 태스크 생성 완료', { token: String(taskToken).slice(0, 30) });
  return String(taskToken);
}

/**
 * Google Flow Veo 3.1 영상 생성 폴링
 * 2초 간격, 최대 120회 (4분)
 */
export async function pollGoogleVideoTask(
  taskToken: string,
  cookie: string,
  signal?: AbortSignal,
  onProgress?: (p: number) => void,
): Promise<string> {
  const { token } = await getGoogleAccessToken(cookie);
  const maxAttempts = 120;
  const pollInterval = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('영상 생성이 취소되었습니다.');

    const progress = Math.min(95, Math.round((attempt / maxAttempts) * 100));
    onProgress?.(progress);

    const pollBody: Record<string, unknown> = { videoGenerationToken: taskToken };

    const res = await proxyFetch(GOOGLE_VIDEO_POLL_URL, {
      method: 'POST',
      body: JSON.stringify(pollBody),
      cookie,
      token,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return throwGoogleSessionExpired();
      }
      // 일시적 오류 무시하고 재시도
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }
      throw new Error(`Google Veo 3.1 폴링 실패 (${res.status})`);
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      // HTML/captcha 응답 등 — 재시도
      if (attempt < maxAttempts - 1) { await new Promise(r => setTimeout(r, pollInterval)); continue; }
      throw new Error('Google Veo 3.1: 폴링 응답 파싱 실패. Google reCAPTCHA가 필요할 수 있습니다.');
    }

    // 완료 여부 확인 — 다양한 응답 형태 대응
    const status = data?.state || data?.status || data?.videoStatus || '';
    const isComplete = status === 'COMPLETE' || status === 'SUCCEEDED' || status === 'completed' || status === 'success';
    const isFailed = status === 'FAILED' || status === 'failed' || status === 'ERROR';

    if (isFailed) {
      throw new Error(`Google Veo 3.1 영상 생성 실패: ${data?.error || data?.failMsg || '알 수 없는 오류'}`);
    }

    if (isComplete) {
      // 영상 URL 추출 — 다양한 위치에서 시도
      const videoObj = data?.video as Record<string, unknown> | undefined;
      const results = data?.results as Record<string, unknown>[] | undefined;
      const clips = data?.clips as Record<string, unknown>[] | undefined;
      const resultUrls = data?.resultUrls as string[] | undefined;
      const videoUrl = (data?.videoUrl as string)
        || (data?.downloadUrl as string)
        || (videoObj?.url as string)
        || (results?.[0]?.url as string)
        || resultUrls?.[0]
        || (clips?.[0]?.downloadUrl as string)
        || (clips?.[0]?.videoUrl as string)
        || '';

      // mediaId로 URL 조회 — 프록시 경유 (API 키 노출 방지)
      if (!videoUrl && data?.mediaId) {
        const mediaUrl = `${GOOGLE_MEDIA_URL}/${data.mediaId}`;
        const mediaRes = await proxyFetch(mediaUrl, { cookie, token });
        if (mediaRes.status === 401 || mediaRes.status === 403) {
          return throwGoogleSessionExpired();
        }
        if (mediaRes.ok) {
          let mediaData: Record<string, unknown> = {};
          try { mediaData = await mediaRes.json(); } catch { /* non-JSON response — skip */ }
          const resolvedUrl = (mediaData?.url as string) || (mediaData?.downloadUrl as string) || '';
          if (resolvedUrl) {
            onProgress?.(100);
            logger.success('[Google Veo 3.1] 영상 생성 완료 (media resolve)', { url: resolvedUrl.slice(0, 60) });
            return resolvedUrl;
          }
        }
      }

      if (!videoUrl) {
        throw new Error('Google Veo 3.1: 영상 URL을 찾을 수 없습니다.');
      }

      onProgress?.(100);
      logger.success('[Google Veo 3.1] 영상 생성 완료', { url: videoUrl.slice(0, 60) });
      return videoUrl;
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error('Google Veo 3.1 영상 생성 시간 초과 (4분). 다시 시도해주세요.');
}

/**
 * Google Flow 크레딧 조회
 * @returns 이미지/영상 잔여 크레딧
 */
export async function getFlowCredits(cookie: string): Promise<{
  imageRemaining: number;
  imageTotal: number;
  videoRemaining: number;
  videoTotal: number;
}> {
  try {
    const { token } = await getGoogleAccessToken(cookie);

    const res = await proxyFetch(GOOGLE_CREDITS_URL, {
      method: 'GET',
      cookie,
      token,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return throwGoogleSessionExpired();
      }
      logger.warn('[Flow Credits] 크레딧 조회 실패', { status: res.status });
      return { imageRemaining: -1, imageTotal: -1, videoRemaining: -1, videoTotal: -1 };
    }

    const data = await res.json();

    // 다양한 응답 형태 대응
    const credits = data?.credits || data;
    const imageCredits = credits?.imageCredits || credits?.image || {};
    const videoCredits = credits?.videoCredits || credits?.video || {};

    return {
      imageRemaining: imageCredits?.remaining ?? imageCredits?.available ?? -1,
      imageTotal: imageCredits?.total ?? imageCredits?.limit ?? -1,
      videoRemaining: videoCredits?.remaining ?? videoCredits?.available ?? -1,
      videoTotal: videoCredits?.total ?? videoCredits?.limit ?? -1,
    };
  } catch (e) {
    logger.warn('[Flow Credits] 크레딧 조회 중 오류', { error: (e as Error).message });
    return { imageRemaining: -1, imageTotal: -1, videoRemaining: -1, videoTotal: -1 };
  }
}
