import React, { useState, useEffect, useCallback, useRef } from 'react';
import { checkResolvedFeedbacks, dismissFeedbackIssue, playNotificationSound, showBrowserNotification, type ResolvedFeedback } from '../services/feedbackService';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5분

const FeedbackNotificationBanner: React.FC = () => {
  const [resolved, setResolved] = useState<ResolvedFeedback[]>([]);
  // 이미 알림을 보낸 이슈 번호 추적 (중복 알림 방지)
  const notifiedRef = useRef<Set<number>>(new Set());

  const check = useCallback(async () => {
    try {
      const results = await checkResolvedFeedbacks();
      if (results.length > 0) {
        // 기존 표시 중인 것 + 새로 발견된 것 병합 (dismiss 안 된 것만)
        setResolved(prev => {
          const existingIds = new Set(prev.map(r => r.issueNumber));
          const newItems = results.filter(r => !existingIds.has(r.issueNumber));
          return [...prev, ...newItems];
        });

        // 새로 발견된 것만 알림음 + 푸시 알림
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
    // 앱 로드 3초 후 첫 체크 (초기 로딩 방해 방지)
    const initTimer = setTimeout(check, 3000);
    const interval = setInterval(check, CHECK_INTERVAL);
    return () => { clearTimeout(initTimer); clearInterval(interval); };
  }, [check]);

  const handleDismiss = (issueNumber: number) => {
    dismissFeedbackIssue(issueNumber);
    setResolved(prev => prev.filter(r => r.issueNumber !== issueNumber));
  };

  if (resolved.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[9998] space-y-2 max-w-sm">
      {resolved.map(r => (
        <div
          key={r.issueNumber}
          className="bg-gradient-to-r from-emerald-900/95 to-green-900/95 border border-emerald-500/50 rounded-xl p-4 shadow-2xl shadow-emerald-900/40 backdrop-blur-md"
          style={{ animation: 'feedbackSlideIn 0.4s ease-out' }}
        >
          <div className="flex items-start gap-3">
            {/* 펄스 아이콘 — 사용자 주의 끌기 */}
            <div className="relative flex-shrink-0 mt-0.5">
              <div className="absolute inset-0 w-8 h-8 bg-emerald-400/30 rounded-full animate-ping" />
              <div className="relative w-8 h-8 bg-emerald-500/30 rounded-full flex items-center justify-center border border-emerald-400/50">
                <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-200">
                피드백 #{r.issueNumber} 반영 완료!
              </p>
              {r.closeComment && (
                <p className="text-xs text-emerald-300/80 mt-1.5 leading-relaxed whitespace-pre-line line-clamp-6">{r.closeComment}</p>
              )}
              <p className="text-[11px] text-emerald-500/60 mt-2">
                새로고침하면 반영됩니다 ✨ 확인하셨으면 X를 눌러주세요
              </p>
            </div>
            <button
              onClick={() => handleDismiss(r.issueNumber)}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-emerald-800/50 hover:bg-emerald-700/60 border border-emerald-600/30 flex items-center justify-center text-emerald-400 hover:text-white transition-colors"
              title="확인 완료 — 닫기"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* 슬라이드 인 애니메이션 */}
      <style>{`
        @keyframes feedbackSlideIn {
          from { opacity: 0; transform: translateX(100px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default FeedbackNotificationBanner;
