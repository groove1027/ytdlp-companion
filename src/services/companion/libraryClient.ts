/**
 * libraryClient.ts — [v2.0 Phase 4] 로컬 미디어 라이브러리
 *
 * 컴패니언이 사용자 디스크의 폴더를 스캔하여 미디어 파일 목록 반환.
 * 사용 예:
 *   - 로컬 영상 라이브러리 시맨틱 검색
 *   - 음악 라이브러리 스타일 매칭
 *   - 캐릭터 사진첩 자동 등록
 *
 * 보안: 사용자 홈 디렉터리(~) 안의 폴더만 허용
 */

import { monitoredFetch } from '../apiService';
import { logger } from '../LoggerService';

const COMPANION_URL = 'http://127.0.0.1:9876';

export interface LibraryFileEntry {
  path: string;
  name: string;
  sizeBytes: number;
  mime: string;
  modifiedUnix: number;
}

export interface LibraryScanResult {
  ok: boolean;
  dir: string;
  totalFound: number;
  files: LibraryFileEntry[];
  truncated: boolean;
}

export interface LibraryScanOptions {
  /** 파일 타입 필터 */
  filter?: 'video' | 'image' | 'audio' | 'all';
  /** 재귀 스캔 (서브 디렉터리까지) */
  recursive?: boolean;
  /** 최대 결과 개수 (기본 500, 최대 2000) */
  maxResults?: number;
  /** AbortSignal */
  signal?: AbortSignal;
}

interface LibraryScanApiFile {
  path: string;
  name: string;
  size_bytes: number;
  mime: string;
  modified_unix: number;
}

interface LibraryScanApiResponse {
  ok?: boolean;
  dir?: string;
  total_found?: number;
  files?: LibraryScanApiFile[];
  truncated?: boolean;
  error?: string;
}

interface LibraryFileInfoApiResponse {
  ok?: boolean;
  path?: string;
  name?: string;
  size_bytes?: number;
  mime?: string;
  is_video?: boolean;
  is_image?: boolean;
  is_audio?: boolean;
  error?: string;
}

/**
 * 로컬 폴더를 스캔하여 미디어 파일 목록 반환
 *
 * @param dir 절대 경로 (사용자 홈 디렉터리 안)
 * @example
 *   const result = await scanLibrary('/Users/me/Movies/B-roll', {
 *     filter: 'video',
 *     recursive: true,
 *   });
 *   console.log(`${result.files.length} videos found`);
 */
export async function scanLibrary(
  dir: string,
  options: LibraryScanOptions = {},
): Promise<LibraryScanResult> {
  const body = {
    dir,
    filter: options.filter ?? 'all',
    recursive: options.recursive ?? false,
    max_results: options.maxResults ?? 500,
  };

  const res = await monitoredFetch(`${COMPANION_URL}/api/library/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as LibraryScanApiResponse;
    throw new Error(`라이브러리 스캔 실패: ${errBody.error || res.statusText}`);
  }

  const data = (await res.json()) as LibraryScanApiResponse;
  if (!data.ok || !data.dir) {
    throw new Error(`라이브러리 스캔 실패: ${data.error || 'unknown'}`);
  }

  logger.info('[Library] 스캔 완료', {
    dir: data.dir,
    totalFound: data.total_found ?? 0,
    returned: data.files?.length || 0,
  });

  return {
    ok: true,
    dir: data.dir,
    totalFound: data.total_found ?? 0,
    files: (data.files || []).map((f) => ({
      path: f.path,
      name: f.name,
      sizeBytes: f.size_bytes,
      mime: f.mime,
      modifiedUnix: f.modified_unix,
    })),
    truncated: data.truncated || false,
  };
}

/**
 * 단일 파일의 메타데이터 조회
 */
export async function getFileInfo(absolutePath: string, signal?: AbortSignal): Promise<{
  path: string;
  name: string;
  sizeBytes: number;
  mime: string;
  isVideo: boolean;
  isImage: boolean;
  isAudio: boolean;
}> {
  const res = await monitoredFetch(`${COMPANION_URL}/api/library/file-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: absolutePath }),
    signal,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as LibraryFileInfoApiResponse;
    throw new Error(`파일 정보 조회 실패: ${errBody.error || res.statusText}`);
  }
  const data = (await res.json()) as LibraryFileInfoApiResponse;
  if (!data.ok || !data.path || !data.name || !data.mime) {
    throw new Error(`파일 정보 조회 실패: ${data.error || 'invalid_response'}`);
  }
  return {
    path: data.path,
    name: data.name,
    sizeBytes: data.size_bytes ?? 0,
    mime: data.mime,
    isVideo: data.is_video ?? false,
    isImage: data.is_image ?? false,
    isAudio: data.is_audio ?? false,
  };
}
