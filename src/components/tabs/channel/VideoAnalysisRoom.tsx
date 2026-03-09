import React, { useState, useRef, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage, EvolinkContentPart } from '../../../services/evolinkService';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

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
    if (!line.includes('|')) continue;
    // 헤더·구분자 행 스킵
    if (line.includes('순서') || line.includes(':---') || line.includes('모드')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;

    const cutNum = parseInt(cells[0], 10);
    if (isNaN(cutNum)) continue;

    rows.push({
      cutNum,
      mode: cells[1] || '',
      audioContent: cells[2] || '',
      duration: cells[3] || '',
      videoDirection: cells[4] || '',
      timecodeSource: cells[5] || '',
      // 호환 필드 (SRT 등에서 사용)
      timeline: '',
      sourceTimeline: cells[5] || '',
      dialogue: cells[2] || '',
      effectSub: '',
      sceneDesc: cells[4] || '',
    });
  }

  return rows;
}

/** AI 응답에서 ---VERSION N--- + ---SCENE--- / 테이블 구조 파싱 */
function parseVersions(raw: string): VersionItem[] {
  const blocks = raw.split(/---\s*VERSION\s*(\d+)\s*---/i);
  const items: VersionItem[] = [];

  for (let i = 1; i < blocks.length; i += 2) {
    const num = parseInt(blocks[i], 10);
    const content = blocks[i + 1]?.trim() || '';

    const titleMatch = content.match(/제목:\s*(.+)/);
    const conceptMatch = content.match(/컨셉:\s*([\s\S]*?)(?=---SCENE|\|[\s]*순서|\|[\s]*\d|$)/i);

    // 포맷 감지: 마크다운 테이블 vs ---SCENE--- 블록
    let scenes: SceneRow[];
    const hasTable = content.split('\n').some(l => l.includes('|') && /\|\s*\d+\s*\|/.test(l));

    if (hasTable) {
      scenes = parseTikitakaTable(content);
    } else {
      const sceneBlocks = content.split(/---SCENE\s*(\d+)---/i);
      scenes = [];
      for (let j = 1; j < sceneBlocks.length; j += 2) {
        const sNum = parseInt(sceneBlocks[j], 10);
        const sContent = sceneBlocks[j + 1]?.trim() || '';
        scenes.push({
          cutNum: sNum,
          timeline: extractField(sContent, '배치') || extractField(sContent, '타임라인') || '',
          sourceTimeline: extractField(sContent, '원본') || '',
          dialogue: extractField(sContent, '대사') || extractField(sContent, '나레이션') || '',
          effectSub: extractField(sContent, '효과') || '',
          sceneDesc: extractField(sContent, '장면') || extractField(sContent, '화면') || '',
          mode: '', audioContent: '', duration: '', videoDirection: '', timecodeSource: '',
        });
      }
    }

    items.push({
      id: num,
      title: titleMatch?.[1]?.trim() || `버전 ${num}`,
      concept: conceptMatch?.[1]?.trim().replace(/\n---SCENE[\s\S]*/i, '').replace(/\n\|[\s\S]*/i, '').trim() || '',
      scenes,
    });
  }

  if (items.length >= 3) return items;

  // 폴백: 번호 리스트 파싱
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

/** 업로드 영상에서 프레임 추출 */
async function extractVideoFrames(file: File, count: number): Promise<string[]> {
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
      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        video.currentTime = (dur / (count + 1)) * (i + 1);
        await new Promise<void>(r => { video.onseeked = () => r(); });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
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

## 핵심 목표
1. **Hooking & Non-linear:** 가장 바이럴한 펀치라인/클라이맥스를 0~3초에 선배치. 원본 타임라인을 완전히 뒤섞어라.
2. **Pacing:** 롱테이크 삭제, 2~3초 단위 속도감 편집.
3. **Coverage:** 모든 소재 최소 1회 등장.
4. **Witty (이원화 자막):** 효과 자막(중앙 큼직한 연출) + 하단 자막(16자 이내 위트).

## 어조
유쾌함, 긍정적, 트렌디함. 비속어 금지. 단호하고 명확하게 지시.`;

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
    return `다음 영상을 프레임 단위로 분석하여 10가지 서로 다른 크로스 더빙 리메이크 버전을 제안해주세요.

${inputDesc}

반드시 아래 구분자 형식으로 10개 버전을 출력하세요. 각 버전은 [마스터 편집 테이블] 형식으로 작성합니다:

---VERSION 1---
제목: [클릭 유도 제목]
컨셉: [이 버전의 차별화된 크로스 더빙 전략 2~3줄]

| 순서 | 모드 | 오디오 내용 (대사/내레이션/현장음) | 예상 시간 | 비디오 화면 지시 (정배속 멀티 컷/액션 싱크) | 타임코드 소스 (MM:SS.ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [N] | (내레이션) "..." | 4.0초 | (1) [컷1] ... (2.0초) / (2) [컷2] ... (2.0초) | 00:11.200 / 00:53.000 |
| 2 | [S] | (원본대사) "..." | 2.0초 | (1) [립싱크] ... | 00:55.120 |
| 3 | [A] | (현장음) (소리 묘사) | 1.5초 | (1) [액션] ... | 01:02.050 |

---VERSION 2---
제목: ...
컨셉: ...
| 순서 | 모드 | ... | ... | ... | ... |
...

(총 10개 버전, 각각 5~10개 행의 마스터 편집 테이블, 총 60초 내외 설계)

[필수 규칙]
- 모드는 반드시 [N](내레이션), [S](현장음-대사), [A](현장음-액션) 중 하나
- 타임코드는 MM:SS.ms 형식 엄수 (데이터 무결성 절대 원칙)
- 예상 시간은 초 단위로 명시 (예: 4.0초)
- 내레이션은 한국어 평균 4글자/초로 계산하여 예상 시간 산정
- HTML 태그(<br> 등) 사용 금지, (1), (2)와 / 기호로 컷 구분
- 슬로우 모션 금지 — 정배속 멀티 컷 분할 전략 사용`;
  }

  // 스낵형
  return `다음 영상을 프레임 단위로 분석하여 10가지 서로 다른 리메이크 버전을 제안해주세요.

${inputDesc}

반드시 아래 구분자 형식으로 10개 버전을 출력하세요. 각 버전은 5~10개의 장면(SCENE)을 포함해야 합니다:

---VERSION 1---
제목: [클릭 유도 제목]
컨셉: [이 버전의 차별화된 편집 방향 2~3줄]

---SCENE 1---
배치: [00:00 ~ 00:03]
원본: [원본 영상의 MM:SS ~ MM:SS]
대사: [이 구간의 나레이션/대사 텍스트]
효과자막: [화면 중앙에 표시할 큰 효과 자막]
장면: [화면에 보이는 구체적 행동/시각적 묘사]

---SCENE 2---
배치: [00:03 ~ 00:06]
원본: [MM:SS ~ MM:SS]
대사: [나레이션/대사]
효과자막: [효과 자막]
장면: [장면 설명]

(장면 반복...)

---VERSION 2---
제목: ...
컨셉: ...
---SCENE 1---
...

(총 10개 버전, 각각 서로 다른 톤/후킹/편집 방향, 5~10개 장면씩)`;
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
  const [thumbnails, setThumbnails] = useState<string[]>([]);
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

    const inputDesc = inputMode === 'youtube'
      ? `YouTube 영상 URL: ${youtubeUrl.trim()}`
      : `업로드된 영상 파일: ${uploadedFile?.name} (${((uploadedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)`;

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM : SNACK_SCRIPT_SYSTEM;

    try {
      // 1단계: 프레임/썸네일 추출 (AI에 시각 정보 전달용)
      let frames: string[] = [];
      if (uploadedFile) {
        frames = await extractVideoFrames(uploadedFile, 10);
      } else {
        const vid = extractYouTubeVideoId(youtubeUrl);
        if (vid) frames = [0, 1, 2, 3].map(i => `https://img.youtube.com/vi/${vid}/${i}.jpg`);
      }
      setThumbnails(frames);

      // 2단계: 멀티모달 메시지 빌드 — Gemini에 프레임 이미지 전달
      const textContent = buildUserMessage(inputDesc, preset);
      let userContent: string | EvolinkContentPart[];
      if (frames.length > 0) {
        const parts: EvolinkContentPart[] = [
          { type: 'text', text: textContent },
          ...frames.slice(0, 8).map(f => ({ type: 'image_url' as const, image_url: { url: f } })),
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
      const response = await evolinkChat(messages, { temperature: 0.7, maxTokens: 16000 });

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
  const ESTIMATED_TOTAL_SEC = 45; // 예상 총 소요시간 (초)
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
                          <button
                            type="button"
                            onClick={() => handleDownloadSrt(v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                            SRT 다운로드
                          </button>
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
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">대사/나레이션</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">효과 자막</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold">장면 설명</th>
                                    <th className="py-2 px-2 text-left text-gray-500 font-bold w-[90px]">편집점</th>
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
                                          : scene.mode.includes('S') ? 'bg-red-500/20 text-red-300 border border-red-500/30'
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
                                      <td className="py-2 px-2 align-top text-gray-300 leading-relaxed">{scene.dialogue || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        {scene.effectSub ? (
                                          <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-xs font-bold">{scene.effectSub}</span>
                                        ) : '-'}
                                      </td>
                                      <td className="py-2 px-2 align-top text-gray-400 leading-relaxed">{scene.sceneDesc || '-'}</td>
                                      <td className="py-2 px-2 align-top">
                                        <div className="space-y-0.5">
                                          {scene.timeline && <div className="text-blue-400 font-mono text-[10px]">{scene.timeline}</div>}
                                          {scene.sourceTimeline && <div className="text-gray-500 font-mono text-[10px]">원본: {scene.sourceTimeline}</div>}
                                        </div>
                                      </td>
                                    </>
                                  )}
                                  {thumbnails.length > 0 && (
                                    <td className="py-2 px-2 align-top">
                                      {thumbnails[si % thumbnails.length] && (
                                        <img
                                          src={thumbnails[si % thumbnails.length]}
                                          alt={`Scene ${scene.cutNum}`}
                                          className="w-[100px] h-[56px] object-cover rounded border border-gray-700/50"
                                          loading="lazy"
                                        />
                                      )}
                                    </td>
                                  )}
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
