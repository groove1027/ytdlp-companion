/**
 * syncService.ts — 크로스 디바이스 프로젝트 동기화
 *
 * 동작 흐름:
 * 1. 로컬 자동저장 후 scheduleSyncToCloud() 호출 (10s debounce)
 * 2. 로그인/앱 시작 시 performFullSync() 호출
 * 3. base64 이미지는 동기화 전 Cloudinary URL로 변환
 */

import { getToken } from './authService';
import { monitoredFetch } from './apiService';
import { getProject, saveProject, getAllProjectSummaries, deleteProject } from './storageService';
import { isBase64Image, persistAllSceneImages } from './imageStorageService';
import { useSyncStore } from '../stores/syncStore';
import { useProjectStore } from '../stores/projectStore';
import { logger } from './LoggerService';
import type { ProjectData, CloudProjectSummary, SyncStatus } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYNC_DEBOUNCE_MS = 10_000; // 10초
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _syncInProgress = false;
let _pendingSyncId: string | null = null;

// ---------------------------------------------------------------------------
// Internal: API 호출 헬퍼
// ---------------------------------------------------------------------------

const syncApi = async (endpoint: string, body: Record<string, unknown>): Promise<Response> => {
  const token = getToken();
  if (!token) throw new Error('NOT_LOGGED_IN');

  return monitoredFetch(`/api/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  });
};

// ---------------------------------------------------------------------------
// 프로젝트에 base64 이미지가 있는지 검사
// ---------------------------------------------------------------------------

const hasBase64Images = (project: ProjectData): boolean => {
  for (const scene of project.scenes) {
    if (isBase64Image(scene.imageUrl)) return true;
    if (isBase64Image(scene.referenceImage)) return true;
    if (isBase64Image(scene.sourceFrameUrl)) return true;
    if (isBase64Image(scene.startFrameUrl)) return true;
    if (isBase64Image(scene.editedStartFrameUrl)) return true;
    if (isBase64Image(scene.editedEndFrameUrl)) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// base64 이미지 → Cloudinary URL 변환
// ---------------------------------------------------------------------------

const migrateBase64Images = async (project: ProjectData): Promise<ProjectData> => {
  let changed = false;
  const updatedScenes = [...project.scenes];

  for (let i = 0; i < updatedScenes.length; i++) {
    const scene = updatedScenes[i];
    const patch = await persistAllSceneImages(scene);
    if (Object.keys(patch).length > 0) {
      updatedScenes[i] = { ...scene, ...patch };
      changed = true;
    }
  }

  if (changed) {
    const updated = { ...project, scenes: updatedScenes };
    // IndexedDB에도 업데이트된 URL 저장
    await saveProject(updated);
    return updated;
  }

  return project;
};

// ---------------------------------------------------------------------------
// 프로젝트 요약 메타데이터 추출 (서버 D1용)
// ---------------------------------------------------------------------------

const extractSyncSummary = (project: ProjectData) => ({
  sceneCount: project.scenes.length,
  completedImages: project.scenes.filter((s) => s.imageUrl && !s.imageUrl.startsWith('data:')).length,
  completedVideos: project.scenes.filter((s) => s.videoUrl).length,
  mode: project.config?.mode || 'SCRIPT',
  aspectRatio: project.config?.aspectRatio || '9:16',
  thumbnailUrl: project.scenes.find((s) => s.imageUrl && s.imageUrl.startsWith('http'))?.imageUrl || '',
  pipelineSteps: project.config?.pipelineSteps || {},
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 단일 프로젝트를 클라우드에 업로드
 */
export const syncProjectToCloud = async (projectId: string): Promise<void> => {
  const token = getToken();
  if (!token) return; // 로그인 안 됨 → 무시

  const { setSyncStatus } = useSyncStore.getState();
  setSyncStatus(projectId, 'syncing');

  try {
    let project = await getProject(projectId);
    if (!project) {
      setSyncStatus(projectId, 'error');
      return;
    }

    // base64 이미지 → Cloudinary URL 변환 (동기화 전 필수)
    if (hasBase64Images(project)) {
      try {
        project = await migrateBase64Images(project);
      } catch (e) {
        // Cloudinary 실패 시에도 동기화 시도 (일부 base64 포함될 수 있음)
        logger.trackSwallowedError('syncService:migrateBase64', e);
      }
    }

    const summary = extractSyncSummary(project);

    const res = await syncApi('sync-project', { project, summary });
    const data = await res.json() as { status: string; error?: string };

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    setSyncStatus(projectId, 'synced');
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_LOGGED_IN') {
      setSyncStatus(projectId, 'local-only');
    } else {
      setSyncStatus(projectId, 'error');
      logger.trackSwallowedError('syncService:syncProjectToCloud', e);
    }
  }
};

/**
 * 디바운스된 동기화 스케줄링 (자동저장 후 호출)
 */
export const scheduleSyncToCloud = (projectId: string): void => {
  if (!getToken()) return;

  _pendingSyncId = projectId;

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(async () => {
    _debounceTimer = null;
    const id = _pendingSyncId;
    if (!id) return;
    _pendingSyncId = null;

    if (_syncInProgress) {
      // 이미 동기화 중이면 다음 라운드에서 처리
      _pendingSyncId = id;
      return;
    }

    _syncInProgress = true;
    try {
      await syncProjectToCloud(id);
    } finally {
      _syncInProgress = false;

      // 대기 중인 동기화가 있으면 다시 스케줄
      if (_pendingSyncId) {
        scheduleSyncToCloud(_pendingSyncId);
      }
    }
  }, SYNC_DEBOUNCE_MS);
};

/**
 * 클라우드 프로젝트 목록 가져오기
 */
export const fetchCloudProjectList = async (): Promise<CloudProjectSummary[]> => {
  const res = await syncApi('list-projects', {});
  const data = await res.json() as { projects: CloudProjectSummary[]; error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.projects || [];
};

/**
 * 클라우드에서 프로젝트 다운로드
 */
export const downloadCloudProject = async (projectId: string): Promise<ProjectData> => {
  const res = await syncApi('get-project', { projectId });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return await res.json() as ProjectData;
};

/**
 * 클라우드에서 프로젝트 삭제
 */
export const deleteCloudProject = async (projectId: string): Promise<void> => {
  try {
    const res = await syncApi('delete-project-cloud', { projectId });
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_LOGGED_IN') return;
    logger.trackSwallowedError('syncService:deleteCloudProject', e);
  }
};

/**
 * 전체 동기화 (로그인/앱 시작 시 호출)
 *
 * 1. 로컬 프로젝트 목록 + 클라우드 프로젝트 목록 가져오기
 * 2. sync-batch API로 비교
 * 3. needsUpload: 로컬 → 클라우드
 * 4. needsDownload: 클라우드 → 로컬
 * 5. deleted: 로컬에서 삭제
 */
export const performFullSync = async (): Promise<void> => {
  const token = getToken();
  if (!token) return;

  if (_syncInProgress) return;
  _syncInProgress = true;

  const store = useSyncStore.getState();
  store.setIsSyncing(true);
  store.setSyncError(null);

  try {
    // 1. 로컬 프로젝트 목록
    const localSummaries = await getAllProjectSummaries();
    const localProjects = localSummaries.map((s) => ({
      id: s.id,
      lastModified: s.lastModified,
    }));

    // 2. sync-batch API 호출
    const batchRes = await syncApi('sync-batch', { projects: localProjects });
    const batchData = await batchRes.json() as {
      needsUpload: string[];
      needsDownload: string[];
      deleted: string[];
      error?: string;
    };

    if (!batchRes.ok) throw new Error(batchData.error || `HTTP ${batchRes.status}`);

    const statuses: Record<string, SyncStatus> = {};

    // 3. 업로드 필요한 프로젝트 처리
    for (const id of batchData.needsUpload) {
      try {
        statuses[id] = 'syncing';
        store.setSyncStatus(id, 'syncing');
        await syncProjectToCloud(id);
        statuses[id] = 'synced';
      } catch (e) {
        statuses[id] = 'error';
        logger.trackSwallowedError(`syncService:fullSync/upload/${id}`, e);
      }
    }

    // 4. 다운로드 필요한 프로젝트 처리
    for (const id of batchData.needsDownload) {
      try {
        statuses[id] = 'syncing';
        store.setSyncStatus(id, 'syncing');
        const project = await downloadCloudProject(id);
        await saveProject(project);
        statuses[id] = 'synced';
      } catch (e) {
        statuses[id] = 'error';
        logger.trackSwallowedError(`syncService:fullSync/download/${id}`, e);
      }
    }

    // 5. 클라우드에서 삭제된 프로젝트 로컬 삭제
    for (const id of batchData.deleted) {
      try {
        // 현재 열린 프로젝트는 삭제하지 않음
        const currentId = useProjectStore.getState().currentProjectId;
        if (id !== currentId) {
          await deleteProject(id);
        }
      } catch (e) {
        logger.trackSwallowedError(`syncService:fullSync/delete/${id}`, e);
      }
    }

    // 이미 동기화된 프로젝트 상태 설정
    for (const s of localSummaries) {
      if (!statuses[s.id]) {
        statuses[s.id] = 'synced';
      }
    }

    store.setSyncStatusBatch(statuses);
    store.setLastFullSyncAt(Date.now());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'NOT_LOGGED_IN') {
      store.setSyncError(msg);
      logger.trackSwallowedError('syncService:performFullSync', e);
    }
  } finally {
    _syncInProgress = false;
    store.setIsSyncing(false);
  }
};
