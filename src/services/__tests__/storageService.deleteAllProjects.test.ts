import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clearedStores, fakeDb, openDBMock } = vi.hoisted(() => {
  const clearedStores: string[] = [];
  const fakeDb = {
    transaction: vi.fn((storeNames: string[] | string, _mode: string) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      return {
        objectStore: vi.fn((storeName: string) => {
          if (!names.includes(storeName)) {
            throw new Error(`Unexpected store requested: ${storeName}`);
          }

          return {
            clear: vi.fn(() => {
              clearedStores.push(storeName);
            }),
          };
        }),
        done: Promise.resolve(),
      };
    }),
  };

  return {
    clearedStores,
    fakeDb,
    openDBMock: vi.fn(async () => fakeDb),
  };
});

vi.mock('idb', () => ({
  openDB: openDBMock,
  deleteDB: vi.fn(),
}));

const { deleteAllProjects } = await import('../storageService');

beforeEach(() => {
  clearedStores.length = 0;
  fakeDb.transaction.mockClear();
  openDBMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('storageService.deleteAllProjects', () => {
  it('clears projects, summaries, audio blobs, and image blobs together', async () => {
    await deleteAllProjects();

    expect(fakeDb.transaction).toHaveBeenCalledWith(
      ['projects', 'project_summaries', 'audio-blobs', 'image-blobs'],
      'readwrite',
    );
    expect(clearedStores).toEqual([
      'projects',
      'project_summaries',
      'audio-blobs',
      'image-blobs',
    ]);
  });
});
