/**
 * WebCodecs 기반 MP4 렌더링 파이프라인 — 오케스트레이터
 *
 * composeMp4(options) → Blob
 * - WebCodecs 지원 시: GPU H.264 인코딩 (3-5배 빠름)
 * - 미지원 시: FFmpeg WASM 자동 폴백
 */

import type {
  UnifiedSceneTiming,
  SubtitleStyle,
  BgmConfig,
  ExportProgress,
  SceneTransitionConfig,
  LoudnessNormConfig,
} from '../../types';
import { probeVideoEncoder, createEncoder, type EncodedChunk } from './videoEncoder';
import { renderAllFrames, computeTotalDuration, type VideoFrameExtractor } from './canvasRenderer';
import { mixAudio, encodeAudioAAC } from './audioMixer';
import { createMp4Muxer } from './mp4Muxer';
import { OVERSCALE } from './kenBurnsEngine';

// Re-export downloadMp4 from ffmpegService for backward compat
export { downloadMp4 } from '../ffmpegService';

/** composeMp4와 동일한 인터페이스 */
export interface ComposeMp4Options {
  timeline: UnifiedSceneTiming[];
  scenes: { id: string; imageUrl?: string; videoUrl?: string }[];
  narrationLines: { sceneId?: string; audioUrl?: string; startTime?: number }[];
  subtitleStyle?: SubtitleStyle | null;
  bgmConfig?: BgmConfig;
  loudnessNorm?: LoudnessNormConfig;
  sceneTransitions?: Record<string, SceneTransitionConfig>;
  fps?: number;
  width?: number;
  height?: number;
  videoBitrateMbps?: number; // 비트레이트 (Mbps, 기본 20)
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

// ─── 진행률 가중치 ─────────────────────────────────
const PHASE_WEIGHTS = {
  initializing: 5,
  composing: 65,
  encoding: 15,
  done: 15,
};

/**
 * WebCodecs 지원 여부 확인
 */
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof AudioContext !== 'undefined'
  );
}

/**
 * MP4 렌더링 메인 함수
 * WebCodecs 지원 시 GPU 인코딩, 미지원 시 FFmpeg WASM 폴백
 */
export async function composeMp4(options: ComposeMp4Options): Promise<Blob> {
  // [FIX #82] 렌더링 시작 전 메모리 압력 체크 — 임계값 강화
  const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (perfMem) {
    const usedMB = Math.round(perfMem.usedJSHeapSize / 1024 / 1024);
    const allocatedMB = Math.round((perfMem.totalJSHeapSize || perfMem.usedJSHeapSize) / 1024 / 1024);
    const limitMB = Math.round(perfMem.jsHeapSizeLimit / 1024 / 1024);
    const usageRatio = perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit;
    // 할당된 힙 대비 사용률 (GC로 회수 불가능한 실제 메모리 압력)
    const allocatedRatio = perfMem.totalJSHeapSize
      ? perfMem.usedJSHeapSize / perfMem.totalJSHeapSize
      : usageRatio;
    console.log(`[WebCodecs] 메모리 상태: ${usedMB}MB / ${allocatedMB}MB (할당) / ${limitMB}MB (한계) — 사용률 ${Math.round(usageRatio * 100)}%`);

    // 메모리 부족 조건:
    // 1. 힙 한계 대비 75% 초과 (이전: 90%)
    // 2. 할당 힙 대비 95% 초과 (GC 여유 부족)
    // 3. 사용 메모리 1GB 이상이면서 여유가 500MB 미만
    const remainingMB = limitMB - usedMB;
    if (usageRatio > 0.75 || allocatedRatio > 0.95 || (usedMB > 1024 && remainingMB < 500)) {
      const reason = usageRatio > 0.75
        ? `힙 한계 대비 ${Math.round(usageRatio * 100)}%`
        : allocatedRatio > 0.95
        ? `할당 힙 대비 ${Math.round(allocatedRatio * 100)}%`
        : `여유 메모리 ${remainingMB}MB`;
      console.warn(`[WebCodecs] 메모리 부족 (${reason}) — 경량 모드로 전환`);

      // 메모리가 매우 부족하면 FFmpeg도 위험 → 사전 경고 후 진행
      if (usageRatio > 0.85 || remainingMB < 300) {
        options.onProgress?.({
          phase: 'initializing',
          percent: 0,
          message: '메모리가 부족합니다. 다른 탭을 닫고 다시 시도해주세요.',
        });
        throw new Error(
          '메모리가 부족하여 내보내기를 진행할 수 없습니다. ' +
          `현재 ${usedMB}MB 사용 중 (한계: ${limitMB}MB). ` +
          '다른 탭을 닫거나 페이지를 새로고침한 후 다시 시도해주세요.'
        );
      }

      const ffmpeg = await import('../ffmpegService');
      return ffmpeg.composeMp4(options);
    }
  }

  // 1. WebCodecs 지원 확인
  if (!isWebCodecsSupported()) {
    console.log('[WebCodecs] 미지원 브라우저 → FFmpeg WASM 폴백');
    const ffmpeg = await import('../ffmpegService');
    return ffmpeg.composeMp4(options);
  }

  const {
    timeline,
    scenes,
    narrationLines,
    subtitleStyle,
    bgmConfig,
    loudnessNorm,
    sceneTransitions,
    fps = 30,
    width = 1920,
    height = 1080,
    videoBitrateMbps = 20,
    onProgress,
    signal,
  } = options;

  const startTime = performance.now();

  function emitProgress(phase: ExportProgress['phase'], phasePercent: number, message: string): void {
    const weights: Record<string, number> = PHASE_WEIGHTS;
    let basePercent = 0;
    for (const [key, weight] of Object.entries(weights)) {
      if (key === phase) break;
      basePercent += weight;
    }
    const phaseWeight = weights[phase] || 0;
    const globalPct = Math.min(100, basePercent + (phasePercent / 100) * phaseWeight);
    const elapsedSec = (performance.now() - startTime) / 1000;
    const etaSec = globalPct > 0 ? (elapsedSec / globalPct) * (100 - globalPct) : 0;

    onProgress?.({
      phase,
      percent: Math.round(globalPct),
      message,
      elapsedSec: Math.round(elapsedSec),
      etaSec: Math.round(etaSec),
    });
  }

  function checkAbort(): void {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  }

  try {
    // ─── Phase 1: 에셋 프리로드 ─────────────────────
    emitProgress('initializing', 0, '에셋 로딩 중...');

    // VideoEncoder 설정 확인
    const encoderProbe = await probeVideoEncoder(width, height);
    if (!encoderProbe) {
      console.log('[WebCodecs] H.264 인코더 미지원 → FFmpeg WASM 폴백');
      const ffmpeg = await import('../ffmpegService');
      return ffmpeg.composeMp4(options);
    }

    checkAbort();

    // 이미지 → ImageBitmap 병렬 로드
    const imageBitmaps = new Map<string, ImageBitmap>();
    const videoFrameExtractors = new Map<string, VideoFrameExtractor>();

    const assetPromises: Promise<void>[] = [];
    for (const scene of scenes) {
      if (scene.imageUrl && !scene.videoUrl) {
        assetPromises.push(
          loadImageBitmap(scene.imageUrl, width, height).then(bmp => {
            if (bmp) imageBitmaps.set(scene.id, bmp);
          }),
        );
      }
      // 비디오 장면: 프레임 추출기 생성
      if (scene.videoUrl) {
        assetPromises.push(
          createVideoExtractor(scene.videoUrl).then(extractor => {
            if (extractor) videoFrameExtractors.set(scene.id, extractor);
          }),
        );
      }
    }

    await Promise.all(assetPromises);
    checkAbort();

    emitProgress('initializing', 100, '에셋 로드 완료');

    // ─── Phase 2+3: 비디오 파이프라인 + Phase 4: 오디오 파이프라인 (병렬!) ─────

    const totalDuration = computeTotalDuration(timeline, sceneTransitions);

    // 나레이션 타이밍을 전환 오버랩 반영 렌더 타임으로 조정
    const adjustedNarrationLines = adjustNarrationTimes(narrationLines, timeline, sceneTransitions);

    // 비디오 인코딩 + 오디오 믹싱 동시 시작
    const videoChunks: EncodedChunk[] = [];

    const videoPromise = (async () => {
      emitProgress('composing', 0, '비디오 렌더링 중...');

      // VideoEncoder 생성
      const { encoder, encodeFrame, flush } = createEncoder(
        { width, height, fps, bitrate: videoBitrateMbps * 1_000_000 },
        encoderProbe.codec,
        encoderProbe.hardwareAcceleration,
        (chunk) => videoChunks.push(chunk),
        (err) => console.error('[VideoEncoder]', err),
      );

      // 전체 프레임 렌더링 + 인코딩
      await renderAllFrames(
        {
          width,
          height,
          fps,
          timeline,
          imageBitmaps,
          videoFrameExtractors,
          subtitleStyle,
          sceneTransitions,
        },
        (canvas, frameIndex) => {
          encodeFrame(canvas, frameIndex);
        },
        signal,
        (percent) => {
          emitProgress('composing', percent, `비디오 렌더링: ${Math.round(percent)}%`);
        },
      );

      await flush();
      encoder.close();
    })();

    // 오디오 파이프라인 (병렬 실행)
    const audioChunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }> = [];
    let audioBuffer: AudioBuffer | null = null;

    const audioPromise = (async () => {
      emitProgress('encoding', 0, '오디오 믹싱 중...');

      audioBuffer = await mixAudio(
        {
          timeline,
          narrationLines: adjustedNarrationLines,
          bgmConfig,
          loudnessNorm,
          totalDuration,
        },
        signal,
        (p) => {
          emitProgress('encoding', p * 0.7, `오디오 믹싱: ${Math.round(p)}%`);
        },
      );

      if (audioBuffer) {
        // AAC 인코딩
        await encodeAudioAAC(audioBuffer, (chunk, meta) => {
          audioChunks.push({ chunk, meta });
        });
        emitProgress('encoding', 100, '오디오 인코딩 완료');
      }
    })();

    // 비디오 + 오디오 병렬 완료 대기
    await Promise.all([videoPromise, audioPromise]);
    checkAbort();

    // ─── Phase 5: MP4 먹싱 ─────────────────────
    // [FIX #127 #130] 인코딩된 프레임이 없으면 muxer 진입 전 즉시 실패
    if (videoChunks.length === 0) {
      throw new Error('영상 인코딩 실패: 프레임이 생성되지 않았습니다. 다른 탭을 닫고 다시 시도해주세요.');
    }

    emitProgress('done', 0, 'MP4 생성 중...');

    const muxer = createMp4Muxer({
      width,
      height,
      fps,
      hasAudio: audioChunks.length > 0,
      audioSampleRate: audioBuffer?.sampleRate ?? 48000,
      audioChannels: audioBuffer?.numberOfChannels ?? 2,
    });

    // 비디오 청크 추가
    for (const vc of videoChunks) {
      muxer.addVideoChunk(vc);
    }

    // 오디오 청크 추가
    for (const ac of audioChunks) {
      muxer.addAudioChunk(ac.chunk, ac.meta);
    }

    const blob = muxer.finalize();

    // ImageBitmap 정리
    for (const bmp of imageBitmaps.values()) {
      bmp.close();
    }

    const totalElapsed = Math.round((performance.now() - startTime) / 1000);
    emitProgress('done', 100, '완료!');
    onProgress?.({
      phase: 'done',
      percent: 100,
      message: '완료!',
      elapsedSec: totalElapsed,
      etaSec: 0,
    });

    return blob;
  } catch (err) {
    // AbortError는 재throw
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }

    // 기타 에러 → FFmpeg WASM 폴백
    console.error('[WebCodecs] 렌더링 실패, FFmpeg 폴백:', err);
    const ffmpeg = await import('../ffmpegService');
    return ffmpeg.composeMp4(options);
  }
}

// ─── 에셋 로더 ─────────────────────────────────────

/** URL에서 ImageBitmap 로드 (Ken Burns용 OVERSCALE 적용) */
async function loadImageBitmap(
  url: string,
  canvasW: number,
  canvasH: number,
): Promise<ImageBitmap | null> {
  try {
    let blob: Blob;
    if (url.startsWith('data:')) {
      const resp = await fetch(url);
      blob = await resp.blob();
    } else if (url.startsWith('blob:')) {
      const resp = await fetch(url);
      blob = await resp.blob();
    } else {
      const resp = await fetch(url);
      blob = await resp.blob();
    }

    return createImageBitmap(blob, {
      resizeWidth: Math.round(canvasW * OVERSCALE),
      resizeHeight: Math.round(canvasH * OVERSCALE),
      resizeQuality: 'high',
    });
  } catch (e) {
    console.warn('[WebCodecs] 이미지 로드 실패:', url, e);
    return null;
  }
}

/** 비디오 URL → VideoFrameExtractor 생성 */
async function createVideoExtractor(url: string): Promise<VideoFrameExtractor | null> {
  try {
    // [FIX #149] 외부 URL → blob URL 변환 (CORS 문제 회피)
    let videoSrc = url;
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          videoSrc = URL.createObjectURL(blob);
        }
      } catch {
        // CORS fetch 실패 → Cloudinary 프록시 시도
        try {
          const { uploadRemoteUrlToCloudinary } = await import('../uploadService');
          const proxyUrl = await uploadRemoteUrlToCloudinary(url);
          const proxyRes = await fetch(proxyUrl);
          if (proxyRes.ok) {
            const blob = await proxyRes.blob();
            videoSrc = URL.createObjectURL(blob);
          }
        } catch {
          // 프록시도 실패 → 원본 URL로 시도
        }
      }
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoSrc;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video load failed'));
      setTimeout(() => reject(new Error('Video load timeout')), 15000); // [FIX #149] 타임아웃 10→15초
    });

    return {
      duration: video.duration,
      async getFrameAt(timeSec: number): Promise<ImageBitmap> {
        video.currentTime = timeSec;
        // [FIX #44] onseeked에 타임아웃 추가 — 무한 대기 방지 (5초)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            video.onseeked = null;
            reject(new Error(`Video seek timeout at ${timeSec.toFixed(2)}s`));
          }, 5000);
          video.onseeked = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        return createImageBitmap(video);
      },
    };
  } catch (e) {
    console.warn('[WebCodecs] 비디오 추출기 생성 실패:', url, e);
    return null;
  }
}

/**
 * 나레이션 startTime을 전환 오버랩 반영한 렌더 타임으로 조정
 * useUnifiedTimeline의 cumulative time → 전환 오버랩 차감된 render time
 */
function adjustNarrationTimes(
  narrationLines: { sceneId?: string; audioUrl?: string; startTime?: number }[],
  timeline: UnifiedSceneTiming[],
  sceneTransitions?: Record<string, SceneTransitionConfig>,
): { sceneId?: string; audioUrl?: string; startTime?: number }[] {
  if (timeline.length <= 1) return narrationLines;

  // sceneStarts 계산 (canvasRenderer.resolveFrame과 동일 로직 — 전환 유무와 무관하게 항상 수행)
  const sceneStarts: number[] = [0];
  for (let i = 0; i < timeline.length - 1; i++) {
    const trans = sceneTransitions?.[timeline[i].sceneId];
    const transDur = (trans && trans.preset !== 'none') ? trans.duration : 0;
    sceneStarts.push(sceneStarts[i] + timeline[i].imageDuration - transDur);
  }

  return narrationLines.map(line => {
    if (line.startTime == null) return line;

    // sceneId로 장면 찾기
    let sceneIndex = -1;
    if (line.sceneId) {
      sceneIndex = timeline.findIndex(t => t.sceneId === line.sceneId);
    }

    // sceneId 매칭 실패 시 시간 기반으로 찾기
    if (sceneIndex < 0) {
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (line.startTime >= timeline[i].imageStartTime) {
          sceneIndex = i;
          break;
        }
      }
    }

    if (sceneIndex < 0) return line;

    // 조정: renderTime = sceneStarts[i] + (cumulativeTime - imageStartTime)
    const offset = timeline[sceneIndex].imageStartTime - sceneStarts[sceneIndex];
    if (offset === 0) return line;

    return { ...line, startTime: Math.max(0, line.startTime - offset) };
  });
}
