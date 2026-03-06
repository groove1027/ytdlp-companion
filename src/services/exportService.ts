
import { VideoFormat, ExportManifest } from '../types';
import type { Scene, Thumbnail } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useEditorStore } from '../stores/editorStore';
import { useUIStore } from '../stores/uiStore';
import { useCostStore } from '../stores/costStore';
import { uploadRemoteUrlToCloudinary } from './uploadService';
import { getSafeFilename, processSequentially, optimizeForExport, downloadHtmlFile } from '../utils/fileHelpers';
import { buildExportHtml } from '../templates/exportHtml';
import { buildPromptGuideHtml } from '../templates/promptGuide';
import { getFontByFamily } from '../constants/fontLibrary';
import { generateFontCssTag } from './fontLoaderService';
import { buildOptimizedViewerHtml } from '../templates/exportHtmlOptimized';

export const downloadImages = async () => {
    const { scenes } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const validScenes = scenes.filter(s => s.imageUrl);
    const total = validScenes.length;

    if (total === 0) { setToast({ show: true, message: "다운로드할 이미지가 없습니다." }); setTimeout(() => setToast(null), 3000); return; }

    setToast({ show: true, message: "이미지 저장 중...", current: 0, total: total });

    await processSequentially(validScenes, 5, 20, async (s) => {
        const filename = getSafeFilename(scenes.indexOf(s), s.scriptText, 'png');
        if (s.imageUrl!.startsWith('data:image')) {
            zip.file(filename, s.imageUrl!.split(',')[1], { base64: true });
        } else {
            try {
                const res = await fetch(s.imageUrl!);
                const blob = await res.blob();
                zip.file(filename, blob);
            } catch (e) {
                console.error(`Failed to fetch image for scene ${s.id}`, e);
            }
        }
    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 압축 중..." }));

    await new Promise(resolve => setTimeout(resolve, 50));

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `images_${Date.now()}.zip`;
    link.click();

    useUIStore.getState().setToast(null);
};

export const downloadVideos = async () => {
    const { scenes } = useProjectStore.getState();
    const { setToast } = useUIStore.getState();

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const videoScenes = scenes.filter(s => s.videoUrl);
    const total = videoScenes.length;

    if (total === 0) { setToast({ show: true, message: "다운로드할 영상이 없습니다." }); setTimeout(() => setToast(null), 3000); return; }

    setToast({ show: true, message: "영상 다운로드 준비 중...", current: 0, total: total });

    const linkOnlyScenes: {index: number}[] = [];

    await processSequentially(videoScenes, 1, 200, async (s) => {
        const sceneIndex = scenes.findIndex(orig => orig.id === s.id) + 1;
        let blob: Blob | null = null;

        try {
            const res = await fetch(s.videoUrl!);
            if (res.ok) {
                blob = await res.blob();
            }
        } catch (e: unknown) { /* CORS blocked - try proxy */ }

        if (!blob) {
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts && !blob) {
                try {
                    attempts++;
                    if (attempts > 1) {
                        useUIStore.getState().setToast(prev => ({ ...prev!, message: `[재시도 ${attempts}/${maxAttempts}] Scene #${sceneIndex} 다운로드 중...` }));
                    } else {
                        useUIStore.getState().setToast(prev => ({ ...prev!, message: `보안 우회 다운로드 중 (${sceneIndex}/${total})...` }));
                    }

                    const proxyUrl = await uploadRemoteUrlToCloudinary(s.videoUrl!);
                    const res = await fetch(proxyUrl);

                    if (res.ok) {
                        blob = await res.blob();
                    } else {
                        throw new Error(`Proxy status ${res.status}`);
                    }
                } catch (proxyErr: unknown) {
                    console.warn(`Attempt ${attempts} failed for Scene ${sceneIndex}:`, proxyErr);
                    if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        if (blob) {
            const filename = getSafeFilename(sceneIndex - 1, s.scriptText, 'mp4');
            zip.file(filename, blob);
        } else {
            const safeName = getSafeFilename(sceneIndex - 1, s.scriptText, 'txt');
            const errorFilename = `ERROR_${safeName}`;
            const errorContent = `[다운로드 실패 안내]\nScene #${sceneIndex} 영상 다운로드 실패.\n\n링크:\n${s.videoUrl}`;
            zip.file(errorFilename, errorContent);
            linkOnlyScenes.push({ index: sceneIndex });
        }

    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    if (linkOnlyScenes.length > 0) {
        useUIStore.getState().setToast({ show: true, message: "⚠️ 일부 영상 다운로드 실패. 대체 텍스트 파일이 포함됩니다." });
    }

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 압축 중..." }));

    await new Promise(resolve => setTimeout(resolve, 50));

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `videos_complete_${Date.now()}.zip`;
    link.click();

    useUIStore.getState().setToast(null);
};

export const downloadThumbnails = async () => {
    const { thumbnails } = useProjectStore.getState();

    const validThumbs = thumbnails.filter(t => t.imageUrl);
    const total = validThumbs.length;
    if (total === 0) { useUIStore.getState().setToast({ show: true, message: "다운로드할 썸네일이 없습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 3000); return; }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    useUIStore.getState().setToast({ show: true, message: "썸네일 저장 중...", current: 0, total: total });

    await processSequentially(validThumbs, 5, 20, async (thumb) => {
        try {
            const filename = getSafeFilename(thumbnails.indexOf(thumb), thumb.textOverlay, 'png');
            if (thumb.imageUrl!.startsWith('data:image')) {
                const base64Data = thumb.imageUrl!.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
                zip.file(filename, base64Data, { base64: true });
            } else {
                const response = await fetch(thumb.imageUrl!);
                const blob = await response.blob();
                zip.file(filename, blob);
            }
        } catch(e) { console.error("Thumb DL error", e); }
    }, (count) => useUIStore.getState().setToast(prev => ({ ...prev!, current: count })));

    useUIStore.getState().setToast(prev => ({ ...prev!, message: "ZIP 압축 중..." }));
    await new Promise(resolve => setTimeout(resolve, 50));

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `project_thumbnails_${Date.now()}.zip`;
    link.click();

    useUIStore.getState().setToast(null);
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
        link.href = URL.createObjectURL(blob);
        const safeTitle = displayTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 30);
        link.download = `${safeTitle}_Project_Export.html`;
        link.click();

    } catch(e) {
        console.error("Export failed", e);
        useUIStore.getState().setToast({ show: true, message: "내보내기 중 오류가 발생했습니다." }); setTimeout(() => useUIStore.getState().setToast(null), 4000);
    } finally {
        setProcessing(false);
    }
};

// --- ZIP Export (30+ scenes) ---

async function imageToBlob(imageUrl: string, maxWidth: number, quality: number): Promise<Blob> {
  // Remote URL: fetch directly
  if (!imageUrl.startsWith('data:')) {
    const res = await fetch(imageUrl);
    return await res.blob();
  }
  // Base64: downscale via canvas
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas error')); return; }
      ctx.drawImage(img, 0, 0, w, h);
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
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const dataFolder = zip.folder('data')!;
    const scenesFolder = dataFolder.folder('scenes')!;

    const isLarge = scenes.length >= 200;
    const maxWidth = isLarge ? 1280 : 1920;
    const jpegQuality = isLarge ? 0.6 : 0.8;
    const total = scenes.length;

    // Build manifest scenes with image references
    const manifestScenes: ExportManifest['scenes'] = [];

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      let imageFile: string | undefined;

      if (s.imageUrl) {
        const ext = 'jpg';
        const filename = `scene_${String(i + 1).padStart(3, '0')}.${ext}`;
        try {
          useUIStore.getState().setProcessing(true, `이미지 변환 중 (${i + 1}/${total})...`, 'EXPORT');
          const blob = await imageToBlob(s.imageUrl, maxWidth, jpegQuality);
          scenesFolder.file(filename, blob);
          imageFile = filename;
        } catch (e) {
          console.warn(`[ZipExport] scene ${i + 1} image failed`, e);
        }
      }

      manifestScenes.push({
        id: s.id,
        index: i,
        scriptText: s.scriptText,
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

    dataFolder.file('manifest.json', JSON.stringify(manifest, null, 2));

    // HTML viewer
    const viewerHtml = buildOptimizedViewerHtml(manifest.title);
    zip.file('index.html', viewerHtml);

    useUIStore.getState().setProcessing(true, 'ZIP 압축 중...', 'EXPORT');
    const blob = await zip.generateAsync({ type: 'blob' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeTitle = manifest.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 30);
    link.download = `${safeTitle}_Project.zip`;
    link.click();
    URL.revokeObjectURL(link.href);

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
