import React, { useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { showToast } from '../../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { getChannelInfo, getRecentVideosByFormat, getVideoTranscript, analyzeChannelStyle, analyzeChannelStyleDNA, getRelatedKeywords, getTopVideos } from '../../../services/youtubeAnalysisService';
import { getYoutubeApiKey } from '../../../services/apiService';
import { evolinkChat } from '../../../services/evolinkService';
import { buildInstinctTaxonomy } from '../../../data/instinctPromptUtils';
import ChannelInputPanel from './ChannelInputPanel';
import type { LegacyTopicRecommendation, ContentFormat, ChannelScript, ChannelInfo, TopicInstinctAnalysis } from '../../../types';

const VIRAL_CFG = {
  high: { label: '높음', bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-800/40', desc: '높은 조회수 잠재력' },
  medium: { label: '중간', bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-800/40', desc: '안정적 조회수 예상' },
  low: { label: '낮음', bg: 'bg-gray-700/50', text: 'text-gray-400', border: 'border-gray-600/40', desc: '니치 타겟 적합' },
};
const fmtSubs = (n: number): string => n >= 10000 ? `${Math.round(n / 10000)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n);
const fmtViews = (n: number): string => n >= 100000000 ? `${(n / 100000000).toFixed(1)}억` : n >= 10000 ? `${Math.round(n / 10000)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n);
const fmtDate = (s: string): string => { const d = new Date(s); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const VBadge: React.FC<{ s: 'high' | 'medium' | 'low' }> = ({ s }) => { const c = VIRAL_CFG[s]; return <span className={`flex-shrink-0 px-2 py-0.5 text-sm font-semibold rounded-full ${c.bg} ${c.text} border ${c.border}`}>바이럴 {c.label}</span>; };
const DRow: React.FC<{ l: string; v: string }> = ({ l, v }) => <div><label className="block text-sm font-medium text-gray-500 mb-1">{l}</label><p className="text-sm text-gray-200 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50">{v}</p></div>;
const card = 'bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-xl';
const Spin = () => <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;

const ChannelAnalysisRoom: React.FC = () => {
  const {
    channelScripts, channelInfo, channelGuideline, savedPresets,
    inputSource, uploadedFiles, sourceName,
    setChannelInfo, setChannelScripts, setChannelGuideline, savePreset, loadPreset, removePreset,
    setInputSource, setUploadedFiles, setSourceName, syncQuota,
  } = useChannelAnalysisStore();
  const setActiveTab = useNavigationStore(s => s.setActiveTab);
  const swSetTopics = useScriptWriterStore(s => s.setTopics);

  const { requireAuth } = useAuthGuard();

  const [contentFormat, setContentFormat] = useState<ContentFormat>('long');
  const [videoCount, setVideoCount] = useState(10);
  const [videoSortOrder, setVideoSortOrder] = useState<'latest' | 'popular'>('latest');
  const [channelUrl, setChannelUrl] = useState('');
  const [progress, setProgress] = useState<{ step: number; message: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [topics, setTopics] = useState<LegacyTopicRecommendation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const elapsed = useElapsedTimer(isAnalyzing);
  const progressElapsed = useElapsedTimer(!!progress);
  const [selectedTopic, setSelectedTopic] = useState<LegacyTopicRecommendation | null>(null);

  // YouTube 채널 분석 (3-Layer DNA)
  const handleChannelAnalysis = useCallback(async () => {
    if (!requireAuth('채널 분석')) return;
    if (!channelUrl.trim()) return;
    if (!getYoutubeApiKey()) {
      setError('YouTube API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    setError('');
    try {
      setProgress({ step: 1, message: '채널 정보 조회 중...' });
      const info = await getChannelInfo(channelUrl);
      setChannelInfo(info);
      syncQuota();
      // 쇼츠/영상 URL에서 감지된 포맷 자동 적용
      const effectiveFormat = info.detectedFormat || contentFormat;
      if (info.detectedFormat && info.detectedFormat !== contentFormat) {
        setContentFormat(info.detectedFormat);
      }
      setProgress({ step: 2, message: `영상 ${videoCount}개 수집 중...` });
      const filtered = await getRecentVideosByFormat(info.channelId, effectiveFormat, videoCount, videoSortOrder);
      syncQuota();
      if (!filtered.length) { setError('해당 형식에 맞는 영상이 없습니다.'); setProgress(null); return; }
      const scripts: ChannelScript[] = [];
      for (let i = 0; i < filtered.length; i++) {
        setProgress({ step: 3, message: `대본 수집 중 (${i + 1}/${filtered.length})...` });
        scripts.push({ ...filtered[i], transcript: await getVideoTranscript(filtered[i].videoId) });
        syncQuota();
      }
      setChannelScripts(scripts);
      setProgress({ step: 4, message: 'AI 채널 스타일 DNA 다층 분석 중... (텍스트 + 시각 + 편집 + 오디오 + 댓글)' });
      const guideline = await analyzeChannelStyleDNA(scripts, info);
      guideline.contentFormat = effectiveFormat;
      setChannelGuideline(guideline);
      setProgress(null);
      showToast('채널 스타일 DNA 분석이 완료되었습니다.');
      // [v4.5] 스마트 제목 — 채널명 기반
      useProjectStore.getState().smartUpdateTitle('channel-analysis', info.title || channelUrl);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ChannelAnalysis] 채널 분석 실패:', e);
      setError(`채널 분석 실패: ${msg}`);
      setProgress(null);
    }
  }, [channelUrl, contentFormat, videoCount, videoSortOrder, setChannelInfo, setChannelScripts, setChannelGuideline]);

  // 파일/직접입력 스타일 분석
  const handleFileManualAnalyze = useCallback(async (scripts: ChannelScript[]) => {
    if (scripts.length === 0) return;
    setError('');
    const name = sourceName.trim() || '업로드된 글';

    const stubInfo: ChannelInfo = {
      channelId: `local-${Date.now()}`,
      title: name,
      description: `${scripts.length}개의 텍스트로 분석`,
      thumbnailUrl: '',
      subscriberCount: 0,
      videoCount: scripts.length,
      viewCount: 0,
    };

    try {
      setProgress({ step: 1, message: '텍스트 준비 중...' });
      setChannelInfo(stubInfo);
      setChannelScripts(scripts);
      setProgress({ step: 4, message: 'AI 스타일 역설계 분석 중...' });
      setChannelGuideline(await analyzeChannelStyle(scripts, stubInfo));
      setProgress(null);
      showToast('스타일 분석이 완료되었습니다.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`스타일 분석 실패: ${msg}`);
      setProgress(null);
    }
  }, [sourceName, setChannelInfo, setChannelScripts, setChannelGuideline]);

  // 프리셋 저장
  const handleSavePreset = useCallback(() => {
    if (!channelGuideline) return;
    savePreset(channelGuideline);
    showToast(`"${channelGuideline.channelName}" 프리셋이 저장되었습니다.`);
  }, [channelGuideline, savePreset]);

  // 스타일 프롬프트 복사
  const handleCopyPrompt = useCallback(async () => {
    if (!channelGuideline?.fullGuidelineText) return;
    try {
      await navigator.clipboard.writeText(channelGuideline.fullGuidelineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('스타일 프롬프트가 클립보드에 복사되었습니다.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = channelGuideline.fullGuidelineText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('스타일 프롬프트가 클립보드에 복사되었습니다.');
    }
  }, [channelGuideline]);

  // 주제 추천
  const [topicError, setTopicError] = useState('');

  const handleTopicRecommend = useCallback(async () => {
    if (!requireAuth('AI 주제 추천')) return;
    if (!topicInput.trim() && !channelGuideline) return;
    setIsAnalyzing(true);
    setTopicError('');

    const styleInfo = channelGuideline
      ? `[채널 스타일]\n채널명: ${channelGuideline.channelName}\n말투: ${channelGuideline.tone}\n구조: ${channelGuideline.structure}\n주제: ${(Array.isArray(channelGuideline.topics) ? channelGuideline.topics : []).join(', ')}\n도입패턴: ${channelGuideline.hookPattern}\n마무리패턴: ${channelGuideline.closingPattern}`
      : '';

    try {
      // Step 1: 실제 YouTube 트렌드 데이터 수집
      const seedKeyword = topicInput.trim() || (channelGuideline?.topics?.[0]) || '';
      let trendDataSection = '';

      if (seedKeyword) {
        // Google Suggest API로 실제 연관 검색어 수집 (쿼터 무료)
        const [relatedKws, topVideos] = await Promise.all([
          getRelatedKeywords(seedKeyword, 'ko').catch(() => []),
          getYoutubeApiKey()
            ? getTopVideos(seedKeyword, 10).catch(() => [])
            : Promise.resolve([]),
        ]);
        syncQuota();

        const suggestList = relatedKws.slice(0, 15).map(k => k.keyword).join(', ');
        const topVideoList = topVideos.slice(0, 10).map((v, i) =>
          `${i + 1}. "${v.title}" (${v.channelTitle}, 조회수 ${v.viewCount.toLocaleString()}, 참여율 ${v.engagement}%)`
        ).join('\n');

        trendDataSection = `\n\n[실제 YouTube 트렌드 데이터 — "${seedKeyword}" 기준]\n` +
          (suggestList ? `연관 검색어 (Google Suggest 실시간): ${suggestList}\n` : '') +
          (topVideoList ? `\n현재 상위 인기 영상:\n${topVideoList}\n` : '') +
          `\n⚠️ 위 데이터는 실시간 YouTube 검색 결과입니다. 반드시 이 트렌드 데이터를 기반으로 주제를 추천하세요. 허구나 상상으로 주제를 만들지 마세요.`;
      }

      const instinctTaxonomy = buildInstinctTaxonomy();
      const res = await evolinkChat(
        [
          { role: 'system', content: `당신은 유튜브 콘텐츠 전략가입니다. 실제 YouTube 트렌드와 검색 데이터를 기반으로 바이럴 가능성이 높은 영상 주제 10개를 추천합니다.

절대 규칙:
1. 추천 주제는 반드시 실제 트렌드, 실제 이슈, 실제 데이터에 근거해야 합니다.
2. 상상이나 허구로 주제를 만들지 마세요. 현실에 존재하는 소재만 추천하세요.
3. 각 주제의 "mainSubject"에는 왜 지금 이 주제가 뜨는지 실제 근거를 포함하세요.
4. 반드시 JSON 배열로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력합니다.` },
          { role: 'user', content: `${styleInfo}${trendDataSection}\n\n[본능 기제 분류 체계]\n${instinctTaxonomy}\n\n사용자 입력 주제: ${topicInput || '(자유 추천)'}\n\n위 실제 트렌드 데이터와 채널 스타일을 기반으로, 지금 만들면 조회수가 나올 영상 주제 10개를 추천하세요.\n\nJSON 배열:\n[\n  {\n    "id": 1,\n    "title": "영상 제목",\n    "mainSubject": "핵심 소재 + 왜 지금 이 주제인지 근거",\n    "similarity": "채널 스타일과의 유사점",\n    "scriptFlow": "대본 흐름 (예: 후킹 > 사례 > 분석 > CTA)",\n    "viralScore": "high 또는 medium 또는 low",\n    "instinctAnalysis": {\n      "primaryInstincts": ["자극하는 핵심 본능 2~3개"],\n      "comboFormula": "본능 조합 공식 (예: 공포+비교+긴급)",\n      "hookSuggestion": "AI가 생성한 훅 문장"\n    }\n  }\n]\n\nhigh 3개, medium 4개, low 3개 비율로 추천하세요.` }
        ],
        { temperature: 0.7, maxTokens: 6000 }
      );

      const raw = res.choices?.[0]?.message?.content || '';
      if (!raw.trim()) throw new Error('AI 응답이 비어있습니다.');
      let jsonStr = raw.trim();
      // 마크다운 코드 블록 제거
      const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) jsonStr = codeBlock[1].trim();
      // 코드 블록 없이 JSON 앞뒤에 텍스트가 붙은 경우 배열 부분만 추출
      if (!jsonStr.startsWith('[')) {
        const arrStart = jsonStr.indexOf('[');
        const arrEnd = jsonStr.lastIndexOf(']');
        if (arrStart !== -1 && arrEnd !== -1) {
          jsonStr = jsonStr.substring(arrStart, arrEnd + 1);
        }
      }
      // 불완전한 JSON 복구: 마지막 유효한 객체까지만 파싱
      let parsed: (LegacyTopicRecommendation & { instinctAnalysis?: TopicInstinctAnalysis })[];
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // 불완전한 배열 복구 시도: 마지막 완전한 }까지 잘라서 배열 닫기
        const lastBrace = jsonStr.lastIndexOf('}');
        if (lastBrace > 0) {
          const recovered = jsonStr.substring(0, lastBrace + 1) + ']';
          try {
            const recoveredStart = recovered.indexOf('[');
            parsed = JSON.parse(recoveredStart >= 0 ? recovered.substring(recoveredStart) : recovered);
          } catch {
            throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
          }
        } else {
          throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
        }
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTopics(parsed.map((t, i) => {
          const ia = t.instinctAnalysis;
          const instinctAnalysis: TopicInstinctAnalysis | undefined = ia ? {
            primaryInstincts: Array.isArray(ia.primaryInstincts) ? ia.primaryInstincts : [],
            comboFormula: ia.comboFormula || '',
            hookSuggestion: ia.hookSuggestion || '',
          } : undefined;
          return {
            id: t.id || i + 1,
            title: t.title || `주제 ${i + 1}`,
            mainSubject: t.mainSubject || '',
            similarity: t.similarity || '',
            scriptFlow: t.scriptFlow || '',
            viralScore: (['high', 'medium', 'low'].includes(t.viralScore) ? t.viralScore : 'medium') as LegacyTopicRecommendation['viralScore'],
            instinctAnalysis,
          };
        }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTopicError(`주제 추천 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [topicInput, channelGuideline]);

  // 주제를 대본 작성으로 보내기
  const handleSend = useCallback((topic: LegacyTopicRecommendation) => {
    swSetTopics([topic]);
    setActiveTab('script-writer');
  }, [swSetTopics, setActiveTab]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 채널 스타일 클로닝 — 입력 패널 */}
      <div className={card}>
        <div className="mb-3">
          <p className="text-sm text-gray-400">벤치마크 채널의 URL, 파일 또는 텍스트를 입력하면 AI가 말투/구조/도입부 패턴을 역설계 분석합니다. 분석 결과는 대본 생성 시 자동 적용됩니다.</p>
        </div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">채널 스타일 클로닝</h3>
        </div>

        <ChannelInputPanel
          inputSource={inputSource}
          onInputSourceChange={setInputSource}
          channelUrl={channelUrl}
          onChannelUrlChange={setChannelUrl}
          contentFormat={contentFormat}
          onContentFormatChange={setContentFormat}
          videoCount={videoCount}
          onVideoCountChange={setVideoCount}
          videoSortOrder={videoSortOrder}
          onVideoSortOrderChange={setVideoSortOrder}
          onYoutubeAnalyze={handleChannelAnalysis}
          uploadedFiles={uploadedFiles}
          onFilesChange={setUploadedFiles}
          sourceName={sourceName}
          onSourceNameChange={setSourceName}
          onFileManualAnalyze={handleFileManualAnalyze}
          isAnalyzing={!!progress}
          error={error}
        />

        {/* 진행 상태 */}
        {progress && (
          <div className="mt-4 flex items-center gap-3 bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700/50">
            <Spin /><span className="text-sm text-gray-300">{progress.message}</span>{progressElapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(progressElapsed)}</span>}
            <div className="flex-1 bg-gray-700 rounded-full h-1.5 ml-2">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 h-1.5 rounded-full transition-all" style={{ width: `${progress.step * 25}%` }} />
            </div>
          </div>
        )}

        {/* 채널/소스 정보 표시 */}
        {channelInfo && !progress && (
          <div className="mt-4 flex items-center gap-4 bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700/50">
            {inputSource === 'youtube' && channelInfo.thumbnailUrl ? (
              <img src={channelInfo.thumbnailUrl} alt={channelInfo.title} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 bg-orange-600/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{channelInfo.title}</p>
              <p className="text-sm text-gray-400">
                {inputSource === 'youtube'
                  ? `구독자 ${fmtSubs(channelInfo.subscriberCount)}명 | 영상 ${channelInfo.videoCount}개 | 총 조회수 ${fmtViews(channelInfo.viewCount)}회`
                  : `${channelScripts.length}개 텍스트 | ${channelScripts.reduce((acc, s) => acc + (s.transcript?.length || 0), 0).toLocaleString()}자`
                }
              </p>
            </div>
            {channelScripts.length > 0 && (
              <span className="text-sm text-green-400 bg-green-900/30 px-2 py-1 rounded-full border border-green-800/40">
                {channelScripts.length}개 {inputSource === 'youtube' ? '대본' : '텍스트'} 수집됨
              </span>
            )}
          </div>
        )}
      </div>

      {/* 수집된 영상/텍스트 갤러리 */}
      {channelScripts.length > 0 && !progress && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
              {inputSource === 'youtube' ? `수집된 영상 (${channelScripts.length}개)` : `분석 대상 텍스트 (${channelScripts.length}개)`}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {inputSource === 'youtube' ? '분석에 사용된 영상 목록' : '스타일 분석에 활용되는 텍스트'}
              </span>
              {inputSource === 'youtube' && (
                <button
                  onClick={() => {
                    const data = channelScripts.map(s => ({
                      title: s.title,
                      videoId: s.videoId,
                      url: `https://www.youtube.com/watch?v=${s.videoId}`,
                      viewCount: s.viewCount,
                      duration: s.duration,
                      publishedAt: s.publishedAt,
                      transcript: s.transcript || '',
                      description: s.description || '',
                      tags: s.tags || [],
                    }));
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${channelInfo?.title || 'channel'}-videos-${channelScripts.length}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    showToast(`${channelScripts.length}개 영상 데이터를 다운로드했습니다.`);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  전체 다운로드
                </button>
              )}
            </div>
          </div>

          {inputSource === 'youtube' ? (
            /* YouTube 썸네일 갤러리 */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {channelScripts.map((s) => (
                <div
                  key={s.videoId}
                  className="group block rounded-lg overflow-hidden bg-gray-900/50 border border-gray-700/50 hover:border-orange-500/50 transition-all hover:shadow-lg hover:shadow-orange-900/10"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${s.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="relative aspect-video bg-gray-800">
                      <img
                        src={`https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`}
                        alt={s.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-mono font-bold bg-black/80 text-white rounded">
                        {s.duration}
                      </span>
                    </div>
                  </a>
                  <div className="p-2">
                    <a
                      href={`https://www.youtube.com/watch?v=${s.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <p className="text-sm font-medium text-gray-200 line-clamp-2 leading-tight group-hover:text-orange-300 transition-colors">
                        {s.title}
                      </p>
                    </a>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>조회수 {fmtViews(s.viewCount)}회</span>
                        <span>·</span>
                        <span>{fmtDate(s.publishedAt)}</span>
                      </div>
                      <button
                        onClick={() => {
                          const data = {
                            title: s.title,
                            videoId: s.videoId,
                            url: `https://www.youtube.com/watch?v=${s.videoId}`,
                            viewCount: s.viewCount,
                            duration: s.duration,
                            publishedAt: s.publishedAt,
                            transcript: s.transcript || '',
                            description: s.description || '',
                            tags: s.tags || [],
                          };
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `${s.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').substring(0, 50)}.json`;
                          a.click();
                          URL.revokeObjectURL(a.href);
                        }}
                        className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                        title="영상 데이터 다운로드"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 파일/직접입력 텍스트 목록 */
            <div className="space-y-2">
              {channelScripts.map((s) => (
                <div key={s.videoId} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-200">{s.title}</p>
                    <span className="text-xs text-gray-500">{(s.transcript?.length || 0).toLocaleString()}자</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{(s.transcript || s.description || '').substring(0, 150)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 영상별 조회수 비교 차트 */}
      {channelScripts.length > 0 && !progress && inputSource === 'youtube' && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-4">영상별 조회수 비교</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channelScripts.map(s => ({ name: s.title.substring(0, 15) + '...', views: s.viewCount, fullTitle: s.title }))} margin={{ top: 5, right: 20, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" angle={-90} textAnchor="end" height={80} tick={{ fill: '#9ca3af', fontSize: 11 }} interval={0} />
              <YAxis tick={{ fill: '#9ca3af' }} tickFormatter={fmtViews} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#f97316' }}
                itemStyle={{ color: '#d1d5db' }}
                formatter={(value: number) => [fmtViews(value) + '회', '조회수']}
                labelFormatter={(_label: string, payload: readonly { payload?: { fullTitle?: string } }[]) => payload?.[0]?.payload?.fullTitle || _label}
              />
              <Bar dataKey="views" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 발행일별 조회수 추이 */}
      {channelScripts.length > 0 && !progress && inputSource === 'youtube' && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-4">발행일별 조회수 추이</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={[...channelScripts].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()).map(s => ({ date: new Date(s.publishedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }), views: s.viewCount, title: s.title }))} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af' }} />
              <YAxis tick={{ fill: '#9ca3af' }} tickFormatter={fmtViews} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#3b82f6' }}
                itemStyle={{ color: '#d1d5db' }}
                formatter={(value: number) => [fmtViews(value) + '회', '조회수']}
                labelFormatter={(_label: string, payload: readonly { payload?: { title?: string } }[]) => payload?.[0]?.payload?.title || _label}
              />
              <Area type="monotone" dataKey="views" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 스타일 분석 결과 */}
      {channelGuideline && !progress && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">스타일 분석 결과</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyPrompt} className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${copied ? 'bg-green-600/20 text-green-400 border-green-600/50' : 'bg-orange-600/20 text-orange-400 border-orange-600/50 hover:bg-orange-600/30'}`}>
                {copied ? '복사됨!' : `${channelGuideline.channelName} 스타일 프롬프트 복사하기`}
              </button>
              <button onClick={handleSavePreset} className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-semibold rounded-lg transition-all">
                프리셋 저장
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <DRow l="말투/어조" v={channelGuideline.tone} />
            <DRow l="영상 구조" v={channelGuideline.structure} />
            <DRow l="도입부 패턴" v={channelGuideline.hookPattern} />
            <DRow l="마무리 패턴" v={channelGuideline.closingPattern} />
            <DRow l="타겟 시청자" v={channelGuideline.targetAudience} />
            <DRow l="평균 글자수" v={String(channelGuideline.avgLength)} />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {channelGuideline.topics.map((t, i) => <span key={i} className="px-2 py-0.5 text-sm bg-blue-900/30 text-blue-400 rounded-full border border-blue-800/40">{t}</span>)}
            {channelGuideline.keywords.map((k, i) => <span key={i} className="px-2 py-0.5 text-sm bg-purple-900/30 text-purple-400 rounded-full border border-purple-800/40">{k}</span>)}
          </div>

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.fullGuidelineText}</p>
          </div>
        </div>
      )}

      {/* 채널 스타일 DNA */}
      {channelGuideline && !progress && (channelGuideline.visualGuide || channelGuideline.editGuide || channelGuideline.audioGuide || channelGuideline.titleFormula || channelGuideline.audienceInsight) && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">D</span>
            채널 스타일 DNA
          </h3>
          <div className="space-y-4">
            {channelGuideline.visualGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-blue-400">시각 스타일 (썸네일 + 영상 화면 분석)</label>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(channelGuideline.visualGuide!);
                      showToast('시각 스타일이 복사되었습니다.');
                    }}
                    className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
                    title="복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.visualGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.editGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-amber-400">편집 스타일 (컷 리듬 / 전환 / 카메라 / 색보정)</label>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(channelGuideline.editGuide!);
                      showToast('편집 스타일이 복사되었습니다.');
                    }}
                    className="p-1 text-gray-600 hover:text-amber-400 transition-colors"
                    title="복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.editGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.audioGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-fuchsia-400">오디오 스타일 (BGM / 효과음 / 보이스톤)</label>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(channelGuideline.audioGuide!);
                      showToast('오디오 스타일이 복사되었습니다.');
                    }}
                    className="p-1 text-gray-600 hover:text-fuchsia-400 transition-colors"
                    title="복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.audioGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.titleFormula && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-orange-400">제목 / 메타데이터 공식</label>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(channelGuideline.titleFormula!);
                      showToast('제목/메타데이터 공식이 복사되었습니다.');
                    }}
                    className="p-1 text-gray-600 hover:text-orange-400 transition-colors"
                    title="복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.titleFormula}</p>
                </div>
              </div>
            )}
            {channelGuideline.audienceInsight && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-cyan-400">시청자 인사이트 (댓글 감성 분석)</label>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(channelGuideline.audienceInsight!);
                      showToast('시청자 인사이트가 복사되었습니다.');
                    }}
                    className="p-1 text-gray-600 hover:text-cyan-400 transition-colors"
                    title="복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-96 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.audienceInsight}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 저장된 채널 프리셋 */}
      {savedPresets.length > 0 && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-3">저장된 채널 프리셋</h3>
          <div className="flex flex-wrap gap-2">
            {savedPresets.map((p, i) => {
              const isActive = channelGuideline?.channelName === p.channelName;
              return (
                <div key={i} className="group relative">
                  <button
                    onClick={() => loadPreset(p.channelName)}
                    className={`px-4 py-2 pr-8 text-sm font-semibold rounded-lg border transition-all ${isActive
                      ? 'bg-blue-600/20 text-blue-400 border-blue-600/50'
                      : 'bg-gray-900/50 text-gray-300 border-gray-700/50 hover:border-blue-600/50 hover:bg-gray-900'
                    }`}
                  >
                    {p.channelName}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePreset(p.channelName); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                    title="프리셋 삭제"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 주제 입력 + 추천 */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <label className="block text-sm font-medium text-gray-400">주제 입력</label>
          {channelGuideline && (
            <span className="text-sm text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full border border-orange-800/40">
              {channelGuideline.channelName} 스타일 적용 중
            </span>
          )}
        </div>
        <input
          type="text"
          value={topicInput}
          onChange={e => setTopicInput(e.target.value)}
          placeholder="관심 있는 주제를 입력하세요 (예: AI 기술, 다이어트 식단, 일본 여행, 자취 꿀팁...)"
          className={`w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:ring-2 px-4 py-2.5 focus:ring-blue-500`}
        />
        <p className="text-sm text-gray-600 mt-1.5">채널 분석 없이도 사용 가능합니다. 주제만 입력하면 AI가 바이럴 가능성이 높은 영상 아이디어 10개를 추천합니다.</p>
        {topicError && (
          <div className="mt-2 px-4 py-2.5 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{topicError}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <button
            onClick={handleTopicRecommend}
            disabled={isAnalyzing || (!topicInput.trim() && !channelGuideline)}
            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing ? <><Spin /> 분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</> : '스타일 기반 주제 추천'}
          </button>
          <button
            onClick={handleTopicRecommend}
            disabled={isAnalyzing || !topics.length}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing && <><Spin />{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</>} 주제 10개 재추천
          </button>
        </div>
      </div>

      {/* 추천 주제 목록 */}
      {topics.length > 0 && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-4">추천 주제</h3>

          {/* 바이럴 점수 도넛 차트 */}
          {(() => {
            const viralDist = [
              { name: '높음', value: topics.filter(t => t.viralScore === 'high').length, fill: '#ef4444' },
              { name: '중간', value: topics.filter(t => t.viralScore === 'medium').length, fill: '#eab308' },
              { name: '낮음', value: topics.filter(t => t.viralScore === 'low').length, fill: '#6b7280' },
            ].filter(d => d.value > 0);
            return (
              <div className="flex items-center gap-6 mb-5 bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="relative" style={{ width: 200, height: 200 }}>
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie data={viralDist} innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                        {viralDist.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} itemStyle={{ color: '#d1d5db' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-white">{topics.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-300 mb-2">바이럴 점수 분포</p>
                  {viralDist.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                      <span className="text-sm text-gray-400">{d.name}</span>
                      <span className="text-sm font-semibold text-gray-200">{d.value}개</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 본능 기제 빈도 차트 */}
          {topics.some(t => t.instinctAnalysis?.primaryInstincts?.length) && (() => {
            const instinctFreq = new Map<string, number>();
            topics.forEach(t => t.instinctAnalysis?.primaryInstincts?.forEach(inst => instinctFreq.set(inst, (instinctFreq.get(inst) || 0) + 1)));
            const instinctData = [...instinctFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
            if (instinctData.length === 0) return null;
            return (
              <div className="mb-5 bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <p className="text-sm font-medium text-purple-400 mb-3">가장 많이 활용된 심리 기제</p>
                <ResponsiveContainer width="100%" height={Math.max(200, instinctData.length * 35)}>
                  <BarChart layout="vertical" data={instinctData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" tick={{ fill: '#9ca3af' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#a855f7' }}
                      itemStyle={{ color: '#d1d5db' }}
                      formatter={(value: number) => [value + '회', '빈도']}
                    />
                    <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          <div className="space-y-3">
            {topics.map(t => (
              <div key={t.id} onClick={() => setSelectedTopic(t)} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 hover:border-blue-600/50 cursor-pointer transition-all hover:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-200">{t.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{t.mainSubject}</p>
                    {t.instinctAnalysis && t.instinctAnalysis.primaryInstincts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.instinctAnalysis.primaryInstincts.map((inst, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 text-sm bg-purple-900/30 text-purple-400 rounded-full border border-purple-800/40">
                            {inst}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <VBadge s={t.viralScore} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 주제 상세 모달 */}
      {selectedTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTopic(null)}>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="text-lg font-bold text-white">{selectedTopic.title}</h3>
                <div className="mt-1"><VBadge s={selectedTopic.viralScore} /></div>
              </div>
              <button onClick={() => setSelectedTopic(null)} className="text-gray-500 hover:text-white flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <DRow l="메인 소재" v={selectedTopic.mainSubject} />
              <DRow l="벤치 대본과의 유사점" v={selectedTopic.similarity} />
              <DRow l="대본 작성 흐름" v={selectedTopic.scriptFlow} />
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">바이럴 점수</label>
                <div className="flex items-center gap-2">
                  <VBadge s={selectedTopic.viralScore} />
                  <span className="text-sm text-gray-500">{VIRAL_CFG[selectedTopic.viralScore].desc}</span>
                </div>
              </div>
              {selectedTopic.instinctAnalysis && (
                <div className="bg-purple-900/10 rounded-lg p-3 border border-purple-800/30 space-y-2">
                  <label className="block text-sm font-medium text-purple-400">본능 기제 분석</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(selectedTopic.instinctAnalysis.primaryInstincts) ? selectedTopic.instinctAnalysis.primaryInstincts : []).map((inst, i) => (
                      <span key={i} className="px-2 py-0.5 text-sm bg-purple-900/30 text-purple-300 rounded-full border border-purple-700/40">
                        {inst}
                      </span>
                    ))}
                  </div>
                  {selectedTopic.instinctAnalysis.comboFormula && (
                    <p className="text-sm text-gray-400">
                      <span className="text-purple-400 font-medium">조합 공식:</span> {selectedTopic.instinctAnalysis.comboFormula}
                    </p>
                  )}
                  {selectedTopic.instinctAnalysis.hookSuggestion && (
                    <p className="text-sm text-gray-200 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50 italic">
                      &ldquo;{selectedTopic.instinctAnalysis.hookSuggestion}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => handleSend(selectedTopic)} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all">
                대본작성으로 보내기
              </button>
              <button onClick={() => setSelectedTopic(null)} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-xl transition-colors">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelAnalysisRoom;
