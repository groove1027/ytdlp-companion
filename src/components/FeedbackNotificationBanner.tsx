import React, { useState, useEffect, useCallback } from 'react';
import { checkResolvedFeedbacks, dismissFeedbackIssue, type ResolvedFeedback } from '../services/feedbackService';

const CHECK_INTERVAL = 10 * 60 * 1000; // 10분

const FeedbackNotificationBanner: React.FC = () => {
  const [resolved, setResolved] = useState<ResolvedFeedback[]>([]);

  const check = useCallback(async () => {
    try {
      const results = await checkResolvedFeedbacks();
      if (results.length > 0) setResolved(results);
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
          className="bg-gradient-to-r from-emerald-900/90 to-green-900/90 border border-emerald-500/40 rounded-xl p-4 shadow-2xl shadow-emerald-900/30 backdrop-blur-sm animate-fade-in-up"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-300">
                피드백 #{r.issueNumber}이 반영되었습니다!
              </p>
              {r.closeComment && (
                <p className="text-xs text-emerald-400/70 mt-1 line-clamp-2">{r.closeComment}</p>
              )}
            </div>
            <button
              onClick={() => handleDismiss(r.issueNumber)}
              className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
              title="닫기"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FeedbackNotificationBanner;
