import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy,
  sortableKeyboardCoordinates, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  VideoVersionItem,
  VideoSceneRow,
} from '../../../types';
import { showToast } from '../../../stores/uiStore';
import PreviewNarrationPanel, { type TtsEntry } from './PreviewNarrationPanel';
import { logger } from '../../../services/LoggerService';

// ═══════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════

/** "4.0초" → 4.0 */
function parseDur(dur: string): number {
  const m = dur.match(/([\d.]+)\s*초/);
  return m ? parseFloat(m[1]) : 3;
}

/** "01:30.5" → 90.5 */
function tcToSec(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** 초 → "1:30" */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ParsedScene {
  cutNum: number;
  startSec: number;
  endSec: number;
  duration: number;
  subtitle: string;
  effectSub: string;
  mode: string;
  raw: VideoSceneRow;
}

interface Props {
  version: VideoVersionItem;
  videoBlob: Blob;
  onClose: () => void;
  onDownloadSrt: () => void;
}

// 모드 색상 (VideoAnalysisRoom과 통일)
const MODE_BG: Record<string, string> = {
  N: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  S: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  A: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
};

function getModeClass(mode: string): string {
  if (mode.includes('N')) return MODE_BG.N;
  if (mode.includes('S')) return MODE_BG.S;
  if (mode.includes('A')) return MODE_BG.A;
  return 'bg-gray-700 text-gray-400';
}

// ═══════════════════════════════════════
// 드래그 가능한 장면 버튼
// ═══════════════════════════════════════

interface SortableSceneButtonProps {
  id: number;
  scene: ParsedScene;
  isCurrent: boolean;
  isPast: boolean;
  onClick: () => void;
}

const SortableSceneButton: React.FC<SortableSceneButtonProps> = ({
  id, scene, isCurrent, isPast, onClick,
}) => {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex-shrink-0">
      <button
        onClick={onClick}
        className={`w-32 p-2 rounded-lg border text-left transition-all ${
          isCurrent
            ? 'bg-blue-600/20 border-blue-500/40 ring-1 ring-blue-500/30'
            : isPast
            ? 'bg-gray-800/50 border-gray-700/30 opacity-60'
            : 'bg-gray-800/50 border-gray-700/30 hover:border-gray-600'
        }`}
      >
        <div className="flex items-center gap-1 mb-1">
          <span
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
            </svg>
          </span>
          <span className="text-[10px] font-bold text-gray-500">#{scene.cutNum}</span>
          <span className={`px-1 py-0 rounded text-[9px] font-bold ${getModeClass(scene.mode)}`}>{scene.mode || '-'}</span>
        </div>
        <p className="text-[10px] text-gray-400 leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{scene.subtitle.slice(0, 40)}</p>
        <p className="text-[9px] text-violet-400 font-mono mt-0.5">{scene.duration.toFixed(1)}s</p>
      </button>
    </div>
  );
};

// ═══════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════

const ScenarioPreviewPlayer: React.FC<Props> = ({
  version, videoBlob, onClose, onDownloadSrt,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneEndRef = useRef<number>(0);
  const currentIdxRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [sceneOrder, setSceneOrder] = useState<number[]>([]);
  const [showNarration, setShowNarration] = useState(false);
  const [ttsMap, setTtsMap] = useState<Record<number, TtsEntry>>({});
  const ttsAudioRef = useRef<HTMLAudioElement>(null);

  const blobUrl = useMemo(() => URL.createObjectURL(videoBlob), [videoBlob]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  // ─── 장면 파싱 (원본 순서) ───
  const scenes = useMemo((): ParsedScene[] => {
    return version.scenes.map(scene => {
      const tc = scene.timecodeSource || scene.sourceTimeline || scene.timeline || '';
      const match = tc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
      const startSec = match ? tcToSec(match[1]) : 0;
      const endSec = match ? tcToSec(match[2]) : startSec + parseDur(scene.duration);
      return {
        cutNum: scene.cutNum,
        startSec,
        endSec,
        duration: Math.max(0.1, endSec - startSec),
        subtitle: scene.audioContent || scene.dialogue || scene.sceneDesc || '',
        effectSub: scene.effectSub || '',
        mode: scene.mode || '',
        raw: scene,
      };
    }).filter(s => s.endSec > s.startSec);
  }, [version.scenes]);

  // sceneOrder 초기화 (scenes 변경 시)
  useEffect(() => {
    setSceneOrder(scenes.map((_, i) => i));
    setCurrentIdx(0);
    currentIdxRef.current = 0;
  }, [scenes]);

  // ─── 재정렬된 장면 목록 ───
  const orderedScenes = useMemo(
    () => sceneOrder.map(i => scenes[i]).filter(Boolean),
    [scenes, sceneOrder],
  );

  const isReordered = useMemo(
    () => sceneOrder.some((v, i) => v !== i),
    [sceneOrder],
  );

  const totalDuration = useMemo(
    () => orderedScenes.reduce((acc, s) => acc + s.duration, 0),
    [orderedScenes],
  );

  const elapsedBefore = useMemo(
    () => orderedScenes.slice(0, currentIdx).reduce((acc, s) => acc + s.duration, 0),
    [orderedScenes, currentIdx],
  );

  const scene = orderedScenes[currentIdx] || null;

  // ─── 드래그 앤 드롭 ───
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSceneOrder(prev => {
      const oldIndex = prev.indexOf(active.id as number);
      const newIndex = prev.indexOf(over.id as number);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const resetOrder = useCallback(() => {
    setSceneOrder(scenes.map((_, i) => i));
    setCurrentIdx(0);
    currentIdxRef.current = 0;
  }, [scenes]);

  // ─── 재생 제어 ───
  const seekToScene = useCallback((idx: number) => {
    const video = videoRef.current;
    if (!video || !orderedScenes[idx]) return;
    const s = orderedScenes[idx];
    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    video.currentTime = s.startSec;
    sceneEndRef.current = s.endSec;
  }, [orderedScenes]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || !scene) return;
    video.currentTime = scene.startSec;
    sceneEndRef.current = scene.endSec;
    video.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:play', e); });
    setIsPlaying(true);
  }, [scene]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const prevScene = useCallback(() => {
    const newIdx = Math.max(0, currentIdx - 1);
    seekToScene(newIdx);
    if (isPlaying) videoRef.current?.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:prevScene/play', e); });
  }, [currentIdx, seekToScene, isPlaying]);

  const nextScene = useCallback(() => {
    const newIdx = Math.min(orderedScenes.length - 1, currentIdx + 1);
    seekToScene(newIdx);
    if (isPlaying) videoRef.current?.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:nextScene/play', e); });
  }, [currentIdx, orderedScenes.length, seekToScene, isPlaying]);

  // Time tracking + auto-advance (ref 기반으로 stale closure 방지)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // 장면 끝에 도달하면 다음 장면으로 자동 이동
      if (video.currentTime >= sceneEndRef.current - 0.05 && !video.paused) {
        const idx = currentIdxRef.current;
        if (idx < orderedScenes.length - 1) {
          const next = idx + 1;
          currentIdxRef.current = next;
          setCurrentIdx(next);
          video.currentTime = orderedScenes[next].startSec;
          sceneEndRef.current = orderedScenes[next].endSec;
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [orderedScenes]);

  // ─── MP4 내보내기 (Canvas + MediaRecorder) ───
  const handleExportMp4 = useCallback(async () => {
    if (isExporting || orderedScenes.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    // 미리보기 비디오 일시정지
    videoRef.current?.pause();
    setIsPlaying(false);

    try {
      const exportVideo = document.createElement('video');
      exportVideo.src = blobUrl;
      exportVideo.muted = false;
      exportVideo.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        exportVideo.onloadedmetadata = () => resolve();
        exportVideo.onerror = () => reject(new Error('영상 로드 실패'));
        setTimeout(() => reject(new Error('영상 로드 타임아웃')), 30000);
      });

      const w = exportVideo.videoWidth || 1280;
      const h = exportVideo.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      // Canvas stream (30fps) + 원본 오디오 트랙
      const canvasStream = canvas.captureStream(30);
      try {
        const srcStream = (exportVideo as unknown as { captureStream: () => MediaStream }).captureStream();
        srcStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
      } catch (e) { logger.trackSwallowedError('ScenarioPreviewPlayer:export/captureAudio', e); }

      // MP4 우선, WebM 폴백
      const mimeType = MediaRecorder.isTypeSupported('video/mp4; codecs=avc1,mp4a.40.2')
        ? 'video/mp4; codecs=avc1,mp4a.40.2'
        : MediaRecorder.isTypeSupported('video/webm; codecs=vp9,opus')
        ? 'video/webm; codecs=vp9,opus'
        : 'video/webm';

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const exportDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start(1000);
      let drawing = true;

      // Canvas 드로우 루프
      const drawLoop = () => {
        if (!drawing) return;
        ctx.drawImage(exportVideo, 0, 0, w, h);
        requestAnimationFrame(drawLoop);
      };
      drawLoop();

      // 장면별 순차 재생 및 녹화 (재정렬 순서 반영)
      for (let i = 0; i < orderedScenes.length; i++) {
        const s = orderedScenes[i];
        setExportProgress(Math.round((i / orderedScenes.length) * 100));

        // Seek to scene start
        exportVideo.currentTime = s.startSec;
        await new Promise<void>((r) => { exportVideo.onseeked = () => r(); });

        // Play until scene end
        exportVideo.play();
        await new Promise<void>((resolve) => {
          const onUpdate = () => {
            if (exportVideo.currentTime >= s.endSec - 0.05 || exportVideo.paused) {
              exportVideo.removeEventListener('timeupdate', onUpdate);
              exportVideo.pause();
              resolve();
            }
          };
          exportVideo.addEventListener('timeupdate', onUpdate);
        });
      }

      drawing = false;
      recorder.stop();

      const blob = await exportDone;
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const safeName = version.title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40) || `version-${version.id}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      exportVideo.src = '';
      setExportProgress(100);
      showToast(`MP4 내보내기 완료 (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err) {
      console.error('[Preview] Export failed:', err);
      showToast('MP4 내보내기 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, orderedScenes, blobUrl, version]);

  // ─── TTS 핸들러 ───
  const handleTtsGenerated = useCallback((cutNum: number, entry: TtsEntry) => {
    setTtsMap(prev => ({ ...prev, [cutNum]: entry }));
  }, []);

  // TTS 자동 재생: 장면 전환 시 해당 장면의 TTS 재생
  useEffect(() => {
    const audio = ttsAudioRef.current;
    if (!audio) return;
    const s = orderedScenes[currentIdx];
    if (!s) { audio.pause(); return; }

    const tts = ttsMap[s.cutNum];
    if (isPlaying && tts) {
      audio.src = tts.audioUrl;
      audio.currentTime = 0;
      audio.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:ttsPlay', e); });
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, isPlaying]);

  // ─── 키보드 단축키 ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') prevScene();
      if (e.key === 'ArrowRight') nextScene();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, togglePlay, prevScene, nextScene]);

  // ─── 장면 데이터 없음 ───
  if (scenes.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
        <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-md border border-gray-700">
          <p className="text-gray-300 text-sm mb-4">장면 타임코드가 없어 프리뷰할 수 없습니다.</p>
          <button onClick={onClose} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">닫기</button>
        </div>
      </div>
    );
  }

  const overallElapsed = elapsedBefore + Math.max(0, Math.min(scene?.duration || 0, currentTime - (scene?.startSec || 0)));

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 md:p-8">
      {/* 헤더 */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center text-sm text-white flex-shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-white text-base font-bold truncate">{version.title}</h2>
              {isReordered && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold flex-shrink-0">
                  순서 변경됨
                  <button
                    onClick={resetOrder}
                    className="ml-0.5 hover:text-amber-200 transition-colors"
                    title="원래 순서로 초기화"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs truncate">{version.concept?.slice(0, 80)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowNarration(!showNarration)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${showNarration ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30' : 'bg-gray-700 text-gray-500 border border-gray-600'}`}
            title="나레이션 TTS 패널"
          >
            TTS
          </button>
          <button
            onClick={() => setShowSubtitle(!showSubtitle)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${showSubtitle ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-gray-700 text-gray-500 border border-gray-600'}`}
            title="자막 표시 토글"
          >
            CC
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* 비디오 플레이어 */}
      <div className="w-full max-w-5xl flex-1 min-h-0 flex flex-col">
        <div className="relative bg-black rounded-xl overflow-hidden flex-1 min-h-0">
          <video
            ref={videoRef}
            src={blobUrl}
            className="w-full h-full object-contain"
            onLoadedMetadata={() => {
              setVideoReady(true);
              seekToScene(0);
            }}
            onClick={togglePlay}
            playsInline
          />

          {/* 자막 오버레이 */}
          {showSubtitle && scene && scene.subtitle && (
            <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 max-w-[80%]">
                <p className="text-white text-sm md:text-base text-center leading-relaxed">{scene.subtitle}</p>
                {scene.effectSub && (
                  <p className="text-yellow-300 text-xs md:text-sm text-center font-bold mt-1">{scene.effectSub}</p>
                )}
              </div>
            </div>
          )}

          {/* 일시정지 오버레이 */}
          {!isPlaying && videoReady && (
            <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={play}>
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}

          {/* 장면 인디케이터 */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getModeClass(scene?.mode || '')}`}>
              {scene?.mode || '-'}
            </span>
            <span className="bg-black/60 text-white text-xs px-2 py-0.5 rounded font-mono">
              {currentIdx + 1}/{orderedScenes.length}
            </span>
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="mt-3 space-y-2">
          {/* 프로그레스 바 */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xs font-mono w-12 text-right">{fmtTime(overallElapsed)}</span>
            <div
              className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const targetTime = pct * totalDuration;
                let acc = 0;
                for (let i = 0; i < orderedScenes.length; i++) {
                  if (acc + orderedScenes[i].duration >= targetTime) {
                    seekToScene(i);
                    break;
                  }
                  acc += orderedScenes[i].duration;
                }
              }}
            >
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-200"
                style={{ width: `${(overallElapsed / Math.max(totalDuration, 0.1)) * 100}%` }}
              />
            </div>
            <span className="text-gray-500 text-xs font-mono w-12">{fmtTime(totalDuration)}</span>
          </div>

          {/* 버튼 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={prevScene} disabled={currentIdx === 0}
                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={togglePlay} disabled={!videoReady}
                className="w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center text-white transition-colors">
                {isPlaying ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                )}
              </button>
              <button onClick={nextScene} disabled={currentIdx >= orderedScenes.length - 1}
                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 flex items-center justify-center text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
              <span className="text-gray-400 text-xs ml-2">
                장면 <span className="text-white font-bold">{currentIdx + 1}</span>/{orderedScenes.length}
              </span>
            </div>

            {/* 내보내기 버튼 */}
            <div className="flex items-center gap-2">
              <button onClick={onDownloadSrt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                SRT
              </button>
              <button
                onClick={handleExportMp4}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isExporting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                    {exportProgress}%
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    MP4
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 장면 목록 (드래그 가능 수평 스크롤) */}
        <div className="mt-3 pb-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sceneOrder}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-2 overflow-x-auto">
                {sceneOrder.map((origIdx, displayIdx) => {
                  const s = scenes[origIdx];
                  if (!s) return null;
                  return (
                    <SortableSceneButton
                      key={origIdx}
                      id={origIdx}
                      scene={s}
                      isCurrent={displayIdx === currentIdx}
                      isPast={displayIdx < currentIdx}
                      onClick={() => {
                        seekToScene(displayIdx);
                        if (isPlaying) videoRef.current?.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:sceneClick/play', e); });
                      }}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* 나레이션 TTS 패널 */}
      {showNarration && (
        <div className="w-full max-w-5xl mt-2">
          <PreviewNarrationPanel
            scenes={orderedScenes.map(s => ({ cutNum: s.cutNum, subtitle: s.subtitle, mode: s.mode }))}
            currentIdx={currentIdx}
            ttsMap={ttsMap}
            onTtsGenerated={handleTtsGenerated}
            onSeekToScene={(idx) => {
              seekToScene(idx);
              if (isPlaying) videoRef.current?.play().catch((e) => { logger.trackSwallowedError('ScenarioPreviewPlayer:narrationSeek/play', e); });
            }}
          />
        </div>
      )}

      {/* TTS 오디오 (자동 재생용) */}
      <audio ref={ttsAudioRef} className="hidden" />

      {/* 내보내기 진행 오버레이 */}
      {isExporting && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="bg-gray-800 rounded-2xl p-6 text-center max-w-sm w-full mx-4 border border-gray-700">
            <div className="w-12 h-12 border-4 border-gray-600 border-t-violet-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-bold text-sm mb-2">MP4 내보내기 중...</p>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div className="bg-gradient-to-r from-blue-500 to-violet-500 h-full rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
            </div>
            <p className="text-gray-400 text-xs">
              장면 {Math.min(Math.ceil(exportProgress / 100 * orderedScenes.length) + 1, orderedScenes.length)}/{orderedScenes.length} 처리 중
            </p>
            <p className="text-gray-500 text-[10px] mt-1">실시간 녹화 방식 — 영상 길이만큼 소요</p>
          </div>
        </div>
      )}

      {/* 단축키 안내 */}
      <div className="w-full max-w-5xl mt-2 flex justify-center gap-4 text-[10px] text-gray-600">
        <span>Space: 재생/일시정지</span>
        <span>←→: 이전/다음 장면</span>
        <span>드래그: 장면 순서 변경</span>
        <span>ESC: 닫기</span>
      </div>
    </div>
  );
};

export default ScenarioPreviewPlayer;
