import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AspectRatio,
  ImageModel,
  ProjectData,
  Scene,
  Thumbnail,
  VideoFormat,
  VideoModel,
  VoiceName,
} from '../types';

const mocks = vi.hoisted(() => ({
  addCost: vi.fn(),
  restoreCostStats: vi.fn(),
  resetCosts: vi.fn(),
  soundReset: vi.fn(),
  soundSetLines: vi.fn(),
  soundSetMergedAudio: vi.fn(),
  soundSetState: vi.fn(),
  scriptWriterReset: vi.fn(),
  restoreScriptWriterDraft: vi.fn(),
  channelAnalysisReset: vi.fn(),
  videoAnalysisReset: vi.fn(),
  editPointReset: vi.fn(),
  editorReset: vi.fn(),
  shoppingShortReset: vi.fn(),
  uploadReset: vi.fn(),
  pptMasterReset: vi.fn(),
  editRoomReset: vi.fn(),
  editRoomSetState: vi.fn(),
  imageVideoRestoreFromConfig: vi.fn(),
  safeLocalStorageSetItem: vi.fn(() => true),
  safeLocalStorageGetItem: vi.fn(() => null),
  safeLocalStorageRemoveItem: vi.fn(() => true),
  loggerInfo: vi.fn(),
  loggerTrackSwallowedError: vi.fn(),
  loggerRegisterBlobUrl: vi.fn(),
  loggerUnregisterBlobUrl: vi.fn(),
  restoreProjectImages: vi.fn(async () => ({
    sceneImageMap: new Map(),
    thumbnailMap: new Map(),
  })),
  restoreProjectAudio: vi.fn(async () => ({
    sceneAudioMap: new Map(),
    mergedUrl: null,
  })),
}));

vi.mock('../stores/costStore', () => ({
  useCostStore: {
    getState: () => ({
      addCost: mocks.addCost,
      restoreCostStats: mocks.restoreCostStats,
      resetCosts: mocks.resetCosts,
      costStats: {
        totalUsd: 0,
        imageCount: 0,
        videoCount: 0,
        analysisCount: 0,
        ttsCount: 0,
        musicCount: 0,
      },
    }),
  },
}));

vi.mock('../stores/soundStudioStore', () => ({
  useSoundStudioStore: {
    getState: () => ({
      reset: mocks.soundReset,
      setLines: mocks.soundSetLines,
      setMergedAudio: mocks.soundSetMergedAudio,
      mergedAudioUrl: undefined,
    }),
    setState: mocks.soundSetState,
  },
}));

vi.mock('../stores/scriptWriterStore', () => ({
  getScriptWriterDraftSnapshot: vi.fn(() => null),
  restoreScriptWriterDraft: mocks.restoreScriptWriterDraft,
  useScriptWriterStore: {
    getState: () => ({
      reset: mocks.scriptWriterReset,
    }),
  },
}));

vi.mock('../stores/channelAnalysisStore', () => ({
  useChannelAnalysisStore: {
    getState: () => ({
      reset: mocks.channelAnalysisReset,
    }),
  },
}));

vi.mock('../stores/videoAnalysisStore', () => ({
  useVideoAnalysisStore: {
    getState: () => ({
      reset: mocks.videoAnalysisReset,
    }),
  },
}));

vi.mock('../stores/editPointStore', () => ({
  useEditPointStore: {
    getState: () => ({
      reset: mocks.editPointReset,
    }),
  },
}));

vi.mock('../stores/editorStore', () => ({
  useEditorStore: {
    getState: () => ({
      reset: mocks.editorReset,
    }),
  },
}));

vi.mock('../stores/shoppingShortStore', () => ({
  useShoppingShortStore: {
    getState: () => ({
      reset: mocks.shoppingShortReset,
    }),
  },
}));

vi.mock('../stores/uploadStore', () => ({
  useUploadStore: {
    getState: () => ({
      resetUpload: mocks.uploadReset,
    }),
  },
}));

vi.mock('../stores/pptMasterStore', () => ({
  usePptMasterStore: {
    getState: () => ({
      reset: mocks.pptMasterReset,
    }),
  },
}));

vi.mock('../stores/editRoomStore', () => ({
  useEditRoomStore: {
    getState: () => ({
      reset: mocks.editRoomReset,
    }),
    setState: mocks.editRoomSetState,
  },
}));

vi.mock('../stores/imageVideoStore', () => ({
  useImageVideoStore: {
    getState: () => ({
      restoreFromConfig: mocks.imageVideoRestoreFromConfig,
    }),
  },
}));

vi.mock('../services/imageStorageService', () => ({
  isBase64Image: vi.fn(() => false),
  persistImage: vi.fn(async (value: string) => value),
}));

vi.mock('../services/storageService', () => ({
  safeLocalStorageGetItem: mocks.safeLocalStorageGetItem,
  safeLocalStorageRemoveItem: mocks.safeLocalStorageRemoveItem,
  safeLocalStorageSetItem: mocks.safeLocalStorageSetItem,
}));

vi.mock('../services/LoggerService', () => ({
  logger: {
    info: mocks.loggerInfo,
    trackSwallowedError: mocks.loggerTrackSwallowedError,
    registerBlobUrl: mocks.loggerRegisterBlobUrl,
    unregisterBlobUrl: mocks.loggerUnregisterBlobUrl,
  },
}));

vi.mock('../utils/uploadedTranscriptScenes', () => ({
  buildUploadedTranscriptLines: vi.fn(() => null),
  isUploadedTranscriptConfig: vi.fn(() => false),
}));

vi.mock('../utils/sceneText', () => ({
  getSceneNarrationText: vi.fn((scene: { scriptText?: string }) => scene.scriptText || ''),
}));

vi.mock('../services/imageBlobStorageService', () => ({
  SCENE_IMAGE_FIELDS: ['imageUrl', 'previousSceneImageUrl', 'referenceImage', 'sourceFrameUrl', 'startFrameUrl', 'editedStartFrameUrl', 'editedEndFrameUrl'],
  mergeRestoredSceneImageFields: vi.fn((scene: Scene) => scene),
  mergeRestoredThumbnailImage: vi.fn((thumbnail: Thumbnail) => thumbnail),
  restoreProjectImages: mocks.restoreProjectImages,
}));

vi.mock('../services/audioStorageService', () => ({
  restoreProjectAudio: mocks.restoreProjectAudio,
}));

describe('projectStore cost restoration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.restoreProjectImages.mockResolvedValue({
      sceneImageMap: new Map(),
      thumbnailMap: new Map(),
    });
    mocks.restoreProjectAudio.mockResolvedValue({
      sceneAudioMap: new Map(),
      mergedUrl: null,
    });
  });

  it('restores saved project cost without calling addCost on project load', async () => {
    const { useProjectStore } = await import('../stores/projectStore');

    const project: ProjectData = {
      id: 'proj-cost-restore',
      title: 'Saved Project',
      config: {
        mode: 'SCRIPT',
        script: 'saved script',
        detectedStyleDescription: '',
        detectedCharacterDescription: '',
        imageModel: ImageModel.FLASH,
        videoModel: VideoModel.GROK,
        aspectRatio: AspectRatio.PORTRAIT,
        voice: VoiceName.KORE,
        videoFormat: VideoFormat.SHORT,
      },
      scenes: [],
      thumbnails: [],
      fullNarrationText: '',
      lastModified: Date.now(),
      costStats: {
        totalUsd: 3.26,
        imageCount: 4,
        videoCount: 1,
        analysisCount: 2,
        ttsCount: 0,
        musicCount: 0,
      },
    };

    useProjectStore.getState().loadProject(project);
    await Promise.resolve();

    expect(mocks.restoreCostStats).toHaveBeenCalledTimes(1);
    expect(mocks.restoreCostStats).toHaveBeenCalledWith(project.costStats);
    expect(mocks.addCost).not.toHaveBeenCalled();
  });
});
