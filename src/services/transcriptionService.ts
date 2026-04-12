/**
 * transcriptionService.ts
 * Kie AI (ElevenLabs Scribe v1) 기반 음성 전사 서비스
 * 사용자 업로드 오디오 → 텍스트 + 단어별 타임스탬프 추출
 * [v4.6] diarize 옵션: 화자 분리 지원
 * [v4.7] 컴패니언 whisper.cpp 우선 → Kie 폴백
 */

import { monitoredFetch, getKieKey } from './apiService';
import { uploadMediaToHosting } from './uploadService';
import { logger } from './LoggerService';
import { isCompanionDetected } from './ytdlpApiService';
import type { WhisperTranscriptResult, WhisperSegment, WhisperWord, DiarizedUtterance, ScriptLine } from '../types';

const COMPANION_URL = 'http://127.0.0.1:9876';

/** 컴패니언 whisper.cpp로 로컬 전사 시도 */
async function tryCompanionTranscribe(
  audioFile: File | Blob,
  options?: { signal?: AbortSignal; onProgress?: (msg: string) => void; diarize?: boolean },
): Promise<WhisperTranscriptResult | null> {
  // [FIX #914] base64 인코딩이 무거우므로 isCompanionDetected()를 최적화 게이트로 유지
  // health handler 캐싱 수정으로 이 값이 정확해짐
  if (!isCompanionDetected()) return null;
  // diarize는 whisper.cpp가 미지원 → Kie로 폴백
  if (options?.diarize) return null;

  try {
    options?.onProgress?.('로컬 whisper.cpp 전사 중...');
    logger.info('[STT] 컴패니언 whisper.cpp 로컬 전사 시도');

    // File → base64
    const buffer = await audioFile.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // 64KB 청크 단위로 base64 변환 (대용량 OOM 방지)
    const chunkSize = 65536;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    const b64 = btoa(binary);

    const res = await fetch(`${COMPANION_URL}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64, language: null }),
      signal: options?.signal
        ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([options.signal, AbortSignal.timeout(300_000)]) || AbortSignal.timeout(300_000)
        : AbortSignal.timeout(300_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.text) return null;

    // 컴패니언 응답 → WhisperTranscriptResult 변환
    const segments: WhisperSegment[] = (data.segments || []).map((s: { start: number; end: number; text: string }) => ({
      text: s.text.trim(),
      startTime: s.start,
      endTime: s.end,
      words: undefined, // whisper.cpp basic은 word-level 미지원
    }));

    // 전체 duration 계산
    const duration = segments.length > 0
      ? segments[segments.length - 1].endTime
      : 0;

    const result: WhisperTranscriptResult = {
      text: data.text,
      language: data.language || 'unknown',
      segments,
      duration,
    };

    logger.success('[STT] 컴패니언 whisper.cpp 전사 성공', {
      language: result.language,
      segments: segments.length,
      duration: result.duration,
    });

    return result;
  } catch (e) {
    if (options?.signal?.aborted) throw e;
    logger.warn('[STT] 컴패니언 whisper.cpp 실패 — Kie 폴백:', e instanceof Error ? e.message : '');
    return null;
  }
}

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const CREATE_TASK_MAX_ATTEMPTS = 2;
const CHUNK_FALLBACK_WINDOW_SECONDS = 75;
const CHUNK_FALLBACK_OVERLAP_SECONDS = 2;
const CHUNK_FALLBACK_MIN_DURATION_SECONDS = 90;
const AUDIO_CHUNK_DECODE_TIMEOUT_MS = 25_000;

function buildTranscriptionRequestFile(audioFile: File | Blob): File {
  if (audioFile instanceof File) return audioFile;
  return new File([audioFile], 'audio.wav', { type: audioFile.type || 'audio/wav' });
}

async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('전사가 취소되었습니다.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function uploadAudioForTranscription(
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
    diarize?: boolean;
  },
): Promise<string> {
  const { signal, onProgress, diarize = false } = options || {};
  onProgress?.('오디오 업로드 중...');
  logger.info('[STT] Cloudinary 업로드 시작', { size: file.size, diarize });
  const audioUrl = await uploadMediaToHosting(file, undefined, signal);
  logger.success('[STT] Cloudinary 업로드 완료', { url: audioUrl });
  if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');
  return audioUrl;
}

async function createKieTranscriptionTask(
  audioUrl: string,
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    diarize?: boolean;
    maxAttempts?: number;
  },
): Promise<string> {
  const { signal, diarize = false, maxAttempts = CREATE_TASK_MAX_ATTEMPTS } = options || {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');

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

    if (createResponse.ok) {
      // [FIX #674] guarded JSON 파싱 (VideoGenService.parseKieCreateTaskResponse 패턴)
      let createData: {
        code?: number;
        msg?: string;
        message?: string;
        data?: { taskId?: string; [key: string]: unknown };
      } = {};
      try {
        const rawText = await createResponse.text();
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === 'object') createData = parsed;
        }
      } catch {
        throw new Error('전사 서비스 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }

      // [FIX #674] KIE API는 HTTP 200이면서 body에 에러 코드를 포함할 수 있음
      // (sfxService, elevenlabsService, VideoGenService는 이미 처리 — transcriptionService만 누락)
      if (createData.code === 402) {
        throw new Error('음성 전사 크레딧이 부족합니다. API 키 설정에서 잔액을 확인해주세요.');
      }
      // [FIX #674] 501/505: 터미널 에러 — 재시도 불필요, 즉시 실패
      if (createData.code === 501) {
        logger.error('[STT] 전사 태스크 생성 터미널 에러', { code: 501, msg: createData.msg });
        throw new Error('전사에 실패했습니다. 다른 오디오 파일로 다시 시도해주세요.');
      }
      if (createData.code === 505) {
        logger.error('[STT] 전사 태스크 생성 터미널 에러', { code: 505, msg: createData.msg });
        throw new Error('전사 서비스가 현재 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }

      const bodyRetryable = createData.code === 429 || (createData.code !== undefined && createData.code >= 500);
      if (bodyRetryable) {
        const isLastAttempt = attempt === maxAttempts - 1;
        if (!isLastAttempt) {
          const waitMs = createData.code === 429
            ? Math.min(4000 * (attempt + 1), 12000)
            : Math.min(1500 * (attempt + 1), 6000);
          logger.trackRetry('전사 태스크 생성', attempt + 1, maxAttempts, `body code ${createData.code}, ${waitMs}ms 대기`);
          await waitForRetry(waitMs, signal);
          continue;
        }
        if (createData.code === 429) {
          throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        }
      }

      if (createData.code !== undefined && createData.code !== 200) {
        const detail = createData.msg || createData.message || '';
        logger.error('[STT] 전사 태스크 생성 실패', { code: createData.code, msg: detail });
        throw new Error(`전사 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.`);
      }

      const taskId = createData.data?.taskId;
      if (taskId) return taskId;

      // taskId가 없을 때: 응답 구조 로깅 (디버깅용)
      logger.error('[STT] 전사 태스크 ID 누락 — 응답 구조 확인 필요', {
        responseKeys: Object.keys(createData),
        dataKeys: createData.data ? Object.keys(createData.data) : null,
        code: createData.code,
        msg: createData.msg,
      });
      throw new Error('전사 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }

    const errorText = await createResponse.text().catch(() => '');
    logger.error('[STT] 전사 태스크 생성 HTTP 에러', { status: createResponse.status, body: errorText.substring(0, 300) });
    if (createResponse.status === 402) throw new Error('음성 전사 크레딧이 부족합니다. API 키 설정에서 잔액을 확인해주세요.');
    if (createResponse.status === 501) throw new Error('전사에 실패했습니다. 다른 오디오 파일로 다시 시도해주세요.');
    if (createResponse.status === 505) throw new Error('전사 서비스가 현재 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');

    const retryable = createResponse.status === 429 || createResponse.status >= 500;
    const isLastAttempt = attempt === maxAttempts - 1;
    if (!retryable || isLastAttempt) {
      if (createResponse.status === 429) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      throw new Error('전사 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }

    const waitMs = createResponse.status === 429
      ? Math.min(4000 * (attempt + 1), 12000)
      : Math.min(1500 * (attempt + 1), 6000);
    logger.trackRetry('전사 태스크 생성', attempt + 1, maxAttempts, `${createResponse.status} 응답, ${waitMs}ms 대기`);
    await waitForRetry(waitMs, signal);
  }

  throw new Error('전사 태스크를 생성하지 못했습니다.');
}

function buildUtterancesFromSegments(
  segments: WhisperSegment[],
  speakerId: string = 'speaker_0',
): DiarizedUtterance[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => ({
      speakerId,
      text: segment.text.trim(),
      startTime: segment.startTime,
      endTime: segment.endTime,
      words: (segment.words || []).map((word) => ({
        ...word,
        speakerId,
      })),
    }));
}

function shouldBackfillUtterances(
  utterances: DiarizedUtterance[] | undefined,
  segments: WhisperSegment[],
): boolean {
  if (segments.length === 0) return false;
  if (!utterances || utterances.length === 0) return true;
  return utterances.every((utterance) => !utterance.speakerId || utterance.speakerId === 'speaker_unknown');
}

function normalizeTranscriptResult(
  result: WhisperTranscriptResult,
  ensureUtterances = false,
): WhisperTranscriptResult {
  const segments = result.segments.filter((segment) => segment.text.trim().length > 0);
  const text = result.text.trim() || segments.map((segment) => segment.text.trim()).join(' ').trim();
  const duration = result.duration || segments[segments.length - 1]?.endTime || 0;

  if (!ensureUtterances || !shouldBackfillUtterances(result.utterances, segments)) {
    return { ...result, text, segments, duration };
  }

  return {
    ...result,
    text,
    segments,
    duration,
    utterances: buildUtterancesFromSegments(segments),
    speakerCount: segments.length > 0 ? 1 : 0,
  };
}

function hasTranscriptContent(result: WhisperTranscriptResult): boolean {
  if (result.text.trim().length > 0) return true;
  return result.segments.some((segment) => segment.text.trim().length > 0);
}

async function requestKieTranscription(
  audioUrl: string,
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
    diarize?: boolean;
    ensureUtterances?: boolean;
    maxCreateAttempts?: number;
  },
): Promise<WhisperTranscriptResult> {
  const { signal, onProgress, diarize = false, ensureUtterances = false, maxCreateAttempts } = options || {};
  onProgress?.('전사 태스크 생성 중...');
  logger.info('[STT] Kie 전사 태스크 생성', { audioUrl, diarize });

  const taskId = await createKieTranscriptionTask(audioUrl, apiKey, {
    signal,
    diarize,
    maxAttempts: maxCreateAttempts,
  });

  onProgress?.(diarize ? '화자 분리 전사 중...' : '전사 중...');
  const result = normalizeTranscriptResult(
    await pollKieTranscriptionTask(taskId, apiKey, { signal, onProgress, diarize }),
    ensureUtterances,
  );

  if (!hasTranscriptContent(result)) {
    throw new Error(diarize ? '화자 분리 전사 결과가 비어 있습니다.' : '전사 결과가 비어 있습니다.');
  }

  return result;
}

interface ChunkWindow {
  uniqueStart: number;
  uniqueEnd: number;
  sourceStart: number;
  sourceEnd: number;
}

function buildChunkWindows(duration: number): ChunkWindow[] {
  const windows: ChunkWindow[] = [];

  for (let uniqueStart = 0; uniqueStart < duration; uniqueStart += CHUNK_FALLBACK_WINDOW_SECONDS) {
    const uniqueEnd = Math.min(duration, uniqueStart + CHUNK_FALLBACK_WINDOW_SECONDS);
    windows.push({
      uniqueStart,
      uniqueEnd,
      sourceStart: Math.max(0, uniqueStart - CHUNK_FALLBACK_OVERLAP_SECONDS),
      sourceEnd: Math.min(duration, uniqueEnd + CHUNK_FALLBACK_OVERLAP_SECONDS),
    });
  }

  return windows;
}

async function decodeAudioBufferForChunking(
  audioFile: File,
  signal?: AbortSignal,
): Promise<{ audioContext: AudioContext; audioBuffer: AudioBuffer }> {
  if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');
  const arrayBuffer = await audioFile.arrayBuffer();
  if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioCtx();

  try {
    const audioBuffer = await Promise.race([
      audioContext.decodeAudioData(arrayBuffer),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('decodeAudioData timeout')), AUDIO_CHUNK_DECODE_TIMEOUT_MS)),
    ]);
    return { audioContext, audioBuffer };
  } catch (error) {
    await audioContext.close();
    throw error;
  }
}

function sliceAudioBufferToWav(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const startSample = Math.floor(startSec * buffer.sampleRate);
  const endSample = Math.max(startSample + 1, Math.floor(endSec * buffer.sampleRate));
  const sampleCount = endSample - startSample;
  const mono = new Float32Array(sampleCount);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < sampleCount; i++) {
      mono[i] += source[startSample + i] / buffer.numberOfChannels;
    }
  }

  const wavBuffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(wavBuffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function isSegmentInUniqueWindow(segment: WhisperSegment, uniqueStart: number, uniqueEnd: number): boolean {
  const midpoint = (segment.startTime + segment.endTime) / 2;
  return midpoint >= uniqueStart && midpoint < uniqueEnd + 0.001;
}

function shiftSegmentsIntoWindow(
  segments: WhisperSegment[],
  offsetSeconds: number,
  uniqueStart: number,
  uniqueEnd: number,
): WhisperSegment[] {
  return segments
    .map((segment) => ({
      ...segment,
      startTime: segment.startTime + offsetSeconds,
      endTime: segment.endTime + offsetSeconds,
      words: segment.words?.map((word) => ({
        ...word,
        startTime: word.startTime + offsetSeconds,
        endTime: word.endTime + offsetSeconds,
      })),
    }))
    .filter((segment) => isSegmentInUniqueWindow(segment, uniqueStart, uniqueEnd));
}

async function transcribeChunkWithRetry(
  chunkFile: File,
  options?: {
    signal?: AbortSignal;
    attempts?: number;
  },
): Promise<WhisperTranscriptResult> {
  const { signal, attempts = 2 } = options || {};

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await transcribeAudio(chunkFile, { signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt === attempts - 1) throw error;
      logger.trackRetry('전사 구간 복구', attempt + 1, attempts, '구간 전사 재시도');
      await waitForRetry(1200 * (attempt + 1), signal);
    }
  }

  throw new Error('구간 전사 재시도에 실패했습니다.');
}

async function transcribeAudioInChunks(
  audioFile: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (msg: string) => void;
  },
): Promise<WhisperTranscriptResult> {
  const { signal, onProgress } = options || {};
  const { audioContext, audioBuffer } = await decodeAudioBufferForChunking(audioFile, signal);

  try {
    if (audioBuffer.duration < CHUNK_FALLBACK_MIN_DURATION_SECONDS) {
      throw new Error('구간 전사를 적용하기에는 오디오가 너무 짧습니다.');
    }

    const windows = buildChunkWindows(audioBuffer.duration);
    if (windows.length < 2) throw new Error('구간 전사 윈도우를 생성하지 못했습니다.');

    const mergedSegments: WhisperSegment[] = [];
    let mergedLanguage = 'unknown';

    for (let index = 0; index < windows.length; index++) {
      if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');

      const window = windows[index];
      onProgress?.(`전사 자동 복구 중... (구간 전사 ${index + 1}/${windows.length})`);
      const chunkBlob = sliceAudioBufferToWav(audioBuffer, window.sourceStart, window.sourceEnd);
      const chunkFile = new File([chunkBlob], `audio-part-${index + 1}.wav`, { type: 'audio/wav' });
      const chunkResult = await transcribeChunkWithRetry(chunkFile, { signal });
      if (mergedLanguage === 'unknown' && chunkResult.language) mergedLanguage = chunkResult.language;
      mergedSegments.push(...shiftSegmentsIntoWindow(chunkResult.segments, window.sourceStart, window.uniqueStart, window.uniqueEnd));
    }

    const result = normalizeTranscriptResult({
      text: mergedSegments.map((segment) => segment.text.trim()).join(' ').trim(),
      language: mergedLanguage,
      segments: mergedSegments.sort((a, b) => a.startTime - b.startTime),
      duration: audioBuffer.duration,
    }, true);

    if (!hasTranscriptContent(result)) {
      throw new Error('구간 전사 결과가 비어 있습니다.');
    }

    return result;
  } finally {
    await audioContext.close();
  }
}

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
  const { signal, onProgress, diarize = false } = options || {};

  // [v4.7] 1순위: 컴패니언 whisper.cpp (로컬, 무료, 오프라인)
  // diarize 요청이면 whisper.cpp 미지원이므로 스킵
  const companionResult = await tryCompanionTranscribe(audioFile, options);
  if (companionResult) return companionResult;

  // 2순위: Kie API (클라우드)
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다. 헬퍼 앱을 설치하면 무료로 사용 가능합니다.');

  const file = buildTranscriptionRequestFile(audioFile);
  const audioUrl = await uploadAudioForTranscription(file, { signal, onProgress, diarize });
  const result = await requestKieTranscription(audioUrl, apiKey, { signal, onProgress, diarize });

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
  const apiKey = getKieKey();
  if (!apiKey) throw new Error('Kie API 키가 설정되지 않았습니다.');

  const { signal, onProgress } = options || {};
  const file = buildTranscriptionRequestFile(audioFile);
  const audioUrl = await uploadAudioForTranscription(file, { signal, onProgress, diarize: true });

  try {
    return await requestKieTranscription(audioUrl, apiKey, {
      signal,
      onProgress,
      diarize: true,
      ensureUtterances: true,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn('[STT] 화자 분리 1차 실패 — 자동 복구 재시도', { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    onProgress?.('전사 자동 복구 중... (화자 분리 재시도)');
    return await requestKieTranscription(audioUrl, apiKey, {
      signal,
      onProgress,
      diarize: true,
      ensureUtterances: true,
      maxCreateAttempts: 3,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn('[STT] 화자 분리 재시도 실패 — 전체 대사 전사로 복구', { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    onProgress?.('전사 자동 복구 중... (전체 대사 보존 전사)');
    return await requestKieTranscription(audioUrl, apiKey, {
      signal,
      onProgress,
      diarize: false,
      ensureUtterances: true,
      maxCreateAttempts: 3,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn('[STT] 전체 대사 전사 실패 — 구간 전사로 복구', { error: error instanceof Error ? error.message : String(error) });
  }

  onProgress?.('전사 자동 복구 중... (구간 전사)');
  return transcribeAudioInChunks(file, { signal, onProgress });
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

  const header = (result.speakerCount ?? 0) > 1
    ? `## 화자 분리 전사 결과 (ElevenLabs Scribe — ${result.speakerCount ?? '?'}명 감지)`
    : '## 음성 전사 결과 (ElevenLabs Scribe — 전체 대사 보존)';

  return `${header}\n` +
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
  let lastRetryReason = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException('전사가 취소되었습니다.', 'AbortError');

    const delay = attempt < 5 ? 2000 : 3000;
    await waitForRetry(delay, signal);

    const response = await monitoredFetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal,
      }
    );

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error('음성 전사 크레딧이 부족합니다. API 키 설정에서 잔액을 확인해주세요.');
      }
      if (response.status === 429) {
        lastRetryReason = 'rate-limit';
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000 || 5000, 60000) : Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
        logger.trackRetry('전사 폴링 (429)', attempt + 1, maxAttempts, `Rate limited, ${Math.round(waitMs)}ms 대기`);
        await waitForRetry(waitMs, signal);
        continue;
      }
      // [FIX #674] 422 "recordInfo is null": 태스크 아직 준비 안 됨 → 재시도
      if (response.status === 422) {
        lastRetryReason = 'not-ready';
        logger.trackRetry('전사 폴링 (422)', attempt + 1, maxAttempts, 'recordInfo not ready');
        continue;
      }
      if (response.status === 455) {
        throw new Error('전사 서비스가 점검 중입니다. 잠시 후 다시 시도해주세요.');
      }
      // [FIX #674] 501(Generation Failed): 복구 불가 → 즉시 실패
      if (response.status === 501) {
        logger.error('[STT] 폴링 터미널 에러', { status: response.status });
        throw new Error('전사에 실패했습니다. 다른 오디오 파일로 다시 시도해주세요.');
      }
      // [FIX #674] 505(Feature Disabled): 서비스 사용 불가 → 즉시 실패
      if (response.status === 505) {
        logger.error('[STT] 폴링 터미널 에러', { status: response.status });
        throw new Error('전사 서비스가 현재 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
      // [FIX #674] 일반 5xx는 일시적 서버 장애 → 재시도
      if (response.status >= 500) {
        lastRetryReason = 'server-error';
        const waitMs = Math.min(2000 * Math.pow(2, Math.min(attempt, 4)), 16000);
        logger.trackRetry('전사 폴링 (5xx)', attempt + 1, maxAttempts, `HTTP ${response.status}, ${Math.round(waitMs)}ms 대기`);
        await waitForRetry(waitMs, signal);
        continue;
      }
      throw new Error('전사 진행 상태 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }

    // [FIX #674] guarded JSON 파싱 + body-level 에러 코드 확인
    let data: Record<string, unknown> = {};
    try {
      const rawText = await response.text();
      if (rawText) {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object') data = parsed;
      }
    } catch {
      lastRetryReason = 'parse-error';
      logger.warn('[STT] 폴링 응답 JSON 파싱 실패 — 다음 폴링으로 진행');
      continue;
    }

    if (data.code === 402) throw new Error('음성 전사 크레딧이 부족합니다. API 키 설정에서 잔액을 확인해주세요.');
    if (data.code === 429) {
      lastRetryReason = 'rate-limit';
      const waitMs = Math.min(2000 * Math.pow(2, Math.min(attempt, 5)), 30000);
      logger.trackRetry('전사 폴링 (body 429)', attempt + 1, maxAttempts, `body code 429, ${Math.round(waitMs)}ms 대기`);
      await waitForRetry(waitMs, signal);
      continue;
    }
    // [FIX #674] body-level 501: Generation Failed → 즉시 실패
    if (data.code === 501) {
      logger.error('[STT] 폴링 body 터미널 에러', { code: data.code, msg: data.msg });
      throw new Error('전사에 실패했습니다. 다른 오디오 파일로 다시 시도해주세요.');
    }
    // [FIX #674] body-level 505: Feature Disabled → 즉시 실패
    if (data.code === 505) {
      logger.error('[STT] 폴링 body 터미널 에러', { code: data.code, msg: data.msg });
      throw new Error('전사 서비스가 현재 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    if (data.code !== undefined && data.code !== 200 && (data.code as number) >= 500) {
      lastRetryReason = 'server-error';
      logger.warn('[STT] 폴링 응답 body 서버 에러', { code: data.code, msg: data.msg });
      const waitMs = Math.min(2000 * Math.pow(2, Math.min(attempt, 3)), 10000);
      await waitForRetry(waitMs, signal);
      continue;
    }
    // [FIX #674] body-level 422: "recordInfo is null" (태스크 아직 준비 안 됨) → 재시도
    if (data.code === 422) {
      lastRetryReason = 'not-ready';
      logger.trackRetry('전사 폴링 (body 422)', attempt + 1, maxAttempts, 'recordInfo not ready');
      continue;
    }
    // [FIX #674] body-level 4xx (400/404 등): 복구 불가 → 즉시 실패
    if (data.code !== undefined && data.code !== 200) {
      logger.error('[STT] 폴링 응답 body 클라이언트 에러', { code: data.code, msg: data.msg });
      throw new Error('전사 진행 중 문제가 발생했습니다. 다시 시도해주세요.');
    }

    // 정상 응답 도달 시 lastRetryReason 리셋
    lastRetryReason = '';

    const taskData = (data.data ?? {}) as Record<string, unknown>;
    const state = taskData.state as string | undefined;

    if (state === 'success') {
      const resultJson = taskData.resultJson;
      // [FIX #674] resultJson이 null/undefined인 경우 방어
      if (resultJson == null) {
        logger.error('[STT] 전사 성공이지만 resultJson이 비어 있음', { taskId });
        throw new Error('전사 결과를 처리하지 못했습니다. 다시 시도해주세요.');
      }
      let parsed: Record<string, unknown>;
      if (typeof resultJson === 'string') {
        try {
          const jsonValue = JSON.parse(resultJson);
          if (!jsonValue || typeof jsonValue !== 'object') {
            logger.error('[STT] 전사 결과가 유효한 객체가 아님', { type: typeof jsonValue });
            throw new Error('invalid');
          }
          parsed = jsonValue;
        } catch (e) {
          logger.error('[STT] 전사 결과 파싱 실패', { error: e instanceof Error ? e.message : String(e) });
          throw new Error('전사 결과를 처리하지 못했습니다. 다시 시도해주세요.');
        }
      } else if (typeof resultJson === 'object') {
        parsed = resultJson as Record<string, unknown>;
      } else {
        logger.error('[STT] 전사 결과 형식이 예상과 다름', { type: typeof resultJson });
        throw new Error('전사 결과를 처리하지 못했습니다. 다시 시도해주세요.');
      }
      const result = parseTranscriptionResult(parsed, diarize);
      logger.endAsyncOp(opId, 'completed', `segments=${result.segments.length}, lang=${result.language}, speakers=${result.speakerCount ?? 0}`);
      return result;
    }

    if (state === 'fail') {
      const failMsg = (taskData.failMsg as string) || '';
      logger.error('[STT] 전사 실패', { failMsg, failCode: taskData.failCode });
      throw new Error('전사에 실패했습니다. 다른 오디오 파일로 다시 시도해주세요.');
    }

    // 진행 상태 업데이트
    onProgress?.(diarize ? `화자 분리 전사 중... (${attempt + 1}/${maxAttempts})` : `전사 중... (${attempt + 1}/${maxAttempts})`);
  }

  // [FIX #674] 마지막 재시도 사유에 따라 정확한 에러 메시지 반환
  // 메시지에 '시간 초과' 포함 → catch 블록의 endAsyncOp 중복 호출 방지
  logger.endAsyncOp(opId, 'failed', `전사 시간 초과 (${maxAttempts}회 폴링 실패, lastReason=${lastRetryReason})`);
  if (lastRetryReason === 'rate-limit') {
    throw new Error('전사 시간 초과: 요청이 너무 많아 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  if (lastRetryReason === 'server-error') {
    throw new Error('전사 시간 초과: 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.');
  }
  throw new Error('전사 처리 시간이 초과되었습니다. 오디오 파일이 너무 길 수 있습니다.');
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

function normalizeParagraphText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function getParagraphLength(text: string): number {
  return Math.max(1, normalizeParagraphText(text).length);
}

function hasReasonableParagraphMatch(
  transcriptText: string,
  paragraphText: string,
): boolean {
  const normalizedTranscript = normalizeParagraphText(transcriptText);
  const normalizedParagraphs = normalizeParagraphText(paragraphText);
  if (!normalizedTranscript || !normalizedParagraphs) return false;

  const transcriptProbe = normalizedTranscript.slice(0, Math.min(60, normalizedTranscript.length));
  const paragraphProbe = normalizedParagraphs.slice(0, Math.min(60, normalizedParagraphs.length));
  return normalizedTranscript.includes(paragraphProbe) || normalizedParagraphs.includes(transcriptProbe);
}

/**
 * 전사 문장 배열을 기존 대본 단락 구조에 맞춰 재매핑한다.
 * 텍스트 길이 비율로 start/end를 재분배해, 업로드 오디오와 기존 대본 단락 수를 일치시킨다.
 */
export function alignTranscriptSegmentsToParagraphs(
  segments: WhisperSegment[],
  paragraphs: string[],
): WhisperSegment[] {
  const normalizedSegments = segments.filter((segment) => segment.text.trim().length > 0);
  const normalizedParagraphs = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  if (normalizedSegments.length === 0 || normalizedParagraphs.length === 0) {
    return normalizedSegments;
  }

  const transcriptText = normalizedSegments.map((segment) => segment.text.trim()).join('\n');
  const paragraphText = normalizedParagraphs.join('\n');
  if (!hasReasonableParagraphMatch(transcriptText, paragraphText)) {
    return normalizedSegments;
  }

  const preparedSegments = normalizedSegments.map((segment) => ({
    ...segment,
    normalizedLength: getParagraphLength(segment.text),
    duration: Math.max(0, segment.endTime - segment.startTime),
  }));

  const lastEndTime = preparedSegments[preparedSegments.length - 1]?.endTime || 0;
  let segmentIndex = 0;
  let segmentConsumed = 0;
  let previousEnd = 0;

  return normalizedParagraphs.map((paragraph) => {
    const targetLength = getParagraphLength(paragraph);
    let remaining = targetLength;
    let paragraphStart: number | undefined;
    let paragraphEnd: number | undefined;

    while (remaining > 0 && segmentIndex < preparedSegments.length) {
      const segment = preparedSegments[segmentIndex];
      const remainingInSegment = Math.max(0, segment.normalizedLength - segmentConsumed);
      if (remainingInSegment <= 0) {
        segmentIndex += 1;
        segmentConsumed = 0;
        continue;
      }

      const consumeLength = Math.min(remainingInSegment, remaining);
      const startRatio = segmentConsumed / segment.normalizedLength;
      const endRatio = (segmentConsumed + consumeLength) / segment.normalizedLength;
      const partStart = segment.duration > 0 ? segment.startTime + (segment.duration * startRatio) : segment.startTime;
      const partEnd = segment.duration > 0 ? segment.startTime + (segment.duration * endRatio) : segment.endTime;

      if (paragraphStart === undefined) paragraphStart = partStart;
      paragraphEnd = partEnd;

      remaining -= consumeLength;
      segmentConsumed += consumeLength;

      if (segmentConsumed >= segment.normalizedLength) {
        segmentIndex += 1;
        segmentConsumed = 0;
      }
    }

    const startTime = paragraphStart ?? previousEnd;
    const endTime = Math.max(startTime, paragraphEnd ?? lastEndTime);
    previousEnd = endTime;

    return {
      text: paragraph,
      startTime,
      endTime,
    };
  });
}
