import React, { useState, useCallback } from 'react';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { evolinkChat } from '../../../services/evolinkService';
import { LegacyTopicRecommendation, ChannelScript } from '../../../types';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';

const VIRAL_COLORS: Record<LegacyTopicRecommendation['viralScore'], { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-900/30', text: 'text-red-300', label: 'HIGH' },
  medium: { bg: 'bg-yellow-900/30', text: 'text-yellow-300', label: 'MID' },
  low: { bg: 'bg-gray-800/50', text: 'text-gray-400', label: 'LOW' },
};

export default function BenchmarkPanel() {
  const channelScripts = useChannelAnalysisStore((s) => s.channelScripts);
  const channelGuideline = useChannelAnalysisStore((s) => s.channelGuideline);
  const channelInfo = useChannelAnalysisStore((s) => s.channelInfo);
  const savedBenchmarks = useChannelAnalysisStore((s) => s.savedBenchmarks);
  const loadBenchmark = useChannelAnalysisStore((s) => s.loadBenchmark);
  const removeBenchmark = useChannelAnalysisStore((s) => s.removeBenchmark);

  const topics = useScriptWriterStore((s) => s.topics);
  const setTopics = useScriptWriterStore((s) => s.setTopics);
  const setBenchmarkScript = useScriptWriterStore((s) => s.setBenchmarkScript);
  const setActiveStep = useScriptWriterStore((s) => s.setActiveStep);
  const setSelectedTopic = useScriptWriterStore((s) => s.setSelectedTopic);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const elapsed = useElapsedTimer(isAnalyzing);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hasBenchmarkData = channelScripts.length > 0 || channelGuideline !== null;

  const [analyzeError, setAnalyzeError] = useState('');

  const handleAnalyze = useCallback(async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalyzeError('');

    const scriptSummaries = channelScripts.slice(0, 5).map((s, i) =>
      `[대본 ${i + 1}] 제목: ${s.title}\n조회수: ${s.viewCount.toLocaleString()}\n내용(앞 500자): ${s.transcript.slice(0, 500)}`
    ).join('\n\n');

    const guidelineInfo = channelGuideline
      ? `[채널 스타일 가이드]\n채널명: ${channelGuideline.channelName}\n말투: ${channelGuideline.tone}\n구조: ${channelGuideline.structure}\n주제: ${channelGuideline.topics.join(', ')}\n도입패턴: ${channelGuideline.hookPattern}\n마무리패턴: ${channelGuideline.closingPattern}`
      : '';

    try {
      const res = await evolinkChat(
        [
          { role: 'system', content: '당신은 유튜브 콘텐츠 전략가입니다. 벤치마크 채널의 대본과 스타일을 분석하여 바이럴 가능성이 높은 주제 10개를 추천합니다. 반드시 JSON 배열로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력합니다.' },
          { role: 'user', content: `다음 벤치마크 채널의 대본과 스타일을 분석하고, 이 채널 스타일에 맞는 새로운 영상 주제 10개를 추천해주세요.

${guidelineInfo}

${scriptSummaries}

다음 JSON 배열 형식으로 출력하세요:
[
  {
    "id": 1,
    "title": "추천 주제 제목",
    "mainSubject": "핵심 소재 한 줄 설명",
    "similarity": "벤치마크 대본과의 유사점/차별점",
    "scriptFlow": "대본 흐름 (예: 후킹 > 사례 > 분석 > CTA)",
    "viralScore": "high 또는 medium 또는 low"
  }
]

바이럴 가능성 판단 기준:
- high: 조회수 상위 대본과 유사한 구조 + 트렌드 소재
- medium: 채널 스타일과 맞지만 일반적 소재
- low: 실험적/틈새 주제

10개를 추천하되, high 3개, medium 4개, low 3개 비율로 추천하세요.` }
        ],
        { temperature: 0.8, maxTokens: 4000 }
      );

      const raw = res.choices?.[0]?.message?.content || '';
      if (!raw.trim()) throw new Error('AI 응답이 비어있습니다. 다시 시도해주세요.');
      let jsonStr = raw;
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) jsonStr = codeBlock[1].trim();

      const parsed: LegacyTopicRecommendation[] = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTopics(parsed.map((t, i) => ({
          id: t.id || i + 1,
          title: t.title || `주제 ${i + 1}`,
          mainSubject: t.mainSubject || '',
          similarity: t.similarity || '',
          scriptFlow: t.scriptFlow || '',
          viralScore: (['high', 'medium', 'low'].includes(t.viralScore) ? t.viralScore : 'medium') as LegacyTopicRecommendation['viralScore'],
        })));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyzeError(`벤치마크 분석 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, channelScripts, channelGuideline, setTopics]);

  const handleRecommend = useCallback(() => {
    setTopics([]);
    handleAnalyze();
  }, [handleAnalyze, setTopics]);

  const handleSelectTopic = useCallback((topic: LegacyTopicRecommendation) => {
    setSelectedTopic(topic);
    setActiveStep(2);
  }, [setSelectedTopic, setActiveStep]);

  const handleSelectScript = useCallback((script: ChannelScript) => {
    setSelectedScriptId(script.videoId);
    setBenchmarkScript(script.transcript);
  }, [setBenchmarkScript]);

  return (
    <div className="border-t border-gray-700/30">
      {/* 헤더 (토글) */}
      <button onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-300">벤치마크 대본</span>
          {hasBenchmarkData && (
            <span className="text-sm px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-600/30">
              {channelScripts.length}개
            </span>
          )}
        </div>
        <span className={`text-gray-500 text-sm transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
          &#9660;
        </span>
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3 max-h-[320px] overflow-auto">
          {/* 채널 정보 */}
          {channelInfo && (
            <div className="flex items-center gap-2 p-2 bg-gray-800/30 rounded-lg border border-gray-700/30">
              {channelInfo.thumbnailUrl && (
                <img src={channelInfo.thumbnailUrl} alt={channelInfo.title}
                  className="w-8 h-8 rounded-full object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{channelInfo.title}</div>
                <div className="text-sm text-gray-400">
                  구독자 {channelInfo.subscriberCount.toLocaleString()}명
                </div>
              </div>
            </div>
          )}

          {/* 벤치마크 대본 목록 (썸네일 포함) */}
          {channelScripts.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm text-gray-500 uppercase tracking-wider">채널 대본</span>
              {channelScripts.slice(0, 5).map((script) => (
                <button key={script.videoId}
                  onClick={() => handleSelectScript(script)}
                  className={`w-full text-left p-2 rounded-lg border transition-colors text-sm flex items-center gap-3
                    ${selectedScriptId === script.videoId
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-200'
                      : 'bg-gray-800/30 border-gray-700/30 text-gray-300 hover:border-gray-600'
                    }`}>
                  {/* 썸네일 */}
                  {script.thumbnailUrl ? (
                    <img src={script.thumbnailUrl} alt="" className="w-20 h-12 rounded object-cover flex-shrink-0 bg-gray-900" />
                  ) : (
                    <div className="w-20 h-12 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{script.title}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {script.viewCount > 0
                        ? `${script.duration} / 조회수 ${script.viewCount.toLocaleString()}`
                        : `${script.transcript.length.toLocaleString()}자`
                      }
                    </div>
                  </div>
                  {selectedScriptId === script.videoId && (
                    <span className="text-blue-400 flex-shrink-0">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 에러 표시 */}
          {analyzeError && (
            <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg">
              <p className="text-sm text-red-400">{analyzeError}</p>
            </div>
          )}

          {/* 분석 버튼 */}
          {hasBenchmarkData && topics.length === 0 && (
            <button onClick={handleAnalyze} disabled={isAnalyzing}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
                hover:from-blue-500 hover:to-violet-500 disabled:opacity-40
                text-white rounded-lg text-sm font-bold shadow-md transition-all
                flex items-center justify-center gap-2">
              {isAnalyzing ? (
                <><span className="animate-spin">&#9696;</span> 분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</>
              ) : (
                <>벤치 분석 및 주제 추천</>
              )}
            </button>
          )}

          {/* 저장된 벤치마크 불러오기 */}
          {savedBenchmarks.length > 0 && !hasBenchmarkData && (
            <div className="space-y-1.5">
              <span className="text-sm text-gray-500 uppercase tracking-wider">저장된 벤치마크</span>
              {savedBenchmarks.map((bm) => (
                <div key={bm.id} className="flex items-center gap-2">
                  <button
                    onClick={() => loadBenchmark(bm.id)}
                    className="flex-1 text-left p-2 rounded-lg border bg-gray-800/30 border-gray-700/30 text-gray-300 hover:border-blue-500/50 hover:bg-blue-900/10 transition-colors text-sm"
                  >
                    <div className="font-medium">{bm.channelName}</div>
                    <div className="text-xs text-gray-500">
                      {bm.scripts.length}개 대본 / {new Date(bm.savedAt).toLocaleDateString('ko')}
                    </div>
                  </button>
                  <button
                    onClick={() => removeBenchmark(bm.id)}
                    className="text-gray-600 hover:text-red-400 text-sm p-1 transition-colors"
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 데이터 없을 때 안내 — 눈에 잘 띄게 */}
          {!hasBenchmarkData && savedBenchmarks.length === 0 && (
            <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/40 rounded-xl p-5 text-center space-y-3">
              <div className="w-12 h-12 mx-auto bg-blue-600/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <p className="text-base font-bold text-white">
                채널분석 탭에서 벤치마크 대본을 먼저 추출하세요
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">
                <span className="text-blue-400 font-bold">채널분석</span> &gt; <span className="text-blue-400 font-bold">채널 분석실</span>에서
                YouTube 채널 URL을 입력하고 <span className="text-cyan-400 font-bold">"분석 시작"</span>을 클릭하면<br/>
                대본이 자동 수집됩니다.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => setActiveTab('channel-analysis')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-blue-900/30"
                >
                  <span>🔍</span>
                  <span>채널분석 탭으로 이동</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}

          {/* 주제 추천 목록 */}
          {topics.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 uppercase tracking-wider">주제 추천</span>
                <button onClick={handleRecommend}
                  className="text-sm text-blue-400 hover:text-blue-300 underline">
                  주제 10개 재추천
                </button>
              </div>

              {topics.map((topic) => {
                const viral = VIRAL_COLORS[topic.viralScore];
                return (
                  <button key={topic.id}
                    onClick={() => handleSelectTopic(topic)}
                    className="w-full text-left p-2.5 bg-gray-800/30 rounded-lg border border-gray-700/30
                      hover:border-gray-600 transition-colors group">
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-bold text-gray-500 mt-0.5 flex-shrink-0 w-5">
                        {topic.id}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">
                            {topic.title}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${viral.bg} ${viral.text}`}>
                            {viral.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400 mt-1 truncate">
                          {topic.mainSubject}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5 truncate">
                          {topic.scriptFlow}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
