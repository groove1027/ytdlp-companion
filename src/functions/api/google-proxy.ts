/**
 * Google API CORS 프록시 — Cloudflare Pages Function
 *
 * 브라우저에서 직접 호출할 수 없는 Google 내부 API를 서버사이드에서 중계합니다.
 * - google.com/search (이미지 검색 HTML)
 * - labs.google/fx/api/auth/session (인증)
 * - aisandbox-pa.googleapis.com/v1:runImageFx (이미지 생성)
 * - aisandbox-pa.googleapis.com/v1/whisk:generateImage (Whisk 이미지)
 * - aisandbox-pa.googleapis.com/v1/whisk:runImageRecipe (Whisk 레퍼런스 리믹싱)
 * - aisandbox-pa.googleapis.com/v1/whisk:generateVideo (Veo 3.1 영상)
 * - labs.google/fx/api/trpc/* (워크플로/캡션/업로드)
 *
 * POST /api/google-proxy
 * Body: { targetUrl, method?, body?, cookie, token?, headers? }
 */

interface Env {}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 허용된 Google API 도메인 (보안: 임의 URL 프록시 방지)
const ALLOWED_HOSTS = [
  'google.com',
  'labs.google',
  'aisandbox-pa.googleapis.com',
];

const FORWARDED_HEADERS = new Set([
  'accept',
  'accept-language',
  'cache-control',
  'pragma',
  'upgrade-insecure-requests',
  'user-agent',
]);

function isGoogleSearchHost(hostname: string): boolean {
  return hostname === 'google.com' || hostname.endsWith('.google.com');
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostAllowed = ALLOWED_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
    if (!hostAllowed) return false;
    if (isGoogleSearchHost(parsed.hostname)) {
      return parsed.pathname === '/search';
    }
    return true;
  } catch {
    return false;
  }
}

function pickForwardHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};

  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (!FORWARDED_HEADERS.has(normalizedKey) || typeof value !== 'string' || !value.trim()) continue;
    picked[key] = value.trim();
  }
  return picked;
}

function buildProxyHeaders(parsedUrl: URL, hasBody: boolean, forwardedHeaders: Record<string, string>): Record<string, string> {
  const baseHeaders: Record<string, string> = isGoogleSearchHost(parsedUrl.hostname)
    ? {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': `${parsedUrl.origin}/`,
        'Upgrade-Insecure-Requests': '1',
      }
    : {
        'Origin': 'https://labs.google',
        'Referer': 'https://labs.google/fx/tools/image-fx',
      };

  if (hasBody) {
    baseHeaders['Content-Type'] = 'application/json';
  }

  return { ...baseHeaders, ...forwardedHeaders };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  try {
    const { targetUrl, method, body, cookie, token, headers: rawHeaders } = await request.json() as {
      targetUrl: string;
      method?: string;
      body?: string;
      cookie?: string;
      token?: string;
      headers?: Record<string, string>;
    };

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'targetUrl is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: 'URL not allowed' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const parsedUrl = new URL(targetUrl);
    const headers = buildProxyHeaders(parsedUrl, !!body, pickForwardHeaders(rawHeaders));

    if (cookie) headers['Cookie'] = cookie;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const googleRes = await fetch(targetUrl, {
      method: method || (body ? 'POST' : 'GET'),
      headers,
      body: body || undefined,
    });

    const responseBody = await googleRes.text();

    return new Response(responseBody, {
      status: googleRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': googleRes.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
};
