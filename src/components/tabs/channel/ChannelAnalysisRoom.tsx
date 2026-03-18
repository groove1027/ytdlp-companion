import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { showToast } from '../../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { getChannelInfo, getRecentVideosByFormat, getVideoTranscript, analyzeChannelStyle, analyzeChannelStyleDNA, retryFailedStyleDNA, detectContentRegion, getRelatedKeywords, getTopVideos } from '../../../services/youtubeAnalysisService';
import type { TranscriptResult } from '../../../services/youtubeAnalysisService';
import { getYoutubeApiKey } from '../../../services/apiService';
import { evolinkChat } from '../../../services/evolinkService';
import { buildInstinctTaxonomy } from '../../../data/instinctPromptUtils';
import { logger } from '../../../services/LoggerService';
import ChannelInputPanel from './ChannelInputPanel';
import AnalysisLoadingPanel, { notifyAnalysisComplete } from './AnalysisLoadingPanel';
import AnalysisSlotBar from './AnalysisSlotBar';
import ChannelRemakePanel from './ChannelRemakePanel';
import type { LegacyTopicRecommendation, ContentFormat, ContentRegion, ChannelScript, ChannelInfo, ChannelGuideline, TopicInstinctAnalysis } from '../../../types';

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

/* ─── [#331] 편집 가능 헬퍼 컴포넌트 ─── */
const EditableDRow: React.FC<{ l: string; v: string; onSave: (val: string) => void }> = ({ l, v, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(v); }, [v]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [editing]);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
        {l}
        <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </label>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onBlur={() => { setEditing(false); if (draft.trim() !== v) onSave(draft.trim()); }}
          onKeyDown={e => { if (e.key === 'Escape') { setDraft(v); setEditing(false); } }}
          className="w-full text-sm text-gray-200 bg-gray-900/50 rounded-lg px-3 py-2 border border-blue-500/50 focus:ring-1 focus:ring-blue-500 resize-none outline-none"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-gray-200 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50 hover:border-blue-500/30 cursor-pointer transition-colors"
          title="클릭하여 수정"
        >{v}</p>
      )}
    </div>
  );
};

const EditableTextBlock: React.FC<{ value: string; onSave: (val: string) => void; maxH?: string }> = ({ value, onSave, maxH = 'max-h-96' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 384) + 'px';
    }
  }, [editing]);
  return editing ? (
    <textarea
      ref={ref}
      value={draft}
      onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 384) + 'px'; }}
      onBlur={() => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); }}
      onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
      className={`w-full text-sm text-gray-300 bg-gray-900/50 rounded-lg p-4 border border-blue-500/50 focus:ring-1 focus:ring-blue-500 resize-none outline-none whitespace-pre-wrap ${maxH} overflow-y-auto custom-scrollbar`}
    />
  ) : (
    <div
      onClick={() => setEditing(true)}
      className={`bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 ${maxH} overflow-y-auto custom-scrollbar hover:border-blue-500/30 cursor-pointer transition-colors`}
      title="클릭하여 수정"
    >
      <p className="text-sm text-gray-300 whitespace-pre-wrap">{value}</p>
    </div>
  );
};

const TagAdder: React.FC<{ onAdd: (val: string) => void; placeholder: string; colorClass: string }> = ({ onAdd, placeholder, colorClass }) => {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);
  if (!adding) return (
    <button onClick={() => setAdding(true)} className={`px-2 py-0.5 text-sm rounded-full border border-dashed ${colorClass} transition-colors cursor-pointer`}>{placeholder}</button>
  );
  return (
    <input
      ref={inputRef}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim()) onAdd(val.trim()); setVal(''); setAdding(false); }}
      onKeyDown={e => {
        if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); setAdding(false); }
        if (e.key === 'Escape') { setVal(''); setAdding(false); }
      }}
      placeholder="입력 후 Enter"
      className="px-2 py-0.5 text-sm bg-gray-900 border border-blue-500/50 rounded-full text-white outline-none focus:ring-1 focus:ring-blue-500 w-28"
    />
  );
};

const ChannelAnalysisRoom: React.FC = () => {
  const {
    channelScripts, channelInfo, channelGuideline, savedPresets,
    inputSource, uploadedFiles, sourceName,
    topicInput, topicRecommendations,
    savedBenchmarks, activeSlotId,
    contentRegion, setContentRegion,
    // [FIX #509] channelUrl, contentFormat, videoCount, videoSortOrder → 스토어에서 관리 (탭 전환 시 유지)
    channelUrl, setChannelUrl, contentFormat, setContentFormat, videoCount, setVideoCount, videoSortOrder, setVideoSortOrder,
    setChannelInfo, setChannelScripts, setChannelGuideline, savePreset, loadPreset, removePreset,
    setInputSource, setUploadedFiles, setSourceName, syncQuota,
    setTopicInput, setTopicRecommendations,
    loadBenchmark, removeBenchmark, newAnalysis, loadAllBenchmarks,
  } = useChannelAnalysisStore();
  const setActiveTab = useNavigationStore(s => s.setActiveTab);
  const swSetTopics = useScriptWriterStore(s => s.setTopics);
  const swSetSelectedTopic = useScriptWriterStore(s => s.setSelectedTopic);

  const { requireAuth } = useAuthGuard();

  useEffect(() => { loadAllBenchmarks(); }, []);

  const [progress, setProgress] = useState<{ step: number; message: string } | null>(null);
  const [videoProgressCount, setVideoProgressCount] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  // topicInput, topicRecommendations → Zustand 스토어에서 관리 (탭 전환 시 유지)
  const topics = topicRecommendations;
  const setTopics = setTopicRecommendations;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const elapsed = useElapsedTimer(isAnalyzing);
  const progressElapsed = useElapsedTimer(!!progress);
  const [selectedTopic, setSelectedTopic] = useState<LegacyTopicRecommendation | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isGeneratingSourceGuide, setIsGeneratingSourceGuide] = useState(false);
  const sourceGuideElapsed = useElapsedTimer(isGeneratingSourceGuide);

  // --- YouTube 영상 다운로드 (yt-dlp 서버 프록시) ---
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{ current: number; total: number; failed: number } | null>(null);
  const bulkDownloadElapsed = useElapsedTimer(!!bulkDownloadProgress);

  // 서버 프록시 경유 다운로드 — Content-Disposition: attachment로 바로 파일 저장
  const downloadVideo = useCallback(async (videoId: string, title: string): Promise<boolean> => {
    logger.trackAction('YouTube 다운로드 시작', `${title} (${videoId})`);
    try {
      const { triggerDirectDownload, isYtdlpServerConfigured } = await import('../../../services/ytdlpApiService');
      if (!isYtdlpServerConfigured()) {
        throw new Error('yt-dlp API 서버가 설정되지 않았습니다');
      }
      triggerDirectDownload(videoId, 'best', title);
      showToast(`"${title}" 다운로드가 시작되었습니다`);
      return true;
    } catch (e) {
      logger.error(`[Download] 다운로드 오류: ${title} (${videoId})`, e instanceof Error ? e.message : String(e));
      showToast(`다운로드 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      return false;
    }
  }, []);

  // 일괄 다운로드
  const handleBulkVideoDownload = useCallback(async () => {
    logger.trackAction('일괄 다운로드', '채널 영상');
    const ytScripts = channelScripts.filter(s => s.videoId);
    if (!ytScripts.length) return;

    setBulkDownloadProgress({ current: 0, total: ytScripts.length, failed: 0 });
    let failed = 0;

    for (let i = 0; i < ytScripts.length; i++) {
      setBulkDownloadProgress({ current: i + 1, total: ytScripts.length, failed });
      const ok = await downloadVideo(ytScripts[i].videoId, ytScripts[i].title);
      if (!ok) failed++;
      // 레이트 리밋 방지: 2초 대기
      if (i < ytScripts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    setBulkDownloadProgress(null);
    if (failed === 0) {
      showToast(`${ytScripts.length}개 영상 다운로드를 모두 완료했습니다.`);
    } else {
      showToast(`${ytScripts.length}개 중 ${ytScripts.length - failed}개 완료, ${failed}개 실패`);
    }
  }, [channelScripts, downloadVideo]);

  // YouTube 채널 분석 (3-Layer DNA)
  const handleChannelAnalysis = useCallback(async () => {
    logger.trackAction('채널 분석 시작');
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
      let captionSuccessCount = 0;
      setVideoProgressCount({ current: 0, total: filtered.length });
      for (let i = 0; i < filtered.length; i++) {
        setProgress({ step: 3, message: `대본 수집 중 (${i + 1}/${filtered.length})...` });
        setVideoProgressCount({ current: i, total: filtered.length });
        const result: TranscriptResult = await getVideoTranscript(filtered[i].videoId);
        scripts.push({ ...filtered[i], transcript: result.text, transcriptSource: result.source });
        if (result.source === 'caption') captionSuccessCount++;
        syncQuota();
      }
      setVideoProgressCount(null);
      // 자막 확보 현황 로깅
      const descOnlyCount = scripts.length - captionSuccessCount;
      if (descOnlyCount > 0) {
        logger.warn(`[채널분석] 자막 확보: ${captionSuccessCount}/${scripts.length}개 성공, ${descOnlyCount}개는 영상 설명으로 대체`);
        if (captionSuccessCount === 0) {
          showToast(`모든 영상에서 자막을 가져오지 못해 영상 설명으로 분석합니다. 분석 정확도가 낮을 수 있습니다.`);
        }
      }
      setChannelScripts(scripts);
      // 콘텐츠 지역 자동 감지 (대본 텍스트 기반)
      const detectedRegion = detectContentRegion(scripts);
      if (detectedRegion !== contentRegion) {
        setContentRegion(detectedRegion);
        logger.info('[채널분석] 콘텐츠 지역 자동 감지', { detected: detectedRegion });
      }
      const effectiveRegion = detectedRegion;
      setProgress({ step: 4, message: `AI 채널 스타일 DNA 다층 분석 중... (${effectiveRegion === 'overseas' ? '해외 콘텐츠 모드' : '국내 콘텐츠 모드'})` });
      const guideline = await analyzeChannelStyleDNA(scripts, info, effectiveRegion);
      guideline.contentFormat = effectiveFormat;
      setChannelGuideline(guideline);
      setProgress(null);
      notifyAnalysisComplete();
      showToast('채널 스타일 DNA 분석이 완료되었습니다.');
      // [v4.5] 스마트 제목 — 채널명 기반
      useProjectStore.getState().smartUpdateTitle('channel-analysis', info.title || channelUrl);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ChannelAnalysis] 채널 분석 실패:', e);
      // [FIX #336] 사용자 친화적 에러 메시지 — 기술 용어 대신 원인 + 해결 방법 안내
      const hint = msg.includes('키가 설정되지') || msg.includes('인증 실패')
        ? '💡 설정에서 Evolink API 키를 확인해주세요.'
        : msg.includes('잔액 부족')
          ? '💡 Evolink 크레딧이 소진되었어요. 충전 후 다시 시도해주세요.'
          : msg.includes('429') || msg.includes('요청 제한')
            ? '💡 AI 서버가 일시적으로 바빠요. 잠시 후 다시 시도해주세요.'
            : msg.includes('400') || msg.includes('콘텐츠 정책')
              ? '💡 AI가 이 채널의 일부 콘텐츠를 분석하지 못했어요. 잠시 후 "실패 항목 재분석" 버튼을 눌러보세요.'
              : msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('Network')
                ? '💡 네트워크 연결이 불안정해요. 인터넷 확인 후 다시 시도해주세요.'
                : '💡 잠시 후 다시 시도해보세요. 반복되면 피드백으로 알려주세요.';
      setError(`채널 분석 중 문제가 발생했어요. ${hint}`);
      setProgress(null);
    }
  }, [channelUrl, contentFormat, contentRegion, videoCount, videoSortOrder, setChannelInfo, setChannelScripts, setChannelGuideline, setContentRegion]);

  // 파일/직접입력 스타일 분석
  const handleFileManualAnalyze = useCallback(async (scripts: ChannelScript[]) => {
    logger.trackAction('파일/수동 분석 시작');
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

    // [FIX #388] 글로벌 타임아웃: AI 분석 무한 대기 방지 (5분)
    const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;
    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => abortCtrl.abort(), ANALYSIS_TIMEOUT_MS);

    try {
      setProgress({ step: 1, message: '텍스트 준비 중...' });
      setChannelInfo(stubInfo);
      setChannelScripts(scripts);
      // 파일/직접입력도 콘텐츠 지역 자동 감지
      const detectedRegion = detectContentRegion(scripts);
      if (detectedRegion !== contentRegion) setContentRegion(detectedRegion);
      setProgress({ step: 4, message: `AI 스타일 역설계 분석 중... (${detectedRegion === 'overseas' ? '해외 콘텐츠 모드' : '국내 콘텐츠 모드'})` });
      const result = await Promise.race([
        analyzeChannelStyle(scripts, stubInfo, detectedRegion),
        new Promise<never>((_, reject) => {
          abortCtrl.signal.addEventListener('abort', () =>
            reject(new Error('분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')));
        }),
      ]);
      setChannelGuideline(result);
      setProgress(null);
      notifyAnalysisComplete();
      showToast('스타일 분석이 완료되었습니다.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ChannelAnalysis] 스타일 분석 실패:', e);
      const hint = msg.includes('키가 설정되지') || msg.includes('인증 실패')
        ? '💡 설정에서 Evolink API 키를 확인해주세요.'
        : msg.includes('시간이 초과')
          ? '💡 AI 분석이 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.'
          : msg.includes('400') || msg.includes('콘텐츠 정책')
            ? '💡 AI가 일부 콘텐츠를 분석하지 못했어요. 잠시 후 다시 시도해주세요.'
            : msg.includes('Failed to fetch') || msg.includes('Network')
              ? '💡 네트워크 연결이 불안정해요. 인터넷 확인 후 다시 시도해주세요.'
              : '💡 잠시 후 다시 시도해보세요.';
      setError(`스타일 분석 중 문제가 발생했어요. ${hint}`);
      setProgress(null);
    } finally {
      clearTimeout(timeout);
    }
  }, [sourceName, contentRegion, setChannelInfo, setChannelScripts, setChannelGuideline, setContentRegion]);

  // [FIX #209] 실패한 레이어만 재분석
  const handleRetryFailed = useCallback(async () => {
    if (!channelGuideline || !channelInfo || !channelScripts.length) return;
    setIsRetrying(true);
    setError('');
    try {
      const updated = await retryFailedStyleDNA(channelScripts, channelInfo, channelGuideline, contentRegion);
      updated.contentFormat = channelGuideline.contentFormat;
      setChannelGuideline(updated);
      if (!updated.failedLayers?.length) {
        showToast('실패했던 분석이 모두 완료되었습니다!');
      } else {
        showToast(`${(channelGuideline.failedLayers?.length || 0) - updated.failedLayers.length}개 항목 복구, ${updated.failedLayers.length}개 여전히 실패`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ChannelAnalysis] 재분석 실패:', e);
      const hint = msg.includes('400') || msg.includes('콘텐츠 정책')
        ? '💡 AI 서버가 해당 콘텐츠를 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
        : msg.includes('Failed to fetch') || msg.includes('Network')
          ? '💡 네트워크 연결을 확인해주세요.'
          : '💡 잠시 후 다시 시도해보세요.';
      setError(`재분석 중 문제가 발생했어요. ${hint}`);
    } finally {
      setIsRetrying(false);
    }
  }, [channelGuideline, channelInfo, channelScripts, contentRegion, setChannelGuideline]);

  // [#232] 소재 발굴 가이드 생성
  const handleGenerateSourceGuide = useCallback(async () => {
    if (!channelGuideline) return;
    if (!requireAuth('소재 발굴 가이드')) return;
    setIsGeneratingSourceGuide(true);
    try {
      const topicsStr = (Array.isArray(channelGuideline.topics) ? channelGuideline.topics : []).join(', ');
      const keywordsStr = (Array.isArray(channelGuideline.keywords) ? channelGuideline.keywords : []).join(', ');
      const formatLabel = channelGuideline.contentFormat === 'shorts' ? '쇼츠 (60초 이내)' : '롱폼 (10분 내외)';

      const res = await evolinkChat(
        [
          { role: 'system', content: `당신은 유튜브 콘텐츠 소재 발굴 전문 컨설턴트입니다. 분석된 채널의 주제/스타일을 기반으로, 이 채널과 유사한 콘텐츠를 만들기 위한 실질적이고 즉시 활용 가능한 소재 발굴 전략을 제시합니다.

절대 규칙:
1. 실제로 즉시 활용 가능한 구체적인 방법 위주로 작성하세요.
2. 각 플랫폼/도구에 대해 구체적인 검색어 예시를 포함하세요.
3. 이 채널의 주제 분야에 특화된 소스를 추천하세요 (일반론 X).
4. 마크다운 없이 일반 텍스트로 작성하세요.
5. 소제목은 【】로 감싸서 표시하세요 (예: 【소재 발굴 플랫폼】).
6. 한국어로 작성하세요.` },
          { role: 'user', content: `[분석 완료된 채널 정보]
채널명: ${channelGuideline.channelName}
주요 주제: ${topicsStr || '(미분류)'}
핵심 키워드: ${keywordsStr || '(미추출)'}
타겟 시청자: ${channelGuideline.targetAudience || '(미분석)'}
콘텐츠 포맷: ${formatLabel}
말투/어조: ${channelGuideline.tone || '(미분석)'}

위 채널 분석 결과를 기반으로, 이 채널과 유사한 콘텐츠를 만들려는 크리에이터를 위한 "소재 발굴 가이드"를 작성해주세요.

반드시 다음 6가지 항목을 모두 포함하세요:

1. 【소재 발굴 플랫폼】
- 이 분야에 특화된 커뮤니티, 사이트, SNS, 앱 (각각 URL 또는 접근 방법 명시)
- 왜 이 플랫폼이 이 분야에 효과적인지 이유 설명
- 최소 5개 이상 추천

2. 【검색 전략】
- 이 분야에서 사용할 구체적인 검색 키워드 조합 예시 (최소 10개)
- 어디서(Google, YouTube, 네이버, 커뮤니티), 어떻게(검색 연산자, 필터 활용) 검색할지
- 경쟁 채널 모니터링 방법

3. 【트렌드 모니터링 방법】
- 이 분야의 최신 트렌드를 빠르게 포착하는 방법
- 활용할 트렌드 도구 (Google Trends, YouTube 트렌드 등)
- 트렌드를 콘텐츠로 전환하는 타이밍 팁

4. 【소재 → 대본 발전 방법】
- 발굴한 소재를 이 채널 스타일의 대본으로 바꾸는 단계별 과정
- 소재에 독창성을 부여하는 차별화 전략
- 이 채널의 도입부/구조/마무리 패턴에 맞게 소재를 재가공하는 방법

5. 【소재 선별 기준】
- 이 채널 스타일에 맞는 좋은 소재의 특징 (체크리스트 형태)
- 피해야 할 소재 유형
- 조회수가 나올 소재 vs 안 나올 소재 구별법

6. 【올인원에서 바로 활용하기】
- "키워드 랩"에서 발굴한 키워드로 경쟁력 검증하는 방법
- "주제 추천" 기능에 소재를 입력해서 AI 확장하는 방법
- 분석한 채널의 스타일 프리셋을 활용해 대본을 자동 생성하는 흐름` }
        ],
        { temperature: 0.5, maxTokens: 8000 }
      );

      const content = res.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('AI 응답이 비어있습니다.');

      const updated = { ...channelGuideline, sourceDiscoveryGuide: content.trim() };
      setChannelGuideline(updated);
      showToast('소재 발굴 가이드가 생성되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`소재 발굴 가이드 생성 실패: ${msg}`);
    } finally {
      setIsGeneratingSourceGuide(false);
    }
  }, [channelGuideline, setChannelGuideline, requireAuth]);

  // [#331] 분석 결과 필드 개별 수정
  const updateGuidelineField = useCallback(<K extends keyof ChannelGuideline>(field: K, value: ChannelGuideline[K]) => {
    if (!channelGuideline) return;
    const updated = { ...channelGuideline, [field]: value };
    setChannelGuideline(updated);
    showToast('수정사항이 반영되었습니다.');
  }, [channelGuideline, setChannelGuideline]);

  // 프리셋 저장
  const handleSavePreset = useCallback(() => {
    if (!channelGuideline) return;
    savePreset({ ...channelGuideline, contentRegion });
    showToast(`"${channelGuideline.channelName}" 프리셋이 저장되었습니다.`);
  }, [channelGuideline, contentRegion, savePreset]);

  // 스타일 프롬프트 복사
  const handleCopyPrompt = useCallback(async () => {
    if (!channelGuideline?.fullGuidelineText) return;
    try {
      await navigator.clipboard.writeText(channelGuideline.fullGuidelineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('스타일 프롬프트가 클립보드에 복사되었습니다.');
    } catch (e) {
      logger.trackSwallowedError('ChannelAnalysisRoom:handleCopyPrompt/clipboard', e);
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
      ? `[채널 스타일]\n채널명: ${channelGuideline.channelName} (참조용 — 출력에 채널명 언급 금지)\n말투: ${channelGuideline.tone}\n구조: ${channelGuideline.structure}\n주제: ${(Array.isArray(channelGuideline.topics) ? channelGuideline.topics : []).join(', ')}\n도입패턴: ${channelGuideline.hookPattern}\n마무리패턴: ${channelGuideline.closingPattern}`
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
      } catch (parseErr) {
        logger.trackSwallowedError('ChannelAnalysisRoom:handleTopicRecommend/jsonParse', parseErr);
        // 불완전한 배열 복구 시도: 마지막 완전한 }까지 잘라서 배열 닫기
        const lastBrace = jsonStr.lastIndexOf('}');
        if (lastBrace > 0) {
          const recovered = jsonStr.substring(0, lastBrace + 1) + ']';
          try {
            const recoveredStart = recovered.indexOf('[');
            parsed = JSON.parse(recoveredStart >= 0 ? recovered.substring(recoveredStart) : recovered);
          } catch (recoveryErr) {
            logger.trackSwallowedError('ChannelAnalysisRoom:handleTopicRecommend/jsonRecovery', recoveryErr);
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

  const swSetContentFormat = useScriptWriterStore(s => s.setContentFormat);

  // 주제를 대본 작성으로 보내기
  const handleSend = useCallback((topic: LegacyTopicRecommendation) => {
    swSetTopics([topic]);
    swSetSelectedTopic(topic);
    // 채널분석 포맷(롱폼/쇼츠)을 대본작성에 자동 동기화
    swSetContentFormat(contentFormat);
    setActiveTab('script-writer');
  }, [swSetTopics, swSetSelectedTopic, swSetContentFormat, contentFormat, setActiveTab]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 분석 슬롯 바 */}
      <AnalysisSlotBar
        slots={savedBenchmarks.map(b => ({ id: b.id, name: b.channelName, savedAt: b.savedAt }))}
        activeSlotId={activeSlotId}
        onNewAnalysis={() => newAnalysis()}
        onLoadSlot={loadBenchmark}
        onDeleteSlot={removeBenchmark}
        hasCurrentResults={!!channelGuideline && !activeSlotId}
      />

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
          contentRegion={contentRegion}
          onContentRegionChange={setContentRegion}
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

        {/* 진행 상태 — 프리미엄 로딩 패널 */}
        {progress && (
          <div className="mt-4">
            <AnalysisLoadingPanel
              currentStep={progress.step - 1}
              steps={[
                { label: '채널 조회', icon: '🔍' },
                { label: '영상 수집', icon: '📥' },
                { label: '대본 수집', icon: '📝' },
                { label: 'AI 분석', icon: '🧠' },
              ]}
              message={progress.message}
              elapsedSec={progressElapsed}
              estimatedTotalSec={150}
              accent="orange"
              description="채널의 콘텐츠 DNA를 5축(텍스트·시각·편집·오디오·댓글)으로 역설계합니다"
              videoProgress={videoProgressCount ?? undefined}
            />
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
                bulkDownloadProgress ? (
                  <div className="min-w-[200px] bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="shrink-0 w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                        <span className="text-xs font-semibold text-red-300">다운로드 중</span>
                      </div>
                      <span className="text-xs text-red-400 font-mono tabular-nums">{bulkDownloadProgress.current}/{bulkDownloadProgress.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkDownloadProgress.current / bulkDownloadProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsed(bulkDownloadElapsed)} 경과</span>
                      {bulkDownloadProgress.failed > 0 && <span className="text-[10px] text-yellow-400">{bulkDownloadProgress.failed}개 실패</span>}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowBulkModal(true)}
                    className="min-w-[140px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    MP4 일괄 다운로드
                  </button>
                )
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
                        onClick={(e) => { e.preventDefault(); downloadVideo(s.videoId, s.title); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                        title="MP4 다운로드"
                      >
                        {/* 다운로드 화살표 아이콘 */}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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

      {/* ═══ 영상별 조회수 비교 — 프리미엄 수평 바 차트 ═══ */}
      {channelScripts.length > 0 && !progress && inputSource === 'youtube' && (() => {
        const sorted = [...channelScripts].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        const maxV = sorted[0]?.viewCount || 1;
        const avgV = Math.round(channelScripts.reduce((s, c) => s + (c.viewCount || 0), 0) / channelScripts.length);
        const barData = sorted.map((s, i) => ({
          rank: i + 1,
          name: s.title.length > 22 ? s.title.substring(0, 22) + '…' : s.title,
          views: s.viewCount || 0,
          fullTitle: s.title,
          pct: Math.round(((s.viewCount || 0) / maxV) * 100),
        }));
        const barH = Math.max(340, barData.length * 38);
        return (
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-700/60 shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-700/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">📊</div>
                <div className="flex-1">
                  <h3 className="text-[17px] font-bold text-white tracking-tight">영상별 조회수 비교</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{channelScripts.length}개 영상 · 조회수 순 정렬</p>
                </div>
                <div className="flex gap-5">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">최고</p>
                    <p className="text-base font-extrabold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">{fmtViews(maxV)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">평균</p>
                    <p className="text-base font-extrabold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{fmtViews(avgV)}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* 차트 */}
            <div className="px-4 pt-3 pb-4">
              <ResponsiveContainer width="100%" height={barH}>
                <BarChart layout="vertical" data={barData} margin={{ top: 4, right: 30, left: 4, bottom: 4 }} barSize={22}>
                  <defs>
                    <linearGradient id="chBarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                    <linearGradient id="chBarGradTop" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <linearGradient id="chBarGradMid" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 10 }} tickFormatter={fmtViews}
                    axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={160}
                    tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }}
                    axisLine={false} tickLine={false} />
                  <ReferenceLine x={avgV} stroke="#3b82f6" strokeDasharray="6 4" strokeOpacity={0.35}
                    label={{ value: '평균', position: 'top', fill: '#60a5fa', fontSize: 10 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(59,130,246,0.06)', radius: 6 }}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', padding: '12px 16px' }}
                    labelStyle={{ color: '#93c5fd', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}
                    itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                    formatter={(value: number, _n: string, props: { payload?: { pct?: number } }) =>
                      [`${fmtViews(value)}회 (상위 ${props.payload?.pct || 0}%)`, '조회수']}
                    labelFormatter={(_l: string, p: readonly { payload?: { fullTitle?: string } }[]) => p?.[0]?.payload?.fullTitle || _l}
                  />
                  <Bar dataKey="views" radius={[0, 8, 8, 0]} animationDuration={1000} animationEasing="ease-out">
                    {barData.map((_e, i) => (
                      <Cell key={i} fill={i === 0 ? 'url(#chBarGradTop)' : i < 3 ? 'url(#chBarGradMid)' : 'url(#chBarGrad)'}
                        fillOpacity={i < 3 ? 1 : 0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* 범례 */}
              <div className="flex items-center gap-5 mt-2 px-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-amber-500 to-red-500" />
                  <span className="text-[10px] text-gray-500 font-medium">1위</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-violet-500 to-indigo-500" />
                  <span className="text-[10px] text-gray-500 font-medium">2~3위</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-blue-500 to-cyan-500" />
                  <span className="text-[10px] text-gray-500 font-medium">일반</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <div className="w-4 border-t border-dashed border-blue-500/50" />
                  <span className="text-[10px] text-gray-500 font-medium">평균선</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ 발행일별 조회수 추이 — 프리미엄 에어리어 차트 ═══ */}
      {channelScripts.length > 0 && !progress && inputSource === 'youtube' && (() => {
        const timeSorted = [...channelScripts]
          .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
        const timeData = timeSorted.map(s => ({
          date: new Date(s.publishedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
          views: s.viewCount || 0,
          title: s.title,
        }));
        const avgV = Math.round(timeSorted.reduce((s, c) => s + (c.viewCount || 0), 0) / timeSorted.length);
        const peakV = Math.max(...timeSorted.map(s => s.viewCount || 0));
        const peakDate = timeSorted.find(s => s.viewCount === peakV);
        const trend = timeSorted.length >= 3
          ? (() => {
              const half = Math.floor(timeSorted.length / 2);
              const firstHalf = timeSorted.slice(0, half).reduce((s, c) => s + (c.viewCount || 0), 0) / half;
              const secondHalf = timeSorted.slice(half).reduce((s, c) => s + (c.viewCount || 0), 0) / (timeSorted.length - half);
              return secondHalf > firstHalf * 1.1 ? 'up' : secondHalf < firstHalf * 0.9 ? 'down' : 'flat';
            })()
          : 'flat';
        const trendInfo = { up: { icon: '📈', label: '상승세', color: 'text-green-400' }, down: { icon: '📉', label: '하락세', color: 'text-red-400' }, flat: { icon: '➡️', label: '횡보', color: 'text-gray-400' } }[trend];
        return (
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-700/60 shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-700/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg shadow-lg shadow-violet-500/20">📈</div>
                <div className="flex-1">
                  <h3 className="text-[17px] font-bold text-white tracking-tight">발행일별 조회수 추이</h3>
                  <p className="text-xs text-gray-500 mt-0.5">시간순 퍼포먼스 분석</p>
                </div>
                <div className="flex gap-5">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">피크</p>
                    <p className="text-sm font-extrabold text-fuchsia-400">{fmtViews(peakV)}</p>
                    {peakDate && <p className="text-[10px] text-gray-600">{new Date(peakDate.publishedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">트렌드</p>
                    <p className={`text-sm font-extrabold ${trendInfo.color}`}>{trendInfo.icon} {trendInfo.label}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* 차트 */}
            <div className="px-4 pt-3 pb-5">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={timeData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="chAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="40%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="chStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="50%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: '#1e293b' }} tickLine={false} />
                  <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} tickFormatter={fmtViews}
                    axisLine={false} tickLine={false} />
                  <ReferenceLine y={avgV} stroke="#6366f1" strokeDasharray="6 4" strokeOpacity={0.3}
                    label={{ value: `평균 ${fmtViews(avgV)}`, position: 'right', fill: '#818cf8', fontSize: 10 }} />
                  <Tooltip
                    cursor={{ stroke: '#a78bfa', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', padding: '12px 16px' }}
                    labelStyle={{ color: '#c4b5fd', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}
                    itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                    formatter={(value: number) => [fmtViews(value) + '회', '조회수']}
                    labelFormatter={(_l: string, p: readonly { payload?: { title?: string } }[]) => p?.[0]?.payload?.title || _l}
                  />
                  <Area type="monotone" dataKey="views"
                    stroke="url(#chStrokeGrad)" strokeWidth={2.5}
                    fill="url(#chAreaGrad)"
                    dot={{ r: 4, fill: '#1e1b4b', stroke: '#a78bfa', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#a78bfa', stroke: '#1e1b4b', strokeWidth: 2, style: { filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.6))' } as React.CSSProperties }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* 스타일 분석 결과 */}
      {channelGuideline && !progress && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              스타일 분석 결과
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">클릭하여 편집 가능</span>
            </h3>
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
            <EditableDRow l="말투/어조" v={channelGuideline.tone} onSave={v => updateGuidelineField('tone', v)} />
            <EditableDRow l="영상 구조" v={channelGuideline.structure} onSave={v => updateGuidelineField('structure', v)} />
            <EditableDRow l="도입부 패턴" v={channelGuideline.hookPattern} onSave={v => updateGuidelineField('hookPattern', v)} />
            <EditableDRow l="마무리 패턴" v={channelGuideline.closingPattern} onSave={v => updateGuidelineField('closingPattern', v)} />
            <EditableDRow l="타겟 시청자" v={channelGuideline.targetAudience} onSave={v => updateGuidelineField('targetAudience', v)} />
            <EditableDRow l="평균 글자수" v={String(channelGuideline.avgLength)} onSave={v => updateGuidelineField('avgLength', parseInt(v) || 0)} />
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {channelGuideline.topics.map((t, i) => (
              <span key={`topic-${i}`} className="group/tag px-2 py-0.5 text-sm bg-blue-900/30 text-blue-400 rounded-full border border-blue-800/40 flex items-center gap-1">
                {t}
                <button
                  onClick={() => updateGuidelineField('topics', channelGuideline.topics.filter((_, idx) => idx !== i))}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-400 hover:bg-red-500/20"
                  title="삭제"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            {channelGuideline.keywords.map((k, i) => (
              <span key={`kw-${i}`} className="group/tag px-2 py-0.5 text-sm bg-purple-900/30 text-purple-400 rounded-full border border-purple-800/40 flex items-center gap-1">
                {k}
                <button
                  onClick={() => updateGuidelineField('keywords', channelGuideline.keywords.filter((_, idx) => idx !== i))}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-400 hover:bg-red-500/20"
                  title="삭제"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            <TagAdder
              onAdd={val => updateGuidelineField('topics', [...channelGuideline.topics, val])}
              placeholder="+ 주제"
              colorClass="text-blue-400 border-blue-800/40 bg-blue-900/20 hover:bg-blue-900/40"
            />
            <TagAdder
              onAdd={val => updateGuidelineField('keywords', [...channelGuideline.keywords, val])}
              placeholder="+ 키워드"
              colorClass="text-purple-400 border-purple-800/40 bg-purple-900/20 hover:bg-purple-900/40"
            />
          </div>

          <EditableTextBlock value={channelGuideline.fullGuidelineText} onSave={v => updateGuidelineField('fullGuidelineText', v)} />
        </div>
      )}

      {/* 채널 스타일 DNA */}
      {channelGuideline && !progress && (channelGuideline.visualGuide || channelGuideline.editGuide || channelGuideline.audioGuide || channelGuideline.titleFormula || channelGuideline.audienceInsight || channelGuideline.failedLayers?.length) && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">D</span>
              채널 스타일 DNA
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">클릭하여 편집 가능</span>
            </h3>
            {channelGuideline.failedLayers && channelGuideline.failedLayers.length > 0 && (
              <button
                onClick={handleRetryFailed}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
              >
                {isRetrying ? <Spin /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                {isRetrying ? '재분석 중...' : `실패 항목 재분석 (${channelGuideline.failedLayers.length}개)`}
              </button>
            )}
          </div>
          {channelGuideline.failedLayers && channelGuideline.failedLayers.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30 text-sm text-amber-300">
              {(() => {
                const layerNames: Record<string, string> = { L1: '텍스트 분석', L2: '시각 스타일', L3: '편집/오디오', L4: '댓글 분석', L5: '제목/메타데이터' };
                const names = channelGuideline.failedLayers!.map(l => layerNames[l] || l).join(', ');
                return `일부 분석이 완료되지 않았습니다: ${names} — 위의 "실패 항목 재분석" 버튼을 눌러주세요.`;
              })()}
            </div>
          )}
          <div className="space-y-4">
            {channelGuideline.visualGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-blue-400 flex items-center gap-1">
                    시각 스타일 (썸네일 + 영상 화면 분석)
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </label>
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
                <EditableTextBlock value={channelGuideline.visualGuide} onSave={v => updateGuidelineField('visualGuide', v)} />
              </div>
            )}
            {channelGuideline.editGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-amber-400 flex items-center gap-1">
                    편집 스타일 (컷 리듬 / 전환 / 카메라 / 색보정)
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </label>
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
                <EditableTextBlock value={channelGuideline.editGuide} onSave={v => updateGuidelineField('editGuide', v)} />
              </div>
            )}
            {channelGuideline.audioGuide && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-fuchsia-400 flex items-center gap-1">
                    오디오 스타일 (BGM / 효과음 / 보이스톤)
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </label>
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
                <EditableTextBlock value={channelGuideline.audioGuide} onSave={v => updateGuidelineField('audioGuide', v)} />
              </div>
            )}
            {channelGuideline.titleFormula && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-orange-400 flex items-center gap-1">
                    제목 / 메타데이터 공식
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </label>
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
                <EditableTextBlock value={channelGuideline.titleFormula} onSave={v => updateGuidelineField('titleFormula', v)} />
              </div>
            )}
            {channelGuideline.audienceInsight && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-cyan-400 flex items-center gap-1">
                    시청자 인사이트 (댓글 감성 분석)
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </label>
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
                <EditableTextBlock value={channelGuideline.audienceInsight} onSave={v => updateGuidelineField('audienceInsight', v)} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* [#232] 소재 발굴 가이드 */}
      {channelGuideline && !progress && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm">📍</span>
              소재 발굴 가이드
            </h3>
            <div className="flex items-center gap-2">
              {channelGuideline.sourceDiscoveryGuide && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(channelGuideline.sourceDiscoveryGuide!);
                      showToast('소재 발굴 가이드가 복사되었습니다.');
                    } catch (e) {
                      logger.trackSwallowedError('ChannelAnalysisRoom:copySourceGuide', e);
                      const ta = document.createElement('textarea');
                      ta.value = channelGuideline.sourceDiscoveryGuide!;
                      document.body.appendChild(ta); ta.select();
                      document.execCommand('copy'); document.body.removeChild(ta);
                      showToast('소재 발굴 가이드가 복사되었습니다.');
                    }
                  }}
                  className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-900/20"
                  title="가이드 복사"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
              )}
              <button
                onClick={handleGenerateSourceGuide}
                disabled={isGeneratingSourceGuide}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all flex items-center gap-1.5 bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingSourceGuide ? (
                  <>
                    <Spin />
                    생성 중...
                    {sourceGuideElapsed > 0 && <span className="text-xs text-gray-500 tabular-nums">{formatElapsed(sourceGuideElapsed)}</span>}
                  </>
                ) : channelGuideline.sourceDiscoveryGuide ? '가이드 재생성' : '소재 발굴 가이드 생성'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            분석된 채널의 주제/스타일을 기반으로, 어디서 어떻게 소재를 찾을 수 있는지 AI가 맞춤 전략을 제시합니다.
          </p>
          {channelGuideline.sourceDiscoveryGuide ? (
            <EditableTextBlock value={channelGuideline.sourceDiscoveryGuide} onSave={v => updateGuidelineField('sourceDiscoveryGuide', v)} maxH="max-h-[600px]" />
          ) : (
            <div className="bg-gray-900/30 rounded-lg p-8 border border-dashed border-gray-700/50 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">위 버튼을 눌러 이 채널에 맞는 소재 발굴 전략을 생성하세요.</p>
              <p className="text-xs text-gray-600 mt-1">소재 찾는 플랫폼, 검색 전략, 트렌드 모니터링, 대본 발전 방법까지 안내합니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 채널 스타일 리메이크 (#144) */}
      <ChannelRemakePanel />

      {/* 저장된 채널 프리셋 */}
      {savedPresets.length > 0 && (
        <div className={card}>
          <h3 className="text-lg font-bold text-white mb-3">저장된 채널 프리셋</h3>
          <div className="flex flex-wrap gap-2">
            {savedPresets.map((p, i) => {
              const isActive = channelGuideline?.channelName === p.channelName;
              return (
                <div key={i} className="group relative flex items-center gap-1">
                  <button
                    onClick={() => loadPreset(p.channelName)}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${isActive
                      ? 'bg-blue-600/20 text-blue-400 border-blue-600/50'
                      : 'bg-gray-900/50 text-gray-300 border-gray-700/50 hover:border-blue-600/50 hover:bg-gray-900'
                    }`}
                  >
                    {p.channelName}
                  </button>
                  <button
                    onClick={() => { loadPreset(p.channelName); swSetContentFormat('shorts'); setActiveTab('script-writer'); }}
                    className="px-2.5 py-2 text-sm font-semibold rounded-lg border border-violet-600/40 bg-violet-900/20 text-violet-400 hover:bg-violet-800/30 hover:border-violet-500/50 transition-all"
                    title={`${p.channelName} 스타일로 쇼츠 대본 바로 작성`}
                  >
                    롱투숏
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePreset(p.channelName); }}
                    className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 hover:bg-red-500/10"
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

          {/* 바이럴 점수 도넛 차트 — 프리미엄 */}
          {(() => {
            const viralDist = [
              { name: '높음', value: topics.filter(t => t.viralScore === 'high').length, fill: '#ef4444', accent: 'from-red-500 to-orange-500' },
              { name: '중간', value: topics.filter(t => t.viralScore === 'medium').length, fill: '#eab308', accent: 'from-yellow-500 to-amber-500' },
              { name: '낮음', value: topics.filter(t => t.viralScore === 'low').length, fill: '#64748b', accent: 'from-slate-500 to-gray-500' },
            ].filter(d => d.value > 0);
            const total = viralDist.reduce((s, d) => s + d.value, 0);
            return (
              <div className="flex items-center gap-8 mb-5 bg-gradient-to-br from-gray-900/80 to-gray-800/40 rounded-xl p-5 border border-gray-700/40">
                <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <defs>
                        <filter id="pieGlow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      </defs>
                      <Pie data={viralDist} innerRadius={55} outerRadius={78} dataKey="value"
                        paddingAngle={3} cornerRadius={4} stroke="none"
                        label={false} animationDuration={800}>
                        {viralDist.map((entry, i) => <Cell key={i} fill={entry.fill} style={{ filter: 'url(#pieGlow)' }} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} itemStyle={{ color: '#e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-extrabold text-white">{total}</span>
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">주제</span>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  <p className="text-sm font-bold text-white mb-3">바이럴 점수 분포</p>
                  {viralDist.map(d => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 bg-gradient-to-br ${d.accent}`} style={{ boxShadow: `0 0 8px ${d.fill}40` }} />
                      <span className="text-sm text-gray-400 w-10">{d.name}</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.fill }} />
                      </div>
                      <span className="text-sm font-bold text-gray-200 w-12 text-right">{d.value}개</span>
                      <span className="text-xs text-gray-500 w-10 text-right">{Math.round((d.value / total) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 본능 기제 빈도 차트 — 프리미엄 */}
          {topics.some(t => t.instinctAnalysis?.primaryInstincts?.length) && (() => {
            const instinctFreq = new Map<string, number>();
            topics.forEach(t => t.instinctAnalysis?.primaryInstincts?.forEach(inst => instinctFreq.set(inst, (instinctFreq.get(inst) || 0) + 1)));
            const instinctData = [...instinctFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
            if (instinctData.length === 0) return null;
            const maxCount = instinctData[0]?.count || 1;
            return (
              <div className="mb-5 bg-gradient-to-br from-gray-900/80 to-gray-800/40 rounded-xl p-5 border border-gray-700/40">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center text-xs shadow-lg shadow-purple-500/20">🧠</div>
                  <p className="text-sm font-bold text-white">가장 많이 활용된 심리 기제</p>
                  <span className="text-xs text-gray-600 ml-auto">상위 {instinctData.length}개</span>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, instinctData.length * 38)}>
                  <BarChart layout="vertical" data={instinctData} margin={{ top: 4, right: 30, left: 4, bottom: 4 }} barSize={20}>
                    <defs>
                      <linearGradient id="instGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#ec4899" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(168,85,247,0.06)', radius: 6 }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                      labelStyle={{ color: '#c084fc', fontWeight: 700 }}
                      itemStyle={{ color: '#e2e8f0' }}
                      formatter={(value: number) => [value + '회', '활용 빈도']}
                    />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]} animationDuration={800}>
                      {instinctData.map((_e, i) => (
                        <Cell key={i} fill="url(#instGrad)" fillOpacity={1 - (i / instinctData.length) * 0.5} />
                      ))}
                    </Bar>
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

      {/* 영상 일괄 다운로드 모달 */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { if (!bulkDownloadProgress) setShowBulkModal(false); }}>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">영상 일괄 다운로드</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {channelScripts.filter(s => s.videoId).length}개 영상 (MP4, 최대 1080p)
                </p>
              </div>
              {!bulkDownloadProgress && (
                <button onClick={() => setShowBulkModal(false)} className="text-gray-500 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* 진행 상태 바 */}
            {bulkDownloadProgress && (
              <div className="mb-4 bg-red-900/15 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-red-300 font-semibold">다운로드 중...</span>
                      <span className="text-sm text-red-400 font-mono font-bold tabular-nums">{bulkDownloadProgress.current}/{bulkDownloadProgress.total}</span>
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(bulkDownloadProgress.current / bulkDownloadProgress.total) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-gray-500 tabular-nums">{formatElapsed(bulkDownloadElapsed)} 경과</span>
                  <div className="flex items-center gap-2">
                    {bulkDownloadProgress.current > 0 && bulkDownloadElapsed > 0 && (
                      <span className="text-xs text-gray-500">
                        남은 시간 약 <span className="text-red-400 font-medium">
                          {formatElapsed(Math.max(0, Math.round((bulkDownloadElapsed / bulkDownloadProgress.current) * (bulkDownloadProgress.total - bulkDownloadProgress.current))))}
                        </span>
                      </span>
                    )}
                    {bulkDownloadProgress.failed > 0 && (
                      <span className="text-xs text-yellow-400">{bulkDownloadProgress.failed}개 실패</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 영상 목록 */}
            <div className="bg-gray-900/70 rounded-lg p-3 border border-gray-700/50 max-h-60 overflow-y-auto custom-scrollbar mb-4">
              {channelScripts.filter(s => s.videoId).map((s, i) => (
                <div key={s.videoId} className="flex items-center gap-2 py-2 border-b border-gray-800/50 last:border-0">
                  <span className="text-xs text-gray-600 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-gray-300 truncate flex-1 min-w-0">{s.title}</span>
                  <button
                    onClick={() => downloadVideo(s.videoId, s.title)}
                    disabled={!!bulkDownloadProgress}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-30"
                    title="MP4 다운로드"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* 버튼 그룹 */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowBulkModal(false); handleBulkVideoDownload(); setShowBulkModal(true); }}
                disabled={!!bulkDownloadProgress}
                className="flex-1 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                전체 자동 다운로드
              </button>
              <button
                onClick={async () => {
                  const urls = channelScripts
                    .filter(s => s.videoId)
                    .map(s => `https://www.youtube.com/watch?v=${s.videoId}`)
                    .join('\n');
                  try { await navigator.clipboard.writeText(urls); }
                  catch (e) {
                    logger.trackSwallowedError('ChannelAnalysisRoom:copyUrls', e);
                    const ta = document.createElement('textarea');
                    ta.value = urls; document.body.appendChild(ta); ta.select();
                    document.execCommand('copy'); document.body.removeChild(ta);
                  }
                  showToast(`${channelScripts.filter(s => s.videoId).length}개 URL 복사됨`);
                }}
                className="px-5 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-xl border border-gray-600 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                URL 복사
              </button>
            </div>
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
