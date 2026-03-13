import React, { useMemo, useState, Suspense } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const EngagementBooster = React.lazy(() => import('./EngagementBooster'));

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 11 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };
const WEAK = 50;

interface Props { scriptText: string; instinctCount: number; }

export interface ParagraphScore {
  name: string; engagement: number; hook: number; tension: number;
  label: string; text: string; issues: string[]; tips: string[];
}

function scoreParagraph(text: string, idx: number, total: number): ParagraphScore {
  const sents = text.split(/(?<=[.!?。！？])\s*/).filter(Boolean);
  const sc = sents.length || 1;
  const isFirst = idx === 0, isLast = idx === total - 1;

  const qs = (text.match(/[?？]/g) || []).length;
  const excs = (text.match(/[!！]/g) || []).length;
  const hkw = (text.match(/놀라운|충격|비밀|사실|진짜|도대체|왜|어떻게|만약|지금/g) || []).length;
  const hook = Math.min(100, (isFirst ? 30 : 0) + qs * 12 + hkw * 10 + 20);

  const shortSents = sents.filter(s => s.trim().length < 25).length;
  const tw = (text.match(/하지만|그런데|갑자기|그때|반전|결국|마침내|드디어/g) || []).length;
  const tension = Math.min(100, 20 + (shortSents / sc) * 30 + excs * 8 + tw * 12);

  const engagement = Math.min(100, Math.round(hook * 0.4 + tension * 0.4 + (isFirst || isLast ? 20 : 0)));
  const label = isFirst ? '도입' : isLast ? '마무리' : idx < total * 0.3 ? '전개' : idx < total * 0.7 ? '중반' : '클라이맥스';
  const avgLen = text.length / sc;

  // 진단 + 팁
  const issues: string[] = [], tips: string[] = [];
  if (hook < WEAK) {
    if (qs === 0) { issues.push('질문 없음'); tips.push('❓ "왜 이런 일이 벌어졌을까?" 같은 물음을 넣어보세요'); }
    if (hkw === 0) { issues.push('훅 단어 없음'); tips.push('💡 "놀라운", "비밀", "진짜" 같은 단어를 활용해보세요'); }
    if (isFirst) tips.push('🎣 첫 문장을 숫자나 충격적 사실로 시작해보세요');
  }
  if (tension < WEAK) {
    if (avgLen > 40) { issues.push(`문장 평균 ${Math.round(avgLen)}자로 김`); tips.push('✂️ 문장을 25자 이하로 짧게 끊어보세요'); }
    if (tw === 0) { issues.push('반전 단어 없음'); tips.push('⚡ "하지만", "갑자기", "그런데" 같은 전환어를 넣어보세요'); }
    if (excs === 0 && shortSents / sc < 0.3) tips.push('🔥 짧은 문장으로 호흡을 조절해보세요');
  }
  if (hook < 40 && tension < 40) tips.push('🎯 시청자에게 직접 말 걸기: "이거 아셨어요?"');

  return { name: `${idx + 1}`, engagement, hook, tension, label, text, issues, tips };
}

export default function EngagementHeatmap({ scriptText, instinctCount }: Props) {
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [showBooster, setShowBooster] = useState(false);

  const { data, paragraphs } = useMemo(() => {
    if (!scriptText.trim()) return { data: [] as ParagraphScore[], paragraphs: [] as string[] };
    const ps = scriptText.split(/\n{2,}/).filter(Boolean);
    return { data: ps.slice(0, 20).map((p, i) => scoreParagraph(p, i, ps.length)), paragraphs: ps };
  }, [scriptText]);

  if (data.length < 2) return null;

  const avgE = Math.round(data.reduce((a, d) => a + d.engagement, 0) / data.length);
  const avgH = Math.round(data.reduce((a, d) => a + d.hook, 0) / data.length);
  const avgT = Math.round(data.reduce((a, d) => a + d.tension, 0) / data.length);
  const weakN = data.filter(d => d.engagement < WEAK).length;

  // 전체 진단 메시지: 연속된 약한 구간을 그루핑
  const diagMsgs = useMemo(() => {
    const idxs = data.map((d, i) => d.engagement < WEAK ? i : -1).filter(i => i >= 0);
    if (!idxs.length) return [];
    const ranges: [number, number][] = [];
    let s = idxs[0], e = s;
    for (let i = 1; i < idxs.length; i++) {
      if (idxs[i] === e + 1) e = idxs[i]; else { ranges.push([s, e]); s = idxs[i]; e = s; }
    }
    ranges.push([s, e]);
    return ranges.map(([a, b]) => {
      const lbl = a === b ? `${a + 1}번 문단` : `${a + 1}~${b + 1}번 문단`;
      const issues = new Set<string>();
      data.slice(a, b + 1).forEach(d => d.issues.forEach(i => issues.add(i)));
      return issues.size > 0 ? `${lbl} (${data[a].label}): ${Array.from(issues).join(', ')}` : '';
    }).filter(Boolean);
  }, [data]);

  const sel = selIdx !== null ? data[selIdx] : null;

  return (
    <div className="bg-gray-800/40 rounded-xl border border-emerald-700/30 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-white text-xs font-bold">H</div>
        <span className="text-sm font-bold text-white">참여 유도 히트맵</span>
        {instinctCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-violet-900/30 text-violet-300 border border-violet-500/30">본능 기제 {instinctCount}개 적용</span>
        )}
      </div>

      {/* 요약 메트릭 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: avgE, label: '평균 참여도', cls: avgE >= 60 ? 'text-green-400' : avgE >= 40 ? 'text-yellow-400' : 'text-red-400' },
          { v: avgH, label: '훅 강도', cls: avgH >= 60 ? 'text-cyan-400' : 'text-gray-400' },
          { v: avgT, label: '긴장감', cls: avgT >= 60 ? 'text-orange-400' : 'text-gray-400' },
        ].map(m => (
          <div key={m.label} className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/30 text-center">
            <div className={`text-xl font-black ${m.cls}`}>{m.v}</div>
            <div className="text-xs text-gray-400">{m.label}</div>
          </div>
        ))}
      </div>

      {/* 진단 패널 */}
      {diagMsgs.length > 0 && (
        <div className="bg-red-900/15 rounded-lg p-3 border border-red-500/20 space-y-1.5">
          <p className="text-xs font-bold text-red-300 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center text-[10px]">!</span>
            참여도 진단 — {weakN}개 구간이 약해요
          </p>
          {diagMsgs.map((msg, i) => <p key={i} className="text-xs text-red-200/70 pl-6">• {msg}</p>)}
        </div>
      )}

      {/* 히트맵 바 (클릭 가능) */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-gray-400">문단별 참여 유도 강도 <span className="text-gray-600 font-normal">(클릭하여 상세 보기)</span></p>
        <div className="flex gap-0.5 h-8 rounded-lg overflow-hidden">
          {data.map((d, i) => {
            const hue = d.engagement >= 70 ? '22,163,74' : d.engagement >= 50 ? '234,179,8' : d.engagement >= 30 ? '249,115,22' : '107,114,128';
            const isSel = selIdx === i;
            return (
              <div key={i} onClick={() => setSelIdx(isSel ? null : i)}
                className={`flex-1 relative group cursor-pointer transition-all ${isSel ? 'ring-2 ring-white/60 z-10 scale-y-125' : 'hover:brightness-125'}`}
                style={{ backgroundColor: `rgba(${hue},${0.3 + (d.engagement / 100) * 0.7})` }}
                title={`문단 ${i + 1}: ${d.label} (참여도 ${d.engagement})`}>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-bold text-white drop-shadow-lg">{d.engagement}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600"><span>도입</span><span>중반</span><span>마무리</span></div>
      </div>

      {/* 선택한 구간 상세 + 팁 */}
      {sel && (
        <div className="bg-gray-900/40 rounded-lg p-3 border border-gray-600/30 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">{sel.name}번 문단</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400">{sel.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${sel.engagement >= WEAK ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>참여도 {sel.engagement}</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {sel.text.slice(0, 150)}{sel.text.length > 150 ? '...' : ''}
          </p>
          {sel.tips.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-gray-700/30">
              <p className="text-[10px] font-bold text-cyan-400">개선 팁</p>
              {sel.tips.map((tip, i) => <p key={i} className="text-xs text-gray-300">{tip}</p>)}
            </div>
          )}
        </div>
      )}

      {/* 상세 차트 */}
      <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/20">
        <p className="text-xs font-bold text-gray-400 mb-2">참여도 구간 상세</p>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="hookGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} /><stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
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

      {/* AI 참여도 강화 */}
      {weakN > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowBooster(!showBooster)}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              showBooster ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg'
            }`}>
            {showBooster ? 'AI 강화 패널 닫기' : `AI로 참여도 강화 (약한 ${weakN}개 구간)`}
          </button>
          {showBooster && (
            <Suspense fallback={<div className="text-center py-4 text-sm text-gray-500">로딩 중...</div>}>
              <EngagementBooster data={data} paragraphs={paragraphs} onClose={() => setShowBooster(false)} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}
