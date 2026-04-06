/**
 * audioAnalyserService.ts — Web Audio API 오디오 엔진 (싱글톤)
 *
 * 실시간 VU 미터 + 오디오 이펙트 처리 체인
 *
 * 신호 흐름:
 *   source → inputAnalyser → noiseGateGain
 *     → eqLow → eqMid → eqHigh → deesserFilter
 *     → compressor → compMakeupGain
 *     → [delay wet/dry] → delayMerger
 *     → [reverb wet/dry] → volumeGain → panner
 *     → master: mEqLow → mEqMid → mEqHigh → mDeesser
 *       → mCompressor → mCompGain
 *       → [mDelay wet/dry] → mDelayMerger
 *       → [mReverb wet/dry] → mGain
 *     → outputAnalyser → destination
 */

import { useEditRoomStore } from '../stores/editRoomStore';
import type { TrackAudioEffect } from '../types';
import { logger } from './LoggerService';

// ─── Types ───
export interface AudioLevels {
  rms: number;
  peak: number;
  dbRms: number;
  dbPeak: number;
}

/** 이펙트 처리 노드 세트 (나레이션/마스터 공용 구조) */
interface EffectNodes {
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  deesserFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  compMakeupGain: GainNode;
  delayNode: DelayNode;
  delayFeedbackGain: GainNode;
  delayWetGain: GainNode;
  delayDryGain: GainNode;
  delayMerger: GainNode;
  reverbConvolver: ConvolverNode;
  reverbWetGain: GainNode;
  reverbDryGain: GainNode;
  lastReverbDecay: number;
  lastReverbPreDelay: number;
}

interface ProcessingChain {
  source: MediaElementAudioSourceNode | null;
  inputAnalyser: AnalyserNode;
  inputAnalyserData: Float32Array;
  noiseGateGain: GainNode;
  narr: EffectNodes;
  volumeGain: GainNode;
  panner: StereoPannerNode;
  master: EffectNodes;
  masterGain: GainNode;
}

// ─── Singleton State ───
let ctx: AudioContext | null = null;
let outputAnalyser: AnalyserNode | null = null;
let outputAnalyserData: Float32Array | null = null;
let chain: ProcessingChain | null = null;
const connectedElements = new WeakSet<HTMLAudioElement>();
let noiseGateTimer: ReturnType<typeof setInterval> | null = null;
let storeUnsubscribe: (() => void) | null = null;

function createAnalyserBuffer(length: number): Float32Array {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
}

// ─── Impulse Response 생성 (리버브용) ───
function generateImpulseResponse(audioCtx: AudioContext, decay: number, preDelayMs: number): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * decay));
  const preDelaySamples = Math.floor(sampleRate * preDelayMs / 1000);
  const totalLength = length + preDelaySamples;
  const buffer = audioCtx.createBuffer(2, totalLength, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = preDelaySamples; i < totalLength; i++) {
      const t = (i - preDelaySamples) / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay * 2);
    }
  }
  return buffer;
}

// ─── 이펙트 노드 세트 생성 (재사용) ───
function createEffectNodes(audioCtx: AudioContext): EffectNodes {
  const eqLow = audioCtx.createBiquadFilter();
  eqLow.type = 'lowshelf'; eqLow.frequency.value = 320; eqLow.gain.value = 0;

  const eqMid = audioCtx.createBiquadFilter();
  eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1.0; eqMid.gain.value = 0;

  const eqHigh = audioCtx.createBiquadFilter();
  eqHigh.type = 'highshelf'; eqHigh.frequency.value = 3200; eqHigh.gain.value = 0;

  const deesserFilter = audioCtx.createBiquadFilter();
  deesserFilter.type = 'peaking'; deesserFilter.frequency.value = 6000; deesserFilter.Q.value = 2.0; deesserFilter.gain.value = 0;

  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = 0; compressor.ratio.value = 1;
  compressor.attack.value = 0.01; compressor.release.value = 0.1; compressor.knee.value = 10;

  const compMakeupGain = audioCtx.createGain();
  compMakeupGain.gain.value = 1;

  const delayNode = audioCtx.createDelay(5.0);
  delayNode.delayTime.value = 0;
  const delayFeedbackGain = audioCtx.createGain(); delayFeedbackGain.gain.value = 0;
  const delayWetGain = audioCtx.createGain(); delayWetGain.gain.value = 0;
  const delayDryGain = audioCtx.createGain(); delayDryGain.gain.value = 1;
  const delayMerger = audioCtx.createGain(); delayMerger.gain.value = 1;

  const reverbConvolver = audioCtx.createConvolver();
  reverbConvolver.buffer = generateImpulseResponse(audioCtx, 1.5, 20);
  const reverbWetGain = audioCtx.createGain(); reverbWetGain.gain.value = 0;
  const reverbDryGain = audioCtx.createGain(); reverbDryGain.gain.value = 1;

  // 이펙트 내부 연결: eqLow → eqMid → eqHigh → deesser → comp → compGain → [delay] → [reverb]
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(deesserFilter);
  deesserFilter.connect(compressor);
  compressor.connect(compMakeupGain);

  // Delay (parallel wet/dry)
  compMakeupGain.connect(delayDryGain);
  compMakeupGain.connect(delayNode);
  delayNode.connect(delayWetGain);
  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayNode);
  delayDryGain.connect(delayMerger);
  delayWetGain.connect(delayMerger);

  // Reverb (parallel wet/dry)
  delayMerger.connect(reverbDryGain);
  delayMerger.connect(reverbConvolver);
  reverbConvolver.connect(reverbWetGain);
  // reverbDryGain + reverbWetGain → 외부에서 다음 노드에 연결

  return {
    eqLow, eqMid, eqHigh, deesserFilter,
    compressor, compMakeupGain,
    delayNode, delayFeedbackGain, delayWetGain, delayDryGain, delayMerger,
    reverbConvolver, reverbWetGain, reverbDryGain,
    lastReverbDecay: 1.5, lastReverbPreDelay: 20,
  };
}

/** EffectNodes의 입력(eqLow)과 출력(reverbDry+reverbWet) 반환 */
function getEffectIO(nodes: EffectNodes) {
  return {
    input: nodes.eqLow,
    outputDry: nodes.reverbDryGain,
    outputWet: nodes.reverbWetGain,
  };
}

// ─── Processing Chain 생성 ───
function createChain(audioCtx: AudioContext, analyser: AnalyserNode): ProcessingChain {
  // Input level analyser (for noise gate)
  const inputAnalyser = audioCtx.createAnalyser();
  inputAnalyser.fftSize = 256;
  inputAnalyser.smoothingTimeConstant = 0.5;

  const noiseGateGain = audioCtx.createGain();
  noiseGateGain.gain.value = 1;

  // 나레이션 이펙트 체인
  const narr = createEffectNodes(audioCtx);
  const narrIO = getEffectIO(narr);

  // 나레이션 출력: volume → pan
  const volumeGain = audioCtx.createGain(); volumeGain.gain.value = 1;
  const panner = audioCtx.createStereoPanner(); panner.pan.value = 0;

  // 마스터 이펙트 체인
  const master = createEffectNodes(audioCtx);
  const masterIO = getEffectIO(master);

  // 마스터 출력 게인
  const masterGain = audioCtx.createGain(); masterGain.gain.value = 1;

  // ─── 전체 연결 ───
  // source → inputAnalyser → noiseGateGain → [나레이션 이펙트] → volumeGain → panner
  inputAnalyser.connect(noiseGateGain);
  noiseGateGain.connect(narrIO.input);
  narrIO.outputDry.connect(volumeGain);
  narrIO.outputWet.connect(volumeGain);
  volumeGain.connect(panner);

  // panner → [마스터 이펙트] → masterGain → outputAnalyser → destination
  panner.connect(masterIO.input);
  masterIO.outputDry.connect(masterGain);
  masterIO.outputWet.connect(masterGain);
  masterGain.connect(analyser);

  return {
    source: null,
    inputAnalyser,
    inputAnalyserData: createAnalyserBuffer(inputAnalyser.fftSize),
    noiseGateGain,
    narr,
    volumeGain, panner,
    master,
    masterGain,
  };
}

// ─── 이펙트 노드 세트에 파라미터 적용 ───
function applyEffectsToNodes(
  nodes: EffectNodes,
  effects: TrackAudioEffect[],
  bypass: boolean,
  t: number,
): void {
  const findFx = (type: string) =>
    !bypass ? effects.find(e => e.type === type && e.enabled) : undefined;

  const eq = findFx('eq');
  const comp = findFx('compressor');
  const reverb = findFx('reverb');
  const delay = findFx('delay');
  const deesser = findFx('deesser');

  // EQ
  nodes.eqLow.gain.setValueAtTime(eq ? (eq.params.lowGain ?? 0) : 0, t);
  nodes.eqMid.gain.setValueAtTime(eq ? (eq.params.midGain ?? 0) : 0, t);
  nodes.eqMid.frequency.setValueAtTime(eq ? (eq.params.midFreq ?? 1000) : 1000, t);
  nodes.eqHigh.gain.setValueAtTime(eq ? (eq.params.highGain ?? 0) : 0, t);

  // Compressor
  if (comp) {
    nodes.compressor.threshold.setValueAtTime(comp.params.threshold ?? -20, t);
    nodes.compressor.ratio.setValueAtTime(comp.params.ratio ?? 4, t);
    nodes.compressor.attack.setValueAtTime(Math.max(0.001, (comp.params.attack ?? 10) / 1000), t);
    nodes.compressor.release.setValueAtTime(Math.max(0.01, (comp.params.release ?? 100) / 1000), t);
    nodes.compMakeupGain.gain.setValueAtTime(Math.pow(10, (comp.params.gain ?? 0) / 20), t);
  } else {
    nodes.compressor.threshold.setValueAtTime(0, t);
    nodes.compressor.ratio.setValueAtTime(1, t);
    nodes.compMakeupGain.gain.setValueAtTime(1, t);
  }

  // De-esser
  if (deesser) {
    nodes.deesserFilter.frequency.setValueAtTime(deesser.params.frequency ?? 6000, t);
    nodes.deesserFilter.gain.setValueAtTime(-(deesser.params.reduction ?? 6), t);
    nodes.deesserFilter.Q.setValueAtTime(2.0, t);
  } else {
    nodes.deesserFilter.gain.setValueAtTime(0, t);
  }

  // Delay
  const delayMix = delay ? (delay.params.mix ?? 15) / 100 : 0;
  nodes.delayNode.delayTime.setValueAtTime(delay ? Math.max(0.001, (delay.params.time ?? 250) / 1000) : 0.001, t);
  nodes.delayFeedbackGain.gain.setValueAtTime(delay ? (delay.params.feedback ?? 30) / 100 : 0, t);
  nodes.delayWetGain.gain.setValueAtTime(delayMix, t);
  nodes.delayDryGain.gain.setValueAtTime(1 - delayMix, t);

  // Reverb
  const reverbMix = reverb ? (reverb.params.mix ?? 20) / 100 : 0;
  nodes.reverbWetGain.gain.setValueAtTime(reverbMix, t);
  nodes.reverbDryGain.gain.setValueAtTime(1 - reverbMix, t);
  if (reverb && ctx) {
    const decay = reverb.params.decay ?? 1.5;
    const preDelay = reverb.params.preDelay ?? 20;
    if (nodes.lastReverbDecay !== decay || nodes.lastReverbPreDelay !== preDelay) {
      nodes.reverbConvolver.buffer = generateImpulseResponse(ctx, decay, preDelay);
      nodes.lastReverbDecay = decay;
      nodes.lastReverbPreDelay = preDelay;
    }
  }
}

// ─── Store 동기화 ───
function syncEffects(): void {
  if (!chain || !ctx) return;
  const t = ctx.currentTime;
  const store = useEditRoomStore.getState();

  // 나레이션 이펙트
  const narrFx = store.trackEffects.narration;
  applyEffectsToNodes(chain.narr, narrFx.effects, narrFx.bypass, t);

  // 나레이션 볼륨/뮤트/팬
  const mixer = store.trackMixer.narration;
  const sceneOrder = store.sceneOrder;
  const sceneAudioSettings = store.sceneAudioSettings;
  let avgVol = 100;
  if (sceneOrder.length > 0) {
    const total = sceneOrder.reduce((sum, id) => sum + (sceneAudioSettings[id]?.volume ?? 100), 0);
    avgVol = total / sceneOrder.length;
  }
  chain.volumeGain.gain.setValueAtTime(mixer.mute ? 0 : avgVol / 100, t);
  chain.panner.pan.setValueAtTime((mixer.pan ?? 0) / 100, t);

  // 마스터 이펙트
  const masterFx = store.trackEffects.master;
  applyEffectsToNodes(chain.master, masterFx.effects, masterFx.bypass, t);

  // 마스터 뮤트
  const masterMixer = store.trackMixer.master;
  chain.masterGain.gain.setValueAtTime(masterMixer.mute ? 0 : 1, t);
}

// ─── Noise Gate 폴링 (10ms 간격) ───
function startNoiseGatePolling(): void {
  if (noiseGateTimer) return;
  noiseGateTimer = setInterval(() => {
    if (!chain || !ctx) return;
    const store = useEditRoomStore.getState();
    const narrFx = store.trackEffects.narration;
    const gateEffect = !narrFx.bypass
      ? narrFx.effects.find(e => e.type === 'noisegate' && e.enabled)
      : undefined;

    if (!gateEffect) {
      if (chain.noiseGateGain.gain.value < 0.99) {
        chain.noiseGateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.005);
      }
      return;
    }

    chain.inputAnalyser.getFloatTimeDomainData(chain.inputAnalyserData);
    let sumSq = 0;
    for (let i = 0; i < chain.inputAnalyserData.length; i++) {
      sumSq += chain.inputAnalyserData[i] * chain.inputAnalyserData[i];
    }
    const rms = Math.sqrt(sumSq / chain.inputAnalyserData.length);
    const dbLevel = rms <= 0.0001 ? -80 : 20 * Math.log10(rms);

    const threshold = gateEffect.params.threshold ?? -40;
    const attack = Math.max(0.001, (gateEffect.params.attack ?? 5) / 1000);
    const release = Math.max(0.01, (gateEffect.params.release ?? 50) / 1000);

    if (dbLevel > threshold) {
      chain.noiseGateGain.gain.setTargetAtTime(1, ctx.currentTime, attack);
    } else {
      chain.noiseGateGain.gain.setTargetAtTime(0, ctx.currentTime, release);
    }
  }, 10);
}

// ─── Store 구독 시작 ───
function startStoreSync(): void {
  if (storeUnsubscribe) return;
  storeUnsubscribe = useEditRoomStore.subscribe(() => {
    syncEffects();
  });
}

// ─── Context 초기화 ───
function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (!outputAnalyser) {
    outputAnalyser = ctx.createAnalyser();
    outputAnalyser.fftSize = 512;
    outputAnalyser.smoothingTimeConstant = 0.85;
    outputAnalyser.connect(ctx.destination);
    outputAnalyserData = createAnalyserBuffer(outputAnalyser.fftSize);
  }
  return ctx;
}

// ─── Public API ───

export function connectAudioToAnalyser(audio: HTMLAudioElement): void {
  if (connectedElements.has(audio)) return;

  const audioCtx = ensureContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (chain?.source) {
    try { chain.source.disconnect(); } catch (e) { logger.trackSwallowedError('AudioAnalyserService:connectAudioToAnalyser/disconnect', e); }
  }

  const source = audioCtx.createMediaElementSource(audio);

  if (!chain) {
    chain = createChain(audioCtx, outputAnalyser!);
    startStoreSync();
    startNoiseGatePolling();
  }

  source.connect(chain.inputAnalyser);
  chain.source = source;
  connectedElements.add(audio);
  syncEffects();
}

export function getAudioLevels(): AudioLevels {
  if (!outputAnalyser || !outputAnalyserData) {
    return { rms: 0, peak: 0, dbRms: -60, dbPeak: -60 };
  }

  outputAnalyser.getFloatTimeDomainData(outputAnalyserData);

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < outputAnalyserData.length; i++) {
    const v = outputAnalyserData[i];
    sumSq += v * v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }

  const rms = Math.sqrt(sumSq / outputAnalyserData.length);
  const toDb = (linear: number): number => {
    if (linear <= 0.0001) return -60;
    return Math.max(-60, 20 * Math.log10(linear));
  };

  return { rms, peak, dbRms: toDb(rms), dbPeak: toDb(peak) };
}
