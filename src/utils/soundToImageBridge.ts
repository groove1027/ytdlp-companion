import { useSoundStudioStore } from '../stores/soundStudioStore';
import { useProjectStore } from '../stores/projectStore';
import { useNavigationStore } from '../stores/navigationStore';
import { showToast } from '../stores/uiStore';
import type { ProjectConfig, Scene, WhisperSegment } from '../types';
import { areUploadedTranscriptScenesSynced, buildUploadedTranscriptScenes } from './uploadedTranscriptScenes';
import { getSceneNarrationText } from './sceneText';

function resolveLineDuration(line: {
  duration?: number;
  startTime?: number;
  endTime?: number;
}): number | undefined {
  if (line.duration != null && line.duration > 0) return line.duration;
  if (line.startTime != null && line.endTime != null && line.endTime > line.startTime) {
    return line.endTime - line.startTime;
  }
  return undefined;
}

function normalizeSceneText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function rebuildUploadedTranscriptScenes(existingScenes: Scene[], plannedScenes: Scene[]): Scene[] {
  return plannedScenes.map((plannedScene, index) => {
    const currentScene = existingScenes[index];
    if (!currentScene) return plannedScene;

    const currentText = normalizeSceneText(currentScene.scriptText || currentScene.audioScript || '');
    const plannedText = normalizeSceneText(plannedScene.scriptText || plannedScene.audioScript || '');
    if (currentText !== plannedText) {
      return {
        ...plannedScene,
        id: currentScene.id || plannedScene.id,
        isNativeHQ: currentScene.isNativeHQ ?? plannedScene.isNativeHQ,
        seedanceDuration: currentScene.seedanceDuration || plannedScene.seedanceDuration,
      };
    }

    return {
      ...currentScene,
      id: currentScene.id || plannedScene.id,
      scriptText: plannedScene.scriptText,
      audioScript: plannedScene.audioScript,
      startTime: plannedScene.startTime,
      endTime: plannedScene.endTime,
      audioDuration: plannedScene.audioDuration,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      seedanceDuration: currentScene.seedanceDuration || plannedScene.seedanceDuration,
    };
  });
}

function buildDirectScenesFromLines(
  existingScenes: Scene[],
  lines: Array<{
    text: string;
    audioUrl?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    sceneId?: string;
  }>,
): Scene[] {
  const ts = Date.now();

  return lines.map((line, index) => {
    const currentScene = existingScenes[index];
    const normalizedLineText = normalizeSceneText(line.text);
    const currentSceneText = currentScene ? normalizeSceneText(getSceneNarrationText(currentScene)) : '';
    const shouldPreserveCurrentScene = !!currentScene && normalizedLineText.length > 0 && normalizedLineText === currentSceneText;

    const resolvedDuration = resolveLineDuration(line);
    const baseScene: Scene = shouldPreserveCurrentScene && currentScene
      ? currentScene
      : {
          id: line.sceneId || currentScene?.id || `scene-${ts}-${index}`,
          scriptText: line.text,
          audioScript: line.text,
          visualPrompt: '',
          visualDescriptionKO: '',
          characterPresent: false,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          isNativeHQ: currentScene?.isNativeHQ ?? false,
          seedanceDuration: currentScene?.seedanceDuration || '8',
        };

    return {
      ...baseScene,
      id: line.sceneId || baseScene.id || `scene-${ts}-${index}`,
      scriptText: line.text,
      audioScript: line.text,
      audioUrl: line.audioUrl,
      audioDuration: resolvedDuration,
      startTime: line.startTime,
      endTime: line.endTime,
      isGeneratingImage: false,
      isGeneratingVideo: false,
    };
  });
}

/**
 * 사운드 스튜디오의 오디오 데이터를 이미지/영상 탭으로 동기화하고 탭 전환.
 *
 * Scene과 ScriptLine은 sceneId로 1:1 연결되어 있으므로,
 * sceneId 기반 직접 매핑으로 오디오 데이터만 동기화합니다.
 */
export function transferSoundToImageVideo(): void {
  const soundStore = useSoundStudioStore.getState();

  // 1. 무음 제거 미적용 시 자동 커밋
  soundStore.commitPendingEdits();

  const { lines, mergedAudioUrl } = useSoundStudioStore.getState();
  if (lines.length === 0) return;

  // 2. 타이밍 무결성 보정 — audioUrl 있지만 startTime 없는 라인
  let offset = 0;
  for (const line of lines) {
    const resolvedDuration = resolveLineDuration(line);
    if (line.audioUrl && resolvedDuration != null && resolvedDuration > 0 &&
        (line.startTime === undefined || line.endTime === undefined || line.endTime <= line.startTime)) {
      soundStore.updateLine(line.id, { startTime: offset, endTime: offset + resolvedDuration });
    }
    offset = line.endTime ?? (offset + (resolvedDuration || 0));
  }

  // 보정 후 최신 라인 재읽기
  const finalLines = useSoundStudioStore.getState().lines;
  const projectStore = useProjectStore.getState();
  const existingScenes = projectStore.scenes;
  const lineSegments = finalLines.map((line) => {
    const resolvedDuration = resolveLineDuration(line) || 0;
    const startTime = line.startTime ?? 0;
    const endTime = line.endTime ?? (startTime + resolvedDuration);
    return {
      text: line.text,
      startTime,
      endTime,
    };
  });
  const isUploadedTranscriptTransfer = finalLines.length > 0
    && finalLines.every((line) => line.audioSource === 'uploaded' || !!line.uploadedAudioId);
  const needsDirectSceneRebuild = !isUploadedTranscriptTransfer
    && existingScenes.length > 0
    && existingScenes.length !== finalLines.length
    && finalLines.length > 0
    && finalLines.every((line) => !line.sceneId);
  const currentConfig = projectStore.config;
  const uploadedTranscriptSegments: WhisperSegment[] | undefined = isUploadedTranscriptTransfer
    ? ((currentConfig?.rawUploadedTranscriptSegments && currentConfig.rawUploadedTranscriptSegments.length > 0)
      ? currentConfig.rawUploadedTranscriptSegments
      : lineSegments)
    : undefined;
  const uploadedParagraphSegments: WhisperSegment[] | undefined = isUploadedTranscriptTransfer
    ? lineSegments
    : undefined;
  const uploadedAudioId = isUploadedTranscriptTransfer
    ? finalLines.find((line) => line.uploadedAudioId)?.uploadedAudioId
    : undefined;
  const transcriptDurationSec = uploadedParagraphSegments && uploadedParagraphSegments.length > 0
    ? uploadedParagraphSegments[uploadedParagraphSegments.length - 1].endTime
    : undefined;
  const nextNarrationSource: ProjectConfig['narrationSource'] = isUploadedTranscriptTransfer ? 'uploaded-audio' : 'tts';
  const nextConfig: ProjectConfig | null = currentConfig ? {
    ...currentConfig,
    script: finalLines.map((l) => l.text).join('\n'),
    mergedAudioUrl: mergedAudioUrl || undefined,
    narrationSource: nextNarrationSource,
    uploadedAudioId: isUploadedTranscriptTransfer ? uploadedAudioId : undefined,
    targetSceneCount: isUploadedTranscriptTransfer ? undefined : currentConfig.targetSceneCount,
    sourceNarrationDurationSec: isUploadedTranscriptTransfer
      ? (currentConfig.sourceNarrationDurationSec || transcriptDurationSec)
      : undefined,
    transcriptDurationSec: isUploadedTranscriptTransfer ? transcriptDurationSec : undefined,
    rawUploadedTranscriptSegments: isUploadedTranscriptTransfer ? uploadedTranscriptSegments : undefined,
    uploadedTranscriptParagraphSegments: isUploadedTranscriptTransfer ? uploadedParagraphSegments : undefined,
  } : null;
  const regroupConfig: ProjectConfig | null = currentConfig ? {
    ...currentConfig,
    script: finalLines.map((l) => l.text).join('\n'),
    narrationSource: 'uploaded-audio',
    uploadedAudioId: uploadedAudioId || currentConfig.uploadedAudioId,
    targetSceneCount: undefined,
    sourceNarrationDurationSec: currentConfig.sourceNarrationDurationSec || transcriptDurationSec,
    transcriptDurationSec,
    rawUploadedTranscriptSegments: uploadedTranscriptSegments,
    uploadedTranscriptParagraphSegments: lineSegments,
  } : null;
  const regroupedUploadedScenes = isUploadedTranscriptTransfer && regroupConfig
    ? buildUploadedTranscriptScenes(regroupConfig, regroupConfig.targetSceneCount ?? null)
    : null;

  // 3. sceneId 기반 직접 동기화 (기존 장면의 모든 메타데이터 보존)
  if (regroupedUploadedScenes && regroupedUploadedScenes.length > 0) {
    if (!areUploadedTranscriptScenesSynced(existingScenes, regroupedUploadedScenes)) {
      projectStore.setScenes(
        existingScenes.length > 0
          ? rebuildUploadedTranscriptScenes(existingScenes, regroupedUploadedScenes)
          : regroupedUploadedScenes,
      );
    }
  } else if (needsDirectSceneRebuild) {
    projectStore.setScenes(buildDirectScenesFromLines(existingScenes, finalLines));
  } else if (existingScenes.length > 0) {
    const canUseIndexFallback = existingScenes.length === finalLines.length;
    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i];
      const fallbackScene = existingScenes[i];
      const targetSceneId = line.sceneId || (canUseIndexFallback ? fallbackScene?.id : undefined);
      if (!targetSceneId) continue;

      const resolvedDuration = resolveLineDuration(line);
      const scenePatch: Partial<Scene> = {
        scriptText: line.text,
      };
      if (line.audioUrl !== undefined) scenePatch.audioUrl = line.audioUrl;
      if (resolvedDuration != null && resolvedDuration > 0) scenePatch.audioDuration = resolvedDuration;
      if (line.startTime !== undefined) scenePatch.startTime = line.startTime;
      if (line.endTime !== undefined) scenePatch.endTime = line.endTime;

      projectStore.updateScene(targetSceneId, scenePatch);
    }
  } else {
    // Scene이 없으면 lines에서 새로 생성
    const ts = Date.now();
    const newScenes: Scene[] = finalLines.map((line, i) => ({
      id: line.sceneId || `scene-${ts}-${i}`,
      scriptText: line.text,
      audioScript: line.text,
      visualPrompt: '',
      visualDescriptionKO: '',
      characterPresent: false,
      audioUrl: line.audioUrl,
      audioDuration: resolveLineDuration(line),
      startTime: line.startTime,
      endTime: line.endTime,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
    }));
    projectStore.setScenes(newScenes);
  }

  // 4. config 업데이트
  projectStore.setConfig((prev) => prev ? (nextConfig || prev) : prev);

  // 5. 탭 전환 + 완료 알림
  useNavigationStore.getState().setActiveTab('image-video');
  showToast('이미지/영상 탭으로 전송 완료!');
}
