/**
 * MP4 Muxer — mp4-muxer 통합
 * 비디오(H.264) + 오디오(AAC) → MP4 Blob 생성
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { EncodedChunk } from './videoEncoder';

export interface MuxerConfig {
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface MuxerHandle {
  addVideoChunk: (chunk: EncodedChunk) => void;
  addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
  finalize: () => Blob;
}

/**
 * MP4 먹서 생성
 */
export function createMp4Muxer(config: MuxerConfig): MuxerHandle {
  const { width, height, fps, hasAudio, audioSampleRate = 48000, audioChannels = 2 } = config;

  const target = new ArrayBufferTarget();

  const muxerOptions: ConstructorParameters<typeof Muxer>[0] = {
    target,
    fastStart: 'in-memory', // moov atom 앞에 배치 (스트리밍 가능)
    video: {
      codec: 'avc',
      width,
      height,
    },
    ...(hasAudio
      ? {
          audio: {
            codec: 'aac',
            sampleRate: audioSampleRate,
            numberOfChannels: audioChannels,
          },
        }
      : {}),
  };

  const muxer = new Muxer(muxerOptions);

  function addVideoChunk({ chunk, meta }: EncodedChunk): void {
    muxer.addVideoChunk(chunk, meta);
  }

  function addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void {
    muxer.addAudioChunk(chunk, meta);
  }

  function finalize(): Blob {
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  }

  return { addVideoChunk, addAudioChunk, finalize };
}
