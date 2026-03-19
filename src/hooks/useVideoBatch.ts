
import React, { useState, useRef, useEffect } from 'react';
import { Scene, VideoModel, ProjectConfig, AspectRatio, CompositionMode } from '../types';
import {
    createPortableUpscaleTask,
    pollKieTask,
    generateKieImage,
    getVideoProvider,
    createXaiVideoEditTask,
    pollXaiVideoEditTask
} from '../services/VideoGenService';
import { generateCharacterDialogue, sanitizePromptWithGemini } from '../services/geminiService';
import { logger } from '../services/LoggerService';
import { getKieKey, getApimartKey, getXaiKey } from '../services/apiService';
import { uploadMediaToHosting } from '../services/uploadService';
import { PRICING } from '../constants';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { runKieBatch } from '../utils/kieBatchRunner';

// Helper for Base64 to File
function base64ToFile(base64: string, filename: string): File {
    try {
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
    } catch (e) {
        logger.trackSwallowedError('useVideoBatch:base64ToFile', e);
        console.warn('Invalid base64 image, using empty file fallback');
        return new File([], filename, { type: 'image/png' });
    }
}

// [FIX #172] 잔액 부족(QUOTA_EXHAUSTED) 에러 감지 헬퍼
const QUOTA_EXHAUSTED_RE = /(QUOTA_EXHAUSTED|잔액 부족|credits?\s+insufficient|insufficient\s+(credits?|quota)|user quota is not enough|current balance.*(enough|continue)|크레딧(이|을)?\s*부족)/i;

function isQuotaExhaustedError(error: unknown): boolean {
    if (error instanceof Error) {
        return QUOTA_EXHAUSTED_RE.test(error.message);
    }
    return false;
}

type GrokDuration = '6' | '10';
type SeedanceDuration = '4' | '8' | '12';
type VideoDurationOverride = GrokDuration | SeedanceDuration;

const isGrokDuration = (duration?: VideoDurationOverride): duration is GrokDuration =>
    duration === '6' || duration === '10';

const isSeedanceDuration = (duration?: VideoDurationOverride): duration is SeedanceDuration =>
    duration === '4' || duration === '8' || duration === '12';

// [REMOVED] 기존 슬라이딩 윈도우 runBatch → kieBatchRunner.ts의 runKieBatch로 교체
// KIE 레이트 리밋: 10개/10초 버스트 제출, 최대 100 동시 처리

export const useVideoBatch = (
    scenes: Scene[],
    setScenes: React.Dispatch<React.SetStateAction<Scene[]>>,
    config: ProjectConfig | null,
    onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void
) => {
    const [isBatching, setIsBatching] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [detailedStatus, setDetailedStatus] = useState({ percent: 0, eta: 0, message: "" });
    
    const abortControllers = useRef<Map<string, AbortController>>(new Map());
    const isMountedRef = useRef(true);

    // [FIX] unmount 시 폴링을 abort하지 않음 — 크레딧이 이미 소모된 생성 작업은 완료되어야 함
    // abort는 사용자가 명시적으로 취소할 때만 (cancelScene)
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // [FIX] 모든 scene 업데이트를 Zustand store 직접 호출로 변경
    // 기존 safeSetScenes(setScenes prop wrapper)는 컴포넌트 unmount 시 stale dispatcher → 업데이트 소실
    // useProjectStore.getState().updateScene()은 전역 store이므로 unmount 후에도 정상 동작
    const storeUpdateScene = (sceneId: string, partial: Partial<Scene>) => {
        useProjectStore.getState().updateScene(sceneId, partial);
    };

    const cancelScene = async (sceneId: string) => {
        const controller = abortControllers.current.get(sceneId);
        if (controller) {
            controller.abort();
            abortControllers.current.delete(sceneId);
        }

        // [FIX BUG#9] Read CURRENT scene from store — closure-captured `scenes` has stale generationTaskId
        const scene = useProjectStore.getState().scenes.find(s => s.id === sceneId);
        if (scene && scene.generationTaskId) {
             const taskId = scene.generationTaskId;
             const model = scene.videoModelUsed;

             logger.info(`Requesting Server-Side Cancel for ${sceneId} (Task: ${taskId})`);

             if (model) {
                 getVideoProvider(model).cancel(taskId).catch(e => console.warn(e));
             }
        }

        storeUpdateScene(sceneId, {
            isGeneratingVideo: false,
            isUpscaling: false,
            videoGenerationError: "사용자 취소"
        });
        logger.warn(`Scene Cancelled: ${sceneId}`);
    };

    const processScene = async (
        sceneId: string, 
        scene: Scene, 
        initialModel: VideoModel, 
        explicitUpscaleRequest: boolean, 
        forceModel: boolean = false,
        overrideDuration?: VideoDurationOverride,
        overrideSpeech?: boolean,
        isRetry: boolean = false,
        isSafeMode: boolean = false, // [NEW] Flag for simplified retry
        retryCount: number = 0       // [NEW] Auto-Retry Counter
    ) => {
        if (!scene.imageUrl) return;
        logger.trackAction('비디오 생성 시작', initialModel);

        // [CRITICAL FIX 2] Abort any existing controller for this scene before creating a new one
        // Prevents orphaned AbortControllers during recursive retries
        const existingController = abortControllers.current.get(sceneId);
        if (existingController) {
            existingController.abort();
            abortControllers.current.delete(sceneId);
        }

        const controller = new AbortController();
        abortControllers.current.set(sceneId, controller);
        const signal = controller.signal;
        
        let effectiveModel = initialModel;
        
        const isVeoModel = initialModel === VideoModel.VEO || initialModel === VideoModel.VEO_QUALITY;
        if (!forceModel && !isVeoModel && scene.requiresTextRendering) {
            logger.info(`[Hybrid Mode] Scene ${sceneId} switching to Veo Fast for Text Rendering.`);
            effectiveModel = VideoModel.VEO;
        }

        let statusMsg = "🎬 비디오 생성 요청 중...";
        if (isRetry) statusMsg = "♻️ 세탁된 이미지로 재생성 요청 중...";
        if (isSafeMode) statusMsg = "🛡️ Safe Mode: 무음/단순 프롬프트로 재시도...";
        if (retryCount > 0) statusMsg = `⏳ 서버 응답 지연/오류로 재시도 중... (${retryCount}/3)`;

        storeUpdateScene(sceneId, {
            isGeneratingVideo: true,
            videoGenerationError: undefined,
            videoModelUsed: effectiveModel,
            generationStatus: statusMsg,
            progress: 0
        });

        let vidGenStart = performance.now();
        try {
            // [PRE-FLIGHT CHECKS]
            if (effectiveModel === VideoModel.VEO || effectiveModel === VideoModel.VEO_QUALITY) {
                // Evolink Veo 3.1 — Evolink key 확인
                const { getEvolinkKey } = await import('../services/evolinkService');
                if (!getEvolinkKey()) throw new Error("Evolink API Key가 없습니다. (Veo 1080p용)");
            } else {
                if (!getKieKey()) throw new Error("Kie API Key가 없습니다. (Grok용)");
            }

            let publicImageUrl = scene.imageUrl;
            
            // [SMART RETRY: IMAGE WASHING]
            if (isRetry && !isSafeMode) {
                try {
                    logger.info(`[Auto-Retry] Washing image for Scene ${sceneId} using Nano Banana 2...`);
                    const washPrompt = "high quality, detailed, photorealistic, 8k";
                    const washedBase64 = await generateKieImage(
                        washPrompt,
                        config?.aspectRatio || AspectRatio.LANDSCAPE,
                        scene.imageUrl,
                        undefined,
                        "nano-banana-2",
                        0.25 
                    );
                    const washedFile = base64ToFile(washedBase64, `washed_scene_${sceneId}.png`);
                    publicImageUrl = await uploadMediaToHosting(washedFile);
                    logger.success(`[Auto-Retry] Image washed and uploaded: ${publicImageUrl}`);
                } catch (washError) {
                    logger.trackErrorChain(String(washError), 'useVideoBatch:processScene:imagewash_failed');
                    console.error("[Auto-Retry] Image washing failed, proceeding with original", washError);
                }
            } else if (publicImageUrl.startsWith('data:')) {
                const file = base64ToFile(publicImageUrl, `scene_${sceneId}.png`);
                publicImageUrl = await uploadMediaToHosting(file);
            }
            
            // Dialogue for Grok only (Skip in Safe Mode)
            let generatedDialogue = undefined;
            let generatedSfx = undefined;

            // [v4.7] 기존 대사가 있으면 재사용 (parseScriptToScenes에서 생성된 대사)
            if (scene.generatedDialogue) {
                generatedDialogue = scene.generatedDialogue;
                generatedSfx = scene.generatedSfx || scene.dialogueSfx;
                logger.info(`[v4.7] Reusing pre-generated dialogue for Scene ${sceneId}: "${generatedDialogue}"`);
            } else if (effectiveModel === VideoModel.GROK && !isSafeMode && (overrideSpeech !== undefined ? overrideSpeech : (scene.grokSpeechMode || false))) {
                logger.info(`Generating Dialogue for Scene ${sceneId}...`);
                const audioData = await generateCharacterDialogue(scene.scriptText, scene.visualPrompt);
                generatedDialogue = audioData.dialogue;
                generatedSfx = audioData.sfx;
                logger.success(`Dialogue Generated: "${generatedDialogue}"`);
            }

            // [FIX M9] Re-read scene from store to pick up any edits made during generation
            const freshScene = useProjectStore.getState().scenes.find(s => s.id === sceneId) || scene;

            // Prompt Sanitization — videoPrompt 우선, 없으면 visualPrompt 폴백
            const promptSource = (freshScene.videoPrompt && freshScene.videoPrompt.trim()) ? freshScene.videoPrompt : freshScene.visualPrompt;
            let rawPrompt = promptSource
                .replace(/^(Prompt:|Scene depicting:|Image of:|Scene:)\s*/i, "")
                .replace(/['"](.*?)['"]/g, "$1")
                .trim();

            const styleToxicRegex = /\,?\s*\b(photorealistic|realistic|hyperrealistic|8k resolution|4k resolution|8k|4k|cinematic lighting|dramatic lighting|photography|photo-real|detailed texture)\b/gi;
            rawPrompt = rawPrompt.replace(styleToxicRegex, "");
            rawPrompt = rawPrompt.replace(/\s+/g, " ").trim();

            if (!freshScene.requiresTextRendering) {
                rawPrompt = rawPrompt.replace(/\b(text|title|caption|subtitle|자막|제목|글자)\b/gi, "");
            }
            
            if (!isRetry && !isSafeMode) {
                logger.info(`[Safety] Checking prompt for ${sceneId}...`);
                try {
                    const safePrompt = await sanitizePromptWithGemini(rawPrompt);
                    if (safePrompt !== rawPrompt) {
                        logger.info(`[Safety] Prompt Sanitized: "${rawPrompt}" -> "${safePrompt}"`);
                        rawPrompt = safePrompt;
                    }
                } catch (e) {
                    console.warn("[Safety] Filter check skipped due to error", e);
                }
            }

            let taskId = "";
            logger.info(`Processing Scene ${sceneId} with ${effectiveModel} (Retry: ${isRetry}, SafeMode: ${isSafeMode}, Count: ${retryCount})`);

            let estimatedCost = 0;

            // Build prompt for Grok
            const audioSuffix = isSafeMode ? " [No Sound]" : " [Sound Effects Only] [No Music]";
            const enhancedPrompt = `${rawPrompt}${audioSuffix}`.trim();
            const seedanceDuration: SeedanceDuration = isSeedanceDuration(overrideDuration)
                ? overrideDuration
                : (freshScene.seedanceDuration || '8');
            const grokDuration: GrokDuration = isGrokDuration(overrideDuration)
                ? overrideDuration
                : (freshScene.grokDuration || '10');
            const effectiveDuration = effectiveModel === VideoModel.SEEDANCE
                ? seedanceDuration
                : grokDuration;
            const effectiveSpeech = effectiveModel === VideoModel.GROK && !isSafeMode
                ? (overrideSpeech !== undefined ? overrideSpeech : (freshScene.grokSpeechMode || false))
                : false;

            // [FIX] Build cultural context string from globalContext + per-scene fields
            // This prevents Veo from defaulting to generic/Chinese-style visuals
            let culturalContextStr = "";
            try {
                const parts: string[] = [];
                // Per-scene cultural fields take priority (more specific)
                if (freshScene.sceneCulture) parts.push(freshScene.sceneCulture);
                if (freshScene.sceneEra) parts.push(freshScene.sceneEra);
                if (freshScene.sceneLocation) parts.push(freshScene.sceneLocation);
                // Fall back to global context from script analysis
                if (parts.length === 0 && config?.globalContext) {
                    const ctx = JSON.parse(config.globalContext);
                    if (ctx.culturalBackground) parts.push(ctx.culturalBackground);
                    if (ctx.timePeriod) parts.push(ctx.timePeriod);
                    if (ctx.specificLocation) parts.push(ctx.specificLocation);
                }
                culturalContextStr = parts.filter(Boolean).join(", ");
            } catch (e) {
                logger.trackSwallowedError('useVideoBatch:parseGlobalContext', e);
                // globalContext parse failure is non-fatal
            }

            // [DIAGNOSTIC] 영상 생성 파라미터 기록
            const sceneIdx = scenes.findIndex(s => s.id === sceneId);
            logger.trackVideoGeneration({
                sceneId,
                sceneIndex: sceneIdx >= 0 ? sceneIdx : 0,
                videoModel: effectiveModel,
                aspectRatio: config?.aspectRatio || AspectRatio.LANDSCAPE,
                duration: effectiveDuration,
                speechMode: effectiveSpeech,
                hasImageUrl: !!publicImageUrl,
                promptLength: enhancedPrompt.length,
                isSafeRetry: isSafeMode,
            });

            vidGenStart = performance.now();
            const provider = getVideoProvider(effectiveModel);
            taskId = await provider.create({
                prompt: enhancedPrompt,
                imageUrl: publicImageUrl,
                aspectRatio: config?.aspectRatio || AspectRatio.LANDSCAPE,
                cameraAngle: freshScene.cameraAngle,
                cameraMovement: freshScene.cameraMovement,
                requiresTextRendering: freshScene.requiresTextRendering || false,
                isSafeRetry: isSafeMode,
                isLoop: freshScene.isLoopMode,
                useTopaz: explicitUpscaleRequest,
                atmosphere: config?.atmosphere,
                duration: effectiveDuration,
                speechMode: effectiveSpeech,
                generatedDialogue,
                generatedSfx,
                isArtistic: false,
                mode: effectiveModel,
                culturalContext: culturalContextStr || undefined,
            });

            // Cost calculation
            if (effectiveModel === VideoModel.VEO || effectiveModel === VideoModel.VEO_QUALITY) {
                estimatedCost = PRICING.VIDEO_VEO;
            } else if (effectiveModel === VideoModel.GROK) {
                estimatedCost = effectiveDuration === '10' ? PRICING.VIDEO_GROK_10S : PRICING.VIDEO_GROK_6S;
            } else if (effectiveModel === VideoModel.SEEDANCE) {
                estimatedCost = PRICING.VIDEO_SEEDANCE_PER_SEC * Number(effectiveDuration);
            }

            if (signal.aborted) throw new Error("Cancelled by user");
            storeUpdateScene(sceneId, { generationTaskId: taskId });

            // 2. POLLING
            const handleProgress = (percent: number) => {
                storeUpdateScene(sceneId, { progress: percent });
            };

            const videoUrl = await provider.poll(taskId, signal, handleProgress);
            logger.trackGenerationResult({ type: 'video', sceneId, success: true, provider: effectiveModel, duration: Math.round(performance.now() - vidGenStart) });

            if (onCostAdd && estimatedCost > 0) {
                onCostAdd(estimatedCost, 'video');
            }

            const isNativeHQ = effectiveModel === VideoModel.VEO || (effectiveModel === VideoModel.GROK && explicitUpscaleRequest);

            // [#492] 이전 영상 백업 — 되돌리기 지원
            const prevVideo = useProjectStore.getState().scenes.find(s => s.id === sceneId)?.videoUrl;
            storeUpdateScene(sceneId, {
                videoUrl, isGeneratingVideo: false, isUpscaling: false, isUpscaled: false, isNativeHQ, generationTaskId: taskId, videoModelUsed: effectiveModel, generationStatus: undefined, progress: 100,
                imageUpdatedAfterVideo: false,
                previousVideoUrl: prevVideo || undefined,
                ...(generatedSfx ? { generatedSfx } : {}),
                ...(generatedDialogue ? { generatedDialogue } : {}),
            });

            logger.success(`Scene ${sceneId} Process Complete`);

        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            logger.trackGenerationResult({ type: 'video', sceneId, success: false, provider: effectiveModel, duration: Math.round(performance.now() - vidGenStart), error: e.message?.substring(0, 200) });
            const errStr = (e.message || "").toLowerCase();

            // [FIX #172] 잔액 부족(QUOTA_EXHAUSTED) — 재시도 없이 즉시 중단 + 사용자 알림
            if (isQuotaExhaustedError(e)) {
                logger.error(`[Quota] Scene ${sceneId} — 잔액 부족으로 중단`, e.message);
                useUIStore.getState().setToast({ show: true, message: '잔액이 부족합니다. 크레딧을 충전한 후 다시 시도해주세요.' });
                setTimeout(() => useUIStore.getState().setToast(null), 6000);
                storeUpdateScene(sceneId, {
                    isGeneratingVideo: false, isUpscaling: false,
                    videoGenerationError: '잔액 부족: 크레딧을 충전해주세요.',
                    generationStatus: undefined, progress: 0
                });
                // 에러를 다시 던져서 runBatch가 남은 장면 처리를 중단하도록 함
                throw e;
            }

            // [NEW] AUTO-RETRY LOGIC FOR NETWORK/TIMEOUT ERRORS
            // Catches "timeout", "超时", "504", "502", "network error", "apimart failed"
            const isTimeout = errStr.includes("timeout") || errStr.includes("超时") || errStr.includes("504") || errStr.includes("502") || errStr.includes("network") || errStr.includes("veo timeout");

            if (isTimeout && retryCount < 3) {
                const nextRetry = retryCount + 1;
                logger.warn(`Scene ${sceneId} Timeout detected (${errStr}). Auto-Retrying (${nextRetry}/3)...`);
                const _timeoutChainId = logger.trackErrorChain(String(e), 'useVideoBatch:processScene:timeout');

                // Add a small delay (backoff) to let server recover
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Recursive Retry
                await processScene(
                    sceneId,
                    scene,
                    initialModel,
                    explicitUpscaleRequest,
                    forceModel,
                    overrideDuration,
                    overrideSpeech,
                    isRetry,
                    isSafeMode,
                    nextRetry
                );
                return; // Exit current stack
            }

            if (!isSafeMode) {
                if (errStr.includes("audio_filtered") || errStr.includes("audio filter")) {
                    logger.warn(`Scene ${sceneId} caught AUDIO_FILTERED. Retrying in Safe Mode (Silent)...`);
                    logger.trackErrorChain(String(e), 'useVideoBatch:processScene:audio_filtered');
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, isRetry, true, retryCount);
                    return;
                }

                if (errStr.includes("invalid_argument") || errStr.includes("invalid argument")) {
                    logger.warn(`Scene ${sceneId} caught INVALID_ARGUMENT. Retrying in Safe Mode (Short Prompt)...`);
                    logger.trackErrorChain(String(e), 'useVideoBatch:processScene:invalid_argument');
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, isRetry, true, retryCount);
                    return;
                }

                if (!isRetry && (errStr.includes("40") || errStr.includes("safety") || errStr.includes("policy") || errStr.includes("ip"))) {
                    logger.warn(`Scene ${sceneId} hit Safety/IP filter. Triggering Image Wash Retry...`);
                    logger.trackErrorChain(String(e), 'useVideoBatch:processScene:safety_filter');
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, true, false, retryCount);
                    return;
                }
            }

            logger.error(`Scene ${sceneId} Generation Failed`, e.message);
            storeUpdateScene(sceneId, {
                isGeneratingVideo: false, isUpscaling: false, videoGenerationError: e.message, generationStatus: undefined, progress: 0
            });
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    const processUpscaleOnly = async (sceneId: string, scene: Scene) => {
        if (!scene.generationTaskId) { useUIStore.getState().setToast({ show: true, message: "원본 작업 ID가 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        const controller = new AbortController();
        abortControllers.current.set(sceneId, controller);
        const signal = controller.signal;

        storeUpdateScene(sceneId, { isUpscaling: true, videoGenerationError: undefined });
        try {
            logger.info(`Starting Upscale Only for Scene ${sceneId}`);
            const upscaleId = await createPortableUpscaleTask(scene.generationTaskId);
            const newVideoUrl = await pollKieTask(upscaleId, signal);
            // [#492] 업스케일 전 영상 백업
            const prevUpscale = useProjectStore.getState().scenes.find(s => s.id === sceneId)?.videoUrl;
            storeUpdateScene(sceneId, {
                videoUrl: newVideoUrl, isUpscaling: false, isUpscaled: true, imageUpdatedAfterVideo: false,
                previousVideoUrl: prevUpscale || undefined,
            });
            logger.success(`Upscale Only Success for Scene ${sceneId}`);
        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            logger.error(`Upscale Only Failed for Scene ${sceneId}`, e.message);
            storeUpdateScene(sceneId, {
                isUpscaling: false, videoGenerationError: `업스케일 실패: ${e.message}`
            });
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    // KIE 레이트 리밋 옵션: 10개/10초 버스트, 최대 100 동시 처리
    const kieBatchOpts = { isQuotaExhausted: isQuotaExhaustedError };

    const runGrokHQBatch = async (duration: GrokDuration, speechMode: boolean, sceneIds?: string[]) => {
        logger.trackAction('비디오 배치 생성 시작', 'Grok HQ');
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const allTargets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
        const genTargets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
        if (genTargets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업할 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: genTargets.length });
        await runKieBatch(genTargets, async (scene) => {
            await processScene(scene.id, scene, VideoModel.GROK, true, true, duration, speechMode);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
        logger.success("Grok HQ Batch Completed");
    };

    const runSeedanceBatch = async (sceneIds?: string[], duration?: SeedanceDuration) => {
        logger.trackAction('비디오 배치 생성 시작', 'Seedance 1.5 Pro');
        const allTargets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
            await processScene(scene.id, scene, VideoModel.SEEDANCE, false, true, duration || scene.seedanceDuration || '8');
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
        logger.success("Seedance Batch Completed");
    };

    const runVeoFastBatch = async (sceneIds?: string[]) => {
        logger.trackAction('비디오 배치 생성 시작', 'Veo Fast');
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const allTargets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
        const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
             await processScene(scene.id, scene, VideoModel.VEO, false, true);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
    };

    const runVeoQualityBatch = async (sceneIds?: string[]) => {
        logger.trackAction('비디오 배치 생성 시작', 'Veo Quality');
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const allTargets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
        const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
             // [HIGH FIX 1] Use VEO_QUALITY instead of VEO for quality batch
             await processScene(scene.id, scene, VideoModel.VEO_QUALITY, false, true);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
    };

    const runUpscaleBatch = async (sceneIds?: string[]) => {
        logger.trackAction('비디오 배치 생성 시작', 'Upscale');
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const allTargets = useProjectStore.getState().scenes.filter(s => s.videoUrl && !s.isUpscaled && !s.isUpscaling && s.generationTaskId);
        // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
        const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
             await processUpscaleOnly(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
    };
    
    // V2V: xAI Grok Video Edit (sourceVideoUrl → style transfer)
    const processRemakeScene = async (sceneId: string, scene: Scene) => {
        if (!scene.sourceVideoUrl) return;
        logger.trackAction('비디오 생성 시작', 'V2V Remake (xAI Grok)');

        const controller = new AbortController();
        abortControllers.current.set(sceneId, controller);
        const signal = controller.signal;

        const segLabel = (scene.v2vTotalSegments && scene.v2vTotalSegments > 1)
            ? `구간 ${(scene.v2vSegmentIndex ?? 0) + 1}/${scene.v2vTotalSegments} `
            : '';

        storeUpdateScene(sceneId, {
            isGeneratingVideo: true, videoGenerationError: undefined,
            generationStatus: `🎬 ${segLabel}V2V 변환 중 (xAI Grok)...`,
            progress: 0
        });

        try {
            if (!getXaiKey()) throw new Error("xAI API Key가 설정되지 않았습니다.");

            const prompt = config?.v2vPrompt || scene.scriptText;
            const resolution = config?.v2vResolution || '720p';

            const taskId = await createXaiVideoEditTask(scene.sourceVideoUrl, prompt, resolution);

            if (signal.aborted) throw new Error("Cancelled by user");
            storeUpdateScene(sceneId, { generationTaskId: taskId });

            const handleProgress = (percent: number) => {
                storeUpdateScene(sceneId, { progress: percent });
            };

            const videoUrl = await pollXaiVideoEditTask(taskId, signal, handleProgress);

            // Cost: Wan V2V 720p $0.07/sec
            const segDuration = (scene.v2vSegmentEndSec !== undefined && scene.v2vSegmentStartSec !== undefined)
                ? (scene.v2vSegmentEndSec - scene.v2vSegmentStartSec)
                : 8;
            if (onCostAdd) onCostAdd(PRICING.VIDEO_WAN_V2V_720P_PER_SEC * segDuration, 'video');

            // [#492] 이전 영상 백업 (V2V)
            const prevV2V = useProjectStore.getState().scenes.find(s => s.id === sceneId)?.videoUrl;
            storeUpdateScene(sceneId, {
                videoUrl, isGeneratingVideo: false, isNativeHQ: false,
                generationTaskId: taskId, videoModelUsed: VideoModel.GROK,
                generationStatus: undefined, progress: 100, imageUpdatedAfterVideo: false,
                previousVideoUrl: prevV2V || undefined,
            });

        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            storeUpdateScene(sceneId, {
                isGeneratingVideo: false, videoGenerationError: e.message,
                generationStatus: undefined, progress: 0
            });
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    const runRemakeBatch = async () => {
        logger.trackAction('비디오 배치 생성 시작', 'V2V Remake');
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const targets = useProjectStore.getState().scenes.filter(s => s.sourceVideoUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
            await processRemakeScene(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
    };

    const runRemakeBatchWithScenes = async (explicitScenes: Scene[]) => {
        const targets = explicitScenes.filter(s => s.sourceVideoUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) return;
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runKieBatch(targets, async (scene) => {
            await processRemakeScene(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })), kieBatchOpts);
        setIsBatching(false);
    };

    // [FIX BUG#10] All single-scene functions read from store to avoid stale closure
    // [HIGH FIX 2] Added .catch() to prevent fire-and-forget unhandled rejections
    // [HIGH FIX 1] runSingleVeoQuality uses VEO_QUALITY instead of VEO
    const runSingleGrok = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.GROK, false, true).catch(e => logger.error(`runSingleGrok failed: ${id}`, e)); };
    const runSingleGrokHQ = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.GROK, true, true).catch(e => logger.error(`runSingleGrokHQ failed: ${id}`, e)); };
    const runSingleSeedance = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.SEEDANCE, false, true, s.seedanceDuration || '8').catch(e => logger.error(`runSingleSeedance failed: ${id}`, e)); };
    const runSingleVeoFast = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.VEO, false, true).catch(e => logger.error(`runSingleVeoFast failed: ${id}`, e)); };
    const runSingleVeoQuality = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.VEO_QUALITY, false, true).catch(e => logger.error(`runSingleVeoQuality failed: ${id}`, e)); };
    const runSingleUpscale = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processUpscaleOnly(id, s).catch(e => logger.error(`runSingleUpscale failed: ${id}`, e)); };

    return {
        isBatching,
        batchProgress: progress,
        detailedStatus,
        runGrokHQBatch,
        runSeedanceBatch,
        runVeoFastBatch,
        runVeoQualityBatch,
        runUpscaleBatch,
        runRemakeBatch,
        runRemakeBatchWithScenes,
        runSingleGrok,
        runSingleGrokHQ,
        runSingleSeedance,
        runSingleVeoFast,
        runSingleVeoQuality,
        runSingleUpscale,
        processScene,
        processRemakeScene,
        cancelScene
    };
};
