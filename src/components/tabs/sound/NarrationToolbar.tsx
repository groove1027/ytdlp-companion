import React from 'react';
import { Speaker } from '../../../types';
import { TYPECAST_EMOTIONS } from '../../../constants';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';

interface NarrationToolbarProps {
  speaker: Speaker | null;
  onOpenVoiceBrowser: () => void;
  globalEmotion: string;
  setGlobalEmotion: (e: string) => void;
  globalSpeed: number;
  setGlobalSpeed: (s: number) => void;
  smartEmotion: boolean;
  setSmartEmotion: (v: boolean) => void;
  isGenerating: boolean;
  onGenerateAll: () => void;
  onPlayAll: () => void;
  onDownload: () => void;
  mergedAudioUrl: string | null;
}

const NarrationToolbar: React.FC<NarrationToolbarProps> = ({
  speaker,
  onOpenVoiceBrowser,
  globalEmotion,
  setGlobalEmotion,
  globalSpeed,
  setGlobalSpeed,
  smartEmotion,
  setSmartEmotion,
  isGenerating,
  onGenerateAll,
  onPlayAll,
  onDownload,
  mergedAudioUrl,
}) => {
  const elapsed = useElapsedTimer(isGenerating);
  const currentEmotion = TYPECAST_EMOTIONS.find((e) => e.id === globalEmotion);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex-wrap">
      {/* 캐릭터 선택 버튼 */}
      <button
        type="button"
        onClick={onOpenVoiceBrowser}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-sm font-medium text-gray-200 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">
          {speaker?.name?.charAt(0) || '?'}
        </span>
        <span className="truncate max-w-[100px]">{speaker?.name || '캐릭터 선택'}</span>
      </button>

      {/* Smart Emotion 토글 */}
      <button
        type="button"
        onClick={() => setSmartEmotion(!smartEmotion)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          smartEmotion
            ? 'bg-purple-600/30 border-purple-500 text-purple-300'
            : 'bg-gray-700 border-gray-600 text-gray-400'
        }`}
      >
        <span>{smartEmotion ? 'ON' : 'OFF'}</span>
        <span>스마트 감정</span>
      </button>

      {/* 감정 드롭다운 */}
      <div className="relative">
        <select
          value={globalEmotion}
          onChange={(e) => setGlobalEmotion(e.target.value)}
          disabled={smartEmotion}
          className="appearance-none bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {TYPECAST_EMOTIONS.map((em) => (
            <option key={em.id} value={em.id}>
              {em.icon} {em.labelKo}
            </option>
          ))}
        </select>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">
          {currentEmotion?.icon}
        </span>
      </div>

      {/* 속도 입력 */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-400">속도</label>
        <input
          type="number"
          min={0.5}
          max={2.0}
          step={0.1}
          value={globalSpeed}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0.5 && v <= 2.0) setGlobalSpeed(v);
          }}
          className="w-16 bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <span className="text-xs text-gray-500">x</span>
      </div>

      {/* 우측 버튼 그룹 */}
      <div className="ml-auto flex items-center gap-2">
        {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!mergedAudioUrl || isGenerating}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &#9654; 전체 재생
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!mergedAudioUrl || isGenerating}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &#11015; 다운로드
        </button>
      </div>
    </div>
  );
};

export default NarrationToolbar;
