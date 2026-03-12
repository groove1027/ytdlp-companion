import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { audioBufferToWav } from '../../../services/ttsService';
import { transferSoundToImageVideo } from '../../../utils/soundToImageBridge';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { logger } from '../../../services/LoggerService';

/* ───── 유틸 ───── */
const fmt = (sec: number): string => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
};
const fmtSrt = (sec: number): string => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
const genSrt = (subs: { text: string; startTime: number; endTime: number }[]): string =>
  subs.map((s, i) => `${i + 1}\n${fmtSrt(s.startTime)} --> ${fmtSrt(s.endTime)}\n${s.text}`).join('\n\n');

const dlBlob = (url: string, name: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); };

/** 스테레오 파형 추출 — RMS + Peak 이중 메트릭, 고해상도 */
async function decodeWaveform(url: string): Promise<{
  peaksL: Float32Array; peaksR: Float32Array;
  peakMaxL: Float32Array; peakMaxR: Float32Array;
  duration: number;
}> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    const ch0 = decoded.getChannelData(0);
    const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : ch0;
    const sampleRate = decoded.sampleRate;
    const duration = ch0.length / sampleRate;
    const bars = Math.min(8000, Math.max(2000, Math.round(duration * 200)));
    const spb = Math.floor(ch0.length / bars);
    const peaksL = new Float32Array(bars);
    const peaksR = new Float32Array(bars);
    const peakMaxL = new Float32Array(bars);
    const peakMaxR = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      let sumSqL = 0, sumSqR = 0;
      let pkL = 0, pkR = 0;
      const start = i * spb, end = Math.min(start + spb, ch0.length);
      for (let j = start; j < end; j++) {
        sumSqL += ch0[j] * ch0[j];
        sumSqR += ch1[j] * ch1[j];
        const absL = Math.abs(ch0[j]);
        const absR = Math.abs(ch1[j]);
        if (absL > pkL) pkL = absL;
        if (absR > pkR) pkR = absR;
      }
      const n = end - start;
      peaksL[i] = Math.sqrt(sumSqL / n);
      peaksR[i] = Math.sqrt(sumSqR / n);
      peakMaxL[i] = pkL;
      peakMaxR[i] = pkR;
    }
    return { peaksL, peaksR, peakMaxL, peakMaxR, duration: decoded.duration };
  } finally { await ctx.close(); }
}

interface SilenceRegion { startTime: number; endTime: number; duration: number; }

/* ───── 캔버스 상수 ───── */
const DB_SCALE_W = 40;
const RULER_H = 30;
const DB_LEVELS = [0, -6, -12, -24, -36, -48];

const WaveformEditor: React.FC = () => {
  const lines = useSoundStudioStore((s) => s.lines);
  const mergedAudioUrl = useSoundStudioStore((s) => s.mergedAudioUrl);
  const updateLine = useSoundStudioStore((s) => s.updateLine);
  const removeLine = useSoundStudioStore((s) => s.removeLine);
  const pendingEditedAudioUrl = useSoundStudioStore((s) => s.pendingEditedAudioUrl);
  const setPendingEditedAudioUrl = useSoundStudioStore((s) => s.setPendingEditedAudioUrl);
  const commitPendingEdits = useSoundStudioStore((s) => s.commitPendingEdits);

  const workingUrl = pendingEditedAudioUrl || mergedAudioUrl;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);

  // 무음 제거
  const [silenceConfig, setSilenceConfig] = useState({ threshold: -38, minDuration: 0.1, padding: 0.1 });
  const [silenceRegions, setSilenceRegions] = useState<SilenceRegion[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const elapsedDetect = useElapsedTimer(isDetecting);
  const elapsedRemove = useElapsedTimer(isRemoving);

  // Before/After
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [beforeDuration, setBeforeDuration] = useState(0);
  const [showingBefore, setShowingBefore] = useState(false);
  const beforeAudioRef = useRef<HTMLAudioElement | null>(null);

  // 파형
  const [waveData, setWaveData] = useState<{
    peaksL: Float32Array; peaksR: Float32Array;
    peakMaxL: Float32Array; peakMaxR: Float32Array;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  // 상호작용
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // 자막
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoTrack, setAutoTrack] = useState(true);
  const activeSubListRef = useRef<HTMLDivElement | null>(null);

  const subtitles = useMemo(() =>
    lines.filter((l) => l.startTime !== undefined && l.endTime !== undefined)
      .map((l) => ({ id: l.id, text: l.text, startTime: l.startTime!, endTime: l.endTime!, duration: l.duration || (l.endTime! - l.startTime!) })),
    [lines],
  );
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return subtitles;
    const q = searchQuery.toLowerCase();
    return subtitles.filter((s) => s.text.toLowerCase().includes(q));
  }, [subtitles, searchQuery]);

  // mergedAudioUrl 변경 시 (새 TTS 생성 등) 편집 상태 리셋
  useEffect(() => {
    setPendingEditedAudioUrl(null);
    setBeforeUrl(null);
    setSilenceRegions([]);
  }, [mergedAudioUrl, setPendingEditedAudioUrl]);

  // 스테레오 파형 디코딩 — workingUrl 기준
  useEffect(() => {
    if (!workingUrl) { setWaveData(null); setTotalDuration(0); return; }
    let cancelled = false;
    decodeWaveform(workingUrl).then((d) => {
      if (!cancelled) {
        setWaveData({ peaksL: d.peaksL, peaksR: d.peaksR, peakMaxL: d.peakMaxL, peakMaxR: d.peakMaxR });
        // decodeWaveform에서 정확한 duration을 직접 반영 (loadedmetadata 경쟁 상태 방지)
        if (d.duration > 0) setTotalDuration(d.duration);
      }
    }).catch((err) => { console.warn('[WaveformEditor] 파형 디코딩 실패:', err); if (!cancelled) setWaveData(null); });
    return () => { cancelled = true; };
  }, [workingUrl]);

  // pixelToTime 헬퍼
  const pixelToTime = useCallback((e: React.MouseEvent): number => {
    const container = waveContainerRef.current;
    if (!container || totalDuration <= 0) return 0;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const totalW = rect.width * zoom;
    const timeX = clickX - DB_SCALE_W;
    const waveAreaW = totalW - DB_SCALE_W;
    return Math.max(0, Math.min(totalDuration, (timeX / waveAreaW) * totalDuration));
  }, [zoom, totalDuration]);

  /* ═══════ 메인 캔버스 렌더링 ═══════ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveData || totalDuration <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const waveAreaW = W - DB_SCALE_W;
    const waveH = H - RULER_H;
    const centerY = RULER_H + waveH / 2;

    // 배경
    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, W, H);

    // ─── dB 스케일 (왼쪽 40px) ───
    ctx.fillStyle = '#08080d';
    ctx.fillRect(0, RULER_H, DB_SCALE_W, waveH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    // 센터 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(DB_SCALE_W, centerY); ctx.lineTo(W, centerY); ctx.stroke();
    // dB 레벨
    for (const db of DB_LEVELS) {
      const ratio = 1 - Math.abs(db) / 48;
      const yTop = RULER_H + (waveH / 2) * (1 - ratio);
      const yBot = RULER_H + (waveH / 2) + (waveH / 2) * ratio;
      ctx.fillStyle = db === 0 ? '#666' : '#444';
      ctx.font = '8px monospace';
      if (db !== 0) {
        ctx.fillText(`${db}`, 4, yTop + 3);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath(); ctx.moveTo(DB_SCALE_W, yTop); ctx.lineTo(W, yTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(DB_SCALE_W, yBot); ctx.lineTo(W, yBot); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ─── 타임 룰러 (상단 30px) ───
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(DB_SCALE_W, 0, waveAreaW, RULER_H);
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(DB_SCALE_W, RULER_H - 1, waveAreaW, 1);
    const pxPerSec = waveAreaW / totalDuration;
    const majorInt = zoom <= 1.5 ? 10 : zoom <= 3 ? 5 : zoom <= 5 ? 2 : 1;
    const minorInt = majorInt / 5;
    for (let t = 0; t <= totalDuration; t += minorInt) {
      const x = DB_SCALE_W + t * pxPerSec;
      if (x < DB_SCALE_W || x > W) continue;
      const isMajor = Math.abs(t % majorInt) < 0.001 || t < 0.001;
      if (isMajor) {
        ctx.fillStyle = '#888'; ctx.font = '10px monospace';
        ctx.fillText(fmt(t), x + 3, 18);
        ctx.fillStyle = '#555'; ctx.fillRect(x, RULER_H - 10, 1, 10);
      } else {
        ctx.fillStyle = '#333'; ctx.fillRect(x, RULER_H - 5, 1, 5);
      }
    }

    // ─── 무음 구간 표시 (대각선 스트라이프) ───
    for (const r of silenceRegions) {
      const x1 = DB_SCALE_W + r.startTime * pxPerSec;
      const x2 = DB_SCALE_W + r.endTime * pxPerSec;
      const rw = x2 - x1;
      // 배경
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(x1, RULER_H, rw, waveH);
      // 대각선 스트라이프
      ctx.save();
      ctx.beginPath(); ctx.rect(x1, RULER_H, rw, waveH); ctx.clip();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.lineWidth = 1;
      for (let sx = x1 - waveH; sx < x2; sx += 8) {
        ctx.beginPath(); ctx.moveTo(sx, RULER_H); ctx.lineTo(sx + waveH, H); ctx.stroke();
      }
      ctx.restore();
      // 경계선
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, RULER_H); ctx.lineTo(x1, H);
      ctx.moveTo(x2, RULER_H); ctx.lineTo(x2, H);
      ctx.stroke();
    }

    // ─── 선택 영역 ───
    if (selection) {
      const sx1 = DB_SCALE_W + selection.start * pxPerSec;
      const sx2 = DB_SCALE_W + selection.end * pxPerSec;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
      ctx.fillRect(sx1, RULER_H, sx2 - sx1, waveH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx1, RULER_H, sx2 - sx1, waveH);
      // 선택 시간 뱃지
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(sx1, RULER_H + 2, 80, 16);
      ctx.fillStyle = '#00e5ff';
      ctx.font = '9px monospace';
      ctx.fillText(`${fmt(selection.start)} ~ ${fmt(selection.end)}`, sx1 + 4, RULER_H + 13);
    }

    // ─── 프로페셔널 스테레오 파형 (Peak + RMS, 미러링) ───
    const { peaksL, peaksR, peakMaxL, peakMaxR } = waveData;
    const peakCount = peaksL.length;
    const barTotalW = waveAreaW / peakCount;
    const barGap = barTotalW > 2 ? Math.max(0.3, barTotalW * 0.1) : 0;
    const barW = Math.max(0.8, barTotalW - barGap);
    const halfH = waveH / 2;

    // 최대 피크 계산 (정규화 기준)
    let maxPeak = 0;
    for (let i = 0; i < peakCount; i++) {
      if (peakMaxL[i] > maxPeak) maxPeak = peakMaxL[i];
      if (peakMaxR[i] > maxPeak) maxPeak = peakMaxR[i];
    }
    if (maxPeak === 0) maxPeak = 1;

    for (let i = 0; i < peakCount; i++) {
      const x = DB_SCALE_W + i * barTotalW;
      if (x + barW < DB_SCALE_W || x > W) continue;

      // 정규화된 RMS/Peak 값
      const rmsL = peaksL[i] / maxPeak;
      const rmsR = peaksR[i] / maxPeak;
      const pkL = peakMaxL[i] / maxPeak;
      const pkR = peakMaxR[i] / maxPeak;

      // 픽셀 높이 (미러링: 센터 기준 위/아래)
      const rmsPxL = Math.max(0.5, rmsL * halfH * 0.92);
      const rmsPxR = Math.max(0.5, rmsR * halfH * 0.92);
      const peakPxL = Math.max(0.5, pkL * halfH * 0.92);
      const peakPxR = Math.max(0.5, pkR * halfH * 0.92);

      // ── 상단 채널 (L): Peak 외곽 (반투명) ──
      ctx.fillStyle = `rgba(120, 200, 255, 0.18)`;
      ctx.fillRect(x, centerY - peakPxL, barW, peakPxL);

      // ── 상단 채널 (L): RMS 채움 (진폭 기반 그라디언트) ──
      const intL = Math.min(1, rmsL * 1.5);
      const rL = Math.round(56 + intL * 200);
      const gL = Math.round(189 - intL * 120);
      const bL = Math.round(248 - intL * 50);
      ctx.fillStyle = `rgba(${rL}, ${gL}, ${bL}, ${0.6 + intL * 0.35})`;
      if (intL > 0.7) { ctx.shadowColor = `rgba(${rL}, ${gL}, ${bL}, 0.3)`; ctx.shadowBlur = 3; }
      ctx.fillRect(x, centerY - rmsPxL, barW, rmsPxL);
      ctx.shadowBlur = 0;

      // ── 하단 채널 (R): Peak 외곽 ──
      ctx.fillStyle = `rgba(120, 200, 255, 0.18)`;
      ctx.fillRect(x, centerY, barW, peakPxR);

      // ── 하단 채널 (R): RMS 채움 ──
      const intR = Math.min(1, rmsR * 1.5);
      const rR = Math.round(56 + intR * 200);
      const gR = Math.round(189 - intR * 120);
      const bR = Math.round(248 - intR * 50);
      ctx.fillStyle = `rgba(${rR}, ${gR}, ${bR}, ${0.6 + intR * 0.35})`;
      if (intR > 0.7) { ctx.shadowColor = `rgba(${rR}, ${gR}, ${bR}, 0.3)`; ctx.shadowBlur = 3; }
      ctx.fillRect(x, centerY, barW, rmsPxR);
      ctx.shadowBlur = 0;
    }

    // ─── 센터 라인 (파형 경계) ───
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(DB_SCALE_W, centerY);
    ctx.lineTo(W, centerY);
    ctx.stroke();

    // ─── 호버 툴팁 ───
    if (hoverTime !== null && !isDragging) {
      const hx = DB_SCALE_W + hoverTime * pxPerSec;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, RULER_H); ctx.lineTo(hx, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      const tw = 62;
      const tx = Math.min(hx + 6, W - tw - 4);
      ctx.fillRect(tx, RULER_H + 6, tw, 18);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(tx, RULER_H + 6, tw, 18);
      ctx.fillStyle = '#ccc'; ctx.font = '10px monospace';
      ctx.fillText(fmt(hoverTime), tx + 6, RULER_H + 19);
    }

    // ─── 재생헤드 (시안 글로우) ───
    const headX = DB_SCALE_W + currentTime * pxPerSec;
    if (headX >= DB_SCALE_W && headX <= W) {
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(headX - 1, 0, 2, H);
      ctx.shadowBlur = 0;
      // 시간 뱃지
      const timeStr = fmt(currentTime);
      ctx.font = 'bold 9px monospace';
      const bw = ctx.measureText(timeStr).width + 10;
      const bx = Math.max(DB_SCALE_W, Math.min(headX - bw / 2, W - bw));
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(bx + 3, 2); ctx.lineTo(bx + bw - 3, 2);
      ctx.arcTo(bx + bw, 2, bx + bw, 5, 3);
      ctx.lineTo(bx + bw, 15); ctx.arcTo(bx + bw, 18, bx + bw - 3, 18, 3);
      ctx.lineTo(bx + 3, 18); ctx.arcTo(bx, 18, bx, 15, 3);
      ctx.lineTo(bx, 5); ctx.arcTo(bx, 2, bx + 3, 2, 3);
      ctx.fill();
      // 화살표
      ctx.beginPath(); ctx.moveTo(headX - 4, 18); ctx.lineTo(headX + 4, 18); ctx.lineTo(headX, 24); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillText(timeStr, bx + 5, 14);
    }
  }, [waveData, totalDuration, currentTime, silenceRegions, zoom, selection, hoverTime, isDragging]);

  /* ═══════ 미니맵 캔버스 ═══════ */
  useEffect(() => {
    const mini = minimapRef.current;
    if (!mini || !waveData || totalDuration <= 0) return;
    const mCtx = mini.getContext('2d');
    if (!mCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = mini.getBoundingClientRect();
    mini.width = rect.width * dpr;
    mini.height = rect.height * dpr;
    mCtx.scale(dpr, dpr);
    const mW = rect.width, mH = rect.height;

    mCtx.fillStyle = '#08080d';
    mCtx.fillRect(0, 0, mW, mH);

    // 축소 파형 (Peak + RMS 미러링)
    const { peaksL, peaksR, peakMaxL, peakMaxR } = waveData;
    const count = peaksL.length;
    const barTW = mW / count;
    let mx = 0;
    for (let i = 0; i < count; i++) {
      if (peakMaxL[i] > mx) mx = peakMaxL[i];
      if (peakMaxR[i] > mx) mx = peakMaxR[i];
    }
    if (mx === 0) mx = 1;
    const cY = mH / 2;
    for (let i = 0; i < count; i++) {
      const x = i * barTW;
      const pkL = (peakMaxL[i] / mx) * (mH * 0.45);
      const pkR = (peakMaxR[i] / mx) * (mH * 0.45);
      const rmsL = (peaksL[i] / mx) * (mH * 0.45);
      const rmsR = (peaksR[i] / mx) * (mH * 0.45);
      const bw = Math.max(0.8, barTW - 0.3);
      // Peak 외곽
      mCtx.fillStyle = 'rgba(100, 200, 255, 0.2)';
      mCtx.fillRect(x, cY - pkL, bw, pkL);
      mCtx.fillRect(x, cY, bw, pkR);
      // RMS 채움
      mCtx.fillStyle = 'rgba(100, 200, 255, 0.45)';
      mCtx.fillRect(x, cY - rmsL, bw, rmsL);
      mCtx.fillStyle = 'rgba(100, 200, 255, 0.4)';
      mCtx.fillRect(x, cY, bw, rmsR);
    }

    // 뷰포트 인디케이터
    if (zoom > 1) {
      const container = waveContainerRef.current;
      if (container) {
        const totalW = container.scrollWidth;
        const viewStart = container.scrollLeft / totalW;
        const viewWidth = container.clientWidth / totalW;
        mCtx.fillStyle = 'rgba(0, 229, 255, 0.1)';
        mCtx.fillRect(viewStart * mW, 0, viewWidth * mW, mH);
        mCtx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        mCtx.lineWidth = 1.5;
        mCtx.strokeRect(viewStart * mW, 0, viewWidth * mW, mH);
      }
    }

    // 재생헤드
    const px = (currentTime / totalDuration) * mW;
    mCtx.fillStyle = '#00e5ff';
    mCtx.fillRect(px - 0.5, 0, 1.5, mH);

    // 테두리
    mCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    mCtx.lineWidth = 1;
    mCtx.strokeRect(0, 0, mW, mH);
  }, [waveData, totalDuration, currentTime, zoom, scrollX]);

  // 오디오 이벤트
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    registerAudio(audio);
    const onDuration = () => {
      if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration);
    };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const tick = () => { setCurrentTime(audio.currentTime); if (!audio.paused) animFrameRef.current = requestAnimationFrame(tick); };
    const onPlay = () => { animFrameRef.current = requestAnimationFrame(tick); };
    const onPause = () => cancelAnimationFrame(animFrameRef.current);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    // loadedmetadata가 이미 발생한 경우 (blob URL 등에서 즉시 로드) duration을 바로 반영
    if (audio.readyState >= 1 && audio.duration && isFinite(audio.duration)) {
      setTotalDuration(audio.duration);
    }
    return () => { audio.removeEventListener('loadedmetadata', onDuration); audio.removeEventListener('durationchange', onDuration); audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause); audio.removeEventListener('ended', onEnded); cancelAnimationFrame(animFrameRef.current); unregisterAudio(audio); };
  }, [workingUrl]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = playbackSpeed; }, [playbackSpeed]);

  // beforeAudioRef 등록/해제
  useEffect(() => {
    const audio = beforeAudioRef.current;
    if (!audio) return;
    registerAudio(audio);
    return () => { unregisterAudio(audio); };
  }, [beforeUrl]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false)); }
  }, [isPlaying]);

  const handleSeek = useCallback((val: number) => {
    setCurrentTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  }, []);

  /* ═══════ 키보드 단축키 ═══════ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingLineId) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); handlePlayPause(); break;
        case 'ArrowLeft': e.preventDefault(); handleSeek(Math.max(0, currentTime - (e.shiftKey ? 1 : 5))); break;
        case 'ArrowRight': e.preventDefault(); handleSeek(Math.min(totalDuration, currentTime + (e.shiftKey ? 1 : 5))); break;
        case 'Home': e.preventDefault(); handleSeek(0); break;
        case 'End': e.preventDefault(); handleSeek(totalDuration); break;
        case 'Equal': case 'NumpadAdd': e.preventDefault(); setZoom((z) => Math.min(8, z + 0.5)); break;
        case 'Minus': case 'NumpadSubtract': e.preventDefault(); setZoom((z) => Math.max(1, z - 0.5)); break;
        case 'Escape': setSelection(null); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlayPause, handleSeek, currentTime, totalDuration, editingLineId]);

  // 무음 감지
  const handleDetectSilence = useCallback(async () => {
    if (!workingUrl || isDetecting) return;
    setIsDetecting(true);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const resp = await fetch(workingUrl);
      const buf = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      const data = decoded.getChannelData(0);
      const sampleRate = decoded.sampleRate;
      const threshLin = Math.pow(10, silenceConfig.threshold / 20);
      const minSamples = Math.floor(silenceConfig.minDuration * sampleRate);
      const regions: SilenceRegion[] = [];
      let silStart = -1;
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) < threshLin) {
          if (silStart < 0) silStart = i;
        } else {
          if (silStart >= 0 && (i - silStart) >= minSamples) {
            const st = silStart / sampleRate, et = i / sampleRate;
            regions.push({ startTime: st, endTime: et, duration: et - st });
          }
          silStart = -1;
        }
      }
      if (silStart >= 0 && (data.length - silStart) >= minSamples) {
        const st = silStart / sampleRate, et = data.length / sampleRate;
        regions.push({ startTime: st, endTime: et, duration: et - st });
      }
      setSilenceRegions(regions);
    } catch (e) { logger.trackSwallowedError('WaveformEditor:detectSilence', e); setSilenceRegions([]); }
    finally { await ctx.close(); setIsDetecting(false); }
  }, [workingUrl, silenceConfig, isDetecting]);

  const mapTimeAfterCut = (origTime: number, cuts: { startTime: number; endTime: number }[]): number => {
    let shift = 0;
    for (const r of cuts) {
      if (r.endTime <= origTime) shift += r.endTime - r.startTime;
      else if (r.startTime < origTime) shift += origTime - r.startTime;
    }
    return Math.max(0, origTime - shift);
  };

  const handleRemoveSilence = useCallback(async () => {
    if (silenceRegions.length === 0 || !workingUrl || isRemoving) return;
    setIsRemoving(true);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const resp = await fetch(workingUrl);
      const arrBuf = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrBuf);
      const sampleRate = decoded.sampleRate;
      const numCh = decoded.numberOfChannels;
      const rawRegions = silenceRegions
        .map((r) => {
          const s = r.startTime + silenceConfig.padding, e = r.endTime - silenceConfig.padding;
          return { startTime: s, endTime: e, startSample: Math.max(0, Math.floor(s * sampleRate)), endSample: Math.min(decoded.length, Math.floor(e * sampleRate)) };
        })
        .filter((r) => r.endSample > r.startSample)
        .sort((a, b) => a.startSample - b.startSample);
      if (rawRegions.length === 0) { setIsRemoving(false); return; }
      const regions = [rawRegions[0]];
      for (let i = 1; i < rawRegions.length; i++) {
        const last = regions[regions.length - 1];
        if (rawRegions[i].startSample <= last.endSample) {
          last.endSample = Math.max(last.endSample, rawRegions[i].endSample);
          last.endTime = Math.max(last.endTime, rawRegions[i].endTime);
        } else regions.push(rawRegions[i]);
      }
      const totalCut = regions.reduce((s, r) => s + (r.endSample - r.startSample), 0);
      const newLen = decoded.length - totalCut;
      if (newLen <= 0) { setIsRemoving(false); return; }
      const CF = Math.floor(0.03 * sampleRate);
      const newBuf = ctx.createBuffer(numCh, newLen, sampleRate);
      for (let ch = 0; ch < numCh; ch++) {
        const src = decoded.getChannelData(ch), dst = newBuf.getChannelData(ch);
        let dstPos = 0, srcPos = 0, needFadeIn = false;
        for (const region of regions) {
          const segLen = region.startSample - srcPos;
          if (segLen > 0) {
            dst.set(src.subarray(srcPos, region.startSample), dstPos);
            if (needFadeIn) {
              const fl = Math.min(CF, Math.floor(segLen / 2));
              for (let i = 0; i < fl; i++) dst[dstPos + i] *= Math.sin((i / fl) * Math.PI * 0.5);
              needFadeIn = false;
            }
            const foLen = Math.min(CF, Math.floor(segLen / 2));
            for (let i = 0; i < foLen; i++) dst[dstPos + segLen - foLen + i] *= Math.cos((i / foLen) * Math.PI * 0.5);
            dstPos += segLen;
          }
          srcPos = region.endSample; needFadeIn = true;
        }
        const rem = src.length - srcPos;
        if (rem > 0) {
          dst.set(src.subarray(srcPos), dstPos);
          if (needFadeIn) {
            const fl = Math.min(CF, Math.floor(rem / 2));
            for (let i = 0; i < fl; i++) dst[dstPos + i] *= Math.sin((i / fl) * Math.PI * 0.5);
          }
        }
      }
      if (!beforeUrl) { setBeforeUrl(workingUrl); setBeforeDuration(decoded.duration); }
      setShowingBefore(false);
      const wavBlob = audioBufferToWav(newBuf);
      const newUrl = URL.createObjectURL(wavBlob);
      setPendingEditedAudioUrl(newUrl);
      const timeRegs = regions.map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
      const curLines = useSoundStudioStore.getState().lines;
      for (const line of curLines) {
        if (line.startTime === undefined) continue;
        const ns = mapTimeAfterCut(line.startTime, timeRegs);
        const ne = mapTimeAfterCut(line.endTime ?? line.startTime, timeRegs);
        updateLine(line.id, { startTime: ns, endTime: ne, duration: ne - ns });
      }
      setSilenceRegions([]);
    } catch (err) { console.error('[WaveformEditor] 무음 제거 실패:', err); }
    finally { await ctx.close(); setIsRemoving(false); }
  }, [silenceRegions, workingUrl, silenceConfig.padding, updateLine, isRemoving, beforeUrl]);

  // 자막 편집
  const handleSaveEdit = useCallback(() => {
    if (editingLineId && editText.trim()) updateLine(editingLineId, { text: editText.trim() });
    setEditingLineId(null); setEditText('');
  }, [editingLineId, editText, updateLine]);

  const activeSubId = useMemo(() =>
    subtitles.find((s) => currentTime >= s.startTime && currentTime < s.endTime)?.id || null,
    [subtitles, currentTime],
  );

  useEffect(() => {
    if (!autoTrack || !activeSubId || !activeSubListRef.current) return;
    const el = activeSubListRef.current.querySelector(`[data-sub-id="${activeSubId}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [autoTrack, activeSubId]);

  const hasAudio = !!workingUrl;

  // 편집 결과를 스토어에 적용
  const handleApplyToStore = useCallback(() => {
    commitPendingEdits();
  }, [commitPendingEdits]);

  return (
    <div className="space-y-4">
      {hasAudio && <audio ref={audioRef} src={workingUrl!} preload="metadata" />}

      {/* ─── 헤더 ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-cyan-500/20">
            <span className="text-white font-bold">W</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">파형 편집기</h2>
              {pendingEditedAudioUrl && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400 border border-yellow-500/30">
                  편집됨 — 미적용
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-0.5">Space 재생 | ←→ 탐색 | +/- 줌 | 드래그 선택</p>
          </div>
        </div>
        {hasAudio && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => dlBlob(workingUrl!, `narration_edited_${Date.now()}.wav`)}
              className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors">WAV</button>
            {subtitles.length > 0 && (
              <button type="button" onClick={() => {
                const blob = new Blob([genSrt(subtitles)], { type: 'text/srt;charset=utf-8' });
                const u = URL.createObjectURL(blob); dlBlob(u, `narration_${Date.now()}.srt`); URL.revokeObjectURL(u);
              }} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors">SRT</button>
            )}
            {subtitles.length > 0 && (
              <button type="button" onClick={async () => {
                try {
                  const { default: JSZip } = await import('jszip');
                  const zip = new JSZip();
                  const r = await fetch(workingUrl!); zip.file('narration.wav', await r.blob());
                  zip.file('narration.srt', genSrt(subtitles));
                  const zb = await zip.generateAsync({ type: 'blob' });
                  const u = URL.createObjectURL(zb); dlBlob(u, `narration_bundle_${Date.now()}.zip`); URL.revokeObjectURL(u);
                } catch (err) { console.error('[WaveformEditor] 번들 실패:', err); }
              }} className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors">ZIP</button>
            )}
            {beforeUrl && (
              <button type="button" onClick={() => dlBlob(beforeUrl, `narration_original_${Date.now()}.wav`)}
                className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-bold border border-gray-600 transition-colors">원본</button>
            )}
            {pendingEditedAudioUrl && (
              <button type="button" onClick={handleApplyToStore}
                className="px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-green-500/20 transition-all border border-green-400/30 animate-pulse">
                적용
              </button>
            )}
          </div>
        )}
      </div>

      {!hasAudio ? (
        <div className="bg-gray-800/50 border border-gray-700 border-dashed rounded-lg px-4 py-8 text-center text-gray-500 text-base">
          결과 탭에서 TTS를 먼저 생성해주세요. 병합된 오디오가 있어야 파형 편집이 가능합니다.
        </div>
      ) : (
        <>
          {/* ─── 재생 컨트롤 ─── */}
          <div className="flex items-center gap-3 bg-gray-900/80 rounded-xl px-4 py-2.5 border border-gray-700/50 flex-wrap">
            <button type="button" onClick={handlePlayPause}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 flex items-center justify-center text-white text-sm shadow-lg shadow-cyan-500/20 transition-all">
              {isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
            </button>
            <span className="font-mono text-sm text-gray-200">{fmt(currentTime)} / {fmt(totalDuration)}</span>
            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => <option key={v} value={v}>{v}x</option>)}
            </select>
            {/* 커스텀 스크러버 */}
            <div className="flex-1 h-1.5 bg-gray-700/50 rounded-full cursor-pointer relative group"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                handleSeek(((e.clientX - r.left) / r.width) * totalDuration);
              }}>
              <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all"
                style={{ width: `${(currentTime / (totalDuration || 1)) * 100}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-cyan-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${(currentTime / (totalDuration || 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} />
            </div>
            {/* Before/After */}
            {beforeUrl && (
              <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50 px-2 py-1">
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer text-[10px] font-bold uppercase transition-colors ${showingBefore ? 'bg-orange-600/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
                  onClick={() => { setShowingBefore(true); if (beforeAudioRef.current) { beforeAudioRef.current.src = beforeUrl; beforeAudioRef.current.play().catch((e) => { logger.trackSwallowedError('WaveformEditor:beforePlay', e); }); } }}>
                  B <span className="font-mono text-xs">{fmt(beforeDuration)}</span>
                </div>
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer text-[10px] font-bold uppercase transition-colors ${!showingBefore ? 'bg-green-600/20 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
                  onClick={() => { setShowingBefore(false); if (beforeAudioRef.current) beforeAudioRef.current.pause(); if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch((e) => { logger.trackSwallowedError('WaveformEditor:afterPlay', e); }); setIsPlaying(true); } }}>
                  A <span className="font-mono text-xs">{fmt(totalDuration)}</span>
                </div>
                {beforeDuration > 0 && totalDuration > 0 && (
                  <span className="text-[9px] text-gray-500 font-mono">-{((1 - totalDuration / beforeDuration) * 100).toFixed(1)}%</span>
                )}
                <audio ref={beforeAudioRef} preload="metadata" />
              </div>
            )}
          </div>

          {/* ─── 줌 바 ─── */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Zoom</span>
            <input type="range" min={1} max={8} step={0.5} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-cyan-500" />
            <span className="text-xs text-gray-400 font-mono w-8">{zoom}x</span>
            {zoom > 1 && <button type="button" onClick={() => { setZoom(1); setScrollX(0); }}
              className="text-[10px] text-gray-500 hover:text-white bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">맞춤</button>}
            {selection && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-cyan-400 font-mono">{fmt(selection.start)} ~ {fmt(selection.end)} ({(selection.end - selection.start).toFixed(2)}s)</span>
                <button type="button" onClick={() => setSelection(null)}
                  className="text-[10px] text-gray-500 hover:text-red-400 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">선택 해제</button>
              </div>
            )}
          </div>

          {/* ─── 파형 캔버스 ─── */}
          <div ref={waveContainerRef}
            className="relative w-full h-48 bg-gray-950 rounded-xl border border-gray-700/50 overflow-hidden cursor-crosshair shadow-inner"
            onScroll={(e) => setScrollX((e.target as HTMLDivElement).scrollLeft)}
            onMouseDown={(e) => {
              const t = pixelToTime(e);
              dragStartRef.current = t;
              setIsDragging(true);
              setSelection(null);
            }}
            onMouseMove={(e) => {
              const t = pixelToTime(e);
              if (isDragging) {
                const s = Math.min(dragStartRef.current, t);
                const en = Math.max(dragStartRef.current, t);
                if (en - s > 0.05) setSelection({ start: s, end: en });
              } else {
                setHoverTime(t);
              }
            }}
            onMouseUp={(e) => {
              if (isDragging) {
                const t = pixelToTime(e);
                const diff = Math.abs(t - dragStartRef.current);
                if (diff < 0.05) { handleSeek(t); setSelection(null); }
                setIsDragging(false);
              }
            }}
            onMouseLeave={() => { setHoverTime(null); if (isDragging) setIsDragging(false); }}
            style={{ overflowX: zoom > 1 ? 'auto' : 'hidden' }}>
            <canvas ref={canvasRef} className="block" style={{ width: `${100 * zoom}%`, height: '100%' }} />
          </div>

          {/* ─── 미니맵 ─── */}
          <canvas ref={minimapRef}
            className="w-full rounded-lg border border-gray-800 cursor-pointer"
            style={{ height: '36px' }}
            onClick={(e) => {
              const container = waveContainerRef.current;
              if (!container) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const totalW = container.scrollWidth;
              container.scrollLeft = ratio * totalW - container.clientWidth / 2;
              handleSeek(ratio * totalDuration);
            }}
          />

          {!waveData && workingUrl && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-3 h-3 border-2 border-gray-500 border-t-cyan-400 rounded-full animate-spin" />
              파형 분석 중...
            </div>
          )}

          {/* ─── 하단: 무음 제거 + 자막 ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 무음 구간 제거 */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">무음 구간 제거</h3>
              {([
                { label: '임계값', key: 'threshold' as const, val: `${silenceConfig.threshold}dB`, min: -60, max: 0, step: 1 },
                { label: '최소 길이', key: 'minDuration' as const, val: `${silenceConfig.minDuration.toFixed(1)}s`, min: 0.1, max: 3, step: 0.1 },
                { label: '끝 간격', key: 'padding' as const, val: `${silenceConfig.padding.toFixed(2)}s`, min: 0.05, max: 1, step: 0.05 },
              ]).map((s) => (
                <div key={s.key}>
                  <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                    <span>{s.label}</span><span className="text-cyan-400 font-mono">{s.val}</span>
                  </div>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={silenceConfig[s.key]}
                    onChange={(e) => setSilenceConfig((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                    className="w-full accent-cyan-500" />
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={handleDetectSilence} disabled={isDetecting}
                  className={`flex-1 px-3 py-2 border rounded-lg text-xs font-bold ${isDetecting ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'}`}>
                  {isDetecting ? (<>감지 중...{elapsedDetect > 0 && <span className="text-[10px] text-gray-400 tabular-nums ml-1">{formatElapsed(elapsedDetect)}</span>}</>) : '감지'}
                </button>
                <button type="button" onClick={handleRemoveSilence} disabled={silenceRegions.length === 0 || isRemoving}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border shadow-md ${
                    silenceRegions.length > 0 && !isRemoving
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white border-red-400/50'
                      : 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
                  }`}>
                  {isRemoving ? (<>제거 중...{elapsedRemove > 0 && <span className="text-[10px] text-white/60 tabular-nums ml-1">{formatElapsed(elapsedRemove)}</span>}</>) : '제거'}
                </button>
              </div>
              {silenceRegions.length > 0 && (
                <p className="text-xs text-yellow-500">{silenceRegions.length}개 무음 구간 ({silenceRegions.reduce((s, r) => s + r.duration, 0).toFixed(1)}s)</p>
              )}
              <p className="text-[10px] text-gray-600">30ms constant-power crossfade 적용</p>
            </div>

            {/* 자막 목록 */}
            <div className="lg:col-span-2 bg-gray-800/50 rounded-xl border border-gray-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">자막 타임코드</h3>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded border bg-cyan-900/30 text-cyan-300 border-cyan-500/50">
                    {subtitles.length}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={autoTrack} onChange={(e) => setAutoTrack(e.target.checked)} className="accent-cyan-500" /> 추적
                </label>
              </div>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="자막 검색..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50" />
              <div ref={activeSubListRef} className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
                {filtered.length > 0 ? filtered.map((entry) => {
                  const isActive = activeSubId === entry.id;
                  const isEditing = editingLineId === entry.id;
                  return (
                    <div key={entry.id} data-sub-id={entry.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg group transition-colors ${
                        isActive ? 'bg-cyan-600/15 border border-cyan-500/30' : 'hover:bg-gray-800/60'
                      }`}>
                      <span className="text-xs font-mono bg-gray-800 text-green-400 px-1.5 py-0.5 rounded border border-gray-700 flex-shrink-0">
                        {fmt(entry.startTime)}
                      </span>
                      <span className="text-gray-600 text-xs flex-shrink-0">~</span>
                      <span className="text-xs font-mono bg-gray-800 text-blue-400 px-1.5 py-0.5 rounded border border-gray-700 flex-shrink-0">
                        {fmt(entry.endTime)}
                      </span>
                      <span className="text-xs text-gray-600 flex-shrink-0 w-9 text-right">{entry.duration.toFixed(1)}s</span>
                      {isEditing ? (
                        <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingLineId(null); }}
                          autoFocus
                          className="flex-1 bg-gray-900 border border-cyan-500 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none" />
                      ) : (
                        <span className={`text-xs flex-1 truncate ${isActive ? 'text-cyan-200 font-medium' : 'text-gray-200'}`}>
                          {entry.text}
                        </span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => { setEditingLineId(entry.id); setEditText(entry.text); }}
                          className="p-1 text-gray-500 hover:text-cyan-400 text-xs" title="편집">&#9998;</button>
                        <button type="button" onClick={() => removeLine(entry.id)}
                          className="p-1 text-gray-500 hover:text-red-400 text-xs" title="삭제">&#128465;</button>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-gray-600 text-xs text-center py-8">
                    {subtitles.length === 0 ? '타임코드 없음 — TTS를 먼저 생성하세요' : '검색 결과 없음'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── 다음 단계: 이미지/영상 ─── */}
          {lines.length > 0 && (
            <div className="border-t border-gray-700/30 pt-4">
              <button type="button" onClick={transferSoundToImageVideo}
                disabled={!workingUrl}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500
                  disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold
                  border border-blue-400/40 shadow-lg transition-all flex items-center justify-center gap-2">
                🎬 이미지/영상 생성으로 이동 ({lines.length}개 장면) →
              </button>
              {pendingEditedAudioUrl && (
                <p className="text-center text-xs text-yellow-400/80 mt-1.5">
                  무음 제거 편집이 자동으로 적용되어 반영됩니다
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WaveformEditor;
