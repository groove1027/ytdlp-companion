/**
 * sceneDetection.ts
 *
 * WebCodecs/Canvas 기반 씬 감지 서비스
 * 다운로드된 영상 Blob에서 실제 컷 전환 지점을 감지합니다.
 *
 * AI 타임코드 (WHAT) + 씬 감지 (WHEN) = 정확한 편집점
 *
 * v2.0: FPS 자동 감지 + 100ms 샘플링 + 160×90 해상도 + 적응형 threshold + ±200ms 스냅
 */

import type { RationalFps } from '../types';
import { logger } from './LoggerService';
import { getSceneDetectionSamplingPlan } from './videoSamplingPlan';

// ──────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────

export interface SceneCut {
  timeSec: number;
  score: number;
}

export interface SceneDetectionOptions {
  /** 프레임 비교 간격 (초). 기본: 영상 길이에 따라 자동 결정 (v2: 0.1~0.2초) */
  intervalSec?: number;
  /** 씬 컷 감지 임계값 (0-255). 기본: 적응형 (자동 계산) */
  threshold?: number;
  /** 최대 분석 프레임 수. 기본: 600 */
  maxFrames?: number;
  /** 진행 콜백 */
  onProgress?: (current: number, total: number) => void;
}

// ──────────────────────────────────────────────
// 표준 FPS 목록 (스냅용)
// ──────────────────────────────────────────────

const STANDARD_FPS_TABLE: { display: number; num: number; den: number }[] = [
  { display: 23.976, num: 24000, den: 1001 },
  { display: 24,     num: 24,    den: 1 },
  { display: 25,     num: 25,    den: 1 },
  { display: 29.97,  num: 30000, den: 1001 },
  { display: 30,     num: 30,    den: 1 },
  { display: 50,     num: 50,    den: 1 },
  { display: 59.94,  num: 60000, den: 1001 },
  { display: 60,     num: 60,    den: 1 },
];

/**
 * 실측 FPS를 가장 가까운 표준 FPS로 스냅
 */
function snapToStandardFps(raw: number): RationalFps {
  let best = STANDARD_FPS_TABLE[4]; // 30fps fallback
  let bestDist = Infinity;
  for (const entry of STANDARD_FPS_TABLE) {
    const dist = Math.abs(raw - entry.display);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return { num: best.num, den: best.den, display: best.display };
}

// ──────────────────────────────────────────────
// FPS 감지 API
// ──────────────────────────────────────────────

/**
 * 영상의 실제 FPS를 감지합니다.
 *
 * 방법:
 * 1순위: requestVideoFrameCallback 실측 (최소 10프레임 측정)
 * 2순위: 측정 실패 시 30fps 가정 (표준 스냅)
 *
 * @returns RationalFps (유리수 표현: { num, den, display })
 */
export async function detectVideoFps(
  videoOrBlob: HTMLVideoElement | Blob,
): Promise<RationalFps> {
  let video: HTMLVideoElement;
  let blobUrl: string | null = null;

  if (videoOrBlob instanceof Blob) {
    blobUrl = URL.createObjectURL(videoOrBlob);
    video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = blobUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('FPS 감지: 영상 로드 실패'));
      setTimeout(() => resolve(), 5000); // 타임아웃 시 fallback
    });
  } else {
    video = videoOrBlob;
  }

  try {
    const fps = await measureFpsWithCallback(video);
    return snapToStandardFps(fps);
  } catch {
    console.warn('[FPS] 감지 실패 — 30fps fallback');
    return { num: 30, den: 1, display: 30 };
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

/**
 * requestVideoFrameCallback으로 실제 FPS 측정
 * v2.0: mediaTime 기반 측정 (wall-clock보다 정확)
 * 최소 10프레임을 측정하여 정확도 확보
 */
function measureFpsWithCallback(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!('requestVideoFrameCallback' in video)) {
      reject(new Error('requestVideoFrameCallback 미지원'));
      return;
    }

    const MIN_FRAMES = 10;
    const TIMEOUT_MS = 3000;
    let count = 0;
    let mediaT0 = 0;
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        video.pause();
        reject(new Error('FPS 측정 타임아웃'));
      }
    }, TIMEOUT_MS);

    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (done) return;
      count++;
      if (count === 1) {
        mediaT0 = meta.mediaTime;
      }
      if (count > MIN_FRAMES) {
        done = true;
        clearTimeout(timer);
        video.pause();
        // v2.0: mediaTime 기반 FPS 계산 (디코더 타임스탬프, wall-clock 지터 없음)
        const elapsed = meta.mediaTime - mediaT0;
        resolve(elapsed > 0 ? (count - 1) / elapsed : 30);
        return;
      }
      (video as any).requestVideoFrameCallback(onFrame);
    };

    (video as any).requestVideoFrameCallback(onFrame);
    video.currentTime = 0;
    video.play().catch(() => {
      clearTimeout(timer);
      reject(new Error('FPS 측정: 재생 실패'));
    });
  });
}

// ──────────────────────────────────────────────
// 프레임↔초 변환 유틸 (유리수 기반, 오차 0)
// ──────────────────────────────────────────────

/** 초 → 프레임 번호 (가장 가까운 프레임) */
export function secondsToFrame(sec: number, fps: RationalFps): number {
  return Math.round((sec * fps.num) / fps.den);
}

/** 프레임 번호 → 초 (정확한 역변환) */
export function frameToSeconds(frame: number, fps: RationalFps): number {
  return (frame * fps.den) / fps.num;
}

/** NTSC 여부 판단 */
export function isNtscFps(fps: RationalFps): boolean {
  return fps.den === 1001;
}

// ──────────────────────────────────────────────
// 메인 API
// ──────────────────────────────────────────────

/**
 * 영상 Blob에서 씬 컷 지점을 감지합니다.
 *
 * v2.0 개선사항:
 * - 100~200ms 간격 샘플링 (기존 0.5~2초)
 * - 160×90 비교 해상도 (기존 64×36)
 * - 적응형 threshold (기존 고정 25)
 * - 히스토그램 보조 비교 (디졸브/페이드 감지)
 */
export async function detectSceneCuts(
  blob: Blob,
  options?: SceneDetectionOptions,
): Promise<SceneCut[]> {
  // 1. video 엘리먼트로 영상 로드
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('씬 감지: 영상 로드 실패'));
      setTimeout(() => reject(new Error('씬 감지: 영상 로드 타임아웃')), 15_000);
    });

    const dur = video.duration;
    // [FIX #394] Infinity/NaN duration 방어
    if (!dur || !isFinite(dur) || dur < 2) return [];

    const samplingPlan = getSceneDetectionSamplingPlan(
      dur,
      options?.intervalSec,
      options?.maxFrames,
    );
    const startTime = Date.now();

    // 2. 분석할 시간 포인트 생성
    const timePoints: number[] = [];
    for (let t = 0; t < dur && timePoints.length < samplingPlan.targetFrameCount; t += samplingPlan.intervalSec) {
      timePoints.push(t);
    }

    console.log(
      `[Scene] 씬 감지 시작: ${timePoints.length}개 프레임, ` +
      `간격 ${samplingPlan.intervalSec}s, 영상 ${dur.toFixed(1)}s, ` +
      `타임아웃 ${Math.round(samplingPlan.timeoutMs / 1000)}s`,
    );

    // 3. v2.0: 비교용 canvas 160×90 (기존 64×36 → 약 7배 해상도)
    const w = 160, h = 90;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const allScores: number[] = [];
    const frameDataPairs: { timeSec: number; score: number }[] = [];
    let prevData: Uint8ClampedArray | null = null;
    let prevHistogram: number[] | null = null;

    // 4. 프레임별 시크 → 비교
    for (let i = 0; i < timePoints.length; i++) {
      // [FIX #354/#367] 전체 타임아웃 체크
      if (Date.now() - startTime > samplingPlan.timeoutMs) {
        console.warn(
          `[Scene] ⚠️ 씬 감지 ${Math.round(samplingPlan.timeoutMs / 1000)}초 타임아웃 ` +
          `— ${i}/${timePoints.length} 프레임까지 분석 후 중단`,
        );
        break;
      }

      const t = timePoints[i];

      // 시크
      const seeked = await seekVideo(video, t, 5_000);
      if (!seeked) continue;

      // 렌더링
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      // 이전 프레임과 비교
      if (prevData) {
        const rgbScore = computeFrameDifference(prevData, imageData.data);
        // v2.0: 히스토그램 비교 (디졸브/페이드 감지)
        const currentHistogram = computeHistogram(imageData.data);
        const histScore = prevHistogram
          ? computeHistogramDifference(prevHistogram, currentHistogram)
          : 0;

        // 두 신호의 가중 합산 (RGB 0.6 + 히스토그램 0.4)
        const combinedScore = rgbScore * 0.6 + histScore * 0.4;
        allScores.push(combinedScore);
        frameDataPairs.push({ timeSec: t, score: combinedScore });
        prevHistogram = currentHistogram;
      } else {
        prevHistogram = computeHistogram(imageData.data);
      }
      prevData = new Uint8ClampedArray(imageData.data);

      // 진행률 콜백
      if (options?.onProgress && i % 10 === 0) {
        options.onProgress(i, timePoints.length);
      }
    }

    // 5. v2.0: 적응형 threshold (사용자 지정이 없으면 평균 + 2σ)
    const threshold = options?.threshold ?? computeAdaptiveThreshold(allScores);

    const cuts: SceneCut[] = frameDataPairs
      .filter(p => p.score > threshold)
      .map(p => ({ timeSec: p.timeSec, score: p.score }));

    console.log(`[Scene] ✅ 씬 감지 완료: ${cuts.length}개 컷 포인트 감지 (${timePoints.length}프레임 분석, threshold=${threshold.toFixed(1)})`);
    return cuts;
  } catch (e) {
    logger.trackSwallowedError('sceneDetection:detectSceneCuts', e);
    console.warn('[Scene] 씬 감지 실패:', e);
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * AI 타임코드를 실제 씬 컷 지점에 스냅합니다.
 *
 * v2.0: 단계적 스냅 전략
 * - ±500ms 이내: 무조건 스냅 (프레임 단위 정밀)
 * - ±1.5초 이내: 높은 score의 컷이면 스냅 (강한 장면 전환)
 * - ±1.5초 초과: AI 타임코드 유지 (너무 먼 컷은 다른 장면일 수 있음)
 */
export function mergeWithAiTimecodes(
  aiTimecodes: number[],
  sceneCuts: SceneCut[],
  tolerance: number = 1.5,
  maxSnapDistance: number = 3.0,
): number[] {
  if (sceneCuts.length === 0) return aiTimecodes;

  // [FIX] 절대 점수 + 백분위수 혼합 — 약한 컷으로 잘못 스냅 방지
  const sortedScores = sceneCuts.map(c => c.score).sort((a, b) => a - b);
  const percentileThreshold = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0;
  const absoluteMinScore = 30; // 절대 최소 점수 (0-255 스케일)
  const strongCutThreshold = Math.max(percentileThreshold, absoluteMinScore);

  const usedSnapTargets = new Set<number>();

  return aiTimecodes.map(aiT => {
    let nearestCut = sceneCuts[0];
    let nearestDist = Math.abs(sceneCuts[0].timeSec - aiT);

    for (let i = 1; i < sceneCuts.length; i++) {
      const dist = Math.abs(sceneCuts[i].timeSec - aiT);
      if (dist < nearestDist) {
        nearestCut = sceneCuts[i];
        nearestDist = dist;
      }
    }

    // [FIX] 최대 스냅 거리 제한 — 너무 먼 컷은 다른 장면이므로 스냅 금지
    if (nearestDist > maxSnapDistance) return aiT;

    let snapped = aiT;
    // 1) ±500ms 이내 → 무조건 스냅
    if (nearestDist <= 0.5) {
      snapped = nearestCut.timeSec;
    }
    // 2) ±tolerance 이내 + 강한 컷 (절대 점수 + 백분위수 모두 충족) → 스냅
    else if (nearestDist <= tolerance && nearestCut.score >= strongCutThreshold) {
      snapped = nearestCut.timeSec;
    }

    if (snapped !== aiT && usedSnapTargets.has(snapped)) {
      return aiT;
    }
    usedSnapTargets.add(snapped);
    return snapped;
  });
}

// ──────────────────────────────────────────────
// 내부 유틸
// ──────────────────────────────────────────────

/** 두 프레임의 평균 픽셀 차이 계산 (0-255 스케일) */
function computeFrameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let totalDiff = 0;
  const pixelCount = a.length / 4; // RGBA

  for (let i = 0; i < a.length; i += 4) {
    totalDiff += Math.abs(a[i] - b[i]);       // R
    totalDiff += Math.abs(a[i + 1] - b[i + 1]); // G
    totalDiff += Math.abs(a[i + 2] - b[i + 2]); // B
    // Alpha 무시
  }

  return totalDiff / (pixelCount * 3);
}

/**
 * v2.0: 히스토그램 계산 (R/G/B 각 32bin = 96bin)
 * 디졸브/페이드 등 점진적 전환에서 RGB 차이는 낮지만 색상 분포가 변함
 */
function computeHistogram(data: Uint8ClampedArray): number[] {
  const BINS = 32;
  const hist = new Array(BINS * 3).fill(0);
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    hist[Math.floor(data[i] / 8)] += 1;             // R
    hist[BINS + Math.floor(data[i + 1] / 8)] += 1;   // G
    hist[BINS * 2 + Math.floor(data[i + 2] / 8)] += 1; // B
  }

  // 정규화 (0~1)
  for (let i = 0; i < hist.length; i++) {
    hist[i] /= pixelCount;
  }
  return hist;
}

/** 히스토그램 차이 (Chi-Square Distance, 0~255 스케일로 정규화) */
function computeHistogramDifference(a: number[], b: number[]): number {
  let chiSq = 0;
  for (let i = 0; i < a.length; i++) {
    const sum = a[i] + b[i];
    if (sum > 0) {
      chiSq += ((a[i] - b[i]) ** 2) / sum;
    }
  }
  // Chi-Square 값을 0~255 범위로 매핑 (경험적: chiSq 0~2 → 0~255)
  return Math.min(255, chiSq * 127.5);
}

/**
 * v2.0: 적응형 threshold 계산
 * 전체 프레임 차이값의 평균(μ) + 2σ (상위 ~2.5%만 컷으로 판정)
 * 최소 threshold: 15 (노이즈 방지)
 */
function computeAdaptiveThreshold(scores: number[]): number {
  if (scores.length === 0) return 25;

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return Math.max(15, mean + 2 * stdDev);
}

/** video.currentTime 시크 + 완료 대기 */
function seekVideo(video: HTMLVideoElement, timeSec: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const onSeeked = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      resolve(true);
    };
    setTimeout(() => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      resolve(false);
    }, timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = timeSec;
  });
}
