
import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';
import { isCompanionDetected } from './ytdlpApiService';
import { openTunnelForFile, isTunnelAvailable } from './companion/tunnelClient';
import { useUIStore } from '../stores/uiStore';

const PRIVACY_MODE_STORAGE_KEY = 'PRIVACY_MODE_ENABLED';
export const PRIVACY_MODE_CHANGE_EVENT = 'privacy-mode-change';

/**
 * [v2.0.1] AI 영상 분석 파일 크기 한도 — 100 MB
 *
 * 라이브 검증 (2026-04-07):
 *   - 84MB / 31분 영상 → ✅ Evolink Gemini 정상 분석 (VIDEO 121k + AUDIO 47k 토큰)
 *   - 165MB / 63분 영상 → ❌ Google Gemini 백엔드가 "Request contains an invalid argument" 거절
 * Google Gemini API의 임의 HTTPS URL fileData fetch 한도가 정확하게 공개되지 않으나
 * 100~150MB 사이에서 거절이 시작된다. 안전 마진 100MB로 사전 차단.
 *
 * 1080p 기준: 약 5~8분, 720p 기준: 약 10~15분, 480p 기준: 약 20~30분이 100MB 이내.
 * 더 긴 영상은 사용자가 직접 화질을 낮추거나 짧게 잘라서 다시 업로드해야 한다.
 */
export const VIDEO_ANALYSIS_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_ANALYSIS_MAX_MB_LABEL = '100MB';

/**
 * 영상 분석에 보낼 파일이 100MB를 초과하면 사용자 친화적 에러를 throw.
 * 분석 wrapper와 UI 입력 핸들러가 모두 동일한 메시지를 사용하도록 일원화.
 */
export function ensureVideoSizeForAnalysis(
  file: { name?: string; size?: number },
): void {
  const sizeBytes = file.size ?? 0;
  if (sizeBytes <= VIDEO_ANALYSIS_MAX_BYTES) return;
  const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);
  const fileName = file.name ?? '영상';
  throw new Error(
    `🎬 "${fileName}"는 ${sizeMb}MB라 AI 영상 분석에 사용할 수 없습니다.\n` +
    `현재 한도는 ${VIDEO_ANALYSIS_MAX_MB_LABEL}이며, 더 큰 영상은 Google Gemini가 거절합니다.\n\n` +
    `해결 방법:\n` +
    `• 1080p → 720p 또는 480p로 화질을 낮춰서 다시 다운로드\n` +
    `• 영상을 짧게 잘라 (예: 10분 단위) 분할 업로드\n` +
    `• 1080p 기준 약 5~8분, 720p 기준 약 10~15분이 ${VIDEO_ANALYSIS_MAX_MB_LABEL} 이내`
  );
}

/**
 * 영상 분석 한도 안내 한 줄 (배너/툴팁용).
 * UI 컴포넌트가 import해서 일관되게 사용.
 */
export const VIDEO_ANALYSIS_SIZE_HINT =
  `AI 분석은 영상당 ${VIDEO_ANALYSIS_MAX_MB_LABEL} 이하만 가능 (1080p 약 5~8분 / 720p 약 10~15분)`;

/**
 * [v2.0 Phase 4-1] 사적 콘텐츠 안전 모드 (Privacy Mode)
 *
 * 사용자가 활성화하면 모든 업로드가 컴패니언 터널만 사용 (Cloudinary 사용 X).
 * 컴패니언 미가용 시 업로드 차단 (저작권/개인정보 보호).
 *
 * localStorage key: 'PRIVACY_MODE_ENABLED' = 'true'/'false'
 */
export const isPrivacyModeEnabled = (): boolean => {
  try {
    return localStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setPrivacyModeEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(PRIVACY_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<{ enabled: boolean }>(PRIVACY_MODE_CHANGE_EVENT, {
        detail: { enabled },
      }));
    }
  } catch {}
};

/**
 * [v3.1] uploadMediaToHosting — 컴패니언 터널 전용 업로드 함수
 *
 * Cloudinary 완전 제거 (#1163). 모든 파일 업로드는 컴패니언 터널 사용.
 * 컴패니언 미감지 시 CompanionGateModal을 띄우고 에러 throw.
 *
 * cleanup: 터널 URL은 25분 TTL로 자동 만료. 호출처는 cleanup 호출 불필요.
 */
export const uploadMediaToHosting = async (file: File, _unusedKey?: string, signal?: AbortSignal): Promise<string> => {
  // 컴패니언 미감지 → CompanionGateModal 표시 + 에러
  if (!isCompanionDetected()) {
    useUIStore.getState().setShowCompanionGate(true);
    throw new Error('올인원 헬퍼(컴패니언)가 필요합니다. 설치 후 다시 시도해주세요.');
  }

  const tunnelOk = await isTunnelAvailable(signal);
  if (!tunnelOk) {
    throw new Error('컴패니언 터널 준비 중입니다. 잠시 후 다시 시도해주세요.');
  }

  const handle = await openTunnelForFile(file, { ttlSecs: 1500, signal });
  logger.info('[Upload] 컴패니언 터널 사용', { sizeMB: (file.size / 1024 / 1024).toFixed(1) });
  return handle.url;
};

/**
 * [v3.1] uploadMediaPermanent — uploadMediaToHosting과 동일 (하위 호환 래퍼)
 *
 * 기존 Cloudinary 직접 업로드를 제거하고 컴패니언 터널로 통합.
 * 기존 import를 깨뜨리지 않기 위한 re-export.
 */
export const uploadMediaPermanent = uploadMediaToHosting;

/**
 * [v3.1] uploadRemoteUrlToCloudinary → 컴패니언 터널 프록시로 대체
 *
 * 원격 URL을 fetch → blob → 컴패니언 터널에 업로드하여 CORS 우회.
 * 함수명은 하위 호환을 위해 유지하되 Cloudinary는 사용하지 않음.
 */
export const uploadRemoteUrlToCloudinary = async (remoteUrl: string): Promise<string> => {
  logger.info(`[Proxy] 원격 URL 프록시 시작: ${remoteUrl.substring(0, 80)}...`);

  // 컴패니언 미감지 → 원본 URL 그대로 반환 (최선의 폴백)
  if (!isCompanionDetected()) {
    logger.warn('[Proxy] 컴패니언 미감지 → 원본 URL 반환');
    return remoteUrl;
  }

  try {
    const tunnelOk = await isTunnelAvailable();
    if (!tunnelOk) {
      logger.warn('[Proxy] 터널 미가용 → 원본 URL 반환');
      return remoteUrl;
    }

    // 원격 URL → fetch → blob → File → 터널 업로드
    const resp = await fetch(remoteUrl);
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
    const blob = await resp.blob();
    const ext = blob.type.includes('video') ? 'mp4' : 'png';
    const file = new File([blob], `proxy_${Date.now()}.${ext}`, { type: blob.type });
    const handle = await openTunnelForFile(file, { ttlSecs: 1500 });
    logger.success(`[Proxy] 터널 프록시 성공: ${handle.url.substring(0, 60)}...`);
    return handle.url;
  } catch (e) {
    logger.warn('[Proxy] 터널 프록시 실패 → 원본 URL 반환', e instanceof Error ? e.message : String(e));
    return remoteUrl;
  }
};

