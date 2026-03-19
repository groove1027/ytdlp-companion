import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useProjectStore, autoRestoreOrCreateProject } from '../../../stores/projectStore';
import { useCostStore } from '../../../stores/costStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { analyzeScriptContext, parseScriptToScenes, countScenesLocally, splitScenesLocally } from '../../../services/gemini/scriptAnalysis';
import { analyzeCharacterImage } from '../../../services/characterAnalysisService';
import { persistImage } from '../../../services/imageStorageService';
// import { removeBackground } from '../../../services/removeBgService';
import { PRICING, DIALOGUE_TONE_PRESETS } from '../../../constants';
import { VideoFormat, CharacterAppearance, AspectRatio, DialogueTone } from '../../../types';
import type { CharacterReference, SavedCharacter, Scene } from '../../../types';
import VisualStylePicker, { getVisualStyleLabel } from '../../VisualStylePicker';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';
import CharacterUploadPanel from '../../CharacterUploadPanel';
import CharacterLibraryModal from '../../CharacterLibraryModal';
import { saveCharacterToLibrary } from '../../../services/storageService';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { areUploadedTranscriptScenesSynced, buildUploadedTranscriptScenes } from '../../../utils/uploadedTranscriptScenes';
import GoogleReferencePanel from './GoogleReferencePanel';

let _sceneIdCounter = 0;

/* ── [#391] Style Reference Image Upload ── */
const MAX_STYLE_REF_IMAGES = 3;
const StyleReferenceUpload: React.FC<{
  images: string[];
  onAdd: (img: string) => void;
  onRemove: (index: number) => void;
}> = ({ images, onAdd, onRemove }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_STYLE_REF_IMAGES - images.length;
    if (remaining <= 0) { showToast(`최대 ${MAX_STYLE_REF_IMAGES}장까지 업로드할 수 있어요.`); return; }
    const toProcess = Array.from(files).slice(0, remaining);
    toProcess.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === 'string') onAdd(reader.result); };
      reader.readAsDataURL(file);
    });
  }, [images.length, onAdd]);

  return (
    <div className="bg-gray-900/60 border border-orange-500/20 rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🖼️</span>
          <span className="text-sm font-bold text-orange-300">이미지 레퍼런스</span>
          <span className="text-xs text-gray-500">(선택, 최대 {MAX_STYLE_REF_IMAGES}장)</span>
        </div>
        {images.length > 0 && (
          <span className="text-xs text-orange-400 bg-orange-900/30 border border-orange-500/30 px-2 py-0.5 rounded-lg font-bold">
            {images.length}장
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        벤치마킹 채널이나 원하는 스타일의 이미지를 업로드하면, <b className="text-orange-300">모든 장면의 이미지 생성 시 AI가 화풍·구도·색감을 참고</b>합니다.
      </p>

      {/* 이미지 미리보기 */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group/sref w-20 h-20 rounded-lg overflow-hidden border border-orange-500/40">
              <img src={img} alt={`Style ref ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover/sref:opacity-100 transition-opacity z-10"
                title="제거"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 업로드 영역 */}
      {images.length < MAX_STYLE_REF_IMAGES && (
        <div
          className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-orange-400 bg-orange-500/10'
              : 'border-gray-600 hover:border-orange-500/50 hover:bg-gray-800/50'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-2xl text-gray-500">{isDragOver ? '📥' : '🖼️'}</span>
            <p className="text-sm text-gray-400 font-medium">
              {isDragOver ? '놓으면 추가됩니다!' : '클릭 또는 드래그하여 레퍼런스 이미지 추가'}
            </p>
            <p className="text-[11px] text-gray-600">PNG, JPG, WebP (최대 {MAX_STYLE_REF_IMAGES}장)</p>
          </div>
        </div>
      )}
      <input
        type="file"
        ref={fileRef}
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
};

/* ── Toggle Switch ── */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)}
    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-500' : 'bg-gray-600'}`}>
    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${checked ? 'left-[26px]' : 'left-0.5'}`} />
  </button>
);

/* ── Constants ── */
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
const LONG_SPLIT: Record<'DEFAULT' | 'DETAILED' | 'ECONOMY', { label: string; desc: string }> = {
  ECONOMY: { label: '절약 중심', desc: '4~6문장 → 1장면 (최소 컷, 비용 절약)' },
  DEFAULT: { label: '호흡 중심', desc: '2~3문장 → 1장면 (적은 컷, 강의/설명)' },
  DETAILED: { label: '디테일 중심', desc: '1문장 → 1장면 (많은 컷, 다큐/사연)' },
};
const RATIO = [
  { value: AspectRatio.LANDSCAPE, label: '16:9', desc: '가로형/유튜브' },
  { value: AspectRatio.PORTRAIT, label: '9:16', desc: '세로형/쇼츠' },
  { value: AspectRatio.SQUARE, label: '1:1', desc: '정사각형/인스타' },
];
const CHAR_FREQ = [
  { value: CharacterAppearance.AUTO, label: '자동 (AI)' },
  { value: CharacterAppearance.ALWAYS, label: '항상 (진행자)' },
  { value: CharacterAppearance.MINIMAL, label: '최소화 (B-Roll)' },
  { value: CharacterAppearance.NONE, label: '출연 안함' },
];

/** 한국어 나레이션 기준 약 650자/분 */
function estimateTime(chars: number): string {
  const totalSec = Math.round((chars / 650) * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `약 ${s}초`;
  if (s === 0) return `약 ${m}분`;
  return `약 ${m}분 ${s}초`;
}

function formatNarrationDuration(sec: number): string {
  const rounded = Math.max(0, Math.round(sec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

function computeSceneDurationSec(scenes: Scene[]): number | null {
  const timedEnds = scenes
    .map((scene) => {
      if (scene.endTime != null && scene.endTime > 0) return scene.endTime;
      if (scene.startTime != null && scene.audioDuration != null && scene.audioDuration > 0) {
        return scene.startTime + scene.audioDuration;
      }
      return null;
    })
    .filter((value): value is number => value != null);

  if (timedEnds.length > 0) {
    return Math.max(...timedEnds);
  }

  const summed = scenes.reduce((total, scene) => total + (scene.audioDuration || 0), 0);
  return summed > 0 ? summed : null;
}

function mergeSceneAnalysis(base: Scene, ai?: Scene): Scene {
  if (!ai) return base;
  return {
    ...base,
    visualPrompt: ai.visualPrompt || base.visualPrompt,
    visualDescriptionKO: ai.visualDescriptionKO || base.visualDescriptionKO,
    characterPresent: ai.characterPresent ?? base.characterPresent,
    castType: ai.castType || base.castType,
    cameraAngle: ai.cameraAngle || base.cameraAngle,
    cameraMovement: ai.cameraMovement || base.cameraMovement,
    shotSize: ai.shotSize || base.shotSize,
    isInfographic: ai.isInfographic ?? base.isInfographic,
    sceneLocation: ai.sceneLocation || base.sceneLocation,
    sceneEra: ai.sceneEra || base.sceneEra,
    sceneCulture: ai.sceneCulture || base.sceneCulture,
    characterAction: ai.characterAction || base.characterAction,
    entityName: ai.entityName || base.entityName,
    entityComposition: ai.entityComposition || base.entityComposition,
    generatedDialogue: ai.generatedDialogue || base.generatedDialogue,
    dialogueSpeaker: ai.dialogueSpeaker || base.dialogueSpeaker,
    dialogueEmotion: ai.dialogueEmotion || base.dialogueEmotion,
    dialogueSfx: ai.dialogueSfx || base.dialogueSfx,
    emotionalBeat: ai.emotionalBeat || base.emotionalBeat,
  };
}

const SetupPanel: React.FC = () => {
  const config = useProjectStore((s) => s.config);
  const setConfig = useProjectStore((s) => s.setConfig);
  const scenes = useProjectStore((s) => s.scenes);
  const addCost = useCostStore((s) => s.addCost);
  const style = useImageVideoStore((s) => s.style);
  const setStyle = useImageVideoStore((s) => s.setStyle);
  const characters = useImageVideoStore((s) => s.characters);
  const setCharacters = useImageVideoStore((s) => s.setCharacters);
  const setActiveSubTab = useImageVideoStore((s) => s.setActiveSubTab);
  const enableWebSearch = useImageVideoStore((s) => s.enableWebSearch);
  const setEnableWebSearch = useImageVideoStore((s) => s.setEnableWebSearch);
  const isMultiCharacter = useImageVideoStore((s) => s.isMultiCharacter);
  const setIsMultiCharacter = useImageVideoStore((s) => s.setIsMultiCharacter);
  const dialogueMode = useImageVideoStore((s) => s.dialogueMode);
  const setDialogueMode = useImageVideoStore((s) => s.setDialogueMode);
  const dialogueTone = useImageVideoStore((s) => s.dialogueTone);
  const setDialogueTone = useImageVideoStore((s) => s.setDialogueTone);
  const referenceDialogue = useImageVideoStore((s) => s.referenceDialogue);
  const setReferenceDialogue = useImageVideoStore((s) => s.setReferenceDialogue);
  const customStyleNote = useImageVideoStore((s) => s.customStyleNote);
  const setCustomStyleNote = useImageVideoStore((s) => s.setCustomStyleNote);
  const targetSceneCount = useImageVideoStore((s) => s.targetSceneCount);
  const setTargetSceneCount = useImageVideoStore((s) => s.setTargetSceneCount);
  const styleReferenceImages = useImageVideoStore((s) => s.styleReferenceImages);

  const [directInputMode, setDirectInputMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [chunkProgress, setChunkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [showCharacterLibrary, setShowCharacterLibrary] = useState(false);
  const [scriptDraft, setScriptDraft] = useState('');
  const [showSplitGuide, setShowSplitGuide] = useState(false);
  const [importedSplitResult, setImportedSplitResult] = useState<string[]>([]);
  const [showImportedSplit, setShowImportedSplit] = useState(true);
  const elapsed = useElapsedTimer(isAnalyzing);
  const { requireAuth } = useAuthGuard();

  useEffect(() => { if (!config) autoRestoreOrCreateProject(); }, [config]);

  // 대본작성 탭에서 단락 분석 결과가 있으면 자동 이어받기
  // [FIX #160] splitResult 변경을 구독하여 탭 전환 후에도 확실히 반영
  const scriptWriterSplitResult = useScriptWriterStore((s) => s.splitResult);
  useEffect(() => {
    if (scriptWriterSplitResult.length > 0) {
      setImportedSplitResult(scriptWriterSplitResult);
      setShowImportedSplit(true);
    }
  }, [scriptWriterSplitResult]);

  const hasAudioScenes = scenes.length > 0 && scenes.some(s => !!s.audioUrl);
  const totalScenes = scenes.length;
  const scriptLen = config?.script?.length || 0;

  // 글자수 기반 예상 컷수 + 단락 미리보기
  const scriptText = config?.script || '';
  const vf = config?.videoFormat || VideoFormat.SHORT;
  const ss = config?.smartSplit ?? true;
  const lfs = config?.longFormSplitType;
  const uploadedTranscriptScenes = useMemo(
    () => buildUploadedTranscriptScenes(config, targetSceneCount),
    [config, targetSceneCount],
  );
  const uploadedScenesNeedRegroup = useMemo(
    () => !!uploadedTranscriptScenes && !areUploadedTranscriptScenesSynced(scenes, uploadedTranscriptScenes),
    [scenes, uploadedTranscriptScenes],
  );
  const actualNarrationDuration = useMemo(() => {
    if (config?.sourceNarrationDurationSec && config.sourceNarrationDurationSec > 0) {
      return config.sourceNarrationDurationSec;
    }
    if (config?.transcriptDurationSec && config.transcriptDurationSec > 0) {
      return config.transcriptDurationSec;
    }
    return computeSceneDurationSec(scenes);
  }, [config?.sourceNarrationDurationSec, config?.transcriptDurationSec, scenes]);
  const durationLabel = actualNarrationDuration != null
    ? formatNarrationDuration(actualNarrationDuration)
    : estimateTime(scriptText.length);
  const durationMismatchSec = useMemo(() => {
    if (!config?.sourceNarrationDurationSec || !config?.transcriptDurationSec) return 0;
    return Math.abs(config.sourceNarrationDurationSec - config.transcriptDurationSec);
  }, [config?.sourceNarrationDurationSec, config?.transcriptDurationSec]);

  const estimatedScenes = useMemo(() => {
    if (!scriptText.trim()) return 0;
    return countScenesLocally(scriptText, vf, ss, vf === VideoFormat.LONG ? lfs : undefined);
  }, [scriptText, vf, ss, lfs]);

  const livePreviewData = useMemo(() => {
    if (!scriptText.trim()) return { original: '', scenes: [] as string[] };
    const paragraphs = scriptText.split(/\n+/).filter(p => p.trim());
    if (paragraphs.length === 0) return { original: '', scenes: [] as string[] };
    // 문장이 2개 이상인 단락 우선 선택 (모드 차이가 드러남)
    const SENT_RE = /[.!?。！？]\s*/;
    const multiSent = paragraphs
      .filter(p => p.split(SENT_RE).filter(s => s.trim()).length >= 2)
      .sort((a, b) => b.length - a.length);
    const best = multiSent[0] || paragraphs.reduce((a, b) => a.length >= b.length ? a : b, '');
    const localScenes = splitScenesLocally(best, vf, ss, vf === VideoFormat.LONG ? lfs : undefined);
    return { original: best, scenes: localScenes };
  }, [scriptText, vf, ss, lfs]);
  const selectedLabel = getVisualStyleLabel(style);
  const stepBase = directInputMode ? 3 : 1;

  // [#195] 채널 레퍼런스 스타일 — 채널 분석 결과에서 시각 스타일 가져오기
  const channelGuideline = useChannelAnalysisStore((s) => s.channelGuideline);
  const savedPresets = useChannelAnalysisStore((s) => s.savedPresets);
  const [showPresetList, setShowPresetList] = useState(false);
  // 현재 적용된 채널 스타일 이름 역추적
  const appliedChannelName = useMemo(() => {
    if (style === 'custom' || selectedLabel) return '';
    if (channelGuideline?.visualGuide && style === channelGuideline.visualGuide) return channelGuideline.channelName;
    const matched = savedPresets.find(p => p.visualGuide && style === p.visualGuide);
    return matched?.channelName || '';
  }, [style, selectedLabel, channelGuideline, savedPresets]);
  const channelPresetsWithVisual = useMemo(() =>
    savedPresets.filter(p => p.visualGuide && p.visualGuide.trim()),
  [savedPresets]);

  // Task 2: Scene analysis mode detection
  const hasVisualPrompts = scenes.length > 0 && scenes.some(s => !!s.visualPrompt);
  const hasScriptText = scenes.length > 0 && scenes.some(s => !!s.scriptText);
  const analysisMode: 'full' | 'enrich' | 're-enrich' =
    totalScenes === 0 ? 'full'
    : hasVisualPrompts ? 're-enrich'
    : 'enrich';
  const analysisModeLabel =
    analysisMode === 'full' ? '장면 분석 실행'
    : analysisMode === 'enrich' ? '비주얼 프롬프트 생성'
    : '비주얼 프롬프트 재생성';
  const analysisModeDesc =
    analysisMode === 'full' ? 'AI가 대본을 분석하여 장면별 이미지 생성에 필요한 비주얼 프롬프트를 만듭니다. 이 과정은 고품질 이미지를 위해 필수적이며, 장면당 구도/인물/배경 정보가 자동 생성됩니다.'
    : analysisMode === 'enrich' ? '기존 장면 구조와 오디오를 유지하면서 이미지 생성용 비주얼 프롬프트를 추가합니다. (기존 데이터 보존)'
    : '비주얼 프롬프트를 새로 생성합니다. 기존 장면 구조/오디오/이미지는 모두 보존됩니다.';

  const updateConfig = useCallback(<K extends string>(key: K, value: unknown) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  }, [setConfig]);

  /* ── 대본 ── */
  const handleImportScript = useCallback(() => {
    const existingScenes = useProjectStore.getState().scenes;
    const hasAudio = existingScenes.some(s => s.audioUrl);
    if (hasAudio) {
      const confirmed = window.confirm('사운드 스튜디오에서 전송된 오디오 데이터가 있습니다. 대본을 다시 가져오면 오디오 매핑이 초기화될 수 있습니다. 계속하시겠습니까?');
      if (!confirmed) return;
    }
    const { finalScript, generatedScript } = useScriptWriterStore.getState();
    const script = finalScript || generatedScript?.content || '';
    if (!script.trim()) { showToast('대본작성 탭에서 대본을 먼저 생성해주세요.'); return; }
    const { videoFormat, smartSplit, longFormSplitType, selectedPreset, splitResult } = useScriptWriterStore.getState();
    // 대본작성에서 분석된 단락 결과 이어받기
    if (splitResult.length > 0) {
      setImportedSplitResult(splitResult);
      setShowImportedSplit(true);
    }
    // 채널 프리셋의 콘텐츠 형식에 따라 화면 비율 자동 설정
    const presetFormat = selectedPreset?.channelGuideline?.contentFormat;
    const autoAspect = presetFormat === 'shorts' ? AspectRatio.PORTRAIT
      : videoFormat !== VideoFormat.LONG ? AspectRatio.PORTRAIT : undefined;
    setConfig((prev) => prev ? {
      ...prev, script, videoFormat, smartSplit, longFormSplitType,
      ...(autoAspect ? { aspectRatio: autoAspect } : {}),
    } : prev);
    showToast(`대본 ${script.length.toLocaleString()}자 가져옴${splitResult.length > 0 ? ` (${splitResult.length}개 단락 포함)` : ''}${presetFormat === 'shorts' ? ' · 숏폼 9:16 자동 적용' : ''}`);
  }, [setConfig]);

  const handleApplyDraft = useCallback(() => {
    if (!scriptDraft.trim()) return;
    updateConfig('script', scriptDraft.trim());
    showToast(`대본 ${scriptDraft.trim().length.toLocaleString()}자 적용됨`);
  }, [scriptDraft, updateConfig]);

  /* ── 캐릭터 ── */
  const handleAddCharacter = useCallback(async (imageBase64: string) => {
    const charId = `char-${Date.now()}`;
    useImageVideoStore.getState().addCharacter({
      id: charId, imageBase64,
      label: `캐릭터 ${useImageVideoStore.getState().characters.length + 1}`,
      isAnalyzing: true,
    });
    persistImage(imageBase64).then(url => {
      useImageVideoStore.getState().updateCharacter(charId, { imageUrl: url });
    }).catch((e) => { logger.trackSwallowedError('SetupPanel:addCharacter/persistImage', e); });

    // [DISABLED] Remove.bg 배경 제거 비활성화
    const finalSrc = imageBase64;
    // try {
    //   const resp = await fetch(imageBase64);
    //   const blob = await resp.blob();
    //   const file = new File([blob], `char-${charId}.png`, { type: blob.type || 'image/png' });
    //   const processed = await removeBackground(file);
    //   useCostStore.getState().addCost(PRICING.REMOVE_BG_PER_IMAGE, 'image');
    //   const reader = new FileReader();
    //   const bgRemovedBase64 = await new Promise<string>((resolve) => {
    //     reader.onload = () => resolve(reader.result as string);
    //     reader.readAsDataURL(processed);
    //   });
    //   finalSrc = bgRemovedBase64;
    //   useImageVideoStore.getState().updateCharacter(charId, { imageBase64: bgRemovedBase64 });
    //   persistImage(bgRemovedBase64).then(url => {
    //     useImageVideoStore.getState().updateCharacter(charId, { imageUrl: url });
    //   }).catch(() => {});
    // } catch {
    //   // Remove.bg 실패 — 원본 이미지로 분석 진행
    // }

    // 자동 분석
    try {
      const analysis = await analyzeCharacterImage(finalSrc);
      useImageVideoStore.getState().updateCharacter(charId, {
        analysisResult: analysis.combined,
        analysisStyle: analysis.style,
        analysisCharacter: analysis.character,
        isAnalyzing: false,
      });
      // Cost is auto-tracked inside evolinkChat()
    } catch (e) {
      logger.trackSwallowedError('SetupPanel:autoAnalyzeCharacter', e);
      useImageVideoStore.getState().updateCharacter(charId, { isAnalyzing: false, analysisResult: '' });
      showToast('캐릭터 분석 실패');
    }
  }, [addCost]);

  const handleAnalyzeCharacter = useCallback(async (charId: string) => {
    if (!requireAuth('캐릭터 분석')) return;
    const char = useImageVideoStore.getState().characters.find(c => c.id === charId);
    if (!char || char.isAnalyzing) return;
    if (char.analysisResult && char.analysisStyle && char.analysisCharacter) return;
    useImageVideoStore.getState().updateCharacter(charId, { isAnalyzing: true });
    const src = char.imageUrl || char.imageBase64;
    if (!src) { useImageVideoStore.getState().updateCharacter(charId, { isAnalyzing: false }); return; }
    try {
      const analysis = await analyzeCharacterImage(src);
      useImageVideoStore.getState().updateCharacter(charId, {
        analysisResult: analysis.combined,
        analysisStyle: analysis.style,
        analysisCharacter: analysis.character,
        isAnalyzing: false,
      });
      // Cost is auto-tracked inside evolinkChat()
    } catch (e) {
      logger.trackSwallowedError('SetupPanel:handleAnalyzeCharacter', e);
      useImageVideoStore.getState().updateCharacter(charId, { isAnalyzing: false, analysisResult: '' });
      showToast('캐릭터 분석 실패');
    }
  }, [addCost, requireAuth]);

  const handleAnalyzeAllCharacters = useCallback(async () => {
    if (!requireAuth('캐릭터 일괄 분석')) return;
    const unanalyzed = useImageVideoStore.getState().characters.filter(c => (!c.analysisResult || !c.analysisStyle || !c.analysisCharacter) && !c.isAnalyzing);
    for (const char of unanalyzed) await handleAnalyzeCharacter(char.id);
  }, [handleAnalyzeCharacter, requireAuth]);

  // [DISABLED] handleRemoveBg & Remove.bg 기능 전체 비활성화

  const handleSaveCharacterToLibrary = useCallback(async (char: CharacterReference) => {
    try {
      await saveCharacterToLibrary({ id: `char-lib-${Date.now()}`, imageBase64: char.imageBase64, imageUrl: char.imageUrl, label: char.label, analysisResult: char.analysisResult, analysisStyle: char.analysisStyle, analysisCharacter: char.analysisCharacter, savedAt: Date.now() });
      showToast(`"${char.label}" 저장됨`);
    } catch (e) { logger.trackSwallowedError('SetupPanel:saveCharacterToLibrary', e); showToast('저장 실패'); }
  }, []);

  const handleLoadFromLibrary = useCallback((saved: SavedCharacter) => {
    setCharacters(prev => [...prev, { id: `char-${Date.now()}`, imageBase64: saved.imageBase64, imageUrl: saved.imageUrl, label: saved.label, analysisResult: saved.analysisResult, analysisStyle: saved.analysisStyle, analysisCharacter: saved.analysisCharacter, isAnalyzing: false }]);
    setShowCharacterLibrary(false);
    showToast(`"${saved.label}" 불러옴`);
  }, [setCharacters]);

  /* ── 장면 분석 ── */
  const runSceneAnalysis = useCallback(async (skipConfirm = false): Promise<boolean> => {
    if (!requireAuth('장면 분석')) return false;
    if (!config?.script || isAnalyzing) return false;
    if (!skipConfirm) {
      const existingScenes = useProjectStore.getState().scenes;
      // enrichMode가 기존 데이터를 보존하므로 confirm 불필요 — 바로 진행
    }
    setIsAnalyzing(true); setAnalyzeError(''); setChunkProgress(null);
    const onCost = (c: number) => addCost(c, 'analysis');
    const vf = config.videoFormat || VideoFormat.SHORT;
    const ss = config.smartSplit ?? true;
    const lfs = config.longFormSplitType;
    const existingScenes = useProjectStore.getState().scenes;
    const uploadedBaseScenes = buildUploadedTranscriptScenes(config, useImageVideoStore.getState().targetSceneCount);
    const usesUploadedTranscriptTiming = !!uploadedBaseScenes;
    // [FIX #83] 대본이 변경된 경우 enrichMode 비활성화 — 기존 장면 교체
    // 기존 장면의 나레이션 텍스트와 현재 대본을 비교하여 대본 불일치 시 전면 교체
    const existingScriptText = existingScenes.map(s => (s.scriptText || '').trim()).join(' ').trim();
    const currentScript = (config.script || '').replace(/\s+/g, ' ').trim();
    const isScriptChanged = existingScenes.length > 0 && existingScriptText.length > 0 &&
      !currentScript.includes(existingScriptText.slice(0, Math.min(100, existingScriptText.length))) &&
      !existingScriptText.includes(currentScript.slice(0, Math.min(100, currentScript.length)));
    // [FIX #382] 사용자가 목표 컷수를 수동 설정했고 기존 장면수와 다르면 enrichMode 비활성화 → 새로 분할
    const userTarget = useImageVideoStore.getState().targetSceneCount;
    const targetDiffers = userTarget !== null && userTarget > 0 && userTarget !== existingScenes.length;
    const uploadedNeedsRegroup = !!uploadedBaseScenes && !areUploadedTranscriptScenesSynced(existingScenes, uploadedBaseScenes);
    const enrichMode = usesUploadedTranscriptTiming
      ? existingScenes.length > 0 && !isScriptChanged && !targetDiffers && !uploadedNeedsRegroup
      : existingScenes.length > 0 && !isScriptChanged && !targetDiffers;
    const sceneDrafts = usesUploadedTranscriptTiming
      ? (enrichMode ? existingScenes : uploadedBaseScenes)
      : null;
    const analysisScript = sceneDrafts
      ? sceneDrafts.map((scene) => (scene.scriptText || scene.audioScript || '').trim()).filter(Boolean).join('\n')
      : config.script;
    try {
      const ctx = await analyzeScriptContext(
        analysisScript,
        onCost,
        vf,
        sceneDrafts ? false : ss,
        sceneDrafts ? undefined : lfs,
      );
      // [FIX #403] 캐릭터 레퍼런스 분석 결과(편집 반영)를 스토리보드 생성에 주입
      const currentChars = useImageVideoStore.getState().characters;
      const charAnalysisDesc = currentChars
        .filter(c => c.analysisResult)
        .map((c, i) => `[Character ${i + 1}: "${c.label}"]\n${c.analysisResult}`)
        .join('\n\n');
      const effectiveCharDesc = [config.detectedCharacterDescription || '', charAnalysisDesc].filter(Boolean).join('\n\n');
      const parsed = await parseScriptToScenes(
        analysisScript, vf, ctx.visualTone || 'Cinematic',
        effectiveCharDesc, config.characterAppearance ?? CharacterAppearance.AUTO,
        config.allowInfographics ?? false, sceneDrafts ? false : (enrichMode ? false : ss),
        config.baseAge, config.textForceLock, JSON.stringify(ctx), ctx.detectedLocale, onCost,
        config.suppressText, sceneDrafts ? undefined : (enrichMode ? undefined : (vf === VideoFormat.LONG ? lfs : undefined)),
        sceneDrafts ? sceneDrafts.length : (enrichMode ? existingScenes.length : (useImageVideoStore.getState().targetSceneCount ?? ctx.estimatedSceneCount)),
        config.dialogueTone, // [v4.7] 대사 톤
        config.extractedCharacters || ctx.characters, // [v4.7] 캐릭터 프로필
        config.referenceDialogue, // [v4.7] 참조 대사
        (completed, total) => setChunkProgress(total > 1 ? { completed, total } : null) // [FIX #193] 청크 진행률
      );

      // [POST-PROCESS] 개별 장면에 컨텍스트 누락 시 전역 분석 결과로 채움
      // AI가 sceneLocation/sceneEra/sceneCulture를 생략하면 이미지 생성 시 배경·시대·문화가 빠짐
      const defaultLocation = ctx.specificLocation || ctx.baseSetting || '';
      const defaultEra = ctx.timePeriod || '';
      const defaultCulture = ctx.culturalBackground || '';
      for (const s of parsed) {
        if (!s.sceneLocation && defaultLocation) s.sceneLocation = defaultLocation;
        if (!s.sceneEra && defaultEra) s.sceneEra = defaultEra;
        if (!s.sceneCulture && defaultCulture) s.sceneCulture = defaultCulture;
      }

      if (sceneDrafts) {
        const baseScenes = enrichMode ? existingScenes : sceneDrafts;
        useProjectStore.getState().setScenes(baseScenes.map((base, i) => ({
          ...mergeSceneAnalysis(base, parsed[i]),
          id: base.id || `scene-${Date.now()}-${++_sceneIdCounter}-${i}`,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          seedanceDuration: base.seedanceDuration || '8',
        })));
      } else if (enrichMode) {
        useProjectStore.getState().setScenes(existingScenes.map((ex, i) => mergeSceneAnalysis(ex, parsed[i])));
      } else {
        useProjectStore.getState().setScenes(parsed.map((s, i) => ({ ...s, id: `scene-${Date.now()}-${++_sceneIdCounter}-${i}`, isGeneratingImage: false, isGeneratingVideo: false, seedanceDuration: '8' })));
      }
      // [CRITICAL FIX] globalContext를 반드시 구성하여 저장 — 이미지 생성 시 문화/장소/시대 맥락이 주입됨
      const globalContextObj = {
        specificLocation: ctx.specificLocation || ctx.baseSetting || '',
        timePeriod: ctx.timePeriod || '',
        culturalBackground: ctx.culturalBackground || '',
        visualTone: ctx.visualTone || '',
        keyEntities: ctx.keyEntities || '',
      };
      useProjectStore.getState().setConfig((prev) => prev ? { ...prev, cachedContextData: ctx as Record<string, unknown>, globalContext: JSON.stringify(globalContextObj), detectedStyleDescription: ctx.visualTone || prev.detectedStyleDescription, detectedLanguage: ctx.detectedLanguage || prev.detectedLanguage, detectedLanguageName: ctx.detectedLanguageName || prev.detectedLanguageName, detectedLocale: ctx.detectedLocale || prev.detectedLocale } : prev);
      setIsAnalyzing(false); setChunkProgress(null); return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isJsonErr = msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('Unexpected end');
      setAnalyzeError(isJsonErr ? `AI 응답 형식 오류 — "스토리보드 생성"을 다시 눌러주세요. (${msg})` : msg);
      setIsAnalyzing(false); setChunkProgress(null); return false;
    }
  }, [config, isAnalyzing, addCost, requireAuth]);

  const handleCreateStoryboard = useCallback(async () => {
    if (!requireAuth('스토리보드 생성')) return;
    const existingScenes = useProjectStore.getState().scenes;
    if (existingScenes.length > 0) {
      // [FIX #83] 대본이 변경되었으면 기존 장면을 무시하고 새로 분석
      const existingScriptText = existingScenes.map(s => (s.scriptText || '').trim()).join(' ').trim();
      const currentScript = (config?.script || '').replace(/\s+/g, ' ').trim();
      const isScriptChanged = existingScriptText.length > 0 &&
        !currentScript.includes(existingScriptText.slice(0, Math.min(100, existingScriptText.length))) &&
        !existingScriptText.includes(currentScript.slice(0, Math.min(100, currentScript.length)));
      if (isScriptChanged && config?.script) {
        showToast('대본이 변경되었습니다. 새 스토리보드를 생성합니다...');
        if (await runSceneAnalysis()) setActiveSubTab('storyboard');
        return;
      }
      if (uploadedScenesNeedRegroup && config?.script) {
        showToast('업로드 전사를 현재 분할 설정에 맞게 다시 구성합니다...');
        if (await runSceneAnalysis()) setActiveSubTab('storyboard');
        return;
      }
      // [FIX #421] 목표 컷 수가 변경되었으면 기존 장면 무시하고 재분석
      const userTarget = useImageVideoStore.getState().targetSceneCount;
      if (userTarget && userTarget > 0 && existingScenes.length !== userTarget) {
        showToast(`목표 컷 수가 변경되었습니다 (${existingScenes.length}→${userTarget}). 새 스토리보드를 생성합니다...`);
        // [P1 FIX] 재분석 성공 후에만 장면 교체 — 실패 시 기존 장면 보존
        // runSceneAnalysis 내부에서 setScenes를 호출하므로 별도 초기화 불필요
        // enrichMode=false가 되어야 하므로, 임시로 장면을 비우고 실패 시 복원
        const backup = [...existingScenes];
        useProjectStore.getState().setScenes([]);
        const success = await runSceneAnalysis();
        if (success) {
          setActiveSubTab('storyboard');
        } else {
          // 재분석 실패 → 기존 장면 복원
          useProjectStore.getState().setScenes(backup);
          showToast('스토리보드 재생성에 실패했습니다. 기존 장면을 유지합니다.');
        }
        return;
      }
      // 비주얼 프롬프트가 없으면 자동 생성 후 스토리보드 열기
      const hasPrompts = existingScenes.some(s => s.visualPrompt && s.visualPrompt.trim().length > 0);
      if (!hasPrompts && config?.script) {
        showToast('비주얼 프롬프트를 자동 생성합니다...');
        await runSceneAnalysis();
      }
      setActiveSubTab('storyboard');
      return;
    }
    if (!config?.script) { showToast('대본을 먼저 입력해주세요'); return; }
    if (await runSceneAnalysis()) setActiveSubTab('storyboard');
  }, [config?.script, runSceneAnalysis, setActiveSubTab, requireAuth, uploadedScenesNeedRegroup]);

  if (!config) return null;

  return (
    <div className="space-y-5">

      {/* ── 사운드 스튜디오 전송 배너 ── */}
      {hasAudioScenes && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-900/30 to-blue-900/20 border border-cyan-500/30 rounded-2xl px-5 py-3">
          <span className="text-lg flex-shrink-0">🎙</span>
          <div>
            <p className="text-sm font-semibold text-cyan-300">사운드 스튜디오에서 전송됨 — {scenes.length}개 장면</p>
            {!scenes.some(s => s.visualPrompt) && (
              <p className="text-xs text-cyan-500/70 mt-0.5">캐릭터/스타일 설정 후 "스토리보드 생성"을 누르면 비주얼 프롬프트가 자동 생성됩니다</p>
            )}
          </div>
        </div>
      )}

      {/* ── 대본작성 단락 확인 ── */}
      {importedSplitResult.length > 0 && !directInputMode && (
        <div className="bg-gray-800/60 border border-violet-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📝</span>
              <h3 className="text-sm font-bold text-violet-300">대본작성에서 넘어온 단락</h3>
              <span className="text-xs font-bold text-violet-300 bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 rounded-lg">
                {importedSplitResult.length}개 단락
              </span>
            </div>
            <button type="button" onClick={() => setShowImportedSplit(!showImportedSplit)}
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors">
              {showImportedSplit ? '접기 ▲' : '펼치기 ▼'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            아래 단락 구조를 확인하세요. "스토리보드 생성" 시 이 단락을 기반으로 AI가 비주얼 프롬프트를 생성합니다.
          </p>
          {showImportedSplit && (
            <div className="bg-gray-900/50 rounded-xl border border-gray-700/30 max-h-[320px] overflow-auto">
              {importedSplitResult.map((para, i) => (
                <div key={i}
                  className={`flex items-start gap-3 px-3 py-2.5 ${i % 2 === 0 ? 'bg-gray-800/10' : 'bg-gray-800/30'} border-b border-gray-700/15 last:border-b-0`}>
                  <span className="flex-shrink-0 w-7 h-7 rounded-md bg-violet-900/30 border border-violet-600/20 flex items-center justify-center text-xs font-bold text-violet-300">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-200 leading-relaxed pt-0.5 flex-1">{para}</p>
                  <span className="flex-shrink-0 text-xs text-gray-500 pt-1 whitespace-nowrap">{para.length}자</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 직접 입력 모드 토글 ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Toggle checked={directInputMode} onChange={setDirectInputMode} />
            <div>
              <span className="text-sm font-bold text-white">대본 직접 입력</span>
              <p className="text-xs text-gray-500 mt-0.5">
                이곳에서 대본을 직접 입력하고 포맷, 비율, 세부 옵션을 조정할 수 있습니다
              </p>
            </div>
          </div>
          {!directInputMode && scriptLen > 0 && (
            <span className="text-xs font-semibold text-green-400 bg-green-500/15 border border-green-500/30 px-3 py-1 rounded-full">
              대본 준비됨 ({scriptLen.toLocaleString()}자)
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* 직접 입력 모드 전용: 대본 + 포맷/비율              */}
      {/* ════════════════════════════════════════════ */}
      {directInputMode && (
        <>
          {/* ── 1. 대본 ── */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">1. 대본</h3>
              <button type="button" onClick={handleImportScript}
                className="text-sm font-semibold text-purple-400 hover:text-purple-300 bg-purple-500/10 border border-purple-500/30 px-4 py-1.5 rounded-xl transition-all">
                대본작성 탭에서 가져오기
              </button>
            </div>
            {hasAudioScenes && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 mb-2">
                오디오 데이터가 연결된 장면이 있습니다. 대본을 다시 가져오면 매핑이 초기화될 수 있습니다.
              </p>
            )}
            {scriptLen > 0 && !scriptDraft && (
              <div className="mb-3 px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-sm text-green-400 font-semibold">대본 로드됨 — {scriptLen.toLocaleString()}자</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{config.script.slice(0, 100)}...</p>
              </div>
            )}
            <textarea
              value={scriptDraft || config.script || ''}
              onChange={(e) => setScriptDraft(e.target.value)}
              rows={6}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
              placeholder="대본을 직접 입력하거나 붙여넣기하세요..."
            />
            {scriptDraft && scriptDraft !== config.script && (
              <div className="flex justify-end mt-2">
                <button type="button" onClick={handleApplyDraft}
                  className="text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 px-4 py-1.5 rounded-lg transition-all">
                  대본 적용
                </button>
              </div>
            )}
          </div>

          {/* ── 2. 단락 나누기 ── */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5 space-y-4">
            <h3 className="text-base font-bold text-white">2. 단락 나누기</h3>

            {/* 포맷 선택 + 롱폼 분할 타입 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                {FORMAT_BUTTONS.map(f => (
                  <button key={f.id} type="button"
                    onClick={() => { updateConfig('videoFormat', f.id); if (f.id !== VideoFormat.LONG) updateConfig('aspectRatio', AspectRatio.PORTRAIT); }}
                    className={`px-3 py-1.5 text-sm font-bold transition-all ${
                      config.videoFormat === f.id ? `${f.color} text-white` : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}>{f.label}</button>
                ))}
              </div>
              {config.videoFormat === VideoFormat.LONG && (
                <div className="flex bg-gray-800/60 p-0.5 rounded-lg border border-gray-600">
                  {(['ECONOMY', 'DEFAULT', 'DETAILED'] as const).map(type => (
                    <button key={type} type="button"
                      onClick={() => updateConfig('longFormSplitType', type)}
                      className={`py-1 px-2.5 rounded-md text-sm font-bold transition-all ${
                        (config.longFormSplitType || 'DEFAULT') === type
                          ? (type === 'ECONOMY' ? 'bg-emerald-600 text-white' : type === 'DEFAULT' ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white')
                          : 'text-gray-400 hover:text-gray-200'
                      }`}>{LONG_SPLIT[type].label}</button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-sm text-gray-400">{FORMAT_DESC[config.videoFormat || VideoFormat.SHORT]}</p>
            {config.videoFormat === VideoFormat.LONG && (
              <p className="text-sm text-orange-400/80">
                <span className="font-bold text-orange-300">{LONG_SPLIT[config.longFormSplitType || 'DEFAULT'].label}</span>
                {' — '}{LONG_SPLIT[config.longFormSplitType || 'DEFAULT'].desc}
              </p>
            )}

            <p className="text-sm text-cyan-300/70 font-medium">
              단락 나누기는 대본의 구조를 정리합니다. "스토리보드 생성" 시 AI가 각 단락에 비주얼 프롬프트를 생성합니다.
            </p>

            {/* 스마트 분할 */}
            <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">✂️ 스마트 분할</p>
                <p className="text-xs text-gray-400 mt-0.5">AI가 문맥을 분석하여 최적의 장면 분할점을 자동 결정합니다.</p>
              </div>
              <Toggle checked={config.smartSplit ?? true} onChange={(v) => updateConfig('smartSplit', v)} />
            </div>

            {/* 글자수 / 예상시간 / 예상 컷수 + 목표 컷 수 입력 */}
            {scriptText.trim() && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 rounded-lg">
                  {scriptText.length.toLocaleString()}자 · {durationLabel}
                </span>
                {durationMismatchSec >= 10 && (
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                    실제 오디오 {formatNarrationDuration(config?.sourceNarrationDurationSec || 0)} / 전사 {formatNarrationDuration(config?.transcriptDurationSec || 0)}
                  </span>
                )}
                {estimatedScenes > 0 && (
                  <span className="text-sm font-bold text-blue-300 bg-blue-900/30 px-2 py-1 rounded-lg border border-blue-700/40">
                    예상 약 {estimatedScenes}컷
                  </span>
                )}
                {/* [#177] 목표 컷 수 오버라이드 입력 */}
                <div className="flex items-center gap-1.5" title="대본을 몇 개의 장면(컷)으로 나눌지 설정합니다. 비워두면 AI가 자동으로 정해요.">
                  <label className="text-xs font-bold text-orange-300 whitespace-nowrap cursor-help">목표 컷 수</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={targetSceneCount ?? ''}
                    placeholder={estimatedScenes > 0 ? String(estimatedScenes) : '자동'}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') { setTargetSceneCount(null); return; }
                      const n = parseInt(raw, 10);
                      if (!isNaN(n) && n >= 1 && n <= 200) setTargetSceneCount(n);
                    }}
                    className="w-16 bg-gray-900 border border-orange-500/40 rounded-lg px-2 py-1 text-sm text-orange-300 text-center placeholder-gray-600 focus:outline-none focus:border-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {targetSceneCount !== null && (
                    <button type="button" onClick={() => setTargetSceneCount(null)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors" title="자동으로 되돌리기">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 단락 미리보기 */}
            {scriptText.trim() && (
              <>
                <button type="button" onClick={() => setShowSplitGuide(!showSplitGuide)}
                  className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  <span>{showSplitGuide ? '▼' : '▶'}</span>
                  <span className="underline font-medium">
                    {livePreviewData.scenes.length > 0 ? `단락 미리보기 (예상 ${livePreviewData.scenes.length}컷)` : '단락 미리보기'}
                  </span>
                  {livePreviewData.scenes.length > 0 && (
                    <span className="text-xs text-yellow-400/70">예상치 — 장면 분석 시 AI가 정확히 분할합니다</span>
                  )}
                </button>
                {showSplitGuide && (
                  <div>
                    {livePreviewData.scenes.length > 0 ? (
                      <div className="bg-gray-800/30 rounded-xl border border-blue-700/20 overflow-hidden">
                        <div className="px-3 py-2 bg-blue-900/15 border-b border-blue-700/15">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-blue-300">예상 분할 미리보기</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-600/20 font-medium">로컬 추정</span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed bg-gray-900/40 rounded px-2 py-1.5 border border-gray-700/20">
                            <span className="text-yellow-400/80 font-medium">원문:</span> {livePreviewData.original.slice(0, 200)}{livePreviewData.original.length > 200 ? '...' : ''}
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
              </>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* 항상 표시: 캐릭터 레퍼런스                       */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white">
            {stepBase}. 캐릭터 레퍼런스
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">멀티캐릭터</span>
            <Toggle checked={isMultiCharacter} onChange={setIsMultiCharacter} />
          </div>
        </div>
        <CharacterUploadPanel
          characters={characters}
          onAdd={handleAddCharacter}
          onRemove={(id) => useImageVideoStore.getState().removeCharacter(id)}
          onUpdateLabel={(id, label) => useImageVideoStore.getState().updateCharacterLabel(id, label)}
          onUpdateAnalysis={(id, field, value) => {
            const updates: Record<string, string> = { [field]: value };
            // analysisResult도 동기화 (존재 여부로 분석 완료 판단)
            const char = useImageVideoStore.getState().characters.find(c => c.id === id);
            if (char) {
              const style = field === 'analysisStyle' ? value : (char.analysisStyle || '');
              const character = field === 'analysisCharacter' ? value : (char.analysisCharacter || '');
              updates.analysisResult = [style, character].filter(Boolean).join(' | ');
            }
            useImageVideoStore.getState().updateCharacter(id, updates);
          }}
          onAnalyze={handleAnalyzeCharacter}
          onAnalyzeAll={handleAnalyzeAllCharacters}
          maxCharacters={isMultiCharacter ? 5 : 1}
          onSaveToLibrary={handleSaveCharacterToLibrary}
          onOpenLibrary={() => setShowCharacterLibrary(true)}
          isMultiCharacter={isMultiCharacter}
        />
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* 항상 표시: 생성 옵션 (인포그래픽, 텍스트, 캐릭터 빈도) */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-bold text-white">{stepBase + 1}. 생성 옵션</h3>

        {/* [#177] 목표 컷 수 — 직접 입력 모드가 아닐 때 여기에 표시 */}
        {!directInputMode && scriptText.trim() && (
          <div className="bg-gray-900/60 border border-orange-500/20 rounded-xl px-5 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <p className="text-sm font-bold text-white whitespace-nowrap">🎯 목표 컷 수</p>
              {estimatedScenes > 0 && (
                <span className="text-xs text-gray-400">자동 추정: {estimatedScenes}컷</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                min={1}
                max={200}
                value={targetSceneCount ?? ''}
                placeholder={estimatedScenes > 0 ? String(estimatedScenes) : '자동'}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { setTargetSceneCount(null); return; }
                  const n = parseInt(raw, 10);
                  if (!isNaN(n) && n >= 1 && n <= 200) setTargetSceneCount(n);
                }}
                className="w-16 bg-gray-900 border border-orange-500/40 rounded-lg px-2 py-1.5 text-sm text-orange-300 text-center placeholder-gray-600 focus:outline-none focus:border-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {targetSceneCount !== null ? (
                <button type="button" onClick={() => setTargetSceneCount(null)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors" title="자동으로 되돌리기">
                  ✕
                </button>
              ) : (
                <span className="text-[11px] text-gray-600 whitespace-nowrap">1~200</span>
              )}
            </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              대본을 몇 개의 장면(컷)으로 나눌지 설정합니다. 비워두면 대본 길이에 맞춰 AI가 자동으로 정해요.
              숫자가 클수록 장면이 세밀하게 나뉘고, 작을수록 장면당 내용이 많아집니다.
            </p>
          </div>
        )}

        {/* 화면 비율 */}
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">📐 화면 비율</p>
            <span className="text-xs text-gray-500">{RATIO.find(r => r.value === config.aspectRatio)?.label || '16:9'} 선택됨</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {RATIO.map((o) => (
              <button key={o.value} type="button" onClick={() => updateConfig('aspectRatio', o.value)}
                className={`py-3 rounded-xl text-center transition-all border-2 ${
                  config.aspectRatio === o.value
                    ? 'bg-orange-500/20 border-orange-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}>
                <span className="text-base font-bold">{o.label}</span>
                <span className="text-xs text-gray-500 block mt-0.5">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 인포그래픽 + 캐릭터 출연 빈도 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">🎬 인포그래픽 모드 ({config.allowInfographics ? 'ON' : 'OFF'})</p>
              <p className="text-xs text-gray-400 mt-1">{config.allowInfographics ? '데이터 시각화가 포함됩니다.' : '영상미와 몰입감에 집중합니다.'}</p>
            </div>
            <Toggle checked={config.allowInfographics ?? false} onChange={(v) => updateConfig('allowInfographics', v)} />
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4">
            <p className="text-sm font-bold text-white mb-2.5">👤 캐릭터 출연 빈도</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHAR_FREQ.map((o) => (
                <button key={o.value} type="button" onClick={() => updateConfig('characterAppearance', o.value)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    (config.characterAppearance || CharacterAppearance.AUTO) === o.value
                      ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
            {(config.characterAppearance || CharacterAppearance.AUTO) === CharacterAppearance.AUTO && (
              <p className="text-xs text-gray-400 mt-2">* 자동: 대사가 있거나 행동이 중요할 때만 등장합니다.</p>
            )}
          </div>
        </div>

        {/* 텍스트 관련 토글 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">🔤 텍스트 언어 강제 고정</p>
              <p className="text-xs text-gray-400 mt-1">배경 내 간판/표지판을 대본의 언어(한국어 등)로 강제 변환합니다.</p>
            </div>
            <Toggle checked={config.textForceLock ?? false} onChange={(v) => updateConfig('textForceLock', v)} />
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">🚫 텍스트 생성 금지 (Clean Mode)</p>
              <p className="text-xs text-gray-400 mt-1">AI가 이미지 내에 어떤 글자도 생성하지 않도록 원천 차단합니다.</p>
            </div>
            <Toggle checked={config.suppressText ?? true} onChange={(v) => updateConfig('suppressText', v)} />
          </div>
        </div>

        {/* 웹 검색 참조 모드 */}
        <div className={`rounded-xl px-5 py-4 flex items-center justify-between gap-3 transition-all duration-200 ${
          enableWebSearch
            ? 'bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-2 border-cyan-400/50 shadow-lg shadow-cyan-500/10'
            : 'bg-gray-900/60 border border-gray-600/40'
        }`}>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${enableWebSearch ? 'text-cyan-300' : 'text-white'}`}>🔍 웹 검색 참조 모드</p>
            <p className="text-xs text-gray-400 mt-1">
              AI가 이미지 생성 시 실시간 웹 검색 결과를 참조하여 <b className="text-cyan-300">실제 인물, 장소, 사물의 정확도가 크게 향상</b>됩니다.
              특히 유명인, 랜드마크, 특정 제품 등 실존 대상을 묘사할 때 효과적입니다.
            </p>
            <p className="text-[11px] text-yellow-400/80 mt-1.5">
              ⚠ 활성화 시 이미지 생성 속도가 약 10~20초 정도 더 소요될 수 있습니다. 전체 일괄 생성 및 개별 생성 모두에 적용됩니다.
            </p>
          </div>
          <Toggle checked={enableWebSearch} onChange={(v) => setEnableWebSearch(v)} />
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* [NEW] 구글 레퍼런스 이미지 — 비주얼 스타일 상단  */}
      {/* ════════════════════════════════════════════ */}
      <GoogleReferencePanel />

      {/* ════════════════════════════════════════════ */}
      {/* 항상 표시: 비주얼 스타일                         */}
      {/* ════════════════════════════════════════════ */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{stepBase + 2}. 비주얼 스타일 (선택)</h3>
            {style !== 'custom' && selectedLabel && (
              <span className="text-xs font-bold text-orange-300 bg-orange-900/30 border border-orange-500/30 px-2 py-0.5 rounded-lg">
                🎨 {selectedLabel}
              </span>
            )}
            {appliedChannelName && (
              <span className="text-xs font-bold text-blue-300 bg-blue-900/30 border border-blue-500/30 px-2 py-0.5 rounded-lg">
                📡 {appliedChannelName}
              </span>
            )}
          </div>
          {style !== 'custom' && (
            <button type="button" onClick={() => setStyle('custom')} className="text-xs text-red-400 hover:text-red-300 underline">초기화</button>
          )}
        </div>

        {/* 스타일 우선순위 안내 */}
        <div className="px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-sm text-yellow-400 font-bold">⚠ 스타일 적용 우선순위 안내</p>
          <p className="text-xs text-gray-400 mt-0.5">이곳 설정을 선택하면 분석된 화풍 대신 해당 스타일이 우선 적용됩니다.</p>
        </div>

        {/* [#195] 채널 레퍼런스 스타일 — 분석된 채널의 시각 스타일 적용 */}
        {(channelGuideline?.visualGuide || channelPresetsWithVisual.length > 0) && (
          <div className="border border-blue-500/30 rounded-xl overflow-hidden bg-blue-950/20">
            <div className="px-4 py-3 flex items-center justify-between bg-blue-900/20">
              <div className="flex items-center gap-2">
                <span className="text-base">📡</span>
                <span className="text-sm font-bold text-blue-300">채널 레퍼런스 스타일</span>
              </div>
              {channelPresetsWithVisual.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowPresetList(!showPresetList)}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  {showPresetList ? '접기' : `저장된 채널 ${channelPresetsWithVisual.length}개`}
                </button>
              )}
            </div>
            <div className="p-3 space-y-2">
              {/* 현재 분석 중인 채널 */}
              {channelGuideline?.visualGuide && (
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    style === channelGuideline.visualGuide
                      ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'bg-gray-900/60 border-gray-700/50 hover:border-blue-500/40 hover:bg-gray-800/70'
                  }`}
                  onClick={() => setStyle(style === channelGuideline.visualGuide ? 'custom' : channelGuideline.visualGuide)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-white">{channelGuideline.channelName}</span>
                    {style === channelGuideline.visualGuide ? (
                      <span className="text-xs text-blue-400 bg-blue-600/20 border border-blue-500/30 rounded-lg px-2.5 py-1 font-bold">적용됨</span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-cyan-400 bg-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded-lg px-2.5 py-1 font-bold transition-colors"
                        onClick={(e) => { e.stopPropagation(); setStyle(channelGuideline.visualGuide!); }}
                      >
                        적용
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{channelGuideline.visualGuide.slice(0, 200)}{channelGuideline.visualGuide.length > 200 ? '...' : ''}</p>
                </div>
              )}

              {/* 저장된 프리셋 목록 (접이식) */}
              {showPresetList && channelPresetsWithVisual
                .filter(p => p.channelName !== channelGuideline?.channelName)
                .map(preset => (
                  <div
                    key={preset.channelName}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      style === preset.visualGuide
                        ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-gray-900/60 border-gray-700/50 hover:border-blue-500/40 hover:bg-gray-800/70'
                    }`}
                    onClick={() => setStyle(style === preset.visualGuide ? 'custom' : preset.visualGuide!)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white">{preset.channelName}</span>
                      {style === preset.visualGuide ? (
                        <span className="text-xs text-blue-400 bg-blue-600/20 border border-blue-500/30 rounded-lg px-2.5 py-1 font-bold">적용됨</span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-gray-400 hover:text-cyan-400 bg-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded-lg px-2.5 py-1 font-bold transition-colors"
                          onClick={(e) => { e.stopPropagation(); setStyle(preset.visualGuide!); }}
                        >
                          적용
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{preset.visualGuide!.slice(0, 150)}{preset.visualGuide!.length > 150 ? '...' : ''}</p>
                  </div>
                ))
              }

              <p className="text-[11px] text-gray-500 mt-1">채널분석 탭에서 분석한 채널의 영상 톤과 그림체를 이미지 생성에 적용합니다.</p>
            </div>
          </div>
        )}

        {/* 스타일 독립/혼합 모드 — 체크박스 */}
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl px-5 py-4 flex items-center gap-4">
          <input
            type="checkbox"
            checked={config.isMixedMedia ?? false}
            onChange={(e) => updateConfig('isMixedMedia', e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 flex-shrink-0 cursor-pointer accent-blue-500"
          />
          <div>
            <p className="text-sm font-bold text-white">🎭 스타일 독립/혼합 모드 (Style Isolation)</p>
            <p className="text-xs text-gray-400 mt-0.5">배경과 캐릭터의 화풍이 섞이지 않도록 분리합니다.</p>
          </div>
        </div>

        <VisualStylePicker
          value={style === 'custom' ? '' : style}
          onChange={(prompt) => setStyle(prompt || 'custom')}
          colorTheme="blue"
          compact
        />

        {/* [#391] 스타일 레퍼런스 이미지 — 벤치마킹 채널 등의 이미지를 업로드하면 AI가 화풍/구도/색감 참고 */}
        <StyleReferenceUpload
          images={styleReferenceImages}
          onAdd={(img) => useImageVideoStore.getState().addStyleReferenceImage(img)}
          onRemove={(idx) => useImageVideoStore.getState().removeStyleReferenceImage(idx)}
        />

        {/* [FIX #174] 커스텀 스타일 지시 — handshake 제거, 다큐멘터리 톤 등 */}
        <div className="mt-3">
          <label className="text-xs text-gray-400 mb-1 block">추가 스타일 지시 (선택)</label>
          <textarea
            value={customStyleNote}
            onChange={(e) => setCustomStyleNote(e.target.value)}
            placeholder="예: no handshake effect, 다큐멘터리 톤, 따뜻한 색감, 광각 렌즈..."
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none transition-colors resize-none"
            rows={2}
          />
        </div>
      </div>

      {/* ── 대사 생성 (v4.7) ── */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 flex items-center justify-center text-sm">💬</div>
            <h3 className="text-base font-bold text-white">{stepBase + 3}. 대사 생성 (선택)</h3>
          </div>
          <Toggle checked={dialogueMode} onChange={(v) => { setDialogueMode(v); if (v && dialogueTone === 'none') setDialogueTone('senior_story'); if (!v) setDialogueTone('none'); }} />
        </div>
        {dialogueMode && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">화면에 표시할 대사를 AI가 자동 생성합니다. 톤을 선택하면 해당 스타일로 대사가 만들어집니다.</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(DIALOGUE_TONE_PRESETS) as [DialogueTone, typeof DIALOGUE_TONE_PRESETS[DialogueTone]][])
                .filter(([k]) => k !== 'none')
                .map(([key, preset]) => (
                  <button key={key} type="button" onClick={() => setDialogueTone(key)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                      dialogueTone === key
                        ? 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30'
                        : 'bg-gray-700/40 text-gray-400 border-gray-600/30 hover:border-gray-500/50'
                    }`}>
                    <span className="block text-sm">{preset.emoji}</span>
                    <span className="block mt-0.5">{preset.label}</span>
                  </button>
                ))}
            </div>
            {dialogueTone !== 'none' && (
              <p className="text-[11px] text-fuchsia-400/80">{DIALOGUE_TONE_PRESETS[dialogueTone].desc}</p>
            )}
            <div>
              <label className="text-xs text-gray-400 block mb-1">참조 대사 (선택, 톤 참고용)</label>
              <textarea
                value={referenceDialogue}
                onChange={(e) => setReferenceDialogue(e.target.value.slice(0, 500))}
                placeholder="원하는 대사 스타일의 예시를 붙여넣으세요..."
                className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-fuchsia-500/50"
                rows={2}
              />
              <div className="text-[10px] text-gray-600 text-right mt-0.5">{referenceDialogue.length}/500</div>
            </div>
          </div>
        )}
      </div>

      {/* ── 에러 ── */}
      {analyzeError && (
        <div className="px-4 py-2.5 bg-red-900/30 border border-red-500/40 rounded-xl">
          <p className="text-sm text-red-400">{analyzeError}</p>
        </div>
      )}

      {/* ── 단락나누기 설정 안내 배너 (#261) [FIX #385] targetSceneCount 반영 ── */}
      {scriptText.trim() && estimatedScenes > 0 && !isAnalyzing && totalScenes === 0 && (() => {
        const displayScenes = (targetSceneCount !== null && targetSceneCount > 0) ? targetSceneCount : estimatedScenes;
        return (
        <div className={`px-4 py-3 rounded-xl border ${
          displayScenes >= 10
            ? 'bg-orange-500/15 border-orange-500/40'
            : 'bg-orange-500/10 border-orange-500/30'
        }`}>
          <div className="flex items-start gap-2.5">
            <span className="text-lg mt-0.5 shrink-0">📋</span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${displayScenes >= 10 ? 'text-orange-300' : 'text-orange-400'}`}>
                현재 설정으로 대본이 <span className="text-orange-200 text-base">{displayScenes}컷</span>으로 나뉘어 생성됩니다
                {targetSceneCount !== null && targetSceneCount > 0 && targetSceneCount !== estimatedScenes && (
                  <span className="text-xs text-gray-400 font-normal ml-1">(자동 추정: {estimatedScenes}컷)</span>
                )}
              </p>
              <p className="text-xs text-orange-400/70 mt-1 leading-relaxed">
                {vf === VideoFormat.LONG
                  ? `롱폼 · ${LONG_SPLIT[lfs || 'DEFAULT'].label} (${LONG_SPLIT[lfs || 'DEFAULT'].desc})`
                  : vf === VideoFormat.SHORT
                  ? '숏폼 · 1문장 = 1장면'
                  : vf === VideoFormat.NANO
                  ? '나노 · 쉼표 단위 초고속 분할'
                  : '수동 · 줄바꿈 기준 분할'
                }
                {ss ? ' · 스마트 분할 ON' : ' · 스마트 분할 OFF'}
              </p>
              {displayScenes >= 10 && (
                <p className="text-xs text-orange-300/80 mt-1.5 font-medium">
                  ⚠️ 컷 수가 많으면 비용이 증가해요. 위의 <strong>목표 컷 수</strong>를 조절하거나 <strong>롱폼 호흡 중심</strong>으로 바꿔보세요.
                </p>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── CTA ── */}
      <div className="pt-1 space-y-2">
        {totalScenes === 0 ? (
          /* 장면 없음: 전체 분석 */
          <button type="button" onClick={handleCreateStoryboard} disabled={isAnalyzing || !config?.script}
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white text-base font-bold px-6 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:shadow-none flex items-center justify-center gap-3">
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-3 py-2 w-full">
                {/* 메인 상태 */}
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="font-bold text-lg">{chunkProgress ? `대본 분석 중... (${chunkProgress.completed}/${chunkProgress.total} 블록 완료)` : elapsed < 5 ? '대본 구조 분석 중...' : elapsed < 15 ? '장면별 비주얼 프롬프트 생성 중...' : elapsed < 30 ? '캐릭터 배치 및 카메라 앵글 최적화 중...' : elapsed < 60 ? '최종 검수 및 품질 보정 중...' : 'AI가 열심히 작업하고 있습니다...'}</span>
                  {elapsed > 0 && <span className="text-xs text-white/70 tabular-nums bg-white/10 px-2.5 py-1 rounded-full font-mono">{formatElapsed(elapsed)}</span>}
                </div>

                {/* 상세 설명 */}
                <div className="text-sm text-white/60 font-normal text-center leading-relaxed max-w-md space-y-1">
                  <p>{
                    chunkProgress ? `대본을 ${chunkProgress.total}개 블록으로 나눠 동시 분석 중입니다` :
                    elapsed < 5 ? '대본의 언어, 시대, 문화적 맥락을 파악하고 있습니다' :
                    elapsed < 15 ? '각 장면에 최적화된 구도, 조명, 배경을 설계합니다' :
                    elapsed < 30 ? '캐릭터 일관성과 시각적 연출을 조율합니다' :
                    elapsed < 60 ? '생성된 프롬프트를 검증하고 최적화합니다' :
                    elapsed < 90 ? '장면이 많아 시간이 조금 더 걸리고 있습니다' :
                    elapsed < 120 ? 'AI 서버 응답을 기다리고 있습니다... 잠시만 기다려주세요' :
                    '평소보다 오래 걸리고 있습니다. 서버가 바쁠 수 있으니 조금만 더 기다려주세요.'
                  }</p>
                </div>

                {/* 진행 단계 프로그레스 바 */}
                <div className="w-full max-w-sm">
                  <div className="flex items-center gap-0.5">
                    {chunkProgress ? (
                      /* [FIX #193] 청크 병렬 처리 시 실제 진행률 표시 */
                      Array.from({ length: chunkProgress.total }, (_, i) => {
                        const isDone = i < chunkProgress.completed;
                        const isActive = i === chunkProgress.completed;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                              isDone ? 'bg-green-500/60' : isActive ? 'bg-amber-500/60 animate-pulse' : 'bg-white/10'
                            }`} />
                            <span className={`text-[10px] transition-all ${
                              isDone ? 'text-green-300 font-bold' : isActive ? 'text-amber-300 font-bold' : 'text-white/30'
                            }`}>
                              {isDone ? '✓ ' : ''}블록 {i + 1}
                            </span>
                          </div>
                        );
                      })
                    ) : [
                      { label: '문맥 분석', threshold: 5 },
                      { label: '프롬프트', threshold: 15 },
                      { label: '캐릭터', threshold: 30 },
                      { label: '품질 검수', threshold: 60 },
                    ].map((step, i, arr) => {
                      const isLast = i === arr.length - 1;
                      const isActive = elapsed >= (i === 0 ? 0 : arr[i - 1].threshold) && elapsed < step.threshold;
                      // [FIX #245] 마지막 단계는 분석 완료 전까지 "진행 중"(amber) 유지 — 거짓 완료 표시 방지
                      const isDone = isLast ? false : elapsed >= step.threshold;
                      const isLastActive = isLast && elapsed >= (arr[i - 1].threshold);
                      return (
                        <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
                          <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${
                            isDone ? 'bg-green-500/60' : (isActive || isLastActive) ? 'bg-amber-500/60 animate-pulse' : 'bg-white/10'
                          }`} />
                          <span className={`text-[10px] transition-all ${
                            isDone ? 'text-green-300 font-bold' : (isActive || isLastActive) ? 'text-amber-300 font-bold' : 'text-white/30'
                          }`}>
                            {isDone ? '✓ ' : ''}{step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 친절한 안내 메시지 */}
                <div className="bg-white/5 rounded-lg px-4 py-2 text-center max-w-sm">
                  <p className="text-xs text-white/40 leading-relaxed">
                    {chunkProgress
                      ? `긴 대본을 ${chunkProgress.total}개 블록으로 나눠 동시에 분석합니다. 보통 1~3분 소요됩니다.`
                      : elapsed < 30
                      ? '이 과정은 AI가 각 장면에 최적화된 이미지 프롬프트를 만드는 핵심 단계입니다. 장면 수에 따라 20초~2분 소요됩니다.'
                      : elapsed < 60
                      ? '장면별로 캐릭터 외모, 카메라 앵글, 조명 등 세부사항을 꼼꼼하게 설계하고 있습니다.'
                      : elapsed < 120
                      ? '대본이 길거나 장면이 많을수록 더 정교한 분석이 진행됩니다. 창을 닫지 마세요!'
                      : '서버가 바쁠 때는 응답이 지연될 수 있습니다. 실패 시 자동으로 안내해드릴게요.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                스토리보드 생성
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </>
            )}
          </button>
        ) : (
          /* 장면 있음: 스토리보드 열기 + 보강/재생성 옵션 */
          <div className="space-y-2">
            <button type="button" onClick={handleCreateStoryboard} disabled={isAnalyzing}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 text-white text-base font-bold px-6 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:shadow-none flex items-center justify-center gap-3">
              {isAnalyzing ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="flex flex-col items-center">
                    <span>장면별 이미지 프롬프트 생성 중...</span>
                    <span className="text-xs text-white/50 font-normal">기존 데이터(오디오/이미지)는 보존됩니다</span>
                  </span>
                  {elapsed > 0 && <span className="text-xs text-white/70 tabular-nums">{formatElapsed(elapsed)}</span>}
                </>
              ) : (
                <>스토리보드 열기 ({totalScenes}개 장면)</>
              )}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>

            {/* [FIX #290] 장면 초기화 — 이전 프로젝트 잔여 데이터 제거 */}
            <button type="button" disabled={isAnalyzing}
              onClick={() => {
                if (!window.confirm(`현재 ${totalScenes}개 장면을 모두 삭제하고 처음부터 다시 분석하시겠습니까? (이미지/영상 포함 삭제)`)) return;
                useProjectStore.getState().setScenes([]);
                useImageVideoStore.getState().setTargetSceneCount(null);
                showToast('장면이 초기화되었습니다. 대본을 확인 후 "스토리보드 생성"을 눌러주세요.');
              }}
              className="w-full text-xs text-gray-500 hover:text-red-400 py-2 transition-colors disabled:opacity-30">
              장면 초기화 ({totalScenes}개 삭제)
            </button>

          </div>
        )}
        {!config?.script && totalScenes === 0 && !directInputMode && (
          <p className="text-center text-xs text-gray-600 mt-3">
            대본작성 탭에서 대본을 먼저 준비하거나, "대본 직접 입력" 모드를 활성화하세요
          </p>
        )}
      </div>

      <CharacterLibraryModal isOpen={showCharacterLibrary} onClose={() => setShowCharacterLibrary(false)} onLoad={handleLoadFromLibrary} currentCharacterCount={characters.length} maxCharacters={5} />
    </div>
  );
};

export default SetupPanel;
