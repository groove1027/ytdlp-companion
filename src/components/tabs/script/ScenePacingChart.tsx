import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from 'recharts';

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };

interface Props {
  scenes: string[];
}

/** 문장 에너지 추정: 느낌표/물음표=높음, 짧은 문장=빠른 템포 */
function estimateEnergy(text: string): number {
  const len = text.length;
  const excl = (text.match(/[!！]/g) || []).length;
  const ques = (text.match(/[?？]/g) || []).length;
  const shortSentences = text.split(/[.!?。！？]/).filter(s => s.trim().length > 0 && s.trim().length < 20).length;
  const base = 40;
  const emotionBonus = Math.min(30, (excl + ques) * 10);
  const tempoBonus = Math.min(20, shortSentences * 5);
  const lengthBonus = len > 200 ? 10 : len > 100 ? 5 : 0;
  return Math.min(100, base + emotionBonus + tempoBonus + lengthBonus);
}

export default function ScenePacingChart({ scenes }: Props) {
  const data = useMemo(() => {
    return scenes.map((scene, i) => ({
      name: `${i + 1}`,
      chars: scene.length,
      energy: estimateEnergy(scene),
      // 3-act ideal reference
      ideal: i < scenes.length * 0.25 ? 60 + (i / (scenes.length * 0.25)) * 20
        : i < scenes.length * 0.75 ? 80 - ((i - scenes.length * 0.25) / (scenes.length * 0.5)) * 10
        : 70 + ((i - scenes.length * 0.75) / (scenes.length * 0.25)) * 30,
    }));
  }, [scenes]);

  // 클라이맥스 지점 자동 감지
  const climaxIdx = useMemo(() => {
    let maxE = 0, idx = 0;
    data.forEach((d, i) => { if (d.energy > maxE) { maxE = d.energy; idx = i; } });
    return idx;
  }, [data]);

  if (scenes.length < 2) return null;

  return (
    <div className="bg-gray-800/40 rounded-xl border border-amber-700/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-bold">P</div>
        <span className="text-sm font-bold text-white">장면 페이싱 분석</span>
        <span className="text-xs text-gray-500">{scenes.length}개 장면</span>
      </div>

      {/* 에너지 곡선 */}
      <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
        <p className="text-xs font-bold text-gray-400 mb-2">긴장도 / 에너지 곡선</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="idealGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="name" tick={AXIS_STYLE} label={{ value: '장면', position: 'insideBottom', offset: -2, style: { ...AXIS_STYLE, fontSize: 10 } }} />
            <YAxis tick={AXIS_STYLE} domain={[0, 100]} />
            <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }}
              formatter={(value: number, name: string) => [`${value}`, name === 'energy' ? '에너지' : '이상 곡선']} />
            <Area type="monotone" dataKey="ideal" stroke="#6366f1" strokeDasharray="5 5" strokeWidth={1.5} fill="url(#idealGrad)" name="이상 곡선" />
            <Area type="monotone" dataKey="energy" stroke="#f59e0b" strokeWidth={2} fill="url(#energyGrad)" name="에너지"
              dot={{ r: 3, fill: '#f59e0b', stroke: '#1f2937', strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#fbbf24' }} />
            <ReferenceLine x={`${climaxIdx + 1}`} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'CLIMAX', position: 'top', fill: '#ef4444', fontSize: 10 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 장면별 길이 */}
      <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
        <p className="text-xs font-bold text-gray-400 mb-2">장면별 글자수 (길이 밸런스)</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="name" tick={AXIS_STYLE} />
            <YAxis tick={AXIS_STYLE} />
            <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
            <Bar dataKey="chars" name="글자수" radius={[3, 3, 0, 0]}
              fill="#8b5cf6"
              // 하이라이트 클라이맥스
              shape={(props: { x: number; y: number; width: number; height: number; index: number }) => {
                const { x, y, width, height, index } = props;
                const isClimax = index === climaxIdx;
                return <rect x={x} y={y} width={width} height={height} rx={3} ry={3}
                  fill={isClimax ? '#ef4444' : '#8b5cf6'} opacity={isClimax ? 1 : 0.7} />;
              }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 3막 구조 범례 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 justify-center">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> 에너지 곡선</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block" style={{ borderTop: '1px dashed #6366f1' }} /> 이상 3막 구조</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 inline-block rounded-sm" /> 클라이맥스</span>
      </div>
    </div>
  );
}
