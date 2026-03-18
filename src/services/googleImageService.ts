/**
 * Google ImageFX / Whisk 이미지 생성 서비스
 * - Google 쿠키 기반 무료 이미지 생성 (Imagen 3.5)
 * - Cloudflare Pages Function 프록시 (/api/google-proxy) 경유
 * - CORS 문제 없이 브라우저에서 안전하게 호출
 */

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

const GOOGLE_AUTH_URL = 'https://labs.google/fx/api/auth/session';
const GOOGLE_IMAGEFX_URL = 'https://aisandbox-pa.googleapis.com/v1:runImageFx';
const GOOGLE_WHISK_URL = 'https://aisandbox-pa.googleapis.com/v1/whisk:generateImage';
const GOOGLE_WHISK_RECIPE_URL = 'https://aisandbox-pa.googleapis.com/v1/whisk:runImageRecipe';
const GOOGLE_TRPC_WORKFLOW_URL = 'https://labs.google/fx/api/trpc/media.createOrUpdateWorkflow';
const GOOGLE_TRPC_CAPTION_URL = 'https://labs.google/fx/api/trpc/backbone.captionImage';
const GOOGLE_TRPC_UPLOAD_URL = 'https://labs.google/fx/api/trpc/backbone.uploadImage';
const PROXY_PATH = '/api/google-proxy';

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

function isHttpLikeUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:');
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] || dataUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 변환 실패'));
    reader.readAsDataURL(blob);
  });
}

async function normalizeReferenceImage(ref: string): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    return dataUrlToBase64(trimmed);
  }

  if (isHttpLikeUrl(trimmed)) {
    try {
      const res = await monitoredFetch(trimmed);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      const dataUrl = await blobToDataUrl(blob);
      return dataUrlToBase64(dataUrl);
    } catch {
      return null;
    }
  }

  return trimmed;
}

/** tRPC 응답 포맷 언래핑 — labs.google/fx/api/trpc/* 엔드포인트용 */
function unwrapTrpcResponse(json: Record<string, unknown>): Record<string, unknown> {
  const nested = json?.result as Record<string, unknown> | undefined;
  const data = nested?.data as Record<string, unknown> | undefined;
  const innerJson = data?.json as Record<string, unknown> | undefined;
  return (innerJson?.result || innerJson || json) as Record<string, unknown>;
}

/** Whisk 워크플로 생성 — 이미지 생성 시 필요한 프로젝트 ID 반환 */
async function createWhiskWorkflow(cookie: string): Promise<string> {
  const res = await proxyFetch(GOOGLE_TRPC_WORKFLOW_URL, {
    method: 'POST',
    body: JSON.stringify({
      json: { workflowMetadata: { workflowName: `auto-${Date.now()}` } },
    }),
    cookie,
  });

  if (!res.ok) throw new Error(`Whisk 워크플로 생성 실패 (${res.status})`);
  const data = await res.json();
  const result = unwrapTrpcResponse(data);
  return (result as { workflowId: string }).workflowId;
}

/** 레퍼런스 이미지 캡션 자동 생성 */
async function captionWhiskImage(rawBytes: string, cookie: string, workflowId: string): Promise<string> {
  const res = await proxyFetch(GOOGLE_TRPC_CAPTION_URL, {
    method: 'POST',
    body: JSON.stringify({
      json: {
        clientContext: { workflowId },
        captionInput: {
          candidatesCount: 1,
          mediaInput: {
            mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
            rawBytes,
          },
        },
      },
    }),
    cookie,
  });

  if (!res.ok) throw new Error(`Whisk 캡션 생성 실패 (${res.status})`);
  const data = await res.json();
  const result = unwrapTrpcResponse(data);
  const candidates = (result as { candidates?: { output: string }[] }).candidates;
  return candidates?.[0]?.output || 'reference image';
}

/** 레퍼런스 이미지를 Whisk 서버에 업로드 — mediaGenerationId 반환 */
async function uploadWhiskImage(rawBytes: string, caption: string, workflowId: string, cookie: string): Promise<string> {
  const res = await proxyFetch(GOOGLE_TRPC_UPLOAD_URL, {
    method: 'POST',
    body: JSON.stringify({
      json: {
        clientContext: { workflowId },
        uploadMediaInput: {
          mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
          rawBytes,
          caption,
        },
      },
    }),
    cookie,
  });

  if (!res.ok) throw new Error(`Whisk 이미지 업로드 실패 (${res.status})`);
  const data = await res.json();
  const result = unwrapTrpcResponse(data);
  return (result as { uploadMediaGenerationId: string }).uploadMediaGenerationId;
}

/** Google 쿠키로 Bearer 토큰 발급 */
export async function getGoogleAccessToken(cookie: string): Promise<{ token: string; email: string; name: string }> {
  // 캐시된 토큰이 유효하면 재사용 (30초 버퍼)
  if (cachedToken && Date.now() < tokenExpiry - 30_000) {
    return { token: cachedToken, email: '', name: '' };
  }

  const res = await proxyFetch(GOOGLE_AUTH_URL, { cookie });

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

/** Google 쿠키 유효성 검증 */
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

/** 토큰 캐시 무효화 */
export function invalidateGoogleToken(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Google ImageFX로 이미지 생성 (Imagen 3.5)
 * @returns base64 인코딩된 이미지 (data:image/...)
 */
export async function generateGoogleImage(
  prompt: string,
  aspectRatio: string,
  cookie: string,
): Promise<{ base64: string; mediaId: string; seed: number }> {
  const { token } = await getGoogleAccessToken(cookie);

  const googleAspect = ASPECT_RATIO_MAP[aspectRatio] || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

  logger.info('[Google ImageFX] 이미지 생성 요청', { prompt: prompt.slice(0, 50), aspectRatio: googleAspect });

  const body = JSON.stringify({
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
  });

  const res = await proxyFetch(GOOGLE_IMAGEFX_URL, {
    method: 'POST',
    body,
    cookie,
    token,
  });

  if (!res.ok) {
    const errText = await res.text();
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

/**
 * Google Whisk로 이미지 생성 (2026-03 신규 API 포맷)
 * - 레퍼런스 없으면: v1/whisk:generateImage (워크플로 기반)
 * - 레퍼런스 있으면: v1/whisk:runImageRecipe (업로드 → 레시피 생성)
 */
export async function generateWhiskImage(
  prompt: string,
  aspectRatio: string,
  cookie: string,
  referenceImages?: string[],
): Promise<{ base64: string; mediaId: string; seed: number }> {
  const { token } = await getGoogleAccessToken(cookie);
  const googleAspect = ASPECT_RATIO_MAP[aspectRatio] || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

  logger.info('[Google Whisk] 이미지 생성 요청', {
    prompt: prompt.slice(0, 50),
    aspectRatio: googleAspect,
    refCount: referenceImages?.length || 0,
  });

  // 레퍼런스 이미지가 있으면 multi-step 레시피 생성 사용
  if (referenceImages && referenceImages.length > 0) {
    return generateWhiskWithReferences(prompt, googleAspect, cookie, token, referenceImages);
  }

  // 레퍼런스 없음 → 기본 Whisk 이미지 생성
  const workflowId = await createWhiskWorkflow(cookie);

  const body = JSON.stringify({
    clientContext: { workflowId },
    imageModelSettings: {
      imageModel: 'IMAGEN_3_5',
      aspectRatio: googleAspect,
    },
    seed: 0,
    prompt,
    mediaCategory: 'MEDIA_CATEGORY_BOARD',
  });

  const res = await proxyFetch(GOOGLE_WHISK_URL, {
    method: 'POST',
    body,
    cookie,
    token,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) {
      invalidateGoogleToken();
      throw new Error('Google 쿠키가 만료되었습니다. 쿠키를 갱신해주세요.');
    }
    throw new Error(`Google Whisk 생성 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return parseWhiskImageResponse(data);
}

/** 레퍼런스 이미지 기반 Whisk 레시피 생성 (multi-step) */
async function generateWhiskWithReferences(
  prompt: string,
  googleAspect: string,
  cookie: string,
  token: string,
  referenceImages: string[],
): Promise<{ base64: string; mediaId: string; seed: number }> {
  const workflowId = await createWhiskWorkflow(cookie);

  // 첫 번째 유효한 레퍼런스 이미지 업로드
  const mediaInputs: { caption: string; mediaInput: { mediaCategory: string; mediaGenerationId: string } }[] = [];
  for (const ref of referenceImages) {
    const rawBytes = await normalizeReferenceImage(ref);
    if (!rawBytes) continue;

    const caption = await captionWhiskImage(rawBytes, cookie, workflowId);
    const mediaId = await uploadWhiskImage(rawBytes, caption, workflowId, cookie);
    mediaInputs.push({
      caption,
      mediaInput: {
        mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
        mediaGenerationId: mediaId,
      },
    });
    break; // 첫 번째 유효한 레퍼런스만 사용
  }

  if (mediaInputs.length === 0) {
    throw new Error('Google Whisk: 레퍼런스 이미지를 읽을 수 없습니다. 이미지 URL/파일을 확인해주세요.');
  }

  logger.info('[Google Whisk] 레퍼런스 업로드 완료, 레시피 생성 중...');

  const body = JSON.stringify({
    clientContext: { workflowId, tool: 'BACKBONE' },
    seed: 0,
    imageModelSettings: {
      imageModel: 'GEM_PIX',
      aspectRatio: googleAspect,
    },
    userInstruction: prompt,
    recipeMediaInputs: mediaInputs,
  });

  const res = await proxyFetch(GOOGLE_WHISK_RECIPE_URL, {
    method: 'POST',
    body,
    cookie,
    token,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) {
      invalidateGoogleToken();
      throw new Error('Google 쿠키가 만료되었습니다. 쿠키를 갱신해주세요.');
    }
    throw new Error(`Google Whisk 리믹싱 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const result = parseWhiskImageResponse(data);

  logger.success('[Google Whisk] 레퍼런스 리믹싱 성공', {
    size: `${(result.base64.length / 1024).toFixed(0)}KB`,
  });

  return result;
}

/** Whisk 이미지 응답 파싱 (generateImage / runImageRecipe 공통) */
function parseWhiskImageResponse(data: Record<string, unknown>): { base64: string; mediaId: string; seed: number } {
  const panels = (data as { imagePanels?: { generatedImages?: Record<string, unknown>[] }[] }).imagePanels;
  const images = panels?.[0]?.generatedImages
    || (data as { results?: Record<string, unknown>[] }).results
    || (data as { images?: Record<string, unknown>[] }).images;

  if (!images || images.length === 0) {
    throw new Error('Google Whisk: 이미지가 생성되지 않았습니다.');
  }

  const img = images[0] as Record<string, unknown>;
  let base64 = (img.encodedImage || (img.image as Record<string, unknown>)?.encodedImage || '') as string;

  if (base64 && !base64.startsWith('data:')) {
    const mime = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    base64 = `data:${mime};base64,${base64}`;
  }

  return {
    base64,
    mediaId: (img.mediaGenerationId || img.id || '') as string,
    seed: (img.seed || 0) as number,
  };
}
