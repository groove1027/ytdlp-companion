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
    return {
      targetDurationSec: safeNarrationDur,
      autoSpeedFactor: Number((safeSceneDur / safeNarrationDur).toFixed(4)),
      trimStartSec: 0,
      trimEndSec: safeSceneDur,
    };
  }

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

  const timings: NarrationSyncSceneTiming[] = scenes.map((scene, sceneIndex) => {
    const rawTc = scene.timecodeSource || scene.sourceTimeline || '';
    const range = rawTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);

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

    const sourceDurationSec = sourceEndSec - sourceStartSec;
    const narrationDurationSec = narrationLines[sceneIndex]?.duration ?? sourceDurationSec;

    const fit = fitSceneMediaToNarration(sourceDurationSec, narrationDurationSec);

    const timelineStartSec = narrationLines[sceneIndex]?.startTime ?? timelineCursor;
    const timelineEndSec = timelineStartSec + fit.targetDurationSec;

    const applySceneTime = (seg: LayeredSubtitleSegment): LayeredSubtitleSegment => ({
      ...seg,
      startTime: timelineStartSec,
      endTime: timelineEndSec,
    });

    sourceCursor = sourceEndSec;
    timelineCursor = timelineEndSec;

    return {
      sceneIndex,
      sourceStartSec,
      sourceEndSec,
      sourceDurationSec,
      narrationDurationSec,
      targetDurationSec: fit.targetDurationSec,
      autoSpeedFactor: fit.autoSpeedFactor,
      trimStartSec: fit.trimStartSec,
      trimEndSec: fit.trimEndSec,
      timelineStartSec,
      timelineEndSec,
      subtitleSegments: layered[sceneIndex].subtitleSegments.map(applySceneTime),
      effectSubtitleSegments: layered[sceneIndex].effectSubtitleSegments.map(applySceneTime),
    };
  });

  return {
    scenes: timings,
    totalDurationSec: timings.at(-1)?.timelineEndSec ?? 0,
  };
}
