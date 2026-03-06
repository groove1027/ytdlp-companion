/**
 * Ken Burns Engine — CSS 프리뷰 애니메이션과 1:1 매칭
 *
 * CSS @keyframes + ease-in-out + infinite alternate 동작을
 * Canvas 2D transform으로 정확히 재현
 */

import type { EffectPresetId } from '../../types';

export interface KenBurnsTransform {
  scale: number;
  translateX: number; // px
  translateY: number; // px
  rotate: number;     // degrees
}

/** CSS -10% inset wrapper와 동일한 120% 오버스케일 */
export const OVERSCALE = 1.2;

// ─── CSS 키프레임 정의 (프리뷰와 1:1 매칭) ─────────────

interface KBKeyframe {
  scale: number;
  tx: number;     // translateX as % of element
  ty: number;     // translateY as % of element
  rotate: number; // degrees
}

interface PresetDef {
  frames: KBKeyframe[];
  baseDur: number;       // CSS 기본 duration (초)
  easing: 'ease-in-out' | 'linear';
  alternate: boolean;
}

/**
 * CSS @keyframes와 정확히 매칭되는 프리셋 정의
 * - EditRoomTab.tsx의 previewPanZoomAnim과 PREVIEW_MOTION_KEYFRAMES 기준
 */
const PRESET_DEFS: Record<string, PresetDef> = {
  // mp-zoom-in 2s ease-in-out infinite alternate
  fast: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 2, easing: 'ease-in-out', alternate: true,
  },
  // mp-zoom-in 4s ease-in-out infinite alternate
  smooth: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: true,
  },
  // mp-zoom-out 5s ease-in-out infinite alternate
  cinematic: {
    frames: [
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // mp-dynamic 4s ease-in-out infinite (3 keyframes: 0/50/100)
  dynamic: {
    frames: [
      { scale: 1, tx: -3, ty: -2, rotate: 0 },
      { scale: 1.1, tx: 3, ty: 2, rotate: 0 },
      { scale: 1, tx: -3, ty: -2, rotate: 0 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: false,
  },
  // mp-dreamy 6s ease-in-out infinite (0/50/100)
  dreamy: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.08, tx: 0, ty: 0, rotate: 0.8 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 6, easing: 'ease-in-out', alternate: false,
  },
  // mp-dramatic 4s ease-in-out infinite (0/50/100)
  dramatic: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.18, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: false,
  },
  // mp-zoom-in 3s ease-in-out infinite alternate
  zoom: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 3, easing: 'ease-in-out', alternate: true,
  },
  // mp-reveal 4s ease-in-out infinite alternate
  reveal: {
    frames: [
      { scale: 1.18, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: true,
  },
  // mp-zoom-in 6s ease-in-out infinite alternate + sepia
  vintage: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 6, easing: 'ease-in-out', alternate: true,
  },
  // mp-pan-right 6s linear infinite alternate
  // @keyframes mp-pan-right { 0%{translateX(5%) scale(1)} 100%{translateX(-5%) scale(1)} }
  documentary: {
    frames: [
      { scale: 1, tx: 5, ty: 0, rotate: 0 },
      { scale: 1, tx: -5, ty: 0, rotate: 0 },
    ],
    baseDur: 6, easing: 'linear', alternate: true,
  },
  // mp-pan-left 2s linear infinite alternate
  timelapse: {
    frames: [
      { scale: 1, tx: -5, ty: 0, rotate: 0 },
      { scale: 1, tx: 5, ty: 0, rotate: 0 },
    ],
    baseDur: 2, easing: 'linear', alternate: true,
  },
  // mp-micro 3s ease-in-out infinite (0/50/100)
  vlog: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.03, tx: 0.08, ty: 0.08, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 3, easing: 'ease-in-out', alternate: false,
  },
  // mp-diagonal-drift 5s ease-in-out infinite alternate
  'diagonal-drift': {
    frames: [
      { scale: 1, tx: 4, ty: -4, rotate: 0 },
      { scale: 1.06, tx: -4, ty: 4, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // mp-orbit 6s ease-in-out infinite (0/25/50/75/100)
  orbit: {
    frames: [
      { scale: 1.05, tx: 0, ty: -3, rotate: 0 },
      { scale: 1.05, tx: 3, ty: 0, rotate: 0 },
      { scale: 1.05, tx: 0, ty: 3, rotate: 0 },
      { scale: 1.05, tx: -3, ty: 0, rotate: 0 },
      { scale: 1.05, tx: 0, ty: -3, rotate: 0 },
    ],
    baseDur: 6, easing: 'ease-in-out', alternate: false,
  },
  // mp-parallax 5s ease-in-out infinite alternate
  parallax: {
    frames: [
      { scale: 1, tx: 3, ty: 0, rotate: 0 },
      { scale: 1.1, tx: -3, ty: 0, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // mp-tilt-shift 5s ease-in-out infinite alternate
  'tilt-shift': {
    frames: [
      { scale: 1.05, tx: 0, ty: -5, rotate: 0 },
      { scale: 1.05, tx: 0, ty: 5, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // mp-spiral-in 4s ease-in-out infinite alternate
  'spiral-in': {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 3 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: true,
  },
  // mp-push-pull 3s ease-in-out infinite (0/50/100)
  'push-pull': {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.12, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 3, easing: 'ease-in-out', alternate: false,
  },
  // mp-dolly-zoom 4s ease-in-out infinite (0/50/100)
  'dolly-zoom': {
    frames: [
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: false,
  },
  // mp-crane-up 5s ease-in-out infinite alternate
  'crane-up': {
    frames: [
      { scale: 1, tx: 0, ty: -5, rotate: 0 },
      { scale: 1.05, tx: 0, ty: 4, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // ─── panZoom에 의해 다른 keyframe 이름을 쓰지만 동일한 모션 ───
  // noir = mp-zoom-in 5s ease-in-out infinite alternate + grayscale filter
  noir: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 5, easing: 'ease-in-out', alternate: true,
  },
  // ─── motionEffect 프리셋 (panZoom과 별도) ───
  // mp-slow 6s ease-in-out infinite alternate
  slow: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.06, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 6, easing: 'ease-in-out', alternate: true,
  },
  // mp-rotate 4s ease-in-out infinite alternate
  rotate: {
    frames: [
      { scale: 1.05, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.05, tx: 0, ty: 0, rotate: 3 },
    ],
    baseDur: 4, easing: 'ease-in-out', alternate: true,
  },
  // mp-rotate-plus 3s ease-in-out infinite alternate
  'rotate-plus': {
    frames: [
      { scale: 1.08, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.08, tx: 0, ty: 0, rotate: 8 },
    ],
    baseDur: 3, easing: 'ease-in-out', alternate: true,
  },
  // pan = mp-pan-right 4s linear infinite alternate
  pan: {
    frames: [
      { scale: 1, tx: 5, ty: 0, rotate: 0 },
      { scale: 1, tx: -5, ty: 0, rotate: 0 },
    ],
    baseDur: 4, easing: 'linear', alternate: true,
  },
  // micro = mp-micro 3s ease-in-out infinite (same as vlog)
  micro: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.03, tx: 0.08, ty: 0.08, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 3, easing: 'ease-in-out', alternate: false,
  },
  // sepia = mp-zoom-in 8s ease-in-out infinite alternate + sepia filter
  sepia: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.15, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 8, easing: 'ease-in-out', alternate: true,
  },
  // film = mp-micro 6s ease-in-out infinite + sepia/contrast filter
  film: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1.03, tx: 0.08, ty: 0.08, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 6, easing: 'ease-in-out', alternate: false,
  },
  // mp-shake 0.6s ease-in-out infinite
  // @keyframes mp-shake { 0%,100%{translate(0,0)} 10%{translate(-3px,2px)} 30%{translate(3px,-2px)} 50%{translate(-2px,3px)} 70%{translate(2px,-3px)} 90%{translate(-3px,-2px)} }
  shake: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: -0.3, ty: 0.2, rotate: 0 },
      { scale: 1, tx: 0.3, ty: -0.2, rotate: 0 },
      { scale: 1, tx: -0.2, ty: 0.3, rotate: 0 },
      { scale: 1, tx: 0.2, ty: -0.3, rotate: 0 },
      { scale: 1, tx: -0.3, ty: -0.2, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 0.6, easing: 'ease-in-out', alternate: false,
  },
  // mp-glitch 0.3s steps(5) infinite
  // @keyframes mp-glitch { 0%,100%{translate(0,0)} 15%{translate(-5px,2px)} 30%{translate(5px,-2px)} 45%{translate(-3px,-3px)} 60%{translate(4px,1px)} 75%{translate(-2px,4px)} }
  glitch: {
    frames: [
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
      { scale: 1, tx: -0.5, ty: 0.2, rotate: 0 },
      { scale: 1, tx: 0.5, ty: -0.2, rotate: 0 },
      { scale: 1, tx: -0.3, ty: -0.3, rotate: 0 },
      { scale: 1, tx: 0.4, ty: 0.1, rotate: 0 },
      { scale: 1, tx: -0.2, ty: 0.4, rotate: 0 },
      { scale: 1, tx: 0, ty: 0, rotate: 0 },
    ],
    baseDur: 0.3, easing: 'linear', alternate: false,
  },
};

// ─── 메인 함수 ──────────────────────────────────

/**
 * CSS 프리뷰와 동일한 Ken Burns transform 계산
 * fitAnimToScene 로직을 그대로 재현: 장면 길이에 맞춰 주기 조절 + negative delay
 */
export function computeKenBurns(
  preset: EffectPresetId | string,
  frameN: number,
  totalFrames: number,
  canvasW: number,
  canvasH: number,
  anchorX = 50,
  anchorY = 50,
  fps = 30,
): KenBurnsTransform {
  const def = PRESET_DEFS[preset];
  if (!def) {
    return { scale: 1, translateX: 0, translateY: 0, rotate: 0 };
  }

  const sceneDur = totalFrames / fps;
  const timeSec = frameN / fps;

  // fitAnimToScene 로직 재현: 주기를 장면 길이에 맞춤
  const t = getAnimPhase(timeSec, sceneDur, def.baseDur, def.alternate);

  // 이징 적용
  const easedT = def.easing === 'ease-in-out' ? easeInOut(t) : t;

  // 키프레임 보간
  const kf = interpolateKeyframes(def.frames, easedT);

  // CSS % → 캔버스 픽셀 변환 (% of element = OVERSCALE × canvas)
  const drawW = canvasW * OVERSCALE;
  const drawH = canvasH * OVERSCALE;

  return {
    scale: kf.scale,
    translateX: (kf.tx / 100) * drawW,
    translateY: (kf.ty / 100) * drawH,
    rotate: kf.rotate,
  };
}

/**
 * Canvas에 Ken Burns 효과를 적용하여 이미지를 그림
 * CSS transform-origin 동작을 Canvas로 정확히 재현
 */
export function drawKenBurnsFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  image: ImageBitmap,
  transform: KenBurnsTransform,
  canvasW: number,
  canvasH: number,
  anchorX = 50,
  anchorY = 50,
): void {
  const { scale, translateX, translateY, rotate } = transform;
  const drawW = canvasW * OVERSCALE;
  const drawH = canvasH * OVERSCALE;

  // 이미지 시작 위치 (CSS top:-10% left:-10% 에 해당)
  const imgX = -(drawW - canvasW) / 2;
  const imgY = -(drawH - canvasH) / 2;

  // CSS transform-origin에 해당하는 캔버스 좌표
  const originX = imgX + drawW * (anchorX / 100);
  const originY = imgY + drawH * (anchorY / 100);

  ctx.save();
  // transform-origin으로 이동
  ctx.translate(originX, originY);
  // CSS transform 적용 (translate → rotate → scale 순서)
  ctx.translate(translateX, translateY);
  if (rotate !== 0) ctx.rotate(rotate * Math.PI / 180);
  ctx.scale(scale, scale);
  // transform-origin 복귀
  ctx.translate(-originX, -originY);
  // 이미지 그리기
  ctx.drawImage(image, imgX, imgY, drawW, drawH);
  ctx.restore();
}

// ─── 내부 헬퍼 ──────────────────────────────────

/**
 * CSS fitAnimToScene 로직 재현
 * 장면 길이에 맞춰 애니메이션 주기를 조절하고, 현재 시간에 해당하는 phase(0..1)를 반환
 * negative delay(30%)도 반영
 */
function getAnimPhase(
  timeSec: number,
  sceneDur: number,
  baseDur: number,
  isAlternate: boolean,
): number {
  // fitAnimToScene 로직
  const visualCycle = isAlternate ? baseDur * 2 : baseDur;
  const fullCycles = Math.max(1, Math.round(sceneDur / visualCycle));
  const newDur = Math.max(0.3, sceneDur / (fullCycles * (isAlternate ? 2 : 1)));

  // CSS negative delay: 주기의 45% 앞당겨 시작 (ease-in-out 고려)
  const negDelay = newDur * 0.45;
  const adjustedTime = timeSec + negDelay;

  if (isAlternate) {
    // alternate: 0→1 (forward), 1→0 (backward) 반복
    const cycleDur = newDur * 2;
    let cyclePos = adjustedTime % cycleDur;
    if (cyclePos < 0) cyclePos += cycleDur;

    if (cyclePos < newDur) {
      return cyclePos / newDur; // forward: 0→1
    } else {
      return 1 - (cyclePos - newDur) / newDur; // backward: 1→0
    }
  } else {
    // non-alternate: 0→1 반복
    let cyclePos = adjustedTime % newDur;
    if (cyclePos < 0) cyclePos += newDur;
    return cyclePos / newDur;
  }
}

/** CSS ease-in-out (cubic-bezier(0.42, 0, 0.58, 1)) 근사 */
function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 다중 키프레임 사이를 선형 보간 */
function interpolateKeyframes(frames: KBKeyframe[], t: number): KBKeyframe {
  if (frames.length < 2) return frames[0];

  const clampedT = Math.max(0, Math.min(1, t));
  const segCount = frames.length - 1;
  const scaledT = clampedT * segCount;
  const segIdx = Math.min(Math.floor(scaledT), segCount - 1);
  const segT = scaledT - segIdx;

  const from = frames[segIdx];
  const to = frames[segIdx + 1];

  return {
    scale: from.scale + (to.scale - from.scale) * segT,
    tx: from.tx + (to.tx - from.tx) * segT,
    ty: from.ty + (to.ty - from.ty) * segT,
    rotate: from.rotate + (to.rotate - from.rotate) * segT,
  };
}
