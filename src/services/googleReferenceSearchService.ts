/**
 * Google 이미지 검색 레퍼런스 서비스
 * - Google Images HTML 스크래핑 (Cloudflare Pages 프록시 경유)
 * - 대본 맥락에서 검색어 자동 생성
 * - 비용 0원 — AI 이미지 생성 API 호출 없음
 */

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';
import type { Scene } from '../types';

// Lazy import to avoid circular dependency — 비동기 초기화 후 동기 접근
let _projectStoreRef: { getState: () => { scenes: Scene[] } } | null = null;
import('../stores/projectStore').then(m => { _projectStoreRef = m.useProjectStore; }).catch(() => {});
const getLatestScenes = (): Scene[] => _projectStoreRef?.getState().scenes ?? [];

// ─── Google Images 설정 ───
const PROXY_PATH = '/api/google-proxy';
const GOOGLE_IMAGE_SEARCH_URL = 'https://www.google.com/search';
const GOOGLE_IMAGE_PAGE_SIZE = 100;
const GOOGLE_IMAGE_RESULT_WINDOW = 10;
const GOOGLE_IMAGE_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
} as const;
const GOOGLE_IMG_SIZE_MAP: Record<string, string> = {
  medium: 'm',
  large: 'l',
  xlarge: '2mp',
  xxlarge: '4mp',
  huge: '6mp',
};

// ─── 타입 ───
export interface GoogleImageResult {
  title: string;
  link: string;          // 원본 이미지 URL
  displayLink: string;   // 출처 도메인
  snippet: string;
  thumbnailLink: string; // 썸네일 URL
  contextLink: string;   // 출처 페이지 URL
  width: number;
  height: number;
}

export interface GoogleSearchResponse {
  items: GoogleImageResult[];
  totalResults: number;
  query: string;
}

const GOOGLE_IMGRES_REGEX = /\/imgres\?imgurl=[^"'<>\\\s]+/g;
const GOOGLE_THUMBNAIL_REGEX = /https?:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:[^"'<>\\\s]+/g;
const GOOGLE_AF_INIT_REGEX = /AF_initDataCallback\(([\s\S]*?)\);/g;
const GOOGLE_HTTP_DIMENSION_REGEX = /\["((?:https?:)?\/\/[^"]+)",(\d+),(\d+)\]/g;

// ─── 검색어 생성 로직 ───

/** AI 생성용 잡음 제거 (8k, cinematic lighting 등) */
const NOISE_PATTERNS = /\b(8k|4k|hdr|cinematic|masterpiece|highly detailed|no text|hyper.?realistic|ultra.?realistic|photorealistic|octane render|unreal engine|detailed|best quality|high quality|digital art|concept art|illustration|professional|award.?winning|trending on artstation|artstation|deviantart|pixiv)\b/gi;

/** 장면 데이터에서 검색 키워드 추출 */
export function buildSearchQuery(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
): string {
  const parts: string[] = [];

  // 1순위: entityName (실존 인물/브랜드)
  if (scene.entityName) {
    parts.push(scene.entityName);
  }

  // 2순위: sceneLocation + sceneEra (장소/시대)
  if (scene.sceneLocation) parts.push(scene.sceneLocation);
  if (scene.sceneEra) parts.push(scene.sceneEra);

  // 3순위: visualDescriptionKO에서 핵심어 추출 (한국어)
  if (scene.visualDescriptionKO && parts.length < 3) {
    const desc = scene.visualDescriptionKO.slice(0, 100);
    parts.push(desc);
  }

  // 4순위: visualPrompt에서 잡음 제거 후 핵심만
  if (parts.length < 2 && scene.visualPrompt) {
    const clean = scene.visualPrompt
      .replace(NOISE_PATTERNS, '')
      .replace(/[,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (clean.length > 5) parts.push(clean);
  }

  // 5순위: scriptText에서 핵심 구
  if (parts.length < 2 && scene.scriptText) {
    const script = scene.scriptText.slice(0, 60).replace(/[""''"\n]/g, ' ').trim();
    if (script.length > 3) parts.push(script);
  }

  // 보강: globalContext에서 맥락
  if (parts.length < 2 && globalContext) {
    const ctx = globalContext.slice(0, 40).trim();
    if (ctx) parts.push(ctx);
  }

  // 합치고 중복 제거
  const query = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  return query || '풍경 사진';
}

function getGoogleLocale(): { hl: string; gl: string } {
  const locale = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ko-kr';
  return locale.startsWith('ko') ? { hl: 'ko', gl: 'kr' } : { hl: 'en', gl: 'us' };
}

function decodeGoogleValue(value: string | null | undefined): string {
  if (!value) return '';
  let decoded = value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003f/gi, '?')
    .replace(/\\x3d/gi, '=')
    .replace(/\\x26/gi, '&')
    .replace(/\\\//g, '/');

  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

function normalizeScriptBlock(value: string): string {
  return value
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003f/gi, '?')
    .replace(/\\x3d/gi, '=')
    .replace(/\\x26/gi, '&')
    .replace(/\\\//g, '/');
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrl(value: string | null | undefined): string {
  const decoded = decodeGoogleValue(value);
  if (!decoded) return '';
  if (decoded.startsWith('//')) return `https:${decoded}`;
  if (decoded.startsWith('/')) {
    try {
      return new URL(decoded, 'https://www.google.com').toString();
    } catch {
      return '';
    }
  }
  return isHttpUrl(decoded) ? decoded : '';
}

function isUsefulImageUrl(value: string): boolean {
  return isHttpUrl(value)
    && !value.startsWith('data:')
    && !value.includes('/images/branding/searchlogo');
}

function cleanText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function getDisplayLink(contextLink: string, link: string): string {
  try {
    return new URL(contextLink || link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function buildSearchUrl(query: string, start: number, imgSize: string): string {
  const safeStart = Math.max(1, start);
  const { hl, gl } = getGoogleLocale();
  const params = new URLSearchParams({
    q: query,
    tbm: 'isch',
    safe: 'active',
    hl,
    gl,
    ijn: String(Math.floor((safeStart - 1) / GOOGLE_IMAGE_PAGE_SIZE)),
    start: String(safeStart - 1),
  });

  const size = GOOGLE_IMG_SIZE_MAP[imgSize];
  if (size) params.set('imgsz', size);

  return `${GOOGLE_IMAGE_SEARCH_URL}?${params.toString()}`;
}

async function proxyFetchGoogleSearch(targetUrl: string): Promise<Response> {
  return monitoredFetch(PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: 'GET',
      headers: GOOGLE_IMAGE_HEADERS,
    }),
  });
}

function extractThumbnailFromElement(anchor: Element): string {
  const images = Array.from(anchor.querySelectorAll('img'));
  for (const image of images) {
    const srcSet = image.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0] || '';
    const candidates = [
      image.getAttribute('data-src'),
      image.getAttribute('data-iurl'),
      image.getAttribute('src'),
      srcSet,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeUrl(candidate);
      if (isUsefulImageUrl(normalized)) return normalized;
    }
  }

  return '';
}

function parseImgresHref(href: string | null): GoogleImageResult | null {
  if (!href) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(decodeGoogleValue(href), 'https://www.google.com');
  } catch {
    return null;
  }

  if (parsedUrl.pathname !== '/imgres') return null;

  const link = normalizeUrl(parsedUrl.searchParams.get('imgurl'));
  if (!isUsefulImageUrl(link)) return null;

  const contextLink = normalizeUrl(parsedUrl.searchParams.get('imgrefurl'));
  const width = parseInt(parsedUrl.searchParams.get('w') || '0', 10);
  const height = parseInt(parsedUrl.searchParams.get('h') || '0', 10);

  return {
    title: '',
    link,
    displayLink: getDisplayLink(contextLink, link),
    snippet: '',
    thumbnailLink: '',
    contextLink,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function extractDomResults(doc: Document): GoogleImageResult[] {
  const results: GoogleImageResult[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(doc.querySelectorAll('a[href*="/imgres?"], a[href^="https://www.google.com/imgres?"]'));

  for (const anchor of anchors) {
    const parsed = parseImgresHref(anchor.getAttribute('href'));
    if (!parsed || seen.has(parsed.link)) continue;

    const title = cleanText(
      anchor.getAttribute('title')
      || anchor.getAttribute('aria-label')
      || anchor.querySelector('img')?.getAttribute('alt')
      || anchor.textContent,
    );

    results.push({
      ...parsed,
      title: title || parsed.displayLink,
      snippet: title || parsed.displayLink,
      thumbnailLink: extractThumbnailFromElement(anchor),
    });
    seen.add(parsed.link);
  }

  return results;
}

function pushUniqueResult(results: GoogleImageResult[], seen: Set<string>, item: GoogleImageResult): void {
  if (!item.link || seen.has(item.link)) return;
  results.push(item);
  seen.add(item.link);
}

function extractRegexResults(html: string): GoogleImageResult[] {
  const results: GoogleImageResult[] = [];
  const seen = new Set<string>();
  const matches = html.matchAll(GOOGLE_IMGRES_REGEX);

  for (const match of matches) {
    const parsed = parseImgresHref(match[0]);
    if (!parsed || seen.has(parsed.link)) continue;

    const start = Math.max(0, match.index || 0);
    const chunk = html.slice(Math.max(0, start - 1800), Math.min(html.length, start + 2200));
    const thumbnail = normalizeUrl(chunk.match(GOOGLE_THUMBNAIL_REGEX)?.[0] || '');

    pushUniqueResult(results, seen, {
      ...parsed,
      title: parsed.displayLink || parsed.link,
      snippet: parsed.displayLink || parsed.link,
      thumbnailLink: isUsefulImageUrl(thumbnail) ? thumbnail : '',
    });
  }

  return results;
}

function extractAfInitResults(html: string): GoogleImageResult[] {
  const results: GoogleImageResult[] = [];
  const seen = new Set<string>();
  const scriptBlocks = Array.from(html.matchAll(GOOGLE_AF_INIT_REGEX), match => match[1]);

  for (const block of scriptBlocks) {
    const normalizedBlock = normalizeScriptBlock(block);
    const thumbnails = Array.from(
      new Set(
        (normalizedBlock.match(GOOGLE_THUMBNAIL_REGEX) || [])
          .map(url => normalizeUrl(url))
          .filter(isUsefulImageUrl),
      ),
    );
    const originals = Array.from(normalizedBlock.matchAll(GOOGLE_HTTP_DIMENSION_REGEX));

    let thumbIndex = 0;
    for (const original of originals) {
      const link = normalizeUrl(original[1]);
      if (!isUsefulImageUrl(link) || link.includes('gstatic.com') || seen.has(link)) continue;

      const width = parseInt(original[2] || '0', 10);
      const height = parseInt(original[3] || '0', 10);
      const thumbnailLink = thumbnails[thumbIndex] || '';
      thumbIndex += 1;

      pushUniqueResult(results, seen, {
        title: getDisplayLink('', link) || link,
        link,
        displayLink: getDisplayLink('', link),
        snippet: getDisplayLink('', link),
        thumbnailLink,
        contextLink: '',
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
      });
    }
  }

  return results;
}

function mergeUniqueResults(...lists: GoogleImageResult[][]): GoogleImageResult[] {
  const merged: GoogleImageResult[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list) {
      pushUniqueResult(merged, seen, item);
    }
  }

  return merged;
}

function detectGoogleSearchBlock(html: string): string | null {
  if (/unusual traffic|자동화된 요청|captcha|Our systems have detected unusual traffic/i.test(html)) {
    return '구글이 현재 검색 요청을 차단했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (/Before you continue to Google Search|consent\.google/i.test(html)) {
    return '구글 동의 페이지가 반환되었습니다. 프록시 헤더를 확인한 뒤 다시 시도해주세요.';
  }
  return null;
}

/**
 * Google 이미지 검색 실행
 * @param query 검색어
 * @param start 시작 인덱스 (1-based, 페이지네이션)
 * @param imgSize 이미지 크기 필터 (medium, large, xlarge, xxlarge, huge)
 */
export async function searchGoogleImages(
  query: string,
  start: number = 1,
  imgSize: string = 'large',
): Promise<GoogleSearchResponse> {
  const url = buildSearchUrl(query, start, imgSize);
  logger.info('[GoogleRef] 검색 요청', `query="${query}" start=${start}`);

  const res = await proxyFetchGoogleSearch(url);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error('[GoogleRef] 검색 실패', `status=${res.status} ${errText}`);
    if (res.status === 429) {
      throw new Error('구글 검색 요청이 너무 많아 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.');
    }
    if (res.status === 403) {
      throw new Error('프록시에서 구글 이미지 검색을 차단했습니다. 프록시 허용 호스트를 확인해주세요.');
    }
    throw new Error(`구글 검색 실패 (${res.status})`);
  }

  const html = await res.text();
  const blockedMessage = detectGoogleSearchBlock(html);
  if (blockedMessage) {
    throw new Error(blockedMessage);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allItems = mergeUniqueResults(
    extractDomResults(doc),
    extractRegexResults(html),
    extractAfInitResults(html),
  );
  const pageOffset = (Math.max(1, start) - 1) % GOOGLE_IMAGE_PAGE_SIZE;
  const items = allItems.slice(pageOffset, pageOffset + GOOGLE_IMAGE_RESULT_WINDOW);

  return {
    items,
    totalResults: allItems.length,
    query,
  };
}

/**
 * 장면 맥락 기반 구글 레퍼런스 이미지 검색
 * - 검색어 자동 생성 + 검색 실행 + 결과 반환
 */
export async function searchSceneReferenceImages(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
  startIndex: number = 1,
): Promise<GoogleSearchResponse> {
  const query = buildSearchQuery(scene, prevScene, nextScene, globalContext);
  return searchGoogleImages(query, startIndex);
}

/**
 * 스토리보드 생성 직후 자동 구글 레퍼런스 이미지 배치
 * - 각 씬마다 순차적으로 검색 → 첫 번째 결과를 imageUrl에 적용
 * - 이미 imageUrl이 있는 씬은 건너뜀
 * - 200ms 간격으로 API rate limit 준수
 * - runId로 중복 실행 방지 (새 분석 시 이전 실행 취소)
 */
let _autoApplyRunId = 0;

export async function autoApplyGoogleReferences(
  scenes: Scene[],
  globalContext: string,
  updateScene: (id: string, partial: Partial<Scene>) => void,
  onComplete?: (appliedCount: number) => void,
  forceReplace?: boolean,
): Promise<void> {
  const runId = ++_autoApplyRunId;
  let appliedCount = 0;

  for (let i = 0; i < scenes.length; i++) {
    // 새 실행이 시작되면 이전 실행 중단
    if (_autoApplyRunId !== runId) return;

    const scene = scenes[i];
    // 검색할 내용이 없으면 건너뜀
    if (!scene.scriptText && !scene.visualPrompt) continue;

    // [P1 FIX] 매 씬 처리 전 최신 스토어에서 imageUrl 재확인 — stale 스냅샷 덮어쓰기 방지
    // forceReplace=true이면 이미 이미지가 있어도 교체 (일괄 적용에서 사용)
    if (!forceReplace) {
      const latestScenes = getLatestScenes();
      const latestScene = latestScenes.find(s => s.id === scene.id);
      if (latestScene?.imageUrl?.trim()) continue;
    }

    const prevScene = i > 0 ? scenes[i - 1] : null;
    const nextScene = i < scenes.length - 1 ? scenes[i + 1] : null;

    // 진행 상태 표시
    updateScene(scene.id, {
      isGeneratingImage: true,
      generationStatus: `구글 레퍼런스 검색 중... (${i + 1}/${scenes.length})`,
    });

    try {
      const query = buildSearchQuery(scene, prevScene, nextScene, globalContext);
      const response = await searchGoogleImages(query, 1);

      // 새 실행이 시작되면 이전 실행 중단
      if (_autoApplyRunId !== runId) return;

      if (response.items.length > 0) {
        updateScene(scene.id, {
          imageUrl: response.items[0].link,
          isGeneratingImage: false,
          generationStatus: '구글 레퍼런스 적용됨',
          imageUpdatedAfterVideo: !!scene.videoUrl,
        });
        appliedCount++;
      } else {
        updateScene(scene.id, {
          isGeneratingImage: false,
          generationStatus: '검색 결과 없음',
        });
      }
    } catch (err) {
      if (_autoApplyRunId !== runId) return;
      logger.error('[GoogleRef] 자동 배치 실패', `scene=${scene.id} ${err instanceof Error ? err.message : String(err)}`);
      updateScene(scene.id, {
        isGeneratingImage: false,
        generationStatus: '레퍼런스 검색 실패',
      });
    }

    // API rate limit: 200ms 대기
    if (i < scenes.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (_autoApplyRunId === runId) {
    onComplete?.(appliedCount);
  }
}

/** 자동 배치 실행 중단 (새 분석 시작 등) */
export function cancelAutoApply(): void {
  _autoApplyRunId++;
}

/**
 * 이미지 URL을 프록시 경유 data URL로 변환 (CORS 우회)
 * — 브라우저에서 외부 이미지를 canvas에 그릴 때 필요
 */
export async function proxyImageToDataUrl(imageUrl: string): Promise<string> {
  try {
    // Cloudflare Pages Function 프록시 사용
    const res = await monitoredFetch('/api/google-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: imageUrl,
        method: 'GET',
      }),
    });

    if (!res.ok) throw new Error(`프록시 실패: ${res.status}`);

    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // 프록시 실패 시 원본 URL 반환
    return imageUrl;
  }
}
