
import { getRemoveBgKey, monitoredFetch } from './apiService';
import { logger } from './LoggerService';
import { isCompanionDetected } from './ytdlpApiService';

const REMOVE_BG_API_URL = 'https://api.remove.bg/v1.0/removebg';
const COMPANION_URL = 'http://localhost:9876';

/** File → Base64 변환 헬퍼 */
async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export const removeBackground = async (imageFile: File): Promise<File> => {
    // 1순위: 컴패니언 로컬 rembg (무료, 무제한, 풀사이즈)
    // [FIX #914] base64 인코딩이 무거우므로 isCompanionDetected()를 최적화 게이트로 유지
    // health handler 캐싱 수정으로 이 값이 정확해짐
    if (isCompanionDetected()) {
        try {
            logger.info(`✂️ [Companion] rembg 로컬 배경 제거: ${imageFile.name}`);
            const b64 = await fileToBase64(imageFile);
            const res = await fetch(`${COMPANION_URL}/api/remove-bg`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: b64 }),
                signal: AbortSignal.timeout(60000),
            });

            if (res.ok) {
                const data = await res.json();
                const binaryStr = atob(data.image);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'image/png' });
                logger.success('✅ [Companion] 배경 제거 성공 (로컬 rembg)');
                return new File([blob], `no-bg-${imageFile.name.replace(/\.[^/.]+$/, '')}.png`, { type: 'image/png' });
            }
            logger.warn('[Companion] rembg 실패 — Remove.bg API 폴백');
        } catch (e) {
            logger.warn('[Companion] rembg 실패 — Remove.bg API 폴백:', e instanceof Error ? e.message : '');
        }
    }

    // 2순위: Remove.bg API (기존 로직)
    const apiKey = getRemoveBgKey();
    if (!apiKey) {
        throw new Error("Remove.bg API Key가 설정되지 않았습니다. 헬퍼 앱을 설치하면 무료로 사용 가능합니다.");
    }

    const formData = new FormData();
    formData.append('image_file', imageFile);
    formData.append('size', 'preview');
    formData.append('format', 'png');

    logger.info(`✂️ Remove.bg Request: ${imageFile.name} (size: preview)`);

    try {
        const response = await monitoredFetch(REMOVE_BG_API_URL, {
            method: 'POST',
            headers: { 'X-Api-Key': apiKey },
            body: formData,
        });

        if (!response.ok) {
            const errText = await response.text();
            let errorMsg = `Remove.bg Error ${response.status}`;
            try {
                const errJson = JSON.parse(errText);
                if (errJson.errors && errJson.errors[0]) {
                    errorMsg = errJson.errors[0].title || errorMsg;
                }
            } catch (e) { logger.trackSwallowedError('RemoveBgService:removeBackground/parseError', e); }

            if (response.status === 402) errorMsg = "크레딧이 부족합니다 (Payment Required).";
            else if (response.status === 403) errorMsg = "API Key가 유효하지 않습니다.";

            logger.error(`❌ Remove.bg Failed: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const blob = await response.blob();
        const processedFile = new File([blob], `no-bg-${imageFile.name.replace(/\.[^/.]+$/, "")}.png`, { type: 'image/png' });
        logger.success(`✅ Background Removed Successfully!`);
        return processedFile;

    } catch (error: unknown) {
        logger.error("Remove.bg Exception", error instanceof Error ? error.message : '');
        throw error;
    }
};
