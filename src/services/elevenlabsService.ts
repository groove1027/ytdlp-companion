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
import { mergeAudioFiles, splitTextForTTS } from './ttsService';

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
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다. API 설정에서 Kie 키를 입력해주세요.');
  if (!options.text.trim()) throw new Error('TTS 텍스트가 비어있습니다.');

  // 4500자 초과 시 자동 청킹
  if (options.text.length > 4500) {
    const chunks = splitTextForTTS(options.text, 4500);
    logger.info('[ElevenLabs] 자동 청킹', { totalLength: options.text.length, chunkCount: chunks.length });

    const audioUrls: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      logger.info(`[ElevenLabs] 청크 ${i + 1}/${chunks.length} 생성 중 (${chunks[i].length}자)`);
      const result = await generateSingleChunk({ ...options, text: chunks[i] }, apiKey);
      audioUrls.push(result.audioUrl);
    }

    if (audioUrls.length === 1) return { audioUrl: audioUrls[0], format: 'mp3' };
    const mergedUrl = await mergeAudioFiles(audioUrls);
    logger.success('[ElevenLabs] 청크 병합 완료', { chunks: chunks.length });
    return { audioUrl: mergedUrl, format: 'wav' };
  }

  return generateSingleChunk(options, apiKey);
};

/** 단일 청크 TTS 생성 — dialogue 배열 포맷 사용 */
const generateSingleChunk = async (
  options: ElevenLabsDialogueOptions,
  apiKey: string,
): Promise<{ audioUrl: string; format: string }> => {
  const {
    text,
    voiceId = 'Sarah',
    stability = 0.5,
    languageCode = 'auto',
  } = options;

  logger.info('[ElevenLabs] Dialogue V3 생성 요청 (Kie 경유)', {
    voiceId,
    textLength: text.length,
    stability,
    languageCode,
  });

  const input: Record<string, unknown> = {
    dialogue: [{ text, voice: voiceId }],
    stability,
    language_code: languageCode,
  };

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
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
    if (response.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    throw new Error(`ElevenLabs Dialogue V3 생성 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Kie는 HTTP 200이지만 body에 에러 코드를 반환할 수 있음
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`ElevenLabs Dialogue V3 태스크 생성 실패: ${data.msg || '알 수 없는 오류'} (code: ${data.code})`);
  }
  const taskId = data.data.taskId;

  const audioUrl = await pollDialogueTask(taskId, apiKey);

  logger.success('[ElevenLabs] Dialogue V3 생성 완료 (Kie 경유)', { voiceId });
  return { audioUrl, format: 'mp3' };
};

/** Kie TTS 태스크 폴링 */
const pollDialogueTask = async (taskId: string, apiKey: string, maxAttempts: number = 60): Promise<string> => {
  logger.info('[ElevenLabs] 폴링 시작', { taskId });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = attempt < 5 ? 2000 : 3000;
    await new Promise(resolve => setTimeout(resolve, delay));

    const response = await monitoredFetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } },
    );

    if (!response.ok) {
      if (response.status === 429) {
        logger.trackRetry('ElevenLabs 폴링 (429)', attempt + 1, maxAttempts, 'Rate limited');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      throw new Error(`ElevenLabs 폴링 오류 (${response.status})`);
    }

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

      logger.success('[ElevenLabs] 폴링 완료', { taskId, attempt });
      return audioUrl;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || '알 수 없는 오류';
      throw new Error(`ElevenLabs 생성 실패: ${failMsg}`);
    }
  }

  throw new Error(`ElevenLabs 생성 시간 초과 (${maxAttempts}회 폴링 실패)`);
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
 * 프리메이드 21개: ElevenLabs API /v1/voices 기준 (previewUrl 포함)
 * 커뮤니티: Kie docs.kie.ai 기준 인기 음성
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
  // ── 인기 공유 음성 Top 100 (ElevenLabs Voice Library, 연간 사용량 순) ──
  { id: 'ZF6FPAbjXT4488VcRRnw', name: 'Amelia', gender: 'female', accent: 'british', description: 'Enthusiastic and Expressive', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/ZF6FPAbjXT4488VcRRnw/PXswrdJcgsGr8VdoVA43.mp3' },
  { id: 'CaJslL1xziwefCeTNzHv', name: 'Cristina Campos', gender: 'female', accent: 'latin american', description: 'Friendly and Soft', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c093a158b7da4dadb8f9a5fae10b7211/voices/CaJslL1xziwefCeTNzHv/piQKkajjFXnelvIxcX33.mp3' },
  { id: 'X8n8hOy3e8VLQnHTUcc5', name: 'Bram', gender: 'male', accent: 'standard', description: 'Warm, Expressive and Welcoming', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/IibSJRWrKnPiK4RQIBkLud1zFFh2/voices/X8n8hOy3e8VLQnHTUcc5/QdwfLypUbLnIFkfVR7Lb.mp3' },
  { id: 'kcQkGnn0HAT2JRDQ4Ljp', name: 'Norah', gender: 'female', accent: 'latin american', description: 'Warm, Friendly and Clear', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/MwAclikwqMOxiQmgjqQl9NjIjLx2/voices/kcQkGnn0HAT2JRDQ4Ljp/orjDdvv8Gd5hsrqKoNSi.mp3' },
  { id: 'kPzsL2i3teMYv0FxEYQ6', name: 'Brittney', gender: 'female', accent: 'american', description: 'Social Media Voice - Fun, Youthful & Informative', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/kPzsL2i3teMYv0FxEYQ6/4sLh92VdgT3Hppimhb4W.mp3' },
  { id: 'UgBBYS2sOqTuMpoF3BR0', name: 'Mark', gender: 'male', accent: 'american', description: 'Natural Conversations', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f94e260200764678babc807b935bfb0b/voices/UgBBYS2sOqTuMpoF3BR0/0Oc7jiXwWN9kRTXfQsmw.mp3' },
  { id: 'dlGxemPxFMTY7iXagmOj', name: 'Fernando Martínez', gender: 'male', accent: 'latin american', description: 'Rapid, Persuasive', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/dlGxemPxFMTY7iXagmOj/lQty6bCYbkLtTgnwqvDs.mp3' },
  { id: '1SM7GgM6IMuvQlz2BwM3', name: 'Mark', gender: 'male', accent: 'american', description: 'Casual, Relaxed and Light', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f94e260200764678babc807b935bfb0b/voices/1SM7GgM6IMuvQlz2BwM3/y94G1rGixaqL2FvP3Tte.mp3' },
  { id: 'tnSpp4vdxKPjI9w0GnoV', name: 'Hope', gender: 'female', accent: 'american', description: 'upbeat and clear', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/tnSpp4vdxKPjI9w0GnoV/LiIyxRT1qFJ1QJPr8sWl.mp3' },
  { id: '90ipbRoKi4CpHXvKVtl0', name: 'Anika', gender: 'female', accent: 'indian', description: 'Customer Care Agent', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/90ipbRoKi4CpHXvKVtl0/RHjv4PzQ8pTguUk1dcO5.mp3' },
  { id: 'OYTbf65OHHFELVut7v2H', name: 'Hope', gender: 'female', accent: 'american', description: 'Natural, Clear and Calm', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e219aba9bd7442daa87c084f511be4f3/voices/OYTbf65OHHFELVut7v2H/kTLS0DfvlR1QTyjUzOiT.mp3' },
  { id: 'j9jfwdrw7BRfcR43Qohk', name: 'Frederick Surrey', gender: 'male', accent: 'british', description: 'Smooth and Velvety', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/j9jfwdrw7BRfcR43Qohk/Vyj86dr4NJ1Tr82nEPdw.mp3' },
  { id: 'Se2Vw1WbHmGbBbyWTuu4', name: 'Allison', gender: 'female', accent: 'british', description: 'Inviting and Velvety', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/Se2Vw1WbHmGbBbyWTuu4/3criMPMqBy1hVGIVhW2Q.mp3' },
  { id: 'KYiVPerWcenyBTIvWbfY', name: 'Sia', gender: 'female', accent: 'standard', description: 'Friendly, Helpful and Reassuring', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/KYiVPerWcenyBTIvWbfY/BRWxak3ROXSWrPmEZL4s.mp3' },
  { id: 'G17SuINrv2H9FC6nvetn', name: 'Christopher', gender: 'male', accent: 'british', description: 'Gentle and Trustworthy', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/G17SuINrv2H9FC6nvetn/ofEmJDtVvrmeL3OEs0ig.mp3' },
  { id: 'ZthjuvLPty3kTMaNKVKb', name: 'Peter', gender: 'male', accent: 'american', description: 'narrative_story', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3a1097f4367748ea80de3d1c644282c8/voices/ZthjuvLPty3kTMaNKVKb/2nBO0beUcX6fsrvPZbcE.mp3' },
  { id: 'v3V1d2rk6528UrLKRuy8', name: 'Susi', gender: 'female', accent: 'standard', description: 'Effortless and Confident', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/1KI0h0RJuscE0Ta9tVvydENJ9JF3/voices/v3V1d2rk6528UrLKRuy8/8aab3a1d-2faf-4de4-b229-f3a2ebb21c43.mp3' },
  { id: 'NFG5qt843uXKj4pFvR7C', name: 'Adam Stone', gender: 'male', accent: 'british', description: 'Smooth, Deep and Relaxed', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/NFG5qt843uXKj4pFvR7C/BgPFcmyMBm88O9O05Myn.mp3' },
  { id: 'jqcCZkN6Knx8BJ5TBdYR', name: 'Zara – The Warm, Real-World Conversationalist', gender: 'female', accent: 'american', description: 'social_media', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/XKwEw9ihVRMYSZkGwKydUfpES0B3/voices/jqcCZkN6Knx8BJ5TBdYR/JKHbp9CMKBoqcDFfzWIf.mp3' },
  { id: '6OzrBCQf8cjERkYgzSg8', name: 'Young Jamal', gender: 'male', accent: 'american', description: 'social_media', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/6OzrBCQf8cjERkYgzSg8/YmWdAA5ju6tNyK5Zl104.mp3' },
  { id: 'NOpBlnGInO9m6vDvFkFC', name: 'Spuds Oxley', gender: 'male', accent: 'american', description: 'Wise and Approachable', useCase: 'conversational', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/64971298bfc24086b69026970a21f1f9/voices/NOpBlnGInO9m6vDvFkFC/M4xySW4rr1SbAKKwMAtI.mp3' },
  { id: 'l1zE9xgNpUTaQCZzpNJa', name: 'Alberto Rodríguez', gender: 'male', accent: 'latin american', description: 'Serious, Narrative', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/l1zE9xgNpUTaQCZzpNJa/sF0SJSVjERJtMSqfZLPN.mp3' },
  { id: 'EkK5I93UQWFDigLMpZcX', name: 'James', gender: 'male', accent: 'american', description: 'Husky, Engaging and Bold', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/48ab3aae468d4e9baded4b1693820088/voices/EkK5I93UQWFDigLMpZcX/xvjT3EK4vD3zlwfawHeV.mp3' },
  { id: 'gHu9GtaHOXcSqFTK06ux', name: 'Anjali', gender: 'female', accent: 'standard', description: 'Warm, Cheerful and Clear', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/gHu9GtaHOXcSqFTK06ux/pI2RQaKcueXaen7zO23a.mp3' },
  { id: 'XjLkpWUlnhS8i7gGz3lZ', name: 'David Castlemore', gender: 'male', accent: 'american', description: 'Newsreader and Educator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/60df5e8e85434c87b586860524fe605c/voices/XjLkpWUlnhS8i7gGz3lZ/2foqwf4lPNBPWW27H6du.mp3' },
  { id: 'NYC9WEgkq1u4jiqBseQ9', name: 'Russell', gender: 'male', accent: 'british', description: 'Dramatic British TV', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/NYC9WEgkq1u4jiqBseQ9/cK07157YMomRml8se448.mp3' },
  { id: 'uju3wxzG5OhpWcoi3SMy', name: 'Michael C. Vincent', gender: 'male', accent: 'american', description: 'Confident, Expressive', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/uju3wxzG5OhpWcoi3SMy/ixYUu11jiy8LIVZidnvA.mp3' },
  { id: '9F4C8ztpNUmXkdDDbz3J', name: 'Dan', gender: 'male', accent: 'american', description: 'Upbeat, Dynamic and Friendly', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/oDQDaQK0SGT9AtdG8VDe17L4KjX2/voices/9F4C8ztpNUmXkdDDbz3J/4d3e2bc3-b9f8-4bf0-84b2-22e0c15102f6.mp3' },
  { id: 'aQROLel5sQbj1vuIVi6B', name: 'Nicolas', gender: 'male', accent: 'parisian', description: 'Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/ajGQb2hVVXdBWWu6HHJEkWasByJ3/voices/aQROLel5sQbj1vuIVi6B/shwzqRrR51OISZWUl7EN.mp3' },
  { id: 'qHkrJuifPpn95wK3rm2A', name: 'Andrea', gender: 'female', accent: 'latin american', description: 'Polite, Cheerful and Calm', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9a2055f7d05c40ceb1fc9f0d32a5301f/voices/qHkrJuifPpn95wK3rm2A/C0HIbK1Fqc9zwzlyvuTI.mp3' },
  { id: 'g6xIsTj2HwM6VR4iXFCw', name: 'Jessica Anne Bogart', gender: 'female', accent: 'american', description: 'Chatty and Friendly', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/yA8yDNUx4dZ4gwL9ztbTpUEIyR12/voices/g6xIsTj2HwM6VR4iXFCw/1Oqk9SesQxUMxopfgLb7.mp3' },
  { id: 'SF9uvIlY93SJRMdV5jeP', name: 'Andrew Griffin', gender: 'male', accent: 'american', description: 'Football Commentator', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4567cb2d224245f8b853c0d5e2fd8728/voices/SF9uvIlY93SJRMdV5jeP/242a626d-6d37-4f88-956f-e9c8abcbec5f.mp3' },
  { id: '2rigMbVWLdqtBSCahJFX', name: 'Tatiana Martin', gender: 'female', accent: 'latin american', description: 'Wise-speaking, calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3e36197119e140b39fbba60fdd4ce83d/voices/2rigMbVWLdqtBSCahJFX/fZWd6mLqzMJWcNXOh3ea.mp3' },
  { id: 'lxYfHSkYm1EzQzGhdbfc', name: 'Jessica Anne Bogart', gender: 'female', accent: 'american', description: 'A VO Professional; now cloned!', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/yA8yDNUx4dZ4gwL9ztbTpUEIyR12/voices/lxYfHSkYm1EzQzGhdbfc/IOC9ue0lhGUaJXYEcNM2.mp3' },
  { id: '2zRM7PkgwBPiau2jvVXc', name: 'Monika Sogam', gender: 'female', accent: 'indian', description: 'Deep and Natural', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/2zRM7PkgwBPiau2jvVXc/NcEOQ9awTZvgwUoqtmU9.mp3' },
  { id: 'O4cGUVdAocn0z4EpQ9yF', name: 'Sami Real', gender: 'female', accent: 'american', description: 'Confident and Conversational', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/475f7e829cd14d3d8bbd9d8e7b114b8c/voices/O4cGUVdAocn0z4EpQ9yF/937fe9bc-cf83-46ad-9180-247eda3d575b.mp3' },
  { id: 'MFZUKuGQUsGJPQjTS4wC', name: 'Jon', gender: 'male', accent: 'american', description: 'Warm & Grounded Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7bdd69d9e581481a8ea5216493271f81/voices/MFZUKuGQUsGJPQjTS4wC/xEoCh0QqT3VPBukUnnNT.mp3' },
  { id: 'LXrTqFIgiubkrMkwvOUr', name: 'Masry', gender: 'male', accent: 'egyptian', description: 'Narrative, Clear and Strong', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4dd89dc295f141cd873347db66bae892/voices/LXrTqFIgiubkrMkwvOUr/J85EPZ8jOuD46EGNgsfT.mp3' },
  { id: 'sKgg4MPUDBy69X7iv3fA', name: 'Alejandro Duràn', gender: 'male', accent: 'latin american', description: 'Warm, Deep and Hoarse', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/A2X18CsKVaTPUykRQ18z7J8NFPE2/voices/sKgg4MPUDBy69X7iv3fA/892860bd-377a-403b-82e7-4442d602f95f.mp3' },
  { id: '1wg2wOjdEWKA7yQD8Kca', name: 'Father Christmas', gender: 'male', accent: 'british', description: 'Magical Storyteller', useCase: 'narrative_story', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8ea18f54734242deb00d4fd70279d29f/voices/1wg2wOjdEWKA7yQD8Kca/FYJS5TODnaCQ0hT7oV5r.mp3' },
  { id: '33B4UnXyTNbgLmdEDh5P', name: 'Keren', gender: 'female', accent: 'brazilian', description: 'Sweet, Vibrant and Rhythmic', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/33B4UnXyTNbgLmdEDh5P/ArnzDsFaz6KDoDcDD8V2.mp3' },
  { id: 'yl2ZDV1MzN4HbQJbMihG', name: 'Alex', gender: 'male', accent: 'american', description: 'Upbeat, Energetic and Clear', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/yl2ZDV1MzN4HbQJbMihG/TxJIOexqYqCv1Dzexs6Y.mp3' },
  { id: 'IRHApOXLvnW57QJPQH2P', name: 'Adam', gender: 'male', accent: 'american', description: 'American, Dark and Tough', useCase: 'characters_animation', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f177574c1b1c4475bcc81a6ecd965c7c/voices/IRHApOXLvnW57QJPQH2P/7758822f-c98c-4db9-ab0a-186b6a13be1a.mp3' },
  { id: 'zT03pEAEi0VHKciJODfn', name: 'Raju', gender: 'male', accent: 'standard', description: 'Clear, Natural and Warm', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/zT03pEAEi0VHKciJODfn/E1SwTL1qIKPkIxyZQQfk.mp3' },
  { id: 'hIssydxXZ1WuDorjx6Ic', name: 'Adam', gender: 'male', accent: 'mazovian', description: 'Serious, Rich, and Smoky', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ee8b9737c6e64fee8dd0c22abfe88a0f/voices/hIssydxXZ1WuDorjx6Ic/kNa9LiskFM0zlZprIFgg.mp3' },
  { id: 'gJEfHTTiifXEDmO687lC', name: 'Prince Nur', gender: 'male', accent: 'standard', description: 'Deep, Rich and Balanced', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/lJ828Qq43ZUVkWzzuPT8tmVIlVB3/voices/gJEfHTTiifXEDmO687lC/bvLjXgefFonQ8qV9UFjN.mp3' },
  { id: 'NyxenPOqNyllHIzSoPbJ', name: 'Theo', gender: 'male', accent: 'standard', description: 'Warm and Young', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/NyxenPOqNyllHIzSoPbJ/JElmBasKEekIZFFmRpnJ.mp3' },
  { id: 'alFofuDn3cOwyoz1i44T', name: 'Dallin', gender: 'male', accent: 'american', description: 'Positive, Inspiring and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/551555cb5c5a4ac89e8db52cec00e3f9/voices/alFofuDn3cOwyoz1i44T/f3121486-aa47-4540-9e8a-16a642ce77c2.mp3' },
  { id: 'yM93hbw8Qtvdma2wCnJG', name: 'Ivanna', gender: 'female', accent: 'american', description: 'Young, Versatile and Casual', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/bb9cf5a3f1f64ea8bfab4ec927713ab5/voices/yM93hbw8Qtvdma2wCnJG/oMTlBHMIOuDLwcm7I1vJ.mp3' },
  { id: 'gOkFV1JMCt0G0n9xmBwV', name: 'Oxley', gender: 'male', accent: 'american', description: 'Honest, Direct and Sincere', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/64971298bfc24086b69026970a21f1f9/voices/gOkFV1JMCt0G0n9xmBwV/bzq9YIfPb3JoAL953C9C.mp3' },
  { id: '3EuKHIEZbSzrHGNmdYsx', name: 'Nikolay', gender: 'male', accent: 'standard', description: 'Confident, Clear and Engaging', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/sCwXo41MENd4QkPBWDqgd70vTHs2/voices/3EuKHIEZbSzrHGNmdYsx/eDCArYD3qxTq5zrHJjYL.mp3' },
  { id: 'Z3R5wn05IrDiVCyEkUrK', name: 'Arabella', gender: 'female', accent: 'american', description: 'Mysterious and Emotive', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/67adadb7d2a94f6ead64e95f45be2254/voices/Z3R5wn05IrDiVCyEkUrK/CBYKafo5onIe5234rAGS.mp3' },
  { id: 'gUABw7pXQjhjt0kNFBTF', name: 'Andrew', gender: 'male', accent: 'american', description: 'Smooth, Smart and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/eR8GN1SLARV1SsZrwn2eoVNdIwg2/voices/gUABw7pXQjhjt0kNFBTF/f5776657-1bda-4fa8-8170-65d3164d02e7.mp3' },
  { id: 'uYXf8XasLslADfZ2MB4u', name: 'Hope', gender: 'female', accent: 'american', description: 'Bubbly, Gossipy and Girly', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e219aba9bd7442daa87c084f511be4f3/voices/uYXf8XasLslADfZ2MB4u/M0UTfNFigInhz8LMb4DA.mp3' },
  { id: 'SaqYcK3ZpDKBAImA8AdW', name: 'Jane Doe', gender: 'female', accent: 'american', description: 'Intimate', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3e36197119e140b39fbba60fdd4ce83d/voices/SaqYcK3ZpDKBAImA8AdW/YG26dVnrjTsghGHUKGv8.mp3' },
  { id: '19STyYD15bswVz51nqLf', name: 'Samara X – Smooth Classy British', gender: 'female', accent: 'british', description: 'social_media', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/65ce3d25b2034bf0b490a868052eff08/voices/19STyYD15bswVz51nqLf/zl9HbPmiEEiOdhvLunad.mp3' },
  { id: 'Nh2zY9kknu6z4pZy6FhD', name: 'David Martin', gender: 'male', accent: 'peninsular', description: 'Confident and Balanced', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3e36197119e140b39fbba60fdd4ce83d/voices/Nh2zY9kknu6z4pZy6FhD/5VD3I67SoLbajJEbw7rH.mp3' },
  { id: 'wyWA56cQNU2KqUW4eCsI', name: 'Clyde', gender: 'male', accent: 'british', description: 'Full, Diplomatic and Inviting', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3a1097f4367748ea80de3d1c644282c8/voices/wyWA56cQNU2KqUW4eCsI/RNPfnL6pqQi9eI02rhnL.mp3' },
  { id: 'kqVT88a5QfII1HNAEPTJ', name: 'Declan Sage', gender: 'male', accent: 'american', description: 'Wise and Captivating', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/5d6438deeb7d443ca0a6fc6309d5bb8a/voices/kqVT88a5QfII1HNAEPTJ/Hex3MZnpQ3dCbdgTkKyr.mp3' },
  { id: 'goT3UYdM9bhm0n2lmKQx', name: 'Edward', gender: 'male', accent: 'british', description: 'British, Dark, Seductive, Low', useCase: 'characters_animation', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9ffd9eb76f364648abbfb2c74b299b4a/voices/goT3UYdM9bhm0n2lmKQx/8e1e53b7-9320-4bab-acf2-86d7e77d1b8b.mp3' },
  { id: '2bNrEsM0omyhLiEyOwqY', name: 'Monika Sogam', gender: 'female', accent: 'standard', description: 'Friendly and Reassuring', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/2bNrEsM0omyhLiEyOwqY/d3Od6XtjK1LK0t3FIIxN.mp3' },
  { id: 'wJqPPQ618aTW29mptyoc', name: 'Ana Rita', gender: 'female', accent: 'british', description: 'Smooth, Expressive and Bright', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/JSdwiNguB8ejxX5k1f64Z6aLdP73/voices/wJqPPQ618aTW29mptyoc/7f5d3985-6999-49c4-8c53-e0f43ef5a334.mp3' },
  { id: 'NNl6r8mD7vthiJatiJt1', name: 'Bradford', gender: 'male', accent: 'british', description: 'Expressive and Articulate', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a456897a2f294556841ad2761f1c1a11/voices/NNl6r8mD7vthiJatiJt1/6adca4e2-0bc1-4ece-ac02-ff0bceac9c36.mp3' },
  { id: '15CVCzDByBinCIoCblXo', name: 'Lucan Rook', gender: 'male', accent: 'american', description: 'Energetic Male', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/XfNHbUnzYlfKcyqwGAOVIYehri33/voices/15CVCzDByBinCIoCblXo/7b63eb9a-f231-4f7e-8214-5810a5913b2e.mp3' },
  { id: 'P7x743VjyZEOihNNygQ9', name: 'Dakota', gender: 'female', accent: 'american', description: 'Engaging and Steady', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8f68264023ce481db070132bbcc70ff5/voices/P7x743VjyZEOihNNygQ9/LZlYGXR9ACWHJ9pSXs0a.mp3' },
  { id: 'e5WNhrdI30aXpS2RSGm1', name: 'Ian Cartwell', gender: 'male', accent: 'american', description: 'Suspense and Mystery', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/60df5e8e85434c87b586860524fe605c/voices/e5WNhrdI30aXpS2RSGm1/irZ6ZTbGVA5WjVAwnZcJ.mp3' },
  { id: 'YPh7OporwNAJ28F5IQrm', name: 'Angie Vendedora', gender: 'female', accent: 'latin american', description: 'Polite and Soft', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4f094f873c1b439bacf33376e4aa2af3/voices/YPh7OporwNAJ28F5IQrm/idoAcxNJdzLykhJP6XA1.mp3' },
  { id: '80lPKtzJMPh1vjYMUgwe', name: 'Benjamin', gender: 'male', accent: 'mexican', description: 'Deep, Smooth and Rich', useCase: 'narrative_story', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/XvV3q41X6CYxk1srcwdBrHoEp682/voices/80lPKtzJMPh1vjYMUgwe/OdLhfMeDosUS2KjiTnPS.mp3' },
  { id: 'iiidtqDt9FBdT1vfBluA', name: 'Bill Oxley', gender: 'male', accent: 'american', description: 'Documentary Commentator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/64971298bfc24086b69026970a21f1f9/voices/iiidtqDt9FBdT1vfBluA/T36MtmAvwCajW33mBOpD.mp3' },
  { id: 'ZJCNdZEjYwkOElxugmW2', name: 'Hyuk', gender: 'male', accent: 'seoul', description: 'Cold and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/hSWXaUomcSNh92DBdVimNedwBFB2/voices/ZJCNdZEjYwkOElxugmW2/a5a5dec0-45ab-4b01-95a8-75fe95cbba0c.mp3' },
  { id: '9oPKasc15pfAbMr7N6Gs', name: 'Valeria', gender: 'female', accent: 'argentine', description: 'Cheerful, Youthful, Catchy', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/9oPKasc15pfAbMr7N6Gs/in9QWOsJ1UDpVIraOQ4Z.mp3' },
  { id: 'siw1N9V8LmYeEWKyWBxv', name: 'Ruhaan', gender: 'male', accent: 'indian', description: 'Clear, Loud and Cheerful', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/siw1N9V8LmYeEWKyWBxv/cBmcFAhsEDTnsoNcP2Vr.mp3' },
  { id: 'W71zT1VwIFFx3mMGH2uZ', name: 'MarcoTrox', gender: 'male', accent: 'standard', description: 'Warm, Balanced and Polished', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/PmcWCeDWyhXdgWnKoeG8s6OvV0L2/voices/W71zT1VwIFFx3mMGH2uZ/rnNCyOY4g9O3iiz8jRAb.mp3' },
  { id: 'aEO01A4wXwd1O8GPgGlF', name: 'Arabella', gender: 'female', accent: 'australian', description: 'conversational', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/rXPvBAYLgtWWSz1trBzQCzJldqC2/voices/aEO01A4wXwd1O8GPgGlF/B0TnT9nA9kj4OFUzZ3BQ.mp3' },
  { id: 'nBoLwpO4PAjQaQwVKPI1', name: 'Amelia', gender: 'female', accent: 'australian', description: 'Young Australian Female', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3ec3c46a443d4806ac5540998ad5f6eb/voices/nBoLwpO4PAjQaQwVKPI1/pEX4zUYPQmsyqSF5AcW4.mp3' },
  { id: 'H8bdWZHK2OgZwTN7ponr', name: 'Saavi', gender: 'female', accent: 'indian', description: 'Warm Financial Advisor', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/H8bdWZHK2OgZwTN7ponr/jhoBXyhQgwLjuRW2h420.mp3' },
  { id: 'JddqVF50ZSIR7SRbJE6u', name: 'Valeria', gender: 'female', accent: 'latin american', description: 'Casual, Friendly and Chatty', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ff1324c566524836a6a03f7c179ae1d2/voices/JddqVF50ZSIR7SRbJE6u/KJwqYruQfpbrVbN0WKnR.mp3' },
  { id: 'vO7hjeAjmsdlGgUdvPpe', name: 'Amrut Deshmukh', gender: 'male', accent: 'indian', description: 'Energetic Influencer', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/vO7hjeAjmsdlGgUdvPpe/tVLojOqSkrZhG2AledQa.mp3' },
  { id: 'McVZB9hVxVSk3Equu8EH', name: 'Audrey', gender: 'female', accent: 'standard', description: 'Energetic Commercial', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/McVZB9hVxVSk3Equu8EH/fQOpiFrrNtzg6dglRCvf.mp3' },
  { id: 'o2zd9K5QOO7ppTb04Lx0', name: 'Gabriel Ripley', gender: 'male', accent: 'american', description: 'Facetious, Quick-Spoken', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/dd7c707c22b54c0bb40d0275bb44e299/voices/o2zd9K5QOO7ppTb04Lx0/jUrKM0fxQh7FwKRXZgA1.mp3' },
  { id: 'yj30vwTGJxSHezdAGsv9', name: 'Jessa', gender: 'female', accent: 'american', description: 'Easygoing and Effortless', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1df4b21393b74964b03d3690a173eb80/voices/yj30vwTGJxSHezdAGsv9/vx3tSQ1IkoQyN4rr6olh.mp3' },
  { id: '6vTyAgAT8PncODBcLjRf', name: 'Claire', gender: 'female', accent: 'standard', description: 'Warm, Pretty and Charming', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/70ec1da4e84d427c8415d3f2b898c9d8/voices/6vTyAgAT8PncODBcLjRf/0VKyDoT4Ri5WBjc5tC8j.mp3' },
  { id: 'UOIqAnmS11Reiei1Ytkc', name: 'Carolina', gender: 'female', accent: 'peninsular', description: 'Natural, Neutral and Clear', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/UOIqAnmS11Reiei1Ytkc/iD8yOai01ygsrjOUknQ3.mp3' },
  { id: 'sDh3eviBhiuHKi0MjTNq', name: 'Francis', gender: 'male', accent: 'mexican', description: 'Corporate and Elegant', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d5ff84b7be2949348eda8f312d07d47f/voices/sDh3eviBhiuHKi0MjTNq/gSlXJ24Sju3xdKzY3sPY.mp3' },
  { id: '1qEiC6qsybMkmnNdVMbK', name: 'Monika Sogam', gender: 'female', accent: 'standard', description: 'Calm and Natural', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/1qEiC6qsybMkmnNdVMbK/3AVAQBXu0vYsIrgDc6Fa.mp3' },
  { id: 'h2cd3gvcqTp3m65Dysk7', name: 'Carolina Ruiz', gender: 'female', accent: 'peninsular', description: 'Nasal, Natural and Clear', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/0a827733c0974887817bc85481951f95/voices/h2cd3gvcqTp3m65Dysk7/DvNPwmY8u2WKmyXeN8yh.mp3' },
  { id: 'XfNU2rGpBa01ckF309OY', name: 'Nichalia Schwartz', gender: 'female', accent: 'american', description: 'Bright and Friendly', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/XfNU2rGpBa01ckF309OY/kuFJZI5s8GbgYm5f0hMo.mp3' },
  { id: 'ftDdhfYtmfGP0tFlBYA1', name: 'Alisha', gender: 'female', accent: 'indian', description: 'Soft and Engaging', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/ftDdhfYtmfGP0tFlBYA1/ij5PfYlZZeiriPm7LHrO.mp3' },
  { id: 'Fahco4VZzobUeiPqni1S', name: 'Archer', gender: 'male', accent: 'british', description: 'Conversational', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b74d906ca49b4cae8711d6f8e3ba2b67/voices/Fahco4VZzobUeiPqni1S/BYI5QD0F6odzbXe3n2Nl.mp3' },
  { id: 'FTNCalFNG5bRnkkaP5Ug', name: 'Otto', gender: 'male', accent: 'standard', description: 'Casual and Normal', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/FTNCalFNG5bRnkkaP5Ug/MQ8WiEa4ozV4HevPeMba.mp3' },
  { id: 'wAGzRVkxKEs8La0lmdrE', name: 'Sully', gender: 'male', accent: 'american', description: 'Mature, Deep and Intriguing', useCase: 'narrative_story', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/Bo6DtogKR9MFeVzUzR8msFIzsz92/voices/wAGzRVkxKEs8La0lmdrE/694524f9-fac6-4c16-a9de-8bb69e178312.mp3' },
  { id: '2Lb1en5ujrODDIqmp7F3', name: 'Jhenny', gender: 'female', accent: 'latin american', description: 'Soft, Calm, Sweet', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2Lb1en5ujrODDIqmp7F3/q4yhTMl09IVyvr9aLc0s.mp3' },
  { id: 'zgqefOY5FPQ3bB7OZTVR', name: 'Niraj', gender: 'male', accent: 'standard', description: 'Romantic and Smooth', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/zgqefOY5FPQ3bB7OZTVR/e098PrFS03OESyoSgjxV.mp3' },
  { id: '7eVMgwCnXydb3CikjV7a', name: 'Lea', gender: 'female', accent: 'standard', description: 'Clear and Feminine', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/7eVMgwCnXydb3CikjV7a/zMitELWPfkgqNXLr2X9t.mp3' },
  { id: 'MnUw1cSnpiLoLhpd3Hqp', name: 'Heather Rey', gender: 'female', accent: 'american', description: 'Rushed and Friendly', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/MnUw1cSnpiLoLhpd3Hqp/BkcUy0E78hTXrDJNX2j9.mp3' },
  { id: 'kdmDKE6EkgrWrrykO9Qt', name: 'Alexandra', gender: 'female', accent: 'american', description: 'Conversational and Natural', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1df4b21393b74964b03d3690a173eb80/voices/kdmDKE6EkgrWrrykO9Qt/yJT6XwhJHSWv3Pb05OIk.mp3' },
  { id: 'dPah2VEoifKnZT37774q', name: 'Knox Dark', gender: 'male', accent: 'american', description: 'Serious, Deep, and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/86b67cb8189f444d877f87233dbdaef6/voices/dPah2VEoifKnZT37774q/mF4D1ir2uNzhMYIWBFCA.mp3' },
  { id: 'GUDYcgRAONiI1nXDcNQQ', name: 'Milo', gender: 'male', accent: 'american', description: 'Calm, Soothing and Meditative', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c915cc6b038c4ee594dea6e889603893/voices/GUDYcgRAONiI1nXDcNQQ/aaec8fe5-bb13-4902-8a96-ce845eefca1a.mp3' },
  { id: 'gxSxrhNNXvdHpOH0EHjV', name: 'Gabriela González', gender: 'female', accent: 'latin american', description: 'Bubbly, Clear, Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/0a70fcdded754ba7a21906dce986bdc4/voices/gxSxrhNNXvdHpOH0EHjV/wKU2m61lp3opYquhzjZu.mp3' },
  { id: 'iDEmt5MnqUotdwCIVplo', name: 'Enrique Mondragón', gender: 'male', accent: 'mexican', description: 'Elegant and Dynamic', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/iDEmt5MnqUotdwCIVplo/rS1k8yAe8MGIMeC7Uq4V.mp3' },
  // ── 한국어 음성 Top 30 (Korean) ──
  { id: 'uyVNoMrnUku1dZyVEXwD', name: 'Anna Kim', gender: 'female', accent: 'seoul', description: 'Tender, Calm and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/OKaBDsX4AwWWjMaZHBmhCWFvt9N2/voices/uyVNoMrnUku1dZyVEXwD/W55oP1IsLNaNaglJpUZd.mp3' },
  { id: 'jB1Cifc2UQbq1gR3wnb0', name: 'Bin', gender: 'male', accent: 'standard', description: 'Measured and Serious', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/hSWXaUomcSNh92DBdVimNedwBFB2/voices/jB1Cifc2UQbq1gR3wnb0/886e42f2-9973-476a-aa1f-f348f46d35a3.mp3' },
  { id: 'PDoCXqBQFGsvfO0hNkEs', name: 'Chris', gender: 'male', accent: 'seoul', description: 'Warm and Clear', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/70d7b643ae574688b481ad2842214f21/voices/PDoCXqBQFGsvfO0hNkEs/N8aRMeov18dFKyQFDDai.mp3' },
  { id: 'z6Kj0hecH20CdetSElRT', name: 'Jennie', gender: 'female', accent: 'standard', description: 'Narrational', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/gQj40MTS0aYNIcMt6naYRDbytw63/voices/z6Kj0hecH20CdetSElRT/5ff8eff0-fffa-4ba7-aa8b-1a2bbd92364c.mp3' },
  { id: 'ksaI0TCD9BstzEzlxj4q', name: 'Seulki', gender: 'female', accent: 'seoul', description: 'Inviting, Calm and Measured', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b10a4abd897343c8aa80ff543b86b7ce/voices/ksaI0TCD9BstzEzlxj4q/bizji0eQlVSfyOy39GQ7.mp3' },
  { id: '1W00IGEmNmwmsDeYy7ag', name: 'Krys', gender: 'male', accent: 'seoul', description: 'Cheerful, Clear and Measured', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/1W00IGEmNmwmsDeYy7ag/mV05gXR5dHTJL6k8rCUl.mp3' },
  { id: 'AW5wrnG1jVizOYY7R1Oo', name: 'Jiyoung', gender: 'female', accent: 'seoul', description: 'Warm and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/lpCnNtCadTY1Lw6BJ9Ldr7VFCSy1/voices/AW5wrnG1jVizOYY7R1Oo/8PwzNgj6JZ1lLlh4hBYf.mp3' },
  { id: '8MwPLtBplylvbrksiBOC', name: 'Chungman', gender: 'female', accent: 'seoul', description: 'Meditative, Clear and Soft', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/45fffd0f2aba46049b8063b8a82b67b2/voices/8MwPLtBplylvbrksiBOC/HEQsVbkvM4MytPPXY223.mp3' },
  { id: 'WqVy7827vjE2r3jWvbnP', name: 'Hyuk', gender: 'male', accent: 'seoul', description: 'Encourging and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/hSWXaUomcSNh92DBdVimNedwBFB2/voices/WqVy7827vjE2r3jWvbnP/88cb909a-68b9-43b8-8ede-424641a5ed30.mp3' },
  { id: '4JJwo477JUAx3HV0T7n7', name: 'Yohan Koo', gender: 'male', accent: 'seoul', description: 'Encouraging, Clear and Airy', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d04bfbd4c7cb450db49e122473150f1d/voices/4JJwo477JUAx3HV0T7n7/tHnNNBfrYAs43momAwan.mp3' },
  { id: 'FQ3MuLxZh0jHcZmA5vW1', name: 'Dohyeon', gender: 'male', accent: 'seoul', description: 'Whisper, Measured and Neutral', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/hSWXaUomcSNh92DBdVimNedwBFB2/voices/FQ3MuLxZh0jHcZmA5vW1/0e98f9e4-4cc9-430b-bed1-2415208aa316.mp3' },
  { id: 's07IwTCOrCDCaETjUVjx', name: 'Hyunbin', gender: 'male', accent: 'seoul', description: 'Diplomatic, Clear and Measured', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/hSWXaUomcSNh92DBdVimNedwBFB2/voices/s07IwTCOrCDCaETjUVjx/b9065609-ce5d-409b-b42d-59a39962f088.mp3' },
  { id: '8jHHF8rMqMlg8if2mOUe', name: 'Han', gender: 'female', accent: 'standard', description: 'Conversational', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Fr7oFHV6gLSelNy4rFVRp4lCJCV2/voices/8jHHF8rMqMlg8if2mOUe/YIorkj9cjDLOs3Qrv4iJ.mp3' },
  { id: 'ETPP7D0aZVdEj12Aa7ho', name: 'Selly Han', gender: 'female', accent: 'seoul', description: 'Warm, Calm and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/oDwWVVb1w2T87IGLDxNdT7vBmEn2/voices/ETPP7D0aZVdEj12Aa7ho/DONiknEwqUfxGc2bH1MP.mp3' },
  { id: 'gJSDQIpSQ56NBGhorBfg', name: 'David', gender: 'neutral', accent: 'standard', description: 'Calm, Steady and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/gJSDQIpSQ56NBGhorBfg/SLMxf2OfBoZqR7PDXZ25.mp3' },
  { id: 'nbrxrAz3eYm9NgojrmFK', name: 'Min-joon', gender: 'male', accent: 'seoul', description: 'Neutral, Measured and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Fea5zVhKjFh4UaeqOnPrIMXRVRP2/voices/nbrxrAz3eYm9NgojrmFK/wwix04doakLQxQZC5KxM.mp3' },
  { id: 'v1jVu1Ky28piIPEJqRrm', name: 'David', gender: 'male', accent: 'standard', description: 'Warm, Measured and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8d600bafbd274a48a03b1e1ca0fee1ff/voices/v1jVu1Ky28piIPEJqRrm/P7A6ENIaIXKp1Vfd5N0L.mp3' },
  { id: '4p0HBzAAGyju0nYfNntV', name: 'Sunny', gender: 'female', accent: 'standard', description: 'Warm, Calm and Balanced', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/oDwWVVb1w2T87IGLDxNdT7vBmEn2/voices/4p0HBzAAGyju0nYfNntV/uAZS7kmvUyn5e6Uq4ho1.mp3' },
  { id: 'YBRudLRm83BV5Mazcr42', name: 'Jason', gender: 'male', accent: 'seoul', description: 'Meditative, Calm and Measured', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c88a0f15f1c940049e493feb6a659b55/voices/YBRudLRm83BV5Mazcr42/e5S1lbdQIHQ59tQyonW8.mp3' },
  { id: '2gbExjiWDnG1DMGr81Bx', name: 'Kyungduk Ko', gender: 'male', accent: 'seoul', description: 'Condescending and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/U7KdaWkZaONdVHjof2MQxGPrDtn1/voices/2gbExjiWDnG1DMGr81Bx/4764e2ec-d85d-4bc2-9c4f-ef901b6d95e7.mp3' },
  { id: 'RU7aSi6lT4uQBXMLgDxK', name: 'Kyle', gender: 'male', accent: 'standard', description: 'Friendly, Natural and Guttural', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/eFj55IXkPIf6DwoWJkWcU80nK8u2/voices/RU7aSi6lT4uQBXMLgDxK/f459de5a-dedf-41de-953a-a488298f4066.mp3' },
  { id: 'BbsagRO6ohd8MKPS2Ob0', name: 'Jin Geon Song', gender: 'male', accent: 'seoul', description: 'Neutral, Calm and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/DKto1gNuG4avSK2jIgvUZCcuJqG2/voices/BbsagRO6ohd8MKPS2Ob0/sHiGQcmygSSDVUTzuKjA.mp3' },
  { id: 'm3gJBS8OofDJfycyA2Ip', name: 'Taehyung', gender: 'male', accent: 'seoul', description: 'Natural, Friendly and Clear', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ce83e07047d547a78196bdc75c06b215/voices/m3gJBS8OofDJfycyA2Ip/SlpqQHWbsnW8SRSMhlHO.mp3' },
  { id: 'CxErO97xpQgQXYmapDKX', name: 'Theo', gender: 'male', accent: 'seoul', description: 'Warm, Smooth and Soft', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/143a58485a2242a4bb727baf740ec1af/voices/CxErO97xpQgQXYmapDKX/Bbiz0wPheiDJ0CmN8nIv.mp3' },
  { id: 'mYk0rAapHek2oTw18z8x', name: 'Salang', gender: 'female', accent: 'seoul', description: 'Calm, Clear and Warm', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4bb8d728d1a64e88abb13ca37a20f41a/voices/mYk0rAapHek2oTw18z8x/P4dYrthsu8sCz6v1b5FB.mp3' },
  { id: 'K3qo7ugXmpT87FDhLBbN', name: 'Gale', gender: 'male', accent: 'standard', description: 'Inviting and Natural', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/bc9c4ea00e72479fa519624c038eab8d/voices/K3qo7ugXmpT87FDhLBbN/hD2UxI6JZf7pItjBpo3z.mp3' },
  { id: '7Nah3cbXKVmGX7gQUuwz', name: 'Joon Park', gender: 'male', accent: 'seoul', description: 'Inviting and Measured', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e9b46628933143568f9c699ca67a704d/voices/7Nah3cbXKVmGX7gQUuwz/3ZGixpOYmJuecK8xYCBC.mp3' },
  { id: 'sf8Bpb1IU97NI9BHSMRf', name: 'Rosa Oh', gender: 'female', accent: 'seoul', description: 'Calm, Polished and Measured', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/71cd013d832b49ffbeb355d480d5353a/voices/sf8Bpb1IU97NI9BHSMRf/5Emj4Ccmi1oZzFWx7g20.mp3' },
  { id: '3MTvEr8xCMCC2mL9ujrI', name: 'June', gender: 'male', accent: 'seoul', description: 'Calm, Clear and Steady', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/V0noQjJtOMYaa9fhrtHFK4lk25q2/voices/3MTvEr8xCMCC2mL9ujrI/523d79f8-0e61-4fe0-8a34-8126a7107060.mp3' },
  // ── 일본어 음성 Top 20 (Japanese) ──
  { id: '3JDquces8E8bkmvbh6Bc', name: 'Otani', gender: 'male', accent: 'standard', description: 'Inviting, Clear and Measured', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/3JDquces8E8bkmvbh6Bc/PZchZFPBnPlog5kS1miM.mp3' },
  { id: '8EkOjt4xTPGMclNlh1pk', name: 'Morioki', gender: 'female', accent: 'standard', description: 'Calm, Measured and Muffled', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/df01ec7a135f4c49bad7b644f945a2fe/voices/8EkOjt4xTPGMclNlh1pk/09bd3d5e-755b-4046-8ace-c69f0dcc872f.mp3' },
  { id: 'j210dv0vWm7fCknyQpbA', name: 'Hinata', gender: 'male', accent: 'standard', description: 'Inviting, Smooth and Measured', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/j210dv0vWm7fCknyQpbA/Bek5CWu0oLhcBJoGa1tS.mp3' },
  { id: 'Mv8AjrYZCBkdsmDHNwcB', name: 'Ishibashi', gender: 'male', accent: 'kanto', description: 'Inviting, Natural and Smoky', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8b5ce33f41764162907149c2ece2ea35/voices/Mv8AjrYZCBkdsmDHNwcB/BzyYgIBOY4ecjGAkbfEJ.mp3' },
  { id: 'GxxMAMfQkDlnqjpzjLHH', name: 'Kozy', gender: 'male', accent: 'standard', description: 'Inviting, Measured and Guttural', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/GxxMAMfQkDlnqjpzjLHH/stpExeeeVw1cHI9MxLrT.mp3' },
  { id: 'RBnMinrYKeccY3vaUxlZ', name: 'Sakura', gender: 'female', accent: 'standard', description: 'Narrational', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a29dd122ee8d4eeaad5db33207e76eb5/voices/RBnMinrYKeccY3vaUxlZ/5WcEzRG3P6U6j5pwJfrT.mp3' },
  { id: 'sRYzP8TwEiiqAWebdYPJ', name: 'Hatake Kohei', gender: 'male', accent: 'standard', description: 'Warm, Smooth and Husky', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9f98dd6e368e44c394c7c1727e879ae2/voices/sRYzP8TwEiiqAWebdYPJ/daa64a25-7790-488a-9f45-e7e59276ff27.mp3' },
  { id: '4lOQ7A2l7HPuG7UIHiKA', name: 'Kyoko', gender: 'female', accent: 'kanto', description: 'Warm, Clear and Natural', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f29f879a62be4833b2b8bf4e24941ebd/voices/4lOQ7A2l7HPuG7UIHiKA/g3KGPTAhbg1xfN40SNN3.mp3' },
  { id: 'B8gJV1IhpuegLxdpXFOE', name: 'Kuon', gender: 'female', accent: 'standard', description: 'Cheerful, Clear and Steady', useCase: 'characters_animation', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/cda515cc56d4408fbffd3f464fc33f4f/voices/B8gJV1IhpuegLxdpXFOE/38bca842-43a2-4be7-9fbd-0097cca97d45.mp3' },
  { id: 'WQz3clzUdMqvBf0jswZQ', name: 'Shizuka', gender: 'female', accent: 'standard', description: 'Natural and Soft', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8d4b2297d90b4dafb1b6c97b0791083f/voices/WQz3clzUdMqvBf0jswZQ/i6AmEdWw199PgEgmzXn0.mp3' },
  { id: 'b34JylakFZPlGS0BnwyY', name: 'Kenzo', gender: 'male', accent: 'standard', description: 'Calm, Soft and Measured', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/27aHAGxlxQTnqsfNkGU7nAoYC7J3/voices/b34JylakFZPlGS0BnwyY/91470e05-c687-43d7-b770-09449b622e63.mp3' },
  { id: 'fUjY9K2nAIwlALOwSiwc', name: 'Yui', gender: 'female', accent: 'standard', description: 'Warm, Clear and Natural', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7bd52b1c51784ac3b88f25361d3b1e88/voices/fUjY9K2nAIwlALOwSiwc/C79oVJJJuCSBWmwsTJYV.mp3' },
  { id: 'hBWDuZMNs32sP5dKzMuc', name: 'Ken', gender: 'male', accent: 'standard', description: 'Inviting, Clear and Measured', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/hBWDuZMNs32sP5dKzMuc/yS6CT2ZmVkugwSN1c6gI.mp3' },
  { id: 'PmgfHCGeS5b7sH90BOOJ', name: 'Fumi', gender: 'female', accent: 'kanto', description: 'Inviting, Balanced and Soft', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/BkwCr5O1AdMhQVdSX90jS7Qpr9t2/voices/PmgfHCGeS5b7sH90BOOJ/PpmIgMXldqj6pLMQRK2s.mp3' },
  { id: '4sirbXwrtRlmPV80MJkQ', name: 'Sora', gender: 'male', accent: 'seoul', description: 'Calm, Clear and Airy', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/WRizLCQa0zMu1E2FDYus53RrZOI2/voices/4sirbXwrtRlmPV80MJkQ/ZzHyYbFe8W3bwKixhBiL.mp3' },
  { id: 'lhTvHflPVOqgSWyuWQry', name: 'Hina – cute and friendly', gender: 'female', accent: 'standard', description: 'characters_animation', useCase: 'characters_animation', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/efe6877a45cd4178ae8fb0924a164965/voices/lhTvHflPVOqgSWyuWQry/7xnoSElkctXGFkLGKS2v.mp3' },
  { id: 'KgETZ36CCLD1Cob4xpkv', name: 'Romaco', gender: 'female', accent: 'standard', description: 'Cheerful, Clear and Full', useCase: 'characters_animation', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/feac87b282da4480934f29ab2131a2ab/voices/KgETZ36CCLD1Cob4xpkv/6BdydrkbWBRjzuuwsXeN.mp3' },
  { id: 'wcs09USXSN5Bl7FXohVZ', name: 'Satomi', gender: 'female', accent: 'kyushu', description: 'Calm, Smooth and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ffa60518f76e459daec829d4eedcb240/voices/wcs09USXSN5Bl7FXohVZ/LcW7nbk4aykItJDuwEPK.mp3' },
  { id: '8FuuqoKHuM48hIEwni5e', name: 'Shohei', gender: 'male', accent: 'standard', description: 'Warm, Clear and Husky', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4e195f617b534d4fbb80f464698fc01e/voices/8FuuqoKHuM48hIEwni5e/502c1a50-c09c-4adf-b047-59057c445fe1.mp3' },
  { id: 'G3EZ8O36A0x9lmeOtr0f', name: 'Kaori – Relatable and Friendly Voice', gender: 'female', accent: 'standard', description: 'conversational', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/G3EZ8O36A0x9lmeOtr0f/WwxHXLTkGGjWoXJIsCWr.mp3' },
  // ── 중국어 음성 Top 20 (Chinese) ──
  { id: 'ByhETIclHirOlWnWKhHc', name: 'Shan Shan', gender: 'female', accent: 'beijing mandarin', description: 'Young Energetic Female', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/ByhETIclHirOlWnWKhHc/WueuyXkB5LAjxrfqv4nL.mp3' },
  { id: '4VZIsMPtgggwNg7OXbPY', name: 'James Gao', gender: 'male', accent: 'standard', description: 'Calm, Friendly and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/qCmCyqVqIbevIuA9FVI25BpgadC2/voices/4VZIsMPtgggwNg7OXbPY/9fLlmDXPhO819IAIRK44.mp3' },
  { id: 'WuLq5z7nEcrhppO0ZQJw', name: 'Martin Li', gender: 'male', accent: 'standard', description: 'Raspy, Serious and Deep', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/WuLq5z7nEcrhppO0ZQJw/VQoMkMi8aSXSAwz6NHzh.mp3' },
  { id: 'BrbEfHMQu0fyclQR7lfh', name: 'Kevin Tu', gender: 'male', accent: 'taiwan mandarin', description: 'Natural, Steady and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9f62c15d1a154dcfb98d14d81cdb991c/voices/BrbEfHMQu0fyclQR7lfh/ce3695e5-8510-40c7-925d-96d49a59c266.mp3' },
  { id: 'hkfHEbBvdQFNX4uWHqRF', name: 'Stacy', gender: 'female', accent: 'standard', description: 'Young, Sweet and Cute', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/jZ7Y3eU070QEgdqA7ntHTX84tSo1/voices/hkfHEbBvdQFNX4uWHqRF/n5W0eNZRtazdqGAfoBDR.mp3' },
  { id: 'fQj4gJSexpu8RDE2Ii5m', name: 'Yu', gender: 'male', accent: 'taiwan mandarin', description: 'Youthful, Energetic and Engaging', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/8OXM7U7aZFcKI05Whl3sOM2HBaN2/voices/fQj4gJSexpu8RDE2Ii5m/xXnDtL0jvbLE622bVoEA.mp3' },
  { id: '9lHjugDhwqoxA5MhX0az', name: 'Anna Su', gender: 'female', accent: 'taiwan mandarin', description: 'Casual, Friendly and Bright', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c7ba9eef99104e2f9a93d2a1682b1258/voices/9lHjugDhwqoxA5MhX0az/55SoO0ERY953JPIuC271.mp3' },
  { id: 'MI36FIkp9wRP7cpWKPTl', name: 'Evan Zhao', gender: 'male', accent: 'beijing mandarin', description: 'Warm, Calm and Trustworthy', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Z4YmgeFNh2To6n9dYoppEePJeMr1/voices/MI36FIkp9wRP7cpWKPTl/ZdfInoVLSM5izvMkRQFp.mp3' },
  { id: 'FjfxJryh105iTLL4ktHB', name: 'Liang', gender: 'female', accent: 'taiwan mandarin', description: 'Calm, Natural and Young', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/lR7zG0SGCEdZiJWSCYHUCbDntpE3/voices/FjfxJryh105iTLL4ktHB/oFBl7C5OfnlqwKT3XRw9.mp3' },
  { id: '5mZxJZhSmJTjL7GoYfYI', name: 'Karo Yang', gender: 'male', accent: 'standard', description: 'Clear, Lively and Energetic', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/5mZxJZhSmJTjL7GoYfYI/AxKwa8mUXQbuKEt3jQTm.mp3' },
  { id: 'hZTuv9Zqrq4yHYrEmF1r', name: 'Adam Li', gender: 'male', accent: 'singapore mandarin', description: 'Deep, Steady and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/quDcGrthgkcACCa12rwG8Xzyp5Q2/voices/hZTuv9Zqrq4yHYrEmF1r/MReL0fdboS5j8sjxEN0K.mp3' },
  { id: 'DowyQ68vDpgFYdWVGjc3', name: 'Jason Chen', gender: 'male', accent: 'beijing mandarin', description: 'Deep, Magnetic and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/YGiwsYJAhWhJvwgTdPZR4teS4Km1/voices/DowyQ68vDpgFYdWVGjc3/Z8znsYirWE5wEXM3S1u2.mp3' },
  { id: 'Ca5bKgudqKJzq8YRFoAz', name: 'Coco Li', gender: 'female', accent: 'standard', description: 'Calm, Young and Trustworthy', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/Ca5bKgudqKJzq8YRFoAz/K4ccfm1YkLq6T1VJrk2U.mp3' },
  { id: 'GgmlugwQ4LYXBbEXENWm', name: 'Maya', gender: 'female', accent: 'standard', description: 'Young, Calm and Smooth', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/14fd976ef500404fb08f6a9d18786c24/voices/GgmlugwQ4LYXBbEXENWm/AP0YhlW1zVxV5sXFTGF3.mp3' },
  { id: 'W8lBaQb9YIoddhxfQNLP', name: 'Siqi Liu', gender: 'male', accent: 'beijing mandarin', description: 'Calm, Warm and Gentle', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/XbpMKUEgDHON3ave0Pt2ZYP3W5A2/voices/W8lBaQb9YIoddhxfQNLP/P6wnPuvDLRJ2rWjEqesV.mp3' },
  { id: 'D9bZgM9Er0PhIxuW9Jqa', name: 'Xin', gender: 'male', accent: 'beijing mandarin', description: 'Low, Slow and Smooth', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/wklEXeIf8AMcUoz2Vg6buhivHvg1/voices/D9bZgM9Er0PhIxuW9Jqa/c04a7b80-ebb3-4ef1-8099-b9c1e1d1537e.mp3' },
  { id: 'pU9NaAwkoR3v0Mrg3uKz', name: 'Haoran', gender: 'male', accent: 'beijing mandarin', description: 'Deep, Calm and Steady', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/H79ZdRWHdQYLqHU5CQ9Fcdf6iE63/voices/pU9NaAwkoR3v0Mrg3uKz/OyAgLV46qFj8zWNuBRLa.mp3' },
  { id: 'tOuLUAIdXShmWH7PEUrU', name: 'Julia', gender: 'female', accent: 'standard', description: 'Young, Smooth and Neutral', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d73648b2703246139a1d62a37ec12996/voices/tOuLUAIdXShmWH7PEUrU/cLRFoBrJT4slo9iXmsFk.mp3' },
  { id: 'M0TrFmFeBJS9H4xzdk8Z', name: 'Steven Gor', gender: 'male', accent: 'standard', description: 'Low, Calm and Soothing', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/9zHwRnA75eWDAnAxsMyZIcxp4fr1/voices/M0TrFmFeBJS9H4xzdk8Z/2g0KSnheMofsSguJBJsf.mp3' },
  { id: 'kGjJqO6wdwRN9iJsoeIC', name: 'Yui', gender: 'female', accent: 'taiwan mandarin', description: 'Delicate, Graceful and Soothing', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/da5bd13dd40843d5acc8a5d2c13dd9aa/voices/kGjJqO6wdwRN9iJsoeIC/wCkvneExVQKPTkxvKRGX.mp3' },
  // ── 프랑스어 (French) Top 6 ──
  { id: 'txtf1EDouKke753vN8SL', name: 'Jeanne', gender: 'female', accent: 'parisian', description: 'Narrator', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/txtf1EDouKke753vN8SL/KncK9phzELKxzmXlZhBV.mp3' },
  { id: 'FvmvwvObRqIHojkEGh5N', name: 'Adina', gender: 'female', accent: 'standard', description: 'Young, Welcoming and Joyful', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7b638fe354074ba1bb908fff1a56b372/voices/FvmvwvObRqIHojkEGh5N/M78pxbWXHVKaEKhcoerX.mp3' },
  { id: 'imRmmzTqlLHt9Do1HufF', name: 'Hélène', gender: 'female', accent: '', description: 'Neutral, Controled and Old', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/cuPu7cn3W0MJt2ibSqUmrW0ayNC2/voices/imRmmzTqlLHt9Do1HufF/343b6ee6-4240-499a-b646-668d10bea128.mp3' },
  { id: 'O31r762Gb3WFygrEOGh0', name: 'Victoria', gender: 'female', accent: 'parisian', description: 'Content Creator', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8883bfc00193440ba374c3ecd71610b5/voices/O31r762Gb3WFygrEOGh0/x79aDNW4Q3qgJKq1svTL.mp3' },
  { id: 'x10MLxaAmShMYt7vs7pl', name: 'Maevys', gender: 'female', accent: 'parisian', description: 'Audiobook Narrator', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/x10MLxaAmShMYt7vs7pl/DNnUTZlvk6Fi4YUoPZiD.mp3' },
  { id: 'glDtoWIoIgk38YbycCwG', name: 'Clara Dupont', gender: 'female', accent: '', description: 'Professional and Urgent', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/glDtoWIoIgk38YbycCwG/UlDuroynnWOO94VjqAlF.mp3' },
  // ── 독일어 (German) Top 7 ──
  { id: 'K75lPKuh15SyVhQC1LrE', name: 'Carola', gender: 'female', accent: '', description: 'Sharp and Clear', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/5ei0MqicAANlsSFIQjEs6ffqAsA3/voices/K75lPKuh15SyVhQC1LrE/4148b6cd-757d-4551-992d-2b218a520ef5.mp3' },
  { id: 'AnvlJBAqSLDzEevYr9Ap', name: 'Ava', gender: 'female', accent: 'standard', description: 'Youthful, Authentic and Friendly', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/AnvlJBAqSLDzEevYr9Ap/WMSO4Wuwrzy81szsGlvY.mp3' },
  { id: 'r8MyP4qUsq5WFFSkPdfV', name: 'Johannes', gender: 'male', accent: 'standard', description: 'Clear and Neutral', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/r8MyP4qUsq5WFFSkPdfV/ntE1aZPIgtGgd2LT1z9v.mp3' },
  { id: 'bAFkvitDGeDMmqo9gJzO', name: 'Niander Wallace', gender: 'male', accent: 'german', description: '', useCase: '', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4555ffb262cf4324ba213a8283a8e3b3/voices/bAFkvitDGeDMmqo9gJzO/OX74KCw3CC6MLdIkfDG8.mp3' },
  { id: 'aTTiK3YzK3dXETpuDE2h', name: 'Ben', gender: 'male', accent: 'standard', description: 'Effortless and Casual', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/aTTiK3YzK3dXETpuDE2h/yyLoue2p52RyHoDlXIeU.mp3' },
  { id: 'ABvMrd8urrMUl3V6UZ3Y', name: 'Vincent', gender: 'male', accent: 'standard', description: 'Warm, Clear and Authoritative', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4ce6d8bfca744b458e1dcfb591fd066c/voices/ABvMrd8urrMUl3V6UZ3Y/cu7cGthOw7yNdnoaQmbh.mp3' },
  { id: 'sx7WD8TJIOrk5RQOptDH', name: 'Tristan Medersburg', gender: 'male', accent: 'standard', description: 'Trustworthy', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/I8HeJNNNeGYbM5h4XOEuUon2jdH2/voices/sx7WD8TJIOrk5RQOptDH/ScQ4YRu0DgYRK2pjWj7G.mp3' },
  // ── 포르투갈어 (Portuguese) Top 9 ──
  { id: 'WFSxKvz27RguNRD3Phoq', name: 'Wesley Bessa', gender: 'male', accent: 'brazilian', description: 'Diplomatic and Cold', useCase: 'characters_animation', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/7GoGFrS2U6VgtMIrBgTMTUgPhOx2/voices/WFSxKvz27RguNRD3Phoq/c0bc5c07-2cce-4b08-a95b-d5470498edc2.mp3' },
  { id: 'NGS0ZsC7j4t4dCWbPdgO', name: 'Dhyogo Azevedo', gender: 'male', accent: '', description: 'Energetic and Confident', useCase: '', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/NGS0ZsC7j4t4dCWbPdgO/D3DVRd6bPBxKuHsvILTg.mp3' },
  { id: 'CstacWqMhJQlnfLPxRG4', name: 'Will', gender: 'male', accent: 'brazilian', description: 'Deep, Smooth and Affectionate', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/FjJ1S0dyr4ceeNIPe2rWGz4lcH53/voices/CstacWqMhJQlnfLPxRG4/4jr0jR4qABSfo2InZ89w.mp3' },
  { id: '36rVQA1AOIPwpA3Hg1tC', name: 'Matheus', gender: 'male', accent: '', description: 'Friendly and Energetic', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/36rVQA1AOIPwpA3Hg1tC/ewP6z1S1gE5Mb9nBSNaV.mp3' },
  { id: 'MZxV5lN3cv7hi1376O0m', name: 'Ana Dias', gender: 'female', accent: 'brazilian', description: 'Engaging, Smooth and Forceful', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/S7DSqIREokaHJMqnyVrwMfuKGhs2/voices/MZxV5lN3cv7hi1376O0m/43574a4d-ec20-4440-9271-8323f4db4fd8.mp3' },
  { id: '9pDzHy2OpOgeXM8SeL0t', name: 'Borges', gender: 'male', accent: 'brazilian', description: 'Slow, Calm and Confident', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b57fa538d8754a9596b756a71856c707/voices/9pDzHy2OpOgeXM8SeL0t/xGYamzP7jNps36ydpOms.mp3' },
  { id: 'tS45q0QcrDHqHoaWdCDR', name: 'Lax', gender: 'male', accent: 'brazilian', description: 'Funny, Sarcastic and Smooth', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c4ac53b6ed344b3a93f8c66b7b9d4344/voices/tS45q0QcrDHqHoaWdCDR/JVXUiHFT0hC7wmBvKxRl.mp3' },
  { id: 'rpNe0HOx7heUulPiOEaG', name: 'Diego', gender: 'male', accent: 'brazilian', description: 'Confident Announcer', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/ExjJpOEYBjb2W5XCccFWBXpJ0pA3/voices/rpNe0HOx7heUulPiOEaG/69643e31-21f1-43c4-8c49-89da52b59157.mp3' },
  { id: 'hwnuNyWkl9DjdTFykrN6', name: 'Adriano', gender: 'male', accent: 'brazilian', description: 'Deep, Gravelly and Rugged', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/79ac03d376c44b00b5d43fa62b35e145/voices/hwnuNyWkl9DjdTFykrN6/329MvlLzLXV0WYlABCHJ.mp3' },
  // ── 이탈리아어 (Italian) Top 9 ──
  { id: 'fzDFBB4mgvMlL36gPXcz', name: 'Giovanni Rossi', gender: 'male', accent: 'standard', description: 'Deep and Sympathetic', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/fzDFBB4mgvMlL36gPXcz/9mWvFKGio04aGXSm7tbQ.mp3' },
  { id: '13Cuh3NuYvWOVQtLbRN8', name: 'Marco', gender: 'male', accent: 'standard', description: 'Deep, Rich and Reflective', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/PmcWCeDWyhXdgWnKoeG8s6OvV0L2/voices/13Cuh3NuYvWOVQtLbRN8/cJBPziv7PCBbwkL4Nf48.mp3' },
  { id: 'HuK8QKF35exsCh2e7fLT', name: 'Carmelo La Rosa', gender: 'male', accent: 'standard', description: 'Deep and Balanced', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/PmcWCeDWyhXdgWnKoeG8s6OvV0L2/voices/HuK8QKF35exsCh2e7fLT/ivey2xpZm1535jLDmUwa.mp3' },
  { id: 'DLMxnwJE0a28JQLTMJPJ', name: 'Andy', gender: 'male', accent: 'standard', description: 'Warm, Nuanced and Mature', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3460863a5df6464a8fb3cdb9fcd15f89/voices/DLMxnwJE0a28JQLTMJPJ/56rS6pnxmvGBfreMFOr3.mp3' },
  { id: 'gfKKsLN1k0oYYN9n2dXX', name: 'Violetta', gender: 'female', accent: 'standard', description: 'Ringing, Bright and Joyful', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b3290375d9f7402daf26d0139c290f2d/voices/gfKKsLN1k0oYYN9n2dXX/Z2oJ1Jb0O555Pu7XDZv4.mp3' },
  { id: 'uScy1bXtKz8vPzfdFsFw', name: 'Antonio Farina', gender: 'male', accent: 'standard', description: 'Expressive and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/PmcWCeDWyhXdgWnKoeG8s6OvV0L2/voices/uScy1bXtKz8vPzfdFsFw/72XDqSVONDw2YySevq9x.mp3' },
  { id: '3DPhHWXDY263XJ1d2EPN', name: 'Linda Fiore', gender: 'female', accent: 'standard', description: 'Prickly, Cheerful and Full', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/3DPhHWXDY263XJ1d2EPN/YcN8v5oIOX09iQfWoPXH.mp3' },
  { id: 'Ha21jUwaMwdgQvqNslSM', name: 'Fabi', gender: 'male', accent: '', description: 'Involving, Rich and Controlled', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/Ha21jUwaMwdgQvqNslSM/chJvmEXdVln183Y5mu1u.mp3' },
  { id: 'fQmr8dTaOQq116mo2X7F', name: 'Samanta', gender: 'female', accent: 'standard', description: 'Reassuring, Warm and Deep', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/GNqGwAvcm9T2ztiUnKdevR5QaPE2/voices/fQmr8dTaOQq116mo2X7F/ohr3Oy4QHzzrbwm1BcEi.mp3' },
  // ── 네덜란드어 (Dutch) Top 10 ──
  { id: 'SXBL9NbvTrjsJQYay2kT', name: 'Melanie', gender: 'female', accent: 'standard', description: 'Engaging, Authentic Narrator', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8d40a1364c23423d8a41b6edab087fb4/voices/SXBL9NbvTrjsJQYay2kT/nZvyH1ab3o8lYKteiR7O.mp3' },
  { id: 'YUdpWWny7k5yb4QCeweX', name: 'Ruth', gender: 'female', accent: 'standard', description: 'Warm and Dynamic Narrator', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a406896418f84cebba6603a069608149/voices/YUdpWWny7k5yb4QCeweX/RDRd1XnXfKMdjwwBAGB4.mp3' },
  { id: 'AVIlLDn2TVmdaDycgbo3', name: 'Eric Sijbesma', gender: 'male', accent: '', description: 'Natural and Authentic', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/AVIlLDn2TVmdaDycgbo3/JbIwJwa6R5IlWcdyTP8X.mp3' },
  { id: 'UNBIyLbtFB9k7FKW8wJv', name: 'Serge de Beer', gender: 'male', accent: 'standard', description: 'Professional Narrator', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/099d1dc9ca1d4ca8922ad67d26a8327d/voices/UNBIyLbtFB9k7FKW8wJv/fS1o8uRWFIg7F0vzJ3Jn.mp3' },
  { id: 's7Z6uboUuE4Nd8Q2nye6', name: 'Hans Claesen', gender: 'male', accent: 'flemish', description: 'Professional Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b9f40bb5dcc44c568a77b8a4624852d1/voices/s7Z6uboUuE4Nd8Q2nye6/XR32RcQbL35zmXsczrLQ.mp3' },
  { id: 'ANHrhmaFeVN0QJaa0PhL', name: 'Petra Vlaams', gender: 'female', accent: 'flemish', description: 'Energetic, Warm and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/2cf0d05a31b94827975715d6a90d7e06/voices/ANHrhmaFeVN0QJaa0PhL/X9ii9MJVbOavJeTljZWv.mp3' },
  { id: 'dLPO5AsXc3FZDbTh1IKa', name: 'Ido', gender: 'male', accent: 'standard', description: 'Informal, Friendly Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a7513300b72a4f389e069145d09fda3a/voices/dLPO5AsXc3FZDbTh1IKa/G2Dg9i8mYc6R6ier63Yi.mp3' },
  { id: 'YgjXqgzBJa9op0K278OW', name: 'Tijs', gender: 'male', accent: 'standard', description: 'Engaging Podcast Host', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/e98aea3daf814c2d901c5cdc718b078d/voices/YgjXqgzBJa9op0K278OW/09Tb7xc4E392X8bprymH.mp3' },
  { id: 'eWrnzOwO7JvyjacVxTzV', name: 'Bart', gender: 'male', accent: 'flemish', description: 'Rhythmic, Soothing and Calm', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/2PYYb9at9ChyStcaorzi0prUZYg2/voices/eWrnzOwO7JvyjacVxTzV/dc3e9b1e-1689-4c8c-9e09-ab34e0dadb3f.mp3' },
  { id: '60CwgZt94Yf7yYIXMDDe', name: 'Peter', gender: 'male', accent: 'standard', description: 'Natural, Professional Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f9b991bee3f64ab89c2c19f66e4a1710/voices/60CwgZt94Yf7yYIXMDDe/AogfUaCdDsP0nDRu447F.mp3' },
  // ── 폴란드어 (Polish) Top 9 ──
  { id: 'H5xTcsAIeS5RAykjz57a', name: 'Alex', gender: 'male', accent: 'standard', description: 'Warm Storyteller', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ee8b9737c6e64fee8dd0c22abfe88a0f/voices/H5xTcsAIeS5RAykjz57a/8fe4ba47-f107-4b77-961c-ef3a3e939955.mp3' },
  { id: 'xAVsdcJvD1uegu8lFEE2', name: 'Daniel', gender: 'male', accent: 'standard', description: 'Calm, Stoic, and Friendly', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/xAVsdcJvD1uegu8lFEE2/PgJalXUgoID4K9pXb6Fd.mp3' },
  { id: 'zzBTsLBFM6AOJtkr1e9b', name: 'Pawel', gender: 'male', accent: 'standard', description: 'Optimistic, Silky and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/zzBTsLBFM6AOJtkr1e9b/jsLaAOqZnKHhKX1sJTWl.mp3' },
  { id: 'xsSg7GkDPDhaGZpbKOLn', name: 'Tomasz Z', gender: 'male', accent: 'standard', description: 'Expressive and Deep', useCase: 'narrative_story', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/cc0db8eb0d2e479fb36721ad2a641870/voices/xsSg7GkDPDhaGZpbKOLn/bOazemt5J0JvLqVNatWo.mp3' },
  { id: 'JxVKcxm9wtnCYEs8V00p', name: 'Bruno Siak', gender: 'male', accent: 'standard', description: 'Low, Expressive, Serious', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/AfdWKlChSqftP5B8pK4El9yBT6o1/voices/JxVKcxm9wtnCYEs8V00p/JnW5se5S9ItYDeEr6moe.mp3' },
  { id: 'o2xdfKUpc1Bwq7RchZuW', name: 'Piotr', gender: 'male', accent: 'standard', description: 'Engaging, Reassuring Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/WREaahKO7NZBbjp6DTUFGPrnqHD3/voices/o2xdfKUpc1Bwq7RchZuW/FVTB9TXCDzUSEKDPzIvD.mp3' },
  { id: 'N0GCuK2B0qwWozQNTS8F', name: 'Magdalena', gender: 'female', accent: 'standard', description: 'Mighty and Calm Wordsmith', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/417837743a2b49f29c7a940a29b17ab9/voices/N0GCuK2B0qwWozQNTS8F/PqhjD3HxJ0MP4R5cSdEZ.mp3' },
  { id: 'g8ZOdhoD9R6eYKPTjKbE', name: 'Tomasz', gender: 'male', accent: 'standard', description: 'Deep and Raspy', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/cc0db8eb0d2e479fb36721ad2a641870/voices/g8ZOdhoD9R6eYKPTjKbE/939f9ddc-6f70-4046-afd7-0187350e294d.mp3' },
  { id: 'h83JI5fjWWu9AOKOVRYh', name: 'Wojciech', gender: 'male', accent: 'standard', description: 'Rich, Intimate Storyteller', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/krknPnwW3HdgBRgKBJX7vp7FNUj1/voices/h83JI5fjWWu9AOKOVRYh/Gj07YvUHbQHNiVscmBOG.mp3' },
  // ── 러시아어 (Russian) Top 8 ──
  { id: 'txnCCHHGKmYIwrn7HfHQ', name: 'Alexandr Vlasov', gender: 'male', accent: 'standard', description: 'Vibrant and Energetic', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4c37c646e393427a98404da71421521a/voices/txnCCHHGKmYIwrn7HfHQ/9X9MXSKyYdsdkoNjOwY4.mp3' },
  { id: 'kwajW3Xh5svCeKU5ky2S', name: 'Dmitry', gender: 'male', accent: '', description: 'Clear and Energetic', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/kwajW3Xh5svCeKU5ky2S/RfYu5tMUZI6sVzmX4H9I.mp3' },
  { id: 'oKxkBkm5a8Bmrd1Whf2c', name: 'Prince Nur', gender: 'male', accent: 'moscow', description: 'Smooth, Rich and Engaging', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/JlvAfzHHnNRWYGqfpcfwawD2jOf1/voices/oKxkBkm5a8Bmrd1Whf2c/Po9m6hvCCjX5A8Rz6a0H.mp3' },
  { id: '0BcDz9UPwL3MpsnTeUlO', name: 'Denis', gender: 'male', accent: 'moscow', description: 'Pleasant, Engaging and Friendly', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/6vXiuCP61YbJ0ULh99L8p7W4oRf2/voices/0BcDz9UPwL3MpsnTeUlO/8slbP6V9zo96rm4BZtan.mp3' },
  { id: 'ymDCYd8puC7gYjxIamPt', name: 'Marina', gender: 'female', accent: 'standard', description: 'Soft, Clear and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Ws0NuxiaxGXfCa5Pjid7Cf3DXNI2/voices/ymDCYd8puC7gYjxIamPt/JIvpZszp6VTLxZ35YaHE.mp3' },
  { id: 'TUQNWEvVPBLzMBSVDPUA', name: 'Alex Bell', gender: 'male', accent: 'standard', description: 'Deep and Confident', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/44c8749f186847bdbd9d3528691abac4/voices/TUQNWEvVPBLzMBSVDPUA/UzWaQN5WUSe5p5VTm1Z5.mp3' },
  { id: 'EDpEYNf6XIeKYRzYcx4I', name: 'Mariia', gender: 'female', accent: 'moscow', description: 'Measured, Calm and Engaging', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/OH6cNoruamM0NJggO6ALztvyefv1/voices/EDpEYNf6XIeKYRzYcx4I/d14a20ef-969c-41c2-be25-010fb5057e69.mp3' },
  { id: 'rQOBu7YxCDxGiFdTm28w', name: 'Artem Lebedev', gender: 'male', accent: 'standard', description: 'Captivating and Engaging', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/eYUi2oZcB8RVHfP9GTnHUomZiby2/voices/rQOBu7YxCDxGiFdTm28w/6pAMjAxbXvyTDEXJySjr.mp3' },
  // ── 터키어 (Turkish) Top 10 ──
  { id: 'IuRRIAcbQK5AQk1XevPj', name: 'Doga', gender: 'male', accent: 'istanbul', description: 'Upbeat and Rich', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/bd6a6321e92640508e2b718a1b5e23a8/voices/IuRRIAcbQK5AQk1XevPj/dzo2bbYlqFHuucNnyWPU.mp3' },
  { id: '7VqWGAWwo2HMrylfKrcm', name: 'Fatih Yıldırım', gender: 'male', accent: 'istanbul', description: 'Deep, Clear and Rich', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ad46563895d343d7b7e2cb0d4fdb94c5/voices/7VqWGAWwo2HMrylfKrcm/7282011b-0180-4ac0-8d75-8e87c7f2439d.mp3' },
  { id: 'KbaseEXyT9EE0CQLEfbB', name: 'Belma', gender: 'female', accent: 'standard', description: 'Dynamic and Clear Narrator', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f83ac5eed5f347e2a0086d872e9b3f7b/voices/KbaseEXyT9EE0CQLEfbB/pDupY6hNTdHezQegrgVj.mp3' },
  { id: 'PdYVUd1CAGSXsTvZZTNn', name: 'Mia', gender: 'female', accent: 'standard', description: 'Clear, Steady and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f83ac5eed5f347e2a0086d872e9b3f7b/voices/PdYVUd1CAGSXsTvZZTNn/Sa6vpYH4HYQ556GX9J4G.mp3' },
  { id: 'J17lijyP1BHYcM7ld0Rg', name: 'Adam', gender: 'male', accent: 'istanbul', description: 'Deep, Professional and Serious', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/1UaUJJmHzOdvXFUVPp0tkvaI8a22/voices/J17lijyP1BHYcM7ld0Rg/ca75ee98-27b0-49e2-8f11-13b2e8dd01ee.mp3' },
  { id: 'xyqF3vGMQlPk3e7yA4DI', name: 'Ahu', gender: 'female', accent: 'istanbul', description: 'Cheerful, Encouraging and Inviting', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f83ac5eed5f347e2a0086d872e9b3f7b/voices/xyqF3vGMQlPk3e7yA4DI/nmR584ndl4Yh7FCzz6tf.mp3' },
  { id: 'EJGs6dWlD5VrB3llhBqB', name: 'Cicek', gender: 'female', accent: 'standard', description: 'Joyful and Dynamic Storyteller', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f83ac5eed5f347e2a0086d872e9b3f7b/voices/EJGs6dWlD5VrB3llhBqB/szhfZFAxWkMVrrhwqt5s.mp3' },
  { id: 'gyxPK6bLXQAkBSCeAKvk', name: 'Sultan', gender: 'female', accent: 'istanbul', description: 'Theatrical, Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f83ac5eed5f347e2a0086d872e9b3f7b/voices/gyxPK6bLXQAkBSCeAKvk/bI5yBx3nybdHi5e5fEbY.mp3' },
  { id: 'mBUB5zYuPwfVE6DTcEjf', name: 'Eda Atlas', gender: 'female', accent: 'istanbul', description: 'Smooth, Clear and Balanced', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/T0O5Z5gtSVZjoGKbVP54xHgLQiJ3/voices/mBUB5zYuPwfVE6DTcEjf/0df56022-ba49-46a3-aa9a-298ef15ba3cb.mp3' },
  { id: 'ctoYieZ4J7WwcdhujpMq', name: 'Doga', gender: 'male', accent: 'istanbul', description: 'Audiobook Master', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/bd6a6321e92640508e2b718a1b5e23a8/voices/ctoYieZ4J7WwcdhujpMq/FElqJVaDhp8OF2A0veP6.mp3' },
  // ── 아랍어 (Arabic) Top 9 ──
  { id: 'A9ATTqUUQ6GHu0coCz8t', name: 'Hamid', gender: 'male', accent: 'moroccan', description: 'Friendly, Natural and Positive', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/A9ATTqUUQ6GHu0coCz8t/52WpzlQwppmSVSQXa65L.mp3' },
  { id: 'JjTirzdD7T3GMLkwdd3a', name: 'Hamida', gender: 'male', accent: 'modern standard', description: 'Professional and Positive', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/22564c1c97134a0a988f0a94bd49234f/voices/JjTirzdD7T3GMLkwdd3a/hc6YcErP6oKlxrAgUvpK.mp3' },
  { id: 'IES4nrmZdUBHByLBde0P', name: 'Haytham', gender: 'male', accent: 'egyptian', description: 'Energetic, Warm and Cheerful', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/9QU6MqZNA2gQa3xJofEAkVetJtm1/voices/IES4nrmZdUBHByLBde0P/k0uwHjffW70gT6nJ9gW5.mp3' },
  { id: 'R6nda3uM038xEEKi7GFl', name: 'Anas', gender: 'male', accent: 'modern standard', description: 'Calm, Attractive and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4dd89dc295f141cd873347db66bae892/voices/R6nda3uM038xEEKi7GFl/hyjPYHgaCHfuSSap6ALl.mp3' },
  { id: 'G1HOkzin3NMwRHSq60UI', name: 'Chaouki', gender: 'male', accent: 'modern standard', description: 'Deep, Clear and Engaging', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/dd51c62c3d47407f8e7b8df4155e5b77/voices/G1HOkzin3NMwRHSq60UI/FCpLOKXKzdV9xZjqLoaW.mp3' },
  { id: 'u0TsaWvt0v8migutHM3M', name: 'Ghizlane', gender: 'female', accent: 'modern standard', description: 'Smooth, Distinctive and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9d530b09b66f4290825f6a875bf94588/voices/u0TsaWvt0v8migutHM3M/oxi7BOeX3pB7YElCrYvu.mp3' },
  { id: 'rPNcQ53R703tTmtue1AT', name: 'Mazen Lawand', gender: 'male', accent: 'modern standard', description: 'Deep and Professional', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4acdacdfb7724a85a991004c4b2907e3/voices/rPNcQ53R703tTmtue1AT/mcHBML9LE3BlDH6Bc51u.mp3' },
  { id: 'DPd861uv5p6zeVV94qOT', name: 'Mo Wiseman', gender: 'male', accent: 'modern standard', description: 'Neutral and Professional', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/6614f2739af14414841edbe1563249d5/voices/DPd861uv5p6zeVV94qOT/8DG5EUzEUvVlMQtQqcZ9.mp3' },
  { id: 'mRdG9GYEjJmIzqbYTidv', name: 'Sana', gender: 'female', accent: 'modern standard', description: 'Calm, Soft and Honest', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/mRdG9GYEjJmIzqbYTidv/QDWxPOKqyxeNJEgcmVIY.mp3' },
  // ── 힌디어 (Hindi) Top 4 ──
  { id: 'H6QPv2pQZDcGqLwDTIJQ', name: 'Kanika', gender: 'female', accent: 'standard', description: 'Soft, Smooth and Muffled', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/H6QPv2pQZDcGqLwDTIJQ/byWX5Mzqivq9Xm5WroR4.mp3' },
  { id: 'iWNf11sz1GrUE4ppxTOL', name: 'Viraj', gender: 'male', accent: 'standard', description: 'Warm, Energetic and Lively', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d94e9241c48e8b7905375729c436f/voices/iWNf11sz1GrUE4ppxTOL/ZjhHc8ETmKHsh1IwKYOW.mp3' },
  { id: 'LWFgMHXb8m0uANBUpzlq', name: 'Saavi', gender: 'female', accent: 'standard', description: 'Firm, Polite and Professional', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/LWFgMHXb8m0uANBUpzlq/C6dMpOzVoFvy3BE5qFvz.mp3' },
  { id: '7w5JDCUNbeKrn4ySFgfu', name: 'Nikita', gender: 'female', accent: 'standard', description: 'Calm, Smooth and Diplomatic', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/7w5JDCUNbeKrn4ySFgfu/wNF2F3WOgIXPMlssyzcj.mp3' },
  // ── 스웨덴어 (Swedish) Top 10 ──
  { id: 'aSLKtNoVBZlxQEMsnGL2', name: 'Sanna Hartfield', gender: 'female', accent: 'stockholm', description: 'Calm and Soothing', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/aSLKtNoVBZlxQEMsnGL2/g7yysxvG83AAWczMihDs.mp3' },
  { id: '4xkUqaR9MYOJHoaC1Nak', name: 'Sanna Hartfield', gender: 'female', accent: 'stockholm', description: 'Direct and Natural', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/4xkUqaR9MYOJHoaC1Nak/l4PwfhXHwvKzA0G9XP46.mp3' },
  { id: 'x0u3EW21dbrORJzOq1m9', name: 'Adam Composer', gender: 'male', accent: 'stockholm', description: 'Resonant and Smooth', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/Clk6kdJ10yNzb14pOOqXKi1y5qW2/voices/x0u3EW21dbrORJzOq1m9/ffda0752-26f1-4341-8f31-161771679941.mp3' },
  { id: '4Ct5uMEndw4cJ7q0Jx0l', name: 'Elin', gender: 'female', accent: 'standard', description: 'Neutral and Clear', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f058c362be5e4dcc910a23a41bacf39b/voices/4Ct5uMEndw4cJ7q0Jx0l/5c2e97c0-0656-47c7-8ed3-edb586056f26.mp3' },
  { id: 'ZSHzpa6aUvhjzShiBmYw', name: 'Sanna Hartfield', gender: 'female', accent: 'stockholm', description: 'Sassy and Natural', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/ZSHzpa6aUvhjzShiBmYw/7pBsUd1ILgCpjTy8Wgbc.mp3' },
  { id: '6eknYWL7D5Z4nRkDy15t', name: 'Tommy Thunstroem', gender: 'male', accent: 'stockholm', description: 'Warm and Informative', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/58422e05c38b4a9aa2d4a0850b1e63f9/voices/6eknYWL7D5Z4nRkDy15t/DJmKx32l40yW3NuIHHf8.mp3' },
  { id: 'e6OiUVixGLmvtdn2GJYE', name: 'Jonas', gender: 'male', accent: '', description: 'Calm and Informative', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9aa975b86bac4c69839c2321ccbc1151/voices/e6OiUVixGLmvtdn2GJYE/V5SYzg6Bl9B5uSNC7fV9.mp3' },
  { id: 'Hyidyy6OA9R3GpDKGwoZ', name: 'Jonas', gender: 'male', accent: 'standard', description: 'Deep and Soft', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9aa975b86bac4c69839c2321ccbc1151/voices/Hyidyy6OA9R3GpDKGwoZ/FRwazff2ij4ecnn4r0w0.mp3' },
  { id: 'ZMs9a3j1SLzirC7aygJQ', name: 'Kim', gender: 'male', accent: 'standard', description: 'Svenska Swedish', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/99541c0a909846ce9e022aa781e21c4a/voices/ZMs9a3j1SLzirC7aygJQ/c234c8c7-b17d-42a9-998d-dba903b0d0b5.mp3' },
  { id: 'kkwvaJeTPw4KK0sBdyvD', name: 'Bengt', gender: 'male', accent: 'stockholm', description: 'Calm and Soft', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/V3Gpka2WxEYJYHlfzaeGy6jy6lQ2/voices/kkwvaJeTPw4KK0sBdyvD/47jpMs5V1lj0sfieKg0D.mp3' },
  // ── 덴마크어 (Danish) Top 10 ──
  { id: 'ygiXC2Oa1BiHksD3WkJZ', name: 'Mathias', gender: 'male', accent: 'jutlandic', description: 'Engaging, Natural and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/ygiXC2Oa1BiHksD3WkJZ/MV8Filx4M2vlCNaIVYQH.mp3' },
  { id: '4RklGmuxoAskAbGXplXN', name: 'Camilla', gender: 'female', accent: 'standard', description: 'Engaging, Clear and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/GLHtjme4TaMqpVNVgCCfnTTP9V83/voices/4RklGmuxoAskAbGXplXN/0kCsINU8zBYHxnARRVuj.mp3' },
  { id: 'qhEux886xDKbOdF7jkFP', name: 'Peter', gender: 'male', accent: 'jutlandic', description: 'Natural, Crisp and Clear', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b7de9cdb452c42cd99cace8f439f84a4/voices/qhEux886xDKbOdF7jkFP/CN2AcSQbdFelH935S6wh.mp3' },
  { id: 'V34B5u5UbLdNJVEkcgXp', name: 'Noam', gender: 'male', accent: 'standard', description: 'Enganging and Clear', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Y5PmvPiuIgg4MOmnLt0xQK5ZuFt1/voices/V34B5u5UbLdNJVEkcgXp/DfCGJIBrBoaIpyw3V1D4.mp3' },
  { id: 'C43bq5qXRueL1cBQEOt3', name: 'Thomas Hansen', gender: 'male', accent: 'zealandic', description: 'Warm and Deep', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/C43bq5qXRueL1cBQEOt3/ui83Ml7a5tGPyrybvHKT.mp3' },
  { id: 'xj6X4BCUsv9oxohm1E8o', name: 'Søren', gender: 'male', accent: 'standard', description: 'Clear, Confident and Versatile', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/4abfd02396ce4a52997eb1f88bd5a8e2/voices/xj6X4BCUsv9oxohm1E8o/90bceee2-33ad-4d97-8a44-84bf43c1f600.mp3' },
  { id: 'Hp07ONf6C5qlCKOeB4oo', name: 'Constantin Birkedal', gender: 'male', accent: 'standard', description: 'Calm and Soothing', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/Hp07ONf6C5qlCKOeB4oo/C96hZPXoNWAzYw5L7Dg6.mp3' },
  { id: 'EU14UTtflRFtOAuWCuVe', name: 'Teddy Andersen', gender: 'male', accent: 'zealandic', description: 'Clear and Calm', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/6e987935d1eb48b8a9ad512e88744bd8/voices/EU14UTtflRFtOAuWCuVe/pFYgY8JUumI1LC7XUE8c.mp3' },
  { id: '6SjhOkgKPuHxm8q0eIyp', name: 'Christian', gender: 'male', accent: 'standard', description: 'Calm and Engaging', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/01a5UjZkyLNqLuSIS16XMgUrgb82/voices/6SjhOkgKPuHxm8q0eIyp/3c3c45ba-be49-40c3-bfa8-d36a3f39f8af.mp3' },
  { id: 'BIWC0507fYMfhPcAEIRP', name: 'Mads', gender: 'male', accent: 'standard', description: 'Clear, Direct and Natural', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/480a3afac9d94324b853c391dbb1b1a3/voices/BIWC0507fYMfhPcAEIRP/GZFefGovFI6dVP8GdxBr.mp3' },
  // ── 핀란드어 (Finnish) Top 10 ──
  { id: '3OArekHEkHv5XvmZirVD', name: 'Christoffer Weiss', gender: 'male', accent: 'standard', description: 'Hopeful and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/cae5677dcfb9432aba7e923db4c5d808/voices/3OArekHEkHv5XvmZirVD/26b3d232-c1b4-49f9-894d-e58a0b70b78f.mp3' },
  { id: 'YSabzCJMvEHDduIDMdwV', name: 'Aurora', gender: 'female', accent: 'standard', description: 'Cheerful, Optimistic and Round', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/5849aab0fe5d41b6900406393e93407d/voices/YSabzCJMvEHDduIDMdwV/2kWo0RqG5nwi2Mc8dP23.mp3' },
  { id: 'JMfkzZiSsox62UXcXUqM', name: 'Jaakko', gender: 'male', accent: 'standard', description: 'Calm, Reflective and Soft', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d83501083c7646bba14f9de45fe658a8/voices/JMfkzZiSsox62UXcXUqM/xYL6fnjYv1TNC8DzHGyN.mp3' },
  { id: 'dlbXHgJnwobU5JdZ8F5M', name: 'Jussi', gender: 'male', accent: 'standard', description: 'Strong and Silly', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/13nXZgTVsqRs7AUDZdEx1zCVwSz1/voices/dlbXHgJnwobU5JdZ8F5M/54ec1f5d-26e2-4089-bba5-33b69dc8cb2c.mp3' },
  { id: 'GdUwr3tVJwSb22ROvLCr', name: 'Jukka Uusitalo', gender: 'male', accent: 'standard', description: 'Stoic and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/iU5t7LNgnNbMMcO064tC1U1OnZE3/voices/GdUwr3tVJwSb22ROvLCr/0808285c-8ddd-422b-a316-a70302a54325.mp3' },
  { id: 'Dkbbg7k9Ir9TNzn5GYLp', name: 'Henry Aflecht', gender: 'male', accent: 'helsinki', description: 'Professional and Rich', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/99a50704857c416fbd5f1a8347ff4d4f/voices/Dkbbg7k9Ir9TNzn5GYLp/FCyNtJ7Br2zX6V6W8Ptg.mp3' },
  { id: 'RiWFFlzYFZuu4lPMig3i', name: 'Soili', gender: 'female', accent: 'standard', description: 'Neutral and Light', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/1xMTBfxfegV5VxuXy0TSXFVPHh32/voices/RiWFFlzYFZuu4lPMig3i/a88af9f5-a376-4456-bc48-8c2645214ddc.mp3' },
  { id: 'XFCwH7g0WlOZiFnelted', name: 'Ville', gender: 'male', accent: 'western', description: 'Serious and Condescending', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/yMpJRHmLUkXu9LCp6f3yVsjtFuO2/voices/XFCwH7g0WlOZiFnelted/QWWze1RrBLhLPn0Aiu6l.mp3' },
  { id: 'c4ZwDxrFaobUF5e1KlEM', name: 'Lumi', gender: 'female', accent: 'standard', description: 'Anxious, Cold and Light', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/jPHVwvKeTHOVkrVZRq5arBWVyqt1/voices/c4ZwDxrFaobUF5e1KlEM/O8gWow03S90qGADnZ9sC.mp3' },
  { id: 'fC33e0BIKA7wWK2MeARj', name: 'Miika', gender: 'male', accent: 'helsinki', description: 'Diplomatic and Steady', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/795c03b673c748199764e00350f346c1/voices/fC33e0BIKA7wWK2MeARj/6b96cd69-d740-4f52-b461-bc740303fcd3.mp3' },
  // ── 노르웨이어 (Norwegian) Top 10 ──
  { id: 'uNsWM1StCcpydKYOjKyu', name: 'Mia Starset- Clear and Friendly', gender: 'female', accent: 'oslo', description: 'social_media', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/a2175a4ce5a74c88868dd9d4a000c9a6/voices/uNsWM1StCcpydKYOjKyu/868f87d5-7724-4786-a7fa-a48e01b2ba54.mp3' },
  { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes', gender: 'male', accent: 'standard', description: 'Motivating and Enthusiastic', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/2dhHLsmg0MVma2t041qT/fX3l7ljt7bx6zRPz8VdC.mp3' },
  { id: 'b3jcIbyC3BSnaRu8avEk', name: 'Emma', gender: 'female', accent: 'bergen', description: 'Shy and Friendly', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/OSbmAb1GKjNVlChP2UgZukCicWR2/voices/b3jcIbyC3BSnaRu8avEk/bZ5dFORSQeyFBQ7VAv9C.mp3' },
  { id: 'xF681s0UeE04gsf0mVsJ', name: 'Olaf', gender: 'male', accent: 'oslo', description: 'Clear and Natural', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/cb4e4c92babd4a5381dde500bcc7355c/voices/xF681s0UeE04gsf0mVsJ/3dc6dfd1-9da9-4de7-8ebb-d7a816d78215.mp3' },
  { id: '9pRpxWU0T7UFt2oEMH6n', name: 'Martin', gender: 'male', accent: 'oslo', description: 'Clear and Comforting', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/408531ea7aed4c77ab939337205ecbb0/voices/9pRpxWU0T7UFt2oEMH6n/5EmH9uT3Xjvhb8O9yb3d.mp3' },
  { id: '4kCDY3HJwvO7Zp3con83', name: 'Sebastian', gender: 'male', accent: 'oslo', description: 'Confident Podcaster', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d6544c43ad7b45308f939944a3b0e1e4/voices/4kCDY3HJwvO7Zp3con83/sGeejvkPkLyB9nBSDgTK.mp3' },
  { id: 's2xtA7B2CTXPPlJzch1v', name: 'Dennis', gender: 'male', accent: 'oslo', description: 'Clear and Pleasant', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15af1c0d0dcd479cb8376a767ab07b4c/voices/s2xtA7B2CTXPPlJzch1v/YB9DE4weRg6BTei8hVZ5.mp3' },
  { id: 'dgrgQcxISbZtq517iweJ', name: 'Ola', gender: 'male', accent: 'standard', description: 'Confident and Firm', useCase: 'social_media', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/AuO1jwviwhbrmjriSQ5vH5XRFP52/voices/dgrgQcxISbZtq517iweJ/8197b596-0bee-4059-970f-539ac9f747d3.mp3' },
  { id: 'vUmLiNBm6MDcy1NUHaVr', name: 'Helge', gender: 'male', accent: 'oslo', description: 'Natural, Deep and Calm', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3690d7df74c84d8880e0e0d0641de7f2/voices/vUmLiNBm6MDcy1NUHaVr/6JBvRVvXcssLtXlaqLg1.mp3' },
  { id: 'BGEU6wFi2uNm6Kje1Yhk', name: 'Maja', gender: 'female', accent: 'oslo', description: 'Calm Audiobook Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BGEU6wFi2uNm6Kje1Yhk/gCIHS9pPkrtwiAjN4VgG.mp3' },
  // ── 베트남어 (Vietnamese) Top 10 ──
  { id: 'ueSxRO0nLF1bj93J2hVt', name: 'Trung Caha', gender: 'male', accent: 'northern', description: 'Clear, Firm and Informative', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/y6fKTFEG7Ee17Z1zDZHoGFNsVKY2/voices/ueSxRO0nLF1bj93J2hVt/de4ac6e9-75d7-44c5-bb50-2305dfdda280.mp3' },
  { id: '3VnrjnYrskPMDsapTr8X', name: 'Tung Dang', gender: 'male', accent: 'northern', description: 'Deep, Warm and Resonant', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/COsSJJG6gjWu8B6HtAYraUqntxT2/voices/3VnrjnYrskPMDsapTr8X/rTtnskqz8S0pmuxMwNB3.mp3' },
  { id: '1d5Bb0SMBPB10Gx6iQeu', name: 'Tung Dang', gender: 'male', accent: 'northern', description: 'Warm, Calm and Gentle', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/xySPRx6W6TVRFbUaO4ZV0zjYohF3/voices/1d5Bb0SMBPB10Gx6iQeu/4fa59491-5277-44eb-9cba-8338034d77b0.mp3' },
  { id: 'pGapy9MNHCukzJtjavF0', name: 'Hạnh', gender: 'female', accent: 'northern', description: 'Smooth, Clear and Feminine', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/86fa75d668664d05b672422c46445ee1/voices/pGapy9MNHCukzJtjavF0/duQY8YxBOH1Nje7wdDiR.mp3' },
  { id: '7hsfEc7irDn6E8br0qfw', name: 'Hai Ly', gender: 'male', accent: 'southern', description: 'Deep, Serious and Resonant', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/kg1F3Wh21fcmmmzFovRwWFO1G8H3/voices/7hsfEc7irDn6E8br0qfw/93dcf970-15c9-4d5d-9a0e-0922217412f6.mp3' },
  { id: 'foH7s9fX31wFFH2yqrFa', name: 'Huyen', gender: 'female', accent: 'central', description: 'Calm, Friendly and Clear', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/1e1bb97afeab43e996ceefadc09fce07/voices/foH7s9fX31wFFH2yqrFa/XEIsoRs7xArbmUx1pJpp.mp3' },
  { id: 'd5HVupAWCwe4e6GvMCAL', name: 'Mai', gender: 'female', accent: 'standard', description: 'Natural, Bright and Authentic', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/nC20Y9bj9MP3UfzmgV2UyqTyISu2/voices/d5HVupAWCwe4e6GvMCAL/AiQpA1F3HAiST2pCXpaR.mp3' },
  { id: 'xPEfmymXC4WdBxGMznS7', name: 'Tuyết', gender: 'female', accent: 'southern', description: 'Crisp, Formal and Professional', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9d8c3e6f2a2d4f0785dbce6e39838c85/voices/xPEfmymXC4WdBxGMznS7/xuq5fw3fKBo80gn9Ac5e.mp3' },
  { id: 'FTYCiQT21H9XQvhRu0ch', name: 'Trung', gender: 'male', accent: 'southern', description: 'Soft, Smooth and Narrative', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/9CKGEGlc24hvG3fABbarF04bjzI3/voices/FTYCiQT21H9XQvhRu0ch/efc9a24c-917d-49cb-a2ad-e2d28d121776.mp3' },
  { id: 'A5w1fw5x0uXded1LDvZp', name: 'Nhu', gender: 'female', accent: 'standard', description: 'Calm and Confident', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/e8cFAZ3jguXZnISE72DJv52u8dt2/voices/A5w1fw5x0uXded1LDvZp/Pl44dvqAAGrwxZEta7mE.mp3' },
  // ── 인도네시아어 (Indonesian) Top 9 ──
  { id: 'RWiGLY9uXI70QL540WNd', name: 'Putra', gender: 'male', accent: 'standard', description: 'Smooth, Clear and Engaging', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/RWiGLY9uXI70QL540WNd/K9KyX0PpKq51sEVudfou.mp3' },
  { id: 'TMvmhlKUioQA4U7LOoko', name: 'Andi', gender: 'male', accent: 'standard', description: 'Clear, Friendly and Calm', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/TMvmhlKUioQA4U7LOoko/Dr22F3ZfMBY8NhEcuns6.mp3' },
  { id: 'iWydkXKoiVtvdn4vLKp9', name: 'Cahaya', gender: 'female', accent: 'standard', description: 'Youthful, Clear and Engaging', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/qiopUWV9CyX6cxobbTRT4DbxZNz1/voices/iWydkXKoiVtvdn4vLKp9/DZBbt6Ct6WxuyseL9Cn4.mp3' },
  { id: 'plgKUYgnlZ1DCNh54DwJ', name: 'Dakocan', gender: 'male', accent: 'standard', description: 'Expressive, Cheerful and Clear', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/3eec0209b926438181358e9dff604f79/voices/plgKUYgnlZ1DCNh54DwJ/HejSq6IywpJ4DZNrJGpv.mp3' },
  { id: 'v70fYBHUOrHA3AKIBjPq', name: 'Mahaputra', gender: 'male', accent: 'standard', description: 'Neutral, Calm and Gravelly', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/kpIUsCETmARNBTw0b1WX3Q5WOKj2/voices/v70fYBHUOrHA3AKIBjPq/VhasN1RscY5mKrMIYPk0.mp3' },
  { id: 'lFjzhZHq0NwTRiu2GQxy', name: 'Tri Nugraha', gender: 'male', accent: '', description: 'Friendly and Inviting', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/RQwIb5Id6wd09VubvX1MqxHmeir2/voices/lFjzhZHq0NwTRiu2GQxy/f97f401a-cc7c-4b82-9d0a-fd12931225fb.mp3' },
  { id: 'q8qwd1jY2jS3AWOBeq25', name: 'Pratama', gender: 'male', accent: 'standard', description: 'Clear, Confident and Warm', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/q8qwd1jY2jS3AWOBeq25/dfUsz6O5uJBm2IUhAmut.mp3' },
  { id: 'I7sakys8pBZ1Z5f0UhT9', name: 'Putri Maharani', gender: 'female', accent: 'javanese', description: 'Neutral and WItty', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/514d70c86a464d81a91db30732bc894a/voices/I7sakys8pBZ1Z5f0UhT9/46f47948-560b-4921-bdbe-d59b885a0a7f.mp3' },
  { id: 'd888tBvGmQT2u05J1xTv', name: 'Ahmad', gender: 'male', accent: 'standard', description: 'Professional, Clear and Engaging', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/qiopUWV9CyX6cxobbTRT4DbxZNz1/voices/d888tBvGmQT2u05J1xTv/bNttiU7o1SfQBzRK4lKh.mp3' },
  // ── 말레이어 (Malay) Top 10 ──
  { id: 'NpVSXJvYSdIbjOaMbShj', name: 'Jawid Iqbal Anwar', gender: 'male', accent: 'malaysian', description: 'News Anchor', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/7dd4bb79f4ae43d6953a5e308e2a29c7/voices/NpVSXJvYSdIbjOaMbShj/xCnae41e9eoVULU1ej1t.mp3' },
  { id: 'UcqZLa941Kkt8ZhEEybf', name: 'Afifah', gender: 'female', accent: 'malaysian', description: 'Friendly, Tender and Calm', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9002b031ef4a4666afd939a69b23707b/voices/UcqZLa941Kkt8ZhEEybf/k0blaR8FBgC5kTq5dYBL.mp3' },
  { id: 'C1gMsiiE7sXAt59fmvYg', name: 'Hasnan', gender: 'male', accent: 'malaysian', description: 'Stoic, Smooth and Clear', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ee791124759245929cb440d1f0795a09/voices/C1gMsiiE7sXAt59fmvYg/oQlP26b7qc4xp4DegSUz.mp3' },
  { id: 'Wc6X61hTD7yucJMheuLN', name: 'Faizal', gender: 'male', accent: 'malaysian', description: 'Calm, Clear and Inviting', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/c45072cc76304e8d8f4c8d8a14949486/voices/Wc6X61hTD7yucJMheuLN/crXMHXZMPP0Tpc09mafX.mp3' },
  { id: 'BeIxObt4dYBRJLYoe1hU', name: 'Athira', gender: 'female', accent: 'malaysian', description: 'Personal, Warm and Encouraging', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/BeIxObt4dYBRJLYoe1hU/NQrWask5w514vWhnor4V.mp3' },
  { id: 'qAJVXEQ6QgjOQ25KuoU8', name: 'Aisyah', gender: 'female', accent: 'malaysian', description: 'Expressive, Engaging and Clear', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/qAJVXEQ6QgjOQ25KuoU8/env6UwUPbSPIDJjKoPAd.mp3' },
  { id: 'NHFTLozDZneDWyQjRGAO', name: 'Ashraf', gender: 'male', accent: 'malaysian', description: 'Smooth, Casual and Expressive', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/NHFTLozDZneDWyQjRGAO/kvwcZMxgsgJZUxwcxWkm.mp3' },
  { id: 'SrWU271vZiNf2mrBhzL5', name: 'Zain', gender: 'male', accent: 'malaysian', description: 'Deep, Reassuring and Warm', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/SrWU271vZiNf2mrBhzL5/xtnihsmGYG6rOB2llODJ.mp3' },
  { id: 'lMSqoJeA0cBBNA9FeHAs', name: 'Rizq Khalid', gender: 'male', accent: 'malaysian', description: 'Casual, Friendly and Warm', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/lMSqoJeA0cBBNA9FeHAs/NQLrt6dTDtvUzLsLGT28.mp3' },
  { id: '15Y62ZlO8it2f5wduybx', name: 'Shazrina', gender: 'female', accent: 'malaysian', description: 'Calm, Soothing and Gentle', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/ed9b05e6324c457685490352e9a1ec90/voices/15Y62ZlO8it2f5wduybx/K7sfkziZuV1PxrkVFYlW.mp3' },
  // ── 우크라이나어 (Ukrainian) Top 10 ──
  { id: '9Sj8ugvpK1DmcAXyvi3a', name: 'Alex Nekrasov', gender: 'male', accent: 'standard', description: 'Confident and Clear', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/422ab51746234a479c3d767267557dd0/voices/9Sj8ugvpK1DmcAXyvi3a/2dCZWU3mjLdCIto8IEde.mp3' },
  { id: 'Ntd0iVwICtUtA6Fvx27M', name: 'Evgeniy Shevchenko', gender: 'male', accent: 'standard', description: 'Vibrant and Rich', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/0C5bUhgexLd2XXTbJno4O0594Yz1/voices/Ntd0iVwICtUtA6Fvx27M/etVdkbJAlgLzzPLOHWJc.mp3' },
  { id: 'GVRiwBELe0czFUAJj0nX', name: 'Anton', gender: 'male', accent: 'standard', description: 'Friendly and Warm Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/GVRiwBELe0czFUAJj0nX/E7fsygZN4CLpuyugUzMg.mp3' },
  { id: '0ZQZuw8Sn4cU0rN1Tm2K', name: 'Yaroslava', gender: 'female', accent: 'standard', description: 'Loud and Hasty', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/32835d90553b4e26a0c044b7e63aac76/voices/0ZQZuw8Sn4cU0rN1Tm2K/932Hcjo6C9gCayBjAX4q.mp3' },
  { id: 'h9NSQvWZaC4NFusYsxT9', name: 'Artem Klopotenko', gender: 'male', accent: 'standard', description: 'Low, Rich and Deep', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Jzkh6pLqc9fCLQbd1jVbl97XRT12/voices/h9NSQvWZaC4NFusYsxT9/1PFHddx4cvKqvTAjig2W.mp3' },
  { id: 'jn6ifzU1eO5tfUZ2ZJVg', name: 'Bogdan', gender: 'male', accent: 'standard', description: 'Melodic and Calm', useCase: 'narrative_story', age: 'old', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f5225858b69c46afbc8a5081aadeb0a9/voices/jn6ifzU1eO5tfUZ2ZJVg/dwThNtKnoihElXMqWhAb.mp3' },
  { id: 'nCqaTnIbLdME87OuQaZY', name: 'Vira', gender: 'female', accent: 'standard', description: 'Natural and Young Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/mGLUsH9ra4W6rflL9dtShIY2uUu2/voices/nCqaTnIbLdME87OuQaZY/IiRrubwJ498oRvAHRYG3.mp3' },
  { id: '2OXYbN1uGomXXJtv9Dq6', name: 'Mariya Maro', gender: 'female', accent: 'standard', description: 'Educational and Harmonious', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/1rswuGKLRSP2VgocvkaJeeXfRfh1/voices/2OXYbN1uGomXXJtv9Dq6/Jo8qs5WAiDZpFE8C8z5S.mp3' },
  { id: 'eLDtXX7z65CuLasDRxrP', name: 'Leonid Drapei', gender: 'male', accent: 'kiev', description: 'Wise, Calm Teacher', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/wGgT0mrgTGVR0I3sPPschX50lcy2/voices/eLDtXX7z65CuLasDRxrP/bfcY6ku3OvyAtb4He0tJ.mp3' },
  { id: 'MajbwhPMg2mRJJCesMAF', name: 'Oleksii Safin', gender: 'male', accent: 'standard', description: 'Friendly Storyteller', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/d50c97a782ca46b6a530ad72e2ec00a4/voices/MajbwhPMg2mRJJCesMAF/MI4uK9KrgqstfUnbPve5.mp3' },
  // ── 체코어 (Czech) Top 10 ──
  { id: 'KIDKfqJyZ6ASuyzsKfh5', name: 'Jan', gender: 'male', accent: 'standard', description: 'Kind Educator', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/sjJWLRlqj8W9ArJIbXFZYEDcxjQ2/voices/KIDKfqJyZ6ASuyzsKfh5/df856826-2754-491a-b766-25b5bfd3e3b7.mp3' },
  { id: 'uYFJyGaibp4N2VwYQshk', name: 'Adam', gender: 'male', accent: 'standard', description: 'Velvety and Conversational', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/ZpYbCaSd2uMVjSr1tTgZPFLl0J92/voices/uYFJyGaibp4N2VwYQshk/P9QQG2a62C0lhe2HlcbL.mp3' },
  { id: 'SZXidiHhq5QYe3jRboSZ', name: 'Anet', gender: 'female', accent: 'standard', description: 'Low, Soft and Conversational', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Lxslac0DMQfxUxRl8QN7Z94dYON2/voices/SZXidiHhq5QYe3jRboSZ/gD3tevmcEIzIfjgB2RIN.mp3' },
  { id: 'MpbYQvoTmXjHkaxtLiSh', name: 'Anet', gender: 'female', accent: 'standard', description: 'Youthful and Lively', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Lxslac0DMQfxUxRl8QN7Z94dYON2/voices/MpbYQvoTmXjHkaxtLiSh/hS3NsIINKt5zDt0MdAkF.mp3' },
  { id: 'vP4R9CqQI4q0HlVrXJWj', name: 'Zdeněk', gender: 'male', accent: 'moravian', description: 'Strong and Deep', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/P8BUUXEqs4gY6NfTTTOHhpkHrxs1/voices/vP4R9CqQI4q0HlVrXJWj/8ead5ebc-1d82-4a88-9382-2d29ab93969d.mp3' },
  { id: 'daJ4gHLkIVFskWuoLuDX', name: 'Oliver', gender: 'male', accent: 'standard', description: 'Smooth and Engaging', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/HY88H4Uq97TGKQR1MdUaynYIepZ2/voices/daJ4gHLkIVFskWuoLuDX/BVC2CV4vdJhLtgd0XxOF.mp3' },
  { id: 'tybm70uORPNccntEcJsn', name: 'Jan', gender: 'male', accent: 'standard', description: 'Kind, Gentle and Bright', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/tybm70uORPNccntEcJsn/6QwvhuOBlE1YhBkJxJij.mp3' },
  { id: 'NHv5TpkohJlOhwlTCzJk', name: 'Pawel', gender: 'male', accent: 'standard', description: 'Cinematic, Deep and Confident', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/NHv5TpkohJlOhwlTCzJk/Ar2PrUj6pcg0KGkVPS9b.mp3' },
  { id: '12CHcREbuPdJY02VY7zT', name: 'Hanka', gender: 'female', accent: 'standard', description: 'Friendly and Informative', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/EAn4Akpve4a1fpzrEtD4RmQFD093/voices/12CHcREbuPdJY02VY7zT/153e50e3-9031-4cd3-b264-02b5c5807605.mp3' },
  { id: 'U48DQ1c9SVmD2BVCSiHL', name: 'Zazy', gender: 'male', accent: 'prague', description: 'Clear Audiobook Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f5da7c7d26cd48c9aabc3dd1164e577e/voices/U48DQ1c9SVmD2BVCSiHL/1nbWhTVvKQ3dKdBAdFap.mp3' },
  // ── 그리스어 (Greek) Top 10 ──
  { id: 'n0vzWypeCK1NlWPVwhOc', name: 'Theos', gender: 'male', accent: 'standard', description: 'Narrational, Assertive and Warm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/f9763f6798804329a4b8477a77bdf6e1/voices/n0vzWypeCK1NlWPVwhOc/2sneA72VxMA5Mu7n1hYh.mp3' },
  { id: 'aTP4J5SJLQl74WTSRXKW', name: 'Eleni', gender: 'female', accent: 'athenian', description: 'Soft, Narrational and Calm', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/255baaabcfc84b5eb4f04d692be78392/voices/aTP4J5SJLQl74WTSRXKW/hyr8Eu2OJQ9xgjKnIet3.mp3' },
  { id: '6z1Ks05MOtac6wYNh9PJ', name: 'Kyriakos', gender: 'male', accent: 'standard', description: 'Soft, Narrational and Calm', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/6z1Ks05MOtac6wYNh9PJ/uSvZuhBr5GjSGYvRBtre.mp3' },
  { id: '20zUtLxCwVzsFDWub4sB', name: 'Stefanos', gender: 'male', accent: 'athenian', description: 'Calm, Narrational and Soft', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/255baaabcfc84b5eb4f04d692be78392/voices/20zUtLxCwVzsFDWub4sB/CcN2gbQ6PDzvLXrOjPjp.mp3' },
  { id: '7smwXrU3C1PfaspIIUZB', name: 'Sophia', gender: 'female', accent: 'standard', description: 'Assertive, Joyful and Warm', useCase: 'social_media', age: '', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/c3JOIhoL6lO7oDYqBZgYhN11opv2/voices/7smwXrU3C1PfaspIIUZB/XvDVnU0byCNE9jqf67Mz.mp3' },
  { id: 'cuab90umcstNgL8U7orz', name: 'Fatsis', gender: 'male', accent: 'athenian', description: 'Narrational, Warm and Crisp', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/heOR91darVcJI30926rlWkd63112/voices/cuab90umcstNgL8U7orz/30372f3a-3ddb-4437-9b08-6d543e1b278d.mp3' },
  { id: '5DAtyqt3LGjv9jkjNVFd', name: 'Eugene', gender: 'male', accent: 'standard', description: 'Expressove, Calm and Brisk', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/BWIAlj31dDNny5DwqoZoNP8NyZl1/voices/5DAtyqt3LGjv9jkjNVFd/3ec27ae8-a1de-4f1d-bfdc-03e57437f429.mp3' },
  { id: 'AnNshXL08po8KEaf53gz', name: 'Niki 2', gender: 'female', accent: 'standard', description: 'Calm, Reassuring and Engaging', useCase: 'advertisement', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/AnNshXL08po8KEaf53gz/dPGGZivhdlU7YUg15c9f.mp3' },
  { id: 'TN3alZndDSA8GYZSOf3r', name: 'Georgios', gender: 'male', accent: 'standard', description: 'Casual, Calm and Reassuring', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/31274ed6ef0b4444af8ef4cf24fd72be/voices/TN3alZndDSA8GYZSOf3r/b64f3e87-1d93-4c13-8b50-7fdaecd40ec5.mp3' },
  { id: 'PaZ8laODC1yRxHTPYJFh', name: 'Christos', gender: 'male', accent: 'standard', description: 'Casual, Calm and Serious', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/z5PbgN7dTVdC7u0rKOHxzARwDzC3/voices/PaZ8laODC1yRxHTPYJFh/R5kHzTJHWbiFPWjNgkAc.mp3' },
  // ── 루마니아어 (Romanian) Top 10 ──
  { id: 'OlBp4oyr3FBAGEAtJOnU', name: 'Jora Slobod', gender: 'male', accent: 'standard', description: 'Calm, Deep and Reassuring', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/OlBp4oyr3FBAGEAtJOnU/Uub5cEzcyVo34vqgA9cA.mp3' },
  { id: '3z9q8Y7plHbvhDZehEII', name: 'Antonia', gender: 'female', accent: '', description: 'Mellow, Warm and Cute', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/3z9q8Y7plHbvhDZehEII/RizL5Q4u5cwB0Qrp02so.mp3' },
  { id: 'gbLy9ep70G3JW53cTzFC', name: 'Corina Ioana', gender: 'female', accent: 'standard', description: 'Clear, Friendly and Calm', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/custom/voices/gbLy9ep70G3JW53cTzFC/ORZ4ycrJb2N6RvCCndYi.mp3' },
  { id: 'am5XuPVtut7uKJQKMja2', name: 'Mike L', gender: 'male', accent: 'standard', description: 'Soft, Clear and Charming', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/VkIDvdKbY9fZF8vrmdbI6F2UYTe2/voices/am5XuPVtut7uKJQKMja2/GoyGgNM4vSbDRFvocyIh.mp3' },
  { id: 'urzoE6aZYmSRdFQ6215h', name: 'Ana Maria', gender: 'female', accent: 'standard', description: 'Optimistic and Friendly', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/w3J9bYQwp1QAGGbllSCE43SpSVU2/voices/urzoE6aZYmSRdFQ6215h/23699e46-6ad3-471f-9b50-4f3e39cbf001.mp3' },
  { id: '8nBBDfYxYXmDNaqTCxPH', name: 'Serban Popescu', gender: 'male', accent: 'standard', description: 'Professional Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/nzv6QegAXCVwuS5mwHKKZJ5UY222/voices/8nBBDfYxYXmDNaqTCxPH/zbQ6FRtttuemlxCj28dk.mp3' },
  { id: '5asM3ZxsegvXfXI5vqKQ', name: 'Bogdan', gender: 'male', accent: 'standard', description: 'Melancholic and Smooth', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9f65fe15227844628ab575bb913640ba/voices/5asM3ZxsegvXfXI5vqKQ/WlshpjGzAl8BOGDEE6Qg.mp3' },
  { id: 'xb0RCfp97gx711PCjTKw', name: 'Kuki', gender: 'male', accent: 'standard', description: 'Calm, Serene Narrator', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/JXYiHDu83WfN3mudewbGSloae7v2/voices/xb0RCfp97gx711PCjTKw/tq7BIoztbTqdGFK56CzW.mp3' },
  { id: 'b4bnZ9y3ZRH0myLzE2B5', name: 'Robert Mihai', gender: 'male', accent: 'standard', description: 'Clear, Confident and Calm', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/ngaO8n8JyrdU0CNO9hSSIHXMHaq1/voices/b4bnZ9y3ZRH0myLzE2B5/QE8EXcFPG3DurkS8lLpa.mp3' },
  { id: 'sGcPNcpR5PikknzyXcy7', name: 'Cristi Romana', gender: 'male', accent: 'standard', description: 'Deep and Engaging', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/imc9whn0T2PBwRa9i21U5XpiqLf1/voices/sGcPNcpR5PikknzyXcy7/ukip4tuvCmvj9aFYrCQa.mp3' },
  // ── 헝가리어 (Hungarian) Top 10 ──
  { id: 'TumdjBNWanlT3ysvclWh', name: 'Peter', gender: 'male', accent: 'standard', description: 'Youthful, Casual and Easygoing', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9931d80515704eee97ac601397dfef5e/voices/TumdjBNWanlT3ysvclWh/UtdbtjoD1JNS4TtqyzwM.mp3' },
  { id: 'M336tBVZHWWiWb4R54ui', name: 'David', gender: 'male', accent: 'standard', description: 'Deep, Soothing and Sincere', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/6b8a385000d74357bb4d658bfdf301e0/voices/M336tBVZHWWiWb4R54ui/uxc8WAoUc3HLYjbOXuZL.mp3' },
  { id: 'FkINb4v84xQZDEO0VPcl', name: 'Dávid', gender: 'male', accent: 'standard', description: 'Deep, Natural and Amiable', useCase: 'entertainment_tv', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/6b8a385000d74357bb4d658bfdf301e0/voices/FkINb4v84xQZDEO0VPcl/693b7f22-81f3-4e64-9ae0-0030110cc850.mp3' },
  { id: 'xjlfQQ3ynqiEyRpArrT8', name: 'Vera', gender: 'female', accent: 'standard', description: 'Young, Energetic and Expressive', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b5a2ab0b95ef4475bf4c144ac8a3fb98/voices/xjlfQQ3ynqiEyRpArrT8/fb50230c-5d38-4fb6-9c8f-3db2aa5d7847.mp3' },
  { id: '3DRcczmb3qwp5aVD9M9E', name: 'Attila', gender: 'male', accent: 'standard', description: 'Calm, Young and Casual', useCase: 'informative_educational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/5c8c8dcb29ce43a8b9a9f5bddee520bc/voices/3DRcczmb3qwp5aVD9M9E/8c5d6e2b-1b7d-4545-8d8e-7baa89525896.mp3' },
  { id: 'WYg5oajoUHxVa6ikQXec', name: 'Freddy', gender: 'male', accent: 'standard', description: 'Natural, Calm and Deep', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/15932a5a036e43b7979f3086b295f8ab/voices/WYg5oajoUHxVa6ikQXec/zLwKs4sw7M4nmBYdwOfP.mp3' },
  { id: 'vPyfZcTRVuFmWwDgQRSd', name: 'Nolen', gender: 'male', accent: 'standard', description: 'Calm, Clear and Confident', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/9931d80515704eee97ac601397dfef5e/voices/vPyfZcTRVuFmWwDgQRSd/6IqZEWsHGjzHTLNXxChL.mp3' },
  { id: 'yyPLNYHg3CvjlSdSOdLh', name: 'Balázs', gender: 'male', accent: 'standard', description: 'Energetic, Clear and Personable', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/fdd69c79ee11477e9c591cc208a3174d/voices/yyPLNYHg3CvjlSdSOdLh/wkarJ2ERPSLA1AbcOr4o.mp3' },
  { id: '7B7mSWflzRSaO1yGeJH6', name: 'Gábor', gender: 'male', accent: 'budapest', description: 'Warm, Natural and Confident', useCase: 'conversational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/m5EpmTtkJiTeTLjgf0p8BSnlS1e2/voices/7B7mSWflzRSaO1yGeJH6/285cd002-9c0c-486c-ae59-922f9e7e244d.mp3' },
  { id: 'xQ7QVYmweeFQQ6autam7', name: 'Balázs', gender: 'male', accent: 'standard', description: 'Calm, Rich and Confident', useCase: 'narrative_story', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/fdd69c79ee11477e9c591cc208a3174d/voices/xQ7QVYmweeFQQ6autam7/n21OCUg6KtR7XtGRcvC4.mp3' },
  // ── 불가리아어 (Bulgarian) Top 7 ──
  { id: 'M1ydWt7KnBCiuv4CnEDC', name: 'Milena', gender: 'female', accent: 'standard', description: 'Optimistic, Clear, and Balanced', useCase: 'advertisement', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/44af03d036fe4e5493dd910f7b1834ae/voices/M1ydWt7KnBCiuv4CnEDC/QmyVKrtie1aX5rjVUxvz.mp3' },
  { id: '406EiNlYvqFqcz3vsnOm', name: 'Peter K', gender: 'male', accent: 'sofia', description: 'Warm, Round, and Smooth', useCase: 'informative_educational', age: 'middle_aged', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/hgPss3Iyr5U8wTXr6MepRnIRJJL2/voices/406EiNlYvqFqcz3vsnOm/818538f8-865a-46b9-8b0b-44cf97379ac5.mp3' },
  { id: 'fSxb5mPM1l5zTVVtM3Vb', name: 'Elena', gender: 'female', accent: 'sofia', description: 'Energetic, Friendly, and Clear', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/8c967d20b830406bb14a07e8fa8c1c4d/voices/fSxb5mPM1l5zTVVtM3Vb/G0Cq15DPyNyoPgc06Tx9.mp3' },
  { id: 'pREMn4INXSs2KOPsNcsD', name: 'Alexandra', gender: 'female', accent: 'sofia', description: 'Smooth and Diplomatic', useCase: 'entertainment_tv', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/workspace/b0ec653b178d41c1aa1cb1eb79a9b95d/voices/pREMn4INXSs2KOPsNcsD/1nmSifXNhsTwf2gIMEhe.mp3' },
  { id: 'vnewfQdVVk9Y9DZWVRNm', name: 'Moonglow', gender: 'female', accent: 'standard', description: 'Mediative and Polished', useCase: 'social_media', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/fYDCRFvpbqaI670jbcJdIXClcAd2/voices/vnewfQdVVk9Y9DZWVRNm/b7cd4793-0ed8-4c3b-bc7f-17358ab5411c.mp3' },
  { id: '31jwlwrRwpOA5yGuVAby', name: 'Georgi', gender: 'male', accent: 'standard', description: 'Tender, Rich, and Reassuring', useCase: 'narrative_story', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/Mzpkm54OnTOrhvKd8T6mVBqGWwu1/voices/31jwlwrRwpOA5yGuVAby/shXNHhSvvGSdshOpKMMC.mp3' },
  { id: 'bUta4vyWcGUYrq5W9LDC', name: 'Silvi', gender: 'female', accent: 'standard', description: 'Relaxed, Smooth and Comforting', useCase: 'conversational', age: 'young', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/database/user/user_4901kfb1n8z6f22vfd848340zxyn/voices/bUta4vyWcGUYrq5W9LDC/28cc04e7-7053-42e0-94e7-46faccf6c9e8.mp3' },
];

/** ElevenLabs 음성 이름 → 한국어 표기 매핑 (전체) */
export const EL_NAME_KO: Record<string, string> = {
  // ── 한국어 이름 (성+이름 한국식) ──
  'Anna Kim': '김안나', 'Jin Geon Song': '송진건', 'Joon Park': '박준',
  'Kyungduk Ko': '고경덕', 'Yohan Koo': '구요한', 'Rosa Oh': '오로사',
  'Selly Han': '한셀리', 'Min-joon': '민준', Chungman: '충만',
  Dohyeon: '도현', Hyuk: '혁', Hyunbin: '현빈', Jiyoung: '지영',
  Salang: '살랑', Seulki: '슬기', Sora: '소라', Taehyung: '태형',
  // ── 일본어 이름 ──
  Fumi: '후미', Hatake: '하타케', Hinata: '히나타', Hina: '히나',
  Ishibashi: '이시바시', Kaori: '카오리', Kenzo: '켄조', Kuon: '쿠온',
  Kyoko: '쿄코', Morioki: '모리오키', Otani: '오타니', Sakura: '사쿠라',
  Satomi: '사토미', Shizuka: '시즈카', Shohei: '쇼헤이', Yui: '유이',
  // ── 중국어 이름 ──
  Bin: '빈', Coco: '코코', Haoran: '하오란', Han: '한', Liang: '리앙',
  Siqi: '시치', 'Shan Shan': '산산', Xin: '신', Yu: '유',
  // ── 베트남어 이름 ──
  'Hai Ly': '하이 리', Huyen: '후옌', Nhu: '뉴', Trung: '쭝',
  Tung: '퉁', Hạnh: '하잉', Tuyết: '뚜엣',
  // ── A ──
  Adam: '아담', Adina: '아디나', Adriano: '아드리아노', Afifah: '아피파',
  Ahmad: '아마드', Ahu: '아후', Aisyah: '아이샤', Alberto: '알베르토',
  Alejandro: '알레한드로', Alex: '알렉스', Alexandr: '알렉산드르',
  Alexandra: '알렉산드라', Alice: '앨리스', Alisha: '알리샤', Allison: '앨리슨',
  Amelia: '아멜리아', Amrut: '암루트', Ana: '아나', Anas: '아나스',
  Andi: '안디', Andrea: '안드레아', Andrew: '앤드류', Andy: '앤디',
  Anet: '아넷', Angie: '앤지', Anika: '아니카', Anjali: '안잘리',
  Anna: '안나', Anton: '안톤', Antonia: '안토니아', Antonio: '안토니오',
  Arabella: '아라벨라', Archer: '아처', Artem: '아르템', Ashraf: '아슈라프',
  Athira: '아티라', Attila: '아틸라', Audrey: '오드리', Aurora: '오로라',
  Ava: '에이바',
  // ── B ──
  Balázs: '볼라주', Bart: '바트', Bella: '벨라', Belma: '벨마', Ben: '벤',
  Bengt: '벵트', Benjamin: '벤자민', Bill: '빌', Bogdan: '보그단',
  Borges: '보르지스', Bradford: '브래드포드', Bram: '브람', Brian: '브라이언',
  Brittney: '브리트니', Bruno: '브루노',
  // ── C ──
  Cahaya: '차하야', Callum: '캘럼', Camilla: '카밀라', Carmelo: '카르멜로',
  Carola: '카롤라', Carolina: '카롤리나', Chaouki: '차우키', Charlie: '찰리',
  Chris: '크리스', Christian: '크리스티안', Christoffer: '크리스토퍼',
  Christopher: '크리스토퍼', Christos: '크리스토스', Cicek: '치첵',
  Claire: '클레어', Clara: '클라라', Clyde: '클라이드', Constantin: '콘스탄틴',
  Corina: '코리나', Cristi: '크리스티', Cristina: '크리스티나',
  // ── D ──
  Dakocan: '다코잔', Dakota: '다코타', Dallin: '달린', Dan: '댄',
  Daniel: '다니엘', David: '데이비드', Declan: '데클란', Denis: '데니스',
  Dennis: '데니스', Dhyogo: '디오구', Diego: '디에고', Dmitry: '드미트리',
  Doga: '도아', Dávid: '다비드',
  // ── E ──
  Eda: '에다', Edward: '에드워드', Elena: '엘레나', Eleni: '엘레니',
  Elin: '엘린', Emma: '엠마', Enrique: '엔리케', Eric: '에릭',
  Eugene: '유진', Evan: '에반', Evgeniy: '예프게니',
  // ── F ──
  Fabi: '파비', Faizal: '파이잘', Father: '파더', Fatih: '파티흐',
  Fatsis: '팟시스', Fernando: '페르난도', Francis: '프란시스', Freddy: '프레디',
  Frederick: '프레더릭',
  // ── G ──
  Gabriel: '가브리엘', Gabriela: '가브리엘라', Gale: '게일', Gábor: '가보르',
  George: '조지', Georgi: '게오르기', Georgios: '게오르기오스',
  Ghizlane: '기즐란', Giovanni: '조반니',
  // ── H ──
  Hamid: '하미드', Hamida: '하미다', Hanka: '한카', Hans: '한스',
  Harry: '해리', Hasnan: '하스난', Haytham: '하이탐', Heather: '헤더',
  Helge: '헬게', Henry: '헨리', Hélène: '엘렌', Hope: '호프',
  // ── I ──
  Ian: '이안', Ido: '이도', Ivanna: '이바나',
  // ── J ──
  Jaakko: '야코', James: '제임스', Jan: '얀', Jane: '제인', Jason: '제이슨',
  Jawid: '자위드', Jeanne: '잔느', Jennie: '제니', Jessa: '제사',
  Jessica: '제시카', Jhenny: '제니', Johannes: '요하네스', Jon: '존',
  Jonas: '요나스', Jora: '요라', Julia: '줄리아', June: '준', Jussi: '유시',
  // ── K ──
  Kanika: '카니카', Karo: '카로', Ken: '켄', Keren: '케렌', Kevin: '케빈',
  Kim: '킴', Knox: '녹스', Kozy: '코지', Krys: '크리스', Kuki: '쿠키',
  Kyle: '카일', Kyriakos: '키리아코스',
  // ── L ──
  Laura: '로라', Lax: '랙스', Lea: '레아', Leonid: '레오니드', Liam: '리암',
  Lily: '릴리', Linda: '린다', Lucan: '루칸', Lumi: '루미',
  // ── M ──
  Mads: '마스', Maevys: '마에비스', Magdalena: '막달레나',
  Mahaputra: '마하푸트라', Mai: '마이', Maja: '마야', Marco: '마르코',
  MarcoTrox: '마르코트록스', Mariia: '마리아', Marina: '마리나',
  Mariya: '마리야', Mark: '마크', Martin: '마틴', Masry: '마스리',
  Matheus: '마테우스', Mathias: '마티아스', Matilda: '마틸다', Maya: '마야',
  Mazen: '마젠', Melanie: '멜라니', Mia: '미아', Michael: '마이클',
  Miika: '미카', Mike: '마이크', Milena: '밀레나', Milo: '밀로', Mo: '모',
  Monika: '모니카', Moonglow: '문글로우',
  // ── N ──
  Niander: '니안더', Nichalia: '니칼리아', Nicolas: '니콜라', Niki: '니키',
  Nikita: '니키타', Nikolay: '니콜라이', Niraj: '니라즈', Noam: '노암',
  Nolen: '놀렌', Norah: '노라',
  // ── O ──
  Ola: '올라', Olaf: '올라프', Oleksii: '올렉시', Oliver: '올리버',
  Otto: '오토', Oxley: '옥슬리',
  // ── P ──
  Pawel: '파벨', Peter: '피터', Petra: '페트라', Piotr: '피오트르',
  Pratama: '프라타마', Prince: '프린스', Putra: '푸트라', Putri: '푸트리',
  // ── R ──
  Raju: '라주', River: '리버', Rizq: '리즈크', Robert: '로버트', Roger: '로저',
  Romaco: '로마코', Ruhaan: '루한', Russell: '러셀', Ruth: '루스',
  // ── S ──
  Saavi: '사비', Samanta: '사만타', Samara: '사마라', Sami: '사미',
  Sana: '사나', Sanna: '산나', Sarah: '사라', Sebastian: '세바스찬',
  Serban: '세르반', Serge: '세르주', Shazrina: '샤즈리나', Sia: '시아',
  Silvi: '실비', Soili: '소일리', Sophia: '소피아', Spuds: '스퍼즈',
  Søren: '쇠렌', Stacy: '스테이시', Stefanos: '스테파노스', Steven: '스티븐',
  Sully: '설리', Sultan: '술탄', Sunny: '써니', Susi: '수지',
  // ── T ──
  Tatiana: '타티아나', Teddy: '테디', Theo: '테오', Theos: '테오스',
  Thomas: '토마스', Tijs: '테이스', Tomasz: '토마시', Tommy: '토미',
  Tri: '트리', Tristan: '트리스탄',
  // ── V ──
  Valeria: '발레리아', Vera: '베라', Victoria: '빅토리아', Ville: '빌레',
  Vincent: '빈센트', Violetta: '비올레타', Vira: '비라', Viraj: '비라즈',
  // ── W ──
  Wesley: '웨슬리', Will: '윌', Wojciech: '보이치에흐',
  // ── Y ──
  Yaroslava: '야로슬라바', Young: '영',
  // ── Z ──
  Zain: '자인', Zara: '자라', Zazy: '재지', Zdeněk: '즈데녜크',
};

/** ElevenLabs 음성 이름을 "한글 (English)" 형태로 변환 */
export const elNameKo = (name: string): string => {
  const base = name.split(/\s[–-]\s/)[0].trim();
  const first = base.split(' ')[0];
  const ko = EL_NAME_KO[base] || EL_NAME_KO[first];
  return ko ? `${ko} (${base})` : base;
};
