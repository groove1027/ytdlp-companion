import React, { useState, useMemo } from 'react';
import type { Scene, SceneOverlayConfig, SceneEffectConfig } from '../../../types';
import { useProjectStore } from '../../../stores/projectStore';
import OverlayPreviewLayer from './OverlayPreviewLayer';

// 자막 에디터와 동일한 picsum.photos 고정 ID (검증 완료)
const BG_IDS = [10, 15, 29, 36, 42, 65, 76, 84, 96, 110, 119, 134, 142, 155, 167, 180, 193, 201, 211, 225];

// ═══ 모션 효과 CSS 키프레임 (EffectPresets.tsx와 동일) ═══
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

// 팬&줌 프리셋 → CSS 애니메이션 매핑
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

// 모션 효과 → CSS 애니메이션 매핑
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

interface SceneMediaPreviewProps {
  scene: Scene;
  sceneIndex: number;
  overlays?: SceneOverlayConfig[];
  effect?: SceneEffectConfig;
}

const SceneMediaPreview: React.FC<SceneMediaPreviewProps> = ({ scene, sceneIndex, overlays, effect }) => {
  const [showLarge, setShowLarge] = useState(false);
  const config = useProjectStore((s) => s.config);
  const mediaUrl = scene.videoUrl || scene.imageUrl;
  const isVideo = !!scene.videoUrl;

  const isPortrait = config?.aspectRatio === '9:16';
  const thumbClass = isPortrait ? 'w-14 h-[100px]' : 'w-28 h-20';

  // 이미지 없는 장면은 picsum 배경
  const bgId = BG_IDS[sceneIndex % BG_IDS.length];
  const thumbW = isPortrait ? 112 : 224;
  const thumbH = isPortrait ? 200 : 160;
  const picsumThumb = `https://picsum.photos/id/${bgId}/${thumbW}/${thumbH}`;

  // 모션 미리보기 스타일 계산 (앵커 포인트 기반 transform-origin)
  // negative delay로 애니메이션 중간부터 시작 → 첫 프레임부터 이미 움직이는 느낌
  const motionStyle = useMemo<React.CSSProperties>(() => {
    if (!effect) return {};
    const pz = getPanZoomAnimation(effect.panZoomPreset);
    const mo = getMotionAnimation(effect.motionEffect);
    const hasMotion = effect.motionEffect && effect.motionEffect !== 'none' && effect.motionEffect !== 'static';
    let animStyle: React.CSSProperties;
    if (pz.animation && hasMotion && mo.animation) {
      animStyle = { animation: `${pz.animation}, ${mo.animation}` };
    } else if (hasMotion && mo.animation) {
      animStyle = mo;
    } else {
      animStyle = pz;
    }
    // negative delay 적용: 각 애니메이션의 30%만큼 앞당겨 시작
    if (animStyle.animation) {
      const parts = (animStyle.animation as string).split(',').map(a => {
        const trimmed = a.trim();
        const m = trimmed.match(/([\d.]+)s/);
        const dur = m ? parseFloat(m[1]) : 4;
        const negDelay = -(dur * 0.45);
        return trimmed.replace(/([\d.]+)s/, `$1s ${negDelay.toFixed(2)}s`);
      });
      animStyle = { animation: parts.join(', ') };
    }
    const filters = [pz.filter, mo.filter].filter(Boolean).join(' ');
    const ax = effect.anchorX ?? 50;
    const ay = effect.anchorY ?? 45;
    return {
      ...animStyle,
      ...(filters ? { filter: filters } : {}),
      transformOrigin: `${ax}% ${ay}%`,
    };
  }, [effect]);

  // 실제 CSS animation이 있을 때만 120% overscale 적용
  // filter-only 효과(high-contrast, rain 등)는 이미지 이동 없으므로 overscale 불필요
  const hasMotionAnim = !!motionStyle.animation;

  // 프리셋 변경 시 CSS animation 강제 재시작 (key가 바뀌면 React가 DOM 재생성)
  const motionKey = `${effect?.panZoomPreset || 'none'}-${effect?.motionEffect || 'none'}`;

  return (
    <>
      {hasMotionAnim && <style>{MOTION_KEYFRAMES}</style>}
      <div
        className={`relative ${thumbClass} flex-shrink-0 rounded-lg overflow-hidden border border-gray-700 group cursor-pointer`}
        style={!mediaUrl ? {
          backgroundImage: `url(${picsumThumb})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#1a1a2e',
        } : undefined}
        onClick={() => setShowLarge(true)}
      >
        {mediaUrl ? (
          hasMotionAnim ? (
            <div key={motionKey} style={{ position: 'absolute', top: '-10%', right: '-10%', bottom: '-10%', left: '-10%' }}>
              {isVideo ? (
                <video
                  src={scene.videoUrl}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionStyle }}
                  muted
                  loop
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
              ) : (
                <img
                  src={scene.imageUrl}
                  alt={`Scene ${sceneIndex + 1}`}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionStyle }}
                />
              )}
            </div>
          ) : (
            isVideo ? (
              <video
                key={motionKey}
                src={scene.videoUrl}
                className="absolute inset-0 w-full h-full object-cover"
                style={motionStyle.filter ? { filter: motionStyle.filter as string } : undefined}
                muted
                loop
                onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
              />
            ) : (
              <img
                key={motionKey}
                src={scene.imageUrl}
                alt={`Scene ${sceneIndex + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
                style={motionStyle.filter ? { filter: motionStyle.filter as string } : undefined}
              />
            )
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white/30 text-lg">🎬</span>
          </div>
        )}

        {/* 오버레이 효과 미리보기 */}
        {overlays && overlays.length > 0 && (
          <OverlayPreviewLayer overlays={overlays} />
        )}

        {/* 장면 번호 배지 */}
        <div className="absolute top-1 left-1 bg-black/70 text-white text-sm font-bold px-1.5 py-0.5 rounded z-10">
          #{sceneIndex + 1}
        </div>

        <div className="absolute bottom-1 right-1 bg-black/60 text-xs text-gray-300 px-1 py-0.5 rounded">
          {isVideo ? '🎬' : mediaUrl ? '🖼' : '📷'}
        </div>

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-sm font-bold">크게 보기</span>
        </div>
      </div>

      {/* 라이트박스 */}
      {showLarge && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowLarge(false)}>
          <div className="relative max-w-4xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            {isVideo ? (
              <video src={scene.videoUrl} className="max-w-full max-h-[80vh] rounded-lg" controls autoPlay />
            ) : mediaUrl ? (
              <img src={scene.imageUrl} alt="" className="max-w-full max-h-[80vh] rounded-lg" />
            ) : (
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  backgroundImage: `url(https://picsum.photos/id/${bgId}/${isPortrait ? 360 : 640}/${isPortrait ? 640 : 360})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: '#1a1a2e',
                  width: isPortrait ? '320px' : '640px',
                  height: isPortrait ? '568px' : '360px',
                }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-white/60 text-base font-bold bg-black/40 px-4 py-2 rounded-lg">장면 #{sceneIndex + 1}</p>
                </div>
              </div>
            )}
            {overlays && overlays.length > 0 && (
              <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
                <OverlayPreviewLayer overlays={overlays} />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowLarge(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-gray-800 border border-gray-600 rounded-full text-white text-base flex items-center justify-center hover:bg-gray-700"
            >
              X
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SceneMediaPreview;
