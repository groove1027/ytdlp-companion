import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import type { AudioTrackId, AudioEffectType, TrackAudioEffect } from '../../../types';

interface TrackEffectDropdownProps {
  trackId: AudioTrackId;
  trackLabel: string;
  trackColor: string;          // e.g. 'green', 'cyan', 'fuchsia'
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

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

const TrackEffectDropdown: React.FC<TrackEffectDropdownProps> = ({ trackId, trackLabel, trackColor, anchorRef, onClose }) => {
  const trackEffects = useEditRoomStore((s) => s.trackEffects);
  const setTrackEffect = useEditRoomStore((s) => s.setTrackEffect);
  const addTrackEffect = useEditRoomStore((s) => s.addTrackEffect);
  const removeTrackEffect = useEditRoomStore((s) => s.removeTrackEffect);
  const updateTrackEffect = useEditRoomStore((s) => s.updateTrackEffect);

  const config = trackEffects[trackId];
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // 앵커 위치 기반 포지셔닝
  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popW = 300;
    const popH = popoverRef.current?.offsetHeight || 300;
    // 기본: 앵커 위에 표시
    let top = rect.top - popH - 6;
    let left = rect.left;
    // 위에 공간 부족 → 아래에 표시
    if (top < 8) top = rect.bottom + 6;
    // 좌우 경계 보정
    if (left < 8) left = 8;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    setPos({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition]);

  // 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  // 효과 추가
  const handleAdd = (type: AudioEffectType) => {
    const defaults = EFFECT_DEFAULTS[type];
    const params: Record<string, number> = {};
    Object.entries(defaults.params).forEach(([key, p]) => { params[key] = p.value; });
    const effect: TrackAudioEffect = { type, enabled: true, params };
    addTrackEffect(trackId, effect);
  };

  // 파라미터 변경
  const handleParamChange = (index: number, paramKey: string, value: number) => {
    const fx = config.effects[index];
    updateTrackEffect(trackId, index, { params: { ...fx.params, [paramKey]: value } });
  };

  // 활성/비활성 토글
  const handleToggle = (index: number) => {
    const fx = config.effects[index];
    updateTrackEffect(trackId, index, { enabled: !fx.enabled });
  };

  // 이미 적용된 효과 타입들
  const appliedTypes = new Set(config.effects.map(fx => fx.type));
  const availableTypes = ALL_EFFECT_TYPES.filter(t => !appliedTypes.has(t));

  const colorMap: Record<string, { accent: string; border: string; bg: string; slider: string }> = {
    green:   { accent: 'text-green-400',   border: 'border-green-500/40',   bg: 'bg-green-600/10',   slider: 'accent-green-500' },
    cyan:    { accent: 'text-cyan-400',    border: 'border-cyan-500/40',    bg: 'bg-cyan-600/10',    slider: 'accent-cyan-500' },
    fuchsia: { accent: 'text-fuchsia-400', border: 'border-fuchsia-500/40', bg: 'bg-fuchsia-600/10', slider: 'accent-fuchsia-500' },
  };
  const c = colorMap[trackColor] || colorMap.green;

  return createPortal(
    <div
      ref={popoverRef}
      className={`fixed z-[99999] w-[300px] bg-gray-900 border ${c.border} rounded-lg shadow-2xl`}
      style={{ top: pos.top, left: pos.left }}
    >
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${c.border}`}>
        <span className={`text-xs font-bold ${c.accent}`}>{trackLabel} 오디오 효과</span>
        <button
          type="button"
          onClick={() => setTrackEffect(trackId, { bypass: !config.bypass })}
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-colors ${
            config.bypass
              ? 'bg-red-600/30 text-red-400 border border-red-500/40'
              : 'bg-gray-700 text-gray-400 border border-gray-600 hover:text-gray-200'
          }`}
        >
          {config.bypass ? 'BYPASS ON' : 'BYPASS'}
        </button>
      </div>

      {/* 적용된 효과 목록 */}
      <div className="max-h-[280px] overflow-y-auto">
        {config.effects.length === 0 && (
          <div className="px-3 py-4 text-center text-[10px] text-gray-600">적용된 효과 없음</div>
        )}
        {config.effects.map((fx, idx) => {
          const def = EFFECT_DEFAULTS[fx.type];
          return (
            <div key={`${fx.type}-${idx}`} className={`px-3 py-2 border-b border-gray-800 ${!fx.enabled ? 'opacity-40' : ''}`}>
              {/* 효과 헤더 */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs">{def.icon}</span>
                <span className={`text-[10px] font-bold ${c.accent} flex-1`}>{def.label}</span>
                <button
                  type="button"
                  onClick={() => handleToggle(idx)}
                  className={`text-[8px] px-1 py-0.5 rounded font-bold transition-colors ${
                    fx.enabled
                      ? `${c.bg} ${c.accent} border ${c.border}`
                      : 'bg-gray-700 text-gray-500 border border-gray-600'
                  }`}
                >
                  {fx.enabled ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => removeTrackEffect(trackId, idx)}
                  className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
                  title="효과 제거"
                >
                  🗑
                </button>
              </div>
              {/* 파라미터 슬라이더 */}
              {Object.entries(def.params).map(([paramKey, paramDef]) => (
                <div key={paramKey} className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] text-gray-500 w-14 text-right truncate">{paramKey}</span>
                  <input
                    type="range"
                    min={paramDef.min}
                    max={paramDef.max}
                    step={paramDef.step}
                    value={fx.params[paramKey] ?? paramDef.value}
                    onChange={(e) => handleParamChange(idx, paramKey, Number(e.target.value))}
                    className={`flex-1 h-1 ${c.slider}`}
                    disabled={!fx.enabled}
                  />
                  <span className="text-[9px] text-gray-400 font-mono w-14 text-right">
                    {fx.params[paramKey] ?? paramDef.value}{paramDef.unit}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 효과 추가 영역 */}
      {availableTypes.length > 0 && (
        <div className={`px-3 py-2 border-t ${c.border}`}>
          <p className="text-[9px] text-gray-500 mb-1.5">+ 효과 추가</p>
          <div className="flex flex-wrap gap-1">
            {availableTypes.map(type => {
              const def = EFFECT_DEFAULTS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAdd(type)}
                  className="text-[9px] px-1.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded border border-gray-700 transition-colors"
                >
                  {def.icon} {def.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default TrackEffectDropdown;
