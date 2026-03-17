import React, { useState, useCallback, useRef } from 'react';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { evolinkChat, getEvolinkKey, evolinkFrameAnalysisStream } from '../../../services/evolinkService';
import { getVideoTranscript } from '../../../services/youtubeAnalysisService';
import { parseFileToText } from '../../../services/fileParserService';
import { extractFramesForAnalysis } from '../../../services/shoppingScriptService';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import type { ChannelGuideline, ChannelScript, RemakeVersion } from '../../../types';

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function buildChannelContext(g: ChannelGuideline, scripts: ChannelScript[]): string {
  const parts = [
    `채널명: ${g.channelName} (참조용 — 생성 대본에 채널명 언급 금지)`, `말투: ${g.tone}`, `구조: ${g.structure}`,
    `도입패턴: ${g.hookPattern}`, `마무리패턴: ${g.closingPattern} (채널명이 포함된 멘트는 제외)`,
  ];
  if (g.visualGuide) parts.push(`시각 스타일: ${g.visualGuide.slice(0, 300)}`);
  if (g.editGuide) parts.push(`편집 스타일: ${g.editGuide.slice(0, 300)}`);
  if (g.audioGuide) parts.push(`오디오 스타일: ${g.audioGuide.slice(0, 300)}`);
  if (g.fullGuidelineText) parts.push(`\n상세 스타일:\n${g.fullGuidelineText.slice(0, 1500)}`);
  const samples = scripts.filter(s => s.transcript.length > 100).slice(0, 2);
  if (samples.length) {
    parts.push('\n[말투 참고 샘플]');
    samples.forEach((s, i) => parts.push(`--- 샘플 ${i + 1}: "${s.title}" ---\n${s.transcript.slice(0, 400)}`));
  }
  return parts.join('\n');
}

const VERSION_CONFIGS = [
  { label: '원본 충실', icon: '🎯', desc: '원본 내용을 채널 말투로 그대로 재작성',
    instruction: '원본 소스 영상의 내용과 구조를 최대한 유지하되, 채널 스타일의 말투/어조/종결어미를 정확히 적용하여 재작성하라. 새로운 내용을 추가하지 마라.' },
  { label: '구조 재편집', icon: '🔄', desc: '채널의 기승전결·훅·마무리 패턴으로 재구성',
    instruction: '원본 소스 영상의 핵심 내용을 유지하되, 채널 고유의 도입 패턴(훅), 기승전결 구조, 마무리 패턴을 정확히 적용하여 구조를 재편집하라. 채널의 소제목 스타일도 반영하라.' },
  { label: '창작 확장', icon: '🚀', desc: '소재만 빌려서 채널 스타일로 완전히 새로 작성',
    instruction: '원본 소스 영상의 주제/소재만 참고하고, 채널 고유의 관점·말투·구조·감정 전개로 완전히 새로운 대본을 작성하라. 채널이 이 주제를 다뤘다면 이렇게 만들었을 것이라는 수준으로 창작하라.' },
];

const CARD_COLORS = [
  { bg: 'from-blue-900/30 to-blue-800/20', border: 'border-blue-500/30', accent: 'text-blue-400', btn: 'from-blue-600 to-blue-500' },
  { bg: 'from-violet-900/30 to-violet-800/20', border: 'border-violet-500/30', accent: 'text-violet-400', btn: 'from-violet-600 to-violet-500' },
  { bg: 'from-emerald-900/30 to-emerald-800/20', border: 'border-emerald-500/30', accent: 'text-emerald-400', btn: 'from-emerald-600 to-emerald-500' },
];

const ChannelRemakePanel: React.FC = () => {
  const channelGuideline = useChannelAnalysisStore(s => s.channelGuideline);
  const channelScripts = useChannelAnalysisStore(s => s.channelScripts);
  // [#414] 리메이크 버전/소스를 스토어에서 관리 (프리셋 복원용)
  const versions = useChannelAnalysisStore(s => s.remakeVersions);
  const setVersions = useChannelAnalysisStore(s => s.setRemakeVersions);
  const sourceInput = useChannelAnalysisStore(s => s.remakeSourceInput);
  const setSourceInput = useChannelAnalysisStore(s => s.setRemakeSourceInput);
  const setFinalScript = useScriptWriterStore(s => s.setFinalScript);
  const setTitle = useScriptWriterStore(s => s.setTitle);
  const setGeneratedScript = useScriptWriterStore(s => s.setGeneratedScript);
  const setActiveStep = useScriptWriterStore(s => s.setActiveStep);
  const swSetContentFormat = useScriptWriterStore(s => s.setContentFormat);
  const swSetSelectedTopic = useScriptWriterStore(s => s.setSelectedTopic);
  const setActiveTab = useNavigationStore(s => s.setActiveTab);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoAnalysisProgress, setVideoAnalysisProgress] = useState('');
  const elapsed = useElapsedTimer(isGenerating);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedVideoId = sourceInput.trim() ? extractVideoId(sourceInput.trim()) : null;

  const handleVideoAnalysis = useCallback(async (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      setError('200MB 이하 영상만 업로드할 수 있습니다.');
      return;
    }
    if (!getEvolinkKey()) {
      setError('Evolink API 키를 먼저 설정해주세요.');
      return;
    }

    setIsAnalyzingVideo(true);
    setVideoAnalysisProgress('프레임 추출 중...');
    setError('');

    try {
      const dataUrls = await extractFramesForAnalysis(file, 8);
      if (dataUrls.length === 0) throw new Error('영상에서 프레임을 추출할 수 없습니다.');

      setVideoAnalysisProgress(`${dataUrls.length}개 프레임 추출 완료, AI 분석 중...`);

      const frames = dataUrls.map((dataUrl, i) => {
        const parts = dataUrl.split(',');
        const base64 = parts[1] || '';
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        return { base64, mimeType, label: `[프레임 ${i + 1}/${dataUrls.length}]` };
      }).filter(f => f.base64.length > 0);

      const sysPrompt = `당신은 영상 콘텐츠 분석 전문가입니다. 영상에서 추출한 프레임을 분석하여 영상의 전체 내용을 상세히 설명해주세요.

분석 항목:
1. 영상의 주제/소재
2. 주요 내용 흐름 (시작 → 전개 → 마무리)
3. 핵심 메시지/정보
4. 등장인물/대상
5. 배경/분위기

결과는 한국어로, 대본 리메이크의 원본 소스로 활용할 수 있도록 상세하게 서술해주세요. 마크다운 없이 순수 텍스트로 작성하세요.`;

      const userMsg = `이 영상(${file.name})의 ${frames.length}개 프레임을 분석하여 영상 전체 내용을 상세히 설명해주세요. 이 설명은 채널 스타일 대본 리메이크의 원본 소재로 사용됩니다.`;

      const analysisText = await evolinkFrameAnalysisStream(
        frames, sysPrompt, userMsg,
        (_chunk, accumulated) => setVideoAnalysisProgress(`AI 분석 중... (${accumulated.length}자)`),
        { temperature: 0.5, maxOutputTokens: 4096 }
      );

      if (!analysisText || analysisText.trim().length < 50) {
        throw new Error('영상 분석 결과가 너무 짧습니다. 다른 영상을 시도해주세요.');
      }

      setSourceInput(analysisText.trim());
      showToast(`"${file.name}" 영상 분석 완료`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[Remake] 영상 분석 실패', msg);
      setError(`영상 분석 실패: ${msg}`);
    } finally {
      setIsAnalyzingVideo(false);
      setVideoAnalysisProgress('');
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      if (file.type.startsWith('video/')) {
        await handleVideoAnalysis(file);
      } else {
        const text = await parseFileToText(file);
        setSourceInput(text);
        showToast(`"${file.name}" 불러옴`);
      }
    } catch (e) {
      setError(`파일 처리 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [handleVideoAnalysis]);

  const handleGenerate = useCallback(async () => {
    if (!channelGuideline || !sourceInput.trim()) return;
    if (!getEvolinkKey()) { setError('Evolink API 키를 먼저 설정해주세요.'); return; }
    setIsGenerating(true);
    setGeneratingStep(0);
    setError('');
    setVersions([]);

    try {
      let sourceContent = sourceInput.trim();
      const videoId = extractVideoId(sourceInput);
      if (videoId) {
        const result = await getVideoTranscript(videoId);
        sourceContent = result.text;
        if (result.source === 'description' && sourceContent.length > 0) {
          // [FIX #286] 자막 없는 영상도 제목+설명으로 분석 허용 (정확도 저하 경고)
          showToast('이 영상의 자막을 찾을 수 없어 제목과 설명으로 대체합니다. 정확도가 낮을 수 있습니다.');
        } else if (sourceContent.length < 50) {
          throw new Error('이 영상에는 자막과 설명이 없어 분석할 수 없습니다. 영상 내용을 직접 텍스트로 붙여넣어 주세요.');
        }
      }

      const channelContext = buildChannelContext(channelGuideline, channelScripts);
      const formatLabel = channelGuideline.contentFormat === 'shorts'
        ? '쇼츠 (60초 이내, 약 500-800자)' : '롱폼 (5-15분, 약 3000-8000자)';
      const systemPrompt = `너는 YouTube 영상 대본 리메이크 전문가다. 주어진 채널의 스타일(말투, 구조, 감정 전개)을 정확히 모방하여 원본 소스를 재작성한다. 콘텐츠 포맷: ${formatLabel}. 반드시 JSON으로 응답하라.`;

      // 순차 실행: 429 Rate Limit 방지 (동시 3개 → 순차 + 2초 간격)
      const results: RemakeVersion[] = [];
      const failedLabels: string[] = [];

      for (let i = 0; i < VERSION_CONFIGS.length; i++) {
        const cfg = VERSION_CONFIGS[i];
        setGeneratingStep(i + 1);

        // 두 번째/세 번째 요청 전 대기 (Rate Limit 방지)
        if (i > 0) await new Promise(r => setTimeout(r, 2000));

        try {
          const userPrompt = `[채널 스타일 DNA]\n${channelContext}\n\n[원본 소스 영상 내용]\n${sourceContent.slice(0, 4000)}\n\n[버전: ${cfg.label}]\n${cfg.instruction}\n\n아래 JSON 포맷으로 응답하라:\n{"title":"제목","subtitles":["소제목1","소제목2",...],"emotionGuide":"도입: ...\\n전개: ...\\n클라이막스: ...\\n마무리: ...","script":"전체 대본 텍스트","commentReactions":["예상 댓글 반응1","예상 댓글 반응2","예상 댓글 반응3"]}\n\ncommentReactions: 이 영상이 올라갔을 때 시청자들이 남길 법한 자연스러운 댓글 반응 3~5개를 작성하라. 실제 유튜브 댓글처럼 자연스럽게.`;

          // [FIX #467] 롱폼 대본은 8192 토큰으로 부족 → 포맷에 따라 동적 조정
          const isLongForm = channelGuideline.contentFormat !== 'shorts';
          const response = await evolinkChat(
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            { temperature: 0.8, maxTokens: isLongForm ? 16384 : 8192, responseFormat: { type: 'json_object' } }
          );
          const text = response.choices[0]?.message?.content || '';
          try {
            const cleaned = text.replace(/^```(?:json)?\n?/g, '').replace(/\n?```$/g, '').trim();
            const parsed = JSON.parse(cleaned);
            results.push({ label: cfg.label, icon: cfg.icon, description: cfg.desc,
              title: parsed.title || cfg.label, subtitles: Array.isArray(parsed.subtitles) ? parsed.subtitles : [],
              emotionGuide: parsed.emotionGuide || '', script: parsed.script || text,
              commentReactions: Array.isArray(parsed.commentReactions) ? parsed.commentReactions : [] } as RemakeVersion);
          } catch {
            results.push({ label: cfg.label, icon: cfg.icon, description: cfg.desc,
              title: cfg.label, subtitles: [], emotionGuide: '', script: text,
              commentReactions: [] } as RemakeVersion);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn('[Remake] 버전 생성 실패, 다음 시도', { label: cfg.label, error: msg });
          failedLabels.push(cfg.label);
        }
      }

      if (results.length === 0) {
        throw new Error('모든 버전 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }

      setVersions(results);
      if (failedLabels.length > 0) {
        setError(`일부 버전 생성 실패 (${failedLabels.join(', ')}). 성공한 ${results.length}개 버전을 표시합니다.`);
      }
      showToast(`${results.length}가지 버전이 생성되었습니다!`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[Remake] 생성 실패', msg);
      setError(`생성 실패: ${msg}`);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(0);
    }
  }, [channelGuideline, channelScripts, sourceInput]);

  const handleSelect = useCallback((version: RemakeVersion) => {
    const charCount = version.script.length;
    const totalSec = Math.round((charCount / 650) * 60);
    const m = Math.floor(totalSec / 60);
    // [FIX #280] selectedTopic을 먼저 null로 초기화 — ScriptWriterTab mount 시
    // useEffect가 selectedTopic 기반으로 generatedScript/finalScript를 전부 지우는 버그 방지
    swSetSelectedTopic(null);
    setTitle(version.title);
    setGeneratedScript({
      title: version.title, content: version.script, charCount,
      estimatedDuration: m > 0 ? `약 ${m}분` : `약 ${totalSec}초`,
      structure: version.subtitles,
    });
    setFinalScript(version.script);
    swSetContentFormat(channelGuideline?.contentFormat || 'long');
    setActiveStep(3);
    setActiveTab('script-writer');
    showToast(`"${version.title}" → 대본작성 탭으로 이동`);
  }, [setTitle, setGeneratedScript, setFinalScript, swSetContentFormat, swSetSelectedTopic, setActiveStep, setActiveTab, channelGuideline]);

  if (!channelGuideline) return null;

  return (
    <div className="bg-gradient-to-br from-blue-900/20 to-violet-900/20 rounded-2xl border border-blue-500/20 p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">이 채널 스타일로 대본 만들기</h3>
          <p className="text-xs text-gray-500">{channelGuideline.channelName} 스타일 · 3가지 버전 동시 생성</p>
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          value={sourceInput}
          onChange={e => setSourceInput(e.target.value)}
          placeholder="YouTube 링크를 붙여넣거나, 원본 대본/내용을 직접 입력하세요 (영상 파일도 첨부 가능)"
          rows={3}
          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 px-4 py-3 pr-20 focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="absolute right-2 top-2 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-[11px] rounded-md border border-gray-600 transition-colors"
          title="파일/영상에서 불러오기"
        >
          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          파일
        </button>
        <input ref={fileInputRef} type="file" accept=".txt,.srt,.vtt,.pdf,.doc,.docx,video/mp4,video/webm,video/quicktime" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {/* URL 감지 표시 */}
      {detectedVideoId && (
        <p className="text-xs text-blue-400 mt-1.5 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" /></svg>
          YouTube 영상 감지됨 — 자막을 자동 추출합니다
        </p>
      )}

      {/* 영상 분석 프로그레스 */}
      {isAnalyzingVideo && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs text-blue-400">{videoAnalysisProgress || '영상 분석 중...'}</span>
        </div>
      )}

      {error && (
        <div className="mt-2 px-4 py-2.5 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-sm text-red-400 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || isAnalyzingVideo || !sourceInput.trim()}
        className="w-full mt-3 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {generatingStep > 0 ? `${generatingStep}/3 ${VERSION_CONFIGS[generatingStep - 1]?.label || ''} 생성 중...` : '준비 중...'}
            {elapsed > 0 && <span className="text-xs text-blue-200 tabular-nums">{formatElapsed(elapsed)}</span>}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            대본 생성하기
          </>
        )}
      </button>

      {/* Results — 3 Version Cards */}
      {versions.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400">{versions.length}가지 버전이 생성되었습니다</p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg border border-gray-600 transition-all disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              다른 느낌으로 다시 생성
            </button>
          </div>
          <div className={`grid grid-cols-1 ${versions.length >= 3 ? 'md:grid-cols-3' : versions.length === 2 ? 'md:grid-cols-2' : ''} gap-4`}>
          {versions.map((v, i) => {
            const isExpanded = expandedIdx === i;
            const c = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <div key={i} className={`bg-gradient-to-b ${c.bg} rounded-xl border ${c.border} p-4 flex flex-col`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{v.icon}</span>
                  <span className={`text-sm font-bold ${c.accent}`}>{v.label}</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{v.description}</p>
                <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">{v.title}</h4>

                {v.subtitles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {v.subtitles.slice(0, 5).map((s, si) => (
                      <span key={si} className="text-[10px] px-1.5 py-0.5 bg-gray-800/80 text-gray-400 rounded border border-gray-700/50 truncate max-w-[120px]">{s}</span>
                    ))}
                    {v.subtitles.length > 5 && <span className="text-[10px] text-gray-600">+{v.subtitles.length - 5}</span>}
                  </div>
                )}

                <div className={`bg-gray-900/60 rounded-lg p-3 border border-gray-700/30 mb-3 flex-1 ${isExpanded ? 'max-h-96 overflow-y-auto custom-scrollbar' : 'max-h-28 overflow-hidden'}`}>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {isExpanded ? v.script : v.script.slice(0, 200) + (v.script.length > 200 ? '...' : '')}
                  </p>
                </div>

                {v.commentReactions.length > 0 && (
                  <div className="bg-cyan-900/20 rounded-lg p-3 border border-cyan-800/30 mb-3">
                    <p className="text-[10px] font-medium text-cyan-400 mb-1.5 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      예상 댓글 반응
                    </p>
                    {v.commentReactions.slice(0, isExpanded ? 5 : 2).map((comment, ci) => (
                      <p key={ci} className="text-xs text-gray-400 mb-1 pl-2 border-l-2 border-cyan-800/40">"{comment}"</p>
                    ))}
                    {!isExpanded && v.commentReactions.length > 2 && (
                      <p className="text-[10px] text-gray-600 pl-2">+{v.commentReactions.length - 2}개 더</p>
                    )}
                  </div>
                )}

                {isExpanded && v.emotionGuide && (
                  <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-800/30 mb-3">
                    <p className="text-[10px] font-medium text-purple-400 mb-1">감정 가이드</p>
                    <p className="text-xs text-gray-400 whitespace-pre-wrap">{v.emotionGuide}</p>
                  </div>
                )}

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => handleSelect(v)}
                    className={`flex-1 py-2 bg-gradient-to-r ${c.btn} hover:brightness-110 text-white text-sm font-bold rounded-lg transition-all`}
                  >
                    이걸로 선택
                  </button>
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg border border-gray-600 transition-all"
                  >
                    {isExpanded ? '접기' : '전체'}
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelRemakePanel;
