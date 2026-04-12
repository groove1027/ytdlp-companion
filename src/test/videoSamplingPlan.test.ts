import { describe, expect, it } from 'vitest';
import {
  getPreciseFrameExtractionTimeoutMs,
  getSceneDetectionSamplingPlan,
  getSourcePrepFrameExtractionPlan,
} from '../services/videoSamplingPlan';

describe('getSourcePrepFrameExtractionPlan', () => {
  it('60초 이하 숏폼은 0.5초 간격 샘플링을 유지한다', () => {
    const plan = getSourcePrepFrameExtractionPlan(45);
    expect(plan.intervalSec).toBe(0.5);
    expect(plan.targetFrameCount).toBe(90);
    expect(plan.timeoutMs).toBe(90_000);
  });

  it('30분 롱폼은 90초가 아닌 동적 타임아웃과 30초 간격 샘플링을 사용한다', () => {
    const plan = getSourcePrepFrameExtractionPlan(1_800);
    expect(plan.intervalSec).toBe(30);
    expect(plan.targetFrameCount).toBe(60);
    expect(plan.timeoutMs).toBe(300_000);
  });
});

describe('getSceneDetectionSamplingPlan', () => {
  it('30분 롱폼은 1초 간격과 동적 타임아웃으로 브라우저 씬 감지 예산을 늘린다', () => {
    const plan = getSceneDetectionSamplingPlan(1_800);
    expect(plan.intervalSec).toBe(1);
    expect(plan.targetFrameCount).toBe(1_800);
    expect(plan.timeoutMs).toBe(300_000);
  });

  it('호출부가 maxFrames를 더 낮게 지정하면 그 상한을 존중한다', () => {
    const plan = getSceneDetectionSamplingPlan(1_800, undefined, 900);
    expect(plan.targetFrameCount).toBe(900);
    expect(plan.timeoutMs).toBe(300_000);
  });
});

describe('getPreciseFrameExtractionTimeoutMs', () => {
  it('정밀 프레임 추출도 롱폼에서 2분보다 큰 동적 타임아웃을 허용한다', () => {
    expect(getPreciseFrameExtractionTimeoutMs(1_800, 96, 120_000)).toBe(300_000);
  });
});
