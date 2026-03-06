
import { dbPromise, SavedAudioBlob } from './storageService';
import type { Scene } from '../types';

const STORE = 'audio-blobs' as const;

// ---------------------------------------------------------------------------
// persistProjectAudio
// scenes에서 blob: URL인 audioUrl을 찾아 fetch → Blob → IDB 저장
// mergedAudioUrl도 같은 방식으로 저장
// ---------------------------------------------------------------------------

export const persistProjectAudio = async (
  projectId: string,
  scenes: Scene[],
  mergedAudioUrl?: string,
): Promise<void> => {
  const db = await dbPromise;

  const tasks: Promise<void>[] = [];

  // 개별 장면 오디오
  for (const scene of scenes) {
    if (scene.audioUrl?.startsWith('blob:')) {
      const key = `${projectId}::scene::${scene.id}`;
      tasks.push(
        fetchAndStore(db, key, projectId, scene.audioUrl),
      );
    }
  }

  // 병합 오디오
  if (mergedAudioUrl?.startsWith('blob:')) {
    const key = `${projectId}::merged`;
    tasks.push(
      fetchAndStore(db, key, projectId, mergedAudioUrl),
    );
  }

  await Promise.allSettled(tasks);
};

// ---------------------------------------------------------------------------
// restoreProjectAudio
// IDB에서 해당 projectId의 모든 오디오 Blob 로드 → 새 blob URL 생성
// ---------------------------------------------------------------------------

export interface RestoredAudio {
  sceneAudioMap: Map<string, string>;  // sceneId → new blob URL
  mergedUrl: string | null;
}

export const restoreProjectAudio = async (
  projectId: string,
): Promise<RestoredAudio> => {
  const result: RestoredAudio = { sceneAudioMap: new Map(), mergedUrl: null };

  try {
    const db = await dbPromise;
    const all = await db.getAll(STORE);
    const projectBlobs = all.filter((b) => b.projectId === projectId);

    for (const entry of projectBlobs) {
      const url = URL.createObjectURL(entry.blob);

      if (entry.id === `${projectId}::merged`) {
        result.mergedUrl = url;
      } else {
        // key format: `${projectId}::scene::${sceneId}`
        const sceneId = entry.id.replace(`${projectId}::scene::`, '');
        result.sceneAudioMap.set(sceneId, url);
      }
    }
  } catch (e) {
    console.warn('[audioStorageService] restoreProjectAudio failed:', e);
  }

  return result;
};

// ---------------------------------------------------------------------------
// deleteProjectAudio
// 해당 프로젝트의 모든 오디오 Blob 삭제
// ---------------------------------------------------------------------------

export const deleteProjectAudio = async (projectId: string): Promise<void> => {
  try {
    const db = await dbPromise;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const all = await store.getAll();

    for (const entry of all) {
      if (entry.projectId === projectId) {
        store.delete(entry.id);
      }
    }

    await tx.done;
  } catch (e) {
    console.warn('[audioStorageService] deleteProjectAudio failed:', e);
  }
};

// ---------------------------------------------------------------------------
// Internal helper: blob URL → fetch → IDB put
// ---------------------------------------------------------------------------

async function fetchAndStore(
  db: Awaited<typeof dbPromise>,
  key: string,
  projectId: string,
  blobUrl: string,
): Promise<void> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();

    const entry: SavedAudioBlob = {
      id: key,
      projectId,
      blob,
      createdAt: Date.now(),
    };

    await db.put(STORE, entry);
  } catch (e) {
    console.warn(`[audioStorageService] Failed to persist audio ${key}:`, e);
  }
}
