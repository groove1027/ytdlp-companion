
import { FeedbackData } from '../types';
import { getCloudinaryConfig, monitoredFetch } from './apiService';

/** 스크린샷 base64 → Cloudinary 업로드 → URL 반환 */
async function uploadScreenshotToCloudinary(base64DataUri: string): Promise<string> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    if (!cloudName || !uploadPreset) {
        throw new Error('Cloudinary 설정 없음 — 스크린샷 업로드 불가');
    }

    const formData = new FormData();
    formData.append('file', base64DataUri);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'feedback-screenshots');

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error(`Cloudinary upload failed: ${res.status}`);
    }

    const data = await res.json() as { secure_url: string };
    return data.secure_url;
}

export const submitFeedback = async (data: FeedbackData): Promise<boolean> => {
    // 1. 스크린샷이 있으면 Cloudinary에 업로드
    let screenshotUrls: string[] = [];
    if (data.screenshots && data.screenshots.length > 0) {
        const uploads = data.screenshots.map((s) =>
            uploadScreenshotToCloudinary(s.base64).catch(() => null)
        );
        const results = await Promise.all(uploads);
        screenshotUrls = results.filter((url): url is string => url !== null);
    }

    // 2. Pages Function (/api/feedback) 으로 전송 → GitHub Issue 자동 생성
    const payload = {
        type: data.type,
        message: data.message,
        email: data.email,
        timestamp: data.timestamp,
        userAgent: data.userAgent,
        appVersion: data.appVersion,
        currentProjectId: data.currentProjectId,
        screenshotUrls,
    };

    const response = await monitoredFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(`피드백 전송 실패: ${errorData.error || response.statusText}`);
    }

    return true;
};
