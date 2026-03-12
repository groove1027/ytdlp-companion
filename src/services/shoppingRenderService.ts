/**
 * Shopping Render Service — 딸깍 영상 제작
 * 원본 영상 + TTS 나레이션 + 자막 오버레이 → 최종 MP4 렌더링
 *
 * 인프라: ffmpegService (loadFFmpeg, downloadMp4)
 */

import { loadFFmpeg, downloadMp4 } from './ffmpegService';
import { splitBySentenceEndings } from './ttsService';
import { removeSubtitlesWithGhostCut } from './ghostcutService';
import { logger } from './LoggerService';
import type { ShoppingScript, ShoppingRenderPhase, ShoppingCTAPreset } from '../types';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

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

/**
 * 전체 렌더 파이프라인 오케스트레이터
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

  // 1. FFmpeg 로드
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

  // 5. FFmpeg 필터 체인 빌드 (자막 오버레이 + CTA)
  onProgress({ phase: 'overlaying-subtitles', percent: 40, message: '자막 오버레이 준비 중...' });
  const filterChain = buildFilterChain(
    subtitleEntries,
    config.fontSize,
    config.ctaText,
    ttsDuration,
  );

  // 6. FFmpeg 실행
  onProgress({ phase: 'encoding', percent: 50, message: '영상 인코딩 중...' });

  const ffmpegArgs = buildFFmpegArgs(filterChain, ttsExt, ttsDuration);

  // 진행률 추적
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
  await cleanupFiles(ffmpeg, ttsExt);

  logger.success('[ShoppingRender] 렌더 완료', { size: outputBlob.size });
  return outputBlob;
};

/** 오디오 길이 측정 */
const getAudioDuration = (audioUrl: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = audioUrl;
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => resolve(30); // 폴백 30초
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

/** FFmpeg 필터 체인 빌드 (자막 오버레이 + CTA만 담당, 자막 제거는 GhostCut이 선행 처리) */
const buildFilterChain = (
  subtitles: { text: string; start: number; end: number }[],
  fontSize: number,
  ctaText: string,
  totalDuration: number,
): string => {
  const filters: string[] = [];

  // 패스스루 (GhostCut이 이미 처리했거나, 제거 없음)
  filters.push("null[desubbed]");

  // 2. 새 자막 drawtext 오버레이
  subtitles.forEach((sub, i) => {
    const escaped = escapeDrawtext(sub.text);
    const inputLabel = i === 0 ? '[desubbed]' : `[sub${i - 1}]`;
    const outputLabel = i === subtitles.length - 1 && !ctaText ? '' : `[sub${i}]`;

    filters.push(
      `${inputLabel}drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.82:enable='between(t\\,${sub.start.toFixed(2)}\\,${sub.end.toFixed(2)})'${outputLabel}`
    );
  });

  // 3. CTA 오버레이 (마지막 3초)
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

/** drawtext 특수문자 이스케이프 */
const escapeDrawtext = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/\n/g, ' ');
};

/** FFmpeg 실행 인자 빌드 */
const buildFFmpegArgs = (
  filterChain: string,
  ttsExt: string,
  _ttsDuration: number,
): string[] => {
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

/** FFmpeg FS 정리 */
const cleanupFiles = async (ffmpeg: FFmpeg, ttsExt: string): Promise<void> => {
  try {
    await ffmpeg.deleteFile('input.mp4');
    await ffmpeg.deleteFile(`narration.${ttsExt}`);
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    logger.trackSwallowedError('shoppingRenderService:cleanupFiles', e);
    // 클린업 실패는 무시
  }
};

/** 렌더 결과 다운로드 */
export const downloadRenderedVideo = (blob: Blob, filename?: string): void => {
  downloadMp4(blob, filename || 'shopping-short.mp4');
};
