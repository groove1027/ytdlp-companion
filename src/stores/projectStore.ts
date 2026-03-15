import { create } from 'zustand';
import { ProjectConfig, Scene, Thumbnail, ProjectData, VideoFormat, AspectRatio, ImageModel, PipelineSteps } from '../types';
import { useCostStore } from './costStore';
import { useSoundStudioStore } from './soundStudioStore';
import { useScriptWriterStore } from './scriptWriterStore';
import { useChannelAnalysisStore } from './channelAnalysisStore';
import { useVideoAnalysisStore } from './videoAnalysisStore';
import { useEditPointStore } from './editPointStore';
import { useEditorStore } from './editorStore';
import { useShoppingShortStore } from './shoppingShortStore';
import { useUploadStore } from './uploadStore';
import { persistImage, isBase64Image } from '../services/imageStorageService';
import { logger } from '../services/LoggerService';
import { usePptMasterStore } from './pptMasterStore';

// editRoomStore → projectStore 순환 참조 방지: lazy import 사용
let _editRoomStoreRef: any = null;
import('./editRoomStore').then(m => { _editRoomStoreRef = m.useEditRoomStore; }).catch(() => {});
const getEditRoomStore = () => _editRoomStoreRef;
const useEditRoomStore = { getState: () => getEditRoomStore()?.getState() || { reset: () => {} } };

// Monotonic counter to guarantee unique scene IDs even within the same millisecond
let _idCounter = 0;
const uniqueSceneId = () => `s-${Date.now()}-${++_idCounter}`;

/**
 * 프로젝트가 없을 때: 기존 프로젝트 복원 → 없으면 새로 생성.
 * 비동기로 동작하며, 복원/생성 성공 시 true 반환.
 * 빈 임시 프로젝트를 무한 생성하지 않도록 반드시 기존 프로젝트를 먼저 시도.
 */
export const autoRestoreOrCreateProject = async (): Promise<boolean> => {
  const { config } = useProjectStore.getState();
  if (config) return false; // 이미 로드된 프로젝트 있음

  try {
    const { getProject, getMostRecentProjectId } = await import('../services/storageService');

    // 1) localStorage의 마지막 프로젝트 복원 시도 (자동 복원 → 비용 리셋)
    const lastId = localStorage.getItem('last-project-id');
    if (lastId) {
      const project = await getProject(lastId);
      if (project) {
        useProjectStore.getState().loadProject(project, { skipCostRestore: true });
        return true;
      }
      localStorage.removeItem('last-project-id');
    }

    // 2) IndexedDB에서 가장 최근 프로젝트 복원 (자동 복원 → 비용 리셋)
    const recentId = await getMostRecentProjectId();
    if (recentId) {
      const project = await getProject(recentId);
      if (project) {
        useProjectStore.getState().loadProject(project, { skipCostRestore: true });
        return true;
      }
    }

    // 3) 프로젝트가 아예 없을 때만 새로 생성
    useProjectStore.getState().newProject();
    return true;
  } catch (e) {
    console.warn('[autoRestoreOrCreateProject] failed, creating new:', e);
    useProjectStore.getState().newProject();
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
  batchGrokDuration: '6' | '10' | '15';
  batchGrokSpeech: boolean;
  _loadGeneration: number; // increments on each loadProject to prevent stale async updates

  // Setters (React setState signature compatible for useVideoBatch bridge)
  setConfig: (config: ProjectConfig | null | ((prev: ProjectConfig | null) => ProjectConfig | null)) => void;
  setScenes: (scenes: Scene[] | ((prev: Scene[]) => Scene[])) => void;
  setThumbnails: (thumbnails: Thumbnail[] | ((prev: Thumbnail[]) => Thumbnail[])) => void;
  setProjectTitle: (title: string) => void;
  setCurrentProjectId: (id: string | null) => void;
  setBatchGrokDuration: (d: '6' | '10' | '15' | ((prev: '6' | '10' | '15') => '6' | '10' | '15')) => void;
  setBatchGrokSpeech: (speech: boolean) => void;

  // Scene mutation helpers
  updateScene: (id: string, partial: Partial<Scene>) => void;
  splitScene: (index: number) => void;
  mergeScene: (index: number) => void;
  addSceneAfter: (index: number) => void;
  removeScene: (index: number) => void;

  // Project lifecycle
  loadProject: (project: ProjectData, options?: { skipCostRestore?: boolean }) => void;
  newProject: (title?: string) => void;

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
const BASE64_FIELDS: (keyof Scene)[] = [
  'imageUrl',
  'referenceImage',
  'sourceFrameUrl',
  'startFrameUrl',
  'editedStartFrameUrl',
  'editedEndFrameUrl',
];

export const useProjectStore = create<ProjectStore>((set, get) => ({
  config: null,
  scenes: [],
  thumbnails: [],
  projectTitle: '',
  currentProjectId: null,
  batchGrokDuration: '6',
  batchGrokSpeech: false,
  _loadGeneration: 0,

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
    const newScenes = typeof scenes === 'function' ? scenes(state.scenes) : scenes;
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
    // [FIX] localStorage에 마지막 프로젝트 ID 저장 → 새 탭/새로고침 시 복원용
    try {
      if (id) localStorage.setItem('last-project-id', id);
      else localStorage.removeItem('last-project-id');
    } catch (e) { logger.trackSwallowedError('ProjectStore:setCurrentProjectId', e); }
  },

  setBatchGrokDuration: (d) => set((state) => ({
    batchGrokDuration: typeof d === 'function' ? d(state.batchGrokDuration) : d,
  })),

  setBatchGrokSpeech: (speech) => set({ batchGrokSpeech: speech }),

  updateScene: (id, partial) => set((state) => ({
    scenes: state.scenes.map((s) => (s.id === id ? { ...s, ...partial } : s)),
  })),

  splitScene: (index) => set((state) => {
    const source = state.scenes[index];
    if (!source) return state;

    // 문장 단위로 분할하여 앞/뒤 장면에 배분
    // Split narration by sentences and distribute between the two scenes
    const text = (source.scriptText || '').trim();
    const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?\s*/g) || [text];
    const midpoint = Math.ceil(sentences.length / 2);
    const firstHalf = sentences.slice(0, midpoint).join('').trim();
    const secondHalf = sentences.slice(midpoint).join('').trim();

    // 원본 장면의 scriptText를 앞쪽 절반으로 업데이트, visualPrompt 초기화 (새 scriptText 기반 자동 재생성)
    const updatedSource = { ...source, scriptText: firstHalf, visualPrompt: '' };

    const newScene: Scene = {
      ...source,
      id: uniqueSceneId(),
      scriptText: secondHalf,
      visualPrompt: '', // 새 scriptText에 맞게 자동 재생성되도록 초기화
      imageUrl: undefined,
      videoUrl: undefined,
      generationTaskId: undefined,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
      generationStatus: undefined,
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
    const mergedScript = [current.scriptText, next.scriptText]
      .filter(Boolean)
      .join(' ')
      .trim();

    // 비주얼 프롬프트 합치기 (Combine visual prompts)
    const mergedPrompt = [current.visualPrompt, next.visualPrompt]
      .filter(Boolean)
      .join('; ')
      .trim();

    // 이미지: 현재 장면 우선, 없으면 다음 장면 사용
    const mergedImageUrl = current.imageUrl || next.imageUrl;

    const mergedScene: Scene = {
      ...current,
      scriptText: mergedScript,
      visualPrompt: mergedPrompt,
      imageUrl: mergedImageUrl,
      // 비디오는 이미지가 바뀔 수 있으므로 초기화
      videoUrl: current.videoUrl || next.videoUrl,
    };

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
      visualPrompt: '',
      imageUrl: undefined,
      videoUrl: undefined,
      generationTaskId: undefined,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
      generationStatus: undefined,
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
      ...s, videoUrl: undefined, isGeneratingVideo: false, generationTaskId: undefined, videoPrompt: undefined,
    })),
  })),
  clearAllSceneMedia: () => set((state) => ({
    scenes: state.scenes.map((s) => ({
      ...s,
      imageUrl: undefined, videoUrl: undefined,
      isGeneratingImage: false, isGeneratingVideo: false,
      generationStatus: undefined, generationTaskId: undefined,
      videoPrompt: undefined, isPromptFiltered: false,
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
        // 1순위: 이미지 URL 정확 매칭
        let matchedScene = scenes.find(s => !s.videoUrl && s.imageUrl && sourceImageUrl && s.imageUrl === sourceImageUrl);
        // 2순위: Cloudinary/Evolink URL 부분 매칭 (경로 끝부분)
        if (!matchedScene && sourceImageUrl) {
          const urlSuffix = sourceImageUrl.split('/').pop();
          if (urlSuffix) matchedScene = scenes.find(s => !s.videoUrl && s.imageUrl?.includes(urlSuffix));
        }
        // 3순위: generationTaskId 매칭
        if (!matchedScene) matchedScene = scenes.find(s => !s.videoUrl && s.generationTaskId === taskId);
        // 순서 매칭 제거 — 잘못된 씬에 배치되는 것 방지

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
    }));

    logger.info('프로젝트 로드', { projectId: project.id, title: project.title, sceneCount: sanitizedScenes.length });

    // [FIX] 이전 프로젝트의 찌꺼기 방지 — 먼저 관련 스토어 초기화
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

    // Increment generation to invalidate any in-flight async migrations from previous loads
    const generation = get()._loadGeneration + 1;

    set({
      config: project.config,
      scenes: sanitizedScenes,
      thumbnails: project.thumbnails || [],
      currentProjectId: project.id,
      projectTitle: project.title,
      _loadGeneration: generation,
    });
    // [FIX] localStorage에 마지막 프로젝트 ID 저장 → 새 탭/새로고침 시 복원용
    try { if (project.id) localStorage.setItem('last-project-id', project.id); } catch (e) { logger.trackSwallowedError('ProjectStore:loadProject/setLastId', e); }
    // 새로고침 자동 복원 시에는 비용 리셋, 수동 프로젝트 불러오기 시에만 비용 복원
    if (options?.skipCostRestore) {
      useCostStore.getState().resetCosts();
    } else if (project.costStats) {
      useCostStore.getState().setCostStats(project.costStats);
    } else {
      useCostStore.getState().resetCosts();
    }

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
        targetSceneCount: null, // 프로젝트 로드 시 항상 초기화 — AI가 적절한 수를 결정
      });
    }).catch(e => { logger.trackSwallowedError('ProjectStore:loadProject/restoreImageVideoStore', e); });

    // [FIX] 나레이션 복원 — IndexedDB에서 오디오 Blob 복원 후 ScriptLine[] 재생성
    // blob: URL은 세션 종속이므로, IDB에 영속화된 Blob → 새 blob URL로 교체
    try {
      import('../services/audioStorageService').then(async ({ restoreProjectAudio }) => {
        // Guard: 이미 다른 프로젝트가 로드되었으면 중단
        if (get()._loadGeneration !== generation) return;

        const restored = await restoreProjectAudio(project.id);
        if (get()._loadGeneration !== generation) return;

        // scenes의 blob: audioUrl을 복원된 URL로 교체 (또는 복원 실패 시 undefined)
        const currentScenes = get().scenes;
        const updatedScenes = currentScenes.map((s) => {
          if (s.audioUrl?.startsWith('blob:')) {
            const restoredUrl = restored.sceneAudioMap.get(s.id);
            return { ...s, audioUrl: restoredUrl };
          }
          return s;
        });
        set({ scenes: updatedScenes });

        // mergedAudioUrl 복원
        if (restored.mergedUrl) {
          const currentConfig = get().config;
          if (currentConfig) {
            set({ config: { ...currentConfig, mergedAudioUrl: restored.mergedUrl } });
          }
        } else if (get().config?.mergedAudioUrl?.startsWith('blob:')) {
          // IDB에 없는 stale blob URL 제거
          const currentConfig = get().config;
          if (currentConfig) {
            set({ config: { ...currentConfig, mergedAudioUrl: undefined } });
          }
        }

        // soundStudioStore lines 재생성 (복원된 URL 사용)
        try {
          const finalScenes = get().scenes;
          const restoredLines = finalScenes
            .filter((s) => s.scriptText || s.audioUrl)
            .map((s, i) => ({
              id: `line-${Date.now()}-${i}`,
              speakerId: '',
              text: s.scriptText || s.audioScript || '',
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
      const immediateLines = sanitizedScenes
        .filter((s) => s.scriptText || s.audioUrl)
        .map((s, i) => {
          const isStaleBlob = s.audioUrl?.startsWith('blob:');
          const validAudioUrl = isStaleBlob ? undefined : s.audioUrl;
          return {
            id: `line-${Date.now()}-${i}`,
            speakerId: '',
            text: s.scriptText || s.audioScript || '',
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

  newProject: (title?: string) => {
    // [FIX] 이전 프로젝트 찌꺼기 방지 — 모든 관련 스토어 초기화
    try { useEditRoomStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditRoom', e); }
    try { useSoundStudioStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetSoundStudio', e); }
    try { useScriptWriterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetScriptWriter', e); }
    try { useChannelAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetChannelAnalysis', e); }
    try { useVideoAnalysisStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetVideoAnalysis', e); }
    try { useEditPointStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditPoint', e); }
    try { useEditorStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetEditor', e); }
    try { useShoppingShortStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetShoppingShort', e); }
    try { useUploadStore.getState().resetUpload(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetUpload', e); }
    try { usePptMasterStore.getState().reset(); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/resetPptMaster', e); }

    // 고유 프로젝트 ID 즉시 생성 (auto-save가 작동하려면 필수)
    const projectId = `proj_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 임시 제목 자동 생성: "임시 프로젝트 03/07 14:30"
    const now = new Date();
    const autoTitle = title || `임시 프로젝트 ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    logger.info('프로젝트 생성', { projectId, title: autoTitle });

    set({
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
    });
    // 마지막 프로젝트 ID를 localStorage에 저장 (복구용)
    try { localStorage.setItem('last-project-id', projectId); } catch (e) { logger.trackSwallowedError('ProjectStore:newProject/setLastId', e); }
    useCostStore.getState().resetCosts();

    // [FIX] 빈 프로젝트 즉시 저장 제거 — useAutoSave가 실제 변경 시에만 저장.
    // 명시적 "새 프로젝트" 생성(사용자 클릭) 시만 즉시 저장하도록 title 존재 여부로 구분.
    if (title) {
      import('../services/storageService').then(({ saveProject }) => {
        saveProject({
          id: projectId,
          title: autoTitle,
          config: { mode: 'SCRIPT', script: '', videoFormat: VideoFormat.SHORT, aspectRatio: AspectRatio.PORTRAIT, imageModel: ImageModel.NANO_COST, smartSplit: true } as ProjectConfig,
          scenes: [],
          thumbnails: [],
          fullNarrationText: '',
          lastModified: Date.now(),
          costStats: useCostStore.getState().costStats,
        }).catch((e) => { logger.trackSwallowedError('ProjectStore:newProject/saveProject', e); });
      }).catch((e) => { logger.trackSwallowedError('ProjectStore:newProject/saveImport', e); });
    }

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
}));
