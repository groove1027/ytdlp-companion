import React, { useMemo } from 'react';
import type { TopicRecommendation } from '../../../types';

interface Props {
  topics: TopicRecommendation[];
  selectedTopicId: string | null;
}

const RADAR_AXES = [
  { key: 'viral', label: '바이럴성' },
  { key: 'originality', label: '독창성' },
  { key: 'trend', label: '트렌드' },
  { key: 'channelFit', label: '채널 적합' },
  { key: 'ease', label: '제작 용이' },
] as const;

type AxisKey = typeof RADAR_AXES[number]['key'];

const TOPIC_COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];

const CX = 140, CY = 130, R = 95;

function polarToXY(angle: number, radius: number): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function topicToRadar(topic: TopicRecommendation): Record<AxisKey, number> {
  const viral = Math.min(100, topic.estimatedViralScore);
  // 추정값: 참고영상이 적으면 독창적
  const originality = topic.referenceVideos.length <= 1 ? 85 : topic.referenceVideos.length <= 2 ? 65 : 45;
  // 트렌드: 바이럴 점수 기반 추정
  const trend = Math.min(100, viral * 0.8 + 15);
  // 채널 적합: instinctMatch 길이 기반
  const channelFit = Math.min(100, 40 + (topic.instinctMatch?.split('+').length || 0) * 15);
  // 제작 용이: synopsis 짧을수록 쉬움
  const ease = Math.min(100, 90 - Math.min(50, Math.floor(topic.synopsis.length / 10)));
  return { viral, originality, trend, channelFit, ease };
}

export default function TopicComparisonRadar({ topics, selectedTopicId }: Props) {
  const radarData = useMemo(() => {
    return topics.slice(0, 5).map(t => ({
      topic: t,
      values: topicToRadar(t),
    }));
  }, [topics]);

  if (radarData.length === 0) return null;

  const axisCount = RADAR_AXES.length;
  const angleStep = 360 / axisCount;

  // 그리드 링
  const gridRings = [20, 40, 60, 80, 100];

  return (
    <div className="bg-gray-800/40 rounded-xl border border-pink-700/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">C</div>
        <span className="text-sm font-bold text-white">소재 비교 매트릭스</span>
        <span className="text-xs text-gray-500">{radarData.length}개 비교</span>
      </div>

      <div className="flex justify-center">
        <svg width="280" height="270" viewBox="0 0 280 270">
          {/* 그리드 */}
          {gridRings.map(ring => {
            const points = RADAR_AXES.map((_, i) => {
              const [x, y] = polarToXY(i * angleStep, (ring / 100) * R);
              return `${x},${y}`;
            }).join(' ');
            return <polygon key={ring} points={points} fill="none" stroke="#374151" strokeWidth={ring === 100 ? 1.5 : 0.5} />;
          })}

          {/* 축선 */}
          {RADAR_AXES.map((axis, i) => {
            const [x, y] = polarToXY(i * angleStep, R);
            const [lx, ly] = polarToXY(i * angleStep, R + 18);
            return (
              <g key={axis.key}>
                <line x1={CX} y1={CY} x2={x} y2={y} stroke="#4b5563" strokeWidth={0.5} />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fill="#9ca3af" fontSize={10} fontWeight={600}>{axis.label}</text>
              </g>
            );
          })}

          {/* 데이터 폴리곤 */}
          {radarData.map((rd, idx) => {
            const color = TOPIC_COLORS[idx % TOPIC_COLORS.length];
            const isSelected = rd.topic.id === selectedTopicId;
            const points = RADAR_AXES.map((axis, i) => {
              const val = rd.values[axis.key];
              const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
              return `${x},${y}`;
            }).join(' ');

            return (
              <g key={rd.topic.id}>
                <polygon points={points} fill={color} fillOpacity={isSelected ? 0.3 : 0.1}
                  stroke={color} strokeWidth={isSelected ? 2.5 : 1.5} strokeOpacity={isSelected ? 1 : 0.6} />
                {/* 꼭짓점 점 */}
                {RADAR_AXES.map((axis, i) => {
                  const val = rd.values[axis.key];
                  const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
                  return <circle key={axis.key} cx={x} cy={y} r={isSelected ? 3.5 : 2.5} fill={color} stroke="#1f2937" strokeWidth={1} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-2 justify-center">
        {radarData.map((rd, idx) => {
          const color = TOPIC_COLORS[idx % TOPIC_COLORS.length];
          const isSelected = rd.topic.id === selectedTopicId;
          return (
            <span key={rd.topic.id}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
                isSelected ? 'border-white/30 bg-gray-700/50 font-bold text-white' : 'border-gray-700/30 text-gray-400'
              }`}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {rd.topic.title.length > 12 ? rd.topic.title.substring(0, 12) + '...' : rd.topic.title}
            </span>
          );
        })}
      </div>

      {/* 스코어 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700/30">
              <th className="text-left py-1.5 px-2 text-gray-500 font-medium">소재</th>
              {RADAR_AXES.map(a => (
                <th key={a.key} className="text-center py-1.5 px-1 text-gray-500 font-medium">{a.label}</th>
              ))}
              <th className="text-center py-1.5 px-1 text-gray-500 font-medium">평균</th>
            </tr>
          </thead>
          <tbody>
            {radarData.map((rd, idx) => {
              const color = TOPIC_COLORS[idx % TOPIC_COLORS.length];
              const avg = Math.round(Object.values(rd.values).reduce((a, b) => a + b, 0) / RADAR_AXES.length);
              return (
                <tr key={rd.topic.id} className="border-b border-gray-700/10">
                  <td className="py-1.5 px-2 truncate max-w-[100px]" style={{ color }}>
                    {rd.topic.title.length > 10 ? rd.topic.title.substring(0, 10) + '...' : rd.topic.title}
                  </td>
                  {RADAR_AXES.map(a => (
                    <td key={a.key} className="text-center py-1.5 px-1 text-gray-300">{rd.values[a.key]}</td>
                  ))}
                  <td className="text-center py-1.5 px-1 font-bold" style={{ color }}>{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
