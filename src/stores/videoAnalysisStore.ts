import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  VideoAnalysisPreset,
  VideoVersionItem,
  VideoTimedFrame,
} from '../types';

interface ResultCache {
  raw: string;
  versions: VideoVersionItem[];
  thumbs: VideoTimedFrame[];
}

interface VideoAnalysisStore {
  // 입력 상태
  inputMode: 'upload' | 'youtube';
  youtubeUrl: string;

  // 분석 결과 (영속)
  selectedPreset: VideoAnalysisPreset | null;
  rawResult: string;
  versions: VideoVersionItem[];
  thumbnails: VideoTimedFrame[];
  error: string | null;
  expandedId: number | null;

  // 프리셋별 결과 캐시
  resultCache: Record<string, ResultCache>;

  // Actions
  setInputMode: (mode: 'upload' | 'youtube') => void;
  setYoutubeUrl: (url: string) => void;
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

  /** 결과 초기화 (새 분석 시작 시) */
  resetResults: () => void;
  /** 전체 초기화 */
  reset: () => void;
}

const INITIAL_STATE = {
  inputMode: 'youtube' as const,
  youtubeUrl: '',
  selectedPreset: null as VideoAnalysisPreset | null,
  rawResult: '',
  versions: [] as VideoVersionItem[],
  thumbnails: [] as VideoTimedFrame[],
  error: null as string | null,
  expandedId: null as number | null,
  resultCache: {} as Record<string, ResultCache>,
};

export const useVideoAnalysisStore = create<VideoAnalysisStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setInputMode: (mode) => set({ inputMode: mode }),
      setYoutubeUrl: (url) => set({ youtubeUrl: url }),
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

      resetResults: () => set({
        rawResult: '',
        error: null,
        versions: [],
        thumbnails: [],
        expandedId: null,
      }),

      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'video-analysis-store',
      // blob URL 썸네일은 localStorage에 저장 불가 — 텍스트 데이터만 영속화
      partialize: (state) => ({
        inputMode: state.inputMode,
        youtubeUrl: state.youtubeUrl,
        selectedPreset: state.selectedPreset,
        rawResult: state.rawResult,
        versions: state.versions,
        resultCache: state.resultCache,
        // thumbnails 제외 (blob URL은 세션 간 유효하지 않음)
      }),
    },
  ),
);
