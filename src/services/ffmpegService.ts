/**
 * ffmpegService.ts
 * FFmpeg WASM을 사용한 브라우저 내 MP4 합성
 *
 * 주요 기능:
 * - 이미지 시퀀스 + Ken Burns (zoompan) + 자막 (drawtext) + 나레이션 + BGM → MP4
 * - SharedArrayBuffer 미지원 시 single-threaded 모드 자동 전환
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { logger } from './LoggerService';
import type {
  UnifiedSceneTiming,
  SubtitleStyle,
  BgmConfig,
  ExportProgress,
  AudioMasterPreset,
  CompressorBandSettings,
  SceneTransitionConfig,
  SceneTransitionPreset,
  LoudnessNormConfig,
} from '../types';

/**
 * 오디오 마스터링 프리셋 → FFmpeg 필터 체인 생성
 * 멀티밴드 컴프레서: split → lowpass/bandpass/highpass → compand → amix
 */
function buildAudioMasterFilter(preset: AudioMasterPreset, bands?: CompressorBandSettings[]): string | null {
  switch (preset) {
    case 'broadcast': {
      // 멀티밴드 컴프레서 + 리미터 (방송 표준)
      // 사용자 band 설정이 있으면 동적으로 compand 필터 생성
      if (bands && bands.length === 4) {
        const avgThreshold = bands.reduce((s, b) => s + b.threshold, 0) / bands.length;
        const avgRatio = bands.reduce((s, b) => s + b.ratio, 0) / bands.length;
        const avgGain = bands.reduce((s, b) => s + b.gain, 0) / bands.length;
        const avgAttack = bands.reduce((s, b) => s + b.attack, 0) / bands.length / 1000; // ms → sec
        const avgRelease = bands.reduce((s, b) => s + b.release, 0) / bands.length / 1000;
        // compand points: 각 band threshold/ratio 기반으로 동적 생성
        const midPoint = Math.round(avgThreshold);
        const reduction = Math.round(midPoint / avgRatio);
        return `compand=attacks=${avgAttack.toFixed(4)}:decays=${avgRelease.toFixed(4)}:points=-70/-70|${midPoint}/${reduction}|0/-3:soft-knee=6:gain=${Math.round(avgGain)},alimiter=limit=0.95:attack=0.005:release=0.05`;
      }
      return 'compand=attacks=0.005:decays=0.1:points=-70/-70|-30/-15|-20/-10|0/-3:soft-knee=6:gain=3,alimiter=limit=0.95:attack=0.005:release=0.05';
    }
    case 'podcast':
      // 보이스 부스트 (2kHz 대역 강조) + 디에서 + 컴프레서
      return 'equalizer=f=2500:t=q:w=1.5:g=4,equalizer=f=6000:t=q:w=2:g=-3,compand=attacks=0.01:decays=0.3:points=-70/-70|-24/-12|-0/-0:soft-knee=8:gain=2';
    case 'music':
      // 넓은 다이나믹 레인지 (경량 컴프레서)
      return 'compand=attacks=0.02:decays=0.5:points=-70/-70|-40/-30|-20/-15|0/-5:soft-knee=10:gain=1';
    case 'cinema':
      // 저음 부스트 + 넓은 공간감
      return 'equalizer=f=80:t=q:w=1:g=5,equalizer=f=12000:t=q:w=2:g=2,compand=attacks=0.03:decays=0.8:points=-70/-70|-30/-20|-0/-3:soft-knee=6:gain=2';
    case 'loudness':
      // -14 LUFS 표준화 (YouTube/Spotify 기준)
      return 'loudnorm=I=-14:TP=-1:LRA=11';
    default:
      return null;
  }
}

// CDN base URL for FFmpeg WASM
const FFMPEG_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

let ffmpegInstance: FFmpeg | null = null;

/**
 * FFmpeg WASM 로드 (최초 1회, ~30MB)
 */
export async function loadFFmpeg(
  onProgress?: (progress: ExportProgress) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  onProgress?.({
    phase: 'loading-ffmpeg',
    percent: 0,
    message: 'FFmpeg WASM 로딩 중...',
  });

  const coreURL = await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, 'text/javascript', true, (e) => {
    const pct = e.received && e.total > 0 ? Math.round((e.received / e.total) * 100) : 0;
    onProgress?.({
      phase: 'loading-ffmpeg',
      percent: pct,
      message: `FFmpeg 코어 다운로드... ${pct}%`,
    });
  });

  const wasmURL = await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, 'application/wasm', true, (e) => {
    const pct = e.received && e.total > 0 ? Math.round((e.received / e.total) * 100) : 0;
    onProgress?.({
      phase: 'loading-ffmpeg',
      percent: pct,
      message: `FFmpeg WASM 다운로드... ${pct}%`,
    });
  });

  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegInstance = ffmpeg;

  return ffmpeg;
}

export interface ComposeMp4Options {
  timeline: UnifiedSceneTiming[];
  scenes: { id: string; imageUrl?: string; videoUrl?: string }[];
  narrationLines: { sceneId?: string; audioUrl?: string; startTime?: number }[];
  subtitleStyle?: SubtitleStyle | null;
  bgmConfig?: BgmConfig;
  loudnessNorm?: LoudnessNormConfig;
  sceneTransitions?: Record<string, SceneTransitionConfig>;
  fps?: number;
  width?: number;
  height?: number;
  videoBitrateMbps?: number; // 비트레이트 (Mbps, 기본 20)
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

/** SceneTransitionPreset → FFmpeg xfade transition name */
function toXfadeTransition(preset: SceneTransitionPreset): string {
  const map: Record<SceneTransitionPreset, string> = {
    none: '',
    // 기본
    fade: 'fadeblack',
    fadeWhite: 'fadewhite',
    dissolve: 'dissolve',
    // 와이프
    wipeLeft: 'wipeleft',
    wipeRight: 'wiperight',
    wipeUp: 'wipeup',
    wipeDown: 'wipedown',
    // 슬라이드
    slideLeft: 'slideleft',
    slideRight: 'slideright',
    slideUp: 'slideup',
    slideDown: 'slidedown',
    // 커버
    coverLeft: 'coverleft',
    coverRight: 'coverright',
    // 형태
    circleOpen: 'circleopen',
    circleClose: 'circleclose',
    radial: 'radial',
    diagBR: 'diagbr',
    diagTL: 'diagtl',
    // 줌/3D
    zoomIn: 'zoomin',
    zoomOut: 'fadeblack',   // FFmpeg에 zoomout 없음 → fadeblack 폴백
    flipX: 'horzopen',     // 유사 효과
    flipY: 'vertopen',     // 유사 효과
    // 특수
    smoothLeft: 'smoothleft',
    smoothRight: 'smoothright',
    blur: 'hblur',
    pixelate: 'pixelize',
    squeezH: 'squeezeh',
    flash: 'fadewhite',     // 유사 효과
    glitch: 'dissolve',    // CSS에서만 글리치, FFmpeg는 dissolve 폴백
  };
  return map[preset] || '';
}

/**
 * MP4 합성 메인 함수
 *
 * 1단계: 에셋을 FFmpeg 가상 FS에 쓰기
 * 2단계: 장면별 이미지 → 비디오 세그먼트 (zoompan 필터)
 * 3단계: 세그먼트 연결 + 자막 (drawtext) + 오디오 (amix)
 * 4단계: 최종 MP4 인코딩
 */
export async function composeMp4(options: ComposeMp4Options): Promise<Blob> {
  const {
    timeline,
    scenes,
    narrationLines,
    subtitleStyle,
    bgmConfig,
    loudnessNorm,
    sceneTransitions,
    fps = 30,
    width = 1920,
    height = 1080,
    videoBitrateMbps = 20,
    onProgress,
    signal,
  } = options;

  // 비트레이트: Mbps → bps 문자열 (예: 20 → "20000k")
  const bitrateStr = `${videoBitrateMbps * 1000}k`;

  // 취소 확인 헬퍼
  function checkAbort() {
    if (signal?.aborted) throw new DOMException('내보내기가 취소되었습니다.', 'AbortError');
  }

  checkAbort();
  const ffmpeg = await loadFFmpeg(onProgress);

  // ═══ 정확한 진행률 추적 시스템 ═══
  // 가중치 기반 Phase 분배 (총 100%)
  // Phase 1: 장면 인코딩 (60%) — 가장 무거운 작업
  // Phase 2: 세그먼트 연결 (5%)
  // Phase 2.5: 자막 번인 (10%)
  // Phase 3: 오디오 믹싱 (10%)
  // Phase 4: 최종 인코딩 (15%)
  const PHASE_WEIGHTS = { scenes: 60, concat: 5, subtitle: 10, audio: 10, final: 15 };
  const exportStartTime = Date.now();
  let currentPhaseBase = 0; // 현재 Phase 시작점 (0-100)

  function emitProgress(
    phase: ExportProgress['phase'],
    phasePercent: number,
    phaseWeight: number,
    message: string,
  ) {
    const globalPct = Math.min(100, Math.max(0, Math.round(currentPhaseBase + (phasePercent / 100) * phaseWeight)));
    const elapsedSec = Math.round((Date.now() - exportStartTime) / 1000);
    const etaSec = globalPct > 2 ? Math.round((elapsedSec / globalPct) * (100 - globalPct)) : 0;
    onProgress?.({ phase, percent: globalPct, message, elapsedSec, etaSec });
  }

  // FFmpeg 내부 progress 이벤트 → 현재 Phase 내 세부 진행률로 변환
  let ffmpegPhase: ExportProgress['phase'] = 'composing';
  let ffmpegPhaseWeight = 0;
  let ffmpegPhaseMsg = '';
  const progressHandler = ({ progress }: { progress: number }) => {
    if (progress <= 0 || progress > 1) return;
    const subPct = Math.round(progress * 100);
    emitProgress(ffmpegPhase, subPct, ffmpegPhaseWeight, `${ffmpegPhaseMsg} ${subPct}%`);
  };
  ffmpeg.on('progress', progressHandler);

  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  // --- 영상 원본 길이 프로빙 (JavaScript Video API) ---
  async function probeVideoDuration(url: string): Promise<number> {
    return new Promise<number>((resolve) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        const timeout = setTimeout(() => { resolve(0); }, 5000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          const d = isFinite(video.duration) ? video.duration : 0;
          resolve(d);
          video.src = '';
        };
        video.onerror = () => { clearTimeout(timeout); resolve(0); };
        video.src = url;
      } catch (e) { logger.trackSwallowedError('FfmpegService:probeVideoDuration', e); resolve(0); }
    });
  }

  // ═══ Phase 1: 장면별 세그먼트 인코딩 (60%) ═══
  currentPhaseBase = 0;
  emitProgress('composing', 0, PHASE_WEIGHTS.scenes, '장면 인코딩 준비 중...');

  // FFmpeg exec에 타임아웃 래퍼 (행 방지)
  async function execWithTimeout(args: string[], timeoutMs = 120000): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`FFmpeg exec 타임아웃 (${Math.round(timeoutMs / 1000)}s)`));
      }, timeoutMs);
      ffmpeg.exec(args).then((code) => {
        clearTimeout(timer);
        resolve(code);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  const segmentFiles: string[] = [];
  let segIdx = 0;

  for (const timing of timeline) {
    checkAbort();
    const scene = sceneMap.get(timing.sceneId);
    if (!scene) continue;

    // [CRITICAL FIX] videoUrl 우선 사용 — 이전: imageUrl이 우선되어 이미지를 .mp4로 쓰고
    // FFmpeg가 비디오로 디코딩 시도 → 무한 행 발생
    const hasVideo = !!scene.videoUrl;
    const mediaUrl = hasVideo ? scene.videoUrl! : scene.imageUrl;
    if (!mediaUrl) continue;

    const isImage = !hasVideo;
    const inputName = `input_${segIdx}.${isImage ? 'png' : 'mp4'}`;
    const outputName = `seg_${segIdx}.mp4`;

    // 에셋 쓰기 (Phase 1 내 전반부)
    const sceneSubPct = (segIdx / timeline.length) * 100;
    emitProgress('composing', sceneSubPct, PHASE_WEIGHTS.scenes, `장면 ${segIdx + 1}/${timeline.length} 로딩 중...`);

    try {
      const data = await fetchFile(mediaUrl);
      await ffmpeg.writeFile(inputName, data);
    } catch (fetchErr) {
      console.warn(`[ffmpegService] 장면 ${segIdx + 1} 에셋 로딩 실패:`, fetchErr);
      segIdx++;
      continue;
    }

    const dur = Math.max(0.5, timing.imageDuration);

    // FFmpeg exec 진행률을 Phase 1 하위로 매핑
    ffmpegPhase = 'composing';
    ffmpegPhaseWeight = PHASE_WEIGHTS.scenes;
    ffmpegPhaseMsg = `장면 ${segIdx + 1}/${timeline.length} 인코딩`;

    try {
      if (isImage) {
        const overW = Math.ceil(width * 1.3 / 2) * 2;
        const overH = Math.ceil(height * 1.3 / 2) * 2;
        const totalFrames = Math.ceil(dur * fps);
        const zoomFilter = buildZoompanFilter(timing.effectPreset, totalFrames, fps, width, height, overW, overH, timing.anchorX, timing.anchorY);

        await execWithTimeout([
          '-loop', '1',
          '-i', inputName,
          '-vf', `scale=${overW}:${overH}:force_original_aspect_ratio=increase,crop=${overW}:${overH},${zoomFilter}`,
          '-t', String(dur),
          '-c:v', 'libx264',
          '-b:v', bitrateStr,
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          '-r', String(fps),
          '-y', outputName,
        ]);
      } else {
        const origDur = await probeVideoDuration(mediaUrl);
        let vfChain = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
        if (origDur > 0 && Math.abs(origDur - dur) > 0.3) {
          const ratio = dur / origDur;
          const clampedRatio = Math.max(0.25, Math.min(4.0, ratio));
          vfChain += `,setpts=PTS*${clampedRatio.toFixed(4)}`;
        }
        await execWithTimeout([
          '-i', inputName,
          '-vf', vfChain,
          '-t', String(dur),
          '-c:v', 'libx264',
          '-b:v', bitrateStr,
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          '-an',
          '-r', String(fps),
          '-y', outputName,
        ]);
      }

      segmentFiles.push(outputName);
    } catch (execErr) {
      console.warn(`[ffmpegService] 장면 ${segIdx + 1} 인코딩 실패 (건너뜀):`, execErr);
      // 실패한 입력 파일 정리
      try { await ffmpeg.deleteFile(inputName); } catch (e) { logger.trackSwallowedError('FfmpegService:execErr/cleanup', e); }
    }

    segIdx++;

    const donePct = (segIdx / timeline.length) * 100;
    emitProgress('composing', donePct, PHASE_WEIGHTS.scenes, `장면 ${segIdx}/${timeline.length} 완료`);
  }

  if (segmentFiles.length === 0) {
    ffmpeg.off('progress', progressHandler);
    throw new Error('합성할 영상 세그먼트가 없습니다.');
  }

  // ═══ Phase 2: 세그먼트 연결 (5%) ═══
  checkAbort();
  currentPhaseBase = PHASE_WEIGHTS.scenes;
  emitProgress('composing', 0, PHASE_WEIGHTS.concat, '세그먼트 연결 중...');
  ffmpegPhaseWeight = PHASE_WEIGHTS.concat;
  ffmpegPhaseMsg = '세그먼트 연결';

  // 전환 효과가 있는지 확인 (sceneId → segmentIndex 매핑)
  const validTimeline = timeline.filter((t) => sceneMap.has(t.sceneId) && (sceneMap.get(t.sceneId)!.imageUrl || sceneMap.get(t.sceneId)!.videoUrl));
  const hasAnyTransition = sceneTransitions && validTimeline.some((t, i) => {
    if (i >= validTimeline.length - 1) return false;
    const tr = sceneTransitions[t.sceneId];
    return tr && tr.preset !== 'none';
  });

  if (hasAnyTransition && segmentFiles.length >= 2 && sceneTransitions) {
    // xfade 체이닝: 2개씩 쌍으로 전환 효과 적용
    // 각 세그먼트의 실제 길이 추적 (xfade로 전환 시간만큼 줄어듦)
    const segDurations = validTimeline.map((t) => Math.max(0.5, t.imageDuration));

    const inputArgs: string[] = [];
    for (const f of segmentFiles) {
      inputArgs.push('-i', f);
    }

    const filterParts: string[] = [];
    let prevLabel = '[0:v]';
    let cumulativeDuration = segDurations[0]; // 첫 세그먼트의 누적 길이

    for (let i = 0; i < segmentFiles.length - 1; i++) {
      const sceneId = validTimeline[i]?.sceneId;
      const tr = sceneId ? sceneTransitions[sceneId] : undefined;
      const xfadeName = tr && tr.preset !== 'none' ? toXfadeTransition(tr.preset) : '';
      const xfadeDur = tr && tr.preset !== 'none' ? tr.duration : 0;

      const outLabel = i === segmentFiles.length - 2 ? '[vout]' : `[v${i}]`;
      const nextInput = `[${i + 1}:v]`;

      if (xfadeName && xfadeDur > 0) {
        // offset = 누적 길이 - 전환 시간
        const offset = Math.max(0, cumulativeDuration - xfadeDur);
        filterParts.push(
          `${prevLabel}${nextInput}xfade=transition=${xfadeName}:duration=${xfadeDur.toFixed(2)}:offset=${offset.toFixed(3)}${outLabel}`
        );
        // 다음 세그먼트의 누적 길이: 이전 누적 + 다음 세그먼트 길이 - 전환 겹침
        cumulativeDuration = offset + xfadeDur + segDurations[i + 1] - xfadeDur;
        // 즉, cumulativeDuration = offset + segDurations[i + 1]
        cumulativeDuration = offset + segDurations[i + 1];
      } else {
        // 전환 없음: concat으로 이어붙이기 (xfade duration=0은 지원 안 되므로 concat 필터 사용)
        filterParts.push(
          `${prevLabel}${nextInput}concat=n=2:v=1:a=0${outLabel}`
        );
        cumulativeDuration += segDurations[i + 1];
      }

      prevLabel = outLabel;
    }

    const filterComplex = filterParts.join(';');
    await execWithTimeout([
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-c:v', 'libx264',
      '-b:v', bitrateStr,
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-r', String(fps),
      '-y', 'video_only.mp4',
    ], 300000);
  } else {
    // 전환 효과 없음: 기존 concat demuxer (가장 빠름)
    const concatList = segmentFiles.map((f) => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', concatList);

    await execWithTimeout([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-y', 'video_only.mp4',
    ]);
  }

  // ═══ Phase 2.5: 자막 번인 (10%) ═══
  checkAbort();
  currentPhaseBase = PHASE_WEIGHTS.scenes + PHASE_WEIGHTS.concat;
  const hasSubtitles = timeline.some(t => t.subtitleSegments.length > 0);
  if (hasSubtitles) {
    emitProgress('composing', 0, PHASE_WEIGHTS.subtitle, '자막 합성 중...');
    ffmpegPhaseWeight = PHASE_WEIGHTS.subtitle;
    ffmpegPhaseMsg = '자막 렌더링';

    const tmpl = subtitleStyle?.template;
    const fontSize = tmpl?.fontSize || 44;
    const fontColor = (tmpl?.color || 'white').replace('#', '0x');
    const borderW = tmpl?.outlineWidth || 3;

    const drawtextParts: string[] = [];
    for (const timing of timeline) {
      for (const seg of timing.subtitleSegments) {
        if (!seg.text) continue;
        const escapedText = seg.text
          .replace(/\\/g, '\\\\\\\\')
          .replace(/'/g, "\\\\'")
          .replace(/:/g, '\\\\:')
          .replace(/%/g, '%%')
          .replace(/\n/g, '\\n');
        drawtextParts.push(
          `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=${borderW}:bordercolor=black:x=(w-text_w)/2:y=h-th-60:enable='between(t,${seg.startTime.toFixed(3)},${seg.endTime.toFixed(3)})'`
        );
      }
    }

    if (drawtextParts.length > 0) {
      const subtitleFilter = drawtextParts.join(',');
      await execWithTimeout([
        '-i', 'video_only.mp4',
        '-vf', subtitleFilter,
        '-c:v', 'libx264',
        '-b:v', bitrateStr,
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-y', 'video_sub.mp4',
      ], 180000);
      try { await ffmpeg.deleteFile('video_only.mp4'); } catch (e) { logger.trackSwallowedError('FfmpegService:subtitle/cleanupVideoOnly', e); }
      await execWithTimeout(['-i', 'video_sub.mp4', '-c', 'copy', '-y', 'video_only.mp4']);
      try { await ffmpeg.deleteFile('video_sub.mp4'); } catch (e) { logger.trackSwallowedError('FfmpegService:subtitle/cleanupVideoSub', e); }
    }
  }

  // ═══ Phase 3: 오디오 믹싱 (10%) ═══
  checkAbort();
  currentPhaseBase = PHASE_WEIGHTS.scenes + PHASE_WEIGHTS.concat + PHASE_WEIGHTS.subtitle;

  // 타임라인 순서 기반 나레이션 매핑 (sceneId → timeline 인덱스 순으로 정렬)
  const timingMap = new Map(timeline.map((t) => [t.sceneId, t]));

  // 나레이션을 타임라인 순서로 정렬 — 오디오 순서 꼬임 방지 핵심
  const seenUrls = new Set<string>();
  const validNarrations = narrationLines
    .filter((l) => {
      if (!l.audioUrl) return false;
      if (seenUrls.has(l.audioUrl)) return false;
      seenUrls.add(l.audioUrl);
      return true;
    })
    .map((l) => {
      // 타임라인에서 해당 장면의 정확한 시작 시간 가져오기
      const sceneTiming = l.sceneId ? timingMap.get(l.sceneId) : undefined;
      return { ...l, _timelineStart: sceneTiming?.imageStartTime ?? l.startTime ?? Infinity };
    })
    .sort((a, b) => a._timelineStart - b._timelineStart);

  const hasNarration = validNarrations.length > 0;
  const hasBgm = bgmConfig?.audioUrl;
  const totalDuration = timeline.reduce((sum, t) => sum + Math.max(0.5, t.imageDuration), 0);

  let finalCmd: string[];
  const narrationFileNames: string[] = [];

  if (hasNarration || hasBgm) {
    emitProgress('composing', 0, PHASE_WEIGHTS.audio, '오디오 에셋 로딩 중...');

    if (hasNarration) {
      for (let ni = 0; ni < validNarrations.length; ni++) {
        const narLine = validNarrations[ni];
        const fileName = `narration_${ni}.wav`;
        try {
          const narData = await fetchFile(narLine.audioUrl!);
          await ffmpeg.writeFile(fileName, narData);
          narrationFileNames.push(fileName);
        } catch (e) {
          logger.trackSwallowedError('FfmpegService:narrationLoad', e);
        }
        emitProgress('composing', ((ni + 1) / validNarrations.length) * 50, PHASE_WEIGHTS.audio, `나레이션 ${ni + 1}/${validNarrations.length} 로딩`);
      }
    }

    if (hasBgm) {
      const bgmData = await fetchFile(bgmConfig.audioUrl!);
      await ffmpeg.writeFile('bgm.mp3', bgmData);
    }

    emitProgress('composing', 60, PHASE_WEIGHTS.audio, '오디오 필터 구성 중...');

    finalCmd = ['-i', 'video_only.mp4'];
    for (const nf of narrationFileNames) {
      finalCmd.push('-i', nf);
    }
    if (hasBgm) finalCmd.push('-i', 'bgm.mp3');

    const filterParts: string[] = [];
    const narMixLabels: string[] = [];
    let inputIdx = 1;

    // 나레이션 타이밍: 타임라인의 imageStartTime을 권위 있는 시작점으로 사용
    for (let ni = 0; ni < narrationFileNames.length; ni++) {
      const narLine = validNarrations[ni];
      const sceneTiming = narLine.sceneId ? timingMap.get(narLine.sceneId) : undefined;

      const sceneVolume = sceneTiming ? sceneTiming.volume / 100 : 1.0;
      const sceneSpeed = sceneTiming ? sceneTiming.speed : 1.0;

      // 핵심 수정: 타임라인의 imageStartTime을 우선 사용 (순서 보장)
      const effectiveStartTime = sceneTiming?.imageStartTime
        ?? (narLine.startTime != null && narLine.startTime >= 0 ? narLine.startTime : 0);
      const delayMs = Math.round(effectiveStartTime * 1000);

      const narFilters: string[] = [];
      if (sceneSpeed !== 1.0) narFilters.push(`atempo=${sceneSpeed}`);
      if (sceneVolume !== 1.0) narFilters.push(`volume=${sceneVolume}`);
      if (delayMs > 0) narFilters.push(`adelay=${delayMs}|${delayMs}`);
      narFilters.push('aformat=sample_rates=44100');

      const label = `nar${ni}`;
      filterParts.push(`[${inputIdx}:a]${narFilters.join(',')}[${label}]`);
      narMixLabels.push(`[${label}]`);
      inputIdx++;
    }

    let narOutLabel = '';
    if (narMixLabels.length > 1) {
      narOutLabel = 'narmix';
      filterParts.push(`${narMixLabels.join('')}amix=inputs=${narMixLabels.length}:duration=longest[${narOutLabel}]`);
    } else if (narMixLabels.length === 1) {
      narOutLabel = 'nar0';
    }

    // BGM 필터
    let bgmOutLabel = '';
    if (hasBgm) {
      const vol = (bgmConfig?.volume ?? 30) / 100;
      const fadeIn = bgmConfig?.fadeIn ?? 0;
      const fadeOut = bgmConfig?.fadeOut ?? 0;
      const duckingDb = bgmConfig?.duckingDb ?? 0;

      const bgmFilters: string[] = [];
      bgmFilters.push(`volume=${vol}`);
      if (fadeIn > 0) bgmFilters.push(`afade=t=in:d=${fadeIn}`);
      if (fadeOut > 0 && totalDuration > fadeOut) {
        bgmFilters.push(`afade=t=out:st=${totalDuration - fadeOut}:d=${fadeOut}`);
      }
      if (duckingDb < 0 && hasNarration) {
        const duckVol = Math.pow(10, duckingDb / 20).toFixed(3);
        for (const narLine of validNarrations) {
          const sceneTiming = narLine.sceneId ? timingMap.get(narLine.sceneId) : undefined;
          const st = sceneTiming?.imageStartTime ?? narLine.startTime ?? 0;
          const dur = sceneTiming ? sceneTiming.imageDuration : 3;
          bgmFilters.push(`volume=enable='between(t,${st},${st + dur})':volume=${duckVol}`);
        }
      }
      bgmFilters.push('aformat=sample_rates=44100');

      bgmOutLabel = 'bgm';
      filterParts.push(`[${inputIdx}:a]${bgmFilters.join(',')}[${bgmOutLabel}]`);
    }

    const mixBalance = bgmConfig?.mixBalance ?? -30;
    const narMixVol = Math.max(0, 1.0 - (mixBalance / 100)).toFixed(2);
    const bgmMixVol = Math.max(0, 1.0 + (mixBalance / 100)).toFixed(2);

    let masterLabel = 'aout';
    if (narOutLabel && bgmOutLabel) {
      filterParts.push(`[${narOutLabel}]volume=${narMixVol}[narbal]`);
      filterParts.push(`[${bgmOutLabel}]volume=${bgmMixVol}[bgmbal]`);
      filterParts.push(`[narbal][bgmbal]amix=inputs=2:duration=longest[premix]`);
      masterLabel = 'premix';
    } else if (narOutLabel) {
      masterLabel = narOutLabel;
    } else if (bgmOutLabel) {
      masterLabel = bgmOutLabel;
    }

    const masterPreset = bgmConfig?.masterPreset ?? 'none';
    if (masterPreset !== 'none' && masterLabel) {
      const masterFilter = buildAudioMasterFilter(masterPreset, bgmConfig?.compressorBands);
      if (masterFilter) {
        // loudness 프리셋인 경우 커스텀 LUFS 값 적용
        const effectiveFilter = (masterPreset === 'loudness' && loudnessNorm?.enabled)
          ? `loudnorm=I=${loudnessNorm.targetLufs}:TP=${loudnessNorm.truePeakDbtp}:LRA=${loudnessNorm.lra}`
          : masterFilter;
        filterParts.push(`[${masterLabel}]${effectiveFilter}[aout]`);
        masterLabel = 'aout';
      }
    }

    // 마스터 프리셋이 loudness가 아닌 경우에도 별도 loudnorm 적용
    if (loudnessNorm?.enabled && masterPreset !== 'loudness' && masterLabel) {
      const loudnormFilter = `loudnorm=I=${loudnessNorm.targetLufs}:TP=${loudnessNorm.truePeakDbtp}:LRA=${loudnessNorm.lra}`;
      const nextLabel = masterLabel === 'aout' ? 'alnorm' : 'aout';
      filterParts.push(`[${masterLabel}]${loudnormFilter}[${nextLabel}]`);
      masterLabel = nextLabel;
    }

    if (narOutLabel || bgmOutLabel) {
      finalCmd.push(
        '-filter_complex', filterParts.join(';'),
        '-map', '0:v',
        '-map', `[${masterLabel}]`,
      );
    }

    finalCmd.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', 'output.mp4',
    );
  } else {
    finalCmd = [
      '-i', 'video_only.mp4',
      '-c', 'copy',
      '-y', 'output.mp4',
    ];
  }

  // ═══ Phase 4: 최종 인코딩 (15%) ═══
  checkAbort();
  currentPhaseBase = PHASE_WEIGHTS.scenes + PHASE_WEIGHTS.concat + PHASE_WEIGHTS.subtitle + PHASE_WEIGHTS.audio;
  emitProgress('encoding', 0, PHASE_WEIGHTS.final, '최종 MP4 인코딩...');
  ffmpegPhase = 'encoding';
  ffmpegPhaseWeight = PHASE_WEIGHTS.final;
  ffmpegPhaseMsg = '최종 인코딩';

  await execWithTimeout(finalCmd, 300000);

  emitProgress('encoding', 80, PHASE_WEIGHTS.final, '파일 읽기...');

  const outputData = await ffmpeg.readFile('output.mp4');
  const safeData = outputData instanceof Uint8Array
    ? new Uint8Array(outputData)
    : outputData;
  const blob = new Blob([safeData as BlobPart], { type: 'video/mp4' });

  // 임시 파일 정리
  const allFiles = [...segmentFiles, ...narrationFileNames, 'concat.txt', 'video_only.mp4', 'output.mp4', 'bgm.mp3'];
  for (const f of allFiles) {
    try { await ffmpeg.deleteFile(f); } catch (e) { logger.trackSwallowedError('FfmpegService:finalCleanup', e); }
  }
  for (let i = 0; i < segIdx; i++) {
    try { await ffmpeg.deleteFile(`input_${i}.png`); } catch (e) { logger.trackSwallowedError('FfmpegService:finalCleanup/png', e); }
    try { await ffmpeg.deleteFile(`input_${i}.mp4`); } catch (e) { logger.trackSwallowedError('FfmpegService:finalCleanup/mp4', e); }
  }

  ffmpeg.off('progress', progressHandler);

  const totalElapsed = Math.round((Date.now() - exportStartTime) / 1000);
  onProgress?.({ phase: 'done', percent: 100, message: '완료!', elapsedSec: totalElapsed, etaSec: 0 });

  return blob;
}

/**
 * zoompan 필터 빌더 (Ken Burns 프리셋 → FFmpeg 필터)
 * overW/overH: 1.3x overscale된 입력 크기, w/h: 최종 출력 크기
 * zoompan의 s= 파라미터로 출력 해상도를 지정하여 overscale → 최종 크기로 축소
 * zoom=1.0에서도 ~288px 버퍼가 있어 팬/줌아웃 시 검은 테두리 발생하지 않음
 *
 * anchorX/anchorY: 0-100% 앵커 포인트 (50=중앙). 장면 분석으로 자동 설정됨.
 * 인물 얼굴, 피사체 중심 등에 줌/팬이 맞춰짐.
 */
function buildZoompanFilter(
  preset: string, totalFrames: number, fps: number,
  w: number, h: number, overW: number, overH: number,
  anchorX = 50, anchorY = 50,
): string {
  const d = totalFrames;
  const z = fps;
  // 안전한 최대 팬 거리 (overscale 여백, 픽셀)
  const maxPanX = Math.floor((overW - w) / 2);
  const maxPanY = Math.floor((overH - h) / 2);

  // 앵커 기반 위치 표현식: anchorX/Y를 0-100%에서 FFmpeg 좌표로 변환
  // 앵커가 50%면 중앙, 35%면 상단 쪽 등
  const aRatioX = anchorX / 100;
  const aRatioY = anchorY / 100;
  // 앵커 오프셋 (중앙 대비 픽셀 이동, maxPan 범위 내로 클램프)
  const offX = Math.round(Math.max(-maxPanX, Math.min(maxPanX, (aRatioX - 0.5) * 2 * maxPanX)));
  const offY = Math.round(Math.max(-maxPanY, Math.min(maxPanY, (aRatioY - 0.5) * 2 * maxPanY)));

  // 앵커 보정된 중앙 위치 표현식
  const cx = `(iw/2-(iw/zoom/2)+${offX})`;
  const cy = `(ih/2-(ih/zoom/2)+${offY})`;

  switch (preset) {
    case 'smooth':
      return `zoompan=z='min(zoom+0.001,1.15)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'cinematic':
      return `zoompan=z='if(lte(zoom,1.0),1.15,max(1.0,zoom-0.001))':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'dynamic':
      // 앵커 방향으로 팬 + 줌인
      return `zoompan=z='min(zoom+0.002,1.3)':x='min(if(gte(on,1),x+${offX >= 0 ? 1 : -1},${Math.floor(maxPanX / 2) + offX}),${maxPanX})':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'zoom':
      return `zoompan=z='min(zoom+0.003,1.5)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'dreamy':
      return `zoompan=z='min(zoom+0.0008,1.08)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'dramatic':
      return `zoompan=z='if(lte(on,${Math.floor(d / 2)}),min(zoom+0.002,1.3),max(1.0,zoom-0.002))':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'reveal':
      return `zoompan=z='if(lte(zoom,1.0),1.4,max(1.0,zoom-0.002))':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'documentary':
      // 앵커에서 시작하여 수평 팬
      return `zoompan=z='min(zoom+0.0005,1.05)':x='min(if(gte(on,1),x+0.5,${Math.floor(maxPanX * 0.3) + offX}),${maxPanX})':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'timelapse':
      return `zoompan=z='min(zoom+0.004,1.5)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'vintage':
      return `zoompan=z='min(zoom+0.001,1.1)':x='${cx}':y='min(if(gte(on,1),y+0.3,${Math.floor(maxPanY * 0.3) + offY}),${maxPanY})':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'vlog':
      return `zoompan=z='1.02+0.01*sin(on/30)':x='iw/2-(iw/zoom/2)+${offX}+2*sin(on/25)':y='ih/2-(ih/zoom/2)+${offY}+2*cos(on/20)':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'diagonal-drift':
      // 좌하→우상 대각 이동 + 미세 줌
      return `zoompan=z='min(zoom+0.001,1.1)':x='${Math.floor(maxPanX * 0.8) + offX}*(1-on/${d})':y='${Math.floor(maxPanY * 0.8) + offY}*(1-on/${d})':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'orbit':
      // 타원 궤도 이동
      return `zoompan=z='1.1':x='iw/2-(iw/zoom/2)+${offX}+${Math.floor(maxPanX * 0.5)}*sin(on*6.28/${d})':y='ih/2-(ih/zoom/2)+${offY}+${Math.floor(maxPanY * 0.3)}*cos(on*6.28/${d})':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'parallax':
      // 전경/배경 차별 이동 (scale + translate)
      return `zoompan=z='1.15-0.1*(on/${d})':x='min(if(gte(on,1),x+0.8,${Math.floor(maxPanX * 0.3) + offX}),${maxPanX})':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'tilt-shift':
      // 상→하 팬
      return `zoompan=z='1.08':x='${cx}':y='min(if(gte(on,1),y+0.6,${offY}),${maxPanY})':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'spiral-in':
      // 줌인 (회전은 CSS 전용)
      return `zoompan=z='min(zoom+0.002,1.3)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'push-pull':
      // 줌인↔줌아웃 반복 (breathing)
      return `zoompan=z='1.1+0.08*sin(on*6.28/${d})':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'dolly-zoom':
      // 줌인하며 후퇴 (Vertigo)
      return `zoompan=z='if(lte(on,${Math.floor(d / 2)}),min(zoom+0.003,1.4),max(1.0,zoom-0.003))':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'crane-up':
      // 하→상 + 점진적 줌아웃
      return `zoompan=z='if(lte(zoom,1.0),1.12,max(1.0,zoom-0.0008))':x='${cx}':y='max(if(gte(on,1),y-0.6,${maxPanY + offY}),0)':d=${d}:s=${w}x${h}:fps=${z}`;
    case 'fast':
    default:
      return `zoompan=z='min(zoom+0.0015,1.2)':x='${cx}':y='${cy}':d=${d}:s=${w}x${h}:fps=${z}`;
  }
}

/**
 * Blob → 브라우저 다운로드
 */
export function downloadMp4(blob: Blob, filename = 'output.mp4'): void {
  // [FIX #127 #130] 유효하지 않은 MP4 다운로드 방지 — 최소 1KB 이상이어야 함
  if (blob.size <= 1000) {
    throw new Error(
      '내보내기 실패: 생성된 영상 파일이 비정상입니다 (크기: ' +
      blob.size + ' bytes). 다시 시도해주세요.'
    );
  }

  const url = URL.createObjectURL(blob);
  logger.registerBlobUrl(url, 'video', 'ffmpegService:downloadMp4');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }, 60000);
}
