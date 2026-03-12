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
const DEFAULT_API_URL = 'http://175.126.73.193:3100';
const DEFAULT_API_KEY = 'bf9ce5c9b531c42a2dd6dcec61cff6c3eead93f20ba35365d3411ddf783dccb1';

function getApiBaseUrl(): string {
  try {
    return localStorage.getItem('YTDLP_API_URL') || DEFAULT_API_URL;
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:getApiBaseUrl', e);
    return DEFAULT_API_URL;
  }
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
  return !!url && url.startsWith('http');
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
 * YouTube 영상을 브라우저 내비게이션으로 직접 다운로드합니다.
 * Method A: 서버는 CDN URL만 반환 → 브라우저가 CDN에서 직접 다운로드 → 서버 대역폭 0
 *
 * @param youtubeUrl - YouTube URL 또는 VIDEO_ID
 * @param quality - 화질 (기본: '720p')
 * @param title - 파일명에 사용할 제목 (선택)
 * @returns 추출된 스트림 정보
 */
export async function triggerDirectDownload(
  youtubeUrl: string,
  quality: VideoQuality = '720p',
  title?: string,
): Promise<YtdlpStreamResult> {
  const info = await extractStreamUrl(youtubeUrl, quality);

  const safeTitle = (title || info.title || 'download')
    .replace(/[<>:"/\\|?*]/g, '')
    .substring(0, 80);

  // <a> 태그 내비게이션 — CORS 우회, 서버 대역폭 0
  const a = document.createElement('a');
  a.href = info.url;
  a.download = `${safeTitle}.mp4`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);

  return info;
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
): Promise<{ blob: Blob; info: YtdlpStreamResult }> {
  // 메타데이터 조회 (캐시 적중)
  const info = await extractStreamUrl(youtubeUrl, quality);

  // 서버 프록시 엔드포인트로 다운로드 — Content-Disposition: attachment 헤더 포함
  const baseUrl = getApiBaseUrl();
  const apiKey = getApiKey();
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${quality}`;

  const response = await monitoredFetch(proxyUrl, {
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`프록시 다운로드 실패 (HTTP ${response.status})`);
  }

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

    return { blob: new Blob(chunks, { type: 'video/mp4' }), info };
  }

  return { blob: await response.blob(), info };
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
