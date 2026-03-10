
import { AspectRatio, VideoModel, ImageModel, VideoTaskParams, VideoProvider } from "../types";
import { uploadMediaToHosting, uploadRemoteUrlToCloudinary } from "./uploadService";
import { getKieKey, getApimartKey, getWaveSpeedKey, getXaiKey, monitoredFetch } from "./apiService";
import { getEvolinkKey, evolinkGenerateImage as evolinkGenImg, createEvolinkVideoTask, pollEvolinkTask } from "./evolinkService";
import { SAFETY_SETTINGS_BLOCK_NONE } from "./gemini/geminiProxy";
import { logger } from "./LoggerService";

// === CONFIGURATION ===
const KIE_BASE_URL = 'https://api.kie.ai/api/v1/jobs'; 
const KIE_VEO_BASE_URL = 'https://api.kie.ai/api/v1/veo';
const APIMART_BASE_URL = 'https://api.apimart.ai/v1/videos/generations';
const APIMART_TASK_URL = 'https://api.apimart.ai/v1/tasks';
const WAVESPEED_BASE_URL = 'https://api.wavespeed.ai/api/v3';
const WAVESPEED_PREDICTIONS_URL = 'https://api.wavespeed.ai/api/v3/predictions';
const XAI_BASE_URL = 'https://api.x.ai/v1';

// === AUDIO GUARD CONSTANTS ===
// [FIX] 나레이션 자동 활성화 방지를 위한 강화된 태그
const AUDIO_SAFETY_TAGS = "[CRITICAL: Sound Effects Only] [ABSOLUTELY No Background Music] [ABSOLUTELY No Speech] [ABSOLUTELY No Narration] [No Voice] [No Dialogue] [Mute all human voice] [Silent film with SFX only]";

// === STYLE LOCK CONSTANTS ===
// [FIX] BUG-12: 이미지의 그림체가 영상에서 변경되지 않도록 강제 프롬프트
const STYLE_LOCK_TAGS = "[CRITICAL: Preserve exact art style of input image] [Maintain same color palette] [Keep same rendering technique] [No style change] [Consistent visual identity]";

// === HELPER FUNCTIONS ===

/** [FIX M10] Combine two AbortSignals into one: aborts when either signal fires. */
function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (a.aborted || b.aborted) { controller.abort(); return controller.signal; }
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
    return controller.signal;
}

function base64ToFile(base64: string, filename: string): File {
    try {
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        let bstrString = arr[1].replace(/[\n\r\s]+/g, '');
        while (bstrString.length % 4 > 0) {
            bstrString += '=';
        }
        const bstr = atob(bstrString);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
    } catch (e: any) {
        logger.error("Base64 File Conversion Failed", e);
        return new File([], filename, { type: 'image/png' });
    }
}

export function sanitizePrompt(prompt: string): string {
    if (!prompt) return "";
    return prompt
        .replace(/\[(?!Camera|Movement).*?\]/gi, "") 
        .replace(/\{.*?\}/g, "")
        .replace(/\b(cinematic|epic|drama|movie|film|soundtrack|music|score|orchestra|band|concert|singing|dancing|performer|instrument|piano|guitar|violin|aesthetic|vhs|lo-fi|vintage|mv|music video)\b/gi, "")
        .replace(/\b(8k|4k|best quality|masterpiece|detailed|photorealistic|realistic|hyperrealistic|studio lighting|volumetric|octane render|unreal engine|artstation)\b/gi, "")
        .replace(/\b(INSTRUCTION|TASK|TYPOGRAPHY|NEGATIVE|LAYOUT|RULE|POSITION|SIZE|GOAL)\b:?/gi, "") 
        .replace(/\s+/g, " ")
        .trim();
}

// === CONNECTION VALIDATORS ===

export async function validateKieConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    if (!apiKey) return { success: false, message: "API Key가 입력되지 않았습니다." };
    try {
        const response = await monitoredFetch(`${KIE_BASE_URL}/recordInfo?taskId=ping_test`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (response.status === 401 || response.status === 403) return { success: false, message: "인증 실패: 유효하지 않은 Key입니다." };
        const data = await response.json();
        if (data.code === 401) return { success: false, message: "인증 실패 (Code 401)" };
        return { success: true, message: "연결 성공!" };
    } catch (e: any) {
        return { success: false, message: `연결 오류: ${e.message}` };
    }
}

export async function validateApimartConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    if (!apiKey) return { success: false, message: "API Key가 입력되지 않았습니다." };
    try {
        const response = await monitoredFetch(APIMART_BASE_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "veo3.1-fast", prompt: "ping", image_urls: [] })
        });
        if (response.status === 401 || response.status === 403) return { success: false, message: "인증 실패: Key를 확인하세요." };
        if (response.status === 400 || response.ok) return { success: true, message: "연결 성공!" };
        return { success: false, message: `서버 응답: ${response.status}` };
    } catch (e: any) {
        return { success: false, message: `연결 오류: ${e.message}` };
    }
}

export async function validateXaiConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    if (!apiKey) return { success: false, message: "API Key가 입력되지 않았습니다." };
    try {
        const response = await monitoredFetch(`${XAI_BASE_URL}/videos/generations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "grok-imagine-video", prompt: "test", duration: 1 })
        });
        if (response.status === 401 || response.status === 403)
            return { success: false, message: "인증 실패: Key를 확인하세요." };
        if (response.ok) return { success: true, message: "연결 성공! ($0.05 테스트 비용 발생)" };
        return { success: false, message: `서버 응답 오류 (${response.status})` };
    } catch (e: unknown) {
        const err = e as Error;
        return { success: false, message: `연결 오류: ${err.message}` };
    }
}

// === API METHODS ===

// Process image source into API-compatible part format (extracted for reuse)
export function processImagePart(imgSource: string): Record<string, unknown> | null {
    try {
        if (imgSource.startsWith("http")) {
            return { fileData: { fileUri: imgSource, mimeType: "image/jpeg" } };
        } else if (imgSource.includes("data:")) {
            const arr = imgSource.split(',');
            const mimeType = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
            const base64Data = arr[1].replace(/[\n\r\s]+/g, '');
            return { inline_data: { mime_type: mimeType, data: base64Data } };
        }
        return null;
    } catch (e) {
        console.error("Image processing failed:", e);
        return null;
    }
}


// [OFFICIAL DOC] Kie Nanobanana 2 이미지 생성
// 기술문서: https://docs.kie.ai/market/google/nanobanana2
// 모델: nano-banana-2 (text-to-image + image-to-image 통합)
// 엔드포인트: POST /api/v1/jobs/createTask
// 폴링: GET /api/v1/jobs/recordInfo?taskId={taskId}
// 참조이미지: input.image_input (최대 14장, 30MB)
// 비율: input.aspect_ratio (auto, 1:1, 9:16, 16:9, 4:3 등)
// 해상도: input.resolution (1K, 2K, 4K)
export async function generateKieImage(
    prompt: string,
    aspectRatio: AspectRatio,
    referenceImages?: string | string[],
    secondaryImage?: string,
    model: string = "nano-banana-2",
    imageStrength?: number,
    enableWebSearch?: boolean
): Promise<string> {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error("Kie API Key가 설정되지 않았습니다.");

    const inputImages: string[] = [];
    const ensureUrl = async (img: string, debugName: string): Promise<string> => {
        if (img.startsWith("http")) return img;
        if (img.startsWith("data:")) {
            const file = base64ToFile(img, `${debugName}.png`);
            return await uploadMediaToHosting(file);
        }
        return img;
    };

    // Multi-reference image support (string | string[])
    const refImagesArray = !referenceImages
        ? []
        : typeof referenceImages === 'string'
            ? [referenceImages]
            : referenceImages;
    for (let i = 0; i < refImagesArray.length; i++) {
        inputImages.push(await ensureUrl(refImagesArray[i], `ref_image_${i + 1}`));
    }
    if (secondaryImage) inputImages.push(await ensureUrl(secondaryImage, "ref_image_secondary"));

    // AspectRatio enum → 비율 문자열
    let ratioString = "16:9";
    if (aspectRatio === AspectRatio.PORTRAIT) ratioString = "9:16";
    else if (aspectRatio === AspectRatio.SQUARE) ratioString = "1:1";
    else if (aspectRatio === AspectRatio.CLASSIC) ratioString = "4:3";

    let targetModel: string;
    let inputPayload: Record<string, unknown>;

    if (model === "nano-banana-pro") {
        // [LEGACY] NanoBananaPro — 기존 호환성 유지
        targetModel = "nano-banana-pro";
        inputPayload = {
            prompt,
            image_input: inputImages.length > 0 ? inputImages : undefined,
            aspect_ratio: ratioString,
            resolution: "2K",
            output_format: "jpeg",
        };
        if (imageStrength !== undefined && inputImages.length > 0) {
            inputPayload.prompt_strength = imageStrength;
        }
    } else {
        // [OFFICIAL DOC — KIE NanoBanana 2 Tech Spec]
        // Endpoint: POST /api/v1/jobs/createTask
        // model: "nano-banana-2"
        // input.prompt: string (max 20000 chars)
        // input.image_input: string[] (URL array, up to 14 images, 30MB each)
        // input.google_search: boolean (default false)
        // input.aspect_ratio: "auto"|"1:1"|"9:16"|"16:9"|"4:3"|... (default "auto")
        // input.resolution: "1K"|"2K"|"4K" (default "1K")
        // input.output_format: "png"|"jpg" (default "jpg", NOT "jpeg")
        targetModel = "nano-banana-2";
        inputPayload = {
            prompt,
            image_input: inputImages.length > 0 ? inputImages : [],
            aspect_ratio: ratioString,
            resolution: "2K",
            output_format: "jpg",
            google_search: enableWebSearch === true,
        };
    }

    logger.info(`[Kie] Image generation (${targetModel})`, { aspectRatio: ratioString, refImages: inputImages.length });

    const response = await monitoredFetch(`${KIE_BASE_URL}/createTask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: targetModel, input: inputPayload })
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Kie API 요청 실패 (${response.status}): ${errText}`);
    }
    const data = await response.json();
    if (data.code !== 200) throw new Error(`Kie 태스크 생성 실패: ${data.msg || data.message || JSON.stringify(data)}`);

    const taskId = data.data?.taskId;
    if (!taskId) throw new Error('Kie 태스크 ID를 받지 못했습니다.');

    logger.info(`[Kie] 태스크 생성됨: ${taskId}`);
    const tempUrl = await pollKieTask(taskId);
    logger.info(`[Kie] 결과 URL 획득: ${tempUrl.substring(0, 100)}...`);

    // [OFFICIAL DOC] "Download results immediately: Generated content URLs typically expire after 24 hours"
    // 전략: Cloudinary 업로드 (서버→서버, CORS 무관) → base64 변환 → 원본 URL 직접 반환
    // Cloudinary를 1순위로 변경: 브라우저 fetch의 CORS 실패를 피하고 영구 URL 확보

    // 1순위: Cloudinary 업로드 (서버→서버, CORS 무관, 영구 URL)
    try {
        const cloudinaryUrl = await uploadRemoteUrlToCloudinary(tempUrl);
        logger.info(`[Kie] Cloudinary 업로드 성공: ${cloudinaryUrl.substring(0, 80)}...`);
        return cloudinaryUrl;
    } catch (e1) {
        logger.warn(`[Kie] Cloudinary 업로드 실패, base64 변환 시도`, e1);
    }

    // 2순위: 브라우저에서 직접 fetch → base64 (CORS 허용 CDN인 경우)
    try {
        const resp = await monitoredFetch(tempUrl);
        if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
        const blob = await resp.blob();
        return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e2) {
        logger.warn(`[Kie] base64 변환도 실패, 원본 URL 직접 반환`, e2);
    }

    // 3순위: 원본 temp URL 직접 반환 (24시간 유효, <img src>는 CORS 무관)
    return tempUrl;
}

// [OFFICIAL DOC — KIE Get Task Details]
// Endpoint: GET /api/v1/jobs/recordInfo?taskId={taskId}
// Task States: waiting → queuing → generating → success | fail
// resultJson (on success): '{"resultUrls":["url"]}' for image/media/video
// Best practice: 2-3s intervals with exponential backoff, timeout after 10-15 min
export async function pollKieTask(taskId: string, signal?: AbortSignal, onProgress?: (percent: number) => void): Promise<string> {
  const maxAttempts = 300;
  const url = `${KIE_BASE_URL}/recordInfo?taskId=${taskId}`;
  let simulatedProgress = 0;
  let pollInterval = 2000; // 시작: 2초, 점진적 증가

  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) throw new Error("Cancelled by user");
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    // [PERF] Simulated progress for UI feedback
    if (onProgress && simulatedProgress < 90) {
        simulatedProgress += (90 - simulatedProgress) * 0.03;
        onProgress(Math.round(simulatedProgress));
    }

    try {
        const response = await monitoredFetch(url, { headers: { 'Authorization': `Bearer ${getKieKey()}` }, signal });
        if (!response.ok) {
            // [OFFICIAL DOC] Error Codes: 401=Unauthorized, 402=Insufficient Credits, 404=Not Found, 429=Rate Limited
            if (response.status === 401) throw new Error("Kie API Key 인증 실패. Key를 확인하세요.");
            if (response.status === 402) throw new Error("Kie 잔액이 부족합니다. 충전 후 다시 시도하세요.");
            if (response.status === 404) throw new Error(`Kie 태스크를 찾을 수 없습니다 (${taskId}).`);
            if (response.status === 422) throw new Error("Kie 태스크 조회 실패 (recordInfo is null).");
            if (response.status === 429) {
                logger.trackRetry('Kie 폴링 (429)', i + 1, maxAttempts, 'Rate limited');
                await new Promise(r => setTimeout(r, 5000));
            }
            continue;
        }
        const data = await response.json();
        if (data.code !== 200) {
            // [OFFICIAL DOC] Non-200 codes: 401, 404, 422, 429, 500 등
            if (data.code === 401) throw new Error("Kie API Key 인증 실패.");
            if (data.code === 402) throw new Error("Kie 잔액이 부족합니다.");
            if (data.code === 501) throw new Error(`Kie 생성 실패 (501): ${data.msg || 'Generation Failed'}`);
            logger.trackRetry('Kie 폴링 (비정상 code)', i + 1, maxAttempts, `code: ${data.code}`);
            continue;
        }

        const taskData = data.data;
        // [OFFICIAL DOC] state 필드: "waiting" | "queuing" | "generating" | "success" | "fail"
        const status = taskData.state || taskData.status;

        if (status === 'success') {
            if (onProgress) onProgress(100);
            let result = taskData.resultJson;
            logger.info(`[Kie] Task ${taskId} success (${taskData.costTime}ms). resultJson type=${typeof result}, raw=${JSON.stringify(result).substring(0, 200)}`);

            // [OFFICIAL DOC] resultJson은 JSON 문자열: '{"resultUrls":["url1","url2",...]}'
            if (typeof result === 'string') {
                try { result = JSON.parse(result); } catch (e) {
                    logger.error(`[Kie] resultJson parse failed: ${(e as Error).message}`);
                }
            }

            // [OFFICIAL DOC] 이미지/미디어/비디오: { resultUrls: string[] }
            if (result?.resultUrls && Array.isArray(result.resultUrls) && result.resultUrls.length > 0) {
                return result.resultUrls[0];
            }
            // 레거시 호환 폴백
            if (result?.images?.[0]) return result.images[0];
            if (result?.image_url) return result.image_url;
            if (result?.video_url) return result.video_url;
            if (result?.url) return result.url;
            if (taskData.url) return taskData.url;

            // [FIX] 결과 형식이 예상과 다를 경우 — re-throw하여 무한 폴링 방지
            logger.error(`[Kie] Task ${taskId} success but URL extraction failed. Full resultJson: ${JSON.stringify(result).substring(0, 500)}`);
            throw new Error("결과 URL을 찾을 수 없습니다.");
        } else if (status === 'fail') {
            // [OFFICIAL DOC] failCode, failMsg 필드 참조
            const failInfo = taskData.failCode ? ` (${taskData.failCode})` : '';
            throw new Error(`Kie 생성 실패${failInfo}: ${taskData.failMsg || 'Unknown Error'}`);
        }
        // [OFFICIAL DOC] waiting/queuing/generating → 계속 폴링
        // Exponential backoff: 2s → 3s → 4s (max 4s)
        if (i > 10 && pollInterval < 4000) pollInterval = Math.min(pollInterval + 500, 4000);
    } catch (e: any) {
        if (e.name === 'AbortError' || e.message === "Cancelled by user") throw e;
        if (e.message.includes("잔액이 부족")) throw e;
        if (e.message.includes("인증 실패")) throw e;
        if (e.message.includes("찾을 수 없습니다")) throw e;
        // [FIX] 작업이 이미 완료(success/fail)된 경우의 에러는 재시도해도 결과가 바뀌지 않음 → 즉시 throw
        if (e.message.includes("결과 URL을 찾을 수 없습니다")) throw e;
        if (e.message.includes("Kie 생성 실패")) throw e;
        // 네트워크 일시 오류 등은 재시도
        logger.trackRetry('Kie 폴링 (네트워크)', i + 1, maxAttempts, e.message);
    }
  }
  throw new Error("Timeout: Kie 작업 시간 초과 (10분)");
}

function constructVeoPrompt(rawPrompt: string, cameraAngle?: string, cameraMovement?: string, culturalContext?: string): string {
    let finalPrompt = rawPrompt ? `${rawPrompt} ${STYLE_LOCK_TAGS} ${AUDIO_SAFETY_TAGS}` : `${STYLE_LOCK_TAGS} ${AUDIO_SAFETY_TAGS}`;

    // [FIX] Inject cultural/historical context so the video model
    // does NOT default to generic or wrong-culture visuals.
    if (culturalContext) {
        finalPrompt = `[Cultural Context: ${culturalContext}] ${finalPrompt}`;
    }

    if (cameraAngle) {
        const cleanAngle = cameraAngle.replace(/\[|\]|CAMERA:/g, "").trim();
        if (cleanAngle) finalPrompt += ` [Camera: ${cleanAngle}]`;
    }
    if (cameraMovement) {
        const cleanMove = cameraMovement.replace(/\[|\]|MOVEMENT:/g, "").trim();
        if (cleanMove) finalPrompt += ` [Movement: ${cleanMove}]`;
    }
    if (!cameraAngle && !cameraMovement) {
        finalPrompt += " [Camera: Static] [Movement: Subtle]";
    }
    return finalPrompt;
}

// Create Apimart Veo task (1080p)
export async function createApimartVeoTask(
    prompt: string,
    imageUrl: string,
    aspectRatio: AspectRatio,
    isArtistic: boolean = false,
    isLoop: boolean = false,
    isSafeRetry: boolean = false,
    cameraAngle?: string,
    cameraMovement?: string,
    culturalContext?: string
): Promise<string> {
    const apiKey = getApimartKey();
    if (!apiKey) throw new Error("Apimart API Key가 설정되지 않았습니다.");

    let publicImageUrl = imageUrl;
    if (imageUrl.startsWith("data:image")) {
        const file = base64ToFile(imageUrl, "veo_source.png");
        publicImageUrl = await uploadMediaToHosting(file);
    }

    let finalPrompt = constructVeoPrompt("", cameraAngle, cameraMovement, culturalContext);
    
    if (isSafeRetry) {
        finalPrompt = "[Sound Effects Only] [No Music] [No Speech] [Movement: Subtle]";
    }

    if (isLoop) finalPrompt += " [Seamless Loop]";

    const payload = {
        model: "veo3.1-fast",
        prompt: finalPrompt,
        duration: 8,
        aspect_ratio: aspectRatio === AspectRatio.PORTRAIT ? "9:16" : "16:9",
        image_urls: [publicImageUrl],
        resolution: "1080p"
    };

    const response = await monitoredFetch(APIMART_BASE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Apimart Request Failed: ${errText}`);
    }

    const data = await response.json();
    if (!data.data?.[0]?.task_id) throw new Error("Apimart Task ID not found");
    return data.data[0].task_id;
}

// Poll status for Apimart Veo tasks
export async function pollApimartVeoTask(
    taskId: string, 
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    const apiKey = getApimartKey();
    const url = `${APIMART_TASK_URL}/${taskId}`; 
    
    for (let i = 0; i < 200; i++) { 
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 5000));
        
        try {
            const response = await monitoredFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }, signal });
            if (!response.ok) continue;
            const data = await response.json();
            const taskData = data.data; 
            
            if (taskData && typeof taskData.progress === 'number' && onProgress) onProgress(taskData.progress);
            else if (taskData && typeof taskData.percentage === 'number' && onProgress) onProgress(taskData.percentage);

            if (taskData.status === 'completed' || taskData.status === 'succeeded' || taskData.status === 'success') {
                if (onProgress) onProgress(100);
                
                const videoResult = taskData.result?.videos?.[0];
                if (videoResult?.url) {
                    if (Array.isArray(videoResult.url) && videoResult.url[0]) return videoResult.url[0];
                    if (typeof videoResult.url === 'string') return videoResult.url;
                }

                if (taskData.video_url) return taskData.video_url;
                if (taskData.output) return taskData.output;
                
                throw new Error(`Success status but no URL found in response (ID: ${taskId})`);
            } else if (taskData.status === 'failed') {
                const errorMsg = taskData.error ? taskData.error.message : 'Unknown Error';
                throw new Error(`Apimart Failed: ${errorMsg}`);
            }
        } catch (e: any) { 
            if (e.name === 'AbortError') throw e; 
            if (e.message.includes("Apimart Failed")) throw e; 
            if (e.message.includes("Success status but no URL")) throw e;
        }
    }
    throw new Error("Veo Timeout");
}


// Create Kie Veo Task (Backup)
export async function createKieVeoTask(
    prompt: string, imageUrl: string, aspectRatio: AspectRatio, isLoop: boolean = false
): Promise<string> {
    const apiKey = getKieKey();
    let publicImageUrl = imageUrl;
    if (imageUrl.startsWith("data:image")) {
        const file = base64ToFile(imageUrl, "veo_source.png");
        publicImageUrl = await uploadMediaToHosting(file);
    }

    const hardenedPrompt = `${STYLE_LOCK_TAGS} ${AUDIO_SAFETY_TAGS} [Camera: Static]`;

    const input = {
        model: "veo3_fast", 
        generationType: isLoop ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "REFERENCE_2_VIDEO",
        imageUrls: isLoop ? [publicImageUrl, publicImageUrl] : [publicImageUrl],
        prompt: hardenedPrompt + (isLoop ? " [Seamless Loop]" : ""),
        aspectRatio: aspectRatio === AspectRatio.PORTRAIT ? "9:16" : "16:9",
        enableTranslation: true
    };
    
    const response = await monitoredFetch(`${KIE_VEO_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Kie Veo Request Failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.data?.taskId || data.data; 
}

// Poll Kie Veo Task (different endpoint/response from Grok pollKieTask)
export async function pollKieVeoTask(
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    const maxAttempts = 300;
    const url = `${KIE_VEO_BASE_URL}/record-info?taskId=${taskId}`;
    let simulatedProgress = 0;

    for (let i = 0; i < maxAttempts; i++) {
        if (signal?.aborted) throw new Error("Cancelled by user");
        await new Promise(r => setTimeout(r, 3000));

        if (onProgress && simulatedProgress < 90) {
            simulatedProgress += (90 - simulatedProgress) * 0.03;
            onProgress(Math.round(simulatedProgress));
        }

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${getKieKey()}` },
                signal
            });
            if (!response.ok) {
                logger.trackRetry('Kie Veo 폴링', i + 1, maxAttempts, `HTTP ${response.status}`);
                continue;
            }
            const data = await response.json();
            const taskData = data.data;

            if (taskData.successFlag === 1) {
                if (onProgress) onProgress(100);
                const resultUrl = taskData.response?.resultUrls?.[0];
                if (!resultUrl) throw new Error("Kie Veo 결과 URL 없음");
                return resultUrl;
            }
            if (taskData.successFlag >= 2) {
                throw new Error(`Kie Veo 생성 실패 (flag: ${taskData.successFlag})`);
            }
        } catch (e: any) {
            if (e.name === 'AbortError' || e.message === "Cancelled by user") throw e;
            if (e.message.includes("생성 실패") || e.message.includes("결과 URL 없음")) throw e;
            logger.trackRetry('Kie Veo 폴링 (네트워크)', i + 1, maxAttempts, e.message);
        }
    }
    throw new Error("Timeout: Kie Veo 작업 시간 초과");
}

// Create REMAKE Veo Task (FIRST_AND_LAST_FRAMES_2_VIDEO)
export async function createRemakeVeoTask(
    prompt: string,
    startImageUrl: string,
    endImageUrl: string,
    aspectRatio: AspectRatio
): Promise<string> {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error("Kie API Key가 설정되지 않았습니다. (REMAKE Veo용)");

    // Base64 → 공개 URL 변환
    let publicStart = startImageUrl;
    let publicEnd = endImageUrl;
    if (startImageUrl.startsWith("data:image")) {
        const file = base64ToFile(startImageUrl, "remake_start.png");
        publicStart = await uploadMediaToHosting(file);
    }
    if (endImageUrl.startsWith("data:image")) {
        const file = base64ToFile(endImageUrl, "remake_end.png");
        publicEnd = await uploadMediaToHosting(file);
    }

    const input = {
        model: "veo3_fast",
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        imageUrls: [publicStart, publicEnd],
        prompt: `${STYLE_LOCK_TAGS} ${AUDIO_SAFETY_TAGS} [Camera: Preserve original motion]`,
        aspectRatio: aspectRatio === AspectRatio.PORTRAIT ? "9:16" : "16:9",
        enableTranslation: true
    };

    const response = await monitoredFetch(`${KIE_VEO_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
    });

    if (!response.ok) {
        if (response.status === 402) throw new Error("Kie 잔액이 부족합니다. 충전 후 다시 시도하세요.");
        const errText = await response.text();
        throw new Error(`Kie Veo Remake API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.data?.taskId || data.data;
}

// Create Grok generation task via Kie.ai
export async function createPortableGrokTask(
    prompt: string, 
    imageUrl: string, 
    aspectRatio: AspectRatio, 
    cameraAngle?: string, 
    cameraMovement?: string,
    requiresTextRendering: boolean = false,
    useTopaz: boolean = false,
    atmosphere?: string,
    duration: string = '6',
    speechMode: boolean = false,
    generatedDialogue?: string,
    generatedSfx?: string,
    isLoop: boolean = false 
): Promise<string> {
    const apiKey = getKieKey();
    let publicImageUrl = imageUrl;
    if (imageUrl.startsWith("data:image")) {
        const file = base64ToFile(imageUrl, "grok_source.png");
        publicImageUrl = await uploadMediaToHosting(file);
    }

    let protectionPrompt = requiresTextRendering ? " [CONTROL: TEXT_LOCK]" : " [NO TEXT]";
    
    let audioPrompt = "";
    if (speechMode) {
         audioPrompt = ` [Native Dialogue: ${generatedDialogue || ""}]`;
    } else {
         if (generatedSfx && generatedSfx.trim().length > 0) {
             audioPrompt = ` [Sound Effect: ${generatedSfx}] [No Speech]`;
         } else {
             audioPrompt = AUDIO_SAFETY_TAGS; 
         }
    }
    
    let cameraTag = "";
    if (cameraAngle) cameraTag = ` [CAMERA: ${cameraAngle.replace(/\[|\]|CAMERA:/g, "").trim()}]`;
    let movementTag = "";
    if (cameraMovement) movementTag = ` [MOVEMENT: ${cameraMovement.replace(/\[|\]|MOVEMENT:/g, "").trim()}]`;

    let basePrompt = sanitizePrompt(prompt);
    if (cameraAngle) basePrompt = basePrompt.replace(cameraAngle, "");
    if (cameraMovement) basePrompt = basePrompt.replace(cameraMovement, "");
    basePrompt = basePrompt.replace("_____", "").trim();

    // 1. 블러 방지 및 선명도 강화를 위한 태그 추가
    const QUALITY_TAGS = " [Sharp Focus] [High Shutter Speed] [Crystal Clear] [No Motion Blur] [High Fidelity]";

    // 2. finalPrompt 구성 시 QUALITY_TAGS + STYLE_LOCK을 함께 결합
    const finalPrompt = `${STYLE_LOCK_TAGS} ${audioPrompt} ${basePrompt}${isLoop ? " [Seamless Loop]" : ""}${cameraTag}${movementTag}${protectionPrompt}${QUALITY_TAGS}`.trim().replace(/\s+/g, " ");

    const input = {
        image_urls: [publicImageUrl],
        index: 0,
        prompt: finalPrompt,
        mode: "normal",
        duration: duration.toString(),
        resolution: "720p"
    };

    const response = await monitoredFetch(`${KIE_BASE_URL}/createTask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-imagine/image-to-video', input })
    });

    // [FIX] 402/429 에러 코드 구별 처리
    if (response.status === 402) throw new Error("Kie 잔액이 부족합니다. 충전 후 다시 시도하세요.");
    if (response.status === 429) throw new Error("Kie 요청 제한 초과. 잠시 후 다시 시도하세요.");

    const data = await response.json();
    if (data.code !== 200) throw new Error(`Kie API Error: ${data.msg}`);
    return data.data.taskId;
}

export async function createPortableUpscaleTask(originalTaskId: string): Promise<string> {
    const apiKey = getKieKey();
    const response = await monitoredFetch(`${KIE_BASE_URL}/createTask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-imagine/upscale', input: { task_id: originalTaskId } })
    });
    // [FIX] 402/429 에러 코드 구별 처리
    if (response.status === 402) throw new Error("Kie 잔액이 부족합니다. 충전 후 다시 시도하세요.");
    if (response.status === 429) throw new Error("Kie 요청 제한 초과. 잠시 후 다시 시도하세요.");
    const data = await response.json();
    if (data.code !== 200) throw new Error(`Kie API Error: ${data.msg}`);
    return data.data.taskId;
}

export async function cancelKieTask(taskId: string): Promise<void> {
    const apiKey = getKieKey();
    await monitoredFetch(`${KIE_BASE_URL}/cancelTask?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
}


/* WaveSpeed 워터마크 제거 기능 주석처리
// === WAVESPEED WATERMARK REMOVAL ===

export async function createWatermarkRemovalTask(videoUrl: string): Promise<string> {
    const apiKey = getWaveSpeedKey();
    if (!apiKey) throw new Error("WaveSpeed API Key가 설정되지 않았습니다. API 설정에서 키를 입력해주세요.");

    const response = await monitoredFetch(`${WAVESPEED_BASE_URL}/wavespeed-ai/video-watermark-remover`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ video: videoUrl })
    });

    if (!response.ok) {
        if (response.status === 402) throw new Error("WaveSpeed 잔액이 부족합니다. 충전 후 다시 시도하세요.");
        if (response.status === 401) throw new Error("WaveSpeed API Key가 유효하지 않습니다.");
        const errText = await response.text();
        throw new Error(`WaveSpeed API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const taskId = data.data?.id;
    if (!taskId) throw new Error("WaveSpeed Task ID를 찾을 수 없습니다.");
    return taskId;
}

export async function pollWatermarkRemovalTask(
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    const apiKey = getWaveSpeedKey();
    const url = `${WAVESPEED_PREDICTIONS_URL}/${taskId}/result`;

    // 긴 영상 대응: 최대 720회 × 5초 = 3600초 (60분)
    const MAX_POLLS = 720;
    for (let i = 0; i < MAX_POLLS; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 5000));

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });
            if (!response.ok) continue;

            const data = await response.json();
            const status = data.data?.status || data.status;

            if (status === 'processing' || status === 'created') {
                const progress = Math.min(90, Math.round((i / MAX_POLLS) * 90));
                if (onProgress) onProgress(progress);
            } else if (status === 'completed' || status === 'succeeded') {
                if (onProgress) onProgress(100);
                const outputUrl = data.data?.outputs?.[0] || data.data?.output;
                if (outputUrl) return outputUrl;
                throw new Error("워터마크 제거 결과 URL을 찾을 수 없습니다.");
            } else if (status === 'failed') {
                throw new Error(`워터마크 제거 실패: ${data.data?.error || 'Unknown Error'}`);
            }
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name === 'AbortError' || err.message === "Cancelled") throw e;
            if (err.message.includes("실패") || err.message.includes("찾을 수 없습니다")) throw e;
        }
    }
    throw new Error("WaveSpeed 작업 시간 초과 (Timeout) — 60분 경과");
}
*/

// === VIDEO-TO-VIDEO (V2V) APIs ===

export type LumaModifyMode =
    | 'adhere_1' | 'adhere_2' | 'adhere_3'
    | 'flex_1' | 'flex_2' | 'flex_3'
    | 'reimagine_1' | 'reimagine_2' | 'reimagine_3';

// Poll WaveSpeed generic task (shared between watermark, V2V, etc.)
async function pollWaveSpeedTask(
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    const apiKey = getWaveSpeedKey();
    const url = `${WAVESPEED_PREDICTIONS_URL}/${taskId}/result`;

    for (let i = 0; i < 200; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 5000));

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });
            if (!response.ok) {
                logger.trackRetry('WaveSpeed 폴링', i + 1, 200, `HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();
            const status = data.data?.status || data.status;

            if (status === 'processing' || status === 'created') {
                const progress = Math.min(90, Math.round((i / 200) * 90));
                if (onProgress) onProgress(progress);
            } else if (status === 'completed' || status === 'succeeded') {
                if (onProgress) onProgress(100);
                const outputUrl = data.data?.outputs?.[0] || data.data?.output;
                if (outputUrl) return outputUrl;
                throw new Error("V2V 결과 URL을 찾을 수 없습니다.");
            } else if (status === 'failed') {
                throw new Error(`V2V 변환 실패: ${data.data?.error || 'Unknown Error'}`);
            }
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name === 'AbortError' || err.message === "Cancelled") throw e;
            if (err.message.includes("실패") || err.message.includes("찾을 수 없습니다")) throw e;
            logger.trackRetry('WaveSpeed 폴링 (네트워크)', i + 1, 200, err.message);
        }
    }
    throw new Error("V2V 작업 시간 초과 (Timeout)");
}

// Luma Modify Video via WaveSpeed ($0.019/sec, max 30s, 9 modes)
export async function createLumaModifyTask(
    videoUrl: string,
    prompt: string,
    mode: LumaModifyMode = 'flex_2',
    firstFrameUrl?: string
): Promise<string> {
    const apiKey = getWaveSpeedKey();
    if (!apiKey) throw new Error("WaveSpeed API Key가 설정되지 않았습니다.");

    const body: Record<string, unknown> = { video: videoUrl, prompt, mode };
    if (firstFrameUrl) body.first_frame = firstFrameUrl;

    const response = await monitoredFetch(`${WAVESPEED_BASE_URL}/luma/modify-video`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        if (response.status === 402) throw new Error("WaveSpeed 잔액이 부족합니다.");
        if (response.status === 401) throw new Error("WaveSpeed API Key가 유효하지 않습니다.");
        const errText = await response.text();
        throw new Error(`Luma Modify API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const taskId = data.data?.id;
    if (!taskId) throw new Error("Luma Modify Task ID를 찾을 수 없습니다.");
    logger.info(`[V2V] Luma Modify task created: ${taskId} (mode: ${mode})`);
    return taskId;
}

export async function pollLumaModifyTask(
    taskId: string, signal?: AbortSignal, onProgress?: (percent: number) => void
): Promise<string> {
    return pollWaveSpeedTask(taskId, signal, onProgress);
}

// Runway Aleph V2V via Kie AI (~$0.25, max 5s, best quality)
export async function createRunwayAlephTask(
    videoUrl: string,
    prompt: string,
    aspectRatio: AspectRatio = AspectRatio.LANDSCAPE,
    referenceImageUrl?: string
): Promise<string> {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error("Kie API Key가 설정되지 않았습니다.");

    let ratioParam = "16:9";
    if (aspectRatio === AspectRatio.PORTRAIT) ratioParam = "9:16";
    else if (aspectRatio === AspectRatio.SQUARE) ratioParam = "1:1";
    else if (aspectRatio === AspectRatio.CLASSIC) ratioParam = "4:3";

    const body: Record<string, unknown> = {
        prompt,
        videoUrl,
        aspectRatio: ratioParam
    };
    if (referenceImageUrl) body.referenceImage = referenceImageUrl;

    const response = await monitoredFetch('https://api.kie.ai/api/v1/aleph/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        if (response.status === 402) throw new Error("Kie 잔액이 부족합니다.");
        if (response.status === 429) throw new Error("Kie 요청 제한 초과.");
        const errText = await response.text();
        throw new Error(`Runway Aleph API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (data.code !== 200) throw new Error(`Runway Aleph 작업 생성 실패: ${data.msg}`);
    const taskId = data.data?.taskId;
    if (!taskId) throw new Error("Runway Aleph Task ID를 찾을 수 없습니다.");
    logger.info(`[V2V] Runway Aleph task created: ${taskId}`);
    return taskId;
}

export async function pollRunwayAlephTask(
    taskId: string, signal?: AbortSignal, onProgress?: (percent: number) => void
): Promise<string> {
    const url = `https://api.kie.ai/api/v1/aleph/record-detail?taskId=${taskId}`;
    let simulatedProgress = 0;

    for (let i = 0; i < 300; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 3000));

        if (onProgress && simulatedProgress < 90) {
            simulatedProgress += (90 - simulatedProgress) * 0.03;
            onProgress(Math.round(simulatedProgress));
        }

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${getKieKey()}` }, signal
            });
            if (!response.ok) continue;
            const data = await response.json();
            if (data.code !== 200) continue;

            const taskData = data.data;
            if (taskData.video_url) {
                if (onProgress) onProgress(100);
                return taskData.video_url;
            }
            // successFlag 패턴 (Kie Veo/Luma 공통)
            if (taskData.successFlag === 1) {
                if (onProgress) onProgress(100);
                const resultUrl = taskData.response?.resultUrls?.[0] || taskData.response?.video_url;
                if (resultUrl) return resultUrl;
            }
            if (taskData.successFlag >= 2) {
                throw new Error(`Runway Aleph 생성 실패: ${taskData.errorMessage || 'Unknown'}`);
            }
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name === 'AbortError' || err.message === "Cancelled") throw e;
            if (err.message.includes("생성 실패")) throw e;
        }
    }
    throw new Error("Runway Aleph 작업 시간 초과");
}

// Luma Modify Video via Kie AI (alternative to WaveSpeed)
export async function createKieLumaModifyTask(
    videoUrl: string,
    prompt: string
): Promise<string> {
    const apiKey = getKieKey();
    if (!apiKey) throw new Error("Kie API Key가 설정되지 않았습니다.");

    const response = await monitoredFetch('https://api.kie.ai/api/v1/modify/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, videoUrl })
    });

    if (!response.ok) {
        if (response.status === 402) throw new Error("Kie 잔액이 부족합니다.");
        const errText = await response.text();
        throw new Error(`Kie Luma Modify API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (data.code !== 200) throw new Error(`Kie Luma Modify 작업 생성 실패: ${data.msg}`);
    const taskId = data.data?.taskId;
    if (!taskId) throw new Error("Kie Luma Modify Task ID를 찾을 수 없습니다.");
    logger.info(`[V2V] Kie Luma Modify task created: ${taskId}`);
    return taskId;
}

export async function pollKieLumaModifyTask(
    taskId: string, signal?: AbortSignal, onProgress?: (percent: number) => void
): Promise<string> {
    const url = `https://api.kie.ai/api/v1/modify/record-info?taskId=${taskId}`;
    let simulatedProgress = 0;

    for (let i = 0; i < 300; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 5000));

        if (onProgress && simulatedProgress < 90) {
            simulatedProgress += (90 - simulatedProgress) * 0.02;
            onProgress(Math.round(simulatedProgress));
        }

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${getKieKey()}` }, signal
            });
            if (!response.ok) continue;
            const data = await response.json();
            if (data.code !== 200) continue;

            const taskData = data.data;
            if (taskData.successFlag === 1) {
                if (onProgress) onProgress(100);
                const resultUrl = taskData.response?.resultUrls?.[0];
                if (resultUrl) return resultUrl;
                throw new Error("Luma Modify 결과 URL 없음");
            }
            if (taskData.successFlag === 2 || taskData.successFlag === 3) {
                throw new Error(`Luma Modify 생성 실패: ${taskData.errorMessage || 'Unknown'}`);
            }
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name === 'AbortError' || err.message === "Cancelled") throw e;
            if (err.message.includes("실패") || err.message.includes("URL 없음")) throw e;
        }
    }
    throw new Error("Luma Modify 작업 시간 초과");
}

// === xAI Grok Video Edit (V2V) — $0.05/sec, max 8.7s, 720p ===

export async function createXaiVideoEditTask(
    videoUrl: string,
    prompt: string,
    resolution: '480p' | '720p' = '720p'
): Promise<string> {
    const apiKey = getXaiKey();
    if (!apiKey) throw new Error("xAI API Key가 설정되지 않았습니다. 브라우저 콘솔에서 localStorage.setItem('CUSTOM_XAI_KEY', 'xai-...') 로 설정하세요.");

    const response = await monitoredFetch(`${XAI_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'grok-imagine-video',
            prompt,
            video_url: videoUrl,
            resolution
        })
    });

    if (!response.ok) {
        if (response.status === 401) throw new Error("xAI API Key가 유효하지 않습니다.");
        if (response.status === 402) throw new Error("xAI 잔액이 부족합니다.");
        if (response.status === 429) throw new Error("xAI 요청 제한 초과 (60 RPM).");
        const errText = await response.text();
        throw new Error(`xAI Video Edit API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const requestId = data.request_id;
    if (!requestId) throw new Error("xAI request_id를 찾을 수 없습니다.");
    logger.info(`[V2V] xAI Grok Edit task created: ${requestId}`);
    return requestId;
}

export async function pollXaiVideoEditTask(
    requestId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    const apiKey = getXaiKey();
    const url = `${XAI_BASE_URL}/videos/${requestId}`;
    let simulatedProgress = 0;

    for (let i = 0; i < 300; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        await new Promise(r => setTimeout(r, 2000));

        if (onProgress && simulatedProgress < 90) {
            simulatedProgress += (90 - simulatedProgress) * 0.05;
            onProgress(Math.round(simulatedProgress));
        }

        try {
            const response = await monitoredFetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });
            if (!response.ok) continue;

            const data = await response.json();

            // 완료: video 객체가 직접 반환됨 (status 없이) 또는 status === 'done'
            if (data.video?.url) {
                if (onProgress) onProgress(100);
                logger.info(`[V2V] xAI Grok Edit completed: ${data.video.url}`);
                return data.video.url;
            }
            if (data.status === 'done') {
                if (onProgress) onProgress(100);
                const videoUrl = data.video?.url;
                if (!videoUrl) throw new Error("xAI 결과 영상 URL 없음");
                return videoUrl;
            }
            if (data.status === 'expired') {
                throw new Error("xAI 작업 만료 (expired). 다시 시도하세요.");
            }
            // status === 'pending' → 계속 폴링
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name === 'AbortError' || err.message === "Cancelled") throw e;
            if (err.message.includes("만료") || err.message.includes("URL 없음")) throw e;
        }
    }
    throw new Error("xAI 작업 시간 초과 (Timeout)");
}

// === V2V Quick Test Utility (브라우저 콘솔에서 사용) ===
export type V2VProvider = 'xai' | 'luma-wavespeed' | 'luma-kie' | 'runway-aleph';

export async function testV2V(
    videoUrl: string,
    prompt: string,
    provider: V2VProvider = 'xai',
    mode: LumaModifyMode = 'flex_2'
): Promise<string> {
    logger.info(`[V2V TEST] Provider: ${provider}, Mode: ${mode}`);
    logger.info(`[V2V TEST] Video: ${videoUrl}`);
    logger.info(`[V2V TEST] Prompt: ${prompt}`);

    let taskId: string;
    let resultUrl: string;

    switch (provider) {
        case 'xai':
            taskId = await createXaiVideoEditTask(videoUrl, prompt);
            logger.info(`[V2V TEST] Task created: ${taskId}. Polling...`);
            resultUrl = await pollXaiVideoEditTask(taskId);
            break;
        case 'luma-wavespeed':
            taskId = await createLumaModifyTask(videoUrl, prompt, mode);
            logger.info(`[V2V TEST] Task created: ${taskId}. Polling...`);
            resultUrl = await pollLumaModifyTask(taskId);
            break;
        case 'luma-kie':
            taskId = await createKieLumaModifyTask(videoUrl, prompt);
            logger.info(`[V2V TEST] Task created: ${taskId}. Polling...`);
            resultUrl = await pollKieLumaModifyTask(taskId);
            break;
        case 'runway-aleph':
            taskId = await createRunwayAlephTask(videoUrl, prompt);
            logger.info(`[V2V TEST] Task created: ${taskId}. Polling...`);
            resultUrl = await pollRunwayAlephTask(taskId);
            break;
    }

    logger.info(`[V2V TEST] SUCCESS! Result: ${resultUrl}`);
    console.log(`\n✅ V2V 테스트 완료!\n결과 영상: ${resultUrl}\n`);
    return resultUrl;
}

// === VIDEO PROVIDER ADAPTER PATTERN ===

// [UPDATED] Grok provider with Kie (primary) → Evolink Veo (fallback)
// Evolink does not support Grok directly; when Kie fails, fallback to Evolink Veo 3.1 1080p.
const grokProvider: VideoProvider = {
    create: async (p) => {
        try {
            const taskId = await createPortableGrokTask(
                p.prompt, p.imageUrl, p.aspectRatio,
                p.cameraAngle, p.cameraMovement, p.requiresTextRendering,
                p.useTopaz, p.atmosphere, p.duration,
                p.speechMode, p.generatedDialogue, p.generatedSfx, p.isLoop
            );
            return `kie:${taskId}`;
        } catch (e) {
            logger.warn(`[Grok] Kie 실패, Evolink Veo 폴백 시도: ${(e as Error).message}`);
            const taskId = await createEvolinkVeoTask(p);
            return `evolink:${taskId}`;
        }
    },
    poll: (compositeId, signal, onProgress) => {
        if (compositeId.startsWith('evolink:')) {
            const taskId = compositeId.slice('evolink:'.length);
            return pollEvolinkVeoTask(taskId, signal, onProgress);
        }
        const taskId = compositeId.startsWith('kie:') ? compositeId.slice('kie:'.length) : compositeId;
        return pollKieTask(taskId, signal, onProgress);
    },
    cancel: async (compositeId) => {
        if (compositeId.startsWith('evolink:')) {
            const taskId = compositeId.slice('evolink:'.length);
            await evolinkVeoProvider.cancel(taskId);
            return;
        }
        const taskId = compositeId.startsWith('kie:') ? compositeId.slice('kie:'.length) : compositeId;
        await cancelKieTask(taskId);
    },
};


// [DEPRECATED] Apimart VEO 1080p Provider — 주석 처리 (Evolink로 대체)
// const veoQualityProvider: VideoProvider = {
//     create: (p) => createApimartVeoTask(
//         p.prompt, p.imageUrl, p.aspectRatio,
//         p.isArtistic, p.isLoop, p.isSafeRetry,
//         p.cameraAngle, p.cameraMovement
//     ),
//     poll: (taskId, signal, onProgress) => pollApimartVeoTask(taskId, signal, onProgress),
//     cancel: async () => { /* Apimart does not support cancel */ },
// };

// === EVOLINK IMAGE GENERATION WRAPPER ===

/**
 * Evolink Nanobanana 2 이미지 생성 래퍼
 * AspectRatio enum → string 변환, base64 → URL 업로드 처리
 * @returns 생성된 이미지 URL
 */
export async function generateEvolinkImageWrapped(
    prompt: string,
    aspectRatio: AspectRatio,
    referenceImages?: string | string[],
    secondaryImage?: string,
    resolution: "0.5K" | "1K" | "2K" | "4K" = "2K",
    enableWebSearch?: boolean
): Promise<string> {
    if (!getEvolinkKey()) throw new Error("Evolink API Key가 설정되지 않았습니다.");

    // AspectRatio enum → Nanobanana 2 size string
    let ratioParam = "16:9";
    if (aspectRatio === AspectRatio.PORTRAIT) ratioParam = "9:16";
    else if (aspectRatio === AspectRatio.SQUARE) ratioParam = "1:1";
    else if (aspectRatio === AspectRatio.CLASSIC) ratioParam = "4:3";

    // 참조 이미지: Evolink는 URL만 지원 → base64는 Cloudinary에 업로드
    const imageUrls: string[] = [];
    const refImagesArray = !referenceImages
        ? []
        : typeof referenceImages === 'string'
            ? [referenceImages]
            : referenceImages;

    for (const img of refImagesArray) {
        if (img.startsWith('data:')) {
            const file = base64ToFile(img, 'evolink_ref.png');
            const url = await uploadMediaToHosting(file);
            imageUrls.push(url);
        } else if (img.startsWith('http')) {
            imageUrls.push(img);
        }
    }
    if (secondaryImage) {
        if (secondaryImage.startsWith('data:')) {
            const file = base64ToFile(secondaryImage, 'evolink_sec.png');
            const url = await uploadMediaToHosting(file);
            imageUrls.push(url);
        } else if (secondaryImage.startsWith('http')) {
            imageUrls.push(secondaryImage);
        }
    }

    logger.info('[Evolink] 이미지 생성 래퍼 호출', { ratio: ratioParam, quality: resolution, refCount: imageUrls.length });

    const resultUrl = await evolinkGenImg(
        prompt,
        ratioParam,
        resolution,
        imageUrls.length > 0 ? imageUrls : undefined,
        undefined, // signal
        undefined, // onProgress
        enableWebSearch
    );

    return resultUrl;
}

// === EVOLINK VEO 3.1 FAST VIDEO PROVIDER ===

async function createEvolinkVeoTask(params: VideoTaskParams): Promise<string> {
    if (!getEvolinkKey()) throw new Error("Evolink API Key가 설정되지 않았습니다. (Veo 1080p용)");

    // 이미지 URL 확보: base64인 경우 업로드
    let publicImageUrl = params.imageUrl;
    if (publicImageUrl.startsWith("data:image")) {
        const file = base64ToFile(publicImageUrl, "veo_source.png");
        publicImageUrl = await uploadMediaToHosting(file);
    }

    // 프롬프트 구성 (culturalContext 포함하여 문화적 맥락 반영)
    let finalPrompt = constructVeoPrompt("", params.cameraAngle, params.cameraMovement, params.culturalContext);
    if (params.isSafeRetry) {
        finalPrompt = "[Sound Effects Only] [No Music] [No Speech] [Movement: Subtle]";
    }
    if (params.isLoop) finalPrompt += " [Seamless Loop]";

    const aspectRatio = params.aspectRatio === AspectRatio.PORTRAIT ? '9:16' as const : '16:9' as const;

    // FIRST&LAST 모드: endImageUrl이 있으면 2개 이미지 전달
    const imageUrls: string[] = [publicImageUrl];
    if (params.endImageUrl) {
        let endUrl = params.endImageUrl;
        if (endUrl.startsWith("data:image")) {
            const file = base64ToFile(endUrl, "veo_end.png");
            endUrl = await uploadMediaToHosting(file);
        }
        imageUrls.push(endUrl);
    }

    const generationType = imageUrls.length > 1 ? 'FIRST&LAST' as const : 'REFERENCE' as const;

    return createEvolinkVideoTask(
        finalPrompt,
        imageUrls,
        generationType,
        aspectRatio,
        8,      // duration: 8초
        '1080p', // quality
        true     // generate_audio
    );
}

async function pollEvolinkVeoTask(
    taskId: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void
): Promise<string> {
    return pollEvolinkTask(taskId, signal, onProgress, 200, 5000, 600_000);
}

// [FIX M10] Evolink has no server-side cancel API, but we must abort local polling
// to stop wasting network requests. An AbortController per task is used so that
// cancel() can terminate the polling loop even if called outside useVideoBatch.
const evolinkVeoAbortControllers = new Map<string, AbortController>();

const evolinkVeoProvider: VideoProvider = {
    create: (p) => createEvolinkVeoTask(p),
    poll: (taskId, signal, onProgress) => {
        // Create an internal abort controller for this task
        const internalController = new AbortController();
        evolinkVeoAbortControllers.set(taskId, internalController);

        // Combine external signal (from useVideoBatch) with internal one
        const combinedSignal = signal
            ? combineAbortSignals(signal, internalController.signal)
            : internalController.signal;

        return pollEvolinkVeoTask(taskId, combinedSignal, onProgress).finally(() => {
            evolinkVeoAbortControllers.delete(taskId);
        });
    },
    cancel: async (taskId) => {
        const controller = evolinkVeoAbortControllers.get(taskId);
        if (controller) {
            controller.abort();
            evolinkVeoAbortControllers.delete(taskId);
            logger.warn(`[Evolink Veo] Local polling aborted for task ${taskId}. Note: Evolink has no server-side cancel — credits may still be consumed.`);
        } else {
            logger.warn(`[Evolink Veo] No active polling found for task ${taskId}. Cancel is a no-op.`);
        }
    },
};

export function getVideoProvider(model: VideoModel): VideoProvider {
    switch (model) {
        case VideoModel.GROK: return grokProvider;
        case VideoModel.VEO: return evolinkVeoProvider;
        case VideoModel.VEO_QUALITY: return evolinkVeoProvider;
        default: return evolinkVeoProvider;
    }
}
