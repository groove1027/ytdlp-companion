/**
 * zipService.ts — [v2.5] 컴패니언 기반 ZIP 생성
 * 브라우저 JSZip 대체: URL/temp_path 목록 → 컴패니언이 직접 다운로드 → ZIP 생성
 */

import { downloadCompanionTempFile } from './tunnelClient';

const COMPANION_URL = 'http://127.0.0.1:9876';

export interface ZipFileEntry {
  /** 외부 URL (컴패니언이 직접 다운로드) */
  url?: string;
  /** 컴패니언 temp 파일 경로 */
  path?: string;
  /** ZIP 내 파일명 */
  filename: string;
}

/**
 * 컴패니언에 ZIP 생성 요청 → Blob 반환
 */
export async function createZipViaCompanion(
  files: ZipFileEntry[],
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(`${COMPANION_URL}/api/zip/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
    signal: signal ?? AbortSignal.timeout(10 * 60 * 1000), // 10분
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(`ZIP 생성 실패: ${err.error || res.status}`);
  }

  const data = await res.json();
  if (!data?.outputPath) {
    throw new Error('ZIP 생성 응답에 outputPath가 없습니다.');
  }

  // [FIX Codex-10] 부분 실패 경고 — fileCount vs requestedCount 비교
  if (data.fileCount !== undefined && data.requestedCount !== undefined && data.fileCount < data.requestedCount) {
    console.warn(`[ZIP] 부분 실패: ${data.fileCount}/${data.requestedCount}개 파일만 ZIP에 포함됨`);
  }

  return downloadCompanionTempFile(data.outputPath, 'application/zip', signal);
}
