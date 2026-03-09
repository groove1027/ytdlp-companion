import React, { useState, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine, Legend, LineChart, Line } from 'recharts';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { showToast } from '../../../stores/uiStore';
import { searchKeyword, getRelatedKeywords, getTopVideos, getVideoTags } from '../../../services/youtubeAnalysisService';
import { getYoutubeApiKey } from '../../../services/apiService';
import type { KeywordAnalysisResult, KeywordTag, TopVideo } from '../../../types';

// ═══════════════════════════════════════════════════
// 상수 & 유틸
// ═══════════════════════════════════════════════════

type ResultTab = 'related' | 'videos' | 'tags' | 'history';
type DurationFilter = 'all' | 'short' | 'medium' | 'long';

const LANG_OPTIONS = [
  { id: 'ko' as const, label: '한국어' },
  { id: 'ja' as const, label: '日本語' },
  { id: 'en' as const, label: 'EN' },
];
const DURATION_OPTIONS: { id: DurationFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'short', label: '쇼츠' },
  { id: 'medium', label: '중간' },
  { id: 'long', label: '롱폼' },
];

function scoreColor(score: number, invert = false): string {
  const v = invert ? 100 - score : score;
  return v >= 70 ? 'text-green-400' : v >= 40 ? 'text-yellow-400' : 'text-red-400';
}
function scoreBg(score: number, invert = false): string {
  const v = invert ? 100 - score : score;
  return v >= 70 ? 'bg-green-400' : v >= 40 ? 'bg-yellow-400' : 'bg-red-400';
}
function trendInfo(t: 'rising' | 'stable' | 'declining') {
  return t === 'rising' ? { label: '상승', color: 'text-green-400', icon: '↑' }
    : t === 'stable' ? { label: '안정', color: 'text-yellow-400', icon: '→' }
    : { label: '하락', color: 'text-red-400', icon: '↓' };
}
function fmtNum(n: number): string {
  if (n >= 1e8) return Math.floor(n / 1e8) + '억';
  if (n >= 1e4) return Math.floor(n / 1e4) + '만';
  return n.toLocaleString();
}
function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 1) return '오늘';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
function getDailyViews(viewCount: number, publishedAt: string): number {
  const days = Math.max(1, Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000));
  return Math.round(viewCount / days);
}
function isSmallChannelSuccess(subCount: number, ratio: number): boolean {
  return subCount > 0 && subCount < 50000 && ratio > 5000;
}

interface SeoCheck { title: boolean; tags: boolean; desc: boolean; descLength: boolean }
function analyzeSeo(v: TopVideo, kw: string): SeoCheck {
  const q = kw.toLowerCase();
  return {
    title: v.title.toLowerCase().includes(q),
    tags: v.tags.some(t => t.toLowerCase().includes(q)),
    desc: v.description.toLowerCase().includes(q),
    descLength: v.description.length > 500,
  };
}
function seoScore(s: SeoCheck): number {
  return [s.title, s.tags, s.desc, s.descLength].filter(Boolean).length;
}

// ═══════════════════════════════════════════════════
// Recharts 다크 테마 공통 스타일
// ═══════════════════════════════════════════════════

const CHART_TOOLTIP = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' };
const AXIS_STYLE = { fill: '#9ca3af', fontSize: 12 };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#374151' };

// ═══════════════════════════════════════════════════
// SVG 레이더 차트
// ═══════════════════════════════════════════════════

const RADAR_AXES = ['검색량', '기회점수', '채널다양성', '경쟁도(낮을수록↑)', '트렌드'];
const RADAR_SIZE = 140;
const RADAR_CENTER = RADAR_SIZE;
const RADAR_COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444'];

function radarPoint(axisIdx: number, value: number, total: number): [number, number] {
  const angle = (Math.PI * 2 * axisIdx) / total - Math.PI / 2;
  const r = (value / 100) * RADAR_SIZE;
  return [RADAR_CENTER + r * Math.cos(angle), RADAR_CENTER + r * Math.sin(angle)];
}

function radarPolygonPoints(values: number[]): string {
  return values.map((v, i) => radarPoint(i, v, values.length).join(',')).join(' ');
}

const RadarChart: React.FC<{ items: { keyword: string; values: number[] }[] }> = ({ items }) => {
  const total = RADAR_AXES.length;
  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <svg viewBox={`0 0 ${RADAR_CENTER * 2} ${RADAR_CENTER * 2 + 30}`} className="w-full max-w-[340px] mx-auto">
      {/* 그리드 */}
      {gridLevels.map(lv => (
        <polygon key={lv}
          points={Array.from({ length: total }, (_, i) => radarPoint(i, lv, total).join(',')).join(' ')}
          fill="none" stroke="rgb(55,65,81)" strokeWidth="0.5" />
      ))}
      {/* 축선 */}
      {RADAR_AXES.map((_, i) => {
        const [x, y] = radarPoint(i, 100, total);
        return <line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={x} y2={y} stroke="rgb(75,85,99)" strokeWidth="0.5" />;
      })}
      {/* 데이터 폴리곤 */}
      {items.map((item, idx) => (
        <polygon key={idx} points={radarPolygonPoints(item.values)}
          fill={RADAR_COLORS[idx % RADAR_COLORS.length]} fillOpacity={0.15}
          stroke={RADAR_COLORS[idx % RADAR_COLORS.length]} strokeWidth="2" />
      ))}
      {/* 데이터 점 */}
      {items.map((item, idx) =>
        item.values.map((v, ai) => {
          const [cx, cy] = radarPoint(ai, v, total);
          return <circle key={`${idx}-${ai}`} cx={cx} cy={cy} r="3" fill={RADAR_COLORS[idx % RADAR_COLORS.length]} />;
        })
      )}
      {/* 축 라벨 */}
      {RADAR_AXES.map((label, i) => {
        const [x, y] = radarPoint(i, 115, total);
        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 text-[10px]">{label}</text>;
      })}
      {/* 범례 */}
      {items.map((item, idx) => (
        <g key={idx} transform={`translate(${10 + idx * 100}, ${RADAR_CENTER * 2 + 12})`}>
          <rect width="10" height="10" rx="2" fill={RADAR_COLORS[idx % RADAR_COLORS.length]} />
          <text x="14" y="9" className="fill-gray-300 text-[10px]">{item.keyword}</text>
        </g>
      ))}
    </svg>
  );
};

function resultToRadarValues(r: KeywordAnalysisResult): number[] {
  const trendVal = r.trend === 'rising' ? 90 : r.trend === 'stable' ? 50 : 15;
  return [r.searchVolume, r.opportunityScore, (r.channelDiversity / 25) * 100, 100 - r.competition, trendVal];
}

// ═══════════════════════════════════════════════════
// 서브 컴포넌트
// ═══════════════════════════════════════════════════

const SeoBadge: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
    active ? 'bg-green-900/40 text-green-400 border-green-700/50' : 'bg-gray-800 text-gray-500 border-gray-700/50'
  }`}>{label}</span>
);

const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="flex items-center justify-center h-32 text-gray-600 text-base">{msg}</div>
);

// ═══════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════

const KeywordLab: React.FC = () => {
  const {
    keyword, language, keywordResults, relatedKeywords, topVideos, tags,
    isAnalyzing, apiUsagePercent,
    setKeyword, setLanguage, setIsAnalyzing, setApiUsagePercent, analyze, clearKeywordHistory,
  } = useChannelAnalysisStore();

  const { requireAuth } = useAuthGuard();
  const elapsed = useElapsedTimer(isAnalyzing);
  const [resultTab, setResultTab] = useState<ResultTab>('related');
  const [error, setError] = useState('');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');

  const latest = keywordResults.length > 0 ? keywordResults[keywordResults.length - 1] : null;

  // ── SEO 종합 점수 ──
  const avgSeoScore = useMemo(() => {
    if (topVideos.length === 0 || !keyword.trim()) return null;
    const total = topVideos.reduce((acc, v) => acc + seoScore(analyzeSeo(v, keyword)), 0);
    return (total / topVideos.length * 25); // 4점 만점 → 100점 환산
  }, [topVideos, keyword]);

  // ── 영상 길이 필터 적용 ──
  const filteredVideos = useMemo(() => {
    if (durationFilter === 'all') return topVideos;
    return topVideos.filter(v => {
      const parts = v.duration.match(/(\d+):(\d+):(\d+)/);
      const secs = parts
        ? parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseInt(parts[3])
        : (() => { const m2 = v.duration.match(/(\d+):(\d+)/); return m2 ? parseInt(m2[1]) * 60 + parseInt(m2[2]) : 0; })();
      if (durationFilter === 'short') return secs < 240;
      if (durationFilter === 'medium') return secs >= 240 && secs <= 1200;
      return secs > 1200; // long
    });
  }, [topVideos, durationFilter]);

  // ── 레이더 차트 데이터 (최근 3개 키워드 비교) ──
  const radarData = useMemo(() => {
    const unique = [...new Map(keywordResults.map(r => [r.keyword, r])).values()];
    return unique.slice(-3).map(r => ({ keyword: r.keyword, values: resultToRadarValues(r) }));
  }, [keywordResults]);

  // ── 분석 실행 ──
  const handleAnalyze = useCallback(async (targetKeyword?: string) => {
    const kw = targetKeyword || keyword;
    if (!requireAuth('키워드 분석')) return;
    if (!kw.trim() || isAnalyzing) return;
    if (!getYoutubeApiKey()) {
      setError('YouTube API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    if (targetKeyword) setKeyword(targetKeyword);
    setIsAnalyzing(true);
    setError('');

    try {
      // 1. 키워드 분석
      const keywordResult = await searchKeyword(kw, language, 'KR');
      setApiUsagePercent(Math.min(100, apiUsagePercent + 5));

      // 2. 연관 키워드 (쿼터 소모 없음)
      const related = await getRelatedKeywords(kw, language);

      // 3. 상위 영상
      const videos = await getTopVideos(kw, 10);
      setApiUsagePercent(Math.min(100, apiUsagePercent + 15));

      // 4. 태그 수집 — 상위 3개 영상 병렬 처리
      const tagArrays = await Promise.all(
        videos.slice(0, 3).map(v => getVideoTags(v.videoId))
      );
      const tagMap = new Map<string, number>();
      for (const arr of tagArrays) {
        for (const t of arr) tagMap.set(t.tag, (tagMap.get(t.tag) || 0) + t.frequency);
      }
      const mergedTags: KeywordTag[] = Array.from(tagMap.entries())
        .map(([tag, frequency]) => ({ tag, frequency }))
        .sort((a, b) => b.frequency - a.frequency);

      setApiUsagePercent(Math.min(100, apiUsagePercent + 5));

      // 5. 스토어에 결과 반영 (히스토리 누적)
      analyze({
        keywordResults: [keywordResult],
        relatedKeywords: related,
        topVideos: videos,
        tags: mergedTags,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[KeywordLab] 키워드 분석 실패:', e);
      setError(`키워드 분석 실패: ${msg}`);
      setIsAnalyzing(false);
    }
  }, [keyword, language, isAnalyzing, apiUsagePercent, setKeyword, setIsAnalyzing, setApiUsagePercent, analyze, requireAuth]);

  // ── 태그 복사 ──
  const handleCopyTags = useCallback(async () => {
    const text = tags.map(t => t.tag).join(', ');
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    showToast('클립보드에 복사되었습니다.');
  }, [tags]);

  // ── CSV 내보내기 (전체 분석 결과) ──
  const handleExportCsv = useCallback(() => {
    const header = '키워드,검색량,경쟁도,기회점수,트렌드,총결과,평균조회,채널다양성\n';
    const rows = keywordResults.map(r =>
      `${r.keyword},${r.searchVolume},${r.competition},${r.opportunityScore},${r.trend},${r.totalResults},${r.avgViews},${r.channelDiversity}`
    ).join('\n');
    const tagHeader = '\n\n태그,빈도\n';
    const tagRows = tags.map(t => `${t.tag},${t.frequency}`).join('\n');
    const csv = '\uFEFF' + header + rows + tagHeader + tagRows; // BOM for Korean Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `keyword-analysis-${keyword || 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [keywordResults, tags, keyword]);

  // ── JSON 내보내기 ──
  const handleExportJson = useCallback(() => {
    const data = { keywordResults, topVideos, relatedKeywords, tags };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `keyword-${keyword || 'export'}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [keywordResults, topVideos, relatedKeywords, tags, keyword]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* ═══ 검색 바 ═══ */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-xl">
        <p className="text-sm text-gray-400 mb-3">YouTube Data API로 키워드 검색량, 경쟁도, 기회점수를 분석하고 연관 키워드, 상위 영상, 태그를 수집합니다.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="분석할 YouTube 키워드 (예: AI 영상 편집, 여행 브이로그)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 pr-10" />
            {isAnalyzing && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
              </div>
            )}
          </div>
          <button onClick={() => handleAnalyze()} disabled={isAnalyzing || !keyword.trim()}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            {isAnalyzing ? '분석 중...' : '분석'}
          </button>
        </div>

        {error && (
          <div className="mt-3 px-4 py-2.5 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* 언어 + 길이 필터 */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            {LANG_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setLanguage(o.id)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${language === o.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            {DURATION_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setDurationFilter(o.id)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${durationFilter === o.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ 스코어 카드 + 레이더 차트 ═══ */}
      {latest && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 왼쪽: 점수 카드 그리드 */}
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: '검색량', v: latest.searchVolume, c: scoreColor(latest.searchVolume) },
              { l: '경쟁도', v: latest.competition, c: scoreColor(latest.competition, true) },
              { l: '기회점수', v: latest.opportunityScore, c: scoreColor(latest.opportunityScore) },
            ].map(s => (
              <div key={s.l} className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
                <p className="text-sm text-gray-500 mb-1">{s.l}</p>
                <p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
                <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${s.c.replace('text-', 'bg-')}`} style={{ width: `${s.v}%` }} />
                </div>
              </div>
            ))}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
              <p className="text-sm text-gray-500 mb-1">트렌드</p>
              <p className={`text-3xl font-bold ${trendInfo(latest.trend).color}`}>{trendInfo(latest.trend).icon}</p>
              <p className={`text-sm mt-1 ${trendInfo(latest.trend).color}`}>{trendInfo(latest.trend).label}</p>
            </div>

            {/* SEO 종합 난이도 */}
            {avgSeoScore !== null && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center col-span-2">
                <p className="text-sm text-gray-500 mb-1">상위 영상 SEO 평균</p>
                <div className="flex items-center justify-center gap-3">
                  <p className={`text-3xl font-bold ${scoreBg(avgSeoScore).replace('bg-', 'text-')}`}>{Math.round(avgSeoScore)}</p>
                  <div className="flex-1 max-w-[160px]">
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${scoreBg(avgSeoScore)}`} style={{ width: `${avgSeoScore}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{avgSeoScore >= 70 ? 'SEO 경쟁 치열' : avgSeoScore >= 40 ? 'SEO 보통' : 'SEO 진입 용이'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 통계 */}
            {[
              { l: '총 검색결과', v: fmtNum(latest.totalResults) },
              { l: '평균 조회수', v: fmtNum(latest.avgViews) },
              { l: '채널 다양성', v: `${latest.channelDiversity}/25` },
              { l: '데이터 소스', v: latest.dataSource === 'realtime' ? '실시간' : '캐시' },
            ].map(s => (
              <div key={s.l} className="bg-gray-800/60 rounded-lg px-4 py-2 border border-gray-700/50 flex items-center justify-between">
                <span className="text-sm text-gray-500">{s.l}</span>
                <span className="text-sm font-semibold text-gray-200">{s.v}</span>
              </div>
            ))}
          </div>

          {/* 오른쪽: 레이더 차트 (키워드 비교) */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-300">키워드 비교 차트</p>
              {keywordResults.length > 1 && (
                <button onClick={clearKeywordHistory} className="text-[10px] text-gray-500 hover:text-red-400 transition-colors">히스토리 초기화</button>
              )}
            </div>
            {radarData.length > 0 ? (
              <RadarChart items={radarData} />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-gray-600 text-sm">키워드를 분석하면 차트가 표시됩니다</div>
            )}
            {radarData.length >= 2 && (
              <p className="text-[10px] text-gray-500 text-center mt-1">최근 분석한 키워드 최대 3개를 비교합니다</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ 키워드 포지셔닝 맵 (산점도) ═══ */}
      {keywordResults.length >= 2 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-sm font-bold text-gray-300 mb-3">키워드 포지셔닝 맵</p>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="competition" name="경쟁도" domain={[0, 100]} tick={AXIS_STYLE} label={{ value: '경쟁도', position: 'insideBottom', offset: -10, style: AXIS_STYLE }} />
              <YAxis type="number" dataKey="opportunity" name="기회점수" domain={[0, 100]} tick={AXIS_STYLE} label={{ value: '기회점수', angle: -90, position: 'insideLeft', offset: 10, style: AXIS_STYLE }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }}
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0].payload as { name: string; competition: number; opportunity: number; volume: number };
                  return (
                    <div style={CHART_TOOLTIP} className="px-3 py-2 text-sm">
                      <p className="font-bold text-gray-200 mb-1">{d.name}</p>
                      <p className="text-gray-400">경쟁도: <span className="text-white">{d.competition}</span></p>
                      <p className="text-gray-400">기회점수: <span className="text-white">{d.opportunity}</span></p>
                      <p className="text-gray-400">검색량: <span className="text-white">{fmtNum(d.volume)}</span></p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={50} stroke="#4b5563" strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke="#4b5563" strokeDasharray="3 3" />
              <Scatter
                data={keywordResults.map(r => ({ name: r.keyword, competition: r.competition, opportunity: r.opportunityScore, volume: r.searchVolume }))}
                fill="#3b82f6"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-green-400 text-right mt-1 mr-4 opacity-70">우상단 = 블루오션</p>
        </div>
      )}

      {/* ═══ 결과 탭 ═══ */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="flex border-b border-gray-700">
          {([
            { id: 'related' as ResultTab, label: '연관 키워드', count: relatedKeywords.length },
            { id: 'videos' as ResultTab, label: '상위 영상', count: filteredVideos.length },
            { id: 'tags' as ResultTab, label: '태그 클라우드', count: tags.length },
            { id: 'history' as ResultTab, label: '분석 히스토리', count: keywordResults.length },
          ]).map(t => (
            <button key={t.id} onClick={() => setResultTab(t.id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
                resultTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {t.label} {t.count > 0 && <span className="text-sm text-gray-600 ml-1">({t.count})</span>}
            </button>
          ))}
        </div>

        <div className={`p-4 overflow-y-auto custom-scrollbar ${resultTab === 'videos' ? 'max-h-[900px]' : 'max-h-[500px]'}`}>

          {/* ── 연관 키워드 (클릭 → 즉시 분석) ── */}
          {resultTab === 'related' && (relatedKeywords.length === 0
            ? <Empty msg="키워드를 분석하면 연관 키워드가 표시됩니다." />
            : (
              <div className="space-y-2">
                {relatedKeywords.map((item, i) => (
                  <button key={i} type="button" onClick={() => handleAnalyze(item.keyword)}
                    className="w-full flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-2.5 hover:bg-blue-900/20 hover:border-blue-500/30 border border-transparent transition-all text-left group">
                    <span className="text-sm text-gray-200 group-hover:text-blue-300 transition-colors">{item.keyword}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.score}%` }} />
                      </div>
                      <span className="text-sm font-mono text-gray-400 w-8 text-right">{item.score}</span>
                      <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── 상위 영상 (길이 필터 적용) ── */}
          {resultTab === 'videos' && (filteredVideos.length === 0
            ? <Empty msg={topVideos.length > 0 ? '필터 조건에 맞는 영상이 없습니다.' : '키워드를 분석하면 상위 영상이 표시됩니다.'} />
            : (
              <div className="space-y-4">
                {filteredVideos.map(v => {
                  const seo = analyzeSeo(v, keyword);
                  const smallSuccess = isSmallChannelSuccess(v.subscriberCount, v.viewToSubRatio);
                  const daily = getDailyViews(v.viewCount, v.publishedAt);
                  const seoTotal = seoScore(seo);
                  return (
                    <div key={v.videoId} className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden hover:border-gray-600 transition-all">
                      {smallSuccess && (
                        <div className="bg-green-900/30 px-4 py-1.5 border-b border-green-800/40">
                          <span className="text-sm font-bold text-green-400">소채널 성공</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex gap-4">
                          <div className="w-[220px] h-[130px] flex-shrink-0 rounded-lg overflow-hidden bg-gray-700 relative">
                            {v.thumbnail
                              ? <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No Thumb</div>}
                            <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[13px] px-1.5 py-0.5 rounded font-mono font-semibold">{v.duration}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-200 leading-snug">{v.title}</p>
                            <p className="text-sm text-gray-500 mt-1.5">{v.channelTitle} · {v.channelSubscribers}</p>
                            <p className="text-sm text-gray-400 mt-0.5">{fmtNum(v.viewCount)} 조회</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                              <SeoBadge label="제목" active={seo.title} />
                              <SeoBadge label="태그" active={seo.tags} />
                              <SeoBadge label="설명" active={seo.desc} />
                              <SeoBadge label="설명길이" active={seo.descLength} />
                              <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${
                                seoTotal >= 3 ? 'bg-green-900/40 text-green-400 border-green-700/50'
                                : seoTotal >= 2 ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50'
                                : 'bg-red-900/40 text-red-400 border-red-700/50'
                              }`}>SEO {seoTotal}/4</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-gray-700/50 text-sm text-gray-400">
                          <span>{timeAgo(v.publishedAt)}</span>
                          <span>일 {fmtNum(daily)}회</span>
                          <span>👍 {fmtNum(v.likeCount)}</span>
                          <span>💬 {fmtNum(v.commentCount)}</span>
                          <span className="text-orange-400">🔥 참여 {v.engagement.toFixed(1)}%</span>
                          <span className="text-pink-400 font-semibold">🔗 조회/구독 {fmtNum(v.viewToSubRatio)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── 참여율 비교 막대 차트 ── */}
                {topVideos.length > 0 && (
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mt-6">
                    <p className="text-sm font-bold text-gray-300 mb-3">상위 영상 참여율 비교</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topVideos.slice(0, 10).map(v => ({ name: v.title.substring(0, 12) + '...', engagement: v.engagement, viewToSub: v.viewToSubRatio, channel: v.channelTitle }))} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid {...GRID_STYLE} />
                        <XAxis dataKey="name" tick={AXIS_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={AXIS_STYLE} />
                        <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                        <Bar dataKey="engagement" fill="#10b981" name="참여율(%)" />
                        <Bar dataKey="viewToSub" fill="#f59e0b" name="조회/구독(%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── SEO 점수 분포 (스택 바) ── */}
                {topVideos.length > 0 && (
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mt-4">
                    <p className="text-sm font-bold text-gray-300 mb-3">SEO 점수 분포</p>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topVideos.slice(0, 10).map(v => {
                        const kw = keyword.toLowerCase();
                        return {
                          name: v.title.substring(0, 12) + '...',
                          title: v.title.toLowerCase().includes(kw) ? 1 : 0,
                          tags: v.tags.some(t => t.toLowerCase().includes(kw)) ? 1 : 0,
                          desc: v.description.toLowerCase().includes(kw) ? 1 : 0,
                          descLen: (v.description?.length || 0) >= 100 ? 1 : 0,
                        };
                      })} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid {...GRID_STYLE} />
                        <XAxis dataKey="name" tick={AXIS_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={AXIS_STYLE} domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} />
                        <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                        <Bar dataKey="title" stackId="seo" fill="#22c55e" name="제목 키워드" />
                        <Bar dataKey="tags" stackId="seo" fill="#3b82f6" name="태그 키워드" />
                        <Bar dataKey="desc" stackId="seo" fill="#a855f7" name="설명 키워드" />
                        <Bar dataKey="descLen" stackId="seo" fill="#f59e0b" name="설명 100자+" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          )}

          {/* ── 태그 워드 클라우드 ── */}
          {resultTab === 'tags' && (tags.length === 0
            ? <Empty msg="키워드를 분석하면 태그가 표시됩니다." />
            : (
              <div>
                <div className="flex gap-2 mb-4">
                  <button onClick={handleCopyTags} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">전체 복사</button>
                  <button onClick={handleExportCsv} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">CSV 내보내기</button>
                  <button onClick={handleExportJson} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">JSON 내보내기</button>
                </div>
                {/* 워드 클라우드 */}
                <div className="flex flex-wrap justify-center gap-2 py-4 px-2 bg-gray-900/40 rounded-xl border border-gray-700/40 min-h-[120px]">
                  {tags.slice(0, 60).map((tag, i) => {
                    const maxFreq = Math.max(...tags.map(t => t.frequency), 1);
                    const r = tag.frequency / maxFreq;
                    const fontSize = r > 0.8 ? 'text-2xl' : r > 0.6 ? 'text-xl' : r > 0.4 ? 'text-lg' : r > 0.2 ? 'text-base' : 'text-sm';
                    const colors = ['text-blue-300', 'text-violet-300', 'text-cyan-300', 'text-emerald-300', 'text-pink-300', 'text-amber-300'];
                    const tagColor = colors[i % colors.length];
                    const opacity = r > 0.5 ? 'opacity-100' : r > 0.25 ? 'opacity-80' : 'opacity-60';
                    return (
                      <button key={i} type="button"
                        onClick={() => handleAnalyze(tag.tag)}
                        title={`${tag.tag} (빈도: ${tag.frequency}) — 클릭하여 분석`}
                        className={`${fontSize} ${tagColor} ${opacity} px-2.5 py-1 rounded-full border border-gray-700/40 hover:border-blue-500/50 hover:bg-blue-900/20 transition-all cursor-pointer font-medium`}>
                        #{tag.tag}
                      </button>
                    );
                  })}
                </div>
                {tags.length > 60 && (
                  <p className="text-xs text-gray-500 mt-2 text-center">상위 60개 태그 표시 중 (전체 {tags.length}개)</p>
                )}
              </div>
            )
          )}

          {/* ── 분석 히스토리 ── */}
          {resultTab === 'history' && (keywordResults.length === 0
            ? <Empty msg="분석 이력이 없습니다." />
            : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-400">최근 {keywordResults.length}개 키워드 분석 결과</p>
                  <div className="flex gap-2">
                    <button onClick={handleExportCsv} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">CSV 내보내기</button>
                    <button onClick={clearKeywordHistory} className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-sm font-semibold text-red-400 rounded-md border border-red-700/30 transition-colors">초기화</button>
                  </div>
                </div>
                {/* ── 분석 키워드 트렌드 (라인 차트) ── */}
                {keywordResults.length >= 2 && (
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4">
                    <p className="text-sm font-bold text-gray-300 mb-3">분석 키워드 트렌드</p>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={keywordResults.map(r => ({ name: r.keyword, volume: r.searchVolume, competition: r.competition, opportunity: r.opportunityScore }))} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid {...GRID_STYLE} />
                        <XAxis dataKey="name" tick={AXIS_STYLE} />
                        <YAxis tick={AXIS_STYLE} domain={[0, 100]} />
                        <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#d1d5db' }} />
                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                        <Line type="monotone" dataKey="volume" stroke="#3b82f6" name="검색량" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="competition" stroke="#ef4444" name="경쟁도" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="opportunity" stroke="#10b981" name="기회점수" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 히스토리 바 차트 */}
                <div className="space-y-2">
                  {[...keywordResults].reverse().map((r, i) => (
                    <button key={i} type="button"
                      onClick={() => handleAnalyze(r.keyword)}
                      className="w-full bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700/50 hover:border-blue-500/30 hover:bg-blue-900/10 transition-all text-left group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-200 group-hover:text-blue-300 transition-colors">{r.keyword}</span>
                        <span className={`text-xs font-bold ${trendInfo(r.trend).color}`}>{trendInfo(r.trend).icon} {trendInfo(r.trend).label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-gray-500">검색량</span>
                            <span className={scoreColor(r.searchVolume)}>{r.searchVolume}</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${scoreBg(r.searchVolume)}`} style={{ width: `${r.searchVolume}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-gray-500">경쟁도</span>
                            <span className={scoreColor(r.competition, true)}>{r.competition}</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${scoreBg(r.competition, true)}`} style={{ width: `${r.competition}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <span className="text-gray-500">기회</span>
                            <span className={scoreColor(r.opportunityScore)}>{r.opportunityScore}</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${scoreBg(r.opportunityScore)}`} style={{ width: `${r.opportunityScore}%` }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default KeywordLab;
