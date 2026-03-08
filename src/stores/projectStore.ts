import { create } from 'zustand';
import { ProjectConfig, Scene, Thumbnail, ProjectData, VideoFormat, AspectRatio, ImageModel } from '../types';
import { useCostStore } from './costStore';
import { useSoundStudioStore } from './soundStudioStore';
import { persistImage, isBase64Image } from '../services/imageStorageService';

// editRoomStore → projectStore 순환 참조 방지: lazy require 사용
const getEditRoomStore = () => {
  try { return require('./editRoomStore').useEditRoomStore; } catch { return null; }
};
const useEditRoomStore = { getState: () => getEditRoomStore()?.getState() || { reset: () => {} } };

// Monotonic counter to guarantee unique scene IDs even within the same millisecond
let _idCounter = 0;
const uniqueSceneId = () => `s-${Date.now()}-${++_idCounter}`;

// [FIX] 세션 당 자동 프로젝트 생성 1회 제한 — 페이지 새로고침 시 리셋
let _autoProjectCreatedInSession = false;

/**
 * 프로젝트가 없을 때 자동으로 임시 프로젝트를 생성하되, 세션 당 1회만 허용.
 * 명시적 "새 프로젝트" 버튼 클릭과는 무관 — 오직 자동 생성만 제한.
 * @returns true if a new project was created, false if skipped
 */
export const autoNewProjectIfNeeded = (): boolean => {
  const { config } = useProjectStore.getState();
  if (config || _autoProjectCreatedInSession) return false;
  _autoProjectCreatedInSession = true;
  useProjectStore.getState().newProject();
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
  loadProject: (project: ProjectData) => void;
  newProject: (title?: string) => void;
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

  setConfig: (config) => set((state) => ({
    config: typeof config === 'function' ? config(state.config) : config,
  })),

  setScenes: (scenes) => set((state) => ({
    scenes: typeof scenes === 'function' ? scenes(state.scenes) : scenes,
  })),

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
    } catch { /* localStorage 접근 실패 시 무시 */ }
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

  loadProject: (project) => {
    const scenes = project.scenes || [];
    const sanitizedScenes = project.config?.allowInfographics === true
      ? scenes
      : scenes.map((s) => ({ ...s, isInfographic: false }));

    // [FIX] 이전 프로젝트의 찌꺼기 방지 — 먼저 관련 스토어 초기화
    try { useEditRoomStore.getState().reset(); } catch { /* 미초기화 시 무시 */ }
    try {
      useSoundStudioStore.getState().reset();
    } catch { /* 미초기화 시 무시 */ }

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
    try { if (project.id) localStorage.setItem('last-project-id', project.id); } catch { /* 무시 */ }
    if (project.costStats) {
      useCostStore.getState().setCostStats(project.costStats);
    } else {
      useCostStore.getState().resetCosts();
    }

    // [NEW] imageVideoStore 복원 — 캐릭터/스타일/웹검색 설정을 config에서 복원
    try {
      const { useImageVideoStore } = require('./imageVideoStore');
      useImageVideoStore.getState().restoreFromConfig({
        style: project.config?.selectedVisualStyle,
        characters: project.config?.characters,
        enableWebSearch: project.config?.enableWebSearch,
        isMultiCharacter: project.config?.isMultiCharacter,
      });
    } catch { /* imageVideoStore 미초기화 시 무시 */ }

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
        } catch { /* soundStudioStore 미초기화 시 무시 */ }
      }).catch(() => { /* audioStorageService import 실패 시 무시 */ });

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
    } catch { /* soundStudioStore 미초기화 시 무시 */ }

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
    try { useEditRoomStore.getState().reset(); } catch { /* 미초기화 시 무시 */ }
    try { useSoundStudioStore.getState().reset(); } catch { /* 미초기화 시 무시 */ }

    // 고유 프로젝트 ID 즉시 생성 (auto-save가 작동하려면 필수)
    const projectId = `proj_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 임시 제목 자동 생성: "임시 프로젝트 03/07 14:30"
    const now = new Date();
    const autoTitle = title || `임시 프로젝트 ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    set({
      config: {
        mode: 'SCRIPT',
        script: '',
        videoFormat: VideoFormat.SHORT,
        aspectRatio: AspectRatio.LANDSCAPE,
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
    try { localStorage.setItem('last-project-id', projectId); } catch { /* 무시 */ }
    useCostStore.getState().resetCosts();

    // 즉시 IndexedDB에 초기 저장 (auto-save 조건과 무관하게 프로젝트 목록에 표시)
    import('../services/storageService').then(({ saveProject }) => {
      saveProject({
        id: projectId,
        title: autoTitle,
        config: { mode: 'SCRIPT', script: '', videoFormat: VideoFormat.SHORT, aspectRatio: AspectRatio.LANDSCAPE, imageModel: ImageModel.NANO_COST, smartSplit: true } as ProjectConfig,
        scenes: [],
        thumbnails: [],
        fullNarrationText: '',
        lastModified: Date.now(),
        costStats: useCostStore.getState().costStats,
      }).catch(() => { /* 저장 실패 시 무시 — auto-save가 이후 재시도 */ });
    }).catch(() => {});

    // [NEW] imageVideoStore 리셋 — 이전 프로젝트의 캐릭터/스타일이 남지 않도록
    try {
      const { useImageVideoStore } = require('./imageVideoStore');
      useImageVideoStore.getState().resetStore();
    } catch { /* imageVideoStore 미초기화 시 무시 */ }
  },
}));
