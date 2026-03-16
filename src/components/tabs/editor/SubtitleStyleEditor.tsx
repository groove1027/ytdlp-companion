import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { logger } from '../../../services/LoggerService';
import type { SubtitleTemplate, SubtitleStyle } from '../../../types';
import { FONT_LIBRARY, FONT_CATEGORY_LABELS, getFontsByCategory, getFontByFamily } from '../../../constants/fontLibrary';
import type { FontCategory, FontEntry } from '../../../constants/fontLibrary';
import { loadFont } from '../../../services/fontLoaderService';
import { SUBTITLE_TEMPLATES, SUBTITLE_CAT_TABS } from '../../../constants/subtitleTemplates';
import type { SubtitleCategoryId } from '../../../constants/subtitleTemplates';
import SafeZoneOverlay from '../editroom/SafeZoneOverlay';
import SafeZonePanel from '../editroom/SafeZonePanel';
import { showToast } from '../../../stores/uiStore';
import { evolinkChat } from '../../../services/evolinkService';

const TEMPLATES = SUBTITLE_TEMPLATES;

// ─── 사용자 프리셋 저장 (localStorage) ───
const PRESET_STORAGE_KEY = 'SUBTITLE_USER_PRESETS';
const MAX_PRESETS = 10;

interface SavedSubtitlePreset {
  id: string;
  name: string;
  style: SubtitleStyle;
  createdAt: number;
}

function loadPresets(): SavedSubtitlePreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { logger.trackSwallowedError('SubtitleStyleEditor:loadPresets', e); return []; }
}

function savePresets(presets: SavedSubtitlePreset[]): void {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

type Orientation = 'horizontal' | 'vertical';

const FONT_CAT_KEYS: (FontCategory | 'all')[] = ['all', 'gothic', 'serif', 'display', 'handwriting', 'art', 'pixel'];

// ─── 슬라이더 + 직접입력 (blur/Enter 시에만 클램핑 — 타이핑 중 자유 입력) ───
const SliderRow: React.FC<{ label: string; value: number; set: (v: number) => void; min: number; max: number; step: number; unit?: string }> = ({ label, value, set, min, max, step, unit }) => {
  const display = step < 1 ? value.toFixed(1) : String(value);
  const [localText, setLocalText] = React.useState(display);
  const [editing, setEditing] = React.useState(false);

  // 외부 value 변경 시 로컬 텍스트 동기화 (슬라이더 조작 등)
  React.useEffect(() => {
    if (!editing) setLocalText(display);
  }, [display, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(localText);
    if (!isNaN(n) && localText.trim() !== '') {
      const clamped = Math.min(max, Math.max(min, step < 1 ? Math.round(n * 10) / 10 : Math.round(n)));
      set(clamped);
      setLocalText(step < 1 ? clamped.toFixed(1) : String(clamped));
    } else {
      setLocalText(display);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0">
      <span className="text-[13px] text-gray-300 font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={editing ? localText : display}
          onFocus={() => { setEditing(true); setLocalText(display); }}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-xs text-amber-400 font-mono text-center focus:outline-none focus:border-amber-500/50"
        />
        <span className="text-xs text-gray-500 w-5">{unit || ''}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="col-span-2 w-full accent-amber-500 mt-0.5" />
    </div>
  );
};

// ─── 수평/수직 정렬 상수 ───
const H_ALIGNS: { v: 'left' | 'center' | 'right'; label: string; icon: string }[] = [
  { v: 'left', label: '왼쪽', icon: '⫷' },
  { v: 'center', label: '가운데', icon: '⫶' },
  { v: 'right', label: '오른쪽', icon: '⫸' },
];
const V_POSITIONS: { v: 'top' | 'middle' | 'bottom'; label: string; posY: number }[] = [
  { v: 'top', label: '상단', posY: 75 },
  { v: 'middle', label: '중앙', posY: 45 },
  { v: 'bottom', label: '하단', posY: 10 },
];
const vAlignFromPosY = (y: number): 'top' | 'middle' | 'bottom' => y >= 60 ? 'top' : y >= 25 ? 'middle' : 'bottom';

// ─── 애니메이션 프리셋 ───
interface AnimPreset {
  id: string;
  name: string;
  keyframe: string;
  dur: number;
  ease: string;
  fill: string;
  iter: number; // 0 = infinite
}

const ANIM_PRESETS: AnimPreset[] = [
  { id: 'none', name: '없음', keyframe: '', dur: 0, ease: '', fill: '', iter: 1 },
  // ── 단조로운 (입장) ──
  { id: 'fadeIn', name: '페이드 인', keyframe: 'subAnim-fadeIn', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'fadeInUp', name: '아래서 등장', keyframe: 'subAnim-fadeInUp', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'fadeInDown', name: '위에서 등장', keyframe: 'subAnim-fadeInDown', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'slideL', name: '왼쪽 슬라이드', keyframe: 'subAnim-slideL', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'slideR', name: '오른쪽 슬라이드', keyframe: 'subAnim-slideR', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'zoomIn', name: '줌 인', keyframe: 'subAnim-zoomIn', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'zoomOut', name: '줌 아웃', keyframe: 'subAnim-zoomOut', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  // ── 중간 (반복/루프) ──
  { id: 'pulse', name: '펄스', keyframe: 'subAnim-pulse', dur: 1.5, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'breathe', name: '숨쉬기', keyframe: 'subAnim-breathe', dur: 3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  { id: 'float', name: '둥실', keyframe: 'subAnim-float', dur: 3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  { id: 'shake', name: '흔들기', keyframe: 'subAnim-shake', dur: 0.5, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'swing', name: '스윙', keyframe: 'subAnim-swing', dur: 1, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'typing', name: '타이핑', keyframe: 'subAnim-typing', dur: 3, ease: 'steps(20)', fill: 'both', iter: 1 },
  { id: 'blink', name: '깜빡임', keyframe: 'subAnim-blink', dur: 1, ease: 'step-end', fill: 'none', iter: 0 },
  // ── 화려한 (입장) ──
  { id: 'bounceIn', name: '바운스 인', keyframe: 'subAnim-bounceIn', dur: 0.8, ease: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'both', iter: 1 },
  { id: 'elasticIn', name: '탄성 인', keyframe: 'subAnim-elasticIn', dur: 1, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'flipX', name: '가로 뒤집기', keyframe: 'subAnim-flipX', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'flipY', name: '세로 뒤집기', keyframe: 'subAnim-flipY', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'rotateIn', name: '회전 등장', keyframe: 'subAnim-rotateIn', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  { id: 'popIn', name: '팡 등장', keyframe: 'subAnim-popIn', dur: 0.4, ease: 'cubic-bezier(0.26,0.53,0.74,1.48)', fill: 'both', iter: 1 },
  { id: 'lightSpeed', name: '광속 등장', keyframe: 'subAnim-lightSpeed', dur: 0.6, ease: 'ease-out', fill: 'both', iter: 1 },
  { id: 'jackBox', name: '깜짝상자', keyframe: 'subAnim-jackBox', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  // ── 화려한 (반복/루프) ──
  { id: 'neonFlicker', name: '네온 깜빡', keyframe: 'subAnim-neonFlicker', dur: 2, ease: 'linear', fill: 'none', iter: 0 },
  { id: 'glitch', name: '글리치', keyframe: 'subAnim-glitch', dur: 0.3, ease: 'linear', fill: 'none', iter: 0 },
  { id: 'rainbow', name: '무지개', keyframe: 'subAnim-rainbow', dur: 3, ease: 'linear', fill: 'none', iter: 0 },
  { id: 'rubberBand', name: '고무줄', keyframe: 'subAnim-rubberBand', dur: 1, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'jello', name: '젤리', keyframe: 'subAnim-jello', dur: 1.5, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'heartBeat', name: '심장박동', keyframe: 'subAnim-heartBeat', dur: 1.3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  { id: 'tada', name: '짜잔!', keyframe: 'subAnim-tada', dur: 1.2, ease: 'ease', fill: 'none', iter: 0 },
  { id: 'textGlow', name: '글로우 펄스', keyframe: 'subAnim-textGlow', dur: 2, ease: 'ease-in-out', fill: 'none', iter: 0 },
];

const ITER_OPTIONS: { v: number; label: string }[] = [
  { v: 1, label: '1회' },
  { v: 2, label: '2회' },
  { v: 3, label: '3회' },
  { v: 0, label: '무한' },
];

const ANIM_KEYFRAMES = `
@keyframes subAnim-fadeIn { from{opacity:0} to{opacity:1} }
@keyframes subAnim-fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes subAnim-fadeInDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
@keyframes subAnim-slideL { from{opacity:0;transform:translateX(-100%)} to{opacity:1;transform:translateX(0)} }
@keyframes subAnim-slideR { from{opacity:0;transform:translateX(100%)} to{opacity:1;transform:translateX(0)} }
@keyframes subAnim-zoomIn { from{opacity:0;transform:scale(0)} to{opacity:1;transform:scale(1)} }
@keyframes subAnim-zoomOut { from{opacity:0;transform:scale(1.5)} to{opacity:1;transform:scale(1)} }
@keyframes subAnim-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
@keyframes subAnim-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
@keyframes subAnim-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes subAnim-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
@keyframes subAnim-swing { 0%,100%{transform:rotateZ(0)} 20%{transform:rotateZ(15deg)} 40%{transform:rotateZ(-10deg)} 60%{transform:rotateZ(5deg)} 80%{transform:rotateZ(-3deg)} }
@keyframes subAnim-typing { from{max-width:0;overflow:hidden;white-space:nowrap} to{max-width:100%;overflow:hidden;white-space:nowrap} }
@keyframes subAnim-blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes subAnim-bounceIn { 0%{transform:scale(0)} 40%{transform:scale(1.2)} 60%{transform:scale(0.9)} 80%{transform:scale(1.05)} 100%{transform:scale(1)} }
@keyframes subAnim-elasticIn { 0%{opacity:0;transform:scale(0)} 55%{opacity:1;transform:scale(1.1)} 70%{transform:scale(0.95)} 85%{transform:scale(1.02)} 100%{transform:scale(1)} }
@keyframes subAnim-flipX { from{opacity:0;transform:perspective(400px) rotateX(90deg)} to{opacity:1;transform:perspective(400px) rotateX(0)} }
@keyframes subAnim-flipY { from{opacity:0;transform:perspective(400px) rotateY(90deg)} to{opacity:1;transform:perspective(400px) rotateY(0)} }
@keyframes subAnim-rotateIn { from{opacity:0;transform:rotate(-200deg)} to{opacity:1;transform:rotate(0)} }
@keyframes subAnim-popIn { 0%{opacity:0;transform:scale(0)} 70%{transform:scale(1.2)} 100%{opacity:1;transform:scale(1)} }
@keyframes subAnim-lightSpeed { 0%{opacity:0;transform:translateX(-100%) skewX(30deg)} 60%{opacity:1;transform:translateX(0) skewX(-10deg)} 80%{transform:skewX(3deg)} 100%{transform:skewX(0)} }
@keyframes subAnim-jackBox { 0%{opacity:0;transform:scale(0) rotate(-30deg)} 50%{transform:scale(1.1) rotate(10deg)} 70%{transform:scale(0.95) rotate(-5deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
@keyframes subAnim-neonFlicker { 0%,19%,21%,23%,25%,54%,56%,100%{opacity:1} 20%,24%,55%{opacity:0.4} }
@keyframes subAnim-glitch { 0%{transform:translate(0)} 20%{transform:translate(-2px,1px) skewX(1deg)} 40%{transform:translate(2px,-1px) skewX(-1deg)} 60%{transform:translate(-1px,2px)} 80%{transform:translate(1px,-2px) skewX(1deg)} 100%{transform:translate(0)} }
@keyframes subAnim-rainbow { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
@keyframes subAnim-rubberBand { 0%,100%{transform:scale(1)} 30%{transform:scaleX(1.25) scaleY(0.75)} 40%{transform:scaleX(0.75) scaleY(1.25)} 50%{transform:scaleX(1.15) scaleY(0.85)} 65%{transform:scaleX(0.95) scaleY(1.05)} 75%{transform:scaleX(1.05) scaleY(0.95)} }
@keyframes subAnim-jello { 0%,100%{transform:skew(0)} 11%{transform:skew(-7deg,-2deg)} 22%{transform:skew(5deg,1.5deg)} 33%{transform:skew(-3deg,-1deg)} 44%{transform:skew(2deg,0.5deg)} 55%{transform:skew(-1deg)} }
@keyframes subAnim-heartBeat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.15)} 28%{transform:scale(1)} 42%{transform:scale(1.1)} 70%{transform:scale(1)} }
@keyframes subAnim-tada { 0%,100%{transform:scale(1) rotate(0)} 10%,20%{transform:scale(0.9) rotate(-3deg)} 30%,50%,70%,90%{transform:scale(1.1) rotate(3deg)} 40%,60%,80%{transform:scale(1.1) rotate(-3deg)} }
@keyframes subAnim-textGlow { 0%,100%{text-shadow:0 0 0px currentColor} 50%{text-shadow:0 0 20px currentColor,0 0 40px currentColor} }
`;

// 미리보기 배경 이미지 (picsum.photos — 무료 랜덤 사진)
const PREVIEW_BG_IDS = [10, 15, 29, 36, 42, 65, 76, 84, 96, 110, 119, 134, 142, 155, 167, 180, 193, 201, 211, 225];

// ═══ 이미지 모션 효과 (SceneMediaPreview와 동일) ═══
const MOTION_KEYFRAMES = `
@keyframes mp-zoom-in { 0%{transform:scale(1)} 100%{transform:scale(1.15)} }
@keyframes mp-zoom-out { 0%{transform:scale(1.15)} 100%{transform:scale(1)} }
@keyframes mp-pan-right { 0%{transform:translateX(5%) scale(1)} 100%{transform:translateX(-5%) scale(1)} }
@keyframes mp-pan-left { 0%{transform:translateX(-5%) scale(1)} 100%{transform:translateX(5%) scale(1)} }
@keyframes mp-pan-up { 0%{transform:translateY(-5%) scale(1)} 100%{transform:translateY(5%) scale(1)} }
@keyframes mp-dynamic { 0%{transform:translate(-3%,-2%) scale(1)} 50%{transform:translate(3%,2%) scale(1.1)} 100%{transform:translate(-3%,-2%) scale(1)} }
@keyframes mp-dramatic { 0%{transform:scale(1)} 50%{transform:scale(1.18)} 100%{transform:scale(1)} }
@keyframes mp-dreamy { 0%{transform:scale(1) rotate(0deg)} 50%{transform:scale(1.08) rotate(0.8deg)} 100%{transform:scale(1) rotate(0deg)} }
@keyframes mp-reveal { 0%{transform:scale(1.18)} 100%{transform:scale(1)} }
@keyframes mp-fade { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }
@keyframes mp-shake { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-3px,2px)} 30%{transform:translate(3px,-2px)} 50%{transform:translate(-2px,3px)} 70%{transform:translate(2px,-3px)} 90%{transform:translate(-3px,-2px)} }
@keyframes mp-rotate { 0%{transform:rotate(0deg) scale(1.05)} 100%{transform:rotate(3deg) scale(1.05)} }
@keyframes mp-glitch { 0%,100%{transform:translate(0,0)} 15%{transform:translate(-5px,2px)} 30%{transform:translate(5px,-2px)} 45%{transform:translate(-3px,-3px)} 60%{transform:translate(4px,1px)} 75%{transform:translate(-2px,4px)} }
@keyframes mp-micro { 0%{transform:scale(1)} 50%{transform:scale(1.03) translate(1px,1px)} 100%{transform:scale(1)} }
@keyframes mp-slow { 0%{transform:scale(1)} 100%{transform:scale(1.06)} }
@keyframes mp-diagonal-drift { 0%{transform:translate(4%,-4%) scale(1)} 100%{transform:translate(-4%,4%) scale(1.06)} }
@keyframes mp-orbit { 0%{transform:translate(0,-3%) scale(1.05)} 25%{transform:translate(3%,0) scale(1.05)} 50%{transform:translate(0,3%) scale(1.05)} 75%{transform:translate(-3%,0) scale(1.05)} 100%{transform:translate(0,-3%) scale(1.05)} }
@keyframes mp-parallax { 0%{transform:translateX(3%) scale(1)} 100%{transform:translateX(-3%) scale(1.1)} }
@keyframes mp-tilt-shift { 0%{transform:translateY(-5%) scale(1.05)} 100%{transform:translateY(5%) scale(1.05)} }
@keyframes mp-spiral-in { 0%{transform:scale(1) rotate(0deg)} 100%{transform:scale(1.15) rotate(3deg)} }
@keyframes mp-push-pull { 0%{transform:scale(1)} 50%{transform:scale(1.12)} 100%{transform:scale(1)} }
@keyframes mp-dolly-zoom { 0%{transform:scale(1.15)} 50%{transform:scale(1)} 100%{transform:scale(1.15)} }
@keyframes mp-crane-up { 0%{transform:translateY(-5%) scale(1)} 100%{transform:translateY(4%) scale(1.05)} }
@keyframes mp-rotate-plus { 0%{transform:rotate(0deg) scale(1.08)} 100%{transform:rotate(8deg) scale(1.08)} }
`;

function getPanZoomAnimation(preset: string): React.CSSProperties {
  switch (preset) {
    case 'fast': return { animation: 'mp-zoom-in 2s ease-in-out infinite alternate' };
    case 'smooth': return { animation: 'mp-zoom-in 4s ease-in-out infinite alternate' };
    case 'cinematic': return { animation: 'mp-zoom-out 5s ease-in-out infinite alternate' };
    case 'dynamic': return { animation: 'mp-dynamic 4s ease-in-out infinite' };
    case 'dreamy': return { animation: 'mp-dreamy 6s ease-in-out infinite' };
    case 'dramatic': return { animation: 'mp-dramatic 4s ease-in-out infinite' };
    case 'zoom': return { animation: 'mp-zoom-in 3s ease-in-out infinite alternate' };
    case 'reveal': return { animation: 'mp-reveal 4s ease-in-out infinite alternate' };
    case 'vintage': return { animation: 'mp-zoom-in 6s ease-in-out infinite alternate', filter: 'sepia(0.15)' };
    case 'documentary': return { animation: 'mp-pan-right 6s linear infinite alternate' };
    case 'timelapse': return { animation: 'mp-pan-left 2s linear infinite alternate' };
    case 'vlog': return { animation: 'mp-micro 3s ease-in-out infinite' };
    case 'noir': return { animation: 'mp-zoom-in 5s ease-in-out infinite alternate', filter: 'grayscale(0.6) contrast(1.2)' };
    case 'diagonal-drift': return { animation: 'mp-diagonal-drift 5s ease-in-out infinite alternate' };
    case 'orbit': return { animation: 'mp-orbit 6s ease-in-out infinite' };
    case 'parallax': return { animation: 'mp-parallax 5s ease-in-out infinite alternate' };
    case 'tilt-shift': return { animation: 'mp-tilt-shift 5s ease-in-out infinite alternate' };
    case 'spiral-in': return { animation: 'mp-spiral-in 4s ease-in-out infinite alternate' };
    case 'push-pull': return { animation: 'mp-push-pull 3s ease-in-out infinite' };
    case 'dolly-zoom': return { animation: 'mp-dolly-zoom 4s ease-in-out infinite' };
    case 'crane-up': return { animation: 'mp-crane-up 5s ease-in-out infinite alternate' };
    default: return {};
  }
}

function getMotionAnimation(motion: string): React.CSSProperties {
  switch (motion) {
    case 'fade': return { animation: 'mp-fade 3s ease-in-out infinite' };
    case 'pan': return { animation: 'mp-pan-right 4s linear infinite alternate' };
    case 'micro': return { animation: 'mp-micro 3s ease-in-out infinite' };
    case 'slow': return { animation: 'mp-slow 6s ease-in-out infinite alternate' };
    case 'shake': return { animation: 'mp-shake 0.6s ease-in-out infinite' };
    case 'rotate': return { animation: 'mp-rotate 4s ease-in-out infinite alternate' };
    case 'glitch': return { animation: 'mp-glitch 0.3s steps(5) infinite' };
    case 'film': return { filter: 'sepia(0.35) contrast(1.15) brightness(0.95)', animation: 'mp-micro 6s ease-in-out infinite' };
    case 'sepia': return { filter: 'sepia(0.65)', animation: 'mp-zoom-in 8s ease-in-out infinite alternate' };
    case 'crossfade': return { animation: 'mp-fade 4s ease-in-out infinite' };
    case 'rotate-plus': return { animation: 'mp-rotate-plus 3s ease-in-out infinite alternate' };
    case 'high-contrast': return { filter: 'contrast(1.4) saturate(1.2)' };
    case 'multi-bright': return { filter: 'brightness(1.3) saturate(1.3)' };
    case 'rain': return { filter: 'brightness(0.85) saturate(0.7) contrast(1.1)' };
    case 'vintage-style': return { filter: 'sepia(0.3) contrast(1.1) saturate(0.8)' };
    case 'static': case 'none': default: return {};
  }
}

// hex → rgba 변환
const toRgba = (hex: string, op: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${(op / 100).toFixed(2)})`;
};

type ApplyMode = 'current' | 'all' | 'range';

const SubtitleStyleEditor: React.FC = () => {
  const subtitles = useEditorStore((s) => s.subtitles);
  const subtitleStyle = useEditorStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useEditorStore((s) => s.setSubtitleStyle);

  // 실제 장면 데이터 연동 — sceneOrder 기반으로 올바른 장면 매핑
  const rawScenes = useProjectStore((s) => s.scenes);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const scenes = useMemo(() => {
    if (sceneOrder.length === 0) return rawScenes;
    const sceneMap = new Map(rawScenes.map((s) => [s.id, s]));
    return sceneOrder.map((id) => sceneMap.get(id)).filter(Boolean) as typeof rawScenes;
  }, [rawScenes, sceneOrder]);
  const sceneEffectsMap = useEditRoomStore((s) => s.sceneEffects);
  const sceneSubtitlesMap = useEditRoomStore((s) => s.sceneSubtitles);
  const applySubtitleStyleToAll = useEditRoomStore((s) => s.applySubtitleStyleToAll);
  const applySubtitleStyleToRange = useEditRoomStore((s) => s.applySubtitleStyleToRange);
  const setGlobalSubtitleStyle = useEditRoomStore((s) => s.setGlobalSubtitleStyle);
  const removeAllSubtitlePunctuation = useEditRoomStore((s) => s.removeAllSubtitlePunctuation);
  const mergeSubtitlesToSingleLine = useEditRoomStore((s) => s.mergeSubtitlesToSingleLine);
  const splitMultiLineSubtitles = useEditRoomStore((s) => s.splitMultiLineSubtitles);
  const setSceneSubtitle = useEditRoomStore((s) => s.setSceneSubtitle);

  // 적용 모드 상태
  const [applyMode, setApplyMode] = useState<ApplyMode>('current');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);

  const projectAR = useProjectStore((s) => s.config?.aspectRatio || '16:9');
  const [orient, setOrient] = useState<Orientation>(
    projectAR === '9:16' ? 'vertical' : 'horizontal'
  );
  const [cat, setCat] = useState<SubtitleCategoryId>('all');
  const [tplSearch, setTplSearch] = useState('');
  const [fontSize, setFontSize] = useState(54);
  const [letterSp, setLetterSp] = useState(0);
  const [lineH, setLineH] = useState(1.4);
  const [posY, setPosY] = useState(10);
  const [textColor, setTextColor] = useState('#ffffff');
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineW, setOutlineW] = useState(2);
  const [textOp, setTextOp] = useState(100);
  const [boxOp, setBoxOp] = useState(0);
  const [boxColor, setBoxColor] = useState('#000000');
  const [boxPadX, setBoxPadX] = useState(16);
  const [boxPadY, setBoxPadY] = useState(8);
  const [boxRadius, setBoxRadius] = useState(8);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [customText, setCustomText] = useState('');
  const [subIdx, setSubIdx] = useState(0);
  const charsPerLine = useEditRoomStore((s) => s.charsPerLine);
  const setCharsPerLine = useEditRoomStore((s) => s.setCharsPerLine);
  const splitSubtitlesByCharsPerLine = useEditRoomStore((s) => s.splitSubtitlesByCharsPerLine);
  const createSubtitleSegments = useEditRoomStore((s) => s.createSubtitleSegments);
  const [aiSegmentLoading, setAiSegmentLoading] = useState(false);
  const [fontCat, setFontCat] = useState<FontCategory | 'all'>('all');
  const [fontSearch, setFontSearch] = useState('');
  const [fontDropOpen, setFontDropOpen] = useState(false);
  const [hAlign, setHAlign] = useState<'left' | 'center' | 'right'>('center');
  const [bgIdx, setBgIdx] = useState(() => Math.floor(Math.random() * PREVIEW_BG_IDS.length));
  // 그림자 (Premiere Pro 스타일)
  const [shadowOn, setShadowOn] = useState(false);
  const [shadowCol, setShadowCol] = useState('#000000');
  const [shadowOp, setShadowOp] = useState(75);
  const [shadowAngle, setShadowAngle] = useState(135);
  const [shadowDist, setShadowDist] = useState(4);
  const [shadowBlurVal, setShadowBlurVal] = useState(6);
  // 네온 글로우
  const [neonOn, setNeonOn] = useState(false);
  const [neonCol, setNeonCol] = useState('#00ffff');
  const [neonBlur, setNeonBlur] = useState(10);
  const [neonOp, setNeonOp] = useState(80);
  // 애니메이션
  const [animId, setAnimId] = useState('none');
  const [animKey, setAnimKey] = useState(0);
  const [animDur, setAnimDur] = useState(1);
  const [animDelay, setAnimDelay] = useState(0);
  const [animIter, setAnimIter] = useState(1); // 0 = infinite
  // AI 줄바꿈 — store charsPerLine과 동기화
  const [aiLineBreakChars, setAiLineBreakChars] = useState(() => charsPerLine || 20);
  const [aiLineBreakInput, setAiLineBreakInput] = useState(() => String(charsPerLine || 20));
  const [aiLineBreakLoading, setAiLineBreakLoading] = useState(false);
  // charsPerLine이 외부(store)에서 변경되면 로컬 상태도 동기화
  useEffect(() => {
    if (charsPerLine > 0) {
      setAiLineBreakChars(charsPerLine);
      setAiLineBreakInput(String(charsPerLine));
    }
  }, [charsPerLine]);
  // 좌측 패널 탭
  const [leftTab, setLeftTab] = useState<'template' | 'animation'>('template');
  // 사용자 프리셋
  const [userPresets, setUserPresets] = useState<SavedSubtitlePreset[]>(loadPresets);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');

  // 동적 폰트 스케일 — ResizeObserver로 미리보기 폭 측정
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(640);
  useEffect(() => {
    if (!previewRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setPreviewWidth(w);
    });
    ro.observe(previewRef.current);
    return () => ro.disconnect();
  }, []);
  const refWidth = orient === 'horizontal' ? 1920 : 1080;
  const fontScale = previewWidth / refWidth;

  // 세그먼트 순차 미리보기
  const [segPreviewIdx, setSegPreviewIdx] = useState(0);

  const tpl = subtitleStyle?.template;

  // 장면 수 변경 시 범위 동기화
  useEffect(() => {
    if (scenes.length > 0) setRangeEnd(scenes.length);
  }, [scenes.length]);

  // 마운트 시 editRoomStore의 globalSubtitleStyle과 동기화 + 로컬 상태 복원
  const editRoomGlobalStyle = useEditRoomStore((s) => s.globalSubtitleStyle);
  useEffect(() => {
    if (editRoomGlobalStyle) {
      setSubtitleStyle(editRoomGlobalStyle);
      // 로컬 상태를 store의 template 값으로 복원 (재진입 시 초기화 방지)
      const t = editRoomGlobalStyle.template;
      if (t) {
        setFontSize(t.fontSize);
        setLetterSp(t.letterSpacing);
        setLineH(t.lineHeight);
        setPosY(t.positionY);
        setOutlineColor(t.outlineColor || '#000000');
        setOutlineW(t.outlineWidth);
        setHAlign(t.textAlign || 'center');
        setIsItalic(t.fontStyle === 'italic');
        // 색상: rgba인 경우 hex+opacity로 파싱
        if (t.color && t.color.startsWith('rgba')) {
          const m = t.color.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
          if (m) {
            const hex = '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
            setTextColor(hex);
            setTextOp(Math.round(parseFloat(m[4]) * 100));
          }
        } else if (t.color) {
          setTextColor(t.color);
          setTextOp(100);
        }
        if (t.backgroundColor && t.backgroundColor !== 'transparent' && t.backgroundColor.startsWith('rgba')) {
          const m = t.backgroundColor.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
          if (m) {
            const hex = '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
            setBoxColor(hex);
            setBoxOp(Math.round(parseFloat(m[4]) * 100));
          }
        } else if (t.backgroundColor && t.backgroundColor !== 'transparent') {
          setBoxColor(t.backgroundColor);
          setBoxOp(100);
        }
      }
    } else if (!subtitleStyle) {
      setSubtitleStyle({ template: TEMPLATES[0] });
    }
    // 애니메이션 프리셋도 store에서 복원
    const sc = scenes[subIdx];
    if (sc) {
      const sub = sceneSubtitlesMap[sc.id];
      const preset = sub?.animationPreset || 'none';
      const found = ANIM_PRESETS.find(a => a.id === preset || (preset === 'fade-in' && a.id === 'fadeIn'));
      if (found) {
        setAnimId(found.id);
        setAnimDur(found.dur || 1);
        setAnimIter(found.iter);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 장면 탐색 시 해당 장면의 애니메이션 프리셋 로드
  useEffect(() => {
    const sc = scenes[subIdx];
    if (!sc) return;
    const sub = sceneSubtitlesMap[sc.id];
    const preset = sub?.animationPreset || 'none';
    // 'fade-in' → 'fadeIn' 매핑 (store 레거시 호환)
    const normalizedId = preset === 'fade-in' ? 'fadeIn' : preset;
    const found = ANIM_PRESETS.find(a => a.id === normalizedId);
    if (found) {
      setAnimId(found.id);
      setAnimDur(sub?.animationDuration ?? (found.dur || 1));
      setAnimIter(sub?.animationIterationCount ?? found.iter);
      setAnimDelay(sub?.animationDelay ?? 0);
      setAnimKey(k => k + 1);
    } else {
      setAnimId('none');
      setAnimDur(1);
      setAnimIter(1);
      setAnimDelay(0);
    }
  }, [subIdx, scenes, sceneSubtitlesMap]);

  useEffect(() => {
    if (!tpl) return;
    const entry = getFontByFamily(tpl.fontFamily);
    if (entry) loadFont(entry);
  }, [tpl?.fontFamily]);

  useEffect(() => {
    if (!tpl) return;
    setFontSize(tpl.fontSize);
    setLetterSp(tpl.letterSpacing);
    setLineH(tpl.lineHeight);
    setPosY(tpl.positionY);
    setTextColor(tpl.color);
    setOutlineColor(tpl.outlineColor || '#000000');
    setOutlineW(tpl.outlineWidth);
    setHAlign(tpl.textAlign);
    setTextOp(100);
    setBoxColor(tpl.backgroundColor && tpl.backgroundColor !== 'transparent' ? tpl.backgroundColor : '#000000');
    setBoxOp(tpl.backgroundColor && tpl.backgroundColor !== 'transparent' ? 100 : 0);
    setBoxPadX(16);
    setBoxPadY(8);
    setBoxRadius(8);
    setIsItalic(tpl.fontStyle === 'italic');
    setAnimId('none');
    setAnimDur(1);
    setAnimDelay(0);
    setAnimIter(1);
    setAnimKey(k => k + 1);
  }, [tpl?.id]);

  // 슬라이더/색상 등 로컬 상태 변경을 editorStore + editRoomStore에 실시간 동기화
  // → 편집실 미리보기에도 즉시 반영 (재생 없이 실시간 프리뷰)
  useEffect(() => {
    if (!tpl) return;
    const bgColor = boxOp > 0 ? toRgba(boxColor, boxOp) : 'transparent';
    const updated: typeof tpl = {
      ...tpl,
      fontSize,
      letterSpacing: letterSp,
      lineHeight: lineH,
      positionY: posY,
      color: textOp < 100 ? toRgba(textColor, textOp) : textColor,
      outlineColor,
      outlineWidth: outlineW,
      backgroundColor: bgColor,
      fontStyle: isItalic ? 'italic' : 'normal',
      textAlign: hAlign,
    };
    const fullStyle: SubtitleStyle = {
      template: updated,
      customFont: subtitleStyle?.customFont,
      customFontUrl: subtitleStyle?.customFontUrl,
    };
    setSubtitleStyle(fullStyle);
    // 편집실 미리보기에 즉시 반영 (전체 적용 버튼 불필요)
    setGlobalSubtitleStyle(fullStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, letterSp, lineH, posY, textColor, textOp, outlineColor, outlineW, boxOp, boxColor, isItalic, hAlign]);

  const filtered = useMemo(() => {
    let list = TEMPLATES;
    if (cat !== 'all' && cat !== 'favorite') list = list.filter((t) => t.category === cat);
    if (tplSearch.trim()) { const q = tplSearch.toLowerCase(); list = list.filter((t) => t.name.toLowerCase().includes(q)); }
    return list;
  }, [cat, tplSearch]);

  const filteredFonts = useMemo(() => {
    let list = getFontsByCategory(fontCat);
    if (fontSearch.trim()) {
      const q = fontSearch.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.fontFamily.toLowerCase().includes(q));
    }
    return list;
  }, [fontCat, fontSearch]);

  const previewText = useMemo(() => {
    if (customText) return customText;
    const scene = scenes[subIdx];
    if (scene) {
      const sub = sceneSubtitlesMap[scene.id];
      if (sub?.text) return sub.text;
      if (scene.scriptText) return scene.scriptText;
    }
    if (subtitles[subIdx]?.text) return subtitles[subIdx].text;
    return '자막 미리보기 텍스트입니다';
  }, [customText, subtitles, subIdx, scenes, sceneSubtitlesMap]);

  // 자동 줄바꿈 적용된 표시 텍스트 (사용자 수동 줄바꿈 우선, 이후 charsPerLine 초과 시 자동 줄바꿈)
  const displayText = useMemo(() => {
    if (!previewText) return previewText;
    // 사용자가 이미 줄바꿈을 넣었으면 그대로 유지, 각 줄에 대해서만 초과분 자동 줄바꿈
    // [FIX #404] 띄어쓰기 있으면 단어 기반 분할 (한국어 포함), 없으면 글자 수 기반
    return previewText.split('\n').map(line => {
      if (line.length <= charsPerLine) return line;
      if (line.includes(' ')) {
        const words = line.split(' ');
        const parts: string[] = [];
        let cur = '';
        for (const w of words) {
          if (cur && (cur + ' ' + w).length > charsPerLine) { parts.push(cur); cur = w; }
          else cur = cur ? cur + ' ' + w : w;
        }
        if (cur) parts.push(cur);
        return parts.join('\n');
      }
      const parts: string[] = [];
      for (let i = 0; i < line.length; i += charsPerLine) parts.push(line.slice(i, i + charsPerLine));
      return parts.join('\n');
    }).join('\n');
  }, [previewText, charsPerLine]);

  // 세그먼트 순차 미리보기 (카라오케 스타일)
  const currentSegments = useMemo(() => {
    const scene = scenes[subIdx];
    if (!scene) return null;
    const sub = sceneSubtitlesMap[scene.id];
    return sub?.segments?.length ? sub.segments : null;
  }, [scenes, subIdx, sceneSubtitlesMap]);

  useEffect(() => {
    if (!currentSegments || currentSegments.length <= 1) { setSegPreviewIdx(0); return; }
    setSegPreviewIdx(0);
    let idx = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < currentSegments.length; i++) {
      const dur = (currentSegments[i].endTime - currentSegments[i].startTime) * 1000;
      timers.push(setTimeout(() => { idx = i; setSegPreviewIdx(i); }, elapsed));
      elapsed += dur;
    }
    // 루프
    const total = elapsed;
    const loopId = setInterval(() => {
      setSegPreviewIdx(0);
      let e2 = 0;
      for (let i = 0; i < currentSegments.length; i++) {
        const dur = (currentSegments[i].endTime - currentSegments[i].startTime) * 1000;
        setTimeout(() => setSegPreviewIdx(i), e2);
        e2 += dur;
      }
    }, total);
    return () => { timers.forEach(clearTimeout); clearInterval(loopId); };
  }, [currentSegments]);

  const segmentDisplayText = useMemo(() => {
    if (currentSegments && currentSegments.length > 1) {
      return currentSegments[segPreviewIdx]?.text || displayText;
    }
    return displayText;
  }, [currentSegments, segPreviewIdx, displayText]);

  // ★ 이미지 모션 효과 — EditRoomTab의 computeMotionStyle과 동일 로직
  const currentScene = scenes[subIdx];
  const currentEffect = currentScene ? sceneEffectsMap[currentScene.id] : undefined;
  const motionStyle = useMemo<React.CSSProperties>(() => {
    if (!currentEffect) return {};
    const pz = getPanZoomAnimation(currentEffect.panZoomPreset);
    const mo = getMotionAnimation(currentEffect.motionEffect);
    const hasMotion = currentEffect.motionEffect && currentEffect.motionEffect !== 'none' && currentEffect.motionEffect !== 'static';

    // ★ panZoom + motionEffect 두 애니메이션을 쉼표로 합성 (메인 미리보기와 동일)
    let combinedAnim: string | undefined;
    if (pz.animation && hasMotion && mo.animation) {
      combinedAnim = `${pz.animation}, ${mo.animation}`;
    } else if (hasMotion && mo.animation) {
      combinedAnim = mo.animation as string;
    } else if (pz.animation) {
      combinedAnim = pz.animation as string;
    }

    const filters = [pz.filter, mo.filter].filter(Boolean).join(' ');
    const ax = currentEffect.anchorX ?? 50;
    const ay = currentEffect.anchorY ?? 45;

    // negative delay 추가 (메인 미리보기와 동일)
    if (combinedAnim) {
      combinedAnim = combinedAnim.split(',').map((a) => {
        const t = a.trim();
        const m = t.match(/([\d.]+)s/);
        const dur = m ? parseFloat(m[1]) : 4;
        const neg = -(dur * 0.3);
        return t.replace(/([\d.]+)s/, `$1s ${neg.toFixed(2)}s`);
      }).join(', ');
    }

    return {
      ...(combinedAnim ? { animation: combinedAnim } : {}),
      ...(filters ? { filter: filters } : {}),
      transformOrigin: `${ax}% ${ay}%`,
    };
  }, [currentEffect, currentScene]);

  // 실제 CSS animation이 있을 때만 120% overscale 적용
  // filter-only 효과(high-contrast, rain 등)는 overscale 불필요
  const hasMotionAnim = !!motionStyle.animation;

  // ── 그림자 CSS 계산 (템플릿 효과 + 사용자 그림자) ──
  const computedShadow = useMemo(() => {
    const parts: string[] = [];
    if (tpl?.textShadowCSS) parts.push(tpl.textShadowCSS);
    else if (tpl?.shadowColor) parts.push(`${tpl.shadowOffsetX}px ${tpl.shadowOffsetY}px ${tpl.shadowBlur}px ${tpl.shadowColor}`);
    if (shadowOn) {
      const rad = (shadowAngle - 90) * Math.PI / 180;
      const ox = +(Math.cos(rad) * shadowDist).toFixed(1);
      const oy = +(Math.sin(rad) * shadowDist).toFixed(1);
      const r = parseInt(shadowCol.slice(1, 3), 16);
      const g = parseInt(shadowCol.slice(3, 5), 16);
      const b = parseInt(shadowCol.slice(5, 7), 16);
      parts.push(`${ox}px ${oy}px ${shadowBlurVal}px rgba(${r},${g},${b},${(shadowOp / 100).toFixed(2)})`);
    }
    if (neonOn) {
      const nc = toRgba(neonCol, neonOp);
      parts.push(`0 0 ${neonBlur}px ${nc}`);
      parts.push(`0 0 ${neonBlur * 2}px ${nc}`);
      parts.push(`0 0 ${neonBlur * 4}px ${nc}`);
    }
    return parts.length > 0 ? parts.join(', ') : 'none';
  }, [tpl, shadowOn, shadowCol, shadowOp, shadowAngle, shadowDist, shadowBlurVal, neonOn, neonCol, neonBlur, neonOp]);

  // 그림자/네온 변경 시에도 편집실 미리보기 즉시 반영
  useEffect(() => {
    if (!tpl) return;
    const fullStyle: SubtitleStyle = {
      template: {
        ...tpl,
        textShadowCSS: computedShadow !== 'none' ? computedShadow : undefined,
      },
      customFont: subtitleStyle?.customFont,
      customFontUrl: subtitleStyle?.customFontUrl,
    };
    setGlobalSubtitleStyle(fullStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedShadow]);

  const selectTpl = useCallback((t: SubtitleTemplate) => {
    const entry = getFontByFamily(t.fontFamily);
    if (entry) loadFont(entry);
    const newStyle: SubtitleStyle = { template: t };
    setSubtitleStyle(newStyle);
    setGlobalSubtitleStyle(newStyle); // 편집실 미리보기 즉시 반영
    setFontSize(t.fontSize);
    setLetterSp(t.letterSpacing);
    setLineH(t.lineHeight);
    setPosY(t.positionY);
    setTextColor(t.color);
    setOutlineColor(t.outlineColor || '#000000');
    setOutlineW(t.outlineWidth);
    setHAlign(t.textAlign);
    setTextOp(100);
    setBoxColor(t.backgroundColor && t.backgroundColor !== 'transparent' ? t.backgroundColor : '#000000');
    setBoxOp(t.backgroundColor && t.backgroundColor !== 'transparent' ? 100 : 0);
    setBoxPadX(16);
    setBoxPadY(8);
    setBoxRadius(8);
    setIsItalic(t.fontStyle === 'italic');
    setAnimId('none');
    setAnimDur(1);
    setAnimDelay(0);
    setAnimIter(1);
    setAnimKey(k => k + 1);
  }, [setSubtitleStyle, setGlobalSubtitleStyle]);

  const selectFont = useCallback((entry: FontEntry) => {
    loadFont(entry);
    const base = tpl || TEMPLATES[0];
    const bestWeight = entry.weights.includes(base.fontWeight)
      ? base.fontWeight
      : entry.weights.reduce((best, w) => Math.abs(w - base.fontWeight) < Math.abs(best - base.fontWeight) ? w : best, entry.weights[0]);
    const newStyle: SubtitleStyle = {
      template: { ...base, fontFamily: entry.fontFamily, fontWeight: bestWeight },
      customFont: entry.fontFamily,
      customFontUrl: entry.noonnu?.urls[0]?.url,
    };
    setSubtitleStyle(newStyle);
    setGlobalSubtitleStyle(newStyle);
    setFontDropOpen(false);
  }, [tpl, setSubtitleStyle, setGlobalSubtitleStyle]);

  const updateColor = useCallback((color: string) => {
    setTextColor(color);
    if (tpl) setSubtitleStyle({ template: { ...tpl, color } });
  }, [tpl, setSubtitleStyle]);

  const updateOutline = useCallback((color: string, width: number) => {
    setOutlineColor(color);
    setOutlineW(width);
    if (tpl) setSubtitleStyle({ template: { ...tpl, outlineColor: color, outlineWidth: width } });
  }, [tpl, setSubtitleStyle]);

  const updateWeight = useCallback((weight: number) => {
    if (tpl) setSubtitleStyle({ template: { ...tpl, fontWeight: weight } });
  }, [tpl, setSubtitleStyle]);

  const updateHAlign = useCallback((align: 'left' | 'center' | 'right') => {
    setHAlign(align);
    if (tpl) setSubtitleStyle({ template: { ...tpl, textAlign: align } });
  }, [tpl, setSubtitleStyle]);

  const toggleBold = useCallback(() => {
    if (!tpl) return;
    const next = tpl.fontWeight >= 700 ? 400 : 700;
    setSubtitleStyle({ template: { ...tpl, fontWeight: next } });
  }, [tpl, setSubtitleStyle]);

  const toggleItalic = useCallback(() => {
    const next = !isItalic;
    setIsItalic(next);
    if (tpl) setSubtitleStyle({ template: { ...tpl, fontStyle: next ? 'italic' : 'normal' } });
  }, [tpl, isItalic, setSubtitleStyle]);

  /** 현재 편집 중인 스타일을 완전한 SubtitleStyle로 빌드 */
  const buildCurrentStyle = useCallback((): SubtitleStyle | null => {
    if (!tpl) return null;
    return {
      template: {
        ...tpl,
        fontSize,
        letterSpacing: letterSp,
        lineHeight: lineH,
        positionY: posY,
        color: textOp < 100 ? toRgba(textColor, textOp) : textColor,
        outlineColor,
        outlineWidth: outlineW,
        backgroundColor: boxOp > 0 ? toRgba(boxColor, boxOp) : 'transparent',
        fontStyle: isItalic ? 'italic' : 'normal',
        textAlign: hAlign,
        textShadowCSS: computedShadow !== 'none' ? computedShadow : undefined,
      },
      customFont: subtitleStyle?.customFont,
      customFontUrl: subtitleStyle?.customFontUrl,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, fontSize, letterSp, lineH, posY, textColor, textOp, outlineColor, outlineW, boxOp, boxColor, isItalic, hAlign, computedShadow, subtitleStyle?.customFont, subtitleStyle?.customFontUrl]);

  /** 프리셋 저장 */
  const saveCurrentAsPreset = useCallback(() => {
    const style = buildCurrentStyle();
    if (!style) return;
    const id = `preset-${Date.now()}`;
    const name = `프리셋 #${userPresets.length + 1}`;
    const newPreset: SavedSubtitlePreset = { id, name, style, createdAt: Date.now() };
    const updated = [...userPresets, newPreset].slice(-MAX_PRESETS);
    setUserPresets(updated);
    savePresets(updated);
    showToast(`"${name}" 저장됨`);
  }, [buildCurrentStyle, userPresets]);

  /** 프리셋 로드 */
  const loadPresetStyle = useCallback((preset: SavedSubtitlePreset) => {
    const t = preset.style.template;
    selectTpl(t);
    if (preset.style.customFont) {
      const entry = getFontByFamily(t.fontFamily);
      if (entry) selectFont(entry);
    }
    // shadow/neon은 template의 textShadowCSS에 포함
    showToast(`"${preset.name}" 적용됨`);
  }, [selectTpl, selectFont]);

  /** 프리셋 삭제 */
  const deletePreset = useCallback((id: string) => {
    const updated = userPresets.filter(p => p.id !== id);
    setUserPresets(updated);
    savePresets(updated);
  }, [userPresets]);

  /** 프리셋 이름 수정 */
  const renamePreset = useCallback((id: string, newName: string) => {
    const updated = userPresets.map(p => p.id === id ? { ...p, name: newName.trim() || p.name } : p);
    setUserPresets(updated);
    savePresets(updated);
    setEditingPresetId(null);
  }, [userPresets]);

  const currentFontEntry = tpl ? getFontByFamily(tpl.fontFamily) : undefined;
  const currentFontName = currentFontEntry?.name || tpl?.fontFamily || '프리텐다드';
  const availableWeights = currentFontEntry?.weights || [700];

  const animPreset = ANIM_PRESETS.find(a => a.id === animId);
  const animStyle: React.CSSProperties = animPreset && animPreset.id !== 'none' ? {
    animationName: animPreset.keyframe,
    animationDuration: `${animDur}s`,
    animationTimingFunction: animPreset.ease,
    animationFillMode: animPreset.fill || 'none',
    animationDelay: `${animDelay}s`,
    animationIterationCount: animIter === 0 ? 'infinite' : animIter,
  } : {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:items-start">
      <style>{ANIM_KEYFRAMES}{MOTION_KEYFRAMES}</style>
      {/* ═══ 좌측: 미리보기 + 템플릿 (sticky — 우측 스크롤 시 프리뷰 고정) ═══ */}
      <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
        {/* 미리보기 영역 */}
        <div
          ref={previewRef}
          className={`relative rounded-xl border border-gray-700 overflow-hidden ${orient === 'horizontal' ? 'aspect-video' : 'aspect-[9/16] max-w-xs mx-auto'}`}
          style={{ backgroundColor: '#000' }}
        >
          {/* ★ 배경 이미지 + 모션 — 메인 미리보기(EditRoomTab)와 동일 구조 */}
          {hasMotionAnim ? (
            <div style={{ position: 'absolute', top: '-10%', right: '-10%', bottom: '-10%', left: '-10%', zIndex: 1 }}>
              <img
                key={`scene-bg-${subIdx}`}
                src={scenes[subIdx]?.imageUrl || `https://picsum.photos/id/${PREVIEW_BG_IDS[bgIdx % PREVIEW_BG_IDS.length]}/${orient === 'horizontal' ? '640/360' : '360/640'}`}
                alt=""
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionStyle }}
              />
            </div>
          ) : (
            <img
              key={`scene-bg-${subIdx}`}
              src={scenes[subIdx]?.imageUrl || `https://picsum.photos/id/${PREVIEW_BG_IDS[bgIdx % PREVIEW_BG_IDS.length]}/${orient === 'horizontal' ? '640/360' : '360/640'}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 1, ...(motionStyle.filter ? { filter: motionStyle.filter as string } : {}), transformOrigin: motionStyle.transformOrigin }}
            />
          )}
          <div className="absolute top-2 left-2 z-10 flex rounded-md border border-gray-600/50 overflow-hidden bg-gray-900/80 backdrop-blur-sm">
            {(['horizontal', 'vertical'] as Orientation[]).map((o) => (
              <button key={o} type="button" onClick={() => setOrient(o)} className={`px-2.5 py-1 text-xs font-bold transition-colors ${orient === o ? 'bg-amber-600/30 text-amber-300' : 'text-gray-400 hover:text-gray-200'}`}>{o === 'horizontal' ? '가로' : '세로'}</button>
            ))}
          </div>
          <button type="button" onClick={() => setBgIdx(i => (i + 1) % PREVIEW_BG_IDS.length)} className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-600/50 text-gray-400 hover:text-white text-xs flex items-center justify-center transition-colors" title="배경 변경">&#8635;</button>
          {/* 안전 영역 오버레이 (세로 모드 전용) */}
          {orient === 'vertical' && <SafeZoneOverlay />}
          {/* 자막 텍스트 */}
          <div className={`absolute inset-x-0 z-[5] flex px-4 ${hAlign === 'left' ? 'justify-start' : hAlign === 'right' ? 'justify-end' : 'justify-center'}`} style={{ bottom: `${posY}%` }}>
            <p key={animKey} className="max-w-[90%]" style={{
              padding: `${boxPadY}px ${boxPadX}px`,
              borderRadius: `${boxRadius}px`,
              fontFamily: `'${tpl?.fontFamily || 'Pretendard'}', Pretendard, sans-serif`,
              fontSize: `${fontSize * fontScale}px`,
              fontWeight: tpl?.fontWeight || 700,
              fontStyle: isItalic ? 'italic' : 'normal',
              color: textOp < 100 ? toRgba(textColor, textOp) : textColor,
              backgroundColor: boxOp > 0 ? toRgba(boxColor, boxOp) : 'transparent',
              letterSpacing: `${letterSp}px`,
              lineHeight: lineH,
              textAlign: hAlign,
              textShadow: computedShadow,
              textDecoration: isUnderline ? 'underline' : 'none',
              WebkitTextStroke: outlineW > 0 && outlineColor ? `${outlineW}px ${outlineColor}` : 'none',
              paintOrder: 'stroke fill',
              whiteSpace: 'pre-line',
              wordBreak: 'keep-all',  // [FIX #404] 한국어 단어 중간 줄바꿈 방지
              ...animStyle,
            }}>{segmentDisplayText}</p>
          </div>
        </div>

        {/* 필름스트립 — 장면 썸네일 */}
        {scenes.length > 1 && (
          <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-800/60 rounded-lg overflow-x-auto">
            {scenes.map((scene, idx) => {
              const isActive = idx === subIdx;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setSubIdx(idx)}
                  className={`flex-shrink-0 relative rounded overflow-hidden transition-all ${
                    isActive
                      ? 'ring-2 ring-amber-400 brightness-110'
                      : 'opacity-60 hover:opacity-90'
                  }`}
                  style={{ width: 52, height: 32 }}
                  title={`장면 ${idx + 1}`}
                >
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <span className="text-[9px] text-gray-500">{idx + 1}</span>
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 border-2 border-amber-400 rounded" />
                  )}
                  <span className="absolute bottom-0 right-0 bg-black/70 text-[8px] text-gray-300 px-0.5 font-mono">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 미리보기 텍스트 입력 + 자막 탐색 */}
        <div className="bg-gray-800/40 rounded-lg px-4 py-2 border border-gray-700 space-y-2">
          <textarea
            rows={2}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={(() => {
              const sc = scenes[subIdx];
              const sub = sc ? sceneSubtitlesMap[sc.id] : undefined;
              return sub?.text || subtitles[subIdx]?.text || '미리보기 텍스트를 직접 입력하세요...';
            })()}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/70 focus:outline-none focus:border-amber-500/50 resize-none"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSubIdx((i) => Math.max(0, i - 1))} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs flex items-center justify-center">&#9664;</button>
            <button type="button" className="w-8 h-8 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-sm flex items-center justify-center shadow-md">&#9654;</button>
            <button type="button" onClick={() => setSubIdx((i) => Math.min(Math.max(scenes.length, 1) - 1, i + 1))} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs flex items-center justify-center">&#9654;</button>
            <span className="font-mono text-xs text-gray-400">{subIdx + 1} / {Math.max(scenes.length, 1)}</span>
          </div>
        </div>

        {/* 자막 도구 — 줄 수 모드 + 세그먼트 분할 + 구두점 제거 + AI 줄바꿈 */}
        {scenes.length > 0 && (
          <div className="bg-gray-800/40 rounded-lg px-4 py-3 border border-gray-700 space-y-3">
            <p className="text-sm font-bold text-amber-400 flex items-center gap-1.5">&#9998; 자막 도구</p>

            {/* 자막 줄 수 모드 */}
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">자막 줄 수</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const created = splitMultiLineSubtitles();
                    if (created > 0) {
                      showToast(`${created}개 자막이 분리되어 1줄로 변환되었습니다`);
                    } else {
                      mergeSubtitlesToSingleLine();
                      showToast('모든 자막이 이미 1줄입니다');
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition-all bg-gray-900/50 text-gray-400 border-gray-700 hover:border-amber-500/30 hover:text-amber-300/80"
                >
                  1줄 자막
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast('아래 AI 줄바꿈으로 2줄 자막을 생성하세요');
                  }}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition-all bg-gray-900/50 text-gray-400 border-gray-700 hover:border-amber-500/30 hover:text-amber-300/80"
                >
                  2줄 자막
                </button>
              </div>
            </div>

            {/* 전체 구두점 제거 */}
            <button
              type="button"
              onClick={() => {
                removeAllSubtitlePunctuation();
                showToast('전체 자막에서 구두점이 제거되었습니다');
              }}
              className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-gray-900/60 text-gray-300 border border-gray-700 hover:border-amber-500/50 hover:text-amber-300 transition-all flex items-center justify-center gap-1.5"
            >
              <span>전체 구두점 제거</span>
            </button>

            {/* AI 줄바꿈 + 세그먼트 분할 */}
            <div className="space-y-2 pt-2 border-t border-gray-700/50">
              <p className="text-[11px] text-gray-500">AI가 의미 단위로 자연스럽게 줄바꿈합니다 (2줄 자막)</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 flex-shrink-0">한줄 최대</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={aiLineBreakInput}
                  onChange={(e) => {
                    setAiLineBreakInput(e.target.value);
                    // 유효한 숫자면 즉시 store에도 반영 (blur 전 버튼 클릭 대비)
                    const n = Number(e.target.value);
                    if (n >= 5 && n <= 50) {
                      setAiLineBreakChars(n);
                      setCharsPerLine(n);
                    }
                  }}
                  onBlur={() => {
                    const v = Math.max(5, Math.min(50, Number(aiLineBreakInput) || 20));
                    setAiLineBreakChars(v);
                    setAiLineBreakInput(String(v));
                    setCharsPerLine(v);
                  }}
                  className="w-14 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-amber-400 font-mono text-center focus:outline-none focus:border-amber-500/50"
                />
                <span className="text-xs text-gray-500">자</span>
                <button
                  type="button"
                  disabled={aiLineBreakLoading || aiSegmentLoading}
                  onClick={async () => {
                    const entries = Object.entries(sceneSubtitlesMap).filter(([, v]) => v?.text?.trim());
                    if (entries.length === 0) { showToast('자막 텍스트가 없습니다'); return; }
                    setAiLineBreakLoading(true);
                    try {
                      // Step 1: AI 줄바꿈 — store에서 최신 값 직접 읽기 (blur→click 사이 클로저 지연 방지)
                      const currentCpl = useEditRoomStore.getState().charsPerLine || aiLineBreakChars;
                      const payload = entries.map(([id, v]) => ({ id, text: v.text.replace(/\n/g, ' ') }));
                      const res = await evolinkChat([
                        { role: 'system', content: 'You are a subtitle line-break assistant. Return ONLY valid JSON.' },
                        { role: 'user', content: `다음 자막 텍스트들을 한 줄당 최대 ${currentCpl}자 이내로 자연스럽게 줄바꿈해주세요.\n기계적으로 글자 수에 맞춰 자르지 말고, 의미 단위/문맥에 맞게 나눠주세요.\n입력: ${JSON.stringify(payload)}\n출력 포맷: 동일 JSON 배열 [{id, text}] (text에 \\n 삽입)` },
                      ], { temperature: 0.2, responseFormat: { type: 'json_object' }, model: 'gemini-3.1-flash-lite-preview' });
                      const raw = res.choices?.[0]?.message?.content || '[]';
                      const obj = JSON.parse(raw);
                      // [FIX #404] AI가 배열을 객체로 감쌀 수 있음
                      const parsed: { id: string; text: string }[] = Array.isArray(obj)
                        ? obj
                        : (obj.results || obj.items || obj.data || obj.subtitles || (Array.isArray(Object.values(obj)[0]) ? Object.values(obj)[0] as { id: string; text: string }[] : []));
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        parsed.forEach(({ id, text }) => { if (id && text) setSceneSubtitle(id, { text }); });
                      }
                      // Step 2: 구두점 자동 제거
                      removeAllSubtitlePunctuation();
                      // Step 3: AI 자막 분할
                      setAiSegmentLoading(true);
                      const total = await createSubtitleSegments();
                      showToast(total > 0
                        ? `AI 자막 처리 완료: 줄바꿈 → 구두점 제거 → ${total}개 세그먼트 분할`
                        : `AI 줄바꿈 + 구두점 제거 완료 (분할 불필요)`
                      );
                    } catch (err) {
                      showToast('AI 자막 처리 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
                    } finally {
                      setAiLineBreakLoading(false);
                      setAiSegmentLoading(false);
                    }
                  }}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    aiLineBreakLoading || aiSegmentLoading
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                      : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white border-blue-400/50'
                  }`}
                >
                  {aiLineBreakLoading || aiSegmentLoading ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      {aiLineBreakLoading && !aiSegmentLoading ? '줄바꿈 중...' : '분할 중...'}
                    </span>
                  ) : 'AI 자막 처리'}
                </button>
              </div>
              {/* 개별 실행 (접이식) */}
              <details className="group">
                <summary className="text-[11px] text-gray-600 cursor-pointer hover:text-gray-400 transition-colors select-none">
                  개별 실행 ▸
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={aiSegmentLoading}
                      onClick={async () => {
                        setAiSegmentLoading(true);
                        try {
                          const total = await createSubtitleSegments();
                          if (total > 0) {
                            showToast(`${total}개 세그먼트 생성 완료 (AI + 오디오 싱크)`);
                          } else {
                            showToast('분할할 자막이 없습니다 (모두 한줄 이내)');
                          }
                        } catch (e) {
                          logger.trackSwallowedError('SubtitleStyleEditor:aiSegment', e);
                          showToast('AI 분할 실패 — 빠른 분할을 사용하세요');
                        } finally {
                          setAiSegmentLoading(false);
                        }
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        aiSegmentLoading
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border border-amber-400/50'
                      }`}
                    >
                      {aiSegmentLoading ? (
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          분할 중...
                        </span>
                      ) : 'AI 자막 분할'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const total = splitSubtitlesByCharsPerLine();
                        if (total > 0) {
                          showToast(`${total}개 세그먼트로 분할 완료`);
                        } else {
                          showToast('분할할 자막이 없습니다 (모두 한줄 이내)');
                        }
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-900/60 text-gray-300 border border-gray-700 hover:border-amber-500/50 hover:text-amber-300 transition-all"
                    >
                      빠른 분할
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}


        {/* ── 내 프리셋 ── */}
        {subtitleStyle && (
          <div className="bg-gray-800/40 rounded-lg px-4 py-3 border border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-[10px] text-white font-black">P</span>
                내 프리셋
              </p>
              <button
                type="button"
                onClick={saveCurrentAsPreset}
                disabled={userPresets.length >= MAX_PRESETS}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border border-amber-400/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + 현재 스타일 저장
              </button>
            </div>

            {userPresets.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-2">저장된 프리셋이 없습니다. 현재 스타일을 저장해보세요.</p>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {userPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="group relative flex-shrink-0 min-w-0"
                  >
                    <button
                      type="button"
                      onClick={() => loadPresetStyle(preset)}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border bg-gray-900/60 border-gray-700 hover:border-amber-500/50 hover:bg-amber-600/10 transition-all min-w-[72px]"
                    >
                      {/* 프리셋 미리보기 */}
                      <span
                        className="text-[13px] leading-tight truncate max-w-[64px]"
                        style={{
                          fontFamily: `'${preset.style.template.fontFamily}', sans-serif`,
                          color: preset.style.template.color,
                          fontWeight: preset.style.template.fontWeight,
                          fontStyle: preset.style.template.fontStyle,
                          textShadow: preset.style.template.textShadowCSS
                            || (preset.style.template.shadowColor
                              ? `1px 1px ${preset.style.template.shadowBlur}px ${preset.style.template.shadowColor}`
                              : 'none'),
                          WebkitTextStroke: preset.style.template.outlineWidth > 0 && preset.style.template.outlineColor
                            ? `${Math.min(preset.style.template.outlineWidth, 2) * 0.3}px ${preset.style.template.outlineColor}`
                            : undefined,
                        }}
                      >
                        가나다
                      </span>
                      {/* 프리셋 이름 */}
                      {editingPresetId === preset.id ? (
                        <input
                          type="text"
                          value={editingPresetName}
                          onChange={(e) => setEditingPresetName(e.target.value)}
                          onBlur={() => renamePreset(preset.id, editingPresetName)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renamePreset(preset.id, editingPresetName); if (e.key === 'Escape') setEditingPresetId(null); }}
                          autoFocus
                          className="w-16 bg-gray-800 border border-amber-500/50 rounded px-1 py-0.5 text-[10px] text-gray-200 text-center focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="text-[10px] text-gray-500 truncate max-w-[64px] cursor-text"
                          onDoubleClick={(e) => { e.stopPropagation(); setEditingPresetId(preset.id); setEditingPresetName(preset.name); }}
                        >
                          {preset.name}
                        </span>
                      )}
                    </button>
                    {/* 삭제 버튼 */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-gray-600"
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {userPresets.length > 0 && (
              <p className="text-[10px] text-gray-600">클릭: 적용 | 더블클릭 이름: 이름 변경 | {MAX_PRESETS}개까지 저장 가능</p>
            )}
          </div>
        )}

        {/* 실시간 미리보기 안내 + 적용 방법 */}
        <div className="flex items-center gap-2 px-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span className="text-[11px] text-green-400/80">편집실 미리보기에 실시간 반영 중</span>
        </div>
        {subtitleStyle && scenes.length > 0 && (
          <div className="bg-gray-800/40 rounded-lg px-4 py-3 border border-gray-700 space-y-2">
            <p className="text-sm font-bold text-amber-400 flex items-center gap-1.5">&#9881; 내보내기 적용 범위</p>
            <div className="flex gap-1.5">
              {([
                { id: 'current' as ApplyMode, label: '현재 장면만' },
                { id: 'all' as ApplyMode, label: '전체 적용' },
                { id: 'range' as ApplyMode, label: '범위 적용' },
              ]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setApplyMode(m.id);
                    if (m.id === 'all') {
                      const fullStyle = buildCurrentStyle();
                      if (fullStyle) {
                        setSubtitleStyle(fullStyle);
                        applySubtitleStyleToAll(fullStyle);
                        showToast('전체 장면에 자막 스타일이 적용되었습니다');
                      }
                    }
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                    applyMode === m.id
                      ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                      : 'bg-gray-900/50 text-gray-400 border-gray-700 hover:border-amber-500/30 hover:text-amber-300/80'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {applyMode === 'range' && (
              <div className="flex items-center gap-2 mt-1">
                <label className="text-xs text-gray-500">시작</label>
                <input
                  type="text"
                  inputMode="numeric"
                  defaultValue={rangeStart}
                  key={`rs-${rangeStart}`}
                  onBlur={(e) => { const n = Number(e.target.value); if (!isNaN(n) && e.target.value.trim()) setRangeStart(Math.max(1, Math.min(scenes.length, Math.round(n)))); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="w-14 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 text-center"
                />
                <span className="text-xs text-gray-600">~</span>
                <label className="text-xs text-gray-500">끝</label>
                <input
                  type="text"
                  inputMode="numeric"
                  defaultValue={rangeEnd}
                  key={`re-${rangeEnd}`}
                  onBlur={(e) => { const n = Number(e.target.value); if (!isNaN(n) && e.target.value.trim()) setRangeEnd(Math.max(1, Math.min(scenes.length, Math.round(n)))); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="w-14 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const fullStyle = buildCurrentStyle();
                    if (fullStyle) applySubtitleStyleToRange(rangeStart - 1, rangeEnd - 1, fullStyle);
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border border-amber-400/50 transition-colors"
                >
                  적용
                </button>
              </div>
            )}
            {applyMode === 'all' && (
              <p className="text-[11px] text-amber-400/60">현재 스타일이 모든 장면에 적용되었습니다. 개별 장면에서 재조정 가능합니다.</p>
            )}
          </div>
        )}

        {/* 텍스트 템플릿 / 애니메이션 탭 */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 space-y-2">
          {/* 탭 헤더 */}
          <div className="flex items-center gap-1 border-b border-gray-700 pb-2">
            <button type="button" onClick={() => setLeftTab('template')} className={`px-3 py-1 rounded-t text-sm font-bold transition-colors ${leftTab === 'template' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50 border-b-0' : 'text-gray-500 hover:text-gray-300'}`}>
              템플릿 <span className="text-xs ml-0.5 opacity-70">{TEMPLATES.length}</span>
            </button>
            <button type="button" onClick={() => setLeftTab('animation')} className={`px-3 py-1 rounded-t text-sm font-bold transition-colors ${leftTab === 'animation' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50 border-b-0' : 'text-gray-500 hover:text-gray-300'}`}>
              애니메이션 <span className="text-xs ml-0.5 opacity-70">{ANIM_PRESETS.length - 1}</span>
            </button>
          </div>

          {/* 템플릿 탭 콘텐츠 */}
          {leftTab === 'template' && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">스타일 프리셋</h3>
                </div>
                <input type="text" value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} placeholder="검색..." className="w-28 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div className="flex gap-0.5 overflow-x-auto pb-0.5">
                {SUBTITLE_CAT_TABS.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0 ${cat === c.id ? 'bg-amber-600/20 text-amber-300' : 'text-gray-600 hover:text-gray-400'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {filtered.map((t) => (
                  <button key={t.id} type="button" onClick={() => selectTpl(t)} className={`p-1.5 rounded-lg border text-center transition-all ${tpl?.id === t.id ? 'bg-amber-600/15 border-amber-500/50 ring-1 ring-amber-400/30' : 'bg-gray-900/50 border-gray-700 hover:border-gray-500'}`}>
                    <div className="text-[13px] py-0.5 rounded truncate" style={{
                      fontFamily: `'${t.fontFamily}', Pretendard, sans-serif`,
                      color: t.color,
                      backgroundColor: t.backgroundColor || 'transparent',
                      fontWeight: t.fontWeight,
                      fontStyle: t.fontStyle,
                      textShadow: t.textShadowCSS || (t.shadowColor ? `1px 1px ${t.shadowBlur}px ${t.shadowColor}` : 'none'),
                      WebkitTextStroke: t.outlineWidth > 0 && t.outlineColor ? `${Math.min(t.outlineWidth, 2) * 0.3}px ${t.outlineColor}` : 'none',
                      paintOrder: 'stroke fill',
                    }}>가나다</div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{t.name}</p>
                  </button>
                ))}
                {filtered.length === 0 && <p className="col-span-5 text-center text-gray-600 text-xs py-3">검색 결과 없음</p>}
              </div>
            </>
          )}

          {/* 애니메이션 탭 콘텐츠 */}
          {leftTab === 'animation' && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">효과 선택</h3>
                <button
                  type="button"
                  onClick={() => setAnimKey(k => k + 1)}
                  className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                >
                  다시 재생
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5 max-h-[320px] overflow-y-auto pr-0.5">
                {ANIM_PRESETS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAnimId(a.id);
                      setAnimDur(a.dur || 1);
                      setAnimIter(a.iter);
                      setAnimDelay(0);
                      setAnimKey(k => k + 1);
                      // store에 즉시 동기화 → 편집실 미리보기 반영
                      const sc = scenes[subIdx];
                      if (sc) setSceneSubtitle(sc.id, {
                        animationPreset: a.id,
                        animationDuration: a.dur || 1,
                        animationDelay: 0,
                        animationIterationCount: a.iter,
                      });
                    }}
                    className={`px-1.5 py-1.5 rounded-lg border text-xs font-medium truncate text-center transition-all ${
                      animId === a.id
                        ? 'bg-amber-600/15 text-amber-300 border-amber-500/50 ring-1 ring-amber-400/30'
                        : 'bg-gray-900/50 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>

              {/* 세부 조정 */}
              {animId !== 'none' && (
                <div className="mt-2 pt-2 border-t border-gray-700 space-y-2.5">
                  <SliderRow label="속도" value={animDur} set={(v) => { setAnimDur(v); setAnimKey(k => k + 1); const sc = scenes[subIdx]; if (sc) setSceneSubtitle(sc.id, { animationDuration: v }); }} min={0.1} max={5} step={0.1} unit="초" />
                  <SliderRow label="지연" value={animDelay} set={(v) => { setAnimDelay(v); setAnimKey(k => k + 1); const sc = scenes[subIdx]; if (sc) setSceneSubtitle(sc.id, { animationDelay: v }); }} min={0} max={3} step={0.1} unit="초" />
                  <div className="grid grid-cols-[1fr_auto] items-center gap-x-2">
                    <span className="text-[13px] text-gray-300 font-medium">반복</span>
                    <div className="flex gap-0.5">
                      {ITER_OPTIONS.map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => { setAnimIter(opt.v); setAnimKey(k => k + 1); const sc = scenes[subIdx]; if (sc) setSceneSubtitle(sc.id, { animationIterationCount: opt.v }); }}
                          className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                            animIter === opt.v
                              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                              : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ 우측: 스타일 편집 (독립 스크롤 — 좌측 프리뷰와 분리) ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4 overflow-y-auto lg:max-h-[calc(100vh-120px)]">

        {/* ── 폰트 선택 ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">폰트</span>
            <span className="text-xs text-gray-500">{FONT_LIBRARY.length}종</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFontDropOpen(!fontDropOpen)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 text-left flex items-center justify-between hover:border-amber-500/50 transition-colors"
              style={{ fontFamily: `'${tpl?.fontFamily || 'Pretendard'}', sans-serif` }}
            >
              <span className="truncate">{currentFontName}</span>
              <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{fontDropOpen ? '▲' : '▼'}</span>
            </button>

            {fontDropOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-600 rounded-xl shadow-2xl overflow-hidden" style={{ maxHeight: '340px' }}>
                <div className="p-2 border-b border-gray-700">
                  <input
                    type="text"
                    value={fontSearch}
                    onChange={(e) => setFontSearch(e.target.value)}
                    placeholder="폰트 검색..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                    autoFocus
                  />
                </div>
                <div className="flex gap-0.5 px-2 py-1 border-b border-gray-700 overflow-x-auto">
                  {FONT_CAT_KEYS.map((c) => (
                    <button key={c} type="button" onClick={() => setFontCat(c)} className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0 ${fontCat === c ? 'bg-amber-600/20 text-amber-300' : 'text-gray-500 hover:text-gray-300'}`}>
                      {FONT_CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
                  {filteredFonts.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFont(f)}
                      onMouseEnter={() => loadFont(f)}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-gray-800 transition-colors border-b border-gray-800/50 ${tpl?.fontFamily === f.fontFamily ? 'bg-amber-600/10' : ''}`}
                    >
                      <p className="text-xs text-gray-200 truncate flex-1 min-w-0" style={{ fontFamily: `'${f.fontFamily}', Pretendard, sans-serif` }}>{f.name}</p>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <span className={`text-[7px] px-1 py-0.5 rounded ${f.source === 'google' ? 'bg-blue-900/30 text-blue-400' : f.source === 'noonnu' ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {f.source === 'google' ? 'G' : f.source === 'noonnu' ? 'N' : 'L'}
                        </span>
                        {tpl?.fontFamily === f.fontFamily && <span className="text-amber-400 text-xs">&#10003;</span>}
                      </div>
                    </button>
                  ))}
                  {filteredFonts.length === 0 && <p className="text-center text-gray-600 text-xs py-4">검색 결과 없음</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 스타일 (B / I) + 굵기 ── */}
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-white">스타일</span>
          <div className="flex gap-1">
            <button type="button" onClick={toggleBold}
              className={`w-9 h-8 rounded text-sm font-bold transition-all ${(tpl?.fontWeight || 700) >= 700 ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'}`}>
              B
            </button>
            <button type="button" onClick={toggleItalic}
              className={`w-9 h-8 rounded text-sm transition-all ${isItalic ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'}`}
              style={{ fontStyle: 'italic' }}>
              I
            </button>
            <button type="button" onClick={() => setIsUnderline(u => !u)}
              className={`w-9 h-8 rounded text-sm transition-all ${isUnderline ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'}`}
              style={{ textDecoration: 'underline' }}>
              U
            </button>
          </div>
          {availableWeights.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {availableWeights.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateWeight(w)}
                  className={`px-2.5 py-1 rounded text-[13px] font-mono transition-all ${
                    tpl?.fontWeight === w
                      ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50'
                      : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200'
                  }`}
                  style={{ fontFamily: `'${tpl?.fontFamily || 'Pretendard'}', sans-serif`, fontWeight: w }}
                >
                  {w === 300 ? '가늘게' : w === 400 ? '보통' : w === 500 ? '중간' : w === 600 ? '약간굵게' : w === 700 ? '굵게' : w === 800 ? '아주굵게' : w === 900 ? '최대굵기' : w}
                </button>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-700" />

        {/* ── 크기 / 간격 ── */}
        <div className="space-y-3">
          <SliderRow label="글자 크기" value={fontSize} set={setFontSize} min={20} max={120} step={1} unit="px" />
          <SliderRow label="자간" value={letterSp} set={setLetterSp} min={-5} max={20} step={1} unit="px" />
          <SliderRow label="줄간격" value={lineH} set={setLineH} min={0.8} max={3} step={0.1} />
          {/* ── 한줄 글자수 (항상 표시) ── */}
          <div className="space-y-1.5 pt-1 border-t border-gray-700/50 mt-2">
            <span className="text-[13px] text-gray-300 font-medium">한줄 글자수</span>
            <SliderRow label="글자수" value={charsPerLine} set={setCharsPerLine} min={5} max={50} step={1} unit="자" />
            <p className="text-[11px] text-gray-500">{charsPerLine}자 초과 시 자동 줄바꿈 (한글: 글자 단위, 영어: 단어 단위)</p>
          </div>
        </div>

        <hr className="border-gray-700" />

        {/* ── 정렬 ── */}
        <div className="space-y-2">
          <span className="text-sm font-bold text-white">정렬</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[13px] text-gray-300 font-medium">수평</span>
              <div className="flex gap-0.5">
                {H_ALIGNS.map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => updateHAlign(v)}
                    className={`flex-1 px-1 py-1 rounded text-xs font-bold transition-all ${hAlign === v ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[13px] text-gray-300 font-medium">수직</span>
              <div className="flex gap-0.5">
                {V_POSITIONS.map(({ v, label, posY: py }) => (
                  <button key={v} type="button" onClick={() => setPosY(py)}
                    className={`flex-1 px-1 py-1 rounded text-xs font-bold transition-all ${vAlignFromPosY(posY) === v ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SliderRow label="위치 미세조정" value={posY} set={setPosY} min={0} max={80} step={1} unit="%" />
        </div>

        <hr className="border-gray-700" />

        {/* ── 안전 영역 ── */}
        <SafeZonePanel posY={posY} setPosY={setPosY} />

        <hr className="border-gray-700" />

        {/* ── 글자색 / 배경색 / 외곽선 ── */}
        <div className="space-y-2">
          <span className="text-sm font-bold text-white">색상</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <span className="text-[13px] text-gray-300 font-medium">글자</span>
              <div className="flex items-center gap-1.5">
                <input type="color" value={textColor} onChange={(e) => updateColor(e.target.value)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent flex-shrink-0" />
                <span className="text-[11px] text-gray-500 font-mono">{textColor}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[13px] text-gray-300 font-medium">배경</span>
              <div className="flex items-center gap-1.5">
                <input type="color" value={boxColor} onChange={(e) => { setBoxColor(e.target.value); if (boxOp === 0) setBoxOp(80); }} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent flex-shrink-0" />
                <span className="text-[11px] text-gray-500 font-mono">{boxColor}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[13px] text-gray-300 font-medium">외곽선</span>
              <div className="flex items-center gap-1.5">
                <input type="color" value={outlineColor} onChange={(e) => updateOutline(e.target.value, outlineW)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent flex-shrink-0" />
                <span className="text-[11px] text-gray-500 font-mono">{outlineColor}</span>
              </div>
            </div>
          </div>
          <SliderRow label="외곽선 굵기" value={outlineW} set={(w) => updateOutline(outlineColor, w)} min={0} max={20} step={0.5} unit="px" />
          <SliderRow label="글자 투명도" value={textOp} set={setTextOp} min={0} max={100} step={1} unit="%" />
          <SliderRow label="배경 투명도" value={boxOp} set={setBoxOp} min={0} max={100} step={1} unit="%" />
          <SliderRow label="배경 좌우" value={boxPadX} set={setBoxPadX} min={0} max={60} step={1} unit="px" />
          <SliderRow label="배경 상하" value={boxPadY} set={setBoxPadY} min={0} max={40} step={1} unit="px" />
          <SliderRow label="배경 둥글기" value={boxRadius} set={setBoxRadius} min={0} max={30} step={1} unit="px" />
        </div>

        <hr className="border-gray-700" />

        {/* ── 그림자 (Premiere Pro 스타일) ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">그림자</span>
            <button type="button" onClick={() => setShadowOn(!shadowOn)}
              className={`relative w-9 h-5 rounded-full transition-colors ${shadowOn ? 'bg-amber-500' : 'bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${shadowOn ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          {shadowOn && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-300 font-medium w-10 flex-shrink-0">색상</span>
                <input type="color" value={shadowCol} onChange={(e) => setShadowCol(e.target.value)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent flex-shrink-0" />
                <span className="text-xs text-gray-500 font-mono">{shadowCol}</span>
              </div>
              <SliderRow label="불투명도" value={shadowOp} set={setShadowOp} min={0} max={100} step={1} unit="%" />
              <SliderRow label="방향" value={shadowAngle} set={setShadowAngle} min={0} max={360} step={1} unit="°" />
              <SliderRow label="거리" value={shadowDist} set={setShadowDist} min={0} max={20} step={1} unit="px" />
              <SliderRow label="흐림" value={shadowBlurVal} set={setShadowBlurVal} min={0} max={30} step={1} unit="px" />
            </div>
          )}
        </div>

        <hr className="border-gray-700" />

        {/* ── 네온 글로우 ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">네온 글로우</span>
            <button type="button" onClick={() => setNeonOn(!neonOn)}
              className={`relative w-9 h-5 rounded-full transition-colors ${neonOn ? 'bg-amber-500' : 'bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${neonOn ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          {neonOn && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-300 font-medium w-10 flex-shrink-0">색상</span>
                <input type="color" value={neonCol} onChange={(e) => setNeonCol(e.target.value)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent flex-shrink-0" />
                <span className="text-xs text-gray-500 font-mono">{neonCol}</span>
              </div>
              <SliderRow label="퍼짐" value={neonBlur} set={setNeonBlur} min={1} max={40} step={1} unit="px" />
              <SliderRow label="불투명도" value={neonOp} set={setNeonOp} min={10} max={100} step={5} unit="%" />
            </div>
          )}
        </div>

      </div>

      {/* 폰트 드롭다운 외부 클릭 시 닫기 */}
      {fontDropOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setFontDropOpen(false)} />
      )}
    </div>
  );
};

export default SubtitleStyleEditor;
