import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { showToast } from './uiStore';
import type {
  VideoAnalysisPreset,
  VideoVersionItem,
  VideoTimedFrame,
} from '../types';
import {
  saveVideoAnalysisSlot,
  getAllVideoAnalysisSlots,
  deleteVideoAnalysisSlot,
} from '../services/storageService';
import type { SavedVideoAnalysisSlot } from '../services/storageService';

interface ResultCache {
  raw: string;
  versions: VideoVersionItem[];
  thumbs: VideoTimedFrame[];
}

interface VideoAnalysisStore {
  // 입력 상태
  inputMode: 'upload' | 'youtube';
  youtubeUrl: string;
  youtubeUrls: string[];          // 다중 YouTube URL (최대 5개)

  // 분석 결과 (영속)
  selectedPreset: VideoAnalysisPreset | null;
  rawResult: string;
  versions: VideoVersionItem[];
  thumbnails: VideoTimedFrame[];
  error: string | null;
  expandedId: number | null;

  // 프리셋별 결과 캐시
  resultCache: Record<string, ResultCache>;

  // 다운로드된 영상 (비영속 — 편집실 전달용)
  videoBlob: Blob | null;

  // 슬롯 관리
  savedSlots: SavedVideoAnalysisSlot[];
  activeSlotId: string | null;

  // Actions
  setVideoBlob: (blob: Blob | null) => void;
  setInputMode: (mode: 'upload' | 'youtube') => void;
  setYoutubeUrl: (url: string) => void;
  /** 다중 URL: 특정 인덱스의 URL 업데이트 */
  updateYoutubeUrl: (index: number, url: string) => void;
  /** 다중 URL: 빈 입력 칸 추가 (최대 5개) */
  addYoutubeUrl: () => void;
  /** 다중 URL: 특정 인덱스 제거 */
  removeYoutubeUrl: (index: number) => void;
  setSelectedPreset: (preset: VideoAnalysisPreset | null) => void;
  setRawResult: (raw: string) => void;
  setVersions: (versions: VideoVersionItem[]) => void;
  setThumbnails: (thumbs: VideoTimedFrame[]) => void;
  setError: (error: string | null) => void;
  setExpandedId: (id: number | null) => void;

  /** 현재 결과를 프리셋 캐시에 저장 */
  cacheCurrentResult: (preset: VideoAnalysisPreset) => void;
  /** 프리셋 캐시에서 복원 */
  restoreFromCache: (preset: VideoAnalysisPreset) => boolean;
  /** 캐시 삭제 */
  clearCache: () => void;
  /** 특정 프리셋 캐시만 삭제 */
  clearPresetCache: (preset: VideoAnalysisPreset) => void;

  /** 결과 초기화 (새 분석 시작 시) */
  resetResults: () => void;
  /** 전체 초기화 */
  reset: () => void;

  // 슬롯 액션
  /** 현재 결과를 슬롯에 저장 */
  saveSlot: (name?: string) => Promise<void>;
  /** 슬롯 로드 */
  loadSlot: (id: string) => Promise<void>;
  /** 슬롯 삭제 */
  removeSlot: (id: string) => Promise<void>;
  /** 앱 초기화 시 슬롯 목록 로드 */
  loadAllSlots: () => Promise<void>;
  /** 새 분석 시작 — 결과 초기화 */
  newAnalysis: () => void;
}

const MAX_YOUTUBE_URLS = 5;

const INITIAL_STATE = {
  inputMode: 'youtube' as const,
  youtubeUrl: '',
  youtubeUrls: [''] as string[],
  selectedPreset: null as VideoAnalysisPreset | null,
  rawResult: '',
  versions: [] as VideoVersionItem[],
  thumbnails: [] as VideoTimedFrame[],
  error: null as string | null,
  expandedId: null as number | null,
  resultCache: {} as Record<string, ResultCache>,
  videoBlob: null as Blob | null,
  savedSlots: [] as SavedVideoAnalysisSlot[],
  activeSlotId: null as string | null,
};

export const useVideoAnalysisStore = create<VideoAnalysisStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setVideoBlob: (blob) => set({ videoBlob: blob }),
      setInputMode: (mode) => set({ inputMode: mode }),
      setYoutubeUrl: (url) => set({ youtubeUrl: url, youtubeUrls: [url] }),

      updateYoutubeUrl: (index, url) => {
        const urls = [...get().youtubeUrls];
        urls[index] = url;
        set({ youtubeUrls: urls, youtubeUrl: urls[0] || '' });
      },

      addYoutubeUrl: () => {
        const urls = get().youtubeUrls;
        if (urls.length >= MAX_YOUTUBE_URLS) return;
        set({ youtubeUrls: [...urls, ''] });
      },

      removeYoutubeUrl: (index) => {
        const urls = get().youtubeUrls.filter((_, i) => i !== index);
        const next = urls.length === 0 ? [''] : urls;
        set({ youtubeUrls: next, youtubeUrl: next[0] || '' });
      },

      setSelectedPreset: (preset) => set({ selectedPreset: preset }),
      setRawResult: (raw) => set({ rawResult: raw }),
      setVersions: (versions) => set({ versions }),
      setThumbnails: (thumbs) => set({ thumbnails: thumbs }),
      setError: (error) => set({ error }),
      setExpandedId: (id) => set({ expandedId: id }),

      cacheCurrentResult: (preset) => {
        const { rawResult, versions, thumbnails, resultCache } = get();
        if (!rawResult) return;
        set({
          resultCache: {
            ...resultCache,
            [preset]: { raw: rawResult, versions, thumbs: thumbnails },
          },
        });
      },

      restoreFromCache: (preset) => {
        const cached = get().resultCache[preset];
        if (!cached || cached.versions.length === 0) return false;
        set({
          selectedPreset: preset,
          rawResult: cached.raw,
          versions: cached.versions,
          thumbnails: cached.thumbs,
          expandedId: null,
          error: null,
        });
        return true;
      },

      clearCache: () => set({ resultCache: {} }),

      clearPresetCache: (preset) => {
        const { resultCache } = get();
        const next = { ...resultCache };
        delete next[preset];
        set({ resultCache: next });
      },

      resetResults: () => set({
        rawResult: '',
        error: null,
        versions: [],
        thumbnails: [],
        expandedId: null,
      }),

      reset: () => set({ ...INITIAL_STATE, videoBlob: null }),

      // --- 슬롯 관리 ---
      saveSlot: async (name) => {
        const { youtubeUrl, youtubeUrls, inputMode, selectedPreset, rawResult, versions, resultCache } = get();
        if (!rawResult && versions.length === 0) return;
        const validUrls = youtubeUrls.filter(u => u.trim());
        const slotName = name || validUrls[0] || '영상 분석';
        const id = `va-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const slot: SavedVideoAnalysisSlot = {
          id, name: slotName, youtubeUrl, youtubeUrls: validUrls,
          inputMode, selectedPreset,
          rawResult, versions, resultCache, savedAt: Date.now(),
        };
        try {
          await saveVideoAnalysisSlot(slot);
          const all = await getAllVideoAnalysisSlots();
          set({ savedSlots: all, activeSlotId: id });
        } catch (e) { console.warn('[VideoSlot] save failed:', e); }
      },

      loadSlot: async (id) => {
        try {
          const all = await getAllVideoAnalysisSlots();
          const found = all.find(s => s.id === id);
          if (found) {
            // 하위 호환: 이전 슬롯에 youtubeUrls가 없으면 youtubeUrl로 복원
            const urls = found.youtubeUrls?.length
              ? found.youtubeUrls
              : found.youtubeUrl ? [found.youtubeUrl] : [''];
            set({
              youtubeUrl: found.youtubeUrl,
              youtubeUrls: urls,
              inputMode: found.inputMode,
              selectedPreset: found.selectedPreset,
              rawResult: found.rawResult,
              versions: found.versions,
              resultCache: found.resultCache,
              thumbnails: [],
              expandedId: null,
              error: null,
              savedSlots: all,
              activeSlotId: id,
            });
          }
        } catch (e) { console.warn('[VideoSlot] load failed:', e); }
      },

      removeSlot: async (id) => {
        try {
          await deleteVideoAnalysisSlot(id);
          const all = await getAllVideoAnalysisSlots();
          const { activeSlotId } = get();
          set({ savedSlots: all, activeSlotId: activeSlotId === id ? null : activeSlotId });
        } catch (e) { console.warn('[VideoSlot] delete failed:', e); }
      },

      loadAllSlots: async () => {
        try {
          const all = await getAllVideoAnalysisSlots();
          set({ savedSlots: all });
        } catch (e) { console.warn('[VideoSlot] loadAll failed:', e); }
      },

      newAnalysis: () => set({
        youtubeUrl: '',
        youtubeUrls: [''],
        selectedPreset: null,
        rawResult: '',
        versions: [],
        thumbnails: [],
        resultCache: {},
        error: null,
        expandedId: null,
        activeSlotId: null,
        videoBlob: null,
      }),
    }),
    {
      name: 'video-analysis-store',
      // blob URL 썸네일은 localStorage에 저장 불가 — 텍스트 데이터만 영속화
      partialize: (state) => {
        // resultCache를 최대 3개로 제한 (가장 최근 프리셋만 유지)
        const cacheKeys = Object.keys(state.resultCache);
        const limitedCache: Record<string, ResultCache> = {};
        cacheKeys.slice(-3).forEach(k => { limitedCache[k] = state.resultCache[k]; });

        return {
          inputMode: state.inputMode,
          youtubeUrl: state.youtubeUrl,
          youtubeUrls: state.youtubeUrls,
          selectedPreset: state.selectedPreset,
          rawResult: state.rawResult.length > 50000 ? state.rawResult.slice(0, 50000) : state.rawResult,
          versions: state.versions,
          resultCache: limitedCache,
          // thumbnails, savedSlots, activeSlotId 제외 (IndexedDB에서 관리)
        };
      },
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch { return null; }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // QuotaExceededError — 캐시 비우고 재시도
            try {
              const slim = { ...value, state: { ...value.state, resultCache: {}, rawResult: '' } };
              localStorage.setItem(name, JSON.stringify(slim));
              showToast('⚠️ 저장 공간이 부족하여 이전 분석 캐시를 정리했습니다. 분석 결과는 정상 유지됩니다.', 5000);
            } catch {
              showToast('⚠️ 저장 공간이 가득 찼습니다. 브라우저 캐시를 정리해주세요.', 5000);
            }
          }
        },
        removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* 무시 */ } },
      },
    },
  ),
);
