/**
 * smartUpload.ts — 파일 → URL 변환 (컴패니언 터널 전용)
 *
 * [v3.1] Cloudinary 제거 — 모든 업로드는 컴패니언 터널 사용.
 * 컴패니언 미감지 시 에러 throw.
 *
 * 호출처:
 *   const upload = await smartUpload(file, { signal });
 *   try {
 *     // upload.url을 Evolink/Gemini 등에 전달
 *   } finally {
 *     await upload.cleanup();
 *   }
 */

import { uploadMediaToHosting } from '../uploadService';
import { logger } from '../LoggerService';
import {
  openTunnelForFile,
  closeTunnel,
  isTunnelAvailable,
} from './tunnelClient';

export interface SmartUploadResult {
  /** 외부 API에 전달할 URL */
  url: string;
  /** 사용 후 호출해야 하는 정리 함수 (try/finally 권장) */
  cleanup: () => Promise<void>;
  /** 어느 경로로 처리됐는지 (디버깅/로깅용) */
  source: 'tunnel';
  /** 터널인 경우 토큰 (모니터링용) */
  tunnelToken?: string;
}

export interface SmartUploadOptions {
  signal?: AbortSignal;
  /** 터널 TTL 오버라이드 (초) */
  ttlSecs?: number;
}

/**
 * 파일을 분석/전송 가능한 URL로 변환.
 *
 * [v3.1] 컴패니언 터널 전용 — Cloudinary 폴백 제거.
 */
export async function smartUpload(
  file: File,
  options: SmartUploadOptions = {},
): Promise<SmartUploadResult> {
  // abort 사전 검사
  if (options.signal?.aborted) {
    throw new DOMException('업로드가 취소되었습니다.', 'AbortError');
  }

  // 컴패니언 터널 사용
  let tunnelOk = false;
  try {
    tunnelOk = await isTunnelAvailable(options.signal);
  } catch (e) {
    if ((e as any)?.name === 'AbortError' || options.signal?.aborted) {
      throw e;
    }
    logger.trackSwallowedError('smartUpload.isTunnelAvailable', e);
  }

  if (tunnelOk) {
    try {
      const handle = await openTunnelForFile(file, {
        ttlSecs: options.ttlSecs ?? 600,
        signal: options.signal,
      });
      logger.info('[SmartUpload] 터널 경로 사용', {
        sizeMB: (file.size / 1024 / 1024).toFixed(1),
      });
      return {
        url: handle.url,
        cleanup: () => closeTunnel(handle.token),
        source: 'tunnel',
        tunnelToken: handle.token,
      };
    } catch (e) {
      if ((e as any)?.name === 'AbortError' || options.signal?.aborted) {
        throw e;
      }
      logger.warn('[SmartUpload] 터널 실패', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 터널 실패 시 uploadMediaToHosting 폴백 (내부에서 컴패니언 재확인)
  const url = await uploadMediaToHosting(file, undefined, options.signal);
  return {
    url,
    cleanup: async () => {},
    source: 'tunnel',
  };
}
