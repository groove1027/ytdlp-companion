
// [v3.1] 영구 저장 — 컴패니언 터널 사용 (Cloudinary 제거)
import { uploadMediaToHosting, uploadRemoteUrlToCloudinary } from './uploadService';
import { dataURLtoFile } from '../utils/fileHelpers';
import { logger } from './LoggerService';
import type { Scene } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

// [FIX #471] 임시 URL 호스트 목록 — 24시간 내 만료되므로 Cloudinary로 재업로드 필요
const TEMP_URL_HOSTS = [
    'tempfile.aiquickdraw.com',
    'files.evolink.ai',
];

/** 임시(만료 예정) URL인지 판별 */
const isTempUrl = (url: string): boolean => {
    try {
        const host = new URL(url).hostname;
        return TEMP_URL_HOSTS.some(h => host.includes(h));
    } catch { return false; }
};

// The Scene fields that may contain base64 image data and should be migrated
const BASE64_SCENE_FIELDS: (keyof Scene)[] = [
    'imageUrl',
    'previousSceneImageUrl',
    'referenceImage',
    'sourceFrameUrl',
    'startFrameUrl',
    'editedStartFrameUrl',
    'editedEndFrameUrl',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if an image URL is a Base64 data URL (candidate for migration).
 */
export const isBase64Image = (url: string | undefined): boolean => {
    return !!url && url.startsWith('data:');
};

/**
 * Sleeps for the given number of milliseconds.
 */
const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Core: persistImage (with retry)
// ---------------------------------------------------------------------------

/**
 * Persists an image to Cloudinary and returns a permanent HTTPS URL.
 *
 * Handles three input types:
 *   1. Permanent HTTPS URL (Cloudinary etc.) → returned as-is
 *   2. Temporary HTTPS URL (tempfile/evolink) → re-uploaded to Cloudinary [FIX #471]
 *   3. Base64 data URL → uploaded to Cloudinary
 *
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s) on upload
 * failure. Falls back to returning the original data on final failure.
 */
export const persistImage = async (imageData: string): Promise<string> => {
    if (!imageData) return imageData;

    // [FIX #471] 임시 HTTP URL → Cloudinary 영구 업로드 (만료 전에 보존)
    if ((imageData.startsWith('http://') || imageData.startsWith('https://')) && isTempUrl(imageData)) {
        logger.info(`[persistImage] 임시 URL 감지, Cloudinary 영구화 시도: ${imageData.substring(0, 80)}...`);

        // 1순위: 컴패니언 터널 프록시 (원격 URL → fetch → 터널 업로드)
        try {
            const proxiedUrl = await uploadRemoteUrlToCloudinary(imageData);
            // 터널 프록시가 원본 URL을 그대로 반환한 경우 → 실패로 간주하여 2순위로 이동
            if (proxiedUrl !== imageData) {
                logger.info(`[persistImage] 임시 URL → 터널 프록시 영구화 성공`);
                return proxiedUrl;
            }
            logger.warn(`[persistImage] 터널 프록시 미가용 → 브라우저 fetch 시도`);
        } catch (e1) {
            logger.warn(`[persistImage] 터널 프록시 실패, 브라우저 fetch 시도`, e1);
        }

        // 2순위: 브라우저 직접 fetch → blob → File → upload
        try {
            const resp = await fetch(imageData);
            if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
            const blob = await resp.blob();
            const file = new File([blob], `img_${Date.now()}.png`, { type: blob.type || 'image/png' });
            const url = await uploadMediaToHosting(file);
            logger.info(`[persistImage] 임시 URL → fetch+upload 영구화 성공`);
            return url;
        } catch (e2) {
            logger.warn(`[persistImage] 브라우저 fetch도 실패, 원본 URL 유지`, e2);
        }

        // 3순위: 원본 임시 URL 반환 (24시간 유효)
        return imageData;
    }

    // Already a permanent hosted URL -- no action needed
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
        return imageData;
    }

    // Only process Base64 data URLs
    if (!imageData.startsWith('data:')) {
        return imageData;
    }

    const file = dataURLtoFile(imageData, `img_${Date.now()}.png`);
    if (!file) return imageData;

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
            logger.trackRetry('persistImage upload', attempt, MAX_RETRIES, lastError instanceof Error ? lastError.message : String(lastError));
        }
        try {
            const url = await uploadMediaToHosting(file);
            return url;
        } catch (e) {
            lastError = e;
            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(
                    `[persistImage] Upload attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms...`,
                    e,
                );
                await sleep(delay);
            }
        }
    }

    console.warn(
        `[persistImage] All ${MAX_RETRIES} upload attempts failed, keeping Base64:`,
        lastError,
    );
    return imageData;
};

// ---------------------------------------------------------------------------
// Bulk: persistAllSceneImages
// ---------------------------------------------------------------------------

/**
 * Migrates ALL base64-capable fields in a Scene to Cloudinary-hosted URLs.
 *
 * Fields checked:
 *   imageUrl, previousSceneImageUrl, referenceImage, sourceFrameUrl,
 *   startFrameUrl, editedStartFrameUrl, editedEndFrameUrl
 *
 * Returns a `Partial<Scene>` containing ONLY the fields whose values
 * actually changed (were migrated from base64 to https). Callers can
 * spread this into a store update for efficient patching.
 *
 * If no fields needed migration, returns an empty object.
 */
export const persistAllSceneImages = async (
    scene: Scene,
): Promise<Partial<Scene>> => {
    const changed: Partial<Scene> = {};

    // Build an array of migration tasks so they run in parallel
    const tasks = BASE64_SCENE_FIELDS.map(async (field) => {
        const value = scene[field] as string | undefined;
        if (!isBase64Image(value)) return; // nothing to migrate

        const migrated = await persistImage(value!);

        // Only record if the value actually changed (upload succeeded)
        if (migrated !== value) {
            (changed as Record<string, string>)[field] = migrated;
        }
    });

    await Promise.all(tasks);

    return changed;
};
