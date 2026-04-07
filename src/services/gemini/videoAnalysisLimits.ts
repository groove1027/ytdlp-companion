/**
 * videoAnalysisLimits.ts — [v2.0.1 Phase 4-2] dynamic token + timeout 계산
 *
 * Gemini 3.1 Pro 영상 분석 호출의 maxOutputTokens 와 brower-side timeout 을 영상 길이에
 * 맞춰 단계적으로 산출한다. videoAnalysis.ts 본문에 inline IIFE로 있던 로직을
 * 단위 테스트(vitest) 가능하도록 별도 파일로 분리.
 *
 * Evolink Gemini 3.1 Pro 한도(라이브 검증):
 *   maxOutputTokens 1 ≤ x < 65537 → 65536까지 OK, 65537 이상은 400 reject
 *   본 모듈은 안전 마진으로 65000을 상한으로 사용.
 */

/**
 * 영상 길이(초)에 따라 maxOutputTokens 동적 산출
 *  - 알 수 없거나 ≤ 120s: 8k (짧은 클립)
 *  - 2분~30분: 8k~32k (avgScene 45 또는 90초)
 *  - 30분~60분: 32k~50k (avgScene 90초, 1분당 ~60장면)
 *  - 60분+ (드라마 1화 풀): 50k~65k (avgScene 120초, Gemini 한도 안전 마진)
 */
export function computeVideoAnalysisMaxTokens(durationSec?: number | null): number {
  if (!durationSec || durationSec <= 120) return 8000;
  if (durationSec <= 1800) {
    // 2분~30분: 기존 계산 (avgScene 45초 또는 90초)
    const avgSceneSec = durationSec <= 600 ? 45 : 90;
    const expectedScenes = Math.ceil(durationSec / avgSceneSec);
    return Math.min(32000, Math.max(8000, expectedScenes * 200));
  }
  if (durationSec <= 3600) {
    // 30~60분: 32k~50k 토큰 (1분당 ~830 토큰 = 60장면)
    const expectedScenes = Math.ceil(durationSec / 90);
    return Math.min(50000, Math.max(32000, expectedScenes * 200));
  }
  // 60분+ (드라마 1화 풀): 50k~65k 토큰 한도 (Evolink Gemini 3.1 Pro 안전 마진)
  const expectedScenes = Math.ceil(durationSec / 120);
  return Math.min(65000, Math.max(50000, expectedScenes * 200));
}

/**
 * 영상 길이(초)에 따른 클라이언트-side timeout (ms)
 *  - 단일 영상(≤10분): 110초 (브라우저 ~126초 안전 마진, FIX #679)
 *  - 중간 영상(10~30분): 5분
 *  - 롱폼(30~60분): 10분
 *  - 드라마 1화(60분+): 20분
 */
export function computeVideoAnalysisTimeoutMs(durationSec?: number | null): number {
  if (!durationSec || durationSec <= 600) return 110_000;
  if (durationSec <= 1800) return 5 * 60 * 1000;
  if (durationSec <= 3600) return 10 * 60 * 1000;
  return 20 * 60 * 1000;
}
