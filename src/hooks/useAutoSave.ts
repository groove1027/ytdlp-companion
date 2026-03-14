import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useCostStore } from '../stores/costStore';
import { saveProject, getStorageEstimate } from '../services/storageService';
import { showToast, useUIStore } from '../stores/uiStore';
import { logger } from '../services/LoggerService';
import type { Scene, ProjectConfig } from '../types';

const AUTO_SAVE_DEBOUNCE_MS = 5000;
const PERIODIC_SAVE_MS = 30_000; // 30초 주기 안전망

/**
 * 장면+설정의 빠른 핑거프린트 — 변경 감지용.
 * 기존 dirty check(장면 수 + 이미지/영상 카운트)보다 훨씬 포괄적:
 * 텍스트 편집, 오디오 추가, 비주얼 프롬프트 수정 등 모든 주요 변경을 감지.
 */
const computeFingerprint = (
  scenes: Scene[],
  config: ProjectConfig | null,
  thumbnailCount: number,
  projectTitle: string,
): string => {
  const sceneFp = scenes.map(s =>
    `${s.id}:${(s.scriptText || '').length}:${s.scriptText?.charCodeAt(0) || 0}:${s.imageUrl ? 'I' : '-'}:${s.videoUrl ? 'V' : '-'}:${s.audioUrl ? 'A' : '-'}:${(s.visualPrompt || '').length}:${s.audioDuration || 0}`
  ).join('|');
  const cfgFp = config
    ? `${config.mode}:${config.videoFormat}:${config.aspectRatio}:${config.imageModel}:${(config.script || '').length}:${config.mergedAudioUrl ? 'M' : '-'}:ppt${config.pptSlides?.length || 0}:${config.pptContentStyleId || '-'}:${config.pptDesignStyleId || '-'}`
    : 'null';
  return `${scenes.length}::${sceneFp}::${cfgFp}::${thumbnailCount}::${projectTitle}`;
};

/** 즉시 저장 (beforeunload 긴급 저장 — best-effort, 비동기이므로 완료 보장 안 됨) */
const flushSave = () => {
  const { currentProjectId, config, scenes, thumbnails, projectTitle } = useProjectStore.getState();
  const { costStats } = useCostStore.getState();
  if (!currentProjectId || !config) return;

  try {
    const dbReq = indexedDB.open('ai-storyboard-v2');
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      try {
        const tx = db.transaction(['projects'], 'readwrite');
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
      } catch (e) { logger.trackSwallowedError('useAutoSave:flushSave/transaction', e); }
    };
  } catch (e) { logger.trackSwallowedError('useAutoSave:flushSave/indexedDB', e); }
};

export const useAutoSave = () => {
  const lastFingerprintRef = useRef<string>('');

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let periodicTimer: ReturnType<typeof setInterval> | null = null;

    /** 핵심 저장 로직 — fingerprint 비교 후 변경분만 저장 */
    const doSave = async () => {
      const { currentProjectId, config, scenes, thumbnails, projectTitle } = useProjectStore.getState();
      const { costStats } = useCostStore.getState();

      if (!currentProjectId || !config) return;

      // Fingerprint 기반 dirty check — 실제 변경이 없으면 저장 스킵
      const fingerprint = computeFingerprint(scenes, config, thumbnails.length, projectTitle);
      if (fingerprint === lastFingerprintRef.current) return;

      try {
        await saveProject({
          id: currentProjectId,
          title: projectTitle || config.script?.substring(0, 30) || 'Untitled Project',
          config,
          scenes,
          thumbnails,
          fullNarrationText: scenes.map((s) => s.scriptText).join(' ').substring(0, 500),
          lastModified: Date.now(),
          costStats,
        });

        lastFingerprintRef.current = fingerprint;

        // UI 인디케이터 업데이트
        useUIStore.getState().setLastAutoSavedAt(Date.now());

        // 오디오 blob을 IndexedDB에 영속화 (fire-and-forget)
        try {
          import('../services/audioStorageService').then(({ persistProjectAudio }) => {
            persistProjectAudio(currentProjectId, scenes, config.mergedAudioUrl).catch((e) => { logger.trackSwallowedError('useAutoSave:persistProjectAudio', e); });
          });
        } catch (e) { logger.trackSwallowedError('useAutoSave:doSave/audioStorage', e); }

        // 저장소 용량 사전 경고 (90% 이상)
        try {
          const estimate = await getStorageEstimate();
          if (estimate.percent >= 90) {
            showToast(`저장소 ${estimate.percent}% 사용 중 — 오래된 프로젝트를 삭제해주세요`, 6000);
          }
        } catch (e) { logger.trackSwallowedError('useAutoSave:doSave/storageEstimate', e); }
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'QUOTA_EXCEEDED') {
          console.warn('[AutoSave] Storage quota exceeded — auto-save skipped.');
          showToast('저장소 용량 초과! 오래된 프로젝트를 삭제해주세요.', 8000);
        } else {
          console.error('[AutoSave] Unexpected save error:', err);
          showToast('프로젝트 저장에 실패했습니다. 브라우저 저장소를 확인해주세요.', 6000);
        }
      }
    };

    // Store 변경 시 5초 디바운스 저장
    const scheduleSave = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doSave, AUTO_SAVE_DEBOUNCE_MS);
    };

    // [FIX #148] visibilitychange: 탭 숨김/최소화 시 즉시 저장
    // beforeunload보다 훨씬 신뢰성 높음 — 비동기 작업 완료 가능
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        doSave();
      }
    };

    // beforeunload: 페이지 떠나기 전 긴급 저장 (best-effort 백업)
    const handleBeforeUnload = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      flushSave();
    };

    // [FIX #148] 30초 주기 안전망 — dirty check 있으므로 변경 없으면 무시됨
    periodicTimer = setInterval(doSave, PERIODIC_SAVE_MS);

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const unsub1 = useProjectStore.subscribe(scheduleSave);
    const unsub2 = useCostStore.subscribe(scheduleSave);

    return () => {
      unsub1();
      unsub2();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (periodicTimer) clearInterval(periodicTimer);
    };
  }, []);
};
