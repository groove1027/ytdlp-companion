/**
 * retryImport.ts
 * 배포 후 chunk 해시 변경 시 동적 import 실패를 자동 복구하는 유틸리티.
 * - retryImport: bare `await import()` 용 (1회 재시도 + 자동 리로드)
 * - lazyRetry: React.lazy() 용 (동일 로직)
 */

import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = '__chunk_reload';

function isChunkError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('Failed to fetch dynamically imported module')
      || err.message.includes('Loading chunk')
      || err.message.includes('Loading CSS chunk')
      || err.message.includes('error loading dynamically imported module');
  }
  return false;
}

function handleChunkFailure(): never {
  const reloaded = sessionStorage.getItem(RELOAD_KEY);
  if (!reloaded) {
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.reload();
  }
  throw new Error('Failed to fetch dynamically imported module');
}

/**
 * bare `await import()` 호출을 감싸는 래퍼.
 * 1회 재시도 후 실패 시 페이지 자동 리로드.
 *
 * @example
 * const { cutClips } = await retryImport(() => import('../services/webcodecs/clipCutter'));
 */
export async function retryImport<T>(importFn: () => Promise<T>): Promise<T> {
  try {
    return await importFn();
  } catch (firstErr) {
    if (!isChunkError(firstErr)) throw firstErr;
    // 1회 재시도
    try {
      return await importFn();
    } catch {
      handleChunkFailure();
    }
  }
}

/**
 * React.lazy()를 감싸는 래퍼.
 * 청크 로딩 실패 시 1회 재시도 + 자동 리로드.
 *
 * @example
 * const MyTab = lazyRetry(() => import('./tabs/MyTab'));
 */
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(() =>
    importFn().catch(() =>
      importFn().catch(() => {
        handleChunkFailure();
      })
    )
  );
}
