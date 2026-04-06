import { describe, expect, it, vi } from 'vitest';

const { deleteDBMock, openDBMock } = vi.hoisted(() => ({
  deleteDBMock: vi.fn(),
  openDBMock: vi.fn(async () => ({})),
}));

vi.mock('idb', () => ({
  deleteDB: deleteDBMock,
  openDB: openDBMock,
}));

await import('../storageService');

const createNameList = (names: string[]) => ({
  contains: (name: string) => names.includes(name),
});

describe('storageService schema migration', () => {
  it('uses DB version 10 and adds blob projectId indexes during v9 migration without recreating stores', () => {
    const openDbArgs = openDBMock.mock.calls[0] as unknown as [
      string,
      number,
      {
        upgrade: (
          db: {
            createObjectStore: ReturnType<typeof vi.fn>;
            objectStoreNames: { contains: (name: string) => boolean };
          },
          oldVersion: number,
          newVersion: number,
          transaction: {
            objectStore: ReturnType<typeof vi.fn>;
          },
        ) => void;
      },
    ] | undefined;

    expect(openDbArgs).toBeDefined();
    expect(openDbArgs?.[0]).toBe('ai-storyboard-v2');
    expect(openDbArgs?.[1]).toBe(10);

    const upgrade = openDbArgs?.[2]?.upgrade;

    expect(upgrade).toBeTypeOf('function');

    const audioStore = {
      indexNames: createNameList([]),
      createIndex: vi.fn(),
    };
    const imageStore = {
      indexNames: createNameList([]),
      createIndex: vi.fn(),
    };
    const db = {
      createObjectStore: vi.fn(),
      objectStoreNames: createNameList([
        'projects',
        'project_summaries',
        'characters',
        'music',
        'benchmarks',
        'audio-blobs',
        'image-blobs',
        'video-analysis',
      ]),
    };
    const transaction = {
      objectStore: vi.fn((storeName: string) => {
        if (storeName === 'audio-blobs') return audioStore;
        if (storeName === 'image-blobs') return imageStore;
        throw new Error(`Unexpected store ${storeName}`);
      }),
    };

    upgrade(db, 9, 10, transaction);

    expect(db.createObjectStore).not.toHaveBeenCalledWith('audio-blobs', expect.anything());
    expect(db.createObjectStore).not.toHaveBeenCalledWith('image-blobs', expect.anything());
    expect(audioStore.createIndex).toHaveBeenCalledWith('projectId', 'projectId');
    expect(imageStore.createIndex).toHaveBeenCalledWith('projectId', 'projectId');
  });
});
