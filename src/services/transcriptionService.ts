/**
 * transcriptionService.ts
 * Kie AI (ElevenLabs Scribe v1) 기반 음성 전사 서비스
 * 사용자 업로드 오디오 → 텍스트 + 단어별 타임스탬프 추출
 */

import { monitoredFetch, getKieKey } from './apiService';
import { uploadMediaToHosting } from './uploadService';
import { logger } from './LoggerService';
import type { WhisperTranscriptResult, WhisperSegment, ScriptLine } from '../types';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

/**
 * 오디오 파일을 전사하여 텍스트 + 타임스탬프 추출
 * 1. Cloudinary에 업로드 (Kie API는 URL만 지원)
 * 2. Kie createTask (elevenlabs/speech-to-text)
 * 3. 폴링하여 결과 반환
 */
export async function transcribeAudio(
  audioFile: File | Blob,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
  }
): Promise<WhisperTranscriptResult> {
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');

  const { signal, onProgress } = options || {};

  // 1. Cloudinary에 업로드
  onProgress?.('오디오 업로드 중...');
  logger.info('[STT] Cloudinary 업로드 시작', { size: audioFile.size });

  const file = audioFile instanceof File
    ? audioFile
    : new File([audioFile], 'audio.wav', { type: audioFile.type || 'audio/wav' });
  const audioUrl = await uploadMediaToHosting(file);
  logger.success('[STT] Cloudinary 업로드 완료', { url: audioUrl });

  if (signal?.aborted) throw new Error('전사가 취소되었습니다.');

  // 2. Kie createTask
  onProgress?.('전사 태스크 생성 중...');
  logger.info('[STT] Kie 전사 태스크 생성', { audioUrl });

  const createResponse = await monitoredFetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'elevenlabs/speech-to-text',
      input: {
        audio_url: audioUrl,
        diarize: false,
        timestamps_granularity: 'word',
      },
    }),
    signal,
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    if (createResponse.status === 402) throw new Error('Kie 잔액 부족: 크레딧을 충전해주세요.');
    if (createResponse.status === 429) throw new Error('Kie 요청 제한 초과: 잠시 후 다시 시도해주세요.');
    throw new Error(`전사 태스크 생성 실패 (${createResponse.status}): ${errorText}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.data?.taskId;
  if (!taskId) throw new Error('전사 태스크 ID를 받지 못했습니다.');

  // 3. 폴링
  onProgress?.('전사 중...');
  const result = await pollKieTranscriptionTask(taskId, apiKey, { signal, onProgress });

  logger.success('[STT] 전사 완료', {
    language: result.language,
    segments: result.segments.length,
    duration: result.duration,
  });

  return result;
}

/**
 * Kie 전사 태스크 폴링 — ttsService.ts의 pollKieTtsTask와 동일 패턴
 */
async function pollKieTranscriptionTask(
  taskId: string,
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
    maxAttempts?: number;
  }
): Promise<WhisperTranscriptResult> {
  const { signal, onProgress, maxAttempts = 120 } = options || {};
  const opId = `pollKieTranscriptionTask-${taskId}`;
  logger.startAsyncOp(opId, 'pollKieTranscriptionTask', taskId);

  logger.info('[STT] 폴링 시작', { taskId });

  try {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('전사가 취소되었습니다.');

    const delay = attempt < 5 ? 2000 : 3000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (signal?.aborted) throw new Error('전사가 취소되었습니다.');

    const response = await monitoredFetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal,
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        logger.trackRetry('전사 폴링 (429)', attempt + 1, maxAttempts, 'Rate limited');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw new Error(`전사 폴링 오류 (${response.status})`);
    }

    const data = await response.json();
    const state = data.data?.state;

    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      let parsed: Record<string, unknown>;
      if (typeof resultJson === 'string') {
        try {
          parsed = JSON.parse(resultJson);
        } catch (e) {
          const preview = resultJson.slice(0, 200);
          throw new Error(`전사 결과 JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)} — 응답 미리보기: ${preview}`);
        }
      } else {
        parsed = resultJson;
      }
      const result = parseTranscriptionResult(parsed);
      logger.endAsyncOp(opId, 'completed', `segments=${result.segments.length}, lang=${result.language}`);
      return result;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || '알 수 없는 오류';
      throw new Error(`전사 실패: ${failMsg}`);
    }

    // 진행 상태 업데이트
    onProgress?.(`전사 중... (${attempt + 1}/${maxAttempts})`);
  }

  logger.endAsyncOp(opId, 'failed', `전사 시간 초과 (${maxAttempts}회 폴링 실패)`);
  throw new Error(`전사 시간 초과 (${maxAttempts}회 폴링 실패)`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.includes('시간 초과')) logger.endAsyncOp(opId, 'failed', errMsg);
    throw err;
  }
}

/**
 * Kie/ElevenLabs Scribe 응답을 WhisperTranscriptResult로 변환
 */
function parseTranscriptionResult(raw: Record<string, unknown>): WhisperTranscriptResult {
  // ElevenLabs Scribe v1 응답 형식:
  // { text: string, language_code: string, words: [{ text, start, end, type, speaker_id }] }
  // Kie는 resultObject로 래핑하여 반환: { resultObject: { text, language_code, words, ... } }
  const data = (raw.resultObject as Record<string, unknown>) || raw;

  const fullText = (data.text as string) || '';
  const languageCode = (data.language_code as string) || 'unknown';
  const rawWords = (data.words as Array<Record<string, unknown>>) || [];

  // 단어 → 문장 세그먼트로 그룹핑 (문장 종결 부호 기준)
  const segments: WhisperSegment[] = [];
  let currentWords: { word: string; startTime: number; endTime: number; confidence: number }[] = [];
  let sentenceText = '';

  for (let idx = 0; idx < rawWords.length; idx++) {
    const w = rawWords[idx];
    const wordText = (w.text as string) || (w.word as string) || '';
    const startTime = (w.start as number) ?? (w.start_time as number) ?? 0;
    const endTime = (w.end as number) ?? (w.end_time as number) ?? 0;
    const confidence = (w.confidence as number) ?? 1;

    // 공백 토큰은 sentenceText에만 반영하고 words 배열에서 제외
    // (ElevenLabs Scribe는 " "를 별도 토큰으로 반환 → findWordBoundaryTime 오차 원인)
    sentenceText += wordText;
    const trimmed = wordText.trim();
    if (trimmed) {
      currentWords.push({ word: trimmed, startTime, endTime, confidence });
    }

    // 문장 종결 부호로 세그먼트 분리
    if (/[.!?。！？]$/.test(trimmed) || idx === rawWords.length - 1) {
      if (currentWords.length > 0 && sentenceText.trim()) {
        segments.push({
          text: sentenceText.trim(),
          startTime: currentWords[0].startTime,
          endTime: currentWords[currentWords.length - 1].endTime,
          words: [...currentWords],
        });
      }
      currentWords = [];
      sentenceText = '';
    }
  }

  // 단어 정보가 없는 경우: 전체 텍스트를 하나의 세그먼트로
  if (segments.length === 0 && fullText.trim()) {
    const duration = (data.duration as number) || 0;
    segments.push({
      text: fullText.trim(),
      startTime: 0,
      endTime: duration,
    });
  }

  const duration = segments.length > 0
    ? segments[segments.length - 1].endTime
    : (data.duration as number) || 0;

  return {
    text: fullText,
    language: languageCode,
    segments,
    duration,
  };
}

/**
 * WhisperSegment[] → ScriptLine[] 변환
 * 각 세그먼트를 하나의 ScriptLine으로 매핑하고 타임스탬프를 설정
 */
export function segmentsToScriptLines(
  segments: WhisperSegment[],
  uploadedAudioId: string,
  speakerId: string = '',
): ScriptLine[] {
  return segments.map((seg, i) => ({
    id: `line-uploaded-${Date.now()}-${i}`,
    speakerId,
    text: seg.text,
    index: i,
    startTime: seg.startTime,
    endTime: seg.endTime,
    duration: seg.endTime - seg.startTime,
    audioSource: 'uploaded' as const,
    uploadedAudioId,
  }));
}
