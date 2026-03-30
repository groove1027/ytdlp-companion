/**
 * Companion Inpaint Service — ProPainter 기반 로컬 자막/워터마크 제거
 *
 * 컴패니언 앱(localhost:9876)의 ProPainter + PaddleOCR 엔드포인트를 호출.
 * 컴패니언 미설치 시 안내 메시지 표시.
 */

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

const COMPANION_URL = 'http://localhost:9876';
const HEALTH_TIMEOUT_MS = 3000;   // [FIX #921] 3초 — 800ms는 Windows에서 ProPainter 초기화 중 미감지 (#907과 동일 원인)
const HEALTH_CACHE_MS = 30_000;
const HEALTH_MAX_RETRIES = 3;     // [FIX #921] 재시도 3회 — 컴패니언 시작 직후 안정화 대기

// ── 컴패니언 인페인트 기능 감지 (캐시) ──

let _inpaintAvailable: boolean | null = null;
let _inpaintCheckTime = 0;
let _inpaintCheckPromise: Promise<boolean> | null = null;
let _cacheGeneration = 0; // [FIX #921] resetInpaintCache 호출 시 stale promise 무효화
const NEGATIVE_CACHE_MS = 5_000; // 실패 시 5초만 캐시 (빠른 재확인)

/** 컴패니언의 ProPainter 기능이 활성화되어 있는지 확인 */
export async function isInpaintAvailable(): Promise<boolean> {
  const now = Date.now();
  const cacheMs = _inpaintAvailable ? HEALTH_CACHE_MS : NEGATIVE_CACHE_MS;
  if (_inpaintAvailable !== null && (now - _inpaintCheckTime) < cacheMs) {
    return _inpaintAvailable;
  }
  if (_inpaintCheckPromise) return _inpaintCheckPromise;

  const gen = _cacheGeneration;
  _inpaintCheckPromise = _doInpaintCheck(gen).finally(() => {
    // [FIX #921] 같은 generation일 때만 promise 해제 — reset 후 새 promise 덮어쓰기 방지
    if (gen === _cacheGeneration) _inpaintCheckPromise = null;
  });
  return _inpaintCheckPromise;
}

async function _doInpaintCheck(gen: number): Promise<boolean> {
  // [FIX #921] 최대 HEALTH_MAX_RETRIES회 재시도 — 컴패니언 시작 직후 Python 초기화 대기
  for (let attempt = 0; attempt < HEALTH_MAX_RETRIES; attempt++) {
    // resetInpaintCache()가 호출되었으면 이 check는 stale — 즉시 종료
    if (gen !== _cacheGeneration) return _inpaintAvailable ?? false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${COMPANION_URL}/health`, {
        signal: controller.signal,
        mode: 'cors',
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        logger.info(`[CompanionInpaint] health ${res.status} (attempt ${attempt + 1}/${HEALTH_MAX_RETRIES})`);
        if (attempt < HEALTH_MAX_RETRIES - 1) { await _sleep(1000); continue; }
        if (gen === _cacheGeneration) { _inpaintAvailable = false; _inpaintCheckTime = Date.now(); }
        return false;
      }
      const data: { features?: { inpaint?: boolean }; propainter?: boolean } = await res.json();
      // resetInpaintCache() 중간 호출 감지
      if (gen !== _cacheGeneration) return _inpaintAvailable ?? false;
      // ProPainter 기능이 명시적으로 활성화된 경우에만 true
      // 기존 yt-dlp 전용 컴패니언은 이 필드가 없으므로 false
      const available = !!(data.features?.inpaint || data.propainter);
      if (available) {
        _inpaintAvailable = true;
        _inpaintCheckTime = Date.now();
        logger.info('[CompanionInpaint] ProPainter 감지 성공');
        return true;
      }
      // [FIX #921] 200 OK지만 ProPainter 미등록 → 시작 중일 수 있으니 재시도
      logger.info(`[CompanionInpaint] health OK but ProPainter not ready (attempt ${attempt + 1}/${HEALTH_MAX_RETRIES})`);
      if (attempt < HEALTH_MAX_RETRIES - 1) { await _sleep(1000); continue; }
      if (gen === _cacheGeneration) { _inpaintAvailable = false; _inpaintCheckTime = Date.now(); }
      return false;
    } catch (err) {
      const reason = err instanceof Error
        ? (err.name === 'AbortError' ? `timeout(${HEALTH_TIMEOUT_MS}ms)` : err.message)
        : 'unknown';
      logger.info(`[CompanionInpaint] health check 실패: ${reason} (attempt ${attempt + 1}/${HEALTH_MAX_RETRIES})`);
      // [FIX #921] 모든 에러에서 재시도 — 컴패니언 시작 직후 포트 미바인딩 시 network error 발생
      // network error는 즉시 실패하므로 총 소요 ~3초 (sleep 1s × 2), timeout은 ~11초 (timeout 3s × 3 + sleep 1s × 2)
      if (attempt < HEALTH_MAX_RETRIES - 1) { await _sleep(1000); continue; }
    }
  }
  if (gen === _cacheGeneration) { _inpaintAvailable = false; _inpaintCheckTime = Date.now(); }
  return false;
}

function _sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** 캐시 초기화 (설정 변경 시) */
export function resetInpaintCache(): void {
  _inpaintAvailable = null;
  _inpaintCheckTime = 0;
  _cacheGeneration++;         // stale in-flight check 무효화
  _inpaintCheckPromise = null; // 진행 중인 promise도 해제
}

// ── OCR 텍스트 영역 감지 ──

export interface TextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
}

/**
 * PaddleOCR로 영상에서 텍스트 영역 감지
 * 서버에 sampleFrames 파라미터를 전달하여 다중 프레임 분석 요청.
 * 서버가 여러 프레임(시작, 중간, 후반)을 샘플링하여 자막 영역을 종합적으로 감지.
 * @param videoFile 영상 파일
 * @param sampleFrames 분석할 프레임 수 (기본 5 — 서버 측에서 균등 간격 추출)
 * @returns 감지된 텍스트 영역 배열 (중복 제거된 합집합)
 */
export async function detectTextRegions(videoFile: Blob, sampleFrames: number = 5): Promise<TextRegion[]> {
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('sampleFrames', String(sampleFrames));

  const res = await monitoredFetch(`${COMPANION_URL}/api/detect-text`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`텍스트 감지 실패 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.regions || [];
}

// ── ProPainter 인페인팅 ──

export interface InpaintMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InpaintProgress {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
}

/**
 * 영상의 특정 영역을 ProPainter로 인페인팅 (자막/워터마크 제거)
 * @param videoFile 영상 파일
 * @param masks 제거할 영역들
 * @param onProgress 진행률 콜백
 * @returns 처리된 영상 Blob
 */
export async function removeSubtitlesWithInpaint(
  videoFile: Blob,
  masks: InpaintMask[],
  onProgress?: (msg: string, percent?: number) => void,
): Promise<Blob> {
  logger.info('[CompanionInpaint] 자막 제거 시작', { masks: masks.length });
  onProgress?.('컴패니언 ProPainter에 작업 전송 중...');

  // 1. 작업 제출
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('masks', JSON.stringify(masks));

  const submitRes = await monitoredFetch(`${COMPANION_URL}/api/inpaint`, {
    method: 'POST',
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`인페인팅 작업 제출 실패 (${submitRes.status}): ${errText}`);
  }

  const { taskId } = await submitRes.json();
  logger.info('[CompanionInpaint] 작업 제출 완료', { taskId });
  onProgress?.('ProPainter 처리 중...', 10);

  // 2. 폴링
  const MAX_POLLS = 360; // 최대 30분 (5초 × 360)
  const POLL_INTERVAL = 5_000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollRes = await monitoredFetch(`${COMPANION_URL}/api/inpaint/status/${taskId}`);
    if (!pollRes.ok) continue;

    const status: InpaintProgress = await pollRes.json();

    if (status.status === 'completed') {
      onProgress?.('처리 완료! 결과 다운로드 중...', 90);

      // 결과 영상 다운로드
      const resultRes = await monitoredFetch(`${COMPANION_URL}/api/inpaint/result/${taskId}`);
      if (!resultRes.ok) {
        throw new Error('처리된 영상 다운로드 실패');
      }
      const resultBlob = await resultRes.blob();
      logger.success('[CompanionInpaint] 자막 제거 완료', { size: resultBlob.size });
      onProgress?.('자막 제거 완료!', 100);
      return resultBlob;
    }

    if (status.status === 'failed') {
      throw new Error(`인페인팅 실패: ${status.message || '알 수 없는 오류'}`);
    }

    // 진행률 업데이트
    const pct = Math.round(10 + (status.progress / 100) * 80); // 10% ~ 90%
    onProgress?.(status.message || `ProPainter 처리 중... (${status.progress}%)`, pct);
  }

  throw new Error('인페인팅 처리 시간 초과 (30분)');
}
