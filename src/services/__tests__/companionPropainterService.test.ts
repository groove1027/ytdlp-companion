import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string) {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value;
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }
}

(globalThis as Record<string, unknown>).localStorage = new MockLocalStorage();

const mockFetch = vi.fn();

vi.mock('../apiService', () => ({
  monitoredFetch: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock('../LoggerService', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    trackSwallowedError: vi.fn(),
  },
}));

import {
  buildPropainterUnavailableMessage,
  resetPropainterProxyCache,
  resolvePropainterProxy,
} from '../companionPropainterService';

function healthResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('companionPropainterService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    resetPropainterProxyCache();
  });

  it('메인 컴패니언 9876 + ProPainter 9877 조합을 감지한다', async () => {
    mockFetch
      .mockResolvedValueOnce(healthResponse({
        app: 'ytdlp-companion',
        version: '2.2.1',
        port: 9876,
      }))
      .mockResolvedValueOnce(healthResponse({
        app: 'propainter-server',
        version: '1.0.0',
        propainter: true,
        features: { inpaint: true },
      }));

    const result = await resolvePropainterProxy();

    expect(result).toEqual({
      url: 'http://127.0.0.1:9877',
      propainterPort: 9877,
      companionDetected: true,
      companionPort: 9876,
    });
    expect(localStorage.getItem('companion_main_port')).toBe('9876');
    expect(localStorage.getItem('companion_propainter_port')).toBe('9877');
    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
      'http://127.0.0.1:9876/health',
      'http://127.0.0.1:9877/health',
    ]);
  });

  it('메인 컴패니언만 9877에서 감지되면 포트 진단 메시지를 만든다', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(healthResponse({
        app: 'ytdlp-companion',
        version: '2.2.1',
        port: 9877,
      }))
      .mockResolvedValueOnce(healthResponse({
        app: 'unexpected-service',
      }))
      .mockResolvedValueOnce(healthResponse({
        app: 'unexpected-service',
      }))
      .mockResolvedValueOnce(healthResponse({
        app: 'ytdlp-companion',
        version: '2.2.1',
        port: 9877,
      }));

    const result = await resolvePropainterProxy();
    const message = buildPropainterUnavailableMessage(result);

    expect(result).toEqual({
      url: null,
      propainterPort: null,
      companionDetected: true,
      companionPort: 9877,
    });
    expect(message).toContain('ProPainter 서버가 응답하지 않습니다');
    expect(message).toContain('현재 메인 컴패니언 포트는 9877');
    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
      'http://127.0.0.1:9876/health',
      'http://127.0.0.1:9877/health',
      'http://127.0.0.1:9876/health',
      'http://127.0.0.1:9876/health',
      'http://127.0.0.1:9877/health',
    ]);
  });
});
