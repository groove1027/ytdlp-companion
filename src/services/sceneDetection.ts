/**
 * sceneDetection.ts
 *
 * WebCodecs/Canvas 기반 씬 감지 서비스
 * 다운로드된 영상 Blob에서 실제 컷 전환 지점을 감지합니다.
 *
 * AI 타임코드 (WHAT) + 씬 감지 (WHEN) = 정확한 편집점
 */

import { logger } from './LoggerService';

// ──────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────

export interface SceneCut {
  timeSec: number;
  score: number;
}

export interface SceneDetectionOptions {
  /** 프레임 비교 간격 (초). 기본: 영상 길이에 따라 자동 결정 */
  intervalSec?: number;
  /** 씬 컷 감지 임계값 (0-255). 높을수록 큰 변화만 감지. 기본: 25 */
  threshold?: number;
  /** 최대 분석 프레임 수. 기본: 300 */
  maxFrames?: number;
  /** 진행 콜백 */
  onProgress?: (current: number, total: number) => void;
}

// ──────────────────────────────────────────────
// 메인 API
// ──────────────────────────────────────────────

/**
 * 영상 Blob에서 씬 컷 지점을 감지합니다.
 *
 * 알고리즘:
 * 1. video 엘리먼트로 영상 로드
 * 2. 일정 간격으로 시크 → 작은 canvas에 렌더링
 * 3. 연속된 두 프레임의 픽셀 차이 계산
 * 4. 임계값 초과 → 씬 컷으로 판정
 */
export async function detectSceneCuts(
  blob: Blob,
  options?: SceneDetectionOptions,
): Promise<SceneCut[]> {
  const threshold = options?.threshold ?? 25;
  const maxFrames = options?.maxFrames ?? 300;
  // [FIX #354/#367] 전체 타임아웃 90초 — 무한 행 방지
  const OVERALL_TIMEOUT_MS = 90_000;
  const startTime = Date.now();

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
    if (!dur || dur < 2) return [];

    // 영상 길이에 따라 자동 간격 결정
    const intervalSec = options?.intervalSec ?? (
      dur <= 60 ? 0.5 :   // 1분 이하: 0.5초 간격
      dur <= 300 ? 1.0 :  // 5분 이하: 1초 간격
      2.0                 // 5분 초과: 2초 간격
    );

    // 2. 분석할 시간 포인트 생성
    const timePoints: number[] = [];
    for (let t = 0; t < dur && timePoints.length < maxFrames; t += intervalSec) {
      timePoints.push(t);
    }

    console.log(`[Scene] 씬 감지 시작: ${timePoints.length}개 프레임, 간격 ${intervalSec}s, 영상 ${dur.toFixed(1)}s`);

    // 3. 비교용 소형 canvas (64x36 = 2,304 pixels — 빠른 비교)
    const w = 64, h = 36;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const cuts: SceneCut[] = [];
    let prevData: Uint8ClampedArray | null = null;

    // 4. 프레임별 시크 → 비교
    for (let i = 0; i < timePoints.length; i++) {
      // [FIX #354/#367] 전체 타임아웃 체크
      if (Date.now() - startTime > OVERALL_TIMEOUT_MS) {
        console.warn(`[Scene] ⚠️ 씬 감지 ${OVERALL_TIMEOUT_MS / 1000}초 타임아웃 — ${i}/${timePoints.length} 프레임까지 분석 후 중단`);
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
        const score = computeFrameDifference(prevData, imageData.data);
        if (score > threshold) {
          cuts.push({ timeSec: t, score });
        }
      }
      prevData = new Uint8ClampedArray(imageData.data);

      // 진행률 콜백
      if (options?.onProgress && i % 10 === 0) {
        options.onProgress(i, timePoints.length);
      }
    }

    console.log(`[Scene] ✅ 씬 감지 완료: ${cuts.length}개 컷 포인트 감지 (${timePoints.length}프레임 분석)`);
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
 * AI가 추측한 타임코드 → 가장 가까운 실제 컷 포인트로 보정
 * tolerance 이내에 실제 컷이 없으면 원래 AI 타임코드 유지
 */
export function mergeWithAiTimecodes(
  aiTimecodes: number[],
  sceneCuts: SceneCut[],
  tolerance: number = 3,
): number[] {
  if (sceneCuts.length === 0) return aiTimecodes;

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

    // tolerance 이내에 실제 씬 컷이 있으면 스냅
    if (nearestDist <= tolerance) {
      return nearestCut.timeSec;
    }
    return aiT;
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
