/**
 * 자료영상 레퍼런스 서비스 v2 — 컴패니언 + Scene Detection + Gemini 영상 직접 분석
 *
 * 파이프라인:
 *   1. YouTube 검색 → 후보 영상 목록
 *   2. 컴패니언 yt-dlp → 영상 다운로드 (360p, 분석용)
 *   3. Scene Detection → 정밀 컷 포인트 감지
 *   4. 자막 추출 (보조 시그널)
 *   5. Gemini 영상 직접 분석 → 대본 장면과 정밀 매칭
 *   6. mergeWithAiTimecodes → 컷 포인트에 스냅
 */
import { monitoredFetch, getYoutubeApiKey } from './apiService';
import { evolinkChat, getEvolinkKey, evolinkVideoAnalysisStream } from './evolinkService';
import { logger } from './LoggerService';
import { detectSceneCuts, mergeWithAiTimecodes } from './sceneDetection';
// ensureCompanionAvailable 미사용 — health check가 블로킹되므로 다운로드 직접 시도
import type { SceneCut } from './sceneDetection';
import type { Scene, VideoReference } from '../types';

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 마크다운 코드 블록 제거 (```json ... ```)
  const stripped = trimmed
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  let jsonMatch = stripped.match(/\{[\s\S]*\}/);

  // 불완전 JSON 복구 — 스트리밍 타임아웃으로 잘린 응답 처리
  if (!jsonMatch && stripped.includes('{')) {
    const partial = stripped.slice(stripped.indexOf('{'));
    // 잘린 key-value 제거 + trailing comma 제거 + 닫기
    const repairs = [
      partial.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '') + '}',  // 불완전 kv 제거
      partial.replace(/,\s*$/, '') + '}',                          // trailing comma만
      partial + '"}',                                                // value 미완성
      partial + '}',                                                 // 단순 닫기
    ];
    for (const attempt of repairs) {
      try {
        const obj = JSON.parse(attempt);
        logger.info('[VideoRef] 불완전 JSON 복구 성공');
        return obj;
      } catch { /* try next */ }
    }
    logger.warn('[VideoRef] JSON 복구 불가', partial.replace(/\n/g, '⏎').slice(0, 200));
    return null;
  }

  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    logger.warn('[VideoRef] JSON 파싱 에러', `${(e as Error).message}`);
    return null;
  }
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_SEARCH_RESULTS = 10;
const MAX_DISPLAY_RESULTS = 5;
const SEARCH_CONCURRENCY = 1; // v2: 다운로드+분석이 무거우므로 1개씩
const COMPANION_URL = 'http://127.0.0.1:9876';

// ─── 쿼터 추적 ───
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

// ─── YouTube Search API ───
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

  const lang = (navigator.language || 'ko-KR').split('-');
  const url = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&relevanceLanguage=${lang[0] || 'ko'}&regionCode=${(lang[1] || 'KR').toUpperCase()}&key=${apiKey}`;

  try {
    const res = await monitoredFetch(url, {}, 15000);
    if (!res.ok) throw new Error(`YouTube Search ${res.status}`);
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
      const m = (item.contentDetails?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (m) map.set(item.id, (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0'));
    }
    return map;
  } catch { return new Map(); }
}

function formatTime(sec: number): string {
  const v = Number.isFinite(sec) ? Math.max(0, sec) : 0;
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 컴패니언 감지: health check 30초 대기 (첫 연결 시 detect_services 블로킹 고려) ───
async function checkCompanion(signal?: AbortSignal): Promise<boolean> {
  try {
    const timeoutSig = AbortSignal.timeout(30000); // 30초 — 첫 연결 시 detect_services 대기
    const combined = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    logger.info('[VideoRef] 컴패니언 health 체크 (30s 대기)');
    const res = await fetch(`${COMPANION_URL}/health`, { signal: combined });
    if (res.ok) {
      logger.info('[VideoRef] 컴패니언 ✅ 감지');
      return true;
    }
  } catch (e) {
    logger.warn('[VideoRef] 컴패니언 ❌ 미감지', e instanceof Error ? e.message : '');
  }
  return false;
}

// ─── Phase 2: 컴패니언 yt-dlp로 영상 다운로드 (분석용, 360p) ───
async function downloadVideoForAnalysis(videoId: string, signal?: AbortSignal): Promise<Blob | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const dlUrl = `${COMPANION_URL}/api/download?url=${encodeURIComponent(ytUrl)}&quality=1080p&videoOnly=true`;

  try {
    logger.info('[VideoRef] 컴패니언 다운로드 시작', videoId);
    const timeoutSignal = AbortSignal.timeout(300000); // 5분 — 1080p 롱폼 다운로드 고려
    const combined = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const res = await fetch(dlUrl, { signal: combined });
    if (!res.ok) {
      logger.warn('[VideoRef] 다운로드 실패', `${res.status} ${res.statusText}`);
      return null;
    }
    // MIME 검증 — video/* 또는 audio/* 만 허용
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('video/') && !ct.startsWith('audio/') && !ct.includes('octet-stream')) {
      logger.warn('[VideoRef] 다운로드 MIME 불일치', `${ct} (video/* 기대)`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size < 10000) {
      logger.warn('[VideoRef] 다운로드 크기 너무 작음', `${blob.size} bytes`);
      return null;
    }
    logger.info('[VideoRef] 다운로드 완료', `${videoId} ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
    return blob;
  } catch (e) {
    logger.warn('[VideoRef] 다운로드 에러', e instanceof Error ? e.message : '');
    return null;
  }
}

// ─── Phase 3: Scene Detection (클라이언트 사이드) ───
async function runSceneDetection(blob: Blob, signal?: AbortSignal): Promise<SceneCut[]> {
  try {
    logger.info('[VideoRef] Scene Detection 시작', `${(blob.size / 1024 / 1024).toFixed(1)}MB`);
    const cuts = await detectSceneCuts(blob, {
      maxFrames: 10000, // 20분 영상 커버 (200ms 간격 기준)
    });
    logger.info('[VideoRef] Scene Detection 완료', `${cuts.length}개 컷 감지`);
    return cuts;
  } catch (e) {
    logger.warn('[VideoRef] Scene Detection 실패', e instanceof Error ? e.message : '');
    return [];
  }
}

// ─── Phase 4: 자막 추출 (보조 시그널) ───
interface TimedCue { start: number; dur: number; text: string; }

async function fetchTimedCaptions(videoId: string): Promise<TimedCue[]> {
  const attempts = [
    { lang: 'ko', kind: '' }, { lang: 'ko', kind: 'asr' },
    { lang: 'en', kind: '' }, { lang: 'en', kind: 'asr' },
  ];

  for (const { lang, kind } of attempts) {
    try {
      const kindParam = kind ? `&kind=${kind}` : '';
      const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=srv3`;

      let xml = '';
      try {
        const proxyRes = await fetch(`${COMPANION_URL}/api/google-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, method: 'GET', headers: {} }),
          signal: AbortSignal.timeout(10000),
        });
        if (proxyRes.ok) xml = await proxyRes.text();
      } catch { /* companion unavailable */ }

      if (!xml || xml.length < 50) {
        try {
          const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
          if (directRes.ok) xml = await directRes.text();
        } catch { /* continue */ }
      }

      if (!xml || xml.length < 50) continue;

      const cues: TimedCue[] = [];
      const cleanHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim();

      // srv1
      let m: RegExpExecArray | null;
      const srv1 = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
      while ((m = srv1.exec(xml)) !== null) {
        const text = cleanHtml(m[3]);
        if (text) cues.push({ start: parseFloat(m[1]), dur: parseFloat(m[2]), text });
      }
      if (cues.length === 0) {
        const srv3 = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
        while ((m = srv3.exec(xml)) !== null) {
          const text = cleanHtml(m[3]);
          if (text) cues.push({ start: parseInt(m[1]) / 1000, dur: parseInt(m[2]) / 1000, text });
        }
      }

      if (cues.length > 3) {
        logger.info('[VideoRef] 자막 추출 성공', `${videoId} lang=${lang} cues=${cues.length}`);
        return cues;
      }
    } catch { continue; }
  }
  return [];
}

// ─── Phase 5: Gemini 영상 직접 분석 + Scene Detection 컷 스냅 ───
async function matchVideoToSceneWithGemini(
  videoId: string,
  sceneText: string,
  cutPoints: SceneCut[],
  captionText: string,
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  if (!getEvolinkKey()) {
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(Evolink 키 없음)' };
  }

  // 컷 포인트를 인덱스+초값으로 제시 (Gemini가 인덱스로 선택)
  const limitedCuts = cutPoints.slice(0, 50);
  const cutList = limitedCuts.length > 0
    ? limitedCuts.map((c, i) => `[${i}] ${c.timeSec.toFixed(1)}s (${formatTime(c.timeSec)})`).join('\n')
    : '';

  // 자막은 sceneText와 관련된 구간만 추출 (앞 500자 편향 방지)
  const captionSummary = captionText ? `\n\n[자막 전체 (타임코드 포함)]\n${captionText.slice(0, 1500)}` : '';

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const hasCuts = limitedCuts.length > 0;

  try {
    logger.info('[VideoRef] Gemini 영상 분석 시작', videoId);

    const result = await evolinkVideoAnalysisStream(
      youtubeUrl,
      'video/mp4',
      '당신은 영상 편집 전문가입니다. YouTube 영상을 직접 분석하여 대본과 가장 관련된 구간을 정밀하게 찾아줍니다. 반드시 JSON만 반환합니다.',
      [
        `이 YouTube 영상을 직접 보고, 아래 대본 장면과 가장 관련된 구간을 찾아줘.`,
        `시각적 내용(화면에 보이는 것) + 음성/자막을 모두 고려하세요.`,
        '',
        `[대본 장면]`,
        sceneText.slice(0, 400),
        '',
        hasCuts ? [
          `[Scene Detection 컷 포인트 — 실제 장면 전환 지점, 총 ${limitedCuts.length}개]`,
          cutList,
          '',
          `규칙:`,
          `1. startCutIndex: 관련 구간이 시작되는 컷 인덱스 번호 (위 [N]에서 N)`,
          `2. endCutIndex: 관련 구간이 끝나는 컷 인덱스 번호`,
          `3. 컷 포인트가 없는 구간이면 startSec/endSec를 직접 초 단위로 지정`,
        ].join('\n') : '컷 포인트 없음 — startSec/endSec를 직접 초 단위로 지정하세요.',
        captionSummary,
        '',
        `4. 대본 내용과 영상 내용이 실제로 일치하는 구간만 선택`,
        `5. 일치하는 구간이 없으면 score를 0.2 이하로 설정`,
        '',
        hasCuts
          ? `반환: {"startCutIndex": N, "endCutIndex": M, "score": 0~1, "reason": "설명"}`
          : `반환: {"startSec": 초, "endSec": 초, "score": 0~1, "reason": "설명"}`,
      ].join('\n'),
      () => {},
      { temperature: 0.1, maxOutputTokens: 500 }, // signal 미전달 — 내부 65s×2 재시도 허용
    );

    logger.info('[VideoRef] Gemini 응답 원문', (result || '(빈)').replace(/\n/g, '⏎').slice(0, 500));
    const parsed = extractJsonObject(result);
    if (!parsed) {
      logger.warn('[VideoRef] Gemini 응답 파싱 실패', `원문: "${result.slice(0, 200)}"`);
      return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(파싱 실패)' };
    }

    let rawStart: number;
    let rawEnd: number;

    // 컷 인덱스 기반 응답 처리
    const rawSi = Number(parsed.startCutIndex);
    const rawEi = Number(parsed.endCutIndex);
    if (hasCuts && Number.isFinite(rawSi) && rawSi >= 0) {
      const si = Math.max(0, Math.min(Math.floor(rawSi), limitedCuts.length - 1));
      const ei = Number.isFinite(rawEi) && rawEi >= 0
        ? Math.max(si, Math.min(Math.floor(rawEi), limitedCuts.length - 1))
        : Math.min(si + 1, limitedCuts.length - 1);
      rawStart = limitedCuts[si].timeSec;
      rawEnd = ei > si ? limitedCuts[ei].timeSec : rawStart + 30;
    } else {
      rawStart = Number(parsed.startSec) || 0;
      rawEnd = Number(parsed.endSec) || rawStart + 30;
    }

    // 유효성 검증
    if (!Number.isFinite(rawStart) || rawStart < 0) rawStart = 0;
    if (!Number.isFinite(rawEnd) || rawEnd <= rawStart) rawEnd = rawStart + 30;

    const score = Math.min(1, Math.max(0, Number(parsed.score) || 0.5));
    const reason = String(parsed.reason || '');

    // Scene Detection 컷 포인트에 스냅
    const snappedStart = cutPoints.length > 0
      ? mergeWithAiTimecodes([rawStart], cutPoints)[0]
      : rawStart;
    const snappedEnd = cutPoints.length > 0
      ? mergeWithAiTimecodes([rawEnd], cutPoints)[0]
      : rawEnd;

    logger.info('[VideoRef] Gemini 매칭 완료',
      `${formatTime(snappedStart)}~${formatTime(snappedEnd)} score=${score.toFixed(2)} "${reason.slice(0, 50)}"`);

    return {
      startSec: Math.floor(snappedStart),
      endSec: Math.floor(Math.max(snappedEnd, snappedStart + 1)),
      matchScore: score,
      segmentText: reason.slice(0, 150),
    };
  } catch (e) {
    logger.warn('[VideoRef] Gemini 영상 분석 실패', e instanceof Error ? e.message : '');
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(분석 실패)' };
  }
}

// ─── 자막 기반 AI 매칭 (폴백 — 컴패니언 없을 때) ───
async function matchWithCaptionsOnly(
  sceneText: string,
  cues: TimedCue[],
  videoTitle: string,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string } | null> {
  if (!getEvolinkKey() || cues.length === 0) return null;

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

  const limitedChunks = chunks.slice(0, 20);
  const chunksText = limitedChunks.map((c, i) =>
    `[${i}] ${formatTime(c.startSec)}~${formatTime(c.endSec)}: ${c.text.slice(0, 100)}`
  ).join('\n');

  try {
    const response = await evolinkChat([
      { role: 'system', content: 'Match script to video segments. Return ONLY JSON.' },
      { role: 'user', content: `영상 "${videoTitle}"에서 대본과 가장 관련된 구간을 찾아줘.\n\n[대본]\n${sceneText.slice(0, 300)}\n\n[자막 구간]\n${chunksText}\n\n반환: {"index":0,"score":0.9,"reason":"설명"}` },
    ], {
      temperature: 0.2, maxTokens: 200, timeoutMs: 15000,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
    });

    const parsed = extractJsonObject(response.choices?.[0]?.message?.content || '');
    const idx = typeof parsed?.index === 'number' ? parsed.index : -1;
    if (idx < 0 || idx >= limitedChunks.length) return null;

    return {
      startSec: limitedChunks[idx].startSec,
      endSec: limitedChunks[idx].endSec,
      matchScore: Math.min(1, Math.max(0, Number(parsed?.score) || 0.5)),
      segmentText: limitedChunks[idx].text.slice(0, 150),
    };
  } catch { return null; }
}

// ─── 검색어 생성 ───
async function buildVideoSearchQuery(scene: Scene, globalContext?: string): Promise<string> {
  const sceneText = (scene.scriptText || scene.visualDescriptionKO || '').slice(0, 200);

  if (getEvolinkKey() && sceneText.length > 10) {
    try {
      const res = await evolinkChat([
        { role: 'system', content: 'YouTube 자료영상 검색 키워드를 생성합니다. JSON만 반환.' },
        { role: 'user', content: `아래 대본에 맞는 YouTube 검색 키워드를 1개 생성해줘.\n목적: 뉴스, 다큐멘터리, 강의 등 자료영상 검색\n규칙: 핵심 인물+사건/장소를 3~6단어로 요약\n\n[대본]\n${sceneText}\n\n반환: {"query":"키워드"}` },
      ], {
        temperature: 0.2, maxTokens: 100, timeoutMs: 8000,
        responseFormat: { type: 'json_object' },
        model: 'gemini-3.1-flash-lite-preview',
      });
      const parsed = extractJsonObject(res.choices?.[0]?.message?.content || '');
      if (parsed?.query && typeof parsed.query === 'string' && parsed.query.length >= 3) {
        return parsed.query as string;
      }
    } catch { /* fall through */ }
  }

  const parts: string[] = [];
  if (scene.entityName) parts.push(scene.entityName.slice(0, 15));
  if (scene.sceneLocation) parts.push(scene.sceneLocation.slice(0, 15));
  const firstSentence = sceneText.split(/[.!?。！？]/)[0] || '';
  if (firstSentence.length > 5) parts.push(firstSentence.slice(0, 25));
  if (parts.length < 2 && globalContext) parts.push(globalContext.slice(0, 15));
  return parts.join(' ').slice(0, 50) || '뉴스 자료영상';
}

// ─── 메인: 장면별 자료영상 검색 (v2 — 컴패니언 + Scene Detection + Gemini) ───
export async function searchSceneReferenceVideos(
  scene: Scene,
  globalContext?: string,
  signal?: AbortSignal,
): Promise<VideoReference[]> {
  const query = await buildVideoSearchQuery(scene, globalContext);
  logger.info('[VideoRef] 장면 검색', `query="${query}"`);

  if (signal?.aborted) return [];
  const searchResults = await searchYouTubeVideos(query, MAX_SEARCH_RESULTS);
  logger.info('[VideoRef] YouTube 검색 결과', `${searchResults.length}개`);
  if (searchResults.length === 0) return [];

  if (signal?.aborted) return [];
  const durations = await getVideoDurations(searchResults.map(v => v.videoId));

  const sceneText = scene.scriptText || scene.visualDescriptionKO || '';
  const results: VideoReference[] = [];

  // ─── 1순위: 컴패니언 + Scene Detection + Gemini 영상 분석 (상위 2개까지 시도) ───
  const companionUp = await checkCompanion(signal);
  let v2Succeeded = false;

  if (companionUp) {
    // 상위 2개 후보까지 시도 (1번째 실패 시 2번째)
    const v2Candidates = searchResults.slice(0, 2);

    for (const candidate of v2Candidates) {
      if (signal?.aborted) return [];
      logger.info('[VideoRef] 🎬 v2 파이프라인 시작', candidate.videoId);

      // Phase 2: 영상 다운로드 + Phase 4: 자막 추출 (병렬)
      const [blob, cues] = await Promise.all([
        downloadVideoForAnalysis(candidate.videoId, signal),
        fetchTimedCaptions(candidate.videoId),
      ]);

      if (signal?.aborted) return [];

      // 다운로드 실패 → 다음 후보 시도
      if (!blob) {
        logger.info('[VideoRef] 다운로드 실패 → 다음 후보 시도');
        continue;
      }

      // Phase 3: Scene Detection
      const cutPoints = await runSceneDetection(blob, signal);
      if (signal?.aborted) return [];

      // Phase 5: Gemini 영상 직접 분석 + 컷 스냅
      const captionText = cues.map(c => `${formatTime(c.start)}: ${c.text}`).join('\n');
      const match = await matchVideoToSceneWithGemini(
        candidate.videoId, sceneText, cutPoints, captionText, signal,
      );

      // v2 매칭 성공 (score > 0.3)이면 채택
      if (match.matchScore > 0.3) {
        results.push({
          videoId: candidate.videoId,
          videoTitle: candidate.title,
          channelTitle: candidate.channelTitle,
          thumbnailUrl: candidate.thumbnail,
          startSec: match.startSec,
          endSec: match.endSec,
          matchScore: match.matchScore,
          segmentText: match.segmentText,
          duration: durations.get(candidate.videoId) || 0,
        });
        v2Succeeded = true;
        break; // 성공 — 다음 후보 불필요
      }

      // v2 실패 시 caption 폴백 시도
      logger.info('[VideoRef] v2 매칭 실패 → caption 폴백', `score=${match.matchScore}`);
      const captionMatch = cues.length > 0
        ? await matchWithCaptionsOnly(sceneText, cues, candidate.title)
        : null;
      if (captionMatch && captionMatch.matchScore > 0.4) {
        results.push({
          videoId: candidate.videoId,
          videoTitle: candidate.title,
          channelTitle: candidate.channelTitle,
          thumbnailUrl: candidate.thumbnail,
          startSec: captionMatch.startSec,
          endSec: captionMatch.endSec,
          matchScore: captionMatch.matchScore,
          segmentText: captionMatch.segmentText,
          duration: durations.get(candidate.videoId) || 0,
        });
        v2Succeeded = true;
        break;
      }
      // 이 후보도 실패 → 다음 후보 시도
    }
  }

  // ─── 2순위: 나머지 후보는 자막 기반 매칭 (가벼운 폴백) ───
  const v2TriedCount = companionUp ? 2 : 0;
  const remainingCandidates = searchResults.slice(v2TriedCount, v2TriedCount + 4);

  await Promise.allSettled(remainingCandidates.map(async (video) => {
    if (signal?.aborted) return;

    const cues = await fetchTimedCaptions(video.videoId);
    const match = cues.length > 0
      ? await matchWithCaptionsOnly(sceneText, cues, video.title)
      : null;

    if (match) {
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: match.startSec,
        endSec: match.endSec,
        matchScore: match.matchScore * 0.8, // 자막 기반은 80% 가중치
        segmentText: match.segmentText,
        duration: durations.get(video.videoId) || 0,
      });
    } else {
      results.push({
        videoId: video.videoId,
        videoTitle: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnail,
        startSec: 0,
        endSec: Math.min(30, durations.get(video.videoId) || 30),
        matchScore: 0.2,
        segmentText: cues.length > 0 ? cues.slice(0, 3).map(c => c.text).join(' ').slice(0, 100) : '(자막 없음)',
        duration: durations.get(video.videoId) || 0,
      });
    }
  }));

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
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = new AbortController();
  const signal = _batchAbortCtrl.signal;
  const runId = ++_batchRunId;
  const scenesWithContent = scenes.filter(s => s.scriptText || s.visualDescriptionKO);

  // v2: 동시성 1개 (다운로드+분석이 무거우므로)
  for (let i = 0; i < scenesWithContent.length; i += SEARCH_CONCURRENCY) {
    if (_batchRunId !== runId || signal.aborted) return;

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
