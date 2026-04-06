import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Scene } from '../../types';

interface StoredAudioBlob {
  id: string;
  projectId: string;
  blob: Blob;
  createdAt: number;
}

const { audioEntries, fakeDb } = vi.hoisted(() => {
  const audioEntries = new Map<string, StoredAudioBlob>();
  const buildCursor = (projectId: string) => {
    const matchingIds = Array.from(audioEntries.values())
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.id);
    let index = 0;

    const createCursor = (): {
      delete: ReturnType<typeof vi.fn>;
      continue: ReturnType<typeof vi.fn>;
    } | null => {
      const currentId = matchingIds[index];
      if (!currentId) return null;

      return {
        delete: vi.fn(async () => {
          audioEntries.delete(currentId);
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
    put: vi.fn(async (_storeName: string, entry: StoredAudioBlob) => {
      audioEntries.set(entry.id, entry);
    }),
    getAllFromIndex: vi.fn(async (_storeName: string, _indexName: string, projectId: string) =>
      Array.from(audioEntries.values()).filter((entry) => entry.projectId === projectId)),
    transaction: vi.fn((_storeName: string, _mode: string) => {
      const store = {
        index: vi.fn(() => ({
          openCursor: vi.fn(async (projectId: string) => buildCursor(projectId)),
        })),
      };

      return {
        objectStore: vi.fn(() => store),
        done: Promise.resolve(),
      };
    }),
  };

  return { audioEntries, fakeDb };
});

vi.mock('../storageService', () => ({
  BLOB_PROJECT_ID_INDEX: 'projectId',
  dbPromise: Promise.resolve(fakeDb),
}));

const {
  deleteProjectAudio,
  persistProjectAudio,
  restoreProjectAudio,
} = await import('../audioStorageService');

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let blobUrlCounter = 0;
let blobRegistry: Map<string, Blob>;

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

const readUrlText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  return response.text();
};

beforeEach(() => {
  audioEntries.clear();
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

describe('audioStorageService', () => {
  it('restores only the requested project audio blobs via projectId index', async () => {
    const blobA = new Blob(['audio-a'], { type: 'audio/wav' });
    const blobB = new Blob(['audio-b'], { type: 'audio/wav' });

    await persistProjectAudio('project-a', [
      createScene({ id: 'scene-a', audioUrl: URL.createObjectURL(blobA) }),
    ]);
    await persistProjectAudio('project-b', [
      createScene({ id: 'scene-b', audioUrl: URL.createObjectURL(blobB) }),
    ]);

    const restored = await restoreProjectAudio('project-a');

    expect(fakeDb.getAllFromIndex).toHaveBeenCalledWith('audio-blobs', 'projectId', 'project-a');
    expect(restored.sceneAudioMap.has('scene-a')).toBe(true);
    expect(restored.sceneAudioMap.has('scene-b')).toBe(false);
    expect(await readUrlText(restored.sceneAudioMap.get('scene-a')!)).toBe('audio-a');
  });

  it('deletes only the target project audio blobs via cursor', async () => {
    const blobA = new Blob(['audio-a'], { type: 'audio/wav' });
    const blobB = new Blob(['audio-b'], { type: 'audio/wav' });

    await persistProjectAudio('project-a', [
      createScene({ id: 'scene-a', audioUrl: URL.createObjectURL(blobA) }),
    ]);
    await persistProjectAudio('project-b', [
      createScene({ id: 'scene-b', audioUrl: URL.createObjectURL(blobB) }),
    ]);

    expect(audioEntries.size).toBe(2);

    await deleteProjectAudio('project-a');

    expect(audioEntries.size).toBe(1);
    expect(audioEntries.has('project-a::scene::scene-a')).toBe(false);
    expect(audioEntries.has('project-b::scene::scene-b')).toBe(true);
  });
});
