/**
 * Cloudflare Pages Function — HTTPS → HTTP yt-dlp 서버 프록시
 *
 * 문제: 배포 사이트(HTTPS)에서 yt-dlp VPS(HTTP)로 직접 요청 시
 *       브라우저가 Mixed Content로 차단 → 프레임 추출 실패
 *
 * 해결: 이 함수가 HTTPS 요청을 받아 HTTP VPS로 프록시
 *       브라우저 → Cloudflare(HTTPS) → VPS(HTTP) → 응답 반환
 *
 * 경로 매핑:
 *   /ytdlp-proxy/api/extract?url=xxx  →  http://VPS:3100/api/extract?url=xxx
 *   /ytdlp-proxy/api/download?url=xxx →  http://VPS:3100/api/download?url=xxx
 *   /ytdlp-proxy/health               →  http://VPS:3100/health
 */

const YTDLP_SERVER = 'http://175.126.73.193:3100';

interface CFContext {
  request: Request;
  params: { path?: string[] };
}

export async function onRequest(context: CFContext): Promise<Response> {
  const { request, params } = context;
  const url = new URL(request.url);
  const pathSegments = params.path || [];
  const targetPath = '/' + pathSegments.join('/');
  const targetUrl = `${YTDLP_SERVER}${targetPath}${url.search}`;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Forward headers (host 제외)
  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host') {
      forwardHeaders.set(key, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers: forwardHeaders,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'yt-dlp 서버 연결 실패: ' + String(error) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
