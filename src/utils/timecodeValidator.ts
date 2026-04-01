/**
 * [FIX #948] 타임코드 검증 유틸리티
 * VideoAnalysisRoom과 videoAnalysis에서 AI 응답의 타임코드를 검증/교정
 */

/** MM:SS.ms 또는 MM:SS 형식의 타임코드를 초 단위로 변환 */
export function parseTimecodeToSec(tc: string): number {
  if (!tc) return -1;
  const m = tc.match(/(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/);
  if (!m) return -1;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
  return mins * 60 + secs + ms / 1000;
}

export interface TimecodeValidationResult {
  /** 경고 메시지 목록 */
  warnings: string[];
  /** 수정이 필요한지 여부 */
  hasIssues: boolean;
}

/**
 * SceneRow 배열의 타임코드를 검증
 * @param scenes - timecodeSource 필드가 있는 scene 배열
 * @param maxDurationSec - 영상 최대 길이 (초)
 * @returns 검증 결과 (경고 메시지, 수정 여부)
 */
export function validateSceneTimecodes(
  scenes: { timecodeSource?: string; cutNum?: number }[],
  maxDurationSec: number,
): TimecodeValidationResult {
  const warnings: string[] = [];
  if (!maxDurationSec || maxDurationSec <= 0 || scenes.length === 0) {
    return { warnings, hasIssues: false };
  }

  const parsed: { idx: number; sec: number }[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const tc = scenes[i].timecodeSource || '';
    // 범위 형식(00:15~00:20)이면 시작 타임코드 사용
    const first = tc.split(/[~\-–—/]/)[0]?.trim() || '';
    const sec = parseTimecodeToSec(first);
    if (sec >= 0) {
      parsed.push({ idx: i, sec });
    }
  }

  if (parsed.length === 0) return { warnings, hasIssues: false };

  // 1. 범위 초과 체크
  const outOfRange = parsed.filter(p => p.sec > maxDurationSec + 5);
  if (outOfRange.length > 0) {
    warnings.push(`[타임코드] ${outOfRange.length}개 행의 타임코드가 영상 길이(${Math.round(maxDurationSec)}초)를 초과`);
  }

  // 2. 분포 편중 체크 — 모든 타임코드가 영상 앞쪽 20%에 몰려있으면 경고
  const threshold = maxDurationSec * 0.2;
  const allInFirst20 = parsed.every(p => p.sec <= threshold);
  if (allInFirst20 && maxDurationSec >= 120) {
    warnings.push(`[타임코드] 모든 타임코드가 영상 앞부분(${Math.round(threshold)}초 이내)에 집중됨 — 영상 전체 분포 필요`);
  }

  // 3. 역순 체크 (1번 컷 선배치 제외) — 2번째 행부터 시간순 확인
  if (parsed.length >= 3) {
    let inversions = 0;
    for (let i = 2; i < parsed.length; i++) {
      if (parsed[i].sec < parsed[i - 1].sec - 1) {
        inversions++;
      }
    }
    if (inversions > parsed.length * 0.3) {
      warnings.push(`[타임코드] ${inversions}개 행에서 시간순 역전 감지 — 롱폼에서는 시간순 유지 권장`);
    }
  }

  return {
    warnings,
    hasIssues: warnings.length > 0,
  };
}

/**
 * 타임코드 문자열을 maxDuration 범위 내로 클램핑
 * @returns 클램핑된 타임코드 문자열 (원래 형식 유지)
 */
export function clampTimecodeString(tc: string, maxDurationSec: number): string {
  if (!tc || maxDurationSec <= 0) return tc;
  const parts = tc.split(/([~\-–—/])/);
  const clamped = parts.map((part, i) => {
    if (i % 2 === 1) return part; // 구분자는 그대로
    const sec = parseTimecodeToSec(part.trim());
    if (sec < 0) return part;
    if (sec <= maxDurationSec) return part;
    // 클램핑
    const clampedSec = Math.min(sec, maxDurationSec);
    const m = Math.floor(clampedSec / 60);
    const s = clampedSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  });
  return clamped.join('');
}
