import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { showToast } from './uiStore';
import { logger } from '../services/LoggerService';
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
  sourceKey?: string;
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
  isFrameUpgrading: boolean; // 백그라운드 정밀 프레임 업그레이드 진행 중
  error: string | null;
  expandedId: number | null;

  // 프리셋별 결과 캐시
  resultCache: Record<string, ResultCache>;

  // 다운로드된 영상 (비영속 — 편집실 전달용)
  videoBlob: Blob | null;
  // [FIX #370] 다운로드된 영상에 오디오가 포함되어 있는지 여부
  videoBlobHasAudio: boolean | null;

  // 슬롯 관리
  savedSlots: SavedVideoAnalysisSlot[];
  activeSlotId: string | null;

  // 목표 시간 설정 (0=원본 / 30초 / 45초 / 60초)
  targetDuration: 0 | 30 | 45 | 60;

  // [FIX #398] 원본 순서 유지 옵션 (스낵형/티키타카에서 비선형 재배치 대신 원본 타임라인 유지)
  keepOriginalOrder: boolean;

  // 버전 수 선택 (사용자 비용 조절용)
  versionCount: number;

  // Actions
  setInputMode: (mode: 'upload' | 'youtube') => void;
  setYoutubeUrl: (url: string) => void;
  setTargetDuration: (dur: 0 | 30 | 45 | 60) => void;
  setKeepOriginalOrder: (val: boolean) => void;
  setVersionCount: (count: number) => void;
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
  setIsFrameUpgrading: (val: boolean) => void;
  setError: (error: string | null) => void;
  setExpandedId: (id: number | null) => void;

  /** 현재 결과를 프리셋 캐시에 저장 */
  cacheCurrentResult: (preset: VideoAnalysisPreset, sourceKey: string) => void;
  /** 프리셋 캐시에서 복원 */
  restoreFromCache: (preset: VideoAnalysisPreset, sourceKey: string) => boolean;
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
  /** 영상 Blob 설정 (편집실 전달용, hasAudio: 오디오 포함 여부) */
  setVideoBlob: (blob: Blob | File | null, hasAudio?: boolean) => void;
  /** 새 분석 시작 — 결과 초기화 */
  newAnalysis: () => void;

  /** [FIX #313] 분석 완료 후 IndexedDB 자동 저장 — 새로고침 시 복구용 */
  autoSave: () => Promise<void>;
  /** [FIX #313] 마운트 시 자동 복구 — localStorage 유실 시 IndexedDB에서 복원 */
  tryAutoRecover: () => Promise<boolean>;

  /** 편집실 버전 셀렉터용 — 현재 선택된 버전 인덱스 */
  editRoomSelectedVersionIdx: number | null;
  setEditRoomSelectedVersionIdx: (idx: number | null) => void;
}

const MAX_YOUTUBE_URLS = 5;
const RESULT_CACHE_PRESET_MAP: Record<VideoAnalysisPreset, true> = {
  tikitaka: true,
  snack: true,
  condensed: true,
  deep: true,
  shopping: true,
  alltts: true,
};
const RESULT_CACHE_LIMIT = Math.max(8, Object.keys(RESULT_CACHE_PRESET_MAP).length);
const STATE_THUMBNAIL_LIMIT = 72;
const CACHE_THUMBNAIL_LIMIT = 48;
const PERSIST_RAW_RESULT_LIMIT = 24000;
const PERSIST_VERSION_CONCEPT_LIMIT = 12000;

const INITIAL_STATE = {
  inputMode: 'youtube' as const,
  youtubeUrl: '',
  youtubeUrls: [''] as string[],
  selectedPreset: null as VideoAnalysisPreset | null,
  rawResult: '',
  versions: [] as VideoVersionItem[],
  thumbnails: [] as VideoTimedFrame[],
  isFrameUpgrading: false,
  error: null as string | null,
  expandedId: null as number | null,
  resultCache: {} as Record<string, ResultCache>,
  videoBlob: null as Blob | null,
  videoBlobHasAudio: null as boolean | null,
  savedSlots: [] as SavedVideoAnalysisSlot[],
  activeSlotId: null as string | null,
  editRoomSelectedVersionIdx: null as number | null,
  targetDuration: 0 as 0 | 30 | 45 | 60,
  keepOriginalOrder: false,
  versionCount: 10,
};

function trimStoredText(value: string, limit: number): string {
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit)}\n...(이하 생략)` : value;
}

function pickEvenly<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (items.length <= limit) return [...items];
  const picked: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    const start = Math.floor((index * items.length) / limit);
    const end = Math.max(start + 1, Math.floor(((index + 1) * items.length) / limit));
    const candidateIndex = Math.min(items.length - 1, Math.floor((start + end - 1) / 2));
    picked.push(items[candidateIndex]);
  }
  return picked;
}

function compactTimedFrames(frames: VideoTimedFrame[], limit: number): VideoTimedFrame[] {
  const uniqueFrames = new Map<string, VideoTimedFrame>();
  frames.forEach((frame) => {
    if (!frame?.url) return;
    const key = `${frame.sourceIndex ?? -1}:${Math.round(frame.timeSec * 100)}`;
    if (uniqueFrames.has(key)) return;
    uniqueFrames.set(key, {
      ...frame,
      hdUrl: frame.hdUrl?.startsWith('data:') || frame.hdUrl?.startsWith('blob:')
        ? undefined
        : frame.hdUrl,
    });
  });
  const sorted = Array.from(uniqueFrames.values()).sort((left, right) => {
    const sourceDelta = (left.sourceIndex ?? -1) - (right.sourceIndex ?? -1);
    if (sourceDelta !== 0) return sourceDelta;
    return left.timeSec - right.timeSec;
  });
  return pickEvenly(sorted, limit);
}

function compactVersionsForPersistence(versions: VideoVersionItem[]): VideoVersionItem[] {
  return versions.map((version) => ({
    ...version,
    title: trimStoredText(version.title, 200),
    concept: trimStoredText(version.concept, version.scenes.length > 0 ? 4000 : PERSIST_VERSION_CONCEPT_LIMIT),
    rearrangement: version.rearrangement ? trimStoredText(version.rearrangement, 1500) : version.rearrangement,
  }));
}

function buildPersistableThumbs(thumbnails: VideoTimedFrame[]): VideoTimedFrame[] {
  const compacted = compactTimedFrames(thumbnails, CACHE_THUMBNAIL_LIMIT);
  const urlBased = compacted.filter(
    (thumb) => !thumb.url.startsWith('data:') && !thumb.url.startsWith('blob:'),
  );
  return urlBased.length > 0 ? urlBased : compactTimedFrames(compacted, 12);
}

function cloneVersionsForCache(versions: VideoVersionItem[]): VideoVersionItem[] {
  return versions.map((version) => ({
    ...version,
    contentId: version.contentId ? { ...version.contentId } : version.contentId,
    scenes: version.scenes.map((scene) => ({ ...scene })),
  }));
}

function cloneTimedFrames(frames: VideoTimedFrame[]): VideoTimedFrame[] {
  return frames.map((frame) => ({ ...frame }));
}

function buildLiveResultCacheEntry(
  sourceKey: string | undefined,
  rawResult: string,
  versions: VideoVersionItem[],
  thumbnails: VideoTimedFrame[],
): ResultCache {
  return {
    sourceKey,
    raw: rawResult,
    versions: cloneVersionsForCache(versions),
    thumbs: cloneTimedFrames(thumbnails),
  };
}

function buildPersistableResultCacheEntry(entry: ResultCache): ResultCache {
  return {
    sourceKey: entry.sourceKey,
    raw: trimStoredText(entry.raw, PERSIST_RAW_RESULT_LIMIT),
    versions: compactVersionsForPersistence(entry.versions),
    thumbs: buildPersistableThumbs(entry.thumbs),
  };
}

function compactResultCacheEntries(cache: Record<string, ResultCache>, selectedPreset: VideoAnalysisPreset | null, limit: number): Record<string, ResultCache> {
  const orderedKeys = Object.keys(cache).filter((key) => key !== selectedPreset);
  if (selectedPreset && cache[selectedPreset]) orderedKeys.push(selectedPreset);
  const limitedKeys = orderedKeys.slice(-limit);
  const nextCache: Record<string, ResultCache> = {};
  limitedKeys.forEach((key) => {
    const entry = cache[key];
    if (!entry) return;
    nextCache[key] = buildPersistableResultCacheEntry(entry);
  });
  return nextCache;
}

function buildPersistableResultCache(
  cache: Record<string, ResultCache>,
  selectedPreset: VideoAnalysisPreset | null,
  currentEntry?: ResultCache,
): Record<string, ResultCache> {
  const mergedCache: Record<string, ResultCache> = { ...cache };
  if (selectedPreset && currentEntry && (currentEntry.raw || currentEntry.versions.length > 0)) {
    mergedCache[selectedPreset] = currentEntry;
  }
  return compactResultCacheEntries(mergedCache, selectedPreset, RESULT_CACHE_LIMIT);
}

export const useVideoAnalysisStore = create<VideoAnalysisStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setInputMode: (mode) => set({ inputMode: mode }),
      setTargetDuration: (dur) => set({ targetDuration: dur }),
      setKeepOriginalOrder: (val) => set({ keepOriginalOrder: val }),
      setVersionCount: (count) => set({ versionCount: count }),
      setYoutubeUrl: (url) => {
        const prev = get().youtubeUrl;
        // [FIX #782/#785][FIX #964] URL 변경 시 이전 분석 결과 + 프리셋 캐시 자동 초기화
        // resultCache도 함께 초기화 — 이전 영상의 캐시가 새 영상에 오염되는 버그 수정
        // YouTube URL 정규화 — /shorts/, youtu.be, /embed/ 등을 watch?v= 형태로 통일
        const normalize = (u: string) => {
          const m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          return m ? m[1] : u.trim();
        };
        if (prev && normalize(prev) !== normalize(url)) {
          set({
            youtubeUrl: url,
            youtubeUrls: [url],
            rawResult: '',
            versions: [],
            thumbnails: [],
            error: null,
            expandedId: null,
            isFrameUpgrading: false,
            videoBlob: null,
            videoBlobHasAudio: null,
            editRoomSelectedVersionIdx: null,
            resultCache: {},
          });
        } else {
          set({ youtubeUrl: url, youtubeUrls: [url] });
        }
      },

      updateYoutubeUrl: (index, url) => {
        const urls = [...get().youtubeUrls];
        const prevUrl = urls[index];
        urls[index] = url;
        // [FIX #782/#785][FIX #964] 개별 URL 변경 시에도 결과 + 캐시 초기화
        // [FIX #964 P1-3] YouTube 뿐 아니라 TikTok/소셜 URL 변경 시에도 캐시 무효화
        const isUrlLike = (u: string) => u.includes('youtube') || u.includes('youtu.be') || u.includes('tiktok') || u.includes('douyin') || u.includes('xiaohongshu') || u.includes('http');
        const changed = prevUrl && prevUrl !== url && isUrlLike(prevUrl);
        set({
          youtubeUrls: urls,
          youtubeUrl: urls[0] || '',
          ...(changed ? {
            rawResult: '',
            versions: [],
            thumbnails: [],
            error: null,
            expandedId: null,
            isFrameUpgrading: false,
            videoBlob: null,
            videoBlobHasAudio: null,
            resultCache: {},
          } : {}),
        });
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
      setThumbnails: (thumbs) => set({ thumbnails: compactTimedFrames(thumbs, STATE_THUMBNAIL_LIMIT) }),
      setIsFrameUpgrading: (val) => set({ isFrameUpgrading: val }),
      setError: (error) => set({ error }),
      setExpandedId: (id) => set({ expandedId: id }),

      cacheCurrentResult: (preset, sourceKey) => {
        const { rawResult, versions, thumbnails, resultCache } = get();
        // [FIX #316] rawResult가 비어도 versions가 있으면 캐시 허용 — slimValue로 rawResult 유실 시 비주얼 복구 불가 방지
        if (!rawResult && versions.length === 0) return;
        const nextKeys = Object.keys(resultCache).filter((key) => key !== preset).slice(-(RESULT_CACHE_LIMIT - 1));
        const nextCache: Record<string, ResultCache> = {};
        nextKeys.forEach((key) => {
          nextCache[key] = resultCache[key];
        });
        nextCache[preset] = buildLiveResultCacheEntry(sourceKey, rawResult, versions, thumbnails);
        set({
          resultCache: nextCache,
        });
      },

      restoreFromCache: (preset, sourceKey) => {
        const cached = get().resultCache[preset];
        if (!cached || cached.sourceKey !== sourceKey) return false;
        if (cached.versions.length === 0) return false;
        set({
          selectedPreset: preset,
          rawResult: cached.raw,
          versions: cloneVersionsForCache(cached.versions),
          thumbnails: compactTimedFrames(cached.thumbs, STATE_THUMBNAIL_LIMIT),
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
        isFrameUpgrading: false,
        expandedId: null,
      }),

      reset: () => set({ ...INITIAL_STATE }),

      // --- 슬롯 관리 ---
      saveSlot: async (name) => {
        const { youtubeUrl, youtubeUrls, inputMode, selectedPreset, rawResult, versions, resultCache, thumbnails } = get();
        if (!rawResult && versions.length === 0) return;
        const validUrls = youtubeUrls.filter(u => u.trim());
        const slotName = name || validUrls[0] || '영상 분석';
        const id = `va-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const selectedCacheSourceKey = selectedPreset ? resultCache[selectedPreset]?.sourceKey : undefined;
        const currentEntry = selectedPreset
          ? buildLiveResultCacheEntry(selectedCacheSourceKey, rawResult, versions, thumbnails)
          : undefined;
        const slot: SavedVideoAnalysisSlot = {
          id, name: slotName, youtubeUrl, youtubeUrls: validUrls,
          inputMode, selectedPreset,
          rawResult: trimStoredText(rawResult, PERSIST_RAW_RESULT_LIMIT),
          versions: compactVersionsForPersistence(versions),
          resultCache: buildPersistableResultCache(resultCache, selectedPreset, currentEntry),
          savedAt: Date.now(),
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
            // resultCache에서 비주얼(thumbnails) 복원 — 이전엔 []로 초기화되어 유실됨
            const restoredThumbs = compactTimedFrames(
              (found.selectedPreset && found.resultCache?.[found.selectedPreset]?.thumbs) || [],
              STATE_THUMBNAIL_LIMIT,
            );
            set({
              youtubeUrl: found.youtubeUrl,
              youtubeUrls: urls,
              inputMode: found.inputMode,
              selectedPreset: found.selectedPreset,
              rawResult: trimStoredText(found.rawResult, PERSIST_RAW_RESULT_LIMIT),
              versions: compactVersionsForPersistence(found.versions),
              resultCache: compactResultCacheEntries(found.resultCache || {}, found.selectedPreset, RESULT_CACHE_LIMIT),
              thumbnails: restoredThumbs,
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

      setVideoBlob: (blob, hasAudio) => set({
        videoBlob: blob instanceof File ? blob : blob,
        videoBlobHasAudio: hasAudio ?? (blob instanceof File ? true : null),
      }),

      editRoomSelectedVersionIdx: null,
      setEditRoomSelectedVersionIdx: (idx) => set({ editRoomSelectedVersionIdx: idx }),

      // [FIX #313] 분석 완료 후 IndexedDB 자동 저장 — 새로고침 시 복구용
      autoSave: async () => {
        const { youtubeUrl, youtubeUrls, inputMode, selectedPreset, rawResult, versions, resultCache, thumbnails } = get();
        if (versions.length === 0) return;
        const validUrls = youtubeUrls.filter(u => u.trim());
        const selectedCacheSourceKey = selectedPreset ? resultCache[selectedPreset]?.sourceKey : undefined;
        const currentEntry = selectedPreset
          ? buildLiveResultCacheEntry(selectedCacheSourceKey, rawResult, versions, thumbnails)
          : undefined;
        const slot: SavedVideoAnalysisSlot = {
          id: 'va-autosave',
          name: `자동 저장 — ${selectedPreset || '분석'}`,
          youtubeUrl,
          youtubeUrls: validUrls,
          inputMode,
          selectedPreset,
          rawResult: trimStoredText(rawResult, PERSIST_RAW_RESULT_LIMIT),
          versions: compactVersionsForPersistence(versions),
          resultCache: buildPersistableResultCache(resultCache, selectedPreset, currentEntry),
          savedAt: Date.now(),
        };
        try {
          await saveVideoAnalysisSlot(slot);
        } catch (e) { console.warn('[VideoAnalysis] autoSave failed:', e); }
      },

      // [FIX #313] 마운트 시 자동 복구 — localStorage 유실 시 IndexedDB에서 복원
      tryAutoRecover: async () => {
        const { versions } = get();
        if (versions.length > 0) return false;
        try {
          const all = await getAllVideoAnalysisSlots();
          const autoSave = all.find(s => s.id === 'va-autosave');
          if (!autoSave || autoSave.versions.length === 0) return false;
          // 30분 이내의 자동 저장분만 복원
          if (Date.now() - autoSave.savedAt > 30 * 60 * 1000) return false;
          const urls = autoSave.youtubeUrls?.length
            ? autoSave.youtubeUrls
            : autoSave.youtubeUrl ? [autoSave.youtubeUrl] : [''];
          const restoredThumbs = compactTimedFrames(
            (autoSave.selectedPreset && autoSave.resultCache?.[autoSave.selectedPreset]?.thumbs) || [],
            STATE_THUMBNAIL_LIMIT,
          );
          set({
            youtubeUrl: autoSave.youtubeUrl,
            youtubeUrls: urls,
            inputMode: autoSave.inputMode,
            selectedPreset: autoSave.selectedPreset,
            rawResult: trimStoredText(autoSave.rawResult, PERSIST_RAW_RESULT_LIMIT),
            versions: compactVersionsForPersistence(autoSave.versions),
            resultCache: compactResultCacheEntries(autoSave.resultCache || {}, autoSave.selectedPreset, RESULT_CACHE_LIMIT),
            thumbnails: restoredThumbs,
            expandedId: null,
            error: null,
          });
          return true;
        } catch (e) {
          console.warn('[VideoAnalysis] autoRecover failed:', e);
          return false;
        }
      },

      newAnalysis: () => set({
        youtubeUrl: '',
        youtubeUrls: [''],
        selectedPreset: null,
        rawResult: '',
        versions: [],
        thumbnails: [],
        isFrameUpgrading: false,
        resultCache: {},
        error: null,
        expandedId: null,
        activeSlotId: null,
        videoBlob: null,
        videoBlobHasAudio: null,
      }),
    }),
    {
      name: 'video-analysis-store',
      // blob URL 썸네일은 localStorage에 저장 불가 — 텍스트 데이터만 영속화
      partialize: (state) => {
        // URL 썸네일 우선, data URL은 복원용 소수만 유지
        const persistableThumbs = buildPersistableThumbs(state.thumbnails);
        const selectedSourceKey = state.selectedPreset ? state.resultCache[state.selectedPreset]?.sourceKey : undefined;
        const currentEntry = state.selectedPreset
          ? buildLiveResultCacheEntry(selectedSourceKey, state.rawResult, state.versions, state.thumbnails)
          : undefined;

        return {
          inputMode: state.inputMode,
          youtubeUrl: state.youtubeUrl,
          youtubeUrls: state.youtubeUrls,
          targetDuration: state.targetDuration,
          keepOriginalOrder: state.keepOriginalOrder,
          versionCount: state.versionCount,
          selectedPreset: state.selectedPreset,
          rawResult: trimStoredText(state.rawResult, PERSIST_RAW_RESULT_LIMIT),
          versions: compactVersionsForPersistence(state.versions),
          thumbnails: persistableThumbs,
          expandedId: state.expandedId,
          resultCache: buildPersistableResultCache(state.resultCache, state.selectedPreset, currentEntry),
          // savedSlots, activeSlotId 제외 (IndexedDB에서 관리)
        };
      },
      // 리하이드레이션 시 현재 인메모리 thumbnails가 비어있지 않으면 보존
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as object),
        thumbnails: (currentState as VideoAnalysisStore).thumbnails?.length > 0
          ? (currentState as VideoAnalysisStore).thumbnails
          : ((persistedState as any)?.thumbnails || []),
      }),
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch (e) { logger.trackSwallowedError('VideoAnalysisStore:storage/getItem', e); return null; }
        },
        setItem: (name, value) => {
          const slimValue = () => {
            const persistedState = value.state as Partial<VideoAnalysisStore>;
            return {
              ...value,
              // [FIX #316] rawResult를 완전히 지우지 않고 첫 500자만 보존 — UI 표시 조건(truthy) 유지
              state: {
                ...value.state,
                resultCache: compactResultCacheEntries(
                  persistedState.resultCache || {},
                  persistedState.selectedPreset || null,
                  RESULT_CACHE_LIMIT,
                ),
                rawResult: persistedState.rawResult?.slice(0, 500) || '',
              },
            };
          };
          // 선제적 크기 체크 — JSON 직렬화 후 추정 크기가 크면 미리 축소
          const json = JSON.stringify(value);
          const MAX_ENTRY_BYTES = 3 * 1024 * 1024; // 3MB 안전선
          if (json.length > MAX_ENTRY_BYTES) {
            try {
              localStorage.setItem(name, JSON.stringify(slimValue()));
            } catch (e) {
              logger.trackSwallowedError('VideoAnalysisStore:storage/setItemSlim', e);
              showToast('저장 공간이 부족해요. 브라우저 설정에서 캐시를 정리해주세요.', 5000);
            }
            return;
          }
          try {
            localStorage.setItem(name, json);
          } catch (e) {
            logger.trackSwallowedError('VideoAnalysisStore:storage/setItem', e);
            // QuotaExceededError — 캐시 비우고 조용히 재시도
            try {
              localStorage.setItem(name, JSON.stringify(slimValue()));
            } catch (e2) {
              logger.trackSwallowedError('VideoAnalysisStore:storage/setItemRetry', e2);
              showToast('저장 공간이 부족해요. 브라우저 설정에서 캐시를 정리해주세요.', 5000);
            }
          }
        },
        removeItem: (name) => { try { localStorage.removeItem(name); } catch (e) { logger.trackSwallowedError('VideoAnalysisStore:storage/removeItem', e); } },
      },
    },
  ),
);
