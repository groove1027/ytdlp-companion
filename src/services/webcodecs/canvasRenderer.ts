/**
 * Canvas Renderer — OffscreenCanvas 프레임 렌더러
 * Ken Burns + 전환 + 자막을 단일 파이프라인으로 통합
 */

import type {
  UnifiedSceneTiming,
  SubtitleStyle,
  SceneTransitionConfig,
  EffectPresetId,
} from '../../types';
import { computeKenBurns, drawKenBurnsFrame, OVERSCALE } from './kenBurnsEngine';
import { renderTransition } from './transitionEngine';
import { drawSubtitle } from './subtitleRenderer';
import { logger } from '../LoggerService';

export interface CanvasRendererConfig {
  width: number;
  height: number;
  fps: number;
  timeline: UnifiedSceneTiming[];
  /** sceneId → ImageBitmap (이미지 장면용) */
  imageBitmaps: Map<string, ImageBitmap>;
  /** sceneId → HTMLVideoElement 대신 프레임 추출 함수 (비디오 장면용) */
  videoFrameExtractors: Map<string, VideoFrameExtractor>;
  subtitleStyle?: SubtitleStyle | null;
  sceneTransitions?: Record<string, SceneTransitionConfig>;
}

/** 비디오 장면에서 특정 시간의 프레임을 추출하는 인터페이스 */
export interface VideoFrameExtractor {
  getFrameAt(timeSec: number): Promise<ImageBitmap>;
  duration: number;
  /** 리소스 해제 (디코더 종료 + 캐시 정리) */
  dispose?(): void;
}

interface FrameInfo {
  /** 현재 프레임이 속하는 장면 인덱스 */
  sceneIndex: number;
  /** 장면 내 로컬 시간 (초) */
  localTime: number;
  /** 전환 구간인 경우: 전환 progress 0..1, 아니면 null */
  transitionProgress: number | null;
  /** 전환 구간인 경우: 이전 장면 인덱스 */
  prevSceneIndex: number | null;
  /** 현재 자막 텍스트 (없으면 null) */
  subtitleText: string | null;
}

/**
 * 전체 타임라인의 프레임을 순차적으로 렌더링
 * 제너레이터 패턴: 각 프레임을 캔버스에 그리고 콜백 호출
 */
export async function renderAllFrames(
  config: CanvasRendererConfig,
  onFrame: (canvas: OffscreenCanvas, frameIndex: number) => void,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<number> {
  const { width, height, fps, timeline, imageBitmaps, videoFrameExtractors, subtitleStyle, sceneTransitions } = config;

  // 전체 영상 길이 계산
  const totalDuration = computeTotalDuration(timeline, sceneTransitions);
  const totalFrames = Math.ceil(totalDuration * fps);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // 전환 프레임용 보조 캔버스
  const auxCanvas = new OffscreenCanvas(width, height);
  const auxCtx = auxCanvas.getContext('2d')!;

  // [FIX #44] 프레임별 타임아웃 — 단일 프레임이 30초 이상 걸리면 중단
  const PER_FRAME_TIMEOUT_MS = 30_000;
  // [FIX #44/#493] 전체 렌더링 타임아웃 — 영상 길이에 비례 (최소 10분, 장면당 3초 여유)
  // 132장면(~6분 영상) → 약 20분 타임아웃 허용
  const TOTAL_RENDER_TIMEOUT_MS = Math.max(600_000, Math.ceil(totalDuration) * 3_000);
  const renderStartTime = performance.now();

  // [FIX #297] sceneStarts 사전 계산 — 매 프레임 O(scenes) 재계산 제거
  const precomputedSceneStarts = precomputeSceneStarts(timeline, sceneTransitions);

  // [FIX #297] 실패한 비디오 장면 추적 — 연속 실패 시 해당 장면 전체 스킵
  const failedVideoScenes = new Set<string>();

  for (let f = 0; f < totalFrames; f++) {
    // AbortSignal 체크 (매 30프레임마다 = ~1초)
    if (f % fps === 0 && signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // [FIX #44] 전체 렌더링 시간 초과 체크 (매 초)
    if (f % fps === 0) {
      const elapsed = performance.now() - renderStartTime;
      if (elapsed > TOTAL_RENDER_TIMEOUT_MS) {
        throw new Error(`비디오 렌더링 시간 초과: ${Math.round(elapsed / 1000)}초 경과 (프레임 ${f}/${totalFrames}). 장면 수를 줄이거나 해상도를 낮춰주세요.`);
      }
      // [FIX #44] 메모리 압력 체크 (performance.memory API, Chrome만)
      const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (perfMem && perfMem.usedJSHeapSize > perfMem.jsHeapSizeLimit * 0.92) {
        throw new Error(`메모리 부족: 힙 사용량 ${Math.round(perfMem.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(perfMem.jsHeapSizeLimit / 1024 / 1024)}MB. 장면 수를 줄이거나 불필요한 탭을 닫아주세요.`);
      }
    }

    const timeSec = f / fps;
    const frameInfo = resolveFrame(timeSec, timeline, sceneTransitions, precomputedSceneStarts);

    ctx.clearRect(0, 0, width, height);

    if (frameInfo.transitionProgress != null && frameInfo.prevSceneIndex != null) {
      // 전환 구간: 이전 장면과 현재 장면을 각각 렌더링 후 블렌딩
      const prevTiming = timeline[frameInfo.prevSceneIndex];
      const currTiming = timeline[frameInfo.sceneIndex];
      const transConfig = sceneTransitions?.[prevTiming.sceneId];
      const transDur = transConfig?.duration ?? 0.5;

      // ★ 이전 장면의 로컬 시간 계산 (수정됨)
      // 이전 장면은 끝에서 transDur만큼 겹침 → 전환 시작 시 prevLocalTime = prevDur - transDur
      // 전환 진행에 따라 prevLocalTime = prevDur - transDur + frameInfo.localTime
      const prevLocalTime = prevTiming.imageDuration - transDur + frameInfo.localTime;
      await renderSceneFrame(auxCtx, prevTiming, Math.max(0, prevLocalTime), imageBitmaps, videoFrameExtractors, width, height, fps, failedVideoScenes);
      const prevFrame = await createImageBitmap(auxCanvas);

      // 현재 장면 프레임
      const currLocalTime = frameInfo.localTime;
      await renderSceneFrame(ctx, currTiming, currLocalTime, imageBitmaps, videoFrameExtractors, width, height, fps, failedVideoScenes);
      const currFrame = await createImageBitmap(canvas);

      // 전환 블렌딩
      ctx.clearRect(0, 0, width, height);
      renderTransition(
        ctx,
        prevFrame,
        currFrame,
        frameInfo.transitionProgress,
        transConfig?.preset ?? 'fade',
      );

      prevFrame.close();
      currFrame.close();

      // 전환 구간 자막: progress < 0.5이면 이전 장면 자막, 아니면 현재 장면 자막
      const transSubText = frameInfo.transitionProgress < 0.5
        ? findSubtitle(prevTiming, prevLocalTime, prevTiming.imageStartTime)
        : frameInfo.subtitleText;
      if (transSubText && subtitleStyle?.template) {
        drawSubtitle(ctx, transSubText, subtitleStyle.template, width, height);
      }
    } else {
      // 일반 장면 프레임
      const timing = timeline[frameInfo.sceneIndex];
      await renderSceneFrame(ctx, timing, frameInfo.localTime, imageBitmaps, videoFrameExtractors, width, height, fps, failedVideoScenes);

      // 자막 렌더링
      if (frameInfo.subtitleText && subtitleStyle?.template) {
        drawSubtitle(ctx, frameInfo.subtitleText, subtitleStyle.template, width, height);
      }
    }

    onFrame(canvas, f);

    // 진행률
    if (f % 30 === 0) {
      onProgress?.((f / totalFrames) * 100);
    }
  }

  onProgress?.(100);
  return totalFrames;
}

/**
 * 전체 영상 총 재생 시간 계산 (전환 오버랩 고려)
 */
export function computeTotalDuration(
  timeline: UnifiedSceneTiming[],
  sceneTransitions?: Record<string, SceneTransitionConfig>,
): number {
  if (timeline.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < timeline.length; i++) {
    total += timeline[i].imageDuration;
  }

  // 전환 오버랩 차감
  if (sceneTransitions) {
    for (let i = 0; i < timeline.length - 1; i++) {
      const trans = sceneTransitions[timeline[i].sceneId];
      if (trans && trans.preset !== 'none') {
        total -= trans.duration;
      }
    }
  }

  return Math.max(0, total);
}

// ─── 내부 헬퍼 ─────────────────────────────────────

/** [FIX #297] sceneStarts 사전 계산 — 루프 밖에서 1회만 호출 */
function precomputeSceneStarts(
  timeline: UnifiedSceneTiming[],
  sceneTransitions?: Record<string, SceneTransitionConfig>,
): number[] {
  const sceneStarts: number[] = [0];
  for (let i = 0; i < timeline.length - 1; i++) {
    const transDur = getNextTransDur(i, timeline, sceneTransitions);
    sceneStarts.push(sceneStarts[i] + timeline[i].imageDuration - transDur);
  }
  return sceneStarts;
}

/** 전역 시간 → 장면/전환/자막 정보 매핑 */
function resolveFrame(
  timeSec: number,
  timeline: UnifiedSceneTiming[],
  sceneTransitions?: Record<string, SceneTransitionConfig>,
  sceneStarts?: number[],
): FrameInfo {
  if (timeline.length === 0) {
    return { sceneIndex: 0, localTime: 0, transitionProgress: null, prevSceneIndex: null, subtitleText: null };
  }

  // [FIX #297] 사전 계산된 sceneStarts 사용, 없으면 기존 로직 (하위 호환)
  if (!sceneStarts) {
    sceneStarts = precomputeSceneStarts(timeline, sceneTransitions);
  }

  // 2. 전환 구간 우선 검사
  for (let i = 0; i < timeline.length - 1; i++) {
    const transDur = getNextTransDur(i, timeline, sceneTransitions);
    if (transDur <= 0) continue;

    const transStart = sceneStarts[i + 1]; // 다음 장면 시작 = 전환 시작
    const transEnd = transStart + transDur;

    if (timeSec >= transStart && timeSec < transEnd) {
      const progress = (timeSec - transStart) / transDur;
      const localTime = timeSec - transStart;
      const nextTiming = timeline[i + 1];

      return {
        sceneIndex: i + 1,
        localTime,
        transitionProgress: Math.max(0, Math.min(1, progress)),
        prevSceneIndex: i,
        subtitleText: findSubtitle(nextTiming, localTime, nextTiming.imageStartTime),
      };
    }
  }

  // 3. 일반 장면 구간
  for (let i = 0; i < timeline.length; i++) {
    const sceneEnd = sceneStarts[i] + timeline[i].imageDuration;
    if (timeSec < sceneEnd || i === timeline.length - 1) {
      const localTime = Math.max(0, timeSec - sceneStarts[i]);
      return {
        sceneIndex: i,
        localTime,
        transitionProgress: null,
        prevSceneIndex: null,
        subtitleText: findSubtitle(timeline[i], localTime, timeline[i].imageStartTime),
      };
    }
  }

  // 폴백: 마지막 장면
  const last = timeline[timeline.length - 1];
  return {
    sceneIndex: timeline.length - 1,
    localTime: last.imageDuration,
    transitionProgress: null,
    prevSceneIndex: null,
    subtitleText: null,
  };
}

function getNextTransDur(
  i: number,
  timeline: UnifiedSceneTiming[],
  sceneTransitions?: Record<string, SceneTransitionConfig>,
): number {
  if (!sceneTransitions || i >= timeline.length - 1) return 0;
  const trans = sceneTransitions[timeline[i].sceneId];
  if (trans && trans.preset !== 'none') return trans.duration;
  return 0;
}

/** 특정 장면 로컬 시간에 해당하는 자막 텍스트 찾기 */
function findSubtitle(
  timing: UnifiedSceneTiming,
  localTime: number,
  sceneGlobalStart: number,
): string | null {
  if (!timing.subtitleSegments?.length) return null;

  const globalTime = sceneGlobalStart + localTime;
  for (const seg of timing.subtitleSegments) {
    if (globalTime >= seg.startTime && globalTime <= seg.endTime) {
      return seg.text;
    }
  }
  return null;
}

/** panZoom 프리셋 → CSS filter 매핑 (프리뷰와 1:1 매칭) */
const PRESET_FILTERS: Record<string, string> = {
  vintage: 'sepia(0.15)',
  noir: 'grayscale(0.6) contrast(1.2)',
};

/** motionEffect → CSS filter 매핑 */
const MOTION_FILTERS: Record<string, string> = {
  film: 'sepia(0.35) contrast(1.15) brightness(0.95)',
  sepia: 'sepia(0.65)',
  'high-contrast': 'contrast(1.4) saturate(1.2)',
  'multi-bright': 'brightness(1.3) saturate(1.3)',
  rain: 'brightness(0.85) saturate(0.7) contrast(1.1)',
  'vintage-style': 'sepia(0.3) contrast(1.1) saturate(0.8)',
};

/** 단일 장면 프레임을 캔버스에 렌더 (Ken Burns + motionEffect + CSS filter + 비디오) */
async function renderSceneFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  timing: UnifiedSceneTiming,
  localTime: number,
  imageBitmaps: Map<string, ImageBitmap>,
  videoFrameExtractors: Map<string, VideoFrameExtractor>,
  canvasW: number,
  canvasH: number,
  fps: number = 30,
  failedVideoScenes?: Set<string>,
): Promise<void> {
  const bitmap = imageBitmaps.get(timing.sceneId);
  const videoExtractor = videoFrameExtractors.get(timing.sceneId);

  if (bitmap) {
    // CSS filter 적용 (panZoom + motionEffect)
    const filters: string[] = [];
    const pzFilter = PRESET_FILTERS[timing.effectPreset];
    if (pzFilter) filters.push(pzFilter);
    const moFilter = timing.motionEffect ? MOTION_FILTERS[timing.motionEffect] : undefined;
    if (moFilter) filters.push(moFilter);
    if (filters.length > 0) ctx.filter = filters.join(' ');

    // 이미지 장면: Ken Burns 효과 (panZoom)
    const totalFrames = Math.ceil(timing.imageDuration * fps);
    const frameN = Math.min(Math.floor(localTime * fps), totalFrames - 1);

    const panZoomTransform = computeKenBurns(
      (timing.effectPreset || 'smooth') as EffectPresetId,
      Math.max(0, frameN),
      totalFrames,
      canvasW,
      canvasH,
      timing.anchorX ?? 50,
      timing.anchorY ?? 50,
      fps,
    );

    // motionEffect 트랜스폼 합성 (있으면)
    const motionEffect = timing.motionEffect;
    if (motionEffect && motionEffect !== 'none' && motionEffect !== 'static') {
      const motionTransform = computeKenBurns(
        motionEffect,
        Math.max(0, frameN),
        totalFrames,
        canvasW,
        canvasH,
        timing.anchorX ?? 50,
        timing.anchorY ?? 50,
        fps,
      );
      // CSS 다중 animation 합성: 스케일 곱, 이동 합, 회전 합
      panZoomTransform.scale *= motionTransform.scale;
      panZoomTransform.translateX += motionTransform.translateX;
      panZoomTransform.translateY += motionTransform.translateY;
      panZoomTransform.rotate += motionTransform.rotate;
    }

    drawKenBurnsFrame(ctx, bitmap, panZoomTransform, canvasW, canvasH, timing.anchorX ?? 50, timing.anchorY ?? 50);

    // filter 초기화
    if (filters.length > 0) ctx.filter = 'none';
  } else if (videoExtractor) {
    // [FIX #297] 이미 실패 확정된 비디오 장면은 즉시 검은 화면 (30초 대기 제거)
    if (failedVideoScenes?.has(timing.sceneId)) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
      // 비디오 장면: 현재 시간의 프레임을 추출하여 그리기
      // [FIX #297] 외부 타임아웃을 35초로 — 내부 적응형 타임아웃(videoDecoder)이 먼저 반응하도록
      try {
        const frameBitmap = await Promise.race([
          videoExtractor.getFrameAt((timing.videoTrimStartSec ?? 0) + localTime),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error(`Frame extraction timeout at ${localTime.toFixed(2)}s`)), 35_000)
          ),
        ]);
        if (frameBitmap) {
          const scale = Math.max(canvasW / frameBitmap.width, canvasH / frameBitmap.height);
          const dw = frameBitmap.width * scale;
          const dh = frameBitmap.height * scale;
          ctx.drawImage(frameBitmap, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
          frameBitmap.close();
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvasW, canvasH);
        }
      } catch (e) {
        logger.trackSwallowedError('canvasRenderer:extractFrame', e);
        // [FIX #297] 디코더 연속 실패 시 해당 장면 전체를 실패로 마킹
        const errMsg = e instanceof Error ? e.message : '';
        if (errMsg.includes('연속') && errMsg.includes('실패') || errMsg.includes('추가 시도 중단')) {
          failedVideoScenes?.add(timing.sceneId);
          console.warn(`[canvasRenderer] 비디오 장면 "${timing.sceneId}" 디코더 포기 — 나머지 프레임 스킵`);
        }
        // 프레임 추출 실패 시 검은 화면으로 대체 (렌더링 중단하지 않음)
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
    }
  } else {
    // 에셋 없음: 검은 화면
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
}
