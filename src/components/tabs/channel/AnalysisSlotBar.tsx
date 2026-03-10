import React, { useState } from 'react';

interface AnalysisSlotBarProps {
  slots: { id: string; name: string; savedAt: number }[];
  activeSlotId: string | null;
  onNewAnalysis: () => void;
  onLoadSlot: (id: string) => void;
  onDeleteSlot: (id: string) => void;
  hasCurrentResults: boolean;
  accentColor?: string;
}

const fmt = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};

const AnalysisSlotBar: React.FC<AnalysisSlotBarProps> = ({
  slots, activeSlotId, onNewAnalysis, onLoadSlot, onDeleteSlot, hasCurrentResults, accentColor = 'blue',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeClass = `bg-${accentColor}-600/20 text-${accentColor}-400 border border-${accentColor}-500/30`;
  const inactiveClass = 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:border-gray-500';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onNewAnalysis}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        새 분석
      </button>

      {slots.length > 0 && (
        <>
          <div className="w-px h-6 bg-gray-600/50 flex-shrink-0" />
          <div className="flex gap-2 overflow-x-auto scrollbar-hide min-w-0">
            {slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => onLoadSlot(slot.id)}
                onMouseEnter={() => setHoveredId(slot.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  slot.id === activeSlotId ? activeClass : inactiveClass
                }`}
              >
                <span className="max-w-[100px] truncate inline-block align-middle">{slot.name}</span>
                <span className="ml-1.5 opacity-60">{fmt(slot.savedAt)}</span>
                {hoveredId === slot.id && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onDeleteSlot(slot.id); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-800 border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500/50 cursor-pointer"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {hasCurrentResults && <div className={`flex-shrink-0 w-2 h-2 rounded-full bg-${accentColor}-400 animate-pulse`} title="저장되지 않은 결과" />}
    </div>
  );
};

export default AnalysisSlotBar;
