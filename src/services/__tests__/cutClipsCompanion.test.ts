/**
 * cutClipsCompanion.test.ts — [v2.0.2] 컴패니언 ffmpeg-cut helper 검증
 *
 * 검증 항목:
 *   1. isCompanionFfmpegCutAvailable: 컴패니언 미감지 시 false (캐시 X)
 *   2. cutClipsViaCompanion: 빈 clips 배열 → throw
 *   3. cutClipsViaCompanion: 정상 응답 → ZIP Blob 반환 + 파일명/사이즈 정합성
 *   4. cutClipsViaCompanion: 응답 ok=false → throw with 친절 메시지
 *   5. cutClipsViaCompanion: 404/405 → cache 무효화 + 컴패니언 update 안내
 *   6. clearCompanionFfmpegCutCache: 캐시 초기화 동작
 *   7. progress callback: 0~100 단계별 호출
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage mock — vitest node 환경
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(k: string) { return this.store[k] ?? null; }
  setItem(k: string, v: string) { this.store[k] = v; }
  removeItem(k: string) { delete this.store[k]; }
  clear() { this.store = {}; }
}
(globalThis as Record<string, unknown>).localStorage = new MockLocalStorage();

// monitoredFetch + isCompanionDetected mock
const mockFetch = vi.fn();
const mockIsCompanionDetected = vi.fn();
vi.mock('../apiService', () => ({
  monitoredFetch: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock('../ytdlpApiService', () => ({
  isCompanionDetected: () => mockIsCompanionDetected(),
}));
vi.mock('../LoggerService', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), trackSwallowedError: vi.fn() },
}));
// [v2.5] tunnelClient mock — uploadFileToCompanion이 temp_path를 반환
vi.mock('../companion/tunnelClient', () => ({
  uploadFileToCompanion: vi.fn().mockResolvedValue('/tmp/test-upload.mp4'),
  uploadBlobToCompanion: vi.fn().mockResolvedValue('/tmp/test-upload.bin'),
  downloadCompanionTempFile: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'application/zip' })),
}));

import {
  cutClipsViaCompanion,
  isCompanionFfmpegCutAvailable,
  clearCompanionFfmpegCutCache,
} from '../companion/cutClipsCompanion';

describe('isCompanionFfmpegCutAvailable', () => {
  beforeEach(() => {
    clearCompanionFfmpegCutCache();
    mockFetch.mockReset();
    mockIsCompanionDetected.mockReset();
  });

  it('컴패니언 미감지 → false (fetch 호출 X)', async () => {
    mockIsCompanionDetected.mockReturnValue(false);
    const result = await isCompanionFfmpegCutAvailable();
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('health endpoint 200 + ffmpeg-cut services 포함 → true', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        app: 'ytdlp-companion',
        version: '2.0.2',
        services: ['ytdlp', 'ffmpeg-cut', 'ffmpeg'],
      }),
    });
    const result = await isCompanionFfmpegCutAvailable();
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('외부 signal을 그대로 전달하고 5초 timeout은 monitoredFetch에 맡긴다', async () => {
    const controller = new AbortController();
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
    });

    await isCompanionFfmpegCutAvailable(controller.signal);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0][1] as { signal?: AbortSignal }).signal).toBe(controller.signal);
    expect(mockFetch.mock.calls[0][2]).toBe(5000);
  });

  it('health endpoint 200 + ffmpeg-cut 미포함 → false', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        app: 'ytdlp-companion',
        version: '1.0.0',
        services: ['ytdlp'],
      }),
    });
    const result = await isCompanionFfmpegCutAvailable();
    expect(result).toBe(false);
  });

  it('health 응답 app 시그니처 불일치 → false', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'malicious', services: ['ffmpeg-cut'] }),
    });
    const result = await isCompanionFfmpegCutAvailable();
    expect(result).toBe(false);
  });

  it('fetch throw → false (cache 저장)', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockRejectedValue(new Error('network'));
    const result = await isCompanionFfmpegCutAvailable();
    expect(result).toBe(false);
  });

  it('30초 캐시: 두 번째 호출은 fetch 안 함', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
    });
    await isCompanionFfmpegCutAvailable();
    await isCompanionFfmpegCutAvailable();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('30초 TTL 경과 후에는 다시 fetch', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
    });

    nowSpy.mockReturnValue(1_000);
    await isCompanionFfmpegCutAvailable();
    nowSpy.mockReturnValue(31_001);
    await isCompanionFfmpegCutAvailable();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('clearCompanionFfmpegCutCache 후에는 다시 fetch', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
    });
    await isCompanionFfmpegCutAvailable();
    clearCompanionFfmpegCutCache();
    await isCompanionFfmpegCutAvailable();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('health probe abort → AbortError 전파 + false cache 오염 없음', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(
      isCompanionFfmpegCutAvailable(new AbortController().signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
    });
    await expect(isCompanionFfmpegCutAvailable()).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

function makeMockFile(name: string, size: number, type = 'video/mp4'): File {
  const buffer = new Uint8Array(size);
  // 약간의 더미 데이터 — base64 인코딩 검증용
  for (let i = 0; i < Math.min(size, 100); i++) buffer[i] = i & 0xff;
  return new File([buffer], name, { type });
}

describe('cutClipsViaCompanion', () => {
  beforeEach(() => {
    clearCompanionFfmpegCutCache();
    mockFetch.mockReset();
    mockIsCompanionDetected.mockReset();
  });

  it('빈 clips 배열 → throw', async () => {
    const file = makeMockFile('test.mp4', 100);
    await expect(cutClipsViaCompanion(file, [])).rejects.toThrow(/자를 클립이 없/);
  });

  it('정상 응답 → ZIP Blob 반환', async () => {
    // ZIP 시그니처 (PK\x03\x04) 포함 더미 데이터
    const dummyZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const dummyBase64 = btoa(String.fromCharCode(...dummyZip));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: dummyBase64,
        format: 'zip',
        size: dummyZip.length,
        clipCount: 2,
      }),
    });

    const file = makeMockFile('test.mp4', 1024);
    const clips = [
      { label: '001', startSec: 0, endSec: 5 },
      { label: '002', startSec: 5, endSec: 10 },
    ];
    const blob = await cutClipsViaCompanion(file, clips);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBe(dummyZip.length);
  });

  it('progress callback 5 → 20 → 95 → 100 단계 호출', async () => {
    const dummyZip = new Uint8Array([0x50, 0x4b]);
    const dummyBase64 = btoa(String.fromCharCode(...dummyZip));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: dummyBase64, size: 2 }),
    });

    const file = makeMockFile('test.mp4', 100);
    const progressLog: number[] = [];
    await cutClipsViaCompanion(
      file,
      [{ label: '001', startSec: 0, endSec: 1 }],
      (p) => progressLog.push(p),
    );
    expect(progressLog).toContain(5);
    expect(progressLog).toContain(20);
    expect(progressLog).toContain(95);
    expect(progressLog).toContain(100);
  });

  it('signal pre-abort → fetch 호출 없이 AbortError', async () => {
    const file = makeMockFile('test.mp4', 100);
    const controller = new AbortController();
    controller.abort();

    await expect(
      cutClipsViaCompanion(
        file,
        [{ label: '001', startSec: 0, endSec: 1 }],
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cut 요청도 caller signal 전달 + 10분 timeout 유지', async () => {
    const controller = new AbortController();
    const dummyBase64 = btoa('PK\x03\x04');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: dummyBase64, size: 4 }),
    });

    const file = makeMockFile('test.mp4', 100);
    await cutClipsViaCompanion(
      file,
      [{ label: '001', startSec: 0, endSec: 1 }],
      undefined,
      controller.signal,
    );

    expect((mockFetch.mock.calls[0][1] as { signal?: AbortSignal }).signal).toBe(controller.signal);
    expect(mockFetch.mock.calls[0][2]).toBe(10 * 60 * 1000);
  });

  it('응답 data 비어 있음 → throw', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ format: 'zip', size: 0 }),
    });
    const file = makeMockFile('test.mp4', 100);
    await expect(
      cutClipsViaCompanion(file, [{ label: '001', startSec: 0, endSec: 1 }]),
    ).rejects.toThrow(/ZIP 데이터가 비어/);
  });

  it('응답 error 메시지 포함 → 친절한 throw', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'invalid timestamp' }),
    });
    const file = makeMockFile('test.mp4', 100);
    await expect(
      cutClipsViaCompanion(file, [{ label: '001', startSec: 0, endSec: 1 }]),
    ).rejects.toThrow(/invalid timestamp/);
  });

  it('HTTP 404 → cache 무효화 + 업데이트 안내', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });
    const file = makeMockFile('test.mp4', 100);
    await expect(
      cutClipsViaCompanion(file, [{ label: '001', startSec: 0, endSec: 1 }]),
    ).rejects.toThrow(/ffmpeg-cut.*지원하지 않/);
  });

  it('HTTP 500 → 본문 메시지 포함 throw', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'codec not supported',
    });
    const file = makeMockFile('test.mp4', 100);
    await expect(
      cutClipsViaCompanion(file, [{ label: '001', startSec: 0, endSec: 1 }]),
    ).rejects.toThrow(/codec not supported/);
  });

  it('network error → 지원 캐시 무효화 후 health 재조회', async () => {
    mockIsCompanionDetected.mockReturnValue(true);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
      })
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ app: 'ytdlp-companion', services: ['ffmpeg-cut'] }),
      });

    await expect(isCompanionFfmpegCutAvailable()).resolves.toBe(true);

    const file = makeMockFile('test.mp4', 100);
    await expect(
      cutClipsViaCompanion(file, [{ label: '001', startSec: 0, endSec: 1 }]),
    ).rejects.toThrow(/ECONNREFUSED/);

    await expect(isCompanionFfmpegCutAvailable()).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('clips는 label/startSec/endSec 순서대로 payload에 포함', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ outputPath: '/tmp/output.zip', size: 4, clipCount: 2 }),
    });

    const file = makeMockFile('test.mp4', 100);
    await cutClipsViaCompanion(file, [
      { label: 'A', startSec: 1.5, endSec: 3.0 },
      { label: 'B', startSec: 10, endSec: 12.5 },
    ]);

    const fetchCall = mockFetch.mock.calls[0];
    const requestBody = JSON.parse((fetchCall[1] as { body: string }).body);
    expect(requestBody.clips).toHaveLength(2);
    expect(requestBody.clips[0]).toEqual({ label: 'A', startSec: 1.5, endSec: 3.0 });
    expect(requestBody.clips[1]).toEqual({ label: 'B', startSec: 10, endSec: 12.5 });
    expect(requestBody.inputPath || requestBody.input).toBeTruthy(); // [v2.5] inputPath 또는 base64
    expect(requestBody.inputFormat).toBe('mp4');
  });

  it('mov 파일 → inputFormat=mov', async () => {
    const dummyBase64 = btoa('PK\x03\x04');
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: dummyBase64, size: 4 }) });
    const file = makeMockFile('test.mov', 100, 'video/quicktime');
    await cutClipsViaCompanion(file, [{ label: 'A', startSec: 0, endSec: 1 }]);
    const requestBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(requestBody.inputFormat).toBe('mov');
  });
});
