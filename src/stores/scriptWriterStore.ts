import { create } from 'zustand';
import {
  ScriptInputMode,
  ContentFormat,
  ScriptPreset,
  LegacyTopicRecommendation,
  GeneratedScript,
  VideoFormat,
  VideoAnalysisStylePreset,
  ScriptAiModel,
} from '../types';
import { logger } from '../services/LoggerService';

// --- localStorage 자동 임시저장 ---
const DRAFT_STORAGE_KEY = 'SCRIPT_WRITER_DRAFT';

/** 페이지 리로드 시 복원할 필드 목록 (일시적 UI 상태 제외) */
const PERSISTED_KEYS = [
  'inputMode', 'contentFormat', 'shortsSeconds', 'benchmarkScript',
  'title', 'synopsis', 'manualText',
  'generatedScript', 'styledScript', 'styledStyleName', 'finalScript',
  'videoFormat', 'longFormSplitType', 'smartSplit', 'targetCharCount',
  'splitResult', 'activeStep', 'videoAnalysisStyles', 'scriptAiModel',
] as const;

type PersistedKey = typeof PERSISTED_KEYS[number];
type PersistedState = Pick<ScriptWriterStore, PersistedKey>;

function loadDraft(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // 저장된 키 중 허용된 것만 반환
    const result: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) {
      if (key in parsed) {
        result[key] = parsed[key];
      }
    }
    return result as Partial<PersistedState>;
  } catch (e) {
    logger.trackSwallowedError('ScriptWriterStore:loadDraft', e);
    return {};
  }
}

function saveDraft(state: Record<string, unknown>): void {
  try {
    const draft: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) {
      draft[key] = state[key];
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    logger.trackSwallowedError('ScriptWriterStore:saveDraft', e);
  }
}

function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (e) { logger.trackSwallowedError('ScriptWriterStore:clearDraft', e); }
}

/** AI 참여도 강화 결과 항목 */
export interface EngagementBoosterResult {
  index: number; original: string; enhanced: string; changes: string; applied: boolean;
}

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
  /** 대본 직접 입력 텍스트 (탭 전환 시 보존) */
  manualText: string;
  /** 제목 (탭 전환 시 보존) */
  title: string;
  /** 시놉시스 (탭 전환 시 보존) */
  synopsis: string;
  isGenerating: boolean;
  isExpanding: boolean;
  expansionTarget: number | null;
  activeStep: number;  // 1~4 단계
  videoFormat: VideoFormat;
  longFormSplitType: 'DEFAULT' | 'DETAILED';
  smartSplit: boolean;
  targetCharCount: number;
  splitResult: string[];         // 장면 분석 결과 (AI 분할된 장면 배열)
  /** 영상분석에서 가져온 스타일 프리셋 (#158) */
  videoAnalysisStyles: VideoAnalysisStylePreset[];
  /** [FIX #249] AI 참여도 강화 결과 — 탭 전환 시 유실 방지 */
  engagementBoosterResults: EngagementBoosterResult[];
  engagementBoosterOpen: boolean;
  /** 대본 작성 AI 모델 선택 (Gemini Pro / Claude Sonnet / Claude Opus) */
  scriptAiModel: ScriptAiModel;

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
  setManualText: (text: string) => void;
  setTitle: (title: string) => void;
  setSynopsis: (synopsis: string) => void;
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
  /** 영상분석 스타일 추가 (최대 5개, 초과 시 가장 오래된 것 제거) */
  addVideoAnalysisStyle: (style: VideoAnalysisStylePreset) => void;
  /** 영상분석 스타일 제거 */
  removeVideoAnalysisStyle: (id: string) => void;
  /** [FIX #249] 참여도 강화 결과 저장/초기화 */
  setEngagementBoosterResults: (results: EngagementBoosterResult[]) => void;
  setEngagementBoosterOpen: (open: boolean) => void;
  /** 대본 작성 AI 모델 변경 */
  setScriptAiModel: (model: ScriptAiModel) => void;
  /** 새 입력(파일 업로드 등) 시 이전 대본 콘텐츠만 초기화 — 포맷 설정은 보존 */
  clearPreviousContent: () => void;
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
  manualText: '',
  title: '',
  synopsis: '',
  isGenerating: false,
  isExpanding: false,
  expansionTarget: null as number | null,
  activeStep: 1,
  videoFormat: VideoFormat.SHORT,
  longFormSplitType: 'DEFAULT' as const,
  smartSplit: true,
  targetCharCount: 5000,
  splitResult: [] as string[],
  videoAnalysisStyles: [] as VideoAnalysisStylePreset[],
  engagementBoosterResults: [] as EngagementBoosterResult[],
  engagementBoosterOpen: false,
  scriptAiModel: ScriptAiModel.GEMINI_PRO,
};

// localStorage에서 이전 드래프트 복원
const restoredDraft = loadDraft();

export const useScriptWriterStore = create<ScriptWriterStore>((set) => ({
  ...INITIAL_STATE,
  ...restoredDraft,
  // 일시적 상태는 항상 초기값으로 (복원하지 않음)
  isGenerating: false,
  isExpanding: false,
  expansionTarget: null,

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
  setManualText: (text) => set({ manualText: text }),
  setTitle: (title) => set({ title }),
  setSynopsis: (synopsis) => set({ synopsis }),

  startGeneration: () => set({ isGenerating: true }),
  finishGeneration: () => set({ isGenerating: false }),

  startExpansion: (target) => set({ isExpanding: true, expansionTarget: target }),
  finishExpansion: () => set({ isExpanding: false, expansionTarget: null }),

  setActiveStep: (step) => { const clamped = Math.min(4, Math.max(1, step)); logger.trackTabVisit('script-writer', String(clamped)); set({ activeStep: clamped }); },

  setVideoFormat: (format) => set({ videoFormat: format }),
  setLongFormSplitType: (type) => set({ longFormSplitType: type }),
  setSmartSplit: (v) => set({ smartSplit: v }),
  setTargetCharCount: (count) => set({ targetCharCount: count }),
  setSplitResult: (scenes) => set({ splitResult: scenes }),

  addVideoAnalysisStyle: (style) => set((state) => {
    const filtered = state.videoAnalysisStyles.filter(s => s.id !== style.id);
    const updated = [style, ...filtered].slice(0, 5);
    return { videoAnalysisStyles: updated };
  }),

  removeVideoAnalysisStyle: (id) => set((state) => ({
    videoAnalysisStyles: state.videoAnalysisStyles.filter(s => s.id !== id),
  })),

  setEngagementBoosterResults: (results) => set({ engagementBoosterResults: results }),
  setEngagementBoosterOpen: (open) => set({ engagementBoosterOpen: open }),
  setScriptAiModel: (model) => set({ scriptAiModel: model }),

  // 새 파일 업로드 시 이전 대본 콘텐츠를 초기화하되, 포맷/분량 설정은 유지
  clearPreviousContent: () => {
    clearDraft();
    set({
      generatedScript: null,
      styledScript: '',
      styledStyleName: '',
      finalScript: '',
      manualText: '',
      title: '',
      synopsis: '',
      topics: [],
      selectedTopic: null,
      splitResult: [],
      benchmarkScript: '',
      selectedPreset: null,
      activeStep: 1,
      engagementBoosterResults: [],
      engagementBoosterOpen: false,
    });
  },

  reset: () => {
    clearDraft();
    set({ ...INITIAL_STATE });
  },
}));

// 상태 변경 시 자동으로 localStorage에 저장
useScriptWriterStore.subscribe((state) => {
  saveDraft(state as unknown as Record<string, unknown>);
});
