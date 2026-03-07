/**
 * editPointService.ts
 * 편집표 AI 파싱 + 타임코드 정제 + 내보내기 생성 서비스
 */

import { EdlEntry } from '../types';
import { evolinkChat } from './evolinkService';
import { extractFramesFromVideo } from './gemini/videoAnalysis';
import { formatSrtTime } from './srtService';

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

/**
 * AI로 편집표(raw text) + 내레이션 → EdlEntry[] 구조화 파싱
 */
export async function parseEditTableWithAI(
  rawTable: string,
  narration: string
): Promise<EdlEntry[]> {
  const systemPrompt = `You are a professional video editor assistant. Parse the given edit table (EDL) and narration text into structured JSON.

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

  const userContent = `## 편집표 (Edit Table):
${rawTable}

${narration ? `## 내레이션 대본:
${narration}` : ''}`;

  const response = await evolinkChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    {
      temperature: 0.1,
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    }
  );

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  const rawEntries = parsed.entries || [];

  return rawEntries.map((entry: Record<string, unknown>, idx: number) => ({
    id: `edl-${Date.now()}-${idx}`,
    order: String(entry.order || `${idx + 1}`),
    narrationText: String(entry.narrationText || ''),
    sourceId: String(entry.sourceId || 'S-01'),
    sourceDescription: String(entry.sourceDescription || ''),
    speedFactor: Number(entry.speedFactor) || 1.0,
    timecodeStart: parseTimecodeToSeconds(String(entry.timecodeStart || '0')),
    timecodeEnd: parseTimecodeToSeconds(String(entry.timecodeEnd || '0')),
    note: String(entry.note || ''),
  }));
}

/**
 * Vision AI로 타임코드 정제
 * 타임코드 전후 프레임 추출 → Gemini Vision 비교 → 보정
 */
export async function refineTimecodeWithVision(
  entry: EdlEntry,
  videoFile: File
): Promise<{ refinedStart: number; refinedEnd: number; confidence: number; referenceFrameUrl?: string }> {
  // 타임코드 전후 ±1초 범위에서 0.2초 간격으로 프레임 추출
  const startCenter = entry.timecodeStart;
  const endCenter = entry.timecodeEnd;

  const startTimestamps: number[] = [];
  for (let t = Math.max(0, startCenter - 1); t <= startCenter + 1; t += 0.2) {
    startTimestamps.push(Math.round(t * 100) / 100);
  }

  const endTimestamps: number[] = [];
  for (let t = Math.max(0, endCenter - 1); t <= endCenter + 1; t += 0.2) {
    endTimestamps.push(Math.round(t * 100) / 100);
  }

  const allTimestamps = [...new Set([...startTimestamps, ...endTimestamps])].sort((a, b) => a - b);

  const frames = await extractFramesFromVideo(videoFile, allTimestamps);
  if (frames.size === 0) {
    return { refinedStart: startCenter, refinedEnd: endCenter, confidence: 0 };
  }

  // Vision AI에 프레임 전송하여 최적 컷 포인트 찾기
  const frameParts = Array.from(frames.entries())
    .slice(0, 10) // 최대 10프레임
    .map(([ts, dataUrl]) => ({
      timestamp: ts,
      dataUrl,
    }));

  const imageContent = frameParts.map((f, i) => [
    { type: 'text' as const, text: `Frame ${i + 1} at ${secondsToTimecode(f.timestamp)}:` },
    { type: 'image_url' as const, image_url: { url: f.dataUrl } },
  ]).flat();

  const response = await evolinkChat(
    [
      {
        role: 'system',
        content: `You are a video editing expert. Analyze the frames and find the best cut points.

The editor wants to cut a clip described as: "${entry.sourceDescription}"
Original timecodes: start=${secondsToTimecode(entry.timecodeStart)}, end=${secondsToTimecode(entry.timecodeEnd)}

Look at the frames and determine:
1. The best start frame (where the described content begins)
2. The best end frame (where the described content ends)
3. Your confidence level (0.0-1.0)

Return JSON: { "refinedStart": "MM:SS.sss", "refinedEnd": "MM:SS.sss", "confidence": 0.85, "bestFrameIndex": 0 }`,
      },
      {
        role: 'user',
        content: imageContent,
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 256,
      responseFormat: { type: 'json_object' },
    }
  );

  const result = JSON.parse(response.choices[0]?.message?.content || '{}');
  const bestIdx = Number(result.bestFrameIndex) || 0;

  return {
    refinedStart: parseTimecodeToSeconds(String(result.refinedStart || secondsToTimecode(startCenter))),
    refinedEnd: parseTimecodeToSeconds(String(result.refinedEnd || secondsToTimecode(endCenter))),
    confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0)),
    referenceFrameUrl: frameParts[bestIdx]?.dataUrl,
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
      lines.push(
        `ffmpeg -y -ss ${start.toFixed(3)} -i "${videoFile}" -t ${clipDuration.toFixed(3)} \\`
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

  entries.forEach((entry, i) => {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const duration = (end - start) / entry.speedFactor;

    const sourceFile = sourceMapping[entry.sourceId] || entry.sourceId;
    const recordOut = recordIn + duration;

    const toTC = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const f = Math.floor((sec % 1) * 30); // 30fps
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    };

    lines.push(
      `${String(i + 1).padStart(3, '0')}  ${sourceFile.padEnd(8)} V     C        ${toTC(start)} ${toTC(end)} ${toTC(recordIn)} ${toTC(recordOut)}`
    );
    lines.push(`* FROM CLIP NAME: ${entry.sourceDescription || sourceFile}`);
    if (entry.note) lines.push(`* COMMENT: ${entry.note}`);
    lines.push('');

    recordIn = recordOut;
  });

  return lines.join('\n');
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
