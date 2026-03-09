
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

export interface FeedbackResult {
    issueNumber: number;
    issueUrl: string;
}

export const submitFeedback = async (data: FeedbackData): Promise<FeedbackResult> => {
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
        userDisplayName: data.userDisplayName,
        debugLogs: data.debugLogs,
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

    const result = await response.json() as { issueNumber: number; issueUrl: string };

    // localStorage에 이슈 번호 저장 (앱 내 알림용)
    saveFeedbackIssue(result.issueNumber);

    return { issueNumber: result.issueNumber, issueUrl: result.issueUrl };
};

// ── 피드백 이슈 추적 (앱 내 알림) ──

const FEEDBACK_ISSUES_KEY = 'FEEDBACK_SUBMITTED_ISSUES';

interface TrackedIssue {
    issueNumber: number;
    submittedAt: number;
    dismissed: boolean;
}

function saveFeedbackIssue(issueNumber: number): void {
    try {
        const existing: TrackedIssue[] = JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
        if (existing.some(i => i.issueNumber === issueNumber)) return;
        existing.push({ issueNumber, submittedAt: Date.now(), dismissed: false });
        localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
}

export function getTrackedIssues(): TrackedIssue[] {
    try {
        return JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
    } catch { return []; }
}

export function dismissFeedbackIssue(issueNumber: number): void {
    try {
        const issues: TrackedIssue[] = JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
        const updated = issues.map(i => i.issueNumber === issueNumber ? { ...i, dismissed: true } : i);
        localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
}

export interface ResolvedFeedback {
    issueNumber: number;
    closedAt: string;
    closeComment: string | null;
}

/** GitHub API로 미확인 이슈 상태 체크 — closed면 반환 */
export async function checkResolvedFeedbacks(): Promise<ResolvedFeedback[]> {
    const tracked = getTrackedIssues().filter(i => !i.dismissed);
    if (tracked.length === 0) return [];

    const resolved: ResolvedFeedback[] = [];

    for (const issue of tracked) {
        try {
            const res = await fetch(
                `https://api.github.com/repos/groove1027/all-in-one-production/issues/${issue.issueNumber}`,
                { headers: { Accept: 'application/vnd.github.v3+json' } },
            );
            if (!res.ok) continue;
            const data = await res.json() as { state: string; closed_at: string | null };
            if (data.state === 'closed') {
                // 최신 댓글 가져오기 (해결 내용)
                let closeComment: string | null = null;
                try {
                    const commentsRes = await fetch(
                        `https://api.github.com/repos/groove1027/all-in-one-production/issues/${issue.issueNumber}/comments?per_page=1&direction=desc`,
                        { headers: { Accept: 'application/vnd.github.v3+json' } },
                    );
                    if (commentsRes.ok) {
                        const comments = await commentsRes.json() as { body?: string }[];
                        if (comments.length > 0 && comments[0].body) {
                            // 마크다운에서 첫 줄 요약 추출
                            const firstLine = comments[0].body.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'));
                            closeComment = firstLine?.trim() || null;
                        }
                    }
                } catch { /* 댓글 조회 실패 무시 */ }
                resolved.push({ issueNumber: issue.issueNumber, closedAt: data.closed_at || '', closeComment });
            }
        } catch { /* 개별 이슈 조회 실패 무시 */ }
    }

    return resolved;
}
