import { create } from 'zustand';
import {
  ChannelAnalysisSubTab,
  ChannelInputSource,
  ContentFormat,
  ContentRegion,
  KeywordAnalysisResult,
  RelatedKeyword,
  TopVideo,
  KeywordTag,
  ChannelInfo,
  ChannelScript,
  ChannelGuideline,
  ParsedFileEntry,
  LegacyTopicRecommendation,
  RemakeVersion,
} from '../types';
import { saveBenchmarkData, getAllSavedBenchmarks, deleteSavedBenchmark } from '../services/storageService';
import { logger } from '../services/LoggerService';
import type { SavedBenchmarkData } from '../services/storageService';
import { getQuotaUsage } from '../services/youtubeAnalysisService';

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
  /** 실제 YouTube API 쿼터 (localStorage 기반 누적) */
  quotaUsed: number;
  quotaLimit: number;
  quotaDate: string;
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
  /** 주제 추천 입력값 */
  topicInput: string;
  /** AI 주제 추천 결과 (탭 전환 시 유지) */
  topicRecommendations: LegacyTopicRecommendation[];
  /** 콘텐츠 지역 구분 (국내/해외) */
  contentRegion: ContentRegion;
  /** [FIX #509] 채널 URL (탭 전환 시에도 유지) */
  channelUrl: string;
  /** [FIX #509] 콘텐츠 형식 (탭 전환 시에도 유지) */
  contentFormat: ContentFormat;
  /** [FIX #509] 분석 영상 수 (탭 전환 시에도 유지) */
  videoCount: number;
  /** [FIX #509] 영상 정렬 순서 (탭 전환 시에도 유지) */
  videoSortOrder: 'latest' | 'popular';
  /** [#414] 리메이크 대본 3버전 (프리셋 복원용) */
  remakeVersions: RemakeVersion[];
  /** [#414] 리메이크 소스 입력값 (프리셋 복원용) */
  remakeSourceInput: string;

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
  /** localStorage의 실제 쿼터 데이터를 스토어에 동기화 */
  syncQuota: () => void;
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
  setTopicInput: (input: string) => void;
  setTopicRecommendations: (topics: LegacyTopicRecommendation[]) => void;
  setContentRegion: (region: ContentRegion) => void;
  /** [FIX #509] */
  setChannelUrl: (url: string) => void;
  setContentFormat: (format: ContentFormat) => void;
  setVideoCount: (count: number) => void;
  setVideoSortOrder: (order: 'latest' | 'popular') => void;
  /** [#414] 리메이크 버전 저장 + 자동 벤치마크 저장 */
  setRemakeVersions: (versions: RemakeVersion[]) => void;
  /** [#414] 리메이크 소스 입력 저장 */
  setRemakeSourceInput: (input: string) => void;
  /** 저장된 벤치마크 목록 */
  savedBenchmarks: SavedBenchmarkData[];
  /** 현재 활성 슬롯 ID */
  activeSlotId: string | null;
  /** 현재 채널 분석 결과를 IndexedDB에 저장 */
  saveBenchmark: () => Promise<void>;
  /** IndexedDB에서 벤치마크 불러오기 */
  loadBenchmark: (id: string) => Promise<void>;
  /** IndexedDB에서 벤치마크 삭제 */
  removeBenchmark: (id: string) => Promise<void>;
  /** 앱 초기화 시 IndexedDB에서 목록 로드 */
  loadAllBenchmarks: () => Promise<void>;
  /** 새 분석 시작 — 결과 초기화 */
  newAnalysis: () => void;
  clearKeywordHistory: () => void;
  reset: () => void;
}

const PRESETS_KEY = 'CHANNEL_PRESETS';

const loadPresetsFromStorage = (): ChannelGuideline[] => {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); }
  catch (e) { logger.trackSwallowedError('channelAnalysisStore:loadPresetsFromStorage', e); return []; }
};

const initQuota = getQuotaUsage();

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
  apiUsagePercent: Math.round((initQuota.used / initQuota.limit) * 100),
  quotaUsed: initQuota.used,
  quotaLimit: initQuota.limit,
  quotaDate: initQuota.date,
  channelInfo: null,
  channelScripts: [] as ChannelScript[],
  channelGuideline: null,
  savedPresets: loadPresetsFromStorage(),
  inputSource: 'youtube' as ChannelInputSource,
  uploadedFiles: [] as ParsedFileEntry[],
  sourceName: '',
  topicInput: '',
  topicRecommendations: [] as LegacyTopicRecommendation[],
  contentRegion: 'domestic' as ContentRegion,
  channelUrl: '',
  contentFormat: 'long' as ContentFormat,
  videoCount: 10,
  videoSortOrder: 'latest' as 'latest' | 'popular',
  remakeVersions: [] as RemakeVersion[],
  remakeSourceInput: '',
  savedBenchmarks: [] as SavedBenchmarkData[],
  activeSlotId: null as string | null,
};

export const useChannelAnalysisStore = create<ChannelAnalysisStore>((set) => ({
  ...INITIAL_STATE,

  setSubTab: (tab) => {
    logger.trackTabVisit('channel-analysis', tab);
    set({ subTab: tab });
  },
  setKeyword: (keyword) => set({ keyword }),
  setLanguage: (lang) => set({ language: lang }),
  setRegion: (region) => set({ region }),

  // 키워드 분석 결과 일괄 반영 (히스토리 누적)
  analyze: (results) => set((state) => ({
    keywordResults: [...state.keywordResults, ...results.keywordResults].slice(-20),
    relatedKeywords: results.relatedKeywords,
    topVideos: results.topVideos,
    tags: results.tags,
    isAnalyzing: false,
  })),

  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setApiUsagePercent: (percent) => set({ apiUsagePercent: percent }),
  syncQuota: () => {
    const q = getQuotaUsage();
    set({
      quotaUsed: q.used,
      quotaLimit: q.limit,
      quotaDate: q.date,
      apiUsagePercent: Math.round((q.used / q.limit) * 100),
    });
  },
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

  // 프리셋 로드 (채널 가이드라인 + IndexedDB 벤치마크 스크립트 + 리메이크 복원)
  loadPreset: (channelName) => {
    const state = useChannelAnalysisStore.getState();
    const preset = state.savedPresets.find(p => p.channelName === channelName);
    if (!preset) return;

    // 1) 가이드라인 즉시 반영 + [FIX #392] 해외 채널 여부도 복원
    set({ channelGuideline: preset, ...(preset.contentRegion ? { contentRegion: preset.contentRegion } : {}) });

    // 2) IndexedDB 벤치마크에서 스크립트 + [#414] 리메이크 복원 (비동기)
    (async () => {
      try {
        const all = await getAllSavedBenchmarks();
        const bench = all.find(b => b.channelName === channelName);
        if (bench) {
          set({
            ...(bench.scripts.length > 0 ? { channelScripts: bench.scripts } : {}),
            remakeVersions: bench.remakeVersions || [],
            remakeSourceInput: bench.remakeSourceInput || '',
            savedBenchmarks: all,
          });
        }
      } catch (e) { logger.trackSwallowedError('channelAnalysisStore:loadBenchmarkScripts', e); /* 벤치마크 없으면 스크립트 없이 가이드라인만 표시 */ }
    })();
  },

  setInputSource: (source) => set({ inputSource: source }),
  setUploadedFiles: (files) => set({ uploadedFiles: files }),
  setSourceName: (name) => set({ sourceName: name }),
  clearUploadedFiles: () => set({ uploadedFiles: [], sourceName: '' }),
  setTopicInput: (input) => set({ topicInput: input }),
  setTopicRecommendations: (topics) => set({ topicRecommendations: topics }),
  setContentRegion: (region) => set({ contentRegion: region }),
  setChannelUrl: (url) => set({ channelUrl: url }),
  setContentFormat: (format) => set({ contentFormat: format }),
  setVideoCount: (count) => set({ videoCount: count }),
  setVideoSortOrder: (order) => set({ videoSortOrder: order }),
  setRemakeVersions: (versions) => {
    set({ remakeVersions: versions });
    // 리메이크 버전 변경 시 자동 벤치마크 저장
    if (versions.length > 0) {
      setTimeout(() => useChannelAnalysisStore.getState().saveBenchmark(), 500);
    }
  },
  setRemakeSourceInput: (input) => set({ remakeSourceInput: input }),

  // --- 벤치마크 IndexedDB 영속화 ---
  saveBenchmark: async () => {
    const { channelInfo, channelScripts, channelGuideline, inputSource, remakeVersions, remakeSourceInput, channelUrl } = useChannelAnalysisStore.getState();
    const name = channelInfo?.title || channelGuideline?.channelName || '미지정 채널';
    if (channelScripts.length === 0 && !channelGuideline) return;
    try {
      await saveBenchmarkData(name, channelScripts, channelGuideline, channelInfo, inputSource, remakeVersions, remakeSourceInput, channelUrl);
      const all = await getAllSavedBenchmarks();
      const slotId = name.trim().toLowerCase().replace(/\s+/g, '-');
      set({ savedBenchmarks: all, activeSlotId: slotId });
    } catch (e) { console.warn('[Benchmark] save failed:', e); }
  },

  loadBenchmark: async (id) => {
    try {
      const all = await getAllSavedBenchmarks();
      const found = all.find((b) => b.id === id);
      if (found) {
        // [FIX #509] channelUrl 복원: 저장된 URL → channelInfo에서 재구성 → 빈 문자열
        const restoredUrl = found.channelUrl
          || (found.channelInfo?.channelId ? `https://www.youtube.com/channel/${found.channelInfo.channelId}` : '');
        set({
          channelScripts: found.scripts,
          channelGuideline: found.guideline,
          channelInfo: found.channelInfo || null,
          inputSource: found.inputSource || 'youtube',
          remakeVersions: found.remakeVersions || [],
          remakeSourceInput: found.remakeSourceInput || '',
          channelUrl: restoredUrl,
          savedBenchmarks: all,
          activeSlotId: id,
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

  newAnalysis: () => set({
    channelInfo: null,
    channelScripts: [],
    channelGuideline: null,
    topicRecommendations: [],
    topicInput: '',
    activeSlotId: null,
    isAnalyzing: false,
    remakeVersions: [],
    remakeSourceInput: '',
    channelUrl: '',
  }),

  clearKeywordHistory: () => set({ keywordResults: [] }),

  // 전체 초기화
  reset: () => set({ ...INITIAL_STATE }),
}));
