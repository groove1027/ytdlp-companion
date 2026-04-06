
import { openDB, DBSchema, deleteDB } from 'idb';
import { ProjectData, ProjectSummary, StorageEstimate, SavedCharacter, MusicLibraryItem, ChannelScript, ChannelGuideline, ChannelInfo, ChannelInputSource, VideoVersionItem, VideoAnalysisPreset, VideoTimedFrame, RemakeVersion, LegacyTopicRecommendation } from '../types';
import { logger } from './LoggerService';

// --- DB Schema ---

/** 음악 라이브러리 저장용 래퍼 (groupTitle을 key로 사용) */
export interface SavedMusicGroup {
  id: string;            // groupTitle을 id로 사용
  groupTitle: string;
  tracks: MusicLibraryItem['tracks'];
  savedAt: number;
}

/** 벤치마크 데이터 저장용 (채널명을 key로 사용) */
export interface SavedBenchmarkData {
  id: string;
  channelName: string;
  scripts: ChannelScript[];
  guideline: ChannelGuideline | null;
  savedAt: number;
  channelInfo?: ChannelInfo | null;
  inputSource?: ChannelInputSource;
  /** [#414] 리메이크 대본 3버전 (프리셋 복원용) */
  remakeVersions?: RemakeVersion[];
  /** [#414] 리메이크 소스 입력값 (프리셋 복원용) */
  remakeSourceInput?: string;
  /** [FIX #509] 채널 분석에 사용된 URL */
  channelUrl?: string;
  /** [#498] 스타일 기반 주제 추천 결과 (자동 저장) */
  topicRecommendations?: LegacyTopicRecommendation[];
}

/** IndexedDB에 저장되는 오디오 Blob 래퍼 */
export interface SavedAudioBlob {
  id: string;          // `${projectId}::scene::${sceneId}` 또는 `${projectId}::merged`
  projectId: string;
  blob: Blob;
  createdAt: number;
}

/** IndexedDB에 저장되는 이미지 Blob 래퍼 */
export interface SavedImageBlob {
  id: string;          // `${projectId}::scene::${sceneId}::${field}` 또는 `${projectId}::thumb::${thumbId}`
  projectId: string;
  sceneId: string;
  field: string;
  blob: Blob;
  createdAt: number;
}

/** 영상분석 슬롯 저장용 */
export interface SavedVideoAnalysisSlot {
  id: string;
  name: string;
  youtubeUrl: string;
  youtubeUrls?: string[];       // 다중 영상 URL (v4.6+)
  inputMode: 'upload' | 'youtube';
  selectedPreset: VideoAnalysisPreset | null;
  rawResult: string;
  versions: VideoVersionItem[];
  resultCache: Record<string, { sourceKey?: string; raw: string; versions: VideoVersionItem[]; thumbs: VideoTimedFrame[] }>;
  savedAt: number;
}

interface StoryboardDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectData;
  };
  project_summaries: {
    key: string;
    value: ProjectSummary;
  };
  characters: {
    key: string;
    value: SavedCharacter;
  };
  music: {
    key: string;
    value: SavedMusicGroup;
  };
  benchmarks: {
    key: string;
    value: SavedBenchmarkData;
  };
  'audio-blobs': {
    key: string;
    value: SavedAudioBlob;
    indexes: {
      projectId: string;
    };
  };
  'image-blobs': {
    key: string;
    value: SavedImageBlob;
    indexes: {
      projectId: string;
    };
  };
  'video-analysis': {
    key: string;
    value: SavedVideoAnalysisSlot;
  };
}

const DB_NAME = 'ai-storyboard-v2';
const PROJECT_STORE = 'projects';
const SUMMARY_STORE = 'project_summaries';
const CHARACTER_STORE = 'characters';
const MUSIC_STORE = 'music';
const BENCHMARK_STORE = 'benchmarks';
const AUDIO_BLOB_STORE = 'audio-blobs';
const IMAGE_BLOB_STORE = 'image-blobs';
const VIDEO_ANALYSIS_STORE = 'video-analysis';
export const BLOB_PROJECT_ID_INDEX = 'projectId' as const;
const LAST_PROJECT_POINTER_KEY = 'last-project-id';
const TRANSIENT_LOCAL_STORAGE_KEYS = ['video-analysis-store', 'SCRIPT_WRITER_DRAFT', 'navigation-state', 'onboarding-tour-completed'] as const;
const TRANSIENT_LOCAL_STORAGE_PREFIXES = ['ai-chat-sessions-'] as const;
const STORAGE_DOM_EXCEPTION_NAMES = new Set(['QuotaExceededError']);
const STORAGE_CONTEXTUAL_DOM_EXCEPTION_NAMES = new Set(['UnknownError', 'InvalidStateError', 'VersionError', 'NotFoundError']);
const STORAGE_ERROR_PATTERNS = [
  /\bquota(?:\s+exceeded)?\b/i,
  /exceeded the quota/i,
  /\bindexeddb\b/i,
  /\bidbdatabase\b/i,
  /\bdatabase connection\b/i,
  /\bobject store\b/i,
  /\b(?:local|session)storage\b/i,
  /failed to execute '(?:setitem|getitem|removeitem|clear)' on 'storage'/i,
  /\b(?:setitem|getitem|removeitem|clear)\b.*\bstorage\b/i,
  /\btransaction\b.*\b(?:indexeddb|idbdatabase|object store|database)\b/i,
  /\b(?:indexeddb|idbdatabase|object store|database)\b.*\btransaction\b/i,
] as const;

// All required object stores
const ALL_STORES = [
  PROJECT_STORE,
  SUMMARY_STORE,
  CHARACTER_STORE,
  MUSIC_STORE,
  BENCHMARK_STORE,
  AUDIO_BLOB_STORE,
  IMAGE_BLOB_STORE,
  VIDEO_ANALYSIS_STORE,
] as const;

export const safeLocalStorageGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    logger.trackSwallowedError(`storageService:safeLocalStorageGetItem:${key}`, e);
    return null;
  }
};

export const safeLocalStorageSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    logger.trackSwallowedError(`storageService:safeLocalStorageSetItem:${key}`, e);
    return false;
  }
};

export const safeLocalStorageRemoveItem = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    logger.trackSwallowedError(`storageService:safeLocalStorageRemoveItem:${key}`, e);
    return false;
  }
};

export const isStorageRelatedError = (error: unknown): boolean => {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === 'string'
      ? error
      : '';

  if (error instanceof DOMException) {
    if (STORAGE_DOM_EXCEPTION_NAMES.has(error.name)) {
      return true;
    }

    if (!STORAGE_CONTEXTUAL_DOM_EXCEPTION_NAMES.has(error.name)) {
      return false;
    }
  }

  if (!message) return false;
  return STORAGE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const ensureProjectIdIndex = (store: {
  indexNames: DOMStringList;
  createIndex: (name: string, keyPath: string) => unknown;
}) => {
  if (!store.indexNames.contains(BLOB_PROJECT_ID_INDEX)) {
    store.createIndex(BLOB_PROJECT_ID_INDEX, BLOB_PROJECT_ID_INDEX);
  }
};

const ensureBlobStore = (
  db: {
    objectStoreNames: DOMStringList;
    createObjectStore: (name: string, options?: IDBObjectStoreParameters) => {
      indexNames: DOMStringList;
      createIndex: (name: string, keyPath: string) => unknown;
    };
  },
  transaction: {
    objectStore: (name: typeof AUDIO_BLOB_STORE | typeof IMAGE_BLOB_STORE) => {
      indexNames: DOMStringList;
      createIndex: (name: string, keyPath: string) => unknown;
    };
  },
  storeName: typeof AUDIO_BLOB_STORE | typeof IMAGE_BLOB_STORE,
) => {
  if (!db.objectStoreNames.contains(storeName)) {
    const store = db.createObjectStore(storeName, { keyPath: 'id' });
    ensureProjectIdIndex(store);
    return store;
  }

  const store = transaction.objectStore(storeName);
  ensureProjectIdIndex(store);
  return store;
};

// Initialize DB (v10: blob store projectId 인덱스 추가)
export const dbPromise = openDB<StoryboardDB>(DB_NAME, 10, {
  upgrade(db, oldVersion, _newVersion, transaction) {
    if (oldVersion < 1) {
      db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      db.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      db.createObjectStore(CHARACTER_STORE, { keyPath: 'id' });
    }
    if (oldVersion < 4) {
      db.createObjectStore(MUSIC_STORE, { keyPath: 'id' });
    }
    if (oldVersion < 5) {
      db.createObjectStore(BENCHMARK_STORE, { keyPath: 'id' });
    }
    if (oldVersion < 6) {
      const store = db.createObjectStore(AUDIO_BLOB_STORE, { keyPath: 'id' });
      ensureProjectIdIndex(store);
    }
    if (oldVersion < 7) {
      db.createObjectStore(VIDEO_ANALYSIS_STORE, { keyPath: 'id' });
    }
    // v8: 누락된 object store 자동 복구 (브라우저 데이터 부분 삭제 등)
    if (oldVersion < 8) {
      for (const name of ALL_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          if (name === AUDIO_BLOB_STORE || name === IMAGE_BLOB_STORE) {
            ensureProjectIdIndex(store);
          }
        }
      }
    }
    // v9: 이미지 blob 영속화 store 추가
    if (oldVersion < 9 && !db.objectStoreNames.contains(IMAGE_BLOB_STORE)) {
      const store = db.createObjectStore(IMAGE_BLOB_STORE, { keyPath: 'id' });
      ensureProjectIdIndex(store);
    }
    // v10: audio/image blob store에 projectId 인덱스 추가 (기존 데이터 유지)
    if (oldVersion < 10) {
      ensureBlobStore(db, transaction, AUDIO_BLOB_STORE);
      ensureBlobStore(db, transaction, IMAGE_BLOB_STORE);
    }
  },
});

// --- Summary Extraction ---

function estimateProjectSizeMB(project: ProjectData): number {
  try {
    const json = JSON.stringify(project);
    return parseFloat((new Blob([json]).size / (1024 * 1024)).toFixed(1));
  } catch (e) {
    logger.trackSwallowedError('storageService:estimateProjectSizeMB', e);
    return 0;
  }
}

function extractSummary(project: ProjectData): ProjectSummary {
  const scenes = project.scenes || [];
  const config = project.config || {} as ProjectData['config'];
  return {
    id: project.id,
    title: project.title || '제목 없음',
    createdAt: project.createdAt,
    lastModified: project.lastModified,
    mode: config.mode,
    aspectRatio: config.aspectRatio,
    atmosphere: config.atmosphere,
    sceneCount: scenes.length,
    completedImages: scenes.filter(s => s.imageUrl).length,
    completedVideos: scenes.filter(s => s.videoUrl).length,
    // [FIX] 첫 번째 이미지를 썸네일로 사용 (URL 우선, base64 폴백)
    thumbnailUrl: scenes.find(s => s.imageUrl && !s.imageUrl.startsWith('data:'))?.imageUrl
      || scenes.find(s => s.imageUrl)?.imageUrl,
    estimatedSizeMB: estimateProjectSizeMB(project),

    // [v4.5] 스마트 프로젝트 확장
    lastActiveTab: config.lastActiveTab,
    pipelineSteps: config.pipelineSteps,
    isManuallyNamed: config.isManuallyNamed,
    // Hover Scrub용: URL 이미지만 (base64 제외, 최대 10개)
    sceneImageUrls: scenes
      .filter(s => s.imageUrl && !s.imageUrl.startsWith('data:'))
      .map(s => s.imageUrl!)
      .slice(0, 10),
  };
}

// --- Core CRUD ---

export const saveProject = async (project: ProjectData) => {
  const db = await dbPromise;
  const now = Date.now();
  if (!project.createdAt) {
    // 기존 프로젝트: DB에서 createdAt 복원 시도
    const existing = await db.get(PROJECT_STORE, project.id);
    project.createdAt = existing?.createdAt || now;
  }
  project.lastModified = now;

  const summary = extractSummary(project);

  try {
    const tx = db.transaction([PROJECT_STORE, SUMMARY_STORE], 'readwrite');
    tx.objectStore(PROJECT_STORE).put(project);
    tx.objectStore(SUMMARY_STORE).put(summary);
    await tx.done;
  } catch (e: unknown) {
    // QuotaExceededError 처리
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.error('[Storage] QuotaExceededError: 브라우저 저장소 용량 초과');
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error('[Storage] 프로젝트 저장 실패:', e);
    throw e;
  }
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  const db = await dbPromise;
  return await db.get(PROJECT_STORE, id);
};

export const deleteProject = async (id: string) => {
  const db = await dbPromise;
  const tx = db.transaction([PROJECT_STORE, SUMMARY_STORE], 'readwrite');
  tx.objectStore(PROJECT_STORE).delete(id);
  tx.objectStore(SUMMARY_STORE).delete(id);
  await tx.done;

  // audio-blobs 클린업 (별도 트랜잭션 — 메인 삭제 실패 방지)
  try {
    const { deleteProjectAudio } = await import('./audioStorageService');
    await deleteProjectAudio(id);
  } catch (e) { logger.trackSwallowedError('StorageService:deleteProject/audioCleanup', e); }

  // image-blobs 클린업 (별도 트랜잭션 — 메인 삭제 실패 방지)
  try {
    const { deleteProjectImages } = await import('./imageBlobStorageService');
    await deleteProjectImages(id);
  } catch (e) { logger.trackSwallowedError('StorageService:deleteProject/imageCleanup', e); }
};

export const deleteAllProjects = async () => {
  const db = await dbPromise;
  const tx = db.transaction([PROJECT_STORE, SUMMARY_STORE, AUDIO_BLOB_STORE, IMAGE_BLOB_STORE], 'readwrite');
  tx.objectStore(PROJECT_STORE).clear();
  tx.objectStore(SUMMARY_STORE).clear();
  tx.objectStore(AUDIO_BLOB_STORE).clear();
  tx.objectStore(IMAGE_BLOB_STORE).clear();
  await tx.done;
};

// --- Lightweight Summary Listing (핵심: 전체 프로젝트를 로드하지 않음) ---

export const getAllProjectSummaries = async (): Promise<ProjectSummary[]> => {
  const db = await dbPromise;
  let summaries = await db.getAll(SUMMARY_STORE);

  // v1→v2 마이그레이션: summary 스토어가 비어있으면 기존 프로젝트에서 생성
  if (summaries.length === 0) {
    const projects = await db.getAll(PROJECT_STORE);
    if (projects.length > 0) {
      const tx = db.transaction(SUMMARY_STORE, 'readwrite');
      summaries = projects.map(extractSummary);
      for (const s of summaries) {
        tx.store.put(s);
      }
      await tx.done;
    }
  }

  return summaries.sort((a, b) => b.lastModified - a.lastModified);
};

// --- Legacy: Full load (기존 코드 호환 — 목록용으로 사용 금지) ---

export const getAllProjects = async (): Promise<ProjectData[]> => {
  const db = await dbPromise;
  const projects = await db.getAll(PROJECT_STORE);
  return projects.sort((a, b) => b.lastModified - a.lastModified);
};

// --- Storage Quota ---

export const getStorageEstimate = async (): Promise<StorageEstimate> => {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usedMB = Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10;
      const totalMB = Math.round((est.quota || 0) / (1024 * 1024));
      const percent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
      return { usedMB, totalMB, percent };
    }
  } catch (e) {
    console.warn('[Storage] estimate() failed:', e);
  }
  return { usedMB: 0, totalMB: 0, percent: 0 };
};

export const requestPersistentStorage = async (): Promise<boolean> => {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch (e) {
    console.warn('[Storage] persist() failed:', e);
  }
  return false;
};

export const clearTransientStorageCaches = async (options?: {
  includeLastProjectPointer?: boolean;
  currentProjectId?: string | null;
}): Promise<{
  clearedLocalKeys: string[];
  removedEmptyProjects: number;
  removedAutosaveSlot: boolean;
  estimate: StorageEstimate;
}> => {
  const clearedLocalKeys = new Set<string>();
  const localKeys: string[] = [...TRANSIENT_LOCAL_STORAGE_KEYS];
  if (options?.includeLastProjectPointer) {
    localKeys.push(LAST_PROJECT_POINTER_KEY);
  }

  for (const key of localKeys) {
    if (safeLocalStorageGetItem(key) !== null && safeLocalStorageRemoveItem(key)) {
      clearedLocalKeys.add(key);
    }
  }

  try {
    const existingKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean) as string[];
    for (const key of existingKeys) {
      if (!key) continue;
      if (TRANSIENT_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        if (safeLocalStorageRemoveItem(key)) {
          clearedLocalKeys.add(key);
        }
      }
    }
  } catch (e) {
    logger.trackSwallowedError('storageService:clearTransientStorageCaches/localScan', e);
  }

  let removedEmptyProjects = 0;
  try {
    removedEmptyProjects = await cleanupEmptyProjects(options?.currentProjectId);
  } catch (e) {
    logger.trackSwallowedError('storageService:clearTransientStorageCaches/cleanupEmptyProjects', e);
  }

  let removedAutosaveSlot = false;
  try {
    const db = await dbPromise;
    const hasAutosave = await db.get(VIDEO_ANALYSIS_STORE, 'va-autosave');
    if (hasAutosave) {
      await db.delete(VIDEO_ANALYSIS_STORE, 'va-autosave');
      removedAutosaveSlot = true;
    }
  } catch (e) {
    logger.trackSwallowedError('storageService:clearTransientStorageCaches/removeAutosaveSlot', e);
  }

  const estimate = await getStorageEstimate().catch((e) => {
    logger.trackSwallowedError('storageService:clearTransientStorageCaches/getStorageEstimate', e);
    return { usedMB: 0, totalMB: 0, percent: 0 };
  });

  return {
    clearedLocalKeys: Array.from(clearedLocalKeys),
    removedEmptyProjects,
    removedAutosaveSlot,
    estimate,
  };
};

export const resetAppStorageForRecovery = async (): Promise<void> => {
  await clearTransientStorageCaches({ includeLastProjectPointer: true });

  try {
    const db = await dbPromise.catch(() => null);
    db?.close();
  } catch (e) {
    logger.trackSwallowedError('storageService:resetAppStorageForRecovery/closeDb', e);
  }

  try {
    await deleteDB(DB_NAME);
  } catch (e) {
    logger.trackSwallowedError('storageService:resetAppStorageForRecovery/deleteDb', e);
  }
};

// --- Quota-based project creation check (replaces hard 10-limit) ---

export const canCreateNewProject = async (): Promise<boolean> => {
  let estimate = await getStorageEstimate();
  if (estimate.totalMB === 0) return true;
  if (estimate.percent < 92) return true;

  await clearTransientStorageCaches();
  estimate = await getStorageEstimate();

  if (estimate.totalMB === 0) return true;
  return estimate.percent < 97;
};

// --- Empty Project Cleanup ---

/**
 * 빈 임시 프로젝트 자동 정리 — 장면 0개 + 이미지 0개 + "임시 프로젝트" 제목인 프로젝트를 삭제.
 * 단, 현재 열려 있는 프로젝트(currentId)는 삭제하지 않음.
 * @param currentId 현재 열린 프로젝트 ID (보호)
 * @returns 삭제된 프로젝트 수
 */
export const cleanupEmptyProjects = async (currentId?: string | null): Promise<number> => {
  const db = await dbPromise;
  const summaries = await db.getAll(SUMMARY_STORE);
  let cleaned = 0;

  // 가장 최근 프로젝트는 절대 삭제하지 않음
  const sorted = [...summaries].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  const mostRecentId = sorted[0]?.id;

  for (const s of summaries) {
    if (s.id === currentId) continue;
    if (s.id === mostRecentId) continue; // 최신 프로젝트 보호
    // 조건: 장면 없고, 이미지 없고, 임시 제목인 프로젝트
    const isEmpty = s.sceneCount === 0 && s.completedImages === 0;
    const isTempTitle = s.title.startsWith('임시 프로젝트') || s.title.startsWith('새 프로젝트');
    // 1시간 이상 경과한 빈 임시 프로젝트만 삭제
    const isOldEnough = (Date.now() - (s.lastModified || 0)) > 3_600_000;
    if (isEmpty && isTempTitle && isOldEnough) {
      await deleteProject(s.id);
      cleaned++;
    }
  }
  return cleaned;
};

/**
 * 가장 최근 수정된 프로젝트 ID를 반환 (빈 임시 프로젝트 제외).
 * 유의미한 프로젝트가 없으면 가장 최근 프로젝트 아무거나 반환.
 */
export const getMostRecentProjectId = async (): Promise<string | null> => {
  const summaries = await getAllProjectSummaries(); // lastModified 내림차순 정렬됨
  // 우선: 장면이 있는 프로젝트
  const meaningful = summaries.find(s => s.sceneCount > 0 || s.completedImages > 0);
  if (meaningful) return meaningful.id;
  // 폴백: 아무 프로젝트
  return summaries[0]?.id || null;
};

// --- Character Library ---

export const saveCharacterToLibrary = async (character: SavedCharacter): Promise<void> => {
  const db = await dbPromise;
  await db.put(CHARACTER_STORE, character);
};

export const getAllSavedCharacters = async (): Promise<SavedCharacter[]> => {
  const db = await dbPromise;
  const all = await db.getAll(CHARACTER_STORE);
  return all.sort((a, b) => b.savedAt - a.savedAt);
};

export const deleteSavedCharacter = async (id: string): Promise<void> => {
  const db = await dbPromise;
  await db.delete(CHARACTER_STORE, id);
};

// --- Music Library ---

export const saveMusicGroup = async (item: MusicLibraryItem): Promise<void> => {
  const db = await dbPromise;
  const saved: SavedMusicGroup = {
    id: item.groupTitle,
    groupTitle: item.groupTitle,
    tracks: item.tracks,
    savedAt: Date.now(),
  };
  await db.put(MUSIC_STORE, saved);
};

export const getAllSavedMusic = async (): Promise<MusicLibraryItem[]> => {
  const db = await dbPromise;
  const all = await db.getAll(MUSIC_STORE);
  return all
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((m) => ({ groupTitle: m.groupTitle, tracks: m.tracks }));
};

export const deleteSavedMusic = async (groupTitle: string): Promise<void> => {
  const db = await dbPromise;
  await db.delete(MUSIC_STORE, groupTitle);
};

export const deleteAllSavedMusic = async (): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(MUSIC_STORE, 'readwrite');
  tx.objectStore(MUSIC_STORE).clear();
  await tx.done;
};

// --- Benchmark Data ---

export const saveBenchmarkData = async (
  channelName: string,
  scripts: ChannelScript[],
  guideline: ChannelGuideline | null,
  channelInfo?: ChannelInfo | null,
  inputSource?: ChannelInputSource,
  remakeVersions?: RemakeVersion[],
  remakeSourceInput?: string,
  channelUrl?: string,
  topicRecommendations?: LegacyTopicRecommendation[],
): Promise<void> => {
  const db = await dbPromise;
  const id = channelName.trim().toLowerCase().replace(/\s+/g, '-');
  const saved: SavedBenchmarkData = { id, channelName, scripts, guideline, savedAt: Date.now(), channelInfo, inputSource, remakeVersions, remakeSourceInput, channelUrl, topicRecommendations };
  await db.put(BENCHMARK_STORE, saved);
};

export const getAllSavedBenchmarks = async (): Promise<SavedBenchmarkData[]> => {
  const db = await dbPromise;
  const all = await db.getAll(BENCHMARK_STORE);
  return all.sort((a, b) => b.savedAt - a.savedAt);
};

export const deleteSavedBenchmark = async (id: string): Promise<void> => {
  const db = await dbPromise;
  await db.delete(BENCHMARK_STORE, id);
};

export const deleteAllSavedBenchmarks = async (): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(BENCHMARK_STORE, 'readwrite');
  tx.objectStore(BENCHMARK_STORE).clear();
  await tx.done;
};

// --- Video Analysis Slots ---

export const saveVideoAnalysisSlot = async (slot: SavedVideoAnalysisSlot): Promise<void> => {
  const db = await dbPromise;
  await db.put(VIDEO_ANALYSIS_STORE, slot);
};

export const getAllVideoAnalysisSlots = async (): Promise<SavedVideoAnalysisSlot[]> => {
  const db = await dbPromise;
  const all = await db.getAll(VIDEO_ANALYSIS_STORE);
  return all.sort((a, b) => b.savedAt - a.savedAt);
};

export const deleteVideoAnalysisSlot = async (id: string): Promise<void> => {
  const db = await dbPromise;
  await db.delete(VIDEO_ANALYSIS_STORE, id);
};
