/**
 * editPointService.ts
 * 편집표 AI 파싱 + 타임코드 정제 + 내보내기 생성 서비스
 */

import { EdlEntry, SourceVideoFile } from '../types';
import { evolinkChat, type EvolinkChatMessage, type EvolinkContentPart } from './evolinkService';
import { extractFramesFromVideo } from './gemini/videoAnalysis';
import { formatSrtTime } from './srtService';
import { logger } from './LoggerService';

/**
 * [FIX #302] 편집표 파싱용 모델 — Flash Lite는 JSON 구조화 추출에 충분하며 Pro 대비 3~5배 빠름
 * Pro는 Vision 정제(attemptVisionRefine)에서만 사용
 */
const EDIT_PARSE_MODEL = 'gemini-3.1-flash-lite-preview';
const EDIT_POINT_AUTOGEN_MODEL = 'gemini-3.1-pro-preview';
const MAX_AUTOGEN_PREVIEW_SOURCES = 4;

const EDIT_POINT_MATCHING_SYSTEM_PROMPT = `당신은 "일반 편집점/편집실 매칭" 전용 시니어 편집감독이다.
목표: 내레이션과 실제 소스 프리뷰를 바탕으로 편집실에서 바로 사용할 수 있는 편집표를 만든다.

핵심 규칙:
1. 첫 행(1-1(a))은 무조건 가장 강한 킬 샷으로 시작한다. 논리 순서보다 후킹 강도가 우선이다.
2. 모든 행은 [소스 ID] + [정확한 타임코드 MM:SS.sss] + [실제 장면 설명] 삼위일체를 지켜야 한다.
3. 내레이션 한 문장이 2.5초를 넘으면 반드시 2컷 이상으로 쪼개고, 순번을 1-1(a), 1-1(b)처럼 나눈다.
4. 타임코드는 반드시 MM:SS.sss 형식으로 적는다. "대략", "근처" 같은 표현은 금지한다.
5. 대표 프레임에 붙은 [S-XX @ MM:SS.sss] 라벨은 신뢰 가능한 앵커 좌표다. 가능하면 그 근처에서만 컷을 설계한다.
6. 소스 설명에는 실제 프리뷰에서 보이는 장면만 적고, 보이지 않는 장면이나 기능을 상상해서 쓰지 않는다.
7. 행의 sourceId 또는 timecode를 확인할 수 없으면 그 행은 만들지 않는다. 단, 프리뷰가 없는 소스만 써야 할 경우 note에 "시각 검증 필요"를 남긴다.
8. 배속은 정배속(1.0) 우선으로 설계하고, 정말 필요할 때만 조정한다.
9. 총 편집 구성은 사용 가능한 소스 길이를 넘기지 말고, 첫 3초 안에 가장 강한 후킹이 오도록 순서를 짠다.

출력 규칙:
- 파이프(|) 구분 편집표만 출력한다.
- 헤더는 정확히 아래 형식을 사용한다.
순번 | 내레이션 | 소스 | 소스설명 | 배속 | 타임코드 시작~끝 | 비고
- 타임코드 형식 예시: 00:12.300~00:14.100
- 소스 ID는 제공된 값만 사용한다. (예: S-01)
- 비고에는 "킬 샷", "정배속", "시각 검증 필요" 같은 편집 메모만 짧게 적는다.`;

/**
 * 잘린 JSON 응답에서 유효한 entries를 복구
 * AI 응답이 max_tokens로 잘렸을 때, 마지막 완전한 entry까지 추출
 */
function recoverTruncatedJson(content: string): { entries: Record<string, unknown>[] } {
  // 1. 정상 파싱 시도
  try {
    const parsed = JSON.parse(content);
    if (parsed.entries) return parsed;
  } catch (e) { logger.trackSwallowedError('EditPointService:recoverTruncatedJson/parse', e); }

  // 2. 마지막 완전한 } 를 찾아서 배열 닫기 시도
  const entries: Record<string, unknown>[] = [];
  const entryPattern = /\{[^{}]*"order"\s*:\s*"[^"]*"[^{}]*\}/g;
  let match;
  while ((match = entryPattern.exec(content)) !== null) {
    try {
      const entry = JSON.parse(match[0]);
      entries.push(entry);
    } catch (e) { logger.trackSwallowedError('EditPointService:recoverTruncatedJson/entry', e); }
  }

  return { entries };
}

/**
 * 타임코드 문자열 → 초 단위 변환
 * 지원 포맷: "00:07.500", "1:23.4", "00:01:05.420", "7.5"
 */
export function parseTimecodeToSeconds(tc: string): number {
  if (!tc || tc.trim() === '') return 0;
  const clean = tc.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(clean) || 0;
}

/**
 * 초 → 타임코드 문자열 ("MM:SS.sss")
 */
function secondsToTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** 편집표 파싱 시스템 프롬프트 (공통) */
const EDIT_PARSE_SYSTEM_PROMPT = `You are a professional video editor assistant. Parse the given edit table (EDL) and narration text into structured JSON.

The edit table may be in various formats: pipe-delimited, tab-delimited, markdown table, or free-form text.
Each row typically contains: order/sequence, narration text, source ID (like S-01, S-03), source description, speed factor, timecode range, and notes.

Return a JSON object with this exact structure:
{
  "entries": [
    {
      "order": "1-1a",
      "narrationText": "내레이션 텍스트",
      "sourceId": "S-01",
      "sourceDescription": "소스 설명",
      "speedFactor": 1.0,
      "timecodeStart": "00:07.500",
      "timecodeEnd": "00:15.200",
      "note": "비고"
    }
  ]
}

Rules:
- If speed is not specified, default to 1.0
- If timecode is missing, set to "00:00.000"
- sourceId should be normalized to format "S-XX" (e.g., "S-01", "S-02")
- Extract all rows, preserving original order
- If narration text references are found, match them to the narration provided`;

/** raw entry → EdlEntry 변환 */
function rawEntryToEdl(entry: Record<string, unknown>, idx: number, maxDuration?: number): EdlEntry {
  let start = parseTimecodeToSeconds(String(entry.timecodeStart || '0'));
  let end = parseTimecodeToSeconds(String(entry.timecodeEnd || '0'));
  // [FIX #135] 영상 길이 초과 타임코드 클램핑 — AI 할루시네이션 방지
  if (maxDuration && maxDuration > 0) {
    start = Math.max(0, Math.min(start, maxDuration));
    end = Math.max(0, Math.min(end, maxDuration));
  }
  return {
    id: `edl-${Date.now()}-${idx}`,
    order: String(entry.order || `${idx + 1}`),
    narrationText: String(entry.narrationText || ''),
    sourceId: String(entry.sourceId || 'S-01'),
    sourceDescription: String(entry.sourceDescription || ''),
    speedFactor: Number(entry.speedFactor) || 1.0,
    timecodeStart: start,
    timecodeEnd: end,
    note: String(entry.note || ''),
  };
}

/**
 * 편집표를 줄 단위로 분할 (표 헤더/구분선 감지)
 * 반환: 의미 있는 데이터 행들의 배열
 */
function splitEditTableLines(rawTable: string): string[] {
  return rawTable.split('\n').filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // 순수 구분선 제외 (----, ====, |---|---|, | :--- | :--- |)
    if (/^[-=|+:\s]+$/.test(trimmed)) return false;
    return true;
  });
}

/**
 * 편집표 텍스트의 대략적 토큰 수 추정 (한국어 혼합)
 */
function estimateTokenCount(text: string): number {
  // 한국어: ~1.5 토큰/글자, 영어: ~0.25 토큰/단어(~4글자)
  const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars * 1.5 + otherChars / 3);
}

function buildAutogenPreviewTimestamps(durationSec: number | null): number[] {
  if (!durationSec || durationSec <= 0) return [];

  const ratios = durationSec <= 12
    ? [0.1, 0.32, 0.56, 0.82]
    : durationSec <= 60
    ? [0.08, 0.28, 0.52, 0.8]
    : [0.05, 0.2, 0.45, 0.72];

  const maxSec = Math.max(durationSec - 0.1, 0.1);
  return [...new Set(
    ratios.map((ratio) => Math.min(maxSec, Math.max(0.1, Number((durationSec * ratio).toFixed(3)))))
  )];
}

async function buildSourcePreviewParts(
  sources: Pick<SourceVideoFile, 'sourceId' | 'fileName' | 'durationSec' | 'file'>[],
): Promise<EvolinkContentPart[]> {
  const parts: EvolinkContentPart[] = [];

  for (const source of sources.slice(0, MAX_AUTOGEN_PREVIEW_SOURCES)) {
    const timestamps = buildAutogenPreviewTimestamps(source.durationSec);
    if (!source.file || timestamps.length === 0) continue;

    parts.push({
      type: 'text',
      text: `## 소스 프리뷰 ${source.sourceId}\n파일: ${source.fileName}\n길이: ${source.durationSec ? secondsToTimecode(source.durationSec) : '미확인'}`,
    });

    try {
      const frames = await extractFramesFromVideo(source.file, timestamps);
      for (const timestamp of timestamps) {
        const frameUrl = frames.get(timestamp);
        if (!frameUrl) continue;
        const compressed = await compressImage(frameUrl, 256, 144, 0.45);
        parts.push({ type: 'text', text: `[${source.sourceId} @ ${secondsToTimecode(timestamp)}] 대표 프레임` });
        parts.push({ type: 'image_url', image_url: { url: compressed } });
      }
    } catch (e) {
      logger.trackSwallowedError('EditPointService:buildSourcePreviewParts', e);
    }
  }

  return parts;
}

/**
 * 단일 청크에 대해 AI 파싱 실행 + 재시도
 * [FIX #215] 429/499/네트워크 에러 시 지수 백오프 재시도 (최대 2회)
 */
async function parseEditChunkWithRetry(
  tableChunk: string,
  narration: string,
  isChunked: boolean,
  maxRetries: number = 2,
): Promise<Record<string, unknown>[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await parseEditChunk(tableChunk, narration, isChunked);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();

      // [FIX #298] 재시도 가능한 에러 판별 — 타임아웃도 재시도 대상 추가
      const isRetryable = msg.includes('429') || msg.includes('499') || msg.includes('rate') ||
        msg.includes('network') || msg.includes('fetch') || msg.includes('요청 제한') ||
        msg.includes('timeout') || msg.includes('타임아웃') || msg.includes('시간 초과');

      if (!isRetryable || attempt === maxRetries) throw lastError;

      const delay = 8000 * Math.pow(2, attempt); // 8s, 16s
      console.warn(`[EditPoint] 청크 파싱 재시도 (${attempt + 1}/${maxRetries}), ${delay / 1000}초 대기...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError!;
}

/** 단일 청크에 대해 AI 파싱 실행 */
async function parseEditChunk(
  tableChunk: string,
  narration: string,
  isChunked: boolean,
): Promise<Record<string, unknown>[]> {
  const userContent = `## 편집표 (Edit Table):
${tableChunk}

${narration ? `## 내레이션 대본:
${narration}` : ''}`;

  const estimatedInput = estimateTokenCount(EDIT_PARSE_SYSTEM_PROMPT + userContent);
  // 입력이 크면 출력 여유를 더 확보 (Evolink 프록시 총 컨텍스트 제한 대응)
  const maxTokens = estimatedInput > 12000 ? 8192 : 16384;

  // [FIX #302] Flash Lite 모델 + 타임아웃 180s — 파싱 속도 3~5배 향상
  const response = await evolinkChat(
    [
      { role: 'system', content: EDIT_PARSE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    {
      temperature: 0.1,
      maxTokens,
      responseFormat: { type: 'json_object' },
      timeoutMs: 180_000,
      model: EDIT_PARSE_MODEL,
    }
  );

  const finishReason = response.choices?.[0]?.finish_reason;
  const completionTokens = response.usage?.completion_tokens || 0;
  const content = response.choices[0]?.message?.content || '{}';

  // [FIX #97] 출력 토큰이 비정상적으로 적으면 (500 미만) 프록시 제한 가능성 → JSON 모드 없이 재시도
  if (finishReason === 'length' && completionTokens < 500) {
    console.warn(`[EditPoint] 비정상 토큰 제한 감지 (completion: ${completionTokens}). JSON 모드 없이 재시도...`);
    return await parseEditChunkFallback(tableChunk, narration);
  }

  // finishReason === 'length'이지만 일부 결과가 있으면 복구 시도
  if (finishReason === 'length') {
    console.warn('[EditPoint] AI 응답이 토큰 제한으로 잘렸습니다. 복구 시도...');
    const recovered = recoverTruncatedJson(content);
    if (recovered.entries && recovered.entries.length > 0) {
      console.log(`[EditPoint] ${recovered.entries.length}개 항목 복구 성공`);
      return recovered.entries;
    }
    // 청크 모드가 아니면 청크 분할로 재시도됨 → 여기서 빈 배열 반환하지 않고 에러
    throw new Error('AI_TRUNCATED');
  }

  const parsed = JSON.parse(content);
  return parsed.entries || [];
}

/**
 * JSON 모드 없이 파싱 (폴백)
 * Evolink 프록시가 JSON 모드에서 출력을 제한하는 경우 대응
 */
async function parseEditChunkFallback(
  tableChunk: string,
  narration: string,
): Promise<Record<string, unknown>[]> {
  const compactPrompt = `Parse this edit table into JSON. Return ONLY a JSON object with "entries" array.
Each entry: { "order", "narrationText", "sourceId" (format "S-XX"), "sourceDescription", "speedFactor" (default 1.0), "timecodeStart" (format "MM:SS.sss", default "00:00.000"), "timecodeEnd", "note" }`;

  const userContent = narration
    ? `Edit Table:\n${tableChunk}\n\nNarration:\n${narration}`
    : `Edit Table:\n${tableChunk}`;

  // [FIX #302] Flash Lite 모델 + 타임아웃 180s — 폴백에서도 속도 향상
  const response = await evolinkChat(
    [
      { role: 'system', content: compactPrompt },
      { role: 'user', content: userContent },
    ],
    {
      temperature: 0.1,
      maxTokens: 16384,
      timeoutMs: 180_000,
      model: EDIT_PARSE_MODEL,
      // JSON 모드 제거 — 텍스트로 받아서 수동 파싱
    }
  );

  const content = response.choices[0]?.message?.content || '';
  const completionTokens = response.usage?.completion_tokens || 0;

  // JSON 블록 추출 (```json ... ``` 또는 { ... })
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    console.error('[EditPoint] 폴백에서도 JSON 추출 실패. completionTokens:', completionTokens);
    throw new Error('편집표 파싱에 실패했습니다. 편집표 형식을 확인해주세요.');
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return parsed.entries || [];
  } catch (e) {
    logger.trackSwallowedError('EditPointService:parseEditTableJson', e);
    // 잘린 JSON이면 복구 시도
    const recovered = recoverTruncatedJson(jsonMatch[1]);
    if (recovered.entries.length > 0) return recovered.entries;
    throw new Error('편집표 파싱에 실패했습니다. 편집표 형식을 확인해주세요.');
  }
}

/**
 * AI로 편집표(raw text) + 내레이션 → EdlEntry[] 구조화 파싱
 * [FIX #97] 대형 편집표 자동 청크 분할 + JSON 모드 폴백
 */
export async function parseEditTableWithAI(
  rawTable: string,
  narration: string,
  maxDuration?: number,
  onProgress?: (progress: number, message: string) => void,
): Promise<EdlEntry[]> {
  const totalEstTokens = estimateTokenCount(rawTable + narration + EDIT_PARSE_SYSTEM_PROMPT);

  // 입력이 충분히 작으면 단일 호출 (재시도 포함)
  if (totalEstTokens < 12000) {
    try {
      const entries = await parseEditChunkWithRetry(rawTable, narration, false);
      return entries.map((e, i) => rawEntryToEdl(e, i, maxDuration));
    } catch (err) {
      if (err instanceof Error && err.message === 'AI_TRUNCATED') {
        // 단일 호출이 잘렸으면 청크 분할로 재시도
        console.warn('[EditPoint] 단일 호출 실패, 청크 분할 재시도...');
      } else {
        throw err;
      }
    }
  }

  // [FIX #215] 대형 편집표: 순차 처리 + 개별 청크 재시도
  // 병렬 호출(CONCURRENCY=3)은 429 rate limit 연쇄 실패의 원인
  console.log(`[EditPoint] 대형 편집표 감지 (추정 ${totalEstTokens} 토큰). 순차 처리...`);
  const lines = splitEditTableLines(rawTable);

  // [FIX #215] 헤더 행 감지 — 첫 5줄 이내에서 테이블 헤더 탐색 (VideoAnalysisRoom은 "제목:", "컨셉:" 후에 헤더)
  let headerLine = '';
  const headerKeywords = ['순서', 'order', '내레이션', '소스', '타임코드', '모드'];
  const searchLimit = Math.min(lines.length, 5);
  for (let hi = 0; hi < searchLimit; hi++) {
    const candidate = lines[hi].toLowerCase();
    if (headerKeywords.some(kw => candidate.includes(kw)) && candidate.includes('|')) {
      headerLine = lines.splice(hi, 1)[0];
      break;
    }
  }

  // [FIX #302] 청크 크기 50행으로 확대 + Flash Lite 모델 → API 호출 횟수 대폭 감소 (100행: 4청크→2청크)
  const CHUNK_SIZE = 50;

  // 청크 목록 생성
  const chunks: { table: string; narration: string; index: number }[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);
    const chunkTable = headerLine
      ? [headerLine, ...chunkLines].join('\n')
      : chunkLines.join('\n');
    chunks.push({
      table: chunkTable,
      narration: i === 0 ? narration : '',
      index: chunks.length,
    });
  }

  // [FIX #302] 순차 처리 + 개별 청크 재시도 + 진행률 콜백 — 429 rate limit 방지
  const allEntries: Record<string, unknown>[] = [];
  let failedChunks = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.(
      Math.round((i / chunks.length) * 90),
      `AI 편집표 분석 중... (${i + 1}/${chunks.length} 단계)`,
    );
    try {
      const entries = await parseEditChunkWithRetry(chunk.table, chunk.narration, true);
      allEntries.push(...entries);
    } catch (err) {
      failedChunks++;
      console.error(`[EditPoint] 청크 ${i + 1}/${chunks.length} 최종 실패:`, err);
      // 이미 일부 결과가 있으면 실패 청크를 건너뛰고 계속 진행
      if (allEntries.length === 0 && i === chunks.length - 1) {
        throw err; // 결과가 하나도 없으면 전체 실패
      }
    }
  }

  if (allEntries.length === 0) {
    throw new Error('편집표 파싱에 실패했습니다. 편집표 형식을 확인해주세요.');
  }

  if (failedChunks > 0) {
    console.warn(`[EditPoint] ${chunks.length}개 청크 중 ${failedChunks}개 실패 — ${allEntries.length}개 항목 부분 복구`);
  }

  return allEntries.map((e, i) => rawEntryToEdl(e, i, maxDuration));
}

/**
 * [FIX #134] 이미지 리사이즈 + 압축 — Vision API 토큰 절감
 */
function compressImage(dataUrl: string, maxW: number, maxH: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * [FIX #134] 자연어 응답에서 JSON 추출
 * AI가 "Here is the JSON: {...}" 등 자연어를 반환할 때 대응
 */
function extractJsonFromResponse(content: string): Record<string, unknown> {
  // 1. 직접 파싱
  try { return JSON.parse(content); } catch (e) { logger.trackSwallowedError('EditPointService:extractJsonFromResponse/directParse', e); }
  // 2. ```json ... ``` 블록
  const codeBlock = content.match(/```json\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch (e) { logger.trackSwallowedError('EditPointService:extractJsonFromResponse/codeBlock', e); }
  }
  // 3. { ... } 패턴
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) { logger.trackSwallowedError('EditPointService:extractJsonFromResponse/jsonMatch', e); }
  }
  return {};
}

/**
 * [FIX #134] Vision 정제 단일 시도 — 성공 시 결과, 실패 시 null
 * finishReason 및 completionTokens 검증 포함
 */
async function attemptVisionRefine(
  frameParts: { timestamp: number; dataUrl: string }[],
  desc: string,
  startTC: string,
  endTC: string,
): Promise<Record<string, unknown> | null> {
  try {
    const imageContent = frameParts.map((f, i) => [
      { type: 'text' as const, text: `[${i === 0 ? 'START' : 'END'} ${secondsToTimecode(f.timestamp)}]` },
      { type: 'image_url' as const, image_url: { url: f.dataUrl } },
    ]).flat();

    // [FIX #214] 60초 타임아웃 — Vision 정제는 빠른 응답 기대
    const response = await evolinkChat(
      [
        {
          role: 'system',
          content: `Video cut finder. Clip: "${desc}"\nTC: ${startTC}~${endTC}\nReturn ONLY JSON: {"refinedStart":"MM:SS.sss","refinedEnd":"MM:SS.sss","confidence":0.85}`,
        },
        { role: 'user', content: imageContent },
      ],
      { temperature: 0.1, maxTokens: 1024, timeoutMs: 60_000 },
    );

    // 토큰 부족 감지 — completionTokens < 50이면 확실히 실패
    const finishReason = response.choices?.[0]?.finish_reason;
    const completionTokens = response.usage?.completion_tokens || 0;
    if (finishReason === 'length' && completionTokens < 50) {
      console.warn(`[EditPoint] Vision 토큰 부족 (completion: ${completionTokens}). 다음 단계로...`);
      return null;
    }

    const content = response.choices[0]?.message?.content || '';
    const result = extractJsonFromResponse(content);
    if (result.refinedStart || result.refinedEnd) return result;
    return null;
  } catch (err) {
    console.warn('[EditPoint] Vision 시도 실패:', err);
    return null;
  }
}

/**
 * [FIX #134] 텍스트 전용 정제 — 이미지 없이 AI에게 편집 규칙 기반 보정 요청
 * 토큰 초과 절대 불가 (텍스트만 사용)
 */
async function attemptTextOnlyRefine(
  desc: string,
  startTC: string,
  endTC: string,
): Promise<Record<string, unknown> | null> {
  try {
    // [FIX #214] 60초 타임아웃 — 텍스트 전용 정제
    const response = await evolinkChat(
      [
        {
          role: 'system',
          content: `You are a video editor. Refine timecodes based on editing best practices.
Return ONLY JSON: {"refinedStart":"MM:SS.sss","refinedEnd":"MM:SS.sss","confidence":0.5}`,
        },
        {
          role: 'user',
          content: `Clip: "${desc}"\nTC: ${startTC} ~ ${endTC}\nApply standard pre-roll/post-roll and clean cut points.`,
        },
      ],
      { temperature: 0.1, maxTokens: 512, timeoutMs: 60_000 },
    );

    const content = response.choices[0]?.message?.content || '';
    const result = extractJsonFromResponse(content);
    if (result.refinedStart || result.refinedEnd) return result;
    return null;
  } catch (e) {
    logger.trackSwallowedError('EditPointService:attemptTextOnlyRefine', e);
    return null;
  }
}

/**
 * Vision AI로 타임코드 정제
 * [FIX #134] 3단계 폴백 체인 — 어떤 환경에서도 실패 안 함
 *   1차: 2프레임 Vision (256×144 압축)
 *   2차: 1프레임 Vision (토큰 추가 절감)
 *   3차: 텍스트 전용 (이미지 없이 — 토큰 초과 원천 차단)
 *   최종: 원본 타임코드 반환 (confidence: 0)
 */
export async function refineTimecodeWithVision(
  entry: EdlEntry,
  videoFile: File
): Promise<{ refinedStart: number; refinedEnd: number; confidence: number; referenceFrameUrl?: string }> {
  const startCenter = entry.timecodeStart;
  const endCenter = entry.timecodeEnd;
  const startTC = secondsToTimecode(startCenter);
  const endTC = secondsToTimecode(endCenter);
  const desc = entry.sourceDescription || entry.narrationText;

  // 프레임 추출 + 압축
  const timestamps = [Math.max(0, startCenter), Math.max(0, endCenter)];
  const frames = await extractFramesFromVideo(videoFile, timestamps);

  const frameParts: { timestamp: number; dataUrl: string }[] = [];
  for (const [ts, dataUrl] of frames.entries()) {
    const compressed = await compressImage(dataUrl, 256, 144, 0.4);
    frameParts.push({ timestamp: ts, dataUrl: compressed });
    if (frameParts.length >= 2) break;
  }

  const toResult = (r: Record<string, unknown>) => ({
    refinedStart: parseTimecodeToSeconds(String(r.refinedStart || startTC)),
    refinedEnd: parseTimecodeToSeconds(String(r.refinedEnd || endTC)),
    confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0)),
    referenceFrameUrl: frameParts[0]?.dataUrl,
  });

  // 1차: 2프레임 Vision
  if (frameParts.length >= 2) {
    const r = await attemptVisionRefine(frameParts, desc, startTC, endTC);
    if (r) return toResult(r);
  }

  // 2차: 1프레임 Vision (토큰 50% 추가 절감)
  if (frameParts.length >= 1) {
    const r = await attemptVisionRefine(frameParts.slice(0, 1), desc, startTC, endTC);
    if (r) return toResult(r);
  }

  // 3차: 텍스트 전용 (이미지 없음 — 토큰 초과 원천 차단)
  const r = await attemptTextOnlyRefine(desc, startTC, endTC);
  if (r) return toResult(r);

  // 최종: 원본 타임코드 (절대 실패하지 않는 마지막 방어선)
  return {
    refinedStart: startCenter,
    refinedEnd: endCenter,
    confidence: 0,
    referenceFrameUrl: frameParts[0]?.dataUrl,
  };
}

/**
 * 나레이션 텍스트 → 추정 재생 시간(초)
 * 한국어: 평균 4글자/초, 영어: 평균 3단어/초(≈15글자/초), 혼합 시 글자 수 기반
 * 쉼표/마침표 등 구두점에 0.3초 추가
 */
export function estimateNarrationDuration(text: string): number {
  if (!text || !text.trim()) return 0;
  const clean = text.trim();

  // 구두점 기반 자연 휴지(pause) 추정
  const pauseCount = (clean.match(/[.。!?…,，、;；:：\n]/g) || []).length;
  const pauseSec = pauseCount * 0.3;

  // 한글 글자 수
  const koreanChars = (clean.match(/[\uAC00-\uD7AF\u3130-\u318F]/g) || []).length;
  // 영문 단어 수
  const englishWords = (clean.match(/[a-zA-Z]+/g) || []).length;
  // 숫자 (숫자 읽기: 대략 1숫자 = 0.3초)
  const digitGroups = (clean.match(/\d+/g) || []).length;

  const koreanSec = koreanChars / 4;
  const englishSec = englishWords / 3;
  const digitSec = digitGroups * 0.5;

  return Math.max(0.5, koreanSec + englishSec + digitSec + pauseSec);
}

/**
 * 나레이션 길이 vs 클립 길이 비교 → 필요한 speedFactor 자동 계산
 * - 나레이션이 더 길면 → 슬로우 (speedFactor < 1.0, 최소 0.25x)
 * - 나레이션이 더 짧거나 같으면 → 정배속 유지 (1.0)
 */
export function calcAutoSpeedFactor(
  narrationDuration: number,
  clipStart: number,
  clipEnd: number
): number {
  const clipDuration = clipEnd - clipStart;
  if (clipDuration <= 0 || narrationDuration <= 0) return 1.0;

  if (narrationDuration <= clipDuration) {
    // 클립이 충분히 길면 정배속
    return 1.0;
  }

  // 나레이션에 맞추려면 클립을 느리게 → speedFactor = clipDuration / narrationDuration
  const factor = clipDuration / narrationDuration;
  // 최소 0.25x (4배 슬로우까지만 허용)
  return Math.max(0.25, Math.round(factor * 100) / 100);
}

/**
 * EdlEntry[] → FFmpeg bash 스크립트 생성 (대용량용)
 */
export function generateFFmpegScript(
  entries: EdlEntry[],
  sourceMapping: Record<string, string>
): string {
  const lines = ['#!/bin/bash', '# Auto-generated FFmpeg edit script', 'set -e', ''];

  // 클립 추출
  entries.forEach((entry, i) => {
    const videoFile = sourceMapping[entry.sourceId] || `source_${entry.sourceId}.mp4`;
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const clipDuration = end - start;
    const clipName = `clip_${String(i + 1).padStart(3, '0')}.mp4`;
    const speed = entry.speedFactor;

    if (speed !== 1.0) {
      // 속도 변경: 원본 전체를 추출 → 속도 필터 적용
      // 최종 출력 길이 = clipDuration / speed
      const pts = (1 / speed).toFixed(4);
      const outputDur = (clipDuration / speed).toFixed(3);

      // atempo는 0.5~2.0 범위만 지원 → 체인 필터 생성
      const atempoFilters = buildAtempoChain(speed);

      lines.push(`# ${entry.order}: ${entry.narrationText.slice(0, 40)} (${speed}x → ${outputDur}s)`);
      // [FIX] -t를 -i 앞에 배치하여 입력 길이 제한으로 사용 (출력 절삭 방지)
      lines.push(
        `ffmpeg -y -ss ${start.toFixed(3)} -t ${clipDuration.toFixed(3)} -i "${videoFile}" \\`
      );
      lines.push(
        `  -filter:v "setpts=${pts}*PTS" -filter:a "${atempoFilters}" \\`
      );
      lines.push(
        `  -c:v libx264 -preset fast -c:a aac "${clipName}"`
      );
    } else {
      lines.push(`# ${entry.order}: ${entry.narrationText.slice(0, 40)}`);
      lines.push(
        `ffmpeg -y -ss ${start.toFixed(3)} -i "${videoFile}" -t ${clipDuration.toFixed(3)} -c:v libx264 -preset fast -c:a aac "${clipName}"`
      );
    }
    lines.push('');
  });

  // concat
  lines.push('# Concatenation');
  lines.push('cat > concat_list.txt << EOF');
  entries.forEach((_, i) => {
    lines.push(`file 'clip_${String(i + 1).padStart(3, '0')}.mp4'`);
  });
  lines.push('EOF');
  lines.push('');
  lines.push('ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy output_final.mp4');
  lines.push('echo "Done! Output: output_final.mp4"');

  return lines.join('\n');
}

/**
 * FFmpeg atempo 체인 생성 (0.5~2.0 범위 제한 우회)
 * 예: speed=0.25 → "atempo=0.5,atempo=0.5"
 */
function buildAtempoChain(speed: number): string {
  if (speed >= 0.5 && speed <= 2.0) return `atempo=${speed}`;

  const filters: string[] = [];
  let remaining = speed;

  if (remaining < 0.5) {
    while (remaining < 0.5) {
      filters.push('atempo=0.5');
      remaining /= 0.5;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);
  } else {
    while (remaining > 2.0) {
      filters.push('atempo=2.0');
      remaining /= 2.0;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }

  return filters.join(',');
}

/**
 * EdlEntry[] → CMX 3600 EDL 포맷 생성
 * [FIX #73] Premiere Pro 호환 형식으로 수정:
 * - 릴네임 최대 8자 (CMX 3600 표준)
 * - 트랙 표기: "V  C" → "AA/V  C" (Premiere Pro가 인식하는 형식)
 * - 행 포맷: "{edit#}  {reel}  {track}  {transition}  {srcIn} {srcOut} {recIn} {recOut}"
 * - BOM 없이 UTF-8 텍스트
 */
export function generateEdlFile(
  entries: EdlEntry[],
  sourceMapping: Record<string, string>
): string {
  const lines = [
    'TITLE: Auto-Generated EDL',
    'FCM: NON-DROP FRAME',
    '',
  ];

  let recordIn = 0;

  // 소스별 안전한 EDL 릴네임 생성 (CMX 3600 표준: 최대 8자)
  const reelNameMap: Record<string, string> = {};
  let reelCounter = 1;
  const toReelName = (sourceId: string): string => {
    if (!reelNameMap[sourceId]) {
      const raw = sourceMapping[sourceId] || sourceId;
      // 확장자 제거 후 영문/숫자만 유지, 최대 8자 (CMX 3600 표준)
      const safe = raw.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
      reelNameMap[sourceId] = safe || `CLIP${String(reelCounter).padStart(3, '0')}`;
      reelCounter++;
    }
    return reelNameMap[sourceId];
  };

  entries.forEach((entry, i) => {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const duration = (end - start) / entry.speedFactor;

    const reelName = toReelName(entry.sourceId);
    const fullName = sourceMapping[entry.sourceId] || entry.sourceId;
    const recordOut = recordIn + duration;

    // CMX 3600: 타임코드 HH:MM:SS:FF (세미콜론 = 드롭프레임, 콜론 = 논드롭)
    const toTC = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const f = Math.floor((sec % 1) * 30); // 30fps
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    };

    const editNum = String(i + 1).padStart(3, '0');
    const srcIn = toTC(start);
    const srcOut = toTC(end);
    const recIn = toTC(recordIn);
    const recOut = toTC(recordOut);

    // CMX 3600 표준 형식 (Premiere Pro 호환):
    // {edit#}  {reel(8자)}  {track}  {transition}  {speed} {srcIn} {srcOut} {recIn} {recOut}
    // 트랙: AA/V = 오디오+비디오 동시 (Premiere가 가장 잘 인식)
    lines.push(`${editNum}  ${reelName.padEnd(8)}  AA/V  C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);

    // 소스 파일 이름 + 설명 주석
    lines.push(`* FROM CLIP NAME: ${fullName}`);
    if (entry.sourceDescription) lines.push(`* SOURCE FILE: ${entry.sourceDescription}`);
    if (entry.narrationText) lines.push(`* NARRATION: ${entry.narrationText.substring(0, 80)}`);
    if (entry.speedFactor !== 1.0) lines.push(`* SPEED: ${entry.speedFactor}x`);
    if (entry.note) lines.push(`* COMMENT: ${entry.note}`);
    lines.push('');

    recordIn = recordOut;
  });

  return lines.join('\r\n');
}

/**
 * EdlEntry[] → 내레이션 SRT 생성 (누적 타이밍 기반)
 */
export function generateNarrationSrt(entries: EdlEntry[]): string {
  let cumulativeTime = 0;
  const srtLines: string[] = [];

  entries.forEach((entry, i) => {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const clipDuration = (end - start) / entry.speedFactor;

    if (entry.narrationText.trim()) {
      srtLines.push(String(i + 1));
      srtLines.push(`${formatSrtTime(cumulativeTime)} --> ${formatSrtTime(cumulativeTime + clipDuration)}`);
      srtLines.push(entry.narrationText.trim());
      srtLines.push('');
    }

    cumulativeTime += clipDuration;
  });

  return srtLines.join('\n');
}

/**
 * [#372/#585] 일반 편집점/편집실 매칭용 편집표 자동 생성
 * 내레이션 + 소스 영상 정보(+ 대표 프레임)로 타임코드가 포함된 편집표를 만든다.
 */
export async function generateEditTableFromNarration(
  narration: string,
  sources: Pick<SourceVideoFile, 'sourceId' | 'fileName' | 'durationSec' | 'file'>[],
): Promise<string> {
  const sourceInfo = sources.map((source, index) => {
    const previewNote = index < MAX_AUTOGEN_PREVIEW_SOURCES && source.file ? ' / 대표 프레임 앵커 제공' : '';
    return `${source.sourceId}: "${source.fileName}" (${source.durationSec ? `${Math.round(source.durationSec)}초` : '길이 미확인'})${previewNote}`;
  }).join('\n');
  const previewParts = await buildSourcePreviewParts(sources);
  const userIntro = `## 작업 유형
일반 편집점/편집실 매칭

## 소스 영상 정보
${sourceInfo}

## 내레이션 대본
${narration}

지침:
- 대표 프레임에 적힌 [S-XX @ MM:SS.sss]를 실제 소스 타임코드 앵커로 사용하세요.
- 첫 행은 킬 샷이어야 합니다.
- 타임코드 또는 sourceId를 확인할 수 없는 행은 출력하지 마세요.
- 결과는 파이프(|) 구분 편집표만 출력하세요.`;
  const userMessage: EvolinkChatMessage = {
    role: 'user',
    content: previewParts.length > 0
      ? [{ type: 'text', text: userIntro }, ...previewParts]
      : userIntro,
  };

  const response = await evolinkChat(
    [
      { role: 'system', content: EDIT_POINT_MATCHING_SYSTEM_PROMPT },
      userMessage,
    ],
    {
      temperature: 0.2,
      maxTokens: 8192,
      timeoutMs: 180_000,
      model: EDIT_POINT_AUTOGEN_MODEL,
    }
  );

  const content = response.choices[0]?.message?.content || '';
  if (!content.trim()) {
    throw new Error('AI 응답이 비어있습니다.');
  }

  return content.trim();
}
