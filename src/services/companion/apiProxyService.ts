/**
 * apiProxyService.ts — [v2.5] 컴패니언 API 프록시
 * 브라우저에서 직접 외부 API를 호출하면 CORS/API키 노출 문제 발생
 * → 컴패니언을 통해 프록시하여 해결
 */

const COMPANION_URL = 'http://127.0.0.1:9876';

export interface ProxyRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProxyResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
  binary?: boolean;
  contentType?: string;
  size?: number;
}

/**
 * 컴패니언을 통해 외부 API 프록시 호출
 */
export async function proxyFetch<T = unknown>(
  options: ProxyRequestOptions,
): Promise<ProxyResponse<T>> {
  const res = await fetch(`${COMPANION_URL}/api/proxy/generic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: options.url,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      timeout_ms: options.timeoutMs || 60_000,
    }),
    signal: options.signal ?? AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(`프록시 요청 실패: ${err.error || res.status}`);
  }

  return res.json() as Promise<ProxyResponse<T>>;
}

/**
 * 프록시 JSON 응답을 간편하게 추출
 */
export async function proxyFetchJson<T = unknown>(
  options: ProxyRequestOptions,
): Promise<T> {
  const result = await proxyFetch<T>(options);
  if (result.status >= 400) {
    throw new Error(`프록시 대상 API 에러: HTTP ${result.status}`);
  }
  return result.data;
}
