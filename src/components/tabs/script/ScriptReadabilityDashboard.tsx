import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };

interface Props {
  scriptText: string;
}

interface ParagraphStat {
  name: string;
  chars: number;
  sentences: number;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?。！？\n])\s*/).filter(s => s.trim().length > 0);
}

/** 고유 단어 / 전체 단어 비율 (%) */
function vocabDiversity(text: string): number {
  const words = text.replace(/[^가-힣a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return Math.round((unique.size / words.length) * 100);
}

/** 감정 강도 추정: 느낌표, 물음표, 감정 표현 비율 */
function emotionIntensity(text: string): number {
  const total = text.length || 1;
  const excl = (text.match(/[!！]/g) || []).length;
  const ques = (text.match(/[?？]/g) || []).length;
  return Math.min(100, Math.round(((excl + ques) / total) * 1000));
}

export default function ScriptReadabilityDashboard({ scriptText }: Props) {
  const analysis = useMemo(() => {
    if (!scriptText.trim()) return null;

    const paragraphs = scriptText.split(/\n{2,}/).filter(Boolean);
    const sentences = splitSentences(scriptText);
    const sentenceCount = sentences.length;
    const avgSentenceLen = sentenceCount > 0 ? Math.round(scriptText.length / sentenceCount) : 0;
    const diversity = vocabDiversity(scriptText);
    const emotion = emotionIntensity(scriptText);
    const readingTimeSec = Math.round((scriptText.length / 650) * 60);
    const readingMin = Math.floor(readingTimeSec / 60);
    const readingSec = readingTimeSec % 60;

    // 문장 길이 분포
    const lengthBuckets = [
      { name: '~20자', count: 0 },
      { name: '20~40', count: 0 },
      { name: '40~60', count: 0 },
      { name: '60~80', count: 0 },
      { name: '80자+', count: 0 },
    ];
    sentences.forEach(s => {
      const len = s.trim().length;
      if (len <= 20) lengthBuckets[0].count++;
      else if (len <= 40) lengthBuckets[1].count++;
      else if (len <= 60) lengthBuckets[2].count++;
      else if (len <= 80) lengthBuckets[3].count++;
      else lengthBuckets[4].count++;
    });

    // 문단별 밀도
    const paraStats: ParagraphStat[] = paragraphs.slice(0, 15).map((p, i) => ({
      name: `${i + 1}`,
      chars: p.length,
      sentences: splitSentences(p).length,
    }));

    return { sentenceCount, avgSentenceLen, diversity, emotion, readingMin, readingSec, lengthBuckets, paraStats, paragraphs: paragraphs.length };
  }, [scriptText]);

  if (!analysis) return null;

  const { sentenceCount, avgSentenceLen, diversity, emotion, readingMin, readingSec, lengthBuckets, paraStats, paragraphs } = analysis;

  // 평균 문장 길이 평가
  const lenLevel = avgSentenceLen <= 30 ? { label: '짧음', color: 'text-green-400', bg: 'bg-green-500' }
    : avgSentenceLen <= 50 ? { label: '적정', color: 'text-blue-400', bg: 'bg-blue-500' }
    : { label: '긺', color: 'text-yellow-400', bg: 'bg-yellow-500' };

  // 원형 프로그레스 (어휘 다양성)
  const R = 22;
  const C = 2 * Math.PI * R;
  const diversityOffset = C - (diversity / 100) * C;

  return (
    <div className="bg-gray-800/40 rounded-xl border border-violet-700/30 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">R</div>
        <span className="text-sm font-bold text-white">대본 가독성 분석</span>
      </div>

      {/* 상단 메트릭 카드 4개 */}
      <div className="grid grid-cols-4 gap-3">
        {/* 문장 수 */}
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30 text-center">
          <div className="text-2xl font-black text-white">{sentenceCount}</div>
          <div className="text-xs text-gray-400 mt-0.5">문장 수</div>
        </div>

        {/* 평균 문장 길이 */}
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30 text-center">
          <div className={`text-2xl font-black ${lenLevel.color}`}>{avgSentenceLen}<span className="text-sm font-normal text-gray-500">자</span></div>
          <div className="text-xs text-gray-400 mt-0.5">평균 문장 길이 <span className={`${lenLevel.color} font-bold`}>{lenLevel.label}</span></div>
        </div>

        {/* 어휘 다양성 */}
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30 flex items-center justify-center gap-2">
          <div className="relative flex-shrink-0">
            <svg width="56" height="56" className="-rotate-90">
              <circle cx="28" cy="28" r={R} fill="none" stroke="#374151" strokeWidth="5" />
              <circle cx="28" cy="28" r={R} fill="none"
                stroke={diversity >= 60 ? '#22c55e' : diversity >= 40 ? '#eab308' : '#ef4444'}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={diversityOffset}
                className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-black text-white">{diversity}%</span>
            </div>
          </div>
          <div className="text-xs text-gray-400">어휘<br/>다양성</div>
        </div>

        {/* 예상 읽기 시간 */}
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30 text-center">
          <div className="text-2xl font-black text-cyan-300">{readingMin}<span className="text-sm font-normal text-gray-500">분</span> {readingSec}<span className="text-sm font-normal text-gray-500">초</span></div>
          <div className="text-xs text-gray-400 mt-0.5">예상 나레이션</div>
          <div className="text-xs text-gray-500">{paragraphs}개 문단</div>
        </div>
      </div>

      {/* 감정 강도 바 */}
      <div className="flex items-center gap-3 bg-gray-900/30 rounded-lg px-3 py-2 border border-gray-700/20">
        <span className="text-xs text-gray-400 flex-shrink-0 w-16">감정 강도</span>
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${emotion}%`,
              background: emotion >= 60 ? 'linear-gradient(to right, #ef4444, #f97316)' : emotion >= 30 ? 'linear-gradient(to right, #eab308, #f59e0b)' : 'linear-gradient(to right, #6b7280, #9ca3af)'
            }} />
        </div>
        <span className="text-xs text-gray-300 font-bold w-8 text-right">{emotion}</span>
      </div>

      {/* 차트 2개 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 문장 길이 분포 */}
        <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
          <p className="text-xs font-bold text-gray-400 mb-2">문장 길이 분포</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={lengthBuckets} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" tick={AXIS_STYLE} />
              <YAxis tick={AXIS_STYLE} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
              <Bar dataKey="count" fill="#8b5cf6" name="문장 수" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 문단별 밀도 */}
        <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
          <p className="text-xs font-bold text-gray-400 mb-2">문단별 글자수</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={paraStats} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="name" tick={AXIS_STYLE} />
              <YAxis tick={AXIS_STYLE} />
              <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
              <Bar dataKey="chars" fill="#3b82f6" name="글자수" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
