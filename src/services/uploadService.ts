
import { getCloudinaryConfig, monitoredFetch } from './apiService';
import { logger } from './LoggerService';

export const uploadMediaToHosting = async (file: File, _unusedKey?: string, signal?: AbortSignal): Promise<string> => {
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
