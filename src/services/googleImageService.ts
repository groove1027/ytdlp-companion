/**
 * Google ImageFX / Whisk 이미지 생성 서비스
 * - Google 쿠키 기반 무료 이미지 생성 (Imagen 3.5)
 * - labs.google 내부 API 리버스엔지니어링 기반
 * - CORS 프록시를 통해 브라우저에서 호출
 */

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

const GOOGLE_AUTH_URL = 'https://labs.google/fx/api/auth/session';
const GOOGLE_IMAGEFX_URL = 'https://aisandbox-pa.googleapis.com/v1:runImageFx';

const DEFAULT_HEADERS = {
  'Origin': 'https://labs.google',
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/tools/image-fx',
};

// 화면비 매핑
const ASPECT_RATIO_MAP: Record<string, string> = {
  '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
  'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
  'square': 'IMAGE_ASPECT_RATIO_SQUARE',
};

// ─── 세션 캐시 ───
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/** Google 쿠키로 Bearer 토큰 발급 */
export async function getGoogleAccessToken(cookie: string): Promise<{ token: string; email: string; name: string }> {
  // 캐시된 토큰이 유효하면 재사용 (30초 버퍼)
  if (cachedToken && Date.now() < tokenExpiry - 30_000) {
    return { token: cachedToken, email: '', name: '' };
  }

  const res = await monitoredFetch(GOOGLE_AUTH_URL, {
    headers: { ...DEFAULT_HEADERS, 'Cookie': cookie },
  });

  if (!res.ok) {
    throw new Error(`Google 인증 실패 (${res.status})`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Google 세션 에러: ${data.error} — 쿠키를 갱신해주세요`);
  }

  if (!data.access_token) {
    throw new Error('Google access_token이 없습니다. 쿠키가 만료되었을 수 있습니다.');
  }

  cachedToken = data.access_token;
  tokenExpiry = new Date(data.expires).getTime();

  return {
    token: data.access_token,
    email: data.user?.email || '',
    name: data.user?.name || '',
  };
}

/** Google 쿠키 유효성 검증 (세션 확인만, 이미지 생성 안 함) */
export async function validateGoogleCookie(cookie: string): Promise<{ valid: boolean; email: string; name: string }> {
  try {
    const { email, name } = await getGoogleAccessToken(cookie);
    return { valid: true, email, name };
  } catch {
    cachedToken = null;
    tokenExpiry = 0;
    return { valid: false, email: '', name: '' };
  }
}

/** 토큰 캐시 무효화 (쿠키 변경 시) */
export function invalidateGoogleToken(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Google ImageFX로 이미지 생성 (Imagen 3.5)
 * @returns base64 인코딩된 이미지 (data:image/... 또는 순수 base64)
 */
export async function generateGoogleImage(
  prompt: string,
  aspectRatio: string,
  cookie: string,
): Promise<{ base64: string; mediaId: string; seed: number }> {
  const { token } = await getGoogleAccessToken(cookie);

  const googleAspect = ASPECT_RATIO_MAP[aspectRatio] || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

  logger.info('[Google ImageFX] 이미지 생성 요청', { prompt: prompt.slice(0, 50), aspectRatio: googleAspect });

  const body = {
    userInput: {
      candidatesCount: 1,
      prompts: [prompt],
      seed: 0,
    },
    clientContext: {
      sessionId: `;${Date.now()}`,
      tool: 'IMAGE_FX',
    },
    modelInput: {
      modelNameType: 'IMAGEN_3_5',
    },
    aspectRatio: googleAspect,
  };

  const res = await monitoredFetch(GOOGLE_IMAGEFX_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'Cookie': cookie,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    // 쿠키 만료 감지
    if (res.status === 401 || res.status === 403) {
      invalidateGoogleToken();
      throw new Error('Google 쿠키가 만료되었습니다. 쿠키를 갱신해주세요.');
    }
    throw new Error(`Google ImageFX 생성 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const images = data?.imagePanels?.[0]?.generatedImages;

  if (!images || images.length === 0) {
    throw new Error('Google ImageFX: 이미지가 생성되지 않았습니다.');
  }

  const img = images[0];
  let base64 = img.encodedImage || '';

  // data: 접두사가 없으면 추가
  if (base64 && !base64.startsWith('data:')) {
    const mime = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    base64 = `data:${mime};base64,${base64}`;
  }

  logger.success('[Google ImageFX] 이미지 생성 성공', {
    size: `${(base64.length / 1024).toFixed(0)}KB`,
    mediaId: img.mediaGenerationId?.slice(0, 20),
  });

  return {
    base64,
    mediaId: img.mediaGenerationId || '',
    seed: img.seed || 0,
  };
}
