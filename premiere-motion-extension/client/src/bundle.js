/**
 * Motion Master — Bundled CEP Panel Script
 * 자동 생성됨 — 직접 수정하지 말 것. bundle.sh를 실행하여 재생성.
 *
 * ES module import/export를 제거하고 IIFE로 래핑하여
 * CEP file:// 로딩 호환성을 보장한다.
 */
(function() {
'use strict';

// ═══ presets.js ═══
/**
 * Motion Master — Preset Definitions
 * kenBurnsEngine.ts에서 이식한 30개 프리셋 데이터
 *
 * 패널 UI에서 프리셋 그리드 렌더링 + 오버스케일 계산에 사용
 */

// ═══ 프리셋 카테고리 ═══

const PANZOOM_PRESETS = [
  // 기본
  { id: 'fast',       label: '빠른 줌',     icon: '⚡', cat: 'basic' },
  { id: 'smooth',     label: '부드러운 줌',  icon: '🌊', cat: 'basic' },
  { id: 'cinematic',  label: '시네마틱',     icon: '🎬', cat: 'basic' },
  { id: 'zoom',       label: '줌인',        icon: '🔍', cat: 'basic' },
  { id: 'reveal',     label: '리빌',        icon: '🎭', cat: 'basic' },
  { id: 'vintage',    label: '빈티지',      icon: '📷', cat: 'basic' },
  { id: 'documentary',label: '다큐멘터리',   icon: '📹', cat: 'basic' },
  { id: 'timelapse',  label: '타임랩스',    icon: '⏩', cat: 'basic' },
  { id: 'vlog',       label: '브이로그',    icon: '📱', cat: 'basic' },
  // 시네마틱
  { id: 'dynamic',    label: '다이나믹',    icon: '💥', cat: 'cinematic' },
  { id: 'dreamy',     label: '몽환',        icon: '✨', cat: 'cinematic' },
  { id: 'dramatic',   label: '드라마틱',    icon: '🎭', cat: 'cinematic' },
  { id: 'noir',       label: '느와르',      icon: '🖤', cat: 'cinematic' },
  { id: 'diagonal-drift', label: '대각 드리프트', icon: '↗', cat: 'cinematic' },
  { id: 'orbit',      label: '오빗',        icon: '🔄', cat: 'cinematic' },
  { id: 'parallax',   label: '패럴랙스',    icon: '🏔', cat: 'cinematic' },
  { id: 'tilt-shift', label: '틸트 시프트', icon: '📐', cat: 'cinematic' },
  { id: 'spiral-in',  label: '스파이럴',    icon: '🌀', cat: 'cinematic' },
  { id: 'push-pull',  label: '푸쉬풀',      icon: '↕', cat: 'cinematic' },
  { id: 'dolly-zoom', label: '돌리 줌',     icon: '🎥', cat: 'cinematic' },
  { id: 'crane-up',   label: '크레인 업',   icon: '🏗', cat: 'cinematic' },
];

const MOTION_EFFECTS = [
  { id: 'none',         label: '없음',       icon: '⛔' },
  { id: 'slow',         label: '슬로우',     icon: '🐢' },
  { id: 'rotate',       label: '회전',       icon: '🔄' },
  { id: 'rotate-plus',  label: '강회전',     icon: '🌪' },
  { id: 'pan',          label: '패닝',       icon: '➡' },
  { id: 'micro',        label: '미세움직임', icon: '🔬' },
  { id: 'shake',        label: '흔들림',     icon: '📳' },
  { id: 'glitch',       label: '글리치',     icon: '⚡' },
  { id: 'film',         label: '필름',       icon: '🎞' },
  { id: 'sepia',        label: '세피아',     icon: '🟤' },
];

// ═══ 프리셋 데이터 (키프레임 정의) ═══
// motionEngine.jsx의 PRESET_DEFS와 동일한 데이터 (UI 미리보기용)

const PRESET_DATA = {
  fast:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:2, ease:'bezier', alt:true },
  smooth:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:4, ease:'bezier', alt:true },
  cinematic:        { frames: [{s:1.15,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}], dur:5, ease:'bezier', alt:true },
  dynamic:          { frames: [{s:1,tx:-3,ty:-2,r:0},{s:1.1,tx:3,ty:2,r:0},{s:1,tx:-3,ty:-2,r:0}], dur:4, ease:'bezier', alt:false },
  dreamy:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1.08,tx:0,ty:0,r:0.8},{s:1,tx:0,ty:0,r:0}], dur:6, ease:'bezier', alt:false },
  dramatic:         { frames: [{s:1,tx:0,ty:0,r:0},{s:1.18,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}], dur:4, ease:'bezier', alt:false },
  zoom:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:true },
  reveal:           { frames: [{s:1.18,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}], dur:4, ease:'bezier', alt:true },
  vintage:          { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:6, ease:'bezier', alt:true },
  documentary:      { frames: [{s:1,tx:5,ty:0,r:0},{s:1,tx:-5,ty:0,r:0}], dur:6, ease:'linear', alt:true },
  timelapse:        { frames: [{s:1,tx:-5,ty:0,r:0},{s:1,tx:5,ty:0,r:0}], dur:2, ease:'linear', alt:true },
  vlog:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  'diagonal-drift': { frames: [{s:1,tx:4,ty:-4,r:0},{s:1.06,tx:-4,ty:4,r:0}], dur:5, ease:'bezier', alt:true },
  orbit:            { frames: [{s:1.05,tx:0,ty:-3,r:0},{s:1.05,tx:3,ty:0,r:0},{s:1.05,tx:0,ty:3,r:0},{s:1.05,tx:-3,ty:0,r:0},{s:1.05,tx:0,ty:-3,r:0}], dur:6, ease:'bezier', alt:false },
  parallax:         { frames: [{s:1,tx:3,ty:0,r:0},{s:1.1,tx:-3,ty:0,r:0}], dur:5, ease:'bezier', alt:true },
  'tilt-shift':     { frames: [{s:1.05,tx:0,ty:-5,r:0},{s:1.05,tx:0,ty:5,r:0}], dur:5, ease:'bezier', alt:true },
  'spiral-in':      { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:3}], dur:4, ease:'bezier', alt:true },
  'push-pull':      { frames: [{s:1,tx:0,ty:0,r:0},{s:1.12,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  'dolly-zoom':     { frames: [{s:1.15,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:4, ease:'bezier', alt:false },
  'crane-up':       { frames: [{s:1,tx:0,ty:-5,r:0},{s:1.05,tx:0,ty:4,r:0}], dur:5, ease:'bezier', alt:true },
  noir:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:5, ease:'bezier', alt:true },
  slow:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.06,tx:0,ty:0,r:0}], dur:6, ease:'bezier', alt:true },
  rotate:           { frames: [{s:1.05,tx:0,ty:0,r:0},{s:1.05,tx:0,ty:0,r:3}], dur:4, ease:'bezier', alt:true },
  'rotate-plus':    { frames: [{s:1.08,tx:0,ty:0,r:0},{s:1.08,tx:0,ty:0,r:8}], dur:3, ease:'bezier', alt:true },
  pan:              { frames: [{s:1,tx:5,ty:0,r:0},{s:1,tx:-5,ty:0,r:0}], dur:4, ease:'linear', alt:true },
  micro:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  sepia:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:8, ease:'bezier', alt:true },
  film:             { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:6, ease:'bezier', alt:false },
  shake:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1,tx:-0.3,ty:0.2,r:0},{s:1,tx:0.3,ty:-0.2,r:0},{s:1,tx:-0.2,ty:0.3,r:0},{s:1,tx:0.2,ty:-0.3,r:0},{s:1,tx:-0.3,ty:-0.2,r:0},{s:1,tx:0,ty:0,r:0}], dur:0.6, ease:'bezier', alt:false },
  glitch:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1,tx:-0.5,ty:0.2,r:0},{s:1,tx:0.5,ty:-0.2,r:0},{s:1,tx:-0.3,ty:-0.3,r:0},{s:1,tx:0.4,ty:0.1,r:0},{s:1,tx:-0.2,ty:0.4,r:0},{s:1,tx:0,ty:0,r:0}], dur:0.3, ease:'linear', alt:false },
};

// ═══ 오버스케일 계산 (패널 UI 표시용) ═══

function calcFrameCoverageScale(frame, anchorX = 50, anchorY = 50, intensity = 1, seqW = 1920, seqH = 1080) {
  const dx = (((frame.tx * intensity) + (50 - anchorX)) / 100) * seqW;
  const dy = (((frame.ty * intensity) + (50 - anchorY)) / 100) * seqH;
  const rotationRad = Math.abs(frame.r * intensity) * Math.PI / 180;
  const cosT = Math.cos(rotationRad);
  const sinT = Math.sin(rotationRad);
  const halfW = seqW / 2;
  const halfH = seqH / 2;
  let requiredScale = 1;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  for (const [cx, cy] of corners) {
    const px = (cx * halfW) - dx;
    const py = (cy * halfH) - dy;
    const qx = (px * cosT) + (py * sinT);
    const qy = (-px * sinT) + (py * cosT);
    requiredScale = Math.max(requiredScale, Math.abs(qx) / halfW, Math.abs(qy) / halfH);
  }

  return requiredScale * 1.05;
}

function calcOverscale(presetId, seqW = 1920, seqH = 1080, anchorX = 50, anchorY = 50, intensity = 1) {
  const preset = PRESET_DATA[presetId];
  if (!preset) return 1.05;

  let maxCoverage = 1.05;
  for (const f of preset.frames) {
    maxCoverage = Math.max(
      maxCoverage,
      calcFrameCoverageScale(f, anchorX, anchorY, intensity, seqW, seqH)
    );
  }
  return maxCoverage;
}

// ═══ smartRandom.js ═══
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
const RANDOM_MOTION_EFFECT_PRESETS = ['slow', 'micro', 'rotate', 'film'];
const RANDOM_MOTION_EFFECT_PRESET_SET = new Set(RANDOM_MOTION_EFFECT_PRESETS);

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
function smartRandomAssign(clipCount, options = {}) {
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
    const candidatePool =
      allowMotionEffects && Math.random() > 0.5
        ? RANDOM_MOTION_EFFECT_PRESETS
        : availablePresets;

    do {
      preset = pickRandom(candidatePool);
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

    // 방향 업데이트 (neutral 프리셋은 이전 방향 유지 — zoom-in→neutral→zoom-in 방지)
    if (ZOOM_IN_PRESETS.has(preset)) lastZoomDir = 'in';
    else if (ZOOM_OUT_PRESETS.has(preset)) lastZoomDir = 'out';
    // neutral은 lastZoomDir 유지 (null로 리셋 안 함)

    if (PAN_LEFT_PRESETS.has(preset)) lastPanDir = 'left';
    else if (PAN_RIGHT_PRESETS.has(preset)) lastPanDir = 'right';
    // neutral은 lastPanDir 유지

    prevPreset = preset;

    // 규칙 4: 앵커 포인트
    const anchor = getAnchorForPreset(preset);

    // 규칙 5: 강도 편차
    const intensity = 1.0 + randFloat(-intensityVariance, intensityVariance);

    // 모션 이펙트 (옵션)
    const motionEffect = RANDOM_MOTION_EFFECT_PRESET_SET.has(preset) ? preset : 'none';

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
function applyFocalPoints(assignments, focalPoints) {
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

// ═══ focalDetector.js ═══
/**
 * Motion Master — Focal Point Detector
 * 이미지에서 피사체/얼굴 위치를 감지하여 앵커 포인트를 자동 설정한다.
 *
 * Level 1: 밝기 히스토그램 기반 (API 불필요, 즉시)
 * Level 2: ONNX BlazeFace 모델 (API 불필요, 2MB 내장) — 추후 통합
 * Level 3: OpenAI Vision API (옵션, 사용자 API 키 필요)
 */

// ═══ Level 1: 밝기 기반 포컬 포인트 ═══

/**
 * 이미지의 밝기 분포를 분석하여 가장 밝은 영역의 중심을 포컬 포인트로 반환한다.
 * 사진에서 피사체는 대체로 밝은 영역에 위치한다는 휴리스틱.
 *
 * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} source - 이미지 소스
 * @returns {{x: number, y: number, confidence: number}} 좌표 (0-100%), 신뢰도 (0-1)
 */
function detectBrightnessFocal(source) {
  const canvas = document.createElement('canvas');
  // 분석용 작은 해상도 (성능)
  const w = 64;
  const h = 48;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 3x3 그리드로 밝기 합산
  const gridCols = 3;
  const gridRows = 3;
  const cellW = Math.floor(w / gridCols);
  const cellH = Math.floor(h / gridRows);
  const gridBrightness = new Array(gridCols * gridRows).fill(0);
  const gridCount = new Array(gridCols * gridRows).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const gx = Math.min(Math.floor(x / cellW), gridCols - 1);
      const gy = Math.min(Math.floor(y / cellH), gridRows - 1);
      const gi = gy * gridCols + gx;
      gridBrightness[gi] += brightness;
      gridCount[gi]++;
    }
  }

  // 평균 밝기가 가장 높은 셀 찾기
  let maxAvg = 0;
  let maxIdx = 4; // 기본: 중앙
  for (let i = 0; i < gridBrightness.length; i++) {
    const avg = gridCount[i] > 0 ? gridBrightness[i] / gridCount[i] : 0;
    if (avg > maxAvg) {
      maxAvg = avg;
      maxIdx = i;
    }
  }

  // 셀 인덱스 → 좌표 (%)
  const gx = maxIdx % gridCols;
  const gy = Math.floor(maxIdx / gridCols);
  const x = ((gx + 0.5) / gridCols) * 100;
  const y = ((gy + 0.5) / gridRows) * 100;

  // 신뢰도: 최대 밝기와 평균 밝기의 차이 비율
  const totalAvg = gridBrightness.reduce((a, b) => a + b, 0) /
                   gridCount.reduce((a, b) => a + b, 0);
  const confidence = Math.min(1, Math.max(0.3, (maxAvg - totalAvg) / 128));

  return { x: Math.round(x), y: Math.round(y), confidence };
}

// ═══ URL 헬퍼 ═══

/**
 * OS 파일 경로를 안전한 file:// URL로 변환한다.
 * macOS 한글/공백/특수문자 경로 대응.
 */
function toFileUrl(mediaPath) {
  const rawPath = String(mediaPath || '').trim();
  if (!rawPath) return '';
  if (/^file:\/\//i.test(rawPath)) return rawPath;

  let p = rawPath.replace(/\\/g, '/');
  if (p.indexOf('//') === 0) {
    return encodeURI('file:' + p).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }
  if (p.charAt(0) !== '/') p = '/' + p;
  return encodeURI('file://' + p).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

const FOCAL_DEFAULT = { x: 50, y: 50, confidence: 0 };
const FOCAL_TIMEOUT = 5000; // 5초 타임아웃

// ═══ 클립 썸네일 추출 ═══

/**
 * 클립의 미디어 파일 경로에서 썸네일을 추출한다.
 * CEP 패널에서 file:// 프로토콜로 로드.
 *
 * @param {string} mediaPath - 미디어 파일 경로
 * @returns {Promise<{x, y, confidence}>} 포컬 포인트
 */
async function detectFocalFromPath(mediaPath) {
  return new Promise((resolve) => {
    let img = null;
    let video = null;
    let timer = null;
    let resolved = false;

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (img) {
        img.onload = null;
        img.onerror = null;
        img = null;
      }
      if (video) {
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        try { video.pause(); } catch (e) {}
        try { video.removeAttribute('src'); video.load(); } catch (e2) {}
        video = null;
      }
    }

    function done(result) {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    }
    timer = setTimeout(() => done(FOCAL_DEFAULT), FOCAL_TIMEOUT);

    const mediaUrl = toFileUrl(mediaPath);
    if (!mediaUrl) {
      done(FOCAL_DEFAULT);
      return;
    }

    // 이미지 파일인 경우
    if (/\.(jpe?g|png|bmp|tiff?|webp|gif)$/i.test(mediaPath)) {
      img = new Image();
      img.onload = () => {
        try {
          done(detectBrightnessFocal(img));
        } catch (e) {
          done(FOCAL_DEFAULT);
        }
      };
      img.onerror = () => done(FOCAL_DEFAULT);
      img.src = mediaUrl;
      return;
    }

    // 동영상 파일인 경우 — 1초 지점 프레임 캡처
    if (/\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(mediaPath)) {
      video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      video.onloadedmetadata = () => {
        try {
          video.currentTime = Math.min(1, Math.max(0, (video.duration || 1) * 0.1));
        } catch (e) {
          done(FOCAL_DEFAULT);
        }
      };
      video.onseeked = () => {
        try {
          done(detectBrightnessFocal(video));
        } catch (e) {
          done(FOCAL_DEFAULT);
        }
      };
      video.onerror = () => done(FOCAL_DEFAULT);
      video.src = mediaUrl;
      return;
    }

    // 알 수 없는 형식
    done(FOCAL_DEFAULT);
  });
}

/**
 * 여러 클립의 포컬 포인트를 배치 감지한다.
 *
 * @param {string[]} mediaPaths - 미디어 파일 경로 배열
 * @returns {Promise<Array<{x, y, confidence}>>}
 */
async function detectFocalBatch(mediaPaths) {
  const results = [];
  for (const path of mediaPaths) {
    const focal = await detectFocalFromPath(path);
    results.push(focal);
  }
  return results;
}

// ═══ app.js ═══
/**
 * Motion Master — CEP Panel Application
 * Premiere Pro Extension 메인 패널 로직
 *
 * CSInterface로 ExtendScript(motionEngine.jsx)와 통신하여
 * 선택된 클립에 Ken Burns 모션을 적용한다.
 */


// ═══ CSInterface 초기화 ═══

let csInterface;
try {
  csInterface = new CSInterface();
} catch (e) {
  // 브라우저 테스트 모드 (Premiere 외부)
  csInterface = null;
  console.warn('[MotionMaster] CSInterface not available — running in browser test mode');
}

// ═══ 상태 ═══

const state = {
  selectedClips: [],
  currentPreset: 'cinematic',
  currentMotion: 'none',
  anchorX: 50,
  anchorY: 50,
  intensity: 1.0,
  assignments: [],       // 스마트 랜덤 결과
  allowMotionEffects: false,
  busy: false,           // 적용 중 레이스 컨디션 방지
};

// ═══ ExtendScript 호출 헬퍼 ═══

const EVALSCRIPT_TIMEOUT_MS = 15000;

function getActivePresetId() {
  return state.currentMotion !== 'none' ? state.currentMotion : state.currentPreset;
}

function getClipListSignature(clips) {
  return clips
    .map((clip) => [clip.trackIdx, clip.clipIdx, clip.start, clip.end].join(':'))
    .join('|');
}

function clearAssignments() {
  if (state.assignments.length === 0) return;
  state.assignments = [];
  renderAssignmentList();
}

function evalScript(script) {
  return new Promise((resolve, reject) => {
    if (!csInterface) {
      console.log('[Mock ExtendScript]', script.substring(0, 100));
      resolve('{}');
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('ExtendScript timeout after ' + EVALSCRIPT_TIMEOUT_MS + 'ms'));
    }, EVALSCRIPT_TIMEOUT_MS);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback();
    };

    try {
      csInterface.evalScript(script, (result) => {
        finish(() => {
          if (result === 'EvalScript error.') {
            reject(new Error('ExtendScript evaluation error'));
          } else {
            resolve(result);
          }
        });
      });
    } catch (e) {
      finish(() => reject(e));
    }
  });
}

// ═══ 클립 조회 (자동 감지 포함) ═══

let _refreshPromise = null;
let _refreshWantsStatus = false;

async function refreshSelectedClips(silent, force) {
  if (silent !== true) _refreshWantsStatus = true;
  // force=true: 진행 중인 polling Promise를 무시하고 항상 새 조회 시작
  // (Apply/Random/Smart 버튼 클릭 시 stale 데이터 사용 방지)
  if (_refreshPromise && !force) return _refreshPromise;
  // force 시 이전 Promise가 있으면 완료될 때까지 기다린 후 새로 시작
  if (force && _refreshPromise) {
    try { await _refreshPromise; } catch (e) {}
  }

  _refreshPromise = (async () => {
    try {
      const result = await evalScript('getSelectedClips()');
      const data = JSON.parse(result);
      const shouldShowStatus = _refreshWantsStatus;
      const clips = Array.isArray(data) ? data : [];
      const prevSignature = getClipListSignature(state.selectedClips);
      const nextSignature = getClipListSignature(clips);
      const changed = nextSignature !== prevSignature;

      if (data.error) {
        if (shouldShowStatus) updateStatus(data.error, 'error');
        state.selectedClips = [];
        clearAssignments();
      } else {
        state.selectedClips = clips;
        if (changed) clearAssignments();
        if (shouldShowStatus || changed) {
          updateStatus(clips.length + ' clips selected', 'success');
        }
      }
      renderClipList();
    } catch (e) {
      state.selectedClips = [];
      clearAssignments();
      renderClipList();
      if (_refreshWantsStatus) updateStatus('Clip error: ' + e.message, 'error');
    } finally {
      _refreshPromise = null;
      _refreshWantsStatus = false;
    }
  })();

  return _refreshPromise;
}

// 2초마다 자동 감지 (Premiere에서 선택 변경 시 자동 반영)
let _pollTimer = null;
function startClipPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    if (!state.busy) refreshSelectedClips(true);
  }, 2000);
}
function stopClipPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ═══ 모션 적용 ═══

async function applyToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    const clipsSnapshot = state.selectedClips.slice();
    const presetId = getActivePresetId();
    const assignments = clipsSnapshot.map((clip) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId,
      anchorX: state.anchorX,
      anchorY: state.anchorY,
      intensity: state.intensity,
    }));

    clearAssignments();
    await applyBatch(assignments);
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applyRandomToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    updateStatus('Applying random motion...', 'info');
    const clipsSnapshot = state.selectedClips.slice();

    const randomAssignments = smartRandomAssign(clipsSnapshot.length, {
      allowMotionEffects: state.allowMotionEffects,
      intensityVariance: 0.1,
    });

    state.assignments = randomAssignments;

    const batch = clipsSnapshot.map((clip, i) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: randomAssignments[i].presetId,
      anchorX: randomAssignments[i].anchorX,
      anchorY: randomAssignments[i].anchorY,
      intensity: randomAssignments[i].intensity,
    }));

    await applyBatch(batch);
    renderAssignmentList();
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applySmartToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    updateStatus('Analyzing focal points...', 'info');
    const clipsSnapshot = state.selectedClips.slice();

    // 1) 스마트 랜덤 배정
    const randomAssignments = smartRandomAssign(clipsSnapshot.length, {
      allowMotionEffects: state.allowMotionEffects,
      intensityVariance: 0.1,
    });

    // 2) 피사체 감지로 앵커 오버라이드
    const mediaPaths = clipsSnapshot.map(c => c.mediaPath);
    const focalPoints = await detectFocalBatch(mediaPaths);

    const finalAssignments = randomAssignments.map((a, i) => {
      const focal = focalPoints[i];
      if (focal && focal.confidence > 0.3) {
        return { ...a, anchorX: focal.x, anchorY: focal.y };
      }
      return a;
    });

    state.assignments = finalAssignments;

    const batch = clipsSnapshot.map((clip, i) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: finalAssignments[i].presetId,
      anchorX: finalAssignments[i].anchorX,
      anchorY: finalAssignments[i].anchorY,
      intensity: finalAssignments[i].intensity,
    }));

    await applyBatch(batch);
    renderAssignmentList();
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applyBatch(assignments) {
  try {
    const json = JSON.stringify(assignments)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const result = await evalScript("applyMotionBatch('" + json + "')");
    const data = JSON.parse(result);

    if (data.error) {
      updateStatus('적용 실패: ' + data.error, 'error');
    } else {
      const okCount = data.filter(r => r.result.indexOf('OK') === 0).length;
      const skipCount = data.filter(r => r.result.indexOf('Skip:') === 0).length;
      const errCount = data.length - okCount - skipCount;
      if (errCount > 0) {
        updateStatus(okCount + '개 성공, ' + errCount + '개 실패, ' + skipCount + '개 스킵', 'warn');
      } else if (skipCount > 0) {
        updateStatus(okCount + '개 적용, ' + skipCount + '개 스킵 (기존 모션 키프레임 보호)', 'warn');
      } else {
        updateStatus(okCount + '개 클립에 모션 적용 완료!', 'success');
      }
    }
  } catch (e) {
    updateStatus('배치 적용 실패: ' + e.message, 'error');
  }
}

async function removeMotion() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    const result = await evalScript('removeMotionFromSelected()');
    const type = result.indexOf('Error') === 0
      ? 'error'
      : (result.indexOf('Warn:') === 0 ? 'warn' : 'success');
    const message = result.indexOf('Warn:') === 0 ? result.substring(6) : result;
    if (type !== 'error') clearAssignments();
    updateStatus(message, type);
  } catch (e) {
    updateStatus('되돌리기 실패: ' + e.message, 'error');
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

// ═══ UI 렌더링 ═══

function renderPresetGrid() {
  const basicGrid = document.getElementById('basic-presets');
  const cineGrid = document.getElementById('cinematic-presets');
  const motionGrid = document.getElementById('motion-effects');
  const overscaleFor = (presetId) => Math.round(
    calcOverscale(presetId, 1920, 1080, state.anchorX, state.anchorY, state.intensity) * 100
  );

  if (basicGrid) {
    basicGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'basic')
      .map(p => `<button class="preset-btn ${(state.currentMotion === 'none' && state.currentPreset === p.id) ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${overscaleFor(p.id)}%</span>
      </button>`).join('');
  }

  if (cineGrid) {
    cineGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'cinematic')
      .map(p => `<button class="preset-btn ${(state.currentMotion === 'none' && state.currentPreset === p.id) ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${overscaleFor(p.id)}%</span>
      </button>`).join('');
  }

  if (motionGrid) {
    motionGrid.innerHTML = MOTION_EFFECTS
      .map(m => `<button class="tag-btn ${state.currentMotion === m.id ? 'active' : ''}"
        data-motion="${m.id}" onclick="selectMotion('${m.id}')">
        ${m.label}
      </button>`).join('');
  }
}

function renderClipList() {
  const el = document.getElementById('clip-list');
  const badge = document.getElementById('clip-count');
  if (!el) return;

  if (badge) badge.textContent = state.selectedClips.length;

  if (state.selectedClips.length === 0) {
    el.innerHTML = '<div class="clip-empty">Select clips in timeline</div>';
    return;
  }

  // XSS 방지: textContent로 안전하게 렌더링
  el.innerHTML = '';
  state.selectedClips.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'clip-row';
    const num = document.createElement('span');
    num.className = 'clip-num';
    num.textContent = i + 1;
    const name = document.createElement('span');
    name.className = 'clip-name';
    name.textContent = c.name;
    name.title = c.mediaPath || '';
    const dur = document.createElement('span');
    dur.className = 'clip-dur';
    dur.textContent = c.dur.toFixed(1) + 's';
    row.appendChild(num);
    row.appendChild(name);
    row.appendChild(dur);
    el.appendChild(row);
  });
}

function renderAssignmentList() {
  const el = document.getElementById('assignment-list');
  if (!el) return;

  if (state.assignments.length === 0) {
    el.innerHTML = ''; return;
  }

  // XSS 방지: textContent로 안전하게 렌더링
  el.innerHTML = '';
  state.assignments.forEach((a, i) => {
    const clip = state.selectedClips[i];
    const clipName = clip ? clip.name : 'Clip ' + (i + 1);
    const item = document.createElement('div');
    item.className = 'assign-item';
    const num = document.createElement('span');
    num.className = 'clip-num';
    num.textContent = i + 1;
    const nameEl = document.createElement('span');
    nameEl.className = 'clip-name';
    nameEl.textContent = clipName;
    const tag = document.createElement('span');
    tag.className = 'assign-tag';
    tag.textContent = a.presetId;
    item.appendChild(num);
    item.appendChild(nameEl);
    item.appendChild(tag);
    el.appendChild(item);
  });
}

function updateStatus(message, type) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
  el.className = type || '';
}

// ═══ 이벤트 핸들러 (window에 노출) ═══

window.selectPreset = function(id) {
  state.currentPreset = id;
  state.currentMotion = 'none';
  renderPresetGrid();
  updateAnchorDisplay();
};

window.selectMotion = function(id) {
  state.currentMotion = id;
  renderPresetGrid();
};

window.onAnchorChange = function(axis, value) {
  if (axis === 'x') state.anchorX = parseInt(value);
  if (axis === 'y') state.anchorY = parseInt(value);
  renderPresetGrid();
  updateAnchorDisplay();
};

window.onIntensityChange = function(value) {
  state.intensity = parseFloat(value);
  document.getElementById('intensity-value').textContent = Math.round(value * 100) + '%';
  renderPresetGrid();
};

window.toggleMotionEffects = function(checked) {
  state.allowMotionEffects = checked;
};

function updateAnchorDisplay() {
  const dot = document.getElementById('anchor-dot');
  const xLabel = document.getElementById('anchor-x-value');
  const yLabel = document.getElementById('anchor-y-value');
  const xSlider = document.getElementById('anchor-x');
  const ySlider = document.getElementById('anchor-y');

  if (dot) {
    dot.style.left = state.anchorX + '%';
    dot.style.top = state.anchorY + '%';
  }
  if (xLabel) xLabel.textContent = state.anchorX + '%';
  if (yLabel) yLabel.textContent = state.anchorY + '%';
  if (xSlider) xSlider.value = state.anchorX;
  if (ySlider) ySlider.value = state.anchorY;
}

// ═══ 초기화 ═══

window.addEventListener('DOMContentLoaded', () => {
  renderPresetGrid();
  updateAnchorDisplay();

  // 버튼 바인딩
  document.getElementById('btn-refresh')?.addEventListener('click', refreshSelectedClips);
  document.getElementById('btn-apply')?.addEventListener('click', applyToSelected);
  document.getElementById('btn-random')?.addEventListener('click', applyRandomToSelected);
  document.getElementById('btn-smart')?.addEventListener('click', applySmartToSelected);
  document.getElementById('btn-remove')?.addEventListener('click', removeMotion);

  if (csInterface) {
    updateStatus('Connected', 'success');
    refreshSelectedClips();
    startClipPolling();
  } else {
    updateStatus('Test mode (no Premiere)', 'warn');
  }
});

// 글로벌 노출 (onclick에서 접근)
window.refreshSelectedClips = refreshSelectedClips;
window.applyToSelected = applyToSelected;
window.applyRandomToSelected = applyRandomToSelected;
window.applySmartToSelected = applySmartToSelected;
window.removeMotion = removeMotion;

// ═══ 디버그 헬퍼 (Console에서 호출) ═══
window.debugMotion = async function() {
  console.log('[MotionMaster] 🔍 Running diagnostics...');
  try {
    const result = await evalScript('debugMotion()');
    const data = JSON.parse(result);
    if (data.log) {
      console.log('[MotionMaster] ═══ DIAGNOSTICS ═══');
      data.log.forEach(line => console.log('  ' + line));
      console.log('[MotionMaster] ═══════════════════');
    }
    if (data.error) {
      console.error('[MotionMaster] ❌', data.error);
    }
    return data;
  } catch (e) {
    console.error('[MotionMaster] Debug failed:', e);
  }
};

})();
