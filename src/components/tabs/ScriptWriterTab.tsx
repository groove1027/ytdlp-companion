import React, { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useScriptWriterStore } from '../../stores/scriptWriterStore';
import { useNavigationStore } from '../../stores/navigationStore';
import { useChannelAnalysisStore } from '../../stores/channelAnalysisStore';
import { useInstinctStore } from '../../stores/instinctStore';
import { useProjectStore } from '../../stores/projectStore';
import { evolinkChat, evolinkChatStream, evolinkNativeStream, scriptGenerationStream, getEvolinkKey } from '../../services/evolinkService';
import { recommendTopics } from '../../services/topicRecommendService';
import { buildSelectedInstinctPrompt } from '../../data/instinctPromptUtils';
import { SCRIPT_STYLE_PRESETS, ScriptStylePreset } from '../../data/scriptStylePresets';
import { VideoFormat, ContentFormat, TopicRecommendation, AspectRatio, ScriptAiModel, ScriptTargetRegion } from '../../types';
import { SCRIPT_AI_MODELS, SCRIPT_TARGET_REGIONS } from '../../constants';
import AiModelLogo from '../ui/AiModelLogo';
import { showToast } from '../../stores/uiStore';
import { logger } from '../../services/LoggerService';
import { countScenesLocally, splitScenesLocally, extractJsonFromText } from '../../services/gemini/scriptAnalysis';
import { formatSrtTime } from '../../services/srtService';
import { canCreateNewProject } from '../../services/storageService';
import { parseFileToText, SUPPORTED_EXTENSIONS, SUPPORTED_FORMATS_LABEL } from '../../services/fileParserService';
import BenchmarkPanel from './script/BenchmarkPanel';
import TopicRecommendCards from './script/TopicRecommendCards';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../hooks/useAuthGuard';

// 청크 로딩 실패 시 1회 재시도 + 자동 리로드
function lazyRetry(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return React.lazy(() =>
    importFn().catch(() =>
      importFn().catch(() => {
        const reloaded = sessionStorage.getItem('__chunk_reload');
        if (!reloaded) {
          sessionStorage.setItem('__chunk_reload', '1');
          window.location.reload();
        }
        throw new Error('Failed to fetch dynamically imported module');
      })
    )
  );
}

const InstinctBrowser = lazyRetry(() => import('./script/InstinctBrowser'));
const ScriptExpander = lazyRetry(() => import('./script/ScriptExpander'));
const ScriptReadabilityDashboard = lazyRetry(() => import('./script/ScriptReadabilityDashboard'));
const EngagementHeatmap = lazyRetry(() => import('./script/EngagementHeatmap'));
const ScenePacingChart = lazyRetry(() => import('./script/ScenePacingChart'));
const TopicComparisonRadar = lazyRetry(() => import('./script/TopicComparisonRadar'));
const GenerationTimeline = lazyRetry(() => import('./script/GenerationTimeline'));
const StyleDiffView = lazyRetry(() => import('./script/StyleDiffView'));
const BenchmarkRadarChart = lazyRetry(() => import('./script/BenchmarkRadarChart'));

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

/**
 * 채널 스타일 데이터를 종합하여 AI 프롬프트용 섹션을 구성 (#159)
 * - channelGuideline의 기본 필드 + fullGuidelineText(상세 분석)
 * - channelScripts에서 실제 자막 샘플 (말투 학습용, caption 소스 우선)
 * - benchmarkScript (사용자 선택 벤치마크 대본)
 */
function buildChannelStyleSection(
  guideline: import('../../types').ChannelGuideline | null,
  scripts: import('../../types').ChannelScript[],
  benchmark: string,
  referenceComments?: string,
  targetRegion?: ScriptTargetRegion,
): string {
  const parts: string[] = [];

  if (guideline) {
    // 기본 스타일 가이드
    parts.push(`[채널 스타일 가이드]
채널명: ${guideline.channelName} (참조용 — 대본 본문에 이 채널명을 절대 언급하지 마세요)
말투: ${guideline.tone}
구조: ${guideline.structure}
도입패턴: ${guideline.hookPattern}
마무리패턴: ${guideline.closingPattern}
⚠️ 주의: 마무리 패턴의 형식·어조만 참고하세요. 채널명이 포함된 멘트(예: "${guideline.channelName}입니다", "${guideline.channelName}였습니다" 등)는 대본에 넣지 마세요.`);

    // #162: Style DNA layers — 채널 분석에서 추출된 추가 필드 반영
    if (guideline.visualGuide) {
      parts.push(`시각 스타일: ${guideline.visualGuide}`);
    }
    if (guideline.editGuide) {
      parts.push(`편집 스타일: ${guideline.editGuide}`);
    }
    if (guideline.audioGuide) {
      parts.push(`오디오 스타일: ${guideline.audioGuide}`);
    }
    if (guideline.titleFormula) {
      parts.push(`제목 공식: ${guideline.titleFormula}`);
    }
    if (guideline.audienceInsight) {
      parts.push(`시청자 인사이트: ${guideline.audienceInsight}`);
    }

    // fullGuidelineText에 상세 분석이 있으면 포함 (최대 2000자)
    if (guideline.fullGuidelineText && guideline.fullGuidelineText.length > 50) {
      const trimmed = guideline.fullGuidelineText.slice(0, 2000);
      parts.push(`\n[채널 상세 스타일 분석]\n${trimmed}`);
    }
  }

  // 실제 자막이 확보된 스크립트 샘플 (caption 소스 우선, 최대 3개, 각 600자)
  const captionScripts = scripts.filter(s => s.transcriptSource === 'caption' && s.transcript.length > 100);
  const sampleScripts = captionScripts.length > 0
    ? captionScripts.slice(0, 3)
    : scripts.filter(s => s.transcript.length > 100).slice(0, 2);

  // [FIX #392] 해외 채널 + 한국어 타겟이면 스타일만 참고하도록 지시
  const isOverseasKo = guideline?.contentRegion === 'overseas' && (!targetRegion || targetRegion === 'ko');

  if (sampleScripts.length > 0) {
    const samples = sampleScripts.map((s, i) =>
      `--- 샘플 ${i + 1}: "${s.title}" ---\n${s.transcript.slice(0, 600)}`
    ).join('\n\n');
    if (isOverseasKo) {
      parts.push(`\n[채널 대본 샘플 (콘텐츠 구조·전개 방식·훅 패턴만 참고 — 대본은 반드시 한국어로 작성)]\n${samples}`);
    } else {
      parts.push(`\n[채널 대본 샘플 (말투·어조·종결어미를 정확히 모방하세요)]\n${samples}`);
    }
  }

  // 벤치마크 대본 (사용자 선택)
  if (benchmark) {
    parts.push(`\n[참고 벤치마크 대본 (앞 1200자)]\n${benchmark.slice(0, 1200)}\n→ 위 대본의 말투와 흐름을 정확히 모방하되 내용은 새롭게 작성하세요.`);
  }

  // [#216] 사용자 수동 댓글 붙여넣기 — 시청자 반응/관심사를 대본에 반영
  if (referenceComments && referenceComments.trim().length > 10) {
    parts.push(`\n[시청자 댓글 참고 (사용자 입력)]\n${referenceComments.trim().slice(0, 2000)}\n→ 위 댓글에서 시청자들이 관심 있어하는 포인트, 궁금해하는 내용, 요청 사항을 대본에 자연스럽게 반영하세요.`);
  }

  if (parts.length > 0) {
    if (isOverseasKo) {
      // [FIX #392] 해외 채널 프리셋 사용 시 한국어 대본 강제
      parts.push('\n→ 위 채널은 해외 채널입니다. 콘텐츠 구조, 전개 방식, 편집 리듬, 도입/마무리 패턴은 충실히 참고하되, 대본은 반드시 한국어로 작성하세요. 영어나 다른 외국어로 작성하지 마세요. 한국 시청자가 자연스럽게 이해할 수 있는 한국어 표현을 사용하세요.');
    } else {
      parts.push('\n→ 위 채널의 말투, 종결어미, 문장 호흡, 도입/마무리 패턴의 형식과 어조를 충실히 반영하여 대본을 작성하세요. 단, 채널명은 대본 본문에 절대 포함하지 마세요. 채널 고유의 스타일(어투·구조·리듬)을 최우선으로 지키되, 채널명 언급은 제외하세요.');
    }
  }

  return parts.join('\n');
}

/**
 * [#294] 해외 타겟 지역이 선택된 경우, AI 프롬프트에 삽입할 지역/언어 지시 섹션 생성
 * - 한국(ko) 선택 시 빈 문자열 반환 (기존 동작 유지)
 */
function buildTargetRegionSection(region: ScriptTargetRegion): string {
  if (region === 'ko') return '';
  const info = SCRIPT_TARGET_REGIONS.find(r => r.id === region);
  if (!info) return '';
  return `\n\n[타겟 지역 및 언어 — 반드시 준수]
- 타겟 지역: ${info.label} (${info.langLabel})
- 출력 언어: 반드시 ${info.lang}(${info.langLabel})로 작성하세요. 한국어로 작성하지 마세요.
- 자료 검색: ${info.label} 지역의 자료, 사례, 뉴스, 통계를 기반으로 작성하세요. 한국 자료를 기반으로 하지 마세요.
- 문화 반영: ${info.label} 시청자의 문화, 관습, 유머 코드, 표현 방식을 자연스럽게 반영하세요.
- 현지화: 해당 지역에서 통용되는 단위(도량형, 화폐), 인물, 브랜드, 미디어 레퍼런스를 사용하세요.
→ 위 지시를 반드시 지켜주세요. 대본 전체를 ${info.lang}로 작성하는 것이 최우선입니다.`;
}

/**
 * [#294] 해외 타겟 시 시스템 프롬프트의 기본 역할 지시를 해당 언어로 보강
 */
function getRegionSystemPrefix(region: ScriptTargetRegion): string {
  if (region === 'ko') return '';
  const info = SCRIPT_TARGET_REGIONS.find(r => r.id === region);
  if (!info) return '';
  return `IMPORTANT: You MUST write the entire script in ${info.langLabel}. Do NOT write in Korean. All content, narration, and expressions must be in ${info.langLabel}, naturally reflecting ${info.label} culture and audience preferences.\n\n`;
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
    contentFormat, setContentFormat,
    shortsSeconds, setShortsSeconds,
    videoFormat, setVideoFormat,
    longFormSplitType, setLongFormSplitType, smartSplit,
    targetCharCount, setTargetCharCount,
    splitResult, setSplitResult,
    manualText, setManualText,
    title, setTitle,
    synopsis, setSynopsis,
    clearPreviousContent,
    videoAnalysisStyles, addVideoAnalysisStyle, removeVideoAnalysisStyle,
    scriptAiModel, setScriptAiModel,
    referenceComments,
    targetRegion, setTargetRegion,
    activeStep, setActiveStep,
  } = useScriptWriterStore();

  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const channelGuideline = useChannelAnalysisStore((s) => s.channelGuideline);
  const setChannelGuideline = useChannelAnalysisStore((s) => s.setChannelGuideline);
  const channelScripts = useChannelAnalysisStore((s) => s.channelScripts);

  const [openTool, setOpenTool] = useState<OpenTool>(null);
  const [showExpander, setShowExpander] = useState(false);
  const [genError, setGenError] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const genAbortRef = useRef<AbortController | null>(null);
  const [applyingStyle, setApplyingStyle] = useState<string | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [styleError, setStyleError] = useState('');
  const [showChannelGuide, setShowChannelGuide] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(true);
  const [showManualInput, setShowManualInput] = useState(false);
  // 글자수 입력: 로컬 문자열 상태 (타이핑 중 클램핑 방지 — #373)
  const [targetCharInput, setTargetCharInput] = useState(String(targetCharCount));
  useEffect(() => { setTargetCharInput(String(targetCharCount)); }, [targetCharCount]);
  // [#414] 채널 리메이크에서 대본 선택 후 진입 시 대본 영역으로 자동 스크롤
  const scriptSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeStep === 3 && finalScript) {
      // 약간 지연: 렌더링 완료 후 스크롤
      const timer = setTimeout(() => {
        scriptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveStep(1); // 스크롤 완료 후 리셋 (1회성)
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [activeStep, finalScript, setActiveStep]);

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
      // 채널분석에서 새 소재가 도착하면 이전 대본 콘텐츠 초기화
      setGeneratedScript(null);
      clearStyledScript();
      setFinalScript('');
      setManualText('');
      setSplitResult([]);
      setTitle(selectedTopic.title);
      setSynopsis(`${selectedTopic.mainSubject}\n\n대본 흐름: ${selectedTopic.scriptFlow}`);
    }
  }, [selectedTopic]);

  // [FIX #185] ?? 사용: 빈 문자열('')은 유효한 값 — 전체 삭제 후 이전 텍스트로 롤백되는 버그 수정
  const scriptText = (finalScript ?? generatedScript?.content ?? manualText) || '';
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

  // ── 이미지/영상으로 직접 이동 (#223) ──
  const handleGoToImageVideo = useCallback(() => {
    const latest = finalScript || styledScript || generatedScript?.content || manualText || '';
    if (!latest.trim()) return;
    setFinalScript(latest);
    const autoAspect = videoFormat !== VideoFormat.LONG ? AspectRatio.PORTRAIT : undefined;
    useProjectStore.getState().setConfig((prev) => prev ? {
      ...prev,
      script: latest,
      videoFormat,
      smartSplit,
      longFormSplitType,
      ...(autoAspect ? { aspectRatio: autoAspect } : {}),
    } : prev);
    useProjectStore.getState().smartUpdateTitle('script-writer', latest.split('\n')[0] || '');
    setActiveTab('image-video');
  }, [generatedScript, manualText, finalScript, styledScript, videoFormat, smartSplit, longFormSplitType, setFinalScript, setActiveTab]);

  // ── 단락 나누기 ──
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

  // [#325][FIX #330] 단락 → SRT 다운로드 — 순서/공백 정규화
  const handleDownloadSegmentsSrt = useCallback(() => {
    const raw = splitResult.length >= 2 ? splitResult : livePreviewData.scenes;
    // [FIX #330] 각 세그먼트의 앞뒤 공백 제거 + 내부 연속 빈줄을 단일 줄바꿈으로 정규화
    // (SRT에서 빈줄은 항목 구분자이므로 텍스트 내부에 있으면 파서가 오동작함)
    const segments = raw
      .map((t) => t.trim().replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, ''))
      .filter((t) => t.length > 0);
    if (segments.length === 0) return;
    const CHARS_PER_SEC = 4;
    let offset = 0;
    const srtLines: string[] = [];
    segments.forEach((text, i) => {
      const dur = Math.max(2, text.length / CHARS_PER_SEC);
      srtLines.push(`${i + 1}\n${formatSrtTime(offset)} --> ${formatSrtTime(offset + dur)}\n${text}`);
      offset += dur + 0.5;
    });
    const content = srtLines.join('\n\n') + '\n';
    const blob = new Blob(['\uFEFF' + content], { type: 'text/srt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `segments_${Date.now()}.srt`; a.click();
    URL.revokeObjectURL(url);
  }, [splitResult, livePreviewData.scenes]);

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
    if (!projStore.currentProjectId || !projStore.config) {
      const ok = await canCreateNewProject();
      if (!ok) {
        setGenError('저장 공간이 부족합니다. 기존 프로젝트를 삭제해주세요.');
        return;
      }
      // 프로젝트가 없으면 명시적으로 생성 (사용자가 실제 작업을 시작하는 시점)
      const titleHint = scriptText.trim().substring(0, 30) || '대본 프로젝트';
      projStore.newProject(titleHint);
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

      // [FIX #222] 120초 타임아웃 — 롱폼 단락 나누기 무한 hang 방지
      // Flash Lite: 단순 텍스트 분할에는 Pro 불필요, Flash Lite가 2~3배 빠름
      const response = await evolinkChat([{ role: 'user', content: prompt }], {
        timeoutMs: 120_000,
        model: 'gemini-3.1-flash-lite-preview',
        temperature: 0.3,
        maxTokens: 2048,
      });
      clearInterval(simInterval);
      setAnalysisProgress(95);

      const responseText = response.choices?.[0]?.message?.content || '';
      const parsed = extractJsonFromText(responseText);
      const scenes = Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string' && (s as string).trim()) as string[] : [];

      if (scenes.length === 0) {
        const fallback = splitScenesLocally(scriptText, videoFormat, smartSplit,
          videoFormat === VideoFormat.LONG ? longFormSplitType : undefined);
        setSplitResult(fallback);
        showToast(`로컬 분할 완료: ${fallback.length}개 단락`);
      } else {
        setSplitResult(scenes);
        showToast(`AI 단락 분석 완료: ${scenes.length}개 단락`);
      }

      // [FIX #160] 이미지/영상 탭으로 이동 시 대본·설정을 프로젝트 config에 반드시 전달
      // 이전에는 videoFormat만 전달하여 config.script가 비어 "스토리보드 생성" 버튼이 비활성화되는 버그 발생
      setFinalScript(scriptText);
      const autoAspect = videoFormat !== VideoFormat.LONG ? AspectRatio.PORTRAIT : undefined;
      projStore.setConfig((prev) => prev ? {
        ...prev,
        script: scriptText,
        videoFormat,
        smartSplit,
        longFormSplitType,
        ...(autoAspect ? { aspectRatio: autoAspect } : {}),
      } : prev);
      projStore.smartUpdateTitle('script-writer', scriptText.split('\n')[0] || '');
      setAnalysisProgress(100);
      setActiveTab('image-video');
    } catch (err) {
      clearInterval(simInterval);
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(`단락 분석 실패: ${msg}`);
    } finally {
      setIsAnalyzingScenes(false);
    }
  }, [scriptText, videoFormat, longFormSplitType, smartSplit, isAnalyzingScenes, setSplitResult, setActiveTab, setFinalScript]);

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
      // 이전 대본 콘텐츠 전체 초기화 (포맷 설정은 유지)
      clearPreviousContent();
      // instinctStore의 소재 추천 선택도 초기화
      useInstinctStore.getState().clearTopics();
      setManualText(text);
      setFinalScript(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFileError(`파일 불러오기 실패: ${msg}`);
    } finally {
      setFileLoading(false);
      e.target.value = '';
    }
  }, [clearPreviousContent, setManualText, setFinalScript]);

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

  // -- 소재 선택 시 이전 대본 초기화 후 제목/줄거리 자동 채우기
  const handleSelectTopic = useCallback((topic: TopicRecommendation) => {
    useInstinctStore.getState().selectTopic(topic.id);
    // 이전 소재의 대본이 남아있지 않도록 콘텐츠 초기화
    setGeneratedScript(null);
    clearStyledScript();
    setFinalScript('');
    setManualText('');
    setSplitResult([]);
    setTitle(topic.title);
    setSynopsis(topic.synopsis);
  }, [setGeneratedScript, clearStyledScript, setFinalScript, setManualText, setSplitResult, setTitle, setSynopsis]);

  // -- 선택된 소재로 스트리밍 대본 생성
  const handleGenerateFromTopic = useCallback(async (topic: TopicRecommendation) => {
    if (!requireAuth('AI 대본 생성')) return;
    if (!getEvolinkKey()) {
      setGenError('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    genAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    genAbortRef.current = abortCtrl;

    startGeneration();
    setStreamingText('');
    setGenError('');

    const instinctPrompt = buildSelectedInstinctPrompt(instinctIds);
    const isShorts = contentFormat === 'shorts';

    const shortsSystemRule = isShorts
      ? `\n이 대본은 유튜브 쇼츠(${shortsSeconds}초 이내 세로 영상)용입니다. 짧고 강렬하게 작성하세요.`
      : '';

    // [FIX #159] 채널 스타일 데이터를 종합하여 프롬프트에 반영
    const channelStyleSection = buildChannelStyleSection(channelGuideline, channelScripts, benchmarkScript, referenceComments, targetRegion);

    // [#294] 해외 타겟 지역 프롬프트 섹션
    const regionSection = buildTargetRegionSection(targetRegion);
    const regionSystemPrefix = getRegionSystemPrefix(targetRegion);

    const systemPrompt = `${regionSystemPrefix}당신은 유튜브 바이럴 영상 전문 대본 작가입니다.
주어진 소재와 본능 기제를 바탕으로 완성된 대본을 작성합니다.
훅(도입부)에서 선택된 본능 기제가 시청자 심리를 강하게 자극하도록 설계하세요.${shortsSystemRule}${channelStyleSection ? '\n\n' + channelStyleSection : ''}`;

    const shortsRequirement = isShorts
      ? `\n- 포맷: 유튜브 쇼츠 (${shortsSeconds}초 이내, 세로형)\n- 첫 문장에서 즉시 주제를 던지세요 (서론 없이 바로 핵심)\n- 짧고 강렬한 문장 위주 (한 문장 20자 이내)\n- "본 영상에서 다루겠습니다" 같은 롱폼 유도 표현 절대 금지\n- 마지막은 반전/충격/핵심 결론으로 임팩트 있게 마무리`
      : '';

    const userPrompt = `[소재]
제목: ${topic.title}
훅: ${topic.hook}
줄거리: ${topic.synopsis}

[적용할 본능 기제]
${instinctPrompt}

[요구사항]
- 위 소재와 본능 기제를 결합한 완성 대본을 작성하세요
- 대본 길이: 반드시 ${targetCharCount}자 이상 작성 (목표 분량에 도달할 때까지 내용을 충분히 전개하세요)
- 훅(첫 3초)은 반드시 "${topic.hook}"을 기반으로 작성
- 대본 형식: 나레이션 대본 (화자 지시 없이 내레이션만)${shortsRequirement}${regionSection}

대본만 출력하세요. 제목이나 부가 설명 없이 본문만.`;

    try {
      // [FIX #137] 토큰 배수 4x + 자동 이어쓰기로 롱폼 대본 잘림 해결
      let finishReason = '';
      const tokenBudget = Math.min(65536, Math.max(8000, Math.ceil(targetCharCount * 4)));
      const useWebSearch = scriptAiModel === ScriptAiModel.GEMINI_PRO;
      let result = await scriptGenerationStream(
        systemPrompt,
        userPrompt,
        (_chunk, accumulated) => { setStreamingText(accumulated); },
        { model: scriptAiModel, temperature: 0.7, maxOutputTokens: tokenBudget, enableWebSearch: useWebSearch, signal: abortCtrl.signal, onFinish: (r) => { finishReason = r; } }
      );

      // [FIX #137 #273 #308] 이어쓰기: MAX_TOKENS 또는 분량 미달 시 자동 계속 생성 (최대 3회)
      const MAX_CONTINUATIONS = 3;
      for (let ci = 0; ci < MAX_CONTINUATIONS; ci++) {
        const isTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'length';
        const isTooShort = result.length < targetCharCount * 0.85;
        if (!isTruncated && !isTooShort) break;
        // [FIX #273] 목표 분량 90% 이상 + 문장이 자연스럽게 끝나면 추가 불필요
        if (result.length >= targetCharCount * 0.9 && /[.!?。다요죠네세까]$/.test(result.trimEnd())) break;

        const remaining = targetCharCount - result.length;
        const contPrompt = remaining > 0
          ? `다음은 이전에 작성하던 대본의 마지막 부분입니다:\n\n"...${result.slice(-800)}"\n\n이 대본을 끊긴 부분부터 자연스럽게 이어서 계속 작성하세요.\n남은 분량: 약 ${remaining}자\n\n중요: 이미 쓴 내용을 반복하지 마세요. 끊긴 지점부터 바로 이어서 쓰세요. 대본 본문만 출력하세요.`
          : `다음 대본의 마지막 문장이 중간에서 끊겼습니다:\n\n"...${result.slice(-400)}"\n\n끊긴 마지막 문장만 자연스럽게 완성하세요. 새로운 내용을 추가하지 마세요. 대본 본문만 출력하세요.`;
        finishReason = '';
        const contBudget = Math.min(32000, Math.max(2000, Math.ceil(Math.max(remaining, 200) * 4)));
        const contText = await scriptGenerationStream(
          systemPrompt, contPrompt,
          (_chunk, accumulated) => { setStreamingText(result + accumulated); },
          { model: scriptAiModel, temperature: 0.7, maxOutputTokens: contBudget, signal: abortCtrl.signal, onFinish: (r) => { finishReason = r; } }
        );
        result += contText;
      }

      setGeneratedScript({
        title: topic.title,
        content: result,
        charCount: result.length,
        estimatedDuration: `약 ${Math.round(result.length / 650)}분`,
        structure: [],
      });
      setFinalScript(result);
      setStreamingText('');
    } catch (err) {
      if (abortCtrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        setGenError('');
      } else {
        setGenError(err instanceof Error ? err.message : '대본 생성 실패');
      }
      setStreamingText('');
    } finally {
      genAbortRef.current = null;
      finishGeneration();
    }
  }, [instinctIds, targetCharCount, contentFormat, shortsSeconds, channelGuideline, channelScripts, benchmarkScript, referenceComments, startGeneration, finishGeneration, setGeneratedScript, setFinalScript, scriptAiModel, targetRegion]);

  // #158: 빌트인 + 영상분석 스타일 병합
  const allStylePresets: ScriptStylePreset[] = useMemo(() => {
    const vaPresets: ScriptStylePreset[] = videoAnalysisStyles.map(va => ({
      id: va.id, name: va.name, icon: va.icon,
      description: va.description, systemPrompt: va.systemPrompt,
    }));
    return [...SCRIPT_STYLE_PRESETS, ...vaPresets];
  }, [videoAnalysisStyles]);

  const handleGenerateScript = useCallback(async () => {
    if (!requireAuth('AI 대본 생성')) return;
    if (!title.trim() || !synopsis.trim()) return;
    if (!getEvolinkKey()) {
      setGenError('Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    genAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    genAbortRef.current = abortCtrl;

    startGeneration();
    setStreamingText('');
    setGenError('');

    const formatLabel = `${targetCharCount.toLocaleString()}자 분량 (${estimateTime(targetCharCount)})`;
    const isShorts = contentFormat === 'shorts';

    const shortsRule = isShorts
      ? `\n\n중요 — 이 대본은 유튜브 쇼츠(${shortsSeconds}초 이내 세로 영상)용입니다:
- 첫 문장에서 즉시 주제를 던지세요 (서론/도입부 없이 바로 핵심)
- 짧고 강렬한 문장 위주 (한 문장 20자 이내)
- "본 영상에서 다루겠습니다" 같은 롱폼 유도 표현 절대 금지
- 대본 자체가 완결된 콘텐츠여야 합니다 (다른 영상 참조 X)
- 마지막은 반전/충격/핵심 결론으로 임팩트 있게 마무리`
      : '';

    // [FIX #159] 채널 스타일 데이터를 종합하여 프롬프트에 반영 (fullGuidelineText + 대본 샘플 포함)
    const channelStyleSection = buildChannelStyleSection(channelGuideline, channelScripts, benchmarkScript, referenceComments, targetRegion);

    // [#294] 해외 타겟 지역 프롬프트 섹션
    const regionSection = buildTargetRegionSection(targetRegion);
    const regionSystemPrefix = getRegionSystemPrefix(targetRegion);

    // [FIX #170] 선택된 스타일 프리셋의 시스템 프롬프트를 생성 시 반영
    const activePreset = selectedStyleId ? allStylePresets.find(p => p.id === selectedStyleId) : null;

    const baseSystemPrompt = `${regionSystemPrefix}당신은 전문 영상 대본 작가입니다. 사용자의 요청에 따라 완성도 높은 ${isShorts ? '유튜브 쇼츠' : '영상'} 대본을 생성합니다.

핵심 원칙:
1. 대본에 포함되는 정보, 사례, 통계, 사건은 반드시 실제로 존재하는 것이어야 합니다.
2. 허구의 연구, 가짜 통계, 존재하지 않는 사건을 지어내지 마세요.
3. 확실하지 않은 정보는 "~로 알려져 있다", "~라는 주장이 있다"로 표현하세요.
4. 구체적 수치나 출처를 언급할 때는 실제 데이터만 사용하세요.${shortsRule}`;

    const systemPrompt = activePreset
      ? `${activePreset.systemPrompt}\n\n${baseSystemPrompt}`
      : baseSystemPrompt;

    const instinctSection = instinctIds.length > 0
      ? `\n\n[적용할 본능 기제]\n${buildSelectedInstinctPrompt(instinctIds)}\n\n위 본능 기제를 활용하여 도입부(훅)에서 시청자 심리를 강하게 자극하세요.`
      : '';

    const topicInstinctSection = selectedTopic?.instinctAnalysis
      ? `\n\n[주제 본능 분석]\n핵심 본능: ${selectedTopic.instinctAnalysis.primaryInstincts.join(', ')}\n조합 공식: ${selectedTopic.instinctAnalysis.comboFormula}\n추천 훅: "${selectedTopic.instinctAnalysis.hookSuggestion}"\n→ 위 심리 기제를 도입부(훅)에 적극 반영하세요.`
      : '';

    const userPrompt = `다음 조건에 맞는 ${isShorts ? `유튜브 쇼츠(세로 ${shortsSeconds}초)` : '영상'} 대본을 생성하세요:

- 제목: ${title}
- 줄거리: ${synopsis}
- 포맷: ${isShorts ? `쇼츠 (${shortsSeconds}초 이내, 세로형)` : '롱폼'}
- 분량: ${formatLabel} (반드시 이 분량을 채우세요. 목표 글자수에 도달할 때까지 내용을 충분히 전개하세요)${instinctSection}${channelStyleSection ? '\n\n' + channelStyleSection : ''}${topicInstinctSection}${regionSection}

대본만 출력하세요. 제목이나 부가 설명 없이 본문만.`;

    try {
      // [FIX #137] 토큰 배수 4x + 자동 이어쓰기로 롱폼 대본 잘림 해결
      let finishReason = '';
      const tokenBudget = Math.min(65536, Math.max(8000, Math.ceil(targetCharCount * 4)));
      const useWebSearch = scriptAiModel === ScriptAiModel.GEMINI_PRO;
      let fullText = await scriptGenerationStream(
        systemPrompt,
        userPrompt,
        (_chunk, accumulated) => { setStreamingText(accumulated); },
        { model: scriptAiModel, temperature: 0.7, maxOutputTokens: tokenBudget, enableWebSearch: useWebSearch, signal: abortCtrl.signal, onFinish: (r) => { finishReason = r; } }
      );

      // [FIX #137 #273 #308] 이어쓰기: MAX_TOKENS 또는 분량 미달 시 자동 계속 생성 (최대 3회)
      const MAX_CONTINUATIONS = 3;
      for (let ci = 0; ci < MAX_CONTINUATIONS; ci++) {
        const isTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'length';
        const isTooShort = fullText.length < targetCharCount * 0.85;
        if (!isTruncated && !isTooShort) break;
        // [FIX #273] 목표 분량 90% 이상 + 문장이 자연스럽게 끝나면 추가 불필요
        if (fullText.length >= targetCharCount * 0.9 && /[.!?。다요죠네세까]$/.test(fullText.trimEnd())) break;

        const remaining = targetCharCount - fullText.length;
        const contPrompt = remaining > 0
          ? `다음은 이전에 작성하던 대본의 마지막 부분입니다:\n\n"...${fullText.slice(-800)}"\n\n이 대본을 끊긴 부분부터 자연스럽게 이어서 계속 작성하세요.\n남은 분량: 약 ${remaining}자\n\n중요: 이미 쓴 내용을 반복하지 마세요. 끊긴 지점부터 바로 이어서 쓰세요. 대본 본문만 출력하세요.`
          : `다음 대본의 마지막 문장이 중간에서 끊겼습니다:\n\n"...${fullText.slice(-400)}"\n\n끊긴 마지막 문장만 자연스럽게 완성하세요. 새로운 내용을 추가하지 마세요. 대본 본문만 출력하세요.`;
        finishReason = '';
        const contBudget = Math.min(32000, Math.max(2000, Math.ceil(Math.max(remaining, 200) * 4)));
        const contText = await scriptGenerationStream(
          systemPrompt, contPrompt,
          (_chunk, accumulated) => { setStreamingText(fullText + accumulated); },
          { model: scriptAiModel, temperature: 0.7, maxOutputTokens: contBudget, signal: abortCtrl.signal, onFinish: (r) => { finishReason = r; } }
        );
        fullText += contText;
      }

      if (!fullText.trim()) throw new Error('AI 응답이 비어있습니다. 다시 시도해주세요.');

      // JSON 파싱 시도 (이전 방식 호환) — 실패 시 plain text로 사용
      let finalContent = fullText;
      let finalTitle = title;
      let finalDuration = `약 ${Math.round(fullText.length / 650)}분`;
      let finalStructure: string[] = [];

      const jsonStr = extractJsonFromText(fullText);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as { title?: string; content?: string; estimatedDuration?: string; structure?: string[] };
          if (parsed.content && parsed.content.trim()) {
            finalContent = parsed.content;
            finalTitle = parsed.title || title;
            finalDuration = parsed.estimatedDuration || finalDuration;
            finalStructure = Array.isArray(parsed.structure) ? parsed.structure : [];
          }
        } catch (e) { logger.trackSwallowedError('ScriptWriterTab:parseGeneratedScript', e); /* JSON 파싱 실패 시 plain text 사용 */ }
      }

      setGeneratedScript({
        title: finalTitle,
        content: finalContent,
        charCount: finalContent.length,
        estimatedDuration: finalDuration,
        structure: finalStructure.length > 0 ? finalStructure : ['도입부', '전개', '클라이맥스', '결말'],
      });
      setFinalScript(finalContent);
      setStreamingText('');
    } catch (e: unknown) {
      if (abortCtrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        setGenError('');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setGenError(`대본 생성 실패: ${msg}`);
      }
      setStreamingText('');
    } finally {
      genAbortRef.current = null;
      finishGeneration();
    }
  }, [title, synopsis, targetCharCount, contentFormat, shortsSeconds, instinctIds, channelGuideline, channelScripts, benchmarkScript, referenceComments,
    selectedTopic, selectedStyleId, allStylePresets, startGeneration, finishGeneration, setGeneratedScript, setFinalScript, scriptAiModel, targetRegion]);

  const handleCancelGeneration = useCallback(() => {
    genAbortRef.current?.abort();
    genAbortRef.current = null;
  }, []);

  const handleApplySelectedStyle = useCallback(async () => {
    if (!requireAuth('AI 스타일 적용')) return;
    if (!selectedStyleId) return;
    const preset = allStylePresets.find(p => p.id === selectedStyleId);
    if (!preset) return;
    const currentScript = generatedScript?.content || manualText || '';
    if (!currentScript.trim()) return;
    setApplyingStyle(preset.id);
    setStyleError('');
    try {
      // [FIX #120] 프리셋 지침의 하드코딩 분량을 사용자 설정값으로 동적 교체
      const charCountOverride = `\n\n[분량 지시] 반드시 공백 제외 ${targetCharCount}자 이상의 대본을 작성하십시오. 지정된 분량보다 짧으면 Layer 확장 법칙을 적용하여 채우십시오.`;
      const sysContent = `${preset.systemPrompt}${charCountOverride}\n\n[중요 지시] 사용자가 제공한 대본을 위 스타일 지침서에 맞게 재작성하십시오. 대본의 핵심 내용과 주제는 유지하되, 문체/어미/톤/구조를 지침서에 맞게 완전히 변환하십시오. 순수 대본 텍스트만 출력하십시오.`;
      const usrContent = `다음 대본을 '${preset.name}' 스타일로 재작성하세요 (목표: ${targetCharCount}자 이상):\n\n${currentScript}`;
      const maxTok = Math.min(32000, Math.max(8000, Math.ceil(currentScript.length * 2)));
      let content = '';
      if (scriptAiModel !== ScriptAiModel.GEMINI_PRO) {
        // Claude: 스트리밍 API 사용 (스타일 변환도 선택된 모델 적용)
        content = await scriptGenerationStream(sysContent, usrContent, () => {}, {
          model: scriptAiModel, temperature: 0.7, maxOutputTokens: maxTok,
        });
      } else {
        const res = await evolinkChat(
          [{ role: 'system', content: sysContent }, { role: 'user', content: usrContent }],
          { temperature: 0.7, maxTokens: maxTok, timeoutMs: 120_000 }
        );
        content = res.choices?.[0]?.message?.content || '';
      }
      if (!content.trim()) throw new Error('스타일 변환 결과가 비어있습니다. 다시 시도해주세요.');
      setStyledScript(content, preset.name);
      setFinalScript(content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStyleError(`스타일 적용 실패: ${msg}`);
    } finally {
      setApplyingStyle(null);
    }
  }, [selectedStyleId, generatedScript, manualText, title, setStyledScript, setFinalScript, allStylePresets, scriptAiModel, targetCharCount]);

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

        {/* ═══════════════════════════════════════
             STEP 1: 소재 정하기
        ═══════════════════════════════════════ */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">1</span>
            <span className="text-sm font-bold text-white">소재 정하기</span>
            {(selectedTopicFromStore || (title.trim() && synopsis.trim())) && (
              <span className="text-xs px-2 py-0.5 bg-green-900/40 text-green-400 rounded-full border border-green-500/30 font-semibold">완료</span>
            )}
          </div>

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

          {/* 선택된 AI 소재 표시 */}
          {selectedTopicFromStore && (
            <div className="mb-4 bg-violet-900/15 border border-violet-500/25 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-violet-400 text-sm font-bold">선택된 소재</span>
              <span className="text-sm text-gray-200 truncate flex-1">{selectedTopicFromStore.title}</span>
              <button
                type="button"
                onClick={() => { useInstinctStore.getState().selectTopic(''); setTitle(''); setSynopsis(''); }}
                className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
              >초기화</button>
            </div>
          )}

          {/* 두 가지 경로: A. AI 추천 / B. 직접 입력 */}
          {!selectedTopicFromStore && !(title.trim() && synopsis.trim()) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* A. AI 추천 */}
              <button
                type="button"
                onClick={() => { setShowAiHelper(true); setShowManualInput(false); }}
                className={`relative flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 transition-all ${
                  showAiHelper && !showManualInput
                    ? 'bg-violet-600/15 border-violet-500/60 text-violet-300 shadow-lg shadow-violet-900/20'
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-violet-500/40 hover:text-violet-300'
                }`}
              >
                <span className="text-2xl">🔍</span>
                <span className="text-sm font-bold">AI가 추천해줘</span>
                <span className="text-xs text-gray-500">주제가 없어도 OK</span>
              </button>
              {/* B. 직접 입력 */}
              <button
                type="button"
                onClick={() => { setShowManualInput(true); setShowAiHelper(false); }}
                className={`relative flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 transition-all ${
                  showManualInput && !showAiHelper
                    ? 'bg-gray-700/40 border-gray-500/60 text-gray-200 shadow-lg'
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="text-2xl">✏️</span>
                <span className="text-sm font-bold">직접 입력할게</span>
                <span className="text-xs text-gray-500">제목 + 줄거리</span>
              </button>
            </div>
          )}

          {/* A 경로: AI 소재 추천 패널 */}
          {showAiHelper && !showManualInput && !selectedTopicFromStore && !(title.trim() && synopsis.trim()) && (
            <div className="space-y-3 bg-gray-800/20 rounded-xl border border-violet-500/20 p-4">
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

              {/* 고급 옵션 (접힘형) */}
              <details className="group">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 transition-colors list-none flex items-center gap-1">
                  <span className="text-gray-600 group-open:rotate-90 transition-transform">▶</span>
                  고급: 본능 기제 / 벤치마크로 정교한 추천
                </summary>
                <div className="mt-3 flex gap-2 flex-wrap">
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
              </details>
            </div>
          )}

          {/* B 경로: 직접 입력 패널 */}
          {(showManualInput || (title.trim() && synopsis.trim() && !selectedTopicFromStore)) && (
            <div className="space-y-3 bg-gray-800/20 rounded-xl border border-gray-700/30 p-4">
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

        {/* ═══════════════════════════════════════
             STEP 2: 스타일 + 옵션
        ═══════════════════════════════════════ */}
        <div className="px-6 py-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-white">2</span>
            <span className="text-sm font-bold text-white">스타일 선택</span>
            <span className="text-xs text-gray-500">(선택사항)</span>
          </div>

          {/* 채널 스타일 */}
          {channelGuideline && (
            <div className="mb-3">
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
                  <p className="text-[10px] text-gray-600 mb-1">클릭하여 직접 수정할 수 있습니다</p>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">말투</span>
                    <textarea
                      value={channelGuideline.tone}
                      onChange={(e) => setChannelGuideline({ ...channelGuideline, tone: e.target.value })}
                      rows={2}
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm resize-none focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">구조</span>
                    <textarea
                      value={channelGuideline.structure}
                      onChange={(e) => setChannelGuideline({ ...channelGuideline, structure: e.target.value })}
                      rows={2}
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm resize-none focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">도입 패턴</span>
                    <textarea
                      value={channelGuideline.hookPattern}
                      onChange={(e) => setChannelGuideline({ ...channelGuideline, hookPattern: e.target.value })}
                      rows={2}
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm resize-none focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0 w-16">마무리</span>
                    <textarea
                      value={channelGuideline.closingPattern}
                      onChange={(e) => setChannelGuideline({ ...channelGuideline, closingPattern: e.target.value })}
                      rows={2}
                      className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm resize-none focus:outline-none focus:border-orange-500/50"
                    />
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
                </div>
              )}
            </div>
          )}

          {/* 스타일 선택 */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SCRIPT_STYLE_PRESETS.map(preset => {
              const isSelected = selectedStyleId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedStyleId(isSelected ? null : preset.id)}
                  disabled={!!applyingStyle}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-lg border text-center transition-all ${
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

          {/* #158: 영상분석에서 가져온 스타일 프리셋 */}
          {videoAnalysisStyles.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-blue-400 font-bold flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                영상분석 스타일
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {videoAnalysisStyles.map(va => {
                  const isSelected = selectedStyleId === va.id;
                  return (
                    <button
                      key={va.id}
                      type="button"
                      onClick={() => setSelectedStyleId(isSelected ? null : va.id)}
                      disabled={!!applyingStyle}
                      className={`relative group/va flex-shrink-0 flex flex-col items-center justify-center gap-0.5 py-2.5 px-4 rounded-lg border text-center transition-all min-w-[120px] ${
                        isSelected
                          ? 'bg-blue-600/30 border-blue-400 text-white'
                          : 'bg-gray-800/70 border-blue-500/30 text-gray-300 hover:border-blue-400/60 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{va.icon}</span>
                        <span className="text-sm font-bold truncate">{va.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 leading-tight truncate max-w-[140px]">{va.description}</span>
                      {/* 삭제 버튼 */}
                      <span
                        onClick={(e) => { e.stopPropagation(); removeVideoAnalysisStyle(va.id); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 border border-gray-600 text-gray-400 hover:bg-red-600 hover:text-white hover:border-red-500 flex items-center justify-center text-[10px] opacity-0 group-hover/va:opacity-100 transition-all cursor-pointer"
                        title="스타일 제거"
                      >
                        ✕
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════
             STEP 3: 생성
        ═══════════════════════════════════════ */}
        <div className="px-6 py-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${canGenerate ? 'bg-violet-600' : 'bg-gray-600'}`}>3</span>
            <span className="text-sm font-bold text-white">대본 생성</span>
          </div>

          {/* AI 모델 선택 + 실시간 가격 */}
          {(() => {
            const selectedModel = SCRIPT_AI_MODELS.find(m => m.id === scriptAiModel) || SCRIPT_AI_MODELS[0];
            // 실시간 예상 비용: 입력(시스템+사용자 프롬프트 ~2000자) + 출력(targetCharCount)
            const estInputTokens = 2000; // 프롬프트 평균 추정
            const estOutputTokens = Math.ceil(targetCharCount / 4);
            const estCost = (estInputTokens / 1_000_000 * selectedModel.inputPer1M) + (estOutputTokens / 1_000_000 * selectedModel.outputPer1M);
            return (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-400 flex-shrink-0">AI 모델</span>
                  <span className="text-xs text-gray-600">|</span>
                  <span className="text-xs text-cyan-400/80 font-medium">
                    예상 비용: ${estCost.toFixed(3)} ({targetCharCount.toLocaleString()}자 기준)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SCRIPT_AI_MODELS.map((m) => {
                    const isActive = scriptAiModel === m.id;
                    const colorMap: Record<string, { active: string; border: string; text: string; badge: string }> = {
                      emerald: { active: 'bg-emerald-600/20', border: 'border-emerald-500/50', text: 'text-emerald-400', badge: 'bg-emerald-900/40 text-emerald-300' },
                      violet: { active: 'bg-violet-600/20', border: 'border-violet-500/50', text: 'text-violet-400', badge: 'bg-violet-900/40 text-violet-300' },
                      amber: { active: 'bg-amber-600/20', border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-900/40 text-amber-300' },
                    };
                    const c = colorMap[m.color] || colorMap.emerald;
                    const perScript = (estInputTokens / 1_000_000 * m.inputPer1M) + (estOutputTokens / 1_000_000 * m.outputPer1M);
                    return (
                      <button key={m.id} type="button"
                        onClick={() => setScriptAiModel(m.id)}
                        className={`relative rounded-xl px-3 py-2.5 text-left transition-all border
                          ${isActive
                            ? `${c.active} ${c.border} shadow-md`
                            : 'bg-gray-800/60 border-gray-700/40 hover:border-gray-600'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <AiModelLogo model={m.id} size={18} />
                          <span className={`text-sm font-bold ${isActive ? c.text : 'text-gray-300'}`}>{m.label}</span>
                        </div>
                        <p className={`text-xs leading-relaxed ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>{m.description}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isActive ? c.badge : 'bg-gray-800 text-gray-500'}`}>
                            ${perScript.toFixed(3)}/편
                          </span>
                          {m.hasWebSearch && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
                              웹검색
                            </span>
                          )}
                        </div>
                        {isActive && (
                          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${m.color === 'emerald' ? 'bg-emerald-400' : m.color === 'violet' ? 'bg-violet-400' : 'bg-amber-400'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* 선택 모델 상세 안내 */}
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs leading-relaxed border
                  ${scriptAiModel === ScriptAiModel.GEMINI_PRO ? 'bg-emerald-900/10 border-emerald-700/20 text-emerald-300/80' :
                    scriptAiModel === ScriptAiModel.CLAUDE_SONNET ? 'bg-violet-900/10 border-violet-700/20 text-violet-300/80' :
                    'bg-amber-900/10 border-amber-700/20 text-amber-300/80'}`}>
                  <span className="inline-flex items-center gap-1"><AiModelLogo model={selectedModel.id} size={14} /> <span className="font-semibold">{selectedModel.label}</span></span> — {selectedModel.detail}
                  {!selectedModel.hasWebSearch && (
                    <span className="ml-1 text-gray-500">(웹 검색 미지원 — 최신 트렌드 반영이 필요하면 Gemini 추천)</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 콘텐츠 형식 선택: 롱폼 / 쇼츠 */}
          <div className="mb-3 flex items-center gap-3">
            <span className="text-sm text-gray-400 flex-shrink-0">형식</span>
            <div className="flex gap-2">
              {([['long', '롱폼', 'bg-blue-600'], ['shorts', '쇼츠', 'bg-emerald-600']] as [ContentFormat, string, string][]).map(([val, label, color]) => (
                <button key={val} type="button"
                  onClick={() => {
                    setContentFormat(val);
                    if (val === 'shorts') {
                      setTargetCharCount(Math.min(targetCharCount, 500));
                    } else if (val === 'long' && targetCharCount <= 500) {
                      setTargetCharCount(5000);
                    }
                  }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all
                    ${contentFormat === val
                      ? `${color} text-white border-transparent shadow-md`
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
            {contentFormat === 'shorts' ? (
              <div className="flex items-center gap-2 ml-2">
                <select
                  value={shortsSeconds}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    setShortsSeconds(sec);
                    setTargetCharCount(Math.round((sec / 60) * 650));
                  }}
                  className="bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700
                    px-2 py-1.5 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value={15}>15초</option>
                  <option value={30}>30초</option>
                  <option value={45}>45초</option>
                  <option value={60}>60초</option>
                </select>
                <span className="text-xs text-emerald-400/70">세로 영상</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <select
                  value={Math.round(targetCharCount / 650)}
                  onChange={(e) => {
                    const min = Number(e.target.value);
                    setTargetCharCount(min * 650);
                  }}
                  className="bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700
                    px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
                >
                  <option value={5}>5분</option>
                  <option value={8}>8분</option>
                  <option value={10}>10분</option>
                  <option value={13}>13분</option>
                  <option value={15}>15분</option>
                  <option value={20}>20분</option>
                  <option value={23}>23분</option>
                  <option value={25}>25분</option>
                  <option value={30}>30분</option>
                </select>
              </div>
            )}
          </div>

          {/* [#294] 타겟 지역 선택 */}
          <div className="mb-3 flex items-center gap-3">
            <span className="text-sm text-gray-400 flex-shrink-0">🌍 타겟</span>
            <select
              value={targetRegion}
              onChange={(e) => setTargetRegion(e.target.value as ScriptTargetRegion)}
              className="bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700
                px-3 py-1.5 focus:outline-none focus:border-violet-500/50 min-w-[140px]"
            >
              {SCRIPT_TARGET_REGIONS.map(r => (
                <option key={r.id} value={r.id}>{r.flag} {r.label} ({r.lang})</option>
              ))}
            </select>
            {targetRegion !== 'ko' && (() => {
              const info = SCRIPT_TARGET_REGIONS.find(r => r.id === targetRegion);
              return info ? (
                <span className="text-xs text-cyan-400/80 font-medium">
                  {info.lang}로 작성 · {info.label} 자료 기반
                </span>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-3 bg-gray-800/40 rounded-xl px-4 py-3 border border-gray-700/40">
            <span className="text-sm text-gray-400 flex-shrink-0">📏</span>
            <input type="number"
              min={contentFormat === 'shorts' ? 100 : 350}
              max={contentFormat === 'shorts' ? 1000 : 30000}
              step={contentFormat === 'shorts' ? 25 : 50}
              value={targetCharInput}
              onChange={(e) => setTargetCharInput(e.target.value)}
              onBlur={() => {
                const lo = contentFormat === 'shorts' ? 100 : 350;
                const hi = contentFormat === 'shorts' ? 1000 : 30000;
                const v = Math.max(lo, Math.min(hi, Number(targetCharInput) || lo));
                setTargetCharCount(v);
                setTargetCharInput(String(v));
              }}
              className="w-[80px] px-2 py-1.5 rounded-md bg-gray-900/60 text-gray-200 text-sm text-center
                border border-gray-700 focus:outline-none focus:border-violet-500/50" />
            <span className="text-sm text-gray-500">자</span>
            <span className="text-sm text-cyan-400 font-medium whitespace-nowrap">{estimateTime(targetCharCount)}</span>

            <div className="flex-1" />

            {isGenerating ? (
              <button
                type="button"
                onClick={handleCancelGeneration}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600
                  hover:from-red-500 hover:to-rose-500
                  text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap
                  shadow-lg shadow-red-900/30"
              >
                <span className="animate-spin inline-block mr-1">⟳</span> 중지 {elapsedGenerate > 0 && <span className="text-xs text-red-200/70 tabular-nums">{formatElapsed(elapsedGenerate)}</span>}
              </button>
            ) : (
              <button
                type="button"
                onClick={selectedTopicFromStore ? () => handleGenerateFromTopic(selectedTopicFromStore) : handleGenerateScript}
                disabled={!canGenerate}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
                  hover:from-blue-500 hover:to-violet-500 disabled:opacity-30 disabled:cursor-not-allowed
                  text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap
                  shadow-lg shadow-violet-900/30"
              >
                🚀 {scriptAiModel === ScriptAiModel.GEMINI_PRO ? 'AI 대본 생성' : scriptAiModel === ScriptAiModel.CLAUDE_SONNET ? 'Sonnet 대본 생성' : 'Opus 대본 생성'}
              </button>
            )}
          </div>

          {/* 동적 안내 */}
          <div className="mt-2 flex items-center gap-2 flex-wrap min-h-[24px]">
            {!canGenerate && !isGenerating && (
              <span className="text-sm text-amber-400/80">
                {selectedTopicFromStore ? '' : 'STEP 1에서 소재를 선택하거나 직접 입력하세요'}
              </span>
            )}
            {canGenerate && (
              <>
                <span className="text-xs text-gray-500">적용 중:</span>
                {scriptAiModel !== ScriptAiModel.GEMINI_PRO && (
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${scriptAiModel === ScriptAiModel.CLAUDE_SONNET ? 'text-violet-300 bg-violet-900/30' : 'text-amber-300 bg-amber-900/30'}`}>
                    <AiModelLogo model={scriptAiModel} size={12} /> {scriptAiModel === ScriptAiModel.CLAUDE_SONNET ? 'Sonnet 4.6' : 'Opus 4.6'}
                  </span>
                )}
                {instinctIds.length > 0 && <span className="text-xs text-violet-300 bg-violet-900/30 px-1.5 py-0.5 rounded">🧠 본능 {instinctIds.length}개</span>}
                {benchmarkScript && <span className="text-xs text-green-300 bg-green-900/30 px-1.5 py-0.5 rounded">📊 벤치마크</span>}
                {channelGuideline && <span className="text-xs text-orange-300 bg-orange-900/30 px-1.5 py-0.5 rounded">📡 {channelGuideline.channelName}</span>}
              </>
            )}
            {selectedStyleId && !guidanceText && (
              <span className="text-xs text-violet-300 bg-violet-900/30 px-1.5 py-0.5 rounded">
                {allStylePresets.find(p => p.id === selectedStyleId)?.icon} {allStylePresets.find(p => p.id === selectedStyleId)?.name}
              </span>
            )}
          </div>

          {genError && <p className="text-sm text-red-400 mt-2">{genError}</p>}
          {styleError && <p className="text-sm text-red-400 mt-2">{styleError}</p>}

          {/* 기존 대본에 스타일 변환 */}
          {selectedStyleId && scriptText.trim() && !styledScript && (
            <div className="mt-3 px-4 py-2.5 bg-violet-900/10 border border-violet-600/20 rounded-lg flex items-center justify-between">
              <span className="text-sm text-violet-300/80 font-medium">
                입력된 대본에 <span className="text-violet-200 font-bold">{allStylePresets.find(p => p.id === selectedStyleId)?.icon} {allStylePresets.find(p => p.id === selectedStyleId)?.name}</span> 스타일 적용
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
        <div ref={scriptSectionRef} className="px-6 py-4 border-b border-gray-700/30">

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
                    title="이 스타일 적용본을 사운드 스튜디오(TTS)와 이미지/영상 탭에서 사용할 최종 대본으로 지정합니다"
                    className={`text-xs px-2 py-0.5 rounded border transition-all ${
                      finalScript === styledScript
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 font-bold'
                        : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {finalScript === styledScript ? '✓ 최종 대본으로 선택됨' : '최종 대본으로 선택'}
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

        {/* ═══ D. 단락 나누기 ═══ */}
        <div className="px-6 py-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-gray-300">📝 단락 나누기</span>
            {estimatedScenes > 0 && (
              <span className="text-sm font-bold text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-700/40">
                예상 약 {estimatedScenes}단락
              </span>
            )}
            <span className="text-xs text-gray-500">이미지/영상 탭에서 이 단락을 확인 후 장면 분석이 진행됩니다</span>
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
            단락 나누기는 대본의 구조를 정리합니다. 이미지/영상 탭에서 이 단락을 확인한 후 AI가 비주얼 프롬프트를 생성합니다.
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
              <span className="text-xs text-yellow-400/70">예상치 — 이미지/영상 탭에서 확인 후 장면 분석이 진행됩니다</span>
            )}
          </button>

          {showSplitGuide && (
            <div className="mt-2">
              {livePreviewData.scenes.length > 0 ? (
                <div className="bg-gray-800/30 rounded-xl border border-blue-700/20 overflow-hidden">
                  <div className="px-3 py-2 bg-blue-900/15 border-b border-blue-700/15">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-300">단락 미리보기</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-600/20 font-medium">로컬 추정</span>
                        <button type="button" onClick={handleDownloadSegmentsSrt}
                          className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-800/40 transition-colors font-bold"
                          title="단락을 SRT 자막 파일로 내보내기">
                          SRT
                        </button>
                      </div>
                      <span className="text-xs text-yellow-300/70 font-medium">이미지/영상 탭에서 이 단락을 확인 후 장면이 생성됩니다</span>
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

          {/* 단락 페이싱 분석 차트 */}
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
          <div className={`grid gap-2 ${isAnalyzingScenes ? '' : 'grid-cols-3'}`}>
            <button
              type="button"
              onClick={handleSceneAnalysis}
              disabled={!displayScript || isAnalyzingScenes}
              className={`relative overflow-hidden rounded-xl text-sm font-bold shadow-lg transition-all ${
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
                    <span>AI가 단락을 분석하고 있습니다... ({scriptText.length.toLocaleString()}자)</span>
                    <span className="font-black text-lg text-white drop-shadow-md">{analysisProgress}%</span>
                    {elapsedAnalysis > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedAnalysis)}</span>}
                  </>
                ) : (
                  <>📝 단락 나누기</>
                )}
              </div>
            </button>

            {!isAnalyzingScenes && (
              <>
                <button
                  type="button"
                  onClick={handleGoToSoundStudio}
                  disabled={!displayScript.trim()}
                  className="bg-gradient-to-r from-fuchsia-600 to-violet-600
                    hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-25 disabled:cursor-not-allowed
                    text-white rounded-xl text-sm font-bold border border-fuchsia-400/30 shadow-lg shadow-fuchsia-900/20
                    py-3.5 flex items-center justify-center gap-2 transition-all"
                >
                  🎙 사운드 →
                </button>

                <button
                  type="button"
                  onClick={handleGoToImageVideo}
                  disabled={!displayScript.trim()}
                  className="bg-gradient-to-r from-orange-600 to-amber-600
                    hover:from-orange-500 hover:to-amber-500 disabled:opacity-25 disabled:cursor-not-allowed
                    text-white rounded-xl text-sm font-bold border border-orange-400/30 shadow-lg shadow-orange-900/20
                    py-3.5 flex items-center justify-center gap-2 transition-all"
                >
                  🎬 이미지/영상 →
                </button>
              </>
            )}
          </div>

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
