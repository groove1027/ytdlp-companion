import { create } from 'zustand';
import {
  ChannelAnalysisSubTab,
  ChannelInputSource,
  KeywordAnalysisResult,
  RelatedKeyword,
  TopVideo,
  KeywordTag,
  ChannelInfo,
  ChannelScript,
  ChannelGuideline,
  ParsedFileEntry,
} from '../types';
import { saveBenchmarkData, getAllSavedBenchmarks, deleteSavedBenchmark } from '../services/storageService';
import type { SavedBenchmarkData } from '../services/storageService';

interface ChannelAnalysisStore {
  // State
  subTab: ChannelAnalysisSubTab;
  keyword: string;
  language: 'ko' | 'ja' | 'en';
  region: 'all' | 'video';
  keywordResults: KeywordAnalysisResult[];
  relatedKeywords: RelatedKeyword[];
  topVideos: TopVideo[];
  tags: KeywordTag[];
  isAnalyzing: boolean;
  apiUsagePercent: number;
  channelInfo: ChannelInfo | null;
  channelScripts: ChannelScript[];
  channelGuideline: ChannelGuideline | null;
  /** 저장된 채널 프리셋 목록 */
  savedPresets: ChannelGuideline[];
  /** 입력 소스 (youtube / file / manual) */
  inputSource: ChannelInputSource;
  /** 업로드된 파일 파싱 결과 */
  uploadedFiles: ParsedFileEntry[];
  /** 작가/채널 이름 (파일/직접입력용) */
  sourceName: string;

  // Actions
  setSubTab: (tab: ChannelAnalysisSubTab) => void;
  setKeyword: (keyword: string) => void;
  setLanguage: (lang: 'ko' | 'ja' | 'en') => void;
  setRegion: (region: 'all' | 'video') => void;
  analyze: (results: {
    keywordResults: KeywordAnalysisResult[];
    relatedKeywords: RelatedKeyword[];
    topVideos: TopVideo[];
    tags: KeywordTag[];
  }) => void;
  setIsAnalyzing: (v: boolean) => void;
  setApiUsagePercent: (percent: number) => void;
  setChannelInfo: (info: ChannelInfo | null) => void;
  setChannelGuideline: (guideline: ChannelGuideline | null) => void;
  setChannelScripts: (scripts: ChannelScript[]) => void;
  /** 프리셋 저장 (채널명 기준 중복 시 덮어쓰기) */
  savePreset: (guideline: ChannelGuideline) => void;
  /** 프리셋 삭제 */
  removePreset: (channelName: string) => void;
  /** 프리셋 로드 */
  loadPreset: (channelName: string) => void;
  setInputSource: (source: ChannelInputSource) => void;
  setUploadedFiles: (files: ParsedFileEntry[]) => void;
  setSourceName: (name: string) => void;
  clearUploadedFiles: () => void;
  /** 저장된 벤치마크 목록 */
  savedBenchmarks: SavedBenchmarkData[];
  /** 현재 채널 분석 결과를 IndexedDB에 저장 */
  saveBenchmark: () => Promise<void>;
  /** IndexedDB에서 벤치마크 불러오기 */
  loadBenchmark: (id: string) => Promise<void>;
  /** IndexedDB에서 벤치마크 삭제 */
  removeBenchmark: (id: string) => Promise<void>;
  /** 앱 초기화 시 IndexedDB에서 목록 로드 */
  loadAllBenchmarks: () => Promise<void>;
  reset: () => void;
}

const PRESETS_KEY = 'CHANNEL_PRESETS';

const loadPresetsFromStorage = (): ChannelGuideline[] => {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); }
  catch { return []; }
};

const INITIAL_STATE = {
  subTab: 'channel-room' as ChannelAnalysisSubTab,
  keyword: '',
  language: 'ko' as const,
  region: 'all' as const,
  keywordResults: [] as KeywordAnalysisResult[],
  relatedKeywords: [] as RelatedKeyword[],
  topVideos: [] as TopVideo[],
  tags: [] as KeywordTag[],
  isAnalyzing: false,
  apiUsagePercent: 0,
  channelInfo: null,
  channelScripts: [] as ChannelScript[],
  channelGuideline: null,
  savedPresets: loadPresetsFromStorage(),
  inputSource: 'youtube' as ChannelInputSource,
  uploadedFiles: [] as ParsedFileEntry[],
  sourceName: '',
  savedBenchmarks: [] as SavedBenchmarkData[],
};

export const useChannelAnalysisStore = create<ChannelAnalysisStore>((set) => ({
  ...INITIAL_STATE,

  setSubTab: (tab) => set({ subTab: tab }),
  setKeyword: (keyword) => set({ keyword }),
  setLanguage: (lang) => set({ language: lang }),
  setRegion: (region) => set({ region }),

  // 키워드 분석 결과 일괄 반영
  analyze: (results) => set({
    keywordResults: results.keywordResults,
    relatedKeywords: results.relatedKeywords,
    topVideos: results.topVideos,
    tags: results.tags,
    isAnalyzing: false,
  }),

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setApiUsagePercent: (percent) => set({ apiUsagePercent: percent }),
  setChannelInfo: (info) => set({ channelInfo: info }),
  setChannelGuideline: (guideline) => {
    set({ channelGuideline: guideline });
    // 가이드라인 변경 시 자동 벤치마크 저장
    if (guideline) {
      setTimeout(() => useChannelAnalysisStore.getState().saveBenchmark(), 500);
    }
  },
  setChannelScripts: (scripts) => {
    set({ channelScripts: scripts });
    // 스크립트 변경 시 자동 벤치마크 저장
    if (scripts.length > 0) {
      setTimeout(() => useChannelAnalysisStore.getState().saveBenchmark(), 500);
    }
  },
  // 프리셋 저장 (채널명 기준 중복 시 덮어쓰기)
  savePreset: (guideline) => set((state) => {
    const updated = [...state.savedPresets.filter(p => p.channelName !== guideline.channelName), guideline];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
    return { savedPresets: updated };
  }),

  // 프리셋 삭제
  removePreset: (channelName) => set((state) => {
    const updated = state.savedPresets.filter(p => p.channelName !== channelName);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
    return { savedPresets: updated };
  }),

  // 프리셋 로드 (채널 가이드라인에 반영)
  loadPreset: (channelName) => set((state) => {
    const preset = state.savedPresets.find(p => p.channelName === channelName);
    return preset ? { channelGuideline: preset } : {};
  }),

  setInputSource: (source) => set({ inputSource: source }),
  setUploadedFiles: (files) => set({ uploadedFiles: files }),
  setSourceName: (name) => set({ sourceName: name }),
  clearUploadedFiles: () => set({ uploadedFiles: [], sourceName: '' }),

  // --- 벤치마크 IndexedDB 영속화 ---
  saveBenchmark: async () => {
    const { channelInfo, channelScripts, channelGuideline } = useChannelAnalysisStore.getState();
    const name = channelInfo?.title || channelGuideline?.channelName || '미지정 채널';
    if (channelScripts.length === 0 && !channelGuideline) return;
    try {
      await saveBenchmarkData(name, channelScripts, channelGuideline);
      const all = await getAllSavedBenchmarks();
      set({ savedBenchmarks: all });
    } catch (e) { console.warn('[Benchmark] save failed:', e); }
  },

  loadBenchmark: async (id) => {
    try {
      const all = await getAllSavedBenchmarks();
      const found = all.find((b) => b.id === id);
      if (found) {
        set({
          channelScripts: found.scripts,
          channelGuideline: found.guideline,
          savedBenchmarks: all,
        });
      }
    } catch (e) { console.warn('[Benchmark] load failed:', e); }
  },

  removeBenchmark: async (id) => {
    try {
      await deleteSavedBenchmark(id);
      const all = await getAllSavedBenchmarks();
      set({ savedBenchmarks: all });
    } catch (e) { console.warn('[Benchmark] delete failed:', e); }
  },

  loadAllBenchmarks: async () => {
    try {
      const all = await getAllSavedBenchmarks();
      set({ savedBenchmarks: all });
    } catch (e) { console.warn('[Benchmark] loadAll failed:', e); }
  },

  // 전체 초기화
  reset: () => set({ ...INITIAL_STATE }),
}));
