import { create } from 'zustand';
import { toast as sonnerToast } from 'sonner';
import type { SmartErrorContext } from '../types';

interface ToastState {
  show: boolean;
  message: string;
  current?: number;
  total?: number;
}

interface UIStore {
  // State
  isSidebarOpen: boolean;
  lightboxUrl: string | null;
  showFullScriptModal: boolean;
  showFeedbackModal: boolean;
  feedbackDefaultType: string | null;
  showFeedbackHistory: boolean;
  showApiSettings: boolean;
  showWatermarkModal: boolean;
  showProfileModal: boolean;
  showHelpGuide: boolean;
  authPromptAction: string | null;
  showAuthGateModal: boolean;
  toast: ToastState | null;
  isProcessing: boolean;
  processingMessage: string | null;
  processingMode: string | undefined;
  refreshTrigger: number;
  toolboxOpen: boolean;
  postProductionOpen: boolean;
  lastAutoSavedAt: number | null;
  smartErrorContext: SmartErrorContext | null;
  feedbackPrefilledContext: SmartErrorContext | null;

  // Actions
  openSidebar: () => void;
  closeSidebar: () => void;
  openLightbox: (url: string) => void;
  closeLightbox: () => void;
  setShowFullScriptModal: (show: boolean) => void;
  setShowFeedbackModal: (show: boolean, defaultType?: string | null) => void;
  setShowFeedbackHistory: (show: boolean) => void;
  setShowApiSettings: (show: boolean) => void;
  setShowWatermarkModal: (show: boolean) => void;
  setShowProfileModal: (show: boolean) => void;
  setShowHelpGuide: (show: boolean) => void;
  setAuthPromptAction: (action: string | null) => void;
  setShowAuthGateModal: (show: boolean) => void;
  setToast: (toast: ToastState | null | ((prev: ToastState | null) => ToastState | null)) => void;
  setProcessing: (active: boolean, message?: string, mode?: string) => void;
  setProcessingMessage: (message: string) => void;
  triggerRefresh: () => void;
  setToolboxOpen: (open: boolean) => void;
  setPostProductionOpen: (open: boolean) => void;
  setLastAutoSavedAt: (ts: number) => void;
  setSmartErrorContext: (ctx: SmartErrorContext | null) => void;
  setFeedbackPrefilledContext: (ctx: SmartErrorContext | null) => void;
  dismissSmartError: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSidebarOpen: false,
  lightboxUrl: null,
  showFullScriptModal: false,
  showFeedbackModal: false,
  feedbackDefaultType: null,
  showFeedbackHistory: false,
  showApiSettings: false,
  showWatermarkModal: false,
  showProfileModal: false,
  showHelpGuide: false,
  authPromptAction: null,
  showAuthGateModal: false,
  toast: null,
  isProcessing: false,
  processingMessage: null,
  processingMode: undefined,
  refreshTrigger: 0,
  toolboxOpen: false,
  postProductionOpen: false,
  lastAutoSavedAt: null,
  smartErrorContext: null,
  feedbackPrefilledContext: null,

  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  openLightbox: (url) => set({ lightboxUrl: url }),
  closeLightbox: () => set({ lightboxUrl: null }),
  setShowFullScriptModal: (show) => set({ showFullScriptModal: show }),
  setShowFeedbackModal: (show, defaultType) => set({ showFeedbackModal: show, feedbackDefaultType: show ? (defaultType ?? null) : null }),
  setShowFeedbackHistory: (show) => set({ showFeedbackHistory: show }),
  setShowApiSettings: (show) => set({ showApiSettings: show }),
  setShowWatermarkModal: (show) => set({ showWatermarkModal: show }),
  setShowProfileModal: (show) => set({ showProfileModal: show }),
  setShowHelpGuide: (show) => set({ showHelpGuide: show }),
  setAuthPromptAction: (action) => set({ authPromptAction: action }),
  setShowAuthGateModal: (show) => set({ showAuthGateModal: show }),
  setToast: (toast) => set((state) => ({
    toast: typeof toast === 'function' ? toast(state.toast) : toast,
  })),
  setProcessing: (active, message, mode) => set({
    isProcessing: active,
    processingMessage: active ? (message || "처리 중...") : null,
    processingMode: mode,
  }),
  setProcessingMessage: (message) => set({ processingMessage: message }),
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
  setToolboxOpen: (open) => set({ toolboxOpen: open }),
  setPostProductionOpen: (open) => set({ postProductionOpen: open }),
  setLastAutoSavedAt: (ts) => set({ lastAutoSavedAt: ts }),
  setSmartErrorContext: (ctx) => set({ smartErrorContext: ctx }),
  setFeedbackPrefilledContext: (ctx) => set({ feedbackPrefilledContext: ctx }),
  dismissSmartError: () => set({ smartErrorContext: null }),
}));

/** alert() 대체 유틸리티 — 어디서든 import해서 사용 (Sonner 기반) */
export const showToast = (message: string, durationMs = 3000) => {
  // 에러성 메시지는 error 스타일, 성공/복사 메시지는 success 스타일
  const isError = /실패|에러|오류|없습니다|불가|부족|초과|차단/.test(message);
  const isSuccess = /완료|성공|복사|저장|삭제|연결|적용/.test(message);
  if (isError) {
    sonnerToast.error(message, { duration: durationMs });
  } else if (isSuccess) {
    sonnerToast.success(message, { duration: durationMs });
  } else {
    sonnerToast(message, { duration: durationMs });
  }
};
