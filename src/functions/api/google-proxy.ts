/**
 * Google API CORS 프록시 — Cloudflare Pages Function
 *
 * 브라우저에서 직접 호출할 수 없는 Google 내부 API를 서버사이드에서 중계합니다.
 * - labs.google/fx/api/auth/session (인증)
 * - aisandbox-pa.googleapis.com/v1:runImageFx (이미지 생성)
 * - aisandbox-pa.googleapis.com/v1/whisk:generateImage (Whisk 이미지)
 * - aisandbox-pa.googleapis.com/v1/whisk:generateVideo (Veo 3.1 영상)
 *
 * POST /api/google-proxy
 * Body: { targetUrl, method?, body?, cookie, token? }
 */

interface Env {}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 허용된 Google API 도메인 (보안: 임의 URL 프록시 방지)
const ALLOWED_HOSTS = [
  'labs.google',
  'aisandbox-pa.googleapis.com',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  try {
    const { targetUrl, method, body, cookie, token } = await request.json() as {
      targetUrl: string;
      method?: string;
      body?: string;
      cookie?: string;
      token?: string;
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

    // Google API 요청 헤더 구성
    const headers: Record<string, string> = {
      'Origin': 'https://labs.google',
      'Content-Type': 'application/json',
      'Referer': 'https://labs.google/fx/tools/image-fx',
    };

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
