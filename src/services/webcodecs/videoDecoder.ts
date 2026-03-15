/**
 * WebCodecs VideoDecoder 기반 정밀 프레임 추출
 *
 * mp4box.js로 MP4 demux → VideoDecoder로 프레임 정확 디코딩
 * canvas video.currentTime 시크 방식과 달리 키프레임 스냅 없이 정확한 PTS의 프레임을 추출
 *
 * 아키텍처:
 *   Blob → mp4box demux (샘플 메타데이터 + 파일 오프셋)
 *        → 타겟 타임코드별 가장 가까운 샘플 매핑
 *        → 키프레임 기준 디코드 그룹 생성
 *        → VideoDecoder로 키프레임부터 타겟까지 순차 디코딩
 *        → 타겟 프레임만 OffscreenCanvas로 캡처 (썸네일 + HD)
 */

import { createFile, DataStream } from 'mp4box';
import type { ISOFile, Sample, Movie, Track } from 'mp4box';
import type { VideoTimedFrame } from '../../types';
import type { VideoFrameExtractor } from './canvasRenderer';
import { logger } from '../LoggerService';

// ─── Feature Detection ───────────────────────────────

export function isVideoDecoderSupported(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

// ─── Helpers ─────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── MP4 Demux ───────────────────────────────────────

export interface DemuxResult {
  videoTrack: Track;
  samples: Sample[];
  description?: Uint8Array;
  arrayBuffer: ArrayBuffer;
}

/**
 * trak 박스 트리에서 코덱 설정 (avcC/hvcC/av1C/vpcC) 추출
 * VideoDecoder.configure()의 description 파라미터로 사용
 */
function extractDescription(mp4file: ISOFile, track: Track): Uint8Array | undefined {
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const moov = mp4file.moov as any;
    if (!moov?.traks) return undefined;

    const trak = (moov.traks as any[]).find(
      (t: any) => t.tkhd?.track_id === track.id,
    );
    if (!trak) return undefined;

    const entries = trak.mdia?.minf?.stbl?.stsd?.entries;
    if (!entries?.length) return undefined;

    const entry = entries[0];
    const configBox = entry.avcC || entry.hvcC || entry.av1C || entry.vpcC;
    if (!configBox) return undefined;

    // DataStream 직렬화 → 8바이트 박스 헤더 스킵
    const stream = new DataStream(undefined, 0, (DataStream as any).BIG_ENDIAN);
    configBox.write(stream);
    return new Uint8Array(stream.buffer as ArrayBuffer, 8);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (e) {
    console.warn('[VideoDecoder] description 추출 실패:', e);
    return undefined;
  }
}

/**
 * Blob → mp4box demux
 * 반환: 비디오 트랙 정보 + 샘플 메타데이터 (데이터는 ArrayBuffer에서 직접 읽음)
 */
export async function demuxMp4(blob: Blob): Promise<DemuxResult> {
  const arrayBuffer = await blob.arrayBuffer();

  const mp4file = createFile();
  let videoTrack: Track | null = null;
  let parseError: string | null = null;

  mp4file.onReady = (info: Movie) => {
    videoTrack = info.videoTracks[0] ?? null;
  };

  mp4file.onError = (module: string, message: string) => {
    parseError = `${module}: ${message}`;
  };

  // mp4box는 fileStart 프로퍼티가 있는 ArrayBuffer를 요구
  const mp4buf = arrayBuffer as ArrayBuffer & { fileStart: number };
  mp4buf.fileStart = 0;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  mp4file.appendBuffer(mp4buf as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  mp4file.flush();

  if (parseError) throw new Error(`MP4 파싱 오류: ${parseError}`);
  if (!videoTrack) throw new Error('비디오 트랙을 찾을 수 없습니다');

  const description = extractDescription(mp4file, videoTrack);
  const samples = mp4file.getTrackSamplesInfo(videoTrack.id);

  if (!samples?.length) throw new Error('샘플 정보를 찾을 수 없습니다');

  console.log(
    `[VideoDecoder] demux 완료: codec=${videoTrack.codec}, ` +
    `${videoTrack.video?.width}x${videoTrack.video?.height}, ` +
    `${samples.length}개 샘플, timescale=${videoTrack.timescale}`,
  );

  return { videoTrack, samples, description, arrayBuffer };
}

// ─── Video + Audio Merge (mp4box remux) ─────────────

/**
 * [FIX #316] 영상 전용 MP4 + 오디오 전용 M4A → 합본 MP4 생성
 * mp4box로 양쪽 demux → Muxer(mp4-muxer)로 트랙 복사 리먹싱
 * 디코딩/인코딩 없이 원본 비트스트림 그대로 복사 (품질 손실 0%)
 */
/**
 * [FIX #316] 영상 전용 MP4 + 오디오 전용 M4A → 합본 MP4 생성
 * ffmpeg.wasm `-c copy` 무손실 머지 — 원본 비트스트림 그대로 복사 (프레임 변형 0%)
 */
export async function mergeVideoAudio(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  const { loadFFmpeg } = await import('../ffmpegService');
  const { fetchFile } = await import('@ffmpeg/util');

  console.log(`[Merge] ffmpeg.wasm 로딩 중...`);
  const ffmpeg = await loadFFmpeg();

  // 입력 파일 쓰기
  await ffmpeg.writeFile('video.mp4', await fetchFile(videoBlob));
  await ffmpeg.writeFile('audio.m4a', await fetchFile(audioBlob));

  // -c copy: 디코딩/인코딩 없이 원본 비트스트림 그대로 합치기
  console.log(`[Merge] ffmpeg -c copy 실행 중...`);
  await ffmpeg.exec([
    '-i', 'video.mp4',
    '-i', 'audio.m4a',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-y', 'merged.mp4',
  ]);

  const data = await ffmpeg.readFile('merged.mp4') as Uint8Array;
  // 정리
  await ffmpeg.deleteFile('video.mp4').catch(() => {});
  await ffmpeg.deleteFile('audio.m4a').catch(() => {});
  await ffmpeg.deleteFile('merged.mp4').catch(() => {});

  const merged = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  console.log(`[Merge] ✅ 영상(${(videoBlob.size / 1024 / 1024).toFixed(1)}MB) + 오디오(${(audioBlob.size / 1024 / 1024).toFixed(1)}MB) → 합본(${(merged.size / 1024 / 1024).toFixed(1)}MB)`);
  return merged;
}

// ─── Decode Group Builder ────────────────────────────

interface DecodeGroup {
  keyframeIndex: number;
  lastSampleIndex: number;
  /** sampleIndex → 요청된 원본 타임코드(초) */
  targets: Map<number, number>;
}

/**
 * 요청된 타임코드들을 키프레임 기준으로 그룹화
 *
 * 같은 키프레임 뒤에 있는 타임코드들은 하나의 디코드 패스로 처리 가능
 * → 중복 디코딩 최소화
 */
function buildDecodeGroups(samples: Sample[], timecodes: number[]): DecodeGroup[] {
  const timescale = samples[0]?.timescale ?? 1;

  // 키프레임 인덱스 수집
  const keyframeIndices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].is_sync) keyframeIndices.push(i);
  }
  // 키프레임이 하나도 없으면 첫 샘플을 키프레임으로 간주
  if (keyframeIndices.length === 0 && samples.length > 0) {
    keyframeIndices.push(0);
  }

  // 샘플 CTS → 초 변환 배열 (반복 계산 방지)
  const sampleTimeSecs = samples.map(s => s.cts / timescale);

  const groupMap = new Map<number, DecodeGroup>();

  for (const tc of timecodes) {
    // 가장 가까운 샘플 찾기 (이진 탐색)
    let bestIdx = 0;
    let bestDist = Infinity;
    // 이진 탐색으로 근접 샘플 찾기
    let lo = 0;
    let hi = samples.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const dist = Math.abs(sampleTimeSecs[mid] - tc);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = mid;
      }
      if (sampleTimeSecs[mid] < tc) lo = mid + 1;
      else hi = mid - 1;
    }

    // 선행 키프레임 찾기 (이진 탐색)
    let kfIdx = keyframeIndices[0];
    let kLo = 0;
    let kHi = keyframeIndices.length - 1;
    while (kLo <= kHi) {
      const mid = (kLo + kHi) >>> 1;
      if (keyframeIndices[mid] <= bestIdx) {
        kfIdx = keyframeIndices[mid];
        kLo = mid + 1;
      } else {
        kHi = mid - 1;
      }
    }

    if (!groupMap.has(kfIdx)) {
      groupMap.set(kfIdx, {
        keyframeIndex: kfIdx,
        lastSampleIndex: bestIdx,
        targets: new Map([[bestIdx, tc]]),
      });
    } else {
      const g = groupMap.get(kfIdx)!;
      g.lastSampleIndex = Math.max(g.lastSampleIndex, bestIdx);
      g.targets.set(bestIdx, tc);
    }
  }

  return Array.from(groupMap.values()).sort(
    (a, b) => a.keyframeIndex - b.keyframeIndex,
  );
}

// ─── VideoDecoder Frame Extraction ───────────────────

/**
 * WebCodecs VideoDecoder 기반 정밀 프레임 추출
 *
 * @param blob MP4 비디오 Blob (yt-dlp 다운로드 또는 업로드 파일)
 * @param timecodes 추출할 타임코드 배열 (초 단위)
 * @param options 썸네일 너비, JPEG 품질
 * @returns 타임코드별 프레임 (썸네일 + HD)
 */
export async function webcodecExtractFrames(
  blob: Blob,
  timecodes: number[],
  options?: { thumbWidth?: number; hdQuality?: number; thumbQuality?: number },
): Promise<VideoTimedFrame[]> {
  const thumbWidth = options?.thumbWidth ?? 640;
  const hdQuality = options?.hdQuality ?? 0.97;
  const thumbQuality = options?.thumbQuality ?? 0.9;

  const t0 = performance.now();
  console.log(
    `[VideoDecoder] 정밀 추출 시작: ${timecodes.length}개 타임코드, ` +
    `blob=${(blob.size / 1024 / 1024).toFixed(1)}MB`,
  );

  // 1. MP4 demux → 트랙 정보 + 샘플 메타데이터
  const { videoTrack, samples, description, arrayBuffer } = await demuxMp4(blob);
  const timescale = videoTrack.timescale;
  const vw = videoTrack.video?.width ?? 1920;
  const vh = videoTrack.video?.height ?? 1080;

  // 2. VideoDecoder 설정 확인
  const decoderConfig: VideoDecoderConfig = {
    codec: videoTrack.codec,
    codedWidth: vw,
    codedHeight: vh,
    ...(description ? { description } : {}),
  };

  const support = await VideoDecoder.isConfigSupported(decoderConfig);
  if (!support.supported) {
    throw new Error(`코덱 미지원: ${videoTrack.codec}`);
  }

  // 3. 디코드 그룹 생성
  const groups = buildDecodeGroups(samples, timecodes);
  console.log(
    `[VideoDecoder] ${groups.length}개 디코드 그룹, ` +
    `키프레임 ${samples.filter(s => s.is_sync).length}개`,
  );

  // 4. 그룹별 디코딩 + 프레임 캡처
  const allFrames: VideoTimedFrame[] = [];
  let groupIdx = 0;

  for (const group of groups) {
    groupIdx++;

    // 타겟 타임스탬프 매핑 (마이크로초 → 원본 타임코드 초)
    const targetTsMicro = new Map<number, number>();
    for (const [sampleIdx, tc] of group.targets) {
      const tsMicro = Math.round((samples[sampleIdx].cts / timescale) * 1_000_000);
      targetTsMicro.set(tsMicro, tc);
    }

    const pendingFrames: Array<{ timeSec: number; frame: VideoFrame }> = [];
    let decoderError: Error | null = null;

    const decoder = new VideoDecoder({
      output(frame) {
        const fTs = frame.timestamp;
        // 1ms(1000μs) 허용 범위 내에서 타겟 매칭
        for (const [targetUs, tcSec] of targetTsMicro) {
          if (Math.abs(fTs - targetUs) <= 1000) {
            pendingFrames.push({ timeSec: tcSec, frame });
            targetTsMicro.delete(targetUs);
            return;
          }
        }
        // 타겟이 아닌 프레임은 즉시 해제
        frame.close();
      },
      error(e) {
        decoderError = e;
        console.error(`[VideoDecoder] 그룹 ${groupIdx} 디코딩 에러:`, e);
      },
    });

    decoder.configure(decoderConfig);

    // 키프레임부터 마지막 타겟 샘플까지 순차 피딩
    const sampleCount = group.lastSampleIndex - group.keyframeIndex + 1;
    for (let i = group.keyframeIndex; i <= group.lastSampleIndex; i++) {
      if (decoderError) break;

      const s = samples[i];
      // 범위 체크
      if (s.offset + s.size > arrayBuffer.byteLength) {
        console.warn(
          `[VideoDecoder] 샘플 범위 초과: idx=${i}, offset=${s.offset}, size=${s.size}`,
        );
        continue;
      }

      const data = new Uint8Array(arrayBuffer, s.offset, s.size);

      const chunk = new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round((s.cts / timescale) * 1_000_000),
        duration: Math.round((s.duration / timescale) * 1_000_000),
        data,
      });

      decoder.decode(chunk);
    }

    // 디코더 플러시 (모든 출력 프레임 대기)
    try {
      await decoder.flush();
    } catch (e) {
      console.warn(`[VideoDecoder] 그룹 ${groupIdx} flush 에러:`, e);
    }
    decoder.close();

    console.log(
      `[VideoDecoder] 그룹 ${groupIdx}/${groups.length}: ` +
      `샘플 ${sampleCount}개 디코딩 → ${pendingFrames.length}/${group.targets.size}개 캡처`,
    );

    // 캡처된 프레임 → 썸네일 + HD data URL 변환
    for (const pf of pendingFrames) {
      try {
        const fw = pf.frame.displayWidth;
        const fh = pf.frame.displayHeight;

        // ── HD (원본 해상도) ──
        const hdCanvas = new OffscreenCanvas(fw, fh);
        const hdCtx = hdCanvas.getContext('2d');
        if (!hdCtx) { pf.frame.close(); continue; }
        hdCtx.drawImage(pf.frame, 0, 0);
        pf.frame.close(); // GPU 메모리 즉시 해제

        const hdBlob = await hdCanvas.convertToBlob({ type: 'image/jpeg', quality: hdQuality });
        const hdUrl = await blobToDataUrl(hdBlob);

        // ── 썸네일 (640px 기준 스케일) ──
        const scale = Math.min(1, thumbWidth / fw);
        const tw = Math.round(fw * scale);
        const th = Math.round(fh * scale);
        const thumbCanvas = new OffscreenCanvas(tw, th);
        const thumbCtx = thumbCanvas.getContext('2d');
        if (!thumbCtx) { allFrames.push({ url: hdUrl, hdUrl, timeSec: pf.timeSec }); continue; }
        thumbCtx.drawImage(hdCanvas, 0, 0, tw, th);
        const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: thumbQuality });
        const thumbUrl = await blobToDataUrl(thumbBlob);

        allFrames.push({ url: thumbUrl, hdUrl, timeSec: pf.timeSec });
      } catch (e) {
        logger.trackSwallowedError('videoDecoder:renderFrame', e);
        try { pf.frame.close(); } catch { /* already closed */ }
      }
    }
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[VideoDecoder] 정밀 추출 완료: ${allFrames.length}/${timecodes.length}개 프레임, ${elapsed}초`,
  );

  return allFrames.sort((a, b) => a.timeSec - b.timeSec);
}

// ─── Streaming VideoDecoder (Composition Pipeline) ───

/**
 * 스트리밍 방식 WebCodecs VideoDecoder 기반 VideoFrameExtractor
 *
 * MP4 컴포지션 파이프라인용 — 순차 전방 접근 패턴에 최적화
 * - 디코더를 플러시 없이 유지하여 O(1) 순차 접근
 * - 후방 탐색 시 키프레임부터 재디코딩
 * - ImageBitmap 링 버퍼로 메모리 제한 (최대 15프레임 ≈ 120MB @1080p)
 */
export async function createStreamingVideoExtractor(
  blob: Blob,
): Promise<VideoFrameExtractor & { dispose(): void }> {
  const { videoTrack, samples, description, arrayBuffer } = await demuxMp4(blob);
  const timescale = videoTrack.timescale;
  const vw = videoTrack.video?.width ?? 1920;
  const vh = videoTrack.video?.height ?? 1080;

  const lastSample = samples[samples.length - 1];
  const duration = (lastSample.cts + lastSample.duration) / timescale;

  const sampleTimeSecs = samples.map(s => s.cts / timescale);

  const keyframeIndices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].is_sync) keyframeIndices.push(i);
  }
  if (keyframeIndices.length === 0 && samples.length > 0) keyframeIndices.push(0);

  const decoderConfig: VideoDecoderConfig = {
    codec: videoTrack.codec,
    codedWidth: vw,
    codedHeight: vh,
    ...(description ? { description } : {}),
  };

  const support = await VideoDecoder.isConfigSupported(decoderConfig);
  if (!support.supported) throw new Error(`코덱 미지원: ${videoTrack.codec}`);

  // ─── State ──────────────────────────────────────────
  const CACHE_SIZE = 15;
  const frameCache = new Map<number, ImageBitmap>();
  const cacheOrder: number[] = [];
  let decoder: VideoDecoder | null = null;
  let nextSampleToFeed = 0;
  let disposed = false;
  let decoderGeneration = 0;

  // [FIX #297] 연속 실패 감지 — 디코더 고장 시 30초×N 대기 방지
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  // 적응형 타임아웃: 실패할수록 짧아짐 (30s → 5s → 2s → 즉시 포기)
  const ADAPTIVE_TIMEOUTS = [30_000, 5_000, 2_000];

  let pendingTarget: {
    sampleIdx: number;
    resolve: (bmp: ImageBitmap) => void;
    reject: (err: Error) => void;
  } | null = null;

  // ─── Helpers ────────────────────────────────────────
  function findClosestSample(timeSec: number): number {
    let lo = 0, hi = samples.length - 1, bestIdx = 0, bestDist = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const dist = Math.abs(sampleTimeSecs[mid] - timeSec);
      if (dist < bestDist) { bestDist = dist; bestIdx = mid; }
      if (sampleTimeSecs[mid] < timeSec) lo = mid + 1;
      else hi = mid - 1;
    }
    return bestIdx;
  }

  function findPrecedingKeyframe(sampleIdx: number): number {
    let kfIdx = keyframeIndices[0];
    let lo = 0, hi = keyframeIndices.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (keyframeIndices[mid] <= sampleIdx) { kfIdx = keyframeIndices[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return kfIdx;
  }

  function mapTimestampToSampleIdx(timestampUs: number): number {
    const timeSec = timestampUs / 1_000_000;
    return findClosestSample(timeSec);
  }

  function evictCache(): void {
    while (cacheOrder.length > CACHE_SIZE) {
      const oldest = cacheOrder.shift()!;
      const bmp = frameCache.get(oldest);
      if (bmp) { bmp.close(); frameCache.delete(oldest); }
    }
  }

  function removeFromCache(sampleIdx: number): ImageBitmap | undefined {
    const bmp = frameCache.get(sampleIdx);
    if (bmp) {
      frameCache.delete(sampleIdx);
      const idx = cacheOrder.indexOf(sampleIdx);
      if (idx >= 0) cacheOrder.splice(idx, 1);
    }
    return bmp;
  }

  function initDecoder(startFromKeyframe: number): void {
    if (decoder && decoder.state !== 'closed') {
      try { decoder.close(); } catch { /* ignore */ }
    }

    decoderGeneration++;
    const myGen = decoderGeneration;

    decoder = new VideoDecoder({
      output(frame: VideoFrame) {
        const sampleIdx = mapTimestampToSampleIdx(frame.timestamp);
        createImageBitmap(frame).then(bmp => {
          frame.close();
          // Guard: stale generation or disposed
          if (disposed || myGen !== decoderGeneration) { bmp.close(); return; }

          if (pendingTarget && sampleIdx === pendingTarget.sampleIdx) {
            pendingTarget.resolve(bmp);
            pendingTarget = null;
          } else {
            const existing = frameCache.get(sampleIdx);
            if (existing) existing.close();
            frameCache.set(sampleIdx, bmp);
            cacheOrder.push(sampleIdx);
            evictCache();
          }
        }).catch(() => {
          frame.close();
          if (disposed || myGen !== decoderGeneration) return;
          if (pendingTarget && sampleIdx === pendingTarget.sampleIdx) {
            pendingTarget.reject(new Error(`프레임 변환 실패: sample=${sampleIdx}`));
            pendingTarget = null;
          }
        });
      },
      error(e: DOMException) {
        if (myGen !== decoderGeneration) return;
        if (pendingTarget) {
          pendingTarget.reject(new Error(`디코더 에러: ${e.message}`));
          pendingTarget = null;
        }
      },
    });

    decoder.configure(decoderConfig);
    nextSampleToFeed = startFromKeyframe;
  }

  function feedSample(idx: number): void {
    if (!decoder || decoder.state === 'closed') return;
    const s = samples[idx];
    if (s.offset + s.size > arrayBuffer.byteLength) return;

    const data = new Uint8Array(arrayBuffer, s.offset, s.size);
    const chunk = new EncodedVideoChunk({
      type: s.is_sync ? 'key' : 'delta',
      timestamp: Math.round((s.cts / timescale) * 1_000_000),
      duration: Math.round((s.duration / timescale) * 1_000_000),
      data,
    });
    decoder.decode(chunk);
  }

  // ─── Init log ───────────────────────────────────────
  console.log(
    `[StreamingDecoder] 초기화: codec=${videoTrack.codec}, ` +
    `${vw}x${vh}, ${samples.length}개 샘플, duration=${duration.toFixed(2)}s`,
  );

  return {
    duration,

    async getFrameAt(timeSec: number): Promise<ImageBitmap> {
      if (disposed) throw new Error('디코더가 이미 해제됨');

      // [FIX #297] 연속 실패 감지: 디코더가 완전히 고장난 경우 즉시 포기
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(`디코더 연속 ${MAX_CONSECUTIVE_FAILURES}회 실패, 추가 시도 중단`);
      }

      const clampedTime = Math.max(0, Math.min(timeSec, duration));
      const targetIdx = findClosestSample(clampedTime);

      // 1. Cache hit
      const cached = removeFromCache(targetIdx);
      if (cached) { consecutiveFailures = 0; return cached; }

      // 2. Decoder reset needed?
      const precedingKf = findPrecedingKeyframe(targetIdx);
      const needReset =
        !decoder ||
        decoder.state === 'closed' ||
        targetIdx < nextSampleToFeed; // backward seek (already passed)

      if (needReset) {
        initDecoder(precedingKf);
      }

      // 3. Feed samples up to target
      while (nextSampleToFeed <= targetIdx) {
        feedSample(nextSampleToFeed);
        nextSampleToFeed++;
      }

      // 4. Check cache again (output callback might have delivered synchronously)
      const cached2 = removeFromCache(targetIdx);
      if (cached2) { consecutiveFailures = 0; return cached2; }

      // 5. Wait for output callback
      // [FIX #297] 적응형 타임아웃: 실패할수록 짧아짐 (30s → 5s → 2s)
      const timeoutMs = ADAPTIVE_TIMEOUTS[Math.min(consecutiveFailures, ADAPTIVE_TIMEOUTS.length - 1)];
      return new Promise<ImageBitmap>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pendingTarget?.sampleIdx === targetIdx) {
            pendingTarget = null;
            consecutiveFailures++;
            reject(new Error(`프레임 디코딩 타임아웃: ${timeSec.toFixed(3)}s (${timeoutMs}ms, 연속실패 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`));
          }
        }, timeoutMs);

        pendingTarget = {
          sampleIdx: targetIdx,
          resolve: (bmp) => { clearTimeout(timer); consecutiveFailures = 0; resolve(bmp); },
          reject: (err) => { clearTimeout(timer); consecutiveFailures++; reject(err); },
        };
      });
    },

    dispose(): void {
      disposed = true;
      if (decoder && decoder.state !== 'closed') {
        try { decoder.close(); } catch { /* ignore */ }
      }
      for (const bmp of frameCache.values()) bmp.close();
      frameCache.clear();
      cacheOrder.length = 0;
      pendingTarget = null;
    },
  };
}
