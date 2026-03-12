/**
 * Coupang Crawl Service — 쿠팡 상품 크롤링 (프록시 경유)
 *
 * 사용자가 설정한 CORS 프록시를 통해 쿠팡 상품페이지를 크롤링하고
 * 상품 정보, 이미지, 리뷰를 추출한다.
 */

import { monitoredFetch, getCoupangProxyUrl } from './apiService';
import { logger } from './LoggerService';
import type { CoupangProduct, CoupangReview, CoupangCrawlResult } from '../types';

// ═══════════════════════════════════════════════════════════════
// URL 유틸리티
// ═══════════════════════════════════════════════════════════════

/** 쿠팡 URL에서 productId 추출 */
export const extractProductId = (url: string): string | null => {
  // Pattern: /products/123456789 or /vp/products/123456789
  const match = url.match(/products\/(\d+)/);
  return match ? match[1] : null;
};

/** 쿠팡 URL 유효성 검증 */
export const validateCoupangUrl = (url: string): { valid: boolean; message?: string } => {
  if (!url.trim()) return { valid: false, message: 'URL을 입력해주세요.' };

  const isCoupang = /coupang\.com/.test(url);
  if (!isCoupang) return { valid: false, message: '쿠팡 URL이 아닙니다.' };

  const productId = extractProductId(url);
  if (!productId) return { valid: false, message: '상품 ID를 찾을 수 없습니다. 상품 상세페이지 URL을 입력해주세요.' };

  return { valid: true };
};

// ═══════════════════════════════════════════════════════════════
// 프록시 경유 HTML 가져오기
// ═══════════════════════════════════════════════════════════════

const fetchViaProxy = async (targetUrl: string): Promise<string> => {
  const proxyUrl = getCoupangProxyUrl();
  if (!proxyUrl) {
    throw new Error('CORS 프록시 URL이 필요해요. 쇼핑콘텐츠 첫 화면 하단의 "CORS 프록시 URL" 입력란에 프록시 주소를 넣어주세요. (예: Cloudflare Workers URL)');
  }

  const fetchUrl = `${proxyUrl.replace(/\/$/, '')}/crawl`;

  const response = await monitoredFetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetUrl }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`프록시 요청 실패 (${response.status}): ${text}`);
  }

  return response.text();
};

// ═══════════════════════════════════════════════════════════════
// HTML 파싱 — 상품 정보 추출
// ═══════════════════════════════════════════════════════════════

const parseProductFromHtml = (html: string, productId: string, originalUrl: string): CoupangProduct => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // og:title
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  // og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
  // og:description
  const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

  // 가격 추출 (JSON-LD 또는 meta 태그)
  let price = 0;
  let originalPrice = 0;
  const priceEl = doc.querySelector('.total-price strong') || doc.querySelector('[class*="price"] strong');
  if (priceEl) {
    price = parseInt(priceEl.textContent?.replace(/[^0-9]/g, '') || '0', 10);
  }
  const origPriceEl = doc.querySelector('.origin-price') || doc.querySelector('[class*="original"]');
  if (origPriceEl) {
    originalPrice = parseInt(origPriceEl.textContent?.replace(/[^0-9]/g, '') || '0', 10);
  }

  // JSON-LD structured data 시도
  const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  ldScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '');
      if (data['@type'] === 'Product' || data?.offers) {
        if (!price && data.offers?.price) price = Number(data.offers.price);
        if (!ogTitle && data.name) {/* use data.name */}
      }
    } catch (e) { logger.trackSwallowedError('CoupangCrawlService:parseLdJson', e); }
  });

  // 할인율 계산
  let discountRate = '';
  if (originalPrice > price && price > 0) {
    discountRate = `${Math.round((1 - price / originalPrice) * 100)}%`;
  }

  // 별점
  let rating = 0;
  let reviewCount = 0;
  const ratingEl = doc.querySelector('.rating-star-num') || doc.querySelector('[class*="rating"]');
  if (ratingEl) {
    const ratingStyle = ratingEl.getAttribute('style') || '';
    const widthMatch = ratingStyle.match(/width:\s*([\d.]+)%/);
    if (widthMatch) rating = Math.round(parseFloat(widthMatch[1]) / 20 * 10) / 10;
  }
  const reviewCountEl = doc.querySelector('.count') || doc.querySelector('[class*="review-count"]');
  if (reviewCountEl) {
    reviewCount = parseInt(reviewCountEl.textContent?.replace(/[^0-9]/g, '') || '0', 10);
  }

  // 로켓배송 여부
  const isRocketDelivery = !!doc.querySelector('[class*="rocket"]') || html.includes('로켓배송');

  // 추가 이미지
  const additionalImages: string[] = [];
  doc.querySelectorAll('.prod-image img, [class*="detail-item"] img').forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-img-src') || '';
    if (src && !additionalImages.includes(src)) additionalImages.push(src);
  });

  // 카테고리 추출
  let category = '기타';
  const breadcrumbs = doc.querySelectorAll('.breadcrumb a, [class*="breadcrumb"] a');
  if (breadcrumbs.length > 1) {
    category = breadcrumbs[1]?.textContent?.trim() || '기타';
  }

  return {
    productId,
    productName: ogTitle || '상품명 추출 실패',
    price,
    originalPrice: originalPrice || undefined,
    discountRate: discountRate || undefined,
    mainImageUrl: ogImage,
    additionalImages: additionalImages.slice(0, 10),
    category,
    description: ogDesc,
    rating,
    reviewCount,
    isRocketDelivery,
    productUrl: originalUrl,
  };
};

// ═══════════════════════════════════════════════════════════════
// 리뷰 추출 (프록시 경유)
// ═══════════════════════════════════════════════════════════════

const fetchReviews = async (productId: string): Promise<CoupangReview[]> => {
  const proxyUrl = getCoupangProxyUrl();
  if (!proxyUrl) return [];

  try {
    const fetchUrl = `${proxyUrl.replace(/\/$/, '')}/reviews`;
    const response = await monitoredFetch(fetchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, limit: 30 }),
    });

    if (!response.ok) return [];

    const data = await response.json() as { reviews?: CoupangReview[] };
    return data.reviews || [];
  } catch (e) {
    logger.warn('[CoupangCrawl] 리뷰 가져오기 실패', { error: (e as Error).message });
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════
// 리뷰 분석 유틸리티
// ═══════════════════════════════════════════════════════════════

const analyzeReviews = (reviews: CoupangReview[]): {
  topPositive: string[];
  topNegative: string[];
  photoKeywords: string[];
} => {
  const positive = reviews
    .filter(r => r.rating >= 4 && r.text.length > 20)
    .sort((a, b) => (b.helpfulCount || 0) - (a.helpfulCount || 0))
    .slice(0, 5)
    .map(r => r.text);

  const negative = reviews
    .filter(r => r.rating <= 2 && r.text.length > 20)
    .sort((a, b) => (b.helpfulCount || 0) - (a.helpfulCount || 0))
    .slice(0, 3)
    .map(r => r.text);

  // 포토리뷰에서 자주 등장하는 키워드 추출 (간단한 빈도 분석)
  const photoReviewTexts = reviews.filter(r => r.photoUrls.length > 0).map(r => r.text);
  const wordFreq = new Map<string, number>();
  const stopwords = new Set(['이', '그', '저', '것', '수', '등', '를', '을', '에', '의', '가', '는', '은', '도', '와', '과', '로', '으로', '에서', '한', '합니다', '있', '없', '좋', '사용', '너무', '정말', '진짜', '아주']);

  photoReviewTexts.forEach(text => {
    const words = text.replace(/[^\uAC00-\uD7AF\s]/g, '').split(/\s+/).filter(w => w.length >= 2 && !stopwords.has(w));
    words.forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
  });

  const photoKeywords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return { topPositive: positive, topNegative: negative, photoKeywords };
};

// ═══════════════════════════════════════════════════════════════
// 메인 크롤링 함수 (공개)
// ═══════════════════════════════════════════════════════════════

/**
 * 쿠팡 상품 URL → 전체 크롤링 결과
 * 1. 상품 HTML 크롤링 → 파싱
 * 2. 리뷰 크롤링
 * 3. 리뷰 분석
 */
export const crawlCoupangProduct = async (
  productUrl: string,
  onProgress?: (msg: string) => void,
): Promise<CoupangCrawlResult> => {
  const productId = extractProductId(productUrl);
  if (!productId) throw new Error('상품 ID를 추출할 수 없습니다.');

  logger.info('[CoupangCrawl] 크롤링 시작', { productId, url: productUrl });

  // 1. 상품 페이지 크롤링
  onProgress?.('상품 페이지 크롤링 중...');
  const html = await fetchViaProxy(productUrl);

  // 2. HTML 파싱
  onProgress?.('상품 정보 추출 중...');
  const product = parseProductFromHtml(html, productId, productUrl);
  logger.info('[CoupangCrawl] 상품 정보 추출 완료', { name: product.productName, price: product.price });

  // 3. 리뷰 크롤링
  onProgress?.('리뷰 수집 중...');
  const reviews = await fetchReviews(productId);
  logger.info('[CoupangCrawl] 리뷰 수집 완료', { count: reviews.length });

  // 4. 리뷰 분석
  onProgress?.('리뷰 분석 중...');
  const { topPositive, topNegative, photoKeywords } = analyzeReviews(reviews);

  return {
    product,
    reviews,
    topPositiveReviews: topPositive,
    topNegativeReviews: topNegative,
    photoReviewKeywords: photoKeywords,
  };
};

/**
 * 프록시 연결 테스트
 */
export const testProxyConnection = async (): Promise<boolean> => {
  const proxyUrl = getCoupangProxyUrl();
  if (!proxyUrl) return false;

  try {
    const response = await monitoredFetch(`${proxyUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
};
