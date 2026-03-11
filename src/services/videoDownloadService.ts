/**
 * Video Download Service — 딸깍 영상 제작
 * 해외 쇼핑 영상 다운로드 (TikTok / Douyin / Xiaohongshu)
 *
 * 우선순위:
 * 1. cobalt 인증 인스턴스 (Turnstile + 비인증 폴백)
 * 2. 사용자 설정 프록시 엔드포인트
 * 3. 로컬 파일 업로드 (항상 가능한 폴백)
 */

import { logger } from './LoggerService';
import { cobaltDownloadUrl } from './cobaltAuthService';

export type VideoPlatform = 'douyin' | 'tiktok' | 'xiaohongshu' | 'unknown';

interface DownloadOptions {
  proxyUrl?: string;
}

interface DownloadResult {
  blob: Blob;
  filename: string;
  source: 'cobalt' | 'proxy' | 'direct';
}

const PLATFORM_PATTERNS: { platform: VideoPlatform; patterns: RegExp[] }[] = [
  {
    platform: 'douyin',
    patterns: [
      /douyin\.com/i,
      /iesdouyin\.com/i,
      /v\.douyin\.com/i,
    ],
  },
  {
    platform: 'tiktok',
    patterns: [
      /tiktok\.com/i,
      /vm\.tiktok\.com/i,
      /vt\.tiktok\.com/i,
    ],
  },
  {
    platform: 'xiaohongshu',
    patterns: [
      /xiaohongshu\.com/i,
      /xhslink\.com/i,
      /xhs\.cn/i,
    ],
  },
];

/** URL → 플랫폼 감지 */
export const detectPlatform = (url: string): VideoPlatform => {
  if (!url) return 'unknown';
  for (const { platform, patterns } of PLATFORM_PATTERNS) {
    if (patterns.some(p => p.test(url))) return platform;
  }
  return 'unknown';
};

/** URL 유효성 검증 */
export const validateVideoUrl = (url: string): { valid: boolean; message?: string } => {
  if (!url.trim()) return { valid: false, message: 'URL을 입력해주세요.' };
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!parsed.hostname) return { valid: false, message: '올바른 URL이 아닙니다.' };
    return { valid: true };
  } catch {
    return { valid: false, message: '올바른 URL 형식이 아닙니다.' };
  }
};

/** 플랫폼 표시 정보 */
export const getPlatformInfo = (platform: VideoPlatform): { label: string; color: string } => {
  switch (platform) {
    case 'douyin': return { label: '더우인', color: 'text-pink-400' };
    case 'tiktok': return { label: 'TikTok', color: 'text-cyan-400' };
    case 'xiaohongshu': return { label: '샤오홍슈', color: 'text-red-400' };
    default: return { label: '기타', color: 'text-gray-400' };
  }
};

/** cobalt 인증 인스턴스로 다운로드 (Turnstile + 비인증 폴백) */
const downloadFromCobalt = async (url: string): Promise<DownloadResult> => {
  logger.info('[VideoDownload] cobalt 인증 인스턴스 시도', { url });

  const result = await cobaltDownloadUrl(url);
  if (!result) throw new Error('cobalt: 모든 인스턴스 실패');

  // cobalt가 반환한 tunnel/redirect URL에서 영상 다운로드
  const videoRes = await fetch(result.url, { signal: AbortSignal.timeout(60_000) });
  if (!videoRes.ok) throw new Error(`영상 다운로드 실패 (${videoRes.status})`);

  const blob = await videoRes.blob();
  logger.success('[VideoDownload] cobalt 성공', { size: blob.size });
  return { blob, filename: result.filename, source: 'cobalt' };
};

/** 프록시 엔드포인트로 다운로드 시도 */
const downloadFromProxy = async (url: string, proxyUrl: string): Promise<DownloadResult> => {
  logger.info('[VideoDownload] 프록시 시도', { url, proxyUrl });

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) throw new Error(`프록시 오류 (${res.status})`);

  const contentType = res.headers.get('content-type') || '';

  // JSON 응답 (다운로드 URL 반환)
  if (contentType.includes('application/json')) {
    const data = await res.json();
    const videoUrl = data.url || data.download_url || data.videoUrl;
    if (!videoUrl) throw new Error('프록시: 다운로드 URL 없음');

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`프록시 영상 다운로드 실패 (${videoRes.status})`);
    const blob = await videoRes.blob();
    return { blob, filename: data.filename || 'proxy-download.mp4', source: 'proxy' };
  }

  // 바이너리 응답 (직접 비디오 반환)
  const blob = await res.blob();
  return { blob, filename: 'proxy-download.mp4', source: 'proxy' };
};

/**
 * URL → Blob 다운로드
 * cobalt → 프록시 → 실패 시 에러 (파일 업로드 폴백은 UI에서 안내)
 */
export const downloadFromUrl = async (
  url: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> => {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

  // 1. cobalt.tools
  try {
    return await downloadFromCobalt(normalizedUrl);
  } catch (e) {
    logger.warn('[VideoDownload] cobalt 실패, 프록시 폴백', { error: (e as Error).message });
  }

  // 2. 프록시
  if (options.proxyUrl) {
    try {
      return await downloadFromProxy(normalizedUrl, options.proxyUrl);
    } catch (e) {
      logger.warn('[VideoDownload] 프록시 실패', { error: (e as Error).message });
    }
  }

  throw new Error(
    '영상 다운로드에 실패했습니다. 프록시를 설정하거나 파일을 직접 업로드해주세요.'
  );
};

/** File → ShoppingSourceVideo metadata 추출 */
export const extractVideoMetadata = (
  file: File
): Promise<{ duration: number; width: number; height: number; thumbnailDataUrl: string }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.muted = true;
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(objectUrl);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        thumbnailDataUrl,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('영상 메타데이터를 읽을 수 없습니다.'));
    };
  });
};

/** Blob → video metadata 추출 */
export const extractBlobVideoMetadata = (
  blob: Blob
): Promise<{ duration: number; width: number; height: number; thumbnailDataUrl: string }> => {
  const file = new File([blob], 'download.mp4', { type: blob.type || 'video/mp4' });
  return extractVideoMetadata(file);
};
