import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };

interface Props {
  originalScript: string;
  styledScript: string;
  styleName: string;
}

type DiffType = 'same' | 'added' | 'removed';

interface DiffChunk {
  type: DiffType;
  text: string;
}

/** 간단한 문장 단위 diff */
function sentenceDiff(original: string, styled: string): DiffChunk[] {
  const origSents = original.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
  const styledSents = styled.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
  const chunks: DiffChunk[] = [];
  const origSet = new Set(origSents.map(s => s.trim()));
  const styledSet = new Set(styledSents.map(s => s.trim()));

  // 변환 후 문장 순서로 표시
  styledSents.forEach(s => {
    const trimmed = s.trim();
    if (origSet.has(trimmed)) {
      chunks.push({ type: 'same', text: trimmed });
    } else {
      chunks.push({ type: 'added', text: trimmed });
    }
  });

  // 삭제된 문장
  origSents.forEach(s => {
    const trimmed = s.trim();
    if (!styledSet.has(trimmed)) {
      chunks.push({ type: 'removed', text: trimmed });
    }
  });

  return chunks;
}

/** 단어 빈도 상위 N개 */
function topWords(text: string, n: number): { word: string; count: number }[] {
  const words = text.replace(/[^가-힣a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const freq = new Map<string, number>();
  words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

export default function StyleDiffView({ originalScript, styledScript, styleName }: Props) {
  const [showDiff, setShowDiff] = useState(false);

  const stats = useMemo(() => {
    const origSents = originalScript.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
    const styledSents = styledScript.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
    const origAvgLen = origSents.length > 0 ? Math.round(originalScript.length / origSents.length) : 0;
    const styledAvgLen = styledSents.length > 0 ? Math.round(styledScript.length / styledSents.length) : 0;
    const charDiff = styledScript.length - originalScript.length;
    const sentDiff = styledSents.length - origSents.length;

    // 단어 빈도 비교
    const origWords = topWords(originalScript, 8);
    const styledWords = topWords(styledScript, 8);
    const allWords = new Set([...origWords.map(w => w.word), ...styledWords.map(w => w.word)]);
    const wordComparison = Array.from(allWords).slice(0, 10).map(word => {
      const origCount = origWords.find(w => w.word === word)?.count || 0;
      const styledCount = styledWords.find(w => w.word === word)?.count || 0;
      return { word, original: origCount, styled: styledCount };
    });

    return {
      origLen: originalScript.length,
      styledLen: styledScript.length,
      charDiff,
      origSentCount: origSents.length,
      styledSentCount: styledSents.length,
      sentDiff,
      origAvgLen,
      styledAvgLen,
      wordComparison,
    };
  }, [originalScript, styledScript]);

  const diffChunks = useMemo(() => {
    if (!showDiff) return [];
    return sentenceDiff(originalScript, styledScript);
  }, [showDiff, originalScript, styledScript]);

  // 변경률
  const changeRate = Math.round(Math.abs(stats.charDiff) / Math.max(1, stats.origLen) * 100);

  return (
    <div className="bg-gray-800/40 rounded-xl border border-violet-700/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center text-white text-xs font-bold">D</div>
        <span className="text-sm font-bold text-white">스타일 변환 비교</span>
        <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-300 border border-violet-500/30">{styleName}</span>
      </div>

      {/* 비교 메트릭 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className="text-xs text-gray-500 mb-1">글자수 변화</div>
          <div className={`text-lg font-black ${stats.charDiff > 0 ? 'text-green-400' : stats.charDiff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {stats.charDiff > 0 ? '+' : ''}{stats.charDiff.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className="text-xs text-gray-500 mb-1">문장수 변화</div>
          <div className={`text-lg font-black ${stats.sentDiff > 0 ? 'text-blue-400' : stats.sentDiff < 0 ? 'text-orange-400' : 'text-gray-400'}`}>
            {stats.sentDiff > 0 ? '+' : ''}{stats.sentDiff}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className="text-xs text-gray-500 mb-1">평균 문장 길이</div>
          <div className="text-sm">
            <span className="text-gray-400">{stats.origAvgLen}</span>
            <span className="text-gray-600 mx-1">→</span>
            <span className="text-white font-bold">{stats.styledAvgLen}</span>
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className="text-xs text-gray-500 mb-1">변경률</div>
          <div className="text-lg font-black text-violet-400">{changeRate}%</div>
        </div>
      </div>

      {/* 단어 빈도 비교 차트 */}
      <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
        <p className="text-xs font-bold text-gray-400 mb-2">단어 빈도 비교 (상위 10)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats.wordComparison} margin={{ top: 5, right: 5, bottom: 0, left: -10 }} layout="vertical">
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" tick={AXIS_STYLE} />
            <YAxis type="category" dataKey="word" tick={AXIS_STYLE} width={50} />
            <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
            <Bar dataKey="original" fill="#6b7280" name="원본" radius={[0, 3, 3, 0]} />
            <Bar dataKey="styled" fill="#8b5cf6" name={styleName} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Diff 토글 */}
      <button onClick={() => setShowDiff(!showDiff)}
        className="w-full text-left flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors py-1">
        <span>{showDiff ? '▼' : '▶'}</span>
        <span className="underline font-medium">문장 단위 변경 내역 {showDiff ? '접기' : '보기'}</span>
      </button>

      {showDiff && diffChunks.length > 0 && (
        <div className="bg-gray-900/40 rounded-lg p-3 max-h-[250px] overflow-auto border border-gray-700/20 space-y-0.5">
          {diffChunks.slice(0, 50).map((chunk, i) => (
            <p key={i} className={`text-xs leading-relaxed px-2 py-0.5 rounded ${
              chunk.type === 'added' ? 'bg-green-900/30 text-green-300 border-l-2 border-green-500'
                : chunk.type === 'removed' ? 'bg-red-900/30 text-red-300 border-l-2 border-red-500 line-through opacity-60'
                : 'text-gray-400'
            }`}>
              {chunk.type === 'added' ? '+ ' : chunk.type === 'removed' ? '- ' : '  '}
              {chunk.text}
            </p>
          ))}
          {diffChunks.length > 50 && (
            <p className="text-xs text-gray-600 text-center py-1">+{diffChunks.length - 50}개 더...</p>
          )}
        </div>
      )}
    </div>
  );
}
