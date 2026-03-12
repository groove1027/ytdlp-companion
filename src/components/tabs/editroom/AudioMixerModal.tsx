import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { getAudioLevels } from '../../../services/audioAnalyserService';
import type { AudioTrackId, AudioEffectType, TrackAudioEffect } from '../../../types';

/** dB 변환: volume% → dB */
function volToDb(vol: number): number {
  if (vol <= 0) return -60;
  return Math.max(-60, Math.min(6, 20 * Math.log10(vol / 100)));
}

/** dB → volume% 역변환 */
function dbToVol(db: number): number {
  if (db <= -60) return 0;
  return Math.round(Math.pow(10, db / 20) * 100);
}

/** dB → 미터 퍼센트 (0~100) */
function dbToPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db + 60) / 66) * 100));
}

const DB_MARKS = [6, 0, -6, -12, -24, -48, -60];

const EFFECT_DEFAULTS: Record<AudioEffectType, { label: string; icon: string; params: Record<string, { value: number; min: number; max: number; step: number; unit: string }> }> = {
  eq: { label: 'EQ', icon: '🎚', params: {
    lowGain: { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
    midGain: { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
    highGain: { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
    midFreq: { value: 1000, min: 200, max: 8000, step: 100, unit: 'Hz' },
  }},
  compressor: { label: '컴프레서', icon: '⚡', params: {
    threshold: { value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
    ratio: { value: 4, min: 1, max: 20, step: 0.5, unit: ':1' },
    attack: { value: 10, min: 0.1, max: 100, step: 0.5, unit: 'ms' },
    release: { value: 100, min: 10, max: 1000, step: 10, unit: 'ms' },
    gain: { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
  }},
  reverb: { label: '리버브', icon: '🏛', params: {
    mix: { value: 20, min: 0, max: 100, step: 1, unit: '%' },
    decay: { value: 1.5, min: 0.1, max: 10, step: 0.1, unit: 's' },
    preDelay: { value: 20, min: 0, max: 200, step: 5, unit: 'ms' },
  }},
  delay: { label: '딜레이', icon: '🔄', params: {
    mix: { value: 15, min: 0, max: 100, step: 1, unit: '%' },
    time: { value: 250, min: 50, max: 2000, step: 10, unit: 'ms' },
    feedback: { value: 30, min: 0, max: 90, step: 1, unit: '%' },
  }},
  deesser: { label: '디에서', icon: '🦷', params: {
    threshold: { value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
    frequency: { value: 6000, min: 2000, max: 16000, step: 100, unit: 'Hz' },
    reduction: { value: 6, min: 0, max: 24, step: 0.5, unit: 'dB' },
  }},
  noisegate: { label: '노이즈게이트', icon: '🚪', params: {
    threshold: { value: -40, min: -80, max: 0, step: 1, unit: 'dB' },
    attack: { value: 5, min: 0.1, max: 50, step: 0.5, unit: 'ms' },
    release: { value: 50, min: 10, max: 500, step: 5, unit: 'ms' },
  }},
};

const ALL_EFFECT_TYPES: AudioEffectType[] = ['eq', 'compressor', 'reverb', 'delay', 'deesser', 'noisegate'];

interface TrackInfo {
  id: AudioTrackId;
  label: string;
  icon: string;
  color: string;
  borderColor: string;
  accentCss: string;
}

const TRACKS: TrackInfo[] = [
  { id: 'narration', label: '나레이션', icon: '🎤', color: 'text-green-400', borderColor: 'border-green-500/40', accentCss: 'rgb(74, 222, 128)' },
  { id: 'bgm', label: 'BGM', icon: '🎵', color: 'text-cyan-400', borderColor: 'border-cyan-500/40', accentCss: 'rgb(34, 211, 238)' },
  { id: 'sfx', label: 'SFX', icon: '🔊', color: 'text-fuchsia-400', borderColor: 'border-fuchsia-500/40', accentCss: 'rgb(217, 70, 239)' },
  { id: 'origAudio', label: '원본오디오', icon: '🎬', color: 'text-rose-400', borderColor: 'border-rose-500/40', accentCss: 'rgb(251, 113, 133)' },
];

/** FX 이펙트 체인 모달 (믹서 위에 뜨는 서브모달) */
const FxSubModal: React.FC<{
  trackId: AudioTrackId;
  trackLabel: string;
  trackIcon: string;
  trackColor: string;
  onClose: () => void;
}> = ({ trackId, trackLabel, trackIcon, trackColor, onClose }) => {
  const trackEffects = useEditRoomStore((s) => s.trackEffects);
  const setTrackEffect = useEditRoomStore((s) => s.setTrackEffect);
  const addTrackEffect = useEditRoomStore((s) => s.addTrackEffect);
  const removeTrackEffect = useEditRoomStore((s) => s.removeTrackEffect);
  const updateTrackEffect = useEditRoomStore((s) => s.updateTrackEffect);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const fxConfig = trackEffects[trackId];

  const handleAddEffect = useCallback((type: AudioEffectType) => {
    const defaults = EFFECT_DEFAULTS[type];
    const params: Record<string, number> = {};
    Object.entries(defaults.params).forEach(([key, p]) => { params[key] = p.value; });
    addTrackEffect(trackId, { type, enabled: true, params } as TrackAudioEffect);
    setShowAddMenu(false);
  }, [trackId, addTrackEffect]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 overflow-hidden flex flex-col"
        style={{ maxWidth: 480, width: '100%', maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{trackIcon}</span>
            <h3 className={`text-xs font-bold ${trackColor}`}>{trackLabel} 오디오 효과</h3>
            {fxConfig.effects.length > 0 && (
              <span className="text-[8px] bg-amber-600/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">{fxConfig.effects.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTrackEffect(trackId, { bypass: !fxConfig.bypass })}
              className={`text-[9px] px-2 py-0.5 rounded-full border font-bold transition-colors ${
                fxConfig.bypass ? 'bg-red-600/20 text-red-400 border-red-500/30' : 'bg-gray-700 text-gray-400 border-gray-600 hover:text-gray-200'
              }`}>{fxConfig.bypass ? 'BYPASS ON' : 'BYPASS'}</button>
            <button type="button" onClick={onClose}
              className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-[10px]">✕</button>
          </div>
        </div>

        {/* 이펙트 목록 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {fxConfig.effects.length === 0 && (
            <div className="text-center py-8 text-gray-600 text-xs">이펙트가 없습니다. 아래 버튼으로 추가하세요.</div>
          )}

          {fxConfig.effects.map((fx, idx) => {
            const def = EFFECT_DEFAULTS[fx.type];
            return (
              <div key={`${fx.type}-${idx}`}
                className={`border rounded-xl p-2.5 transition-colors ${
                  fx.enabled && !fxConfig.bypass ? 'border-amber-500/30 bg-amber-600/5' : 'border-gray-700/50 bg-gray-800/30 opacity-60'
                }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs">{def.icon}</span>
                  <span className="text-[10px] font-bold text-gray-200">{def.label}</span>
                  <div className="flex-1" />
                  <button type="button" onClick={() => {
                    const cur = trackEffects[trackId].effects[idx];
                    updateTrackEffect(trackId, idx, { enabled: !cur.enabled });
                  }}
                    className={`w-7 h-3.5 rounded-full flex items-center transition-colors ${fx.enabled ? 'bg-amber-500 justify-end' : 'bg-gray-600 justify-start'}`}>
                    <span className="w-3 h-3 rounded-full bg-white shadow mx-0.5" />
                  </button>
                  <button type="button" onClick={() => removeTrackEffect(trackId, idx)}
                    className="w-4 h-4 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors text-[10px]">✕</button>
                </div>
                <div className="space-y-1">
                  {Object.entries(def.params).map(([key, paramDef]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-[9px] text-gray-500 w-14 text-right truncate">{key}</span>
                      <input type="range" min={paramDef.min} max={paramDef.max} step={paramDef.step}
                        value={fx.params[key] ?? paramDef.value}
                        onChange={(e) => {
                          const cur = trackEffects[trackId].effects[idx];
                          updateTrackEffect(trackId, idx, { params: { ...cur.params, [key]: Number(e.target.value) } });
                        }}
                        className="flex-1 accent-amber-500 h-1" disabled={!fx.enabled || fxConfig.bypass} />
                      <span className="text-[9px] text-amber-400 font-mono w-12 text-right">{fx.params[key] ?? paramDef.value}{paramDef.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* + 이펙트 추가 */}
          <div className="relative">
            <button type="button" onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-1.5 border border-dashed border-gray-600 rounded-xl text-[10px] text-gray-500 hover:text-amber-400 hover:border-amber-500/40 transition-colors">
              + 이펙트 추가
            </button>
            {showAddMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-1 grid grid-cols-3 gap-0.5 z-10">
                {ALL_EFFECT_TYPES.map((type) => {
                  const def = EFFECT_DEFAULTS[type];
                  return (
                    <button key={type} type="button" onClick={() => handleAddEffect(type)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-300 hover:bg-amber-600/20 hover:text-amber-400 transition-colors">
                      <span>{def.icon}</span><span>{def.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface AudioMixerModalProps {
  onClose: () => void;
}

const AudioMixerModal: React.FC<AudioMixerModalProps> = ({ onClose }) => {
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const sceneAudioSettings = useEditRoomStore((s) => s.sceneAudioSettings);
  const setSceneAudioSettings = useEditRoomStore((s) => s.setSceneAudioSettings);
  const trackMixer = useEditRoomStore((s) => s.trackMixer);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);
  const sfxVolume = useEditRoomStore((s) => s.sfxVolume);
  const setSfxVolume = useEditRoomStore((s) => s.setSfxVolume);
  const trackEffects = useEditRoomStore((s) => s.trackEffects);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const lines = useSoundStudioStore((s) => s.lines);

  const [fxOpenTrack, setFxOpenTrack] = useState<AudioTrackId | null>(null);

  // --- 실시간 VU 미터 refs ---
  const narrMeterRef = useRef<HTMLDivElement>(null);
  const narrPeakRef = useRef<HTMLDivElement>(null);
  const bgmMeterRef = useRef<HTMLDivElement>(null);
  const bgmPeakRef = useRef<HTMLDivElement>(null);
  const sfxMeterRef = useRef<HTMLDivElement>(null);
  const sfxPeakRef = useRef<HTMLDivElement>(null);
  const masterLRef = useRef<HTMLDivElement>(null);
  const masterLPeakRef = useRef<HTMLDivElement>(null);
  const masterRRef = useRef<HTMLDivElement>(null);
  const masterRPeakRef = useRef<HTMLDivElement>(null);
  const masterDbRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);

  // 감쇠/피크홀드 상태 (ref — React 렌더 밖에서 관리)
  const meterState = useRef({
    narrSmooth: 0, bgmSmooth: 0, sfxSmooth: 0, masterLSmooth: 0, masterRSmooth: 0,
    narrPeak: 0, bgmPeak: 0, sfxPeak: 0, masterLPeak: 0, masterRPeak: 0,
    narrPeakAge: 0, bgmPeakAge: 0, sfxPeakAge: 0, masterLPeakAge: 0, masterRPeakAge: 0,
  });

  const avgNarrationVolume = React.useMemo(() => {
    const ids = sceneOrder;
    if (ids.length === 0) return 100;
    const total = ids.reduce((sum, id) => sum + (sceneAudioSettings[id]?.volume ?? 100), 0);
    return Math.round(total / ids.length);
  }, [sceneOrder, sceneAudioSettings]);

  const handleGlobalNarrationVolume = useCallback((newVol: number) => {
    sceneOrder.forEach((id) => { setSceneAudioSettings(id, { volume: newVol }); });
  }, [sceneOrder, setSceneAudioSettings]);

  const origAudioVolume = useEditRoomStore((s) => s.origAudioVolume);
  const setOrigAudioVolume = useEditRoomStore((s) => s.setOrigAudioVolume);

  const getVolume = useCallback((trackId: AudioTrackId): number => {
    if (trackId === 'narration') return avgNarrationVolume;
    if (trackId === 'bgm') return bgmTrack.volume;
    if (trackId === 'origAudio') return origAudioVolume;
    return sfxVolume;
  }, [avgNarrationVolume, bgmTrack.volume, sfxVolume, origAudioVolume]);

  const handleVolumeChange = useCallback((trackId: AudioTrackId, vol: number) => {
    if (trackId === 'narration') handleGlobalNarrationVolume(vol);
    else if (trackId === 'bgm') setBgmTrack({ volume: Math.min(100, vol) });
    else if (trackId === 'origAudio') setOrigAudioVolume(vol);
    else setSfxVolume(vol);
  }, [handleGlobalNarrationVolume, setBgmTrack, setSfxVolume, setOrigAudioVolume]);

  const handleFaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>, trackId: AudioTrackId) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newVol = pct <= 0.91 ? Math.round((pct / 0.91) * 100) : Math.round(100 + ((pct - 0.91) / 0.09) * 100);
    handleVolumeChange(trackId, Math.max(0, Math.min(200, newVol)));
  }, [handleVolumeChange]);

  // --- rAF 루프: 실시간 VU 미터 DOM 직접 조작 ---
  useEffect(() => {
    const PEAK_HOLD_FRAMES = 120; // ~2초 @60fps
    const PEAK_DECAY = 0.995;     // 피크 마커 하강 속도
    const FALLOFF = 0.92;         // 미터 감쇠 계수

    const applyMeter = (
      el: HTMLDivElement | null, peakEl: HTMLDivElement | null,
      targetPct: number,
      smoothKey: 'narrSmooth' | 'bgmSmooth' | 'sfxSmooth' | 'masterLSmooth' | 'masterRSmooth',
      peakKey: 'narrPeak' | 'bgmPeak' | 'sfxPeak' | 'masterLPeak' | 'masterRPeak',
      ageKey: 'narrPeakAge' | 'bgmPeakAge' | 'sfxPeakAge' | 'masterLPeakAge' | 'masterRPeakAge',
      accentCss: string
    ) => {
      const st = meterState.current;
      // 상승: 즉시, 하강: 부드럽게
      const prev = st[smoothKey];
      const smoothed = targetPct > prev ? targetPct : prev * FALLOFF;
      st[smoothKey] = smoothed;

      // 피크홀드
      if (smoothed >= st[peakKey]) {
        st[peakKey] = smoothed;
        st[ageKey] = 0;
      } else {
        st[ageKey]++;
        if (st[ageKey] > PEAK_HOLD_FRAMES) {
          st[peakKey] *= PEAK_DECAY;
        }
      }

      if (el) {
        el.style.height = `${smoothed}%`;
        el.style.background = smoothed > 91
          ? 'linear-gradient(to top, #22c55e 0%, #eab308 60%, #ef4444 90%)'
          : smoothed > 72
            ? 'linear-gradient(to top, #22c55e 0%, #eab308 85%)'
            : accentCss;
      }
      if (peakEl) {
        const peakPct = st[peakKey];
        peakEl.style.bottom = `${peakPct}%`;
        peakEl.style.opacity = peakPct > 1 ? '1' : '0';
        peakEl.style.backgroundColor = peakPct > 91 ? '#ef4444' : 'rgba(255,255,255,0.8)';
      }
    };

    const tick = () => {
      const levels = getAudioLevels();
      const store = useEditRoomStore.getState();
      const narrVol = avgNarrationVolume;
      const narrMute = store.trackMixer.narration.mute;
      const bgmMute = store.trackMixer.bgm.mute;
      const sfxMute = store.trackMixer.sfx.mute;

      // 나레이션: 라이브 레벨 × (볼륨/100)
      const liveRms = levels.rms;
      const narrLivePct = narrMute ? 0 : dbToPercent(volToDb(liveRms * narrVol));
      applyMeter(narrMeterRef.current, narrPeakRef.current, narrLivePct, 'narrSmooth', 'narrPeak', 'narrPeakAge', 'rgb(74, 222, 128)');

      // BGM/SFX: 실제 재생 데이터 없으므로 볼륨 기반 정적 표시
      const bgmPct = bgmMute ? 0 : dbToPercent(volToDb(store.bgmTrack.volume));
      applyMeter(bgmMeterRef.current, bgmPeakRef.current, bgmPct, 'bgmSmooth', 'bgmPeak', 'bgmPeakAge', 'rgb(34, 211, 238)');

      const sfxPct = sfxMute ? 0 : dbToPercent(volToDb(store.sfxVolume));
      applyMeter(sfxMeterRef.current, sfxPeakRef.current, sfxPct, 'sfxSmooth', 'sfxPeak', 'sfxPeakAge', 'rgb(217, 70, 239)');

      // 마스터: 라이브 레벨 기반, L/R 약간 차이
      const masterLivePct = narrMute ? 0 : dbToPercent(volToDb(liveRms * narrVol));
      const effectiveMasterL = Math.max(masterLivePct, bgmPct, sfxPct);
      const effectiveMasterR = Math.max(masterLivePct * 0.96, bgmPct * 0.97, sfxPct * 0.98);
      applyMeter(masterLRef.current, masterLPeakRef.current, effectiveMasterL, 'masterLSmooth', 'masterLPeak', 'masterLPeakAge', '');
      applyMeter(masterRRef.current, masterRPeakRef.current, effectiveMasterR, 'masterRSmooth', 'masterRPeak', 'masterRPeakAge', '');

      // 마스터 L/R은 항상 gradient
      if (masterLRef.current) masterLRef.current.style.background = 'linear-gradient(to top, #22c55e 0%, #eab308 70%, #ef4444 95%)';
      if (masterRRef.current) masterRRef.current.style.background = 'linear-gradient(to top, #22c55e 0%, #eab308 70%, #ef4444 95%)';

      // 마스터 dB 텍스트
      if (masterDbRef.current) {
        const masterMaxPct = meterState.current.masterLSmooth;
        const masterDbVal = masterMaxPct <= 0 ? -60 : ((masterMaxPct / 100) * 66) - 60;
        masterDbRef.current.textContent = masterDbVal <= -59 ? '-\u221E' : masterDbVal >= 0 ? `+${masterDbVal.toFixed(1)}` : masterDbVal.toFixed(1);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [avgNarrationVolume]);

  const FADER_HEIGHT = 240;

  // 미터 바 + 피크홀드 마커 매핑 (트랙 스트립용 — master 제외)
  const meterRefs: Partial<Record<AudioTrackId, { meter: React.RefObject<HTMLDivElement | null>; peak: React.RefObject<HTMLDivElement | null> }>> = {
    narration: { meter: narrMeterRef, peak: narrPeakRef },
    bgm: { meter: bgmMeterRef, peak: bgmPeakRef },
    sfx: { meter: sfxMeterRef, peak: sfxPeakRef },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 overflow-hidden flex flex-col"
        style={{ maxWidth: 640, width: '100%', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/50 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-sm">🎚</div>
            <h2 className="text-sm font-bold text-white">오디오 트랙 믹서</h2>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-xs">✕</button>
        </div>

        {/* 믹서 스트립 영역 */}
        <div className="flex items-stretch justify-center gap-3 p-4 overflow-y-auto">
          {TRACKS.map((track) => {
            const volume = getVolume(track.id);
            const mute = trackMixer[track.id].mute;
            const solo = trackMixer[track.id].solo;
            const pan = trackMixer[track.id].pan;
            const db = volToDb(mute ? 0 : volume);
            const dbText = mute ? '-\u221E' : db <= -59 ? '-\u221E' : db >= 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
            const fxCount = trackEffects[track.id].effects.length;
            const isFxSelected = fxOpenTrack === track.id;
            const refs = meterRefs[track.id]!;

            return (
              <div key={track.id}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 bg-gray-800/60 rounded-xl border transition-colors ${
                  isFxSelected ? track.borderColor : 'border-gray-700/50'
                }`}
                style={{ width: 130 }}>
                {/* 트랙 이름 */}
                <span className={`text-sm font-bold ${track.color}`}>{track.icon} {track.label}</span>

                {/* FX 버튼 */}
                <button
                  type="button"
                  onClick={() => setFxOpenTrack(isFxSelected ? null : track.id)}
                  className={`w-full py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all border ${
                    isFxSelected
                      ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/10'
                      : fxCount > 0
                        ? 'bg-gray-700/80 text-amber-400/80 border-gray-600 hover:border-amber-500/30'
                        : 'bg-gray-700/60 text-gray-500 border-gray-600 hover:text-gray-300 hover:border-gray-500'
                  }`}
                >
                  FX
                  {fxCount > 0 && <span className="text-[8px] bg-amber-500/30 text-amber-300 px-1.5 rounded-full">{fxCount}</span>}
                </button>

                {/* 팬 */}
                <div className="w-full overflow-hidden">
                  <div className="flex items-center gap-0.5 px-1">
                    <span className="text-[8px] text-gray-600 flex-shrink-0">L</span>
                    <input type="range" min={-100} max={100} step={5} value={pan}
                      onChange={(e) => setTrackMixer(track.id, { pan: Number(e.target.value) })}
                      className="flex-1 h-1 accent-gray-400 min-w-0"
                      title={`Pan: ${pan === 0 ? 'C' : pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`}`} />
                    <span className="text-[8px] text-gray-600 flex-shrink-0">R</span>
                  </div>
                </div>

                {/* VU 미터 + 페이더 */}
                <div className="flex gap-1 items-stretch" style={{ height: FADER_HEIGHT }}>
                  {/* dB 눈금 */}
                  <div className="flex flex-col justify-between py-1" style={{ width: 22 }}>
                    {DB_MARKS.map((mark) => (
                      <span key={mark} className="text-[7px] text-gray-600 font-mono text-right leading-none">
                        {mark > 0 ? `+${mark}` : mark}
                      </span>
                    ))}
                  </div>
                  {/* VU 미터 바 (DOM 직접 조작) */}
                  <div className="bg-gray-900 rounded overflow-hidden relative cursor-pointer" style={{ width: 16 }}
                    onClick={(e) => handleFaderClick(e, track.id)}
                    onMouseMove={(e) => { if (e.buttons === 1) handleFaderClick(e, track.id); }}>
                    <div ref={refs.meter}
                      className="absolute bottom-0 left-0 right-0 rounded"
                      style={{ height: '0%', opacity: mute ? 0.2 : 0.85 }} />
                    {/* 피크홀드 마커 */}
                    <div ref={refs.peak}
                      className="absolute left-0 right-0"
                      style={{ height: '2px', bottom: '0%', opacity: 0, backgroundColor: 'rgba(255,255,255,0.8)' }} />
                    {/* 클리핑 라인 */}
                    <div className="absolute left-0 right-0 h-px bg-red-500/40" style={{ bottom: '91%' }} />
                  </div>
                  {/* 페이더 */}
                  <div className="flex flex-col items-center justify-center">
                    <input type="range" min={0} max={200} step={1} value={volume}
                      onChange={(e) => handleVolumeChange(track.id, Number(e.target.value))}
                      className="accent-gray-300"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 14, height: FADER_HEIGHT - 10 }}
                      title={`${track.label}: ${volume}% (${dbText}dB)`} />
                  </div>
                </div>

                {/* dB 표시 + 직접 입력 */}
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    min={-60} max={6} step={0.5}
                    value={mute ? '' : Number(db.toFixed(1))}
                    onChange={(e) => {
                      const dbVal = Math.max(-60, Math.min(6, Number(e.target.value) || -60));
                      handleVolumeChange(track.id, dbToVol(dbVal));
                    }}
                    className={`w-14 bg-gray-800 border rounded text-center text-sm font-mono font-bold focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      mute ? 'border-red-500/40 text-red-500' : db >= 0 ? 'border-amber-500/40 text-amber-400' : 'border-gray-600 text-gray-300'
                    } focus:border-amber-500/50`}
                    disabled={mute}
                  />
                  <span className="text-[9px] text-gray-500">dB</span>
                </div>
                <span className="text-[8px] text-gray-600 font-mono">{volume}%</span>

                {/* M/S */}
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setTrackMixer(track.id, { mute: !mute })}
                    className={`w-7 h-6 rounded text-[10px] font-black flex items-center justify-center transition-colors ${
                      mute ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:text-gray-300 hover:bg-gray-600'
                    }`} title="뮤트">M</button>
                  <button type="button" onClick={() => setTrackMixer(track.id, { solo: !solo })}
                    className={`w-7 h-6 rounded text-[10px] font-black flex items-center justify-center transition-colors ${
                      solo ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500 hover:text-gray-300 hover:bg-gray-600'
                    }`} title="솔로">S</button>
                </div>

                {/* 크로스페이드 */}
                <div className="w-full mt-1">
                  <span className={`text-[8px] font-bold block text-center mb-0.5 ${
                    trackMixer[track.id].crossfadeMs > 0 ? 'text-amber-400' : 'text-gray-600'
                  }`}>X-Fade</span>
                  <input type="range" min={0} max={500} step={10}
                    value={trackMixer[track.id].crossfadeMs}
                    onChange={(e) => setTrackMixer(track.id, { crossfadeMs: Number(e.target.value) })}
                    className={`w-full h-1 ${trackMixer[track.id].crossfadeMs > 0 ? 'accent-amber-500' : 'accent-gray-600'}`}
                    title={`크로스페이드: ${trackMixer[track.id].crossfadeMs}ms`} />
                  <div className="flex items-center justify-center gap-0.5 mt-0.5">
                    <input
                      type="number"
                      min={0} max={500} step={10}
                      value={trackMixer[track.id].crossfadeMs}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(500, Number(e.target.value) || 0));
                        setTrackMixer(track.id, { crossfadeMs: v });
                      }}
                      className="w-10 bg-gray-800 border border-gray-600 rounded text-center text-[9px] font-mono font-bold text-gray-300 focus:border-amber-500/50 focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[8px] text-gray-500">ms</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ───── 마스터 스트립 ───── */}
          {(() => {
            const masterFxCount = trackEffects.master.effects.length;
            const masterFxOpen = fxOpenTrack === 'master';
            const masterMute = trackMixer.master.mute;
            return (
              <div className="flex flex-col items-center gap-1.5 px-3 py-3 bg-gray-800/60 rounded-xl border border-amber-700/30" style={{ width: 80 }}>
                <span className="text-sm font-bold text-amber-400">Master</span>

                {/* FX 버튼 */}
                <button
                  type="button"
                  onClick={() => setFxOpenTrack(masterFxOpen ? null : 'master')}
                  className={`w-full py-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all border ${
                    masterFxOpen
                      ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/10'
                      : masterFxCount > 0
                        ? 'bg-gray-700/80 text-amber-400/80 border-gray-600 hover:border-amber-500/30'
                        : 'bg-gray-700/60 text-gray-500 border-gray-600 hover:text-gray-300 hover:border-gray-500'
                  }`}
                >
                  FX
                  {masterFxCount > 0 && <span className="text-[8px] bg-amber-500/30 text-amber-300 px-1.5 rounded-full">{masterFxCount}</span>}
                </button>

                {/* 스페이서 (팬 높이만큼) */}
                <div style={{ height: 22 }} />

                {/* 스테레오 VU 미터 (DOM 직접 조작) */}
                <div className="flex gap-1 items-stretch" style={{ height: FADER_HEIGHT }}>
                  {/* L 미터 */}
                  <div className="w-3.5 bg-gray-900 rounded overflow-hidden relative">
                    <div ref={masterLRef}
                      className="absolute bottom-0 left-0 right-0 rounded"
                      style={{ height: '0%', background: 'linear-gradient(to top, #22c55e 0%, #eab308 70%, #ef4444 95%)', opacity: 0.75 }} />
                    <div ref={masterLPeakRef}
                      className="absolute left-0 right-0"
                      style={{ height: '2px', bottom: '0%', opacity: 0, backgroundColor: 'rgba(255,255,255,0.8)' }} />
                    <div className="absolute left-0 right-0 h-px bg-red-500/40" style={{ bottom: '91%' }} />
                  </div>
                  {/* R 미터 */}
                  <div className="w-3.5 bg-gray-900 rounded overflow-hidden relative">
                    <div ref={masterRRef}
                      className="absolute bottom-0 left-0 right-0 rounded"
                      style={{ height: '0%', background: 'linear-gradient(to top, #22c55e 0%, #eab308 70%, #ef4444 95%)', opacity: 0.75 }} />
                    <div ref={masterRPeakRef}
                      className="absolute left-0 right-0"
                      style={{ height: '2px', bottom: '0%', opacity: 0, backgroundColor: 'rgba(255,255,255,0.8)' }} />
                    <div className="absolute left-0 right-0 h-px bg-red-500/40" style={{ bottom: '91%' }} />
                  </div>
                </div>

                {/* 마스터 dB (DOM 직접 조작) */}
                <span className="text-base font-mono font-bold text-amber-400">
                  <span ref={masterDbRef}>-{'\u221E'}</span><span className="text-[8px] text-gray-600">dB</span>
                </span>

                {/* 마스터 뮤트 */}
                <button type="button" onClick={() => setTrackMixer('master', { mute: !masterMute })}
                  className={`w-7 h-6 rounded text-[10px] font-black flex items-center justify-center transition-colors ${
                    masterMute ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-500 hover:text-gray-300 hover:bg-gray-600'
                  }`} title="마스터 뮤트">M</button>
              </div>
            );
          })()}
        </div>

        {/* 하단 정보 */}
        <div className="px-4 py-1.5 border-t border-gray-700/30 bg-gray-800/30 flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[9px] text-gray-500">나레이션 {lines.filter(l => l.audioUrl).length}클립</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span className="text-[9px] text-gray-500">BGM {bgmTrack.audioUrl ? '활성' : '없음'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
            <span className="text-[9px] text-gray-500">SFX {sfxVolume}%</span>
          </div>
          {Object.values(trackEffects).reduce((s, c) => s + c.effects.length, 0) > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[9px] text-amber-400 font-bold">
                FX {Object.values(trackEffects).reduce((s, c) => s + c.effects.length, 0)}개
              </span>
            </div>
          )}
        </div>
      </div>

      {/* FX 서브모달 */}
      {fxOpenTrack && (() => {
        if (fxOpenTrack === 'master') {
          return <FxSubModal trackId="master" trackLabel="Master" trackIcon="🎚" trackColor="text-amber-400" onClose={() => setFxOpenTrack(null)} />;
        }
        const t = TRACKS.find(tr => tr.id === fxOpenTrack)!;
        return <FxSubModal trackId={t.id} trackLabel={t.label} trackIcon={t.icon} trackColor={t.color} onClose={() => setFxOpenTrack(null)} />;
      })()}
    </div>
  );
};

export default AudioMixerModal;
