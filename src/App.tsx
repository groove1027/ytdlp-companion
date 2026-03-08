
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import ConfigForm from './components/ConfigForm';
import { StoryboardScene } from './components/StoryboardScene';
const ThumbnailGenerator = lazy(() => import('./components/ThumbnailGenerator'));
import ProcessingOverlay from './components/ProcessingOverlay';
import ImageLightbox from './components/ImageLightbox';
import DebugConsole from './components/DebugConsole';
import FeedbackModal from './components/FeedbackModal';
import CostDashboard from './components/CostDashboard';
import ApiKeySettings from './components/ApiKeySettings';
/* WaveSpeed 비활성화 — import 주석처리
import WatermarkRemoverModal from './components/WatermarkRemoverModal';
*/
import { ProjectConfig, Scene, AspectRatio, ProjectData, VideoFormat, ImageModel, CharacterAppearance, VideoModel, VoiceName, AppTab } from './types';
import {
    parseScriptToScenes,
    generateSceneImage,
    urlToBase64,
    analyzeScriptContext,
    generatePromptFromScript,
    fetchCurrentExchangeRate,
} from './services/geminiService';
import { canCreateNewProject, requestPersistentStorage, getProject } from './services/storageService';
import { useVideoBatch } from './hooks/useVideoBatch';
import { useAutoSave } from './hooks/useAutoSave';
import { uploadMediaToHosting } from './services/uploadService';
import { downloadImages, downloadVideos, downloadThumbnails, exportProjectHtml, exportVisualPromptsHtml, exportVideoPromptsHtml } from './services/exportService';
import { PRICING } from './constants';
import { getVisualStyleLabel } from './components/VisualStylePicker';
import { getGeminiKey } from './services/apiService';
import { dataURLtoFile } from './utils/fileHelpers';
import { splitVideoIntoSegments, getVideoDuration } from './utils/videoSegmentUtils';
import { persistImage } from './services/imageStorageService';
import { AuthUser } from './services/authService';
import AuthGate from './components/AuthGate';
import AuthPromptModal from './components/AuthPromptModal';
import ProfileModal from './components/ProfileModal';
import { useUIStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';
import { useCostStore } from './stores/costStore';
import { useProjectStore } from './stores/projectStore';
import { useNavigationStore } from './stores/navigationStore';

// [v4.5] 새로운 탭 컴포넌트 (Lazy Loading)
const ProjectDashboard = lazy(() => import('./components/tabs/ProjectDashboard'));
const ChannelAnalysisTab = lazy(() => import('./components/tabs/ChannelAnalysisTab'));
const ScriptWriterTab = lazy(() => import('./components/tabs/ScriptWriterTab'));
const SoundStudioTab = lazy(() => import('./components/tabs/SoundStudioTab'));
const ImageVideoTab = lazy(() => import('./components/tabs/ImageVideoTab'));
const EditRoomTab = lazy(() => import('./components/tabs/EditRoomTab'));
const UploadTab = lazy(() => import('./components/tabs/UploadTab'));
const ThumbnailStudioTab = lazy(() => import('./components/tabs/ThumbnailStudioTab'));
const CharacterTwistLab = lazy(() => import('./components/CharacterTwistLab'));
const ImageScriptUploadLab = lazy(() => import('./components/ImageScriptUploadLab'));
const PptMasterTab = lazy(() => import('./components/tabs/PptMasterTab'));
const DetailPageTab = lazy(() => import('./components/tabs/DetailPageTab'));
// ShoppingShortTab은 DetailPageTab(쇼핑콘텐츠) 내부 서브탭으로 이동됨

// [v4.5] 탭 정의
const TAB_CONFIG: { id: AppTab; label: string; icon: string; activeClass: string }[] = [
  { id: 'project', label: '프로젝트', icon: '📁', activeClass: 'bg-gray-700/30 text-gray-200 border border-gray-500/30' },
  { id: 'channel-analysis', label: '채널/영상 분석', icon: '🔍', activeClass: 'bg-blue-600/20 text-blue-400 border border-blue-500/30' },
  { id: 'script-writer', label: '대본작성', icon: '✍️', activeClass: 'bg-violet-600/20 text-violet-400 border border-violet-500/30' },
  { id: 'sound-studio', label: '사운드스튜디오', icon: '🎵', activeClass: 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30' },
  { id: 'image-video', label: '이미지/영상', icon: '🎬', activeClass: 'bg-orange-600/20 text-orange-400 border border-orange-500/30' },
  { id: 'edit-room', label: '편집실', icon: '✂️', activeClass: 'bg-amber-600/20 text-amber-400 border border-amber-500/30' },
  { id: 'upload', label: '업로드', icon: '📤', activeClass: 'bg-green-600/20 text-green-400 border border-green-500/30' },
];

// [v4.5] 파이프라인 단계 정의 (진행 표시기용)
const PIPELINE_STEPS: { id: AppTab; label: string; num: number }[] = [
  { id: 'project', label: '프로젝트', num: 0 },
  { id: 'channel-analysis', label: '채널/영상 분석', num: 1 },
  { id: 'script-writer', label: '대본', num: 2 },
  { id: 'sound-studio', label: '사운드', num: 3 },
  { id: 'image-video', label: '이미지/영상', num: 4 },
  { id: 'edit-room', label: '편집실', num: 5 },
  { id: 'upload', label: '업로드', num: 6 },
];

/** 도구모음 탭 ID 목록 — 파이프라인 표시기를 숨길 탭 */
const TOOL_TABS = new Set<AppTab>(['thumbnail-studio', 'character-twist', 'image-script-upload', 'ppt-master', 'detail-page']);

// 탭 로딩 fallback
const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    <span className="ml-3 text-gray-400 text-base">로딩 중...</span>
  </div>
);

// ErrorBoundary — lazy 컴포넌트 런타임 에러 캐치
class TabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-400 text-lg font-bold mb-2">탭 로딩 오류</p>
          <pre className="text-red-300 text-sm bg-red-900/20 p-4 rounded-lg overflow-auto max-h-60 text-left">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
          <button
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white"
            onClick={() => this.setState({ error: null })}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Utility functions moved to ./utils/fileHelpers.ts
// CostDashboard moved to ./components/CostDashboard.tsx
// HTML templates moved to ./templates/
// Export handlers moved to ./services/exportService.ts




const App: React.FC = () => {
  // --- Auth Store (Soft Gate) ---
  const authUser = useAuthStore((s) => s.authUser);
  const authChecking = useAuthStore((s) => s.authChecking);
  const setAuthUser = useAuthStore((s) => s.setAuthUser);
  const showAuthGateModal = useUIStore((s) => s.showAuthGateModal);

  useEffect(() => {
    useAuthStore.getState().checkAuth();
  }, []);

  // --- Navigation Store (v4.5) ---
  const activeTab = useNavigationStore((s) => s.activeTab);
  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const showProjectDashboard = useNavigationStore((s) => s.showProjectDashboard);
  const leaveDashboard = useNavigationStore((s) => s.leaveDashboard);
  const goToDashboard = useNavigationStore((s) => s.goToDashboard);

  // --- UI Store ---
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const lightboxUrl = useUIStore((s) => s.lightboxUrl);
  const showFullScriptModal = useUIStore((s) => s.showFullScriptModal);
  const showApiSettings = useUIStore((s) => s.showApiSettings);
  /* WaveSpeed 비활성화
  const showWatermarkModal = useUIStore((s) => s.showWatermarkModal);
  */
  const toast = useUIStore((s) => s.toast);
  const isProcessing = useUIStore((s) => s.isProcessing);
  const processingMessage = useUIStore((s) => s.processingMessage);
  const processingMode = useUIStore((s) => s.processingMode);
  const refreshTrigger = useUIStore((s) => s.refreshTrigger);
  const setProcessing = useUIStore((s) => s.setProcessing);
  const setProcessingMessage = useUIStore((s) => s.setProcessingMessage);
  const toolboxOpen = useUIStore((s) => s.toolboxOpen);

  // --- Cost Store ---
  const addCost = useCostStore((s) => s.addCost);

  // --- Project Store ---
  const config = useProjectStore((s) => s.config);
  const scenes = useProjectStore((s) => s.scenes);
  const thumbnails = useProjectStore((s) => s.thumbnails);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const batchGrokDuration = useProjectStore((s) => s.batchGrokDuration);
  const batchGrokSpeech = useProjectStore((s) => s.batchGrokSpeech);
  const setConfig = useProjectStore((s) => s.setConfig);
  const setScenes = useProjectStore((s) => s.setScenes);
  const setThumbnails = useProjectStore((s) => s.setThumbnails);
  const setProjectTitle = useProjectStore((s) => s.setProjectTitle);
  const setCurrentProjectId = useProjectStore((s) => s.setCurrentProjectId);
  const setBatchGrokDuration = useProjectStore((s) => s.setBatchGrokDuration);
  const setBatchGrokSpeech = useProjectStore((s) => s.setBatchGrokSpeech);

  useEffect(() => {
    const fetchRate = async () => {
        const data = await fetchCurrentExchangeRate();
        useCostStore.getState().setExchangeRate(data.rate, data.date);
    };
    fetchRate();
    const interval = setInterval(fetchRate, 300_000); // 5분마다 환율 갱신
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    requestPersistentStorage();
    // [FIX] 앱 시작 시 음악 라이브러리 로드 — 편집실 BGM 패널에서 즉시 트랙 표시
    import('./stores/soundStudioStore').then(({ useSoundStudioStore }) => {
      useSoundStudioStore.getState().loadMusicLibrary();
    }).catch(() => {});
  }, []);

  // Auto-save via Zustand store subscriptions
  useAutoSave();

  // [FIX] 새 탭/새로고침 시 마지막 프로젝트 자동 복원
  useEffect(() => {
    const restoreLastProject = async () => {
      // 이미 프로젝트가 로드된 상태라면 스킵
      if (useProjectStore.getState().config) return;

      const lastId = localStorage.getItem('last-project-id');
      if (!lastId) {
        // 저장된 프로젝트 ID 없음 → 현재 탭이 프로젝트가 아니면 자동 생성, 아니면 대시보드
        const currentTab = useNavigationStore.getState().activeTab;
        if (currentTab !== 'project') {
          useProjectStore.getState().newProject();
        } else {
          useNavigationStore.getState().goToDashboard();
        }
        return;
      }

      try {
        const project = await getProject(lastId);
        if (project) {
          useProjectStore.getState().loadProject(project);
          // 탭 상태는 navigationStore가 localStorage에서 복원하므로 그대로 유지
        } else {
          // IndexedDB에 해당 프로젝트 없음 → 대시보드로 이동
          localStorage.removeItem('last-project-id');
          useNavigationStore.getState().goToDashboard();
        }
      } catch (e) {
        console.warn('[App] Failed to restore last project:', e);
        useNavigationStore.getState().goToDashboard();
      }
    };
    restoreLastProject();
  }, []);

  // [UX] 프로젝트 필요 탭인데 프로젝트 없으면 자동 생성 — 어떤 탭이든 바로 작업 시작 가능
  useEffect(() => {
    if (activeTab !== 'project' && !config) {
      // navigationStore.setActiveTab에서 이미 처리하지만, 직접 URL 진입 등 엣지 케이스 대비
      if (!useProjectStore.getState().config) {
        useProjectStore.getState().newProject();
        useNavigationStore.getState().leaveDashboard();
      }
    }
  }, [activeTab, config]);

  const {
    isBatching,
    batchProgress,
    detailedStatus,
    runGrokHQBatch,
    runVeoFastBatch,
    runVeoQualityBatch,
    runSingleGrokHQ,
    runSingleVeoFast,
    runSingleVeoQuality,
    processRemakeScene,
    runRemakeBatchWithScenes,
    cancelScene
  } = useVideoBatch(scenes, setScenes, config, addCost);

  // Auto-save is now handled by useAutoSave() hook above

  // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
  // handleSaveDraft는 CharacterMode 전용이었으므로 비활성화
  /* === ORIGINAL handleSaveDraft START ===
  const handleSaveDraft = (draftConfig: Partial<ProjectConfig>) => {
      if (!currentProjectId) {
          const newId = `proj_${Date.now()}`;
          setCurrentProjectId(newId);
      }

      setConfig(prev => {
          if (!prev) {
              return {
                  mode: 'CHARACTER',
                  script: 'Character Draft',
                  detectedStyleDescription: '',
                  detectedCharacterDescription: '',
                  imageModel: ImageModel.NANO_COST,
                  videoModel: VideoModel.VEO,
                  aspectRatio: AspectRatio.SQUARE,
                  voice: VoiceName.KORE,
                  videoFormat: VideoFormat.SHORT,
                  ...draftConfig
              } as ProjectConfig;
          }
          return { ...prev, ...draftConfig };
      });

      // Auto-set project title from character description (skip if user manually edited)
      const charTitle = draftConfig.characterDraft?.characterTitle;
      if (!projectTitle || projectTitle === '캐릭터 디자인 초안' || projectTitle === '캐릭터 디자인') {
          setProjectTitle(charTitle || '캐릭터 디자인 초안');
      }
  };
  === ORIGINAL handleSaveDraft END === */
  const handleSaveDraft = (_draftConfig: Partial<ProjectConfig>) => {
      // [v4.5] CharacterMode 비활성화로 no-op 처리
  };

  // setProcessing replaced by setProcessing from useUIStore

  const getAtmosphereLabel = (prompt: string): string => {
      if (!prompt) return '';
      return getVisualStyleLabel(prompt) || prompt;
  };

  // A-2: useCallback with getState() to avoid deps on scenes/config
  const handleGenerateImage = useCallback(async (sceneId: string, feedback?: string, currentScenes?: typeof scenes, currentConfig?: typeof config, skipLoadingState = false) => {
    const resolvedScenes = currentScenes ?? useProjectStore.getState().scenes;
    const resolvedConfig = currentConfig ?? useProjectStore.getState().config;
    if (!resolvedConfig) return;
    const scene = resolvedScenes.find(s => s.id === sceneId);
    if (!scene) return;

    if (scene.imageUrl && !feedback && skipLoadingState) return;

    const useNativeHQ = scene.isNativeHQ !== undefined ? scene.isNativeHQ : resolvedConfig.textForceLock;

    if (!skipLoadingState) {
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingImage: true, imageUrl: undefined } : s));
    }

    const updateStatus = (status: string) => {
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, generationStatus: status } : s));
    };

    try {
        const costMultiplier = useNativeHQ ? 2 : 1;
        // [CRITICAL FIX] Art Style — StoryboardPanel과 동일한 폴백 체인
        // 1순위: atmosphere (ScriptMode 프리셋 또는 visualTone 자동 저장값)
        // 2순위: detectedStyleDescription (Pro 분석 시 저장된 visualTone)
        // 3순위: "Cinematic" 기본값
        const effectiveStyle = (resolvedConfig.atmosphere && resolvedConfig.atmosphere.trim() !== "")
            ? resolvedConfig.atmosphere
            : (resolvedConfig.detectedStyleDescription && resolvedConfig.detectedStyleDescription.trim() !== "")
              ? resolvedConfig.detectedStyleDescription
              : "Cinematic";

        let result: { url: string; isFallback: boolean };

        // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
        // if (resolvedConfig.mode === 'REMAKE') {
        //     // V2V mode: no image generation needed (video-to-video)
        //     return;
        // } else {
        {
            // [UPDATED] Multi-character support: build characterImages array
            const characterImages: string[] = (() => {
                if (scene.referenceImage) return [scene.referenceImage];
                const chars = resolvedConfig.characters?.map(c => c.imageUrl || c.imageBase64).filter(Boolean) as string[] || [];
                if (chars.length > 0) return chars;
                const legacy = resolvedConfig.characterPublicUrl || resolvedConfig.characterImage;
                return legacy ? [legacy] : [];
            })();

            // [NEW] Combine all character analysis results for visual consistency
            const combinedCharAnalysis = resolvedConfig.characters
                ?.filter(c => c.analysisResult)
                .map(c => c.analysisResult)
                .join('\n') || undefined;

            // [NEW] Derive scene index for shot size auto-rotation
            const appSceneIndex = resolvedScenes.findIndex(s => s.id === sceneId);

            result = await generateSceneImage(
                scene,
                effectiveStyle,
                resolvedConfig.aspectRatio,
                resolvedConfig.imageModel,
                characterImages,
                resolvedConfig.productPublicUrl || resolvedConfig.productImage,
                feedback,
                resolvedConfig.baseAge,
                useNativeHQ,
                updateStatus,
                resolvedConfig.isMixedMedia,
                resolvedConfig.detectedStyleDescription,
                resolvedConfig.textForceLock,
                resolvedConfig.globalContext,
                {
                    lang: resolvedConfig.detectedLanguage,
                    locale: resolvedConfig.detectedLocale,
                    nuance: resolvedConfig.culturalNuance,
                    langName: resolvedConfig.detectedLanguageName
                },
                scene.shotSize,
                undefined,
                resolvedConfig.suppressText,
                combinedCharAnalysis,
                appSceneIndex >= 0 ? appSceneIndex : undefined,
                resolvedConfig.enableWebSearch
            );
        }

        const imageUrl = result.url;
        const isFallback = result.isFallback;

        const basePrice = isFallback ? PRICING.IMAGE_GENERATION_FALLBACK : PRICING.IMAGE_GENERATION;
        addCost(basePrice * costMultiplier, 'image');

        // Show image immediately (may be Base64)
        setScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            imageUrl,
            isGeneratingImage: false,
            isNativeHQ: useNativeHQ,
            visualPrompt: feedback ? feedback : s.visualPrompt,
            generationStatus: undefined
        } : s));

        // Background: persist to Cloudinary (Base64 → URL)
        persistImage(imageUrl).then(persistedUrl => {
            if (persistedUrl !== imageUrl) {
                setScenes(prev => prev.map(s => s.id === sceneId && s.imageUrl === imageUrl ? { ...s, imageUrl: persistedUrl } : s));
            }
        });
    } catch (e: any) {
        const errMsg = e?.message || '알 수 없는 오류';
        console.error(`[handleGenerateImage] Scene ${sceneId} failed:`, errMsg);
        setScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            isGeneratingImage: false,
            generationStatus: `❌ 생성 실패: ${errMsg.substring(0, 80)}`
        } : s));
    }
  }, [setScenes, addCost]);

  const handleConfigSubmit = async (newConfig: ProjectConfig) => {
    // ... (Keep existing submission logic) ...
    // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
    // if (newConfig.mode === 'SCRIPT' || newConfig.mode === 'CHARACTER' || newConfig.mode === 'THUMBNAIL') {
    if (newConfig.mode === 'SCRIPT' || newConfig.mode === 'THUMBNAIL') {
        if (!getGeminiKey()) {
            useUIStore.getState().setToast({ show: true, message: "⚠️ 라오장 통합 API Key가 없습니다. 좌측 메뉴 → API 설정에서 키를 입력해주세요." });
            setTimeout(() => useUIStore.getState().setToast(null), 5000);
            return;
        }
    }

    setProcessing(true, "프로젝트 분석 및 실시간 환율 정보 업데이트 중...", newConfig.mode);
    
    try {
      if (!currentProjectId) {
         if (await canCreateNewProject()) {
             const newId = `proj_${Date.now()}`;
             setCurrentProjectId(newId);
             // Cost is auto-tracked inside evolinkChat/requestEvolinkNative
         } else {
             useUIStore.getState().setToast({ show: true, message: "브라우저 저장소 공간이 부족합니다. 기존 프로젝트를 삭제해주세요." }); setTimeout(() => useUIStore.getState().setToast(null), 5000);
             setProcessing(false);
             return;
         }
      }

      const rateData = await fetchCurrentExchangeRate();
      useCostStore.getState().setExchangeRate(rateData.rate, rateData.date);
      
      let finalConfig = { ...newConfig };
      
      const uploadPromises = [];
      if (finalConfig.characterImage && !finalConfig.characterPublicUrl) {
           const charFile = dataURLtoFile(finalConfig.characterImage, "character_ref.png");
           if (charFile) uploadPromises.push(uploadMediaToHosting(charFile).then(url => { finalConfig.characterPublicUrl = url; }));
      }
      if (finalConfig.productImage && !finalConfig.productPublicUrl) {
           const prodFile = dataURLtoFile(finalConfig.productImage, "product_ref.png");
           if (prodFile) uploadPromises.push(uploadMediaToHosting(prodFile).then(url => { finalConfig.productPublicUrl = url; }));
      }

      if (finalConfig.preGeneratedImages) {
          if (finalConfig.preGeneratedImages.intro?.imageUrl.startsWith('data:')) {
              const file = dataURLtoFile(finalConfig.preGeneratedImages.intro.imageUrl, "preview_intro.png");
              if (file) {
                  uploadPromises.push(uploadMediaToHosting(file).then(url => { 
                      if(finalConfig.preGeneratedImages?.intro) finalConfig.preGeneratedImages.intro.imageUrl = url; 
                  }));
              }
          }
          if (finalConfig.preGeneratedImages.highlight?.imageUrl.startsWith('data:')) {
              const file = dataURLtoFile(finalConfig.preGeneratedImages.highlight.imageUrl, "preview_highlight.png");
              if (file) {
                  uploadPromises.push(uploadMediaToHosting(file).then(url => { 
                      if(finalConfig.preGeneratedImages?.highlight) finalConfig.preGeneratedImages.highlight.imageUrl = url; 
                  }));
              }
          }
      }

      if (uploadPromises.length > 0) {
          setProcessingMessage("🖼️ 대용량 이미지 자산을 클라우드로 전송 중...");
          await Promise.all(uploadPromises);
      }

      let initialScenes: Scene[] = [];

      if (newConfig.mode === 'THUMBNAIL') {
          setProcessingMessage("🖼️ 썸네일 전용 모드 준비 중...");
          finalConfig.isThumbnailOnlyMode = true;
          const contextData = await analyzeScriptContext(newConfig.script, (c)=>addCost(c, 'analysis'));
          if (contextData.baseAge) finalConfig.baseAge = contextData.baseAge;
          if (contextData.detectedLanguage) finalConfig.detectedLanguage = contextData.detectedLanguage;
          if (contextData.detectedLanguageName) finalConfig.detectedLanguageName = contextData.detectedLanguageName;
          if (contextData.detectedLocale) finalConfig.detectedLocale = contextData.detectedLocale;
          if (contextData.culturalNuance) finalConfig.culturalNuance = contextData.culturalNuance;
          initialScenes = [];
      }
      else if (newConfig.mode === 'SCRIPT' && newConfig.isThumbnailOnlyMode) {
          setProcessingMessage("⚡ 썸네일 전용 모드 준비 중...");
          const contextData = await analyzeScriptContext(newConfig.script, (c)=>addCost(c, 'analysis'));
          if (contextData.baseAge) finalConfig.baseAge = contextData.baseAge;
          initialScenes = [];
      }
      // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
      /* === ORIGINAL REMAKE/CHARACTER branches START ===
      else if (newConfig.mode === 'REMAKE' && newConfig.uploadedVideoFile) {
        // V2V: Upload video → split into segments → create scenes → batch V2V
        setProcessingMessage("📤 영상 업로드 중...");
        const cloudinaryUrl = await uploadMediaToHosting(newConfig.uploadedVideoFile);

        finalConfig.v2vPrompt = newConfig.v2vPrompt;
        finalConfig.v2vResolution = newConfig.v2vResolution;

        // 영상 길이 감지: config에서 전달받거나 Cloudinary URL로 재감지
        let duration = newConfig.v2vOriginalDuration || 0;
        if (!duration) {
            setProcessingMessage("⏱️ 영상 길이 감지 중...");
            duration = await getVideoDuration(cloudinaryUrl);
        }
        finalConfig.v2vOriginalDuration = duration;

        const segments = splitVideoIntoSegments(cloudinaryUrl, duration);
        const promptText = newConfig.v2vPrompt || newConfig.script;
        const now = Date.now();

        initialScenes = segments.map((seg) => ({
            id: `scene-${now}-${seg.index}`,
            scriptText: promptText,
            visualPrompt: promptText,
            visualDescriptionKO: '',
            characterPresent: false,
            sourceVideoUrl: seg.trimmedUrl,
            isGeneratingImage: false,
            isGeneratingVideo: true,
            v2vSegmentIndex: seg.index,
            v2vTotalSegments: segments.length,
            v2vSegmentStartSec: seg.startSec,
            v2vSegmentEndSec: seg.endSec,
        }));
      }
      else if (newConfig.mode === 'CHARACTER') {
          initialScenes = [];
      }
      === ORIGINAL REMAKE/CHARACTER branches END === */
      else {
          // [OPTIMIZED] ScriptMode에서 캐시된 Pro/Thinking 분석 결과 재활용 → 시간 절약
          let contextData: Record<string, any>;
          if (newConfig.cachedContextData && newConfig.cachedContextData.estimatedSceneCount) {
              console.log('[Context] ♻️ ScriptMode 캐시된 Pro/Thinking 분석 결과 재활용 (분석 스킵)');
              contextData = newConfig.cachedContextData;
              setProcessingMessage("♻️ 캐시된 분석 결과 활용 중...");
          } else {
              setProcessingMessage("🔍 전역 컨텍스트(시대/배경/컷수) 분석 중...");
              contextData = await analyzeScriptContext(
                  newConfig.script,
                  (c)=>addCost(c, 'analysis'),
                  newConfig.videoFormat,
                  newConfig.smartSplit,
                  newConfig.longFormSplitType
              );
          }

          if (contextData.baseAge) finalConfig.baseAge = contextData.baseAge;

          // [UPDATED] Construct globalContext from new fields for detailed image generation
          const globalContextObj = {
              specificLocation: contextData.specificLocation || contextData.baseSetting, // Fallback for safety
              timePeriod: contextData.timePeriod,
              culturalBackground: contextData.culturalBackground,
              visualTone: contextData.visualTone,
              keyEntities: contextData.keyEntities || ""
          };
          finalConfig.globalContext = JSON.stringify(globalContextObj);

          if (contextData.detectedLanguage) finalConfig.detectedLanguage = contextData.detectedLanguage;
          if (contextData.detectedLanguageName) finalConfig.detectedLanguageName = contextData.detectedLanguageName;
          if (contextData.detectedLocale) finalConfig.detectedLocale = contextData.detectedLocale;
          if (contextData.culturalNuance) finalConfig.culturalNuance = contextData.culturalNuance;

          // [CRITICAL] 예상 컷수 결정 — Pro/Thinking 정밀 분석 최우선, Flash UI 추정치는 폴백
          const proEstimate = typeof contextData.estimatedSceneCount === 'number' && contextData.estimatedSceneCount > 0 ? contextData.estimatedSceneCount : 0;
          const uiEstimate = newConfig.estimatedScenes && newConfig.estimatedScenes > 0 ? newConfig.estimatedScenes : 0;
          const proSceneCount = proEstimate || uiEstimate || undefined;
          console.log(`[Context] ★ Final targetSceneCount: ${proSceneCount} (Pro분석: ${proEstimate}, UI미리보기: ${uiEstimate})`);

          setProcessingMessage("🎬 장면별 연출 및 비유/서사 구분 분석 중...");
          // [CRITICAL FIX] atmosphere가 비어있으면 visualTone을 config에 저장하여
          // 나중에 StoryboardPanel에서 개별 재생성 시 동일한 스타일을 사용할 수 있게 함
          const resolvedAtmosphere = newConfig.atmosphere || contextData.visualTone || "Cinematic";
          if (!newConfig.atmosphere && contextData.visualTone) {
              finalConfig.atmosphere = contextData.visualTone;
          }
          const analyzedScenes = await parseScriptToScenes(
              newConfig.script,
              newConfig.videoFormat,
              resolvedAtmosphere,
              newConfig.detectedCharacterDescription,
              newConfig.characterAppearance || CharacterAppearance.AUTO,
              newConfig.allowInfographics ?? false,
              newConfig.smartSplit ?? true,
              finalConfig.baseAge,
              newConfig.textForceLock,
              finalConfig.globalContext,
              finalConfig.detectedLocale,
              (c)=>addCost(c, 'analysis'),
              newConfig.suppressText,
              newConfig.longFormSplitType,
              proSceneCount // [NEW] Pro/Thinking이 산출한 정밀 컷수 우선 사용
          );

          // [FIX] Correctly initialize isInfographic based on config if not set
          // [CRITICAL UPDATE] Text Force Lock Logic Application: Decouple from text rendering trigger
          initialScenes = analyzedScenes.map((s, i) => {
              // Only respect AI decision or manual override for text rendering.
              // We do NOT force requiresTextRendering to true based on textForceLock anymore.
              let requiresText = s.requiresTextRendering;
              let textToRender = s.textToRender;
              
              // If requiresTextRendering is true (from AI), but text is missing, provide fallback.
              if (requiresText && (!textToRender || textToRender.trim() === "")) {
                  textToRender = s.scriptText; 
              }

              return { 
                  ...s, 
                  id: `scene-${Date.now()}-${i}`, 
                  isGeneratingImage: true, 
                  isGeneratingVideo: false,
                  grokDuration: '10',
                  grokSpeechMode: false,
                  isNativeHQ: false, 
                  isInfographic: newConfig.allowInfographics === true ? (s.isInfographic === true) : false, // [FIX] allowInfographics가 false면 무조건 false 강제
                  requiresTextRendering: requiresText,
                  textToRender: textToRender
              };
          });

          // [CRITICAL FIX] Ensure we don't proceed with 0 scenes silently
          if (initialScenes.length === 0) {
              throw new Error("생성된 장면이 없습니다. 대본을 다시 확인하거나 'AI 자동 분할' 옵션을 변경해보세요.");
          }

          if (finalConfig.preGeneratedImages) {
              if (initialScenes.length > 0 && finalConfig.preGeneratedImages.intro) {
                  initialScenes[0].imageUrl = finalConfig.preGeneratedImages.intro.imageUrl;
                  initialScenes[0].visualPrompt = finalConfig.preGeneratedImages.intro.prompt;
                  initialScenes[0].isNativeHQ = true; 
                  initialScenes[0].generationStatus = "프리뷰 이미지 적용됨 (Recycled)";
                  initialScenes[0].isGeneratingImage = false;
                  console.log("♻️ [Recycle] Intro image injected into Scene 0");
              }

              if (initialScenes.length > 1 && finalConfig.preGeneratedImages.highlight) {
                  const highlightIndex = Math.min(Math.floor(initialScenes.length * 0.7), initialScenes.length - 1);
                  if (highlightIndex > 0) {
                      initialScenes[highlightIndex].imageUrl = finalConfig.preGeneratedImages.highlight.imageUrl;
                      initialScenes[highlightIndex].visualPrompt = finalConfig.preGeneratedImages.highlight.prompt;
                      initialScenes[highlightIndex].isNativeHQ = true;
                      initialScenes[highlightIndex].generationStatus = "프리뷰 이미지 적용됨 (Recycled)";
                      initialScenes[highlightIndex].isGeneratingImage = false;
                      console.log(`♻️ [Recycle] Highlight image injected into Scene ${highlightIndex}`);
                  }
              }
          }
      }

      setConfig(finalConfig);
      setScenes(initialScenes);
      setProjectTitle(finalConfig.script.substring(0, 30) || "Untitled Project");
      setProcessing(false);

      if (initialScenes.length > 0) {
          // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
          // if (finalConfig.mode === 'REMAKE' && initialScenes[0]?.sourceVideoUrl) {
          //     runRemakeBatchWithScenes(initialScenes);
          // } else {
          {
              const processImagesSequentially = async () => {
                  const queue = [...initialScenes];
                  const active: Promise<void>[] = [];
                  const BATCH_LIMIT = 20;
                  const DISPATCH_DELAY = 100;

                  while (queue.length > 0 || active.length > 0) {
                      while (queue.length > 0 && active.length < BATCH_LIMIT) {
                          const scene = queue.shift()!;
                          const p = handleGenerateImage(scene.id, undefined, initialScenes, finalConfig, true)
                              .catch(e => console.error(`[Queue] Scene ${scene.id} failed`, e))
                              .finally(() => {
                                  const idx = active.indexOf(p);
                                  if (idx > -1) active.splice(idx, 1);
                              });
                          active.push(p);
                          await new Promise(resolve => setTimeout(resolve, DISPATCH_DELAY));
                      }
                      if (active.length > 0) {
                          await Promise.race(active);
                      }
                  }
              };
              processImagesSequentially();
          }
      }
    } catch (e: any) {
        console.error(e);
        let errorMsg = e.message;
        if (errorMsg.includes("API Key")) {
            errorMsg = "통합 API Key 오류가 발생했습니다. 설정 메뉴에서 키를 확인해주세요.";
        }
        useUIStore.getState().setToast({ show: true, message: `처리 중 오류: ${errorMsg}` }); setTimeout(() => useUIStore.getState().setToast(null), 5000);
        setProcessing(false);
    } 
  };
  
  // handleToggleNativeHQ, handleToggleInfographic, handleToggleLoopMode, handleCancelImageGeneration
  // — moved to StoryboardScene via useProjectStore.updateScene()

  // A-2: useCallback — only depends on setScenes (stable store action)
  const handleManualImageUpload = useCallback(async (sceneId: string, file: File) => {
      // Show immediately with ObjectURL for fast preview
      const objectUrl = URL.createObjectURL(file);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl: objectUrl, isNativeHQ: false } : s));

      // Background: upload to Cloudinary
      try {
          const cloudUrl = await uploadMediaToHosting(file);
          setScenes(prev => prev.map(s => s.id === sceneId && s.imageUrl === objectUrl ? { ...s, imageUrl: cloudUrl } : s));
      } catch (e) {
          // Fallback: convert to base64 if Cloudinary fails
          const base64 = await urlToBase64(objectUrl);
          setScenes(prev => prev.map(s => s.id === sceneId && s.imageUrl === objectUrl ? { ...s, imageUrl: base64 } : s));
      }
  }, [setScenes]);

  // A-2: useCallback with getState() to avoid deps on scenes/config
  const handleAutoPromptGen = useCallback(async (sceneId: string) => {
      const { scenes: currentScenes, config: currentConfig } = useProjectStore.getState();
      const scene = currentScenes.find(s => s.id === sceneId);
      if (!scene || !currentConfig) return;
      try {
          if (!getGeminiKey()) {
              throw new Error("API Key가 설정되지 않았습니다.");
          }
          const autoStyle = (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
              ? currentConfig.atmosphere
              : (currentConfig.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
                ? currentConfig.detectedStyleDescription
                : 'Cinematic';
          const allScenes = useProjectStore.getState().scenes;
          const sceneIdx = allScenes.findIndex(s => s.id === sceneId);
          const prevScene = sceneIdx > 0 ? allScenes[sceneIdx - 1] : undefined;
          const nextScene = sceneIdx < allScenes.length - 1 ? allScenes[sceneIdx + 1] : undefined;
          const prompt = await generatePromptFromScript(scene.scriptText, autoStyle, currentConfig.textForceLock, {
              prevSceneText: prevScene?.scriptText,
              nextSceneText: nextScene?.scriptText,
              prevScenePrompt: prevScene?.visualPrompt,
              nextScenePrompt: nextScene?.visualPrompt,
              globalContext: currentConfig.globalContext,
          });
          if (!prompt) throw new Error("생성된 프롬프트가 비어있습니다.");
          setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, visualPrompt: prompt } : s));
      } catch (e: any) {
          console.error("Auto Prompt Gen Error:", e);
          useUIStore.getState().setToast({ show: true, message: `프롬프트 자동 변환 실패: ${e.message}` }); setTimeout(() => useUIStore.getState().setToast(null), 4000);
      }
  }, [setScenes]);

  // A-2: useCallback with getState() to avoid deps on config
  const handleInjectCharacter = useCallback((sceneId: string) => {
      const currentConfig = useProjectStore.getState().config;
      const charRef = currentConfig?.characterPublicUrl || currentConfig?.characterImage;
      if (!charRef) { useUIStore.getState().setToast({ show: true, message: "캐릭터가 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, characterPresent: true, referenceImage: charRef } : s));
      handleGenerateImage(sceneId, "Ensure character matches reference.", undefined, currentConfig);
  }, [setScenes, handleGenerateImage]);

  const handleNewProject = (title: string) => {
      useProjectStore.getState().newProject();
      useProjectStore.getState().setProjectTitle(title);
      leaveDashboard();
      useNavigationStore.getState().setActiveTab('channel-analysis');
  };

  const handleLoadProject = (project: ProjectData) => {
      useProjectStore.getState().loadProject(project);
      leaveDashboard();
      // 프로젝트에 장면이 있으면 편집실 탭으로 바로 이동
      if (project.scenes.length > 0) {
        useNavigationStore.getState().setActiveTab('edit-room');
      }
  };
  
  const handleImportProject = async (file: File) => {
      try {
          // ZIP 파일 감지
          if (file.name.endsWith('.zip') || file.type === 'application/zip') {
              const { default: JSZip } = await import('jszip');
              const zip = await JSZip.loadAsync(file);
              const manifestFile = zip.file('data/manifest.json');
              if (!manifestFile) throw new Error('ZIP에 manifest.json이 없습니다.');
              const manifestText = await manifestFile.async('string');
              const manifest = JSON.parse(manifestText);

              // manifest에서 ProjectData 복원
              const scenes = await Promise.all((manifest.scenes || []).map(async (ms: Record<string, unknown>, idx: number) => {
                  let imageUrl: string | undefined;
                  if (ms.imageFile) {
                      const imgFile = zip.file(`data/scenes/${ms.imageFile}`);
                      if (imgFile) {
                          const blob = await imgFile.async('blob');
                          imageUrl = URL.createObjectURL(blob);
                      }
                  }
                  return {
                      id: ms.id || `imported_${idx}`,
                      scriptText: ms.scriptText || '',
                      visualPrompt: ms.visualPrompt || '',
                      visualDescriptionKO: '',
                      characterPresent: ms.characterPresent || false,
                      cameraMovement: ms.cameraMovement,
                      imageUrl,
                      videoUrl: ms.videoUrl,
                      castType: ms.castType,
                      entityName: ms.entityName,
                      isGeneratingImage: false,
                      isGeneratingVideo: false,
                  };
              }));

              const jsonData = {
                  id: manifest.projectId || `zip_${Date.now()}`,
                  title: manifest.title || 'Imported Project',
                  config: manifest.config,
                  scenes,
                  thumbnails: manifest.thumbnails || [],
                  fullNarrationText: scenes.map((s: { scriptText: string }) => s.scriptText).join(' ').substring(0, 500),
                  lastModified: manifest.createdAt || Date.now(),
                  costStats: manifest.costStats,
              };
              handleLoadProject(jsonData);
              return;
          }

          // HTML 파일 처리 (기존 로직)
          const text = await file.text();
          const doc = new DOMParser().parseFromString(text, 'text/html');

          let jsonData = null;
          const scriptTag = doc.getElementById('project-data');

          if (scriptTag?.textContent) {
              const content = scriptTag.textContent.trim();
              if (content.startsWith('const projectData =')) {
                  const match = content.match(/const projectData\s*=\s*(\{.*\});?/s);
                  if (match) jsonData = JSON.parse(match[1]);
              } else {
                  jsonData = JSON.parse(content);
              }
          } else {
              const scripts = doc.querySelectorAll('script');
              for (const s of Array.from(scripts)) {
                  const content = s.textContent?.trim() || "";
                  if (content.includes('const projectData =')) {
                      const match = content.match(/const projectData\s*=\s*(\{.*\});?/s);
                      if (match) {
                          jsonData = JSON.parse(match[1]);
                          break;
                      }
                  }
              }
          }

          if (jsonData) handleLoadProject(jsonData);
      } catch (e) {
          console.error("Import failed", e);
          useUIStore.getState().setToast({ show: true, message: "파일을 불러오는데 실패했습니다. 올바른 프로젝트 파일인지 확인해주세요." }); setTimeout(() => useUIStore.getState().setToast(null), 4000);
      }
  };

  // Download/export handlers moved to ./services/exportService.ts


  // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
  // const showConfigForm = !config || config.mode === 'CHARACTER';
  const showConfigForm = !config;

  // 인증 체크 중
  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-blue-500 relative">
      <ProcessingOverlay message={processingMessage} progress={detailedStatus.percent} eta={detailedStatus.eta} mode={processingMode} />
      
      {showFullScriptModal && (() => {
          const hasKO = scenes.some(s => s.scriptTextKO);
          const koText = scenes.map(s => s.scriptTextKO || '').filter(Boolean).join('\n\n');
          const origText = scenes.map(s => s.scriptText).join('\n\n');
          const downloadTextFile = (text: string, filename: string) => {
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = filename; a.click();
              URL.revokeObjectURL(url);
          };
          return (
          <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={() => useUIStore.getState().setShowFullScriptModal(false)}>
              <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">📜 전체 대본 보기</h3>
                      <button onClick={() => useUIStore.getState().setShowFullScriptModal(false)} className="text-gray-400 hover:text-white">✕</button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar flex-grow bg-gray-800 space-y-4">
                      <div>
                          <h4 className="text-base font-bold text-gray-400 mb-2">원본 대본</h4>
                          <div className="bg-gray-900 p-5 rounded-lg border border-gray-600 text-gray-300 leading-relaxed whitespace-pre-wrap text-base shadow-inner">{origText}</div>
                      </div>
                      {hasKO && (
                      <div>
                          <h4 className="text-base font-bold text-blue-400 mb-2">🇰🇷 한국어 번역</h4>
                          <div className="bg-blue-950/30 p-5 rounded-lg border border-blue-800/50 text-blue-200 leading-relaxed whitespace-pre-wrap text-base shadow-inner">{koText}</div>
                      </div>
                      )}
                  </div>
                  <div className="p-4 border-t border-gray-700 flex justify-end gap-2 flex-wrap bg-gray-900 rounded-b-xl">
                      <button onClick={() => useUIStore.getState().setShowFullScriptModal(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-bold text-sm">닫기</button>
                      <button onClick={() => { navigator.clipboard.writeText(origText).then(() => { useUIStore.getState().setToast({ show: true, message: "전체 대본이 클립보드에 복사되었습니다!" }); setTimeout(() => useUIStore.getState().setToast(null), 2000); }); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">📋 원본 복사</button>
                      <button onClick={() => downloadTextFile(origText, 'script_original.txt')} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-bold text-sm">📥 원본 다운로드</button>
                      {hasKO && <>
                          <button onClick={() => { navigator.clipboard.writeText(koText).then(() => { useUIStore.getState().setToast({ show: true, message: "한국어 대본이 클립보드에 복사되었습니다!" }); setTimeout(() => useUIStore.getState().setToast(null), 2000); }); }} className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-bold text-sm">📋 한글 복사</button>
                          <button onClick={() => downloadTextFile(koText, 'script_korean.txt')} className="px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white rounded-lg font-bold text-sm">📥 한글 다운로드</button>
                      </>}
                  </div>
              </div>
          </div>
          );
      })()}

      {lightboxUrl && <ImageLightbox imageUrl={lightboxUrl} onClose={() => useUIStore.getState().closeLightbox()} />}
      {/* DebugConsole은 도구모음 내부로 이동 — 아래 사이드바 참조 */}
      {/* [v4.5] 모달: API 설정 */}
      <ApiKeySettings isOpen={showApiSettings} onClose={() => useUIStore.getState().setShowApiSettings(false)} />
      {/* WaveSpeed 비활성화 — 워터마크 모달 주석처리
      <WatermarkRemoverModal isOpen={showWatermarkModal} onClose={() => useUIStore.getState().setShowWatermarkModal(false)} />
      */}
      
      {/* [v4.5] 상단 헤더 바 (전체 너비) */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 z-40 flex items-center px-6 gap-4">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 whitespace-nowrap">
          All In One Production <span className="text-sm text-gray-400 ml-1 font-medium">v4.5</span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <CostDashboard />
          {authUser ? (
            <>
              <button
                onClick={() => useUIStore.getState().setShowApiSettings(true)}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-bold transition-all flex items-center gap-1.5"
              >
                ⚙️ API 설정
              </button>
              <button
                onClick={() => useUIStore.getState().setShowFeedbackModal(true)}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-bold transition-all flex items-center gap-1.5"
              >
                💬 피드백
              </button>
              <button
                onClick={() => useUIStore.getState().setShowProfileModal(true)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-bold transition-all flex items-center gap-1.5"
              >
                👤 {authUser.displayName}
              </button>
            </>
          ) : (
            <button
              onClick={() => useUIStore.getState().setShowAuthGateModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-violet-500/20"
            >
              로그인 / 회원가입
            </button>
          )}
        </div>
      </header>

      {/* [v4.5] 헤더 아래: 좌측 사이드바 + 우측 콘텐츠 */}
      <div className="flex pt-16 min-h-screen">
        {/* 좌측 네비게이션 사이드바 */}
        <aside className="fixed top-16 left-0 bottom-0 w-56 bg-gray-950 border-r border-gray-800 z-30 flex flex-col py-3 px-3 gap-1 overflow-y-auto">
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'project' && activeTab === 'project') {
                    goToDashboard();
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-lg text-base font-semibold transition-all ${
                  isActive
                    ? tab.activeClass
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
          {/* 도구모음 섹션 — 접이식 */}
          {(() => {
            const TOOL_TABS = ['thumbnail-studio', 'character-twist', 'image-script-upload', 'ppt-master', 'detail-page'];
            const isToolboxOpen = toolboxOpen || TOOL_TABS.includes(activeTab);
            return (
          <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-600/40">
            <button
              onClick={() => useUIStore.getState().setToolboxOpen(!isToolboxOpen)}
              className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-base font-semibold text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🧰</span>
                <span>도구모음</span>
              </div>
              <span className={`text-xs text-gray-600 transition-transform ${isToolboxOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isToolboxOpen && (
              <div className="mt-1 space-y-1 pl-3">
                <button
                  onClick={() => setActiveTab('thumbnail-studio')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'thumbnail-studio'
                      ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">🖼️</span>
                  <span>썸네일 스튜디오</span>
                </button>
                <button
                  onClick={() => setActiveTab('character-twist')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'character-twist'
                      ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">🌀</span>
                  <span>캐릭터 비틀기</span>
                </button>
                <button
                  onClick={() => setActiveTab('image-script-upload')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'image-script-upload'
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">📸</span>
                  <span>소스 임포트</span>
                </button>
                <button
                  onClick={() => setActiveTab('ppt-master')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'ppt-master'
                      ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">📊</span>
                  <span>PPT 마스터</span>
                </button>
                <button
                  onClick={() => setActiveTab('detail-page')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'detail-page'
                      ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">🛒</span>
                  <span>쇼핑콘텐츠</span>
                </button>
              </div>
            )}
            {/* WaveSpeed 비활성화 — 워터마크 제거 버튼 주석처리
            <button
              onClick={() => useUIStore.getState().setShowWatermarkModal(true)}
              className="flex items-center gap-3 w-full px-4 py-3.5 mt-1 rounded-lg text-base font-semibold text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-all"
            >
              <span className="text-lg">🧹</span>
              <span>워터마크 제거</span>
            </button>
            */}
          </div>
            );
          })()}
          {/* 디버그 로그 — 사이드바 하단 */}
          <div className="mt-auto pt-3 border-t border-gray-800">
            <DebugConsole />
          </div>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="ml-56 flex-1 pb-12 px-8">
          {/* [v4.5] 파이프라인 진행 표시기 (도구모음 탭에서는 숨김) */}
          {!TOOL_TABS.has(activeTab) && (() => {
            const currentStepIndex = PIPELINE_STEPS.findIndex(s => s.id === activeTab);
            const isExperimental = currentStepIndex === -1;
            return (
              <div className="pt-4 pb-2">
                <div className="flex items-center gap-1">
                  {PIPELINE_STEPS.map((step, idx) => {
                    const isCurrent = step.id === activeTab;
                    const isCompleted = !isExperimental && idx < currentStepIndex;
                    return (
                      <React.Fragment key={step.id}>
                        {idx > 0 && (
                          <div className={`flex-1 h-px max-w-[40px] ${isCompleted ? 'bg-green-500/60' : isCurrent ? 'bg-blue-500/40' : 'bg-gray-700'}`} />
                        )}
                        <button
                          onClick={() => setActiveTab(step.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all whitespace-nowrap ${
                            isCurrent
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                              : isCompleted
                                ? 'text-green-400/80 hover:text-green-300'
                                : 'text-gray-600 hover:text-gray-400'
                          }`}
                          title={step.label}
                        >
                          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-blue-500 text-white'
                              : isCompleted
                                ? 'bg-green-500/70 text-white'
                                : 'bg-gray-700 text-gray-500'
                          }`}>
                            {isCompleted ? '✓' : step.num}
                          </span>
                          <span className="hidden lg:inline">{step.label}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* [v4.5] 이전 단계 네비게이션 (도구모음 탭에서는 숨김) */}
          {!TOOL_TABS.has(activeTab) && (() => {
            const currentStepIndex = PIPELINE_STEPS.findIndex(s => s.id === activeTab);
            if (currentStepIndex > 0) {
              const prevStep = PIPELINE_STEPS[currentStepIndex - 1];
              return (
                <div className="pb-2">
                  <button
                    onClick={() => setActiveTab(prevStep.id)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                  >
                    <span>←</span>
                    <span>이전 단계: {prevStep.label}</span>
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {/* [v4.5] 탭 기반 라우팅 */}
          {activeTab === 'channel-analysis' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><ChannelAnalysisTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'script-writer' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><ScriptWriterTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'sound-studio' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><SoundStudioTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'image-video' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><ImageVideoTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'edit-room' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><EditRoomTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'upload' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><UploadTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'thumbnail-studio' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><ThumbnailStudioTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'character-twist' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><CharacterTwistLab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'image-script-upload' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><ImageScriptUploadLab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'ppt-master' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><PptMasterTab /></Suspense></TabErrorBoundary>
          ) : activeTab === 'detail-page' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><DetailPageTab /></Suspense></TabErrorBoundary>
          ) : /* project tab (default) */ showProjectDashboard ? (
              /* [v4.5] 프로젝트 대시보드 — 카드 그리드 */
              <Suspense fallback={<TabFallback />}>
                <ProjectDashboard onSelectProject={handleLoadProject} onNewProject={handleNewProject} onImportProject={handleImportProject} refreshTrigger={refreshTrigger} />
              </Suspense>
          ) : showConfigForm ? (
              <ConfigForm onNext={handleConfigSubmit} isLoading={isProcessing} onSetProcessing={setProcessing} onCostAdd={addCost} onSaveDraft={handleSaveDraft} initialDraft={null} />
          ) : (
              <div className="animate-fade-in space-y-6">
                  <div className="border-b border-gray-800 pb-2">
                          <div className="relative group mb-1 flex items-center max-w-full">
                              <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} className="text-3xl font-bold text-white bg-transparent border-b border-transparent hover:border-gray-500 focus:border-blue-500 focus:outline-none transition-all w-full md:w-auto md:min-w-[400px]" placeholder="프로젝트 제목을 입력하세요" />
                              <span className="ml-2 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity text-base pointer-events-none">✏️</span>
                          </div>
                          
                          {/* [UPDATED] Detailed Project Info Badges */}
                          <div className="flex gap-2 text-sm text-gray-400 items-center flex-wrap mt-2">
                              {/* 1. Basic Mode Info */}
                              <span className={`px-2 py-1 rounded border border-gray-700 font-bold bg-gray-800`}>
                                  {/* [v4.5] REMAKE 모드 표시 주석처리됨 - 추후 복원 가능 */}
                                  {/* {config!.mode === 'THUMBNAIL' || config!.isThumbnailOnlyMode ? '🖼️ 썸네일 전용' : config!.mode === 'REMAKE' ? '🎬 V2V 변환' : config!.mode === 'SCRIPT' ? '🎬 대본 모드' : config!.mode} */}
                                  {config!.mode === 'THUMBNAIL' || config!.isThumbnailOnlyMode ? '🖼️ 썸네일 전용' : config!.mode === 'SCRIPT' ? '🎬 대본 모드' : config!.mode}
                              </span>
                              <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 font-bold">{config!.aspectRatio}</span>
                              
                              {/* 2. Style Badge */}
                              {config!.atmosphere && (
                                  <span className="bg-purple-900/30 text-purple-300 px-2 py-1 rounded border border-purple-700/50 font-bold truncate max-w-[200px]" title={config!.atmosphere}>
                                      🎨 {getAtmosphereLabel(config!.atmosphere)}
                                  </span>
                              )}

                              {/* 3. Split Logic Badge */}
                              {config!.smartSplit ? (
                                  <span className="bg-indigo-900/30 text-indigo-300 px-2 py-1 rounded border border-indigo-500/50 font-bold flex items-center gap-1">
                                      🤖 AI 자동 분할
                                  </span>
                              ) : (
                                  <span className="bg-orange-900/30 text-orange-300 px-2 py-1 rounded border border-orange-500/50 font-bold flex items-center gap-1">
                                      ✂️ 수동 분할 (Enter)
                                  </span>
                              )}

                              {/* 4. Feature Toggles */}
                              {config!.allowInfographics && <span className="bg-blue-900/30 text-blue-300 px-2 py-1 rounded border border-blue-500/50 font-bold">📊 인포그래픽 모드</span>}
                              {config!.textForceLock && <span className="bg-orange-900/30 text-orange-300 px-2 py-1 rounded border border-orange-500/50 font-bold">🔠 텍스트 강제 고정</span>}
                              {config!.suppressText && <span className="bg-red-900/30 text-red-300 px-2 py-1 rounded border border-red-500/50 font-bold">🚫 텍스트 금지 (No Text)</span>}
                              {config!.characterImage && <span className="bg-emerald-900/30 text-emerald-300 px-2 py-1 rounded border border-emerald-500/50 font-bold">👤 캐릭터 적용됨</span>}
                              {config!.isMixedMedia && <span className="bg-pink-900/30 text-pink-300 px-2 py-1 rounded border border-pink-500/50 font-bold">🔀 스타일 혼합</span>}
                          </div>
                      </div>

                      <div className="flex flex-wrap gap-3 w-full bg-gray-900/50 p-4 rounded-xl border border-gray-800 shadow-sm items-center">
                         <div className="text-base font-bold text-gray-400 mr-2">📂 프로젝트 관리:</div>
                         {!(config!.mode === 'THUMBNAIL' || config!.isThumbnailOnlyMode) && (
                             <button onClick={() => useUIStore.getState().setShowFullScriptModal(true)} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>📜</span> 전체 대본</button>
                         )}
                         <button onClick={downloadThumbnails} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>🖼️</span> 썸네일 저장</button>
                         {!(config!.mode === 'THUMBNAIL' || config!.isThumbnailOnlyMode) && (
                             <>
                                 <button onClick={downloadImages} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>📸</span> 이미지 저장</button>
                                 <div className="flex items-center gap-2">
                                     <button onClick={downloadVideos} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>🎬</span> 영상 저장</button>
                                     {(isBatching || (toast && toast.show)) && <span className="text-sm text-green-300 font-bold bg-green-900/40 px-3 py-1.5 rounded-full border border-green-500/30 animate-pulse">{isBatching ? `⏳ ${batchProgress.current}/${batchProgress.total} 저장 중...` : `⏳ ${toast?.message} (${toast?.current}/${toast?.total})`}</span>}
                                 </div>
                                 <button onClick={exportVisualPromptsHtml} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>🎨</span> 비주얼 프롬프트 가이드</button>
                                 <button onClick={exportVideoPromptsHtml} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md flex items-center gap-2"><span>🎬</span> 영상 프롬프트 가이드</button>
                             </>
                         )}
                         <button onClick={exportProjectHtml} className="bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/50 text-blue-200 px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 ml-auto"><span>💾</span> 프로젝트 저장 (HTML)</button>
                      </div>

                      {!(config!.mode === 'THUMBNAIL' || config!.isThumbnailOnlyMode) && (
                          <div className="flex flex-col gap-2">
                              <div className="flex justify-end px-2">
                                  <span className="text-[13px] text-yellow-300 bg-yellow-900/20 px-3 py-1.5 rounded border border-yellow-700/30 font-bold flex items-center gap-1 shadow-lg">
                                      💡 Veo 3.1 1080p(Apimart)는 가격($0.08)이 가장 저렴하고 화질이 뛰어난 최고의 가성비 모델입니다! 다만, 생성속도가 가장 느리고 API 서버의 트래픽으로 인해 오류가 뜰 수 있습니다!
                                  </span>
                              </div>

                              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 flex flex-col gap-4 shadow-lg">
                                  <div className="flex flex-col xl:flex-row items-center justify-between gap-4 w-full">
                                      <div className="flex items-center gap-3 w-full xl:w-auto justify-start">
                                          <span className="text-base font-bold text-gray-300 whitespace-nowrap">🎥 일괄 영상 생성 (Batch Only) :</span>
                                      </div>
                                      <div className="flex flex-col lg:flex-row items-center gap-2 lg:gap-0 w-full xl:w-auto justify-center lg:justify-end">
                                          <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                                              
                                              {/* [UPDATED LAYOUT] Grok -> Veo 720p -> Veo 1080p */}
                                              
                                              {/* 1. Grok HQ */}
                                              <button 
                                                  onClick={() => runGrokHQBatch(batchGrokDuration, batchGrokSpeech)} 
                                                  className="bg-gradient-to-r from-pink-700 to-rose-600 hover:from-pink-600 hover:to-rose-500 text-white px-4 py-2 text-sm font-bold transition-all hover:brightness-110 flex items-center gap-1 rounded-lg shadow-md whitespace-nowrap"
                                              >
                                                  🚀 Grok HQ (Kie)
                                              </button>
                                              
                                              {/* Grok Settings */}
                                              <div className="flex items-center bg-gray-900 rounded-lg p-1 border border-gray-700 h-9 mr-2">
                                                  <button 
                                                      onClick={() => setBatchGrokDuration(prev => prev === '6' ? '10' : prev === '10' ? '15' : '6')}
                                                      className={`text-sm px-2.5 py-1 rounded font-mono mr-1 transition-colors border h-full flex items-center ${batchGrokDuration === '15' ? 'bg-pink-900/80 border-pink-500 text-pink-200' : batchGrokDuration === '10' ? 'bg-indigo-900/80 border-indigo-500 text-indigo-200' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                                                  >
                                                      ⏱️ {batchGrokDuration}s
                                                  </button>
                                                  <button 
                                                      onClick={() => setBatchGrokSpeech(!batchGrokSpeech)}
                                                      className={`text-sm px-2.5 py-1 rounded font-mono transition-colors border h-full flex items-center ${batchGrokSpeech ? 'bg-green-900/80 border-green-500 text-green-200' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                                                  >
                                                      {batchGrokSpeech ? '🗣️ 대사' : '🔇 SFX'}
                                                  </button>
                                              </div>

                                              {/* 2. Veo 720p (Evolink) */}
                                              <button 
                                                  onClick={runVeoFastBatch} 
                                                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-bold border border-blue-400/50 shadow-md transition-all hover:scale-105 whitespace-nowrap"
                                              >
                                                  ⚡ Veo 720p (Fast)
                                              </button>

                                              {/* 3. Veo 1080p (Apimart) */}
                                              <button 
                                                  onClick={runVeoQualityBatch} 
                                                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-4 py-2 rounded-lg text-sm font-bold border border-violet-400/50 shadow-md transition-all hover:scale-105 whitespace-nowrap"
                                              >
                                                  💎 Veo 1080p (Apimart)
                                              </button>

                                          </div>
                                      </div>
                                  </div>
                                  <div className="w-full bg-red-600 border-2 border-red-400 rounded-lg p-3 text-center shadow-lg shadow-red-900/50">
                                      <span className="text-sm text-white font-black flex items-center justify-center gap-2 drop-shadow-md">
                                          ⚠️ Veo 3.1은 장면의 검열이 엄격하여 일부 영상 생성이 제한될 수 있습니다. (실패 시 Grok HQ 모드 사용 권장)
                                      </span>
                                  </div>
                                  <div className="w-full bg-orange-600 border-2 border-orange-400 rounded-lg p-3 text-center shadow-lg shadow-orange-900/50 mt-2">
                                      <span className="text-sm text-white font-black flex items-center justify-center gap-2 drop-shadow-md">
                                          🔠 문자가 포함된 영상의 경우 Veo보다 Grok이 비교적 더 정확하게 묘사합니다.
                                      </span>
                                  </div>
                              </div>
                          </div>
                      )}
                      
                      <Suspense fallback={<div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div><span className="ml-3 text-gray-400 text-base">썸네일 스튜디오 로딩 중...</span></div>}>
                      <ThumbnailGenerator
                          script={config!.script}
                          styleDescription={`${config!.detectedStyleDescription} ${config!.atmosphere || ''}`}
                          characterImageBase64={config!.characterImage}
                          characterDescription={config!.detectedCharacterDescription}
                          thumbnails={thumbnails}
                          setThumbnails={setThumbnails}
                          videoFormat={config!.videoFormat}
                          onImageClick={(url: string) => useUIStore.getState().openLightbox(url)}
                          onCostAdd={addCost}
                          textForceLock={config!.textForceLock}
                          isMixedMedia={config!.isMixedMedia}
                          languageContext={{
                              lang: config!.detectedLanguage,
                              langName: config!.detectedLanguageName,
                              locale: config!.detectedLocale,
                              nuance: config!.culturalNuance
                          }}
                          globalContext={config!.globalContext}
                      />
                      </Suspense>

                      {scenes.length > 0 ? (
                          <div className={`grid gap-6 ${config!.aspectRatio === '9:16' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
                              {scenes.map((scene, index) => (
                                  <StoryboardScene
                                        key={scene.id}
                                        scene={scene}
                                        index={index}
                                        aspectRatio={config!.aspectRatio}
                                        videoFormat={config!.videoFormat}
                                        onGenerateImage={handleGenerateImage}
                                        onGenerateGrokHQ={runSingleGrokHQ}
                                        onGenerateVeoFast={runSingleVeoFast}
                                        onGenerateVeoQuality={runSingleVeoQuality}
                                        onUploadImage={handleManualImageUpload}
                                        onCancelGeneration={cancelScene}
                                        onInjectCharacter={handleInjectCharacter}
                                        onAutoPrompt={handleAutoPromptGen}
                                        variant='default'
                                   />
                              ))}
                          </div>
                      ) : !config!.script ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                              <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                                  <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                              </div>
                              <p className="text-gray-400 text-base font-medium mb-1">새 프로젝트가 시작되었습니다</p>
                              <p className="text-gray-600 text-sm max-w-md">이미지/영상 탭에서 대본을 가져오고 설정을 구성한 뒤 장면을 분석하세요.</p>
                          </div>
                      ) : null}
              </div>
          )}
      </main>
      </div>{/* flex wrapper 닫기 */}

      <FeedbackModal />
      {authUser && (
        <ProfileModal
          authUser={authUser}
          onUserUpdate={setAuthUser}
          onAccountDeleted={() => setAuthUser(null)}
        />
      )}

      {/* Soft Gate 모달 */}
      <AuthPromptModal />
      {showAuthGateModal && (
        <div className="fixed inset-0 z-[250]">
          <AuthGate onAuthenticated={(user) => {
            setAuthUser(user);
            useUIStore.getState().setShowAuthGateModal(false);
          }} />
          <button
            onClick={() => useUIStore.getState().setShowAuthGateModal(false)}
            className="fixed top-6 right-6 z-[251] w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 hover:bg-gray-700 border border-gray-600 text-gray-400 hover:text-white text-xl transition-all"
          >
            &times;
          </button>
        </div>
      )}

      {/* 전역 Toast 알림 */}
      {toast && toast.show && !toast.current && !toast.total && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none" style={{ animation: 'toastIn 0.3s ease-out' }}>
          <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div className="bg-gray-900/95 text-white px-5 py-3 rounded-xl shadow-2xl border border-gray-600/50 backdrop-blur-sm text-sm font-medium flex items-center gap-2">
            <span className="text-green-400">✓</span> {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
