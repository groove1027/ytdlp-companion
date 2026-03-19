/**
 * #633 편집실 WebCodecs 영상 자르기 검증
 *
 * 실제 B-프레임 H.264 MP4 샘플에서
 * 1) 기존 잘못된 계산은 음수 DTS를 만든다는 점을 재현하고
 * 2) 현재 계산은 decode timestamp를 단조 증가로 유지하며
 * 3) mp4-muxer 실제 remux 호출까지 통과하는지 확인한다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { createFile, DataStream } from '../src/node_modules/mp4box/dist/mp4box.all.js';
import { ArrayBufferTarget, Muxer } from '../src/node_modules/mp4-muxer/build/mp4-muxer.mjs';
import { buildMuxVideoTiming } from '../src/services/webcodecs/muxVideoTiming.ts';

const SAMPLE_PATH = path.join(process.cwd(), 'test', 'output', 'grok10s_evolink.mp4');

function fail(message) {
  throw new Error(message);
}

function extractDescription(mp4file, track) {
  const trak = mp4file.moov?.traks?.find((item) => item.tkhd?.track_id === track.id);
  const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const configBox = entry?.avcC || entry?.hvcC || entry?.av1C || entry?.vpcC;
  if (!configBox) return undefined;

  const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
  configBox.write(stream);
  return new Uint8Array(stream.buffer, 8);
}

async function demuxSample() {
  const fileBytes = await fs.readFile(SAMPLE_PATH);
  const mp4file = createFile();
  let videoTrack = null;

  mp4file.onReady = (info) => {
    videoTrack = info.videoTracks[0] ?? null;
  };

  const buffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);
  buffer.fileStart = 0;
  mp4file.appendBuffer(buffer);
  mp4file.flush();

  if (!videoTrack) {
    fail('비디오 트랙을 찾을 수 없습니다.');
  }

  const samples = mp4file.getTrackSamplesInfo(videoTrack.id);
  if (!samples?.length) {
    fail('샘플 정보를 읽지 못했습니다.');
  }

  return {
    arrayBuffer: buffer,
    description: extractDescription(mp4file, videoTrack),
    samples,
    videoTrack,
  };
}

function getClipSamples(samples, timescale, startSec, endSec) {
  const startTicks = startSec * timescale;
  const endTicks = endSec * timescale;

  let startIdx = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].cts <= startTicks && samples[i].is_sync) {
      startIdx = i;
      break;
    }
  }

  let endIdx = samples.length - 1;
  for (let i = startIdx; i < samples.length; i++) {
    if (samples[i].cts > endTicks) {
      endIdx = i - 1;
      break;
    }
  }

  if (endIdx < startIdx) endIdx = startIdx;
  return samples.slice(startIdx, endIdx + 1).sort((a, b) => a.dts - b.dts);
}

async function main() {
  const { arrayBuffer, description, samples, videoTrack } = await demuxSample();
  const timescale = videoTrack.timescale;
  const clipSamples = getClipSamples(samples, timescale, 0.5, 4.5);

  if (clipSamples.length < 5) {
    fail(`검증용 클립 샘플이 너무 적습니다: ${clipSamples.length}`);
  }

  const baseDtsTicks = clipSamples[0].dts;

  let oldDecodeWentNegative = false;
  let prevDecodeTs = -Infinity;
  for (const sample of clipSamples) {
    const oldTimestampMicro = Math.max(0, Math.round(((sample.dts - baseDtsTicks) / timescale) * 1_000_000));
    const ctOffsetMicro = Math.round(((sample.cts - sample.dts) / timescale) * 1_000_000);
    const oldDecodeTs = oldTimestampMicro - ctOffsetMicro;
    if (oldDecodeTs < 0 || oldDecodeTs < prevDecodeTs) {
      oldDecodeWentNegative = true;
      break;
    }
    prevDecodeTs = oldDecodeTs;
  }

  if (!oldDecodeWentNegative) {
    fail('기존 계산식이 실패를 재현하지 못했습니다. 검증 샘플을 다시 확인해야 합니다.');
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    video: {
      codec: 'avc',
      width: videoTrack.video?.width ?? 1920,
      height: videoTrack.video?.height ?? 1080,
    },
  });

  let lastDecodeTimestampMicro = -Infinity;
  let wroteChunks = 0;

  for (const [index, sample] of clipSamples.entries()) {
    if (sample.offset + sample.size > arrayBuffer.byteLength) continue;

    const timing = buildMuxVideoTiming(sample, timescale, baseDtsTicks);
    if (timing.decodeTimestampMicro < 0) {
      fail(`수정 후에도 음수 DTS가 생성되었습니다: ${timing.decodeTimestampMicro}`);
    }
    if (timing.decodeTimestampMicro < lastDecodeTimestampMicro) {
      fail(`수정 후에도 DTS가 역행했습니다: ${lastDecodeTimestampMicro} -> ${timing.decodeTimestampMicro}`);
    }

    const meta = index === 0 && description
      ? { decoderConfig: { codec: videoTrack.codec, description } }
      : undefined;

    muxer.addVideoChunkRaw(
      new Uint8Array(arrayBuffer, sample.offset, sample.size),
      sample.is_sync ? 'key' : 'delta',
      timing.timestampMicro,
      timing.durationMicro,
      meta,
      timing.compositionTimeOffsetMicro,
    );

    lastDecodeTimestampMicro = timing.decodeTimestampMicro;
    wroteChunks += 1;
  }

  muxer.finalize();

  if (wroteChunks === 0) {
    fail('리먹싱에 사용된 샘플이 없습니다.');
  }
  if (!(target.buffer instanceof ArrayBuffer) || target.buffer.byteLength === 0) {
    fail('리먹싱 결과 MP4가 비어 있습니다.');
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║     #633 Edit Room Clip Cut Verification         ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`sample: ${path.basename(SAMPLE_PATH)}`);
  console.log(`codec: ${videoTrack.codec}`);
  console.log(`timescale: ${timescale}`);
  console.log(`clip samples: ${clipSamples.length}`);
  console.log(`old formula failure reproduced: yes`);
  console.log(`new muxed bytes: ${target.buffer.byteLength}`);
  console.log('result: PASS');
}

main().catch((error) => {
  console.error('[verify-editroom-clipcut-633] FAILED');
  console.error(error);
  process.exit(1);
});
