import React, { useState, useCallback } from 'react';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { showToast } from '../../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { getChannelInfo, getRecentVideosByFormat, getVideoTranscript, analyzeChannelStyle, analyzeChannelStyleDNA } from '../../../services/youtubeAnalysisService';
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
    setChannelInfo, setChannelScripts, setChannelGuideline, savePreset, loadPreset,
    setInputSource, setUploadedFiles, setSourceName,
  } = useChannelAnalysisStore();
  const setActiveTab = useNavigationStore(s => s.setActiveTab);
  const swSetTopics = useScriptWriterStore(s => s.setTopics);

  const [contentFormat, setContentFormat] = useState<ContentFormat>('long');
  const [videoCount, setVideoCount] = useState(10);
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
      setProgress({ step: 2, message: `영상 ${videoCount}개 수집 중...` });
      const filtered = await getRecentVideosByFormat(info.channelId, contentFormat, videoCount);
      if (!filtered.length) { setError('해당 형식에 맞는 영상이 없습니다.'); setProgress(null); return; }
      const scripts: ChannelScript[] = [];
      for (let i = 0; i < filtered.length; i++) {
        setProgress({ step: 3, message: `대본 수집 중 (${i + 1}/${filtered.length})...` });
        scripts.push({ ...filtered[i], transcript: await getVideoTranscript(filtered[i].videoId) });
      }
      setChannelScripts(scripts);
      setProgress({ step: 4, message: 'AI 채널 스타일 DNA 다층 분석 중... (텍스트 + 시각 + 편집 + 오디오 + 댓글)' });
      setChannelGuideline(await analyzeChannelStyleDNA(scripts, info));
      setProgress(null);
      showToast('채널 스타일 DNA 분석이 완료되었습니다.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ChannelAnalysis] 채널 분석 실패:', e);
      setError(`채널 분석 실패: ${msg}`);
      setProgress(null);
    }
  }, [channelUrl, contentFormat, videoCount, setChannelInfo, setChannelScripts, setChannelGuideline]);

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
    if (!topicInput.trim() && !channelGuideline) return;
    setIsAnalyzing(true);
    setTopicError('');

    const styleInfo = channelGuideline
      ? `[채널 스타일]\n채널명: ${channelGuideline.channelName}\n말투: ${channelGuideline.tone}\n구조: ${channelGuideline.structure}\n주제: ${(Array.isArray(channelGuideline.topics) ? channelGuideline.topics : []).join(', ')}\n도입패턴: ${channelGuideline.hookPattern}\n마무리패턴: ${channelGuideline.closingPattern}`
      : '';

    try {
      const instinctTaxonomy = buildInstinctTaxonomy();
      const res = await evolinkChat(
        [
          { role: 'system', content: '당신은 유튜브 콘텐츠 전략가입니다. 채널 스타일과 주제를 분석하여 바이럴 가능성이 높은 영상 주제 10개를 추천합니다. 각 주제에 대해 어떤 심리적 본능 기제를 자극하는지도 분석하세요. 반드시 JSON 배열로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력합니다.' },
          { role: 'user', content: `${styleInfo}\n\n[본능 기제 분류 체계]\n${instinctTaxonomy}\n\n사용자 입력 주제: ${topicInput || '(자유 추천)'}\n\n위 채널 스타일에 맞는 새로운 영상 주제 10개를 추천하세요.\n\nJSON 배열:\n[\n  {\n    "id": 1,\n    "title": "영상 제목",\n    "mainSubject": "핵심 소재 한 줄",\n    "similarity": "채널 스타일과의 유사점",\n    "scriptFlow": "대본 흐름 (예: 후킹 > 사례 > 분석 > CTA)",\n    "viralScore": "high 또는 medium 또는 low",\n    "instinctAnalysis": {\n      "primaryInstincts": ["자극하는 핵심 본능 2~3개"],\n      "comboFormula": "본능 조합 공식 (예: 공포+비교+긴급)",\n      "hookSuggestion": "AI가 생성한 훅 문장"\n    }\n  }\n]\n\nhigh 3개, medium 4개, low 3개 비율로 추천하세요.` }
        ],
        { temperature: 0.8, maxTokens: 6000 }
      );

      const raw = res.choices?.[0]?.message?.content || '';
      if (!raw.trim()) throw new Error('AI 응답이 비어있습니다.');
      let jsonStr = raw;
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) jsonStr = codeBlock[1].trim();

      let parsed: (LegacyTopicRecommendation & { instinctAnalysis?: TopicInstinctAnalysis })[];
      try { parsed = JSON.parse(jsonStr); } catch { throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.'); }
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
                  ? `구독자 ${fmtSubs(channelInfo.subscriberCount)}명 | 영상 ${channelInfo.videoCount}개`
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
            <span className="text-sm text-gray-500">
              {inputSource === 'youtube' ? '분석에 사용된 영상 목록' : '스타일 분석에 활용되는 텍스트'}
            </span>
          </div>

          {inputSource === 'youtube' ? (
            /* YouTube 썸네일 갤러리 */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {channelScripts.map((s) => (
                <a
                  key={s.videoId}
                  href={`https://www.youtube.com/watch?v=${s.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg overflow-hidden bg-gray-900/50 border border-gray-700/50 hover:border-orange-500/50 transition-all hover:shadow-lg hover:shadow-orange-900/10"
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
                  <div className="p-2">
                    <p className="text-sm font-medium text-gray-200 line-clamp-2 leading-tight group-hover:text-orange-300 transition-colors">
                      {s.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                      <span>조회수 {fmtViews(s.viewCount)}회</span>
                      <span>·</span>
                      <span>{fmtDate(s.publishedAt)}</span>
                    </div>
                  </div>
                </a>
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

          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
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
                <label className="block text-sm font-medium text-blue-400 mb-1.5">시각 스타일 (썸네일 + 영상 화면 분석)</label>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.visualGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.editGuide && (
              <div>
                <label className="block text-sm font-medium text-amber-400 mb-1.5">편집 스타일 (컷 리듬 / 전환 / 카메라 / 색보정)</label>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.editGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.audioGuide && (
              <div>
                <label className="block text-sm font-medium text-fuchsia-400 mb-1.5">오디오 스타일 (BGM / 효과음 / 보이스톤)</label>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.audioGuide}</p>
                </div>
              </div>
            )}
            {channelGuideline.titleFormula && (
              <div>
                <label className="block text-sm font-medium text-orange-400 mb-1.5">제목 / 메타데이터 공식</label>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{channelGuideline.titleFormula}</p>
                </div>
              </div>
            )}
            {channelGuideline.audienceInsight && (
              <div>
                <label className="block text-sm font-medium text-cyan-400 mb-1.5">시청자 인사이트 (댓글 감성 분석)</label>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 max-h-48 overflow-y-auto custom-scrollbar">
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
            {savedPresets.map((p, i) => (
              <button
                key={i}
                onClick={() => loadPreset(p.channelName)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${channelGuideline?.channelName === p.channelName
                  ? 'bg-blue-600/20 text-blue-400 border-blue-600/50'
                  : 'bg-gray-900/50 text-gray-300 border-gray-700/50 hover:border-blue-600/50 hover:bg-gray-900'
                }`}
              >
                {p.channelName}
              </button>
            ))}
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
