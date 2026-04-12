function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeDurationSec(durationSec: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
}

/**
 * 영상 길이에 비례해 타임아웃을 늘리되, 브라우저가 영구 대기하지 않도록 상한을 둡니다.
 */
export function getDurationScaledTimeoutMs(
  durationSec: number,
  minMs: number = 90_000,
  maxMs: number = 300_000,
  msPerSecond: number = 500,
): number {
  const safeDurationSec = sanitizeDurationSec(durationSec);
  return clamp(Math.ceil(safeDurationSec * msPerSecond), minMs, maxMs);
}

/**
 * 업로드 직후 AI 입력용 프레임 추출 계획.
 * 숏폼은 기존 0.5초 간격 동작을 유지하고, 롱폼은 30초 단위 균등 샘플링으로 전체 구간을 우선 커버합니다.
 */
export function getSourcePrepFrameExtractionPlan(durationSec: number): {
  intervalSec: number;
  targetFrameCount: number;
  timeoutMs: number;
} {
  const safeDurationSec = sanitizeDurationSec(durationSec);
  const targetFrameCount = safeDurationSec <= 60
    ? Math.min(120, Math.max(20, Math.ceil(safeDurationSec / 0.5)))
    : Math.min(60, Math.max(20, Math.ceil(safeDurationSec / 30)));
  const intervalSec = safeDurationSec > 0
    ? Math.max(0.5, safeDurationSec / targetFrameCount)
    : 0.5;

  return {
    intervalSec,
    targetFrameCount,
    timeoutMs: getDurationScaledTimeoutMs(safeDurationSec, 90_000, 300_000, 500),
  };
}

/**
 * 브라우저 씬 감지는 컷 정밀도와 처리 시간을 모두 고려해 샘플링 간격을 조정합니다.
 * 20분을 넘기면 1초 간격으로 완화해 30분+ 영상도 시간 예산 안에 더 넓게 커버합니다.
 */
export function getSceneDetectionSamplingPlan(
  durationSec: number,
  requestedIntervalSec?: number,
  requestedMaxFrames?: number,
): {
  intervalSec: number;
  targetFrameCount: number;
  timeoutMs: number;
} {
  const safeDurationSec = sanitizeDurationSec(durationSec);
  const intervalSec = requestedIntervalSec ?? (
    safeDurationSec <= 120 ? 0.1 :
    safeDurationSec <= 600 ? 0.2 :
    safeDurationSec <= 1200 ? 0.5 :
    safeDurationSec <= 3600 ? 1.0 :
    1.5
  );
  const autoFrameCount = Math.max(1, Math.ceil(safeDurationSec / intervalSec));
  const budgetFrameCap = safeDurationSec <= 1200 ? 3000 : 2400;
  const targetFrameCount = Math.min(autoFrameCount, budgetFrameCap);

  return {
    intervalSec,
    targetFrameCount: requestedMaxFrames && requestedMaxFrames > 0
      ? Math.min(requestedMaxFrames, targetFrameCount)
      : targetFrameCount,
    timeoutMs: getDurationScaledTimeoutMs(safeDurationSec, 90_000, 300_000, 500),
  };
}

/**
 * 타임코드 기반 정밀 프레임 추출은 요청한 프레임 수가 많을수록 추가 시간을 배정합니다.
 */
export function getPreciseFrameExtractionTimeoutMs(
  durationSec: number,
  requestedFrameCount: number,
  minimumMs: number = 60_000,
): number {
  const safeDurationSec = sanitizeDurationSec(durationSec);
  const safeFrameCount = Number.isFinite(requestedFrameCount) && requestedFrameCount > 0
    ? requestedFrameCount
    : 0;
  const durationBasedMs = getDurationScaledTimeoutMs(safeDurationSec, minimumMs, 300_000, 250);
  const frameBasedMs = clamp(safeFrameCount * 1_000, minimumMs, 300_000);
  return Math.max(durationBasedMs, frameBasedMs);
}
