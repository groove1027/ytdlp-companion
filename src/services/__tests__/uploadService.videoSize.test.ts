/**
 * uploadService.videoSize.test.ts — [v2.0.1] 100MB 영상 분석 한도 검증
 *
 * Google Gemini 백엔드의 임의 HTTPS URL fileData fetch 한도(라이브 검증 ~100MB)를
 * 사전 차단하는 ensureVideoSizeForAnalysis() helper의 분기 정확성을 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  ensureVideoSizeForAnalysis,
  VIDEO_ANALYSIS_MAX_BYTES,
  VIDEO_ANALYSIS_MAX_MB_LABEL,
  VIDEO_ANALYSIS_SIZE_HINT,
} from '../uploadService';

describe('VIDEO_ANALYSIS_MAX_BYTES 상수', () => {
  it('정확히 100 MB (100 * 1024 * 1024 bytes)', () => {
    expect(VIDEO_ANALYSIS_MAX_BYTES).toBe(104_857_600);
  });
  it('라벨이 "100MB"', () => {
    expect(VIDEO_ANALYSIS_MAX_MB_LABEL).toBe('100MB');
  });
  it('사이즈 힌트 텍스트에 100MB / 1080p / 720p 키워드 포함', () => {
    expect(VIDEO_ANALYSIS_SIZE_HINT).toMatch(/100MB/);
    expect(VIDEO_ANALYSIS_SIZE_HINT).toMatch(/1080p/);
    expect(VIDEO_ANALYSIS_SIZE_HINT).toMatch(/720p/);
  });
});

describe('ensureVideoSizeForAnalysis()', () => {
  describe('한도 이내 — throw 안 함', () => {
    it('빈 파일 (0 bytes) → 통과', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: 0, name: 'empty.mp4' })).not.toThrow();
    });
    it('size 미정 → 통과 (0 취급)', () => {
      expect(() => ensureVideoSizeForAnalysis({ name: 'noSize.mp4' })).not.toThrow();
    });
    it('1 MB → 통과', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: 1024 * 1024, name: 'small.mp4' })).not.toThrow();
    });
    it('50 MB → 통과', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: 50 * 1024 * 1024, name: 'medium.mp4' })).not.toThrow();
    });
    it('한도 정확히 100 MB → 통과 (≤ 비교)', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: VIDEO_ANALYSIS_MAX_BYTES, name: 'exact.mp4' })).not.toThrow();
    });
    it('한도 - 1 byte → 통과', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: VIDEO_ANALYSIS_MAX_BYTES - 1, name: 'just-under.mp4' })).not.toThrow();
    });
  });

  describe('한도 초과 — throw + 친절한 메시지', () => {
    it('한도 + 1 byte → throw', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: VIDEO_ANALYSIS_MAX_BYTES + 1, name: 'just-over.mp4' }))
        .toThrow();
    });
    it('150 MB → throw', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: 150 * 1024 * 1024, name: 'big.mp4' }))
        .toThrow();
    });
    it('1 GB → throw', () => {
      expect(() => ensureVideoSizeForAnalysis({ size: 1024 * 1024 * 1024, name: 'huge.mp4' }))
        .toThrow();
    });
    it('에러 메시지에 파일명 포함', () => {
      try {
        ensureVideoSizeForAnalysis({ size: 200 * 1024 * 1024, name: 'drama.mp4' });
        expect.unreachable('throw should have happened');
      } catch (e) {
        expect((e as Error).message).toContain('drama.mp4');
      }
    });
    it('에러 메시지에 정확한 MB 사이즈 표시', () => {
      try {
        ensureVideoSizeForAnalysis({ size: 250 * 1024 * 1024, name: 'long.mp4' });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toContain('250.0MB');
      }
    });
    it('에러 메시지에 100MB 한도 표시', () => {
      try {
        ensureVideoSizeForAnalysis({ size: VIDEO_ANALYSIS_MAX_BYTES + 1, name: 'a.mp4' });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toContain('100MB');
      }
    });
    it('에러 메시지에 해결 방법 (1080p/720p/잘라서) 안내 포함', () => {
      try {
        ensureVideoSizeForAnalysis({ size: 300 * 1024 * 1024, name: 'a.mp4' });
        expect.unreachable();
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toMatch(/1080p|720p/);
        expect(msg).toMatch(/잘라|화질|짧게/);
      }
    });
    it('파일명 미정 → "영상" 기본값', () => {
      try {
        ensureVideoSizeForAnalysis({ size: 200 * 1024 * 1024 });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toContain('영상');
      }
    });
  });
});
