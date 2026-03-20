/**
 * Google 이미지 검색 레퍼런스 서비스
 * - Google Images HTML 스크래핑 (Cloudflare Pages 프록시 경유)
 * - 대본 맥락에서 검색어 자동 생성
 * - 비용 0원 — AI 이미지 생성 API 호출 없음
 */

import { monitoredFetch } from './apiService';
import { evolinkChat, getEvolinkKey } from './evolinkService';
import { logger } from './LoggerService';
import type { Scene } from '../types';
import { useGoogleCookieStore } from '../stores/googleCookieStore';

// Lazy import to avoid circular dependency — 비동기 초기화 후 동기 접근
let _projectStoreRef: { getState: () => { scenes: Scene[] } } | null = null;
import('../stores/projectStore').then(m => { _projectStoreRef = m.useProjectStore; }).catch(() => {});
const getLatestScenes = (): Scene[] => _projectStoreRef?.getState().scenes ?? [];

// ─── Google Images 설정 ───
const PROXY_PATH = '/api/google-proxy';
const GOOGLE_IMAGE_SEARCH_URL = 'https://www.google.com/search';
const BING_IMAGE_SEARCH_URL = 'https://www.bing.com/images/search';
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

export type ReferenceSearchProvider = 'google' | 'bing' | 'wikimedia';

export interface GoogleSearchResponse {
  items: GoogleImageResult[];
  totalResults: number;
  query: string;
  provider: ReferenceSearchProvider;
}

export interface GoogleReferenceApplySummary {
  appliedCount: number;
  failedCount: number;
  blockedCount: number;
  fallbackCount: number;
}

export const SCENE_REFERENCE_BATCH_CONCURRENCY = 6;

const GOOGLE_IMGRES_REGEX = /\/imgres\?imgurl=[^"'<>\\\s]+/g;
const GOOGLE_THUMBNAIL_REGEX = /https?:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:[^"'<>\\\s]+/g;
const GOOGLE_AF_INIT_REGEX = /AF_initDataCallback\(([\s\S]*?)\);/g;
const GOOGLE_HTTP_DIMENSION_REGEX = /\["((?:https?:)?\/\/[^"]+)",(\d+),(\d+)\]/g;
const WIKIMEDIA_API_URL = 'https://commons.wikimedia.org/w/api.php';
const QUERY_SPLIT_REGEX = /[\n\r.!?…。,:;|/\\]+/;
const WIKIMEDIA_THUMB_WIDTH_MAP: Record<string, string> = {
  medium: '360',
  large: '480',
  xlarge: '720',
  xxlarge: '960',
  huge: '1280',
};
const HANGUL_REGEX = /[가-힣]/;
const WIKIMEDIA_KO_EN_MAP: Record<string, string[]> = {
  '한국': ['korea', 'korean'],
  '한옥': ['hanok', 'traditional house'],
  '서울': ['seoul', 'korea'],
  '부산': ['busan', 'korea'],
  '제주': ['jeju', 'korea'],
  '궁궐': ['palace'],
  '궁전': ['palace'],
  '복도': ['corridor', 'hallway'],
  '절': ['temple'],
  '사찰': ['buddhist temple'],
  '전통': ['traditional', 'heritage'],
  '마당': ['courtyard', 'yard'],
  '햇살': ['sunlight', 'morning light'],
  '아침': ['morning'],
  '새벽': ['dawn'],
  '저녁': ['evening'],
  '거리': ['street'],
  '골목': ['alley', 'street'],
  '마을': ['village'],
  '도시': ['city'],
  '시골': ['countryside', 'village'],
  '시장': ['market'],
  '상인': ['merchant', 'vendor'],
  '집': ['house'],
  '건물': ['building', 'architecture'],
  '풍경': ['landscape', 'scenery'],
  '바다': ['sea', 'ocean'],
  '해변': ['beach'],
  '산': ['mountain'],
  '하늘': ['sky'],
  '노을': ['sunset'],
  '인물': ['person', 'portrait'],
  '사람': ['person'],
};
// [FIX #659/#607] 쿨다운과 캐시 TTL을 완화 — 빈 결과가 30분 캐시되어 연쇄 실패하는 문제 수정
const GOOGLE_SEARCH_COOLDOWN_MS = 5 * 60 * 1000; // 15분 → 5분
const REFERENCE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 30분 → 10분
const GOOGLE_SEARCH_MAX_CONCURRENCY = 2;
const REFERENCE_AI_RERANK_CANDIDATE_COUNT = 8;
const REFERENCE_AI_RERANK_TIMEOUT_MS = 12_000;
const BING_QUERY_VARIANT_LIMIT_FAST = 2;
const BING_QUERY_VARIANT_LIMIT_BEST = 5;
const BING_TARGET_CANDIDATE_COUNT_FAST = 12;
const BING_TARGET_CANDIDATE_COUNT_BEST = 36;
const REFERENCE_QUERY_KO_STOPWORDS = new Set([
  '장면', '모습', '배경', '이미지', '사진', '대본', '맥락', '느낌', '분위기', '있는', '하는', '보이는', '비추는', '그리고', '에서', '으로', '처럼', '대한',
]);
const REFERENCE_QUERY_EN_STOPWORDS = new Set([
  'scene', 'shot', 'image', 'photo', 'picture', 'with', 'from', 'into', 'over', 'under', 'after', 'before', 'during', 'through', 'about', 'the', 'a', 'an', 'and', 'for', 'of', 'in', 'on', 'to',
]);
const LOW_SIGNAL_REFERENCE_DOMAINS = [
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)pinterest\.[a-z.]+$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)tistory\.com$/i,
  /(^|\.)blogspot\.com$/i,
  /(^|\.)tv\.zum\.com$/i,
  /(^|\.)blog\.naver\.com$/i,
  /(^|\.)post\.naver\.com$/i,
  /(^|\.)cafe\.naver\.com$/i,
];
const PREFERRED_REFERENCE_DOMAINS = [
  /(^|\.)go\.kr$/i,
  /(^|\.)or\.kr$/i,
  /(^|\.)ac\.kr$/i,
  /(^|\.)visitkorea\.or\.kr$/i,
  /(^|\.)unesco\.org$/i,
  /(^|\.)wikimedia\.org$/i,
  /museum/i,
  /heritage/i,
];
const STOCK_REFERENCE_DOMAINS = [
  /(^|\.)istockphoto\.com$/i,
  /(^|\.)gettyimages\.com$/i,
  /(^|\.)shutterstock\.com$/i,
  /(^|\.)alamy\.com$/i,
  /(^|\.)dreamstime\.com$/i,
  /(^|\.)pexels\.com$/i,
  /(^|\.)unsplash\.com$/i,
];
const BAD_REFERENCE_TEXT_PATTERN = /\b(logo|icon|banner|thumbnail|poster|template|vector|screenshot|wallpaper|collage)\b|로고|아이콘|배너|썸네일|포스터|템플릿|벡터|스크린샷|콜라주/i;
const ARTICLE_OR_SOCIAL_TEXT_PATTERN = /\b(facebook|instagram|youtube|shorts|article|news|blog|post|press)\b|기사|뉴스|블로그|페이스북|유튜브/i;
const ARTICLE_CONTEXT_PATH_PATTERN = /(article(view)?|\/news\/|\/arti\/|\/entry\/|\/story\/|\/press\/|\/v\/)/i;
const PHOTO_INTENT_TEXT_PATTERN = /\b(photo|image|picture|gallery|stock)\b|사진|이미지|포토/i;
const LOW_VALUE_IMAGE_URL_PATTERN = /(avatar|profile|logo|icon|sprite|banner|thumb|thumbnail|poster|template|watermark)/i;
const ACTION_HINT_PATTERNS: Array<{ pattern: RegExp; labels: string[] }> = [
  { pattern: /걷|걸어|산책|이동/, labels: ['walking', 'walkway'] },
  { pattern: /정리|진열|판매|상인|장사/, labels: ['vendor', 'market stall', 'arranging'] },
  { pattern: /비치|비추|햇살|빛/, labels: ['sunlight', 'light'] },
  { pattern: /노을|석양/, labels: ['sunset', 'golden hour'] },
  { pattern: /해변|바다/, labels: ['beach', 'sea'] },
  { pattern: /궁궐|궁전/, labels: ['palace'] },
];

type CachedReferenceSearch = {
  expiresAt: number;
  response: GoogleSearchResponse;
};

const referenceSearchCache = new Map<string, CachedReferenceSearch>();
const referenceSearchInflight = new Map<string, Promise<GoogleSearchResponse>>();
let googleSearchCooldownUntil = 0;
let googleSearchActiveCount = 0;
const googleSearchWaiters: Array<() => void> = [];

interface BingImageMetadata {
  murl?: string;
  purl?: string;
  turl?: string;
  t?: string;
  desc?: string;
  ow?: number;
  oh?: number;
}

export interface ReferenceSearchContext {
  scene?: Scene;
  prevScene?: Scene | null;
  nextScene?: Scene | null;
  globalContext?: string;
}

interface ReferenceSearchPlan {
  primaryQuery: string;
  alternativeQueries: string[];
  criticalPhrases: string[];
  softPhrases: string[];
  contextSignature: string;
  summary: string;
}

// ─── 검색어 생성 로직 ───

/** AI 생성용 잡음 제거 (8k, cinematic lighting 등) */
const NOISE_PATTERNS = /\b(8k|4k|hdr|cinematic|masterpiece|highly detailed|no text|hyper.?realistic|ultra.?realistic|photorealistic|octane render|unreal engine|detailed|best quality|high quality|digital art|concept art|illustration|professional|award.?winning|trending on artstation|artstation|deviantart|pixiv)\b/gi;

function normalizeQueryText(value: string): string {
  return value
    .replace(NOISE_PATTERNS, ' ')
    .replace(/[()[\]{}"'`“”‘’]/g, ' ')
    .replace(/[_*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeQueryParts(parts: string[]): string[] {
  const deduped: string[] = [];

  for (const raw of parts) {
    const part = normalizeQueryText(raw);
    if (part.length < 2) continue;

    const duplicateIndex = deduped.findIndex((existing) => {
      const a = existing.toLowerCase();
      const b = part.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });

    if (duplicateIndex >= 0) {
      if (part.length > deduped[duplicateIndex].length) {
        deduped[duplicateIndex] = part;
      }
      continue;
    }

    deduped.push(part);
  }

  return deduped;
}

function extractQueryFragments(value: string | undefined, maxFragments: number, maxLen: number): string[] {
  if (!value) return [];

  const normalized = normalizeQueryText(value);
  if (!normalized) return [];

  const splitParts = normalized
    .split(QUERY_SPLIT_REGEX)
    .map((part) => normalizeQueryText(part).slice(0, maxLen).trim())
    .filter((part) => part.length >= 2);

  const fragments = dedupeQueryParts(splitParts.length > 0 ? splitParts : [normalized.slice(0, maxLen)]);
  return fragments.slice(0, maxFragments);
}

function pushQueryFragments(parts: string[], value: string | undefined, maxFragments: number, maxLen: number): void {
  const next = dedupeQueryParts([...parts, ...extractQueryFragments(value, maxFragments, maxLen)]);
  parts.splice(0, parts.length, ...next.slice(0, 4));
}

function joinQueryParts(parts: string[], maxParts: number = 5, maxLen: number = 90): string {
  const deduped = dedupeQueryParts(parts).slice(0, maxParts);
  let combined = '';

  for (const part of deduped) {
    const candidate = combined ? `${combined} ${part}` : part;
    if (candidate.length > maxLen) {
      if (!combined) {
        return part.slice(0, maxLen).trim();
      }
      break;
    }
    combined = candidate;
  }

  return combined.trim();
}

function tokenizeReferenceText(value: string): string[] {
  const tokens = normalizeQueryText(value)
    .toLowerCase()
    .split(/[\s/|,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  return Array.from(new Set(tokens.filter((token) => (
    !REFERENCE_QUERY_KO_STOPWORDS.has(token) && !REFERENCE_QUERY_EN_STOPWORDS.has(token)
  ))));
}

function collectMappedEnglishTerms(value: string): string[] {
  const tokens = tokenizeReferenceText(value);
  const mappedTerms: string[] = [];

  for (const token of tokens) {
    const directMatch = WIKIMEDIA_KO_EN_MAP[token];
    if (directMatch) {
      mappedTerms.push(...directMatch);
      continue;
    }

    if (/^[a-z0-9-]+$/i.test(token)) {
      mappedTerms.push(token);
      continue;
    }

    for (const [ko, english] of Object.entries(WIKIMEDIA_KO_EN_MAP)) {
      if (token.includes(ko) || ko.includes(token)) {
        mappedTerms.push(...english);
        break;
      }
    }
  }

  return dedupeQueryParts(mappedTerms).slice(0, 8);
}

function collectActionHintTerms(value: string): string[] {
  const hints: string[] = [];

  for (const { pattern, labels } of ACTION_HINT_PATTERNS) {
    if (pattern.test(value)) {
      hints.push(...labels);
    }
  }

  return dedupeQueryParts(hints);
}

function buildSearchPlanFromQuery(query: string): ReferenceSearchPlan {
  const normalizedQuery = normalizeQueryText(query) || '풍경 사진';
  const fragments = extractQueryFragments(normalizedQuery, 3, 28);
  const mappedEnglish = collectMappedEnglishTerms(normalizedQuery);
  const primaryQuery = joinQueryParts([normalizedQuery], 1);
  const alternativeQueries = dedupeQueryParts([
    joinQueryParts(fragments, 3, 80),
    joinQueryParts([...mappedEnglish, 'photo'], 6, 80),
  ]).filter((candidate) => candidate && candidate !== primaryQuery);

  return {
    primaryQuery,
    alternativeQueries,
    criticalPhrases: dedupeQueryParts([primaryQuery, ...mappedEnglish]).slice(0, 8),
    softPhrases: dedupeQueryParts([...fragments, ...mappedEnglish]).slice(0, 10),
    contextSignature: joinQueryParts([primaryQuery, ...mappedEnglish], 6, 96) || primaryQuery,
    summary: `검색어: ${primaryQuery}`,
  };
}

function buildReferenceSearchPlan(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
): ReferenceSearchPlan {
  const criticalParts: string[] = [];
  const softParts: string[] = [];

  pushQueryFragments(criticalParts, scene.entityName, 1, 36);
  pushQueryFragments(criticalParts, scene.sceneLocation, 1, 28);
  pushQueryFragments(criticalParts, scene.sceneCulture, 1, 24);
  pushQueryFragments(criticalParts, scene.sceneEra, 1, 18);

  if (criticalParts.length < 4) pushQueryFragments(criticalParts, scene.visualDescriptionKO, 2, 24);
  if (criticalParts.length < 4) pushQueryFragments(criticalParts, scene.scriptText, 2, 22);
  if (criticalParts.length < 4) pushQueryFragments(criticalParts, globalContext, 1, 22);
  if (criticalParts.length < 3) pushQueryFragments(criticalParts, prevScene?.sceneLocation || prevScene?.visualDescriptionKO, 1, 20);
  if (criticalParts.length < 3) pushQueryFragments(criticalParts, nextScene?.sceneLocation || nextScene?.visualDescriptionKO, 1, 20);

  pushQueryFragments(softParts, scene.visualDescriptionKO, 2, 24);
  pushQueryFragments(softParts, scene.scriptText, 2, 22);
  pushQueryFragments(softParts, scene.visualPrompt, 1, 24);
  pushQueryFragments(softParts, globalContext, 1, 22);

  const joinedSceneText = [
    scene.visualDescriptionKO,
    scene.scriptText,
    scene.visualPrompt,
    globalContext,
  ].filter(Boolean).join(' ');
  const mappedEnglish = collectMappedEnglishTerms(joinedSceneText);
  const actionHints = collectActionHintTerms(joinedSceneText);

  const primaryQuery = joinQueryParts([
    scene.sceneLocation || '',
    scene.entityName || '',
    scene.sceneCulture || '',
    scene.sceneEra || '',
    ...actionHints.slice(0, 2),
    mappedEnglish[0] || '',
  ], 6, 72) || joinQueryParts([
    ...criticalParts.slice(0, 3),
    softParts[0] || '',
    actionHints[0] || '',
  ], 5, 72) || '풍경 사진';

  const conciseQuery = joinQueryParts([
    scene.sceneLocation || criticalParts[0] || '',
    scene.entityName || criticalParts[1] || '',
    scene.sceneCulture || '',
    actionHints[0] || '',
  ], 4, 72);

  const englishQuery = joinQueryParts([
    scene.sceneLocation || '',
    ...mappedEnglish,
    ...actionHints,
    'photo',
  ], 7, 80);

  const alternativeQueries = dedupeQueryParts([
    englishQuery,
    conciseQuery,
    joinQueryParts([
      scene.sceneLocation || '',
      scene.visualDescriptionKO || scene.scriptText || '',
      globalContext || '',
    ], 4, 76),
    joinQueryParts([
      ...criticalParts.slice(0, 2),
      softParts[0] || '',
      actionHints[0] || '',
    ], 4, 72),
  ]).filter((candidate) => candidate && candidate !== primaryQuery);

  const criticalPhrases = dedupeQueryParts([
    scene.entityName || '',
    scene.sceneLocation || '',
    scene.sceneCulture || '',
    scene.sceneEra || '',
    ...mappedEnglish.slice(0, 4),
    ...criticalParts,
  ]).slice(0, 10);

  const softPhrases = dedupeQueryParts([
    ...softParts,
    ...mappedEnglish,
    ...actionHints,
  ]).slice(0, 12);

  const summaryParts = [
    scene.entityName ? `주체: ${scene.entityName}` : '',
    scene.sceneLocation ? `장소: ${scene.sceneLocation}` : '',
    scene.sceneEra ? `시대: ${scene.sceneEra}` : '',
    scene.sceneCulture ? `문화: ${scene.sceneCulture}` : '',
    scene.visualDescriptionKO ? `장면: ${scene.visualDescriptionKO}` : '',
    scene.scriptText ? `대본: ${scene.scriptText}` : '',
    globalContext ? `전체맥락: ${globalContext}` : '',
  ].filter(Boolean);

  return {
    primaryQuery,
    alternativeQueries,
    criticalPhrases,
    softPhrases,
    contextSignature: joinQueryParts([
      ...criticalPhrases.slice(0, 4),
      primaryQuery,
    ], 6, 96) || primaryQuery,
    summary: summaryParts.join(' | ').slice(0, 320),
  };
}

/** 장면 데이터에서 검색 키워드 추출 */
export function buildSearchQuery(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
): string {
  return buildReferenceSearchPlan(scene, prevScene, nextScene, globalContext).primaryQuery;
}

function getGoogleLocale(): { hl: string; gl: string } {
  const locale = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ko-kr';
  return locale.startsWith('ko') ? { hl: 'ko', gl: 'kr' } : { hl: 'en', gl: 'us' };
}

function getBingLocale(): { market: string; cc: string } {
  const locale = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ko-kr';
  return locale.startsWith('ko')
    ? { market: 'ko-KR', cc: 'KR' }
    : { market: 'en-US', cc: 'US' };
}

function getGoogleSearchCookie(): string {
  try {
    const { cookie, isValid } = useGoogleCookieStore.getState();
    return isValid ? cookie.trim() : '';
  } catch {
    return '';
  }
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanBingText(value: string | null | undefined): string {
  return cleanText(decodeHtmlEntities(value || '').replace(/[]/g, ''));
}

function buildWikimediaQueryCandidates(query: string): string[] {
  const normalized = normalizeQueryText(query);
  if (!normalized) return ['landscape photo'];

  const candidates = [normalized];
  if (!HANGUL_REGEX.test(normalized)) {
    return candidates;
  }

  const tokenSet = new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  const primaryTerms: string[] = [];
  const secondaryTerms: string[] = [];
  for (const token of tokenSet) {
    const mapped = WIKIMEDIA_KO_EN_MAP[token];
    if (mapped) {
      primaryTerms.push(mapped[0]);
      secondaryTerms.push(...mapped.slice(1));
      continue;
    }

    for (const [ko, english] of Object.entries(WIKIMEDIA_KO_EN_MAP)) {
      if (token.includes(ko) || ko.includes(token)) {
        primaryTerms.push(english[0]);
        secondaryTerms.push(...english.slice(1));
        break;
      }
    }
  }

  const primaryCandidate = dedupeQueryParts(primaryTerms)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const expandedCandidate = dedupeQueryParts([...primaryTerms, ...secondaryTerms])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (primaryCandidate) {
    candidates.unshift(primaryCandidate);
    if (!/\bkorean\b/i.test(primaryCandidate)) {
      candidates.unshift(`korean ${primaryCandidate}`.trim());
    }
    if (!/\bkorea\b/i.test(primaryCandidate)) {
      candidates.unshift(`korea ${primaryCandidate}`.trim());
    }
  }

  if (expandedCandidate && expandedCandidate !== primaryCandidate) {
    candidates.splice(primaryCandidate ? 3 : 0, 0, expandedCandidate);
  }

  if (!primaryCandidate) {
    candidates.unshift(`korea ${normalized}`.trim());
  }

  return dedupeQueryParts(candidates).slice(0, 4);
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

function buildBingSearchUrl(query: string, start: number): string {
  const { market, cc } = getBingLocale();
  const params = new URLSearchParams({
    q: query,
    form: 'HDRSC3',
    first: String(Math.max(1, start)),
    count: String(GOOGLE_IMAGE_RESULT_WINDOW),
    mkt: market,
    setlang: market,
    cc,
  });

  return `${BING_IMAGE_SEARCH_URL}?${params.toString()}`;
}

function getReferencePlan(
  query: string,
  context?: ReferenceSearchContext,
): ReferenceSearchPlan {
  return context?.scene
    ? buildReferenceSearchPlan(context.scene, context.prevScene, context.nextScene, context.globalContext)
    : buildSearchPlanFromQuery(query);
}

function getReferenceSearchCacheKey(
  query: string,
  start: number,
  imgSize: string,
  rankingMode: 'fast' | 'best' = 'fast',
  contextSignature: string = '',
): string {
  return `${query}::${start}::${imgSize}::${rankingMode}::${contextSignature}`;
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function getReferenceDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isLowSignalReferenceDomain(domain: string): boolean {
  return !!domain && matchesAnyPattern(domain, LOW_SIGNAL_REFERENCE_DOMAINS);
}

function buildReferenceCorpus(item: GoogleImageResult): string {
  return normalizeQueryText([
    item.title,
    item.snippet,
    item.displayLink,
    item.contextLink,
  ].filter(Boolean).join(' ')).toLowerCase();
}

function countPhraseMatches(corpus: string, phrases: string[]): number {
  const uniqueMatches = new Set<string>();

  for (const phrase of phrases) {
    const normalized = normalizeQueryText(phrase).toLowerCase();
    if (normalized.length < 2) continue;
    if (corpus.includes(normalized)) {
      uniqueMatches.add(normalized);
    }
  }

  return uniqueMatches.size;
}

function isLowSignalReferenceResult(item: GoogleImageResult): boolean {
  const linkDomain = getReferenceDomain(item.link);
  const contextDomain = getReferenceDomain(item.contextLink || item.link);
  const domain = contextDomain || linkDomain;
  const corpus = buildReferenceCorpus(item);
  const contextLink = item.contextLink || '';

  if (isLowSignalReferenceDomain(domain)) return true;
  if (ARTICLE_CONTEXT_PATH_PATTERN.test(contextLink) && !PHOTO_INTENT_TEXT_PATTERN.test(corpus)) return true;
  if (
    ARTICLE_OR_SOCIAL_TEXT_PATTERN.test(corpus)
    && !PHOTO_INTENT_TEXT_PATTERN.test(corpus)
    && !matchesAnyPattern(domain, PREFERRED_REFERENCE_DOMAINS)
    && !matchesAnyPattern(domain, STOCK_REFERENCE_DOMAINS)
  ) {
    return true;
  }
  if (LOW_VALUE_IMAGE_URL_PATTERN.test(item.link) && ARTICLE_OR_SOCIAL_TEXT_PATTERN.test(corpus)) return true;
  return false;
}

function partitionReferenceResultsBySignal(items: GoogleImageResult[]): {
  preferred: GoogleImageResult[];
  deferred: GoogleImageResult[];
} {
  const preferred = items.filter((item) => !isLowSignalReferenceResult(item));
  const deferred = items.filter((item) => isLowSignalReferenceResult(item));

  if (preferred.length >= Math.min(6, Math.max(3, Math.ceil(items.length / 3)))) {
    return { preferred, deferred };
  }

  return {
    preferred: items,
    deferred: [],
  };
}

function scoreReferenceResult(
  item: GoogleImageResult,
  plan: ReferenceSearchPlan,
  provider: ReferenceSearchProvider,
): number {
  const corpus = buildReferenceCorpus(item);
  const linkDomain = getReferenceDomain(item.link);
  const contextDomain = getReferenceDomain(item.contextLink || item.link);
  const domain = contextDomain || linkDomain;
  const criticalMatchCount = countPhraseMatches(corpus, plan.criticalPhrases);
  const softMatchCount = countPhraseMatches(corpus, plan.softPhrases);
  const width = item.width || 0;
  const height = item.height || 0;
  let score = provider === 'google' ? 4 : 0;

  score += criticalMatchCount * 8;
  score += Math.min(softMatchCount, 4) * 3;

  if (criticalMatchCount === 0 && plan.criticalPhrases.length > 0) {
    score -= 10;
  } else if (criticalMatchCount >= 2) {
    score += 4;
  }

  if (!domain) {
    score -= 3;
  } else {
    if (isLowSignalReferenceDomain(domain)) score -= 20;
    if (matchesAnyPattern(domain, PREFERRED_REFERENCE_DOMAINS)) score += 6;
    if (matchesAnyPattern(domain, STOCK_REFERENCE_DOMAINS)) score += 1;
  }

  if (BAD_REFERENCE_TEXT_PATTERN.test(corpus)) score -= 10;
  if (ARTICLE_OR_SOCIAL_TEXT_PATTERN.test(corpus) && criticalMatchCount < 2) score -= 6;
  if (LOW_VALUE_IMAGE_URL_PATTERN.test(item.link) || LOW_VALUE_IMAGE_URL_PATTERN.test(item.contextLink)) score -= 8;

  if (width > 0 && height > 0) {
    const minSize = Math.min(width, height);
    const maxSize = Math.max(width, height);
    if (minSize < 300) score -= 4;
    if (minSize >= 720) score += 2;
    if (maxSize / Math.max(1, minSize) > 3) score -= 3;
  }

  if (item.title.trim().length < 4 && item.snippet.trim().length < 8) {
    score -= 2;
  }

  return score;
}

function sortReferenceResultsHeuristically(
  items: GoogleImageResult[],
  plan: ReferenceSearchPlan,
  provider: ReferenceSearchProvider,
): GoogleImageResult[] {
  return items
    .map((item) => ({
      item,
      score: scoreReferenceResult(item, plan, provider),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.item.width * b.item.height) !== (a.item.width * a.item.height)) {
        return (b.item.width * b.item.height) - (a.item.width * a.item.height);
      }
      return b.item.title.length - a.item.title.length;
    })
    .map(({ item }) => item);
}

function extractStructuredJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) candidates.push(codeBlockMatch[1].trim());

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function rerankReferenceResultsWithAi(
  items: GoogleImageResult[],
  plan: ReferenceSearchPlan,
  provider: ReferenceSearchProvider,
): Promise<GoogleImageResult[]> {
  if (items.length < 2 || !getEvolinkKey()) {
    return items;
  }

  const candidates = items.slice(0, REFERENCE_AI_RERANK_CANDIDATE_COUNT).map((item, index) => ({
    id: `c${index + 1}`,
    title: item.title,
    snippet: item.snippet,
    displayLink: item.displayLink,
    contextLink: item.contextLink,
  }));

  try {
    const response = await evolinkChat([
      {
        role: 'system',
        content: 'You rank storyboard reference image search candidates. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: [
          '장면 요약:',
          plan.summary,
          `기본 검색어: ${plan.primaryQuery}`,
          `공급자: ${provider}`,
          '우선 규칙:',
          '- 장면의 주체/장소/시대/문화/행동과 가장 직접적으로 맞는 사진을 우선하세요.',
          '- 뉴스 기사 헤더, 블로그 썸네일, 소셜 게시물, 유튜브/페이스북 이미지, 로고, 포스터, 콜라주, 템플릿은 강하게 배제하세요.',
          '- 제목/설명/도메인만 보고도 장면과 맞는 후보를 위로 올리세요.',
          `후보: ${JSON.stringify(candidates)}`,
          '반환 형식: {"orderedIds":["c1","c2"],"rejectedIds":["c7"],"reason":"short"}',
        ].join('\n'),
      },
    ], {
      temperature: 0.1,
      maxTokens: 700,
      timeoutMs: REFERENCE_AI_RERANK_TIMEOUT_MS,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractStructuredJsonObject(raw);
    const orderedIdsRaw = parsed?.orderedIds;
    const orderedIds = Array.isArray(orderedIdsRaw)
      ? orderedIdsRaw.filter((value): value is string => typeof value === 'string')
      : [];

    if (orderedIds.length === 0) {
      return items;
    }

    const idToItem = new Map(candidates.map((candidate, index) => [candidate.id, items[index]]));
    const aiRanked = orderedIds
      .map((id) => idToItem.get(id))
      .filter((item): item is GoogleImageResult => Boolean(item));
    const usedLinks = new Set(aiRanked.map((item) => item.link));

    return [
      ...aiRanked,
      ...items.filter((item) => !usedLinks.has(item.link)),
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[GoogleRef] Flash Lite 재정렬 실패', message);
    return items;
  }
}

async function rankReferenceResults(
  items: GoogleImageResult[],
  query: string,
  provider: ReferenceSearchProvider,
  rankingMode: 'fast' | 'best',
  context?: ReferenceSearchContext,
): Promise<GoogleImageResult[]> {
  const plan = getReferencePlan(query, context);
  const { preferred, deferred } = partitionReferenceResultsBySignal(items);
  const heuristicRanked = sortReferenceResultsHeuristically(preferred, plan, provider);
  const deferredRanked = deferred.length > 0
    ? sortReferenceResultsHeuristically(deferred, plan, provider)
    : [];

  if (rankingMode !== 'best') {
    return [...heuristicRanked, ...deferredRanked];
  }

  const reranked = await rerankReferenceResultsWithAi(heuristicRanked, plan, provider);
  return [...reranked, ...deferredRanked];
}

async function proxyFetchReferenceSearch(targetUrl: string, cookie?: string): Promise<Response> {
  return monitoredFetch(PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: 'GET',
      headers: GOOGLE_IMAGE_HEADERS,
      cookie,
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

function getReferenceDedupKeys(item: GoogleImageResult): string[] {
  const normalizedLink = item.link.split('#')[0];
  const normalizedContextLink = (item.contextLink || '').split('#')[0];
  const normalizedTitle = cleanText(item.title).toLowerCase();
  const normalizedDisplayLink = cleanText(item.displayLink).toLowerCase();

  return [
    normalizedLink,
    normalizedContextLink && normalizedTitle ? `${normalizedContextLink}::${normalizedTitle}` : '',
    normalizedDisplayLink && normalizedTitle ? `${normalizedDisplayLink}::${normalizedTitle}` : '',
  ].filter(Boolean);
}

function pushUniqueResult(results: GoogleImageResult[], seen: Set<string>, item: GoogleImageResult): void {
  if (!item.link) return;
  const dedupKeys = getReferenceDedupKeys(item);
  if (dedupKeys.some((key) => seen.has(key))) return;
  results.push(item);
  dedupKeys.forEach((key) => seen.add(key));
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

function parseBingMetadata(value: string | null): BingImageMetadata | null {
  if (!value) return null;

  try {
    return JSON.parse(decodeHtmlEntities(value)) as BingImageMetadata;
  } catch {
    return null;
  }
}

function extractBingResults(doc: Document): GoogleImageResult[] {
  const results: GoogleImageResult[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(doc.querySelectorAll('a.iusc'));

  for (const anchor of anchors) {
    const metadata = parseBingMetadata(anchor.getAttribute('m'));
    if (!metadata) continue;

    const link = normalizeUrl(metadata.murl);
    if (!isUsefulImageUrl(link)) continue;

    const contextLink = normalizeUrl(metadata.purl);
    pushUniqueResult(results, seen, {
      title: cleanBingText(metadata.t || anchor.getAttribute('title') || anchor.getAttribute('aria-label')) || getDisplayLink(contextLink, link),
      link,
      displayLink: getDisplayLink(contextLink, link),
      snippet: cleanBingText(metadata.desc || metadata.t) || getDisplayLink(contextLink, link),
      thumbnailLink: normalizeUrl(metadata.turl) || extractThumbnailFromElement(anchor),
      contextLink,
      width: Number.isFinite(metadata.ow) ? metadata.ow || 0 : 0,
      height: Number.isFinite(metadata.oh) ? metadata.oh || 0 : 0,
    });
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
  if (/SG_SS=|window\.sgs|srcpg=sgs|cad=sg_trbl|If you're having trouble accessing Google Search/i.test(html)) {
    return '구글 검색 보안 확인 페이지가 반환되었습니다. 잠시 후 다시 시도해주세요.';
  }
  return null;
}

function isBlockedSearchMessage(message: string): boolean {
  return /차단|captcha|429|동의 페이지|보안 확인 페이지|trouble accessing google search/i.test(message);
}

function isGoogleSearchCooldownActive(): boolean {
  return Date.now() < googleSearchCooldownUntil;
}

function getCachedReferenceSearch(key: string): GoogleSearchResponse | null {
  const cached = referenceSearchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    referenceSearchCache.delete(key);
    return null;
  }
  return cached.response;
}

function setCachedReferenceSearch(key: string, response: GoogleSearchResponse): void {
  // [FIX #659] 빈 결과는 짧게 캐시 (2분) — 재시도 시 빠르게 다시 검색
  const hasResults = response.items && response.items.length > 0;
  const ttl = hasResults ? REFERENCE_SEARCH_CACHE_TTL_MS : 2 * 60 * 1000;
  referenceSearchCache.set(key, {
    expiresAt: Date.now() + ttl,
    response,
  });
}

function markGoogleSearchRateLimited(message: string): void {
  const nextCooldownUntil = Date.now() + GOOGLE_SEARCH_COOLDOWN_MS;
  if (nextCooldownUntil <= googleSearchCooldownUntil) return;
  googleSearchCooldownUntil = nextCooldownUntil;
  logger.warn(
    `[GoogleRef] Google 검색 차단 감지 — ${Math.round(GOOGLE_SEARCH_COOLDOWN_MS / 60000)}분간 Google 스킵, Wikimedia 직행`,
    message,
  );
}

async function acquireGoogleSearchSlot(): Promise<() => void> {
  if (googleSearchActiveCount >= GOOGLE_SEARCH_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      googleSearchWaiters.push(resolve);
    });
  }

  googleSearchActiveCount += 1;

  return () => {
    googleSearchActiveCount = Math.max(0, googleSearchActiveCount - 1);
    const next = googleSearchWaiters.shift();
    next?.();
  };
}

interface WikimediaImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
}

interface WikimediaPage {
  title: string;
  index?: number;
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaApiResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

function buildWikimediaSearchUrl(query: string, start: number, imgSize: string): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(GOOGLE_IMAGE_RESULT_WINDOW),
    gsroffset: String(Math.max(0, start - 1)),
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: WIKIMEDIA_THUMB_WIDTH_MAP[imgSize] || WIKIMEDIA_THUMB_WIDTH_MAP.large,
    format: 'json',
    origin: '*',
  });

  return `${WIKIMEDIA_API_URL}?${params.toString()}`;
}

function formatWikimediaTitle(title: string): string {
  return title
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

async function searchWikimediaImages(
  query: string,
  start: number = 1,
  imgSize: string = 'large',
): Promise<GoogleSearchResponse> {
  const queryCandidates = buildWikimediaQueryCandidates(query);
  let lastResponse: GoogleSearchResponse | null = null;

  for (const candidate of queryCandidates) {
    const url = buildWikimediaSearchUrl(candidate, start, imgSize);
    logger.info('[GoogleRef] Wikimedia 폴백 검색', `query="${candidate}" start=${start}`);

    const res = await monitoredFetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`대체 이미지 검색 실패 (${res.status})`);
    }

    const data = await res.json() as WikimediaApiResponse;
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    const items = pages.flatMap((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.url) return [];

      return [{
        title: formatWikimediaTitle(page.title),
        link: info.url,
        displayLink: 'commons.wikimedia.org',
        snippet: formatWikimediaTitle(page.title),
        thumbnailLink: info.thumburl || info.url,
        contextLink: info.descriptionurl || '',
        width: Number.isFinite(info.width) ? info.width || 0 : 0,
        height: Number.isFinite(info.height) ? info.height || 0 : 0,
      }];
    });

    lastResponse = {
      items,
      totalResults: items.length,
      query: candidate,
      provider: 'wikimedia',
    };

    if (items.length > 0) {
      return lastResponse;
    }
  }

  return lastResponse || {
    items: [],
    totalResults: 0,
    query,
    provider: 'wikimedia',
  };
}

async function searchBingImages(
  query: string,
  start: number = 1,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  const plan = getReferencePlan(query, context);
  const queryCandidates = dedupeQueryParts([
    joinQueryParts([plan.primaryQuery, 'photo'], 6, 84),
    ...plan.alternativeQueries.flatMap((candidate) => (
      PHOTO_INTENT_TEXT_PATTERN.test(candidate)
        ? [candidate]
        : [joinQueryParts([candidate, 'photo'], 6, 84), candidate]
    )),
    query,
  ]).slice(0, rankingMode === 'best' ? BING_QUERY_VARIANT_LIMIT_BEST : BING_QUERY_VARIANT_LIMIT_FAST);
  const targetCandidateCount = rankingMode === 'best' ? BING_TARGET_CANDIDATE_COUNT_BEST : BING_TARGET_CANDIDATE_COUNT_FAST;
  let mergedResults: GoogleImageResult[] = [];

  for (const candidate of queryCandidates) {
    const url = buildBingSearchUrl(candidate, start);
    logger.info('[GoogleRef] Bing 폴백 검색', `query="${candidate}" start=${start}`);

    const res = await proxyFetchReferenceSearch(url);
    if (!res.ok) {
      throw new Error(`Bing 이미지 검색 실패 (${res.status})`);
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    mergedResults = mergeUniqueResults(mergedResults, extractBingResults(doc));
    if (mergedResults.length >= targetCandidateCount) break;
  }

  const ranked = await rankReferenceResults(mergedResults, plan.primaryQuery, 'bing', rankingMode, context);
  const items = ranked.slice(0, GOOGLE_IMAGE_RESULT_WINDOW);
  return {
    items,
    totalResults: ranked.length,
    query: plan.primaryQuery,
    provider: 'bing',
  };
}

async function searchAlternativeReferenceImages(
  query: string,
  start: number,
  imgSize: string,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  try {
    const bingResponse = await searchBingImages(query, start, context, rankingMode);
    if (bingResponse.items.length > 0) {
      return bingResponse;
    }
    logger.warn('[GoogleRef] Bing 결과 0건, Wikimedia 폴백 시도', query);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[GoogleRef] Bing 폴백 실패', message);
  }

  return searchWikimediaImages(query, start, imgSize);
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
  options?: {
    context?: ReferenceSearchContext;
    rankingMode?: 'fast' | 'best';
    bypassEmptyCache?: boolean;
  },
): Promise<GoogleSearchResponse> {
  const normalizedQuery = normalizeQueryText(query) || '풍경 사진';
  const rankingMode = options?.rankingMode || 'fast';
  const bypassEmptyCache = options?.bypassEmptyCache === true;
  const plan = getReferencePlan(normalizedQuery, options?.context);
  const cacheKey = getReferenceSearchCacheKey(
    normalizedQuery,
    start,
    imgSize,
    rankingMode,
    plan.contextSignature,
  );
  const cached = getCachedReferenceSearch(cacheKey);
  if (cached && !(bypassEmptyCache && cached.items.length === 0)) return cached;

  const inflight = referenceSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async (): Promise<GoogleSearchResponse> => {
    if (isGoogleSearchCooldownActive()) {
      const fallbackResponse = await searchAlternativeReferenceImages(normalizedQuery, start, imgSize, options?.context, rankingMode);
      setCachedReferenceSearch(cacheKey, fallbackResponse);
      return fallbackResponse;
    }

    const releaseSlot = await acquireGoogleSearchSlot();
    try {
      if (isGoogleSearchCooldownActive()) {
        const fallbackResponse = await searchAlternativeReferenceImages(normalizedQuery, start, imgSize, options?.context, rankingMode);
        setCachedReferenceSearch(cacheKey, fallbackResponse);
        return fallbackResponse;
      }

      const url = buildSearchUrl(normalizedQuery, start, imgSize);
      const googleCookie = getGoogleSearchCookie();
      logger.info('[GoogleRef] 검색 요청', `query="${normalizedQuery}" start=${start}`);

      try {
        const res = await proxyFetchReferenceSearch(url, googleCookie || undefined);

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
        const rankedItems = await rankReferenceResults(allItems, plan.primaryQuery, 'google', rankingMode, options?.context);
        const pageOffset = (Math.max(1, start) - 1) % GOOGLE_IMAGE_PAGE_SIZE;
        const items = rankedItems.slice(pageOffset, pageOffset + GOOGLE_IMAGE_RESULT_WINDOW);

        if (items.length > 0) {
          const googleResponse = {
            items,
            totalResults: rankedItems.length,
            query: plan.primaryQuery,
            provider: 'google' as const,
          };
          setCachedReferenceSearch(cacheKey, googleResponse);
          return googleResponse;
        }

        logger.warn('[GoogleRef] 구글 결과 0건, Bing 폴백 시도', normalizedQuery);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isBlockedSearchMessage(message) && !/구글 검색 실패/i.test(message)) {
          throw error;
        }
        if (isBlockedSearchMessage(message)) {
          markGoogleSearchRateLimited(message);
        }
        logger.warn('[GoogleRef] Bing/Wikimedia 폴백 전환', message);
      }
    } finally {
      releaseSlot();
    }

    const fallbackResponse = await searchAlternativeReferenceImages(normalizedQuery, start, imgSize, options?.context, rankingMode);
    setCachedReferenceSearch(cacheKey, fallbackResponse);
    return fallbackResponse;
  })();

  referenceSearchInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    referenceSearchInflight.delete(cacheKey);
  }
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
  rankingMode: 'fast' | 'best' = 'best',
): Promise<GoogleSearchResponse> {
  const query = buildSearchQuery(scene, prevScene, nextScene, globalContext);
  return searchGoogleImages(query, startIndex, 'large', {
    context: { scene, prevScene, nextScene, globalContext },
    rankingMode,
  });
}

/**
 * 스토리보드 생성 직후 자동 구글 레퍼런스 이미지 배치
 * - 제한 병렬로 검색 → 첫 번째 결과를 imageUrl에 적용
 * - 이미 imageUrl이 있는 씬은 건너뜀
 * - Google은 내부 동시성 제한 + 429 쿨다운, 차단 시 Wikimedia 직행
 * - runId로 중복 실행 방지 (새 분석 시 이전 실행 취소)
 */
let _autoApplyRunId = 0;

export async function autoApplyGoogleReferences(
  scenes: Scene[],
  globalContext: string,
  updateScene: (id: string, partial: Partial<Scene>) => void,
  onComplete?: (summary: GoogleReferenceApplySummary) => void,
  forceReplace?: boolean,
): Promise<void> {
  const runId = ++_autoApplyRunId;
  let appliedCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  let fallbackCount = 0;
  let startedCount = 0;
  const candidates = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => !!scene.scriptText || !!scene.visualPrompt);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      if (_autoApplyRunId !== runId) return;

      const current = candidates[cursor];
      cursor += 1;
      if (!current) return;

      const { scene, index } = current;

      if (!forceReplace) {
        const latestScenes = getLatestScenes();
        const latestScene = latestScenes.find((s) => s.id === scene.id);
        if (latestScene?.imageUrl?.trim()) continue;
      }

      startedCount += 1;
      const prevScene = index > 0 ? scenes[index - 1] : null;
      const nextScene = index < scenes.length - 1 ? scenes[index + 1] : null;

      updateScene(scene.id, {
        isGeneratingImage: true,
        generationStatus: `레퍼런스 검색 중... (${startedCount}/${candidates.length})`,
      });
      const query = buildSearchQuery(scene, prevScene, nextScene, globalContext);

      try {
        const response = await searchGoogleImages(query, 1, 'large', {
          context: { scene, prevScene, nextScene, globalContext },
          rankingMode: 'fast',
          bypassEmptyCache: true,
        });

        if (_autoApplyRunId !== runId) return;

        if (response.items.length > 0) {
          if (response.provider !== 'google') fallbackCount++;
          updateScene(scene.id, {
            imageUrl: response.items[0].link,
            isGeneratingImage: false,
            generationStatus: response.provider === 'google' ? '구글 레퍼런스 적용됨' : '대체 레퍼런스 적용됨',
            imageUpdatedAfterVideo: !!scene.videoUrl,
            referenceSearchPage: 1,
            referenceSearchQuery: query,
          });
          appliedCount++;
        } else {
          failedCount++;
          updateScene(scene.id, {
            isGeneratingImage: false,
            generationStatus: '검색 결과 없음',
            referenceSearchPage: 1,
            referenceSearchQuery: query,
          });
        }
      } catch (err) {
        if (_autoApplyRunId !== runId) return;
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[GoogleRef] 자동 배치 실패', `scene=${scene.id} ${message}`);
        failedCount++;
        if (isBlockedSearchMessage(message)) blockedCount++;
        updateScene(scene.id, {
          isGeneratingImage: false,
          generationStatus: `검색 실패: ${message}`,
          referenceSearchPage: 1,
          referenceSearchQuery: query,
        });
      }
    }
  };

  const workerCount = Math.min(SCENE_REFERENCE_BATCH_CONCURRENCY, candidates.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (_autoApplyRunId === runId) {
    onComplete?.({ appliedCount, failedCount, blockedCount, fallbackCount });
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
