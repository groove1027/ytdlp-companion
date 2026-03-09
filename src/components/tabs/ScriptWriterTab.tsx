import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import { useScriptWriterStore } from '../../stores/scriptWriterStore';
import { useNavigationStore } from '../../stores/navigationStore';
import { useChannelAnalysisStore } from '../../stores/channelAnalysisStore';
import { useInstinctStore } from '../../stores/instinctStore';
import { useProjectStore } from '../../stores/projectStore';
import { evolinkChat, evolinkChatStream, getEvolinkKey } from '../../services/evolinkService';
import { recommendTopics } from '../../services/topicRecommendService';
import { buildSelectedInstinctPrompt } from '../../data/instinctPromptUtils';
import { SCRIPT_STYLE_PRESETS } from '../../data/scriptStylePresets';
import { VideoFormat, TopicRecommendation } from '../../types';
import { showToast } from '../../stores/uiStore';
import { countScenesLocally, splitScenesLocally, extractJsonFromText } from '../../services/gemini/scriptAnalysis';
import { canCreateNewProject } from '../../services/storageService';
import { parseFileToText, SUPPORTED_EXTENSIONS, SUPPORTED_FORMATS_LABEL } from '../../services/fileParserService';
import BenchmarkPanel from './script/BenchmarkPanel';
import TopicRecommendCards from './script/TopicRecommendCards';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../hooks/useAuthGuard';

const InstinctBrowser = React.lazy(() => import('./script/InstinctBrowser'));
const ScriptExpander = React.lazy(() => import('./script/ScriptExpander'));
const ScriptReadabilityDashboard = React.lazy(() => import('./script/ScriptReadabilityDashboard'));
const EngagementHeatmap = React.lazy(() => import('./script/EngagementHeatmap'));
const ScenePacingChart = React.lazy(() => import('./script/ScenePacingChart'));
const TopicComparisonRadar = React.lazy(() => import('./script/TopicComparisonRadar'));
const GenerationTimeline = React.lazy(() => import('./script/GenerationTimeline'));
const StyleDiffView = React.lazy(() => import('./script/StyleDiffView'));
const BenchmarkRadarChart = React.lazy(() => import('./script/BenchmarkRadarChart'));

type OpenTool = 'instinct' | 'benchmark' | null;

/** 한국어 나레이션 기준 약 650자/분 (5,000자 ≈ 7~8분) */
function estimateTime(chars: number): string {
  const totalSec = Math.round((chars / 650) * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `약 ${s}초`;
  if (s === 0) return `약 ${m}분`;
  return `약 ${m}분 ${s}초`;
}

const FORMAT_BUTTONS: { id: VideoFormat; label: string; color: string }[] = [
  { id: VideoFormat.LONG, label: '롱폼', color: 'bg-blue-600' },
  { id: VideoFormat.SHORT, label: '숏폼', color: 'bg-emerald-600' },
  { id: VideoFormat.NANO, label: '나노', color: 'bg-pink-600' },
  { id: VideoFormat.MANUAL, label: '수동', color: 'bg-gray-600' },
];

const FORMAT_DESC: Record<VideoFormat, string> = {
  [VideoFormat.LONG]: '롱폼 — 하위 옵션(호흡/디테일)에 따라 분할 방식이 달라집니다',
  [VideoFormat.SHORT]: '쇼츠/릴스 — 1문장 = 1장면, 빠른 컷 전환',
  [VideoFormat.NANO]: '틱톡/도파민 — 쉼표 단위 초고속 분할',
  [VideoFormat.MANUAL]: '사용자가 직접 입력한 줄바꿈을 기준으로 분할합니다',
};

const LONG_SPLIT: Record<'DEFAULT' | 'DETAILED', { label: string; desc: string }> = {
  DEFAULT: { label: '호흡 중심', desc: '2~3문장 → 1장면 (적은 컷, 강의/설명)' },
  DETAILED: { label: '디테일 중심', desc: '1문장 → 1장면 (많은 컷, 다큐/사연)' },
};

const Spinner: React.FC = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-6 h-6 border-2 border-gray-600 border-t-violet-400 rounded-full animate-spin" />
  </div>
);

export default function ScriptWriterTab() {
  const {
    generatedScript, setGeneratedScript,
    finalScript, setFinalScript,
    styledScript, styledStyleName, setStyledScript, clearStyledScript,
    isGenerating, startGeneration, finishGeneration,
    selectedTopic, setSelectedTopic, benchmarkScript,
    contentFormat,
    videoFormat, setVideoFormat,
    longFormSplitType, setLongFormSplitType, smartSplit,
    targetCharCount, setTargetCharCount,
    splitResult, setSplitResult,
    manualText, setManualText,
    title, setTitle,
    synopsis, setSynopsis,
  } = useScriptWriterStore();

  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const channelGuideline = useChannelAnalysisStore((s) => s.channelGuideline);

  const [openTool, setOpenTool] = useState<OpenTool>(null);
  const [showExpander, setShowExpander] = useState(false);
  const [genError, setGenError] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [applyingStyle, setApplyingStyle] = useState<string | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [styleError, setStyleError] = useState('');
  const [showChannelGuide, setShowChannelGuide] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(true);
  const [showManualInput, setShowManualInput] = useState(false);

  // 채널분석 데이터 도착 시 채널 가이드 자동 펼침
  const channelGuideAutoRef = React.useRef(false);
  useEffect(() => {
    if (channelGuideline && selectedTopic && !channelGuideAutoRef.current) {
      setShowChannelGuide(true);
      channelGuideAutoRef.current = true;
    }
  }, [channelGuideline, selectedTopic]);

  // 소재 추천 결과 도착 시 소재 추천 섹션 자동 펼침
  const instinctIds = useInstinctStore(s => s.selectedMechanismIds);
  const isRecommending = useInstinctStore(s => s.isRecommending);
  const recommendedTopics = useInstinctStore(s => s.recommendedTopics);
  const selectedTopicId = useInstinctStore(s => s.selectedTopicId);

  useEffect(() => {
    if (recommendedTopics.length > 0) setShowAiHelper(true);
  }, [recommendedTopics.length]);

  const { requireAuth } = useAuthGuard();

  const elapsedRecommend = useElapsedTimer(isRecommending);
  const elapsedGenerate = useElapsedTimer(isGenerating);
  const elapsedStyle = useElapsedTimer(!!applyingStyle);

  useEffect(() => {
    if (selectedTopic) {
      setTitle(selectedTopic.title);
      setSynopsis(`${selectedTopic.mainSubject}\n\n대본 흐름: ${selectedTopic.scriptFlow}`);
    }
  }, [selectedTopic]);

  const scriptText = finalScript || generatedScript?.content || manualText || '';
  const displayScript = scriptText;

  const handleGoToSoundStudio = useCallback(() => {
    const latest = finalScript || styledScript || generatedScript?.content || manualText || '';
    if (!latest.trim()) return;
    setFinalScript(latest);
    useProjectStore.getState().setConfig((prev) =>
      prev ? { ...prev, script: latest } : prev
    );
    useProjectStore.getState().smartUpdateTitle('script-writer', latest.split('\n')[0] || '');
    setActiveTab('sound-studio');
  }, [generatedScript, manualText, finalScript, styledScript, setFinalScript, setActiveTab]);

  // ── 장면 분할 ──
  const [showSplitGuide, setShowSplitGuide] = useState(true);

  const estimatedScenes = useMemo(() => {
    if (!scriptText.trim()) return 0;
    return countScenesLocally(scriptText, videoFormat, smartSplit,
      videoFormat === VideoFormat.LONG ? longFormSplitType : undefined);
  }, [scriptText, videoFormat, smartSplit, longFormSplitType]);

  const livePreviewData = useMemo(() => {
    if (!scriptText.trim()) return { original: '', scenes: [] as string[] };
    const parts = scriptText.split(/\n{2,}/);
    const best = parts.reduce((a, b) => a.length >= b.length ? a : b, '');
    const scenes = splitScenesLocally(best, videoFormat, smartSplit,
      videoFormat === VideoFormat.LONG ? longFormSplitType : undefined);
    return { original: best.substring(0, 120) + (best.length > 120 ? '...' : ''), scenes };
  }, [scriptText, videoFormat, smartSplit, longFormSplitType]);

  const [isAnalyzingScenes, setIsAnalyzingScenes] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const elapsedAnalysis = useElapsedTimer(isAnalyzingScenes);

  const handleSceneAnalysis = useCallback(async () => {
    if (!scriptText.trim() || isAnalyzingScenes) return;
    if (!getEvolinkKey()) {
      setGenError('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }

    const projStore = useProjectStore.getState();
    if (!projStore.currentProjectId) {
      const ok = await canCreateNewProject();
      if (!ok) {
        setGenError('저장 공간이 부족합니다. 기존 프로젝트를 삭제해주세요.');
        return;
      }
      const newId = `proj_${Date.now()}`;
      projStore.setCurrentProjectId(newId);
      if (!projStore.config) {
        projStore.setConfig({
          mode: 'SCRIPT',
          script: scriptText.substring(0, 500),
          videoFormat,
          aspectRatio: 'LANDSCAPE' as never,
          imageModel: 'NANO_COST' as never,
          smartSplit: true,
        } as never);
      }
      projStore.setProjectTitle(scriptText.trim().substring(0, 30) || '새 프로젝트');
      showToast('새 프로젝트가 자동 생성되었습니다');
    }

    setIsAnalyzingScenes(true);
    setAnalysisProgress(0);
    setGenError('');

    let simProgress = 0;
    const len = scriptText.length;
    const simInterval = setInterval(() => {
      const p1 = len > 8000 ? 0.8 : len > 5000 ? 1.2 : len > 3000 ? 2 : 3;
      const p2 = len > 8000 ? 0.3 : len > 5000 ? 0.5 : len > 3000 ? 1 : 1.5;
      const p3 = len > 8000 ? 0.1 : len > 5000 ? 0.2 : len > 3000 ? 0.3 : 0.5;
      simProgress += simProgress < 40 ? p1 : simProgress < 70 ? p2 : p3;
      simProgress = Math.min(simProgress, 88);
      setAnalysisProgress((prev) => Math.max(prev, Math.round(simProgress)));
    }, 200);

    try {
      const formatLabel = videoFormat === VideoFormat.LONG
        ? (longFormSplitType === 'DETAILED' ? '롱폼 디테일 중심' : '롱폼 호흡 중심')
        : videoFormat === VideoFormat.SHORT ? '숏폼' : '나노';

      const prompt = `다음 대본을 "${formatLabel}" 형식으로 장면 분할해주세요.
각 장면은 하나의 비주얼 컷에 해당합니다.
결과를 JSON 배열로 반환: ["장면1 텍스트", "장면2 텍스트", ...]

대본:
${scriptText}`;

      const response = await evolinkChat([{ role: 'user', content: prompt }]);
      clearInterval(simInterval);
      setAnalysisProgress(95);

      const responseText = response.choices?.[0]?.message?.content || '';
      const parsed = extractJsonFromText(responseText);
      const scenes = Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string' && (s as string).trim()) as string[] : [];

      if (scenes.length === 0) {
        const fallback = splitScenesLocally(scriptText, videoFormat, smartSplit,
          videoFormat === VideoFormat.LONG ? longFormSplitType : undefined);
        setSplitResult(fallback);
        showToast(`로컬 분할 완료: ${fallback.length}개 장면`);
      } else {
        setSplitResult(scenes);
        showToast(`AI 장면 분석 완료: ${scenes.length}개 장면`);
      }

      projStore.setConfig((prev) => prev ? { ...prev, videoFormat } : prev);
      setAnalysisProgress(100);
      setActiveTab('image-video');
    } catch (err) {
      clearInterval(simInterval);
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(`장면 분석 실패: ${msg}`);
    } finally {
      setIsAnalyzingScenes(false);
    }
  }, [scriptText, videoFormat, longFormSplitType, smartSplit, isAnalyzingScenes, setSplitResult, setActiveTab]);

  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setFileError('');
    try {
      const text = await parseFileToText(file);
      if (!text.trim()) throw new Error('파일에서 텍스트를 추출할 수 없습니다.');
      setManualText(text);
      setFinalScript(text);
      setGeneratedScript(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFileError(`파일 불러오기 실패: ${msg}`);
    } finally {
      setFileLoading(false);
      e.target.value = '';
    }
  }, [setFinalScript, setGeneratedScript]);

  // -- 소재 추천 (본능 기제 → AI 소재 5개)
  const handleRecommendTopics = useCallback(async () => {
    if (!requireAuth('AI 주제 추천')) return;
    const store = useInstinctStore.getState();
    store.setIsRecommending(true);
    store.clearTopics();
    try {
      const topics = await recommendTopics({
        mechanismIds: instinctIds,
        onProgress: (step, percent) => store.setRecommendProgress({ step, percent }),
        channelGuideline: channelGuideline?.tone,
      });
      store.setRecommendedTopics(topics);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '소재 추천 실패');
    } finally {
      store.setIsRecommending(false);
    }
  }, [instinctIds, channelGuideline]);

  // 선택된 소재 조회 (store에서)
  const selectedTopicFromStore = useMemo(() => {
    if (!selectedTopicId) return null;
    return recommendedTopics.find(t => t.id === selectedTopicId) || null;
  }, [selectedTopicId, recommendedTopics]);

  // -- 소재 선택 시 제목/줄거리 자동 채우기
  const handleSelectTopic = useCallback((topic: TopicRecommendation) => {
    useInstinctStore.getState().selectTopic(topic.id);
    setTitle(topic.title);
    setSynopsis(topic.synopsis);
  }, []);

  // -- 선택된 소재로 스트리밍 대본 생성
  const handleGenerateFromTopic = useCallback(async (topic: TopicRecommendation) => {
    if (!requireAuth('AI 대본 생성')) return;
    if (!getEvolinkKey()) {
      setGenError('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    startGeneration();
    setStreamingText('');
    setGenError('');

    const instinctPrompt = buildSelectedInstinctPrompt(instinctIds);

    const systemPrompt = `당신은 유튜브 바이럴 영상 전문 대본 작가입니다.
주어진 소재와 본능 기제를 바탕으로 완성된 대본을 작성합니다.
훅(도입부)에서 선택된 본능 기제가 시청자 심리를 강하게 자극하도록 설계하세요.`;

    const userPrompt = `[소재]
제목: ${topic.title}
훅: ${topic.hook}
줄거리: ${topic.synopsis}

[적용할 본능 기제]
${instinctPrompt}

[요구사항]
- 위 소재와 본능 기제를 결합한 완성 대본을 작성하세요
- 대본 길이: 약 ${targetCharCount}자
- 훅(첫 3초)은 반드시 "${topic.hook}"을 기반으로 작성
- 대본 형식: 나레이션 대본 (화자 지시 없이 내레이션만)

대본만 출력하세요. 제목이나 부가 설명 없이 본문만.`;

    try {
      const fullText = await evolinkChatStream(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        (chunk, accumulated) => {
          setStreamingText(accumulated);
        },
        { temperature: 0.7, maxTokens: Math.min(32000, Math.max(8000, targetCharCount * 2)) }
      );

      setGeneratedScript({
        title: topic.title,
        content: fullText,
        charCount: fullText.length,
        estimatedDuration: `약 ${Math.round(fullText.length / 350)}분`,
        structure: [],
      });
      setFinalScript(fullText);
      setStreamingText('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '대본 생성 실패');
      setStreamingText('');
    } finally {
      finishGeneration();
    }
  }, [instinctIds, targetCharCount, startGeneration, finishGeneration, setGeneratedScript, setFinalScript]);

  const handleGenerateScript = useCallback(async () => {
    if (!requireAuth('AI 대본 생성')) return;
    if (!title.trim() || !synopsis.trim()) return;
    if (!getEvolinkKey()) {
      setGenError('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    startGeneration();
    setGenError('');

    const formatLabel = `${targetCharCount.toLocaleString()}자 분량 (${estimateTime(targetCharCount)})`;
    const isShorts = contentFormat === 'shorts';

    const shortsRule = isShorts
      ? `\n\n중요 — 이 대본은 유튜브 쇼츠(60초 이내 세로 영상)용입니다:
- 첫 문장에서 즉시 주제를 던지세요 (서론/도입부 없이 바로 핵심)
- 짧고 강렬한 문장 위주 (한 문장 20자 이내)
- "본 영상에서 다루겠습니다" 같은 롱폼 유도 표현 절대 금지
- 대본 자체가 완결된 콘텐츠여야 합니다 (다른 영상 참조 X)
- 마지막은 반전/충격/핵심 결론으로 임팩트 있게 마무리`
      : '';

    const systemPrompt = `당신은 전문 영상 대본 작가입니다. 사용자의 요청에 따라 완성도 높은 ${isShorts ? '유튜브 쇼츠' : '영상'} 대본을 생성합니다.

핵심 원칙:
1. 대본에 포함되는 정보, 사례, 통계, 사건은 반드시 실제로 존재하는 것이어야 합니다.
2. 허구의 연구, 가짜 통계, 존재하지 않는 사건을 지어내지 마세요.
3. 확실하지 않은 정보는 "~로 알려져 있다", "~라는 주장이 있다"로 표현하세요.
4. 구체적 수치나 출처를 언급할 때는 실제 데이터만 사용하세요.${shortsRule}

반드시 JSON 형식으로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력합니다.`;

    const instinctSection = instinctIds.length > 0
      ? `\n\n[적용할 본능 기제]\n${buildSelectedInstinctPrompt(instinctIds)}\n\n위 본능 기제를 활용하여 도입부(훅)에서 시청자 심리를 강하게 자극하세요.`
      : '';

    const guidelineSection = channelGuideline
      ? `\n\n[채널 스타일 가이드]\n채널명: ${channelGuideline.channelName}\n말투: ${channelGuideline.tone}\n구조: ${channelGuideline.structure}\n도입패턴: ${channelGuideline.hookPattern}\n마무리패턴: ${channelGuideline.closingPattern}\n→ 위 채널 스타일에 맞춰 대본을 작성하세요.`
      : '';

    const benchmarkSection = benchmarkScript
      ? `\n\n[참고 벤치마크 대본 (앞 800자)]\n${benchmarkScript.slice(0, 800)}\n→ 위 대본의 말투와 흐름을 참고하되 내용은 새롭게 작성하세요.`
      : '';

    const topicInstinctSection = selectedTopic?.instinctAnalysis
      ? `\n\n[주제 본능 분석]\n핵심 본능: ${selectedTopic.instinctAnalysis.primaryInstincts.join(', ')}\n조합 공식: ${selectedTopic.instinctAnalysis.comboFormula}\n추천 훅: "${selectedTopic.instinctAnalysis.hookSuggestion}"\n→ 위 심리 기제를 도입부(훅)에 적극 반영하세요.`
      : '';

    const userPrompt = `다음 조건에 맞는 ${isShorts ? '유튜브 쇼츠(세로 60초)' : '영상'} 대본을 생성하세요:

- 제목: ${title}
- 줄거리: ${synopsis}
- 포맷: ${isShorts ? '쇼츠 (60초 이내, 세로형)' : '롱폼'}
- 분량: ${formatLabel}${instinctSection}${guidelineSection}${benchmarkSection}${topicInstinctSection}

다음 JSON 형식으로 출력하세요:
{
  "title": "제목",
  "content": "완성된 대본 전문 (줄바꿈 포함)",
  "estimatedDuration": "예상 분량 (예: 약 8분)",
  "structure": ["도입부", "전개", "클라이맥스", "결말"]
}`;

    try {
      const res = await evolinkChat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { temperature: 0.7, maxTokens: Math.min(32000, Math.max(8000, Math.ceil(targetCharCount * 2))) }
      );
      const raw = res.choices?.[0]?.message?.content || '';
      if (!raw.trim()) throw new Error('AI 응답이 비어있습니다. 다시 시도해주세요.');
      const jsonStr = extractJsonFromText(raw);
      let parsed: { title?: string; content?: string; estimatedDuration?: string; structure?: string[] };
      try { parsed = JSON.parse(jsonStr || '{}'); } catch { throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.'); }
      const content = parsed.content || '';
      if (!content.trim()) throw new Error('생성된 대본이 비어있습니다. 다시 시도해주세요.');
      setGeneratedScript({
        title: parsed.title || title,
        content,
        charCount: content.length,
        estimatedDuration: parsed.estimatedDuration || '약 5분',
        structure: Array.isArray(parsed.structure) ? parsed.structure : ['도입부', '전개', '클라이맥스', '결말'],
      });
      setFinalScript(content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenError(`대본 생성 실패: ${msg}`);
    } finally {
      finishGeneration();
    }
  }, [title, synopsis, targetCharCount, instinctIds, channelGuideline, benchmarkScript,
    selectedTopic, startGeneration, finishGeneration, setGeneratedScript, setFinalScript]);

  const handleApplySelectedStyle = useCallback(async () => {
    if (!requireAuth('AI 스타일 적용')) return;
    if (!selectedStyleId) return;
    const preset = SCRIPT_STYLE_PRESETS.find(p => p.id === selectedStyleId);
    if (!preset) return;
    const currentScript = generatedScript?.content || manualText || '';
    if (!currentScript.trim()) return;
    setApplyingStyle(preset.id);
    setStyleError('');
    try {
      const res = await evolinkChat(
        [
          {
            role: 'system',
            content: `${preset.systemPrompt}\n\n[중요 지시] 사용자가 제공한 대본을 위 스타일 지침서에 맞게 재작성하십시오. 대본의 핵심 내용과 주제는 유지하되, 문체/어미/톤/구조를 지침서에 맞게 완전히 변환하십시오. 순수 대본 텍스트만 출력하십시오.`
          },
          {
            role: 'user',
            content: `다음 대본을 '${preset.name}' 스타일로 재작성하세요:\n\n${currentScript}`
          }
        ],
        { temperature: 0.7, maxTokens: Math.min(32000, Math.max(8000, Math.ceil(currentScript.length * 2))) }
      );
      const content = res.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('스타일 변환 결과가 비어있습니다. 다시 시도해주세요.');
      setStyledScript(content, preset.name);
      setFinalScript(content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStyleError(`스타일 적용 실패: ${msg}`);
    } finally {
      setApplyingStyle(null);
    }
  }, [selectedStyleId, generatedScript, manualText, title, setStyledScript, setFinalScript]);

  const toggleTool = (tool: OpenTool) => setOpenTool(prev => prev === tool ? null : tool);
  const hasAnyTool = instinctIds.length > 0 || !!benchmarkScript || !!channelGuideline;

  // 생성 버튼 동적 안내
  const canGenerate = selectedTopicFromStore ? !isGenerating : (!!title.trim() && !!synopsis.trim() && !isGenerating);
  const guidanceText = useMemo(() => {
    if (selectedTopicFromStore) return '';
    if (!title.trim() && !synopsis.trim()) return '제목과 줄거리를 입력하면 AI가 대본을 생성합니다';
    if (!title.trim()) return '제목을 입력하세요';
    if (!synopsis.trim()) return '줄거리를 입력하세요';
    return '';
  }, [title, synopsis, selectedTopicFromStore]);

  // ═══════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">

      {/* ─── Header (심플) ─── */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-700/50">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-violet-500 to-violet-700 rounded-lg flex items-center justify-center text-sm">✍️</span>
          대본 작성
        </h2>
      </div>

      {/* ─── Scrollable content ─── */}
      <div className="flex-1 overflow-auto">

        {/* ═══ A. 주제 입력 ═══ */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-700/30">

          {/* 채널분석 소재 배너 */}
          {selectedTopic && !scriptText && (
            <div className="mb-4 bg-gradient-to-r from-blue-900/25 to-violet-900/25 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-base">📡</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-blue-300">채널분석에서 소재를 가져왔습니다</p>
                  <p className="text-sm text-gray-300 mt-0.5">
                    {channelGuideline && <><span className="text-orange-400 font-semibold">{channelGuideline.channelName}</span> 채널 스타일 + </>}
                    <span className="text-violet-400 font-semibold">{selectedTopic.title}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">제목과 줄거리가 자동 입력됨 — 아래에서 수정 후 생성하세요</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedTopic(null); setTitle(''); setSynopsis(''); }}
                  className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                  title="초기화"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* 선택된 소재 표시 (본능 기제 추천) */}
          {selectedTopicFromStore && (
            <div className="mb-3 bg-violet-900/15 border border-violet-500/25 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-violet-400 text-xs font-bold">선택된 소재</span>
              <span className="text-sm text-gray-300 truncate">{selectedTopicFromStore.title}</span>
              <button
                type="button"
                onClick={() => { useInstinctStore.getState().selectTopic(''); setTitle(''); setSynopsis(''); }}
                className="ml-auto text-gray-600 hover:text-gray-400 text-xs"
              >초기화</button>
            </div>
          )}

          {/* ═══ AI 소재 추천 (최상단, 기본 열림) ═══ */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowAiHelper(!showAiHelper)}
              className={`flex items-center gap-2 w-full px-4 py-3 rounded-xl border text-sm font-bold transition-all ${
                showAiHelper
                  ? 'bg-gradient-to-r from-violet-600/15 to-blue-600/15 border-violet-500/40 text-violet-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-violet-500/40 hover:text-violet-300'
              }`}
            >
              <span className="text-base">💡</span>
              <span>AI 소재 추천</span>
              <span className="text-xs text-gray-500 font-normal ml-1">— 버튼 하나로 바이럴 소재 5개 받기</span>
              {instinctIds.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-violet-900/50 text-violet-300 rounded-full">🧠 {instinctIds.length}개</span>
              )}
              {(benchmarkScript || channelGuideline) && (
                <span className="text-xs px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded-full">📊</span>
              )}
              <span className="ml-auto text-gray-600 text-xs">{showAiHelper ? '▲' : '▼'}</span>
            </button>

            {showAiHelper && (
              <div className="mt-3 space-y-3 bg-gray-800/20 rounded-xl border border-gray-700/30 p-4">
                {/* 즉시 소재 추천 CTA — 본능 기제 없어도 바로 추천 가능 */}
                <button
                  type="button"
                  onClick={handleRecommendTopics}
                  disabled={isRecommending || isGenerating}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
                >
                  {isRecommending ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 소재 추천 중... {elapsedRecommend > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedRecommend)}</span>}</>
                  ) : instinctIds.length > 0 ? (
                    <>🔍 본능 기제 {instinctIds.length}개로 바이럴 소재 추천받기</>
                  ) : (
                    <>🔍 지금 뜨는 바이럴 소재 5개 추천받기</>
                  )}
                </button>

                {/* 소재 카드 + 레이더 */}
                <TopicRecommendCards onSelect={handleSelectTopic} />
                {recommendedTopics.length >= 2 && (
                  <Suspense fallback={null}>
                    <TopicComparisonRadar topics={recommendedTopics} selectedTopicId={selectedTopicId} />
                  </Suspense>
                )}

                {/* 고급 옵션: 본능 기제 / 벤치마크 (접힘형) */}
                <div className="border-t border-gray-700/40 pt-3">
                  <p className="text-xs text-gray-500 mb-2">고급 옵션 — 더 정교한 소재 추천을 원하면 설정하세요</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleTool('instinct')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                        openTool === 'instinct' ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                          : instinctIds.length > 0 ? 'bg-violet-900/10 border-violet-700/40 text-violet-400 hover:border-violet-500/50'
                          : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <span>🧠</span><span>본능 기제</span>
                      {instinctIds.length > 0 && <span className="text-xs px-1.5 py-0.5 bg-violet-900/50 text-violet-300 rounded-full">{instinctIds.length}개</span>}
                      <span className="text-gray-600 text-xs">{openTool === 'instinct' ? '▲' : '▼'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTool('benchmark')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                        openTool === 'benchmark' ? 'bg-green-600/20 border-green-500/50 text-green-300'
                          : (benchmarkScript || channelGuideline) ? 'bg-green-900/10 border-green-700/40 text-green-400 hover:border-green-500/50'
                          : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <span>📊</span><span>벤치마크</span>
                      {benchmarkScript && <span className="text-xs px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded-full">참고 대본</span>}
                      {channelGuideline && <span className="text-xs px-1.5 py-0.5 bg-orange-900/50 text-orange-300 rounded-full">{channelGuideline.channelName}</span>}
                      <span className="text-gray-600 text-xs">{openTool === 'benchmark' ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {openTool === 'instinct' && (
                    <div className="mt-3 rounded-xl border border-violet-700/30 bg-gray-800/20 p-4">
                      <Suspense fallback={<Spinner />}><InstinctBrowser /></Suspense>
                    </div>
                  )}
                  {openTool === 'benchmark' && (
                    <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-green-700/30 bg-gray-800/20">
                      <BenchmarkPanel />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══ 직접 입력하기 (접힘형) ═══ */}
          <div>
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                showManualInput || (title.trim() || synopsis.trim())
                  ? 'bg-gray-700/30 border-gray-600 text-gray-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              <span>✏️</span>
              <span>직접 입력하기</span>
              {(title.trim() || synopsis.trim()) && (
                <span className="text-xs px-1.5 py-0.5 bg-violet-900/50 text-violet-300 rounded-full">입력됨</span>
              )}
              <span className="ml-auto text-gray-600 text-xs">{showManualInput ? '▲' : '▼'}</span>
            </button>
            {(showManualInput || title.trim() || synopsis.trim()) && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-gray-300 mb-1.5">
                    📌 제목
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="영상 제목을 입력하세요"
                    className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500
                      focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-bold text-gray-300 mb-1.5">
                    📋 줄거리 · 핵심 내용
                  </label>
                  <textarea
                    value={synopsis}
                    onChange={e => setSynopsis(e.target.value)}
                    placeholder="어떤 내용의 영상인지 간단히 설명해주세요"
                    rows={3}
                    className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500
                      focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ B. 생성 옵션 + CTA ═══ */}
        <div className="px-6 py-4 border-b border-gray-700/30">

          {/* 채널 스타일 */}
          {channelGuideline && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowChannelGuide(prev => !prev)}
                className="flex items-center gap-2 px-3 py-2 bg-orange-900/15 border border-orange-500/30 rounded-lg text-sm transition-all hover:bg-orange-900/25 w-full text-left"
              >
                <span className="text-orange-400 font-bold">📡 채널 스타일 적용됨</span>
                <span className="text-orange-300/70 font-medium truncate">{channelGuideline.channelName}</span>
                <span className="ml-auto text-gray-500 text-xs flex-shrink-0">{showChannelGuide ? '접기 ▲' : '펼치기 ▼'}</span>
              </button>
              {showChannelGuide && (
                <div className="mt-2 bg-gray-800/60 border border-orange-500/20 rounded-lg px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">말투</span>
                    <span className="text-gray-300">{channelGuideline.tone}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">구조</span>
                    <span className="text-gray-300">{channelGuideline.structure}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">도입 패턴</span>
                    <span className="text-gray-300">{channelGuideline.hookPattern}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">마무리</span>
                    <span className="text-gray-300">{channelGuideline.closingPattern}</span>
                  </div>
                  {channelGuideline.keywords.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 flex-shrink-0 w-16">키워드</span>
                      <div className="flex flex-wrap gap-1">
                        {channelGuideline.keywords.map(kw => (
                          <span key={kw} className="px-2 py-0.5 bg-orange-900/30 text-orange-300 rounded text-xs">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-orange-400/60 pt-1 border-t border-gray-700/50">
                    AI 대본 생성 시 이 채널 스타일이 프롬프트에 자동 반영됩니다
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 스타일 선택 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-gray-300">🎨 대본 스타일</span>
              <span className="text-xs text-gray-500">(선택사항)</span>
            </div>
            <div className="flex gap-2">
              {SCRIPT_STYLE_PRESETS.map(preset => {
                const isSelected = selectedStyleId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedStyleId(isSelected ? null : preset.id)}
                    disabled={!!applyingStyle}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-lg border text-center transition-all ${
                      isSelected
                        ? 'bg-violet-600/35 border-violet-400 text-white'
                        : 'bg-gray-800/70 border-gray-600/50 text-gray-300 hover:border-violet-400/60 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-1">
                      <span>{preset.icon}</span>
                      <span className="text-sm font-bold truncate">{preset.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 leading-tight">{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 생성 바 */}
          <div className="flex items-center gap-3 bg-gray-800/40 rounded-xl px-4 py-3 border border-gray-700/40">
            <span className="text-sm text-gray-400 flex-shrink-0">📏</span>
            <input type="number" min={350} max={30000} step={50}
              value={targetCharCount} onChange={(e) => setTargetCharCount(Math.max(350, Number(e.target.value)))}
              className="w-[80px] px-2 py-1.5 rounded-md bg-gray-900/60 text-gray-200 text-sm text-center
                border border-gray-700 focus:outline-none focus:border-violet-500/50" />
            <span className="text-sm text-gray-500">자</span>
            <span className="text-sm text-cyan-400 font-medium whitespace-nowrap">{estimateTime(targetCharCount)}</span>

            <div className="flex-1" />

            <button
              type="button"
              onClick={selectedTopicFromStore ? () => handleGenerateFromTopic(selectedTopicFromStore) : handleGenerateScript}
              disabled={!canGenerate}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
                hover:from-blue-500 hover:to-violet-500 disabled:opacity-30 disabled:cursor-not-allowed
                text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap
                shadow-lg shadow-violet-900/30"
            >
              {isGenerating ? (<><span className="animate-spin inline-block">⟳</span> 생성 중 {elapsedGenerate > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedGenerate)}</span>}</>) : '🚀 AI 대본 생성'}
            </button>
          </div>

          {/* 동적 안내 + 적용 중 뱃지 */}
          <div className="mt-2 flex items-center gap-2 flex-wrap min-h-[24px]">
            {guidanceText && (
              <span className="text-sm text-amber-400/80">{guidanceText}</span>
            )}
            {!guidanceText && hasAnyTool && (
              <>
                <span className="text-xs text-gray-500">적용 중:</span>
                {instinctIds.length > 0 && <span className="text-xs text-violet-300 bg-violet-900/30 px-1.5 py-0.5 rounded">🧠 본능 {instinctIds.length}개</span>}
                {benchmarkScript && <span className="text-xs text-green-300 bg-green-900/30 px-1.5 py-0.5 rounded">📊 벤치마크</span>}
                {channelGuideline && <span className="text-xs text-orange-300 bg-orange-900/30 px-1.5 py-0.5 rounded">📡 {channelGuideline.channelName}</span>}
              </>
            )}
            {selectedStyleId && !guidanceText && (
              <span className="text-xs text-violet-300 bg-violet-900/30 px-1.5 py-0.5 rounded">
                {SCRIPT_STYLE_PRESETS.find(p => p.id === selectedStyleId)?.icon} {SCRIPT_STYLE_PRESETS.find(p => p.id === selectedStyleId)?.name}
              </span>
            )}
          </div>

          {genError && <p className="text-sm text-red-400 mt-2">{genError}</p>}
          {styleError && <p className="text-sm text-red-400 mt-2">{styleError}</p>}

          {/* 기존 대본에 스타일 변환 */}
          {selectedStyleId && scriptText.trim() && !styledScript && (
            <div className="mt-3 px-4 py-2.5 bg-violet-900/10 border border-violet-600/20 rounded-lg flex items-center justify-between">
              <span className="text-sm text-violet-300/80 font-medium">
                입력된 대본에 <span className="text-violet-200 font-bold">{SCRIPT_STYLE_PRESETS.find(p => p.id === selectedStyleId)?.icon} {SCRIPT_STYLE_PRESETS.find(p => p.id === selectedStyleId)?.name}</span> 스타일 적용
              </span>
              <button
                type="button"
                onClick={handleApplySelectedStyle}
                disabled={!!applyingStyle}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                  text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap"
              >
                {applyingStyle ? (<><span className="animate-spin inline-block">⟳</span> 변환 중 {elapsedStyle > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedStyle)}</span>}</>) : '🎨 스타일 변환'}
              </button>
            </div>
          )}
        </div>

        {/* ═══ C. 대본 결과 ═══ */}
        <div className="px-6 py-4 border-b border-gray-700/30">

          {/* 스트리밍 타임라인 */}
          {(isGenerating || streamingText) && (
            <div className="mb-3">
              <Suspense fallback={null}>
                <GenerationTimeline
                  isGenerating={isGenerating}
                  elapsed={elapsedGenerate}
                  streamingText={streamingText}
                  targetChars={targetCharCount}
                />
              </Suspense>
            </div>
          )}

          {/* 원본 대본 */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-400">✏️ 대본</span>
                {styledScript && (
                  <button
                    type="button"
                    onClick={() => { setFinalScript(generatedScript?.content || manualText || ''); }}
                    className={`text-xs px-2 py-0.5 rounded border transition-all ${
                      finalScript === (generatedScript?.content || manualText)
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-bold'
                        : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {finalScript === (generatedScript?.content || manualText) ? '✓ 나레이션용 선택됨' : '나레이션용으로 선택'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className={`flex items-center gap-1.5 px-2.5 py-1
                  ${fileLoading ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'}
                  rounded-lg text-xs cursor-pointer border font-medium transition-colors`}>
                  {fileLoading ? (<><span className="animate-spin">⟳</span> 불러오는 중...</>) : (<>📁 파일 불러오기</>)}
                  <input type="file" accept={SUPPORTED_EXTENSIONS} onChange={handleFileUpload} className="hidden" disabled={fileLoading} />
                </label>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(generatedScript?.content || manualText || '').then(() => showToast('대본이 클립보드에 복사되었습니다.')); }}
                  className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-700/50 px-2 py-1 rounded border border-gray-700/50 transition-colors"
                  title="원본 대본 복사"
                >
                  📋 복사
                </button>
              </div>
            </div>
            <textarea
              value={displayScript}
              onChange={(e) => {
                const val = e.target.value;
                if (generatedScript) {
                  setGeneratedScript({ ...generatedScript, content: val, charCount: val.length });
                } else {
                  setManualText(val);
                }
                if (!styledScript) setFinalScript(val);
              }}
              placeholder="대본을 직접 입력하거나, 위에서 AI 생성을 사용하세요."
              rows={styledScript ? 10 : 14}
              className="w-full bg-gray-800/30 text-gray-200 p-4 text-sm leading-relaxed rounded-xl
                border border-gray-700/40 focus:outline-none focus:border-violet-500/30 resize-none placeholder-gray-600"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            {scriptText.length > 0 ? (
              <span className="text-sm font-bold text-violet-400 bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 rounded-lg">
                {scriptText.length.toLocaleString()}자 · {estimateTime(scriptText.length)}
              </span>
            ) : <span />}
            <span className="text-xs text-gray-600">{SUPPORTED_FORMATS_LABEL}</span>
          </div>

          {/* 스타일 적용본 */}
          {styledScript && (
            <div className="relative mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-violet-400">🎨 {styledStyleName} 스타일 적용</span>
                  <button
                    type="button"
                    onClick={() => setFinalScript(styledScript)}
                    className={`text-xs px-2 py-0.5 rounded border transition-all ${
                      finalScript === styledScript
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 font-bold'
                        : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {finalScript === styledScript ? '✓ 나레이션용 선택됨' : '나레이션용으로 선택'}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(styledScript).then(() => showToast('스타일 적용본이 클립보드에 복사되었습니다.')); }}
                    className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-700/50 px-2 py-1 rounded border border-gray-700/50 transition-colors"
                    title="스타일 적용본 복사"
                  >📋 복사</button>
                  <button
                    type="button"
                    onClick={() => { clearStyledScript(); setFinalScript(generatedScript?.content || manualText || ''); }}
                    className="text-xs text-gray-500 hover:text-red-400 bg-gray-800/50 hover:bg-red-900/20 px-2 py-1 rounded border border-gray-700/50 transition-colors"
                    title="스타일 적용본 삭제"
                  >✕ 삭제</button>
                </div>
              </div>
              <textarea
                value={styledScript}
                onChange={(e) => {
                  const val = e.target.value;
                  setStyledScript(val, styledStyleName);
                  if (finalScript === styledScript) setFinalScript(val);
                }}
                rows={10}
                className="w-full bg-violet-900/10 text-gray-200 p-4 text-sm leading-relaxed rounded-xl
                  border border-violet-700/30 focus:outline-none focus:border-violet-500/30 resize-none"
              />
              <div className="absolute bottom-3 right-3">
                <span className="text-xs text-violet-400/60 bg-gray-800/80 px-2 py-1 rounded backdrop-blur-sm">
                  {styledScript.length.toLocaleString()}자 · {estimateTime(styledScript.length)}
                </span>
              </div>
            </div>
          )}

          {/* 스타일 변환 Diff 비교 */}
          {styledScript && (generatedScript?.content || manualText) && (
            <Suspense fallback={null}>
              <StyleDiffView
                originalScript={generatedScript?.content || manualText || ''}
                styledScript={styledScript}
                styleName={styledStyleName}
              />
            </Suspense>
          )}

          {fileError && <p className="text-sm text-red-400 mt-1 px-1">{fileError}</p>}

          {/* 대본 분석 시각화 */}
          {scriptText.length > 100 && (
            <div className="mt-3 space-y-3">
              <Suspense fallback={null}>
                <ScriptReadabilityDashboard scriptText={scriptText} />
              </Suspense>
              <Suspense fallback={null}>
                <EngagementHeatmap scriptText={scriptText} instinctCount={instinctIds.length} />
              </Suspense>
            </div>
          )}

          {/* 대본 확장 */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowExpander(!showExpander)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all w-full justify-between ${
                showExpander ? 'bg-green-600/15 border-green-500/40 text-green-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>📐</span>
                <span>대본 확장</span>
                <span className="text-xs text-gray-500 font-normal">(현재 대본을 AI가 자연스럽게 늘려줍니다)</span>
              </div>
              <span className="text-gray-600 text-xs">{showExpander ? '▲' : '▼'}</span>
            </button>
            {showExpander && (
              <div className="mt-2 rounded-xl border border-green-700/30 bg-gray-800/20 p-5">
                <Suspense fallback={<Spinner />}><ScriptExpander /></Suspense>
              </div>
            )}
          </div>
        </div>

        {/* ═══ D. 장면 분할 ═══ */}
        <div className="px-6 py-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-gray-300">🎬 장면 분할</span>
            {estimatedScenes > 0 && (
              <span className="text-sm font-bold text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-700/40">
                예상 약 {estimatedScenes}컷
              </span>
            )}
            <span className="text-xs text-gray-500">장면 분석 실행 시 AI가 정확한 컷수를 산출합니다</span>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              {FORMAT_BUTTONS.map(f => (
                <button key={f.id} type="button" onClick={() => setVideoFormat(f.id)}
                  className={`px-3 py-1.5 text-sm font-bold transition-all ${
                    videoFormat === f.id ? `${f.color} text-white` : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}>{f.label}</button>
              ))}
            </div>
            {videoFormat === VideoFormat.LONG && (
              <div className="flex bg-gray-800/60 p-0.5 rounded-lg border border-gray-600">
                {(['DEFAULT', 'DETAILED'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setLongFormSplitType(type)}
                    className={`py-1 px-2.5 rounded-md text-sm font-bold transition-all ${
                      longFormSplitType === type
                        ? (type === 'DEFAULT' ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white')
                        : 'text-gray-400 hover:text-gray-200'
                    }`}>{LONG_SPLIT[type].label}</button>
                ))}
              </div>
            )}
          </div>

          <p className="text-sm text-gray-400 mb-1">{FORMAT_DESC[videoFormat]}</p>
          {videoFormat === VideoFormat.LONG && (
            <p className="text-sm text-violet-400/80 mb-1">
              <span className="font-bold text-violet-300">{LONG_SPLIT[longFormSplitType].label}</span>
              {' — '}{LONG_SPLIT[longFormSplitType].desc}
            </p>
          )}

          <p className="text-sm text-cyan-300/70 mt-1 mb-1 font-medium">
            장면 분할은 영상 편집(이미지/영상 생성)을 위한 설정이며, 나레이션은 문장 단위(~다/~죠/~요)로 자연스럽게 읽힙니다.
          </p>

          {/* 실시간 단락 미리보기 */}
          <button
            type="button"
            onClick={() => setShowSplitGuide(!showSplitGuide)}
            className="mt-2 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>{showSplitGuide ? '▼' : '▶'}</span>
            <span className="underline font-medium">
              {livePreviewData.scenes.length > 0 ? `단락 미리보기 (예상 ${livePreviewData.scenes.length}컷)` : '단락 미리보기'}
            </span>
            {livePreviewData.scenes.length > 0 && (
              <span className="text-xs text-yellow-400/70">예상치 — 아래 장면 분석에서 AI가 정확히 분할합니다</span>
            )}
          </button>

          {showSplitGuide && (
            <div className="mt-2">
              {livePreviewData.scenes.length > 0 ? (
                <div className="bg-gray-800/30 rounded-xl border border-blue-700/20 overflow-hidden">
                  <div className="px-3 py-2 bg-blue-900/15 border-b border-blue-700/15">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-300">예상 분할 미리보기</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-600/20 font-medium">로컬 추정</span>
                      </div>
                      <span className="text-xs text-yellow-300/70 font-medium">장면 분석 실행 시 AI가 문맥을 이해하여 정확히 분할합니다</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed bg-gray-900/40 rounded px-2 py-1.5 border border-gray-700/20">
                      <span className="text-yellow-400/80 font-medium">원문:</span> {livePreviewData.original}
                    </p>
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    {livePreviewData.scenes.map((scene, i) => (
                      <div key={i}
                        className={`flex items-start gap-3 px-3 py-2 ${i % 2 === 0 ? 'bg-gray-800/10' : 'bg-gray-800/30'} border-b border-gray-700/15 last:border-b-0`}>
                        <span className="flex-shrink-0 w-7 h-7 rounded-md bg-blue-900/30 border border-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-300">
                          {i + 1}
                        </span>
                        <p className="text-sm text-gray-200 leading-relaxed pt-0.5">{scene}</p>
                        <span className="flex-shrink-0 text-xs text-gray-500 pt-1 whitespace-nowrap">{scene.length}자</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800/30 rounded-lg border border-gray-700/20 p-4 text-center">
                  <p className="text-sm text-gray-500">대본을 입력하면 가장 긴 구간의 분할 미리보기가 표시됩니다</p>
                </div>
              )}
            </div>
          )}

          {/* 장면 페이싱 분석 차트 */}
          {(splitResult.length >= 2 || livePreviewData.scenes.length >= 3) && (
            <div className="mt-3">
              <Suspense fallback={null}>
                <ScenePacingChart scenes={splitResult.length >= 2 ? splitResult : livePreviewData.scenes} />
              </Suspense>
            </div>
          )}
        </div>

        {/* ═══ Final CTA ═══ */}
        <div className="px-6 py-5 space-y-3">
          <button
            type="button"
            onClick={handleSceneAnalysis}
            disabled={!displayScript || isAnalyzingScenes}
            className={`w-full relative overflow-hidden rounded-xl text-sm font-bold shadow-lg transition-all ${
              isAnalyzingScenes
                ? 'bg-gray-800 border border-gray-600 text-white'
                : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-25 disabled:cursor-not-allowed text-white border border-violet-400/40 shadow-violet-900/30'
            }`}
          >
            {isAnalyzingScenes && (
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 rounded-xl transition-all duration-300 ease-out"
                style={{ width: `${analysisProgress}%` }} />
            )}
            <div className="relative py-3.5 flex items-center justify-center gap-2">
              {isAnalyzingScenes ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>AI가 장면을 분석하고 있습니다... ({scriptText.length.toLocaleString()}자)</span>
                  <span className="font-black text-lg text-white drop-shadow-md">{analysisProgress}%</span>
                  {elapsedAnalysis > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedAnalysis)}</span>}
                </>
              ) : (
                <>🎬 장면 분석 실행</>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={handleGoToSoundStudio}
            disabled={!displayScript.trim()}
            className="w-full bg-gradient-to-r from-fuchsia-600 to-violet-600
              hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-25 disabled:cursor-not-allowed
              text-white rounded-xl text-sm font-bold border border-fuchsia-400/30 shadow-lg shadow-fuchsia-900/20
              py-3.5 flex items-center justify-center gap-2 transition-all"
          >
            🎙 사운드 스튜디오로 대본 보내기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>

          {genError && (
            <div className="bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-400">{genError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
