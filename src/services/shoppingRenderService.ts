/**
 * Shopping Render Service — 딸깍 영상 제작
 * 원본 영상 + TTS 나레이션 + 자막 오버레이 → 최종 MP4 렌더링
 *
 * [FIX #277] WebCodecs GPU 인코딩 우선, FFmpeg WASM 폴백
 */

import { splitBySentenceEndings } from './ttsService';
import { removeSubtitlesWithGhostCut } from './ghostcutService';
import { logger } from './LoggerService';
import { downloadMp4 } from './webcodecs';
import type { ShoppingScript, ShoppingRenderPhase, ShoppingCTAPreset, SubtitleTemplate } from '../types';

interface RenderConfig {
  subtitleRemovalMethod: 'ghostcut' | 'none';
  videoWidth: number;
  videoHeight: number;
  fontFamily: string;
  fontSize: number;
  ctaPreset: ShoppingCTAPreset;
  ctaText: string;
}

interface RenderProgress {
  phase: ShoppingRenderPhase;
  percent: number;
  message: string;
}

/** fontFamily/fontSize → SubtitleTemplate 변환 (WebCodecs drawSubtitle용) */
function buildDefaultSubtitleTemplate(config: RenderConfig): SubtitleTemplate {
  return {
    id: 'shopping-default',
    name: 'Shopping Default',
    category: 'basic' as const,
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    fontWeight: 700,
    fontStyle: 'normal' as const,
    color: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 3,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    letterSpacing: 0,
    lineHeight: 1.4,
    positionY: 18,
    textAlign: 'center' as const,
  };
}

/** CTA 전용 템플릿 (노란색, 하단 8%) */
function buildCtaTemplate(config: RenderConfig): SubtitleTemplate {
  return {
    id: 'shopping-cta',
    name: 'Shopping CTA',
    category: 'basic' as const,
    fontFamily: config.fontFamily,
    fontSize: Math.round(config.fontSize * 0.85),
    fontWeight: 700,
    fontStyle: 'normal' as const,
    color: '#FFFF00',
    outlineColor: '#000000',
    outlineWidth: 2,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    letterSpacing: 0,
    lineHeight: 1.4,
    positionY: 8,
    textAlign: 'center' as const,
  };
}

/**
 * 전체 렌더 파이프라인 오케스트레이터
 * WebCodecs 우선, 미지원 시 FFmpeg WASM 폴백
 */
export const renderShoppingShort = async (
  sourceBlob: Blob,
  script: ShoppingScript,
  ttsAudioUrl: string,
  config: RenderConfig,
  onProgress: (progress: RenderProgress) => void,
): Promise<Blob> => {
  logger.info('[ShoppingRender] 렌더 시작', { script: script.title });

  // 0. GhostCut 자막 제거 (ghostcut 모드일 때)
  let videoBlob = sourceBlob;
  if (config.subtitleRemovalMethod === 'ghostcut') {
    onProgress({ phase: 'removing-subtitles', percent: 5, message: 'GhostCut AI 자막 제거 시작...' });
    videoBlob = await removeSubtitlesWithGhostCut(
      sourceBlob,
      config.videoWidth,
      config.videoHeight,
      (msg) => onProgress({ phase: 'removing-subtitles', percent: 15, message: msg }),
    );
    onProgress({ phase: 'removing-subtitles', percent: 25, message: 'AI 자막 제거 완료' });
  }

  // 1. WebCodecs 지원 여부 확인
  const { isWebCodecsSupported } = await import('./webcodecs');
  if (!isWebCodecsSupported()) {
    console.log('[ShoppingRender] WebCodecs 미지원 → FFmpeg 폴백');
    return renderWithFFmpeg(videoBlob, script, ttsAudioUrl, config, onProgress);
  }

  const { probeVideoEncoder, createEncoder } = await import('./webcodecs/videoEncoder');
  const encoderProbe = await probeVideoEncoder(config.videoWidth, config.videoHeight);
  if (!encoderProbe) {
    console.log('[ShoppingRender] H.264 인코더 미지원 → FFmpeg 폴백');
    return renderWithFFmpeg(videoBlob, script, ttsAudioUrl, config, onProgress);
  }

  try {
    return await renderWithWebCodecs(
      videoBlob, script, ttsAudioUrl, config, onProgress, encoderProbe,
    );
  } catch (err) {
    // AbortError는 재throw
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    console.error('[ShoppingRender] WebCodecs 실패, FFmpeg 폴백:', err);
    return renderWithFFmpeg(videoBlob, script, ttsAudioUrl, config, onProgress);
  }
};

// ═══════════════════════════════════════════════════════════════
// WebCodecs 파이프라인
// ═══════════════════════════════════════════════════════════════

async function renderWithWebCodecs(
  videoBlob: Blob,
  script: ShoppingScript,
  ttsAudioUrl: string,
  config: RenderConfig,
  onProgress: (progress: RenderProgress) => void,
  encoderProbe: { codec: string; hardwareAcceleration: 'prefer-hardware' | 'prefer-software' | 'no-preference' },
): Promise<Blob> {
  const { createStreamingVideoExtractor } = await import('./webcodecs/videoDecoder');
  const { createEncoder } = await import('./webcodecs/videoEncoder');
  const { encodeAudioAAC } = await import('./webcodecs/audioMixer');
  const { createMp4Muxer } = await import('./webcodecs/mp4Muxer');
  const { drawSubtitle } = await import('./webcodecs/subtitleRenderer');

  // 2. 소스 영상 디코더 생성
  onProgress({ phase: 'overlaying-subtitles', percent: 28, message: '영상 디코딩 준비...' });
  const extractor = await createStreamingVideoExtractor(videoBlob);

  // 3. 자막 타이밍 계산
  const sentences = splitBySentenceEndings(script.fullText);
  const ttsDuration = await getAudioDuration(ttsAudioUrl);
  const subtitleEntries = calculateSubtitleTimings(sentences, ttsDuration);
  const subtitleTpl = buildDefaultSubtitleTemplate(config);
  const ctaTpl = config.ctaText ? buildCtaTemplate(config) : null;

  // 4. 영상 길이 (-shortest 동작: 짧은 쪽 기준)
  const totalDuration = Math.min(ttsDuration, extractor.duration);
  const fps = 30;
  const totalFrames = Math.ceil(totalDuration * fps);
  const { videoWidth: width, videoHeight: height } = config;

  // 5. 비디오 파이프라인
  const videoChunks: Array<{ chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }> = [];
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  const { encoder, encodeFrame, flush } = createEncoder(
    { width, height, fps, bitrate: 8_000_000 },
    encoderProbe.codec,
    encoderProbe.hardwareAcceleration,
    (chunk) => videoChunks.push(chunk),
    (err) => console.error('[ShoppingRender] encoder error:', err),
  );

  onProgress({ phase: 'encoding', percent: 40, message: '영상 렌더링 중...' });

  for (let f = 0; f < totalFrames; f++) {
    const timeSec = f / fps;

    // 소스 영상 프레임 추출 + 그리기
    try {
      const frameBmp = await extractor.getFrameAt(timeSec);
      const scale = Math.max(width / frameBmp.width, height / frameBmp.height);
      const dw = frameBmp.width * scale;
      const dh = frameBmp.height * scale;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(frameBmp, (width - dw) / 2, (height - dh) / 2, dw, dh);
      frameBmp.close();
    } catch {
      // 프레임 추출 실패 시 검은 화면
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    }

    // 자막 오버레이
    const currentSub = subtitleEntries.find(s => timeSec >= s.start && timeSec < s.end);
    if (currentSub) {
      drawSubtitle(ctx, currentSub.text, subtitleTpl, width, height);
    }

    // CTA 오버레이 (마지막 3초)
    if (ctaTpl && config.ctaText) {
      const ctaStart = Math.max(0, totalDuration - 3);
      if (timeSec >= ctaStart) {
        drawSubtitle(ctx, config.ctaText, ctaTpl, width, height);
      }
    }

    encodeFrame(canvas, f);

    // 진행률 (30프레임마다)
    if (f % 30 === 0) {
      const pct = Math.round(40 + (f / totalFrames) * 45);
      onProgress({ phase: 'encoding', percent: pct, message: `인코딩 중... ${pct}%` });
    }
  }

  await flush();
  encoder.close();

  // 6. 오디오 파이프라인 (TTS만, BGM 없음)
  onProgress({ phase: 'mixing-audio', percent: 88, message: '오디오 인코딩 중...' });
  const audioChunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }> = [];

  try {
    const ttsResp = await fetch(ttsAudioUrl);
    const ttsArrayBuffer = await ttsResp.arrayBuffer();
    const audioCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * 48000), 48000);
    const decodedAudio = await audioCtx.decodeAudioData(ttsArrayBuffer);

    await encodeAudioAAC(decodedAudio, (chunk, meta) => {
      audioChunks.push({ chunk, meta });
    });
  } catch (audioErr) {
    console.warn('[ShoppingRender] 오디오 인코딩 실패 (무음으로 진행):', audioErr);
  }

  // 7. MP4 먹싱
  onProgress({ phase: 'done', percent: 95, message: 'MP4 생성 중...' });
  const muxer = createMp4Muxer({
    width,
    height,
    fps,
    hasAudio: audioChunks.length > 0,
    audioSampleRate: 48000,
    audioChannels: 2,
  });

  for (const vc of videoChunks) muxer.addVideoChunk(vc);
  for (const ac of audioChunks) muxer.addAudioChunk(ac.chunk, ac.meta);
  const outputBlob = muxer.finalize();

  // 8. 정리
  extractor.dispose();

  logger.success('[ShoppingRender] WebCodecs 렌더 완료', { size: outputBlob.size });
  onProgress({ phase: 'done', percent: 100, message: '완료!' });
  return outputBlob;
}

// ═══════════════════════════════════════════════════════════════
// FFmpeg WASM 폴백 (WebCodecs 미지원 시)
// ═══════════════════════════════════════════════════════════════

async function renderWithFFmpeg(
  videoBlob: Blob,
  script: ShoppingScript,
  ttsAudioUrl: string,
  config: RenderConfig,
  onProgress: (progress: RenderProgress) => void,
): Promise<Blob> {
  const { loadFFmpeg, companionTranscode } = await import('./ffmpegService');
  const { fetchFile } = await import('@ffmpeg/util');

  // 0. 컴패니언 FFmpeg 시도 (WASM 30MB 로드 불필요)
  onProgress({ phase: 'overlaying-subtitles', percent: 28, message: '렌더링 엔진 준비 중...' });
  const companionResult = await companionTranscode(videoBlob, 'mp4');
  if (companionResult && companionResult.size > 1000) {
    onProgress({ phase: 'done', percent: 100, message: '컴패니언 FFmpeg 렌더링 완료!' });
    return companionResult;
  }

  // 1. FFmpeg WASM 로드 (폴백)
  onProgress({ phase: 'overlaying-subtitles', percent: 28, message: 'FFmpeg 로드 중...' });
  const ffmpeg = await loadFFmpeg();

  // 2. 소스 비디오 → FFmpeg FS
  onProgress({ phase: 'overlaying-subtitles', percent: 30, message: '영상 파일 준비 중...' });
  const sourceData = await fetchFile(videoBlob);
  await ffmpeg.writeFile('input.mp4', sourceData);

  // 3. TTS 오디오 → FFmpeg FS
  onProgress({ phase: 'mixing-audio', percent: 20, message: 'TTS 오디오 준비 중...' });
  const ttsResponse = await fetch(ttsAudioUrl);
  const ttsBlob = await ttsResponse.blob();
  const ttsData = await fetchFile(ttsBlob);
  const ttsExt = ttsBlob.type.includes('wav') ? 'wav' : 'mp3';
  await ffmpeg.writeFile(`narration.${ttsExt}`, ttsData);

  // 4. 자막 텍스트 분할 + 타이밍 계산
  const sentences = splitBySentenceEndings(script.fullText);
  const ttsDuration = await getAudioDuration(ttsAudioUrl);
  const subtitleEntries = calculateSubtitleTimings(sentences, ttsDuration);

  // 5. FFmpeg 필터 체인 빌드
  onProgress({ phase: 'overlaying-subtitles', percent: 40, message: '자막 오버레이 준비 중...' });
  const filterChain = buildFilterChain(subtitleEntries, config.fontSize, config.ctaText, ttsDuration);

  // 6. FFmpeg 실행
  onProgress({ phase: 'encoding', percent: 50, message: '영상 인코딩 중...' });
  const ffmpegArgs = buildFFmpegArgs(filterChain, ttsExt);

  ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.min(95, 50 + Math.round(progress * 45));
    onProgress({ phase: 'encoding', percent, message: `인코딩 중... ${percent}%` });
  });

  await ffmpeg.exec(ffmpegArgs);

  // 7. 결과 읽기
  onProgress({ phase: 'done', percent: 100, message: '완료!' });
  const outputData = await ffmpeg.readFile('output.mp4');
  const safeData = outputData instanceof Uint8Array ? new Uint8Array(outputData) : outputData;
  const outputBlob = new Blob([safeData], { type: 'video/mp4' });

  // 클린업
  try {
    await ffmpeg.deleteFile('input.mp4');
    await ffmpeg.deleteFile(`narration.${ttsExt}`);
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    logger.trackSwallowedError('shoppingRenderService:cleanupFiles', e);
  }

  logger.success('[ShoppingRender] FFmpeg 렌더 완료', { size: outputBlob.size });
  return outputBlob;
}

// ═══════════════════════════════════════════════════════════════
// 공용 유틸리티
// ═══════════════════════════════════════════════════════════════

/** 오디오 길이 측정 */
const getAudioDuration = (audioUrl: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => resolve(30);
  });
};

/** 문장별 자막 타이밍 비례 배분 */
const calculateSubtitleTimings = (
  sentences: string[],
  totalDuration: number,
): { text: string; start: number; end: number }[] => {
  if (sentences.length === 0) return [];
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  if (totalChars === 0) return [];

  let currentTime = 0;
  return sentences.map((text) => {
    const ratio = text.length / totalChars;
    const duration = ratio * totalDuration;
    const start = currentTime;
    const end = currentTime + duration;
    currentTime = end;
    return { text: text.trim(), start, end };
  });
};

// ═══════════════════════════════════════════════════════════════
// FFmpeg 전용 헬퍼 (폴백 경로에서만 사용)
// ═══════════════════════════════════════════════════════════════

/** FFmpeg drawtext 특수문자 이스케이프 */
const escapeDrawtext = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/\n/g, ' ');
};

/** FFmpeg 필터 체인 빌드 */
const buildFilterChain = (
  subtitles: { text: string; start: number; end: number }[],
  fontSize: number,
  ctaText: string,
  totalDuration: number,
): string => {
  const filters: string[] = [];
  filters.push("null[desubbed]");

  subtitles.forEach((sub, i) => {
    const escaped = escapeDrawtext(sub.text);
    const inputLabel = i === 0 ? '[desubbed]' : `[sub${i - 1}]`;
    const outputLabel = i === subtitles.length - 1 && !ctaText ? '' : `[sub${i}]`;
    filters.push(
      `${inputLabel}drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.82:enable='between(t\\,${sub.start.toFixed(2)}\\,${sub.end.toFixed(2)})'${outputLabel}`
    );
  });

  if (ctaText) {
    const ctaStart = Math.max(0, totalDuration - 3);
    const lastLabel = subtitles.length > 0 ? `[sub${subtitles.length - 1}]` : '[desubbed]';
    const escapedCta = escapeDrawtext(ctaText);
    filters.push(
      `${lastLabel}drawtext=text='${escapedCta}':fontsize=${Math.round(fontSize * 0.85)}:fontcolor=yellow:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.92:enable='between(t\\,${ctaStart.toFixed(2)}\\,${totalDuration.toFixed(2)})'`
    );
  }

  return filters.join(';');
};

/** FFmpeg 실행 인자 빌드 */
const buildFFmpegArgs = (filterChain: string, ttsExt: string): string[] => {
  return [
    '-i', 'input.mp4',
    '-i', `narration.${ttsExt}`,
    '-filter_complex', filterChain,
    '-map', '0:v',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    'output.mp4',
  ];
};

/** 렌더 결과 다운로드 */
export const downloadRenderedVideo = (blob: Blob, filename?: string): void => {
  downloadMp4(blob, filename || 'shopping-short.mp4');
};
