import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ProjectConfig, Scene, Thumbnail, ProjectData, VideoFormat, AspectRatio, ImageModel, PipelineSteps, ScriptWriterDraftState } from '../types';
import { useCostStore } from './costStore';
import { useSoundStudioStore } from './soundStudioStore';
import { getScriptWriterDraftSnapshot, restoreScriptWriterDraft, useScriptWriterStore } from './scriptWriterStore';
import { useChannelAnalysisStore } from './channelAnalysisStore';
import { useVideoAnalysisStore } from './videoAnalysisStore';
import { useEditPointStore } from './editPointStore';
import { useEditorStore } from './editorStore';
import { useShoppingShortStore } from './shoppingShortStore';
import { useUploadStore } from './uploadStore';
import { persistImage, isBase64Image } from '../services/imageStorageService';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../services/storageService';
import { logger } from '../services/LoggerService';
import { usePptMasterStore } from './pptMasterStore';
import { buildUploadedTranscriptLines, isUploadedTranscriptConfig } from '../utils/uploadedTranscriptScenes';
import { getSceneNarrationText } from '../utils/sceneText';

// editRoomStore → projectStore 순환 참조 방지: lazy import 사용
let _editRoomStoreRef: any = null;
import('./editRoomStore').then(m => { _editRoomStoreRef = m.useEditRoomStore; }).catch(() => {});
const getEditRoomStore = () => _editRoomStoreRef;
const useEditRoomStore = { getState: () => getEditRoomStore()?.getState() || { reset: () => {} } };

// Monotonic counter to guarantee unique scene IDs even within the same millisecond
let _idCounter = 0;
const uniqueSceneId = () => `s-${Date.now()}-${++_idCounter}`;
const GENERATED_VISUAL_PROMPT_PREFIX = 'Cinematic scene illustrating:';

const toTrimmedString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const buildVisualPromptFallback = (scriptText: unknown): string => {
  const snippet = toTrimmedString(scriptText).slice(0, 200);
  return snippet ? `${GENERATED_VISUAL_PROMPT_PREFIX} ${snippet}` : `${GENERATED_VISUAL_PROMPT_PREFIX} scene details`;
};

const hasMeaningfulVisualPrompt = (value: unknown): value is string => toTrimmedString(value).length > 0;

const isGeneratedVisualPrompt = (value: unknown): value is string =>
  hasMeaningfulVisualPrompt(value) && toTrimmedString(value).startsWith(GENERATED_VISUAL_PROMPT_PREFIX);

const normalizeSceneVisualPrompt = <T extends Pick<Scene, 'scriptText' | 'visualPrompt'>>(scene: T): T => {
  const nextVisualPrompt = hasMeaningfulVisualPrompt(scene.visualPrompt)
    ? toTrimmedString(scene.visualPrompt)
    : buildVisualPromptFallback(scene.scriptText);
  return nextVisualPrompt === scene.visualPrompt ? scene : { ...scene, visualPrompt: nextVisualPrompt };
};

const applySceneUpdate = (scene: Scene, partial: Partial<Scene>): Scene => {
  const nextScene = { ...scene, ...partial };
  if (Object.prototype.hasOwnProperty.call(partial, 'visualPrompt')) {
    return normalizeSceneVisualPrompt(nextScene);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'scriptText') && isGeneratedVisualPrompt(scene.visualPrompt)) {
    return { ...nextScene, visualPrompt: buildVisualPromptFallback(nextScene.scriptText) };
  }
  return normalizeSceneVisualPrompt(nextScene);
};

const buildUniqueBlobUrlList = (blobUrls: Iterable<string | null | undefined>): string[] =>
  Array.from(new Set(
    Array.from(blobUrls).filter((url): url is string => typeof url === 'string' && url.startsWith('blob:')),
  ));

const trackBlobUrls = (
  blobUrls: readonly string[],
  type: 'image' | 'audio',
  owner: string,
) => {
  buildUniqueBlobUrlList(blobUrls).forEach((url) => {
    logger.registerBlobUrl(url, type, owner);
  });
};

const revokeBlobUrls = (blobUrls: readonly string[]) => {
  buildUniqueBlobUrlList(blobUrls).forEach((url) => {
    logger.unregisterBlobUrl(url);
    URL.revokeObjectURL(url);
  });
};

const collectRestoredImageBlobUrls = (
  sceneImageMap: ReadonlyMap<string, ReadonlyMap<string, string>>,
  thumbnailMap: ReadonlyMap<string, string>,
): string[] => {
  const urls: string[] = [];

  sceneImageMap.forEach((fieldMap) => {
    fieldMap.forEach((url) => {
      urls.push(url);
    });
  });
  thumbnailMap.forEach((url) => {
    urls.push(url);
  });

  return buildUniqueBlobUrlList(urls);
};

const collectRestoredAudioBlobUrls = (
  sceneAudioMap: ReadonlyMap<string, string>,
  mergedUrl?: string | null,
): string[] => buildUniqueBlobUrlList([
  ...sceneAudioMap.values(),
  mergedUrl,
]);

const buildScriptWriterRestoreState = (project: ProjectData): Partial<ScriptWriterDraftState> | null => {
  if (project.scriptWriterState) {
    return project.scriptWriterState;
  }

  const fallbackScript = (project.config?.script || '').trim();
  if (!fallbackScript && !project.config) {
    return null;
  }

  return {
    title: project.title || '',
    manualText: fallbackScript,
    finalScript: fallbackScript,
    videoFormat: project.config?.videoFormat || VideoFormat.SHORT,
    longFormSplitType: project.config?.longFormSplitType || 'DEFAULT',
    smartSplit: project.config?.smartSplit ?? true,
    activeStep: fallbackScript ? 3 : 1,
    targetCharCount: Math.max(fallbackScript.length, 5000),
  };
};

/**
 * 프로젝트가 없을 때: 기존 프로젝트 복원 → 없으면 새로 생성.
 * 비동기로 동작하며, 복원/생성 성공 시 true 반환.
 * 빈 임시 프로젝트를 무한 생성하지 않도록 반드시 기존 프로젝트를 먼저 시도.
 */
export const autoRestoreOrCreateProject = async (): Promise<boolean> => {
  const { config } = useProjectStore.getState();
  if (config) return false; // 이미 로드된 프로젝트 있음

  try {
    const {
      getProject,
      getMostRecentProjectId,
    } = await import('../services/storageService');

    // 1) localStorage의 마지막 프로젝트 복원 시도 (자동 복원 → 비용도 함께 복원)
    const lastId = safeLocalStorageGetItem('last-project-id');
    if (lastId) {
      const project = await getProject(lastId);
      if (project) {
        useProjectStore.getState().loadProject(project, { skipCostRestore: true });
        return true;
      }
      safeLocalStorageRemoveItem('last-project-id');
    }

    // 2) IndexedDB에서 가장 최근 프로젝트 복원 (자동 복원 → 비용도 함께 복원)
    const recentId = await getMostRecentProjectId();
    if (recentId) {
      const project = await getProject(recentId);
      if (project) {
        useProjectStore.getState().loadProject(project, { skipCostRestore: true });
        return true;
      }
    }

    // 3) 프로젝트가 아예 없을 때만 새로 생성
    useProjectStore.getState().newProject(undefined, { preserveAnalysisState: true });
    return true;
  } catch (e) {
    console.warn('[autoRestoreOrCreateProject] failed, creating new:', e);
    useProjectStore.getState().newProject(undefined, { preserveAnalysisState: true });
    return true;
  }
};

/** @deprecated 하위 호환용 — autoRestoreOrCreateProject()를 사용하세요 */
export const autoNewProjectIfNeeded = (): boolean => {
  const { config } = useProjectStore.getState();
  if (config) return false;
  // 비동기 복원을 동기 호출에서 시작 (fire-and-forget)
  autoRestoreOrCreateProject();
  return true;
};

interface ProjectStore {
  // State
  config: ProjectConfig | null;
  scenes: Scene[];
  thumbnails: Thumbnail[];
  projectTitle: string;
  currentProjectId: string | null;
  batchGrokDuration: '6' | '10';
  batchGrokSpeech: boolean;
  _loadGeneration: number; // increments on each loadProject to prevent stale async updates
  _restoredImageBlobUrls: string[];
  _restoredAudioBlobUrls: string[];

  // Setters (React setState signature compatible for useVideoBatch bridge)
  setConfig: (config: ProjectConfig | null | ((prev: ProjectConfig | null) => ProjectConfig | null)) => void;
  setScenes: (scenes: Scene[] | ((prev: Scene[]) => Scene[])) => void;
  setThumbnails: (thumbnails: Thumbnail[] | ((prev: Thumbnail[]) => Thumbnail[])) => void;
  setProjectTitle: (title: string) => void;
  setCurrentProjectId: (id: string | null) => void;
  setBatchGrokDuration: (d: '6' | '10' | ((prev: '6' | '10') => '6' | '10')) => void;
  setBatchGrokSpeech: (speech: boolean) => void;

  // Scene mutation helpers
  updateScene: (id: string, partial: Partial<Scene>) => void;
  splitScene: (index: number) => void;
  mergeScene: (index: number) => void;
  addSceneAfter: (index: number) => void;
  removeScene: (index: number) => void;

  // Project lifecycle
  loadProject: (project: ProjectData, options?: { skipCostRestore?: boolean }) => void;
  newProject: (title?: string, options?: { preserveAnalysisState?: boolean }) => void;
  clearProjectState: () => void;

  // [v4.5] 스마트 프로젝트
  smartUpdateTitle: (tab: string, hint: string) => void;
  markPipelineStep: (step: keyof PipelineSteps) => void;
  setLastActiveTab: (tab: string) => void;

  // [FIX #147] 미디어 초기화
  clearAllSceneImages: () => void;
  clearAllSceneVideos: () => void;
  clearAllSceneMedia: () => void;

  /** KIE task ID로 소실된 영상 복구 — 브라우저 콘솔에서 호출 가능 */
  recoverVideosByTaskIds: (taskIds: string[]) => Promise<{ recovered: number; failed: number }>;
}

// Scene fields that may contain base64 image data and should be migrated
const BASE64_FIELDS = [
  'imageUrl',
  'previousSceneImageUrl',
  'referenceImage',
  'sourceFrameUrl',
  'startFrameUrl',
  'editedStartFrameUrl',
  'editedEndFrameUrl',
] as const satisfies readonly (keyof Scene)[];

export const useProjectStore = create<ProjectStore>()(immer((set, get) => ({
  config: null,
  scenes: [],
  thumbnails: [],
  projectTitle: '',
  currentProjectId: null,
  batchGrokDuration: '6',
  batchGrokSpeech: false,
  _loadGeneration: 0,
  _restoredImageBlobUrls: [],
  _restoredAudioBlobUrls: [],

  setConfig: (config) => set((state) => {
    const newConfig = typeof config === 'function' ? config(state.config) : config;
    // [DIAGNOSTIC] 주요 설정 변경 추적
    if (state.config && newConfig) {
      const track = (key: string) => {
        const oldVal = (state.config as any)?.[key];
        const newVal = (newConfig as any)?.[key];
        if (oldVal !== undefined && newVal !== undefined && oldVal !== newVal) {
          logger.trackSettingChange(`config.${key}`, oldVal, newVal);
        }
      };
      track('videoFormat'); track('aspectRatio'); track('imageModel');
      track('smartSplit'); track('allowInfographics');
    }
    return { config: newConfig };
  }),

  setScenes: (scenes) => set((state) => {
    const rawScenes = typeof scenes === 'function' ? scenes(state.scenes) : scenes;
    const newScenes = rawScenes.map(normalizeSceneVisualPrompt);
    // 장면 수가 변경된 경우에만 로깅 (매 렌더 노이즈 방지)
    if (newScenes.length !== state.scenes.length) {
      logger.info('장면 업데이트', { count: newScenes.length, prev: state.scenes.length });
    }
    return { scenes: newScenes };
  }),

  setThumbnails: (thumbnails) => set((state) => ({
    thumbnails: typeof thumbnails === 'function' ? thumbnails(state.thumbnails) : thumbnails,
  })),

  setProjectTitle: (title) => set({ projectTitle: title }),
  setCurrentProjectId: (id) => {
    set({ currentProjectId: id });
    if (id) {
      safeLocalStorageSetItem('last-project-id', id);
      return;
    }
    safeLocalStorageRemoveItem('last-project-id');
  },

  setBatchGrokDuration: (d) => set((state) => ({
    batchGrokDuration: typeof d === 'function' ? d(state.batchGrokDuration) : d,
  })),

  setBatchGrokSpeech: (speech) => set({ batchGrokSpeech: speech }),

  updateScene: (id, partial) => set((state) => ({
    scenes: state.scenes.map((s) => (s.id === id ? applySceneUpdate(s, partial) : s)),
  })),

  splitScene: (index) => set((state) => {
    const source = state.scenes[index];
    if (!source) return state;

    // 문장 단위로 분할하여 앞/뒤 장면에 배분
    // Split narration by sentences and distribute between the two scenes
    const text = getSceneNarrationText(source);
    const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?\s*/g) || [text];
    const midpoint = Math.ceil(sentences.length / 2);
    const firstHalf = sentences.slice(0, midpoint).join('').trim();
    const secondHalf = sentences.slice(midpoint).join('').trim();
    const syncAudioScript = !toTrimmedString(source.scriptText) && toTrimmedString(source.audioScript).length > 0;

    // 원본 장면의 scriptText를 앞쪽 절반으로 업데이트, visualPrompt 초기화 (새 scriptText 기반 자동 재생성)
    // [FIX codex-review] videoReferences도 초기화 — 분할 후 대본이 달라지므로 타임코드 매칭 무효
    const updatedSource = {
      ...source,
      scriptText: firstHalf,
      audioScript: syncAudioScript ? firstHalf : source.audioScript,
      visualPrompt: buildVisualPromptFallback(firstHalf),
      videoReferences: undefined,
    };

    const newScene: Scene = {
      ...source,
      id: uniqueSceneId(),
      scriptText: secondHalf,
      audioScript: syncAudioScript ? secondHalf : source.audioScript,
      visualPrompt: buildVisualPromptFallback(secondHalf),
      imageUrl: undefined,
      videoUrl: undefined,
      generationTaskId: undefined,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
      generationStatus: undefined,
      videoReferences: undefined, // [FIX codex-review] 분할된 장면은 새 대본 기준 재매칭 필요
    };
    const newScenes = [...state.scenes];
    newScenes[index] = updatedSource;
    newScenes.splice(index + 1, 0, newScene);
    return { scenes: newScenes };
  }),

  mergeScene: (index) => set((state) => {
    const current = state.scenes[index];
    const next = state.scenes[index + 1];
    if (!current || !next) return state;

    // 나레이션 합치기 (Combine narration text)
    const mergedScript = [getSceneNarrationText(current), getSceneNarrationText(next)]
      .filter(Boolean)
      .join(' ')
      .trim();
    const syncAudioScript = !toTrimmedString(current.scriptText)
      && !toTrimmedString(next.scriptText)
      && [current.audioScript, next.audioScript].some((value) => toTrimmedString(value).length > 0);

    // 비주얼 프롬프트 합치기 (Combine visual prompts)
    const mergedPrompt = [current.visualPrompt, next.visualPrompt]
      .filter(Boolean)
      .join('; ')
      .trim();

    // 이미지: 현재 장면 우선, 없으면 다음 장면 사용
    const mergedImageUrl = current.imageUrl || next.imageUrl;

    const mergedScene: Scene = normalizeSceneVisualPrompt({
      ...current,
      scriptText: mergedScript,
      audioScript: syncAudioScript ? mergedScript : (current.audioScript || next.audioScript),
      visualPrompt: mergedPrompt,
      imageUrl: mergedImageUrl,
      // 비디오는 이미지가 바뀔 수 있으므로 초기화
      videoUrl: current.videoUrl || next.videoUrl,
      // [FIX codex-review] 병합 후 대본이 달라지므로 레퍼런스 타임코드 매칭 무효
      videoReferences: undefined,
    });

    const newScenes = [...state.scenes];
    newScenes[index] = mergedScene;
    newScenes.splice(index + 1, 1);
    return { scenes: newScenes };
  }),

  addSceneAfter: (index) => set((state) => {
    const source = state.scenes[index];
    if (!source) return state;
    const newScene: Scene = {
      ...source,
      id: uniqueSceneId(),
      scriptText: '새 장면',
      visualPrompt: buildVisualPromptFallback('new scene'),
      imageUrl: undefined,
      videoUrl: undefined,
      generationTaskId: undefined,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
      generationStatus: undefined,
      videoReferences: undefined, // [FIX codex-review] 새 장면은 원본 refs 복제하지 않음
    };
    const newScenes = [...state.scenes];
    newScenes.splice(index + 1, 0, newScene);
    return { scenes: newScenes };
  }),

  removeScene: (index) => set((state) => {
    const newScenes = [...state.scenes];
    newScenes.splice(index, 1);
    return { scenes: newScenes };
  }),

  // [FIX #147] 미디어 일괄 초기화
  clearAllSceneImages: () => set((state) => ({
    scenes: state.scenes.map((s) => ({
      ...s, imageUrl: undefined, isGeneratingImage: false, generationStatus: undefined, isPromptFiltered: false,
    })),
  })),
  clearAllSceneVideos: () => set((state) => ({
    scenes: state.scenes.map((s) => ({
      ...s, videoUrl: undefined, isGeneratingVideo: false, generationTaskId: undefined,
    })),
  })),
  clearAllSceneMedia: () => set((state) => ({
    scenes: state.scenes.map((s) => ({
      ...s,
      imageUrl: undefined, videoUrl: undefined,
      isGeneratingImage: false, isGeneratingVideo: false,
      generationStatus: undefined, generationTaskId: undefined,
      isPromptFiltered: false,
    })),
  })),

  recoverVideosByTaskIds: async (taskIds) => {
    const { getKieKey, monitoredFetch } = await import('../services/apiService');
    const apiKey = getKieKey();
    if (!apiKey) { console.error('[복구] KIE API Key가 없습니다.'); return { recovered: 0, failed: 0 }; }

    let recovered = 0;
    let failed = 0;

    for (const taskId of taskIds) {
      try {
        const res = await monitoredFetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        const data = await res.json();

        // [DEBUG] 처음 3개 task의 전체 응답 구조 로깅
        if (recovered + failed < 3) {
          console.log(`[복구 DEBUG] taskId=${taskId} 전체 응답:`, JSON.stringify(data).substring(0, 1500));
        }

        // KIE Grok 영상 task는 data 구조가 다를 수 있음 — 여러 경로 탐색
        const taskData = data.data || data;
        const status = (taskData?.status || taskData?.state || '').toLowerCase();
        const isSuccess = status === 'success' || status === 'completed' || status === 'done'
          || taskData?.successFlag === 1 || taskData?.success === true
          || (taskData?.resultJson && typeof taskData.resultJson !== 'undefined')
          || (taskData?.response?.resultUrls?.length > 0);
        if (!taskData || !isSuccess) {
          if (recovered + failed < 5) console.warn(`[복구] ⏭️ ${taskId} — keys: ${Object.keys(taskData || {}).join(',')}, status: ${status}`);
          failed++; continue;
        }

        // video URL 추출: resultJson 또는 response.resultUrls
        let videoUrl: string | undefined;
        let result = taskData.resultJson;
        if (typeof result === 'string') { try { result = JSON.parse(result); } catch { /* noop */ } }
        videoUrl = result?.resultUrls?.[0];
        // Veo/Grok 폴백: response 필드
        if (!videoUrl) videoUrl = taskData.response?.resultUrls?.[0];
        if (!videoUrl) videoUrl = taskData.response?.video_url;
        if (!videoUrl) {
          console.warn(`[복구] ⏭️ ${taskId} — video URL 없음. resultJson:`, taskData.resultJson, 'response:', taskData.response);
          failed++; continue;
        }

        // input에서 원본 이미지 URL 추출 — KIE Grok은 param.input 이중 JSON 중첩
        let sourceImageUrl: string | undefined;
        try {
          let paramData = taskData.param;
          if (typeof paramData === 'string') paramData = JSON.parse(paramData);
          let inputData = paramData?.input;
          if (typeof inputData === 'string') inputData = JSON.parse(inputData);
          sourceImageUrl = inputData?.image_urls?.[0];
        } catch { /* noop */ }
        // 폴백: taskData.input 직접 접근
        if (!sourceImageUrl) {
          try {
            let inputData = taskData.input;
            if (typeof inputData === 'string') inputData = JSON.parse(inputData);
            sourceImageUrl = inputData?.image_urls?.[0];
          } catch { /* noop */ }
        }

        const scenes = get().scenes;
        // 1순위: 이미지 URL 정확 매칭 (videoUrl 유무 무관 — 덮어쓰기 허용)
        let matchedScene = scenes.find(s => s.imageUrl && sourceImageUrl && s.imageUrl === sourceImageUrl);
        // 2순위: Cloudinary/Evolink URL 부분 매칭 (경로 끝부분)
        if (!matchedScene && sourceImageUrl) {
          const urlSuffix = sourceImageUrl.split('/').pop();
          if (urlSuffix) matchedScene = scenes.find(s => s.imageUrl?.includes(urlSuffix));
        }
        // 3순위: generationTaskId 매칭
        if (!matchedScene) matchedScene = scenes.find(s => s.generationTaskId === taskId);

        if (matchedScene) {
          set((state) => ({
            scenes: state.scenes.map(s => s.id === matchedScene!.id ? {
              ...s, videoUrl, generationTaskId: taskId, isGeneratingVideo: false,
              imageUpdatedAfterVideo: false, progress: 100,
            } : s),
          }));
          recovered++;
          console.log(`[복구] ✅ ${taskId} → scene ${matchedScene.id} (${videoUrl.substring(0, 60)}...)`);
        } else {
          failed++;
          console.warn(`[복구] ⚠️ ${taskId} — 매칭 가능한 장면 없음 (모든 장면에 이미 영상 있음?)`);
        }
      } catch (e) {
        failed++;
        console.error(`[복구] ❌ ${taskId}:`, e);
      }
    }

    console.log(`[복구 완료] ✅ ${recovered}개 복구, ❌ ${failed}개 실패`);
    return { recovered, failed };
  },

  loadProject: (project, options) => {
    const scenes = project.scenes || [];
    // [FIX #176] 프로젝트 로드 시 중단된 생성 상태 초기화 — 이전 세션의 stuck 스피너 방지
    const sanitizedScenes = (project.config?.allowInfographics === true
      ? scenes
      : scenes.map((s) => ({ ...s, isInfographic: false }))
    ).map((s) => ({
      ...s,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isUpscaling: false,
      generationStatus: undefined,
      generationCancelled: false,
    })).map(normalizeSceneVisualPrompt);

    logger.info('프로젝트 로드', { projectId: project.id, title: project.title, sceneCount: sanitizedScenes.length });

    // [FIX #315] 자동 복원 시 분석/편집 스토어는 보존
    // 다만 대본작성 본문은 프로젝트 저장본이 진실값이므로 항상 해당 프로젝트 상태로 다시 맞춘다.
    // 수동 프로젝트 전환 시에는 reset도 함께 수행 (skipCostRestore=false).
    if (!options?.skipCostRestore) {
      try { useEditRoomStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetEditRoom', e); }
      try { useSoundStudioStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetSoundStudio', e); }
      try { useScriptWriterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetScriptWriter', e); }
      try { useChannelAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetChannelAnalysis', e); }
      try { useVideoAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetVideoAnalysis', e); }
      try { useEditPointStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetEditPoint', e); }
      try { useEditorStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetEditor', e); }
      try { useShoppingShortStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetShoppingShort', e); }
      try { useUploadStore.getState().resetUpload(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetUpload', e); }
      try { usePptMasterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/resetPptMaster', e); }
    }

    // [FIX #399] 저장된 자막 데이터 복원 — reset 후, initFromProject 전에 주입
    if (project.sceneSubtitles && Object.keys(project.sceneSubtitles).length > 0) {
      try { getEditRoomStore()?.setState({ sceneSubtitles: project.sceneSubtitles }); }
      catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/restoreSubtitles', e); }
    }

    const previousRestoredImageBlobUrls = get()._restoredImageBlobUrls;
    const previousRestoredAudioBlobUrls = get()._restoredAudioBlobUrls;

    // Increment generation to invalidate any in-flight async migrations from previous loads
    const generation = get()._loadGeneration + 1;

    set({
      config: project.config,
      scenes: sanitizedScenes,
      thumbnails: project.thumbnails || [],
      currentProjectId: project.id,
      projectTitle: project.title,
      _loadGeneration: generation,
      _restoredImageBlobUrls: [],
      _restoredAudioBlobUrls: [],
    });
    revokeBlobUrls(previousRestoredImageBlobUrls);
    revokeBlobUrls(previousRestoredAudioBlobUrls);
    // [FIX] localStorage에 마지막 프로젝트 ID 저장 → 새 탭/새로고침 시 복원용
    if (project.id) {
      safeLocalStorageSetItem('last-project-id', project.id);
    }
    // [FIX #776/#775/#826] 비용 복원 로직
    // skipCostRestore=true (자동 복원): costStore를 아예 건드리지 않음 → persist에서 복원된 값 유지
    // skipCostRestore=false (수동 전환): 프로젝트의 costStats로 교체, 없으면 리셋
    if (!options?.skipCostRestore) {
      if (project.costStats) {
        useCostStore.getState().restoreCostStats(project.costStats);
      } else {
        useCostStore.getState().resetCosts();
      }
    }
    // skipCostRestore=true: costStore 완전 보존 — persist 미들웨어가 복원한 값 유지

    try {
      restoreScriptWriterDraft(buildScriptWriterRestoreState(project));
    } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/restoreScriptWriter', e); }

    // [NEW] imageVideoStore 복원 — 캐릭터/스타일/웹검색 설정을 config에서 복원
    // [FIX #290] targetSceneCount + dialogueTone 등 누락 필드 추가 — 이전 프로젝트 값 잔류 방지
    import('./imageVideoStore').then(({ useImageVideoStore }) => {
      useImageVideoStore.getState().restoreFromConfig({
        style: project.config?.selectedVisualStyle,
        characters: project.config?.characters,
        enableWebSearch: project.config?.enableWebSearch,
        isMultiCharacter: project.config?.isMultiCharacter,
        dialogueTone: project.config?.dialogueTone,
        referenceDialogue: project.config?.referenceDialogue,
        dialogueMode: project.config?.dialogueMode,
        customStyleNote: project.config?.customStyleNote,
        targetSceneCount: project.config?.targetSceneCount ?? null, // [FIX #382] 저장된 목표 컷수 복원
        styleReferenceImages: project.config?.styleReferenceImages, // [#391] 글로벌 스타일 레퍼런스 복원
        enableGoogleReference: project.config?.enableGoogleReference, // [NEW] 구글 레퍼런스 모드 복원
        enableVideoReference: project.config?.enableVideoReference, // [NEW] 자료영상 레퍼런스 모드 복원
        videoRefShortsMode: project.config?.videoRefShortsMode, // [NEW] 쇼츠 모드 복원
      });
    }).catch(e => { logger.trackSwallowedError('ProjectStore:loadProject/restoreImageVideoStore', e); });

    // [FIX #1060 #1061 #1062 #1065] 이미지 blob URL 복원
    // blob: URL은 세션 종속이므로, IDB에 영속화된 Blob → 새 blob URL로 교체
    import('../services/imageBlobStorageService').then(async ({
      SCENE_IMAGE_FIELDS,
      mergeRestoredSceneImageFields,
      mergeRestoredThumbnailImage,
      restoreProjectImages,
    }) => {
      if (get()._loadGeneration !== generation) return;

      const restored = await restoreProjectImages(project.id);
      const allRestoredImageUrls = collectRestoredImageBlobUrls(
        restored.sceneImageMap,
        restored.thumbnailMap,
      );
      if (get()._loadGeneration !== generation) {
        revokeBlobUrls(allRestoredImageUrls);
        return;
      }

      const currentScenes = get().scenes;
      const currentThumbnails = get().thumbnails;
      const appliedImageUrls: string[] = [];
      const nextScenes = currentScenes.map((scene) => {
        const restoredFields = restored.sceneImageMap.get(scene.id);
        if (restoredFields) {
          SCENE_IMAGE_FIELDS.forEach((field) => {
            const currentValue = scene[field];
            const restoredUrl = restoredFields.get(field);
            if (
              typeof currentValue === 'string'
              && currentValue.startsWith('blob:')
              && restoredUrl
              && restoredUrl !== currentValue
            ) {
              appliedImageUrls.push(restoredUrl);
            }
          });
        }

        return mergeRestoredSceneImageFields(scene, restoredFields);
      });
      const nextThumbnails = currentThumbnails.map((thumb) => {
        const restoredUrl = restored.thumbnailMap.get(thumb.id);
        if (
          thumb.imageUrl?.startsWith('blob:')
          && restoredUrl
          && restoredUrl !== thumb.imageUrl
        ) {
          appliedImageUrls.push(restoredUrl);
        }

        return mergeRestoredThumbnailImage(thumb, restoredUrl);
      });
      const trackedImageUrls = buildUniqueBlobUrlList(appliedImageUrls);
      const trackedImageUrlSet = new Set(trackedImageUrls);
      const unusedImageUrls = allRestoredImageUrls.filter((url) => !trackedImageUrlSet.has(url));

      revokeBlobUrls(unusedImageUrls);
      trackBlobUrls(trackedImageUrls, 'image', 'projectStore:loadProject/restoreProjectImages');

      set({
        scenes: nextScenes,
        thumbnails: nextThumbnails,
        _restoredImageBlobUrls: trackedImageUrls,
      });
    }).catch((e) => { logger.trackSwallowedError('ProjectStore:loadProject/imageImport', e); });

    // [FIX] 나레이션 복원 — IndexedDB에서 오디오 Blob 복원 후 ScriptLine[] 재생성
    // blob: URL은 세션 종속이므로, IDB에 영속화된 Blob → 새 blob URL로 교체
    try {
      import('../services/audioStorageService').then(async ({ restoreProjectAudio }) => {
        // Guard: 이미 다른 프로젝트가 로드되었으면 중단
        if (get()._loadGeneration !== generation) return;

        const restored = await restoreProjectAudio(project.id);
        const allRestoredAudioUrls = collectRestoredAudioBlobUrls(
          restored.sceneAudioMap,
          restored.mergedUrl,
        );
        if (get()._loadGeneration !== generation) {
          revokeBlobUrls(allRestoredAudioUrls);
          return;
        }

        // scenes의 blob: audioUrl을 복원된 URL로 교체 (또는 복원 실패 시 undefined)
        const currentScenes = get().scenes;
        const appliedAudioUrls: string[] = [];
        const updatedScenes = currentScenes.map((s) => {
          if (s.audioUrl?.startsWith('blob:')) {
            const restoredUrl = restored.sceneAudioMap.get(s.id);
            if (restoredUrl && restoredUrl !== s.audioUrl) {
              appliedAudioUrls.push(restoredUrl);
            }
            return { ...s, audioUrl: restoredUrl };
          }
          return s;
        });

        // mergedAudioUrl 복원
        const currentConfig = get().config;
        if (restored.mergedUrl) {
          if (currentConfig) {
            appliedAudioUrls.push(restored.mergedUrl);
            // [FIX #395] soundStudioStore에도 동기화 — Sound Studio에서 병합 오디오 표시
            try { useSoundStudioStore.getState().setMergedAudio(restored.mergedUrl); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/syncMergedAudio', e); }
            if (isUploadedTranscriptConfig(currentConfig)) {
              useSoundStudioStore.setState({
                uploadedAudios: [{
                  id: currentConfig.uploadedAudioId || 'uploaded-restored',
                  fileName: 'uploaded-audio',
                  audioUrl: restored.mergedUrl,
                  duration: currentConfig.sourceNarrationDurationSec || currentConfig.transcriptDurationSec || 0,
                  fileSize: 0,
                  mimeType: 'audio/*',
                  uploadedAt: Date.now(),
                }],
              });
            } else {
              useSoundStudioStore.setState({ uploadedAudios: [] });
            }
          }
        } else if (get().config?.mergedAudioUrl?.startsWith('blob:')) {
          // IDB에 없는 stale blob URL 제거
          if (currentConfig) {
            set({ config: { ...currentConfig, mergedAudioUrl: undefined } });
          }
          useSoundStudioStore.setState({ uploadedAudios: [] });
        }

        const trackedAudioUrls = buildUniqueBlobUrlList(appliedAudioUrls);
        const trackedAudioUrlSet = new Set(trackedAudioUrls);
        const unusedAudioUrls = allRestoredAudioUrls.filter((url) => !trackedAudioUrlSet.has(url));

        revokeBlobUrls(unusedAudioUrls);
        trackBlobUrls(trackedAudioUrls, 'audio', 'projectStore:loadProject/restoreProjectAudio');
        set({
          scenes: updatedScenes,
          ...(restored.mergedUrl && currentConfig
            ? { config: { ...currentConfig, mergedAudioUrl: restored.mergedUrl } }
            : {}),
          _restoredAudioBlobUrls: trackedAudioUrls,
        });

        // soundStudioStore lines 재생성 (복원된 URL 사용)
        try {
          const effectiveConfig = restored.mergedUrl && currentConfig
            ? { ...currentConfig, mergedAudioUrl: restored.mergedUrl }
            : get().config;
          const finalScenes = updatedScenes;
          const restoredLines = buildUploadedTranscriptLines(effectiveConfig)
            || finalScenes
              .filter((s) => getSceneNarrationText(s) || s.audioUrl)
              .map((s, i) => ({
                id: `line-${Date.now()}-${i}`,
                speakerId: '',
                text: getSceneNarrationText(s),
                index: i,
                sceneId: s.id,
                audioUrl: s.audioUrl,
                duration: s.audioDuration,
                startTime: s.startTime,
                endTime: s.endTime,
                ttsStatus: (s.audioUrl ? 'done' : 'idle') as 'done' | 'idle',
              }));
          if (restoredLines.length > 0) {
            useSoundStudioStore.getState().setLines(restoredLines);
          }
        } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/restoreLines', e); }
      }).catch((e) => { logger.trackSwallowedError('ProjectStore:loadProject/audioImport', e); });

      // 즉시 동기 처리: non-blob audioUrl로 soundStudioStore lines 초기 세팅
      const immediateLines = buildUploadedTranscriptLines(project.config)
        || sanitizedScenes
          .filter((s) => getSceneNarrationText(s) || s.audioUrl)
          .map((s, i) => {
            const isStaleBlob = s.audioUrl?.startsWith('blob:');
            const validAudioUrl = isStaleBlob ? undefined : s.audioUrl;
            return {
              id: `line-${Date.now()}-${i}`,
              speakerId: '',
              text: getSceneNarrationText(s),
              index: i,
              sceneId: s.id,
              audioUrl: validAudioUrl,
              duration: s.audioDuration,
              startTime: s.startTime,
              endTime: s.endTime,
              ttsStatus: (validAudioUrl ? 'done' : 'idle') as 'done' | 'idle',
            };
          });
      if (immediateLines.length > 0) {
        useSoundStudioStore.getState().setLines(immediateLines);
      }
      // [FIX #395] non-blob mergedAudioUrl도 즉시 soundStudioStore에 동기화
      const immediateMergedUrl = project.config?.mergedAudioUrl;
      if (immediateMergedUrl && !immediateMergedUrl.startsWith('blob:')) {
        useSoundStudioStore.getState().setMergedAudio(immediateMergedUrl);
      }
      if (isUploadedTranscriptConfig(project.config) && immediateMergedUrl) {
        useSoundStudioStore.setState({
          uploadedAudios: [{
            id: project.config.uploadedAudioId || 'uploaded-restored',
            fileName: 'uploaded-audio',
            audioUrl: immediateMergedUrl,
            duration: project.config.sourceNarrationDurationSec || project.config.transcriptDurationSec || 0,
            fileSize: 0,
            mimeType: 'audio/*',
            uploadedAt: Date.now(),
          }],
        });
      } else {
        useSoundStudioStore.setState({ uploadedAudios: [] });
      }
    } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/immediateLines', e); }

    // Background migration: convert ALL base64 scene images to Cloudinary URLs
    sanitizedScenes.forEach((scene) => {
      BASE64_FIELDS.forEach((field) => {
        const value = scene[field] as string | undefined;
        if (isBase64Image(value)) {
          persistImage(value!).then((url) => {
            // Guard: skip update if a newer project has been loaded since
            if (get()._loadGeneration !== generation) return;
            if (url !== value) {
              useProjectStore.getState().updateScene(scene.id, { [field]: url });
            }
          });
        }
      });
    });

    // Background migration: convert base64 thumbnail images to Cloudinary URLs
    const loadedThumbnails = project.thumbnails || [];
    loadedThumbnails.forEach((thumb) => {
      if (isBase64Image(thumb.imageUrl)) {
        persistImage(thumb.imageUrl!).then((url) => {
          // Guard: skip update if a newer project has been loaded since
          if (get()._loadGeneration !== generation) return;
          if (url !== thumb.imageUrl) {
            useProjectStore.getState().setThumbnails((prev) =>
              prev.map((t) => t.id === thumb.id && t.imageUrl === thumb.imageUrl ? { ...t, imageUrl: url } : t)
            );
          }
        });
      }
    });
  },

  clearProjectState: () => {
    const previousRestoredImageBlobUrls = get()._restoredImageBlobUrls;
    const previousRestoredAudioBlobUrls = get()._restoredAudioBlobUrls;
    set((state) => ({
      config: null,
      scenes: [],
      thumbnails: [],
      projectTitle: '',
      currentProjectId: null,
      batchGrokDuration: '6',
      batchGrokSpeech: false,
      _loadGeneration: state._loadGeneration + 1,
      _restoredImageBlobUrls: [],
      _restoredAudioBlobUrls: [],
    }));
    revokeBlobUrls(previousRestoredImageBlobUrls);
    revokeBlobUrls(previousRestoredAudioBlobUrls);
    safeLocalStorageRemoveItem('last-project-id');
  },

  newProject: (title?: string, options?: { preserveAnalysisState?: boolean }) => {
    const preserveAnalysisState = options?.preserveAnalysisState === true;
    // [FIX] 이전 프로젝트 찌꺼기 방지 — 모든 관련 스토어 초기화
    try { useEditRoomStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditRoom', e); }
    try { useSoundStudioStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetSoundStudio', e); }
    try { useScriptWriterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetScriptWriter', e); }
    if (!preserveAnalysisState) {
      try { useChannelAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetChannelAnalysis', e); }
      try { useVideoAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetVideoAnalysis', e); }
    }
    try { useEditPointStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditPoint', e); }
    try { useEditorStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditor', e); }
    try { useShoppingShortStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetShoppingShort', e); }
    try { useUploadStore.getState().resetUpload(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetUpload', e); }
    try { usePptMasterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetPptMaster', e); }
    const previousRestoredImageBlobUrls = get()._restoredImageBlobUrls;
    const previousRestoredAudioBlobUrls = get()._restoredAudioBlobUrls;

    // 고유 프로젝트 ID 즉시 생성 (auto-save가 작동하려면 필수)
    const projectId = `proj_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 임시 제목 자동 생성: "임시 프로젝트 03/07 14:30"
    const now = new Date();
    const autoTitle = title || `임시 프로젝트 ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    logger.info('프로젝트 생성', { projectId, title: autoTitle });

    set((state) => ({
      config: {
        mode: 'SCRIPT',
        script: '',
        videoFormat: VideoFormat.SHORT,
        aspectRatio: AspectRatio.PORTRAIT,
        imageModel: ImageModel.NANO_COST,
        smartSplit: true,
      } as ProjectConfig,
      scenes: [],
      thumbnails: [],
      currentProjectId: projectId,
      projectTitle: autoTitle,
      batchGrokDuration: '6',
      batchGrokSpeech: false,
      _loadGeneration: state._loadGeneration + 1,
      _restoredImageBlobUrls: [],
      _restoredAudioBlobUrls: [],
    }));
    revokeBlobUrls(previousRestoredImageBlobUrls);
    revokeBlobUrls(previousRestoredAudioBlobUrls);
    // 마지막 프로젝트 ID를 localStorage에 저장 (복구용)
    safeLocalStorageSetItem('last-project-id', projectId);
    useCostStore.getState().resetCosts();

    // [FIX] 새 프로젝트 즉시 저장 — 새로고침 시 프로젝트 유실 방지
    // (이전: title 있을 때만 저장 → 자동 생성된 프로젝트가 새로고침 시 사라짐)
    import('../services/storageService').then(({ saveProject }) => {
      saveProject({
        id: projectId,
        title: autoTitle,
        config: { mode: 'SCRIPT', script: '', videoFormat: VideoFormat.SHORT, aspectRatio: AspectRatio.PORTRAIT, imageModel: ImageModel.NANO_COST, smartSplit: true } as ProjectConfig,
        scenes: [],
        thumbnails: [],
        scriptWriterState: getScriptWriterDraftSnapshot(),
        fullNarrationText: '',
        lastModified: Date.now(),
        costStats: useCostStore.getState().costStats,
      }).catch((e) => { logger.trackSwallowedError('ProjectStore:newProject/saveProject', e); });
    }).catch((e) => { logger.trackSwallowedError('ProjectStore:newProject/saveImport', e); });

    // [NEW] imageVideoStore 리셋 — 이전 프로젝트의 캐릭터/스타일이 남지 않도록
    import('./imageVideoStore').then(({ useImageVideoStore }) => {
      useImageVideoStore.getState().resetStore();
    }).catch(e => { logger.trackSwallowedError('ProjectStore:newProject/resetImageVideoStore', e); });
  },

  // [v4.5] 활동 기반 스마트 제목 — 첫 번째 의미 있는 작업 시 자동 업데이트
  smartUpdateTitle: (tab, hint) => {
    const { config, projectTitle } = get();
    if (!config) return;
    // 수동 제목 또는 이미 스마트 제목이 적용된 경우 스킵
    if (config.isManuallyNamed) return;
    if (!projectTitle.startsWith('임시 프로젝트') && !projectTitle.startsWith('새 프로젝트')) return;

    const TAB_LABELS: Record<string, string> = {
      'channel-analysis': '채널분석',
      'script-writer': '대본',
      'sound-studio': '나레이션',
      'image-video': '영상제작',
      'edit-room': '편집',
      'subtitle-remover': '자막제거',
      'detail-page': '쇼핑숏폼',
      'thumbnail-studio': '썸네일',
    };
    const label = TAB_LABELS[tab] || tab;
    const cleanHint = hint.replace(/\n/g, ' ').trim();
    const truncated = cleanHint.length > 20 ? cleanHint.slice(0, 20) + '…' : cleanHint;
    const newTitle = truncated ? `${label} — ${truncated}` : `${label} 프로젝트`;
    set({ projectTitle: newTitle });
  },

  // [v4.5] 파이프라인 진행도 마킹
  markPipelineStep: (step) => {
    set(state => {
      if (!state.config) return state;
      const current = state.config.pipelineSteps || {};
      if (current[step]) return state; // 이미 완료된 단계
      return {
        config: {
          ...state.config,
          pipelineSteps: { ...current, [step]: true },
        },
      };
    });
  },

  // [v4.5] 마지막 활동 탭 추적
  setLastActiveTab: (tab) => {
    logger.trackTabVisit('project-last-tab', tab);
    set(state => {
      if (!state.config) return state;
      return {
        config: { ...state.config, lastActiveTab: tab },
      };
    });
  },
})));

// [E2E] 테스트에서 store 접근용 — 프로덕션 빌드 시 트리쉐이킹으로 제거됨
if (typeof window !== 'undefined') {
  (window as any).__PROJECT_STORE__ = useProjectStore;
}
