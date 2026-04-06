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
import type {
  ReferenceClipDownloadResult,
  Scene,
  SceneReferenceClipDownloadResult,
  VideoReference,
} from '../types';

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
const REFERENCE_DOWNLOAD_TIMEOUT_MS = 300_000;
const REFERENCE_TRIM_TIMEOUT_MS = 180_000;

// in-flight dedupe — 진행 중인 다운로드/트림 promise (완료 후 삭제, AbortError 전파)
const referenceClipInflight = new Map<string, Promise<ReferenceClipDownloadResult>>();
// 완료된 결과 캐시 — 최대 20개 LRU (성공 시에만 저장)
const referenceClipResultCache = new Map<string, ReferenceClipDownloadResult>();
const REFERENCE_CLIP_CACHE_MAX = 20;

function pushToResultCache(key: string, result: ReferenceClipDownloadResult): void {
  if (referenceClipResultCache.size >= REFERENCE_CLIP_CACHE_MAX) {
    const oldest = referenceClipResultCache.keys().next().value;
    if (oldest !== undefined) referenceClipResultCache.delete(oldest);
  }
  referenceClipResultCache.set(key, result);
}

// 원본 영상 in-flight dedupe — 같은 videoId의 다른 구간 트리밍 시 재다운로드 방지
const sourceVideoInflight = new Map<string, Promise<Blob | null>>();
// 원본 영상 완료 캐시 — 최대 5개 (대용량이므로 작게 제한)
const sourceVideoResultCache = new Map<string, Blob>();
const SOURCE_VIDEO_CACHE_MAX = 5;

function pushToSourceCache(videoId: string, blob: Blob): void {
  if (sourceVideoResultCache.size >= SOURCE_VIDEO_CACHE_MAX) {
    const oldest = sourceVideoResultCache.keys().next().value;
    if (oldest !== undefined) sourceVideoResultCache.delete(oldest);
  }
  sourceVideoResultCache.set(videoId, blob);
}

function sanitizeReferenceClipStem(raw: string): string {
  const sanitized = raw
    .replace(/[^\w가-힣\-_ ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return sanitized || 'reference_clip';
}

function buildReferenceClipKey(videoId: string, startSec: number, endSec: number): string {
  return `${videoId}:${Math.round(startSec * 1000)}-${Math.round(endSec * 1000)}`;
}

function buildReferenceClipFileName(
  videoId: string,
  startSec: number,
  endSec: number,
  videoTitle?: string,
): string {
  const stem = sanitizeReferenceClipStem(
    `${videoTitle || videoId}_${Math.floor(startSec)}_${Math.floor(endSec)}`,
  );
  return `${stem}.mp4`;
}

function guessBlobExtension(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes('quicktime')) return 'mov';
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogv';
  return 'mp4';
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

async function downloadCompanionVideoBlob(
  videoId: string,
  options?: {
    signal?: AbortSignal;
    quality?: string;
    videoOnly?: boolean;
    reason?: 'analysis' | 'reference';
  },
): Promise<Blob | null> {
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const quality = options?.quality || '1080p';
  const reasonLabel = options?.reason === 'analysis' ? '분석용' : '레퍼런스';
  const videoOnlyParam = options?.videoOnly === false ? '' : '&videoOnly=true';
  const dlUrl = `${COMPANION_URL}/api/download?url=${encodeURIComponent(ytUrl)}&quality=${encodeURIComponent(quality)}${videoOnlyParam}`;

  try {
    logger.info('[VideoRef] 컴패니언 다운로드 시작', `${reasonLabel} ${videoId}`);
    const timeoutSignal = AbortSignal.timeout(REFERENCE_DOWNLOAD_TIMEOUT_MS);
    const combined = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const res = await monitoredFetch(dlUrl, { signal: combined }, REFERENCE_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      logger.warn('[VideoRef] 다운로드 실패', `${res.status} ${res.statusText}`);
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('video/') && !ct.startsWith('audio/') && !ct.includes('octet-stream')) {
      logger.warn('[VideoRef] 다운로드 MIME 불일치', `${ct} (video/* 기대)`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size < 10_000) {
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

async function trimReferenceClipWithCompanion(
  sourceBlob: Blob,
  params: {
    videoId: string;
    startSec: number;
    endSec: number;
    videoTitle?: string;
    signal?: AbortSignal;
  },
): Promise<ReferenceClipDownloadResult> {
  const fileName = buildReferenceClipFileName(
    params.videoId,
    params.startSec,
    params.endSec,
    params.videoTitle,
  );
  const cutPayload = {
    input: await blobToBase64(sourceBlob),
    inputFormat: guessBlobExtension(sourceBlob),
    clips: [{
      label: fileName.replace(/\.mp4$/i, ''),
      startSec: params.startSec,
      endSec: params.endSec,
    }],
  };
  const timeoutSignal = AbortSignal.timeout(REFERENCE_TRIM_TIMEOUT_MS);
  const combined = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;
  const response = await monitoredFetch(`${COMPANION_URL}/api/ffmpeg/cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cutPayload),
    signal: combined,
  }, REFERENCE_TRIM_TIMEOUT_MS);

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `클립 자르기 실패 (HTTP ${response.status})`);
  }

  const payload = await response.json();
  const zipBase64 = typeof payload?.data === 'string' ? payload.data : '';
  if (!zipBase64) {
    throw new Error('클립 자르기 응답이 비어 있습니다.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSZip = ((await import('jszip')) as any).default;
  const zip = await JSZip.loadAsync(decodeBase64ToUint8Array(zipBase64));
  const zipEntries = Object.values(zip.files) as Array<{ dir: boolean; name: string; async: (type: string) => Promise<Blob> }>;
  const clipEntry = zipEntries.find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.mp4'));
  if (!clipEntry) {
    throw new Error('잘린 MP4 파일을 찾을 수 없습니다.');
  }

  const blob = await clipEntry.async('blob');
  return {
    key: buildReferenceClipKey(params.videoId, params.startSec, params.endSec),
    videoId: params.videoId,
    videoTitle: params.videoTitle,
    startSec: params.startSec,
    endSec: params.endSec,
    durationSec: Math.max(0.1, params.endSec - params.startSec),
    fileName: clipEntry.name.split('/').pop() || fileName,
    sourceUrl: `https://www.youtube.com/watch?v=${params.videoId}&t=${Math.max(0, Math.floor(params.startSec))}`,
    blob,
  };
}

/** 쇼츠 모드 컷 길이 규칙 */
export const SHORTS_CUT_RULES = {
  /** 기본 클립 길이 (초) */
  defaultClipSec: 2.5,
  /** 팩트/숫자 구간 (읽을 시간 필요) */
  factClipSec: 3,
  /** 감정 폭발/반전 (빠른 전환) */
  emotionClipSec: 1.5,
  /** 도입부 훅 */
  hookClipSec: 1,
  /** 최소 클립 길이 */
  minClipSec: 1,
  /** 최대 클립 길이 */
  maxClipSec: 4,
} as const;

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

interface VideoSearchOptions {
  shortsMode?: boolean;
  /** ISO 날짜 (예: 2024-01-01) — 이 날짜 이후 영상만 검색 */
  publishedAfter?: string;
  /** ISO 날짜 — 이 날짜 이전 영상만 검색 */
  publishedBefore?: string;
}

async function searchYouTubeVideos(query: string, maxResults = MAX_SEARCH_RESULTS, options?: VideoSearchOptions): Promise<YTSearchItem[]> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) { logger.warn('[VideoRef] YouTube API 키 없음'); return []; }
  if (!trackQuota(100)) { logger.warn('[VideoRef] YouTube 쿼터 초과'); return []; }

  // 쇼츠 모드: 짧은 영상(~4분) 우선 / 일반 모드: 중간 길이(4~20분) 우선
  const duration = options?.shortsMode ? 'short' : 'medium';
  let url = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&relevanceLanguage=en&videoDuration=${duration}&key=${apiKey}`;

  // 날짜 범위 필터
  if (options?.publishedAfter) {
    url += `&publishedAfter=${options.publishedAfter}T00:00:00Z`;
  }
  if (options?.publishedBefore) {
    url += `&publishedBefore=${options.publishedBefore}T23:59:59Z`;
  }

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
    const res = await monitoredFetch(`${COMPANION_URL}/health`, { signal: combined }, 30000);
    if (res.ok) {
      logger.info('[VideoRef] 컴패니언 ✅ 감지');
      return true;
    }
  } catch (e) {
    logger.warn('[VideoRef] 컴패니언 ❌ 미감지', e instanceof Error ? e.message : '');
  }
  return false;
}

// ─── Phase 2: 컴패니언 yt-dlp로 영상 다운로드 (분석용, 480p — 장면 검색/scene detection에는 저해상도 충분) ───
async function downloadVideoForAnalysis(videoId: string, signal?: AbortSignal): Promise<Blob | null> {
  return downloadCompanionVideoBlob(videoId, {
    signal,
    quality: '480p',
    videoOnly: true,
    reason: 'analysis',
  });
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
        const proxyRes = await monitoredFetch(`${COMPANION_URL}/api/google-proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, method: 'GET', headers: {} }),
          signal: AbortSignal.timeout(10000),
        }, 10000);
        if (proxyRes.ok) xml = await proxyRes.text();
      } catch { /* companion unavailable */ }

      if (!xml || xml.length < 50) {
        try {
          const directRes = await monitoredFetch(targetUrl, { signal: AbortSignal.timeout(10000) }, 10000);
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

// ─── Phase 5: 하이브리드 매칭 — 영상 길이에 따라 전략 분기 ───
// 5분 이하: Gemini 영상 직접 분석 (fileUri)
// 5분 초과: Scene Detection 컷 + 자막 텍스트 AI 매칭 (Flash Lite, 빠름)
const GEMINI_VIDEO_MAX_DURATION_SEC = 300; // 5분

async function matchVideoToScene(
  videoId: string,
  sceneText: string,
  cutPoints: SceneCut[],
  cues: TimedCue[],
  videoDurationSec: number,
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  if (!getEvolinkKey()) {
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(Evolink 키 없음)' };
  }

  const limitedCuts = cutPoints.slice(0, 50);
  const hasCuts = limitedCuts.length > 0;

  // ─── 전략 분기 ───
  if (videoDurationSec <= GEMINI_VIDEO_MAX_DURATION_SEC) {
    // 짧은 영상: Gemini 영상 직접 분석
    return matchWithGeminiVideo(videoId, sceneText, limitedCuts, cues, signal);
  } else {
    // 롱폼 영상: 컷 + 자막 텍스트 매칭 (Flash Lite)
    logger.info('[VideoRef] 롱폼 → 컷+자막 하이브리드 매칭', `${Math.round(videoDurationSec)}초, ${limitedCuts.length}컷`);
    return matchWithCutsAndCaptions(sceneText, limitedCuts, cues, videoDurationSec);
  }
}

// ─── 짧은 영상: Gemini 영상 직접 분석 ───
async function matchWithGeminiVideo(
  videoId: string,
  sceneText: string,
  limitedCuts: SceneCut[],
  cues: TimedCue[],
  signal?: AbortSignal,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  const cutList = limitedCuts.map((c, i) => `[${i}] ${c.timeSec.toFixed(1)}s (${formatTime(c.timeSec)})`).join('\n');
  const captionSummary = cues.length > 0 ? `\n\n[자막]\n${cues.map(c => `${formatTime(c.start)}: ${c.text}`).join('\n').slice(0, 1500)}` : '';
  const hasCuts = limitedCuts.length > 0;

  try {
    logger.info('[VideoRef] Gemini 영상 직접 분석 (짧은 영상)', videoId);
    const result = await evolinkVideoAnalysisStream(
      `https://www.youtube.com/watch?v=${videoId}`,
      'video/mp4',
      '영상 편집 전문가. YouTube 영상을 직접 분석하여 대본과 가장 관련된 구간을 찾아줘. JSON만 반환.',
      [
        `[대본] ${sceneText.slice(0, 400)}`,
        hasCuts ? `\n[컷 포인트 ${limitedCuts.length}개]\n${cutList}` : '',
        captionSummary,
        hasCuts
          ? `\n반환: {"startCutIndex": N, "endCutIndex": M, "score": 0~1, "reason": "설명"}`
          : `\n반환: {"startSec": 초, "endSec": 초, "score": 0~1, "reason": "설명"}`,
      ].join('\n'),
      () => {},
      { temperature: 0.1, maxOutputTokens: 500, timeoutMs: 180_000 },
    );
    return parseMatchResult(result, limitedCuts);
  } catch (e) {
    logger.warn('[VideoRef] Gemini 영상 분석 실패 → 컷+자막 폴백', e instanceof Error ? e.message : '');
    return matchWithCutsAndCaptions(sceneText, limitedCuts, cues, 0);
  }
}

// ─── 롱폼 영상: 컷 + 자막 텍스트 AI 매칭 (Flash Lite, 빠름) ───
async function matchWithCutsAndCaptions(
  sceneText: string,
  limitedCuts: SceneCut[],
  cues: TimedCue[],
  videoDurationSec: number,
): Promise<{ startSec: number; endSec: number; matchScore: number; segmentText: string }> {
  // 컷 구간별 자막 텍스트 매핑 — 각 컷 사이 자막을 묶어서 "구간 요약" 생성
  const segments: { idx: number; startSec: number; endSec: number; text: string }[] = [];

  if (limitedCuts.length > 0 && cues.length > 0) {
    for (let i = 0; i < limitedCuts.length; i++) {
      const segStart = limitedCuts[i].timeSec;
      const segEnd = i + 1 < limitedCuts.length ? limitedCuts[i + 1].timeSec : videoDurationSec || segStart + 30;
      const segCues = cues.filter(c => c.start >= segStart && c.start < segEnd);
      const segText = segCues.map(c => c.text).join(' ').slice(0, 120);
      if (segText.length > 5) {
        segments.push({ idx: i, startSec: segStart, endSec: segEnd, text: segText });
      }
    }
  } else if (cues.length > 0) {
    // 컷 없으면 30초 단위 청크
    let chunkStart = cues[0].start;
    let chunkTexts: string[] = [];
    let idx = 0;
    for (const cue of cues) {
      if (cue.start - chunkStart > 30 && chunkTexts.length > 0) {
        segments.push({ idx: idx++, startSec: chunkStart, endSec: cue.start, text: chunkTexts.join(' ').slice(0, 120) });
        chunkStart = cue.start;
        chunkTexts = [];
      }
      chunkTexts.push(cue.text);
    }
    if (chunkTexts.length > 0) {
      const last = cues[cues.length - 1];
      segments.push({ idx: idx, startSec: chunkStart, endSec: last.start + last.dur, text: chunkTexts.join(' ').slice(0, 120) });
    }
  }

  if (segments.length === 0) {
    return { startSec: 0, endSec: 30, matchScore: 0.2, segmentText: '(자막+컷 데이터 없음)' };
  }

  const segList = segments.slice(0, 40).map(s =>
    `[${s.idx}] ${formatTime(s.startSec)}~${formatTime(s.endSec)}: ${s.text}`
  ).join('\n');

  try {
    logger.info('[VideoRef] 컷+자막 하이브리드 매칭', `${segments.length}개 구간`);
    const response = await evolinkChat([
      { role: 'system', content: 'Match script to video segments using captions and cut points. Return ONLY JSON.' },
      { role: 'user', content: [
        `Find the segment most related to the script scene below.`,
        ``,
        `[Script] ${sceneText.slice(0, 400)}`,
        ``,
        `[Video Segments with captions — ${segments.length} segments]`,
        segList,
        ``,
        `Return: {"segmentIndex": N, "score": 0~1, "reason": "explanation"}`,
        `segmentIndex = segment number [N] above. score = relevance 0~1.`,
      ].join('\n') },
    ], {
      temperature: 0.2, maxTokens: 300, timeoutMs: 15000,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
    });

    const raw = response.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(raw);
    if (!parsed) {
      logger.warn('[VideoRef] 하이브리드 매칭 파싱 실패');
      return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(파싱 실패)' };
    }

    const segIdx = Number(parsed.segmentIndex);
    if (!Number.isFinite(segIdx) || segIdx < 0 || segIdx >= segments.length) {
      return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(인덱스 범위 초과)' };
    }

    const matched = segments[Math.floor(segIdx)];
    const score = Math.min(1, Math.max(0, Number(parsed.score) || 0.5));
    const reason = String(parsed.reason || matched.text);

    // Scene Detection 컷에 스냅
    const snappedStart = limitedCuts.length > 0
      ? mergeWithAiTimecodes([matched.startSec], limitedCuts.map(c => ({ timeSec: c.timeSec, score: c.score })))[0]
      : matched.startSec;
    const snappedEnd = limitedCuts.length > 0
      ? mergeWithAiTimecodes([matched.endSec], limitedCuts.map(c => ({ timeSec: c.timeSec, score: c.score })))[0]
      : matched.endSec;

    logger.info('[VideoRef] 하이브리드 매칭 완료',
      `${formatTime(snappedStart)}~${formatTime(snappedEnd)} score=${score.toFixed(2)} "${reason.slice(0, 50)}"`);

    return {
      startSec: Math.floor(snappedStart),
      endSec: Math.floor(Math.max(snappedEnd, snappedStart + 1)),
      matchScore: score,
      segmentText: reason.slice(0, 150),
    };
  } catch (e) {
    logger.warn('[VideoRef] 하이브리드 매칭 실패', e instanceof Error ? e.message : '');
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(매칭 실패)' };
  }
}

// ─── Gemini 응답 파싱 공통 ───
function parseMatchResult(
  result: string,
  limitedCuts: SceneCut[],
): { startSec: number; endSec: number; matchScore: number; segmentText: string } {
  logger.info('[VideoRef] Gemini 응답', (result || '(빈)').replace(/\n/g, '⏎').slice(0, 500));
  const parsed = extractJsonObject(result);
  if (!parsed) {
    logger.warn('[VideoRef] Gemini 응답 파싱 실패');
    return { startSec: 0, endSec: 30, matchScore: 0.3, segmentText: '(파싱 실패)' };
  }

  let rawStart: number;
  let rawEnd: number;
  const hasCuts = limitedCuts.length > 0;

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

  if (!Number.isFinite(rawStart) || rawStart < 0) rawStart = 0;
  if (!Number.isFinite(rawEnd) || rawEnd <= rawStart) rawEnd = rawStart + 30;

  const score = Math.min(1, Math.max(0, Number(parsed.score) || 0.5));
  const reason = String(parsed.reason || '');

  const snappedStart = hasCuts ? mergeWithAiTimecodes([rawStart], limitedCuts)[0] : rawStart;
  const snappedEnd = hasCuts ? mergeWithAiTimecodes([rawEnd], limitedCuts)[0] : rawEnd;

  logger.info('[VideoRef] 매칭 완료',
    `${formatTime(snappedStart)}~${formatTime(snappedEnd)} score=${score.toFixed(2)}`);

  return {
    startSec: Math.floor(snappedStart),
    endSec: Math.floor(Math.max(snappedEnd, snappedStart + 1)),
    matchScore: score,
    segmentText: reason.slice(0, 150),
  };
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

// ─── 맥락 분석 결과 ───
interface SceneContext {
  query: string;
  person?: string;
  event?: string;
  period?: string;
  location?: string;
  emotion?: 'calm' | 'excitement' | 'tension' | 'sadness' | 'humor';
  publishedAfter?: string;
  publishedBefore?: string;
}

// ─── 검색어 생성 (맥락 분석 강화) ───
async function buildVideoSearchQuery(scene: Scene, globalContext?: string, shortsMode?: boolean): Promise<SceneContext> {
  const sceneText = (scene.scriptText || scene.visualDescriptionKO || '').slice(0, 300);

  if (getEvolinkKey() && sceneText.length > 10) {
    try {
      const res = await evolinkChat([
        { role: 'system', content: 'Analyze script context and generate YouTube search keywords. Return ONLY JSON.' },
        { role: 'user', content: [
          `Analyze this script scene and generate search context for finding the most relevant YouTube footage.`,
          ``,
          `[Script (Korean)]`,
          sceneText,
          globalContext ? `\n[Global Context] ${globalContext.slice(0, 100)}` : '',
          ``,
          `Return JSON:`,
          `{`,
          `  "query": "3-6 English keywords (person + event + context)",`,
          `  "person": "main person/entity name (English, optional)",`,
          `  "event": "specific event name (English, optional)",`,
          `  "period": "time period if mentioned (e.g. '2024-03', optional)",`,
          `  "location": "location if relevant (English, optional)",`,
          `  "emotion": "calm|excitement|tension|sadness|humor"`,
          `}`,
          ``,
          `Rules:`,
          `- query: specific enough to find THE actual footage, not generic stock. Include year if mentioned.`,
          `- Example: "손흥민이 2024년 챔스 8강에서 결승골" → {"query":"Son Heung-min Champions League quarter final goal 2024","person":"Son Heung-min","event":"Champions League QF goal","period":"2024","emotion":"excitement"}`,
          shortsMode ? `- For shorts: prefer action words, trending topics, viral moments` : '',
        ].filter(Boolean).join('\n') },
      ], {
        temperature: 0.2, maxTokens: 200, timeoutMs: 10000,
        responseFormat: { type: 'json_object' },
        model: 'gemini-3.1-flash-lite-preview',
      });
      const parsed = extractJsonObject(res.choices?.[0]?.message?.content || '');
      if (parsed?.query && typeof parsed.query === 'string' && parsed.query.length >= 3) {
        const ctx: SceneContext = {
          query: parsed.query as string,
          person: parsed.person as string | undefined,
          event: parsed.event as string | undefined,
          period: parsed.period as string | undefined,
          location: parsed.location as string | undefined,
          emotion: parsed.emotion as SceneContext['emotion'],
        };
        // 시기가 있으면 날짜 범위 설정
        if (ctx.period) {
          const yearMatch = ctx.period.match(/(\d{4})/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            const monthMatch = ctx.period.match(/(\d{4})-(\d{2})/);
            if (monthMatch) {
              ctx.publishedAfter = `${monthMatch[1]}-${monthMatch[2]}-01`;
              const m = parseInt(monthMatch[2]);
              const endMonth = Math.min(m + 2, 12);
              ctx.publishedBefore = `${monthMatch[1]}-${String(endMonth).padStart(2, '0')}-28`;
            } else {
              ctx.publishedAfter = `${year}-01-01`;
              ctx.publishedBefore = `${year}-12-31`;
            }
          }
        }
        return ctx;
      }
    } catch { /* fall through */ }
  }

  // 규칙 기반 폴백
  const parts: string[] = [];
  if (scene.entityName) parts.push(scene.entityName.slice(0, 15));
  if (scene.sceneLocation) parts.push(scene.sceneLocation.slice(0, 15));
  const firstSentence = sceneText.split(/[.!?。！？]/)[0] || '';
  if (firstSentence.length > 5) parts.push(firstSentence.slice(0, 25));
  if (parts.length < 2 && globalContext) parts.push(globalContext.slice(0, 15));
  return { query: parts.join(' ').slice(0, 50) || 'news footage' };
}

// ─── 메인: 장면별 자료영상 검색 (v3 — 맥락 분석 + 쇼츠 모드 + 컴패니언 + Scene Detection + Gemini) ───
export async function searchSceneReferenceVideos(
  scene: Scene,
  globalContext?: string,
  signal?: AbortSignal,
  shortsMode?: boolean,
): Promise<VideoReference[]> {
  const ctx = await buildVideoSearchQuery(scene, globalContext, shortsMode);
  logger.info('[VideoRef] 장면 검색', `query="${ctx.query}" person=${ctx.person || '-'} period=${ctx.period || '-'} emotion=${ctx.emotion || '-'} shorts=${!!shortsMode}`);

  if (signal?.aborted) return [];
  const searchResults = await searchYouTubeVideos(ctx.query, MAX_SEARCH_RESULTS, {
    shortsMode,
    publishedAfter: ctx.publishedAfter,
    publishedBefore: ctx.publishedBefore,
  });
  logger.info('[VideoRef] YouTube 검색 결과', `${searchResults.length}개`);

  // 날짜 필터로 결과 없으면 필터 없이 재시도
  if (searchResults.length === 0 && (ctx.publishedAfter || ctx.publishedBefore)) {
    logger.info('[VideoRef] 날짜 필터 결과 0 → 필터 없이 재검색');
    const retryResults = await searchYouTubeVideos(ctx.query, MAX_SEARCH_RESULTS, { shortsMode });
    if (retryResults.length > 0) {
      searchResults.push(...retryResults);
    }
  }
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

      // Phase 5: 하이브리드 매칭 (짧은 영상=Gemini 직접, 롱폼=컷+자막)
      const videoDur = durations.get(candidate.videoId) || 0;
      const match = await matchVideoToScene(
        candidate.videoId, sceneText, cutPoints, cues, videoDur, signal,
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
          searchQuery: ctx.query,
          publishedAt: candidate.publishedAt,
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
          searchQuery: ctx.query,
          publishedAt: candidate.publishedAt,
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
        searchQuery: ctx.query,
        publishedAt: video.publishedAt,
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
        searchQuery: ctx.query,
        publishedAt: video.publishedAt,
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
  shortsMode?: boolean,
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
      const refs = await searchSceneReferenceVideos(scene, globalContext, signal, shortsMode);
      if (_batchRunId === runId && !signal.aborted) {
        onSceneResult(scene.id, refs);
      }
    }));
  }
}

export async function downloadAndTrimReferenceClip(
  videoId: string,
  startSec: number,
  endSec: number,
  options?: {
    signal?: AbortSignal;
    videoTitle?: string;
    force?: boolean;
  },
): Promise<ReferenceClipDownloadResult> {
  const safeStart = Number.isFinite(startSec) ? Math.max(0, startSec) : 0;
  const safeEnd = Number.isFinite(endSec) ? Math.max(safeStart + 0.1, endSec) : safeStart + 0.1;
  const key = buildReferenceClipKey(videoId, safeStart, safeEnd);

  // 1) 완료된 결과 캐시 확인 (hit 시 recency 갱신)
  if (!options?.force) {
    const cached = referenceClipResultCache.get(key);
    if (cached) {
      referenceClipResultCache.delete(key);
      referenceClipResultCache.set(key, cached);
      return cached;
    }
    // 2) in-flight 중복 방지
    const inflight = referenceClipInflight.get(key);
    if (inflight) return inflight;
  }

  const promise = (async () => {
    const companionUp = await checkCompanion(options?.signal);
    if (!companionUp) {
      throw new Error('레퍼런스 클립 다운로드에는 컴패니언 앱이 필요합니다. 컴패니언을 실행한 뒤 다시 시도해주세요.');
    }

    // 같은 videoId의 원본을 가져오기 — 완료 캐시(LRU 갱신) → in-flight → 새 다운로드
    let sourceBlob = sourceVideoResultCache.get(videoId) || null;
    if (sourceBlob) {
      sourceVideoResultCache.delete(videoId);
      sourceVideoResultCache.set(videoId, sourceBlob);
    }
    if (!sourceBlob) {
      let inflightSource = sourceVideoInflight.get(videoId);
      if (!inflightSource) {
        inflightSource = downloadCompanionVideoBlob(videoId, {
          quality: '1080p',
          videoOnly: true,
          reason: 'reference',
        });
        sourceVideoInflight.set(videoId, inflightSource);
      }
      try {
        sourceBlob = await inflightSource;
      } finally {
        sourceVideoInflight.delete(videoId);
      }
    }
    if (!sourceBlob) {
      throw new Error('원본 YouTube 영상을 내려받지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    pushToSourceCache(videoId, sourceBlob);

    return trimReferenceClipWithCompanion(sourceBlob, {
      videoId,
      startSec: safeStart,
      endSec: safeEnd,
      videoTitle: options?.videoTitle,
      signal: options?.signal,
    });
  })();

  referenceClipInflight.set(key, promise);
  try {
    const result = await promise;
    pushToResultCache(key, result);
    return result;
  } catch (error) {
    // AbortError는 그대로 전파
    throw error;
  } finally {
    referenceClipInflight.delete(key);
  }
}

export async function downloadAllReferenceClips(
  scenes: Scene[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number, item: SceneReferenceClipDownloadResult) => void;
  },
): Promise<SceneReferenceClipDownloadResult[]> {
  const targets = scenes.flatMap((scene) =>
    (scene.videoReferences || []).map((ref, refIndex) => ({ sceneId: scene.id, refIndex, ref })),
  );

  const results: SceneReferenceClipDownloadResult[] = [];
  const failures: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (options?.signal?.aborted) break;
    const target = targets[i];
    try {
      const downloaded = await downloadAndTrimReferenceClip(
        target.ref.videoId,
        target.ref.startSec,
        target.ref.endSec,
        {
          signal: options?.signal,
          videoTitle: target.ref.videoTitle,
        },
      );
      const item: SceneReferenceClipDownloadResult = {
        ...downloaded,
        sceneId: target.sceneId,
        refIndex: target.refIndex,
        ref: target.ref,
      };
      results.push(item);
      options?.onProgress?.(results.length, targets.length, item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      logger.warn('[VideoRef] 개별 클립 다운로드 실패', `${target.ref.videoId} ${msg}`);
      failures.push(`${target.ref.videoTitle || target.ref.videoId}: ${msg}`);
    }
  }
  if (results.length === 0 && failures.length > 0) {
    throw new Error(`모든 레퍼런스 클립 다운로드 실패:\n${failures.slice(0, 5).join('\n')}`);
  }
  if (failures.length > 0) {
    logger.warn('[VideoRef] 일부 클립 실패', `성공 ${results.length}/${targets.length}, 실패: ${failures.length}`);
  }
  return results;
}

/** 편집 가이드 시트 생성 — 장면별 소스 클립 + 타임코드 텍스트 목록 */
export function generateEditGuideSheet(scenes: Scene[]): string {
  const lines: string[] = [
    '# 편집 가이드 시트',
    `# 생성: ${new Date().toLocaleString('ko-KR')}`,
    `# 총 장면: ${scenes.length}개`,
    '',
    '─'.repeat(60),
    '',
  ];

  scenes.forEach((scene, i) => {
    const refs = scene.videoReferences || [];
    lines.push(`## 장면 ${i + 1}`);
    lines.push(`대본: ${(scene.scriptText || '').slice(0, 80)}`);
    if (scene.audioDuration) {
      lines.push(`TTS 길이: ${scene.audioDuration.toFixed(1)}초`);
    }
    if (refs.length > 0) {
      refs.forEach((ref, j) => {
        lines.push(`  클립 ${j + 1}: [${ref.videoTitle}]`);
        lines.push(`    URL: https://www.youtube.com/watch?v=${ref.videoId}&t=${ref.startSec}`);
        lines.push(`    구간: ${formatTime(ref.startSec)} ~ ${formatTime(ref.endSec)} (${ref.endSec - ref.startSec}초)`);
        lines.push(`    채널: ${ref.channelTitle}`);
        lines.push(`    관련도: ${Math.round(ref.matchScore * 100)}%`);
        if (ref.segmentText) lines.push(`    내용: ${ref.segmentText}`);
      });
    } else {
      lines.push('  (소스 클립 미지정)');
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function cancelVideoReferenceSearch() {
  _batchRunId++;
  _batchAbortCtrl?.abort();
  _batchAbortCtrl = null;
}

/**
 * [#preset3] 레퍼런스 클립 준비 실패 메시지가 컴패니언 호환성 이슈인지 판별.
 * nleExportService에서 장면 미디어 누락 처리 시 구체적인 컴패니언 업데이트 안내를 띄우기 위해 사용.
 */
export function isReferenceClipCompatibilityErrorMessage(message: string): boolean {
  if (!message) return false;
  return /\/api\/ffmpeg\/cut|컴패니언\s*v?1\.3\.0\s*이상|레퍼런스 클립 잘라내기/i.test(message);
}
