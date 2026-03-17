
import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { logger } from '../services/LoggerService';
import type { SmartErrorContext } from '../types';
import { FeedbackType } from '../types';

const ERROR_TYPE_LABELS: Record<SmartErrorContext['errorType'], string> = {
  api: 'API 호출 중 문제가 발생했어요',
  render: '화면 표시 중 오류가 발생했어요',
  unhandled: '예기치 않은 오류가 발생했어요',
  timeout: '요청 시간이 초과되었어요',
  network: '네트워크 연결에 문제가 있어요',
};

const SmartErrorBanner: React.FC = () => {
  const smartErrorContext = useUIStore((s) => s.smartErrorContext);
  const dismissSmartError = useUIStore((s) => s.dismissSmartError);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 에러 콜백 등록 (앱 라이프사이클 동안 1회)
  useEffect(() => {
    const unsubscribe = logger.onCriticalError(async (errorType, errorMessage, errorDetail) => {
      // 이미 피드백 모달이 열려있으면 무시
      const { showFeedbackModal } = useUIStore.getState();
      if (showFeedbackModal) return;

      // Breadcrumb + State Snapshot 수집
      const breadcrumbs = logger.getFormattedBreadcrumbs(30);
      const stateSnapshot = Object.entries(logger.collectAllStoreSnapshots())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      // Auto-screenshot 캡처 (비동기, 실패 시 null)
      const autoScreenshotBase64 = await logger.captureScreenshot();

      const ctx: SmartErrorContext = {
        errorType: errorType as SmartErrorContext['errorType'],
        errorMessage: errorMessage.substring(0, 200),
        errorDetail: errorDetail?.substring(0, 500),
        detectedAt: Date.now(),
        breadcrumbs,
        stateSnapshot,
        autoScreenshotBase64: autoScreenshotBase64 || undefined,
      };

      useUIStore.getState().setSmartErrorContext(ctx);
    });

    return unsubscribe;
  }, []);

  // 15초 후 자동 dismiss
  useEffect(() => {
    if (smartErrorContext) {
      dismissTimerRef.current = setTimeout(() => {
        dismissSmartError();
      }, 15000);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [smartErrorContext, dismissSmartError]);

  if (!smartErrorContext) return null;

  const handleReport = () => {
    // Pre-filled context 설정 후 FeedbackModal 열기
    useUIStore.getState().setFeedbackPrefilledContext(smartErrorContext);
    useUIStore.getState().setShowFeedbackModal(true, FeedbackType.BUG);
    dismissSmartError();
  };

  const label = ERROR_TYPE_LABELS[smartErrorContext.errorType] || '문제가 발생했어요';

  return (
    <div
      data-smart-error-banner
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9990] animate-fade-in-up max-w-lg w-[calc(100%-2rem)]"
    >
      <div className="bg-gradient-to-r from-red-900/95 to-red-800/95 backdrop-blur-md rounded-xl border border-red-500/40 shadow-2xl shadow-red-900/30 p-4">
        <div className="flex items-start gap-3">
          {/* 아이콘 */}
          <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-400/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-200">{label}</p>
            <p className="text-xs text-red-300/70 mt-0.5 truncate">
              {smartErrorContext.errorMessage}
            </p>
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={dismissSmartError}
            className="text-red-400/60 hover:text-red-300 transition-colors flex-shrink-0 -mt-0.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={dismissSmartError}
            className="flex-1 py-2 text-sm font-bold text-red-300/80 bg-red-900/40 hover:bg-red-900/60 rounded-lg border border-red-500/20 transition-colors"
          >
            괜찮아요
          </button>
          <button
            onClick={handleReport}
            className="flex-1 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-md transition-all hover:scale-[1.02]"
          >
            개발팀에 알리기
          </button>
        </div>

        {/* 자동 수집 안내 */}
        <p className="text-[10px] text-red-400/50 mt-2 text-center">
          행동 기록 + 앱 상태 + 화면 캡처가 자동으로 포함됩니다
        </p>
      </div>
    </div>
  );
};

export default SmartErrorBanner;
