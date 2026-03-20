import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSoundStudioStore } from '../../stores/soundStudioStore';
import { useEditRoomStore } from '../../stores/editRoomStore';
import { useUnifiedTimeline, useTotalDuration } from '../../hooks/useUnifiedTimeline';
import { downloadSrtFile, downloadSrtWithAssetsZip } from '../../services/srtService';
import { composeMp4, downloadMp4 } from '../../services/webcodecs';
import {
  beginCapCutDirectInstallSelection,
  buildEditRoomNleZip,
  getCapCutManualInstallHint,
  installCapCutZipToDirectory,
  isCapCutDirectInstallSupported,
} from '../../services/nleExportService';
import type { EditRoomNleTarget } from '../../services/nleExportService';
import { showToast } from '../../stores/uiStore';
import EditRoomHeader from './editroom/EditRoomHeader';
import EditRoomSceneList from './editroom/EditRoomSceneList';
import EditRoomGlobalPanel from './editroom/EditRoomGlobalPanel';
import LayerInspectorPanel from './editroom/LayerInspectorPanel';
import EditRoomExportBar from './editroom/EditRoomExportBar';
import VisualTimeline from './editroom/VisualTimeline';
import RenderSettingsModal from './editroom/RenderSettingsModal';
import OverlayPreviewLayer from './editroom/OverlayPreviewLayer';
import type { SubtitleTemplate, SubtitleStyle, SceneEffectConfig, SceneTransitionPreset, EditRoomSubTab } from '../../types';
import { lazyRetry } from '../../utils/retryImport';

const EditPointMatchingPanel = lazyRetry(() => import('./editroom/EditPointMatchingPanel'));
import { getFontByFamily } from '../../constants/fontLibrary';
import { loadFont } from '../../services/fontLoaderService';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { logger } from '../../services/LoggerService';
import VersionSelectorBar from './editroom/VersionSelectorBar';

/** globalSubtitleStyle이 null일 때 사용하는 기본 자막 스타일 (subtitleTemplates.ts의 base() 기본값과 동일) */
const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  template: {
    id: 'default', name: '기본', category: 'basic',
    fontFamily: 'Pretendard', fontSize: 54, fontWeight: 700, fontStyle: 'normal',
    color: '#ffffff', outlineColor: '#000000', outlineWidth: 2,
    shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    letterSpacing: 0, lineHeight: 1.4, positionY: 10, textAlign: 'center',
  },
};

// ═══ 모션 효과 CSS 키프레임 ═══
const PREVIEW_MOTION_KEYFRAMES = `
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
@keyframes tr-dissolve-out { from{opacity:1} to{opacity:0} }
@keyframes tr-fadeWhite-out { 0%{opacity:1;filter:brightness(1)} 40%{filter:brightness(4)} 100%{opacity:0;filter:brightness(4)} }
@keyframes tr-wipeLeft { from{clip-path:inset(0 0 0 0)} to{clip-path:inset(0 0 0 100%)} }
@keyframes tr-wipeRight { from{clip-path:inset(0 0 0 0)} to{clip-path:inset(0 100% 0 0)} }
@keyframes tr-wipeUp { from{clip-path:inset(0 0 0 0)} to{clip-path:inset(100% 0 0 0)} }
@keyframes tr-wipeDown { from{clip-path:inset(0 0 0 0)} to{clip-path:inset(0 0 100% 0)} }
@keyframes tr-slideLeft { from{transform:translateX(0)} to{transform:translateX(-100%)} }
@keyframes tr-slideRight { from{transform:translateX(0)} to{transform:translateX(100%)} }
@keyframes tr-slideUp { from{transform:translateY(0)} to{transform:translateY(-100%)} }
@keyframes tr-slideDown { from{transform:translateY(0)} to{transform:translateY(100%)} }
@keyframes tr-coverLeft-in { from{transform:translateX(-100%)} to{transform:translateX(0)} }
@keyframes tr-coverRight-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
@keyframes tr-circleClose { from{clip-path:circle(75% at 50% 50%)} to{clip-path:circle(0% at 50% 50%)} }
@keyframes tr-circleOpen-out { from{clip-path:circle(75% at 50% 50%)} to{clip-path:circle(0% at 50% 50%)} }
@keyframes tr-radial { from{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} to{clip-path:polygon(50% 50%,50% 50%,50% 50%,50% 50%)} }
@keyframes tr-diagBR { from{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} to{clip-path:polygon(100% 100%,100% 100%,100% 100%,100% 100%)} }
@keyframes tr-diagTL { from{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} to{clip-path:polygon(0 0,0 0,0 0,0 0)} }
@keyframes tr-zoomOut { from{transform:scale(1);opacity:1} to{transform:scale(2);opacity:0} }
@keyframes tr-zoomIn-out { from{transform:scale(1);opacity:1} to{transform:scale(0.3);opacity:0} }
@keyframes tr-flipX { from{transform:perspective(800px) rotateY(0);opacity:1} to{transform:perspective(800px) rotateY(90deg);opacity:0} }
@keyframes tr-flipY { from{transform:perspective(800px) rotateX(0);opacity:1} to{transform:perspective(800px) rotateX(90deg);opacity:0} }
@keyframes tr-flipX-in { from{transform:perspective(800px) rotateY(-90deg);opacity:0} to{transform:perspective(800px) rotateY(0);opacity:1} }
@keyframes tr-flipY-in { from{transform:perspective(800px) rotateX(-90deg);opacity:0} to{transform:perspective(800px) rotateX(0);opacity:1} }
@keyframes tr-smoothLeft { from{transform:translateX(0);opacity:1} to{transform:translateX(-50%);opacity:0} }
@keyframes tr-smoothRight { from{transform:translateX(0);opacity:1} to{transform:translateX(50%);opacity:0} }
@keyframes tr-blur { from{filter:blur(0px);opacity:1} to{filter:blur(20px);opacity:0} }
@keyframes tr-pixelate { from{transform:scale(1);filter:blur(0)} to{transform:scale(0.05);filter:blur(3px);opacity:0} }
@keyframes tr-squeezH { from{transform:scaleX(1);opacity:1} to{transform:scaleX(0);opacity:0} }
@keyframes tr-flash { 0%{filter:brightness(1);opacity:1} 35%{filter:brightness(5)} 65%{filter:brightness(5);opacity:0.5} 100%{filter:brightness(1);opacity:0} }
@keyframes tr-glitch { 0%{transform:translate(0);opacity:1;filter:none} 15%{transform:translate(-4px,2px);filter:hue-rotate(90deg)} 30%{transform:translate(4px,-2px);clip-path:inset(20% 0 60% 0)} 45%{transform:translate(-2px,-3px);filter:hue-rotate(180deg);clip-path:inset(50% 0 20% 0)} 60%{transform:translate(2px,3px);opacity:0.7;clip-path:none} 80%{transform:translate(-1px,2px);opacity:0.3;filter:hue-rotate(270deg)} 100%{transform:translate(0);opacity:0;filter:none} }
@keyframes tr-slideLeft-in { from{transform:translateX(100%)} to{transform:translateX(0)} }
@keyframes tr-slideRight-in { from{transform:translateX(-100%)} to{transform:translateX(0)} }
@keyframes tr-slideUp-in { from{transform:translateY(100%)} to{transform:translateY(0)} }
@keyframes tr-slideDown-in { from{transform:translateY(-100%)} to{transform:translateY(0)} }
@keyframes tr-dissolve-in { from{opacity:0} to{opacity:1} }
@keyframes tr-fadeWhite-in { 0%{opacity:0;filter:brightness(4)} 60%{filter:brightness(4)} 100%{opacity:1;filter:brightness(1)} }
@keyframes tr-stay { from{opacity:1} to{opacity:1} }
@keyframes tr-wipeLeft-in { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0 0 0)} }
@keyframes tr-wipeRight-in { from{clip-path:inset(0 0 0 100%)} to{clip-path:inset(0 0 0 0)} }
@keyframes tr-wipeUp-in { from{clip-path:inset(0 0 100% 0)} to{clip-path:inset(0 0 0 0)} }
@keyframes tr-wipeDown-in { from{clip-path:inset(100% 0 0 0)} to{clip-path:inset(0 0 0 0)} }
@keyframes tr-circleOpen-in { from{clip-path:circle(0% at 50% 50%)} to{clip-path:circle(75% at 50% 50%)} }
@keyframes tr-circleClose-in { from{clip-path:circle(75% at 50% 50%)} to{clip-path:circle(0% at 50% 50%);opacity:0} }
@keyframes tr-radial-in { from{clip-path:polygon(50% 50%,50% 50%,50% 50%,50% 50%)} to{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} }
@keyframes tr-diagBR-in { from{clip-path:polygon(100% 100%,100% 100%,100% 100%,100% 100%)} to{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} }
@keyframes tr-diagTL-in { from{clip-path:polygon(0 0,0 0,0 0,0 0)} to{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)} }
@keyframes tr-zoomIn-enter { from{transform:scale(0.3);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes tr-zoomOut-enter { from{transform:scale(2);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes tr-smoothLeft-in { from{transform:translateX(50%);opacity:0} to{transform:translateX(0);opacity:1} }
@keyframes tr-smoothRight-in { from{transform:translateX(-50%);opacity:0} to{transform:translateX(0);opacity:1} }
@keyframes tr-blur-in { from{filter:blur(20px);opacity:0} to{filter:blur(0px);opacity:1} }
@keyframes tr-flash-in { 0%{filter:brightness(1);opacity:0} 35%{filter:brightness(5);opacity:0.5} 65%{filter:brightness(5)} 100%{filter:brightness(1);opacity:1} }
@keyframes tr-glitch-in { 0%{transform:translate(0);opacity:0;filter:none} 20%{transform:translate(3px,-2px);opacity:0.3;filter:hue-rotate(270deg)} 40%{transform:translate(-2px,3px);opacity:0.7;clip-path:inset(50% 0 20% 0)} 60%{transform:translate(4px,-2px);filter:hue-rotate(180deg);clip-path:inset(20% 0 60% 0)} 80%{transform:translate(-4px,2px);filter:hue-rotate(90deg);clip-path:none} 100%{transform:translate(0);opacity:1;filter:none} }
`;

// 팬&줌 프리셋 → CSS 애니메이션
function previewPanZoomAnim(preset: string): React.CSSProperties {
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
function previewMotionAnim(motion: string): React.CSSProperties {
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

/**
 * 애니메이션 shorthand에서 기본 duration(초)을 추출
 * 예: "mp-zoom-in 4s ease-in-out infinite alternate" → 4
 */
function getAnimBaseDur(animStr: string): number {
  const m = animStr.match(/([\d.]+)s/);
  return m ? parseFloat(m[1]) : 4;
}

/**
 * 장면 전환 시 끊김 없는 모션을 위한 애니메이션 타이밍 조정
 *
 * 핵심 기법: negative animation-delay로 애니메이션을 중간부터 시작시켜
 * 컷이 바뀌어도 "방금 시작됨" 느낌 없이 이미 움직이는 중인 것처럼 보이게 함.
 *
 * @param animStr CSS animation shorthand (예: "mp-zoom-in 4s ease-in-out infinite alternate")
 * @param sceneDur 장면 길이(초)
 * @param looping true=반복(infinite, 장면 길이에 맞춘 주기), false=1회 재생
 */
function fitAnimToScene(animStr: string, sceneDur: number, looping: boolean): string {
  const baseDur = getAnimBaseDur(animStr);
  const isAlternate = /\balternate\b/.test(animStr);

  if (looping) {
    // alternate 애니메이션: 시각적 1주기 = 2×duration (왕복)
    const visualCycle = isAlternate ? baseDur * 2 : baseDur;
    // 장면에 들어가는 완전한 주기 수 (최소 1)
    const fullCycles = Math.max(1, Math.round(sceneDur / visualCycle));
    // duration을 조절해서 N주기가 정확히 sceneDur에 맞도록
    const newDur = Math.max(0.3, sceneDur / (fullCycles * (isAlternate ? 2 : 1)));
    // 주기의 45%만큼 앞당겨 시작 → 첫 프레임부터 이미 움직이는 중 (ease-in-out 고려)
    const negDelay = -(newDur * 0.45);

    return animStr.replace(/([\d.]+)s/, `${newDur.toFixed(2)}s ${negDelay.toFixed(2)}s`);
  } else {
    // 1회 재생: 장면 길이 = 애니메이션 전체 길이
    // 5% 프리어드밴스로 시작 시 자연스러운 진입
    const preAdv = Math.min(0.5, sceneDur * 0.05);
    const totalDur = sceneDur + preAdv;
    return animStr
      .replace(/([\d.]+)s/, `${totalDur.toFixed(2)}s ${(-preAdv).toFixed(2)}s`)
      .replace(/\binfinite\b/, '1')
      + ' both';
  }
}

/**
 * 장면 duration 정보 없을 때 기본 negative delay만 추가
 * (SceneMediaPreview 썸네일 등에서 사용)
 */
function addNegativeDelay(animStr: string): string {
  const dur = getAnimBaseDur(animStr);
  const negDelay = -(dur * 0.45);
  return animStr.replace(/([\d.]+)s/, `$1s ${negDelay.toFixed(2)}s`);
}

// 이미지 모션 스타일 계산 — 장면 길이에 맞춘 끊김 없는 모션
function computeMotionStyle(effect: SceneEffectConfig | undefined, looping: boolean = true, sceneDuration: number = 0): React.CSSProperties {
  if (!effect) return {};
  const pz = previewPanZoomAnim(effect.panZoomPreset);
  const mo = previewMotionAnim(effect.motionEffect);
  const hasMotion = effect.motionEffect && effect.motionEffect !== 'none' && effect.motionEffect !== 'static';
  // panZoom + motionEffect 두 애니메이션을 쉼표로 합성
  let anim: React.CSSProperties;
  if (pz.animation && hasMotion && mo.animation) {
    anim = { animation: `${pz.animation}, ${mo.animation}` };
  } else if (hasMotion && mo.animation) {
    anim = mo;
  } else {
    anim = pz;
  }
  // 장면 길이 기반 타이밍 조정 + negative delay
  if (anim.animation && sceneDuration > 0) {
    const parts = (anim.animation as string).split(',').map(a =>
      fitAnimToScene(a.trim(), sceneDuration, looping)
    );
    anim = { animation: parts.join(', ') };
  } else if (anim.animation) {
    // 장면 길이 없음: negative delay만 추가 (끊김 방지)
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

/**
 * 전환 효과 설정 — 프리미어 프로/캡컷 방식의 레이어 전환
 *
 * ★ 핵심 원리 (프리미어 프로 기준):
 * 전환 중 "항상 하나의 레이어가 완전 불투명"이어야 함.
 * 그래야 아래쪽 base layer(다른 크기/모션)가 비쳐 보이지 않음.
 *
 * 카테고리별 전략:
 * - crossfade: 나가는 씬이 배경(z=3), 들어오는 씬이 위에서 opacity↑ (z=4)
 *   → 수학적으로 정확한 블렌딩: new*t + old*(1-t)
 * - wipe/shape: 들어오는 씬이 clip-path로 점진 공개 (나가는 씬은 아래에 정지)
 * - push: 두 씬이 동시에 불투명 이동 (bleed 없음)
 * - cover: 들어오는 씬이 위에서 슬라이드 인 (나가는 씬 정지)
 * - effect reveal: 나가는 씬이 위에서 효과+페이드로 사라짐, 새 씬은 아래에 정지
 * - flip 3D: 양쪽 모두 3D 회전 (backface hidden으로 순차 노출)
 */
interface TransConfig {
  exitAnim: string;   // 나가는 장면 CSS animation-name
  enterAnim: string;  // 들어오는 장면 CSS animation-name
  exitZ: number;      // 나가는 장면 z-index
  enterZ: number;     // 들어오는 장면 z-index
  easing: string;     // CSS easing
}

function getTransConfig(preset: SceneTransitionPreset): TransConfig {
  // 프리미어 프로: Cross Dissolve는 거의 linear, 기하학 전환은 부드러운 ease
  const ease = 'cubic-bezier(0.25, 0.1, 0.25, 1)'; // = CSS 'ease' — 빠른 시작, 부드러운 끝
  switch (preset) {
    // ── Crossfade (프리미어 Cross Dissolve 방식) ──
    // 나가는 씬이 불투명 배경(z=3), 들어오는 씬이 위에서 fade-in(z=4)
    // → 항상 배경이 완전 불투명이므로 base layer bleed 없음
    case 'fade': case 'dissolve':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-dissolve-in', exitZ: 3, enterZ: 4, easing: 'linear' };
    // ── Effect Reveal (나가는 씬이 효과와 함께 사라지며 뒤의 새 씬 공개) ──
    case 'fadeWhite':
      return { exitAnim: 'tr-fadeWhite-out', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: 'ease' };
    // ── Wipe (들어오는 씬이 위에서 clip-path 공개) ──
    case 'wipeLeft':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-wipeLeft-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'wipeRight':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-wipeRight-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'wipeUp':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-wipeUp-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'wipeDown':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-wipeDown-in', exitZ: 3, enterZ: 4, easing: ease };
    // ── Push (양쪽 동시 불투명 이동 — bleed 불가) ──
    case 'slideLeft':
      return { exitAnim: 'tr-slideLeft', enterAnim: 'tr-slideLeft-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'slideRight':
      return { exitAnim: 'tr-slideRight', enterAnim: 'tr-slideRight-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'slideUp':
      return { exitAnim: 'tr-slideUp', enterAnim: 'tr-slideUp-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'slideDown':
      return { exitAnim: 'tr-slideDown', enterAnim: 'tr-slideDown-in', exitZ: 3, enterZ: 4, easing: ease };
    // ── Cover (들어오는 씬만 이동) ──
    case 'coverLeft':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-coverLeft-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'coverRight':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-coverRight-in', exitZ: 3, enterZ: 4, easing: ease };
    // ── Shape wipe ──
    case 'circleOpen':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-circleOpen-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'circleClose':
      return { exitAnim: 'tr-circleClose', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'radial':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-radial-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'diagBR':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-diagBR-in', exitZ: 3, enterZ: 4, easing: ease };
    case 'diagTL':
      return { exitAnim: 'tr-stay', enterAnim: 'tr-diagTL-in', exitZ: 3, enterZ: 4, easing: ease };
    // ── Zoom (나가는 씬이 위에서 확대/축소+페이드, 새 씬은 불투명 배경) ──
    case 'zoomIn':
      return { exitAnim: 'tr-zoomOut', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'zoomOut':
      return { exitAnim: 'tr-zoomIn-out', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    // ── Flip 3D (양쪽 모두 3D 회전 — backfaceVisibility:hidden으로 순차 노출) ──
    case 'flipX':
      return { exitAnim: 'tr-flipX', enterAnim: 'tr-flipX-in', exitZ: 4, enterZ: 3, easing: ease };
    case 'flipY':
      return { exitAnim: 'tr-flipY', enterAnim: 'tr-flipY-in', exitZ: 4, enterZ: 3, easing: ease };
    // ── Effect Reveal (나가는 씬이 효과+페이드로 사라지며 새 씬 공개) ──
    case 'smoothLeft':
      return { exitAnim: 'tr-smoothLeft', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'smoothRight':
      return { exitAnim: 'tr-smoothRight', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'blur':
      return { exitAnim: 'tr-blur', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'pixelate':
      return { exitAnim: 'tr-pixelate', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'squeezH':
      return { exitAnim: 'tr-squeezH', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: ease };
    case 'flash':
      return { exitAnim: 'tr-flash', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: 'linear' };
    case 'glitch':
      return { exitAnim: 'tr-glitch', enterAnim: 'tr-stay', exitZ: 4, enterZ: 3, easing: 'linear' };
    default:
      return { exitAnim: 'tr-stay', enterAnim: 'tr-dissolve-in', exitZ: 3, enterZ: 4, easing: 'ease-in-out' };
  }
}

/** 전환 오버레이 DOM 요소 생성 (React 렌더링 우회, 직접 DOM 조작) */
function createTransitionOverlay(
  imgUrl: string | undefined,
  videoUrl: string | undefined,
  useOverscale: boolean,
  animName: string,
  zIdx: number,
  duration: number,
  easing: string,
): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;inset:0;overflow:hidden;z-index:${zIdx};backface-visibility:hidden;will-change:transform,opacity,clip-path,filter;animation:${animName} ${duration}s ${easing} both;`;
  let mediaEl: HTMLElement | null = null;
  if (videoUrl) {
    const v = document.createElement('video');
    v.src = videoUrl;
    if (imgUrl) v.poster = imgUrl;
    v.muted = true;
    v.playsInline = true;
    v.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
    mediaEl = v;
  } else if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = '';
    (img as HTMLImageElement).decoding = 'sync';
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
    mediaEl = img;
  }
  if (mediaEl) {
    if (useOverscale) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;top:-10%;right:-10%;bottom:-10%;left:-10%;';
      wrap.appendChild(mediaEl);
      div.appendChild(wrap);
    } else {
      div.appendChild(mediaEl);
    }
  }
  return div;
}

// 자막 애니메이션 프리셋 매핑
const ANIM_MAP: Record<string, { keyframe: string; dur: number; ease: string; fill: string; iter: number }> = {
  fadeIn: { keyframe: 'subAnim-fadeIn', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  'fade-in': { keyframe: 'subAnim-fadeIn', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  fadeInUp: { keyframe: 'subAnim-fadeInUp', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  fadeInDown: { keyframe: 'subAnim-fadeInDown', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  slideL: { keyframe: 'subAnim-slideL', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  slideR: { keyframe: 'subAnim-slideR', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  zoomIn: { keyframe: 'subAnim-zoomIn', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  zoomOut: { keyframe: 'subAnim-zoomOut', dur: 0.5, ease: 'ease', fill: 'both', iter: 1 },
  pulse: { keyframe: 'subAnim-pulse', dur: 1.5, ease: 'ease', fill: 'none', iter: 0 },
  breathe: { keyframe: 'subAnim-breathe', dur: 3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  float: { keyframe: 'subAnim-float', dur: 3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  shake: { keyframe: 'subAnim-shake', dur: 0.5, ease: 'ease', fill: 'none', iter: 0 },
  swing: { keyframe: 'subAnim-swing', dur: 1, ease: 'ease', fill: 'none', iter: 0 },
  typing: { keyframe: 'subAnim-typing', dur: 3, ease: 'steps(20)', fill: 'both', iter: 1 },
  blink: { keyframe: 'subAnim-blink', dur: 1, ease: 'step-end', fill: 'none', iter: 0 },
  bounceIn: { keyframe: 'subAnim-bounceIn', dur: 0.8, ease: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'both', iter: 1 },
  elasticIn: { keyframe: 'subAnim-elasticIn', dur: 1, ease: 'ease', fill: 'both', iter: 1 },
  flipX: { keyframe: 'subAnim-flipX', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  flipY: { keyframe: 'subAnim-flipY', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  rotateIn: { keyframe: 'subAnim-rotateIn', dur: 0.6, ease: 'ease', fill: 'both', iter: 1 },
  popIn: { keyframe: 'subAnim-popIn', dur: 0.4, ease: 'cubic-bezier(0.26,0.53,0.74,1.48)', fill: 'both', iter: 1 },
  lightSpeed: { keyframe: 'subAnim-lightSpeed', dur: 0.6, ease: 'ease-out', fill: 'both', iter: 1 },
  jackBox: { keyframe: 'subAnim-jackBox', dur: 0.8, ease: 'ease', fill: 'both', iter: 1 },
  neonFlicker: { keyframe: 'subAnim-neonFlicker', dur: 2, ease: 'linear', fill: 'none', iter: 0 },
  glitch: { keyframe: 'subAnim-glitch', dur: 0.3, ease: 'linear', fill: 'none', iter: 0 },
  rainbow: { keyframe: 'subAnim-rainbow', dur: 3, ease: 'linear', fill: 'none', iter: 0 },
  rubberBand: { keyframe: 'subAnim-rubberBand', dur: 1, ease: 'ease', fill: 'none', iter: 0 },
  jello: { keyframe: 'subAnim-jello', dur: 1.5, ease: 'ease', fill: 'none', iter: 0 },
  heartBeat: { keyframe: 'subAnim-heartBeat', dur: 1.3, ease: 'ease-in-out', fill: 'none', iter: 0 },
  tada: { keyframe: 'subAnim-tada', dur: 1.2, ease: 'ease', fill: 'none', iter: 0 },
  textGlow: { keyframe: 'subAnim-textGlow', dur: 2, ease: 'ease-in-out', fill: 'none', iter: 0 },
};

// SubtitleTemplate → inline CSS
function subtitleToCSS(tpl: SubtitleTemplate, scale: number): React.CSSProperties {
  const shadowParts: string[] = [];
  if (tpl.textShadowCSS) shadowParts.push(tpl.textShadowCSS);
  else if (tpl.shadowColor && tpl.shadowBlur > 0) {
    shadowParts.push(`${tpl.shadowOffsetX}px ${tpl.shadowOffsetY}px ${tpl.shadowBlur}px ${tpl.shadowColor}`);
  }
  if (tpl.outlineColor && tpl.outlineWidth > 0) {
    const ow = tpl.outlineWidth;
    shadowParts.push(`${ow}px 0 0 ${tpl.outlineColor}`, `-${ow}px 0 0 ${tpl.outlineColor}`, `0 ${ow}px 0 ${tpl.outlineColor}`, `0 -${ow}px 0 ${tpl.outlineColor}`);
  }
  return {
    fontFamily: `'${tpl.fontFamily}', Pretendard, sans-serif`,
    fontSize: `${Math.round(tpl.fontSize * scale)}px`,
    fontWeight: tpl.fontWeight,
    fontStyle: tpl.fontStyle || 'normal',
    color: tpl.color,
    backgroundColor: tpl.backgroundColor || 'transparent',
    textShadow: shadowParts.length > 0 ? shadowParts.join(', ') : 'none',
    letterSpacing: `${tpl.letterSpacing}px`,
    lineHeight: tpl.lineHeight,
    textAlign: tpl.textAlign || 'center',
  };
}

/** 편집실 미리보기 패널 — 현재 장면 크게 + 모션 효과 + 자막 스타일 + 필름스트립 */
const ScenePreviewPanel: React.FC<{
  scenes: ReturnType<typeof useProjectStore.getState>['scenes'];
  timeline: ReturnType<typeof useUnifiedTimeline>;
  expandedSceneId: string | null;
  onSelectScene: (id: string) => void;
  aspectRatio?: string;
}> = ({ scenes, timeline, expandedSceneId, onSelectScene, aspectRatio = '16:9' }) => {
  const activeId = expandedSceneId || scenes[0]?.id;
  const activeScene = scenes.find(s => s.id === activeId);
  const activeIdx = scenes.findIndex(s => s.id === activeId);
  const activeTiming = timeline.find(t => t.sceneId === activeId);
  const sceneSubtitles = useEditRoomStore(s => s.sceneSubtitles);
  const sceneEffects = useEditRoomStore(s => s.sceneEffects);
  const sceneOverlays = useEditRoomStore(s => s.sceneOverlays);
  const globalSubStyle = useEditRoomStore(s => s.globalSubtitleStyle);
  const sceneTransitions = useEditRoomStore(s => s.sceneTransitions);
  const activeSubtitleText = useEditRoomStore(s => s.activeSubtitleText);
  const isTimelinePlaying = useEditRoomStore(s => s.isTimelinePlaying);

  // 동적 폰트 스케일 — ResizeObserver
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = React.useState(800);
  React.useEffect(() => {
    if (!previewContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setPreviewW(w);
    });
    ro.observe(previewContainerRef.current);
    return () => ro.disconnect();
  }, []);
  const isPortraitAR = aspectRatio === '9:16';
  const refW = isPortraitAR ? 1080 : 1920;
  const fontScale = previewW / refW;

  // ═══ 전환 효과 — 직접 DOM 조작 방식 (React 렌더링 0회) ═══
  // ★ 핵심 원리:
  // React useState → 이중 렌더링 + 스터터 유발 → 제거.
  // useLayoutEffect 안에서 직접 DOM 요소 생성/삭제 → 페인트 전 즉시 적용.
  // animation-fill-mode: both → 첫 키프레임이 즉시 적용 (1프레임 플래시 방지).
  // 항상 하나의 레이어가 완전 불투명 → base bleed-through 차단.
  const prevActiveIdRef = React.useRef<string | null>(null);
  const transTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const transCleanupRef = React.useRef<(() => void) | null>(null);
  const transInProgressRef = React.useRef(false);

  // 모션 루핑 상태 (runTransition에서 참조 — 선언 순서 중요)
  const motionLooping = useEditRoomStore(s => s.motionLooping);

  // ★ Base 레이어 애니메이션 상태 연속 추적 (useLayoutEffect 전환 경로용)
  // useLayoutEffect는 React가 DOM을 이미 새 장면으로 업데이트한 후 실행되므로
  // 이전 장면의 Ken Burns 애니메이션 상태를 이 ref를 통해 캡처해야 함
  const baseAnimSnapshotRef = React.useRef<{
    animStr: string;
    currentTime: number;
    origin: string;
    filter: string;
  } | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const track = () => {
      const container = previewContainerRef.current;
      if (container) {
        const base = container.querySelector('[data-base-layer]') as HTMLElement | null;
        const media = base
          ? ((base.tagName === 'IMG' || base.tagName === 'VIDEO')
            ? base
            : base.querySelector('img, video') as HTMLElement | null)
          : null;
        if (media) {
          try {
            const anims = media.getAnimations();
            if (anims.length > 0 && anims[0].currentTime != null) {
              baseAnimSnapshotRef.current = {
                animStr: media.style.animation || '',
                currentTime: anims[0].currentTime as number,
                origin: media.style.transformOrigin || '',
                filter: media.style.filter || '',
              };
            } else {
              baseAnimSnapshotRef.current = null;
            }
          } catch (_) {
            baseAnimSnapshotRef.current = null;
          }
        }
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ═══ 전환 실행 공통 로직 ═══
  // ★ 근본 해결 3가지:
  //   1. Exit 오버레이: getComputedStyle로 현재 모션 상태(transform/filter) 캡처 → 정지 프레임 일치
  //   2. Enter 오버레이: 새 장면의 모션 애니메이션을 img에 적용 → 전환 중에도 이미 움직임
  //   3. cloneNode(true) + canCloneBase: 이미 디코딩된 비트맵 재사용 (navigateWithTransition 경로)
  const runTransition = useCallback((
    container: HTMLElement,
    outScene: { imageUrl?: string; videoUrl?: string },
    inScene: { imageUrl?: string; videoUrl?: string } | undefined,
    preset: SceneTransitionPreset,
    duration: number,
    outId: string,
    inId: string,
    canCloneBase: boolean,
  ) => {
    // 이전 전환 즉시 정리
    if (transCleanupRef.current) { transCleanupRef.current(); transCleanupRef.current = null; }
    if (transTimerRef.current) { clearTimeout(transTimerRef.current); transTimerRef.current = null; }

    const tc = getTransConfig(preset);
    const dur = duration;
    const outHM = !!computeMotionStyle(sceneEffects[outId]).animation;
    const inHM = !!computeMotionStyle(sceneEffects[inId]).animation;

    // ═══ Exit 오버레이 생성 ═══
    const baseEl = container.querySelector('[data-base-layer]') as HTMLElement | null;
    const baseMediaEl = (baseEl?.tagName === 'IMG' || baseEl?.tagName === 'VIDEO')
      ? baseEl
      : baseEl?.querySelector('img, video') as HTMLElement | null;

    const exitDiv = document.createElement('div');
    exitDiv.style.cssText = `position:absolute;inset:0;overflow:hidden;z-index:${tc.exitZ};animation:${tc.exitAnim} ${dur}s ${tc.easing} both;`;

    if (canCloneBase && baseMediaEl) {
      // ★ navigateWithTransition 경로: cloneNode + getComputedStyle로 모션 상태 캡처
      const computed = window.getComputedStyle(baseMediaEl);
      const frozenTransform = computed.transform || 'none';
      const frozenFilter = computed.filter || 'none';
      const frozenOrigin = computed.transformOrigin || '';

      const clone = baseMediaEl.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-base-layer');
      clone.style.animation = 'none';
      clone.style.transform = frozenTransform;
      clone.style.filter = frozenFilter;
      clone.style.transformOrigin = frozenOrigin;
      clone.style.display = 'block';
      clone.style.width = '100%';
      clone.style.height = '100%';
      clone.style.objectFit = 'cover';
      if (clone.tagName === 'VIDEO') {
        (clone as HTMLVideoElement).muted = true;
        (clone as HTMLVideoElement).playsInline = true;
      }
      if (outHM) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;top:-10%;right:-10%;bottom:-10%;left:-10%;';
        wrap.appendChild(clone);
        exitDiv.appendChild(wrap);
      } else {
        exitDiv.appendChild(clone);
      }
    } else {
      // useLayoutEffect 경로: base가 이미 새 장면 → createTransitionOverlay 폴백
      const fb = createTransitionOverlay(outScene.imageUrl, outScene.videoUrl, outHM, tc.exitAnim, tc.exitZ, dur, tc.easing);
      while (fb.firstChild) exitDiv.appendChild(fb.firstChild);

      // ★ 스냅샷은 아래에서 DOM에 추가한 후 적용 (detached element에서는 getAnimations() 불가)
    }

    // ═══ Enter 오버레이 생성 ═══
    const enterDiv = createTransitionOverlay(inScene?.imageUrl, inScene?.videoUrl, inHM, tc.enterAnim, tc.enterZ, dur, tc.easing);

    // ★ Enter 이미지에 새 장면의 모션 애니메이션 적용 (스타일만 미리 세팅, DOM 추가 전 가능)
    const inEffect = sceneEffects[inId];
    if (inEffect) {
      const inTiming = timeline.find(t => t.sceneId === inId);
      const inSceneDur = inTiming?.imageDuration || 0;
      const inMotion = computeMotionStyle(inEffect, motionLooping, inSceneDur);
      const enterMedia = enterDiv.querySelector('img, video') as HTMLElement | null;
      if (enterMedia && inMotion.animation) {
        enterMedia.style.animation = inMotion.animation as string;
        if (inMotion.transformOrigin) enterMedia.style.transformOrigin = inMotion.transformOrigin as string;
        if (inMotion.filter) enterMedia.style.filter = inMotion.filter as string;
      }
    }

    // base layer 숨김
    if (baseEl) baseEl.style.visibility = 'hidden';

    // ═══ DOM에 추가 (라이브 DOM에서만 getAnimations() 동작) ═══
    container.appendChild(exitDiv);
    container.appendChild(enterDiv);
    // Force reflow → 스타일 계산 + 애니메이션 시작
    void enterDiv.offsetHeight;

    // ★ canCloneBase=false: 이전 장면의 Ken Burns 모션을 exit overlay에 동기화
    // ★★ 핵심 수정: DOM에 추가된 후에만 getAnimations()가 동작함
    //   이전에는 detached element에서 호출 → getAnimations() 빈 배열 → currentTime 미동기화 → 포지션 점프
    if (!canCloneBase) {
      const snapshot = baseAnimSnapshotRef.current;
      if (snapshot && outHM) {
        const exitMedia = exitDiv.querySelector('img, video') as HTMLElement | null;
        if (exitMedia && snapshot.animStr) {
          exitMedia.style.animation = snapshot.animStr;
          exitMedia.style.transformOrigin = snapshot.origin;
          if (snapshot.filter && snapshot.filter !== 'none') exitMedia.style.filter = snapshot.filter;
          void exitMedia.offsetHeight; // force style recalc → animation 등록
          try {
            const anims = exitMedia.getAnimations();
            if (anims.length > 0) {
              anims[0].currentTime = snapshot.currentTime;
            }
          } catch (_) { /* graceful fallback */ }
        }
      }
    }

    // 정리 함수
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      transInProgressRef.current = false;

      // ★ 전환 종료 시 base layer의 모션을 enter 오버레이와 동기화
      // 재생 중일 때만 동기화 — 정지 상태에서는 React가 animation을 제거하므로 간섭하지 않음
      const isPlaying = useEditRoomStore.getState().isTimelinePlaying;
      const enterMedia = enterDiv.querySelector('img, video') as HTMLElement | null;
      const freshBase = container.querySelector('[data-base-layer]') as HTMLElement | null;
      if (isPlaying && enterMedia && freshBase) {
        const baseMedia = (freshBase.tagName === 'IMG' || freshBase.tagName === 'VIDEO')
          ? freshBase
          : freshBase.querySelector('img, video') as HTMLElement | null;
        if (baseMedia) {
          try {
            const enterAnims = enterMedia.getAnimations();
            if (enterAnims.length > 0) {
              const enterAnimStr = enterMedia.style.animation;
              const enterOrigin = enterMedia.style.transformOrigin;
              const enterFilter = enterMedia.style.filter;

              baseMedia.style.animation = 'none';
              void baseMedia.offsetHeight;
              if (enterAnimStr) baseMedia.style.animation = enterAnimStr;
              if (enterOrigin) baseMedia.style.transformOrigin = enterOrigin;
              if (enterFilter) baseMedia.style.filter = enterFilter;

              const baseAnims = baseMedia.getAnimations();
              for (let i = 0; i < Math.min(enterAnims.length, baseAnims.length); i++) {
                if (enterAnims[i].currentTime != null) {
                  baseAnims[i].currentTime = enterAnims[i].currentTime;
                }
              }
            }
          } catch (_e) { /* graceful fallback */ }
        }
      }

      // ★ 순서 중요: base를 먼저 보이게 한 뒤 overlay 제거 → 검은 프레임 방지
      if (freshBase) freshBase.style.visibility = '';
      exitDiv.remove();
      enterDiv.remove();
      transCleanupRef.current = null;
    };
    transCleanupRef.current = cleanup;

    // exit/enter 중 위쪽 레이어의 animationend로 종료 감지
    const topLayer = tc.enterZ > tc.exitZ ? enterDiv : exitDiv;
    topLayer.addEventListener('animationend', cleanup, { once: true });
    transTimerRef.current = setTimeout(cleanup, dur * 1000 + 500);

    return cleanup;
  }, [sceneEffects, timeline, motionLooping]);

  // ═══ navigateWithTransition — 전환 방식 분기 ═══
  // ★ tr-stay 퇴장: 클론 없이 base 자체가 퇴장 레이어 → 포지션 불일치 0%
  // ★ 기타 퇴장: 기존 cloneNode + getComputedStyle (slide, zoom, flip 등)
  const navigateWithTransition = useCallback((targetId: string) => {
    const container = previewContainerRef.current;
    if (!container || !activeId || targetId === activeId) {
      onSelectScene(targetId);
      return;
    }

    const cfg = sceneTransitions[activeId];
    if (!cfg || cfg.preset === 'none') {
      onSelectScene(targetId);
      return;
    }

    const tc = getTransConfig(cfg.preset);

    // ═══ tr-stay 퇴장: dissolve, fade, wipe, cover, circle 등 ═══
    // base 자체가 퇴장 레이어 역할 → clone 불필요 → 포지션 점프 완전 제거
    // onSelectScene을 전환 종료 시점까지 지연 (base가 이전 장면을 유지해야 하므로)
    if (tc.exitAnim === 'tr-stay') {
      // 이전 전환 즉시 정리
      if (transCleanupRef.current) { transCleanupRef.current(); transCleanupRef.current = null; }
      if (transTimerRef.current) { clearTimeout(transTimerRef.current); transTimerRef.current = null; }

      transInProgressRef.current = true;
      const dur = cfg.duration;
      const inHM = !!computeMotionStyle(sceneEffects[targetId]).animation;

      // base를 퇴장 레이어 z-index로 올림 (enter overlay 아래)
      const baseEl = container.querySelector('[data-base-layer]') as HTMLElement | null;
      if (baseEl) baseEl.style.zIndex = String(tc.exitZ);

      // Enter overlay만 생성 (퇴장 overlay 불필요)
      const inScene = scenes.find(s => s.id === targetId);
      const enterDiv = createTransitionOverlay(
        inScene?.imageUrl, inScene?.videoUrl, inHM,
        tc.enterAnim, tc.enterZ, dur, tc.easing,
      );

      // 새 장면 모션 적용
      const inEffect = sceneEffects[targetId];
      if (inEffect) {
        const inTiming = timeline.find(t => t.sceneId === targetId);
        const inSceneDur = inTiming?.imageDuration || 0;
        const inMotion = computeMotionStyle(inEffect, motionLooping, inSceneDur);
        const enterMedia = enterDiv.querySelector('img, video') as HTMLElement | null;
        if (enterMedia && inMotion.animation) {
          enterMedia.style.animation = inMotion.animation as string;
          if (inMotion.transformOrigin) enterMedia.style.transformOrigin = inMotion.transformOrigin as string;
          if (inMotion.filter) enterMedia.style.filter = inMotion.filter as string;
        }
      }

      container.appendChild(enterDiv);
      void enterDiv.offsetHeight;

      // 정리 함수 — 전환 종료 후 React 상태 업데이트
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;

        // ① base z-index 복원 + 숨김 (React 업데이트 동안 이전 장면 안 보이게)
        if (baseEl) {
          baseEl.style.zIndex = '1';
          baseEl.style.visibility = 'hidden';
        }

        // ② React 상태 업데이트 (이제서야 장면 전환)
        onSelectScene(targetId);

        // ③ 다음 프레임에서 base 동기화 + enter overlay 제거
        requestAnimationFrame(() => {
          const freshBase = container.querySelector('[data-base-layer]') as HTMLElement | null;
          const isPlayingNow = useEditRoomStore.getState().isTimelinePlaying;
          if (freshBase) {
            // 재생 중일 때만 enter overlay의 animation을 base에 동기화
            // 정지 상태에서는 React가 animation을 제거하므로 DOM 직접 설정 불필요
            if (isPlayingNow) {
              const baseMedia = (freshBase.tagName === 'IMG' || freshBase.tagName === 'VIDEO')
                ? freshBase
                : freshBase.querySelector('img, video') as HTMLElement | null;
              const enterMedia = enterDiv.querySelector('img, video') as HTMLElement | null;
              if (baseMedia && enterMedia) {
                try {
                  const enterAnims = enterMedia.getAnimations();
                  if (enterAnims.length > 0) {
                    const eAnimStr = enterMedia.style.animation;
                    const eOrigin = enterMedia.style.transformOrigin;
                    const eFilter = enterMedia.style.filter;
                    baseMedia.style.animation = 'none';
                    void baseMedia.offsetHeight;
                    if (eAnimStr) baseMedia.style.animation = eAnimStr;
                    if (eOrigin) baseMedia.style.transformOrigin = eOrigin;
                    if (eFilter) baseMedia.style.filter = eFilter;
                    const baseAnims = baseMedia.getAnimations();
                    for (let i = 0; i < Math.min(enterAnims.length, baseAnims.length); i++) {
                      if (enterAnims[i].currentTime != null) {
                        baseAnims[i].currentTime = enterAnims[i].currentTime;
                      }
                    }
                  }
                } catch (_e) { /* graceful fallback */ }
              }
            }
            freshBase.style.visibility = '';
          }
          enterDiv.remove();
          transInProgressRef.current = false;
          transCleanupRef.current = null;
        });
      };
      transCleanupRef.current = cleanup;
      enterDiv.addEventListener('animationend', cleanup, { once: true });
      transTimerRef.current = setTimeout(cleanup, dur * 1000 + 500);
      return;
    }

    // ═══ 기타 퇴장 (slide, zoom, flip 등): 기존 clone + getComputedStyle 방식 ═══
    const outScene = scenes.find(s => s.id === activeId);
    if (!outScene) { onSelectScene(targetId); return; }
    const inScene = scenes.find(s => s.id === targetId);

    transInProgressRef.current = true;
    runTransition(container, outScene, inScene, cfg.preset, cfg.duration, activeId, targetId, true);
    onSelectScene(targetId);
  }, [activeId, scenes, sceneTransitions, sceneEffects, timeline, motionLooping, onSelectScene, runTransition]);

  // ★ 타임라인 재생 시 전환 콜백 등록 — VisualTimeline이 장면 전환 시 이 함수를 호출
  // navigateWithTransition은 base 자체를 퇴장 레이어로 사용 → 포지션 점프 제거
  React.useEffect(() => {
    useEditRoomStore.getState().setNavigateToSceneFn(navigateWithTransition);
    return () => { useEditRoomStore.getState().setNavigateToSceneFn(null); };
  }, [navigateWithTransition]);

  // ═══ useLayoutEffect 폴백 — 외부 네비게이션(필름스트립 클릭 등) 대응 ═══
  React.useLayoutEffect(() => {
    const prevId = prevActiveIdRef.current;
    prevActiveIdRef.current = activeId || null;

    // navigateWithTransition이 이미 처리 중이면 스킵
    if (transInProgressRef.current) return;

    if (!prevId || !activeId || prevId === activeId) return;

    const cfg = sceneTransitions[prevId];
    if (!cfg || cfg.preset === 'none') return;
    const container = previewContainerRef.current;
    if (!container) return;
    const outScene = scenes.find(s => s.id === prevId);
    if (!outScene) return;
    const inScene = scenes.find(s => s.id === activeId);

    // useLayoutEffect 경로: React가 이미 base를 새 장면으로 리렌더 → cloneNode 불가
    transInProgressRef.current = true;
    const cleanup = runTransition(container, outScene, inScene, cfg.preset, cfg.duration, prevId, activeId, false);

    return () => {
      if (transTimerRef.current) { clearTimeout(transTimerRef.current); transTimerRef.current = null; }
      cleanup();
    };
  }, [activeId, scenes, sceneTransitions, sceneEffects, runTransition]);

  const subtitleTextBase = React.useMemo(() => {
    if (!activeId) return '';
    const sub = sceneSubtitles[activeId];
    if (!sub) return activeScene?.scriptText || '';
    // segments가 있으면 세그먼트 텍스트를 줄바꿈으로 합쳐서 표시 (정지 상태에서도 분할 결과 반영)
    if (sub.segments && sub.segments.length > 0) {
      return sub.segments.map(s => s.text).join('\n');
    }
    return sub.text || activeScene?.scriptText || '';
  }, [activeId, sceneSubtitles, activeScene]);

  // 재생 중: 현재 세그먼트만 표시, 정지 시: 전체 텍스트 (세그먼트 반영)
  const subtitleText = isTimelinePlaying && activeSubtitleText
    ? activeSubtitleText
    : subtitleTextBase;

  const effectConfig = React.useMemo(() => {
    if (!activeId) return undefined;
    return sceneEffects[activeId];
  }, [activeId, sceneEffects]);

  const activeOverlays = React.useMemo(() => {
    if (!activeId) return [];
    return sceneOverlays[activeId] || [];
  }, [activeId, sceneOverlays]);

  const effectPresetLabel = React.useMemo(() => {
    const EFFECT_LABELS: Record<string, string> = {
      smooth: '부드러운 줌', fast: '빠른 줌', cinematic: '시네마틱',
      dynamic: '역동적', dreamy: '우아한', dramatic: '드라마틱',
      zoom: '집중', reveal: '공개', vintage: '빈티지',
      documentary: '다큐멘터리', timelapse: '타임랩스', vlog: '브이로그',
      static: '정지', none: '없음',
    };
    const preset = effectConfig?.panZoomPreset || 'smooth';
    return EFFECT_LABELS[preset] || preset;
  }, [effectConfig]);

  const bottomFade = useEditRoomStore(s => s.bottomFade);

  // 이미지 모션 스타일 — 재생 중에만 애니메이션 적용
  const motionStyle = React.useMemo(() => {
    if (!activeScene || !effectConfig) return {};
    const sceneDur = activeTiming?.imageDuration || 0;
    const style = computeMotionStyle(effectConfig, motionLooping, sceneDur);
    if (!isTimelinePlaying) {
      // 정지 상태: animation 제거, filter만 유지
      const { animation: _a, animationPlayState: _p, ...rest } = style as Record<string, unknown>;
      return rest as React.CSSProperties;
    }
    return style;
  }, [effectConfig, activeScene, motionLooping, activeTiming, isTimelinePlaying]);

  // 커스텀 폰트 로딩 — globalSubStyle 변경 시 폰트 프리로드
  React.useEffect(() => {
    const fontFamily = globalSubStyle?.template?.fontFamily;
    if (fontFamily) {
      const entry = getFontByFamily(fontFamily);
      if (entry) loadFont(entry);
    }
  }, [globalSubStyle?.template?.fontFamily]);

  // 120% overscale 필요 여부: transform 기반 애니메이션이 있을 때
  // filter-only 효과(high-contrast, rain 등)는 이미지 이동 없으므로 overscale 불필요
  // ★ 재생 여부와 무관하게 항상 래퍼 적용 — 재생 시작 시 크기 점프 방지
  const hasMotion = React.useMemo(() => {
    if (!effectConfig) return false;
    const style = computeMotionStyle(effectConfig);
    return !!style.animation;
  }, [effectConfig]);

  // 프리셋 변경 시에만 CSS animation 강제 재시작 (key가 바뀌면 React가 DOM 재생성)
  // ★ activeId를 key에서 제거 — 장면 전환 시 React가 DOM을 파괴/재생성하면
  //   runTransition이 설정한 visibility:hidden이 사라지고 animation이 frame 0부터 재시작 → 점프 발생
  //   activeId 없이는 React가 기존 DOM을 업데이트만 하므로 visibility:hidden이 유지됨
  const motionKey = `${effectConfig?.panZoomPreset || 'none'}-${effectConfig?.motionEffect || 'none'}`;

  // 자막 스타일 계산 (globalSubtitleStyle + per-scene styleOverride)
  const subtitleCSS = React.useMemo<React.CSSProperties>(() => {
    const tpl: SubtitleTemplate | undefined = (() => {
      const sub = activeId ? sceneSubtitles[activeId] : undefined;
      if (sub?.styleOverride) {
        return { ...(globalSubStyle?.template || {} as SubtitleTemplate), ...sub.styleOverride } as SubtitleTemplate;
      }
      return globalSubStyle?.template;
    })();
    if (!tpl) return {};
    // 동적 폰트 스케일 (원본 기준 → 프리뷰 폭 비율)
    return subtitleToCSS(tpl, fontScale);
  }, [globalSubStyle, sceneSubtitles, activeId, fontScale]);

  // 자막 위치 (positionY: % from bottom)
  const subtitlePosY = React.useMemo(() => {
    const sub = activeId ? sceneSubtitles[activeId] : undefined;
    const tpl = sub?.styleOverride
      ? { ...(globalSubStyle?.template || {}), ...sub.styleOverride }
      : globalSubStyle?.template;
    return (tpl as SubtitleTemplate | undefined)?.positionY ?? 10;
  }, [globalSubStyle, sceneSubtitles, activeId]);

  // 자막 애니메이션
  const subtitleAnimCSS = React.useMemo<React.CSSProperties>(() => {
    const sub = activeId ? sceneSubtitles[activeId] : undefined;
    const preset = sub?.animationPreset;
    if (!preset || preset === 'none') return {};
    const a = ANIM_MAP[preset];
    if (!a) return {};
    const dur = sub?.animationDuration ?? a.dur;
    const delay = sub?.animationDelay ?? 0;
    const iter = sub?.animationIterationCount ?? a.iter;
    return {
      animation: `${a.keyframe} ${dur}s ${a.ease} ${delay}s ${a.fill === 'none' ? '' : a.fill} ${iter === 0 ? 'infinite' : iter}`.trim(),
    };
  }, [activeId, sceneSubtitles]);

  // 인접 씬 이미지 프리로드 + 프리디코드 — 전환 시 이미지 디코딩 지연 방지
  React.useEffect(() => {
    const preload = (url: string | undefined) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
      // decode()는 비동기적으로 이미지를 GPU 텍스처까지 완전 준비
      // → 전환 시 createElement로 같은 src 사용하면 즉시 표시 가능
      if (img.decode) img.decode().catch((e) => { logger.trackSwallowedError('EditRoomTab:preload/imageDecode', e); });
    };
    if (activeIdx > 0) preload(scenes[activeIdx - 1]?.imageUrl);
    if (activeIdx < scenes.length - 1) preload(scenes[activeIdx + 1]?.imageUrl);
    // 2칸 앞뒤도 프리로드 (빠른 네비게이션 대비)
    if (activeIdx > 1) preload(scenes[activeIdx - 2]?.imageUrl);
    if (activeIdx < scenes.length - 2) preload(scenes[activeIdx + 2]?.imageUrl);
  }, [activeIdx, scenes]);

  const isPortrait = aspectRatio === '9:16';
  const isSquare = aspectRatio === '1:1';
  const arMap: Record<string, string> = { '16:9': '16/9', '9:16': '9/16', '1:1': '1/1', '4:3': '4/3' };
  const cssAspect = arMap[aspectRatio] || '16/9';

  if (scenes.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
      <p className="text-base mb-1">장면이 없습니다</p>
      <p className="text-sm">이미지/영상 탭에서 장면을 먼저 생성해주세요.</p>
    </div>
  );

  const formatDur = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handlePrev = () => {
    if (activeIdx > 0) navigateWithTransition(scenes[activeIdx - 1].id);
  };
  const handleNext = () => {
    if (activeIdx < scenes.length - 1) navigateWithTransition(scenes[activeIdx + 1].id);
  };

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-900/60 overflow-hidden">
      <style>{PREVIEW_MOTION_KEYFRAMES}</style>

      {/* 메인 프리뷰 + 좌우 네비게이션 — 비율 반응형 */}
      <div ref={previewContainerRef} className="relative isolate bg-black overflow-hidden"
        style={{
          ...(isPortrait || isSquare
            ? { maxHeight: '70vh', aspectRatio: cssAspect, marginLeft: 'auto', marginRight: 'auto' }
            : { width: '100%', aspectRatio: cssAspect }),
        }}
      >
        {/* 좌측 네비 화살표 */}
        {activeIdx > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-gray-600/40 flex items-center justify-center text-white transition-all backdrop-blur-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" /></svg>
          </button>
        )}

        {/* 우측 네비 화살표 */}
        {activeIdx < scenes.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-gray-600/40 flex items-center justify-center text-white transition-all backdrop-blur-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </button>
        )}

        {/* ═══ Base Layer: 현재 장면 (z=1) ═══
             data-base-layer: 전환 시 useLayoutEffect에서 직접 visibility 제어
             모션 활성: 120% overscale 래퍼 + 모션 애니메이션
             비모션: 100% 컨테이너 채움 */}
        {hasMotion ? (
          <div
            data-base-layer
            key={`wrap-${motionKey}`}
            style={{
              position: 'absolute', top: '-10%', right: '-10%', bottom: '-10%', left: '-10%',
              zIndex: 1,
            }}
          >
            {activeScene?.videoUrl ? (
              <video
                src={activeScene.videoUrl}
                poster={activeScene.imageUrl}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionStyle }}
                muted loop playsInline
              />
            ) : activeScene?.imageUrl ? (
              <img
                src={activeScene.imageUrl}
                alt={`장면 ${activeIdx + 1}`}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionStyle }}
                decoding="sync"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                <span className="text-sm">이미지 없음</span>
              </div>
            )}
          </div>
        ) : (
          activeScene?.videoUrl ? (
            <video
              data-base-layer
              key={`v-${motionKey}`}
              src={activeScene.videoUrl}
              poster={activeScene.imageUrl}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 1, ...(motionStyle.filter ? { filter: motionStyle.filter as string } : {}) }}
              muted loop playsInline
            />
          ) : activeScene?.imageUrl ? (
            <img
              data-base-layer
              key={motionKey}
              src={activeScene.imageUrl}
              alt={`장면 ${activeIdx + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 1, ...(motionStyle.filter ? { filter: motionStyle.filter as string } : {}) }}
              decoding="sync"
            />
          ) : (
            <div data-base-layer className="absolute inset-0 flex items-center justify-center text-gray-600" style={{ zIndex: 1 }}>
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><path d="M21 15l-5-5L5 21" strokeWidth="1.5" /></svg>
              <span className="text-sm">이미지 없음</span>
            </div>
          )
        )}
        {/* 전환 오버레이: useLayoutEffect에서 직접 DOM 생성/삭제 (React 렌더링 0회) */}

        {/* 오버레이 효과 (눈/비/필름 등) */}
        {activeOverlays.length > 0 && (
          <div className="absolute inset-0 z-[3] pointer-events-none overflow-hidden">
            <OverlayPreviewLayer overlays={activeOverlays} />
          </div>
        )}

        {/* 하단 페이드 — 자막 가독성용 검정 그라데이션 */}
        {bottomFade > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none z-[5]"
            style={{
              height: '40%',
              background: `linear-gradient(to top, rgba(0,0,0,${(bottomFade / 100).toFixed(2)}) 0%, rgba(0,0,0,${(bottomFade / 200).toFixed(2)}) 50%, transparent 100%)`,
            }}
          />
        )}

        {/* 자막 오버레이 — 스타일 적용 */}
        {subtitleText && (
          <div
            className="absolute left-0 right-0 px-4 py-2 flex justify-center pointer-events-none z-10"
            style={{ bottom: `${subtitlePosY}%` }}
          >
            <p
              key={`sub-${activeId}`}
              className="max-w-[90%] whitespace-pre-line"
              style={{
                // 기본 fallback
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 700,
                textAlign: 'center',
                lineHeight: 1.4,
                textShadow: '1px 1px 3px rgba(0,0,0,0.8), -1px -1px 3px rgba(0,0,0,0.8)',
                // [FIX #404] 한국어 단어 중간 줄바꿈 방지 — 띄어쓰기 기준으로만 줄바꿈
                wordBreak: 'keep-all',
                // globalSubtitleStyle 오버라이드
                ...subtitleCSS,
                // 자막 애니메이션
                ...subtitleAnimCSS,
                // 자막 배경이 꺼져 있으면 배경 제거
                backgroundColor: subtitleCSS.backgroundColor && subtitleCSS.backgroundColor !== 'transparent'
                  ? subtitleCSS.backgroundColor
                  : 'transparent',
                padding: '4px 12px',
                borderRadius: subtitleCSS.backgroundColor && subtitleCSS.backgroundColor !== 'transparent'
                  ? '0px' : '0px',
              }}
            >
              {subtitleText.length > 120 ? subtitleText.slice(0, 120) + '...' : subtitleText}
            </p>
          </div>
        )}

        {/* 장면 번호 + 효과 배지 */}
        <div className="absolute top-2 left-2 flex items-center gap-2 z-20">
          <span className="bg-amber-600/90 text-white text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
            {activeIdx + 1} / {scenes.length}
          </span>
          {activeTiming && (
            <span className="bg-gray-800/80 text-amber-300 text-xs font-mono px-2 py-0.5 rounded-full backdrop-blur-sm">
              {formatDur(activeTiming.imageDuration)}
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 z-20">
          <span className="bg-gray-800/80 text-gray-300 text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm border border-gray-600/40">
            {effectPresetLabel}
          </span>
        </div>
      </div>

    </div>
  );
};

/** Base64 data URI → Blob URL 변환 (메모리 최적화: FFmpeg에 거대한 base64 문자열 대신 Blob URL 전달) */
function base64ToBlobUrl(base64: string): string {
  const [header, data] = base64.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  logger.registerBlobUrl(blobUrl, mime.startsWith('video') ? 'video' : 'image', 'EditRoomTab:base64ToBlobUrl');
  return blobUrl;
}

const EditRoomTab: React.FC = () => {
  // 대본 직접 입력 비활성화 — 미사용 상태 제거됨
  const scenes = useProjectStore((s) => s.scenes);
  const lines = useSoundStudioStore((s) => s.lines);
  const initialized = useEditRoomStore((s) => s.initialized);
  const initFromProject = useEditRoomStore((s) => s.initFromProject);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const globalSubtitleStyle = useEditRoomStore((s) => s.globalSubtitleStyle);
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const setExpandedSceneId = useEditRoomStore((s) => s.setExpandedSceneId);
  const selectedLayer = useEditRoomStore((s) => s.selectedLayer);
  const setIsExporting = useEditRoomStore((s) => s.setIsExporting);
  const setExportProgress = useEditRoomStore((s) => s.setExportProgress);
  const setExportedVideoBlob = useEditRoomStore((s) => s.setExportedVideoBlob);
  const renderSettings = useEditRoomStore((s) => s.renderSettings);
  const projectAspectRatio = useProjectStore((s) => s.config?.aspectRatio || '16:9');
  const timeline = useUnifiedTimeline();
  const totalDuration = useTotalDuration();
  const [showRenderModal, setShowRenderModal] = useState(false);
  const exportAbortRef = React.useRef<AbortController | null>(null);
  const { requireAuth } = useAuthGuard();

  // 프로젝트 데이터 → editRoomStore 초기화
  useEffect(() => {
    if (scenes.length > 0 && !initialized) {
      initFromProject();
    }
  }, [scenes.length, initialized, initFromProject]);

  // 장면 추가/삭제 감지 → 재초기화 (순서 변경만으로는 트리거하지 않음)
  const sceneIds = scenes.map((s) => s.id);
  const sceneIdsKey = sceneIds.join(',');
  useEffect(() => {
    if (!initialized || scenes.length === 0) return;
    const currentIds = new Set(sceneOrder);
    const newIds = new Set(sceneIds);
    const hasNew = sceneIds.some((id) => !currentIds.has(id));
    const hasRemoved = sceneOrder.some((id) => !newIds.has(id));
    if (hasNew || hasRemoved) {
      initFromProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIdsKey, initialized, initFromProject]);

  // [CRITICAL FIX] TTS 타이밍 변경 감지 → 타이밍 재초기화
  // 사용자가 사운드 스튜디오에서 TTS 생성 후 편집실로 돌아오면 타이밍 업데이트 필요
  const linesTimingKey = lines.map((l) => `${l.id}:${l.startTime ?? ''}:${l.duration ?? ''}:${l.audioUrl ? '1' : '0'}`).join('|');
  useEffect(() => {
    if (!initialized || scenes.length === 0 || lines.length === 0) return;
    // lines에 유효한 타이밍이 있을 때만 재초기화
    const hasNewTiming = lines.some((l) => l.startTime != null && l.duration != null && l.duration > 0);
    if (hasNewTiming) {
      initFromProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesTimingKey]);

  // [FIX #375] 편집실 진입 시 실제 이미지 비율 자동 감지 → 프로젝트 설정 동기화
  // 스토리보드에서 9:16으로 생성한 이미지가 편집실에서 1:1 등으로 표시되는 문제 방지
  const aspectSyncDone = React.useRef(false);
  useEffect(() => {
    if (aspectSyncDone.current || scenes.length === 0) return;
    const firstWithImage = scenes.find(s => s.imageUrl);
    if (!firstWithImage?.imageUrl) return;

    const img = new Image();
    img.onload = () => {
      aspectSyncDone.current = true;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w === 0 || h === 0) return;

      const ratio = w / h;
      let detectedAR: string;
      if (ratio < 0.75) detectedAR = '9:16';
      else if (ratio > 1.2) detectedAR = '16:9';
      else if (ratio >= 0.9 && ratio <= 1.1) detectedAR = '1:1';
      else detectedAR = '4:3';

      const currentConfig = useProjectStore.getState().config;
      if (currentConfig && currentConfig.aspectRatio !== detectedAR) {
        logger.info('[FIX #375] 편집실 비율 자동 보정', { from: currentConfig.aspectRatio, to: detectedAR });
        useProjectStore.getState().setConfig({
          ...currentConfig,
          aspectRatio: detectedAR as any,
        });
      }
    };
    img.onerror = () => { aspectSyncDone.current = true; };
    img.src = firstWithImage.imageUrl;
  }, [scenes]);

  const handleExportSrt = useCallback(() => {
    logger.trackAction('SRT 내보내기');
    try {
      downloadSrtFile(timeline, 'subtitles.srt');
    } catch (err) {
      showToast('SRT 내보내기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  }, [timeline]);

  const handleExportZip = useCallback(async () => {
    logger.trackAction('ZIP 내보내기');
    if (!requireAuth('ZIP 내보내기')) return;
    try {
      // [FIX #76] 나레이션 오디오를 ZIP에 포함 — CapCut 등 외부 편집기에서 오디오 사용 가능
      // [FIX #183] 프로젝트 비율 설정을 전달하여 이미지 크롭 적용
      await downloadSrtWithAssetsZip(
        timeline,
        scenes.map((s) => ({ id: s.id, imageUrl: s.imageUrl, videoUrl: s.videoUrl })),
        'project-assets.zip',
        lines.filter((l) => !!l.audioUrl).map((l) => ({ sceneId: l.sceneId, audioUrl: l.audioUrl })),
        projectAspectRatio,
      );
    } catch (err) {
      showToast('ZIP 내보내기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  }, [timeline, scenes, lines, requireAuth, projectAspectRatio]);

  // NLE 프로젝트 내보내기 (CapCut / Premiere / VREW)
  const handleExportNle = useCallback(async (target: EditRoomNleTarget) => {
    const targetLabel = target === 'premiere' ? 'Premiere Pro' : target === 'capcut' ? 'CapCut' : 'VREW';
    logger.trackAction(`NLE 내보내기: ${targetLabel}`);
    if (!requireAuth(`${targetLabel} 내보내기`)) return;
    if (timeline.length === 0) {
      showToast('내보낼 장면이 없습니다.');
      return;
    }
    // [FIX #665/#657] CapCut 직접 설치: showDirectoryPicker를 confirm보다 먼저 호출해야 user gesture 유지
    let directInstallSelection: Awaited<ReturnType<typeof beginCapCutDirectInstallSelection>> = null;
    if (target === 'capcut' && isCapCutDirectInstallSupported()) {
      try {
        directInstallSelection = await beginCapCutDirectInstallSelection();
      } catch (pickerErr) {
        // showDirectoryPicker 예외 → ZIP 폴백 (directInstallSelection = null)
        console.warn('[EditRoom] CapCut 직접 설치 선택 실패, ZIP으로 진행:', pickerErr);
      }
    }
    // [FIX #474] 영상이 없는 장면이 있으면 confirm 대화상자로 사전 확인 (Toast는 놓치기 쉬움)
    const videoSceneCount = scenes.filter(s => s.videoUrl && !s.imageUpdatedAfterVideo).length;
    if (videoSceneCount < scenes.length) {
      const imageOnlyCount = scenes.length - videoSceneCount;
      const msg = videoSceneCount === 0
        ? `⚠️ 현재 ${scenes.length}개 장면이 모두 이미지입니다.\n\n영상 클립이 하나도 없는 상태에서 내보내면,\n${targetLabel}에서 모든 장면이 정지 이미지로 표시됩니다.\n\n그래도 이미지로 내보내시겠어요?\n(영상이 필요하면 '취소' 후 이미지/영상 탭에서 영상을 먼저 생성해주세요)`
        : `⚠️ 미디어 구성 안내\n\n  🎬 영상: ${videoSceneCount}개\n  🖼️ 이미지: ${imageOnlyCount}개\n  📦 전체: ${scenes.length}개 장면\n\n영상이 없는 ${imageOnlyCount}개 장면은 정지 이미지로 내보내집니다.\n\n이대로 내보내시겠어요?\n(모든 장면을 영상으로 하려면 '취소' 후 이미지/영상 탭에서 나머지 영상을 생성해주세요)`;
      if (!window.confirm(msg)) return;
    }
    try {
      showToast(
        target === 'capcut'
          ? directInstallSelection
            ? 'CapCut 프로젝트를 준비 중입니다. 완료되면 선택한 폴더에 바로 설치합니다...'
            : 'CapCut ZIP을 준비하고 있습니다...'
          : `${targetLabel} 프로젝트 파일을 준비하고 있습니다...`,
      );
      const projectTitle = useProjectStore.getState().projectTitle || '프로젝트';
      // [FIX #396] STT 업로드 오디오는 개별 라인 audioUrl이 없을 수 있어 mergedAudioUrl 폴백 필요
      const hasAnyLineAudio = lines.some((l) => l.audioUrl);
      const mergedUrl = !hasAnyLineAudio
        ? (useProjectStore.getState().config?.mergedAudioUrl || useSoundStudioStore.getState().mergedAudioUrl)
        : null;

      const narrationLinesForNle = hasAnyLineAudio
        ? lines
            .map((line, idx) => {
              let effectiveAudioUrl = line.audioUrl;
              if (line.sceneId && (!effectiveAudioUrl || effectiveAudioUrl.startsWith('blob:'))) {
                const scene = useProjectStore.getState().scenes.find((s) => s.id === line.sceneId);
                if (scene?.audioUrl) effectiveAudioUrl = scene.audioUrl;
              }
              if (!effectiveAudioUrl) return null;
              return {
                sceneId: line.sceneId || timeline[idx]?.sceneId || '',
                audioUrl: effectiveAudioUrl,
                duration: line.duration,
                startTime: line.startTime,
                index: line.index ?? idx,
              };
            })
            .filter((value): value is NonNullable<typeof value> => value !== null)
        : mergedUrl
          ? [{ sceneId: timeline[0]?.sceneId || '', audioUrl: mergedUrl, startTime: 0 }]
          : [];

      const result = await buildEditRoomNleZip({
        target,
        timeline,
        // [FIX #652] imageUpdatedAfterVideo이면 videoUrl 제외 → 이미지로 내보내기
        scenes: scenes.map((s) => ({ id: s.id, imageUrl: s.imageUrl, videoUrl: s.imageUpdatedAfterVideo ? undefined : s.videoUrl, scriptText: s.scriptText })),
        narrationLines: narrationLinesForNle,
        title: projectTitle,
        aspectRatio: projectAspectRatio,
      });
      const downloadFileName = `${projectTitle.replace(/[^\w가-힣\-_ ]/g, '').slice(0, 30) || 'project'}_${target}.zip`;
      // [FIX #472] 내보내기 결과에 미디어 구성 표시
      const mediaSummary = result.videoCount > 0 && result.imageCount > 0
        ? ` (영상 ${result.videoCount} + 이미지 ${result.imageCount})`
        : result.videoCount > 0
          ? ` (영상 ${result.videoCount}개)`
          : ` (이미지 ${result.imageCount}개)`;

      if (target === 'capcut' && directInstallSelection) {
        try {
          await installCapCutZipToDirectory({
            zipBlob: result.blob,
            draftsRootHandle: directInstallSelection.draftsRootHandle,
            draftsRootPath: directInstallSelection.draftsRootPath,
          });
          showToast(`CapCut 프로젝트를 바로 설치했습니다!${mediaSummary} CapCut에서 프로젝트 카드를 열어 확인해주세요.`, 6000);
          return;
        } catch (installError) {
          const fallbackUrl = URL.createObjectURL(result.blob);
          const fallbackLink = document.createElement('a');
          fallbackLink.href = fallbackUrl;
          fallbackLink.download = downloadFileName;
          fallbackLink.click();
          setTimeout(() => URL.revokeObjectURL(fallbackUrl), 10000);
          showToast(`CapCut 직접 설치에 실패해 ZIP으로 전환했습니다. ${getCapCutManualInstallHint()} (${installError instanceof Error ? installError.message : '알 수 없는 오류'})`, 8000);
          return;
        }
      }

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast(
        target === 'capcut'
          ? `CapCut ZIP 다운로드 완료!${mediaSummary} ${getCapCutManualInstallHint()}`
          : `${targetLabel} 프로젝트 파일 다운로드 완료!${mediaSummary}`,
        target === 'capcut' ? 7000 : undefined,
      );
    } catch (err) {
      showToast(`${targetLabel} 내보내기 실패: ` + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  }, [timeline, scenes, lines, requireAuth, projectAspectRatio]);

  // MP4 버튼 → 렌더 설정 모달 열기
  const handleExportMp4Click = useCallback(() => {
    if (timeline.length === 0) {
      showToast('내보낼 장면이 없습니다.');
      return;
    }
    setShowRenderModal(true);
  }, [timeline.length]);

  // 내보내기 취소
  const handleCancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setIsExporting(false);
    setExportProgress(null);
    showToast('내보내기가 취소되었습니다.');
  }, [setIsExporting, setExportProgress]);

  /** 렌더 공통: 해상도 계산 */
  const getExportDimensions = useCallback(() => {
    const projectConfig = useProjectStore.getState().config;
    const ar = projectConfig?.aspectRatio || '16:9';
    let w = 1920, h = 1080;
    if (ar === '9:16') { w = 1080; h = 1920; }
    else if (ar === '1:1') { w = 1080; h = 1080; }
    else if (ar === '4:3') { w = 1440; h = 1080; }
    return { width: Math.ceil(w / 2) * 2, height: Math.ceil(h / 2) * 2 };
  }, []);

  /** 렌더 공통: Base64 → Blob URL 최적화된 장면 목록 */
  const buildOptimizedScenes = useCallback(() => {
    const blobUrls: string[] = [];
    const optimized = scenes.map((s) => {
      let imageUrl = s.imageUrl;
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        const blobUrl = base64ToBlobUrl(imageUrl);
        blobUrls.push(blobUrl);
        imageUrl = blobUrl;
      }
      // [FIX #652] 이미지가 영상 이후 재생성됐으면 videoUrl 무시 → 이미지로 취급
      return { id: s.id, imageUrl, videoUrl: s.imageUpdatedAfterVideo ? undefined : s.videoUrl };
    });
    return { optimized, blobUrls };
  }, [scenes]);

  /** 렌더 공통: includeSubtitles에 따른 자막 스타일 결정 */
  const resolveSubtitleStyle = useCallback((includeSubtitles: boolean): SubtitleStyle | null => {
    if (!includeSubtitles) return null;
    return globalSubtitleStyle ?? DEFAULT_SUBTITLE_STYLE;
  }, [globalSubtitleStyle]);

  /** 개별 장면 파일명: 01_첫문장.mp4 형식 */
  const buildSceneFilename = useCallback((index: number, scriptText: string): string => {
    const pad = String(index + 1).padStart(2, '0');
    const firstSentence = scriptText.split(/[.!?\n]/)[0]?.trim() || '';
    const truncated = firstSentence.slice(0, 15).replace(/[\\/:*?"<>|]/g, '');
    return `${pad}_${truncated || '장면'}.mp4`;
  }, []);

  // 렌더 설정 모달에서 확인 → 실제 내보내기 시작 (통합)
  const handleExportMp4 = useCallback(async () => {
    logger.trackAction('MP4 렌더링 시작');
    if (!requireAuth('MP4 내보내기')) return;
    setShowRenderModal(false);

    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    setExportedVideoBlob(null);
    setIsExporting(true);
    setExportProgress({ phase: 'loading-ffmpeg', percent: 0, message: '준비 중...' });

    const { optimized: optimizedScenes, blobUrls } = buildOptimizedScenes();
    const { width: exportWidth, height: exportHeight } = getExportDimensions();

    const currentRenderSettings = useEditRoomStore.getState().renderSettings;
    const effectiveBgm = currentRenderSettings.masterPresetOverride
      ? { ...bgmTrack, masterPreset: currentRenderSettings.masterPresetOverride }
      : bgmTrack;

    // [FIX #396] STT 업로드 오디오는 개별 라인에 audioUrl이 없음 → mergedAudioUrl 폴백
    const hasAnyLineAudio = lines.some((l) => l.audioUrl);
    const mergedUrl = !hasAnyLineAudio
      ? (useProjectStore.getState().config?.mergedAudioUrl || useSoundStudioStore.getState().mergedAudioUrl)
      : null;

    try {
      const blob = await composeMp4({
        timeline,
        scenes: optimizedScenes,
        // [FIX #240] stale blob: URL 폴백 — 씬의 IDB 복원 audioUrl 우선 사용
        // [FIX #396] 개별 라인 오디오 없으면 mergedAudioUrl을 단일 나레이션으로 사용
        narrationLines: hasAnyLineAudio
          ? lines.map((l) => {
              let effectiveAudioUrl = l.audioUrl;
              if (l.sceneId && (!effectiveAudioUrl || effectiveAudioUrl.startsWith('blob:'))) {
                const scene = useProjectStore.getState().scenes.find((s) => s.id === l.sceneId);
                if (scene?.audioUrl) effectiveAudioUrl = scene.audioUrl;
              }
              return { sceneId: l.sceneId, audioUrl: effectiveAudioUrl, startTime: l.startTime };
            })
          : mergedUrl
            ? [{ audioUrl: mergedUrl, startTime: 0 }]
            : [],
        subtitleStyle: resolveSubtitleStyle(currentRenderSettings.includeSubtitles),
        bgmConfig: effectiveBgm,
        loudnessNorm: currentRenderSettings.loudness.enabled ? currentRenderSettings.loudness : undefined,
        sceneTransitions: useEditRoomStore.getState().sceneTransitions,
        width: exportWidth,
        height: exportHeight,
        videoBitrateMbps: currentRenderSettings.videoBitrate,
        onProgress: setExportProgress,
        signal: abortController.signal,
      });

      if (!abortController.signal.aborted) {
        setExportedVideoBlob(blob);
        // [FIX #646] 다운로드 시도 — 실패해도 blob은 보존하여 재다운로드 가능
        try {
          downloadMp4(blob, 'output.mp4');
          showToast('MP4 내보내기 완료! 다운로드가 시작됩니다.');
        } catch (dlErr) {
          showToast('렌더링은 완료됐지만 다운로드에 실패했어요. 아래 "재다운로드" 버튼을 눌러주세요.', 8000);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 사용자 취소
      } else {
        useEditRoomStore.getState().setExportProgress(null);
        showToast('내보내기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
      }
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
      setExportProgress(null);
      blobUrls.forEach((url) => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); });
    }
  }, [timeline, scenes, lines, bgmTrack, setIsExporting, setExportProgress, buildOptimizedScenes, getExportDimensions, resolveSubtitleStyle, requireAuth]);

  // 개별 장면 렌더링
  const handleExportIndividualMp4 = useCallback(async () => {
    if (!requireAuth('개별 MP4 내보내기')) return;
    setShowRenderModal(false);

    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    setExportedVideoBlob(null);
    setIsExporting(true);

    const { optimized: optimizedScenes, blobUrls } = buildOptimizedScenes();
    const { width: exportWidth, height: exportHeight } = getExportDimensions();

    const currentRenderSettings = useEditRoomStore.getState().renderSettings;
    const effectiveBgm = currentRenderSettings.masterPresetOverride
      ? { ...bgmTrack, masterPreset: currentRenderSettings.masterPresetOverride }
      : bgmTrack;
    const subtitleStyle = resolveSubtitleStyle(currentRenderSettings.includeSubtitles);

    // [FIX #396] STT 업로드 오디오 mergedAudioUrl 폴백 (개별 장면용)
    const hasAnyLineAudio = lines.some((l) => l.audioUrl);
    const mergedUrl = !hasAnyLineAudio
      ? (useProjectStore.getState().config?.mergedAudioUrl || useSoundStudioStore.getState().mergedAudioUrl)
      : null;

    const sceneIds = timeline.map((t) => t.sceneId);
    const totalScenes = sceneIds.length;

    try {
      for (let i = 0; i < totalScenes; i++) {
        if (abortController.signal.aborted) break;

        const sid = sceneIds[i];
        const timing = timeline[i];
        const scene = scenes.find((s) => s.id === sid);

        setExportProgress({
          phase: 'composing',
          percent: Math.round((i / totalScenes) * 100),
          message: `장면 ${i + 1}/${totalScenes} 렌더링 중...`,
        });

        // 단일 장면 타이밍 (시간을 0 기준으로 재설정)
        const offset = timing.imageStartTime;
        const singleTimeline = [{
          ...timing,
          imageStartTime: 0,
          imageEndTime: timing.imageEndTime - offset,
          subtitleSegments: timing.subtitleSegments.map((seg) => ({
            ...seg,
            startTime: seg.startTime - offset,
            endTime: seg.endTime - offset,
          })),
          transitionToNext: undefined,
        }];

        // [FIX #396] 개별 장면에서도 mergedAudioUrl 폴백 지원
        const sceneNarrations = hasAnyLineAudio
          ? lines
              .filter((l) => l.sceneId === sid)
              .map((l) => ({
                sceneId: l.sceneId,
                audioUrl: l.audioUrl,
                startTime: (l.startTime ?? 0) - offset,
              }))
          : mergedUrl
            ? [{ audioUrl: mergedUrl, startTime: 0, audioOffset: offset }]
            : [];

        const blob = await composeMp4({
          timeline: singleTimeline,
          scenes: optimizedScenes.filter((s) => s.id === sid),
          narrationLines: sceneNarrations,
          subtitleStyle,
          bgmConfig: effectiveBgm,
          loudnessNorm: currentRenderSettings.loudness.enabled ? currentRenderSettings.loudness : undefined,
          sceneTransitions: {},
          width: exportWidth,
          height: exportHeight,
          videoBitrateMbps: currentRenderSettings.videoBitrate,
          onProgress: (p) => {
            setExportProgress({
              ...p,
              percent: Math.round(((i + (p.percent / 100)) / totalScenes) * 100),
              message: `장면 ${i + 1}/${totalScenes} — ${p.message}`,
            });
          },
          signal: abortController.signal,
        });

        if (!abortController.signal.aborted) {
          const filename = buildSceneFilename(i, scene?.scriptText || '');
          downloadMp4(blob, filename);
        }
      }

      if (!abortController.signal.aborted) {
        showToast(`${totalScenes}개 장면 개별 내보내기 완료!`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 사용자 취소
      } else {
        useEditRoomStore.getState().setExportProgress(null);
        showToast('내보내기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
      }
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
      setExportProgress(null);
      blobUrls.forEach((url) => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); });
    }
  }, [timeline, scenes, lines, bgmTrack, setIsExporting, setExportProgress, buildOptimizedScenes, getExportDimensions, resolveSubtitleStyle, buildSceneFilename, requireAuth]);

  const sceneCount = sceneOrder.length || scenes.length;
  const editRoomSubTab = useEditRoomStore((s) => s.editRoomSubTab);
  const setEditRoomSubTab = useEditRoomStore((s) => s.setEditRoomSubTab);

  const subTabs: { key: EditRoomSubTab; label: string; icon: React.ReactNode }[] = [
    {
      key: 'timeline',
      label: '타임라인',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>,
    },
    {
      key: 'edit-point-matching',
      label: '편집점 매칭',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-6">
        {/* 헤더 */}
        <EditRoomHeader
          sceneCount={sceneCount}
          onExportSrt={handleExportSrt}
          onExportZip={handleExportZip}
          onExportMp4={handleExportMp4Click}
          onExportNle={handleExportNle}
        />

        {/* 채널분석 버전 셀렉터 */}
        <VersionSelectorBar />

        {/* 서브탭 네비게이션 */}
        <div className="flex items-center gap-1 mb-5 border-b border-gray-800">
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setEditRoomSubTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                editRoomSubTab === tab.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 타임라인 서브탭 */}
        {editRoomSubTab === 'timeline' && (
          <>
            {/* [FIX #400] TTS 미생성 안내 배너 */}
            {scenes.length > 0 && !lines.some((l) => l.audioUrl) && (
              <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-600/10 flex items-start gap-3">
                <span className="text-amber-400 text-lg mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm text-amber-300 font-bold">나레이션이 아직 없어요</p>
                  <p className="text-xs text-gray-400 mt-1">
                    현재 모든 장면이 기본 3초로 설정되어 있어서 타이밍이 균일합니다.
                    <strong className="text-amber-400/80"> 사운드 스튜디오</strong>에서 나레이션을 생성하면 대사 길이에 맞춰 자동으로 씽크가 맞춰집니다.
                    또는 타임라인에서 각 클립을 드래그하여 수동으로 길이를 조정할 수도 있습니다.
                  </p>
                </div>
              </div>
            )}

            {/* 총 길이 + 비율 설정 */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {totalDuration > 0 && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>총 길이: <span className="text-amber-400 font-mono">{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span></span>
                  <span>|</span>
                  <span>{sceneCount}개 장면</span>
                </div>
              )}
              {/* 화면 비율 선택 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 mr-1">비율</span>
                {([
                  { value: '16:9', label: '16:9', icon: '▬' },
                  { value: '9:16', label: '9:16', icon: '▮' },
                  { value: '1:1', label: '1:1', icon: '■' },
                  { value: '4:3', label: '4:3', icon: '▭' },
                ] as const).map((ar) => (
                  <button
                    key={ar.value}
                    type="button"
                    onClick={() => {
                      const currentConfig = useProjectStore.getState().config;
                      if (currentConfig) {
                        useProjectStore.getState().setConfig({ ...currentConfig, aspectRatio: ar.value as any });
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${
                      projectAspectRatio === ar.value
                        ? 'bg-amber-600/20 text-amber-400 border-amber-500/40'
                        : 'bg-gray-800/50 text-gray-500 border-gray-700/50 hover:border-gray-500 hover:text-gray-300'
                    }`}
                    title={`화면 비율 ${ar.label}`}
                  >
                    <span className="mr-0.5">{ar.icon}</span>{ar.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 미리보기 + 글로벌 패널 가로 배치 */}
            <div className="flex gap-4 mb-4 items-stretch">
              <div className="flex-1 min-w-0">
                <ScenePreviewPanel
                  scenes={scenes}
                  timeline={timeline}
                  expandedSceneId={expandedSceneId}
                  onSelectScene={setExpandedSceneId}
                  aspectRatio={projectAspectRatio}
                />
              </div>
              <div className="w-80 flex-shrink-0 hidden lg:flex lg:flex-col">
                {selectedLayer ? <LayerInspectorPanel /> : <EditRoomGlobalPanel />}
              </div>
            </div>

            <div className="mb-4">
              <VisualTimeline />
            </div>
          </>
        )}

        {/* 편집점 매칭 서브탭 */}
        {editRoomSubTab === 'edit-point-matching' && (
          <Suspense fallback={
            <div className="flex items-center justify-center h-64 text-gray-500">
              <svg className="w-5 h-5 animate-spin mr-2 border-t-amber-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                <path d="M12 2a10 10 0 019.95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-amber-400" />
              </svg>
              로딩 중...
            </div>
          }>
            <EditPointMatchingPanel />
          </Suspense>
        )}
      </div>

      {/* 하단 고정 내보내기 바 (타임라인 탭에서만 표시) */}
      {editRoomSubTab === 'timeline' && (
        <EditRoomExportBar
          onExportSrt={handleExportSrt}
          onExportZip={handleExportZip}
          onExportMp4={handleExportMp4Click}
          onCancelExport={handleCancelExport}
          onExportNle={handleExportNle}
        />
      )}

      {/* 렌더 설정 모달 */}
      {showRenderModal && (
        <RenderSettingsModal
          onClose={() => setShowRenderModal(false)}
          onConfirm={() => {
            const mode = useEditRoomStore.getState().renderSettings.renderMode;
            if (mode === 'individual') {
              handleExportIndividualMp4();
            } else {
              handleExportMp4();
            }
          }}
        />
      )}
    </div>
  );
};

export default EditRoomTab;
