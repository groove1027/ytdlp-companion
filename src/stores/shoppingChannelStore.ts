import { create } from 'zustand';
import type {
  ShoppingChannelWizardStep,
  ShoppingCharacterPreset,
  ShoppingSceneTemplate,
  ShoppingCharacterConfig,
  ShoppingChannelProduct,
  ShoppingChannelScene,
  ShoppingProductAnalysis,
  ShoppingScript,
  ShoppingCTAPreset,
  TTSEngine,
  AspectRatio,
} from '../types';
import { AspectRatio as AR } from '../types';
import { logger } from '../services/LoggerService';

type GenerationPhase = 'idle' | 'uploading' | 'analyzing' | 'generating-scripts' | 'generating-images' | 'generating-videos' | 'done' | 'error';

interface ShoppingChannelStore {
  // Wizard
  currentStep: ShoppingChannelWizardStep;

  // Product
  product: ShoppingChannelProduct;
  productAnalysis: ShoppingProductAnalysis | null;
  isAnalyzing: boolean;
  analysisError: string | null;

  // Concept
  characterConfig: ShoppingCharacterConfig;
  sceneTemplate: ShoppingSceneTemplate;
  aspectRatio: AspectRatio;
  videoModel: 'veo' | 'grok';

  // Script
  generatedScripts: ShoppingScript[];
  selectedScriptId: string;
  isGeneratingScripts: boolean;

  // Generation
  scenes: ShoppingChannelScene[];
  isGenerating: boolean;
  generationPhase: GenerationPhase;

  // TTS
  enableTTS: boolean;
  ttsEngine: TTSEngine;
  ttsVoiceId: string;
  ttsSpeed: number;
  ctaPreset: ShoppingCTAPreset;

  // Actions — Wizard
  goToStep: (step: ShoppingChannelWizardStep) => void;

  // Actions — Product
  setProduct: (product: Partial<ShoppingChannelProduct>) => void;
  setProductAnalysis: (analysis: ShoppingProductAnalysis | null) => void;
  setIsAnalyzing: (v: boolean) => void;
  setAnalysisError: (err: string | null) => void;

  // Actions — Concept
  setCharacterConfig: (config: Partial<ShoppingCharacterConfig>) => void;
  setSceneTemplate: (template: ShoppingSceneTemplate) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setVideoModel: (model: 'veo' | 'grok') => void;

  // Actions — Script
  setGeneratedScripts: (scripts: ShoppingScript[]) => void;
  setSelectedScriptId: (id: string) => void;
  setIsGeneratingScripts: (v: boolean) => void;

  // Actions — Generation
  setScenes: (scenes: ShoppingChannelScene[]) => void;
  updateScene: (id: string, patch: Partial<ShoppingChannelScene>) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationPhase: (phase: GenerationPhase) => void;

  // Actions — TTS
  setEnableTTS: (v: boolean) => void;
  setTtsEngine: (engine: TTSEngine) => void;
  setTtsVoiceId: (id: string) => void;
  setTtsSpeed: (speed: number) => void;
  setCtaPreset: (preset: ShoppingCTAPreset) => void;

  // Global
  reset: () => void;
}

const initialProduct: ShoppingChannelProduct = {
  images: [],
  imageUrls: [],
  name: '',
  description: '',
};

const initialCharacter: ShoppingCharacterConfig = {
  presetId: 'friendly-sister',
  customDescription: '',
  referenceImageUrl: null,
};

const initialState = {
  currentStep: 'product' as ShoppingChannelWizardStep,
  product: { ...initialProduct },
  productAnalysis: null as ShoppingProductAnalysis | null,
  isAnalyzing: false,
  analysisError: null as string | null,
  characterConfig: { ...initialCharacter },
  sceneTemplate: 'general-review' as ShoppingSceneTemplate,
  aspectRatio: AR.LANDSCAPE as AspectRatio,
  videoModel: 'veo' as 'veo' | 'grok',
  generatedScripts: [] as ShoppingScript[],
  selectedScriptId: '',
  isGeneratingScripts: false,
  scenes: [] as ShoppingChannelScene[],
  isGenerating: false,
  generationPhase: 'idle' as GenerationPhase,
  enableTTS: false,
  ttsEngine: 'typecast' as TTSEngine,
  ttsVoiceId: '',
  ttsSpeed: 1.0,
  ctaPreset: 'comment' as ShoppingCTAPreset,
};

export const useShoppingChannelStore = create<ShoppingChannelStore>((set) => ({
  ...initialState,

  // Wizard
  goToStep: (step) => {
    logger.trackTabVisit('shopping-channel', step);
    set({ currentStep: step });
  },

  // Product
  setProduct: (patch) => set((s) => ({ product: { ...s.product, ...patch } })),
  setProductAnalysis: (analysis) => set({ productAnalysis: analysis }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalysisError: (err) => set({ analysisError: err }),

  // Concept
  setCharacterConfig: (patch) => set((s) => ({ characterConfig: { ...s.characterConfig, ...patch } })),
  setSceneTemplate: (template) => set({ sceneTemplate: template }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),
  setVideoModel: (model) => set({ videoModel: model }),

  // Script
  setGeneratedScripts: (scripts) => set({ generatedScripts: scripts }),
  setSelectedScriptId: (id) => set({ selectedScriptId: id }),
  setIsGeneratingScripts: (v) => set({ isGeneratingScripts: v }),

  // Generation
  setScenes: (scenes) => set({ scenes }),
  updateScene: (id, patch) => set((s) => ({
    scenes: s.scenes.map(sc => sc.id === id ? { ...sc, ...patch } : sc),
  })),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setGenerationPhase: (phase) => set({ generationPhase: phase }),

  // TTS
  setEnableTTS: (v) => set({ enableTTS: v }),
  setTtsEngine: (engine) => set({ ttsEngine: engine }),
  setTtsVoiceId: (id) => set({ ttsVoiceId: id }),
  setTtsSpeed: (speed) => set({ ttsSpeed: speed }),
  setCtaPreset: (preset) => {
    const ctaTexts: Record<ShoppingCTAPreset, string> = {
      comment: '댓글로 구매 링크 보내드려요!',
      profile: '프로필 링크에서 구매하세요!',
      link: '하단 링크에서 구매 가능!',
    };
    set({ ctaPreset: preset });
    void ctaTexts; // reserved for future CTA text usage
  },

  // Global
  reset: () => set({ ...initialState, product: { ...initialProduct }, characterConfig: { ...initialCharacter } }),
}));
