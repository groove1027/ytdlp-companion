import React, { useState, useRef, useEffect } from 'react';
import { Thumbnail, AspectRatio, VideoFormat } from '../types';
import { generateThumbnailConcepts, generateHighQualityThumbnail, analyzeStyleReference, editThumbnailTextStyled } from '../services/geminiService';
import { PRICING } from '../constants';
import { resizeImage } from '../services/imageProcessingService';
import ThumbnailTextStyleEditor from './ThumbnailTextStyleEditor';
import ThumbnailPostProcessor from './ThumbnailPostProcessor';
import { persistImage } from '../services/imageStorageService';
import { showToast } from '../stores/uiStore';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';
import { logger } from '../services/LoggerService';

const PLANNING_MESSAGES = [
    "🤖 대본의 핵심 맥락과 감정(Sentiment)을 분석하고 있습니다...",
    "🎨 조회수를 부르는 최적의 레이아웃과 색상을 구상 중입니다...",
    "✍️ 가장 임팩트 있는 한글 키워드와 강조 효과를 계산하고 있습니다...",
    "✨ 시청자의 시선을 끄는 비주얼 컨셉을 기획 중입니다...",
    "🚀 4가지 다른 매력의 썸네일 아이디어를 생성 중입니다..."
];

const FIXED_NEON_COLORS = ["#68ff34", "#41fff6", "#fefc15", "#FFFFFF"]; // Green, Cyan, Yellow, White

const SHOT_ABBR: Record<string, string> = {
  'Extreme_Close_Up': 'ECU', 'Close_Up': 'CU', 'Medium_Close_Up': 'MCU',
  'Medium_Shot': 'MS', 'Waist_Shot': 'WS', 'Full_Body': 'FB', 'Full_Shot': 'FS',
  'Wide_Shot': 'WS', 'Low_Angle': 'LA', 'High_Angle': 'HA',
  'Birds_Eye': 'BE', 'Dutch_Angle': 'DA',
};

const getRandomNeon = () => {
    return FIXED_NEON_COLORS[Math.floor(Math.random() * (FIXED_NEON_COLORS.length - 1))];
};

interface ThumbnailGeneratorProps {
  script: string;
  styleDescription: string;
  characterImageBase64?: string;
  characterDescription?: string; 
  characterPublicUrl?: string; 
  thumbnails: Thumbnail[];
  setThumbnails: React.Dispatch<React.SetStateAction<Thumbnail[]>>;
  videoFormat: VideoFormat;
  onImageClick?: (url: string) => void;
  onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void;
  textForceLock?: boolean;
  isMixedMedia?: boolean; // [NEW] Mixed Media Flag
  languageContext?: { lang?: string, locale?: string, nuance?: string, langName?: string }; // [NEW] Language Context
  globalContext?: string; // [NEW] 문화권/지명/시대/핵심 엔티티 JSON
  initialReferenceImage?: string; // [NEW] Pre-loaded reference image from setup phase
  initialExtractedStyle?: string; // [NEW] Pre-analyzed style from setup phase
  autoStart?: boolean; // [NEW] Auto-start generation on mount
  hideReferenceArea?: boolean; // [NEW] Hide built-in reference area (when managed by parent)
  onBeforeGenerate?: () => Promise<void>; // [NEW] Callback before generation starts
}

const ThumbnailGenerator: React.FC<ThumbnailGeneratorProps> = ({ 
  script, 
  styleDescription, 
  characterImageBase64,
  characterDescription,
  characterPublicUrl,
  thumbnails,
  setThumbnails,
  videoFormat,
  onImageClick,
  onCostAdd,
  textForceLock,
  isMixedMedia, // [NEW] Destructure
  languageContext, // [NEW] Destructure
  globalContext, // [NEW] Destructure
  initialReferenceImage, // [NEW] Destructure
  initialExtractedStyle, // [NEW] Destructure
  autoStart,             // [NEW] Destructure
  hideReferenceArea,     // [NEW] Destructure
  onBeforeGenerate       // [NEW] Destructure
}) => {
  const { requireAuth } = useAuthGuard();
  const [isPlanningLong, setIsPlanningLong] = useState(false);
  const [isPlanningShort, setIsPlanningShort] = useState(false);
  const [planningMsgIndex, setPlanningMsgIndex] = useState(0);
  const elapsedPlan = useElapsedTimer(isPlanningLong || isPlanningShort);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  
  // [NEW] Text Editing State
  const [textEditingId, setTextEditingId] = useState<string | null>(null);

  // [NEW] Post Processing State
  const [postProcessId, setPostProcessId] = useState<string | null>(null);

  // Toolbar modal state
  const [toolbarId, setToolbarId] = useState<string | null>(null);
  const toolbarModalRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // [NEW] Reference Style State
  const refInputRef = useRef<HTMLInputElement>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [extractedStyle, setExtractedStyle] = useState<string | null>(null);
  const [isAnalyzingRef, setIsAnalyzingRef] = useState(false);
  
  // [NEW] Drag & Drop State
  const [isDragOver, setIsDragOver] = useState(false);

  // [NEW] Sync initial reference image/style from parent setup phase (reactive)
  useEffect(() => {
    if (!initialReferenceImage) return;
    setReferenceImage(initialReferenceImage);

    if (initialExtractedStyle) {
      setExtractedStyle(initialExtractedStyle);
    } else {
      setIsAnalyzingRef(true);
      analyzeStyleReference(initialReferenceImage)
        .then(styleAnalysis => {
          setExtractedStyle(styleAnalysis);
        })
        .catch(err => {
          console.error("Initial reference analysis failed", err);
          setReferenceImage(null);
        })
        .finally(() => {
          setIsAnalyzingRef(false);
        });
    }
  }, [initialReferenceImage, initialExtractedStyle]);

  const longThumbnails = thumbnails.filter(t => t.format === 'long');
  const shortThumbnails = thumbnails.filter(t => t.format === 'short');

  // Rolling message logic
  useEffect(() => {
    let interval: any;
    if (isPlanningLong || isPlanningShort) {
      interval = setInterval(() => {
        setPlanningMsgIndex(prev => (prev + 1) % PLANNING_MESSAGES.length);
      }, 2500);
    } else {
      setPlanningMsgIndex(0);
    }
    return () => clearInterval(interval);
  }, [isPlanningLong, isPlanningShort]);

  // [NEW] Auto-start generation on mount when autoStart prop is true
  const autoStartTriggered = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStartTriggered.current && script) {
      autoStartTriggered.current = true;
      const mainType = videoFormat === VideoFormat.SHORT ? 'short' : 'long';
      // Delay slightly to ensure component is fully mounted
      const timer = setTimeout(() => {
        handleStartGeneration(mainType);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoStart, script, videoFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toolbar modal: close on outside click
  useEffect(() => {
    if (!toolbarId) return;
    const handleClick = (e: MouseEvent) => {
      if (toolbarModalRef.current && !toolbarModalRef.current.contains(e.target as Node)) {
        setToolbarId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [toolbarId]);

  // [NEW] Reference Image Handler
  const processRefFile = async (file: File) => {
      setIsAnalyzingRef(true);
      // Cost is auto-tracked inside evolinkChat()

      try {
          // [UPDATED] Resize image to prevent Payload Too Large error (Max 1024px, JPEG)
          // 1024px is enough for analysis but prevents heavy payload timeouts
          const base64 = await resizeImage(file, 1024, 'image/jpeg', 0.85);
          
          setReferenceImage(base64);
          
          // Use specialized style analyzer
          const styleAnalysis = await analyzeStyleReference(base64);
          setExtractedStyle(styleAnalysis);
      } catch (err: any) {
          console.error("Reference processing failed", err);
          showToast(`스타일 분석 실패: ${err.message || 'Unknown Error'}`, 4000);
          setReferenceImage(null);
      } finally {
          setIsAnalyzingRef(false);
      }
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processRefFile(file);
      if (refInputRef.current) refInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
          processRefFile(file);
      }
  };

  const handleClearReference = () => {
      setReferenceImage(null);
      setExtractedStyle(null);
  };

  const handleStartGeneration = async (type: 'long' | 'short') => {
    if (!requireAuth('썸네일 생성')) return;
    logger.info(`[썸네일] ${type} 기획 생성 시작`);
    if (isThisTypeBusy(type)) {
      logger.warn(`[썸네일] ${type} 이미 생성 중이라 스킵`);
      return;
    }

    // Show loading state IMMEDIATELY before any async work
    if (type === 'long') setIsPlanningLong(true);
    else setIsPlanningShort(true);

    // Run pre-generation hook (e.g. script context analysis)
    if (onBeforeGenerate) {
      try {
        await onBeforeGenerate();
      } catch {
        // Reset loading state on failure
        if (type === 'long') setIsPlanningLong(false);
        else setIsPlanningShort(false);
        return; // Abort generation if pre-hook fails
      }
    }

    setThumbnails(prev => prev.filter(t => t.format !== type));

    try {
      logger.info(`[썸네일] AI 컨셉 기획 API 호출 중... (script: ${script.length}자)`);
      // Pass extracted style if available
      // [UPDATED] Pass langName to fix language issue
      const concepts = await generateThumbnailConcepts(
          script,
          type === 'short',
          extractedStyle || undefined,
          (c) => onCostAdd && onCostAdd(c, 'analysis'),
          languageContext?.langName
      );

      logger.success(`[썸네일] AI 컨셉 ${concepts?.length || 0}개 생성 완료`);

      if (!Array.isArray(concepts) || concepts.length === 0) {
        showToast('AI 기획 생성에 실패했습니다. 다시 시도해주세요.', 4000);
        logger.error('[썸네일] 컨셉 배열이 비어있음');
        if (type === 'long') setIsPlanningLong(false);
        else setIsPlanningShort(false);
        return;
      }

      // [CRITICAL UPDATE] Shuffle Colors Array to ensure random order but no repeats
      const shuffledColors = [...FIXED_NEON_COLORS];
      for (let i = shuffledColors.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledColors[i], shuffledColors[j]] = [shuffledColors[j], shuffledColors[i]];
      }

      const newThumbnails: Thumbnail[] = concepts.map((concept: any, idx: number) => {
        // Assign colors from shuffled array cyclically
        let primaryColorHex = shuffledColors[idx % shuffledColors.length];
        let highlight = "";

        if (primaryColorHex === "#FFFFFF") {
            // Pick a random neon highlight for the white mix, excluding white itself
            const neons = FIXED_NEON_COLORS.filter(c => c !== "#FFFFFF");
            highlight = neons[Math.floor(Math.random() * neons.length)];
        }

        return {
            id: `thumb-${type}-${Date.now()}-${idx}`,
            // [FIX] Add fallback for textOverlay to prevent "undefined" string
            textOverlay: concept.textOverlay || "",
            fullTitle: concept.fullTitle,
            visualDescription: concept.visualDescription,
            primaryColorHex: primaryColorHex,
            secondaryColorHex: concept.secondaryColorHex,
            colorMode: concept.colorMode, 
            isGenerating: true,
            format: type,
            isNativeHQ: false, // Default to off
            sentiment: concept.sentiment, 
            highlight: highlight || concept.highlight,
            // [NEW] Map Director fields
            shotSize: concept.shotSize,
            poseDescription: concept.poseDescription,
            cameraAngle: concept.cameraAngle,
            // [NEW] Default text style preset
            textPreset: 'sticker'
        };
      });

      setThumbnails(prev => [...prev, ...newThumbnails]);
      
      const ratio = type === 'short' ? AspectRatio.PORTRAIT : AspectRatio.LANDSCAPE;
      
      if (type === 'long') setIsPlanningLong(false);
      else setIsPlanningShort(false);

      // Parallel Generation
      await Promise.all(newThumbnails.map((thumb: any, idx) => 
          generateSingleThumbnail(
              thumb.id, 
              thumb.textOverlay, 
              thumb.visualDescription, 
              ratio, 
              undefined, 
              thumb.primaryColorHex, 
              thumb.secondaryColorHex, 
              thumb.colorMode, 
              idx,
              thumb.isNativeHQ,
              thumb.sentiment,
              thumb.highlight,
              // [NEW] Pass extra fields
              thumb.shotSize,
              thumb.poseDescription,
              thumb.cameraAngle
          )
      ));

    } catch (error: any) {
      logger.error(`[썸네일] ${type} 기획 실패: ${error?.message || error}`, error);
      showToast(`${type === 'long' ? '롱폼' : '숏폼'} 썸네일 기획 생성에 실패했습니다: ${error?.message || '알 수 없는 오류'}`, 5000);
      if (type === 'long') setIsPlanningLong(false);
      else setIsPlanningShort(false);
    }
  };

  const generateSingleThumbnail = async (
      id: string,
      text: string,
      visual: string,
      ratio: AspectRatio,
      feedback?: string,
      primaryColor?: string,
      secondaryColor?: string,
      colorMode?: 'PURE_WHITE' | 'FULL_COLOR' | 'HIGHLIGHT_MIX',
      index?: number,
      isNativeHQ?: boolean,
      sentiment?: string,
      highlight?: string,
      shotSize?: string,
      poseDescription?: string,
      cameraAngle?: string,
      textPreset?: string,
      fontHint?: string,
      textPosition?: string,
      textScale?: number
  ) => {
    setThumbnails(prev => prev.map(t => t.id === id ? { ...t, isGenerating: true, generationStatus: undefined } : t));

    try {
      // Use extractedStyle as the style override if present. This ensures strict copying.
      // If reference is present, 'extractedStyle' holds the detailed structural analysis.
      const effectiveStyle = extractedStyle ? extractedStyle : styleDescription;

      const updateStatus = (status: string) => {
          setThumbnails(prev => prev.map(t => t.id === id ? { ...t, generationStatus: status } : t));
      };

      // [UPDATED] Pass mixed media settings, Language Context, and Director Fields
      const result = await generateHighQualityThumbnail(
          text, 
          visual, 
          effectiveStyle, 
          ratio, 
          characterImageBase64, 
          characterDescription, 
          characterPublicUrl,   
          feedback,
          primaryColor || getRandomNeon(), 
          secondaryColor,
          colorMode, 
          index,
          isNativeHQ,
          sentiment, 
          highlight,
          referenceImage || undefined, // Pass reference image for style copy
          textForceLock,
          updateStatus,
          isMixedMedia, // Pass Mixed Media Flag
          styleDescription, // Pass Original Style
          languageContext, // [NEW] Pass Language Context
          shotSize,        // [NEW]
          poseDescription, // [NEW]
          cameraAngle,     // [NEW]
          globalContext,    // [NEW] Pass Global Context
          textPreset,      // [NEW] Text Style Preset
          fontHint,        // [NEW] Font Hint
          textPosition,    // [NEW] Text Position
          textScale        // [NEW] Text Scale
      );
      
      const imageUrl = result.url;
      const isFallback = result.isFallback;

      // [UPDATED] Cost Calculation
      let cost = isNativeHQ ? PRICING.IMAGE_GENERATION * 2 : PRICING.IMAGE_GENERATION;
      if (isFallback) {
          cost = isNativeHQ ? PRICING.IMAGE_GENERATION_FALLBACK * 2 : PRICING.IMAGE_GENERATION_FALLBACK;
      }

      // [ADDED] CHARGE ONLY ON SUCCESS
      if (onCostAdd) onCostAdd(cost, 'image');

      // Show immediately
      setThumbnails(prev => prev.map(t => t.id === id ? {
          ...t,
          imageUrl,
          isGenerating: false,
          visualDescription: feedback ? feedback : visual,
          generationStatus: undefined
      } : t));

      // Background: persist to Cloudinary (Base64 → URL)
      persistImage(imageUrl).then(persistedUrl => {
          if (persistedUrl !== imageUrl) {
              setThumbnails(prev => prev.map(t => t.id === id && t.imageUrl === imageUrl ? { ...t, imageUrl: persistedUrl } : t));
          }
      });
    } catch (e: any) {
      console.error("Single thumbnail gen failed", e);
      // Ensure loading state is cleared even on error
      setThumbnails(prev => prev.map(t => t.id === id ? { 
          ...t, 
          isGenerating: false, 
          generationStatus: "생성 실패", 
          imageUrl: undefined 
      } : t));
    }
  };

  // [NEW] Cancel Generation Function
  const handleCancel = (id: string) => {
      setThumbnails(prev => prev.map(t => t.id === id ? { 
          ...t, 
          isGenerating: false, 
          generationStatus: "사용자 취소됨" 
      } : t));
  };

  const isThisTypeBusy = (type: 'long' | 'short') => {
      const isPlanning = type === 'long' ? isPlanningLong : isPlanningShort;
      const items = type === 'long' ? longThumbnails : shortThumbnails;
      return isPlanning || items.some(t => t.isGenerating);
  };

  const handleEditSubmit = (e: React.FormEvent, thumb: Thumbnail & any) => {
      e.preventDefault();
      if (!editingId) return;
      const ratio = thumb.format === 'short' ? AspectRatio.PORTRAIT : AspectRatio.LANDSCAPE;
      generateSingleThumbnail(thumb.id, thumb.textOverlay, thumb.visualDescription, ratio, feedback, thumb.primaryColorHex, thumb.secondaryColorHex, thumb.colorMode, undefined, thumb.isNativeHQ, thumb.sentiment, thumb.highlight, thumb.shotSize, thumb.poseDescription, thumb.cameraAngle);
      setEditingId(null);
      setFeedback('');
  };
  
  // [UPDATED] Handle Text Edit Submit (Styled via ThumbnailTextStyleEditor)
  const handleStyledTextEditSubmit = async (
      thumbId: string, text: string, presetId: string, fontHintId: string,
      color: string, position: string, scale: number
  ) => {
      const thumb = thumbnails.find(t => t.id === thumbId);
      if (!thumb || !thumb.imageUrl) return;

      setTextEditingId(null);
      setThumbnails(prev => prev.map(t => t.id === thumbId ? { ...t, isGenerating: true } : t));

      try {
          const ratio = thumb.format === 'short' ? AspectRatio.PORTRAIT : AspectRatio.LANDSCAPE;
          const newImageUrl = await editThumbnailTextStyled(
              thumb.imageUrl, text, ratio, styleDescription || "High Quality",
              presetId, fontHintId, color, position, scale
          );

          setThumbnails(prev => prev.map(t => t.id === thumbId ? {
              ...t,
              imageUrl: newImageUrl,
              textOverlay: text,
              textPreset: presetId,
              fontHint: fontHintId,
              primaryColorHex: color,
              textPosition: position,
              textScale: scale,
              isGenerating: false
          } : t));

          if (onCostAdd) onCostAdd(PRICING.IMAGE_GENERATION, 'image');
      } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error("Styled text edit failed", err);
          showToast("문구 수정 실패: " + errMsg, 4000);
          setThumbnails(prev => prev.map(t => t.id === thumbId ? { ...t, isGenerating: false } : t));
      }
  };

  // [NEW] Handle Post Processing Apply
  const handlePostProcessApply = (thumbId: string, processedBase64: string) => {
      setPostProcessId(null);
      setThumbnails(prev => prev.map(t => t.id === thumbId ? { ...t, imageUrl: processedBase64 } : t));
  };

  const handleUploadClick = (id: string) => {
      setUploadTargetId(id);
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && uploadTargetId) {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (ev) => {
              if (ev.target?.result) {
                 setThumbnails(prev => prev.map(t => t.id === uploadTargetId ? { ...t, imageUrl: ev.target!.result as string } : t));
              }
          };
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTargetId(null);
  };
  
  const handleToggleNativeHQ = (id: string, currentStatus: boolean) => {
      setThumbnails(prev => prev.map(t => t.id === id ? { ...t, isNativeHQ: !currentStatus } : t));
  };

  const handleDownload = async (url: string, index: number, type: 'long' | 'short', textOverlay: string) => {
    const safeText = textOverlay.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().substring(0, 15).replace(/\s+/g, '_');
    const num = String(index + 1).padStart(2, '0');
    const filename = `${num}_${safeText || 'Thumbnail'}.jpg`;
    
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    } catch (e) {
        window.open(url, '_blank');
    }
  };
  
  const copyToClipboard = (text: string, id: string) => {
      navigator.clipboard.writeText(text).then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 1500);
      });
  };

  // [NEW] Render Reference Style Area
  const renderReferenceArea = () => {
      if (!referenceImage && !isAnalyzingRef) {
          // 1. Empty State (With Drag & Drop)
          return (
              <div 
                  onClick={() => refInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mb-6 p-6 border-2 border-dashed rounded-xl transition-all cursor-pointer group flex flex-col items-center justify-center gap-3 relative overflow-hidden ${
                      isDragOver 
                      ? 'border-blue-400 bg-blue-900/30 scale-[1.01] shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                      : 'border-gray-600 bg-gray-800/30 hover:border-blue-500 hover:bg-gray-800/60'
                  }`}
              >
                  <div className="p-3 bg-gray-700 rounded-full group-hover:scale-110 transition-transform relative z-10">
                      <span className="text-3xl">🎨</span>
                  </div>
                  <div className="text-center relative z-10">
                      <h3 className={`font-bold text-xl transition-colors ${isDragOver ? 'text-blue-300' : 'text-gray-200 group-hover:text-blue-300'}`}>
                          {isDragOver ? "이미지를 놓아주세요!" : "스타일 레퍼런스 업로드"}
                      </h3>
                      <p className="text-base text-gray-400 mt-1">따라하고 싶은 썸네일 이미지를 올려주세요.</p>
                      <p className="text-sm text-gray-500 mt-2">AI가 <span className="text-blue-400 font-bold">색감, 폰트, 구도, 효과</span>를 분석해 똑같이 만들어줍니다.</p>
                  </div>
                  {isDragOver && (
                      <div className="absolute inset-0 bg-blue-500/10 pointer-events-none animate-pulse"></div>
                  )}
              </div>
          );
      } else if (isAnalyzingRef) {
          // 2. Loading State
          return (
              <div className="mb-6 p-6 border-2 border-blue-500/50 bg-gray-900/50 rounded-xl flex flex-col items-center justify-center gap-3 relative overflow-hidden h-48">
                  <div className="absolute inset-0 bg-blue-900/10 animate-pulse"></div>
                  <div className="w-10 h-10 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin z-10"></div>
                  <p className="font-bold text-blue-300 z-10 animate-pulse text-base">AI가 디자인 스타일을 정밀 분석하고 있습니다...</p>
                  <p className="text-sm text-blue-400/70 z-10">레이아웃, 폰트 스타일, 제외할 대상 추출 중</p>
              </div>
          );
      } else {
          // 3. Active State (Compact Layout - Full Width, Fixed Height)
          return (
              <div className="mb-6 p-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-[1px] shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                  <div className="bg-gray-900 rounded-xl p-4 flex gap-6 items-stretch h-48 relative overflow-hidden group">
                      {/* Background Glow */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                      
                      {/* Image Preview (Larger, Fixed Aspect) */}
                      <div 
                          className="relative shrink-0 h-full aspect-video cursor-zoom-in overflow-hidden rounded-lg border border-gray-600 shadow-md bg-black"
                          onClick={() => onImageClick && onImageClick(referenceImage!)}
                      >
                          <img src={referenceImage!} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" alt="Ref" />
                          <div className="absolute top-2 left-2 bg-black/80 text-white text-sm px-2 py-1 rounded border border-gray-600 font-bold backdrop-blur-sm">
                              ORIGINAL
                          </div>
                          <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-2xl">🔍</span>
                          </div>
                      </div>

                      {/* Style Analysis Text (Scrollable, Fills Space) */}
                      <div className="flex-grow flex flex-col h-full min-w-0"> 
                          <div className="flex justify-between items-center mb-2 shrink-0">
                              <div className="flex items-center gap-2">
                                  <span className="bg-blue-600 text-white text-sm font-black px-2 py-0.5 rounded shadow animate-pulse">
                                      ✨ 스타일 카피 모드 ON
                                  </span>
                                  <span className="text-sm text-blue-200 font-bold">디자인 복제 준비 완료</span>
                              </div>
                              <button 
                                  onClick={handleClearReference}
                                  className="text-red-400 hover:text-red-300 text-sm font-bold underline flex items-center gap-1"
                              >
                                  🗑️ 초기화
                              </button>
                          </div>
                          
                          <div className="flex-grow bg-gray-800/80 rounded-lg border border-gray-700 p-3 overflow-y-auto custom-scrollbar relative">
                              <div className="absolute top-3 right-3 text-2xl opacity-10 pointer-events-none">📝</div>
                              <p className="text-sm text-gray-400 font-bold mb-1 sticky top-0 bg-gray-800/95 backdrop-blur pb-1 border-b border-gray-700/50 w-full">
                                  🤖 AI 분석 결과 (구조적 스타일):
                              </p>
                              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                                  {extractedStyle || "분석 중..."}
                              </p>
                          </div>
                      </div>
                  </div>
              </div>
          );
      }
  };

  const renderSection = (title: string, type: 'long' | 'short', items: Thumbnail[]) => {
    const isShort = type === 'short';
    const cardAspectRatio = isShort ? 'aspect-[9/16]' : 'aspect-video';
    const cardAspectStyle: React.CSSProperties = isShort ? { aspectRatio: '9 / 16' } : { aspectRatio: '16 / 9' };
    const gridCols = isShort ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2';
    const btnGradient = isShort ? 'from-pink-600 to-purple-500' : 'from-red-600 to-orange-500';
    const isBusy = isThisTypeBusy(type);
    const isPlanning = isShort ? isPlanningShort : isPlanningLong;
    
    // [NEW] Button Text Change
    const buttonText = referenceImage 
        ? `✨ 이 스타일로 ${isShort ? '숏폼' : '롱폼'} 4종 복제` 
        : `${isShort ? '📱' : '📺'} AI 랜덤 기획 4종 생성`;

    const buttonClass = referenceImage
        ? `bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:scale-105 shadow-blue-500/30`
        : `bg-gradient-to-r ${btnGradient} hover:scale-105`;

    return (
        <div className="mb-8 last:mb-0 animate-fade-in">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                <div className="flex items-center gap-3">
                   <h3 className="font-bold text-xl text-white flex items-center gap-2">
                     {isShort ? "📱" : "📺"} {title}
                   </h3>
                </div>
                
                <div className="flex items-center gap-4">
                  {isPlanning && (
                    <p className="text-sm text-blue-400 font-bold animate-pulse hidden md:block">
                      {PLANNING_MESSAGES[planningMsgIndex]}
                      {elapsedPlan > 0 && <span className="text-xs text-gray-400 tabular-nums ml-2">{formatElapsed(elapsedPlan)}</span>}
                    </p>
                  )}
                  <button
                    onClick={() => handleStartGeneration(type)}
                    disabled={isBusy}
                    className={`px-5 py-2 rounded-full font-bold shadow-lg transition-all text-base flex items-center gap-2 ${isBusy ? 'bg-gray-600 cursor-not-allowed opacity-50' : `${buttonClass} text-white`}`}
                  >
                    {isPlanning ? '기획 중...' : items.some(t => t.isGenerating) ? '생성 중...' : buttonText}
                  </button>
                </div>
            </div>

            {items.length > 0 ? (
                <div className={`grid ${gridCols} gap-6`}>
                {items.map((thumb: any, idx) => (
                    <div key={thumb.id} className="flex flex-col gap-2">
                        <div className={`relative ${cardAspectRatio} bg-black rounded-lg overflow-hidden border border-gray-700 hover:border-white transition-colors shadow-lg ${thumb.imageUrl ? 'cursor-pointer' : ''}`} style={cardAspectStyle} onClick={() => { if (thumb.imageUrl) setToolbarId(toolbarId === thumb.id ? null : thumb.id); }}>

                            {/* Shot size badge — bottom-left overlay */}
                            {thumb.shotSize && (
                                <div className="absolute bottom-2 left-2 z-30">
                                    <span className="text-[10px] bg-black/70 text-white/90 px-1.5 py-0.5 rounded font-bold backdrop-blur-sm">
                                        {SHOT_ABBR[thumb.shotSize] || thumb.shotSize.replace(/_/g, ' ')}
                                    </span>
                                </div>
                            )}
                            {/* HQ badge — top-right, only when ON */}
                            {thumb.isNativeHQ && (
                                <div className="absolute top-2 right-2 z-30">
                                    <span className="text-[10px] bg-orange-600/90 text-white px-1.5 py-0.5 rounded font-bold backdrop-blur-sm shadow-[0_0_6px_rgba(249,115,22,0.5)]">HQ</span>
                                </div>
                            )}

                            {thumb.imageUrl ? (
                                <>
                                    <img src={thumb.imageUrl} alt={`Thumbnail ${idx+1}`} className={`w-full h-full ${isShort ? 'object-contain' : 'object-cover'} opacity-0 transition-opacity duration-300`} loading="lazy" decoding="async" onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} />
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-900/50">
                                    <span className="text-gray-500 text-sm">{thumb.generationStatus || "대기 중"}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            generateSingleThumbnail(thumb.id, thumb.textOverlay, thumb.visualDescription, isShort ? AspectRatio.PORTRAIT : AspectRatio.LANDSCAPE, undefined, thumb.primaryColorHex, thumb.secondaryColorHex, thumb.colorMode, idx, thumb.isNativeHQ, thumb.sentiment, thumb.highlight, thumb.shotSize, thumb.poseDescription, thumb.cameraAngle);
                                        }}
                                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded border border-gray-600 font-bold transition-colors shadow-lg flex items-center gap-1"
                                    >
                                        🔄 재생성
                                    </button>
                                </div>
                            )}
                            {thumb.isGenerating && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 p-2 text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-blue-500 border-gray-600 mb-2"></div>
                                    <span className="text-sm font-bold text-blue-400 mb-1">
                                        {thumb.generationStatus || "생성 중..."}
                                    </span>
                                    {thumb.isNativeHQ && <span className="text-xs text-orange-400 font-bold mt-1">Native HQ 적용 중</span>}
                                    
                                    {/* [NEW] Cancel Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCancel(thumb.id);
                                        }}
                                        className="mt-3 px-2 py-1 bg-red-900/60 hover:bg-red-800 border border-red-700 text-red-200 text-xs rounded font-bold transition-colors flex items-center gap-1"
                                    >
                                        ⛔ 취소
                                    </button>
                                </div>
                            )}
                            
                            {/* Original Prompt Editing Modal */}
                            {editingId === thumb.id && (
                                <div className="absolute inset-0 bg-gray-900/95 z-30 p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
                                    <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="수정 피드백..." className="flex-grow bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white resize-none" />
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-700 py-1 rounded text-sm">취소</button>
                                        <button onClick={(e) => handleEditSubmit(e as any, thumb)} className="flex-1 bg-blue-600 py-1 rounded text-sm font-bold">적용</button>
                                    </div>
                                </div>
                            )}

                            {/* [UPDATED] Text Style Editor Modal */}
                            {textEditingId === thumb.id && (
                                <div className="absolute inset-0 bg-gray-900/95 z-40 p-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                    <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-1">
                                        <span className="text-orange-400">📝</span> 텍스트 스타일 에디터
                                    </h4>
                                    <ThumbnailTextStyleEditor
                                        thumb={thumb}
                                        onSubmit={(text, presetId, fontHintId, color, position, scale) =>
                                            handleStyledTextEditSubmit(thumb.id, text, presetId, fontHintId, color, position, scale)
                                        }
                                        onCancel={() => setTextEditingId(null)}
                                    />
                                </div>
                            )}

                            {/* [NEW] Post Processor Modal */}
                            {postProcessId === thumb.id && thumb.imageUrl && (
                                <div className="absolute inset-0 bg-gray-900/95 z-40 p-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                    <h4 className="text-white font-bold text-sm mb-2 flex items-center gap-1">
                                        <span className="text-blue-400">🎛️</span> 후처리 (밝기/대비/채도)
                                    </h4>
                                    <ThumbnailPostProcessor
                                        imageUrl={thumb.imageUrl}
                                        onApply={(base64) => handlePostProcessApply(thumb.id, base64)}
                                        onCancel={() => setPostProcessId(null)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Toolbar modal — fixed overlay */}
                        {toolbarId === thumb.id && thumb.imageUrl && (
                          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={() => setToolbarId(null)}>
                            <div ref={toolbarModalRef} className="bg-gray-900 border border-gray-600 rounded-2xl p-5 shadow-2xl max-w-xs w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
                              <div className="grid grid-cols-3 gap-3">
                                <button onClick={() => { setToolbarId(null); onImageClick && onImageClick(thumb.imageUrl!); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="확대">
                                  <span className="text-2xl">🔍</span>
                                  <span className="text-xs text-white/80 font-bold">확대</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); handleDownload(thumb.imageUrl!, idx, type, thumb.textOverlay); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="다운로드">
                                  <span className="text-2xl">⬇</span>
                                  <span className="text-xs text-white/80 font-bold">다운로드</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); generateSingleThumbnail(thumb.id, thumb.textOverlay, thumb.visualDescription, isShort ? AspectRatio.PORTRAIT : AspectRatio.LANDSCAPE, undefined, thumb.primaryColorHex, thumb.secondaryColorHex, thumb.colorMode, idx, thumb.isNativeHQ, thumb.sentiment, thumb.highlight, thumb.shotSize, thumb.poseDescription, thumb.cameraAngle); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="재생성">
                                  <span className="text-2xl">🔄</span>
                                  <span className="text-xs text-white/80 font-bold">재생성</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); setEditingId(thumb.id); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="수정">
                                  <span className="text-2xl">✏️</span>
                                  <span className="text-xs text-white/80 font-bold">수정</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); setTextEditingId(thumb.id); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="문구 수정">
                                  <span className="text-2xl font-black text-white">T</span>
                                  <span className="text-xs text-white/80 font-bold">문구</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); setPostProcessId(thumb.id); }} className="flex flex-col items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-3 transition-colors" title="후처리">
                                  <span className="text-2xl">🎛️</span>
                                  <span className="text-xs text-white/80 font-bold">후처리</span>
                                </button>
                                <button onClick={() => { setToolbarId(null); handleToggleNativeHQ(thumb.id, thumb.isNativeHQ || false); }} className={`flex flex-col items-center gap-1.5 backdrop-blur rounded-xl px-3 py-3 transition-colors ${thumb.isNativeHQ ? 'bg-orange-600/40 hover:bg-orange-600/60' : 'bg-white/10 hover:bg-white/20'}`} title="Native HQ 토글">
                                  <span className="text-2xl">{thumb.isNativeHQ ? '🔥' : '🚀'}</span>
                                  <span className={`text-xs font-bold ${thumb.isNativeHQ ? 'text-orange-300' : 'text-white/80'}`}>HQ</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                            className="flex justify-between items-center bg-gray-900 rounded-b p-2 border border-gray-700 cursor-pointer hover:bg-gray-800 group/title transition-colors mt-0"
                            onClick={() => thumb.fullTitle && copyToClipboard(thumb.fullTitle, thumb.id)}
                        >
                            <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: thumb.primaryColorHex || '#444' }}></div>
                            <span className={`text-sm font-medium leading-tight line-clamp-2 flex-1 ml-2 ${copiedId === thumb.id ? 'text-green-400 font-bold' : 'text-gray-300 group-hover/title:text-white'}`} title={thumb.fullTitle}>
                                {copiedId === thumb.id ? "✅ 제목 복사됨!" : (thumb.fullTitle || "제목 없음")}
                            </span>
                        </div>
                    </div>
                ))}
                </div>
            ) : (
                <div className="text-center py-6 border-2 border-dashed border-gray-700 rounded-lg bg-gray-800/30">
                    <p className="text-gray-500 text-base">생성 버튼을 눌러 {type === 'long' ? '롱폼' : '숏폼'} 컨셉을 확인하세요.</p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="mb-8 bg-gray-900/80 backdrop-blur rounded-xl border border-gray-700 shadow-xl overflow-hidden p-6">
      <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
          🖼️ AI 썸네일 스튜디오
      </h2>

      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      <input type="file" ref={refInputRef} onChange={handleRefUpload} accept="image/*" className="hidden" />

      {/* Reference Style Section */}
      {!hideReferenceArea && renderReferenceArea()}

      {videoFormat === VideoFormat.LONG ? (
          <>
            {renderSection("YouTube 롱폼 썸네일 (16:9)", "long", longThumbnails)}
            <div className="h-px bg-gray-800 my-6"></div>
            {renderSection("Shorts / Reels 썸네일 (9:16)", "short", shortThumbnails)}
          </>
      ) : (
          <>
            {renderSection("Shorts / Reels 썸네일 (9:16)", "short", shortThumbnails)}
            <div className="h-px bg-gray-800 my-6"></div>
            {renderSection("YouTube 롱폼 썸네일 (16:9)", "long", longThumbnails)}
          </>
      )}
    </div>
  );
};

export default ThumbnailGenerator;