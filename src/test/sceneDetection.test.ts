/**
 * sceneDetection 단위 테스트 — 순수 변환 함수 검증
 *
 * 대상: src/services/sceneDetection.ts
 *   - secondsToFrame(sec, fps)
 *   - frameToSeconds(frame, fps)
 *   - isNtscFps(fps)
 *
 * 실행: npm run test:run -- sceneDetection
 *
 * 왜 이 함수들?
 *   - 영상 편집의 핵심 변환 로직 (FPS ↔ 시간)
 *   - 버그 시 NLE 내보내기 자막 싱크가 깨짐
 *   - 외부 의존성 없는 순수 함수 — 단위 테스트 황금 영역
 */
import { describe, it, expect } from 'vitest';
import {
  secondsToFrame,
  frameToSeconds,
  isNtscFps,
} from '../services/sceneDetection';
import type { RationalFps } from '../types';

// ──────────────────────────────────────────────
// FPS 상수 (테스트 픽스처)
// ──────────────────────────────────────────────

const FPS_2997: RationalFps = { num: 30000, den: 1001, display: 29.97 };
const FPS_30: RationalFps = { num: 30, den: 1, display: 30 };
const FPS_24: RationalFps = { num: 24, den: 1, display: 24 };
const FPS_2398: RationalFps = { num: 24000, den: 1001, display: 23.976 };
const FPS_60: RationalFps = { num: 60, den: 1, display: 60 };
const FPS_5994: RationalFps = { num: 60000, den: 1001, display: 59.94 };

// ──────────────────────────────────────────────
// secondsToFrame
// ──────────────────────────────────────────────

describe('secondsToFrame', () => {
  it('30fps에서 1초는 30프레임', () => {
    expect(secondsToFrame(1, FPS_30)).toBe(30);
  });

  it('30fps에서 0초는 0프레임', () => {
    expect(secondsToFrame(0, FPS_30)).toBe(0);
  });

  it('29.97fps에서 1초는 30프레임 (반올림)', () => {
    // 30000/1001 ≈ 29.970, 1초 × 29.970 = 29.970 → round → 30
    expect(secondsToFrame(1, FPS_2997)).toBe(30);
  });

  it('29.97fps에서 10초는 300프레임 (정확)', () => {
    // 10 × 30000 / 1001 = 299.7 → round → 300
    expect(secondsToFrame(10, FPS_2997)).toBe(300);
  });

  it('24fps에서 2.5초는 60프레임', () => {
    expect(secondsToFrame(2.5, FPS_24)).toBe(60);
  });

  it('23.976fps에서 1초는 24프레임 (반올림)', () => {
    expect(secondsToFrame(1, FPS_2398)).toBe(24);
  });

  it('60fps에서 0.5초는 30프레임', () => {
    expect(secondsToFrame(0.5, FPS_60)).toBe(30);
  });

  it('음수 시간도 처리 (-1초 = -30프레임)', () => {
    expect(secondsToFrame(-1, FPS_30)).toBe(-30);
  });

  it('소수점 시간 정확히 반올림 (0.05초@30fps = 1프레임 후 반올림)', () => {
    // 0.05 × 30 = 1.5 → Math.round → 2
    expect(secondsToFrame(0.05, FPS_30)).toBe(2);
  });

  it('59.94fps에서 1초는 60프레임 (반올림)', () => {
    // 60000/1001 ≈ 59.940, 1초 × 59.940 = 59.940 → round → 60
    expect(secondsToFrame(1, FPS_5994)).toBe(60);
  });

  it('매우 큰 시간도 유리수 FPS 기준으로 안정적으로 변환', () => {
    expect(secondsToFrame(1_001_000, FPS_2997)).toBe(30_000_000);
  });
});

// ──────────────────────────────────────────────
// frameToSeconds
// ──────────────────────────────────────────────

describe('frameToSeconds', () => {
  it('30fps에서 30프레임은 1초', () => {
    expect(frameToSeconds(30, FPS_30)).toBe(1);
  });

  it('30fps에서 0프레임은 0초', () => {
    expect(frameToSeconds(0, FPS_30)).toBe(0);
  });

  it('29.97fps에서 30프레임은 정확히 1.001초', () => {
    // 30 × 1001 / 30000 = 30030 / 30000 = 1.001
    expect(frameToSeconds(30, FPS_2997)).toBeCloseTo(1.001, 6);
  });

  it('24fps에서 60프레임은 2.5초', () => {
    expect(frameToSeconds(60, FPS_24)).toBe(2.5);
  });

  it('60fps에서 30프레임은 0.5초', () => {
    expect(frameToSeconds(30, FPS_60)).toBe(0.5);
  });

  it('음수 프레임도 처리 (-30프레임 = -1초)', () => {
    expect(frameToSeconds(-30, FPS_30)).toBe(-1);
  });

  it('역변환 라운드트립 (30fps): seconds → frame → seconds = 동일값', () => {
    const original = 5.0;
    const frame = secondsToFrame(original, FPS_30);
    const back = frameToSeconds(frame, FPS_30);
    expect(back).toBeCloseTo(original, 6);
  });

  it('역변환 라운드트립 (29.97fps, 정확한 프레임 경계)', () => {
    // 29.97fps에서 정확한 프레임 시간(1.001초의 배수)은 round-trip 손실 없음
    const exactFrameTimes = [0, 1.001, 2.002, 3.003, 10.01];
    for (const sec of exactFrameTimes) {
      const frame = secondsToFrame(sec, FPS_2997);
      const back = frameToSeconds(frame, FPS_2997);
      expect(back).toBeCloseTo(sec, 6);
    }
  });

  it('매우 큰 프레임도 유리수 FPS 기준으로 정확히 변환', () => {
    expect(frameToSeconds(30_000_000, FPS_2997)).toBe(1_001_000);
  });
});

// ──────────────────────────────────────────────
// isNtscFps
// ──────────────────────────────────────────────

describe('isNtscFps', () => {
  it('29.97fps (den=1001)는 NTSC', () => {
    expect(isNtscFps(FPS_2997)).toBe(true);
  });

  it('23.976fps (den=1001)는 NTSC', () => {
    expect(isNtscFps(FPS_2398)).toBe(true);
  });

  it('59.94fps (den=1001)는 NTSC', () => {
    expect(isNtscFps(FPS_5994)).toBe(true);
  });

  it('30fps (den=1)는 NTSC 아님', () => {
    expect(isNtscFps(FPS_30)).toBe(false);
  });

  it('24fps (den=1)는 NTSC 아님', () => {
    expect(isNtscFps(FPS_24)).toBe(false);
  });

  it('60fps (den=1)는 NTSC 아님', () => {
    expect(isNtscFps(FPS_60)).toBe(false);
  });
});
