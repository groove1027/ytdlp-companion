/**
 * narrationSyncService.ts
 *
 * 나레이션 실측 기반 타임라인 동기화 서비스
 * - 나레이션 duration 기준 장면별 target duration 재산출
 * - 장면 < 나레이션이면 슬로우, 장면 > 나레이션이면 트림
 * - 효과자막/일반자막 2레이어 분리
 * - 숏츠 맥락 인식 12자 줄바꿈
 */

import type {
  LayeredSubtitleSegment,
  NarrationSyncTimeline,
  NarrationSyncSceneTiming,
  VideoSceneRow,
  VideoAnalysisPreset,
} from '../types';

export type NarrationLineLike = {
  duration?: number;
  startTime?: number;
  index?: number;
};

function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*(?:초|s(?:ec(?:onds?)?)?)/i);
  return m && parseFloat(m[1]) > 0 ? parseFloat(m[1]) : 3;
}

function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
}

/**
 * 장면 미디어를 나레이션 길이에 맞춤
 * - 나레이션이 더 길면: 장면 속도를 줄여서(슬로우) 나레이션에 맞춤
 * - 나레이션이 더 짧으면: 나레이션 길이에서 트림
 */
export function fitSceneMediaToNarration(sceneDur: number, narrationDur: number) {
  const safeSceneDur = Math.max(0.1, sceneDur);
  const safeNarrationDur = Math.max(0.1, narrationDur || sceneDur);

  if (safeNarrationDur > safeSceneDur) {
    // 나레이션이 더 길면: 장면 속도를 줄여서(슬로우) 나레이션에 맞춤
    return {
      targetDurationSec: safeNarrationDur,
      autoSpeedFactor: Number((safeSceneDur / safeNarrationDur).toFixed(4)),
      trimStartSec: 0,
      trimEndSec: safeSceneDur,
    };
  }

  // 나레이션이 더 짧거나 같으면: 나레이션 길이에 맞춤 (기본)
  // 편집점 확장은 buildNarrationSyncedTimeline에서 조건부 처리
  return {
    targetDurationSec: safeNarrationDur,
    autoSpeedFactor: 1,
    trimStartSec: 0,
    trimEndSec: safeNarrationDur,
  };
}

/**
 * 숏츠 자막 줄바꿈 (12자 기준, 맥락 인식)
 * - 구두점/공백 기준 우선 분리
 * - 긴 토큰은 maxChars 단위로 강제 분할
 */
export function breakDialogueLines(text: string, maxChars = 12): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;

  const tokens = normalized
    .split(/(\s+|(?<=[,.!?;:·ㆍ，。！？]))/)
    .filter(Boolean);

  const lines: string[] = [];
  let current = '';

  const pushLine = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) lines.push(trimmed);
  };

  const pushLongToken = (token: string) => {
    let rest = token.trim();
    while (rest.length > maxChars) {
      const cut = rest.length <= maxChars * 2 ? Math.ceil(rest.length / 2) : maxChars;
      pushLine(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    current = rest;
  };

  for (const rawToken of tokens) {
    const next = `${current}${rawToken}`.trim();
    if (next.length <= maxChars) {
      current += rawToken;
      continue;
    }
    pushLine(current);
    current = '';
    if (rawToken.trim().length <= maxChars) {
      current = rawToken.trimStart();
    } else {
      pushLongToken(rawToken);
    }
  }

  pushLine(current);
  return lines.join('\n');
}

/**
 * VideoSceneRow의 effectSub/dialogue를 2레이어로 분리
 */
export function splitEffectAndDialogueSubtitles(
  scenes: VideoSceneRow[],
  preset?: VideoAnalysisPreset,
) {
  return scenes.map((scene, sceneIndex) => {
    // 프리셋별 텍스트 우선순위 (extractTimings와 동일)
    const dialogueText = preset === 'snack'
      ? (scene.dialogue || scene.audioContent || scene.sceneDesc || '').trim()
      : (scene.audioContent || scene.dialogue || scene.sceneDesc || '').trim();
    const effectText = (scene.effectSub || '').trim();

    return {
      subtitleSegments: dialogueText
        ? [{
            lineId: `dlg-${sceneIndex + 1}`,
            text: dialogueText,
            startTime: 0,
            endTime: 0,
            layerKind: 'dialogue' as const,
          }]
        : [] as LayeredSubtitleSegment[],
      effectSubtitleSegments: effectText
        ? [{
            lineId: `fx-${sceneIndex + 1}`,
            text: effectText,
            startTime: 0,
            endTime: 0,
            layerKind: 'effect' as const,
          }]
        : [] as LayeredSubtitleSegment[],
    };
  });
}

/**
 * 나레이션 실측 기반 통합 타임라인 빌드
 */
export function buildNarrationSyncedTimeline(
  scenes: VideoSceneRow[],
  narrationLines: NarrationLineLike[] = [],
  preset?: VideoAnalysisPreset,
): NarrationSyncTimeline {
  const layered = splitEffectAndDialogueSubtitles(scenes, preset);
  let sourceCursor = 0;
  let timelineCursor = 0;

  const timings: NarrationSyncSceneTiming[] = [];

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex];
    const rawTc = scene.timecodeSource || scene.sourceTimeline || '';
    // [FIX #664] `/` 구분자 지원
    const range = rawTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);

    let sourceStartSec: number;
    let sourceEndSec: number;

    if (range) {
      sourceStartSec = timecodeToSeconds(range[1]);
      sourceEndSec = timecodeToSeconds(range[2]);
    } else {
      const singleTc = rawTc.match(/(\d+:\d+(?:\.\d+)?)/);
      if (singleTc) {
        sourceStartSec = timecodeToSeconds(singleTc[1]);
        sourceEndSec = sourceStartSec + parseDuration(scene.duration);
      } else {
        sourceStartSec = sourceCursor;
        sourceEndSec = sourceCursor + parseDuration(scene.duration);
      }
    }

    if (sourceEndSec <= sourceStartSec) {
      sourceEndSec = sourceStartSec + Math.max(0.1, parseDuration(scene.duration));
    }

    // [FIX] 소스 타임코드 중복/겹침 감지 — 같은 소스의 직전 장면과 동일 범위면 자동 보정
    // 다중 소스: [소스 N] 태그가 다르면 다른 영상이므로 보정 스킵
    // 교차 소스 패턴(소스1→소스2→소스1)도 처리하기 위해 "같은 소스의 마지막 장면"과 비교
    const curSourceMatch = rawTc.match(/\[소스\s*(\d+)\]/);
    const curSourceIdx = curSourceMatch ? parseInt(curSourceMatch[1], 10) : 0;
    if (sceneIndex > 0) {
      // 같은 소스의 가장 최근 장면 찾기 (인접하지 않아도)
      let lastSameSourceTiming: NarrationSyncSceneTiming | null = null;
      for (let pi = sceneIndex - 1; pi >= 0; pi--) {
        const pScene = scenes[pi];
        const pRawTc = pScene.timecodeSource || pScene.sourceTimeline || '';
        const pMatch = pRawTc.match(/\[소스\s*(\d+)\]/);
        const pIdx = pMatch ? parseInt(pMatch[1], 10) : 0;
        if (pIdx === curSourceIdx) { lastSameSourceTiming = timings[pi]; break; }
      }
      if (lastSameSourceTiming) {
        // 비단조적 참조(이전 구간 의도적 재사용)는 보정 스킵 — 시작점이 이전 끝보다 앞이면 의도적
        const isNonMonotonic = sourceStartSec < lastSameSourceTiming.sourceStartSec;
        const startOverlap = Math.abs(sourceStartSec - lastSameSourceTiming.sourceStartSec) < 0.3;
        const endOverlap = Math.abs(sourceEndSec - lastSameSourceTiming.sourceEndSec) < 0.3;
        // 동일 구간 반복: 이전 장면 끝부터 이어서 시작하도록 보정 (비단조적이면 스킵)
        if (!isNonMonotonic && startOverlap && endOverlap) {
          const dur = parseDuration(scene.duration);
          sourceStartSec = lastSameSourceTiming.sourceEndSec;
          sourceEndSec = sourceStartSec + dur;
          console.warn(`[NarrationSync] ⚠️ 장면 ${sceneIndex + 1}: 동일 소스 구간 반복 감지 → ${sourceStartSec.toFixed(1)}~${sourceEndSec.toFixed(1)}로 자동 보정`);
        }
        // 부분 겹침: 시작점을 이전 장면 끝으로 밀어내기 (비단조적이면 스킵)
        else if (!isNonMonotonic && sourceStartSec < lastSameSourceTiming.sourceEndSec - 0.1 && sourceStartSec >= lastSameSourceTiming.sourceStartSec) {
          sourceStartSec = lastSameSourceTiming.sourceEndSec;
          if (sourceEndSec <= sourceStartSec) {
            sourceEndSec = sourceStartSec + parseDuration(scene.duration);
          }
        }
      }
    }

    const sourceDurationSec = sourceEndSec - sourceStartSec;
    const narrationDurationSec = narrationLines[sceneIndex]?.duration ?? sourceDurationSec;
    const fit = fitSceneMediaToNarration(sourceDurationSec, narrationDurationSec);

    // 편집점 고도화: 소스 타임코드 전체 구간 사용 (나레이션 길이로 트림하지 않음)
    // 장면은 항상 순차 배치 — 소스 영상의 편집점과 정확히 일치하도록 보장
    const effectiveTargetDuration = Math.max(fit.targetDurationSec, sourceDurationSec);
    const effectiveTrimEnd = sourceDurationSec;

    const timelineStartSec = timelineCursor;
    const timelineEndSec = timelineStartSec + effectiveTargetDuration;

    // 자막은 나레이션 길이만큼만 표시 (장면 클립은 전체 구간 유지)
    const subtitleEndSec = timelineStartSec + Math.min(effectiveTargetDuration, narrationDurationSec);

    const applySceneTime = (seg: LayeredSubtitleSegment): LayeredSubtitleSegment => ({
      ...seg,
      startTime: timelineStartSec,
      endTime: subtitleEndSec,
    });

    sourceCursor = sourceEndSec;
    timelineCursor = timelineEndSec;

    timings.push({
      sceneIndex,
      sourceStartSec,
      sourceEndSec,
      sourceDurationSec,
      narrationDurationSec,
      targetDurationSec: effectiveTargetDuration,
      autoSpeedFactor: fit.autoSpeedFactor,
      trimStartSec: fit.trimStartSec,
      trimEndSec: effectiveTrimEnd,
      timelineStartSec,
      timelineEndSec,
      subtitleSegments: layered[sceneIndex].subtitleSegments.map(applySceneTime),
      effectSubtitleSegments: layered[sceneIndex].effectSubtitleSegments.map(applySceneTime),
    });
  }

  return {
    scenes: timings,
    totalDurationSec: timings.at(-1)?.timelineEndSec ?? 0,
  };
}
