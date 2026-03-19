/**
 * Google 이미지 검색 레퍼런스 서비스
 * - Google Custom Search JSON API (무료 100회/일)
 * - 대본 맥락에서 검색어 자동 생성
 * - 비용 0원 — AI 이미지 생성 API 호출 없음
 */

import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { logger } from './LoggerService';
import type { Scene } from '../types';

// ─── Google CSE 설정 ───
const CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';
// 공개 CSE ID — 이미지 검색용 (전체 웹 검색)
const DEFAULT_CSE_CX = '00a27b5dc0c2a4200';

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

// ─── Google CSE API 호출 ───

/** CSE API 키 조회 (apiService.ts의 공식 getter 사용 — 키 풀 회전 + sanitize 포함) */
function getCseApiKey(): string {
  return getYoutubeApiKey();
}

/** CSE cx 조회 */
function getCseCx(): string {
  const custom = localStorage.getItem('CUSTOM_CSE_CX');
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_CSE_CX;
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
  const apiKey = getCseApiKey();
  const cx = getCseCx();

  if (!apiKey) {
    throw new Error('Google API 키가 설정되지 않았습니다. 설정 > API 키에서 YouTube/Google API 키를 입력하세요.');
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    searchType: 'image',
    num: '10',
    start: String(start),
    imgSize,
    safe: 'active',
  });

  const url = `${CSE_API_URL}?${params.toString()}`;
  logger.info('[GoogleRef] 검색 요청', `query="${query}" start=${start}`);

  const res = await monitoredFetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error('[GoogleRef] 검색 실패', `status=${res.status} ${errText}`);
    if (res.status === 429) {
      throw new Error('일일 검색 한도(100회)를 초과했습니다. 내일 다시 시도해주세요.');
    }
    if (res.status === 403) {
      throw new Error('Google API 키 인증에 실패했습니다. API 키를 확인해주세요.');
    }
    throw new Error(`구글 검색 실패 (${res.status})`);
  }

  const data = await res.json();

  const items: GoogleImageResult[] = (data.items || []).map((item: Record<string, unknown>) => ({
    title: (item.title as string) || '',
    link: (item.link as string) || '',
    displayLink: (item.displayLink as string) || '',
    snippet: (item.snippet as string) || '',
    thumbnailLink: ((item.image as Record<string, unknown>)?.thumbnailLink as string) || '',
    contextLink: ((item.image as Record<string, unknown>)?.contextLink as string) || '',
    width: ((item.image as Record<string, unknown>)?.width as number) || 0,
    height: ((item.image as Record<string, unknown>)?.height as number) || 0,
  }));

  return {
    items,
    totalResults: parseInt((data.searchInformation as Record<string, unknown>)?.totalResults as string || '0', 10),
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
