import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { ScriptLine, SceneAudioConfig } from '../../../types';
import { logger } from '../../../services/LoggerService';

interface SceneNarrationPlayerProps {
  line: ScriptLine | null;
  audioSettings: SceneAudioConfig;
  onChangeAudio: (partial: Partial<SceneAudioConfig>) => void;
}

const SceneNarrationPlayer: React.FC<SceneNarrationPlayerProps> = ({
  line,
  audioSettings,
  onChangeAudio,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const audioUrl = line?.audioUrl;

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.playbackRate = audioSettings.speed;
      el.volume = Math.min(1, audioSettings.volume / 100);
      el.play().catch((e) => { logger.trackSwallowedError('SceneNarrationPlayer:togglePlay', e); });
    }
  }, [isPlaying, audioSettings]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = audioSettings.speed;
    el.volume = Math.min(1, audioSettings.volume / 100);
  }, [audioSettings.speed, audioSettings.volume]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (!audioUrl) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <span>🔇</span> 오디오 없음
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => { setIsPlaying(true); setAudioError(false); }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setAudioError(true)}
        onTimeUpdate={(e) => setCurrent((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => { setDuration((e.target as HTMLAudioElement).duration); setAudioError(false); }}
      />

      <div className="flex items-center gap-2">
        {/* 재생 버튼 */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-sm flex items-center justify-center transition-colors flex-shrink-0"
        >
          {isPlaying ? (
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
          )}
        </button>

        {/* 진행 바 */}
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* 시간 표시 */}
        <span className={`text-sm font-mono flex-shrink-0 ${audioError ? 'text-red-400' : 'text-gray-500'}`}>
          {audioError ? '오류' : `${formatTime(currentTime)}/${formatTime(duration)}`}
        </span>

        {/* 설정 토글 */}
        <button
          type="button"
          onClick={() => setShowControls(!showControls)}
          className={`text-sm px-1.5 py-0.5 rounded transition-colors ${showControls ? 'bg-amber-600/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          ⚙
        </button>
      </div>

      {/* 볼륨/속도 슬라이더 */}
      {showControls && (
        <div className="grid grid-cols-2 gap-2 bg-gray-900/50 rounded-lg p-2 border border-gray-700/50">
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">볼륨 {audioSettings.volume}%</label>
            <input
              type="range"
              min={0} max={200} step={5}
              value={audioSettings.volume}
              onChange={(e) => onChangeAudio({ volume: Number(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">속도 {audioSettings.speed}x</label>
            <input
              type="range"
              min={0.5} max={2} step={0.1}
              value={audioSettings.speed}
              onChange={(e) => onChangeAudio({ speed: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneNarrationPlayer;
