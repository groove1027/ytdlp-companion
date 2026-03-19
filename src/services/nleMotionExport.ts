import type {
  NleMotionInterpolation,
  NleMotionKeyframe,
  NleMotionTrack,
  UnifiedSceneTiming,
} from '../types';
import { computeKenBurns, getKenBurnsPresetMeta, OVERSCALE } from './webcodecs/kenBurnsEngine';

interface ScalarFrame {
  value: number;
}

interface ScalarAnimDef {
  frames: ScalarFrame[];
  baseDur: number;
  easing: 'ease-in-out' | 'linear';
  alternate: boolean;
}

interface TransformSample {
  timeSec: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  opacity: number;
}

interface NleMotionCompileOptions {
  sampleMode?: 'adaptive' | 'per-frame';
  simplify?: boolean;
}

const DEFAULT_SAMPLE_POINTS_PER_SEC = 10;
const FILTER_PRESETS = new Set(['vintage', 'noir']);
const FILTER_MOTION_EFFECTS = new Set(['film', 'sepia', 'high-contrast', 'multi-bright', 'rain', 'vintage-style']);

const OPACITY_ANIMS: Record<string, ScalarAnimDef> = {
  fade: {
    frames: [{ value: 0.3 }, { value: 1.0 }, { value: 0.3 }],
    baseDur: 3,
    easing: 'ease-in-out',
    alternate: false,
  },
  crossfade: {
    frames: [{ value: 0.3 }, { value: 1.0 }, { value: 0.3 }],
    baseDur: 4,
    easing: 'ease-in-out',
    alternate: false,
  },
};

export function compileNleMotionTrack(
  timing: UnifiedSceneTiming,
  canvasW: number,
  canvasH: number,
  fps = 30,
  options: NleMotionCompileOptions = {},
): NleMotionTrack {
  const durationSec = Math.max(0.001, timing.imageDuration || 0);
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const sampleMode = options.sampleMode || 'adaptive';
  const shouldSimplify = options.simplify ?? sampleMode !== 'per-frame';
  const sampleTimes = buildSampleTimes(durationSec, fps, sampleMode);
  const anchorX = timing.anchorX ?? 50;
  const anchorY = timing.anchorY ?? 45;
  const samples = sampleTimes.map((timeSec) => {
    const rawTransform = computeCombinedTransform(timing, timeSec, totalFrames, canvasW, canvasH, fps);
    const centeredTransform = toCenterEquivalentTransform(rawTransform, canvasW, canvasH, anchorX, anchorY);
    return {
      timeSec,
      translateX: centeredTransform.translateX,
      translateY: centeredTransform.translateY,
      scale: centeredTransform.scale,
      rotation: centeredTransform.rotation,
      opacity: computeOpacity(timing.motionEffect, timeSec, durationSec),
    };
  });

  const translateX = finalizeTrack(
    samples.map(({ timeSec, translateX: value }) => ({ timeSec, value })),
    0.35,
    0.01,
    shouldSimplify,
  );
  const translateY = finalizeTrack(
    samples.map(({ timeSec, translateY: value }) => ({ timeSec, value })),
    0.35,
    0.01,
    shouldSimplify,
  );
  const scale = finalizeTrack(
    samples.map(({ timeSec, scale: value }) => ({ timeSec, value })),
    0.0008,
    0.0005,
    shouldSimplify,
  );
  const rotation = finalizeTrack(
    samples.map(({ timeSec, rotation: value }) => ({ timeSec, value })),
    0.04,
    0.03,
    shouldSimplify,
  );
  const opacity = finalizeTrack(
    samples.map(({ timeSec, opacity: value }) => ({ timeSec, value })),
    0.008,
    0.005,
    shouldSimplify,
  );
  const transformInterpolation = resolveTransformInterpolation(timing);
  const opacityInterpolation = resolveOpacityInterpolation(timing.motionEffect);

  return {
    durationSec,
    translateX,
    translateY,
    scale,
    rotation,
    opacity,
    hasTransformMotion: [translateX, translateY, scale, rotation].some((track) => track.length > 0),
    hasOpacityMotion: opacity.length > 0,
    transformInterpolation,
    opacityInterpolation,
    unsupportedEffects: collectUnsupportedEffects(timing),
  };
}

function collectUnsupportedEffects(timing: UnifiedSceneTiming): string[] {
  const effects: string[] = [];
  if (timing.effectPreset && FILTER_PRESETS.has(timing.effectPreset)) {
    effects.push(timing.effectPreset);
  }
  if (timing.motionEffect && FILTER_MOTION_EFFECTS.has(timing.motionEffect)) {
    effects.push(timing.motionEffect);
  }
  return effects;
}

function buildSampleTimes(durationSec: number, fps: number, sampleMode: NleMotionCompileOptions['sampleMode']): number[] {
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const times = new Set<number>([0, durationSec]);
  if (sampleMode === 'per-frame') {
    for (let frame = 0; frame < totalFrames; frame++) {
      times.add(frame / fps);
    }
  } else {
    const frameStep = Math.max(1, Math.round(fps / DEFAULT_SAMPLE_POINTS_PER_SEC));
    for (let frame = 0; frame < totalFrames; frame += frameStep) {
      times.add(frame / fps);
    }
  }
  return [...times]
    .map((timeSec) => Math.max(0, Math.min(durationSec, timeSec)))
    .sort((a, b) => a - b);
}

function finalizeTrack(
  track: NleMotionKeyframe[],
  simplifyEpsilon: number,
  staticEpsilon: number,
  shouldSimplify: boolean,
): NleMotionKeyframe[] {
  const processedTrack = shouldSimplify
    ? simplifyTrack(track, simplifyEpsilon)
    : track;
  return stripStaticTrack(processedTrack, staticEpsilon);
}

function computeCombinedTransform(
  timing: UnifiedSceneTiming,
  timeSec: number,
  totalFrames: number,
  canvasW: number,
  canvasH: number,
  fps: number,
): { scale: number; translateX: number; translateY: number; rotation: number } {
  const frameN = Math.min(Math.max(0, Math.floor(timeSec * fps)), totalFrames - 1);
  const anchorX = timing.anchorX ?? 50;
  const anchorY = timing.anchorY ?? 45;
  const panZoomTransform = computeKenBurns(
    timing.effectPreset || 'smooth',
    frameN,
    totalFrames,
    canvasW,
    canvasH,
    anchorX,
    anchorY,
    fps,
  );
  const baseTransform = {
    scale: panZoomTransform.scale,
    translateX: panZoomTransform.translateX,
    translateY: panZoomTransform.translateY,
    rotation: panZoomTransform.rotate,
  };
  const motionEffect = timing.motionEffect;
  if (!motionEffect || motionEffect === 'none' || motionEffect === 'static') {
    return baseTransform;
  }
  const motionTransform = computeKenBurns(
    motionEffect,
    frameN,
    totalFrames,
    canvasW,
    canvasH,
    anchorX,
    anchorY,
    fps,
  );
  return {
    scale: baseTransform.scale * motionTransform.scale,
    translateX: baseTransform.translateX + motionTransform.translateX,
    translateY: baseTransform.translateY + motionTransform.translateY,
    rotation: baseTransform.rotation + motionTransform.rotate,
  };
}

function toCenterEquivalentTransform(
  transform: { scale: number; translateX: number; translateY: number; rotation: number },
  canvasW: number,
  canvasH: number,
  anchorX: number,
  anchorY: number,
): { scale: number; rotation: number; translateX: number; translateY: number } {
  const drawW = canvasW * OVERSCALE;
  const drawH = canvasH * OVERSCALE;
  const imgX = -(drawW - canvasW) / 2;
  const imgY = -(drawH - canvasH) / 2;
  const originX = imgX + drawW * (anchorX / 100);
  const originY = imgY + drawH * (anchorY / 100);
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  const dx = centerX - originX;
  const dy = centerY - originY;
  const radians = transform.rotation * Math.PI / 180;
  const scaledDx = dx * transform.scale;
  const scaledDy = dy * transform.scale;
  const rotatedDx = scaledDx * Math.cos(radians) - scaledDy * Math.sin(radians);
  const rotatedDy = scaledDx * Math.sin(radians) + scaledDy * Math.cos(radians);
  const transformedCenterX = originX + transform.translateX + rotatedDx;
  const transformedCenterY = originY + transform.translateY + rotatedDy;
  return {
    scale: transform.scale,
    rotation: transform.rotation,
    translateX: transformedCenterX - centerX,
    translateY: transformedCenterY - centerY,
  };
}

function computeOpacity(motionEffect: string | undefined, timeSec: number, durationSec: number): number {
  if (!motionEffect) return 1;
  const def = OPACITY_ANIMS[motionEffect];
  if (!def) return 1;
  const phase = getAnimPhase(timeSec, durationSec, def.baseDur, def.alternate);
  const easedPhase = def.easing === 'ease-in-out' ? easeInOut(phase) : phase;
  return interpolateScalarFrames(def.frames, easedPhase);
}

function resolveTransformInterpolation(timing: UnifiedSceneTiming): NleMotionInterpolation {
  const easingList = [timing.effectPreset, timing.motionEffect]
    .map((preset) => (preset ? getKenBurnsPresetMeta(preset)?.easing : null))
    .filter((easing): easing is 'ease-in-out' | 'linear' => !!easing);
  return easingList.includes('ease-in-out') ? 'FCPCurve' : 'linear';
}

function resolveOpacityInterpolation(motionEffect: string | undefined): NleMotionInterpolation {
  if (!motionEffect) return 'linear';
  return OPACITY_ANIMS[motionEffect]?.easing === 'ease-in-out' ? 'FCPCurve' : 'linear';
}

function getAnimPhase(
  timeSec: number,
  sceneDur: number,
  baseDur: number,
  isAlternate: boolean,
): number {
  const visualCycle = isAlternate ? baseDur * 2 : baseDur;
  const fullCycles = Math.max(1, Math.round(sceneDur / visualCycle));
  const newDur = Math.max(0.3, sceneDur / (fullCycles * (isAlternate ? 2 : 1)));
  const negDelay = newDur * 0.45;
  const adjustedTime = timeSec + negDelay;

  if (isAlternate) {
    const cycleDur = newDur * 2;
    let cyclePos = adjustedTime % cycleDur;
    if (cyclePos < 0) cyclePos += cycleDur;
    return cyclePos < newDur
      ? cyclePos / newDur
      : 1 - (cyclePos - newDur) / newDur;
  }

  let cyclePos = adjustedTime % newDur;
  if (cyclePos < 0) cyclePos += newDur;
  return cyclePos / newDur;
}

function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function interpolateScalarFrames(frames: ScalarFrame[], t: number): number {
  if (frames.length === 0) return 1;
  if (frames.length === 1) return frames[0].value;

  const clampedT = Math.max(0, Math.min(1, t));
  const segCount = frames.length - 1;
  const scaledT = clampedT * segCount;
  const segIdx = Math.min(Math.floor(scaledT), segCount - 1);
  const segT = scaledT - segIdx;
  const from = frames[segIdx];
  const to = frames[segIdx + 1];
  return from.value + (to.value - from.value) * segT;
}

function simplifyTrack(track: NleMotionKeyframe[], epsilon: number): NleMotionKeyframe[] {
  if (track.length <= 2) return track;

  const keep = new Set<number>([0, track.length - 1]);

  const recurse = (start: number, end: number) => {
    const startPoint = track[start];
    const endPoint = track[end];
    const span = endPoint.timeSec - startPoint.timeSec;
    let maxDistance = 0;
    let splitIndex = -1;

    for (let i = start + 1; i < end; i++) {
      const current = track[i];
      const ratio = span <= 0 ? 0 : (current.timeSec - startPoint.timeSec) / span;
      const expected = startPoint.value + (endPoint.value - startPoint.value) * ratio;
      const distance = Math.abs(current.value - expected);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = i;
      }
    }

    if (splitIndex !== -1 && maxDistance > epsilon) {
      keep.add(splitIndex);
      recurse(start, splitIndex);
      recurse(splitIndex, end);
    }
  };

  recurse(0, track.length - 1);
  return [...keep]
    .sort((a, b) => a - b)
    .map((index) => track[index]);
}

function stripStaticTrack(track: NleMotionKeyframe[], epsilon: number): NleMotionKeyframe[] {
  if (track.length <= 1) return [];
  const firstValue = track[0].value;
  const lastValue = track[track.length - 1].value;
  const varies = track.some((keyframe) => Math.abs(keyframe.value - firstValue) > epsilon);
  if (!varies && Math.abs(lastValue - firstValue) <= epsilon) {
    return [];
  }
  return track;
}
