import { create } from 'zustand';
import { logger } from '../services/LoggerService';
import {
  UploadStep,
  UploadPlatform,
  YouTubeAuthState,
  TikTokAuthState,
  InstagramAuthState,
  ThreadsAuthState,
  NaverClipAuthState,
  PlatformUploadProgress,
  VideoMetadata,
  UploadSettings,
  ExportConfig,
  OutputMode,
  ShoppingTag,
} from '../types';

interface UploadStore {
  // State
  currentStep: UploadStep;
  selectedPlatforms: UploadPlatform[];
  youtubeAuth: YouTubeAuthState;
  tiktokAuth: TikTokAuthState;
  instagramAuth: InstagramAuthState;
  threadsAuth: ThreadsAuthState;
  naverClipAuth: NaverClipAuthState;
  platformProgress: PlatformUploadProgress[];
  metadata: VideoMetadata | null;
  thumbnailUrl: string | null;
  uploadSettings: UploadSettings;
  exportConfig: ExportConfig;
  isUploading: boolean;
  uploadProgress: number;  // 0~100 (전체 평균)
  outputMode: OutputMode;
  isGeneratingMetadata: boolean;
  shoppingTags: ShoppingTag[];
  videoFile: File | null;
  videoUrl: string | null;      // blob URL for preview
  videoDuration: number | null;
  videoSize: number | null;

  // Actions
  setStep: (step: UploadStep) => void;
  togglePlatform: (platform: UploadPlatform) => void;
  setYoutubeAuth: (auth: Partial<YouTubeAuthState>) => void;
  setTiktokAuth: (auth: Partial<TikTokAuthState>) => void;
  setInstagramAuth: (auth: Partial<InstagramAuthState>) => void;
  setThreadsAuth: (auth: Partial<ThreadsAuthState>) => void;
  setNaverClipAuth: (auth: Partial<NaverClipAuthState>) => void;
  clearPlatformAuth: (platform: UploadPlatform) => void;
  setMetadata: (metadata: VideoMetadata | null) => void;
  setThumbnail: (url: string | null) => void;
  setUploadSettings: (settings: Partial<UploadSettings>) => void;
  setExportConfig: (config: Partial<ExportConfig>) => void;
  setOutputMode: (mode: OutputMode) => void;
  startUpload: () => void;
  setPlatformProgress: (platform: UploadPlatform, progress: Partial<PlatformUploadProgress>) => void;
  setUploadProgress: (progress: number) => void;
  finishUpload: () => void;
  resetUpload: () => void;
  setIsGeneratingMetadata: (v: boolean) => void;
  setShoppingTags: (tags: ShoppingTag[]) => void;
  updateShoppingTag: (index: number, partial: Partial<ShoppingTag>) => void;
  removeShoppingTag: (index: number) => void;
  addShoppingTag: (tag: ShoppingTag) => void;
  setVideoFile: (file: File | null) => void;
  setVideoDuration: (d: number) => void;
  clearVideo: () => void;
}

const DEFAULT_YT_AUTH: YouTubeAuthState = { isConnected: false };
const DEFAULT_TT_AUTH: TikTokAuthState = { isConnected: false };
const DEFAULT_IG_AUTH: InstagramAuthState = { isConnected: false };
const DEFAULT_TH_AUTH: ThreadsAuthState = { isConnected: false };
const DEFAULT_NC_AUTH: NaverClipAuthState = { isConnected: false };

// --- localStorage 인증 영속화 ---
const AUTH_STORAGE_KEY = 'UPLOAD_PLATFORM_AUTH';

interface SavedAuth {
  youtubeAuth: YouTubeAuthState;
  tiktokAuth: TikTokAuthState;
  instagramAuth: InstagramAuthState;
  threadsAuth: ThreadsAuthState;
  naverClipAuth: NaverClipAuthState;
  selectedPlatforms: UploadPlatform[];
}

const loadSavedAuth = (): Partial<SavedAuth> => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<SavedAuth>;
  } catch (e) { logger.trackSwallowedError('UploadStore:loadSavedAuth', e); return {}; }
};

const saveAuthToStorage = (data: SavedAuth) => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch (e) { logger.trackSwallowedError('UploadStore:saveAuthToStorage', e); }
};

const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  privacy: 'private',
  madeForKids: false,
  notifySubscribers: true,
  categoryId: '22',
  defaultLanguage: 'ko',
  tiktokPrivacy: 'SELF_ONLY',
  tiktokDisableDuet: false,
  tiktokDisableStitch: false,
  tiktokDisableComment: false,
  threadsReplyControl: 'everyone',
};

const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  outputMode: 'mp4',
  includeNarration: true,
  includeSubtitles: true,
  includeImageEffects: true,
};

const _saved = loadSavedAuth();

const INITIAL_STATE = {
  currentStep: 'metadata' as UploadStep,
  selectedPlatforms: _saved.selectedPlatforms ?? ['youtube'] as UploadPlatform[],
  youtubeAuth: _saved.youtubeAuth ?? { ...DEFAULT_YT_AUTH },
  tiktokAuth: _saved.tiktokAuth ?? { ...DEFAULT_TT_AUTH },
  instagramAuth: _saved.instagramAuth ?? { ...DEFAULT_IG_AUTH },
  threadsAuth: _saved.threadsAuth ?? { ...DEFAULT_TH_AUTH },
  naverClipAuth: _saved.naverClipAuth ?? { ...DEFAULT_NC_AUTH },
  platformProgress: [] as PlatformUploadProgress[],
  metadata: null as VideoMetadata | null,
  thumbnailUrl: null as string | null,
  uploadSettings: { ...DEFAULT_UPLOAD_SETTINGS },
  exportConfig: { ...DEFAULT_EXPORT_CONFIG },
  isUploading: false,
  uploadProgress: 0,
  outputMode: 'mp4' as OutputMode,
  isGeneratingMetadata: false,
  shoppingTags: [] as ShoppingTag[],
  videoFile: null as File | null,
  videoUrl: null as string | null,
  videoDuration: null as number | null,
  videoSize: null as number | null,
};

export const useUploadStore = create<UploadStore>((set) => ({
  ...INITIAL_STATE,

  setStep: (step) => { logger.trackTabVisit('upload', step); set({ currentStep: step }); },

  togglePlatform: (platform) => set((state) => {
    const has = state.selectedPlatforms.includes(platform);
    if (has && state.selectedPlatforms.length <= 1) return {};
    const next = has
      ? state.selectedPlatforms.filter(p => p !== platform)
      : [...state.selectedPlatforms, platform];
    saveAuthToStorage({ youtubeAuth: state.youtubeAuth, tiktokAuth: state.tiktokAuth, instagramAuth: state.instagramAuth, threadsAuth: state.threadsAuth, naverClipAuth: state.naverClipAuth, selectedPlatforms: next });
    return { selectedPlatforms: next };
  }),

  setYoutubeAuth: (auth) => set((state) => {
    const next = { ...state.youtubeAuth, ...auth };
    saveAuthToStorage({ youtubeAuth: next, tiktokAuth: state.tiktokAuth, instagramAuth: state.instagramAuth, threadsAuth: state.threadsAuth, naverClipAuth: state.naverClipAuth, selectedPlatforms: state.selectedPlatforms });
    return { youtubeAuth: next };
  }),

  setTiktokAuth: (auth) => set((state) => {
    const next = { ...state.tiktokAuth, ...auth };
    saveAuthToStorage({ youtubeAuth: state.youtubeAuth, tiktokAuth: next, instagramAuth: state.instagramAuth, threadsAuth: state.threadsAuth, naverClipAuth: state.naverClipAuth, selectedPlatforms: state.selectedPlatforms });
    return { tiktokAuth: next };
  }),

  setInstagramAuth: (auth) => set((state) => {
    const next = { ...state.instagramAuth, ...auth };
    saveAuthToStorage({ youtubeAuth: state.youtubeAuth, tiktokAuth: state.tiktokAuth, instagramAuth: next, threadsAuth: state.threadsAuth, naverClipAuth: state.naverClipAuth, selectedPlatforms: state.selectedPlatforms });
    return { instagramAuth: next };
  }),

  setThreadsAuth: (auth) => set((state) => {
    const next = { ...state.threadsAuth, ...auth };
    saveAuthToStorage({ youtubeAuth: state.youtubeAuth, tiktokAuth: state.tiktokAuth, instagramAuth: state.instagramAuth, threadsAuth: next, naverClipAuth: state.naverClipAuth, selectedPlatforms: state.selectedPlatforms });
    return { threadsAuth: next };
  }),

  setNaverClipAuth: (auth) => set((state) => {
    const next = { ...state.naverClipAuth, ...auth };
    saveAuthToStorage({ youtubeAuth: state.youtubeAuth, tiktokAuth: state.tiktokAuth, instagramAuth: state.instagramAuth, threadsAuth: state.threadsAuth, naverClipAuth: next, selectedPlatforms: state.selectedPlatforms });
    return { naverClipAuth: next };
  }),

  clearPlatformAuth: (platform) => set((state) => {
    const yt = platform === 'youtube' ? { ...DEFAULT_YT_AUTH } : state.youtubeAuth;
    const tt = platform === 'tiktok' ? { ...DEFAULT_TT_AUTH } : state.tiktokAuth;
    const ig = platform === 'instagram' ? { ...DEFAULT_IG_AUTH } : state.instagramAuth;
    const th = platform === 'threads' ? { ...DEFAULT_TH_AUTH } : state.threadsAuth;
    const nc = platform === 'naver-clip' ? { ...DEFAULT_NC_AUTH } : state.naverClipAuth;
    saveAuthToStorage({ youtubeAuth: yt, tiktokAuth: tt, instagramAuth: ig, threadsAuth: th, naverClipAuth: nc, selectedPlatforms: state.selectedPlatforms });
    if (platform === 'youtube') return { youtubeAuth: yt };
    if (platform === 'tiktok') return { tiktokAuth: tt };
    if (platform === 'threads') return { threadsAuth: th };
    if (platform === 'naver-clip') return { naverClipAuth: nc };
    return { instagramAuth: ig };
  }),

  setMetadata: (metadata) => set({ metadata }),

  setThumbnail: (url) => set({ thumbnailUrl: url }),

  setUploadSettings: (settings) => set((state) => ({
    uploadSettings: { ...state.uploadSettings, ...settings },
  })),

  setExportConfig: (config) => set((state) => ({
    exportConfig: { ...state.exportConfig, ...config },
  })),

  setOutputMode: (mode) => set((state) => ({
    outputMode: mode,
    exportConfig: { ...state.exportConfig, outputMode: mode },
  })),

  startUpload: () => set((state) => ({
    isUploading: true,
    uploadProgress: 0,
    platformProgress: state.selectedPlatforms.map(p => ({
      platform: p,
      progress: 0,
      status: 'uploading' as const,
    })),
  })),

  setPlatformProgress: (platform, progress) => set((state) => ({
    platformProgress: state.platformProgress.map(p =>
      p.platform === platform ? { ...p, ...progress } : p
    ),
  })),

  setUploadProgress: (progress) => set({ uploadProgress: Math.min(100, Math.max(0, progress)) }),

  finishUpload: () => set({ isUploading: false, uploadProgress: 100 }),

  setIsGeneratingMetadata: (v) => set({ isGeneratingMetadata: v }),

  setShoppingTags: (tags) => set({ shoppingTags: tags }),

  updateShoppingTag: (index, partial) => set((state) => ({
    shoppingTags: state.shoppingTags.map((t, i) => i === index ? { ...t, ...partial } : t),
  })),

  removeShoppingTag: (index) => set((state) => ({
    shoppingTags: state.shoppingTags.filter((_, i) => i !== index),
  })),

  addShoppingTag: (tag) => set((state) => ({
    shoppingTags: [...state.shoppingTags, tag],
  })),

  setVideoFile: (file) => set((state) => {
    if (state.videoUrl) {
      logger.unregisterBlobUrl(state.videoUrl);
      URL.revokeObjectURL(state.videoUrl);
    }
    if (!file) return { videoFile: null, videoUrl: null, videoDuration: null, videoSize: null };
    const videoUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(videoUrl, 'video', 'uploadStore:setVideoFile', file.size / (1024 * 1024));
    return { videoFile: file, videoUrl, videoSize: file.size, videoDuration: null };
  }),

  setVideoDuration: (d) => set({ videoDuration: d }),

  clearVideo: () => set((state) => {
    if (state.videoUrl) {
      logger.unregisterBlobUrl(state.videoUrl);
      URL.revokeObjectURL(state.videoUrl);
    }
    return { videoFile: null, videoUrl: null, videoDuration: null, videoSize: null };
  }),

  resetUpload: () => set((state) => {
    if (state.videoUrl) {
      logger.unregisterBlobUrl(state.videoUrl);
      URL.revokeObjectURL(state.videoUrl);
    }
    return {
      ...INITIAL_STATE,
      youtubeAuth: state.youtubeAuth,
      tiktokAuth: state.tiktokAuth,
      instagramAuth: state.instagramAuth,
      threadsAuth: state.threadsAuth,
      naverClipAuth: state.naverClipAuth,
    };
  }),
}));
