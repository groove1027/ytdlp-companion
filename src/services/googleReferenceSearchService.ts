/**
 * Google 이미지 검색 레퍼런스 서비스
 * - Google Images HTML 스크래핑 (Cloudflare Pages 프록시 경유)
 * - 대본 맥락에서 검색어 자동 생성
 * - 비용 0원 — AI 이미지 생성 API 호출 없음
 */

import { monitoredFetch, getSerperKey, getPexelsKey } from './apiService';
import { evolinkChat, getEvolinkKey } from './evolinkService';
import { logger } from './LoggerService';
import type { Scene, ScriptTargetRegion } from '../types';
import { useGoogleCookieStore } from '../stores/googleCookieStore';
import { SCRIPT_TARGET_REGIONS } from '../constants';

const COMPANION_URL = 'http://127.0.0.1:9876';

// Lazy import to avoid circular dependency — 비동기 초기화 후 동기 접근
let _projectStoreRef: { getState: () => { scenes: Scene[] } } | null = null;
import('../stores/projectStore').then(m => { _projectStoreRef = m.useProjectStore; }).catch(() => {});
const getLatestScenes = (): Scene[] => _projectStoreRef?.getState().scenes ?? [];

let _scriptWriterStoreRef: { getState: () => { targetRegion: ScriptTargetRegion } } | null = null;
import('../stores/scriptWriterStore').then(m => { _scriptWriterStoreRef = m.useScriptWriterStore; }).catch(() => {});
const getProjectTargetRegion = (): ScriptTargetRegion | undefined => _scriptWriterStoreRef?.getState().targetRegion;

// ─── Google Images 설정 ───
const PROXY_PATH = '/api/google-proxy';
const GOOGLE_IMAGE_SEARCH_URL = 'https://www.google.com/search';
const SERPER_IMAGE_SEARCH_URL = 'https://google.serper.dev/images';
const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
const GOOGLE_IMAGE_PAGE_SIZE = 100;
const GOOGLE_IMAGE_RESULT_WINDOW = 10;
// Accept-Language를 검색 로케일에 맞게 동적 생성
const ACCEPT_LANGUAGE_MAP: Record<string, string> = {
  ko: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  ja: 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  'zh-CN': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'zh-TW': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  en: 'en-US,en;q=0.9',
  es: 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
  pt: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  de: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  fr: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  hi: 'hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7',
  ar: 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  vi: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  th: 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
  id: 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  it: 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  ru: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
};

function buildGoogleImageHeaders(hl: string = 'ko'): Record<string, string> {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': ACCEPT_LANGUAGE_MAP[hl] || ACCEPT_LANGUAGE_MAP['en'] || 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'Sec-Ch-Ua': '"Chromium";v="136", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  };
}
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

export type ReferenceSearchProvider = 'google' | 'serper' | 'pexels' | 'wikimedia' | 'naver';

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
const PEXELS_PER_PAGE = 15;
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
// [FIX] 워터마크가 있는 유료 스톡 사이트 — unsplash/pexels/pixabay/pxhere는 무료·워터마크 없음이므로 제외
const STOCK_REFERENCE_DOMAINS = [
  /(^|\.)istockphoto\.com$/i,
  /(^|\.)gettyimages\.com$/i,
  /(^|\.)shutterstock\.com$/i,
  /(^|\.)alamy\.com$/i,
  /(^|\.)dreamstime\.com$/i,
  /(^|\.)123rf\.com$/i,
  /(^|\.)depositphotos\.com$/i,
  /(^|\.)bigstockphoto\.com$/i,
  /(^|\.)freepik\.com$/i,
  /(^|\.)vecteezy\.com$/i,
  /(^|\.)canstockphoto\.com$/i,
  /(^|\.)pond5\.com$/i,
  /(^|\.)adobe\.com\/stock/i,
  /(^|\.)stock\.adobe\.com$/i,
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

// ─── [ENHANCE] 커뮤니티 쇼츠 스타일 검색 힌트 — 대본 맥락 기반 실사 레퍼런스 품질 향상 ───

/** 대본 카테고리 감지 → 검색어 접미사 힌트
 * ⚠️ 오탐 방지: 짧은 한국어 단어(왕, 달, 골 등)는 반드시 복합어로만 매칭.
 *    예: "왕"→X, "조선왕조"→O / "달"→X, "달탐사"→O / "배우"→X, "배우자"→X, "인기배우"→O
 */
const CATEGORY_SEARCH_HINTS: Array<{ pattern: RegExp; hints: string[]; hintEN: string }> = [
  { pattern: /대통령|국회의[원장]|정치인|선거|투표|여당|야당|탄핵|외교|정상회담|장관|총리|비서실장/, hints: ['보도 사진'], hintEN: 'press photo' },
  { pattern: /군인|군대|전쟁|무기|미사일|전투기|해군|육군|공군|특전사|계급장|군사훈련|사단장|여단장|준위|소위|중위|대위|소령|중령|대령|장군|원수|병장|상병|일병|이병/, hints: ['군사 사진'], hintEN: 'military photo' },
  { pattern: /북한|김정은|김정일|김일성|평양|핵실험|\bDMZ\b|판문점|휴전선/i, hints: ['보도 사진'], hintEN: 'news photo north korea' },
  { pattern: /조선시대|조선왕조|고려시대|삼국시대|고구려|백제|신라|임진왜란|한국전쟁|일제강점|독립운동|세종대왕|이순신장군|광개토대왕/, hints: ['역사 자료'], hintEN: 'historical photo' },
  { pattern: /과학자|우주탐사|\bNASA\b|로켓발사|인공위성|행성탐사|화성탐사|달탐사|태양계|블랙홀|양자역학|물리학|화학실험|생물학|연구소/i, hints: ['과학 사진'], hintEN: 'science photo' },
  { pattern: /경제위기|주식시장|코스피|증시|GDP|인플레이션|금리인상|환율|부동산|투자자|삼성전자|현대자동차|애플|테슬라/, hints: ['경제 사진'], hintEN: 'economy photo' },
  { pattern: /스포츠|축구경기|야구경기|농구경기|올림픽|월드컵|축구선수|야구선수|경기장|결승전|홈런|메시|손흥민|오타니/, hints: ['스포츠 사진'], hintEN: 'sports photo' },
  { pattern: /음식|요리사|맛집|레스토랑|식당|디저트|한식|중식|일식/, hints: ['음식 사진'], hintEN: 'food photo' },
  { pattern: /여행지|관광지|명소|유적지|랜드마크|에펠탑|자유의여신|만리장성|콜로세움|피라미드/, hints: ['관광 사진'], hintEN: 'landmark photo' },
  { pattern: /\bIT\b|\bAI\b|인공지능|로봇공학|스마트폰|소프트웨어|프로그래밍|데이터센터|서버실/i, hints: ['기술 사진'], hintEN: 'technology photo' },
  { pattern: /아이돌|가수|인기배우|드라마|K-pop|\bBTS\b|블랙핑크|뉴진스|콘서트|시상식|레드카펫/i, hints: ['연예 사진'], hintEN: 'celebrity photo' },
  { pattern: /범죄자|사건사고|재판|법원|검찰|경찰관|체포|수사|판결|형사사건|변호사/, hints: ['보도 사진'], hintEN: 'news photo' },
  { pattern: /교육과정|학교|대학교|학생들|교사|수능|입시/, hints: ['교육 사진'], hintEN: 'education photo' },
  { pattern: /의료진|병원|의사|수술실|백신접종|코로나|질병|암환자|치료/, hints: ['의료 사진'], hintEN: 'medical photo' },
  { pattern: /환경오염|기후변화|온난화|탄소배출|재활용|오염|플라스틱|산불|홍수|태풍/, hints: ['환경 사진'], hintEN: 'environment photo' },
];

/** castType별 검색 전략 — entityName 활용 방식 결정 */
function getEntitySearchStrategy(scene: Scene): { prefix: string; suffix: string; prioritizeEntity: boolean } {
  const castType = scene.castType || 'NOBODY';
  const hasEntity = !!(scene.entityName?.trim());

  if (!hasEntity) {
    // entityName이 없으면 castType에 관계없이 기본 전략
    return { prefix: '', suffix: '', prioritizeEntity: false };
  }

  switch (castType) {
    case 'KEY_ENTITY': {
      // 역사 인물(시대 키워드 매칭) → "역사 자료" / 현대 인물 → "실제 사진"
      const era = scene.sceneEra?.toLowerCase() || '';
      const culture = scene.sceneCulture?.toLowerCase() || '';
      const eraAndCulture = `${era} ${culture}`;
      const isHistorical = /고대|중세|고려|조선|삼국|고구려|백제|신라|명나라|청나라|에도|빅토리아|르네상스|산업혁명|일제|식민|세계대전|냉전|근대|ancient|medieval|dynasty|empire|colonial|renaissance|victorian|industrial|world war|cold war|(?:1[0-8]|[1-9])(?:th|st|nd|rd)\s*century|\d{1,2}세기/i.test(eraAndCulture);
      const suffix = isHistorical ? '역사 자료' : '실제 사진';
      return { prefix: scene.entityName || '', suffix, prioritizeEntity: true };
    }
    case 'EXTRA':
      return { prefix: '', suffix: '현장 사진', prioritizeEntity: false };
    case 'MAIN':
    case 'NOBODY':
    default:
      return { prefix: '', suffix: '', prioritizeEntity: false };
  }
}

/** 대본 텍스트에서 카테고리 힌트 추출 */
function detectCategoryHints(text: string): { ko: string[]; en: string[] } {
  const koHints: string[] = [];
  const enHints: string[] = [];

  for (const { pattern, hints, hintEN } of CATEGORY_SEARCH_HINTS) {
    if (pattern.test(text)) {
      koHints.push(...hints);
      enHints.push(hintEN);
      if (koHints.length >= 2) break; // 최대 2개 카테고리
    }
  }

  return { ko: [...new Set(koHints)], en: [...new Set(enHints)] };
}

/** 시대 맥락 → 검색 힌트 변환 (한/영 모두 인식) */
function eraToSearchHint(era: string | undefined): string {
  if (!era) return '';
  const lower = era.toLowerCase();
  if (/고대|고구려|백제|신라|삼국|로마|그리스|이집트|메소포타미아|ancient|roman|greek|egyptian|mesopotamia/.test(lower)) return '고대 유적 자료';
  if (/중세|고려|조선|명|청|에도|빅토리아|르네상스|산업혁명|medieval|dynasty|joseon|edo|victorian|renaissance|industrial revolution/.test(lower)) return '역사 자료 사진';
  if (/근대|일제|식민|세계대전|냉전|6\.25|한국전쟁|modern era|world war|cold war|colonial|korean war/.test(lower)) return '근현대 역사 사진';
  if (/현대|2[0-9]{3}|최근|요즘|contemporary|current|present|recent|20[2-3][0-9]/.test(lower)) return '최신 보도 사진';
  return '';  // 비매칭 시 빈 문자열 — generic 힌트 강제 방지
}

type CachedReferenceSearch = {
  expiresAt: number;
  response: GoogleSearchResponse;
};

const referenceSearchCache = new Map<string, CachedReferenceSearch>();
const referenceSearchInflight = new Map<string, Promise<GoogleSearchResponse>>();
let googleSearchCooldownUntil = 0;
let googleSearchActiveCount = 0;
const googleSearchWaiters: Array<() => void> = [];

// ─── Serper.dev API 응답 타입 ───
interface SerperImageResult {
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  source?: string;
  link?: string;
  imageWidth?: number;
  imageHeight?: number;
}

// ─── Pexels API 응답 타입 ───
interface PexelsPhoto {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
  width: number;
  height: number;
  alt: string;
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

export interface ReferenceSearchContext {
  scene?: Scene;
  prevScene?: Scene | null;
  nextScene?: Scene | null;
  globalContext?: string;
  projectTargetRegion?: ScriptTargetRegion;
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

/** AI 생성용 잡음 제거 (렌더링 전용 프롬프트 노이즈) — [FIX #681] 스타일 키워드가 검색어에 유출되는 문제 수정
 * 주의: modern, vintage, graffiti, abstract 등 실제 검색 주제가 될 수 있는 단어는 제외
 */
const NOISE_PATTERNS = /\b(8k|4k|hdr|cinematic|masterpiece|highly detailed|no text|hyper.?realistic|ultra.?realistic|photorealistic|octane render|unreal engine|detailed|best quality|high quality|digital art|concept art|professional|award.?winning|trending on artstation|artstation|deviantart|pixiv|2d|3d|vector.?art|minimalist|flat.?design|line.?art|cel.?shad(?:ed|ing)|thick|bold|chibi|anthropomorphic|pixel.?art|low.?poly|isometric|voxel|ukiyo.?e|art.?nouveau|art.?deco|stencil|woodcut|linocut|engraving|etching|stipple|cross.?hatch|halftone|duotone|wireframe|blueprint|diagram|infographic|hand.?drawn|hand.?painted|brush.?stroke)\b/gi;

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

    // 영어 단어: 4글자 이상만 수집 (LED/BTS/NYC 등 약어는 scene 필드에서 처리)
    if (/^[a-z0-9-]+$/i.test(token) && token.length >= 4) {
      mappedTerms.push(token);
      continue;
    }

    // 완전 일치 또는 조사 결합 형태만 허용 (2글자 이상 키)
    // "서울에서"→"서울" OK, "절정"→"절" 차단 (1글자 키는 완전 일치만)
    for (const [ko, english] of Object.entries(WIKIMEDIA_KO_EN_MAP)) {
      if (token === ko || (ko.length >= 2 && token.startsWith(ko) && token.length <= ko.length + 3)) {
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

// ─── [FIX #681] AI 기반 검색어 변환 — 대본 맥락을 구글 이미지 검색 키워드로 변환 ───
const AI_QUERY_GENERATION_TIMEOUT_MS = 10_000;
const _aiQueryCache = new Map<string, { queries: string[]; expiresAt: number }>();
const AI_QUERY_CACHE_TTL_MS = 15 * 60 * 1000;

async function generateAiSearchQueries(
  scriptText: string,
  prevScriptText?: string,
  nextScriptText?: string,
  globalContext?: string,
  sceneMetadata?: { entityName?: string; sceneLocation?: string; sceneEra?: string; sceneCulture?: string; castType?: string },
): Promise<string[]> {
  if (!scriptText?.trim() || !getEvolinkKey()) return [];

  const metaCacheSegment = sceneMetadata
    ? `${(sceneMetadata.entityName || '').slice(0, 20)}|${(sceneMetadata.sceneLocation || '').slice(0, 15)}|${(sceneMetadata.sceneEra || '').slice(0, 10)}|${(sceneMetadata.sceneCulture || '').slice(0, 10)}|${sceneMetadata.castType || ''}`
    : '';
  const cacheKey = `ai-q:${scriptText.slice(0, 100)}::${(prevScriptText || '').slice(0, 30)}::${(nextScriptText || '').slice(0, 30)}::${(globalContext || '').slice(0, 30)}::${metaCacheSegment}`;
  const cached = _aiQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.queries;

  try {
    // [ENHANCE] 장면 메타데이터를 명시적으로 전달
    const metaParts = sceneMetadata ? [
      sceneMetadata.entityName ? `실존 인물/브랜드: ${sceneMetadata.entityName}` : '',
      sceneMetadata.sceneLocation ? `장소: ${sceneMetadata.sceneLocation}` : '',
      sceneMetadata.sceneEra ? `시대: ${sceneMetadata.sceneEra}` : '',
      sceneMetadata.sceneCulture ? `문화적 맥락: ${sceneMetadata.sceneCulture}` : '',
      sceneMetadata.castType === 'KEY_ENTITY' ? '⚡ 이 장면은 실존 인물/브랜드가 핵심 — 이름을 검색어에 반드시 포함' : '',
    ].filter(Boolean).join('\n') : '';

    const contextParts = [
      prevScriptText ? `이전 장면: ${prevScriptText.slice(0, 80)}` : '',
      `현재 장면: ${scriptText.slice(0, 200)}`,
      nextScriptText ? `다음 장면: ${nextScriptText.slice(0, 80)}` : '',
      globalContext ? `전체 맥락: ${globalContext.slice(0, 100)}` : '',
      metaParts ? `\n장면 메타데이터:\n${metaParts}` : '',
    ].filter(Boolean).join('\n');

    const response = await evolinkChat([
      {
        role: 'system',
        content: '너는 유튜브 해설/커뮤니티 쇼츠 채널의 영상 편집자다. 대본의 각 장면에 맞는 실사 레퍼런스 이미지를 구글에서 찾아야 한다. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: [
          '아래 대본에 어울리는 구글 이미지 검색 키워드를 3개 생성해줘.',
          '',
          '🎯 목표: 시청자가 "진짜 사진이네"라고 느낄 수 있는 실사 레퍼런스 이미지.',
          '뉴스 보도 사진, 실존 인물 사진, 실제 장소 사진, 역사 자료 사진, 제품/실물 사진 등.',
          '',
          '📋 장면 유형별 검색어 생성 규칙:',
          '- 실존 인물 → 이름 + 구체적 상황 (예: "트럼프 백악관 기자회견", "손흥민 토트넘 골 세레머니")',
          '- 실제 장소 → 정확한 장소명 + "실제" (예: "판문점 공동경비구역 실제", "63빌딩 전경")',
          '- 역사/시대 → 역사 키워드 + "사진" (예: "한국전쟁 인천상륙작전 사진", "조선시대 과거시험 그림")',
          '- 군사/제도 → 실물/제도 키워드 (예: "대한민국 군인 계급장", "한국 전투기 KF-21")',
          '- 과학/기술 → 구체적 대상 + 사진 (예: "제임스웹 우주망원경 사진", "SpaceX 팰컨9 착륙")',
          '- 경제/비즈니스 → 시각적 상징 (예: "코스피 전광판", "삼성전자 반도체 공장")',
          '- 추상 개념 → 시각적 상징물 변환 (예: "경제위기" → "주가 폭락 전광판", "자유" → "자유의여신상")',
          '- 소셜/커뮤니티 → 플랫폼 + 내용 (예: "쓰레드 앱 화면", "트위터 논란 캡처")',
          '',
          '⛔ 금지:',
          '- AI 생성 스타일 키워드 (illustration, render, 2d, vector, minimalist 등) 절대 금지',
          '- 모호한 단어만으로 구성된 검색어 금지 (예: "사람 걸어가는 모습" → 너무 일반적)',
          '- 한국어 맥락이면 한국어, 해외 맥락이면 영어로 작성',
          '',
          contextParts,
          '',
          '반환 형식: {"queries":["키워드1","키워드2","키워드3"]}',
        ].join('\n'),
      },
    ], {
      temperature: 0.3,
      maxTokens: 300,
      timeoutMs: AI_QUERY_GENERATION_TIMEOUT_MS,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractStructuredJsonObject(raw);
    const queriesRaw = parsed?.queries;
    const queries = Array.isArray(queriesRaw)
      ? queriesRaw.filter((v): v is string => typeof v === 'string' && v.trim().length >= 2).slice(0, 3)
      : [];

    if (queries.length > 0) {
      _aiQueryCache.set(cacheKey, { queries, expiresAt: Date.now() + AI_QUERY_CACHE_TTL_MS });
    }
    return queries;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[GoogleRef] AI 검색어 생성 실패, 기존 방식으로 폴백', message);
    return [];
  }
}

function buildReferenceSearchPlan(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
): ReferenceSearchPlan {
  const criticalParts: string[] = [];
  const softParts: string[] = [];

  // [ENHANCE] castType 기반 엔티티 검색 전략
  const entityStrategy = getEntitySearchStrategy(scene);

  pushQueryFragments(criticalParts, scene.entityName, 1, 36);
  pushQueryFragments(criticalParts, scene.sceneLocation, 1, 28);
  pushQueryFragments(criticalParts, scene.sceneCulture, 1, 24);
  pushQueryFragments(criticalParts, scene.sceneEra, 1, 18);

  // [ENHANCE] visualDescriptionKO를 항상 1개 이상 포함 (기존: criticalParts < 4일 때만)
  pushQueryFragments(criticalParts, scene.visualDescriptionKO, 2, 24);
  if (criticalParts.length < 5) pushQueryFragments(criticalParts, scene.scriptText, 2, 22);
  if (criticalParts.length < 5) pushQueryFragments(criticalParts, globalContext, 1, 22);
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

  // [ENHANCE] 카테고리 힌트 + 시대 힌트 추출
  const categoryHints = detectCategoryHints(joinedSceneText);
  const eraHint = eraToSearchHint(scene.sceneEra);

  // [ENHANCE] 검색어 접미사 결정 — castType 전략 > 시대 > 카테고리 > 기본
  // 시대 정보가 있으면 카테고리보다 우선 (역사적 맥락이 더 구체적)
  const searchSuffix = entityStrategy.suffix || eraHint || categoryHints.ko[0] || '';
  const searchSuffixEN = categoryHints.en[0] || '';

  // [ENHANCE] KEY_ENTITY일 때 엔티티 이름을 맨 앞에 배치 + 접미사 추가
  const primaryQuery = entityStrategy.prioritizeEntity
    ? joinQueryParts([
        entityStrategy.prefix,
        scene.sceneLocation || '',
        searchSuffix,
        ...actionHints.slice(0, 1),
      ], 5, 72)
    : joinQueryParts([
        scene.sceneLocation || '',
        scene.entityName || '',
        scene.sceneCulture || '',
        searchSuffix || scene.sceneEra || '',
        ...actionHints.slice(0, 2),
        mappedEnglish[0] || '',
      ], 6, 72) || joinQueryParts([
        ...criticalParts.slice(0, 3),
        softParts[0] || '',
        searchSuffix || actionHints[0] || '',
      ], 5, 72) || '풍경 사진';

  // [ENHANCE] conciseQuery에도 카테고리 힌트 반영
  const conciseQuery = joinQueryParts([
    scene.sceneLocation || criticalParts[0] || '',
    scene.entityName || criticalParts[1] || '',
    searchSuffix || scene.sceneCulture || '',
    actionHints[0] || '',
  ], 4, 72);

  const englishQuery = joinQueryParts([
    scene.sceneLocation || '',
    ...mappedEnglish,
    ...actionHints,
    searchSuffixEN || 'photo',
  ], 7, 80);

  // [ENHANCE] 카테고리 힌트를 활용한 대체 쿼리 추가
  const categoryQuery = categoryHints.ko[0]
    ? joinQueryParts([
        scene.entityName || scene.sceneLocation || criticalParts[0] || '',
        ...categoryHints.ko,
        scene.visualDescriptionKO || '',
      ], 4, 72)
    : '';

  // [ENHANCE] englishQuery를 categoryQuery보다 앞에 배치 — 대체 검색 fast 폴백에서 영어 쿼리 유지
  const alternativeQueries = dedupeQueryParts([
    englishQuery,
    categoryQuery,
    conciseQuery,
    joinQueryParts([
      scene.sceneLocation || '',
      scene.visualDescriptionKO || scene.scriptText || '',
      searchSuffix || globalContext || '',
    ], 4, 76),
    joinQueryParts([
      ...criticalParts.slice(0, 2),
      softParts[0] || '',
      searchSuffix || actionHints[0] || '',
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

// ─── 콘텐츠 문화권 기반 검색 로케일 감지 ───
// 장면 메타데이터 + 프로젝트 targetRegion에서 콘텐츠의 문화권을 추론하여
// 해당 국가 구글 검색(hl/gl)으로 자동 라우팅 — 15개 지역 대응
const TARGET_REGION_GL_MAP: Record<string, { hl: string; gl: string }> = {
  'ko':    { hl: 'ko',    gl: 'kr' },
  'en-us': { hl: 'en',    gl: 'us' },
  'en-uk': { hl: 'en',    gl: 'gb' },
  'ja':    { hl: 'ja',    gl: 'jp' },
  'zh-cn': { hl: 'zh-CN', gl: 'cn' },
  'zh-tw': { hl: 'zh-TW', gl: 'tw' },
  'es':    { hl: 'es',    gl: 'es' },
  'pt-br': { hl: 'pt',    gl: 'br' },
  'de':    { hl: 'de',    gl: 'de' },
  'fr':    { hl: 'fr',    gl: 'fr' },
  'hi':    { hl: 'hi',    gl: 'in' },
  'ar':    { hl: 'ar',    gl: 'sa' },
  'vi':    { hl: 'vi',    gl: 'vn' },
  'th':    { hl: 'th',    gl: 'th' },
  'id':    { hl: 'id',    gl: 'id' },
  'it':    { hl: 'it',    gl: 'it' },
  'ru':    { hl: 'ru',    gl: 'ru' },
};

const LOCATION_REGION_MAP: Record<string, string> = {
  // 한국
  '서울': 'ko', '부산': 'ko', '경복궁': 'ko', '한옥': 'ko', '제주': 'ko',
  '강남': 'ko', '명동': 'ko', '홍대': 'ko', '인천': 'ko', '대전': 'ko',
  '광주': 'ko', '대구': 'ko', '전주': 'ko', '경주': 'ko', '속초': 'ko',
  // 일본
  '도쿄': 'ja', '오사카': 'ja', '교토': 'ja', '후지산': 'ja',
  '시부야': 'ja', '아키하바라': 'ja', '신주쿠': 'ja', '나라': 'ja',
  '삿포로': 'ja', '하코네': 'ja', '히로시마': 'ja', '나고야': 'ja',
  'tokyo': 'ja', 'osaka': 'ja', 'kyoto': 'ja',
  // 중국
  '베이징': 'zh-cn', '상하이': 'zh-cn', '만리장성': 'zh-cn',
  '자금성': 'zh-cn', '광저우': 'zh-cn', '청두': 'zh-cn',
  'beijing': 'zh-cn', 'shanghai': 'zh-cn',
  // 대만
  '타이베이': 'zh-tw', '지우펀': 'zh-tw', 'taipei': 'zh-tw',
  // 유럽
  '파리': 'fr', '에펠탑': 'fr', '루브르': 'fr', '마르세유': 'fr',
  '런던': 'en-uk', '에든버러': 'en-uk', '맨체스터': 'en-uk',
  '로마': 'it', '피렌체': 'it', '밀라노': 'it', '베네치아': 'it',
  '바르셀로나': 'es', '마드리드': 'es', '세비야': 'es',
  '베를린': 'de', '뮌헨': 'de', '함부르크': 'de',
  // 미국
  '뉴욕': 'en-us', '로스앤젤레스': 'en-us', '맨해튼': 'en-us', '샌프란시스코': 'en-us',
  '워싱턴': 'en-us', '시카고': 'en-us', '라스베이거스': 'en-us',
  'new york': 'en-us', 'los angeles': 'en-us', 'san francisco': 'en-us',
  // 동남아
  '방콕': 'th', '치앙마이': 'th', '하노이': 'vi', '호치민': 'vi',
  '자카르타': 'id', '발리': 'id',
  // 기타
  '뭄바이': 'hi', '델리': 'hi', '두바이': 'ar', '리야드': 'ar',
  '상파울루': 'pt-br', '리우': 'pt-br',
};

const CULTURE_PATTERNS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /japan|日本|일본|和風/, region: 'ja' },
  { pattern: /china|中[国國]|중국|chinese/i, region: 'zh-cn' },
  { pattern: /taiwan|台[灣湾]|대만/i, region: 'zh-tw' },
  { pattern: /korea|한국|korean/i, region: 'ko' },
  { pattern: /america|usa|미국|american/i, region: 'en-us' },
  { pattern: /british|uk|영국|england/i, region: 'en-uk' },
  { pattern: /france|프랑스|french|français/i, region: 'fr' },
  { pattern: /germany|독일|german|deutsch/i, region: 'de' },
  { pattern: /spain|스페인|spanish|español/i, region: 'es' },
  { pattern: /brazil|브라질|portuguese/i, region: 'pt-br' },
  { pattern: /india|인도|hindi/i, region: 'hi' },
  { pattern: /arab|중동|사우디|이슬람/i, region: 'ar' },
  { pattern: /vietnam|베트남/i, region: 'vi' },
  { pattern: /thai|태국/i, region: 'th' },
  { pattern: /indonesia|인도네시아/i, region: 'id' },
  { pattern: /italy|이탈리아|italian/i, region: 'it' },
  { pattern: /russia|러시아|russian/i, region: 'ru' },
];

function detectContentLocale(scene?: Scene | null, projectTargetRegion?: ScriptTargetRegion): { hl: string; gl: string } {
  // 1순위: 프로젝트 targetRegion (사용자가 명시적으로 설정한 것)
  if (projectTargetRegion && TARGET_REGION_GL_MAP[projectTargetRegion]) {
    return TARGET_REGION_GL_MAP[projectTargetRegion];
  }

  if (scene) {
    // 2순위: scene.sceneCulture에서 문화권 추론
    if (scene.sceneCulture) {
      for (const { pattern, region } of CULTURE_PATTERNS) {
        if (pattern.test(scene.sceneCulture)) {
          return TARGET_REGION_GL_MAP[region] || { hl: 'ko', gl: 'kr' };
        }
      }
    }

    // 3순위: scene.sceneLocation에서 국가 추론
    if (scene.sceneLocation) {
      const loc = scene.sceneLocation.toLowerCase();
      for (const [keyword, region] of Object.entries(LOCATION_REGION_MAP)) {
        if (loc.includes(keyword.toLowerCase())) {
          return TARGET_REGION_GL_MAP[region] || { hl: 'ko', gl: 'kr' };
        }
      }
    }

    // 4순위: scriptText 문자 분석
    const text = scene.scriptText || '';
    if (text.length > 10) {
      const hasHangul = /[가-힣]/.test(text);
      const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
      const hasCjk = /[\u4E00-\u9FFF]/.test(text);
      if (hasKana) return TARGET_REGION_GL_MAP['ja'];
      if (hasCjk && !hasHangul) return TARGET_REGION_GL_MAP['zh-cn'];
    }
  }

  // 5순위: 브라우저 언어 (기존 로직 확장)
  const locale = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ko-kr';
  if (locale.startsWith('ko')) return { hl: 'ko', gl: 'kr' };
  if (locale.startsWith('ja')) return { hl: 'ja', gl: 'jp' };
  if (locale.startsWith('zh')) return locale.includes('tw') ? { hl: 'zh-TW', gl: 'tw' } : { hl: 'zh-CN', gl: 'cn' };

  // 브라우저 언어 → SCRIPT_TARGET_REGIONS에서 매칭
  const langCode = locale.split('-')[0];
  const match = SCRIPT_TARGET_REGIONS.find(r => r.searchLang === langCode);
  if (match && TARGET_REGION_GL_MAP[match.id]) return TARGET_REGION_GL_MAP[match.id];

  return { hl: 'en', gl: 'us' };
}

function isKoreanContentLocale(scene?: Scene | null, projectTargetRegion?: ScriptTargetRegion): boolean {
  const { gl } = detectContentLocale(scene, projectTargetRegion);
  return gl === 'kr';
}

export function isPrimaryReferenceProvider(provider: ReferenceSearchProvider): boolean {
  return provider === 'google' || provider === 'serper';
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

    // 완전 일치 또는 조사 결합 형태만 허용 (2글자 이상 키)
    for (const [ko, english] of Object.entries(WIKIMEDIA_KO_EN_MAP)) {
      if (token === ko || (ko.length >= 2 && token.startsWith(ko) && token.length <= ko.length + 3)) {
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

function buildSearchUrl(query: string, start: number, imgSize: string, scene?: Scene | null, projectTargetRegion?: ScriptTargetRegion): string {
  const safeStart = Math.max(1, start);
  const { hl, gl } = detectContentLocale(scene, projectTargetRegion);
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
  localeKey: string = '',
): string {
  return `${query}::${start}::${imgSize}::${rankingMode}::${contextSignature}::${localeKey}`;
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
  let score = isPrimaryReferenceProvider(provider) ? 4 : 0;

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
    // [FIX] 워터마크 있는 스톡 사이트는 hard-filter — 점수를 대폭 감점하여 사실상 제거
    if (matchesAnyPattern(domain, STOCK_REFERENCE_DOMAINS)) score -= 50;
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

async function proxyFetchReferenceSearch(targetUrl: string, cookie?: string, hl?: string): Promise<Response> {
  // 1순위: 컴패니언 로컬 프록시 (사용자 IP — 차단 없음, 빠름)
  // [FIX #914] isCompanionDetected() 게이트 제거 — health check 느려도 직접 시도, 실패 시 CF 폴백
  {
    try {
      const res = await fetch(`${COMPANION_URL}/api/google-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          method: 'GET',
          headers: buildGoogleImageHeaders(hl),
          cookie,
        }),
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) {
        logger.info('[GoogleRef] 컴패니언 프록시 사용 (로컬 IP)');
        return res;
      }
      // [FIX] 컴패니언이 429를 반환하면 CF 폴백하지 말고 쿨다운 마킹
      // — CF 데이터센터 IP는 더 빡빡하게 차단되므로 이중 차단만 유발
      if (res.status === 429) {
        markGoogleSearchRateLimited('컴패니언 경유 구글 429');
        return res;
      }
      // 5xx 서버 에러만 CF 폴백 허용 (502, 503 등)
      if (res.status >= 500) {
        logger.warn(`[GoogleRef] 컴패니언 서버 에러 (${res.status}) — CF 프록시 폴백`);
      } else {
        // 403 등 다른 클라이언트 에러도 구글 차단일 수 있으므로 그대로 반환
        return res;
      }
    } catch (e) {
      logger.warn('[GoogleRef] 컴패니언 프록시 실패 — CF 프록시 폴백:', e instanceof Error ? e.message : '');
    }
  }

  // 2순위: 기존 Cloudflare Pages 프록시
  return monitoredFetch(PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: 'GET',
      headers: buildGoogleImageHeaders(hl),
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

// ─── Serper.dev 이미지 검색 (1순위 — 차단 위험 0%, 깨끗한 JSON) ───
async function searchSerperImages(
  query: string,
  start: number = 1,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  const serperKey = getSerperKey();
  if (!serperKey) throw new Error('Serper API 키 없음');

  const plan = getReferencePlan(query, context);
  const { hl, gl } = detectContentLocale(context?.scene, context?.projectTargetRegion);

  const res = await fetch(SERPER_IMAGE_SEARCH_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': serperKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: plan.primaryQuery + ' photo',
      gl,
      hl,
      num: GOOGLE_IMAGE_RESULT_WINDOW,
      page: Math.max(1, Math.ceil(start / GOOGLE_IMAGE_RESULT_WINDOW)),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Serper 검색 실패 (${res.status}): ${errText}`);
  }

  const data = await res.json() as { images?: SerperImageResult[] };
  const allItems = (data.images || [])
    .map((img): GoogleImageResult | null => {
      const link = normalizeUrl(img.imageUrl);
      if (!isUsefulImageUrl(link)) return null;
      return {
        title: img.title || '',
        link,
        displayLink: img.source || getDisplayLink(img.link || '', link),
        snippet: img.title || '',
        thumbnailLink: normalizeUrl(img.thumbnailUrl) || link,
        contextLink: img.link || '',
        width: img.imageWidth || 0,
        height: img.imageHeight || 0,
      };
    })
    .filter((item): item is GoogleImageResult => item !== null);

  const ranked = await rankReferenceResults(allItems, plan.primaryQuery, 'serper', rankingMode, context);
  const items = ranked.slice(0, GOOGLE_IMAGE_RESULT_WINDOW);
  logger.info('[GoogleRef] Serper 검색 완료', `query="${plan.primaryQuery}" results=${items.length}`);

  return {
    items,
    totalResults: ranked.length,
    query: plan.primaryQuery,
    provider: 'serper',
  };
}

// ─── Pexels 이미지 검색 (3순위 — 무료 스톡 20,000건/월) ───
async function searchPexelsImages(
  query: string,
  start: number = 1,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  const pexelsKey = getPexelsKey();
  if (!pexelsKey) throw new Error('Pexels API 키 없음');

  const plan = getReferencePlan(query, context);
  const page = Math.max(1, Math.ceil(start / PEXELS_PER_PAGE));

  const params = new URLSearchParams({
    query: plan.primaryQuery,
    per_page: String(PEXELS_PER_PAGE),
    page: String(page),
  });

  const res = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: pexelsKey },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Pexels 검색 실패 (${res.status})`);
  }

  const data = await res.json() as PexelsSearchResponse;
  const allItems = (data.photos || []).map((photo): GoogleImageResult => ({
    title: photo.alt || photo.photographer,
    link: photo.src.large2x || photo.src.large || photo.src.original,
    displayLink: 'pexels.com',
    snippet: photo.alt || `Photo by ${photo.photographer}`,
    thumbnailLink: photo.src.medium || photo.src.large,
    contextLink: photo.url,
    width: photo.width,
    height: photo.height,
  }));

  const ranked = await rankReferenceResults(allItems, plan.primaryQuery, 'pexels', rankingMode, context);
  const items = ranked.slice(0, GOOGLE_IMAGE_RESULT_WINDOW);
  logger.info('[GoogleRef] Pexels 검색 완료', `query="${plan.primaryQuery}" results=${items.length}`);

  return {
    items,
    totalResults: data.total_results || ranked.length,
    query: plan.primaryQuery,
    provider: 'pexels',
  };
}

// ─── 네이버 이미지 검색 (한국 콘텐츠 전용 — 컴패니언 프록시, API 키 불필요) ───
async function searchNaverImages(
  query: string,
  start: number = 1,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  const plan = getReferencePlan(query, context);
  const searchQuery = plan.primaryQuery;

  try {
    const res = await monitoredFetch(`${COMPANION_URL}/api/naver-image-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchQuery,
        start: Math.max(1, start),
        display: GOOGLE_IMAGE_RESULT_WINDOW,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`네이버 검색 실패 (${res.status})`);
    }

    const data = await res.json() as {
      images?: Array<{
        image_url: string;
        thumbnail_url: string;
        title: string;
        source: string;
        width: number;
        height: number;
        link: string;
      }>;
    };

    const allItems = (data.images || [])
      .map((img): GoogleImageResult | null => {
        const link = normalizeUrl(img.image_url);
        if (!link || !isUsefulImageUrl(link)) return null;
        return {
          title: (img.title || '').replace(/<\/?b>/g, ''),
          link,
          displayLink: img.source || getDisplayLink(img.link || '', link),
          snippet: (img.title || '').replace(/<\/?b>/g, ''),
          thumbnailLink: normalizeUrl(img.thumbnail_url) || link,
          contextLink: img.link || '',
          width: img.width || 0,
          height: img.height || 0,
        };
      })
      .filter((item): item is GoogleImageResult => item !== null);

    const ranked = await rankReferenceResults(allItems, searchQuery, 'naver', rankingMode, context);
    const items = ranked.slice(0, GOOGLE_IMAGE_RESULT_WINDOW);
    logger.info('[GoogleRef] 네이버 검색 완료', `query="${searchQuery}" results=${items.length}`);

    return {
      items,
      totalResults: ranked.length,
      query: searchQuery,
      provider: 'naver',
    };
  } catch (error) {
    logger.warn('[GoogleRef] 네이버 검색 실패 (컴패니언 미연결 가능)', error instanceof Error ? error.message : '');
    return { items: [], totalResults: 0, query: searchQuery, provider: 'naver' };
  }
}

// ─── 대체 검색 폴백 (네이버 → Pexels → Wikimedia 다중 폴백) ───
async function searchAlternativeReferenceImages(
  query: string,
  start: number,
  imgSize: string,
  context?: ReferenceSearchContext,
  rankingMode: 'fast' | 'best' = 'fast',
): Promise<GoogleSearchResponse> {
  // 1순위: 한국 콘텐츠면 네이버 이미지 시도
  if (isKoreanContentLocale(context?.scene, context?.projectTargetRegion)) {
    try {
      const naverResponse = await searchNaverImages(query, start, context, rankingMode);
      if (naverResponse.items.length > 0) return naverResponse;
    } catch { /* 네이버 실패 → 다음 폴백 */ }
  }

  // 2순위: Pexels (키 있으면)
  const pexelsKey = getPexelsKey();
  if (pexelsKey) {
    try {
      const pexelsResponse = await searchPexelsImages(query, start, context, rankingMode);
      if (pexelsResponse.items.length > 0) return pexelsResponse;
    } catch { /* Pexels 실패 → 다음 폴백 */ }
  }

  // 3순위: Wikimedia Commons (항상 사용 가능)
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
  const { hl: cacheHl, gl: cacheGl } = detectContentLocale(options?.context?.scene, options?.context?.projectTargetRegion);
  const cacheKey = getReferenceSearchCacheKey(
    normalizedQuery,
    start,
    imgSize,
    rankingMode,
    plan.contextSignature,
    `${cacheHl}-${cacheGl}`,
  );
  const cached = getCachedReferenceSearch(cacheKey);
  if (cached && !(bypassEmptyCache && cached.items.length === 0)) return cached;

  const inflight = referenceSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async (): Promise<GoogleSearchResponse> => {
    // [FIX] 1순위: Serper.dev API (쿨다운과 무관하게 최우선 시도)
    const serperKey = getSerperKey();
    if (serperKey) {
      try {
        const serperResponse = await searchSerperImages(normalizedQuery, start, options?.context, rankingMode);
        if (serperResponse.items.length > 0) {
          setCachedReferenceSearch(cacheKey, serperResponse);
          return serperResponse;
        }
        logger.warn('[GoogleRef] Serper 결과 0건, 구글 직접 검색 시도');
      } catch (error) {
        logger.warn('[GoogleRef] Serper 실패', error instanceof Error ? error.message : '');
      }
    }

    // [FIX] 2순위: 구글 직접 검색 (쿨다운 시 스킵)
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

      const url = buildSearchUrl(normalizedQuery, start, imgSize, options?.context?.scene, options?.context?.projectTargetRegion);
      const googleCookie = getGoogleSearchCookie();
      const { hl, gl } = detectContentLocale(options?.context?.scene, options?.context?.projectTargetRegion);
      logger.info('[GoogleRef] 구글 직접 검색 요청', `query="${normalizedQuery}" start=${start} hl=${hl} gl=${gl}`);

      try {
        const res = await proxyFetchReferenceSearch(url, googleCookie || undefined, hl);

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

        logger.warn('[GoogleRef] 구글 결과 0건, Pexels/Wikimedia 폴백 시도', normalizedQuery);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isBlockedSearchMessage(message) && !/구글 검색 실패/i.test(message)) {
          throw error;
        }
        if (isBlockedSearchMessage(message)) {
          markGoogleSearchRateLimited(message);
        }
        logger.warn('[GoogleRef] Pexels/Wikimedia 폴백 전환', message);
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
 * - [FIX #681] AI 검색어 변환 우선 → 폴백으로 기존 키워드 추출
 * - 검색어 자동 생성 + 검색 실행 + 결과 반환
 */
export async function searchSceneReferenceImages(
  scene: Scene,
  prevScene?: Scene | null,
  nextScene?: Scene | null,
  globalContext?: string,
  startIndex: number = 1,
  rankingMode: 'fast' | 'best' = 'best',
  options?: { bypassEmptyCache?: boolean },
): Promise<GoogleSearchResponse> {
  // [FIX #681] AI가 대본 맥락에서 실사 이미지 검색 키워드 생성
  // 'best' 모드(사용자 수동 검색)에서만 AI 호출 — 'fast'(자동 배치)에서는 비용 발생 방지
  const sceneText = [scene.scriptText, scene.visualDescriptionKO, scene.entityName].filter(Boolean).join(' ').trim();
  const aiQueries = rankingMode === 'best'
    ? await generateAiSearchQueries(
        sceneText || '',
        prevScene?.scriptText,
        nextScene?.scriptText,
        globalContext,
        // [ENHANCE] 장면 메타데이터를 AI에 전달 — 엔티티/장소/시대/문화 인식 강화
        {
          entityName: scene.entityName,
          sceneLocation: scene.sceneLocation,
          sceneEra: scene.sceneEra,
          sceneCulture: scene.sceneCulture,
          castType: scene.castType,
        },
      )
    : [];

  // AI 쿼리가 있으면 첫 번째를 primary로, 나머지는 대체로 사용
  const useAiQuery = aiQueries.length > 0;
  const query = useAiQuery
    ? aiQueries[0]
    : buildSearchQuery(scene, prevScene, nextScene, globalContext);

  // [FIX #681] AI 쿼리 사용 시 context를 넘기지 않아야 getReferencePlan이 AI 쿼리 기반으로 동작
  const targetRegion = getProjectTargetRegion();
  const response = await searchGoogleImages(query, startIndex, 'large', {
    context: useAiQuery ? { projectTargetRegion: targetRegion } : { scene, prevScene, nextScene, globalContext, projectTargetRegion: targetRegion },
    rankingMode,
    bypassEmptyCache: options?.bypassEmptyCache,
  });

  // AI 첫 번째 쿼리 결과가 비어있으면 나머지 AI 쿼리로 재시도 — targetRegion 유지
  if (response.items.length === 0 && aiQueries.length > 1) {
    for (let i = 1; i < aiQueries.length; i++) {
      const retryResponse = await searchGoogleImages(aiQueries[i], startIndex, 'large', {
        context: { projectTargetRegion: targetRegion },
        rankingMode,
      });
      if (retryResponse.items.length > 0) return retryResponse;
    }
  }

  // AI 쿼리 전부 실패 시 기존 방식으로 폴백
  if (response.items.length === 0 && aiQueries.length > 0) {
    const fallbackQuery = buildSearchQuery(scene, prevScene, nextScene, globalContext);
    if (fallbackQuery !== query) {
      return searchGoogleImages(fallbackQuery, startIndex, 'large', {
        context: { scene, prevScene, nextScene, globalContext, projectTargetRegion: targetRegion },
        rankingMode,
      });
    }
  }

  return response;
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
  // [FIX #681] 배치 중복 URL 방지 — 같은 이미지가 여러 장면에 반복되는 문제 수정
  const usedImageUrls = new Set<string>();
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

      try {
        // [FIX #681] AI 검색어 변환 활용 — 항상 1페이지부터, 중복 URL은 usedImageUrls로 스킵
        const response = await searchSceneReferenceImages(
          scene, prevScene, nextScene, globalContext, 1, 'fast',
          { bypassEmptyCache: true },
        );

        if (_autoApplyRunId !== runId) return;

        if (response.items.length > 0) {
          // [FIX #681] 중복 URL 스킵 — 아직 사용하지 않은 첫 번째 이미지 선택
          const uniqueItem = response.items.find((item) => !usedImageUrls.has(item.link));
          const selectedItem = uniqueItem || response.items[0];
          usedImageUrls.add(selectedItem.link);

          if (!isPrimaryReferenceProvider(response.provider)) fallbackCount++;
          updateScene(scene.id, {
            imageUrl: selectedItem.link,
            isGeneratingImage: false,
            generationStatus: isPrimaryReferenceProvider(response.provider) ? '구글 레퍼런스 적용됨' : '대체 레퍼런스 적용됨',
            imageUpdatedAfterVideo: !!scene.videoUrl,
            referenceSearchPage: 1,
            referenceSearchQuery: response.query,
          });
          appliedCount++;
        } else {
          failedCount++;
          updateScene(scene.id, {
            isGeneratingImage: false,
            generationStatus: '검색 결과 없음',
            referenceSearchPage: 1,
            referenceSearchQuery: response.query,
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
          referenceSearchQuery: '',
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
