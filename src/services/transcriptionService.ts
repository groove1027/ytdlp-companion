/**
 * transcriptionService.ts
 * Kie AI (ElevenLabs Scribe v1) 기반 음성 전사 서비스
 * 사용자 업로드 오디오 → 텍스트 + 단어별 타임스탬프 추출
 * [v4.6] diarize 옵션: 화자 분리 지원
 */

import { monitoredFetch, getKieKey } from './apiService';
import { uploadMediaToHosting } from './uploadService';
import { logger } from './LoggerService';
import type { WhisperTranscriptResult, WhisperSegment, WhisperWord, DiarizedUtterance, ScriptLine } from '../types';

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
    diarize?: boolean;  // [v4.6] 화자 분리 활성화
  }
): Promise<WhisperTranscriptResult> {
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');

  const { signal, onProgress, diarize = false } = options || {};

  // 1. Cloudinary에 업로드
  onProgress?.('오디오 업로드 중...');
  logger.info('[STT] Cloudinary 업로드 시작', { size: audioFile.size, diarize });

  const file = audioFile instanceof File
    ? audioFile
    : new File([audioFile], 'audio.wav', { type: audioFile.type || 'audio/wav' });
  const audioUrl = await uploadMediaToHosting(file, undefined, signal);
  logger.success('[STT] Cloudinary 업로드 완료', { url: audioUrl });

  if (signal?.aborted) throw new Error('전사가 취소되었습니다.');

  // 2. Kie createTask
  onProgress?.('전사 태스크 생성 중...');
  logger.info('[STT] Kie 전사 태스크 생성', { audioUrl, diarize });

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
        diarize,
        tag_audio_events: false,
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
  onProgress?.(diarize ? '화자 분리 전사 중...' : '전사 중...');
  const result = await pollKieTranscriptionTask(taskId, apiKey, { signal, onProgress, diarize });

  logger.success('[STT] 전사 완료', {
    language: result.language,
    segments: result.segments.length,
    duration: result.duration,
    speakerCount: result.speakerCount,
    utterances: result.utterances?.length,
  });

  return result;
}

/**
 * [v4.6] 영상/오디오에서 화자 분리 전사 수행 (diarize=true 고정)
 * 영상 분석 시 Gemini에 전달할 화자별 대사 데이터 생성
 */
export async function transcribeWithDiarization(
  audioFile: File | Blob,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
  }
): Promise<WhisperTranscriptResult> {
  return transcribeAudio(audioFile, { ...options, diarize: true });
}

/**
 * [v4.6] 화자 분리 결과를 Gemini 프롬프트에 삽입할 텍스트로 포맷팅
 * 형식: [화자A 0:05~0:12] 대사 텍스트
 */
export function formatDiarizedTranscript(result: WhisperTranscriptResult): string {
  if (!result.utterances || result.utterances.length === 0) {
    return '';
  }

  const lines = result.utterances.map(u => {
    const start = formatTimestamp(u.startTime);
    const end = formatTimestamp(u.endTime);
    return `[${u.speakerId} ${start}~${end}] ${u.text}`;
  });

  return `## 화자 분리 전사 결과 (ElevenLabs Scribe — ${result.speakerCount ?? '?'}명 감지)\n` +
    `언어: ${result.language} / 총 길이: ${formatTimestamp(result.duration)}\n\n` +
    lines.join('\n');
}

/** 초 → "M:SS" 포맷 */
function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
    diarize?: boolean;
  }
): Promise<WhisperTranscriptResult> {
  const { signal, onProgress, maxAttempts = 120, diarize = false } = options || {};
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
        // [FIX #245] Retry-After 헤더 우선, 없으면 지수 백오프
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 5000, 60000) : Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
        logger.trackRetry('전사 폴링 (429)', attempt + 1, maxAttempts, `Rate limited, ${Math.round(waitMs)}ms 대기`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
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
      const result = parseTranscriptionResult(parsed, diarize);
      logger.endAsyncOp(opId, 'completed', `segments=${result.segments.length}, lang=${result.language}, speakers=${result.speakerCount ?? 0}`);
      return result;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || '알 수 없는 오류';
      throw new Error(`전사 실패: ${failMsg}`);
    }

    // 진행 상태 업데이트
    onProgress?.(diarize ? `화자 분리 전사 중... (${attempt + 1}/${maxAttempts})` : `전사 중... (${attempt + 1}/${maxAttempts})`);
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
 * [v4.6] diarize=true 시 speaker_id 파싱 + DiarizedUtterance 생성
 */
function parseTranscriptionResult(raw: Record<string, unknown>, diarize = false): WhisperTranscriptResult {
  // ElevenLabs Scribe v1 응답 형식:
  // { text: string, language_code: string, words: [{ text, start, end, type, speaker_id }] }
  // Kie는 resultObject로 래핑하여 반환: { resultObject: { text, language_code, words, ... } }
  const data = (raw.resultObject as Record<string, unknown>) || raw;

  const fullText = (data.text as string) || '';
  const languageCode = (data.language_code as string) || 'unknown';
  const rawWords = (data.words as Array<Record<string, unknown>>) || [];

  // 단어 → 문장 세그먼트로 그룹핑 (문장 종결 부호 기준)
  const segments: WhisperSegment[] = [];
  let currentWords: WhisperWord[] = [];
  let sentenceText = '';

  for (let idx = 0; idx < rawWords.length; idx++) {
    const w = rawWords[idx];
    const wordText = (w.text as string) || (w.word as string) || '';
    const startTime = (w.start as number) ?? (w.start_time as number) ?? 0;
    const endTime = (w.end as number) ?? (w.end_time as number) ?? 0;
    const confidence = (w.confidence as number) ?? 1;
    const speakerId = diarize ? ((w.speaker_id as string) || undefined) : undefined;

    // 공백 토큰은 sentenceText에만 반영하고 words 배열에서 제외
    // (ElevenLabs Scribe는 " "를 별도 토큰으로 반환 → findWordBoundaryTime 오차 원인)
    sentenceText += wordText;
    const trimmed = wordText.trim();
    if (trimmed) {
      currentWords.push({ word: trimmed, startTime, endTime, confidence, speakerId });
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

  // [v4.6] diarize=true: 단어를 화자별 발화 단위(utterance)로 그룹핑
  let utterances: DiarizedUtterance[] | undefined;
  let speakerCount: number | undefined;

  if (diarize) {
    utterances = groupWordsBySpeaker(rawWords);
    const speakerIds = new Set(utterances.map(u => u.speakerId));
    speakerCount = speakerIds.size;
  }

  return {
    text: fullText,
    language: languageCode,
    segments,
    duration,
    utterances,
    speakerCount,
  };
}

/**
 * [v4.6] 연속된 같은 화자의 단어를 발화 단위(utterance)로 그룹핑
 * speaker_id가 변경되면 새 utterance 시작
 */
function groupWordsBySpeaker(rawWords: Array<Record<string, unknown>>): DiarizedUtterance[] {
  const utterances: DiarizedUtterance[] = [];
  let currentSpeaker = '';
  let currentWords: WhisperWord[] = [];
  let currentText = '';

  for (const w of rawWords) {
    const wordText = (w.text as string) || (w.word as string) || '';
    const startTime = (w.start as number) ?? (w.start_time as number) ?? 0;
    const endTime = (w.end as number) ?? (w.end_time as number) ?? 0;
    const confidence = (w.confidence as number) ?? 1;
    const speakerId = (w.speaker_id as string) || 'speaker_unknown';
    const trimmed = wordText.trim();

    // 화자가 바뀌면 현재 utterance를 저장하고 새로 시작
    if (speakerId !== currentSpeaker && currentWords.length > 0) {
      utterances.push({
        speakerId: currentSpeaker,
        text: currentText.trim(),
        startTime: currentWords[0].startTime,
        endTime: currentWords[currentWords.length - 1].endTime,
        words: [...currentWords],
      });
      currentWords = [];
      currentText = '';
    }

    currentSpeaker = speakerId;
    currentText += wordText;
    if (trimmed) {
      currentWords.push({ word: trimmed, startTime, endTime, confidence, speakerId });
    }
  }

  // 마지막 utterance 저장
  if (currentWords.length > 0 && currentText.trim()) {
    utterances.push({
      speakerId: currentSpeaker,
      text: currentText.trim(),
      startTime: currentWords[0].startTime,
      endTime: currentWords[currentWords.length - 1].endTime,
      words: [...currentWords],
    });
  }

  return utterances;
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
