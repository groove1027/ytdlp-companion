/**
 * 모션 프리뷰 공유 유틸리티
 * — EditRoomTab, StoryboardScene/Panel에서 공통 사용
 *
 * 원본: EditRoomTab.tsx에서 추출 (CSS-Canvas 대칭을 위해 단일 소스)
 */
import type { SceneEffectConfig } from '../types';

// ═══ 모션 CSS 키프레임 (mp-* 계열) ═══
export const MOTION_KEYFRAMES = `
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

// 스토리보드 전용 컴팩트 프리셋 (가장 많이 쓰는 8개)
export const COMPACT_PAN_ZOOM_PRESETS = [
  { id: 'none', label: '없음', icon: '⛔' },
  { id: 'cinematic', label: '시네마', icon: '🎬' },
  { id: 'smooth', label: '부드러움', icon: '🌊' },
  { id: 'dynamic', label: '역동', icon: '💥' },
  { id: 'dreamy', label: '우아', icon: '✨' },
  { id: 'dramatic', label: '드라마', icon: '🎭' },
  { id: 'zoom', label: '집중', icon: '🔍' },
  { id: 'documentary', label: '다큐', icon: '📹' },
] as const;

// 팬&줌 프리셋 → CSS 애니메이션
export function previewPanZoomAnim(preset: string): React.CSSProperties {
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

// 모션 효과 → CSS 애니메이션
export function previewMotionAnim(motion: string): React.CSSProperties {
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

// 애니메이션 shorthand에서 기본 duration(초) 추출
function getAnimBaseDur(animStr: string): number {
  const m = animStr.match(/([\d.]+)s/);
  return m ? parseFloat(m[1]) : 4;
}

/**
 * 장면 전환 시 끊김 없는 모션을 위한 애니메이션 타이밍 조정
 * 핵심: negative animation-delay로 중간부터 시작
 */
export function fitAnimToScene(animStr: string, sceneDur: number, looping: boolean): string {
  const baseDur = getAnimBaseDur(animStr);
  const isAlternate = /\balternate\b/.test(animStr);

  if (looping) {
    const visualCycle = isAlternate ? baseDur * 2 : baseDur;
    const fullCycles = Math.max(1, Math.round(sceneDur / visualCycle));
    const newDur = Math.max(0.3, sceneDur / (fullCycles * (isAlternate ? 2 : 1)));
    const negDelay = -(newDur * 0.45);
    return animStr.replace(/([\d.]+)s/, `${newDur.toFixed(2)}s ${negDelay.toFixed(2)}s`);
  } else {
    const preAdv = Math.min(0.5, sceneDur * 0.05);
    const totalDur = sceneDur + preAdv;
    return animStr
      .replace(/([\d.]+)s/, `${totalDur.toFixed(2)}s ${(-preAdv).toFixed(2)}s`)
      .replace(/\binfinite\b/, '1')
      + ' both';
  }
}

// 장면 duration 정보 없을 때 기본 negative delay만 추가
function addNegativeDelay(animStr: string): string {
  const dur = getAnimBaseDur(animStr);
  const negDelay = -(dur * 0.45);
  return animStr.replace(/([\d.]+)s/, `$1s ${negDelay.toFixed(2)}s`);
}

/**
 * 이미지 모션 스타일 계산 — 장면 길이에 맞춘 끊김 없는 모션
 * CSS preview용 (편집실 + 스토리보드 공용)
 */
export function computeMotionStyle(
  effect: SceneEffectConfig | undefined,
  looping: boolean = true,
  sceneDuration: number = 0,
): React.CSSProperties {
  if (!effect) return {};
  const pz = previewPanZoomAnim(effect.panZoomPreset);
  const mo = previewMotionAnim(effect.motionEffect);
  const hasMotion = effect.motionEffect && effect.motionEffect !== 'none' && effect.motionEffect !== 'static';

  let anim: React.CSSProperties;
  if (pz.animation && hasMotion && mo.animation) {
    anim = { animation: `${pz.animation}, ${mo.animation}` };
  } else if (hasMotion && mo.animation) {
    anim = mo;
  } else {
    anim = pz;
  }

  if (anim.animation && sceneDuration > 0) {
    const parts = (anim.animation as string).split(',').map(a =>
      fitAnimToScene(a.trim(), sceneDuration, looping)
    );
    anim = { animation: parts.join(', ') };
  } else if (anim.animation) {
    const parts = (anim.animation as string).split(',').map(a => addNegativeDelay(a.trim()));
    anim = { animation: parts.join(', ') };
  }

  const filters = [pz.filter, mo.filter].filter(Boolean).join(' ');
  const ax = effect.anchorX ?? 50;
  const ay = effect.anchorY ?? 45;
  return {
    ...anim,
    ...(filters ? { filter: filters } : {}),
    transformOrigin: `${ax}% ${ay}%`,
  };
}
