import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useProjectStore } from '../../../stores/projectStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { showToast } from '../../../stores/uiStore';
import OverlayPicker, { OVERLAY_PRESETS } from '../editroom/OverlayPicker';
import OverlayPreviewLayer from '../editroom/OverlayPreviewLayer';
import type { SceneOverlayConfig, SceneEffectConfig } from '../../../types';
import { AspectRatio } from '../../../types';

// ═══ 모션/팬줌 미리보기 CSS 키프레임 ═══
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
@keyframes mp-rotate-plus { 0%{transform:rotate(0deg) scale(1.08)} 100%{transform:rotate(8deg) scale(1.08)} }
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
`;

// ★ EditRoomTab의 previewPanZoomAnim / previewMotionAnim과 동일하게 통일
function getPanZoomStyle(preset: string): React.CSSProperties {
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

function getMotionFxStyle(fx: string): React.CSSProperties {
  switch (fx) {
    case 'fade': return { animation: 'mp-fade 3s ease-in-out infinite' };
    case 'pan': return { animation: 'mp-pan-right 4s linear infinite alternate' };
    case 'micro': return { animation: 'mp-micro 3s ease-in-out infinite' };
    case 'slow': return { animation: 'mp-slow 6s ease-in-out infinite alternate' };
    case 'shake': return { animation: 'mp-shake 0.6s ease-in-out infinite' };
    case 'rotate': return { animation: 'mp-rotate 4s ease-in-out infinite alternate' };
    case 'rotate-plus': return { animation: 'mp-rotate-plus 3s ease-in-out infinite alternate' };
    case 'glitch': return { animation: 'mp-glitch 0.3s steps(5) infinite' };
    case 'film': return { filter: 'sepia(0.35) contrast(1.15) brightness(0.95)', animation: 'mp-micro 6s ease-in-out infinite' };
    case 'sepia': return { filter: 'sepia(0.65)', animation: 'mp-zoom-in 8s ease-in-out infinite alternate' };
    case 'crossfade': return { animation: 'mp-fade 4s ease-in-out infinite' };
    case 'high-contrast': return { filter: 'contrast(1.4) saturate(1.2)' };
    case 'multi-bright': return { filter: 'brightness(1.3) saturate(1.3)' };
    case 'rain': return { filter: 'brightness(0.85) saturate(0.7) contrast(1.1)' };
    case 'vintage-style': return { filter: 'sepia(0.3) contrast(1.1) saturate(0.8)' };
    case 'static': case 'none': default: return {};
  }
}

// negative delay 추가: 애니메이션 30% 지점부터 시작해서 "이미 움직이는 중" 느낌
function addNegDelay(animStr: string): string {
  const m = animStr.match(/([\d.]+)s/);
  const dur = m ? parseFloat(m[1]) : 4;
  const neg = -(dur * 0.3);
  return animStr.replace(/([\d.]+)s/, `$1s ${neg.toFixed(2)}s`);
}

function mergeMotionStyles(pzPreset: string, motionFx: string): React.CSSProperties {
  const pz = getPanZoomStyle(pzPreset);
  const mo = getMotionFxStyle(motionFx);
  const hasMotionAnim = motionFx && motionFx !== 'none' && motionFx !== 'static' && mo.animation;
  // 두 animation을 쉼표로 합성 (panZoom + motionFx 동시 적용)
  let anim: string | undefined;
  if (pz.animation && hasMotionAnim) {
    anim = `${addNegDelay(pz.animation as string)}, ${addNegDelay(mo.animation as string)}`;
  } else if (hasMotionAnim) {
    anim = addNegDelay(mo.animation as string);
  } else if (pz.animation) {
    anim = addNegDelay(pz.animation as string);
  }
  const filters = [pz.filter, mo.filter].filter(Boolean).join(' ');
  return {
    ...(anim ? { animation: anim } : {}),
    ...(filters ? { filter: filters } : {}),
    willChange: 'transform, filter, opacity',
  };
}

const PAN_ZOOM_ROWS = [
  [{ id: 'fast', l: '빠른 생성', i: '⚡' }, { id: 'smooth', l: '부드러움', i: '🌊' }, { id: 'cinematic', l: '시네마틱', i: '🎬' }, { id: 'dynamic', l: '역동적', i: '💥' }, { id: 'dreamy', l: '우아한', i: '✨' }, { id: 'documentary', l: '다큐멘터리', i: '📹' }],
  [{ id: 'dramatic', l: '드라마틱', i: '🎭' }, { id: 'zoom', l: '집중', i: '🔍' }, { id: 'reveal', l: '공개', i: '🎪' }, { id: 'vintage', l: '빈티지', i: '📷' }, { id: 'noir', l: '누아르', i: '🖤' }, { id: 'timelapse', l: '타임랩스', i: '⏳' }],
  [{ id: 'diagonal-drift', l: '대각드리프트', i: '↗' }, { id: 'orbit', l: '궤도', i: '🪐' }, { id: 'parallax', l: '패럴랙스', i: '🏔' }, { id: 'tilt-shift', l: '틸트시프트', i: '🔭' }, { id: 'spiral-in', l: '스파이럴', i: '🌀' }, { id: 'push-pull', l: '푸시풀', i: '🫁' }],
  [{ id: 'dolly-zoom', l: '돌리줌', i: '🎥' }, { id: 'crane-up', l: '크레인업', i: '🏗' }],
];

const EFFECT_CATS = [
  { label: '기본', items: [{ id: 'none', l: '없음' }, { id: 'fade', l: '점진' }, { id: 'static', l: '정적' }, { id: 'crossfade', l: '페이드' }] },
  { label: '모션', items: [{ id: 'pan', l: '팬' }, { id: 'micro', l: '마이크로' }, { id: 'slow', l: '느린' }, { id: 'shake', l: '흔들림' }, { id: 'rotate', l: '회전' }, { id: 'rotate-plus', l: '회전+' }] },
  { label: '스타일', items: [{ id: 'glitch', l: '글릿' }, { id: 'film', l: '필름' }, { id: 'sepia', l: '세피아' }, { id: 'high-contrast', l: '고대비' }, { id: 'multi-bright', l: '다중밝' }, { id: 'rain', l: '비가오는' }, { id: 'vintage-style', l: '빈티지' }] },
];

const RATIO_OPTIONS = [
  { id: AspectRatio.LANDSCAPE, label: '16:9', icon: '🖥' },
  { id: AspectRatio.PORTRAIT, label: '9:16', icon: '📱' },
  { id: AspectRatio.SQUARE, label: '1:1', icon: '⬜' },
];

// 자막 에디터와 동일한 picsum.photos 고정 ID 목록 (검증 완료)
const BG_IDS = [10, 15, 29, 36, 42, 65, 76, 84, 96, 110, 119, 134, 142, 155, 167, 180, 193, 201, 211, 225, 237, 250, 260, 274, 292, 301, 325, 338, 349, 366];

type ApplyMode = 'batch' | 'individual';
type RightTab = 'effects' | 'overlay';

const EffectPresets: React.FC = () => {
  const scenes = useProjectStore((s) => s.scenes);
  const config = useProjectStore((s) => s.config);
  const setConfig = useProjectStore((s) => s.setConfig);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const sceneOverlays = useEditRoomStore((s) => s.sceneOverlays);
  const addSceneOverlay = useEditRoomStore((s) => s.addSceneOverlay);
  const updateSceneOverlay = useEditRoomStore((s) => s.updateSceneOverlay);
  const removeSceneOverlay = useEditRoomStore((s) => s.removeSceneOverlay);

  const orderedScenes = useMemo(() => {
    if (sceneOrder.length > 0) {
      const sceneMap = new Map(scenes.map((s) => [s.id, s]));
      return sceneOrder.map((id) => sceneMap.get(id)).filter(Boolean) as typeof scenes;
    }
    return scenes;
  }, [scenes, sceneOrder]);

  const sceneCount = orderedScenes.length;

  const [selectedPZ, setSelectedPZ] = useState('cinematic');
  const [selectedFx, setSelectedFx] = useState('pan');
  const [applyMode, setApplyMode] = useState<ApplyMode>('batch');
  const [rightTab, setRightTab] = useState<RightTab>('effects');
  const [startScene, setStartScene] = useState(1);
  const [endScene, setEndScene] = useState(sceneCount || 1);
  const [showDetails, setShowDetails] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [bgIdx, setBgIdx] = useState(0);
  const [localRatio, setLocalRatio] = useState<AspectRatio>(config?.aspectRatio || AspectRatio.LANDSCAPE);

  useEffect(() => {
    setEndScene(sceneCount || 1);
    if (startScene > sceneCount) setStartScene(Math.max(1, sceneCount));
    if (previewIdx >= sceneCount) setPreviewIdx(Math.max(0, sceneCount - 1));
  }, [sceneCount]);

  useEffect(() => {
    if (config?.aspectRatio) setLocalRatio(config.aspectRatio);
  }, [config?.aspectRatio]);

  const curScene = useMemo(() => orderedScenes[previewIdx], [orderedScenes, previewIdx]);

  // 이미지 전환 시 저장된 효과 자동 로드
  useEffect(() => {
    if (!curScene) return;
    const saved = sceneEffects[curScene.id];
    if (saved) {
      if (saved.panZoomPreset) setSelectedPZ(saved.panZoomPreset);
      if (saved.motionEffect) setSelectedFx(saved.motionEffect);
    }
  }, [previewIdx, curScene]);

  // 장면 없을 때 샘플용 로컬 오버레이 상태
  const [sampleOverlays, setSampleOverlays] = useState<SceneOverlayConfig[]>([]);

  // 장면 있으면 스토어, 없으면 로컬 샘플
  const curOverlays = useMemo<SceneOverlayConfig[]>(() =>
    curScene ? (sceneOverlays[curScene.id] || []) : sampleOverlays,
    [curScene, sceneOverlays, sampleOverlays]
  );

  const handleRatioChange = useCallback((ratio: AspectRatio) => {
    setLocalRatio(ratio);
    if (config) {
      setConfig((prev) => prev ? { ...prev, aspectRatio: ratio } : prev);
    }
  }, [config, setConfig]);

  const isPortrait = localRatio === AspectRatio.PORTRAIT;
  const isSquare = localRatio === AspectRatio.SQUARE;

  // picsum 이미지 URL 생성 (자막 에디터와 동일 방식)
  const bgId = BG_IDS[(previewIdx + bgIdx) % BG_IDS.length];
  const bgW = isPortrait ? 360 : isSquare ? 500 : 640;
  const bgH = isPortrait ? 640 : isSquare ? 500 : 360;
  const picsumUrl = `https://picsum.photos/id/${bgId}/${bgW}/${bgH}`;

  const handleApply = useCallback((id: string) => {
    setSelectedFx(id);
    if (applyMode === 'batch') {
      orderedScenes.forEach((scene, idx) => {
        if (idx + 1 >= startScene && idx + 1 <= endScene) {
          setSceneEffect(scene.id, { motionEffect: id });
        }
      });
    }
  }, [applyMode, startScene, endScene, orderedScenes, setSceneEffect]);

  const handleAddOverlay = useCallback((overlay: SceneOverlayConfig) => {
    if (curScene) {
      addSceneOverlay(curScene.id, overlay);
    } else {
      setSampleOverlays((prev) => prev.length >= 5 ? prev : [...prev, overlay]);
    }
  }, [curScene, addSceneOverlay]);

  const handleUpdateOverlay = useCallback((index: number, partial: Partial<SceneOverlayConfig>) => {
    if (curScene) {
      updateSceneOverlay(curScene.id, index, partial);
    } else {
      setSampleOverlays((prev) => prev.map((o, i) => i === index ? { ...o, ...partial } : o));
    }
  }, [curScene, updateSceneOverlay]);

  const handleRemoveOverlay = useCallback((index: number) => {
    if (curScene) {
      removeSceneOverlay(curScene.id, index);
    } else {
      setSampleOverlays((prev) => prev.filter((_, i) => i !== index));
    }
  }, [curScene, removeSceneOverlay]);

  const handleBatchApplyOverlays = useCallback(() => {
    if (!curScene) return;
    const sourceOverlays = sceneOverlays[curScene.id] || [];
    if (sourceOverlays.length === 0) return;
    orderedScenes.forEach((scene, idx) => {
      if (scene.id === curScene.id) return;
      if (idx + 1 >= startScene && idx + 1 <= endScene) {
        const existing = sceneOverlays[scene.id] || [];
        existing.forEach((_, i) => removeSceneOverlay(scene.id, existing.length - 1 - i));
        sourceOverlays.forEach((o) => addSceneOverlay(scene.id, { ...o }));
      }
    });
  }, [curScene, sceneOverlays, orderedScenes, startScene, endScene, addSceneOverlay, removeSceneOverlay]);

  const hasMedia = !!(curScene?.imageUrl || curScene?.videoUrl);

  // AI 초점 감지
  const [isDetecting, setIsDetecting] = useState(false);
  const handleAIDetect = useCallback(async () => {
    const imgUrl = curScene?.imageUrl || curScene?.videoUrl;
    if (!imgUrl || !curScene) { showToast('이미지가 없어 AI 초점 감지를 할 수 없습니다'); return; }
    setIsDetecting(true);
    try {
      const { detectImageFocalPoint } = await import('../../../services/smartMotionMatcher');
      const result = await detectImageFocalPoint(imgUrl);
      setSceneEffect(curScene.id, { anchorX: result.anchorX, anchorY: result.anchorY, anchorLabel: result.anchorLabel });
      showToast(`초점 감지 완료: ${result.anchorLabel} (${result.anchorX}%, ${result.anchorY}%)`);
    } catch (e) {
      showToast('AI 초점 감지 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsDetecting(false);
    }
  }, [curScene, setSceneEffect]);

  // 전체 장면 일괄 AI 감지
  const handleBatchAIDetect = useCallback(async () => {
    const targets = orderedScenes.filter((s, idx) =>
      idx + 1 >= startScene && idx + 1 <= endScene && (s.imageUrl || s.videoUrl)
    );
    if (targets.length === 0) { showToast('감지할 이미지가 있는 장면이 없습니다'); return; }
    setIsDetecting(true);
    try {
      const { detectImageFocalPoint } = await import('../../../services/smartMotionMatcher');
      let done = 0;
      for (const scene of targets) {
        const url = scene.imageUrl || scene.videoUrl;
        if (!url) continue;
        try {
          const result = await detectImageFocalPoint(url);
          setSceneEffect(scene.id, { anchorX: result.anchorX, anchorY: result.anchorY, anchorLabel: result.anchorLabel });
          done++;
        } catch { /* skip failed */ }
      }
      showToast(`${done}/${targets.length}개 장면 초점 감지 완료`);
    } catch (e) {
      showToast('일괄 감지 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsDetecting(false);
    }
  }, [orderedScenes, startScene, endScene, setSceneEffect]);

  // 현재 장면의 앵커 포인트 (스토어에서 가져오거나 기본값)
  const sceneEffects = useEditRoomStore((s) => s.sceneEffects);
  const curEffect = useMemo<SceneEffectConfig | null>(() =>
    curScene ? sceneEffects[curScene.id] || null : null,
    [curScene, sceneEffects]
  );
  const anchorX = curEffect?.anchorX ?? 50;
  const anchorY = curEffect?.anchorY ?? 45;
  const anchorLabel = curEffect?.anchorLabel || '프레임 중심';

  // 모션 미리보기 스타일 (앵커 포인트 기반 transform-origin)
  const motionPreviewStyle = useMemo<React.CSSProperties>(() => {
    const base = mergeMotionStyles(selectedPZ, selectedFx);
    return {
      ...base,
      transformOrigin: `${anchorX}% ${anchorY}%`,
    };
  }, [selectedPZ, selectedFx, anchorX, anchorY]);

  // 미리보기 비율: 인라인 style로 확실하게 지정
  const previewWrapClass = isPortrait
    ? 'w-full max-w-[280px] mx-auto'
    : isSquare
      ? 'w-full max-w-[400px] mx-auto'
      : 'w-full';
  const previewAspectStyle: React.CSSProperties = {
    aspectRatio: isPortrait ? '9 / 16' : isSquare ? '1 / 1' : '16 / 9',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* ═══ 좌측: 미리보기 ═══ */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          {/* 상단 바 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 bg-gray-900/50 flex-wrap">
            {sceneCount > 0 && (
              <span className="text-sm text-gray-500">장면 #{previewIdx + 1}</span>
            )}

            {/* 비율 선택 */}
            <div className="flex gap-1 ml-1">
              {RATIO_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleRatioChange(r.id)}
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                    localRatio === r.id
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                      : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {r.icon} {r.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {curOverlays.length > 0 && (
              <span className="text-[11px] text-emerald-400 bg-emerald-900/20 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                🎨 {curOverlays.length}개
              </span>
            )}

            {/* 배경 변경 버튼 (자막 에디터와 동일) */}
            <button
              type="button"
              onClick={() => setBgIdx((i) => (i + 1) % BG_IDS.length)}
              className="w-7 h-7 rounded-full bg-gray-900/80 border border-gray-600/50 text-gray-400 hover:text-white text-xs flex items-center justify-center transition-colors"
              title="배경 이미지 변경"
            >
              &#8635;
            </button>
          </div>

          {/* 미리보기 영역 */}
          <style>{MOTION_KEYFRAMES}</style>
          <div className="bg-black p-3 flex justify-center">
            <div
              className={`relative ${previewWrapClass} rounded-xl border border-gray-700 overflow-hidden bg-black`}
              style={previewAspectStyle}
            >
              {/* ★ 메인 미리보기(EditRoomTab)와 동일한 렌더링 구조:
                  - animation 있으면: 120% overscale 래퍼로 pan 여백 방지
                  - filter-only: 100% 컨테이너 채움 */}
              {motionPreviewStyle.animation ? (
                <div style={{ position: 'absolute', top: '-10%', right: '-10%', bottom: '-10%', left: '-10%', zIndex: 1 }}>
                  {hasMedia ? (
                    curScene?.videoUrl ? (
                      <video
                        src={curScene.videoUrl}
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionPreviewStyle }}
                        muted autoPlay loop
                      />
                    ) : (
                      <img
                        src={curScene?.imageUrl}
                        alt={`Scene ${previewIdx + 1}`}
                        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' as const, ...motionPreviewStyle }}
                      />
                    )
                  ) : (
                    <div
                      style={{
                        width: '100%', height: '100%',
                        backgroundImage: `url(${picsumUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        ...motionPreviewStyle,
                      }}
                    />
                  )}
                </div>
              ) : (
                hasMedia ? (
                  curScene?.videoUrl ? (
                    <video
                      src={curScene.videoUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ zIndex: 1, ...(motionPreviewStyle.filter ? { filter: motionPreviewStyle.filter as string } : {}), transformOrigin: motionPreviewStyle.transformOrigin }}
                      muted autoPlay loop
                    />
                  ) : (
                    <img
                      src={curScene?.imageUrl}
                      alt={`Scene ${previewIdx + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ zIndex: 1, ...(motionPreviewStyle.filter ? { filter: motionPreviewStyle.filter as string } : {}), transformOrigin: motionPreviewStyle.transformOrigin }}
                    />
                  )
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      zIndex: 1,
                      backgroundImage: `url(${picsumUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      ...(motionPreviewStyle.filter ? { filter: motionPreviewStyle.filter as string } : {}),
                    }}
                  />
                )
              )}

              {/* 이미지 없으면 중앙 텍스트 */}
              {!hasMedia && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-[1]">
                  <p className="text-white/60 text-xs font-bold bg-black/40 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                    오버레이 미리보기
                  </p>
                </div>
              )}

              {/* 앵커 포인트 십자선 */}
              <div className="absolute inset-0 pointer-events-none z-[2]" style={{ opacity: 0.8 }}>
                {/* 수평선 */}
                <div className="absolute" style={{ left: `${Math.max(5, anchorX - 4)}%`, top: `${anchorY}%`, width: '8%', height: '1px', background: 'rgba(255,180,0,0.7)', transform: 'translateY(-50%)' }} />
                {/* 수직선 */}
                <div className="absolute" style={{ left: `${anchorX}%`, top: `${Math.max(5, anchorY - 4)}%`, width: '1px', height: '8%', background: 'rgba(255,180,0,0.7)', transform: 'translateX(-50%)' }} />
                {/* 중심 원 */}
                <div className="absolute w-3 h-3 border-2 border-amber-400 rounded-full" style={{ left: `${anchorX}%`, top: `${anchorY}%`, transform: 'translate(-50%, -50%)', boxShadow: '0 0 4px rgba(0,0,0,0.8)' }} />
                {/* 라벨 */}
                <div className="absolute" style={{ left: `${anchorX}%`, top: `${anchorY + 4}%`, transform: 'translateX(-50%)' }}>
                  <span className="text-[10px] text-amber-300 bg-black/70 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">{anchorLabel}</span>
                </div>
              </div>

              {/* 오버레이 레이어 */}
              {curOverlays.length > 0 && (
                <OverlayPreviewLayer overlays={curOverlays} />
              )}

            </div>
          </div>

          {/* 필름스트립 — 장면 썸네일 */}
          {sceneCount > 1 && (
            <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-800/60 overflow-x-auto">
              {orderedScenes.map((scene, idx) => {
                const isActive = idx === previewIdx;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => setPreviewIdx(idx)}
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
                    {scene.videoUrl && (
                      <div className="absolute top-0 left-0 w-2.5 h-2.5 bg-green-500/80 rounded-br flex items-center justify-center">
                        <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
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
        </div>
      </div>

      {/* ═══ 우측: 효과 + 오버레이 탭 ═══ */}
      <div className="space-y-3">
        {/* 탭 전환 */}
        <div className="flex border-b border-gray-700">
          <button type="button" onClick={() => setRightTab('effects')} className={`flex-1 px-3 py-2.5 text-sm font-bold border-b-2 transition-all ${rightTab === 'effects' ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            🎬 팬&줌 / 모션
          </button>
          <button type="button" onClick={() => setRightTab('overlay')} className={`flex-1 px-3 py-2.5 text-sm font-bold border-b-2 transition-all ${rightTab === 'overlay' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            🎨 오버레이 ({OVERLAY_PRESETS.length}종)
          </button>
        </div>

        {/* 효과 탭 */}
        {rightTab === 'effects' && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">효과 설정</h3>
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2">
              <p className="text-sm text-yellow-500/80">미리보기는 효과 프리셋이며, 실제 렌더링과 다를 수 있습니다</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[{ l: '첫 장면', v: startScene, set: setStartScene }, { l: '끝 장면', v: endScene, set: setEndScene }].map((f) => (
                <div key={f.l}><label className="text-sm text-gray-500">{f.l}</label><div className="flex items-center gap-1 mt-0.5"><input type="text" inputMode="numeric" defaultValue={f.v} key={`${f.l}-${f.v}`} onBlur={(e) => { const n = Number(e.target.value); if (!isNaN(n) && e.target.value.trim()) f.set(Math.max(1, Math.min(sceneCount || 1, Math.round(n)))); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300" /><span className="text-green-400 text-xs">&#10003;</span></div></div>
              ))}
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1.5">적용 방식</p>
              <div className="grid grid-cols-2 gap-2">
                {(['batch', 'individual'] as ApplyMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setApplyMode(m)} className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${applyMode === m ? 'bg-amber-600/20 text-amber-300 border-amber-500/50' : 'bg-gray-900/50 text-gray-500 border-gray-700 hover:border-gray-500'}`}>{m === 'batch' ? '일괄 적용' : '개별 설정'}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1.5">팬&줌 프리셋</p>
              {PAN_ZOOM_ROWS.map((row, ri) => (
                <div key={ri} className="grid grid-cols-6 gap-1 mb-1.5">
                  {row.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setSelectedPZ(p.id); if (applyMode === 'batch') { orderedScenes.forEach((scene, idx) => { if (idx + 1 >= startScene && idx + 1 <= endScene) setSceneEffect(scene.id, { panZoomPreset: p.id }); }); } }} className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-center transition-all border ${selectedPZ === p.id ? 'bg-amber-600/20 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300'}`}>
                      <span className="text-sm">{p.i}</span><span className="text-[10px] font-bold leading-tight">{p.l}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1.5">효과 선택</p>
              {EFFECT_CATS.map((cat) => (
                <div key={cat.label} className="mb-2">
                  <p className="text-xs text-gray-600 mb-1 font-bold uppercase tracking-wider">{cat.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.items.map((it) => (
                      <button key={it.id} type="button" onClick={() => handleApply(it.id)} className={`px-2 py-1 rounded text-xs font-bold border transition-all ${selectedFx === it.id ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-gray-900/50 text-gray-500 border-gray-700/50 hover:text-gray-300'}`}>{it.l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* AI 초점 자동 감지 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAIDetect}
                disabled={isDetecting || !hasMedia}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                  isDetecting || !hasMedia
                    ? 'bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed'
                    : 'bg-amber-600/15 text-amber-400 border-amber-500/40 hover:bg-amber-600/25 hover:border-amber-500/60'
                }`}
                title="현재 장면의 이미지를 AI가 분석하여 주 피사체 위치에 앵커 포인트를 자동 설정합니다"
              >
                {isDetecting ? '감지 중...' : 'AI 초점 감지 (현재)'}
              </button>
              {sceneCount > 1 && (
                <button
                  type="button"
                  onClick={handleBatchAIDetect}
                  disabled={isDetecting}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                    isDetecting
                      ? 'bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed'
                      : 'bg-cyan-600/15 text-cyan-400 border-cyan-500/40 hover:bg-cyan-600/25 hover:border-cyan-500/60'
                  }`}
                  title={`장면 ${startScene}~${endScene}의 이미지를 AI가 일괄 분석합니다`}
                >
                  {isDetecting ? '감지 중...' : `일괄 감지 (${startScene}-${endScene})`}
                </button>
              )}
            </div>

            <button type="button" onClick={() => setShowDetails(!showDetails)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200">
              <span className="font-bold">세부 설정</span><span className={`transition-transform ${showDetails ? 'rotate-90' : ''}`}>&#9654;</span>
            </button>
            {showDetails && (
              <div className="space-y-3 pl-1">
                {[{ l: '줌 시작 (%)', min: 80, max: 150, def: 100 }, { l: '줌 끝 (%)', min: 80, max: 150, def: 110 }, { l: '팬 X', min: -50, max: 50, def: 0 }, { l: '팬 Y', min: -50, max: 50, def: 0 }, { l: '페이드 인 (초)', min: 0, max: 2, def: 0.3 }, { l: '페이드 아웃 (초)', min: 0, max: 2, def: 0.3 }].map((s) => (
                  <div key={s.l}><label className="text-sm text-gray-500">{s.l}</label><input type="range" min={s.min} max={s.max} step={s.min < 1 ? 0.1 : 1} defaultValue={s.def} className="w-full accent-amber-500 mt-0.5" /></div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 오버레이 탭 */}
        {rightTab === 'overlay' && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">오버레이 효과</h3>
              {sceneCount > 0 && <span className="text-sm text-gray-500">장면 #{previewIdx + 1}</span>}
            </div>

            {sceneCount === 0 && (
              <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2 mb-2">
                <p className="text-sm text-blue-400/80">샘플 모드 — 배경 이미지에서 오버레이 효과를 미리 확인하세요</p>
              </div>
            )}

            <OverlayPicker
              overlays={curOverlays}
              onAdd={handleAddOverlay}
              onUpdate={handleUpdateOverlay}
              onRemove={handleRemoveOverlay}
            />

            {curOverlays.length > 0 && sceneCount > 0 && (
              <button
                type="button"
                onClick={handleBatchApplyOverlays}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-bold border border-emerald-400/50 shadow-md transition-colors"
              >
                🎨 현재 오버레이를 장면 {startScene}~{endScene}에 일괄 적용
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EffectPresets;
