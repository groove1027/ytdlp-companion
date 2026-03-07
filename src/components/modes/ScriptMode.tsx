
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AspectRatio, ProjectConfig, VoiceName, ImageModel, VideoFormat, VideoModel, CharacterAppearance, PreGeneratedImage, Scene, ScriptModeState } from '../../types';
import { RATIOS, IMAGE_MODELS, VIDEO_FORMATS, PRICING } from '../../constants';
import VisualStylePicker, { getVisualStyleLabel } from '../VisualStylePicker';
import { estimateSceneCount, analyzeScriptContext, generateStylePreviewPrompts, generateSceneImage, analyzeImageUnified } from '../../services/geminiService';
import { uploadMediaToHosting } from '../../services/uploadService';
import { resizeImage, base64ToFile } from '../../services/imageProcessingService';
// import { getRemoveBgKey } from '../../services/apiService';
// import { removeBackground } from '../../services/removeBgService';
import { showToast } from '../../stores/uiStore';
import { useCostStore } from '../../stores/costStore';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';

interface ScriptModeProps {
    onNext: (config: ProjectConfig) => void;
    isLoading: boolean;
    onSetProcessing: (active: boolean, message?: string, mode?: string) => void; 
    onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void; 
    linkedCharacterImage?: string; 
    linkedCharacterPublicUrl?: string; 
    cachedAnalysis?: { style: string, character: string } | null; 
    onAnalysisComplete?: (data: { style: string, character: string }) => void;
    initialState?: ScriptModeState | null;
    onSaveState?: (state: ScriptModeState) => void;
}

// [DISABLED] Remove.bg Tip Component — remove.bg 기능 비활성화
// const RemoveBgTip = () => {
//     const hasKey = !!getRemoveBgKey();
//     return (
//         <div className={`mt-3 border rounded-lg p-3 flex flex-col md:flex-row items-center justify-between gap-3 animate-fade-in ${hasKey ? 'bg-green-900/30 border-green-500/30' : 'bg-amber-900/30 border-amber-500/30'}`}>
//             <div className={`text-base leading-relaxed ${hasKey ? 'text-green-100/90' : 'text-amber-100/90'}`}>
//                 <span className="text-lg mr-1">{hasKey ? '✅' : '💡'}</span>
//                 {hasKey
//                     ? <>
//                         <strong>자동 누끼 제거 활성화됨:</strong> 이미지 업로드 시 AI가 자동으로 배경을 지워줍니다. (월 50회 무료)<br/>
//                         <span className="block mt-1 text-base">* 자주 사용하는 캐릭터는 <strong>PNG 저장</strong>을 눌러 보관해 주세요!</span>
//                       </>
//                     : <><strong>꿀팁:</strong> 배경이 제거된 캐릭터 이미지를 사용하면, AI 인식률이 대폭 상승합니다! (API 설정에서 키 등록)</>
//                 }
//             </div>
//             {!hasKey && (
//                 <button
//                     onClick={() => window.open('https://www.remove.bg/ko', '_blank')}
//                     className="flex-shrink-0 bg-amber-600 hover:bg-amber-500 text-white text-base font-bold px-4 py-2 rounded-full shadow-lg transition-colors flex items-center gap-1 whitespace-nowrap"
//                 >
//                     ✂️ 무료 누끼 따기 (remove.bg)
//                 </button>
//             )}
//         </div>
//     );
// };

const ScriptMode: React.FC<ScriptModeProps> = ({ 
    onNext, 
    isLoading, 
    onSetProcessing, 
    onCostAdd,
    linkedCharacterImage, 
    linkedCharacterPublicUrl,
    cachedAnalysis,
    onAnalysisComplete,
    initialState,
    onSaveState
}) => {
    // Isolated State for Script Mode (Initialized with props or defaults)
    const [script, setScript] = useState(initialState?.script || '');
    const [atmosphere, setAtmosphere] = useState(initialState?.atmosphere || '');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialState?.aspectRatio || AspectRatio.LANDSCAPE);
    const [videoFormat, setVideoFormat] = useState<VideoFormat>(initialState?.videoFormat || VideoFormat.SHORT);
    const [longFormSplitType, setLongFormSplitType] = useState<'DEFAULT' | 'DETAILED'>(initialState?.longFormSplitType || 'DEFAULT'); // [NEW] Long Form Split State
    const [imageModel, setImageModel] = useState<ImageModel>(initialState?.imageModel || ImageModel.NANO_COST);
    
    // UI Options
    const [allowInfographics, setAllowInfographics] = useState(initialState?.allowInfographics ?? false);
    const [characterAppearance, setCharacterAppearance] = useState<CharacterAppearance>(initialState?.characterAppearance || CharacterAppearance.AUTO);
    const [smartSplit, setSmartSplit] = useState(initialState?.smartSplit ?? true);
    const [isMixedMedia, setIsMixedMedia] = useState(initialState?.isMixedMedia ?? false); 
    const [textForceLock, setTextForceLock] = useState(initialState?.textForceLock ?? false); 
    const [suppressText, setSuppressText] = useState(initialState?.suppressText ?? false); // [NEW] Suppress Text Mode
    
    // [NEW] Estimation State (Restored if available)
    const [estimatedScenes, setEstimatedScenes] = useState<number>(initialState?.estimatedScenes || 0);
    const [isEstimating, setIsEstimating] = useState(false);
    const [cachedContextData, setCachedContextData] = useState<Record<string, any> | null>(null);
    
    // Asset State
    const [charImageBase64, setCharImageBase64] = useState<string | undefined>(initialState?.charImageBase64);
    const [charPublicUrl, setCharPublicUrl] = useState<string | undefined>(initialState?.charPublicUrl);
    const [prodImageBase64, setProdImageBase64] = useState<string | undefined>(initialState?.prodImageBase64);
    const [prodPublicUrl, setProdPublicUrl] = useState<string | undefined>(initialState?.prodPublicUrl);

    // [NEW] Background Removal States
    const [isRemovingBgChar, setIsRemovingBgChar] = useState(false);
    const [isRemovingBgProd, setIsRemovingBgProd] = useState(false);

    // Analysis & Upload State (Local)
    // Initialize with cached data if available, or saved state
    const [styleDescription, setStyleDescription] = useState<string>(cachedAnalysis?.style || initialState?.styleDescription || '');
    const [characterDescription, setCharacterDescription] = useState<string>(cachedAnalysis?.character || initialState?.characterDescription || '');
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const analyzingElapsed = useElapsedTimer(isAnalyzing);
    const [isUploadingChar, setIsUploadingChar] = useState(false);
    const [isUploadingProd, setIsUploadingProd] = useState(false);
    
    // UI Interaction
    // expandedStyleCategory state moved into VisualStylePicker
    const [isDragOverChar, setIsDragOverChar] = useState(false);
    const [isDragOverProd, setIsDragOverProd] = useState(false);

    // [NEW] Style Reference Image State
    const [styleRefBase64, setStyleRefBase64] = useState<string | undefined>(initialState?.styleRefBase64);
    const [isAnalyzingStyleRef, setIsAnalyzingStyleRef] = useState(false);
    const [isDragOverStyleRef, setIsDragOverStyleRef] = useState(false);
    const styleRefInputRef = useRef<HTMLInputElement>(null);

    // [NEW] Preview Mode State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewImages, setPreviewImages] = useState<{
        intro?: PreGeneratedImage;
        highlight?: PreGeneratedImage;
    }>({});
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const prodInputRef = useRef<HTMLInputElement>(null);

    // [FIX: BUG-12] Ref to track latest script value for race condition prevention
    const scriptRef = useRef(script);
    useEffect(() => { scriptRef.current = script; }, [script]);

    // [NEW] Persist State on Changes
    useEffect(() => {
        if (onSaveState) {
            onSaveState({
                script,
                atmosphere,
                aspectRatio,
                videoFormat,
                longFormSplitType, // [NEW] Persist
                imageModel,
                allowInfographics,
                characterAppearance,
                smartSplit,
                isMixedMedia,
                textForceLock,
                suppressText, // [NEW] Persist
                charImageBase64,
                charPublicUrl,
                prodImageBase64,
                prodPublicUrl,
                styleRefBase64, // [NEW] Persist style reference
                styleDescription,
                characterDescription,
                estimatedScenes // Save this too
            });
        }
    }, [
        script, atmosphere, aspectRatio, videoFormat, longFormSplitType, imageModel, allowInfographics, characterAppearance,
        smartSplit, isMixedMedia, textForceLock, suppressText, charImageBase64, charPublicUrl, prodImageBase64,
        prodPublicUrl, styleRefBase64, styleDescription, characterDescription, estimatedScenes, onSaveState
    ]);

    // [M2 FIX] Wrapped in useCallback to prevent stale closure in useEffect
    const runGeminiAnalysis = useCallback(async (base64: string) => {
        setIsAnalyzing(true);
        try {
            const result = await analyzeImageUnified(base64);
            setStyleDescription(result.style);
            setCharacterDescription(result.character);

            // Cost is auto-tracked inside evolinkChat()

            // [NEW] Update Parent Cache
            if (onAnalysisComplete) {
                onAnalysisComplete({ style: result.style, character: result.character });
            }
        } catch (e) {
            console.warn(e);
            setStyleDescription("High quality style.");
            setCharacterDescription("A character.");
        } finally { setIsAnalyzing(false); }
    }, [onCostAdd, onAnalysisComplete]);

    // [NEW] Effect to handle linked character from CharacterMode
    useEffect(() => {
        if (linkedCharacterImage && linkedCharacterImage !== charImageBase64) {
            setCharImageBase64(linkedCharacterImage);
            if (linkedCharacterPublicUrl) setCharPublicUrl(linkedCharacterPublicUrl);
            else setCharPublicUrl(undefined);

            // [UPDATED] Check Cache before Analysis
            if (cachedAnalysis && cachedAnalysis.style && cachedAnalysis.character) {
                setStyleDescription(cachedAnalysis.style);
                setCharacterDescription(cachedAnalysis.character);
                console.log("[ScriptMode] Using cached analysis result. (No Charge)");
            } else {
                runGeminiAnalysis(linkedCharacterImage);
            }
        }
    }, [linkedCharacterImage, linkedCharacterPublicUrl, cachedAnalysis, runGeminiAnalysis]);

    // Effect: Auto-switch ratio based on format
    useEffect(() => {
        if (videoFormat === VideoFormat.SHORT) setAspectRatio(AspectRatio.PORTRAIT);
        else if (videoFormat === VideoFormat.NANO) setAspectRatio(AspectRatio.PORTRAIT);
        else setAspectRatio(AspectRatio.LANDSCAPE);
    }, [videoFormat]);

    // [UPGRADED] 대본/설정 변경 시 캐시 무효화 (수동 분석을 다시 하도록 유도)
    useEffect(() => {
        // MANUAL MODE는 AI 불필요 — 줄 수로 즉시 계산
        if (!smartSplit) {
            const lineCount = script.split('\n').filter(l => l.trim()).length;
            setEstimatedScenes(lineCount);
            if (cachedContextData) {
                setCachedContextData(null);
            }
            return;
        }
        // 대본이나 설정이 바뀌면 캐시 무효화 → 사용자가 다시 버튼 클릭하도록
        if (cachedContextData) {
            setCachedContextData(null);
            setEstimatedScenes(0);
        }
    }, [script, videoFormat, smartSplit, longFormSplitType]);

    // [FIXED: BUG-12] 수동 예상 컷수 계산 — Pro/Thinking 모델로 정밀 분석
    // Race condition fix: capture script snapshot and compare with scriptRef.current after async
    const handleEstimateScenes = async () => {
        if (!script.trim()) return;
        const scriptSnapshot = script; // Capture script at call time
        setIsEstimating(true);
        setCachedContextData(null);
        setEstimatedScenes(0);
        try {
            const contextData = await analyzeScriptContext(
                scriptSnapshot,
                (c) => onCostAdd && onCostAdd(c, 'analysis'),
                videoFormat,
                smartSplit,
                videoFormat === VideoFormat.LONG ? longFormSplitType : undefined
            );
            // [FIX: BUG-12] Discard stale result if script changed during async operation
            if (scriptRef.current !== scriptSnapshot) {
                console.log("[ScriptMode] Script changed during estimation, discarding stale result.");
                return;
            }
            const count = typeof contextData.estimatedSceneCount === 'number' && contextData.estimatedSceneCount > 0
                ? contextData.estimatedSceneCount : 0;
            setEstimatedScenes(count > 0 ? count : -1);
            setCachedContextData(contextData);
            console.log(`[ScriptMode] Pro/Thinking analysis complete -> ${count} scenes, cached`);
        } catch (e) {
            console.error("[ScriptMode] Pro estimation failed, fallback to Flash:", e);
            // [FIX: BUG-12] Check again before fallback
            if (scriptRef.current !== scriptSnapshot) {
                console.log("[ScriptMode] Script changed during estimation, discarding stale fallback.");
                return;
            }
            try {
                const count = await estimateSceneCount(
                    scriptSnapshot, videoFormat, smartSplit,
                    (c) => onCostAdd && onCostAdd(c, 'analysis'),
                    videoFormat === VideoFormat.LONG ? longFormSplitType : undefined
                );
                // [FIX: BUG-12] Final check after fallback async
                if (scriptRef.current !== scriptSnapshot) {
                    console.log("[ScriptMode] Script changed during fallback estimation, discarding stale result.");
                    return;
                }
                setEstimatedScenes(count);
            } catch { setEstimatedScenes(-1); }
        } finally {
            setIsEstimating(false);
        }
    };

    const processImageFile = async (file: File) => {
        try {
            // [OPTIMISTIC UI] 1. 즉시 원본 이미지를 화면에 표시
            // 배경 제거 대기 시간 동안 사용자가 멈춘 화면을 보지 않도록 함
            const originalBase64 = await resizeImage(file, 768, 'image/png');
            setCharImageBase64(originalBase64);

            const processedFile = file;

            // [DISABLED] Remove.bg 배경 제거 비활성화
            // if (getRemoveBgKey()) {
            //     setIsRemovingBgChar(true);
            //     try {
            //         processedFile = await removeBackground(file);
            //         useCostStore.getState().addCost(PRICING.REMOVE_BG_PER_IMAGE, 'image');
            //         const processedBase64 = await resizeImage(processedFile, 768, 'image/png');
            //         setCharImageBase64(processedBase64);
            //     } catch (bgError) {
            //         console.warn("Background removal failed, using original.", bgError);
            //     } finally {
            //         setIsRemovingBgChar(false);
            //     }
            // }

            // 4. 분석 시작
            setIsAnalyzing(true); 
            
            // processedFile을 기준으로 다시 Base64 생성 (위에서 만들었지만 로직 일관성 유지)
            const base64ForAnalysis = await resizeImage(processedFile, 768, 'image/png');
            
            // 5. 분석 및 업로드 진행
            await runGeminiAnalysis(base64ForAnalysis);
            
            setIsUploadingChar(true);
            try {
                const transparentFile = base64ToFile(base64ForAnalysis, "char_anchor.png");
                const publicUrl = await uploadMediaToHosting(transparentFile);
                setCharPublicUrl(publicUrl);
            } catch (e: any) {
                showToast(`업로드 실패: ${e.message}`, 4000);
            } finally {
                setIsUploadingChar(false);
            }

        } catch (e) {
            console.error("Image processing failed", e);
            showToast("이미지 처리 실패", 3000);
            setIsAnalyzing(false);
            setIsRemovingBgChar(false);
        }
    };

    const processProductFile = async (file: File) => {
        try {
            // [OPTIMISTIC UI] 1. 즉시 원본 표시
            const originalBase64 = await resizeImage(file, 768);
            setProdImageBase64(originalBase64);

            const processedFile = file;

            // [DISABLED] Remove.bg 배경 제거 비활성화
            // if (getRemoveBgKey()) {
            //     setIsRemovingBgProd(true);
            //     try {
            //         processedFile = await removeBackground(file);
            //         useCostStore.getState().addCost(PRICING.REMOVE_BG_PER_IMAGE, 'image');
            //         const processedBase64 = await resizeImage(processedFile, 768);
            //         setProdImageBase64(processedBase64);
            //     } catch (bgError) {
            //         console.warn("Background removal failed, using original.", bgError);
            //     } finally {
            //         setIsRemovingBgProd(false);
            //     }
            // }

            // 4. 업로드
            setIsUploadingProd(true);
            try {
                const publicUrl = await uploadMediaToHosting(processedFile); // Upload the processed file
                setProdPublicUrl(publicUrl);
            } catch (e: any) {
                showToast(`업로드 실패: ${e.message}`, 4000);
            } finally {
                setIsUploadingProd(false);
            }
        } catch (e) { 
            console.error(e); 
            setIsRemovingBgProd(false);
        }
    };

    // [NEW] Style Reference Image Handler
    const processStyleRefFile = async (file: File) => {
        const base64 = await resizeImage(file, 768);
        setStyleRefBase64(base64);
        setIsAnalyzingStyleRef(true);
        try {
            const result = await analyzeImageUnified(base64);
            setAtmosphere(result.style);
            // Cost is auto-tracked inside evolinkChat()
        } catch (e) {
            console.error("Style reference analysis failed:", e);
        } finally {
            setIsAnalyzingStyleRef(false);
        }
    };

    const downloadImage = (base64: string, filename: string) => {
        const link = document.createElement('a');
        link.href = base64;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getPreviewAspectClass = () => {
        switch (aspectRatio) {
            case AspectRatio.PORTRAIT: return 'aspect-[9/16]';
            case AspectRatio.SQUARE: return 'aspect-square';
            case AspectRatio.CLASSIC: return 'aspect-[4/3]';
            default: return 'aspect-video';
        }
    };

    // [FIX] BUG-11: Inline style fallback for aspect ratio
    const getPreviewAspectStyle = (): React.CSSProperties => {
        switch (aspectRatio) {
            case AspectRatio.PORTRAIT: return { aspectRatio: '9 / 16' };
            case AspectRatio.SQUARE: return { aspectRatio: '1 / 1' };
            case AspectRatio.CLASSIC: return { aspectRatio: '4 / 3' };
            default: return { aspectRatio: '16 / 9' };
        }
    };

    // [MODIFIED] handleStylePreview Refactored for Sequential Execution & Immediate Upload
    const handleStylePreview = async () => {
        if (!script.trim()) { showToast("대본을 먼저 입력해주세요."); return; }
        
        setIsPreviewModalOpen(true);
        setIsPreviewLoading(true);
        setPreviewImages({});

        try {
            const effectiveStyle = atmosphere || styleDescription || "Cinematic";
            
            // 1. Generate Prompts
            const prompts = await generateStylePreviewPrompts(script, effectiveStyle, atmosphere);
            
            const dummyScene: Scene = { 
                id: 'preview', scriptText: '', visualPrompt: '', visualDescriptionKO: '', 
                characterPresent: !!charImageBase64, isGeneratingImage: true, isGeneratingVideo: false 
            };

            // 2. Generate Intro (Sequential Step 1)
            const resIntro = await generateSceneImage(
                { ...dummyScene, visualPrompt: prompts.intro },
                effectiveStyle, aspectRatio, ImageModel.NANO_COST,
                (charPublicUrl || charImageBase64) ? [charPublicUrl || charImageBase64!] : [],
                prodPublicUrl || prodImageBase64,
                undefined, undefined, true,
                undefined, isMixedMedia, styleDescription,
                textForceLock, // [NEW] Pass TextLock
                undefined,
                undefined,
                undefined, // shotSize
                undefined, // poseDescription
                suppressText, // [NEW] Pass Suppress
                undefined, // characterAnalysisResult — not used for preview
                0 // sceneIndex — intro preview
            );

            // 2.1 Upload Intro Immediately
            let introUrl = resIntro.url;
            if (introUrl.startsWith('data:')) {
                try {
                    const file = base64ToFile(introUrl, "preview_intro.png");
                    introUrl = await uploadMediaToHosting(file);
                } catch (e) {
                    console.error("Intro upload failed", e);
                }
            }

            // 2.2 Calculate Cost (Partial)
            if (onCostAdd) {
                onCostAdd(resIntro.isFallback ? PRICING.IMAGE_GENERATION_FALLBACK : PRICING.IMAGE_GENERATION, 'image');
            }

            // 2.3 Update State (Intro Done)
            setPreviewImages(prev => ({
                ...prev,
                intro: { type: 'INTRO', imageUrl: introUrl, prompt: prompts.intro }
            }));

            // 3. Generate Highlight (Sequential Step 2)
            const resHighlight = await generateSceneImage(
                { ...dummyScene, visualPrompt: prompts.highlight },
                effectiveStyle, aspectRatio, ImageModel.NANO_COST,
                (charPublicUrl || charImageBase64) ? [charPublicUrl || charImageBase64!] : [],
                prodPublicUrl || prodImageBase64,
                undefined, undefined, true,
                undefined, isMixedMedia, styleDescription,
                textForceLock, // [NEW] Pass TextLock
                undefined,
                undefined,
                undefined, // shotSize
                undefined, // poseDescription
                suppressText, // [NEW] Pass Suppress
                undefined, // characterAnalysisResult — not used for preview
                1 // sceneIndex — highlight preview
            );

            // 3.1 Upload Highlight Immediately
            let highlightUrl = resHighlight.url;
            if (highlightUrl.startsWith('data:')) {
                try {
                    const file = base64ToFile(highlightUrl, "preview_highlight.png");
                    highlightUrl = await uploadMediaToHosting(file);
                } catch (e) {
                    console.error("Highlight upload failed", e);
                }
            }

            // 3.2 Calculate Cost (Remaining)
            if (onCostAdd) {
                onCostAdd(resHighlight.isFallback ? PRICING.IMAGE_GENERATION_FALLBACK : PRICING.IMAGE_GENERATION, 'image');
            }

            // 3.3 Update State (Highlight Done)
            setPreviewImages(prev => ({
                ...prev,
                highlight: { type: 'HIGHLIGHT', imageUrl: highlightUrl, prompt: prompts.highlight }
            }));

        } catch (e: any) {
            showToast(`프리뷰 생성 실패: ${e.message}`, 4000);
            setIsPreviewModalOpen(false);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handlePreviewConfirm = () => {
        const finalScript = script.trim();
        if (!finalScript) { showToast("대본을 입력해주세요."); return; }
        onSetProcessing(true, "대본 검토 및 생성하기...", 'SCRIPT');

        onNext({
            mode: 'SCRIPT',
            script: finalScript,
            detectedStyleDescription: styleDescription,
            detectedCharacterDescription: characterDescription,
            imageModel: imageModel,
            videoModel: VideoModel.VEO,
            aspectRatio,
            voice: VoiceName.KORE,
            videoFormat,
            creationMode: 'CREATIVE',
            characterImage: charImageBase64,
            characterPublicUrl: charPublicUrl,
            productImage: prodImageBase64,
            productPublicUrl: prodPublicUrl,
            atmosphere: atmosphere.trim(),
            allowInfographics,
            characterAppearance,
            autoSplitLongScript: videoFormat === VideoFormat.LONG,
            smartSplit,
            textForceLock: textForceLock,
            suppressText: suppressText, // [NEW] Pass Suppress
            longFormSplitType: videoFormat === VideoFormat.LONG ? longFormSplitType : undefined, // [NEW] Pass Split Type
            useTopazForGrok: false,
            isThumbnailOnlyMode: false,
            isMixedMedia: isMixedMedia,
            preGeneratedImages: previewImages,
            estimatedScenes: estimatedScenes > 0 ? estimatedScenes : undefined,
            cachedContextData: cachedContextData || undefined // [NEW] Pro 분석 결과 캐시 재활용
        });
        setIsPreviewModalOpen(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalScript = script.trim();
        if (!finalScript) { showToast("대본을 입력해주세요."); return; }

        onSetProcessing(true, "대본 검토 및 생성하기...", 'SCRIPT');

        onNext({
            mode: 'SCRIPT',
            script: finalScript,
            detectedStyleDescription: styleDescription,
            detectedCharacterDescription: characterDescription,
            imageModel: imageModel,
            videoModel: VideoModel.VEO,
            aspectRatio,
            voice: VoiceName.KORE,
            videoFormat,
            creationMode: 'CREATIVE',
            characterImage: charImageBase64,
            characterPublicUrl: charPublicUrl,
            productImage: prodImageBase64,
            productPublicUrl: prodPublicUrl,
            atmosphere: atmosphere.trim(),
            allowInfographics,
            characterAppearance,
            autoSplitLongScript: videoFormat === VideoFormat.LONG,
            smartSplit,
            textForceLock: textForceLock,
            suppressText: suppressText, // [NEW] Pass Suppress
            longFormSplitType: videoFormat === VideoFormat.LONG ? longFormSplitType : undefined, // [NEW] Pass Split Type
            useTopazForGrok: false,
            isThumbnailOnlyMode: false,
            isMixedMedia: isMixedMedia,
            preGeneratedImages: previewImages,
            estimatedScenes: estimatedScenes > 0 ? estimatedScenes : undefined,
            cachedContextData: cachedContextData || undefined // [NEW] Pro 분석 결과 캐시 재활용
        });
    };

    // Calculate display cost safely
    const safeSceneCount = estimatedScenes < 0 ? 0 : estimatedScenes;
    const estimatedInputTokens = script.length > 0 ? Math.ceil(script.length / 3) : 0;
    const flashEstimationCost = (estimatedInputTokens / 1000000) * PRICING.GEMINI_FLASH_INPUT_PER_1M;
    const proInputCost = ((estimatedInputTokens + 500) / 1000000) * PRICING.GEMINI_PRO_INPUT_PER_1M;
    const proOutputCost = ((safeSceneCount * 200) / 1000000) * PRICING.GEMINI_PRO_OUTPUT_PER_1M;
    const generationCost = safeSceneCount * PRICING.IMAGE_GENERATION;
    const totalEstimatedCost = flashEstimationCost + proInputCost + proOutputCost + generationCost;

    const getSplitGuideContent = () => {
        // Sample text for simulation
        const exampleText = "갑자기 하늘에서 거대한 우주선이 내려왔다. 사람들은 비명을 지르며 뿔뿔이 도망쳤다. 나는 너무 무서워서 다리가 얼어붙고 말았다. 우주선의 문이 열리고 강렬한 빛이 쏟아졌다. 그 속에서 걸어 나온 건 귀여운 고양이였다.";

        if (!smartSplit) {
            return (
                <div className="bg-orange-900/30 border border-orange-500/30 rounded-xl p-4 animate-fade-in mb-3">
                    <h4 className="flex items-center gap-2 text-orange-200 font-bold mb-2 text-base">
                        <span className="text-lg">✂️</span> 수동 모드 (Manual)
                    </h4>
                    <p className="text-sm text-gray-300 mb-3">
                        ✂️ <strong>사용자 통제:</strong> AI의 판단을 배제합니다. 작가님이 <strong>엔터(줄바꿈)</strong>를 친 곳에서만 정확하게 자릅니다.
                    </p>
                </div>
            );
        }

        if (videoFormat === VideoFormat.LONG) {
            return (
                <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4 animate-fade-in mb-3">
                    <h4 className="flex items-center gap-2 text-purple-200 font-bold mb-2 text-base">
                        <span className="text-lg">{longFormSplitType === 'DEFAULT' ? '🐢' : '🐇'}</span> {longFormSplitType === 'DEFAULT' ? '호흡 중심 모드 (2문장 = 1장면)' : '디테일 중심 모드 (1문장 = 1장면)'}
                    </h4>

                    {longFormSplitType === 'DEFAULT' ? (
                        <>
                            <p className="text-sm text-gray-300 mb-3">
                                긴 호흡의 강의/세미나 스타일. <strong>2문장을 하나의 장면</strong>으로 합쳐 자연스러운 흐름을 유지합니다.
                            </p>
                            <div className="bg-black/40 p-3 rounded-lg border border-gray-600 space-y-2">
                                <p className="text-sm text-gray-400 font-bold">입력 예시 (5문장):</p>
                                <p className="text-sm text-gray-300 italic border-l-2 border-purple-500 pl-2">
                                    "18세기 영국의 산업혁명은 전 세계 역사를 완전히 바꿔놓았습니다. 증기기관의 발명으로 공장이 들어서기 시작했고 농촌 인구가 도시로 대거 이동했습니다. 하지만 노동자들의 삶은 오히려 더 비참해졌습니다. 하루 16시간 이상의 노동과 열악한 환경 속에서 아이들까지 공장에 투입되었습니다. 이러한 모순이 결국 노동운동의 불씨가 되었고 현대 복지국가의 기원이 되었습니다."
                                </p>
                                <p className="text-sm text-purple-300 font-bold mt-2">▼ AI 자동 분할 결과 → 3장면 (2문장씩 병합):</p>
                                <div className="bg-purple-900/40 p-2 rounded text-sm text-purple-100 mb-1">
                                    <strong>Scene 1 (2문장 병합):</strong> "18세기 영국의 산업혁명은 전 세계 역사를 완전히 바꿔놓았습니다. 증기기관의 발명으로 공장이 들어서기 시작했고 농촌 인구가 도시로 대거 이동했습니다."
                                </div>
                                <div className="bg-purple-900/40 p-2 rounded text-sm text-purple-100 mb-1">
                                    <strong>Scene 2 (2문장 병합):</strong> "하지만 노동자들의 삶은 오히려 더 비참해졌습니다. 하루 16시간 이상의 노동과 열악한 환경 속에서 아이들까지 공장에 투입되었습니다."
                                </div>
                                <div className="bg-purple-900/40 p-2 rounded text-sm text-purple-100">
                                    <strong>Scene 3 (나머지):</strong> "이러한 모순이 결국 노동운동의 불씨가 되었고 현대 복지국가의 기원이 되었습니다."
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-gray-300 mb-3">
                                빠른 컷 전환으로 시각적 디테일을 극대화. <strong>1문장 = 1장면</strong> 원칙. 단, <strong>물음표(?)</strong>는 답변과 합칩니다.
                            </p>
                            <div className="bg-black/40 p-3 rounded-lg border border-gray-600 space-y-2">
                                <p className="text-sm text-gray-400 font-bold">입력 예시 (5문장):</p>
                                <p className="text-sm text-gray-300 italic border-l-2 border-indigo-500 pl-2">
                                    "18세기 영국의 산업혁명은 전 세계 역사를 완전히 바꿔놓았습니다. 증기기관의 발명으로 공장이 들어서기 시작했고 농촌 인구가 도시로 대거 이동했습니다. 하지만 노동자들의 삶은 오히려 더 비참해졌습니다. 하루 16시간 이상의 노동과 열악한 환경 속에서 아이들까지 공장에 투입되었습니다. 이러한 모순이 결국 노동운동의 불씨가 되었고 현대 복지국가의 기원이 되었습니다."
                                </p>
                                <p className="text-sm text-indigo-300 font-bold mt-2">▼ AI 자동 분할 결과 → 5장면 (1문장=1장면):</p>
                                <div className="bg-indigo-900/40 p-2 rounded text-sm text-indigo-100 mb-1">
                                    <strong>Scene 1:</strong> "18세기 영국의 산업혁명은 전 세계 역사를 완전히 바꿔놓았습니다."
                                </div>
                                <div className="bg-indigo-900/40 p-2 rounded text-sm text-indigo-100 mb-1">
                                    <strong>Scene 2:</strong> "증기기관의 발명으로 공장이 들어서기 시작했고 농촌 인구가 도시로 대거 이동했습니다."
                                </div>
                                <div className="bg-indigo-900/40 p-2 rounded text-sm text-indigo-100 mb-1">
                                    <strong>Scene 3:</strong> "하지만 노동자들의 삶은 오히려 더 비참해졌습니다."
                                </div>
                                <div className="bg-indigo-900/40 p-2 rounded text-sm text-indigo-100 mb-1">
                                    <strong>Scene 4:</strong> "하루 16시간 이상의 노동과 열악한 환경 속에서 아이들까지 공장에 투입되었습니다."
                                </div>
                                <div className="bg-indigo-900/40 p-2 rounded text-sm text-indigo-100">
                                    <strong>Scene 5:</strong> "이러한 모순이 결국 노동운동의 불씨가 되었고 현대 복지국가의 기원이 되었습니다."
                                </div>
                            </div>
                        </>
                    )}
                </div>
            );
        } else if (videoFormat === VideoFormat.NANO) {
            return (
                <div className="bg-pink-900/30 border border-pink-500/30 rounded-xl p-4 animate-fade-in mb-3">
                    <h4 className="flex items-center gap-2 text-pink-200 font-bold mb-2 text-base">
                        <span className="text-lg">🚀</span> 나노/도파민 모드 (Nano-form)
                    </h4>
                    <p className="text-sm text-gray-300 mb-3">
                        숨 쉴 틈 없는 몰입감을 위해, <strong>접속사와 호흡 단위</strong>로 초단위 컷 편집을 합니다. (틱톡/릴스 스타일)
                    </p>
                    <div className="bg-black/40 p-3 rounded-lg border border-gray-600 space-y-2">
                        <p className="text-sm text-gray-400 font-bold">입력 (5줄):</p>
                        <p className="text-sm text-gray-300 italic border-l-2 border-pink-500 pl-2">
                            "{exampleText}"
                        </p>
                        <p className="text-sm text-pink-300 font-bold mt-2">▼ AI 자동 분할 결과 (비트 단위 컷팅):</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                "갑자기 하늘에서 (배경)", "거대한 우주선이 내려왔다 (등장)",
                                "사람들은 비명을 지르며 (공포)", "뿔뿔이 도망쳤다 (패닉)",
                                "나는 너무 무서워서 (감정)", "다리가 얼어붙고 말았다 (신체)",
                                "우주선의 문이 열리고 (변화)", "강렬한 빛이 쏟아졌다 (효과)",
                                "그 속에서 걸어 나온 건 (긴장)", "귀여운 고양이였다! (반전)"
                            ].map((sc, i) => (
                                <div key={i} className="bg-pink-900/40 p-2 rounded text-sm text-pink-100 truncate">
                                    <strong>S{i+1}:</strong> {sc}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        } else {
            return (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 animate-fade-in mb-3">
                    <h4 className="flex items-center gap-2 text-blue-200 font-bold mb-2 text-base">
                        <span className="text-lg">⚡</span> 숏폼 모드 (Short-form)
                    </h4>
                    <p className="text-sm text-gray-300 mb-3">
                        호흡을 빠르게 가져가기 위해, 문장 단위로 끊거나 하나의 문장 안에서도 행동이 바뀌면 장면을 나눕니다. 1.5~3초 간격의 빠른 템포로 지루할 틈을 주지 않습니다.
                    </p>
                    <div className="bg-black/40 p-3 rounded-lg border border-gray-600 space-y-2">
                        <p className="text-sm text-gray-400 font-bold">입력 (긴 호흡):</p>
                        <p className="text-sm text-gray-300 italic border-l-2 border-blue-500 pl-2">
                            "깊은 밤 창문 너머로 들려오는 빗소리에 잠을 깬 그는, 자리에서 일어나 낡은 서랍장을 열었고 그 속에서 빛바랜 사진 한 장을 꺼내 들며 한참을 말없이 바라보았습니다."
                        </p>
                        <p className="text-sm text-blue-300 font-bold mt-2">▼ AI 자동 분할 결과 (3컷 생성):</p>
                        <div className="space-y-1">
                            <div className="bg-blue-900/40 p-2 rounded text-sm text-blue-100">
                                <strong>Scene 1:</strong> "깊은 밤 창문 너머로 들려오는 빗소리에 잠을 깬 그는,"
                            </div>
                            <div className="bg-blue-900/40 p-2 rounded text-sm text-blue-100">
                                <strong>Scene 2:</strong> "자리에서 일어나 낡은 서랍장을 열었고"
                            </div>
                            <div className="bg-blue-900/40 p-2 rounded text-sm text-blue-100">
                                <strong>Scene 3:</strong> "그 속에서 빛바랜 사진 한 장을 꺼내 들며 한참을 말없이 바라보았습니다."
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="space-y-6 animate-fade-in relative">
            {/* ... (Keep existing Modals and top content unchanged) ... */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-700 bg-gray-900 sticky top-0 z-10 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                🎨 스타일 프리뷰 (2컷 테스트)
                            </h3>
                            <div className="text-sm text-gray-400 font-medium">
                                비용 발생: <span className="text-yellow-400 font-bold">$0.10 (완료)</span>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            {isPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="w-16 h-16 border-4 border-t-purple-500 border-r-blue-500 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                                    <p className="text-lg font-bold text-gray-200 animate-pulse">
                                        🎬 실제 대본의 [첫 번째 장면]과 [하이라이트 장면]을 미리 생성하고 있습니다...
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <div className={`bg-black rounded-lg ${getPreviewAspectClass()} overflow-hidden border border-gray-600 relative group`} style={getPreviewAspectStyle()}>
                                            {previewImages.intro?.imageUrl ? (
                                                <img src={previewImages.intro.imageUrl} className={`w-full h-full ${aspectRatio === AspectRatio.PORTRAIT ? 'object-contain' : 'object-cover'}`} alt="Intro" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-600">이미지 없음</div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/70 text-white text-sm px-2 py-1 rounded font-bold">
                                                Scene #1 (도입부)
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-400 bg-gray-900 p-2 rounded border border-gray-700 h-20 overflow-y-auto custom-scrollbar">
                                            Prompt: {previewImages.intro?.prompt}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className={`bg-black rounded-lg ${getPreviewAspectClass()} overflow-hidden border border-gray-600 relative group`} style={getPreviewAspectStyle()}>
                                            {previewImages.highlight?.imageUrl ? (
                                                <img src={previewImages.highlight.imageUrl} className={`w-full h-full ${aspectRatio === AspectRatio.PORTRAIT ? 'object-contain' : 'object-cover'}`} alt="Highlight" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-600">이미지 없음</div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-purple-900/80 text-white text-sm px-2 py-1 rounded font-bold">
                                                Scene #Highlight (클라이막스)
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-400 bg-gray-900 p-2 rounded border border-gray-700 h-20 overflow-y-auto custom-scrollbar">
                                            Prompt: {previewImages.highlight?.prompt}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!isPreviewLoading && (
                            <div className="p-6 border-t border-gray-700 bg-gray-900 flex justify-between gap-4">
                                <button
                                    onClick={() => setIsPreviewModalOpen(false)}
                                    className="flex-1 py-3 rounded-xl font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex items-center justify-center gap-2"
                                >
                                    ❌ 마음에 들지 않아요 (수정하기)
                                </button>
                                <button
                                    onClick={handlePreviewConfirm}
                                    className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
                                >
                                    <span>⚡ 좋아요! 이 스타일로 진행 (현재 이미지 사용)</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 text-base text-blue-200 mb-2">
                💡 <strong>대본 모드 사용법:</strong> 캐릭터 이미지를 올리면 모든 장면에 일관된 얼굴이 적용됩니다. 제품 사진을 올리면 해당 제품이 등장하는 영상을 만듭니다.
            </div>

            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-3">1. 참조 리소스 (선택 사항)</h3>
                
                <div className="bg-gray-800/80 border border-gray-600 rounded-lg p-5 mb-6 text-base text-gray-300 shadow-inner">
                     <strong className="block text-blue-400 mb-2 text-lg flex items-center gap-2">
                        📸 이미지를 업로드하지 않아도 됩니다!
                     </strong>
                     <p className="leading-relaxed mt-1 text-gray-300 mb-3">
                         비워두면 <strong>대본의 내용</strong>을 분석해 상황에 맞는 장면을 자동으로 그리거나,<br/>
                         3번에서 <strong>비주얼 스타일</strong>을 선택했다면 그 화풍을 적용하여 생성합니다.
                     </p>
                     <p className="pt-3 border-t border-gray-700 text-yellow-400 font-bold flex items-center gap-2">
                        <span className="text-lg">💡</span> 
                        <span>(단, 고정하고 싶은 특정 캐릭터가 있다면 '1. 메인 캐릭터'에 이미지를 추가해주세요.)</span>
                     </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            {/* [MODIFIED] Renumbering 1-1 to 1 */}
                            <label className="block text-xl font-bold text-blue-400 mb-2">1. 메인 캐릭터 (Anchor)</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()} 
                                onDragOver={(e) => { e.preventDefault(); setIsDragOverChar(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragOverChar(false); }}
                                onDrop={(e) => {
                                    e.preventDefault(); setIsDragOverChar(false);
                                    if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]);
                                }}
                                className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500 relative ${isDragOverChar ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 bg-gray-800 hover:bg-gray-700'}`}
                            >
                                {charImageBase64 ? (
                                    <div className="relative w-full h-full">
                                        <img src={charImageBase64} className="w-full h-full object-contain" alt="Character" />
                                        
                                        {linkedCharacterImage && charImageBase64 === linkedCharacterImage && (
                                            <div className="absolute top-0 left-0 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-br-lg font-bold shadow-md z-10 flex items-center gap-1">
                                                <span>✨</span> 캐릭터 모드 연동됨
                                            </div>
                                        )}

                                        {(isAnalyzing || isUploadingChar || isRemovingBgChar) && (
                                            <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center text-center p-4 backdrop-blur-sm animate-fade-in">
                                                 <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-blue-500 border-b-transparent border-l-blue-500 border-r-blue-500 mb-4"></div>
                                                 {isRemovingBgChar && <p className="text-base font-bold text-green-400 mb-2 animate-pulse">✂️ (월 50회 무료) 배경을 지우는 중...</p>}
                                                 {isUploadingChar && !isRemovingBgChar && <p className="text-base font-bold text-blue-300 mb-2">☁️ 클라우드 업로드 중...</p>}
                                                 {isAnalyzing && !isRemovingBgChar && !isUploadingChar && (
                                                     <>
                                                        <p className="text-lg font-bold text-white mb-2">✨ AI 캐릭터 분석 중...</p>
                                                        <p className="text-base text-yellow-400 font-bold animate-pulse">우측 패널에 정보가 곧 입력됩니다.</p>
                                                        {analyzingElapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(analyzingElapsed)}</span>}
                                                     </>
                                                 )}
                                            </div>
                                        )}
                                        
                                        {!isAnalyzing && !isUploadingChar && !isRemovingBgChar && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setCharImageBase64(undefined); setCharPublicUrl(undefined); }}
                                                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-md z-30"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                                
                                                <button
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        downloadImage(charImageBase64, `character_processed_${Date.now()}.png`); 
                                                    }}
                                                    className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white text-sm px-3 py-1.5 rounded-full border border-gray-500 shadow-lg z-30 font-bold flex items-center gap-1"
                                                >
                                                    <span>💾</span> PNG 저장
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-4xl mb-2">📸</span>
                                        <span className="text-base font-bold text-gray-400">이미지 업로드</span>
                                    </>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processImageFile(e.target.files[0])} accept="image/*" className="hidden" />
                            {/* [DISABLED] <RemoveBgTip /> */}
                        </div>

                        {/* [FIX: BUG-11] Product Image Upload Section */}
                        <div>
                            <label className="block text-xl font-bold text-green-400 mb-2">2. 제품 이미지 (선택)</label>
                            <div
                                onClick={() => prodInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOverProd(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragOverProd(false); }}
                                onDrop={(e) => {
                                    e.preventDefault(); setIsDragOverProd(false);
                                    if (e.dataTransfer.files?.[0]) processProductFile(e.dataTransfer.files[0]);
                                }}
                                className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden group focus:outline-none focus:ring-2 focus:ring-green-500 relative ${isDragOverProd ? 'border-green-500 bg-green-900/20' : 'border-gray-600 bg-gray-800 hover:bg-gray-700'}`}
                            >
                                {prodImageBase64 ? (
                                    <div className="relative w-full h-full">
                                        <img src={prodImageBase64} className="w-full h-full object-contain" alt="Product" />

                                        {(isUploadingProd || isRemovingBgProd) && (
                                            <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center text-center p-4 backdrop-blur-sm animate-fade-in">
                                                <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-green-500 border-b-transparent border-l-green-500 border-r-green-500 mb-4"></div>
                                                {isRemovingBgProd && <p className="text-base font-bold text-green-400 mb-2 animate-pulse">배경을 지우는 중...</p>}
                                                {isUploadingProd && !isRemovingBgProd && <p className="text-base font-bold text-green-300 mb-2">클라우드 업로드 중...</p>}
                                            </div>
                                        )}

                                        {!isUploadingProd && !isRemovingBgProd && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setProdImageBase64(undefined); setProdPublicUrl(undefined); }}
                                                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-md z-30"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-4xl mb-2">🛍️</span>
                                        <span className="text-base font-bold text-gray-400">제품 이미지 업로드</span>
                                        <span className="text-sm text-gray-500 mt-1">제품이 등장하는 영상을 만듭니다</span>
                                    </>
                                )}
                            </div>
                            <input type="file" ref={prodInputRef} onChange={(e) => e.target.files?.[0] && processProductFile(e.target.files[0])} accept="image/*" className="hidden" />
                        </div>
                    </div>

                    <div className="h-full">
                        <div className="border border-gray-700 rounded-xl p-6 bg-gray-800/50 h-full flex flex-col">
                            <h3 className="text-2xl font-bold text-purple-400 mb-4 flex items-center gap-2 shrink-0">
                                ✨ AI 분석 결과
                            </h3>
                            <div className="flex-grow flex flex-col gap-4">
                                <div className="flex-1 flex flex-col min-h-0">
                                    <label className="block text-sm font-bold text-gray-400 mb-1">🎨 감지된 예술 스타일</label>
                                    <textarea 
                                        value={styleDescription}
                                        onChange={(e) => setStyleDescription(e.target.value)}
                                        placeholder="자동 분석됨..."
                                        className="w-full flex-grow bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-base focus:border-purple-500 outline-none resize-none"
                                    />
                                </div>
                                <div className="flex-1 flex flex-col min-h-0">
                                    <label className="block text-sm font-bold text-gray-400 mb-1">👤 감지된 캐릭터 특징</label>
                                    <textarea 
                                        value={characterDescription} 
                                        onChange={(e) => setCharacterDescription(e.target.value)} 
                                        placeholder="자동 분석됨..." 
                                        className="w-full flex-grow bg-gray-900 border border-gray-600 rounded-lg p-3 text-base text-white resize-none focus:border-blue-500 outline-none" 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800 animate-fade-in-up">
                <h3 className="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-3">2. 포맷 및 설정 (Format & Target)</h3>
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-base font-bold text-gray-400 mb-2">자동 단락 나누기</label>
                            <div className="flex gap-0 rounded-lg overflow-hidden border border-gray-600">
                                {VIDEO_FORMATS.map(f => (
                                    <button 
                                        key={f.id} 
                                        type="button"
                                        onClick={() => setVideoFormat(f.id)}
                                        className={`flex-1 py-3 text-base font-bold transition-all ${
                                            videoFormat === f.id
                                            ? (f.id === VideoFormat.NANO ? 'bg-pink-600 text-white' : 'bg-blue-600 text-white')
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                {videoFormat === VideoFormat.LONG && '📎 긴 호흡의 강의/세미나 스타일. 여러 문장을 하나의 장면으로 합칩니다.'}
                                {videoFormat === VideoFormat.SHORT && '📎 유튜브 쇼츠/릴스 스타일. 1문장 = 1장면의 빠른 컷 전환.'}
                                {videoFormat === VideoFormat.NANO && '📎 틱톡/도파민 편집. 단어 수준의 초고속 분할로 컷 수를 극대화합니다.'}
                            </p>
                            {videoFormat === VideoFormat.LONG && (
                                <div className="flex bg-gray-900/50 p-1 rounded-lg border border-gray-600 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setLongFormSplitType('DEFAULT')}
                                        className={`flex-1 py-1.5 px-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${
                                            longFormSplitType === 'DEFAULT'
                                            ? 'bg-purple-600 text-white shadow-md'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                    >
                                        <span>🐢</span> 호흡 중심 (2문장=1장면)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLongFormSplitType('DETAILED')}
                                        className={`flex-1 py-1.5 px-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${
                                            longFormSplitType === 'DETAILED'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                    >
                                        <span>🐇</span> 디테일 중심 (1문장=1장면)
                                    </button>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-base font-bold text-gray-400 mb-2">이미지 모델</label>
                            <select value={imageModel} onChange={(e) => setImageModel(e.target.value as any)} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-base focus:border-blue-500 outline-none">
                                {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                            <p className="text-sm text-gray-500 mt-2">
                                * <strong>현존하는 최고의 이미지 생성 모델인 Nano Banana Pro를 사용합니다!!</strong>
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-base font-bold text-gray-400 mb-2">화면 비율</label>
                        <div className="grid grid-cols-3 gap-2">
                            {RATIOS.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setAspectRatio(r.id)}
                                    className={`py-3 rounded-lg border text-base font-bold transition-all ${aspectRatio === r.id ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                        3. 대본 (Script) 
                        <span className="text-sm bg-red-600 text-white px-2 py-0.5 rounded-full font-bold ml-1">🔴 필수</span>
                    </span>
                    
                    {/* 예상 컷수 표시 영역 */}
                    {estimatedScenes > 0 && cachedContextData && (
                        <div className="flex items-center gap-2 bg-green-900/30 px-3 py-1.5 rounded-lg border border-green-600/50">
                            <span className="text-sm text-green-300 font-bold">
                                ✅ {estimatedScenes}컷 예상
                            </span>
                            <span className="text-gray-600 text-sm">|</span>
                            <span className="text-sm text-green-400 font-bold">~${totalEstimatedCost.toFixed(3)}</span>
                        </div>
                    )}
                    {isEstimating && (
                        <div className="flex items-center gap-2 bg-blue-900/30 px-3 py-1.5 rounded-lg border border-blue-600/50 animate-pulse">
                            <span className="text-sm text-blue-300 font-bold">🧠 Pro 분석 중...</span>
                        </div>
                    )}
                    {estimatedScenes === -1 && (
                        <div className="flex items-center gap-2 bg-red-900/30 px-3 py-1.5 rounded-lg border border-red-600/50">
                            <span className="text-sm text-red-400 font-bold">⚠️ 분석 실패 — 다시 시도해주세요</span>
                        </div>
                    )}
                </h3>

                {/* [REMOVED] Deprecated Warning Banner (replaced by Range Display) */}

                <div className="flex flex-col gap-3 mb-2">
                    <label className="text-base font-bold text-gray-400">대본 입력 및 분할 방식</label>
                    
                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 mb-2">
                        <button
                            type="button"
                            onClick={() => setSmartSplit(true)}
                            className={`flex-1 py-3 px-4 rounded-md text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 ${
                                smartSplit 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                            }`}
                        >
                            <span className="text-base">🤖</span> AI 문맥 자동 분할
                        </button>
                        <button
                            type="button"
                            onClick={() => setSmartSplit(false)}
                            className={`flex-1 py-3 px-4 rounded-md text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 ${
                                !smartSplit 
                                ? 'bg-orange-600 text-white shadow-md' 
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                            }`}
                        >
                            <span className="text-base">✂️</span> 수동(Enter) 분할
                        </button>
                    </div>

                    {/* [NEW] 2-Column Grid for Text Control Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 1. Left: Text Force Lock (Language) */}
                        <div 
                            className={`relative p-4 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                                textForceLock 
                                ? 'bg-gradient-to-r from-orange-950 via-red-950/80 to-orange-950 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]' 
                                : 'bg-gray-900/50 border-gray-600 hover:border-gray-400 hover:bg-gray-800'
                            }`}
                        >
                            <label className="flex items-start gap-4 cursor-pointer z-10 relative">
                                <div className="relative flex items-center mt-1">
                                    <input 
                                        type="checkbox" 
                                        checked={textForceLock} 
                                        onChange={(e) => {
                                            setTextForceLock(e.target.checked);
                                            if(e.target.checked) setSuppressText(false); // Mutually Exclusive
                                        }} 
                                        className="peer sr-only"
                                    />
                                    <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${textForceLock ? 'bg-orange-600 shadow-[0_0_10px_#ea580c]' : 'bg-gray-700'}`}>
                                        <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${textForceLock ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                    </div>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className={`text-base font-black tracking-tight transition-colors ${textForceLock ? 'text-orange-200' : 'text-gray-300'}`}>
                                            🔠 텍스트 언어 강제 고정
                                        </span>
                                    </div>
                                    <div className={`text-sm space-y-1 leading-relaxed ${textForceLock ? 'text-orange-100/80' : 'text-gray-400'}`}>
                                        <p>배경 내 간판/표지판을 <strong>대본의 언어(한국어 등)</strong>로 강제 변환합니다.</p>
                                    </div>
                                </div>
                            </label>
                            {textForceLock && <div className="absolute inset-0 bg-orange-500/5 pointer-events-none animate-pulse"></div>}
                        </div>

                        {/* 2. Right: Suppress Text (No Text) */}
                        <div 
                            className={`relative p-4 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                                suppressText 
                                ? 'bg-gradient-to-r from-red-950 via-pink-950/80 to-red-950 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
                                : 'bg-gray-900/50 border-gray-600 hover:border-gray-400 hover:bg-gray-800'
                            }`}
                        >
                            <label className="flex items-start gap-4 cursor-pointer z-10 relative">
                                <div className="relative flex items-center mt-1">
                                    <input 
                                        type="checkbox" 
                                        checked={suppressText} 
                                        onChange={(e) => {
                                            setSuppressText(e.target.checked);
                                            if(e.target.checked) setTextForceLock(false); // Mutually Exclusive
                                        }} 
                                        className="peer sr-only"
                                    />
                                    <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${suppressText ? 'bg-red-600 shadow-[0_0_10px_#ef4444]' : 'bg-gray-700'}`}>
                                        <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${suppressText ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                    </div>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className={`text-base font-black tracking-tight transition-colors ${suppressText ? 'text-red-200' : 'text-gray-300'}`}>
                                            🚫 텍스트 생성 금지 (Clean Mode)
                                        </span>
                                    </div>
                                    <div className={`text-sm space-y-1 leading-relaxed ${suppressText ? 'text-red-100/80' : 'text-gray-400'}`}>
                                        <p>AI가 이미지 내에 <strong>어떤 글자도 생성하지 않도록</strong> 원천 차단합니다.</p>
                                    </div>
                                </div>
                            </label>
                            {suppressText && <div className="absolute inset-0 bg-red-500/5 pointer-events-none animate-pulse"></div>}
                        </div>
                    </div>

                    {getSplitGuideContent()}
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-3 text-sm text-yellow-200">
                    ⚠️ <strong>안내:</strong> 정확한 AI 분석을 위해 <strong>특수기호(*, [], " 등)는 자동으로 제거</strong>됩니다. 대본의 <strong>내용(텍스트)은 100% 유지</strong>되니 안심하세요!
                </div>

                <textarea 
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder={smartSplit 
                        ? "대본을 자유롭게 입력하세요. AI가 문맥을 파악해 자연스럽게 장면을 나눠드립니다..." 
                        : "장면을 나누고 싶은 곳에서 엔터(Enter)를 치세요. 빈 줄마다 컷이 나뉩니다..."
                    }
                    className="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-4 text-white focus:border-blue-500 outline-none resize-none text-base leading-relaxed"
                />

                {/* [NEW] 예상 컷수 계산 버튼 + 안내 */}
                {smartSplit && (
                    <div className="mt-4 mb-2">
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleEstimateScenes}
                                disabled={isEstimating || !script.trim()}
                                className={`px-5 py-3 rounded-xl font-bold text-base transition-all flex items-center gap-2 shadow-lg ${
                                    isEstimating
                                        ? 'bg-blue-800 text-blue-200 cursor-wait animate-pulse'
                                        : !script.trim()
                                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        : cachedContextData
                                        ? 'bg-green-700 hover:bg-green-600 text-white'
                                        : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white hover:scale-[1.02]'
                                }`}
                            >
                                {isEstimating ? (
                                    <><span className="animate-spin">🧠</span> Pro 모델 분석 중...</>
                                ) : cachedContextData ? (
                                    <>🔄 다시 계산하기</>
                                ) : (
                                    <>🧠 예상 컷수 계산하기</>
                                )}
                            </button>

                            {estimatedScenes > 0 && cachedContextData && (
                                <div className="flex items-center gap-2 bg-green-900/40 px-4 py-2.5 rounded-xl border border-green-500/50">
                                    <span className="text-base text-green-300 font-bold">🎬 {estimatedScenes}컷</span>
                                    <span className="text-gray-500">|</span>
                                    <span className="text-sm text-green-400">~${totalEstimatedCost.toFixed(3)}</span>
                                </div>
                            )}
                            {estimatedScenes === -1 && !isEstimating && (
                                <span className="text-sm text-red-400 font-bold">⚠️ 분석 실패 — 다시 시도해주세요</span>
                            )}
                        </div>

                        {!cachedContextData && !isEstimating && script.trim() && (
                            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                                💡 <strong className="text-gray-300">대본과 분할 방식을 확정한 뒤</strong> 위 버튼을 눌러주세요.
                                Pro AI가 대본의 맥락을 깊이 분석하여 정확한 예상 컷수를 계산하고,
                                <strong className="text-blue-400"> 프로젝트 생성 시 그대로 재활용</strong>되어 시간이 절약됩니다.
                            </p>
                        )}
                        {cachedContextData && (
                            <p className="text-sm text-green-400/80 mt-2">
                                ✅ 분석 완료! 이 결과는 프로젝트 생성 시 자동으로 재활용됩니다. 대본이나 설정을 변경하면 다시 계산해주세요.
                            </p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-700 animate-fade-in">
                    <div 
                        onClick={() => setAllowInfographics(!allowInfographics)}
                        className={`border rounded-xl p-5 cursor-pointer transition-all duration-300 flex items-center justify-center group ${allowInfographics ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-800 border-gray-600 hover:border-gray-500'}`}
                    >
                        <div className="flex-1 pr-4">
                            <h4 className={`text-xl font-bold flex items-center gap-2 mb-2 ${allowInfographics ? 'text-blue-400' : 'text-gray-300'}`}>
                                {allowInfographics ? '📊 인포그래픽 모드 (ON)' : '🎬 인포그래픽 모드 (OFF)'}
                            </h4>
                            <p className="text-base text-gray-400 leading-relaxed">
                                {allowInfographics ? "전문적인 도표나 정보를 넣을 때 활성화하세요." : "영상미와 몰입감에 집중합니다."}
                            </p>
                        </div>
                        <div className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${allowInfographics ? 'bg-blue-500' : 'bg-gray-600 group-hover:bg-gray-500'}`}>
                            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${allowInfographics ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-4">
                        <label className="block text-base font-bold text-gray-300 mb-4">👤 캐릭터 출연 빈도</label>
                        <div className="flex bg-gray-800 rounded-lg p-1 h-12">
                            {[
                                { id: CharacterAppearance.AUTO, label: '자동 (AI)' },
                                { id: CharacterAppearance.ALWAYS, label: '항상 (진행자)' },
                                { id: CharacterAppearance.MINIMAL, label: '최소화 (B-Roll)' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setCharacterAppearance(opt.id as CharacterAppearance)}
                                    className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${characterAppearance === opt.id ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 text-base text-gray-400 space-y-1">
                            <p>* <strong className="text-gray-300">자동:</strong> 대사가 있거나 행동이 중요할 때만 등장합니다.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-6 border-b border-gray-700 pb-2">4. 비주얼 스타일 (선택)</h3>
                
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 mb-6 text-base text-yellow-100">
                    <h4 className="font-bold text-yellow-400 mb-1 flex items-center gap-2">⚠️ 스타일 적용 우선순위 안내</h4>
                    <p className="opacity-90 leading-relaxed">이곳 설정을 선택하면 분석된 화풍 대신 해당 스타일이 우선 적용됩니다. 🔍 미리보기 이미지를 클릭하면 크게 확인할 수 있습니다.</p>
                </div>

                {/* [NEW] Style Reference Image Upload */}
                <div className="mb-6">
                    <label className="block text-base font-bold text-gray-300 mb-2 flex items-center gap-2">
                        🖼️ 레퍼런스 이미지로 스타일 추출
                    </label>
                    <div
                        onClick={() => styleRefInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOverStyleRef(true); }}
                        onDragLeave={(e) => { e.preventDefault(); setIsDragOverStyleRef(false); }}
                        onDrop={(e) => {
                            e.preventDefault(); setIsDragOverStyleRef(false);
                            if (e.dataTransfer.files?.[0]) processStyleRefFile(e.dataTransfer.files[0]);
                        }}
                        className={`w-full aspect-[3/1] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${
                            isDragOverStyleRef ? 'border-purple-500 bg-purple-900/20' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800'
                        }`}
                    >
                        {styleRefBase64 ? (
                            <div className="relative w-full h-full">
                                <img src={styleRefBase64} className="w-full h-full object-contain" alt="Style Reference" />
                                {isAnalyzingStyleRef && (
                                    <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm animate-fade-in">
                                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-purple-500 border-b-transparent border-l-purple-500 border-r-purple-500 mb-4"></div>
                                        <p className="text-base font-bold text-purple-300 animate-pulse">🎨 스타일 분석 중...</p>
                                    </div>
                                )}
                                {!isAnalyzingStyleRef && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setStyleRefBase64(undefined); setAtmosphere(''); }}
                                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-md z-30"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                <span className="text-3xl mb-1">🎨</span>
                                <span className="text-base font-bold text-gray-400">원하는 그림체의 이미지를 드래그하거나 클릭하세요</span>
                                <span className="text-sm text-gray-500 mt-1">AI가 스타일을 분석하여 자동으로 적용합니다</span>
                            </>
                        )}
                    </div>
                    <input type="file" ref={styleRefInputRef} onChange={(e) => e.target.files?.[0] && processStyleRefFile(e.target.files[0])} accept="image/*" className="hidden" />
                </div>

                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 border-t border-gray-700"></div>
                    <span className="text-sm text-gray-500 font-bold">또는 아래에서 직접 선택하세요</span>
                    <div className="flex-1 border-t border-gray-700"></div>
                </div>

                <div
                    className={`mb-6 p-4 rounded-xl border transition-all duration-300 ${
                        isMixedMedia 
                        ? 'bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                        : 'bg-gray-900/50 border-gray-600 hover:border-gray-500'
                    }`}
                >
                    <label className="flex items-start gap-4 cursor-pointer group">
                        <div className="relative flex items-center mt-1">
                            <input
                                type="checkbox"
                                checked={isMixedMedia}
                                onChange={(e) => setIsMixedMedia(e.target.checked)}
                                className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-gray-500 bg-gray-800 transition-all checked:border-indigo-400 checked:bg-indigo-500 hover:border-indigo-300"
                            />
                            <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 peer-checked:opacity-100 w-4 h-4 text-white" viewBox="0 0 14 14" fill="none">
                                <path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-base font-bold transition-colors ${isMixedMedia ? 'text-indigo-300' : 'text-gray-300'}`}>
                                    🎭 스타일 독립/혼합 모드 (Style Isolation)
                                </span>
                            </div>
                            <div className="text-sm text-gray-400 leading-relaxed">
                                <p>배경과 캐릭터의 화풍이 섞이지 않도록 분리합니다.</p>
                            </div>
                        </div>
                    </label>
                </div>
                
                <VisualStylePicker value={atmosphere} onChange={setAtmosphere} colorTheme="blue" />

                {atmosphere && (
                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 flex justify-between items-center animate-fade-in mb-4">
                        <span className="text-base text-purple-200 font-bold truncate pr-4">🎨 선택됨: {getVisualStyleLabel(atmosphere) || "사용자 직접 입력 모드"}</span>
                        <button onClick={() => setAtmosphere('')} className="text-sm text-red-400 hover:text-red-300 underline shrink-0">초기화</button>
                    </div>
                )}

                <div className="mt-2">
                    <label className="block text-base font-bold text-gray-400 mb-2">
                        스타일 상세 프롬프트 (자동 입력 / 직접 편집)
                    </label>
                    <textarea
                        value={atmosphere}
                        onChange={(e) => setAtmosphere(e.target.value)}
                        placeholder="스타일 버튼을 클릭하거나, 원하는 분위기를 직접 묘사하세요. (예: 90년대 홍콩 영화 느낌, 거친 질감, 흑백 톤, 유명한 연예인이 늙었을때의 모습...)"
                        className="w-full h-24 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-base focus:border-purple-500 outline-none resize-none leading-relaxed shadow-inner transition-all focus:ring-1 focus:ring-purple-500 placeholder-gray-600"
                    />
                    <p className="text-sm text-gray-500 mt-2 text-right">
                        * 이곳에 입력된 내용이 AI 영상 생성의 <strong>Visual Atmosphere</strong> 지침으로 사용됩니다.
                    </p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-gray-700">
                <button
                    type="button"
                    onClick={handleStylePreview}
                    disabled={isPreviewLoading || !script.trim()}
                    className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${
                        isPreviewLoading || !script.trim()
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                >
                    {isPreviewLoading ? '생성 중...' : '🎨 스타일 미리보기 (2컷)'}
                </button>

                <button
                    type="submit"
                    onClick={handleSubmit}
                    className="flex-[2] bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold py-4 px-8 rounded-xl shadow-2xl transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            AI 분석 및 생성 중...
                        </>
                    ) : (
                        <>
                            <span>🚀</span> 프로젝트 생성 시작
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ScriptMode;
