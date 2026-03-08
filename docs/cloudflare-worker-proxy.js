/**
 * Coupang CORS Proxy — Cloudflare Worker
 *
 * 이 워커를 본인의 Cloudflare 계정에 배포하세요.
 * 무료 티어(10만 req/day)로 충분합니다.
 *
 * 배포 방법:
 * 1. https://dash.cloudflare.com → Workers & Pages → Create
 * 2. "Create Worker" 클릭
 * 3. 이 코드를 붙여넣기 → "Deploy" 클릭
 * 4. 생성된 URL (예: https://my-proxy.workers.dev)을 앱에 입력
 *
 * 이 워커는 순수 중계만 합니다. API 키를 저장하지 않습니다.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === '/health') {
        return json({ status: 'ok', timestamp: Date.now() });
      }

      // 쿠팡 상품 페이지 크롤링
      if (path === '/crawl') {
        return handleCrawl(request);
      }

      // 쿠팡 리뷰 크롤링
      if (path === '/reviews') {
        return handleReviews(request);
      }

      // 쿠팡파트너스 API 프록시
      if (path === '/coupang-api') {
        return handleCoupangApi(request);
      }

      return json({ error: 'Unknown endpoint' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// 상품 페이지 크롤링
// ═══════════════════════════════════════════════════════════════

async function handleCrawl(request) {
  const { url } = await request.json();
  if (!url || !url.includes('coupang.com')) {
    return json({ error: 'Invalid Coupang URL' }, 400);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    return json({ error: `Coupang returned ${response.status}` }, response.status);
  }

  const html = await response.text();
  return new Response(html, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ═══════════════════════════════════════════════════════════════
// 리뷰 크롤링
// ═══════════════════════════════════════════════════════════════

async function handleReviews(request) {
  const { productId, limit = 30 } = await request.json();
  if (!productId) {
    return json({ error: 'productId required' }, 400);
  }

  // 쿠팡 리뷰 내부 API 호출
  const reviewUrl = `https://www.coupang.com/vp/review/grades?productId=${productId}&page=0&size=${limit}&sortBy=ORDER_SCORE_ASC&viRoleCode=3&ratingStar=0`;

  const response = await fetch(reviewUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': `https://www.coupang.com/vp/products/${productId}`,
    },
  });

  if (!response.ok) {
    // 리뷰 API 실패 시 빈 배열 반환 (치명적이지 않음)
    return json({ reviews: [] });
  }

  try {
    const data = await response.json();

    // 쿠팡 리뷰 응답 구조 파싱
    const reviews = (data.memberProductReviews || data.reviews || []).map(r => ({
      rating: r.rating || r.star || 0,
      text: r.content || r.headline || '',
      photoUrls: (r.photos || r.images || []).map(p => p.url || p.src || ''),
      createdAt: r.createdAt || r.dateCreated || '',
      helpfulCount: r.helpfulCount || r.helpCount || 0,
    }));

    return json({ reviews });
  } catch {
    return json({ reviews: [] });
  }
}

// ═══════════════════════════════════════════════════════════════
// 쿠팡파트너스 API 프록시
// ═══════════════════════════════════════════════════════════════

async function handleCoupangApi(request) {
  const { authorization, method, path, query, body } = await request.json();

  if (!authorization || !path) {
    return json({ error: 'authorization and path required' }, 400);
  }

  const targetUrl = `https://api-gateway.coupang.com${path}${query ? '?' + query : ''}`;

  const response = await fetch(targetUrl, {
    method: method || 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-By': 'coupang-partners-app',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════════════════

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
