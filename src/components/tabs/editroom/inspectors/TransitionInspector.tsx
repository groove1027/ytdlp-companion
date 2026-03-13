import React from 'react';
import { useEditRoomStore } from '../../../../stores/editRoomStore';
import { getTransitionLabel, TRANSITION_GROUPS } from '../SceneTransitionPicker';
import type { SceneTransitionConfig, SceneTransitionPreset } from '../../../../types';

interface TransitionInspectorProps {
  sceneId: string;
}

const TransitionInspector: React.FC<TransitionInspectorProps> = ({ sceneId }) => {
  const config = useEditRoomStore((s) => s.sceneTransitions[sceneId]) ?? { preset: 'none' as SceneTransitionPreset, duration: 0.5 };
  const setSceneTransition = useEditRoomStore((s) => s.setSceneTransition);

  const handleChange = (cfg: SceneTransitionConfig) => {
    setSceneTransition(sceneId, cfg);
  };

  return (
    <div className="space-y-3">
      <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/40">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">현재 전환</p>
        <p className="text-sm text-amber-400 font-bold">{getTransitionLabel(config.preset)}</p>
        {config.preset !== 'none' && (
          <p className="text-[10px] text-gray-500 mt-0.5">지속 시간: {config.duration}초</p>
        )}
      </div>

      {/* 지속 시간 슬라이더 */}
      {config.preset !== 'none' && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">지속 시간</span>
            <span className="text-[10px] text-amber-400 font-mono">{config.duration}s</span>
          </div>
          <input
            type="range"
            min={0.2} max={2.0} step={0.1}
            value={config.duration}
            onChange={(e) => handleChange({ ...config, duration: Number(e.target.value) })}
            className="w-full accent-amber-500 h-1"
          />
        </div>
      )}

      {/* 프리셋 선택 */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 px-1">전환 프리셋</p>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {/* 없음 버튼 */}
          <button
            type="button"
            onClick={() => handleChange({ preset: 'none', duration: 0.5 })}
            className={`w-full text-left px-2 py-1.5 rounded text-xs border transition-colors ${
              config.preset === 'none'
                ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600'
            }`}
          >
            없음 (컷)
          </button>

          {TRANSITION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.items.filter(p => p.id !== 'none').map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleChange({ preset: p.id as SceneTransitionPreset, duration: config.duration || 0.5 })}
                    className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                      config.preset === p.id
                        ? 'bg-amber-600/20 border-amber-500/40 text-amber-300 font-bold'
                        : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-amber-300 hover:border-amber-500/30'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransitionInspector;
