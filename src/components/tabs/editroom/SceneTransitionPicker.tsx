import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { SceneTransitionPreset, SceneTransitionConfig } from '../../../types';

interface SceneTransitionPickerProps {
  config: SceneTransitionConfig;
  onChange: (config: SceneTransitionConfig) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

/** 카테고리별 전환 효과 프리셋 (30개) */
export const TRANSITION_GROUPS: { label: string; items: { id: SceneTransitionPreset; label: string }[] }[] = [
  {
    label: '기본',
    items: [
      { id: 'none', label: '컷' },
      { id: 'fade', label: '페이드' },
      { id: 'fadeWhite', label: '화이트' },
      { id: 'dissolve', label: '디졸브' },
    ],
  },
  {
    label: '와이프',
    items: [
      { id: 'wipeLeft', label: '←' },
      { id: 'wipeRight', label: '→' },
      { id: 'wipeUp', label: '↑' },
      { id: 'wipeDown', label: '↓' },
    ],
  },
  {
    label: '슬라이드',
    items: [
      { id: 'slideLeft', label: '←' },
      { id: 'slideRight', label: '→' },
      { id: 'slideUp', label: '↑' },
      { id: 'slideDown', label: '↓' },
    ],
  },
  {
    label: '커버',
    items: [
      { id: 'coverLeft', label: '← 커버' },
      { id: 'coverRight', label: '→ 커버' },
    ],
  },
  {
    label: '형태',
    items: [
      { id: 'circleOpen', label: '원형 열기' },
      { id: 'circleClose', label: '원형 닫기' },
      { id: 'radial', label: '방사형' },
      { id: 'diagBR', label: '대각↘' },
      { id: 'diagTL', label: '대각↖' },
    ],
  },
  {
    label: '줌/3D',
    items: [
      { id: 'zoomIn', label: '줌 인' },
      { id: 'zoomOut', label: '줌 아웃' },
      { id: 'flipX', label: '가로 뒤집기' },
      { id: 'flipY', label: '세로 뒤집기' },
    ],
  },
  {
    label: '특수',
    items: [
      { id: 'smoothLeft', label: '스무스 ←' },
      { id: 'smoothRight', label: '스무스 →' },
      { id: 'blur', label: '블러' },
      { id: 'pixelate', label: '픽셀화' },
      { id: 'squeezH', label: '압축' },
      { id: 'flash', label: '플래시' },
      { id: 'glitch', label: '글리치' },
    ],
  },
];

const ALL_PRESETS = TRANSITION_GROUPS.flatMap(g => g.items);

export function getTransitionIcon(_preset: SceneTransitionPreset): string {
  return '◇';
}

export function getTransitionLabel(preset: SceneTransitionPreset): string {
  return ALL_PRESETS.find((p) => p.id === preset)?.label || '컷';
}

const SceneTransitionPicker: React.FC<SceneTransitionPickerProps> = ({ config, onChange, onClose, anchorRef }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popH = popoverRef.current?.offsetHeight || 300;
    const popW = 320;
    let top = rect.top - popH - 6;
    let left = rect.left + rect.width / 2 - popW / 2;
    if (top < 8) top = rect.bottom + 6;
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

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] bg-gray-900 border border-amber-500/30 rounded-lg p-2.5 shadow-xl max-h-[70vh] overflow-y-auto"
      style={{ top: pos.top, left: pos.left, width: 320 }}
      onClick={(e) => e.stopPropagation()}
    >
      {TRANSITION_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mb-1">{group.label}</p>
          <div className="flex flex-wrap gap-1">
            {group.items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ ...config, preset: p.id })}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold border transition-all ${
                  config.preset === p.id
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Duration slider */}
      {config.preset !== 'none' && (
        <div className="flex items-center gap-2 pt-1.5 border-t border-gray-700/50">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">시간</span>
          <input
            type="range"
            min={0.2}
            max={2.0}
            step={0.1}
            value={config.duration}
            onChange={(e) => onChange({ ...config, duration: Number(e.target.value) })}
            className="flex-1 h-1 accent-amber-500"
          />
          <span className="text-xs text-amber-300 font-mono w-8 text-right">{config.duration.toFixed(1)}s</span>
        </div>
      )}
    </div>,
    document.body
  );
};

export default SceneTransitionPicker;
