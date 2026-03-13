import React from 'react';
import { useEditRoomStore } from '../../../../stores/editRoomStore';

const BgmInspector: React.FC = () => {
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const trackMixer = useEditRoomStore((s) => s.trackMixer.bgm);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);

  if (!bgmTrack.audioUrl) {
    return (
      <div className="p-3 text-xs text-gray-500">
        BGM이 설정되어 있지 않습니다. 글로벌 패널에서 BGM을 추가하세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* BGM 정보 */}
      <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/40">
        <p className="text-xs font-bold text-gray-200">{bgmTrack.trackTitle || 'BGM'}</p>
        {bgmTrack.audioUrl && (
          <audio src={bgmTrack.audioUrl} controls className="w-full mt-1.5 h-7" />
        )}
      </div>

      {/* 뮤트/솔로 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">트랙 컨트롤</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTrackMixer('bgm', { mute: !trackMixer.mute })}
            className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
              trackMixer.mute
                ? 'bg-red-600/20 border-red-500/40 text-red-400'
                : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600'
            }`}
          >
            {trackMixer.mute ? '🔇 뮤트됨' : '🔊 뮤트'}
          </button>
          <button
            type="button"
            onClick={() => setTrackMixer('bgm', { solo: !trackMixer.solo })}
            className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
              trackMixer.solo
                ? 'bg-yellow-600/20 border-yellow-500/40 text-yellow-400'
                : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600'
            }`}
          >
            {trackMixer.solo ? '🎧 솔로됨' : '🎧 솔로'}
          </button>
        </div>
      </div>

      {/* 볼륨 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">볼륨</span>
          <span className="text-[10px] text-cyan-400 font-mono">
            {bgmTrack.volume <= 0 ? '-∞' : `${(20 * Math.log10(bgmTrack.volume / 100)).toFixed(1)}`}dB
          </span>
        </div>
        <input
          type="range"
          min={0} max={100} step={5}
          value={bgmTrack.volume}
          onChange={(e) => setBgmTrack({ volume: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
      </div>

      {/* 덕킹 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">덕킹</span>
          <span className="text-[10px] text-cyan-400 font-mono">
            {bgmTrack.duckingDb === 0 ? '없음' : `${bgmTrack.duckingDb}dB`}
          </span>
        </div>
        <input
          type="range"
          min={-24} max={0} step={3}
          value={bgmTrack.duckingDb}
          onChange={(e) => setBgmTrack({ duckingDb: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <p className="text-[9px] text-gray-600 mt-1">나레이션 구간에서 BGM 볼륨을 자동 낮춤</p>
      </div>

      {/* 페이드 인/아웃 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30 space-y-2">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">페이드</p>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">페이드 인</span>
            <span className="text-[10px] text-cyan-400 font-mono">{bgmTrack.fadeIn}s</span>
          </div>
          <input
            type="range"
            min={0} max={5} step={0.5}
            value={bgmTrack.fadeIn}
            onChange={(e) => setBgmTrack({ fadeIn: Number(e.target.value) })}
            className="w-full accent-cyan-500 h-1"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400">페이드 아웃</span>
            <span className="text-[10px] text-cyan-400 font-mono">{bgmTrack.fadeOut}s</span>
          </div>
          <input
            type="range"
            min={0} max={5} step={0.5}
            value={bgmTrack.fadeOut}
            onChange={(e) => setBgmTrack({ fadeOut: Number(e.target.value) })}
            className="w-full accent-cyan-500 h-1"
          />
        </div>
      </div>

      {/* 크로스페이드 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">크로스페이드</span>
          <span className="text-[10px] text-gray-300 font-mono">{trackMixer.crossfadeMs}ms</span>
        </div>
        <input
          type="range"
          min={0} max={200} step={10}
          value={trackMixer.crossfadeMs}
          onChange={(e) => setTrackMixer('bgm', { crossfadeMs: Number(e.target.value) })}
          className="w-full accent-gray-500 h-1"
        />
      </div>
    </div>
  );
};

export default BgmInspector;
