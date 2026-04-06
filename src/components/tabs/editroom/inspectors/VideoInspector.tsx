import React from 'react';
import { useEditRoomStore } from '../../../../stores/editRoomStore';
import { useProjectStore } from '../../../../stores/projectStore';
import SceneEffectPicker from '../SceneEffectPicker';
import type { SceneEffectConfig, SceneAudioConfig } from '../../../../types';
import { getSceneNarrationText } from '../../../../utils/sceneText';

interface VideoInspectorProps {
  sceneId: string;
}

const VideoInspector: React.FC<VideoInspectorProps> = ({ sceneId }) => {
  const scene = useProjectStore((s) => s.scenes.find((sc) => sc.id === sceneId));
  const effect = useEditRoomStore((s) => s.sceneEffects[sceneId]) ?? { panZoomPreset: 'none', motionEffect: 'none' };
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const audioSettings = useEditRoomStore((s) => s.sceneAudioSettings[sceneId]) ?? { volume: 100, speed: 1.0 };
  const setSceneAudioSettings = useEditRoomStore((s) => s.setSceneAudioSettings);

  if (!scene) return <div className="p-3 text-xs text-gray-500">장면을 찾을 수 없습니다</div>;
  const narrationText = getSceneNarrationText(scene);

  const handleEffectChange = (partial: Partial<SceneEffectConfig>) => {
    setSceneEffect(sceneId, partial);
  };

  const handleAudioChange = (partial: Partial<SceneAudioConfig>) => {
    setSceneAudioSettings(sceneId, partial);
  };

  return (
    <div className="space-y-3">
      {/* 장면 요약 */}
      <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/40">
        <div className="flex items-center gap-2 mb-1.5">
          {scene.imageUrl && (
            <img src={scene.imageUrl} alt="" className="w-12 h-8 rounded object-cover flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-200 truncate">{narrationText.slice(0, 30) || `장면 ${sceneId.slice(-4)}`}</p>
            {scene.videoUrl && <span className="text-[9px] text-amber-400">🎬 영상</span>}
          </div>
        </div>
      </div>

      {/* 효과 설정 */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 px-1">이미지 효과</p>
        <SceneEffectPicker
          effect={effect}
          onChange={handleEffectChange}
          imageUrl={scene.imageUrl}
        />
      </div>

      {/* 볼륨/속도 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30 space-y-2">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">오디오</p>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">볼륨</span>
            <span className="text-[10px] text-amber-400 font-mono">{audioSettings.volume}%</span>
          </div>
          <input
            type="range"
            min={0} max={200} step={5}
            value={audioSettings.volume}
            onChange={(e) => handleAudioChange({ volume: Number(e.target.value) })}
            className="w-full accent-amber-500 h-1"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">속도</span>
            <span className="text-[10px] text-amber-400 font-mono">{audioSettings.speed}x</span>
          </div>
          <input
            type="range"
            min={0.5} max={2.0} step={0.1}
            value={audioSettings.speed}
            onChange={(e) => handleAudioChange({ speed: Number(e.target.value) })}
            className="w-full accent-amber-500 h-1"
          />
        </div>
      </div>
    </div>
  );
};

export default VideoInspector;
