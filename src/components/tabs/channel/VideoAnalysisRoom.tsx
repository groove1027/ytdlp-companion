import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { logger } from '../../../services/LoggerService';
import AnalysisLoadingPanel, { notifyAnalysisComplete } from './AnalysisLoadingPanel';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { evolinkChatStream, evolinkVideoAnalysisStream, evolinkNativeStream, evolinkFrameAnalysisStream, getEvolinkKey } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';
import { requestGeminiProxy, extractTextFromResponse, SAFETY_SETTINGS_BLOCK_NONE } from '../../../services/gemini/geminiProxy';

import { showToast } from '../../../stores/uiStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useVideoAnalysisStore } from '../../../stores/videoAnalysisStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { buildVideoAnalysisStylePreset } from '../../../utils/videoStyleExtractor';
import AnalysisSlotBar from './AnalysisSlotBar';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { getYoutubeApiKey, getKieKey, getGoogleGeminiKey, monitoredFetch } from '../../../services/apiService';
import { getQuotaUsage, fetchTimedTranscriptForAnalysis } from '../../../services/youtubeAnalysisService';
import { extractStreamUrl, isYtdlpServerConfigured, getSocialMetadata, downloadSocialVideo, fetchFramesFromServer } from '../../../services/ytdlpApiService';
import CompanionBanner from '../../CompanionBanner';
import { detectPlatform } from '../../../services/videoDownloadService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { detectSceneCuts, mergeWithAiTimecodes } from '../../../services/sceneDetection';
import {
  beginCapCutDirectInstallSelection,
  buildVideoAnalysisSceneLineId,
  getCapCutManualInstallHint,
  installCapCutZipToDirectory,
  installNleViaCompanion,
  isCapCutDirectInstallSupported,
  isCompanionNleAvailable,
  sanitizeProjectName,
} from '../../../services/nleExportService';
import type { EditRoomNleTarget } from '../../../services/nleExportService';
import { transcribeVideoAudio } from '../../../services/gemini/videoAnalysis';
import type { SceneCut } from '../../../services/sceneDetection';
import type {
  VideoAnalysisPreset as AnalysisPreset,
  VideoSceneRow as SceneRow,
  VideoContentIdAnalysis as ContentIdAnalysis,
  VideoVersionItem as VersionItem,
  VideoTimedFrame as TimedFrame,
} from '../../../types';
import {
  EDIT_POINT_PROTOCOL,
  EDIT_POINT_PROTOCOL_SHORT_LABEL,
} from '../../../data/editPointProtocol';
import {
  TIKITAKA_EDIT_POINT_PROTOCOL,
  TIKITAKA_EDIT_POINT_PROTOCOL_SHORT_LABEL,
} from '../../../data/tikitakaEditPointProtocol';
import {
  SHOPPING_SCRIPT_GUIDELINE,
  SHOPPING_SCRIPT_GUIDELINE_SHORT_LABEL,
} from '../../../data/shoppingScriptGuideline';
import { lazyRetry } from '../../../utils/retryImport';
import { runAbortableTaskWithBudget, waitForSoftTimeout } from '../../../utils/asyncBudget';
import { validateSceneTimecodes } from '../../../utils/timecodeValidator';

const ScenarioPreviewPlayer = lazyRetry(() => import('./ScenarioPreviewPlayer'));
const UploadMasterGuide = lazyRetry(() => import('./UploadMasterGuide'));

const REMIX_YOUTUBE_DOWNLOAD_WAIT_BUDGET_SHORT_MS = 25_000;
const REMIX_YOUTUBE_DOWNLOAD_WAIT_BUDGET_LONG_MS = 35_000;
const REMIX_DIARIZATION_WAIT_BUDGET_SHORT_MS = 30_000;
const REMIX_DIARIZATION_WAIT_BUDGET_LONG_MS = 45_000;

// ═══════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════

/** "4.0초" → 4.0 파싱 */
function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*초/);
  return m ? parseFloat(m[1]) : 3;
}

/** TTS용 순수 텍스트 추출: 구두점/기호/화자 라벨 제거 */
function stripForTts(text: string): string {
  return text
    // 화자 라벨 제거: "화자1:", "MC:", "[나레이션]", "(진행자)" 등
    .replace(/^[\[(]?[^\]\):\n]{1,10}[\])]?\s*[:：]\s*/gm, '')
    .replace(/^[\[(][^\]\)]{1,15}[\])]\s*/gm, '')
    // 괄호 안 지시문 제거: (웃으며), [효과음], <강조> 등
    .replace(/[\[(（<][^)\]）>]*[)\]）>]/g, '')
    // 구두점/기호 제거 (한글, 영문, 숫자, 공백만 유지)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    // 다중 공백 → 단일 공백
    .replace(/\s+/g, ' ')
    .trim();
}

/** 숏폼 자막 줄바꿈: ~maxChars자 내외로 자연스러운 단락 분리 */
function breakSubtitleLines(text: string, maxChars: number = 12): string {
  if (text.length <= maxChars) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);
  // 한국어 등 띄어쓰기가 적은 경우: 단어 분할 실패 시 강제 분리
  return lines.map(line => {
    if (line.length <= maxChars) return line;
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += maxChars) {
      chunks.push(line.slice(i, i + maxChars));
    }
    return chunks.join('\n');
  }).join('\n');
}

/** 마크다운 테이블 행 파싱 (티키타카 마스터 편집 테이블 — 6열/7열/8열 자동 감지) */
function parseTikitakaTable(content: string): SceneRow[] {
  const rows: SceneRow[] = [];
  const lines = content.split('\n');

  // 시간 패턴: "3.0초", "2.5s", "4초" 등
  const isDurationPattern = (s: string) => /^\d+(?:\.\d+)?초?s?$/.test(s.trim());
  // 타임코드 패턴: "0:15", "02:15", "0:15~0:18", "원본 02:15" 등
  const hasTimecodePattern = (s: string) => /\d{1,2}:\d{2}/.test(s);
  // 효과태그 패턴: [펀치], [💥쾅!], [동공지진] 등 (모드 태그 [S]/[A]/[N] 제외)
  const isEffectTag = (s: string) => /^\[.+\]$/.test(s.trim()) && !/^\[[SAN]\]$/i.test(s.trim());

  // 헤더에서 효과자막 열 존재 여부 감지
  // [FIX #291 #292] 스낵형 헤더 "자막 내용"도 감지 — 기존에는 "오디오"/"내레이션"만 매칭하여 스낵형 7열 파싱 실패
  const headerLine = lines.find(l => l.includes('|') && /모드/.test(l) && (/오디오/.test(l) || /내레이션/.test(l) || /자막/.test(l)));
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

      // [FIX #293] AI가 8열 테이블 생성 시 열 밀림 자동 교정
      // 증상: 효과자막="-", 예상시간="[태그]", 비디오화면지시="X.X초", 타임코드="화면묘사"
      // 원인: AI가 자막 내용과 효과자막 사이에 빈 열("-")을 추가하여 8열 테이블을 생성
      if (
        isEffectTag(duration) && !isDurationPattern(duration) &&
        isDurationPattern(videoDirection) && !hasTimecodePattern(timecodeSource)
      ) {
        // 열이 1칸 밀렸음 — effectSub 자리에 빈 열("-")이 들어감
        effectSub = duration;        // [펀치] → 효과자막
        duration = videoDirection;    // 4.0초 → 예상 시간
        videoDirection = timecodeSource; // 화면 묘사 → 비디오 화면 지시
        // 8열이면 실제 타임코드가 cells[7]에 있음
        timecodeSource = (cells.length >= 8 ? cells[7] : '') || '';
      }
    } else {
      // 6열 폴백: 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스
      mode = cells[1] || '';
      audioContent = cells[2] || '';
      effectSub = '';
      duration = cells[3] || '';
      videoDirection = cells[4] || '';
      timecodeSource = cells[5] || '';

      // 6열 폴백에서도 열 밀림 교정: AI가 효과자막 없는 7열 생성 시
      if (
        isEffectTag(duration) && !isDurationPattern(duration) &&
        isDurationPattern(videoDirection) && cells.length >= 7
      ) {
        effectSub = duration;
        duration = videoDirection;
        videoDirection = cells[5] || '';
        timecodeSource = cells[6] || '';
      }
    }

    // 이중 언어 분리: "원어 대사" ⟶ "한국어 번역" 또는 [EN] ... → [KR] ...
    let audioContentOriginal: string | undefined;
    const bilingualArrow = audioContent.match(/^(.+?)\s*[⟶→]\s*(.+)$/s);
    if (bilingualArrow) {
      audioContentOriginal = bilingualArrow[1].replace(/^\[?\w{2,3}\]?\s*/, '').trim();
      audioContent = bilingualArrow[2].replace(/^\[?\w{2,3}\]?\s*/, '').trim();
    }

    // 오디오 내용 안에 <효과자막: ...> 태그가 인라인으로 있으면 추출
    if (!effectSub || effectSub === '-') {
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
      cutNum, mode, audioContent, audioContentOriginal, effectSub, duration, videoDirection, timecodeSource: normalizedTc,
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
    // 원본 언어 추출 — "원본 언어: en" 또는 "Detected Language: en"
    const langMatch = content.match(/(?:원본\s*언어|detected\s*lang(?:uage)?)[:\s：]+\s*([a-z]{2,3})/i);
    const detectedLang = langMatch?.[1]?.toLowerCase();
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
        const embedSrc = rawTimeline.match(/\((?:원본[:\s：]*)?(\d{1,2}:\d{2}(?:\.\d+)?\s*[~\-–—/]\s*\d{1,2}:\d{2}(?:\.\d+)?)[^)]*\)/);
        if (embedSrc) {
          sourceTimeline = embedSrc[1].trim();
          timeline = rawTimeline.replace(/\s*\([^)]*\)/, '').trim();
        }
        // 2) 별도 "원본" 필드에서 타임코드 추출 (embedSrc 실패 시 폴백)
        if (!sourceTimeline) {
          const rawSource = extractField(sContent, '원본') || '';
          // 타임코드 패턴만 추출 (MM:SS~MM:SS 또는 M:SS~M:SS)
          const tcMatch = rawSource.match(/(\d{1,2}:\d{2}(?:\.\d+)?)\s*[~\-–—/]\s*(\d{1,2}:\d{2}(?:\.\d+)?)/);
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
      detectedLang,
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

  // 폴백 2.5: 쇼핑형 포맷 — "**N. 제목:** [title]" + ```코드 블록```
  const hasShoppingFormat = /\*{1,2}\d+\.\s*(?:\*{0,2})제목/.test(raw);
  if (hasShoppingFormat) {
    const shopBlocks = raw.split(/\*{1,2}(\d+)\.\s*(?:\*{0,2})제목(?:\*{0,2})[:\s：]+\s*/);
    const shopItems: VersionItem[] = [];
    for (let i = 1; i < shopBlocks.length; i += 2) {
      const n = parseInt(shopBlocks[i], 10);
      if (n > 10 || n < 1) continue;
      const content = shopBlocks[i + 1]?.trim() || '';
      const titleLine = content.split('\n')[0]?.trim().replace(/\*+/g, '').replace(/\[|\]/g, '') || `대본 ${n}`;
      const codeMatch = content.match(/```(?:text)?\s*\n([\s\S]*?)```/);
      const script = codeMatch?.[1]?.trim() || content.split('\n').slice(1).join('\n').trim();
      shopItems.push({ id: n, title: titleLine, concept: script, scenes: [] });
    }
    if (shopItems.length >= 2) return shopItems;
  }

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

/** URL이 YouTube인지 판별 */
function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
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

/** TimedFrame 배열에서 주어진 초에 가장 가까운 프레임 찾기 (최대 거리 제한 적용) */
function matchFrameToTimecode(timeSec: number, frames: TimedFrame[]): TimedFrame | null {
  const MAX_FRAME_MATCH_DISTANCE_SEC = 5;
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDist = Math.abs(best.timeSec - timeSec);
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].timeSec - timeSec);
    if (dist < bestDist) { best = frames[i]; bestDist = dist; }
  }
  return bestDist <= MAX_FRAME_MATCH_DISTANCE_SEC ? best : null;
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
  } catch (e) {
    logger.trackSwallowedError('VideoAnalysisRoom:fetchVideoInfo', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// 정확한 타임코드 프레임 추출 (분석 결과 기반)
// ═══════════════════════════════════════════════════

/**
 * ★ YouTube 스트림 URL 획득 — yt-dlp API 서버 (자체 호스팅)
 */
async function fetchYouTubeStreamUrl(videoId: string): Promise<string | null> {
  if (!isYtdlpServerConfigured()) {
    console.warn('[Frame] yt-dlp API 서버 미설정');
    return null;
  }
  try {
    console.log('[Frame] yt-dlp API 서버 시도');
    const result = await extractStreamUrl(videoId, 'best');
    if (result?.url) {
      console.log('[Frame] ✅ yt-dlp API 성공');
      return result.url;
    }
  } catch (e) {
    console.warn('[Frame] yt-dlp API 실패:', e instanceof Error ? e.message : String(e));
  }
  return null;
}

/**
 * 서버 프록시를 통해 영상 Blob 다운로드 (CORS 완전 우회)
 * YouTube CDN은 CORS 차단 → 서버 프록시(/api/download) 경유
 * 프레임 추출 전용 — 일반 다운로드는 triggerDirectDownload 사용
 */
async function downloadVideoAsBlob(videoId: string): Promise<{ blobUrl: string; blob: Blob; hasAudio: boolean } | null> {
  try {
    // [FIX #316] 1080p 분리 다운로드: 영상(videoOnly) 먼저 → 오디오 병렬 → 클라이언트 머지
    // 서버 ffmpeg 머지 회피 → 502 방지 + 1080p 원본 품질 보장
    console.log('[Frame] ★ 분리 다운로드 시작: 영상(videoOnly) + 오디오 병렬...');
    const { downloadVideoViaProxy, downloadAudioViaProxy } = await import('../../../services/ytdlpApiService');

    // 1단계: 영상 트랙만 다운로드 (videoOnly=true → 서버 머지 없이 1080p 즉시 성공)
    const videoPromise = downloadVideoViaProxy(videoId, 'best', undefined, { videoOnly: true });
    // 2단계: 오디오 트랙 병렬 다운로드 (작으므로 빠름)
    const audioPromise = downloadAudioViaProxy(videoId).catch(e => {
      console.warn('[Frame] 오디오 다운로드 실패 (영상만 사용):', e);
      return null;
    });

    const [videoResult, audioBlob] = await Promise.all([videoPromise, audioPromise]);
    const videoBlob = videoResult.blob;
    console.log(`[Frame] ✅ 영상 다운로드 완료: ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB`);

    // 3단계: 영상+오디오 클라이언트 머지 (mp4box demux → mp4-muxer remux, 품질 손실 0%)
    let finalBlob = videoBlob;
    if (audioBlob && audioBlob.size > 0) {
      try {
        const { mergeVideoAudio } = await import('../../../services/webcodecs/videoDecoder');
        finalBlob = await mergeVideoAudio(videoBlob, audioBlob);
        console.log(`[Frame] ✅ 영상+오디오 머지 완료: ${(finalBlob.size / 1024 / 1024).toFixed(1)}MB`);
      } catch (mergeErr) {
        console.warn('[Frame] 머지 실패 (영상만 사용):', mergeErr);
        // 머지 실패해도 영상만으로 프레임 추출 + NLE 내보내기 가능
      }
    }

    // [FIX #370] 오디오 포함 여부 추적 — NLE 내보내기 시 경고 표시용
    const hasAudio = !!(audioBlob && audioBlob.size > 0 && finalBlob !== videoBlob);

    const blobUrl = URL.createObjectURL(finalBlob);
    logger.registerBlobUrl(blobUrl, 'video', 'VideoAnalysisRoom:downloadVideoAsBlob', finalBlob.size / (1024 * 1024));
    return { blobUrl, blob: finalBlob, hasAudio };
  } catch (e) {
    console.warn('[Frame] ❌ 다운로드 최종 실패:', e);
    return null;
  }
}

async function withAsyncTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`${label} 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

async function downloadSourceVideoForNleExport(
  sourceUrl: string,
  options?: { signal?: AbortSignal },
): Promise<{ blob: Blob; hasAudio: boolean; title: string }> {
  if (isYouTubeUrl(sourceUrl)) {
    const { downloadVideoViaProxy } = await import('../../../services/ytdlpApiService');
    const videoId = extractYouTubeVideoId(sourceUrl) || sourceUrl;
    const { blob, info } = await withAsyncTimeout(
      downloadVideoViaProxy(videoId, '720p', undefined, { signal: options?.signal }),
      180000,
      '원본 영상 다운로드',
    );
    const hasAudio = await verifyBlobHasAudio(blob);
    return { blob, hasAudio, title: info.title || '' };
  }

  const { blob, title } = await withAsyncTimeout(
    downloadSocialVideo(sourceUrl, '720p', undefined, { signal: options?.signal }),
    180000,
    '원본 영상 다운로드',
  );
  const hasAudio = await verifyBlobHasAudio(blob);
  return { blob, hasAudio, title: title || '' };
}

/** 블롭에 실제 오디오 트랙이 있는지 검증 (video element 프로빙 — 짧게 재생 후 확인) */
async function verifyBlobHasAudio(blob: Blob): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.preload = 'auto';
    vid.volume = 0;
    const url = URL.createObjectURL(blob);
    let resolved = false;
    let timeoutId = 0;
    const done = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      try { vid.pause(); } catch { /* noop */ }
      vid.removeAttribute('src');
      vid.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const getDecodedBytes = (): number | null => {
      const decoded = (vid as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
      return typeof decoded === 'number' ? decoded : null;
    };
    const getAudioTrackByCapture = (): boolean | null => {
      const capture = (vid as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream
        ?? (vid as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
      if (!capture) return null;
      try {
        return capture.call(vid).getAudioTracks().length > 0;
      } catch {
        return null;
      }
    };
    // [FIX #862] 타임아웃 8초로 늘림 — 검증 불가 시 false 유지 (캐시 오염 방지)
    timeoutId = window.setTimeout(() => done(false), 8000);
    vid.onloadedmetadata = () => {
      // 1순위: Firefox mozHasAudio
      const moz = (vid as unknown as { mozHasAudio?: boolean }).mozHasAudio;
      if (typeof moz === 'boolean') { done(moz); return; }
      // 2순위: audioTracks API (Safari, Firefox)
      const tracks = (vid as unknown as { audioTracks?: { length: number } }).audioTracks;
      if (tracks != null) { done(tracks.length > 0); return; }
      // 3순위: captureStream의 오디오 트랙 확인
      const captured = getAudioTrackByCapture();
      if (captured != null) { done(captured); return; }
      // 4순위: Chrome webkitAudioDecodedByteCount — 짧게 재생 후 확인
      const decodedBeforePlay = getDecodedBytes();
      if (decodedBeforePlay != null && decodedBeforePlay > 0) { done(true); return; }
      vid.play().then(() => {
        // [FIX #862] 재생 대기 시간 600ms로 증가 — 느린 디코딩 대응
        window.setTimeout(() => {
          const decoded = getDecodedBytes();
          if (decoded != null) { done(decoded > 0); return; }
          const afterPlayCaptured = getAudioTrackByCapture();
          done(afterPlayCaptured ?? false);
        }, 600);
      }).catch(() => {
        const afterFailCaptured = getAudioTrackByCapture();
        done(afterFailCaptured ?? false);
      });
    };
    vid.onerror = () => done(false);
    vid.src = url;
  });
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
 * 정밀 시크 — 키프레임 스냅 보정
 * 1차 시크 후 목표와 1초 이상 차이나면 2차 시크 시도.
 * 버퍼링된 데이터 덕에 2차 시크가 더 정밀하게 동작함.
 */
async function preciseSeek(video: HTMLVideoElement, targetSec: number, timeoutMs = 15_000): Promise<boolean> {
  const attemptSeek = (): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const onSeeked = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        resolve(true);
      };
      setTimeout(() => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        resolve(false);
      }, timeoutMs);
      video.addEventListener('seeked', onSeeked);
    });

  // 1차 시크
  video.currentTime = targetSec;
  const firstSeek = await attemptSeek();
  if (!firstSeek) return false;

  // 키프레임 스냅 보정: 1초 이상 떨어져 있으면 2차 시크
  const drift = Math.abs(video.currentTime - targetSec);
  if (drift > 1.0) {
    console.log(`[Frame] 키프레임 보정: target=${targetSec.toFixed(2)}s, actual=${video.currentTime.toFixed(2)}s, drift=${drift.toFixed(2)}s`);
    video.currentTime = targetSec;
    await attemptSeek(); // 2차 실패해도 1차 결과 사용 가능
  }

  return true;
}

/**
 * 비디오에서 정확한 타임코드 프레임 추출
 * ★ WebCodecs VideoDecoder 우선 (PTS 정밀 매칭, 키프레임 스냅 없음)
 * ★ 미지원 시 기존 canvas 폴백 (키프레임 스냅으로 정밀도 떨어짐)
 */
async function canvasExtractFrames(
  videoUrl: string,
  timecodes: number[],
  isBlob: boolean,
): Promise<TimedFrame[]> {
  // ── WebCodecs 정밀 추출 (Blob URL일 때만) ──
  if (isBlob) {
    try {
      const { webcodecExtractFrames, isVideoDecoderSupported } =
        await import('../../../services/webcodecs/videoDecoder');

      if (isVideoDecoderSupported()) {
        const resp = await fetch(videoUrl);
        const blob = await resp.blob();
        // [FIX #378] WebCodecs 60초 타임아웃
        const WEBCODEC_TIMEOUT_MS = 60_000;
        const frames = await Promise.race([
          webcodecExtractFrames(blob, timecodes),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('WebCodecs 60s timeout')), WEBCODEC_TIMEOUT_MS)),
        ]);
        if (frames.length > 0) {
          console.log(`[Frame] ✅ WebCodecs 정밀 추출 성공: ${frames.length}개 (키프레임 스냅 없음)`);
          logger.unregisterBlobUrl(videoUrl);
          URL.revokeObjectURL(videoUrl);
          return frames;
        }
        console.warn('[Frame] WebCodecs 0개 반환 → canvas 폴백');
      }
    } catch (e) {
      console.warn('[Frame] WebCodecs 실패 → canvas 폴백:', e);
    }
  }

  // ── Canvas 폴백 (기존 방식) ──
  return canvasExtractFramesLegacy(videoUrl, timecodes, isBlob);
}

/**
 * [레거시] Canvas 기반 프레임 추출 — WebCodecs 미지원 시 폴백
 * - Blob URL: createImageBitmap → OffscreenCanvas (고품질, CORS 무관)
 * - 일반 URL: crossOrigin canvas drawImage (CORS 필요)
 */
function canvasExtractFramesLegacy(
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

    const cleanup = () => { if (isBlob) { logger.unregisterBlobUrl(videoUrl); URL.revokeObjectURL(videoUrl); } };

    video.onloadedmetadata = async () => {
      const dur = video.duration;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      // [FIX #394] Infinity/NaN duration 방어
      if (!dur || !isFinite(dur) || dur < 1) { cleanup(); resolve([]); return; }

      // 썸네일: 640px 기준 스케일
      const thumbScale = Math.min(1, 640 / vw);
      const thumbW = Math.round(vw * thumbScale);
      const thumbH = Math.round(vh * thumbScale);
      // HD: 원본 해상도 그대로 (최소 보장 없음 — 원본이 최고 품질)
      const hdW = vw;
      const hdH = vh;

      const frames: TimedFrame[] = [];
      const unique = [...new Set(timecodes.map(t => Math.round(t * 100) / 100))]
        .filter(t => t >= 0 && t <= dur)
        .sort((a, b) => a - b);

      const useImageBitmap = isBlob && typeof OffscreenCanvas !== 'undefined';
      console.log(`[Frame] 추출: ${unique.length}개, 원본=${vw}x${vh}, 썸네일=${thumbW}x${thumbH}, blob=${isBlob}`);

      for (const tc of unique) {
        const seeked = await preciseSeek(video, tc, 15_000);
        if (!seeked) {
          console.warn(`[Frame] 시크 타임아웃: ${tc.toFixed(2)}s — 건너뜀`);
          continue;
        }

        try {
          if (useImageBitmap) {
            // ── 썸네일 (목록 표시용) ──
            const bmpThumb = await createImageBitmap(video, { resizeWidth: thumbW, resizeHeight: thumbH, resizeQuality: 'high' });
            const thumbCanvas = new OffscreenCanvas(thumbW, thumbH);
            const thumbCtx = thumbCanvas.getContext('2d');
            if (!thumbCtx) { bmpThumb.close(); continue; }
            thumbCtx.drawImage(bmpThumb, 0, 0);
            bmpThumb.close();
            const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
            const thumbUrl = await blobToDataUrl(thumbBlob);

            // ── HD (클릭 확대용) — 원본 해상도, 고품질 ──
            const bmpHd = await createImageBitmap(video, { resizeWidth: hdW, resizeHeight: hdH, resizeQuality: 'high' });
            const hdCanvas = new OffscreenCanvas(hdW, hdH);
            const hdCtx = hdCanvas.getContext('2d');
            let hdUrl: string | undefined;
            if (hdCtx) {
              hdCtx.drawImage(bmpHd, 0, 0);
              bmpHd.close();
              const hdBlob = await hdCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.97 });
              hdUrl = await blobToDataUrl(hdBlob);
            } else {
              bmpHd.close();
            }
            frames.push({ url: thumbUrl, hdUrl, timeSec: tc });
          } else {
            // ── Canvas drawImage 폴백 (crossOrigin 필요) ──
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbW;
            thumbCanvas.height = thumbH;
            const thumbCtx = thumbCanvas.getContext('2d');
            if (!thumbCtx) continue;
            thumbCtx.drawImage(video, 0, 0, thumbW, thumbH);
            const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.9);

            const hdCanvas = document.createElement('canvas');
            hdCanvas.width = hdW;
            hdCanvas.height = hdH;
            const hdCtx = hdCanvas.getContext('2d');
            let hdUrl: string | undefined;
            if (hdCtx) {
              hdCtx.drawImage(video, 0, 0, hdW, hdH);
              hdUrl = hdCanvas.toDataURL('image/jpeg', 0.97);
            }
            frames.push({ url: thumbUrl, hdUrl, timeSec: tc });
          }
        } catch (e) {
          const isFatal = e instanceof DOMException && e.name === 'SecurityError';
          logger.trackSwallowedError('VideoAnalysisRoom:extractFrame', e);

          if (isFatal) {
            // CORS 보안 에러 — 이후 프레임도 동일 실패 → 즉시 중단
            console.warn(`[Frame] CORS 보안 에러 at ${tc.toFixed(2)}s — 추출 중단 (확보: ${frames.length}/${unique.length}개)`);
            cleanup();
            resolve(frames);
            return;
          }

          // 일시적 에러 — 해당 프레임만 건너뛰고 계속 진행
          console.warn(`[Frame] 프레임 추출 실패 at ${tc.toFixed(2)}s — 건너뜀 (${e instanceof Error ? e.message : e})`);
          continue;
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
 * 전략: 로컬 디코딩 우선 (컴퓨터 자원 활용, 원본 품질 보장)
 * Layer 1: 스트림 URL → Blob 다운로드 → 로컬 canvas 추출 (CORS 무관, 원본 품질)
 * Layer 2: 스트림 URL → crossOrigin canvas 추출 (Blob 다운로드 실패 시 빠른 폴백)
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
    // 편집실 전달용 Blob 저장
    useVideoAnalysisStore.getState().setVideoBlob(videoSource);
    const blobUrl = URL.createObjectURL(videoSource);
    logger.registerBlobUrl(blobUrl, 'video', 'VideoAnalysisRoom:extractFramesWithFallback');
    const frames = await canvasExtractFrames(blobUrl, timecodes, true);
    if (frames.length > 0) {
      console.log(`[Frame] ✅ 로컬 파일 추출 성공: ${frames.length}개`);
      return frames;
    }
  }

  // ── YouTube/URL: 3중 폴백 (로컬 Blob 우선) ──
  const streamUrl = typeof videoSource === 'string' ? videoSource : null;

  // [FIX #316] Layer 1: streamUrl 없어도 youtubeVideoId만 있으면 다운로드 시도
  // (downloadVideoViaProxy 내부에서 3회 재시도 + 화질 다운그레이드 자동 수행)
  if (youtubeVideoId) {
    console.log('[Frame] Layer 1: 서버 프록시 Blob 다운로드 → 로컬 디코딩 시도 (재시도+화질다운 포함)');
    const dlResult = await downloadVideoAsBlob(youtubeVideoId);
    if (dlResult) {
      useVideoAnalysisStore.getState().setVideoBlob(dlResult.blob, dlResult.hasAudio);
      const layer1 = await canvasExtractFrames(dlResult.blobUrl, timecodes, true);
      if (layer1.length > 0) {
        console.log(`[Frame] ✅ Layer 1 성공 (로컬 Blob): ${layer1.length}개`);
        return layer1;
      }
    }
  }

  // Layer 2: crossOrigin 직접 추출 (Blob 실패 시 빠른 폴백)
  if (streamUrl) {
    console.log('[Frame] Layer 2: crossOrigin 추출 시도');
    const layer2 = await canvasExtractFrames(streamUrl, timecodes, false);
    if (layer2.length > 0) {
      console.log(`[Frame] ✅ Layer 2 성공 (crossOrigin): ${layer2.length}개`);
      return layer2;
    }
  }

  // Layer 3: YouTube 고정 썸네일 (최후 수단 — 모든 재시도 소진 후에만 도달)
  if (youtubeVideoId) {
    console.warn('[Frame] ⚠️ Layer 3: 모든 다운로드 재시도 실패 → YouTube 썸네일 최후 폴백');
    const layer3 = buildYouTubeThumbnailFallback(youtubeVideoId, timecodes, durationSec);
    console.log(`[Frame] Layer 3 폴백: ${layer3.length}개 (정적 썸네일)`);
    return layer3;
  }

  return [];
}

const PER_CALL_SAFE_LIMIT = 55000;
const MIN_COMPLETE_SCENES_PER_VERSION = 2;

function finalizeVersionedPrompt(
  prompt: string,
  versionStart: number,
  versionCount: number,
): string {
  if (versionCount < 1) return prompt;

  const versionEnd = versionStart + versionCount - 1;
  const secondVersion = Math.min(versionStart + 1, versionEnd);
  let finalizedPrompt = prompt.replace(/---VERSION 1---/g, `---VERSION ${versionStart}---`);

  if (versionCount > 1) {
    finalizedPrompt = finalizedPrompt.replace(/---VERSION 2---/g, `---VERSION ${secondVersion}---`);
  } else {
    // 1개만 생성하는 배치: VERSION 2 예시 행 제거 (AI 혼란 방지)
    finalizedPrompt = finalizedPrompt.replace(/\n.*---VERSION 2---.*$/gm, '');
  }
  if (versionStart !== 1) {
    finalizedPrompt = finalizedPrompt
      .replace(/VERSION 1은/g, `VERSION ${versionStart}은`)
      .replace(/VERSION 2는/g, `VERSION ${secondVersion}는`)
      .replace(/VERSION 2가/g, `VERSION ${secondVersion}가`);
  }

  finalizedPrompt = finalizedPrompt.replace(
    new RegExp(`---VERSION ${versionCount}---`, 'g'),
    `---VERSION ${versionEnd}---`,
  );

  const rangeLabel = versionCount === 1
    ? `---VERSION ${versionStart}--- 1개만`
    : `---VERSION ${versionStart}---부터 ---VERSION ${versionEnd}---까지 총 ${versionCount}개만`;
  const numberRangeLabel = versionCount === 1 ? `${versionStart}` : `${versionStart}~${versionEnd}`;
  return `${finalizedPrompt}

### 🔢 이번 호출의 VERSION 범위 (최우선 적용)
- 이번 호출에서는 ${rangeLabel} 생성하세요.
- VERSION 번호를 1부터 다시 시작하지 말고, 반드시 ${numberRangeLabel} 범위를 사용하세요.
- 누락/중복 없이 순서대로 출력하고, 지정 범위를 벗어나는 VERSION은 생성하지 마세요.`;
}

function trimTrailingIncompleteVersions(items: VersionItem[]): { versions: VersionItem[]; removedCount: number } {
  const trimmed = [...items];
  let removedCount = 0;
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].scenes.length < MIN_COMPLETE_SCENES_PER_VERSION) {
    trimmed.pop();
    removedCount += 1;
  }
  return { versions: trimmed, removedCount };
}

function normalizeBatchVersionIds(
  items: VersionItem[],
  versionOffset: number,
  batchVersionCount: number,
): VersionItem[] {
  if (items.length === 0) return [];

  const startId = versionOffset + 1;
  const endId = versionOffset + batchVersionCount;
  const usedIds = new Set<number>();
  const normalized: VersionItem[] = [];
  const nextAvailableId = () => {
    for (let id = startId; id <= endId; id += 1) {
      if (!usedIds.has(id)) return id;
    }
    return endId + normalized.length + 1;
  };

  for (const item of items) {
    if (normalized.length >= batchVersionCount) break;

    const candidates = [
      item.id >= startId && item.id <= endId ? item.id : undefined,
      item.id >= 1 && item.id <= batchVersionCount ? versionOffset + item.id : undefined,
    ].filter((value): value is number => typeof value === 'number');

    const normalizedId = candidates.find(candidate => !usedIds.has(candidate)) ?? nextAvailableId();
    usedIds.add(normalizedId);
    normalized.push(normalizedId === item.id ? item : { ...item, id: normalizedId });
  }

  return normalized.sort((a, b) => a.id - b.id);
}

/** 분석 결과(versions)에서 모든 타임코드를 초 단위로 수집 (정밀 추출) */
function collectTimecodesFromVersions(versions: VersionItem[], durationSec?: number): number[] {
  const raw: number[] = [];
  versions.forEach(v => v.scenes.forEach(s => {
    // timecodeSource: "00:03.200 / 00:15.800" 또는 "00:03~00:07"
    const tc = s.timecodeSource || s.sourceTimeline || '';
    const parts = tc.split(/[/,]/);
    parts.forEach(p => {
      const cleaned = p.trim();
      const range = cleaned.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
      if (range) {
        const start = timecodeToSeconds(range[1]);
        const end = timecodeToSeconds(range[2]);
        raw.push(start);
        const mid = (start + end) / 2;
        if (mid > 0) raw.push(mid);
      } else {
        const sec = timecodeToSeconds(cleaned);
        if (sec > 0) raw.push(sec);
      }
    });
    // 배치 타임라인 폴백 — display 코드가 midpoint를 사용하므로 동일하게 추출
    if (s.timeline) {
      const range = s.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
      if (range) {
        raw.push(timecodeToSeconds(range[1]));
        const mid = (timecodeToSeconds(range[1]) + timecodeToSeconds(range[2])) / 2;
        if (mid > 0) raw.push(mid);
      }
    }
  }));

  // 타임코드 검증: NaN/undefined/음수 제거 → 영상 길이 초과 제거
  const valid = raw
    .filter(t => typeof t === 'number' && Number.isFinite(t) && t >= 0)
    .filter(t => !durationSec || t <= durationSec)
    .sort((a, b) => a - b);

  // 0.01초(서브프레임) 이내만 중복 제거 — 모든 장면의 정확한 타임코드 보존
  const deduped: number[] = [];
  for (const t of valid) {
    if (deduped.length === 0 || t - deduped[deduped.length - 1] > 0.01) {
      deduped.push(t);
    }
  }
  return deduped;
}

/**
 * [FIX #312] 보정된 타임코드를 versions의 scenes에 역전파
 * AI 원본 타임코드 → 장면감지 보정 타임코드로 sourceTimeline/timecodeSource 업데이트
 * SRT 생성, 편집실 전달 등 모든 하류 경로에 보정값이 전파됨
 */
function applyCorrectedTimecodes(
  versions: VersionItem[],
  aiTimecodes: number[],
  correctedTimecodes: number[],
): VersionItem[] {
  if (aiTimecodes.length !== correctedTimecodes.length) return versions;
  // AI→보정 매핑 테이블: AI 원본 초 → 보정된 초
  const corrections = new Map<number, number>();
  for (let i = 0; i < aiTimecodes.length; i++) {
    if (Math.abs(aiTimecodes[i] - correctedTimecodes[i]) > 0.05) {
      corrections.set(aiTimecodes[i], correctedTimecodes[i]);
    }
  }
  if (corrections.size === 0) return versions; // 변경 없음

  const fmtTc = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const sStr = s % 1 === 0 ? String(Math.floor(s)).padStart(2, '0') : s.toFixed(1).padStart(4, '0');
    return `${String(m).padStart(2, '0')}:${sStr}`;
  };

  // 가장 가까운 보정 매칭 찾기 (±0.5초 이내)
  const findCorrected = (origSec: number): number | null => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [ai, corr] of corrections) {
      const dist = Math.abs(ai - origSec);
      if (dist < bestDist && dist <= 0.5) { bestDist = dist; best = corr; }
    }
    return best;
  };

  return versions.map(v => ({
    ...v,
    scenes: v.scenes.map(s => {
      const tcStr = s.timecodeSource || s.sourceTimeline || '';
      const range = tcStr.match(/(\d+:\d+(?:\.\d+)?)\s*([~\-–—/])\s*(\d+:\d+(?:\.\d+)?)/);
      if (!range) return s;
      const origStart = timecodeToSeconds(range[1]);
      const origEnd = timecodeToSeconds(range[3]);
      const newStart = findCorrected(origStart);
      const newEnd = findCorrected(origEnd);
      if (newStart === null && newEnd === null) return s;
      const startTc = fmtTc(newStart ?? origStart);
      const endTc = fmtTc(newEnd ?? origEnd);
      const newTc = `${startTc}${range[2]}${endTc}`;
      return {
        ...s,
        sourceTimeline: s.sourceTimeline ? newTc : s.sourceTimeline,
        timecodeSource: s.timecodeSource ? newTc : s.timecodeSource,
      };
    }),
  }));
}

/**
 * [FIX #394] 영상이 브라우저에서 디코딩 가능한지 빠르게 확인 (최대 5초)
 * loadeddata 이벤트: 첫 프레임 디코딩 완료 시 발생 — loadedmetadata보다 정확한 판별
 * Instagram H.265/HEVC, 비표준 코덱 등 브라우저가 디코딩할 수 없는 영상을 빠르게 감지
 */
function canBrowserDecodeVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => { URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); resolve(false); }, 5_000);

    video.onloadeddata = () => {
      clearTimeout(timer);
      const w = video.videoWidth;
      const h = video.videoHeight;
      cleanup();
      resolve(w > 0 && h > 0);
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(false);
    };
  });
}

/** 업로드 영상에서 프레임 추출 — WebCodecs 우선, canvas 폴백 */
async function extractVideoFrames(file: File, sourceIndex?: number): Promise<TimedFrame[]> {
  // [FIX #394] 빠른 디코드 프로브 — 브라우저가 프레임 디코딩 가능한지 5초 안에 확인
  // Instagram H.265 등 지원되지 않는 코덱은 여기서 즉시 감지하여 150초 대기 방지
  const canDecode = await canBrowserDecodeVideo(file);
  if (!canDecode) {
    console.warn(`[extractVideoFrames] 디코드 프로브 실패 (${file.name}) → 프레임 추출 스킵, Cloudinary 업로드 폴백`);
    return [];
  }

  // ── WebCodecs 정밀 추출 우선 시도 ──
  try {
    const { webcodecExtractFrames, isVideoDecoderSupported } =
      await import('../../../services/webcodecs/videoDecoder');

    if (isVideoDecoderSupported()) {
      // duration 계산 (WebCodecs에 타임코드 배열 전달용)
      const dur = await getFileDuration(file);
      if (dur && dur > 1) {
        const maxFrameCount = 120;
        const interval = Math.max(0.5, dur / maxFrameCount);
        const count = Math.min(Math.ceil(dur / interval), maxFrameCount);
        const sampleTimecodes = Array.from({ length: count }, (_, i) =>
          Math.min((i + 0.25) * interval, dur - 0.1));

        // [FIX #378] WebCodecs 60초 타임아웃 — 특정 코덱/저사양 GPU에서 영구 대기 방지
        const WEBCODEC_TIMEOUT_MS = 60_000;
        const frames = await Promise.race([
          webcodecExtractFrames(file, sampleTimecodes),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('WebCodecs 60s timeout')), WEBCODEC_TIMEOUT_MS)),
        ]);
        if (frames.length > 0) {
          console.log(`[extractVideoFrames] ✅ WebCodecs 정밀 추출: ${frames.length}개`);
          return frames.map(f => ({
            ...f,
            sourceFileName: file.name,
            sourceIndex: sourceIndex ?? 0,
          }));
        }
      }
    }
  } catch (e) {
    console.warn('[extractVideoFrames] WebCodecs 실패 → canvas 폴백:', e);
  }

  // ── Canvas 폴백 (기존 방식) ──
  return extractVideoFramesLegacy(file, sourceIndex);
}

/** 파일 duration 조회 (WebCodecs 타임코드 계산용) */
function getFileDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    const cleanup = () => { URL.revokeObjectURL(url); };
    video.onloadedmetadata = () => {
      cleanup();
      resolve(isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => { cleanup(); resolve(null); };
    setTimeout(() => { cleanup(); resolve(null); }, 5000);
  });
}

/** [레거시] Canvas 기반 프레임 추출 — WebCodecs 폴백용 */
async function extractVideoFramesLegacy(file: File, sourceIndex?: number): Promise<TimedFrame[]> {
  // [FIX #155] 타임아웃 30→90초로 확대 + 동적 간격으로 영상 전체 커버
  const OVERALL_TIMEOUT_MS = 90_000; // 파일 1개당 최대 90초
  // [FIX #189] 부분 추출 결과를 외부 스코프에 유지 — 타임아웃 시 수집된 프레임 반환
  const partialFrames: TimedFrame[] = [];
  let timedOut = false;
  return Promise.race([
    new Promise<TimedFrame[]>((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      const url = URL.createObjectURL(file);
      logger.registerBlobUrl(url, 'video', 'VideoAnalysisRoom:extractVideoFrames');
      video.src = url;
      video.onloadedmetadata = async () => {
        const dur = video.duration;
        // [FIX #394] Infinity/NaN duration 방어 — fMP4 등에서 발생 가능
        if (!dur || !isFinite(dur) || dur < 1) { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); resolve([]); return; }
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const scale = Math.max(640 / vw, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); resolve([]); return; }
        // [FIX #334] 0.5초 간격 추출 — 2초 간격은 비주얼 누락 + NLE trim 부정확 유발
        const maxFrameCount = 120;
        const interval = Math.max(0.5, dur / maxFrameCount);
        const count = Math.min(Math.ceil(dur / interval), maxFrameCount);
        // [FIX #394] 연속 시크 실패 감지 — 디코딩 불가 영상에서 90초 대기 방지
        let consecutiveSeekFails = 0;
        const MAX_CONSECUTIVE_SEEK_FAILS = 3;
        for (let i = 0; i < count; i++) {
          if (timedOut) break; // [FIX #189] 타임아웃 시 루프 중단
          if (consecutiveSeekFails >= MAX_CONSECUTIVE_SEEK_FAILS) {
            console.warn(`[extractVideoFrames] ${file.name}: 연속 ${MAX_CONSECUTIVE_SEEK_FAILS}회 시크 실패 → 조기 종료 (${partialFrames.length}개 추출)`);
            break;
          }
          const timeSec = Math.min((i + 0.25) * interval, dur - 0.1);
          const seeked = await preciseSeek(video, timeSec, 15_000);
          if (!seeked) {
            consecutiveSeekFails++;
            console.warn(`[extractVideoFrames] 시크 타임아웃: ${timeSec.toFixed(2)}s — 건너뜀 (연속실패 ${consecutiveSeekFails}/${MAX_CONSECUTIVE_SEEK_FAILS})`);
            continue;
          }
          consecutiveSeekFails = 0; // 성공 시 카운터 리셋
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          partialFrames.push({
            url: canvas.toDataURL('image/jpeg', 0.85),
            timeSec,
            sourceFileName: file.name,
            sourceIndex: sourceIndex ?? 0,
          });
        }
        logger.unregisterBlobUrl(url);
        URL.revokeObjectURL(url);
        resolve(partialFrames);
      };
      video.onerror = () => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); resolve([]); };
    }),
    new Promise<TimedFrame[]>((resolve) => {
      setTimeout(() => {
        timedOut = true; // [FIX #189] 추출 루프 중단 신호
        console.warn(`[extractVideoFrames] ${file.name}: ${OVERALL_TIMEOUT_MS / 1000}s 타임아웃 — ${partialFrames.length}개 부분 추출`);
        resolve([...partialFrames]); // [FIX #189] 수집된 프레임 반환 (빈 배열 대신)
      }, OVERALL_TIMEOUT_MS);
    }),
  ]);
}

/**
 * 프레임 기반 멀티모달 분석 — 업로드 영상 전용
 * v1beta inlineData로 base64 프레임 직접 전송
 * (OpenAI 호환 image_url 방식은 400 에러 발생하므로 v1beta 사용)
 */
async function analyzeWithFrames(
  frames: TimedFrame[],
  userPrompt: string,
  scriptSystem: string,
  maxTokens = 40000,
  signal?: AbortSignal,
  temperature = 0.5, // [FIX #364] 롱폼 할루시네이션 방지: 외부에서 effectiveTemp 전달
): Promise<string> {
  // 최대 14프레임, 영상 전체를 균일하게 커버
  const maxFrames = 14;
  const step = Math.max(1, Math.floor(frames.length / maxFrames));
  const selectedFrames = frames.filter((_, i) => i % step === 0).slice(0, maxFrames);

  // base64 data URL에서 inlineData 포맷으로 변환
  const frameData = selectedFrames.map(f => {
    let base64 = '';
    let mimeType = 'image/jpeg';
    if (f.url.startsWith('data:')) {
      const parts = f.url.split(',');
      base64 = parts[1] || '';
      mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    }
    return {
      base64,
      mimeType,
      label: `[프레임 ${formatTimeSec(f.timeSec)}]`,
    };
  }).filter(f => f.base64.length > 0);

  // [FIX #264] URL 기반 프레임(YouTube 썸네일 등)만 있으면 base64 변환 불가 → 명시적 실패
  if (frameData.length === 0) {
    throw new Error('유효한 base64 프레임이 없습니다 (URL 기반 프레임은 변환 불가).');
  }

  const enrichedPrompt = `${userPrompt}\n\n[아래는 영상에서 추출한 ${frameData.length}개 프레임입니다. 각 프레임의 타임스탬프를 참고하여 영상 전체 흐름을 분석해주세요.]`;

  // [FIX #833] Evolink 키 없고 유효한 체험판 유저(만료 X) + Google Gemini 키: requestGeminiProxy 경유
  // KIE-only 유저 또는 만료된 trial 유저는 기존 evolinkFrameAnalysisStream 경로로 진행
  const _trialAuth = (await import('../../../stores/authStore')).useAuthStore.getState().authUser;
  const _isActiveTrial = _trialAuth?.tier === 'trial' && (!_trialAuth.tierExpiresAt || new Date(_trialAuth.tierExpiresAt).getTime() >= Date.now());
  if (!getEvolinkKey() && _isActiveTrial && getGoogleGeminiKey()) {
    const frameParts = frameData.flatMap(f => [
      { text: f.label },
      { inlineData: { mimeType: f.mimeType, data: f.base64 } },
    ]);
    const payload = {
      contents: [{
        role: 'user' as const,
        parts: [
          { text: `${scriptSystem}\n\n${enrichedPrompt}` },
          ...frameParts,
        ],
      }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
    };
    const data = await requestGeminiProxy('gemini-3.1-pro', payload, 0, 120_000, { signal, skipFlashLite: true });
    return extractTextFromResponse(data) || '[]';
  }

  return evolinkFrameAnalysisStream(
    frameData, scriptSystem, enrichedPrompt,
    () => {}, { temperature, maxOutputTokens: maxTokens, signal }
  );
}

/** 타임코드 문자열 → 초 변환 (00:03 → 3, 01:30.500 → 90.5, 00:11.2 → 11.2) */
function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** 분석 장면의 타임코드에서 원본 타이밍 구간 추출 */
function parseSceneTimingWindow(scene: SceneRow): { startSec: number; endSec: number; durationSec: number } | null {
  const rawTc = scene.timecodeSource || scene.sourceTimeline || scene.timeline || '';
  const range = rawTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
  if (!range) return null;
  const startSec = timecodeToSeconds(range[1]);
  const endSec = timecodeToSeconds(range[2]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
  return {
    startSec,
    endSec,
    durationSec: Math.max(0.1, endSec - startSec),
  };
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

/** SRT 레이어 타입: dialogue=일반자막, effect=효과자막, combined=통합(기존 호환) */
type SrtLayer = 'dialogue' | 'effect' | 'combined';

/** SceneRow 배열 → SRT 파일 내용 생성 (프리셋별 최적화 + 레이어 분리 + 숏폼 줄바꿈) */
function generateSrt(
  scenes: SceneRow[],
  isTikitaka: boolean = false,
  layer: SrtLayer = 'combined',
  shortFormBreak: boolean = false,
  preset?: AnalysisPreset,
): string {
  const applyBreak = (t: string) => shortFormBreak ? breakSubtitleLines(t, 12) : t;

  // 프리셋별 메인 텍스트 소스 우선순위
  const getMainText = (scene: SceneRow): string => {
    if (preset === 'snack') return scene.dialogue || scene.audioContent || scene.sceneDesc;
    return scene.audioContent || scene.dialogue || scene.sceneDesc;
  };

  const getLayerText = (scene: SceneRow): string => {
    switch (layer) {
      case 'dialogue':
        return applyBreak(getMainText(scene));
      case 'effect':
        return applyBreak(scene.effectSub || '');
      case 'combined':
      default:
        return scene.effectSub
          ? `${applyBreak(scene.effectSub)}\n${applyBreak(getMainText(scene))}`
          : applyBreak(getMainText(scene));
    }
  };

  if (isTikitaka) {
    let accTime = 0;
    const entries = scenes.map((scene, i) => {
      const dur = parseDuration(scene.duration);
      const start = accTime;
      accTime += dur;
      const text = getLayerText(scene);
      if (!text) return null;
      return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(accTime)}\n${text}`;
    }).filter(Boolean);
    // 효과자막 레이어에서 빈 항목 제거 후 인덱스 재정렬
    return entries.map((entry, i) => {
      const parts = (entry as string).split('\n');
      parts[0] = String(i + 1);
      return parts.join('\n');
    }).join('\n\n');
  }
  // 스낵형: 원본 타임코드 우선, 없으면 배치 타임코드 폴백
  const entries = scenes.map((scene, i) => {
    // [FIX #664] `/` 구분자 지원
    const srcTc = scene.sourceTimeline || scene.timeline;
    const parts = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
    const start = parts ? timecodeToSeconds(parts[1]) : i * 3;
    const end = parts ? timecodeToSeconds(parts[2]) : (i + 1) * 3;
    const text = getLayerText(scene);
    if (!text) return null;
    return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}\n${text}`;
  }).filter(Boolean);
  return entries.map((entry, i) => {
    const parts = (entry as string).split('\n');
    parts[0] = String(i + 1);
    return parts.join('\n');
  }).join('\n\n');
}

/** SRT 파일 다운로드 */
function downloadSrt(content: string, filename: string) {
  // SRT는 BOM 필요 (자막 호환)
  const blob = new Blob(['\uFEFF' + content], { type: 'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  logger.registerBlobUrl(url, 'other', 'VideoAnalysisRoom:downloadSrt');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }, 5000);
}

/** 파일 다운로드 헬퍼 */
function downloadFile(content: string, filename: string, mime: string) {
  // HTML 등 일반 파일에는 BOM 불필요
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  logger.registerBlobUrl(url, 'other', 'VideoAnalysisRoom:downloadFile');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }, 5000);
}

/** 소스 영상 Blob에서 지정 구간들의 오디오를 추출 → 단일 AudioBuffer로 합성 */
async function extractAudioSegments(
  videoBlob: Blob,
  segments: { startSec: number; durationSec: number }[],
): Promise<AudioBuffer> {
  const audioCtx = new OfflineAudioContext(2, 48000, 48000); // 디코딩 전용 (1초 버퍼)
  const arrayBuf = await videoBlob.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(arrayBuf);

  const totalDuration = segments.reduce((s, seg) => s + seg.durationSec, 0);
  const sampleRate = decoded.sampleRate;
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const channels = decoded.numberOfChannels;

  const offCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);
  let offset = 0;
  for (const seg of segments) {
    const startSample = Math.floor(seg.startSec * sampleRate);
    const durSamples = Math.ceil(seg.durationSec * sampleRate);
    const safeDur = Math.min(durSamples, decoded.length - startSample);
    if (safeDur <= 0) { offset += seg.durationSec; continue; }
    const src = offCtx.createBufferSource();
    const segBuf = offCtx.createBuffer(channels, safeDur, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const srcData = decoded.getChannelData(ch);
      const dstData = segBuf.getChannelData(ch);
      dstData.set(srcData.subarray(startSample, startSample + safeDur));
    }
    src.buffer = segBuf;
    src.connect(offCtx.destination);
    src.start(offset);
    offset += seg.durationSec;
  }
  return offCtx.startRendering();
}

/** 편집 영상과 싱크 맞는 SRT 생성 (프리셋별 최적화 + 레이어 분리 + 숏폼 줄바꿈) */
function generateSyncedSrt(
  scenes: SceneRow[],
  segmentDurations: number[],
  layer: SrtLayer = 'combined',
  shortFormBreak: boolean = false,
  preset?: AnalysisPreset,
): string {
  const applyBreak = (t: string) => shortFormBreak ? breakSubtitleLines(t, 12) : t;
  const getMainText = (scene: SceneRow): string => {
    if (preset === 'snack') return scene.dialogue || scene.audioContent || scene.sceneDesc;
    return scene.audioContent || scene.dialogue || scene.sceneDesc;
  };
  const getLayerText = (scene: SceneRow): string => {
    switch (layer) {
      case 'dialogue': return applyBreak(getMainText(scene));
      case 'effect': return applyBreak(scene.effectSub || '');
      case 'combined':
      default: return scene.effectSub
        ? `${applyBreak(scene.effectSub)}\n${applyBreak(getMainText(scene))}`
        : applyBreak(getMainText(scene));
    }
  };
  let accTime = 0;
  const entries = scenes.map((scene, i) => {
    const dur = segmentDurations[i] ?? parseDuration(scene.duration);
    const start = accTime;
    accTime += dur;
    const text = getLayerText(scene);
    if (!text) return null;
    return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(accTime)}\n${text}`;
  }).filter(Boolean);
  return entries.map((entry, i) => {
    const parts = (entry as string).split('\n');
    parts[0] = String(i + 1);
    return parts.join('\n');
  }).join('\n\n');
}

/** 분석 결과 → 스탠드얼론 HTML 문서 생성 */
function generateAnalysisHtml(
  versions: VersionItem[],
  preset: AnalysisPreset,
  thumbnails: TimedFrame[],
  sourceInfo: string,
  guideAiResult?: string,
): string {
  const isTk = true; // 모든 프리셋 통일: 7열 마스터 편집 테이블
  const presetLabel = preset === 'tikitaka' ? '티키타카 편집점' : preset === 'condensed' ? '축약 리캡' : preset === 'shopping' ? '쇼핑형 편집점' : preset === 'deep' ? '심층 분석' : preset === 'alltts' ? 'All TTS' : '스낵형 편집점';
  const presetColor = preset === 'tikitaka' ? 'blue' : preset === 'condensed' ? 'emerald' : preset === 'shopping' ? 'orange' : 'amber';
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
          const range = s.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
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
      <div class="version-header" onclick="handleVersionClick(event,${v.id})">
        <span class="vnum" style="background:${c.numBg}">${v.id}</span>
        <span class="vtitle">${escHtml(v.title)}</span>
        <span class="copy-title" onclick="copyTitle(event,this)" data-title="${escHtml(v.title)}" title="제목 복사">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </span>
        ${v.scenes.length > 0 ? `<span class="vcount">${v.scenes.length}컷</span>` : ''}
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 9l-7 7-7-7"/></svg>
      </div>
      <div class="version-body" id="vbody-${v.id}" style="display:none">
        ${v.concept ? `<p class="concept">${escHtml(v.concept)}</p>` : ''}
        ${v.rearrangement ? `<p class="rearrange"><span class="rearrange-label">재배치:</span> ${escHtml(v.rearrangement)}</p>` : ''}
        ${cidHtml}
        ${tableHtml}
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
.vtitle{flex:1;font-size:.9rem;font-weight:700;color:#f3f4f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:text;cursor:text}
.copy-title{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;cursor:pointer;flex-shrink:0;opacity:0;transition:opacity 0.15s,background 0.15s}
.version-header:hover .copy-title{opacity:1}
.copy-title:hover{background:rgba(59,130,246,0.3)}
.copy-title.copied{background:rgba(34,197,94,0.2);border-color:rgba(34,197,94,0.4);color:#22c55e}
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
  ${guideAiResult ? `
  <div style="margin-top:32px;padding:24px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.2);border-radius:16px">
    <h2 style="font-size:16px;font-weight:bold;color:#60a5fa;margin:0 0 16px 0;display:flex;align-items:center;gap:8px">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:8px;font-size:14px">📋</span>
      업로드 마스터 지침서
    </h2>
    <div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:#d1d5db">${escHtml(guideAiResult)}</div>
  </div>` : ''}
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
// 제목 복사
function copyTitle(e, el) {
  e.stopPropagation();
  var title = el.getAttribute('data-title');
  navigator.clipboard.writeText(title).then(function() {
    el.classList.add('copied');
    el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    setTimeout(function() {
      el.classList.remove('copied');
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    }, 1500);
  });
}

// 아코디언 토글 (제목 텍스트 선택 시 토글 방지)
function handleVersionClick(e, id) {
  if (e.target.closest('.copy-title')) return;
  if (e.target.classList.contains('vtitle') && window.getSelection().toString().length > 0) return;
  toggleVersion(id);
}

function toggleVersion(id) {
  var all = document.querySelectorAll('.version');
  all.forEach(function(el) {
    var vid = parseInt(el.getAttribute('data-id'));
    if (vid === id) {
      el.classList.toggle('expanded');
      var body = document.getElementById('vbody-' + id);
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

const TIKITAKA_REBUILDING_SYSTEM = `# 📜 범용 티키타카 스크립트 리빌딩 프로토콜 v13.0 (10 Viral Patterns & Creator Shorts/Long-form Edition)

## [System Role]
너는 입력된 **모든 종류의 영상 스크립트(예능, 드라마, 인터뷰, 영화리뷰 등)**를 분석하여, 오디오의 **시간 순서(Timeline)**를 극적으로 재조립하는 **'유니버설 비선형 편집 아키텍트'이자 '천재적인 바이럴 디렉터'**다.
너의 임무는 지루한 시간 흐름을 뒤섞어 오프닝(최초 3초)부터 시청자를 멱살 잡고 끌고 가는 압도적인 몰입감을 선사하는 것이다.
또한, 원본 대본의 특성(내레이션 유무, 예능 vs 영화)에 따라 **[100% 전수 보존]**, **[핵심 하이라이트 압축 추출]**, 그리고 **[롱폼 스토리텔링 창조]**를 유연하게 스위칭하며, 몰입도를 극대화할 **예능형 효과자막**과 **접착용 티키타카 내레이션**을 적재적소에 창조해야 한다. 유튜브와 숏폼 알고리즘이 가장 사랑하는 '도파민 터지는 텐션'과 '댓글을 유발하는 떡밥'을 완벽하게 계산하여 결과물을 도출하라.

---

##[제1원칙: 대본 유형별 오디오 보존 및 추출 법칙 (Dynamic Audio Policy)]
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

##[제2원칙: 타임라인 강제 붕괴 및 후킹 (Timeline Scrambling & 3-Second Hook)]
*   **실행:** 원본의 시간 순서(기-승-전-결)를 물리적으로 산산조각 낸다. 선형적 서사는 절대 금지한다.
*   **패턴 (마의 3초 룰):** 반드시 **[결말 / 하이라이트 / 가장 충격적인 대사 / 가장 어이없는 망언]**을 오프닝(0초~3초)에 전진 배치하거나, **[가장 자극적인 갈등]**을 먼저 터뜨린 후 과거(발단)로 돌아가는 '인 미디어스 레스(In medias res)' 구성을 취한다.
*   **목표:** 배열 순서(Sequence)를 바꿔 오디오 핑거프린트 매칭(Content ID)을 완벽히 회피함과 동시에, 시청자의 엄지손가락을 멈추게 만들어 초반 이탈률을 0%에 수렴하게 만든다.

##[제3원칙: 나노 단위 티키타카 및 페르소나 내레이션 (Nano Tiki-Taka & Persona)]
*   **구조:** **[내레이션]**은 오디오 사이의 문맥을 이어주는 '접착제' 역할만 수행한다. 절대 내레이션이 길어지거나 설명충이 되어서는 안 된다. (단, 모드 C의 영화 리뷰 스토리텔링 시에는 극적 긴장감을 높이는 섬세한 묘사 허용)
*   **배치 (0.1초 컷 편집):** 내레이션이 상황을 정리하자마자 0.1초의 틈도 없이 원본 오디오(대사)가 칼같이 치고 들어와야 한다.
    *   *형식:* [내레이션] -> [대사 A] -> [내레이션] -> [대사 B] -> [대사 C] -> [내레이션] ...
*   **찰진 접착 내레이션 창조:** 특히 '모드 B, C(무내레이션 대본)'의 경우, 추출된 핵심 대사들 사이의 빈 공간이 어색하지 않도록 상황을 감칠맛 나게 중계하거나 텐션을 끌어올리는 내레이션을 너가 직접 창작하여 삽입해야 한다.
    *   *내레이션 톤앤매너:* 때로는 시니컬한 관찰자처럼, 때로는 텐션 높은 예능 MC처럼, 때로는 시청자의 마음을 대변하는 댓글러나 흡입력 있는 무비 텔러처럼 변칙적인 페르소나를 부여하여 재미를 극대화하라.

##[제4원칙: 예능형 효과자막 극대화 (Effect-Subtitles Maximization)]
*   **개념:** 하단의 기본 대사 자막이 아닌, 상황과 감정을 시각적·청각적으로 증폭시켜 화면 중앙이나 측면에 크게 띄우는 예능/영화리뷰형 강조 자막이다.
*   **적용:** 대사나 내레이션이 진행될 때, 시청자의 흥미와 몰입을 극대화할 수 있는 감정, 상황 설명, 태클 등의 요소를 캐치하여 대본 내에 \`<효과자막: ...>\` 형태로 적극 삽입한다.
    *   *확장 예시 (감정):* \`[부들부들]\`, \`(말문 막힘)\`, \`[동공지진 5.0]\`, \`(깊은 빡침)\`
    *   *확장 예시 (상황/태클):* \`(팩트폭행)\`, \`[갑분싸]\`, \`[갑자기 급발진?]\`, \`(이걸 이렇게 포장한다고?)\`
    *   *확장 예시 (연출/BGM):* \`[정적...]\`, \`(BGM: 웅장하고 비장한 음악)\`, \`[화면 흑백 전환]\`, \`[삐- 처리]\`

---

##[작업 프로세스 (Universal Workflow)]

### 1단계: 소스 오디오 자동 인덱싱 및 도파민 핵심 선별 (Auto-Indexing & Filtering)
*   입력된 원본을 분석하여 오디오 클립으로 정밀 분해한다. 내레이션이 없는 대본이라면, 조회수를 견인할 수 있는 가장 자극적이고 재밌는 '도파민 클립'만 필터링하여 남긴다. 평범한 인삿말이나 루즈한 빌드업은 철저히 배제한다. (모드 C의 경우 스토리 연결에 필수적인 대사 포함)

### 2단계: 비선형 재조립 전략 수립 (Scrambling Strategy - 10가지 바이럴 패턴)
*   선별된 클립을 가장 조회수가 잘 나오는 아래 **10가지의 서로 다른 구체적인 바이럴 패턴**으로 각각 1번부터 10번까지 매칭하여 재배치한다.
    *   *전략 1 (결말 선공개형):* [결말/최고조 대사] → [발단] →[전개] →[위기]
    *   *전략 2 (충격 폭로형):*[결정적 폭로/망언] → [주변인 경악 리액션] →[사건의 전말(과거)] → [결말]
    *   *전략 3 (감정 폭발형):*[가장 분노/오열/웃는 대사] →[왜 이렇게 됐는지 이유 설명] →[결말]
    *   *전략 4 (인지부조화/급발진형):*[가장 평온한 대사] →[0.1초 만에 갑작스러운 파국/갈등 대사] → [발단]
    *   *전략 5 (미스터리 떡밥형):* [의문스러운 한마디] →[내레이션의 추리/질문] →[진실 폭로(하이라이트)]
    *   *전략 6 (제3자 관찰자/리액션 먼저형):*[주변인/패널의 황당해하는 리액션] → [메인 화자들의 갈등] →[일침/결론]
    *   *전략 7 (타임어택 카운트다운형):*[파국 직전의 긴박한 대사] → [내레이션: "정확히 X시간 전"] →[점층적 갈등 고조]
    *   *전략 8 (시점 교차/핑퐁형):* [A의 변명/주장] → [B의 반박] →[내레이션 개입] → [진짜 팩트 폭로]
    *   *전략 9 (사이다/참교육형):* [답답한 빌런/고구마 발언] →[참다못한 사이다 일침(하이라이트)] → [당황하는 리액션]
    *   *전략 10 (만약에/분기점형):*[파국 결말] →[내레이션: "이때 이 말을 안 했다면?"] →[결정적 말실수 대사] → [나비효과 폭발]

### 3단계: 접착 내레이션 작성 (Bridging & Pacing)
*   뒤섞이고 압축된 클립들이 롤러코스터처럼 속도감 있게 이어지도록, 각 클립 사이에 짧고 강력한 텐션 유발 내레이션을 삽입한다. 시청자가 영상을 끄고 싶어 할 만한 타이밍에 정확히 내레이션으로 '새로운 떡밥'을 던져 이탈을 방어하라.

---

##[출력 필수 포맷]

### **[포맷: 10가지 고조회수 리빌딩 결과]**

**(아래 형식을 1번부터 10번까지 반복. 각 버전은 위 2단계의 10가지 전략을 순서대로 하나씩 적용하여 서로 완전히 다른 전개 방식과 내레이션 스타일을 가져야 함)**

---

**[버전 N: (적용한 1~10 전략명)]**
**제목:**[유튜브 썸네일용 어그로/후킹 제목 (예: "결국 참다못해 폭발해버린 OO상황", "방송 중 터진 역대급 방송사고" 등)]
**재배치 구조:**[예: ⑤하이라이트 → ②리액션 → ①발단 → ⑥결말 ...]
**대본:**
\`\`\`text
[내레이션]
(오프닝 멘트: 하이라이트 상황을 짧게 암시하며 호기심을 극대화)
<효과자막: 상황을 극대화하는 예능/리뷰형 자막 예: [충격적인 반전! / 🚨실제상황🚨]>

[화자 이름]
"(하이라이트 대사 - 원본에서 추출)"
<효과자막: 화자의 감정이나 묘사 예: (동공지진) / (당황) / (분노 게이지 MAX)>

[내레이션]
(과거 회상 또는 상황 반전 멘트. 시니컬하거나 텐션 높은 페르소나 적용)
<효과자막: 상황 전환을 돕는 자막 예: [사건의 발단은 3시간 전...]>

[화자 이름]
"(발단 대사 - 원본에서 추출)"
<효과자막: 대사에 맞는 감정 예: (억울) / (태연한 척)>[내레이션]
(리액션 유도 또는 갈등 고조 멘트. 다음 대사를 듣고 싶게 만드는 떡밥 투척)
<효과자막: 시청자의 마음을 대변하는 자막 예:[아니 여기서 이런다고?] / (어질어질하다)>[화자/리액션 담당자]
"(리액션/갈등 대사 - 원본에서 추출)"
<효과자막: 리액션 강조 자막 예: (말문 막힘) / (입틀막) /[현실 부정]>

(※ 모드 A는 100% 소진, 모드 B는 숏폼용 핵심 압축, 모드 C는 롱폼용 스토리텔링 내레이션 강화 방식을 적용하여 내레이션+대사+효과자막의 쉴 틈 없는 티키타카 반복)
\`\`\`

**[Content ID 회피 및 바이럴 정밀 분석]**
*   텍스트 일치율:[0.0~1.0]% (낮을수록 좋음)
*   구조 유사도:[0.0~1.0]%
*   순서 유사도:[0.0~1.0]%
*   키워드 변형률:[90.0~100.0]% (높을수록 좋음)
*   🛡️ **최종 안전 등급**: **[매우 안전 / 안전 / 보통]**
*   🚀 **바이럴 예상 포인트**: "[예: 오프닝의 팩트폭행 대사가 알고리즘을 타기 매우 좋으며, 후반부 반전 내레이션이 댓글 토론을 유발함]"
*   🔎 **판정 코멘트**: "[해당 대본에 적용된 구체적인 회피 전략과 차별점 한 줄 요약]"`;

const TIKITAKA_SCRIPT_SYSTEM = `${TIKITAKA_REBUILDING_SYSTEM}

---

${TIKITAKA_EDIT_POINT_PROTOCOL}`;

const SNACK_BASE_SYSTEM = `# Role: 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v. 11.0 (자막 전용 — NO TTS)

## 1. 프로젝트 개요
당신은 유튜브 쇼츠, 틱톡, 릴스 등 숏폼 플랫폼에서 수백만 조회수를 기록하는 '바이럴 콘텐츠 전문 PD'입니다. 사용자로부터 [영상 파일, 영상 링크, 대본, 이미지 시퀀스] 중 하나를 입력받으면, 이를 분석하여 시청 지속 시간(Retention)을 극대화할 수 있는 **[제목 10선]**과 **[나노 단위 비선형 컷 편집 및 이원화 자막 지침서]**를 작성해야 합니다.

---

## ⚠️ 최상위 절대 규칙: 나레이션(TTS) 완전 배제 — 자막 전용 편집
**이 프리셋은 나레이션(TTS 음성)을 일절 사용하지 않습니다.**
- 모든 오디오는 **원본 현장음([S])** 또는 **현장 액션음([A])**만 사용합니다.
- 시청자에게 전달할 정보(후킹 카피, 설명, 드립)는 오직 **화면 자막**으로만 처리합니다.
- **[N] 모드(나레이션) 사용 절대 금지** — 편집 테이블에 [N] 행이 단 1개라도 있으면 전체 폐기.
- 자막 내용 열에는 **하단 기본 자막(16자 이내 + 이모지)**을 기입합니다.

---

## 2. 핵심 목표 (Mission)
1. **Hooking & Non-linear (후킹과 비선형 재배치):** 썸네일과 제목, 초반 3초에서 시청자의 이탈을 막는다. **절대 원본 영상의 시간 흐름(순차적)대로 편집하지 마라.** 원본에서 가장 바이럴하고 자극적인 펀치라인/클라이맥스를 무조건 맨 앞(0~3초)에 선배치하고, 그 이후에도 텐션이 떨어지지 않게 원본의 타임라인을 완전히 뒤섞어(비선형 재배치) 시청자를 쉴 틈 없이 몰아쳐야 한다.
2. **Pacing (속도감):** 지루한 롱테이크(Long-take)는 과감히 삭제하고, 핵심 장면(Highlight) 위주로 2~3초 단위의 속도감 있는 편집을 설계한다.
3. **Coverage (완전성):** 영상에 등장하는 **모든 소재(음식, 동물, 인물, 상황 등)가 최소 1회 이상 등장**해야 한다. (하나라도 누락 금지)
4. **Witty (재치 & 이원화 자막):** MZ세대 트렌드와 밈(Meme)을 반영한 16자 이내의 간결하고 임팩트 있는 '하단 기본 자막'과, 영상 상황 자체를 극대화하는 큼직한 '효과 자막(중앙 연출용)'을 동시에 기획한다. **모든 정보 전달은 이 자막으로만 이루어진다.**
5. **Coherence (내용 일관성 — 최우선):** 편집 순서는 뒤섞되, **각 컷의 자막과 설명은 해당 장면에서 실제로 일어나는 상황을 정확히 반영**해야 한다. 원본에 없는 내용을 지어내거나, 장면과 무관한 자막을 다는 것은 절대 금지. 리메이크란 '편집 방식의 변경'이지 '내용의 날조'가 아니다.

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
    - 1번 컷 이후에도 원래 시간 순서로 돌아가지 마라. 1순위 장면, 2순위 장면들을 교차로 배치하여 텐션이 롤러코스터처럼 요동치게 타임라인을 완전히 해체하고 재조립한다.
    - 하나의 컷은 가급적 **2~4초를 넘기지 않는다.**
    - 롱테이크(지루하게 이어지는 장면)는 건너뛰고, **동작의 정점(Climax)이나 표정 변화가 확실한 구간**만 타임스탬프로 지정한다.
    - 단순 나열이 아니라, 화면 전환(Transition)이 자연스럽게 이어지도록 배치한다.
- **자막 이원화 규칙 (Subtitle Rule) — 나레이션 대신 자막이 모든 정보를 전달:**
    - **효과 자막 (화면 내 연출 자막):** 영상 자체의 상황, 타격감, 감정 등을 묘사하는 큼직한 예능형 텍스트 (예: 💥쾅!, ㅋㅋㅋ, 😳동공지진, 물음표?). 화면 중앙이나 피사체 옆 등 시각적으로 가장 눈에 띄는 곳에 배치하도록 묘사한다.
    - **하단 기본 자막 (길이 및 내용):** 공백 포함 **16자 이내** (모바일 가독성 최적화). **반드시 해당 장면에서 실제로 일어나는 상황을 정확히 반영**하되, 시청자 반응형(Reaction)이나 감탄/공감 멘트로 작성. 문장 끝에 적절한 이모지 1개를 필수 포함.
    - **나레이션이 할 역할을 자막이 대신한다:** 후킹 카피, 상황 설명, 드립은 모두 하단 기본 자막에 텍스트로 기입한다.

---

## 4. 출력 형식 (Output Format)
*반드시 아래 형식을 지켜서 출력하시오. (주의: 컷 순서는 원본 영상의 시간 순서가 아니라, 임팩트 순으로 완전히 뒤섞인 상태여야 합니다!)*

각 버전은 고유한 후킹 전략, 톤, 편집 방향으로 차별화합니다.
**모든 모드는 [S] 또는 [A]만 사용. [N] 사용 시 전체 폐기.**

---

## 5. 예외 처리 (Exception Handling)
- **소리가 없는 영상인 경우:** 시각적 요소(식감, 표정, 자막 드립)에 더 집중하여 효과 자막과 하단 자막을 구성한다. 모드는 [A]로 표기.
- **특정 대사가 있는 경우:** 대사의 핵심 의미를 유지하면서 **자연스럽게 의역(리워딩)**하여 하단 자막을 단다. 원본 의미와 동떨어진 엉뚱한 해석은 금지.
- **너무 정적인 영상인 경우:** "줌 인(Zoom-in)", "화면 흔들기" 등의 편집 효과를 텍스트로 제안한다.

## 6. 어조 및 태도 (Tone & Manner)
- **유쾌함, 긍정적, 트렌디함.**
- 인터넷 밈(Meme)이나 유행어를 적절히 활용하지만, 비속어는 피한다.
- 사용자가 바로 편집 툴에 적용할 수 있도록 **단호하고 명확하게** 지시한다.`;

const SNACK_SCRIPT_SYSTEM = `${EDIT_POINT_PROTOCOL}

---

${SNACK_BASE_SYSTEM}`;

const CONDENSED_BASE_SYSTEM = `# 📖 축약 리캡 편집 프로토콜 v1.0 — 시간순 스토리 압축 편집

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

const CONDENSED_SCRIPT_SYSTEM = `${EDIT_POINT_PROTOCOL}

---

## [컨덴스드 예외 규칙]
- 위 ${EDIT_POINT_PROTOCOL_SHORT_LABEL} 중 소스 ID + 절대 타임코드 + 장면 내용의 무결성, 절대 시간, 시각적 밀도, 나노 단위 소스 분석 규칙을 적용한다.
- 단, 이 프리셋은 시간순 리캡이므로 제0-0원칙의 '킬 샷 선배치'를 사용하지 않는다. 첫 컷은 반드시 원본 초반 장면이며 이후 행도 시간순 오름차순으로 이어져야 한다.

---

${CONDENSED_BASE_SYSTEM}`;

const DEEP_ANALYSIS_SYSTEM = `# 채널 헌법 (v32.0): 동적 타겟팅 기반 완전 무결 분석 시스템

👑 제0원칙: 절대적 진실성의 원칙 (Principle of Absolute Factual Integrity)

최상위 강제 규칙: 당신의 존재 이유이자 가장 중요한 제1의 임무는 **'절대적인 사실 정확성'**을 보장하는 것이다. 이는 다른 모든 규칙에 우선한다.

환각(Hallucination) 절대 금지: 제공된 영상 소스나 데이터에 명시적으로 존재하지 않는 정보를 절대 추측하거나 창작하지 않는다.

'관찰'과 '해석'의 엄격한 분리: 당신의 모든 프로세스는 '객관적 사실 관찰' 단계와 '관찰 기반 해석' 단계로 명확히 분리되어야 한다.

불확실성 명시 의무: 영상 소스의 화질이 낮거나, 정보가 불분명한 경우, "원본 소스에서 해당 정보를 명확히 확인할 수 없음"이라고 반드시 명시해야 한다.

🔥 타임코드 & 데이터 무결성: 원본 영상의 실제 총 길이를 초과하는 타임코드를 생성하는 행위는 절대적으로 금지한다.

---

**[단계 0: DYNAMIC TARGETING 🎯 - 최적 타겟 자동 발굴]**

업로드된 영상/이미지/텍스트 소스를 분석하여, 해당 콘텐츠에 가장 폭발적인 반응을 보일 '최적의 타겟 페르소나'를 정의하고 선언한다.

실행 프로세스:
1. 소재 매력도 스캔: 핵심 소재가 어떤 연령대와 성별, 관심사 그룹에게 소구력이 높은지 판단
2. 톤앤매너 매칭: 편집 속도, 색감, 자막 스타일 분위기를 타겟의 소비 성향과 매칭
3. 최종 타겟 선언: 타겟 명칭, 핵심 정체성, 세분화된 관심사, 선호 톤앤매너 확정

이후 모든 분석은 여기서 선언된 타겟을 절대 기준으로 수행한다.

---

[단계 -1: 초정밀 영상 해부 (Microscopic Video Dissection)]

영상 소스를 1프레임(Frame) 단위로 해부하여 모든 시각적, 청각적, 데이터적 단서를 원자 단위로 분해하고 데이터베이스화한다.

🔥 5대 요소 마이크로 데이터 추출:
① 객체/행위 (Object/Action)
② 수치/텍스트 (Numerical/Text Data)
③ 시네마틱 정보 (Cinematic Information)
④ 청각 정보 (Auditory Information)
⑤ 물리적 상호작용 (Physical Interaction)

👑 6. 전문 용어 교차 검증 (Terminology Cross-Verification):
1단계 (용어 식별) → 2단계 (피상적 정의) → 3단계 (커뮤니티 표준 검증) → 4단계 (최종 용어 확정)

👑 7. '악마의 변호인' 심층 과학 검증:
1단계 (핵심 원리 식별) → 2단계 (전문가 용어맵 구축) → 3단계 (최악의 시나리오 시뮬레이션) → 4단계 (방어 논리 및 표현 전략 수립)

---

🚨 최종 게이트키핑: 절대 실패 방지 프로토콜 🚨

1단계: 핵심 주장 식별 (Claim Identification)
2단계: 반대 가설 설정 (Counter-Hypothesis Formulation) — 최소 2개 이상
3단계: 반대 가설 기반 재검증 — 시각 정보에 대한 맹신을 절대 금지
4단계: 최종 판결 및 불확실성 명시 — '모른다'고 인정하는 용기를 최우선 가치로 삼는다

---

[단계 0.5: GATEKEEPER 🚨 - 안전성 및 수익성 검토]

📋 체크리스트 A: 커뮤니티 가이드 (스팸, 아동 안전, 노출, 자해, 괴롭힘, 위험 콘텐츠, 규제 상품)
📋 체크리스트 B: 광고주 친화적 콘텐츠 (욕설, 폭력, 성인용, 충격, 증오, 마약, 총기, 논란, 부정직)
📋 체크리스트 C: 성적 콘텐츠 상세 기준 (EDSA 예외 적용)

등급 판정: 🛡️ 채널 안전 [🟢/🔴] + 💰 수익 리스크 [🟢/🟡/🔴] + 솔루션 제안

---

[단계 1: FILTER 🎯 - 타겟 매력도 필터링]

타겟에 대한 매력도 점수 9.5점 이상 시 통과 → 단계 2 진행

---

[단계 2: PRODUCTION ✍️ - 최종 제작 기획서]

**Part 1: 심층 조사 보고서 (Deep Dive Report)**

🔥 다차원 데이터 로그 생성 후, 아래 항목 각각 상세하게 조사:
🔍 이게 무엇인지 (What is this?)
🧑‍🔬 전문 용어 (Terminology)
💡 원리 (Principle)
⚙️ 작동 방식 (How it works?)
🤔 이유 (Why they do this?)
✨ 장점과 단점 (Pros & Cons)
💰 가격 (Cost)
⏳ 시간/기간 (Time/Duration)
❗️관련 유용 정보 (More Detail)

**Part 2: 최종 제작 기획서 (Final Production Blueprint)**

💯 타겟 매력도 점수

✍️ 바이럴 제목 자동 생성 시스템:
[법칙 1: A+B 조합] [법칙 2: 12~18자] [법칙 3: 파워키워드 최소화] [법칙 4: 단정적 평서문]
[법칙 5: 감정 배제] [법칙 6: 명사형 종결] [법칙 7: 부정/금지 후킹] [법칙 8: 의인화/역설]

제목 후보 30개 생성 → 후킹 파워(5점) + 정보 가치(5점) + 타겟 공감대(5점) + 간결성(5점) 평가

📜 60초 Shorts 스토리 구조 선정 (10가지 기승전결 모델 중 최적 1개 선정)

🎤 60초 Shorts 최종 대본 (내레이션 스타일 가이드):
- 오프닝: ~입니다/~합니다/~는데요/~인데요 중 하나로 시작
- 엔딩: 반드시 ~라고 하네요! 로 마무리
- '선언'과 '연결/심화' 어미 교차 사용 (같은 계열 2회 연속 금지)
- 줄바꿈: 오직 ~죠, ~요, ~다, ~데요, ~니다 뒤에서만
- 절대 금지 어미: ~고요, ~겁니다, ~까요, ~네요, ~는요
- 구두점: 마침표/쉼표/작은따옴표 금지, 느낌표(!)만 사용
- 감성적 비유, 호들갑, 오바, 과장 표현 절대 금지

최종 대본은 generate code 블록으로 순수 내레이션 텍스트만 제공

---

[단계 3: EMOTIONAL VARIATIONS 🎭 - 4대 본능 자극 대본 확장]

📜 변주 A: 물욕/탐욕 (Greed & Value) — 가격, 가치, 희소성 관점
📜 변주 B: 본능/매력 (Instinct & Attraction) — 시각적 쾌감, 원초적 아름다움 관점
📜 변주 C: 감동/인간미 (Emotion & Humanity) — 노력, 장인 정신, 역사 관점
📜 변주 D: 분노/사회적 정의 (Anger & Outrage) — 비효율, 위험성, 부조리 관점

공통 규칙: 사실 기반 유지, 스타일 가이드 100% 준수, 표준 대본과 동일 분량

---

🔍 추가 영상 소스 검색 키워드: 한국어 25개 + 영어 25개 마크다운 테이블`;

const SHOPPING_SCRIPT_SYSTEM = `${EDIT_POINT_PROTOCOL}

---

${SHOPPING_SCRIPT_GUIDELINE}`;

const ALL_TTS_SCRIPT_SYSTEM = `# 📜 All TTS형 스크립트 리빌딩 프로토콜 v3.6 (Full Metrics Update)

## [System Role]
너는 알고리즘의 '텍스트 지문(Text Fingerprint)' 및 '논리적 흐름(Logical Flow)' 추적 기술을 역설계하는 **'스크립트 리빌딩(Script Rebuilding) 아키텍트'**다.
단순한 유의어 교체는 알고리즘에 걸린다. 너의 임무는 원본의 **의미(Information)와 총량(Volume)**은 100% 보존하되, **구문 구조(Syntax), 어휘(Lexicon), 그리고 정보의 전개 순서(Sequence)**를 100% 재조립하여 텍스트 유사도(Text Similarity)를 0%에 수렴시키는 것이다.

---

## [핵심 원칙: 4단계 회피 알고리즘]

### 1. 1:1 분량 질량 보존 (Volume Conservation)
*   **절대 원칙**: 원본의 정보량이 100이라면, 결과물도 정확히 100이어야 한다.
*   **금지 사항**: 축약(Summary), 요약(Abstract), 생략(Omission) 절대 금지.
*   **허용 범위**: 문맥을 자연스럽게 잇기 위한 최소한의 수식어 추가는 허용하나, 전체 길이는 원본과 대등해야 한다.

### 2. 구문 및 순서의 파괴적 재조합 (Syntactic & Sequential Deconstruction)
*   **정보 순서 치환 (New)**: 원본의 논리적 전개 순서를 뒤섞는다. 결론을 먼저 제시하거나, 중간의 부연 설명을 앞부분으로 끌어오는 등 '논리적 지문(Logical Fingerprint)'을 완전히 파괴한다.
*   **문장 성분 전복**: '주어+목적어+동사'의 순서를 바꾸거나, 능동태를 수동태로, 평서문을 감탄/의문문으로 변환하여 문장 뼈대를 바꾼다.
*   **N-gram 회피**: 원본과 동일한 단어가 3어절 이상 연속으로 나오지 않도록 끊어낸다.

### 3. 순수 텍스트 전달 (Pure Text Delivery)
*   **이모지 금지**: 대본의 가독성과 TTS(음성 합성) 호환성을 위해 **모든 이모티콘과 불필요한 특수문자 사용을 금지**한다.
*   **구어체 지향**: 오직 글로 쓰인 구어체(Spoken Word) 형식만 유지한다.

---

## [작업 프로세스 (Workflow)]

### **1단계: 프리즘 정밀 타격 및 순서 재배치 (Prism Targeting & Reordering)**
원본을 한 문장씩 뜯어내어 1:1로 대응시키되, 정보의 배열 순서를 의도적으로 재구성한 표를 작성한다.
*   **검증 로직**: 원본 문장의 핵심 키워드가 다른 단어로 대체되었는지, 그리고 정보의 배치 순서가 원본과 달라졌는지 스스로 검증한다.
*   **출력**: 표 하단에 **[코드 블록]**으로 전체 스크립트를 제공한다.

### **2단계: 고조회수 쇼츠 영상 대본 제작 지침서 (The Replicable Success Algorithm) v2.0 적용**
1단계에서 분석된 내용을 바탕으로, 아래의 **6가지 원칙**을 완벽히 적용하여 리빌딩한다.

---

#### **제1원칙: 4단계 '정보 각인' 프로토콜을 따르라**

모든 영상 대본은 아래 4단계 구조를 예외 없이 따른다. 시간 배분을 엄수하라. (원본의 순서가 이 구조와 다르다면, 이 구조에 맞춰 정보를 재배치하라.)

**A단계 : 시각적 충격과 언어적 정의**
*   **목표:** 시청자의 분석적 사고를 차단하고, 현상을 뇌에 각인시킨다.
*   **실행:**
    1.  영상의 가장 충격적이거나 신기한 '결과' 장면을 시작과 동시에 보여준다.
    2.  아래 공식에 맞춰 첫 문장을 작성한다.
        *   \`"이것은 [고유명사/현상]입니다."\`
        *   \`"[결과]가 일어나는 모습입니다."\`
        *   \`"이 사람의 기술은 [최상급 수식어]라고 할 수 있습니다."\`
*   **예시:** (영상: 카멜레온이 순식간에 색을 바꾸는 장면)
    *   **NG:** "카멜레온은 주변 환경에 맞춰 몸 색깔을 바꾸는 파충류입니다." (지루한 설명)
    *   **OK:** "경이로운 수준의 위장술을 보여주는 이 동물은 카멜레온입니다."

**B단계 : 원리 설명으로 지적 만족감 부여**
*   **목표:** '왜?', '어떻게?'에 대한 답을 제공하여 시청자에게 지식 습득의 쾌감을 준다.
*   **실행:**
    1.  A단계 현상의 핵심 원리나 과정을 설명한다.
    2.  전문 용어는 반드시 쉬운 말로 즉시 풀이한다.
    3.  아래 공식을 활용한다.
        *   \`"이게 가능한 이유는 [핵심 원리] 때문인데요."\`
        *   \`"사실 이것은 [전문 용어]라는 것으로, [쉬운 설명]을 하는 원리입니다."\`

**C단계 : '의외성의 한 스푼'으로 깊이를 더하라**
*   **목표:** 단순 정보를 '이야기'로 승격시켜 시청자의 기억에 강하게 남긴다.
*   **실행:** 아래 3가지 유형의 '반전' 중 반드시 하나를 삽입한다.
    1.  **한계/위험성 제시:** "다만 이 기술은 [치명적 단점]이 있어서..."
    2.  **통념 파괴:** "하지만 우리가 알던 것과는 달리, 사실은 [반전 사실]입니다."
    3.  **사회/문화적 맥락 부여:** "안타까운 건 [숨겨진 배경] 때문에..."

**D단계 (마무리): 결론의 증발**
*   **목표:** 명확한 끝맺음 없이 여운을 남겨 영상 반복 재생이나 다음 영상 시청을 유도한다.
*   **실행:** 요약, 정리, 인사 등 모든 종류의 결론을 삭제한다. C단계의 마지막 문장으로 대본을 끝내거나, 아래 '제5원칙'에 따라 마무리한다.

---

#### **제2원칙: 3초 안에 시청자를 포획하는 4대 후킹 공식**

영상의 첫 문장은 아래 4가지 공식 중 가장 적합한 것을 선택하여 제작한다.

1.  **결과 선언형:** (과정 생략, 결과부터 제시)
    *   **공식:** \`"이렇게 [행위]했을 뿐인데, [놀라운 결과]가 만들어집니다."\`
2.  **가치 판단형:** (최상급 표현으로 가치 극대화)
    *   **공식:** \`"이것은 세계에서 가장 [형용사]한 OO입니다."\`
3.  **역설 제시형:** (인지 부조화로 궁금증 유발)
    *   **공식:** \`"왜 [주체]는 [상식 밖의 행동]을 하는 것일까요?"\`
4.  **존재 정의형:** (생소한 대상의 정체 즉시 규정)
    *   **공식:** \`"이것은 [국가/분야]의 [고유명사]라는 것입니다."\`

---

#### **제3원칙: '지식 큐레이터'의 어휘 팔레트를 사용하라**

아래 단어들을 문맥에 맞게 사용하여 채널의 전문성과 신뢰도를 구축한다.
*   **정의/명명:** \`~라고 부릅니다\`, \`이것은\`, \`~라는\`, \`일종의\`
*   **논리/인과:** \`때문에\`, \`이유는\`, \`덕분에\`, \`이로 인해\`, \`원리는\`
*   **반전/심화:** \`하지만\`, \`다만\`, \`사실은\`, \`그럼에도 불구하고\`, \`안타까운 건\`
*   **감탄/가치부여:** \`신의 경지에 이른\`, \`예술적\`, \`완벽한\`, \`천재적인\`, \`충격적인\`

---

#### **제4원칙: '신뢰의 이중주' 어미 활용법**

두 가지 다른 톤의 어미를 의도적으로 교차 사용하여 신뢰도를 극대화한다.
*   **단정의 화법 (Fact 전달):** 객관적 사실, 원리, 과정 설명 시 사용. (\`-입니다\`, \`-습니다\`, \`-하죠\`, \`-것이죠\`)
*   **전달의 화법 (Report 전달):** 주관적 평가, 인용 시 사용. (\`-다고 하네요\`, \`-다고 합니다\`)

---

#### **제5원칙: 의도된 미완결로 여운을 극대화하라**

대본의 마지막 문장은 아래 3가지 유형 중 하나를 선택하여 마무리한다. 절대 요약하지 마라.
1.  **'심화 정보' 제시형:** C단계의 반전/한계점을 마지막 문장으로 제시하고 종료.
2.  **'상황 묘사' 지속형:** 영상 속 마지막 장면을 묘사하거나 감탄하며 종료.
3.  **'청각적 마침표'형:** 내레이션 종료 후 현장음이나 효과음 지시어로 종료.

---

#### **제6원칙: 다중 결과 생성 프로토콜 (The Multi-Output Protocol)**

*   **목표:** 하나의 주제로 여러 개의 고품질 대본 버전을 생성하여 '바이럴' 확률을 극대화한다.
*   **실행:**
    1.  제시된 영상 주제를 바탕으로, 총 **10개**의 서로 다른 쇼츠 영상 대본을 생성한다.
    2.  각 대본은 정보의 순서를 각기 다르게 배치하여 유사성을 완전히 분산시킨다.
    3.  모든 대본은 이모지를 절대 포함하지 않는다.
    4.  최종 결과물은 **[포맷 2]** 형식에 맞춰, **상세 회피 등급 및 판정 코멘트를 개별적으로 포함**하여 제시한다.`;

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: { label: '티키타카', description: `${TIKITAKA_EDIT_POINT_PROTOCOL_SHORT_LABEL} + 범용 리빌딩 — 10가지 바이럴 패턴으로 타임라인 비선형 재조립 + 효과자막`, color: 'blue' },
  snack: { label: '스낵형', description: `${EDIT_POINT_PROTOCOL_SHORT_LABEL} 기반 비선형 컷 편집 & 이원화 자막 — 자막 전용 숏폼`, color: 'amber' },
  condensed: { label: '축약 리캡', description: `${EDIT_POINT_PROTOCOL_SHORT_LABEL} 기반 시간순 스토리 압축 — 원본 순서 유지 리캡`, color: 'emerald' },
  deep: { label: '심층 분석', description: '채널 헌법 v32 — 타겟팅 + 팩트검증 + 조사보고서 + 5종 대본', color: 'cyan' },
  shopping: { label: '쇼핑형', description: `${EDIT_POINT_PROTOCOL_SHORT_LABEL} + ${SHOPPING_SCRIPT_GUIDELINE_SHORT_LABEL} — AI가 최적 타겟을 찾아 4단계 구매 합리화 대본 5종 생성`, color: 'pink' },
  alltts: { label: 'All TTS', description: '스크립트 리빌딩 v3.6 — 원본 100% 보존 + 텍스트 유사도 0% 수렴. 전체 TTS 대본 10종 생성', color: 'violet' },
};

const formatAnalysisPerfMs = (ms: number): string => {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSec = safeMs / 1000;
  if (totalSec >= 60) {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec - min * 60;
    return `${min}분 ${sec >= 10 ? sec.toFixed(0) : sec.toFixed(1)}초`;
  }
  return `${totalSec >= 10 ? totalSec.toFixed(0) : totalSec.toFixed(1)}초`;
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

/** 모드 색상 매핑 (4-Mode Advanced System) */
const MODE_COLORS: Record<string, { fill: string; label: string }> = {
  N: { fill: '#3b82f6', label: 'AI 내레이션[N]' },
  S: { fill: '#10b981', label: '원본 대사[S]' },
  SN: { fill: '#06b6d4', label: '원본 나레이션[S-내레이션]' },
  A: { fill: '#f59e0b', label: '현장음-액션[A]' },
};

/** 모드 문자열에서 N/S/SN/A 추출 (4-Mode Advanced System) */
function extractModeKey(mode: string): string {
  // S-내레이션 계열을 먼저 체크 (S와 N을 모두 포함하므로 순서 중요)
  if (mode.includes('S-내레이션') || mode.includes('S-나레이션')) return 'SN';
  if (mode.includes('S')) return 'S';
  if (mode.includes('N')) return 'N';
  if (mode.includes('A')) return 'A';
  return '';
}

// ═══════════════════════════════════════════════════
// 유저 메시지 빌더 (10개 버전 + 장면 구조화)
// ═══════════════════════════════════════════════════

/** 해외 영상 이중 언어 출력 규칙 — 모든 프리셋에 공통 적용 */
const BILINGUAL_INSTRUCTION = `

### 🌐 이중 언어 출력 규칙 (해외 영상 자동 감지)
원본 영상의 주요 언어가 한국어가 아닌 경우, 아래 규칙을 **반드시** 추가 적용하라:

1. **각 버전 헤더에 언어 표기**: 제목 줄 바로 위에 \`원본 언어: [ISO 639-1 코드]\` 줄 추가 (예: \`원본 언어: en\`, \`원본 언어: ja\`, \`원본 언어: zh\`).
2. **[S] 모드 (원본 대사)**: 오디오 내용 열에 **원어 대사 → 한국어 번역** 형식으로 이중 표기.
   - 예: \`(인물) "I can't believe this happened!" ⟶ "이런 일이 일어나다니 믿을 수 없어!"\`
3. **[N] 모드 (내레이션)**: 한국어 내레이션만 작성. 단, 원어 고유명사·전문용어는 괄호 병기.
   - 예: \`(내레이션) "테슬라(Tesla)의 새로운 기술이 공개됐는데요"\`
4. **[A] 모드 (현장음)**: 원어 현장음 묘사 후 한국어 의미 보충.
   - 예: \`(현장음) "Oh my god!" ⟶ "맙소사!"\`
5. **효과자막**: 항상 한국어로 작성 (시청자는 한국인).
6. **⟶ 기호를 이중 언어 구분자로 사용**. 원어가 한국어면 ⟶ 없이 기존대로 출력.

원본이 한국어인 경우 이 규칙을 완전히 무시하고 기존 형식 그대로 출력하라.`;

const SHORT_FORM_SOURCE_MAX_SEC = 120;
const SHORT_FORM_ROW_CAP = 24;

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolveEffectiveVideoDurationSec = (inputDesc: string, videoDurationSec: number): number => {
  if (videoDurationSec > 0) return Math.round(videoDurationSec);

  const labeledSecondsMatch = inputDesc.match(/(?:영상 길이|총 길이)[^\n]*\((\d+)초\)/);
  if (labeledSecondsMatch) return parseInt(labeledSecondsMatch[1], 10);

  const plainSecondsMatch = inputDesc.match(/(?:영상 길이|총 길이)[^\n]*?(\d+)초/);
  if (plainSecondsMatch) return parseInt(plainSecondsMatch[1], 10);

  const isoMatch = inputDesc.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || '0', 10);
    const minutes = parseInt(isoMatch[2] || '0', 10);
    const seconds = parseInt(isoMatch[3] || '0', 10);
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    if (totalSeconds > 0) return totalSeconds;
  }

  return 0;
};

const collapseSceneCutsForPrompt = (sceneCuts: SceneCut[], minGapSec: number = 0.75): SceneCut[] => {
  if (sceneCuts.length === 0) return [];

  const sortedCuts = [...sceneCuts].sort((a, b) => a.timeSec - b.timeSec);
  const collapsedCuts: SceneCut[] = [];

  for (const cut of sortedCuts) {
    const lastCut = collapsedCuts[collapsedCuts.length - 1];
    if (!lastCut || (cut.timeSec - lastCut.timeSec) >= minGapSec) {
      collapsedCuts.push(cut);
      continue;
    }
    if (cut.score > lastCut.score) {
      collapsedCuts[collapsedCuts.length - 1] = cut;
    }
  }

  return collapsedCuts;
};

const estimateSourceCutCountFromSceneCuts = (sceneCuts: SceneCut[] | null | undefined): number => {
  if (!sceneCuts || sceneCuts.length === 0) return 0;
  return collapseSceneCutsForPrompt(sceneCuts).length + 1;
};

const waitForPromptSceneCutCount = async (
  sceneCutPromise: Promise<SceneCut[] | null> | null,
  timeoutMs: number = 2500,
): Promise<number> => {
  if (!sceneCutPromise) return 0;
  try {
    const sceneCuts = await Promise.race<SceneCut[] | null>([
      sceneCutPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return estimateSourceCutCountFromSceneCuts(sceneCuts);
  } catch {
    return 0;
  }
};

const REMIX_PROMPT_SCENE_CUT_TIMEOUT_MS = 1200;
const SOURCE_PREP_CACHE_LIMIT = 6;

interface SourcePreparationCacheEntry {
  videoUri: string;
  videoMime: string;
  allVideoUris: string[];
  allVideoMimes: string[];
  knownDurationSec: number;
  frames: TimedFrame[];
  inputDesc: string;
  hasTimedTranscript: boolean;
  singleSourceSceneCuts?: SceneCut[] | null;
}

interface SourceDiarizationCacheEntry {
  diarizedText: string;
  diarizedUtterances: Array<{ speakerId: string; text: string; startTime: number; endTime: number }>;
}

const buildVideoAnalysisSourceCacheKey = (
  inputMode: 'upload' | 'youtube',
  urls: string[],
  files: File[],
): string => {
  if (inputMode === 'upload') {
    const fileSignature = files.map((file) => [
      file.name,
      file.size,
      file.lastModified,
      file.type,
    ].join(':')).join('|');
    return `upload:${fileSignature}`;
  }

  const normalizedUrls = urls
    .map((url) => url.trim())
    .filter(Boolean)
    .join('|');
  return `link:${normalizedUrls}`;
};

const setLimitedCacheEntry = <T,>(cache: Map<string, T>, key: string, value: T, limit: number = SOURCE_PREP_CACHE_LIMIT): void => {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
};

interface RemixRowGuide {
  effectiveDurationSec: number;
  isShortFormSource: boolean;
  minRows: number;
  targetRows: number;
  maxRows: number;
  totalLengthLabel: string;
}

const buildRemixRowGuide = (
  preset: 'tikitaka' | 'snack',
  inputDesc: string,
  videoDurationSec: number,
  sourceCutCount: number,
  targetDuration: 0 | 30 | 45 | 60,
): RemixRowGuide | null => {
  const effectiveDurationSec = resolveEffectiveVideoDurationSec(inputDesc, videoDurationSec);

  if (targetDuration !== 0) {
    const rowFloor = preset === 'tikitaka' ? 6 : 5;
    const rowCap = preset === 'tikitaka' ? 15 : 15;
    const targetRows = clampNumber(
      Math.round(targetDuration / (preset === 'tikitaka' ? 4.5 : 4)),
      rowFloor,
      rowCap,
    );
    return {
      effectiveDurationSec,
      isShortFormSource: effectiveDurationSec > 0 && effectiveDurationSec < SHORT_FORM_SOURCE_MAX_SEC,
      minRows: Math.max(rowFloor, targetRows - 2),
      targetRows,
      maxRows: Math.min(rowCap, targetRows + 2),
      totalLengthLabel: `${Math.max(20, targetDuration - 5)}~${targetDuration + 5}초`,
    };
  }

  if (effectiveDurationSec <= 0) return null;

  if (effectiveDurationSec <= SHORT_FORM_SOURCE_MAX_SEC) {
    const durationBasedTargetRows = clampNumber(
      Math.round(effectiveDurationSec / (preset === 'tikitaka' ? 3 : 3.2)),
      preset === 'tikitaka' ? 6 : 5,
      SHORT_FORM_ROW_CAP,
    );
    const targetRows = clampNumber(
      sourceCutCount > 0 ? Math.max(sourceCutCount, durationBasedTargetRows) : durationBasedTargetRows,
      preset === 'tikitaka' ? 6 : 5,
      SHORT_FORM_ROW_CAP,
    );
    return {
      effectiveDurationSec,
      isShortFormSource: true,
      minRows: Math.max(preset === 'tikitaka' ? 6 : 5, targetRows - (sourceCutCount > 0 ? 1 : 2)),
      targetRows,
      maxRows: Math.min(SHORT_FORM_ROW_CAP, targetRows + 2),
      totalLengthLabel: `${Math.round(effectiveDurationSec * 0.9)}~${Math.round(effectiveDurationSec * 1.1)}초`,
    };
  }

  const targetRows = clampNumber(
    Math.round(60 / (preset === 'tikitaka' ? 4.5 : 4)),
    preset === 'tikitaka' ? 8 : 5,
    15,
  );
  return {
    effectiveDurationSec,
    isShortFormSource: false,
    minRows: Math.max(preset === 'tikitaka' ? 8 : 5, targetRows - 2),
    targetRows,
    maxRows: Math.min(15, targetRows + 2),
    totalLengthLabel: '55~65초',
  };
};

const buildUserMessage = (
  inputDesc: string,
  preset: AnalysisPreset,
  targetDuration: 0 | 30 | 45 | 60 = 0,
  versionCount: number = 10,
  videoDurationSec: number = 0,
  sourceCutCount: number = 0,
  versionOffset: number = 0,
  batchVersionCount: number = versionCount,
): string => {
  versionCount = Math.max(1, batchVersionCount);
  const versionStart = Math.max(1, versionOffset + 1);
  // 목표 시간 관련 동적 지시 (프리셋별 기존 시간 규칙을 오버라이드) — 0(원본)이면 생략
  const durationInstruction = targetDuration === 0 ? '' : `\n\n### ⏱️ 목표 시간 설정 (사용자 지정 — 최우선 적용)\n- **각 버전의 총 길이를 반드시 약 ${targetDuration}초로 맞추세요.**\n- 컷 수와 개별 컷 길이를 조절하여 합산이 ${targetDuration}초 내외(±5초)가 되도록 설계하세요.\n- ${targetDuration <= 30 ? '핵심 장면만 엄선하여 짧고 임팩트 있게.' : targetDuration <= 45 ? '주요 장면을 선별하되 적절한 호흡으로.' : '충분한 내용을 담아 풍부하게.'}`;
  const effectiveDuration = resolveEffectiveVideoDurationSec(inputDesc, videoDurationSec);
  // [FIX #948] 롱폼 영상 판별 (2분+ = 롱폼) — 모든 프리셋에서 타임코드 정확도 + 시간순서 강제에 사용
  const isLongFormVideo = effectiveDuration >= 120;
  const endTimecodeLabel = `${Math.floor(effectiveDuration / 60).toString().padStart(2, '0')}:${Math.round(effectiveDuration % 60).toString().padStart(2, '0')}`;
  // [FIX #948] 롱폼일 때 모든 프리셋에 적용되는 타임코드 정확도 규칙
  const longFormTimecodeAccuracyRule = isLongFormVideo
    ? `\n### 🎯 롱폼 영상 타임코드 정확도 절대 규칙 (최우선)\n- 이 영상은 약 ${Math.round(effectiveDuration / 60)}분(${effectiveDuration}초)의 롱폼 콘텐츠입니다.\n- **타임코드 소스를 추정/추측하지 마라.** 영상의 실제 재생 시간에서 해당 내용이 나오는 정확한 위치만 기록하라.\n- 타임코드는 반드시 **00:00~${endTimecodeLabel} 범위 내**에서 **영상 전체에 골고루 분포**되어야 한다.\n- 영상 앞부분(처음 20%)에만 타임코드가 몰리면 전체 폐기.\n- 자막 전사(transcript)에 타임코드가 포함된 경우, 해당 타임코드를 기준점으로 활용하라.\n- 타임코드 소스는 반드시 **시간순 오름차순**으로 배치하라. (1번 행의 타임코드 < 2번 행의 타임코드 < ... < 마지막 행의 타임코드)\n`
    : '';
  // [FIX #529] alltts 롱폼 지원: 원본(targetDuration=0)이고 영상이 90초 초과이면 롱폼 분량 보존 지시 추가
  const isLongFormAllTts = preset === 'alltts' && targetDuration === 0 && effectiveDuration > 90;
  // [FIX #931] alltts 숏폼 원본 분량 보존: targetDuration=0이고 영상이 90초 이하이면 원본 길이에 맞게 행 수 제한
  const isShortFormAllTts = preset === 'alltts' && targetDuration === 0 && effectiveDuration > 0 && effectiveDuration <= 90;
  const longFormMinRows = isLongFormAllTts
    ? Math.max(15, Math.round(effectiveDuration / 10))
    : isShortFormAllTts
      ? Math.max(2, Math.round(effectiveDuration / 5))
      : 8;
  const longFormMaxRows = isLongFormAllTts
    ? Math.max(20, Math.round(effectiveDuration / 7))
    : isShortFormAllTts
      ? Math.max(3, Math.round(effectiveDuration / 3))
      : 12;
  const longFormOverride = isLongFormAllTts
    ? `\n\n### ⏱️ 원본 분량 보존 — 롱폼 모드 (최우선 적용)\n- 원본 영상은 약 ${Math.round(effectiveDuration / 60)}분(${effectiveDuration}초)입니다.\n- 각 버전의 총 길이를 **원본과 동일하게 약 ${Math.round(effectiveDuration / 60)}분**으로 맞추세요.\n- **"쇼츠 영상 대본"이 아닌, 원본 길이에 맞는 풀 스크립트**를 작성하세요.\n- 🚨 **타임코드 소스를 반드시 시간순 오름차순(00:00 → ${endTimecodeLabel})으로 배치하라.** "전개 순서 재조립"은 텍스트(어휘·구문)에만 적용하고, 타임코드의 시간순서는 절대 뒤바꾸지 마라.\n- 컷(행) 수를 대폭 늘려 원본의 모든 정보를 빠짐없이 담으세요 (최소 ${longFormMinRows}행 이상).\n- 각 컷의 타임코드가 영상 전체(00:00~${endTimecodeLabel})에 골고루 분포되어야 합니다.\n- 축약·요약·생략 절대 금지: 원본 정보량 100%를 그대로 유지하되 텍스트만 재조립하세요.`
    : isShortFormAllTts
      ? `\n\n### ⏱️ 원본 분량 보존 — 숏폼 모드 (최우선 적용)\n- 원본 영상은 약 ${effectiveDuration}초입니다.\n- **각 버전의 총 대본 길이를 반드시 원본과 동일하게 약 ${effectiveDuration}초(±3초)로 맞추세요.**\n- 대본이 원본보다 길어지면 안 됩니다. 각 행의 "예상 시간"을 합산하여 ${effectiveDuration}초를 초과하지 않도록 엄격히 관리하세요.\n- 행 수는 ${longFormMinRows}~${longFormMaxRows}개로 제한하세요.\n- 원본에 없는 내용을 추가로 만들어내지 마세요. 원본 정보만 재조립하세요.`
      : '';
  const tikitakaRowGuide = buildRemixRowGuide('tikitaka', inputDesc, videoDurationSec, sourceCutCount, targetDuration);
  const snackRowGuide = buildRemixRowGuide('snack', inputDesc, videoDurationSec, sourceCutCount, targetDuration);
  const tikitakaRowRule = tikitakaRowGuide
    ? tikitakaRowGuide.isShortFormSource && targetDuration === 0
      ? `9. **원본이 숏폼(${tikitakaRowGuide.effectiveDurationSec}초)이므로 컷 수를 줄이지 마라.** ${sourceCutCount > 0 ? `감지된 원본 컷은 약 ${sourceCutCount}컷이다.` : '원본 컷 수를 최대한 유지하라.'} 버전당 최소 ${tikitakaRowGuide.minRows}개, 권장 ${tikitakaRowGuide.targetRows}개, 최대 ${tikitakaRowGuide.maxRows}개 행으로 설계하고, 총 길이도 원본과 유사한 ${tikitakaRowGuide.totalLengthLabel}로 맞춰라. 필요하면 행을 더 쪼개서라도 컷 밀도를 유지하라. 모든 행에 7열 완비.`
      : `9. **${targetDuration === 0 && tikitakaRowGuide.effectiveDurationSec >= SHORT_FORM_SOURCE_MAX_SEC ? `원본이 롱폼(${tikitakaRowGuide.effectiveDurationSec}초)이므로` : '버전별 목표 길이에 맞춰'} ${tikitakaRowGuide.totalLengthLabel}로 설계.** 버전당 최소 ${tikitakaRowGuide.minRows}개, 권장 ${tikitakaRowGuide.targetRows}개, 최대 ${tikitakaRowGuide.maxRows}개 행. 모든 행에 7열 완비.`
    : '9. **버전당 최소 8개 이상, 최대 15개 행.** 총 60초 내외 설계. 모든 행에 7열 완비.';
  const snackRowRule = snackRowGuide
    ? snackRowGuide.isShortFormSource && targetDuration === 0
      ? `12. **원본이 숏폼(${snackRowGuide.effectiveDurationSec}초)이므로 원본 컷 수를 유지하라.** ${sourceCutCount > 0 ? `감지된 원본 컷은 약 ${sourceCutCount}컷이다.` : '원본 컷 수를 최대한 유지하라.'} 총 길이는 ${snackRowGuide.totalLengthLabel} 내외, 버전당 최소 ${snackRowGuide.minRows}개, 권장 ${snackRowGuide.targetRows}개, 최대 ${snackRowGuide.maxRows}개 컷으로 설계. 각 VERSION 사이에 불필요한 설명 텍스트 금지.`
      : `12. **${targetDuration === 0 && snackRowGuide.effectiveDurationSec >= SHORT_FORM_SOURCE_MAX_SEC ? `원본이 롱폼(${snackRowGuide.effectiveDurationSec}초)이므로` : '버전별 목표 길이에 맞춰'} 총 길이 ${snackRowGuide.totalLengthLabel} 내외.** 버전당 최소 ${snackRowGuide.minRows}개, 권장 ${snackRowGuide.targetRows}개, 최대 ${snackRowGuide.maxRows}개 컷. 각 VERSION 사이에 불필요한 설명 텍스트 금지.`
    : '12. **총 길이 45~60초 내외.** 버전당 5~15개 컷. 각 VERSION 사이에 불필요한 설명 텍스트 금지.';

  if (preset === 'alltts') {
    return finalizeVersionedPrompt(`${longFormOverride}${longFormTimecodeAccuracyRule}
## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **전체 내용(제목, 설명, 태그, 첨부 프레임 이미지/영상 내용)을 철저히 분석**하여, 시스템 프롬프트의 **All TTS형 스크립트 리빌딩 프로토콜 v3.6**을 완벽히 실행하세요.

### 🚨 최우선 규칙: 완전한 TTS 대본 리빌딩
- **원본의 의미와 정보량을 100% 보존**하되, 구문 구조·어휘${isLongFormAllTts ? '' : '·전개 순서'}를 100% 재조립하여 텍스트 유사도를 0%에 수렴시켜라.${isLongFormAllTts ? '\n- 🚨 **롱폼이므로 "전개 순서 재조립"은 텍스트 수준에서만 적용.** 타임코드 소스의 시간순서(영상 타임라인)는 반드시 오름차순 유지.' : ''}
- **축약, 요약, 생략 절대 금지.** 원본 분량과 대등한 길이를 반드시 유지하라.
- **이모지 완전 금지.** 모든 대본은 순수 텍스트(TTS 호환)로만 작성하라.
- **첨부된 프레임 이미지/영상 내용을 꼼꼼히 분석**하여 정확한 장면과 정보를 반영하라.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. **1단계(프리즘 분석표)를 반드시 먼저 출력:** 원본 vs 리빌딩 1:1 정밀 대조 + 순서 재구성 + 회피 전략 명시.
2. **2단계에서 6가지 원칙을 모두 적용하여 ${versionCount}개 대본 생성.**
3. 각 대본은 **정보의 순서를 각기 다르게 배치**하여 ${versionCount}개 간의 유사성도 완전히 분산시켜라.
4. 모든 행은 **[N](내레이션)** 모드만 사용. 전체 오디오가 TTS이므로 [S], [A] 금지.
5. 예상 시간은 **X.X초** 형식 (한국어 4글자/초). 비디오 화면 지시는 해당 장면 정확히 묘사.
6. 타임코드 소스는 **MM:SS.ms** 형식 (원본 영상 내 실제 위치).
7. **각 버전에 Content ID 회피 정밀 분석 필수:** 텍스트 일치율, 구조 유사도, 순서 유사도, 키워드 변형률, 최종 안전 등급, 판정 코멘트.
8. **N-gram 회피:** 원본과 동일 단어가 3어절 이상 연속 불가.
9. **각 VERSION 사이에 불필요한 설명 없이 바로 다음 VERSION.**
10. 효과자막 필수: 상황/감정 강조 텍스트 (2~8자, 이모지 없이).

### 출력 포맷

**[포맷 1: 프리즘 유사도 방어 분석표]**

| 구분 | 원본 대본 (Source) | 리빌딩 대본 (Rebuilt) | 회피 전략 |
| :--- | :--- | :--- | :--- |
| 제목 | (원본 제목) | (유사도 0% 후킹 제목) | (전략 명시) |
| 섹션 A | (원본) | (재조립) | (전략) |
| ... | ... | ... | ... |

[Content ID 회피 정밀 분석]
텍스트 일치율: X.X%
구조 유사도: X.X%
순서 유사도: X.X%
키워드 변형률: XX.X%
최종 안전 등급: [매우 안전 / 안전 / 보통]
판정 코멘트: "분석 요약"

---VERSION 1---
제목: [유사도 0%의 후킹 제목]
컨셉: [적용한 리빌딩 전략 + 정보 재배치 방향]

| 순서 | 모드 | 오디오 내용 (내레이션) | 효과자막 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "리빌딩된 후킹 문장" | [효과자막] | 3.5초 | 장면 묘사 | 00:03.200 |
| 2 | [N] | (내레이션) "재조립된 정보 전달" | [효과자막] | 4.0초 | 장면 묘사 | 00:15.800 |
(총 ${longFormMinRows}~${longFormMaxRows}행)

[Content ID 회피 정밀 분석]
텍스트 일치율: X.X%
구조 유사도: X.X%
순서 유사도: X.X%
키워드 변형률: XX.X%
최종 안전 등급: [매우 안전 / 안전 / 보통]
판정 코멘트: "회피 전략 한 줄 요약"

---VERSION 2---
제목: ...
컨셉: ...

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개)` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
  }

  if (preset === 'condensed') {
    return finalizeVersionedPrompt(`${longFormTimecodeAccuracyRule}
## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **전체 내용을 시간순으로 파악**하여, **${EDIT_POINT_PROTOCOL_SHORT_LABEL} + 시간순 축약 리캡 규칙**에 따라 **${versionCount}가지 서로 다른 축약 리캡 버전**을 설계하세요.
각 버전은 전체 스토리를 60초 내외로 압축하되, **원본의 시간 흐름을 절대 뒤바꾸지 마세요.**

### 🚨 최우선 규칙: 시간순 압축
- **1번 컷 = 영상 초반 장면, 마지막 컷 = 영상 후반 장면.** 순서 뒤바꿈 = 전체 폐기.
- **이 프리셋은 시간순 리캡이므로 킬 샷 선배치를 사용하지 말고, 첫 행부터 원본 초반 장면으로 시작**하세요.
- **전체 스토리 커버:** 처음부터 끝까지 주요 전개를 빠짐없이 포함. 특정 구간만 집중 금지.
- **내레이션으로 전달:** 모든 컷은 [N] 모드. 나레이터가 스토리를 요약 설명.
- **완결된 리캡:** 이 리캡만 보고도 전체 내용을 이해할 수 있어야 함.
- **첨부된 프레임 이미지/영상 내용을 꼼꼼히 분석**하여 정확한 장면을 묘사하라.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. 출력 포맷은 **[마스터 편집 테이블 7열]** 사용. Content ID 분석 불필요.
2. 모든 행은 **[N](내레이션)** 모드만 사용. [S], [A] 금지.
3. **데이터 무결성 절대 준수:** 비디오 화면 지시에 **[S-XX] 소스 ID**와 실제 장면 묘사를 함께 적고, 타임코드와 완벽히 일치시켜라.
4. 타임코드는 **MM:SS.ms** 형식. 반드시 **시간순 오름차순**이어야 한다.
5. 예상 시간은 **X.X초** 형식. 내레이션 길이 기준 (한국어 4글자/초).
6. 비디오 화면 지시는 해당 타임코드에서 **실제로 보이는 화면**을 정확히 기술.
7. **각 버전은 서로 다른 요약 전략**으로 차별화 (스토리 중심, 감정 중심, 반전/서스펜스 중심, 인물/관계 중심 등에서 가장 효과적인 ${versionCount}가지를 선택).
8. **버전당 8~15개 행.** 총 45~75초 설계.
9. **효과자막 필수:** 감정/상황 강조 (2~8자).
10. **각 VERSION 사이에 불필요한 설명 없이 바로 다음 VERSION.**
11. **🚨 타임코드 = 원본 영상의 실제 위치 (리캡 영상 내 위치가 아님):** 타임코드 소스는 원본 영상에서 해당 장면이 실제로 등장하는 시간이다. 만약 원본이 30분짜리 영상이면, 타임코드는 00:00~30:00 범위에서 **영상 전체에 골고루 분포**해야 한다. 절대로 처음 1~2분 구간에 몰리면 안 된다.

### 출력 포맷

---VERSION 1---
제목: [전체 내용 기반 클릭 유도 제목]
컨셉: [이 버전의 요약 전략 설명 1~2줄]

| 순서 | 모드 | 오디오 내용 (내레이션) | 효과자막 | 예상 시간 | 비디오 화면 지시 ([S-XX] 필수) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "영상 초반 내용 요약" | [효과자막] | 4.0초 | **[S-01]** 초반 장면 묘사 | 01:20.000 |
| 2 | [N] | (내레이션) "중반 전개 요약" | [효과자막] | 5.0초 | **[S-04]** 중반 장면 묘사 | 12:45.000 |
| 3 | [N] | (내레이션) "후반 클라이맥스" | [효과자막] | 3.5초 | **[S-08]** 후반 장면 묘사 | 25:10.000 |

---VERSION 2---
제목: ...
컨셉: ...

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개)` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
  }

  if (preset === 'tikitaka') {
    // [FIX #948] 롱폼 tikitaka: 시간순서 유지 + 재배치 최소화
    const tikitakaLongFormRule = isLongFormVideo
      ? `### ⚠️ 롱폼 영상 순서 규칙 (최우선 적용)\n- **원본이 롱폼(약 ${Math.round(effectiveDuration / 60)}분)이므로, 타임코드 소스를 시간순 오름차순으로 배치하라.**\n- 후킹을 위한 1~2컷 선배치는 허용하되, 3번째 행부터는 원본 시간순서를 유지하라.\n- "재배치 구조"에서 원본 순서 기반임을 명시하라.\n\n`
      : '';
    return finalizeVersionedPrompt(`${tikitakaLongFormRule}${longFormTimecodeAccuracyRule}
## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **실제 제목, 설명, 태그, 첨부된 프레임 이미지/영상 내용 등 모든 정보를 철저히 분석**하여 **${versionCount}가지 서로 다른 바이럴 티키타카 리메이크 버전**을 설계하세요.
각 버전은 시스템 프롬프트의 2단계에 정의된 **10가지 바이럴 패턴 전략 중 가장 효과적인 ${versionCount}가지를 선택**하고, **${TIKITAKA_EDIT_POINT_PROTOCOL_SHORT_LABEL}**을 적용하여 설계해야 합니다.

### 🚨 최우선 규칙
- **원본 분량 100% 유지:** 원본 대본의 대사를 요약/축약/생략하지 마라. 모든 핵심 대사, 추임새, 리액션, 현장음을 빠짐없이 포함. (모드 A 적용 시)
- **제목은 이 영상의 실제 내용/주제에 직접 관련된 클릭 유도 제목.** 영상과 무관한 제목 = 전체 폐기.
- **첨부된 프레임 이미지를 꼼꼼히 분석**하여 비디오 화면 지시에 해당 타임코드의 정확한 장면을 구체적으로 묘사하라.
- **효과자막 필수:** 모든 행에 예능형 효과자막을 반드시 작성. (감정/상황/태클/연출 등)

### ☠️ 할루시네이션 절대 금지 (Anti-Hallucination Protocol)
- **영상에 명시적으로 존재하지 않는 대사, 장면, 인물, 사건을 절대 창작하지 마라.** 위반 = 전체 폐기.
- **화자 분리 전사 결과가 제공된 경우**: [S] 모드의 대사는 반드시 전사 결과에 실제로 존재하는 발화만 사용. 전사에 없는 대사를 추측하여 작성 금지.
- **타임코드 소스**: 영상에서 실제로 관찰되는 장면/대화의 정확한 타임코드만 기재. 추정·보간·생성한 타임코드 금지.
- **비디오 화면 지시**: 해당 타임코드에서 실제로 보이는 화면만 기술. 영상에 없는 장면을 상상하여 묘사 금지.
- **'관찰'과 '해석' 분리**: [S] 모드는 관찰(실제 대사), [N] 모드만 해석(AI 창작 내레이션). [S]에 AI 창작 내용을 절대 혼입하지 마라.
- **검증**: 편집 테이블 완성 후, 모든 [S] 행의 대사가 화자 분리 전사 또는 영상 오디오에 실제 존재하는지 자가 검증하라. 불확실하면 해당 대사를 [N] 내레이션으로 전환.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. 출력 포맷은 **[마스터 편집 테이블 7열]** + **[Content ID 분석]** 조합만 사용.
2. 모드는 **[N](내레이션), [S](현장음-대사), [A](현장음-액션)** 중 하나만 사용.
3. 타임코드는 **MM:SS.ms** 형식 엄수 (예: 00:11.200). 근사치·추상적 표현 금지.
4. 예상 시간은 **X.X초** 형식 (예: 4.0초). 내레이션은 한국어 평균 4글자/초로 계산.
5. 비디오 화면 지시는 **(1) [S-XX] [컷1] 정확한 장면 묘사 (시간) / (2) [S-XX] [컷2] 장면 묘사 (시간)** 형식. HTML 태그 금지. 해당 타임코드에서 실제로 보이는 화면을 정확히 기술.
6. **데이터 무결성 절대 준수:** [소스 ID] + [타임코드 MM:SS.ms] + [장면 내용] 삼위일체 필수.
7. 슬로우 모션 금지 — 정배속 멀티 컷 분할 전략 사용.
8. **각 버전은 서로 다른 바이럴 전략** (전략 1~10 순서대로 적용).
${tikitakaRowRule}
10. **각 VERSION 사이에 불필요한 설명 텍스트 없이 바로 다음 VERSION.**
11. 효과자막은 **예능형 텍스트** (예: [동공지진], (팩트폭행), [부들부들], (BGM: 비장한 음악), [갑분싸]). 2~10자.

### 출력 포맷 (7열 마스터 편집 테이블 + Content ID 분석)

---VERSION 1---
제목: [클릭 유도 제목]
컨셉: [적용한 전략명 + 차별화 설명 1~2줄]
재배치 구조: [예: ⑤하이라이트 → ②리액션 → ①발단 → ⑥결말]

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 효과자막 | 예상 시간 | 비디오 화면 지시 ([S-XX] 정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "후킹 대사" | [효과자막] | 3.5초 | (1) **[S-05]** 정확한 장면 묘사 (1.5초) / (2) **[S-02]** 정확한 장면 묘사 (2.0초) | 00:03.200 / 00:15.800 |
| 2 | [A] | (현장음) (소리 묘사) | [효과자막] | 1.5초 | (1) **[S-07]** 액션 동작 묘사 (클로즈업) | 00:16.500 |
| 3 | [S] | (인물) "원본 대사" | [효과자막] | 2.0초 | (1) **[S-08]** 원본 오디오 인물 대사 (정배속) | 00:18.100 |

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

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개)` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
  }

  // 심층 분석
  if (preset === 'deep') {
    return finalizeVersionedPrompt(`## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **모든 정보(제목, 설명, 태그, 첨부 프레임 이미지/영상 내용)를 초정밀 해부**하여, 시스템 프롬프트의 **채널 헌법 v32.0** 전체 단계를 빠짐없이 실행하세요.

### 🚨 최우선 규칙
- **모든 단계를 순서대로 실행:** 단계 0(DYNAMIC TARGETING) → 단계 -1(초정밀 영상 해부) → 단계 0.5(GATEKEEPER) → 단계 1(FILTER) → 단계 2(PRODUCTION) → 단계 3(EMOTIONAL VARIATIONS)
- **환각 절대 금지:** 영상에 명시적으로 존재하지 않는 정보를 추측하거나 창작하지 마라.
- **'관찰'과 '해석'을 엄격히 분리**하여 기술하라.
- **첨부된 프레임 이미지/영상 내용을 꼼꼼히 분석**하여 객관적 사실 근거로 활용하라.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. **단계 0: DYNAMIC TARGETING** — 최적 타겟 페르소나를 반드시 먼저 선언.
2. **단계 -1: 초정밀 영상 해부** — 5대 요소(객체/행위, 수치/텍스트, 시네마틱, 청각, 물리적 상호작용) 마이크로 데이터 추출. 전문 용어 교차 검증 + 악마의 변호인 심층 과학 검증 실행.
3. **단계 0.5: GATEKEEPER** — 커뮤니티 가이드, 광고주 친화도, 성적 콘텐츠 체크리스트 검토. 채널 안전/수익 리스크 등급 판정.
4. **단계 1: FILTER** — 타겟 매력도 점수 산출 (9.5점 이상 시 통과).
5. **단계 2: PRODUCTION**
   - **Part 1: 심층 조사 보고서** — 🔍이게 무엇인지, 🧑‍🔬전문 용어, 💡원리, ⚙️작동 방식, 🤔이유, ✨장단점, 💰가격, ⏳시간/기간, ❗️관련 유용 정보 — 각 항목 상세 기술.
   - **Part 2: 최종 제작 기획서** — 바이럴 제목 후보 30개 + 평가, 60초 Shorts 스토리 구조, 최종 대본(내레이션 스타일 가이드 100% 준수, code 블록으로 출력).
6. **단계 3: EMOTIONAL VARIATIONS** — 4대 본능 자극 대본 확장 (물욕/탐욕, 본능/매력, 감동/인간미, 분노/사회적 정의)${versionCount < 5 ? (versionCount > 1 ? ` 중 가장 효과적인 ${versionCount - 1}가지 선택` : '. 단, 사용자가 1개만 요청했으므로 변주는 생략하고 표준 대본만 출력') : ''}.
7. **총 ${versionCount}개 대본을 반드시 ---VERSION N--- + 7열 마스터 편집 테이블로 출력.**${versionCount >= 5 ? ' VERSION 1은 표준 대본, 나머지는 변주 A~D.' : versionCount > 1 ? ` VERSION 1은 표준 대본, 나머지 ${versionCount - 1}개는 4대 본능 변주 중 선택.` : ' VERSION 1은 표준 대본.'}
8. 모든 행은 **[N](내레이션)** 모드만 사용. 예상 시간은 **X.X초** 형식 (한국어 4글자/초).
9. 효과자막 필수: 상황/감정 강조 예능형 텍스트 (2~8자).
10. **추가 영상 소스 검색 키워드** — 한국어 25개 + 영어 25개 마크다운 테이블.

### 출력 포맷 (이 순서대로 출력)

[단계 0: DYNAMIC TARGETING 🎯]
타겟: [AI가 분석한 최적 타겟 명칭]
핵심 정체성: [타겟의 세분화된 관심사/선호]
선호 톤앤매너: [타겟에 맞는 톤]

[단계 -1: 초정밀 영상 해부]
(5대 요소 마이크로 데이터 + 전문 용어 교차 검증 + 악마의 변호인 검증)

[단계 0.5: GATEKEEPER 🚨]
채널 안전: [🟢/🔴] | 수익 리스크: [🟢/🟡/🔴]
(상세 판정 이유)

[단계 1: FILTER 🎯]
타겟 매력도 점수: [X.X/10]

[단계 2: PRODUCTION ✍️]
**Part 1: 심층 조사 보고서**
(9개 항목 각각 상세 기술)

**Part 2: 최종 제작 기획서**
제목 후보 30개 + 4항목 평가표

[추가 영상 소스 검색 키워드]
| # | 한국어 | 영어 |
|---|--------|------|
| 1 | ... | ... |
(25개)

---VERSION 1---
제목: [표준 대본 제목]
컨셉: [60초 Shorts 스토리 구조 + 내레이션 스타일 가이드 적용]

| 순서 | 모드 | 오디오 내용 (내레이션) | 효과자막 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 (MM:SS) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "오프닝 후킹" | [효과자막] | 3.0초 | 오프닝 화면 묘사 | 00:05 |
| 2 | [N] | (내레이션) "핵심 전개" | [효과자막] | 5.0초 | 핵심 장면 묘사 | 01:30 |
(총 8~12행, 60초 내외)

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개.${versionCount > 1 ? ' VERSION 1은 표준 대본, 나머지는 4대 본능 자극 변주' : ' VERSION 1은 표준 대본'})` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
  }

  // 쇼핑형 (편집점 V8 + 동적 타겟팅 v36 적용)
  if (preset === 'shopping') {
    return finalizeVersionedPrompt(`## 분석 대상
${inputDesc}

## 지시 사항
위 소재(영상/이미지/텍스트)를 철저히 분석하여, **${EDIT_POINT_PROTOCOL_SHORT_LABEL} + ${SHOPPING_SCRIPT_GUIDELINE_SHORT_LABEL}**에 따라 편집점을 생성하세요.

### 🚨 최우선 규칙
1. **킬 샷(Kill Shot) 선배치:** 가장 자극적이고 시각적으로 충격적인 장면을 무조건 **1번 컷(00:00~00:03)**에 배치.
2. **동적 타겟팅 먼저 실행:** 소재 분석 → 최적 타겟 페르소나 발굴 → 타겟 선언.
3. **4단계 구매 합리화 프로토콜 엄수:** 후킹(0~5초) → 디테일(5~20초) → 로망(20~30초) → 위트(마무리).
4. **데이터 무결성 절대 준수:** [소스 ID] + [타임코드 MM:SS.ms] + [장면 내용] 삼위일체 필수.
5. **대본 총 길이 < 소스 영상 총 길이:** 편집 여유분을 확보하기 위해 대본은 반드시 소스보다 짧아야 한다.

### ⚠️ 절대 규칙 (${EDIT_POINT_PROTOCOL_SHORT_LABEL})
1. 출력 포맷은 **---VERSION N--- + [마스터 편집 테이블 7열]** 사용.
2. 소재에 보이지 않는 기능/성분/효과를 지어내지 마라. **소재에서 확인 가능한 정보만** 사용.
3. **1문장 2컷 의무화:** 내레이션 2.5초 초과 시 반드시 중간 컷 전환. 롱테이크 금지.
4. **정배속 우선:** 슬로우 모션 최소화, [정배속] 또는 [패스트 컷] 위주.
5. 소스 번호 **[S-01], [S-02]** 등 고유 ID를 비디오 화면 지시에 반드시 명시.
6. 타임코드는 **MM:SS.ms** 형식 엄수 (안전 마진 ±0.1초 적용).
7. 효과자막 필수: 제품 매력을 강조하는 예능형 텍스트 (2~8자).
8. 내레이션은 나노 단위로 분할: 순서를 1-1(a), 1-1(b) 형태로 쪼개어 교차 컷.
9. ${versionCount}개 대본은 반드시 **서로 다른 소구점/톤/구조**로 차별화 (본능/직관 자극, 기능/스펙 강조, 감성/로망 자극, 상황 공감 유도, 가성비/선물 추천 등에서 가장 효과적인 ${versionCount}가지 선택).
10. 첨부된 프레임 이미지/영상 내용을 꼼꼼히 분석하여 제품의 실제 모습, 기능, 사용 장면을 정확히 반영하라.

### 출력 포맷 (${EDIT_POINT_PROTOCOL_SHORT_LABEL} 다이내믹 멀티-컷 편집 테이블)

---VERSION 1---
제목: [본능/직관 자극형 제목]
컨셉: [타겟: AI 분석 타겟] [소구점: 핵심 포인트] — 킬 샷 + 4단계 구매 합리화

| 순서 | 모드 | 오디오 내용 (내레이션/나노 분할) | 효과자막 | 예상 시간 | 비디오 화면 지시 ([S-XX] 필수) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1-1(a) | [N] | (내레이션) "킬 샷 후킹 카피 앞부분" | [💥] | 1.5초 | **[S-05]** 킬 샷: 제품 최고 장면 [정배속] | 00:15.200~00:16.700 |
| 1-1(b) | [N] | (내레이션) "...후킹 뒷부분" | [✨] | 1.5초 | **[S-01]** 디테일 클로즈업 [정배속] | 00:02.100~00:03.500 |
| 2 | [S] | (현장음) 리액션/자연음 | [😲] | 2.0초 | **[S-03]** 사용 장면 [정배속] | 00:08.500~00:10.400 |
| 3 | [N] | (내레이션) "2단계: 디테일 해부" | [🔍] | 3.0초 | **[S-02]** 스펙/성분 앵글 [1.2배속] | 00:04.000~00:07.800 |

---VERSION 2---
제목: [기능/스펙/효과 강조형 제목]
컨셉: ...

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개)` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
  }

  // 스낵형
  // [FIX #948] 롱폼 snack: 시간순서 유지 + 재배치 최소화
  const snackLongFormRule = isLongFormVideo
    ? `### ⚠️ 롱폼 영상 순서 규칙 (최우선 적용)\n- **원본이 롱폼(약 ${Math.round(effectiveDuration / 60)}분)이므로, 타임코드 소스를 시간순 오름차순으로 배치하라.**\n- 후킹을 위한 1번 컷 선배치는 허용하되, 2번째 행부터는 원본 시간순서를 유지하라.\n- 타임코드가 영상 전체(00:00~${endTimecodeLabel})에 골고루 분포되어야 한다.\n\n`
    : '';
  return finalizeVersionedPrompt(`${snackLongFormRule}${longFormTimecodeAccuracyRule}
## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **실제 제목, 설명, 태그, 첨부 프레임 이미지/영상 내용 등 모든 정보를 철저히 분석**하여, 지침서에 따라 **${versionCount}가지 서로 다른 숏폼 리메이크 버전**을 설계하세요.

### 🚨 최우선 규칙: 영상 내용 충실 반영
- **제목은 위에 제공된 영상의 실제 내용/주제를 기반으로** 작성해야 합니다. 영상과 무관한 제목 작성 시 전체 폐기.
- **설명(Description)의 핵심 내용을 빠짐없이 반영**하세요. 영상에 나오는 인물, 사건, 상황을 정확히 파악하세요.
- **첨부된 프레임 이미지를 꼼꼼히 분석**하여 화면 묘사에 구체적으로 반영하세요.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. 출력 포맷은 **[마스터 편집 테이블 7열]** + **[Content ID 분석]** 조합만 사용.
2. ${isLongFormVideo ? '**롱폼이므로 타임코드 소스를 시간순 오름차순으로 유지하되, 1번 컷만 가장 바이럴한 장면으로 선배치.** 나머지 행은 원본 시간순서 유지.' : '**컷 순서는 원본 영상의 시간 순서가 아니라, 임팩트 순으로 완전히 뒤섞어야 한다.** 순차적 나열 절대 금지.'}
3. 가장 바이럴한 펀치라인/클라이맥스를 무조건 **1번 컷(00:00~00:03)에 선배치**.
4. 모드는 **[S](현장음-대사), [A](현장음-액션)** 중 하나만 사용. **[N](나레이션) 절대 금지.**
5. 효과 자막은 **큼직한 예능형 텍스트** (예: 💥쾅!, ㅋㅋㅋ, 😳동공지진). 2~8자 이내.
6. 자막 내용 열에 **하단 자막(16자 이내 + 이모지)**을 기입. 후킹 카피, 상황 설명 등은 모두 자막 텍스트로 처리.
7. 비디오 화면 지시에 **[S-XX] 소스 ID**를 반드시 명시하고, 타임코드와 장면 설명을 정확히 묶어라.
8. 타임코드는 **MM:SS.ms** 형식 엄수. 예상 시간은 **X.X초** 형식.
9. 하나의 컷은 가급적 **2~4초**를 넘기지 않는다.
10. 영상에 등장하는 **모든 소재가 최소 1회 이상** 등장해야 한다.
11. **각 버전은 서로 다른 후킹 전략, 톤, 편집 방향**으로 차별화.
${snackRowRule}

### 출력 포맷 (7열 마스터 편집 테이블 — 이 형식을 정확히 따르세요)

---VERSION 1---
제목: [이 영상 내용과 관련된 클릭 유도 제목]
컨셉: [이 버전만의 차별화된 후킹/편집 전략 설명 1~2줄]
재배치 구조: [예: ⑤하이라이트 → ②리액션 → ①발단 → ⑥결말]

| 순서 | 모드 | 자막 내용 (하단 기본 자막) | 효과자막 | 예상 시간 | 비디오 화면 지시 ([S-XX] 필수) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [S] | "가장 바이럴한 후킹 카피 🔥" | [💥쾅!] | 3.0초 | **[S-05]** 하이라이트 장면 + 줌인 | 02:15.200 |
| 2 | [S] | "원본 대사 반영 자막 😳" | [동공지진] | 2.0초 | **[S-02]** 대사 인물 클로즈업 | 00:45.100 |
| 3 | [A] | "상황 설명 자막 + 이모지 🫢" | [갑분싸] | 2.5초 | **[S-07]** 화면 전환 효과 묘사 | 01:30.400 |

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

(7열 마스터 편집 테이블 + Content ID 분석)

(이 패턴으로 ---VERSION ${versionCount}--- 까지 총 ${versionCount}개)` + durationInstruction + BILINGUAL_INSTRUCTION, versionStart, versionCount);
};

// ═══════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════

const VideoAnalysisRoom: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  // ── Zustand 스토어 (탭 전환 시 영속) ──
  const store = useVideoAnalysisStore();
  const {
    inputMode, youtubeUrl, youtubeUrls, selectedPreset, rawResult, versions, thumbnails, isFrameUpgrading, error, expandedId,
    targetDuration, setTargetDuration,
    keepOriginalOrder, setKeepOriginalOrder,
    versionCount, setVersionCount,
    setInputMode, setYoutubeUrl, updateYoutubeUrl, addYoutubeUrl, removeYoutubeUrl,
    setSelectedPreset, setRawResult, setVersions, setThumbnails, setIsFrameUpgrading,
    setError, setExpandedId, cacheCurrentResult, restoreFromCache, resetResults,
    clearPresetCache,
    savedSlots, activeSlotId, loadSlot, removeSlot, newAnalysis, loadAllSlots, saveSlot,
    autoSave, tryAutoRecover,
  } = store;

  // 로컬 전용 (일시적 UI 상태 — 영속 불필요)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'analyzing'>('idle');
  const analysisAbortRef = useRef<AbortController | null>(null);
  const failsafeFiredRef = useRef(false); // [FIX #454] 페일세이프 타이머가 이미 처리했는지 추적
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [copyMenuVersionId, setCopyMenuVersionId] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  // [REMOVED] batchProgress state — 5병렬 배치 제거됨 (단일 호출 전환으로 비용 절감)
  // ★ [FIX #perf-v2] 실제 분석 단계 추적 — 가짜 진행률 대신 실제 파이프라인 상태 표시
  const [realStep, setRealStep] = useState(0);
  const [stepDetail, setStepDetail] = useState('');
  const [isLongForm, setIsLongForm] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<{ frame: TimedFrame; scene: SceneRow; versionTitle: string } | null>(null);
  const [previewVersion, setPreviewVersion] = useState<VersionItem | null>(null);
  const [renderingVersionId, setRenderingVersionId] = useState<number | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [displayLangMode, setDisplayLangMode] = useState<'ko' | 'bilingual' | 'original'>('bilingual');
  const analysisStartRef = useRef<number>(0);
  const analysisRunIdRef = useRef(0);
  const sourcePrepCacheRef = useRef<Map<string, SourcePreparationCacheEntry>>(new Map());
  const sourceDiarizationCacheRef = useRef<Map<string, SourceDiarizationCacheEntry>>(new Map());
  const analysisPerfRef = useRef<{
    runId: number;
    startedAt: number;
    lastAt: number;
    stageDurations: Record<string, number>;
    preset: AnalysisPreset | null;
    inputLabel: string;
  }>({
    runId: 0,
    startedAt: 0,
    lastAt: 0,
    stageDurations: {},
    preset: null,
    inputLabel: '',
  });
  const [lastAnalysisPerfLines, setLastAnalysisPerfLines] = useState<string[]>([]);

  // ── 인기 쇼츠 음원 추천 ──
  const [trendingBgm, setTrendingBgm] = useState<{ title: string; artist: string; videoId: string; thumbnail: string }[]>([]);
  const [isBgmLoading, setIsBgmLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [guideAiResult, setGuideAiResult] = useState('');
  const [nleExporting, setNleExporting] = useState<{ target: EditRoomNleTarget; step: string; progress?: number; startedAt?: number } | null>(null);
  const [nleElapsed, setNleElapsed] = useState(0);
  const nleAbortRef = useRef<AbortController | null>(null);
  const nleActiveTaskRef = useRef<{ target: EditRoomNleTarget; controller: AbortController } | null>(null);
  const nleDimsCache = useRef<{ w: number; h: number; fps: number; dur: number } | null>(null);
  // [FIX #700] "편집실로" 버튼 중복 클릭 방지 — lock + loading 상태
  const [sendingToEditRoom, setSendingToEditRoom] = useState(false);
  const sendToEditRoomLockRef = useRef(false);
  // 경과시간 실시간 업데이트
  useEffect(() => {
    if (!nleExporting?.startedAt) { setNleElapsed(0); return; }
    const t = setInterval(() => setNleElapsed(Math.round((Date.now() - nleExporting.startedAt!) / 1000)), 1000);
    return () => clearInterval(t);
  }, [nleExporting?.startedAt]);
  const validYoutubeUrls = youtubeUrls.filter(u => u.trim().length > 0);
  const primaryAnalysisSourceUrl = validYoutubeUrls[0] || '';
  const hasInput = inputMode === 'youtube' ? validYoutubeUrls.length > 0 : uploadedFiles.length > 0;

  const resetAnalysisPerf = useCallback((preset: AnalysisPreset): number => {
    const now = performance.now();
    const nextRunId = analysisRunIdRef.current + 1;
    analysisRunIdRef.current = nextRunId;
    const inputLabel = inputMode === 'youtube'
      ? `${isYouTubeUrl(primaryAnalysisSourceUrl) ? 'YouTube' : primaryAnalysisSourceUrl ? '소셜' : '링크'} ${validYoutubeUrls.length}개`
      : `업로드 ${uploadedFiles.length}개`;
    analysisPerfRef.current = {
      runId: nextRunId,
      startedAt: now,
      lastAt: now,
      stageDurations: {},
      preset,
      inputLabel,
    };
    setLastAnalysisPerfLines([]);
    console.log(`[VideoAnalysis][Perf] 시작: ${PRESET_INFO[preset].label} · ${inputLabel}`);
    return nextRunId;
  }, [inputMode, primaryAnalysisSourceUrl, uploadedFiles.length, validYoutubeUrls.length]);

  const addAnalysisPerfStage = useCallback((
    runId: number,
    stageKey: string,
    label: string,
    explicitMs?: number,
  ): number => {
    const perf = analysisPerfRef.current;
    if (perf.runId !== runId || !perf.startedAt) return 0;
    const now = performance.now();
    const stageMs = explicitMs ?? Math.max(0, now - perf.lastAt);
    if (explicitMs === undefined) perf.lastAt = now;
    perf.stageDurations[stageKey] = (perf.stageDurations[stageKey] || 0) + stageMs;
    console.log(`[VideoAnalysis][Perf] ${label}: ${formatAnalysisPerfMs(stageMs)} (누적 ${formatAnalysisPerfMs(now - perf.startedAt)})`);
    return stageMs;
  }, []);

  const updateAnalysisPerfSummary = useCallback((
    runId: number,
    status: 'success' | 'cancelled' | 'failed',
    options?: {
      backgroundState?: 'running' | 'done' | 'timeout' | 'failed';
      showToastSummary?: boolean;
    },
  ) => {
    const perf = analysisPerfRef.current;
    if (perf.runId !== runId || !perf.startedAt) return;
    const now = performance.now();
    const totalMs = Math.max(0, now - perf.startedAt);
    const stageDurations = perf.stageDurations;
    const presetLabel = perf.preset ? PRESET_INFO[perf.preset].label : '리메이크';
    const statusLabel = status === 'success' ? '완료' : status === 'cancelled' ? '중단' : '실패';
    const backgroundMs = stageDurations.backgroundFrames || 0;
    const backgroundLine = options?.backgroundState === 'running'
      ? '백그라운드 프레임 보정 진행 중'
      : options?.backgroundState === 'timeout'
        ? `백그라운드 프레임 ${formatAnalysisPerfMs(backgroundMs)} · 타임아웃`
        : options?.backgroundState === 'failed'
          ? `백그라운드 프레임 ${formatAnalysisPerfMs(backgroundMs)} · 실패`
          : backgroundMs > 0
            ? `백그라운드 프레임 ${formatAnalysisPerfMs(backgroundMs)} · 완료`
            : '백그라운드 프레임 대기 없음';
    const summaryLines = [
      `최근 분석: ${presetLabel} · ${perf.inputLabel}`,
      `총 ${formatAnalysisPerfMs(totalMs)} · 전처리 ${formatAnalysisPerfMs(stageDurations.preload || 0)} · 음성 ${formatAnalysisPerfMs(stageDurations.diarization || 0)} · AI ${formatAnalysisPerfMs(stageDurations.ai || 0)} · 결과 ${formatAnalysisPerfMs(stageDurations.result || 0)}`,
      `${backgroundLine} · 상태 ${statusLabel}`,
    ];
    setLastAnalysisPerfLines(summaryLines);
    console.log(`[VideoAnalysis][Perf] 요약: ${summaryLines.join(' | ')}`);
    if (typeof console.table === 'function') {
      console.table([
        { stage: '전처리', seconds: Number(((stageDurations.preload || 0) / 1000).toFixed(1)) },
        { stage: '음성', seconds: Number(((stageDurations.diarization || 0) / 1000).toFixed(1)) },
        { stage: 'AI', seconds: Number(((stageDurations.ai || 0) / 1000).toFixed(1)) },
        { stage: '결과', seconds: Number(((stageDurations.result || 0) / 1000).toFixed(1)) },
        { stage: '백그라운드 프레임', seconds: Number((backgroundMs / 1000).toFixed(1)) },
        { stage: '총합', seconds: Number((totalMs / 1000).toFixed(1)) },
      ]);
    }
    if (options?.showToastSummary && status === 'success') {
      showToast(
        `분석 ${formatAnalysisPerfMs(totalMs)} · 전처리 ${formatAnalysisPerfMs(stageDurations.preload || 0)} · AI ${formatAnalysisPerfMs(stageDurations.ai || 0)}`,
        6500,
      );
    }
  }, []);

  // 슬롯 목록 초기 로드
  React.useEffect(() => { loadAllSlots(); }, []);

  // [FIX #316] 탭 전환/새로고침 후 비주얼 유실 복구 — resultCache 우선, YouTube 폴백
  React.useEffect(() => {
    const s = useVideoAnalysisStore.getState();
    if (s.versions.length > 0 && s.thumbnails.length === 0 && s.selectedPreset) {
      // 1차: resultCache에서 thumbnails 복원
      const cached = s.resultCache[s.selectedPreset];
      if (cached?.thumbs?.length > 0) {
        s.setThumbnails(cached.thumbs);
      } else {
        // 2차: YouTube URL에서 기본 썸네일 재생성
        const urls = s.youtubeUrls?.filter((u: string) => u.trim()) || [];
        if (urls.length > 0 && isYouTubeUrl(urls[0])) {
          const fallbackFrames: TimedFrame[] = [];
          for (let vi = 0; vi < urls.length; vi++) {
            const vid = extractYouTubeVideoId(urls[vi]);
            if (!vid) continue;
            const base = `https://img.youtube.com/vi/${vid}`;
            fallbackFrames.push(
              { url: `${base}/hqdefault.jpg`, hdUrl: `${base}/maxresdefault.jpg`, timeSec: 0, sourceIndex: vi },
              { url: `${base}/1.jpg`, hdUrl: `${base}/1.jpg`, timeSec: 15, sourceIndex: vi },
              { url: `${base}/2.jpg`, hdUrl: `${base}/2.jpg`, timeSec: 30, sourceIndex: vi },
              { url: `${base}/3.jpg`, hdUrl: `${base}/3.jpg`, timeSec: 45, sourceIndex: vi },
            );
          }
          if (fallbackFrames.length > 0) s.setThumbnails(fallbackFrames);
        }
      }
    }
  }, []);

  // [FIX #313] 새로고침 후 자동 복구 — localStorage 유실 시 IndexedDB에서 복원
  React.useEffect(() => {
    tryAutoRecover().then(recovered => {
      if (recovered) showToast('이전 분석 결과를 자동으로 복원했어요 ✅', 4000);
    });
  }, []);

  // [FIX #313] 분석 중 새로고침 방지 — 데이터 유실 경고
  useEffect(() => {
    if (!isAnalyzing) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isAnalyzing]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/')).slice(0, 5);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files].slice(0, 5));
      setRawResult(''); setError(null); setVersions([]); setThumbnails([]);
      if (inputMode !== 'upload') setInputMode('upload');
    }
  }, [inputMode, setInputMode, setRawResult, setError, setVersions, setThumbnails]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/')).slice(0, 5);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files].slice(0, 5));
      setRawResult(''); setError(null); setVersions([]); setThumbnails([]);
    }
  };

  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    resetResults();
  }, [resetResults]);

  // ── 인기 쇼츠 음원 추천 (Google Search 그라운딩) ──
  const handleFetchTrendingBgm = useCallback(async () => {
    if (isBgmLoading) return;
    // YouTube 쿼터 체크 (10곡 검색 = 1,000 단위)
    const quota = getQuotaUsage();
    if (quota.remaining < 1000) {
      showToast(`YouTube 일일 쿼터가 부족합니다 (남은 쿼터: ${quota.remaining})`, 5000);
      return;
    }
    setIsBgmLoading(true);
    setTrendingBgm([]);
    try {
      const now = new Date();
      const sysP = '당신은 YouTube Shorts 트렌드 음원 전문가입니다. 반드시 JSON 배열만 출력하세요.';
      const userP = `현재 ${now.getFullYear()}년 ${now.getMonth() + 1}월 기준, YouTube Shorts에서 가장 많이 사용되고 있는 인기 음원/BGM 10개를 추천해주세요.\n조건:\n- 실제로 Shorts 크리에이터들이 현재 많이 사용하는 곡\n- 한국 + 글로벌 혼합\n- 원곡, 리믹스, 밈 음원 포함\nJSON 배열만 응답 (코드블록 없이):\n[{"title":"곡명","artist":"아티스트명"},...]`;
      const aiResult = await evolinkNativeStream(sysP, userP, () => {}, { temperature: 0.3, maxOutputTokens: 2000, enableWebSearch: true });
      const cleaned = aiResult.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
      const songs: { title: string; artist: string }[] = JSON.parse(jsonMatch[0]);
      const apiKey = getYoutubeApiKey();
      const results: { title: string; artist: string; videoId: string; thumbnail: string }[] = [];
      for (let i = 0; i < songs.length; i += 5) {
        const batch = songs.slice(i, i + 5);
        const fetched = await Promise.allSettled(batch.map(async (song) => {
          const q = encodeURIComponent(`${song.title} ${song.artist} official`);
          const res = await monitoredFetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=1&key=${apiKey}`);
          if (!res.ok) return null;
          const data = await res.json();
          const item = data.items?.[0];
          if (!item) return null;
          return { title: song.title, artist: song.artist, videoId: item.id.videoId, thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url };
        }));
        for (const r of fetched) { if (r.status === 'fulfilled' && r.value) results.push(r.value); }
      }
      if (results.length === 0) {
        showToast('음원 검색 결과가 없습니다. 잠시 후 다시 시도해주세요.', 4000);
      }
      setTrendingBgm(results);
    } catch (err) {
      console.error('트렌딩 BGM 로드 실패:', err);
      showToast('인기 음원 추천에 실패했습니다. 잠시 후 다시 시도해주세요.', 5000);
    } finally { setIsBgmLoading(false); }
  }, [isBgmLoading]);

  // [FIX #335] ffmpeg.wasm 사전 로드 — 분석 시작 시 백그라운드로 30MB WASM 미리 다운로드
  // NLE 패키지 생성 시 ffmpeg가 이미 캐시되어 있으면 머지가 즉시 실행됨
  const ffmpegPreloaded = useRef(false);

  // ── 프리셋 전환 시 캐시 복원 or 신규 분석 ──
  const handleAnalyze = async (preset: AnalysisPreset, force = false) => {
    if (!requireAuth('영상 분석')) return;
    if (!hasInput) return;
    const sourceCacheKey = buildVideoAnalysisSourceCacheKey(inputMode, validYoutubeUrls, uploadedFiles);

    // ffmpeg.wasm 사전 로드 (백그라운드, 분석 시작과 동시에)
    if (!ffmpegPreloaded.current) {
      ffmpegPreloaded.current = true;
      import('../../../services/ffmpegService').then(m => m.loadFFmpeg()).catch(() => {});
    }

    // API 키 사전 검증 — 키 없이 5배치 모두 실패하는 것을 방지
    // [FIX #833] 체험판(trial) 유저는 Google Gemini 키로 분석 가능 — 게이트에서 tier 체크 추가
    const trialAuthUser = (await import('../../../stores/authStore')).useAuthStore.getState().authUser;
    const isTrialUser = trialAuthUser?.tier === 'trial';
    const isTrialExpired = isTrialUser && trialAuthUser.tierExpiresAt && new Date(trialAuthUser.tierExpiresAt).getTime() < Date.now();
    if (!getEvolinkKey() && !getKieKey() && !(isTrialUser && !isTrialExpired && getGoogleGeminiKey())) {
      showToast(
        isTrialUser
          ? 'Google Gemini API 키가 설정되어 있지 않아요. 체험판 가이드에서 키를 발급받아 등록해주세요!'
          : 'AI 분석을 위한 API 키가 설정되어 있지 않아요. ⚙️ 설정에서 API 키를 등록해주세요!',
        6000,
      );
      setError(
        isTrialUser
          ? 'Google Gemini API 키가 필요합니다. 체험판 가이드에서 키를 발급받아 등록해주세요.'
          : 'API 키가 설정되지 않았습니다. 설정 메뉴에서 Evolink 또는 KIE API 키를 등록해주세요.',
      );
      return;
    }

    // 현재 결과를 기존 프리셋 캐시에 저장 (전환 전 보존)
    // [FIX #316] rawResult 유실 시에도 versions 기반 캐시 가능하도록 조건 완화
    if (selectedPreset && (rawResult || versions.length > 0)) {
      cacheCurrentResult(selectedPreset, sourceCacheKey);
    }

    // 강제 재생성 시 해당 프리셋 캐시 삭제
    if (force) {
      clearPresetCache(preset);
      sourcePrepCacheRef.current.delete(sourceCacheKey);
      sourceDiarizationCacheRef.current.delete(sourceCacheKey);
    }

    // 캐시에 이미 결과가 있으면 복원만 하고 종료
    if (!force && restoreFromCache(preset, sourceCacheKey)) return;

    // [FIX #157] 이전 분석 abort + 새 AbortController 생성
    analysisAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    analysisAbortRef.current = abortCtrl;

    // [FIX #378] 글로벌 타임아웃: 전처리(프레임 추출/화자분리) + AI 분석 전체를 8분으로 보호
    // (기존 #189: AI 시작 시점에만 5분 → 전처리 단계 무한 대기 가능했던 버그 수정)
    let globalTimeout: ReturnType<typeof setTimeout> | null = null;

    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    setElapsedSec(0);
    setSimProgress(0);
    setRealStep(0);
    setStepDetail(
      inputMode === 'youtube' ? 'YouTube 영상 정보와 자막을 수집하고 있어요'
        : inputMode === 'upload' ? '영상에서 프레임을 추출하고 있어요'
        : '영상을 다운로드하고 있어요'
    );
    setIsLongForm(false);
    failsafeFiredRef.current = false; // [FIX #454] 페일세이프 플래그 초기화
    analysisStartRef.current = Date.now();
    const perfRunId = resetAnalysisPerf(preset);
    resetResults();

    // [FIX #378 + #523] 분석 시작 직후 글로벌 타임아웃 설정 — 전처리+AI 전체 보호
    // 롱폼(10분+) 영상은 STT+프레임 추출에 시간이 더 필요하므로 타임아웃 확대
    // targetDuration이 0(원본 분량)이면 롱폼 가능성 높음
    const TOTAL_ANALYSIS_TIMEOUT_MS = (targetDuration === 0 || targetDuration > 600) ? 15 * 60 * 1000 : 8 * 60 * 1000; // 롱폼 15분, 일반 8분
    globalTimeout = setTimeout(() => {
      console.warn(`[VideoAnalysis] 전체 분석 타임아웃 (${TOTAL_ANALYSIS_TIMEOUT_MS / 60000}분) 도달 — 강제 중단`);
      abortCtrl.abort();
    }, TOTAL_ANALYSIS_TIMEOUT_MS);

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM
      : preset === 'condensed' ? CONDENSED_SCRIPT_SYSTEM
      : preset === 'deep' ? DEEP_ANALYSIS_SYSTEM
      : preset === 'shopping' ? SHOPPING_SCRIPT_SYSTEM
      : preset === 'alltts' ? ALL_TTS_SCRIPT_SYSTEM
      : SNACK_SCRIPT_SYSTEM;

    try {
      // 1단계: 영상 소스 준비 + UI 썸네일 + 메타데이터
      let videoUri = ''; // Gemini v1beta fileData용 URL (첫 번째 영상)
      let videoMime = 'video/mp4';
      let allVideoUris: string[] = []; // [FIX #189] 다중 영상 v1beta URI
      let allVideoMimes: string[] = []; // [FIX #189] 다중 영상 MIME
      let knownDurationSec = 0; // [FIX #364] 메타데이터 기반 실제 영상 길이 (프레임 타임스탬프보다 정확)
      let frames: TimedFrame[] = [];
      let inputDesc = '';
      let hasTimedTranscript = false; // [FIX #perf] YouTube 타임드 자막 성공 여부 (화자분리 스킵 판단용)
      const isMultiSource = (inputMode === 'youtube' && validYoutubeUrls.length > 1) || (inputMode === 'upload' && uploadedFiles.length > 1);
      const cachedSourcePrep = !force ? sourcePrepCacheRef.current.get(sourceCacheKey) : null;

      if (cachedSourcePrep) {
        videoUri = cachedSourcePrep.videoUri;
        videoMime = cachedSourcePrep.videoMime;
        allVideoUris = [...cachedSourcePrep.allVideoUris];
        allVideoMimes = [...cachedSourcePrep.allVideoMimes];
        knownDurationSec = cachedSourcePrep.knownDurationSec;
        frames = cachedSourcePrep.frames;
        inputDesc = cachedSourcePrep.inputDesc;
        hasTimedTranscript = cachedSourcePrep.hasTimedTranscript;
        console.log(`[VideoAnalysis] ⚡ 소스 준비 캐시 재사용: ${sourceCacheKey}`);
      } else if (uploadedFiles.length > 0) {
        // 업로드 모드: 모든 파일의 프레임 추출 + 메타데이터 수집
        videoMime = uploadedFiles[0].type || 'video/mp4';
        const allFrames: TimedFrame[] = [];
        const fileDescs: string[] = [];

        // [FIX #394] 전처리 진행 상황 표시 — 사용자가 "멈춘 건 아닌지" 불안하지 않도록
        showToast('📹 영상 프레임 추출 중...', 3000);

        // [FIX #189] 다중 영상 프레임 추출 병렬화 — 순차(90s×N) → 병렬(max 90s)
        const frameResults = await Promise.allSettled(
          uploadedFiles.map((f, fi) => extractVideoFrames(f, fi))
        );
        for (let fi = 0; fi < frameResults.length; fi++) {
          const r = frameResults[fi];
          if (r.status === 'fulfilled' && r.value.length > 0) {
            allFrames.push(...r.value);
          }
          fileDescs.push(`[소스 ${fi + 1}] ${uploadedFiles[fi].name} (${((uploadedFiles[fi].size || 0) / 1024 / 1024).toFixed(1)}MB)`);
        }
        frames = allFrames;

        // [FIX #364] 업로드 모드: 프레임 타임스탬프에서 영상 길이 추정 (WebCodecs는 dur-0.1까지 추출)
        if (allFrames.length > 0 && knownDurationSec === 0) {
          knownDurationSec = allFrames.reduce((mx, f) => Math.max(mx, f.timeSec), 0);
        }

        // [FIX #208] 프레임 추출 완전 실패 시 Cloudinary 업로드 → v1beta 영상 분석 폴백
        if (allFrames.length === 0 && uploadedFiles.length > 0) {
          showToast('⚠️ 프레임 추출 실패 — 영상을 업로드하여 분석합니다...', 5000);
          try {
            // [FIX #189] 다중 영상: 모든 파일 Cloudinary 업로드 → v1beta 다중 fileData로 동시 전달
            const uploadedVideoUris: string[] = [];
            const uploadedVideoMimes: string[] = [];
            for (let fi = 0; fi < uploadedFiles.length; fi++) {
              try {
                if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
                const hostedUrl = await uploadMediaToHosting(uploadedFiles[fi], undefined, abortCtrl.signal);
                uploadedVideoUris.push(hostedUrl);
                uploadedVideoMimes.push(uploadedFiles[fi].type || 'video/mp4');
                console.log(`[VideoAnalysis] 영상 ${fi + 1}/${uploadedFiles.length} 업로드 성공:`, hostedUrl.slice(0, 80));
              } catch (e) {
                if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
                console.warn(`[VideoAnalysis] 영상 ${fi + 1} 업로드 실패:`, e);
              }
            }
            if (uploadedVideoUris.length === 0) {
              throw new Error('영상 업로드 실패');
            }
            // v1beta에 모든 영상 URI를 동시 전달 (다중 fileData parts)
            allVideoUris = uploadedVideoUris;
            allVideoMimes = uploadedVideoMimes;
            videoUri = uploadedVideoUris[0];
            videoMime = uploadedVideoMimes[0];
          } catch (uploadErr) {
            // [FIX #386] abort 시에는 원래 에러 전파 — AbortError 정보 유지
            if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
            console.warn('[VideoAnalysis] Cloudinary 업로드도 실패:', uploadErr);
            throw new Error(
              '영상 프레임 추출에 실패했습니다.\n' +
              '• Chrome 최신 버전을 사용해 보세요\n' +
              '• 영상 파일 크기를 줄여 보세요 (300MB 이하 권장)\n' +
              '• Cloudinary 설정 시 자동 업로드 분석이 가능합니다'
            );
          }
        }

        if (isMultiSource) {
          inputDesc = `## 다중 영상 짜집기 분석 (${uploadedFiles.length}개 소스)\n\n` + fileDescs.join('\n');
        } else {
          inputDesc = `업로드된 영상 파일: ${uploadedFiles[0].name} (${((uploadedFiles[0].size || 0) / 1024 / 1024).toFixed(1)}MB)`;
        }
        if (!videoUri) videoUri = '';
      } else {
        // 링크 모드: YouTube / TikTok / 소셜 자동 감지
        const urls = validYoutubeUrls;
        const firstIsYouTube = isYouTubeUrl(urls[0]);
        const detectedPlatform = firstIsYouTube ? 'youtube' : detectPlatform(urls[0]);

        if (firstIsYouTube) {
          // ── YouTube 모드 ──
          const primaryVid = extractYouTubeVideoId(urls[0]);
          if (primaryVid) {
            // [FIX] YouTube watch URL을 그대로 Gemini v1beta에 전달
            // ✅ 실제 테스트 결과: Evolink Gemini v1beta가 YouTube URL을 내부적으로 처리하여 영상 직접 분석
            // ❌ CDN URL(googlevideo.com)은 Vertex AI robots.txt 규칙으로 차단됨 — 사용 불가
            videoUri = urls[0].trim();
          }

          // [FIX #perf] 메타데이터 + 타임코드 보존 자막을 병렬로 수집
          // 타임드 자막은 AI에게 실제 타임코드를 제공하여 정확도 향상 + 화자분리 대체
          const timedTranscriptPromise = primaryVid
            ? fetchTimedTranscriptForAnalysis(primaryVid).catch(() => null)
            : Promise.resolve(null);

          // [PERF] 댓글 fetch 제거 — 리메이크 분석에 기여도 없음 + API 할당량 절약
          const metaResults = await Promise.allSettled(
            urls.map(async (url) => {
              const vid = extractYouTubeVideoId(url);
              if (!vid) return null;
              const meta = await fetchYouTubeVideoMeta(vid);
              return { vid, url, meta };
            })
          );

          // 타임드 자막 결과 수집 (메타데이터와 병렬 실행됨)
          const timedTranscript = await timedTranscriptPromise;

          const allFrames: TimedFrame[] = [];
          const descs: string[] = [];

          for (let vi = 0; vi < metaResults.length; vi++) {
            const r = metaResults[vi];
            if (r.status !== 'fulfilled' || !r.value) continue;
            const { vid, url, meta } = r.value;
            const sourceLabel = urls.length > 1 ? `[소스 ${vi + 1}] ` : '';

            const durationSec = meta ? parseIsoDuration(meta.duration) : 60;
            // [FIX #364] 실제 영상 길이 보존 — 프레임은 75%까지만 생성되므로 세그먼트 분할에 실제 길이 필요
            if (durationSec > knownDurationSec) knownDurationSec = durationSec;
            const base = `https://img.youtube.com/vi/${vid}`;
            const ytSourceName = meta?.title ? meta.title.slice(0, 30) : `YouTube ${vi + 1}`;
            allFrames.push(
              { url: `${base}/hqdefault.jpg`, hdUrl: `${base}/maxresdefault.jpg`, timeSec: 0, sourceFileName: ytSourceName, sourceIndex: vi },
              { url: `${base}/1.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.25), sourceFileName: ytSourceName, sourceIndex: vi },
              { url: `${base}/2.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.5), sourceFileName: ytSourceName, sourceIndex: vi },
              { url: `${base}/3.jpg`, hdUrl: `${base}/hqdefault.jpg`, timeSec: Math.round(durationSec * 0.75), sourceFileName: ytSourceName, sourceIndex: vi },
            );

            if (meta) {
              // [PERF] 조회수/좋아요/댓글 제거 — 리메이크 분석에 불필요 (AI Studio 스타일)
              descs.push(`${sourceLabel}## YouTube 영상 정보
- **제목**: ${meta.title}
- **채널**: ${meta.channelTitle}
- **영상 길이**: ${meta.duration} (${durationSec}초)
- **태그**: ${meta.tags.slice(0, 30).join(', ') || '없음'}
- **URL**: ${url.trim()}

### 영상 설명(Description)
${meta.description.slice(0, 1500)}${meta.description.length > 1500 ? '\n...(이하 생략)' : ''}`);
            } else {
              descs.push(`${sourceLabel}YouTube 영상 URL: ${url.trim()}`);
            }
          }

          frames = allFrames;

          if (isMultiSource) {
            inputDesc = `## 다중 영상 짜집기 분석 (${urls.length}개 소스)\n아래 ${urls.length}개 영상의 핵심 장면을 조합하여 하나의 새로운 영상을 만들어야 합니다.\n각 소스의 가장 매력적인 구간을 골라 짜집기(재편집) 편집표를 작성해주세요.\n\n` + descs.join('\n\n---\n\n');
          } else {
            inputDesc = descs[0] || `YouTube 영상 URL: ${urls[0]?.trim() || ''}`;
          }

          // [FIX #perf] 타임드 자막이 있으면 inputDesc에 추가 — AI가 실제 타임코드 기반으로 편집표 작성
          if (timedTranscript) {
            inputDesc += `\n\n---\n${timedTranscript}`;
            hasTimedTranscript = true;
            console.log(`[VideoAnalysis] ✅ 타임코드 보존 자막 Gemini 입력에 추가 완료`);
          }
        } else {
          // ── 소셜 모드 (TikTok / Douyin / Xiaohongshu 등) ──
          const platformLabel = detectedPlatform === 'tiktok' ? 'TikTok'
            : detectedPlatform === 'douyin' ? '더우인'
            : detectedPlatform === 'xiaohongshu' ? '샤오홍슈'
            : '소셜 영상';

          const allFrames: TimedFrame[] = [];
          const descs: string[] = [];
          showToast(
            urls.length > 1
              ? `${platformLabel} ${urls.length}개 소스를 병렬 분석 준비 중...`
              : `${platformLabel} 영상 분석 준비 중...`,
            2500,
          );

          const socialResults = await Promise.allSettled(
            urls.map(async (rawUrl, vi) => {
              const url = rawUrl.trim();
              if (!url) return null;
              const sourceLabel = urls.length > 1 ? `[소스 ${vi + 1}] ` : '';
              const [socialMetaResult, downloadResult] = await Promise.allSettled([
                getSocialMetadata(url, true),
                downloadSocialVideo(url, '720p', undefined, { signal: abortCtrl.signal }),
              ]);

              const socialMeta = socialMetaResult.status === 'fulfilled' ? socialMetaResult.value : null;
              if (socialMetaResult.status === 'rejected') {
                console.warn(`[VideoAnalysis] 소셜 메타데이터 수집 실패 (${url}):`, socialMetaResult.reason);
              }

              const videoBlob = downloadResult.status === 'fulfilled' ? downloadResult.value.blob : null;
              if (downloadResult.status === 'rejected') {
                console.warn(`[VideoAnalysis] 소셜 영상 다운로드 실패 (${url}):`, downloadResult.reason);
              }

              const durationSec = socialMeta?.duration || 60;
              const sourceName = socialMeta?.title ? socialMeta.title.slice(0, 30) : `${platformLabel} ${vi + 1}`;
              let extractedFrames: TimedFrame[] = [];

              if (videoBlob) {
                const blobUrl = URL.createObjectURL(videoBlob);
                logger.registerBlobUrl(blobUrl, 'video', 'VideoAnalysisRoom:socialDownload', videoBlob.size / (1024 * 1024));
                const sampleTimes = [0, Math.round(durationSec * 0.25), Math.round(durationSec * 0.5), Math.round(durationSec * 0.75)];
                try {
                  extractedFrames = (await canvasExtractFrames(blobUrl, sampleTimes, true)).map(f => ({
                    ...f,
                    sourceFileName: sourceName,
                    sourceIndex: vi,
                  }));
                } catch (frameError) {
                  if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
                  console.warn(`[VideoAnalysis] 소셜 프레임 추출 실패 (${url}):`, frameError);
                }
              } else if (socialMeta?.thumbnail) {
                extractedFrames = [
                  { url: socialMeta.thumbnail, hdUrl: socialMeta.thumbnail, timeSec: 0, sourceFileName: sourceName, sourceIndex: vi },
                  { url: socialMeta.thumbnail, hdUrl: socialMeta.thumbnail, timeSec: Math.round(durationSec * 0.5), sourceFileName: sourceName, sourceIndex: vi },
                ];
              }

              const desc = socialMeta
                // [PERF] 조회수/좋아요/댓글 제거 — 리메이크 분석에 불필요
                ? `${sourceLabel}## ${platformLabel} 영상 정보
- **제목**: ${socialMeta.title || '(제목 없음)'}
- **크리에이터**: ${socialMeta.uploader || '알 수 없음'}
- **영상 길이**: ${socialMeta.duration || 0}초
- **URL**: ${url}

### 영상 설명
${(socialMeta.description || '').slice(0, 1500)}${(socialMeta.description || '').length > 1500 ? '\n...(이하 생략)' : ''}`
                : `${sourceLabel}${platformLabel} 영상 URL: ${url}`;

              return {
                desc,
                durationSec,
                frames: extractedFrames,
                videoBlob,
              };
            }),
          );

          let socialBlobForStore: Blob | null = null;
          for (const result of socialResults) {
            if (result.status !== 'fulfilled' || !result.value) continue;
            const { desc, durationSec, frames: sourceFrames, videoBlob } = result.value;
            descs.push(desc);
            allFrames.push(...sourceFrames);
            if (durationSec > knownDurationSec) knownDurationSec = durationSec;
            if (!socialBlobForStore && videoBlob) socialBlobForStore = videoBlob;
          }
          if (socialBlobForStore) {
            useVideoAnalysisStore.getState().setVideoBlob(socialBlobForStore);
          }

          frames = allFrames;
          videoUri = ''; // 소셜은 Gemini v1beta 미지원

          if (isMultiSource) {
            inputDesc = `## 다중 영상 짜집기 분석 (${urls.length}개 소스)\n아래 ${urls.length}개 ${platformLabel} 영상의 핵심 장면을 조합하여 하나의 새로운 영상을 만들어야 합니다.\n각 소스의 가장 매력적인 구간을 골라 짜집기(재편집) 편집표를 작성해주세요.\n\n` + descs.join('\n\n---\n\n');
          } else {
            inputDesc = descs[0] || `${platformLabel} 영상 URL: ${urls[0]?.trim() || ''}`;
          }
        }
      }

      if (!cachedSourcePrep) {
        setLimitedCacheEntry(sourcePrepCacheRef.current, sourceCacheKey, {
          videoUri,
          videoMime,
          allVideoUris: [...allVideoUris],
          allVideoMimes: [...allVideoMimes],
          knownDurationSec,
          frames,
          inputDesc,
          hasTimedTranscript,
        });
      }
      setThumbnails(frames);

      // [FIX #386] 프레임 추출 완료 후 abort 체크 — 전처리 중 타임아웃 시 AI 호출 전 빠른 종료
      if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');

      // [FIX #364] 롱폼 감지: 메타데이터 실제 길이 우선, 프레임 타임스탬프 폴백
      // (프레임은 75% 지점까지만 생성되므로 실제 길이가 더 정확)
      const frameMaxSec = frames.reduce((mx, f) => Math.max(mx, f.timeSec), 0);
      const maxTimeSec = Math.max(frameMaxSec, knownDurationSec);
      setIsLongForm(maxTimeSec >= 300);
      addAnalysisPerfStage(perfRunId, 'preload', '전처리');
      // ★ 실제 단계 전환: 소스 준비 완료 → 오디오 분석 단계
      setRealStep(1);
      let singleSourceSceneCutsPromise: Promise<SceneCut[] | null> | null =
        !isMultiSource && cachedSourcePrep && cachedSourcePrep.singleSourceSceneCuts !== undefined
          ? Promise.resolve(cachedSourcePrep.singleSourceSceneCuts)
          : null;
      let parallelDownloadBlobPromise: Promise<{ blob: Blob; hasAudio: boolean } | null> = Promise.resolve(null);

      // ★ YouTube 병렬 다운로드 + 씬 감지 시작 (AI 분석과 동시 실행)
      let parallelDownloadPromise: Promise<{ blob: Blob; sceneCuts: SceneCut[] } | null> = Promise.resolve(null);
      if (!singleSourceSceneCutsPromise && inputMode === 'youtube' && isYouTubeUrl(youtubeUrl)) {
        const dlVid = extractYouTubeVideoId(youtubeUrl);
        if (dlVid) {
          parallelDownloadBlobPromise = (async () => {
            try {
              console.log('[Scene] ★ AI 분석과 병렬로 영상 다운로드 시작...');
              const dlResult = await downloadVideoAsBlob(dlVid);
              if (!dlResult) { console.warn('[Scene] 다운로드 실패 → 기존 폴백 사용'); return null; }
              useVideoAnalysisStore.getState().setVideoBlob(dlResult.blob, dlResult.hasAudio);
              console.log(`[Scene] ✅ 다운로드 완료 (${(dlResult.blob.size / 1024 / 1024).toFixed(1)}MB)`);
              return { blob: dlResult.blob, hasAudio: dlResult.hasAudio };
            } catch (e) {
              console.warn('[Scene] 병렬 다운로드 실패:', e);
              return null;
            }
          })();
          parallelDownloadPromise = parallelDownloadBlobPromise.then(async (downloadResult) => {
            if (!downloadResult?.blob) return null;
            try {
              console.log('[Scene] 다운로드 완료, 씬 감지 시작...');
              const sceneCuts = await detectSceneCuts(downloadResult.blob);
              console.log(`[Scene] ✅ 씬 감지 완료: ${sceneCuts.length}개 컷 포인트`);
              const cachedEntry = sourcePrepCacheRef.current.get(sourceCacheKey);
              if (cachedEntry) {
                setLimitedCacheEntry(sourcePrepCacheRef.current, sourceCacheKey, {
                  ...cachedEntry,
                  singleSourceSceneCuts: sceneCuts,
                });
              }
              return { blob: downloadResult.blob, sceneCuts };
            } catch (e) {
              console.warn('[Scene] 병렬 씬 감지 실패:', e);
              return { blob: downloadResult.blob, sceneCuts: [] };
            }
          });
          singleSourceSceneCutsPromise = parallelDownloadPromise
            .then((result) => result?.sceneCuts || null)
            .catch(() => null);
        }
      } else if (!singleSourceSceneCutsPromise && !isMultiSource && uploadedFiles.length === 1) {
        const uploadBlob = uploadedFiles[0] instanceof File ? uploadedFiles[0] : new Blob([uploadedFiles[0]]);
        singleSourceSceneCutsPromise = detectSceneCuts(uploadBlob).catch(() => null);
      } else if (!singleSourceSceneCutsPromise && !isMultiSource) {
        const existingBlob = useVideoAnalysisStore.getState().videoBlob;
        if (existingBlob) {
          singleSourceSceneCutsPromise = detectSceneCuts(existingBlob).catch(() => null);
        }
      }
      if (singleSourceSceneCutsPromise) {
        singleSourceSceneCutsPromise = singleSourceSceneCutsPromise.then((sceneCuts) => {
          const cachedEntry = sourcePrepCacheRef.current.get(sourceCacheKey);
          if (cachedEntry) {
            setLimitedCacheEntry(sourcePrepCacheRef.current, sourceCacheKey, {
              ...cachedEntry,
              singleSourceSceneCuts: sceneCuts,
            });
          }
          return sceneCuts;
        });
      }

      // ★ [v4.6 + FIX #316 + FIX #perf + FIX #perf-v2] 화자 분리 전사 — 조건부 실행
      // Gemini 3.1 Pro v1beta는 영상의 오디오를 직접 분석하므로 별도 화자분리 불필요
      // v1beta 사용 불가할 때만 (업로드 Cloudinary 실패, 소셜 미디어) ElevenLabs 화자분리 실행
      // YouTube 타임드 자막은 부정확할 수 있으므로 자막 유무와 무관하게 Gemini가 직접 들어야 함
      let diarizedText = '';
      let diarizedUtterances: Array<{ speakerId: string; text: string; startTime: number; endTime: number }> = [];
      const diarizePresets = ['tikitaka', 'condensed', 'snack', 'alltts'];
      const hasV1betaVideo = allVideoUris.length > 0 || !!videoUri;
      const needsDiarization = diarizePresets.includes(preset) && !hasV1betaVideo;
      // ★ 실제 단계 전환: 오디오 분석 단계 상세 메시지
      if (needsDiarization) {
        setStepDetail('영상 음성에서 화자를 분리하고 있어요');
      } else if (hasV1betaVideo) {
        // v1beta 사용 가능 → 오디오 분석 스킵 → 바로 편집표 생성 단계로
        setStepDetail('Gemini가 영상의 화면과 소리를 직접 분석할 준비를 하고 있어요');
        setRealStep(2);
      }
      const cachedDiarization = !force ? sourceDiarizationCacheRef.current.get(sourceCacheKey) : null;
      const remixDownloadWaitBudgetMs = maxTimeSec >= 300
        ? REMIX_YOUTUBE_DOWNLOAD_WAIT_BUDGET_LONG_MS
        : REMIX_YOUTUBE_DOWNLOAD_WAIT_BUDGET_SHORT_MS;
      const remixDiarizationWaitBudgetMs = maxTimeSec >= 300
        ? REMIX_DIARIZATION_WAIT_BUDGET_LONG_MS
        : REMIX_DIARIZATION_WAIT_BUDGET_SHORT_MS;

      if (needsDiarization && cachedDiarization) {
        diarizedText = cachedDiarization.diarizedText;
        diarizedUtterances = cachedDiarization.diarizedUtterances;
        console.log(`[Diarization] ⚡ 전사 캐시 재사용: ${sourceCacheKey}`);
      } else if (needsDiarization) {
        try {
          // [FIX #394] 화자 분리 진행 상황 표시
          showToast('🗣️ 음성 분석 중...', 3000);
          let audioSource: File | Blob | null = null;
          let skippedForBudget = false;

          if (uploadedFiles.length === 1) {
            // 업로드 모드: 파일 직접 사용
            audioSource = uploadedFiles[0];
          } else if (inputMode === 'youtube' && youtubeUrl) {
            // [FIX #668] YouTube 리메이크는 씬 감지가 아니라 영상 Blob까지만 짧게 기다린다.
            // 다운로드가 지연되면 화자 분리를 생략하고 AI 분석을 먼저 진행한다.
            const { timedOut, value: dlResult } = await waitForSoftTimeout(parallelDownloadBlobPromise, remixDownloadWaitBudgetMs, {
              signal: abortCtrl.signal,
            });
            if (dlResult?.blob) {
              audioSource = dlResult.blob;
              console.log(`[Diarization] YouTube 다운로드 Blob 사용 (${(dlResult.blob.size / 1024 / 1024).toFixed(1)}MB)`);
            } else if (timedOut) {
              skippedForBudget = true;
              console.warn(`[Diarization] YouTube 원본 대기 ${remixDownloadWaitBudgetMs}ms 초과 — 화자 분리 생략`);
              showToast('원본 영상 다운로드가 지연되어 이번에는 메타데이터 기준으로 먼저 분석합니다.', 5000);
            }
          }
          if (!audioSource) {
            const existingBlob = useVideoAnalysisStore.getState().videoBlob;
            if (existingBlob) {
              audioSource = existingBlob;
              console.log(`[Diarization] 저장된 원본 Blob 재사용 (${(existingBlob.size / 1024 / 1024).toFixed(1)}MB)`);
            }
          }

          if (audioSource) {
            console.log(`[Diarization] 화자 분리 시작 (${(audioSource.size / 1024 / 1024).toFixed(1)}MB)...`);
            let recoveryToastShown = false;
            const diarizationResult = await runAbortableTaskWithBudget(
              (diarizationSignal) => transcribeVideoAudio(
                audioSource instanceof File ? audioSource : new File([audioSource], 'video.mp4', { type: 'video/mp4' }),
                {
                  signal: diarizationSignal,
                  onProgress: (msg) => {
                    console.log(`[Diarization] ${msg}`);
                    if (!recoveryToastShown && msg.includes('자동 복구')) {
                      recoveryToastShown = true;
                      showToast('🔁 음성 전사 자동 복구 중...', 4000);
                    }
                  },
                  failOnError: true,
                },
              ),
              remixDiarizationWaitBudgetMs,
              { signal: abortCtrl.signal },
            );
            const diarResult = diarizationResult.value;
            if (diarizationResult.timedOut) {
              skippedForBudget = true;
              console.warn(`[Diarization] 화자 분리 ${remixDiarizationWaitBudgetMs}ms 초과 — 이번 분석은 화자 분리 없이 진행`);
              showToast('음성 전사가 길어져 이번에는 먼저 편집표를 만들고 나머지 보정은 뒤에서 계속 진행합니다.', 5000);
            }
            if (diarResult) {
              diarizedText = diarResult.formattedText;
              // [FIX #364] 롱폼 배치별 세그먼트 전사를 위해 utterances도 보존
              diarizedUtterances = (diarResult.transcript.utterances || []).map(u => ({
                speakerId: u.speakerId, text: u.text, startTime: u.startTime, endTime: u.endTime,
              }));
              setLimitedCacheEntry(sourceDiarizationCacheRef.current, sourceCacheKey, {
                diarizedText,
                diarizedUtterances,
              });
              console.log(`[Diarization] ✅ 화자 ${diarResult.transcript.speakerCount}명 감지, ${diarResult.transcript.utterances?.length}개 발화`);
            }
          } else if (!skippedForBudget) {
            console.warn('[Diarization] 사용할 오디오를 확보하지 못해 화자 분리 없이 진행');
          }
        } catch (e) {
          if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
          // [FIX #829] Cloudinary 미설정 등으로 전사 실패 시 분석 중단이 아닌 화자 분리 없이 진행
          // 배경: uploadPreset 비어있으면 STT 업로드 실패 → 자동 복구도 실패 → 분석 전체 중단이었음
          // 이제는 화자 분리 없이 Gemini 단독 분석으로 진행 (정확도 저하 가능하지만 분석 자체는 수행)
          const errMsg = e instanceof Error ? e.message : String(e);
          console.warn('[Diarization] 전사 실패 — 화자 분리 없이 분석 계속 진행:', errMsg);
          showToast('⚠️ 음성 전사에 실패하여 화자 분리 없이 분석합니다. Cloudinary 설정을 확인해주세요.', 6000);
        }
      } else if (diarizePresets.includes(preset) && hasV1betaVideo) {
        console.log(`[Diarization] ⚡ Gemini v1beta 오디오 직접 분석 — 화자분리 스킵 (30~45초 절감)${hasTimedTranscript ? ' (타임드 자막도 보조 참조)' : ''}`);
      }

      // [FIX #386] 화자 분리 완료 후 abort 체크
      if (abortCtrl.signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');

      // 화자 분리 결과가 있으면 inputDesc에 추가
      if (diarizedText) {
        inputDesc += `\n\n---\n${diarizedText}\n\n위 화자 분리 전사 결과는 ElevenLabs AI가 영상 오디오에서 자동 추출한 것입니다.\n각 화자(speaker_0, speaker_1, ...)의 대사와 타이밍을 편집 테이블에 정확히 반영하세요.\n동일 컷에서 화자가 바뀌면 반드시 행을 분리하세요.`;
      }
      addAnalysisPerfStage(perfRunId, 'diarization', '음성 단계');

      // ★ 실제 단계 전환: AI 편집표 생성 단계
      setRealStep(2);
      const presetLabel = preset === 'tikitaka' ? '티키타카' : preset === 'snack' ? '스낵형'
        : preset === 'condensed' ? '축약 리캡' : preset === 'shopping' ? '쇼핑형'
        : preset === 'alltts' ? 'All TTS' : '심층 분석';
      setStepDetail(
        hasV1betaVideo
          ? `Gemini가 영상을 직접 시청하며 ${presetLabel} 편집표를 만들고 있어요`
          : `AI가 ${presetLabel} 편집표를 생성하고 있어요`
      );

      // 2단계: AI 분석 — 적응형 단일/배치 호출
      // [FIX #454] 전처리 완료 후 글로벌 타임아웃을 AI 전용으로 교체
      // 단, 글로벌 타임아웃(8분)이 아직 남아있으면 유지하고 AI 타임아웃만 추가
      // [FIX #678] deep/heavy 프리셋은 AI 타임아웃 8분 (Pro 모델 폴백 체인이 길어 5분으로 부족)
      if (globalTimeout) clearTimeout(globalTimeout);
      const isHeavyPresetForTimeout = preset === 'deep' || preset === 'alltts';
      const AI_TIMEOUT_MS = isHeavyPresetForTimeout ? 8 * 60 * 1000 : 5 * 60 * 1000;
      globalTimeout = setTimeout(() => {
        console.warn(`[VideoAnalysis] AI 분석 타임아웃 (${AI_TIMEOUT_MS / 60000}분) 도달 — 강제 중단`);
        abortCtrl.abort();
      }, AI_TIMEOUT_MS);

      const currentTargetDuration = useVideoAnalysisStore.getState().targetDuration;
      const currentKeepOrder = useVideoAnalysisStore.getState().keepOriginalOrder;
      const currentVersionCount = useVideoAnalysisStore.getState().versionCount;
      // deep/shopping은 최대 5개, 나머지는 최대 10개
      const effectiveVersionCount = (preset === 'deep' || preset === 'shopping')
        ? Math.min(currentVersionCount, 5)
        : currentVersionCount;
      const sourceCutCountHint = (preset === 'tikitaka' || preset === 'snack')
        ? await waitForPromptSceneCutCount(singleSourceSceneCutsPromise, REMIX_PROMPT_SCENE_CUT_TIMEOUT_MS)
        : 0;
      const keepOrderInstruction = currentKeepOrder && (preset === 'snack' || preset === 'tikitaka')
        ? `\n\n### ⚠️ 사용자 설정: 원본 순서 유지 모드 (최우선 적용)
- **비선형 재배치를 하지 마세요.** 원본 영상의 시간순서를 그대로 유지하세요.
- 1번 컷부터 마지막 컷까지 원본 영상의 타임라인 순서를 따르세요.
- "후킹과 비선형 재배치" 규칙을 무시하고, 대신 원본 순서 그대로 편집표를 작성하세요.
- 나머지 규칙(자막 이원화, 속도감, 컷 길이, 효과자막, 이모지 등)은 모두 동일하게 적용하세요.
- 사용자가 이미 기획한 장면 순서를 유지하면서 자막만 추출하는 것이 목적입니다.`
        : '';
      const buildPromptForBatch = (
        versionOffset: number = 0,
        batchVersionCount: number = effectiveVersionCount,
      ): string => {
        let prompt = buildUserMessage(
          inputDesc,
          preset,
          currentTargetDuration,
          effectiveVersionCount,
          knownDurationSec,
          sourceCutCountHint,
          versionOffset,
          batchVersionCount,
        );
        if (keepOrderInstruction) prompt += keepOrderInstruction;
        return prompt;
      };
      const userPrompt = buildPromptForBatch();

      const signal = abortCtrl.signal;

      // 기본은 단일 호출, 필요 시에만 적응형 병렬 배치로 분할

      // [FIX #364][FIX #948] 롱폼 할루시네이션 방지: 10분+ → 0.2, 5분+ → 0.3, 나머지 → 0.5
      const effectiveTemp = maxTimeSec >= 600 ? 0.2 : maxTimeSec >= 300 ? 0.3 : 0.5;

      /** [FIX #262][FIX #679][FIX #678] 텍스트 전용 폴백 — Evolink 스트리밍 → Smart Routing (KIE 포함)
       * v1beta 타임아웃/네트워크 에러 직후에도 안정적으로 동작하도록 500ms 대기 + 타임아웃 적용
       * [FIX #678] abort signal + skipFlashLite 전달 — 타임아웃 후 zombie 요청 방지 + deep 프리셋 품질 보호 */
      const textFallbackAI = async (prompt: string, tokens: number): Promise<string> => {
        const messages: EvolinkChatMessage[] = [
          { role: 'system', content: scriptSystem },
          { role: 'user', content: prompt },
        ];
        // [FIX #679] v1beta 실패 직후 v1도 즉시 실패하는 현상 방지: 500ms 대기
        await new Promise(r => setTimeout(r, 500));
        try {
          return await evolinkChatStream(messages, () => {}, { temperature: effectiveTemp, maxTokens: tokens, signal, timeoutMs: 90_000 });
        } catch (streamErr) {
          if (signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
          console.warn('[VideoAnalysis] Evolink 스트리밍 실패, Smart Routing 폴백:', streamErr);
          // [FIX #679 Codex 2차 P2] requestGeminiProxy에도 90초 타임아웃 적용 — 폴백 체인 전체 바운딩
          const payload = {
            contents: [{ role: 'user', parts: [{ text: scriptSystem + '\n\n' + prompt }] }],
            generationConfig: { temperature: effectiveTemp, maxOutputTokens: tokens },
            safetySettings: SAFETY_SETTINGS_BLOCK_NONE,
          };
          // [FIX #678] signal + skipFlashLite 전달: 영상 분석 모든 프리셋에서 Flash Lite 품질 저하 방지
          // Flash Lite는 어떤 프리셋의 복잡한 편집 프로토콜도 처리 불가 → KIE 3.1 Pro가 최종 폴백
          // [FIX #678 Codex R9 P1] heavy 프리셋은 Smart Routing 타임아웃도 연장 (90s → 180s)
          const smartRoutingTimeoutMs = isHeavyPresetForTimeout ? 180_000 : 90_000;
          const data = await requestGeminiProxy('gemini-3.1-pro-preview', payload, 0, smartRoutingTimeoutMs, {
            signal,
            skipFlashLite: true,
          });
          return extractTextFromResponse(data);
        }
      };

      /** 단일 AI 호출 실행 (공통 라우팅 로직) */
      const callAI = async (prompt: string, tokens: number): Promise<string> => {
        const effectiveFrames = frames;
        // [FIX #189] 다중 영상 URI가 있으면 v1beta에 전체 전달
        const effectiveUris = allVideoUris.length > 0 ? allVideoUris : videoUri ? [videoUri] : [];
        const effectiveMimes = allVideoUris.length > 0 ? allVideoMimes : [videoMime];
        if (effectiveUris.length > 0) {
          try {
            return await evolinkVideoAnalysisStream(
              effectiveUris.length === 1 ? effectiveUris[0] : effectiveUris,
              effectiveMimes.length === 1 ? effectiveMimes[0] : effectiveMimes,
              scriptSystem, prompt,
              () => {}, { temperature: effectiveTemp, maxOutputTokens: tokens, signal }
            );
          } catch (videoErr: any) {
            if (signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
            // [FIX #679] 타임아웃/네트워크 에러 시 사용자에게 자동 전환 알림
            const isTimeout = videoErr?.message?.includes('타임아웃') || videoErr?.message?.includes('timeout') || videoErr?.message?.includes('Failed to fetch');
            if (isTimeout) {
              console.warn('[VideoAnalysis] v1beta 타임아웃/네트워크 에러, 자동 폴백:', videoErr.message);
            } else {
              console.warn('[VideoAnalysis] v1beta 실패, 폴백:', videoErr);
            }

            // ★ [Codex R4] v1beta 실패 → lazy diarization 1회 실행 (뮤텍스로 중복 방지)
            await runLazyDiarizationOnce();
            // [Codex R5] lazy diarization 결과가 있으면 폴백 프롬프트에 대사 데이터 주입
            const fbPrompt = diarizedText && !prompt.includes(diarizedText)
              ? prompt + `\n\n---\n${diarizedText}\n\n위 화자 분리 전사 결과를 편집 테이블에 정확히 반영하세요.`
              : prompt;

            // [FIX #264] 프레임 분석 실패 시에도 텍스트 폴백으로 이어지도록 try/catch 추가
            if (effectiveFrames.length > 0) {
              try {
                return await analyzeWithFrames(effectiveFrames, fbPrompt, scriptSystem, tokens, signal, effectiveTemp);
              } catch (frameErr) {
                if (signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
                console.warn('[VideoAnalysis] 프레임 분석도 실패, 텍스트 폴백:', frameErr);
              }
            }
            // [FIX #369] 텍스트 전용 모드 — 영상/프레임 분석 모두 실패 시 메타데이터만으로 분석
            const textOnlyNotice = '\n\n⚠️ [텍스트 전용 모드] 영상 원본 분석과 프레임 이미지 분석이 모두 실패했습니다. 첨부된 프레임 이미지나 영상 화면이 없으므로, 위에 제공된 메타데이터(제목, 설명, 태그, 전사 텍스트)만을 기반으로 분석하세요. 실제로 보지 못한 장면이나 화면을 상상·추측하여 작성하지 마세요. 타임코드는 메타데이터의 영상 길이 정보를 기반으로 균등 배분하세요.';
            return await textFallbackAI(fbPrompt + textOnlyNotice, tokens);
          }
        } else if (uploadedFiles.length > 0 && effectiveFrames.length > 0) {
          // [FIX #833] analyzeWithFrames 내부에서 체험판 Google Gemini 키 폴백 처리
          // [FIX #909] Evolink 잔액 소진 시 전사 데이터 기반 텍스트 폴백 추가
          try {
            return await analyzeWithFrames(effectiveFrames, prompt, scriptSystem, tokens, signal, effectiveTemp);
          } catch (uploadFrameErr) {
            if (signal.aborted) throw new DOMException('분석이 취소되었습니다.', 'AbortError');
            console.warn('[VideoAnalysis] 업로드 프레임 분석 실패, 폴백 시도:', uploadFrameErr);
            // 이미 확보된 전사 데이터가 있으면 텍스트 폴백 (할루시네이션 위험 낮음)
            // 주: runLazyDiarizationOnce()는 videoUri 경로 전용 — 업로드 경로에서는 eager diarization 결과만 사용
            if (diarizedText) {
              const fbPrompt = !prompt.includes(diarizedText)
                ? prompt + `\n\n---\n${diarizedText}\n\n위 화자 분리 전사 결과를 편집 테이블에 정확히 반영하세요.`
                : prompt;
              const textOnlyNotice = '\n\n⚠️ [텍스트 전용 모드] 프레임 이미지 분석이 실패했습니다. 위에 제공된 메타데이터와 전사 텍스트만을 기반으로 분석하세요. 실제로 보지 못한 장면이나 화면을 상상·추측하여 작성하지 마세요.';
              return await textFallbackAI(fbPrompt + textOnlyNotice, tokens);
            }
            // 전사 데이터도 없으면 에러 전파 (텍스트 폴백 시 할루시네이션 위험)
            throw uploadFrameErr;
          }
        } else {
          // [FIX #262] 텍스트 전용 경로도 Smart Routing 적용
          return await textFallbackAI(prompt, tokens);
        }
      };

      let text: string;
      let parsed: VersionItem[];

      // ★ [FIX #582] 동적 maxTokens — 프리셋/버전수/영상길이 기반 최적화
      // 숏폼+소규모 버전: 토큰 절감 → API 응답 속도 향상
      // [FIX #582 v2] Codex 리뷰 P1: alltts/deep 롱폼 perVersion을 프롬프트 실제 요구량에 맞게 상향
      // [FIX #582 v3] Codex 144조합 검증 결과 반영: snack/tikitaka/alltts perVersion 상향
      // alltts: 롱폼 영상은 버전당 행 수가 duration/10 이상 → 토큰도 비례 증가
      const allttsPerVersion = knownDurationSec >= 600
        ? Math.round(4000 * Math.max(1, knownDurationSec / 600))
        : 4000;
      const perVersionTokens: Record<string, number> = {
        snack: 1400, condensed: 1100, tikitaka: 1900,
        shopping: 1500, alltts: allttsPerVersion, deep: 4000,
      };
      const fixedOverheadTokens: Record<string, number> = {
        snack: 1000, condensed: 1000, tikitaka: 1600,
        shopping: 1600, alltts: 3500, deep: 8000,
      };
      const pvt = perVersionTokens[preset] || 1400;
      const fot = fixedOverheadTokens[preset] || 1400;
      const sourceFactor = knownDurationSec >= 600 ? 1.3 : knownDurationSec > 180 ? 1.15 : 1.0;
      const minTokensCap = preset === 'deep' ? 25000 : preset === 'alltts' ? 22000 : 14000;
      const isHeavyPreset = preset === 'deep' || preset === 'alltts';
      const maxTokensCap = knownDurationSec <= 75 ? 28000
        : isHeavyPreset && knownDurationSec > 300 ? 65000
        : isHeavyPreset ? 55000
        : 36000;
      const estimatedTotalTokens = Math.round(fot + pvt * effectiveVersionCount * sourceFactor);
      const safeLimitPerCall = Math.max(PER_CALL_SAFE_LIMIT - fot, pvt);
      const maxVersionsPerCall = Math.max(1, Math.floor(safeLimitPerCall / Math.max(1, pvt * sourceFactor)));
      const shouldSplitBatches = estimatedTotalTokens > PER_CALL_SAFE_LIMIT
        && effectiveVersionCount > 1
        && maxVersionsPerCall < effectiveVersionCount;
      // 균등 분할: [9,1] 대신 [5,5] 형태로 배치 크기를 균등하게 분배
      const batchCount = shouldSplitBatches ? Math.ceil(effectiveVersionCount / maxVersionsPerCall) : 1;
      const versionsPerBatch = shouldSplitBatches ? Math.ceil(effectiveVersionCount / batchCount) : effectiveVersionCount;
      const buildMaxTokens = (
        requestedVersionCount: number,
        perCallCap: number = maxTokensCap,
      ): number => Math.min(
        Math.max(Math.round(fot + pvt * requestedVersionCount * sourceFactor), minTokensCap),
        perCallCap,
      );
      const maxTokens = buildMaxTokens(effectiveVersionCount);
      const splitMaxTokensCap = Math.min(maxTokensCap, PER_CALL_SAFE_LIMIT);
      const analysisBatches = shouldSplitBatches
        ? Array.from(
            { length: Math.ceil(effectiveVersionCount / versionsPerBatch) },
            (_, batchIndex) => {
              const versionOffset = batchIndex * versionsPerBatch;
              const versionCount = Math.min(versionsPerBatch, effectiveVersionCount - versionOffset);
              return {
                versionOffset,
                versionCount,
                maxTokens: buildMaxTokens(versionCount, splitMaxTokensCap),
              };
            },
          )
        : [{ versionOffset: 0, versionCount: effectiveVersionCount, maxTokens }];
      if (uploadedFiles.length > 0 && frames.length > 0 && !videoUri) {
        showToast('프레임 기반 분석 모드로 진행합니다. 잠시만 기다려주세요...', 4000);
      }

      // ★ [Codex R1~R4] v1beta 실패 시 lazy diarization — 뮤텍스로 1회만 실행
      // 프로브 제거 (비용 2배 발생) → 대신 첫 v1beta 실패 시 1회만 lazy diarization 실행
      // 결과를 inputDesc에 반영하여 후속 배치 프롬프트가 자동으로 대사 데이터를 참조하도록 보장
      // [Codex R6] Promise 기반 싱글톤 — 병렬 배치가 모두 같은 Promise를 await하여
      // diarization 완료 전에 후속 배치가 빈 diarizedText로 진행하는 문제 방지
      let lazyDiarizationPromise: Promise<void> | null = null;
      const runLazyDiarizationOnce = (): Promise<void> => {
        if (diarizedText || hasTimedTranscript) return Promise.resolve();
        if (!hasV1betaVideo || !diarizePresets.includes(preset)) return Promise.resolve();
        if (lazyDiarizationPromise) return lazyDiarizationPromise; // 이미 실행 중 → 동일 Promise 반환
        lazyDiarizationPromise = (async () => { // 최초 1회만 실행
        console.log('[Diarization] ⚠️ v1beta 실패 → lazy diarization 시도');
        setStepDetail('v1beta 분석 불가 — 음성에서 화자를 분리하고 있어요');
        setRealStep(1);
        try {
          let lazyAudioSource: File | Blob | null = uploadedFiles.length > 0 ? uploadedFiles[0] : null;
          if (!lazyAudioSource) {
            const existingBlob = useVideoAnalysisStore.getState().videoBlob;
            if (existingBlob) lazyAudioSource = existingBlob;
          }
          if (!lazyAudioSource) {
            const LAZY_DL_BUDGET_MS = 20_000;
            const { value: dlResult } = await waitForSoftTimeout(parallelDownloadBlobPromise, LAZY_DL_BUDGET_MS, { signal });
            if (dlResult?.blob) lazyAudioSource = dlResult.blob;
          }
          if (lazyAudioSource) {
            const lazyResult = await transcribeVideoAudio(
              lazyAudioSource instanceof File ? lazyAudioSource : new File([lazyAudioSource], 'video.mp4', { type: 'video/mp4' }),
              { signal, failOnError: false },
            );
            if (lazyResult) {
              diarizedText = lazyResult.formattedText;
              diarizedUtterances = (lazyResult.transcript.utterances || []).map(u => ({
                speakerId: u.speakerId, text: u.text, startTime: u.startTime, endTime: u.endTime,
              }));
              inputDesc += `\n\n---\n${diarizedText}\n\n위 화자 분리 전사 결과를 편집 테이블에 정확히 반영하세요.`;
              console.log(`[Diarization] ✅ lazy diarization 완료 — 화자 ${lazyResult.transcript.speakerCount}명`);
            }
          }
        } catch (diaErr) {
          console.warn('[Diarization] lazy diarization 실패 (프레임/텍스트 폴백으로 진행):', diaErr);
        }
        setRealStep(2);
        setStepDetail(`AI가 ${presetLabel} 편집표를 생성하고 있어요`);
        })();
        return lazyDiarizationPromise;
      };

      if (!shouldSplitBatches) {
        text = await callAI(userPrompt, maxTokens);
        // [FIX] AI 응답 수신 즉시 글로벌 타임아웃 해제 — 5분 타임아웃과 1초 차이로
        // 응답은 받았지만 parseVersions/setVersions 전에 abort 되는 레이스 컨디션 방지
        if (globalTimeout) { clearTimeout(globalTimeout); globalTimeout = null; }
        parsed = parseVersions(text);
      } else {
        console.log(`[VideoAnalysis] 적응형 배치 분할 활성화: ${analysisBatches.length}개 배치 (${versionsPerBatch}버전/배치, 예상 ${estimatedTotalTokens} tokens)`);
        const batchResults = await Promise.allSettled(
          analysisBatches.map(async (batch) => {
            const batchPrompt = buildPromptForBatch(batch.versionOffset, batch.versionCount);
            const batchText = await callAI(batchPrompt, batch.maxTokens);
            const batchParsed = parseVersions(batchText);
            const { versions: trimmedBatchParsed, removedCount } = trimTrailingIncompleteVersions(batchParsed);
            return {
              ...batch,
              text: batchText,
              parsed: normalizeBatchVersionIds(trimmedBatchParsed, batch.versionOffset, batch.versionCount),
              removedCount,
            };
          }),
        );
        // [FIX] 배치 응답 수신 후 글로벌 타임아웃 해제 — 레이스 컨디션 방지
        if (globalTimeout) { clearTimeout(globalTimeout); globalTimeout = null; }
        const successfulBatches = batchResults
          .flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
          .sort((a, b) => a.versionOffset - b.versionOffset);
        if (successfulBatches.length === 0) {
          const firstRejected = batchResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
          throw firstRejected?.reason ?? new Error('모든 분석 배치가 실패했습니다.');
        }

        const failedBatchCount = batchResults.length - successfulBatches.length;
        const removedIncompleteCount = successfulBatches.reduce((sum, batch) => sum + batch.removedCount, 0);
        if (removedIncompleteCount > 0) {
          console.warn(`[VideoAnalysis] ⚠️ 배치 응답에서 불완전한 마지막 버전 ${removedIncompleteCount}개 제거`);
        }
        if (failedBatchCount > 0) {
          showToast(`⚠️ ${analysisBatches.length}개 배치 중 ${failedBatchCount}개가 실패했어요. 성공한 배치만 먼저 반영합니다.`, 6000);
        }

        text = successfulBatches.map(batch => batch.text).join('\n\n');
        const seenVersionIds = new Set<number>();
        parsed = successfulBatches
          .flatMap(batch => batch.parsed)
          .filter((version) => {
            if (seenVersionIds.has(version.id)) return false;
            seenVersionIds.add(version.id);
            return true;
          })
          .sort((a, b) => a.id - b.id);
      }

      setRawResult(text);
      const trimmedParsed = trimTrailingIncompleteVersions(parsed);
      parsed = trimmedParsed.versions;
      if (trimmedParsed.removedCount > 0) {
        console.warn(`[VideoAnalysis] ⚠️ 마지막 버전 불완전 — 제거 (${trimmedParsed.removedCount}개)`);
      }
      // [FIX #582 v2] Codex P1: 응답 잘림 감지 — 요청 버전수보다 적게 파싱되면 경고
      if (parsed.length === 0) {
        throw new Error('AI 응답에서 유효한 버전을 파싱할 수 없었습니다. 다시 시도해주세요.');
      }
      if (parsed.length < effectiveVersionCount) {
        // [FIX #678] deep/heavy 프리셋에서 버전이 심하게 부족하면 품질 경고 추가
        const isSeverelyTruncated = parsed.length <= Math.ceil(effectiveVersionCount / 3);
        if (isSeverelyTruncated && isHeavyPreset) {
          showToast(`⚠️ AI 서버 응답이 불안정하여 ${effectiveVersionCount}개 중 ${parsed.length}개만 생성되었어요. 잠시 후 다시 시도하면 더 좋은 결과를 받으실 수 있어요.`, 8000);
        } else {
          showToast(`⚠️ ${effectiveVersionCount}개 중 ${parsed.length}개 버전만 생성되었어요. 버전 수를 줄이면 더 안정적이에요.`, 6000);
        }
      }
      // [FIX #948] 타임코드 검증 — 롱폼에서 AI 할루시네이션 타임코드 경고
      if (knownDurationSec >= 120) {
        for (const v of parsed) {
          const result = validateSceneTimecodes(v.scenes, knownDurationSec);
          if (result.hasIssues) {
            result.warnings.forEach(w => console.warn(`[VideoAnalysis] VERSION ${v.id}: ${w}`));
          }
        }
      }
      setVersions(parsed);
      addAnalysisPerfStage(perfRunId, 'ai', 'AI 분석');

      // [FIX #313] 배치 완료 후 IndexedDB 자동 저장 — 프레임 추출 전에 저장하여 새로고침 시 복구 가능
      autoSave().catch(() => {});

      // [FIX #340] 프레임 추출 단계 진입 시 진행률 업데이트 (95%에서 멈춘 것처럼 보이는 문제 해결)
      setSimProgress(97);
      // ★ 실제 단계 전환: 프레임 추출 단계
      setRealStep(3);
      setStepDetail('타임코드에 맞는 장면 프레임을 추출하고 있어요');

      // ★ 3중 폴백 프레임 추출 — 결과 표시는 먼저, 정밀 프레임/타임코드 보정은 백그라운드
      // [FIX #156] 다중 업로드 영상: 모든 파일에서 프레임 추출
      // [FIX #241] 타임코드 수집에 parsed 대신 스토어의 최종 versions 사용
      //   — 배치 병합 텍스트 parseVersions 실패 시 parsed=[] → 타임코드 0개 → 비주얼 미표시 버그
      // [FIX #340] 프레임 추출 전체를 2분 타임아웃으로 보호 — 무한 대기 방지
      // [FIX #519] 타임아웃 시 내부 IIFE의 고아 rejection이 unhandled rejection으로 표면화 방지
      const FRAME_EXTRACTION_TIMEOUT = 2 * 60 * 1000;
      const backgroundFramePerfStartedAt = performance.now();
      let backgroundFramePerfState: 'done' | 'timeout' | 'failed' = 'done';
      const innerFrameWork = (async () => {
      const finalVersions = useVideoAnalysisStore.getState().versions;
      let ytVid: string | null = null;
      let durSec = 300; // 기본 5분 추정

      if (uploadedFiles.length > 0) {
        // 다중 업로드 모드: 모든 파일에서 타임코드 기반 프레임 추출
        let allTimecodes = collectTimecodesFromVersions(finalVersions);
        console.log(`[Frame] 수집된 타임코드: ${allTimecodes.length}개 (업로드 ${uploadedFiles.length}개 영상)`);

        // [FIX #311] 업로드 영상도 장면감지로 AI 타임코드 보정
        const originalUploadTimecodes = [...allTimecodes];
        if (allTimecodes.length > 0 && uploadedFiles.length === 1) {
          try {
            const uploadBlob = uploadedFiles[0] instanceof File ? uploadedFiles[0] : new Blob([uploadedFiles[0]]);
            const uploadCuts = await (singleSourceSceneCutsPromise ?? detectSceneCuts(uploadBlob).catch(() => null));
            if (uploadCuts && uploadCuts.length > 0) {
              allTimecodes = mergeWithAiTimecodes(allTimecodes, uploadCuts);
              console.log(`[Scene] ✅ 업로드 씬 감지 보정 완료: ${uploadCuts.length}개 컷 → 타임코드 보정`);
              // [FIX #312] 업로드도 보정 타임코드 역전파
              const correctedVersions = applyCorrectedTimecodes(finalVersions, originalUploadTimecodes, allTimecodes);
              useVideoAnalysisStore.getState().setVersions(correctedVersions);
            }
          } catch (e) {
            console.warn('[Scene] 업로드 씬 감지 실패 (AI 타임코드로 진행):', e);
          }
        }

        if (allTimecodes.length > 0) {
          // [FIX #189] 타임코드 기반 프레임 추출도 병렬화
          const exactResults = await Promise.allSettled(
            uploadedFiles.map((f, fi) =>
              extractFramesWithFallback(f, allTimecodes, null, durSec).then(fileFrames =>
                fileFrames.map(fr => ({
                  ...fr,
                  sourceFileName: fr.sourceFileName || f.name,
                  sourceIndex: fr.sourceIndex ?? fi,
                }))
              )
            )
          );
          const multiExactFrames: TimedFrame[] = [];
          for (const r of exactResults) {
            if (r.status === 'fulfilled') multiExactFrames.push(...r.value);
          }
          if (multiExactFrames.length > 0) {
            console.log(`[Frame] ✅ 최종 프레임 ${multiExactFrames.length}개 적용 (${uploadedFiles.length}개 영상)`);
            setThumbnails(multiExactFrames);
          }
        }
      } else if (isYouTubeUrl(youtubeUrl)) {
        // ★ [FIX #340 v2] YouTube: AI 타임코드 → YouTube 썸네일 즉시 매핑 (영상 다운로드 스킵 — 10x 속도 향상)
        // Gemini 3.1 Pro가 이미 정확한 타임코드를 제공했으므로, 영상을 다운로드해서 프레임을 추출할 필요 없음.
        // YouTube 썸네일 API로 즉시(수 초) 프레임을 보여주고, 정밀 프레임은 편집실에서 필요 시 추출.
        ytVid = extractYouTubeVideoId(youtubeUrl);

        // 메타데이터에서 영상 길이 가져오기
        if (ytVid) {
          try {
            const meta = await fetchYouTubeVideoMeta(ytVid);
            if (meta?.duration) {
              const m = meta.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
              if (m) durSec = (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
            }
          } catch (e) { logger.trackSwallowedError('VideoAnalysisRoom:handleAnalyze/fetchMeta', e); }
        }

        const aiTimecodes = collectTimecodesFromVersions(finalVersions, durSec);

        if (aiTimecodes.length > 0 && ytVid) {
          // ★ [FIX #340 v3] 서버 ffmpeg 프레임 추출 1순위 → YouTube 썸네일 폴백
          // VPS의 ffmpeg가 YouTube CDN에서 해당 타임코드 프레임만 직접 추출 (수 초)
          let fastFrames = await fetchFramesFromServer(ytVid, aiTimecodes, 640).catch(() => []);
          if (fastFrames.length > 0) {
            console.log(`[Frame] ⚡ 서버 ffmpeg 프레임 ${fastFrames.length}개 추출 완료 (AI 타임코드 직접)`);
          } else {
            // 폴백: YouTube 썸네일 즉시 매핑
            fastFrames = buildYouTubeThumbnailFallback(ytVid, aiTimecodes, durSec);
            console.log(`[Frame] ⚡ YouTube 썸네일 폴백: ${fastFrames.length}개 프레임`);
          }
          setThumbnails(fastFrames);

          // 백그라운드: 병렬 다운로드 결과가 있으면 정밀 프레임으로 업그레이드 (비차단)
          setIsFrameUpgrading(true);
          parallelDownloadPromise.then(downloadResult => {
            if (!downloadResult || aiTimecodes.length === 0) { setIsFrameUpgrading(false); return; }
            try {
              const mergedTimecodes = downloadResult.sceneCuts.length > 0
                ? mergeWithAiTimecodes(aiTimecodes, downloadResult.sceneCuts)
                : aiTimecodes;
              const blobUrl = URL.createObjectURL(downloadResult.blob);
              logger.registerBlobUrl(blobUrl, 'video', 'VideoAnalysisRoom:parallelDownload', downloadResult.blob.size / (1024 * 1024));
              canvasExtractFrames(blobUrl, mergedTimecodes, true).then(exactFrames => {
                if (exactFrames.length > 0) {
                  console.log(`[Frame] ✅ 정밀 프레임 ${exactFrames.length}개로 업그레이드 (백그라운드)`);
                  setThumbnails(exactFrames);
                  if (downloadResult.sceneCuts.length > 0) {
                    const correctedVersions = applyCorrectedTimecodes(
                      useVideoAnalysisStore.getState().versions, aiTimecodes, mergedTimecodes
                    );
                    useVideoAnalysisStore.getState().setVersions(correctedVersions);
                  }
                }
                setIsFrameUpgrading(false);
              }).catch(() => { setIsFrameUpgrading(false); });
            } catch (e) { console.warn('[Frame] 백그라운드 정밀 추출 실패 (YouTube 썸네일 유지):', e); setIsFrameUpgrading(false); }
          }).catch(() => { setIsFrameUpgrading(false); });
        }
      } else {
        // 소셜 (TikTok 등): 이미 다운로드한 Blob으로 장면감지 + 프레임 추출
        const existingBlob = useVideoAnalysisStore.getState().videoBlob;
        if (existingBlob) {
          const allTimecodes = collectTimecodesFromVersions(finalVersions, durSec);
          if (allTimecodes.length > 0) {
            // [FIX #311] 소셜 영상도 장면감지 + AI 타임코드 보정 (YouTube와 동일 정밀도)
            let mergedTimecodes = allTimecodes;
            try {
              console.log('[Scene] 소셜 영상 씬 감지 시작...');
              const socialCuts = await (singleSourceSceneCutsPromise ?? detectSceneCuts(existingBlob).catch(() => null));
              if (socialCuts && socialCuts.length > 0) {
                mergedTimecodes = mergeWithAiTimecodes(allTimecodes, socialCuts);
                console.log(`[Scene] ✅ 소셜 씬 감지 완료: AI ${allTimecodes.length}개 + 씬 ${socialCuts.length}개 → ${mergedTimecodes.length}개 병합`);
                // [FIX #312] 소셜도 보정 타임코드 역전파
                const correctedVersions = applyCorrectedTimecodes(finalVersions, allTimecodes, mergedTimecodes);
                useVideoAnalysisStore.getState().setVersions(correctedVersions);
              }
            } catch (e) {
              console.warn('[Scene] 소셜 씬 감지 실패 (AI 타임코드로 진행):', e);
            }

            const blobUrl = URL.createObjectURL(existingBlob);
            logger.registerBlobUrl(blobUrl, 'video', 'VideoAnalysisRoom:socialPostAnalysis', existingBlob.size / (1024 * 1024));
            const exactFrames = await canvasExtractFrames(blobUrl, mergedTimecodes, true);
            if (exactFrames.length > 0) {
              console.log(`[Frame] ✅ 소셜 영상 타임코드 프레임 ${exactFrames.length}개 적용`);
              setThumbnails(exactFrames);
            }
          }
        }
      }

        })();
      // innerFrameWork에 .catch 연결하여 타임아웃으로 Promise.race가 이미 settled된 후의
      // 고아 rejection이 unhandledrejection으로 표면화되는 것을 방지
      innerFrameWork.catch(() => {}); // [FIX #519] 고아 rejection 흡수
      Promise.race([
        innerFrameWork,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('FRAME_TIMEOUT')), FRAME_EXTRACTION_TIMEOUT)),
      ]).catch((frameErr) => {
        if (frameErr instanceof Error && frameErr.message === 'FRAME_TIMEOUT') {
          backgroundFramePerfState = 'timeout';
          console.warn('[Frame] ⚠️ 프레임 추출 2분 타임아웃 — 기존 썸네일 유지');
        } else {
          backgroundFramePerfState = 'failed';
          console.warn('[Frame] 프레임 추출 실패 (결과는 정상 표시):', frameErr);
        }
      }).finally(() => {
        addAnalysisPerfStage(
          perfRunId,
          'backgroundFrames',
          '백그라운드 프레임 보정',
          Math.max(0, performance.now() - backgroundFramePerfStartedAt),
        );
        updateAnalysisPerfSummary(perfRunId, 'success', {
          backgroundState: backgroundFramePerfState,
          showToastSummary: false,
        });
        cacheCurrentResult(preset, sourceCacheKey);
        autoSave().catch(() => {});
      });

      // [FIX #316] 결과 캐시에 저장 (동기 실행 — setTimeout 제거하여 autoSave 이전에 캐시 확보)
      addAnalysisPerfStage(perfRunId, 'result', '결과 표시');
      updateAnalysisPerfSummary(perfRunId, 'success', {
        backgroundState: 'running',
        showToastSummary: true,
      });
      cacheCurrentResult(preset, sourceCacheKey);
      notifyAnalysisComplete();
      // 자동 슬롯 저장
      setTimeout(() => useVideoAnalysisStore.getState().saveSlot(), 500);
    } catch (err) {
      // [FIX #157] 사용자 취소 또는 타임아웃에 의한 abort 처리
      // [FIX #519] AbortError는 DOMException 또는 일반 Error로 올 수 있음 + 브라우저 원문("The user aborted a request.") 포함 감지
      const isAbort = (err instanceof DOMException && err.name === 'AbortError')
        || abortCtrl.signal.aborted
        || (err instanceof Error && (err.message.includes('aborted') || err.message.includes('취소')));
      // [FIX #679] "Failed to fetch" 등 raw 에러 메시지를 사용자 친화적으로 변환
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isNetworkError = rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('network');
      const isTimeoutError = rawMsg.includes('타임아웃') || rawMsg.includes('timeout') || rawMsg.includes('시간 초과');
      // [FIX #909] Evolink 잔액/크레딧 부족 에러를 사용자 친화적 메시지로 변환
      // handleEvolinkError가 "Evolink 잔액 부족: 크레딧을 충전해주세요."를 던지므로 이 패턴만 매칭
      const isQuotaError = rawMsg.includes('잔액 부족') || /insufficient.*(quota|credit|balance)/i.test(rawMsg);
      const friendlyMsg = isAbort ? '분석이 취소되었습니다.'
        : isQuotaError ? 'AI 분석 크레딧이 부족합니다. Evolink 크레딧을 충전한 뒤 다시 시도해주세요.'
        : isNetworkError ? '영상 분석 서버 응답이 지연되거나 연결이 끊어졌습니다. 잠시 후 다시 시도하거나 더 짧은 영상으로 시도해주세요.'
        : isTimeoutError ? '영상 분석 서버 응답이 지연되어 분석이 중단되었습니다. 잠시 후 다시 시도해주세요.'
        : rawMsg;
      console.error('[VideoAnalysis] 분석 실패:', isAbort ? '(사용자 취소/타임아웃)' : err);
      updateAnalysisPerfSummary(perfRunId, isAbort ? 'cancelled' : 'failed');

      if (isAbort) {
        // [FIX #454] 페일세이프 타이머가 이미 토스트를 표시한 경우 중복 방지
        if (!failsafeFiredRef.current) {
          // [FIX #189] 타임아웃 중단 시 부분 결과 존재 여부에 따라 메시지 차별화
          const partialVersions = useVideoAnalysisStore.getState().versions;
          if (partialVersions.length > 0) {
            showToast(`⚠️ 시간 초과로 ${partialVersions.length}개 버전만 생성되었습니다.`, 5000);
          } else {
            showToast('분석이 중단되었습니다. 다시 시도해주세요.', 4000);
          }
        }
      } else {
        setError(`분석 실패: ${friendlyMsg}`);
        if (isQuotaError) {
          showToast('AI 분석 크레딧이 부족합니다. Evolink 잔액을 확인해주세요.', 6000);
        } else if (rawMsg.includes('Cloudinary') || rawMsg.includes('업로드')) {
          showToast('영상 업로드에 실패했습니다. 파일 크기를 줄이거나 YouTube 링크를 사용해주세요.', 6000);
        } else if (rawMsg.includes('API 키') || rawMsg.includes('Evolink')) {
          showToast('AI 서비스 연결에 문제가 있습니다. API 설정을 확인해주세요.', 6000);
        } else if (isNetworkError || isTimeoutError) {
          showToast('영상 분석 서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.', 6000);
        } else {
          showToast('영상 분석에 실패했습니다. 잠시 후 다시 시도해주세요.', 5000);
        }
      }
    } finally {
      if (globalTimeout) clearTimeout(globalTimeout);
      analysisAbortRef.current = null;
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
      // [FIX #313] 분석 종료 시 최종 자동 저장 (부분 결과 포함)
      autoSave().catch(() => {});
    }
  };

  // [FIX #700] "편집실로 보내기" 공통 핸들러 — 중복 클릭 방지 + 다운로드 실패 토스트 + 즉시 이동
  const handleSendToEditRoom = useCallback(async (v: VersionItem | null) => {
    // 중복 클릭 가드
    if (sendToEditRoomLockRef.current) return;
    sendToEditRoomLockRef.current = true;
    setSendingToEditRoom(true);
    try {
      const isTk = true;
      const targetVersion = v || useVideoAnalysisStore.getState().versions[0];
      if (!targetVersion) {
        showToast('분석 결과가 없습니다. 먼저 분석을 실행해주세요.');
        return;
      }
      const versionText = isTk
        ? `제목: ${targetVersion.title}\n컨셉: ${targetVersion.concept}\n\n| 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n` + targetVersion.scenes.map(s => `| ${s.cutNum} | ${s.mode} | ${s.audioContent} | ${s.duration} | ${s.videoDirection} | ${s.timecodeSource} |`).join('\n')
        : `제목: ${targetVersion.title}\n\n` + targetVersion.scenes.map(s => `[컷 ${s.cutNum}] ${s.timeline}\n대사: ${s.dialogue}\n효과: ${s.effectSub}\n장면: ${s.sceneDesc}`).join('\n\n');

      // [FIX #700] import가 이미 진행 중이면 다운로드도 시작하지 않고 즉시 리턴
      if (useEditPointStore.getState().isImportingFromVideoAnalysis) {
        showToast('이전 데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const videoStore = useVideoAnalysisStore.getState();
      let effectiveBlob = videoStore.videoBlob;

      // [FIX #700] 다운로드 실패 시 사용자 안내 + 즉시 이동
      if (!effectiveBlob && !uploadedFiles[0] && inputMode === 'youtube' && youtubeUrl) {
        try {
          const dl = await downloadSocialVideo(youtubeUrl, '720p');
          effectiveBlob = dl.blob;
          videoStore.setVideoBlob(dl.blob);
        } catch (e) {
          console.warn('[EditRoom] 영상 다운로드 실패:', e);
          showToast('원본 영상 다운로드에 실패했어요. 편집실 Step 1에서 원본 영상을 직접 등록해주세요.', 7000);
        }
      }
      try {
        await useEditPointStore.getState().importFromVideoAnalysis({
          frames: thumbnails,
          videoBlob: effectiveBlob,
          videoFile: uploadedFiles[0] || null,
          editTableText: versionText,
          narrationText: '',
        });
      } catch (e) {
        console.warn('[EditRoom] 데이터 전달 실패:', e);
      }
      useVideoAnalysisStore.getState().setEditRoomSelectedVersionIdx(v ? v.id - 1 : 0);
      useEditRoomStore.getState().setEditRoomSubTab('edit-point-matching');
      useNavigationStore.getState().setActiveTab('edit-room');
    } finally {
      sendToEditRoomLockRef.current = false;
      setSendingToEditRoom(false);
    }
  }, [uploadedFiles, inputMode, youtubeUrl, thumbnails]);

  // 버전 복사 (3종: tts=TTS만, original=오리지널 대사, all=모두) — 프리셋별 최적화
  const handleCopyVersion = useCallback(async (v: VersionItem, mode: 'tts' | 'original' | 'all') => {
    let text = '';
    const preset = selectedPreset;

    if (mode === 'tts') {
      // TTS만: 프리셋별 최적화된 순수 나레이션 추출
      if (preset === 'snack') {
        // 스낵형: [S]/[A] 자막 중심 — dialogue 우선 (자막이 곧 TTS)
        text = v.scenes
          .map(s => stripForTts(s.dialogue || s.audioContent || ''))
          .filter(line => line.trim())
          .join('\n');
      } else if (preset === 'alltts') {
        // All TTS: 이미 TTS 최적화 대본 — 최소한의 정제만 (구두점만 제거, 화자는 없음)
        text = v.scenes
          .map(s => (s.audioContent || s.dialogue || '').replace(/[\[(（<][^)\]）>]*[)\]）>]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim())
          .filter(line => line.trim())
          .join('\n');
      } else if (preset === 'deep') {
        // 심층 분석: 나레이션이 길고 단락 구조 → 빈 줄로 단락 구분
        text = v.scenes
          .map(s => stripForTts(s.audioContent || s.dialogue || ''))
          .filter(line => line.trim())
          .join('\n\n');
      } else {
        // tikitaka/condensed/shopping: 기본 — 화자/기호 제거
        text = v.scenes
          .map(s => stripForTts(s.audioContent || s.dialogue || ''))
          .filter(line => line.trim())
          .join('\n');
      }
    } else if (mode === 'original') {
      // 오리지널 대사: 프리셋별 최적화
      if (preset === 'tikitaka' && v.detectedLang && v.detectedLang !== 'ko') {
        // 티키타카 해외 영상: 원어 대사 + 한국어 번역 쌍으로 복사
        text = v.scenes
          .map(s => {
            const orig = (s.audioContentOriginal || '').trim();
            const kr = (s.audioContent || s.dialogue || '').trim();
            return orig ? `[${v.detectedLang?.toUpperCase()}] ${orig}\n[KR] ${kr}` : kr;
          })
          .filter(line => line)
          .join('\n\n');
      } else if (preset === 'snack') {
        // 스낵형: 자막 원문 (dialogue 우선, 효과자막도 별도 줄로 포함)
        text = v.scenes
          .map(s => {
            const sub = (s.dialogue || s.audioContent || '').trim();
            const fx = (s.effectSub || '').trim();
            return fx ? `${sub}\n[효과] ${fx}` : sub;
          })
          .filter(line => line)
          .join('\n');
      } else if (preset === 'shopping') {
        // 쇼핑형: 상품 나레이션 + 효과자막 (가격/특가 등) 포함
        text = v.scenes
          .map(s => {
            const narr = (s.audioContent || s.dialogue || '').trim();
            const fx = (s.effectSub || '').trim();
            return fx ? `${narr}\n[효과] ${fx}` : narr;
          })
          .filter(line => line)
          .join('\n');
      } else {
        // tikitaka(국내)/condensed/deep/alltts: audioContent 원본 그대로
        text = v.scenes
          .map(s => (s.audioContent || s.dialogue || '').trim())
          .filter(line => line)
          .join('\n');
      }
    } else {
      // 모두: 프리셋별 최적화된 전체 포맷
      if (preset === 'deep') {
        // 심층 분석: 보고서 스타일 (모드/타임코드 없이 나레이션 + 화면 지시 중심)
        const scenesText = v.scenes.map(s =>
          `[${s.cutNum}] ${s.audioContent}\n   화면: ${s.videoDirection}${s.effectSub ? `\n   효과: ${s.effectSub}` : ''}`
        ).join('\n\n');
        text = `제목: ${v.title}\n컨셉: ${v.concept}\n\n${scenesText}`;
      } else if (preset === 'shopping') {
        // 쇼핑형: 상품 대본 포맷 (타임코드 + 효과자막 강조)
        const scenesText = v.scenes.map(s =>
          `[${s.cutNum}] ${s.mode} | ${s.audioContent}${s.effectSub ? ` | ★${s.effectSub}★` : ''} | ${s.duration} | ${s.timecodeSource}`
        ).join('\n');
        text = `제목: ${v.title}\n컨셉: ${v.concept}\n\n${scenesText}`;
      } else {
        // tikitaka/snack/condensed/alltts: 7열 마스터 편집 테이블
        const scenesText = v.scenes.map(s =>
          `[${s.cutNum}] ${s.mode} | ${s.audioContent} | 효과자막: ${s.effectSub || '-'} | ${s.duration} | ${s.videoDirection} | ${s.timecodeSource}`
        ).join('\n');
        text = `제목: ${v.title}\n컨셉: ${v.concept}\n\n${scenesText}`;
      }
    }
    try { await navigator.clipboard.writeText(text); } catch (e) { logger.trackSwallowedError('VideoAnalysisRoom:handleCopyVersion/clipboard', e); }
    setCopyMenuVersionId(null);
    setCopiedVersion(v.id);
    setTimeout(() => setCopiedVersion(null), 2000);
  }, [selectedPreset]);

  // SRT 다운로드 (프리셋별 최적화 + 효과자막/일반자막 레이어 분리 + 숏폼 줄바꿈)
  const handleDownloadSrt = useCallback(async (v: VersionItem) => {
    if (v.scenes.length === 0) return;
    const safeName = sanitizeProjectName(v.title) || `version-${v.id}`;
    const hasEffectSub = v.scenes.some(s => (s.effectSub || '').trim());
    const totalDur = v.scenes.reduce((acc, s) => acc + parseDuration(s.duration), 0);
    // 프리셋별 숏폼 판단: tikitaka/snack/condensed는 항상 숏폼 취급, deep은 항상 롱폼, alltts는 실제 길이로 판단 [FIX #529]
    const isShortForm = selectedPreset === 'deep' ? false
      : (selectedPreset === 'tikitaka' || selectedPreset === 'snack') ? true
      : totalDur <= 90;
    // 프리셋별 SRT 레이어 파일명
    const dlgLabel = selectedPreset === 'snack' ? '자막' : selectedPreset === 'shopping' ? '나레이션' : '일반자막';
    const fxLabel = selectedPreset === 'snack' ? '이원화자막' : selectedPreset === 'shopping' ? '상품효과' : '효과자막';

    const videoBlob = useVideoAnalysisStore.getState().videoBlob;
    if (!videoBlob) {
      // 영상 없으면 SRT만 다운로드 (레이어 분리)
      const isTk = true;
      if (hasEffectSub) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        zip.file(`${safeName}_${dlgLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'dialogue', isShortForm, selectedPreset || undefined));
        zip.file(`${safeName}_${fxLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'effect', isShortForm, selectedPreset || undefined));
        zip.file(`${safeName}_통합.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'combined', isShortForm, selectedPreset || undefined));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        logger.registerBlobUrl(zipUrl, 'other', 'VideoAnalysisRoom:srtLayerZip');
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `${safeName}_자막.zip`;
        a.click();
        logger.unregisterBlobUrl(zipUrl);
        URL.revokeObjectURL(zipUrl);
        showToast(`${dlgLabel} + ${fxLabel} + 통합 SRT가 ZIP으로 다운로드되었어요`);
      } else {
        const srt = generateSrt(v.scenes, isTk, 'dialogue', isShortForm, selectedPreset || undefined);
        downloadSrt(srt, `${safeName}.srt`);
      }
      return;
    }

    // 영상 있음 → WebCodecs로 편집 영상 생성 + ZIP
    setRenderingVersionId(v.id);
    setRenderProgress(0);
    try {
      // 1) 타임코드 파싱 → segments
      const segments: { startSec: number; durationSec: number }[] = [];
      for (const s of v.scenes) {
        // [FIX #664] sourceTimeline/timeline에서 타임코드 범위 파싱 — `/` 구분자도 지원
        const srcTc = s.sourceTimeline || s.timeline;
        const parts = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
        const start = parts ? timecodeToSeconds(parts[1]) : 0;
        const end = parts ? timecodeToSeconds(parts[2]) : parseDuration(s.duration);
        segments.push({ startSec: start, durationSec: Math.max(0.1, end - start) });
      }

      // 2) 원본 영상 오디오 세그먼트 추출
      const rawAudioBuffer = await extractAudioSegments(videoBlob, segments);

      // 3) composeMp4 타임라인 구성
      const videoBlobUrl = URL.createObjectURL(videoBlob);
      logger.registerBlobUrl(videoBlobUrl, 'video', 'VideoAnalysisRoom:srtExport', videoBlob.size / (1024 * 1024));

      const timeline = segments.map((seg, i) => ({
        sceneId: `trim-${i}`,
        sceneIndex: i,
        imageStartTime: segments.slice(0, i).reduce((a, s) => a + s.durationSec, 0),
        imageEndTime: segments.slice(0, i + 1).reduce((a, s) => a + s.durationSec, 0),
        imageDuration: seg.durationSec,
        subtitleSegments: [],
        effectPreset: 'static',
        volume: 1,
        speed: 1,
        videoTrimStartSec: seg.startSec,
      }));
      const sceneEntries = segments.map((_, i) => ({
        id: `trim-${i}`,
        videoUrl: videoBlobUrl,
      }));

      // 4) WebCodecs 렌더링
      const { composeMp4 } = await import('../../../services/webcodecs/index');
      const mp4Blob = await composeMp4({
        timeline,
        scenes: sceneEntries,
        narrationLines: [],
        rawAudioBuffer,
        width: 1920,
        height: 1080,
        fps: 30,
        onProgress: (p) => setRenderProgress(p.percent),
      });

      logger.unregisterBlobUrl(videoBlobUrl);
      URL.revokeObjectURL(videoBlobUrl);

      // 5) 프리셋별 레이어 분리 SRT 생성
      const durations = segments.map(s => s.durationSec);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file(`${safeName}.mp4`, mp4Blob);
      zip.file(`${safeName}_${dlgLabel}.srt`, '\uFEFF' + generateSyncedSrt(v.scenes, durations, 'dialogue', isShortForm, selectedPreset || undefined));
      if (hasEffectSub) {
        zip.file(`${safeName}_${fxLabel}.srt`, '\uFEFF' + generateSyncedSrt(v.scenes, durations, 'effect', isShortForm, selectedPreset || undefined));
      }
      zip.file(`${safeName}_통합.srt`, '\uFEFF' + generateSyncedSrt(v.scenes, durations, 'combined', isShortForm, selectedPreset || undefined));
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const zipUrl = URL.createObjectURL(zipBlob);
      logger.registerBlobUrl(zipUrl, 'other', 'VideoAnalysisRoom:srtZip');
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `${safeName}.zip`;
      a.click();
      logger.unregisterBlobUrl(zipUrl);
      URL.revokeObjectURL(zipUrl);
    } catch (err) {
      logger.trackSwallowedError('VideoAnalysisRoom:handleDownloadSrt/render', err);
      showToast('영상 렌더링 실패 — SRT만 다운로드합니다');
      // 폴백: SRT만 다운로드 (프리셋별 레이어 분리)
      if (hasEffectSub) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        zip.file(`${safeName}_${dlgLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, true, 'dialogue', isShortForm, selectedPreset || undefined));
        zip.file(`${safeName}_${fxLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, true, 'effect', isShortForm, selectedPreset || undefined));
        zip.file(`${safeName}_통합.srt`, '\uFEFF' + generateSrt(v.scenes, true, 'combined', isShortForm, selectedPreset || undefined));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        logger.registerBlobUrl(zipUrl, 'other', 'VideoAnalysisRoom:srtFallbackZip');
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `${safeName}_자막.zip`;
        a.click();
        logger.unregisterBlobUrl(zipUrl);
        URL.revokeObjectURL(zipUrl);
      } else {
        const srt = generateSrt(v.scenes, true, 'dialogue', isShortForm, selectedPreset || undefined);
        downloadSrt(srt, `${safeName}.srt`);
      }
    } finally {
      setRenderingVersionId(null);
      setRenderProgress(0);
    }
  }, [selectedPreset]);

  // SRT 전용 다운로드 (영상 렌더링 없이 SRT만 즉시 다운로드)
  const handleDownloadSrtOnly = useCallback(async (v: VersionItem) => {
    if (v.scenes.length === 0) return;
    const safeName = sanitizeProjectName(v.title) || `version-${v.id}`;
    const hasEffectSub = v.scenes.some(s => (s.effectSub || '').trim());
    const totalDur = v.scenes.reduce((acc, s) => acc + parseDuration(s.duration), 0);
    // [FIX #529] alltts는 실제 길이로 숏폼 판단
    const isShortForm = selectedPreset === 'deep' ? false
      : (selectedPreset === 'tikitaka' || selectedPreset === 'snack') ? true
      : totalDur <= 90;
    const dlgLabel = selectedPreset === 'snack' ? '자막' : selectedPreset === 'shopping' ? '나레이션' : '일반자막';
    const fxLabel = selectedPreset === 'snack' ? '이원화자막' : selectedPreset === 'shopping' ? '상품효과' : '효과자막';
    const isTk = true;
    if (hasEffectSub) {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file(`${safeName}_${dlgLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'dialogue', isShortForm, selectedPreset || undefined));
      zip.file(`${safeName}_${fxLabel}.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'effect', isShortForm, selectedPreset || undefined));
      zip.file(`${safeName}_통합.srt`, '\uFEFF' + generateSrt(v.scenes, isTk, 'combined', isShortForm, selectedPreset || undefined));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      logger.registerBlobUrl(zipUrl, 'other', 'VideoAnalysisRoom:srtOnlyZip');
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `${safeName}_자막.zip`;
      a.click();
      logger.unregisterBlobUrl(zipUrl);
      URL.revokeObjectURL(zipUrl);
      showToast(`${dlgLabel} + ${fxLabel} + 통합 SRT가 ZIP으로 다운로드되었어요`);
    } else {
      const srt = generateSrt(v.scenes, isTk, 'dialogue', isShortForm, selectedPreset || undefined);
      downloadSrt(srt, `${safeName}.srt`);
    }
  }, [selectedPreset]);

  // HTML 다운로드 (개별 버전)
  const handleDownloadVersionHtml = useCallback((v: VersionItem) => {
    if (!selectedPreset) return;
    const sourceInfo = inputMode === 'youtube' ? `영상: ${youtubeUrl}` : `파일: ${uploadedFiles[0]?.name || ''}`;
    const html = generateAnalysisHtml([v], selectedPreset, thumbnails, sourceInfo, guideAiResult);
    const safeName = sanitizeProjectName(v.title);
    downloadFile(html, `${safeName || `version-${v.id}`}.html`, 'text/html');
  }, [selectedPreset, thumbnails, inputMode, youtubeUrl, uploadedFiles, guideAiResult]);

  // HTML 다운로드 (전체 버전)
  const handleDownloadAllHtml = useCallback(() => {
    if (!selectedPreset || versions.length === 0) return;
    const sourceInfo = inputMode === 'youtube' ? `영상: ${youtubeUrl}` : `파일: ${uploadedFiles[0]?.name || ''}`;
    const html = generateAnalysisHtml(versions, selectedPreset, thumbnails, sourceInfo, guideAiResult);
    const presetLabel = PRESET_INFO[selectedPreset as AnalysisPreset]?.label || '스낵형';
    downloadFile(html, `${presetLabel}_분석결과_전체.html`, 'text/html');
  }, [selectedPreset, versions, thumbnails, inputMode, youtubeUrl, uploadedFiles, guideAiResult]);

  // [FIX #157] 분석 취소 핸들러
  const handleCancelAnalysis = useCallback(() => {
    analysisAbortRef.current?.abort();
  }, []);

  // [FIX #582 v2] 경과 시간 + 시뮬레이션 진행률 타이머
  // 동적 예상 시간: 프리셋/버전수/영상길이 기반 (하드코딩 90초 제거)
  // Codex P2: 분석 시작 시점 스냅샷으로 mid-analysis 값 변경에 의한 점프 방지
  const estimatedTotalSecRef = useRef(90);
  // [FIX #perf-v2] 실제 측정 데이터 기반 예상 시간 — 거짓말 안 하는 시간 예측
  // 실측: snack 3v=130s, snack 10v=234s, tikitaka 10v=276s, alltts 10v=400s+
  const ESTIMATED_TOTAL_SEC = useMemo(() => {
    // [FIX #678 Codex R3 P3] deep/shopping은 최대 5버전으로 캡 — ETA가 실제 작업량과 일치하도록
    const rawVc = versionCount || 10;
    const vc = (selectedPreset === 'deep' || selectedPreset === 'shopping') ? Math.min(rawVc, 5) : rawVc;
    // 프리셋별 고정 오버헤드 (소스 준비 + v1beta 영상 전송 + 초기 분석)
    const presetBase: Record<string, number> = {
      snack: 60, condensed: 70, tikitaka: 80, shopping: 90, alltts: 120, deep: 150,
    };
    // 버전당 추가 시간 (AI 토큰 생성 속도 기반)
    const perVersionSec: Record<string, number> = {
      snack: 18, condensed: 16, tikitaka: 22, shopping: 20, alltts: 30, deep: 25,
    };
    const p = selectedPreset || 'snack';
    const inputOverhead = inputMode === 'youtube' ? 5 : 15;
    const longFormMultiplier = isLongForm ? 1.6 : 1.0;
    return Math.round((inputOverhead + (presetBase[p] || 80) + (perVersionSec[p] || 20) * vc) * longFormMultiplier);
  }, [selectedPreset, versionCount, inputMode, isLongForm]);
  useEffect(() => {
    if (!isAnalyzing) return;
    // 분석 시작 시 현재 예상치를 스냅샷 — 이후 isLongForm 변경으로 인한 진행률 점프 방지
    estimatedTotalSecRef.current = ESTIMATED_TOTAL_SEC;
    const snapshotEstimate = estimatedTotalSecRef.current;
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - analysisStartRef.current) / 1000);
      setElapsedSec(elapsed);
      // 비선형 진행률: 빠르게 시작 → 점진적 감속 (95%에서 수렴)
      const progress = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / (snapshotEstimate * 0.55)))));
      setSimProgress(progress);
    }, 500);

    // [FIX #454][FIX #678] 페일세이프 최대 실행 시간 — deep/heavy는 12분, 일반 10분
    // deep/alltts는 AI 타임아웃이 8분이므로 전처리(다운로드/STT 2~3분) 포함 시 10분 초과 가능
    const isHeavyPresetForFailsafe = selectedPreset === 'deep' || selectedPreset === 'alltts';
    const FAILSAFE_MAX_MS = isHeavyPresetForFailsafe ? 12 * 60 * 1000 : 10 * 60 * 1000;
    const failsafeTimer = setTimeout(() => {
      console.error('[VideoAnalysis] ⚠️ 페일세이프 10분 타임아웃 — isAnalyzing 강제 해제');
      failsafeFiredRef.current = true; // [FIX #454] catch 블록의 중복 토스트 방지
      analysisAbortRef.current?.abort();
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
      showToast('⚠️ 분석 시간이 초과되었습니다. 다시 시도해주세요.', 6000);
    }, FAILSAFE_MAX_MS);

    return () => { clearInterval(iv); clearTimeout(failsafeTimer); };
  }, [isAnalyzing]);

  // ESC — 미리보기 → 버전 접기 순서
  useEffect(() => {
    if (!expandedId && !previewFrame) return;
    if (previewVersion) return; // ScenarioPreviewPlayer가 자체 ESC 처리
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (copyMenuVersionId) { setCopyMenuVersionId(null); return; }
        if (previewFrame) { setPreviewFrame(null); return; }
        setExpandedId(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [expandedId, previewVersion, copyMenuVersionId]);

  // 대본 복사 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (copyMenuVersionId === null) return;
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-copy-menu]')) setCopyMenuVersionId(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [copyMenuVersionId]);

  return (
    <div className="space-y-6">
      {/* 분석 슬롯 바 */}
      <AnalysisSlotBar
        slots={savedSlots.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt }))}
        activeSlotId={activeSlotId}
        onNewAnalysis={() => { newAnalysis(); setUploadedFiles([]); }}
        onLoadSlot={loadSlot}
        onDeleteSlot={removeSlot}
        hasCurrentResults={versions.length > 0 && !activeSlotId}
      />
      {/* 컴패니언 앱 안내 배너 — 다운로드 */}
      <CompanionBanner feature="download" />

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
              onClick={() => { setInputMode(mode); if (mode === 'youtube') setUploadedFiles([]); else setYoutubeUrl(''); resetResults(); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inputMode === mode
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
              }`}
            >
              {mode === 'youtube' ? '영상 링크' : '영상 업로드'}
            </button>
          ))}
        </div>

        {inputMode === 'youtube' ? (
          <div className="space-y-2">
            {youtubeUrls.map((url, idx) => (
              <div key={idx} className="relative flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono w-6 text-center flex-shrink-0">{idx + 1}</span>
                <input
                  type="url" value={url}
                  onChange={e => { updateYoutubeUrl(idx, e.target.value); resetResults(); }}
                  placeholder={idx === 0 ? '영상 URL (YouTube, TikTok 등)' : `소스 ${idx + 1} 영상 URL`}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                {youtubeUrls.length > 1 && (
                  <button type="button" onClick={() => { removeYoutubeUrl(idx); resetResults(); }} className="text-gray-500 hover:text-red-400 flex-shrink-0 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            {youtubeUrls.length < 5 && (
              <button type="button" onClick={addYoutubeUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                영상 추가 (최대 5개)
              </button>
            )}
            {validYoutubeUrls.length > 1 && (
              <p className="text-[11px] text-blue-400/70 mt-1">
                {validYoutubeUrls.length}개 영상을 조합한 짜집기 분석을 수행합니다
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" multiple className="hidden" />
            {uploadedFiles.length > 0 && (
              <div className="space-y-1.5">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5">
                    <span className="text-xs text-gray-500 font-mono w-5 text-center flex-shrink-0">{idx + 1}</span>
                    <span className="text-blue-400 text-base flex-shrink-0">🎥</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{file.name}</p>
                      <p className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)}MB</p>
                    </div>
                    <button type="button" onClick={() => handleRemoveFile(idx)} className="text-gray-500 hover:text-red-400 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                {uploadedFiles.length > 1 && (
                  <p className="text-[11px] text-blue-400/70">
                    {uploadedFiles.length}개 영상을 조합한 짜집기 분석을 수행합니다
                  </p>
                )}
              </div>
            )}
            {uploadedFiles.length < 5 && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                className={`w-full border-2 border-dashed rounded-lg py-6 flex flex-col items-center gap-2 transition-all ${isDragOver ? 'border-blue-400 bg-blue-500/10' : 'border-gray-600 hover:border-blue-500/50 hover:bg-blue-500/5'}`}>
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">{isDragOver ? '여기에 놓으세요!' : uploadedFiles.length > 0 ? '영상 추가 (클릭 또는 드래그)' : '클릭 또는 드래그하여 영상 파일 선택'}</span>
                <span className="text-gray-600 text-xs">MP4, MOV, AVI 등 — 최대 5개</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ 프리셋 ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">🎯</span>
            리메이크 프리셋
          </h2>
          {/* 목표 시간 셀렉터 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">목표 시간</span>
            <div className="flex bg-gray-900/70 rounded-lg border border-gray-600/50 p-0.5">
              {([0, 30, 45, 60] as const).map(dur => (
                <button
                  key={dur} type="button"
                  onClick={() => setTargetDuration(dur)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    targetDuration === dur
                      ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40'
                      : 'text-gray-400 hover:text-gray-200 border border-transparent'
                  }`}
                >
                  {dur === 0 ? '원본' : `${dur}초`}
                </button>
              ))}
            </div>
          </div>
          {/* [FIX #398] 원본 순서 유지 토글 — 스낵형/티키타카의 비선형 재배치를 비활성화 */}
          <button
            type="button"
            onClick={() => setKeepOriginalOrder(!keepOriginalOrder)}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
              keepOriginalOrder
                ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                : 'bg-gray-900/50 border-gray-600/50 text-gray-400 hover:border-gray-500 hover:text-gray-300'
            } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="스낵형·티키타카에서 비선형 재배치 대신 원본 영상의 시간 순서를 유지합니다"
          >
            <span className={`w-8 h-4 rounded-full relative transition-all ${keepOriginalOrder ? 'bg-amber-500' : 'bg-gray-600'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${keepOriginalOrder ? 'left-4' : 'left-0.5'}`} />
            </span>
            원본 순서 유지
          </button>
        </div>
        {/* [FIX #398] 원본 순서 유지 모드 안내 */}
        {keepOriginalOrder && (
          <p className="text-amber-400/70 text-xs mt-2">
            스낵형·티키타카에서 장면 순서를 뒤섞지 않고 원본 타임라인 순서 그대로 자막을 추출합니다.
          </p>
        )}
        {/* 버전 수 선택 */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-gray-500 flex-shrink-0">버전 수</span>
          <div className="flex bg-gray-900/70 rounded-lg border border-gray-600/50 p-0.5">
            {[1, 3, 5, 10].map(n => (
              <button
                key={n} type="button"
                onClick={() => setVersionCount(n)}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  versionCount === n
                    ? 'bg-orange-600/30 text-orange-400 border border-orange-500/40'
                    : 'text-gray-400 hover:text-gray-200 border border-transparent'
                } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {n}개
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">
            {versionCount <= 3 ? '비용 절약' : versionCount >= 10 ? '풀 비교' : '밸런스'}
            {' · ~'}
            {versionCount === 1 ? '20' : versionCount === 3 ? '70' : versionCount === 5 ? '100' : '200'}원
            {' · 약 '}
            {versionCount === 1 ? '1~2' : versionCount === 3 ? '2~3' : versionCount === 5 ? '3~4' : '4~5'}분
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSel = selectedPreset === key && isAnalyzing;
            const cMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hover: 'hover:bg-amber-600/20' },
              emerald: { bg: 'bg-emerald-600/10', border: 'border-emerald-500/30', text: 'text-emerald-400', hover: 'hover:bg-emerald-600/20' },
              pink: { bg: 'bg-pink-600/10', border: 'border-pink-500/30', text: 'text-pink-400', hover: 'hover:bg-pink-600/20' },
              violet: { bg: 'bg-violet-600/10', border: 'border-violet-500/30', text: 'text-violet-400', hover: 'hover:bg-violet-600/20' },
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
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-gray-500">
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-900/10 rounded-lg border border-blue-800/20">
              <span className="text-blue-400 font-bold flex-shrink-0">티키타카</span>
              <span>10가지 바이럴 패턴으로 타임라인 비선형 재조립. 효과자막 + Content ID 회피 + 바이럴 극대화.</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-900/10 rounded-lg border border-amber-800/20">
              <span className="text-amber-400 font-bold flex-shrink-0">스낵형</span>
              <span>타임라인 완전 해체 + 비선형 컷 편집. 가장 임팩트 있는 장면을 맨 앞에 배치하는 바이럴 숏폼.</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-900/10 rounded-lg border border-emerald-800/20">
              <span className="text-emerald-400 font-bold flex-shrink-0">축약 리캡</span>
              <span>원본 순서 유지. 전체 스토리를 60초로 압축 요약. 드라마/다큐 등 긴 영상의 리캡 쇼츠에 최적.</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-pink-900/10 rounded-lg border border-pink-800/20">
              <span className="text-pink-400 font-bold flex-shrink-0">쇼핑형</span>
              <span>{`${SHOPPING_SCRIPT_GUIDELINE_SHORT_LABEL} 기준으로 최적 타겟을 찾고, 4단계 구매 합리화 구조의 쇼핑 숏폼 대본 5종을 생성합니다.`}</span>
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-violet-900/10 rounded-lg border border-violet-800/20">
              <span className="text-violet-400 font-bold flex-shrink-0">All TTS</span>
              <span>원본 정보 100% 보존 + 텍스트 유사도 0% 수렴. 구문·어휘·순서를 완전 재조립한 TTS 전용 대본 10종.</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 로딩 — 프리미엄 로딩 패널 ═══ */}
      {isAnalyzing && (
        <AnalysisLoadingPanel
          currentStep={realStep}
          steps={[
            { label: '소스 준비', icon: '📹' },
            { label: '오디오 분석', icon: '🗣️' },
            { label: '편집표 생성', icon: '✨' },
            { label: '프레임 추출', icon: '🎞️' },
          ]}
          message={stepDetail || '분석을 준비하고 있어요...'}
          elapsedSec={elapsedSec}
          estimatedTotalSec={ESTIMATED_TOTAL_SEC}
          accent="blue"
          description={
            realStep === 0 ? '영상 메타데이터와 자막을 수집하고 있습니다'
              : realStep === 1 ? '영상 음성에서 화자를 분리하고 있습니다'
              : realStep === 2 ? 'AI가 영상을 시청하며 편집표를 작성하고 있습니다'
              : '타임코드에 맞는 프레임을 매칭하고 있습니다'
          }
          onCancel={handleCancelAnalysis}
          isLongForm={isLongForm}
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

      {lastAnalysisPerfLines.length > 0 && (
        <div className="bg-cyan-950/25 border border-cyan-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-cyan-300 font-semibold text-sm">최근 리메이크 분석 소요시간</p>
            <span className="text-[10px] text-cyan-300/70">성능 로그</span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
            {lastAnalysisPerfLines.map((line, index) => (
              <div
                key={`${index}-${line}`}
                className="px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-800/80 text-xs text-gray-300"
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 10가지 버전 아코디언 ═══ */}
      {versions.length > 0 && (() => {
        const expectedTotal = (selectedPreset === 'deep' || selectedPreset === 'shopping')
          ? Math.min(versionCount, 5) : versionCount;
        const isStillGenerating = isAnalyzing && versions.length < expectedTotal;
        return (
        <div className="space-y-4">
          {/* 진행 상황 배너 — 아직 생성 중일 때만 표시 */}
          {isStillGenerating && (
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-blue-300 font-bold text-sm">
                  {versions.length}/{expectedTotal}개 버전 생성 완료
                </p>
                <div className="mt-2 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.round((versions.length / expectedTotal) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="flex-shrink-0 text-blue-400 font-mono text-sm font-bold">
                {Math.round((versions.length / expectedTotal) * 100)}%
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center text-sm">🎬</span>
              {selectedPreset === 'shopping' ? `쇼핑 대본 ${versions.length}${isStillGenerating ? `/${expectedTotal}` : ''}종`
                : selectedPreset === 'deep' ? '심층 분석 보고서'
                : `${PRESET_INFO[selectedPreset as AnalysisPreset]?.label ?? ''} 리메이크 ${versions.length}${isStillGenerating ? `/${expectedTotal}` : ''}가지 버전`}
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
                  <div className="w-full flex items-center gap-3 px-4 py-3.5">
                    <button type="button" onClick={() => setExpandedId(isExp ? null : v.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className={`w-7 h-7 rounded-full ${c.numBg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>{v.id}</span>
                      <span className={`flex-1 text-sm font-bold truncate select-text ${isExp ? c.text : 'text-gray-200'}`}>{v.title}</span>
                    </button>
                    {/* [FIX #483] 제목 복사 버튼 — 더 눈에 띄게 */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(v.title).then(() => showToast('제목이 복사되었습니다')); }}
                      className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-400/40 transition-all flex-shrink-0 flex items-center gap-1 text-[10px] font-bold"
                      title="제목 복사"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      복사
                    </button>
                    {hasScenes && <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded flex-shrink-0">{v.scenes.length}컷</span>}
                    <button type="button" onClick={() => setExpandedId(isExp ? null : v.id)} className="flex-shrink-0">
                      <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

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

                      {/* [FIX #316] 액션 버튼 — 3개 그룹으로 정리 */}
                      <div className="space-y-2.5">
                        {/* ── 그룹 1: NLE 내보내기 (영상+자막 ZIP, 가장 눈에 띄게) ── */}
                        {hasScenes && (
                          <div className="flex gap-2 flex-wrap">
                            {(['premiere', 'capcut', 'filmora', 'vrew'] as const).map(target => {
                              const label = target === 'premiere' ? 'Premiere' : target === 'capcut' ? 'CapCut' : target === 'filmora' ? 'Filmora' : 'VREW';
                              const icon = target === 'premiere'
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
                                : target === 'capcut'
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                : target === 'filmora'
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />;
                              return (
                                <button
                                  key={target}
                                  type="button"
                                  disabled={nleExporting !== null && nleExporting.target !== target}
                                  onClick={async () => {
                                    const activeTask = nleActiveTaskRef.current;
                                    // 취소 처리: 이미 진행 중인 같은 타겟 클릭 시 취소
                                    if (activeTask?.target === target) {
                                      activeTask.controller.abort();
                                      if (nleAbortRef.current === activeTask.controller) {
                                        nleAbortRef.current = null;
                                      }
                                      if (nleActiveTaskRef.current?.controller === activeTask.controller) {
                                        nleActiveTaskRef.current = null;
                                      }
                                      setNleExporting(null);
                                      showToast('다운로드가 취소되었습니다.');
                                      return;
                                    }
                                    // 렌더 반영 전 연타로 중복 작업이 시작되는 레이스 방지
                                    if (activeTask) return;
                                    const startedAt = Date.now();
                                    const myAbort = new AbortController();
                                    nleActiveTaskRef.current = { target, controller: myAbort };
                                    nleAbortRef.current = myAbort;
                                    const isCancelled = () => myAbort.signal.aborted;
                                    // [FIX] companion이 실행 중이면 폴더 선택 다이얼로그 불필요 — 동기 캐시로 user gesture 보존
                                    const companionAlive = target !== 'vrew' && isCompanionNleAvailable();
                                    // [FIX #665/#657] companion이 없을 때만 showDirectoryPicker 호출 (user gesture 유지)
                                    let directInstallSelection: Awaited<ReturnType<typeof beginCapCutDirectInstallSelection>> = null;
                                    if (target === 'capcut' && !companionAlive && isCapCutDirectInstallSupported()) {
                                      try {
                                        directInstallSelection = await beginCapCutDirectInstallSelection();
                                      } catch (pickerErr) {
                                        console.warn('[VideoAnalysisRoom] CapCut 직접 설치 선택 실패, ZIP으로 진행:', pickerErr);
                                      }
                                    }
                                    setNleExporting({ target, step: '준비 중...', startedAt });
                                    try {
                                      // Step 1: videoBlob 확보 — 오디오 포함 보장
                                      const vaStore = useVideoAnalysisStore.getState();
                                      let videoBlob = vaStore.videoBlob;
                                      let downloadedSourceTitle = '';
                                      const sourceUrl = (youtubeUrl || validYoutubeUrls[0] || '').trim();
                                      const isYoutubeSource = !!sourceUrl && isYouTubeUrl(sourceUrl);
                                      // null(미검증)은 YouTube에서만 false로 간주해 오디오 재검증 다운로드 유도
                                      let audioConfirmed = isYoutubeSource
                                        ? vaStore.videoBlobHasAudio === true
                                        : (vaStore.videoBlobHasAudio ?? true);

                                      if (videoBlob && videoBlob.size <= 0) {
                                        videoBlob = null;
                                        audioConfirmed = false;
                                      }

                                      // YouTube 소스인 경우 항상 오디오 포함 영상을 새로 다운로드 (분석용 blob은 video-only일 수 있음)
                                      if (inputMode === 'youtube' && sourceUrl && isYoutubeSource && (!videoBlob || !audioConfirmed)) {
                                        if (isCancelled()) return;
                                        const vid = extractYouTubeVideoId(sourceUrl) || sourceUrl;

                                        // [FIX #907] 컴패니언 강제 확보 — 감지 실패 시 URL 스킴으로 자동 실행
                                        setNleExporting({ target, step: '1/3 컴패니언 연결 중...', startedAt });
                                        try {
                                          const { ensureCompanionAvailable } = await import('../../../services/ytdlpApiService');
                                          const companionOk = await ensureCompanionAvailable(myAbort.signal);
                                          if (!companionOk) {
                                            console.info('[NLE] 컴패니언 미감지 — CF Worker 폴백 사용');
                                          }
                                        } catch { /* 무시 — 다운로드는 어떻게든 진행 */ }
                                        if (isCancelled()) return;

                                        // extract 캐시 프리워밍 — 메타데이터를 미리 추출하여 캐시 활성화
                                        setNleExporting({ target, step: '1/3 영상 정보 확인 중...', startedAt });
                                        let estimatedSizeMB: number | null = null;
                                        try {
                                          const { extractStreamUrl } = await import('../../../services/ytdlpApiService');
                                          const extractPromise = extractStreamUrl(vid, '720p');
                                          const extractTimeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000));
                                          const streamInfo = await Promise.race([extractPromise, extractTimeout]);
                                          if (streamInfo) {
                                            estimatedSizeMB = streamInfo.filesize ? Math.round(streamInfo.filesize / 1024 / 1024) : null;
                                            if (streamInfo.title) downloadedSourceTitle = streamInfo.title;
                                          }
                                        } catch {
                                          // extract 실패해도 다운로드 진행에 문제 없음
                                        }
                                        if (isCancelled()) return;

                                        // [FIX #859/#742] 품질 폴백 + 재시도 — 720p 실패 시 480p → best 순서로 재시도
                                        const qualityPipeline: Array<'720p' | '480p' | 'best'> = ['720p', '480p', 'best'];
                                        let downloadSucceeded = false;
                                        for (const quality of qualityPipeline) {
                                          if (isCancelled() || downloadSucceeded) break;
                                          // [FIX #859] 각 품질 시도마다 별도 AbortController — stall 시 이전 요청 확실 중단
                                          const perQualityAbort = new AbortController();
                                          const abortOnCancel = () => perQualityAbort.abort();
                                          myAbort.signal.addEventListener('abort', abortOnCancel);
                                          let stallCheckInterval: ReturnType<typeof setInterval> | null = null;
                                          setNleExporting({ target, step: `2/3 영상 다운로드 중...${estimatedSizeMB ? ` (약 ${estimatedSizeMB}MB)` : ''}${quality !== '720p' ? ` [${quality}]` : ''}`, progress: 0, startedAt });
                                          try {
                                            // [FIX #907] 클라이언트 머지 방식 — video+audio 따로 받아서 브라우저에서 머지
                                            // 서버 머지 방식은 서버 ffmpeg 의존 + CF Worker 미지원으로 실패 빈번
                                            const { downloadVideoViaProxy, downloadAudioViaProxy } = await import('../../../services/ytdlpApiService');
                                            const downloadStartTime = Date.now();
                                            let lastProgressTime = downloadStartTime;
                                            let firstProgressReceived = false;
                                            // 비디오(videoOnly) + 오디오 병렬 다운로드
                                            const videoPromise = Promise.race([
                                              downloadVideoViaProxy(vid, quality, (p) => {
                                                if (perQualityAbort.signal.aborted) return;
                                                lastProgressTime = Date.now();
                                                firstProgressReceived = true;
                                                const elapsedSec = (Date.now() - downloadStartTime) / 1000;
                                                const downloadedMB = estimatedSizeMB ? estimatedSizeMB * p : null;
                                                const speedMBps = (elapsedSec > 1 && downloadedMB) ? (downloadedMB / elapsedSec) : null;
                                                const speedText = speedMBps ? ` ${speedMBps.toFixed(1)}MB/s` : '';
                                                const sizeText = estimatedSizeMB ? ` (약 ${estimatedSizeMB}MB)` : '';
                                                setNleExporting(prev => {
                                                  if (!prev || prev.target !== target) return prev;
                                                  return { ...prev, step: `2/3 영상 다운로드 중...${sizeText}${speedText}${quality !== '720p' ? ` [${quality}]` : ''}`, progress: Math.round(p * 100), startedAt: prev.startedAt ?? startedAt };
                                                });
                                              }, { videoOnly: true, signal: perQualityAbort.signal }),
                                              // stall detection
                                              new Promise<never>((_, reject) => {
                                                stallCheckInterval = setInterval(() => {
                                                  if (perQualityAbort.signal.aborted) { if (stallCheckInterval) clearInterval(stallCheckInterval); return; }
                                                  const stallThreshold = firstProgressReceived ? 120_000 : 180_000;
                                                  if (Date.now() - lastProgressTime > stallThreshold) {
                                                    if (stallCheckInterval) clearInterval(stallCheckInterval);
                                                    stallCheckInterval = null;
                                                    perQualityAbort.abort();
                                                    reject(new Error(`다운로드 진행 멈춤 (${quality})`));
                                                  }
                                                }, 5_000);
                                              }),
                                            ]);
                                            // [FIX #907] 오디오 다운로드에 30초 hard timeout — Promise.race로 강제 중단
                                            const audioPromise = Promise.race([
                                              downloadAudioViaProxy(vid),
                                              new Promise<null>(r => setTimeout(() => r(null), 30_000)),
                                            ]).catch(e => {
                                              console.warn(`[NLE] 오디오 다운로드 실패 (영상만 사용):`, e);
                                              return null;
                                            });
                                            const [videoDl, audioDlBlob] = await Promise.all([videoPromise, audioPromise]);
                                            if (videoDl.blob.size > 0) {
                                              let finalBlob = videoDl.blob;
                                              downloadedSourceTitle = downloadedSourceTitle || videoDl.info?.title || '';
                                              // 오디오가 있으면 클라이언트에서 머지
                                              if (audioDlBlob && audioDlBlob.size > 0) {
                                                try {
                                                  setNleExporting(prev => prev ? { ...prev, step: `2/3 오디오 병합 중...` } : prev);
                                                  const { mergeVideoAudio } = await import('../../../services/webcodecs/videoDecoder');
                                                  finalBlob = await mergeVideoAudio(videoDl.blob, audioDlBlob);
                                                  audioConfirmed = true;
                                                } catch (mergeErr) {
                                                  console.warn('[NLE] 클라이언트 머지 실패, video-only 사용:', mergeErr);
                                                  audioConfirmed = false;
                                                }
                                              } else {
                                                audioConfirmed = false;
                                              }
                                              videoBlob = finalBlob;
                                              useVideoAnalysisStore.getState().setVideoBlob(finalBlob, audioConfirmed);
                                              downloadSucceeded = true;
                                            }
                                          } catch (dlErr) {
                                            if (isCancelled()) return;
                                            console.warn(`[NLE] ${quality} 다운로드 실패 (다음 품질로 재시도):`, dlErr);
                                          } finally {
                                            // [FIX] 성공/실패 무관하게 stall interval + 이벤트 리스너 정리
                                            if (stallCheckInterval) clearInterval(stallCheckInterval);
                                            myAbort.signal.removeEventListener('abort', abortOnCancel);
                                          }
                                        }
                                        // [FIX #702] 모든 품질 시도 실패 시 기존 blob이라도 사용
                                        if (!downloadSucceeded) {
                                          const fallbackBlob = useVideoAnalysisStore.getState().videoBlob;
                                          if (!videoBlob && fallbackBlob && fallbackBlob.size > 0) {
                                            videoBlob = fallbackBlob;
                                            audioConfirmed = false;
                                            console.info('[NLE] 기존 video-only blob 폴백 사용 (오디오 미확인)');
                                          }
                                        }
                                      } else if (!videoBlob) {
                                        if (uploadedFiles[0]) {
                                          videoBlob = uploadedFiles[0];
                                          audioConfirmed = true;
                                        } else if (inputMode === 'youtube' && sourceUrl) {
                                          if (isCancelled()) return;
                                          setNleExporting({ target, step: '2/3 영상 다운로드 중...', progress: 0, startedAt });
                                          try {
                                            const dlResult = await downloadSourceVideoForNleExport(sourceUrl, { signal: myAbort.signal });
                                            if (dlResult.blob.size > 0) {
                                              videoBlob = dlResult.blob;
                                              downloadedSourceTitle = dlResult.title || '';
                                              audioConfirmed = dlResult.hasAudio;
                                              useVideoAnalysisStore.getState().setVideoBlob(dlResult.blob, dlResult.hasAudio);
                                            }
                                          } catch (dlErr2) {
                                            if (isCancelled()) return;
                                            console.warn('[NLE] 영상 다운로드 폴백 실패:', dlErr2);
                                          }
                                        }
                                      }

                                      if (isCancelled()) return;

                                      if (!videoBlob) {
                                        showToast('⚠️ 720p/480p/best 모든 품질로 시도했지만 다운로드에 실패했어요. 인터넷 연결을 확인하고 다시 시도하거나, 영상 파일을 직접 업로드해주세요.', 8000);
                                        return;
                                      }
                                      // Step 2: 영상 치수 감지 (캐시 우선)
                                      const { buildNlePackageZip, buildVideoAnalysisNarrationLines } = await import('../../../services/nleExportService');
                                      const baseName = downloadedSourceTitle
                                        ? sanitizeProjectName(downloadedSourceTitle, 30)
                                        : sanitizeProjectName(v.title, 30);
                                      const fileName = uploadedFiles[0]?.name || `${baseName}.mp4`;
                                      const soundLines = useSoundStudioStore.getState().lines;
                                      const narrationLines = buildVideoAnalysisNarrationLines({
                                        scenes: v.scenes,
                                        soundLines,
                                        versionId: v.id,
                                      });
                                      const hasSoundNarrationAudio = soundLines.some((line) => !!line.audioUrl);
                                      const hasMatchedNarrationAudio = narrationLines.some((line) => !!line.audioUrl);
                                      if (hasSoundNarrationAudio && !hasMatchedNarrationAudio) {
                                        showToast('소리 스튜디오의 나레이션이 현재 버전과 1:1로 맞지 않아 이번 NLE에는 컷/자막만 포함했어요. 장면당 1개 라인 상태에서 다시 시도해주세요.', 5000);
                                      }
                                      let dims = nleDimsCache.current;
                                      if (!dims) {
                                        if (isCancelled()) return;
                                        setNleExporting({ target, step: '3/3 패키지 생성 중... (영상 정보 확인)', startedAt });
                                        dims = await new Promise<{ w: number; h: number; fps: number; dur: number }>(resolve => {
                                          const vid = document.createElement('video');
                                          vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
                                          const url = URL.createObjectURL(videoBlob!);
                                          let resolved = false;
                                          const done = (r: { w: number; h: number; fps: number; dur: number }) => {
                                            if (resolved) return; resolved = true;
                                            vid.pause(); vid.removeAttribute('src'); vid.load();
                                            URL.revokeObjectURL(url); resolve(r);
                                          };
                                          vid.onerror = () => done({ w: 1080, h: 1920, fps: 30, dur: 0 });
                                          setTimeout(() => done({ w: vid.videoWidth || 1080, h: vid.videoHeight || 1920, fps: 30, dur: vid.duration || 0 }), 5000);
                                          vid.onloadeddata = () => {
                                            const w = vid.videoWidth || 1080;
                                            const h = vid.videoHeight || 1920;
                                            const dur = vid.duration || 0;
                                            // requestVideoFrameCallback으로 실측 fps 감지
                                            if ('requestVideoFrameCallback' in vid) {
                                              let count = 0; let t0 = 0;
                                              const onFrame = (_now: number, meta: { mediaTime: number }) => {
                                                if (count === 0) t0 = meta.mediaTime;
                                                count++;
                                                if (count >= 8) {
                                                  const elapsed = meta.mediaTime - t0;
                                                  const raw = elapsed > 0 ? (count - 1) / elapsed : 30;
                                                  const stds = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
                                                  const snapped = stds.reduce((a, b) => Math.abs(raw - a) < Math.abs(raw - b) ? a : b);
                                                  done({ w, h, fps: snapped, dur });
                                                  return;
                                                }
                                                (vid as unknown as { requestVideoFrameCallback: (cb: typeof onFrame) => void }).requestVideoFrameCallback(onFrame);
                                              };
                                              (vid as unknown as { requestVideoFrameCallback: (cb: typeof onFrame) => void }).requestVideoFrameCallback(onFrame);
                                              vid.play().catch(() => done({ w, h, fps: 30, dur }));
                                            } else {
                                              done({ w, h, fps: 30, dur });
                                            }
                                          };
                                          vid.src = url;
                                        });
                                        nleDimsCache.current = dims;
                                      }
                                      // Step 3: ZIP 패키지 생성
                                      if (isCancelled()) return;
                                      setNleExporting({ target, step: '3/3 패키지 생성 중...', startedAt });
                                      // [FIX #891/#892] 다중 소스 영상 전달 — uploadedFiles[1..N]을 additionalVideoBlobs로 전달
                                      const additionalVideoBlobs = uploadedFiles.length > 1
                                        ? uploadedFiles.slice(1).map(f => ({ blob: f as Blob, fileName: f.name }))
                                        : [];
                                      const zipBlob = await buildNlePackageZip({ target, scenes: v.scenes, title: v.title, videoBlob, videoFileName: fileName, preset: selectedPreset || undefined, width: dims.w, height: dims.h, fps: dims.fps, videoDurationSec: dims.dur, hasAudioTrack: audioConfirmed, narrationLines, additionalVideoBlobs });
                                      if (isCancelled()) return;
                                      const downloadFileName = `${sanitizeProjectName(v.title, 30)}_${label}.zip`;

                                      // [FIX #906] 1순위: 컴패니언 앱으로 직접 설치 (경로 패치 자동 처리 — "비정상경로" 방지)
                                      // VREW는 컴패니언 NLE 설치 미지원 (SRT만 필요하므로 ZIP이 적절)
                                      if (target !== 'vrew') {
                                        try {
                                          const ping = await fetch('http://127.0.0.1:9876/health', { signal: AbortSignal.timeout(3000) });
                                          if (!ping.ok) throw new Error('companion unavailable');
                                          if (isCancelled()) return;

                                          // ZIP에서 projectId 추출 (CapCut은 drafts 폴더 ID 사용)
                                          const JSZip = (await import('jszip')).default;
                                          const parsedZip = await JSZip.loadAsync(zipBlob);
                                          if (isCancelled()) return;
                                          const topFolders = Object.keys(parsedZip.files)
                                            .filter(name => name.includes('/') && !name.startsWith('media/') && !name.startsWith('audio/'))
                                            .map(name => name.split('/')[0])
                                            .filter((v2, i, a) => a.indexOf(v2) === i && v2.length > 10);
                                          const projectId = topFolders[0] || `project-${Date.now()}`;

                                          showToast(`${label}에 직접 설치 중...`);
                                          const installResult = await installNleViaCompanion({
                                            target,
                                            zipBlob,
                                            projectId,
                                          });
                                          if (isCancelled()) return;
                                          showToast(audioConfirmed
                                            ? `${label} 프로젝트를 바로 설치했습니다! ${label}에서 프로젝트를 열어 확인해주세요. (${installResult.filesInstalled}개 파일)`
                                            : `${label} 프로젝트를 설치 완료! 원본 오디오는 ${label}에서 한 번 확인해주세요. (${installResult.filesInstalled}개 파일)`, 6000);
                                          return;
                                        } catch (companionErr) {
                                          console.warn('[VideoAnalysisRoom] 컴패니언 NLE 설치 실패, 기존 방식 폴백:', companionErr);
                                          // 폴백: 기존 방식 (직접 설치 또는 ZIP 다운로드)
                                        }
                                      }

                                      // 2순위: CapCut 직접 설치 (File System API — HTTPS + Chrome/Edge 전용)
                                      if (target === 'capcut' && directInstallSelection) {
                                        try {
                                          await installCapCutZipToDirectory({
                                            zipBlob,
                                            draftsRootHandle: directInstallSelection.draftsRootHandle,
                                            draftsRootPath: directInstallSelection.draftsRootPath,
                                          });
                                          if (isCancelled()) return;
                                          showToast(audioConfirmed
                                            ? 'CapCut 프로젝트를 바로 설치했습니다! CapCut에서 프로젝트 카드를 열어 확인해주세요.'
                                            : 'CapCut 프로젝트를 설치 완료! 원본 오디오는 대부분 자동 포함되어 있지만, CapCut에서 한 번 확인해주세요.', 5000);
                                          return;
                                        } catch (installError) {
                                          const fallbackUrl = URL.createObjectURL(zipBlob);
                                          const fallbackLink = document.createElement('a');
                                          fallbackLink.href = fallbackUrl;
                                          fallbackLink.download = downloadFileName;
                                          fallbackLink.click();
                                          setTimeout(() => URL.revokeObjectURL(fallbackUrl), 10000);
                                          if (isCancelled()) return;
                                          showToast(`CapCut 직접 설치에 실패해 ZIP으로 전환했습니다. ${getCapCutManualInstallHint()} (${installError instanceof Error ? installError.message : '알 수 없는 오류'})`, 8000);
                                          return;
                                        }
                                      }

                                      // 3순위: ZIP 파일 다운로드 (수동 설치)
                                      const url = URL.createObjectURL(zipBlob);
                                      const a = document.createElement('a'); a.href = url; a.download = downloadFileName; a.click();
                                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                                      // [FIX #370] 오디오 누락 경고 — 오디오 없이 NLE 내보내기 시 사용자에게 안내
                                      if (isCancelled()) return;
                                      showToast(target === 'capcut'
                                        ? `CapCut ZIP 다운로드 완료! ${getCapCutManualInstallHint()}`
                                        : target === 'premiere'
                                          ? !audioConfirmed
                                            ? 'Premiere ZIP 다운로드 완료! 압축 해제 후 .prproj를 먼저 열어 subtitle track이 이미 올라와 있는지 확인하세요. 원본 오디오는 Premiere에서 한 번 확인해주세요.'
                                            : 'Premiere ZIP 다운로드 완료! 압축 해제 후 .prproj를 먼저 여세요. subtitle track이 타임라인에 포함되어 있어야 합니다.'
                                        : target === 'filmora'
                                          ? !audioConfirmed
                                            ? 'Filmora ZIP 다운로드 완료! ⚠️ 원본 오디오를 불러오지 못했어요. Filmora에서 수동으로 오디오를 확인해주세요.'
                                            : 'Filmora ZIP 다운로드 완료! 압축 해제 후 Filmora > File > Import > XML File로 가져오세요.'
                                          : !audioConfirmed
                                            ? `${label} 다운로드 완료! ⚠️ 원본 오디오를 불러오지 못했어요. ${label}에서 수동으로 오디오를 추가해주세요.`
                                            : `${label} 패키지 다운로드 완료!`, target === 'capcut' || !audioConfirmed ? 7000 : undefined);
                                    } catch (e) {
                                      if (isCancelled()) return;
                                      console.error('[NLE]', e); showToast(`${label} 패키지 생성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, 5000);
                                    } finally {
                                      // 자기 작업의 controller만 정리 (다른 작업이 시작됐으면 건드리지 않음)
                                      if (nleAbortRef.current === myAbort) {
                                        nleAbortRef.current = null;
                                      }
                                      if (nleActiveTaskRef.current?.controller === myAbort) {
                                        nleActiveTaskRef.current = null;
                                        setNleExporting(null);
                                      }
                                    }
                                  }}
                                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                                    nleExporting?.target === target
                                      ? 'bg-gradient-to-r from-amber-600/50 to-orange-600/50 text-amber-200 border border-amber-400/60 cursor-pointer hover:from-red-600/40 hover:to-red-500/40'
                                      : nleExporting
                                        ? 'bg-gray-700/40 text-gray-500 border border-gray-600/20 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-amber-600/30 to-orange-600/30 text-amber-300 border border-amber-500/40 hover:from-amber-600/40 hover:to-orange-600/40 hover:border-amber-400/60'
                                  }`}
                                >
                                  {nleExporting?.target === target ? (
                                    <>
                                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                      <span className="text-xs flex items-center gap-1.5">
                                        {nleExporting.step}
                                        {nleExporting.progress != null && nleExporting.progress > 0 && (
                                          <span className="font-mono text-amber-300">{nleExporting.progress}%</span>
                                        )}
                                        {nleElapsed > 0 && (
                                          <span className="text-amber-400/60">({nleElapsed}초)</span>
                                        )}
                                      </span>
                                      <span className="text-[10px] text-red-300/80 ml-1">클릭하면 취소</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                                      {label}
                                      <span className="text-[10px] text-amber-400/60 font-normal">ZIP</span>
                                    </>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* ── 그룹 2: 기본 액션 (대본복사, 프리뷰, 편집실로) ── */}
                        <div className="flex gap-1.5 flex-wrap">
                          {/* 대본 복사 드롭다운 (3종) */}
                          <div className="relative" data-copy-menu>
                            <button
                              type="button"
                              onClick={() => setCopyMenuVersionId(copyMenuVersionId === v.id ? null : v.id)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                                copiedVersion === v.id
                                  ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                                  : 'bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-white hover:border-gray-500/40'
                              }`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              {copiedVersion === v.id ? '복사됨' : '대본복사'}
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {copyMenuVersionId === v.id && (() => {
                              const ttsLabel = selectedPreset === 'snack' ? 'TTS용 자막 복사' : selectedPreset === 'alltts' ? 'TTS 대본 복사' : selectedPreset === 'deep' ? 'TTS용 나레이션 복사' : selectedPreset === 'shopping' ? 'TTS용 나레이션 복사' : 'TTS만 복사';
                              const ttsDesc = selectedPreset === 'snack' ? '자막에서 기호 제거' : selectedPreset === 'alltts' ? '최소 정제 (원본 보존형)' : selectedPreset === 'deep' ? '단락 구분 포함' : '구두점/기호/화자 제거';
                              const origLabel = selectedPreset === 'snack' ? '자막 원문 복사' : selectedPreset === 'shopping' ? '나레이션+효과 복사' : (selectedPreset === 'tikitaka' && v.detectedLang && v.detectedLang !== 'ko') ? '원어+한국어 대사 복사' : selectedPreset === 'deep' ? '나레이션 원문 복사' : '오리지널 대사 복사';
                              const origDesc = selectedPreset === 'snack' ? '자막+효과자막 포함' : selectedPreset === 'shopping' ? '상품 효과자막 포함' : (selectedPreset === 'tikitaka' && v.detectedLang && v.detectedLang !== 'ko') ? `${v.detectedLang.toUpperCase()}+KR 쌍` : '원본 대사 그대로';
                              const allLabel = selectedPreset === 'deep' ? '분석 보고서 복사' : selectedPreset === 'shopping' ? '쇼핑 대본 전체 복사' : '모두 복사';
                              const allDesc = selectedPreset === 'deep' ? '나레이션+화면지시+효과' : selectedPreset === 'shopping' ? '나레이션+효과+타임코드' : '편집표 전체 (모드/효과/타임코드)';
                              return (
                              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                                <button type="button" onClick={() => handleCopyVersion(v, 'tts')} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-blue-600/20 transition-colors">
                                  <span className="w-5 h-5 rounded bg-blue-600/20 flex items-center justify-center text-blue-400 text-[10px] font-bold">T</span>
                                  <div><div className="text-gray-200 font-medium">{ttsLabel}</div><div className="text-gray-500 text-[10px]">{ttsDesc}</div></div>
                                </button>
                                <button type="button" onClick={() => handleCopyVersion(v, 'original')} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-violet-600/20 transition-colors border-t border-gray-700/50">
                                  <span className="w-5 h-5 rounded bg-violet-600/20 flex items-center justify-center text-violet-400 text-[10px] font-bold">O</span>
                                  <div><div className="text-gray-200 font-medium">{origLabel}</div><div className="text-gray-500 text-[10px]">{origDesc}</div></div>
                                </button>
                                <button type="button" onClick={() => handleCopyVersion(v, 'all')} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left hover:bg-emerald-600/20 transition-colors border-t border-gray-700/50">
                                  <span className="w-5 h-5 rounded bg-emerald-600/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">A</span>
                                  <div><div className="text-gray-200 font-medium">{allLabel}</div><div className="text-gray-500 text-[10px]">{allDesc}</div></div>
                                </button>
                              </div>
                              );
                            })()}
                          </div>
                          {hasScenes && (
                            <>
                              {useVideoAnalysisStore.getState().videoBlob && (
                                <button type="button" onClick={() => setPreviewVersion(v)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-violet-400 hover:border-violet-500/30 transition-all">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  프리뷰
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={sendingToEditRoom}
                                onClick={() => handleSendToEditRoom(v)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                  sendingToEditRoom
                                    ? 'bg-gray-700/40 text-gray-500 border-gray-600/20 cursor-not-allowed'
                                    : 'bg-gray-700/40 text-gray-400 border-gray-600/20 hover:text-amber-400 hover:border-amber-500/30'
                                }`}
                              >
                                {sendingToEditRoom ? (
                                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M12 2a10 10 0 019.95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121" /></svg>
                                )}
                                {sendingToEditRoom ? '이동 중...' : '편집실로'}
                              </button>
                            </>
                          )}
                        </div>

                        {/* ── 그룹 3: 보조 액션 (SRT, HTML, 대본작성, TTS) ── */}
                        {hasScenes && (
                          <div className="flex gap-1.5 flex-wrap">
                            <button type="button" onClick={() => handleDownloadSrtOnly(v)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-blue-400 hover:border-blue-500/30 transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>SRT
                            </button>
                            {useVideoAnalysisStore.getState().videoBlob && (
                              <button type="button" onClick={() => handleDownloadSrt(v)} disabled={renderingVersionId === v.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-blue-400 hover:border-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                {renderingVersionId === v.id ? (<><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{renderProgress}%</>
                                ) : (<><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>SRT+영상</>)}
                              </button>
                            )}
                            <button type="button" onClick={() => handleDownloadVersionHtml(v)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-emerald-400 hover:border-emerald-500/30 transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>HTML
                            </button>
                            <button type="button" onClick={() => { if (!selectedPreset) return; const slotName = youtubeUrl || '영상 분석'; const style = buildVideoAnalysisStylePreset(v, selectedPreset, slotName); useScriptWriterStore.getState().addVideoAnalysisStyle(style); useNavigationStore.getState().setActiveTab('script-writer'); showToast(`"V${v.id} ${v.title}" 스타일이 대본작성에 적용되었어요`); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-violet-400 hover:border-violet-500/30 transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>대본작성 스타일
                            </button>
                            <button type="button" onClick={() => {
                              const soundStore = useSoundStudioStore.getState();
                              let speakerId = soundStore.speakers[0]?.id || '';
                              if (!speakerId) {
                                const ns = {
                                  id: `speaker-${Date.now()}`,
                                  name: '화자 1',
                                  color: '#c026d3',
                                  engine: 'typecast' as const,
                                  voiceId: '',
                                  language: 'ko' as const,
                                  speed: 1.0,
                                  pitch: 0,
                                  stability: 0.5,
                                  similarityBoost: 0.75,
                                  style: 0,
                                  useSpeakerBoost: true,
                                  lineCount: 0,
                                  totalDuration: 0,
                                };
                                soundStore.addSpeaker(ns);
                                speakerId = ns.id;
                              }

                              // [FIX #564] ALL TTS 전송 시 원본 영상 타이밍(start/end/duration) 유지
                              // TTS 길이는 오디오 클립 길이로만 사용하고, 장면 레이아웃은 원본 타임코드 기준으로 고정
                              let fallbackCursorSec = 0;
                              const newLines = v.scenes
                                .flatMap((s, sceneIndex) => {
                                  if (!(s.audioContent || s.dialogue || '').trim()) return [];
                                  const timing = parseSceneTimingWindow(s);
                                  const fallbackDuration = Math.max(0.1, parseDuration(s.duration));
                                  const startTime = timing ? timing.startSec : fallbackCursorSec;
                                  const endTime = timing ? timing.endSec : (startTime + fallbackDuration);
                                  const duration = timing ? timing.durationSec : fallbackDuration;
                                  fallbackCursorSec = Math.max(fallbackCursorSec, endTime);

                                  return [{
                                    id: `line-${Date.now()}-${sceneIndex}`,
                                    speakerId,
                                    text: (s.audioContent || s.dialogue || '').trim(),
                                    index: sceneIndex,
                                    sceneId: buildVideoAnalysisSceneLineId(v.id, sceneIndex),
                                    startTime,
                                    endTime,
                                    duration,
                                    ttsStatus: 'idle' as const,
                                  }];
                                });
                              if (newLines.length === 0) {
                                showToast('전송할 나레이션이 없습니다.', 3000);
                                return;
                              }
                              soundStore.setLines(newLines);
                              useNavigationStore.getState().setActiveTab('sound-studio');
                              showToast(`"V${v.id}" 나레이션 ${newLines.length}줄을 사운드 스튜디오로 전송했어요`);
                            }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-700/40 text-gray-400 border border-gray-600/20 hover:text-fuchsia-400 hover:border-fuchsia-500/30 transition-all">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>TTS 생성
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 타임라인 바 + 모드별 파이 차트 */}
                      {hasScenes && (() => {
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
                              <p className="text-[11px] text-gray-500 mb-1 font-medium">타임라인</p>
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
                                  <span key={key} className="flex items-center gap-1 text-[11px] text-gray-500">
                                    <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: mc.fill }} />
                                    {mc.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {/* 모드별 파이 차트 */}
                            <div className="w-28 flex-shrink-0 bg-gray-900/40 rounded-lg border border-gray-700/40 p-2 flex flex-col items-center">
                              <p className="text-[11px] text-gray-500 mb-0.5 font-medium">모드 비율</p>
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

                      {/* 이중 언어 토글 (해외 영상 감지 시) */}
                      {v.detectedLang && v.detectedLang !== 'ko' && v.scenes.some(s => s.audioContentOriginal) && (
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[11px] text-gray-500 font-medium">
                            {v.detectedLang.toUpperCase()} 원본 감지
                          </span>
                          <div className="flex bg-gray-800/60 rounded-lg border border-gray-700/50 p-0.5">
                            {([
                              { key: 'ko' as const, label: '한국어' },
                              { key: 'bilingual' as const, label: '원어+번역' },
                              { key: 'original' as const, label: '원어만' },
                            ]).map(opt => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => setDisplayLangMode(opt.key)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                  displayLangMode === opt.key
                                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content ID 회피 및 바이럴 분석 — 장면 테이블 상단 배치 (#508) */}
                      {v.contentId && (
                        <div className="bg-gray-900/40 rounded-lg border border-gray-700/40 p-3 space-y-2">
                          <p className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                            <span className="w-4 h-4 bg-emerald-600 rounded flex items-center justify-center text-[10px] text-white">ID</span>
                            Content ID 회피 및 바이럴 분석
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[11px] text-gray-500">텍스트 일치율</p>
                              <p className="text-sm font-bold text-emerald-400 font-mono">{v.contentId.textMatchRate}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[11px] text-gray-500">구조 유사도</p>
                              <p className="text-sm font-bold text-cyan-400 font-mono">{v.contentId.structureSimilarity}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[11px] text-gray-500">순서 유사도</p>
                              <p className="text-sm font-bold text-blue-400 font-mono">{v.contentId.orderSimilarity}%</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                              <p className="text-[11px] text-gray-500">키워드 변형률</p>
                              <p className="text-sm font-bold text-violet-400 font-mono">{v.contentId.keywordVariation}%</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${
                              v.contentId.safetyGrade.includes('매우') ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
                              : v.contentId.safetyGrade.includes('안전') ? 'bg-green-600/20 text-green-300 border-green-500/30'
                              : 'bg-yellow-600/20 text-yellow-300 border-yellow-500/30'
                            }`}>
                              {v.contentId.safetyGrade}
                            </span>
                            {v.contentId.viralPoint !== '-' && (
                              <span className="text-xs text-orange-400">
                                <span className="text-gray-500">바이럴:</span> {v.contentId.viralPoint}
                              </span>
                            )}
                          </div>
                          {v.contentId.judgement !== '-' && (
                            <p className="text-xs text-gray-500 leading-relaxed">
                              <span className="text-gray-400 font-bold">판정:</span> {v.contentId.judgement}
                            </p>
                          )}
                        </div>
                      )}

                      {/* 프리셋별 장면 테이블 */}
                      {hasScenes ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-700">
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-8">#</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-[52px]">모드</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold">{selectedPreset === 'tikitaka' ? '오디오 내용' : selectedPreset === 'snack' ? '자막 내용' : '내레이션'}</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-[110px]">효과자막</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-[60px]">예상 시간</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold">비디오 화면 지시</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-[100px]">타임코드</th>
                                {thumbnails.length > 0 && (
                                  <th className="py-2 px-2 text-left text-gray-500 font-bold w-[120px]">
                                    비주얼
                                    {isFrameUpgrading && (
                                      <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-normal text-blue-400 animate-pulse">
                                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" /></svg>
                                        정밀 프레임 업그레이드 중
                                      </span>
                                    )}
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {v.scenes.map((scene, si) => (
                                <tr key={scene.cutNum} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2 px-2 align-top">
                                    <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold text-white ${c.numBg}`}>{scene.cutNum}</span>
                                  </td>
                                  <td className="py-2 px-2 align-top">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                                      scene.mode.includes('N') ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      : scene.mode.includes('S') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : scene.mode.includes('A') ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-gray-700 text-gray-400'
                                    }`}>{scene.mode || '-'}</span>
                                  </td>
                                  <td className="py-2 px-2 align-top text-gray-300 leading-relaxed">
                                    {scene.audioContentOriginal && v.detectedLang && v.detectedLang !== 'ko' ? (
                                      displayLangMode === 'original' ? (
                                        <span className="text-gray-400 italic">{scene.audioContentOriginal}</span>
                                      ) : displayLangMode === 'bilingual' ? (
                                        <div className="space-y-1">
                                          <div className="text-gray-500 italic text-[11px] leading-relaxed">
                                            <span className="inline-block px-1 py-0.5 rounded bg-gray-700/60 text-gray-400 text-[10px] font-bold mr-1">{v.detectedLang.toUpperCase()}</span>
                                            {scene.audioContentOriginal}
                                          </div>
                                          <div className="text-gray-200 leading-relaxed">
                                            <span className="inline-block px-1 py-0.5 rounded bg-blue-600/20 text-blue-400 text-[10px] font-bold mr-1">KR</span>
                                            {scene.audioContent}
                                          </div>
                                        </div>
                                      ) : (
                                        <span>{scene.audioContent}</span>
                                      )
                                    ) : (
                                      <span>{scene.audioContent || '-'}</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2 align-top">
                                    {scene.effectSub ? (
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-xs font-bold leading-tight">{scene.effectSub}</span>
                                    ) : <span className="text-gray-600 text-xs">-</span>}
                                  </td>
                                  <td className="py-2 px-2 align-top text-center">
                                    <span className="text-violet-400 font-mono text-xs font-bold">{scene.duration || '-'}</span>
                                  </td>
                                  <td className="py-2 px-2 align-top text-gray-400 leading-relaxed text-xs">{scene.videoDirection || '-'}</td>
                                  <td className="py-2 px-2 align-top">
                                    {/* [FIX #560] 타임코드를 범위(시작~끝)로 표시 — 단일 시점만 있으면 sourceTimeline/timeline에서 범위 보충 */}
                                    <div className="text-blue-400 font-mono text-xs leading-relaxed">{(() => {
                                      const tc = scene.timecodeSource || '';
                                      if (tc && /\d+:\d+.*[~\-–—/].*\d+:\d+/.test(tc)) return tc;
                                      const rangeSrc = scene.sourceTimeline || scene.timeline || '';
                                      const rangeMatch = rangeSrc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
                                      if (rangeMatch) return `${rangeMatch[1]}~${rangeMatch[2]}`;
                                      return tc || '-';
                                    })()}</div>
                                  </td>
                                  {thumbnails.length > 0 && (() => {
                                    // 티키타카: timecodeSource, 스낵형: sourceTimeline (원본) 우선
                                    const tc = scene.timecodeSource || scene.sourceTimeline || '';
                                    // 원본 타임코드에서 첫 번째 값 추출 (복수 타임코드 중 첫 번째)
                                    const firstTc = tc.split(/[/~,]/)[0].trim();
                                    let sceneTimeSec = timecodeToSeconds(firstTc);
                                    // 소스 타임코드 없으면 배치 타임코드 시도
                                    if (sceneTimeSec <= 0 && scene.timeline) {
                                      const range = scene.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
                                      if (range) {
                                        const mid = (timecodeToSeconds(range[1]) + timecodeToSeconds(range[2])) / 2;
                                        if (mid > 0) sceneTimeSec = mid;
                                      }
                                    }
                                    // [FIX #156] 다중 영상: 소스 인덱스 추출 (AI 출력의 "[소스 N]" 패턴 매칭)
                                    const sourceMatch = tc.match(/\[소스\s*(\d+)\]/);
                                    const sceneSourceIdx = sourceMatch ? parseInt(sourceMatch[1], 10) - 1 : undefined;
                                    // 해당 소스의 프레임만 필터링 (다중 영상 시)
                                    const hasMultipleSources = thumbnails.some(f => f.sourceIndex !== undefined && f.sourceIndex > 0);
                                    const relevantFrames = hasMultipleSources && sceneSourceIdx !== undefined
                                      ? thumbnails.filter(f => f.sourceIndex === sceneSourceIdx)
                                      : thumbnails;
                                    // 최종 폴백: 장면 인덱스로 프레임 분산 배치 (항상 같은 썸네일 방지)
                                    const matched = sceneTimeSec > 0 && relevantFrames.length > 0
                                      ? matchFrameToTimecode(sceneTimeSec, relevantFrames)
                                      : (relevantFrames.length > 0
                                          ? relevantFrames[Math.min(Math.floor((si / Math.max(v.scenes.length, 1)) * relevantFrames.length), relevantFrames.length - 1)]
                                          : thumbnails[Math.min(Math.floor((si / Math.max(v.scenes.length, 1)) * thumbnails.length), thumbnails.length - 1)] || null);
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
                                          <div className="text-[11px] text-gray-600 text-center font-mono group-hover:text-blue-400 transition-colors">{formatTimeSec(matched.timeSec)}</div>
                                          {/* [FIX #156] 다중 영상 시 소스 파일명 표시 */}
                                          {matched.sourceFileName && hasMultipleSources && (
                                            <div className="text-[10px] text-cyan-500/70 truncate max-w-[100px]" title={matched.sourceFileName}>
                                              {matched.sourceFileName.length > 15 ? matched.sourceFileName.slice(0, 12) + '...' : matched.sourceFileName}
                                            </div>
                                          )}
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

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* ═══ 인기 쇼츠 음원 추천 (스낵형 전용) ═══ */}
      {/* [FIX #316] rawResult 대신 versions 기반 표시 — rawResult 유실 시에도 동작 */}
      {versions.length > 0 && selectedPreset === 'snack' && (
        <div className="bg-gray-800/40 rounded-2xl border border-fuchsia-500/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-fuchsia-400 flex items-center gap-2">
              <span className="w-6 h-6 bg-gradient-to-br from-fuchsia-500 to-pink-600 rounded-lg flex items-center justify-center text-white text-xs">&#9835;</span>
              인기 쇼츠 음원
            </h3>
            <button
              type="button"
              onClick={handleFetchTrendingBgm}
              disabled={isBgmLoading}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isBgmLoading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 hover:bg-fuchsia-600/30'}`}
            >
              {isBgmLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-fuchsia-400/30 border-t-fuchsia-400 rounded-full animate-spin" />
                  AI 검색 중...
                </span>
              ) : trendingBgm.length > 0 ? '새로고침' : '추천 받기'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">AI가 실시간 웹 검색으로 현재 쇼츠에서 유행하는 음원을 찾아드려요. 클릭하면 YouTube에서 바로 들어볼 수 있어요.</p>
          {trendingBgm.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {trendingBgm.map((bgm, idx) => (
                <a
                  key={`${bgm.videoId}-${idx}`}
                  href={`https://www.youtube.com/watch?v=${bgm.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-gray-900/60 rounded-xl border border-gray-700/40 overflow-hidden hover:border-fuchsia-500/40 hover:bg-gray-900/80 transition-all"
                >
                  <div className="relative aspect-video bg-black">
                    <img src={bgm.thumbnail} alt={bgm.title} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-bold text-gray-200 line-clamp-1">{bgm.title}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-1">{bgm.artist}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 업로드 마스터 지침서 ═══ */}
      {/* [FIX #316] rawResult 유실 시에도 versions 기반 표시 */}
      {versions.length > 0 && (
        <Suspense fallback={<div className="h-12 bg-gray-800/40 rounded-2xl animate-pulse" />}>
          <UploadMasterGuide rawResult={rawResult || ''} versions={versions.map(v => ({ title: v.title, concept: v.concept }))} onAiResultChange={setGuideAiResult} />
        </Suspense>
      )}

      {/* ═══ 하단 액션 ═══ */}
      {/* [FIX #316] rawResult 유실 시에도 하단 액션 표시 */}
      {versions.length > 0 && (
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
            disabled={sendingToEditRoom}
            onClick={() => handleSendToEditRoom(null)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all transform ${
              sendingToEditRoom
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed scale-100'
                : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white hover:scale-[1.02]'
            }`}
          >
            {sendingToEditRoom ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M12 2a10 10 0 019.95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
            )}
            {sendingToEditRoom ? '편집실로 이동 중...' : '편집실로 보내기 (영상+프레임 포함)'}
            {!sendingToEditRoom && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>}
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

      {/* ═══ 시나리오 프리뷰 플레이어 (MP4 + SRT 내보내기) ═══ */}
      {previewVersion && useVideoAnalysisStore.getState().videoBlob && (
        <Suspense fallback={null}>
          <ScenarioPreviewPlayer
            version={previewVersion}
            videoBlob={useVideoAnalysisStore.getState().videoBlob!}
            onClose={() => setPreviewVersion(null)}
            onDownloadSrt={() => handleDownloadSrt(previewVersion)}
            onDownloadSrtOnly={() => handleDownloadSrtOnly(previewVersion)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default VideoAnalysisRoom;
