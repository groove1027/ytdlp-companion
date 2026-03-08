import { create } from 'zustand';

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
  showApiSettings: boolean;
  showWatermarkModal: boolean;
  showProfileModal: boolean;
  authPromptAction: string | null;
  showAuthGateModal: boolean;
  toast: ToastState | null;
  isProcessing: boolean;
  processingMessage: string | null;
  processingMode: string | undefined;
  refreshTrigger: number;
  toolboxOpen: boolean;
  postProductionOpen: boolean;

  // Actions
  openSidebar: () => void;
  closeSidebar: () => void;
  openLightbox: (url: string) => void;
  closeLightbox: () => void;
  setShowFullScriptModal: (show: boolean) => void;
  setShowFeedbackModal: (show: boolean) => void;
  setShowApiSettings: (show: boolean) => void;
  setShowWatermarkModal: (show: boolean) => void;
  setShowProfileModal: (show: boolean) => void;
  setAuthPromptAction: (action: string | null) => void;
  setShowAuthGateModal: (show: boolean) => void;
  setToast: (toast: ToastState | null | ((prev: ToastState | null) => ToastState | null)) => void;
  setProcessing: (active: boolean, message?: string, mode?: string) => void;
  setProcessingMessage: (message: string) => void;
  triggerRefresh: () => void;
  setToolboxOpen: (open: boolean) => void;
  setPostProductionOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSidebarOpen: false,
  lightboxUrl: null,
  showFullScriptModal: false,
  showFeedbackModal: false,
  showApiSettings: false,
  showWatermarkModal: false,
  showProfileModal: false,
  authPromptAction: null,
  showAuthGateModal: false,
  toast: null,
  isProcessing: false,
  processingMessage: null,
  processingMode: undefined,
  refreshTrigger: 0,
  toolboxOpen: false,
  postProductionOpen: false,

  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  openLightbox: (url) => set({ lightboxUrl: url }),
  closeLightbox: () => set({ lightboxUrl: null }),
  setShowFullScriptModal: (show) => set({ showFullScriptModal: show }),
  setShowFeedbackModal: (show) => set({ showFeedbackModal: show }),
  setShowApiSettings: (show) => set({ showApiSettings: show }),
  setShowWatermarkModal: (show) => set({ showWatermarkModal: show }),
  setShowProfileModal: (show) => set({ showProfileModal: show }),
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
}));

/** alert() 대체 유틸리티 — 어디서든 import해서 사용 */
export const showToast = (message: string, durationMs = 3000) => {
  useUIStore.getState().setToast({ show: true, message });
  setTimeout(() => useUIStore.getState().setToast(null), durationMs);
};
