/**
 * Audio Mixer — Web Audio API 오프라인 렌더링
 * FFmpeg 오디오 필터를 Web Audio API 노드로 1:1 대체
 */

import type {
  BgmConfig,
  AudioMasterPreset,
  LoudnessNormConfig,
  UnifiedSceneTiming,
} from '../../types';

export interface AudioMixerInput {
  timeline: UnifiedSceneTiming[];
  narrationLines: { sceneId?: string; audioUrl?: string; startTime?: number }[];
  bgmConfig?: BgmConfig;
  loudnessNorm?: LoudnessNormConfig;
  totalDuration: number;
  sampleRate?: number;
}

/**
 * 오프라인 오디오 렌더링 → Float32 PCM 반환
 */
export async function mixAudio(
  input: AudioMixerInput,
  signal?: AbortSignal,
  onProgress?: (p: number) => void,
): Promise<AudioBuffer | null> {
  const {
    narrationLines,
    bgmConfig,
    loudnessNorm,
    totalDuration,
    sampleRate = 48000,
  } = input;

  // 오디오 소스가 없으면 null 반환
  const hasNarration = narrationLines.some(l => l.audioUrl);
  const hasBgm = bgmConfig?.audioUrl;
  if (!hasNarration && !hasBgm) return null;

  const totalFrames = Math.ceil(totalDuration * sampleRate);
  const ctx = new OfflineAudioContext(2, totalFrames, sampleRate);

  // 1. 나레이션 트랙
  const narrationGain = ctx.createGain();
  narrationGain.gain.value = 1.0;
  narrationGain.connect(ctx.destination);

  let narrationLoadCount = 0;
  const narrationTotal = narrationLines.filter(l => l.audioUrl).length;

  for (const line of narrationLines) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!line.audioUrl) continue;

    try {
      const audioBuffer = await fetchAndDecode(ctx, line.audioUrl);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(narrationGain);
      const startSec = line.startTime ?? 0;
      source.start(startSec);

      narrationLoadCount++;
      onProgress?.(narrationLoadCount / (narrationTotal + 2) * 50);
    } catch (e) {
      console.warn('[AudioMixer] 나레이션 로드 실패:', line.audioUrl, e);
    }
  }

  // 2. BGM 트랙
  if (hasBgm && bgmConfig) {
    try {
      const bgmBuffer = await fetchAndDecode(ctx, bgmConfig.audioUrl!);
      const bgmSource = ctx.createBufferSource();
      bgmSource.buffer = bgmBuffer;

      // BGM 볼륨
      const bgmGain = ctx.createGain();
      const vol = (bgmConfig.volume ?? 50) / 100;
      bgmGain.gain.value = vol;

      // 페이드 인
      if (bgmConfig.fadeIn > 0) {
        bgmGain.gain.setValueAtTime(0, 0);
        bgmGain.gain.linearRampToValueAtTime(vol, bgmConfig.fadeIn);
      }

      // 페이드 아웃
      if (bgmConfig.fadeOut > 0) {
        const fadeOutStart = Math.max(0, totalDuration - bgmConfig.fadeOut);
        bgmGain.gain.setValueAtTime(vol, fadeOutStart);
        bgmGain.gain.linearRampToValueAtTime(0, totalDuration);
      }

      // 덕킹: 나레이션 구간에서 BGM 볼륨 자동 감소
      if (bgmConfig.duckingDb < 0) {
        const duckRatio = Math.pow(10, bgmConfig.duckingDb / 20);
        const duckVol = vol * duckRatio;
        const rampTime = 0.1; // 100ms 전환

        for (const line of narrationLines) {
          if (!line.audioUrl || line.startTime == null) continue;
          const lineStart = line.startTime;
          // 나레이션 시작 시 볼륨 낮추기
          bgmGain.gain.setValueAtTime(vol, Math.max(0, lineStart - rampTime));
          bgmGain.gain.linearRampToValueAtTime(duckVol, lineStart);
        }
        // 마지막 나레이션 이후 복귀 (간이 구현)
        const lastNarration = narrationLines.filter(l => l.audioUrl && l.startTime != null)
          .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))[0];
        if (lastNarration) {
          // 대략 마지막 나레이션 2초 후 복귀
          const recoverTime = (lastNarration.startTime ?? 0) + 2;
          if (recoverTime < totalDuration) {
            bgmGain.gain.setValueAtTime(duckVol, recoverTime);
            bgmGain.gain.linearRampToValueAtTime(vol, recoverTime + rampTime);
          }
        }
      }

      // BGM 루프 (영상보다 짧으면 반복)
      if (bgmBuffer.duration < totalDuration) {
        bgmSource.loop = true;
        bgmSource.loopEnd = bgmBuffer.duration;
      }

      bgmSource.connect(bgmGain);
      bgmGain.connect(ctx.destination);
      bgmSource.start(0);
    } catch (e) {
      console.warn('[AudioMixer] BGM 로드 실패:', e);
    }
  }

  onProgress?.(60);

  // 3. 마스터링 프리셋 적용
  const masterPreset = bgmConfig?.masterPreset ?? 'none';
  if (masterPreset !== 'none') {
    applyMasterPreset(ctx, narrationGain, masterPreset);
  }

  onProgress?.(70);

  // 4. 오프라인 렌더링
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const renderedBuffer = await ctx.startRendering();

  onProgress?.(85);

  // 5. 라우드니스 노멀라이즈 (2-pass)
  if (loudnessNorm?.enabled) {
    normalizeLoudness(renderedBuffer, loudnessNorm);
  }

  onProgress?.(100);

  return renderedBuffer;
}

/**
 * AudioBuffer를 AAC로 인코딩
 */
export async function encodeAudioAAC(
  audioBuffer: AudioBuffer,
  onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void,
): Promise<void> {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('AudioEncoder not supported');
  }

  const encoder = new AudioEncoder({
    output: onChunk,
    error: (e) => { throw e; },
  });

  // AAC-LC 확인
  const aacConfig = {
    codec: 'mp4a.40.2' as const,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: 192_000,
  };

  const support = await AudioEncoder.isConfigSupported(aacConfig);
  if (!support.supported) {
    throw new Error('AAC encoding not supported');
  }

  encoder.configure(aacConfig);

  // AudioBuffer → AudioData 변환
  const numberOfFrames = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;

  // 인터리브된 Float32 배열 생성
  const interleaved = new Float32Array(numberOfFrames * channels);
  for (let ch = 0; ch < channels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numberOfFrames; i++) {
      interleaved[i * channels + ch] = channelData[i];
    }
  }

  // 청크 단위로 AudioData 생성 및 인코딩 (960 프레임 = AAC 프레임 크기)
  const FRAMES_PER_CHUNK = 960;
  for (let offset = 0; offset < numberOfFrames; offset += FRAMES_PER_CHUNK) {
    const chunkFrames = Math.min(FRAMES_PER_CHUNK, numberOfFrames - offset);
    const chunkData = new Float32Array(chunkFrames * channels);
    chunkData.set(interleaved.subarray(offset * channels, (offset + chunkFrames) * channels));

    const audioData = new AudioData({
      format: 'f32-planar' as AudioSampleFormat,
      sampleRate,
      numberOfFrames: chunkFrames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: deinterleaveToPlanes(chunkData, chunkFrames, channels).buffer as ArrayBuffer,
    });

    encoder.encode(audioData);
    audioData.close();
  }

  await encoder.flush();
  encoder.close();
}

// ─── 내부 헬퍼 ─────────────────────────────────────

/** URL에서 오디오를 가져와 AudioBuffer로 디코드 */
async function fetchAndDecode(ctx: OfflineAudioContext, url: string): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;
  if (url.startsWith('blob:')) {
    const resp = await fetch(url);
    arrayBuffer = await resp.arrayBuffer();
  } else {
    const resp = await fetch(url);
    arrayBuffer = await resp.arrayBuffer();
  }
  return ctx.decodeAudioData(arrayBuffer);
}

/** 마스터링 프리셋 적용 (DynamicsCompressor + EQ) */
function applyMasterPreset(
  ctx: OfflineAudioContext,
  sourceNode: GainNode,
  preset: AudioMasterPreset,
): void {
  // 기존 연결 해제 후 프리셋 체인 삽입
  sourceNode.disconnect();

  let currentNode: AudioNode = sourceNode;

  switch (preset) {
    case 'broadcast': {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -15;
      comp.ratio.value = 4;
      comp.knee.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      currentNode.connect(comp);
      currentNode = comp;
      // 리미터
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.ratio.value = 20;
      limiter.knee.value = 0;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.01;
      currentNode.connect(limiter);
      currentNode = limiter;
      break;
    }

    case 'podcast': {
      // 2.5kHz +4dB 보이스 부스트
      const voiceEq = ctx.createBiquadFilter();
      voiceEq.type = 'peaking';
      voiceEq.frequency.value = 2500;
      voiceEq.gain.value = 4;
      voiceEq.Q.value = 1.5;
      currentNode.connect(voiceEq);
      currentNode = voiceEq;
      // 6kHz -3dB 디에싱
      const deEss = ctx.createBiquadFilter();
      deEss.type = 'peaking';
      deEss.frequency.value = 6000;
      deEss.gain.value = -3;
      deEss.Q.value = 2;
      currentNode.connect(deEss);
      currentNode = deEss;
      // 컴프레서
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 3;
      comp.knee.value = 8;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      currentNode.connect(comp);
      currentNode = comp;
      break;
    }

    case 'music': {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -30;
      comp.ratio.value = 2;
      comp.knee.value = 10;
      comp.attack.value = 0.01;
      comp.release.value = 0.3;
      currentNode.connect(comp);
      currentNode = comp;
      break;
    }

    case 'cinema': {
      // 저역 부스트
      const lowEq = ctx.createBiquadFilter();
      lowEq.type = 'peaking';
      lowEq.frequency.value = 80;
      lowEq.gain.value = 5;
      lowEq.Q.value = 0.8;
      currentNode.connect(lowEq);
      currentNode = lowEq;
      // 고역 에어
      const highEq = ctx.createBiquadFilter();
      highEq.type = 'peaking';
      highEq.frequency.value = 12000;
      highEq.gain.value = 2;
      highEq.Q.value = 0.5;
      currentNode.connect(highEq);
      currentNode = highEq;
      // 컴프레서
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.knee.value = 5;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      currentNode.connect(comp);
      currentNode = comp;
      break;
    }

    case 'loudness':
      // loudnorm은 normalizeLoudness()에서 별도 처리
      break;
  }

  currentNode.connect(ctx.destination);
}

/** 2-pass LUFS 노멀라이즈 (인플레이스) */
function normalizeLoudness(buffer: AudioBuffer, config: LoudnessNormConfig): void {
  const targetLufs = config.targetLufs ?? -14;
  const truePeakDbtp = config.truePeakDbtp ?? -1;

  // Pass 1: 현재 LUFS 측정 (간이 RMS 기반)
  let sumSquares = 0;
  let sampleCount = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
      sampleCount++;
    }
  }
  const rms = Math.sqrt(sumSquares / sampleCount);
  const currentLufs = 20 * Math.log10(Math.max(rms, 1e-10)) - 0.691; // 근사 LUFS

  // Pass 2: 게인 보정
  const gainDb = targetLufs - currentLufs;
  let gainLinear = Math.pow(10, gainDb / 20);

  // True Peak 제한
  let maxPeak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const absSample = Math.abs(data[i] * gainLinear);
      if (absSample > maxPeak) maxPeak = absSample;
    }
  }
  const peakDb = 20 * Math.log10(Math.max(maxPeak, 1e-10));
  if (peakDb > truePeakDbtp) {
    const reduction = truePeakDbtp - peakDb;
    gainLinear *= Math.pow(10, reduction / 20);
  }

  // 적용
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
    }
  }
}

/** 인터리브 Float32 → planar Float32 변환 */
function deinterleaveToPlanes(
  interleaved: Float32Array,
  frames: number,
  channels: number,
): Float32Array {
  const planar = new Float32Array(frames * channels);
  for (let ch = 0; ch < channels; ch++) {
    for (let i = 0; i < frames; i++) {
      planar[ch * frames + i] = interleaved[i * channels + ch];
    }
  }
  return planar;
}
