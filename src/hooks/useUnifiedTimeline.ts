import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useSoundStudioStore } from '../stores/soundStudioStore';
import { useEditRoomStore } from '../stores/editRoomStore';
import { UnifiedSceneTiming, SceneTransitionConfig } from '../types';
import { getSceneNarrationText } from '../utils/sceneText';

/**
 * 통합 타임라인 훅
 *
 * soundStudioStore.lines의 타이밍(TTS 원본) + editRoomStore의 사용자 수정을
 * 합쳐서 장면별 UnifiedSceneTiming 배열을 파생한다.
 *
 * 소비자: EditRoomSceneCard, SRT Export, FFmpeg MP4 Export
 */
export function useUnifiedTimeline(): UnifiedSceneTiming[] {
  const scenes = useProjectStore((s) => s.scenes);
  const lines = useSoundStudioStore((s) => s.lines);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const sceneSubtitles = useEditRoomStore((s) => s.sceneSubtitles);
  const sceneEffects = useEditRoomStore((s) => s.sceneEffects);
  const sceneAudioSettings = useEditRoomStore((s) => s.sceneAudioSettings);
  const sceneTransitions = useEditRoomStore((s) => s.sceneTransitions);

  return useMemo(() => {
    // sceneOrder가 비어있으면 scenes 기본 순서 사용
    const orderedIds = sceneOrder.length > 0
      ? sceneOrder
      : scenes.map((s) => s.id);

    const sceneMap = new Map(scenes.map((s) => [s.id, s]));
    const lineByScene = new Map(lines.map((l) => [l.sceneId, l]));

    // 인덱스 기반 fallback 매핑 (sceneId 없는 라인용)
    const lineByIndex = new Map(lines.map((l) => [l.index, l]));

    let cumulativeTime = 0;

    return orderedIds.map((sceneId, orderIndex) => {
      const scene = sceneMap.get(sceneId);
      if (!scene) {
        // 삭제된 장면 등 — 빈 타이밍
        return createEmptyTiming(sceneId, orderIndex);
      }

      // ScriptLine 찾기: sceneId → index fallback
      const matchedLine = lineByScene.get(sceneId) || lineByIndex.get(orderIndex) || null;

      // editRoomStore 자막 설정 (사용자 수정본)
      const editSub = sceneSubtitles[sceneId];

      // 타이밍 결정 우선순위:
      // 1. editRoomStore에 사용자 수정 타이밍(_userTiming)이 있으면 최우선
      // 2. ScriptLine에 정확한 TTS 타이밍이 있으면 사용
      // 3. editRoomStore에 유효한 타이밍이 있으면 사용
      // 4. Scene(start/end) 저장 타이밍
      // 5. ScriptLine duration만 있으면 누적 시간 + duration
      // 6. Scene audioDuration
      // 7. 기본값 (이전 장면 끝 + 3초)
      let startTime: number;
      let endTime: number;

      if (editSub && (editSub as unknown as { _userTiming?: boolean })._userTiming === true
          && editSub.startTime >= 0 && editSub.endTime > editSub.startTime) {
        // 사용자가 타임라인에서 직접 수정한 타이밍 (드래그/트림)
        startTime = editSub.startTime;
        endTime = editSub.endTime;
      } else if (matchedLine?.startTime != null && matchedLine.startTime >= 0 &&
          matchedLine?.duration != null && matchedLine.duration > 0) {
        // TTS 원본 타이밍 (가장 정확)
        startTime = matchedLine.startTime;
        // [BUG FIX] 항상 startTime + duration으로 계산 — endTime 필드가 불일치할 수 있음
        endTime = matchedLine.startTime + matchedLine.duration;
      } else if (editSub && editSub.startTime >= 0 && editSub.endTime > editSub.startTime
                 && editSub.endTime > cumulativeTime - 0.01) {
        // editRoom 타이밍 (누적 시간보다 뒤에 있어야 유효 — 겹침 방지)
        startTime = editSub.startTime;
        endTime = editSub.endTime;
      } else if (scene.startTime != null && scene.endTime != null &&
                 scene.endTime > scene.startTime &&
                 scene.endTime > cumulativeTime - 0.01) {
        // Scene 저장 타이밍 (사운드 스튜디오 전송값)
        startTime = scene.startTime;
        endTime = scene.endTime;
      } else if (matchedLine?.duration != null && matchedLine.duration > 0) {
        // duration만 있을 때 — 누적 기반
        startTime = cumulativeTime;
        endTime = cumulativeTime + matchedLine.duration;
      } else if (scene.audioDuration != null && scene.audioDuration > 0) {
        // Scene 오디오 길이 기반 폴백
        startTime = cumulativeTime;
        endTime = cumulativeTime + scene.audioDuration;
      } else {
        startTime = cumulativeTime;
        endTime = cumulativeTime + 3; // 기본 3초
      }

      const duration = endTime - startTime;
      cumulativeTime = endTime;

      // 자막 세그먼트: segments 우선, 없으면 단일 블록
      // editSub가 존재하면 (편집실 초기화 완료) editSub.text를 그대로 사용
      // → 사용자가 자막을 비우면 ''이 유지되어 SRT에서도 제외됨
      const subtitleText = editSub ? editSub.text : (matchedLine?.text || getSceneNarrationText(scene));
      const subtitleSegments = editSub?.segments?.length
        ? editSub.segments.map((seg, i) => ({
            lineId: `${matchedLine?.id || `auto-${sceneId}`}-seg${i}`,
            text: seg.text,
            startTime: seg.startTime,
            endTime: seg.endTime,
          }))
        : subtitleText
          ? [{
              lineId: matchedLine?.id || `auto-${sceneId}`,
              text: subtitleText,
              startTime,
              endTime,
            }]
          : [];

      // 효과/오디오 설정
      const effect = sceneEffects[sceneId];
      const audio = sceneAudioSettings[sceneId];

      // 전환 효과: 다음 장면이 있고 preset이 none이 아닌 경우만
      const transition = sceneTransitions[sceneId];
      const hasNextScene = orderIndex < orderedIds.length - 1;
      const transitionToNext: SceneTransitionConfig | undefined =
        hasNextScene && transition && transition.preset !== 'none'
          ? transition
          : undefined;

      return {
        sceneId,
        sceneIndex: orderIndex,
        imageStartTime: startTime,
        imageEndTime: endTime,
        imageDuration: duration,
        subtitleSegments,
        effectPreset: effect?.panZoomPreset || 'smooth',
        motionEffect: effect?.motionEffect || undefined,
        anchorX: effect?.anchorX ?? 50,
        anchorY: effect?.anchorY ?? 45,
        volume: audio?.volume ?? 158,
        speed: audio?.speed ?? 1.0,
        transitionToNext,
      } satisfies UnifiedSceneTiming;
    });
  }, [scenes, lines, sceneOrder, sceneSubtitles, sceneEffects, sceneAudioSettings, sceneTransitions]);
}

function createEmptyTiming(sceneId: string, index: number): UnifiedSceneTiming {
  return {
    sceneId,
    sceneIndex: index,
    imageStartTime: 0,
    imageEndTime: 0,
    imageDuration: 0,
    subtitleSegments: [],
    effectPreset: 'smooth',
    volume: 100,
    speed: 1.0,
  };
}

/**
 * 전체 타임라인 총 길이 (초)
 */
export function useTotalDuration(): number {
  const timeline = useUnifiedTimeline();
  return useMemo(() => {
    if (timeline.length === 0) return 0;
    return Math.max(...timeline.map((t) => t.imageEndTime));
  }, [timeline]);
}
