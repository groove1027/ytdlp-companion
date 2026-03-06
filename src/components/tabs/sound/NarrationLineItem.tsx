import React, { useState, useRef, useEffect } from 'react';
import { ScriptLine, Speaker } from '../../../types';
import { TYPECAST_EMOTIONS } from '../../../constants';

interface NarrationLineItemProps {
  line: ScriptLine;
  index: number;
  lineNumber: number | null;  // null = character voice line (no number)
  isLast: boolean;
  speaker: Speaker | null;
  globalEmotion: string;
  globalSpeed: number;
  smartEmotion: boolean;
  onGenerateLine: (lineId: string) => void;
  onPlayLine: (lineId: string) => void;
  onEditLine: (lineId: string, text: string) => void;
  onAddAfter: (lineId: string) => void;
  onMergeNext: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdateEmotion: (lineId: string, emotion: string) => void;
  onUpdateSpeed: (lineId: string, speed: number) => void;
}

const NarrationLineItem: React.FC<NarrationLineItemProps> = ({
  line,
  index,
  lineNumber,
  isLast,
  speaker,
  globalEmotion,
  globalSpeed,
  smartEmotion,
  onGenerateLine,
  onPlayLine,
  onEditLine,
  onAddAfter,
  onMergeNext,
  onRemoveLine,
  onUpdateEmotion,
  onUpdateSpeed,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(line.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const status = line.ttsStatus || 'idle';
  const isModified = status === 'idle' && !line.audioUrl;
  const isError = status === 'error';
  const isDone = status === 'done' && !!line.audioUrl;
  const effectiveEmotion = line.emotion || globalEmotion;
  const effectiveSpeed = line.lineSpeed ?? globalSpeed;
  const emotionInfo = TYPECAST_EMOTIONS.find((e) => e.id === effectiveEmotion);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleConfirmEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== line.text) {
      onEditLine(line.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(line.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // 재생/생성 버튼 색상
  const playButtonClass =
    status === 'done'
      ? 'bg-green-600 hover:bg-green-500 text-white'
      : status === 'generating'
      ? 'bg-purple-600 text-white cursor-wait'
      : 'bg-gray-600 hover:bg-gray-500 text-gray-300';

  return (
    <div className={`group relative flex items-start gap-3 px-4 py-3 hover:bg-gray-800/50 border-b border-gray-800 transition-colors ${isModified ? 'border-l-2 border-l-yellow-500/60' : isError ? 'border-l-2 border-l-red-500/60' : ''}`}>
      {/* 라인 번호 / 캐릭터 뱃지 */}
      {lineNumber != null ? (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 mt-0.5">
          {lineNumber}
        </div>
      ) : (
        <div className="flex-shrink-0 h-7 rounded-full bg-indigo-900/40 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-300 mt-0.5 px-2 whitespace-nowrap max-w-[80px] truncate"
          title={line.voiceName || '캐릭터'}>
          {line.voiceName || '🎭'}
        </div>
      )}

      {/* 상태 표시 + 재생/생성 버튼 */}
      <div className="flex-shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
        <button
          type="button"
          onClick={() => (status === 'done' ? onPlayLine(line.id) : onGenerateLine(line.id))}
          disabled={status === 'generating'}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${playButtonClass}`}
        >
          {status === 'generating' ? (
            <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
          ) : status === 'done' ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
          )}
        </button>
        {isModified && (
          <span className="text-[9px] text-yellow-400 font-bold leading-none">재생성</span>
        )}
        {isError && (
          <span className="text-[9px] text-red-400 font-bold leading-none">오류</span>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="w-full bg-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 border border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmEdit}
                className="px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white"
              >
                확인
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1 rounded text-xs font-semibold bg-gray-600 hover:bg-gray-500 text-gray-300"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <p
            onClick={() => { setEditText(line.text); setIsEditing(true); }}
            className="text-sm text-gray-200 leading-relaxed cursor-text hover:text-white transition-colors"
          >
            {line.text}
          </p>
        )}
      </div>

      {/* 감정 + 속도 뱃지 */}
      <div className="flex-shrink-0 flex items-center gap-2 mt-1">
        {/* 감정 뱃지 */}
        <select
          value={effectiveEmotion}
          onChange={(e) => onUpdateEmotion(line.id, e.target.value)}
          disabled={smartEmotion}
          className="appearance-none bg-gray-700/60 border border-gray-600 text-[10px] text-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
          title={emotionInfo?.description || ''}
        >
          {TYPECAST_EMOTIONS.map((em) => (
            <option key={em.id} value={em.id}>
              {em.icon} {em.labelKo}
            </option>
          ))}
        </select>

        {/* 속도 뱃지 */}
        <input
          type="number"
          min={0.5}
          max={2.0}
          step={0.1}
          value={effectiveSpeed}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0.5 && v <= 2.0) onUpdateSpeed(line.id, v);
          }}
          className="w-12 bg-gray-700/60 border border-gray-600 text-[10px] text-gray-300 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
          title="라인 속도"
        />

        {/* 글자수 */}
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{line.text.length}자</span>
      </div>

      {/* 호버 액션 바 */}
      <div className="absolute right-2 -top-3 hidden group-hover:flex items-center gap-1 bg-gray-700 border border-gray-600 rounded-lg px-1.5 py-1 shadow-lg z-10">
        <button
          type="button"
          onClick={() => { setEditText(line.text); setIsEditing(true); }}
          className="px-1.5 py-0.5 rounded text-[10px] text-gray-300 hover:bg-gray-600 transition-colors"
          title="편집"
        >
          편집
        </button>
        <button
          type="button"
          onClick={() => onAddAfter(line.id)}
          className="px-1.5 py-0.5 rounded text-[10px] text-gray-300 hover:bg-gray-600 transition-colors"
          title="아래에 추가"
        >
          추가
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={() => onMergeNext(line.id)}
            className="px-1.5 py-0.5 rounded text-[10px] text-gray-300 hover:bg-gray-600 transition-colors"
            title="다음 줄과 병합"
          >
            병합
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemoveLine(line.id)}
          className="px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-900/30 transition-colors"
          title="삭제"
        >
          삭제
        </button>
      </div>
    </div>
  );
};

export default NarrationLineItem;
