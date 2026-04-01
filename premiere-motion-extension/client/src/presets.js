/**
 * Motion Master — Preset Definitions
 * kenBurnsEngine.ts에서 이식한 30개 프리셋 데이터
 *
 * 패널 UI에서 프리셋 그리드 렌더링 + 오버스케일 계산에 사용
 */

// ═══ 프리셋 카테고리 ═══

export const PANZOOM_PRESETS = [
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

export const MOTION_EFFECTS = [
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

export const PRESET_DATA = {
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

export function calcOverscale(presetId) {
  const preset = PRESET_DATA[presetId];
  if (!preset) return 1.05;

  let maxScale = 0, maxPanX = 0, maxPanY = 0, maxRotate = 0;
  for (const f of preset.frames) {
    maxScale = Math.max(maxScale, f.s);
    maxPanX = Math.max(maxPanX, Math.abs(f.tx));
    maxPanY = Math.max(maxPanY, Math.abs(f.ty));
    maxRotate = Math.max(maxRotate, Math.abs(f.r));
  }

  const rotateMargin = maxRotate > 0 ? (1 + maxRotate * 0.006) : 1;
  const panMargin = 1 + (Math.max(maxPanX, maxPanY) / 100);
  return maxScale * panMargin * rotateMargin * 1.05;
}
