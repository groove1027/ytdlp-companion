/**
 * 자료영상 레퍼런스 서비스 v2 — 컴패니언 + Scene Detection + Gemini 영상 직접 분석
 *
 * 파이프라인:
 *   1. YouTube 검색 → 후보 영상 목록
 *   2. 컴패니언 yt-dlp → 영상 다운로드 (360p, 분석용)
 *   3. Scene Detection → 정밀 컷 포인트 감지
 *   4. 자막 추출 (보조 시그널)
 *   5. Gemini 영상 직접 분석 → 대본 장면과 정밀 매칭
 *   6. mergeWithAiTimecodes → 컷 포인트에 스냅
 */
import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { evolinkChat, getEvolinkKey, evolinkVideoAnalysisStream } from './evolinkService';
import { logger } from './LoggerService';
import { mergeWithAiTimecodes } from './sceneDetection';
// ensureCompanionAvailable 미사용 — health check가 블로킹되므로 다운로드 직접 시도
import type { SceneCut } from './sceneDetection';
import type {
  ReferenceClipDownloadResult,
  Scene,
  SceneReferenceClipDownloadResult,
  VideoReference,
} from '../types';
import { getSceneNarrationText, getScenePrimaryText } from '../utils/sceneText';

const JSON_LOG_PREVIEW_CHARS = 500;

type JsonObjectExtractionResult = {
  parsed: Record<string, unknown> | null;
  recovered: boolean;
};

function buildJsonLogPreview(raw: string, maxLength: number = JSON_LOG_PREVIEW_CHARS): string {
  const normalized = (raw || '(빈)')
    .replace(/\r?\n/g, '⏎')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;

  const headLength = Math.min(160, Math.max(60, Math.floor(maxLength / 3)));
  return `${normalized.slice(0, headLength)} … ${normalized.slice(-maxLength)}`;
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripMarkdownCodeFences(raw: string): string {
  return raw
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/```(?:json)?/gi, ' ')
    .replace(/```/g, ' ')
    .replace(/^\uFEFF/, '')
    .trim();
}

function stripJsonComments(raw: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        result += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
    }

    result += char;
  }

  return result;
}

function stripJsonTrailingCommas(raw: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      result += char;
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ',') {
      let nextIndex = i + 1;
      while (nextIndex < raw.length && /\s/.test(raw[nextIndex])) {
        nextIndex += 1;
      }
      if (nextIndex < raw.length && (raw[nextIndex] === '}' || raw[nextIndex] === ']')) {
        continue;
      }
    }

    result += char;
  }

  return result;
}

type JsonObjectCandidate = {
  text: string;
  balanced: boolean;
};

function extractJsonCandidate(raw: string): JsonObjectCandidate | null {
  const sanitized = stripJsonComments(stripMarkdownCodeFences(raw)).trim();
  if (!sanitized) return null;

  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (objectStart === -1) objectStart = i;
      depth += 1;
      continue;
    }

    if (char === '}' && objectStart !== -1) {
      depth -= 1;
      if (depth === 0) {
        return {
          text: sanitized.slice(objectStart, i + 1).trim(),
          balanced: true,
        };
      }
    }
  }

  if (objectStart === -1) return null;
  return {
    text: sanitized.slice(objectStart).trim(),
    balanced: false,
  };
}

function parseJsonObjectCandidate(candidate: string): { parsed: Record<string, unknown> | null; error?: Error } {
  try {
    const parsed = JSON.parse(stripJsonTrailingCommas(candidate).trim());
    if (!isJsonObjectRecord(parsed)) {
      return {
        parsed: null,
        error: new Error('JSON root is not an object'),
      };
    }
    return { parsed };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function extractJsonObjectDetailed(raw: string): JsonObjectExtractionResult {
  const trimmed = raw.trim();
  if (!trimmed) return { parsed: null, recovered: false };

  const candidate = extractJsonCandidate(trimmed);
  if (!candidate) {
    logger.warn('[VideoRef] JSON 객체 추출 실패', buildJsonLogPreview(trimmed));
    return { parsed: null, recovered: false };
  }

  const parsed = parseJsonObjectCandidate(candidate.text);
  if (parsed.parsed) {
    return { parsed: parsed.parsed, recovered: false };
  }

  if (candidate.balanced) {
    logger.warn('[VideoRef] JSON 파싱 에러', {
      error: parsed.error?.message || 'unknown',
      raw: buildJsonLogPreview(trimmed),
      candidate: buildJsonLogPreview(candidate.text),
    });
    return { parsed: null, recovered: false };
  }

  const partial = stripJsonTrailingCommas(candidate.text);
  const repairs = [
    partial.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '') + '}',
    partial.replace(/,\s*$/, '') + '}',
    partial + '"}',
    partial + '}',
  ];

  for (const attempt of repairs) {
    const recovered = parseJsonObjectCandidate(attempt);
    if (recovered.parsed) {
      return { parsed: recovered.parsed, recovered: true };
    }
  }

  logger.warn('[VideoRef] JSON 복구 불가', {
    raw: buildJsonLogPreview(trimmed),
    candidate: buildJsonLogPreview(candidate.text, 200),
  });
  return { parsed: null, recovered: false };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  return extractJsonObjectDetailed(raw).parsed;
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_SEARCH_RESULTS = 10;
const MAX_DISPLAY_RESULTS = 5;
const SEARCH_CONCURRENCY = 1; // v2: 다운로드+분석이 무거우므로 1개씩
const COMPANION_URL = 'http://127.0.0.1:9876';
const REFERENCE_DOWNLOAD_TIMEOUT_MS = 300_000;
const REFERENCE_TRIM_TIMEOUT_MS = 180_000;
const COMPANION_STATUS_CACHE_TTL_MS = 30_000;
const COMPANION_STATUS_TIMEOUT_MS = 5_000;
const COMPANION_FFMPEG_CUT_MIN_VERSION = '1.3.0';
const REFERENCE_CLIP_CUT_PENDING_MESSAGE = 'FFmpeg 준비 상태를 확인하는 중입니다. 잠시 후 다시 시도해주세요.';

type CompanionHealthPayload = {
  app?: string;
  version?: string;
  services?: unknown;
};

type ReferenceClipCutCapabilityPayload = {
  ready?: unknown;
  pending?: unknown;
  supported?: unknown;
  error?: unknown;
  ffmpegCutSupported?: unknown;
};

type ReferenceClipCutProbeResult = {
  endpointAvailable: boolean;
  supported: boolean;
  pending: boolean;
  errorMessage: string | null;
};

export interface VideoReferenceCompanionStatus {
  available: boolean;
  version: string | null;
  services: string[];
  ffmpegCutSupported: boolean;
  needsFfmpegCutUpdate: boolean;
}

export function getVideoReferenceScenePrimaryText(scene?: Scene | null): string {
  return getScenePrimaryText(scene);
}

function getDistinctAudioScript(scene?: Scene | null, narrationText?: string): string {
  const audioScript = scene?.audioScript?.trim() || '';
  return audioScript && audioScript !== (narrationText || '') ? audioScript : '';
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function waitForPromiseWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function normalizeCompanionServices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
}

let _companionStatusCache: { expiresAt: number; status: VideoReferenceCompanionStatus } | null = null;
let _companionStatusPromise: Promise<VideoReferenceCompanionStatus> | null = null;
let _referenceClipCutProbeSucceeded = false;
let _referenceClipCutProbePromise: Promise<ReferenceClipCutProbeResult> | null = null;

function cacheCompanionStatus(status: VideoReferenceCompanionStatus): VideoReferenceCompanionStatus {
  _companionStatusCache = {
    expiresAt: Date.now() + COMPANION_STATUS_CACHE_TTL_MS,
    status,
  };
  return status;
}

function clearReferenceClipCutProbeSuccessCache(): void {
  _referenceClipCutProbeSucceeded = false;
}

function cacheReferenceClipCutProbeSuccess(): ReferenceClipCutProbeResult {
  _referenceClipCutProbeSucceeded = true;
  return {
    endpointAvailable: true,
    supported: true,
    pending: false,
    errorMessage: null,
  };
}

export function buildReferenceClipCompanionUpdateMessage(version: string | null | undefined): string {
  const versionPart = version
    ? `현재 실행 중인 컴패니언은 v${version}입니다.`
    : '현재 실행 중인 컴패니언 버전을 확인하지 못했습니다.';
  return `레퍼런스 클립 잘라내기(/api/ffmpeg/cut)는 컴패니언 v${COMPANION_FFMPEG_CUT_MIN_VERSION} 이상이 필요합니다. ${versionPart} 컴패니언을 업데이트한 뒤 다시 시도해주세요.`;
}

export async function getVideoReferenceCompanionStatus(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<VideoReferenceCompanionStatus> {
  const now = Date.now();
  if (!options?.force && _companionStatusCache && _companionStatusCache.expiresAt > now) {
    return waitForPromiseWithSignal(Promise.resolve(_companionStatusCache.status), options?.signal);
  }
  if (!options?.force && _companionStatusPromise) {
    return waitForPromiseWithSignal(_companionStatusPromise, options?.signal);
  }

  const request = (async (): Promise<VideoReferenceCompanionStatus> => {
    try {
      const res = await monitoredFetch(
        `${COMPANION_URL}/health`,
        { signal: AbortSignal.timeout(COMPANION_STATUS_TIMEOUT_MS) },
        COMPANION_STATUS_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`health ${res.status}`);

      const data = await res.json().catch(() => null) as CompanionHealthPayload | null;
      if (!data || data.app !== 'ytdlp-companion') throw new Error('invalid companion signature');

      const version = typeof data.version === 'string' && data.version.trim()
        ? data.version.trim()
        : null;
      const services = normalizeCompanionServices(data.services);
      const ffmpegCutSupported = services.includes('ffmpeg-cut');

      return cacheCompanionStatus({
        available: true,
        version,
        services,
        ffmpegCutSupported,
        needsFfmpegCutUpdate: !ffmpegCutSupported,
      });
    } catch (error) {
      const status: VideoReferenceCompanionStatus = {
        available: false,
        version: null,
        services: [],
        ffmpegCutSupported: false,
        needsFfmpegCutUpdate: false,
      };
      if (options?.force && (options.signal?.aborted || isAbortError(error))) {
        throw createAbortError();
      }
      return cacheCompanionStatus(status);
    }
  })();

  if (!options?.force) {
    _companionStatusPromise = request.finally(() => {
      _companionStatusPromise = null;
    });
    return waitForPromiseWithSignal(_companionStatusPromise, options?.signal);
  }

  return waitForPromiseWithSignal(request, options?.signal);
}

// in-flight dedupe — 진행 중인 다운로드/트림 promise (완료 후 삭제, AbortError 전파)
type ReferenceClipInflightEntry = {
  promise: Promise<ReferenceClipDownloadResult>;
  controller: AbortController;
  consumerCount: number;
};

const referenceClipInflight = new Map<string, ReferenceClipInflightEntry>();
// 완료된 결과 캐시 — 최대 20개 LRU (성공 시에만 저장)
const referenceClipResultCache = new Map<string, ReferenceClipDownloadResult>();
const REFERENCE_CLIP_CACHE_MAX = 20;

function pushToResultCache(key: string, result: ReferenceClipDownloadResult): void {
  if (referenceClipResultCache.size >= REFERENCE_CLIP_CACHE_MAX) {
    const oldest = referenceClipResultCache.keys().next().value;
    if (oldest !== undefined) referenceClipResultCache.delete(oldest);
  }
  referenceClipResultCache.set(key, result);
}

// 원본 영상 in-flight dedupe — 같은 videoId의 다른 구간 트리밍 시 재다운로드 방지
const sourceVideoInflight = new Map<string, Promise<Blob | null>>();
// 원본 영상 완료 캐시 — 최대 5개 (대용량이므로 작게 제한)
const sourceVideoResultCache = new Map<string, Blob>();
const SOURCE_VIDEO_CACHE_MAX = 5;

function pushToSourceCache(videoId: string, blob: Blob): void {
  if (sourceVideoResultCache.size >= SOURCE_VIDEO_CACHE_MAX) {
    const oldest = sourceVideoResultCache.keys().next().value;
    if (oldest !== undefined) sourceVideoResultCache.delete(oldest);
  }
  sourceVideoResultCache.set(videoId, blob);
}

function waitForReferenceClipInflight(
  entry: ReferenceClipInflightEntry,
  signal?: AbortSignal,
): Promise<ReferenceClipDownloadResult> {
  entry.consumerCount += 1;
  let released = false;

  const release = (aborted: boolean) => {
    if (released) return;
    released = true;
    entry.consumerCount = Math.max(0, entry.consumerCount - 1);
    if (aborted && entry.consumerCount === 0 && !entry.controller.signal.aborted) {
      entry.controller.abort();
    }
  };

  if (!signal) {
    return entry.promise.finally(() => {
      release(false);
    });
  }
  if (signal.aborted) {
    release(true);
    return Promise.reject(createAbortError());
  }

  return new Promise<ReferenceClipDownloadResult>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      release(true);
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        release(false);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        release(false);
        reject(error);
      },
    );
  });
}

function sanitizeReferenceClipStem(raw: string): string {
  const sanitized = raw
    .replace(/[^\w가-힣\-_ ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return sanitized || 'reference_clip';
}

// [FIX] 프레임 번호 기반 키 — Math.round(ms) 반올림 충돌 방지
// 1.4999s와 1.5001s가 같은 키로 충돌하는 문제 해결
function buildReferenceClipKey(videoId: string, startSec: number, endSec: number): string {
  const startFrame = Math.floor(startSec * 30000); // 30000 = 충분한 정밀도 (29.97fps 호환)
  const endFrame = Math.floor(endSec * 30000);
  return `${videoId}:${startFrame}-${endFrame}`;
}

function buildReferenceClipFileName(
  videoId: string,
  startSec: number,
  endSec: number,
  videoTitle?: string,
): string {
  const stem = sanitizeReferenceClipStem(
    `${videoTitle || videoId}_${Math.floor(startSec)}_${Math.floor(endSec)}`,
  );
  return `${stem}.mp4`;
}

function guessBlobExtension(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes('quicktime')) return 'mov';
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogv';
  return 'mp4';
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

async function downloadCompanionVideoBlob(
  videoId: string,
  options?: {
    signal?: AbortSignal;
    quality?: string;
    videoOnly?: boolean;
    reason?: 'analysis' | 'reference';
  },
): Promise<Blob | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const quality = options?.quality || '1080p';
  const reasonLabel = options?.reason === 'analysis' ? '분석용' : '레퍼런스';
  const videoOnlyParam = options?.videoOnly === false ? '' : '&videoOnly=true';
  const dlUrl = `${COMPANION_URL}/api/download?url=${encodeURIComponent(ytUrl)}&quality=${encodeURIComponent(quality)}${videoOnlyParam}`;

  try {
    logger.info('[VideoRef] 컴패니언 다운로드 시작', `${reasonLabel} ${videoId}`);
    const timeoutSignal = AbortSignal.timeout(REFERENCE_DOWNLOAD_TIMEOUT_MS);
    const combined = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const res = await monitoredFetch(dlUrl, { signal: combined }, REFERENCE_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      logger.warn('[VideoRef] 다운로드 실패', `${res.status} ${res.statusText}`);
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('video/') && !ct.startsWith('audio/') && !ct.includes('octet-stream')) {
      logger.warn('[VideoRef] 다운로드 MIME 불일치', `${ct} (video/* 기대)`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size < 10_000) {
      logger.warn('[VideoRef] 다운로드 크기 너무 작음', `${blob.size} bytes`);
      return null;
    }
    logger.info('[VideoRef] 다운로드 완료', `${videoId} ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
    return blob;
  } catch (e) {
    if (options?.signal?.aborted || isAbortError(e)) throw createAbortError();
    logger.warn('[VideoRef] 다운로드 에러', e instanceof Error ? e.message : '');
    return null;
  }
}

async function trimReferenceClipWithCompanion(
  sourceBlob: Blob,
  params: {
    videoId: string;
    startSec: number;
    endSec: number;
    videoTitle?: string;
    signal?: AbortSignal;
  },
): Promise<ReferenceClipDownloadResult> {
  const fileName = buildReferenceClipFileName(
    params.videoId,
    params.startSec,
    params.endSec,
    params.videoTitle,
  );
  const cutPayload = {
    input: await blobToBase64(sourceBlob),
    inputFormat: guessBlobExtension(sourceBlob),
    clips: [{
      label: fileName.replace(/\.mp4$/i, ''),
      startSec: params.startSec,
      endSec: params.endSec,
    }],
  };
  const timeoutSignal = AbortSignal.timeout(REFERENCE_TRIM_TIMEOUT_MS);
  const combined = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;
  const response = await monitoredFetch(`${COMPANION_URL}/api/ffmpeg/cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cutPayload),
    signal: combined,
  }, REFERENCE_TRIM_TIMEOUT_MS);

  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      clearReferenceClipCutProbeSuccessCache();
      throw new Error(buildReferenceClipCompanionUpdateMessage(null));
    }
    const message = await response.text().catch(() => '');
    throw new Error(message || `클립 자르기 실패 (HTTP ${response.status})`);
  }

  const payload = await response.json();
  const zipBase64 = typeof payload?.data === 'string' ? payload.data : '';
  if (!zipBase64) {
    throw new Error('클립 자르기 응답이 비어 있습니다.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = ((await import('jszip')) as any).default;
  const zip = await JSZip.loadAsync(decodeBase64ToUint8Array(zipBase64));
  const zipEntries = Object.values(zip.files) as Array<{ dir: boolean; name: string; async: (type: string) => Promise<Blob> }>;
  const clipEntry = zipEntries.find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.mp4'));
  if (!clipEntry) {
    throw new Error('잘린 MP4 파일을 찾을 수 없습니다.');
  }

  const blob = await clipEntry.async('blob');
  return {
    key: buildReferenceClipKey(params.videoId, params.startSec, params.endSec),
    videoId: params.videoId,
    videoTitle: params.videoTitle,
    startSec: params.startSec,
    endSec: params.endSec,
    durationSec: Math.max(0.1, params.endSec - params.startSec),
    fileName: clipEntry.name.split('/').pop() || fileName,
    sourceUrl: `https://www.youtube.com/watch?v=${params.videoId}&t=${Math.max(0, Math.floor(params.startSec))}`,
    blob,
  };
}

/** 쇼츠 모드 컷 길이 규칙 */
export const SHORTS_CUT_RULES = {
  /** 기본 클립 길이 (초) */
  defaultClipSec: 2.5,
  /** 팩트/숫자 구간 (읽을 시간 필요) */
  factClipSec: 3,
  /** 감정 폭발/반전 (빠른 전환) */
  emotionClipSec: 1.5,
  /** 도입부 훅 */
  hookClipSec: 1,
  /** 최소 클립 길이 */
  minClipSec: 1,
  /** 최대 클립 길이 */
  maxClipSec: 4,
} as const;

// ─── 쿼터 추적 ───
function trackQuota(units: number): boolean {
  const STORAGE_KEY = 'YOUTUBE_QUOTA_USED';
  const DAILY_LIMIT = 10000;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (stored.date !== today) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, used: units }));
      return true;
    }
    if (stored.used + units > DAILY_LIMIT) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, used: stored.used + units }));
    return true;
  } catch { return true; }
}

// ─── YouTube Search API ───
interface YTSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

interface VideoSearchOptions {
  shortsMode?: boolean;
  /** ISO 날짜 (예: 2024-01-01) — 이 날짜 이후 영상만 검색 */
  publishedAfter?: string;
  /** ISO 날짜 — 이 날짜 이전 영상만 검색 */
  publishedBefore?: string;
  relevanceLanguage?: string;
  signal?: AbortSignal;
}

async function searchYouTubeVideos(query: string, maxResults = MAX_SEARCH_RESULTS, options?: VideoSearchOptions): Promise<YTSearchItem[]> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) { logger.warn('[VideoRef] YouTube API 키 없음'); return []; }
  if (!trackQuota(100)) { logger.warn('[VideoRef] YouTube 쿼터 초과'); return []; }

  // 쇼츠 모드: 짧은 영상(~4분) 우선 / 일반 모드: 중간 길이(4~20분) 우선
  const duration = options?.shortsMode ? 'short' : 'medium';
  const relevanceLanguage = options?.relevanceLanguage?.trim() || 'en';
  let url = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&relevanceLanguage=${encodeURIComponent(relevanceLanguage)}&videoDuration=${duration}&key=${apiKey}`;

  // 날짜 범위 필터
  if (options?.publishedAfter) {
    url += `&publishedAfter=${options.publishedAfter}T00:00:00Z`;
  }
  if (options?.publishedBefore) {
    url += `&publishedBefore=${options.publishedBefore}T23:59:59Z`;
  }

  try {
    const res = await monitoredFetch(url, { signal: options?.signal }, 15000);
    if (!res.ok) throw new Error(`YouTube Search ${res.status}`);
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId || '',
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
      publishedAt: item.snippet?.publishedAt || '',
    })).filter((v: YTSearchItem) => v.videoId);
  } catch (e) {
    if (options?.signal?.aborted || isAbortError(e)) throw createAbortError();
    logger.error('[VideoRef] YouTube 검색 실패', e instanceof Error ? e.message : '');
    return [];
  }
}

// ─── 영상 duration 조회 ───
async function getVideoDurations(videoIds: string[], signal?: AbortSignal): Promise<Map<string, number>> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey || videoIds.length === 0) return new Map();
  if (!trackQuota(1)) return new Map();
  const url = `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
  try {
    const res = await monitoredFetch(url, { signal }, 10000);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, number>();
    for (const item of data.items || []) {
      const m = (item.contentDetails?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (m) map.set(item.id, (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0'));
    }
    return map;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw createAbortError();
    return new Map();
  }
}

function formatTime(sec: number): string {
  const v = Number.isFinite(sec) ? Math.max(0, sec) : 0;
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 컴패니언 감지: health 캐시 기반 빠른 체크 ───
async function checkCompanion(signal?: AbortSignal): Promise<boolean> {
  const status = await getVideoReferenceCompanionStatus({ signal });
  return status.available;
}

// ─── Phase 2: 컴패니언 yt-dlp로 영상 다운로드 (분석용, 480p — 장면 검색/scene detection에는 저해상도 충분) ───
async function downloadVideoForAnalysis(videoId: string, signal?: AbortSignal): Promise<Blob | null> {
  return downloadCompanionVideoBlob(videoId, {
    signal,
    quality: '480p',
    videoOnly: true,
    reason: 'analysis',
  });
}

// ─── Phase 3: Scene Detection (컴패니언 FFmpeg 우선, 브라우저 폴백) ───
// [FIX] 컴패니언 FFmpeg scene filter가 브라우저 Canvas보다 30배 빠르고 프레임 정밀
async function runSceneDetection(blob: Blob, signal?: AbortSignal, videoId?: string): Promise<SceneCut[]> {
  // 1순위: 컴패니언 /api/scene-detect (FFmpeg 네이티브)
  if (videoId) {
    try {
      logger.info('[VideoRef] Scene Detection 시작 (컴패니언 FFmpeg)', videoId);
      const res = await monitoredFetch(`${COMPANION_URL}/api/scene-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          threshold: 0.2,
          quality: '480p',
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      }, 120000);

      if (res.ok) {
        const data = await res.json() as {
          sceneCuts?: Array<{ timeSec: number; score: number }>;
          duration?: number;
          processingSec?: number;
        };
        const cuts: SceneCut[] = (data.sceneCuts || []).map(c => ({
          timeSec: c.timeSec,
          score: Math.round((c.score || 0) * 255), // 0-1 → 0-255 스케일로 정규화
        }));
        logger.info('[VideoRef] Scene Detection 완료 (컴패니언)', `${cuts.length}개 컷, ${data.processingSec?.toFixed(1)}s`);
        return cuts;
      }
      logger.warn('[VideoRef] 컴패니언 Scene Detection 실패', `status=${res.status}`);
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) throw createAbortError();
      logger.warn('[VideoRef] 컴패니언 Scene Detection 연결 실패 → 브라우저 폴백', e instanceof Error ? e.message : '');
    }
  }

  // [v2.5] 브라우저 폴백 제거 — 컴패니언 필수
  logger.warn('[VideoRef] 컴패니언 Scene Detection 없이는 씬 감지가 불가능합니다.');
  return [];
}

// ─── Phase 4: 자막 추출 (보조 시그널) ───
interface TimedCue { start: number; dur: number; text: string; }

// [FIX] 자막 추출 — 컴패니언 프록시 전용 (CORS 직접 호출 제거)
// YouTube CORS 차단 → 브라우저 직접 호출 불안정 → 컴패니언 경유만 사용
async function fetchTimedCaptions(videoId: string, signal?: AbortSignal): Promise<TimedCue[]> {
  const attempts = [
    { lang: 'ko', kind: '' }, { lang: 'ko', kind: 'asr' },
    { lang: 'en', kind: '' }, { lang: 'en', kind: 'asr' },
  ];

  for (const { lang, kind } of attempts) {
    if (signal?.aborted) throw createAbortError();
    try {
      const kindParam = kind ? `&kind=${kind}` : '';
      const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=srv3`;

      const timeoutSignal = AbortSignal.timeout(8000);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const proxyRes = await monitoredFetch(`${COMPANION_URL}/api/google-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, method: 'GET', headers: {} }),
        signal: combined,
      }, 8000);

      if (!proxyRes.ok) continue;
      const xml = await proxyRes.text();
      if (!xml || xml.length < 50) continue;

      const cues: TimedCue[] = [];
      const cleanHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim();

      let m: RegExpExecArray | null;
      const srv1 = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
      while ((m = srv1.exec(xml)) !== null) {
        const text = cleanHtml(m[3]);
        if (text) cues.push({ start: parseFloat(m[1]), dur: parseFloat(m[2]), text });
      }
      if (cues.length === 0) {
        const srv3 = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
        while ((m = srv3.exec(xml)) !== null) {
          const text = cleanHtml(m[3]);
          if (text) cues.push({ start: parseInt(m[1]) / 1000, dur: parseInt(m[2]) / 1000, text });
        }
      }

      if (cues.length > 3) {
        logger.info('[VideoRef] 자막 추출 성공', `${videoId} lang=${lang} cues=${cues.length}`);
        return cues;
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw createAbortError();
      continue;
    }
  }
  return [];
}

// ─── Phase 5: 하이브리드 매칭 — 영상 길이에 따라 전략 분기 ───
// 5분 이하: Gemini 영상 직접 분석 (fileUri)
// 5분 초과: Scene Detection 컷 + 자막 텍스트 AI 매칭 (Flash Lite, 빠름)
const GEMINI_VIDEO_MAX_DURATION_SEC = 300; // 5분

// [v3.0] YouTube URL을 Gemini에 직접 전달하여 편집점 분석
// 다운로드/장면감지/자막 추출 불필요 — Gemini가 영상 프레임을 직접 분석
// 50분+ 롱폼도 분석 가능 (기존 5분 제한 폐기)
async function matchVideoToSceneViaUrl(
  videoId: string,
  sceneText: string,
  videoDurationSec: number,
  signal?: AbortSignal,
  shortsMode?: boolean,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  const apiKey = getEvolinkKey();
  if (!apiKey) {
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(Evolink 키 없음)' };
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const clipDuration = shortsMode
    ? `${SHORTS_CUT_RULES.minClipSec}~${SHORTS_CUT_RULES.maxClipSec}`
    : '5~15';

  logger.info('[VideoRef] Gemini YouTube URL 직접 분석', `${videoId} (${Math.round(videoDurationSec)}초)`);

  try {
    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri: youtubeUrl } },
          { text: `당신은 전문 영상 편집자입니다. 이 영상을 **처음부터 끝까지 전부** 시청한 뒤, 아래 대본과 가장 정확히 일치하는 ${clipDuration}초 구간을 찾으세요.

중요 규칙:
1. 영상의 앞부분만 보고 판단하지 마세요. **반드시 영상 전체(처음~끝)를 확인**하세요.
2. 대본의 핵심 키워드(인물, 사건, 숫자, 장소)가 **화면이나 음성에서 직접 언급/표시**되는 구간을 찾으세요.
3. 비슷한 내용이 여러 곳에 있으면, **가장 직접적이고 구체적인 구간**을 선택하세요.
4. 매칭되는 내용이 없으면 score를 0으로 반환하세요.
5. startSec과 endSec은 소수점 1자리까지 정밀하게 지정하세요.

[대본]
"${sceneText}"

JSON만 출력 (마크다운 금지): {"startSec":시작초,"endSec":끝초,"score":0~1,"reason":"이유"}` },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    // YouTube URL 직접 분석 — evolinkVideoAnalysisStream 사용 (SSE + 재시도 + 유휴 타임아웃)
    // 25분 이하: Evolink v1beta 직접 호출 (빠름)
    // 25분 초과: evolinkVideoAnalysisStream으로 스트리밍 (롱폼 대응)
    const DIRECT_URL_MAX_DURATION_SEC = 1500; // 25분
    let rawText = '';

    if (videoDurationSec <= DIRECT_URL_MAX_DURATION_SEC) {
      // 짧은 영상: v1beta 직접 호출 (빠름, 타임아웃 위험 낮음)
      const timeoutMs = Math.max(60000, Math.min(videoDurationSec * 500, 180000));
      const fetchSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      const res = await monitoredFetch(
        `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: fetchSignal,
        },
        timeoutMs,
      );

      if (!res.ok) throw new Error(`Gemini 분석 실패 (${res.status})`);
      const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      rawText = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    } else {
      // 롱폼 영상: evolinkVideoAnalysisStream (SSE 스트리밍 + 재시도 + 유휴 타임아웃)
      logger.info('[VideoRef] 롱폼 영상 → evolinkVideoAnalysisStream 스트리밍', `${Math.round(videoDurationSec / 60)}분`);
      rawText = await evolinkVideoAnalysisStream(
        youtubeUrl,
        'video/mp4',
        '', // system prompt
        payload.contents[0].parts[1].text, // user prompt
        (_chunk, accumulated) => { rawText = accumulated; },
        { signal, timeoutMs: Math.max(180000, videoDurationSec * 500) },
      );
    }

    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // JSON 추출 (마크다운 감싸기 대응)
    let result: { startSec: number; endSec: number; score: number; reason: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*?"startSec"[\s\S]*?\}/);
      if (!match) throw new Error('Gemini 응답에서 JSON 추출 실패');
      result = JSON.parse(match[0]);
    }

    // 유효성 검증
    const startSec = Math.max(0, result.startSec || 0);
    let endSec = Math.max(startSec + 1, result.endSec || startSec + 10);

    // 쇼츠 모드 클립 길이 제한
    if (shortsMode) {
      const clipLen = endSec - startSec;
      if (clipLen > SHORTS_CUT_RULES.maxClipSec) endSec = startSec + SHORTS_CUT_RULES.maxClipSec;
      if (clipLen < SHORTS_CUT_RULES.minClipSec) endSec = startSec + SHORTS_CUT_RULES.defaultClipSec;
    }

    logger.info('[VideoRef] Gemini URL 분석 완료', `${startSec.toFixed(1)}~${endSec.toFixed(1)}초, score=${result.score}`);
    return {
      startSec,
      endSec,
      matchScore: Math.max(0, Math.min(1, result.score || 0.5)),
      segmentText: result.reason || '',
    };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw createAbortError();
    logger.warn('[VideoRef] Gemini URL 분석 실패 → 기본 구간 반환', error instanceof Error ? error.message : '');
    const fallbackEnd = shortsMode
      ? Math.min(SHORTS_CUT_RULES.defaultClipSec, videoDurationSec)
      : Math.min(15, videoDurationSec);
    return { startSec: 0, endSec: fallbackEnd, matchScore: 0.2, segmentText: '(분석 실패)' };
  }
}

// ─── 짧은 영상: Gemini 영상 직접 분석 ───
async function matchWithGeminiVideo(
  videoId: string,
  sceneText: string,
  limitedCuts: SceneCut[],
  cues: TimedCue[],
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  const cutList = limitedCuts.map((c, i) => `[${i}] ${c.timeSec.toFixed(1)}s (${formatTime(c.timeSec)})`).join('\n');
  const captionSummary = cues.length > 0 ? `\n\n[자막]\n${cues.map(c => `${formatTime(c.start)}: ${c.text}`).join('\n').slice(0, 1500)}` : '';
  const hasCuts = limitedCuts.length > 0;

  try {
    logger.info('[VideoRef] Gemini 영상 직접 분석 (짧은 영상)', videoId);
    const result = await evolinkVideoAnalysisStream(
      `https://www.youtube.com/watch?v=${videoId}`,
      'video/mp4',
      '영상 편집 전문가. YouTube 영상을 직접 분석하여 대본과 가장 관련된 구간을 찾아줘. JSON만 반환.',
      [
        `[대본] ${sceneText.slice(0, 400)}`,
        hasCuts ? `\n[컷 포인트 ${limitedCuts.length}개]\n${cutList}` : '',
        captionSummary,
        hasCuts
          ? `\n반환: {"startCutIndex": N, "endCutIndex": M, "score": 0~1, "reason": "설명"}`
          : `\n반환: {"startSec": 초, "endSec": 초, "score": 0~1, "reason": "설명"}`,
      ].join('\n'),
      () => {},
      { temperature: 0.1, maxOutputTokens: 500, timeoutMs: 180_000 },
    );
    return parseMatchResult(result, limitedCuts);
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) throw createAbortError();
    logger.warn('[VideoRef] Gemini 영상 분석 실패 → 컷+자막 폴백', e instanceof Error ? e.message : '');
    return matchWithCutsAndCaptions(sceneText, limitedCuts, cues, 0, signal);
  }
}

// ─── 롱폼 영상: 컷 + 자막 텍스트 AI 매칭 (Flash Lite, 빠름) ───
async function matchWithCutsAndCaptions(
  sceneText: string,
  limitedCuts: SceneCut[],
  cues: TimedCue[],
  videoDurationSec: number,
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  // 컷 구간별 자막 텍스트 매핑 — 각 컷 사이 자막을 묶어서 "구간 요약" 생성
  const segments: { idx: number; startSec: number; endSec: number; text: string }[] = [];

  if (limitedCuts.length > 0 && cues.length > 0) {
    for (let i = 0; i < limitedCuts.length; i++) {
      const segStart = limitedCuts[i].timeSec;
      const segEnd = i + 1 < limitedCuts.length ? limitedCuts[i + 1].timeSec : videoDurationSec || segStart + 30;
      const segCues = cues.filter(c => c.start >= segStart && c.start < segEnd);
      const segText = segCues.map(c => c.text).join(' ').slice(0, 120);
      if (segText.length > 5) {
        segments.push({ idx: i, startSec: segStart, endSec: segEnd, text: segText });
      }
    }
  } else if (cues.length > 0) {
    // 컷 없으면 30초 단위 청크
    let chunkStart = cues[0].start;
    let chunkTexts: string[] = [];
    let idx = 0;
    for (const cue of cues) {
      if (cue.start - chunkStart > 30 && chunkTexts.length > 0) {
        segments.push({ idx: idx++, startSec: chunkStart, endSec: cue.start, text: chunkTexts.join(' ').slice(0, 120) });
        chunkStart = cue.start;
        chunkTexts = [];
      }
      chunkTexts.push(cue.text);
    }
    if (chunkTexts.length > 0) {
      const last = cues[cues.length - 1];
      segments.push({ idx: idx, startSec: chunkStart, endSec: last.start + last.dur, text: chunkTexts.join(' ').slice(0, 120) });
    }
  }

  if (segments.length === 0) {
    return { startSec: 0, endSec: 30, matchScore: 0.2, segmentText: '(자막+컷 데이터 없음)' };
  }

  const segList = segments.slice(0, 40).map(s =>
    `[${s.idx}] ${formatTime(s.startSec)}~${formatTime(s.endSec)}: ${s.text}`
  ).join('\n');

  try {
    logger.info('[VideoRef] 컷+자막 하이브리드 매칭', `${segments.length}개 구간`);
    const response = await evolinkChat([
      { role: 'system', content: 'Match script to video segments using captions and cut points. Return ONLY JSON.' },
      { role: 'user', content: [
        `Find the segment most related to the script scene below.`,
        ``,
        `[Script] ${sceneText.slice(0, 400)}`,
        ``,
        `[Video Segments with captions — ${segments.length} segments]`,
        segList,
        ``,
        `Return: {"segmentIndex": N, "score": 0~1, "reason": "explanation"}`,
        `segmentIndex = segment number [N] above. score = relevance 0~1.`,
      ].join('\n') },
    ], {
      temperature: 0.2, maxTokens: 300, timeoutMs: 15000,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
      signal,
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      logger.warn('[VideoRef] 하이브리드 매칭 파싱 실패');
      return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(파싱 실패)' };
    }

    const segIdx = Number(parsed.segmentIndex);
    if (!Number.isFinite(segIdx) || segIdx < 0 || segIdx >= segments.length) {
      return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(인덱스 범위 초과)' };
    }

    const matched = segments[Math.floor(segIdx)];
    const score = Math.min(1, Math.max(0, Number(parsed.score) || 0.5));
    const reason = String(parsed.reason || matched.text);

    // Scene Detection 컷에 스냅
    const snappedStart = limitedCuts.length > 0
      ? mergeWithAiTimecodes([matched.startSec], limitedCuts.map(c => ({ timeSec: c.timeSec, score: c.score })))[0]
      : matched.startSec;
    const snappedEnd = limitedCuts.length > 0
      ? mergeWithAiTimecodes([matched.endSec], limitedCuts.map(c => ({ timeSec: c.timeSec, score: c.score })))[0]
      : matched.endSec;

    logger.info('[VideoRef] 하이브리드 매칭 완료',
      `${formatTime(snappedStart)}~${formatTime(snappedEnd)} score=${score.toFixed(2)} "${reason.slice(0, 50)}"`);

    return {
      startSec: Math.floor(snappedStart),
      endSec: Math.floor(Math.max(snappedEnd, snappedStart + 1)),
      matchScore: score,
      segmentText: reason.slice(0, 150),
    };
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) throw createAbortError();
    logger.warn('[VideoRef] 하이브리드 매칭 실패', e instanceof Error ? e.message : '');
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(매칭 실패)' };
  }
}

// ─── Gemini 응답 파싱 공통 ───
function parseMatchResult(
  result: string,
  limitedCuts: SceneCut[],
): { startSec: number; endSec: number; matchScore: number; segmentText: string } {
  logger.info('[VideoRef] Gemini 응답', (result || '(빈)').replace(/\n/g, '⏎').slice(0, 500));
  const parsed = extractJsonObject(result);
  if (!parsed) {
    logger.warn('[VideoRef] Gemini 응답 파싱 실패');
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(파싱 실패)' };
  }

  let rawStart: number;
  let rawEnd: number;
  const hasCuts = limitedCuts.length > 0;

  const rawSi = Number(parsed.startCutIndex);
  const rawEi = Number(parsed.endCutIndex);
  if (hasCuts && Number.isFinite(rawSi) && rawSi >= 0) {
    const si = Math.max(0, Math.min(Math.floor(rawSi), limitedCuts.length - 1));
    const ei = Number.isFinite(rawEi) && rawEi >= 0
      ? Math.max(si, Math.min(Math.floor(rawEi), limitedCuts.length - 1))
      : Math.min(si + 1, limitedCuts.length - 1);
    rawStart = limitedCuts[si].timeSec;
    rawEnd = ei > si ? limitedCuts[ei].timeSec : rawStart + 30;
  } else {
    rawStart = Number(parsed.startSec) || 0;
    rawEnd = Number(parsed.endSec) || rawStart + 30;
  }

  if (!Number.isFinite(rawStart) || rawStart < 0) rawStart = 0;
  if (!Number.isFinite(rawEnd) || rawEnd <= rawStart) rawEnd = rawStart + 30;

  const score = Math.min(1, Math.max(0, Number(parsed.score) || 0.5));
  const reason = String(parsed.reason || '');

  const snappedStart = hasCuts ? mergeWithAiTimecodes([rawStart], limitedCuts)[0] : rawStart;
  const snappedEnd = hasCuts ? mergeWithAiTimecodes([rawEnd], limitedCuts)[0] : rawEnd;

  logger.info('[VideoRef] 매칭 완료',
    `${formatTime(snappedStart)}~${formatTime(snappedEnd)} score=${score.toFixed(2)}`);

  return {
    startSec: Math.floor(snappedStart),
    endSec: Math.floor(Math.max(snappedEnd, snappedStart + 1)),
    matchScore: score,
    segmentText: reason.slice(0, 150),
  };
}

// ─── 자막 기반 AI 매칭 (폴백 — 컴패니언 없을 때) ───
async function matchWithCaptionsOnly(
  sceneText: string,
  cues: TimedCue[],
  videoTitle: string,
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string } | null> {
  if (!getEvolinkKey() || cues.length === 0) return null;

  const chunks: { startSec: number; endSec: number; text: string }[] = [];
  let chunkStart = cues[0].start;
  let chunkTexts: string[] = [];

  for (const cue of cues) {
    if (cue.start - chunkStart > 30 && chunkTexts.length > 0) {
      chunks.push({ startSec: chunkStart, endSec: cue.start, text: chunkTexts.join(' ') });
      chunkStart = cue.start;
      chunkTexts = [];
    }
    chunkTexts.push(cue.text);
  }
  if (chunkTexts.length > 0) {
    const lastCue = cues[cues.length - 1];
    chunks.push({ startSec: chunkStart, endSec: lastCue.start + lastCue.dur, text: chunkTexts.join(' ') });
  }

  const limitedChunks = chunks.slice(0, 20);
  const chunksText = limitedChunks.map((c, i) =>
    `[${i}] ${formatTime(c.startSec)}~${formatTime(c.endSec)}: ${c.text.slice(0, 100)}`
  ).join('\n');

  try {
    const response = await evolinkChat([
      { role: 'system', content: 'Match script to video segments. Return ONLY JSON.' },
      { role: 'user', content: `영상 "${videoTitle}"에서 대본과 가장 관련된 구간을 찾아줘.\n\n[대본]\n${sceneText.slice(0, 300)}\n\n[자막 구간]\n${chunksText}\n\n반환: {"index":0,"score":0.9,"reason":"설명"}` },
    ], {
      temperature: 0.2, maxTokens: 200, timeoutMs: 15000,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
      signal,
    });

    const parsed = extractJsonObject(response.choices?.[0]?.message?.content || '');
    const idx = typeof parsed?.index === 'number' ? parsed.index : -1;
    if (idx < 0 || idx >= limitedChunks.length) return null;

    return {
      startSec: limitedChunks[idx].startSec,
      endSec: limitedChunks[idx].endSec,
      matchScore: Math.min(1, Math.max(0, Number(parsed?.score) || 0.5)),
      segmentText: limitedChunks[idx].text.slice(0, 150),
    };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw createAbortError();
    return null;
  }
}

// ─── 맥락 분석 결과 ───
interface SceneContext {
  query: string;
  alternativeQueries?: string[];
  queryLanguage?: string;
  person?: string;
  event?: string;
  period?: string;
  location?: string;
  emotion?: 'calm' | 'excitement' | 'tension' | 'sadness' | 'humor';
  publishedAfter?: string;
  publishedBefore?: string;
}

type VideoReferenceContextOptions = {
  globalContext?: string;
  shortsMode?: boolean;
  signal?: AbortSignal;
  prevScene?: Scene | null;
  nextScene?: Scene | null;
};

function buildVideoLanguageContext(scene: Scene, options?: VideoReferenceContextOptions): string {
  const currentNarration = getSceneNarrationText(scene);
  const prevNarration = getSceneNarrationText(options?.prevScene);
  const nextNarration = getSceneNarrationText(options?.nextScene);
  return [
    currentNarration,
    scene.entityName,
    getDistinctAudioScript(scene, currentNarration),
    prevNarration,
    getDistinctAudioScript(options?.prevScene, prevNarration),
    nextNarration,
    getDistinctAudioScript(options?.nextScene, nextNarration),
  ].filter(Boolean).join(' ').slice(0, 1200);
}

function inferYouTubeQueryLanguage(scene: Scene, options?: VideoReferenceContextOptions): string {
  const localeSignals = [
    scene.entityName,
    scene.sceneLocation,
    scene.sceneCulture,
  ].filter(Boolean).join(' ');

  if (/korea|korean|대한민국|서울|부산/i.test(localeSignals)) return 'ko';
  if (/japan|japanese|도쿄|일본/i.test(localeSignals)) return 'ja';
  if (/china|chinese|중국|베이징|상하이/i.test(localeSignals)) return 'zh';

  const narrativeSignals = buildVideoLanguageContext(scene, options);
  const fallbackSignals = [
    scene.sceneLocation,
    scene.sceneEra,
    scene.sceneCulture,
    options?.globalContext,
  ].filter(Boolean).join(' ');

  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(narrativeSignals)) return 'ja';
  if (/[가-힣]/.test(narrativeSignals)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(narrativeSignals) && !/[A-Za-z]/.test(narrativeSignals)) return 'zh';
  if (/[A-Za-z]/.test(narrativeSignals)) return 'en';

  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(fallbackSignals)) return 'ja';
  if (/[가-힣]/.test(fallbackSignals)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(fallbackSignals) && !/[A-Za-z]/.test(fallbackSignals)) return 'zh';
  return 'en';
}

function buildVideoQueryContext(scene: Scene, options?: VideoReferenceContextOptions): string {
  const currentNarration = getSceneNarrationText(scene);
  const prevNarration = getSceneNarrationText(options?.prevScene);
  const nextNarration = getSceneNarrationText(options?.nextScene);
  const currentAltAudio = getDistinctAudioScript(scene, currentNarration);
  const prevAltAudio = getDistinctAudioScript(options?.prevScene, prevNarration);
  const nextAltAudio = getDistinctAudioScript(options?.nextScene, nextNarration);
  return [
    currentNarration ? `현재 장면 나레이션: ${currentNarration}` : '',
    currentAltAudio ? `현재 장면 오디오 스크립트: ${currentAltAudio}` : '',
    scene.visualDescriptionKO ? `현재 장면 설명: ${scene.visualDescriptionKO}` : '',
    scene.visualPrompt ? `현재 장면 비주얼 힌트: ${scene.visualPrompt.slice(0, 220)}` : '',
    scene.entityName ? `핵심 인물/대상: ${scene.entityName}` : '',
    scene.sceneLocation ? `장소: ${scene.sceneLocation}` : '',
    scene.sceneEra ? `시대: ${scene.sceneEra}` : '',
    scene.sceneCulture ? `문화권: ${scene.sceneCulture}` : '',
    prevNarration ? `이전 장면: ${prevNarration}` : '',
    prevAltAudio ? `이전 장면 오디오 스크립트: ${prevAltAudio}` : '',
    options?.prevScene?.visualDescriptionKO ? `이전 장면 설명: ${options.prevScene.visualDescriptionKO}` : '',
    nextNarration ? `다음 장면: ${nextNarration}` : '',
    nextAltAudio ? `다음 장면 오디오 스크립트: ${nextAltAudio}` : '',
    options?.nextScene?.visualDescriptionKO ? `다음 장면 설명: ${options.nextScene.visualDescriptionKO}` : '',
    options?.globalContext ? `프로젝트 전체 맥락: ${options.globalContext.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n').slice(0, 1800);
}

function buildVideoSceneMatchText(scene: Scene, options?: VideoReferenceContextOptions): string {
  const currentNarration = getSceneNarrationText(scene);
  const prevNarration = getSceneNarrationText(options?.prevScene);
  const nextNarration = getSceneNarrationText(options?.nextScene);
  return [
    currentNarration,
    getDistinctAudioScript(scene, currentNarration),
    scene.visualDescriptionKO,
    scene.entityName,
    scene.sceneLocation,
    scene.sceneEra,
    scene.sceneCulture,
    prevNarration,
    getDistinctAudioScript(options?.prevScene, prevNarration),
    options?.prevScene?.visualDescriptionKO,
    nextNarration,
    getDistinctAudioScript(options?.nextScene, nextNarration),
    options?.nextScene?.visualDescriptionKO,
  ].filter(Boolean).join(' ').slice(0, 500);
}

const VIDEO_SEARCH_QUERY_LANGUAGES = new Set([
  'ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it', 'id', 'vi', 'th', 'ar', 'hi',
]);

const VIDEO_SEARCH_QUERY_RESPONSE_FORMAT: { type: string; json_schema: Record<string, unknown> } = {
  type: 'json_schema',
  json_schema: {
    name: 'video_reference_search_query',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 80 },
        alternativeQueries: {
          type: 'array',
          items: { type: 'string', minLength: 3, maxLength: 80 },
          maxItems: 2,
        },
        queryLanguage: { type: 'string', enum: Array.from(VIDEO_SEARCH_QUERY_LANGUAGES) },
        person: { type: 'string', maxLength: 80 },
        event: { type: 'string', maxLength: 80 },
        period: { type: 'string', maxLength: 32 },
        location: { type: 'string', maxLength: 80 },
        emotion: { type: 'string', enum: ['calm', 'excitement', 'tension', 'sadness', 'humor'] },
      },
    },
  },
};

const VIDEO_QUERY_KO_STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '한편', '현재', '이전', '다음', '장면', '설명', '비주얼', '힌트',
  '프로젝트', '전체', '맥락', '나레이션', '오디오', '스크립트', '실제로', '배경으로', '장면에서',
  '등장하는', '등장하고', '보이는', '보이고', '내리고', '이어지는', '가까이', '멀리', '천천히',
  '갑자기', '아주', '정말', '조금', '같은', '있는', '없는', '그리고는', '배경', '화면',
]);

const VIDEO_QUERY_EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'into', 'onto', 'from', 'for', 'this', 'that',
  'these', 'those', 'scene', 'script', 'narration', 'audio', 'visual', 'description', 'project',
  'context', 'current', 'previous', 'next', 'showing', 'featuring', 'background', 'footage',
]);

function normalizeSceneContextString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSceneContextLanguage(value: unknown, fallbackLanguage: string): string {
  const normalized = normalizeSceneContextString(value)?.toLowerCase();
  return normalized && VIDEO_SEARCH_QUERY_LANGUAGES.has(normalized) ? normalized : fallbackLanguage;
}

function normalizeSceneContextEmotion(value: unknown): SceneContext['emotion'] | undefined {
  const normalized = normalizeSceneContextString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'calm' || normalized === 'excitement' || normalized === 'tension' || normalized === 'sadness' || normalized === 'humor') {
    return normalized;
  }
  return undefined;
}

function applySceneContextPublishedWindow(ctx: SceneContext): void {
  if (!ctx.period) return;

  const yearMatch = ctx.period.match(/(\d{4})/);
  if (!yearMatch) return;

  const year = parseInt(yearMatch[1], 10);
  const monthMatch = ctx.period.match(/(\d{4})-(\d{2})/);
  const currentYear = new Date().getFullYear();
  const shouldUsePublishedWindow = !!monthMatch || year >= (currentYear - 5);
  if (!shouldUsePublishedWindow) return;

  if (monthMatch) {
    ctx.publishedAfter = `${monthMatch[1]}-${monthMatch[2]}-01`;
    const month = parseInt(monthMatch[2], 10);
    const endMonth = Math.min(month + 2, 12);
    ctx.publishedBefore = `${monthMatch[1]}-${String(endMonth).padStart(2, '0')}-28`;
    return;
  }

  ctx.publishedAfter = `${year}-01-01`;
  ctx.publishedBefore = `${year}-12-31`;
}

function normalizeVideoQueryText(value: string): string {
  return value
    .replace(/```(?:json)?/gi, ' ')
    .replace(/[`"'“”‘’()[\]{}<>]/g, ' ')
    .replace(/[_*#]+/g, ' ')
    .replace(/[,:;!?。！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampVideoQueryText(query: string, maxLength: number = 80): string {
  if (query.length <= maxLength) return query;

  const clipped = query.slice(0, maxLength).trim();
  const lastSpace = clipped.lastIndexOf(' ');
  return lastSpace >= Math.floor(maxLength / 2) ? clipped.slice(0, lastSpace).trim() : clipped;
}

function getVideoQueryCharLength(query: string): number {
  return query.replace(/\s+/g, '').length;
}

function hasTrailingVideoQueryFragment(query: string): boolean {
  const lastToken = stripVideoQueryToken(query.split(/\s+/).pop() || '');
  return lastToken.length === 1 && /[0-9A-Za-z가-힣]/.test(lastToken);
}

function matchesLongScriptText(query: string, scene: Scene): boolean {
  return [scene.scriptText, getSceneNarrationText(scene)]
    .map((candidate) => normalizeVideoQueryText(candidate || ''))
    .some((candidate) => candidate.length >= 20 && candidate === query);
}

type VideoQueryValidationResult = {
  valid: boolean;
  query: string;
  reason?: string;
};

type VideoQueryValidationOptions = {
  allowTrailingFragment?: boolean;
};

function validateVideoSearchQueryCandidate(
  query: string | undefined,
  scene: Scene,
  options?: VideoQueryValidationOptions,
): VideoQueryValidationResult {
  const normalized = clampVideoQueryText(normalizeVideoQueryText(query || ''));

  if (getVideoQueryCharLength(normalized) < 2) {
    return { valid: false, query: normalized, reason: 'too_short' };
  }
  if (!options?.allowTrailingFragment && hasTrailingVideoQueryFragment(normalized)) {
    return { valid: false, query: normalized, reason: 'trailing_fragment' };
  }
  if (matchesLongScriptText(normalized, scene)) {
    return { valid: false, query: normalized, reason: 'same_as_script' };
  }

  return { valid: true, query: normalized };
}

function collectValidVideoQueryCandidates(
  scene: Scene,
  queries: Array<string | undefined>,
  maxCount: number = 3,
): string[] {
  const valid: string[] = [];

  for (const rawQuery of dedupeVideoQueryParts(
    queries.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
  )) {
    const validation = validateVideoSearchQueryCandidate(rawQuery, scene);
    if (!validation.valid) continue;
    if (valid.some((candidate) => candidate.toLowerCase() === validation.query.toLowerCase())) continue;

    valid.push(validation.query);
    if (valid.length >= maxCount) break;
  }

  return valid;
}

function dedupeVideoQueryParts(parts: string[]): string[] {
  const deduped: string[] = [];

  for (const rawPart of parts) {
    const part = normalizeVideoQueryText(rawPart);
    if (part.length < 2) continue;

    const duplicateIndex = deduped.findIndex((existing) => {
      const left = existing.toLowerCase();
      const right = part.toLowerCase();
      return left === right || left.includes(right) || right.includes(left);
    });

    if (duplicateIndex >= 0) {
      if (part.length > deduped[duplicateIndex].length) {
        deduped[duplicateIndex] = part;
      }
      continue;
    }

    deduped.push(part);
  }

  return deduped;
}

function stripVideoQueryToken(rawToken: string): string {
  let token = rawToken.trim();
  if (!token) return '';

  token = token.replace(/^[^0-9A-Za-z가-힣]+|[^0-9A-Za-z가-힣-]+$/g, '');
  token = token.replace(/(으로부터|에서부터|이라도|라도|으로는|에서는|에게서|께서는|에서는|으로서|처럼|까지|부터|에게|에서|으로|로|은|는|이|가|을|를|에|와|과|의|도|만)$/u, '');
  return token.trim();
}

function isUsefulVideoQueryToken(token: string): boolean {
  if (!token) return false;

  const lower = token.toLowerCase();
  if (VIDEO_QUERY_KO_STOPWORDS.has(token) || VIDEO_QUERY_EN_STOPWORDS.has(lower)) return false;
  if (/^\d{4}$/.test(token)) return true;
  if (/^[A-Z0-9-]{2,}$/.test(token)) return true;
  if (/[A-Za-z]/.test(token)) return token.length >= 3;
  if (/[가-힣]/.test(token)) {
    return token.length >= 2 && !/(하다|하고|이며|같은|있는|없는|에서|으로|처럼|하게|했다|된다)$/u.test(token);
  }
  return false;
}

function tokenizeVideoQueryText(value: string): string[] {
  const normalized = normalizeVideoQueryText(value);
  if (!normalized) return [];

  const tokens = normalized
    .split(/[\s/|]+/)
    .map(stripVideoQueryToken)
    .filter(isUsefulVideoQueryToken);

  return Array.from(new Set(tokens));
}

function isSentenceLikeVideoQuery(query: string): boolean {
  const normalized = normalizeVideoQueryText(query);
  if (!normalized) return false;

  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const tokenCount = rawTokens.length;
  if (tokenCount >= 8 || normalized.length > 60) return true;

  const grammarLikeCount = rawTokens.filter((token) => (
    /(합니다|했다|있다|보인다|내리고|이어지는|등장하는)$/u.test(token)
    || /[가-힣].*(은|는|이|가|을|를|에|에서|으로|로|와|과)$/u.test(token)
  )).length;
  if (tokenCount >= 5 && grammarLikeCount >= 2) return true;

  return /(showing|featuring|which|that|with)$/i.test(normalized);
}

function pushVideoQueryPhrase(parts: string[], value: string | undefined, maxLen: number = 28): void {
  const normalized = normalizeVideoQueryText(value || '');
  if (!normalized) return;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (normalized.length > maxLen || wordCount > 4 || isSentenceLikeVideoQuery(normalized)) return;

  const next = dedupeVideoQueryParts([...parts, normalized]);
  parts.splice(0, parts.length, ...next.slice(0, 6));
}

function pushVideoQueryTokens(parts: string[], value: string | undefined, maxTokens: number): void {
  if (!value) return;

  const tokens = tokenizeVideoQueryText(value).slice(0, maxTokens);
  const next = dedupeVideoQueryParts([...parts, ...tokens]);
  parts.splice(0, parts.length, ...next.slice(0, 6));
}

function joinVideoQueryParts(parts: string[], maxParts: number = 4, maxLen: number = 64): string {
  const deduped = dedupeVideoQueryParts(parts).slice(0, maxParts);
  let joined = '';

  for (const part of deduped) {
    const candidate = joined ? `${joined} ${part}` : part;
    if (candidate.length > maxLen) {
      return joined || part.slice(0, maxLen).trim();
    }
    joined = candidate;
  }

  return joined.trim();
}

function buildCompactVideoQuery(
  preferredPhrases: Array<string | undefined>,
  keywordSources: Array<string | undefined>,
  maxParts: number = 4,
  maxLen: number = 64,
): string {
  const parts: string[] = [];

  for (const phrase of preferredPhrases) {
    pushVideoQueryPhrase(parts, phrase);
    if (parts.length >= maxParts) return joinVideoQueryParts(parts, maxParts, maxLen);
  }

  for (const source of keywordSources) {
    pushVideoQueryTokens(parts, source, 3);
    if (parts.length >= maxParts) break;
  }

  return joinVideoQueryParts(parts, maxParts, maxLen);
}

function compactVideoQueryCandidate(
  query: string | undefined,
  scene: Scene,
  options: VideoReferenceContextOptions | undefined,
  anchorValues: Array<string | undefined>,
): string {
  const normalized = normalizeVideoQueryText(query || '');
  if (!normalized) return '';

  if (!isSentenceLikeVideoQuery(normalized)) {
    return normalized.slice(0, 64);
  }

  const compacted = buildCompactVideoQuery(
    anchorValues,
    [
      normalized,
      scene.visualDescriptionKO,
      getSceneNarrationText(scene),
      getDistinctAudioScript(scene, getSceneNarrationText(scene)),
      scene.visualPrompt,
      options?.globalContext,
    ],
  );

  if (compacted && compacted !== normalized) {
    logger.info('[VideoRef] 문장형 검색어를 키워드로 압축', {
      before: normalized,
      after: compacted,
    });
  }

  return compacted || normalized.slice(0, 64);
}

function buildRuleBasedVideoSearchContext(
  scene: Scene,
  _options: VideoReferenceContextOptions | undefined,
  fallbackLanguage: string,
): SceneContext {
  const narration = getSceneNarrationText(scene);
  const primarySources = [
    scene.visualDescriptionKO,
    narration,
    getDistinctAudioScript(scene, narration),
    scene.visualPrompt,
  ];

  const primaryQuery = buildCompactVideoQuery(
    [scene.entityName, scene.sceneLocation, scene.sceneEra, scene.sceneCulture],
    primarySources,
  );
  const narrativeQuery = buildCompactVideoQuery(
    [scene.entityName, scene.sceneLocation],
    [scene.visualDescriptionKO, narration, getDistinctAudioScript(scene, narration), scene.visualPrompt],
  );
  const metaQuery = joinVideoQueryParts([
    scene.entityName,
    scene.sceneLocation,
    scene.sceneEra,
    scene.sceneCulture,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0));
  const validQueries = collectValidVideoQueryCandidates(
    scene,
    [primaryQuery, narrativeQuery, metaQuery, scene.entityName, scene.sceneLocation],
    3,
  );
  const query = validQueries[0] || 'news footage';
  const alternativeQueries = validQueries.slice(1, 3);

  return {
    query,
    alternativeQueries: alternativeQueries.length > 0 ? alternativeQueries : undefined,
    queryLanguage: fallbackLanguage,
  };
}

function buildVisualDescriptionFallbackContext(
  scene: Scene,
  options: VideoReferenceContextOptions | undefined,
  fallbackLanguage: string,
  validatedQuery: string,
): SceneContext {
  const scriptFallback = buildRuleBasedVideoSearchContext(scene, options, fallbackLanguage);
  const alternativeQueries = collectValidVideoQueryCandidates(
    scene,
    [scriptFallback.query, ...(scriptFallback.alternativeQueries || [])],
    2,
  ).filter((candidate) => candidate !== validatedQuery);

  return {
    query: validatedQuery,
    alternativeQueries: alternativeQueries.length > 0 ? alternativeQueries : undefined,
    queryLanguage: fallbackLanguage,
  };
}

function buildVideoSearchQueryMessages(
  sceneText: string,
  fallbackLanguage: string,
  strictRetry: boolean,
  shortsMode?: boolean,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        'You generate YouTube real-footage search queries.',
        'Return exactly one JSON object and nothing else.',
        'No markdown fence, no comments, no explanation, no text before or after the JSON object.',
        strictRetry ? 'Your previous response was invalid. Output ONLY a minified JSON object.' : '',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: [
        'Analyze this script scene and generate search context for finding the most relevant YouTube footage.',
        '',
        '[Scene + Project Context]',
        sceneText,
        '',
        'Return exactly this JSON shape:',
        '{',
        '  "query": "2-6 concise keywords, never a sentence",',
        '  "alternativeQueries": ["backup query 1", "backup query 2"],',
        '  "queryLanguage": "ko|en|ja|zh|es|fr|de|pt|it|id|vi|th|ar|hi",',
        '  "person": "main person/entity name (optional)",',
        '  "event": "specific event/action name (optional)",',
        '  "period": "time period if mentioned, e.g. 2024-03 (optional)",',
        '  "location": "location if relevant (optional)",',
        '  "emotion": "calm|excitement|tension|sadness|humor"',
        '}',
        '',
        'Rules:',
        '- query must be short noun-based search keywords, not a sentence or clause.',
        '- query must be specific enough to find the actual footage, not generic stock.',
        `- If unsure, default queryLanguage to "${fallbackLanguage}".`,
        '- Use Korean keywords for Korean domestic topics or footage usually titled in Korean on YouTube.',
        '- Use English keywords for globally indexed people, events, or locations.',
        '- Include person/entity, event/action, place, and time cues when relevant.',
        '- alternativeQueries: give up to 2 short backup queries with different wording or language.',
        '- Omit unknown optional fields. Do not output null. Do not wrap JSON in markdown.',
        '- Example: "손흥민이 2024년 챔스 8강에서 결승골" -> {"query":"Son Heung-min Champions League quarter final goal 2024","person":"Son Heung-min","event":"Champions League QF goal","period":"2024","emotion":"excitement"}',
        shortsMode ? '- For shorts: prefer action words, trending topics, or viral moments.' : '',
      ].filter(Boolean).join('\n'),
    },
  ];
}

async function requestVideoSearchQueryFromAi(
  sceneText: string,
  fallbackLanguage: string,
  options: VideoReferenceContextOptions | undefined,
  strictRetry: boolean,
): Promise<string> {
  const response = await evolinkChat(
    buildVideoSearchQueryMessages(sceneText, fallbackLanguage, strictRetry, options?.shortsMode),
    {
      temperature: 0.1,
      maxTokens: 220,
      timeoutMs: 10000,
      responseFormat: strictRetry ? undefined : VIDEO_SEARCH_QUERY_RESPONSE_FORMAT,
      model: 'gemini-3.1-pro-preview',
      signal: options?.signal,
    },
  );

  return response.choices?.[0]?.message?.content || '';
}

function parseVideoSearchSceneContext(
  parsed: Record<string, unknown>,
  scene: Scene,
  options: VideoReferenceContextOptions | undefined,
  fallbackLanguage: string,
): { ctx: SceneContext | null; invalidReason?: string } {
  const person = normalizeSceneContextString(parsed.person);
  const event = normalizeSceneContextString(parsed.event);
  const period = normalizeSceneContextString(parsed.period);
  const location = normalizeSceneContextString(parsed.location);
  const anchorValues = [person, location, event, period, scene.entityName, scene.sceneLocation, scene.sceneEra];
  const rawAlternativeQueries = Array.isArray(parsed.alternativeQueries)
    ? parsed.alternativeQueries.filter((value): value is string => typeof value === 'string' && value.trim().length >= 2)
    : [];
  const primaryQuery = compactVideoQueryCandidate(normalizeSceneContextString(parsed.query), scene, options, anchorValues);
  const primaryValidation = validateVideoSearchQueryCandidate(primaryQuery, scene);

  const candidates = collectValidVideoQueryCandidates(
    scene,
    [
      primaryQuery,
      ...rawAlternativeQueries.map((query) => compactVideoQueryCandidate(query, scene, options, anchorValues)),
    ],
    3,
  );

  const query = candidates[0] || '';
  if (!query) {
    return { ctx: null, invalidReason: primaryValidation.reason || 'empty_query' };
  }

  const ctx: SceneContext = {
    query,
    alternativeQueries: candidates.slice(1, 3),
    queryLanguage: normalizeSceneContextLanguage(parsed.queryLanguage, fallbackLanguage),
    person,
    event,
    period,
    location,
    emotion: normalizeSceneContextEmotion(parsed.emotion),
  };

  applySceneContextPublishedWindow(ctx);
  return { ctx };
}

// ─── 검색어 생성 (맥락 분석 강화) ───
async function buildVideoSearchQuery(scene: Scene, options?: VideoReferenceContextOptions): Promise<SceneContext> {
  if (options?.signal?.aborted) throw createAbortError();
  const sceneText = buildVideoQueryContext(scene, options);
  const fallbackLanguage = inferYouTubeQueryLanguage(scene, options);

  if (getEvolinkKey() && sceneText.length > 10) {
    for (const strictRetry of [false, true]) {
      const attempt = strictRetry ? 'strict_prompt' : 'structured';
      try {
        const raw = await requestVideoSearchQueryFromAi(sceneText, fallbackLanguage, options, strictRetry);
        const extracted = extractJsonObjectDetailed(raw);
        if (!extracted.parsed) {
          logger.warn('[VideoRef] AI 검색어 생성 파싱 실패', {
            attempt,
            raw: buildJsonLogPreview(raw),
          });
          continue;
        }

        if (extracted.recovered) {
          const recoveredValidation = validateVideoSearchQueryCandidate(
            normalizeSceneContextString(extracted.parsed.query),
            scene,
          );
          if (!recoveredValidation.valid) {
            logger.warn('[VideoRef] JSON 복구 후 검증 실패', {
              attempt,
              reason: recoveredValidation.reason,
              query: recoveredValidation.query || '(빈)',
              raw: buildJsonLogPreview(raw),
            });
            continue;
          }

          logger.info('[VideoRef] JSON 복구 후 검증 통과', {
            attempt,
            query: recoveredValidation.query,
          });
        }

        const parsedResult = parseVideoSearchSceneContext(extracted.parsed, scene, options, fallbackLanguage);
        if (parsedResult.ctx?.query) {
          return parsedResult.ctx;
        }

        logger.warn('[VideoRef] AI 검색어 생성 결과 무효', {
          attempt,
          reason: parsedResult.invalidReason || 'empty_query',
          raw: buildJsonLogPreview(raw),
        });
      } catch (error) {
        if (options?.signal?.aborted || isAbortError(error)) throw createAbortError();
        logger.warn('[VideoRef] AI 검색어 생성 실패', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const visualValidation = validateVideoSearchQueryCandidate(scene.visualDescriptionKO, scene, {
    allowTrailingFragment: true,
  });
  if (scene.visualDescriptionKO?.trim()) {
    if (visualValidation.valid) {
      const visualFallback = buildVisualDescriptionFallbackContext(scene, options, fallbackLanguage, visualValidation.query);
      logger.info('[VideoRef] visualDescriptionKO 직접 폴백', `query="${visualFallback.query}"`);
      return visualFallback;
    }

    logger.warn('[VideoRef] visualDescriptionKO 폴백 무효', {
      reason: visualValidation.reason,
      query: visualValidation.query || '(빈)',
    });
  }

  const fallbackContext = buildRuleBasedVideoSearchContext(scene, options, fallbackLanguage);
  logger.info('[VideoRef] scriptText 키워드 폴백', `query="${fallbackContext.query}"`);
  return fallbackContext;
}

// ─── 메인: 장면별 자료영상 검색 (v3 — 맥락 분석 + 쇼츠 모드 + 컴패니언 + Scene Detection + Gemini) ───
export async function searchSceneReferenceVideos(
  scene: Scene,
  options?: VideoReferenceContextOptions,
): Promise<VideoReference[]> {
  if (options?.signal?.aborted) return [];
  const ctx = await buildVideoSearchQuery(scene, options);
  logger.info('[VideoRef] 장면 검색', `query="${ctx.query}" person=${ctx.person || '-'} period=${ctx.period || '-'} emotion=${ctx.emotion || '-'} shorts=${!!options?.shortsMode}`);

  const queryCandidates = Array.from(new Set([
    ctx.query,
    ...(ctx.alternativeQueries || []),
  ].map((query) => query.trim()).filter(Boolean)));

  let selectedQuery = queryCandidates[0] || ctx.query;
  let searchResults: YTSearchItem[] = [];
  for (const queryCandidate of queryCandidates) {
    if (options?.signal?.aborted) return [];
    const attemptResults = await searchYouTubeVideos(queryCandidate, MAX_SEARCH_RESULTS, {
      shortsMode: options?.shortsMode,
      publishedAfter: ctx.publishedAfter,
      publishedBefore: ctx.publishedBefore,
      relevanceLanguage: ctx.queryLanguage,
      signal: options?.signal,
    });
    if (attemptResults.length > 0) {
      selectedQuery = queryCandidate;
      searchResults = attemptResults;
      break;
    }
  }
  logger.info('[VideoRef] YouTube 검색 결과', `${searchResults.length}개`);

  // 날짜 필터로 결과 없으면 필터 없이 재시도
  if (searchResults.length === 0 && (ctx.publishedAfter || ctx.publishedBefore)) {
    logger.info('[VideoRef] 날짜 필터 결과 0 → 필터 없이 재검색');
    for (const queryCandidate of queryCandidates) {
      if (options?.signal?.aborted) return [];
      const retryResults = await searchYouTubeVideos(queryCandidate, MAX_SEARCH_RESULTS, {
        shortsMode: options?.shortsMode,
        relevanceLanguage: ctx.queryLanguage,
        signal: options?.signal,
      });
      if (retryResults.length > 0) {
        selectedQuery = queryCandidate;
        searchResults = retryResults;
        break;
      }
    }
  }
  if (searchResults.length === 0) return [];

  if (options?.signal?.aborted) return [];
  const durations = await getVideoDurations(searchResults.map(v => v.videoId), options?.signal);

  const sceneText = buildVideoSceneMatchText(scene, options);
  const results: VideoReference[] = [];

  // ─── 1순위: YouTube URL → Gemini 직접 분석 (다운로드 불필요) ───
  // [v3.0] Gemini에 YouTube URL을 직접 전달하여 프레임 단위 분석
  // 기존: 다운로드(30~60초) + 장면감지(10~20초) + 자막(10초) + 매칭
  // 수정: URL 전달 → Gemini가 즉시 분석 (15~40초)
  const v3Candidates = searchResults.slice(0, 2);

  for (const candidate of v3Candidates) {
    if (options?.signal?.aborted) return [];
    logger.info('[VideoRef] 🎬 v3 파이프라인 시작 (YouTube URL 직접 분석)', candidate.videoId);

    const videoDur = durations.get(candidate.videoId) || 0;
    const match = await matchVideoToSceneViaUrl(
      candidate.videoId, sceneText, videoDur, options?.signal, options?.shortsMode,
    );

    if (match.matchScore > 0.3) {
      results.push({
        videoId: candidate.videoId,
        videoTitle: candidate.title,
        channelTitle: candidate.channelTitle,
        thumbnailUrl: candidate.thumbnail,
        startSec: match.startSec,
        endSec: match.endSec,
        matchScore: match.matchScore,
        segmentText: match.segmentText,
        duration: videoDur,
        searchQuery: selectedQuery,
        publishedAt: candidate.publishedAt,
      });
      break;
    }

    // v3 실패 시 자막 기반 폴백
    logger.info('[VideoRef] v3 매칭 실패 → 자막 폴백', `score=${match.matchScore}`);
    const cues = await fetchTimedCaptions(candidate.videoId, options?.signal);
    const captionMatch = cues.length > 0
      ? await matchWithCaptionsOnly(sceneText, cues, candidate.title, options?.signal)
      : null;
      if (captionMatch && captionMatch.matchScore > 0.4) {
        results.push({
          videoId: candidate.videoId,
          videoTitle: candidate.title,
          channelTitle: candidate.channelTitle,
          thumbnailUrl: candidate.thumbnail,
          startSec: captionMatch.startSec,
          endSec: captionMatch.endSec,
          matchScore: captionMatch.matchScore,
          segmentText: captionMatch.segmentText,
          duration: durations.get(candidate.videoId) || 0,
          searchQuery: selectedQuery,
          publishedAt: candidate.publishedAt,
        });
        break;
      }
      // 이 후보도 실패 → 다음 후보 시도
  }

  // ─── 2순위: 나머지 후보는 자막 기반 매칭 (가벼운 폴백) ───
  const v3TriedCount = 2;
  const remainingCandidates = searchResults.slice(v3TriedCount, v3TriedCount + 4);

  await Promise.allSettled(remainingCandidates.map(async (video) => {
    if (options?.signal?.aborted) return;

    const cues = await fetchTimedCaptions(video.videoId, options?.signal);
    const match = cues.length > 0
      ? await matchWithCaptionsOnly(sceneText, cues, video.title, options?.signal)
      : null;

    if (match) {
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: match.startSec,
        endSec: match.endSec,
        matchScore: match.matchScore * 0.8, // 자막 기반은 80% 가중치
        segmentText: match.segmentText,
        duration: durations.get(video.videoId) || 0,
        searchQuery: selectedQuery,
        publishedAt: video.publishedAt,
      });
    } else {
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: 0,
        endSec: Math.min(30, durations.get(video.videoId) || 30),
        matchScore: 0.2,
        segmentText: cues.length > 0 ? cues.slice(0, 3).map(c => c.text).join(' ').slice(0, 100) : '(자막 없음)',
        duration: durations.get(video.videoId) || 0,
        searchQuery: selectedQuery,
        publishedAt: video.publishedAt,
      });
    }
  }));

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, MAX_DISPLAY_RESULTS);
}

// ─── 일괄 검색 ───
let _batchRunId = 0;
let _batchAbortCtrl: AbortController | null = null;

export function hasVideoReferenceSceneContent(scene: Scene): boolean {
  return Boolean(getVideoReferenceScenePrimaryText(scene));
}

export async function searchAllScenesReferenceVideos(
  scenes: Scene[],
  globalContext: string,
  onSceneResult: (sceneId: string, refs: VideoReference[]) => void,
  shortsMode?: boolean,
): Promise<void> {
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = new AbortController();
  const signal = _batchAbortCtrl.signal;
  const runId = ++_batchRunId;
  const scenesWithContent = scenes.filter(hasVideoReferenceSceneContent);

  // v2: 동시성 1개 (다운로드+분석이 무거우므로)
  for (let i = 0; i < scenesWithContent.length; i += SEARCH_CONCURRENCY) {
    if (_batchRunId !== runId || signal.aborted) return;

    const batch = scenesWithContent.slice(i, i + SEARCH_CONCURRENCY);
    await Promise.allSettled(batch.map(async (scene) => {
      if (_batchRunId !== runId || signal.aborted) return;
      const sceneIndex = scenes.findIndex((candidate) => candidate.id === scene.id);
      const refs = await searchSceneReferenceVideos(scene, {
        globalContext,
        signal,
        shortsMode,
        prevScene: sceneIndex > 0 ? scenes[sceneIndex - 1] : null,
        nextScene: sceneIndex >= 0 && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null,
      });
      if (_batchRunId === runId && !signal.aborted) {
        onSceneResult(scene.id, refs);
      }
    }));
  }
}

async function readReferenceClipCutProbePayload(response: Response): Promise<{
  payload: ReferenceClipCutCapabilityPayload | null;
  errorMessage: string | null;
}> {
  const raw = (await response.text().catch(() => '')).trim();
  if (!raw) {
    return { payload: null, errorMessage: null };
  }
  try {
    const parsed = JSON.parse(raw) as ReferenceClipCutCapabilityPayload;
    return {
      payload: parsed,
      errorMessage: typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error.trim()
        : null,
    };
  } catch {
    return { payload: null, errorMessage: raw };
  }
}

function isReferenceClipCutCapabilitySupported(payload: ReferenceClipCutCapabilityPayload | null): boolean {
  return payload?.supported === true || payload?.ffmpegCutSupported === true;
}

function isReferenceClipCutCapabilityPending(payload: ReferenceClipCutCapabilityPayload | null): boolean {
  if (!payload) return false;
  if (payload.pending === true) return true;
  return payload.ready === false && !isReferenceClipCutCapabilitySupported(payload);
}

async function probeReferenceClipCutCapabilityEndpoint(): Promise<ReferenceClipCutProbeResult | null> {
  try {
    const response = await monitoredFetch(
      `${COMPANION_URL}/api/ffmpeg/capability`,
      { signal: AbortSignal.timeout(COMPANION_STATUS_TIMEOUT_MS) },
      COMPANION_STATUS_TIMEOUT_MS,
    );
    if (response.status === 404 || response.status === 405) {
      return null;
    }
    const { payload, errorMessage } = await readReferenceClipCutProbePayload(response);
    const supported = response.ok && isReferenceClipCutCapabilitySupported(payload);
    const pending = isReferenceClipCutCapabilityPending(payload);

    if (supported) {
      return {
        endpointAvailable: true,
        supported: true,
        pending: false,
        errorMessage: null,
      };
    }
    if (pending) {
      return {
        endpointAvailable: true,
        supported: false,
        pending: true,
        errorMessage,
      };
    }
    if (!response.ok) {
      return {
        endpointAvailable: true,
        supported: false,
        pending: false,
        errorMessage: errorMessage || `레퍼런스 클립 capability 확인 실패 (HTTP ${response.status})`,
      };
    }
    return {
      endpointAvailable: true,
      supported: false,
      pending: false,
      errorMessage: errorMessage || 'FFmpeg 실행 불가',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    throw new Error(`레퍼런스 클립 capability 확인 실패: ${message}`);
  }
}

async function probeReferenceClipCutEndpointViaCut(): Promise<ReferenceClipCutProbeResult> {
  try {
    const response = await monitoredFetch(`${COMPANION_URL}/api/ffmpeg/cut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: '',
        inputFormat: 'mp4',
        clips: [{ label: 'probe', startSec: 0, endSec: 0.1 }],
      }),
      signal: AbortSignal.timeout(COMPANION_STATUS_TIMEOUT_MS),
    }, COMPANION_STATUS_TIMEOUT_MS);
    if (response.ok) {
      return {
        endpointAvailable: true,
        supported: true,
        pending: false,
        errorMessage: null,
      };
    }

    const { payload, errorMessage } = await readReferenceClipCutProbePayload(response);
    if (response.status === 404 || response.status === 405) {
      return {
        endpointAvailable: false,
        supported: false,
        pending: false,
        errorMessage: null,
      };
    }
    if (isReferenceClipCutCapabilityPending(payload)) {
      return {
        endpointAvailable: true,
        supported: false,
        pending: true,
        errorMessage,
      };
    }
    if (/FFmpeg 실행 불가/i.test(errorMessage || '')) {
      return {
        endpointAvailable: true,
        supported: false,
        pending: false,
        errorMessage: errorMessage || 'FFmpeg 실행 불가',
      };
    }
    return {
      endpointAvailable: true,
      supported: true,
      pending: false,
      errorMessage: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    throw new Error(`레퍼런스 클립 지원 확인 실패: ${message}`);
  }
}

async function probeReferenceClipCutEndpoint(signal?: AbortSignal): Promise<ReferenceClipCutProbeResult> {
  if (_referenceClipCutProbeSucceeded) {
    return waitForPromiseWithSignal(Promise.resolve(cacheReferenceClipCutProbeSuccess()), signal);
  }
  if (_referenceClipCutProbePromise) {
    return waitForPromiseWithSignal(_referenceClipCutProbePromise, signal);
  }

  const request = (async () => {
    const capabilityProbe = await probeReferenceClipCutCapabilityEndpoint();
    if (capabilityProbe) {
      if (capabilityProbe.supported) {
        return cacheReferenceClipCutProbeSuccess();
      }
      return capabilityProbe;
    }

    return probeReferenceClipCutEndpointViaCut();
  })();

  _referenceClipCutProbePromise = request.finally(() => {
    _referenceClipCutProbePromise = null;
  });
  return waitForPromiseWithSignal(_referenceClipCutProbePromise, signal);
}

function markReferenceClipCutSupported(
  status: VideoReferenceCompanionStatus,
): VideoReferenceCompanionStatus {
  if (status.ffmpegCutSupported) return status;
  return cacheCompanionStatus({
    ...status,
    services: status.services.includes('ffmpeg-cut') ? status.services : [...status.services, 'ffmpeg-cut'],
    ffmpegCutSupported: true,
    needsFfmpegCutUpdate: false,
  });
}

async function ensureReferenceClipCutSupport(signal?: AbortSignal): Promise<VideoReferenceCompanionStatus> {
  const status = await getVideoReferenceCompanionStatus({ signal, force: true });
  if (!status.available) {
    clearReferenceClipCutProbeSuccessCache();
    throw new Error('레퍼런스 클립 다운로드에는 컴패니언 앱이 필요합니다. 컴패니언을 실행한 뒤 다시 시도해주세요.');
  }
  if (_referenceClipCutProbeSucceeded) {
    return markReferenceClipCutSupported(status);
  }
  const probe = await probeReferenceClipCutEndpoint(signal);
  if (probe.pending) {
    throw new Error(probe.errorMessage || REFERENCE_CLIP_CUT_PENDING_MESSAGE);
  }
  if (!status.ffmpegCutSupported && !probe.endpointAvailable) {
    throw new Error(buildReferenceClipCompanionUpdateMessage(status.version));
  }
  if (probe.errorMessage) {
    throw new Error(probe.errorMessage);
  }
  if (!probe.supported) {
    throw new Error(REFERENCE_CLIP_CUT_PENDING_MESSAGE);
  }
  return markReferenceClipCutSupported(status);
}

export async function downloadAndTrimReferenceClip(
  videoId: string,
  startSec: number,
  endSec: number,
  options?: {
    signal?: AbortSignal;
    videoTitle?: string;
    force?: boolean;
  },
): Promise<ReferenceClipDownloadResult> {
  if (options?.signal?.aborted) throw createAbortError();
  const safeStart = Number.isFinite(startSec) ? Math.max(0, startSec) : 0;
  const safeEnd = Number.isFinite(endSec) ? Math.max(safeStart + 0.1, endSec) : safeStart + 0.1;
  const key = buildReferenceClipKey(videoId, safeStart, safeEnd);

  // 1) 완료된 결과 캐시 확인 (hit 시 recency 갱신)
  if (!options?.force) {
    const cached = referenceClipResultCache.get(key);
    if (cached) {
      referenceClipResultCache.delete(key);
      referenceClipResultCache.set(key, cached);
      return waitForPromiseWithSignal(Promise.resolve(cached), options?.signal);
    }
    // 2) in-flight 중복 방지
    const inflight = referenceClipInflight.get(key);
    if (inflight) {
      if (inflight.controller.signal.aborted) {
        referenceClipInflight.delete(key);
      } else {
        return waitForReferenceClipInflight(inflight, options?.signal);
      }
    }
  }

  const controller = new AbortController();
  const promise = (async () => {
    await ensureReferenceClipCutSupport(controller.signal);

    // 같은 videoId의 원본을 가져오기 — 완료 캐시(LRU 갱신) → in-flight → 새 다운로드
    let sourceBlob = sourceVideoResultCache.get(videoId) || null;
    if (sourceBlob) {
      sourceVideoResultCache.delete(videoId);
      sourceVideoResultCache.set(videoId, sourceBlob);
    }
    if (!sourceBlob) {
      let inflightSource = sourceVideoInflight.get(videoId);
      if (!inflightSource) {
        inflightSource = downloadCompanionVideoBlob(videoId, {
          quality: '1080p',
          videoOnly: true,
          reason: 'reference',
        });
        sourceVideoInflight.set(videoId, inflightSource);
      }
      try {
        sourceBlob = await inflightSource;
      } finally {
        if (sourceVideoInflight.get(videoId) === inflightSource) {
          sourceVideoInflight.delete(videoId);
        }
      }
    }
    if (!sourceBlob) {
      throw new Error('원본 YouTube 영상을 내려받지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    pushToSourceCache(videoId, sourceBlob);

    return trimReferenceClipWithCompanion(sourceBlob, {
      videoId,
      startSec: safeStart,
      endSec: safeEnd,
      videoTitle: options?.videoTitle,
      signal: controller.signal,
    });
  })();

  const inflightEntry: ReferenceClipInflightEntry = {
    promise,
    controller,
    consumerCount: 0,
  };
  referenceClipInflight.set(key, inflightEntry);
  void promise
    .then((result) => {
      pushToResultCache(key, result);
    })
    .finally(() => {
      if (referenceClipInflight.get(key) === inflightEntry) {
        referenceClipInflight.delete(key);
      }
    });
  return waitForReferenceClipInflight(inflightEntry, options?.signal);
}

export async function downloadAllReferenceClips(
  scenes: Scene[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number, item: SceneReferenceClipDownloadResult) => void;
  },
): Promise<SceneReferenceClipDownloadResult[]> {
  const targets = scenes.flatMap((scene) =>
    (scene.videoReferences || []).map((ref, refIndex) => ({ sceneId: scene.id, refIndex, ref })),
  );

  const results: SceneReferenceClipDownloadResult[] = [];
  const failures: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (options?.signal?.aborted) break;
    const target = targets[i];
    try {
      const downloaded = await downloadAndTrimReferenceClip(
        target.ref.videoId,
        target.ref.startSec,
        target.ref.endSec,
        {
          signal: options?.signal,
          videoTitle: target.ref.videoTitle,
        },
      );
      const item: SceneReferenceClipDownloadResult = {
        ...downloaded,
        sceneId: target.sceneId,
        refIndex: target.refIndex,
        ref: target.ref,
      };
      results.push(item);
      options?.onProgress?.(results.length, targets.length, item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      logger.warn('[VideoRef] 개별 클립 다운로드 실패', `${target.ref.videoId} ${msg}`);
      failures.push(`${target.ref.videoTitle || target.ref.videoId}: ${msg}`);
    }
  }
  if (results.length === 0 && failures.length > 0) {
    throw new Error(`모든 레퍼런스 클립 다운로드 실패:\n${failures.slice(0, 5).join('\n')}`);
  }
  if (failures.length > 0) {
    logger.warn('[VideoRef] 일부 클립 실패', `성공 ${results.length}/${targets.length}, 실패: ${failures.length}`);
  }
  return results;
}

/** 편집 가이드 시트 생성 — 장면별 소스 클립 + 타임코드 텍스트 목록 */
export function generateEditGuideSheet(scenes: Scene[]): string {
  const lines: string[] = [
    '# 편집 가이드 시트',
    `# 생성: ${new Date().toLocaleString('ko-KR')}`,
    `# 총 장면: ${scenes.length}개`,
    '',
    '─'.repeat(60),
    '',
  ];

  scenes.forEach((scene, i) => {
    const refs = scene.videoReferences || [];
    lines.push(`## 장면 ${i + 1}`);
    lines.push(`대본: ${getVideoReferenceScenePrimaryText(scene).slice(0, 80)}`);
    if (scene.audioDuration) {
      lines.push(`TTS 길이: ${scene.audioDuration.toFixed(1)}초`);
    }
    if (refs.length > 0) {
      refs.forEach((ref, j) => {
        lines.push(`  클립 ${j + 1}: [${ref.videoTitle}]`);
        lines.push(`    URL: https://www.youtube.com/watch?v=${ref.videoId}&t=${ref.startSec}`);
        lines.push(`    구간: ${formatTime(ref.startSec)} ~ ${formatTime(ref.endSec)} (${ref.endSec - ref.startSec}초)`);
        lines.push(`    채널: ${ref.channelTitle}`);
        lines.push(`    관련도: ${Math.round(ref.matchScore * 100)}%`);
        if (ref.segmentText) lines.push(`    내용: ${ref.segmentText}`);
      });
    } else {
      lines.push('  (소스 클립 미지정)');
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function cancelVideoReferenceSearch() {
  _batchRunId++;
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = null;
}

/**
 * [#preset3] 레퍼런스 클립 준비 실패 메시지가 컴패니언 호환성 이슈인지 판별.
 * nleExportService에서 장면 미디어 누락 처리 시 구체적인 컴패니언 업데이트 안내를 띄우기 위해 사용.
 */
export function isReferenceClipCompatibilityErrorMessage(message: string): boolean {
  if (!message) return false;
  return /\/api\/ffmpeg\/cut|컴패니언\s*v?1\.3\.0\s*이상|레퍼런스 클립 잘라내기/i.test(message);
}
