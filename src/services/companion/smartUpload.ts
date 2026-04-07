/**
 * smartUpload.ts — 파일 → URL 변환 자동 분기
 *
 * 컴패니언 터널이 가용 + 파일이 충분히 크면 → 컴패니언 터널 (무료, 빠름, 무손실)
 * 그 외에는 → Cloudinary 폴백 (기존 동작)
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

/** 터널 우선 적용 임계값 — 이 크기보다 작으면 Cloudinary 그대로 사용 (UX 차이 거의 없음) */
const TUNNEL_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

export interface SmartUploadResult {
  /** 외부 API에 전달할 URL */
  url: string;
  /** 사용 후 호출해야 하는 정리 함수 (try/finally 권장) */
  cleanup: () => Promise<void>;
  /** 어느 경로로 처리됐는지 (디버깅/로깅용) */
  source: 'tunnel' | 'cloudinary';
  /** 터널인 경우 토큰 (모니터링용) */
  tunnelToken?: string;
}

export interface SmartUploadOptions {
  signal?: AbortSignal;
  /**
   * 영구 저장이 필요한 경우 (예: 프로젝트 갤러리 이미지) → 무조건 Cloudinary 사용.
   * 분석/생성 호출 1회만 쓰고 끝나는 경우는 false (기본).
   */
  forceCloudinary?: boolean;
  /** 터널 TTL 오버라이드 (초) */
  ttlSecs?: number;
}

/**
 * 파일을 분석/전송 가능한 URL로 변환.
 *
 * 분기 규칙:
 *   1. forceCloudinary=true → Cloudinary
 *   2. 파일 크기 < TUNNEL_THRESHOLD_BYTES → Cloudinary (오버헤드 최소화)
 *   3. 컴패니언 터널 가용 → 터널
 *   4. 그 외 → Cloudinary 폴백
 *
 * 어떤 경로든 실패 시 자동으로 Cloudinary 폴백.
 */
export async function smartUpload(
  file: File,
  options: SmartUploadOptions = {},
): Promise<SmartUploadResult> {
  // 1+2: 강제 Cloudinary 또는 작은 파일
  if (options.forceCloudinary || file.size < TUNNEL_THRESHOLD_BYTES) {
    const url = await uploadMediaToHosting(file, undefined, options.signal);
    return {
      url,
      cleanup: async () => {},
      source: 'cloudinary',
    };
  }

  // (Codex 프론트 1차 Low) abort 사전 검사 — abort 시 즉시 throw
  if (options.signal?.aborted) {
    throw new DOMException('업로드가 취소되었습니다.', 'AbortError');
  }

  // 3: 컴패니언 터널 가용 확인 → 사용
  let tunnelOk = false;
  try {
    tunnelOk = await isTunnelAvailable(options.signal);
  } catch (e) {
    // (Codex 프론트 1차 Low) abort는 즉시 전파, 그 외만 swallow
    if ((e as any)?.name === 'AbortError' || options.signal?.aborted) {
      throw e;
    }
    logger.trackSwallowedError('smartUpload.isTunnelAvailable', e);
  }

  if (tunnelOk) {
    try {
      const handle = await openTunnelForFile(file, {
        ttlSecs: options.ttlSecs ?? 600, // 분석은 평균 60~120초, 여유 있게 10분
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
      // (Codex 프론트 1차 Low) abort는 폴백 없이 즉시 전파
      if ((e as any)?.name === 'AbortError' || options.signal?.aborted) {
        throw e;
      }
      // 그 외 에러 → 자동 Cloudinary 폴백
      logger.warn('[SmartUpload] 터널 실패 → Cloudinary 폴백', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 4: Cloudinary 폴백
  const url = await uploadMediaToHosting(file, undefined, options.signal);
  return {
    url,
    cleanup: async () => {},
    source: 'cloudinary',
  };
}
