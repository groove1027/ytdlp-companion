import { create } from 'zustand';
import {
  ShoppingSourceVideo,
  ShoppingSourceType,
  ShoppingProductAnalysis,
  ShoppingScript,
  ShoppingCTAPreset,
  ShoppingRenderPhase,
  ShoppingWizardStep,
  SubtitleRemovalMethod,
  TTSEngine,
  SubtitleTemplate,
  CoupangCrawlResult,
} from '../types';
import { logger } from '../services/LoggerService';

interface ShoppingRenderProgress {
  phase: ShoppingRenderPhase;
  percent: number;
  message: string;
}

interface ShoppingShortStore {
  // Wizard
  currentStep: ShoppingWizardStep;

  // Source Type (video or coupang)
  sourceType: ShoppingSourceType;

  // Source — Video
  sourceVideo: ShoppingSourceVideo | null;
  sourceUrl: string;
  isDownloading: boolean;
  downloadError: string | null;
  proxyUrl: string;

  // Source — Coupang
  coupangUrl: string;
  coupangCrawlResult: CoupangCrawlResult | null;
  isCrawling: boolean;
  crawlError: string | null;
  affiliateLink: string | null;

  // Analysis & Scripts
  productAnalysis: ShoppingProductAnalysis | null;
  narrationText: string | null;
  generatedScripts: ShoppingScript[];
  selectedScriptId: string;
  isAnalyzing: boolean;
  isGeneratingScripts: boolean;
  analysisError: string | null;

  // TTS Config
  ttsEngine: TTSEngine;
  ttsVoiceId: string;
  ttsSpeed: number;

  // Subtitle Style (기존 140개 자막 템플릿 재활용)
  subtitleTemplate: SubtitleTemplate | null;
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

  // Actions — Source Type
  setSourceType: (type: ShoppingSourceType) => void;

  // Actions — Source Video
  setSourceUrl: (url: string) => void;
  setSourceVideo: (video: ShoppingSourceVideo | null) => void;
  setIsDownloading: (v: boolean) => void;
  setDownloadError: (err: string | null) => void;
  setProxyUrl: (url: string) => void;

  // Actions — Source Coupang
  setCoupangUrl: (url: string) => void;
  setCoupangCrawlResult: (result: CoupangCrawlResult | null) => void;
  setIsCrawling: (v: boolean) => void;
  setCrawlError: (err: string | null) => void;
  setAffiliateLink: (link: string | null) => void;

  // Actions — Analysis
  setProductAnalysis: (analysis: ShoppingProductAnalysis | null) => void;
  setNarrationText: (text: string | null) => void;
  setGeneratedScripts: (scripts: ShoppingScript[]) => void;
  setSelectedScriptId: (id: string) => void;
  setIsAnalyzing: (v: boolean) => void;
  setIsGeneratingScripts: (v: boolean) => void;
  setAnalysisError: (err: string | null) => void;

  // Actions — Config
  setTtsEngine: (engine: TTSEngine) => void;
  setTtsVoiceId: (id: string) => void;
  setTtsSpeed: (speed: number) => void;
  setSubtitleTemplate: (template: SubtitleTemplate | null) => void;
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
  } catch (e) {
    logger.trackSwallowedError('ShoppingShortStore:getInitialProxy', e);
    return '';
  }
};

const initialState = {
  currentStep: 'source' as ShoppingWizardStep,
  sourceType: 'video' as ShoppingSourceType,
  sourceVideo: null,
  sourceUrl: '',
  isDownloading: false,
  downloadError: null,
  proxyUrl: getInitialProxy(),
  coupangUrl: '',
  coupangCrawlResult: null as CoupangCrawlResult | null,
  isCrawling: false,
  crawlError: null as string | null,
  affiliateLink: null as string | null,
  productAnalysis: null,
  narrationText: null,
  generatedScripts: [],
  selectedScriptId: '',
  isAnalyzing: false,
  isGeneratingScripts: false,
  analysisError: null,
  ttsEngine: 'typecast' as TTSEngine,
  ttsVoiceId: '',
  ttsSpeed: 1.0,
  subtitleTemplate: null as SubtitleTemplate | null,
  subtitleRemovalMethod: 'ghostcut' as SubtitleRemovalMethod,
  ctaPreset: 'comment' as ShoppingCTAPreset,
  ctaText: '댓글로 구매 링크 보내드려요!',
  renderProgress: { phase: 'idle' as ShoppingRenderPhase, percent: 0, message: '' },
  resultBlobUrl: null,
  isRendering: false,
};

export const useShoppingShortStore = create<ShoppingShortStore>((set) => ({
  ...initialState,

  // Wizard
  setCurrentStep: (step) => { logger.trackTabVisit('shopping-short', step); set({ currentStep: step }); },
  goToStep: (step) => { logger.trackTabVisit('shopping-short', step); set({ currentStep: step }); },

  // Source Type
  setSourceType: (type) => set({ sourceType: type }),

  // Source Video
  setSourceUrl: (url) => set({ sourceUrl: url }),
  setSourceVideo: (video) => set({ sourceVideo: video }),
  setIsDownloading: (v) => set({ isDownloading: v }),
  setDownloadError: (err) => set({ downloadError: err }),
  setProxyUrl: (url) => {
    try { localStorage.setItem(PROXY_KEY, url); } catch (e) { logger.trackSwallowedError('shoppingShortStore:setProxyUrl', e); }
    set({ proxyUrl: url });
  },

  // Source Coupang
  setCoupangUrl: (url) => set({ coupangUrl: url }),
  setCoupangCrawlResult: (result) => set({ coupangCrawlResult: result }),
  setIsCrawling: (v) => set({ isCrawling: v }),
  setCrawlError: (err) => set({ crawlError: err }),
  setAffiliateLink: (link) => set({ affiliateLink: link }),

  // Analysis
  setProductAnalysis: (analysis) => set({ productAnalysis: analysis }),
  setNarrationText: (text) => set({ narrationText: text }),
  setGeneratedScripts: (scripts) => set({ generatedScripts: scripts }),
  setSelectedScriptId: (id) => set({ selectedScriptId: id }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setIsGeneratingScripts: (v) => set({ isGeneratingScripts: v }),
  setAnalysisError: (err) => set({ analysisError: err }),

  // Config
  setTtsEngine: (engine) => set({ ttsEngine: engine }),
  setTtsVoiceId: (id) => set({ ttsVoiceId: id }),
  setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
  setSubtitleTemplate: (template) => set({ subtitleTemplate: template }),
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
