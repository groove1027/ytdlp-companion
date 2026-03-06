
import { getRemoveBgKey, monitoredFetch } from './apiService';
import { logger } from './LoggerService';

const REMOVE_BG_API_URL = 'https://api.remove.bg/v1.0/removebg';

export const removeBackground = async (imageFile: File): Promise<File> => {
    const apiKey = getRemoveBgKey();
    if (!apiKey) {
        throw new Error("Remove.bg API Key가 설정되지 않았습니다.");
    }

    const formData = new FormData();
    formData.append('image_file', imageFile);
    formData.append('size', 'preview'); // 무료 크레딧 효율성 (월 50회 무료)
    formData.append('format', 'png');

    logger.info(`✂️ Remove.bg Request: ${imageFile.name} (size: preview)`);

    try {
        const response = await monitoredFetch(REMOVE_BG_API_URL, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            },
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
            } catch (e) {}
            
            if (response.status === 402) {
                errorMsg = "크레딧이 부족합니다 (Payment Required).";
            } else if (response.status === 403) {
                errorMsg = "API Key가 유효하지 않습니다.";
            }

            logger.error(`❌ Remove.bg Failed: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const blob = await response.blob();
        const processedFile = new File([blob], `no-bg-${imageFile.name.replace(/\.[^/.]+$/, "")}.png`, { type: 'image/png' });
        
        logger.success(`✅ Background Removed Successfully!`);
        return processedFile;

    } catch (error: any) {
        logger.error("Remove.bg Exception", error);
        throw error;
    }
};
