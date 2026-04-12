import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AspectRatio,
  ImageModel,
  ScriptAiModel,
  VideoFormat,
  VideoModel,
  VoiceName,
  ProjectConfig,
  Scene,
  ScriptWriterDraftState,
  Thumbnail,
} from '../types';

const mocks = vi.hoisted(() => {
  const createStore = <T extends object>(initialState: T) => {
    let state = initialState;
    const listeners = new Set<() => void>();

    return {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setState: (updater: Partial<T> | ((prev: T) => T)) => {
        state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
        listeners.forEach((listener) => listener());
      },
      reset: (nextState: T) => {
        state = nextState;
      },
    };
  };

  const buildUniqueBlobUrlList = (blobUrls: Iterable<string>): string[] => Array.from(new Set(blobUrls));

  const defaultScriptWriterState: ScriptWriterDraftState = {
    inputMode: 'normal',
    contentFormat: 'shorts',
    shortsSeconds: 30,
    benchmarkScript: '',
    title: '테스트 제목',
    synopsis: '',
    manualText: '테스트 대본',
    generatedScript: null,
    styledScript: '',
    styledStyleName: '',
    finalScript: '테스트 대본',
    videoFormat: 'short-form' as VideoFormat,
    longFormSplitType: 'DEFAULT',
    smartSplit: false,
    targetCharCount: 0,
    splitResult: [],
    splitResultFingerprint: '',
    activeStep: 0,
    videoAnalysisStyles: [],
    scriptAiModel: 'gemini-3.1-pro' as ScriptAiModel,
    referenceComments: '',
    targetRegion: 'ko',
  };

  const defaultConfig: ProjectConfig = {
    mode: 'SCRIPT',
    script: '테스트 대본',
    detectedStyleDescription: '',
    detectedCharacterDescription: '',
    imageModel: 'model_std_flash' as ImageModel,
    videoModel: 'grok' as VideoModel,
    aspectRatio: '9:16' as AspectRatio,
    voice: 'Kore' as VoiceName,
    videoFormat: 'short-form' as VideoFormat,
    narrationSource: 'tts',
  };

  const defaultScene: Scene = {
    id: 'scene-1',
    scriptText: '장면 대사',
    visualPrompt: 'scene prompt',
    visualDescriptionKO: '장면 설명',
    characterPresent: false,
    isGeneratingImage: false,
    isGeneratingVideo: false,
  };

  const defaultThumbnail: Thumbnail = {
    id: 'thumb-1',
    textOverlay: '',
    visualDescription: '',
    isGenerating: false,
    format: 'short',
  };

  const saveProject = vi.fn(async () => undefined);
  const getStorageEstimate = vi.fn(async () => ({ usedMB: 10, totalMB: 100, percent: 10 }));
  const showToast = vi.fn();
  const setLastAutoSavedAt = vi.fn();
  const scheduleSyncToCloud = vi.fn();
  const trackSwallowedError = vi.fn();
  const persistProjectAudio = vi.fn(async () => undefined);
  const persistProjectImages = vi.fn(async () => ({
    attempted: 0,
    persisted: 0,
    failed: 0,
    failedKeys: [],
    activeBlobUrls: [],
    attemptedBlobUrls: [],
    failedBlobUrls: [],
    skippedBlobUrls: [],
    allSucceeded: true,
  }));

  let projectStore: ReturnType<typeof createStore<any>>;
  const buildProjectStoreState = (overrides?: Partial<{
    currentProjectId: string;
    config: ProjectConfig | null;
    scenes: Scene[];
    thumbnails: Thumbnail[];
    projectTitle: string;
  }>) => ({
    currentProjectId: 'project-1',
    config: overrides?.config === null
      ? null
      : { ...defaultConfig, ...(overrides?.config || {}) },
    scenes: overrides?.scenes || [{ ...defaultScene }],
    thumbnails: overrides?.thumbnails || [],
    projectTitle: overrides?.projectTitle || '테스트 프로젝트',
    setConfig: (updater: (prev: ProjectConfig | null) => ProjectConfig | null) => {
      projectStore.setState((prev) => ({
        ...prev,
        config: updater(prev.config),
      }));
    },
  });
  projectStore = createStore(buildProjectStoreState());

  const costStore = createStore({
    costStats: {
      totalUsd: 0,
      imageCount: 0,
      videoCount: 0,
      analysisCount: 0,
      ttsCount: 0,
      musicCount: 0,
    },
  });

  const editRoomStore = createStore({
    sceneSubtitles: {},
  });

  const scriptWriterStore = createStore({
    snapshot: defaultScriptWriterState,
  });

  const uiStore = createStore({
    setLastAutoSavedAt,
  });

  const imagePersistResults: Array<{
    attempted: number;
    persisted: number;
    failed: number;
    failedKeys: string[];
    activeBlobUrls: string[];
    attemptedBlobUrls: string[];
    failedBlobUrls: string[];
    skippedBlobUrls: string[];
    allSucceeded: boolean;
  }> = [];

  persistProjectImages.mockImplementation(async () => {
    const nextResult = imagePersistResults.shift();
    return nextResult || {
      attempted: 0,
      persisted: 0,
      failed: 0,
      failedKeys: [],
      activeBlobUrls: [],
      attemptedBlobUrls: [],
      failedBlobUrls: [],
      skippedBlobUrls: [],
      allSucceeded: true,
    };
  });

  return {
    buildProjectStoreState,
    costStore,
    defaultConfig,
    defaultScene,
    defaultThumbnail,
    defaultScriptWriterState,
    editRoomStore,
    getStorageEstimate,
    imagePersistResults,
    persistProjectAudio,
    persistProjectImages,
    projectStore,
    saveProject,
    scheduleSyncToCloud,
    scriptWriterStore,
    setLastAutoSavedAt,
    showToast,
    trackSwallowedError,
    uiStore,
    buildUniqueBlobUrlList,
  };
});

vi.mock('../stores/projectStore', () => ({
  useProjectStore: mocks.projectStore,
}));

vi.mock('../stores/costStore', () => ({
  useCostStore: mocks.costStore,
}));

vi.mock('../stores/editRoomStore', () => ({
  useEditRoomStore: mocks.editRoomStore,
}));

vi.mock('../stores/scriptWriterStore', () => ({
  getLatestScriptWriterText: (state: ScriptWriterDraftState) => state.finalScript,
  getScriptWriterDraftSnapshot: () => mocks.scriptWriterStore.getState().snapshot,
  useScriptWriterStore: mocks.scriptWriterStore,
}));

vi.mock('../services/storageService', () => ({
  saveProject: mocks.saveProject,
  getStorageEstimate: mocks.getStorageEstimate,
}));

vi.mock('../stores/uiStore', () => ({
  showToast: mocks.showToast,
  useUIStore: mocks.uiStore,
}));

vi.mock('../services/LoggerService', () => ({
  logger: {
    trackSwallowedError: mocks.trackSwallowedError,
  },
}));

vi.mock('../services/syncService', () => ({
  scheduleSyncToCloud: mocks.scheduleSyncToCloud,
}));

vi.mock('../services/audioStorageService', () => ({
  persistProjectAudio: mocks.persistProjectAudio,
}));

vi.mock('../services/imageBlobStorageService', () => ({
  MAX_AUTOSAVE_IMAGE_BLOB_RETRIES: 3,
  collectProjectImageBlobUrls: (scenes: Scene[], thumbnails: Thumbnail[]) => {
    const sceneBlobUrls = scenes
      .map((scene) => scene.imageUrl)
      .filter((imageUrl): imageUrl is string => typeof imageUrl === 'string' && imageUrl.startsWith('blob:'));
    const thumbnailBlobUrls = thumbnails
      .map((thumbnail) => thumbnail.imageUrl)
      .filter((imageUrl): imageUrl is string => typeof imageUrl === 'string' && imageUrl.startsWith('blob:'));

    return mocks.buildUniqueBlobUrlList([...sceneBlobUrls, ...thumbnailBlobUrls]);
  },
  syncImageBlobRetryCounts: (retryCounts: Map<string, number>, activeBlobUrls: readonly string[], maxRetries = 3) => {
    const activeBlobUrlSet = new Set(activeBlobUrls);

    for (const blobUrl of Array.from(retryCounts.keys())) {
      if (!activeBlobUrlSet.has(blobUrl)) {
        retryCounts.delete(blobUrl);
      }
    }

    return Array.from(retryCounts.entries())
      .filter(([, attemptCount]) => attemptCount >= maxRetries)
      .map(([blobUrl]) => blobUrl);
  },
  applyImageBlobPersistRetryResult: (
    retryCounts: Map<string, number>,
    attemptedBlobUrls: readonly string[],
    failedBlobUrls: readonly string[],
    maxRetries = 3,
  ) => {
    const failedBlobUrlSet = new Set(failedBlobUrls);
    const newlyAbandonedBlobUrls: string[] = [];

    for (const blobUrl of mocks.buildUniqueBlobUrlList(attemptedBlobUrls)) {
      if (!failedBlobUrlSet.has(blobUrl)) {
        retryCounts.delete(blobUrl);
        continue;
      }

      const nextAttemptCount = (retryCounts.get(blobUrl) || 0) + 1;
      retryCounts.set(blobUrl, nextAttemptCount);

      if (nextAttemptCount === maxRetries) {
        newlyAbandonedBlobUrls.push(blobUrl);
      }
    }

    return {
      newlyAbandonedBlobUrls,
      retryableBlobUrls: mocks.buildUniqueBlobUrlList(failedBlobUrls).filter(
        (blobUrl) => (retryCounts.get(blobUrl) || 0) < maxRetries,
      ),
    };
  },
  persistProjectImages: mocks.persistProjectImages,
}));

const { persistCurrentProjectSnapshot, useAutoSave } = await import('../hooks/useAutoSave');

const AutoSaveHarness = () => {
  useAutoSave();
  return null;
};

const createImagePersistFailure = (blobUrl: string, key: string) => ({
  attempted: 1,
  persisted: 0,
  failed: 1,
  failedKeys: [key],
  activeBlobUrls: [blobUrl],
  attemptedBlobUrls: [blobUrl],
  failedBlobUrls: [blobUrl],
  skippedBlobUrls: [],
  allSucceeded: false,
});

const createImagePersistSuccess = (blobUrl: string) => ({
  attempted: 1,
  persisted: 1,
  failed: 0,
  failedKeys: [],
  activeBlobUrls: [blobUrl],
  attemptedBlobUrls: [blobUrl],
  failedBlobUrls: [],
  skippedBlobUrls: [],
  allSucceeded: true,
});

const mountHarness = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AutoSaveHarness />);
  });

  return { container, root };
};

const flushMicrotasks = async (count = 5) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

const flushBackgroundPersistence = async () => {
  for (let index = 0; index < 50; index += 1) {
    await flushMicrotasks(20);
    await vi.advanceTimersByTimeAsync(1);
  }
};

const waitFor = async (predicate: () => boolean, message: string) => {
  for (let index = 0; index < 250; index += 1) {
    if (predicate()) return;
    await flushBackgroundPersistence();
  }

  throw new Error(message);
};

const triggerProjectStoreSaveRound = async () => {
  await act(async () => {
    mocks.projectStore.setState((prev) => ({ ...prev }));
    await vi.advanceTimersByTimeAsync(5000);
    await flushBackgroundPersistence();
  });
};

const triggerPeriodicSaveRound = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
    await flushBackgroundPersistence();
  });
};

describe('useAutoSave P2 media persistence separation', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.imagePersistResults.length = 0;

    const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
    Object.defineProperties(globalThis, {
      window: { value: window, configurable: true, writable: true },
      document: { value: document, configurable: true, writable: true },
      self: { value: window, configurable: true, writable: true },
      navigator: { value: window.navigator, configurable: true },
      HTMLElement: { value: window.HTMLElement, configurable: true, writable: true },
      Node: { value: window.Node, configurable: true, writable: true },
      Text: { value: window.Text, configurable: true, writable: true },
      Event: { value: window.Event, configurable: true, writable: true },
      CustomEvent: { value: window.CustomEvent, configurable: true, writable: true },
      requestAnimationFrame: {
        value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
        configurable: true,
        writable: true,
      },
      cancelAnimationFrame: {
        value: (id: number) => clearTimeout(id),
        configurable: true,
        writable: true,
      },
      IS_REACT_ACT_ENVIRONMENT: {
        value: true,
        configurable: true,
        writable: true,
      },
    });

    mocks.projectStore.reset(mocks.buildProjectStoreState());
    mocks.costStore.reset({
      costStats: {
        totalUsd: 0,
        imageCount: 0,
        videoCount: 0,
        analysisCount: 0,
        ttsCount: 0,
        musicCount: 0,
      },
    });
    mocks.editRoomStore.reset({ sceneSubtitles: {} });
    mocks.scriptWriterStore.reset({ snapshot: mocks.defaultScriptWriterState });
    mocks.uiStore.reset({ setLastAutoSavedAt: mocks.setLastAutoSavedAt });

    const mounted = await mountHarness();
    root = mounted.root;
    container = mounted.container;
  });

  afterEach(async () => {
    await flushBackgroundPersistence();

    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }

    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }

    root = null;
    container = null;
    vi.useRealTimers();
  });

  it('does not get stuck on a permanently broken blob URL and notifies only once after abandonment', async () => {
    const blobUrl = 'blob:test:broken-image';
    const imageKey = 'project-1::scene::scene-1::imageUrl';

    mocks.projectStore.reset(mocks.buildProjectStoreState({
      scenes: [{ ...mocks.defaultScene, imageUrl: blobUrl }],
    }));
    mocks.imagePersistResults.push(
      createImagePersistFailure(blobUrl, imageKey),
      createImagePersistFailure(blobUrl, imageKey),
      createImagePersistFailure(blobUrl, imageKey),
    );

    await triggerProjectStoreSaveRound();
    await waitFor(
      () => mocks.trackSwallowedError.mock.calls.some(([label]) => label === 'useAutoSave:persistProjectImages/incomplete'),
      'first image persistence failure did not settle',
    );
    await triggerPeriodicSaveRound();
    await waitFor(
      () => mocks.persistProjectImages.mock.calls.length >= 2,
      'second image persistence retry did not run',
    );
    await triggerPeriodicSaveRound();
    await waitFor(
      () => mocks.persistProjectImages.mock.calls.length >= 3,
      'third image persistence retry did not run',
    );
    await triggerPeriodicSaveRound();

    expect(mocks.saveProject).toHaveBeenCalledTimes(1);
    expect(mocks.setLastAutoSavedAt).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleSyncToCloud).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleSyncToCloud).toHaveBeenCalledWith('project-1');
    expect(mocks.persistProjectImages).toHaveBeenCalledTimes(3);
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    expect(mocks.trackSwallowedError).toHaveBeenCalledWith(
      'useAutoSave:persistProjectImages/abandoned',
      expect.any(Error),
    );
  });

  it('advances fingerprint on saveProject success and retries image persistence on the next identical round', async () => {
    const blobUrl = 'blob:test:transient-image';
    const imageKey = 'project-1::scene::scene-1::imageUrl';

    mocks.projectStore.reset(mocks.buildProjectStoreState({
      scenes: [{ ...mocks.defaultScene, imageUrl: blobUrl }],
    }));
    mocks.imagePersistResults.push(
      createImagePersistFailure(blobUrl, imageKey),
      createImagePersistSuccess(blobUrl),
    );

    await triggerProjectStoreSaveRound();
    await waitFor(
      () => mocks.trackSwallowedError.mock.calls.some(([label]) => label === 'useAutoSave:persistProjectImages/incomplete'),
      'transient image persistence failure did not settle',
    );
    await triggerPeriodicSaveRound();
    await waitFor(
      () => mocks.persistProjectImages.mock.calls.length >= 2,
      'transient image persistence retry did not run',
    );
    await triggerPeriodicSaveRound();

    expect(mocks.saveProject).toHaveBeenCalledTimes(1);
    expect(mocks.persistProjectImages).toHaveBeenCalledTimes(2);
    expect(mocks.setLastAutoSavedAt).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleSyncToCloud).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('persists the current snapshot immediately when a project switch forces a save', async () => {
    const blobUrl = 'blob:test:forced-save-image';

    mocks.projectStore.reset(mocks.buildProjectStoreState({
      scenes: [{ ...mocks.defaultScene, imageUrl: blobUrl }],
    }));
    mocks.imagePersistResults.push(createImagePersistSuccess(blobUrl));

    await act(async () => {
      await persistCurrentProjectSnapshot();
      await flushBackgroundPersistence();
    });

    expect(mocks.saveProject).toHaveBeenCalledTimes(1);
    expect(mocks.persistProjectImages.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mocks.setLastAutoSavedAt).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleSyncToCloud).toHaveBeenCalledWith('project-1');
  });
});
