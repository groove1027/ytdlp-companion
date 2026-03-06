import React, { useState, useCallback, useMemo } from 'react';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { showToast } from '../../../stores/uiStore';
import { searchKeyword, getRelatedKeywords, getTopVideos, getVideoTags } from '../../../services/youtubeAnalysisService';
import type { KeywordTag, TopVideo } from '../../../types';

type ResultTab = 'related' | 'videos' | 'tags';
const LANG_OPTIONS = [{ id: 'ko' as const, label: '한국어' }, { id: 'ja' as const, label: '日本語' }, { id: 'en' as const, label: 'EN' }];
const REGION_OPTIONS = [{ id: 'all' as const, label: '전체' }, { id: 'video' as const, label: '롱폼' }];

function scoreColor(score: number, invert = false): string {
  const v = invert ? 100 - score : score;
  return v >= 70 ? 'text-green-400' : v >= 40 ? 'text-yellow-400' : 'text-red-400';
}
function trendInfo(t: 'rising' | 'stable' | 'declining') {
  return t === 'rising' ? { label: '상승', color: 'text-green-400', icon: '↑' } : t === 'stable' ? { label: '안정', color: 'text-yellow-400', icon: '→' } : { label: '하락', color: 'text-red-400', icon: '↓' };
}
function fmtNum(n: number): string {
  if (n >= 1e8) return Math.floor(n / 1e8) + '억' + (Math.floor((n % 1e8) / 1e4) > 0 ? Math.floor((n % 1e8) / 1e4).toLocaleString() + '만' : '');
  if (n >= 1e4) return Math.floor(n / 1e4) + '만' + (Math.floor((n % 1e4) / 1e3) > 0 ? Math.floor((n % 1e4) / 1e3) + '천' : '');
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

const SeoBadge: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <span className={`px-2 py-0.5 text-sm font-semibold rounded border ${
    active
      ? 'bg-green-900/40 text-green-400 border-green-700/50'
      : 'bg-gray-800 text-gray-500 border-gray-700/50'
  }`}>{label}</span>
);

const KeywordLab: React.FC = () => {
  const {
    keyword, language, region, keywordResults, relatedKeywords, topVideos, tags,
    isAnalyzing, apiUsagePercent,
    setKeyword, setLanguage, setRegion, setIsAnalyzing, setApiUsagePercent, analyze,
  } = useChannelAnalysisStore();

  const elapsed = useElapsedTimer(isAnalyzing);
  const [resultTab, setResultTab] = useState<ResultTab>('related');
  const [error, setError] = useState('');
  const latest = keywordResults.length > 0 ? keywordResults[keywordResults.length - 1] : null;

  const handleAnalyze = useCallback(async () => {
    if (!keyword.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setError('');

    try {
      // 1. 키워드 분석 (검색량, 경쟁도, 기회점수)
      const keywordResult = await searchKeyword(keyword, language, region === 'all' ? 'KR' : 'KR');
      setApiUsagePercent(Math.min(100, apiUsagePercent + 5));

      // 2. 연관 키워드 (YouTube Suggest API, 쿼터 소모 없음)
      const related = await getRelatedKeywords(keyword, language);

      // 3. 상위 영상 (Search + Videos + Channels API)
      const videos = await getTopVideos(keyword, 10);
      setApiUsagePercent(Math.min(100, apiUsagePercent + 15));

      // 4. 태그 수집 (상위 3개 영상에서)
      const allTags: KeywordTag[] = [];
      const tagVideos = videos.slice(0, 3);
      for (const v of tagVideos) {
        const vTags = await getVideoTags(v.videoId);
        allTags.push(...vTags);
      }
      // 중복 태그 병합 (빈도 합산)
      const tagMap = new Map<string, number>();
      for (const t of allTags) {
        tagMap.set(t.tag, (tagMap.get(t.tag) || 0) + t.frequency);
      }
      const mergedTags: KeywordTag[] = Array.from(tagMap.entries())
        .map(([tag, frequency]) => ({ tag, frequency }))
        .sort((a, b) => b.frequency - a.frequency);

      setApiUsagePercent(Math.min(100, apiUsagePercent + 5));

      // 5. 스토어에 결과 일괄 반영
      analyze({
        keywordResults: [keywordResult],
        relatedKeywords: related,
        topVideos: videos,
        tags: mergedTags,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[KeywordLab] 키워드 분석 실패:', e);
      setError(`키워드 분석 실패: ${msg}. YouTube API 키를 확인해주세요.`);
      setIsAnalyzing(false);
    }
  }, [keyword, language, region, isAnalyzing, apiUsagePercent, setIsAnalyzing, setApiUsagePercent, analyze]);

  const handleCopyTags = useCallback(async () => {
    const text = tags.map((t) => t.tag).join(', ');
    try {
      await navigator.clipboard.writeText(text);
      showToast('클립보드에 복사되었습니다.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [tags]);
  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(tags, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tags-${keyword || 'export'}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [tags, keyword]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Search */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-xl">
        <p className="text-sm text-gray-400 mb-3">YouTube Data API를 사용하여 키워드의 검색량, 경쟁도, 기회점수를 분석하고 연관 키워드, 상위 영상, 태그를 수집합니다.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()} placeholder="분석할 YouTube 키워드를 입력하세요 (예: AI 영상 편집, 여행 브이로그, 먹방)" className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 pr-10" />
            {isAnalyzing && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5"><div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</div>}
          </div>
          <button onClick={handleAnalyze} disabled={isAnalyzing || !keyword.trim()} className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2">{isAnalyzing ? <>분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</> : '분석'}</button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 px-4 py-2.5 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Language & Region */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            {LANG_OPTIONS.map((o) => (<button key={o.id} onClick={() => setLanguage(o.id)} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${language === o.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>{o.label}</button>))}
          </div>
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
            {REGION_OPTIONS.map((o) => (<button key={o.id} onClick={() => setRegion(o.id)} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${region === o.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>{o.label}</button>))}
          </div>
        </div>
      </div>

      {/* Score cards */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ l: '검색량', v: latest.searchVolume, c: scoreColor(latest.searchVolume) }, { l: '경쟁도', v: latest.competition, c: scoreColor(latest.competition, true) }, { l: '기회점수', v: latest.opportunityScore, c: scoreColor(latest.opportunityScore) }].map((s) => (
            <div key={s.l} className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
              <p className="text-sm text-gray-500 mb-1">{s.l}</p>
              <p className={`text-3xl font-bold ${s.c}`}>{s.v}</p>
              <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${s.c.replace('text-', 'bg-')}`} style={{ width: `${s.v}%` }} /></div>
            </div>
          ))}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <p className="text-sm text-gray-500 mb-1">트렌드</p>
            <p className={`text-3xl font-bold ${trendInfo(latest.trend).color}`}>{trendInfo(latest.trend).icon}</p>
            <p className={`text-sm mt-1 ${trendInfo(latest.trend).color}`}>{trendInfo(latest.trend).label}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[{ l: '총 검색결과', v: fmtNum(latest.totalResults) }, { l: '평균 조회수', v: fmtNum(latest.avgViews) }, { l: '채널 다양성', v: `${latest.channelDiversity}/25` }, { l: '데이터 소스', v: latest.dataSource === 'realtime' ? '실시간' : '캐시' }].map((s) => (
            <div key={s.l} className="bg-gray-800/60 rounded-lg px-4 py-2 border border-gray-700/50 flex items-center justify-between">
              <span className="text-sm text-gray-500">{s.l}</span><span className="text-sm font-semibold text-gray-200">{s.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result tabs */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="flex border-b border-gray-700">
          {([{ id: 'related' as ResultTab, label: '연관 키워드', count: relatedKeywords.length }, { id: 'videos' as ResultTab, label: '상위 영상', count: topVideos.length }, { id: 'tags' as ResultTab, label: '태그', count: tags.length }]).map((t) => (
            <button key={t.id} onClick={() => setResultTab(t.id)} className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${resultTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {t.label} {t.count > 0 && <span className="text-sm text-gray-600 ml-1">({t.count})</span>}
            </button>
          ))}
        </div>
        <div className={`p-4 overflow-y-auto custom-scrollbar ${resultTab === 'videos' ? 'max-h-[900px]' : 'max-h-[500px]'}`}>
          {resultTab === 'related' && (relatedKeywords.length === 0 ? <Empty msg="키워드를 분석하면 연관 키워드가 표시됩니다." /> : (
            <div className="space-y-2">{relatedKeywords.map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-2.5 hover:bg-gray-900 transition-colors">
                <span className="text-sm text-gray-200">{item.keyword}</span>
                <div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.score}%` }} /></div><span className="text-sm font-mono text-gray-400 w-8 text-right">{item.score}</span></div>
              </div>
            ))}</div>
          ))}
          {resultTab === 'videos' && (topVideos.length === 0 ? <Empty msg="키워드를 분석하면 상위 영상이 표시됩니다." /> : (
            <div className="space-y-4">{topVideos.map((v) => {
              const seo = analyzeSeo(v, keyword);
              const smallSuccess = isSmallChannelSuccess(v.subscriberCount, v.viewToSubRatio);
              const daily = getDailyViews(v.viewCount, v.publishedAt);
              return (
                <div key={v.videoId} className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden hover:border-gray-600 transition-all">
                  {/* Small channel success badge */}
                  {smallSuccess && (
                    <div className="bg-green-900/30 px-4 py-1.5 border-b border-green-800/40">
                      <span className="text-sm font-bold text-green-400">소채널 성공</span>
                    </div>
                  )}
                  <div className="p-4">
                    {/* Top: Thumbnail + Info */}
                    <div className="flex gap-4">
                      {/* Thumbnail with duration overlay */}
                      <div className="w-[220px] h-[130px] flex-shrink-0 rounded-lg overflow-hidden bg-gray-700 relative">
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No Thumb</div>}
                        <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[13px] px-1.5 py-0.5 rounded font-mono font-semibold">{v.duration}</span>
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-200 leading-snug">{v.title}</p>
                        <p className="text-sm text-gray-500 mt-1.5">{v.channelTitle} · {v.channelSubscribers}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{fmtNum(v.viewCount)} 조회</p>
                        {/* SEO analysis badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <SeoBadge label="제목" active={seo.title} />
                          <SeoBadge label="태그" active={seo.tags} />
                          <SeoBadge label="설명" active={seo.desc} />
                          <SeoBadge label="설명길이" active={seo.descLength} />
                        </div>
                      </div>
                    </div>
                    {/* Bottom: Stats row */}
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
            })}</div>
          ))}
          {resultTab === 'tags' && (tags.length === 0 ? <Empty msg="키워드를 분석하면 태그가 표시됩니다." /> : (
            <div>
              <div className="flex gap-2 mb-4">
                <button onClick={handleCopyTags} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">전체 복사</button>
                <button onClick={handleExportJson} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-300 rounded-md transition-colors">JSON 내보내기</button>
              </div>
              <div className="flex flex-wrap gap-2">{tags.map((tag, i) => {
                const r = tag.frequency / Math.max(...tags.map((t) => t.frequency), 1);
                return <span key={i} className={`${r > 0.7 ? 'text-lg opacity-100' : r > 0.4 ? 'text-base opacity-80' : 'text-sm opacity-60'} bg-blue-900/30 text-blue-300 px-2.5 py-1 rounded-full border border-blue-800/40`} title={`빈도: ${tag.frequency}`}>#{tag.tag}</span>;
              })}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

const Empty: React.FC<{ msg: string }> = ({ msg }) => <div className="flex items-center justify-center h-32 text-gray-600 text-base">{msg}</div>;

export default KeywordLab;
