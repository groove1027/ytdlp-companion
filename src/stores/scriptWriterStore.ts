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
  ScriptTargetRegion,
  ScriptWriterDraftState,
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
  'referenceComments', 'targetRegion',
] as const satisfies ReadonlyArray<keyof ScriptWriterDraftState>;

type PersistedState = ScriptWriterDraftState;

function pickPersistedState(source: Record<string, unknown>): Partial<PersistedState> {
  const result: Partial<Record<keyof PersistedState, unknown>> = {};
  for (const key of PERSISTED_KEYS) {
    if (key in source) {
      result[key] = source[key];
    }
  }
  return result as Partial<PersistedState>;
}

function loadDraft(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return pickPersistedState(parsed);
  } catch (e) {
    logger.trackSwallowedError('ScriptWriterStore:loadDraft', e);
    return {};
  }
}

function saveDraft(state: Record<string, unknown>): void {
  try {
    const draft = pickPersistedState(state);
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
  longFormSplitType: 'DEFAULT' | 'DETAILED' | 'ECONOMY';
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
  /** [#216] 사용자 수동 댓글 붙여넣기 — 채널 스타일 대본 생성 시 AI 참고 자료 */
  referenceComments: string;
  /** [#294] 대본 타겟 지역 — 해외 타겟 시 해당 지역 언어·문화·자료 기반 대본 생성 */
  targetRegion: ScriptTargetRegion;

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
  setLongFormSplitType: (type: 'DEFAULT' | 'DETAILED' | 'ECONOMY') => void;
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
  /** [#216] 댓글 붙여넣기 설정 */
  setReferenceComments: (comments: string) => void;
  /** [#294] 대본 타겟 지역 변경 */
  setTargetRegion: (region: ScriptTargetRegion) => void;
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
  referenceComments: '',
  targetRegion: 'ko' as ScriptTargetRegion,
};

const DEFAULT_DRAFT_STATE: ScriptWriterDraftState = {
  inputMode: INITIAL_STATE.inputMode,
  contentFormat: INITIAL_STATE.contentFormat,
  shortsSeconds: INITIAL_STATE.shortsSeconds,
  benchmarkScript: INITIAL_STATE.benchmarkScript,
  title: INITIAL_STATE.title,
  synopsis: INITIAL_STATE.synopsis,
  manualText: INITIAL_STATE.manualText,
  generatedScript: INITIAL_STATE.generatedScript,
  styledScript: INITIAL_STATE.styledScript,
  styledStyleName: INITIAL_STATE.styledStyleName,
  finalScript: INITIAL_STATE.finalScript,
  videoFormat: INITIAL_STATE.videoFormat,
  longFormSplitType: INITIAL_STATE.longFormSplitType,
  smartSplit: INITIAL_STATE.smartSplit,
  targetCharCount: INITIAL_STATE.targetCharCount,
  splitResult: INITIAL_STATE.splitResult,
  activeStep: INITIAL_STATE.activeStep,
  videoAnalysisStyles: INITIAL_STATE.videoAnalysisStyles,
  scriptAiModel: INITIAL_STATE.scriptAiModel,
  referenceComments: INITIAL_STATE.referenceComments,
  targetRegion: INITIAL_STATE.targetRegion,
};

const normalizeDraft = (draft?: Partial<ScriptWriterDraftState> | null): ScriptWriterDraftState => ({
  ...DEFAULT_DRAFT_STATE,
  ...pickPersistedState((draft || {}) as Record<string, unknown>),
});

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
  // [FIX #641] 포맷 변경 시 targetCharCount도 동기화 — 쇼츠인데 5000자 프롬프트 방지
  setContentFormat: (format) => set((state) => {
    const isShorts = format === 'shorts';
    const currentTarget = state.targetCharCount;
    // 쇼츠 전환 시 현재 값이 너무 크면 합리적 범위로 클램프 (최소 200자)
    const targetCharCount = isShorts && currentTarget > 500
      ? Math.max(200, Math.min(currentTarget, (state.shortsSeconds || 60) * 4))
      : !isShorts && currentTarget < 500
        ? 3000
        : currentTarget;
    return { contentFormat: format, targetCharCount };
  }),
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

  // [FIX #648/#596] 새 대본 생성 시 finalScript도 갱신 → 이전 대본이 나레이션에 남는 버그 수정
  // 단, styledScript가 활성화된 상태면 finalScript 유지 (스타일 적용본 선택 보호)
  setGeneratedScript: (script) => set((state) => ({
    generatedScript: script,
    ...(script?.content && !state.styledScript ? { finalScript: script.content } : {}),
  })),

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
  setReferenceComments: (comments) => set({ referenceComments: comments }),
  setTargetRegion: (region) => set({ targetRegion: region }),

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

export const getScriptWriterDraftSnapshot = (): ScriptWriterDraftState =>
  normalizeDraft(useScriptWriterStore.getState() as unknown as Record<string, unknown>);

export const getLatestScriptWriterText = (draft?: Partial<ScriptWriterDraftState> | null): string => {
  if (!draft) return '';
  return draft.finalScript || draft.styledScript || draft.generatedScript?.content || draft.manualText || '';
};

export const restoreScriptWriterDraft = (draft?: Partial<ScriptWriterDraftState> | null): void => {
  const normalized = normalizeDraft(draft);
  useScriptWriterStore.setState({
    ...INITIAL_STATE,
    ...normalized,
    isGenerating: false,
    isExpanding: false,
    expansionTarget: null,
  });
};

// 상태 변경 시 자동으로 localStorage에 저장
useScriptWriterStore.subscribe((state) => {
  saveDraft(state as unknown as Record<string, unknown>);
});
