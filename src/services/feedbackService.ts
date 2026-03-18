
import { FeedbackData } from '../types';
import { getCloudinaryConfig, monitoredFetch } from './apiService';

/** 디버그 로그 텍스트 → Cloudinary 업로드 → URL 반환 */
async function uploadDebugLogToCloudinary(text: string): Promise<string> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    if (!cloudName || !uploadPreset) {
        throw new Error('Cloudinary 설정 없음 — 디버그 로그 업로드 불가');
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'debug-log.txt');
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'feedback-debug-logs');
    formData.append('resource_type', 'raw');

    const res = await monitoredFetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error(`Cloudinary debug log upload failed: ${res.status}`);
    }

    const data = await res.json() as { secure_url: string };
    return data.secure_url;
}

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

    const res = await monitoredFetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
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

    // 2. 디버그 로그가 35000자를 초과하면 Cloudinary에 전체 로그 업로드
    let debugLogUrl: string | undefined;
    let debugLogs = data.debugLogs;
    const DEBUG_LOG_THRESHOLD = 35000;
    if (debugLogs && debugLogs.length > DEBUG_LOG_THRESHOLD) {
        debugLogUrl = await uploadDebugLogToCloudinary(debugLogs).catch(() => undefined);
        const suffix = debugLogUrl ? `\n... (전체 로그: ${debugLogUrl})` : `\n... (${debugLogs.length - DEBUG_LOG_THRESHOLD}자 생략)`;
        debugLogs = debugLogs.substring(0, DEBUG_LOG_THRESHOLD) + suffix;
    }

    // 2b. 자동 스크린샷이 있으면 Cloudinary에 업로드
    let autoScreenshotUrl: string | undefined;
    if (data.autoScreenshotBase64) {
        autoScreenshotUrl = await uploadScreenshotToCloudinary(data.autoScreenshotBase64).catch(() => undefined);
    }

    // 3. Pages Function (/api/feedback) 으로 전송 → GitHub Issue 자동 생성
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
        debugLogs,
        debugLogUrl,
        breadcrumbs: data.breadcrumbs,
        stateSnapshot: data.stateSnapshot,
        autoScreenshotUrl,
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

    // localStorage에 이슈 번호 + 유형 + 내용 미리보기 저장 (앱 내 알림 + 내역 조회용)
    saveFeedbackIssue(result.issueNumber, data.type, data.message);

    return { issueNumber: result.issueNumber, issueUrl: result.issueUrl };
};

// ── 피드백 이슈 추적 (앱 내 알림) ──

const FEEDBACK_ISSUES_KEY = 'FEEDBACK_SUBMITTED_ISSUES';

export interface TrackedIssue {
    issueNumber: number;
    submittedAt: number;
    dismissed: boolean;
    feedbackType?: string;
    messagePreview?: string;
    // 캐시된 GitHub 상태 (API 실패 시 폴백용)
    cachedState?: 'open' | 'closed';
    cachedComment?: string | null;
    cachedClosedAt?: string | null;
}

function saveFeedbackIssue(issueNumber: number, feedbackType?: string, messagePreview?: string): void {
    try {
        const existing: TrackedIssue[] = JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
        if (existing.some(i => i.issueNumber === issueNumber)) return;
        existing.push({
            issueNumber,
            submittedAt: Date.now(),
            dismissed: false,
            feedbackType,
            messagePreview: messagePreview ? messagePreview.slice(0, 500) : undefined,
        });
        localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
}

export function getTrackedIssues(): TrackedIssue[] {
    try {
        return JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
    } catch { return []; }
}

/** [#515] 서버에서 사용자의 피드백 히스토리를 복구 — 새 세션/기기에서 로그인 시 호출 */
export async function restoreFeedbackHistory(email: string): Promise<number> {
    if (!email) return 0;
    try {
        const res = await monitoredFetch(`/api/feedback-restore?email=${encodeURIComponent(email)}`);
        if (!res.ok) return 0;
        const data = await res.json() as {
            issues: {
                issueNumber: number;
                submittedAt: number;
                feedbackType: string;
                messagePreview: string;
                state: 'open' | 'closed';
                closedAt: string | null;
            }[];
        };
        if (!data.issues || data.issues.length === 0) return 0;

        const existing = getTrackedIssues();
        const existingNums = new Set(existing.map(i => i.issueNumber));
        let restored = 0;

        for (const issue of data.issues) {
            if (!existingNums.has(issue.issueNumber)) {
                existing.push({
                    issueNumber: issue.issueNumber,
                    submittedAt: issue.submittedAt,
                    dismissed: false,
                    feedbackType: issue.feedbackType,
                    messagePreview: issue.messagePreview,
                    cachedState: issue.state,
                    cachedClosedAt: issue.closedAt,
                });
                restored++;
            }
        }

        if (restored > 0) {
            localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(existing));
        }
        return restored;
    } catch { return 0; }
}

export function dismissFeedbackIssue(issueNumber: number): void {
    try {
        const issues: TrackedIssue[] = JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
        const updated = issues.map(i => i.issueNumber === issueNumber ? { ...i, dismissed: true } : i);
        localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
}

/** GitHub 상태를 localStorage에 캐시 — API 실패 시에도 마지막 확인 상태 유지 */
function updateTrackedIssueCache(issueNumber: number, state: 'open' | 'closed', comment: string | null, closedAt: string | null): void {
    try {
        const issues: TrackedIssue[] = JSON.parse(localStorage.getItem(FEEDBACK_ISSUES_KEY) || '[]');
        const updated = issues.map(i => i.issueNumber === issueNumber
            ? { ...i, cachedState: state, cachedComment: comment, cachedClosedAt: closedAt }
            : i);
        localStorage.setItem(FEEDBACK_ISSUES_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
}

export interface ResolvedFeedback {
    issueNumber: number;
    closedAt: string;
    closeComment: string | null;
}

/** GitHub API로 미확인 이슈 상태 체크 — closed면 반환 */
// ── 알림음 (Web Audio API 합성 차임) ──

let audioCtx: AudioContext | null = null;

/** 알림 차임음 재생 (외부 파일 불필요) */
export function playNotificationSound(): void {
    try {
        if (!audioCtx) audioCtx = new AudioContext();
        const ctx = audioCtx;
        const now = ctx.currentTime;

        // 3음 상승 차임 × 2회 (C5→E5→G5, 잠시 쉬고 반복)
        [0, 0.8].forEach(offset => {
            const notes = [523.25, 659.25, 783.99];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = now + offset + i * 0.15;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.35, t + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.5);
            });
        });
    } catch { /* 오디오 재생 실패 무시 */ }
}

// ── 브라우저 푸시 알림 (Notification API) ──

/** 알림 권한 요청 — 피드백 제출 성공 시 호출 */
export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

/** 브라우저 푸시 알림 표시 */
export function showBrowserNotification(resolved: ResolvedFeedback): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const body = resolved.closeComment
            ? `${resolved.closeComment}`
            : '제출하신 피드백이 처리 완료되었습니다.';
        new Notification(`피드백 #${resolved.issueNumber} 반영 완료!`, {
            body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>',
            tag: `feedback-${resolved.issueNumber}`,
            requireInteraction: false,
        });
    } catch { /* 알림 생성 실패 무시 */ }
}

/** 백엔드 프록시를 통해 미확인 이슈 상태 체크 — closed면 반환 */
export async function checkResolvedFeedbacks(): Promise<ResolvedFeedback[]> {
    const tracked = getTrackedIssues().filter(i => !i.dismissed);
    if (tracked.length === 0) return [];

    try {
        const issueNumbers = tracked.map(t => t.issueNumber).join(',');
        const res = await monitoredFetch(`/api/feedback-status?issues=${issueNumbers}`);
        if (!res.ok) return [];
        const data = await res.json() as { statuses: { issueNumber: number; state: string; closedAt: string | null; latestComment: string | null }[] };

        const resolved: ResolvedFeedback[] = [];
        for (const s of data.statuses) {
            if (s.state === 'closed') {
                resolved.push({ issueNumber: s.issueNumber, closedAt: s.closedAt || '', closeComment: s.latestComment });
                updateTrackedIssueCache(s.issueNumber, 'closed', s.latestComment, s.closedAt);
            }
        }
        return resolved;
    } catch { return []; }
}

/** 모든 추적 이슈의 현재 상태를 GitHub API로 조회 */
export interface FeedbackStatus {
    issueNumber: number;
    submittedAt: number;
    feedbackType?: string;
    messagePreview?: string;
    state: 'open' | 'closed';
    latestComment: string | null;
    closedAt: string | null;
}

export async function fetchAllFeedbackStatuses(): Promise<FeedbackStatus[]> {
    const tracked = getTrackedIssues();
    if (tracked.length === 0) return [];

    // 백엔드 프록시를 통해 일괄 조회 (private repo → 인증 필요)
    const issueNumbers = tracked.map(t => t.issueNumber).join(',');
    let apiStatuses: { issueNumber: number; state: string; closedAt: string | null; latestComment: string | null }[] = [];

    try {
        const res = await monitoredFetch(`/api/feedback-status?issues=${issueNumbers}`);
        if (res.ok) {
            const data = await res.json() as { statuses: typeof apiStatuses };
            apiStatuses = data.statuses;
        }
    } catch { /* 백엔드 호출 실패 — 캐시된 상태로 폴백 */ }

    const apiMap = new Map(apiStatuses.map(s => [s.issueNumber, s]));

    const statuses: FeedbackStatus[] = tracked.map(issue => {
        const api = apiMap.get(issue.issueNumber);

        if (api) {
            const resolvedState = api.state === 'closed' ? 'closed' as const : 'open' as const;
            // 성공 시 로컬 캐시 업데이트
            updateTrackedIssueCache(issue.issueNumber, resolvedState, api.latestComment, api.closedAt);
            return {
                issueNumber: issue.issueNumber,
                submittedAt: issue.submittedAt,
                feedbackType: issue.feedbackType,
                messagePreview: issue.messagePreview,
                state: resolvedState,
                latestComment: api.latestComment,
                closedAt: api.closedAt,
            };
        }

        // API 실패 시 캐시된 상태 사용
        return {
            issueNumber: issue.issueNumber,
            submittedAt: issue.submittedAt,
            feedbackType: issue.feedbackType,
            messagePreview: issue.messagePreview,
            state: issue.cachedState || 'open',
            latestComment: issue.cachedComment || null,
            closedAt: issue.cachedClosedAt || null,
        };
    });

    return statuses.sort((a, b) => b.submittedAt - a.submittedAt);
}
