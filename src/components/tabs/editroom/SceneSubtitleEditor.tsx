import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SceneSubtitleConfig } from '../../../types';

// 28개 전체 애니메이션 프리셋 (SubtitleStyleEditor의 ANIM_PRESETS와 동일)
const ANIM_GROUPS = [
  {
    label: '입장',
    items: [
      { id: 'none', name: '없음' },
      { id: 'fadeIn', name: '페이드 인' },
      { id: 'fadeInUp', name: '아래서 등장' },
      { id: 'fadeInDown', name: '위에서 등장' },
      { id: 'slideL', name: '왼쪽 슬라이드' },
      { id: 'slideR', name: '오른쪽 슬라이드' },
      { id: 'zoomIn', name: '줌 인' },
      { id: 'zoomOut', name: '줌 아웃' },
    ],
  },
  {
    label: '반복/루프',
    items: [
      { id: 'pulse', name: '펄스' },
      { id: 'breathe', name: '숨쉬기' },
      { id: 'float', name: '둥실' },
      { id: 'shake', name: '흔들기' },
      { id: 'swing', name: '스윙' },
      { id: 'typing', name: '타이핑' },
      { id: 'blink', name: '깜빡임' },
    ],
  },
  {
    label: '화려한 입장',
    items: [
      { id: 'bounceIn', name: '바운스' },
      { id: 'elasticIn', name: '탄성' },
      { id: 'flipX', name: '가로뒤집기' },
      { id: 'flipY', name: '세로뒤집기' },
      { id: 'rotateIn', name: '회전등장' },
      { id: 'popIn', name: '팡 등장' },
      { id: 'lightSpeed', name: '광속' },
      { id: 'jackBox', name: '깜짝상자' },
    ],
  },
  {
    label: '화려한 루프',
    items: [
      { id: 'neonFlicker', name: '네온깜빡' },
      { id: 'glitch', name: '글리치' },
      { id: 'rainbow', name: '무지개' },
      { id: 'rubberBand', name: '고무줄' },
      { id: 'jello', name: '젤리' },
      { id: 'heartBeat', name: '심장박동' },
      { id: 'tada', name: '짜잔!' },
      { id: 'textGlow', name: '글로우' },
    ],
  },
];

/** 초 → MM:SS.ms 포맷 */
function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

/** MM:SS.ms → 초 변환 */
function parseTimecode(tc: string): number | null {
  const match = tc.match(/^(\d{1,2}):(\d{2})\.?(\d{0,2})$/);
  if (!match) return null;
  const m = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  const ms = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) : 0;
  return m * 60 + s + ms / 100;
}

const DEFAULT_MAX_CHARS = 20;
const RECOMMENDED_TOTAL_CHARS = 40;

/** 구두점 제거 (한국어 + 영어) */
function removePunctuation(text: string): string {
  return text.replace(/[.,!?;:…·。、！？；：「」『』""''~\-–—()（）[\]【】<>《》]/g, '');
}

interface SceneSubtitleEditorProps {
  subtitle: SceneSubtitleConfig;
  onChange: (partial: Partial<SceneSubtitleConfig>) => void;
  onSplit?: (splitPoint: number) => void;
}

const SceneSubtitleEditor: React.FC<SceneSubtitleEditorProps> = ({ subtitle, onChange, onSplit }) => {
  const [showTiming, setShowTiming] = useState(false);
  const [showAnim, setShowAnim] = useState(false);
  const [autoLineBreak, setAutoLineBreak] = useState(false);
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(DEFAULT_MAX_CHARS);
  const [showTools, setShowTools] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 로컬 상태: props 변경 시(split/merge) 동기화
  const [localText, setLocalText] = useState(subtitle.text);
  const [localStartTime, setLocalStartTime] = useState(formatTimecode(subtitle.startTime));
  const [localEndTime, setLocalEndTime] = useState(formatTimecode(subtitle.endTime));

  // 외부 변경(split/merge) 시 로컬 상태 동기화
  useEffect(() => {
    setLocalText(subtitle.text);
  }, [subtitle.text]);

  useEffect(() => {
    setLocalStartTime(formatTimecode(subtitle.startTime));
  }, [subtitle.startTime]);

  useEffect(() => {
    setLocalEndTime(formatTimecode(subtitle.endTime));
  }, [subtitle.endTime]);

  /** 자동 줄바꿈: maxCharsPerLine 기준으로 줄바꿈 삽입 (한국어 지원) */
  const applyAutoLineBreak = useCallback((raw: string): string => {
    if (!autoLineBreak) return raw;
    return raw.split('\n').map((line) => {
      if (line.length <= maxCharsPerLine) return line;

      // 공백이 포함되어 있으면 단어 기반 분할
      if (/\s/.test(line)) {
        const words = line.split(/(\s+)/);
        const result: string[] = [];
        let current = '';
        for (const w of words) {
          if ((current + w).length > maxCharsPerLine && current.length > 0) {
            result.push(current.trimEnd());
            current = w.trimStart();
          } else {
            current += w;
          }
        }
        if (current) result.push(current.trimEnd());
        return result.join('\n');
      }

      // [FIX #410/#415] 공백 없는 텍스트 (한국어) → 문장 부호/종결 어미 기준 분할
      const result: string[] = [];
      let remaining = line;
      while (remaining.length > maxCharsPerLine) {
        let breakIdx = -1;
        const searchEnd = Math.min(remaining.length, maxCharsPerLine + 5);
        for (let k = Math.min(searchEnd, remaining.length) - 1; k >= Math.max(0, maxCharsPerLine - 8); k--) {
          const ch = remaining[k];
          if ('.!?。！？,，、;；:：)）」』'.includes(ch)) { breakIdx = k + 1; break; }
          if (k > 0 && '다요죠고며서'.includes(ch) && k < searchEnd - 1) { breakIdx = k + 1; break; }
        }
        if (breakIdx <= 0 || breakIdx > maxCharsPerLine + 5) breakIdx = maxCharsPerLine;
        result.push(remaining.slice(0, breakIdx));
        remaining = remaining.slice(breakIdx);
      }
      if (remaining) result.push(remaining);
      return result.join('\n');
    }).join('\n');
  }, [autoLineBreak, maxCharsPerLine]);

  const handleTextChange = useCallback((text: string) => {
    const processed = applyAutoLineBreak(text);
    setLocalText(processed);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // 텍스트 수동 변경 시 기존 segments 무효화 (세그먼트는 이전 텍스트 기반)
      onChange({ text: processed, segments: undefined });
    }, 300);
  }, [onChange, applyAutoLineBreak]);

  const handleTimingChange = useCallback((field: 'startTime' | 'endTime', value: string) => {
    const seconds = parseTimecode(value);
    if (seconds !== null) {
      onChange({ [field]: seconds });
    }
  }, [onChange]);

  /** 구두점 제거 버튼 핸들러 */
  const handleRemovePunctuation = useCallback(() => {
    const cleaned = removePunctuation(localText);
    setLocalText(cleaned);
    onChange({ text: cleaned });
  }, [localText, onChange]);

  /** 커서 위치에서 자막 분리 */
  const handleSplit = useCallback(() => {
    if (!onSplit) return;
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : Math.floor(localText.length / 2);
    if (pos > 0 && pos < localText.length) {
      onSplit(pos);
    }
  }, [onSplit, localText]);

  /** Enter 키 → 자막 분리 (오디오 싱크 자동 분할) */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && onSplit) {
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      const pos = el.selectionStart;
      // 앞뒤 텍스트가 있어야 분리 가능
      const before = localText.slice(0, pos).trim();
      const after = localText.slice(pos).trim();
      if (before && after) {
        onSplit(pos);
      }
    }
  }, [onSplit, localText]);

  const currentAnim = subtitle.animationPreset || 'none';
  const currentAnimName = ANIM_GROUPS.flatMap((g) => g.items).find((a) => a.id === currentAnim)?.name || '없음';
  const duration = Math.max(0, subtitle.endTime - subtitle.startTime);

  const charCount = localText.length;
  const lineCount = localText.split('\n').length;
  const longestLine = Math.max(...localText.split('\n').map((l) => l.length), 0);
  const isOverLimit = charCount > RECOMMENDED_TOTAL_CHARS;
  const isLineTooLong = longestLine > maxCharsPerLine;

  return (
    <div className="space-y-2">
      {/* 자막 텍스트 — Enter: 자막 분리(오디오 싱크), Shift+Enter: 줄바꿈 */}
      <textarea
        ref={textareaRef}
        value={localText}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={onSplit ? '자막 입력... (Enter = 분리+오디오싱크, Shift+Enter = 줄바꿈)' : '자막 텍스트를 입력하세요...'}
        rows={2}
        className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-sm text-gray-200 resize-y focus:outline-none placeholder-gray-600 ${
          isOverLimit ? 'border-red-500/50 focus:border-red-500/70' : 'border-gray-700 focus:border-amber-500/50'
        }`}
      />

      {/* 글자 수 + Enter 안내 + 도구 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={isOverLimit ? 'text-red-400' : 'text-gray-500'}>
            {charCount}자
          </span>
          {onSplit && (
            <span className="text-cyan-600">
              Enter↵ 분리
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTools(!showTools)}
          className="text-gray-500 hover:text-amber-400 transition-colors text-xs"
        >
          {showTools ? '▼ 도구' : '▶ 도구'}
        </button>
      </div>

      {/* 자막 도구 패널 */}
      {showTools && (
        <div className="bg-gray-900/50 rounded-lg p-2 border border-gray-700/50 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 구두점 제거 */}
            <button
              type="button"
              onClick={handleRemovePunctuation}
              className="px-2 py-1 rounded text-xs font-bold bg-gray-800 border border-gray-700/50 text-gray-400 hover:text-amber-300 hover:border-amber-500/30 transition-all"
              title="모든 구두점(.,!?…등) 제거"
            >
              구두점 제거
            </button>

            {/* 자막 분리 */}
            {onSplit && (
              <button
                type="button"
                onClick={handleSplit}
                className="px-2 py-1 rounded text-xs font-bold bg-gray-800 border border-gray-700/50 text-gray-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all"
                title="커서 위치에서 자막을 두 장면으로 분리"
              >
                커서 분리
              </button>
            )}
          </div>

          {/* 자동 줄바꿈 + 글자수 설정 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-gray-500 hover:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLineBreak}
                onChange={(e) => setAutoLineBreak(e.target.checked)}
                className="w-3 h-3 accent-amber-500"
              />
              <span className="text-xs">자동 줄바꿈</span>
            </label>
            {autoLineBreak && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={maxCharsPerLine}
                  onChange={(e) => setMaxCharsPerLine(Math.max(5, Math.min(50, Number(e.target.value))))}
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-amber-400 font-mono focus:outline-none focus:border-amber-500/50 text-center"
                />
                <span className="text-xs text-gray-600">자/줄</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 타이밍 요약 + 토글 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowTiming(!showTiming)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 transition-colors"
        >
          <span>{showTiming ? '▼' : '▶'}</span>
          <span className="font-mono">
            {formatTimecode(subtitle.startTime)} → {formatTimecode(subtitle.endTime)}
          </span>
          <span className="text-gray-600">({duration.toFixed(1)}s)</span>
        </button>
      </div>

      {/* 타이밍 상세 편집 */}
      {showTiming && (
        <div className="grid grid-cols-2 gap-2 bg-gray-900/50 rounded-lg p-2 border border-gray-700/50">
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">시작 시간</label>
            <input
              type="text"
              value={localStartTime}
              onChange={(e) => setLocalStartTime(e.target.value)}
              onBlur={(e) => handleTimingChange('startTime', e.target.value)}
              placeholder="00:00.00"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-amber-400 font-mono focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">끝 시간</label>
            <input
              type="text"
              value={localEndTime}
              onChange={(e) => setLocalEndTime(e.target.value)}
              onBlur={(e) => handleTimingChange('endTime', e.target.value)}
              placeholder="00:03.00"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-amber-400 font-mono focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      )}

      {/* 애니메이션 선택 */}
      <div>
        <button
          type="button"
          onClick={() => setShowAnim(!showAnim)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 transition-colors"
        >
          <span>{showAnim ? '▼' : '▶'}</span>
          <span>애니메이션:</span>
          <span className={currentAnim !== 'none' ? 'text-amber-300 font-bold' : 'text-gray-500'}>
            {currentAnimName}
          </span>
        </button>

        {showAnim && (
          <div className="mt-1.5 space-y-2 bg-gray-900/50 rounded-lg p-2 border border-gray-700/50">
            {ANIM_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-gray-600 font-bold uppercase tracking-wider mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.items.map((anim) => (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => onChange({ animationPreset: anim.id })}
                      className={`px-1.5 py-0.5 rounded text-sm font-bold border transition-all ${
                        currentAnim === anim.id
                          ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                          : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {anim.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneSubtitleEditor;
