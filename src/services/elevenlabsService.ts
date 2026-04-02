/**
 * ElevenLabs Text-to-Dialogue V3 서비스 (Kie API 경유)
 *
 * 모델: elevenlabs/text-to-dialogue-v3
 * 요청 포맷: input.dialogue = [{ text, voice }] (배열, voice 필수)
 * 파라미터: stability (0~1), language_code (70개 언어)
 * API: POST https://api.kie.ai/api/v1/jobs/createTask → GET .../recordInfo?taskId=
 * 인증: Authorization: Bearer {KIE_API_KEY}
 * 참조: https://docs.kie.ai/market/elevenlabs/text-to-dialogue-v3
 */

import { monitoredFetch, getKieKey } from './apiService';
import { logger } from './LoggerService';
import { mergeAudioFiles, splitTextForTTS, stripSpeakerTags } from './ttsService';
const COMPANION_URL = 'http://127.0.0.1:9876';

/** 컴패니언 Qwen3/Kokoro/Piper TTS로 로컬 음성 합성 시도 */
async function tryCompanionTTS(text: string, languageCode?: string): Promise<{ audioUrl: string; format: string } | null> {
  // [FIX #914] isCompanionDetected() 게이트 제거 — health check 느려도 TTS 엔드포인트 직접 시도
  // connection refused면 catch에서 즉시 null → ElevenLabs 폴백

  try {
    // 컴패니언에 언어를 그대로 전달 (자동 엔진 선택에 필요)
    const lang = languageCode || 'ko';
    logger.info('[TTS] 컴패니언 로컬 TTS 합성 시도 (Qwen3/Kokoro)');
    const res = await fetch(`${COMPANION_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: lang,
        engine: 'auto', // 한국어→Qwen3 우선, 나머지→Kokoro 우선
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size === 0) return null;

    const audioUrl = URL.createObjectURL(blob);
    logger.success('[TTS] 컴패니언 로컬 TTS 성공', { size: blob.size });
    return { audioUrl, format: 'wav' };
  } catch (e) {
    logger.warn('[TTS] 컴패니언 로컬 TTS 실패 — ElevenLabs 폴백:', e instanceof Error ? e.message : '');
    return null;
  }
}

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

export interface ElevenLabsDialogueOptions {
  text: string;
  voiceId?: string;          // premade 이름(Sarah, Adam 등) 또는 커뮤니티 voice ID
  stability?: number;        // 0~1, default 0.5
  languageCode?: string;     // 'auto' | 'ko' | 'en' | 'ja' | ... (70+ languages)
}

/**
 * ElevenLabs Text-to-Dialogue V3 TTS 생성 (Kie API 경유)
 * 5000자 초과 시 자동 청킹 → 개별 생성 → 오디오 병합
 */
export const generateElevenLabsDialogueTTS = async (
  options: ElevenLabsDialogueOptions
): Promise<{ audioUrl: string; format: string }> => {
  // [v4.7] 1순위: 컴패니언 Piper TTS (로컬, 무료)
  // 특정 음성(voiceId)이 지정된 경우 → ElevenLabs만 해당 음성 지원, 컴패니언 스킵
  const cleanedText = stripSpeakerTags(options.text);
  if (!options.voiceId || options.voiceId === 'Sarah') {
    const companionResult = await tryCompanionTTS(cleanedText, options.languageCode);
    if (companionResult) return companionResult;
  }

  // 2순위: ElevenLabs via Kie API (클라우드)
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다. 헬퍼 앱을 설치하면 무료로 사용 가능합니다.');
  const cleanedOptions = { ...options, text: cleanedText };
  if (!cleanedOptions.text.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

  // 4500자 초과 시 자동 청킹
  if (cleanedOptions.text.length > 4500) {
    const chunks = splitTextForTTS(cleanedOptions.text, 4500);
    logger.info('[ElevenLabs] 자동 청킹', { totalLength: cleanedOptions.text.length, chunkCount: chunks.length });

    const audioUrls: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      logger.info(`[ElevenLabs] 청크 ${i + 1}/${chunks.length} 생성 중 (${chunks[i].length}자)`);
      const result = await generateSingleChunk({ ...cleanedOptions, text: chunks[i] }, apiKey);
      audioUrls.push(result.audioUrl);
    }

    if (audioUrls.length === 1) return { audioUrl: audioUrls[0], format: 'mp3' };
    const mergedUrl = await mergeAudioFiles(audioUrls);
    logger.success('[ElevenLabs] 청크 병합 완료', { chunks: chunks.length });
    return { audioUrl: mergedUrl, format: 'wav' };
  }

  return generateSingleChunk(cleanedOptions, apiKey);
};

// [FIX #363] KIE API 지원 음성 — ELEVENLABS_VOICES에서 id만 추출한 화이트리스트
// 이 Set에 없는 음성 ID는 API 호출 전에 'Sarah'로 교체하여 422 에러 원천 차단
const VALID_KIE_VOICES = new Set([
  // 프리메이드 이름
  'Adam', 'Alice', 'Bill', 'Brian', 'Callum', 'Charlie', 'Chris', 'Daniel',
  'Eric', 'George', 'Harry', 'Jessica', 'Laura', 'Liam', 'Lily', 'Matilda',
  'River', 'Roger', 'Sarah', 'Will',
  // 프리메이드 음성의 Voice ID 버전 (이전 저장 데이터 호환)
  'pNInz6obpgDQGcFmaJgB', 'nPczCjzI2devNBz1zQrb', 'FGY2WhTYpPnrIDTdsKH5',
  'cgSgspJ2msm6clMCkdW9', 'SOYHLrjzK2X1ezoPC6cr', 'N2lVS1w4EtoT3dr4eOWO',
  'TX3LPaxmHKxFdv7VOQHJ', 'iP95p4xoKVk53GoZ742B',
  // KIE 지원 커뮤니티 Voice ID (docs.kie.ai 기준)
  'Sm1seazb4gs7RSlUVw7c', 'BIvP0GN1cAtSRTxNHnWS', 'aMSt68OGf4xUZAnLpTU8',
  'RILOU7YmBhvwJGDGjNmP', 'EkK5I93UQWFDigLMpZcX', 'Z3R5wn05IrDiVCyEkUrK',
  'tnSpp4vdxKPjI9w0GnoV', 'NNl6r8mD7vthiJatiJt1', 'YOq2y2Up4RgXP2HyXjE5',
  'Bj9UqZbhQsanLzgalpEG', 'c6SfcYrb2t09NHXiT80T', 'B8gJV1IhpuegLxdpXFOE',
  'exsUS4vynmxd379XN4yO', 'BpjGufoPiobT79j2vtj4', '2zRM7PkgwBPiau2jvVXc',
  '1SM7GgM6IMuvQlz2BwM3', 'ouL9IsyrSnUkCmfnD02u', '5l5f8iK3YPeGga21rQIX',
  'scOwDtmlUjD3prqpp97I', 'NOpBlnGInO9m6vDvFkFC', 'BZgkqPqms7Kj9ulSkVzn',
  'wo6udizrrtpIxWGp2qJk', 'yjJ45q8TVCrtMhEKurxY', 'gU0LNdkMOQCOrPrwtbee',
  'DGzg6RaUqxGRTHSBjfgF', 'DGTOOUoGpoP6UZ9uSWfA', 'x70vRnQBMBu4FAYhjJbO',
  'P1bg08DkjqiVEzOn76yG', 'qDuRKMlYmrm8trt5QyBn', 'kUUTqKQ05NMGulF08DDf',
  'qXpMhyvQqiRxWQs4qSSB', 'TX3LPaxmHKxFdv7VOQHJ', 'iP95p4xoKVk53GoZ742B',
  'SOYHLrjzK2X1ezoPC6cr', 'N2lVS1w4EtoT3dr4eOWO', 'FGY2WhTYpPnrIDTdsKH5',
  'XB0fDUnXU5powFXDhCwa', 'cgSgspJ2msm6clMCkdW9', 'MnUw1cSnpiLoLhpd3Hqp',
  'kPzsL2i3teMYv0FxEYQ6', 'UgBBYS2sOqTuMpoF3BR0', 'IjnA9kwZJHJ20Fp7Vmy6',
  'KoQQbl9zjAdLgKZjm8Ol', 'hpp4J3VqNfWAUOO0d1Us', 'pNInz6obpgDQGcFmaJgB',
  'nPczCjzI2devNBz1zQrb', 'L0Dsvb3SLTyegXwtm47J', 'uYXf8XasLslADfZ2MB4u',
  'gs0tAILXbY5DNrJrsM6F', 'DTKMou8ccj1ZaWGBiotd', 'vBKc2FfBKJfcZNyEt1n6',
  'TmNe0cCqkZBMwPWOd3RD', 'DYkrAHD8iwork3YSUBbs', '56AoDkrOh6qfVPDXZ7Pt',
  'eR40ATw9ArzDf9h3v7t7', 'g6xIsTj2HwM6VR4iXFCw', 'lcMyyd2HUfFzxdCaC4Ta',
  '6aDn1KB0hjpdcocrUkmq', 'Sq93GQT4X1lKDXsQcixO', 'vfaqCOvlrKi4Zp7C2IAm',
  'piI8Kku0DcvcL6TTSeQt', 'KTPVrSVAEUSJRClDzBw7', 'flHkNRp1BlvT73UL6gyz',
  '9yzdeviXkFddZ4Oz8Mok', 'pPdl9cQBQq4p6mRkZy2Z', '0SpgpJ4D3MpHCiWdyTg3',
  'UFO0Yv86wqRxAt1DmXUu', 'oR4uRy4fHDUGGISL0Rev', 'zYcjlYFOd3taleS0gkk3',
  'nzeAacJi50IvxcyDnMXa', 'ruirxsoakN0GWmGNIo04', '1KFdM0QCwQn4rmn5nn9C',
  'TC0Zp7WVFzhA8zpTlRqV', 'ljo9gAlSqKOvF6D8sOsX', 'PPzYpIqttlTYA83688JI',
  'ZF6FPAbjXT4488VcRRnw', '8JVbfL6oEdmuxKn5DK2C', 'iCrDUkL56s3C8sCRl7wb',
  '1hlpeD1ydbI2ow0Tt3EW', 'wJqPPQ618aTW29mptyoc', 'EiNlNiXeDU1pqqOPrYMO',
  'FUfBrNit0NNZAwb58KWH', '4YYIPFl9wE5c4L2eu2Gb', 'OYWwCdDHouzDwiZJWOOu',
  '6F5Zhi321D3Oq7v1oNT4', 'qNkzaJoHLLdpvgh5tISm', 'YXpFCvM1S3JbWEJhoskW',
  '9PVP7ENhDskL0KYHAKtD', 'LG95yZDEHg6fCZdQjLqj', 'CeNX9CMwmxDxUF5Q2Inm',
  'st7NwhTPEzqo2riw7qWC', 'aD6riP1btT197c6dACmy', 'FF7KdobWPaiR0vkcALHF',
  'mtrellq69YZsNwzUSyXh', 'dHd5gvgSOzSfduK4CvEg', 'cTNP6ZM2mLTKj2BFhxEh',
  'eVItLK1UvXctxuaRV2Oq', 'U1Vk2oyatMdYs096Ety7', 'esy0r39YPLQjOczyOib8',
  'bwCXcoVxWNYMlC6Esa8u', 'D2jw4N9m4xePLTQ3IHjU', 'Tsns2HvNFKfGiNjllgqo',
  'Atp5cNFg1Wj5gyKD7HWV', '1cxc5c3E9K6F1wlqOJGV', '1U02n4nD6AdIZ9CjF053',
  'HgyIHe81F3nXywNwkraY', 'AeRdCCKzvd23BpJoofzx', 'LruHrtVF6PSyGItzMNHS',
  'Qggl4b0xRMiqOwhPtVWT', 'zA6D7RyKdc2EClouEMkP', '1wGbFxmAM3Fgw63G1zZJ',
  'hqfrgApggtO1785R4Fsn', 'sH0WdfE5fsKuM2otdQZr', 'MJ0RnG71ty4LH3dvNfSd',
]);

/** 단일 청크 TTS 생성 — dialogue 배열 포맷 사용 */
const generateSingleChunk = async (
  options: ElevenLabsDialogueOptions,
  apiKey: string,
): Promise<{ audioUrl: string; format: string }> => {
  const {
    text,
    voiceId = 'Sarah',
    stability = 0.5,
    languageCode = '',
  } = options;

  // KIE API는 'auto'를 지원하지 않음 — 빈 문자열이 자동 감지
  const resolvedLangCode = languageCode === 'auto' ? '' : languageCode;

  // [FIX #363] API 호출 전 음성 ID 유효성 검증 — 미지원 음성은 API 호출 없이 즉시 교체
  const resolvedVoice = VALID_KIE_VOICES.has(voiceId) ? voiceId : 'Sarah';
  if (resolvedVoice !== voiceId) {
    logger.info(`[ElevenLabs] ⚠️ 음성 "${voiceId}" 미지원 → "Sarah"로 자동 교체 (API 호출 전 차단)`);
  }

  // [FIX #363] Dialogue V3 stability는 Enum(0, 0.5, 1)만 허용 — 가장 가까운 값으로 보정
  const resolvedStability = stability <= 0.25 ? 0 : stability >= 0.75 ? 1 : 0.5;

  logger.info('[ElevenLabs] Dialogue V3 생성 요청 (Kie 경유)', {
    voiceId: resolvedVoice,
    textLength: text.length,
    stability: resolvedStability,
    languageCode: resolvedLangCode,
  });

  const input: Record<string, unknown> = {
    dialogue: [{ text, voice: resolvedVoice }],
    stability: resolvedStability,
    ...(resolvedLangCode ? { language_code: resolvedLangCode } : {}),
  };

  // [FIX #920] createTask에 30초 타임아웃 — 네트워크 장애 시 교착 방지
  const response = await monitoredFetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'elevenlabs/text-to-dialogue-v3',
      input,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
    if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    throw new Error(`ElevenLabs Dialogue V3 생성 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`ElevenLabs Dialogue V3 태스크 생성 실패: ${data.msg || '알 수 없는 오류'} (code: ${data.code})`);
  }
  const taskId = data.data.taskId;

  const audioUrl = await pollDialogueTask(taskId, apiKey);

  logger.success('[ElevenLabs] Dialogue V3 생성 완료 (Kie 경유)', { voiceId: resolvedVoice });
  return { audioUrl, format: 'mp3' };
};

/** Kie TTS 태스크 폴링
 * [FIX #920] maxAttempts 축소(60→40) + 네트워크 에러 허용(3회) + 전체 타임아웃(150초)
 */
const pollDialogueTask = async (taskId: string, apiKey: string, maxAttempts: number = 40): Promise<string> => {
  logger.info('[ElevenLabs] 폴링 시작', { taskId });
  const startTime = Date.now();
  const TOTAL_TIMEOUT_MS = 150_000; // 전체 폴링 2.5분 제한
  let networkErrorCount = 0;
  const MAX_NETWORK_ERRORS = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // [FIX #920] 전체 타임아웃 체크
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      throw new Error(`ElevenLabs 생성 시간 초과 (${Math.round(TOTAL_TIMEOUT_MS / 1000)}초 경과, taskId: ${taskId})`);
    }

    const delay = attempt < 5 ? 2000 : 3000;
    await new Promise(resolve => setTimeout(resolve, delay));

    let response: Response;
    try {
      response = await monitoredFetch(
        `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
        {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000), // [FIX #920] 개별 폴링 요청 15초 타임아웃
        },
      );
    } catch (fetchErr) {
      // [FIX #920] 네트워크 에러(timeout, DNS 실패 등) — 일정 횟수까지 허용 후 포기
      networkErrorCount++;
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      logger.warn(`[ElevenLabs] 폴링 네트워크 에러 (${networkErrorCount}/${MAX_NETWORK_ERRORS})`, { taskId, error: errMsg });
      if (networkErrorCount >= MAX_NETWORK_ERRORS) {
        throw new Error(`ElevenLabs 폴링 네트워크 에러 ${MAX_NETWORK_ERRORS}회 연속 (taskId: ${taskId}): ${errMsg}`);
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
      continue;
    }

    if (!response.ok) {
      if (response.status === 429) {
        // [FIX #245] Retry-After 헤더 우선, 없으면 지수 백오프
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 5000, 60000) : Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
        logger.trackRetry('ElevenLabs 폴링 (429)', attempt + 1, maxAttempts, `Rate limited, ${Math.round(waitMs)}ms 대기`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error(`ElevenLabs 폴링 오류 (${response.status})`);
    }

    // 폴링 성공 시 네트워크 에러 카운터 리셋
    networkErrorCount = 0;

    const data = await response.json();
    const state = data.data?.state;

    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      let audioUrl: string | undefined;

      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson);
          audioUrl = parsed.resultUrls?.[0] || parsed.audio_url || parsed.url;
        } catch (e) {
          logger.trackSwallowedError('elevenlabsService:parseResultJson', e);
          audioUrl = resultJson;
        }
      } else if (resultJson) {
        audioUrl = resultJson.resultUrls?.[0] || resultJson.audio_url || resultJson.url;
      }

      if (!audioUrl) throw new Error('ElevenLabs 결과에서 오디오 URL을 찾을 수 없습니다.');

      logger.success('[ElevenLabs] 폴링 완료', { taskId, attempt, elapsed: `${Math.round((Date.now() - startTime) / 1000)}초` });
      return audioUrl;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || '알 수 없는 오류';
      throw new Error(`ElevenLabs 생성 실패: ${failMsg}`);
    }
  }

  throw new Error(`ElevenLabs 생성 시간 초과 (${maxAttempts}회 폴링 실패, taskId: ${taskId})`);
};

/** ElevenLabs 지원 언어 목록 (주요 30개) */
export const ELEVENLABS_LANGUAGES: { code: string; name: string; flag: string }[] = [
  { code: 'auto', name: '자동 감지', flag: '\uD83C\uDF10' },
  { code: 'ko', name: '한국어', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  { code: 'en', name: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'ja', name: '日本語', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'zh', name: '中文', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  { code: 'es', name: 'Espa\u00F1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  { code: 'fr', name: 'Fran\u00E7ais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { code: 'de', name: 'Deutsch', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  { code: 'pt', name: 'Portugu\u00EAs', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  { code: 'it', name: 'Italiano', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  { code: 'nl', name: 'Nederlands', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
  { code: 'pl', name: 'Polski', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
  { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  { code: 'tr', name: 'T\u00FCrk\u00E7e', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
  { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
  { code: 'hi', name: '\u0939\u093F\u0928\u094D\u0926\u0940', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { code: 'sv', name: 'Svenska', flag: '\uD83C\uDDF8\uD83C\uDDEA' },
  { code: 'da', name: 'Dansk', flag: '\uD83C\uDDE9\uD83C\uDDF0' },
  { code: 'fi', name: 'Suomi', flag: '\uD83C\uDDEB\uD83C\uDDEE' },
  { code: 'no', name: 'Norsk', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
  { code: 'vi', name: 'Ti\u1EBFng Vi\u1EC7t', flag: '\uD83C\uDDFB\uD83C\uDDF3' },
  { code: 'th', name: '\u0E44\u0E17\u0E22', flag: '\uD83C\uDDF9\uD83C\uDDED' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '\uD83C\uDDF2\uD83C\uDDFE' },
  { code: 'uk', name: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
  { code: 'cs', name: '\u010Ce\u0161tina', flag: '\uD83C\uDDE8\uD83C\uDDFF' },
  { code: 'el', name: '\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC', flag: '\uD83C\uDDEC\uD83C\uDDF7' },
  { code: 'ro', name: 'Rom\u00E2n\u0103', flag: '\uD83C\uDDF7\uD83C\uDDF4' },
  { code: 'hu', name: 'Magyar', flag: '\uD83C\uDDED\uD83C\uDDFA' },
  { code: 'bg', name: '\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438', flag: '\uD83C\uDDE7\uD83C\uDDEC' },
];

export interface ElevenLabsVoice {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  accent: string;
  description: string;
  useCase: string;
  age: string;
  previewUrl: string;
}

/**
 * ElevenLabs Dialogue V3 지원 음성 목록
 * 프리메이드 21개 + KIE API 지원 커뮤니티 105개 = 총 126개
 * [FIX #363] KIE API에서 지원하지 않는 커뮤니티 음성 366개 제거 — 사용자에게 오류 없는 목록만 표시
 */
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  // ── 프리메이드 (21개, ElevenLabs 공식 API /v1/voices 기준) ──
  { id: 'Sarah', name: 'Sarah', gender: 'female', accent: 'american', description: 'Mature, Reassuring, Confident', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3' },
  { id: 'Laura', name: 'Laura', gender: 'female', accent: 'american', description: 'Enthusiast, Quirky Attitude', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/FGY2WhTYpPnrIDTdsKH5/67341759-ad08-41a5-be6e-de12fe448618.mp3' },
  { id: 'Alice', name: 'Alice', gender: 'female', accent: 'british', description: 'Clear, Engaging Educator', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3' },
  { id: 'Jessica', name: 'Jessica', gender: 'female', accent: 'american', description: 'Playful, Bright, Warm', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3' },
  { id: 'Lily', name: 'Lily', gender: 'female', accent: 'british', description: 'Velvety Actress', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3' },
  { id: 'Matilda', name: 'Matilda', gender: 'female', accent: 'american', description: 'Knowledgable, Professional', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', gender: 'female', accent: 'american', description: 'Professional, Bright, Warm', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3' },
  { id: 'Roger', name: 'Roger', gender: 'male', accent: 'american', description: 'Laid-Back, Casual, Resonant', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3' },
  { id: 'George', name: 'George', gender: 'male', accent: 'british', description: 'Warm, Captivating Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/JBFqnCBsd6RMkjVDRZzb/e6206d1a-0721-4787-aafb-06a6e705cac5.mp3' },
  { id: 'Charlie', name: 'Charlie', gender: 'male', accent: 'australian', description: 'Deep, Confident, Energetic', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/102de6f2-22ed-43e0-a1f1-111fa75c5481.mp3' },
  { id: 'Callum', name: 'Callum', gender: 'male', accent: 'american', description: 'Husky Trickster', useCase: 'characters_animation', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' },
  { id: 'Harry', name: 'Harry', gender: 'male', accent: 'american', description: 'Fierce Warrior', useCase: 'characters_animation', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3' },
  { id: 'Liam', name: 'Liam', gender: 'male', accent: 'american', description: 'Energetic, Social Media Creator', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3' },
  { id: 'Will', name: 'Will', gender: 'male', accent: 'american', description: 'Relaxed Optimist', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3' },
  { id: 'Eric', name: 'Eric', gender: 'male', accent: 'american', description: 'Smooth, Trustworthy', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3' },
  { id: 'Chris', name: 'Chris', gender: 'male', accent: 'american', description: 'Charming, Down-to-Earth', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/iP95p4xoKVk53GoZ742B/3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3' },
  { id: 'Brian', name: 'Brian', gender: 'male', accent: 'american', description: 'Deep, Resonant and Comforting', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/2dd3e72c-4fd3-42f1-93ea-abc5d4e5aa1d.mp3' },
  { id: 'Daniel', name: 'Daniel', gender: 'male', accent: 'british', description: 'Steady Broadcaster', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3' },
  { id: 'Adam', name: 'Adam', gender: 'male', accent: 'american', description: 'Dominant, Firm', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },
  { id: 'Bill', name: 'Bill', gender: 'male', accent: 'american', description: 'Wise, Mature, Balanced', useCase: 'advertisement', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pqHfZKP75CvOlQylNhV4/d782b3ff-84ba-4029-848c-acf01285524d.mp3' },
  { id: 'River', name: 'River', gender: 'neutral', accent: 'american', description: 'Relaxed, Neutral, Informative', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3' },
  // ── KIE API 지원 커뮤니티 음성 (105개, docs.kie.ai 기준) ──
  // [FIX] accent/age/useCase: KIE 문서에 미제공 — 빈 값 (가짜 'standard' 제거, ElevenLabs API 인증 시 업데이트 가능)
  { id: 'Sm1seazb4gs7RSlUVw7c', name: 'Anika', gender: 'female', accent: '', description: 'Animated, Friendly and Engaging', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Sm1seazb4gs7RSlUVw7c.mp3' },
  { id: 'BIvP0GN1cAtSRTxNHnWS', name: 'Ellen', gender: 'female', accent: '', description: 'Serious, Direct and Confident', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/BIvP0GN1cAtSRTxNHnWS.mp3' },
  { id: 'aMSt68OGf4xUZAnLpTU8', name: 'Juniper', gender: 'female', accent: '', description: 'Grounded and Professional', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/aMSt68OGf4xUZAnLpTU8.mp3' },
  { id: 'RILOU7YmBhvwJGDGjNmP', name: 'Jane', gender: 'female', accent: '', description: 'Professional Audiobook Reader', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/RILOU7YmBhvwJGDGjNmP.mp3' },
  { id: 'EkK5I93UQWFDigLMpZcX', name: 'James', gender: 'male', accent: '', description: 'Husky, Engaging and Bold', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/EkK5I93UQWFDigLMpZcX.mp3' },
  { id: 'Z3R5wn05IrDiVCyEkUrK', name: 'Arabella', gender: 'female', accent: '', description: 'Mysterious and Emotive', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Z3R5wn05IrDiVCyEkUrK.mp3' },
  { id: 'tnSpp4vdxKPjI9w0GnoV', name: 'Hope', gender: 'female', accent: '', description: 'Upbeat and Clear', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/tnSpp4vdxKPjI9w0GnoV.mp3' },
  { id: 'NNl6r8mD7vthiJatiJt1', name: 'Bradford', gender: 'male', accent: '', description: 'Expressive and Articulate', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/NNl6r8mD7vthiJatiJt1.mp3' },
  { id: 'YOq2y2Up4RgXP2HyXjE5', name: 'Xavier', gender: 'male', accent: '', description: 'Dominating, Metallic Announcer', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/YOq2y2Up4RgXP2HyXjE5.mp3' },
  { id: 'Bj9UqZbhQsanLzgalpEG', name: 'Austin', gender: 'male', accent: '', description: 'Deep, Raspy and Authentic', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Bj9UqZbhQsanLzgalpEG.mp3' },
  { id: 'c6SfcYrb2t09NHXiT80T', name: 'Jarnathan', gender: 'male', accent: '', description: 'Confident and Versatile', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/c6SfcYrb2t09NHXiT80T.mp3' },
  { id: 'B8gJV1IhpuegLxdpXFOE', name: 'Kuon', gender: 'male', accent: '', description: 'Cheerful, Clear and Steady', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/B8gJV1IhpuegLxdpXFOE.mp3' },
  { id: 'exsUS4vynmxd379XN4yO', name: 'Blondie', gender: 'female', accent: '', description: 'Conversational', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/exsUS4vynmxd379XN4yO.mp3' },
  { id: 'BpjGufoPiobT79j2vtj4', name: 'Priyanka', gender: 'female', accent: '', description: 'Calm, Neutral and Relaxed', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/BpjGufoPiobT79j2vtj4.mp3' },
  { id: '2zRM7PkgwBPiau2jvVXc', name: 'Monika Sogam', gender: 'female', accent: '', description: 'Deep and Natural', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/2zRM7PkgwBPiau2jvVXc.mp3' },
  { id: '1SM7GgM6IMuvQlz2BwM3', name: 'Mark', gender: 'male', accent: '', description: 'Casual, Relaxed and Light', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1SM7GgM6IMuvQlz2BwM3.mp3' },
  { id: 'ouL9IsyrSnUkCmfnD02u', name: 'Grimblewood Thornwhisker', gender: 'male', accent: '', description: 'Snarky Gnome', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/ouL9IsyrSnUkCmfnD02u.mp3' },
  { id: '5l5f8iK3YPeGga21rQIX', name: 'Adeline', gender: 'female', accent: '', description: 'Feminine and Conversational', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/5l5f8iK3YPeGga21rQIX.mp3' },
  { id: 'scOwDtmlUjD3prqpp97I', name: 'Sam', gender: 'male', accent: '', description: 'Support Agent', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/scOwDtmlUjD3prqpp97I.mp3' },
  { id: 'NOpBlnGInO9m6vDvFkFC', name: 'Spuds Oxley', gender: 'male', accent: '', description: 'Wise and Approachable', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/NOpBlnGInO9m6vDvFkFC.mp3' },
  { id: 'BZgkqPqms7Kj9ulSkVzn', name: 'Eve', gender: 'female', accent: '', description: 'Authentic, Energetic and Happy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/BZgkqPqms7Kj9ulSkVzn.mp3' },
  { id: 'wo6udizrrtpIxWGp2qJk', name: 'Northern Terry', gender: 'male', accent: '', description: 'Northern Accent', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/wo6udizrrtpIxWGp2qJk.mp3' },
  { id: 'yjJ45q8TVCrtMhEKurxY', name: 'Dr. Von', gender: 'male', accent: '', description: 'Quirky, Mad Scientist', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/yjJ45q8TVCrtMhEKurxY.mp3' },
  { id: 'gU0LNdkMOQCOrPrwtbee', name: 'British Football Announcer', gender: 'male', accent: '', description: 'Energetic Announcer', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/gU0LNdkMOQCOrPrwtbee.mp3' },
  { id: 'DGzg6RaUqxGRTHSBjfgF', name: 'Brock', gender: 'male', accent: '', description: 'Commanding and Loud Sergeant', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/DGzg6RaUqxGRTHSBjfgF.mp3' },
  { id: 'DGTOOUoGpoP6UZ9uSWfA', name: 'Célian', gender: 'male', accent: '', description: 'Documentary Narrator', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/DGTOOUoGpoP6UZ9uSWfA.mp3' },
  { id: 'x70vRnQBMBu4FAYhjJbO', name: 'Nathan', gender: 'male', accent: '', description: 'Virtual Radio Host', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/x70vRnQBMBu4FAYhjJbO.mp3' },
  { id: 'P1bg08DkjqiVEzOn76yG', name: 'Viraj', gender: 'male', accent: '', description: 'Rich and Soft', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/P1bg08DkjqiVEzOn76yG.mp3' },
  { id: 'qDuRKMlYmrm8trt5QyBn', name: 'Taksh', gender: 'male', accent: '', description: 'Calm, Serious and Smooth', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/qDuRKMlYmrm8trt5QyBn.mp3' },
  { id: 'kUUTqKQ05NMGulF08DDf', name: 'Guadeloupe Merryweather', gender: 'female', accent: '', description: 'Emotional', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/kUUTqKQ05NMGulF08DDf.mp3' },
  { id: 'qXpMhyvQqiRxWQs4qSSB', name: 'Horatius', gender: 'male', accent: '', description: 'Energetic Character Voice', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/qXpMhyvQqiRxWQs4qSSB.mp3' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', accent: '', description: 'Elegant and Refined', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/XB0fDUnXU5powFXDhCwa.mp3' },
  { id: 'MnUw1cSnpiLoLhpd3Hqp', name: 'Heather Rey', gender: 'female', accent: '', description: 'Rushed and Friendly', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/MnUw1cSnpiLoLhpd3Hqp.mp3' },
  { id: 'kPzsL2i3teMYv0FxEYQ6', name: 'Brittney', gender: 'female', accent: '', description: 'Fun, Youthful and Informative', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/kPzsL2i3teMYv0FxEYQ6.mp3' },
  { id: 'UgBBYS2sOqTuMpoF3BR0', name: 'Mark', gender: 'male', accent: '', description: 'Natural Conversations', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/UgBBYS2sOqTuMpoF3BR0.mp3' },
  { id: 'IjnA9kwZJHJ20Fp7Vmy6', name: 'Matthew', gender: 'male', accent: '', description: 'Casual, Friendly and Smooth', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/IjnA9kwZJHJ20Fp7Vmy6.mp3' },
  { id: 'KoQQbl9zjAdLgKZjm8Ol', name: 'Pro Narrator', gender: 'male', accent: '', description: 'Convincing Story Teller', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/KoQQbl9zjAdLgKZjm8Ol.mp3' },
  { id: 'L0Dsvb3SLTyegXwtm47J', name: 'Archer', gender: 'male', accent: '', description: 'Adventurous and Bold', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/L0Dsvb3SLTyegXwtm47J.mp3' },
  { id: 'uYXf8XasLslADfZ2MB4u', name: 'Hope', gender: 'female', accent: '', description: 'Bubbly, Gossipy and Girly', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/uYXf8XasLslADfZ2MB4u.mp3' },
  { id: 'gs0tAILXbY5DNrJrsM6F', name: 'Jeff', gender: 'male', accent: '', description: 'Classy, Resonating and Strong', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/gs0tAILXbY5DNrJrsM6F.mp3' },
  { id: 'DTKMou8ccj1ZaWGBiotd', name: 'Jamahal', gender: 'male', accent: '', description: 'Young, Vibrant, and Natural', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/DTKMou8ccj1ZaWGBiotd.mp3' },
  { id: 'vBKc2FfBKJfcZNyEt1n6', name: 'Finn', gender: 'male', accent: '', description: 'Youthful, Eager and Energetic', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/vBKc2FfBKJfcZNyEt1n6.mp3' },
  { id: 'TmNe0cCqkZBMwPWOd3RD', name: 'Smith', gender: 'male', accent: '', description: 'Mellow, Spontaneous, and Bassy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/TmNe0cCqkZBMwPWOd3RD.mp3' },
  { id: 'DYkrAHD8iwork3YSUBbs', name: 'Tom', gender: 'male', accent: '', description: 'Conversations and Books', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/DYkrAHD8iwork3YSUBbs.mp3' },
  { id: '56AoDkrOh6qfVPDXZ7Pt', name: 'Cassidy', gender: 'female', accent: '', description: 'Crisp, Direct and Clear', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/56AoDkrOh6qfVPDXZ7Pt.mp3' },
  { id: 'eR40ATw9ArzDf9h3v7t7', name: 'Addison 2.0', gender: 'female', accent: '', description: 'Australian Audiobook and Podcast', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/eR40ATw9ArzDf9h3v7t7.mp3' },
  { id: 'g6xIsTj2HwM6VR4iXFCw', name: 'Jessica Anne Bogart', gender: 'female', accent: '', description: 'Chatty and Friendly', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/g6xIsTj2HwM6VR4iXFCw.mp3' },
  { id: 'lcMyyd2HUfFzxdCaC4Ta', name: 'Lucy', gender: 'female', accent: '', description: 'Fresh and Casual', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/lcMyyd2HUfFzxdCaC4Ta.mp3' },
  { id: '6aDn1KB0hjpdcocrUkmq', name: 'Tiffany', gender: 'female', accent: '', description: 'Natural and Welcoming', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/6aDn1KB0hjpdcocrUkmq.mp3' },
  { id: 'Sq93GQT4X1lKDXsQcixO', name: 'Felix', gender: 'male', accent: '', description: 'Warm, Positive and Contemporary', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Sq93GQT4X1lKDXsQcixO.mp3' },
  { id: 'vfaqCOvlrKi4Zp7C2IAm', name: 'Malyx', gender: 'male', accent: '', description: 'Echoey, Menacing and Deep Demon', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/vfaqCOvlrKi4Zp7C2IAm.mp3' },
  { id: 'piI8Kku0DcvcL6TTSeQt', name: 'Flicker', gender: 'female', accent: '', description: 'Cheerful Fairy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/piI8Kku0DcvcL6TTSeQt.mp3' },
  { id: 'KTPVrSVAEUSJRClDzBw7', name: 'Bob', gender: 'male', accent: '', description: 'Rugged and Warm Cowboy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/KTPVrSVAEUSJRClDzBw7.mp3' },
  { id: 'flHkNRp1BlvT73UL6gyz', name: 'Jessica Anne Bogart', gender: 'female', accent: '', description: 'Eloquent Villain', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/flHkNRp1BlvT73UL6gyz.mp3' },
  { id: '9yzdeviXkFddZ4Oz8Mok', name: 'Lutz', gender: 'male', accent: '', description: 'Chuckling, Giggly and Cheerful', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/9yzdeviXkFddZ4Oz8Mok.mp3' },
  { id: 'pPdl9cQBQq4p6mRkZy2Z', name: 'Emma', gender: 'female', accent: '', description: 'Adorable and Upbeat', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/pPdl9cQBQq4p6mRkZy2Z.mp3' },
  { id: '0SpgpJ4D3MpHCiWdyTg3', name: 'Matthew Schmitz', gender: 'male', accent: '', description: 'Elitist, Arrogant Tyrant', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/0SpgpJ4D3MpHCiWdyTg3.mp3' },
  { id: 'UFO0Yv86wqRxAt1DmXUu', name: 'Sarcastic Villain', gender: 'female', accent: '', description: 'Sarcastic and Sultry', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/UFO0Yv86wqRxAt1DmXUu.mp3' },
  { id: 'oR4uRy4fHDUGGISL0Rev', name: 'Myrrdin', gender: 'male', accent: '', description: 'Wise and Magical Narrator', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/oR4uRy4fHDUGGISL0Rev.mp3' },
  { id: 'zYcjlYFOd3taleS0gkk3', name: 'Edward', gender: 'male', accent: '', description: 'Loud, Confident and Cocky', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/zYcjlYFOd3taleS0gkk3.mp3' },
  { id: 'nzeAacJi50IvxcyDnMXa', name: 'Marshal', gender: 'male', accent: '', description: 'Friendly, Funny Professor', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/nzeAacJi50IvxcyDnMXa.mp3' },
  { id: 'ruirxsoakN0GWmGNIo04', name: 'John Morgan', gender: 'male', accent: '', description: 'Gritty, Rugged Cowboy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/ruirxsoakN0GWmGNIo04.mp3' },
  { id: '1KFdM0QCwQn4rmn5nn9C', name: 'Parasyte', gender: 'male', accent: '', description: 'Whispers from the Deep Dark', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1KFdM0QCwQn4rmn5nn9C.mp3' },
  { id: 'TC0Zp7WVFzhA8zpTlRqV', name: 'Aria', gender: 'female', accent: '', description: 'Sultry Villain', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/TC0Zp7WVFzhA8zpTlRqV.mp3' },
  { id: 'ljo9gAlSqKOvF6D8sOsX', name: 'Viking Bjorn', gender: 'male', accent: '', description: 'Epic Medieval Raider', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/ljo9gAlSqKOvF6D8sOsX.mp3' },
  { id: 'PPzYpIqttlTYA83688JI', name: 'Pirate Marshal', gender: 'male', accent: '', description: 'Adventurous Pirate', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/PPzYpIqttlTYA83688JI.mp3' },
  { id: 'ZF6FPAbjXT4488VcRRnw', name: 'Amelia', gender: 'female', accent: '', description: 'Enthusiastic and Expressive', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/ZF6FPAbjXT4488VcRRnw.mp3' },
  { id: '8JVbfL6oEdmuxKn5DK2C', name: 'Johnny Kid', gender: 'male', accent: '', description: 'Serious and Calm Narrator', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/8JVbfL6oEdmuxKn5DK2C.mp3' },
  { id: 'iCrDUkL56s3C8sCRl7wb', name: 'Hope', gender: 'female', accent: '', description: 'Poetic, Romantic and Captivating', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/iCrDUkL56s3C8sCRl7wb.mp3' },
  { id: '1hlpeD1ydbI2ow0Tt3EW', name: 'Olivia', gender: 'female', accent: '', description: 'Smooth, Warm and Engaging', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1hlpeD1ydbI2ow0Tt3EW.mp3' },
  { id: 'wJqPPQ618aTW29mptyoc', name: 'Ana Rita', gender: 'female', accent: '', description: 'Smooth, Expressive and Bright', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/wJqPPQ618aTW29mptyoc.mp3' },
  { id: 'EiNlNiXeDU1pqqOPrYMO', name: 'John Doe', gender: 'male', accent: '', description: 'Deep', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/EiNlNiXeDU1pqqOPrYMO.mp3' },
  { id: 'FUfBrNit0NNZAwb58KWH', name: 'Angela', gender: 'female', accent: '', description: 'Conversational and Friendly', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/FUfBrNit0NNZAwb58KWH.mp3' },
  { id: '4YYIPFl9wE5c4L2eu2Gb', name: 'Burt Reynolds', gender: 'male', accent: '', description: 'Deep, Smooth and Clear', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/4YYIPFl9wE5c4L2eu2Gb.mp3' },
  { id: 'OYWwCdDHouzDwiZJWOOu', name: 'David', gender: 'male', accent: '', description: 'Gruff Cowboy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/OYWwCdDHouzDwiZJWOOu.mp3' },
  { id: '6F5Zhi321D3Oq7v1oNT4', name: 'Hank', gender: 'male', accent: '', description: 'Deep and Engaging Narrator', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/6F5Zhi321D3Oq7v1oNT4.mp3' },
  { id: 'qNkzaJoHLLdpvgh5tISm', name: 'Carter', gender: 'male', accent: '', description: 'Rich, Smooth and Rugged', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/qNkzaJoHLLdpvgh5tISm.mp3' },
  { id: 'YXpFCvM1S3JbWEJhoskW', name: 'Wyatt', gender: 'male', accent: '', description: 'Wise Rustic Cowboy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/YXpFCvM1S3JbWEJhoskW.mp3' },
  { id: '9PVP7ENhDskL0KYHAKtD', name: 'Jerry B.', gender: 'male', accent: '', description: 'Southern/Cowboy', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/9PVP7ENhDskL0KYHAKtD.mp3' },
  { id: 'LG95yZDEHg6fCZdQjLqj', name: 'Phil', gender: 'male', accent: '', description: 'Explosive, Passionate Announcer', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/LG95yZDEHg6fCZdQjLqj.mp3' },
  { id: 'CeNX9CMwmxDxUF5Q2Inm', name: 'Johnny Dynamite', gender: 'male', accent: '', description: 'Vintage Radio DJ', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/CeNX9CMwmxDxUF5Q2Inm.mp3' },
  { id: 'st7NwhTPEzqo2riw7qWC', name: 'Blondie', gender: 'female', accent: '', description: 'Radio Host', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/st7NwhTPEzqo2riw7qWC.mp3' },
  { id: 'aD6riP1btT197c6dACmy', name: 'Rachel M', gender: 'female', accent: '', description: 'Pro British Radio Presenter', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/aD6riP1btT197c6dACmy.mp3' },
  { id: 'FF7KdobWPaiR0vkcALHF', name: 'David', gender: 'male', accent: '', description: 'Movie Trailer Narrator', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/FF7KdobWPaiR0vkcALHF.mp3' },
  { id: 'mtrellq69YZsNwzUSyXh', name: 'Rex Thunder', gender: 'male', accent: '', description: 'Deep N Tough', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/mtrellq69YZsNwzUSyXh.mp3' },
  { id: 'dHd5gvgSOzSfduK4CvEg', name: 'Ed', gender: 'male', accent: '', description: 'Late Night Announcer', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/dHd5gvgSOzSfduK4CvEg.mp3' },
  { id: 'cTNP6ZM2mLTKj2BFhxEh', name: 'Paul French', gender: 'male', accent: '', description: 'Podcaster', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/cTNP6ZM2mLTKj2BFhxEh.mp3' },
  { id: 'eVItLK1UvXctxuaRV2Oq', name: 'Jean', gender: 'female', accent: '', description: 'Alluring and Playful Femme Fatale', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/eVItLK1UvXctxuaRV2Oq.mp3' },
  { id: 'U1Vk2oyatMdYs096Ety7', name: 'Michael', gender: 'male', accent: '', description: 'Deep, Dark and Urban', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/U1Vk2oyatMdYs096Ety7.mp3' },
  { id: 'esy0r39YPLQjOczyOib8', name: 'Britney', gender: 'female', accent: '', description: 'Calm and Calculative Villain', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/esy0r39YPLQjOczyOib8.mp3' },
  { id: 'bwCXcoVxWNYMlC6Esa8u', name: 'Matthew Schmitz', gender: 'male', accent: '', description: 'Gravel, Deep Anti-Hero', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/bwCXcoVxWNYMlC6Esa8u.mp3' },
  { id: 'D2jw4N9m4xePLTQ3IHjU', name: 'Ian', gender: 'male', accent: '', description: 'Strange and Distorted Alien', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/D2jw4N9m4xePLTQ3IHjU.mp3' },
  { id: 'Tsns2HvNFKfGiNjllgqo', name: 'Sven', gender: 'male', accent: '', description: 'Emotional and Nice', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Tsns2HvNFKfGiNjllgqo.mp3' },
  { id: 'Atp5cNFg1Wj5gyKD7HWV', name: 'Natasha', gender: 'female', accent: '', description: 'Gentle Meditation', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Atp5cNFg1Wj5gyKD7HWV.mp3' },
  { id: '1cxc5c3E9K6F1wlqOJGV', name: 'Emily', gender: 'female', accent: '', description: 'Gentle, Soft and Meditative', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1cxc5c3E9K6F1wlqOJGV.mp3' },
  { id: '1U02n4nD6AdIZ9CjF053', name: 'Viraj', gender: 'male', accent: '', description: 'Smooth and Gentle', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1U02n4nD6AdIZ9CjF053.mp3' },
  { id: 'HgyIHe81F3nXywNwkraY', name: 'Nate', gender: 'male', accent: '', description: 'Sultry, Whispery and Seductive', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/HgyIHe81F3nXywNwkraY.mp3' },
  { id: 'AeRdCCKzvd23BpJoofzx', name: 'Nathaniel', gender: 'male', accent: '', description: 'Engaging, British and Calm', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/AeRdCCKzvd23BpJoofzx.mp3' },
  { id: 'LruHrtVF6PSyGItzMNHS', name: 'Benjamin', gender: 'male', accent: '', description: 'Deep, Warm, Calming', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/LruHrtVF6PSyGItzMNHS.mp3' },
  { id: 'Qggl4b0xRMiqOwhPtVWT', name: 'Clara', gender: 'female', accent: '', description: 'Relaxing, Calm and Soothing', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/Qggl4b0xRMiqOwhPtVWT.mp3' },
  { id: 'zA6D7RyKdc2EClouEMkP', name: 'AImee', gender: 'female', accent: '', description: 'Tranquil ASMR and Meditation', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/zA6D7RyKdc2EClouEMkP.mp3' },
  { id: '1wGbFxmAM3Fgw63G1zZJ', name: 'Allison', gender: 'female', accent: '', description: 'Calm, Soothing and Meditative', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/1wGbFxmAM3Fgw63G1zZJ.mp3' },
  { id: 'hqfrgApggtO1785R4Fsn', name: 'Theodore HQ', gender: 'male', accent: '', description: 'Serene and Grounded', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/hqfrgApggtO1785R4Fsn.mp3' },
  { id: 'sH0WdfE5fsKuM2otdQZr', name: 'Koraly', gender: 'female', accent: '', description: 'Soft-spoken and Gentle', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/sH0WdfE5fsKuM2otdQZr.mp3' },
  { id: 'MJ0RnG71ty4LH3dvNfSd', name: 'Leon', gender: 'male', accent: '', description: 'Soothing and Grounded', useCase: '', age: '', previewUrl: 'https://static.aiquickdraw.com/elevenlabs/voice/MJ0RnG71ty4LH3dvNfSd.mp3' },
];

/** ElevenLabs 음성 이름 → 한국어 표기 매핑 (프리메이드 + KIE 커뮤니티) */
export const EL_NAME_KO: Record<string, string> = {
  // ── 프리메이드 음성 ──
  Sarah: '사라', Laura: '로라', Alice: '앨리스', Jessica: '제시카',
  Lily: '릴리', Matilda: '마틸다', Bella: '벨라', Roger: '로저',
  George: '조지', Charlie: '찰리', Callum: '캘럼', Harry: '해리',
  Liam: '리암', Will: '윌', Eric: '에릭', Chris: '크리스',
  Brian: '브라이언', Daniel: '다니엘', Adam: '아담', Bill: '빌',
  River: '리버',
  // ── KIE 커뮤니티 음성 ──
  Anika: '아니카', Ellen: '엘렌', Juniper: '주니퍼', Jane: '제인',
  James: '제임스', Arabella: '아라벨라', Hope: '호프', Bradford: '브래드포드',
  Xavier: '자비에', Austin: '오스틴', Jarnathan: '자르나탄', Kuon: '쿠온',
  Blondie: '블론디', Priyanka: '프리얀카', 'Monika Sogam': '모니카 소감',
  Mark: '마크', 'Grimblewood Thornwhisker': '그림블우드 쏜위스커',
  Adeline: '아델린', Sam: '샘', 'Spuds Oxley': '스퍼즈 옥슬리',
  Eve: '이브', 'Northern Terry': '노던 테리', 'Dr. Von': '폰 박사',
  'British Football Announcer': '영국 축구 아나운서',
  Brock: '브록', 'Célian': '셀리앙', Nathan: '네이선',
  Viraj: '비라즈', Taksh: '탁시', 'Guadeloupe Merryweather': '과들루프 메리웨더',
  Horatius: '호라티우스', Charlotte: '샬롯', 'Heather Rey': '헤더 레이',
  Brittney: '브리트니', Matthew: '매튜', 'Pro Narrator': '프로 내레이터',
  Archer: '아처', Jeff: '제프', Jamahal: '자마할', Finn: '핀',
  Smith: '스미스', Tom: '톰', Cassidy: '캐시디',
  'Addison 2.0': '애디슨 2.0', 'Jessica Anne Bogart': '제시카 앤 보가트',
  Lucy: '루시', Tiffany: '티파니', Felix: '펠릭스', Malyx: '말릭스',
  Flicker: '플리커', Bob: '밥', Lutz: '루츠', Emma: '엠마',
  'Matthew Schmitz': '매튜 슈미츠', 'Sarcastic Villain': '비꼬는 빌런',
  Myrrdin: '머딘', Edward: '에드워드', Marshal: '마샬',
  'John Morgan': '존 모건', Parasyte: '파라사이트', Aria: '아리아',
  'Viking Bjorn': '바이킹 비에른', 'Pirate Marshal': '해적 마샬',
  Amelia: '아멜리아', 'Johnny Kid': '조니 키드', Olivia: '올리비아',
  'Ana Rita': '아나 리타', 'John Doe': '존 도', Angela: '안젤라',
  'Burt Reynolds': '버트 레이놀즈', David: '데이비드', Hank: '행크',
  Carter: '카터', Wyatt: '와이엇', 'Jerry B.': '제리 B.',
  Phil: '필', 'Johnny Dynamite': '조니 다이너마이트',
  'Rachel M': '레이첼 M', 'Rex Thunder': '렉스 썬더',
  Ed: '에드', 'Paul French': '폴 프렌치', Jean: '장',
  Michael: '마이클', Britney: '브리트니', Ian: '이안',
  Sven: '스벤', Natasha: '나타샤', Emily: '에밀리', Nate: '네이트',
  Nathaniel: '나다니엘', Benjamin: '벤자민', Clara: '클라라',
  AImee: '에이미', Allison: '앨리슨', 'Theodore HQ': '테오도르 HQ',
  Koraly: '코랄리', Leon: '레온',
};

export const elNameKo = (name: string): string => {
  const base = name.split(/\s[–-]\s/)[0].trim();
  const first = base.split(' ')[0];
  const ko = EL_NAME_KO[base] || EL_NAME_KO[first];
  return ko ? `${ko} (${base})` : base;
};
