
import React, { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { fetchAllFeedbackStatuses, getTrackedIssues, restoreFeedbackHistory, type FeedbackStatus } from '../services/feedbackService';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../services/LoggerService';

const TYPE_META: Record<string, { icon: string; label: string }> = {
    bug: { icon: '\uD83D\uDC1B', label: '버그' },
    error: { icon: '\uD83D\uDC1B', label: '오류' },
    suggestion: { icon: '\uD83D\uDCA1', label: '제안' },
    other: { icon: '\uD83D\uDCDD', label: '기타' },
};

function formatDate(ts: number): string {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
}

const FeedbackHistoryPanel: React.FC = () => {
    const show = useUIStore((s) => s.showFeedbackHistory);
    const setShow = useUIStore((s) => s.setShowFeedbackHistory);

    const [statuses, setStatuses] = useState<FeedbackStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchAllFeedbackStatuses();
            setStatuses(result);
        } catch (e) { logger.trackSwallowedError('FeedbackHistoryPanel:refresh', e); /* silent */ }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (show) {
            // [FIX #526] 로컬 데이터로 즉시 렌더 + 서버 복구를 항상 시도 (병합)
            const tracked = getTrackedIssues();
            if (tracked.length > 0) {
                setStatuses(tracked.sort((a, b) => b.submittedAt - a.submittedAt).map(t => ({
                    issueNumber: t.issueNumber,
                    submittedAt: t.submittedAt,
                    feedbackType: t.feedbackType,
                    messagePreview: t.messagePreview,
                    state: (t.cachedState || 'open') as 'open' | 'closed',
                    latestComment: t.cachedComment || null,
                    closedAt: t.cachedClosedAt || null,
                })));
            }
            // 서버 복구를 항상 시도 (로컬 데이터 유무와 무관 — 다른 기기에서 보낸 것도 병합)
            const email = useAuthStore.getState().authUser?.email;
            if (email) {
                setLoading(true);
                restoreFeedbackHistory(email).then(() => {
                    refresh();
                }).catch(() => refresh());
            } else {
                refresh();
            }
        }
    }, [show, refresh]);

    if (!show) return null;

    const handleClose = () => setShow(false);

    return (
        <div
            className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fade-in"
            onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-lg animate-fade-in-up max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-blue-400">{'\uD83D\uDCCB'}</span> 내 피드백 내역
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <span className="flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
                                    확인 중
                                </span>
                            ) : '새로고침'}
                        </button>
                        <button
                            onClick={handleClose}
                            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
                        >
                            {'\u2715'}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-3 custom-scrollbar">
                    {statuses.length === 0 && !loading && (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-3">{'\uD83D\uDCED'}</div>
                            <p className="text-gray-400 font-bold">아직 보낸 피드백이 없습니다</p>
                            <p className="text-gray-500 text-sm mt-1">피드백을 보내면 여기서 답변 여부를 확인할 수 있어요</p>
                        </div>
                    )}

                    {statuses.length === 0 && loading && (
                        <div className="text-center py-12">
                            <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">피드백 상태를 확인하고 있습니다...</p>
                        </div>
                    )}

                    {statuses.map((fb) => {
                        const meta = TYPE_META[fb.feedbackType || 'other'] || TYPE_META.other;
                        const isClosed = fb.state === 'closed';
                        const isExpanded = expandedId === fb.issueNumber;

                        return (
                            <div
                                key={fb.issueNumber}
                                className={`rounded-xl border transition-all ${
                                    isClosed
                                        ? 'bg-emerald-900/10 border-emerald-500/30'
                                        : 'bg-gray-900/50 border-gray-600/50'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setExpandedId(isExpanded ? null : fb.issueNumber)}
                                    className="w-full text-left p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        {/* 상태 아이콘 */}
                                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                                            isClosed
                                                ? 'bg-emerald-500/20 border border-emerald-400/40'
                                                : 'bg-amber-500/20 border border-amber-400/40'
                                        }`}>
                                            {isClosed ? (
                                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* 상단: 번호 + 유형 + 상태 */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-blue-400 font-mono font-bold text-sm">#{fb.issueNumber}</span>
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">
                                                    {meta.icon} {meta.label}
                                                </span>
                                                <span className={`text-xs font-bold ${isClosed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {isClosed ? '답변 완료' : '검토 중'}
                                                </span>
                                            </div>

                                            {/* 메시지 미리보기 */}
                                            {fb.messagePreview && (
                                                <p className="text-gray-400 text-sm mt-1.5 whitespace-pre-line">{fb.messagePreview}</p>
                                            )}

                                            {/* 날짜 */}
                                            <p className="text-gray-600 text-xs mt-1.5">{formatDate(fb.submittedAt)}</p>
                                        </div>

                                        {/* 확장 화살표 */}
                                        {(isClosed && fb.latestComment) && (
                                            <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>

                                {/* 답변 내용 (확장) */}
                                {isExpanded && isClosed && fb.latestComment && (
                                    <div className="px-4 pb-4 pt-0">
                                        <div className="bg-emerald-900/20 rounded-lg border border-emerald-500/20 p-3">
                                            <p className="text-xs font-bold text-emerald-400 mb-1.5 flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                                </svg>
                                                답변
                                            </p>
                                            <p className="text-sm text-emerald-200/80 leading-relaxed whitespace-pre-line">{fb.latestComment}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-4 pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-600 text-center">
                        피드백이 처리되면 자동으로 알림이 울립니다
                    </p>
                </div>
            </div>
        </div>
    );
};

export default FeedbackHistoryPanel;
