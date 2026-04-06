/**
 * nleExportService.ts
 *
 * NLE(Non-Linear Editor) 프로젝트 내보내기 서비스
 * - Premiere Pro / DaVinci Resolve: FCP XML (xmeml v5)
 * - CapCut: FCP XML + draft JSON + SRT + 영상 ZIP 패키지
 * - VREW: SRT + 영상 ZIP 패키지 (VREW는 XML import 미지원, SRT만 지원)
 */

import type {
  VideoSceneRow,
  VideoAnalysisPreset,
  EdlEntry,
  SourceVideoFile,
  ScriptLine,
  UnifiedSceneTiming,
  NarrationSyncSceneTiming,
  NleMotionInterpolation,
  NleMotionKeyframe,
  NleMotionTrack,
  RationalFps,
  VideoReference,
} from '../types';
import { secondsToFrame, frameToSeconds, isNtscFps } from './sceneDetection';
import { buildNarrationSyncedTimeline, breakDialogueLines } from './narrationSyncService';
import type { NarrationLineLike } from './narrationSyncService';
import { compileNleMotionTrack } from './nleMotionExport';
import { OVERSCALE } from './webcodecs/kenBurnsEngine';
import { evolinkChat } from './evolinkService';
import { isCompanionDetected } from './ytdlpApiService';
import { monitoredFetch } from './apiService';
import { downloadAndTrimReferenceClip } from './youtubeReferenceService';

const COMPANION_URL = 'http://127.0.0.1:9876';

/**
 * 컴패니언 앱을 통해 NLE 프로젝트를 로컬에 직접 설치
 * ZIP 다운로드 + 수동 설치 스크립트 실행 없이 원클릭 설치
 */
export async function installNleViaCompanion(params: {
  target: NleTarget;
  zipBlob: Blob;
  projectId: string;
}): Promise<{ success: boolean; installedPath: string; filesInstalled: number }> {
  const { target, zipBlob, projectId } = params;

  // [FIX #914] ZIP 언패킹이 무거우므로 먼저 컴패니언 연결 확인 (health 캐싱으로 즉시 응답)
  try {
    const ping = await monitoredFetch(`${COMPANION_URL}/health`, { signal: AbortSignal.timeout(3000) }, 3000);
    if (!ping.ok) throw new Error('not ok');
  } catch {
    throw new Error('컴패니언 앱이 실행 중이 아닙니다. 컴패니언 앱을 설치/실행한 뒤 다시 시도하세요.');
  }

  // ZIP을 풀어서 파일 목록으로 변환
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);
  const files: Array<{ path: string; data: string; isText: boolean }> = [];

  const textExtensions = ['.json', '.xml', '.srt', '.txt', '.ttml', '.settings'];

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    // 설치 스크립트는 컴패니언이 대체하므로 스킵
    if (relativePath.endsWith('.sh') || relativePath.endsWith('.ps1') || relativePath.endsWith('.bat')) continue;

    // projectId 접두사 제거 (컴패니언이 자체적으로 projectId 폴더를 생성)
    let cleanPath = relativePath;
    if (cleanPath.startsWith(projectId + '/')) {
      cleanPath = cleanPath.slice(projectId.length + 1);
    }

    const isText = textExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));

    if (isText) {
      const textContent = await zipEntry.async('string');
      files.push({
        path: cleanPath,
        data: btoa(unescape(encodeURIComponent(textContent))),
        isText: true,
      });
    } else {
      const binaryContent = await zipEntry.async('base64');
      files.push({
        path: cleanPath,
        data: binaryContent,
        isText: false,
      });
    }
  }

  // 컴패니언 API 호출
  let res: Response;
  try {
    res = await monitoredFetch(`${COMPANION_URL}/api/nle/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        projectId,
        files,
        launchApp: true,
      }),
      signal: AbortSignal.timeout(60_000),
    }, 60_000);
  } catch {
    // [FIX #914] connection refused = 컴패니언 미실행 — 명확한 에러 메시지
    throw new Error('컴패니언 앱이 실행 중이 아닙니다. 컴패니언 앱을 설치/실행한 뒤 다시 시도하세요.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: '알 수 없는 오류' }));
    throw new Error(`NLE 설치 실패: ${errData.error || res.statusText}`);
  }

  return await res.json();
}

/** 컴패니언 앱이 NLE 설치를 지원하는지 확인 */
export function isCompanionNleAvailable(): boolean {
  return isCompanionDetected();
}

interface ExportNarrationLine extends NarrationLineLike {
  sceneId?: string;
  audioUrl?: string;
  audioFileName?: string;
  endTime?: number;
}

type SubtitleTextOverrideMap = Map<string, string>;

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*(?:초|s(?:ec(?:onds?)?)?)/i);
  return m && parseFloat(m[1]) > 0 ? parseFloat(m[1]) : 3;
}

function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

function extractTaggedSourceIndex(text: string): number {
  const match = text.match(/\[(?:소스\s*|S-?)(\d+)\]/i);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? 0 : parsed - 1;
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

/**
 * 초 → FCP 타임코드 (HH:MM:SS:FF)
 * v2.0: SMPTE Drop-Frame 타임코드 지원 (29.97fps, 59.94fps)
 */
function secondsToFcpTc(s: number, fps: number): string {
  const total = Math.max(0, s);
  const roundedFps = Math.round(fps);
  const totalFrames = Math.round(total * fps);
  const isDF = Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;

  if (isDF) {
    // SMPTE Drop-Frame 공식
    const dropFrames = roundedFps === 30 ? 2 : 4; // 29.97→2, 59.94→4
    const framesPerMin = roundedFps * 60 - dropFrames;
    const framesPer10Min = framesPerMin * 10 + dropFrames;

    const d = Math.floor(totalFrames / framesPer10Min);
    const m = totalFrames % framesPer10Min;
    const adjusted = totalFrames
      + dropFrames * 9 * d
      + dropFrames * Math.max(0, Math.floor((m - dropFrames) / framesPerMin));

    const ff = adjusted % roundedFps;
    const ss = Math.floor(adjusted / roundedFps) % 60;
    const mm = Math.floor(adjusted / roundedFps / 60) % 60;
    const hh = Math.floor(adjusted / roundedFps / 3600);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
  }

  // Non-Drop Frame
  const ff = totalFrames % roundedFps;
  const ss = Math.floor(totalFrames / roundedFps) % 60;
  const mm = Math.floor(totalFrames / roundedFps / 60) % 60;
  const hh = Math.floor(totalFrames / roundedFps / 3600);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

/**
 * XML 텍스트 이스케이프 + 이모지/특수 심볼 제거
 * [FIX] 이모지(U+10000~U+10FFFF 보충 유니코드)가 FCP XML에 포함되면
 * Premiere Pro/CapCut/VREW의 XML 파서가 깨져서 미디어 링크 실패 발생.
 * BMP(U+0000~U+FFFF) 내 문자만 허용하여 모든 NLE 소프트웨어 호환성 보장.
 */
function escXml(s: string): string {
  return s
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * 파일명에서 이모지·특수문자 제거 — NLE(Premiere/CapCut/VREW) pathurl 호환성 보장.
 * 허용: 영문, 숫자, 한글(가-힣), 일본어(ぁ-ヶ), 중국어(一-龥), 하이픈, 언더스코어
 * 공백 → 언더스코어, 연속 언더스코어 → 단일, 양쪽 trim, 확장자 보장
 * [FIX] 공백을 언더스코어로 변환하여 NLE pathurl 깨짐 방지
 */
function sanitizeFileName(name: string): string {
  // 확장자 분리
  const extMatch = name.match(/\.[a-zA-Z0-9]{2,5}$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const cleaned = base
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'video';
  return cleaned + ext;
}

/**
 * 프로젝트명/ZIP 파일명 정제 — NLE 소프트웨어 호환성 보장
 * sanitizeFileName과 동일 로직이나 확장자 없이 프로젝트명 전용
 * [FIX] 공백→언더스코어, 이모지/특수문자 제거, 빈 결과 폴백
 */
export function sanitizeProjectName(name: string, maxLen = 40): string {
  return name
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen)
    || 'project';
}

/** 장면 모드 → Premiere Pro 라벨 색상 (타임라인 시각 구분) */
function modeToLabelColor(mode: string): string {
  const m = (mode || '').toUpperCase().replace(/[\[\]]/g, '').trim();
  if (m.includes('S-내레이션') || m.includes('S-나레이션') || m === 'SN') return 'Caribbean';
  if (m.includes('S')) return 'Forest';
  if (m.includes('N')) return 'Cerulean';
  if (m.includes('A')) return 'Mango';
  return 'Iris';
}

/** 실측 FPS → xmeml v5 timebase + NTSC 플래그 매핑 */
function fpsToNtsc(fps: number): { ntsc: boolean; timebase: number } {
  // 임계값 0.01 — 23.976(NTSC)과 24.000(non-NTSC)의 차이=0.024이므로 0.05는 너무 넓음
  if (Math.abs(fps - 23.976) < 0.01) return { ntsc: true, timebase: 24 };
  if (Math.abs(fps - 29.97) < 0.01) return { ntsc: true, timebase: 30 };
  if (Math.abs(fps - 59.94) < 0.01) return { ntsc: true, timebase: 60 };
  return { ntsc: false, timebase: Math.round(fps) };
}

function hasLandscapeAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width >= height;
}

function getSubtitleOrigin(width: number, height: number): { main: string; effect: string } {
  // 9:16(숏폼): 상하좌우 정중앙 배치
  if (!hasLandscapeAspect(width, height)) {
    return { main: '0 0', effect: '0 -0.2' };
  }
  // 16:9(롱폼): 표준 lower-third
  return { main: '0 -0.35', effect: '0 -0.17' };
}

/** 숏폼 자막 줄바꿈 */
function breakLines(text: string, maxChars: number = 14): string {
  if (text.length <= maxChars) return text;
  const mid = Math.ceil(text.length / 2);
  const spaceAfter = text.indexOf(' ', mid);
  const spaceBefore = text.lastIndexOf(' ', mid);
  const breakAt = spaceAfter !== -1 && spaceAfter - mid < 8 ? spaceAfter
    : spaceBefore > 0 ? spaceBefore : mid;
  return text.slice(0, breakAt).trim() + '\n' + text.slice(breakAt).trim();
}

function normalizePlainSubtitleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface PremiereCaptionEntry {
  startTime: number;
  endTime: number;
  text: string;
}

const PREMIERE_NON_DIALOGUE_SUBTITLE_PREFIX_RE = /^\s*(?:[\[(（【]\s*(?:나레이션|내레이션|narration|n|bgm|sfx|fx|현장음|효과음|effect|sound)\s*[\])）】]\s*|(?:나레이션|내레이션|narration|bgm|sfx|fx|현장음|효과음|effect|sound)\s*[:：-]\s*)/i;
const PREMIERE_DIALOGUE_SPEAKER_TAG_PREFIX_RE = /^\s*(?:[\[(（【]\s*[a-z]\s*[\])）】]\s*)+/i;

function splitSubtitleTextLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => normalizePlainSubtitleText(line))
    .filter(Boolean);
}

function distributeCaptionTextLines(
  lines: string[],
  startTime: number,
  endTime: number,
): PremiereCaptionEntry[] {
  const normalizedLines = lines
    .map(line => normalizePlainSubtitleText(line))
    .filter(Boolean);

  if (normalizedLines.length === 0) return [];
  if (normalizedLines.length === 1) {
    return [{ startTime, endTime, text: normalizedLines[0] }];
  }

  const totalDuration = Math.max(0, endTime - startTime);
  return normalizedLines.map((line, index) => ({
    text: line,
    startTime: startTime + (totalDuration * index) / normalizedLines.length,
    endTime: index === normalizedLines.length - 1
      ? endTime
      : startTime + (totalDuration * (index + 1)) / normalizedLines.length,
  }));
}

/**
 * 기본(dialogue) 자막 전용 텍스트 정제
 * - (현장음), [나레이션], [N], [BGM] 등 비대사 라인 제거
 * - (나레이션), (내레이션) 등 잔여 마커 제거
 * - 구두점·특수문자 제거
 * - 순수한 자막 텍스트만 남김
 */
function cleanDialogueSubtitleText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => normalizePlainSubtitleText(line))
    .filter(line => line && !PREMIERE_NON_DIALOGUE_SUBTITLE_PREFIX_RE.test(line))
    .map(line => line
      .replace(PREMIERE_DIALOGUE_SPEAKER_TAG_PREFIX_RE, '')
      .replace(/\([^)]*[나내]레이션[^)]*\)/gi, '')
      .replace(/\(narration\)/gi, '')
      .replace(/[.,!?;:…·ㆍ，。！？、~～""''「」『』\u2026]/g, '')
      .trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeBrokenSubtitleText(text: string, maxChars = 12): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => normalizePlainSubtitleText(line))
    .filter(Boolean);

  if (lines.length === 0) return '';

  const rebuilt = lines.flatMap((line) => {
    if (line.length <= maxChars + 2) return [line];
    return breakDialogueLines(line, maxChars)
      .split('\n')
      .map(chunk => chunk.trim())
      .filter(Boolean);
  }).join('\n');

  if (rebuilt.length > maxChars && !rebuilt.includes('\n')) {
    return breakDialogueLines(rebuilt, maxChars);
  }
  return rebuilt;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAiLineBreakItems(value: unknown): Array<{ id: string; text: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isObjectRecord(item)) return [];
      const id = typeof item.id === 'string' ? item.id : '';
      const text = typeof item.text === 'string' ? item.text : '';
      return id && text ? [{ id, text }] : [];
    });
  }

  if (!isObjectRecord(value)) return [];

  const candidateKeys = ['results', 'items', 'data', 'subtitles'];
  for (const key of candidateKeys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return parseAiLineBreakItems(candidate);
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) return parseAiLineBreakItems(candidate);
  }

  return [];
}

function getDialogueSubtitleText(
  segment: { lineId: string; text: string },
  overrideMap?: SubtitleTextOverrideMap,
  maxChars = 12,
): string {
  const override = overrideMap?.get(segment.lineId);
  if (override) {
    const cleaned = cleanDialogueSubtitleText(override);
    const normalized = normalizeBrokenSubtitleText(cleaned, maxChars);
    if (normalized) return normalized;
  }
  const cleaned = cleanDialogueSubtitleText(segment.text);
  if (!cleaned) return '';
  return breakDialogueLines(cleaned, maxChars);
}

function getDialogueCaptionText(
  segment: { lineId: string; text: string },
  overrideMap?: SubtitleTextOverrideMap,
): string {
  const override = overrideMap?.get(segment.lineId);
  if (override) {
    const cleaned = cleanDialogueSubtitleText(override);
    if (cleaned) return cleaned;
  }
  return cleanDialogueSubtitleText(segment.text);
}

function buildDialogueCaptionEntries(
  segment: { lineId: string; text: string; startTime: number; endTime: number },
  overrideMap?: SubtitleTextOverrideMap,
): PremiereCaptionEntry[] {
  // 각 대사 라인은 개별 세그먼트로 이미 분리됨 → 하나의 캡션 블록으로 유지
  const displayText = getDialogueCaptionText(segment, overrideMap);
  if (!displayText.trim()) return [];
  return [{ startTime: segment.startTime, endTime: segment.endTime, text: displayText }];
}

function wrapEffectSubtitleText(text: string): string {
  const normalized = normalizePlainSubtitleText(text)
    .replace(/^[\(\[（【]\s*/, '')
    .replace(/\s*[\)\]）】]$/, '');
  if (!normalized) return '';
  return `(${normalized})`;
}

function buildEffectCaptionEntries(
  segment: { text: string; startTime: number; endTime: number },
): PremiereCaptionEntry[] {
  // 효과자막은 하나의 세그먼트 = 하나의 캡션 블록 (분할하지 않음)
  const wrapped = wrapEffectSubtitleText(breakLines(segment.text));
  if (!wrapped) return [];
  return [{ startTime: segment.startTime, endTime: segment.endTime, text: wrapped }];
}

async function buildDialogueSubtitleOverrides(params: {
  scenes: VideoSceneRow[];
  preset?: VideoAnalysisPreset;
  narrationLines?: ExportNarrationLine[];
  maxChars?: number;
}): Promise<SubtitleTextOverrideMap> {
  const { scenes, preset, narrationLines = [], maxChars = 12 } = params;
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const payload = syncTimeline.scenes
    .flatMap(sceneTiming => sceneTiming.subtitleSegments)
    .filter(segment => segment.text.trim())
    .map(segment => ({
      id: segment.lineId,
      text: cleanDialogueSubtitleText(segment.text),
    }))
    .filter(item => item.text.length > 0);

  const fallbackMap: SubtitleTextOverrideMap = new Map(
    payload.map(({ id, text }) => [id, breakDialogueLines(text, maxChars)]),
  );

  if (payload.length === 0) return fallbackMap;

  try {
    const response = await evolinkChat([
      { role: 'system', content: 'You are a subtitle line-break assistant. Return ONLY valid JSON.' },
      {
        role: 'user',
        content: `다음 자막 텍스트들을 한 줄당 12자 안팎으로 자연스럽게 줄바꿈해주세요.\n맥락과 문법에 맞게 나누고, 지나치게 짧은 줄은 피해주세요.\n출력은 동일 JSON 배열 [{id, text}] 형식이며 text 안에만 \\n을 넣어주세요.\n입력: ${JSON.stringify(payload)}`,
      },
    ], {
      temperature: 0.2,
      maxTokens: Math.min(6000, Math.max(1200, payload.length * 180)),
      timeoutMs: 30000,
      responseFormat: { type: 'json_object' },
      model: 'gemini-3.1-flash-lite-preview',
      taskProfile: 'structured_large_json',
    });

    const raw = response.choices?.[0]?.message?.content || '[]';
    const parsed = parseAiLineBreakItems(JSON.parse(raw));
    for (const item of parsed) {
      if (!fallbackMap.has(item.id)) continue;
      const normalized = normalizeBrokenSubtitleText(item.text, maxChars);
      if (normalized) fallbackMap.set(item.id, normalized);
    }
  } catch {
    // 네트워크/키 미설정 시 로컬 줄바꿈 폴백 유지
  }

  return fallbackMap;
}

function secondsToTtmlTime(s: number): string {
  const total = Math.max(0, s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  let sec = Math.floor(total % 60);
  let ms = Math.round((total % 1) * 1000);
  if (ms >= 1000) { ms -= 1000; sec += 1; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function getPremiereCaptionLayout(
  width: number,
  height: number,
  layer: 'dialogue' | 'effect',
): {
  extent: string;
  fontSizePt: number;
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  origin: string;
  textColor: string;
} {
  const isPortrait = !hasLandscapeAspect(width, height);
  if (layer === 'dialogue') {
    return isPortrait
      ? {
          extent: '80% 50%',
          fontSizePt: 70,
          fontStyle: 'normal',
          fontWeight: 'bold',
          origin: '10% 25%',
          textColor: '#FFFFFF',
        }
      : {
          extent: '80% 18%',
          fontSizePt: 42,
          fontStyle: 'normal',
          fontWeight: 'bold',
          origin: '10% 68%',
          textColor: '#FFFFFF',
        };
  }

  return isPortrait
    ? {
        extent: '80% 28%',
        fontSizePt: 58,
        fontStyle: 'italic',
        fontWeight: 'bold',
        origin: '10% 10%',
        textColor: '#FFF200',
      }
    : {
        extent: '80% 20%',
        fontSizePt: 54,
        fontStyle: 'italic',
        fontWeight: 'bold',
        origin: '10% 18%',
        textColor: '#FFF200',
      };
}

function generatePremiereCaptionXml(params: {
  scenes: VideoSceneRow[];
  layer: 'dialogue' | 'effect';
  preset?: VideoAnalysisPreset;
  width?: number;
  height?: number;
  narrationLines?: ExportNarrationLine[];
  dialogueLineBreaks?: SubtitleTextOverrideMap;
}): string {
  const {
    scenes,
    layer,
    preset,
    width = 1080,
    height = 1920,
    narrationLines = [],
    dialogueLineBreaks,
  } = params;

  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const entries = syncTimeline.scenes
    .flatMap((sceneTiming) => {
      const segments = layer === 'effect' ? sceneTiming.effectSubtitleSegments : sceneTiming.subtitleSegments;
      return segments
        .filter(segment => segment.text.trim())
        .flatMap(segment => (
          layer === 'dialogue'
            ? buildDialogueCaptionEntries(segment, dialogueLineBreaks)
            : buildEffectCaptionEntries(segment)
        ));
    })
    .filter(entry => entry.text.trim());

  if (entries.length === 0) return '';

  const layout = getPremiereCaptionLayout(width, height, layer);
  const regionId = layer === 'dialogue' ? 'dialogueRegion' : 'effectRegion';
  const styleId = layer === 'dialogue' ? 'dialogueStyle' : 'effectStyle';
  const paragraphStyleId = layer === 'dialogue' ? 'dialogueParagraphStyle' : 'effectParagraphStyle';
  const body = entries.map((entry, index) => `      <p xml:id="cap-${index + 1}" style="${paragraphStyleId}" begin="${secondsToTtmlTime(entry.startTime)}" end="${secondsToTtmlTime(entry.endTime)}">${escXml(entry.text).replace(/\n/g, '<br/>')}</p>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xml:lang="ko">
  <head>
    <styling>
      <style xml:id="${styleId}" tts:fontFamily="Apple SD Gothic Neo, AppleSDGothicNeo-Bold, Arial" tts:fontSize="${layout.fontSizePt}pt" tts:fontStyle="${layout.fontStyle}" tts:fontWeight="${layout.fontWeight}" tts:textAlign="center" tts:color="${layout.textColor}" />
      <style xml:id="${paragraphStyleId}" tts:textAlign="center" />
    </styling>
    <layout>
      <region xml:id="${regionId}" tts:origin="${layout.origin}" tts:extent="${layout.extent}" tts:displayAlign="center" tts:textAlign="center" />
    </layout>
  </head>
  <body region="${regionId}" style="${styleId}">
    <div>
${body}
    </div>
  </body>
</tt>`;
}

const PREMIERE_NATIVE_TEMPLATE_URL = new URL('../assets/premiere-native-template-v45.prproj', import.meta.url).href;
const PREMIERE_LEGACY_TEMPLATE_URL = new URL('../assets/premiere-native-template.prproj', import.meta.url).href;
const PREMIERE_COMPAT_PROJECT_VERSION = '43';
const PREMIERE_COMPAT_BUILD_VERSION_PREFIX = '24.0.0x0';
const PREMIERE_V45_PROJECT_ID = '1';
const PREMIERE_V45_SEQUENCE_UID = '2df87522-f24a-4f47-b6f6-7f3af6db0171';
const PREMIERE_V45_VIDEO_TRACK_GROUP_ID = '52';
const PREMIERE_V45_AUDIO_TRACK_GROUP_ID = '53';
const PREMIERE_V45_DATA_TRACK_GROUP_ID = '54';
const PREMIERE_V45_RENDER_MASTER_CLIP_UID = '0d27378e-d64a-4856-806e-c06afd04f7fb';
const PREMIERE_V45_RENDER_LOGGING_INFO_ID = '40';
const PREMIERE_V45_RENDER_AUDIO_SEQUENCE_SOURCE_ID = '45';
const PREMIERE_V45_RENDER_VIDEO_SEQUENCE_SOURCE_ID = '48';
const PREMIERE_LEGACY_SOURCE_MASTER_CLIP_UID = 'b96bdb66-4f6f-4cff-9d21-d4d144ff113b';
const PREMIERE_LEGACY_SOURCE_MEDIA_UID = 'a2a84544-e9d2-49c2-87e5-23116e78d0fb';
const PREMIERE_LEGACY_SOURCE_LOGGING_INFO_ID = '172';
const PREMIERE_LEGACY_SOURCE_MASTER_VIDEO_CLIP_ID = '174';
const PREMIERE_LEGACY_SOURCE_MASTER_AUDIO_CLIP_ID = '175';
const PREMIERE_LEGACY_SOURCE_MARKERS_ID = '223';
const PREMIERE_LEGACY_SOURCE_VIDEO_MEDIA_SOURCE_ID = '224';
const PREMIERE_LEGACY_SOURCE_AUDIO_MEDIA_SOURCE_ID = '225';
const PREMIERE_LEGACY_SOURCE_AUDIO_STREAM_ID = '329';
const PREMIERE_LEGACY_SOURCE_VIDEO_STREAM_ID = '330';
const PREMIERE_LEGACY_VIDEO_TRACK_ITEM_ID = '310';
const PREMIERE_LEGACY_VIDEO_COMPONENT_CHAIN_ID = '347';
const PREMIERE_LEGACY_VIDEO_SUB_CLIP_ID = '348';
const PREMIERE_LEGACY_TIMELINE_VIDEO_CLIP_ID = '462';
const PREMIERE_LEGACY_AUDIO_TRACK_ITEM_ID = '311';
const PREMIERE_LEGACY_AUDIO_COMPONENT_CHAIN_ID = '349';
const PREMIERE_LEGACY_AUDIO_SUB_CLIP_ID = '350';
const PREMIERE_LEGACY_AUDIO_HEAD_TRANSITION_ID = '351';
const PREMIERE_LEGACY_AUDIO_TAIL_TRANSITION_ID = '352';
const PREMIERE_LEGACY_TIMELINE_AUDIO_CLIP_ID = '463';
const PREMIERE_LEGACY_AUDIO_SECONDARY_CONTENT_1_ID = '633';
const PREMIERE_LEGACY_AUDIO_SECONDARY_CONTENT_2_ID = '634';
const PREMIERE_LEGACY_NARRATION_MASTER_CLIP_UID = 'c84729a9-5cb3-41d7-9378-9f90d0358590';
const PREMIERE_LEGACY_NARRATION_MEDIA_UID = '0914c126-2e73-4679-ba02-70f0109fc2e6';
const PREMIERE_LEGACY_NARRATION_TRACK_ITEM_ID = '395';
const PREMIERE_LEGACY_NARRATION_LOGGING_INFO_ID = '161';
const PREMIERE_LEGACY_NARRATION_MASTER_AUDIO_COMPONENT_CHAIN_ID = '162';
const PREMIERE_LEGACY_NARRATION_MASTER_LIBRARY_CLIP_ID = '163';
const PREMIERE_LEGACY_NARRATION_CHANNEL_GROUPS_ID = '164';
const PREMIERE_LEGACY_NARRATION_MEDIA_SOURCE_ID = '218';
const PREMIERE_LEGACY_NARRATION_MASTER_SECONDARY_CONTENT_ID = '219';
const PREMIERE_LEGACY_NARRATION_AUDIO_STREAM_ID = '309';
const PREMIERE_LEGACY_NARRATION_COMPONENT_CHAIN_ID = '487';
const PREMIERE_LEGACY_NARRATION_SUB_CLIP_ID = '488';
const PREMIERE_LEGACY_NARRATION_TIMELINE_CLIP_ID = '688';
const PREMIERE_LEGACY_NARRATION_TIMELINE_SECONDARY_CONTENT_ID = '899';
const PREMIERE_LEGACY_NARRATION_HEAD_TRANSITION_ID = '402';
const PREMIERE_LEGACY_NARRATION_TAIL_TRANSITION_ID = '403';
const PREMIERE_LEGACY_CAPTION_TRACK_UID = 'a8df80d2-f3b7-42ca-8098-a451d4d391b9';
const PREMIERE_LEGACY_CAPTION_TRACK_ITEM_ID = '425';
const PREMIERE_LEGACY_CAPTION_COMPONENT_CHAIN_ID = '522';
const PREMIERE_LEGACY_CAPTION_SUB_CLIP_ID = '523';
const PREMIERE_LEGACY_CAPTION_BLOCK_ID = '524';
const PREMIERE_LEGACY_CAPTION_TIMELINE_TRANSCRIPT_CLIP_ID = '814';
const PREMIERE_LEGACY_CAPTION_MASTER_CLIP_UID = '41ac2c57-95f7-4495-8fa1-0af1a7b5d737';
const PREMIERE_LEGACY_CAPTION_MEDIA_SOURCE_ID = '906';
const PREMIERE_LEGACY_CAPTION_LOGGING_INFO_ID = '907';
const PREMIERE_LEGACY_CAPTION_MASTER_LIBRARY_CLIP_ID = '908';
const PREMIERE_LEGACY_CAPTION_CHANNEL_GROUPS_ID = '909';
const PREMIERE_LEGACY_CAPTION_MEDIA_UID = '37b0ac5f-5b2e-4bc1-be47-ac48d5b890bf';
const PREMIERE_LEGACY_CAPTION_DATA_STREAM_ID = '1055';
/** DOMParser가 &#10; 엔티티를 리터럴 \n으로 디코딩하여 손실. 파싱 전 sentinel로 보존. */
const PREMIERE_NEWLINE_ENTITY_SENTINEL = '\uE000';
const PREMIERE_TICKS_PER_SECOND = 127_008_000_000;
const PREMIERE_CAPTION_CLIP_BASE_TICKS = 914_457_600_000_000;
const PREMIERE_PORTRAIT_CAPTION_TEMPLATE_STYLE_BASE64 = 'zAEAAAAAAABEMyIRDAAAAAAABgAKAAQABgAAAGQAAAAAAF4ATAAUABAAAAAAAEgARAAAAAAAAAAAAEAAPwA4AAAANAAwACwAKAAAACQAIAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAGAAMAAAAAAAAAAAAAAAAAAgAAAAAAB8ABwBeAAAAAAAAAUQAAABEAAAAhAAAAKAAAABAAAAAAAABAPk+jkIAAMhCXAAAABwEg0IAAMBAAABAQAAAyEIAAAABTAAAAAEAAAACAAAABP///+7///8EAAAAAQAAAAwAAAAAAAYACAAEAAYAAAAEAAAADQAAAEFuaW1hdGlvblR5cGUAAABO////AAAAAFb///8AAAAAAQAAAAQAAAASAAAAUGFwZXJsb2d5LTRSZWd1bGFyAAABAAAADAAAAAgADgAEAAgACAAAAIgAAAA8AAAAAAA2ACAAAAAcAAAAAAAYAAAAFAAAAAAAAAAAAAAAAAAAAAAAEwAAAAAAAAAAAAAADAAAAAgABAA2AAAAAgAAABgAAAAcAAAAAAAAAQAAAAAgAAAAAABwQuD///8EAAYABAAAAAAACgAIAAUABgAHAAoAAAAAAAAABAAEAAQAAAABAAAAYQAAAA==';
const PREMIERE_PORTRAIT_CAPTION_PREFIX_BASE64 = '6AEAAAAAAABEMyIRDAAAAAAABgAKAAQABgAAAGQAAAAAAF4ATAAUABAAAAAAAEgARAAAAAAAAAAAAEAAPwA4AAAANAAwACwAKAAAACQAIAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAGAAMAAAAAAAAAAAAAAAAAAgAAAAAAB8ABwBeAAAAAAAAAUQAAABEAAAAhAAAAKAAAABAAAAAAAABAPk+jkIAAMhCXAAAABwEg0IAAMBAAABAQAAAyEIAAAABTAAAAAEAAAACAAAABP///+7///8EAAAAAQAAAAwAAAAAAAYACAAEAAYAAAAEAAAADQAAAEFuaW1hdGlvblR5cGUAAABO////AAAAAFb///8AAAAAAQAAAAQAAAASAAAAUGFwZXJsb2d5LTRSZWd1bGFyAAABAAAADAAAAAgADgAEAAgACAAAAIgAAAA8AAAAAAA2ACAAAAAcAAAAAAAYAAAAFAAAAAAAAAAAAAAAAAAAAAAAEwAAAAAAAAAAAAAADAAAAAgABAA2AAAAAgAAABgAAAAcAAAAAAAAAQAAAAAgAAAAAABwQuD///8EAAYABAAAAAAACgAIAAUABgAHAAoAAAAAAAAABAAEAAQAAAAeAAAA';
const PREMIERE_LANDSCAPE_CAPTION_TEMPLATE_STYLE_BASE64 = '7AEAAAAAAABEMyIRDAAAAAAABgAKAAQABgAAAGQAAAAAAF4ATAAUABAAAAAAAEgARAAAAAAAAAAAAEAAPwA4AAAANAAwACwAKAAAACQAIAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAGAAMAAAAAAAAAAAAAAAAAAgAAAAAAB8ABwBeAAAAAAAAAUQAAABYAAAAnAAAALgAAABYAAAAAAABAAAAIEEAAAAAdAAAALLSTkIAAPBBBqF1QAAAyEIAAAABZAAAAAIAAAACAAAA5P7//xQADAAAAAAACAAAAAAAAAAAAAQAFAAAAA1/Gz0AAGC+AQAAAAwAAAAAAAYACAAEAAYAAAAEAAAADQAAAEFuaW1hdGlvblR5cGUAAABG////AAAAAE7///8AAAAAAQAAAAQAAAASAAAAUy1Db3JlRHJlYW0tOUJsYWNrAAABAAAADAAAAAgADgAEAAgACAAAAJAAAAA8AAAAAAA2ACgAAAAkAAAAAAAgAB8AGAAAABQAAAAAAAAAAAAAAAAAEwAAAAAAAAAAAAAADAAAAAgABAA2AAAAAgAAACAAAAAkAAAAAAAAAQAASMIAACBBAAAAASAAAAAAAIxC4P///wQABgAEAAAAAAAKAAgABQAGAAcACgAAAAAAAAAEAAQABAAAAAEAAABhAAAA';
const PREMIERE_LANDSCAPE_CAPTION_PREFIX_BASE64 = 'CAIAAAAAAABEMyIRDAAAAAAABgAKAAQABgAAAGQAAAAAAF4ATAAUABAAAAAAAEgARAAAAAAAAAAAAEAAPwA4AAAANAAwACwAKAAAACQAIAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAGAAMAAAAAAAAAAAAAAAAAAgAAAAAAB8ABwBeAAAAAAAAAUQAAABYAAAAnAAAALgAAABYAAAAAAABAAAAIEEAAAAAdAAAALLSTkIAAPBBBqF1QAAAyEIAAAABZAAAAAIAAAACAAAA5P7//xQADAAAAAAACAAAAAAAAAAAAAQAFAAAAA1/Gz0AAGC+AQAAAAwAAAAAAAYACAAEAAYAAAAEAAAADQAAAEFuaW1hdGlvblR5cGUAAABG////AAAAAE7///8AAAAAAQAAAAQAAAASAAAAUy1Db3JlRHJlYW0tOUJsYWNrAAABAAAADAAAAAgADgAEAAgACAAAAJAAAAA8AAAAAAA2ACgAAAAkAAAAAAAgAB8AGAAAABQAAAAAAAAAAAAAAAAAEwAAAAAAAAAAAAAADAAAAAgABAA2AAAAAgAAACAAAAAkAAAAAAAAAQAASMIAACBBAAAAASAAAAAAAIxC4P///wQABgAEAAAAAAAKAAgABQAGAAcACgAAAAAAAAAEAAQABAAAAB0AAAA=';

type PremiereCodecStreamConstructor = new (format: 'gzip') => TransformStream<Uint8Array, Uint8Array>;

interface PremiereImportedSubgraph {
  roots: Element[];
  objectBySourceId: Map<string, Element>;
  objectBySourceUid: Map<string, Element>;
}

const premiereTemplateXmlPromiseByUrl = new Map<string, Promise<string>>();

function getPremiereFrameDurationTicks(fps = 30): number {
  return Math.max(1, Math.round(PREMIERE_TICKS_PER_SECOND / Math.max(1, fps)));
}

function secondsToPremiereTicks(sec: number): number {
  return Math.max(0, Math.round(sec * PREMIERE_TICKS_PER_SECOND));
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function transformPremiereProjectBytes(bytes: Uint8Array, mode: 'compress' | 'decompress'): Promise<Uint8Array> {
  const streams = globalThis as typeof globalThis & {
    CompressionStream?: PremiereCodecStreamConstructor;
    DecompressionStream?: PremiereCodecStreamConstructor;
  };
  const StreamCtor = mode === 'compress' ? streams.CompressionStream : streams.DecompressionStream;
  if (!StreamCtor) {
    throw new Error('이 브라우저는 Premiere native 프로젝트 압축을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 다시 시도해주세요.');
  }
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const transformedStream = new Blob([blobBytes.buffer]).stream().pipeThrough(new StreamCtor('gzip'));
  const result = new Uint8Array(await new Response(transformedStream).arrayBuffer());
  // [FIX] Premiere는 gzip OS byte로 0x13을 사용 (비표준).
  // 브라우저 CompressionStream은 0x00/0xFF를 쓰므로, 이 값이 다르면
  // Premiere가 "The project could not be saved" 에러를 발생시킴.
  if (mode === 'compress' && result.length >= 10) {
    result[9] = 0x13;
  }
  return result;
}

async function loadPremiereTemplateXml(url: string): Promise<string> {
  if (!premiereTemplateXmlPromiseByUrl.has(url)) {
    premiereTemplateXmlPromiseByUrl.set(url, (async () => {
      const response = await monitoredFetch(url);
      if (!response.ok) {
        throw new Error(`Premiere native template을 불러오지 못했습니다 (${response.status}).`);
      }
      const gzBytes = new Uint8Array(await response.arrayBuffer());
      const xmlBytes = await transformPremiereProjectBytes(gzBytes, 'decompress');
      return new TextDecoder().decode(xmlBytes);
    })());
  }
  return premiereTemplateXmlPromiseByUrl.get(url)!;
}

async function loadPremiereNativeTemplateXml(): Promise<string> {
  return loadPremiereTemplateXml(PREMIERE_NATIVE_TEMPLATE_URL);
}

async function loadPremiereLegacyTemplateXml(): Promise<string> {
  return loadPremiereTemplateXml(PREMIERE_LEGACY_TEMPLATE_URL);
}

function parsePremiereProjectXml(templateXml: string): Document {
  if (templateXml.includes(PREMIERE_NEWLINE_ENTITY_SENTINEL)) {
    throw new Error('Premiere 템플릿에 sentinel 문자(\\uE000)가 이미 존재합니다. 템플릿을 확인해주세요.');
  }
  const preservedXml = templateXml.replace(/&#10;/g, PREMIERE_NEWLINE_ENTITY_SENTINEL);
  const doc = new DOMParser().parseFromString(preservedXml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Premiere native template XML 파싱에 실패했습니다.');
  }
  return doc;
}

function serializePremiereProjectXml(doc: Document): string {
  const serialized = new XMLSerializer().serializeToString(doc);
  const withoutDecl = serialized.replace(/^<\?xml[^?]*\?>\s*/, '');
  const restored = withoutDecl.replace(new RegExp(PREMIERE_NEWLINE_ENTITY_SENTINEL, 'g'), '&#10;');
  return `<?xml version="1.0" encoding="UTF-8" ?>\n${restored}`;
}

/**
 * .prproj 캡션 바이너리에서 폰트명을 패치 (내장 템플릿 전용)
 * "Paperlogy-4Regular" (18바이트) → "AppleSDGothicNeo" (16바이트 + 2 null = 18바이트)
 * newFont.length <= oldFont.length 조건에서만 안전 (오프셋 변경 없음)
 */
function patchCaptionBinaryFont(data: Uint8Array, oldFont: string, newFont: string): Uint8Array {
  const oldBytes = new TextEncoder().encode(oldFont);
  const newBytes = new TextEncoder().encode(newFont);
  if (newBytes.length > oldBytes.length) return data;

  let pos = -1;
  outer: for (let i = 0; i <= data.length - oldBytes.length; i++) {
    for (let j = 0; j < oldBytes.length; j++) {
      if (data[i + j] !== oldBytes[j]) continue outer;
    }
    pos = i;
    break;
  }
  if (pos === -1) return data;

  const result = new Uint8Array(data);
  result.set(newBytes, pos);
  for (let i = pos + newBytes.length; i < pos + oldBytes.length; i++) {
    result[i] = 0;
  }
  if (pos >= 4) {
    new DataView(result.buffer).setUint32(pos - 4, newBytes.length, true);
  }
  return result;
}

const PREMIERE_CAPTION_FONT_OLD_PORTRAIT = 'Paperlogy-4Regular';
const PREMIERE_CAPTION_FONT_OLD_LANDSCAPE = 'S-CoreDream-9Black';
const PREMIERE_CAPTION_FONT_NEW = 'AppleSDGothicNeo';

function getPremiereCaptionBinarySpec(width = 1080, height = 1920): {
  prefixBytes: Uint8Array;
  styleBase64: string;
  textLengthOffset: number;
  textStartOffset: number;
} {
  if (!hasLandscapeAspect(width, height)) {
    const rawPrefix = decodeBase64ToBytes(PREMIERE_PORTRAIT_CAPTION_PREFIX_BASE64);
    const patchedPrefix = patchCaptionBinaryFont(rawPrefix, PREMIERE_CAPTION_FONT_OLD_PORTRAIT, PREMIERE_CAPTION_FONT_NEW);
    const rawStyle = decodeBase64ToBytes(PREMIERE_PORTRAIT_CAPTION_TEMPLATE_STYLE_BASE64);
    const patchedStyle = patchCaptionBinaryFont(rawStyle, PREMIERE_CAPTION_FONT_OLD_PORTRAIT, PREMIERE_CAPTION_FONT_NEW);
    return {
      prefixBytes: patchedPrefix,
      styleBase64: encodeBytesToBase64(patchedStyle),
      textLengthOffset: 464,
      textStartOffset: 468,
    };
  }
  const rawPrefix = decodeBase64ToBytes(PREMIERE_LANDSCAPE_CAPTION_PREFIX_BASE64);
  const patchedPrefix = patchCaptionBinaryFont(rawPrefix, PREMIERE_CAPTION_FONT_OLD_LANDSCAPE, PREMIERE_CAPTION_FONT_NEW);
  const rawStyle = decodeBase64ToBytes(PREMIERE_LANDSCAPE_CAPTION_TEMPLATE_STYLE_BASE64);
  const patchedStyle = patchCaptionBinaryFont(rawStyle, PREMIERE_CAPTION_FONT_OLD_LANDSCAPE, PREMIERE_CAPTION_FONT_NEW);
  return {
    prefixBytes: patchedPrefix,
    styleBase64: encodeBytesToBase64(patchedStyle),
    textLengthOffset: 496,
    textStartOffset: 500,
  };
}

function buildPremiereCaptionFormattedTextDataBase64(
  text: string,
  spec: ReturnType<typeof getPremiereCaptionBinarySpec>,
): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(normalized);
  const paddedTextLength = Math.ceil((textBytes.length + 1) / 4) * 4;
  const totalLength = spec.textStartOffset + paddedTextLength;
  const payload = new Uint8Array(totalLength);
  payload.set(spec.prefixBytes);
  new DataView(payload.buffer).setUint32(0, totalLength - 12, true);
  new DataView(payload.buffer).setUint32(spec.textLengthOffset, textBytes.length, true);
  payload.set(textBytes, spec.textStartOffset);
  return encodeBytesToBase64(payload);
}

function buildPremiereBinaryHash(byteLength: number): string {
  const baseHash = premiereUuid().toLowerCase().slice(0, 28);
  const tail = Math.max(0, byteLength).toString(16).padStart(8, '0');
  return `${baseHash}${tail}`;
}

function getPremiereProjectRoot(doc: Document): Element {
  const root = doc.documentElement;
  if (!root || root.tagName !== 'PremiereData') {
    throw new Error('Premiere template XML 구조가 예상과 다릅니다.');
  }
  return root;
}

function getPremiereObjectById(doc: Document, objectId: string): Element {
  const element = doc.querySelector(`[ObjectID="${objectId}"]`);
  if (!element) {
    throw new Error(`Premiere template ObjectID ${objectId}를 찾지 못했습니다.`);
  }
  return element;
}

function getPremiereObjectByUid(doc: Document, objectUid: string): Element {
  const element = doc.querySelector(`[ObjectUID="${objectUid}"]`);
  if (!element) {
    throw new Error(`Premiere template ObjectUID ${objectUid}를 찾지 못했습니다.`);
  }
  return element;
}

function getPremiereClipProjectItemByMasterClipUid(doc: Document, masterClipUid: string): Element | null {
  return Array.from(doc.querySelectorAll('ClipProjectItem')).find((element) => (
    getPremiereDirectChild(element, 'MasterClip')?.getAttribute('ObjectURef') === masterClipUid
  )) ?? null;
}

function getPremiereDirectChild(parent: Element, tagName: string): Element | null {
  return Array.from(parent.children).find(child => child.tagName === tagName) ?? null;
}

function getPremiereClipBody(container: Element): Element {
  const directClip = getPremiereDirectChild(container, 'Clip');
  if (directClip) return directClip;
  const dataClip = getPremiereDirectChild(container, 'DataClip');
  const nestedClip = dataClip ? getPremiereDirectChild(dataClip, 'Clip') : null;
  if (nestedClip) return nestedClip;
  throw new Error(`Premiere ${container.tagName}.Clip을 찾지 못했습니다.`);
}

function ensurePremiereDirectChild(doc: Document, parent: Element, tagName: string): Element {
  const existing = getPremiereDirectChild(parent, tagName);
  if (existing) return existing;
  const child = doc.createElement(tagName);
  parent.appendChild(child);
  return child;
}

function ensurePremiereDirectChildBefore(
  doc: Document,
  parent: Element,
  tagName: string,
  beforeTagNames: string[],
): Element {
  const child = ensurePremiereDirectChild(doc, parent, tagName);
  const before = beforeTagNames
    .map((name) => getPremiereDirectChild(parent, name))
    .find((element): element is Element => !!element && element !== child);
  if (before && child !== before.previousElementSibling) {
    parent.insertBefore(child, before);
  }
  return child;
}

function setPremiereChildText(doc: Document, parent: Element, tagName: string, value: string): void {
  ensurePremiereDirectChild(doc, parent, tagName).textContent = value;
}

function toPremiereProjectRelativePath(fileName: string): string {
  // [FIX] Premiere는 FilePath에서 ./ 접두사를 절대경로로 해석함.
  // 파일명만 설정하면 Premiere가 .prproj와 같은 폴더에서 자동 매칭.
  return fileName
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .trim();
}

function setPremiereMediaFilePaths(doc: Document, media: Element, fileName: string): void {
  const cleanName = toPremiereProjectRelativePath(fileName);
  // [FIX] PM V45 분석 결과: Premiere V45는 FilePath/ActualMediaFilePath를 먼저 시도하고,
  // 경로가 존재하지 않으면 Link Media 대화상자를 표시함.
  // 가짜 절대경로(/Volumes/...)는 절대 존재할 수 없으므로 항상 Link Media 발생.
  // 해결: FilePath를 ./파일명 (상대경로)으로 설정 → Premiere가 .prproj와 같은 폴더에서 자동 매칭.
  // PM V45 재저장 분석에서도 RelativePath=./파일명 패턴 확인됨.
  const relativePath = `./${cleanName}`;
  ensurePremiereDirectChildBefore(doc, media, 'RelativePath', ['FilePath', 'ImplementationID', 'Title']).textContent = relativePath;
  setPremiereChildText(doc, media, 'FilePath', relativePath);
  setPremiereChildText(doc, media, 'ActualMediaFilePath', relativePath);
  setPremiereChildText(doc, media, 'Title', cleanName);
  setPremiereChildText(doc, media, 'FileKey', premiereUuid());
}

function bumpPremiereNumericChildText(doc: Document, parent: Element, tagName: string, fallback = 1): void {
  const current = Number(getPremiereDirectChild(parent, tagName)?.textContent || '');
  const nextValue = Number.isFinite(current) && current >= 0
    ? current + 1
    : fallback;
  setPremiereChildText(doc, parent, tagName, String(nextValue));
}

function setPremiereClipChildText(doc: Document, container: Element, tagName: string, value: string): void {
  const clip = getPremiereClipBody(container);
  setPremiereChildText(doc, clip, tagName, value);
}

function removePremiereChild(parent: Element, tagName: string): void {
  const child = getPremiereDirectChild(parent, tagName);
  if (child) parent.removeChild(child);
}

function replacePremiereTrackRefs(doc: Document, container: Element, objectIds: string[]): void {
  const existing = getPremiereDirectChild(container, 'TrackItems');
  if (existing) {
    container.removeChild(existing);
  }
  if (objectIds.length === 0) return;
  const trackItems = doc.createElement('TrackItems');
  trackItems.setAttribute('Version', '1');
  objectIds.forEach((objectId, index) => {
    const trackItem = doc.createElement('TrackItem');
    trackItem.setAttribute('Index', String(index));
    trackItem.setAttribute('ObjectRef', objectId);
    trackItems.appendChild(trackItem);
  });
  container.insertBefore(trackItems, container.firstChild);
}

const PREMIERE_TEMPLATE_SCENE_VIDEO_RE = /^scene_\d+_video\.mp4$/i;
const PREMIERE_TEMPLATE_PROJECT_VIDEO_PATH_RE = /project_videos_\d+\/scene_\d+_video\.mp4$/i;
const PREMIERE_TEMPLATE_AUDIO_PLACEHOLDER_RE = /(?:^|\/)제목없음\.mp3$/;

function getPremiereRootObjects(root: Element): Element[] {
  return Array.from(root.children);
}

function getPremiereClipProjectItemName(element: Element): string {
  const projectItem = getPremiereDirectChild(element, 'ProjectItem');
  return projectItem ? (getPremiereDirectChild(projectItem, 'Name')?.textContent || '').trim() : '';
}

function setPremiereClipProjectItemName(doc: Document, element: Element, value: string): void {
  const projectItem = ensurePremiereDirectChild(doc, element, 'ProjectItem');
  setPremiereChildText(doc, projectItem, 'Name', value);
}

function getPremiereRootObjectTextValues(element: Element): string[] {
  const values = new Set<string>();
  if (element.tagName === 'ClipProjectItem') {
    values.add(getPremiereClipProjectItemName(element));
  }
  ['Name', 'Title', 'RelativePath', 'FilePath', 'ActualMediaFilePath'].forEach((tagName) => {
    const value = getPremiereDirectChild(element, tagName)?.textContent?.trim();
    if (value) values.add(value);
  });
  return [...values];
}

function isPremiereTemplatePlaceholderValue(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) return false;
  const fileName = normalized.split('/').pop() || normalized;
  return PREMIERE_TEMPLATE_SCENE_VIDEO_RE.test(fileName)
    || PREMIERE_TEMPLATE_PROJECT_VIDEO_PATH_RE.test(normalized)
    || PREMIERE_TEMPLATE_AUDIO_PLACEHOLDER_RE.test(normalized);
}

function collectPremiereObjectRefs(element: Element): Set<string> {
  const refs = new Set<string>();
  const visit = (node: Element) => {
    const objectRef = node.getAttribute('ObjectRef');
    if (objectRef) refs.add(objectRef);
    const objectURef = node.getAttribute('ObjectURef');
    if (objectURef) refs.add(objectURef);
    Array.from(node.children).forEach((child) => visit(child));
  };
  visit(element);
  return refs;
}

function getPremiereTrackRefObjectIds(container: Element): string[] {
  const trackItems = getPremiereDirectChild(container, 'TrackItems');
  if (!trackItems) return [];
  return Array.from(trackItems.children)
    .filter((child) => child.tagName === 'TrackItem')
    .map((child) => child.getAttribute('ObjectRef') || '')
    .filter(Boolean);
}

function removePremiereBinItemRef(root: Element, objectURef: string): void {
  if (!objectURef) return;
  root.querySelectorAll(`Item[ObjectURef="${objectURef}"]`).forEach((item) => {
    item.parentElement?.removeChild(item);
  });
}

function normalizePremiereIndexedRefs(root: Element, containerTagName: string, childTagName: string): void {
  root.querySelectorAll(containerTagName).forEach((container) => {
    Array.from(container.children)
      .filter((child) => child.tagName === childTagName)
      .forEach((child, index) => {
        child.setAttribute('Index', String(index));
      });
  });
}

function normalizePremiereBinItems(root: Element): void {
  const availableUids = new Set(
    getPremiereRootObjects(root)
      .map((element) => element.getAttribute('ObjectUID') || '')
      .filter(Boolean),
  );
  root.querySelectorAll('Items').forEach((items) => {
    Array.from(items.children)
      .filter((child) => child.tagName === 'Item')
      .forEach((item) => {
        const objectURef = item.getAttribute('ObjectURef') || '';
        if (objectURef && !availableUids.has(objectURef)) {
          items.removeChild(item);
        }
      });

    Array.from(items.children)
      .filter((child) => child.tagName === 'Item')
      .forEach((item, index) => {
        item.setAttribute('Index', String(index));
      });
  });
}

function collectPremiereReferencedRootObjects(root: Element, refs: string[], blockedRefs: Iterable<string> = []): Set<Element> {
  const rootObjects = getPremiereRootObjects(root);
  const objectById = new Map<string, Element>();
  const objectByUid = new Map<string, Element>();
  const blocked = new Set(blockedRefs);
  rootObjects.forEach((element) => {
    const objectId = element.getAttribute('ObjectID');
    if (objectId) objectById.set(objectId, element);
    const objectUid = element.getAttribute('ObjectUID');
    if (objectUid) objectByUid.set(objectUid, element);
  });

  const collected = new Set<Element>();
  const queue = refs
    .filter((ref) => !blocked.has(ref))
    .map((ref) => objectById.get(ref) || objectByUid.get(ref))
    .filter((element): element is Element => !!element);
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (collected.has(current)) continue;
    collected.add(current);
    collectPremiereObjectRefs(current).forEach((ref) => {
      if (blocked.has(ref)) return;
      const target = objectById.get(ref) || objectByUid.get(ref);
      if (target && !collected.has(target)) {
        queue.push(target);
      }
    });
  }
  return collected;
}

function removePremiereDanglingRefs(
  root: Element,
  removable: Set<Element>,
  removableObjectIds: Set<string>,
  removableObjectUids: Set<string>,
): void {
  getPremiereRootObjects(root)
    .filter((element) => !removable.has(element))
    .forEach((element) => {
      Array.from(element.querySelectorAll('[ObjectRef],[ObjectURef]')).forEach((node) => {
        const objectRef = node.getAttribute('ObjectRef') || '';
        const objectURef = node.getAttribute('ObjectURef') || '';
        if (
          (objectRef && removableObjectIds.has(objectRef))
          || (objectURef && removableObjectUids.has(objectURef))
        ) {
          node.parentElement?.removeChild(node);
        }
      });
    });

  normalizePremiereBinItems(root);
  normalizePremiereIndexedRefs(root, 'Clips', 'Clip');
  normalizePremiereIndexedRefs(root, 'TrackItems', 'TrackItem');
  normalizePremiereIndexedRefs(root, 'AudioComponentChains', 'AudioComponentChain');
  normalizePremiereIndexedRefs(root, 'SecondaryContents', 'SecondaryContentItem');
}

function removePremiereRootObjects(root: Element, removable: Set<Element>): void {
  if (removable.size === 0) {
    normalizePremiereBinItems(root);
    return;
  }

  const removableObjectIds = new Set(
    Array.from(removable)
      .map((element) => element.getAttribute('ObjectID') || '')
      .filter(Boolean),
  );
  const removableObjectUids = new Set(
    Array.from(removable)
      .map((element) => element.getAttribute('ObjectUID') || '')
      .filter(Boolean),
  );

  Array.from(removable).forEach((element) => {
    removePremiereBinItemRef(root, element.getAttribute('ObjectUID') || '');
  });
  removePremiereDanglingRefs(root, removable, removableObjectIds, removableObjectUids);

  Array.from(removable).forEach((element) => {
    if (element.parentElement === root) {
      root.removeChild(element);
    }
  });
  normalizePremiereBinItems(root);
  normalizePremiereIndexedRefs(root, 'Clips', 'Clip');
  normalizePremiereIndexedRefs(root, 'TrackItems', 'TrackItem');
  normalizePremiereIndexedRefs(root, 'AudioComponentChains', 'AudioComponentChain');
  normalizePremiereIndexedRefs(root, 'SecondaryContents', 'SecondaryContentItem');
}

function cleanupPremiereTemplatePlaceholders(
  root: Element,
  sourceMasterClipUid: string,
  safeVideoName: string,
  protectedObjectRefs: string[],
): void {
  const rootObjects = getPremiereRootObjects(root);
  const objectById = new Map<string, Element>();
  const objectByUid = new Map<string, Element>();
  rootObjects.forEach((element) => {
    const objectId = element.getAttribute('ObjectID');
    if (objectId) objectById.set(objectId, element);
    const objectUid = element.getAttribute('ObjectUID');
    if (objectUid) objectByUid.set(objectUid, element);
  });

  const protectedRoots = new Set<Element>();
  const protectedQueue = protectedObjectRefs
    .map((ref) => objectById.get(ref) || objectByUid.get(ref))
    .filter((element): element is Element => !!element);
  while (protectedQueue.length > 0) {
    const current = protectedQueue.pop()!;
    if (protectedRoots.has(current)) continue;
    protectedRoots.add(current);
    collectPremiereObjectRefs(current).forEach((ref) => {
      const target = objectById.get(ref) || objectByUid.get(ref);
      if (target && !protectedRoots.has(target)) {
        protectedQueue.push(target);
      }
    });
  }

  const seed = new Set<Element>();
  rootObjects.forEach((element) => {
    if (protectedRoots.has(element)) return;

    if (element.tagName === 'ClipProjectItem') {
      const projectItem = getPremiereDirectChild(element, 'ProjectItem');
      const nameNode = projectItem ? getPremiereDirectChild(projectItem, 'Name') : null;
      const clipName = (nameNode?.textContent || '').trim();
      if (!isPremiereTemplatePlaceholderValue(clipName)) return;

      const masterClipRef = getPremiereDirectChild(element, 'MasterClip')?.getAttribute('ObjectURef') || '';
      if (masterClipRef === sourceMasterClipUid && PREMIERE_TEMPLATE_SCENE_VIDEO_RE.test(clipName)) {
        if (nameNode) nameNode.textContent = safeVideoName;
        return;
      }

      removePremiereBinItemRef(root, element.getAttribute('ObjectUID') || '');
      seed.add(element);
      return;
    }

    const hasPlaceholderValue = getPremiereRootObjectTextValues(element).some((value) => (
      value !== safeVideoName && isPremiereTemplatePlaceholderValue(value)
    ));
    if (hasPlaceholderValue) {
      seed.add(element);
    }
  });

  if (seed.size === 0) {
    normalizePremiereBinItems(root);
    return;
  }

  const removable = new Set<Element>(seed);
  const queue = [...seed];
  while (queue.length > 0) {
    const current = queue.pop()!;
    collectPremiereObjectRefs(current).forEach((ref) => {
      const target = objectById.get(ref) || objectByUid.get(ref);
      if (target && !removable.has(target) && !protectedRoots.has(target)) {
        removable.add(target);
        queue.push(target);
      }
    });
  }

  removePremiereRootObjects(root, removable);
}

/**
 * [FIX] Premiere 템플릿의 환경 종속 절대경로·버전 정보를 제거하여
 * 어떤 OS·Premiere 버전에서든 열 수 있도록 한다.
 *
 * 1. /Users/*, C:\Users\* 등 사용자 절대경로 → 제거
 * 2. /Applications/Adobe Premiere Pro *  → 제거
 * 3. MZ.BuildVersion.Created / Modified → Premiere 2024도 수용하는 24.x 형식으로 재설정
 * 4. PresetPath, ProxyWatermarkDefaultImageFullPath → 비움
 * 5. 남아있는 ConformedAudioPath, PeakFilePath → 제거
 *
 * 컴패니언이 설치된 환경에서는 컴패니언이 실제 경로로 재패치한다.
 */
function sanitizePremiereEnvironmentPaths(
  root: Element,
  doc: Document,
  protectedMediaObjectUids: Iterable<string> = [],
): void {
  const absPathRe = /^(\/Users\/|\/Applications\/|[A-Z]:\\Users\\|[A-Z]:\\Program Files)/;
  const protectedMediaUids = new Set(protectedMediaObjectUids || []);
  const tagsToClean = [
    'PresetPath', 'ProxyWatermarkDefaultImageFullPath',
    'ConformedAudioPath', 'PeakFilePath',
    'project.settings.lastknowngoodprojectpath',
    'AlternateMediaFilePath', 'ImporterPrefs', 'MediaLocatorInfo',
  ];
  // [FIX] BuildVersion을 비우면 Premiere에서 Save/Open 에러가 날 수 있으므로
  // 2024~최신 버전이 모두 받아들이는 24.x 형식으로 고정한다.
  const buildVersionValue = (() => {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${PREMIERE_COMPAT_BUILD_VERSION_PREFIX} - ${days[d.getDay()]} ${months[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}`;
  })();
  const tagsToSetBuildVersion = [
    'MZ.BuildVersion.Created', 'MZ.BuildVersion.Modified',
  ];
  const isProtectedMediaPath = (element: Element): boolean => {
    if (!['FilePath', 'ActualMediaFilePath'].includes(element.tagName)) return false;
    let current: Element | null = element.parentElement;
    while (current) {
      if (current.tagName === 'Media') {
        return protectedMediaUids.has(current.getAttribute('ObjectUID') || '');
      }
      current = current.parentElement;
    }
    return false;
  };

  // root 직계 자식 순회 (Premiere .prproj는 flat structure)
  const walk = (parent: Element) => {
    Array.from(parent.children).forEach(child => {
      const keepMediaPath = isProtectedMediaPath(child);

      // 제거 대상 태그
      if (tagsToClean.includes(child.tagName)) {
        const val = child.textContent || '';
        if (absPathRe.test(val) || child.tagName === 'ConformedAudioPath' || child.tagName === 'PeakFilePath') {
          parent.removeChild(child);
          return;
        }
      }

      // BuildVersion 태그 — 유효한 값 설정
      if (tagsToSetBuildVersion.includes(child.tagName)) {
        child.textContent = buildVersionValue;
        return;
      }

      // 절대경로가 남아있는 태그 — 내용을 비움 (Premiere가 저장 시 재설정)
      if (['PresetPath', 'ProxyWatermarkDefaultImageFullPath', 'FilePath', 'ActualMediaFilePath'].includes(child.tagName)) {
        if (keepMediaPath) {
          return;
        }
        const val = child.textContent || '';
        if (absPathRe.test(val)) {
          child.textContent = '';
        }
      }

      // JSON 문자열 내 임베딩된 절대경로 정리 (ExportState 등)
      if (child.children.length === 0 && child.textContent) {
        const txt = child.textContent;
        if (absPathRe.test(txt) || /\/Users\/|[A-Z]:\\Users\\/.test(txt)) {
          // JSON 내 "OutPath":"/Users/..." 패턴 → 빈 문자열로 치환
          child.textContent = txt
            .replace(/"OutPath":"[^"]*"/g, '"OutPath":""')
            .replace(/"[^"]*":\s*"(\/Users\/|[A-Z]:\\\\Users\\\\)[^"]*"/g, (m, _p) => {
              const key = m.substring(0, m.indexOf(':') + 1);
              return `${key}""`;
            });
        }
      }

      // 재귀 — Properties, Node 등 하위 탐색
      if (child.children.length > 0) {
        walk(child);
      }
    });
  };

  // root 직계 자식(ObjectID가 있는 요소)들을 순회
  Array.from(root.children).forEach(topLevel => {
    walk(topLevel);
  });
}

function normalizePremiereProjectCompatibility(projectElement: Element): void {
  const currentVersion = Number(projectElement.getAttribute('Version') || '');
  const compatVersion = Number(PREMIERE_COMPAT_PROJECT_VERSION);
  if (Number.isFinite(currentVersion) && currentVersion > compatVersion) {
    projectElement.setAttribute('Version', PREMIERE_COMPAT_PROJECT_VERSION);
  }
}

function setPremiereTrackItemTimes(trackItemElement: Element, startTicks: number, endTicks: number): void {
  const trackItem = getPremiereDirectChild(trackItemElement, 'TrackItem');
  if (!trackItem) throw new Error('Premiere ClipTrackItem.TrackItem을 찾지 못했습니다.');
  setPremiereChildText(trackItem.ownerDocument, trackItem, 'Start', String(startTicks));
  setPremiereChildText(trackItem.ownerDocument, trackItem, 'End', String(endTicks));
}

function setPremiereTrackInternalId(trackItemElement: Element, internalId: number): void {
  const trackItem = getPremiereDirectChild(trackItemElement, 'TrackItem');
  if (!trackItem) throw new Error('Premiere ClipTrackItem.TrackItem을 찾지 못했습니다.');
  const node = ensurePremiereDirectChild(trackItem.ownerDocument, trackItem, 'Node');
  setPremiereChildText(trackItem.ownerDocument, node, 'ID', String(internalId));
}

function setPremiereSubClipRef(clipTrackItemElement: Element, objectRef: string): void {
  const subClip = getPremiereDirectChild(clipTrackItemElement, 'SubClip');
  if (!subClip) throw new Error('Premiere ClipTrackItem.SubClip을 찾지 못했습니다.');
  subClip.setAttribute('ObjectRef', objectRef);
}

function connectPremiereSourceTrackItem(params: {
  clipTrackItem: Element;
  subClip: Element;
  componentChain: Element;
  timelineClip: Element;
  masterClipUid: string;
  mediaSourceId: string;
  markersId: string;
}): void {
  const {
    clipTrackItem,
    subClip,
    componentChain,
    timelineClip,
    masterClipUid,
    mediaSourceId,
    markersId,
  } = params;

  setPremiereObjectRef(getPremiereDirectChild(clipTrackItem, 'ComponentOwner')!, componentChain.getAttribute('ObjectID') || '');
  setPremiereSubClipRef(clipTrackItem, subClip.getAttribute('ObjectID') || '');
  setPremiereObjectRef(getPremiereDirectChild(subClip, 'Clip')!, timelineClip.getAttribute('ObjectID') || '');
  setPremiereObjectURef(getPremiereDirectChild(subClip, 'MasterClip')!, masterClipUid);

  const clipBody = getPremiereClipBody(timelineClip);
  setPremiereObjectRef(getPremiereDirectChild(clipBody, 'Source'), mediaSourceId);
  const markerOwner = getPremiereDirectChild(clipBody, 'MarkerOwner');
  const markers = markerOwner ? getPremiereDirectChild(markerOwner, 'Markers') : null;
  if (markers && markersId) {
    setPremiereObjectRef(markers, markersId);
  }
}

function premiereNextObjectIdFactory(doc: Document): () => string {
  let maxObjectId = 0;
  doc.querySelectorAll('[ObjectID]').forEach((element) => {
    const value = Number(element.getAttribute('ObjectID') || '0');
    if (Number.isFinite(value)) {
      maxObjectId = Math.max(maxObjectId, value);
    }
  });
  return () => String(++maxObjectId);
}

function premiereNextNumericIdFactory(doc: Document): () => number {
  let maxId = 0;
  doc.querySelectorAll('ID').forEach((element) => {
    const value = Number(element.textContent || '');
    if (Number.isFinite(value)) {
      maxId = Math.max(maxId, value);
    }
  });
  return () => ++maxId;
}

function premiereUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return uuid().toLowerCase();
}

function getPremiereTrackObjectURef(trackGroup: Element, index: number): string {
  const tracks = getPremiereDirectChild(getPremiereDirectChild(trackGroup, 'TrackGroup')!, 'Tracks');
  if (!tracks) {
    throw new Error('Premiere TrackGroup.Tracks를 찾지 못했습니다.');
  }
  const trackRef = Array.from(tracks.children).find(child => child.tagName === 'Track' && child.getAttribute('Index') === String(index));
  const objectURef = trackRef?.getAttribute('ObjectURef') || '';
  if (!objectURef) {
    throw new Error(`Premiere TrackGroup index ${index}를 찾지 못했습니다.`);
  }
  return objectURef;
}

function getPremiereTrackClipItems(trackElement: Element): Element {
  const clipTrack = getPremiereDirectChild(trackElement, 'ClipTrack')
    ?? getPremiereDirectChild(getPremiereDirectChild(trackElement, 'DataClipTrack') || trackElement, 'ClipTrack');
  const clipItems = clipTrack ? getPremiereDirectChild(clipTrack, 'ClipItems') : null;
  if (!clipItems) throw new Error('Premiere ClipItems를 찾지 못했습니다.');
  return clipItems;
}

function getPremiereTrackTransitions(trackElement: Element): Element {
  const clipTrack = getPremiereDirectChild(trackElement, 'ClipTrack')
    ?? getPremiereDirectChild(getPremiereDirectChild(trackElement, 'DataClipTrack') || trackElement, 'ClipTrack');
  const transitionItems = clipTrack ? getPremiereDirectChild(clipTrack, 'TransitionItems') : null;
  if (!transitionItems) throw new Error('Premiere TransitionItems를 찾지 못했습니다.');
  return transitionItems;
}

function ensurePremiereTrackRefsContainer(doc: Document, trackGroupMeta: Element): Element {
  const tracks = getPremiereDirectChild(trackGroupMeta, 'Tracks');
  if (tracks) return tracks;
  const created = doc.createElement('Tracks');
  created.setAttribute('Version', '1');
  trackGroupMeta.insertBefore(created, trackGroupMeta.firstChild);
  return created;
}

function createPremiereCaptionTrack(params: {
  doc: Document;
  root: Element;
  template: Element;
  nextObjectId: () => string;
  trackId: number;
  index: number;
}): Element {
  const {
    doc,
    root,
    template,
    nextObjectId,
    trackId,
    index,
  } = params;
  const track = clonePremiereObject(root, template, nextObjectId);
  removePremiereChild(track, 'ParentStyle');
  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(track), []);
  replacePremiereTrackRefs(doc, getPremiereTrackTransitions(track), []);
  const clipTrack = getPremiereDirectChild(getPremiereDirectChild(track, 'DataClipTrack')!, 'ClipTrack');
  const trackNode = clipTrack ? getPremiereDirectChild(clipTrack, 'Track') : null;
  if (!trackNode) {
    throw new Error('Premiere caption track 템플릿 구조가 예상과 다릅니다.');
  }
  setPremiereChildText(doc, trackNode, 'ID', String(trackId));
  setPremiereChildText(doc, trackNode, 'Index', String(index));
  return track;
}

function setPremiereObjectRef(element: Element | null, objectRef: string): void {
  if (!element) {
    throw new Error('Premiere ObjectRef 대상 요소를 찾지 못했습니다.');
  }
  element.setAttribute('ObjectRef', objectRef);
}

function setPremiereObjectURef(element: Element | null, objectURef: string): void {
  if (!element) {
    throw new Error('Premiere ObjectURef 대상 요소를 찾지 못했습니다.');
  }
  element.setAttribute('ObjectURef', objectURef);
}

function clonePremiereObject(root: Element, template: Element, nextObjectId: () => string): Element {
  const targetDoc = root.ownerDocument;
  const clone = template.ownerDocument !== targetDoc && typeof targetDoc.importNode === 'function'
    ? targetDoc.importNode(template, true) as Element
    : template.cloneNode(true) as Element;
  if (clone.hasAttribute('ObjectID')) {
    clone.setAttribute('ObjectID', nextObjectId());
  }
  if (clone.hasAttribute('ObjectUID')) {
    clone.setAttribute('ObjectUID', premiereUuid());
  }
  root.appendChild(clone);
  return clone;
}

function clonePremiereRootSubgraph(params: {
  targetRoot: Element;
  sourceRoot: Element;
  refs: string[];
  nextObjectId: () => string;
  blockedRefs?: Iterable<string>;
}): PremiereImportedSubgraph {
  const {
    targetRoot,
    sourceRoot,
    refs,
    nextObjectId,
    blockedRefs = [],
  } = params;
  const sourceRefs = collectPremiereReferencedRootObjects(sourceRoot, refs, blockedRefs);
  const orderedSourceRoots = getPremiereRootObjects(sourceRoot).filter((element) => sourceRefs.has(element));
  const oldIdToNewId = new Map<string, string>();
  const oldUidToNewUid = new Map<string, string>();
  const objectBySourceId = new Map<string, Element>();
  const objectBySourceUid = new Map<string, Element>();
  const roots = orderedSourceRoots.map((sourceElement) => {
    const clone = clonePremiereObject(targetRoot, sourceElement, nextObjectId);
    const sourceObjectId = sourceElement.getAttribute('ObjectID');
    const sourceObjectUid = sourceElement.getAttribute('ObjectUID');
    const clonedObjectId = clone.getAttribute('ObjectID');
    const clonedObjectUid = clone.getAttribute('ObjectUID');
    if (sourceObjectId && clonedObjectId) {
      oldIdToNewId.set(sourceObjectId, clonedObjectId);
      objectBySourceId.set(sourceObjectId, clone);
    }
    if (sourceObjectUid && clonedObjectUid) {
      oldUidToNewUid.set(sourceObjectUid, clonedObjectUid);
      objectBySourceUid.set(sourceObjectUid, clone);
    }
    return clone;
  });

  roots.forEach((rootObject) => {
    [rootObject, ...Array.from(rootObject.querySelectorAll('*'))].forEach((node) => {
      if (!(node instanceof Element)) return;
      const objectRef = node.getAttribute('ObjectRef');
      const objectURef = node.getAttribute('ObjectURef');
      if (objectRef && oldIdToNewId.has(objectRef)) {
        node.setAttribute('ObjectRef', oldIdToNewId.get(objectRef)!);
      }
      if (objectURef && oldUidToNewUid.has(objectURef)) {
        node.setAttribute('ObjectURef', oldUidToNewUid.get(objectURef)!);
      }
    });
  });

  return { roots, objectBySourceId, objectBySourceUid };
}

function getPremiereImportedObjectById(graph: PremiereImportedSubgraph, sourceObjectId: string): Element {
  const element = graph.objectBySourceId.get(sourceObjectId);
  if (!element) {
    throw new Error(`Premiere legacy prototype ObjectID ${sourceObjectId}를 찾지 못했습니다.`);
  }
  return element;
}

function getPremiereImportedObjectByUid(graph: PremiereImportedSubgraph, sourceObjectUid: string): Element {
  const element = graph.objectBySourceUid.get(sourceObjectUid);
  if (!element) {
    throw new Error(`Premiere legacy prototype ObjectUID ${sourceObjectUid}를 찾지 못했습니다.`);
  }
  return element;
}

async function generatePremiereNativeProjectBytes(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  preset?: VideoAnalysisPreset;
  width?: number;
  height?: number;
  fps?: number;
  videoDurationSec?: number;
  hasAudioTrack?: boolean;
  narrationLines?: ExportNarrationLine[];
  dialogueLineBreaks?: SubtitleTextOverrideMap;
}): Promise<Uint8Array> {
  const {
    scenes,
    title,
    videoFileName,
    preset,
    width = 1080,
    height = 1920,
    fps = 30,
    videoDurationSec,
    hasAudioTrack = true,
    narrationLines = [],
    dialogueLineBreaks,
  } = params;

  const [templateXml, legacyTemplateXml] = await Promise.all([
    loadPremiereNativeTemplateXml(),
    loadPremiereLegacyTemplateXml(),
  ]);
  const doc = parsePremiereProjectXml(templateXml);
  const legacyDoc = parsePremiereProjectXml(legacyTemplateXml);
  const root = getPremiereProjectRoot(doc);
  const legacyRoot = getPremiereProjectRoot(legacyDoc);

  const nextObjectId = premiereNextObjectIdFactory(doc);
  const nextNumericId = premiereNextNumericIdFactory(doc);
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const timings = syncTimeline.scenes;
  const totalTimelineSec = timings.at(-1)?.timelineEndSec || 0;
  const totalTimelineTicks = secondsToPremiereTicks(totalTimelineSec);
  const frameDurationTicks = getPremiereFrameDurationTicks(fps);
  const safeSequenceName = sanitizeProjectName(title, 80);
  const safeVideoName = sanitizeFileName(videoFileName);
  const sourceDurationSec = Math.max(
    videoDurationSec || 0,
    ...timings.map(t => t.sourceStartSec + t.trimEndSec),
    0,
  );
  const sourceDurationTicks = secondsToPremiereTicks(sourceDurationSec);

  const sequence = getPremiereObjectByUid(doc, PREMIERE_V45_SEQUENCE_UID);
  setPremiereChildText(doc, sequence, 'Name', safeSequenceName);
  const sequenceNode = getPremiereDirectChild(sequence, 'Node');
  const sequenceProps = sequenceNode ? getPremiereDirectChild(sequenceNode, 'Properties') : null;
  if (sequenceProps) {
    setPremiereChildText(doc, sequenceProps, 'MZ.WorkOutPoint', String(totalTimelineTicks));
    setPremiereChildText(doc, sequenceProps, 'MZ.OutPoint', String(totalTimelineTicks));
    setPremiereChildText(doc, sequenceProps, 'Monitor.ProgramZoomOut', String(Math.max(totalTimelineTicks, frameDurationTicks)));
    setPremiereChildText(doc, sequenceProps, 'MZ.EditLine', String(totalTimelineTicks));
    setPremiereChildText(doc, sequenceProps, 'MZ.Sequence.PreviewFrameSizeWidth', String(width));
    setPremiereChildText(doc, sequenceProps, 'MZ.Sequence.PreviewFrameSizeHeight', String(height));
  }

  // V45 템플릿에서 ObjectID가 Column과 충돌하므로 태그명으로 직접 찾기
  const videoTrackGroup = doc.querySelector('VideoTrackGroup');
  if (videoTrackGroup) {
    setPremiereChildText(doc, videoTrackGroup, 'FrameRect', `0,0,${width},${height}`);
    const videoTrackGroupMeta = getPremiereDirectChild(videoTrackGroup, 'TrackGroup');
    if (videoTrackGroupMeta) {
      setPremiereChildText(doc, videoTrackGroupMeta, 'FrameRate', String(frameDurationTicks));
    }
  }
  // V45 템플릿에서 ObjectID가 Column과 충돌하므로 태그명으로 직접 찾기
  const dataTrackGroup = doc.querySelector('DataTrackGroup');
  if (dataTrackGroup) {
    const dataTrackGroupMeta = getPremiereDirectChild(dataTrackGroup, 'TrackGroup');
    if (dataTrackGroupMeta) {
      setPremiereChildText(doc, dataTrackGroupMeta, 'FrameRate', String(frameDurationTicks));
    }
  }

  // [FIX] 템플릿에 남아있는 원본 프로젝트 절대경로 제거
  const projectElement = getPremiereObjectById(doc, PREMIERE_V45_PROJECT_ID);
  normalizePremiereProjectCompatibility(projectElement);
  const projectNode = getPremiereDirectChild(projectElement, 'Node');
  const projectProps = projectNode ? getPremiereDirectChild(projectNode, 'Properties') : null;
  if (projectProps) {
    removePremiereChild(projectProps, 'project.settings.lastknowngoodprojectpath');
    setPremiereChildText(doc, projectProps, 'MZ.PrefixKey.OpenSequenceGuidList.1', sequence.getAttribute('ObjectUID') || '');
  }

  const sourceGraph = clonePremiereRootSubgraph({
    targetRoot: root,
    sourceRoot: legacyRoot,
    refs: [PREMIERE_LEGACY_SOURCE_MASTER_CLIP_UID, PREMIERE_LEGACY_SOURCE_MEDIA_UID],
    nextObjectId,
  });
  const sourceGraphRefs = new Set([
    ...sourceGraph.objectBySourceId.keys(),
    ...sourceGraph.objectBySourceUid.keys(),
  ]);
  const cleanupRoots = new Set<Element>();
  const protectedMediaObjectUids = new Set<string>();
  const sourceMedia = getPremiereImportedObjectByUid(sourceGraph, PREMIERE_LEGACY_SOURCE_MEDIA_UID);
  const sourceMediaUid = sourceMedia.getAttribute('ObjectUID') || '';
  if (sourceMediaUid) protectedMediaObjectUids.add(sourceMediaUid);
  // [FIX] Premiere ZIP은 .prproj와 같은 폴더의 미디어를 프로젝트 상대경로(./file)로 잡아야
  // 트랙 아이템→SubClip→SourceMedia 체인에서 재링크가 안정적으로 유지된다.
  setPremiereMediaFilePaths(doc, sourceMedia, safeVideoName);
  removePremiereChild(sourceMedia, 'AlternateMediaFilePath');
  // [FIX] ImporterPrefs 추가 — Premiere가 미디어 임포터를 식별하는 핵심 메타데이터
  // 이것이 없으면 Premiere가 파일을 찾아도 링크하지 못함
  // 값: AQAAAAEAAAA= = 기본 미디어 임포터 설정 (Premiere Project Manager와 동일)
  {
    const importerPrefs = ensurePremiereDirectChildBefore(
      doc,
      sourceMedia,
      'ImporterPrefs',
      ['ModificationState', 'RelativePath', 'FilePath'],
    );
    importerPrefs.setAttribute('Encoding', 'base64');
    importerPrefs.setAttribute('BinaryHash', '1da08a98-2feb-bf2a-20f7-625f00000014');
    importerPrefs.textContent = 'AQAAAAEAAAA=';
  }

  const sourceVideoStream = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_VIDEO_STREAM_ID);
  setPremiereChildText(doc, sourceVideoStream, 'Duration', String(sourceDurationTicks));
  setPremiereChildText(doc, sourceVideoStream, 'FrameRect', `0,0,${width},${height}`);
  setPremiereChildText(doc, sourceVideoStream, 'FrameRate', String(frameDurationTicks));
  removePremiereChild(sourceVideoStream, 'ConformedAudioPath');
  removePremiereChild(sourceVideoStream, 'PeakFilePath');

  const sourceAudioStream = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_AUDIO_STREAM_ID);
  // [FIX] 영상에 오디오 트랙이 없으면 AudioStream 제거 — 미디어 타입 불일치 방지
  if (!hasAudioTrack) {
    removePremiereChild(sourceMedia, 'AudioStream');
    removePremiereChild(sourceMedia, 'ConformedAudioRate');
  } else {
    setPremiereChildText(doc, sourceAudioStream, 'Duration', String(sourceDurationTicks));
    removePremiereChild(sourceAudioStream, 'ConformedAudioPath');
    removePremiereChild(sourceAudioStream, 'PeakFilePath');
  }

  const sourceMarkers = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_MARKERS_ID);
  const sourceVideoMediaSource = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_VIDEO_MEDIA_SOURCE_ID);
  const sourceAudioMediaSource = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_AUDIO_MEDIA_SOURCE_ID);
  setPremiereChildText(doc, sourceVideoMediaSource, 'OriginalDuration', String(sourceDurationTicks));
  if (hasAudioTrack) {
    setPremiereChildText(doc, sourceAudioMediaSource, 'OriginalDuration', String(sourceDurationTicks));
  }

  const renderMasterClip = getPremiereObjectByUid(doc, PREMIERE_V45_RENDER_MASTER_CLIP_UID);
  const renderClipProjectItem = getPremiereClipProjectItemByMasterClipUid(doc, renderMasterClip.getAttribute('ObjectUID') || '');
  const renderLoggingInfo = getPremiereObjectById(doc, PREMIERE_V45_RENDER_LOGGING_INFO_ID);
  const renderAudioSequenceSource = getPremiereObjectById(doc, PREMIERE_V45_RENDER_AUDIO_SEQUENCE_SOURCE_ID);
  const renderVideoSequenceSource = getPremiereObjectById(doc, PREMIERE_V45_RENDER_VIDEO_SEQUENCE_SOURCE_ID);
  // [FIX] 템플릿 시퀀스 소스 OriginalDuration이 과거 값으로 남아 있으면
  // Convert+Save 시 #렌더 MasterClip의 content boundary 계산이 깨질 수 있다.
  setPremiereChildText(doc, renderAudioSequenceSource, 'OriginalDuration', String(totalTimelineTicks));
  setPremiereChildText(doc, renderVideoSequenceSource, 'OriginalDuration', String(totalTimelineTicks));
  setPremiereChildText(doc, renderMasterClip, 'Name', safeSequenceName);
  if (renderClipProjectItem) {
    setPremiereClipProjectItemName(doc, renderClipProjectItem, safeSequenceName);
  }
  setPremiereChildText(doc, renderLoggingInfo, 'ClipName', safeSequenceName);
  setPremiereChildText(doc, renderLoggingInfo, 'MediaInPoint', '0');
  setPremiereChildText(doc, renderLoggingInfo, 'MediaOutPoint', String(totalTimelineTicks));
  setPremiereChildText(doc, renderLoggingInfo, 'MediaFrameRate', String(frameDurationTicks));
  setPremiereChildText(doc, renderLoggingInfo, 'TimecodeFormat', fps >= 29.9 ? '104' : '100');
  bumpPremiereNumericChildText(doc, renderMasterClip, 'MasterClipChangeVersion');

  const sourceMasterClip = getPremiereImportedObjectByUid(sourceGraph, PREMIERE_LEGACY_SOURCE_MASTER_CLIP_UID);
  setPremiereChildText(doc, sourceMasterClip, 'Name', safeVideoName);
  const sourceLoggingInfo = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_LOGGING_INFO_ID);
  setPremiereChildText(doc, sourceLoggingInfo, 'ClipName', safeVideoName);
  setPremiereChildText(doc, sourceLoggingInfo, 'MediaOutPoint', String(sourceDurationTicks));
  setPremiereChildText(doc, sourceLoggingInfo, 'MediaFrameRate', String(frameDurationTicks));
  setPremiereChildText(doc, sourceLoggingInfo, 'TimecodeFormat', fps >= 29.9 ? '104' : '100');
  bumpPremiereNumericChildText(doc, sourceMasterClip, 'MasterClipChangeVersion');

  const sourceMasterVideoClip = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_MASTER_VIDEO_CLIP_ID);
  setPremiereClipChildText(doc, sourceMasterVideoClip, 'ClipID', premiereUuid());
  const sourceMasterAudioClip = getPremiereImportedObjectById(sourceGraph, PREMIERE_LEGACY_SOURCE_MASTER_AUDIO_CLIP_ID);
  setPremiereClipChildText(doc, sourceMasterAudioClip, 'ClipID', premiereUuid());

  const audioTrackGroup = doc.querySelector('AudioTrackGroup') || getPremiereObjectById(doc, PREMIERE_V45_AUDIO_TRACK_GROUP_ID);
  const narrationTrack = getPremiereObjectByUid(doc, getPremiereTrackObjectURef(audioTrackGroup, 0));
  const sourceAudioTrack = getPremiereObjectByUid(doc, getPremiereTrackObjectURef(audioTrackGroup, 1));
  const videoTrack = getPremiereObjectByUid(doc, getPremiereTrackObjectURef(videoTrackGroup!, 0));
  const legacyCaptionTrackTemplate = getPremiereObjectByUid(legacyDoc, PREMIERE_LEGACY_CAPTION_TRACK_UID);
  const dialogueCaptionTrack = createPremiereCaptionTrack({
    doc,
    root,
    template: legacyCaptionTrackTemplate,
    nextObjectId,
    trackId: 1,
    index: 0,
  });
  const effectCaptionTrack = createPremiereCaptionTrack({
    doc,
    root,
    template: legacyCaptionTrackTemplate,
    nextObjectId,
    trackId: 2,
    index: 1,
  });
  const dataTrackGroupMeta2 = dataTrackGroup ? getPremiereDirectChild(dataTrackGroup, 'TrackGroup') : null;
  if (dataTrackGroupMeta2) {
    const dataTrackGroupTracks = ensurePremiereTrackRefsContainer(doc, dataTrackGroupMeta2);
    Array.from(dataTrackGroupTracks.children).forEach((child) => dataTrackGroupTracks.removeChild(child));
    [dialogueCaptionTrack, effectCaptionTrack].forEach((track, index) => {
      const trackRef = doc.createElement('Track');
      trackRef.setAttribute('Index', String(index));
      trackRef.setAttribute('ObjectURef', track.getAttribute('ObjectUID') || premiereUuid());
      dataTrackGroupTracks.appendChild(trackRef);
    });
    setPremiereChildText(doc, dataTrackGroupMeta2, 'NextTrackID', '3');
  }

  const captionBinarySpec = getPremiereCaptionBinarySpec(width, height);
  const dialogueStyleNode = ensurePremiereDirectChild(doc, dialogueCaptionTrack, 'CaptionDataTemplateStyle');
  dialogueStyleNode.textContent = captionBinarySpec.styleBase64;
  const effectStyleNode = ensurePremiereDirectChild(doc, effectCaptionTrack, 'CaptionDataTemplateStyle');
  effectStyleNode.textContent = captionBinarySpec.styleBase64;

  const videoTrackItems: string[] = [];
  const sourceAudioTrackItems: string[] = [];
  const narrationTrackItems: string[] = [];
  const dialogueCaptionTrackItems: string[] = [];
  const effectCaptionTrackItems: string[] = [];

  timings.forEach((timing) => {
    const timelineStartTicks = secondsToPremiereTicks(timing.timelineStartSec);
    const timelineEndTicks = secondsToPremiereTicks(timing.timelineEndSec);
    const sourceStartTicks = secondsToPremiereTicks(timing.sourceStartSec + timing.trimStartSec);
    const sourceEndTicks = secondsToPremiereTicks(timing.sourceStartSec + timing.trimEndSec);

    const sceneVideoGraph = clonePremiereRootSubgraph({
      targetRoot: root,
      sourceRoot: legacyRoot,
      refs: [PREMIERE_LEGACY_VIDEO_TRACK_ITEM_ID],
      nextObjectId,
    });
    const videoTrackItem = getPremiereImportedObjectById(sceneVideoGraph, PREMIERE_LEGACY_VIDEO_TRACK_ITEM_ID);
    const videoComponentChain = getPremiereImportedObjectById(sceneVideoGraph, PREMIERE_LEGACY_VIDEO_COMPONENT_CHAIN_ID);
    const videoSubClip = getPremiereImportedObjectById(sceneVideoGraph, PREMIERE_LEGACY_VIDEO_SUB_CLIP_ID);
    const videoClip = getPremiereImportedObjectById(sceneVideoGraph, PREMIERE_LEGACY_TIMELINE_VIDEO_CLIP_ID);
    const videoClipTrackItem = getPremiereDirectChild(videoTrackItem, 'ClipTrackItem')!;
    connectPremiereSourceTrackItem({
      clipTrackItem: videoClipTrackItem,
      subClip: videoSubClip,
      componentChain: videoComponentChain,
      timelineClip: videoClip,
      masterClipUid: sourceMasterClip.getAttribute('ObjectUID') || '',
      mediaSourceId: sourceVideoMediaSource.getAttribute('ObjectID') || '',
      markersId: sourceMarkers.getAttribute('ObjectID') || '',
    });
    setPremiereTrackItemTimes(videoClipTrackItem, timelineStartTicks, timelineEndTicks);
    setPremiereTrackInternalId(videoClipTrackItem, nextNumericId());
    setPremiereChildText(doc, videoTrackItem, 'FrameRect', `0,0,${width},${height}`);
    setPremiereChildText(doc, videoSubClip, 'Name', safeVideoName);
    setPremiereClipChildText(doc, videoClip, 'ClipID', premiereUuid());
    setPremiereClipChildText(doc, videoClip, 'InPoint', String(sourceStartTicks));
    setPremiereClipChildText(doc, videoClip, 'OutPoint', String(sourceEndTicks));
    sourceGraphRefs.forEach((ref) => {
      const duplicateRoot = sceneVideoGraph.objectBySourceId.get(ref) || sceneVideoGraph.objectBySourceUid.get(ref);
      if (duplicateRoot) cleanupRoots.add(duplicateRoot);
    });
    videoTrackItems.push(videoTrackItem.getAttribute('ObjectID') || '');

    // [FIX] 영상에 오디오 트랙이 있을 때만 소스 오디오 클립 생성
    if (hasAudioTrack) {
      const sceneAudioGraph = clonePremiereRootSubgraph({
        targetRoot: root,
        sourceRoot: legacyRoot,
        refs: [PREMIERE_LEGACY_AUDIO_TRACK_ITEM_ID],
        nextObjectId,
      });
      const sourceAudioTrackItem = getPremiereImportedObjectById(sceneAudioGraph, PREMIERE_LEGACY_AUDIO_TRACK_ITEM_ID);
      const sourceAudioComponentChain = getPremiereImportedObjectById(sceneAudioGraph, PREMIERE_LEGACY_AUDIO_COMPONENT_CHAIN_ID);
      const sourceAudioSubClip = getPremiereImportedObjectById(sceneAudioGraph, PREMIERE_LEGACY_AUDIO_SUB_CLIP_ID);
      const sourceAudioClip = getPremiereImportedObjectById(sceneAudioGraph, PREMIERE_LEGACY_TIMELINE_AUDIO_CLIP_ID);
      const sourceAudioClipTrackItem = getPremiereDirectChild(sourceAudioTrackItem, 'ClipTrackItem')!;
      connectPremiereSourceTrackItem({
        clipTrackItem: sourceAudioClipTrackItem,
        subClip: sourceAudioSubClip,
        componentChain: sourceAudioComponentChain,
        timelineClip: sourceAudioClip,
        masterClipUid: sourceMasterClip.getAttribute('ObjectUID') || '',
        mediaSourceId: sourceAudioMediaSource.getAttribute('ObjectID') || '',
        markersId: sourceMarkers.getAttribute('ObjectID') || '',
      });
      removePremiereChild(sourceAudioClipTrackItem, 'HeadTransition');
      removePremiereChild(sourceAudioClipTrackItem, 'TailTransition');
      [PREMIERE_LEGACY_AUDIO_HEAD_TRANSITION_ID, PREMIERE_LEGACY_AUDIO_TAIL_TRANSITION_ID].forEach((ref) => {
        const transitionRoot = sceneAudioGraph.objectBySourceId.get(ref);
        if (transitionRoot) cleanupRoots.add(transitionRoot);
      });
      setPremiereTrackItemTimes(sourceAudioClipTrackItem, timelineStartTicks, timelineEndTicks);
      setPremiereTrackInternalId(sourceAudioClipTrackItem, nextNumericId());
      setPremiereChildText(doc, sourceAudioSubClip, 'Name', safeVideoName);
      [PREMIERE_LEGACY_AUDIO_SECONDARY_CONTENT_1_ID, PREMIERE_LEGACY_AUDIO_SECONDARY_CONTENT_2_ID].forEach((ref) => {
        const secondaryContent = sceneAudioGraph.objectBySourceId.get(ref);
        if (secondaryContent) {
          setPremiereObjectRef(getPremiereDirectChild(secondaryContent, 'Content')!, sourceAudioMediaSource.getAttribute('ObjectID') || '');
        }
      });
      setPremiereClipChildText(doc, sourceAudioClip, 'ClipID', premiereUuid());
      setPremiereClipChildText(doc, sourceAudioClip, 'InPoint', String(sourceStartTicks));
      setPremiereClipChildText(doc, sourceAudioClip, 'OutPoint', String(sourceEndTicks));
      sourceGraphRefs.forEach((ref) => {
        const duplicateRoot = sceneAudioGraph.objectBySourceId.get(ref) || sceneAudioGraph.objectBySourceUid.get(ref);
        if (duplicateRoot) cleanupRoots.add(duplicateRoot);
      });
      sourceAudioTrackItems.push(sourceAudioTrackItem.getAttribute('ObjectID') || '');
    }

    timing.subtitleSegments
      .filter(segment => segment.text.trim())
      .flatMap(segment => buildDialogueCaptionEntries(segment, dialogueLineBreaks))
      .forEach((entry) => {
        const displayText = entry.text;
        if (!displayText) return;
        const startTicks = secondsToPremiereTicks(entry.startTime);
        const endTicks = secondsToPremiereTicks(entry.endTime);

        const captionGraph = clonePremiereRootSubgraph({
          targetRoot: root,
          sourceRoot: legacyRoot,
          refs: [
            PREMIERE_LEGACY_CAPTION_TRACK_ITEM_ID,
            PREMIERE_LEGACY_CAPTION_TIMELINE_TRANSCRIPT_CLIP_ID,
            PREMIERE_LEGACY_CAPTION_MASTER_CLIP_UID,
            PREMIERE_LEGACY_CAPTION_MEDIA_SOURCE_ID,
          ],
          nextObjectId,
        });
        const captionTrackItem = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_TRACK_ITEM_ID);
        const captionComponentChain = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_COMPONENT_CHAIN_ID);
        const captionSubClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_SUB_CLIP_ID);
        const captionBlock = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_BLOCK_ID);
        const captionTranscriptClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_TIMELINE_TRANSCRIPT_CLIP_ID);
        const captionMasterClip = getPremiereImportedObjectByUid(captionGraph, PREMIERE_LEGACY_CAPTION_MASTER_CLIP_UID);
        const captionLoggingInfo = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_LOGGING_INFO_ID);
        const captionMasterLibraryClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_MASTER_LIBRARY_CLIP_ID);
        const captionChannelGroups = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_CHANNEL_GROUPS_ID);
        const captionMediaSource = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_MEDIA_SOURCE_ID);
        const captionMedia = getPremiereImportedObjectByUid(captionGraph, PREMIERE_LEGACY_CAPTION_MEDIA_UID);
        const captionDataStream = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_DATA_STREAM_ID);

        const captionClipTrackItem = getPremiereDirectChild(captionTrackItem, 'DataClipTrackItem')!;
        const captionInnerTrackItem = getPremiereDirectChild(captionClipTrackItem, 'ClipTrackItem')!;
        setPremiereObjectRef(getPremiereDirectChild(captionInnerTrackItem, 'ComponentOwner')!, captionComponentChain.getAttribute('ObjectID') || '');
        setPremiereSubClipRef(captionInnerTrackItem, captionSubClip.getAttribute('ObjectID') || '');
        setPremiereTrackItemTimes(captionInnerTrackItem, startTicks, endTicks);
        setPremiereTrackInternalId(captionInnerTrackItem, nextNumericId());
        const blockVector = getPremiereDirectChild(captionTrackItem, 'BlockVector')!;
        const blockVectorItem = getPremiereDirectChild(blockVector, 'BlockVectorItem')!;
        blockVectorItem.setAttribute('ObjectRef', captionBlock.getAttribute('ObjectID') || '');

        setPremiereObjectRef(getPremiereDirectChild(captionSubClip, 'Clip')!, captionTranscriptClip.getAttribute('ObjectID') || '');
        setPremiereObjectURef(getPremiereDirectChild(captionSubClip, 'MasterClip')!, captionMasterClip.getAttribute('ObjectUID') || '');
        setPremiereChildText(doc, captionSubClip, 'Name', 'SyntheticCaption');

        setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(captionTranscriptClip), 'Source'), captionMediaSource.getAttribute('ObjectID') || '');
        setPremiereClipChildText(doc, captionTranscriptClip, 'ClipID', premiereUuid());
        setPremiereClipChildText(doc, captionTranscriptClip, 'InPoint', String(PREMIERE_CAPTION_CLIP_BASE_TICKS + startTicks));
        setPremiereClipChildText(doc, captionTranscriptClip, 'OutPoint', String(PREMIERE_CAPTION_CLIP_BASE_TICKS + endTicks));

        setPremiereObjectRef(getPremiereDirectChild(captionMasterClip, 'LoggingInfo')!, captionLoggingInfo.getAttribute('ObjectID') || '');
        const captionMasterClips = getPremiereDirectChild(captionMasterClip, 'Clips')!;
        const masterClipRef = getPremiereDirectChild(captionMasterClips, 'Clip')!;
        masterClipRef.setAttribute('ObjectRef', captionMasterLibraryClip.getAttribute('ObjectID') || '');
        setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(captionMasterLibraryClip), 'Source'), captionMediaSource.getAttribute('ObjectID') || '');
        setPremiereClipChildText(doc, captionMasterLibraryClip, 'ClipID', premiereUuid());
        setPremiereChildText(doc, captionMasterClip, 'Name', 'SyntheticCaption');
        setPremiereChildText(doc, captionLoggingInfo, 'MediaFrameRate', String(Number.MAX_SAFE_INTEGER));
        setPremiereObjectRef(getPremiereDirectChild(captionMasterClip, 'AudioClipChannelGroups')!, captionChannelGroups.getAttribute('ObjectID') || '');

        setPremiereObjectURef(getPremiereDirectChild(captionMediaSource, 'MediaSource')!.querySelector('Media')!, captionMedia.getAttribute('ObjectUID') || '');
        setPremiereChildText(doc, captionMediaSource, 'OriginalDuration', String(PREMIERE_CAPTION_CLIP_BASE_TICKS));
        setPremiereChildText(doc, captionMedia, 'Title', 'SyntheticCaption');
        setPremiereChildText(doc, captionMedia, 'ActualMediaFilePath', '1396920390');
        setPremiereChildText(doc, captionMedia, 'FilePath', '1396920390');
        setPremiereChildText(doc, captionMedia, 'Infinite', 'true');
        const dataStream = ensurePremiereDirectChild(doc, captionMedia, 'DataStream');
        dataStream.setAttribute('ObjectRef', captionDataStream.getAttribute('ObjectID') || '');
        const formattedText = ensurePremiereDirectChild(doc, captionBlock, 'FormattedTextData');
        const formattedTextBase64 = buildPremiereCaptionFormattedTextDataBase64(displayText, captionBinarySpec);
        formattedText.setAttribute('Encoding', 'base64');
        formattedText.setAttribute('BinaryHash', buildPremiereBinaryHash(atob(formattedTextBase64).length));
        formattedText.textContent = formattedTextBase64;

        dialogueCaptionTrackItems.push(captionTrackItem.getAttribute('ObjectID') || '');
      });

    timing.effectSubtitleSegments
      .filter(segment => segment.text.trim())
      .flatMap(segment => buildEffectCaptionEntries(segment))
      .forEach((entry) => {
        const displayText = entry.text;
        if (!displayText) return;
        const startTicks = secondsToPremiereTicks(entry.startTime);
        const endTicks = secondsToPremiereTicks(entry.endTime);

        const captionGraph = clonePremiereRootSubgraph({
          targetRoot: root,
          sourceRoot: legacyRoot,
          refs: [
            PREMIERE_LEGACY_CAPTION_TRACK_ITEM_ID,
            PREMIERE_LEGACY_CAPTION_TIMELINE_TRANSCRIPT_CLIP_ID,
            PREMIERE_LEGACY_CAPTION_MASTER_CLIP_UID,
            PREMIERE_LEGACY_CAPTION_MEDIA_SOURCE_ID,
          ],
          nextObjectId,
        });
        const captionTrackItem = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_TRACK_ITEM_ID);
        const captionComponentChain = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_COMPONENT_CHAIN_ID);
        const captionSubClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_SUB_CLIP_ID);
        const captionBlock = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_BLOCK_ID);
        const captionTranscriptClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_TIMELINE_TRANSCRIPT_CLIP_ID);
        const captionMasterClip = getPremiereImportedObjectByUid(captionGraph, PREMIERE_LEGACY_CAPTION_MASTER_CLIP_UID);
        const captionLoggingInfo = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_LOGGING_INFO_ID);
        const captionMasterLibraryClip = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_MASTER_LIBRARY_CLIP_ID);
        const captionChannelGroups = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_CHANNEL_GROUPS_ID);
        const captionMediaSource = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_MEDIA_SOURCE_ID);
        const captionMedia = getPremiereImportedObjectByUid(captionGraph, PREMIERE_LEGACY_CAPTION_MEDIA_UID);
        const captionDataStream = getPremiereImportedObjectById(captionGraph, PREMIERE_LEGACY_CAPTION_DATA_STREAM_ID);

        const captionClipTrackItem = getPremiereDirectChild(captionTrackItem, 'DataClipTrackItem')!;
        const captionInnerTrackItem = getPremiereDirectChild(captionClipTrackItem, 'ClipTrackItem')!;
        setPremiereObjectRef(getPremiereDirectChild(captionInnerTrackItem, 'ComponentOwner')!, captionComponentChain.getAttribute('ObjectID') || '');
        setPremiereSubClipRef(captionInnerTrackItem, captionSubClip.getAttribute('ObjectID') || '');
        setPremiereTrackItemTimes(captionInnerTrackItem, startTicks, endTicks);
        setPremiereTrackInternalId(captionInnerTrackItem, nextNumericId());
        const blockVector = getPremiereDirectChild(captionTrackItem, 'BlockVector')!;
        const blockVectorItem = getPremiereDirectChild(blockVector, 'BlockVectorItem')!;
        blockVectorItem.setAttribute('ObjectRef', captionBlock.getAttribute('ObjectID') || '');

        setPremiereObjectRef(getPremiereDirectChild(captionSubClip, 'Clip')!, captionTranscriptClip.getAttribute('ObjectID') || '');
        setPremiereObjectURef(getPremiereDirectChild(captionSubClip, 'MasterClip')!, captionMasterClip.getAttribute('ObjectUID') || '');
        setPremiereChildText(doc, captionSubClip, 'Name', 'SyntheticCaption');

        setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(captionTranscriptClip), 'Source'), captionMediaSource.getAttribute('ObjectID') || '');
        setPremiereClipChildText(doc, captionTranscriptClip, 'ClipID', premiereUuid());
        setPremiereClipChildText(doc, captionTranscriptClip, 'InPoint', String(PREMIERE_CAPTION_CLIP_BASE_TICKS + startTicks));
        setPremiereClipChildText(doc, captionTranscriptClip, 'OutPoint', String(PREMIERE_CAPTION_CLIP_BASE_TICKS + endTicks));

        setPremiereObjectRef(getPremiereDirectChild(captionMasterClip, 'LoggingInfo')!, captionLoggingInfo.getAttribute('ObjectID') || '');
        const captionMasterClips = getPremiereDirectChild(captionMasterClip, 'Clips')!;
        const masterClipRef = getPremiereDirectChild(captionMasterClips, 'Clip')!;
        masterClipRef.setAttribute('ObjectRef', captionMasterLibraryClip.getAttribute('ObjectID') || '');
        setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(captionMasterLibraryClip), 'Source'), captionMediaSource.getAttribute('ObjectID') || '');
        setPremiereClipChildText(doc, captionMasterLibraryClip, 'ClipID', premiereUuid());
        setPremiereChildText(doc, captionMasterClip, 'Name', 'SyntheticCaption');
        setPremiereChildText(doc, captionLoggingInfo, 'MediaFrameRate', String(Number.MAX_SAFE_INTEGER));
        setPremiereObjectRef(getPremiereDirectChild(captionMasterClip, 'AudioClipChannelGroups')!, captionChannelGroups.getAttribute('ObjectID') || '');

        setPremiereObjectURef(getPremiereDirectChild(captionMediaSource, 'MediaSource')!.querySelector('Media')!, captionMedia.getAttribute('ObjectUID') || '');
        setPremiereChildText(doc, captionMediaSource, 'OriginalDuration', String(PREMIERE_CAPTION_CLIP_BASE_TICKS));
        setPremiereChildText(doc, captionMedia, 'Title', 'SyntheticCaption');
        setPremiereChildText(doc, captionMedia, 'ActualMediaFilePath', '1396920390');
        setPremiereChildText(doc, captionMedia, 'FilePath', '1396920390');
        setPremiereChildText(doc, captionMedia, 'Infinite', 'true');
        const dataStream = ensurePremiereDirectChild(doc, captionMedia, 'DataStream');
        dataStream.setAttribute('ObjectRef', captionDataStream.getAttribute('ObjectID') || '');
        const formattedText = ensurePremiereDirectChild(doc, captionBlock, 'FormattedTextData');
        const formattedTextBase64 = buildPremiereCaptionFormattedTextDataBase64(displayText, captionBinarySpec);
        formattedText.setAttribute('Encoding', 'base64');
        formattedText.setAttribute('BinaryHash', buildPremiereBinaryHash(atob(formattedTextBase64).length));
        formattedText.textContent = formattedTextBase64;

        effectCaptionTrackItems.push(captionTrackItem.getAttribute('ObjectID') || '');
      });
  });

  narrationLines
    .filter(line => !!line.audioFileName)
    .forEach((line) => {
      // [FIX] 나레이션 타임라인 배치: sync timeline의 장면 시작점 사용
      const lineIndex = narrationLines.indexOf(line);
      const sceneTimelineStart = timings[lineIndex]?.timelineStartSec ?? line.startTime ?? 0;
      const narrationStartTicks = secondsToPremiereTicks(sceneTimelineStart);
      const narrationEndTicks = secondsToPremiereTicks(
        line.endTime != null
          ? line.endTime
          : sceneTimelineStart + Math.max(0.1, line.duration || 0),
      );
      const narrationDurationTicks = Math.max(frameDurationTicks, narrationEndTicks - narrationStartTicks);
      const narrationFileName = sanitizeFileName(line.audioFileName || 'narration.wav'); // audioFileName이 이미 설정된 경우 blob 기반 확장자 사용됨

      const narrationGraph = clonePremiereRootSubgraph({
        targetRoot: root,
        sourceRoot: legacyRoot,
        refs: [
          PREMIERE_LEGACY_NARRATION_TRACK_ITEM_ID,
          PREMIERE_LEGACY_NARRATION_MASTER_CLIP_UID,
          PREMIERE_LEGACY_NARRATION_MEDIA_UID,
          PREMIERE_LEGACY_NARRATION_TIMELINE_CLIP_ID,
        ],
        nextObjectId,
      });
      const narrationMasterClip = getPremiereImportedObjectByUid(narrationGraph, PREMIERE_LEGACY_NARRATION_MASTER_CLIP_UID);
      const narrationMasterAudioComponentChain = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_MASTER_AUDIO_COMPONENT_CHAIN_ID);
      const narrationChannelGroups = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_CHANNEL_GROUPS_ID);
      const narrationLoggingInfo = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_LOGGING_INFO_ID);
      const narrationMasterLibraryClip = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_MASTER_LIBRARY_CLIP_ID);
      const narrationMediaSource = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_MEDIA_SOURCE_ID);
      const narrationMasterSecondaryContent = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_MASTER_SECONDARY_CONTENT_ID);
      const narrationMedia = getPremiereImportedObjectByUid(narrationGraph, PREMIERE_LEGACY_NARRATION_MEDIA_UID);
      const narrationAudioStream = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_AUDIO_STREAM_ID);
      const narrationTimelineSecondaryContent = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_TIMELINE_SECONDARY_CONTENT_ID);

      setPremiereChildText(doc, narrationMasterClip, 'Name', narrationFileName);
      setPremiereChildText(doc, narrationMasterClip, 'MasterClipChangeVersion', '1');
      setPremiereObjectRef(getPremiereDirectChild(narrationMasterClip, 'LoggingInfo')!, narrationLoggingInfo.getAttribute('ObjectID') || '');
      // [FIX] AudioClipChannelGroups 참조를 복제된 객체로 갱신 — 누락 시 dangling ref로 Premiere 파싱 실패
      setPremiereObjectRef(getPremiereDirectChild(narrationMasterClip, 'AudioClipChannelGroups')!, narrationChannelGroups.getAttribute('ObjectID') || '');
      const narrationMasterAudioChains = getPremiereDirectChild(narrationMasterClip, 'AudioComponentChains');
      const narrationMasterAudioChainRef = narrationMasterAudioChains?.querySelector('AudioComponentChain');
      if (narrationMasterAudioChainRef) {
        narrationMasterAudioChainRef.setAttribute('ObjectRef', narrationMasterAudioComponentChain.getAttribute('ObjectID') || '');
      }
      const narrationMasterClipRefs = getPremiereDirectChild(narrationMasterClip, 'Clips')!;
      getPremiereDirectChild(narrationMasterClipRefs, 'Clip')!.setAttribute('ObjectRef', narrationMasterLibraryClip.getAttribute('ObjectID') || '');

      setPremiereChildText(doc, narrationLoggingInfo, 'ClipName', narrationFileName);
      setPremiereChildText(doc, narrationLoggingInfo, 'MediaOutPoint', String(narrationDurationTicks));

      setPremiereClipChildText(doc, narrationMasterLibraryClip, 'ClipID', premiereUuid());
      setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(narrationMasterLibraryClip), 'Source'), narrationMediaSource.getAttribute('ObjectID') || '');
      const narrationMasterSecondaryContents = getPremiereDirectChild(narrationMasterLibraryClip, 'SecondaryContents');
      const narrationMasterSecondaryItem = narrationMasterSecondaryContents?.querySelector('SecondaryContentItem');
      if (narrationMasterSecondaryItem) {
        narrationMasterSecondaryItem.setAttribute('ObjectRef', narrationMasterSecondaryContent.getAttribute('ObjectID') || '');
      }

      setPremiereObjectURef(getPremiereDirectChild(narrationMediaSource, 'MediaSource')!.querySelector('Media')!, narrationMedia.getAttribute('ObjectUID') || '');
      setPremiereChildText(doc, narrationMediaSource, 'OriginalDuration', String(narrationDurationTicks));

      setPremiereObjectRef(getPremiereDirectChild(narrationMasterSecondaryContent, 'Content')!, narrationMediaSource.getAttribute('ObjectID') || '');
      const narrationMediaUid = narrationMedia.getAttribute('ObjectUID') || '';
      if (narrationMediaUid) protectedMediaObjectUids.add(narrationMediaUid);
      setPremiereMediaFilePaths(doc, narrationMedia, narrationFileName);
      const mediaAudioStreamRef = ensurePremiereDirectChild(doc, narrationMedia, 'AudioStream');
      mediaAudioStreamRef.setAttribute('ObjectRef', narrationAudioStream.getAttribute('ObjectID') || '');

      setPremiereChildText(doc, narrationAudioStream, 'Duration', String(narrationDurationTicks));
      removePremiereChild(narrationAudioStream, 'ConformedAudioPath');
      removePremiereChild(narrationAudioStream, 'PeakFilePath');

      const narrationTrackItem = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_TRACK_ITEM_ID);
      const narrationComponentChain = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_COMPONENT_CHAIN_ID);
      const narrationSubClip = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_SUB_CLIP_ID);
      const narrationTimelineClip = getPremiereImportedObjectById(narrationGraph, PREMIERE_LEGACY_NARRATION_TIMELINE_CLIP_ID);

      const narrationClipTrackItem = getPremiereDirectChild(narrationTrackItem, 'ClipTrackItem')!;
      setPremiereObjectRef(getPremiereDirectChild(narrationClipTrackItem, 'ComponentOwner')!, narrationComponentChain.getAttribute('ObjectID') || '');
      setPremiereSubClipRef(narrationClipTrackItem, narrationSubClip.getAttribute('ObjectID') || '');
      removePremiereChild(narrationClipTrackItem, 'HeadTransition');
      removePremiereChild(narrationClipTrackItem, 'TailTransition');
      [PREMIERE_LEGACY_NARRATION_HEAD_TRANSITION_ID, PREMIERE_LEGACY_NARRATION_TAIL_TRANSITION_ID].forEach((ref) => {
        const transitionRoot = narrationGraph.objectBySourceId.get(ref);
        if (transitionRoot) cleanupRoots.add(transitionRoot);
      });
      setPremiereTrackItemTimes(narrationClipTrackItem, narrationStartTicks, narrationEndTicks);
      setPremiereTrackInternalId(narrationClipTrackItem, nextNumericId());
      setPremiereChildText(doc, narrationTrackItem, 'ID', premiereUuid());

      setPremiereObjectRef(getPremiereDirectChild(narrationSubClip, 'Clip')!, narrationTimelineClip.getAttribute('ObjectID') || '');
      setPremiereObjectURef(getPremiereDirectChild(narrationSubClip, 'MasterClip')!, narrationMasterClip.getAttribute('ObjectUID') || '');
      setPremiereChildText(doc, narrationSubClip, 'Name', narrationFileName);
      setPremiereObjectRef(getPremiereDirectChild(getPremiereClipBody(narrationTimelineClip), 'Source'), narrationMediaSource.getAttribute('ObjectID') || '');
      setPremiereClipChildText(doc, narrationTimelineClip, 'ClipID', premiereUuid());
      setPremiereClipChildText(doc, narrationTimelineClip, 'InPoint', '0');
      setPremiereClipChildText(doc, narrationTimelineClip, 'OutPoint', String(narrationDurationTicks));
      const secondaryContents = getPremiereDirectChild(narrationTimelineClip, 'SecondaryContents');
      const secondaryContentItem = secondaryContents?.querySelector('SecondaryContentItem');
      if (secondaryContentItem) {
        secondaryContentItem.setAttribute('ObjectRef', narrationTimelineSecondaryContent.getAttribute('ObjectID') || '');
      }
      setPremiereObjectRef(getPremiereDirectChild(narrationTimelineSecondaryContent, 'Content')!, narrationMediaSource.getAttribute('ObjectID') || '');
      narrationTrackItems.push(narrationTrackItem.getAttribute('ObjectID') || '');
    });

  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(videoTrack), videoTrackItems);
  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(sourceAudioTrack), sourceAudioTrackItems);
  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(narrationTrack), narrationTrackItems);
  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(dialogueCaptionTrack), dialogueCaptionTrackItems);
  replacePremiereTrackRefs(doc, getPremiereTrackClipItems(effectCaptionTrack), effectCaptionTrackItems);
  replacePremiereTrackRefs(doc, getPremiereTrackTransitions(sourceAudioTrack), []);
  replacePremiereTrackRefs(doc, getPremiereTrackTransitions(narrationTrack), []);
  replacePremiereTrackRefs(doc, getPremiereTrackTransitions(dialogueCaptionTrack), []);
  replacePremiereTrackRefs(doc, getPremiereTrackTransitions(effectCaptionTrack), []);
  removePremiereRootObjects(root, cleanupRoots);
  cleanupPremiereTemplatePlaceholders(
    root,
    sourceMasterClip.getAttribute('ObjectUID') || '',
    safeVideoName,
    [
      sourceMasterClip.getAttribute('ObjectUID') || '',
      sourceVideoMediaSource.getAttribute('ObjectID') || '',
      sourceAudioMediaSource.getAttribute('ObjectID') || '',
    ].filter(Boolean),
  );

  // [FIX] 환경 종속 경로/버전 전수 제거 — Premiere 버전·OS 무관하게 열리도록
  sanitizePremiereEnvironmentPaths(root, doc, protectedMediaObjectUids);

  const projectXml = serializePremiereProjectXml(doc);
  return transformPremiereProjectBytes(new TextEncoder().encode(projectXml), 'compress');
}

/** UUID v4 생성 (캡컷 프로젝트용) */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }).toUpperCase();
}

/** 초 → 마이크로초 (캡컷 시간 단위) */
function toUs(sec: number): number {
  return Math.round(sec * 1_000_000);
}

type CapCutDesktopPlatform = 'mac' | 'windows';

interface CapCutProjectScaffoldIds {
  draftFolderId: string;
  draftId: string;
  timelineId: string;
  timelineProjectId: string;
}

interface CapCutProjectPathInfo {
  draftFoldPath: string;
  draftRootPath: string;
  draftPathPlaceholder: string;
}

type CapCutWritableLike = {
  write: (data: Blob | BufferSource | string) => Promise<void>;
  close: () => Promise<void>;
};

type CapCutFileHandleLike = {
  createWritable: () => Promise<CapCutWritableLike>;
};

type CapCutDirectoryHandleLike = {
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<CapCutDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<CapCutFileHandleLike>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

const CAPCUT_MAC_INSTALLER_NAME = 'install_capcut_project.command';
const CAPCUT_WINDOWS_BATCH_INSTALLER_NAME = 'install_capcut_project.bat';
const CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME = 'install_capcut_project.ps1';
const CAPCUT_DIRECT_INSTALL_PATH_STORAGE_KEY = 'capcutDirectInstallDraftsRootPath';
const CAPCUT_DRAFT_EXTRA_BASE64 = 'aQUAAABpAAAAAGVpAAAAAAIAAAB7fXpCe7g=';
const CAPCUT_CRYPTO_KEY_STORE_BASE64 = 'AAAAsngBLYw9DoIwHMX/Ytw5iJVAwIIjpcbZuJNam9gotIGSSOJVjKMbg2dwY3H0FB7BWIzT+8jvvTsAjA+ireE2OB+uViZc6r2octuDazNMH9Gzfy+CDeq6T/+6uH/AtFrAyAKO0kaqkh1zrkojTubXgtNUElbWnLW3FrVqKi5qj6tiK0s2DLyMUhwTnCKckRiFy3mA4hgHKKJpkvjE9wnFOWt2Us2KkA2fX7XXM/Y=';

function detectCapCutDesktopPlatform(): CapCutDesktopPlatform {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = String(
      nav.userAgentData?.platform
      || nav.platform
      || nav.userAgent
      || '',
    ).toLowerCase();
    if (platform.includes('win')) return 'windows';
  }
  return 'mac';
}

/** CapCut 프로젝트 루트 경로 */
function getCapCutDraftRoot(): string {
  return '/com.lveditor.draft';
}

function getCapCutDraftFolderPath(draftFolderId: string): string {
  return `${getCapCutDraftRoot()}/${draftFolderId}`;
}

function buildCapCutPathInfo(draftFolderId: string): CapCutProjectPathInfo {
  return {
    draftFoldPath: getCapCutDraftFolderPath(draftFolderId),
    draftRootPath: getCapCutDraftRoot(),
    draftPathPlaceholder: `##_draftpath_placeholder_${draftFolderId}_##`,
  };
}

function buildCapCutDraftSettings(
  nowSec: number,
  width?: number,
  height?: number,
  platform: CapCutDesktopPlatform = detectCapCutDesktopPlatform(),
  realEditKeys = 1,
  realEditSeconds = 0,
): string {
  return [
    '[General]',
    `cloud_last_modify_platform=${platform}`,
    ...(width && height ? [`custom_ratio_height=${height}`, `custom_ratio_width=${width}`] : []),
    `draft_create_time=${nowSec}`,
    `draft_last_edit_time=${nowSec}`,
    `real_edit_keys=${Math.max(1, Math.round(realEditKeys))}`,
    `real_edit_seconds=${Math.max(0, Math.round(realEditSeconds))}`,
    'timeline_use_close_gap=true',
    'timeline_use_split_scene=true',
    '',
  ].join('\n');
}

function buildCapCutPlatformInfo(platform: CapCutDesktopPlatform = detectCapCutDesktopPlatform()): {
  app_id: number;
  app_source: string;
  app_version: string;
  device_id: string;
  hard_disk_id: string;
  mac_address: string;
  os: string;
  os_version: string;
} {
  return {
    app_id: 359289,
    app_source: 'cc',
    app_version: '8.1.1',
    device_id: '',
    hard_disk_id: '',
    mac_address: '',
    os: platform,
    os_version: '',
  };
}

function buildCapCutDraftMetaMaterials(): Array<{ type: number; value: never[] }> {
  return [
    { type: 0, value: [] },
    { type: 1, value: [] },
    { type: 2, value: [] },
    { type: 3, value: [] },
    { type: 6, value: [] },
    { type: 7, value: [] },
    { type: 8, value: [] },
  ];
}

function buildCapCutDraftMetaInfo(params: {
  draftFolderId: string;
  draftId: string;
  title: string;
  tmDuration: number;
  tmDraftModifiedUs: number;
  draftTimelineMaterialsSize?: number;
  draftCover?: string;
}): string {
  const {
    draftFolderId,
    draftId,
    title,
    tmDuration,
    tmDraftModifiedUs,
    draftTimelineMaterialsSize = 0,
    draftCover = 'draft_cover.jpg',
  } = params;
  const pathInfo = buildCapCutPathInfo(draftFolderId);

  return JSON.stringify({
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: '',
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: draftCover,
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: pathInfo.draftFoldPath,
    draft_id: draftId,
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_is_web_article_video: false,
    draft_materials: buildCapCutDraftMetaMaterials(),
    draft_materials_copy_folder: `${pathInfo.draftPathPlaceholder}/materials`,
    draft_materials_copied_info: [],
    draft_name: title,
    draft_need_rename_folder: false,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: pathInfo.draftRootPath,
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: draftTimelineMaterialsSize,
    draft_type: '',
    draft_web_article_video_enter_from: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: tmDraftModifiedUs,
    tm_draft_modified: tmDraftModifiedUs,
    tm_draft_removed: 0,
    tm_duration: tmDuration,
  });
}

function decodeCapCutTemplateBinary(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function buildCapCutDraftCoverBlob(width = 320, height = 180): Promise<Blob> {
  if (typeof document === 'undefined') {
    return new Blob([], { type: 'image/jpeg' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#374151');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.84);
  });
  return blob || new Blob([], { type: 'image/jpeg' });
}

function buildCapCutAttachmentScriptVideo(): string {
  return JSON.stringify({
    script_video: {
      attachment_valid: false,
      language: '',
      overdub_recover: [],
      overdub_sentence_ids: [],
      parts: [],
      sync_subtitle: false,
      translate_segments: [],
      translate_type: '',
      version: '1.0.0',
    },
  });
}

function buildCapCutAttachmentActionScene(): string {
  return JSON.stringify({
    action_scene: {
      removed_segments: [],
      segment_infos: [],
    },
  });
}

function buildCapCutCooperateCreate(): string {
  return JSON.stringify({
    roomInfo: {
      room_id: '',
    },
  });
}

function buildCapCutOpaqueDraftExtra(): Uint8Array {
  return decodeCapCutTemplateBinary(CAPCUT_DRAFT_EXTRA_BASE64);
}

function buildCapCutOpaqueCryptoKeyStore(): Uint8Array {
  return decodeCapCutTemplateBinary(CAPCUT_CRYPTO_KEY_STORE_BASE64);
}

function buildCapCutCanvasMaterial(id: string): Record<string, unknown> {
  return {
    album_image: '',
    blur: 0.0,
    color: '',
    id,
    image: '',
    image_id: '',
    image_name: '',
    source_platform: 0,
    team_id: '',
    type: 'canvas_color',
  };
}

function buildCapCutMaterialAnimation(id: string): Record<string, unknown> {
  return {
    animations: [],
    id,
    multi_language_current: 'none',
    type: 'sticker_animation',
  };
}

function buildCapCutContainedMaterialPath(
  draftFolderId: string,
  category: 'audio' | 'image' | 'video',
  fileName: string,
): string {
  return `${buildCapCutPathInfo(draftFolderId).draftPathPlaceholder}/materials/${category}/${fileName}`;
}

function hasTimeRangeOverlap(
  startSec: number,
  endSec: number,
  ranges: Array<{ startSec: number; endSec: number }>,
): boolean {
  return ranges.some((range) => range.endSec > startSec && range.startSec < endSec);
}

function getAvailableTimeRanges(
  startSec: number,
  endSec: number,
  blockedRanges: Array<{ startSec: number; endSec: number }>,
): Array<{ startSec: number; endSec: number }> {
  if (endSec <= startSec) return [];

  const overlaps = blockedRanges
    .map((range) => ({
      startSec: Math.max(startSec, range.startSec),
      endSec: Math.min(endSec, range.endSec),
    }))
    .filter((range) => range.endSec > range.startSec)
    .sort((a, b) => (a.startSec - b.startSec) || (a.endSec - b.endSec));

  if (overlaps.length === 0) {
    return [{ startSec, endSec }];
  }

  const result: Array<{ startSec: number; endSec: number }> = [];
  let cursor = startSec;

  overlaps.forEach((range) => {
    if (range.startSec > cursor) {
      result.push({ startSec: cursor, endSec: range.startSec });
    }
    cursor = Math.max(cursor, range.endSec);
  });

  if (cursor < endSec) {
    result.push({ startSec: cursor, endSec });
  }

  return result.filter((range) => range.endSec - range.startSec > 0.001);
}

function buildCapCutAudioMaterial(params: {
  id: string;
  duration: number;
  fileName: string;
  path: string;
  videoId?: string;
}): Record<string, unknown> {
  const { id, duration, fileName, path, videoId = '' } = params;
  return {
    ai_music_enter_from: '',
    ai_music_generate_scene: 0,
    ai_music_type: 0,
    aigc_history_id: '',
    aigc_item_id: '',
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 1,
    cloned_model_type: '',
    copyright_limit_type: 'none',
    duration,
    effect_id: '',
    formula_id: '',
    id,
    intensifies_path: '',
    is_ai_clone_tone: false,
    is_ai_clone_tone_post: false,
    is_text_edit_overdub: false,
    is_ugc: false,
    local_material_id: '',
    lyric_type: 0,
    mock_tone_speaker: '',
    moyin_emotion: '',
    music_id: '',
    name: fileName,
    path,
    pgc_id: '',
    pgc_name: '',
    query: '',
    request_id: '',
    resource_id: '',
    search_id: '',
    similiar_music_info: { original_song_id: '', original_song_name: '' },
    sound_separate_type: '',
    source_from: '',
    source_platform: 0,
    team_id: '',
    text_id: '',
    third_resource_id: '',
    tone_category_id: '',
    tone_category_name: '',
    tone_effect_id: '',
    tone_effect_name: '',
    tone_emotion_name_key: '',
    tone_emotion_role: '',
    tone_emotion_scale: 0.0,
    tone_emotion_selection: '',
    tone_emotion_style: '',
    tone_platform: '',
    tone_second_category_id: '',
    tone_second_category_name: '',
    tone_speaker: '',
    tone_type: '',
    tts_benefit_info: { benefit_amount: -1, benefit_log_extra: '', benefit_log_id: '', benefit_type: 'none' },
    tts_generate_scene: '',
    tts_task_id: '',
    type: 'extract_music',
    unique_id: '',
    video_id: videoId,
    wave_points: [],
  };
}

function buildCapCutMacInstallerScript(projectFolderId: string): string {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    '',
    `PROJECT_ID="${projectFolderId}"`,
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'TARGET_ROOT="$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft"',
    'SOURCE_PROJECT_PATH="$SCRIPT_DIR/$PROJECT_ID"',
    '',
    'if [ ! -d "$SOURCE_PROJECT_PATH" ] && [ -f "$SCRIPT_DIR/draft_content.json" ]; then',
    '  SOURCE_PROJECT_PATH="$SCRIPT_DIR"',
    'fi',
    '',
    'if [ ! -f "$SOURCE_PROJECT_PATH/draft_content.json" ]; then',
    '  echo "CapCut 프로젝트 폴더를 찾지 못했습니다: $SOURCE_PROJECT_PATH"',
    '  if [ -t 0 ]; then read -r -p "Enter를 누르면 종료합니다." _; fi',
    '  exit 1',
    'fi',
    '',
    'TARGET_PROJECT_PATH="$TARGET_ROOT/$PROJECT_ID"',
    'mkdir -p "$TARGET_ROOT"',
    '',
    'if [ "$SOURCE_PROJECT_PATH" != "$TARGET_PROJECT_PATH" ]; then',
    '  rm -rf "$TARGET_PROJECT_PATH"',
    '  cp -R "$SOURCE_PROJECT_PATH" "$TARGET_PROJECT_PATH"',
    'fi',
    '',
    'export PLACEHOLDER="##_draftpath_placeholder_${PROJECT_ID}_##"',
    'export TARGET_PROJECT_PATH',
    'export TARGET_ROOT',
    '',
    'find "$TARGET_PROJECT_PATH" -type f \\( -name "draft_content.json" -o -name "draft_info.json" -o -name "draft_meta_info.json" -o -path "*/Timelines/*/draft_info.json" \\) -print0 | while IFS= read -r -d "" file; do',
    "  perl -0pi -e '",
    '    s#\\Q$ENV{PLACEHOLDER}\\E#$ENV{TARGET_PROJECT_PATH}#g;',
    '    s#"path":"materials/#"path":"$ENV{TARGET_PROJECT_PATH}/materials/#g;',
    '    s#"media_path":"materials/#"media_path":"$ENV{TARGET_PROJECT_PATH}/materials/#g;',
    '    s#"draft_fold_path":"[^"]*"#"draft_fold_path":"$ENV{TARGET_PROJECT_PATH}"#g;',
    '    s#"draft_materials_copy_folder":"[^"]*"#"draft_materials_copy_folder":"$ENV{TARGET_PROJECT_PATH}/materials"#g;',
    '    s#"draft_root_path":"[^"]*"#"draft_root_path":"$ENV{TARGET_ROOT}"#g;',
    "  ' \"$file\"",
    'done',
    '',
    'open -a "CapCut" "$TARGET_PROJECT_PATH" || true',
    'echo ""',
    'echo "CapCut 프로젝트 설치 완료: $TARGET_PROJECT_PATH"',
    'if [ -t 0 ]; then read -r -p "Enter를 누르면 종료합니다." _; fi',
    '',
  ].join('\n');
}

function buildCapCutWindowsPowerShellInstallerScript(projectFolderId: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$ProjectId = '${projectFolderId}'`,
    '$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    "$TargetRoot = Join-Path $env:LOCALAPPDATA 'CapCut\\User Data\\Projects\\com.lveditor.draft'",
    '$SourceProjectPath = Join-Path $ScriptDir $ProjectId',
    '',
    "if (-not (Test-Path $SourceProjectPath) -and (Test-Path (Join-Path $ScriptDir 'draft_content.json'))) {",
    '  $SourceProjectPath = $ScriptDir',
    '}',
    '',
    "if (-not (Test-Path (Join-Path $SourceProjectPath 'draft_content.json'))) {",
    "  throw \"CapCut 프로젝트 폴더를 찾지 못했습니다: $SourceProjectPath\"",
    '}',
    '',
    '$TargetProjectPath = Join-Path $TargetRoot $ProjectId',
    'New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null',
    '',
    'if ($SourceProjectPath -ne $TargetProjectPath) {',
    '  Remove-Item $TargetProjectPath -Recurse -Force -ErrorAction SilentlyContinue',
    '  Copy-Item $SourceProjectPath $TargetProjectPath -Recurse -Force',
    '}',
    '',
    '$Placeholder = "##_draftpath_placeholder_$ProjectId_##"',
    "$TargetProjectPathJson = $TargetProjectPath -replace '\\\\', '/'",
    "$TargetRootJson = $TargetRoot -replace '\\\\', '/'",
    '',
    '$JsonFiles = Get-ChildItem -Path $TargetProjectPath -File -Recurse | Where-Object {',
    "  $_.Name -in @('draft_content.json', 'draft_info.json', 'draft_meta_info.json') -or",
    "  $_.FullName -like '*\\Timelines\\*\\draft_info.json'",
    '}',
    '',
    'foreach ($file in $JsonFiles) {',
    '  $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8',
    '  $content = $content.Replace($Placeholder, $TargetProjectPathJson)',
    "  $content = $content.Replace('\"path\":\"materials/', '\"path\":\"' + $TargetProjectPathJson + '/materials/')",
    "  $content = $content.Replace('\"media_path\":\"materials/', '\"media_path\":\"' + $TargetProjectPathJson + '/materials/')",
    "  $content = [regex]::Replace($content, '\"draft_fold_path\":\"[^\"]*\"', '\"draft_fold_path\":\"' + $TargetProjectPathJson + '\"')",
    "  $content = [regex]::Replace($content, '\"draft_materials_copy_folder\":\"[^\"]*\"', '\"draft_materials_copy_folder\":\"' + $TargetProjectPathJson + '/materials\"')",
    "  $content = [regex]::Replace($content, '\"draft_root_path\":\"[^\"]*\"', '\"draft_root_path\":\"' + $TargetRootJson + '\"')",
    '  Set-Content -Path $file.FullName -Value $content -Encoding UTF8',
    '}',
    '',
    '$CapCutCandidates = @(',
    "  (Join-Path $env:LOCALAPPDATA 'CapCut\\CapCut.exe'),",
    "  (Join-Path $env:ProgramFiles 'CapCut\\CapCut.exe'),",
    "  (Join-Path ${env:ProgramFiles(x86)} 'CapCut\\CapCut.exe')",
    ') | Where-Object { $_ -and (Test-Path $_) }',
    '',
    'if ($CapCutCandidates.Count -gt 0) {',
    '  Start-Process -FilePath $CapCutCandidates[0] | Out-Null',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "CapCut 프로젝트 설치 완료: $TargetProjectPath"',
    'if ([Environment]::UserInteractive) {',
    '  Read-Host "Enter를 누르면 종료합니다." | Out-Null',
    '}',
    '',
  ].join('\r\n');
}

function buildCapCutWindowsBatchInstallerScript(): string {
  return [
    '@echo off',
    'setlocal',
    `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME}"`,
    'if errorlevel 1 pause',
    '',
  ].join('\r\n');
}

function getCapCutDirectInstallPathExample(): string {
  return detectCapCutDesktopPlatform() === 'windows'
    ? 'C:\\Users\\<사용자이름>\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft'
    : '/Users/<사용자이름>/Movies/CapCut/User Data/Projects/com.lveditor.draft';
}

function getStoredCapCutDirectInstallPath(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(CAPCUT_DIRECT_INSTALL_PATH_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

function setStoredCapCutDirectInstallPath(pathValue: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CAPCUT_DIRECT_INSTALL_PATH_STORAGE_KEY, pathValue);
  } catch {
    // Ignore storage failures and continue with the current session only.
  }
}

function normalizeCapCutDraftsRootPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error('CapCut 프로젝트 폴더 경로가 비어 있습니다.');
  }
  // [FIX #702] 환경변수 포함 시 구체적 안내 메시지
  if (/%[A-Z_]+%/i.test(trimmed)) {
    const envMatch = trimmed.match(/%([A-Z_]+)%/i);
    const envName = envMatch?.[1] || '';
    const hint = envName.toUpperCase() === 'LOCALAPPDATA'
      ? '예시: C:\\Users\\<사용자이름>\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\n\n찾는 법: Windows 탐색기 주소창에 %LOCALAPPDATA% 입력 → 주소창에 나타나는 실제 경로를 복사하세요.'
      : envName.toUpperCase() === 'USERPROFILE'
      ? '예시: C:\\Users\\<사용자이름>\\...\n\n찾는 법: Windows 탐색기 주소창에 %USERPROFILE% 입력 → 실제 경로 복사'
      : '환경 변수를 실제 경로로 변환해주세요.';
    throw new Error(`웹 앱에서는 %${envName}% 환경변수를 자동 변환할 수 없어요.\n실제 절대경로를 직접 입력해주세요.\n\n${hint}`);
  }
  if (/^(~|\$[A-Z_]+)/i.test(trimmed)) {
    throw new Error('~ 나 환경 변수 대신 실제 절대경로를 입력해주세요.\n\nMac 예시: /Users/<사용자이름>/Movies/CapCut/User Data/Projects/com.lveditor.draft');
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+$/g, '');
  const isAbsoluteWindows = /^[A-Za-z]:\//.test(normalized);
  const isAbsolutePosix = normalized.startsWith('/');

  if (!isAbsoluteWindows && !isAbsolutePosix) {
    throw new Error('CapCut 프로젝트 폴더의 실제 절대경로를 입력해주세요.\n\nWindows 예시: C:\\Users\\<이름>\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\nMac 예시: /Users/<이름>/Movies/CapCut/User Data/Projects/com.lveditor.draft');
  }
  if (!normalized.endsWith('/com.lveditor.draft')) {
    throw new Error('경로 끝이 com.lveditor.draft로 끝나야 합니다.\n\nCapCut 프로젝트 폴더(com.lveditor.draft)까지의 전체 경로를 입력해주세요.');
  }
  return normalized;
}

function isCapCutDraftJsonPath(relativePath: string): boolean {
  return relativePath === 'draft_content.json'
    || relativePath === 'draft_info.json'
    || relativePath === 'draft_meta_info.json'
    || /^Timelines\/[^/]+\/draft_info\.json$/.test(relativePath);
}

function patchCapCutDraftJsonPaths(jsonText: string, draftsRootPath: string, projectId: string): string {
  const targetRoot = normalizeCapCutDraftsRootPath(draftsRootPath);
  const targetProjectPath = `${targetRoot}/${projectId}`;
  return jsonText
    .split(`##_draftpath_placeholder_${projectId}_##`).join(targetProjectPath)
    .replace(/"path":"materials\//g, `"path":"${targetProjectPath}/materials/`)
    .replace(/"media_path":"materials\//g, `"media_path":"${targetProjectPath}/materials/`)
    .replace(/"draft_fold_path":"[^"]*"/g, `"draft_fold_path":"${targetProjectPath}"`)
    .replace(/"draft_materials_copy_folder":"[^"]*"/g, `"draft_materials_copy_folder":"${targetProjectPath}/materials"`)
    .replace(/"draft_root_path":"[^"]*"/g, `"draft_root_path":"${targetRoot}"`);
}

async function writeCapCutDirectoryEntry(
  rootHandle: CapCutDirectoryHandleLike,
  relativePath: string,
  content: string | Blob,
): Promise<void> {
  const pathParts = relativePath.split('/').filter(Boolean);
  if (pathParts.length === 0) return;

  let currentHandle = rootHandle;
  for (const segment of pathParts.slice(0, -1)) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  const fileName = pathParts[pathParts.length - 1];
  const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export function isCapCutDirectInstallSupported(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  return typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export function getCapCutManualInstallHint(): string {
  return `압축을 푼 뒤 Mac은 "${CAPCUT_MAC_INSTALLER_NAME}", Windows는 "${CAPCUT_WINDOWS_BATCH_INSTALLER_NAME}"를 실행해주세요.`;
}

export async function beginCapCutDirectInstallSelection(): Promise<{
  draftsRootHandle: CapCutDirectoryHandleLike;
  draftsRootPath: string;
} | null> {
  if (!isCapCutDirectInstallSupported() || typeof window === 'undefined') {
    return null;
  }

  // [FIX #665/#657] showDirectoryPicker를 가장 먼저 호출해야 user gesture 컨텍스트가 유지됨
  // confirm/prompt를 먼저 호출하면 브라우저가 제스처 만료로 showDirectoryPicker를 차단함
  let draftsRootHandle: FileSystemDirectoryHandle | undefined;
  try {
    draftsRootHandle = await (window as Window & {
      showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker?.({
      id: 'capcut-drafts-root',
      mode: 'readwrite',
    });
  } catch (error) {
    // AbortError: 사용자가 폴더 선택 취소
    // SecurityError / NotAllowedError: user gesture 만료 또는 권한 부족
    // [FIX #699] 모든 DOMException을 graceful하게 처리하여 ZIP 폴백
    if (error instanceof DOMException) {
      return null;
    }
    throw error;
  }

  if (!draftsRootHandle) {
    return null;
  }

  if (draftsRootHandle.name !== 'com.lveditor.draft') {
    window.alert('CapCut 프로젝트 폴더(com.lveditor.draft)를 선택해주세요.\n다시 시도하면 올바른 폴더를 선택해주세요.');
    return null;
  }

  // 폴더 선택 완료 후 경로 확인 (이 시점에서는 제스처 불필요)
  const savedPath = getStoredCapCutDirectInstallPath();
  const draftsRootPath = window.prompt([
    'CapCut 프로젝트 폴더의 절대경로를 확인해주세요.',
    '폴더 선택창 보안 제한 때문에 이 경로 문자열은 한 번 저장해둬야 미디어 절대경로를 정확히 패치할 수 있습니다.',
    '',
    `예시: ${getCapCutDirectInstallPathExample()}`,
  ].join('\n'), savedPath || getCapCutDirectInstallPathExample());

  if (draftsRootPath === null) {
    return null;
  }

  const normalizedRootPath = normalizeCapCutDraftsRootPath(draftsRootPath);
  setStoredCapCutDirectInstallPath(normalizedRootPath);
  return {
    draftsRootHandle: draftsRootHandle as unknown as CapCutDirectoryHandleLike,
    draftsRootPath: normalizedRootPath,
  };
}

export async function installCapCutZipToDirectory(params: {
  zipBlob: Blob;
  draftsRootHandle: CapCutDirectoryHandleLike;
  draftsRootPath: string;
}): Promise<{ projectId: string; targetProjectPath: string }> {
  const { zipBlob, draftsRootHandle, draftsRootPath } = params;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const draftEntryName = Object.keys(zip.files).find((entryName) => entryName.endsWith('/draft_content.json'));

  if (!draftEntryName) {
    throw new Error('CapCut 프로젝트 파일을 ZIP에서 찾지 못했습니다.');
  }

  const projectId = draftEntryName.split('/')[0] || '';
  if (!projectId) {
    throw new Error('CapCut projectId를 확인할 수 없습니다.');
  }

  const normalizedRootPath = normalizeCapCutDraftsRootPath(draftsRootPath);
  const targetProjectPath = `${normalizedRootPath}/${projectId}`;

  if (typeof draftsRootHandle.removeEntry === 'function') {
    await draftsRootHandle.removeEntry(projectId, { recursive: true }).catch(() => {});
  }

  const projectRootHandle = await draftsRootHandle.getDirectoryHandle(projectId, { create: true });
  const projectEntries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith(`${projectId}/`));

  for (const entry of projectEntries) {
    const relativePath = entry.name.slice(projectId.length + 1);
    const content = isCapCutDraftJsonPath(relativePath)
      ? patchCapCutDraftJsonPaths(await entry.async('string'), normalizedRootPath, projectId)
      : await entry.async('blob');
    await writeCapCutDirectoryEntry(projectRootHandle, relativePath, content);
  }

  return { projectId, targetProjectPath };
}

function buildCapCutSegmentShell(params: {
  clip: Record<string, unknown>;
  commonKeyframes: unknown[];
  enableAdjust: boolean;
  extraMaterialRefs: string[];
  materialId: string;
  renderIndex: number;
  sourceDurationUs: number;
  sourceStartUs: number;
  speed: number;
  targetDurationUs: number;
  targetStartUs: number;
  trackRenderIndex: number;
}): Record<string, unknown> {
  const {
    clip,
    commonKeyframes,
    enableAdjust,
    extraMaterialRefs,
    materialId,
    renderIndex,
    sourceDurationUs,
    sourceStartUs,
    speed,
    targetDurationUs,
    targetStartUs,
    trackRenderIndex,
  } = params;

  return {
    caption_info: null,
    cartoon: false,
    clip,
    color_correct_alg_result: '',
    common_keyframes: commonKeyframes,
    desc: '',
    digital_human_template_group_id: '',
    enable_adjust: enableAdjust,
    enable_adjust_mask: false,
    enable_color_adjust_pro: false,
    enable_color_correct_adjust: false,
    enable_color_curves: enableAdjust,
    enable_color_match_adjust: false,
    enable_color_wheels: enableAdjust,
    enable_hsl: false,
    enable_hsl_curves: enableAdjust,
    enable_lut: enableAdjust,
    enable_mask_shadow: false,
    enable_mask_stroke: false,
    enable_smart_color_adjust: false,
    enable_video_mask: enableAdjust,
    extra_material_refs: extraMaterialRefs,
    group_id: '',
    hdr_settings: enableAdjust ? { intensity: 1.0, mode: 1, nits: 1000 } : null,
    id: uuid(),
    intensifies_audio: false,
    is_loop: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    lyric_keyframes: null,
    material_id: materialId,
    raw_segment_id: '',
    render_index: renderIndex,
    render_timerange: { duration: 0, start: 0 },
    responsive_layout: {
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: '',
      vertical_pos_layout: 0,
    },
    reverse: false,
    source: 'segmentsourcenormal',
    source_timerange: {
      duration: sourceDurationUs,
      start: sourceStartUs,
    },
    speed,
    state: 0,
    target_timerange: {
      duration: targetDurationUs,
      start: targetStartUs,
    },
    template_id: '',
    template_scene: 'default',
    track_attribute: 0,
    track_render_index: trackRenderIndex,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };
}

function buildCapCutKeyValue(entries: Array<{ segmentId: string; materialName: string }>): string {
  const keyValueEntries = Object.fromEntries(entries.map(({ segmentId, materialName }) => [
    segmentId,
    {
      filter_category: '',
      filter_detail: '',
      is_brand: 0,
      is_from_artist_shop: 0,
      is_vip: '0',
      keywordSource: '',
      materialCategory: 'media',
      materialId: '',
      materialName,
      materialSubcategory: 'local',
      materialSubcategoryId: '',
      materialThirdcategory: '가져오기',
      materialThirdcategoryId: '',
      material_copyright: '',
      material_is_purchased: '',
      rank: '2',
      rec_id: '',
      requestId: '',
      role: '',
      searchId: '',
      searchKeyword: '',
      segmentId,
      team_id: '',
      textTemplateVersion: '',
    },
  ]));

  return JSON.stringify(keyValueEntries);
}

function buildCapCutEmptyMaterialBuckets(): Record<string, never[]> {
  return {
    ai_translates: [],
    audio_balances: [],
    audio_effects: [],
    audio_fades: [],
    audio_pannings: [],
    audio_pitch_shifts: [],
    audio_track_indexes: [],
    audios: [],
    beats: [],
    canvases: [],
    chromas: [],
    color_curves: [],
    common_mask: [],
    digital_human_model_dressing: [],
    digital_humans: [],
    drafts: [],
    effects: [],
    flowers: [],
    green_screens: [],
    handwrites: [],
    head_animations: [],
    hsl: [],
    hsl_curves: [],
    images: [],
    log_color_wheels: [],
    loudnesses: [],
    manual_beautys: [],
    manual_deformations: [],
    material_animations: [],
    material_colors: [],
    multi_language_refs: [],
    placeholder_infos: [],
    placeholders: [],
    plugin_effects: [],
    primary_color_wheels: [],
    realtime_denoises: [],
    shapes: [],
    smart_crops: [],
    smart_relayouts: [],
    smart_relights: [],
    sound_channel_mappings: [],
    speeds: [],
    stickers: [],
    tail_animations: [],
    tail_leaders: [],
    text_templates: [],
    texts: [],
    time_marks: [],
    transitions: [],
    video_effects: [],
    video_radius: [],
    video_shadows: [],
    video_strokes: [],
    video_trackings: [],
    videos: [],
    vocal_beautifys: [],
    vocal_separations: [],
  };
}

function buildCapCutTimelineProject(timelineProjectId: string, mainTimelineId: string, nowUs: number): string {
  return JSON.stringify({
    config: {
      color_space: -1,
      render_index_track_mode_on: false,
      use_float_render: false,
    },
    create_time: nowUs,
    id: timelineProjectId,
    main_timeline_id: mainTimelineId,
    timelines: [
      {
        create_time: nowUs,
        id: mainTimelineId,
        is_marked_delete: false,
        name: '타임라인 01',
        update_time: nowUs,
      },
    ],
    update_time: nowUs,
    version: 0,
  });
}

function buildCapCutAttachmentPcTimeline(): string {
  return JSON.stringify({
    reference_lines_config: {
      horizontal_lines: [],
      is_lock: false,
      is_visible: false,
      vertical_lines: [],
    },
    safe_area_type: 0,
  });
}

function buildCapCutAttachmentPcCommon(): string {
  return JSON.stringify({
    ai_packaging_infos: [],
    ai_packaging_report_info: {
      caption_id_list: [],
      commercial_material: '',
      material_source: '',
      method: '',
      page_from: '',
      style: '',
      task_id: '',
      text_style: '',
      tos_id: '',
      video_category: '',
    },
    broll: {
      ai_packaging_infos: [],
      ai_packaging_report_info: {
        caption_id_list: [],
        commercial_material: '',
        material_source: '',
        method: '',
        page_from: '',
        style: '',
        task_id: '',
        text_style: '',
        tos_id: '',
        video_category: '',
      },
    },
    commercial_music_category_ids: [],
    pc_feature_flag: 0,
    recognize_tasks: [],
    reference_lines_config: {
      horizontal_lines: [],
      is_lock: false,
      is_visible: false,
      vertical_lines: [],
    },
    safe_area_type: 0,
    template_item_infos: [],
    unlock_template_ids: [],
  });
}

function buildCapCutAttachmentEditing(): string {
  return JSON.stringify({
    editing_draft: {
      ai_remove_filter_words: { enter_source: '', right_id: '' },
      ai_shorts_info: { report_params: '', type: 0 },
      crop_info_extra: { crop_mirror_type: 0, crop_rotate: 0.0, crop_rotate_total: 0.0 },
      digital_human_template_to_video_info: { has_upload_material: false, template_type: 0 },
      draft_used_recommend_function: '',
      edit_type: 0,
      eye_correct_enabled_multi_face_time: 0,
      has_adjusted_render_layer: false,
      image_ai_chat_info: {
        before_chat_edit: false,
        draft_modify_time: 0,
        message_id: '',
        model_name: '',
        need_restore: false,
        picture_id: '',
        prompt_from: '',
        sugs_info: [],
      },
      is_open_expand_player: false,
      is_template_text_ai_generate: false,
      is_use_adjust: false,
      is_use_ai_expand: false,
      is_use_ai_remove: false,
      is_use_audio_separation: false,
      is_use_chroma_key: false,
      is_use_curve_speed: false,
      is_use_digital_human: false,
      is_use_edit_multi_camera: false,
      is_use_lip_sync: false,
      is_use_lock_object: false,
      is_use_loudness_unify: true,
      is_use_noise_reduction: false,
      is_use_one_click_beauty: false,
      is_use_one_click_ultra_hd: false,
      is_use_retouch_face: false,
      is_use_smart_adjust_color: false,
      is_use_smart_body_beautify: false,
      is_use_smart_motion: false,
      is_use_subtitle_recognition: false,
      is_use_text_to_audio: false,
      material_edit_session: { material_edit_info: [], session_id: '', session_time: 0 },
      paste_segment_list: [],
      profile_entrance_type: '',
      publish_enter_from: '',
      publish_type: '',
      single_function_type: 0,
      text_convert_case_types: [],
      version: '1.0.0',
      video_recording_create_draft: '',
    },
  });
}

function addCapCutMainTimelineMirror(params: {
  zip: { file: (path: string, data: string | Blob | Uint8Array) => unknown };
  projectFolderId: string;
  mainTimelineId: string;
  draftJson: string;
  attachmentPcCommonJson: string;
  attachmentEditingJson: string;
  attachmentPcTimelineJson: string;
  attachmentScriptVideoJson: string;
  attachmentActionSceneJson: string;
  draftExtra: Uint8Array;
  draftCover: Blob;
}): void {
  const {
    zip,
    projectFolderId,
    mainTimelineId,
    draftJson,
    attachmentPcCommonJson,
    attachmentEditingJson,
    attachmentPcTimelineJson,
    attachmentScriptVideoJson,
    attachmentActionSceneJson,
    draftExtra,
    draftCover,
  } = params;
  const timelineBase = `${projectFolderId}/Timelines/${mainTimelineId}`;

  zip.file(`${timelineBase}/draft_info.json`, draftJson);
  zip.file(`${timelineBase}/attachment_pc_common.json`, attachmentPcCommonJson);
  zip.file(`${timelineBase}/attachment_editing.json`, attachmentEditingJson);
  zip.file(`${timelineBase}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
  zip.file(`${timelineBase}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
  zip.file(`${timelineBase}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
  zip.file(`${timelineBase}/draft.extra`, draftExtra);
  zip.file(`${timelineBase}/draft_cover.jpg`, draftCover);
  zip.file(`${timelineBase}/template.tmp`, '');
  zip.file(`${timelineBase}/template-2.tmp`, '');
}

function addCapCutDesktopInstallerFiles(params: {
  zip: { file: (path: string, data: string | Blob | Uint8Array, options?: Record<string, unknown>) => unknown };
  projectFolderId: string;
}): void {
  const { zip, projectFolderId } = params;

  zip.file(CAPCUT_MAC_INSTALLER_NAME, buildCapCutMacInstallerScript(projectFolderId), {
    unixPermissions: '755',
  });
  zip.file(CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME, buildCapCutWindowsPowerShellInstallerScript(projectFolderId));
  zip.file(CAPCUT_WINDOWS_BATCH_INSTALLER_NAME, buildCapCutWindowsBatchInstallerScript());
}

function buildCapCutTimelineLayout(mainTimelineId: string): string {
  return JSON.stringify({
    dockItems: [
      {
        dockIndex: 0,
        ratio: 1,
        timelineIds: [mainTimelineId],
        timelineNames: ['타임라인 01'],
      },
    ],
    layoutOrientation: 1,
  });
}

function buildCapCutDraftVirtualStore(): string {
  return JSON.stringify({
    draft_materials: [],
    draft_virtual_store: [
      {
        type: 0,
        value: [{
          creation_time: 0,
          display_name: '',
          filter_type: 0,
          id: '',
          import_time: 0,
          import_time_us: 0,
          sort_sub_type: 0,
          sort_type: 0,
          subdraft_filter_type: 0,
        }],
      },
      { type: 1, value: [] },
      { type: 2, value: [] },
    ],
  });
}

function buildCapCutDraftBizConfig(mainTimelineId: string, trackIds: string[]): string {
  const trackSettings = Object.fromEntries(trackIds.map((trackId) => [trackId, { height: 74 }]));
  return JSON.stringify({
    timeline_settings: {
      [mainTimelineId]: {
        linkage_enabled: true,
      },
    },
    track_settings: trackSettings,
  });
}

function buildCapCutDraftAgencyConfig(): string {
  return JSON.stringify({
    is_auto_agency_enabled: false,
    is_auto_agency_popup: false,
    is_single_agency_mode: false,
    marterials: null,
    use_converter: false,
    video_resolution: 720,
  });
}

function buildCapCutPerformanceOptInfo(): string {
  return JSON.stringify({
    manual_cancle_precombine_segs: null,
    need_auto_precombine_segs: null,
  });
}

// ──────────────────────────────────────────────
// 장면 → 타이밍 정보 추출
// ──────────────────────────────────────────────

interface SceneTiming {
  index: number;
  startSec: number;      // 소스 영상 내 시작점
  endSec: number;        // 소스 영상 내 종료점
  durationSec: number;   // 클립 길이
  tlStartSec: number;    // 타임라인 누적 시작점
  tlEndSec: number;      // 타임라인 누적 종료점
  text: string;          // 나레이션/대사
  effectText: string;    // 효과자막
  sourceIndex: number;   // [FIX #891/#892] 다중 소스 영상 인덱스 (0-based)
}

function getVideoAnalysisMainText(scene: VideoSceneRow): string {
  return (scene.audioContent || scene.dialogue || scene.sceneDesc || '').trim();
}

function normalizeNarrationComparisonText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseVideoAnalysisSceneWindow(scene: VideoSceneRow): { startSec: number; endSec: number; durationSec: number } | null {
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

export function buildVideoAnalysisSceneLineId(versionId: number | string, sceneIndex: number): string {
  return `video-analysis:${versionId}:${sceneIndex}`;
}

export function buildVideoAnalysisNarrationLines(params: {
  scenes: VideoSceneRow[];
  soundLines: Array<Pick<ScriptLine, 'audioUrl' | 'duration' | 'endTime' | 'sceneId' | 'startTime' | 'text' | 'ttsStatus'>>;
  versionId?: number | string;
}): Array<{ audioUrl?: string; duration?: number; index: number; sceneId?: string; startTime?: number; text?: string }> {
  const { scenes, soundLines, versionId } = params;
  if (scenes.length === 0 || soundLines.length === 0) return [];

  const audioLineGroups = new Map<string, Array<Pick<ScriptLine, 'audioUrl' | 'duration' | 'endTime' | 'sceneId' | 'startTime' | 'text' | 'ttsStatus'>>>();
  for (const line of soundLines) {
    if (!line.sceneId || !line.audioUrl) continue;
    const group = audioLineGroups.get(line.sceneId) || [];
    group.push(line);
    audioLineGroups.set(line.sceneId, group);
  }

  const sceneIdKeys = versionId == null
    ? []
    : scenes.map((_, sceneIndex) => buildVideoAnalysisSceneLineId(versionId, sceneIndex));
  const hasSceneIdMatches = sceneIdKeys.some((sceneId) => (audioLineGroups.get(sceneId)?.length || 0) > 0);
  if (hasSceneIdMatches && sceneIdKeys.some((sceneId) => (audioLineGroups.get(sceneId)?.length || 0) > 1)) {
    return [];
  }

  const canUseSceneIdMatching = hasSceneIdMatches;
  const canUseLegacyIndexMatching = !canUseSceneIdMatching
    && soundLines.length === scenes.length
    && scenes.every((scene, sceneIndex) => {
      const sceneText = normalizeNarrationComparisonText(getVideoAnalysisMainText(scene));
      const lineText = normalizeNarrationComparisonText(soundLines[sceneIndex]?.text || '');
      return sceneText === lineText;
    });

  if (!canUseSceneIdMatching && !canUseLegacyIndexMatching) {
    return [];
  }

  return scenes.map((scene, sceneIndex) => {
    const matchedLine = canUseSceneIdMatching
      ? audioLineGroups.get(sceneIdKeys[sceneIndex])?.[0] || null
      : soundLines[sceneIndex] || null;
    const timing = parseVideoAnalysisSceneWindow(scene);
    const fallbackDuration = timing?.durationSec ?? parseDuration(scene.duration);
    const explicitDuration = typeof matchedLine?.duration === 'number' && Number.isFinite(matchedLine.duration) && matchedLine.duration > 0
      ? matchedLine.duration
      : null;
    const inferredDuration = typeof matchedLine?.startTime === 'number'
      && Number.isFinite(matchedLine.startTime)
      && typeof matchedLine?.endTime === 'number'
      && Number.isFinite(matchedLine.endTime)
      && matchedLine.endTime > matchedLine.startTime
      ? matchedLine.endTime - matchedLine.startTime
      : null;
    const duration = explicitDuration ?? inferredDuration ?? fallbackDuration;
    // [FIX] 소스 타임코드(timing.startSec)를 startTime 폴백으로 사용하지 않음
    // startTime은 TTS 나레이션의 실제 타임라인 위치만 전달해야 함
    // 소스 타임코드를 넣으면 buildNarrationSyncedTimeline에서 잘못된 타임라인 시작점이 됨
    const ttsStartTime = typeof matchedLine?.startTime === 'number' && Number.isFinite(matchedLine.startTime)
      ? matchedLine.startTime
      : undefined;

    if (!matchedLine?.audioUrl) {
      return { duration: fallbackDuration, index: sceneIndex, startTime: undefined };
    }

    return {
      audioUrl: matchedLine.audioUrl,
      duration: Math.max(0.1, duration),
      index: sceneIndex,
      sceneId: matchedLine.sceneId,
      startTime: ttsStartTime,
      text: matchedLine.text,
    };
  });
}

function extractTimings(scenes: VideoSceneRow[], preset?: VideoAnalysisPreset): SceneTiming[] {
  const result: SceneTiming[] = [];
  let accTime = 0;
  let cumTime = 0; // 타임라인 누적 위치

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = parseDuration(s.duration);

    // 보정된 소스 타임코드가 있으면 우선 사용
    const srcTc = s.timecodeSource || s.sourceTimeline || '';

    // [FIX #891/#892] 다중 소스 인덱스 추출 — "[소스 N]" / "[S-01]" 패턴 모두 지원
    const sourceIndex = extractTaggedSourceIndex(srcTc);

    // [FIX #664] `/` 구분자 지원
    const range = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);

    let startSec: number;
    let endSec: number;

    if (range) {
      startSec = timecodeToSeconds(range[1]);
      endSec = timecodeToSeconds(range[2]);
    } else {
      // [FIX] 단일 타임코드 ("00:26.000")도 소스 시작점으로 사용
      const singleTc = srcTc.match(/(\d+:\d+(?:\.\d+)?)/);
      if (singleTc) {
        startSec = timecodeToSeconds(singleTc[1]);
        endSec = startSec + dur;
      } else {
        startSec = accTime;
        endSec = accTime + dur;
      }
    }

    // [FIX] 음수/0 클립 방지 — endSec 교정 후 clipDur 계산
    if (endSec <= startSec) {
      endSec = startSec + Math.max(0.1, dur);
    }

    // [FIX] 소스 타임코드 중복/겹침 방지 — 같은 소스의 최근 장면과 동일 범위면 자동 보정
    // 다중 소스: 다른 소스 영상은 타임코드가 같아도 정상 (각자 00:00부터 시작)
    // 교차 소스 패턴(소스1→소스2→소스1)도 처리: "같은 소스의 마지막 장면"과 비교
    if (i > 0) {
      let lastSameSource: SceneTiming | null = null;
      for (let pi = i - 1; pi >= 0; pi--) {
        if (result[pi].sourceIndex === sourceIndex) { lastSameSource = result[pi]; break; }
      }
      if (lastSameSource) {
        // 비단조적 참조(이전 구간 의도적 재사용)는 보정 스킵
        const isNonMonotonic = startSec < lastSameSource.startSec;
        const startOverlap = Math.abs(startSec - lastSameSource.startSec) < 0.3;
        const endOverlap = Math.abs(endSec - lastSameSource.endSec) < 0.3;
        if (!isNonMonotonic && startOverlap && endOverlap) {
          startSec = lastSameSource.endSec;
          endSec = startSec + dur;
        } else if (!isNonMonotonic && startSec < lastSameSource.endSec - 0.1 && startSec >= lastSameSource.startSec) {
          startSec = lastSameSource.endSec;
          if (endSec <= startSec) endSec = startSec + dur;
        }
      }
    }

    const clipDur = endSec - startSec;
    const mainText = preset === 'snack'
      ? (s.dialogue || s.audioContent || s.sceneDesc)
      : getVideoAnalysisMainText(s);

    result.push({
      index: i,
      startSec,
      endSec,
      durationSec: clipDur,
      tlStartSec: cumTime,
      tlEndSec: cumTime + clipDur,
      text: mainText || '',
      effectText: s.effectSub || '',
      sourceIndex,
    });

    accTime = endSec;
    cumTime += clipDur;
  }
  return result;
}

// ──────────────────────────────────────────────
// FCP XML (xmeml v5) — Premiere Pro / DaVinci
// ──────────────────────────────────────────────

export function generateFcpXml(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
  videoDurationSec?: number;
  narrationLines?: ExportNarrationLine[];
  dialogueLineBreaks?: SubtitleTextOverrideMap;
  includeGraphicSubtitleTracks?: boolean;
  /** true이면 media/ 접두사 없이 파일명만 사용 (Premiere ZIP 플랫 구조) */
  flatMediaPaths?: boolean;
}): string {
  const {
    scenes,
    title,
    videoFileName: rawVideoFileName,
    fps = 30,
    width = 1080,
    height = 1920,
    preset,
    videoDurationSec,
    narrationLines = [],
    dialogueLineBreaks,
    includeGraphicSubtitleTracks = true,
    flatMediaPaths = false,
  } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
  const mediaPrefix = flatMediaPaths ? '' : 'media/';
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  // 하위 호환: 기존 코드가 SceneTiming 필드를 사용하므로 매핑
  const timings: SceneTiming[] = nsTimings.map(t => {
    const rawTc = scenes[t.sceneIndex]?.timecodeSource || scenes[t.sceneIndex]?.sourceTimeline || '';
    return {
      index: t.sceneIndex,
      startSec: t.sourceStartSec + t.trimStartSec,
      endSec: t.sourceStartSec + t.trimEndSec,
      durationSec: t.targetDurationSec,
      tlStartSec: t.timelineStartSec,
      tlEndSec: t.timelineEndSec,
      text: t.subtitleSegments.map(s => s.text).join(' '),
      effectText: t.effectSubtitleSegments.map(s => s.text).join(' '),
      sourceIndex: extractTaggedSourceIndex(rawTc),
    };
  });
  if (timings.length === 0) return '';

  const totalDurSec = timings[timings.length - 1].tlEndSec;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);
  const safeFileName = escXml(videoFileName);
  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps); // fps는 display 값 (29.97, 30, 60 등)
  const subtitleOrigin = getSubtitleOrigin(width, height);
  // [FIX] 소스 영상 전체 길이 = max(실제 비디오 길이, 최대 타임코드 끝점)
  const maxTimecodeEnd = Math.max(...timings.map(t => t.endSec));
  const srcTotalFrames = Math.ceil(Math.max(videoDurationSec || 0, maxTimecodeEnd) * fps);

  // ── 시퀀스 마커 (장면 경계 — Shift+M으로 즉시 네비게이션) ──
  const markers = timings.map((t, i) => {
    const s = scenes[i];
    const mTag = s.mode ? `[${s.mode.replace(/[\[\]]/g, '')}] ` : '';
    const markerName = `${mTag}#${i + 1} ${(s.audioContent || s.dialogue || '').slice(0, 50)}`;
    const markerComment = [s.effectSub, s.videoDirection]
      .filter(Boolean).join(' | ').slice(0, 200);
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(markerComment)}</comment>
      <in>${toFrames(t.tlStartSec)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
  const videoClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    // [FIX #316] 클립 이름에 모드+오디오 내용 표시 — Premiere 타임라인에서 즉시 확인 가능
    const modeTag = s.mode ? `${s.mode.replace(/[\[\]]/g, '')}` : '';
    const clipName = `${modeTag ? `[${modeTag}] ` : ''}#${i + 1} ${(s.audioContent || s.dialogue || s.sceneDesc || '').slice(0, 50)}`;
    const fileTag = i === 0
      ? `<file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>${escXml(mediaPrefix + videoFileName)}</pathurl>
              <duration>${srcTotalFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>`
      : '<file id="file-1"/>';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(clipName)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            ${fileTag}${nsTimings[i]?.autoSpeedFactor != null && nsTimings[i].autoSpeedFactor < 0.999 ? `
            <filter>
              <effect>
                <name>Time Remap</name>
                <effectid>timeremap</effectid>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>
                <parameter><parameterid>speed</parameterid><value>${Math.round(nsTimings[i].autoSpeedFactor * 100)}</value></parameter>
                <parameter><parameterid>frameblending</parameterid><value>TRUE</value></parameter>
              </effect>
            </filter>` : ''}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(s.sceneDesc || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
              <shottake>${escXml(s.videoDirection || '')}</shottake>
              <lognote>${escXml(t.text)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml([s.dialogue, s.effectSub].filter(Boolean).join(' / '))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── V2/V3 그래픽 자막 트랙 (Premiere subtitle XML 전환 시 비활성화 가능) ──
  const isShorts = !hasLandscapeAspect(width, height);
  const dialogueFontSize = isShorts ? 70 : 42;
  const subtitleClips = includeGraphicSubtitleTracks
    ? nsTimings
        .filter(t => t.subtitleSegments.some(segment => segment.text.trim()))
        .map((t) => {
          const displayText = t.subtitleSegments
            .filter(segment => segment.text.trim())
            .map(segment => getDialogueSubtitleText(segment, dialogueLineBreaks))
            .filter(Boolean)
            .join('\n');
          if (!displayText) return '';
          // 자막 타이밍 = subtitleSegments 기반 (나레이션 길이, 장면 전체가 아님)
          const subStart = t.subtitleSegments[0]?.startTime ?? t.timelineStartSec;
          const subEnd = t.subtitleSegments[0]?.endTime ?? t.timelineEndSec;
          const subDurSec = Math.max(0.1, subEnd - subStart);
          return `
          <generatoritem id="sub-${t.sceneIndex + 1}">
            <name>${escXml(displayText.replace(/\n/g, ' ').slice(0, 40))}</name>
            <duration>${toFrames(subDurSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(subDurSec)}</out>
            <start>${toFrames(subStart)}</start>
            <end>${toFrames(subEnd)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(displayText)}</value></parameter>
              <parameter><parameterid>font</parameterid><name>Font</name><value>Apple SD Gothic Neo</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>${dialogueFontSize}</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`;
        }).filter(Boolean).join('')
    : '';

  const effectSubClips = includeGraphicSubtitleTracks
    ? nsTimings
        .filter(t => t.effectSubtitleSegments.some(segment => segment.text.trim()))
        .map((t) => {
          const effectText = t.effectSubtitleSegments
            .filter(segment => segment.text.trim())
            .map(segment => breakLines(segment.text))
            .join('\n');
          return `
          <generatoritem id="fx-${t.sceneIndex + 1}">
            <name>${escXml(effectText.replace(/\n/g, ' ').slice(0, 40))}</name>
            <duration>${toFrames(t.targetDurationSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.targetDurationSec)}</out>
            <start>${toFrames(t.timelineStartSec)}</start>
            <end>${toFrames(t.timelineEndSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(effectText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>60</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>4</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16776960</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.effect}</value></parameter>
            </effect>
          </generatoritem>`;
        }).join('')
    : '';

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')} Audio`)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <file id="file-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <ntsc>${ntscStr}</ntsc>
      <timebase>${timebase}</timebase>
    </rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
            <codec>
              <name>Apple ProRes 422</name>
            </codec>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}${effectSubClips ? `
        <track>
          <enabled>TRUE</enabled>${effectSubClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>${(() => {
    const narClips = narrationLines.filter(l => l.audioFileName);
    if (narClips.length === 0) return '';
    return `
        <track>
          <outputchannelindex>1</outputchannelindex>${narClips.map((line, i) => {
      // [FIX] 원본 배열 인덱스로 sync timeline 참조 (filter 후 i != 장면 인덱스)
      const origIndex = narrationLines.indexOf(line);
      const startSec = nsTimings[origIndex]?.timelineStartSec ?? line.startTime ?? 0;
      const durationSec = Math.max(0.1, line.duration ?? nsTimings[origIndex]?.targetDurationSec ?? 3);
      const durFrames = toFrames(durationSec);
      const startFrames = toFrames(startSec);
      return `
          <clipitem id="narration-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`Narration ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${durFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in><out>${durFrames}</out>
            <start>${startFrames}</start><end>${startFrames + durFrames}</end>
            <file id="narfile-${i + 1}">
              <name>${escXml(line.audioFileName!)}</name>
              <pathurl>${escXml((flatMediaPaths ? '' : 'audio/') + line.audioFileName!)}</pathurl>
              <duration>${durFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media><audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio></media>
            </file>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Caribbean</label2></labels>
          </clipitem>`;
    }).join('')}
        </track>`;
  })()}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

// ──────────────────────────────────────────────
// CapCut 프로젝트 (draft_content.json)
// ──────────────────────────────────────────────

export function generateCapCutDraftJson(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
  videoDurationSec?: number;
  hasAudioTrack?: boolean;
  narrationLines?: ExportNarrationLine[];
  /** [FIX #891/#892] 추가 소스 영상 파일명 (인덱스 1, 2, ... 순서) */
  additionalVideoFileNames?: string[];
}): {
  json: string;
  keyValueJson: string;
  scaffoldIds: CapCutProjectScaffoldIds;
  trackIds: string[];
  /** [FIX #891/#892] 소스별 비디오 파일명 목록 (ZIP 삽입용) */
  videoFileNames: string[];
} {
  const {
    scenes,
    title,
    videoFileName: rawVideoFileName,
    fps = 30,
    width = 1080,
    height = 1920,
    preset,
    videoDurationSec,
    hasAudioTrack = true,
    narrationLines = [],
    additionalVideoFileNames = [],
  } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  const timings: SceneTiming[] = nsTimings.map((t, ti) => {
    // [FIX #891/#892] 소스 인덱스 추출 — "[소스 N]" / "[S-01]" 매칭
    const rawTc = scenes[t.sceneIndex]?.timecodeSource || scenes[t.sceneIndex]?.sourceTimeline || '';
    const sourceIndex = extractTaggedSourceIndex(rawTc);
    return {
      index: t.sceneIndex,
      startSec: t.sourceStartSec + t.trimStartSec,
      endSec: t.sourceStartSec + t.trimEndSec,
      durationSec: t.targetDurationSec,
      tlStartSec: t.timelineStartSec,
      tlEndSec: t.timelineEndSec,
      text: t.subtitleSegments.map(s => s.text).join(' '),
      effectText: t.effectSubtitleSegments.map(s => s.text).join(' '),
      sourceIndex,
    };
  });
  if (timings.length === 0) {
    return {
      json: '',
      keyValueJson: '{}',
      scaffoldIds: {
        draftFolderId: '',
        draftId: '',
        timelineId: '',
        timelineProjectId: '',
      },
      trackIds: [],
      videoFileNames: [videoFileName],
    };
  }

  const totalDurUs = toUs(syncTimeline.totalDurationSec);
  const maxEnd = Math.max(...nsTimings.map(t => t.sourceEndSec));
  const srcDurUs = toUs(Math.max(videoDurationSec || 0, maxEnd));

  const platform = detectCapCutDesktopPlatform();
  const scaffoldIds: CapCutProjectScaffoldIds = {
    draftFolderId: uuid(),
    draftId: uuid(),
    timelineId: uuid(),
    timelineProjectId: uuid(),
  };

  // [FIX #891/#892] 소스별 비디오 머티리얼 — 다중 영상 소스 지원
  // 파일명 중복 방지 — 동일 이름이면 _2, _3 등 접미사 부여
  const rawNames = [videoFileName, ...additionalVideoFileNames.map(n => sanitizeFileName(n))];
  const allVideoFileNames: string[] = [];
  const usedNames = new Set<string>();
  for (const name of rawNames) {
    let final = name;
    if (usedNames.has(final)) {
      const ext = final.match(/\.[a-zA-Z0-9]{2,5}$/)?.[0] || '';
      const base = ext ? final.slice(0, -ext.length) : final;
      let idx = 2;
      while (usedNames.has(`${base}_${idx}${ext}`)) idx++;
      final = `${base}_${idx}${ext}`;
    }
    usedNames.add(final);
    allVideoFileNames.push(final);
  }
  const uniqueSourceIndices = [...new Set(timings.map(t => t.sourceIndex))].sort((a, b) => a - b);
  const sourceVideoMaterials = uniqueSourceIndices.map(si => ({
    sourceIndex: si,
    materialId: uuid(),
    fileName: allVideoFileNames[si] || allVideoFileNames[0] || 'video.mp4',
  }));
  // 소스 인덱스 → materialId 매핑
  const sourceToMaterialId = new Map(sourceVideoMaterials.map(m => [m.sourceIndex, m.materialId]));
  const getMaterialIdForSource = (si: number) => sourceToMaterialId.get(si) || sourceVideoMaterials[0]?.materialId || uuid();

  const speedId = uuid();
  const canvasId = uuid();
  const trackVideoId = uuid();
  const platformInfo = buildCapCutPlatformInfo(platform);

  // 빈 배열 필드 (캡컷 필수 구조)
  const emptyArr: never[] = [];

  // ── 비디오 세그먼트 (편집점 = 실제 컷) ──
  // [FIX #891/#892] 각 세그먼트가 올바른 소스 머티리얼을 참조하도록 수정
  const videoSegments = timings.map((t, ti) => buildCapCutSegmentShell({
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    },
    commonKeyframes: emptyArr,
    enableAdjust: true,
    extraMaterialRefs: [speedId, canvasId],
    materialId: getMaterialIdForSource(t.sourceIndex),
    renderIndex: 0,
    sourceDurationUs: toUs(t.durationSec),
    sourceStartUs: toUs(t.startSec),
    speed: nsTimings[ti]?.autoSpeedFactor ?? 1.0,
    targetDurationUs: toUs(t.durationSec),
    targetStartUs: toUs(t.tlStartSec),
    trackRenderIndex: 0,
  }));

  // ── 텍스트 자막 머티리얼 + 세그먼트 (CapCut 네이티브 자막) ──
  const textMaterials = timings.filter(t => t.text).map(t => {
    const tid = uuid();
    return { id: tid, text: t.text, effectText: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });
  const fxMaterials = timings.filter(t => t.effectText).map(t => {
    const tid = uuid();
    return { id: tid, text: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });

  const textObjects = textMaterials.map(m => ({
    add_type: 0,
    alignment: 1,
    background_alpha: 0.0,
    background_color: '',
    background_height: 0.14,
    background_horizontal_offset: 0.0,
    background_round_radius: 0.0,
    background_style: 0,
    background_vertical_offset: 0.004,
    background_width: 0.14,
    bold_width: 0.0,
    border_alpha: 1.0,
    border_color: '',
    border_width: 0.08,
    check_flag: 7,
    content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
    fixed_height: -1.0,
    fixed_width: -1.0,
    font_category_id: '',
    font_category_name: '',
    font_id: '',
    font_name: '',
    font_path: '',
    font_resource_id: '',
    font_size: 8.0,
    font_source_platform: 0,
    font_team_id: '',
    font_title: 'default',
    font_url: '',
    fonts: [],
    force_apply_line_max_width: false,
    global_alpha: 1.0,
    has_shadow: false,
    id: m.id,
    initial_scale: 1.0,
    inner_padding: -1.0,
    is_rich_text: false,
    italic_degree: 0,
    ktv_color: '',
    language: '',
    layer_weight: 1,
    letter_spacing: 0.0,
    line_feed: 1,
    line_max_width: 0.82,
    line_spacing: 0.02,
    multi_language_current: 'none',
    name: '',
    original_size: [],
    preset_category: '',
    preset_category_id: '',
    preset_has_set_alignment: false,
    preset_id: '',
    preset_index: 0,
    preset_name: '',
    recognize_task_id: '',
    recognize_type: 0,
    relevance_segment: [],
    shadow_alpha: 0.9,
    shadow_angle: -45.0,
    shadow_color: '',
    shadow_distance: 0.04,
    shadow_point: { x: 0.6363961031, y: -0.6363961031 },
    shadow_smoothing: 0.45,
    shape_clip_x: false,
    shape_clip_y: false,
    style_name: '',
    sub_type: 0,
    subtitle_keywords: null,
    subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0,
    text_color: '#FFFFFF',
    text_curve: null,
    text_preset_resource_id: '',
    text_size: 30,
    text_to_audio_ids: [],
    tts_auto_update: false,
    type: 'subtitle',
    typesetting: 0,
    underline: false,
    underline_offset: 0.22,
    underline_width: 0.05,
    use_effect_default_color: true,
    words: null,
  }));

  const textSegments = textMaterials.map(m => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: m.id,
    renderIndex: 11000,
    sourceDurationUs: toUs(m.durationSec),
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: toUs(m.durationSec),
    targetStartUs: toUs(m.tlStartSec),
    trackRenderIndex: 11000,
  }));

  // [FIX #575] 효과 자막 머티리얼 + 세그먼트 — 기존 fxMaterials가 미사용이었음
  const fxTextObjects = fxMaterials.map(m => ({
    add_type: 0, alignment: 1, background_alpha: 0.0, background_color: '', background_height: 0.14,
    background_horizontal_offset: 0.0, background_round_radius: 0.0, background_style: 0,
    background_vertical_offset: 0.004, background_width: 0.14, bold_width: 0.0, border_alpha: 1.0,
    border_color: '#000000', border_width: 0.08, check_flag: 7,
    content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 6.0, bold: true, italic: true, color: [1.0, 1.0, 0.0], useLetterColor: true }], text: m.text }),
    fixed_height: -1.0, fixed_width: -1.0, font_category_id: '', font_category_name: '', font_id: '',
    font_name: '', font_path: '', font_resource_id: '', font_size: 6.0, font_source_platform: 0,
    font_team_id: '', font_title: 'default', font_url: '', fonts: [],
    force_apply_line_max_width: false, global_alpha: 1.0, has_shadow: false, id: m.id,
    initial_scale: 1.0, inner_padding: -1.0, is_rich_text: false, italic_degree: 0,
    ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0.0, line_feed: 1,
    line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '',
    original_size: [], preset_category: '', preset_category_id: '', preset_has_set_alignment: false,
    preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
    relevance_segment: [], shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: '',
    shadow_distance: 0.04, shadow_point: { x: 0.6363961031, y: -0.6363961031 },
    shadow_smoothing: 0.45, shape_clip_x: false, shape_clip_y: false, style_name: '',
    sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0, text_color: '#FFFF00', text_curve: null, text_preset_resource_id: '',
    text_size: 24, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle',
    typesetting: 0, underline: false, underline_offset: 0.22, underline_width: 0.05,
    use_effect_default_color: true, words: null,
  }));
  const fxTextSegments = fxMaterials.map(m => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.25 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: m.id,
    renderIndex: 12000,
    sourceDurationUs: toUs(m.durationSec),
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: toUs(m.durationSec),
    targetStartUs: toUs(m.tlStartSec),
    trackRenderIndex: 12000,
  }));

  const audioMaterialsWithStart = narrationLines.flatMap((line, lineIndex) => {
    const audioFileName = line.audioFileName ? sanitizeFileName(line.audioFileName) : '';
    if (!audioFileName) return [];

    const syncedTiming = nsTimings[lineIndex];
    const startSec = typeof line.startTime === 'number' && Number.isFinite(line.startTime)
      ? line.startTime
      : syncedTiming?.timelineStartSec;
    const durationSec = typeof line.duration === 'number' && Number.isFinite(line.duration)
      ? line.duration
      : syncedTiming?.targetDurationSec;

    if (startSec == null || durationSec == null) return [];

    const safeStartSec = Math.max(0, startSec);
    const safeDurationSec = Math.max(0.1, durationSec);
    return [{
      id: uuid(),
      fileName: audioFileName,
      dur: toUs(safeDurationSec),
      start: toUs(safeStartSec),
      startSec: safeStartSec,
      durationSec: safeDurationSec,
    }];
  });
  const narrationRanges = audioMaterialsWithStart.map(({ startSec, durationSec }) => ({
    startSec,
    endSec: startSec + durationSec,
  }));

  // [FIX #1037] CapCut은 비디오 세그먼트만으로는 원본 오디오를 복원하지 못하는 케이스가 있어
  // 나레이션이 없는 구간에 한해 source video를 다시 참조하는 별도 audio track을 유지한다.
  const allSourceAudioMaterials = hasAudioTrack
    ? sourceVideoMaterials.map((svm) => ({
      id: uuid(),
      videoMaterialId: svm.materialId,
      fileName: svm.fileName,
      sourceIndex: svm.sourceIndex,
    }))
    : [];
  const sourceAudioSegmentsWithSource = hasAudioTrack
    ? timings.flatMap((t, ti) => {
      const srcAudio = allSourceAudioMaterials.find((sa) => sa.sourceIndex === t.sourceIndex) || allSourceAudioMaterials[0];
      if (!srcAudio) return [];
      return getAvailableTimeRanges(t.tlStartSec, t.tlEndSec, narrationRanges).map((range) => {
        const rangeDurationSec = range.endSec - range.startSec;
        const rangeOffsetSec = range.startSec - t.tlStartSec;
        return {
          fileName: srcAudio.fileName,
          materialId: srcAudio.id,
          segment: buildCapCutSegmentShell({
            clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
            commonKeyframes: emptyArr,
            enableAdjust: false,
            extraMaterialRefs: emptyArr,
            materialId: srcAudio.id,
            renderIndex: 0,
            sourceDurationUs: toUs(rangeDurationSec),
            sourceStartUs: toUs(t.startSec + rangeOffsetSec),
            speed: nsTimings[ti]?.autoSpeedFactor ?? 1.0,
            targetDurationUs: toUs(rangeDurationSec),
            targetStartUs: toUs(range.startSec),
            trackRenderIndex: 0,
          }),
        };
      });
    })
    : [];
  const activeSourceAudioMaterialIds = new Set(sourceAudioSegmentsWithSource.map(({ materialId }) => materialId));
  const sourceAudioMaterials = allSourceAudioMaterials.filter((material) => activeSourceAudioMaterialIds.has(material.id));
  const sourceAudioSegments = sourceAudioSegmentsWithSource.map(({ segment }) => segment);
  const trackSourceAudioId = uuid();

  const audioMaterials = audioMaterialsWithStart.map(({ id, fileName, dur }) => ({ id, fileName, dur }));
  const audioSegments = audioMaterialsWithStart.map((audioMaterial) => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: audioMaterial.id,
    renderIndex: 0,
    sourceDurationUs: audioMaterial.dur,
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: audioMaterial.dur,
    targetStartUs: audioMaterial.start,
    trackRenderIndex: 0,
  }));

  const trackTextId = uuid();
  const trackAudioId = uuid();
  const trackFxTextId = uuid();
  const sourceFileNameByIndex = new Map(sourceVideoMaterials.map((material) => [material.sourceIndex, material.fileName]));
  const keyValueEntries = [
    ...videoSegments.map((segment, index) => ({
      segmentId: String(segment['id'] || ''),
      materialName: sourceFileNameByIndex.get(timings[index]?.sourceIndex) || videoFileName,
    })).filter((entry) => entry.materialName),
    ...sourceAudioSegmentsWithSource.map(({ fileName, segment }) => ({
      segmentId: String(segment['id'] || ''),
      materialName: fileName,
    })),
    ...audioSegments.map((segment, index) => ({
      segmentId: String(segment['id'] || ''),
      materialName: audioMaterials[index]?.fileName || '',
    })).filter((entry) => entry.materialName),
  ];

  const draft = {
    canvas_config: {
      background: '',
      height,
      ratio: 'original',
      width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: emptyArr,
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: false,
      lyrics_taskinfo: emptyArr,
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: false,
      subtitle_taskinfo: emptyArr,
      system_font_list: emptyArr,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    draft_type: 'video',
    duration: totalDurUs,
    extra_info: null,
    function_assistant_info: {
      audio_noise_segid_list: emptyArr,
      auto_adjust: false,
      auto_adjust_fixed: false,
      auto_adjust_fixed_value: 0,
      auto_adjust_segid_list: emptyArr,
      auto_caption: false,
      auto_caption_segid_list: emptyArr,
      auto_caption_template_id: '',
      auto_lyrics: false,
      auto_lyrics_segid_list: emptyArr,
      auto_music: false,
      auto_music_segid_list: emptyArr,
      auto_speed: false,
      auto_speed_conf: '',
      auto_subtitle: false,
      auto_subtitle_segid_list: emptyArr,
      auto_video_beauty: false,
      auto_video_beauty_segid_list: emptyArr,
      beautify_body: false,
      beautify_face: false,
      enable_ai: false,
      remove_background: false,
      video_mosaic: false,
    },
    fps: fps,
    free_render_index_mode_on: false,
    group_container: null,
    id: scaffoldIds.timelineId,
    is_drop_frame_timecode: Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01,
    keyframe_graph_list: emptyArr,
    keyframes: { adjusts: emptyArr, audios: emptyArr, effects: emptyArr, filters: emptyArr, handwrites: emptyArr, stickers: emptyArr, texts: emptyArr, videos: emptyArr },
    last_modified_platform: platformInfo,
    lyrics_effects: emptyArr,
    materials: {
      ...buildCapCutEmptyMaterialBuckets(),
      audios: [
        ...sourceAudioMaterials.map((sa) => buildCapCutAudioMaterial({
          id: sa.id,
          duration: srcDurUs,
          fileName: sa.fileName,
          path: buildCapCutContainedMaterialPath(scaffoldIds.draftFolderId, 'video', sa.fileName),
          videoId: sa.videoMaterialId,
        })),
        ...audioMaterials.map((material) => buildCapCutAudioMaterial({
          id: material.id,
          duration: material.dur,
          fileName: material.fileName,
          path: buildCapCutContainedMaterialPath(scaffoldIds.draftFolderId, 'audio', material.fileName),
        })),
      ],
      canvases: [buildCapCutCanvasMaterial(canvasId)],
      material_animations: [buildCapCutMaterialAnimation(uuid())],
      speeds: [{
        curve_speed: null,
        id: speedId,
        mode: 0,
        name: '',
        speed: 1.0,
        type: 'speed',
      }],
      stickers: emptyArr,
      tail_animations: emptyArr,
      text_templates: emptyArr,
      texts: [...textObjects, ...fxTextObjects],
      transitions: emptyArr,
      video_effects: emptyArr,
      video_trackings: emptyArr,
      // [FIX #891/#892] 소스별 비디오 머티리얼 생성 — 다중 영상 소스 지원
      videos: sourceVideoMaterials.map((svm) => {
        const containedPath = buildCapCutContainedMaterialPath(scaffoldIds.draftFolderId, 'video', svm.fileName);
        return {
        aigc_history_id: '',
        aigc_item_id: '',
        aigc_type: 'none',
        audio_fade: null,
        beauty_body_auto_preset: null,
        beauty_body_preset_id: '',
        beauty_face_auto_preset: { name: '', preset_id: '', rate_map: '', scene: '' },
        beauty_face_auto_preset_infos: [],
        beauty_face_preset_infos: [],
        cartoon_path: '',
        category_id: '',
        category_name: '',
        check_flag: 62978047,
        content_feature_info: null,
        corner_pin: null,
        crop: {
          lower_left_x: 0.0, lower_left_y: 1.0,
          lower_right_x: 1.0, lower_right_y: 1.0,
          upper_left_x: 0.0, upper_left_y: 0.0,
          upper_right_x: 1.0, upper_right_y: 0.0,
        },
        crop_ratio: 'free',
        crop_scale: 1.0,
        duration: srcDurUs,
        extra_type_option: 0,
        formula_id: '',
        freeze: null,
        has_audio: hasAudioTrack,
        has_sound_separated: false,
        height,
        id: svm.materialId,
        intensifies_audio_path: '',
        intensifies_path: '',
        is_ai_generate_content: false,
        is_copyright: false,
        is_text_edit_overdub: false,
        is_unified_beauty_mode: false,
        live_photo_cover_path: '',
        live_photo_timestamp: -1,
        local_id: '',
        local_material_from: '',
        local_material_id: '',
        material_id: '',
        material_name: svm.fileName,
        material_url: '',
        matting: {
          custom_matting_id: '',
          enable_matting_stroke: false,
          expansion: 0,
          feather: 0,
          flag: 0,
          has_use_quick_brush: false,
          has_use_quick_eraser: false,
          interactiveTime: [],
          path: '',
          reverse: false,
          strokes: [],
        },
        media_path: containedPath,
        music_id: '',
        multi_camera_info: null,
        object_locked: null,
        origin_material_id: '',
        path: containedPath,
        picture_from: 'none',
        picture_set_category_id: '',
        picture_set_category_name: '',
        request_id: '',
        reverse_intensifies_path: '',
        reverse_path: '',
        smart_match_info: null,
        smart_motion: null,
        stable: {
          matrix_path: '',
          stable_level: 0,
          time_range: { duration: 0, start: 0 },
        },
        source: 0,
        source_platform: 0,
        surface_trackings: [],
        team_id: '',
        type: 'video',
        unique_id: '',
        video_algorithm: {
          ai_background_configs: [],
          ai_expression_driven: null,
          ai_in_painting_config: [],
          ai_motion_driven: null,
          aigc_generate: null,
          aigc_generate_list: [],
          algorithms: [],
          complement_frame_config: null,
          deflicker: null,
          gameplay_configs: [],
          image_interpretation: null,
          motion_blur_config: null,
          mouth_shape_driver: null,
          noise_reduction: null,
          path: '',
          quality_enhance: null,
          skip_algorithm_index: [],
          smart_complement_frame: null,
          story_video_modify_video_config: { is_overwrite_last_video: false, task_id: '', tracker_task_id: '' },
          super_resolution: null,
          time_range: { duration: 0, start: 0 },
        },
        video_mask_shadow: { alpha: 0.0, angle: 0.0, blur: 0.0, color: '', distance: 0.0, path: '', resource_id: '' },
        video_mask_stroke: {
          alpha: 0.0,
          color: '',
          distance: 0.0,
          horizontal_shift: 0.0,
          path: '',
          resource_id: '',
          size: 0.0,
          texture: 0.0,
          type: '',
          vertical_shift: 0.0,
        },
        width,
      };
      }),
    },
    mutable_config: null,
    name: '',
    new_version: '163.0.0',
    path: '',
    platform: platformInfo,
    relationships: emptyArr,
    render_index_track_mode_on: true,
    retouch_cover: null,
    smart_ads_info: { draft_url: '', page_from: '', routine: '' },
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks: [{
      attribute: 0,
      flag: 0,
      id: trackVideoId,
      is_default_name: true,
      name: '',
      segments: videoSegments,
      type: 'video',
    },
    // [FIX] 소스 영상 오디오 트랙 — 원본 영상의 소리를 타임라인에 배치
    ...(sourceAudioSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackSourceAudioId,
      is_default_name: true,
      name: '',
      segments: sourceAudioSegments,
      type: 'audio',
    }] : []),
    ...(textSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackTextId,
      is_default_name: true,
      name: '',
      segments: textSegments,
      type: 'text',
    }] : []), ...(audioSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackAudioId,
      is_default_name: true,
      name: '',
      segments: audioSegments,
      type: 'audio',
    }] : []), ...(fxTextSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackFxTextId,
      is_default_name: true,
      name: '',
      segments: fxTextSegments,
      type: 'text',
    }] : [])],
    uneven_animation_template_info: { composition: '', content: '', order: '', sub_template_info_list: emptyArr },
    update_time: 0,
    version: 360000,
  };

  return {
    json: JSON.stringify(draft),
    keyValueJson: buildCapCutKeyValue(keyValueEntries),
    scaffoldIds,
    trackIds: [trackVideoId, ...(sourceAudioSegments.length > 0 ? [trackSourceAudioId] : []), ...(textSegments.length > 0 ? [trackTextId] : []), ...(audioSegments.length > 0 ? [trackAudioId] : []), ...(fxTextSegments.length > 0 ? [trackFxTextId] : [])],
    // upload 순서(0=primary, 1+=additional)와 일치하는 파일명 배열 반환 — ZIP 삽입 시 인덱스 매핑용
    videoFileNames: allVideoFileNames,
  };
}

// ──────────────────────────────────────────────
// SRT 생성 (NLE 패키지용)
// ──────────────────────────────────────────────

export function generateNleSrt(
  scenes: VideoSceneRow[],
  layer: 'dialogue' | 'effect' | 'narration' = 'dialogue',
  preset?: VideoAnalysisPreset,
  timingMode: 'timeline' | 'source' = 'timeline',
  narrationLines: ExportNarrationLine[] = [],
  dialogueLineBreaks?: SubtitleTextOverrideMap,
  wrapEffectWithParentheses: boolean = false,
): string {
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  let idx = 1;
  const entries: string[] = [];

  for (const t of nsTimings) {
    const segments = layer === 'effect' ? t.effectSubtitleSegments : t.subtitleSegments;
    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      const srtStart = timingMode === 'timeline' ? seg.startTime : t.sourceStartSec + t.trimStartSec;
      const srtEnd = timingMode === 'timeline' ? seg.endTime : t.sourceStartSec + t.trimEndSec;
      const lineText = (layer === 'dialogue' || layer === 'narration')
        ? getDialogueSubtitleText(seg, dialogueLineBreaks)
        : (wrapEffectWithParentheses ? wrapEffectSubtitleText(breakLines(seg.text)) : breakLines(seg.text));
      if (!lineText) continue;
      entries.push(`${idx}\n${secondsToSrtTime(srtStart)} --> ${secondsToSrtTime(srtEnd)}\n${lineText}`);
      idx++;
    }
  }

  return entries.join('\n\n');
}

// ──────────────────────────────────────────────
// ZIP 패키지 빌더
// ──────────────────────────────────────────────

export type NleTarget = 'premiere' | 'capcut' | 'filmora' | 'vrew';

export async function buildNlePackageZip(params: {
  target: NleTarget;
  scenes: VideoSceneRow[];
  title: string;
  videoBlob: Blob | null;
  videoFileName: string;
  preset?: VideoAnalysisPreset;
  width?: number;
  height?: number;
  fps?: number;
  videoDurationSec?: number;
  hasAudioTrack?: boolean;
  narrationLines?: ExportNarrationLine[];
  /** [FIX #891/#892] 다중 소스 영상 — 인덱스 순서대로 (0, 1, 2...) */
  additionalVideoBlobs?: Array<{ blob: Blob; fileName: string }>;
}): Promise<Blob> {
  const { target, scenes, title, videoBlob, videoFileName: rawVideoFileName, preset, width, height, fps, videoDurationSec, hasAudioTrack, narrationLines = [], additionalVideoBlobs = [] } = params;
  const sanitizedVideoFileName = sanitizeFileName(rawVideoFileName || 'video.mp4');
  const videoFileName = /\.[a-zA-Z0-9]{2,5}$/.test(sanitizedVideoFileName) ? sanitizedVideoFileName : `${sanitizedVideoFileName || 'video'}.mp4`;
  const hasValidVideoBlob = !!videoBlob && videoBlob.size > 0;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  // [FIX #891/#892] 추가 소스 영상 파일명 중복 방지 (Premiere/Filmora/VREW 공용)
  const dedupedExtraNames: string[] = [];
  const usedMediaNames = new Set<string>([videoFileName]);
  for (const extra of additionalVideoBlobs) {
    let name = sanitizeFileName(extra.fileName);
    if (usedMediaNames.has(name)) {
      const ext = name.match(/\.[a-zA-Z0-9]{2,5}$/)?.[0] || '';
      const base = ext ? name.slice(0, -ext.length) : name;
      let idx = 2;
      while (usedMediaNames.has(`${base}_${idx}${ext}`)) idx++;
      name = `${base}_${idx}${ext}`;
    }
    usedMediaNames.add(name);
    dedupedExtraNames.push(name);
  }
  const packagedNarrationBlobs: Array<{ fileName: string; blob: Blob }> = [];

  if (!hasValidVideoBlob) {
    throw new Error('원본 영상 파일을 찾을 수 없어 NLE 패키지를 만들 수 없습니다. 원본 영상을 다시 불러온 뒤 시도해주세요.');
  }

  // 나레이션 오디오 패키징 — audioUrl → blob → ZIP에 추가 + audioFileName 설정
  const packagedNarrationLines: ExportNarrationLine[] = [];
  for (let i = 0; i < narrationLines.length; i++) {
    const line = narrationLines[i];
    if (!line.audioUrl) { packagedNarrationLines.push(line); continue; }
    const blob = await fetchAssetBlob(line.audioUrl);
    if (!blob) { packagedNarrationLines.push(line); continue; }
    const fileName = `${String(i + 1).padStart(3, '0')}_narration.${audioExtFromBlob(blob)}`;
    const duration = line.duration ?? await measureBlobAudioDuration(blob) ?? 3;
    zip.file(fileName, blob);
    packagedNarrationBlobs.push({ fileName, blob });
    packagedNarrationLines.push({ ...line, audioFileName: fileName, duration });
  }

  if (target === 'premiere') {
    const dialogueLineBreaks = await buildDialogueSubtitleOverrides({
      scenes,
      preset,
      narrationLines: packagedNarrationLines,
    });

    const prprojBytes = await generatePremiereNativeProjectBytes({
      scenes,
      title,
      videoFileName,
      preset,
      width,
      height,
      fps,
      videoDurationSec,
      hasAudioTrack: hasAudioTrack !== false,
      narrationLines: packagedNarrationLines,
      dialogueLineBreaks,
    });
    zip.file(`${safeName}.prproj`, prprojBytes);

    // FCP XML + subtitle XML/SRT는 폴백으로 계속 포함
    // [FIX] XML 폴백에도 자막 트랙 포함 — .prproj를 못 열 때 XML에서도 자막 보이도록
    const xml = generateFcpXml({
      scenes,
      title,
      videoFileName,
      preset,
      width,
      height,
      fps,
      videoDurationSec,
      narrationLines: packagedNarrationLines,
      dialogueLineBreaks,
      includeGraphicSubtitleTracks: true,
      flatMediaPaths: true,  // Premiere ZIP은 플랫 구조
    });
    zip.file(`${safeName}.xml`, xml);

    // [FIX] 영상 파일을 .prproj와 같은 루트에 배치 — Premiere가 파일명으로 자동 매칭
    // (media/ 하위폴더 사용 시 Premiere가 상대경로를 해석하지 못해 Link Media 에러 발생)
    if (videoBlob) {
      zip.file(videoFileName || 'video.mp4', videoBlob);
    }
    // 추가 소스 영상도 루트에 배치
    for (let ei = 0; ei < additionalVideoBlobs.length; ei++) {
      zip.file(dedupedExtraNames[ei], additionalVideoBlobs[ei].blob);
    }

    const videoBase = (videoFileName || 'video.mp4').replace(/\.[^.]+$/, '');
    const dialogueCaptionXml = generatePremiereCaptionXml({
      scenes,
      layer: 'dialogue',
      preset,
      width,
      height,
      narrationLines: packagedNarrationLines,
      dialogueLineBreaks,
    });
    const effectCaptionXml = generatePremiereCaptionXml({
      scenes,
      layer: 'effect',
      preset,
      width,
      height,
      narrationLines: packagedNarrationLines,
    });

    if (dialogueCaptionXml) zip.file(`${videoBase}_자막_media.xml`, dialogueCaptionXml);
    if (effectCaptionXml) zip.file(`${videoBase}_효과_media.xml`, effectCaptionXml);

    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines, dialogueLineBreaks);
    if (dlgSrt) zip.file(`${videoBase}_자막_media.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'timeline', packagedNarrationLines, undefined, true);
    if (fxSrt) zip.file(`${videoBase}_효과_media.srt`, BOM + fxSrt);

    if (dialogueCaptionXml) zip.file(`${safeName}_자막.xml`, dialogueCaptionXml);
    if (effectCaptionXml) zip.file(`${safeName}_효과자막.xml`, effectCaptionXml);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);
    zip.file('PREMIERE_SUBTITLE_IMPORT.txt', [
      '[폴백 안내] native .prproj를 열면 subtitle track이 이미 올라가 있습니다.',
      '',
      `1. 가능하면 "${safeName}.prproj"를 먼저 여세요.`,
      '2. XML 계열은 .prproj를 열 수 없을 때만 사용하세요.',
      `3. "${safeName}.xml"을 Import한 뒤 "${safeName}_자막.xml" / "${safeName}_효과자막.xml"을 시퀀스로 드래그하면 caption track을 다시 만들 수 있습니다.`,
      '',
      '[권장]',
      '• native .prproj가 가장 우선입니다. 타임라인과 subtitle track이 이미 들어 있습니다.',
      '• XML(TTML)/SRT는 비상용 폴백입니다.',
    ].join('\n'));

    const presetLabel: Record<string, string> = {
      tikitaka: '티키타카 리메이크', snack: '스낵 편집', condensed: '컨덴스드',
      deep: '딥 분석', shopping: '쇼핑 리뷰', alltts: 'All TTS',
    };
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 먼저 여세요 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      `2. Premiere에서 "${safeName}.prproj"를 여세요.`,
      '3. 열자마자 컷/오디오/subtitle track이 타임라인에 올라온 상태여야 합니다.',
      '',
      '[ 폴백 ]',
      '• native .prproj를 열 수 없을 때만 XML/TTML/SRT를 사용하세요.',
      `• "${safeName}.xml" import 후 "${safeName}_자막.xml" / "${safeName}_효과자막.xml"을 시퀀스로 드래그하면 caption track을 다시 만들 수 있습니다.`,
      '',
      '[ 자막 (Subtitle Tracks) ]',
      '• native .prproj에는 dialogue/effect subtitle track이 이미 포함되어 있습니다.',
      '• dialogue subtitle: 9:16 기준 중앙 배치 / 65pt / 가운데 정렬 / Gemini 줄바꿈 반영',
      '• effect subtitle: subtitle track + 괄호 자동 적용',
      `• ${videoBase}_자막_media.xml / ${videoBase}_효과_media.xml / SRT는 폴백입니다.`,
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 장면마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 파랑(나레이션) / 초록(대사) / 청록(원본나레이션) / 주황(액션)',
      '• 메타데이터: Window > Metadata 패널에서 장면 설명·대사 확인',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${scenes.length}개`,
      `• 프리셋: ${presetLabel[preset || ''] || '기본'}`,
      `• 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else if (target === 'capcut') {
    // [FIX #610] CapCut — 프로젝트 폴더 구조 완전 호환
    // ZIP 내 모든 파일을 projectId 폴더 아래에 배치하여 CapCut이 미디어를 정확히 찾을 수 있게 함
    // 사용자는 이 폴더를 com.lveditor.draft/ 아래에 그대로 복사하면 됨

    // FCP XML (폴백 — ZIP 루트에 배치)
    const capCutXml = generateFcpXml({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec, narrationLines: packagedNarrationLines });
    zip.file(`${safeName}.xml`, capCutXml);

    // draft JSON (프로젝트 폴더 복사 방식)
    // [FIX #891/#892] 추가 소스 영상 파일명 전달
    const draftResult = generateCapCutDraftJson({
      scenes,
      title,
      videoFileName: videoFileName || 'video.mp4',
      preset,
      width,
      height,
      fps,
      videoDurationSec,
      hasAudioTrack: hasAudioTrack !== false,
      narrationLines: packagedNarrationLines,
      additionalVideoFileNames: additionalVideoBlobs.map((b) => b.fileName),
    });
    const draftContent = JSON.parse(draftResult.json);
    const pId = draftResult.scaffoldIds.draftFolderId;
    const nowTs = Math.floor(Date.now() / 1000);
    const nowUs = Date.now() * 1000;
    const draftTotalDurUs = draftContent.duration || Math.ceil((extractTimings(scenes, preset).at(-1)?.tlEndSec || 0) * 1_000_000);
    const draftTimelineMaterialsSize = (
      draftContent.materials?.videos?.length || 0
    ) + (
      draftContent.materials?.texts?.length || 0
    ) + (
      draftContent.materials?.audios?.length || 0
    );
    const draftCoverBlob = await buildCapCutDraftCoverBlob(width || 320, height || 180);
    const attachmentPcTimelineJson = buildCapCutAttachmentPcTimeline();
    const attachmentScriptVideoJson = buildCapCutAttachmentScriptVideo();
    const attachmentActionSceneJson = buildCapCutAttachmentActionScene();
    const attachmentPcCommonJson = buildCapCutAttachmentPcCommon();
    const attachmentEditingJson = buildCapCutAttachmentEditing();
    const draftExtra = buildCapCutOpaqueDraftExtra();

    // [FIX #610] 모든 draft 파일을 projectId/ 폴더 아래에 배치
    zip.file(`${pId}/draft_content.json`, draftResult.json);
    zip.file(`${pId}/draft_info.json`, draftResult.json);
    zip.file(`${pId}/draft_settings`, buildCapCutDraftSettings(nowTs, width, height, detectCapCutDesktopPlatform(), draftTimelineMaterialsSize, draftTotalDurUs / 1_000_000));
    zip.file(`${pId}/draft_meta_info.json`, buildCapCutDraftMetaInfo({
      draftFolderId: pId,
      draftId: draftResult.scaffoldIds.draftId,
      title,
      tmDuration: draftTotalDurUs,
      tmDraftModifiedUs: nowUs,
      draftTimelineMaterialsSize,
    }));
    zip.file(`${pId}/Timelines/project.json`, buildCapCutTimelineProject(draftResult.scaffoldIds.timelineProjectId, draftResult.scaffoldIds.timelineId, nowUs));
    zip.file(`${pId}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
    zip.file(`${pId}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
    zip.file(`${pId}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
    zip.file(`${pId}/common_attachment/coperate_create.json`, buildCapCutCooperateCreate());
    zip.file(`${pId}/attachment_pc_common.json`, attachmentPcCommonJson);
    zip.file(`${pId}/attachment_editing.json`, attachmentEditingJson);
    zip.file(`${pId}/timeline_layout.json`, buildCapCutTimelineLayout(draftResult.scaffoldIds.timelineId));
    zip.file(`${pId}/draft_virtual_store.json`, buildCapCutDraftVirtualStore());
    zip.file(`${pId}/key_value.json`, draftResult.keyValueJson);
    zip.file(`${pId}/draft_biz_config.json`, buildCapCutDraftBizConfig(draftResult.scaffoldIds.timelineId, draftResult.trackIds));
    zip.file(`${pId}/draft_agency_config.json`, buildCapCutDraftAgencyConfig());
    zip.file(`${pId}/performance_opt_info.json`, buildCapCutPerformanceOptInfo());
    zip.file(`${pId}/draft.extra`, draftExtra);
    zip.file(`${pId}/crypto_key_store.dat`, buildCapCutOpaqueCryptoKeyStore());
    zip.file(`${pId}/draft_cover.jpg`, draftCoverBlob);
    addCapCutDesktopInstallerFiles({
      zip,
      projectFolderId: pId,
    });
    addCapCutMainTimelineMirror({
      zip,
      projectFolderId: pId,
      mainTimelineId: draftResult.scaffoldIds.timelineId,
      draftJson: draftResult.json,
      attachmentPcCommonJson,
      attachmentEditingJson,
      attachmentPcTimelineJson,
      attachmentScriptVideoJson,
      attachmentActionSceneJson,
      draftExtra,
      draftCover: draftCoverBlob,
    });

    // [FIX #891/#892] CapCut 자체 draft는 materials/ 아래 self-contained 미디어를 사용 — 다중 소스 지원
    // draft_content.json 내 파일명과 ZIP 내 파일명을 일치시키기 위해 draftResult.videoFileNames 사용
    const draftVideoFileNames = draftResult.videoFileNames;
    if (videoBlob) {
      const primaryName = draftVideoFileNames[0] || videoFileName || 'video.mp4';
      zip.file(`${pId}/materials/video/${primaryName}`, videoBlob);
      zip.file(`media/${primaryName}`, videoBlob);
    }
    for (let ei = 0; ei < additionalVideoBlobs.length; ei++) {
      const extra = additionalVideoBlobs[ei];
      const dedupedName = draftVideoFileNames[ei + 1] || sanitizeFileName(extra.fileName);
      zip.file(`${pId}/materials/video/${dedupedName}`, extra.blob);
      zip.file(`media/${dedupedName}`, extra.blob);
    }
    for (const narrationEntry of packagedNarrationBlobs) {
      zip.file(`${pId}/materials/audio/${narrationEntry.fileName}`, narrationEntry.blob);
    }

    // 4. SRT — CapCut 타임라인 기준 (draft JSON의 target_timerange와 싱크)
    // [FIX #622] 기존 source timing → timeline timing 변경 — CapCut은 클립을 재배치하므로 source 기준 SRT는 싱크 어긋남
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'timeline', packagedNarrationLines);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);
    // 원본 소스 시간 기준 SRT도 별도 제공 (수동 import 폴백용)
    const dlgSrtSrc = generateNleSrt(scenes, 'dialogue', preset, 'source', packagedNarrationLines);
    if (dlgSrtSrc) zip.file(`${safeName}_자막_원본시간.srt`, BOM + dlgSrtSrc);

    zip.file('README.txt', [
      `=== ${title} — CapCut ===`,
      '',
      '★ Chrome/Edge 등 Chromium 브라우저에서는 앱의 "CapCut에 바로 설치" 흐름을 쓰면 ZIP 압축 해제 없이 바로 설치할 수 있습니다.',
      '★ Safari/Firefox 또는 수동 설치가 필요하면 아래 설치 스크립트를 실행하세요.',
      '1. CapCut 데스크톱을 완전히 종료합니다.',
      '2. ZIP 압축을 해제합니다.',
      `3. Mac은 "${CAPCUT_MAC_INSTALLER_NAME}", Windows는 "${CAPCUT_WINDOWS_BATCH_INSTALLER_NAME}"를 실행합니다.`,
      `4. 스크립트가 "${pId}" 폴더를 CapCut 프로젝트 경로에 복사하고 미디어 경로를 이 PC 기준 절대경로로 바꿉니다.`,
      '5. 설치가 끝나면 CapCut을 다시 실행하거나, 이미 켜졌다면 프로젝트 카드를 다시 눌러 확인합니다.',
      '',
      '[ 수동 복사만 하면 안 되는 이유 ]',
      '• 최신 CapCut 데스크톱은 imported draft의 media path를 상대경로만으로는 못 찾는 경우가 있습니다.',
      '• 그래서 설치 시점에 현재 컴퓨터 경로로 media path를 다시 써줘야 Media Not Found가 사라집니다.',
      '',
      '[ 대안: XML import ]',
      '1. CapCut 데스크톱 > File > Import > XML File',
      `2. "${safeName}.xml" 선택`,
      '',
      '[ 대안: 원본 영상 + SRT import ]',
      `1. media/${videoFileName || 'video.mp4'} 불러오기`,
      `2. 자막 > 자막 가져오기 > "${safeName}_자막_원본시간.srt" 선택`,
      '3. 이 SRT는 원본 소스 영상 시간 기준입니다.',
      `   (프로젝트 폴더 방식에서는 "${safeName}_자막.srt"를 사용하세요 — 타임라인 기준)`,
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else if (target === 'filmora') {
    // [FIX #749] Filmora — FCP XML + SRT + 영상 ZIP 패키지
    // Filmora는 FCP XML import를 지원하므로 Premiere XML 생성 로직 재활용

    const filmoraXml = generateFcpXml({
      scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec,
      narrationLines: packagedNarrationLines,
    });
    zip.file(`${safeName}.xml`, filmoraXml);

    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }
    for (let ei = 0; ei < additionalVideoBlobs.length; ei++) {
      zip.file(`media/${dedupedExtraNames[ei]}`, additionalVideoBlobs[ei].blob);
    }

    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'source', packagedNarrationLines);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    const narSrt = generateNleSrt(scenes, 'narration', preset, 'source', packagedNarrationLines);
    if (narSrt) zip.file(`${safeName}_나레이션.srt`, BOM + narSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'source', packagedNarrationLines);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    const tlDlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines);
    if (tlDlgSrt) zip.file(`${safeName}_자막_타임라인.srt`, BOM + tlDlgSrt);

    zip.file('README.txt', [
      `=== ${title} — Filmora ===`,
      '',
      '[ 사용법 — XML import (권장) ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      `2. Filmora > File > Import > Import XML File > "${safeName}.xml" 선택`,
      '3. 타임라인에 편집점이 자동 배치됩니다.',
      '4. media/ 폴더의 영상을 같은 위치에 두세요 (미디어 링크 유지).',
      '',
      '[ 사용법 — SRT import (대안) ]',
      `1. Filmora에서 media/${videoFileName || 'video.mp4'}를 불러옵니다.`,
      `2. 자막 > 자막 파일 가져오기 > "${safeName}_자막.srt" 선택`,
      '3. 자막이 타임라인에 자동 배치됩니다.',
      '',
      '[ 포함된 파일 ]',
      `• ${safeName}.xml — FCP XML (Filmora import용)`,
      `• media/${videoFileName || 'video.mp4'} — 원본 영상`,
      `• ${safeName}_자막.srt — 대사 자막 (소스 시간 기준)`,
      narSrt ? `• ${safeName}_나레이션.srt — 나레이션` : null,
      fxSrt ? `• ${safeName}_효과자막.srt — 효과 자막` : null,
      tlDlgSrt ? `• ${safeName}_자막_타임라인.srt — 대사 자막 (타임라인 기준)` : null,
      '',
      '[ 호환 버전 ]',
      '• Filmora 11 이상 권장 (FCP XML import 지원)',
      '• 이전 버전은 SRT import만 사용하세요.',
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].filter(Boolean).join('\n'));

  } else {
    // VREW — SRT 자막 + 영상 패키지
    // VREW는 SRT import만 지원 (XML import 미지원, XML은 export만 가능)

    // 1. 영상 파일
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }
    for (let ei = 0; ei < additionalVideoBlobs.length; ei++) {
      zip.file(`media/${dedupedExtraNames[ei]}`, additionalVideoBlobs[ei].blob);
    }

    // 2. SRT 자막
    const srt = generateNleSrt(scenes, 'dialogue', preset, 'source', packagedNarrationLines);
    if (srt) zip.file(`${safeName}_자막.srt`, BOM + srt);
    const narSrt = generateNleSrt(scenes, 'narration', preset, 'source', packagedNarrationLines);
    if (narSrt) zip.file(`${safeName}_나레이션.srt`, BOM + narSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'source', packagedNarrationLines);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '[ 사용법 ]',
      '1. VREW를 열고 media/ 폴더의 영상을 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_자막.srt" 선택`,
      '3. 자막이 타임라인에 자동 배치됩니다.',
      '4. SRT는 원본 소스 영상 시간 기준입니다.',
      '',
      '[ 포함된 파일 ]',
      `• ${safeName}_자막.srt — 대사 자막`,
      narSrt ? `• ${safeName}_나레이션.srt — 나레이션` : null,
      fxSrt ? `• ${safeName}_효과자막.srt — 효과 자막` : null,
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].filter(Boolean).join('\n'));
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
}

// ──────────────────────────────────────────────
// 편집실(EditPoint) EdlEntry 기반 — FCP XML + ZIP
// ──────────────────────────────────────────────

/** EdlEntry[] → FCP XML (xmeml v5) — 편집실의 정밀 편집점 기반 */
export function generateFcpXmlFromEdl(params: {
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
}): string {
  // [FIX #316] 기본값을 9:16(1080x1920)으로 변경
  const { entries, sourceVideos, sourceMapping, title = 'Edit Project', fps = 30, width = 1080, height = 1920 } = params;
  if (entries.length === 0) return '';

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps); // fps는 display 값 (29.97, 30, 60 등)
  const subtitleOrigin = getSubtitleOrigin(width, height);
  const safeTitle = escXml(title);

  // 소스 파일 정보 (중복 제거)
  const fileMap = new Map<string, { id: string; name: string; dur: number }>();
  let fileIdx = 1;
  for (const entry of entries) {
    const videoId = sourceMapping[entry.sourceId];
    if (videoId && !fileMap.has(videoId)) {
      const sv = sourceVideos.find(v => v.id === videoId);
      fileMap.set(videoId, {
        id: `file-${fileIdx}`,
        name: sanitizeFileName(sv?.fileName || `source_${fileIdx}.mp4`),
        dur: sv?.durationSec || 300,
      });
      fileIdx++;
    }
  }

  // 총 길이 계산 (누적)
  let recordIn = 0;
  const clips: { entry: EdlEntry; recStart: number; recEnd: number; fileInfo: { id: string; name: string; dur: number } }[] = [];
  for (const entry of entries) {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const dur = (end - start) / entry.speedFactor;
    const videoId = sourceMapping[entry.sourceId];
    const fileInfo = fileMap.get(videoId || '') || { id: 'file-1', name: 'source.mp4', dur: 300 };
    clips.push({ entry, recStart: recordIn, recEnd: recordIn + dur, fileInfo });
    recordIn += dur;
  }

  const totalFrames = toFrames(recordIn);

  // 파일 정의 XML (인라인 정의용 — 각 file의 첫 참조 시 전체 정의)
  const fileDefs = new Map<string, string>();
  for (const f of fileMap.values()) {
    fileDefs.set(f.id, `
              <name>${escXml(f.name)}</name>
              <pathurl>${escXml(f.name)}</pathurl>
              <duration>${toFrames(f.dur)}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>`);
  }

  // ── 시퀀스 마커 (편집점마다 — Shift+M으로 즉시 네비게이션) ──
  const markers = clips.map((c, i) => {
    const markerName = `${c.entry.order} ${c.entry.sourceDescription.slice(0, 50)}`;
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(c.entry.narrationText.slice(0, 200))}</comment>
      <in>${toFrames(c.recStart)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
  const definedFiles = new Set<string>();
  const videoClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const fid = c.fileInfo.id;
    let fileTag: string;
    if (!definedFiles.has(fid) && fileDefs.has(fid)) {
      fileTag = `<file id="${fid}">${fileDefs.get(fid)!}\n            </file>`;
      definedFiles.add(fid);
    } else {
      fileTag = `<file id="${fid}"/>`;
    }
    // 배속 기반 색상: 정배속=Iris, 고속=Mango, 저속=Lavender
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-${fid.replace('file-', '')}</masterclipid>
            <name>${escXml(`${c.entry.order} ${c.entry.sourceDescription.slice(0, 35)}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            ${fileTag}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(c.entry.sourceDescription)}</description>
              <scene>${escXml(c.entry.order)}</scene>
              <lognote>${escXml(c.entry.narrationText)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml(c.entry.narrationText.slice(0, 200))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── V2 나레이션 자막 트랙 (편집실 — narrationText 기반) ──
  const edlSubtitleClips = clips.filter(c => c.entry.narrationText).map((c, i) => {
    const durFrames = toFrames(c.recEnd - c.recStart);
    return `
          <generatoritem id="edl-sub-${i + 1}">
            <name>${escXml(c.entry.narrationText.slice(0, 40))}</name>
            <duration>${durFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${durFrames}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(c.entry.narrationText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`;
  }).join('');

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-${c.fileInfo.id.replace('file-', '')}</masterclipid>
            <name>${escXml(`Audio ${c.entry.order}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <file id="${c.fileInfo.id}"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${edlSubtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${edlSubtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** EdlEntry[] → 나레이션 SRT (편집실용, 누적 타임코드) */
export function generateEdlNarrationSrt(entries: EdlEntry[]): string {
  let cumTime = 0;
  let idx = 1;
  const parts: string[] = [];
  for (const e of entries) {
    const start = e.refinedTimecodeStart ?? e.timecodeStart;
    const end = e.refinedTimecodeEnd ?? e.timecodeEnd;
    const dur = (end - start) / e.speedFactor;
    if (e.narrationText.trim()) {
      parts.push(`${idx}\n${secondsToSrtTime(cumTime)} --> ${secondsToSrtTime(cumTime + dur)}\n${breakLines(e.narrationText)}`);
      idx++;
    }
    cumTime += dur;
  }
  return parts.join('\n\n');
}

/** 편집실 EdlEntry → NLE ZIP 패키지 (Premiere/CapCut/VREW) */
export async function buildEdlNlePackageZip(params: {
  target: NleTarget;
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
}): Promise<Blob> {
  const { target, entries, sourceVideos, sourceMapping, title = 'Edit Project' } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  const srt = generateEdlNarrationSrt(entries);

  if (target === 'premiere') {
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);

    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 편집점마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 보라(정배속) / 주황(고속) / 연보라(슬로우)',
      '• 메타데이터: Window > Metadata에서 나레이션 텍스트 확인',
      '• 비디오+오디오 연결됨: 함께 이동·트림됩니다.',
      '',
      '[ 자막 추가 (선택) ]',
      `• File > Import > "${safeName}_나레이션.srt" → 타임라인에 드래그`,
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
    ].join('\n'));
  } else if (target === 'capcut') {
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — CapCut ===`,
      '',
      '[ 가져오기 ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. CapCut 데스크톱 > File > Import > XML File',
      `3. "${safeName}.xml" 선택 → 컷 순서와 길이가 복원됩니다.`,
      '',
      '[ 자막 ]',
      srt
        ? `• "${safeName}_나레이션.srt" 를 자막 가져오기로 추가할 수 있습니다.`
        : '• 나레이션 SRT는 비어 있어 포함되지 않았습니다.',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
    ].join('\n'));
  } else if (target === 'filmora') {
    // [FIX #749] Filmora — FCP XML + SRT (Filmora 11+ XML import 지원)
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — Filmora ===`,
      '',
      '[ 가져오기 — XML (권장) ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. Filmora > File > Import > Import XML File',
      `3. "${safeName}.xml" 선택 → 타임라인에 편집점 자동 배치`,
      '',
      '[ 자막 추가 (선택) ]',
      srt
        ? `• "${safeName}_나레이션.srt" 를 자막 가져오기로 추가할 수 있습니다.`
        : '• 나레이션 SRT는 비어 있어 포함되지 않았습니다.',
      '',
      '[ 호환 버전 ]',
      '• Filmora 11 이상 권장 (FCP XML import 지원)',
      '• 이전 버전은 SRT import만 사용하세요.',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
    ].join('\n'));
  } else {
    // VREW — 소스 영상 포함 불가(다중 소스), SRT만 제공
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '1. VREW에서 소스 영상을 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_나레이션.srt" 선택`,
      `* ${entries.length}개 편집점 기반 나레이션 SRT`,
    ].join('\n'));
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ──────────────────────────────────────────────
// 편집실 타임라인 → NLE 내보내기 (CapCut / Premiere / VREW)
// ──────────────────────────────────────────────

export type EditRoomNleTarget = 'premiere' | 'capcut' | 'filmora' | 'vrew';

interface EditRoomScene {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  scriptText?: string;
  videoReferences?: VideoReference[];
}

interface EditRoomNarrationLine {
  sceneId?: string;
  audioUrl?: string;
  duration?: number;
  startTime?: number;
  index?: number;
}

interface EditRoomNarrationClip {
  fileName: string;
  startSec: number;
  durationSec: number;
}

interface EditRoomReferenceClip {
  blob: Blob;
  fileName: string;
}

function roundMotionValue(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function normalizeCapCutPosition(valuePx: number, axisSize: number): number {
  return axisSize > 0 ? valuePx / (axisSize / 2) : 0;
}

function normalizeFcpPosition(valuePx: number, axisSize: number): number {
  return axisSize > 0 ? (valuePx / (axisSize / 2)) * 100 : 0;
}

function firstTrackValue(track: NleMotionKeyframe[], fallback: number): number {
  return track.length > 0 ? track[0].value : fallback;
}

function sampleTrackValue(track: NleMotionKeyframe[], timeSec: number, fallback: number): number {
  if (track.length === 0) return fallback;
  if (timeSec <= track[0].timeSec) return track[0].value;
  if (timeSec >= track[track.length - 1].timeSec) return track[track.length - 1].value;

  for (let i = 1; i < track.length; i++) {
    if (timeSec <= track[i].timeSec) {
      const prev = track[i - 1];
      const next = track[i];
      const span = next.timeSec - prev.timeSec;
      const ratio = span <= 0 ? 0 : (timeSec - prev.timeSec) / span;
      return prev.value + (next.value - prev.value) * ratio;
    }
  }

  return fallback;
}

function hasNleMotion(track: NleMotionTrack | null | undefined): boolean {
  if (!track) return false;
  return track.hasTransformMotion || track.hasOpacityMotion;
}

function buildCapCutClipSettings(track: NleMotionTrack | null, width: number, height: number) {
  if (!track) {
    return {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    };
  }

  const scale = roundMotionValue(firstTrackValue(track.scale, 1.0));
  return {
    alpha: roundMotionValue(firstTrackValue(track.opacity, 1.0)),
    flip: { horizontal: false, vertical: false },
    rotation: roundMotionValue(firstTrackValue(track.rotation, 0.0)),
    scale: { x: scale, y: scale },
    transform: {
      x: roundMotionValue(normalizeCapCutPosition(firstTrackValue(track.translateX, 0.0), width)),
      y: roundMotionValue(normalizeCapCutPosition(firstTrackValue(track.translateY, 0.0), height)),
    },
  };
}

function buildCapCutPropertyKeyframes(
  propertyType: string,
  keyframes: NleMotionKeyframe[],
  mapper: (value: number) => number,
): Array<{
  id: string;
  keyframe_list: Array<{
    curveType: string;
    graphID: string;
    id: string;
    left_control: { x: number; y: number };
    right_control: { x: number; y: number };
    string_value: string;
    time_offset: number;
    values: number[];
  }>;
  material_id: string;
  property_type: string;
}> {
  if (keyframes.length === 0) return [];
  return [{
    id: uuid(),
    keyframe_list: keyframes.map((keyframe) => ({
      curveType: 'Line',
      graphID: '',
      id: uuid(),
      left_control: { x: 0, y: 0 },
      right_control: { x: 0, y: 0 },
      string_value: '',
      time_offset: toUs(keyframe.timeSec),
      values: [roundMotionValue(mapper(keyframe.value))],
    })),
    material_id: '',
    property_type: propertyType,
  }];
}

function buildCapCutCommonKeyframes(track: NleMotionTrack | null, width: number, height: number) {
  if (!track) return [];
  return [
    ...buildCapCutPropertyKeyframes('KFTypePositionX', track.translateX, (value) => normalizeCapCutPosition(value, width)),
    ...buildCapCutPropertyKeyframes('KFTypePositionY', track.translateY, (value) => normalizeCapCutPosition(value, height)),
    ...buildCapCutPropertyKeyframes('KFTypeScaleX', track.scale, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeScaleY', track.scale, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeRotation', track.rotation, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeGlobalAlpha', track.opacity, (value) => value),
  ];
}

function buildFcpScalarParameterXml(
  parameterId: string,
  name: string,
  keyframes: NleMotionKeyframe[],
  fps: number,
  mapper: (value: number) => number,
  interpolation: NleMotionInterpolation,
): string {
  if (keyframes.length === 0) return '';
  const baseValue = roundMotionValue(mapper(keyframes[0].value), 4);
  const xmlKeyframes = keyframes.map((keyframe) => `
                <keyframe>
                  <when>${Math.max(0, Math.round(keyframe.timeSec * fps))}</when>
                  <value>${roundMotionValue(mapper(keyframe.value), 4)}</value>
                  <interpolation><name>${interpolation}</name></interpolation>
                </keyframe>`).join('');
  return `
              <parameter>
                <parameterid>${parameterId}</parameterid>
                <name>${name}</name>
                <value>${baseValue}</value>${xmlKeyframes}
              </parameter>`;
}

function buildFcpCenterParameterXml(
  track: NleMotionTrack,
  fps: number,
  width: number,
  height: number,
  interpolation: NleMotionInterpolation,
): string {
  const timeSet = new Set<number>();
  track.translateX.forEach(({ timeSec }) => timeSet.add(timeSec));
  track.translateY.forEach(({ timeSec }) => timeSet.add(timeSec));
  if (timeSet.size === 0) return '';

  const times = [...timeSet].sort((a, b) => a - b);
  const baseX = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateX, times[0], 0), width), 4);
  const baseY = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateY, times[0], 0), height), 4);
  const xmlKeyframes = times.map((timeSec) => {
    const x = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateX, timeSec, 0), width), 4);
    const y = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateY, timeSec, 0), height), 4);
    return `
                <keyframe>
                  <when>${Math.max(0, Math.round(timeSec * fps))}</when>
                  <value><horiz>${x}</horiz><vert>${y}</vert></value>
                  <interpolation><name>${interpolation}</name></interpolation>
                </keyframe>`;
  }).join('');

  return `
              <parameter>
                <parameterid>center</parameterid>
                <name>Center</name>
                <value><horiz>${baseX}</horiz><vert>${baseY}</vert></value>${xmlKeyframes}
              </parameter>`;
}

function buildFcpMotionFilterXml(
  track: NleMotionTrack | null,
  fps: number,
  width: number,
  height: number,
  scaleBase = 1,
): string {
  if (!hasNleMotion(track) || !track) return '';

  const scaleXml = buildFcpScalarParameterXml('scale', 'Scale', track.scale, fps, (value) => value * scaleBase * 100, track.transformInterpolation);
  const centerXml = buildFcpCenterParameterXml(track, fps, width, height, track.transformInterpolation);
  const rotationXml = buildFcpScalarParameterXml('rotation', 'Rotation', track.rotation, fps, (value) => value, track.transformInterpolation);
  const opacityXml = buildFcpScalarParameterXml('opacity', 'Opacity', track.opacity, fps, (value) => value * 100, track.opacityInterpolation);
  const parameters = [scaleXml, centerXml, rotationXml, opacityXml].filter(Boolean).join('');
  if (!parameters) return '';

  return `
            <filter>
              <enabled>TRUE</enabled>
              <start>-1</start>
              <end>-1</end>
              <effect id="basicmotion">
                <name>Basic Motion</name>
                <effectid>basic</effectid>
                <effectcategory>motion</effectcategory>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>${parameters}
              </effect>
            </filter>`;
}

/** 편집실 타임라인 → SRT 문자열 */
function buildEditRoomSrt(timeline: UnifiedSceneTiming[]): string {
  let idx = 1;
  const entries: string[] = [];
  for (const t of timeline) {
    for (const seg of t.subtitleSegments) {
      if (!seg.text.trim()) continue;
      entries.push(`${idx}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      idx++;
    }
  }
  return entries.join('\n\n');
}

/** 편집실 타임라인 → FCP XML (xmeml v5) — 이미지/영상 클립 시퀀스 + 오디오 트랙 */
function buildEditRoomFcpXml(params: {
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  title: string;
  fps: number;
  width: number;
  height: number;
  /** 실제 ZIP에 들어간 미디어 파일명 맵 (index → 파일명). 없으면 scene.videoUrl 기준 추정 */
  mediaFileMap?: Map<number, string>;
  /** 실제 ZIP에 들어간 나레이션 오디오 클립 목록 */
  narrationClips?: EditRoomNarrationClip[];
  stillImageScaleBase?: number;
}): string {
  const { timeline, scenes, title, fps, width, height, mediaFileMap, narrationClips, stillImageScaleBase = 1 } = params;
  if (timeline.length === 0) return '';

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps); // fps는 display 값 (29.97, 30, 60 등)
  const subtitleOrigin = getSubtitleOrigin(width, height);
  const totalDurSec = timeline[timeline.length - 1].imageEndTime;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);

  // 마커 (장면 경계)
  const markers = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    const label = scene?.scriptText?.slice(0, 50) || `장면 ${i + 1}`;
    return `
    <marker>
      <name>${escXml(`#${i + 1} ${label}`)}</name>
      <comment></comment>
      <in>${toFrames(t.imageStartTime)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // 비디오 클립 (장면마다 별도 파일 + 오디오 미디어 스펙 포함)
  const videoClips = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    // [FIX #472] mediaFileMap이 있으면 실제 다운로드된 파일 기준, 없으면 기존 로직
    const actualFile = mediaFileMap?.get(i);
    if (mediaFileMap && !actualFile) {
      throw new Error(`장면 ${i + 1}의 미디어 파일을 찾을 수 없습니다. 이미지/영상을 다시 확인해주세요.`);
    }
    const ext = actualFile ? actualFile.split('.').pop()! : (scene?.videoUrl ? 'mp4' : 'jpg');
    const fileName = actualFile ? `media/${actualFile}` : `media/${String(i + 1).padStart(3, '0')}_scene.${ext}`;
    const hasEmbeddedAudio = actualFile ? actualFile.toLowerCase().endsWith('.mp4') : !!scene?.videoUrl;
    const isStillImage = !hasEmbeddedAudio;
    const clipDurFrames = toFrames(t.imageDuration);
    const clipLabel = (scene?.scriptText || `장면 ${i + 1}`).slice(0, 40);
    const motionTrack = isStillImage
      ? compileNleMotionTrack(t, width, height, fps, { sampleMode: 'per-frame', simplify: false })
      : null;
    const motionFilterXml = buildFcpMotionFilterXml(motionTrack, fps, width, height, isStillImage ? stillImageScaleBase : 1);
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`#${i + 1} ${clipLabel}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>${isStillImage ? `
            <stillframe>TRUE</stillframe>` : ''}
            <file id="file-${i + 1}">
              <name>${escXml(`${String(i + 1).padStart(3, '0')}_scene.${ext}`)}</name>
              <pathurl>${escXml(fileName)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>${hasEmbeddedAudio
                  ? `
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>`
                  : ''}
              </media>
            </file>${motionFilterXml}
            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Iris</label2></labels>
            <logginginfo>
              <description>${escXml(scene?.scriptText || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
            </logginginfo>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>${hasEmbeddedAudio ? `
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>` : ''}
          </clipitem>`;
  }).join('');

  // 오디오 클립 (비디오 클립에 링크)
  const audioClips = timeline.map((t, i) => {
    const actualFile = mediaFileMap?.get(i);
    const scene = scenes.find(s => s.id === t.sceneId);
    const hasEmbeddedAudio = actualFile ? actualFile.toLowerCase().endsWith('.mp4') : !!scene?.videoUrl;
    if (!hasEmbeddedAudio) return '';
    const clipDurFrames = toFrames(t.imageDuration);
    return `
          <clipitem id="audio-${i + 1}">
            <name>${escXml(`Audio ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>
            <file id="file-${i + 1}"/>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');
  const hasSceneAudioTrack = audioClips.replace(/\s/g, '').length > 0;

  // 자막 트랙
  const subtitleClips = timeline
    .flatMap(t => t.subtitleSegments.filter(seg => seg.text.trim()))
    .map((seg, i) => `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(seg.text.slice(0, 40))}</name>
            <duration>${toFrames(seg.endTime - seg.startTime)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(seg.endTime - seg.startTime)}</out>
            <start>${toFrames(seg.startTime)}</start>
            <end>${toFrames(seg.endTime)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(seg.text)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`).join('');

  // 나레이션 오디오 트랙 (A2) — 라인 단위 다중 나레이션 MP3를 실제 길이로 배치
  const narrationTrackClips = (narrationClips || []).map((clip, i) => {
    const clipDurFrames = Math.max(1, toFrames(clip.durationSec));
    const clipStartFrames = Math.max(0, toFrames(clip.startSec));
    const clipEndFrames = clipStartFrames + clipDurFrames;
    return `
          <clipitem id="narration-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`Narration ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${clipStartFrames}</start>
            <end>${clipEndFrames}</end>
            <file id="narfile-${i + 1}">
              <name>${escXml(clip.fileName)}</name>
              <pathurl>${escXml(`audio/${clip.fileName}`)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Caribbean</label2></labels>
          </clipitem>`;
  }).join('');
  const hasNarrationTrack = narrationTrackClips.replace(/\s/g, '').length > 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        ${hasSceneAudioTrack ? `<track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>` : ''}${hasNarrationTrack ? `
        <track>
          <outputchannelindex>1</outputchannelindex>${narrationTrackClips}
        </track>` : ''}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** 이미지/영상 URL에서 Blob으로 fetch (data: / blob: / https: 모두 지원) */
/** [FIX #918] blob MIME type에서 오디오 확장자 결정 */
function audioExtFromBlob(blob: Blob): string {
  const t = blob.type?.toLowerCase() || '';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('ogg')) return 'ogg';
  return 'wav'; // TypeCast/normalizeAudioUrl 기본값
}

async function fetchAssetBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  // data: URL → 직접 디코딩 (fetch 폴백 포함)
  if (url.startsWith('data:')) {
    try {
      const arr = url.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch {
      // atob 실패 시 fetch 폴백
      try { const r = await monitoredFetch(url); return await r.blob(); } catch { return null; }
    }
  }
  // blob: URL
  if (url.startsWith('blob:')) {
    try { const r = await monitoredFetch(url); return await r.blob(); } catch { return null; }
  }
  // https / http URL
  try {
    const res = await monitoredFetch(url);
    if (res.ok) return await res.blob();
  } catch { /* CORS 실패 시 무시 */ }
  return null;
}

async function fetchPrimaryReferenceClip(
  scene: EditRoomScene,
  sceneIndex: number,
): Promise<EditRoomReferenceClip | null> {
  const ref = scene.videoReferences?.[0];
  if (!ref) return null;

  const downloaded = await downloadAndTrimReferenceClip(
    ref.videoId,
    ref.startSec,
    ref.endSec,
    { videoTitle: ref.videoTitle },
  );
  const scenePrefix = String(sceneIndex + 1).padStart(3, '0');
  const refStem = sanitizeFileName(
    downloaded.fileName.replace(/\.[^.]+$/, '').slice(0, 80),
  ) || `scene_${scenePrefix}_reference`;
  return {
    blob: downloaded.blob,
    fileName: `${scenePrefix}_${refStem}.mp4`,
  };
}

function getStillImageMime(blob: Blob): 'image/png' | 'image/jpeg' {
  return blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
}

async function normalizeStillImageBlobForPremiere(
  blob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || width <= 0 || height <= 0) {
    return blob;
  }

  const mime = getStillImageMime(blob);
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<Blob>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(width));
        canvas.height = Math.max(2, Math.round(height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }

        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // EditRoom 프리뷰와 동일하게 시퀀스 크기에 맞춰 강제로 리사이즈한다.
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((value) => resolve(value || blob), mime, mime === 'image/jpeg' ? 0.92 : undefined);
      };
      img.onerror = () => resolve(blob);
      img.src = blobUrl;
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Blob 오디오의 실제 재생 길이(초) 측정 */
async function measureBlobAudioDuration(blob: Blob): Promise<number | null> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        cleanup();
        window.clearTimeout(timeoutId);
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
        resolve(duration);
      };
      audio.onerror = () => {
        cleanup();
        window.clearTimeout(timeoutId);
        resolve(null);
      };
      audio.src = blobUrl;
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** 편집실 타임라인 → CapCut 네이티브 SRT (장면별 통합 자막 — 가장 안정적 import 방법) */
function buildEditRoomSceneSrt(timeline: UnifiedSceneTiming[], scenes: EditRoomScene[]): string {
  const entries: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    // 자막 세그먼트가 있으면 사용, 없으면 대본 텍스트 사용
    const segs = t.subtitleSegments.filter(seg => seg.text.trim());
    if (segs.length > 0) {
      for (const seg of segs) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      }
    } else {
      const scene = scenes.find(s => s.id === t.sceneId);
      if (scene?.scriptText?.trim()) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(t.imageStartTime)} --> ${secondsToSrtTime(t.imageEndTime)}\n${breakLines(scene.scriptText)}`);
      }
    }
  }
  return entries.join('\n\n');
}

function normalizeEditRoomTimelineForExport(
  timeline: UnifiedSceneTiming[],
  narrationLines: EditRoomNarrationLine[],
): { timeline: UnifiedSceneTiming[]; narrationLines: EditRoomNarrationLine[] } {
  if (timeline.length === 0) {
    return { timeline, narrationLines };
  }

  const timeShiftBySceneId = new Map<string, number>();
  let cursor = 0;

  const normalizedTimeline = timeline.map((scene, index) => {
    const sceneStart = cursor;
    const sceneEnd = sceneStart + scene.imageDuration;
    const timeShift = sceneStart - scene.imageStartTime;
    timeShiftBySceneId.set(scene.sceneId, timeShift);

    const subtitleSegments = scene.subtitleSegments.map((segment) => {
      const shiftedStart = segment.startTime + timeShift;
      const shiftedEnd = segment.endTime + timeShift;
      const startTime = Math.min(sceneEnd, Math.max(sceneStart, shiftedStart));
      const endTime = Math.min(sceneEnd, Math.max(startTime, shiftedEnd));
      return {
        ...segment,
        startTime,
        endTime,
      };
    });

    cursor = sceneEnd;
    return {
      ...scene,
      sceneIndex: index,
      imageStartTime: sceneStart,
      imageEndTime: sceneEnd,
      subtitleSegments,
    };
  });

  const normalizedNarrationLines = narrationLines.map((line) => {
    if (!line.sceneId) return line;
    const timeShift = timeShiftBySceneId.get(line.sceneId);
    if (timeShift === undefined) return line;
    if (typeof line.startTime !== 'number' || !Number.isFinite(line.startTime)) return line;
    return {
      ...line,
      startTime: Math.max(0, line.startTime + timeShift),
    };
  });

  return {
    timeline: normalizedTimeline,
    narrationLines: normalizedNarrationLines,
  };
}

/** NLE 내보내기 결과 (ZIP + 미디어 통계) */
export interface NleExportResult {
  blob: Blob;
  videoCount: number;
  imageCount: number;
  totalScenes: number;
}

/** 편집실 타임라인 → NLE 패키지 ZIP (CapCut / Premiere / VREW) */
export async function buildEditRoomNleZip(params: {
  target: EditRoomNleTarget;
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  narrationLines: EditRoomNarrationLine[];
  title: string;
  aspectRatio: string;
  fps?: number;
}): Promise<NleExportResult> {
  const { target, timeline: rawTimeline, scenes, narrationLines: rawNarrationLines, title, aspectRatio, fps = 30 } = params;
  const { timeline, narrationLines } = normalizeEditRoomTimelineForExport(rawTimeline, rawNarrationLines);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  // 해상도 결정
  let w = 1920, h = 1080;
  if (aspectRatio === '9:16') { w = 1080; h = 1920; }
  else if (aspectRatio === '1:1') { w = 1080; h = 1080; }
  else if (aspectRatio === '4:3') { w = 1440; h = 1080; }

  // SRT 자막 (모든 타겟에서 생성)
  const srtContent = buildEditRoomSrt(timeline);
  if (srtContent) zip.file(`${safeName}_자막.srt`, BOM + srtContent);

  // 장면별 통합 SRT (CapCut/VREW용 — 대본 텍스트 폴백 포함)
  const sceneSrt = buildEditRoomSceneSrt(timeline, scenes);
  if (sceneSrt && (target === 'capcut' || target === 'vrew')) {
    zip.file(`${safeName}_장면자막.srt`, BOM + sceneSrt);
  }

  // [FIX #472] 미디어 에셋 수집 — 영상 다운로드 실패 시 이미지 폴백 + 실제 파일명 추적
  const mediaFileMap = new Map<number, string>(); // index → 실제 파일명
  const mediaBlobMap = new Map<number, Blob>(); // index → Blob (CapCut 루트 복사용)
  const narrationClips: EditRoomNarrationClip[] = []; // 나레이션 배치 정보 (다중 라인 지원)
  const narrationBlobEntries: Array<{ fileName: string; blob: Blob }> = []; // ZIP 루트 복사용
  const missingSceneMedia: number[] = [];
  let videoCount = 0;
  let imageCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const scene = scenes.find(s => s.id === t.sceneId);
    if (!scene) continue;

    const idx = String(i + 1).padStart(3, '0');
    let added = false;

    // 영상 우선 시도
    if (scene.videoUrl) {
      const blob = await fetchAssetBlob(scene.videoUrl);
      if (blob && blob.size > 0) {
        const fileName = `${idx}_scene.mp4`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        mediaBlobMap.set(i, blob);
        videoCount++;
        added = true;
      }
      // 영상 다운로드 실패 → 이미지 폴백
    }

    if (!added && scene.imageUrl) {
      const originalBlob = await fetchAssetBlob(scene.imageUrl);
      if (originalBlob) {
        const blob = target === 'premiere'
          ? await normalizeStillImageBlobForPremiere(originalBlob, w, h)
          : originalBlob;
        const ext = getStillImageMime(blob) === 'image/png' ? 'png' : 'jpg';
        const fileName = `${idx}_scene.${ext}`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        mediaBlobMap.set(i, blob);
        imageCount++;
        added = true;
      }
    }

    // 영상도 이미지도 없는 경우 → 레퍼런스 클립을 최후의 수단으로 시도
    if (!added && scene.videoReferences && scene.videoReferences.length > 0) {
      try {
        const referenceClip = await fetchPrimaryReferenceClip(scene, i);
        if (referenceClip?.blob && referenceClip.blob.size > 0) {
          zip.file(`media/${referenceClip.fileName}`, referenceClip.blob);
          mediaFileMap.set(i, referenceClip.fileName);
          mediaBlobMap.set(i, referenceClip.blob);
          videoCount++;
          added = true;
        }
      } catch {
        // 레퍼런스 클립 준비 실패 → missingSceneMedia로 처리
      }
    }

    if (!added) {
      missingSceneMedia.push(i + 1);
    }
  }

  if (missingSceneMedia.length > 0) {
    const preview = missingSceneMedia.slice(0, 8).map((n) => `#${n}`).join(', ');
    const suffix = missingSceneMedia.length > 8 ? ' 외' : '';
    throw new Error(`내보낼 수 없는 장면이 있습니다: ${preview}${suffix}. 각 장면에 이미지나 영상을 준비한 뒤 다시 시도해주세요.`);
  }

  // 나레이션 오디오: sceneId 기준으로 모든 라인 수집(filter) + 순차 배치
  const narrationSortKey = (line: EditRoomNarrationLine): number => {
    if (typeof line.startTime === 'number' && Number.isFinite(line.startTime)) return line.startTime;
    if (typeof line.index === 'number' && Number.isFinite(line.index)) return line.index;
    return Number.POSITIVE_INFINITY;
  };
  const sceneOffsets = new Map<string, number>(); // 장면 내 순차 배치용 누적 오프셋(초)

  const resolveNarrationDuration = async (line: EditRoomNarrationLine, blob: Blob, fallbackSec: number): Promise<number> => {
    if (typeof line.duration === 'number' && Number.isFinite(line.duration) && line.duration > 0) {
      return line.duration;
    }
    const measured = await measureBlobAudioDuration(blob);
    if (typeof measured === 'number' && measured > 0) return measured;
    return Math.max(0.1, fallbackSec);
  };

  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const sceneNarrations = narrationLines
      .filter((line) => !!line.audioUrl && line.sceneId === t.sceneId)
      .sort((a, b) => narrationSortKey(a) - narrationSortKey(b));
    if (sceneNarrations.length === 0) continue;

    const idx = String(i + 1).padStart(3, '0');
    let seqInScene = 0;
    let sceneOffset = sceneOffsets.get(t.sceneId) || 0;

    for (const line of sceneNarrations) {
      const audioUrl = line.audioUrl;
      if (!audioUrl) continue;
      const blob = await fetchAssetBlob(audioUrl);
      if (!blob) continue;

      const durationSec = await resolveNarrationDuration(line, blob, t.imageDuration);
      const lineStart = typeof line.startTime === 'number' && Number.isFinite(line.startTime) && line.startTime >= 0
        ? line.startTime
        : t.imageStartTime + sceneOffset;
      const startSec = Math.max(0, lineStart);
      const localEndOffset = Math.max(0, (startSec - t.imageStartTime) + durationSec);
      sceneOffset = Math.max(sceneOffset, localEndOffset);

      seqInScene++;
      const narFileName = `${idx}_narration_${String(seqInScene).padStart(2, '0')}.${audioExtFromBlob(blob)}`;
      zip.file(`audio/${narFileName}`, blob);
      narrationBlobEntries.push({ fileName: narFileName, blob });
      narrationClips.push({ fileName: narFileName, startSec, durationSec });
    }

    sceneOffsets.set(t.sceneId, sceneOffset);
  }

  // sceneId가 없는 나레이션(예: mergedAudioUrl 폴백)도 전체 타임라인에 배치
  const unboundNarrations = narrationLines
    .filter((line) => !!line.audioUrl && !line.sceneId)
    .sort((a, b) => narrationSortKey(a) - narrationSortKey(b));
  let unboundOffset = 0;
  for (let i = 0; i < unboundNarrations.length; i++) {
    const line = unboundNarrations[i];
    const audioUrl = line.audioUrl;
    if (!audioUrl) continue;
    const blob = await fetchAssetBlob(audioUrl);
    if (!blob) continue;
    const durationSec = await resolveNarrationDuration(line, blob, timeline[0]?.imageDuration || 3);
    const startSec = typeof line.startTime === 'number' && Number.isFinite(line.startTime) && line.startTime >= 0
      ? line.startTime
      : unboundOffset;
    unboundOffset = Math.max(unboundOffset, startSec + durationSec);

    const narFileName = `global_narration_${String(i + 1).padStart(3, '0')}.${audioExtFromBlob(blob)}`;
    zip.file(`audio/${narFileName}`, blob);
    narrationBlobEntries.push({ fileName: narFileName, blob });
    narrationClips.push({ fileName: narFileName, startSec, durationSec });
  }

  narrationClips.sort((a, b) => a.startSec - b.startSec);

  // [FIX #472] FCP XML — mediaFileMap 전달하여 실제 파일명 기준으로 XML 생성
  // 나레이션은 line.duration/오디오 메타데이터 기반 실제 길이로 A2 트랙에 배치
  // VREW는 XML import 미지원 — premiere/capcut만 XML 포함
  if (target !== 'vrew') {
    const xml = buildEditRoomFcpXml({
      timeline,
      scenes,
      title,
      fps,
      width: w,
      height: h,
      mediaFileMap,
      narrationClips,
      stillImageScaleBase: target === 'premiere' ? OVERSCALE : 1,
    });
    zip.file(`${safeName}.xml`, xml);
  }

  // [FIX #610] CapCut projectId — README에서도 참조해야 하므로 블록 밖에서 생성
  const editRoomCapCutProjectId = target === 'capcut' ? uuid() : '';

  // CapCut 전용: draft_content.json (이미지+자막+나레이션 타임라인 자동 배치)
  if (target === 'capcut') {
    const totalDurUs = toUs(timeline[timeline.length - 1]?.imageEndTime || 0);
    const projectId = editRoomCapCutProjectId;
    const scaffoldIds: CapCutProjectScaffoldIds = {
      draftFolderId: projectId,
      draftId: uuid(),
      timelineId: uuid(),
      timelineProjectId: uuid(),
    };
    const speedId = uuid();
    const canvasId = uuid();
    const emptyArr: never[] = [];
    const platformInfo = buildCapCutPlatformInfo(detectCapCutDesktopPlatform());
    const trackVideoId = uuid();
    const trackSourceAudioId = uuid();
    const trackTextId = uuid();
    const trackAudioId = uuid();

    for (const [i, fileName] of mediaFileMap.entries()) {
      const blob = mediaBlobMap.get(i);
      if (!blob) continue;
      const isVideo = fileName.endsWith('.mp4');
      zip.file(`${projectId}/materials/${isVideo ? 'video' : 'image'}/${fileName}`, blob);
    }
    for (const { fileName, blob } of narrationBlobEntries) {
      zip.file(`${projectId}/materials/audio/${fileName}`, blob);
    }

    // ── 미디어 머티리얼: 장면별 이미지/영상 (Map으로 인덱스 보존 — 미디어 누락 시 밀림 방지) ──
    const videoMaterialMap = new Map<number, { id: string; path: string; dur: number; isPhoto: boolean }>();
    const sourceAudioMaterialMap = new Map<string, { id: string; path: string; dur: number; videoMaterialId: string }>();
    const audioMaterialsWithStart: Array<{ id: string; path: string; dur: number; start: number }> = [];

    for (let i = 0; i < timeline.length; i++) {
      const fileName = mediaFileMap.get(i);
      if (!fileName) continue;
      const isVideo = fileName.endsWith('.mp4');
      videoMaterialMap.set(i, {
        id: uuid(),
        path: fileName,
        dur: toUs(timeline[i].imageDuration),
        isPhoto: !isVideo,
      });
    }

    const videoMaterials = [...videoMaterialMap.values()];
    videoMaterials
      .filter((material) => !material.isPhoto)
      .forEach((material) => {
        sourceAudioMaterialMap.set(material.path, {
          id: uuid(),
          path: material.path,
          dur: material.dur,
          videoMaterialId: material.id,
        });
      });
    const allSourceAudioMaterials = [...sourceAudioMaterialMap.values()];
    for (const clip of narrationClips) {
      audioMaterialsWithStart.push({
        id: uuid(),
        path: clip.fileName,
        dur: toUs(clip.durationSec),
        start: toUs(clip.startSec),
      });
    }
    const audioMaterials = audioMaterialsWithStart.map(({ id, path, dur }) => ({ id, path, dur }));
    const narrationRanges = narrationClips.map((clip) => ({
      startSec: clip.startSec,
      endSec: clip.startSec + clip.durationSec,
    }));

    // ── 비디오 세그먼트 (메인 트랙) — Map lookup으로 정확한 인덱스 매칭 ──
    const rawVideoSegments: Array<Record<string, unknown> | null> = timeline.map((t, i) => {
      const mat = videoMaterialMap.get(i);
      if (!mat) return null;
      const motionTrack = mat.isPhoto ? compileNleMotionTrack(t, w, h, fps) : null;
      const clipSettings = buildCapCutClipSettings(motionTrack, w, h);
      const commonKeyframes = buildCapCutCommonKeyframes(motionTrack, w, h);
      return {
        ...buildCapCutSegmentShell({
          clip: clipSettings,
          commonKeyframes,
          enableAdjust: true,
          extraMaterialRefs: [speedId, canvasId],
          materialId: mat.id,
          renderIndex: 0,
          sourceDurationUs: toUs(t.imageDuration),
          sourceStartUs: 0,
          speed: 1.0,
          targetDurationUs: toUs(t.imageDuration),
          targetStartUs: toUs(t.imageStartTime),
          trackRenderIndex: 0,
        }),
        uniform_scale: { on: !(motionTrack?.scale.length), value: clipSettings.scale.x },
      };
    }).filter(Boolean) as Array<Record<string, unknown>>;
    const videoSegments = rawVideoSegments;
    const sourceAudioSegmentsWithPath = timeline.flatMap((t, i) => {
      const mat = videoMaterialMap.get(i);
      if (!mat || mat.isPhoto) return [];
      const sourceAudioMaterial = sourceAudioMaterialMap.get(mat.path);
      if (!sourceAudioMaterial) return [];
      return getAvailableTimeRanges(t.imageStartTime, t.imageEndTime, narrationRanges).map((range) => {
        const rangeDurationSec = range.endSec - range.startSec;
        const rangeOffsetSec = range.startSec - t.imageStartTime;
        return {
          materialId: sourceAudioMaterial.id,
          path: mat.path,
          segment: buildCapCutSegmentShell({
            clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
            commonKeyframes: emptyArr,
            enableAdjust: false,
            extraMaterialRefs: emptyArr,
            materialId: sourceAudioMaterial.id,
            renderIndex: 0,
            sourceDurationUs: toUs(rangeDurationSec),
            sourceStartUs: toUs(rangeOffsetSec),
            speed: 1.0,
            targetDurationUs: toUs(rangeDurationSec),
            targetStartUs: toUs(range.startSec),
            trackRenderIndex: 0,
          }),
        };
      });
    });
    const activeSourceAudioMaterialIds = new Set(sourceAudioSegmentsWithPath.map(({ materialId }) => materialId));
    const sourceAudioMaterials = allSourceAudioMaterials.filter((material) => activeSourceAudioMaterialIds.has(material.id));
    const sourceAudioSegments = sourceAudioSegmentsWithPath.map(({ segment }) => segment);

    // ── 텍스트 머티리얼 + 세그먼트 (자막 트랙) ──
    const textMaterials: { id: string; text: string; start: number; dur: number }[] = [];
    for (const t of timeline) {
      for (const seg of t.subtitleSegments) {
        if (!seg.text.trim()) continue;
        textMaterials.push({ id: uuid(), text: seg.text, start: toUs(seg.startTime), dur: toUs(seg.endTime - seg.startTime) });
      }
    }

    const textObjects = textMaterials.map(m => ({
      add_type: 0, alignment: 1, background_alpha: 0.0, background_color: '', background_height: 0.14,
      background_horizontal_offset: 0.0, background_round_radius: 0.0, background_style: 0,
      background_vertical_offset: 0.004, background_width: 0.14, bold_width: 0.0, border_alpha: 1.0,
      border_color: '', border_width: 0.08, check_flag: 7,
      content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
      fixed_height: -1.0, fixed_width: -1.0, font_category_id: '', font_category_name: '', font_id: '',
      font_name: '', font_path: '', font_resource_id: '', font_size: 8.0, font_source_platform: 0,
      font_team_id: '', font_title: 'default', font_url: '', fonts: [],
      force_apply_line_max_width: false, global_alpha: 1.0, has_shadow: false, id: m.id,
      initial_scale: 1.0, inner_padding: -1.0, is_rich_text: false, italic_degree: 0,
      ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0.0, line_feed: 1,
      line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '',
      original_size: [], preset_category: '', preset_category_id: '', preset_has_set_alignment: false,
      preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
      relevance_segment: [], shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: '',
      shadow_distance: 0.04, shadow_point: { x: 0.6363961031, y: -0.6363961031 },
      shadow_smoothing: 0.45, shape_clip_x: false, shape_clip_y: false, style_name: '',
      sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0.0,
      text_alpha: 1.0, text_color: '#FFFFFF', text_curve: null, text_preset_resource_id: '',
      text_size: 30, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle',
      typesetting: 0, underline: false, underline_offset: 0.22, underline_width: 0.05,
      use_effect_default_color: true, words: null,
    }));

    const textSegments = textMaterials.map(m => buildCapCutSegmentShell({
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      commonKeyframes: emptyArr,
      enableAdjust: false,
      extraMaterialRefs: emptyArr,
      materialId: m.id,
      renderIndex: 11000,
      sourceDurationUs: m.dur,
      sourceStartUs: 0,
      speed: 1.0,
      targetDurationUs: m.dur,
      targetStartUs: m.start,
      trackRenderIndex: 11000,
    }));

    // ── 오디오 세그먼트 (나레이션 트랙) — 라인 단위 다중 배치 ──
    const audioSegments = audioMaterialsWithStart.map((aMat) => buildCapCutSegmentShell({
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      commonKeyframes: emptyArr,
      enableAdjust: false,
      extraMaterialRefs: emptyArr,
      materialId: aMat.id,
      renderIndex: 0,
      sourceDurationUs: aMat.dur,
      sourceStartUs: 0,
      speed: 1.0,
      targetDurationUs: aMat.dur,
      targetStartUs: aMat.start,
      trackRenderIndex: 0,
    }));
    const keyValueEntries = [
      ...videoSegments.map((segment, index) => ({
        segmentId: String(segment['id'] || ''),
        materialName: videoMaterials[index]?.path || '',
      })).filter((entry) => entry.materialName),
      ...sourceAudioSegmentsWithPath.map(({ path, segment }) => ({
        segmentId: String(segment['id'] || ''),
        materialName: path,
      })).filter((entry) => entry.materialName),
      ...audioSegments.map((segment, index) => ({
        segmentId: String(segment['id'] || ''),
        materialName: audioMaterials[index]?.path || '',
      })).filter((entry) => entry.materialName),
    ];

    // ── draft_content.json 조립 ──
    const draft = {
      canvas_config: { background: '', height: h, ratio: 'original', width: w },
      color_space: 0,
      config: {
        adjust_max_index: 1, attachment_info: emptyArr, combination_max_index: 1,
        export_range: null, extract_audio_last_index: 1, lyrics_recognition_id: '',
        lyrics_sync: false, lyrics_taskinfo: emptyArr, maintrack_adsorb: true,
        material_save_mode: 0, original_sound_last_index: 1, record_audio_last_index: 1,
        sticker_max_index: 1, subtitle_keywords_config: null, subtitle_recognition_id: '',
        subtitle_sync: false, subtitle_taskinfo: emptyArr, system_font_list: emptyArr,
        video_mute: false, zoom_info_params: null,
      },
      cover: null,
      create_time: 0,
      draft_type: 'video',
      duration: totalDurUs,
      extra_info: null,
      function_assistant_info: {
        audio_noise_segid_list: emptyArr,
        auto_adjust: false,
        auto_adjust_fixed: false,
        auto_adjust_fixed_value: 0,
        auto_adjust_segid_list: emptyArr,
        auto_caption: false,
        auto_caption_segid_list: emptyArr,
        auto_caption_template_id: '',
        auto_lyrics: false,
        auto_lyrics_segid_list: emptyArr,
        auto_music: false,
        auto_music_segid_list: emptyArr,
        auto_speed: false,
        auto_speed_conf: '',
        auto_subtitle: false,
        auto_subtitle_segid_list: emptyArr,
        auto_video_beauty: false,
        auto_video_beauty_segid_list: emptyArr,
        beautify_body: false,
        beautify_face: false,
        enable_ai: false,
        remove_background: false,
        video_mosaic: false,
      },
      fps: fps,
      free_render_index_mode_on: false,
      group_container: null,
      id: scaffoldIds.timelineId,
      is_drop_frame_timecode: Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01,
      keyframe_graph_list: emptyArr,
      keyframes: { adjusts: emptyArr, audios: emptyArr, effects: emptyArr, filters: emptyArr, handwrites: emptyArr, stickers: emptyArr, texts: emptyArr, videos: emptyArr },
      last_modified_platform: platformInfo,
      lyrics_effects: emptyArr,
      materials: {
        ...buildCapCutEmptyMaterialBuckets(),
        audios: [
          ...sourceAudioMaterials.map((material) => buildCapCutAudioMaterial({
            id: material.id,
            duration: material.dur,
            fileName: material.path.split('/').pop() || '',
            path: buildCapCutContainedMaterialPath(projectId, 'video', material.path.split('/').pop() || ''),
            videoId: material.videoMaterialId,
          })),
          ...audioMaterials.map((material) => buildCapCutAudioMaterial({
            id: material.id,
            duration: material.dur,
            fileName: material.path.split('/').pop() || '',
            path: buildCapCutContainedMaterialPath(projectId, 'audio', material.path.split('/').pop() || ''),
          })),
        ],
        canvases: [buildCapCutCanvasMaterial(canvasId)],
        drafts: emptyArr,
        effects: emptyArr,
        flowers: emptyArr,
        handwrites: emptyArr,
        head_animations: emptyArr,
        images: emptyArr,
        log_color_wheels: emptyArr,
        loudnesses: emptyArr,
        manual_deformations: emptyArr,
        material_animations: [buildCapCutMaterialAnimation(uuid())],
        material_colors: emptyArr,
        placeholders: emptyArr,
        plugin_effects: emptyArr, realtime_denoises: emptyArr, shapes: emptyArr,
        smart_crops: emptyArr, smart_relayouts: emptyArr,
        speeds: [{ curve_speed: null, id: speedId, mode: 0, name: '', speed: 1.0, type: 'speed' }],
        stickers: emptyArr, tail_animations: emptyArr, text_templates: emptyArr,
        texts: textObjects,
        transitions: emptyArr, video_effects: emptyArr, video_trackings: emptyArr,
        videos: videoMaterials.map((m) => {
          const containedPath = buildCapCutContainedMaterialPath(projectId, m.isPhoto ? 'image' : 'video', m.path.split('/').pop() || '');
          return {
          aigc_history_id: '',
          aigc_item_id: '',
          aigc_type: 'none',
          audio_fade: null,
          beauty_body_auto_preset: null,
          beauty_body_preset_id: '',
          beauty_face_auto_preset: { name: '', preset_id: '', rate_map: '', scene: '' },
          beauty_face_auto_preset_infos: [],
          beauty_face_preset_infos: [],
          cartoon_path: '',
          category_id: '',
          category_name: '',
          check_flag: 62978047,
          content_feature_info: null,
          corner_pin: null,
          crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
          crop_ratio: 'free', crop_scale: 1.0,
          duration: m.dur, extra_type_option: 0, formula_id: '', freeze: null,
          has_audio: !m.isPhoto,
          has_sound_separated: false,
          height: h,
          id: m.id,
          intensifies_audio_path: '', intensifies_path: '', is_ai_generate_content: false,
          is_copyright: false, is_text_edit_overdub: false, is_unified_beauty_mode: false,
          live_photo_cover_path: '',
          live_photo_timestamp: -1,
          local_id: '',
          local_material_from: '',
          local_material_id: '',
          material_id: '',
          material_name: m.path.split('/').pop() || '',
          material_url: '',
          matting: {
            custom_matting_id: '',
            enable_matting_stroke: false,
            expansion: 0,
            feather: 0,
            flag: 0,
            has_use_quick_brush: false,
            has_use_quick_eraser: false,
            interactiveTime: [],
            path: '',
            reverse: false,
            strokes: [],
          },
          media_path: containedPath,
          music_id: '',
          multi_camera_info: null,
          object_locked: null,
          origin_material_id: '',
          path: containedPath,
          picture_from: m.isPhoto ? 'default' : 'none',
          picture_set_category_id: '',
          picture_set_category_name: '',
          request_id: '',
          reverse_intensifies_path: '',
          reverse_path: '',
          smart_match_info: null,
          smart_motion: null,
          source: 0,
          source_platform: 0,
          stable: {
            matrix_path: '',
            stable_level: 0,
            time_range: { duration: 0, start: 0 },
          },
          surface_trackings: [],
          team_id: '',
          type: m.isPhoto ? 'photo' : 'video',
          unique_id: '',
          video_algorithm: {
            ai_background_configs: [],
            ai_expression_driven: null,
            ai_in_painting_config: [],
            ai_motion_driven: null,
            aigc_generate: null,
            aigc_generate_list: [],
            algorithms: [],
            complement_frame_config: null,
            deflicker: null,
            gameplay_configs: [],
            image_interpretation: null,
            motion_blur_config: null,
            mouth_shape_driver: null,
            noise_reduction: null,
            path: '',
            quality_enhance: null,
            skip_algorithm_index: [],
            smart_complement_frame: null,
            story_video_modify_video_config: { is_overwrite_last_video: false, task_id: '', tracker_task_id: '' },
            super_resolution: null,
            time_range: { duration: 0, start: 0 },
          },
          video_mask_shadow: { alpha: 0.0, angle: 0.0, blur: 0.0, color: '', distance: 0.0, path: '', resource_id: '' },
          video_mask_stroke: {
            alpha: 0.0,
            color: '',
            distance: 0.0,
            horizontal_shift: 0.0,
            path: '',
            resource_id: '',
            size: 0.0,
            texture: 0.0,
            type: '',
            vertical_shift: 0.0,
          },
          width: w,
        };
        }),
      },
      mutable_config: null,
      name: '',
      new_version: '163.0.0',
      path: '',
      platform: platformInfo,
      relationships: emptyArr,
      render_index_track_mode_on: true,
      retouch_cover: null,
      smart_ads_info: { draft_url: '', page_from: '', routine: '' },
      source: 'default',
      static_cover_image_path: '',
      time_marks: null,
      tracks: [
        { attribute: 0, flag: 0, id: trackVideoId, is_default_name: true, name: '', segments: videoSegments, type: 'video' },
        ...(sourceAudioSegments.length > 0 ? [{ attribute: 0, flag: 0, id: trackSourceAudioId, is_default_name: true, name: '', segments: sourceAudioSegments, type: 'audio' }] : []),
        ...(textSegments.length > 0 ? [{ attribute: 0, flag: 0, id: trackTextId, is_default_name: true, name: '', segments: textSegments, type: 'text' }] : []),
        ...(audioSegments.length > 0 ? [{ attribute: 0, flag: 0, id: trackAudioId, is_default_name: true, name: '', segments: audioSegments, type: 'audio' }] : []),
      ],
      uneven_animation_template_info: { composition: '', content: '', order: '', sub_template_info_list: emptyArr },
      update_time: 0,
      version: 360000,
    };

    const draftJson = JSON.stringify(draft);
    const editNowTs = Math.floor(Date.now() / 1000);
    const editNowUs = Date.now() * 1000;
    const draftTimelineMaterialsSize = videoMaterials.length + textObjects.length + sourceAudioMaterials.length + audioMaterials.length;
    const draftCoverBlob = await buildCapCutDraftCoverBlob(w, h);
    const attachmentPcTimelineJson = buildCapCutAttachmentPcTimeline();
    const attachmentScriptVideoJson = buildCapCutAttachmentScriptVideo();
    const attachmentActionSceneJson = buildCapCutAttachmentActionScene();
    const attachmentPcCommonJson = buildCapCutAttachmentPcCommon();
    const attachmentEditingJson = buildCapCutAttachmentEditing();
    const draftExtra = buildCapCutOpaqueDraftExtra();
    zip.file(`${projectId}/draft_content.json`, draftJson);
    zip.file(`${projectId}/draft_settings`, buildCapCutDraftSettings(editNowTs, w, h, detectCapCutDesktopPlatform(), draftTimelineMaterialsSize, totalDurUs / 1_000_000));
    zip.file(`${projectId}/draft_info.json`, draftJson);
    zip.file(`${projectId}/draft_meta_info.json`, buildCapCutDraftMetaInfo({
      draftFolderId: projectId,
      draftId: scaffoldIds.draftId,
      title,
      tmDuration: totalDurUs,
      tmDraftModifiedUs: editNowUs,
      draftTimelineMaterialsSize,
    }));
    zip.file(`${projectId}/Timelines/project.json`, buildCapCutTimelineProject(scaffoldIds.timelineProjectId, scaffoldIds.timelineId, editNowUs));
    zip.file(`${projectId}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
    zip.file(`${projectId}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
    zip.file(`${projectId}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
    zip.file(`${projectId}/common_attachment/coperate_create.json`, buildCapCutCooperateCreate());
    zip.file(`${projectId}/attachment_pc_common.json`, attachmentPcCommonJson);
    zip.file(`${projectId}/attachment_editing.json`, attachmentEditingJson);
    zip.file(`${projectId}/timeline_layout.json`, buildCapCutTimelineLayout(scaffoldIds.timelineId));
    zip.file(`${projectId}/draft_virtual_store.json`, buildCapCutDraftVirtualStore());
    zip.file(`${projectId}/key_value.json`, buildCapCutKeyValue(keyValueEntries));
    zip.file(`${projectId}/draft_biz_config.json`, buildCapCutDraftBizConfig(scaffoldIds.timelineId, [
      trackVideoId,
      ...(sourceAudioSegments.length > 0 ? [trackSourceAudioId] : []),
      ...(textSegments.length > 0 ? [trackTextId] : []),
      ...(audioSegments.length > 0 ? [trackAudioId] : []),
    ]));
    zip.file(`${projectId}/draft_agency_config.json`, buildCapCutDraftAgencyConfig());
    zip.file(`${projectId}/performance_opt_info.json`, buildCapCutPerformanceOptInfo());
    zip.file(`${projectId}/draft.extra`, draftExtra);
    zip.file(`${projectId}/crypto_key_store.dat`, buildCapCutOpaqueCryptoKeyStore());
    zip.file(`${projectId}/draft_cover.jpg`, draftCoverBlob);
    addCapCutDesktopInstallerFiles({
      zip,
      projectFolderId: projectId,
    });
    addCapCutMainTimelineMirror({
      zip,
      projectFolderId: projectId,
      mainTimelineId: scaffoldIds.timelineId,
      draftJson,
      attachmentPcCommonJson,
      attachmentEditingJson,
      attachmentPcTimelineJson,
      attachmentScriptVideoJson,
      attachmentActionSceneJson,
      draftExtra,
      draftCover: draftCoverBlob,
    });
  }

  // README (CapCut은 SRT import 가장 안정적이라 SRT 중심으로 안내)
  if (target === 'premiere') {
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '4. media/ 폴더의 이미지/영상이 자동 연결됩니다.',
      '',
      '[ 자막 ]',
      `• "${safeName}_자막.srt" → Captions 트랙으로 가져올 수 있습니다.`,
      '',
      '[ 나레이션 ]',
      narrationClips.length > 0
        ? `• 나레이션 ${narrationClips.length}개가 A2 오디오 트랙에 자동 배치됩니다.`
        : '• audio/ 폴더의 나레이션 MP3를 오디오 트랙에 배치하세요.',
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  } else if (target === 'capcut') {
    zip.file('README.txt', [
      `=== ${title} — CapCut 프로젝트 파일 ===`,
      '',
      '★ Chrome/Edge 등 Chromium 브라우저에서는 앱의 "CapCut에 바로 설치" 흐름을 쓰면 ZIP 압축 해제 없이 바로 설치할 수 있습니다.',
      '★ Safari/Firefox 또는 수동 설치가 필요하면 아래 설치 스크립트를 실행하세요.',
      '1. CapCut 데스크톱을 완전히 종료합니다.',
      '2. ZIP 압축을 해제합니다.',
      `3. Mac은 "${CAPCUT_MAC_INSTALLER_NAME}", Windows는 "${CAPCUT_WINDOWS_BATCH_INSTALLER_NAME}"를 실행합니다.`,
      `4. 스크립트가 "${editRoomCapCutProjectId}" 폴더를 CapCut 프로젝트 경로에 복사하고 media path를 현재 PC 절대경로로 맞춥니다.`,
      '5. 설치가 끝나면 CapCut에서 프로젝트 카드를 열면 됩니다.',
      '6. 이미지/영상, 자막, 나레이션이 모두 타임라인에 배치되어 있습니다.',
      '',
      '[ 수동 복사만 하면 안 되는 이유 ]',
      '• 최신 CapCut 데스크톱은 imported draft의 media path를 상대경로로 둘 경우 Media Not Found가 날 수 있습니다.',
      '• 설치 스크립트가 그 경로를 현재 PC 기준 절대경로로 바꿔줍니다.',
      '',
      '[ 대안 1: SRT 자막 가져오기 ]',
      '1. CapCut에서 새 프로젝트 생성 후 media/ 이미지를 타임라인에 배치',
      `2. 자막 > 자막 가져오기 > "${safeName}_자막.srt" 선택`,
      '',
      '[ 대안 2: XML 가져오기 ]',
      `• File > Import > XML File > "${safeName}.xml"`,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
      narrationClips.length > 0
        ? `• 나레이션 ${narrationClips.length}개 자동 배치`
        : '',
    ].filter(Boolean).join('\n'));
  } else if (target === 'filmora') {
    // [FIX #749] Filmora — FCP XML + SRT (Premiere XML 구조 재활용)
    zip.file('README.txt', [
      `=== ${title} — Filmora ===`,
      '',
      '[ 가져오기 — XML (권장) ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Filmora > File > Import > Import XML File',
      `3. "${safeName}.xml" 선택 → 타임라인에 자동 배치`,
      '4. media/ 폴더의 이미지/영상이 자동 연결됩니다.',
      '',
      '[ 자막 추가 (선택) ]',
      `• "${safeName}_자막.srt" → 자막 가져오기로 추가할 수 있습니다.`,
      '',
      '[ 나레이션 ]',
      narrationClips.length > 0
        ? `• audio/ 폴더의 나레이션 MP3(${narrationClips.length}개)를 오디오 트랙에 배치하세요.`
        : '• 나레이션 없음',
      '',
      '[ 호환 버전 ]',
      '• Filmora 11 이상 권장 (FCP XML import 지원)',
      '• 이전 버전은 SRT import만 사용하세요.',
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  } else {
    // VREW — SRT 자막 중심 (VREW는 XML import 미지원)
    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '[ 사용법 ]',
      '1. VREW를 열고 media/ 폴더의 영상/이미지를 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_자막.srt" 선택`,
      '3. 자막이 타임라인에 자동 배치됩니다.',
      narrationClips.length > 0
        ? `4. audio/ 폴더의 나레이션 MP3(${narrationClips.length}개)를 오디오 트랙에 수동 배치하세요.`
        : null,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
  return { blob, videoCount, imageCount, totalScenes: timeline.length };
}
