
import { getCloudinaryConfig, monitoredFetch } from './apiService';
import { logger } from './LoggerService';
import { isCompanionDetected } from './ytdlpApiService';
import { openTunnelForFile, isTunnelAvailable } from './companion/tunnelClient';

const PRIVACY_MODE_STORAGE_KEY = 'PRIVACY_MODE_ENABLED';
export const PRIVACY_MODE_CHANGE_EVENT = 'privacy-mode-change';

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
 * [v2.0 Phase 3] uploadMediaToHosting — 통합 업로드 함수
 *
 * 분기 규칙:
 *   1. Privacy Mode ON + 컴패니언 가용 → 항상 터널 (Cloudinary 차단)
 *   2. Privacy Mode ON + 컴패니언 미가용 → 차단 (Error)
 *   3. 컴패니언 v2.0+ 가용 + 파일 > 5MB → 컴패니언 터널 (무료, 무제한, 빠름)
 *   4. 그 외 → Cloudinary 폴백 (기존 동작)
 *
 * 호출처는 0줄 수정 — 32곳이 자동으로 터널 우선 사용.
 * 영구 저장이 필요한 경우는 uploadMediaPermanent() 사용 (Cloudinary 강제).
 *
 * cleanup: 터널 URL은 25분 TTL로 자동 만료. 호출처는 cleanup 호출 불필요.
 */
export const uploadMediaToHosting = async (file: File, _unusedKey?: string, signal?: AbortSignal): Promise<string> => {
  const privacyMode = isPrivacyModeEnabled();

  // Phase 4-1: Privacy Mode — 컴패니언 터널 강제
  if (privacyMode) {
    if (!isCompanionDetected()) {
      throw new Error('🔒 사적 콘텐츠 안전 모드가 켜져 있습니다. 컴패니언 v2.0+ 설치가 필요합니다.');
    }
    const tunnelOk = await isTunnelAvailable(signal);
    if (!tunnelOk) {
      throw new Error('🔒 사적 콘텐츠 안전 모드: 컴패니언 터널 준비 중입니다. 잠시 후 다시 시도해주세요.');
    }
    const handle = await openTunnelForFile(file, { ttlSecs: 1500, signal });
    logger.info('[Upload] Privacy Mode 터널 사용', { sizeMB: (file.size / 1024 / 1024).toFixed(1) });
    return handle.url;
  }

  // Phase 3: 컴패니언 터널 우선 — 5MB+ 파일 + 컴패니언 가용 시
  const TUNNEL_THRESHOLD = 5 * 1024 * 1024;
  if (file.size > TUNNEL_THRESHOLD && isCompanionDetected()) {
    try {
      const tunnelOk = await isTunnelAvailable(signal);
      if (tunnelOk) {
        const handle = await openTunnelForFile(file, {
          ttlSecs: 1500, // 25분
          signal,
        });
        logger.info('[Upload] 터널 사용', {
          sizeMB: (file.size / 1024 / 1024).toFixed(1),
        });
        return handle.url;
      }
    } catch (e) {
      // AbortError는 즉시 전파, 그 외는 Cloudinary 폴백
      if ((e as any)?.name === 'AbortError' || signal?.aborted) throw e;
      logger.warn('[Upload] 터널 실패 → Cloudinary 폴백', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return uploadMediaPermanent(file, _unusedKey, signal);
};

/**
 * [v2.0 Phase 3] 영구 저장 전용 — 항상 Cloudinary 사용
 *
 * 사용 케이스:
 *   - imageStorageService (프로젝트 이미지 영구 보관)
 *   - UploadTab (SNS 업로드 — 외부 SNS가 fetch)
 *   - 그 외 분석 1회로 끝나지 않고 다른 시점에 다시 fetch가 필요한 모든 경우
 */
export const uploadMediaPermanent = async (file: File, _unusedKey?: string, signal?: AbortSignal): Promise<string> => {
  const { cloudName, uploadPreset } = getCloudinaryConfig();

  if (!cloudName || !uploadPreset) {
    logger.error("Cloudinary Configuration Missing", { cloudName, uploadPreset });
    throw new Error("Cloudinary 설정이 필요합니다. API 설정을 확인해주세요.");
  }

  logger.info(`Cloudinary Upload Start: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);

  // [FIX] 10MB 초과 시 자동 품질 조정으로 Cloudinary 호환성 확보
  let uploadFile: File | Blob = file;
  if (file.size > 10 * 1024 * 1024 && file.type.startsWith('image/')) {
    logger.warn(`Large image detected (${(file.size/1024/1024).toFixed(1)}MB), compressing...`);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        uploadFile = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      }
    } catch (e) { logger.trackSwallowedError('UploadService:uploadMediaToHosting/compression', e); }
  }

  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await monitoredFetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: formData,
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
        const errData = await response.json();
        logger.error("Cloudinary Upload Response Error", errData);
        const rawMsg = errData.error?.message || `Cloudinary Upload Error: ${response.statusText}`;
        // [FIX #219] Upload preset 오류 시 사용자 친화적 안내
        if (rawMsg.includes('Upload preset') || rawMsg.includes('preset')) {
          throw new Error('Cloudinary Upload Preset이 올바르지 않습니다. [프로젝트] 탭 > API 설정에서 Cloudinary Cloud Name과 Upload Preset을 확인해주세요.');
        }
        throw new Error(rawMsg);
    }

    const data = await response.json();
    logger.success(`Cloudinary Upload Success: ${data.secure_url}`);
    return data.secure_url;
  } catch (error: any) {
    logger.error("Cloudinary Upload Exception", error.message);
    throw new Error(error.message || "미디어 파일을 Cloudinary에 업로드하는데 실패했습니다.");
  }
};

// [NEW] Proxy function: Uploads a remote URL to Cloudinary and returns the new Cloudinary URL
// This bypasses CORS restrictions on the original server by letting Cloudinary fetch the data server-side.
export const uploadRemoteUrlToCloudinary = async (remoteUrl: string): Promise<string> => {
  const { cloudName, uploadPreset } = getCloudinaryConfig();
  
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary 설정이 없습니다 (우회 다운로드 불가). API 설정을 확인해주세요.");
  }

  logger.info(`Starting Proxy Upload for: ${remoteUrl}`);

  const formData = new FormData();
  formData.append('file', remoteUrl); // Cloudinary accepts remote URLs here
  formData.append('upload_preset', uploadPreset);
  // Force resource_type to video if likely video, otherwise auto. 
  // 'auto' is generally safest but sometimes misidentifies small videos as images.
  // We'll use 'auto' to be generic, or 'video' if we are sure. 
  // Since this is mostly for videos in this context:
  formData.append('resource_type', 'auto'); 

  try {
    const response = await monitoredFetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
        const errData = await response.json();
        logger.error("Proxy Upload Failed", errData);
        throw new Error(errData.error?.message || "Proxy Upload Failed");
    }

    const data = await response.json();
    logger.success(`Proxy Success. New URL: ${data.secure_url}`);
    // Return the secure_url which allows CORS fetching usually, 
    // or we can use the 'attachment' flag feature of Cloudinary if needed, 
    // but usually fetch(secure_url) works fine in browser.
    return data.secure_url;
  } catch (error: any) {
    logger.error("Proxy Exception", error.message);
    throw error;
  }
};

export const validateCloudinaryConnection = async (cloudName: string, uploadPreset: string): Promise<{ success: boolean; message: string }> => {
  if (!cloudName || !uploadPreset) return { success: false, message: "설정값이 비어있습니다." };
  
  const blob = new Blob(["test"], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('file', blob, "test_connection.txt");
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await monitoredFetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
        const errData = await response.json();
        let errorMsg = errData.error?.message || response.statusText;
        if (errorMsg.includes("unsigned")) errorMsg = "Unsigned Upload가 허용되지 않았거나 Preset 이름이 틀렸습니다.";
        return { success: false, message: `연결 실패: ${errorMsg}` };
    }
    
    return { success: true, message: "연결 성공! (업로드 테스트 완료)" };
  } catch (error: any) {
    return { success: false, message: `네트워크/설정 오류: ${error.message}` };
  }
};
