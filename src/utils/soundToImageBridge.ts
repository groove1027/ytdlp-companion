import { useSoundStudioStore } from '../stores/soundStudioStore';
import { useProjectStore } from '../stores/projectStore';
import { useNavigationStore } from '../stores/navigationStore';
import { showToast } from '../stores/uiStore';
import type { Scene } from '../types';

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
    if (line.audioUrl && line.startTime === undefined && line.duration) {
      soundStore.updateLine(line.id, { startTime: offset, endTime: offset + line.duration });
    }
    offset = line.endTime ?? (offset + (line.duration || 0));
  }

  // 보정 후 최신 라인 재읽기
  const finalLines = useSoundStudioStore.getState().lines;
  const projectStore = useProjectStore.getState();
  const existingScenes = projectStore.scenes;

  // 3. sceneId 기반 직접 동기화 (기존 장면의 모든 메타데이터 보존)
  if (existingScenes.length > 0) {
    for (const line of finalLines) {
      if (line.sceneId) {
        projectStore.updateScene(line.sceneId, {
          audioUrl: line.audioUrl,
          audioDuration: line.duration,
          startTime: line.startTime,
          endTime: line.endTime,
          scriptText: line.text,
        });
      }
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
      audioDuration: line.duration,
      startTime: line.startTime,
      endTime: line.endTime,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
    }));
    projectStore.setScenes(newScenes);
  }

  // 4. config 업데이트
  projectStore.setConfig((prev) => prev ? {
    ...prev,
    script: finalLines.map((l) => l.text).join('\n'),
    mergedAudioUrl: mergedAudioUrl || undefined,
  } : prev);

  // 5. 탭 전환 + 완료 알림
  useNavigationStore.getState().setActiveTab('image-video');
  showToast('이미지/영상 탭으로 전송 완료!');
}
