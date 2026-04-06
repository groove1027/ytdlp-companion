import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scene, Thumbnail } from '../../types';
import type { SceneImageField } from '../imageBlobStorageService';

interface StoredImageBlob {
  id: string;
  projectId: string;
  sceneId: string;
  field: string;
  blob: Blob;
  createdAt: number;
}

const { blobEntries, fakeDb } = vi.hoisted(() => {
  const blobEntries = new Map<string, StoredImageBlob>();
  const buildCursor = (projectId: string) => {
    const matchingIds = Array.from(blobEntries.values())
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.id);
    let index = 0;

    const createCursor = (): {
      value: StoredImageBlob;
      delete: ReturnType<typeof vi.fn>;
      continue: ReturnType<typeof vi.fn>;
    } | null => {
      const currentId = matchingIds[index];
      if (!currentId) return null;
      const currentEntry = blobEntries.get(currentId);
      if (!currentEntry) return null;

      return {
        value: currentEntry,
        delete: vi.fn(async () => {
          blobEntries.delete(currentId);
        }),
        continue: vi.fn(async () => {
          index += 1;
          return createCursor();
        }),
      };
    };

    return createCursor();
  };
  const fakeDb = {
    put: vi.fn(async (_storeName: string, entry: StoredImageBlob) => {
      blobEntries.set(entry.id, entry);
    }),
    getAllFromIndex: vi.fn(async (_storeName: string, _indexName: string, projectId: string) =>
      Array.from(blobEntries.values()).filter((entry) => entry.projectId === projectId)),
    transaction: vi.fn((_storeName: string, _mode: string) => {
      const store = {
        index: vi.fn(() => ({
          openCursor: vi.fn(async (projectId: string) => buildCursor(projectId)),
        })),
        delete: vi.fn((id: string) => {
          blobEntries.delete(id);
        }),
      };

      return {
        objectStore: vi.fn(() => store),
        done: Promise.resolve(),
      };
    }),
  };

  return { blobEntries, fakeDb };
});

vi.mock('../storageService', () => ({
  BLOB_PROJECT_ID_INDEX: 'projectId',
  dbPromise: Promise.resolve(fakeDb),
}));

const {
  applyImageBlobPersistRetryResult,
  collectProjectImageBlobUrls,
  deleteProjectImages,
  MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
  mergeRestoredSceneImageFields,
  mergeRestoredThumbnailImage,
  persistProjectImages,
  restoreProjectImages,
  syncImageBlobRetryCounts,
} = await import('../imageBlobStorageService');

const createScene = (overrides: Partial<Scene>): Scene => ({
  id: overrides.id || 'scene-1',
  scriptText: overrides.scriptText || '',
  visualPrompt: overrides.visualPrompt || 'prompt',
  visualDescriptionKO: overrides.visualDescriptionKO || '',
  characterPresent: overrides.characterPresent ?? false,
  isGeneratingImage: overrides.isGeneratingImage ?? false,
  isGeneratingVideo: overrides.isGeneratingVideo ?? false,
  ...overrides,
});

const createThumbnail = (overrides: Partial<Thumbnail>): Thumbnail => ({
  id: overrides.id || 'thumb-1',
  textOverlay: overrides.textOverlay || '',
  visualDescription: overrides.visualDescription || '',
  isGenerating: overrides.isGenerating ?? false,
  format: overrides.format || 'short',
  ...overrides,
});

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let blobUrlCounter = 0;
let blobRegistry: Map<string, Blob>;

const readUrlText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  return response.text();
};

beforeEach(() => {
  blobEntries.clear();
  blobRegistry = new Map<string, Blob>();
  blobUrlCounter = 0;

  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const blob = blobRegistry.get(url);
    if (!blob) {
      throw new Error(`Unknown blob URL: ${url}`);
    }
    return new Response(blob);
  }) as typeof fetch;

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test:${++blobUrlCounter}`;
    blobRegistry.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    blobRegistry.delete(url);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.clearAllMocks();
});

describe('imageBlobStorageService', () => {
  it('persists and restores blob-backed scene image fields', async () => {
    const sceneImageBlob = new Blob(['scene-image'], { type: 'image/png' });
    const previousSceneBlob = new Blob(['previous-scene-image'], { type: 'image/png' });
    const referenceBlob = new Blob(['reference-image'], { type: 'image/png' });
    const sceneImageUrl = URL.createObjectURL(sceneImageBlob);
    const previousSceneImageUrl = URL.createObjectURL(previousSceneBlob);
    const referenceImageUrl = URL.createObjectURL(referenceBlob);

    const scenes = [
      createScene({
        id: 'scene-a',
        imageUrl: sceneImageUrl,
        previousSceneImageUrl,
        referenceImage: referenceImageUrl,
      }),
      createScene({
        id: 'scene-b',
        imageUrl: 'https://example.com/permanent.png',
      }),
    ];

    await persistProjectImages('project-scenes', scenes, []);

    expect(blobEntries.size).toBe(3);
    expect(blobEntries.has('project-scenes::scene::scene-a::imageUrl')).toBe(true);
    expect(blobEntries.has('project-scenes::scene::scene-a::previousSceneImageUrl')).toBe(true);
    expect(blobEntries.has('project-scenes::scene::scene-a::referenceImage')).toBe(true);

    const restored = await restoreProjectImages('project-scenes');
    expect(fakeDb.getAllFromIndex).toHaveBeenCalledWith('image-blobs', 'projectId', 'project-scenes');
    const restoredSceneA = restored.sceneImageMap.get('scene-a');

    expect(restoredSceneA?.get('imageUrl')).toBeTruthy();
    expect(restoredSceneA?.get('previousSceneImageUrl')).toBeTruthy();
    expect(restoredSceneA?.get('referenceImage')).toBeTruthy();
    expect(restoredSceneA?.get('imageUrl')).not.toBe(sceneImageUrl);
    expect(restoredSceneA?.get('previousSceneImageUrl')).not.toBe(previousSceneImageUrl);
    expect(restoredSceneA?.get('referenceImage')).not.toBe(referenceImageUrl);

    expect(await readUrlText(restoredSceneA!.get('imageUrl')!)).toBe('scene-image');
    expect(await readUrlText(restoredSceneA!.get('previousSceneImageUrl')!)).toBe('previous-scene-image');
    expect(await readUrlText(restoredSceneA!.get('referenceImage')!)).toBe('reference-image');
    expect(restored.sceneImageMap.has('scene-b')).toBe(false);
  });

  it('persists and restores thumbnail blob URLs separately from scene images', async () => {
    const thumbnailBlob = new Blob(['thumb-image'], { type: 'image/jpeg' });
    const thumbUrl = URL.createObjectURL(thumbnailBlob);

    const thumbnails = [
      createThumbnail({
        id: 'thumb-a',
        imageUrl: thumbUrl,
      }),
      createThumbnail({
        id: 'thumb-b',
        imageUrl: 'https://example.com/thumb.png',
      }),
    ];

    await persistProjectImages('project-thumbs', [], thumbnails);

    expect(blobEntries.size).toBe(1);
    expect(blobEntries.has('project-thumbs::thumb::thumb-a')).toBe(true);

    const restored = await restoreProjectImages('project-thumbs');
    const restoredThumbUrl = restored.thumbnailMap.get('thumb-a');

    expect(restoredThumbUrl).toBeTruthy();
    expect(restoredThumbUrl).not.toBe(thumbUrl);
    expect(await readUrlText(restoredThumbUrl!)).toBe('thumb-image');
    expect(restored.thumbnailMap.has('thumb-b')).toBe(false);
  });

  it('reports failed image persistence so auto-save can retry on the next cycle', async () => {
    const result = await persistProjectImages('project-failures', [
      createScene({
        id: 'scene-fail',
        imageUrl: 'blob:test:missing-scene-image',
      }),
    ], []);

    expect(result).toMatchObject({
      attempted: 1,
      persisted: 0,
      failed: 1,
      allSucceeded: false,
    });
    expect(result.failedKeys).toEqual(['project-failures::scene::scene-fail::imageUrl']);
    expect(result.failedBlobUrls).toEqual(['blob:test:missing-scene-image']);
    expect(blobEntries.size).toBe(0);
  });

  it('restores only blobs for the requested projectId', async () => {
    blobEntries.set('project-a::scene::scene-a::imageUrl', {
      id: 'project-a::scene::scene-a::imageUrl',
      projectId: 'project-a',
      sceneId: 'scene-a',
      field: 'imageUrl',
      blob: new Blob(['project-a-image'], { type: 'image/png' }),
      createdAt: Date.now(),
    });
    blobEntries.set('project-b::scene::scene-b::imageUrl', {
      id: 'project-b::scene::scene-b::imageUrl',
      projectId: 'project-b',
      sceneId: 'scene-b',
      field: 'imageUrl',
      blob: new Blob(['project-b-image'], { type: 'image/png' }),
      createdAt: Date.now(),
    });

    const restored = await restoreProjectImages('project-a');

    expect(fakeDb.getAllFromIndex).toHaveBeenCalledWith('image-blobs', 'projectId', 'project-a');
    expect(restored.sceneImageMap.has('scene-a')).toBe(true);
    expect(restored.sceneImageMap.has('scene-b')).toBe(false);
    expect(await readUrlText(restored.sceneImageMap.get('scene-a')!.get('imageUrl')!)).toBe('project-a-image');
  });

  it('keeps current blob URLs when a restored image is missing', () => {
    const scene = createScene({
      id: 'scene-keep-current',
      imageUrl: 'blob:test:scene-current',
      referenceImage: 'blob:test:scene-reference-current',
    });
    const restoredScene = mergeRestoredSceneImageFields(
      scene,
      new Map<SceneImageField, string>([
        ['referenceImage', 'blob:test:scene-reference-restored'],
      ]),
    );

    expect(restoredScene.imageUrl).toBe('blob:test:scene-current');
    expect(restoredScene.referenceImage).toBe('blob:test:scene-reference-restored');

    const thumbnail = createThumbnail({
      id: 'thumb-keep-current',
      imageUrl: 'blob:test:thumb-current',
    });

    expect(mergeRestoredThumbnailImage(thumbnail, undefined)).toBe(thumbnail);
  });

  it('deletes only the target project image blobs', async () => {
    const blobA = new Blob(['project-a'], { type: 'image/png' });
    const blobB = new Blob(['project-b'], { type: 'image/png' });

    await persistProjectImages('project-a', [
      createScene({ id: 'scene-a', imageUrl: URL.createObjectURL(blobA) }),
    ], []);
    await persistProjectImages('project-b', [
      createScene({ id: 'scene-b', imageUrl: URL.createObjectURL(blobB) }),
    ], []);

    expect(blobEntries.size).toBe(2);

    await deleteProjectImages('project-a');

    expect(blobEntries.size).toBe(1);
    expect(blobEntries.has('project-b::scene::scene-b::imageUrl')).toBe(true);
    expect(blobEntries.has('project-a::scene::scene-a::imageUrl')).toBe(false);
  });

  it('prunes stale image blob rows when a field is replaced with a hosted URL', async () => {
    const blobA = new Blob(['project-a-image'], { type: 'image/png' });
    const blobThumb = new Blob(['project-a-thumb'], { type: 'image/png' });
    const blobB = new Blob(['project-b-image'], { type: 'image/png' });

    await persistProjectImages('project-a', [
      createScene({ id: 'scene-a', imageUrl: URL.createObjectURL(blobA) }),
    ], [
      createThumbnail({ id: 'thumb-a', imageUrl: URL.createObjectURL(blobThumb) }),
    ]);
    await persistProjectImages('project-b', [
      createScene({ id: 'scene-b', imageUrl: URL.createObjectURL(blobB) }),
    ], []);

    expect(blobEntries.size).toBe(3);

    await persistProjectImages('project-a', [
      createScene({ id: 'scene-a', imageUrl: 'https://example.com/final.png' }),
    ], [
      createThumbnail({ id: 'thumb-a', imageUrl: 'https://example.com/thumb.png' }),
    ]);

    expect(blobEntries.size).toBe(1);
    expect(blobEntries.has('project-a::scene::scene-a::imageUrl')).toBe(false);
    expect(blobEntries.has('project-a::thumb::thumb-a')).toBe(false);
    expect(blobEntries.has('project-b::scene::scene-b::imageUrl')).toBe(true);
  });

  it('caps repeated autosave retries per blob URL and drops stale retry state', () => {
    const blobUrlA = 'blob:test:retry-a';
    const blobUrlB = 'blob:test:retry-b';
    const retryCounts = new Map<string, number>([
      ['blob:test:stale', MAX_AUTOSAVE_IMAGE_BLOB_RETRIES],
    ]);

    const activeBlobUrls = collectProjectImageBlobUrls(
      [createScene({ id: 'scene-a', imageUrl: blobUrlA })],
      [createThumbnail({ id: 'thumb-b', imageUrl: blobUrlB })],
    );

    expect(syncImageBlobRetryCounts(retryCounts, activeBlobUrls)).toEqual([]);
    expect(retryCounts.has('blob:test:stale')).toBe(false);

    let retryResult = applyImageBlobPersistRetryResult(
      retryCounts,
      [blobUrlA],
      [blobUrlA],
      MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
    );
    expect(retryResult.retryableBlobUrls).toEqual([blobUrlA]);
    expect(retryResult.newlyAbandonedBlobUrls).toEqual([]);

    retryResult = applyImageBlobPersistRetryResult(
      retryCounts,
      [blobUrlA],
      [blobUrlA],
      MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
    );
    expect(retryResult.retryableBlobUrls).toEqual([blobUrlA]);
    expect(retryResult.newlyAbandonedBlobUrls).toEqual([]);

    retryResult = applyImageBlobPersistRetryResult(
      retryCounts,
      [blobUrlA],
      [blobUrlA],
      MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
    );
    expect(retryResult.retryableBlobUrls).toEqual([]);
    expect(retryResult.newlyAbandonedBlobUrls).toEqual([blobUrlA]);
    expect(syncImageBlobRetryCounts(retryCounts, activeBlobUrls)).toEqual([blobUrlA]);

    retryResult = applyImageBlobPersistRetryResult(
      retryCounts,
      [blobUrlB],
      [],
      MAX_AUTOSAVE_IMAGE_BLOB_RETRIES,
    );
    expect(retryResult.retryableBlobUrls).toEqual([]);
    expect(retryCounts.has(blobUrlB)).toBe(false);
  });
});
