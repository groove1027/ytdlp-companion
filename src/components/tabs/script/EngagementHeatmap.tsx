import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };

interface Props {
  scriptText: string;
  instinctCount: number;
}

interface ParagraphScore {
  name: string;
  engagement: number;
  hook: number;
  tension: number;
  label: string;
}

/** 문단별 참여 유도 점수 추정 */
function scoreParagraph(text: string, index: number, total: number): ParagraphScore {
  const sentences = text.split(/(?<=[.!?。！？])\s*/).filter(Boolean);
  const sentCount = sentences.length || 1;

  // 훅 요소: 첫 번째 문단에 가중치, 물음표/느낌표
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const questions = (text.match(/[?？]/g) || []).length;
  const exclamations = (text.match(/[!！]/g) || []).length;
  const hookWords = (text.match(/놀라운|충격|비밀|사실|진짜|도대체|왜|어떻게|만약|지금/g) || []).length;

  const hook = Math.min(100, (isFirst ? 30 : 0) + questions * 12 + hookWords * 10 + 20);

  // 긴장감: 짧은 문장 비율, 감정 표현, 반전 단어
  const shortSents = sentences.filter(s => s.trim().length < 25).length;
  const tensionWords = (text.match(/하지만|그런데|갑자기|그때|반전|결국|마침내|드디어/g) || []).length;
  const tension = Math.min(100, 20 + (shortSents / sentCount) * 30 + exclamations * 8 + tensionWords * 12);

  // 종합 참여도
  const engagement = Math.min(100, Math.round(hook * 0.4 + tension * 0.4 + (isFirst || isLast ? 20 : 0)));

  // 구간 라벨
  const label = isFirst ? '도입' : isLast ? '마무리' : index < total * 0.3 ? '전개' : index < total * 0.7 ? '중반' : '클라이맥스';

  return { name: `${index + 1}`, engagement, hook, tension, label };
}

export default function EngagementHeatmap({ scriptText, instinctCount }: Props) {
  const data = useMemo(() => {
    if (!scriptText.trim()) return [];
    const paragraphs = scriptText.split(/\n{2,}/).filter(Boolean);
    return paragraphs.slice(0, 20).map((p, i) => scoreParagraph(p, i, paragraphs.length));
  }, [scriptText]);

  if (data.length < 2) return null;

  // 전체 평균
  const avgEngagement = Math.round(data.reduce((a, d) => a + d.engagement, 0) / data.length);
  const avgHook = Math.round(data.reduce((a, d) => a + d.hook, 0) / data.length);
  const avgTension = Math.round(data.reduce((a, d) => a + d.tension, 0) / data.length);

  return (
    <div className="bg-gray-800/40 rounded-xl border border-emerald-700/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-white text-xs font-bold">H</div>
        <span className="text-sm font-bold text-white">참여 유도 히트맵</span>
        {instinctCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-300 border border-violet-500/30">
            본능 기제 {instinctCount}개 적용
          </span>
        )}
      </div>

      {/* 요약 메트릭 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className={`text-xl font-black ${avgEngagement >= 60 ? 'text-green-400' : avgEngagement >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{avgEngagement}</div>
          <div className="text-xs text-gray-400">평균 참여도</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className={`text-xl font-black ${avgHook >= 60 ? 'text-cyan-400' : 'text-gray-400'}`}>{avgHook}</div>
          <div className="text-xs text-gray-400">훅 강도</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
          <div className={`text-xl font-black ${avgTension >= 60 ? 'text-orange-400' : 'text-gray-400'}`}>{avgTension}</div>
          <div className="text-xs text-gray-400">긴장감</div>
        </div>
      </div>

      {/* 히트맵 바 */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-gray-400">문단별 참여 유도 강도</p>
        <div className="flex gap-0.5 h-8 rounded-lg overflow-hidden">
          {data.map((d, i) => {
            const hue = d.engagement >= 70 ? '22, 163, 74' : d.engagement >= 50 ? '234, 179, 8' : d.engagement >= 30 ? '249, 115, 22' : '107, 114, 128';
            return (
              <div key={i} className="flex-1 relative group cursor-default"
                style={{ backgroundColor: `rgba(${hue}, ${0.3 + (d.engagement / 100) * 0.7})` }}
                title={`문단 ${i + 1}: ${d.label} (참여도 ${d.engagement})`}>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-bold text-white drop-shadow-lg">{d.engagement}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>도입</span>
          <span>중반</span>
          <span>마무리</span>
        </div>
      </div>

      {/* 상세 차트 */}
      <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
        <p className="text-xs font-bold text-gray-400 mb-2">참여도 구간 상세</p>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="hookGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="name" tick={AXIS_STYLE} />
            <YAxis tick={AXIS_STYLE} domain={[0, 100]} />
            <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }}
              formatter={(value: number, name: string) => [value, name === 'engagement' ? '참여도' : name === 'hook' ? '훅 강도' : '긴장감']} />
            <Area type="monotone" dataKey="engagement" stroke="#10b981" strokeWidth={2} fill="url(#engGrad)" name="참여도" />
            <Area type="monotone" dataKey="hook" stroke="#06b6d4" strokeWidth={1.5} fill="url(#hookGrad)" name="훅 강도" />
            <Area type="monotone" dataKey="tension" stroke="#f97316" strokeWidth={1} fill="none" strokeDasharray="4 2" name="긴장감" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
