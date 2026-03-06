import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * 미니 파형 컴포넌트 — TypecastEditor 하단 플레이어에서 사용
 * 오디오 URL을 디코딩하여 파형을 캔버스에 렌더링하고, 재생 위치를 표시
 */

interface MiniWaveformProps {
  audioUrl: string;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
}

interface WaveformPeaks {
  peaks: Float32Array;
  maxPeak: number;
}

async function decodeMiniWaveform(url: string, barCount: number): Promise<WaveformPeaks & { duration: number }> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    const ch0 = decoded.getChannelData(0);
    const spb = Math.floor(ch0.length / barCount);
    const peaks = new Float32Array(barCount);
    let maxPeak = 0;
    for (let i = 0; i < barCount; i++) {
      let pk = 0;
      const start = i * spb;
      const end = Math.min(start + spb, ch0.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(ch0[j]);
        if (abs > pk) pk = abs;
      }
      peaks[i] = pk;
      if (pk > maxPeak) maxPeak = pk;
    }
    return { peaks, maxPeak: maxPeak || 1, duration: decoded.duration };
  } finally {
    await ctx.close();
  }
}

const MiniWaveform: React.FC<MiniWaveformProps> = ({ audioUrl, currentTime, totalDuration, isPlaying, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [waveData, setWaveData] = useState<WaveformPeaks | null>(null);
  const barCountRef = useRef(120);

  // 오디오 디코딩
  useEffect(() => {
    if (!audioUrl) { setWaveData(null); return; }
    let cancelled = false;
    decodeMiniWaveform(audioUrl, barCountRef.current)
      .then((d) => { if (!cancelled) setWaveData({ peaks: d.peaks, maxPeak: d.maxPeak }); })
      .catch((err) => { console.warn('[MiniWaveform] 디코딩 실패:', err); if (!cancelled) setWaveData(null); });
    return () => { cancelled = true; };
  }, [audioUrl]);

  // 캔버스 렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    // 배경
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    if (!waveData) {
      // 파형 데이터 미로드 시 플레이스홀더 바
      const placeholderBars = barCountRef.current;
      const barW = W / placeholderBars;
      const gap = Math.max(0.5, barW * 0.15);
      for (let i = 0; i < placeholderBars; i++) {
        const x = i * barW;
        const h = 2 + Math.random() * 4;
        ctx.fillStyle = 'rgba(107, 114, 128, 0.4)';
        ctx.fillRect(x + gap / 2, (H - h) / 2, barW - gap, h);
      }
      return;
    }

    const { peaks, maxPeak } = waveData;
    const barCount = peaks.length;
    const barW = W / barCount;
    const gap = Math.max(0.5, barW * 0.15);
    const playRatio = totalDuration > 0 ? currentTime / totalDuration : 0;
    const playBarIndex = Math.floor(playRatio * barCount);

    for (let i = 0; i < barCount; i++) {
      const x = i * barW;
      const normalized = peaks[i] / maxPeak;
      const h = Math.max(2, normalized * (H - 4));

      if (i < playBarIndex) {
        // 재생 완료 구간: 밝은 시안/보라 그라디언트
        const t = i / barCount;
        const r = Math.round(56 + t * 100);
        const g = Math.round(189 - t * 60);
        const b = Math.round(248);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      } else if (i === playBarIndex) {
        // 현재 재생 위치: 밝은 흰색
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      } else {
        // 미재생 구간: 어두운 회색
        ctx.fillStyle = 'rgba(107, 114, 128, 0.45)';
      }

      ctx.fillRect(x + gap / 2, (H - h) / 2, barW - gap, h);
    }

    // 재생 위치 라인
    if (totalDuration > 0 && (isPlaying || currentTime > 0)) {
      const px = playRatio * W;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(px - 0.5, 0, 1, H);
    }
  }, [waveData, currentTime, totalDuration, isPlaying]);

  // 클릭으로 탐색
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(totalDuration, ratio * totalDuration)));
  }, [onSeek, totalDuration]);

  return (
    <div ref={containerRef} className="px-4 pt-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-sm cursor-pointer"
        style={{ height: '28px' }}
        onClick={handleClick}
      />
    </div>
  );
};

export default MiniWaveform;
