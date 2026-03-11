
export enum FeedbackType {
    BUG = 'bug',
    ERROR = 'error',
    SUGGESTION = 'suggestion',
    OTHER = 'other'
}

export interface FeedbackScreenshot {
    name: string;
    base64: string;      // data URI (data:image/png;base64,...)
    mimeType: string;     // image/png, image/jpeg, etc.
}

export interface FeedbackData {
    type: FeedbackType;
    message: string;
    email?: string;
    timestamp: number;
    userAgent: string;
    appVersion: string;
    currentProjectId?: string;
    screenshots?: FeedbackScreenshot[];
    userDisplayName?: string;
    debugLogs?: string;
    environmentInfo?: string;
}

export enum AspectRatio {
  SQUARE = '1:1',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
  CLASSIC = '4:3'
}

export enum VoiceName {
  KORE = 'Kore',
  PUCK = 'Puck',
  CHARON = 'Charon',
  FENRIR = 'Fenrir',
  ZEPHYR = 'Zephyr'
}

export enum ImageModel {
  FLASH = 'model_std_flash', // Obfuscated: Prevents Cloud Run auto-key generation
  NANO_COST = 'model_pro_cost', // Obfuscated
  NANO_SPEED = 'model_pro_speed' // Obfuscated
}

export enum VideoModel {
  VEO = 'veo-3.1-evolink', // [UPDATED] Evolink Veo 3.1 Fast 1080p
  GROK = 'grok',           // Kie Grok
  // VEO_FAST = 'veo-3.1-fast', // [DEPRECATED] 720p — Evolink 1080p로 통합
  VEO_QUALITY = 'veo-3.1-quality' // Legacy / Compat → VEO로 매핑
}

export interface VideoTaskParams {
    prompt: string;
    imageUrl: string;
    aspectRatio: AspectRatio;
    cameraAngle?: string;
    cameraMovement?: string;
    requiresTextRendering?: boolean;
    isSafeRetry?: boolean;
    isLoop?: boolean;
    // Grok-specific
    useTopaz?: boolean;
    atmosphere?: string;
    duration?: string;
    speechMode?: boolean;
    generatedDialogue?: string;
    generatedSfx?: string;
    // Veo-specific
    isArtistic?: boolean;
    mode?: VideoModel;
    // Cultural context for accurate visual grounding (era, culture, location)
    culturalContext?: string;
    // REMAKE-specific
    endImageUrl?: string;  // FIRST_AND_LAST_FRAMES_2_VIDEO용 끝 프레임
    isRemake?: boolean;    // REMAKE 모드 플래그
}

export interface VideoProvider {
    create(params: VideoTaskParams): Promise<string>;
    poll(taskId: string, signal?: AbortSignal, onProgress?: (p: number) => void): Promise<string>;
    cancel(taskId: string): Promise<void>;
}

export enum VideoFormat {
  LONG = 'long-form',
  SHORT = 'short-form',
  NANO = 'nano-form',
  MANUAL = 'manual'
}

export enum CompositionMode {
  NEWS_ANCHOR = 'NEWS_ANCHOR',
  CELEBRITY_SOLO = 'CELEBRITY_SOLO',
  SPLIT_SCREEN = 'SPLIT_SCREEN',
  POV_OBSERVER = 'POV_OBSERVER',
  HANDHELD_CLUTCH = 'HANDHELD_CLUTCH',
  EXTREME_CLOSEUP = 'EXTREME_CLOSEUP',
  WIDE_ESTABLISH = 'WIDE_ESTABLISH',
  PRESENTER_TALK = 'PRESENTER_TALK'
}

export enum SceneType {
  PRESENTER = 'PRESENTER', // Character focused
  SIMULATION = 'SIMULATION' // Object/Physics focused (No character)
}

export enum CharacterAppearance {
  AUTO = 'AUTO',
  ALWAYS = 'ALWAYS',
  MINIMAL = 'MINIMAL'
}

export type CreationMode = 'STRICT' | 'HYBRID' | 'CREATIVE';

export interface CompositionConfig {
    x: number;
    y: number;
    scale: number;
    textStyle?: 'WARNING' | 'LUXURY' | 'CLEAN' | 'EMOTIONAL';
}

export interface Scene {
  id: string;
  scriptText: string;
  visualPrompt: string;
  visualDescriptionKO: string;
  characterPresent: boolean;
  characterAction?: string;
  
  // [NEW] Smart Casting & Entity Logic
  castType?: 'MAIN' | 'KEY_ENTITY' | 'EXTRA' | 'NOBODY'; // 배역 타입
  entityName?: string; // 실존 인물/브랜드 이름 (예: Donald Trump)
  entityVisualContext?: string; // 구글 검색 기반 외모 묘사
  // [NEW] KEY_ENTITY 연출 구도 — AUTO 모드에서 유명인/브랜드/장소 등장 시 다채로운 연출 강제
  entityComposition?: 'ENTITY_SOLO' | 'ENTITY_WITH_MAIN' | 'MAIN_OBSERVING' | 'ENTITY_FG_MAIN_BG' | 'MAIN_FG_ENTITY_BG';
  
  temporalContext?: 'PRESENT' | 'PAST' | 'FUTURE';

  // [NEW] Per-scene contextual grounding (장면별 맥락)
  sceneLocation?: string;  // "Forbidden City, Beijing", "Victorian London"
  sceneEra?: string;       // "Qing Dynasty", "1800s Industrial Revolution"
  sceneCulture?: string;   // "Chinese Imperial", "British Industrial"

  sceneType?: SceneType;
  physicsRules?: string; 
  visualPeakTime?: number; 
  endTime?: number; 
  
  requiresTextRendering?: boolean;
  textToRender?: string;
  fontStyle?: string; 
  
  compositionMode?: CompositionMode;
  compositionConfig?: CompositionConfig;
  
  subjectFocus?: string;
  isProductFocus?: boolean;
  keyVisual?: string;
  
  cameraAngle?: string; 
  cameraMovement?: string; 
  shotSize?: string; 
  imageUrl?: string;
  
  referenceImage?: string; 

  sourceFrameUrl?: string;
  endFrameUrl?: string;
  startFrameUrl?: string;        // 장면 시작 프레임 (unedited, 원본)
  editedStartFrameUrl?: string;  // 편집된 시작 프레임 (for FIRST_AND_LAST_FRAMES_2_VIDEO)
  editedEndFrameUrl?: string;    // 편집된 끝 프레임 (for FIRST_AND_LAST_FRAMES_2_VIDEO)
  
  videoUrl?: string;
  videoModelUsed?: VideoModel;
  generationTaskId?: string;
  
  isGeneratingImage: boolean;
  generationCancelled?: boolean; // BUG#8: 이미지 생성 취소 플래그 (API 완료 후 결과 폐기용)
  generationStatus?: string;
  isGeneratingVideo: boolean;
  isUpscaling?: boolean;
  isUpscaled?: boolean;
  isNativeHQ?: boolean;
  isInfographic?: boolean; 
  isLoopMode?: boolean; 
  
  progress?: number; 
  videoGenerationError?: string;

  sourceVideoUrl?: string;  // V2V 원본 영상 Cloudinary URL

  v2vSegmentIndex?: number;      // 0-based 구간 순서
  v2vTotalSegments?: number;     // 전체 구간 수
  v2vSegmentStartSec?: number;   // 구간 시작 초
  v2vSegmentEndSec?: number;     // 구간 끝 초

  isUserEditedPrompt?: boolean; // [FIX] True when user manually edited the visualPrompt (not AI-generated)
  isPromptFiltered?: boolean; // 금칙어 필터링된 프롬프트 표시

  generatedSfx?: string;
  generatedDialogue?: string;

  // [v4.6] 장면별 사운드 디자인
  bgmUrl?: string;               // 장면 배경음악 URL
  bgmPrompt?: string;            // BGM 생성 프롬프트
  sfxUrl?: string;               // 장면 효과음 URL
  sfxPrompt?: string;            // SFX 생성 프롬프트
  soundMood?: string;            // 장면 사운드 분위기 (AI 추천용)

  grokDuration?: '6' | '10' | '15';
  grokSpeechMode?: boolean;

  /** 커뮤니티 미디어 (밈/짤/일러스트/효과음) — 기존 이미지 대신 사용 */
  communityMediaItem?: CommunityMediaItem;

  startTime?: number;
  endTimeStamp?: number;
  audioScript?: string;
  audioUrl?: string;              // 개별 장면 오디오 blob URL (ScriptLine.audioUrl에서 전송)
  audioDuration?: number;         // 장면 오디오 길이 (초)
  scriptTextKO?: string; // Korean translation (for non-Korean scripts)
}

export interface Thumbnail {
  id: string;
  textOverlay: string;
  fullTitle?: string;
  visualDescription: string;
  imageUrl?: string;
  isGenerating: boolean;
  generationStatus?: string; 
  format: 'long' | 'short';
  primaryColorHex?: string;
  secondaryColorHex?: string;
  colorMode?: 'PURE_WHITE' | 'FULL_COLOR' | 'HIGHLIGHT_MIX'; 
  isNativeHQ?: boolean; 
  sentiment?: string; 
  highlight?: string; 
  
  shotSize?: string;
  poseDescription?: string;
  cameraAngle?: string;

  // [NEW] Text Style Editor fields
  textPreset?: string;    // 'sticker' | 'neon' | 'metal' | ... 프리셋 ID
  fontHint?: string;      // 'gothic' | 'serif' | 'brush' | ... 폰트 힌트 ID
  textPosition?: string;  // 'bottom-center' | 'top' | 'right' | 'center'
  textScale?: number;     // 0.8 ~ 2.0
}

export interface ThumbnailTextPreset {
  id: string;
  label: string;
  emoji: string;
  promptFragment: string;
  negativeFragment: string;
}

export interface ThumbnailFontHint {
  id: string;
  label: string;
  promptFragment: string;
}

export interface CharacterReference {
  id: string;
  imageBase64?: string;
  imageUrl?: string;
  label: string;
  analysisResult?: string;
  analysisStyle?: string;
  analysisCharacter?: string;
  isAnalyzing?: boolean;
}

/** 캐릭터 라이브러리: IndexedDB 영구 저장용 */
export interface SavedCharacter {
  id: string;
  imageBase64?: string;
  imageUrl?: string;
  label: string;
  analysisResult?: string;
  analysisStyle?: string;
  analysisCharacter?: string;
  savedAt: number;
}

export interface PreGeneratedImage {
    type: 'INTRO' | 'HIGHLIGHT';
    imageUrl: string;
    prompt: string;
}

export interface CharacterDraft {
    results: { url: string, prompt: string }[];
    selectedIndex: number | null;
    uploadedImage?: string;
    mode?: 'LIBRARY' | 'MIXER' | 'TWIST';
    characterTitle?: string;
}

export interface ScriptModeState {
    script: string;
    atmosphere: string;
    aspectRatio: AspectRatio;
    videoFormat: VideoFormat;
    longFormSplitType?: 'DEFAULT' | 'DETAILED'; // [NEW] Long Form Split Option
    imageModel: ImageModel;
    allowInfographics: boolean;
    characterAppearance: CharacterAppearance;
    smartSplit: boolean;
    isMixedMedia: boolean;
    textForceLock: boolean;
    suppressText?: boolean; // [NEW] No Text Mode
    charImageBase64?: string;
    charPublicUrl?: string;
    prodImageBase64?: string;
    prodPublicUrl?: string;
    styleRefBase64?: string;
    styleDescription: string;
    characterDescription: string;
    estimatedScenes: number; 
}

export interface RemakeStyleAnalysis {
    colorPalette: string;
    renderingTechnique: string;
    lightingDescription: string;
    textureDescription: string;
    artMedium: string;
    overallDescription: string;
}

export interface ProjectConfig {
  mode: 'SCRIPT' | 'REMAKE' | 'CHARACTER' | 'THUMBNAIL';

  script: string;
  manualSegments?: string[];
  
  detectedStyleDescription: string;
  detectedCharacterDescription: string;
  baseAge?: string; 
  globalContext?: string;
  
  detectedLanguage?: string;
  detectedLanguageName?: string; // [NEW] Full English name of the language (e.g., "Korean", "French")
  detectedLocale?: string;
  culturalNuance?: string;

  imageModel: ImageModel;
  videoModel: VideoModel;
  aspectRatio: AspectRatio;
  voice: VoiceName;
  videoFormat: VideoFormat;
  longFormSplitType?: 'DEFAULT' | 'DETAILED'; // [NEW] Long Form Split Option
  creationMode?: CreationMode; 
  
  characterImage?: string;
  characterPublicUrl?: string;
  characters?: CharacterReference[];
  selectedVisualStyle?: string;  // imageVideoStore.style 영속화
  enableWebSearch?: boolean;     // imageVideoStore.enableWebSearch 영속화
  isMultiCharacter?: boolean;    // imageVideoStore.isMultiCharacter 영속화

  productImage?: string;
  productPublicUrl?: string;

  atmosphere?: string;
  
  useTopazForGrok?: boolean;
  
  autoSplitLongScript?: boolean;
  smartSplit?: boolean; 
  textForceLock?: boolean; 
  suppressText?: boolean; // [NEW] No Text Mode
  allowInfographics?: boolean;
  characterAppearance?: CharacterAppearance;
  
  isMixedMedia?: boolean;

  estimatedScenes?: number; // [NEW] 예상 컷수 → parseScriptToScenes에 전달하여 강제 반영
  cachedContextData?: Record<string, any>; // [NEW] Pro/Thinking 분석 결과 캐시 → 프로젝트 생성 시 재활용

  isThumbnailOnlyMode?: boolean; 
  
  preGeneratedImages?: {
      intro?: PreGeneratedImage;
      highlight?: PreGeneratedImage;
  };

  uploadedVideoFile?: File;
  youtubeUrl?: string;  // YouTube 영상 URL
  remakeStrategy?: 'NARRATIVE' | 'VISUAL';
  remakeStyleAnalysis?: RemakeStyleAnalysis;

  v2vPrompt?: string;                    // V2V 변환 프롬프트
  v2vResolution?: '480p' | '720p';       // V2V 해상도
  v2vOriginalDuration?: number;          // 원본 영상 길이 (초)

  characterDraft?: CharacterDraft;
  mergedAudioUrl?: string;        // 전체 병합 오디오 (사운드 스튜디오에서 전송)
  sceneOrder?: string[];           // 편집실 장면 순서 (영속화)
  bgmConfig?: BgmConfig;           // 편집실 BGM 설정 (영속화)

  // [v4.5] 스마트 프로젝트 메타데이터
  lastActiveTab?: string;          // 마지막 활동 탭 ID
  pipelineSteps?: PipelineSteps;   // 파이프라인 진행도
  isManuallyNamed?: boolean;       // 사용자가 수동으로 제목 변경했는지
}

export interface CostStats {
  totalUsd: number;
  imageCount: number;
  videoCount: number;
  analysisCount: number;
  ttsCount: number;
  musicCount: number;
}

// [v4.5] 파이프라인 진행도 추적
export interface PipelineSteps {
  channelAnalysis?: boolean;
  scriptWriting?: boolean;
  soundStudio?: boolean;
  imageVideo?: boolean;
  editRoom?: boolean;
  upload?: boolean;
}

export interface ProjectData {
  id: string;
  title: string;
  config: ProjectConfig;
  scenes: Scene[];
  thumbnails: Thumbnail[];
  fullNarrationText: string;
  createdAt?: number;
  lastModified: number;
  costStats?: CostStats;
}

// ============================================================
// Project Summary (lightweight, for listing only)
// ============================================================

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt?: number;
  lastModified: number;
  mode: string;
  aspectRatio: string;
  atmosphere?: string;
  sceneCount: number;
  completedImages: number;
  completedVideos: number;
  thumbnailUrl?: string;
  estimatedSizeMB?: number;

  // [v4.5] 스마트 프로젝트 확장
  lastActiveTab?: string;            // 마지막 활동 탭
  pipelineSteps?: PipelineSteps;     // 파이프라인 진행도
  isManuallyNamed?: boolean;         // 수동 제목 여부
  sceneImageUrls?: string[];         // Hover Scrub용 장면 이미지 (최대 10개)
}

export interface StorageEstimate {
  usedMB: number;
  totalMB: number;
  percent: number;
}

export interface ExportManifest {
  version: string;
  projectId: string;
  title: string;
  createdAt: number;
  sceneCount: number;
  config: ProjectConfig;
  scenes: Array<{
    id: string;
    index: number;
    scriptText: string;
    visualPrompt: string;
    cameraMovement?: string;
    imageFile?: string;
    videoUrl?: string;
    characterPresent: boolean;
    castType?: string;
    entityName?: string;
  }>;
  thumbnails?: Array<{
    id: string;
    imageFile?: string;
    textOverlay: string;
  }>;
  costStats?: CostStats;
}

// ============================================================
// v4.5 New Types — All In One Production v4.5
// ============================================================

/** 앱 메인 탭 네비게이션 */
export type AppTab = 'project' | 'channel-analysis' | 'script-writer' | 'sound-studio' | 'image-video' | 'edit-room' | 'upload' | 'thumbnail-studio' | 'character-twist' | 'image-script-upload' | 'ppt-master' | 'detail-page' | 'subtitle-remover';

// --- 딸깍 영상 제작 (Shopping Short-form) ---

export type ShoppingSourceType = 'video' | 'coupang';

export interface ShoppingSourceVideo {
  originUrl?: string;
  localFile?: File;
  videoBlob?: Blob;
  videoBlobUrl?: string;
  duration: number;
  width: number;
  height: number;
  thumbnailDataUrl?: string;
}

export interface ShoppingProductAnalysis {
  productName: string;
  category: string;
  targetAudience: string;
  keyFeatures: string[];
  appealPoints: string[];
  // 쿠팡 전용 확장 필드
  price?: number;
  originalPrice?: number;
  discountRate?: string;
  rating?: number;
  reviewCount?: number;
  isRocketDelivery?: boolean;
}

// --- 쿠팡 크롤링 / 파트너스 API ---

export interface CoupangProduct {
  productId: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountRate?: string;
  mainImageUrl: string;
  additionalImages: string[];
  category: string;
  description: string;
  rating: number;
  reviewCount: number;
  isRocketDelivery: boolean;
  productUrl: string;
}

export interface CoupangReview {
  rating: number;
  text: string;
  photoUrls: string[];
  createdAt?: string;
  helpfulCount?: number;
}

export interface CoupangCrawlResult {
  product: CoupangProduct;
  reviews: CoupangReview[];
  topPositiveReviews: string[];
  topNegativeReviews: string[];
  photoReviewKeywords: string[];
}

export interface ShoppingScript {
  id: string;
  title: string;
  sections: {
    hooking: string;
    detail: string;
    romance: string;
    wit: string;
  };
  fullText: string;
  estimatedDuration: number;
}

export type ShoppingCTAPreset = 'comment' | 'profile' | 'link';
export type ShoppingRenderPhase = 'idle' | 'generating-tts' | 'removing-subtitles' | 'overlaying-subtitles' | 'mixing-audio' | 'encoding' | 'done' | 'error';
export type ShoppingWizardStep = 'source' | 'script' | 'render';
export type SubtitleRemovalMethod = 'ghostcut' | 'none';

// --- Detail Page Builder ---
export interface DetailImageSegment {
  id: string;
  title: string;
  logicalSections: string[];
  keyMessage: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerating?: boolean;
  generationStatus?: string;
}

export type PageLength = 5 | 7 | 9 | 'auto' | 'custom';

// --- Media Search (Community/Meme Integration) ---
export type MediaSource = 'klipy' | 'irasutoya' | 'google' | 'myinstants' | 'sfx_lab';
export type MediaType = 'image' | 'sfx';

export interface CompactMediaRecord {
  i: string;       // id
  t: number;       // 0=image, 1=sfx
  u: string;       // thumbnail or url
  U: string;       // original url
  n: string;       // title
  g: string[];     // tags
  f: string;       // format
}

export interface CommunityMediaItem {
  id: string;
  type: MediaType;
  source: MediaSource;
  url: string;
  thumbnailUrl: string;
  title: string;
  tags: string[];
  format: string;
}

/** 채널분석 서브 탭 */
export type ChannelAnalysisSubTab = 'keyword-lab' | 'channel-room' | 'video-room' | 'social-room';

// --- 채널분석: 키워드 랩 ---
export interface KeywordAnalysisResult {
  keyword: string;
  searchVolume: number;        // 0~100
  competition: number;         // 0~100
  opportunityScore: number;    // 0~100
  trend: 'rising' | 'stable' | 'declining';
  totalResults: number;
  avgViews: number;
  channelDiversity: number;    // x/25
  dataSource: 'realtime' | 'cached';
}

export interface RelatedKeyword {
  keyword: string;
  score: number;
}

export interface TopVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelSubscribers: string;
  subscriberCount: number;       // 구독자 수 (raw number)
  thumbnail: string;
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  engagement: number;          // 참여율 %
  viewToSubRatio: number;      // 조회/구독 %
  tags: string[];
  description: string;         // 영상 설명
}

export interface KeywordTag {
  tag: string;
  frequency: number;
}

// --- 채널분석: 채널 분석실 ---
export interface ChannelInfo {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  /** 영상/쇼츠 URL에서 감지된 콘텐츠 포맷 (자동 설정용) */
  detectedFormat?: ContentFormat;
}

export interface ChannelScript {
  videoId: string;
  title: string;
  description: string;
  transcript: string;          // 자막/대본 텍스트
  transcriptSource?: 'caption' | 'description';  // 자막 출처 (caption=실제 자막, description=영상 설명 폴백)
  publishedAt: string;
  viewCount: number;
  duration: string;
  thumbnailUrl?: string;       // 영상 썸네일
  tags?: string[];              // YouTube 태그
}

export interface ChannelGuideline {
  channelName: string;
  tone: string;                // 말투 분석
  structure: string;           // 구조 분석 (기승전결 등)
  topics: string[];            // 주요 주제
  keywords: string[];          // 핵심 키워드
  targetAudience: string;
  avgLength: number;           // 평균 글자수
  hookPattern: string;         // 도입부 패턴
  closingPattern: string;      // 마무리 패턴
  fullGuidelineText: string;   // AI 생성 전체 지침서
  // Style DNA layers (3-Layer analysis)
  visualGuide?: string;        // 시각 스타일 DNA (썸네일/영상 시각 분석)
  editGuide?: string;          // 편집 스타일 DNA (컷 리듬/전환/B-roll)
  audioGuide?: string;         // 오디오 스타일 DNA (BGM/효과음/보이스톤)
  titleFormula?: string;       // 제목/메타데이터 공식 패턴
  audienceInsight?: string;    // 시청자 인사이트 (댓글 분석)
  contentFormat?: ContentFormat; // 감지된 콘텐츠 형식 (롱폼/숏폼)
}

// --- 채널 분석 입력 ---
/** 채널 분석실 입력 소스 */
export type ChannelInputSource = 'youtube' | 'file' | 'manual';

/** 업로드된 파일 파싱 결과 */
export interface ParsedFileEntry {
  id: string;
  fileName: string;
  fileSize: number;
  text: string;
  preview: string;  // 첫 100자
}

// --- 대본작성 ---
export type ScriptPresetType = 'community' | 'info' | 'shopping' | 'story';
export type ScriptInputMode = 'benchmark' | 'normal';
export type ContentFormat = 'long' | 'shorts';

export interface ScriptPreset {
  id: string;
  type: ScriptPresetType;
  label: string;               // 커뮤형, 정보형, 쇼핑형, 사연형
  description: string;
  toneGuide: string;
  structureGuide: string;
  channelName?: string;        // 채널분석에서 넘어온 경우
  channelGuideline?: ChannelGuideline;
}

// --- 소재 추천 ---
export interface TopicRecommendation {
  id: string;
  title: string;
  hook: string;
  synopsis: string;
  whyViral: string;
  instinctMatch: string;
  referenceVideos: { title: string; viewCount: string }[];
  estimatedViralScore: number;
}

/** @deprecated 레거시 소재 추천 (채널분석/벤치마크용) */
export interface LegacyTopicRecommendation {
  id: number;
  title: string;
  mainSubject: string;
  similarity: string;          // 벤치 대본과의 유사점
  scriptFlow: string;          // 대본 작성 흐름
  viralScore: 'high' | 'medium' | 'low';
  instinctAnalysis?: TopicInstinctAnalysis;
}

// --- 본능 기제 ---
export interface InstinctMechanism {
  id: string;           // "1-1-01"
  name: string;         // "탐구(Seeking)"
  basis: string;        // "중뇌 도파민 경로"
  description: string;  // "새로운 정보, 보상 기대"
  hooks: string[];      // ["궁금증", "정보 갈망"]
}

export interface InstinctSubCategory {
  id: string;
  title: string;
  mechanisms: InstinctMechanism[];
}

export interface InstinctPart {
  partNumber: number;
  title: string;
  icon: string;
  subCategories: InstinctSubCategory[];
}

export interface InstinctComboFormula {
  name: string;         // "공포+비교+긴급"
  formula: string;      // "위협 × 뒤처짐 × 지금"
  exampleHook: string;  // "30대인데 이것도 모르면..."
  mechanismIds: string[]; // 매핑된 기제 ID 목록
}

export interface TopicInstinctAnalysis {
  primaryInstincts: string[];   // 핵심 자극 본능 (2-3개)
  comboFormula: string;         // 추천 조합 공식
  hookSuggestion: string;       // AI 생성 훅 문장
}

export interface GeneratedScript {
  title: string;
  content: string;
  charCount: number;
  estimatedDuration: string;   // "약 10분"
  structure: string[];         // 단락 구조
}

// --- 사운드 스튜디오 ---
export type TTSEngine = 'elevenlabs' | 'supertonic' | 'typecast';
export type TTSLanguage = 'ko' | 'en' | 'ja';
export type AudioSourceType = 'tts' | 'uploaded';
export type TypecastEmotionMode = 'smart' | 'preset';
export type TypecastEmotionPreset = 'normal' | 'happy' | 'sad' | 'angry' | 'whisper' | 'toneup' | 'tonedown' | 'tonemid';
export type TypecastModel = 'ssfm-v30' | 'ssfm-v21';

export interface Speaker {
  id: string;
  name: string;
  color: string;               // 화자 색상 태그
  engine: TTSEngine;
  voiceId: string;             // 엔진별 음성 ID
  language: TTSLanguage;
  speed: number;               // Microsoft: 0.5~2.0, ElevenLabs: 0.7~1.2, Supertonic: 0.8~1.5, Typecast: 0.5~2.0
  pitch: number;               // -20~20 (Microsoft), -12~12 (Typecast)
  stability: number;           // 0~1 (ElevenLabs: 낮을수록 감정적, 높을수록 안정적)
  similarityBoost: number;     // 0~1 (ElevenLabs: 원본 음색 유사도)
  style: number;               // 0~1 (ElevenLabs: 스타일 강조, 높을수록 표현력 증가)
  useSpeakerBoost: boolean;    // ElevenLabs: 스피커 부스트 (음성 선명도 향상)
  // Typecast 전용 (engine === 'typecast'일 때만 사용)
  emotionMode?: TypecastEmotionMode;       // 'smart' | 'preset', 기본: 'smart'
  emotionPreset?: TypecastEmotionPreset;   // preset 모드 감정, 기본: 'normal'
  emotionIntensity?: number;               // 0~2.0, 기본: 1.0
  typecastModel?: TypecastModel;           // 기본: 'ssfm-v30'
  typecastVolume?: number;                 // 0~200, 기본: 100
  imageUrl?: string;                       // 캐릭터 아바타 이미지 URL
  lineCount: number;
  totalDuration: number;       // 초
}

export interface ScriptLine {
  id: string;
  speakerId: string;
  text: string;
  index: number;
  startTime?: number;          // 초
  endTime?: number;            // 초
  audioUrl?: string;           // 생성된 TTS 오디오 URL
  duration?: number;           // 초
  sceneId?: string;            // 연결된 Scene.id
  audioSource?: AudioSourceType;  // 'tts' | 'uploaded' (기본: 'tts')
  uploadedAudioId?: string;       // UserUploadedAudio.id 참조
  emotion?: string;            // 단락별 감정 오버라이드
  lineSpeed?: number;          // 단락별 속도 오버라이드
  ttsStatus?: 'idle' | 'generating' | 'done' | 'error';
  voiceId?: string;            // 줄별 캐릭터 voice_id (없으면 기본 speaker 사용)
  voiceName?: string;          // 줄별 캐릭터 이름
  voiceImage?: string;         // 줄별 캐릭터 이미지 URL
}

// --- 사용자 오디오 업로드 + Whisper 전사 ---
export interface UserUploadedAudio {
  id: string;
  fileName: string;
  audioUrl: string;          // blob: URL
  duration: number;          // 초
  fileSize: number;          // bytes
  mimeType: string;
  uploadedAt: number;
}

export interface WhisperSegment {
  text: string;
  startTime: number;         // 초
  endTime: number;           // 초
  words?: WhisperWord[];
}

export interface WhisperWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;        // 0~1
}

export interface WhisperTranscriptResult {
  text: string;              // 전체 텍스트
  language: string;          // 감지된 언어
  segments: WhisperSegment[];
  duration: number;          // 전체 길이 (초)
}

// --- AI 효과음 (SFX) ---
export interface SfxItem {
  id: string;
  prompt: string;
  duration: number;          // 요청 길이 (초)
  audioUrl?: string;         // 생성된 오디오 URL
  createdAt: number;
  status: 'idle' | 'generating' | 'done' | 'error';
  taskId?: string;
  errorMsg?: string;
}

// --- LUFS 정규화 프리셋 ---
export type LufsPreset = 'youtube' | 'spotify' | 'podcast' | 'broadcast' | 'tiktok' | 'custom';

export const LUFS_PRESETS: Record<LufsPreset, { label: string; targetLufs: number; truePeakDbtp: number }> = {
  youtube:   { label: 'YouTube (-14 LUFS)',      targetLufs: -14, truePeakDbtp: -1 },
  spotify:   { label: 'Spotify (-14 LUFS)',      targetLufs: -14, truePeakDbtp: -1 },
  podcast:   { label: '팟캐스트 (-16 LUFS)',     targetLufs: -16, truePeakDbtp: -1 },
  broadcast: { label: '방송 EBU R128 (-23 LUFS)', targetLufs: -23, truePeakDbtp: -1 },
  tiktok:    { label: 'TikTok/Reels (-14 LUFS)', targetLufs: -14, truePeakDbtp: -1 },
  custom:    { label: '사용자 정의',              targetLufs: -14, truePeakDbtp: -1 },
};

export type SunoModel = 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5';

export interface MusicGenerationConfig {
  prompt: string;              // 가사(vocal) 또는 음악 설명
  style: string;               // 스타일 태그 (장르+무드, max 1000자 V5)
  title: string;               // 트랙 제목 (max 80자)
  sunoModel: SunoModel;        // SUNO 모델 버전
  genre: string;
  subGenre: string;
  musicType: 'vocal' | 'instrumental';
  vocalType?: string;          // 보컬 타입
  vocalGender?: string;        // 보컬 성별 (m/f)
  bpm: number;
  customTags: string[];
  duration?: number;           // 생성할 음악 길이 (초, 기본 30)
  count?: number;              // 일괄 생성 곡 수 (기본 1)
  negativeTags?: string;       // 제외할 스타일
  styleWeight?: number;        // 스타일 준수도 (0-1)
  weirdnessConstraint?: number; // 창작 자유도 (0-1)
  audioWeight?: number;        // 오디오 밸런스 (0-1)
}

export interface GeneratedMusic {
  id: string;                  // taskId
  audioId?: string;            // Suno audioId (연장/보컬분리에 필요)
  title: string;
  audioUrl: string;
  streamUrl?: string;          // 스트리밍 URL
  imageUrl?: string;           // 커버 아트
  duration: number;
  createdAt: string;
  isFavorite: boolean;
  tags?: string;               // 스타일 태그
  lyrics?: string;             // 가사 텍스트
  model?: SunoModel;           // 생성 모델
}

export interface MusicLibraryItem {
  groupTitle: string;
  tracks: GeneratedMusic[];
}

// --- Suno API 결과 타입 ---
export interface LyricsResult {
  title: string;
  text: string;                // [Verse], [Chorus] 구조
}

export interface VocalSeparationResult {
  vocalUrl: string;
  instrumentalUrl: string;
}

export interface TimestampedWord {
  word: string;
  startS: number;
  endS: number;
}

// --- 편집실 ---
export type TimelineSplitMode = 'equal' | 'fixed' | 'chapter' | 'dialogue';

export interface TimelineSegment {
  id: string;
  sceneIndex: number;
  imageUrl?: string;
  videoUrl?: string;
  startTime: number;           // 초
  endTime: number;             // 초
  duration: number;            // 초
  subtitleText?: string;
  effectPreset?: string;
}

export interface SubtitleEntry {
  id: string;
  index: number;
  startTime: number;           // 초
  endTime: number;             // 초
  text: string;
  speakerId?: string;
  duration: number;
}

export interface SilenceRegion {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface SilenceRemovalConfig {
  threshold: number;           // dB (-60 ~ 0)
  minDuration: number;         // 초
  padding: number;             // 초
  gapInterval: number;         // 초
}

export type EffectPresetId =
  | 'fast' | 'smooth' | 'cinematic' | 'dynamic' | 'dreamy'
  | 'dramatic' | 'zoom' | 'reveal' | 'vintage' | 'documentary'
  | 'timelapse' | 'vlog'
  | 'diagonal-drift' | 'orbit' | 'parallax' | 'tilt-shift'
  | 'spiral-in' | 'push-pull' | 'dolly-zoom' | 'crane-up';

// --- 자막 스타일 ---
export interface SubtitleTemplate {
  id: string;
  name: string;
  category: 'all' | 'basic' | 'color' | 'style' | 'variety' | 'emotion' | 'cinematic' | 'nobg';
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor?: string;
  outlineColor?: string;
  outlineWidth: number;
  shadowColor?: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  textShadowCSS?: string;        // 다중 text-shadow CSS (있으면 개별 shadow 필드보다 우선)
  letterSpacing: number;
  lineHeight: number;
  positionY: number;           // % from bottom
  textAlign: 'left' | 'center' | 'right';
}

export interface SubtitleStyle {
  template: SubtitleTemplate;
  customFont?: string;
  customFontUrl?: string;      // 눈누 등 외부 폰트 URL
}

// --- 업로드 ---
export type UploadStep = 'video' | 'auth' | 'metadata' | 'thumbnail' | 'settings' | 'upload';
export type UploadPlatform = 'youtube' | 'tiktok' | 'instagram' | 'threads' | 'naver-clip';

export interface YouTubeAuthState {
  isConnected: boolean;
  accessToken?: string;
  refreshToken?: string;
  channelName?: string;
  channelId?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
}

export interface TikTokAuthState {
  isConnected: boolean;
  accessToken?: string;
  refreshToken?: string;
  username?: string;
  openId?: string;
  expiresAt?: number;
  clientKey?: string;
  clientSecret?: string;
}

export interface InstagramAuthState {
  isConnected: boolean;
  accessToken?: string;
  userId?: string;
  username?: string;
  accountType?: string;       // BUSINESS | CREATOR
  expiresAt?: number;
  appId?: string;
  appSecret?: string;
}

export interface ThreadsAuthState {
  isConnected: boolean;
  accessToken?: string;
  userId?: string;
  username?: string;
  expiresAt?: number;
  appId?: string;
  appSecret?: string;
}

export interface NaverClipAuthState {
  isConnected: boolean;
  username?: string;
}

export interface PlatformUploadProgress {
  platform: UploadPlatform;
  progress: number;            // 0-100
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  resultUrl?: string;          // 업로드 완료 후 영상 URL
}

export interface ShoppingTag {
  keyword: string;
  category: string;   // 전자제품, 패션, 식품, 뷰티, 생활, 기타
  link?: string;       // 사용자가 수동 입력하는 어필리에이트 링크
}

export interface PolicyCheckResult {
  safetyLevel: 'safe' | 'warning' | 'danger';
  monetizationLevel: 'suitable' | 'limited' | 'unsuitable';
  details: string;
}

export interface VideoMetadata {
  titles: string[];            // AI 생성 5개 제목 옵션
  selectedTitle: string;
  description: string;         // 700자 교육적 설명문 (구독 CTA 금지)
  publicHashtags: string[];    // 정확히 5개 공개 해시태그 (설명 하단, #shorts 금지)
  hiddenTags: string[];        // 비공개 태그 (YouTube Studio 태그 박스, 한국어만, 풀 용량)
  tags: string[];              // 하위호환: hiddenTags 미러
  category: string;            // YouTube 카테고리
  language: string;
  policyCheck?: PolicyCheckResult; // 정책 게이트키퍼 결과
  thumbnailSuggestions?: string[]; // 썸네일 추천 장면
  shoppingTags?: ShoppingTag[];  // AI 추출 쇼핑 태그
  generatedAt?: number;          // 생성 타임스탬프
}

export interface UploadSettings {
  privacy: 'public' | 'unlisted' | 'private';
  scheduledAt?: string;        // ISO 8601 예약 시간
  madeForKids: boolean;
  notifySubscribers: boolean;
  // YouTube 추가 설정
  categoryId: string;          // YouTube 카테고리 ID (기본: "22")
  defaultLanguage: string;     // 영상 기본 언어 (기본: "ko")
  // TikTok 전용
  tiktokPrivacy: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  tiktokDisableDuet: boolean;
  tiktokDisableStitch: boolean;
  tiktokDisableComment: boolean;
  // Threads 전용
  threadsReplyControl: 'everyone' | 'accounts_you_follow' | 'mentioned_only';
}

export type OutputMode = 'mp4' | 'srt-image' | 'srt-video';

export interface ExportConfig {
  outputMode: OutputMode;
  includeNarration: boolean;
  includeSubtitles: boolean;
  includeImageEffects: boolean;
  subtitleStyle?: SubtitleStyle;
}

// --- 편집실 (EditRoom) ---

export interface SceneEffectConfig {
  panZoomPreset: string;
  motionEffect: string;
  /** 앵커 포인트 (0-100%, 이미지 내 줌/팬 중심점). 장면 분석으로 자동 설정됨 */
  anchorX?: number;  // 0=왼쪽, 50=중앙, 100=오른쪽
  anchorY?: number;  // 0=위쪽, 50=중앙, 100=아래쪽
  anchorLabel?: string; // e.g. "인물 얼굴", "수평선", "피사체 중심"
  customParams?: {
    zoomStart: number;
    zoomEnd: number;
    panX: number;
    panY: number;
    fadeIn: number;
    fadeOut: number;
  };
}

// --- 오버레이 효과 ---

export type OverlayCategory = 'particle' | 'texture' | 'atmosphere' | 'color';

export type OverlayBlendMode = 'normal' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'multiply' | 'lighten';

export interface OverlayPreset {
  id: string;
  label: string;
  labelEn: string;
  category: OverlayCategory;
  icon: string;
  defaultBlendMode: OverlayBlendMode;
  description: string;
}

export interface SceneOverlayConfig {
  presetId: string;
  intensity: number;       // 0-100
  opacity: number;         // 0-100
  blendMode: OverlayBlendMode;
  speed: number;           // 0.5-3.0
}

export interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
}

export interface SceneSubtitleConfig {
  text: string;
  startTime: number;
  endTime: number;
  segments?: SubtitleSegment[];
  styleOverride?: Partial<SubtitleTemplate>;
  animationPreset?: string;
  animationDuration?: number;
  animationDelay?: number;
  animationIterationCount?: number; // 0 = infinite
}

export interface SceneAudioConfig {
  volume: number;    // 0-200
  speed: number;     // 0.5-2.0
}

export type AudioMasterPreset = 'none' | 'broadcast' | 'podcast' | 'music' | 'cinema' | 'loudness';

/** 렌더 시 라우드니스 노멀라이즈 설정 */
export interface LoudnessNormConfig {
  enabled: boolean;
  targetLufs: number;    // -24 ~ -5 LUFS
  truePeakDbtp: number;  // -3 ~ 0 dBTP
  lra: number;           // 1 ~ 20 LU (Loudness Range)
}

/** MP4 렌더 설정 (내보내기 전 모달) */
export interface RenderSettings {
  loudness: LoudnessNormConfig;
  masterPresetOverride: AudioMasterPreset | null; // null = bgmTrack.masterPreset 사용
  renderMode: 'unified' | 'individual';
  includeSubtitles: boolean;
  videoBitrate: number; // Mbps (8, 15, 20, 25, 30)
}

export interface CompressorBandSettings {
  threshold: number;  // -60 ~ 0 dB
  ratio: number;      // 1 ~ 20
  attack: number;     // 0.1 ~ 100 ms
  release: number;    // 10 ~ 1000 ms
  gain: number;       // -12 ~ 12 dB
}

export interface BgmConfig {
  audioUrl: string | null;
  trackTitle: string;
  volume: number;       // 0-100
  fadeIn: number;       // 초
  fadeOut: number;      // 초
  /** 나레이션 vs BGM 믹스 밸런스 (-100=나레이션만, 0=균등, 100=BGM만) */
  mixBalance: number;
  /** 나레이션 재생 시 BGM 자동 감소 (ducking) dB */
  duckingDb: number;
  /** 오디오 마스터링 프리셋 (multiband compressor 등) */
  masterPreset: AudioMasterPreset;
  /** 멀티밴드 컴프레서 밴드별 설정 (4밴드: Low, Low-Mid, Hi-Mid, High) */
  compressorBands?: CompressorBandSettings[];
  /** BGM 시작 시간 (초) — 타임라인에서 드래그로 조정 */
  startTime?: number;
  /** BGM 끝 시간 (초) — 타임라인에서 트림으로 조정 */
  endTime?: number;
}

// --- 장면 전환 효과 ---
export type SceneTransitionPreset =
  // 기본
  | 'none' | 'fade' | 'fadeWhite' | 'dissolve'
  // 와이프
  | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown'
  // 슬라이드
  | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown'
  // 커버 (새 씬이 위에서 슬라이드 인)
  | 'coverLeft' | 'coverRight'
  // 형태
  | 'circleOpen' | 'circleClose' | 'radial' | 'diagBR' | 'diagTL'
  // 줌/3D
  | 'zoomIn' | 'zoomOut' | 'flipX' | 'flipY'
  // 특수
  | 'smoothLeft' | 'smoothRight' | 'blur' | 'pixelate'
  | 'squeezH' | 'flash' | 'glitch';

export interface SceneTransitionConfig {
  preset: SceneTransitionPreset;
  duration: number; // 초 (0.3~1.5)
}

export interface UnifiedSceneTiming {
  sceneId: string;
  sceneIndex: number;
  imageStartTime: number;
  imageEndTime: number;
  imageDuration: number;
  subtitleSegments: {
    lineId: string;
    text: string;
    startTime: number;
    endTime: number;
  }[];
  effectPreset: string;
  motionEffect?: string;  // 모션 효과 (pan, micro, slow, rotate 등)
  anchorX?: number;   // 0-100%, 줌/팬 앵커 X
  anchorY?: number;   // 0-100%, 줌/팬 앵커 Y
  volume: number;
  speed: number;
  transitionToNext?: SceneTransitionConfig;
}

export interface SrtEntry {
  index: number;
  startTime: number;  // 초
  endTime: number;    // 초
  text: string;
}

export interface ExportProgress {
  phase: 'loading-ffmpeg' | 'writing-assets' | 'composing' | 'encoding' | 'done' | 'initializing';
  percent: number;
  message: string;
  elapsedSec?: number;
  etaSec?: number;
}

// --- 안전 영역 (Safe Zone) ---
export type SafeZonePlatform = 'youtube-shorts' | 'instagram-reels' | 'tiktok' | 'custom';

export interface SafeZoneMargins {
  top: number;     // % from top
  bottom: number;  // % from bottom
  left: number;    // % from left
  right: number;   // % from right
}

export interface SafeZoneConfig {
  platform: SafeZonePlatform;
  showGuide: boolean;
  showUiSimulation: boolean;
  customMargins?: SafeZoneMargins;
}

// --- 트랙별 오디오 이펙트 ---
export type AudioEffectType = 'eq' | 'compressor' | 'reverb' | 'delay' | 'deesser' | 'noisegate';

export interface AudioEffectParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string; // 'dB', 'ms', 'Hz', '%'
}

export interface TrackAudioEffect {
  type: AudioEffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type AudioTrackId = 'narration' | 'bgm' | 'sfx' | 'master';

export interface TrackEffectConfig {
  effects: TrackAudioEffect[];
  bypass: boolean;
}

export interface TrackMixerConfig {
  mute: boolean;
  solo: boolean;
  crossfadeMs: number; // 0~500ms, 클립 경계 크로스페이드
  pan: number; // -100(L) ~ 0(C) ~ 100(R)
}

// --- 편집실 서브탭 ---
export type EditRoomSubTab = 'timeline' | 'edit-point-matching';

// --- 편집점 매칭 ---
export type EditPointStep = 'register' | 'mapping' | 'export';

export interface SourceVideoFile {
  id: string;
  sourceId: string;
  file: File;
  blobUrl: string;
  fileName: string;
  fileSizeMB: number;
  durationSec: number | null;
  thumbnailDataUrl?: string;
  /** GhostCut으로 자막 제거된 영상 Blob URL */
  cleanedBlobUrl?: string;
}

export interface EdlEntry {
  id: string;
  order: string;
  narrationText: string;
  sourceId: string;
  sourceDescription: string;
  speedFactor: number;
  timecodeStart: number;
  timecodeEnd: number;
  note: string;
  refinedTimecodeStart?: number;
  refinedTimecodeEnd?: number;
  refinedConfidence?: number;
  referenceFrameUrl?: string;
  /** 나레이션 텍스트 기반 추정 소요 시간(초) */
  narrationDurationSec?: number;
  /** 나레이션 길이에 맞춰 자동 계산된 배속 (< 1.0 = 슬로우) */
  autoSpeedFactor?: number;
}

export type EditPointExportMode = 'direct-mp4' | 'ffmpeg-script' | 'edl-file' | 'push-to-timeline';

// --- evolink.ai 모델 ---
export enum EvolinkImageModel {
  NANO_BANANA_2 = 'nano-banana-2',
  NANO_BANANA_PRO = 'nano-banana-pro'
}

// ═══ 영상 분석실 (VideoAnalysisRoom) ═══

export type VideoAnalysisPreset = 'tikitaka' | 'snack' | 'condensed' | 'deep' | 'shopping';

/** 장면 하나의 구조화 데이터 (스낵형 + 티키타카 공용) */
export interface VideoSceneRow {
  cutNum: number;
  timeline: string;
  sourceTimeline: string;
  dialogue: string;
  effectSub: string;
  sceneDesc: string;
  mode: string;
  audioContent: string;
  duration: string;
  videoDirection: string;
  timecodeSource: string;
}

/** Content ID 회피 및 바이럴 분석 */
export interface VideoContentIdAnalysis {
  textMatchRate: string;
  structureSimilarity: string;
  orderSimilarity: string;
  keywordVariation: string;
  safetyGrade: string;
  viralPoint: string;
  judgement: string;
}

/** 10개 버전 중 하나 */
export interface VideoVersionItem {
  id: number;
  title: string;
  concept: string;
  scenes: VideoSceneRow[];
  rearrangement?: string;
  contentId?: VideoContentIdAnalysis;
}

/** 타임스탬프 포함 프레임 (비주얼 타임코드 매칭용) */
export interface VideoTimedFrame {
  url: string;
  hdUrl?: string;
  timeSec: number;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
    google: any;
    aistudio?: AIStudio;
  }
}
