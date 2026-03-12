/**
 * Coupang Affiliate Service — 쿠팡파트너스 딥링크 생성
 *
 * HMAC-SHA256 서명을 브라우저 Web Crypto API로 수행하고,
 * CORS 프록시를 통해 쿠팡파트너스 API를 호출한다.
 * 모든 키는 사용자가 직접 입력 — 앱 개발자 과금 0원.
 */

import { monitoredFetch, getCoupangAccessKey, getCoupangSecretKey, getCoupangProxyUrl } from './apiService';
import { logger } from './LoggerService';

const COUPANG_API_BASE = 'https://api-gateway.coupang.com';
const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

// ═══════════════════════════════════════════════════════════════
// HMAC-SHA256 서명 생성 (Web Crypto API — 브라우저 네이티브)
// ═══════════════════════════════════════════════════════════════

const generateHmac = async (
  method: string,
  path: string,
  query: string,
): Promise<string> => {
  const accessKey = getCoupangAccessKey();
  const secretKey = getCoupangSecretKey();

  if (!accessKey || !secretKey) {
    throw new Error('쿠팡파트너스 Access Key / Secret Key가 설정되지 않았습니다.');
  }

  // GMT datetime: yyMMddTHHmmssZ
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const datetime = `${pad(now.getUTCFullYear() % 100)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const message = `${datetime}\n${method}\n${path}\n${query}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const hex = [...new Uint8Array(sigBuffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${hex}`;
};

// ═══════════════════════════════════════════════════════════════
// 프록시 경유 API 호출
// ═══════════════════════════════════════════════════════════════

interface CoupangApiRequest {
  method: string;
  path: string;
  query?: string;
  body?: Record<string, unknown>;
}

interface DeeplinkResponse {
  rCode: string;
  rMessage: string;
  data: { originalUrl: string; shortenUrl: string }[];
}

const callCoupangApi = async <T>(req: CoupangApiRequest): Promise<T> => {
  const proxyUrl = getCoupangProxyUrl();
  const authorization = await generateHmac(req.method, req.path, req.query || '');

  // 프록시가 있으면 프록시 경유, 없으면 직접 호출 시도
  const targetUrl = proxyUrl
    ? `${proxyUrl.replace(/\/$/, '')}/coupang-api`
    : `${COUPANG_API_BASE}${req.path}${req.query ? '?' + req.query : ''}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
  };

  let fetchBody: string;

  if (proxyUrl) {
    // 프록시 모드: Authorization과 원본 요청 정보를 body에 포함
    fetchBody = JSON.stringify({
      authorization,
      method: req.method,
      path: req.path,
      query: req.query || '',
      body: req.body || null,
    });
  } else {
    // 직접 호출 모드 (CORS 허용되는 경우)
    headers['Authorization'] = authorization;
    headers['X-Requested-By'] = 'coupang-partners-app';
    fetchBody = req.body ? JSON.stringify(req.body) : '';
  }

  const response = await monitoredFetch(targetUrl, {
    method: 'POST',
    headers,
    body: fetchBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`쿠팡 API 오류 (${response.status}): ${errText}`);
  }

  return response.json() as Promise<T>;
};

// ═══════════════════════════════════════════════════════════════
// 공개 API — 딥링크 생성
// ═══════════════════════════════════════════════════════════════

/**
 * 쿠팡 상품 URL → 어필리에이트 딥링크 생성
 */
export const generateDeeplink = async (productUrls: string[]): Promise<string[]> => {
  logger.info('[CoupangAffiliate] 딥링크 생성 요청', { count: productUrls.length });

  const result = await callCoupangApi<DeeplinkResponse>({
    method: 'POST',
    path: DEEPLINK_PATH,
    body: {
      coupangUrls: productUrls,
    },
  });

  if (result.rCode !== '0') {
    throw new Error(`딥링크 생성 실패: ${result.rMessage}`);
  }

  const links = result.data.map(d => d.shortenUrl);
  logger.success('[CoupangAffiliate] 딥링크 생성 완료', { links });
  return links;
};

/**
 * 쿠팡파트너스 API 연결 테스트
 * 간단히 HMAC 서명 생성 가능 여부만 확인
 */
export const testAffiliateConnection = async (): Promise<boolean> => {
  try {
    const accessKey = getCoupangAccessKey();
    const secretKey = getCoupangSecretKey();
    if (!accessKey || !secretKey) return false;

    // HMAC 서명 생성만 테스트 (실제 API 호출 없이)
    await generateHmac('GET', '/test', '');
    return true;
  } catch (e) {
    logger.trackSwallowedError('coupangAffiliateService:testConnection', e);
    return false;
  }
};

/**
 * 쿠팡파트너스 키 설정 여부 확인
 */
export const hasCoupangAffiliateKeys = (): boolean => {
  return !!(getCoupangAccessKey() && getCoupangSecretKey());
};
