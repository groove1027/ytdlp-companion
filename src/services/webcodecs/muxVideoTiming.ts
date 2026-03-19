export interface MuxVideoSample {
  cts: number;
  dts: number;
  duration: number;
}

export interface MuxVideoTiming {
  timestampMicro: number;
  durationMicro: number;
  compositionTimeOffsetMicro: number;
  decodeTimestampMicro: number;
}

/**
 * mp4-muxer의 video timestamp는 PTS(표시 시각)이며,
 * decode timestamp는 timestamp - compositionTimeOffset으로 계산된다.
 */
export function buildMuxVideoTiming(
  sample: MuxVideoSample,
  timescale: number,
  baseDtsTicks: number,
): MuxVideoTiming {
  const timestampMicro = Math.max(0, Math.round(((sample.cts - baseDtsTicks) / timescale) * 1_000_000));
  const durationMicro = Math.max(0, Math.round((sample.duration / timescale) * 1_000_000));
  const compositionTimeOffsetMicro = Math.round(((sample.cts - sample.dts) / timescale) * 1_000_000);

  return {
    timestampMicro,
    durationMicro,
    compositionTimeOffsetMicro,
    decodeTimestampMicro: timestampMicro - compositionTimeOffsetMicro,
  };
}
