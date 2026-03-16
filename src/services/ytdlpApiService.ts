/**
 * ytdlpApiService.ts
 *
 * 자체 호스팅 yt-dlp API 서버와 통신하는 프론트엔드 서비스.
 * Cobalt 대신 안정적인 YouTube 다운로드를 제공합니다.
 *
 * 아키텍처:
 *   브라우저 → Cloudflare → VPS(yt-dlp) → 스트림 URL 반환
 *                                            ↓
 *   브라우저 ← YouTube CDN에서 직접 다운로드 ←──┘
 */

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

// ──────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────

/** 기본 서버 설정 — localStorage로 오버라이드 가능 */
const DEFAULT_DIRECT_URL = 'http://175.126.73.193:3100';
const DEFAULT_PROXY_URL = 'https://ytdlp-proxy.groove1027.workers.dev'; // Cloudflare Worker 프록시
const DEFAULT_API_KEY = 'bf9ce5c9b531c42a2dd6dcec61cff6c3eead93f20ba35365d3411ddf783dccb1';

function getApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem('YTDLP_API_URL');
    if (stored) return stored;
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:getApiBaseUrl', e);
  }
  // HTTPS 배포 환경 → Cloudflare Worker 프록시 (Mixed Content 방지)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return DEFAULT_PROXY_URL;
  }
  // HTTP 로컬 개발 → 직접 접속
  return DEFAULT_DIRECT_URL;
}

function getApiKey(): string {
  try {
    return localStorage.getItem('YTDLP_API_KEY') || DEFAULT_API_KEY;
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:getApiKey', e);
    return DEFAULT_API_KEY;
  }
}

/** 서버가 설정되어 있는지 확인 */
export function isYtdlpServerConfigured(): boolean {
  const url = getApiBaseUrl();
  return !!url && (url.startsWith('http') || url.startsWith('/'));
}

// ──────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────

export interface YtdlpStreamResult {
  url: string;
  audioUrl: string | null;
  title: string;
  duration: number;
  thumbnail: string;
  width: number;
  height: number;
  filesize: number | null;
  format: string;
  codec: string;
  cached: boolean;
}

export interface YtdlpVideoInfo {
  videoId: string;
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  channel: string;
  viewCount: number;
  uploadDate: string;
}

export interface YtdlpBatchItem extends YtdlpStreamResult {
  videoId: string;
  error?: string;
}

export interface YtdlpHealthStatus {
  status: string;
  version: string;
  activeRequests: number;
  cacheSize: number;
  uptime: number;
}

export interface SocialComment {
  author: string;
  text: string;
  likeCount: number;
  timestamp: number;
}

export interface SocialMetadata {
  title: string;
  description: string;
  uploader: string;
  platform: string;
  duration: number;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  uploadDate: string;
  comments: SocialComment[];
  commentsError?: string;
  cached?: boolean;
}

export type VideoQuality = 'best' | '1080p' | '720p' | '480p' | '360p' | 'audio';

// ──────────────────────────────────────────────
// API 호출 헬퍼
// ──────────────────────────────────────────────

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('yt-dlp API 서버가 설정되지 않았습니다. 설정에서 서버 주소를 입력해주세요.');
  }

  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  const response = await monitoredFetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error || `서버 오류 (${response.status})`);
  }

  return response.json();
}

// ──────────────────────────────────────────────
// 공개 API
// ──────────────────────────────────────────────

/**
 * YouTube 영상의 스트림 URL을 추출합니다.
 *
 * @param youtubeUrl - YouTube URL 또는 VIDEO_ID
 * @param quality - 화질 (기본: 'best')
 * @returns 스트림 URL 정보
 *
 * @example
 * const result = await extractStreamUrl('https://youtube.com/watch?v=xxx', '720p');
 * // result.url → googlevideo.com CDN URL
 * // 일반 다운로드: triggerDirectDownload() 사용 (CORS 우회, 서버 대역폭 0)
 * // Blob 필요: downloadVideoViaProxy() 사용 (서버 프록시 경유)
 */
export async function extractStreamUrl(
  youtubeUrl: string,
  quality: VideoQuality = 'best',
): Promise<YtdlpStreamResult> {
  return apiCall<YtdlpStreamResult>(
    `/api/extract?url=${encodeURIComponent(youtubeUrl)}&quality=${quality}`,
  );
}

/**
 * YouTube 영상을 서버 프록시 경유로 바로 다운로드합니다.
 * 서버 /api/download → Content-Disposition: attachment → 브라우저가 파일로 저장
 *
 * @param youtubeUrl - YouTube URL 또는 VIDEO_ID
 * @param quality - 화질 (기본: 'best')
 * @param title - 파일명에 사용할 제목 (선택)
 */
export function triggerDirectDownload(
  youtubeUrl: string,
  quality: VideoQuality = 'best',
  _title?: string,
): void {
  const baseUrl = getApiBaseUrl();
  const apiKey = getApiKey();

  // 서버 프록시 URL — Content-Disposition: attachment 헤더로 바로 다운로드
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${quality}&key=${encodeURIComponent(apiKey)}`;

  const a = document.createElement('a');
  a.href = proxyUrl;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}

/**
 * 서버 프록시를 통해 영상을 Blob으로 다운로드합니다.
 * VideoAnalysisRoom 프레임 추출 등 Blob이 반드시 필요한 경우에만 사용.
 * (서버 대역폭 사용 — 일반 다운로드는 triggerDirectDownload 사용)
 *
 * @param youtubeUrl - YouTube URL 또는 VIDEO_ID
 * @param quality - 화질
 * @param onProgress - 진행률 콜백 (0~1)
 */
export async function downloadVideoViaProxy(
  youtubeUrl: string,
  quality: VideoQuality = '720p',
  onProgress?: (progress: number) => void,
  options?: { videoOnly?: boolean },
): Promise<{ blob: Blob; info: YtdlpStreamResult }> {
  // [FIX #316] 재시도 + 화질 다운그레이드 — 무슨 수를 써서라도 다운로드
  const MAX_RETRIES = 3;
  const videoOnly = options?.videoOnly ?? false;
  const QUALITY_FALLBACK: VideoQuality[] = [quality, '720p', '480p', '360p'];
  const qualities = [...new Set(QUALITY_FALLBACK)];

  let lastError: Error | null = null;

  for (const q of qualities) {
    const info = await extractStreamUrl(youtubeUrl, q).catch(() => null);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const baseUrl = getApiBaseUrl();
        const apiKey = getApiKey();
        const videoOnlyParam = videoOnly ? '&videoOnly=true' : '';
        const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${q}${videoOnlyParam}`;

        const response = await monitoredFetch(proxyUrl, {
          headers: apiKey ? { 'X-API-Key': apiKey } : {},
          signal: AbortSignal.timeout(600_000),
        });

        if (!response.ok) {
          throw new Error(`프록시 다운로드 실패 (HTTP ${response.status})`);
        }

        const defaultInfo: YtdlpStreamResult = { url: '', audioUrl: null, title: '', duration: 0, thumbnail: '', width: 0, height: 0, filesize: null, format: q, codec: '', cached: false };

        if (onProgress && response.body) {
          const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
          const reader = response.body.getReader();
          const chunks: BlobPart[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += (value as Uint8Array).length;
            if (contentLength > 0) {
              onProgress(received / contentLength);
            }
          }

          return { blob: new Blob(chunks, { type: 'video/mp4' }), info: info || defaultInfo };
        }

        return { blob: await response.blob(), info: info || defaultInfo };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const isRetryable = lastError.message.includes('502') || lastError.message.includes('503') || lastError.message.includes('504') || lastError.message.includes('Network') || lastError.message.includes('fetch');
        if (!isRetryable) break;
        const delay = 3000 * Math.pow(2, attempt) + Math.random() * 2000;
        logger.trackRetry(`downloadVideoViaProxy(${q})`, attempt + 1, MAX_RETRIES, `${lastError.message}, ${Math.round(delay)}ms 대기`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    if (q !== qualities[qualities.length - 1]) {
      logger.info(`[Download] ${q} 실패, 화질 다운그레이드 시도...`);
    }
  }

  throw lastError || new Error('프록시 다운로드 실패 (모든 재시도 소진)');
}

/**
 * [FIX #316] 오디오 트랙만 다운로드 (영상+오디오 분리 다운로드 후 클라이언트 머지용)
 */
export async function downloadAudioViaProxy(
  youtubeUrl: string,
): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const apiKey = getApiKey();
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=audio`;

  const response = await monitoredFetch(proxyUrl, {
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
    signal: AbortSignal.timeout(120_000), // 오디오는 작으므로 2분
  });

  if (!response.ok) {
    throw new Error(`오디오 다운로드 실패 (HTTP ${response.status})`);
  }

  return response.blob();
}

/**
 * 여러 영상의 스트림 URL을 한번에 추출합니다.
 *
 * @param urls - YouTube URL 배열 (최대 10개)
 * @param quality - 화질
 */
export async function batchExtract(
  urls: string[],
  quality: VideoQuality = '720p',
): Promise<YtdlpBatchItem[]> {
  const result = await apiCall<{ results: YtdlpBatchItem[] }>('/api/batch', {
    method: 'POST',
    body: JSON.stringify({ urls, quality }),
  });
  return result.results;
}

/**
 * 영상 메타데이터만 조회합니다 (스트림 URL 없이).
 */
export async function getVideoInfo(youtubeUrl: string): Promise<YtdlpVideoInfo> {
  return apiCall<YtdlpVideoInfo>(
    `/api/info?url=${encodeURIComponent(youtubeUrl)}`,
  );
}

/**
 * 서버 상태를 확인합니다.
 */
export async function checkHealth(): Promise<YtdlpHealthStatus> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('서버 주소가 설정되지 않았습니다');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`서버 응답 오류 (${response.status})`);
  }

  return response.json();
}

// ──────────────────────────────────────────────
// 소셜 미디어 API (TikTok, Douyin 등)
// ──────────────────────────────────────────────

/**
 * 소셜 미디어 URL에서 메타데이터(캡션, 댓글 등)를 추출합니다.
 *
 * @param url - TikTok/Douyin/Xiaohongshu 등 소셜 미디어 URL
 * @param includeComments - 댓글 포함 여부 (기본: false)
 */
export async function getSocialMetadata(
  url: string,
  includeComments = false,
): Promise<SocialMetadata> {
  return apiCall<SocialMetadata>('/api/social/metadata', {
    method: 'POST',
    body: JSON.stringify({ url, includeComments }),
  });
}

/**
 * 소셜 미디어 영상을 서버 프록시를 통해 Blob으로 다운로드합니다.
 *
 * @param url - TikTok/Douyin/Xiaohongshu 등 소셜 미디어 URL
 * @param quality - 화질 (기본: '720p')
 * @param onProgress - 진행률 콜백 (0~1)
 */
export async function downloadSocialVideo(
  url: string,
  quality: VideoQuality = '720p',
  onProgress?: (progress: number) => void,
): Promise<{ blob: Blob; title: string }> {
  const baseUrl = getApiBaseUrl();
  const apiKey = getApiKey();
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/social/download`;

  const response = await monitoredFetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: JSON.stringify({ url, quality }),
    signal: AbortSignal.timeout(300_000), // 5분 — 소셜 영상 대응
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error || `다운로드 실패 (${response.status})`);
  }

  // Content-Disposition에서 파일명 추출
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const title = filenameMatch ? decodeURIComponent(filenameMatch[1]).replace(/\.mp4$/, '') : 'download';

  if (onProgress && response.body) {
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += (value as Uint8Array).length;
      if (contentLength > 0) {
        onProgress(received / contentLength);
      }
    }

    return { blob: new Blob(chunks, { type: 'video/mp4' }), title };
  }

  return { blob: await response.blob(), title };
}

/**
 * API 서버 설정을 저장합니다.
 */
export function configureServer(apiUrl: string, apiKey: string): void {
  try {
    if (apiUrl) {
      localStorage.setItem('YTDLP_API_URL', apiUrl.replace(/\/$/, ''));
    } else {
      localStorage.removeItem('YTDLP_API_URL');
    }
    if (apiKey) {
      localStorage.setItem('YTDLP_API_KEY', apiKey);
    } else {
      localStorage.removeItem('YTDLP_API_KEY');
    }
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:configureServer', e);
    // localStorage 접근 불가 시 무시
  }
}

/**
 * 현재 API 서버 설정을 반환합니다.
 */
export function getServerConfig(): { apiUrl: string; apiKey: string } {
  return {
    apiUrl: getApiBaseUrl(),
    apiKey: getApiKey(),
  };
}

// ──────────────────────────────────────────────
// [#340] 서버 사이드 프레임 추출 (ffmpeg 기반 — AI 타임코드 즉시 정밀 프레임)
// ──────────────────────────────────────────────

interface ExtractedFrame {
  t: number;
  url: string; // data:image/jpeg;base64,... or http URL
}

/**
 * 서버에서 특정 타임코드들의 프레임을 배치 추출합니다.
 * VPS의 ffmpeg가 YouTube CDN에서 직접 해당 초의 프레임만 뽑아줍니다.
 *
 * @param videoId YouTube VIDEO_ID
 * @param timecodes 추출할 타임코드 배열 (초 단위)
 * @param width 출력 너비 (기본 640)
 * @returns TimedFrame 호환 배열
 */
export async function fetchFramesFromServer(
  videoId: string,
  timecodes: number[],
  width: number = 640
): Promise<{ url: string; hdUrl: string; timeSec: number }[]> {
  if (timecodes.length === 0) return [];

  const baseUrl = getApiBaseUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl.replace(/\/$/, '')}/api/frames`;

  try {
    const res = await monitoredFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ url: videoId, timecodes, w: width }),
    }, 60000); // 60초 타임아웃

    if (!res.ok) {
      logger.warn(`[Frame Server] /api/frames 실패: ${res.status}`);
      return [];
    }

    const data: { frames: ExtractedFrame[] } = await res.json();
    return (data.frames || []).map(f => ({
      url: f.url,
      hdUrl: f.url,
      timeSec: f.t,
    }));
  } catch (e) {
    logger.warn('[Frame Server] 서버 프레임 추출 실패 (YouTube 썸네일 폴백)', e instanceof Error ? e.message : '');
    return [];
  }
}
