import { BLOB_PROJECT_ID_INDEX, dbPromise, SavedImageBlob } from './storageService';
import type { Scene, Thumbnail } from '../types';

const STORE = 'image-blobs' as const;
export const MAX_AUTOSAVE_IMAGE_BLOB_RETRIES = 3;

export const SCENE_IMAGE_FIELDS = [
  'imageUrl',
  'previousSceneImageUrl',
  'referenceImage',
  'sourceFrameUrl',
  'startFrameUrl',
  'editedStartFrameUrl',
  'editedEndFrameUrl',
] as const satisfies readonly (keyof Scene)[];

export type SceneImageField = typeof SCENE_IMAGE_FIELDS[number];

const buildUniqueBlobUrlList = (blobUrls: Iterable<string>): string[] => Array.from(new Set(blobUrls));

const buildSceneBlobKey = (
  projectId: string,
  sceneId: string,
  field: SceneImageField,
): string => `${projectId}::scene::${sceneId}::${field}`;

const buildThumbnailBlobKey = (projectId: string, thumbId: string): string =>
  `${projectId}::thumb::${thumbId}`;

// ---------------------------------------------------------------------------
// persistProjectImages
// scenes/thumbnails에서 blob: URL인 이미지를 찾아 fetch → Blob → IDB 저장
// ---------------------------------------------------------------------------

export interface PersistProjectImagesResult {
  attempted: number;
  persisted: number;
  failed: number;
  failedKeys: string[];
  activeBlobUrls: string[];
  attemptedBlobUrls: string[];
  failedBlobUrls: string[];
  skippedBlobUrls: string[];
  allSucceeded: boolean;
}

const collectProjectImageBlobEntries = (
  projectId: string,
  scenes: Scene[],
  thumbnails: Thumbnail[],
) => {
  const entries: Array<{
    key: string;
    projectId: string;
    sceneId: string;
    field: SceneImageField;
    blobUrl: string;
  }> = [];

  for (const scene of scenes) {
    for (const field of SCENE_IMAGE_FIELDS) {
      const value = scene[field];
      if (typeof value !== 'string' || !value.startsWith('blob:')) continue;

      entries.push({
        key: buildSceneBlobKey(projectId, scene.id, field),
        projectId,
        sceneId: scene.id,
        field,
        blobUrl: value,
      });
    }
  }

  for (const thumb of thumbnails) {
    if (!thumb.imageUrl?.startsWith('blob:')) continue;

    entries.push({
      key: buildThumbnailBlobKey(projectId, thumb.id),
      projectId,
      sceneId: thumb.id,
      field: 'imageUrl',
      blobUrl: thumb.imageUrl,
    });
  }

  return entries;
};

export const collectProjectImageBlobUrls = (
  scenes: Scene[],
  thumbnails: Thumbnail[],
): string[] => buildUniqueBlobUrlList(
  collectProjectImageBlobEntries('project-scope', scenes, thumbnails).map((entry) => entry.blobUrl),
);

export const syncImageBlobRetryCounts = (
  retryCounts: Map<string, number>,
  activeBlobUrls: readonly string[],
  maxRetries = MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
): string[] => {
  const activeBlobUrlSet = new Set(activeBlobUrls);

  for (const blobUrl of Array.from(retryCounts.keys())) {
    if (!activeBlobUrlSet.has(blobUrl)) {
      retryCounts.delete(blobUrl);
    }
  }

  return Array.from(retryCounts.entries())
    .filter(([, attemptCount]) => attemptCount >= maxRetries)
    .map(([blobUrl]) => blobUrl);
};

export const applyImageBlobPersistRetryResult = (
  retryCounts: Map<string, number>,
  attemptedBlobUrls: readonly string[],
  failedBlobUrls: readonly string[],
  maxRetries = MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
) => {
  const failedBlobUrlSet = new Set(failedBlobUrls);
  const newlyAbandonedBlobUrls: string[] = [];

  for (const blobUrl of buildUniqueBlobUrlList(attemptedBlobUrls)) {
    if (!failedBlobUrlSet.has(blobUrl)) {
      retryCounts.delete(blobUrl);
      continue;
    }

    const nextAttemptCount = (retryCounts.get(blobUrl) || 0) + 1;
    retryCounts.set(blobUrl, nextAttemptCount);

    if (nextAttemptCount === maxRetries) {
      newlyAbandonedBlobUrls.push(blobUrl);
    }
  }

  return {
    newlyAbandonedBlobUrls,
    retryableBlobUrls: buildUniqueBlobUrlList(failedBlobUrls).filter(
      (blobUrl) => (retryCounts.get(blobUrl) || 0) < maxRetries,
    ),
  };
};

export const persistProjectImages = async (
  projectId: string,
  scenes: Scene[],
  thumbnails: Thumbnail[],
  options?: {
    skippedBlobUrls?: ReadonlySet<string>;
  },
): Promise<PersistProjectImagesResult> => {
  const db = await dbPromise;
  const tasks: Promise<{ key: string; blobUrl: string; persisted: boolean }>[] = [];
  const skippedBlobUrlSet = options?.skippedBlobUrls || new Set<string>();
  const candidates = collectProjectImageBlobEntries(projectId, scenes, thumbnails);
  const currentKeySet = new Set(candidates.map((candidate) => candidate.key));

  for (const candidate of candidates) {
    if (skippedBlobUrlSet.has(candidate.blobUrl)) {
      continue;
    }

    tasks.push(
      fetchAndStore(
        db,
        candidate.key,
        candidate.projectId,
        candidate.sceneId,
        candidate.field,
        candidate.blobUrl,
      ).then((persisted) => ({
        key: candidate.key,
        blobUrl: candidate.blobUrl,
        persisted,
      })),
    );
  }

  const results = await Promise.all(tasks);
  const failedKeys = results
    .filter((result) => !result.persisted)
    .map((result) => result.key);
  const failedBlobUrls = buildUniqueBlobUrlList(
    results
      .filter((result) => !result.persisted)
      .map((result) => result.blobUrl),
  );
  const activeBlobUrls = buildUniqueBlobUrlList(candidates.map((candidate) => candidate.blobUrl));
  const attemptedBlobUrls = buildUniqueBlobUrlList(results.map((result) => result.blobUrl));

  try {
    await pruneStaleBlobs(db, projectId, currentKeySet);
  } catch (e) {
    console.warn(`[imageBlobStorageService] pruneStaleBlobs failed for ${projectId}:`, e);
  }

  return {
    attempted: results.length,
    persisted: results.length - failedKeys.length,
    failed: failedKeys.length,
    failedKeys,
    activeBlobUrls,
    attemptedBlobUrls,
    failedBlobUrls,
    skippedBlobUrls: activeBlobUrls.filter((blobUrl) => skippedBlobUrlSet.has(blobUrl)),
    allSucceeded: failedKeys.length === 0,
  };
};

// ---------------------------------------------------------------------------
// pruneStaleBlobs
// 현재 프로젝트 state에 더 이상 존재하지 않는 image blob row 정리
// ---------------------------------------------------------------------------

const pruneStaleBlobs = async (
  db: Awaited<typeof dbPromise>,
  projectId: string,
  currentKeys: ReadonlySet<string>,
): Promise<void> => {
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const index = store.index(BLOB_PROJECT_ID_INDEX);
  let cursor = await index.openCursor(projectId);

  while (cursor) {
    const entry = cursor.value as SavedImageBlob;
    if (!currentKeys.has(entry.id)) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }

  await tx.done;
};

// ---------------------------------------------------------------------------
// restoreProjectImages
// IDB에서 해당 projectId의 모든 이미지 Blob 로드 → 새 blob URL 생성
// ---------------------------------------------------------------------------

export interface RestoredImages {
  sceneImageMap: Map<string, Map<SceneImageField, string>>;
  thumbnailMap: Map<string, string>;
}

export const restoreProjectImages = async (
  projectId: string,
): Promise<RestoredImages> => {
  const result: RestoredImages = {
    sceneImageMap: new Map(),
    thumbnailMap: new Map(),
  };

  try {
    const db = await dbPromise;
    const projectBlobs = await db.getAllFromIndex(STORE, BLOB_PROJECT_ID_INDEX, projectId);

    for (const entry of projectBlobs) {
      const url = URL.createObjectURL(entry.blob);

      if (entry.id.startsWith(`${projectId}::thumb::`)) {
        result.thumbnailMap.set(entry.sceneId, url);
        continue;
      }

      const field = entry.field as SceneImageField;
      const sceneMap = result.sceneImageMap.get(entry.sceneId) || new Map<SceneImageField, string>();
      sceneMap.set(field, url);
      result.sceneImageMap.set(entry.sceneId, sceneMap);
    }
  } catch (e) {
    console.warn('[imageBlobStorageService] restoreProjectImages failed:', e);
  }

  return result;
};

export const mergeRestoredSceneImageFields = (
  scene: Scene,
  restoredFields?: ReadonlyMap<SceneImageField, string>,
): Scene => {
  let changed = false;
  const scenePatch: Partial<Record<SceneImageField, string>> = {};

  SCENE_IMAGE_FIELDS.forEach((field) => {
    const currentValue = scene[field];
    if (typeof currentValue !== 'string' || !currentValue.startsWith('blob:')) return;

    const restoredUrl = restoredFields?.get(field);
    if (!restoredUrl || restoredUrl === currentValue) return;

    scenePatch[field] = restoredUrl;
    changed = true;
  });

  return changed ? { ...scene, ...scenePatch } : scene;
};

export const mergeRestoredThumbnailImage = (
  thumbnail: Thumbnail,
  restoredUrl?: string,
): Thumbnail => {
  if (!thumbnail.imageUrl?.startsWith('blob:') || !restoredUrl || restoredUrl === thumbnail.imageUrl) {
    return thumbnail;
  }

  return { ...thumbnail, imageUrl: restoredUrl };
};

// ---------------------------------------------------------------------------
// deleteProjectImages
// 해당 프로젝트의 모든 이미지 Blob 삭제
// ---------------------------------------------------------------------------

export const deleteProjectImages = async (projectId: string): Promise<void> => {
  try {
    const db = await dbPromise;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const index = store.index(BLOB_PROJECT_ID_INDEX);
    let cursor = await index.openCursor(projectId);

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  } catch (e) {
    console.warn('[imageBlobStorageService] deleteProjectImages failed:', e);
  }
};

// ---------------------------------------------------------------------------
// Internal helper: blob URL → fetch → IDB put
// ---------------------------------------------------------------------------

async function fetchAndStore(
  db: Awaited<typeof dbPromise>,
  key: string,
  projectId: string,
  sceneId: string,
  field: SceneImageField,
  blobUrl: string,
): Promise<boolean> {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob URL: ${response.status}`);
    }
    const blob = await response.blob();

    const entry: SavedImageBlob = {
      id: key,
      projectId,
      sceneId,
      field,
      blob,
      createdAt: Date.now(),
    };

    await db.put(STORE, entry);
    return true;
  } catch (e) {
    console.warn(`[imageBlobStorageService] Failed to persist image ${key}:`, e);
    return false;
  }
}
