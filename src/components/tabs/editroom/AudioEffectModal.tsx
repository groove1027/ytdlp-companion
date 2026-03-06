import React, { useState, useCallback } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import type { AudioTrackId, AudioEffectType, TrackAudioEffect } from '../../../types';

// 이펙트별 기본 파라미터 정의
const EFFECT_DEFAULTS: Record<AudioEffectType, { label: string; icon: string; params: Record<string, { value: number; min: number; max: number; step: number; unit: string }> }> = {
  eq: {
    label: 'EQ',
    icon: '🎚',
    params: {
      lowGain:  { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
      midGain:  { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
      highGain: { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
      midFreq:  { value: 1000, min: 200, max: 8000, step: 100, unit: 'Hz' },
    },
  },
  compressor: {
    label: '컴프레서',
    icon: '⚡',
    params: {
      threshold: { value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
      ratio:     { value: 4, min: 1, max: 20, step: 0.5, unit: ':1' },
      attack:    { value: 10, min: 0.1, max: 100, step: 0.5, unit: 'ms' },
      release:   { value: 100, min: 10, max: 1000, step: 10, unit: 'ms' },
      gain:      { value: 0, min: -12, max: 12, step: 0.5, unit: 'dB' },
    },
  },
  reverb: {
    label: '리버브',
    icon: '🏛',
    params: {
      mix:      { value: 20, min: 0, max: 100, step: 1, unit: '%' },
      decay:    { value: 1.5, min: 0.1, max: 10, step: 0.1, unit: 's' },
      preDelay: { value: 20, min: 0, max: 200, step: 5, unit: 'ms' },
    },
  },
  delay: {
    label: '딜레이',
    icon: '🔄',
    params: {
      mix:      { value: 15, min: 0, max: 100, step: 1, unit: '%' },
      time:     { value: 250, min: 50, max: 2000, step: 10, unit: 'ms' },
      feedback: { value: 30, min: 0, max: 90, step: 1, unit: '%' },
    },
  },
  deesser: {
    label: '디에서',
    icon: '🦷',
    params: {
      threshold: { value: -20, min: -60, max: 0, step: 1, unit: 'dB' },
      frequency: { value: 6000, min: 2000, max: 16000, step: 100, unit: 'Hz' },
      reduction: { value: 6, min: 0, max: 24, step: 0.5, unit: 'dB' },
    },
  },
  noisegate: {
    label: '노이즈게이트',
    icon: '🚪',
    params: {
      threshold: { value: -40, min: -80, max: 0, step: 1, unit: 'dB' },
      attack:    { value: 5, min: 0.1, max: 50, step: 0.5, unit: 'ms' },
      release:   { value: 50, min: 10, max: 500, step: 5, unit: 'ms' },
    },
  },
};

const TRACK_TABS: { id: AudioTrackId; label: string; icon: string }[] = [
  { id: 'narration', label: '나레이션', icon: '🎤' },
  { id: 'bgm', label: 'BGM', icon: '🎵' },
  { id: 'sfx', label: 'SFX', icon: '🔊' },
];

const ALL_EFFECT_TYPES: AudioEffectType[] = ['eq', 'compressor', 'reverb', 'delay', 'deesser', 'noisegate'];

interface Props {
  onClose: () => void;
}

const AudioEffectModal: React.FC<Props> = ({ onClose }) => {
  const [activeTrack, setActiveTrack] = useState<AudioTrackId>('narration');
  const [showAddMenu, setShowAddMenu] = useState(false);

  const trackEffects = useEditRoomStore((s) => s.trackEffects);
  const setTrackEffect = useEditRoomStore((s) => s.setTrackEffect);
  const addTrackEffect = useEditRoomStore((s) => s.addTrackEffect);
  const removeTrackEffect = useEditRoomStore((s) => s.removeTrackEffect);
  const updateTrackEffect = useEditRoomStore((s) => s.updateTrackEffect);

  const currentConfig = trackEffects[activeTrack];

  const handleAddEffect = useCallback((type: AudioEffectType) => {
    const defaults = EFFECT_DEFAULTS[type];
    const params: Record<string, number> = {};
    Object.entries(defaults.params).forEach(([key, p]) => { params[key] = p.value; });
    const effect: TrackAudioEffect = { type, enabled: true, params };
    addTrackEffect(activeTrack, effect);
    setShowAddMenu(false);
  }, [activeTrack, addTrackEffect]);

  const handleParamChange = useCallback((index: number, paramKey: string, value: number) => {
    const fx = currentConfig.effects[index];
    updateTrackEffect(activeTrack, index, { params: { ...fx.params, [paramKey]: value } });
  }, [activeTrack, currentConfig, updateTrackEffect]);

  const handleToggleEffect = useCallback((index: number) => {
    const fx = currentConfig.effects[index];
    updateTrackEffect(activeTrack, index, { enabled: !fx.enabled });
  }, [activeTrack, currentConfig, updateTrackEffect]);

  const handleBypassToggle = useCallback(() => {
    setTrackEffect(activeTrack, { bypass: !currentConfig.bypass });
  }, [activeTrack, currentConfig, setTrackEffect]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-w-2xl w-full max-h-[80vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎛</span>
            <h2 className="text-sm font-bold text-gray-200">오디오 효과</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 좌측 트랙 탭 */}
          <div className="w-32 flex-shrink-0 border-r border-gray-700/50 bg-gray-800/50 p-2 space-y-1">
            {TRACK_TABS.map((tab) => {
              const isActive = activeTrack === tab.id;
              const effectCount = trackEffects[tab.id].effects.length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTrack(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                  {effectCount > 0 && (
                    <span className="ml-auto text-[9px] bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded-full">{effectCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 우측 이펙트 체인 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* 바이패스 토글 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {TRACK_TABS.find(t => t.id === activeTrack)?.icon} {TRACK_TABS.find(t => t.id === activeTrack)?.label} 이펙트 체인
              </span>
              <button
                type="button"
                onClick={handleBypassToggle}
                className={`text-[10px] px-2.5 py-1 rounded-full border font-bold transition-colors ${
                  currentConfig.bypass
                    ? 'bg-red-600/20 text-red-400 border-red-500/30'
                    : 'bg-gray-700 text-gray-400 border-gray-600 hover:text-gray-200'
                }`}
              >
                {currentConfig.bypass ? 'BYPASS ON' : 'BYPASS'}
              </button>
            </div>

            {/* 이펙트 목록 */}
            {currentConfig.effects.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-xs">
                이펙트가 없습니다. 아래 버튼으로 추가하세요.
              </div>
            )}

            {currentConfig.effects.map((fx, idx) => {
              const def = EFFECT_DEFAULTS[fx.type];
              return (
                <div
                  key={`${fx.type}-${idx}`}
                  className={`border rounded-xl p-3 transition-colors ${
                    fx.enabled && !currentConfig.bypass
                      ? 'border-amber-500/30 bg-amber-600/5'
                      : 'border-gray-700/50 bg-gray-800/30 opacity-60'
                  }`}
                >
                  {/* 이펙트 카드 헤더 */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{def.icon}</span>
                    <span className="text-xs font-bold text-gray-200">{def.label}</span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => handleToggleEffect(idx)}
                      className={`w-8 h-4 rounded-full flex items-center transition-colors ${
                        fx.enabled ? 'bg-amber-500 justify-end' : 'bg-gray-600 justify-start'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow mx-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTrackEffect(activeTrack, idx)}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors text-xs"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 파라미터 슬라이더 */}
                  <div className="space-y-1.5">
                    {Object.entries(def.params).map(([key, paramDef]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-16 text-right truncate">{key}</span>
                        <input
                          type="range"
                          min={paramDef.min}
                          max={paramDef.max}
                          step={paramDef.step}
                          value={fx.params[key] ?? paramDef.value}
                          onChange={(e) => handleParamChange(idx, key, Number(e.target.value))}
                          className="flex-1 accent-amber-500 h-1"
                          disabled={!fx.enabled || currentConfig.bypass}
                        />
                        <span className="text-[10px] text-amber-400 font-mono w-14 text-right">
                          {fx.params[key] ?? paramDef.value}{paramDef.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* + 이펙트 추가 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="w-full py-2 border border-dashed border-gray-600 rounded-xl text-xs text-gray-500 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
              >
                + 이펙트 추가
              </button>
              {showAddMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-1.5 grid grid-cols-3 gap-1 z-10">
                  {ALL_EFFECT_TYPES.map((type) => {
                    const def = EFFECT_DEFAULTS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleAddEffect(type)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-amber-600/20 hover:text-amber-400 transition-colors"
                      >
                        <span>{def.icon}</span>
                        <span>{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioEffectModal;
