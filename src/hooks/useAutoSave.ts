import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useCostStore } from '../stores/costStore';
import { useEditRoomStore } from '../stores/editRoomStore';
import { getLatestScriptWriterText, getScriptWriterDraftSnapshot, useScriptWriterStore } from '../stores/scriptWriterStore';
import { saveProject, getStorageEstimate } from '../services/storageService';
import { showToast, useUIStore } from '../stores/uiStore';
import { logger } from '../services/LoggerService';
import { scheduleSyncToCloud } from '../services/syncService';
import type { Scene, ProjectConfig, ProjectData, ScriptWriterDraftState } from '../types';

const AUTO_SAVE_DEBOUNCE_MS = 5000;
const PERIODIC_SAVE_MS = 30_000; // 30초 주기 안전망

const buildStringFingerprint = (value?: string | null): string => {
  const normalized = value ?? '';
  if (!normalized) return '0:0:0:0';
  const middleIndex = Math.floor(normalized.length / 2);
  return [
    normalized.length,
    normalized.charCodeAt(0) || 0,
    normalized.charCodeAt(middleIndex) || 0,
    normalized.charCodeAt(normalized.length - 1) || 0,
  ].join(':');
};

const buildStringArrayFingerprint = (values?: string[] | null): string =>
  values?.map((value, index) => `${index}-${buildStringFingerprint(value)}`).join(',') || '';

const buildCharacterFingerprint = (config: ProjectConfig | null): string =>
  config?.characters?.map((character) => {
    const imageSource = character.imageUrl || character.imageBase64 || '';
    return [
      character.id,
      buildStringFingerprint(character.label),
      buildStringFingerprint(imageSource),
      buildStringFingerprint(character.analysisStyle),
      buildStringFingerprint(character.analysisCharacter),
      buildStringFingerprint(character.analysisResult),
    ].join(':');
  }).join('|') || '';

const buildConfigFingerprint = (config: ProjectConfig | null): string => {
  if (!config) return 'null';

  const rawTranscriptSegments = config.rawUploadedTranscriptSegments;
  const rawTranscriptLast = rawTranscriptSegments && rawTranscriptSegments.length > 0
    ? rawTranscriptSegments[rawTranscriptSegments.length - 1]
    : undefined;
  const pptFingerprint = config.pptSlides?.map((slide) => [
    slide.slideNumber,
    buildStringFingerprint(slide.title),
    buildStringFingerprint(slide.body),
    slide.keyPoints.length,
    buildStringFingerprint(slide.visualHint),
    buildStringFingerprint(slide.imageUrl),
  ].join(':')).join('|') || '';

  return [
    config.mode,
    config.videoFormat,
    config.aspectRatio,
    config.imageModel,
    config.videoModel || '',
    config.voice || '',
    buildStringFingerprint(config.script),
    buildStringFingerprint(config.selectedVisualStyle),
    buildStringFingerprint(config.atmosphere),
    buildStringFingerprint(config.customStyleNote),
    buildStringFingerprint(config.referenceDialogue),
    buildStringFingerprint(config.detectedStyleDescription),
    String(config.enableWebSearch ?? ''),
    String(config.isMultiCharacter ?? ''),
    String(config.dialogueMode ?? ''),
    String(config.dialogueTone || ''),
    String(config.targetSceneCount ?? ''),
    String(config.smartSplit ?? ''),
    String(config.allowInfographics ?? ''),
    String(config.suppressText ?? ''),
    String(config.isMixedMedia ?? ''),
    String(config.enableGoogleReference ?? ''),
    String(config.enableVideoReference ?? ''),
    String(config.longFormSplitType || ''),
    buildStringArrayFingerprint(config.styleReferenceImages),
    buildStringFingerprint(config.mergedAudioUrl),
    String(config.narrationSource || ''),
    Math.round(config.sourceNarrationDurationSec || 0),
    Math.round(config.transcriptDurationSec || 0),
    `rt${rawTranscriptSegments?.length || 0}`,
    Math.round(rawTranscriptSegments?.[0]?.startTime || 0),
    Math.round(rawTranscriptLast?.endTime || 0),
    `ppt${config.pptSlides?.length || 0}`,
    buildStringFingerprint(config.pptContentStyleId),
    buildStringFingerprint(config.pptDesignStyleId),
    buildStringFingerprint(config.pptDetailLevel),
    String(config.pptSlideCount || ''),
    pptFingerprint,
  ].join('::');
};

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
  scriptWriterState: ScriptWriterDraftState,
): string => {
  const sceneFp = scenes.map(s =>
    `${s.id}:${(s.scriptText || '').length}:${s.scriptText?.charCodeAt(0) || 0}:${s.imageUrl ? 'I' : '-'}:${s.videoUrl ? 'V' : '-'}:${s.audioUrl ? 'A' : '-'}:${(s.visualPrompt || '').length}:${s.audioDuration || 0}:vr${(s.videoReferences || []).map(r => `${r.videoId}@${r.startSec}-${r.endSec}`).join(',')}`
  ).join('|');
  const cfgFp = buildConfigFingerprint(config);
  // [FIX #603] 이미지/영상 설정과 캐릭터 메타 변경도 dirty 감지
  const charFp = buildCharacterFingerprint(config);
  // [FIX #399] 자막 편집도 dirty 감지 — 자막만 수정해도 자동저장 트리거
  const subFp = (() => {
    try {
      const subs = useEditRoomStore.getState().sceneSubtitles;
      const keys = Object.keys(subs);
      if (keys.length === 0) return '';
      return keys.map(k => `${(subs[k]?.text || '').length}:${(subs[k]?.text || '').charCodeAt(0) || 0}:${subs[k]?.segments?.length || 0}`).join(',');
    } catch { return ''; }
  })();
  const scriptFp = JSON.stringify(scriptWriterState);
  return `${scenes.length}::${sceneFp}::${cfgFp}::${thumbnailCount}::${projectTitle}::${charFp}::${subFp}::${scriptFp}`;
};

const buildEffectiveConfig = (
  config: ProjectConfig,
  scriptWriterState: ScriptWriterDraftState,
): ProjectConfig => {
  if (config.narrationSource === 'uploaded-audio') return config;

  const latestScript = getLatestScriptWriterText(scriptWriterState).trim();
  if (!latestScript) return config;

  return {
    ...config,
    script: latestScript,
    videoFormat: scriptWriterState.videoFormat,
    smartSplit: scriptWriterState.smartSplit,
    longFormSplitType: scriptWriterState.longFormSplitType,
  };
};

const buildProjectSnapshot = (): { project: ProjectData; fingerprint: string } | null => {
  const { currentProjectId, config, scenes, thumbnails, projectTitle } = useProjectStore.getState();
  const { costStats } = useCostStore.getState();
  if (!currentProjectId || !config) return null;

  const scriptWriterState = getScriptWriterDraftSnapshot();
  const effectiveConfig = buildEffectiveConfig(config, scriptWriterState);
  const editRoomSubs = useEditRoomStore.getState().sceneSubtitles;
  const hasSubtitleEdits = Object.keys(editRoomSubs).length > 0;
  const title = projectTitle || effectiveConfig.script?.substring(0, 30) || 'Untitled Project';

  return {
    project: {
      id: currentProjectId,
      title,
      config: effectiveConfig,
      scenes,
      thumbnails,
      scriptWriterState,
      fullNarrationText: scenes.map((s) => s.scriptText).join(' ').substring(0, 500),
      lastModified: Date.now(),
      costStats,
      ...(hasSubtitleEdits ? { sceneSubtitles: editRoomSubs } : {}),
    },
    fingerprint: computeFingerprint(scenes, effectiveConfig, thumbnails.length, title, scriptWriterState),
  };
};

/** 즉시 저장 (beforeunload 긴급 저장 — best-effort, 비동기이므로 완료 보장 안 됨) */
const flushSave = () => {
  const snapshot = buildProjectSnapshot();
  if (!snapshot) return;

  try {
    const dbReq = indexedDB.open('ai-storyboard-v2');
    dbReq.onsuccess = () => {
      const db = dbReq.result;
      try {
        const tx = db.transaction(['projects'], 'readwrite');
        tx.objectStore('projects').put(snapshot.project);
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
      const snapshot = buildProjectSnapshot();
      if (!snapshot) return;

      // Fingerprint 기반 dirty check — 실제 변경이 없으면 저장 스킵
      const { project, fingerprint } = snapshot;
      if (fingerprint === lastFingerprintRef.current) return;

      try {
        await saveProject(project);

        lastFingerprintRef.current = fingerprint;

        // UI 인디케이터 업데이트
        useUIStore.getState().setLastAutoSavedAt(Date.now());

        // 클라우드 동기화 스케줄링 (10s debounce, fire-and-forget)
        scheduleSyncToCloud(project.id);

        // 오디오 blob을 IndexedDB에 영속화 (fire-and-forget)
        // [FIX #395] soundStudioStore.mergedAudioUrl도 함께 확인 — "전송" 안 눌러도 업로드 오디오 blob 영속화
        try {
          let effectiveMergedUrl = project.config.mergedAudioUrl;
          if (!effectiveMergedUrl) {
            try {
              const { useSoundStudioStore } = await import('../stores/soundStudioStore');
              effectiveMergedUrl = useSoundStudioStore.getState().mergedAudioUrl || undefined;
            } catch (e) { logger.trackSwallowedError('useAutoSave:doSave/readSoundStore', e); }
          }
          if (effectiveMergedUrl) {
            // config에도 반영하여 다음 auto-save 시 fingerprint에 포함되도록 (setConfig은 scheduleSave 재트리거하지만 1회 후 수렴)
            if (!project.config.mergedAudioUrl) {
              useProjectStore.getState().setConfig((prev) => prev ? { ...prev, mergedAudioUrl: effectiveMergedUrl } : prev);
            }
            import('../services/audioStorageService').then(({ persistProjectAudio }) => {
              persistProjectAudio(project.id, project.scenes, effectiveMergedUrl).catch((e) => { logger.trackSwallowedError('useAutoSave:persistProjectAudio', e); });
            });
          } else {
            import('../services/audioStorageService').then(({ persistProjectAudio }) => {
              persistProjectAudio(project.id, project.scenes, undefined).catch((e) => { logger.trackSwallowedError('useAutoSave:persistProjectAudio', e); });
            });
          }
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
    // [FIX #399] 자막 편집 시에도 자동저장 트리거
    const unsub3 = useEditRoomStore.subscribe(scheduleSave);
    // [FIX #572] 대본작성 변경도 프로젝트 저장 대상으로 편입
    const unsub4 = useScriptWriterStore.subscribe(scheduleSave);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (periodicTimer) clearInterval(periodicTimer);
    };
  }, []);
};
