/**
 * Video Encoder — WebCodecs VideoEncoder 래퍼
 * H.264 하드웨어 가속 인코딩 + 병렬 배치 처리
 */

import { logger } from '../LoggerService';

export interface EncodedChunk {
  chunk: EncodedVideoChunk;
  meta?: EncodedVideoChunkMetadata;
}

export interface VideoEncoderConfig {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  keyframeIntervalFrames?: number;
}

/**
 * VideoEncoder가 지원되는지 확인 + 최적 설정 반환
 */
export async function probeVideoEncoder(
  width: number,
  height: number,
): Promise<{ codec: string; hardwareAcceleration: HardwareAcceleration } | null> {
  if (typeof VideoEncoder === 'undefined') return null;

  // H.264 High Profile Level 4.0 → 1080p 30fps 지원
  const configs: Array<{ codec: string; hw: HardwareAcceleration }> = [
    { codec: 'avc1.640028', hw: 'prefer-hardware' },
    { codec: 'avc1.640028', hw: 'prefer-software' },
    { codec: 'avc1.4d0028', hw: 'prefer-hardware' }, // Main Profile 폴백
    { codec: 'avc1.4d0028', hw: 'prefer-software' },
  ];

  for (const { codec, hw } of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 8_000_000,
        hardwareAcceleration: hw,
      });
      if (support.supported) {
        return { codec, hardwareAcceleration: hw };
      }
    } catch (e) {
      logger.trackSwallowedError('videoEncoder:checkCodecSupport', e);
      // continue
    }
  }
  return null;
}

type HardwareAcceleration = 'prefer-hardware' | 'prefer-software' | 'no-preference';

/**
 * 프레임들을 H.264로 인코딩
 * 제너레이터 패턴: 프레임 단위로 인코딩하고 콜백으로 청크 수집
 */
export function createEncoder(
  config: VideoEncoderConfig,
  codecStr: string,
  hw: HardwareAcceleration,
  onChunk: (chunk: EncodedChunk) => void,
  onError: (err: Error) => void,
): {
  encoder: VideoEncoder;
  encodeFrame: (canvas: OffscreenCanvas, frameIndex: number) => void;
  flush: () => Promise<void>;
} {
  const { width, height, fps, bitrate = 8_000_000, keyframeIntervalFrames = 60 } = config;

  // [FIX #127 #130] 인코더 에러를 외부로 전파하기 위한 플래그
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output(chunk, meta) {
      onChunk({ chunk, meta });
    },
    error(e) {
      encoderError = e;
      onError(e);
    },
  });

  encoder.configure({
    codec: codecStr,
    width,
    height,
    bitrate,
    hardwareAcceleration: hw,
    framerate: fps,
    latencyMode: 'quality',
    avc: { format: 'avc' }, // Annex B 포맷 (mp4-muxer 호환)
  });

  const frameDurationMicro = Math.round(1_000_000 / fps);

  function encodeFrame(canvas: OffscreenCanvas, frameIndex: number): void {
    // [FIX #127 #130] 인코더 에러 발생 시 즉시 중단
    if (encoderError) {
      throw new Error(`영상 인코딩 중 오류 발생: ${encoderError.message}`);
    }
    const timestamp = frameIndex * frameDurationMicro;
    const frame = new VideoFrame(canvas, {
      timestamp,
      duration: frameDurationMicro,
    });
    const keyFrame = frameIndex % keyframeIntervalFrames === 0;
    encoder.encode(frame, { keyFrame });
    frame.close();
  }

  async function flush(): Promise<void> {
    await encoder.flush();
    // [FIX #127 #130] flush 후에도 에러 체크 — 비동기 에러가 flush 중 발생할 수 있음
    if (encoderError) {
      throw new Error(`영상 인코딩 중 오류 발생: ${encoderError.message}`);
    }
  }

  return { encoder, encodeFrame, flush };
}
