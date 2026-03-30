/**
 * ytdlpApiService.ts
 *
 * 자체 호스팅 yt-dlp API 서버와 통신하는 프론트엔드 서비스.
 * 로컬 컴패니언 앱 → VPS 프록시 순서로 자동 전환합니다.
 *
 * 아키텍처 (우선순위):
 *   1순위: 브라우저 → localhost 컴패니언 앱(yt-dlp 로컬) → YouTube CDN 직접 (YouPlayer급)
 *   2순위: 브라우저 → Cloudflare → VPS(yt-dlp) → YouTube CDN (기존 폴백)
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

/** 로컬 컴패니언 앱 URL (YouPlayer급 안정성 — yt-dlp 로컬 실행) */
const LOCAL_COMPANION_URL = 'http://localhost:9876';

// ──────────────────────────────────────────────
// 로컬 컴패니언 앱 감지 (캐시 + 주기적 재검증)
// ──────────────────────────────────────────────

let _companionAvailable: boolean | null = null;
let _companionCheckTime = 0;
let _companionVersion: string | null = null;
let _companionCheckPromise: Promise<boolean> | null = null; // inflight 중복 방지
const COMPANION_CHECK_INTERVAL_MS = 30_000; // 30초마다 재검증
const COMPANION_HEALTH_TIMEOUT_MS = 3000;   // [FIX #907] 3초 — 800ms는 너무 짧아 실행 중인 컴패니언도 미감지

/** 로컬 컴패니언 앱이 실행 중인지 확인 (캐시 + 비동기 + inflight 중복 방지) */
async function isCompanionAvailable(): Promise<boolean> {
  const now = Date.now();
  // 캐시 유효 → 즉시 반환
  if (_companionAvailable !== null && (now - _companionCheckTime) < COMPANION_CHECK_INTERVAL_MS) {
    return _companionAvailable;
  }
  // 이미 진행 중인 health check가 있으면 그 결과를 공유
  if (_companionCheckPromise) return _companionCheckPromise;

  _companionCheckPromise = _doCompanionCheck(now).finally(() => {
    _companionCheckPromise = null;
  });
  return _companionCheckPromise;
}

async function _doCompanionCheck(now: number): Promise<boolean> {

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), COMPANION_HEALTH_TIMEOUT_MS);
    const res = await fetch(`${LOCAL_COMPANION_URL}/health`, {
      signal: controller.signal,
      mode: 'cors',
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => null);
      // 서명 핸드셰이크: 컴패니언 앱만이 반환하는 식별 헤더/필드 확인
      if (!data || data.app !== 'ytdlp-companion') {
        // 알 수 없는 localhost 서비스 → 신뢰하지 않음
        _companionAvailable = false;
        _companionCheckTime = now;
        return false;
      }
      _companionAvailable = true;
      _companionCheckTime = now;
      _companionVersion = data?.version || null;
      logger.info(`[Companion] 로컬 헬퍼 감지됨 (v${data?.version || '?'}, yt-dlp ${data?.ytdlpVersion || '?'})`);
      return true;
    }
  } catch (err) {
    // [FIX #907] 실패 원인 명시 로깅 — 디버깅용
    const reason = err instanceof Error
      ? (err.name === 'AbortError' ? 'timeout(3s)' : err.message)
      : 'unknown';
    logger.info(`[Companion] health check 실패: ${reason}`);
  }

  _companionAvailable = false;
  _companionCheckTime = now;
  return false;
}

/** 동기 버전 — 마지막 캐시된 결과 반환 (UI 즉시 표시용) */
export function isCompanionDetected(): boolean {
  return _companionAvailable === true;
}

/** 현재 실행 중인 컴패니언 버전 반환 (health check에서 캐시) */
export function getCompanionVersion(): string | null {
  return _companionVersion;
}

/** 컴패니언 상태 강제 재확인 (설정 페이지 등에서 수동 호출) */
export async function recheckCompanion(): Promise<boolean> {
  _companionAvailable = null;
  _companionCheckTime = 0;
  return isCompanionAvailable();
}

/**
 * [FIX #907] 컴패니언 강제 확보 — 3회 재시도 + URL 스킴 강제 실행 + 재시도
 * NLE 내보내기 등 컴패니언이 반드시 필요한 경로에서 사용.
 * 최종 실패 시 false 반환 (CF Worker 폴백 허용).
 */
export async function ensureCompanionAvailable(signal?: AbortSignal): Promise<boolean> {
  const abortSleep = (ms: number) => new Promise<void>(resolve => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  // 이미 감지됨 → 즉시 리턴
  if (_companionAvailable === true && (Date.now() - _companionCheckTime) < COMPANION_CHECK_INTERVAL_MS) {
    return true;
  }

  // 1단계: 즉시 health check (2회 재시도, 1초 간격) — 최대 ~2.8초
  for (let i = 0; i < 2; i++) {
    if (signal?.aborted) return false;
    _companionAvailable = null;
    _companionCheckTime = 0;
    if (await isCompanionAvailable()) {
      logger.info('[Companion] 감지 성공 (시도 ' + (i + 1) + '/2)');
      return true;
    }
    if (i < 1) await abortSleep(1000);
  }

  // 2단계: 재검증 대기 (컴패니언이 방금 시작됐을 수 있음) — 최대 ~3초
  if (signal?.aborted) return false;
  logger.info('[Companion] 감지 실패 → 재검증 대기 (3초)');
  await abortSleep(3000);
  for (let i = 0; i < 2; i++) {
    if (signal?.aborted) return false;
    _companionAvailable = null;
    _companionCheckTime = 0;
    if (await isCompanionAvailable()) {
      logger.info('[Companion] URL 스킴 실행 후 감지 성공');
      return true;
    }
    if (i < 1) await abortSleep(1000);
  }

  logger.info('[Companion] 강제 실행 실패 — CF Worker 폴백');
  return false;
}

/** [FIX #907] 앱 시작 시 백그라운드 컴패니언 감지 + 미감지 시 지속 폴링 */
function initCompanionDetection(): void {
  if (typeof window === 'undefined') return;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const tryDetect = async () => {
    // 캐시 무시 — 실제 health check 강제
    _companionAvailable = null;
    _companionCheckTime = 0;
    const found = await isCompanionAvailable().catch(() => false);
    if (found && pollInterval) {
      // 감지 성공 → 폴링 중단 (이후 30초 캐시로 충분)
      clearInterval(pollInterval);
      pollInterval = null;
      logger.info('[Companion] 백그라운드 폴링으로 감지 성공 — 폴링 중단');
    }
    return found;
  };

  // 500ms 후 첫 감지
  setTimeout(async () => {
    const found = await tryDetect();
    if (!found) {
      // 미감지 → 10초마다 폴링 (컴패니언이 나중에 실행될 수 있음)
      pollInterval = setInterval(tryDetect, 10_000);
      logger.info('[Companion] 미감지 — 10초 간격 백그라운드 폴링 시작');
    }
  }, 500);
}

// 모듈 로드 시 자동 실행
initCompanionDetection();

// ──────────────────────────────────────────────
// API Base URL 결정 — 하이브리드 라우팅
// ──────────────────────────────────────────────
// URL 추출(extract/info/metadata) → VPS가 빠름 (캐시, 프로세스 풀)
// 대용량 전송(download/frames)     → 컴패니언이 빠름 (로컬 직통)

type RequestPurpose = 'lightweight' | 'heavy';

/** 비동기 버전 — 용도에 따라 최적 서버 선택 */
async function getApiBaseUrlAsync(purpose: RequestPurpose = 'lightweight'): Promise<string> {
  try {
    const stored = localStorage.getItem('YTDLP_API_URL');
    if (stored) return stored;
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:getApiBaseUrlAsync', e);
  }

  const companionUp = await isCompanionAvailable();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const vpsUrl = isHttps ? DEFAULT_PROXY_URL : DEFAULT_DIRECT_URL;

  if (purpose === 'heavy') {
    // 대용량 전송: 컴패니언 우선 (로컬 직통, 대역폭 무제한)
    return companionUp ? LOCAL_COMPANION_URL : vpsUrl;
  }

  // 경량 요청: VPS 우선 (캐시, 빠름), VPS 실패 시 컴패니언 폴백
  return vpsUrl;
}

/** 동기 버전 — 캐시된 컴패니언 상태 기반 (즉시 반환, 다운로드는 컴패니언 우선) */
function getApiBaseUrl(purpose: RequestPurpose = 'heavy'): string {
  try {
    const stored = localStorage.getItem('YTDLP_API_URL');
    if (stored) return stored;
  } catch (e) {
    logger.trackSwallowedError('ytdlpApiService:getApiBaseUrl', e);
  }

  // heavy(다운로드): 컴패니언 우선
  // lightweight(추출): VPS 우선
  if (purpose === 'heavy' && _companionAvailable === true) {
    return LOCAL_COMPANION_URL;
  }

  // 2순위: HTTPS → Cloudflare Worker 프록시
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return DEFAULT_PROXY_URL;
  }
  // 3순위: HTTP → VPS 직접
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

interface DownloadVideoViaProxyOptions {
  videoOnly?: boolean;
  signal?: AbortSignal;
}

interface DownloadSocialVideoOptions {
  signal?: AbortSignal;
}

interface CombinedAbortSignalContext {
  signal: AbortSignal;
  didTimeout: () => boolean;
  didExternalAbort: () => boolean;
  dispose: () => void;
}

const ABORT_ERROR_NAME = 'AbortError';

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', ABORT_ERROR_NAME);
  }
  const error = new Error('The operation was aborted.');
  error.name = ABORT_ERROR_NAME;
  return error;
}

function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === ABORT_ERROR_NAME;
  }
  if (error instanceof Error) {
    return error.name === ABORT_ERROR_NAME || /aborted|abort/i.test(error.message);
  }
  return false;
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createCombinedAbortSignalContext(externalSignal: AbortSignal | undefined, timeoutMs: number): CombinedAbortSignalContext {
  let timedOut = false;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  if (!externalSignal) {
    return {
      signal: timeoutController.signal,
      didTimeout: () => timedOut,
      didExternalAbort: () => false,
      dispose: () => clearTimeout(timeoutId),
    };
  }

  const abortSignalAny = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof abortSignalAny === 'function') {
    return {
      signal: abortSignalAny([externalSignal, timeoutController.signal]),
      didTimeout: () => timedOut,
      didExternalAbort: () => externalSignal.aborted,
      dispose: () => clearTimeout(timeoutId),
    };
  }

  const bridgeController = new AbortController();
  const onExternalAbort = () => bridgeController.abort();
  const onTimeoutAbort = () => bridgeController.abort();

  if (externalSignal.aborted || timeoutController.signal.aborted) {
    bridgeController.abort();
  }
  externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  return {
    signal: bridgeController.signal,
    didTimeout: () => timedOut,
    didExternalAbort: () => externalSignal.aborted,
    dispose: () => {
      clearTimeout(timeoutId);
      externalSignal.removeEventListener('abort', onExternalAbort);
      timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
    },
  };
}

// ──────────────────────────────────────────────
// API 호출 헬퍼
// ──────────────────────────────────────────────

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  const hasCustom = (() => { try { return !!localStorage.getItem('YTDLP_API_URL'); } catch { return false; } })();

  // 경량 요청(extract/info/metadata) → VPS 우선 (캐시, 빠름), 컴패니언 폴백
  const servers: { url: string; needsKey: boolean }[] = [];
  if (hasCustom) {
    const customUrl = await getApiBaseUrlAsync('lightweight');
    servers.push({ url: customUrl, needsKey: customUrl !== LOCAL_COMPANION_URL });
  } else {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    // VPS 우선 (경량 요청은 캐시/프로세스 풀 덕에 빠름)
    servers.push({ url: DEFAULT_PROXY_URL, needsKey: true });
    if (!isHttps) {
      servers.push({ url: DEFAULT_DIRECT_URL, needsKey: true });
    }
    // VPS 전부 실패 시 컴패니언 폴백
    if (await isCompanionAvailable()) {
      servers.push({ url: LOCAL_COMPANION_URL, needsKey: false });
    }
  }

  if (servers.length === 0) {
    throw new Error('yt-dlp API 서버가 설정되지 않았습니다. 설정에서 서버 주소를 입력해주세요.');
  }

  let lastError: Error | null = null;
  for (const server of servers) {
    const fullUrl = `${server.url.replace(/\/$/, '')}${path}`;
    try {
      const response = await monitoredFetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(server.needsKey && apiKey ? { 'X-API-Key': apiKey } : {}),
          ...(options?.headers as Record<string, string> || {}),
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `서버 오류 (${response.status})`);
      }

      return response.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // 컴패니언 실패 시 상태 무효화
      if (server.url === LOCAL_COMPANION_URL) {
        _companionAvailable = false;
        _companionCheckTime = Date.now();
        logger.warn('[Companion] API 요청 실패 — 다음 서버로 폴백:', lastError.message);
      }
      // 커스텀 URL이면 폴백 없이 즉시 throw
      if (hasCustom) throw lastError;
    }
  }
  throw lastError || new Error('yt-dlp API 요청 실패 (모든 서버 시도 소진)');
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
 * YouTube 영상을 컴패니언/VPS 프록시 경유로 다운로드합니다.
 * yt-dlp의 안티-쓰로틀링 + ffmpeg 합성 → 안정적 다운로드
 *
 * ⚠️ CDN URL 직접 다운로드는 YouTube 쓰로틀링으로 오히려 느림 (실측: 프록시 대비 0.5배)
 * yt-dlp 프록시가 안티-쓰로틀링 + 병렬 다운로드를 내부 처리하므로 더 빠름
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
  // 컴패니언 우선 (캐시 기반 동기 판단)
  const baseUrl = getApiBaseUrl();
  const isCompanion = baseUrl === LOCAL_COMPANION_URL;
  const apiKey = getApiKey();

  // 컴패니언은 API 키 불필요
  const keyParam = isCompanion ? '' : `&key=${encodeURIComponent(apiKey)}`;
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${quality}${keyParam}`;

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
  options?: DownloadVideoViaProxyOptions,
): Promise<{ blob: Blob; info: YtdlpStreamResult }> {
  // [FIX #316] 재시도 + 화질 다운그레이드 — 무슨 수를 써서라도 다운로드
  const MAX_RETRIES = 3;
  const videoOnly = options?.videoOnly ?? false;
  const externalSignal = options?.signal;
  const QUALITY_FALLBACK: VideoQuality[] = [quality, '720p', '480p', '360p'];
  const qualities = [...new Set(QUALITY_FALLBACK)];

  let lastError: Error | null = null;
  let lastGoodInfo: YtdlpStreamResult | null = null;

  for (const q of qualities) {
    if (externalSignal?.aborted) {
      throw createAbortError();
    }
    // [FIX] 10초 타임아웃 — extract hang 시 다운로드 진행 보장
    const info = await Promise.race([
      extractStreamUrl(youtubeUrl, q).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
    ]);
    if (info) lastGoodInfo = info;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (externalSignal?.aborted) {
        throw createAbortError();
      }
      const abortContext = createCombinedAbortSignalContext(externalSignal, 600_000);
      const dlBaseUrl = await getApiBaseUrlAsync('heavy');
      const isCompanionDl = dlBaseUrl === LOCAL_COMPANION_URL;
      try {
        const baseUrl = dlBaseUrl;
        const isCompanion = isCompanionDl;
        const apiKey = getApiKey();
        const videoOnlyParam = videoOnly ? '&videoOnly=true' : '';
        const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${q}${videoOnlyParam}`;

        const response = await monitoredFetch(proxyUrl, {
          headers: !isCompanion && apiKey ? { 'X-API-Key': apiKey } : {},
          signal: abortContext.signal,
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
          let lastProgress = 0;
          const reportProgress = (value: number) => {
            const clamped = Math.max(0, Math.min(1, value));
            if (clamped >= 1 || clamped - lastProgress >= 0.01) {
              lastProgress = clamped;
              onProgress(clamped);
            }
          };

          try {
            while (true) {
              if (abortContext.signal.aborted) {
                throw createAbortError();
              }
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              received += (value as Uint8Array).length;
              if (contentLength > 0) {
                reportProgress(received / contentLength);
              } else {
                // Content-Length가 없으면 byte 누적 기반 의사 진행률(최대 95%) 표시
                // 초반 급상승을 피하기 위해 완만한 지수 함수 사용
                const pseudoProgress = Math.min(
                  0.95,
                  0.05 + (1 - Math.exp(-received / (1024 * 1024 * 20))) * 0.9,
                );
                reportProgress(pseudoProgress);
              }
            }
          } catch (streamError) {
            try {
              await reader.cancel();
            } catch (cancelError) {
              logger.trackSwallowedError('ytdlpApiService:downloadVideoViaProxy:reader.cancel', cancelError);
            }
            throw streamError;
          }

          reportProgress(1);
          return { blob: new Blob(chunks, { type: 'video/mp4' }), info: info || defaultInfo };
        }

        const blob = await response.blob();
        if (onProgress) onProgress(1);
        return { blob, info: info || defaultInfo };
      } catch (e) {
        if (abortContext.didExternalAbort() || externalSignal?.aborted) {
          throw createAbortError();
        }

        if (isAbortError(e) && !abortContext.didTimeout()) {
          throw e instanceof Error ? e : new Error(String(e));
        }

        lastError = abortContext.didTimeout()
          ? new Error('프록시 다운로드 시간 초과')
          : (e instanceof Error ? e : new Error(String(e)));
        // 컴패니언 실패 시 즉시 상태 무효화 → 다음 재시도는 VPS로
        if (isCompanionDl && _companionAvailable) {
          _companionAvailable = false;
          _companionCheckTime = Date.now();
          logger.warn('[Companion] 다운로드 실패 — VPS 폴백 전환');
        }
        const isRateLimit = lastError.message.includes('429');
        const isRetryable = abortContext.didTimeout()
          || isRateLimit
          || lastError.message.includes('502')
          || lastError.message.includes('503')
          || lastError.message.includes('504')
          || lastError.message.includes('Network')
          || lastError.message.includes('fetch');
        if (!isRetryable) break;
        if (attempt >= MAX_RETRIES - 1) break;
        // [FIX #567] 429 → retryAfter 기반 대기 (최소 5초 지수 백오프), 일반 에러 → 3초 기반
        const delay = isRateLimit
          ? 5000 * Math.pow(2, attempt) + Math.random() * 2000
          : 3000 * Math.pow(2, attempt) + Math.random() * 2000;
        logger.trackRetry(`downloadVideoViaProxy(${q})`, attempt + 1, MAX_RETRIES, `${lastError.message}, ${Math.round(delay)}ms 대기`);
        await sleepWithSignal(delay, externalSignal);
      } finally {
        abortContext.dispose();
      }
    }
    if (q !== qualities[qualities.length - 1]) {
      logger.info(`[Download] ${q} 실패, 화질 다운그레이드 시도...`);
    }
  }

  // [FIX #702] Cloudflare Worker 프록시 전부 실패 시 직접 VPS 서버 폴백
  // 커스텀 URL 사용 중이면 기본 VPS로 폴백하지 않음 (키 누출 방지)
  const hasCustomUrlDl = (() => { try { return !!localStorage.getItem('YTDLP_API_URL'); } catch { return false; } })();
  const directVpsUrl = DEFAULT_DIRECT_URL;
  const currentBaseUrl = getApiBaseUrl();
  if (!hasCustomUrlDl && directVpsUrl && currentBaseUrl !== directVpsUrl) {
    logger.info('[Download] Cloudflare 프록시 전부 실패 — VPS 직접 접속 폴백 시도');
    const defaultInfo: YtdlpStreamResult = { url: '', audioUrl: null, title: '', duration: 0, thumbnail: '', width: 0, height: 0, filesize: null, format: quality, codec: '', cached: false };
    for (const q of ['360p', '480p'] as VideoQuality[]) {
      if (externalSignal?.aborted) throw createAbortError();
      const abortContext = createCombinedAbortSignalContext(externalSignal, 600_000);
      try {
        const apiKey = getApiKey();
        const videoOnlyParam = videoOnly ? '&videoOnly=true' : '';
        const directUrl = `${directVpsUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=${q}${videoOnlyParam}`;

        const response = await monitoredFetch(directUrl, {
          headers: apiKey ? { 'X-API-Key': apiKey } : {},
          signal: abortContext.signal,
        });

        if (!response.ok) continue;

        const blob = await response.blob();
        if (blob.size > 0) {
          logger.success(`[Download] VPS 직접 폴백 성공 (${q}, ${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
          if (onProgress) onProgress(1);
          return { blob, info: lastGoodInfo || defaultInfo };
        }
      } catch (vpsErr) {
        if (externalSignal?.aborted) throw createAbortError();
        logger.warn(`[Download] VPS 직접 폴백 실패 (${q}):`, vpsErr instanceof Error ? vpsErr.message : '');
      } finally {
        abortContext.dispose();
      }
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
  const baseUrl = await getApiBaseUrlAsync('heavy');
  const isCompanion = baseUrl === LOCAL_COMPANION_URL;
  const apiKey = getApiKey();
  const proxyUrl = `${baseUrl.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=audio`;

  // [FIX #567] 429 재시도 — 서버 과부하 시 retryAfter 기반 대기
  // [FIX #702] try-catch로 감싸서 네트워크 에러/타임아웃 시에도 VPS 폴백 도달 가능
  const MAX_RETRIES = 3;
  let proxyLastError: Error | null = null;
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await monitoredFetch(proxyUrl, {
          headers: !isCompanion && apiKey ? { 'X-API-Key': apiKey } : {},
          signal: AbortSignal.timeout(120_000),
        });

        if (response.ok) return response.blob();

        // [FIX #702] 502/503/504도 재시도 대상으로 추가 — Cloudflare Worker 프록시 일시적 장애 대응
        const isRetryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
        if (isRetryable && attempt < MAX_RETRIES - 1) {
          const delay = response.status === 429
            ? 5000 * Math.pow(2, attempt) + Math.random() * 2000
            : 3000 * Math.pow(2, attempt) + Math.random() * 2000;
          logger.trackRetry('downloadAudioViaProxy', attempt + 1, MAX_RETRIES, `${response.status}, ${Math.round(delay)}ms 대기`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        proxyLastError = new Error(`오디오 다운로드 실패 (HTTP ${response.status})`);
        // 비 재시도 에러(400/401/404 등)는 즉시 루프 탈출
        break;
      } catch (fetchErr) {
        proxyLastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
        if (attempt < MAX_RETRIES - 1) {
          const delay = 3000 * Math.pow(2, attempt) + Math.random() * 2000;
          logger.trackRetry('downloadAudioViaProxy', attempt + 1, MAX_RETRIES, `${proxyLastError.message}, ${Math.round(delay)}ms 대기`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
    }
  } catch (outerErr) {
    proxyLastError = outerErr instanceof Error ? outerErr : new Error(String(outerErr));
  }

  // [FIX #702+] 1차 서버 전부 실패 → 컴패니언 상태 무효화 + 모든 VPS 폴백 시도
  if (isCompanion) {
    _companionAvailable = false;
    _companionCheckTime = Date.now();
    logger.warn('[AudioDownload] 컴패니언 실패 — VPS 폴백');
  }

  // 커스텀 URL 사용 중이면 기본 서버로 폴백하지 않음 (키 누출 방지)
  const hasCustomUrlAudio = (() => { try { return !!localStorage.getItem('YTDLP_API_URL'); } catch { return false; } })();
  const fallbackUrls: { url: string }[] = [];
  if (!hasCustomUrlAudio) {
    if (baseUrl !== DEFAULT_PROXY_URL) {
      fallbackUrls.push({ url: DEFAULT_PROXY_URL });
    }
    if (baseUrl !== DEFAULT_DIRECT_URL) {
      fallbackUrls.push({ url: DEFAULT_DIRECT_URL });
    }
  }

  for (const fb of fallbackUrls) {
    try {
      logger.info(`[AudioDownload] 폴백 시도 → ${fb.url.includes('workers.dev') ? 'CF Worker' : 'VPS 직접'}`);
      const directUrl = `${fb.url.replace(/\/$/, '')}/api/download?url=${encodeURIComponent(youtubeUrl)}&quality=audio`;
      const response = await monitoredFetch(directUrl, {
        headers: apiKey ? { 'X-API-Key': apiKey } : {},
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        logger.success('[AudioDownload] 폴백 성공');
        return response.blob();
      }
    } catch (fbErr) {
      logger.warn('[AudioDownload] 폴백 실패:', fbErr instanceof Error ? fbErr.message : '');
    }
  }

  throw proxyLastError || new Error('오디오 다운로드 실패 (모든 재시도 소진)');
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
  const baseUrl = await getApiBaseUrlAsync('lightweight');
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
  options?: DownloadSocialVideoOptions,
): Promise<{ blob: Blob; title: string }> {
  const baseUrl = await getApiBaseUrlAsync('heavy');
  const isCompanion = baseUrl === LOCAL_COMPANION_URL;
  const apiKey = getApiKey();

  // 커스텀 URL 설정 시 → 그 서버만 사용 (폴백 없음)
  const hasCustomUrl = (() => { try { return !!localStorage.getItem('YTDLP_API_URL'); } catch { return false; } })();
  const serversToTry: { url: string; needsKey: boolean }[] = [];
  if (hasCustomUrl) {
    serversToTry.push({ url: baseUrl, needsKey: !isCompanion });
  } else {
    if (isCompanion) serversToTry.push({ url: LOCAL_COMPANION_URL, needsKey: false });
    const vpsUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? DEFAULT_PROXY_URL : DEFAULT_DIRECT_URL;
    serversToTry.push({ url: vpsUrl, needsKey: true });
  }

  let lastError: Error | null = null;
  for (const server of serversToTry) {
    if (options?.signal?.aborted) throw createAbortError();
    const proxyUrl = `${server.url.replace(/\/$/, '')}/api/social/download`;
    const abortContext = createCombinedAbortSignalContext(options?.signal, 300_000);

    try {
      const response = await monitoredFetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(server.needsKey && apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({ url, quality }),
        signal: abortContext.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(body.error || `다운로드 실패 (${response.status})`);
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const title = filenameMatch ? decodeURIComponent(filenameMatch[1]).replace(/\.mp4$/, '') : 'download';

      if (onProgress && response.body) {
        const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;

        try {
          while (true) {
            if (abortContext.signal.aborted) throw createAbortError();
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += (value as Uint8Array).length;
            if (contentLength > 0) {
              onProgress(Math.min(1, received / contentLength));
            }
          }
        } catch (streamError) {
          try { await reader.cancel(); } catch (cancelError) {
            logger.trackSwallowedError('ytdlpApiService:downloadSocialVideo:reader.cancel', cancelError);
          }
          throw streamError;
        }

        onProgress(1);
        return { blob: new Blob(chunks, { type: 'video/mp4' }), title };
      }

      const blob = await response.blob();
      if (onProgress) onProgress(1);
      return { blob, title };
    } catch (err) {
      if (options?.signal?.aborted) throw createAbortError();
      lastError = err instanceof Error ? err : new Error(String(err));
      // 컴패니언 실패 → 상태 무효화 후 다음 서버로
      if (server.url === LOCAL_COMPANION_URL) {
        _companionAvailable = false;
        _companionCheckTime = Date.now();
        logger.warn('[Companion] 소셜 다운로드 실패 — VPS 폴백:', lastError.message);
      }
    } finally {
      abortContext.dispose();
    }
  }

  throw lastError || new Error('소셜 다운로드 실패 (모든 서버 시도 소진)');
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
export function getServerConfig(): { apiUrl: string; apiKey: string; companionActive: boolean } {
  return {
    apiUrl: getApiBaseUrl(),
    apiKey: getApiKey(),
    companionActive: _companionAvailable === true,
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

  const limitedTimecodes = timecodes.slice(0, 50);

  // 대용량 전송: 컴패니언 우선
  const baseUrl = await getApiBaseUrlAsync('heavy');
  const isCompanion = baseUrl === LOCAL_COMPANION_URL;
  const apiKey = getApiKey();

  // 커스텀 URL 설정 시 → 그 서버만 사용 (폴백 없음)
  const hasCustomUrl = (() => { try { return !!localStorage.getItem('YTDLP_API_URL'); } catch { return false; } })();
  const serversToTry: { baseUrl: string; needsKey: boolean }[] = [];
  if (hasCustomUrl) {
    serversToTry.push({ baseUrl, needsKey: !isCompanion });
  } else {
    if (isCompanion) serversToTry.push({ baseUrl: LOCAL_COMPANION_URL, needsKey: false });
    const vpsUrl = typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? DEFAULT_PROXY_URL : DEFAULT_DIRECT_URL;
    serversToTry.push({ baseUrl: vpsUrl, needsKey: true });
  }

  for (const server of serversToTry) {
    const framesUrl = `${server.baseUrl.replace(/\/$/, '')}/api/frames`;

    const MAX_FRAME_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_FRAME_RETRIES; attempt++) {
      try {
        const res = await monitoredFetch(framesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(server.needsKey ? { 'X-API-Key': apiKey } : {}),
          },
          body: JSON.stringify({ url: videoId, timecodes: limitedTimecodes, w: width }),
        }, 60000);

        if (res.ok) {
          const data: { frames: ExtractedFrame[] } = await res.json();
          return (data.frames || []).map(f => ({
            url: f.url,
            hdUrl: f.url,
            timeSec: f.t,
          }));
        }

        if (res.status === 429 && attempt < MAX_FRAME_RETRIES) {
          const delay = 5000 * Math.pow(2, attempt) + Math.random() * 2000;
          logger.warn(`[Frame Server] /api/frames 429 — ${Math.round(delay / 1000)}초 후 재시도 (${attempt + 1}/${MAX_FRAME_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // 비 재시도 에러 → 다음 서버로
        break;
      } catch (e) {
        if (attempt < MAX_FRAME_RETRIES) {
          const delay = 5000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break; // 다음 서버로
      }
    }

    // 이 서버 실패 → 컴패니언 상태 무효화
    if (server.baseUrl === LOCAL_COMPANION_URL) {
      _companionAvailable = false;
      _companionCheckTime = Date.now();
      logger.warn('[Companion] 프레임 추출 실패 — VPS 폴백');
    }
  }

  logger.warn('[Frame Server] 모든 서버 실패 (YouTube 썸네일 폴백)');
  return [];
}
