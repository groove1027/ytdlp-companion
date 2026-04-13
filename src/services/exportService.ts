
import { logger } from './LoggerService';
import { VideoFormat, ExportManifest } from '../types';
import type { Scene, Thumbnail, SceneEffectConfig } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useEditorStore } from '../stores/editorStore';
import { useEditRoomStore } from '../stores/editRoomStore';
import { useUIStore } from '../stores/uiStore';
import { useCostStore } from '../stores/costStore';
import { uploadRemoteUrlToCloudinary } from './uploadService';
import { getSafeFilename, processSequentially, optimizeForExport, downloadHtmlFile } from '../utils/fileHelpers';
import { sanitizeProjectName } from './nleExportService';
import { buildExportHtml } from '../templates/exportHtml';
import { buildPromptGuideHtml } from '../templates/promptGuide';
import { getFontByFamily } from '../constants/fontLibrary';
import { generateFontCssTag } from './fontLoaderService';
import { buildOptimizedViewerHtml } from '../templates/exportHtmlOptimized';
import { getSceneNarrationText } from '../utils/sceneText';

export const downloadImages = async () => {
    const { scenes, config } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();
    const { cropBlobToAspectRatio } = await import('../utils/fileHelpers');
    const aspectRatio = config?.aspectRatio;

    const validScenes = scenes.filter(s => s.imageUrl);
    const total = validScenes.length;

    if (total === 0) { setToast({ show: true, message: "다운로드할 이미지가 없습니다." }); setTimeout(() => setToast(null), 3000); return; }

    setToast({ show: true, message: "이미지 저장 중...", current: 0, total: total });

    // [v2.5] 컴패니언 ZIP 생성 — base64/CORS 문제 제거
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ url?: string; path?: string; filename: string }> = [];

    await processSequentially(validScenes, 5, 20, async (s) => {
        const filename = getSafeFilename(scenes.indexOf(s), getSceneNarrationText(s), aspectRatio ? 'jpg' : 'png');

        if (s.imageUrl!.startsWith('http') && !aspectRatio) {
            // URL + 크롭 불필요 → 컴패니언이 직접 다운로드
            zipFiles.push({ url: s.imageUrl!, filename });
        } else {
            // base64 또는 크롭 필요 → Blob 경유 (fetchImageBlob은 Cloudinary 프록시 폴백 포함)
            const blob = await fetchImageBlob(s.imageUrl!, aspectRatio, cropBlobToAspectRatio);
            if (blob) {
                const tempPath = await uploadBlobToCompanion(blob, filename);
                zipFiles.push({ path: tempPath, filename });
            }
        }
    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 생성 중... (컴패니언)" }));

    const content = await createZipViaCompanion(zipFiles);
    const link = document.createElement('a');
    const _imgZipUrl = URL.createObjectURL(content);
    logger.registerBlobUrl(_imgZipUrl, 'other', 'exportService:downloadImages');
    link.href = _imgZipUrl;
    link.download = `images_${Date.now()}.zip`;
    link.click();
    logger.unregisterBlobUrl(_imgZipUrl);

    useUIStore.getState().setToast({ show: true, message: `이미지 ${total}장 다운로드 완료!` });
    setTimeout(() => useUIStore.getState().setToast(null), 4000);
};

export const downloadVideos = async () => {
    const { scenes } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();

    const videoScenes = scenes.filter(s => s.videoUrl);
    const total = videoScenes.length;

    if (total === 0) { setToast({ show: true, message: "다운로드할 영상이 없습니다." }); setTimeout(() => setToast(null), 3000); return; }

    setToast({ show: true, message: "영상 다운로드 준비 중...", current: 0, total: total });

    // [v2.5] 컴패니언 ZIP 생성 — CORS 우회 불필요 (컴패니언이 직접 다운로드)
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ url?: string; path?: string; filename: string }> = [];

    await processSequentially(videoScenes, 1, 200, async (s) => {
        const sceneIndex = scenes.findIndex(orig => orig.id === s.id) + 1;
        const filename = getSafeFilename(sceneIndex - 1, getSceneNarrationText(s), 'mp4');

        if (s.videoUrl!.startsWith('http')) {
            // URL은 컴패니언이 직접 다운로드
            zipFiles.push({ url: s.videoUrl!, filename });
        } else if (s.videoUrl!.startsWith('blob:') || s.videoUrl!.startsWith('data:')) {
            // Blob URL → fetch → upload-temp
            try {
                const res = await fetch(s.videoUrl!);
                if (res.ok) {
                    const blob = await res.blob();
                    const tempPath = await uploadBlobToCompanion(blob, filename);
                    zipFiles.push({ path: tempPath, filename });
                }
            } catch (e) {
                const safeName = getSafeFilename(sceneIndex - 1, getSceneNarrationText(s), 'txt');
                const errBlob = new Blob([`[다운로드 실패]\nScene #${sceneIndex}\n${s.videoUrl}`], { type: 'text/plain' });
                const errPath = await uploadBlobToCompanion(errBlob, `ERROR_${safeName}`);
                zipFiles.push({ path: errPath, filename: `ERROR_${safeName}` });
            }
        }
    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 생성 중... (컴패니언)" }));

    const result = await createZipViaCompanion(zipFiles, undefined, true);
    const link = document.createElement('a');
    const _vidZipUrl = URL.createObjectURL(result.blob);
    logger.registerBlobUrl(_vidZipUrl, 'other', 'exportService:downloadVideos');
    link.href = _vidZipUrl;
    link.download = `videos_complete_${Date.now()}.zip`;
    link.click();
    logger.unregisterBlobUrl(_vidZipUrl);

    const failCount = result.requestedCount - result.fileCount;
    const msg = failCount > 0
        ? `영상 ${result.fileCount}편 다운로드 완료 (${failCount}편 실패)`
        : `영상 ${total}편 다운로드 완료!`;
    useUIStore.getState().setToast({ show: true, message: msg });
    setTimeout(() => useUIStore.getState().setToast(null), 4000);
};

/** 이미지+영상 통합 다운로드: 장면 순서대로, 영상 있으면 mp4, 없으면 이미지 jpg */
export const downloadAllMedia = async () => {
    const { scenes, config } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();
    const { cropBlobToAspectRatio } = await import('../utils/fileHelpers');
    const aspectRatio = config?.aspectRatio;

    const mediaScenes = scenes.filter(s => s.videoUrl || s.imageUrl);
    const total = mediaScenes.length;

    if (total === 0) { setToast({ show: true, message: "다운로드할 미디어가 없습니다." }); setTimeout(() => setToast(null), 3000); return; }

    // [v2.5] 컴패니언 ZIP 생성 — CORS 프록시 불필요
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ url?: string; path?: string; filename: string }> = [];

    setToast({ show: true, message: "미디어 통합 다운로드 중...", current: 0, total: total });

    let processed = 0;
    for (const s of mediaScenes) {
        const sceneIndex = scenes.indexOf(s);
        const hasVideo = !!s.videoUrl;

        if (hasVideo) {
            if (s.videoUrl!.startsWith('http')) {
                // [v2.5] 컴패니언이 직접 다운로드 — 실패 시 ZIP에서 빠지고 fileCount로 감지
                zipFiles.push({ url: s.videoUrl!, filename: `videos/${getSafeFilename(sceneIndex, getSceneNarrationText(s), 'mp4')}` });
            } else {
                // blob URL → fetch → upload-temp
                try {
                    const res = await fetch(s.videoUrl!);
                    if (res.ok) {
                        const blob = await res.blob();
                        const fn = `videos/${getSafeFilename(sceneIndex, getSceneNarrationText(s), 'mp4')}`;
                        const tp = await uploadBlobToCompanion(blob, fn.replace('videos/', ''));
                        zipFiles.push({ path: tp, filename: fn });
                    } else if (s.imageUrl) {
                        // blob 영상 실패 → 이미지 폴백
                        const imgBlob = await fetchImageBlob(s.imageUrl, aspectRatio, cropBlobToAspectRatio);
                        if (imgBlob) {
                            const fn = `images/${getSafeFilename(sceneIndex, getSceneNarrationText(s), 'jpg')}`;
                            const tp = await uploadBlobToCompanion(imgBlob, fn.replace('images/', ''));
                            zipFiles.push({ path: tp, filename: fn });
                        }
                    }
                } catch { /* skip */ }
            }
        } else if (s.imageUrl) {
            if (s.imageUrl.startsWith('http') && !aspectRatio) {
                zipFiles.push({ url: s.imageUrl, filename: `images/${getSafeFilename(sceneIndex, getSceneNarrationText(s), 'jpg')}` });
            } else {
                const imgBlob = await fetchImageBlob(s.imageUrl, aspectRatio, cropBlobToAspectRatio);
                if (imgBlob) {
                    const fn = `images/${getSafeFilename(sceneIndex, getSceneNarrationText(s), 'jpg')}`;
                    const tp = await uploadBlobToCompanion(imgBlob, fn.replace('images/', ''));
                    zipFiles.push({ path: tp, filename: fn });
                }
            }
        }

        processed++;
        setToast(prev => ({ ...prev!, current: processed }));
    }

    setToast(prev => ({ ...prev!, message: "ZIP 생성 중... (컴패니언)" }));

    const allResult = await createZipViaCompanion(zipFiles, undefined, true);
    const link = document.createElement('a');
    const _mediaZipUrl = URL.createObjectURL(allResult.blob);
    logger.registerBlobUrl(_mediaZipUrl, 'other', 'exportService:downloadAllMedia');
    link.href = _mediaZipUrl;
    link.download = `media_all_${Date.now()}.zip`;
    link.click();
    logger.unregisterBlobUrl(_mediaZipUrl);

    const videoCount = mediaScenes.filter(s => s.videoUrl).length;
    const imageOnlyCount = total - videoCount;
    const allFail = allResult.requestedCount - allResult.fileCount;
    const failInfo = allFail > 0 ? ` (${allFail}개 실패)` : '';
    setToast({ show: true, message: `통합 다운로드 완료! 영상 ${videoCount}편 + 이미지 ${imageOnlyCount}장${failInfo}` });
    setTimeout(() => setToast(null), 5000);
};

/** 이미지 URL을 Blob으로 가져오는 헬퍼 (base64/remote 모두 지원, 비율 크롭 적용) */
async function fetchImageBlob(
    imageUrl: string,
    aspectRatio: string | undefined,
    cropBlobToAspectRatio: (blob: Blob, ratio: string) => Promise<Blob>
): Promise<Blob | null> {
    let blob: Blob | null = null;

    if (imageUrl.startsWith('data:image')) {
        const arr = imageUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        const u8 = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        blob = new Blob([u8], { type: mime });
    } else {
        try {
            const res = await fetch(imageUrl);
            if (res.ok) blob = await res.blob();
        } catch { /* direct fetch failed */ }
        if (!blob) {
            try {
                const proxyUrl = await uploadRemoteUrlToCloudinary(imageUrl);
                const res = await fetch(proxyUrl);
                if (res.ok) blob = await res.blob();
            } catch { /* proxy also failed */ }
        }
    }

    if (blob && aspectRatio) {
        blob = await cropBlobToAspectRatio(blob, aspectRatio);
    }
    return blob;
}

/** 이미지를 대본 길이(TTS 길이)만큼의 MP4로 변환하여 ZIP 다운로드 (캡컷 편집용) */
export const downloadImagesAsMp4 = async () => {
    const { scenes, config } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();
    const { cropBlobToAspectRatio } = await import('../utils/fileHelpers');
    const aspectRatio = config?.aspectRatio;

    const validScenes = scenes.filter(s => s.imageUrl && !s.isGeneratingImage);
    const total = validScenes.length;

    if (total === 0) {
        setToast({ show: true, message: '변환할 이미지가 없습니다.' });
        setTimeout(() => setToast(null), 3000);
        return;
    }

    // WebCodecs 지원 여부 확인
    if (typeof VideoEncoder === 'undefined') {
        setToast({ show: true, message: 'MP4 변환은 Chrome 94 이상에서만 지원됩니다.' });
        setTimeout(() => setToast(null), 4000);
        return;
    }

    // [v2.5] 컴패니언 ZIP 생성
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ path: string; filename: string }> = [];

    // 해상도 결정
    const resolution = getVideoResolution(aspectRatio || '16:9');

    // 인코더 지원 확인
    const { probeVideoEncoder } = await import('./webcodecs/videoEncoder');
    const probe = await probeVideoEncoder(resolution.width, resolution.height);
    if (!probe) {
        setToast({ show: true, message: '이 브라우저에서 H.264 인코딩을 지원하지 않습니다.' });
        setTimeout(() => setToast(null), 4000);
        return;
    }

    setToast({ show: true, message: '이미지→MP4 변환 중...', current: 0, total });

    // 모션 효과 적용 (#427) — editRoomStore에서 장면별 효과 읽기
    const sceneEffects = useEditRoomStore.getState().sceneEffects;

    let successCount = 0;
    let processedCount = 0;
    for (const s of validScenes) {
        const sceneIndex = scenes.indexOf(s);
        const durationSec = estimateSceneDuration(s);
        const effect = sceneEffects[s.id];
        const hasMotion = effect && effect.panZoomPreset !== 'none';

        try {
            // 이미지 Blob 가져오기
            const imgBlob = await fetchImageBlob(s.imageUrl!, aspectRatio, cropBlobToAspectRatio);
            if (!imgBlob) { processedCount++; setToast(prev => ({ ...prev!, current: processedCount })); continue; }

            // MP4 변환 (모션 효과 있으면 Ken Burns 적용)
            const mp4Blob = await convertImageToMp4(imgBlob, durationSec, resolution, probe, hasMotion ? effect : undefined);
            const filename = getSafeFilename(sceneIndex, getSceneNarrationText(s), 'mp4');
            const tp = await uploadBlobToCompanion(mp4Blob, filename);
            zipFiles.push({ path: tp, filename });
            successCount++;
        } catch (e) {
            logger.trackSwallowedError('ExportService:downloadImagesAsMp4/convert', e);
        }

        processedCount++;
        setToast(prev => ({ ...prev!, current: processedCount }));
    }

    if (successCount === 0) {
        setToast({ show: true, message: 'MP4 변환에 실패했습니다.' });
        setTimeout(() => setToast(null), 3000);
        return;
    }

    setToast(prev => ({ ...prev!, message: 'ZIP 생성 중... (컴패니언)' }));

    const content = await createZipViaCompanion(zipFiles);
    const link = document.createElement('a');
    const _mp4ZipUrl = URL.createObjectURL(content);
    logger.registerBlobUrl(_mp4ZipUrl, 'other', 'exportService:downloadImagesAsMp4');
    link.href = _mp4ZipUrl;
    link.download = `images_as_mp4_${Date.now()}.zip`;
    link.click();
    logger.unregisterBlobUrl(_mp4ZipUrl);

    setToast({ show: true, message: `이미지 ${successCount}장 → MP4 변환 다운로드 완료!` });
    setTimeout(() => setToast(null), 4000);
};

/** 장면 오디오 길이(초)를 반환. TTS 길이 → 스크립트 길이 추정 순으로 폴백 */
function estimateSceneDuration(scene: Scene): number {
    if (scene.audioDuration && scene.audioDuration > 0) return scene.audioDuration;
    // TTS 미생성 시: 한국어 기준 ~4자/초로 추정
    const text = getSceneNarrationText(scene);
    const cleanLen = text.replace(/\s+/g, '').length;
    return Math.max(2, Math.ceil(cleanLen / 4));
}

/** 화면 비율에 맞는 비디오 해상도 반환 */
function getVideoResolution(aspectRatio: string): { width: number; height: number } {
    switch (aspectRatio) {
        case '9:16': return { width: 1080, height: 1920 };
        case '1:1': return { width: 1080, height: 1080 };
        case '4:3': return { width: 1440, height: 1080 };
        case '3:4': return { width: 1080, height: 1440 };
        case '16:9':
        default: return { width: 1920, height: 1080 };
    }
}

/** 이미지 Blob을 정지 화면 MP4로 변환 (WebCodecs + mp4-muxer) */
async function convertImageToMp4(
    imageBlob: Blob,
    durationSec: number,
    resolution: { width: number; height: number },
    probe: { codec: string; hardwareAcceleration: 'prefer-hardware' | 'prefer-software' | 'no-preference' },
    effect?: SceneEffectConfig,
): Promise<Blob> {
    const { createEncoder } = await import('./webcodecs/videoEncoder');
    const { createMp4Muxer } = await import('./webcodecs/mp4Muxer');

    const { width, height } = resolution;
    const hasKenBurns = effect && effect.panZoomPreset !== 'none';
    // 모션 있으면 24fps (부드러운 움직임), 없으면 1fps (파일 크기 최소화)
    const fps = hasKenBurns ? 24 : 1;
    const totalFrames = hasKenBurns
        ? Math.max(2, Math.ceil(durationSec * fps))
        : Math.max(2, Math.ceil(durationSec));

    const muxer = createMp4Muxer({ width, height, fps, hasAudio: false });

    const chunks: Array<{ chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }> = [];
    let encodeError: Error | null = null;
    const encoder = createEncoder(
        { width, height, fps, bitrate: hasKenBurns ? 4_000_000 : 2_000_000, keyframeIntervalFrames: hasKenBurns ? fps * 2 : totalFrames },
        probe.codec,
        probe.hardwareAcceleration,
        (encoded) => chunks.push(encoded),
        (err) => { encodeError = err; },
    );

    try {
        const imgBitmap = await createImageBitmap(imageBlob);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;

        if (hasKenBurns) {
            // Ken Burns 모션 적용: 매 프레임마다 변환 계산
            const { computeKenBurns, drawKenBurnsFrame } = await import('./webcodecs/kenBurnsEngine');

            for (let i = 0; i < totalFrames; i++) {
                ctx.clearRect(0, 0, width, height);
                const transform = computeKenBurns(
                    effect!.panZoomPreset, i, totalFrames, width, height,
                    effect!.anchorX, effect!.anchorY, fps,
                );
                drawKenBurnsFrame(ctx, imgBitmap, transform, width, height, effect!.anchorX, effect!.anchorY);
                encoder.encodeFrame(canvas, i);
            }
        } else {
            // 정지 이미지: cover 방식으로 한 번 그리고 반복
            const scale = Math.max(width / imgBitmap.width, height / imgBitmap.height);
            const scaledW = imgBitmap.width * scale;
            const scaledH = imgBitmap.height * scale;
            const dx = (width - scaledW) / 2;
            const dy = (height - scaledH) / 2;
            ctx.drawImage(imgBitmap, dx, dy, scaledW, scaledH);

            for (let i = 0; i < totalFrames; i++) {
                encoder.encodeFrame(canvas, i);
            }
        }

        imgBitmap.close();
        await encoder.flush();
    } finally {
        encoder.encoder.close();
    }

    if (encodeError) throw encodeError;

    for (const c of chunks) {
        muxer.addVideoChunk(c);
    }

    return muxer.finalize();
}

export const downloadThumbnails = async () => {
    const { thumbnails } = useProjectStore.getState();

    const validThumbs = thumbnails.filter(t => t.imageUrl);
    const total = validThumbs.length;
    if (total === 0) { useUIStore.getState().setToast({ show: true, message: "다운로드할 썸네일이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }

    // [v2.5] 컴패니언 ZIP 생성
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ url?: string; path?: string; filename: string }> = [];
    useUIStore.getState().setToast({ show: true, message: "썸네일 저장 중...", current: 0, total: total });

    await processSequentially(validThumbs, 5, 20, async (thumb) => {
        try {
            const filename = getSafeFilename(thumbnails.indexOf(thumb), thumb.textOverlay, 'png');
            if (thumb.imageUrl!.startsWith('data:image')) {
                const arr = thumb.imageUrl!.split(',');
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
                const bstr = atob(arr[1]);
                const u8 = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                const blob = new Blob([u8], { type: mime });
                const tp = await uploadBlobToCompanion(blob, filename);
                zipFiles.push({ path: tp, filename });
            } else {
                zipFiles.push({ url: thumb.imageUrl!, filename });
            }
        } catch(e) { console.error("Thumb DL error", e); }
    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 생성 중... (컴패니언)" }));

    const content = await createZipViaCompanion(zipFiles);
    const link = document.createElement('a');
    const _thumbZipUrl = URL.createObjectURL(content);
    logger.registerBlobUrl(_thumbZipUrl, 'other', 'exportService:downloadThumbnails');
    link.href = _thumbZipUrl;
    link.download = `project_thumbnails_${Date.now()}.zip`;
    link.click();
    logger.unregisterBlobUrl(_thumbZipUrl);

    useUIStore.getState().setToast({ show: true, message: `썸네일 ${total}장 다운로드 완료!` });
    setTimeout(() => useUIStore.getState().setToast(null), 4000);
};

export const exportProjectHtml = async () => {
    const { config, scenes, thumbnails, projectTitle, currentProjectId } = useProjectStore.getState();
    const { costStats } = useCostStore.getState();
    const { setProcessing } = useUIStore.getState();

    if (!config) return;

    // Safety check: estimate project size before building export
    const base64Count = scenes.filter(s => s.imageUrl?.startsWith('data:')).length;
    const estimatedMB = base64Count * 3; // ~3MB average per base64 image
    if (estimatedMB > 100) {
        throw new Error(`프로젝트 크기가 너무 큽니다 (약 ${estimatedMB}MB). 이미지를 Cloudinary에 업로드한 후 다시 시도해주세요.`);
    }

    setProcessing(true, "HTML 파일 최적화 중... (스마트 리사이징 + JPG 변환)", "EXPORT");

    try {
        const isShort = config.videoFormat === VideoFormat.SHORT || config.videoFormat === VideoFormat.NANO;

        const constraint = isShort
            ? { type: 'height' as const, size: 1920 }
            : { type: 'width' as const, size: 1920 };

        const optimizedScenes = await Promise.all(scenes.map(async (s) => {
            if (s.imageUrl) {
                return { ...s, imageUrl: await optimizeForExport(s.imageUrl, 'image/jpeg', constraint) };
            }
            return s;
        }));

        const optimizedThumbnails = await Promise.all(thumbnails.map(async (t) => {
            if (t.imageUrl) {
                return { ...t, imageUrl: await optimizeForExport(t.imageUrl, 'image/jpeg', constraint) };
            }
            return t;
        }));

        const optimizedConfig = { ...config };

        const getAutoTitle = (script: string) => {
            if (!script) return "Untitled Project";
            const firstLine = script.split('\n')[0].trim();
            const words = firstLine.split(/\s+/).slice(0, 3);
            return words.join(' ') || "Untitled Project";
        };

        const finalTitle = projectTitle || getAutoTitle(config.script);

        const data = {
            id: currentProjectId,
            title: finalTitle,
            config: optimizedConfig,
            scenes: optimizedScenes,
            thumbnails: optimizedThumbnails,
            costStats
        };

        const displayTitle = finalTitle.replace(/\n/g, ' ');

        // 자막 폰트 CSS 생성
        const { subtitleStyle, subtitles } = useEditorStore.getState();
        let subtitleFontCss = '';
        if (subtitleStyle) {
            const fontEntry = getFontByFamily(subtitleStyle.template.fontFamily);
            if (fontEntry) subtitleFontCss = generateFontCssTag(fontEntry);
        }

        const htmlContent = buildExportHtml(data, displayTitle, subtitleFontCss, subtitleStyle, subtitles);

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const link = document.createElement('a');
        const _htmlUrl = URL.createObjectURL(blob);
        logger.registerBlobUrl(_htmlUrl, 'other', 'exportService:exportProjectHtml');
        link.href = _htmlUrl;
        const safeTitle = sanitizeProjectName(displayTitle, 30);
        link.download = `${safeTitle}_Project_Export.html`;
        link.click();
        logger.unregisterBlobUrl(_htmlUrl);

    } catch(e) {
        console.error("Export failed", e);
        useUIStore.getState().setToast({ show: true, message: "내보내기 중 오류가 발생했습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 4000);
    } finally {
        setProcessing(false);
    }
};

// --- ZIP Export (30+ scenes) ---

async function imageToBlob(imageUrl: string, maxWidth: number, quality: number, targetAspectRatio?: string): Promise<Blob> {
  // Remote URL: fetch directly, then apply aspect ratio crop if needed
  if (!imageUrl.startsWith('data:')) {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    // [FIX #183] 비율 크롭 적용
    if (targetAspectRatio) {
      const { cropBlobToAspectRatio } = await import('../utils/fileHelpers');
      return cropBlobToAspectRatio(blob, targetAspectRatio, quality);
    }
    return blob;
  }
  // Base64: downscale via canvas + [FIX #183] aspect ratio crop
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;

      // [FIX #183] Apply aspect ratio center-crop
      let sx = 0, sy = 0, sw = w, sh = h;
      if (targetAspectRatio) {
        const parts = targetAspectRatio.split(':').map(Number);
        if (parts.length === 2 && parts[0] && parts[1]) {
          const targetAR = parts[0] / parts[1];
          const currentAR = w / h;
          if (Math.abs(currentAR - targetAR) / targetAR >= 0.02) {
            if (currentAR > targetAR) {
              sw = Math.round(h * targetAR);
              sx = Math.round((w - sw) / 2);
            } else {
              sh = Math.round(w / targetAR);
              sy = Math.round((h - sh) / 2);
            }
            w = sw; h = sh;
          }
        }
      }

      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas error')); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

export const exportProjectZip = async () => {
  const { config, scenes, thumbnails, projectTitle, currentProjectId } = useProjectStore.getState();
  const { costStats } = useCostStore.getState();
  const { setProcessing } = useUIStore.getState();
  if (!config) return;

  setProcessing(true, 'ZIP 내보내기 준비 중...', 'EXPORT');

  try {
    // [v2.5] 컴패니언 ZIP 생성 — 폴더 구조 지원 (filename에 경로 포함)
    const { createZipViaCompanion } = await import('./companion/zipService');
    const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
    const zipFiles: Array<{ path: string; filename: string }> = [];

    const isLarge = scenes.length >= 200;
    const maxWidth = isLarge ? 1280 : 1920;
    const jpegQuality = isLarge ? 0.6 : 0.8;
    const total = scenes.length;

    const manifestScenes: ExportManifest['scenes'] = [];

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      let imageFile: string | undefined;

      if (s.imageUrl) {
        const ext = 'jpg';
        const filename = `scene_${String(i + 1).padStart(3, '0')}.${ext}`;
        try {
          useUIStore.getState().setProcessing(true, `이미지 변환 중 (${i + 1}/${total})...`, 'EXPORT');
          const imgBlob = await imageToBlob(s.imageUrl, maxWidth, jpegQuality, config.aspectRatio);
          const tp = await uploadBlobToCompanion(imgBlob, filename);
          zipFiles.push({ path: tp, filename: `data/scenes/${filename}` });
          imageFile = filename;
        } catch (e) {
          console.warn(`[ZipExport] scene ${i + 1} image failed`, e);
        }
      }

      manifestScenes.push({
        id: s.id,
        index: i,
        scriptText: getSceneNarrationText(s),
        audioScript: s.audioScript,
        visualPrompt: s.visualPrompt,
        cameraMovement: s.cameraMovement,
        imageFile,
        videoUrl: s.videoUrl,
        characterPresent: s.characterPresent,
        castType: s.castType,
        entityName: s.entityName,
      });
    }

    const manifest: ExportManifest = {
      version: '1.0',
      projectId: currentProjectId || '',
      title: projectTitle || config.script?.substring(0, 30) || 'Untitled',
      createdAt: Date.now(),
      sceneCount: scenes.length,
      config,
      scenes: manifestScenes,
      thumbnails: thumbnails.filter(t => t.imageUrl).map(t => ({
        id: t.id, imageFile: undefined, textOverlay: t.textOverlay,
      })),
      costStats,
    };

    const manifestJsonStr = JSON.stringify(manifest, null, 2);
    const manifestBlob = new Blob([manifestJsonStr], { type: 'application/json' });
    const manifestPath = await uploadBlobToCompanion(manifestBlob, 'manifest.json');
    zipFiles.push({ path: manifestPath, filename: 'data/manifest.json' });

    const viewerHtml = buildOptimizedViewerHtml(manifest.title, JSON.stringify(manifest));
    const htmlBlob = new Blob([viewerHtml], { type: 'text/html' });
    const htmlPath = await uploadBlobToCompanion(htmlBlob, 'index.html');
    zipFiles.push({ path: htmlPath, filename: 'index.html' });

    useUIStore.getState().setProcessing(true, 'ZIP 생성 중... (컴패니언)', 'EXPORT');
    const blob = await createZipViaCompanion(zipFiles);

    const link = document.createElement('a');
    const _zipUrl = URL.createObjectURL(blob);
    logger.registerBlobUrl(_zipUrl, 'other', 'exportService:exportProjectZip');
    link.href = _zipUrl;
    const safeTitle = sanitizeProjectName(manifest.title, 30);
    link.download = `${safeTitle}_Project.zip`;
    link.click();
    setTimeout(() => {
      logger.unregisterBlobUrl(_zipUrl);
      URL.revokeObjectURL(_zipUrl);
    }, 60000);

  } catch (e) {
    console.error('[ZipExport] failed', e);
    useUIStore.getState().setToast({ show: true, message: '내보내기 실패: ' + (e instanceof Error ? e.message : String(e)) });
    setTimeout(() => useUIStore.getState().setToast(null), 5000);
  } finally {
    setProcessing(false);
  }
};

export const exportVisualPromptsHtml = () => {
    const { scenes } = useProjectStore.getState();
    const { config, projectTitle } = useProjectStore.getState();

    if (scenes.length === 0) { useUIStore.getState().setToast({ show: true, message: "생성된 씬이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
    const displayTitle = projectTitle || config?.script.substring(0, 30) || "Visual Prompts";
    const htmlContent = buildPromptGuideHtml(`${displayTitle} - Visual Prompts Guide`, scenes, (s) => s.visualPrompt || "No prompt generated");
    downloadHtmlFile(htmlContent, `Visual_Prompts_${Date.now()}.html`);
};

export const exportVideoPromptsHtml = () => {
    const { scenes } = useProjectStore.getState();
    const { config, projectTitle } = useProjectStore.getState();

    if (scenes.length === 0) { useUIStore.getState().setToast({ show: true, message: "생성된 씬이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }
    const displayTitle = projectTitle || config?.script.substring(0, 30) || "Video Prompts";
    const htmlContent = buildPromptGuideHtml(`${displayTitle} - Video Prompts Guide`, scenes, (s) => {
            let p = s.visualPrompt || "";
            p = p.replace(/^(Prompt:|Scene depicting:|Image of:|Scene:)\s*/i, "").trim();
            let tags = "";
            if (s.cameraAngle) tags += ` [CAMERA: ${s.cameraAngle.replace(/\[|\]|CAMERA:/g, "").trim()}]`;
            if (s.cameraMovement) tags += ` [MOVEMENT: ${s.cameraMovement.replace(/\[|\]|MOVEMENT:/g, "").trim()}]`;
            tags += s.requiresTextRendering ? " [CONTROL: TEXT_LOCK]" : " [NO TEXT]";
            if (s.isLoopMode) tags += " [LOOP: TRUE]";
            if (s.grokSpeechMode) tags += " [Native Dialogue]";
            else tags += " [Sound Effects Only] [No Speech]";
            return (p + tags).trim();
        }
    );
    downloadHtmlFile(htmlContent, `Video_Prompts_${Date.now()}.html`);
};

/** 프로젝트 대시보드에서 ID로 직접 내보내기 (스토어 의존 없음) */
export const exportProjectById = async (projectId: string): Promise<void> => {
    const { getProject } = await import('./storageService');
    const project = await getProject(projectId);
    if (!project) {
        useUIStore.getState().setToast({ show: true, message: '프로젝트를 찾을 수 없습니다.' });
        setTimeout(() => useUIStore.getState().setToast(null), 3000);
        return;
    }

    const { config, scenes, thumbnails, title, id, costStats } = project;
    if (!config) {
        useUIStore.getState().setToast({ show: true, message: '프로젝트 설정이 없습니다.' });
        setTimeout(() => useUIStore.getState().setToast(null), 3000);
        return;
    }

    const displayTitle = (title || 'Untitled').replace(/\n/g, ' ');
    const emptyCostStats = { totalUsd: 0, imageCount: 0, videoCount: 0, analysisCount: 0, ttsCount: 0, musicCount: 0 };

    if (scenes.length >= 30) {
        // [v2.5] ZIP 내보내기 (대형 프로젝트) — 컴패니언 ZIP
        try {
            const { createZipViaCompanion } = await import('./companion/zipService');
            const { uploadBlobToCompanion } = await import('./companion/tunnelClient');
            const zipFiles2: Array<{ path: string; filename: string }> = [];

            const isLarge = scenes.length >= 200;
            const maxWidth = isLarge ? 1280 : 1920;
            const jpegQuality = isLarge ? 0.6 : 0.8;

            const manifestScenes: ExportManifest['scenes'] = [];
            for (let i = 0; i < scenes.length; i++) {
                const s = scenes[i];
                let imageFile: string | undefined;
                if (s.imageUrl) {
                    const filename = `scene_${String(i + 1).padStart(3, '0')}.jpg`;
                    try {
                        const imgBlob = await imageToBlob(s.imageUrl, maxWidth, jpegQuality, config.aspectRatio);
                        const tp = await uploadBlobToCompanion(imgBlob, filename);
                        zipFiles2.push({ path: tp, filename: `data/scenes/${filename}` });
                        imageFile = filename;
                    } catch (e) { logger.trackSwallowedError('ExportService:exportProjectById/imageToBlob', e); }
                }
                manifestScenes.push({
                    id: s.id, index: i, scriptText: getSceneNarrationText(s), audioScript: s.audioScript, visualPrompt: s.visualPrompt,
                    cameraMovement: s.cameraMovement, imageFile, videoUrl: s.videoUrl,
                    characterPresent: s.characterPresent, castType: s.castType, entityName: s.entityName,
                });
            }

            const manifest: ExportManifest = {
                version: '1.0', projectId: id, title: displayTitle, createdAt: Date.now(),
                sceneCount: scenes.length, config, scenes: manifestScenes,
                thumbnails: thumbnails.filter(t => t.imageUrl).map(t => ({ id: t.id, imageFile: undefined, textOverlay: t.textOverlay })),
                costStats: costStats || emptyCostStats,
            };
            const mfBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
            const mfPath = await uploadBlobToCompanion(mfBlob, 'manifest.json');
            zipFiles2.push({ path: mfPath, filename: 'data/manifest.json' });
            const htmlBlob2 = new Blob([buildOptimizedViewerHtml(manifest.title, JSON.stringify(manifest))], { type: 'text/html' });
            const htmlPath2 = await uploadBlobToCompanion(htmlBlob2, 'index.html');
            zipFiles2.push({ path: htmlPath2, filename: 'index.html' });

            const blob = await createZipViaCompanion(zipFiles2);
            const link = document.createElement('a');
            const _byIdZipUrl = URL.createObjectURL(blob);
            logger.registerBlobUrl(_byIdZipUrl, 'other', 'exportService:exportProjectById:zip');
            link.href = _byIdZipUrl;
            const safeTitle = sanitizeProjectName(displayTitle, 30);
            link.download = `${safeTitle}_Project.zip`;
            link.click();
            logger.unregisterBlobUrl(_byIdZipUrl);
            URL.revokeObjectURL(_byIdZipUrl);
        } catch (e) {
            console.error('[exportProjectById] ZIP failed', e);
            useUIStore.getState().setToast({ show: true, message: '내보내기 실패: ' + (e instanceof Error ? e.message : String(e)) });
            setTimeout(() => useUIStore.getState().setToast(null), 4000);
        }
    } else {
        // HTML 내보내기 (소형 프로젝트)
        try {
            const isShort = config.videoFormat === VideoFormat.SHORT || config.videoFormat === VideoFormat.NANO;
            const constraint = isShort
                ? { type: 'height' as const, size: 1920 }
                : { type: 'width' as const, size: 1920 };

            const optimizedScenes = await Promise.all(scenes.map(async (s) => {
                if (s.imageUrl) return { ...s, imageUrl: await optimizeForExport(s.imageUrl, 'image/jpeg', constraint) };
                return s;
            }));
            const optimizedThumbnails = await Promise.all(thumbnails.map(async (t) => {
                if (t.imageUrl) return { ...t, imageUrl: await optimizeForExport(t.imageUrl, 'image/jpeg', constraint) };
                return t;
            }));

            const data = { id, title: displayTitle, config, scenes: optimizedScenes, thumbnails: optimizedThumbnails, costStats: costStats || emptyCostStats };
            const htmlContent = buildExportHtml(data, displayTitle);

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const link = document.createElement('a');
            const _byIdHtmlUrl = URL.createObjectURL(blob);
            logger.registerBlobUrl(_byIdHtmlUrl, 'other', 'exportService:exportProjectById:html');
            link.href = _byIdHtmlUrl;
            const safeTitle = sanitizeProjectName(displayTitle, 30);
            link.download = `${safeTitle}_Project_Export.html`;
            link.click();
            logger.unregisterBlobUrl(_byIdHtmlUrl);
            URL.revokeObjectURL(_byIdHtmlUrl);
        } catch (e) {
            console.error('[exportProjectById] HTML failed', e);
            useUIStore.getState().setToast({ show: true, message: '내보내기 실패: ' + (e instanceof Error ? e.message : String(e)) });
            setTimeout(() => useUIStore.getState().setToast(null), 4000);
        }
    }
};
