/**
 * Vmake AI Service — 영상 자막·워터마크 제거 (컴패니언 프록시 경유)
 *
 * 브라우저 → 로컬 컴패니언(localhost:9876/9877) → Vmake Cloud API
 * CORS 우회를 위해 컴패니언 서버가 Vmake SDK를 대신 호출합니다.
 */

import { getVmakeAk, getVmakeSk } from './apiService';
import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

// 컴패니언 ProPainter 서버 후보 (9876 내장 or 9877 전용)
const PROXY_CANDIDATES = ['http://localhost:9876', 'http://localhost:9877'];
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_COUNT = 200;

/** 사용 가능한 Vmake 프록시 서버 찾기 */
async function findVmakeProxy(): Promise<string | null> {
  for (const url of PROXY_CANDIDATES) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/health`, { signal: controller.signal, mode: 'cors' });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        if (data.propainter || data.features?.inpaint) {
          return url;
        }
      }
    } catch { /* next */ }
  }
  return null;
}

/** Vmake 키가 설정되었는지 확인 */
export function isVmakeConfigured(): boolean {
  return !!(getVmakeAk() && getVmakeSk());
}

/**
 * 영상 자막/워터마크 제거 (Vmake Cloud via 컴패니언 프록시)
 */
export async function removeVideoWatermark(
  videoFile: Blob,
  onProgress?: (msg: string, percent?: number) => void,
): Promise<Blob> {
  const ak = getVmakeAk();
  const sk = getVmakeSk();
  if (!ak || !sk) throw new Error('Vmake API 키가 설정되지 않았습니다.\n⚙️ 설정 → API 키 → Vmake AI 섹션에서 입력하세요.');

  onProgress?.('컴패니언 서버 연결 중...', 2);

  const proxyUrl = await findVmakeProxy();
  if (!proxyUrl) throw new Error('컴패니언 앱이 실행 중이 아닙니다.\n컴패니언 앱을 먼저 실행한 후 다시 시도하세요.');

  logger.info('[Vmake] 프록시 서버 발견', { url: proxyUrl });
  onProgress?.('영상을 컴패니언에 전송 중...', 5);

  // 1) 컴패니언에 영상 + AK/SK 전송
  const formData = new FormData();
  formData.append('video', videoFile, 'video.mp4');
  formData.append('ak', ak);
  formData.append('sk', sk);

  const submitRes = await monitoredFetch(`${proxyUrl}/api/vmake/remove-watermark`, {
    method: 'POST',
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`Vmake 작업 제출 실패 (${submitRes.status}): ${errText}`);
  }

  const { taskId } = await submitRes.json();
  logger.info('[Vmake] 작업 제출 완료', { taskId });
  onProgress?.('Vmake AI가 자막을 분석 중...', 10);

  // 2) 폴링
  for (let i = 0; i < MAX_POLL_COUNT; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const statusRes = await fetch(`${proxyUrl}/api/vmake/status/${taskId}`);
      if (!statusRes.ok) continue;

      const status = await statusRes.json();

      if (status.status === 'completed') {
        onProgress?.('처리 완료! 결과 다운로드 중...', 90);

        const resultRes = await fetch(`${proxyUrl}/api/vmake/result/${taskId}`);
        if (!resultRes.ok) throw new Error('결과 다운로드 실패');

        const blob = await resultRes.blob();
        logger.success('[Vmake] 자막 제거 완료', { size: blob.size });
        onProgress?.('자막 제거 완료!', 100);
        return blob;
      }

      if (status.status === 'failed') {
        throw new Error(`Vmake 처리 실패: ${status.message || '알 수 없는 오류'}`);
      }

      // 진행률
      const pct = Math.max(10, Math.min(85, status.progress || 0));
      const elapsed = Math.round((i + 1) * POLL_INTERVAL_MS / 1000);
      onProgress?.(status.message || `AI가 자막을 제거하는 중... (${elapsed}초)`, pct);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Vmake 처리 실패')) throw err;
      // 네트워크 에러는 무시하고 계속 폴링
    }
  }

  throw new Error('Vmake 처리 시간 초과 (10분)');
}
