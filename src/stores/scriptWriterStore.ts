import { create } from 'zustand';
import {
  ScriptInputMode,
  ContentFormat,
  ScriptPreset,
  LegacyTopicRecommendation,
  GeneratedScript,
  VideoFormat,
} from '../types';

interface ScriptWriterStore {
  // State
  inputMode: ScriptInputMode;
  contentFormat: ContentFormat;
  shortsSeconds: number;
  benchmarkScript: string;
  presets: ScriptPreset[];
  selectedPreset: ScriptPreset | null;
  topics: LegacyTopicRecommendation[];
  selectedTopic: LegacyTopicRecommendation | null;
  generatedScript: GeneratedScript | null;
  styledScript: string;          // 스타일 적용된 대본 (원본과 별도)
  styledStyleName: string;       // 적용된 스타일 이름
  finalScript: string;
  isGenerating: boolean;
  isExpanding: boolean;
  expansionTarget: number | null;
  activeStep: number;  // 1~4 단계
  videoFormat: VideoFormat;
  longFormSplitType: 'DEFAULT' | 'DETAILED';
  smartSplit: boolean;
  targetCharCount: number;
  splitResult: string[];         // 장면 분석 결과 (AI 분할된 장면 배열)

  // Actions
  setInputMode: (mode: ScriptInputMode) => void;
  setContentFormat: (format: ContentFormat) => void;
  setShortsSeconds: (seconds: number) => void;
  setBenchmarkScript: (script: string) => void;
  addPreset: (preset: ScriptPreset) => void;
  removePreset: (id: string) => void;
  selectPreset: (preset: ScriptPreset | null) => void;
  setTopics: (topics: LegacyTopicRecommendation[]) => void;
  setSelectedTopic: (topic: LegacyTopicRecommendation | null) => void;
  setGeneratedScript: (script: GeneratedScript | null) => void;
  setStyledScript: (script: string, styleName: string) => void;
  clearStyledScript: () => void;
  setFinalScript: (script: string) => void;
  startGeneration: () => void;
  finishGeneration: () => void;
  startExpansion: (target: number) => void;
  finishExpansion: () => void;
  setActiveStep: (step: number) => void;
  setVideoFormat: (format: VideoFormat) => void;
  setLongFormSplitType: (type: 'DEFAULT' | 'DETAILED') => void;
  setSmartSplit: (v: boolean) => void;
  setTargetCharCount: (count: number) => void;
  setSplitResult: (scenes: string[]) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  inputMode: 'normal' as ScriptInputMode,
  contentFormat: 'long' as ContentFormat,
  shortsSeconds: 30,
  benchmarkScript: '',
  presets: [] as ScriptPreset[],
  selectedPreset: null as ScriptPreset | null,
  topics: [] as LegacyTopicRecommendation[],
  selectedTopic: null as LegacyTopicRecommendation | null,
  generatedScript: null as GeneratedScript | null,
  styledScript: '',
  styledStyleName: '',
  finalScript: '',
  isGenerating: false,
  isExpanding: false,
  expansionTarget: null as number | null,
  activeStep: 1,
  videoFormat: VideoFormat.SHORT,
  longFormSplitType: 'DEFAULT' as const,
  smartSplit: true,
  targetCharCount: 5000,
  splitResult: [] as string[],
};

export const useScriptWriterStore = create<ScriptWriterStore>((set) => ({
  ...INITIAL_STATE,

  setInputMode: (mode) => set({ inputMode: mode }),
  setContentFormat: (format) => set({ contentFormat: format }),
  setShortsSeconds: (seconds) => set({ shortsSeconds: seconds }),
  setBenchmarkScript: (script) => set({ benchmarkScript: script }),

  addPreset: (preset) => set((state) => ({
    presets: [...state.presets, preset],
  })),

  removePreset: (id) => set((state) => ({
    presets: state.presets.filter((p) => p.id !== id),
    // 선택된 프리셋이 삭제되면 해제
    selectedPreset: state.selectedPreset?.id === id ? null : state.selectedPreset,
  })),

  selectPreset: (preset) => set({ selectedPreset: preset }),

  setTopics: (topics) => set({ topics }),

  setSelectedTopic: (topic) => set({ selectedTopic: topic }),

  setGeneratedScript: (script) => set({ generatedScript: script }),

  setStyledScript: (script, styleName) => set({ styledScript: script, styledStyleName: styleName }),
  clearStyledScript: () => set({ styledScript: '', styledStyleName: '' }),

  setFinalScript: (script) => set({ finalScript: script }),

  startGeneration: () => set({ isGenerating: true }),
  finishGeneration: () => set({ isGenerating: false }),

  startExpansion: (target) => set({ isExpanding: true, expansionTarget: target }),
  finishExpansion: () => set({ isExpanding: false, expansionTarget: null }),

  setActiveStep: (step) => set({ activeStep: Math.min(4, Math.max(1, step)) }),

  setVideoFormat: (format) => set({ videoFormat: format }),
  setLongFormSplitType: (type) => set({ longFormSplitType: type }),
  setSmartSplit: (v) => set({ smartSplit: v }),
  setTargetCharCount: (count) => set({ targetCharCount: count }),
  setSplitResult: (scenes) => set({ splitResult: scenes }),

  reset: () => set({ ...INITIAL_STATE }),
}));
