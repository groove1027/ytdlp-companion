import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage, EvolinkContentPart } from '../../../services/evolinkService';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { getYoutubeApiKey } from '../../../services/apiService';
import { monitoredFetch } from '../../../services/apiService';

type AnalysisPreset = 'tikitaka' | 'snack';

/** 장면 하나의 구조화 데이터 (스낵형 + 티키타카 공용) */
interface SceneRow {
  cutNum: number;
  // 스낵형 컬럼
  timeline: string;      // 배치 타임코드 (00:00~00:03)
  sourceTimeline: string; // 원본 타임코드
  dialogue: string;      // 대사/나레이션
  effectSub: string;     // 효과 자막
  sceneDesc: string;     // 장면 설명
  // 티키타카 마스터 편집 테이블 컬럼
  mode: string;           // [N], [S], [A]
  audioContent: string;   // 오디오 내용 (대사/내레이션/현장음)
  duration: string;       // 예상 시간 (예: 4.0초)
  videoDirection: string; // 비디오 화면 지시
  timecodeSource: string; // 타임코드 소스 (MM:SS.ms)
}

/** 10개 버전 중 하나 */
interface VersionItem {
  id: number;
  title: string;
  concept: string;
  scenes: SceneRow[];
}

/** 타임스탬프 포함 프레임 (비주얼 타임코드 매칭용) */
interface TimedFrame {
  url: string;
  timeSec: number;
}

// ═══════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════

/** "4.0초" → 4.0 파싱 */
function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*초/);
  return m ? parseFloat(m[1]) : 3;
}

/** 마크다운 테이블 행 파싱 (티키타카 마스터 편집 테이블) */
function parseTikitakaTable(content: string): SceneRow[] {
  const rows: SceneRow[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) continue;
    // 헤더·구분자 행 스킵: 순서, :---, 모드, 오디오, 비디오 등 헤더 키워드
    if (/순서|:[\s]*---|모드\s*\|.*오디오|오디오\s*내용|비디오\s*화면|예상\s*시간|타임코드\s*소스/i.test(trimmed)) continue;

    // 앞뒤 | 제거 후 분할
    const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const cells = stripped.split('|').map(c => c.trim());
    if (cells.length < 5) continue;

    const cutNum = parseInt(cells[0], 10);
    if (isNaN(cutNum)) continue;

    const mode = cells[1] || '';
    const audioContent = cells[2] || '';
    const duration = cells[3] || '';
    const videoDirection = cells[4] || '';
    const timecodeSource = cells[5] || '';

    rows.push({
      cutNum,
      mode,
      audioContent,
      duration,
      videoDirection,
      timecodeSource,
      // 호환 필드 (SRT 등에서 사용)
      timeline: '',
      sourceTimeline: timecodeSource,
      dialogue: audioContent,
      effectSub: '',
      sceneDesc: videoDirection,
    });
  }

  return rows;
}

/** AI 응답에서 ---VERSION N--- + ---SCENE--- / 테이블 구조 파싱 */
function parseVersions(raw: string): VersionItem[] {
  // VERSION 블록 분리 — 다양한 구분자 패턴 지원
  const blocks = raw.split(/---\s*VERSION\s*(\d+)\s*---/i);
  const items: VersionItem[] = [];

  for (let i = 1; i < blocks.length; i += 2) {
    const num = parseInt(blocks[i], 10);
    const content = blocks[i + 1]?.trim() || '';
    if (!content) continue;

    // 제목 추출 — "제목:" 또는 "**제목:**" 또는 "### 제목:" 등
    const titleMatch = content.match(/(?:\*{0,2})제목(?:\*{0,2})[:\s：]+\s*(.+)/);
    // 컨셉 추출 — 테이블 시작 전까지
    const conceptMatch = content.match(/(?:\*{0,2})컨셉(?:\*{0,2})[:\s：]+\s*([\s\S]*?)(?=\n\s*\|[\s]*순서|\n\s*\|\s*:?---|---SCENE|$)/i);

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
        let sourceTimeline = extractField(sContent, '원본') || '';
        // 배치 필드 안에 "(원본 ...)" 형태로 원본 구간이 포함된 경우 분리
        const embedSrc = rawTimeline.match(/\((?:원본\s*)?(\d{2}:\d{2}[^\)]*)\)/);
        if (embedSrc) {
          if (!sourceTimeline) sourceTimeline = embedSrc[1].trim();
          timeline = rawTimeline.replace(/\s*\([^)]*\)/, '').trim();
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
    });
  }

  if (items.length >= 3) return items;

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

/** YouTube URL에서 Video ID 추출 */
function extractYouTubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
}

/** ISO 8601 duration (PT1M30S) → 초 변환 */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
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
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve([]); return; }
      const frames: TimedFrame[] = [];
      const interval = 2; // 2초 간격
      const count = Math.min(Math.ceil(dur / interval), 60); // 최대 60프레임
      for (let i = 0; i < count; i++) {
        const timeSec = Math.min((i + 0.5) * interval, dur - 0.1);
        video.currentTime = timeSec;
        await new Promise<void>(r => { video.onseeked = () => r(); });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({ url: canvas.toDataURL('image/jpeg', 0.6), timeSec });
      }
      URL.revokeObjectURL(url);
      resolve(frames);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
  });
}

/** 타임코드 문자열 → 초 변환 (00:03 → 3, 01:30 → 90) */
function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 1000 : 0);
}

/** 초 → SRT 타임코드 (00:00:03,000) */
function secondsToSrtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
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
  // 스낵형: 배치 타임코드 기반
  return scenes.map((scene, i) => {
    const parts = scene.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*~\s*(\d+:\d+(?:\.\d+)?)/);
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
  const blob = new Blob([content], { type: 'text/srt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// 시스템 프롬프트 (변경 금지)
// ═══════════════════════════════════════════════════

const TIKITAKA_SCRIPT_SYSTEM = `# [최종 완성판] 크로스 더빙(Cross-Dubbing) 숏폼 제작 & AI 분석 지침서 V3.0

## 서론: 크로스 더빙의 정의와 메커니즘
이 편집 방식의 핵심은 **'리듬감'**과 **'친절함'**입니다.
- **언어 장벽 해소:** 해외 영상을 가져올 때, 모든 대사를 자막으로 처리하면 지루합니다. 더빙이 상황을 요약해주므로 시청자는 편안하게 내용을 받아들입니다.
- **텐션 유지:** 더빙(설명/빌드업) ↔ 원본(리액션/펀치라인)이 핑퐁처럼 오가며 쉴 틈 없는 오디오 밀도를 만들어냅니다.
- **제3자적 개입:** 유튜버(화자)가 영상 속 인물과 대화하듯, 혹은 친구에게 썰을 풀듯 이야기하는 방식이라 친밀감이 높습니다.

## [SPECIAL] 챕터 0: 60초 원본 영상 AI 분석 및 설계 프로토콜

### 0.1. 컷 분류 기준 (Keep vs Kill)
원본 영상을 프레임 단위로 분석하여 살릴 곳과 덮을 곳을 나눕니다.

**살릴 구간 (Source-Alive):**
- 오디오 볼륨이 급격히 커지는 구간 (비명, 환호, 타격음)
- 표정 변화가 극적인 클로즈업 샷
- "No way", "Oh my god", "Look at this" 등 짧고 명확한 외국어 감탄사

**덮을 구간 (Dubbing-Cover):**
- 단순 이동, 준비 동작, 걷는 장면 (데드 타임)
- 설명이 길고 지루한 대화 구간
- 오디오가 비거나 잡음만 있는 구간

### 0.2. 소스 입력 변환 모듈
**텍스트/글 입력 시:** 핵심 문장 추출 → 비주얼 매칭 → 가상 원본 생성
**긴 영상/링크 입력 시:** 오디오 피크 탐색(3~4개 B파트 확보) → 죽은 시간 제거(A파트로 덮기) → 타임라인 재배치

## 챕터 1: 구조 설계 (타임라인 매핑)
- **A파트 (더빙 - Narrator):** 상황 설명, 배경 지식, 다음 장면에 대한 기대감 조성
- **B파트 (원본 - Source):** 현장감, 리얼한 반응, 외국어 대사 중 감정이 실린 부분

## 챕터 2: 스크립트 작성 (핵심 논리)
**'번역'이 아니라 '초월 번역(해설)'** — 원본의 말을 그대로 한국어로 옮기는 것이 아니라, 상황을 맛깔나게 요약

### 핑퐁 스크립트 3대 원칙
1. **원본 대사를 침범하지 마라** — 핵심 대사("Oh my god!", "It's terrible!")는 살리고, 빈 공간을 더빙으로 채운다
2. **더빙은 '빌드업'이다** — (나쁜 예) "이 남자가 콜라를 마십니다." / (좋은 예) "과연 100년 전통의 맛은 어떨까요?"
3. **대화하듯 써라** — 시청자에게 말을 걸거나 혼잣말하듯

### 만능 스크립트 템플릿
1. [더빙] 후킹(Hook): "OOO는 과연 실제로 가능할까?"
2. [원본] 증거(Proof): 짧고 강렬한 시각적/청각적 장면
3. [더빙] 전개(Bridge): "그래서 참지 못하고 바로 OO했습니다."
4. [원본] 현장(Reality): 현장 도착/물건 개봉
5. [더빙] 절정(Climax): "드디어 대망의 순간! 과연 그 결과는?"
6. [원본] 펀치라인: 핵심 리액션
7. [더빙] 결말(Outro): "결국 제 지갑만 털렸네요."

## 챕터 3: 더빙 톤 설정
- **정보 전달형:** 뉴스 아나운서처럼 깔끔하게
- **유튜버형 (추천):** 친구한테 신나서 이야기하는 듯한 하이텐션
- **냉소적형:** 한심하다는 듯 툭 내뱉는 말투
- **속도:** 평소 1.2배 빠르게. **단문으로 끊어서** — 편집점에서 잘라 붙이기 편하게

## 챕터 4: 오디오 덕킹 & 컷 편집
- **더빙 구간:** 원본 오디오 -15~-20dB (완전히 끄지 않고 배경으로)
- **원본 구간:** 더빙 끝나는 순간 원본 0dB로 확 키움
- **크로스 포인트:** J-컷(원본이 0.2초 먼저 진입) / L-컷(더빙이 0.2초 먼저 진입)으로 속도감 배가
- **데드 에어 제거:** 숨 쉬는 구간, 말 사이 공백 모조리 컷
- **점프 컷:** 더빙 문장 끝날 때마다 화면 확대(110%) 또는 각도 변경

## 챕터 5: 자막 이원화
- **더빙 자막:** 화면 하단 중앙, 굵은 고딕체, 노란/흰색 + 검은 테두리, Pop-up 등장
- **원본 영상 자막:** 더빙보다 약간 아래 or 인물 근처, 다른 폰트/색상, 넷플릭스식 번역 + (감정 상태)
- **다이내믹 줌:** 원본 "Oh my god!" 순간 → 얼굴 줌인 / 더빙 상황 설명 → 줌아웃 전경

## 챕터 6: 최종 체크리스트
- 오디오 밸런스: 더빙↔원본 소리 간섭 없는가?
- 리듬감: 툭-탁-툭-탁 대화의 리듬이 느껴지는가?
- 초반 3초: 훅(Hook)이 바로 들어가는가?
- 자막 싱크: 말 끝나는 순간 자막도 정확히 사라지는가?

---

# 🎬 [티키타카] 편집점 지침서 V14.0 (Ultimate)

## [System Role]
너는 **스크립트(청각 정보)와 비디오(시각 정보), 현장 앰비언스(분위기)를 나노 단위로 동기화**하는 **'마스터 에디팅 아키텍트'**다.
내레이션의 **물리적 시간(Real-Time)**을 계산하고, 그 시간을 채우기 위해 **여러 개의 짧은 컷을 쌓는(Stacking)** 전략을 구사한다.
대사가 없더라도 **강렬한 현장음(한숨, 타격음, 발소리 등)이 필요한 순간을 포착하여 시청각적 임팩트를 극대화**해야 한다.

## ☠️ 제0-1원칙: '데이터 무결성(Data Integrity)' 절대 원칙
1. **삼위일체(Trinity) 법칙:** [소스 ID] + [정확한 타임코드] + [장면 내용]은 반드시 한 세트. 하나라도 누락/불일치 시 해당 컷은 폐기.
2. **근사치 엄금:** "대략 1분 쯤" 등 추상적 표현은 편집 사고의 주범. 사용 엄격 금지.
3. **무관용 원칙:** 타임코드 없는 장면 묘사는 '소설'. 편집 지시서로서 효력 0%.

## 👑 제0-2원칙: '절대 시간(Absolute Time)'
1. **단위 표준화:** 타임코드는 반드시 **MM:SS.ms** 형식.
2. **샷 순수성 보장:** 컷 경계선에서 ±0.1초(100ms) 안쪽 구간만 사용하여 글리치 차단.

## 🔬 나노 단위 소스 분석 프로세스
1. **컷 경계 감지 & 안전 마진:** Raw In-Point + 0.100s = Safe In-Point / Raw Out-Point - 0.100s = Safe Out-Point
2. **절대 타임코드 정밀 추출:** MM:SS.ms 단위 추출, 0.1초 오차 내 일치 검증
3. **무결성 바인딩:** [S-XX] ID + [00:00.000] 시간 + [내용]을 용접하듯 결합. 타임코드 없는 행은 삭제.

## 제1원칙: 물리적 시간 준수의 법칙
- **내레이션 속도 계산:** 한국어 내레이션은 평균 **4글자당 1초** 소요.
  - 예: "승일이 결국 참지 못하고 폭발합니다." (16글자) → 최소 4.0초 비디오 필요
- **비디오 종속성:** 내레이션 오디오 길이가 주(Master), 비디오는 그 길이에 맞춤.
- **액션의 시간:** 현장음 주도 구간은 해당 액션 완료 실제 시간을 100% 보장.

## 제2원칙: 다이내믹 컷 분할 전략
내레이션이 길어 비디오 하나로 채울 수 없을 때, **슬로우 모션 절대 금지**. 대신 **정배속 컷 분할** 사용.
- NG: 승일 얼굴 하나를 4초 늘림 (지루함)
- OK: (1) 승일 물 마심 1.5초 + (2) 미나수 턱 굄 1.5초 + (3) 규현 인상 1.0초 = 총 4.0초 (속도감 유지)

## 제3원칙: 오디오 모드별 편집 규칙

### 🅰️ 모드 [N]: 내레이션 턴 (Narration)
- **오디오:** AI 성우 내레이션 ON / 원본 소리 MUTE
- **비디오:** 다이내믹 컷 분할로 내레이션 시간 꽉 채움
- **소스:** 리액션, 듣는 표정, 상황 묘사 컷 빠르게 교차 편집

### 🅱️ 모드 [S]: 현장음 턴 - 대사 (Sound/Dialogue)
- **오디오:** 원본 캐릭터 대사 ON / 내레이션 STOP
- **비디오:** 대사하는 캐릭터의 립싱크(Lip-Sync) 정확히 맞춤
- **소스:** 해당 대사가 나오는 원본 타임코드 구간

### ©️ 모드 [A]: 현장음 턴 - 액션 & 앰비언스
- **오디오:** 원본 현장음 ON (한숨, 문 닫는 소리, 급정거 등) / 내레이션 STOP
- **비디오:** 소리 발생하는 동작을 액션 싱크(Action-Sync)로 표현
- **목적:** 내레이션과 대사 사이에 '호흡'과 '리얼리티' 부여

## 제4원칙: 타임코드 정밀 타격
1. **반올림/버림 금지:** 원본 데이터에 00:21:02라면 반드시 00:21로 기재. 00:20으로 뭉뚱그림 = 편집 사고.
2. **증거 우선주의:** 스크린샷/영상 파일의 타임코드가 최우선 기준.
3. **시작점(In-point) 정확성:** 대사/액션 시작되는 정확한 프레임(초)을 찾아 기재.

## ⚠️ 최종 검수 및 강제 재수행
1. 모든 행에 MM:SS.ms 형식 타임코드 확인
2. 장면 및 타임코드 완벽 일치 최종 대조
3. 타임코드 누락 또는 소스번호-내용 불일치 행이 하나라도 있으면 처음부터 재수행

## 📋 출력 필수 포맷: 마스터 편집 테이블
표 안에서 HTML 태그(<br>) 절대 사용 금지. (1), (2)와 / 기호로 컷 구분.

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 예상 시간 | 비디오 화면 지시 (정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "승일이 결국 참지 못하고 폭발합니다." | 4.0초 | (1) [컷1] 승일 물 마심 (2.0초) / (2) [컷2] 승일 고개 숙임 (2.0초) | 00:11.200 / 00:53.000 |
| 2 | [A] | (현장음) (컵을 테이블에 쾅 내려놓는 소리) | 1.5초 | (1) [액션] 승일이 컵을 거칠게 내려놓음 (클로즈업) | 00:53.500 |
| 3 | [S] | (승일) "나 나가고 싶어." | 2.0초 | (1) [립싱크] 승일 대사 (정배속) | 00:55.120 |`;

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

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: { label: '티키타카', description: '크로스 더빙 스타일 — 더빙과 원본이 핑퐁처럼 교차하는 숏폼', color: 'blue' },
  snack: { label: '스낵형', description: '비선형 컷 편집 & 이원화 자막 — 바이럴 숏폼 전문 PD v10.8', color: 'amber' },
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
  if (preset === 'tikitaka') {
    return `## 분석 대상
${inputDesc}

## 지시 사항
위 영상의 **실제 제목, 설명, 태그, 댓글 등 모든 정보를 철저히 분석**하여 **10가지 서로 다른 크로스 더빙(티키타카) 리메이크 버전**을 설계하세요.

### 🚨 최우선 규칙: 영상 내용 충실 반영
- **제목은 위에 제공된 영상의 실제 내용/주제를 기반으로** 작성해야 합니다. 영상과 무관한 제목 작성 시 전체 폐기.
- **설명(Description)과 댓글의 핵심 내용을 빠짐없이 반영**하세요. 영상에 나오는 인물, 사건, 상황을 정확히 파악하세요.
- **첨부된 프레임 이미지를 꼼꼼히 분석**하여 비디오 화면 지시에 구체적으로 반영하세요.

### ⚠️ 절대 규칙 (위반 시 전체 재작성)
1. **출력 포맷은 오직 [마스터 편집 테이블]만 사용.** 스낵형/비선형 컷 편집/효과 자막 형식 절대 금지.
2. 모드는 **[N](내레이션), [S](현장음-대사), [A](현장음-액션)** 중 하나만 사용.
3. 타임코드는 **MM:SS.ms** 형식 엄수 (예: 00:11.200). 근사치·추상적 표현 금지.
4. 예상 시간은 **X.X초** 형식 (예: 4.0초). 내레이션은 한국어 평균 4글자/초로 계산.
5. 비디오 화면 지시는 **(1) [컷1] 설명 (시간) / (2) [컷2] 설명 (시간)** 형식. HTML 태그 금지.
6. 슬로우 모션 금지 — 정배속 멀티 컷 분할 전략 사용.
7. **제목은 반드시 이 영상의 실제 내용과 직접적으로 관련된 클릭 유도 제목**이어야 함. 영상과 무관한 제목 절대 금지.
8. **각 버전은 서로 다른 크로스 더빙 전략** (컨셉, 톤, 구조, 후킹, 순서 재배치 등)을 사용.
9. **버전당 최소 6개 이상, 최대 12개 행.** 총 60초 내외 설계. 모든 행에 6열 완비.
10. **각 VERSION 사이에 설명 텍스트 없이 바로 다음 VERSION으로.** 테이블 외 불필요한 텍스트 금지.

### 출력 포맷 (이 형식을 정확히 따르세요)

---VERSION 1---
제목: [이 영상 내용과 관련된 클릭 유도 제목]
컨셉: [이 버전만의 차별화된 크로스 더빙 전략 설명 1~2줄]

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 예상 시간 | 비디오 화면 지시 (정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "후킹 대사" | 3.5초 | (1) [컷1] 장면 설명 (1.5초) / (2) [컷2] 장면 설명 (2.0초) | 00:03.200 / 00:15.800 |
| 2 | [A] | (현장음) (소리 묘사) | 1.5초 | (1) [액션] 동작 설명 (클로즈업) | 00:16.500 |
| 3 | [S] | (인물) "원본 대사" | 2.0초 | (1) [립싱크] 인물 대사 (정배속) | 00:18.100 |
| ... | ... | ... | ... | ... | ... |

---VERSION 2---
제목: ...
컨셉: ...

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 예상 시간 | 비디오 화면 지시 (정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | ... | ... | ... | ... | ... |

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

  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<AnalysisPreset | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'analyzing'>('idle');
  const [rawResult, setRawResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<TimedFrame[]>([]);
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  const analysisStartRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInput = inputMode === 'youtube' ? youtubeUrl.trim().length > 0 : uploadedFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setRawResult(''); setError(null); setVersions([]); setThumbnails([]); }
  };

  const resetResults = useCallback(() => {
    setRawResult(''); setError(null); setVersions([]); setThumbnails([]); setExpandedId(null);
  }, []);

  // ── 분석 실행 ──
  const handleAnalyze = async (preset: AnalysisPreset) => {
    if (!requireAuth('영상 분석')) return;
    if (!hasInput) return;
    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    setElapsedSec(0);
    setSimProgress(0);
    analysisStartRef.current = Date.now();
    resetResults();

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM : SNACK_SCRIPT_SYSTEM;

    try {
      // 1단계: 프레임/썸네일 추출 + YouTube 메타데이터 가져오기
      let frames: TimedFrame[] = [];
      let inputDesc = '';

      if (uploadedFile) {
        frames = await extractVideoFrames(uploadedFile);
        inputDesc = `업로드된 영상 파일: ${uploadedFile.name} (${((uploadedFile.size || 0) / 1024 / 1024).toFixed(1)}MB)\n총 ${frames.length}개 프레임 추출 (2초 간격, 타임스탬프 포함)`;
      } else {
        const vid = extractYouTubeVideoId(youtubeUrl);
        if (vid) {
          // YouTube Data API로 실제 영상 정보 가져오기
          const [meta, comments] = await Promise.all([
            fetchYouTubeVideoMeta(vid),
            fetchYouTubeComments(vid),
          ]);

          // 영상 길이 파싱 → 썸네일 타임스탬프 추정
          const durationSec = meta ? parseIsoDuration(meta.duration) : 60;
          frames = [
            { url: `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`, timeSec: 0 },
            { url: `https://img.youtube.com/vi/${vid}/1.jpg`, timeSec: Math.round(durationSec * 0.25) },
            { url: `https://img.youtube.com/vi/${vid}/2.jpg`, timeSec: Math.round(durationSec * 0.5) },
            { url: `https://img.youtube.com/vi/${vid}/3.jpg`, timeSec: Math.round(durationSec * 0.75) },
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
            inputDesc = `YouTube 영상 URL: ${youtubeUrl.trim()}\n(메타데이터 조회 실패 — 첨부된 프레임 이미지를 꼼꼼히 분석하세요)`;
          }
        } else {
          inputDesc = `YouTube 영상 URL: ${youtubeUrl.trim()}`;
        }
      }
      setThumbnails(frames);

      // 2단계: 멀티모달 메시지 빌드 — Gemini에 타임스탬프 라벨 포함 프레임 전달
      const textContent = buildUserMessage(inputDesc, preset);
      let userContent: string | EvolinkContentPart[];
      if (frames.length > 0) {
        // AI에 보낼 대표 프레임 선택 (최대 10개, 균등 간격)
        const aiFrameCount = Math.min(frames.length, 10);
        const frameStep = frames.length / aiFrameCount;
        const aiFrames = Array.from({ length: aiFrameCount }, (_, i) => frames[Math.floor(i * frameStep)]);
        const parts: EvolinkContentPart[] = [
          { type: 'text', text: textContent },
          ...aiFrames.flatMap(f => [
            { type: 'text' as const, text: `[프레임 ${formatTimeSec(f.timeSec)}]` },
            { type: 'image_url' as const, image_url: { url: f.url } },
          ]),
        ];
        userContent = parts;
      } else {
        userContent = textContent;
      }

      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: scriptSystem },
        { role: 'user', content: userContent },
      ];

      // 3단계: AI 분석 (Gemini 3.1 Pro — 프레임 단위 시각 분석 포함)
      const response = await evolinkChat(messages, { temperature: 0.5, maxTokens: 40000 });

      const text = response.choices[0]?.message?.content || '';
      setRawResult(text);
      setVersions(parseVersions(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  // 버전 복사
  const handleCopyVersion = useCallback(async (v: VersionItem) => {
    const isTk = selectedPreset === 'tikitaka';
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
    const isTk = selectedPreset === 'tikitaka';
    const srt = generateSrt(v.scenes, isTk);
    const safeName = v.title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40);
    downloadSrt(srt, `${safeName || `version-${v.id}`}.srt`);
  }, [selectedPreset]);

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

  // ESC
  useEffect(() => {
    if (!expandedId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [expandedId]);

  return (
    <div className="space-y-6">
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
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-600 rounded-lg py-8 flex flex-col items-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">클릭하여 영상 파일 선택</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSel = selectedPreset === key && isAnalyzing;
            const cMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hover: 'hover:bg-amber-600/20' },
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
      </div>

      {/* ═══ 로딩 ═══ */}
      {isAnalyzing && (() => {
        const elMin = Math.floor(elapsedSec / 60);
        const elS = elapsedSec % 60;
        const remainSec = simProgress > 0 ? Math.max(0, Math.round(elapsedSec / simProgress * (100 - simProgress))) : ESTIMATED_TOTAL_SEC;
        const remMin = Math.floor(remainSec / 60);
        const remS = remainSec % 60;
        return (
          <div className="bg-gray-800/50 rounded-xl border border-blue-500/20 p-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
              <div className="flex-1">
                <p className="text-white font-semibold">10가지 리메이크 버전 생성 중...</p>
                <p className="text-gray-400 text-sm">AI가 영상을 분석하고 장면별 편집 가이드를 작성하고 있습니다.</p>
              </div>
              <span className="text-blue-400 font-bold text-lg tabular-nums">{simProgress}%</span>
            </div>
            {/* 프로그레스 바 */}
            <div className="mt-4 h-2 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${simProgress}%` }}
              />
            </div>
            {/* 경과 시간 / 예상 완료 */}
            <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
              <span className="text-gray-400">
                경과 <span className="text-gray-300 font-medium">{elMin > 0 ? `${elMin}분 ` : ''}{String(elS).padStart(2, '0')}초</span>
              </span>
              <span className="text-gray-500">
                예상 완료까지 약 <span className="text-blue-400/80 font-medium">{remMin > 0 ? `${remMin}분 ` : ''}{String(remS).padStart(2, '0')}초</span>
              </span>
            </div>
          </div>
        );
      })()}

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
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center text-sm">🎬</span>
            리메이크 {versions.length}가지 버전
          </h2>

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
                      {/* 컨셉 */}
                      {v.concept && (
                        <p className="text-gray-400 text-sm leading-relaxed bg-gray-900/40 rounded-lg px-3 py-2 border border-gray-700/40">{v.concept}</p>
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
                              onClick={() => {
                                const isTk = selectedPreset === 'tikitaka';
                                const versionText = isTk
                                  ? `제목: ${v.title}\n컨셉: ${v.concept}\n\n` + v.scenes.map(s =>
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
                      {hasScenes && selectedPreset === 'tikitaka' && (() => {
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
                                {selectedPreset === 'tikitaka' ? (
                                  <>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[52px]">모드</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">오디오 내용</th>
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
                                  {selectedPreset === 'tikitaka' ? (
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
                                          {scene.timeline && <div className="text-blue-400 font-mono text-[10px]">{scene.timeline}</div>}
                                          {scene.sourceTimeline && <div className="text-gray-500 font-mono text-[10px]">원본: {scene.sourceTimeline}</div>}
                                        </div>
                                      </td>
                                    </>
                                  )}
                                  {thumbnails.length > 0 && (() => {
                                    const tc = scene.timecodeSource || scene.sourceTimeline || scene.timeline || '';
                                    const firstTc = tc.split(/[/~,]/)[0].trim();
                                    const sceneTimeSec = timecodeToSeconds(firstTc);
                                    const matched = matchFrameToTimecode(sceneTimeSec, thumbnails);
                                    return matched ? (
                                      <td className="py-2 px-2 align-top">
                                        <div className="space-y-0.5">
                                          <img
                                            src={matched.url}
                                            alt={`Scene ${scene.cutNum}`}
                                            className="w-[100px] h-[56px] object-cover rounded border border-gray-700/50"
                                            loading="lazy"
                                          />
                                          <div className="text-[9px] text-gray-600 text-center font-mono">{formatTimeSec(matched.timeSec)}</div>
                                        </div>
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
      )}

      {/* ═══ 편집실로 보내기 ═══ */}
      {rawResult && (
        <div className="flex justify-center">
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
    </div>
  );
};

export default VideoAnalysisRoom;
