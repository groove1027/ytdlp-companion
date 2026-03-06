import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../../stores/projectStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useUnifiedTimeline, useTotalDuration } from '../../../hooks/useUnifiedTimeline';
import SceneTransitionPicker, { getTransitionLabel, TRANSITION_GROUPS } from './SceneTransitionPicker';
import AudioMixerModal from './AudioMixerModal';
import { connectAudioToAnalyser } from '../../../services/audioAnalyserService';
import type { SceneTransitionConfig, SceneTransitionPreset } from '../../../types';

const BASE_IMAGE_TRACK_HEIGHT = 48;
const BASE_TRACK_HEIGHT = 28;
const BASE_TRANSITION_TRACK_HEIGHT = 22;
const RULER_HEIGHT = 22;
const LABEL_WIDTH = 96;
const MIN_PX_PER_SEC = 5;
const MAX_PX_PER_SEC = 200;
const SNAP_THRESHOLD_PX = 6;
const MIN_CLIP_DURATION = 0.3;
const EDGE_HANDLE_PX = 5;

// 블레이드 도구 커서 (가위 모양 SVG, 핫스팟 중앙 상단)
const BLADE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 2v20' stroke='%23fbbf24' stroke-width='2' stroke-dasharray='3 2'/%3E%3Cpath d='M7 2l5 7 5-7' stroke='%23f59e0b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M12 9l-3 4h6l-3-4z' fill='%23f59e0b'/%3E%3C/svg%3E") 12 2, crosshair`;

const SCENE_COLORS = [
  'bg-blue-600/40', 'bg-violet-600/40', 'bg-cyan-600/40', 'bg-emerald-600/40',
  'bg-amber-600/40', 'bg-pink-600/40', 'bg-indigo-600/40', 'bg-teal-600/40',
];
const SCENE_BORDER_COLORS = [
  'border-blue-500/60', 'border-violet-500/60', 'border-cyan-500/60', 'border-emerald-500/60',
  'border-amber-500/60', 'border-pink-500/60', 'border-indigo-500/60', 'border-teal-500/60',
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 호버 프리뷰 팝업 */
const HoverPreview: React.FC<{ imageUrl?: string; videoUrl?: string; label: string; x: number; y: number }> = ({ imageUrl, videoUrl, label, x, y }) => {
  const src = videoUrl ? (imageUrl || '') : (imageUrl || '');
  if (!src) return null;
  return (
    <div
      className="fixed z-[99999] pointer-events-none"
      style={{ left: Math.max(0, x), top: Math.max(0, y - 160) }}
    >
      <div className="bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-hidden" style={{ width: 180 }}>
        <img src={src} alt={label} className="w-full h-[100px] object-cover" />
        <div className="px-2 py-1 text-[10px] text-gray-300 font-bold text-center bg-gray-800">{label}</div>
      </div>
    </div>
  );
};

/** 볼륨 팝오버 */
const VolumePopover: React.FC<{
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ anchorRef, onClose, children }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 bottom-full mb-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 min-w-[160px]"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

/** 전문 오디오 웨이브폼 (canvas 기반, 미러 + 그라데이션) */
const MiniWaveformTrack: React.FC<{ audioUrl: string; width: number; height: number; color: string }> = ({ audioUrl, width, height, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioUrl || !canvasRef.current || width < 4) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const audioCtx = new AudioContext();
    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => {
        const data = decoded.getChannelData(0);
        const barW = 1.2;
        const gap = 0.4;
        const slotW = barW + gap;
        const bars = Math.min(Math.floor(width / slotW), data.length);
        const step = Math.floor(data.length / bars);
        const centerY = height / 2;

        // 그라데이션 (위→중앙: 밝은색, 중앙→아래: 어두운색)
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, color);
        grad.addColorStop(0.45, color);
        grad.addColorStop(0.55, color);
        grad.addColorStop(1, color);

        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < bars; i++) {
          // RMS 기반 (더 부드러운 파형)
          let sumSq = 0;
          let peak = 0;
          for (let j = 0; j < step; j++) {
            const val = Math.abs(data[i * step + j] || 0);
            sumSq += val * val;
            if (val > peak) peak = val;
          }
          const rms = Math.sqrt(sumSq / step);
          const amplitude = rms * 0.6 + peak * 0.4; // RMS + peak 혼합
          const barH = Math.max(0.5, amplitude * (height * 0.85));

          // 상단 바 (밝음)
          ctx.fillStyle = grad;
          ctx.globalAlpha = 0.5 + amplitude * 0.5;
          ctx.fillRect(i * slotW, centerY - barH / 2, barW, barH);

          // 중앙선 하이라이트
          if (barH > 2) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(i * slotW, centerY - 0.25, barW, 0.5);
          }
        }
        ctx.globalAlpha = 1;
      })
      .catch(() => {})
      .finally(() => { audioCtx.close(); });
  }, [audioUrl, width, height, color]);

  return <canvas ref={canvasRef} style={{ width, height }} className="absolute inset-0" />;
};

/** 합성 웨이브폼 (오디오 파일 없을 때 시드 기반 절차적 생성) */
const SyntheticWaveform: React.FC<{ seed: string; width: number; height: number; color: string }> = ({ seed, width, height, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || width < 4) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 시드 기반 해시 → 일관된 패턴
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    const rng = () => { hash = (hash * 1664525 + 1013904223) | 0; return (hash >>> 0) / 4294967296; };

    const barW = 1.2;
    const gap = 0.4;
    const slotW = barW + gap;
    const bars = Math.floor(width / slotW);
    const centerY = height / 2;

    // 부드러운 엔벨로프 (공격 → 감쇠 패턴)
    const envelope: number[] = [];
    let env = 0.3;
    for (let i = 0; i < bars; i++) {
      const phase = i / bars;
      // 자연스러운 음향 엔벨로프: 부드러운 시작, 중간 피크, 점진적 감쇠
      const base = Math.sin(phase * Math.PI) * 0.7 + 0.2;
      env += (rng() * 0.4 - 0.15);
      env = Math.max(0.1, Math.min(0.9, env));
      envelope.push(base * env);
    }

    // 3포인트 이동평균 스무딩
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < envelope.length - 1; i++) {
        envelope[i] = (envelope[i - 1] + envelope[i] + envelope[i + 1]) / 3;
      }
    }

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, color);

    for (let i = 0; i < bars; i++) {
      const amplitude = envelope[i];
      const barH = Math.max(0.5, amplitude * (height * 0.8));
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35 + amplitude * 0.4;
      ctx.fillRect(i * slotW, centerY - barH / 2, barW, barH);
    }
    ctx.globalAlpha = 1;
  }, [seed, width, height, color]);

  return <canvas ref={canvasRef} style={{ width, height }} className="absolute inset-0" />;
};

const VisualTimeline: React.FC = () => {
  const scenes = useProjectStore((s) => s.scenes);
  const lines = useSoundStudioStore((s) => s.lines);
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const sceneAudioSettings = useEditRoomStore((s) => s.sceneAudioSettings);
  const setSceneAudioSettings = useEditRoomStore((s) => s.setSceneAudioSettings);
  const sceneTransitions = useEditRoomStore((s) => s.sceneTransitions);
  const setSceneTransition = useEditRoomStore((s) => s.setSceneTransition);
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const setExpandedSceneId = useEditRoomStore((s) => s.setExpandedSceneId);
  const trackMixer = useEditRoomStore((s) => s.trackMixer);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);
  const sfxVolume = useEditRoomStore((s) => s.sfxVolume);
  const updateSceneTiming = useEditRoomStore((s) => s.updateSceneTiming);
  const updateSubtitleTiming = useEditRoomStore((s) => s.updateSubtitleTiming);
  const splitSceneAtTime = useEditRoomStore((s) => s.splitSceneAtTime);
  const pushUndo = useEditRoomStore((s) => s.pushUndo);
  const undo = useEditRoomStore((s) => s.undo);
  const redo = useEditRoomStore((s) => s.redo);
  const undoStackLen = useEditRoomStore((s) => s._undoStack.length);
  const redoStackLen = useEditRoomStore((s) => s._redoStack.length);
  const timeline = useUnifiedTimeline();
  const totalDuration = useTotalDuration();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxPerSec, setPxPerSec] = useState(60);
  const pxPerSecRef = useRef(pxPerSec);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);
  const [hoverInfo, setHoverInfo] = useState<{ imageUrl?: string; videoUrl?: string; label: string; x: number; y: number } | null>(null);
  const [showMixerModal, setShowMixerModal] = useState(false);

  // 개별 오디오 트랙 확장 (더블클릭 → 토글, Shift+Wheel → 미세 조절)
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());
  const [trackScales, setTrackScales] = useState<Record<string, number>>({});
  const trackScalesRef = useRef(trackScales);
  trackScalesRef.current = trackScales;
  const toggleTrackExpand = useCallback((trackKey: string) => {
    setExpandedTracks(prev => {
      const next = new Set(prev);
      if (next.has(trackKey)) next.delete(trackKey); else next.add(trackKey);
      return next;
    });
  }, []);

  // Shift+Wheel → 개별 트랙 높이 조절
  // scrollRef(부모 스크롤 컨테이너)에 단일 non-passive wheel 리스너 → data-track-key로 트랙 판별
  // Alt(Option)+Wheel → 개별 트랙 높이 조절
  // Shift+Wheel은 macOS에서 가로 스크롤로 변환되어 deltaY=0이 되므로 Alt 사용
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      const target = e.target as HTMLElement;
      const trackRow = target.closest<HTMLElement>('[data-track-key]');
      if (!trackRow) return;
      const key = trackRow.dataset.trackKey;
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = trackScalesRef.current[key] ?? 1.0;
      // deltaY < 0 = 휠 위(확대), deltaY > 0 = 휠 아래(축소)
      const rawDelta = e.deltaY;
      if (rawDelta === 0) return;
      const delta = rawDelta < 0 ? 0.3 : -0.3;
      const next = Math.max(0.75, Math.min(6.0, cur + delta));
      if (next !== cur) {
        setTrackScales(p => ({ ...p, [key]: next }));
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 높이 스케일 (드래그로 조절)
  const [heightScale, setHeightScale] = useState(1.0);
  const dragRef = useRef<{ startY: number; startScale: number } | null>(null);

  // 전환 효과 팝오버
  const [activeTransitionId, setActiveTransitionId] = useState<string | null>(null);
  const transitionAnchorRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // 전환 일괄 적용 팝오버
  const [bulkTransOpen, setBulkTransOpen] = useState(false);
  const bulkTransRef = useRef<HTMLDivElement>(null);

  // 볼륨 팝오버
  const [narVolPopoverOpen, setNarVolPopoverOpen] = useState(false);
  const [bgmVolPopoverOpen, setBgmVolPopoverOpen] = useState(false);
  const narLabelRef = useRef<HTMLDivElement>(null);
  const bgmLabelRef = useRef<HTMLDivElement>(null);

  // 재생 상태 — DOM 직접 조작으로 부드러운 플레이헤드 모션
  const [isPlaying, setIsPlaying] = useState(false);
  const playheadTimeRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const playheadElRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timeDisplayRef = useRef<HTMLSpanElement | null>(null);
  const effectivePxRef = useRef(60);
  const rulerTrackRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef(timeline);
  const currentPlaybackSceneRef = useRef<string | null>(null);
  const prevSubTextRef = useRef<string>('');

  // 줌: 즉시 반응 (디바운스 제거)

  // 높이 스케일 적용
  const IMAGE_TRACK_HEIGHT = Math.round(BASE_IMAGE_TRACK_HEIGHT * heightScale);
  const TRACK_HEIGHT = Math.round(BASE_TRACK_HEIGHT * heightScale);
  const EXPANDED_TRACK_HEIGHT = Math.round(BASE_TRACK_HEIGHT * heightScale * 3);
  const TRANSITION_TRACK_HEIGHT = Math.round(BASE_TRANSITION_TRACK_HEIGHT * heightScale);
  const getAudioTrackHeight = useCallback((key: string) => {
    const base = expandedTracks.has(key) ? EXPANDED_TRACK_HEIGHT : TRACK_HEIGHT;
    const scale = trackScales[key] ?? 1.0;
    return Math.round(base * scale);
  }, [expandedTracks, EXPANDED_TRACK_HEIGHT, TRACK_HEIGHT, trackScales]);

  const handleZoomChange = useCallback((val: number) => {
    setPxPerSec(val);
  }, []);

  const effectivePx = pxPerSec;
  effectivePxRef.current = effectivePx;
  timelineRef.current = timeline;
  const totalWidth = useMemo(() => Math.max(400, totalDuration * effectivePx), [totalDuration, effectivePx]);

  // DOM 직접 업데이트 — React 리렌더 없이 부드러운 60fps 모션 + 미리보기 씬 동기화
  const movePlayhead = useCallback((time: number) => {
    playheadTimeRef.current = time;
    const x = time * effectivePxRef.current;
    playheadElRefs.current.forEach(el => {
      if (el) el.style.transform = `translateX(${x}px)`;
    });
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(time) + ' / ';
    }
    // 현재 시간에 해당하는 씬 찾아서 미리보기 동기화 (씬 변경 시에만 업데이트)
    const tl = timelineRef.current;
    if (tl.length > 0) {
      let sceneId = tl[tl.length - 1].sceneId;
      let currentEntry = tl[tl.length - 1];
      for (let i = 0; i < tl.length; i++) {
        if (time < tl[i].imageStartTime + tl[i].imageDuration) {
          sceneId = tl[i].sceneId;
          currentEntry = tl[i];
          break;
        }
      }
      if (sceneId !== currentPlaybackSceneRef.current) {
        const prevSceneId = currentPlaybackSceneRef.current;
        currentPlaybackSceneRef.current = sceneId;
        // 전환 콜백이 있으면 사용 (ScenePreviewPanel의 navigateWithTransition → 포지션 점프 없음)
        const store = useEditRoomStore.getState();
        const navFn = store._navigateToSceneFn;
        const hasTrans = prevSceneId && store.sceneTransitions[prevSceneId]
          && store.sceneTransitions[prevSceneId].preset !== 'none';
        if (navFn && hasTrans) {
          navFn(sceneId);
        } else {
          store.setExpandedSceneId(sceneId);
        }
      }
      // 자막 세그먼트 동기화 — 현재 시간에 해당하는 세그먼트 텍스트를 store에 업데이트
      const seg = currentEntry.subtitleSegments.find(s => time >= s.startTime && time < s.endTime);
      const newText = seg?.text || '';
      if (newText !== prevSubTextRef.current) {
        prevSubTextRef.current = newText;
        useEditRoomStore.getState().setActiveSubtitleText(newText);
      }
    }
  }, []);

  // 줌 (키패드 +/- 또는 =/- 키) — Premiere Pro 스타일
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스 중이면 무시
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const isPlus = e.key === '+' || e.key === '=' || e.key === 'NumpadAdd';
      const isMinus = e.key === '-' || e.key === '_' || e.key === 'NumpadSubtract';
      if (!isPlus && !isMinus) return;
      e.preventDefault();
      const cur = pxPerSecRef.current;
      const step = cur <= 30 ? 5 : 10;
      const next = isPlus
        ? Math.min(MAX_PX_PER_SEC, cur + step)
        : Math.max(MIN_PX_PER_SEC, cur - step);
      handleZoomChange(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleZoomChange]);

  // 시간 눈금 생성 — effectivePx <= 15 구간에서 10초 간격 추가
  const rulerMarks = useMemo(() => {
    const interval = effectivePx > 80 ? 1 : effectivePx > 40 ? 2 : effectivePx > 15 ? 5 : 10;
    const marks: { time: number; x: number }[] = [];
    for (let t = 0; t <= totalDuration + interval; t += interval) {
      marks.push({ time: t, x: t * effectivePx });
    }
    return marks;
  }, [totalDuration, effectivePx]);

  // sceneId → 원본 장면 번호 매핑 (분할 클립도 동일 번호 유지)
  const sceneNumberMap = useMemo(() => {
    const m = new Map<string, number>();
    scenes.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [scenes]);

  // 장면 블록 (이미지 URL 포함)
  const sceneBlocks = useMemo(() =>
    timeline.map((t) => {
      const scene = scenes.find(s => s.id === t.sceneId);
      const sceneNum = sceneNumberMap.get(t.sceneId) ?? 0;
      const colorIdx = sceneNum > 0 ? (sceneNum - 1) % SCENE_COLORS.length : 0;
      return {
        id: t.sceneId,
        x: t.imageStartTime * effectivePx,
        w: Math.max(4, t.imageDuration * effectivePx),
        label: `${sceneNum}`,
        color: SCENE_COLORS[colorIdx],
        borderColor: SCENE_BORDER_COLORS[colorIdx],
        isActive: t.sceneId === expandedSceneId,
        imageUrl: scene?.imageUrl,
        videoUrl: scene?.videoUrl,
      };
    }),
    [timeline, effectivePx, expandedSceneId, scenes, sceneNumberMap]
  );

  // 전환 마커 (장면 경계 위치)
  const transitionMarkers = useMemo(() =>
    timeline.slice(0, -1).map((t, i) => {
      const nextT = timeline[i + 1];
      const boundaryX = nextT.imageStartTime * effectivePx;
      const config = sceneTransitions[t.sceneId] || { preset: 'none' as const, duration: 0.5 };
      return {
        sceneId: t.sceneId,
        x: boundaryX,
        fromLabel: `${sceneNumberMap.get(t.sceneId) ?? (i + 1)}`,
        toLabel: `${sceneNumberMap.get(nextT.sceneId) ?? (i + 2)}`,
        config,
      };
    }),
    [timeline, effectivePx, sceneTransitions, sceneNumberMap]
  );

  // 원본 영상 오디오 블록 (videoUrl이 있는 장면만)
  const videoAudioBlocks = useMemo(() =>
    timeline.map((t) => {
      const scene = scenes.find(s => s.id === t.sceneId);
      if (!scene?.videoUrl) return null;
      return {
        id: `va-${t.sceneId}`,
        x: t.imageStartTime * effectivePx,
        w: Math.max(4, t.imageDuration * effectivePx),
        label: `${sceneNumberMap.get(t.sceneId) ?? 0}`,
        videoUrl: scene.videoUrl,
      };
    }).filter((b): b is NonNullable<typeof b> => b !== null),
    [timeline, scenes, effectivePx, sceneNumberMap]
  );

  // 나레이션 블록
  const lineByScene = useMemo(() => {
    const m = new Map<string, typeof lines[0]>();
    lines.forEach((l) => { if (l.sceneId) m.set(l.sceneId, l); });
    return m;
  }, [lines]);
  const narrationBlocks = useMemo(() =>
    timeline.map((t, i) => {
      const line = lineByScene.get(t.sceneId) || lines[i];
      if (!line?.audioUrl) return null;
      return {
        id: line.id || `nar-${i}`,
        x: t.imageStartTime * effectivePx,
        w: Math.max(4, (line.duration || t.imageDuration) * effectivePx),
        audioUrl: line.audioUrl,
      };
    }).filter((b): b is NonNullable<typeof b> => b !== null),
    [timeline, lines, lineByScene, effectivePx]
  );

  // 자막 블록
  const subtitleBlocks = useMemo(() =>
    timeline.flatMap((t) =>
      t.subtitleSegments
        .filter((seg) => seg.text.trim())
        .map((seg) => ({
          id: seg.lineId,
          sceneId: t.sceneId,
          x: seg.startTime * effectivePx,
          w: Math.max(4, (seg.endTime - seg.startTime) * effectivePx),
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text.slice(0, 15),
        }))
    ),
    [timeline, effectivePx]
  );

  // SFX 블록 (generatedSfx)
  const sfxBlocks = useMemo(() =>
    timeline.map((t) => {
      const scene = scenes.find(s => s.id === t.sceneId);
      if (!scene?.generatedSfx) return null;
      return {
        id: `sfx-${t.sceneId}`,
        x: t.imageStartTime * effectivePx,
        w: Math.max(4, t.imageDuration * effectivePx),
        text: scene.generatedSfx,
        sceneLabel: `${sceneNumberMap.get(t.sceneId) ?? 0}`,
      };
    }).filter((b): b is NonNullable<typeof b> => b !== null),
    [timeline, scenes, effectivePx, sceneNumberMap]
  );

  // 전체 나레이션 볼륨 (평균) 계산
  const avgNarrationVolume = useMemo(() => {
    const ids = timeline.map(t => t.sceneId);
    if (ids.length === 0) return 100;
    const total = ids.reduce((sum, id) => sum + (sceneAudioSettings[id]?.volume ?? 100), 0);
    return Math.round(total / ids.length);
  }, [timeline, sceneAudioSettings]);

  // 호버 핸들러
  const handleSceneMouseEnter = useCallback((e: React.MouseEvent, b: typeof sceneBlocks[0]) => {
    if (!b.imageUrl && !b.videoUrl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverInfo({
      imageUrl: b.imageUrl,
      videoUrl: b.videoUrl,
      label: `장면 ${b.label}`,
      x: rect.left + rect.width / 2 - 90,
      y: rect.top,
    });
  }, []);

  const handleSceneMouseLeave = useCallback(() => { setHoverInfo(null); }, []);

  // ── 도구 모드: select / blade ──
  const [toolMode, setToolMode] = useState<'select' | 'blade'>('select');
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  // ── 마그넷(스냅) 토글 ──
  const [magnetEnabled, setMagnetEnabled] = useState(true);

  // ── 클립 드래그/리사이즈/스냅 ──
  const [clipDrag, setClipDrag] = useState<{
    sceneId: string;
    mode: 'move' | 'trim-left' | 'trim-right';
    origStart: number;
    origDuration: number;
    mouseStartX: number;
    snapLine: number | null;
  } | null>(null);
  const clipDragRef = useRef(clipDrag);
  clipDragRef.current = clipDrag;
  const magnetRef = useRef(magnetEnabled);
  magnetRef.current = magnetEnabled;

  // ref로 최신 timeline 참조 (stale closure 방지)
  const updateSceneTimingRef = useRef(updateSceneTiming);
  updateSceneTimingRef.current = updateSceneTiming;

  // 스냅 포인트를 ref 기반 최신 timeline에서 수집
  const findSnapForDrag = useCallback((time: number, excludeId: string): { snapped: number; line: number | null } => {
    if (!magnetRef.current) return { snapped: time, line: null };
    const tl = timelineRef.current;
    const points: number[] = [0];
    tl.forEach(t => {
      if (t.sceneId === excludeId) return;
      points.push(t.imageStartTime, t.imageStartTime + t.imageDuration);
    });
    const thresholdSec = SNAP_THRESHOLD_PX / effectivePxRef.current;
    let best = time;
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(time - p);
      if (d < thresholdSec && d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return { snapped: best, line: bestDist < Infinity ? best : null };
  }, []);

  const handleClipMouseDown = useCallback((e: React.MouseEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();

    // 블레이드 모드: 클릭 위치에서 장면 분할
    if (toolModeRef.current === 'blade') {
      const entry = timelineRef.current.find(t => t.sceneId === sceneId);
      if (!entry) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const clickTime = entry.imageStartTime + (localX / (rect.width || 1)) * entry.imageDuration;
      if (clickTime > entry.imageStartTime + 0.2 && clickTime < entry.imageStartTime + entry.imageDuration - 0.2) {
        useEditRoomStore.getState().pushUndo();
        splitSceneAtTime(sceneId, clickTime);
      }
      return;
    }

    const entry = timelineRef.current.find(t => t.sceneId === sceneId);
    if (!entry) return;
    // Undo 스냅샷 (드래그 시작 시 1회)
    useEditRoomStore.getState().pushUndo();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const isLeft = localX <= EDGE_HANDLE_PX;
    const isRight = localX >= rect.width - EDGE_HANDLE_PX;
    const mode: 'move' | 'trim-left' | 'trim-right' = isLeft ? 'trim-left' : isRight ? 'trim-right' : 'move';
    const initState = {
      sceneId,
      mode,
      origStart: entry.imageStartTime,
      origDuration: entry.imageDuration,
      mouseStartX: e.clientX,
      snapLine: null as number | null,
    };
    setClipDrag(initState);
    clipDragRef.current = initState;

    const onMove = (ev: MouseEvent) => {
      const cur = clipDragRef.current;
      if (!cur) return;
      const dx = ev.clientX - cur.mouseStartX;
      const dtSec = dx / effectivePxRef.current;

      if (cur.mode === 'move') {
        let newStart = Math.max(0, cur.origStart + dtSec);
        const snapStart = findSnapForDrag(newStart, cur.sceneId);
        const snapEnd = findSnapForDrag(newStart + cur.origDuration, cur.sceneId);
        let snapLine: number | null = null;
        if (snapStart.line !== null && (snapEnd.line === null || Math.abs(snapStart.snapped - newStart) <= Math.abs(snapEnd.snapped - (newStart + cur.origDuration)))) {
          newStart = snapStart.snapped;
          snapLine = snapStart.line;
        } else if (snapEnd.line !== null) {
          newStart = snapEnd.snapped - cur.origDuration;
          snapLine = snapEnd.line;
        }
        newStart = Math.max(0, newStart);
        const next = { ...cur, snapLine };
        setClipDrag(next);
        clipDragRef.current = next;
        updateSceneTimingRef.current(cur.sceneId, newStart, cur.origDuration, ev.shiftKey);
      } else if (cur.mode === 'trim-left') {
        let newStart = cur.origStart + dtSec;
        const snap = findSnapForDrag(newStart, cur.sceneId);
        let snapLine: number | null = null;
        if (snap.line !== null) { newStart = snap.snapped; snapLine = snap.line; }
        newStart = Math.max(0, newStart);
        const maxStart = cur.origStart + cur.origDuration - MIN_CLIP_DURATION;
        newStart = Math.min(newStart, maxStart);
        const newDuration = cur.origStart + cur.origDuration - newStart;
        const next = { ...cur, snapLine };
        setClipDrag(next);
        clipDragRef.current = next;
        updateSceneTimingRef.current(cur.sceneId, newStart, newDuration, ev.shiftKey);
      } else {
        let newEnd = cur.origStart + cur.origDuration + dtSec;
        const snap = findSnapForDrag(newEnd, cur.sceneId);
        let snapLine: number | null = null;
        if (snap.line !== null) { newEnd = snap.snapped; snapLine = snap.line; }
        newEnd = Math.max(cur.origStart + MIN_CLIP_DURATION, newEnd);
        const newDuration = newEnd - cur.origStart;
        const next = { ...cur, snapLine };
        setClipDrag(next);
        clipDragRef.current = next;
        updateSceneTimingRef.current(cur.sceneId, cur.origStart, newDuration, ev.shiftKey);
      }
    };

    const onUp = () => {
      const cur = clipDragRef.current;
      // 마그넷 ON + move 모드: 드래그 위치 기반으로 sceneOrder 리오더 + 갭 없이 재배치
      if (cur && cur.mode === 'move' && magnetRef.current) {
        const store = useEditRoomStore.getState();
        const order = store.sceneOrder;
        const sub = store.sceneSubtitles[cur.sceneId];
        const fromIndex = order.indexOf(cur.sceneId);
        if (fromIndex >= 0 && sub) {
          const dragMid = sub.startTime + (sub.endTime - sub.startTime) / 2;
          let toIndex = order.length - 1; // 기본: 맨 끝
          for (let i = 0; i < order.length; i++) {
            if (order[i] === cur.sceneId) continue;
            const otherSub = store.sceneSubtitles[order[i]];
            if (!otherSub) continue;
            const otherMid = otherSub.startTime + (otherSub.endTime - otherSub.startTime) / 2;
            if (dragMid < otherMid) {
              // fromIndex보다 앞이면 그대로, 뒤면 -1 보정
              toIndex = i > fromIndex ? i - 1 : i;
              break;
            }
          }
          if (fromIndex !== toIndex) {
            store.reorderAndPack(fromIndex, toIndex);
          } else {
            store.packTimingsSequential();
          }
        }
      }
      setClipDrag(null);
      clipDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [findSnapForDrag]);

  // 클립 위에서 커서 모양 결정
  const getClipCursor = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX <= EDGE_HANDLE_PX || localX >= rect.width - EDGE_HANDLE_PX) return 'ew-resize';
    return 'grab';
  }, []);

  const [clipCursor, setClipCursor] = useState<string>('grab');

  // ── 자막 독립 드래그/트림 ──
  const [subDrag, setSubDrag] = useState<{
    sceneId: string;
    mode: 'move' | 'trim-left' | 'trim-right';
    origStart: number;
    origEnd: number;
    mouseStartX: number;
  } | null>(null);
  const subDragRef = useRef(subDrag);
  subDragRef.current = subDrag;
  const updateSubtitleTimingRef = useRef(updateSubtitleTiming);
  updateSubtitleTimingRef.current = updateSubtitleTiming;

  const handleSubtitleMouseDown = useCallback((e: React.MouseEvent, sceneId: string, startTime: number, endTime: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (toolModeRef.current === 'blade') return;
    useEditRoomStore.getState().pushUndo();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const isLeft = localX <= EDGE_HANDLE_PX;
    const isRight = localX >= rect.width - EDGE_HANDLE_PX;
    const mode: 'move' | 'trim-left' | 'trim-right' = isLeft ? 'trim-left' : isRight ? 'trim-right' : 'move';
    const initState = { sceneId, mode, origStart: startTime, origEnd: endTime, mouseStartX: e.clientX };
    setSubDrag(initState);
    subDragRef.current = initState;

    const onMove = (ev: MouseEvent) => {
      const cur = subDragRef.current;
      if (!cur) return;
      const dx = ev.clientX - cur.mouseStartX;
      const dtSec = dx / effectivePxRef.current;
      const origDur = cur.origEnd - cur.origStart;

      if (cur.mode === 'move') {
        const newStart = Math.max(0, cur.origStart + dtSec);
        updateSubtitleTimingRef.current(cur.sceneId, newStart, newStart + origDur);
      } else if (cur.mode === 'trim-left') {
        const newStart = Math.max(0, Math.min(cur.origEnd - MIN_CLIP_DURATION, cur.origStart + dtSec));
        updateSubtitleTimingRef.current(cur.sceneId, newStart, cur.origEnd);
      } else {
        const newEnd = Math.max(cur.origStart + MIN_CLIP_DURATION, cur.origEnd + dtSec);
        updateSubtitleTimingRef.current(cur.sceneId, cur.origStart, newEnd);
      }
    };

    const onUp = () => {
      setSubDrag(null);
      subDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── BGM 트랙 드래그/트림 ──
  const [bgmDrag, setBgmDrag] = useState<{
    mode: 'move' | 'trim-left' | 'trim-right';
    origStart: number;
    origEnd: number;
    mouseStartX: number;
  } | null>(null);
  const bgmDragRef = useRef(bgmDrag);
  bgmDragRef.current = bgmDrag;
  const setBgmTrackRef = useRef(setBgmTrack);
  setBgmTrackRef.current = setBgmTrack;

  const [bgmCursor, setBgmCursor] = useState<string>('grab');

  const handleBgmMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const store = useEditRoomStore.getState();
    const bgm = store.bgmTrack;
    if (!bgm.audioUrl) return;
    store.pushUndo();
    const bgmStart = bgm.startTime ?? 0;
    const bgmEnd = bgm.endTime ?? (totalDuration || 30);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const isLeft = localX <= EDGE_HANDLE_PX;
    const isRight = localX >= rect.width - EDGE_HANDLE_PX;
    const mode: 'move' | 'trim-left' | 'trim-right' = isLeft ? 'trim-left' : isRight ? 'trim-right' : 'move';
    const initState = { mode, origStart: bgmStart, origEnd: bgmEnd, mouseStartX: e.clientX };
    setBgmDrag(initState);
    bgmDragRef.current = initState;

    const onMove = (ev: MouseEvent) => {
      const cur = bgmDragRef.current;
      if (!cur) return;
      const dx = ev.clientX - cur.mouseStartX;
      const dtSec = dx / effectivePxRef.current;
      const origDur = cur.origEnd - cur.origStart;

      if (cur.mode === 'move') {
        const newStart = Math.max(0, cur.origStart + dtSec);
        setBgmTrackRef.current({ startTime: newStart, endTime: newStart + origDur });
      } else if (cur.mode === 'trim-left') {
        const newStart = Math.max(0, Math.min(cur.origEnd - MIN_CLIP_DURATION, cur.origStart + dtSec));
        setBgmTrackRef.current({ startTime: newStart });
      } else {
        const newEnd = Math.max(cur.origStart + MIN_CLIP_DURATION, cur.origEnd + dtSec);
        setBgmTrackRef.current({ endTime: newEnd });
      }
    };

    const onUp = () => {
      setBgmDrag(null);
      bgmDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [totalDuration]);

  const getBgmCursor = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX <= EDGE_HANDLE_PX || localX >= rect.width - EDGE_HANDLE_PX) return 'ew-resize';
    return 'grab';
  }, []);

  // 전환 효과 변경
  const handleTransitionChange = useCallback((sceneId: string, config: SceneTransitionConfig) => {
    setSceneTransition(sceneId, config);
  }, [setSceneTransition]);

  const handleTransitionMarkerClick = useCallback((sceneId: string) => {
    setActiveTransitionId(activeTransitionId === sceneId ? null : sceneId);
  }, [activeTransitionId]);

  // 전환 일괄 적용 (종결 어미 필터 옵션)
  const [bulkEndingOnly, setBulkEndingOnly] = useState(false);
  const handleBulkTransition = useCallback((preset: SceneTransitionPreset, duration: number) => {
    const ENDINGS = /[다죠요죵욤욧습됩임움줌듯군걸까네세셈것럼만면서며고지든랑도][\s.!?~…]*$/;
    timeline.slice(0, -1).forEach(t => {
      if (bulkEndingOnly && preset !== 'none') {
        const text = t.subtitleSegments.map(s => s.text).join(' ').trim();
        if (!text || !ENDINGS.test(text)) {
          // 종결 어미가 아닌 장면은 건너뛰기 (기존 전환 유지)
          return;
        }
      }
      setSceneTransition(t.sceneId, { preset, duration });
    });
    setBulkTransOpen(false);
  }, [timeline, setSceneTransition, bulkEndingOnly]);

  // 전체 나레이션 볼륨 일괄 변경
  const handleGlobalNarrationVolume = useCallback((volume: number) => {
    timeline.forEach(t => {
      setSceneAudioSettings(t.sceneId, { volume });
    });
  }, [timeline, setSceneAudioSettings]);

  // 높이 조절 드래그 핸들러
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startScale: heightScale };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaY = ev.clientY - dragRef.current.startY;
      const newScale = Math.max(0.5, Math.min(3.0, dragRef.current.startScale + deltaY / 100));
      setHeightScale(newScale);
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [heightScale]);

  // BGM 오디오 시작 헬퍼 (startTime/endTime 반영)
  const startBgmAudio = useCallback((seekTime: number) => {
    bgmAudioRef.current?.pause();
    bgmAudioRef.current = null;
    const { bgmTrack: bgm } = useEditRoomStore.getState();
    if (!bgm.audioUrl) return;
    const bgmStart = bgm.startTime ?? 0;
    const bgmEnd = bgm.endTime ?? Infinity;
    // 플레이헤드가 BGM 구간 밖이면 재생하지 않음
    if (seekTime < bgmStart || seekTime >= bgmEnd) return;
    const audio = new Audio(bgm.audioUrl);
    audio.volume = bgm.volume / 100;
    audio.loop = true;
    // BGM 오디오 파일 내 재생 위치 = 타임라인 위치 - BGM 시작 오프셋
    audio.currentTime = seekTime - bgmStart;
    audio.play().catch(() => {});
    bgmAudioRef.current = audio;
  }, []);

  const stopBgmAudio = useCallback(() => {
    bgmAudioRef.current?.pause();
    bgmAudioRef.current = null;
  }, []);

  // 룰러 클릭으로 플레이헤드 이동 (재생 중이면 정지 후 이동)
  const handleRulerSeek = useCallback((e: React.MouseEvent) => {
    if (!rulerTrackRef.current) return;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      stopBgmAudio();
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
      useEditRoomStore.getState().setIsTimelinePlaying(false);
    }
    const rect = rulerTrackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(totalDuration, x / effectivePxRef.current));
    movePlayhead(time);
  }, [totalDuration, movePlayhead, stopBgmAudio]);

  // 플레이헤드 다이아몬드 드래그
  const handlePlayheadDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rulerTrackRef.current) return;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      stopBgmAudio();
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
      useEditRoomStore.getState().setIsTimelinePlaying(false);
    }
    const onMove = (ev: MouseEvent) => {
      if (!rulerTrackRef.current) return;
      const rect = rulerTrackRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const time = Math.max(0, Math.min(totalDuration, x / effectivePxRef.current));
      movePlayhead(time);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [totalDuration, movePlayhead, stopBgmAudio]);

  // 재생 기능: 현재 플레이헤드 위치부터 재생 (DOM 직접 조작 — 60fps)
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause();
      stopBgmAudio();
      cancelAnimationFrame(animRef.current);
      // 정지 시 세그먼트 텍스트 초기화
      prevSubTextRef.current = '';
      useEditRoomStore.getState().setActiveSubtitleText('');
      setIsPlaying(false);
      useEditRoomStore.getState().setIsTimelinePlaying(false);
      return;
    }

    const seekTime = playheadTimeRef.current >= totalDuration - 0.3 ? 0 : playheadTimeRef.current;
    if (seekTime === 0) movePlayhead(0);

    const orderedLines = timeline.map((t, i) => {
      const line = lineByScene.get(t.sceneId) || lines[i];
      return { startTime: t.imageStartTime, audioUrl: line?.audioUrl, duration: t.imageDuration };
    });

    const startPlayback = (audio: HTMLAudioElement, offset: number, audioSeekTime?: number) => {
      audioRef.current = audio;
      connectAudioToAnalyser(audio);
      setIsPlaying(true);
      useEditRoomStore.getState().setIsTimelinePlaying(true);
      // BGM 동시 재생
      startBgmAudio(seekTime);
      const tick = () => {
        if (!audio.paused) {
          movePlayhead(offset + audio.currentTime);
          animRef.current = requestAnimationFrame(tick);
        }
      };
      audio.onended = () => {
        cancelAnimationFrame(animRef.current);
        stopBgmAudio();
        movePlayhead(totalDuration);
        setIsPlaying(false);
        useEditRoomStore.getState().setIsTimelinePlaying(false);
        prevSubTextRef.current = '';
        useEditRoomStore.getState().setActiveSubtitleText('');
      };
      audio.play().then(() => {
        if (audioSeekTime && audioSeekTime > 0) audio.currentTime = audioSeekTime;
        animRef.current = requestAnimationFrame(tick);
      }).catch(() => {
        stopBgmAudio();
        setIsPlaying(false);
        useEditRoomStore.getState().setIsTimelinePlaying(false);
      });
    };

    const mergedAudioUrl = useProjectStore.getState().config?.mergedAudioUrl;
    if (mergedAudioUrl) {
      startPlayback(new Audio(mergedAudioUrl), 0, seekTime);
      return;
    }

    const targetLine = orderedLines.find(l => l.audioUrl && (l.startTime + (l.duration || 0)) > seekTime);
    if (targetLine?.audioUrl) {
      const audioOffset = Math.max(0, seekTime - targetLine.startTime);
      startPlayback(new Audio(targetLine.audioUrl), targetLine.startTime, audioOffset);
      return;
    }

    // 오디오 없이 타이머 기반 플레이헤드 애니메이션 (BGM은 여전히 재생)
    setIsPlaying(true);
    useEditRoomStore.getState().setIsTimelinePlaying(true);
    startBgmAudio(seekTime);
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      const currentTime = seekTime + elapsed;
      if (currentTime >= totalDuration) {
        movePlayhead(totalDuration);
        stopBgmAudio();
        setIsPlaying(false);
        useEditRoomStore.getState().setIsTimelinePlaying(false);
        prevSubTextRef.current = '';
        useEditRoomStore.getState().setActiveSubtitleText('');
        return;
      }
      movePlayhead(currentTime);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [isPlaying, timeline, lineByScene, lines, movePlayhead, totalDuration, startBgmAudio, stopBgmAudio]);

  // 처음으로 이동
  const handleGoToStart = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause();
      stopBgmAudio();
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
      useEditRoomStore.getState().setIsTimelinePlaying(false);
      prevSubTextRef.current = '';
      useEditRoomStore.getState().setActiveSubtitleText('');
    }
    movePlayhead(0);
  }, [isPlaying, movePlayhead, stopBgmAudio]);

  // 스페이스바 재생/일시정지
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause]);

  // 도구 전환 (C=블레이드, V=선택) + Undo/Redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // C → 블레이드
      if (e.key === 'c' || e.key === 'C') {
        if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); setToolMode('blade'); return; }
      }
      // V → 선택
      if (e.key === 'v' || e.key === 'V') {
        if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); setToolMode('select'); return; }
      }
      // Cmd/Ctrl+Z → Undo, Cmd/Ctrl+Shift+Z → Redo
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) { useEditRoomStore.getState().redo(); }
        else { useEditRoomStore.getState().undo(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // BGM 볼륨 실시간 동기화
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = bgmTrack.volume / 100;
    }
  }, [bgmTrack.volume]);

  // 컴포넌트 언마운트 시 클린업
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      bgmAudioRef.current?.pause();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  if (timeline.length === 0) return null;

  const totalMinHeight = RULER_HEIGHT + IMAGE_TRACK_HEIGHT + TRANSITION_TRACK_HEIGHT + TRACK_HEIGHT
    + getAudioTrackHeight('origAudio') + getAudioTrackHeight('narration') + getAudioTrackHeight('bgm') + getAudioTrackHeight('sfx');

  // 줌 스텝 (버튼용)
  const zoomStep = pxPerSec <= 30 ? 5 : 10;

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-900/60 overflow-hidden">
      {/* 호버 프리뷰 팝업 */}
      {hoverInfo && <HoverPreview {...hoverInfo} />}

      {/* 도구 모음 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/50 bg-gray-800/50 flex-wrap">
        {/* 재생 버튼 */}
        <button
          type="button"
          onClick={handlePlayPause}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
            isPlaying
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'bg-gray-700 text-gray-300 hover:bg-amber-600 hover:text-white'
          }`}
          title={isPlaying ? '정지' : '재생'}
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        {/* 처음으로 이동 */}
        <button
          type="button"
          onClick={handleGoToStart}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
          title="처음으로"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="2" height="10" rx="0.5" /><polygon points="14,3 6,8 14,13" /></svg>
        </button>

        {/* 도구 선택: V=선택, C=블레이드 */}
        <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setToolMode('select')}
            className={`px-1.5 py-1 text-[10px] font-bold transition-colors ${
              toolMode === 'select' ? 'bg-amber-600/30 text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="선택 도구 (V)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setToolMode('blade')}
            className={`px-1.5 py-1 text-[10px] font-bold transition-colors ${
              toolMode === 'blade' ? 'bg-red-600/30 text-red-400' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="블레이드 도구 (C) — 클릭으로 장면 분할"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 2L18 8M9.5 2L6 8M12 8v14M7 8h10" />
            </svg>
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => useEditRoomStore.getState().undo()}
            disabled={undoStackLen === 0}
            className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-amber-400 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            title="되돌리기 (Cmd/Ctrl+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 0 1 0 10H9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 6l-4 4 4 4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => useEditRoomStore.getState().redo()}
            disabled={redoStackLen === 0}
            className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-amber-400 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            title="다시 실행 (Cmd/Ctrl+Shift+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 0 0 0 10h4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 6l4 4-4 4" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-gray-600">|</span>
        <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">타임라인</span>
        <span className="text-xs text-gray-600">|</span>
        <span className="text-xs text-amber-400 font-mono"><span ref={timeDisplayRef}>0:00 / </span>{formatTime(totalDuration)}</span>
        <span className="text-xs text-gray-600">|</span>
        <span className="text-xs text-gray-500">{timeline.length}개 장면</span>
        <div className="flex items-center gap-1.5 ml-3">
          <span className="w-2 h-2 rounded-full bg-green-500/60" /> <span className="text-[10px] text-gray-500">나레이션</span>
          <span className="w-2 h-2 rounded-full bg-amber-500/60 ml-2" /> <span className="text-[10px] text-gray-500">영상</span>
          <span className="w-2 h-2 rounded bg-amber-500/40 ml-2" style={{ transform: 'rotate(45deg)', width: 6, height: 6 }} /> <span className="text-[10px] text-gray-500">전환</span>
          <span className="w-2 h-2 rounded-full bg-rose-500/60 ml-2" /> <span className="text-[10px] text-gray-500">원본오디오</span>
        </div>
        <div className="flex-1" />
        {/* 마그넷(스냅) 토글 */}
        <button
          type="button"
          onClick={() => setMagnetEnabled(!magnetEnabled)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
            magnetEnabled
              ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30'
              : 'bg-gray-700 text-gray-500 border-gray-600 hover:text-gray-300 hover:bg-gray-600'
          }`}
          title={magnetEnabled ? '마그넷 켜짐 — 클립이 인접 경계에 자동 정렬' : '마그넷 꺼짐 — 자유 배치'}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 2v6a6 6 0 0 0 12 0V2M6 2H4v6a8 8 0 0 0 16 0V2h-2" />
          </svg>
          마그넷
        </button>
        {/* 믹서 버튼 */}
        <button
          type="button"
          onClick={() => setShowMixerModal(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-700 text-gray-400 hover:text-amber-400 hover:bg-gray-600 border border-gray-600 transition-colors"
          title="오디오 트랙 믹서 + FX"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M3 6h4m0 0V4m0 2v2m4-4h4m0 0v6m0-6V2m4 8h4m0 0V8m0 2v2M3 6h0m0 12h4m0 0v-2m0 2v2m4-6h4m0 0v6m0-6v-2m4 4h4m0 0v-2m0 2v2" /></svg>
          믹서
        </button>
        {/* 높이 리셋 버튼 */}
        {heightScale !== 1.0 && (
          <button
            type="button"
            onClick={() => setHeightScale(1.0)}
            className="text-[10px] text-gray-500 hover:text-amber-400 bg-gray-700 px-1.5 py-0.5 rounded transition-colors"
            title="높이 초기화"
          >
            1x
          </button>
        )}
        <span className="text-xs text-gray-600">줌</span>
        <button
          type="button"
          onClick={() => handleZoomChange(Math.max(MIN_PX_PER_SEC, pxPerSec - zoomStep))}
          disabled={pxPerSec <= MIN_PX_PER_SEC}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-amber-400 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="줌 축소"
        >-</button>
        <input
          type="range"
          min={MIN_PX_PER_SEC} max={MAX_PX_PER_SEC} step={5}
          value={pxPerSec}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="w-20 accent-amber-500"
        />
        <button
          type="button"
          onClick={() => handleZoomChange(Math.min(MAX_PX_PER_SEC, pxPerSec + zoomStep))}
          disabled={pxPerSec >= MAX_PX_PER_SEC}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-amber-400 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="줌 확대"
        >+</button>
        <span className="text-xs text-gray-500 w-8 tabular-nums">{Math.round(pxPerSec)}x</span>
      </div>

      {/* 스크롤 영역 — will-change로 줌 시 리플로우 최소화 */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden flex-1"
        style={{ willChange: 'scroll-position' }}
      >
        <div style={{ width: totalWidth + LABEL_WIDTH + 20, minHeight: totalMinHeight, contain: 'layout style' }}>
          {/* 시간 눈금자 */}
          <div className="flex" style={{ height: RULER_HEIGHT }}>
            <div className="flex-shrink-0 bg-gray-800/80 border-r border-gray-700/50" style={{ width: LABEL_WIDTH }} />
            <div ref={rulerTrackRef} className="relative flex-1 cursor-pointer" onMouseDown={handleRulerSeek}>
              {rulerMarks.map((m) => (
                <div
                  key={m.time}
                  className="absolute top-0 bottom-0 border-l border-gray-700/30"
                  style={{ left: m.x }}
                >
                  <span className="text-[9px] text-gray-600 font-mono ml-0.5 select-none">{formatTime(m.time)}</span>
                </div>
              ))}
              <div ref={el => { playheadElRefs.current[0] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none will-change-transform" style={{ left: 0 }}>
                <div
                  className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-amber-400 rotate-45 pointer-events-auto cursor-grab hover:bg-amber-300 active:cursor-grabbing z-30"
                  onMouseDown={handlePlayheadDrag}
                />
              </div>
            </div>
          </div>

          {/* 1. 자막 트랙 */}
          <div className="flex border-t border-gray-700/30" style={{ height: TRACK_HEIGHT }}>
            <div className="flex-shrink-0 flex items-center px-1.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-yellow-500 font-bold" style={{ width: LABEL_WIDTH }}>
              자막
            </div>
            <div className="relative flex-1">
              {subtitleBlocks.map((b) => (
                <div
                  key={b.id}
                  className={`absolute top-1 bottom-1 rounded-sm flex items-center px-1 overflow-hidden select-none group/sub transition-colors ${
                    subDrag?.sceneId === b.sceneId
                      ? 'bg-yellow-500/30 border border-yellow-400/50 ring-1 ring-yellow-400/40 z-10'
                      : 'bg-yellow-600/20 border border-yellow-500/30 hover:border-yellow-400/50 cursor-grab'
                  }`}
                  style={{ left: b.x, width: b.w }}
                  onMouseDown={(e) => handleSubtitleMouseDown(e, b.sceneId, b.startTime, b.endTime)}
                  title="드래그: 자막 이동, 가장자리: 자막 트림"
                >
                  {/* 좌측 트림 핸들 */}
                  <div className="absolute left-0 top-0 bottom-0 w-[5px] z-20 cursor-ew-resize opacity-0 group-hover/sub:opacity-100 transition-opacity bg-gradient-to-r from-yellow-400/40 to-transparent" />
                  {/* 우측 트림 핸들 */}
                  <div className="absolute right-0 top-0 bottom-0 w-[5px] z-20 cursor-ew-resize opacity-0 group-hover/sub:opacity-100 transition-opacity bg-gradient-to-l from-yellow-400/40 to-transparent" />
                  <span className="text-[9px] text-yellow-300/70 truncate pointer-events-none">{b.text}</span>
                </div>
              ))}
              <div ref={el => { playheadElRefs.current[1] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>

          {/* 2. 비디오/이미지 트랙 (높이 확대 + 썸네일) */}
          <div className="flex border-t border-gray-700/30" style={{ height: IMAGE_TRACK_HEIGHT }}>
            <div className="flex-shrink-0 flex items-center px-1.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-gray-500 font-bold" style={{ width: LABEL_WIDTH }}>
              영상
            </div>
            <div className="relative flex-1">
              {sceneBlocks.map((b) => {
                const isDragging = clipDrag?.sceneId === b.id;
                return (
                  <div
                    key={b.id}
                    className={`absolute top-0.5 bottom-0.5 rounded overflow-hidden border transition-colors select-none group/clip ${
                      isDragging ? 'border-amber-400 ring-2 ring-amber-400/60 z-30 opacity-90' :
                      b.isActive ? 'border-amber-400 ring-1 ring-amber-400/50 z-10' : `${b.borderColor} hover:border-gray-400`
                    }`}
                    style={{ left: b.x, width: b.w, cursor: toolMode === 'blade' ? BLADE_CURSOR : clipDrag ? (clipDrag.mode === 'move' ? 'grabbing' : 'ew-resize') : clipCursor }}
                    title={toolMode === 'blade' ? `장면 ${b.label} — 클릭하여 분할` : `장면 ${b.label} (드래그: 이동, 가장자리: 트림, Shift: 리플)`}
                    onClick={() => { if (!isDragging) setExpandedSceneId(b.isActive ? null : b.id); }}
                    onMouseDown={(e) => handleClipMouseDown(e, b.id)}
                    onMouseMove={(e) => { if (!clipDrag) setClipCursor(getClipCursor(e)); }}
                    onMouseEnter={(e) => handleSceneMouseEnter(e, b)}
                    onMouseLeave={() => { handleSceneMouseLeave(); if (!clipDrag) setClipCursor('grab'); }}
                  >
                    {/* 좌측 트림 핸들 */}
                    <div className="absolute left-0 top-0 bottom-0 w-[5px] z-20 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 transition-opacity bg-gradient-to-r from-white/30 to-transparent" />
                    {/* 우측 트림 핸들 */}
                    <div className="absolute right-0 top-0 bottom-0 w-[5px] z-20 cursor-ew-resize opacity-0 group-hover/clip:opacity-100 transition-opacity bg-gradient-to-l from-white/30 to-transparent" />
                    {b.imageUrl ? (
                      <img src={b.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" loading="lazy" />
                    ) : (
                      <div className={`absolute inset-0 ${b.color} pointer-events-none`} />
                    )}
                    <span className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none">
                      <span className="bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {b.videoUrl ? '\uD83C\uDFAC' : ''}{b.label}
                      </span>
                    </span>
                  </div>
                );
              })}
              {/* 스냅 가이드 라인 */}
              {clipDrag?.snapLine != null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-amber-400 z-40 pointer-events-none"
                  style={{ left: clipDrag.snapLine * effectivePx }}
                />
              )}
              <div ref={el => { playheadElRefs.current[2] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>

          {/* 3. 전환 효과 트랙 */}
          <div className="flex border-t border-gray-700/30" style={{ height: TRANSITION_TRACK_HEIGHT }}>
            <div
              ref={bulkTransRef}
              className="flex-shrink-0 flex items-center px-1.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-amber-500 font-bold cursor-pointer hover:bg-gray-700/80 transition-colors relative"
              style={{ width: LABEL_WIDTH }}
              onClick={() => setBulkTransOpen(!bulkTransOpen)}
              title="전환 일괄 적용"
            >
              전환
              {bulkTransOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setBulkTransOpen(false)}>
                  <div className="absolute inset-0 bg-black/50" />
                  <div
                    className="relative bg-gray-900 border border-amber-500/30 rounded-xl shadow-2xl p-5 w-[420px] max-h-[80vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-amber-400">전환 효과 전체 적용</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">선택한 전환 효과를 모든 장면 사이에 일괄 적용합니다</p>
                      </div>
                      <button type="button" onClick={() => setBulkTransOpen(false)}
                        className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-400 hover:text-gray-200 flex items-center justify-center text-sm transition-colors">
                        X
                      </button>
                    </div>

                    {/* 종결 어미 필터 옵션 */}
                    <div className="mb-3 bg-gray-800/60 rounded-lg border border-gray-700/50 p-3">
                      <button
                        type="button"
                        onClick={() => setBulkEndingOnly(!bulkEndingOnly)}
                        className="w-full flex items-center justify-between"
                      >
                        <div className="flex-1 text-left">
                          <p className="text-xs font-bold text-gray-200">종결 어미 장면에만 적용</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">나레이션이 ~다, ~요, ~죠, ~습니다 등으로 끝나는 장면에만 전환 적용 (문장이 끊어지는 자연스러운 지점)</p>
                        </div>
                        <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${bulkEndingOnly ? 'bg-amber-500' : 'bg-gray-600'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${bulkEndingOnly ? 'left-[18px]' : 'left-0.5'}`} />
                        </div>
                      </button>
                    </div>

                    {/* 초기화 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleBulkTransition('none', 0.5)}
                      className="w-full mb-3 px-3 py-2 rounded-lg text-xs font-bold border border-red-500/30 bg-red-600/10 text-red-400 hover:bg-red-600/20 hover:border-red-500/50 transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                      전체 전환 초기화 (컷)
                    </button>

                    {/* 전환 프리셋 그리드 */}
                    <div className="space-y-3">
                      {TRANSITION_GROUPS.filter(g => g.label !== '기본' || g.items.some(i => i.id !== 'none')).map((group) => (
                        <div key={group.label}>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">{group.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.items.filter(p => p.id !== 'none').map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleBulkTransition(p.id, 0.5)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border bg-gray-800/80 border-gray-700/50 text-gray-300 hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-600/10 transition-all"
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
            <div className="relative flex-1">
              {transitionMarkers.map((m) => {
                const isActive = activeTransitionId === m.sceneId;
                const hasTransition = m.config.preset !== 'none';
                return (
                  <div
                    key={`tr-${m.sceneId}`}
                    className="absolute top-0 bottom-0 flex items-center justify-center"
                    style={{ left: m.x - 14, width: 28 }}
                  >
                    <button
                      ref={(el) => {
                        if (el) transitionAnchorRefs.current.set(m.sceneId, el);
                        else transitionAnchorRefs.current.delete(m.sceneId);
                      }}
                      type="button"
                      onClick={() => handleTransitionMarkerClick(m.sceneId)}
                      className={`relative w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all border ${
                        hasTransition
                          ? 'bg-amber-600/30 border-amber-500/50 text-amber-300 hover:bg-amber-600/40'
                          : isActive
                            ? 'bg-gray-700 border-gray-500 text-gray-300'
                            : 'bg-gray-800/60 border-gray-700/40 text-gray-600 hover:text-gray-400 hover:border-gray-600'
                      }`}
                      title={`${m.fromLabel}\u2192${m.toLabel}: ${getTransitionLabel(m.config.preset)}${hasTransition ? ` (${m.config.duration}s)` : ''}`}
                    >
                      {hasTransition ? '◆' : '◇'}
                    </button>
                    {isActive && (
                      <SceneTransitionPicker
                        config={m.config}
                        onChange={(cfg) => handleTransitionChange(m.sceneId, cfg)}
                        onClose={() => setActiveTransitionId(null)}
                        anchorRef={{ current: transitionAnchorRefs.current.get(m.sceneId) || null }}
                      />
                    )}
                  </div>
                );
              })}
              <div ref={el => { playheadElRefs.current[3] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>

          {/* 4. 원본 영상 오디오 트랙 */}
          {(() => { const h = getAudioTrackHeight('origAudio'); return (
          <div data-track-key="origAudio" className="flex border-t border-gray-700/30" style={{ height: h }}>
            <div className="flex-shrink-0 flex items-center px-1.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-rose-500 font-bold cursor-pointer select-none" style={{ width: LABEL_WIDTH }}
              onDoubleClick={() => toggleTrackExpand('origAudio')} title="더블클릭: 확장/축소, Alt+휠: 높이 조절">
              원본오디오
              {expandedTracks.has('origAudio') && <span className="ml-auto text-[7px] text-rose-400/60">▼</span>}
            </div>
            <div className="relative flex-1">
              {videoAudioBlocks.map((b) => (
                <div key={b.id} className="absolute top-0.5 bottom-0.5 bg-rose-600/20 border border-rose-500/30 rounded-sm overflow-hidden" style={{ left: b.x, width: b.w }}>
                  {b.videoUrl && b.w > 12 ? (
                    <MiniWaveformTrack audioUrl={b.videoUrl} width={b.w} height={h - 2} color="rgb(251, 113, 133)" />
                  ) : (
                    <SyntheticWaveform seed={b.id} width={b.w} height={h - 2} color="rgb(251, 113, 133)" />
                  )}
                </div>
              ))}
              <div ref={el => { playheadElRefs.current[4] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>
          ); })()}

          {/* 5. 나레이션 트랙 (웨이브폼 포함 + 볼륨 인라인 컨트롤) */}
          {(() => { const narH = getAudioTrackHeight('narration'); return (
          <div data-track-key="narration" className="flex border-t border-gray-700/30" style={{ height: narH }}>
            <div
              ref={narLabelRef}
              className="flex-shrink-0 flex items-center gap-0.5 px-0.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-green-500 font-bold relative"
              style={{ width: LABEL_WIDTH }}
              onDoubleClick={() => toggleTrackExpand('narration')} title="더블클릭: 확장/축소, Alt+휠: 높이 조절"
            >
              <span className="truncate cursor-pointer hover:text-green-400 transition-colors flex-1 min-w-0 pl-0.5" onClick={() => setNarVolPopoverOpen(!narVolPopoverOpen)} title="나레이션 볼륨">나레이션</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('narration', { mute: !trackMixer.narration.mute }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.narration.mute ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="뮤트">M</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('narration', { solo: !trackMixer.narration.solo }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.narration.solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="솔로">S</button>
              {narVolPopoverOpen && (
                <VolumePopover anchorRef={narLabelRef} onClose={() => setNarVolPopoverOpen(false)}>
                  <p className="text-[10px] text-gray-400 mb-1 font-bold">전체 나레이션 볼륨</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0} max={200} step={5}
                      value={avgNarrationVolume}
                      onChange={(e) => handleGlobalNarrationVolume(Number(e.target.value))}
                      className="flex-1 accent-green-500 h-1"
                    />
                    <span className="text-[10px] text-green-400 font-mono w-12 text-right">
                      {avgNarrationVolume <= 0 ? '-∞' : `${(20 * Math.log10(avgNarrationVolume / 100)).toFixed(1)}`}dB
                    </span>
                  </div>
                </VolumePopover>
              )}
            </div>
            <div className="relative flex-1">
              {narrationBlocks.map((b, idx) => {
                const cfMs = trackMixer.narration.crossfadeMs;
                const cfPx = cfMs > 0 ? Math.max(3, (cfMs / 1000) * effectivePx) : 0;
                const hasPrev = idx > 0;
                const hasNext = idx < narrationBlocks.length - 1;
                return (
                  <div
                    key={b.id}
                    className="absolute top-0.5 bottom-0.5 bg-green-600/20 border border-green-500/30 rounded-sm overflow-hidden"
                    style={{ left: b.x, width: b.w }}
                  >
                    {b.audioUrl && b.w > 20 && (
                      <MiniWaveformTrack audioUrl={b.audioUrl} width={b.w} height={narH - 2} color="rgb(74, 222, 128)" />
                    )}
                    {cfPx > 0 && hasPrev && (
                      <div className="absolute left-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(cfPx, b.w / 2), background: 'linear-gradient(to right, rgba(251,191,36,0.35), transparent)' }} />
                    )}
                    {cfPx > 0 && hasNext && (
                      <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(cfPx, b.w / 2), background: 'linear-gradient(to left, rgba(251,191,36,0.35), transparent)' }} />
                    )}
                  </div>
                );
              })}
              <div ref={el => { playheadElRefs.current[5] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>
          ); })()}

          {/* 6. BGM 트랙 (볼륨 + 덕킹 인라인 컨트롤) */}
          {(() => { const bgmH = getAudioTrackHeight('bgm'); return (
          <div data-track-key="bgm" className="flex border-t border-gray-700/30" style={{ height: bgmH }}>
            <div
              ref={bgmLabelRef}
              className="flex-shrink-0 flex items-center gap-0.5 px-0.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-cyan-500 font-bold relative"
              style={{ width: LABEL_WIDTH }}
              onDoubleClick={() => toggleTrackExpand('bgm')} title="더블클릭: 확장/축소, Alt+휠: 높이 조절"
            >
              <span className="truncate cursor-pointer hover:text-cyan-400 transition-colors flex-1 min-w-0 pl-0.5" onClick={() => setBgmVolPopoverOpen(!bgmVolPopoverOpen)} title="BGM 볼륨/덕킹">BGM</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('bgm', { mute: !trackMixer.bgm.mute }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.bgm.mute ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="뮤트">M</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('bgm', { solo: !trackMixer.bgm.solo }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.bgm.solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="솔로">S</button>
              {bgmVolPopoverOpen && (
                <VolumePopover anchorRef={bgmLabelRef} onClose={() => setBgmVolPopoverOpen(false)}>
                  <p className="text-[10px] text-gray-400 mb-1 font-bold">BGM 볼륨</p>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={bgmTrack.volume}
                      onChange={(e) => setBgmTrack({ volume: Number(e.target.value) })}
                      className="flex-1 accent-cyan-500 h-1"
                    />
                    <span className="text-[10px] text-cyan-400 font-mono w-12 text-right">
                      {bgmTrack.volume <= 0 ? '-∞' : `${(20 * Math.log10(bgmTrack.volume / 100)).toFixed(1)}`}dB
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1 font-bold">덕킹 {bgmTrack.duckingDb === 0 ? '없음' : `${bgmTrack.duckingDb}dB`}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-24} max={0} step={3}
                      value={bgmTrack.duckingDb}
                      onChange={(e) => setBgmTrack({ duckingDb: Number(e.target.value) })}
                      className="flex-1 accent-cyan-500 h-1"
                    />
                    <span className="text-[10px] text-cyan-400 font-mono w-8 text-right">{bgmTrack.duckingDb}dB</span>
                  </div>
                </VolumePopover>
              )}
            </div>
            <div className="relative flex-1">
              {bgmTrack.audioUrl && (() => {
                const bgmCfMs = trackMixer.bgm.crossfadeMs;
                const bgmCfPx = bgmCfMs > 0 ? Math.max(3, (bgmCfMs / 1000) * effectivePx) : 0;
                const bgmStartSec = bgmTrack.startTime ?? 0;
                const bgmEndSec = bgmTrack.endTime ?? totalDuration;
                const bgmLeftPx = bgmStartSec * effectivePx;
                const bgmWidthPx = Math.max(4, (bgmEndSec - bgmStartSec) * effectivePx);
                const isDraggingBgm = bgmDrag !== null;
                return (
                  <div
                    className={`absolute top-0.5 bottom-0.5 bg-cyan-600/15 border rounded-sm overflow-hidden select-none ${isDraggingBgm ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-cyan-500/30'}`}
                    style={{ left: bgmLeftPx, width: bgmWidthPx, cursor: isDraggingBgm ? (bgmDrag.mode === 'move' ? 'grabbing' : 'ew-resize') : bgmCursor }}
                    onMouseDown={handleBgmMouseDown}
                    onMouseMove={(e) => { if (!isDraggingBgm) setBgmCursor(getBgmCursor(e)); }}
                    onMouseLeave={() => { if (!isDraggingBgm) setBgmCursor('grab'); }}
                  >
                    <MiniWaveformTrack audioUrl={bgmTrack.audioUrl} width={bgmWidthPx} height={bgmH - 2} color="rgb(34, 211, 238)" />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-cyan-300/60 truncate z-10 bg-gray-900/50 px-1 rounded">{bgmTrack.trackTitle || 'BGM'}</span>
                    {/* 트림 핸들 */}
                    <div className="absolute left-0 top-0 bottom-0 w-[5px] cursor-ew-resize z-20 hover:bg-cyan-400/30" />
                    <div className="absolute right-0 top-0 bottom-0 w-[5px] cursor-ew-resize z-20 hover:bg-cyan-400/30" />
                    {bgmCfPx > 0 && (
                      <div className="absolute left-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(bgmCfPx * 2, bgmWidthPx / 4), background: 'linear-gradient(to right, rgba(251,191,36,0.3), transparent)' }} />
                    )}
                    {bgmCfPx > 0 && (
                      <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(bgmCfPx * 2, bgmWidthPx / 4), background: 'linear-gradient(to left, rgba(251,191,36,0.3), transparent)' }} />
                    )}
                  </div>
                );
              })()}
              <div ref={el => { playheadElRefs.current[6] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>
          ); })()}

          {/* 7. SFX 트랙 */}
          {(() => { const sfxH = getAudioTrackHeight('sfx'); return (
          <div data-track-key="sfx" className="flex border-t border-gray-700/30" style={{ height: sfxH }}>
            <div className="flex-shrink-0 flex items-center gap-0.5 px-0.5 bg-gray-800/80 border-r border-gray-700/50 text-[10px] text-fuchsia-500 font-bold" style={{ width: LABEL_WIDTH }}
              onDoubleClick={() => toggleTrackExpand('sfx')} title="더블클릭: 확장/축소, Alt+휠: 높이 조절">
              <span className="truncate flex-1 min-w-0 pl-0.5">SFX</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('sfx', { mute: !trackMixer.sfx.mute }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.sfx.mute ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="뮤트">M</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setTrackMixer('sfx', { solo: !trackMixer.sfx.solo }); }}
                className={`w-3.5 h-3.5 rounded text-[7px] font-black flex items-center justify-center flex-shrink-0 transition-colors ${trackMixer.sfx.solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500 hover:text-gray-300'}`} title="솔로">S</button>
            </div>
            <div className="relative flex-1">
              {sfxBlocks.map((b, idx) => {
                const cfMs = trackMixer.sfx.crossfadeMs;
                const cfPx = cfMs > 0 ? Math.max(3, (cfMs / 1000) * effectivePx) : 0;
                const hasPrev = idx > 0;
                const hasNext = idx < sfxBlocks.length - 1;
                return (
                  <div
                    key={b.id}
                    className="absolute top-0.5 bottom-0.5 bg-fuchsia-600/20 border border-fuchsia-500/30 rounded-sm overflow-hidden"
                    style={{ left: b.x, width: b.w }}
                    title={b.text}
                  >
                    <SyntheticWaveform seed={b.text} width={b.w} height={sfxH - 2} color="rgb(217, 70, 239)" />
                    {b.w > 40 && (
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-fuchsia-300/60 truncate z-10 bg-gray-900/40 px-0.5 rounded max-w-[90%]">{b.text}</span>
                    )}
                    {cfPx > 0 && hasPrev && (
                      <div className="absolute left-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(cfPx, b.w / 2), background: 'linear-gradient(to right, rgba(251,191,36,0.35), transparent)' }} />
                    )}
                    {cfPx > 0 && hasNext && (
                      <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-10" style={{ width: Math.min(cfPx, b.w / 2), background: 'linear-gradient(to left, rgba(251,191,36,0.35), transparent)' }} />
                    )}
                  </div>
                );
              })}
              <div ref={el => { playheadElRefs.current[7] = el; }} className="absolute top-0 bottom-0 w-0.5 bg-amber-400/60 z-20 pointer-events-none will-change-transform" style={{ left: 0 }} />
            </div>
          </div>
          ); })()}
        </div>
      </div>{/* 스크롤 영역 닫기 */}

      {/* 오디오 믹서 모달 */}
      {showMixerModal && <AudioMixerModal onClose={() => setShowMixerModal(false)} />}

      {/* 단축키 안내 */}
      <div className="flex items-center justify-center gap-4 px-2 py-0.5 bg-gray-800/60 border-t border-gray-700/30 select-none">
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">Alt</kbd>
          <span>+</span>
          <span>Scroll</span>
          <span className="text-gray-500 ml-0.5">트랙 높이 조절</span>
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">+</kbd>
          <span>/</span>
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">-</kbd>
          <span className="text-gray-500 ml-0.5">줌 인/아웃</span>
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <span>Double-click</span>
          <span className="text-gray-500 ml-0.5">트랙 확장/축소</span>
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">V</kbd>
          <span className="text-gray-500 ml-0.5">선택</span>
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">C</kbd>
          <span className="text-gray-500 ml-0.5">블레이드</span>
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}</kbd>
          <span>+</span>
          <kbd className="px-1 py-px bg-gray-700/80 rounded text-[8px] text-gray-400 font-mono border border-gray-600/50">Z</kbd>
          <span className="text-gray-500 ml-0.5">되돌리기</span>
        </span>
      </div>

      {/* 높이 조절 드래그 핸들 바 */}
      <div
        className="h-1.5 bg-gray-800/80 border-t border-gray-700/50 cursor-ns-resize hover:bg-gray-700/80 transition-colors flex items-center justify-center group"
        onMouseDown={handleResizeMouseDown}
        title="드래그하여 타임라인 높이 조절"
      >
        <div className="flex gap-0.5">
          <div className="w-4 h-[2px] rounded-full bg-gray-600 group-hover:bg-amber-500/60 transition-colors" />
          <div className="w-4 h-[2px] rounded-full bg-gray-600 group-hover:bg-amber-500/60 transition-colors" />
        </div>
      </div>
    </div>
  );
};

export default VisualTimeline;
