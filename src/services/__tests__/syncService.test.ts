import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectData, ProjectSummary, SyncStatus } from '../../types';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const SYNC_DELETING_IDS_STORAGE_KEY = 'cloud-sync-deleting-ids';

const mocks = vi.hoisted(() => {
  const monitoredFetch = vi.fn();
  const getProject = vi.fn();
  const saveProject = vi.fn(async () => undefined);
  const getAllProjectSummaries = vi.fn(async () => []);
  const deleteProject = vi.fn(async () => undefined);
  const getToken = vi.fn(() => 'token-1');
  const persistAllSceneImages = vi.fn(async () => ({}));
  const isBase64Image = vi.fn(() => false);
  const trackSwallowedError = vi.fn();

  const syncStoreState = {
    projectSyncStatus: {} as Record<string, SyncStatus>,
    isSyncing: false,
    lastFullSyncAt: null as number | null,
    syncError: null as string | null,
  };

  const setSyncStatus = vi.fn((projectId: string, status: SyncStatus) => {
    syncStoreState.projectSyncStatus[projectId] = status;
  });
  const setSyncStatusBatch = vi.fn((statuses: Record<string, SyncStatus>) => {
    syncStoreState.projectSyncStatus = { ...syncStoreState.projectSyncStatus, ...statuses };
  });
  const setIsSyncing = vi.fn((syncing: boolean) => {
    syncStoreState.isSyncing = syncing;
  });
  const setLastFullSyncAt = vi.fn((timestamp: number) => {
    syncStoreState.lastFullSyncAt = timestamp;
  });
  const setSyncError = vi.fn((error: string | null) => {
    syncStoreState.syncError = error;
  });

  const projectStoreState = {
    currentProjectId: null as string | null,
  };
  const clearProjectState = vi.fn(() => {
    projectStoreState.currentProjectId = null;
  });
  const useProjectStore = {
    getState: () => ({
      currentProjectId: projectStoreState.currentProjectId,
      clearProjectState,
    }),
  };
  const useSyncStore = {
    getState: () => ({
      projectSyncStatus: syncStoreState.projectSyncStatus,
      isSyncing: syncStoreState.isSyncing,
      lastFullSyncAt: syncStoreState.lastFullSyncAt,
      syncError: syncStoreState.syncError,
      setSyncStatus,
      setSyncStatusBatch,
      setIsSyncing,
      setLastFullSyncAt,
      setSyncError,
    }),
  };

  return {
    clearProjectState,
    deleteProject,
    getAllProjectSummaries,
    getProject,
    getToken,
    isBase64Image,
    monitoredFetch,
    persistAllSceneImages,
    projectStoreState,
    saveProject,
    setIsSyncing,
    setLastFullSyncAt,
    setSyncError,
    setSyncStatus,
    setSyncStatusBatch,
    syncStoreState,
    trackSwallowedError,
    useProjectStore,
    useSyncStore,
  };
});

vi.mock('../authService', () => ({
  getToken: mocks.getToken,
}));

vi.mock('../apiService', () => ({
  monitoredFetch: mocks.monitoredFetch,
}));

vi.mock('../storageService', () => ({
  deleteProject: mocks.deleteProject,
  getAllProjectSummaries: mocks.getAllProjectSummaries,
  getProject: mocks.getProject,
  saveProject: mocks.saveProject,
}));

vi.mock('../imageStorageService', () => ({
  isBase64Image: mocks.isBase64Image,
  persistAllSceneImages: mocks.persistAllSceneImages,
}));

vi.mock('../../stores/syncStore', () => ({
  useSyncStore: mocks.useSyncStore,
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: mocks.useProjectStore,
}));

vi.mock('../LoggerService', () => ({
  logger: {
    trackSwallowedError: mocks.trackSwallowedError,
  },
}));

const makeProject = (overrides: Partial<ProjectData> = {}): ProjectData => ({
  id: overrides.id || 'project-1',
  title: overrides.title || '테스트 프로젝트',
  config: {
    mode: 'SCRIPT',
    aspectRatio: '9:16',
    pipelineSteps: {},
  } as ProjectData['config'],
  scenes: overrides.scenes || [{
    id: 'scene-1',
    scriptText: '장면 대사',
    visualPrompt: 'scene prompt',
    visualDescriptionKO: '장면 설명',
    characterPresent: false,
    isGeneratingImage: false,
    isGeneratingVideo: false,
  }],
  thumbnails: overrides.thumbnails || [],
  fullNarrationText: overrides.fullNarrationText || '',
  createdAt: overrides.createdAt ?? 1,
  lastModified: overrides.lastModified ?? 1,
  scriptWriterState: overrides.scriptWriterState,
  costStats: overrides.costStats,
  sceneSubtitles: overrides.sceneSubtitles,
});

const makeSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: overrides.id || 'project-1',
  title: overrides.title || '테스트 프로젝트',
  createdAt: overrides.createdAt ?? 1,
  lastModified: overrides.lastModified ?? 1,
  mode: overrides.mode || 'SCRIPT',
  aspectRatio: overrides.aspectRatio || '9:16',
  sceneCount: overrides.sceneCount ?? 1,
  completedImages: overrides.completedImages ?? 0,
  completedVideos: overrides.completedVideos ?? 0,
  thumbnailUrl: overrides.thumbnailUrl,
  estimatedSizeMB: overrides.estimatedSizeMB,
  atmosphere: overrides.atmosphere,
  lastActiveTab: overrides.lastActiveTab,
  pipelineSteps: overrides.pipelineSteps,
  isManuallyNamed: overrides.isManuallyNamed,
  sceneImageUrls: overrides.sceneImageUrls,
});

const jsonResponse = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
);

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('syncService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });

    mocks.getToken.mockReturnValue('token-1');
    mocks.syncStoreState.projectSyncStatus = {};
    mocks.syncStoreState.isSyncing = false;
    mocks.syncStoreState.lastFullSyncAt = null;
    mocks.syncStoreState.syncError = null;
    mocks.projectStoreState.currentProjectId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('restores deleting ids from sessionStorage and skips debounced sync for deleted projects', async () => {
    sessionStorage.setItem(SYNC_DELETING_IDS_STORAGE_KEY, JSON.stringify({
      token: 'token-1',
      ids: ['project-1'],
      ts: Date.now(),
    }));

    const { scheduleSyncToCloud } = await import('../syncService');

    scheduleSyncToCloud('project-1');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mocks.getProject).not.toHaveBeenCalled();
    expect(mocks.monitoredFetch).not.toHaveBeenCalled();
  });

  it('skips cloud sync for empty temporary projects', async () => {
    mocks.getProject.mockResolvedValue(makeProject({
      id: 'temp-1',
      title: '임시 프로젝트 04/13 18:00',
      scenes: [],
    }));

    const { syncProjectToCloud } = await import('../syncService');

    await syncProjectToCloud('temp-1');

    expect(mocks.monitoredFetch).not.toHaveBeenCalled();
    expect(mocks.deleteProject).not.toHaveBeenCalled();
    expect(mocks.setSyncStatus).toHaveBeenLastCalledWith('temp-1', 'local-only');
  });

  it('removes local zombie projects when the server returns 409 tombstone conflict', async () => {
    mocks.projectStoreState.currentProjectId = 'project-409';
    mocks.getProject.mockResolvedValue(makeProject({ id: 'project-409' }));
    mocks.monitoredFetch.mockResolvedValue(jsonResponse({
      error: '삭제된 프로젝트는 다시 업로드할 수 없습니다.',
    }, 409));

    const { syncProjectToCloud } = await import('../syncService');

    await syncProjectToCloud('project-409');

    expect(mocks.deleteProject).toHaveBeenCalledWith('project-409');
    expect(mocks.clearProjectState).toHaveBeenCalledTimes(1);
    expect(mocks.setSyncStatus).toHaveBeenLastCalledWith('project-409', 'local-only');

    const persisted = JSON.parse(sessionStorage.getItem(SYNC_DELETING_IDS_STORAGE_KEY) || '{}') as {
      token?: string;
      ids?: string[];
    };
    expect(persisted.token).toBe('token-1');
    expect(persisted.ids).toEqual(['project-409']);
  });

  it('clears the current project when full sync receives a cloud deletion tombstone', async () => {
    mocks.projectStoreState.currentProjectId = 'project-deleted';
    mocks.getAllProjectSummaries.mockResolvedValue([
      makeSummary({ id: 'project-deleted' }),
    ]);
    mocks.monitoredFetch.mockImplementation(async (url: string) => {
      if (url === '/api/auth/sync-batch') {
        return jsonResponse({
          needsUpload: [],
          needsDownload: [],
          deleted: ['project-deleted'],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { performFullSync } = await import('../syncService');

    await performFullSync();

    expect(mocks.clearProjectState).toHaveBeenCalledTimes(1);
    expect(mocks.deleteProject).toHaveBeenCalledWith('project-deleted');
  });

  it('downloads cloud projects with a maximum concurrency of five during full sync', async () => {
    const downloadIds = Array.from({ length: 12 }, (_, index) => `project-${index + 1}`);
    const releases: Array<() => void> = [];
    let activeDownloads = 0;
    let maxActiveDownloads = 0;

    mocks.getAllProjectSummaries.mockResolvedValue([]);
    mocks.monitoredFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === '/api/auth/sync-batch') {
        return jsonResponse({
          needsUpload: [],
          needsDownload: downloadIds,
          deleted: [],
        });
      }

      if (url === '/api/auth/get-project') {
        const request = JSON.parse(String(options?.body || '{}')) as { projectId: string };
        activeDownloads += 1;
        maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
        await new Promise<void>((resolve) => releases.push(resolve));
        activeDownloads -= 1;
        return jsonResponse(makeProject({
          id: request.projectId,
          title: `다운로드 ${request.projectId}`,
        }));
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { performFullSync } = await import('../syncService');
    const syncPromise = performFullSync();

    for (const expectedConcurrent of [5, 5, 2]) {
      while (releases.length < expectedConcurrent) {
        await flushPromises();
      }
      expect(maxActiveDownloads).toBeLessThanOrEqual(5);
      releases.splice(0, expectedConcurrent).forEach((release) => release());
      await flushPromises();
    }

    await syncPromise;

    expect(maxActiveDownloads).toBe(5);
    expect(mocks.saveProject).toHaveBeenCalledTimes(12);
  });
});
