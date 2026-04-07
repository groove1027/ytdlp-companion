/**
 * videoAnalysisLimits.test.ts — Phase 4-2 dynamic token + timeout 분기 검증
 *
 * Evolink Gemini 3.1 Pro 한도(라이브 검증 결과):
 *   maxOutputTokens 1 ≤ x < 65537 → 65536까지 OK, 65537 이상 reject
 * 본 모듈은 안전 마진으로 65000 상한 사용. 모든 분기 경계값을 정밀하게 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  computeVideoAnalysisMaxTokens,
  computeVideoAnalysisTimeoutMs,
} from '../gemini/videoAnalysisLimits';

describe('computeVideoAnalysisMaxTokens', () => {
  describe('짧은 클립 (≤ 120s) → 8000 고정', () => {
    it('undefined → 8000', () => {
      expect(computeVideoAnalysisMaxTokens(undefined)).toBe(8000);
    });
    it('null → 8000', () => {
      expect(computeVideoAnalysisMaxTokens(null)).toBe(8000);
    });
    it('0 → 8000', () => {
      expect(computeVideoAnalysisMaxTokens(0)).toBe(8000);
    });
    it('60s → 8000', () => {
      expect(computeVideoAnalysisMaxTokens(60)).toBe(8000);
    });
    it('120s 경계 → 8000', () => {
      expect(computeVideoAnalysisMaxTokens(120)).toBe(8000);
    });
  });

  describe('2~30분 (121s ≤ x ≤ 1800s) → 8000~32000', () => {
    it('121s → avgScene=45, expectedScenes=ceil(121/45)=3, max(8000, 600)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(121)).toBe(8000);
    });
    it('480s (8분) → avgScene=45, expectedScenes=ceil(480/45)=11, max(8000, 2200)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(480)).toBe(8000);
    });
    it('600s (10분) 경계 → avgScene=45, expectedScenes=ceil(600/45)=14, max(8000, 2800)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(600)).toBe(8000);
    });
    it('601s → avgScene=90, expectedScenes=ceil(601/90)=7, max(8000, 1400)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(601)).toBe(8000);
    });
    it('1500s (25분) → avgScene=90, expectedScenes=ceil(1500/90)=17, max(8000, 3400)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(1500)).toBe(8000);
    });
    it('1800s (30분) 경계 → avgScene=90, expectedScenes=ceil(1800/90)=20, max(8000, 4000)=8000', () => {
      expect(computeVideoAnalysisMaxTokens(1800)).toBe(8000);
    });
  });

  describe('30~60분 (1801s ≤ x ≤ 3600s) → 32000~50000', () => {
    it('1801s → expectedScenes=ceil(1801/90)=21, max(32000, 4200)=32000', () => {
      expect(computeVideoAnalysisMaxTokens(1801)).toBe(32000);
    });
    it('2700s (45분) → expectedScenes=30, max(32000, 6000)=32000', () => {
      expect(computeVideoAnalysisMaxTokens(2700)).toBe(32000);
    });
    it('3600s (60분) 경계 → expectedScenes=40, max(32000, 8000)=32000', () => {
      expect(computeVideoAnalysisMaxTokens(3600)).toBe(32000);
    });
  });

  describe('60분+ 드라마 1화 (> 3600s) → 50000~65000', () => {
    it('3601s → avgScene=120, expectedScenes=ceil(3601/120)=31, max(50000, 6200)=50000', () => {
      expect(computeVideoAnalysisMaxTokens(3601)).toBe(50000);
    });
    it('3700s (1시간 1분 40초) → expectedScenes=31, max(50000, 6200)=50000', () => {
      expect(computeVideoAnalysisMaxTokens(3700)).toBe(50000);
    });
    it('4500s (75분, 짧은 드라마 1화) → expectedScenes=38, max(50000, 7600)=50000', () => {
      expect(computeVideoAnalysisMaxTokens(4500)).toBe(50000);
    });
    it('5400s (90분, 표준 드라마 1화) → expectedScenes=45, max(50000, 9000)=50000', () => {
      expect(computeVideoAnalysisMaxTokens(5400)).toBe(50000);
    });
    it('30000s (8시간+, 극단적 케이스) → expectedScenes=250, min(65000, 50000)=50000 — clamp', () => {
      // 250 * 200 = 50000, max(50000, 50000) = 50000, min(65000, 50000) = 50000
      expect(computeVideoAnalysisMaxTokens(30000)).toBe(50000);
    });
    it('40000s → expectedScenes=ceil(40000/120)=334, 334*200=66800, min(65000, max(50000, 66800))=65000 (한도 도달)', () => {
      expect(computeVideoAnalysisMaxTokens(40000)).toBe(65000);
    });
  });

  describe('Evolink Gemini 한도 안전성 (65536 이하 보장)', () => {
    it('어떤 입력에서도 65000 절대 초과 X', () => {
      for (const sec of [0, 100, 500, 1000, 3000, 7200, 10800, 100000, 1000000]) {
        const tokens = computeVideoAnalysisMaxTokens(sec);
        expect(tokens).toBeGreaterThanOrEqual(8000);
        expect(tokens).toBeLessThanOrEqual(65000);
      }
    });
  });
});

describe('computeVideoAnalysisTimeoutMs', () => {
  it('undefined → 110_000', () => {
    expect(computeVideoAnalysisTimeoutMs(undefined)).toBe(110_000);
  });
  it('null → 110_000', () => {
    expect(computeVideoAnalysisTimeoutMs(null)).toBe(110_000);
  });
  it('0 → 110_000', () => {
    expect(computeVideoAnalysisTimeoutMs(0)).toBe(110_000);
  });
  it('600s 경계 → 110_000', () => {
    expect(computeVideoAnalysisTimeoutMs(600)).toBe(110_000);
  });
  it('601s → 5분 (300_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(601)).toBe(300_000);
  });
  it('1800s 경계 → 5분 (300_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(1800)).toBe(300_000);
  });
  it('1801s → 10분 (600_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(1801)).toBe(600_000);
  });
  it('3600s 경계 → 10분 (600_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(3600)).toBe(600_000);
  });
  it('3601s (60분+) → 20분 (1_200_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(3601)).toBe(1_200_000);
  });
  it('5400s (90분 드라마) → 20분 (1_200_000)', () => {
    expect(computeVideoAnalysisTimeoutMs(5400)).toBe(1_200_000);
  });
});
