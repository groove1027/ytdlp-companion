/**
 * 자료영상 레퍼런스 서비스 — YouTube 영상 + 타임코드 매칭
 *
 * 장면 텍스트 → YouTube 검색 → 자막 추출 → AI 타임코드 매칭
 */
import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { evolinkChat, getEvolinkKey } from './evolinkService';
import { logger } from './LoggerService';
import type { Scene, VideoReference } from '../types';

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // JSON 블록 추출
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); } catch { return null; }
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_SEARCH_RESULTS = 10;
const MAX_DISPLAY_RESULTS = 5;
const SEARCH_CONCURRENCY = 2;
const TRANSCRIPT_TIMEOUT_MS = 10000;
const AI_MATCH_TIMEOUT_MS = 15000;

// ─── 쿼터 추적 (youtubeAnalysisService와 공유 저장소) ───
function trackQuota(units: number): boolean {
  const STORAGE_KEY = 'YOUTUBE_QUOTA_USED';
  const DAILY_LIMIT = 10000;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (stored.date !== today) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, used: units }));
      return true;
    }
    if (stored.used + units > DAILY_LIMIT) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, used: stored.used + units }));
    return true;
  } catch { return true; }
}

// ─── YouTube Search API 호출 (가볍게 — snippet만) ───
interface YTSearchItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

async function searchYouTubeVideos(query: string, maxResults = MAX_SEARCH_RESULTS): Promise<YTSearchItem[]> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) { logger.warn('[VideoRef] YouTube API 키 없음'); return []; }
  if (!trackQuota(100)) { logger.warn('[VideoRef] YouTube 쿼터 초과'); return []; }

  // [FIX codex-review] 브라우저 로케일에서 언어/지역 자동 감지 (하드코딩 제거)
  const lang = (navigator.language || 'ko-KR').split('-');
  const relevanceLang = lang[0] || 'ko';
  const region = (lang[1] || 'KR').toUpperCase();
  const url = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&relevanceLanguage=${relevanceLang}&regionCode=${region}&key=${apiKey}`;

  try {
    const res = await monitoredFetch(url, {}, 15000);
    if (!res.ok) throw new Error(`YouTube Search API ${res.status}`);
    const data = await res.json();

    return (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId || '',
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
      publishedAt: item.snippet?.publishedAt || '',
    })).filter((v: YTSearchItem) => v.videoId);
  } catch (e) {
    logger.error('[VideoRef] YouTube 검색 실패', e instanceof Error ? e.message : '');
    return [];
  }
}

// ─── 영상 duration 조회 ───
async function getVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey || videoIds.length === 0) return new Map();
  if (!trackQuota(1)) return new Map();

  const url = `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
  try {
    const res = await monitoredFetch(url, {}, 10000);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, number>();
    for (const item of data.items || []) {
      const dur = parseDuration(item.contentDetails?.duration || '');
      map.set(item.id, dur);
    }
    return map;
  } catch { return new Map(); }
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
}

// ─── 타임코드 자막 추출 (timedtext XML) ───
interface TimedCue { start: number; dur: number; text: string; }

const COMPANION_URL = 'http://127.0.0.1:9876';

async function fetchTimedCaptions(videoId: string): Promise<TimedCue[]> {
  const attempts = [
    { lang: 'ko', kind: '' },
    { lang: 'ko', kind: 'asr' },
    { lang: 'en', kind: '' },
    { lang: 'en', kind: 'asr' },
  ];

  for (const { lang, kind } of attempts) {
    try {
      const kindParam = kind ? `&kind=${kind}` : '';
      const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=srv3`;

      // 1순위: 컴패니언 프록시 (CORS 우회)
      let xml = '';
      try {
        const proxyRes = await fetch(`${COMPANION_URL}/api/google-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, method: 'GET', headers: {} }),
          signal: AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS),
        });
        if (proxyRes.ok) xml = await proxyRes.text();
      } catch { /* companion unavailable */ }

      // 2순위: 직접 fetch (컴패니언 실패/비정상 응답 시 모두 시도)
      if (!xml || xml.length < 50) {
        try {
          const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS) });
          if (directRes.ok) xml = await directRes.text();
        } catch { /* continue */ }
      }

      if (!xml || xml.length < 50) continue;

      const cues = parseTimedtextXml(xml);
      if (cues.length > 3) {
        logger.info('[VideoRef] 타임코드 자막 추출 성공', `videoId=${videoId} lang=${lang} cues=${cues.length}`);
        return cues;
      }
    } catch { continue; }
  }

  logger.warn('[VideoRef] 타임코드 자막 추출 실패', videoId);
  return [];
}

function parseTimedtextXml(xml: string): TimedCue[] {
  const cues: TimedCue[] = [];
  const cleanHtml = (s: string) => s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n/g, ' ').trim();

  // srv1: <text start="초" dur="초">텍스트</text>
  const srv1 = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = srv1.exec(xml)) !== null) {
    const text = cleanHtml(m[3]);
    if (text) cues.push({ start: parseFloat(m[1]), dur: parseFloat(m[2]), text });
  }

  if (cues.length > 0) return cues;

  // srv3: <p t="밀리초" d="밀리초">텍스트</p>
  const srv3 = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = srv3.exec(xml)) !== null) {
    const text = cleanHtml(m[3]);
    if (text) cues.push({ start: parseInt(m[1]) / 1000, dur: parseInt(m[2]) / 1000, text });
  }

  return cues;
}

// ─── AI 타임코드 매칭 (Gemini Flash Lite) ───
async function matchSceneToSegments(
  sceneText: string,
  cues: TimedCue[],
  videoTitle: string,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }[]> {
  if (!getEvolinkKey() || cues.length === 0) return [];

  // 자막을 30초 단위 청크로 묶어서 전달 (토큰 절약)
  const chunks: { startSec: number; endSec: number; text: string }[] = [];
  let chunkStart = cues[0].start;
  let chunkTexts: string[] = [];

  for (const cue of cues) {
    if (cue.start - chunkStart > 30 && chunkTexts.length > 0) {
      chunks.push({ startSec: chunkStart, endSec: cue.start, text: chunkTexts.join(' ') });
      chunkStart = cue.start;
      chunkTexts = [];
    }
    chunkTexts.push(cue.text);
  }
  if (chunkTexts.length > 0) {
    const lastCue = cues[cues.length - 1];
    chunks.push({ startSec: chunkStart, endSec: lastCue.start + lastCue.dur, text: chunkTexts.join(' ') });
  }

  // 최대 20개 청크만 전달 (비용 제한)
  const limitedChunks = chunks.slice(0, 20);

  const chunksText = limitedChunks.map((c, i) =>
    `[${i}] ${formatTime(c.startSec)}~${formatTime(c.endSec)}: ${c.text.slice(0, 100)}`
  ).join('\n');

  try {
    const response = await evolinkChat([
      { role: 'system', content: 'You match script scenes to video transcript segments. Return ONLY valid JSON.' },
      { role: 'user', content: [
        `영상 "${videoTitle}"의 자막 구간 중, 아래 대본 장면과 가장 관련 있는 구간을 1~3개 찾아줘.`,
        '',
        `[대본 장면]`,
        sceneText.slice(0, 300),
        '',
        `[영상 자막 구간]`,
        chunksText,
        '',
        '반환 형식: {"matches":[{"index":0,"score":0.92,"reason":"트럼프 이란 발언 관련"}]}',
        'index = 위 자막 구간 번호, score = 0~1 관련도',
      ].join('\n') },
    ], {
      temperature: 0.2,
      maxTokens: 300,
      timeoutMs: AI_MATCH_TIMEOUT_MS,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(raw);
    const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];

    return matches
      .filter((m: any) => typeof m.index === 'number' && m.index >= 0 && m.index < limitedChunks.length)
      .map((m: any) => ({
        startSec: limitedChunks[m.index].startSec,
        endSec: limitedChunks[m.index].endSec,
        matchScore: Math.min(1, Math.max(0, parseFloat(m.score) || 0.5)),
        segmentText: limitedChunks[m.index].text.slice(0, 150),
      }))
      .sort((a: { matchScore: number }, b: { matchScore: number }) => b.matchScore - a.matchScore)
      .slice(0, 3);
  } catch (e) {
    logger.warn('[VideoRef] AI 타임코드 매칭 실패', e instanceof Error ? e.message : '');
    return [];
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 검색어 생성 (AI 키워드 + 규칙 기반 폴백) ───
async function buildVideoSearchQuery(scene: Scene, globalContext?: string): Promise<string> {
  const sceneText = (scene.scriptText || scene.visualDescriptionKO || '').slice(0, 200);

  // AI 키워드 생성 시도 (Gemini Flash Lite)
  if (getEvolinkKey() && sceneText.length > 10) {
    try {
      const res = await evolinkChat([
        { role: 'system', content: 'YouTube 자료영상 검색 키워드를 생성합니다. JSON만 반환.' },
        { role: 'user', content: `아래 대본에 맞는 YouTube 검색 키워드를 1개 생성해줘.
목적: 뉴스, 다큐멘터리, 강의 등 자료영상을 찾는 것.
규칙: 핵심 인물+사건/장소를 3~6단어로 요약. 예: "트럼프 이란 핵 협상 경고"

[대본]
${sceneText}

반환: {"query":"키워드"}` },
      ], {
        temperature: 0.2, maxTokens: 100, timeoutMs: 8000,
        responseFormat: { type: 'json_object' },
        model: 'gemini-3.1-flash-lite-preview',
      });
      const parsed = extractJsonObject(res.choices?.[0]?.message?.content || '');
      if (parsed?.query && typeof parsed.query === 'string' && parsed.query.length >= 3) {
        logger.info('[VideoRef] AI 검색어 생성', `"${parsed.query}"`);
        return parsed.query;
      }
    } catch { /* fall through to rule-based */ }
  }

  // 규칙 기반 폴백
  const parts: string[] = [];
  if (scene.entityName) parts.push(scene.entityName.slice(0, 15));
  if (scene.sceneLocation) parts.push(scene.sceneLocation.slice(0, 15));
  // 대본 첫 문장에서 핵심 20자
  const firstSentence = sceneText.split(/[.!?。！？]/)[0] || '';
  if (firstSentence.length > 5) parts.push(firstSentence.slice(0, 25));
  if (parts.length < 2 && globalContext) parts.push(globalContext.slice(0, 15));

  return parts.join(' ').slice(0, 50) || '뉴스 자료영상';
}

// ─── 메인 함수: 장면별 자료영상 검색 ───
export async function searchSceneReferenceVideos(
  scene: Scene,
  globalContext?: string,
  signal?: AbortSignal,
): Promise<VideoReference[]> {
  const query = await buildVideoSearchQuery(scene, globalContext);
  logger.info('[VideoRef] 장면 검색', `query="${query}"`);

  // 1) YouTube 검색
  if (signal?.aborted) return [];
  const searchResults = await searchYouTubeVideos(query, MAX_SEARCH_RESULTS);
  if (searchResults.length === 0) return [];

  // 2) 영상 duration 조회
  if (signal?.aborted) return [];
  const durations = await getVideoDurations(searchResults.map(v => v.videoId));

  // 3) 각 영상의 자막 추출 + AI 매칭 (병렬, 최대 5개)
  const candidates = searchResults.slice(0, 5);
  const results: VideoReference[] = [];

  const sceneText = scene.scriptText || scene.visualDescriptionKO || '';

  await Promise.allSettled(candidates.map(async (video) => {
    if (signal?.aborted) return;
    const cues = await fetchTimedCaptions(video.videoId);
    if (cues.length === 0) {
      // 자막 없으면 영상 전체를 결과로 추가 (타임코드 없이)
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: 0,
        endSec: durations.get(video.videoId) || 0,
        matchScore: 0.3,
        segmentText: '(자막 없음 — 영상 전체)',
        duration: durations.get(video.videoId) || 0,
      });
      return;
    }

    if (signal?.aborted) return;
    const segments = await matchSceneToSegments(sceneText, cues, video.title);
    if (segments.length === 0) {
      // AI 매칭 실패 시 첫 30초를 기본 결과로
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: 0,
        endSec: Math.min(30, durations.get(video.videoId) || 30),
        matchScore: 0.4,
        segmentText: cues.slice(0, 5).map(c => c.text).join(' ').slice(0, 150),
        duration: durations.get(video.videoId) || 0,
      });
      return;
    }

    // 가장 관련도 높은 세그먼트를 결과로
    const best = segments[0];
    results.push({
      videoId: video.videoId,
      videoTitle: video.title,
      channelTitle: video.channelTitle,
      thumbnailUrl: video.thumbnail,
      startSec: Math.floor(best.startSec),
      endSec: Math.floor(best.endSec),
      matchScore: best.matchScore,
      segmentText: best.segmentText,
      duration: durations.get(video.videoId) || 0,
    });
  }));

  // 관련도 순 정렬
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, MAX_DISPLAY_RESULTS);
}

// ─── 일괄 검색 ───
let _batchRunId = 0;
let _batchAbortCtrl: AbortController | null = null;

export async function searchAllScenesReferenceVideos(
  scenes: Scene[],
  globalContext: string,
  onSceneResult: (sceneId: string, refs: VideoReference[]) => void,
): Promise<void> {
  // [FIX codex-review] 이전 검색의 in-flight 요청도 abort
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = new AbortController();
  const signal = _batchAbortCtrl.signal;
  const runId = ++_batchRunId;
  const scenesWithContent = scenes.filter(s => s.scriptText || s.visualDescriptionKO);

  // 동시성 제한 (2개씩)
  for (let i = 0; i < scenesWithContent.length; i += SEARCH_CONCURRENCY) {
    if (_batchRunId !== runId || signal.aborted) return; // 취소됨

    const batch = scenesWithContent.slice(i, i + SEARCH_CONCURRENCY);
    await Promise.allSettled(batch.map(async (scene) => {
      if (_batchRunId !== runId || signal.aborted) return;
      const refs = await searchSceneReferenceVideos(scene, globalContext, signal);
      if (_batchRunId === runId && !signal.aborted) {
        onSceneResult(scene.id, refs);
      }
    }));
  }
}

export function cancelVideoReferenceSearch() {
  _batchRunId++;
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = null;
}
