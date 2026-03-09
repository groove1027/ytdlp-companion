import React, { useMemo } from 'react';
import type { ChannelGuideline, ChannelScript } from '../../../types';

interface Props {
  guideline: ChannelGuideline | null;
  scripts: ChannelScript[];
  /** 현재 대본 (비교용) */
  currentScript?: string;
}

const RADAR_AXES = [
  { key: 'hookStrength', label: '훅 강도' },
  { key: 'sentenceLen', label: '문장 길이' },
  { key: 'emotionExpr', label: '감정 표현' },
  { key: 'ctaFreq', label: 'CTA 빈도' },
  { key: 'jargonRatio', label: '전문용어' },
] as const;

type AxisKey = typeof RADAR_AXES[number]['key'];

const CX = 130, CY = 120, R = 85;

function polarToXY(angle: number, radius: number): [number, number] {
  const rad = (angle - 90) * (Math.PI / 180);
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

/** 대본 텍스트에서 5축 메트릭 추정 */
function analyzeScript(text: string): Record<AxisKey, number> {
  if (!text) return { hookStrength: 0, sentenceLen: 0, emotionExpr: 0, ctaFreq: 0, jargonRatio: 0 };

  const first100 = text.substring(0, 100);
  const hookStrength = Math.min(100,
    (first100.match(/[?？!！]/g) || []).length * 15 +
    (first100.length < 50 ? 30 : 10) +
    (/지금|놀라운|충격|비밀|몰랐|사실은/i.test(first100) ? 25 : 0) + 20
  );

  const sentences = text.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
  const avgLen = sentences.length > 0 ? text.length / sentences.length : 0;
  const sentenceLen = Math.min(100, Math.round(avgLen * 1.5));

  const emotionWords = (text.match(/[!！]{1,}|ㅠ|ㅋ|하하|대박|와|세상에|놀라운|충격|감동|무서운|슬픈|기쁜|화가/g) || []).length;
  const emotionExpr = Math.min(100, Math.round((emotionWords / Math.max(1, sentences.length)) * 100));

  const ctaWords = (text.match(/구독|좋아요|알림|댓글|공유|채널|영상|클릭|링크|확인/g) || []).length;
  const ctaFreq = Math.min(100, ctaWords * 12);

  const jargon = (text.match(/알고리즘|ROI|KPI|인사이트|퍼널|리텐션|엔게이지먼트|CTR|CVR|SEO|트래픽|바이럴/gi) || []).length;
  const jargonRatio = Math.min(100, jargon * 15);

  return { hookStrength, sentenceLen, emotionExpr, ctaFreq, jargonRatio };
}

export default function BenchmarkRadarChart({ guideline, scripts, currentScript }: Props) {
  const benchmarkProfile = useMemo(() => {
    if (scripts.length === 0) return null;
    const allText = scripts.slice(0, 5).map(s => s.transcript).join('\n\n');
    return analyzeScript(allText);
  }, [scripts]);

  const currentProfile = useMemo(() => {
    if (!currentScript?.trim()) return null;
    return analyzeScript(currentScript);
  }, [currentScript]);

  if (!benchmarkProfile) return null;

  const axisCount = RADAR_AXES.length;
  const angleStep = 360 / axisCount;
  const gridRings = [25, 50, 75, 100];

  const benchmarkPoints = RADAR_AXES.map((axis, i) => {
    const val = benchmarkProfile[axis.key];
    const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
    return `${x},${y}`;
  }).join(' ');

  const currentPoints = currentProfile ? RADAR_AXES.map((axis, i) => {
    const val = currentProfile[axis.key];
    const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
    return `${x},${y}`;
  }).join(' ') : null;

  // 유사도 계산
  const similarity = currentProfile ? Math.round(
    100 - (RADAR_AXES.reduce((acc, axis) => acc + Math.abs(benchmarkProfile[axis.key] - currentProfile[axis.key]), 0) / RADAR_AXES.length)
  ) : null;

  return (
    <div className="bg-gray-900/40 rounded-lg border border-gray-700/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400">채널 스타일 프로필</p>
        {similarity !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
            similarity >= 70 ? 'bg-green-900/30 text-green-400 border-green-500/30'
              : similarity >= 40 ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30'
              : 'bg-red-900/30 text-red-400 border-red-500/30'
          }`}>
            유사도 {similarity}%
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <svg width="260" height="250" viewBox="0 0 260 250">
          {/* 그리드 */}
          {gridRings.map(ring => {
            const pts = RADAR_AXES.map((_, i) => {
              const [x, y] = polarToXY(i * angleStep, (ring / 100) * R);
              return `${x},${y}`;
            }).join(' ');
            return <polygon key={ring} points={pts} fill="none" stroke="#374151" strokeWidth={ring === 100 ? 1 : 0.5} />;
          })}

          {/* 축 */}
          {RADAR_AXES.map((axis, i) => {
            const [x, y] = polarToXY(i * angleStep, R);
            const [lx, ly] = polarToXY(i * angleStep, R + 16);
            return (
              <g key={axis.key}>
                <line x1={CX} y1={CY} x2={x} y2={y} stroke="#4b5563" strokeWidth={0.5} />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fill="#9ca3af" fontSize={9} fontWeight={600}>{axis.label}</text>
              </g>
            );
          })}

          {/* 벤치마크 (초록) */}
          <polygon points={benchmarkPoints} fill="#22c55e" fillOpacity={0.15} stroke="#22c55e" strokeWidth={2} />
          {RADAR_AXES.map((axis, i) => {
            const val = benchmarkProfile[axis.key];
            const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
            return <circle key={axis.key} cx={x} cy={y} r={3} fill="#22c55e" stroke="#1f2937" strokeWidth={1} />;
          })}

          {/* 현재 대본 (보라) */}
          {currentPoints && currentProfile && (
            <>
              <polygon points={currentPoints} fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 2" />
              {RADAR_AXES.map((axis, i) => {
                const val = currentProfile[axis.key];
                const [x, y] = polarToXY(i * angleStep, (val / 100) * R);
                return <circle key={axis.key} cx={x} cy={y} r={3} fill="#8b5cf6" stroke="#1f2937" strokeWidth={1} />;
              })}
            </>
          )}
        </svg>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 justify-center text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-green-500 inline-block" />
          <span className="text-green-400">{guideline?.channelName || '벤치마크'}</span>
        </span>
        {currentProfile && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-violet-500 inline-block" style={{ borderTop: '1px dashed #8b5cf6' }} />
            <span className="text-violet-400">현재 대본</span>
          </span>
        )}
      </div>
    </div>
  );
}
