
import { Scene, AspectRatio, ImageModel, RemakeStyleAnalysis } from '../../types';
import type { WhisperTranscriptResult } from '../../types';
import { getKieKey, monitoredFetch } from '../apiService';
import { getEvolinkKey, fetchWithRateLimitRetry } from '../evolinkService';
import { SAFETY_SETTINGS_BLOCK_NONE, requestGeminiProxy, requestKieChatFallback, extractTextFromResponse } from './geminiProxy';
import { uploadMediaToHosting } from '../uploadService';
import { smartUpload } from '../companion/smartUpload';
import { generateKieImage, generateEvolinkImageWrapped } from '../VideoGenService';
import { transcribeWithDiarization, formatDiarizedTranscript } from '../transcriptionService';
import { logger } from '../LoggerService';
import { getSceneNarrationText } from '../../utils/sceneText';
import { computeVideoAnalysisMaxTokens, computeVideoAnalysisTimeoutMs } from './videoAnalysisLimits';
// extractStreamUrl/isYtdlpServerConfigured — CDN URL은 Vertex AI robots.txt로 차단되어 사용 불가

// --- Types ---
type VideoSource = { youtubeUrl: string } | { videoFile: File };

// --- 1-A: analyzeVideoWithGemini ---
// Evolink → Kie /v1beta/ Google Native endpoint (NOT OpenAI format)
export const analyzeVideoWithGemini = async (
    source: VideoSource,
    atmosphere: string,
    strategy: 'NARRATIVE' | 'VISUAL',
    userInstructions?: string,
    durationSec?: number
): Promise<Scene[]> => {
    const evolinkKey = getEvolinkKey();
    const apiKey = evolinkKey || getKieKey();
    if (!apiKey) throw new Error("API Key가 설정되지 않았습니다. (Evolink 또는 Kie)");

    // Determine video URI + MIME type
    // [v2.0 #1066] 업로드 파일은 컴패니언 터널 우선 (89MB/240초+ 검증). 폴백은 Cloudinary.
    // (Codex 프론트 7차 Medium) 실제 파일 MIME 보존 (mov/webm 등)
    let fileUri: string;
    let fileMimeType = 'video/mp4';
    let tunnelCleanup: (() => Promise<void>) | null = null;
    if ('youtubeUrl' in source) {
        // [FIX] YouTube watch URL을 그대로 Gemini에 전달
        // ✅ 실제 테스트: Evolink Gemini v1beta가 YouTube URL을 내부적으로 처리
        // ❌ CDN URL(googlevideo.com)은 Vertex AI robots.txt로 차단됨
        fileUri = source.youtubeUrl;
    } else {
        // [v2.0 #1066] 컴패니언 터널 우선 → Cloudinary 자동 폴백
        // (Codex 프론트 6차 Medium) 30분 timeout으로 hang 방지
        const uploadTimeout = AbortSignal.timeout(30 * 60 * 1000);
        const upload = await smartUpload(source.videoFile, {
            ttlSecs: 1500, // 25분 — 분석 평균 60~120초 + 큰 영상 여유
            signal: uploadTimeout,
        });
        fileUri = upload.url;
        // (Codex 프론트 7차 Medium) 실제 mime 보존 (mp4가 아니어도)
        fileMimeType = source.videoFile.type || 'video/mp4';
        tunnelCleanup = upload.cleanup;
        logger.info('[VideoAnalysis] 업로드 경로:', { source: upload.source, mime: fileMimeType });
    }

    const strategyPrompt = strategy === 'NARRATIVE'
        ? `Focus on DIALOGUE and NARRATION. Extract spoken lines accurately and match them to visual scenes.
           For each scene, prioritize the audioScript field with exact dialogue/narration.`
        : `Focus on VISUAL composition and camera work. Pay attention to cuts, transitions, and framing.
           For each scene, prioritize cameraAngle, cameraMovement, and detailed visualPrompt.`;

    const userSection = userInstructions && userInstructions.trim() && userInstructions !== "영상 분석을 통한 자동 생성"
        ? `\n## USER INSTRUCTIONS (MUST APPLY)\nThe user requested the following changes to the remake. Apply these instructions to EVERY scene:\n${userInstructions}\n`
        : '';

    // [FIX #948] 롱폼 대응: 영상 길이에 따라 장면 길이 동적 조절
    const sceneDuration = !durationSec || durationSec <= 120
      ? '10~15'
      : durationSec <= 600
        ? '30~60'
        : '60~120';

    const prompt = `You are a professional video analyst and scene breakdown specialist.

Analyze this video and break it into individual scenes (${sceneDuration} seconds each).${durationSec && durationSec > 120 ? `\nThis is a long-form video (~${Math.round(durationSec / 60)} minutes). Ensure timestamps are accurate and cover the ENTIRE video duration (0 to ${Math.round(durationSec)} seconds). Do NOT cluster all timestamps in the first few minutes.` : ''}

## Analysis Strategy
${strategyPrompt}
${userSection}
## CRITICAL RULES
1. IGNORE all subtitles, captions, and watermarks in the video. Do NOT include them in visualPrompt.
2. Each scene must have a unique, detailed visualPrompt describing the visual content.
3. Timestamps must be accurate and non-overlapping.
4. visualPrompt must describe what is visually happening, NOT what is being said.
5. audioScript contains the spoken dialogue/narration heard during that scene segment.
6. scriptText MUST be a proper narration script (voiceover text), NOT a scene description. Write it as if a narrator is speaking to the audience.

## Output Format
Return a JSON array of scene objects:
[
  {
    "scriptText": "Narration script in Korean — written as voiceover text for the audience, NOT a scene description",
    "visualPrompt": "Detailed English visual description: subject, action, setting, lighting, composition. No subtitles/text.",
    "startTime": 0,
    "endTimeStamp": 12,
    "shotSize": "Extreme Wide / Wide / Full / Medium / Medium Close-Up / Close-Up / Extreme Close-Up",
    "cameraAngle": "Eye Level / Low Angle / High Angle / Dutch Angle / Bird's Eye / Worm's Eye",
    "cameraMovement": "Static / Pan Left / Pan Right / Tilt Up / Tilt Down / Dolly In / Dolly Out / Tracking / Crane / Handheld",
    "audioScript": "Exact spoken dialogue or narration in original language, empty string if silent",
    "characterPresent": true,
    "characterAction": "Description of what the character is doing"
  }
]

Analyze the video now. Return ONLY the JSON array.`;

    // [FIX] Evolink v1beta 우선, Kie chat/completions 폴백 (Kie는 v1beta 미지원)
    const requestBody = {
        contents: [{
            role: 'user' as const,
            parts: [
                {
                    fileData: {
                        mimeType: fileMimeType,
                        fileUri: fileUri
                    }
                },
                { text: prompt }
            ]
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: durationSec && durationSec > 600 ? 0.2 : 0.3,
            // [v2.0 Phase 4-2] 드라마 1화 통째 분석 (45~90분) — 토큰 한도 65k 동적 산출
            maxOutputTokens: computeVideoAnalysisMaxTokens(durationSec),
        },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE
    };

    // [v2.0 Phase 4-2] 드라마 1화 분석 대응 — duration에 따라 동적 timeout
    const VIDEO_ANALYSIS_TIMEOUT_MS = computeVideoAnalysisTimeoutMs(durationSec);

    // [v2.0 #1066] try/finally로 tunnelCleanup 반드시 호출
    try {
        let data: any;
        if (evolinkKey) {
            try {
                const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`;
                const response = await fetchWithRateLimitRetry(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${evolinkKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                }, 3, 3000, VIDEO_ANALYSIS_TIMEOUT_MS);
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Video Analysis API Error (${response.status}): ${errText}`);
                }
                data = await response.json();
            } catch (evolinkErr) {
                // [FIX #679] Evolink 실패 시 Kie chat/completions 폴백 (기존에는 에러만 throw)
                // [FIX #679 P2] Kie 키 미설정 시 원본 Evolink 에러를 유지 (Codex 리뷰 반영)
                logger.warn('[VideoAnalysis] Evolink v1beta 실패, Kie 폴백 시도:', evolinkErr);
                try {
                    data = await requestKieChatFallback('gemini-3.1-pro', requestBody);
                } catch (kieErr) {
                    logger.warn('[VideoAnalysis] Kie 폴백도 실패:', kieErr);
                    throw evolinkErr; // 원본 Evolink 에러 유지
                }
            }
        } else {
            // [FIX] Kie는 v1beta 없음 → gemini-3.1-pro chat/completions 폴백
            data = await requestKieChatFallback('gemini-3.1-pro', requestBody);
        }
        // [FIX] Thinking model may return multiple parts (parts[0]=thinking, parts[1]=content).
        // Use extractTextFromResponse to get the last non-thinking text part.
        const rawText = extractTextFromResponse(data) || '[]';

        let parsed: any[];
        try {
            const cleaned = rawText.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (e) {
            logger.trackSwallowedError('videoAnalysis:parseJson', e);
            console.error("[VideoAnalysis] JSON parse failed:", rawText);
            throw new Error("영상 분석 결과 파싱에 실패했습니다. 다시 시도해주세요.");
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("영상에서 장면을 감지하지 못했습니다. 다른 영상을 시도해주세요.");
        }

        // Map to Scene[] — [FIX #948] 타임코드 클램핑 (AI 할루시네이션 방지)
        const clamp = (v: number) => durationSec && durationSec > 0 ? Math.max(0, Math.min(v, durationSec)) : v;
        const scenes: Scene[] = parsed.map((item, i) => ({
            id: `scene-${Date.now()}-${i}`,
            scriptText: item.scriptText || item.audioScript || `Scene ${i + 1}`,
            visualPrompt: item.visualPrompt || '',
            visualDescriptionKO: item.scriptText || item.audioScript || '',
            characterPresent: item.characterPresent ?? false,
            characterAction: item.characterAction,
            shotSize: item.shotSize,
            cameraAngle: item.cameraAngle,
            cameraMovement: item.cameraMovement,
            startTime: clamp(item.startTime ?? 0),
            endTimeStamp: item.endTimeStamp != null ? clamp(item.endTimeStamp) : undefined,
            audioScript: item.audioScript || '',
            isGeneratingImage: false,
            isGeneratingVideo: false
        }));

        console.log(`[VideoAnalysis] Analyzed ${scenes.length} scenes from video`);
        return scenes;
    } finally {
        // [v2.0 #1066] 분석 성공/실패 무관하게 터널 정리
        if (tunnelCleanup) {
            try { await tunnelCleanup(); } catch (e) { logger.trackSwallowedError('videoAnalysis:tunnelCleanup', e); }
        }
    }
};

// --- 1-B: extractFramesFromVideo ---
// ★ WebCodecs VideoDecoder 우선 → Canvas 폴백
export const extractFramesFromVideo = async (
    file: File,
    timestamps: number[]
): Promise<Map<number, string>> => {
    // ── WebCodecs 정밀 추출 우선 ──
    try {
        const { webcodecExtractFrames, isVideoDecoderSupported } =
            await import('../webcodecs/videoDecoder');

        if (isVideoDecoderSupported() && timestamps.length > 0) {
            const frames = await webcodecExtractFrames(file, timestamps, { thumbWidth: 512, thumbQuality: 0.7 });
            if (frames.length > 0) {
                const result = new Map<number, string>();
                frames.forEach(f => result.set(f.timeSec, f.url));
                console.log(`[VideoAnalysis] ✅ WebCodecs 정밀 추출: ${result.size}/${timestamps.length}개`);
                return result;
            }
        }
    } catch (e) {
        console.warn('[VideoAnalysis] WebCodecs 실패 → canvas 폴백:', e);
    }

    // ── Canvas 폴백 (기존 방식) ──
    return extractFramesFromVideoLegacy(file, timestamps);
};

/** [레거시] Canvas 기반 프레임 추출 — WebCodecs 폴백용 */
const extractFramesFromVideoLegacy = (
    file: File,
    timestamps: number[]
): Promise<Map<number, string>> => {
    const FRAME_TIMEOUT_MS = 5000;
    const TOTAL_TIMEOUT_MS = 90000;

    return new Promise((resolve) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const objectUrl = URL.createObjectURL(file);
        const frames = new Map<number, string>();
        const sortedTimestamps = [...new Set(timestamps)].sort((a, b) => a - b);
        let currentIndex = 0;
        let frameTimer: ReturnType<typeof setTimeout> | undefined;

        const totalTimer = setTimeout(() => {
            console.warn(`[VideoAnalysis] Frame extraction total timeout (${TOTAL_TIMEOUT_MS}ms), returning ${frames.size}/${sortedTimestamps.length} frames`);
            cleanup();
            resolve(frames);
        }, TOTAL_TIMEOUT_MS);

        const cleanup = () => {
            clearTimeout(totalTimer);
            if (frameTimer) clearTimeout(frameTimer);
            URL.revokeObjectURL(objectUrl);
        };

        video.src = objectUrl;
        video.muted = true;
        video.preload = 'auto';

        video.onloadedmetadata = () => {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const maxW = 512;
            const maxH = 512;
            const scale = Math.min(1, maxW / vw, maxH / vh);
            canvas.width = Math.round(vw * scale);
            canvas.height = Math.round(vh * scale);

            if (sortedTimestamps.length === 0) {
                cleanup();
                resolve(frames);
                return;
            }

            const captureNext = () => {
                if (currentIndex >= sortedTimestamps.length) {
                    cleanup();
                    resolve(frames);
                    return;
                }
                const ts = sortedTimestamps[currentIndex];
                video.currentTime = Math.min(ts, video.duration - 0.1);

                frameTimer = setTimeout(() => {
                    console.warn(`[VideoAnalysis] Frame seek timeout at ${ts}s, skipping`);
                    currentIndex++;
                    captureNext();
                }, FRAME_TIMEOUT_MS);
            };

            video.onseeked = () => {
                if (frameTimer) clearTimeout(frameTimer);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                frames.set(sortedTimestamps[currentIndex], dataUrl);
                currentIndex++;
                captureNext();
            };

            captureNext();
        };

        video.onerror = () => {
            console.error("[VideoAnalysis] Failed to load video for frame extraction");
            cleanup();
            resolve(frames);
        };
    });
};

// --- 1-C-1: Prompt builders for REMAKE mode ---

// Preservation mode: keep original style exactly (atmosphere="" or unset)
const buildPreservationEditPrompt = (
    scene: Scene,
    styleAnalysis: RemakeStyleAnalysis,
    userInstructions?: string
): string => {
    const shotHint = scene.shotSize ? `Maintain ${scene.shotSize} framing.` : '';
    const userHint = userInstructions?.trim() && userInstructions !== '영상 분석을 통한 자동 생성'
        ? `Apply these specific changes: ${userInstructions.trim()}`
        : 'Output as-is with minimal cleanup.';

    return [
        `PRESERVATION EDIT:`,
        `The original style is: ${styleAnalysis.overallDescription}.`,
        `Do NOT change the visual style, color palette, rendering technique, lighting, or artistic approach of this image AT ALL.`,
        `PRESERVE EXACTLY: all subjects, positions, composition, camera angle, background, colors, textures.`,
        userHint,
        shotHint,
        `Remove text overlays, subtitles, watermarks, logos.`,
        `FORBIDDEN: Do NOT add new objects/characters. Do NOT remove subjects. Do NOT change colors or art medium. Do NOT apply any artistic filter.`
    ].filter(Boolean).join(' ');
};

// Style transfer mode: change style while preserving composition (atmosphere="3D Animation" etc)
const buildStyleTransferEditPrompt = (
    scene: Scene,
    targetStyle: string,
    userInstructions?: string
): string => {
    const shotHint = scene.shotSize ? `Maintain ${scene.shotSize} framing.` : '';
    const userHint = userInstructions?.trim() && userInstructions !== '영상 분석을 통한 자동 생성'
        ? userInstructions.trim()
        : '';

    return [
        `STYLE TRANSFER EDIT: Change ONLY the visual style to ${targetStyle}.`,
        `PRESERVE EXACTLY: all subjects, positions, composition, camera angle, background layout, spatial arrangement.`,
        `Change ONLY: color grading, rendering technique, artistic style.`,
        shotHint,
        userHint,
        `Remove text overlays, subtitles, watermarks, logos.`,
        `FORBIDDEN: Do NOT add new objects/characters. Do NOT remove content. Do NOT change composition or camera angle.`
    ].filter(Boolean).join(' ');
};

// Legacy edit prompt (used as fallback in non-preservation non-transfer paths)
const buildRemakeEditPrompt = (
    scene: Scene,
    style: string,
    userInstructions?: string
): string => {
    const shotHint = scene.shotSize ? `Maintain ${scene.shotSize} framing.` : '';
    const userHint = userInstructions?.trim() && userInstructions !== '영상 분석을 통한 자동 생성'
        ? userInstructions.trim()
        : '';

    return [
        `Edit this image:`,
        `Apply ${style} visual style to the entire image.`,
        `CRITICAL: Do NOT change the composition, camera angle, subject positions, or spatial layout.`,
        `Only change the visual style, color grading, and artistic rendering.`,
        shotHint,
        userHint,
        `Remove all text, subtitles, watermarks, and logos.`,
        `Output a clean, cinematic quality image.`
    ].filter(Boolean).join(' ');
};

// Descriptive prompt: used when no reference image (text-to-image fallback)
const buildRemakeDescriptivePrompt = (
    scene: Scene,
    style: string,
    userInstructions?: string
): string => {
    const basePrompt = scene.visualPrompt || getSceneNarrationText(scene);
    const parts: string[] = [];

    if (scene.shotSize) parts.push(`(${scene.shotSize}: 1.5)`);

    if (scene.cameraAngle) {
        const angle = scene.cameraAngle.trim();
        parts.push(`(${angle} shot: 1.5)`);
        if (angle === 'Bird\'s Eye' || angle === 'Worm\'s Eye') parts.push('(extreme angle composition: 1.3)');
        else if (angle === 'Low Angle') parts.push('(looking up, dramatic perspective: 1.3)');
        else if (angle === 'High Angle') parts.push('(looking down, overhead perspective: 1.3)');
        else if (angle === 'Dutch Angle') parts.push('(tilted frame, dynamic tension: 1.3)');
    }

    if (scene.cameraMovement && scene.cameraMovement !== 'Static') {
        const move = scene.cameraMovement.trim();
        parts.push(`(${move} motion blur hint: 1.2)`);
        if (move.includes('Tracking') || move.includes('Dolly')) parts.push('(depth of field, motion parallax: 1.2)');
        else if (move.includes('Crane')) parts.push('(sweeping cinematic view: 1.2)');
    }

    if (scene.characterPresent && scene.characterAction) {
        parts.push(`(Character action: ${scene.characterAction}: 1.4)`);
    }

    const userHint = userInstructions && userInstructions.trim() && userInstructions !== '영상 분석을 통한 자동 생성'
        ? `, ${userInstructions.trim()}`
        : '';

    const cinematicContext = parts.length > 0 ? parts.join(', ') + ', ' : '';
    return `${cinematicContext}${basePrompt}${userHint}, ${style} style, cinematic quality, photorealistic, no text overlays, no subtitles, no watermarks`;
};

// --- 1-C-2: Multi-frame helpers ---

// Compute timestamps at 1-second intervals for dense frame extraction
export const computeSceneTimestamps = (
    scenes: Scene[]
): { sceneId: string; timestamps: number[] }[] => {
    return scenes.map(s => {
        const start = s.startTime ?? 0;
        const end = s.endTimeStamp ?? start;
        const timestamps: number[] = [];

        // 1-second interval dense extraction
        for (let t = start; t <= end; t += 1) {
            timestamps.push(Math.round(t * 10) / 10);
        }
        // Ensure end frame is included
        const roundedEnd = Math.round(end * 10) / 10;
        if (!timestamps.includes(roundedEnd)) {
            timestamps.push(roundedEnd);
        }

        return { sceneId: s.id, timestamps };
    });
};

// Compute sharpness score for a data URL image (grayscale Laplacian variance)
const computeSharpnessScore = (dataUrl: string): Promise<number> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 128; // Downsample for speed
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, size, size);
            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            // Convert to grayscale and compute Laplacian variance
            const gray: number[] = [];
            for (let i = 0; i < data.length; i += 4) {
                gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            }
            let sum = 0;
            let count = 0;
            for (let y = 1; y < size - 1; y++) {
                for (let x = 1; x < size - 1; x++) {
                    const idx = y * size + x;
                    const lap = -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - size] + gray[idx + size];
                    sum += lap * lap;
                    count++;
                }
            }
            resolve(count > 0 ? sum / count : 0);
        };
        img.onerror = () => resolve(0);
        img.src = dataUrl;
    });
};

// Select best frames with sharpness-based mid frame selection
export const selectBestFrames = async (
    frames: Map<number, string>,
    scene: Scene
): Promise<{ sourceFrameUrl?: string; startFrameUrl?: string; endFrameUrl?: string }> => {
    const start = scene.startTime ?? 0;
    const end = scene.endTimeStamp ?? start;
    const roundedStart = Math.round(start * 10) / 10;
    const roundedEnd = Math.round(end * 10) / 10;
    const nearEnd = Math.round(Math.max(start, end - 1) * 10) / 10;

    // startFrameUrl = scene start
    const startFrameUrl = frames.get(roundedStart) || undefined;
    // endFrameUrl = near-end or end
    const endFrameUrl = frames.get(nearEnd) || frames.get(roundedEnd) || undefined;

    // sourceFrameUrl = sharpest frame from mid region (25%-75% of scene)
    const midStart = start + (end - start) * 0.25;
    const midEnd = start + (end - start) * 0.75;
    const midCandidates: { ts: number; url: string }[] = [];
    for (const [ts, url] of frames.entries()) {
        if (ts >= midStart && ts <= midEnd) {
            midCandidates.push({ ts, url });
        }
    }

    let sourceFrameUrl: string | undefined;
    if (midCandidates.length === 0) {
        // Fallback: use any available frame
        sourceFrameUrl = frames.get(Math.round(((start + end) / 2) * 10) / 10) || startFrameUrl;
    } else if (midCandidates.length === 1) {
        sourceFrameUrl = midCandidates[0].url;
    } else {
        // Score top 5 candidates for sharpness
        const toScore = midCandidates.slice(0, 5);
        const scores = await Promise.all(
            toScore.map(async c => ({ url: c.url, score: await computeSharpnessScore(c.url) }))
        );
        scores.sort((a, b) => b.score - a.score);
        sourceFrameUrl = scores[0].url;
    }

    return { sourceFrameUrl, startFrameUrl, endFrameUrl };
};

// Legacy wrapper for backward compatibility
export const selectBestFrame = (
    frames: Map<number, string>,
    scene: Scene
): { sourceFrameUrl?: string; endFrameUrl?: string } => {
    const start = scene.startTime ?? 0;
    const end = scene.endTimeStamp ?? start;
    const mid = Math.round(((start + end) / 2) * 10) / 10;
    const nearEnd = Math.round(Math.max(start, end - 1) * 10) / 10;

    const sourceFrameUrl = frames.get(mid) || frames.get(Math.round(start * 10) / 10) || undefined;
    const endFrameUrl = (nearEnd > start) ? (frames.get(nearEnd) || undefined) : undefined;

    return { sourceFrameUrl, endFrameUrl };
};

// --- analyzeFrameStyle: Extract visual style from first frame ---
export const analyzeFrameStyle = async (
    frameDataUrl: string
): Promise<RemakeStyleAnalysis> => {
    const fallback: RemakeStyleAnalysis = {
        colorPalette: '',
        renderingTechnique: '',
        lightingDescription: '',
        textureDescription: '',
        artMedium: '',
        overallDescription: 'Faithful reproduction of original visual style'
    };

    try {
        // Parse base64 from data URL
        let mimeType = 'image/jpeg';
        let base64Data = frameDataUrl;
        if (frameDataUrl.startsWith('data:')) {
            const arr = frameDataUrl.split(',');
            mimeType = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            base64Data = arr[1];
        } else if (frameDataUrl.startsWith('http')) {
            // URL — use fileData for Google Native (Evolink) format.
            // [FIX] fileData는 convertGoogleToOpenAI에서 image_url 포맷으로 변환됨 (Kie 호환)
            const payload = {
                contents: [{
                    role: 'user' as const,
                    parts: [
                        { fileData: { fileUri: frameDataUrl, mimeType: 'image/jpeg' } },
                        { text: `Analyze the visual style of this image. Return JSON with: colorPalette (dominant colors), renderingTechnique (e.g. cel-shading, photorealistic, watercolor), lightingDescription, textureDescription, artMedium (e.g. digital painting, 3D render, photography), overallDescription (one sentence summarizing the complete visual style).` }
                    ]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.2,
                    maxOutputTokens: 400,
                    _reasoningEffort: "low"
                },
                safetySettings: SAFETY_SETTINGS_BLOCK_NONE
            };
            const response = await requestGeminiProxy("gemini-3.1-pro-preview", payload);
            const rawText = extractTextFromResponse(response);
            const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
            const result: RemakeStyleAnalysis = {
                colorPalette: parsed.colorPalette || '',
                renderingTechnique: parsed.renderingTechnique || '',
                lightingDescription: parsed.lightingDescription || '',
                textureDescription: parsed.textureDescription || '',
                artMedium: parsed.artMedium || '',
                overallDescription: parsed.overallDescription || `${parsed.artMedium || 'Original'} style with ${parsed.colorPalette || 'natural'} palette`
            };
            console.log("[analyzeFrameStyle] Result:", result.overallDescription);
            return result;
        }

        const payload = {
            contents: [{
                role: 'user' as const,
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data.replace(/[\n\r\s]+/g, '')
                        }
                    },
                    { text: `Analyze the visual style of this image. Return JSON with: colorPalette (dominant colors), renderingTechnique (e.g. cel-shading, photorealistic, watercolor), lightingDescription, textureDescription, artMedium (e.g. digital painting, 3D render, photography), overallDescription (one sentence summarizing the complete visual style).` }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
                maxOutputTokens: 400,
                _reasoningEffort: "low"
            },
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE
        };

        const response = await requestGeminiProxy("gemini-3.1-pro-preview", payload);
        const rawText = extractTextFromResponse(response);
        const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

        const result: RemakeStyleAnalysis = {
            colorPalette: parsed.colorPalette || '',
            renderingTechnique: parsed.renderingTechnique || '',
            lightingDescription: parsed.lightingDescription || '',
            textureDescription: parsed.textureDescription || '',
            artMedium: parsed.artMedium || '',
            overallDescription: parsed.overallDescription || `${parsed.artMedium || 'Original'} style with ${parsed.colorPalette || 'natural'} palette`
        };

        console.log("[analyzeFrameStyle] Result:", result.overallDescription);
        return result;
    } catch (e) {
        console.warn("[analyzeFrameStyle] Failed, using fallback:", e);
        return fallback;
    }
};

// --- 1-C-3: YouTube visual enrichment ---

export const enrichYouTubeSceneDescriptions = async (
    scenes: Scene[],
    youtubeUrl: string,
    atmosphere: string
): Promise<Scene[]> => {
    try {
        const evolinkKey = getEvolinkKey();
        const apiKey = evolinkKey || getKieKey();
        if (!apiKey) return scenes;

        const sceneDescriptions = scenes.map((s, i) =>
            `[${i}] shotSize=${s.shotSize || 'unknown'}, cameraAngle=${s.cameraAngle || 'unknown'}, visualPrompt="${s.visualPrompt?.substring(0, 120) || ''}"`
        ).join('\n');

        const prompt = `You previously analyzed this video and produced the scene breakdown below.
Now re-watch the video and for EACH scene, provide additional visual details that are missing.

## Scenes from prior analysis
${sceneDescriptions}

## What to add for EACH scene
For each numbered scene [0], [1], ... provide a comma-separated list of:
- Color palette (dominant colors, e.g. "warm amber and deep teal")
- Lighting type and direction (e.g. "soft diffused backlight from upper-left")
- Depth of field (e.g. "shallow DoF with blurred background" or "deep focus")
- Spatial arrangement (e.g. "subject centered, negative space on right")
- Texture/material (e.g. "rough concrete walls, glossy metal surfaces")

## Output Format
Return ONLY numbered enrichments, one per line:
[0] warm amber tones, soft golden-hour sidelight, shallow DoF, subject left-third, weathered wood texture
[1] cool blue-gray palette, harsh overhead fluorescent, deep focus, symmetrical framing, polished tile floor
...`;

        // [FIX] Evolink v1beta 우선, Kie chat/completions 폴백 (Kie는 v1beta 미지원)
        const requestBody = {
            contents: [{
                role: 'user' as const,
                parts: [
                    { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } },
                    { text: prompt }
                ]
            }],
            generationConfig: {
                responseMimeType: 'text/plain',
                temperature: 0.3,
                maxOutputTokens: 3000,
                _reasoningEffort: "low"
            },
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE
        };

        let data: any;
        if (evolinkKey) {
            const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`;
            const response = await fetchWithRateLimitRetry(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${evolinkKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                console.warn("[YouTube Enrichment] API error:", response.status);
                return scenes;
            }
            data = await response.json();
        } else {
            // [FIX] Kie는 v1beta 없음 → gemini-3.1-pro chat/completions 폴백
            data = await requestKieChatFallback('gemini-3.1-pro', requestBody);
        }
        // [FIX] Thinking model may return multiple parts (parts[0]=thinking, parts[1]=content).
        // Use extractTextFromResponse to get the last non-thinking text part.
        const rawText = extractTextFromResponse(data) || '';

        const enriched = [...scenes];
        const lines = rawText.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
            const match = line.match(/^\[(\d+)\]\s*(.+)/);
            if (match) {
                const idx = parseInt(match[1]);
                if (idx < enriched.length && match[2].trim()) {
                    enriched[idx] = {
                        ...enriched[idx],
                        visualPrompt: `${enriched[idx].visualPrompt || ''}, ${match[2].trim()}`
                    };
                }
            }
        }

        console.log(`[YouTube Enrichment] Enriched ${lines.filter((l: string) => l.match(/^\[\d+\]/)).length}/${scenes.length} scenes`);
        return enriched;
    } catch (e) {
        console.warn("[YouTube Enrichment] Failed (non-blocking):", e);
        return scenes;
    }
};

// --- 1-C-3b: YouTube reference frame generation ---
// YouTube URL에서는 클라이언트 프레임 추출 불가 → Gemini 이미지 모델로 참조 프레임 생성

const YOUTUBE_FRAME_BATCH_SIZE = 3;

export const generateYouTubeReferenceFrames = async (
    scenes: Scene[],
    youtubeUrl: string,
    aspectRatio: AspectRatio,
    onProgress?: (msg: string) => void
): Promise<Scene[]> => {
    const evolinkKey = getEvolinkKey();
    const apiKey = evolinkKey || getKieKey();
    if (!apiKey || scenes.length === 0) return scenes;

    const enriched = [...scenes];

    for (let batchStart = 0; batchStart < scenes.length; batchStart += YOUTUBE_FRAME_BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + YOUTUBE_FRAME_BATCH_SIZE, scenes.length);
        onProgress?.(`📸 참조 프레임 생성 중 (${batchStart + 1}~${batchEnd}/${scenes.length})...`);

        const batchPromises = scenes.slice(batchStart, batchEnd).map(async (scene, localIdx) => {
            const idx = batchStart + localIdx;
            const mid = Math.round(((scene.startTime ?? 0) + (scene.endTimeStamp ?? scene.startTime ?? 0)) / 2);

            // Attempt 1: Gemini image model + YouTube video → faithful frame reproduction
            try {
                const framePrompt = `Look at timestamp ${mid} seconds of this video. Generate a photorealistic image that faithfully reproduces the exact frame at that moment. Preserve the same subjects, positions, composition, lighting, and colors. No artistic style changes — just an accurate photographic reproduction of that video frame.`;

                // [FIX] Evolink v1beta만 사용 (Kie는 v1beta/responseModalities 미지원)
                if (!evolinkKey) throw new Error("Evolink 키 없음 — 텍스트 폴백 사용");

                const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`;
                const requestBody = {
                    contents: [{
                        role: 'user' as const,
                        parts: [
                            { fileData: { mimeType: "video/mp4", fileUri: youtubeUrl } },
                            { text: framePrompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["IMAGE"],
                        imageConfig: { aspectRatio, imageSize: "2K" }
                    },
                    safetySettings: SAFETY_SETTINGS_BLOCK_NONE
                };

                const response = await fetchWithRateLimitRetry(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${evolinkKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
                if (!imgPart?.inlineData?.data) throw new Error("No image data in response");

                const mime = imgPart.inlineData.mimeType || 'image/png';
                console.log(`[YouTube Frames] Scene ${idx}: Video-to-image OK (t=${mid}s)`);
                return { idx, frameUrl: `data:${mime};base64,${imgPart.inlineData.data}` };
            } catch (e: any) {
                console.warn(`[YouTube Frames] Scene ${idx} video-to-image failed:`, e?.message);
            }

            // Attempt 2: Text-to-image fallback using enriched visualPrompt
            try {
                const fallbackPrompt = `Photorealistic photograph, faithful to this exact description: ${scene.visualPrompt}. Natural documentary photography, exact composition as described, accurate colors and lighting. No artistic filters, no text overlays, no watermarks.`;
                const imgUrl = await generateKieImage(fallbackPrompt, aspectRatio, undefined, undefined, "nano-banana-2");
                console.log(`[YouTube Frames] Scene ${idx}: Text-to-image fallback OK`);
                return { idx, frameUrl: imgUrl };
            } catch (e2: any) {
                console.warn(`[YouTube Frames] Scene ${idx} text-to-image fallback failed:`, e2?.message);
            }

            return { idx, frameUrl: undefined };
        });

        const results = await Promise.allSettled(batchPromises);
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.frameUrl) {
                const { idx, frameUrl } = result.value;
                enriched[idx] = { ...enriched[idx], sourceFrameUrl: frameUrl };
            }
        }

        // Rate limit buffer between batches
        if (batchEnd < scenes.length) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    const successCount = enriched.filter(s => s.sourceFrameUrl).length;
    console.log(`[YouTube Frames] Generated ${successCount}/${scenes.length} reference frames`);
    return enriched;
};

// --- 1-C-4: generateRemakeImage ---
// Style transfer image generation for REMAKE mode
// Evolink → Kie 폴백 체인
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export const generateRemakeImage = async (
    scene: Scene,
    style: string,
    aspectRatio: AspectRatio,
    imageModel: ImageModel,
    userInstructions?: string,
    styleAnalysis?: RemakeStyleAnalysis,
    styleAnchorUrl?: string
): Promise<{ url: string; editedStartFrameUrl?: string; editedEndFrameUrl?: string; isFallback: boolean }> => {
    const refImage = scene.sourceFrameUrl || undefined;

    // Phase 4: Prompt selection — preservation vs style transfer
    const editPrompt = styleAnalysis
        ? buildPreservationEditPrompt(scene, styleAnalysis, userInstructions)
        : buildStyleTransferEditPrompt(scene, style, userInstructions);
    const descriptivePrompt = buildRemakeDescriptivePrompt(scene, style, userInstructions);

    console.log("[Remake] START", { sceneId: scene.id, imageModel, hasRef: !!refImage, hasStyleAnalysis: !!styleAnalysis, hasAnchor: !!styleAnchorUrl, aspectRatio, editPromptLen: editPrompt.length, cameraAngle: scene.cameraAngle, cameraMovement: scene.cameraMovement });

    // Route 1: Flash model → Evolink 폴백
    if (imageModel === ImageModel.FLASH) {
        try {
            console.log("[Remake] Route1: Kie Flash");
            const url = await generateKieImage(editPrompt, aspectRatio, refImage, undefined, ImageModel.FLASH, refImage ? 0.35 : undefined);
            return { url, isFallback: false };
        } catch (e: any) {
            console.warn("[Remake] Kie Flash failed:", e?.message);
            const url = await generateEvolinkImageWrapped(descriptivePrompt, aspectRatio, undefined, undefined, "2K");
            return { url, isFallback: true };
        }
    }

    // Route 2: Edit-first chain (refImage 존재 시) — Evolink → Kie 폴백
    const errors: string[] = [];
    let mainUrl: string | undefined;

    if (refImage) {
        // Step A: Kie nano-banana-2 with reference image
        try {
            console.log("[Remake] StepA: Kie nano-banana-2 (ref image)");
            mainUrl = await generateKieImage(editPrompt, aspectRatio, refImage, undefined, "nano-banana-2", 0.35);
        } catch (e: any) {
            errors.push(`A:${e?.message?.substring(0, 80)}`);
            console.warn("[Remake] StepA failed:", e?.message);
        }

        // Step B: Evolink image with reference (retry after delay)
        if (!mainUrl) {
            try {
                console.log("[Remake] StepB: Evolink retry (2s delay)");
                await delay(2000);
                mainUrl = await generateEvolinkImageWrapped(editPrompt, aspectRatio, refImage ? [refImage] : undefined, undefined, "2K");
            } catch (e: any) {
                errors.push(`B:${e?.message?.substring(0, 80)}`);
                console.warn("[Remake] StepB failed:", e?.message);
            }
        }
    }

    // Step C: Evolink text-only 폴백
    if (!mainUrl) {
        try {
            console.log("[Remake] StepC: Evolink text-only");
            mainUrl = await generateEvolinkImageWrapped(descriptivePrompt, aspectRatio, undefined, undefined, "2K");
        } catch (e: any) {
            errors.push(`C:${e?.message?.substring(0, 80)}`);
            console.warn("[Remake] StepC failed:", e?.message);
        }
    }

    // Step D: Kie 최후 수단
    if (!mainUrl) {
        try {
            console.log("[Remake] StepD: Kie fallback (last resort)");
            mainUrl = await generateKieImage(descriptivePrompt, aspectRatio, refImage, undefined, undefined, refImage ? 0.35 : undefined);
        } catch (e: any) {
            errors.push(`D:${e?.message?.substring(0, 80)}`);
            console.error("[Remake] ALL STEPS FAILED:", errors);
            throw new Error(`모든 이미지 생성 실패: ${errors[errors.length - 1]}`);
        }
    }

    const isFallback = errors.length >= 2;

    // Phase 6-D: Edit start/end frames in parallel (for FIRST_AND_LAST_FRAMES_2_VIDEO)
    let editedStartFrameUrl: string | undefined;
    let editedEndFrameUrl: string | undefined;

    if (scene.startFrameUrl && scene.endFrameUrl) {
        try {
            console.log("[Remake] Editing start+end frames in parallel...");
            const [editedStart, editedEnd] = await Promise.all([
                generateKieImage(editPrompt, aspectRatio, scene.startFrameUrl, undefined, "nano-banana-2", 0.35).catch(() => null),
                generateKieImage(editPrompt, aspectRatio, scene.endFrameUrl, undefined, "nano-banana-2", 0.35).catch(() => null)
            ]);
            editedStartFrameUrl = editedStart || mainUrl;
            editedEndFrameUrl = editedEnd || mainUrl;
        } catch (e) {
            logger.trackSwallowedError('videoAnalysis:editFrames', e);
            // Graceful: use main frame for both (degrades to IMAGE_2_VIDEO behavior)
            editedStartFrameUrl = mainUrl;
            editedEndFrameUrl = mainUrl;
        }
    }

    return { url: mainUrl!, editedStartFrameUrl, editedEndFrameUrl, isFallback };
};

// --- 1-D: batchTranslateToKorean ---
// Translates scene scripts to Korean using Gemini (for non-Korean content)
export const batchTranslateToKorean = async (
    scenes: Scene[]
): Promise<Map<string, string>> => {
    const translations = new Map<string, string>();
    const texts = scenes.map((s, i) => `[${i}] ${getSceneNarrationText(s)}`).join('\n');

    if (!texts.trim()) return translations;

    const payload = {
        contents: [{
            role: 'user' as const,
            parts: [{ text: `You are a professional Korean localizer. Translate each numbered line to natural, broadcast-quality Korean.

RULES:
- Maintain the numbering format [0], [1], [2]...
- Translate to natural spoken Korean suitable for narration/voiceover
- Keep proper nouns in their original form with Korean pronunciation in parentheses if helpful
- Do NOT add explanations, just translations
- Return ONLY the numbered translations

INPUT:
${texts}` }]
        }],
        generationConfig: {
            responseMimeType: 'text/plain',
            temperature: 0.3,
            maxOutputTokens: 4000,
            _reasoningEffort: "low"
        },
        safetySettings: SAFETY_SETTINGS_BLOCK_NONE
    };

    try {
        const response = await requestGeminiProxy("gemini-3.1-pro-preview", payload);
        const rawText = extractTextFromResponse(response);

        // Parse numbered translations: [0] text, [1] text, etc.
        const lines = rawText.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
            const match = line.match(/^\[(\d+)\]\s*(.+)/);
            if (match) {
                const idx = parseInt(match[1]);
                if (idx < scenes.length) {
                    translations.set(scenes[idx].id, match[2].trim());
                }
            }
        }

        console.log(`[Translation] Translated ${translations.size}/${scenes.length} scenes to Korean`);
    } catch (e) {
        console.error("[Translation] Batch translation failed:", e);
    }

    return translations;
};

// --- 1-E: transcribeVideoAudio (화자 분리 전사) ---
// 영상 파일에서 오디오를 추출하고 ElevenLabs Scribe로 화자 분리 전사
// Web Audio API decodeAudioData로 즉시 디코딩 (실시간 재생 불필요)

/**
 * [v4.6] 영상 파일에서 오디오 추출 → 화자 분리 전사
 * 결과를 Gemini 프롬프트에 삽입할 포맷 텍스트로 반환
 */
export const transcribeVideoAudio = async (
    videoFile: File | Blob,
    options?: {
        signal?: AbortSignal;
        onProgress?: (msg: string) => void;
        failOnError?: boolean;
    }
): Promise<{ transcript: WhisperTranscriptResult; formattedText: string } | null> => {
    const { signal, onProgress, failOnError = false } = options || {};

    try {
        onProgress?.('🔊 영상에서 오디오 추출 중...');
        logger.info('[Diarization] 영상 오디오 추출 시작', { size: videoFile.size });

        // [FIX #386] abort 체크 — 오디오 추출 전 이미 취소된 경우 빠른 종료
        if (signal?.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
        // [FIX #454] signal을 extractAudioFromVideoFast에 전달 — 타임아웃 시 즉시 중단
        const audioBlob = await extractAudioFromVideoFast(videoFile, signal);
        // [FIX #386] 오디오 추출 후 abort 체크
        if (signal?.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
        if (!audioBlob || audioBlob.size < 5000) {
            logger.info('[Diarization] 오디오 없거나 너무 짧음 — 화자 분리 생략');
            return null;
        }

        logger.info('[Diarization] 오디오 추출 완료', { audioSize: audioBlob.size });

        onProgress?.('🗣️ 화자 분리 전사 중...');
        const transcript = await transcribeWithDiarization(audioBlob, { signal, onProgress });

        if (!transcript.utterances || transcript.utterances.length === 0) {
            logger.info('[Diarization] 화자 분리 결과 없음 — 대사 없는 영상으로 판단');
            return null;
        }

        const formattedText = formatDiarizedTranscript(transcript);
        logger.success('[Diarization] 화자 분리 전사 완료', {
            speakerCount: transcript.speakerCount,
            utterances: transcript.utterances.length,
            duration: transcript.duration,
        });

        return { transcript, formattedText };
    } catch (e) {
        // [FIX #386] abort 시에는 null 반환 대신 에러 전파 — 호출자가 타임아웃을 감지하도록
        if (signal?.aborted) throw e;
        logger.warn('[Diarization] 화자 분리 전사 실패 (Gemini 단독 분석으로 폴백)', {
            error: (e as Error).message,
        });
        if (failOnError) {
            throw e instanceof Error ? e : new Error(String(e));
        }
        return null;
    }
};

/**
 * [v4.6] Web Audio API로 영상에서 오디오 트랙 추출 (즉시 디코딩)
 * shoppingScriptService의 captureStream 방식과 달리 실시간 재생 불필요
 * [FIX #454] signal 전달 + 오디오 5분 캡 + 전체 90초 타임아웃 추가
 */
async function extractAudioFromVideoFast(videoFile: File | Blob, signal?: AbortSignal): Promise<Blob | null> {
    // [FIX #454] 전체 오디오 추출 과정에 90초 하드 타임아웃 — 어떤 경로든 90초 내 반환 보장
    const AUDIO_EXTRACT_HARD_TIMEOUT_MS = 90_000;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            extractAudioFromVideoFastInner(videoFile, signal),
            new Promise<null>((resolve) => {
                hardTimer = setTimeout(() => {
                    logger.warn('[Diarization] 오디오 추출 90초 하드 타임아웃 — null 반환');
                    resolve(null);
                }, AUDIO_EXTRACT_HARD_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (hardTimer) clearTimeout(hardTimer);
    }
}

async function extractAudioFromVideoFastInner(videoFile: File | Blob, signal?: AbortSignal): Promise<Blob | null> {
    try {
        if (signal?.aborted) return null;
        const arrayBuffer = await videoFile.arrayBuffer();
        if (signal?.aborted) return null;
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();

        let audioBuffer: AudioBuffer;
        try {
            // [FIX #378] decodeAudioData 30초 타임아웃 — 대형 파일/저사양에서 무한 대기 방지
            const DECODE_TIMEOUT_MS = 30_000;
            audioBuffer = await Promise.race([
                audioCtx.decodeAudioData(arrayBuffer),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('decodeAudioData 30s timeout')), DECODE_TIMEOUT_MS)),
            ]);
        } catch {
            // 일부 비디오 코덱은 decodeAudioData 실패/타임아웃 → captureStream 폴백
            audioCtx.close();
            if (signal?.aborted) return null;
            logger.info('[Diarization] decodeAudioData 실패 → captureStream 폴백');
            return extractAudioWithCaptureStream(videoFile, signal);
        }

        if (signal?.aborted) { audioCtx.close(); return null; }

        // [FIX #454] 화자 분리에는 오디오 전체가 필요 없음 — 최대 5분(300초)으로 캡
        // 긴 영상의 WAV가 수백MB가 되어 Cloudinary 업로드 시 무한 대기하는 문제 방지
        const MAX_AUDIO_DURATION_SEC = 300;
        if (audioBuffer.duration > MAX_AUDIO_DURATION_SEC) {
            const originalDuration = Math.round(audioBuffer.duration);
            const cappedLength = Math.floor(MAX_AUDIO_DURATION_SEC * audioBuffer.sampleRate);
            const offlineCtx = new OfflineAudioContext(
                Math.min(audioBuffer.numberOfChannels, 2),
                cappedLength,
                audioBuffer.sampleRate
            );
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start(0, 0, MAX_AUDIO_DURATION_SEC);
            try {
                audioBuffer = await offlineCtx.startRendering();
                logger.info(`[Diarization] 오디오 ${MAX_AUDIO_DURATION_SEC}초로 캡 (원본: ${originalDuration}초)`);
            } catch {
                logger.warn('[Diarization] OfflineAudioContext 렌더링 실패 — 원본 AudioBuffer 사용');
            }
        }

        // AudioBuffer → WAV Blob 변환
        const wavBlob = audioBufferToWav(audioBuffer);
        audioCtx.close();
        return wavBlob;
    } catch (e) {
        logger.trackSwallowedError('videoAnalysis:extractAudioFast', e);
        return null;
    }
}

/** captureStream 폴백 — decodeAudioData 실패 시 (실시간 재생 필요, 최대 60초)
 * [FIX #454] signal 지원 + 최대 60초로 단축 (화자 분리에 120초 불필요)
 */
function extractAudioWithCaptureStream(videoFile: File | Blob, signal?: AbortSignal): Promise<Blob | null> {
    if (signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
        let resolved = false;
        const done = (result: Blob | null) => { if (!resolved) { resolved = true; resolve(result); } };

        const video = document.createElement('video');
        const srcUrl = URL.createObjectURL(videoFile);
        video.src = srcUrl;
        video.muted = false;
        video.volume = 1;

        const cleanup = () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(srcUrl);
        };

        // [FIX #454] abort signal 리스너 — 분석 취소/타임아웃 시 즉시 종료
        const abortHandler = () => {
            cleanup();
            done(null);
        };
        signal?.addEventListener('abort', abortHandler, { once: true });

        // [FIX #378] 메타데이터 로딩 10초 타임아웃 — onloadedmetadata 미발생 시 무한 대기 방지
        const metaTimeout = setTimeout(() => {
            signal?.removeEventListener('abort', abortHandler);
            cleanup();
            done(null);
        }, 10_000);

        video.onloadedmetadata = async () => {
            clearTimeout(metaTimeout);
            if (signal?.aborted) { cleanup(); signal?.removeEventListener('abort', abortHandler); done(null); return; }
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const stream: MediaStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream();
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length === 0) {
                    signal?.removeEventListener('abort', abortHandler);
                    cleanup();
                    done(null);
                    return;
                }

                const audioStream = new MediaStream(audioTracks);
                const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
                const chunks: Blob[] = [];

                recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = () => {
                    signal?.removeEventListener('abort', abortHandler);
                    cleanup();
                    done(chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null);
                };

                recorder.start();
                video.play().catch(() => {});

                // [FIX #454] 최대 60초로 단축 (120초 → 60초) — 화자 분리에 충분
                const maxDuration = Math.min(video.duration, 60) * 1000;
                setTimeout(() => {
                    if (recorder.state === 'recording') recorder.stop();
                    video.pause();
                }, maxDuration + 500);

                video.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
            } catch {
                signal?.removeEventListener('abort', abortHandler);
                cleanup();
                done(null);
            }
        };

        video.onerror = () => {
            clearTimeout(metaTimeout);
            signal?.removeEventListener('abort', abortHandler);
            cleanup();
            done(null);
        };
    });
}

/** AudioBuffer → WAV Blob 변환 (16-bit PCM) */
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = Math.min(buffer.numberOfChannels, 2); // 최대 스테레오
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const numSamples = buffer.length;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM data (interleaved)
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    let offset = headerSize;
    for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
