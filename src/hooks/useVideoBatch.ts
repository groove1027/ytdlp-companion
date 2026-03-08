
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
    } catch {
        console.warn('Invalid base64 image, using empty file fallback');
        return new File([], filename, { type: 'image/png' });
    }
}

// [MODIFIED] Throttled Sliding Window Batch Runner
async function runBatch<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, onProgress: () => void) {
    const queue = [...items];
    const active: Promise<void>[] = [];
    while (queue.length > 0 || active.length > 0) {
        while (queue.length > 0 && active.length < limit) {
            const item = queue.shift()!;
            const p = fn(item).finally(() => {
                const idx = active.indexOf(p);
                if (idx > -1) active.splice(idx, 1);
                onProgress();
            });
            active.push(p);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (active.length > 0) await Promise.race(active);
    }
}

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

    // [CRITICAL FIX 1] Cleanup on unmount — abort all ongoing operations
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            // Abort all active controllers on unmount
            abortControllers.current.forEach((controller, sceneId) => {
                controller.abort();
                logger.warn(`[Unmount Cleanup] Aborted scene: ${sceneId}`);
            });
            abortControllers.current.clear();
        };
    }, []);

    // Safe setState wrapper — skip updates if unmounted
    const safeSetScenes: typeof setScenes = (updater) => {
        if (isMountedRef.current) setScenes(updater);
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

        safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            isGeneratingVideo: false,
            isUpscaling: false,
            videoGenerationError: "사용자 취소"
        } : s));
        logger.warn(`Scene Cancelled: ${sceneId}`);
    };

    const processScene = async (
        sceneId: string, 
        scene: Scene, 
        initialModel: VideoModel, 
        explicitUpscaleRequest: boolean, 
        forceModel: boolean = false,
        overrideDuration?: '6' | '10' | '15',
        overrideSpeech?: boolean,
        isRetry: boolean = false,
        isSafeMode: boolean = false, // [NEW] Flag for simplified retry
        retryCount: number = 0       // [NEW] Auto-Retry Counter
    ) => {
        if (!scene.imageUrl) return;

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

        safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            isGeneratingVideo: true,
            videoGenerationError: undefined,
            videoModelUsed: effectiveModel,
            generationStatus: statusMsg,
            progress: 0
        } : s));

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
                    logger.info(`[Auto-Retry] Washing image for Scene ${sceneId} using Nano Banana Pro...`);
                    const washPrompt = "high quality, detailed, photorealistic, 8k"; 
                    const washedBase64 = await generateKieImage(
                        washPrompt,
                        config?.aspectRatio || AspectRatio.LANDSCAPE,
                        scene.imageUrl, 
                        undefined,
                        "nano-banana-pro",
                        0.25 
                    );
                    const washedFile = base64ToFile(washedBase64, `washed_scene_${sceneId}.png`);
                    publicImageUrl = await uploadMediaToHosting(washedFile);
                    logger.success(`[Auto-Retry] Image washed and uploaded: ${publicImageUrl}`);
                } catch (washError) {
                    console.error("[Auto-Retry] Image washing failed, proceeding with original", washError);
                }
            } else if (publicImageUrl.startsWith('data:')) {
                const file = base64ToFile(publicImageUrl, `scene_${sceneId}.png`);
                publicImageUrl = await uploadMediaToHosting(file);
            }
            
            // Dialogue for Grok (Skip in Safe Mode)
            let generatedDialogue = undefined;
            let generatedSfx = undefined;

            if (!isSafeMode && (overrideSpeech !== undefined ? overrideSpeech : (scene.grokSpeechMode || false))) {
                 if (effectiveModel !== VideoModel.VEO && effectiveModel !== VideoModel.VEO_QUALITY) {
                    logger.info(`Generating Dialogue for Scene ${sceneId}...`);
                    const audioData = await generateCharacterDialogue(scene.scriptText, scene.visualPrompt);
                    generatedDialogue = audioData.dialogue;
                    generatedSfx = audioData.sfx;
                    logger.success(`Dialogue Generated: "${generatedDialogue}"`);
                 }
            }

            // [FIX M9] Re-read scene from store to pick up any edits made during generation
            const freshScene = useProjectStore.getState().scenes.find(s => s.id === sceneId) || scene;

            // Prompt Sanitization
            let rawPrompt = freshScene.visualPrompt
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
            const effectiveDuration = overrideDuration || freshScene.grokDuration || '10';
            const effectiveSpeech = isSafeMode ? false : (overrideSpeech !== undefined ? overrideSpeech : (freshScene.grokSpeechMode || false));

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
            } catch {
                // globalContext parse failure is non-fatal
            }

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
            if (effectiveModel === VideoModel.VEO) {
                estimatedCost = PRICING.VIDEO_VEO;
            } else if (effectiveModel === VideoModel.GROK) {
                estimatedCost = effectiveDuration === '15' ? PRICING.VIDEO_GROK_15S : effectiveDuration === '10' ? PRICING.VIDEO_GROK_10S : PRICING.VIDEO_GROK_6S;
            }

            if (signal.aborted) throw new Error("Cancelled by user");
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? { ...s, generationTaskId: taskId } : s));

            // 2. POLLING
            const handleProgress = (percent: number) => {
                safeSetScenes(prev => prev.map(s => s.id === sceneId ? { ...s, progress: percent } : s));
            };

            const videoUrl = await provider.poll(taskId, signal, handleProgress);

            if (onCostAdd && estimatedCost > 0) {
                onCostAdd(estimatedCost, 'video');
            }

            const isNativeHQ = effectiveModel === VideoModel.VEO || (effectiveModel === VideoModel.GROK && explicitUpscaleRequest);
            
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, videoUrl, isGeneratingVideo: false, isUpscaling: false, isUpscaled: false, isNativeHQ, generationTaskId: taskId, videoModelUsed: effectiveModel, generationStatus: undefined, progress: 100,
                ...(generatedSfx ? { generatedSfx } : {}),
                ...(generatedDialogue ? { generatedDialogue } : {}),
            } : s));
            
            logger.success(`Scene ${sceneId} Process Complete`);

        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            const errStr = (e.message || "").toLowerCase();
            
            // [NEW] AUTO-RETRY LOGIC FOR NETWORK/TIMEOUT ERRORS
            // Catches "timeout", "超时", "504", "502", "network error", "apimart failed"
            const isTimeout = errStr.includes("timeout") || errStr.includes("超时") || errStr.includes("504") || errStr.includes("502") || errStr.includes("network") || errStr.includes("veo timeout");
            
            if (isTimeout && retryCount < 3) {
                const nextRetry = retryCount + 1;
                logger.warn(`Scene ${sceneId} Timeout detected (${errStr}). Auto-Retrying (${nextRetry}/3)...`);
                
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
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, isRetry, true, retryCount);
                    return;
                }
                
                if (errStr.includes("invalid_argument") || errStr.includes("invalid argument")) {
                    logger.warn(`Scene ${sceneId} caught INVALID_ARGUMENT. Retrying in Safe Mode (Short Prompt)...`);
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, isRetry, true, retryCount);
                    return;
                }

                if (!isRetry && (errStr.includes("40") || errStr.includes("safety") || errStr.includes("policy") || errStr.includes("ip"))) {
                    logger.warn(`Scene ${sceneId} hit Safety/IP filter. Triggering Image Wash Retry...`);
                    await processScene(sceneId, scene, initialModel, explicitUpscaleRequest, forceModel, overrideDuration, overrideSpeech, true, false, retryCount);
                    return;
                }
            }

            logger.error(`Scene ${sceneId} Generation Failed`, e.message);
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, isGeneratingVideo: false, isUpscaling: false, videoGenerationError: e.message, generationStatus: undefined, progress: 0
            } : s));
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    const processUpscaleOnly = async (sceneId: string, scene: Scene) => {
        if (!scene.generationTaskId) { useUIStore.getState().setToast({ show: true, message: "원본 작업 ID가 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        const controller = new AbortController();
        abortControllers.current.set(sceneId, controller);
        const signal = controller.signal;

        safeSetScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isUpscaling: true, videoGenerationError: undefined } : s));
        try {
            logger.info(`Starting Upscale Only for Scene ${sceneId}`);
            const upscaleId = await createPortableUpscaleTask(scene.generationTaskId);
            const newVideoUrl = await pollKieTask(upscaleId, signal);
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, videoUrl: newVideoUrl, isUpscaling: false, isUpscaled: true
            } : s));
            logger.success(`Upscale Only Success for Scene ${sceneId}`);
        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            logger.error(`Upscale Only Failed for Scene ${sceneId}`, e.message);
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, isUpscaling: false, videoGenerationError: `업스케일 실패: ${e.message}`
            } : s));
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    const BATCH_LIMIT = 20;

    const runGrokHQBatch = async (duration: '6' | '10' | '15', speechMode: boolean) => {
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const genTargets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (genTargets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업할 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: genTargets.length });
        await runBatch(genTargets, BATCH_LIMIT, async (scene) => {
            await processScene(scene.id, scene, VideoModel.GROK, true, true, duration, speechMode);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
        logger.success("Grok HQ Batch Completed");
    };
    
    const runVeoFastBatch = async () => {
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const targets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runBatch(targets, BATCH_LIMIT, async (scene) => {
             await processScene(scene.id, scene, VideoModel.VEO, false, true); 
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
    };

    const runVeoQualityBatch = async () => {
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const targets = useProjectStore.getState().scenes.filter(s => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runBatch(targets, BATCH_LIMIT, async (scene) => {
             // [HIGH FIX 1] Use VEO_QUALITY instead of VEO for quality batch
             await processScene(scene.id, scene, VideoModel.VEO_QUALITY, false, true);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
    };

    const runUpscaleBatch = async () => {
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const targets = useProjectStore.getState().scenes.filter(s => s.videoUrl && !s.isUpscaled && !s.isUpscaling && s.generationTaskId);
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runBatch(targets, BATCH_LIMIT, async (scene) => { 
             await processUpscaleOnly(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
    };
    
    // V2V: xAI Grok Video Edit (sourceVideoUrl → style transfer)
    const processRemakeScene = async (sceneId: string, scene: Scene) => {
        if (!scene.sourceVideoUrl) return;

        const controller = new AbortController();
        abortControllers.current.set(sceneId, controller);
        const signal = controller.signal;

        const segLabel = (scene.v2vTotalSegments && scene.v2vTotalSegments > 1)
            ? `구간 ${(scene.v2vSegmentIndex ?? 0) + 1}/${scene.v2vTotalSegments} `
            : '';

        safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s, isGeneratingVideo: true, videoGenerationError: undefined,
            generationStatus: `🎬 ${segLabel}V2V 변환 중 (xAI Grok)...`,
            progress: 0
        } : s));

        try {
            if (!getXaiKey()) throw new Error("xAI API Key가 설정되지 않았습니다.");

            const prompt = config?.v2vPrompt || scene.scriptText;
            const resolution = config?.v2vResolution || '720p';

            const taskId = await createXaiVideoEditTask(scene.sourceVideoUrl, prompt, resolution);

            if (signal.aborted) throw new Error("Cancelled by user");
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? { ...s, generationTaskId: taskId } : s));

            const handleProgress = (percent: number) => {
                safeSetScenes(prev => prev.map(s => s.id === sceneId ? { ...s, progress: percent } : s));
            };

            const videoUrl = await pollXaiVideoEditTask(taskId, signal, handleProgress);

            // Cost: ~$0.05/sec, use actual segment length when available
            const segDuration = (scene.v2vSegmentEndSec !== undefined && scene.v2vSegmentStartSec !== undefined)
                ? (scene.v2vSegmentEndSec - scene.v2vSegmentStartSec)
                : 8;
            if (onCostAdd) onCostAdd(PRICING.VIDEO_XAI_V2V_PER_SEC * segDuration, 'video');

            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, videoUrl, isGeneratingVideo: false, isNativeHQ: false,
                generationTaskId: taskId, videoModelUsed: VideoModel.GROK,
                generationStatus: undefined, progress: 100
            } : s));

        } catch (e: any) {
            if (e.message === "Cancelled by user" || signal.aborted) return;
            safeSetScenes(prev => prev.map(s => s.id === sceneId ? {
                ...s, isGeneratingVideo: false, videoGenerationError: e.message,
                generationStatus: undefined, progress: 0
            } : s));
        } finally {
            abortControllers.current.delete(sceneId);
        }
    };

    const runRemakeBatch = async () => {
        // [FIX BUG#10] Read current scenes from store to avoid stale closure
        const targets = useProjectStore.getState().scenes.filter(s => s.sourceVideoUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) { useUIStore.getState().setToast({ show: true, message: "작업 대상이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runBatch(targets, BATCH_LIMIT, async (scene) => {
            await processRemakeScene(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
    };

    const runRemakeBatchWithScenes = async (explicitScenes: Scene[]) => {
        const targets = explicitScenes.filter(s => s.sourceVideoUrl && !s.videoUrl && !s.isGeneratingVideo);
        if (targets.length === 0) return;
        setIsBatching(true);
        setProgress({ current: 0, total: targets.length });
        await runBatch(targets, BATCH_LIMIT, async (scene) => {
            await processRemakeScene(scene.id, scene);
        }, () => setProgress(prev => ({ ...prev, current: prev.current + 1 })));
        setIsBatching(false);
    };

    // [FIX BUG#10] All single-scene functions read from store to avoid stale closure
    // [HIGH FIX 2] Added .catch() to prevent fire-and-forget unhandled rejections
    // [HIGH FIX 1] runSingleVeoQuality uses VEO_QUALITY instead of VEO
    const runSingleGrok = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.GROK, false, true).catch(e => logger.error(`runSingleGrok failed: ${id}`, e)); };
    const runSingleGrokHQ = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.GROK, true, true).catch(e => logger.error(`runSingleGrokHQ failed: ${id}`, e)); };
    const runSingleVeoFast = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.VEO, false, true).catch(e => logger.error(`runSingleVeoFast failed: ${id}`, e)); };
    const runSingleVeoQuality = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processScene(id, s, VideoModel.VEO_QUALITY, false, true).catch(e => logger.error(`runSingleVeoQuality failed: ${id}`, e)); };
    const runSingleUpscale = (id: string) => { const s = useProjectStore.getState().scenes.find(x => x.id === id); if (s) processUpscaleOnly(id, s).catch(e => logger.error(`runSingleUpscale failed: ${id}`, e)); };

    return {
        isBatching,
        batchProgress: progress,
        detailedStatus,
        runGrokHQBatch,
        runVeoFastBatch,
        runVeoQualityBatch,
        runUpscaleBatch,
        runRemakeBatch,
        runRemakeBatchWithScenes,
        runSingleGrok,
        runSingleGrokHQ,
        runSingleVeoFast,
        runSingleVeoQuality,
        runSingleUpscale,
        processScene,
        processRemakeScene,
        cancelScene
    };
};
