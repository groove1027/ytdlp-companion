
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Toaster } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import ConfigForm from './components/ConfigForm';
// [v4.5] 레거시 UI 제거됨 — StoryboardScene, ThumbnailGenerator는 각 탭 컴포넌트에서 직접 import
import ProcessingOverlay from './components/ProcessingOverlay';
import ImageLightbox from './components/ImageLightbox';
import DebugConsole from './components/DebugConsole';
import FeedbackModal from './components/FeedbackModal';
import FeedbackHistoryPanel from './components/FeedbackHistoryPanel';
import FeedbackNotificationBanner from './components/FeedbackNotificationBanner';
import SmartErrorBanner from './components/SmartErrorBanner';
import AnnouncementBanner from './components/AnnouncementBanner';
import CostDashboard from './components/CostDashboard';
import ApiKeySettings from './components/ApiKeySettings';
import { ProjectConfig, Scene, AspectRatio, ProjectData, VideoFormat, ImageModel, CharacterAppearance, VideoModel, VoiceName, AppTab } from './types';
import {
    parseScriptToScenes,
    generateSceneImage,
    urlToBase64,
    analyzeScriptContext,
    generatePromptFromScript,
    fetchCurrentExchangeRate,
} from './services/geminiService';
import { canCreateNewProject, requestPersistentStorage } from './services/storageService';
import { useVideoBatch } from './hooks/useVideoBatch';
import { useAutoSave } from './hooks/useAutoSave';
import { useViewAlertPolling } from './hooks/useViewAlertPolling';
import { uploadMediaToHosting } from './services/uploadService';
// [v4.5] 레거시 UI 제거됨 — export 함수들은 편집실 탭에서 직접 import
import { PRICING } from './constants';
// [v4.5] getVisualStyleLabel은 레거시 UI 제거로 불필요 — 각 탭에서 직접 import
import { getGeminiKey } from './services/apiService';
import { dataURLtoFile } from './utils/fileHelpers';
import { splitVideoIntoSegments, getVideoDuration } from './utils/videoSegmentUtils';
import { persistImage } from './services/imageStorageService';
import { AuthUser } from './services/authService';
import AuthGate from './components/AuthGate';
import AuthPromptModal from './components/AuthPromptModal';
import ProfileModal from './components/ProfileModal';
import HelpGuideModal from './components/HelpGuideModal';
// [REMOVED] OnboardingTour — 사용자 혼란 유발로 제거
import { useUIStore, showToast } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';
import { isTrialExpired, getTrialDaysLeft } from './services/authService';
import TrialGuideModal from './components/TrialGuideModal';
import { useCostStore } from './stores/costStore';
import { useProjectStore, autoRestoreOrCreateProject } from './stores/projectStore';
import { useNavigationStore } from './stores/navigationStore';
import { useImageVideoStore } from './stores/imageVideoStore';
import { logger } from './services/LoggerService';
import { lazyRetry } from './utils/retryImport';

// [v4.5] 새로운 탭 컴포넌트 (Lazy Loading + 자동 재시도)
const ProjectDashboard = lazyRetry(() => import('./components/tabs/ProjectDashboard'));
const ChannelAnalysisTab = lazyRetry(() => import('./components/tabs/ChannelAnalysisTab'));
const ScriptWriterTab = lazyRetry(() => import('./components/tabs/ScriptWriterTab'));
const SoundStudioTab = lazyRetry(() => import('./components/tabs/SoundStudioTab'));
const ImageVideoTab = lazyRetry(() => import('./components/tabs/ImageVideoTab'));
const EditRoomTab = lazyRetry(() => import('./components/tabs/EditRoomTab'));
const UploadTab = lazyRetry(() => import('./components/tabs/UploadTab'));
const ThumbnailStudioTab = lazyRetry(() => import('./components/tabs/ThumbnailStudioTab'));
const CharacterTwistLab = lazyRetry(() => import('./components/CharacterTwistLab'));
const ImageScriptUploadLab = lazyRetry(() => import('./components/ImageScriptUploadLab'));
const PptMasterTab = lazyRetry(() => import('./components/tabs/PptMasterTab'));
const DetailPageTab = lazyRetry(() => import('./components/tabs/DetailPageTab'));
const SubtitleRemoverTab = lazyRetry(() => import('./components/tabs/SubtitleRemoverTab'));
// ShoppingShortTab은 DetailPageTab(쇼핑콘텐츠) 내부 서브탭으로 이동됨

// [v4.5] 탭 정의 — 메인 파이프라인
const TAB_CONFIG: { id: AppTab; label: string; icon: string; activeClass: string }[] = [
  { id: 'project', label: '프로젝트', icon: '📁', activeClass: 'bg-gray-700/30 text-gray-200 border border-gray-500/30' },
  { id: 'channel-analysis', label: '채널/영상 분석 🔥', icon: '🔍', activeClass: 'bg-blue-600/20 text-blue-400 border border-blue-500/30' },
  { id: 'script-writer', label: '대본작성 🔥', icon: '✍️', activeClass: 'bg-violet-600/20 text-violet-400 border border-violet-500/30' },
];

// [v4.5] 후반작업 하위 탭 (대본작성 아래 접이식)
const POST_PRODUCTION_TABS: { id: AppTab; label: string; icon: string; activeClass: string }[] = [
  { id: 'sound-studio', label: '사운드스튜디오', icon: '🎵', activeClass: 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30' },
  { id: 'image-video', label: '이미지/영상', icon: '🎬', activeClass: 'bg-orange-600/20 text-orange-400 border border-orange-500/30' },
  { id: 'edit-room', label: '편집실', icon: '✂️', activeClass: 'bg-amber-600/20 text-amber-400 border border-amber-500/30' },
  { id: 'upload', label: '업로드', icon: '📤', activeClass: 'bg-green-600/20 text-green-400 border border-green-500/30' },
];

/** 후반작업 탭 ID Set — 접이식 자동 열기 판단용 */
const POST_PRODUCTION_TAB_IDS = new Set<AppTab>(['sound-studio', 'image-video', 'edit-room', 'upload']);

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
const TOOL_TABS = new Set<AppTab>(['thumbnail-studio', 'character-twist', 'image-script-upload', 'ppt-master', 'detail-page', 'subtitle-remover']);

// 탭 로딩 fallback
const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    <span className="ml-3 text-gray-400 text-base">로딩 중...</span>
  </div>
);

// ErrorBoundary — lazy 컴포넌트 런타임 에러 + 동적 import 실패 캐치 (react-error-boundary)
function TabErrorFallback({ error: rawError, resetErrorBoundary }: FallbackProps) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  const isChunkError = error.message?.includes('Failed to fetch dynamically imported module')
    || error.message?.includes('Loading chunk')
    || error.message?.includes('Loading CSS chunk');

  const handleHardReload = () => {
    sessionStorage.removeItem('__chunk_reload');
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  };

  return (
    <div className="p-8 text-center">
      <p className="text-red-400 text-lg font-bold mb-2">
        {isChunkError ? '앱 업데이트 감지' : '탭 로딩 오류'}
      </p>
      {isChunkError ? (
        <p className="text-gray-400 text-sm mb-4">
          새 버전이 배포되었습니다. 아래 버튼을 누르면 최신 버전으로 전환됩니다.
        </p>
      ) : (
        <pre className="text-red-300 text-sm bg-red-900/20 p-4 rounded-lg overflow-auto max-h-60 text-left mb-4">
          {error.message}
        </pre>
      )}
      <div className="flex gap-3 justify-center">
        <button
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-semibold"
          onClick={handleHardReload}
        >
          최신 버전으로 새로고침
        </button>
        {!isChunkError && (
          <button
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            onClick={resetErrorBoundary}
          >
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}

function TabErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={TabErrorFallback}
      onError={(rawError) => {
        const error = rawError instanceof Error ? rawError : new Error(String(rawError));
        const isChunkError = error.message?.includes('Failed to fetch dynamically imported module')
          || error.message?.includes('Loading chunk')
          || error.message?.includes('Loading CSS chunk');
        if (isChunkError) {
          sessionStorage.removeItem('__chunk_reload');
        }
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
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
  const showTrialGuide = useUIStore((s) => s.showTrialGuide);

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
  const lastAutoSavedAt = useUIStore((s) => s.lastAutoSavedAt);
  const lightboxUrl = useUIStore((s) => s.lightboxUrl);
  const showFullScriptModal = useUIStore((s) => s.showFullScriptModal);
  const showApiSettings = useUIStore((s) => s.showApiSettings);
  const toast = useUIStore((s) => s.toast);
  const isProcessing = useUIStore((s) => s.isProcessing);
  const processingMessage = useUIStore((s) => s.processingMessage);
  const processingMode = useUIStore((s) => s.processingMode);
  const refreshTrigger = useUIStore((s) => s.refreshTrigger);
  const setProcessing = useUIStore((s) => s.setProcessing);
  const setProcessingMessage = useUIStore((s) => s.setProcessingMessage);
  const toolboxOpen = useUIStore((s) => s.toolboxOpen);
  const postProductionOpen = useUIStore((s) => s.postProductionOpen);

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
    // 정상 로딩 시 청크 리로드 플래그 초기화
    sessionStorage.removeItem('__chunk_reload');
    requestPersistentStorage();
    // [FIX] 앱 시작 시 음악 라이브러리 로드 — 편집실 BGM 패널에서 즉시 트랙 표시
    import('./stores/soundStudioStore').then(({ useSoundStudioStore }) => {
      useSoundStudioStore.getState().loadMusicLibrary();
    }).catch((e) => { logger.trackSwallowedError('App:loadMusicLibrary', e); });

    // [FIX #482] 글로벌 안전망: bare await import() 청크 로드 실패 시 자동 리로드
    const handleChunkRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
      const isChunk = msg.includes('Failed to fetch dynamically imported module')
        || msg.includes('Loading chunk')
        || msg.includes('Loading CSS chunk')
        || msg.includes('error loading dynamically imported module');
      if (isChunk && !sessionStorage.getItem('__chunk_reload')) {
        event.preventDefault();
        sessionStorage.setItem('__chunk_reload', '1');
        window.location.reload();
      }
    };
    window.addEventListener('unhandledrejection', handleChunkRejection);
    return () => window.removeEventListener('unhandledrejection', handleChunkRejection);
  }, []);

  // Auto-save via Zustand store subscriptions
  useAutoSave();
  useViewAlertPolling();

  // [FIX] 앱 시작 시: 빈 임시 프로젝트 정리 → 마지막/최근 프로젝트 복원 → 없으면 1개만 생성
  useEffect(() => {
    const initProject = async () => {
      if (useProjectStore.getState().config) return;

      // 1) 빈 임시 프로젝트 정리 (누적 방지)
      try {
        const { cleanupEmptyProjects } = await import('./services/storageService');
        const lastId = localStorage.getItem('last-project-id');
        const cleaned = await cleanupEmptyProjects(lastId);
        if (cleaned > 0) console.log(`[App] ${cleaned}개 빈 임시 프로젝트 정리됨`);
      } catch (e) { logger.trackSwallowedError('App:initProject/cleanupEmptyProjects', e); }

      // 2) 기존 프로젝트 복원 시도 → 없으면 새로 생성
      const restored = await autoRestoreOrCreateProject();

      // 3) 프로젝트 탭이면 대시보드, 아니면 작업 화면
      const navState = useNavigationStore.getState();
      if (restored && navState.activeTab === 'project' && !navState.showProjectDashboard) {
        navState.goToDashboard();
      }
      if (restored && navState.activeTab !== 'project') {
        navState.leaveDashboard();
      }
    };
    initProject();
  }, []);

  // [UX] 프로젝트 없이 작업 탭 진입 시 복원 (탭 전환 엣지 케이스)
  useEffect(() => {
    if (activeTab !== 'project' && !config) {
      autoRestoreOrCreateProject().then((restored) => {
        if (restored) useNavigationStore.getState().leaveDashboard();
      });
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
        // [FIX #252] Art Style — StoryboardPanel과 완전 동일한 폴백 체인
        // 1순위: 사용자가 스타일 팔레트에서 선택한 값 (useImageVideoStore.style)
        // 2순위: atmosphere (ScriptMode 프리셋 또는 visualTone 자동 저장값)
        // 3순위: detectedStyleDescription (Pro 분석 시 저장된 visualTone)
        // 4순위: 캐릭터 분석 예술 스타일 (analysisStyle) — 캐릭터 그림체 보존
        // 5순위: "Cinematic" 기본값
        const userStyle = useImageVideoStore.getState().style;
        const userSelectedStyle = userStyle && userStyle !== 'custom';
        const appCharArtStyle = resolvedConfig.characters?.find(c => c.analysisStyle)?.analysisStyle || '';
        // [FIX] 캐릭터 analysisStyle이 있으면 atmosphere/detectedStyle보다 우선 — 그림체 보존
        const effectiveStyle = userSelectedStyle
            ? userStyle
            : (appCharArtStyle.trim() !== "")
              ? appCharArtStyle
              : (resolvedConfig.atmosphere && resolvedConfig.atmosphere.trim() !== "")
                ? resolvedConfig.atmosphere
                : (resolvedConfig.detectedStyleDescription && resolvedConfig.detectedStyleDescription.trim() !== "")
                  ? resolvedConfig.detectedStyleDescription
                  : "Cinematic";
        // 사용자가 비주얼 미선택 + 캐릭터 아트 스타일로 폴백된 경우 → 캐릭터 그림체 보존 모드
        const appPreserveCharStyle = !userSelectedStyle && appCharArtStyle.trim() !== '' && effectiveStyle === appCharArtStyle;

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

            const liveStyleRefs = useImageVideoStore.getState().styleReferenceImages?.filter(Boolean) || [];
            const globalStyleRefs = liveStyleRefs.length > 0
                ? liveStyleRefs
                : (resolvedConfig.styleReferenceImages?.filter(Boolean) || []);

            // [NEW] Combine all character analysis results for visual consistency
            // [FIX #319] 캐릭터 이름(label)을 분석 결과에 포함하여 장면별 매칭 정확도 향상
            const combinedCharAnalysis = resolvedConfig.characters
                ?.filter(c => c.analysisResult)
                .map((c, i) => `[Character ${i + 1}: "${c.label}"]\n${c.analysisResult}`)
                .join('\n\n') || undefined;

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
                resolvedConfig.enableWebSearch,
                appPreserveCharStyle,
                globalStyleRefs,
            );
        }

        const imageUrl = result.url;
        const isFallback = result.isFallback;

        // [FIX #531] Google Imagen/Whisk (무료 모델) 성공 시 비용 $0 — 폴백(NanoBanana 2)만 과금
        const isFreeModel = resolvedConfig.imageModel === ImageModel.GOOGLE_IMAGEN || resolvedConfig.imageModel === ImageModel.GOOGLE_WHISK;
        const basePrice = (isFreeModel && !isFallback) ? 0 : (isFallback ? PRICING.IMAGE_GENERATION_FALLBACK : PRICING.IMAGE_GENERATION);
        addCost(basePrice * costMultiplier, 'image');

        // Show image immediately (may be Base64)
        setScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            imageUrl,
            previousImageUrl: s.imageUrl || undefined,  // [#492] 이전 이미지 백업
            isGeneratingImage: false,
            isNativeHQ: useNativeHQ,
            visualPrompt: feedback ? feedback : s.visualPrompt,
            generationStatus: undefined,
            imageUpdatedAfterVideo: !!s.videoUrl,
        } : s));

        // Background: persist to Cloudinary (Base64 → URL)
        persistImage(imageUrl).then(persistedUrl => {
            if (persistedUrl !== imageUrl) {
                setScenes(prev => prev.map(s => s.id === sceneId && s.imageUrl === imageUrl ? { ...s, imageUrl: persistedUrl } : s));
            }
        });

        // [v4.5] 스마트 제목 — 첫 이미지 생성 시
        const ps = useProjectStore.getState();
        const style = ps.config?.atmosphere || ps.config?.selectedVisualStyle || '';
        const sceneCount = ps.scenes.filter(s => s.imageUrl).length;
        ps.smartUpdateTitle('image-video', style ? `${style} ${sceneCount}컷` : `${sceneCount}컷 생성`);
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
            showToast("⚠️ 라오장 통합 API Key가 없습니다. 좌측 메뉴 → API 설정에서 키를 입력해주세요.", 5000);
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
             showToast("브라우저 저장소 공간이 부족합니다. 기존 프로젝트를 삭제해주세요.", 5000);
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

          // [CRITICAL] 예상 컷수 결정 — 사용자 수동 설정 최우선, Pro 분석 차선, Flash UI 추정 폴백
          const userTarget = useImageVideoStore.getState().targetSceneCount;
          const proEstimate = typeof contextData.estimatedSceneCount === 'number' && contextData.estimatedSceneCount > 0 ? contextData.estimatedSceneCount : 0;
          const uiEstimate = newConfig.estimatedScenes && newConfig.estimatedScenes > 0 ? newConfig.estimatedScenes : 0;
          const proSceneCount = (userTarget && userTarget > 0 ? userTarget : null) || proEstimate || uiEstimate || undefined;
          console.log(`[Context] ★ Final targetSceneCount: ${proSceneCount} (사용자설정: ${userTarget}, Pro분석: ${proEstimate}, UI미리보기: ${uiEstimate})`);

          setProcessingMessage("🎬 장면별 연출 및 비유/서사 구분 분석 중...");
          // [CRITICAL FIX] atmosphere가 비어있으면 visualTone을 config에 저장하여
          // 나중에 StoryboardPanel에서 개별 재생성 시 동일한 스타일을 사용할 수 있게 함
          const resolvedAtmosphere = newConfig.atmosphere || contextData.visualTone || "Cinematic";
          if (!newConfig.atmosphere && contextData.visualTone) {
              finalConfig.atmosphere = contextData.visualTone;
          }
          // [v4.7] extractedCharacters 저장
          if (contextData.characters) {
              finalConfig.extractedCharacters = contextData.characters;
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
              proSceneCount, // [NEW] Pro/Thinking이 산출한 정밀 컷수 우선 사용
              newConfig.dialogueTone, // [v4.7] 대사 톤
              newConfig.extractedCharacters || contextData.characters, // [v4.7] 캐릭터 프로필
              newConfig.referenceDialogue // [v4.7] 참조 대사
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
                  seedanceDuration: '8',
                  grokSpeechMode: newConfig.dialogueMode ?? false,
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
        showToast(`처리 중 오류: ${errorMsg}`, 5000);
        setProcessing(false);
    } 
  };
  
  // handleToggleNativeHQ, handleToggleInfographic, handleToggleLoopMode, handleCancelImageGeneration
  // — moved to StoryboardScene via useProjectStore.updateScene()

  // A-2: useCallback — only depends on setScenes (stable store action)
  const handleManualImageUpload = useCallback(async (sceneId: string, file: File) => {
      // Show immediately with ObjectURL for fast preview
      const objectUrl = URL.createObjectURL(file);
      logger.registerBlobUrl(objectUrl, 'image', 'App:handleManualImageUpload');
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
          // [FIX #252] 사용자 스타일 1순위 — handleGenerateImage와 동일한 폴백 체인
          const autoUserStyle = useImageVideoStore.getState().style;
          // [FIX] 캐릭터 analysisStyle 우선 — 그림체 보존 + 누락 수정
          const autoPromptChars = useImageVideoStore.getState().characters;
          const autoPromptCharArtStyle = autoPromptChars.find(c => c.analysisStyle)?.analysisStyle || '';
          const autoStyle = (autoUserStyle && autoUserStyle !== 'custom')
              ? autoUserStyle
              : (autoPromptCharArtStyle.trim() !== '')
                ? autoPromptCharArtStyle
                : (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
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
          showToast(`프롬프트 자동 변환 실패: ${e.message}`, 4000);
      }
  }, [setScenes]);

  // A-2: useCallback with getState() to avoid deps on config
  const handleInjectCharacter = useCallback((sceneId: string) => {
      const currentConfig = useProjectStore.getState().config;
      const charRef = currentConfig?.characterPublicUrl || currentConfig?.characterImage;
      if (!charRef) { showToast("캐릭터가 없습니다.", 3000); return; }
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
      // 프로젝트 상태에 따라 적절한 탭으로 이동 (구버전 레거시 UI 방지)
      if (project.scenes.length > 0) {
        useNavigationStore.getState().setActiveTab('edit-room');
      } else {
        useNavigationStore.getState().setActiveTab('channel-analysis');
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
                          logger.registerBlobUrl(imageUrl, 'image', 'App:importZipProject');
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

          if (jsonData) {
              handleLoadProject(jsonData);
          } else {
              console.error('[Import] projectData를 찾을 수 없음', {
                  hasScriptTag: !!doc.getElementById('project-data'),
                  totalScripts: doc.querySelectorAll('script').length,
                  fileSize: text.length,
              });
              showToast('이 파일에서 프로젝트 데이터를 찾을 수 없습니다. 이 앱에서 내보낸 프로젝트 파일(.html 또는 .zip)만 불러올 수 있습니다.', 5000);
          }
      } catch (e) {
          console.error("Import failed", e);
          showToast("파일을 불러오는데 실패했습니다. 올바른 프로젝트 파일인지 확인해주세요.", 4000);
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
                      <button onClick={() => { navigator.clipboard.writeText(origText).then(() => { showToast("전체 대본이 클립보드에 복사되었습니다!", 2000); }); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm">📋 원본 복사</button>
                      <button onClick={() => downloadTextFile(origText, 'script_original.txt')} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-bold text-sm">📥 원본 다운로드</button>
                      {hasKO && <>
                          <button onClick={() => { navigator.clipboard.writeText(koText).then(() => { showToast("한국어 대본이 클립보드에 복사되었습니다!", 2000); }); }} className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-bold text-sm">📋 한글 복사</button>
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
      {/* [v4.5] 상단 헤더 바 (전체 너비) */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 z-40 flex items-center px-6 gap-4">
        <h1
          onClick={goToDashboard}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToDashboard(); } }}
          role="button"
          tabIndex={0}
          aria-label="홈으로 돌아가기"
          className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 whitespace-nowrap cursor-pointer hover:from-blue-300 hover:to-purple-400 transition-all select-none focus:outline-none focus:ring-2 focus:ring-blue-400/50 rounded"
          title="홈으로 돌아가기"
        >
          All In One Production <span className="text-sm text-gray-400 ml-1 font-medium">v4.5</span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <CostDashboard />
          {authUser ? (
            <>
              {/* 체험판 배너 */}
              {authUser.tier === 'trial' && !isTrialExpired(authUser) && (
                <button
                  onClick={() => useUIStore.getState().setShowTrialGuide(true)}
                  className="px-3 py-1.5 bg-amber-900/40 hover:bg-amber-900/60 border border-amber-500/50 text-amber-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  체험판 {getTrialDaysLeft(authUser)}일 남음
                </button>
              )}
              {authUser.tier === 'trial' && isTrialExpired(authUser) && (
                <span className="px-3 py-1.5 bg-red-900/40 border border-red-500/50 text-red-300 rounded-lg text-xs font-bold">
                  체험 기간 만료
                </span>
              )}
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
          {/* 도움말 — 로그인 여부 무관, 항상 표시 */}
          <button
            data-tour="help-button"
            onClick={() => useUIStore.getState().setShowHelpGuide(true)}
            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-bold transition-all flex items-center gap-1.5"
          >
            ❓ 도움말
          </button>
        </div>
      </header>

      {/* [REMOVED] 공지 배너 — 2026-03-17 배포 정상화 안내 (기간 만료로 제거) */}

      {/* [v4.5] 헤더 아래: 좌측 사이드바 + 우측 콘텐츠 */}
      <div className="flex pt-16 min-h-screen">
        {/* 좌측 네비게이션 사이드바 */}
        <aside className="fixed top-16 left-0 bottom-0 w-[15.5rem] bg-gray-950 border-r border-gray-800 z-30 flex flex-col py-3 px-3 gap-1 overflow-y-auto">
          {/* 새 프로젝트 버튼 (항상 표시) */}
          <button
            data-tour="new-project"
            onClick={() => {
              localStorage.removeItem('last-project-id');
              goToDashboard();
            }}
            className="flex items-center gap-2 w-full px-4 py-2.5 mb-1 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all shadow-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            새 프로젝트
          </button>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <React.Fragment key={tab.id}>
                <button
                  data-tour={`tab-${tab.id}`}
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

                {/* 대본작성 아래에 후반작업 접이식 그룹 삽입 */}
                {tab.id === 'script-writer' && (() => {
                  const isPostProdOpen = postProductionOpen || POST_PRODUCTION_TAB_IDS.has(activeTab);
                  return (
                    <div className="mt-0.5 mb-0.5">
                      <button
                        data-tour="post-production"
                        onClick={() => useUIStore.getState().setPostProductionOpen(!isPostProdOpen)}
                        className={`flex items-center justify-between w-full px-4 py-3.5 rounded-lg text-base font-semibold transition-all ${
                          POST_PRODUCTION_TAB_IDS.has(activeTab)
                            ? 'text-gray-200 bg-gray-800/40'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🎞️</span>
                          <span>후반작업</span>
                        </div>
                        <span className={`text-xs text-gray-600 transition-transform duration-200 ${isPostProdOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {isPostProdOpen && (
                        <div className="mt-0.5 space-y-0.5 pl-3">
                          {POST_PRODUCTION_TABS.map(pp => {
                            const ppActive = activeTab === pp.id;
                            return (
                              <button
                                key={pp.id}
                                onClick={() => setActiveTab(pp.id)}
                                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                  ppActive
                                    ? pp.activeClass
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                                }`}
                              >
                                <span className="text-base">{pp.icon}</span>
                                <span>{pp.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </React.Fragment>
            );
          })}
          {/* 도구모음 섹션 — 접이식 */}
          {(() => {
            const TOOL_TABS = ['thumbnail-studio', 'character-twist', 'image-script-upload', 'ppt-master', 'detail-page', 'subtitle-remover'];
            const isToolTabActive = TOOL_TABS.includes(activeTab);
            const isToolboxOpen = toolboxOpen || isToolTabActive;
            return (
          <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-600/40">
            <button
              onClick={() => {
                if (isToolboxOpen) {
                  useUIStore.getState().setToolboxOpen(false);
                  if (isToolTabActive) setActiveTab('project');
                } else {
                  useUIStore.getState().setToolboxOpen(true);
                }
              }}
              data-tour="toolbox"
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
                <button
                  onClick={() => setActiveTab('subtitle-remover')}
                  className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === 'subtitle-remover'
                      ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="text-base">🧹</span>
                  <span>자막/워터마크 제거</span>
                </button>
              </div>
            )}
          </div>
            );
          })()}
          {/* [FIX #175-6] 디버그 로그 숨김 — 피드백 전송 시 자동 포함되므로 노출 불필요 */}
          {/* [FIX #148] 자동 저장 상태 표시 */}
          {lastAutoSavedAt && (
            <div className="mt-auto pt-3 px-4 pb-2 text-xs text-gray-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse" />
              자동 저장됨 {new Date(lastAutoSavedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="ml-[15.5rem] flex-1 pb-12 px-8">
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

          {/* 전체 공지 배너 — All In One Helper 출시 알림 */}
          <AnnouncementBanner />

          {/* [v4.5] 탭 기반 라우팅 — Motion 애니메이션 적용 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
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
          ) : activeTab === 'subtitle-remover' ? (
              <TabErrorBoundary><Suspense fallback={<TabFallback />}><SubtitleRemoverTab /></Suspense></TabErrorBoundary>
          ) : /* project tab (default) */ showProjectDashboard ? (
              /* [v4.5] 프로젝트 대시보드 — 카드 그리드 */
              <Suspense fallback={<TabFallback />}>
                <ProjectDashboard onSelectProject={handleLoadProject} onNewProject={handleNewProject} onImportProject={handleImportProject} refreshTrigger={refreshTrigger} />
              </Suspense>
          ) : showConfigForm ? (
              <ConfigForm onNext={handleConfigSubmit} isLoading={isProcessing} onSetProcessing={setProcessing} onCostAdd={addCost} onSaveDraft={handleSaveDraft} initialDraft={null} />
          ) : (
              /* [v4.5 FIX] 구버전 레거시 UI 대신 대시보드로 자동 복귀 */
              <Suspense fallback={<TabFallback />}>
                <ProjectDashboard onSelectProject={handleLoadProject} onNewProject={handleNewProject} onImportProject={handleImportProject} refreshTrigger={refreshTrigger} />
              </Suspense>
          )}
            </motion.div>
          </AnimatePresence>
      </main>
      </div>{/* flex wrapper 닫기 */}

      <FeedbackModal />
      <FeedbackHistoryPanel />
      <FeedbackNotificationBanner />
      <SmartErrorBanner />
      {authUser && (
        <ProfileModal
          authUser={authUser}
          onUserUpdate={setAuthUser}
          onAccountDeleted={() => setAuthUser(null)}
        />
      )}

      {/* 체험판 가이드 */}
      {authUser?.tier === 'trial' && showTrialGuide && (
        <TrialGuideModal
          user={authUser}
          onClose={() => useUIStore.getState().setShowTrialGuide(false)}
          onSaveGeminiKey={(key) => {
            localStorage.setItem('CUSTOM_GOOGLE_GEMINI_KEY', key);
            showToast('Google Gemini API 키가 저장되었습니다.', 3000);
          }}
        />
      )}

      {/* 도움말 */}
      <HelpGuideModal />

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

      {/* 전역 Toast 알림 — Sonner */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(17, 24, 39, 0.95)',
            color: '#fff',
            border: '1px solid rgba(75, 85, 99, 0.5)',
            backdropFilter: 'blur(8px)',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
        theme="dark"
      />

      {/* 프로그레스 Toast (다운로드 진행률) */}
      {toast && toast.show && toast.total && toast.total > 0 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none" style={{ animation: 'toastIn 0.3s ease-out' }}>
          <div className="bg-gray-900/95 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-gray-600/50 backdrop-blur-sm text-sm font-medium min-w-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              <span>{toast.message}</span>
              <span className="ml-auto text-xs text-gray-400">{toast.current ?? 0}/{toast.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-violet-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round(((toast.current ?? 0) / toast.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
