/**
 * ElevenLabs Sound Effects V2 서비스 (Kie API 경유)
 *
 * 모델: elevenlabs/sound-effect-v2
 * 텍스트 프롬프트 → 최대 22초 SFX 생성 (로열티프리)
 * API: POST https://api.kie.ai/api/v1/jobs/createTask → GET .../recordInfo?taskId=
 * 인증: Authorization: Bearer {KIE_API_KEY}
 */

import { monitoredFetch, getKieKey } from './apiService';
import { logger } from './LoggerService';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

/** SFX 생성 태스크 생성 */
export async function createSfxTask(
  prompt: string,
  durationSeconds?: number,
): Promise<string> {
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');

  logger.info('[SFX] 효과음 생성 요청', { prompt, durationSeconds });

  const input: Record<string, unknown> = { text: prompt };
  if (durationSeconds && durationSeconds > 0) {
    input.duration_seconds = Math.min(durationSeconds, 22);
  }

  const response = await monitoredFetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'elevenlabs/sound-effect-v2',
      input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
    if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    throw new Error(`SFX 생성 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`SFX 태스크 생성 실패: ${data.msg || '알 수 없는 오류'} (code: ${data.code})`);
  }

  logger.info('[SFX] 태스크 생성 완료', { taskId: data.data.taskId });
  return data.data.taskId;
}

/** SFX 태스크 폴링 — 완료까지 대기 후 오디오 URL 반환 */
export async function pollSfxTask(
  taskId: string,
  onProgress?: (state: string) => void,
  maxAttempts: number = 60,
): Promise<string> {
  const opId = `pollSfxTask-${taskId}`;
  logger.startAsyncOp(opId, 'pollSfxTask', taskId);
  const apiKey = getKieKey();
  logger.info('[SFX] 폴링 시작', { taskId });

  try {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = attempt < 5 ? 2000 : 3000;
    await new Promise(resolve => setTimeout(resolve, delay));

    const response = await monitoredFetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } },
    );

    if (!response.ok) {
      if (response.status === 429) {
        // [FIX #245] Retry-After 헤더 우선, 없으면 지수 백오프
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 5000, 60000) : Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
        logger.trackRetry('SFX 폴링 (429)', attempt + 1, maxAttempts, `Rate limited, ${Math.round(waitMs)}ms 대기`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error(`SFX 폴링 오류 (${response.status})`);
    }

    const data = await response.json();
    const state = data.data?.state;

    onProgress?.(state || 'unknown');

    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      let audioUrl: string | undefined;

      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson);
          audioUrl = parsed.resultUrls?.[0] || parsed.audio_url || parsed.url;
        } catch (e) {
          logger.trackSwallowedError('sfxService:parseResultJson', e);
          audioUrl = resultJson;
        }
      } else if (resultJson) {
        audioUrl = resultJson.resultUrls?.[0] || resultJson.audio_url || resultJson.url;
      }

      if (!audioUrl) throw new Error('SFX 결과에서 오디오 URL을 찾을 수 없습니다.');

      logger.success('[SFX] 생성 완료', { taskId, attempt });
      logger.endAsyncOp(opId, 'completed', audioUrl);
      return audioUrl;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || '알 수 없는 오류';
      throw new Error(`SFX 생성 실패: ${failMsg}`);
    }
  }

  logger.endAsyncOp(opId, 'failed', `SFX 생성 시간 초과 (${maxAttempts}회 폴링 실패)`);
  throw new Error(`SFX 생성 시간 초과 (${maxAttempts}회 폴링 실패)`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.includes('시간 초과')) logger.endAsyncOp(opId, 'failed', errMsg);
    throw err;
  }
}

/** SFX 생성 (createTask + polling 통합) */
export async function generateSfx(
  prompt: string,
  durationSeconds?: number,
  onProgress?: (state: string) => void,
): Promise<string> {
  const taskId = await createSfxTask(prompt, durationSeconds);
  return pollSfxTask(taskId, onProgress);
}

/** 빠른 SFX 프리셋 목록 */
export const SFX_PRESETS: { label: string; prompt: string; icon: string }[] = [
  { label: '폭발', prompt: 'cinematic explosion with debris and rumble', icon: '💥' },
  { label: '우쉬', prompt: 'fast whoosh swoosh transition sound', icon: '💨' },
  { label: '앰비언스', prompt: 'calm ambient background noise nature', icon: '🌿' },
  { label: '타이핑', prompt: 'keyboard typing mechanical keys clicking', icon: '⌨️' },
  { label: '문닫기', prompt: 'door closing shut heavy wooden door', icon: '🚪' },
  { label: '전화벨', prompt: 'phone ringing notification alert sound', icon: '📱' },
  { label: '자동차', prompt: 'car engine starting and revving', icon: '🚗' },
  { label: '비', prompt: 'rain falling on window gentle rainfall', icon: '🌧️' },
  { label: '박수', prompt: 'audience applause clapping crowd cheering', icon: '👏' },
  { label: '카운트다운', prompt: 'countdown timer beep digital clock', icon: '⏱️' },
  { label: '라이저', prompt: 'cinematic riser tension building suspense', icon: '📈' },
  { label: '임팩트', prompt: 'deep bass impact hit cinematic boom', icon: '🔨' },
];
