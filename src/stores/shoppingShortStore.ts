import { create } from 'zustand';
import {
  ShoppingSourceVideo,
  ShoppingProductAnalysis,
  ShoppingScript,
  ShoppingCTAPreset,
  ShoppingRenderPhase,
  ShoppingWizardStep,
  SubtitleRemovalMethod,
  TTSEngine,
} from '../types';

interface ShoppingRenderProgress {
  phase: ShoppingRenderPhase;
  percent: number;
  message: string;
}

interface ShoppingShortStore {
  // Wizard
  currentStep: ShoppingWizardStep;

  // Source
  sourceVideo: ShoppingSourceVideo | null;
  sourceUrl: string;
  isDownloading: boolean;
  downloadError: string | null;
  proxyUrl: string;

  // Analysis & Scripts
  productAnalysis: ShoppingProductAnalysis | null;
  generatedScripts: ShoppingScript[];
  selectedScriptId: string;
  isAnalyzing: boolean;
  analysisError: string | null;

  // TTS Config
  ttsEngine: TTSEngine;
  ttsVoiceId: string;
  ttsSpeed: number;

  // Font & Subtitle
  fontFamily: string;
  fontSize: number;
  subtitleRemovalMethod: SubtitleRemovalMethod;

  // CTA
  ctaPreset: ShoppingCTAPreset;
  ctaText: string;

  // Render
  renderProgress: ShoppingRenderProgress;
  resultBlobUrl: string | null;
  isRendering: boolean;

  // Actions — Wizard
  setCurrentStep: (step: ShoppingWizardStep) => void;
  goToStep: (step: ShoppingWizardStep) => void;

  // Actions — Source
  setSourceUrl: (url: string) => void;
  setSourceVideo: (video: ShoppingSourceVideo | null) => void;
  setIsDownloading: (v: boolean) => void;
  setDownloadError: (err: string | null) => void;
  setProxyUrl: (url: string) => void;

  // Actions — Analysis
  setProductAnalysis: (analysis: ShoppingProductAnalysis | null) => void;
  setGeneratedScripts: (scripts: ShoppingScript[]) => void;
  setSelectedScriptId: (id: string) => void;
  setIsAnalyzing: (v: boolean) => void;
  setAnalysisError: (err: string | null) => void;

  // Actions — Config
  setTtsEngine: (engine: TTSEngine) => void;
  setTtsVoiceId: (id: string) => void;
  setTtsSpeed: (speed: number) => void;
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  setSubtitleRemovalMethod: (method: SubtitleRemovalMethod) => void;
  setCtaPreset: (preset: ShoppingCTAPreset) => void;
  setCtaText: (text: string) => void;

  // Actions — Render
  setRenderProgress: (progress: ShoppingRenderProgress) => void;
  setResultBlobUrl: (url: string | null) => void;
  setIsRendering: (v: boolean) => void;

  // Actions — Global
  reset: () => void;
}

const PROXY_KEY = 'SHOPPING_SHORT_PROXY_URL';

const getInitialProxy = (): string => {
  try {
    return localStorage.getItem(PROXY_KEY) || '';
  } catch {
    return '';
  }
};

const initialState = {
  currentStep: 'source' as ShoppingWizardStep,
  sourceVideo: null,
  sourceUrl: '',
  isDownloading: false,
  downloadError: null,
  proxyUrl: getInitialProxy(),
  productAnalysis: null,
  generatedScripts: [],
  selectedScriptId: '',
  isAnalyzing: false,
  analysisError: null,
  ttsEngine: 'typecast' as TTSEngine,
  ttsVoiceId: '',
  ttsSpeed: 1.0,
  fontFamily: 'Pretendard',
  fontSize: 40,
  subtitleRemovalMethod: 'blur' as SubtitleRemovalMethod,
  ctaPreset: 'comment' as ShoppingCTAPreset,
  ctaText: '댓글로 구매 링크 보내드려요!',
  renderProgress: { phase: 'idle' as ShoppingRenderPhase, percent: 0, message: '' },
  resultBlobUrl: null,
  isRendering: false,
};

export const useShoppingShortStore = create<ShoppingShortStore>((set) => ({
  ...initialState,

  // Wizard
  setCurrentStep: (step) => set({ currentStep: step }),
  goToStep: (step) => set({ currentStep: step }),

  // Source
  setSourceUrl: (url) => set({ sourceUrl: url }),
  setSourceVideo: (video) => set({ sourceVideo: video }),
  setIsDownloading: (v) => set({ isDownloading: v }),
  setDownloadError: (err) => set({ downloadError: err }),
  setProxyUrl: (url) => {
    try { localStorage.setItem(PROXY_KEY, url); } catch { /* noop */ }
    set({ proxyUrl: url });
  },

  // Analysis
  setProductAnalysis: (analysis) => set({ productAnalysis: analysis }),
  setGeneratedScripts: (scripts) => set({ generatedScripts: scripts }),
  setSelectedScriptId: (id) => set({ selectedScriptId: id }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalysisError: (err) => set({ analysisError: err }),

  // Config
  setTtsEngine: (engine) => set({ ttsEngine: engine }),
  setTtsVoiceId: (id) => set({ ttsVoiceId: id }),
  setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
  setFontFamily: (family) => set({ fontFamily: family }),
  setFontSize: (size) => set({ fontSize: size }),
  setSubtitleRemovalMethod: (method) => set({ subtitleRemovalMethod: method }),
  setCtaPreset: (preset) => {
    const ctaTexts: Record<ShoppingCTAPreset, string> = {
      comment: '댓글로 구매 링크 보내드려요!',
      profile: '프로필 링크에서 구매하세요!',
      link: '하단 링크에서 구매 가능!',
    };
    set({ ctaPreset: preset, ctaText: ctaTexts[preset] });
  },
  setCtaText: (text) => set({ ctaText: text }),

  // Render
  setRenderProgress: (progress) => set({ renderProgress: progress }),
  setResultBlobUrl: (url) => set({ resultBlobUrl: url }),
  setIsRendering: (v) => set({ isRendering: v }),

  // Global
  reset: () => {
    const proxy = getInitialProxy();
    set({ ...initialState, proxyUrl: proxy });
  },
}));
