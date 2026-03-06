
import { FeedbackData } from '../types';
import { getFeedbackUrl, monitoredFetch } from './apiService';

export const submitFeedback = async (data: FeedbackData): Promise<boolean> => {
    const url = getFeedbackUrl();
    if (!url) {
        throw new Error('피드백 URL이 설정되지 않았습니다. API 설정에서 Google Apps Script URL을 입력해주세요.');
    }

    const response = await monitoredFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`피드백 전송 실패: ${response.status} ${response.statusText}`);
    }

    return true;
};
