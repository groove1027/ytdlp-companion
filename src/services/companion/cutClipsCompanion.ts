/**
 * cutClipsCompanion.ts — [v2.0.2] 컴패니언 native FFmpeg로 클립 자르기
 *
 * 동기:
 *   editPointStore.quickExportClips는 WebCodecs(`webcodecs/clipCutter.ts`)만 사용 중인데
 *   WebCodecs는 H.264(avc) 코덱만 지원한다. 요즘 1080p YouTube 영상은 av1으로 받는 게
 *   기본이라 사용자 대부분이 "리먹싱은 H.264(avc) 코덱만 지원합니다" 에러를 본다 (#1080).
 *
 * 해결:
 *   컴패니언이 가용 + ffmpeg-cut endpoint 지원 시 native FFmpeg로 자르면
 *   - 모든 코덱 (av1, hevc, h264, vp9, prores 등) 100% 지원
 *   - WebCodecs 대비 5~15배 빠름
 *   - 브라우저 코덱 제약 없이 처리 가능
 *
 * 호출 패턴: youtubeReferenceService::trimReferenceClipWithCompanion 그대로 재사용
 *           (이미 검증된 /api/ffmpeg/cut 통신 패턴)
 *
 * 반환: 서버가 만든 ZIP을 그대로 Blob으로 돌려준다 (clipCutter::cutClips와 동일 시그니처).
 */

import { monitoredFetch } from '../apiService';
import { isCompanionDetected } from '../ytdlpApiService';
import { logger } from '../LoggerService';

const COMPANION_URL = 'http://127.0.0.1:9876';
const CUT_TIMEOUT_MS = 10 * 60 * 1000; // 10분 — 큰 영상 + 다클립 여유
const ABORT_ERROR_NAME = 'AbortError';

export interface CompanionClipRange {
  label: string;
  startSec: number;
  endSec: number;
}

interface CompanionCutResponse {
  data?: string; // base64 ZIP
  format?: string;
  size?: number;
  clipCount?: number;
  error?: string;
}

interface HealthPayload {
  app?: string;
  version?: string;
  services?: string[];
}

let cachedCutSupport: { ts: number; ok: boolean } | null = null;
const CACHE_MS = 30_000;

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
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/**
 * 컴패니언이 가용 + ffmpeg-cut endpoint 지원하는지 확인 (캐시 30초)
 */
export async function isCompanionFfmpegCutAvailable(signal?: AbortSignal): Promise<boolean> {
  // 동기 fast-path: 컴패니언 자체가 감지되지 않으면 곧바로 false
  if (!isCompanionDetected()) return false;
  assertNotAborted(signal);
  const now = Date.now();
  if (cachedCutSupport && now - cachedCutSupport.ts < CACHE_MS) {
    return cachedCutSupport.ok;
  }
  try {
    const res = await monitoredFetch(
      `${COMPANION_URL}/health`,
      { signal },
      5000,
    );
    if (!res.ok) {
      cachedCutSupport = { ts: now, ok: false };
      return false;
    }
    const data = (await res.json().catch(() => null)) as HealthPayload | null;
    const ok =
      data?.app === 'ytdlp-companion' &&
      Array.isArray(data.services) &&
      data.services.includes('ffmpeg-cut');
    cachedCutSupport = { ts: now, ok };
    return ok;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw createAbortError();
    }
    cachedCutSupport = { ts: now, ok: false };
    return false;
  }
}

/**
 * 컴패니언 캐시 무효화 — 사용자가 컴패니언을 새로 깔거나 종료했을 때 호출.
 */
export function clearCompanionFfmpegCutCache(): void {
  cachedCutSupport = null;
}

function guessBlobExtension(file: File | Blob): string {
  const type = (file.type || '').toLowerCase();
  if (type.includes('quicktime')) return 'mov';
  if (type.includes('webm')) return 'webm';
  if (type.includes('matroska') || type.includes('mkv')) return 'mkv';
  if (type.includes('ogg')) return 'ogv';
  // File 객체면 이름에서 확장자 추정
  if (file instanceof File && file.name) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,4}$/.test(ext)) return ext;
  }
  return 'mp4';
}

async function fileToBase64(file: File | Blob, signal?: AbortSignal): Promise<string> {
  assertNotAborted(signal);
  const buffer = await file.arrayBuffer();
  assertNotAborted(signal);
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    assertNotAborted(signal);
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  assertNotAborted(signal);
  return btoa(binary);
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 소스 영상 1개를 컴패니언 native FFmpeg로 클립별 자르기 → ZIP Blob 반환.
 *
 * - 모든 코덱 지원 (WebCodecs와 달리 H.264 한정 X)
 * - 현재는 JSON base64 업로드라 매우 큰 입력은 메모리 부담이 있다
 * - 5~15배 빠름
 *
 * 실패 시 throw — 호출처가 catch해서 WebCodecs 폴백을 시도한다.
 */
export async function cutClipsViaCompanion(
  sourceFile: File,
  clips: CompanionClipRange[],
  onProgress?: (progress: number, message: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (clips.length === 0) {
    throw new Error('자를 클립이 없습니다.');
  }
  assertNotAborted(signal);

  onProgress?.(5, '컴패니언으로 영상 전송 중...');

  // base64 인코딩 (대용량 메모리 부담은 있지만 youtubeReferenceService와 동일 패턴)
  const base64Input = await fileToBase64(sourceFile, signal);
  assertNotAborted(signal);
  onProgress?.(20, '컴패니언이 영상을 자르는 중...');

  const payload = {
    input: base64Input,
    inputFormat: guessBlobExtension(sourceFile),
    clips: clips.map((c) => ({
      label: c.label,
      startSec: c.startSec,
      endSec: c.endSec,
    })),
  };

  let response: Response;
  try {
    response = await monitoredFetch(
      `${COMPANION_URL}/api/ffmpeg/cut`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      },
      CUT_TIMEOUT_MS,
    );
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw createAbortError();
    }
    clearCompanionFfmpegCutCache();
    throw error;
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      clearCompanionFfmpegCutCache();
      throw new Error('컴패니언이 ffmpeg-cut 엔드포인트를 지원하지 않습니다 (v1.3.0+ 필요).');
    }
    const text = await response.text().catch(() => '');
    throw new Error(text || `컴패니언 클립 자르기 실패 (HTTP ${response.status})`);
  }

  const data = (await response.json()) as CompanionCutResponse;
  if (!data || typeof data.data !== 'string' || !data.data) {
    throw new Error(data?.error || '컴패니언 응답에 ZIP 데이터가 비어 있습니다.');
  }

  onProgress?.(95, 'ZIP 다운로드 중...');
  assertNotAborted(signal);
  const bytes = decodeBase64ToUint8Array(data.data);
  // Uint8Array → Blob — TS 5.7+ BlobPart 호환: ArrayBuffer를 명시 캐스트
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  logger.info('[CompanionCut] 클립 자르기 완료', {
    clips: clips.length,
    sizeMB: (blob.size / 1024 / 1024).toFixed(1),
    sourceMB: (sourceFile.size / 1024 / 1024).toFixed(1),
  });
  onProgress?.(100, '완료!');
  return blob;
}
