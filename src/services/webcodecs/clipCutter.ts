/**
 * clipCutter.ts
 * WebCodecs 기반 영상 빠른 자르기 — 디코딩/인코딩 없이 샘플 리먹싱
 * [FIX #302] 편집점 기반 클립 자르기 → ZIP 다운로드
 *
 * 원리: mp4box로 소스 MP4 demux → 편집점별 샘플 추출 → mp4-muxer로 리먹싱
 * 디코딩/인코딩 없이 원본 비트스트림 그대로 복사 → 품질 손실 0%, 속도 최대
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Sample, Track } from 'mp4box';
import { demuxMp4, isVideoDecoderSupported } from './videoDecoder';
import { logger } from '../LoggerService';

export interface ClipRange {
  label: string;
  startSec: number;
  endSec: number;
}

/**
 * WebCodecs 기반 클립 자르기가 가능한지 확인
 */
export function isClipCutSupported(): boolean {
  return isVideoDecoderSupported() && typeof EncodedVideoChunk !== 'undefined';
}

/**
 * 소스 영상에서 편집점 기반으로 클립들을 잘라 ZIP Blob 반환
 * 리먹싱 방식: 원본 H.264 비트스트림 그대로 복사 (품질 손실 없음)
 */
export async function cutClips(
  sourceFile: File,
  clips: ClipRange[],
  onProgress?: (progress: number, message: string) => void,
): Promise<Blob> {
  onProgress?.(0, '소스 영상 분석 중...');

  // 1. Demux source MP4
  const { videoTrack, samples, description, arrayBuffer } = await demuxMp4(sourceFile);
  const timescale = videoTrack.timescale;
  const width = videoTrack.video?.width ?? 1920;
  const height = videoTrack.video?.height ?? 1080;

  // H.264(avc) 여부 확인 — 리먹싱은 동일 코덱 전제
  const codec = videoTrack.codec;
  if (!codec.startsWith('avc')) {
    throw new Error(`리먹싱은 H.264(avc) 코덱만 지원합니다. 현재: ${codec}`);
  }

  // 2. 클립별 리먹싱
  const clipBlobs: Array<{ name: string; blob: Blob }> = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    onProgress?.(
      Math.round(((i) / clips.length) * 90) + 5,
      `클립 ${i + 1}/${clips.length} 자르는 중... (${clip.label})`,
    );

    const blob = remuxClip(samples, arrayBuffer, timescale, width, height, description, clip);
    const safeName = clip.label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    clipBlobs.push({ name: `${String(i + 1).padStart(3, '0')}_${safeName}.mp4`, blob });
  }

  // 3. ZIP 패키징
  onProgress?.(95, 'ZIP 파일 생성 중...');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const { name, blob } of clipBlobs) {
    zip.file(name, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  onProgress?.(100, '완료!');
  logger.info('[ClipCutter] 클립 자르기 완료', { clips: clips.length, zipSizeMB: (zipBlob.size / 1024 / 1024).toFixed(1) });
  return zipBlob;
}

/**
 * 단일 클립 리먹싱 — 디코딩/인코딩 없이 샘플 데이터 직접 복사
 *
 * [FIX] B-프레임이 있는 H.264 영상 대응:
 *   mp4-muxer는 timestamp를 DTS로 취급하므로 반드시 단조 증가해야 함.
 *   CTS(표시 순서)는 B-프레임에서 역행할 수 있으므로,
 *   addVideoChunkRaw(data, type, DTS, duration, meta, compositionTimeOffset)를 사용하여
 *   DTS(디코드 순서, 항상 단조 증가) + compositionTimeOffset(CTS-DTS) 분리 전달.
 */
function remuxClip(
  samples: Sample[],
  arrayBuffer: ArrayBuffer,
  timescale: number,
  width: number,
  height: number,
  description: Uint8Array | undefined,
  clip: ClipRange,
): Blob {
  const startTicks = clip.startSec * timescale;
  const endTicks = clip.endSec * timescale;

  // 선행 키프레임 찾기 (이진 탐색)
  let startIdx = 0;
  for (let j = samples.length - 1; j >= 0; j--) {
    if (samples[j].cts <= startTicks && samples[j].is_sync) {
      startIdx = j;
      break;
    }
  }

  // endSec 이후 첫 샘플 (또는 마지막 샘플)
  let endIdx = samples.length - 1;
  for (let j = startIdx; j < samples.length; j++) {
    if (samples[j].cts > endTicks) {
      endIdx = j - 1;
      break;
    }
  }

  if (endIdx < startIdx) endIdx = startIdx;

  // DTS 기준 시작 오프셋 (DTS는 항상 단조 증가 → mp4-muxer 호환)
  const baseDtsTicks = samples[startIdx].dts;

  // mp4-muxer 생성 (비디오 전용)
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    video: { codec: 'avc', width, height },
  });

  // 샘플 리먹싱 — addVideoChunkRaw로 DTS + compositionTimeOffset 분리 전달
  let isFirst = true;
  for (let j = startIdx; j <= endIdx; j++) {
    const s = samples[j];
    if (s.offset + s.size > arrayBuffer.byteLength) continue;

    // DTS 기반 타임스탬프 (항상 단조 증가)
    const dtsMicro = Math.max(0, Math.round(((s.dts - baseDtsTicks) / timescale) * 1_000_000));
    const durationMicro = Math.round((s.duration / timescale) * 1_000_000);
    // compositionTimeOffset = (CTS - DTS) → B-프레임에서 음수 가능
    const ctOffsetMicro = Math.round(((s.cts - s.dts) / timescale) * 1_000_000);

    const data = new Uint8Array(arrayBuffer, s.offset, s.size);
    const type: 'key' | 'delta' = s.is_sync ? 'key' : 'delta';

    // 첫 청크에 코덱 description 전달 (avcC 데이터)
    const meta = isFirst && description
      ? { decoderConfig: { codec: 'avc1.640028', description } } as EncodedVideoChunkMetadata
      : undefined;

    muxer.addVideoChunkRaw(data, type, dtsMicro, durationMicro, meta, ctOffsetMicro);
    isFirst = false;
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}
