import React, { useState, useEffect, useCallback, useRef } from 'react';
import { checkResolvedFeedbacks, dismissFeedbackIssue, playNotificationSound, showBrowserNotification, type ResolvedFeedback } from '../services/feedbackService';
import { useUIStore } from '../stores/uiStore';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5분

const FeedbackNotificationBanner: React.FC = () => {
  const [resolved, setResolved] = useState<ResolvedFeedback[]>([]);
  const notifiedRef = useRef<Set<number>>(new Set());

  const check = useCallback(async () => {
    try {
      const results = await checkResolvedFeedbacks();
      if (results.length > 0) {
        setResolved(prev => {
          const existingIds = new Set(prev.map(r => r.issueNumber));
          const newItems = results.filter(r => !existingIds.has(r.issueNumber));
          return [...prev, ...newItems];
        });

        const newResults = results.filter(r => !notifiedRef.current.has(r.issueNumber));
        if (newResults.length > 0) {
          playNotificationSound();
          newResults.forEach(r => {
            showBrowserNotification(r);
            notifiedRef.current.add(r.issueNumber);
          });
        }
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(check, 3000);
    const interval = setInterval(check, CHECK_INTERVAL);
    return () => { clearTimeout(initTimer); clearInterval(interval); };
  }, [check]);

  const handleDismiss = (issueNumber: number) => {
    dismissFeedbackIssue(issueNumber);
    setResolved(prev => prev.filter(r => r.issueNumber !== issueNumber));
  };

  const handleDismissAll = () => {
    resolved.forEach(r => dismissFeedbackIssue(r.issueNumber));
    setResolved([]);
  };

  const handleViewHistory = () => {
    handleDismissAll();
    useUIStore.getState().setShowFeedbackHistory(true);
  };

  if (resolved.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4"
      style={{ animation: 'fbOverlayIn 0.3s ease-out' }}
    >
      <div
        className="w-full max-w-md"
        style={{ animation: 'fbBounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        {resolved.map(r => (
          <div
            key={r.issueNumber}
            className="bg-gradient-to-br from-orange-950 via-amber-950 to-orange-950 border-2 border-orange-500/70 rounded-2xl shadow-[0_0_60px_rgba(249,115,22,0.3)] overflow-hidden"
            style={{ animation: 'fbShake 0.6s ease-out 0.6s' }}
          >
            {/* 상단 글로우 바 */}
            <div className="h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500" style={{ animation: 'fbGlow 2s ease-in-out infinite' }} />

            <div className="p-6">
              {/* 아이콘 + 제목 */}
              <div className="flex flex-col items-center text-center mb-5">
                <div className="relative mb-4">
                  <div className="absolute inset-0 w-16 h-16 bg-orange-400/25 rounded-full" style={{ animation: 'fbPulseRing 1.5s ease-out infinite' }} />
                  <div className="absolute inset-0 w-16 h-16 bg-orange-400/15 rounded-full" style={{ animation: 'fbPulseRing 1.5s ease-out 0.5s infinite' }} />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center border-2 border-orange-400/60 shadow-lg shadow-orange-500/30">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-black text-orange-200 tracking-tight">
                  피드백이 반영되었어요!
                </h3>
                <p className="text-orange-400/80 text-sm font-bold mt-1">
                  #{r.issueNumber} 처리 완료
                </p>
              </div>

              {/* 답변 내용 */}
              {r.closeComment && (
                <div className="bg-orange-900/30 border border-orange-500/25 rounded-xl p-4 mb-5">
                  <p className="text-xs font-bold text-orange-400 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    개발팀 답변
                  </p>
                  <p className="text-sm text-orange-100/90 leading-relaxed whitespace-pre-line">{r.closeComment}</p>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleViewHistory}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-xl text-white text-sm font-black transition-all shadow-lg shadow-orange-600/30 hover:shadow-orange-500/40 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  전체 내역 보기
                </button>
                <button
                  onClick={() => handleDismiss(r.issueNumber)}
                  className="w-full py-2.5 px-4 bg-orange-900/30 hover:bg-orange-800/40 border border-orange-500/20 hover:border-orange-400/40 rounded-xl text-orange-400/70 hover:text-orange-300 text-xs font-bold transition-all"
                >
                  나중에 볼게요
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fbOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fbBounceIn {
          0% { opacity: 0; transform: scale(0.3) translateY(40px); }
          50% { opacity: 1; transform: scale(1.05) translateY(-8px); }
          70% { transform: scale(0.97) translateY(2px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes fbShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px) rotate(-1deg); }
          30% { transform: translateX(5px) rotate(0.8deg); }
          45% { transform: translateX(-4px) rotate(-0.6deg); }
          60% { transform: translateX(3px) rotate(0.4deg); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(1px); }
        }
        @keyframes fbPulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes fbGlow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; filter: brightness(1.3); }
        }
      `}</style>
    </div>
  );
};

export default FeedbackNotificationBanner;
