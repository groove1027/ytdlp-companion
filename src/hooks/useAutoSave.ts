import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useCostStore } from '../stores/costStore';
import { saveProject, getStorageEstimate } from '../services/storageService';
import { showToast } from '../stores/uiStore';

const AUTO_SAVE_DEBOUNCE_MS = 5000;

/** 즉시 저장 (beforeunload 등 긴급 저장용) */
const flushSave = () => {
  const { currentProjectId, config, scenes, thumbnails, projectTitle } = useProjectStore.getState();
  const { costStats } = useCostStore.getState();
  if (!currentProjectId || !config) return;

  try {
    // navigator.sendBeacon은 Blob만 지원하므로 IndexedDB 직접 접근
    const dbReq = indexedDB.open('ai-storyboard-v2');
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      try {
        const tx = db.transaction(['projects', 'project_summaries'], 'readwrite');
        tx.objectStore('projects').put({
          id: currentProjectId,
          title: projectTitle || config.script?.substring(0, 30) || 'Untitled Project',
          config,
          scenes,
          thumbnails,
          fullNarrationText: scenes.map((s) => s.scriptText).join(' ').substring(0, 500),
          lastModified: Date.now(),
          costStats,
        });
        // summary는 생략 (긴급 저장이므로 projects만 확보)
      } catch { /* beforeunload에서는 에러 무시 */ }
    };
  } catch { /* 최후 수단 — 실패해도 무방 */ }
};

export const useAutoSave = () => {
  const lastSavedRef = useRef<{ scenesLength: number; configRef: object | null; completedImages: number; completedVideos: number; thumbnailCount: number }>({
    scenesLength: 0,
    configRef: null,
    completedImages: 0,
    completedVideos: 0,
    thumbnailCount: 0,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleSave = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const { currentProjectId, config, scenes, thumbnails, projectTitle } = useProjectStore.getState();
        const { costStats } = useCostStore.getState();

        if (!currentProjectId || !config) return;

        // Dirty check: 장면 수, config, 이미지/영상 완료 수, 썸네일 수 변경 시에만 저장
        const completedImages = scenes.filter(s => s.imageUrl).length;
        const completedVideos = scenes.filter(s => s.videoUrl).length;
        const thumbnailCount = thumbnails.length;
        const prev = lastSavedRef.current;
        if (
          prev.scenesLength === scenes.length &&
          prev.configRef === config &&
          prev.completedImages === completedImages &&
          prev.completedVideos === completedVideos &&
          prev.thumbnailCount === thumbnailCount
        ) {
          return;
        }

        try {
          await saveProject({
            id: currentProjectId,
            title: projectTitle || config.script.substring(0, 30) || 'Untitled Project',
            config,
            scenes,
            thumbnails,
            fullNarrationText: scenes.map((s) => s.scriptText).join(' ').substring(0, 500),
            lastModified: Date.now(),
            costStats,
          });

          // Update last-saved snapshot on success
          lastSavedRef.current = { scenesLength: scenes.length, configRef: config, completedImages, completedVideos, thumbnailCount };

          // 오디오 blob을 IndexedDB에 영속화 (fire-and-forget)
          try {
            import('../services/audioStorageService').then(({ persistProjectAudio }) => {
              persistProjectAudio(currentProjectId, scenes, config.mergedAudioUrl).catch(() => {});
            });
          } catch { /* 오디오 저장 실패해도 프로젝트 저장은 성공 */ }

          // 저장소 용량 사전 경고 (90% 이상)
          try {
            const estimate = await getStorageEstimate();
            if (estimate.percent >= 90) {
              showToast(`저장소 ${estimate.percent}% 사용 중 — 오래된 프로젝트를 삭제해주세요`, 6000);
            }
          } catch { /* ignore estimate errors */ }
        } catch (err: unknown) {
          if (err instanceof Error && err.message === 'QUOTA_EXCEEDED') {
            console.warn('[AutoSave] Storage quota exceeded — auto-save skipped.');
            showToast('저장소 용량 초과! 오래된 프로젝트를 삭제해주세요.', 8000);
          } else {
            console.error('[AutoSave] Unexpected save error:', err);
            showToast('프로젝트 저장에 실패했습니다. 브라우저 저장소를 확인해주세요.', 6000);
          }
        }
      }, AUTO_SAVE_DEBOUNCE_MS);
    };

    // beforeunload: 페이지 떠나기 전 긴급 저장
    const handleBeforeUnload = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      flushSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    const unsub1 = useProjectStore.subscribe(scheduleSave);
    const unsub2 = useCostStore.subscribe(scheduleSave);

    return () => {
      unsub1();
      unsub2();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
};
