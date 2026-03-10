
import { uploadMediaToHosting } from './uploadService';
import { dataURLtoFile } from '../utils/fileHelpers';
import { logger } from './LoggerService';
import type { Scene } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

// The Scene fields that may contain base64 image data and should be migrated
const BASE64_SCENE_FIELDS: (keyof Scene)[] = [
    'imageUrl',
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
 * Persists a Base64 image to Cloudinary and returns the HTTPS URL.
 * If the input is already an HTTPS URL, returns it as-is (idempotent).
 *
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s) on upload
 * failure. Falls back to returning the original data on final failure
 * (preserves current fallback behavior).
 */
export const persistImage = async (imageData: string): Promise<string> => {
    if (!imageData) return imageData;

    // Already a hosted URL -- no action needed
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
 *   imageUrl, referenceImage, sourceFrameUrl,
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
