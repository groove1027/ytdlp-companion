/**
 * Motion Master — Smart Random Assignment
 * 다중 클립에 자연스러운 모션을 자동 배정하는 스마트 랜덤 엔진
 *
 * 규칙:
 * 1. 연속 동일 프리셋 금지
 * 2. 줌인 → 줌아웃 교차
 * 3. 패닝 좌↔우 교차
 * 4. 앵커는 삼분할 포인트 + 프리셋별 최적 범위
 * 5. 강도 ±10% 랜덤 편차
 * 6. 오버스케일 자동 계산
 */

import { PANZOOM_PRESETS, calcOverscale } from './presets.js';

// ═══ 프리셋별 앵커 최적 범위 ═══

const ANCHOR_RULES = {
  fast:              { x: [35, 65], y: [35, 55] },
  smooth:            { x: [35, 65], y: [35, 55] },
  cinematic:         { x: [40, 60], y: [30, 50] },
  dynamic:           { x: [30, 70], y: [30, 60] },
  dreamy:            { x: [40, 60], y: [40, 60] },
  dramatic:          { x: [35, 65], y: [35, 60] },
  zoom:              { x: [35, 65], y: [35, 55] },
  reveal:            { x: [35, 65], y: [30, 55] },
  vintage:           { x: [35, 65], y: [40, 60] },
  documentary:       { x: [10, 30], y: [40, 60] },  // 좌측 시작
  timelapse:         { x: [70, 90], y: [40, 60] },  // 우측 시작
  vlog:              { x: [40, 60], y: [40, 55] },
  'diagonal-drift':  { x: [25, 45], y: [25, 45] },
  orbit:             { x: [40, 60], y: [40, 60] },
  parallax:          { x: [30, 50], y: [35, 55] },
  'tilt-shift':      { x: [40, 60], y: [30, 45] },
  'spiral-in':       { x: [40, 60], y: [35, 55] },
  'push-pull':       { x: [30, 70], y: [30, 70] },
  'dolly-zoom':      { x: [35, 65], y: [35, 60] },
  'crane-up':        { x: [40, 60], y: [60, 80] },  // 하단
  noir:              { x: [35, 65], y: [35, 55] },
};

// 삼분할 법칙 포인트 (폴백)
const RULE_OF_THIRDS = [
  { x: 33, y: 33 },
  { x: 66, y: 33 },
  { x: 50, y: 50 },
  { x: 33, y: 66 },
  { x: 66, y: 66 },
];

// ═══ 줌 방향 분류 ═══

const ZOOM_IN_PRESETS = new Set([
  'fast', 'smooth', 'zoom', 'vintage', 'noir', 'sepia',
  'spiral-in', 'slow',
]);
const ZOOM_OUT_PRESETS = new Set([
  'cinematic', 'reveal',
]);
// 나머지: neutral (방향 없음)

// 패닝 방향 분류
const PAN_LEFT_PRESETS = new Set(['documentary', 'parallax']);
const PAN_RIGHT_PRESETS = new Set(['timelapse']);

// ═══ 유틸리티 ═══

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAnchorForPreset(presetId) {
  const rule = ANCHOR_RULES[presetId];
  if (rule) {
    return {
      x: randInt(rule.x[0], rule.x[1]),
      y: randInt(rule.y[0], rule.y[1]),
    };
  }
  // 폴백: 삼분할 포인트
  return pickRandom(RULE_OF_THIRDS);
}

// ═══ 메인: 스마트 랜덤 배정 ═══

/**
 * 클립 N개에 대해 스마트 랜덤 모션 배정을 생성한다.
 *
 * @param {number} clipCount - 클립 수
 * @param {Object} [options]
 * @param {boolean} [options.allowMotionEffects=false] - 모션 이펙트도 추가 배정
 * @param {number}  [options.intensityVariance=0.1] - 강도 편차 (0.1 = ±10%)
 * @returns {Array<{presetId, anchorX, anchorY, intensity, motionEffect}>}
 */
export function smartRandomAssign(clipCount, options = {}) {
  const {
    allowMotionEffects = false,
    intensityVariance = 0.1,
  } = options;

  const availablePresets = PANZOOM_PRESETS.map(p => p.id);
  const assignments = [];
  let prevPreset = null;
  let lastZoomDir = null;  // 'in' | 'out' | null
  let lastPanDir = null;   // 'left' | 'right' | null

  for (let i = 0; i < clipCount; i++) {
    let preset;
    let attempts = 0;

    do {
      preset = pickRandom(availablePresets);
      attempts++;

      // 규칙 1: 연속 동일 금지
      if (preset === prevPreset && attempts < 20) continue;

      // 규칙 2: 줌 방향 교차
      if (lastZoomDir === 'in' && ZOOM_IN_PRESETS.has(preset) && attempts < 15) continue;
      if (lastZoomDir === 'out' && ZOOM_OUT_PRESETS.has(preset) && attempts < 15) continue;

      // 규칙 3: 패닝 방향 교차
      if (lastPanDir === 'left' && PAN_LEFT_PRESETS.has(preset) && attempts < 15) continue;
      if (lastPanDir === 'right' && PAN_RIGHT_PRESETS.has(preset) && attempts < 15) continue;

      break;
    } while (attempts < 30);

    // 방향 업데이트
    if (ZOOM_IN_PRESETS.has(preset)) lastZoomDir = 'in';
    else if (ZOOM_OUT_PRESETS.has(preset)) lastZoomDir = 'out';
    else lastZoomDir = null;

    if (PAN_LEFT_PRESETS.has(preset)) lastPanDir = 'left';
    else if (PAN_RIGHT_PRESETS.has(preset)) lastPanDir = 'right';
    else lastPanDir = null;

    prevPreset = preset;

    // 규칙 4: 앵커 포인트
    const anchor = getAnchorForPreset(preset);

    // 규칙 5: 강도 편차
    const intensity = 1.0 + randFloat(-intensityVariance, intensityVariance);

    // 모션 이펙트 (옵션)
    let motionEffect = 'none';
    if (allowMotionEffects && Math.random() > 0.5) {
      const effects = ['slow', 'micro', 'rotate', 'film'];
      motionEffect = pickRandom(effects);
    }

    assignments.push({
      presetId: preset,
      anchorX: anchor.x,
      anchorY: anchor.y,
      intensity: parseFloat(intensity.toFixed(2)),
      motionEffect,
      overscale: Math.round(calcOverscale(preset) * 100),
    });
  }

  return assignments;
}

/**
 * 피사체 감지 결과로 앵커를 오버라이드한다.
 *
 * @param {Array} assignments - smartRandomAssign() 결과
 * @param {Array} focalPoints - [{x, y, confidence}] 피사체 좌표 (%)
 * @returns {Array} 앵커 업데이트된 배정 배열
 */
export function applyFocalPoints(assignments, focalPoints) {
  return assignments.map((a, i) => {
    const focal = focalPoints[i];
    if (focal && focal.confidence > 0.5) {
      return {
        ...a,
        anchorX: Math.round(focal.x),
        anchorY: Math.round(focal.y),
      };
    }
    return a;
  });
}
