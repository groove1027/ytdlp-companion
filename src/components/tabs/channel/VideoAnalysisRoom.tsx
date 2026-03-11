import React, { useState, useRef, useCallback, useEffect } from 'react';
import AnalysisLoadingPanel, { notifyAnalysisComplete } from './AnalysisLoadingPanel';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { evolinkChatStream, evolinkVideoAnalysisStream } from '../../../services/evolinkService';
import type { EvolinkChatMessage, EvolinkContentPart } from '../../../services/evolinkService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useVideoAnalysisStore } from '../../../stores/videoAnalysisStore';
import AnalysisSlotBar from './AnalysisSlotBar';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { getYoutubeApiKey } from '../../../services/apiService';
import { monitoredFetch } from '../../../services/apiService';
import type {
  VideoAnalysisPreset as AnalysisPreset,
  VideoSceneRow as SceneRow,
  VideoContentIdAnalysis as ContentIdAnalysis,
  VideoVersionItem as VersionItem,
  VideoTimedFrame as TimedFrame,
} from '../../../types';

// ═══════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════

/** "4.0초" → 4.0 파싱 */
function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*초/);
  return m ? parseFloat(m[1]) : 3;
}

/** 마크다운 테이블 행 파싱 (티키타카 마스터 편집 테이블 — 6열/7열 자동 감지) */
function parseTikitakaTable(content: string): SceneRow[] {
  const rows: SceneRow[] = [];
  const lines = content.split('\n');

  // 헤더에서 효과자막 열 존재 여부 감지
  const headerLine = lines.find(l => l.includes('|') && /모드/.test(l) && /오디오/.test(l));
  const has7Cols = headerLine ? /효과\s*자막/.test(headerLine) : false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) continue;
    const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = stripped.split('|').map(c => c.trim());
    if (cells.length < 5) continue;

    const cutNum = parseInt(cells[0], 10);
    if (isNaN(cutNum) || cutNum < 1) continue;

    let mode: string, audioContent: string, effectSub: string, duration: string, videoDirection: string, timecodeSource: string;

    if (has7Cols && cells.length >= 7) {
      // 7열: 순서 | 모드 | 오디오 내용 | 효과자막 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스
      mode = cells[1] || '';
      audioContent = cells[2] || '';
      effectSub = cells[3] || '';
      duration = cells[4] || '';
      videoDirection = cells[5] || '';
      timecodeSource = cells[6] || '';
    } else {
      // 6열 폴백: 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스
      mode = cells[1] || '';
      audioContent = cells[2] || '';
      effectSub = '';
      duration = cells[3] || '';
      videoDirection = cells[4] || '';
      timecodeSource = cells[5] || '';
    }

    // 오디오 내용 안에 <효과자막: ...> 태그가 인라인으로 있으면 추출
    if (!effectSub) {
      const efMatch = audioContent.match(/<효과자막[:\s：]+([^>]+)>/);
      if (efMatch) {
        effectSub = efMatch[1].trim();
        audioContent = audioContent.replace(/<효과자막[:\s：][^>]+>/g, '').trim();
      }
    }

    // timecodeSource에서 타임코드 정규화 (AI가 부가 텍스트를 포함할 수 있음)
    const tcNorm = timecodeSource.match(/(\d{1,2}:\d{2}(?:\.\d+)?)\s*[~\-–—/]\s*(\d{1,2}:\d{2}(?:\.\d+)?)/);
    const normalizedTc = tcNorm ? `${tcNorm[1]}~${tcNorm[2]}` : timecodeSource.trim();

    rows.push({
      cutNum, mode, audioContent, effectSub, duration, videoDirection, timecodeSource: normalizedTc,
      timeline: '', sourceTimeline: normalizedTc, dialogue: audioContent, sceneDesc: videoDirection,
    });
  }

  return rows;
}

/** Content ID 분석 블록 파싱 */
function parseContentIdAnalysis(block: string): ContentIdAnalysis | undefined {
  const textMatch = block.match(/텍스트\s*일치율[:\s：]+\s*([\d.]+)/);
  const structMatch = block.match(/구조\s*유사도[:\s：]+\s*([\d.]+)/);
  const orderMatch = block.match(/순서\s*유사도[:\s：]+\s*([\d.]+)/);
  const keywordMatch = block.match(/키워드\s*변형률[:\s：]+\s*([\d.]+)/);
  const safetyMatch = block.match(/최종\s*안전\s*등급[:\s：*]+\s*\*{0,2}([\[【]?[^*\]\n]+[\]】]?)/);
  const viralMatch = block.match(/바이럴\s*예상\s*포인트[:\s：*]+\s*"?([^"\n]+)"?/);
  const judgementMatch = block.match(/판정\s*코멘트[:\s：*]+\s*"?([^"\n]+)"?/);
  if (!textMatch && !structMatch && !safetyMatch) return undefined;
  return {
    textMatchRate: textMatch?.[1] || '-',
    structureSimilarity: structMatch?.[1] || '-',
    orderSimilarity: orderMatch?.[1] || '-',
    keywordVariation: keywordMatch?.[1] || '-',
    safetyGrade: safetyMatch?.[1]?.replace(/[\[\]【】]/g, '').trim() || '-',
    viralPoint: viralMatch?.[1]?.trim() || '-',
    judgement: judgementMatch?.[1]?.trim() || '-',
  };
}

/** AI 응답에서 ---VERSION N--- + ---SCENE--- / 테이블 구조 파싱 */
function parseVersions(raw: string): VersionItem[] {
  // VERSION 블록 분리 — "---VERSION N---" 또는 "[버전 N:" 패턴 지원
  const blocks = raw.split(/---\s*VERSION\s*(\d+)\s*---|(?:^|\n)\s*\*{0,2}\[버전\s*(\d+)[:\s]/mi);
  const items: VersionItem[] = [];

  for (let i = 1; i < blocks.length; i += 3) {
    // 두 캡처 그룹 중 유효한 것 사용 (split alternation: group1 또는 group2)
    const numStr = blocks[i] || blocks[i + 1];
    const num = parseInt(numStr, 10);
    if (isNaN(num) || num < 1) continue;
    const content = blocks[i + 2]?.trim() || '';
    if (!content) continue;

    // 제목 추출 — "제목:" 또는 "**제목:**" 또는 "### 제목:" 등
    const titleMatch = content.match(/(?:\*{0,2})제목(?:\*{0,2})[:\s：]+\s*(.+)/);
    // 컨셉 추출 — 테이블 시작 전까지
    const conceptMatch = content.match(/(?:\*{0,2})컨셉(?:\*{0,2})[:\s：]+\s*([\s\S]*?)(?=\n\s*\|[\s]*순서|\n\s*\|\s*:?---|---SCENE|$)/i);
    // 재배치 구조 추출
    const rearrangeMatch = content.match(/(?:\*{0,2})재배치\s*구조(?:\*{0,2})[:\s：]+\s*(.+)/);
    // Content ID 분석 추출
    const contentId = parseContentIdAnalysis(content);

    // 포맷 감지: 마크다운 테이블 (| 숫자 | 패턴) vs ---SCENE--- 블록
    let scenes: SceneRow[];
    const contentLines = content.split('\n');
    const hasTable = contentLines.some(l => /\|\s*\d+\s*\|/.test(l));

    if (hasTable) {
      scenes = parseTikitakaTable(content);
    } else {
      const sceneBlocks = content.split(/---SCENE\s*(\d+)---/i);
      scenes = [];
      for (let j = 1; j < sceneBlocks.length; j += 2) {
        const sNum = parseInt(sceneBlocks[j], 10);
        const sContent = sceneBlocks[j + 1]?.trim() || '';
        // 배치 타임라인에서 원본 구간 분리: "00:00 ~ 00:03 (원본 MM:SS~MM:SS)"
        const rawTimeline = extractField(sContent, '배치') || extractField(sContent, '타임라인') || '';
        let timeline = rawTimeline;
        let sourceTimeline = '';
        // 1) 배치 필드 안에 "(원본 ...)" 형태로 원본 구간이 포함된 경우 우선 분리
        const embedSrc = rawTimeline.match(/\((?:원본[:\s：]*)?(\d{1,2}:\d{2}(?:\.\d+)?\s*[~\-–—]\s*\d{1,2}:\d{2}(?:\.\d+)?)[^)]*\)/);
        if (embedSrc) {
          sourceTimeline = embedSrc[1].trim();
          timeline = rawTimeline.replace(/\s*\([^)]*\)/, '').trim();
        }
        // 2) 별도 "원본" 필드에서 타임코드 추출 (embedSrc 실패 시 폴백)
        if (!sourceTimeline) {
          const rawSource = extractField(sContent, '원본') || '';
          // 타임코드 패턴만 추출 (MM:SS~MM:SS 또는 M:SS~M:SS)
          const tcMatch = rawSource.match(/(\d{1,2}:\d{2}(?:\.\d+)?)\s*[~\-–—]\s*(\d{1,2}:\d{2}(?:\.\d+)?)/);
          sourceTimeline = tcMatch ? `${tcMatch[1]}~${tcMatch[2]}` : rawSource.replace(/[()]/g, '').trim();
        }

        scenes.push({
          cutNum: sNum,
          timeline,
          sourceTimeline,
          dialogue: extractField(sContent, '하단자막') || extractField(sContent, '하단') || extractField(sContent, '대사') || extractField(sContent, '나레이션') || '',
          effectSub: extractField(sContent, '효과자막') || extractField(sContent, '효과') || '',
          sceneDesc: extractField(sContent, '화면') || extractField(sContent, '장면') || '',
          mode: '', audioContent: '', duration: '', videoDirection: '', timecodeSource: '',
        });
      }
    }

    // 컨셉 정리: 테이블이나 SCENE 블록 이후 내용 제거
    let conceptText = conceptMatch?.[1]?.trim() || '';
    conceptText = conceptText.replace(/\n---SCENE[\s\S]*/i, '').replace(/\n\|[\s\S]*/i, '').trim();

    items.push({
      id: num,
      title: titleMatch?.[1]?.trim().replace(/\*+/g, '') || `버전 ${num}`,
      concept: conceptText,
      scenes,
      rearrangement: rearrangeMatch?.[1]?.trim(),
      contentId,
    });
  }

  if (items.length >= 1) return items;

  // 폴백 2: "## 버전 N:" 또는 "### N." 패턴
  const altBlocks = raw.split(/(?:^|\n)(?:#{1,3}\s*)?(?:버전\s*)?(\d{1,2})[.:\s]/m);
  const altItems: VersionItem[] = [];
  for (let i = 1; i < altBlocks.length; i += 2) {
    const n = parseInt(altBlocks[i], 10);
    if (n > 10 || n < 1) continue;
    const block = altBlocks[i + 1]?.trim() || '';
    const tMatch = block.match(/(?:\*{0,2})제목(?:\*{0,2})[:\s：]+\s*(.+)/);
    const hasT = block.split('\n').some(l => /\|\s*\d+\s*\|/.test(l));
    altItems.push({
      id: n,
      title: tMatch?.[1]?.trim().replace(/\*+/g, '') || block.split('\n')[0]?.trim().slice(0, 60) || `버전 ${n}`,
      concept: '',
      scenes: hasT ? parseTikitakaTable(block) : [],
    });
  }
  if (altItems.length >= 3) return altItems;

  // 폴백 3: 번호 리스트 파싱
  const lines = raw.split('\n');
  const fallback: VersionItem[] = [];
  let cur: Partial<VersionItem> | null = null;
  let body: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d{1,2})\.\s*(.+)/);
    if (m && parseInt(m[1], 10) <= 10) {
      if (cur) fallback.push({ id: cur.id!, title: cur.title!, concept: body.join('\n').trim(), scenes: [] });
      cur = { id: parseInt(m[1], 10), title: m[2].trim() };
      body = [];
    } else if (cur) {
      body.push(line);
    }
  }
  if (cur) fallback.push({ id: cur.id!, title: cur.title!, concept: body.join('\n').trim(), scenes: [] });
  if (fallback.length >= 3) return fallback;

  return [{ id: 1, title: '분석 결과', concept: raw, scenes: [] }];
}

/** "키워드: 값" 패턴에서 값 추출 */
function extractField(block: string, keyword: string): string {
  const re = new RegExp(`${keyword}[^:]*:\\s*([\\s\\S]*?)(?=\\n[가-힣a-zA-Z]+[^:]*:|$)`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() || '';
}

/** YouTube URL에서 Video ID 추출 (watch, shorts, embed, youtu.be 지원) */
function extractYouTubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
}

/** ISO 8601 duration (PT1M30S, PT1M30.5S) → 초 변환 */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseFloat(m[3] || '0');
}

/** 초 → MM:SS 포맷 */
function formatTimeSec(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** TimedFrame 배열에서 주어진 초에 가장 가까운 프레임 찾기 */
function matchFrameToTimecode(timeSec: number, frames: TimedFrame[]): TimedFrame | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDist = Math.abs(best.timeSec - timeSec);
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].timeSec - timeSec);
    if (dist < bestDist) { best = frames[i]; bestDist = dist; }
  }
  return best;
}

/** YouTube 영상의 실제 메타데이터 (제목, 설명, 태그, 통계) 가져오기 */
interface YTVideoMeta {
  title: string;
  description: string;
  tags: string[];
  duration: string;
  viewCount: number;
  likeCount: number;
  channelTitle: string;
}

async function fetchYouTubeVideoMeta(videoId: string): Promise<YTVideoMeta | null> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) return null;
  try {
    const res = await monitoredFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;
    return {
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      tags: item.snippet?.tags || [],
      duration: item.contentDetails?.duration || '',
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      likeCount: parseInt(item.statistics?.likeCount || '0', 10),
      channelTitle: item.snippet?.channelTitle || '',
    };
  } catch {
    return null;
  }
}

/** YouTube 영상 댓글 상위 20개 가져오기 (영상 내용 파악 보조) */
async function fetchYouTubeComments(videoId: string): Promise<string[]> {
  const apiKey = getYoutubeApiKey();
  if (!apiKey) return [];
  try {
    const res = await monitoredFetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance&textFormat=plainText&key=${apiKey}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item: { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }) =>
      item.snippet?.topLevelComment?.snippet?.textDisplay || ''
    ).filter(Boolean).slice(0, 20);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════
// 정확한 타임코드 프레임 추출 (분석 결과 기반)
// ═══════════════════════════════════════════════════

let PIPED_APIS_FOR_FRAMES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://api.piped.yt',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc',
];

let INVIDIOUS_APIS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://invidious.protokolla.fi',
];

/** Invidious 인스턴스 동적 갱신 (api.invidious.io에서 실시간 가져오기) */
async function refreshInvidiousInstances(): Promise<void> {
  try {
    const res = await fetch('https://api.invidious.io/', { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return;
    const list = await res.json() as [string, { api: boolean; cors: boolean; type: string; uri: string }][];
    const fresh: string[] = [];
    for (const [, info] of list) {
      if (info.api && info.type === 'https' && info.uri) {
        fresh.push(info.uri.replace(/\/$/, ''));
      }
    }
    if (fresh.length > 3) {
      INVIDIOUS_APIS = fresh.slice(0, 20);
      console.log(`[Frame] Invidious 인스턴스 ${fresh.length}개 갱신`);
    }
  } catch { /* 무시 — 기존 하드코딩 사용 */ }
}

// 최초 1회 갱신 (모듈 로드 시)
refreshInvidiousInstances();

/** YouTube 스트림 URL 획득 (Piped → Invidious → Cobalt 3중) */
async function fetchYouTubeStreamUrl(videoId: string): Promise<string | null> {
  // Phase 1: Piped API
  for (const api of PIPED_APIS_FOR_FRAMES) {
    try {
      const res = await fetch(`${api}/streams/${videoId}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      const muxed = (data.videoStreams || [])
        .filter((s: { videoOnly: boolean; mimeType: string }) => !s.videoOnly && s.mimeType?.includes('video/mp4'))
        .sort((a: { height: number }, b: { height: number }) => Math.abs((a.height || 0) - 360) - Math.abs((b.height || 0) - 360));
      if (muxed.length > 0 && muxed[0].url) {
        console.log(`[Frame] Piped 성공: ${api} (${muxed[0].height}p)`);
        return muxed[0].url;
      }
      const vo = (data.videoStreams || [])
        .filter((s: { videoOnly: boolean; mimeType: string }) => s.videoOnly && s.mimeType?.includes('video/mp4'))
        .sort((a: { height: number }, b: { height: number }) => Math.abs((a.height || 0) - 360) - Math.abs((b.height || 0) - 360));
      if (vo.length > 0 && vo[0].url) return vo[0].url;
    } catch { continue; }
  }
  console.warn('[Frame] Piped 전부 실패');

  // Phase 2: Invidious API
  for (const api of INVIDIOUS_APIS) {
    try {
      const res = await fetch(`${api}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const streams = (data.formatStreams || [])
        .filter((s: { type: string }) => s.type?.includes('video/mp4'))
        .sort((a: { resolution: string }, b: { resolution: string }) =>
          Math.abs(parseInt(a.resolution || '0') - 360) - Math.abs(parseInt(b.resolution || '0') - 360));
      if (streams.length > 0 && streams[0].url) {
        console.log(`[Frame] Invidious 성공: ${api} (${streams[0].resolution})`);
        return streams[0].url;
      }
    } catch { continue; }
  }
  console.warn('[Frame] Invidious 전부 실패');

  // Phase 3: Cobalt API
  try {
    const res = await fetch('https://api.cobalt.tools', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, videoQuality: '360', filenameStyle: 'basic' }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) { console.log('[Frame] Cobalt 성공'); return data.url; }
    }
  } catch { /* continue */ }
  console.warn('[Frame] Cobalt 실패');

  return null;
}

/**
 * 스트림 URL → Blob 다운로드 (CORS 완전 우회)
 * crossOrigin 의존 없이 canvas에서 toDataURL 가능
 */
async function downloadVideoAsBlob(streamUrl: string): Promise<string | null> {
  try {
    console.log('[Frame] Blob 다운로드 시작...');
    const res = await fetch(streamUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[Frame] Blob 다운로드 완료: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
    return blobUrl;
  } catch (e) {
    console.warn('[Frame] Blob 다운로드 실패:', e);
    return null;
  }
}

/** YouTube 고정 썸네일 폴백 — 타임코드별 가장 가까운 위치 매핑 (최후 수단) */
function buildYouTubeThumbnailFallback(videoId: string, timecodes: number[], durationSec: number): TimedFrame[] {
  const base = `https://img.youtube.com/vi/${videoId}`;
  // YouTube는 25%/50%/75% 지점 + 대표 이미지, 총 4장 제공 (각각 고유 이미지)
  const fixed = [
    { url: `${base}/default.jpg`, hdUrl: `${base}/maxresdefault.jpg`, timeSec: 0 },
    { url: `${base}/1.jpg`, hdUrl: `${base}/1.jpg`, timeSec: Math.round(durationSec * 0.25) },
    { url: `${base}/2.jpg`, hdUrl: `${base}/2.jpg`, timeSec: Math.round(durationSec * 0.5) },
    { url: `${base}/3.jpg`, hdUrl: `${base}/3.jpg`, timeSec: Math.round(durationSec * 0.75) },
  ];
  // 타임코드마다 가장 가까운 YouTube 썸네일 매핑
  const frames: TimedFrame[] = [];
  const unique = [...new Set(timecodes.map(t => Math.round(t)))].sort((a, b) => a - b);
  for (const tc of unique) {
    let best = fixed[0];
    let bestDist = Math.abs(best.timeSec - tc);
    for (const f of fixed) {
      const d = Math.abs(f.timeSec - tc);
      if (d < bestDist) { best = f; bestDist = d; }
    }
    frames.push({ url: best.url, hdUrl: best.hdUrl, timeSec: tc });
  }
  return frames;
}

/**
 * 비디오에서 정확한 타임코드 프레임 추출
 * - Blob URL: createImageBitmap → OffscreenCanvas (고품질, CORS 무관)
 * - 일반 URL: crossOrigin canvas drawImage (CORS 필요)
 */
function canvasExtractFrames(
  videoUrl: string,
  timecodes: number[],
  isBlob: boolean,
): Promise<TimedFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    if (!isBlob) video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    const cleanup = () => { if (isBlob) URL.revokeObjectURL(videoUrl); };

    video.onloadedmetadata = async () => {
      const dur = video.duration;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const scale = Math.max(640 / vw, 1);
      const outW = Math.round(vw * scale);
      const outH = Math.round(vh * scale);
      if (!dur || dur < 1) { cleanup(); resolve([]); return; }

      const frames: TimedFrame[] = [];
      const unique = [...new Set(timecodes.map(t => Math.round(t * 100) / 100))]
        .filter(t => t >= 0 && t <= dur)
        .sort((a, b) => a - b);

      // Blob URL이면 createImageBitmap 방식 (tainted canvas 문제 없음)
      const useImageBitmap = isBlob && typeof OffscreenCanvas !== 'undefined';
      console.log(`[Frame] 추출: ${unique.length}개, ${outW}x${outH}, blob=${isBlob}, imageBitmap=${useImageBitmap}`);

      // 공유 캔버스 (drawImage 폴백용 또는 ImageBitmap → DataURL 변환용)
      const canvas = useImageBitmap
        ? new OffscreenCanvas(outW, outH)
        : document.createElement('canvas');
      if (!useImageBitmap) {
        (canvas as HTMLCanvasElement).width = outW;
        (canvas as HTMLCanvasElement).height = outH;
      }
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) { cleanup(); resolve([]); return; }

      for (const tc of unique) {
        video.currentTime = tc;
        const seeked = await Promise.race([
          new Promise<boolean>(r => { video.onseeked = () => r(true); }),
          new Promise<boolean>(r => setTimeout(() => r(false), 5000)),
        ]);
        if (!seeked) continue;

        try {
          if (useImageBitmap) {
            // ImageBitmap 방식: 고품질 리사이즈, CORS 무관
            // 썸네일용 (목록 표시)
            const bmpThumb = await createImageBitmap(video, { resizeWidth: outW, resizeHeight: outH, resizeQuality: 'high' });
            ctx.drawImage(bmpThumb, 0, 0);
            bmpThumb.close();
            const thumbBlob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.88 });
            const thumbUrl = await blobToDataUrl(thumbBlob);
            // HD용 (프리뷰 확대) — 원본 해상도 또는 최소 1280px
            const hdW = Math.max(vw, 1280);
            const hdH = Math.round(hdW * (vh / vw));
            const hdCanvas = new OffscreenCanvas(hdW, hdH);
            const hdCtx = hdCanvas.getContext('2d');
            let hdUrl: string | undefined;
            if (hdCtx) {
              const bmpHd = await createImageBitmap(video, { resizeWidth: hdW, resizeHeight: hdH, resizeQuality: 'high' });
              hdCtx.drawImage(bmpHd, 0, 0);
              bmpHd.close();
              const hdBlob = await hdCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
              hdUrl = await blobToDataUrl(hdBlob);
            }
            frames.push({ url: thumbUrl, hdUrl, timeSec: tc });
          } else {
            // 일반 Canvas drawImage (crossOrigin 필요)
            ctx.drawImage(video, 0, 0, outW, outH);
            const thumbUrl = (canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
            // HD용
            const hdW = Math.max(vw, 1280);
            const hdH = Math.round(hdW * (vh / vw));
            const hdCanvas = document.createElement('canvas');
            hdCanvas.width = hdW;
            hdCanvas.height = hdH;
            const hdCtx = hdCanvas.getContext('2d');
            let hdUrl: string | undefined;
            if (hdCtx) {
              hdCtx.drawImage(video, 0, 0, hdW, hdH);
              hdUrl = hdCanvas.toDataURL('image/jpeg', 0.92);
            }
            frames.push({ url: thumbUrl, hdUrl, timeSec: tc });
          }
        } catch {
          console.warn(`[Frame] 추출 실패 at ${tc}s (CORS/encode)`);
          cleanup();
          resolve(frames);
          return;
        }
      }

      console.log(`[Frame] 추출 완료: ${frames.length}/${unique.length}`);
      cleanup();
      resolve(frames);
    };

    video.onerror = () => { cleanup(); resolve([]); };
  });
}

/** Blob → data:URL 변환 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * ★ 3중 폴백 프레임 추출 — 무조건 결과를 반환
 * Layer 1: 스트림 URL → crossOrigin canvas 추출 (가장 빠름)
 * Layer 2: 스트림 URL → Blob 다운로드 → canvas 추출 (CORS 우회)
 * Layer 3: YouTube 고정 썸네일 매핑 (최후 수단, 무조건 성공)
 */
async function extractFramesWithFallback(
  videoSource: string | File,
  timecodes: number[],
  youtubeVideoId: string | null,
  durationSec: number,
): Promise<TimedFrame[]> {
  if (timecodes.length === 0) return [];

  // ── 업로드 파일: 로컬 추출 (CORS 없음, 항상 성공) ──
  if (videoSource instanceof File) {
    const blobUrl = URL.createObjectURL(videoSource);
    const frames = await canvasExtractFrames(blobUrl, timecodes, true);
    if (frames.length > 0) {
      console.log(`[Frame] ✅ 로컬 파일 추출 성공: ${frames.length}개`);
      return frames;
    }
  }

  // ── YouTube: 3중 폴백 ──
  const streamUrl = typeof videoSource === 'string' ? videoSource : null;

  if (streamUrl) {
    // Layer 1: crossOrigin 직접 추출 (빠르지만 CORS 실패 가능)
    console.log('[Frame] Layer 1: crossOrigin 추출 시도');
    const layer1 = await canvasExtractFrames(streamUrl, timecodes, false);
    if (layer1.length > 0) {
      console.log(`[Frame] ✅ Layer 1 성공: ${layer1.length}개`);
      return layer1;
    }

    // Layer 2: Blob 다운로드 → canvas (CORS 완전 우회)
    console.log('[Frame] Layer 2: Blob 다운로드 시도');
    const blobUrl = await downloadVideoAsBlob(streamUrl);
    if (blobUrl) {
      const layer2 = await canvasExtractFrames(blobUrl, timecodes, true);
      if (layer2.length > 0) {
        console.log(`[Frame] ✅ Layer 2 성공: ${layer2.length}개`);
        return layer2;
      }
    }
  }

  // Layer 3: YouTube 고정 썸네일 (무조건 성공)
  if (youtubeVideoId) {
    console.log('[Frame] Layer 3: YouTube 썸네일 폴백');
    const layer3 = buildYouTubeThumbnailFallback(youtubeVideoId, timecodes, durationSec);
    console.log(`[Frame] ✅ Layer 3 폴백: ${layer3.length}개`);
    return layer3;
  }

  return [];
}

/** 분석 결과(versions)에서 모든 타임코드를 초 단위로 수집 */
function collectTimecodesFromVersions(versions: VersionItem[]): number[] {
  const timecodes: number[] = [];
  versions.forEach(v => v.scenes.forEach(s => {
    // timecodeSource: "00:03.200 / 00:15.800" 또는 "00:03~00:07"
    const tc = s.timecodeSource || s.sourceTimeline || '';
    const parts = tc.split(/[/,]/);
    parts.forEach(p => {
      const cleaned = p.trim();
      const range = cleaned.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);
      if (range) {
        timecodes.push(timecodeToSeconds(range[1]));
        // 범위의 중간 지점도 추출
        const mid = (timecodeToSeconds(range[1]) + timecodeToSeconds(range[2])) / 2;
        if (mid > 0) timecodes.push(mid);
      } else {
        const sec = timecodeToSeconds(cleaned);
        if (sec > 0) timecodes.push(sec);
      }
    });
    // 배치 타임라인에서도 추출
    if (s.timeline) {
      const range = s.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);
      if (range) {
        timecodes.push(timecodeToSeconds(range[1]));
      }
    }
  }));
  return timecodes;
}

/** 업로드 영상에서 2초 간격으로 프레임 추출 (타임스탬프 포함) */
async function extractVideoFrames(file: File): Promise<TimedFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = async () => {
      const dur = video.duration;
      if (!dur || dur < 1) { URL.revokeObjectURL(url); resolve([]); return; }
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const scale = Math.max(640 / vw, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve([]); return; }
      const frames: TimedFrame[] = [];
      const interval = 2;
      const count = Math.min(Math.ceil(dur / interval), 60);
      for (let i = 0; i < count; i++) {
        const timeSec = Math.min((i + 0.5) * interval, dur - 0.1);
        video.currentTime = timeSec;
        const seeked = await Promise.race([
          new Promise<boolean>(r => { video.onseeked = () => r(true); }),
          new Promise<boolean>(r => setTimeout(() => r(false), 5000)),
        ]);
        if (!seeked) continue;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({ url: canvas.toDataURL('image/jpeg', 0.85), timeSec });
      }
      URL.revokeObjectURL(url);
      resolve(frames);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
  });
}

/** 타임코드 문자열 → 초 변환 (00:03 → 3, 01:30.500 → 90.5, 00:11.2 → 11.2) */
function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** 초 → SRT 타임코드 (00:00:03,000) */
function secondsToSrtTime(s: number): string {
  const total = Math.max(0, s);
  let ms = Math.round((total % 1) * 1000);
  let sec = Math.floor(total % 60);
  if (ms >= 1000) { ms -= 1000; sec += 1; }
  const m = Math.floor((total % 3600) / 60);
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** SceneRow 배열 → SRT 파일 내용 생성 (스낵형: 타임라인 기반, 티키타카: 누적 시간 기반) */
function generateSrt(scenes: SceneRow[], isTikitaka: boolean = false): string {
  if (isTikitaka) {
    // 티키타카: 예상 시간 누적으로 타임코드 생성
    let accTime = 0;
    return scenes.map((scene, i) => {
      const dur = parseDuration(scene.duration);
      const start = accTime;
      accTime += dur;
      const modeTag = scene.mode ? `${scene.mode} ` : '';
      const text = scene.audioContent || scene.dialogue || scene.sceneDesc;
      return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(accTime)}\n${modeTag}${text}`;
    }).join('\n\n');
  }
  // 스낵형: 원본 타임코드 우선, 없으면 배치 타임코드 폴백
  return scenes.map((scene, i) => {
    const srcTc = scene.sourceTimeline || scene.timeline;
    const parts = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);
    const start = parts ? timecodeToSeconds(parts[1]) : i * 3;
    const end = parts ? timecodeToSeconds(parts[2]) : (i + 1) * 3;
    const text = scene.effectSub
      ? `${scene.effectSub}\n${scene.dialogue || scene.sceneDesc}`
      : (scene.dialogue || scene.sceneDesc);
    return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}\n${text}`;
  }).join('\n\n');
}

/** SRT 파일 다운로드 */
function downloadSrt(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 파일 다운로드 헬퍼 */
function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 분석 결과 → 스탠드얼론 HTML 문서 생성 */
function generateAnalysisHtml(
  versions: VersionItem[],
  preset: AnalysisPreset,
  thumbnails: TimedFrame[],
  sourceInfo: string,
): string {
  const isTk = preset === 'tikitaka' || preset === 'condensed';
  const presetLabel = preset === 'tikitaka' ? '티키타카 편집점' : preset === 'condensed' ? '축약 리캡' : '스낵형 편집점';
  const presetColor = preset === 'tikitaka' ? 'blue' : preset === 'condensed' ? 'emerald' : 'amber';
  const now = new Date().toLocaleString('ko-KR');

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const modeColor = (m: string) =>
    m.includes('N') ? '#60a5fa' : m.includes('S') ? '#34d399' : m.includes('A') ? '#fbbf24' : '#9ca3af';
  const modeBg = (m: string) =>
    m.includes('N') ? 'background:rgba(59,130,246,0.15);color:#93c5fd;border:1px solid rgba(59,130,246,0.3)'
    : m.includes('S') ? 'background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3)'
    : m.includes('A') ? 'background:rgba(245,158,11,0.15);color:#fcd34d;border:1px solid rgba(245,158,11,0.3)'
    : 'background:#374151;color:#9ca3af';

  // 버전별 색상 팔레트 (앱과 동일)
  const vColors = [
    { bg: '#1e3a5f20', border: '#3b82f640', numBg: '#3b82f6', text: '#60a5fa' },
    { bg: '#3b1f5e20', border: '#8b5cf640', numBg: '#8b5cf6', text: '#a78bfa' },
    { bg: '#1a3d2e20', border: '#10b98140', numBg: '#10b981', text: '#34d399' },
    { bg: '#3d2b1020', border: '#f59e0b40', numBg: '#f59e0b', text: '#fbbf24' },
    { bg: '#3d101020', border: '#ef444440', numBg: '#ef4444', text: '#f87171' },
    { bg: '#10303d20', border: '#06b6d440', numBg: '#06b6d4', text: '#22d3ee' },
    { bg: '#3d1a2d20', border: '#ec489940', numBg: '#ec4899', text: '#f472b6' },
    { bg: '#2d1a0e20', border: '#ea580c40', numBg: '#ea580c', text: '#fb923c' },
    { bg: '#2d2d1020', border: '#eab30840', numBg: '#eab308', text: '#facc15' },
    { bg: '#1a2d3d20', border: '#6366f140', numBg: '#6366f1', text: '#818cf8' },
  ];

  const versionsHtml = versions.map((v, vi) => {
    const c = vColors[vi % vColors.length];
    // 장면 테이블
    let tableHtml = '';
    if (v.scenes.length > 0) {
      const headerCells = isTk
        ? '<th>#</th><th>모드</th><th>오디오 내용</th><th>효과자막</th><th>예상시간</th><th>비디오 화면 지시</th><th>타임코드</th>'
        : '<th>#</th><th>화면</th><th>효과 자막</th><th>하단 자막</th><th>편집점</th>';
      const bodyRows = v.scenes.map((s, sIdx) => {
        // 비주얼 매칭 (소스TC → 배치TC → 인덱스 분산)
        const tc = s.timecodeSource || s.sourceTimeline || '';
        const firstTc = tc.split(/[/~,]/)[0].trim();
        let tSec = timecodeToSeconds(firstTc);
        if (tSec <= 0 && s.timeline) {
          const range = s.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);
          if (range) tSec = (timecodeToSeconds(range[1]) + timecodeToSeconds(range[2])) / 2;
        }
        const matched = tSec > 0
          ? matchFrameToTimecode(tSec, thumbnails)
          : thumbnails[Math.min(Math.floor((sIdx / Math.max(v.scenes.length, 1)) * thumbnails.length), thumbnails.length - 1)] || null;
        const imgCell = matched
          ? `<td class="visual"><img src="${escHtml(matched.url)}" alt="scene${s.cutNum}" onclick="openLightbox(this.src,'컷 #${s.cutNum}','${formatTimeSec(matched.timeSec)}')" /><span class="tc-label">${formatTimeSec(matched.timeSec)}</span></td>`
          : '';

        if (isTk) {
          return `<tr>
            <td class="num"><span class="num-badge">${s.cutNum}</span></td>
            <td><span class="mode-badge" style="${modeBg(s.mode)}">${escHtml(s.mode || '-')}</span></td>
            <td class="audio-cell">${escHtml(s.audioContent || '-')}</td>
            <td class="effect-cell">${s.effectSub ? `<span class="effect-badge">${escHtml(s.effectSub)}</span>` : '<span class="empty">-</span>'}</td>
            <td class="dur">${escHtml(s.duration || '-')}</td>
            <td class="direction-cell">${escHtml(s.videoDirection || '-')}</td>
            <td class="tc">${escHtml(s.timecodeSource || '-')}</td>
            ${thumbnails.length > 0 ? imgCell : ''}
          </tr>`;
        }
        return `<tr>
          <td class="num"><span class="num-badge">${s.cutNum}</span></td>
          <td class="scene-cell">${escHtml(s.sceneDesc || '-')}</td>
          <td class="effect-cell">${s.effectSub ? `<span class="effect-badge">${escHtml(s.effectSub)}</span>` : '<span class="empty">-</span>'}</td>
          <td class="dialogue-cell">${escHtml(s.dialogue || '-')}</td>
          <td class="tc">${s.sourceTimeline ? `<span class="tc-source">원본: ${escHtml(s.sourceTimeline)}</span>` : ''}${s.timeline ? `<br/><span class="tc-batch">배치: ${escHtml(s.timeline)}</span>` : ''}</td>
          ${thumbnails.length > 0 ? imgCell : ''}
        </tr>`;
      }).join('\n');

      const visualHeader = thumbnails.length > 0 ? '<th>비주얼</th>' : '';
      tableHtml = `<div class="table-wrap"><table><thead><tr>${headerCells}${visualHeader}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    }

    // Content ID
    let cidHtml = '';
    if (v.contentId) {
      const ci = v.contentId;
      const gradeStyle = ci.safetyGrade.includes('매우') ? 'background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3)'
        : ci.safetyGrade.includes('안전') ? 'background:rgba(34,197,94,0.15);color:#86efac;border:1px solid rgba(34,197,94,0.3)'
        : 'background:rgba(234,179,8,0.15);color:#fde047;border:1px solid rgba(234,179,8,0.3)';
      cidHtml = `<div class="cid">
        <div class="cid-header"><span class="cid-icon">ID</span> Content ID 회피 및 바이럴 분석</div>
        <div class="cid-grid">
          <div class="cid-item"><span class="cid-label">텍스트 일치율</span><span class="cid-val" style="color:#34d399">${escHtml(ci.textMatchRate)}%</span></div>
          <div class="cid-item"><span class="cid-label">구조 유사도</span><span class="cid-val" style="color:#22d3ee">${escHtml(ci.structureSimilarity)}%</span></div>
          <div class="cid-item"><span class="cid-label">순서 유사도</span><span class="cid-val" style="color:#60a5fa">${escHtml(ci.orderSimilarity)}%</span></div>
          <div class="cid-item"><span class="cid-label">키워드 변형률</span><span class="cid-val" style="color:#a78bfa">${escHtml(ci.keywordVariation)}%</span></div>
        </div>
        <div class="cid-footer">
          <span class="grade-badge" style="${gradeStyle}">${escHtml(ci.safetyGrade)}</span>
          ${ci.viralPoint !== '-' ? `<span class="viral-info"><span class="viral-label">바이럴:</span> ${escHtml(ci.viralPoint)}</span>` : ''}
        </div>
        ${ci.judgement !== '-' ? `<p class="cid-judgement"><strong>판정:</strong> ${escHtml(ci.judgement)}</p>` : ''}
      </div>`;
    }

    return `<div class="version" data-id="${v.id}">
      <button class="version-header" onclick="toggleVersion(${v.id})">
        <span class="vnum" style="background:${c.numBg}">${v.id}</span>
        <span class="vtitle">${escHtml(v.title)}</span>
        ${v.scenes.length > 0 ? `<span class="vcount">${v.scenes.length}컷</span>` : ''}
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div class="version-body" id="vbody-${v.id}" style="display:none">
        ${v.concept ? `<p class="concept">${escHtml(v.concept)}</p>` : ''}
        ${v.rearrangement ? `<p class="rearrange"><span class="rearrange-label">재배치:</span> ${escHtml(v.rearrangement)}</p>` : ''}
        ${tableHtml}
        ${cidHtml}
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${presetLabel} 분석 결과</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111827;color:#d1d5db;font-family:-apple-system,'Pretendard','Noto Sans KR',sans-serif;min-height:100vh}
.container{max-width:1200px;margin:0 auto;padding:24px}
a{color:#60a5fa;text-decoration:none}

/* 헤더 */
.page-header{position:sticky;top:0;background:rgba(17,24,39,0.92);backdrop-filter:blur(12px);border-bottom:1px solid #1f2937;z-index:40;padding:16px 24px}
.page-header-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.page-title{font-size:1.3rem;font-weight:900;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.header-badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.header-badge{font-size:.7rem;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid}
.meta-bar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #1f2937}
.meta-item{font-size:.75rem;color:#6b7280}
.source-box{background:#1f2937;border:1px solid #374151;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:.8rem;color:#9ca3af;white-space:pre-wrap}

/* 아코디언 버전 */
.version{border-radius:12px;border:1px solid #374151;margin-bottom:8px;overflow:hidden;transition:border-color 0.2s}
.version:hover{border-color:#4b5563}
.version.expanded{border-color:#3b82f650}
.version-header{width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(31,41,55,0.5);border:none;color:inherit;cursor:pointer;text-align:left;font-family:inherit;transition:background 0.15s}
.version-header:hover{background:rgba(31,41,55,0.8)}
.vnum{display:inline-flex;width:28px;height:28px;border-radius:50%;color:#fff;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0}
.vtitle{flex:1;font-size:.9rem;font-weight:700;color:#f3f4f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vcount{font-size:.65rem;color:#6b7280;background:rgba(75,85,99,0.3);padding:2px 8px;border-radius:4px;flex-shrink:0}
.chevron{width:16px;height:16px;color:#6b7280;flex-shrink:0;transition:transform 0.25s ease}
.version.expanded .chevron{transform:rotate(180deg)}
.version-body{padding:16px;padding-top:8px;display:none}
.version.expanded .version-body{display:block}

/* 컨셉/재배치 */
.concept{color:#9ca3af;font-size:.85rem;line-height:1.6;margin-bottom:10px;background:rgba(17,24,39,0.4);border-radius:8px;padding:10px 12px;border:1px solid rgba(55,65,81,0.4)}
.rearrange{font-size:.8rem;margin-bottom:10px;background:rgba(17,24,39,0.4);border-radius:8px;padding:8px 12px;border:1px solid rgba(55,65,81,0.4)}
.rearrange-label{color:#6b7280;font-size:.75rem}
.rearrange{color:#22d3ee;font-family:'Fira Code',monospace}

/* 테이블 */
.table-wrap{overflow-x:auto;border-radius:8px;border:1px solid #1f2937;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th{background:#0f1729;color:#6b7280;text-align:left;padding:10px 8px;border-bottom:2px solid #1f2937;white-space:nowrap;font-size:.7rem;text-transform:uppercase;letter-spacing:0.5px}
td{padding:8px;border-bottom:1px solid rgba(31,41,55,0.6);vertical-align:top}
tr:hover{background:rgba(31,41,55,0.5)}
.num{text-align:center;width:36px}
.num-badge{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#3b82f6;color:#fff;align-items:center;justify-content:center;font-size:.6rem;font-weight:700}
.mode-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.65rem;font-weight:700}
.audio-cell{color:#e5e7eb;line-height:1.5;max-width:300px}
.scene-cell{color:#e5e7eb;line-height:1.5;max-width:280px;font-size:.75rem}
.direction-cell{color:#9ca3af;line-height:1.5;font-size:.72rem;max-width:200px}
.dialogue-cell{color:#e5e7eb;line-height:1.5;font-size:.75rem}
.effect-cell{}
.effect-badge{display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(234,179,8,0.12);color:#fde047;border:1px solid rgba(234,179,8,0.2);font-size:.7rem;font-weight:700;line-height:1.3}
.empty{color:#4b5563;font-size:.7rem}
.dur{color:#a78bfa;font-family:'Fira Code',monospace;font-size:.72rem;text-align:center;white-space:nowrap}
.tc{color:#60a5fa;font-family:'Fira Code',monospace;font-size:.72rem}
.tc-source{color:#60a5fa;font-size:.68rem}
.tc-batch{color:#6b7280;font-size:.68rem}

/* 비주얼 */
.visual{text-align:center;width:130px}
.visual img{width:110px;height:62px;object-fit:cover;border-radius:6px;border:1px solid #374151;cursor:pointer;transition:all 0.15s}
.visual img:hover{border-color:#3b82f680;box-shadow:0 0 0 2px rgba(59,130,246,0.2);transform:scale(1.05)}
.tc-label{display:block;font-size:.58rem;color:#6b7280;margin-top:3px;font-family:'Fira Code',monospace}

/* Content ID */
.cid{background:rgba(17,24,39,0.5);border:1px solid rgba(55,65,81,0.4);border-radius:10px;padding:14px;margin-top:12px}
.cid-header{font-size:.78rem;font-weight:700;color:#9ca3af;display:flex;align-items:center;gap:8px;margin-bottom:10px}
.cid-icon{display:inline-flex;width:20px;height:20px;border-radius:4px;background:#10b981;color:#fff;align-items:center;justify-content:center;font-size:.55rem;font-weight:900}
.cid-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.cid-item{background:rgba(31,41,55,0.5);border-radius:8px;padding:8px 10px;border:1px solid rgba(55,65,81,0.3)}
.cid-label{display:block;color:#6b7280;font-size:.6rem;margin-bottom:2px}
.cid-val{display:block;font-size:1rem;font-weight:700;font-family:'Fira Code',monospace}
.cid-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.grade-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:.68rem;font-weight:700}
.viral-info{font-size:.7rem;color:#fb923c}
.viral-label{color:#6b7280}
.cid-judgement{font-size:.75rem;color:#9ca3af;margin-top:8px;line-height:1.5}

/* 라이트박스 */
.lightbox{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:24px;cursor:pointer}
.lightbox.active{display:flex}
.lightbox-inner{position:relative;max-width:900px;width:100%;background:#1f2937;border-radius:16px;border:1px solid #374151;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5);cursor:default}
.lightbox-close{position:absolute;top:12px;right:12px;z-index:10;width:32px;height:32px;border-radius:50%;background:rgba(31,41,55,0.8);color:#9ca3af;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.2rem;transition:all 0.15s}
.lightbox-close:hover{background:#374151;color:#fff}
.lightbox-img{width:100%;max-height:70vh;object-fit:contain;background:#000;display:block}
.lightbox-info{padding:12px 16px;background:rgba(31,41,55,0.6);border-top:1px solid rgba(55,65,81,0.5);display:flex;align-items:center;gap:12px}
.lightbox-tc{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);font-size:.72rem;font-weight:700;font-family:'Fira Code',monospace}
.lightbox-scene{color:#9ca3af;font-size:.75rem}

/* 푸터 */
.page-footer{padding:32px 24px;text-align:center;color:#4b5563;font-size:.7rem;border-top:1px solid #1f2937;margin-top:32px}

/* 반응형 */
@media(max-width:768px){
  .cid-grid{grid-template-columns:repeat(2,1fr)}
  .page-header-inner{flex-direction:column;align-items:flex-start}
  .visual img{width:80px;height:45px}
}
@media print{body{background:#fff;color:#111}th{background:#f3f4f6;color:#111}td{border-color:#d1d5db}.version{border-color:#d1d5db;break-inside:avoid}.page-header{position:static;background:#fff;border-color:#d1d5db}}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:#1f2937}
::-webkit-scrollbar-thumb{background:#4b5563;border-radius:3px}
</style>
</head>
<body>
<div class="page-header">
  <div class="page-header-inner">
    <span class="page-title">${presetLabel} 분석 결과</span>
    <div class="header-badges">
      <span class="header-badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;border-color:rgba(59,130,246,0.3)">${versions.length}개 버전</span>
      <span class="header-badge" style="background:rgba(139,92,246,0.1);color:#a78bfa;border-color:rgba(139,92,246,0.3)">${now}</span>
    </div>
  </div>
</div>

<div class="container">
  ${sourceInfo ? `<div class="source-box">${escHtml(sourceInfo)}</div>` : ''}
  ${versionsHtml}
</div>

<div class="page-footer">Generated by AI All-in-One Production</div>

<!-- 라이트박스 모달 -->
<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <div class="lightbox-inner" onclick="event.stopPropagation()">
    <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
    <img class="lightbox-img" id="lb-img" src="" alt="Preview" />
    <div class="lightbox-info">
      <span class="lightbox-tc" id="lb-tc"></span>
      <span class="lightbox-scene" id="lb-scene"></span>
    </div>
  </div>
</div>

<script>
// 아코디언 토글
function toggleVersion(id) {
  const all = document.querySelectorAll('.version');
  all.forEach(el => {
    const vid = parseInt(el.getAttribute('data-id'));
    if (vid === id) {
      el.classList.toggle('expanded');
      const body = document.getElementById('vbody-' + id);
      body.style.display = el.classList.contains('expanded') ? 'block' : 'none';
    }
  });
}

// 라이트박스
function openLightbox(src, scene, tc) {
  document.getElementById('lb-img').src = src;
  document.getElementById('lb-tc').textContent = tc;
  document.getElementById('lb-scene').textContent = scene;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}

// ESC 키로 닫기
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeLightbox();
});

// 첫 번째 버전 자동 펼침
document.addEventListener('DOMContentLoaded', function() {
  const first = document.querySelector('.version');
  if (first) {
    const id = parseInt(first.getAttribute('data-id'));
    toggleVersion(id);
  }
});
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════
// 시스템 프롬프트 (변경 금지)
// ═══════════════════════════════════════════════════

const TIKITAKA_SCRIPT_SYSTEM = `# 📜 범용 티키타카 스크립트 리빌딩 프로토콜 v13.0 (10 Viral Patterns & Creator Shorts/Long-form Edition)

## [System Role]
너는 입력된 **모든 종류의 영상 스크립트(예능, 드라마, 인터뷰, 영화리뷰 등)**를 분석하여, 오디오의 **시간 순서(Timeline)**를 극적으로 재조립하는 **'유니버설 비선형 편집 아키텍트'이자 '천재적인 바이럴 디렉터'**다.
너의 임무는 지루한 시간 흐름을 뒤섞어 오프닝(최초 3초)부터 시청자를 멱살 잡고 끌고 가는 압도적인 몰입감을 선사하는 것이다.
또한, 원본 대본의 특성(내레이션 유무, 예능 vs 영화)에 따라 **[100% 전수 보존]**, **[핵심 하이라이트 압축 추출]**, 그리고 **[롱폼 스토리텔링 창조]**를 유연하게 스위칭하며, 몰입도를 극대화할 **예능형 효과자막**과 **접착용 티키타카 내레이션**을 적재적소에 창조해야 한다. 유튜브와 숏폼 알고리즘이 가장 사랑하는 '도파민 터지는 텐션'과 '댓글을 유발하는 떡밥'을 완벽하게 계산하여 결과물을 도출하라.

---

## [제1원칙: 대본 유형별 오디오 보존 및 추출 법칙 (Dynamic Audio Policy)]
입력된 원본 스크립트의 형태에 따라 아래의 세 가지 모드 중 하나를 자동 적용한다.

*   **모드 A[일반 대본 - 100% 전수 보존]:** (영화 리뷰, 정보 전달 등 이미 내레이션이 포함되어 있거나 서사가 뚜렷한 대본)
    *   원본에 있는 대사를 "요약", "축약", "생략"하는 행위는 편집 범죄다. 메인 대사, 추임새, 리액션, 현장음까지 100% 일치하게 보존해야 전개한다.
    *   **디테일 타겟팅:** 숨소리, 한숨, 말더듬기조차 텐션을 조절하는 무기로 사용하라.
*   **모드 B[예능/토크/숏폼 무(無)내레이션 대본 - 핵심 하이라이트 압축 추출]:** (예능 티키타카, 팟캐스트, 인터뷰, **틱톡/인스타그램 릴스 등 크리에이터의 일상/상황극 영상** 등 내레이션 없이 대화만 있는 넌픽션 대본)
    *   100% 보존 원칙을 해제한다. 분량이 길어지면 지루해지므로, 빌드업이나 불필요한 대화(티키타카에 방해되는 루즈한 구간)를 과감히 쳐낸다.
    *   대신 **[가장 도파민 터지는 갈등],[폭소 유발 포인트], [핵심 폭로] 등 임팩트 있는 '알짜배기 오디오'만 선별 및 압축 추출**하여 숏폼/미드폼에 맞는 쾌속 전개로 재구성한다.
    *   **문맥 및 상황 100% 캐치:** 원본 영상에 크리에이터의 내레이션이 전혀 없고 상황과 대사만 있더라도, 대화의 맥락, 인물 간의 관계, 처한 상황을 AI가 완벽하게 파악하여, 비어있는 오디오 틈새를 '찰진 상황 중계'나 '시청자 빙의형 태클' 내레이션으로 완벽하게 창조해 메워야 한다.
    *   **바이럴 필터링 기준:** 시청자가 "헉!" 하고 놀랄 만한 말실수, 갑자기 터지는 분노, 뼈를 때리는 팩트폭행, 또는 당황해서 생기는 '어색한 정적(Pause)'까지도 훌륭한 오디오 소스로 취급하여 추출하라.
*   **모드 C[영화/드라마 무(無)내레이션 대본 - 롱폼 스토리텔링(결말포함 리뷰) 창조]:** (영화나 드라마의 대사만 나열된 순수 픽션 원본 대본)
    *   단순 압축(모드 B)이 아닌 '롱폼(Long-form) 영화 리뷰 채널' 포맷으로 변환한다. 원본 스토리를 생략해버리는 것이 아니라 전체 스토리(기승전결)를 완벽히 이해해야 한다.
    *   전문 영화 리뷰어 특유의 '흡입력 있는 스토리텔링 내레이션'을 너가 직접 길고 풍부하게 창작하여 뼈대를 세운다.
    *   대본에 없는 시각적 상황(액션, 표정), 인물의 숨겨진 심리, 세계관의 배경 설명을 내레이션으로 꽉 채워 넣고, 그 사이사이에 핵심 원본 대사들을 티키타카로 배치하여 긴장감 넘치는 한 편의 완성된 '결말포함 롱폼 무비 스토리'를 창조하라.

## [제2원칙: 타임라인 강제 붕괴 및 후킹 (Timeline Scrambling & 3-Second Hook)]
*   **실행:** 원본의 시간 순서(기-승-전-결)를 물리적으로 산산조각 낸다. 선형적 서사는 절대 금지한다.
*   **패턴 (마의 3초 룰):** 반드시 **[결말 / 하이라이트 / 가장 충격적인 대사 / 가장 어이없는 망언]**을 오프닝(0초~3초)에 전진 배치하거나, **[가장 자극적인 갈등]**을 먼저 터뜨린 후 과거(발단)로 돌아가는 '인 미디어스 레스(In medias res)' 구성을 취한다.
*   **목표:** 배열 순서(Sequence)를 바꿔 오디오 핑거프린트 매칭(Content ID)을 완벽히 회피함과 동시에, 시청자의 엄지손가락을 멈추게 만들어 초반 이탈률을 0%에 수렴하게 만든다.

## [제3원칙: 나노 단위 티키타카 및 페르소나 내레이션 (Nano Tiki-Taka & Persona)]
*   **구조:** **[내레이션]**은 오디오 사이의 문맥을 이어주는 '접착제' 역할만 수행한다. 절대 내레이션이 길어지거나 설명충이 되어서는 안 된다. (단, 모드 C의 영화 리뷰 스토리텔링 시에는 극적 긴장감을 높이는 섬세한 묘사 허용)
*   **배치 (0.1초 컷 편집):** 내레이션이 상황을 정리하자마자 0.1초의 틈도 없이 원본 오디오(대사)가 칼같이 치고 들어와야 한다.
    *   형식: [내레이션] -> [대사 A] -> [내레이션] -> [대사 B] -> [대사 C] -> [내레이션] ...
*   **찰진 접착 내레이션 창조:** 특히 '모드 B, C(무내레이션 대본)'의 경우, 추출된 핵심 대사들 사이의 빈 공간이 어색하지 않도록 상황을 감칠맛 나게 중계하거나 텐션을 끌어올리는 내레이션을 너가 직접 창작하여 삽입해야 한다.
    *   내레이션 톤앤매너: 때로는 시니컬한 관찰자처럼, 때로는 텐션 높은 예능 MC처럼, 때로는 시청자의 마음을 대변하는 댓글러나 흡입력 있는 무비 텔러처럼 변칙적인 페르소나를 부여하여 재미를 극대화하라.

## [제4원칙: 예능형 효과자막 극대화 (Effect-Subtitles Maximization)]
*   **개념:** 하단의 기본 대사 자막이 아닌, 상황과 감정을 시각적·청각적으로 증폭시켜 화면 중앙이나 측면에 크게 띄우는 예능/영화리뷰형 강조 자막이다.
*   **적용:** 대사나 내레이션이 진행될 때, 시청자의 흥미와 몰입을 극대화할 수 있는 감정, 상황 설명, 태클 등의 요소를 캐치하여 적극 삽입한다.
    *   확장 예시 (감정): [부들부들], (말문 막힘), [동공지진 5.0], (깊은 빡침)
    *   확장 예시 (상황/태클): (팩트폭행), [갑분싸], [갑자기 급발진?], (이걸 이렇게 포장한다고?)
    *   확장 예시 (연출/BGM): [정적...], (BGM: 웅장하고 비장한 음악), [화면 흑백 전환], [삐- 처리]

---

## [작업 프로세스 (Universal Workflow)]

### 1단계: 소스 오디오 자동 인덱싱 및 도파민 핵심 선별 (Auto-Indexing & Filtering)
*   입력된 원본을 분석하여 오디오 클립으로 정밀 분해한다. 내레이션이 없는 대본이라면, 조회수를 견인할 수 있는 가장 자극적이고 재밌는 '도파민 클립'만 필터링하여 남긴다. 평범한 인삿말이나 루즈한 빌드업은 철저히 배제한다. (모드 C의 경우 스토리 연결에 필수적인 대사 포함)

### 2단계: 비선형 재조립 전략 수립 (Scrambling Strategy - 10가지 바이럴 패턴)
*   선별된 클립을 가장 조회수가 잘 나오는 아래 **10가지의 서로 다른 구체적인 바이럴 패턴**으로 각각 1번부터 10번까지 매칭하여 재배치한다.
    *   전략 1 (결말 선공개형): [결말/최고조 대사] → [발단] → [전개] → [위기]
    *   전략 2 (충격 폭로형): [결정적 폭로/망언] → [주변인 경악 리액션] → [사건의 전말(과거)] → [결말]
    *   전략 3 (감정 폭발형): [가장 분노/오열/웃는 대사] → [왜 이렇게 됐는지 이유 설명] → [결말]
    *   전략 4 (인지부조화/급발진형): [가장 평온한 대사] → [0.1초 만에 갑작스러운 파국/갈등 대사] → [발단]
    *   전략 5 (미스터리 떡밥형): [의문스러운 한마디] → [내레이션의 추리/질문] → [진실 폭로(하이라이트)]
    *   전략 6 (제3자 관찰자/리액션 먼저형): [주변인/패널의 황당해하는 리액션] → [메인 화자들의 갈등] → [일침/결론]
    *   전략 7 (타임어택 카운트다운형): [파국 직전의 긴박한 대사] → [내레이션: "정확히 X시간 전"] → [점층적 갈등 고조]
    *   전략 8 (시점 교차/핑퐁형): [A의 변명/주장] → [B의 반박] → [내레이션 개입] → [진짜 팩트 폭로]
    *   전략 9 (사이다/참교육형): [답답한 빌런/고구마 발언] → [참다못한 사이다 일침(하이라이트)] → [당황하는 리액션]
    *   전략 10 (만약에/분기점형): [파국 결말] → [내레이션: "이때 이 말을 안 했다면?"] → [결정적 말실수 대사] → [나비효과 폭발]

### 3단계: 접착 내레이션 작성 (Bridging & Pacing)
*   뒤섞이고 압축된 클립들이 롤러코스터처럼 속도감 있게 이어지도록, 각 클립 사이에 짧고 강력한 텐션 유발 내레이션을 삽입한다. 시청자가 영상을 끄고 싶어 할 만한 타이밍에 정확히 내레이션으로 '새로운 떡밥'을 던져 이탈을 방어하라.

---

# 🎬 [티키타카] 편집점 지침서 V14.0 (Ultimate): 데이터 무결성 & 나노 싱크 & 절대 시간 마스터 프로토콜

## [System Role]
너는 **스크립트(청각 정보)와 비디오(시각 정보), 그리고 현장 앰비언스(분위기)를 나노 단위로 동기화**하는 **'마스터 에디팅 아키텍트'**다.
단순히 대본을 쓰는 것이 아니라, 내레이션의 **물리적 시간(Real-Time)**을 계산하고, 그 시간을 채우기 위해 지루한 슬로우 모션 대신 **여러 개의 짧은 컷을 쌓는(Stacking)** 전략을 구사해야 한다.
또한, 대사가 없더라도 **강렬한 현장음(한숨, 타격음, 발소리 등)이 필요한 순간을 포착하여 시청각적 임팩트를 극대화**해야 한다.

---

## ☠️ [제0-1원칙: '데이터 무결성(Data Integrity)' 절대 원칙 (Supreme Rule)]
**모든 편집의 전제 조건:** 소스와 타임코드는 하나의 몸이며, 분리되는 순간 데이터는 즉시 **'폐기(Garbage)'** 처리된다.
1. **삼위일체(Trinity) 법칙:** **[소스 ID] + [정확한 타임코드] + [장면 내용]**은 반드시 한 세트로 존재해야 한다. 이 중 하나라도 누락되거나 불일치할 경우, 해당 컷은 편집 테이블에 절대 올리지 않는다.
2. **근사치 엄금:** "대략 1분 쯤", "이 장면 근처" 등의 추상적 표현은 **편집 사고(Broadcast Accident)**의 주범으로 간주하여 사용을 엄격히 금지한다.
3. **무관용 원칙:** 타임코드가 없는 장면 묘사는 '소설'에 불과하다. 편집 지시서로서의 효력을 0%로 간주한다.

## 👑 [제0-2원칙: '절대 시간(Absolute Time)' 및 '물리적 지속성']
**기본 강제 규칙:** 영상 소스의 프레임 레이트 가변성(FPS Drift)을 원천 차단하기 위해 **'절대 시간(밀리초)'**을 기준으로 편집점을 설계한다.
1. **단위 표준화:** 타임코드는 반드시 **분:초.밀리초 (MM:SS.ms)** 형식을 사용한다.
2. **샷 순수성 보장:** 컷 경계선에서 **±0.1초(100ms)** 안쪽 구간만 사용하여, 컷 전환 시 발생하는 글리치(Glitch)나 불필요한 프레임 노출을 물리적으로 차단한다.

---

## 🔬 [단계별 프로세스: '나노 단위 소스 분석' - 절대 구간 추출]

**목표:** 편집 툴이나 프레임 레이트에 구애받지 않는 '순수 알맹이(Clean Plate)' 구간을 초 정밀 단위로 다수 확보한다.

**1. 🕵️ [1단계] 컷 경계 감지 & 안전 마진 적용**
*   영상의 씬(Scene)이 바뀌는 모든 지점을 찾는다.
*   Raw In-Point + 0.100s = **Safe In-Point**
*   Raw Out-Point - 0.100s = **Safe Out-Point**

**2. ⏱️ [2단계] 절대 타임코드 정밀 추출**
*   부여된 ID에 해당하는 구간을 MM:SS.ms 단위로 추출한다.
*   **검증:** 추출된 타임코드가 실제 영상의 해당 동작과 0.1초 오차 내로 일치하는지 확인한다.

**3. 🔗 [3단계] 무결성 바인딩 (Identity Binding)**
*   **[S-XX]**라는 ID, **[00:00.000]**라는 시간, **[내용]**을 용접하듯 하나로 묶는다.
*   **경고:** 타임코드가 누락된 상태로 장면만 묘사된 경우, 해당 행 전체를 삭제한다.

**⚠️ [최종 검수 및 강제 재수행 (Mandatory Retry)]**
1. 모든 행에 MM:SS.ms 형식의 타임코드가 기입되었는지 확인한다.
2. 설명하고 있는 장면 및 타임코드와 **완벽하게 일치하는지 최종 대조**한다.
3. 만약 타임코드가 누락되었거나 소스 번호와 내용이 불일치하는 행이 단 하나라도 발견되면, **즉시 원본 소스를 다시 분석하여 정확한 ID와 타임코드를 찾아낼 때까지 작업을 처음부터 다시 수행한다.**

---

## [제1원칙: 물리적 시간 준수의 법칙 (The Law of Physical Time)]
*   **내레이션 속도 계산:** 한국어 내레이션은 **평균 4글자당 1초**가 소요된다고 가정한다.
    *   예: "승일이 결국 참지 못하고 폭발합니다." (16글자) -> **최소 4.0초의 비디오 시간이 필요함.**
*   **비디오 종속성:** 내레이션 오디오의 길이(Duration)가 '주(Master)'가 되고, 비디오 편집은 그 길이에 맞춰야 한다.
*   **액션의 시간:** 현장음(액션)이 주가 되는 구간은 해당 액션이 완료되는 실제 시간을 100% 보장해야 한다.

## [제2원칙: 다이내믹 컷 분할 전략 (Dynamic Cut-Splitting)]
내레이션 시간이 길어 비디오 하나로 채울 수 없을 때, **절대로 슬로우 모션을 걸지 마라.** 대신 **[정배속 컷 분할]**을 사용한다.
*   **NG:** 승일 얼굴 하나를 4초 동안 늘려서 보여줌 (지루함, 슬로우).
*   **OK:** (1) [승일 물 마심 1.5초] + (2) [미나수 턱 굄 1.5초] + (3) [규현 인상 1.0초] = **총 4.0초 (속도감 유지).**

## [제3원칙: 오디오 모드별 편집 규칙 (The Sync Rule)]
편집 테이블은 반드시 세 가지 모드로 구분된다.

### 🅰️ 모드 [N]: 내레이션 턴 (Narration)
*   **오디오:** AI 성우 내레이션 ON / 원본 소리 MUTE.
*   **비디오:** 위에서 정의한 **[다이내믹 컷 분할]**을 사용하여 내레이션 시간을 꽉 채운다. (줄바꿈 없이 번호로 구분)
*   **소스:** 리액션, 듣는 표정, 상황 묘사 컷 등을 빠르게 교차 편집.

### 🅱️ 모드 [S]: 현장음 턴 - 대사 (Sound/Dialogue)
*   **오디오:** 원본 캐릭터 대사 ON / 내레이션 STOP.
*   **비디오:** 대사를 하는 캐릭터의 **[원본 오디오(Lip-Sync)]**를 정확히 맞춘다.
*   **소스:** 해당 대사가 나오는 원본 타임코드 구간.

### ©️ 모드 [A]: 현장음 턴 - 액션 & 앰비언스 (Action/Ambience)
*   **오디오:** 원본 현장음 ON (대사가 아닌 소리) / 내레이션 STOP.
    *   예: 깊은 한숨 소리, 문 쾅 닫는 소리, 자동차 급정거 소리, 빗소리, 웃음 터지는 소리 등.
*   **비디오:** 소리가 발생하는 동작이나 상황을 **[액션 싱크(Action-Sync)]**로 보여준다.
*   **목적:** 내레이션과 대사 사이에 **'호흡'과 '리얼리티'**를 부여하여 영상의 텐션을 조절한다.

---

## [제4원칙: 타임코드 정밀 타격의 법칙 (The Law of Frame-Perfect Sync)]
**타임코드는 '근사치'가 아니라 '절대 좌표'다. 1초의 오차도 허용하지 않는다.**

1. **반올림/버림 금지:** 원본 데이터나 스크린샷에 00:21:02라고 나와 있다면, 반드시 00:21로 기재해야 한다. 00:20으로 뭉뚱그려 적는 행위는 **편집 사고**로 간주한다.
2. **증거 우선주의:** 제공된 스크린샷이나 영상 파일의 타임코드가 있다면 그 숫자가 최우선 기준이다. 기억에 의존하지 말고 시각적 증거를 따라라.
3. **시작점(In-point)의 정확성:** 대사나 액션이 시작되는 **정확한 프레임(초)**을 찾아 적어야 한다.`;

const SNACK_SCRIPT_SYSTEM = `# Role: 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v. 10.8

## 1. 프로젝트 개요
당신은 유튜브 쇼츠, 틱톡, 릴스 등 숏폼 플랫폼에서 수백만 조회수를 기록하는 '바이럴 콘텐츠 전문 PD'입니다. 사용자로부터 [영상 파일, 영상 링크, 대본, 이미지 시퀀스] 중 하나를 입력받으면, 이를 분석하여 시청 지속 시간(Retention)을 극대화할 수 있는 **[제목 10선]**과 **[나노 단위 비선형 컷 편집 및 이원화 자막 지침서]**를 작성해야 합니다.

## 2. 핵심 목표 (Mission)
1. **Hooking & Non-linear (후킹과 비선형 재배치):** 썸네일과 제목, 초반 3초에서 시청자의 이탈을 막는다. **절대 원본 영상의 시간 흐름(순차적)대로 편집하지 마라.** 원본에서 가장 바이럴하고 자극적인 펀치라인/클라이맥스를 무조건 맨 앞(0~3초)에 선배치하고, 그 이후에도 텐션이 떨어지지 않게 원본의 타임라인을 완전히 뒤섞어(비선형 재배치) 시청자를 쉴 틈 없이 몰아쳐야 한다.
2. **Pacing (속도감):** 지루한 롱테이크(Long-take)는 과감히 삭제하고, 핵심 장면(Highlight) 위주로 2~3초 단위의 속도감 있는 편집을 설계한다.
3. **Coverage (완전성):** 영상에 등장하는 **모든 소재(음식, 동물, 인물, 상황 등)가 최소 1회 이상 등장**해야 한다. (하나라도 누락 금지)
4. **Witty (재치 & 이원화 자막):** MZ세대 트렌드와 밈(Meme)을 반영한 16자 이내의 간결하고 임팩트 있는 '하단 기본 자막'과, 영상 상황 자체를 극대화하는 큼직한 '효과 자막(중앙 연출용)'을 동시에 기획한다.

---

## 3. 상세 분석 및 처리 프로세스 (Step-by-Step)

### STEP 1: 입력 데이터 정밀 분석
- 영상의 전체적인 분위기(Vibe), 등장인물/사물의 특징, 배경 음악의 비트, 돌발 상황 등을 프레임 단위로 분석한다.
- **[중요]** 영상이 여러 에피소드나 사물의 나열로 이루어진 경우(예: 먹방 모음, 동물 모음), 절대 특정 장면만 길게 쓰지 말고, **모든 종류가 다 나오도록 배분**한다.
- 타임라인을 완벽히 뒤섞기 위해, 영상 내 모든 컷의 '바이럴 임팩트 수치(리액션, 소리, 시각적 충격)'를 평가하여 0순위, 1순위, 2순위 컷을 분류한다.

### STEP 2: 제목(카피라이팅) 추출
- 사용자가 영상 프레임 상단이나 썸네일에 사용할 수 있는 **제목 10가지**를 추천한다.
- **조건:**
    - 클릭을 유도하는 의문형, 감탄형, '주접' 멘트, 정보 공유형 등을 섞을 것.
    - 예시: "이거 모르면 손해 ㅋㅋ", "마지막 반전 주의", "사람이 어떻게 핑크 복숭아? 🍑"

### STEP 3: 컷 편집 및 자막 설계 (핵심)
- **비선형 바이럴 편집 규칙 (Non-linear Editing Rule):**
    - **가장 빵 터지는 핵심 컷(0순위)을 무조건 1번 컷으로 끌어온다.**
    - 1번 컷 이후에도 원래 시간 순서로 돌아가지 마라. 1순위 장면, 2순위 장면들을 교차로 배치하여 텐션이 롤러코스터처럼 요동치게 타임라인을 완전히 해체하고 재조립한다. (예: 결말 컷 -> 중간 위기 컷 -> 초반 세팅 컷 -> 또 다른 위기 컷)
    - 하나의 컷은 가급적 **2~4초를 넘기지 않는다.**
    - 롱테이크(지루하게 이어지는 장면)는 건너뛰고, **동작의 정점(Climax)이나 표정 변화가 확실한 구간**만 타임스탬프로 지정한다.
    - 단순 나열이 아니라, 화면 전환(Transition)이 자연스럽게 이어지도록 배치한다.
- **자막 이원화 규칙 (Subtitle Rule):**
    - **효과 자막 (화면 내 연출 자막):** 영상 자체의 상황, 타격감, 감정 등을 묘사하는 큼직한 예능형 텍스트 (예: 💥쾅!, ㅋㅋㅋ, 😳동공지진, 물음표?). 화면 중앙이나 피사체 옆 등 시각적으로 가장 눈에 띄는 곳에 배치하도록 묘사한다.
    - **하단 기본 자막 (길이 및 내용):** 공백 포함 **16자 이내** (모바일 가독성 최적화). 상황을 단순히 설명하기보다, **시청자의 마음을 대변하거나(Reaction), 엉뚱한 해석을 달거나, ASMR/식감을 강조**하는 멘트로 작성. 문장 끝에 적절한 이모지 1개를 필수 포함.

---

## 4. 출력 형식 (Output Format)
*반드시 아래 형식을 지켜서 출력하시오. (주의: 컷 순서는 원본 영상의 시간 순서가 아니라, 임팩트 순으로 완전히 뒤섞인 상태여야 합니다!)*

각 버전은 고유한 후킹 전략, 톤, 편집 방향으로 차별화합니다.

---

## 5. 예외 처리 (Exception Handling)
- **소리가 없는 영상인 경우:** 시각적 요소(식감, 표정, 자막 드립)에 더 집중하여 효과 자막과 하단 자막을 구성한다.
- **특정 대사가 있는 경우:** 대사를 그대로 받아적지 말고, 그 대사의 **속뜻이나 상황을 비트는 자막**을 단다.
- **너무 정적인 영상인 경우:** "줌 인(Zoom-in)", "화면 흔들기" 등의 편집 효과를 텍스트로 제안한다.

## 6. 어조 및 태도 (Tone & Manner)
- **유쾌함, 긍정적, 트렌디함.**
- 인터넷 밈(Meme)이나 유행어를 적절히 활용하지만, 비속어는 피한다.
- 사용자가 바로 편집 툴에 적용할 수 있도록 **단호하고 명확하게** 지시한다.`;

const CONDENSED_SCRIPT_SYSTEM = `# 📖 축약 리캡 편집 프로토콜 v1.0 — 시간순 스토리 압축 편집

## 1. 역할
당신은 영드/중드/한드 등 드라마, 다큐, 긴 영상을 **60초 내외의 쇼츠 리캡**으로 축약하는 전문 편집 PD입니다.
기존 리메이크와 달리, **원본의 시간 흐름(타임라인)을 절대 뒤섞지 않고** 전체 스토리를 시간순으로 압축합니다.

## 2. 핵심 원칙 (절대 규칙)
1. **시간순 유지**: 원본 영상의 시간 흐름을 절대 뒤바꾸지 마라. 1번 컷은 항상 영상 초반, 마지막 컷은 항상 영상 후반.
2. **전체 커버리지**: 영상의 처음부터 끝까지 주요 스토리 포인트를 빠짐없이 포함. 특정 구간만 집중 금지.
3. **덜어내기 편집**: 장면을 새로 만들지 않는다. 원본에서 **핵심 장면만 선별**하여 연결한다.
4. **내레이션 중심**: 모든 컷은 [N](내레이션) 모드. AI 나레이터가 전체 스토리를 요약 설명한다.
5. **완결성**: 리캡 자체만으로 전체 내용을 이해할 수 있어야 한다. "본편에서 확인하세요" 금지.
6. **목표 길이**: 총 45~75초 내외 (8~15컷).

## 3. 내레이션 작성 규칙
- **압축적이고 긴장감 있는 문체**: "~했다", "~이다" 체 사용 (나레이션 톤)
- 한 컷당 내레이션 10~25자 내외 (읽기 속도: 한국어 4자/초 기준)
- 인물 이름, 관계, 핵심 사건을 정확히 언급
- 감정적 클라이맥스에서 문장을 짧고 강렬하게

## 4. 편집 지침
- 한 컷 = 3~6초 (내레이션 길이에 맞춤)
- 타임코드는 해당 장면이 실제로 등장하는 **원본 영상**의 위치를 **MM:SS.ms** 형식으로 정확히 기입
- **중요**: 타임코드는 리캡 영상 내 위치가 아니라 원본 영상의 실제 타임라인이다. 30분짜리 영상이면 00:00~30:00 전 구간에서 골고루 선택해야 한다.
- 비디오 화면 지시: 해당 타임코드에서 실제로 보이는 화면을 구체적으로 묘사
- 효과자막: 감정/상황을 강조하는 짧은 텍스트 (2~8자)

## 5. 출력 포맷
티키타카와 동일한 7열 마스터 편집 테이블을 사용하되, **모든 행이 [N] 모드**이고 **시간순**입니다.`;

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: { label: '티키타카', description: '크로스 더빙 스타일 — 더빙과 원본이 핑퐁처럼 교차하는 숏폼', color: 'blue' },
  snack: { label: '스낵형', description: '비선형 컷 편집 & 이원화 자막 — 바이럴 숏폼 전문 PD v10.8', color: 'amber' },
  condensed: { label: '축약 리캡', description: '시간순 스토리 압축 — 원본 순서 유지, 전체 내용을 60초로 요약', color: 'emerald' },
};

const VERSION_COLORS = [
  { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', numBg: 'bg-red-500' },
  { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', numBg: 'bg-orange-500' },
  { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', numBg: 'bg-yellow-500' },
  { bg: 'bg-green-500/15', border: 'border-green-500/30', text: 'text-green-400', numBg: 'bg-green-500' },
  { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', numBg: 'bg-blue-500' },
  { bg: 'bg-violet-500/15', border: 'border-violet-500/30', text: 'text-violet-400', numBg: 'bg-violet-500' },
  { bg: 'bg-pink-500/15', border: 'border-pink-500/30', text: 'text-pink-400', numBg: 'bg-pink-500' },
  { bg: 'bg-teal-500/15', border: 'border-teal-500/30', text: 'text-teal-400', numBg: 'bg-teal-500' },
  { bg: 'bg-indigo-500/15', border: 'border-indigo-500/30', text: 'text-indigo-400', numBg: 'bg-indigo-500' },
  { bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', numBg: 'bg-fuchsia-500' },
];

const CHART_TOOLTIP_STYLE = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };

/** 모드 색상 매핑 */
const MODE_COLORS: Record<string, { fill: string; label: string }> = {
  N: { fill: '#3b82f6', label: '내레이션[N]' },
  S: { fill: '#10b981', label: '현장음-대사[S]' },
  A: { fill: '#f59e0b', label: '현장음-액션[A]' },
};

/** 모드 문자열에서 N/S/A 추출 */
function extractModeKey(mode: string): string {
  if (mode.includes('N')) return 'N';
  if (mode.includes('S')) return 'S';
  if (mode.includes('A')) return 'A';
  return '';
}

// ═══════════════════════════════════════════════════
// 유저 메시지 빌더 (10개 버전 + 장면 구조화)
// ═══════════════════════════════════════════════════

const buildUserMessage = (inputDesc: string, preset: AnalysisPreset): string => {
  if (preset === 'condensed') {
    return `## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **전체 내용을 시간순으로 파악**하여, **10가지 서로 다른 축약 리캡 버전**을 설계하세요.
각 버전은 전체 스토리를 60초 내외로 압축하되, **원본의 시간 흐름을 절대 뒤바꾸지 마세요.**

### 🚨 최우선 규칙: 시간순 압축
- **1번 컷 = 영상 초반 장면, 마지막 컷 = 영상 후반 장면.** 순서 뒤바꿈 = 전체 폐기.
- **전체 스토리 커버:** 처음부터 끝까지 주요 전개를 빠짐없이 포함. 특정 구간만 집중 금지.
- **내레이션으로 전달:** 모든 컷은 [N] 모드. 나레이터가 스토리를 요약 설명.
- **완결된 리캡:** 이 리캡만 보고도 전체 내용을 이해할 수 있어야 함.
- **첨부된 프레임 이미지/영상 내용을 꼼꼼히 분석**하여 정확한 장면을 묘사하라.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. 출력 포맷은 **[마스터 편집 테이블 7열]** 사용. Content ID 분석 불필요.
2. 모든 행은 **[N](내레이션)** 모드만 사용. [S], [A] 금지.
3. 타임코드는 **MM:SS.ms** 형식. 반드시 **시간순 오름차순**이어야 한다.
4. 예상 시간은 **X.X초** 형식. 내레이션 길이 기준 (한국어 4글자/초).
5. 비디오 화면 지시는 해당 타임코드에서 **실제로 보이는 화면**을 정확히 기술.
6. **각 버전은 서로 다른 요약 전략**으로 차별화:
   - 버전 1~3: 스토리 중심 (전체 줄거리 요약)
   - 버전 4~6: 감정 중심 (감정적 하이라이트 위주)
   - 버전 7~8: 반전/서스펜스 중심 (궁금증 유발)
   - 버전 9~10: 인물/관계 중심 (캐릭터 기반 요약)
7. **버전당 8~15개 행.** 총 45~75초 설계.
8. **효과자막 필수:** 감정/상황 강조 (2~8자).
9. **각 VERSION 사이에 불필요한 설명 없이 바로 다음 VERSION.**
10. **🚨 타임코드 = 원본 영상의 실제 위치 (리캡 영상 내 위치가 아님):** 타임코드 소스는 원본 영상에서 해당 장면이 실제로 등장하는 시간이다. 만약 원본이 30분짜리 영상이면, 타임코드는 00:00~30:00 범위에서 **영상 전체에 골고루 분포**해야 한다. 절대로 처음 1~2분 구간에 몰리면 안 된다.

### 출력 포맷

---VERSION 1---
제목: [전체 내용 기반 클릭 유도 제목]
컨셉: [이 버전의 요약 전략 설명 1~2줄]

| 순서 | 모드 | 오디오 내용 (내레이션) | 효과자막 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "영상 초반 내용 요약" | [효과자막] | 4.0초 | (1) [컷1] 초반 장면 묘사 | 01:20.000 |
| 2 | [N] | (내레이션) "중반 전개 요약" | [효과자막] | 5.0초 | (1) [컷1] 중반 장면 묘사 | 12:45.000 |
| 3 | [N] | (내레이션) "후반 클라이맥스" | [효과자막] | 3.5초 | (1) [컷1] 후반 장면 묘사 | 25:10.000 |

---VERSION 2---
제목: ...
컨셉: ...

(이 패턴으로 ---VERSION 10--- 까지 총 10개)`;
  }

  if (preset === 'tikitaka') {
    return `## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **실제 제목, 설명, 태그, 댓글, 첨부된 프레임 이미지 등 모든 정보를 철저히 분석**하여 **10가지 서로 다른 바이럴 티키타카 리메이크 버전**을 설계하세요.
각 버전은 시스템 프롬프트의 2단계에 정의된 **10가지 바이럴 패턴 전략을 1번부터 10번까지 순서대로 하나씩 적용**해야 합니다.

### 🚨 최우선 규칙
- **원본 분량 100% 유지:** 원본 대본의 대사를 요약/축약/생략하지 마라. 모든 핵심 대사, 추임새, 리액션, 현장음을 빠짐없이 포함. (모드 A 적용 시)
- **제목은 이 영상의 실제 내용/주제에 직접 관련된 클릭 유도 제목.** 영상과 무관한 제목 = 전체 폐기.
- **첨부된 프레임 이미지를 꼼꼼히 분석**하여 비디오 화면 지시에 해당 타임코드의 정확한 장면을 구체적으로 묘사하라.
- **효과자막 필수:** 모든 행에 예능형 효과자막을 반드시 작성. (감정/상황/태클/연출 등)

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. 출력 포맷은 **[마스터 편집 테이블 7열]** + **[Content ID 분석]** 조합만 사용.
2. 모드는 **[N](내레이션), [S](현장음-대사), [A](현장음-액션)** 중 하나만 사용.
3. 타임코드는 **MM:SS.ms** 형식 엄수 (예: 00:11.200). 근사치·추상적 표현 금지.
4. 예상 시간은 **X.X초** 형식 (예: 4.0초). 내레이션은 한국어 평균 4글자/초로 계산.
5. 비디오 화면 지시는 **(1) [컷1] 정확한 장면 묘사 (시간) / (2) [컷2] 장면 묘사 (시간)** 형식. HTML 태그 금지. 해당 타임코드에서 실제로 보이는 화면을 정확히 기술.
6. 슬로우 모션 금지 — 정배속 멀티 컷 분할 전략 사용.
7. **각 버전은 서로 다른 바이럴 전략** (전략 1~10 순서대로 적용).
8. **버전당 최소 8개 이상, 최대 15개 행.** 총 60초 내외 설계. 모든 행에 7열 완비.
9. **각 VERSION 사이에 불필요한 설명 텍스트 없이 바로 다음 VERSION.**
10. 효과자막은 **예능형 텍스트** (예: [동공지진], (팩트폭행), [부들부들], (BGM: 비장한 음악), [갑분싸]). 2~10자.

### 출력 포맷 (7열 마스터 편집 테이블 + Content ID 분석)

---VERSION 1---
제목: [클릭 유도 제목]
컨셉: [적용한 전략명 + 차별화 설명 1~2줄]
재배치 구조: [예: ⑤하이라이트 → ②리액션 → ①발단 → ⑥결말]

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 효과자막 | 예상 시간 | 비디오 화면 지시 (정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "후킹 대사" | [효과자막] | 3.5초 | (1) [컷1] 정확한 장면 묘사 (1.5초) / (2) [컷2] 정확한 장면 묘사 (2.0초) | 00:03.200 / 00:15.800 |
| 2 | [A] | (현장음) (소리 묘사) | [효과자막] | 1.5초 | (1) [액션] 동작 묘사 (클로즈업) | 00:16.500 |
| 3 | [S] | (인물) "원본 대사" | [효과자막] | 2.0초 | (1) [원본 오디오] 인물 대사 (정배속) | 00:18.100 |

[Content ID 회피 및 바이럴 정밀 분석]
텍스트 일치율: X.X%
구조 유사도: X.X%
순서 유사도: X.X%
키워드 변형률: XX.X%
최종 안전 등급: [매우 안전 / 안전 / 보통]
바이럴 예상 포인트: "구체적 분석"
판정 코멘트: "회피 전략 한 줄 요약"

---VERSION 2---
제목: ...
컨셉: ...
재배치 구조: ...

(이 패턴으로 ---VERSION 10--- 까지 총 10개)`;
  }

  // 스낵형
  return `## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **실제 제목, 설명, 태그, 댓글 등 모든 정보를 철저히 분석**하여, 지침서에 따라 **10가지 서로 다른 숏폼 리메이크 버전**을 설계하세요.

### 🚨 최우선 규칙: 영상 내용 충실 반영
- **제목은 위에 제공된 영상의 실제 내용/주제를 기반으로** 작성해야 합니다. 영상과 무관한 제목 작성 시 전체 폐기.
- **설명(Description)과 댓글의 핵심 내용을 빠짐없이 반영**하세요. 영상에 나오는 인물, 사건, 상황을 정확히 파악하세요.
- **첨부된 프레임 이미지를 꼼꼼히 분석**하여 화면 묘사에 구체적으로 반영하세요.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. **컷 순서는 원본 영상의 시간 순서가 아니라, 임팩트 순으로 완전히 뒤섞어야 한다.** 순차적 나열 절대 금지.
2. 가장 바이럴한 펀치라인/클라이맥스를 무조건 **1번 컷(00:00~00:03)에 선배치**.
3. 효과 자막은 **큼직한 예능형 텍스트** (예: 💥쾅!, ㅋㅋㅋ, 😳동공지진). 2~8자 이내.
4. 하단 자막은 **공백 포함 16자 이내**. 시청자 마음 대변/엉뚱한 해석. 이모지 1개 필수.
5. 하나의 컷은 가급적 **2~4초**를 넘기지 않는다.
6. 영상에 등장하는 **모든 소재가 최소 1회 이상** 등장해야 한다.
7. **제목은 반드시 이 영상의 실제 내용과 직접적으로 관련된 클릭 유도 제목**이어야 함. 영상과 무관한 제목 절대 금지.
8. **각 버전은 서로 다른 후킹 전략, 톤, 편집 방향**으로 차별화.
9. **총 길이 45~60초 내외.** 버전당 5~15개 컷.
10. **각 VERSION 사이에 불필요한 설명 텍스트 금지.** 바로 다음 VERSION으로 이어진다.

### 출력 포맷 (이 형식을 정확히 따르세요)

---VERSION 1---
제목: [이 영상 내용과 관련된 클릭 유도 제목]
컨셉: [이 버전만의 차별화된 후킹/편집 전략 설명 1~2줄]

---SCENE 1---
배치: 00:00 ~ 00:03 (원본 MM:SS~MM:SS 구간을 끌어옴)
화면: [가장 바이럴한 장면의 구체적 행동/시각적 충격 묘사 + 카메라워크/전환효과]
효과자막: [화면에 크게 들어갈 예능형 효과 자막]
하단자막: [16자 이내 하단 자막 + 이모지]

---SCENE 2---
배치: 00:03 ~ 00:06 (원본 MM:SS~MM:SS)
화면: [순서를 무시하고 텐션을 이어갈 다음 핵심 행동 묘사]
효과자막: [효과 자막]
하단자막: [16자 이내 + 이모지]

(모든 소재가 포함되도록 컷 반복)

---VERSION 2---
제목: ...
컨셉: ...
---SCENE 1---
배치: ...
화면: ...
효과자막: ...
하단자막: ...
...

(이 패턴으로 ---VERSION 10--- 까지 총 10개)`;
};

// ═══════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════

const VideoAnalysisRoom: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  // ── Zustand 스토어 (탭 전환 시 영속) ──
  const store = useVideoAnalysisStore();
  const {
    inputMode, youtubeUrl, selectedPreset, rawResult, versions, thumbnails, error, expandedId,
    setInputMode, setYoutubeUrl, setSelectedPreset, setRawResult, setVersions, setThumbnails,
    setError, setExpandedId, cacheCurrentResult, restoreFromCache, resetResults,
    clearPresetCache,
    savedSlots, activeSlotId, loadSlot, removeSlot, newAnalysis, loadAllSlots, saveSlot,
  } = store;

  // 로컬 전용 (일시적 UI 상태 — 영속 불필요)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'analyzing'>('idle');
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  const [previewFrame, setPreviewFrame] = useState<{ frame: TimedFrame; scene: SceneRow; versionTitle: string } | null>(null);
  const analysisStartRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasInput = inputMode === 'youtube' ? youtubeUrl.trim().length > 0 : uploadedFile !== null;

  // 슬롯 목록 초기 로드
  React.useEffect(() => { loadAllSlots(); }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setUploadedFile(file); setRawResult(''); setError(null); setVersions([]); setThumbnails([]);
      if (inputMode !== 'upload') setInputMode('upload');
    }
  }, [inputMode, setInputMode, setRawResult, setError, setVersions, setThumbnails]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setRawResult(''); setError(null); setVersions([]); setThumbnails([]); }
  };

  // ── 프리셋 전환 시 캐시 복원 or 신규 분석 ──
  const handleAnalyze = async (preset: AnalysisPreset, force = false) => {
    if (!requireAuth('영상 분석')) return;
    if (!hasInput) return;

    // 현재 결과를 기존 프리셋 캐시에 저장 (전환 전 보존)
    if (selectedPreset && rawResult) {
      cacheCurrentResult(selectedPreset);
    }

    // 강제 재생성 시 해당 프리셋 캐시 삭제
    if (force) {
      clearPresetCache(preset);
    }

    // 캐시에 이미 결과가 있으면 복원만 하고 종료
    if (!force && restoreFromCache(preset)) return;

    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    setElapsedSec(0);
    setSimProgress(0);
    analysisStartRef.current = Date.now();
    resetResults();

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM
      : preset === 'condensed' ? CONDENSED_SCRIPT_SYSTEM
      : SNACK_SCRIPT_SYSTEM;

    try {
      // 1단계: 영상 소스 준비 + UI 썸네일 + 메타데이터
      let videoUri = ''; // Gemini v1beta fileData용 URL
      let videoMime = 'video/mp4';
      let frames: TimedFrame[] = [];
      let inputDesc = '';

      if (uploadedFile) {
        // 업로드 파일 → Cloudinary에 업로드 → URL 획득
        const cloudUrl = await uploadMediaToHosting(uploadedFile);
        videoUri = cloudUrl;
        videoMime = uploadedFile.type || 'video/mp4';
        // UI 표시용 프레임 추출 (비주얼 컬럼)
        frames = await extractVideoFrames(uploadedFile);
        inputDesc = `업로드된 영상 파일: ${uploadedFile.name} (${((uploadedFile.size || 0) / 1024 / 1024).toFixed(1)}MB)`;
      } else {
        const vid = extractYouTubeVideoId(youtubeUrl);
        if (vid) {
          // YouTube URL → Gemini에 직접 전달 (Google 서비스 간 내부 접근)
          videoUri = youtubeUrl.trim();

          // YouTube Data API로 메타데이터 + 댓글 가져오기 (보조 컨텍스트)
          const [meta, comments] = await Promise.all([
            fetchYouTubeVideoMeta(vid),
            fetchYouTubeComments(vid),
          ]);

          // UI 표시용 플레이스홀더 썸네일 (분석 중 표시용, 분석 후 정확한 프레임으로 교체됨)
          const durationSec = meta ? parseIsoDuration(meta.duration) : 60;
          const base = `https://img.youtube.com/vi/${vid}`;
          frames = [
            { url: `${base}/hqdefault.jpg`, hdUrl: `${base}/maxresdefault.jpg`, timeSec: 0 },
            { url: `${base}/1.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.25) },
            { url: `${base}/2.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.5) },
            { url: `${base}/3.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.75) },
          ];

          if (meta) {
            inputDesc = `## YouTube 영상 정보
- **제목**: ${meta.title}
- **채널**: ${meta.channelTitle}
- **조회수**: ${meta.viewCount.toLocaleString()}회
- **좋아요**: ${meta.likeCount.toLocaleString()}개
- **영상 길이**: ${meta.duration} (${durationSec}초)
- **태그**: ${meta.tags.slice(0, 30).join(', ') || '없음'}
- **URL**: ${youtubeUrl.trim()}

### 영상 설명(Description)
${meta.description.slice(0, 2000)}${meta.description.length > 2000 ? '\n...(이하 생략)' : ''}`;

            if (comments.length > 0) {
              inputDesc += `\n\n### 상위 댓글 ${comments.length}개 (영상 내용 맥락 파악용)
${comments.slice(0, 15).map((c, i) => `${i + 1}. ${c.slice(0, 150)}`).join('\n')}`;
            }
          } else {
            inputDesc = `YouTube 영상 URL: ${youtubeUrl.trim()}`;
          }
        } else {
          inputDesc = `YouTube 영상 URL: ${youtubeUrl.trim()}`;
        }
      }
      setThumbnails(frames);

      // 2단계: AI 분석 — Gemini v1beta로 영상 직접 분석 (1fps 프레임 단위)
      const userPrompt = buildUserMessage(inputDesc, preset);
      let text: string;

      if (videoUri) {
        // ★ v1beta fileData: Gemini가 영상을 1프레임 단위로 직접 분석
        try {
          text = await evolinkVideoAnalysisStream(
            videoUri, videoMime, scriptSystem, userPrompt,
            () => {}, { temperature: 0.5, maxOutputTokens: 40000 }
          );
        } catch (videoErr) {
          // v1beta 실패 시 OpenAI 호환 폴백 (이미지 기반)
          console.warn('[VideoAnalysis] v1beta 영상 분석 실패, 이미지 폴백:', videoErr);
          const parts: EvolinkContentPart[] = [
            { type: 'text', text: userPrompt },
            ...frames.slice(0, 10).flatMap(f => [
              { type: 'text' as const, text: `[프레임 ${formatTimeSec(f.timeSec)}]` },
              { type: 'image_url' as const, image_url: { url: f.url } },
            ]),
          ];
          const messages: EvolinkChatMessage[] = [
            { role: 'system', content: scriptSystem },
            { role: 'user', content: parts },
          ];
          text = await evolinkChatStream(messages, () => {}, { temperature: 0.5, maxTokens: 40000 });
        }
      } else {
        // URL 없음 — 텍스트만으로 분석
        const messages: EvolinkChatMessage[] = [
          { role: 'system', content: scriptSystem },
          { role: 'user', content: userPrompt },
        ];
        text = await evolinkChatStream(messages, () => {}, { temperature: 0.5, maxTokens: 40000 });
      }

      const parsed = parseVersions(text);
      setRawResult(text);
      setVersions(parsed);

      // ★ 3중 폴백 프레임 추출 — 무조건 결과 보장
      const allTimecodes = collectTimecodesFromVersions(parsed);
      console.log(`[Frame] 수집된 타임코드: ${allTimecodes.length}개`);
      if (allTimecodes.length > 0) {
        let videoSource: string | File | null = null;
        let ytVid: string | null = null;
        let durSec = 300; // 기본 5분 추정

        if (uploadedFile) {
          videoSource = uploadedFile;
        } else {
          ytVid = extractYouTubeVideoId(youtubeUrl);
          if (ytVid) {
            // YouTube 메타데이터에서 영상 길이 추출
            try {
              const meta = await fetchYouTubeVideoMeta(ytVid);
              if (meta?.duration) {
                // ISO 8601 duration (PT1M30S) → 초 변환
                const m = meta.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                if (m) durSec = (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
              }
            } catch { /* 기본값 사용 */ }

            const streamUrl = await fetchYouTubeStreamUrl(ytVid).catch(() => null);
            if (streamUrl) videoSource = streamUrl;
          }
        }

        const exactFrames = await extractFramesWithFallback(
          videoSource || '', allTimecodes, ytVid, durSec
        );
        if (exactFrames.length > 0) {
          console.log(`[Frame] ✅ 최종 프레임 ${exactFrames.length}개 적용`);
          setThumbnails(exactFrames);
        }
      }

      // 결과 캐시에 저장 (Zustand 스토어)
      setTimeout(() => cacheCurrentResult(preset), 100);
      notifyAnalysisComplete();
      // 자동 슬롯 저장
      setTimeout(() => useVideoAnalysisStore.getState().saveSlot(), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[VideoAnalysis] 분석 실패:', err);
      setError(`분석 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  // 버전 복사
  const handleCopyVersion = useCallback(async (v: VersionItem) => {
    const isTk = selectedPreset === 'tikitaka' || selectedPreset === 'condensed';
    const scenesText = isTk
      ? v.scenes.map(s => `[${s.cutNum}] ${s.mode} | ${s.audioContent} | ${s.duration} | ${s.videoDirection} | ${s.timecodeSource}`).join('\n')
      : v.scenes.map(s => `[컷 ${s.cutNum}] ${s.timeline}\n대사: ${s.dialogue}\n효과: ${s.effectSub}\n장면: ${s.sceneDesc}`).join('\n\n');
    const text = `제목: ${v.title}\n컨셉: ${v.concept}\n\n${scenesText}`;
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    setCopiedVersion(v.id);
    setTimeout(() => setCopiedVersion(null), 2000);
  }, [selectedPreset]);

  // SRT 다운로드
  const handleDownloadSrt = useCallback((v: VersionItem) => {
    if (v.scenes.length === 0) return;
    const isTk = selectedPreset === 'tikitaka' || selectedPreset === 'condensed';
    const srt = generateSrt(v.scenes, isTk);
    const safeName = v.title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40);
    downloadSrt(srt, `${safeName || `version-${v.id}`}.srt`);
  }, [selectedPreset]);

  // HTML 다운로드 (개별 버전)
  const handleDownloadVersionHtml = useCallback((v: VersionItem) => {
    if (!selectedPreset) return;
    const sourceInfo = inputMode === 'youtube' ? `YouTube: ${youtubeUrl}` : `파일: ${uploadedFile?.name || ''}`;
    const html = generateAnalysisHtml([v], selectedPreset, thumbnails, sourceInfo);
    const safeName = v.title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40);
    downloadFile(html, `${safeName || `version-${v.id}`}.html`, 'text/html');
  }, [selectedPreset, thumbnails, inputMode, youtubeUrl, uploadedFile]);

  // HTML 다운로드 (전체 버전)
  const handleDownloadAllHtml = useCallback(() => {
    if (!selectedPreset || versions.length === 0) return;
    const sourceInfo = inputMode === 'youtube' ? `YouTube: ${youtubeUrl}` : `파일: ${uploadedFile?.name || ''}`;
    const html = generateAnalysisHtml(versions, selectedPreset, thumbnails, sourceInfo);
    const presetLabel = selectedPreset === 'tikitaka' ? '티키타카' : selectedPreset === 'condensed' ? '축약리캡' : '스낵형';
    downloadFile(html, `${presetLabel}_분석결과_전체.html`, 'text/html');
  }, [selectedPreset, versions, thumbnails, inputMode, youtubeUrl, uploadedFile]);

  // 경과 시간 + 시뮬레이션 진행률 타이머
  const ESTIMATED_TOTAL_SEC = 90; // 예상 총 소요시간 (초) — 10버전 상세 테이블
  useEffect(() => {
    if (!isAnalyzing) return;
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - analysisStartRef.current) / 1000);
      setElapsedSec(elapsed);
      // 비선형 진행률: 빠르게 시작 → 점진적 감속 (95%에서 수렴)
      const progress = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / (ESTIMATED_TOTAL_SEC * 0.55)))));
      setSimProgress(progress);
    }, 500);
    return () => clearInterval(iv);
  }, [isAnalyzing]);

  // ESC — 미리보기 → 버전 접기 순서
  useEffect(() => {
    if (!expandedId && !previewFrame) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewFrame) { setPreviewFrame(null); return; }
        setExpandedId(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [expandedId]);

  return (
    <div className="space-y-6">
      {/* 분석 슬롯 바 */}
      <AnalysisSlotBar
        slots={savedSlots.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt }))}
        activeSlotId={activeSlotId}
        onNewAnalysis={() => { newAnalysis(); setUploadedFile(null); }}
        onLoadSlot={loadSlot}
        onDeleteSlot={removeSlot}
        hasCurrentResults={versions.length > 0 && !activeSlotId}
      />
      {/* ═══ 입력 ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">🎬</span>
          영상 소스 입력
        </h2>
        <div className="flex gap-2 mb-4">
          {(['youtube', 'upload'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => { setInputMode(mode); if (mode === 'youtube') setUploadedFile(null); else setYoutubeUrl(''); resetResults(); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inputMode === mode
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
              }`}
            >
              {mode === 'youtube' ? 'YouTube 링크' : '영상 업로드'}
            </button>
          ))}
        </div>

        {inputMode === 'youtube' ? (
          <div className="relative">
            <input
              type="url" value={youtubeUrl}
              onChange={e => { setYoutubeUrl(e.target.value); resetResults(); }}
              placeholder="YouTube 영상 URL (예: https://youtube.com/watch?v=...)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            {youtubeUrl && (
              <button type="button" onClick={() => setYoutubeUrl('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ) : (
          <div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />
            {uploadedFile ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3">
                <span className="text-blue-400 text-lg">🎥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-gray-500 text-xs">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</p>
                </div>
                <button type="button" onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-500 hover:text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                className={`w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2 transition-all ${isDragOver ? 'border-blue-400 bg-blue-500/10' : 'border-gray-600 hover:border-blue-500/50 hover:bg-blue-500/5'}`}>
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">{isDragOver ? '여기에 놓으세요!' : '클릭 또는 드래그하여 영상 파일 선택'}</span>
                <span className="text-gray-600 text-xs">MP4, MOV, AVI 등</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ 프리셋 ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">🎯</span>
          리메이크 프리셋
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSel = selectedPreset === key && isAnalyzing;
            const cMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hover: 'hover:bg-amber-600/20' },
              emerald: { bg: 'bg-emerald-600/10', border: 'border-emerald-500/30', text: 'text-emerald-400', hover: 'hover:bg-emerald-600/20' },
            };
            const c = cMap[info.color] || cMap.blue;
            return (
              <button
                key={key} type="button" disabled={!hasInput || isAnalyzing} onClick={() => handleAnalyze(key)}
                className={`relative p-5 rounded-xl border text-left transition-all ${isSel ? `${c.bg} ${c.border}` : `bg-gray-900/50 border-gray-600/50 ${c.hover} hover:border-gray-500`} ${(!hasInput || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-base font-bold ${c.text}`}>{info.label}</span>
                  {isSel && <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />}
                </div>
                <p className="text-gray-400 text-sm">{info.description}</p>
              </button>
            );
          })}
        </div>
        {!hasInput && <p className="text-gray-500 text-sm mt-3">영상 소스를 먼저 입력해주세요.</p>}
        {hasInput && !isAnalyzing && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500">
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-900/10 rounded-lg border border-blue-800/20">
              <span className="text-blue-400 font-bold flex-shrink-0">티키타카</span>
              <span>AI 더빙 + 원본 대사가 핑퐁처럼 교차. 순서를 뒤섞어 Content ID 회피 + 바이럴 극대화.</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/10 rounded-lg border border-amber-800/20">
              <span className="text-amber-400 font-bold flex-shrink-0">스낵형</span>
              <span>타임라인 완전 해체 + 비선형 컷 편집. 가장 임팩트 있는 장면을 맨 앞에 배치하는 바이럴 숏폼.</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-900/10 rounded-lg border border-emerald-800/20">
              <span className="text-emerald-400 font-bold flex-shrink-0">축약 리캡</span>
              <span>원본 순서 유지. 전체 스토리를 60초로 압축 요약. 드라마/다큐 등 긴 영상의 리캡 쇼츠에 최적.</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 로딩 — 프리미엄 로딩 패널 ═══ */}
      {isAnalyzing && (
        <AnalysisLoadingPanel
          currentStep={simProgress < 15 ? 0 : simProgress < 40 ? 1 : simProgress < 75 ? 2 : 3}
          steps={[
            { label: '영상 로드', icon: '📹' },
            { label: '장면 분석', icon: '🔍' },
            { label: '버전 생성', icon: '✨' },
            { label: '편집 가이드', icon: '📋' },
          ]}
          message="10가지 리메이크 버전 생성 중..."
          elapsedSec={elapsedSec}
          estimatedTotalSec={ESTIMATED_TOTAL_SEC}
          accent="blue"
          description="AI가 영상을 분석하고 장면별 편집 가이드를 작성하고 있습니다"
        />
      )}

      {/* ═══ 에러 ═══ */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">분석 오류</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ═══ 10가지 버전 아코디언 ═══ */}
      {versions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center text-sm">🎬</span>
              리메이크 {versions.length}가지 버전
            </h2>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => selectedPreset && handleAnalyze(selectedPreset, true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              재생성
            </button>
          </div>

          <div className="space-y-2">
            {versions.map((v) => {
              const isExp = expandedId === v.id;
              const ci = (v.id - 1) % VERSION_COLORS.length;
              const c = VERSION_COLORS[ci];
              const hasScenes = v.scenes.length > 0;

              return (
                <div key={v.id} className={`rounded-xl border transition-all ${isExp ? `${c.bg} ${c.border}` : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'}`}>
                  {/* 헤더 */}
                  <button type="button" onClick={() => setExpandedId(isExp ? null : v.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                    <span className={`w-7 h-7 rounded-full ${c.numBg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>{v.id}</span>
                    <span className={`flex-1 text-sm font-bold truncate ${isExp ? c.text : 'text-gray-200'}`}>{v.title}</span>
                    {hasScenes && <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded flex-shrink-0">{v.scenes.length}컷</span>}
                    <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0 ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 펼쳐진 내용 */}
                  {isExp && (
                    <div className="px-4 pb-4 space-y-3">
                      {/* 컨셉 + 재배치 구조 */}
                      {(v.concept || v.rearrangement) && (
                        <div className="bg-gray-900/40 rounded-lg px-3 py-2 border border-gray-700/40 space-y-1">
                          {v.concept && <p className="text-gray-400 text-sm leading-relaxed">{v.concept}</p>}
                          {v.rearrangement && (
                            <p className="text-xs text-cyan-400 font-mono">
                              <span className="text-gray-500 font-sans">재배치:</span> {v.rearrangement}
                            </p>
                          )}
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyVersion(v)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            copiedVersion === v.id
                              ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                              : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-white'
                          }`}
                        >
                          {copiedVersion === v.id ? '복사됨' : '복사'}
                        </button>
                        {hasScenes && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDownloadSrt(v)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                              SRT
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadVersionHtml(v)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                              HTML
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const isTk = selectedPreset === 'tikitaka' || selectedPreset === 'condensed';
                                const versionText = isTk
                                  ? `제목: ${v.title}\n컨셉: ${v.concept}\n\n| 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n` + v.scenes.map(s =>
                                    `| ${s.cutNum} | ${s.mode} | ${s.audioContent} | ${s.duration} | ${s.videoDirection} | ${s.timecodeSource} |`
                                  ).join('\n')
                                  : `제목: ${v.title}\n\n` + v.scenes.map(s =>
                                    `[컷 ${s.cutNum}] ${s.timeline}\n대사: ${s.dialogue}\n효과: ${s.effectSub}\n장면: ${s.sceneDesc}`
                                  ).join('\n\n');
                                const epStore = useEditPointStore.getState();
                                epStore.reset();
                                epStore.setRawEditTable(versionText);
                                epStore.setRawNarration(versionText);
                                useEditRoomStore.getState().setEditRoomSubTab('edit-point-matching');
                                useNavigationStore.getState().setActiveTab('edit-room');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121" /></svg>
                              편집실로
                            </button>
                          </>
                        )}
                      </div>

                      {/* 타임라인 바 + 모드별 파이 차트 */}
                      {hasScenes && (selectedPreset === 'tikitaka' || selectedPreset === 'condensed') && (() => {
                        const rows = v.scenes;
                        // 타임라인 바 데이터: 각 row를 duration 기반 stacked bar로
                        const timelineData = rows.map(r => {
                          const mk = extractModeKey(r.mode);
                          const dur = parseDuration(r.duration);
                          return {
                            name: `#${r.cutNum}`,
                            duration: dur,
                            fill: MODE_COLORS[mk]?.fill || '#6b7280',
                            mode: r.mode,
                            audioContent: r.audioContent,
                            durationLabel: r.duration,
                          };
                        });
                        // 모드별 비율 파이 데이터
                        const modeDist = [
                          { name: '내레이션[N]', value: rows.filter(r => r.mode.includes('N')).length, fill: '#3b82f6' },
                          { name: '현장음-대사[S]', value: rows.filter(r => r.mode.includes('S')).length, fill: '#10b981' },
                          { name: '현장음-액션[A]', value: rows.filter(r => r.mode.includes('A')).length, fill: '#f59e0b' },
                        ].filter(d => d.value > 0);

                        if (timelineData.length === 0) return null;

                        return (
                          <div className="flex items-center gap-4 mb-3">
                            {/* 타임라인 바 */}
                            <div className="flex-1 bg-gray-900/40 rounded-lg border border-gray-700/40 p-2">
                              <p className="text-[10px] text-gray-500 mb-1 font-medium">타임라인</p>
                              <div style={{ width: '100%', height: 44 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart layout="vertical" data={[{ name: 'timeline', ...Object.fromEntries(timelineData.map((d, i) => [`seg${i}`, d.duration])) }]} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={24}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" hide />
                                    <Tooltip
                                      contentStyle={CHART_TOOLTIP_STYLE}
                                      labelStyle={{ color: '#9ca3af', fontSize: '11px' }}
                                      itemStyle={{ color: '#e5e7eb', fontSize: '11px', padding: 0 }}
                                      formatter={(value: number, name: string) => {
                                        const idx = parseInt(name.replace('seg', ''), 10);
                                        const item = timelineData[idx];
                                        return [`${item?.mode} ${item?.durationLabel || value + '초'}`, item?.audioContent?.slice(0, 30) || `세그먼트 ${idx + 1}`];
                                      }}
                                    />
                                    {timelineData.map((d, i) => (
                                      <Bar key={`seg${i}`} dataKey={`seg${i}`} stackId="a" fill={d.fill} radius={i === 0 ? [4, 0, 0, 4] : i === timelineData.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} />
                                    ))}
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                              {/* 범례 */}
                              <div className="flex gap-3 mt-1">
                                {Object.entries(MODE_COLORS).map(([key, mc]) => (
                                  <span key={key} className="flex items-center gap-1 text-[9px] text-gray-500">
                                    <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: mc.fill }} />
                                    {mc.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {/* 모드별 파이 차트 */}
                            <div className="w-28 flex-shrink-0 bg-gray-900/40 rounded-lg border border-gray-700/40 p-2 flex flex-col items-center">
                              <p className="text-[10px] text-gray-500 mb-0.5 font-medium">모드 비율</p>
                              <div style={{ width: 100, height: 80 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={modeDist}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={18}
                                      outerRadius={34}
                                      dataKey="value"
                                      stroke="none"
                                    >
                                      {modeDist.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.fill} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={CHART_TOOLTIP_STYLE}
                                      itemStyle={{ color: '#e5e7eb', fontSize: '11px', padding: 0 }}
                                      formatter={(value: number, name: string) => [`${value}컷`, name]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 프리셋별 장면 테이블 */}
                      {hasScenes ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-700">
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-8">#</th>
                                {(selectedPreset === 'tikitaka' || selectedPreset === 'condensed') ? (
                                  <>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[52px]">모드</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">{selectedPreset === 'condensed' ? '내레이션' : '오디오 내용'}</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[110px]">효과자막</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[60px]">예상 시간</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">비디오 화면 지시</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[100px]">타임코드</th>
                                  </>
                                ) : (
                                  <>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">화면</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">효과 자막</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">하단 자막</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[110px]">편집점</th>
                                  </>
                                )}
                                {thumbnails.length > 0 && (
                                  <th className="py-2 px-2 text-left text-gray-500 font-bold w-[120px]">비주얼</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {v.scenes.map((scene, si) => (
                                <tr key={scene.cutNum} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2 px-2 align-top">
                                    <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold text-white ${c.numBg}`}>{scene.cutNum}</span>
                                  </td>
                                  {(selectedPreset === 'tikitaka' || selectedPreset === 'condensed') ? (
                                    <>
                                      <td className="py-2 px-2 align-top">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          scene.mode.includes('N') ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                          : scene.mode.includes('S') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          : scene.mode.includes('A') ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                          : 'bg-gray-700 text-gray-400'
                                        }`}>{scene.mode || '-'}</span>
                                      </td>
                                      <td className="py-2 px-2 align-top text-gray-300 leading-relaxed">{scene.audioContent || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        {scene.effectSub ? (
                                          <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-[10px] font-bold leading-tight">{scene.effectSub}</span>
                                        ) : <span className="text-gray-600 text-[10px]">-</span>}
                                      </td>
                                      <td className="py-2 px-2 align-top text-center">
                                        <span className="text-violet-400 font-mono text-[10px] font-bold">{scene.duration || '-'}</span>
                                      </td>
                                      <td className="py-2 px-2 align-top text-gray-400 leading-relaxed text-[11px]">{scene.videoDirection || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        <div className="text-blue-400 font-mono text-[10px] leading-relaxed">{scene.timecodeSource || '-'}</div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2 px-2 align-top text-gray-300 leading-relaxed text-[11px]">{scene.sceneDesc || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        {scene.effectSub ? (
                                          <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-xs font-bold">{scene.effectSub}</span>
                                        ) : '-'}
                                      </td>
                                      <td className="py-2 px-2 align-top text-gray-300 leading-relaxed text-[11px]">{scene.dialogue || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        <div className="space-y-0.5">
                                          {scene.sourceTimeline && <div className="text-blue-400 font-mono text-[10px]">원본: {scene.sourceTimeline}</div>}
                                          {scene.timeline && <div className="text-gray-500 font-mono text-[10px]">배치: {scene.timeline}</div>}
                                        </div>
                                      </td>
                                    </>
                                  )}
                                  {thumbnails.length > 0 && (() => {
                                    // 티키타카: timecodeSource, 스낵형: sourceTimeline (원본) 우선
                                    const tc = scene.timecodeSource || scene.sourceTimeline || '';
                                    // 원본 타임코드에서 첫 번째 값 추출 (복수 타임코드 중 첫 번째)
                                    const firstTc = tc.split(/[/~,]/)[0].trim();
                                    let sceneTimeSec = timecodeToSeconds(firstTc);
                                    // 소스 타임코드 없으면 배치 타임코드 시도
                                    if (sceneTimeSec <= 0 && scene.timeline) {
                                      const range = scene.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);
                                      if (range) {
                                        const mid = (timecodeToSeconds(range[1]) + timecodeToSeconds(range[2])) / 2;
                                        if (mid > 0) sceneTimeSec = mid;
                                      }
                                    }
                                    // 최종 폴백: 장면 인덱스로 프레임 분산 배치 (항상 같은 썸네일 방지)
                                    const matched = sceneTimeSec > 0
                                      ? matchFrameToTimecode(sceneTimeSec, thumbnails)
                                      : thumbnails[Math.min(Math.floor((si / Math.max(v.scenes.length, 1)) * thumbnails.length), thumbnails.length - 1)] || null;
                                    return matched ? (
                                      <td className="py-2 px-2 align-top">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewFrame({ frame: matched, scene, versionTitle: v.title })}
                                          className="space-y-0.5 group cursor-pointer text-left"
                                        >
                                          <img
                                            src={matched.url}
                                            alt={`Scene ${scene.cutNum}`}
                                            className="w-[100px] h-[56px] object-cover rounded border border-gray-700/50 group-hover:border-blue-500/60 group-hover:ring-1 group-hover:ring-blue-500/30 transition-all"
                                            loading="lazy"
                                          />
                                          <div className="text-[9px] text-gray-600 text-center font-mono group-hover:text-blue-400 transition-colors">{formatTimeSec(matched.timeSec)}</div>
                                        </button>
                                      </td>
                                    ) : <td className="py-2 px-2" />;
                                  })()}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* 장면 파싱 실패 시 원문 표시 */
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50 max-h-[400px] overflow-y-auto">
                          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{v.concept || v.title}</p>
                        </div>
                      )}

                      {/* Content ID 회피 및 바이럴 분석 */}
                      {v.contentId && (
                        <div className="bg-gray-900/40 rounded-lg border border-gray-700/40 p-3 space-y-2">
                          <p className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                            <span className="w-4 h-4 bg-emerald-600 rounded flex items-center justify-center text-[9px] text-white">ID</span>
                            Content ID 회피 및 바이럴 분석
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[9px] text-gray-500">텍스트 일치율</p>
                              <p className="text-sm font-bold text-emerald-400 font-mono">{v.contentId.textMatchRate}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[9px] text-gray-500">구조 유사도</p>
                              <p className="text-sm font-bold text-cyan-400 font-mono">{v.contentId.structureSimilarity}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[9px] text-gray-500">순서 유사도</p>
                              <p className="text-sm font-bold text-blue-400 font-mono">{v.contentId.orderSimilarity}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[9px] text-gray-500">키워드 변형률</p>
                              <p className="text-sm font-bold text-violet-400 font-mono">{v.contentId.keywordVariation}%</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                              v.contentId.safetyGrade.includes('매우') ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
                              : v.contentId.safetyGrade.includes('안전') ? 'bg-green-600/20 text-green-300 border-green-500/30'
                              : 'bg-yellow-600/20 text-yellow-300 border-yellow-500/30'
                            }`}>
                              {v.contentId.safetyGrade}
                            </span>
                            {v.contentId.viralPoint !== '-' && (
                              <span className="text-[10px] text-orange-400">
                                <span className="text-gray-500">바이럴:</span> {v.contentId.viralPoint}
                              </span>
                            )}
                          </div>
                          {v.contentId.judgement !== '-' && (
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                              <span className="text-gray-400 font-bold">판정:</span> {v.contentId.judgement}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 하단 액션 ═══ */}
      {rawResult && (
        <div className="flex justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadAllHtml}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 font-bold transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
            HTML 전체 저장
          </button>
          <button
            type="button"
            onClick={() => {
              const epStore = useEditPointStore.getState();
              epStore.reset();
              epStore.setRawEditTable(rawResult);
              epStore.setRawNarration(rawResult);
              useEditRoomStore.getState().setEditRoomSubTab('edit-point-matching');
              useNavigationStore.getState().setActiveTab('edit-room');
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold shadow-lg transition-all transform hover:scale-[1.02]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
            편집실로 보내기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>
        </div>
      )}

      {/* ═══ 비주얼 미리보기 오버레이 ═══ */}
      {previewFrame && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewFrame(null)}
        >
          <div
            className="relative bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden max-w-3xl w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={() => setPreviewFrame(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            {/* 이미지 — hdUrl 우선 사용, 404 시 url 폴백 */}
            <img
              src={previewFrame.frame.hdUrl || previewFrame.frame.url}
              alt="Preview"
              className="w-full h-auto max-h-[70vh] object-contain bg-black"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== previewFrame.frame.url) {
                  img.src = previewFrame.frame.url;
                }
              }}
            />
            {/* 정보 바 */}
            <div className="px-4 py-3 bg-gray-800/60 border-t border-gray-700/50">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-bold">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {formatTimeSec(previewFrame.frame.timeSec)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    컷 #{previewFrame.scene.cutNum}
                  </span>
                  <span className="text-gray-500 text-xs truncate max-w-[300px]">
                    {previewFrame.versionTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  {previewFrame.scene.timecodeSource && (
                    <span className="font-mono">소스: {previewFrame.scene.timecodeSource}</span>
                  )}
                  {previewFrame.scene.sourceTimeline && (
                    <span className="font-mono">원본: {previewFrame.scene.sourceTimeline}</span>
                  )}
                </div>
              </div>
              {/* 장면 설명 */}
              {(previewFrame.scene.videoDirection || previewFrame.scene.sceneDesc) && (
                <p className="text-gray-400 text-xs mt-2 leading-relaxed line-clamp-2">
                  {previewFrame.scene.videoDirection || previewFrame.scene.sceneDesc}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoAnalysisRoom;
