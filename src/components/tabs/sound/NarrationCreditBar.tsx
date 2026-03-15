import React from 'react';
import { ScriptLine } from '../../../types';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';

interface NarrationCreditBarProps {
  lines: ScriptLine[];
  isGenerating: boolean;
  progress: { current: number; total: number } | null;
  onGenerateAll: () => void;
  onRegenerateModified?: () => void;
}

const NarrationCreditBar: React.FC<NarrationCreditBarProps> = ({
  lines,
  isGenerating,
  progress,
  onGenerateAll,
  onRegenerateModified,
}) => {
  const elapsed = useElapsedTimer(isGenerating);
  const ttsEngine = useSoundStudioStore((s) => s.ttsEngine);
  const isFreeEngine = ttsEngine === 'supertonic';
  const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0);
  const estimatedCredits = isFreeEngine ? 0 : totalChars * 2;
  const doneCount = lines.filter((l) => l.ttsStatus === 'done').length;
  const modifiedCount = lines.filter((l) => !l.audioUrl || l.ttsStatus === 'idle' || l.ttsStatus === 'error').length;
  const totalCount = lines.length;

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-800 border-t border-gray-700 text-xs">
      {/* 크레딧 정보 */}
      <div className="text-gray-400">
        <span className="mr-1">&#128176;</span>
        {isFreeEngine
          ? <span className="text-green-400 font-semibold">무료 음성</span>
          : <>총 {totalChars.toLocaleString()}자 x 2 = <span className="text-yellow-400 font-semibold">{estimatedCredits.toLocaleString()}</span> 크레딧</>
        }
      </div>

      {/* 생성 완료 카운트 */}
      <div className="text-gray-400">
        <span className="text-green-400 font-semibold">{doneCount}</span>/{totalCount} 생성 완료
      </div>

      {/* 수정 대기 카운트 */}
      {modifiedCount > 0 && (
        <div className="text-yellow-400 font-semibold">
          {modifiedCount}개 수정됨
        </div>
      )}

      {/* 버튼 그룹 */}
      <div className="ml-auto flex items-center gap-2">
        {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
        {modifiedCount > 0 && onRegenerateModified && (
          <button
            type="button"
            onClick={onRegenerateModified}
            disabled={isGenerating}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border shadow-md ${
              isGenerating
                ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
                : 'bg-yellow-600/20 text-yellow-300 border-yellow-500/50 hover:bg-yellow-600/30'
            }`}
          >
            수정 {modifiedCount}개만 재생성
          </button>
        )}
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={isGenerating || lines.length === 0}
          className={`relative overflow-hidden px-4 py-2 rounded-lg text-xs font-bold transition-all border shadow-md ${
            isGenerating
              ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-400/50 hover:from-purple-500 hover:to-pink-500'
          }`}
        >
          {/* 프로그레스 바 오버레이 */}
          {isGenerating && progress && (
            <div
              className="absolute inset-0 bg-purple-500/30 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          )}
          <span className="relative z-10">
            {isGenerating && progress
              ? `${progress.current}/${progress.total} (${progressPercent}%)`
              : doneCount > 0 && doneCount < totalCount
              ? '재생성 & 병합'
              : '전체 생성 & 병합'}
          </span>
        </button>
      </div>
    </div>
  );
};

export default NarrationCreditBar;
