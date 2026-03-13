import React from 'react';
import { useEditRoomStore } from '../../../../stores/editRoomStore';
import type { AudioTrackId, TimelineLayerType } from '../../../../types';

interface AudioInspectorProps {
  layerType: TimelineLayerType;
  sceneId: string;
}

const LAYER_CONFIG: Record<string, { label: string; color: string; trackId: AudioTrackId }> = {
  narration: { label: '나레이션', color: 'green', trackId: 'narration' },
  origAudio: { label: '원본 오디오', color: 'rose', trackId: 'origAudio' },
  sfx: { label: '효과음 (SFX)', color: 'fuchsia', trackId: 'sfx' },
};

const AudioInspector: React.FC<AudioInspectorProps> = ({ layerType, sceneId }) => {
  const cfg = LAYER_CONFIG[layerType];
  if (!cfg) return null;

  const trackMixer = useEditRoomStore((s) => s.trackMixer[cfg.trackId]);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);
  const audioSettings = useEditRoomStore((s) => s.sceneAudioSettings[sceneId.replace(/^(va-|sfx-)/, '')]);
  const setSceneAudioSettings = useEditRoomStore((s) => s.setSceneAudioSettings);

  const volume = audioSettings?.volume ?? 100;
  const speed = audioSettings?.speed ?? 1.0;
  const realSceneId = sceneId.replace(/^(va-|sfx-)/, '');

  return (
    <div className="space-y-3">
      <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/40">
        <p className="text-xs font-bold text-gray-200">{cfg.label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">장면: {realSceneId.slice(-6)}</p>
      </div>

      {/* 뮤트/솔로 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">트랙 컨트롤</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTrackMixer(cfg.trackId, { mute: !trackMixer?.mute })}
            className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
              trackMixer?.mute
                ? 'bg-red-600/20 border-red-500/40 text-red-400'
                : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600'
            }`}
          >
            {trackMixer?.mute ? '🔇 뮤트됨' : '🔊 뮤트'}
          </button>
          <button
            type="button"
            onClick={() => setTrackMixer(cfg.trackId, { solo: !trackMixer?.solo })}
            className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
              trackMixer?.solo
                ? 'bg-yellow-600/20 border-yellow-500/40 text-yellow-400'
                : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600'
            }`}
          >
            {trackMixer?.solo ? '🎧 솔로됨' : '🎧 솔로'}
          </button>
        </div>
      </div>

      {/* 볼륨 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">볼륨</span>
          <span className={`text-[10px] text-${cfg.color}-400 font-mono`}>
            {volume <= 0 ? '-∞' : `${(20 * Math.log10(volume / 100)).toFixed(1)}`}dB
          </span>
        </div>
        <input
          type="range"
          min={0} max={200} step={5}
          value={volume}
          onChange={(e) => setSceneAudioSettings(realSceneId, { volume: Number(e.target.value) })}
          className={`w-full accent-${cfg.color}-500 h-1`}
        />
      </div>

      {/* 속도 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">속도</span>
          <span className={`text-[10px] text-${cfg.color}-400 font-mono`}>{speed}x</span>
        </div>
        <input
          type="range"
          min={0.5} max={2.0} step={0.1}
          value={speed}
          onChange={(e) => setSceneAudioSettings(realSceneId, { speed: Number(e.target.value) })}
          className={`w-full accent-${cfg.color}-500 h-1`}
        />
      </div>

      {/* 크로스페이드 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">크로스페이드</span>
          <span className="text-[10px] text-gray-300 font-mono">{trackMixer?.crossfadeMs ?? 0}ms</span>
        </div>
        <input
          type="range"
          min={0} max={200} step={10}
          value={trackMixer?.crossfadeMs ?? 0}
          onChange={(e) => setTrackMixer(cfg.trackId, { crossfadeMs: Number(e.target.value) })}
          className="w-full accent-gray-500 h-1"
        />
      </div>
    </div>
  );
};

export default AudioInspector;
