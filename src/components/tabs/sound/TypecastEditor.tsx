import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import JSZip from 'jszip';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { logger } from '../../../services/LoggerService';
import { mergeAudioFiles, splitBySentenceEndings, ensurePremiereCompatibleWav } from '../../../services/ttsService';
import { fetchTypecastVoices, V30_EMOTIONS, V21_EMOTIONS, TYPECAST_LANGUAGES } from '../../../services/typecastService';
import type { TypecastVoice } from '../../../services/typecastService';
import { ELEVENLABS_VOICES, elNameKo } from '../../../services/elevenlabsService';
import type { ElevenLabsVoice } from '../../../services/elevenlabsService';
import { generateSpeech as generateSupertonicSpeech, isModelLoaded as isSupertonicLoaded, initSupertonic } from '../../../services/supertonicService';
import type { ScriptLine, TTSLanguage, Speaker, TTSEngine } from '../../../types';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { TYPECAST_EMOTIONS, TYPECAST_MODELS } from '../../../constants';
import { showToast, useUIStore } from '../../../stores/uiStore';
import MiniWaveform from './MiniWaveform';

// Supertonic 2 음성 카탈로그 (10개, HuggingFace Supertone/supertonic-2 기준)
const SUPERTONIC_VOICE_INFO = [
  { id: 'F1', name: '수아', gender: 'female' as const, desc: '차분하고 안정적인 낮은 톤', tags: ['내레이션', '다큐멘터리', 'ASMR'] },
  { id: 'F2', name: '하늘', gender: 'female' as const, desc: '밝고 쾌활한 발랄한 목소리', tags: ['광고', '숏폼', '엔터테인먼트'] },
  { id: 'F3', name: '서연', gender: 'female' as const, desc: '프로 아나운서, 또렷한 발음', tags: ['뉴스', '교육', '안내'] },
  { id: 'F4', name: '지현', gender: 'female' as const, desc: '또렷하고 자신감 있는 표현력', tags: ['프레젠테이션', '강의', '광고'] },
  { id: 'F5', name: '은서', gender: 'female' as const, desc: '다정하고 부드러운 치유 목소리', tags: ['명상', '오디오북', '힐링'] },
  { id: 'M1', name: '준서', gender: 'male' as const, desc: '활기차고 자신감 넘치는 에너지', tags: ['광고', '스포츠', '엔터테인먼트'] },
  { id: 'M2', name: '민호', gender: 'male' as const, desc: '깊고 묵직한 진지하고 차분한', tags: ['다큐멘터리', '뉴스', '내레이션'] },
  { id: 'M3', name: '현우', gender: 'male' as const, desc: '세련된 권위감, 신뢰를 주는', tags: ['기업', '교육', '다큐'] },
  { id: 'M4', name: '지훈', gender: 'male' as const, desc: '부드럽고 중립적, 친근한 톤', tags: ['대화', '팟캐스트', 'AI 어시스턴트'] },
  { id: 'M5', name: '도윤', gender: 'male' as const, desc: '따뜻하고 차분한 내레이션', tags: ['오디오북', '내레이션', '명상'] },
];

// ElevenLabs v3 Audio Tags — 텍스트 앞에 [tag] 삽입으로 감정 제어
const ELEVENLABS_EMOTIONS: { id: string; label: string; icon: string; tag: string; stability: number }[] = [
  { id: 'none', label: '기본', icon: '🔊', tag: '', stability: 0.5 },
  { id: 'happy', label: '기쁨', icon: '😊', tag: '[happily]', stability: 0.3 },
  { id: 'sad', label: '슬픔', icon: '😢', tag: '[sad]', stability: 0.3 },
  { id: 'angry', label: '분노', icon: '😠', tag: '[angry]', stability: 0.0 },
  { id: 'excited', label: '흥분', icon: '🤩', tag: '[excited]', stability: 0.0 },
  { id: 'calm', label: '차분', icon: '😌', tag: '[calm]', stability: 1.0 },
  { id: 'whisper', label: '속삭임', icon: '🤫', tag: '[whispers]', stability: 0.5 },
  { id: 'dramatic', label: '극적', icon: '🎭', tag: '[dramatic]', stability: 0.0 },
  { id: 'sarcastic', label: '비꼼', icon: '😏', tag: '[sarcastically]', stability: 0.3 },
  { id: 'nervous', label: '긴장', icon: '😰', tag: '[nervous]', stability: 0.3 },
  { id: 'cheerful', label: '명랑', icon: '😄', tag: '[cheerfully]', stability: 0.3 },
  { id: 'crying', label: '울먹임', icon: '😭', tag: '[crying]', stability: 0.0 },
];
const CREDIT_ERROR_RE = /(402|payment required|quota_exhausted|insufficient|잔액 부족|크레딧(이|을)?\s*부족)/i;

interface TypecastEditorProps {
  onGenerateLine: (lineId: string) => Promise<void> | void;
  isGeneratingLine: string | null;
  onOpenVoiceBrowser: (forLineIndex?: number) => void;
  changingLineIndex: number | null;
}

const TypecastEditor: React.FC<TypecastEditorProps> = ({ onGenerateLine, isGeneratingLine, onOpenVoiceBrowser, changingLineIndex }) => {
  const lines = useSoundStudioStore(s => s.lines);
  const speakers = useSoundStudioStore(s => s.speakers);
  const updateSpeaker = useSoundStudioStore(s => s.updateSpeaker);
  const setLines = useSoundStudioStore(s => s.setLines);
  const updateLine = useSoundStudioStore(s => s.updateLine);
  const addLineAfter = useSoundStudioStore(s => s.addLineAfter);
  const removeLine = useSoundStudioStore(s => s.removeLine);
  const addSpeaker = useSoundStudioStore(s => s.addSpeaker);
  const mergedAudioUrl = useSoundStudioStore(s => s.mergedAudioUrl);
  const setMergedAudio = useSoundStudioStore(s => s.setMergedAudio);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const animFrameRef = useRef<number>(0);
  const lineDurationsRef = useRef<number[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  // [FIX] 라인 duration으로 총 길이 계산 — 탭 전환 후에도 정확한 시간 표시
  const storedDuration = useMemo(() => lines.reduce((s, l) => s + (l.duration || 0), 0), [lines]);
  const totalDuration = playbackDuration > 0 ? playbackDuration : storedDuration;
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const elapsedGenAll = useElapsedTimer(isGeneratingAll);

  // 다운로드 모달
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [dlQuality, setDlQuality] = useState<'high'|'medium'|'low'>('high');
  const [dlFormat, setDlFormat] = useState<'mp3'|'wav'>('mp3');
  const [dlRange, setDlRange] = useState<'all'|'selected'>('all');
  const [dlMerge, setDlMerge] = useState<'merge'|'split'>('merge');
  const [dlSelectedLines, setDlSelectedLines] = useState<Set<number>>(new Set());
  const [showDlLineSelect, setShowDlLineSelect] = useState(false);
  const [dlDownloading, setDlDownloading] = useState(false);
  const [dlError, setDlError] = useState('');

  // 속도/강도 팝오버
  const [showSpeedPopover, setShowSpeedPopover] = useState(false);
  const [showIntensityPopover, setShowIntensityPopover] = useState(false);
  const [showPitchPopover, setShowPitchPopover] = useState(false);
  const [maxMode, setMaxMode] = useState(false);

  const ttsEngine = useSoundStudioStore(s => s.ttsEngine);
  // [FIX #533] 멀티캐릭터: 클릭된 라인의 speakerId로 해당 Speaker를 찾아 사용
  const [pickerTargetLineIdx, setPickerTargetLineIdx] = useState<number>(0);
  const activeSpeaker = (() => {
    const targetLine = lines[pickerTargetLineIdx];
    if (targetLine?.speakerId) {
      const found = speakers.find(s => s.id === targetLine.speakerId);
      if (found) return found;
    }
    return speakers[0] || null;
  })();
  const currentEngine = activeSpeaker?.engine || ttsEngine || 'typecast';

  // 모달 미리듣기 오디오
  const pickerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [pickerPlayingId, setPickerPlayingId] = useState<string | null>(null);

  const handlePickerPlay = useCallback((voiceId: string, previewUrl?: string) => {
    // 기존 재생 중지
    if (pickerAudioRef.current) {
      pickerAudioRef.current.pause();
      unregisterAudio(pickerAudioRef.current);
      pickerAudioRef.current = null;
    }
    // 같은 캐릭터면 정지만
    if (pickerPlayingId === voiceId) {
      setPickerPlayingId(null);
      return;
    }
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    registerAudio(audio);
    pickerAudioRef.current = audio;
    setPickerPlayingId(voiceId);
    audio.onended = () => { setPickerPlayingId(null); unregisterAudio(audio); pickerAudioRef.current = null; };
    audio.onerror = () => { setPickerPlayingId(null); unregisterAudio(audio); pickerAudioRef.current = null; };
    audio.play().catch(() => { setPickerPlayingId(null); unregisterAudio(audio); });
  }, [pickerPlayingId]);

  // 줄별 캐릭터 피커 모달
  const [pickerLineIdx, setPickerLineIdx] = useState<number | null>(null);
  const [pickerVoices, setPickerVoices] = useState<TypecastVoice[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerShowFilter, setPickerShowFilter] = useState(false);
  const [pickerAgeFilters, setPickerAgeFilters] = useState<string[]>([]);
  const [pickerContentFilters, setPickerContentFilters] = useState<string[]>([]);
  const [pickerLangFilter, setPickerLangFilter] = useState<string>('');

  // ElevenLabs 전용 피커 상태
  const [elPickerOpen, setElPickerOpen] = useState(false);
  const [elPickerSearch, setElPickerSearch] = useState('');
  const [elPickerGender, setElPickerGender] = useState<string>('');
  const [elPickerAccent, setElPickerAccent] = useState<string>('');
  const [elPickerAge, setElPickerAge] = useState<string>('');
  const [elPickerUseCase, setElPickerUseCase] = useState<string>('');

  // Supertonic 전용 피커 상태
  const [stPickerOpen, setStPickerOpen] = useState(false);
  const [stPreviewLoading, setStPreviewLoading] = useState<string | null>(null);
  const stPreviewCacheRef = useRef<Record<string, string>>({});

  // 캐릭터 피커 열기 — 엔진별 분기
  const openCharacterPicker = useCallback(async (lineIdx: number) => {
    setPickerTargetLineIdx(lineIdx); // [FIX #533] 멀티캐릭터: 클릭된 라인 추적
    if (currentEngine === 'elevenlabs') {
      setPickerLineIdx(lineIdx);
      setElPickerOpen(true);
      setElPickerSearch('');
      setElPickerGender('');
      setElPickerAccent('');
      setElPickerAge('');
      setElPickerUseCase('');
      return;
    }
    if (currentEngine === 'supertonic') {
      setPickerLineIdx(lineIdx);
      setStPickerOpen(true);
      return;
    }
    // Typecast → 내장 피커 모달
    setPickerLineIdx(lineIdx);
    setPickerSearch('');
    if (pickerVoices.length === 0) {
      const voices = await fetchTypecastVoices();
      setPickerVoices(voices);
    }
  }, [pickerVoices.length, currentEngine]);

  // 에디터 HTML 강제 재구성
  const forceRebuildEditor = useCallback(() => {
    if (!editorRef.current) return;
    const currentLines = useSoundStudioStore.getState().lines;
    const sp = speakers[0] || null;
    isSyncing.current = true;
    let html = '';
    let lineNum = 0;
    currentLines.forEach((line, idx) => {
      const vid = line.voiceId || sp?.voiceId || '';
      const vname = line.voiceName || sp?.name || '';
      const vimg = line.voiceImage || sp?.imageUrl || '';
      const prevVid = idx > 0 ? (currentLines[idx - 1].voiceId || sp?.voiceId || '') : '';
      const showHeader = idx === 0 || vid !== prevVid;
      lineNum++;
      const numBadge = `<span contenteditable="false" class="tc-line-num absolute left-[32px] top-2 w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400 z-10 select-none">${lineNum}</span>`;
      if (showHeader) {
        html += `<div contenteditable="false" class="flex items-center gap-2 py-2 pl-1 cursor-pointer select-none" data-char-header="${idx}">`;
        html += `<div class="w-9 h-9 rounded-full overflow-hidden border-2 border-gray-600 bg-gray-700 shrink-0 shadow-md">`;
        html += vimg ? `<img src="${vimg}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-white font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-xs">${(vname || '?')[0]}</div>`;
        html += `</div><span class="text-sm font-bold text-white">${vname || '캐릭터 선택'}</span><span class="text-gray-500 text-xs">▶</span></div>`;
      }
      html += `<p data-line="${idx}" class="tc-line relative py-2 pl-14 pr-2 leading-relaxed border-l-2 border-yellow-400/20 hover:border-yellow-400/50 hover:bg-yellow-500/5 min-h-[2em] transition-colors"><span contenteditable="false" data-change-char="${idx}" class="tc-change-btn absolute left-0 top-1 w-7 h-7 rounded-lg bg-gray-700/90 border border-gray-500 flex items-center justify-center text-[10px] cursor-pointer z-10 shadow-md">🔄</span>${numBadge}${line.text || '<br>'}</p>`;
    });
    editorRef.current.innerHTML = html;
    // 커서 복원
    if (currentLines.length > 0) {
      const lastP = editorRef.current.querySelector(`p[data-line="${currentLines.length - 1}"]`);
      if (lastP) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(lastP);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    isSyncing.current = false;
  }, [speakers]);

  // [FIX #418] 캐릭터 선택 → 클릭한 줄만 변경 (기존: 같은 voiceId 그룹 전체 변경 → 멀티캐릭터 불가)
  // [FIX #783/#791] speaker 전체 voice 업데이트 제거 — 개별 줄만 변경하도록 수정
  const handlePickCharacter = useCallback((voice: TypecastVoice) => {
    if (pickerLineIdx === null) return;
    const line = lines[pickerLineIdx];
    if (!line) return;
    const update = {
      voiceId: voice.voice_id,
      voiceName: voice.name,
      voiceImage: voice.image_url,
      audioUrl: undefined,
      ttsStatus: 'idle' as const,
    };
    // [FIX #783/#791] 줄별 독립 캐릭터 설정:
    // - speaker.voiceId가 비어있으면(최초 선택) → speaker도 업데이트 (TTS 생성 게이트 통과용)
    // - speaker.voiceId가 이미 있으면 → speaker는 건드리지 않음 (다른 줄 기본값 보호)
    const primaryLang = voice.language[0];
    const langMap: Record<string, TTSLanguage> = { kor: 'ko', jpn: 'ja', eng: 'en' };
    const detectedLang = langMap[primaryLang] || 'ko';
    if (activeSpeaker && !activeSpeaker.voiceId) {
      updateSpeaker(activeSpeaker.id, {
        language: detectedLang,
        voiceId: voice.voice_id,
        name: voice.name,
        imageUrl: voice.image_url,
      });
      setTcLanguage(detectedLang);
    }
    // [FIX #418] 클릭한 줄만 변경 — 멀티캐릭터: 줄별 독립 설정 가능
    updateLine(line.id, update);
    // 모달 닫기
    if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; }
    setPickerPlayingId(null);
    setPickerLineIdx(null);
    // 에디터 재구성 (다음 틱에서 store 반영 후)
    setTimeout(() => forceRebuildEditor(), 50);
  }, [pickerLineIdx, lines, updateLine, forceRebuildEditor, activeSpeaker]);

  // [FIX #418] ElevenLabs 캐릭터 선택 → 클릭한 줄만 변경
  const handlePickElevenLabsVoice = useCallback((voice: ElevenLabsVoice) => {
    if (pickerLineIdx === null) return;
    const line = lines[pickerLineIdx];
    if (!line) return;
    const update = {
      voiceId: voice.id,
      voiceName: elNameKo(voice.name),
      voiceImage: undefined,
      audioUrl: undefined,
      ttsStatus: 'idle' as const,
    };
    updateLine(line.id, update);
    if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; }
    setPickerPlayingId(null);
    setElPickerOpen(false);
    setPickerLineIdx(null);
    setTimeout(() => forceRebuildEditor(), 50);
  }, [pickerLineIdx, lines, updateLine, forceRebuildEditor, activeSpeaker]);

  // [FIX #418] Supertonic 캐릭터 선택 → 클릭한 줄만 변경
  const handlePickSupertonicVoice = useCallback((voiceId: string, voiceName: string) => {
    if (pickerLineIdx === null) return;
    const line = lines[pickerLineIdx];
    if (!line) return;
    const update = {
      voiceId,
      voiceName,
      voiceImage: undefined,
      audioUrl: undefined,
      ttsStatus: 'idle' as const,
    };
    updateLine(line.id, update);
    if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; }
    setPickerPlayingId(null);
    setStPickerOpen(false);
    setPickerLineIdx(null);
    setTimeout(() => forceRebuildEditor(), 50);
  }, [pickerLineIdx, lines, updateLine, forceRebuildEditor]);

  // Supertonic 미리듣기 (온디맨드 TTS 생성)
  const handleSupertonicPreview = useCallback(async (voiceId: string) => {
    // 토글: 같은 음성이면 정지
    if (pickerPlayingId === voiceId) {
      if (pickerAudioRef.current) { pickerAudioRef.current.pause(); unregisterAudio(pickerAudioRef.current); pickerAudioRef.current = null; }
      setPickerPlayingId(null);
      return;
    }
    // 기존 재생 중지
    if (pickerAudioRef.current) { pickerAudioRef.current.pause(); unregisterAudio(pickerAudioRef.current); pickerAudioRef.current = null; }

    // 캐시 확인
    if (stPreviewCacheRef.current[voiceId]) {
      setPickerPlayingId(voiceId);
      const audio = new Audio(stPreviewCacheRef.current[voiceId]);
      registerAudio(audio);
      pickerAudioRef.current = audio;
      audio.onended = () => { setPickerPlayingId(null); unregisterAudio(audio); pickerAudioRef.current = null; };
      audio.play().catch(() => { setPickerPlayingId(null); unregisterAudio(audio); });
      return;
    }

    // 모델 로드 + 생성
    setStPreviewLoading(voiceId);
    try {
      if (!isSupertonicLoaded()) await initSupertonic();
      const result = await generateSupertonicSpeech('안녕하세요, 저는 AI 나레이션 음성입니다.', 'ko', voiceId, 1.0);
      stPreviewCacheRef.current[voiceId] = result.audioUrl;
      setPickerPlayingId(voiceId);
      const audio = new Audio(result.audioUrl);
      registerAudio(audio);
      pickerAudioRef.current = audio;
      audio.onended = () => { setPickerPlayingId(null); unregisterAudio(audio); pickerAudioRef.current = null; };
      audio.play().catch(() => { setPickerPlayingId(null); unregisterAudio(audio); });
    } catch (e) {
      logger.trackSwallowedError('TypecastEditor:playModelPreview', e);
      // 모델 로드 실패 등
    } finally {
      setStPreviewLoading(null);
    }
  }, [pickerPlayingId]);

  // contenteditable → store 동기화 (data-line <p>만 읽음, 캐릭터 헤더 + 🔄 버튼 무시)
  const getCleanParagraphText = useCallback((p: Element): string => {
    // contenteditable="false" 스팬(🔄 버튼)을 제외하고 순수 텍스트만 추출
    let text = '';
    p.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        // contenteditable="false" 스팬(캐릭터 변경 버튼)은 건너뜀
        if (el.getAttribute('contenteditable') === 'false') return;
        text += el.textContent || '';
      }
    });
    return text.trim();
  }, []);

  const syncEditorToStore = useCallback(() => {
    if (!editorRef.current || isSyncing.current) return;
    isSyncing.current = true;
    const paragraphs = editorRef.current.querySelectorAll('p');
    const newTexts: string[] = [];
    paragraphs.forEach(p => { const t = getCleanParagraphText(p); if (t) newTexts.push(t); });
    const currentLines = useSoundStudioStore.getState().lines;
    const currentTexts = currentLines.map(l => l.text);
    if (newTexts.length !== currentTexts.length || newTexts.some((t, i) => t !== currentTexts[i])) {
      const usedLineIds = new Set<string>();
      const textBuckets = new Map<string, ScriptLine[]>();
      currentLines.forEach((line) => {
        if (!textBuckets.has(line.text)) textBuckets.set(line.text, []);
        textBuckets.get(line.text)!.push(line);
      });
      const takeTextMatchedLine = (text: string): ScriptLine | undefined => {
        const bucket = textBuckets.get(text);
        if (!bucket) return undefined;
        while (bucket.length > 0) {
          const candidate = bucket.shift();
          if (!candidate) continue;
          if (usedLineIds.has(candidate.id)) continue;
          usedLineIds.add(candidate.id);
          return candidate;
        }
        return undefined;
      };

      setLines(newTexts.map((text, i) => {
        const ex = currentLines[i];
        let sourceLine: ScriptLine | undefined;
        if (ex && ex.text === text && !usedLineIds.has(ex.id)) {
          usedLineIds.add(ex.id);
          sourceLine = ex;
        } else {
          sourceLine = takeTextMatchedLine(text);
        }
        const fallbackSpeakerId = ex?.speakerId || speakers[0]?.id || '';
        const isTextPreserved = sourceLine?.text === text;
        const preservedSpeakerId = sourceLine?.speakerId || fallbackSpeakerId;
        const preservedDuration = sourceLine?.duration ?? ex?.duration;
        const preservedStartTime = sourceLine?.startTime ?? ex?.startTime;
        const preservedEndTime = sourceLine?.endTime ?? ex?.endTime;
        const preservedSceneId = sourceLine?.sceneId ?? ex?.sceneId;
        const preservedAudioSource = isTextPreserved ? (sourceLine?.audioSource ?? ex?.audioSource) : undefined;
        const preservedUploadedAudioId = isTextPreserved ? (sourceLine?.uploadedAudioId ?? ex?.uploadedAudioId) : undefined;
        return {
          id: sourceLine?.id || ex?.id || `line-${Date.now()}-${i}`,
          speakerId: preservedSpeakerId,
          text,
          index: i,
          emotion: sourceLine?.emotion ?? ex?.emotion,
          lineSpeed: sourceLine?.lineSpeed ?? ex?.lineSpeed,
          voiceId: sourceLine?.voiceId ?? ex?.voiceId,
          voiceName: sourceLine?.voiceName ?? ex?.voiceName,
          voiceImage: sourceLine?.voiceImage ?? ex?.voiceImage,
          sceneId: preservedSceneId,
          audioSource: preservedAudioSource,
          uploadedAudioId: preservedUploadedAudioId,
          ...(isTextPreserved ? {
            duration: preservedDuration,
            startTime: preservedStartTime,
            endTime: preservedEndTime,
          } : {}),
          ttsStatus: (isTextPreserved ? (sourceLine?.ttsStatus ?? ex?.ttsStatus ?? 'idle') : 'idle') as ScriptLine['ttsStatus'],
          audioUrl: isTextPreserved ? (sourceLine?.audioUrl ?? ex?.audioUrl) : undefined,
        };
      }));
    }
    isSyncing.current = false;
  }, [speakers, setLines, getCleanParagraphText]);

  // store → editor 초기 로드 (캐릭터 헤더 포함)
  useEffect(() => {
    if (!editorRef.current || isSyncing.current) return;
    // 에디터의 <p> 수와 lines 수가 다를 때만 재구성
    const existingPs = editorRef.current.querySelectorAll('p[data-line]');
    if (existingPs.length === lines.length && lines.length > 0) return;
    if (lines.length === 0) return;

    isSyncing.current = true;
    let html = '';
    let lineNum = 0;
    lines.forEach((line, idx) => {
      // [FIX #533] 멀티캐릭터: 라인별 speakerId로 해당 Speaker 찾기
      const lineSpeaker = line.speakerId ? speakers.find(s => s.id === line.speakerId) : null;
      const vid = line.voiceId || lineSpeaker?.voiceId || activeSpeaker?.voiceId || '';
      const vname = line.voiceName || lineSpeaker?.name || activeSpeaker?.name || '';
      const vimg = line.voiceImage || lineSpeaker?.imageUrl || activeSpeaker?.imageUrl || '';
      const prevLine = idx > 0 ? lines[idx - 1] : null;
      const prevLineSpeaker = prevLine?.speakerId ? speakers.find(s => s.id === prevLine.speakerId) : null;
      const prevVid = prevLine ? (prevLine.voiceId || prevLineSpeaker?.voiceId || activeSpeaker?.voiceId || '') : '';
      const showHeader = idx === 0 || vid !== prevVid;
      lineNum++;
      const numBadge = `<span contenteditable="false" class="tc-line-num absolute left-[32px] top-2 w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400 z-10 select-none">${lineNum}</span>`;

      if (showHeader) {
        html += `<div contenteditable="false" class="flex items-center gap-2 py-2 pl-1 cursor-pointer select-none" data-char-header="${idx}">`;
        html += `<div class="w-9 h-9 rounded-full overflow-hidden border-2 border-gray-600 bg-gray-700 shrink-0 shadow-md">`;
        html += vimg ? `<img src="${vimg}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-white font-bold bg-gradient-to-br from-purple-500 to-pink-500 text-xs">${(vname || '?')[0]}</div>`;
        html += `</div>`;
        html += `<span class="text-sm font-bold text-white">${vname || '캐릭터 선택'}</span>`;
        html += `<span class="text-gray-500 text-xs">▶</span></div>`;
      }
      html += `<p data-line="${idx}" class="tc-line relative py-2 pl-14 pr-2 leading-relaxed border-l-2 border-yellow-400/20 hover:border-yellow-400/50 hover:bg-yellow-500/5 min-h-[2em] transition-colors"><span contenteditable="false" data-change-char="${idx}" class="tc-change-btn absolute left-0 top-1 w-7 h-7 rounded-lg bg-gray-700/90 border border-gray-500 flex items-center justify-center text-[10px] cursor-pointer z-10 shadow-md">🔄</span>${numBadge}${line.text || '<br>'}</p>`;
    });
    editorRef.current.innerHTML = html;
    // 커서 복원: 마지막 줄 끝으로 포커스 이동
    const lastP = editorRef.current.querySelector(`p[data-line="${lines.length - 1}"]`);
    if (lastP) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(lastP);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      editorRef.current.focus();
    }
    isSyncing.current = false;
  }, [lines.length]);

  // voiceId 변경 감지 → 에디터 재구성
  const voiceSignature = lines.map(l => l.voiceId || '').join(',') + '|' + (activeSpeaker?.voiceId || '');
  const prevVoiceSig = useRef(voiceSignature);
  useEffect(() => {
    if (prevVoiceSig.current !== voiceSignature && lines.length > 0) {
      prevVoiceSig.current = voiceSignature;
      forceRebuildEditor();
    }
  }, [voiceSignature, lines.length, forceRebuildEditor]);

  // 전역 설정 — speaker store에서 초기값 로드
  const [smartEmotion, setSmartEmotion] = useState(() => (activeSpeaker?.emotionMode ?? 'smart') === 'smart');
  const [globalEmotion, setGlobalEmotion] = useState('normal');
  const [elEmotion, setElEmotion] = useState('none'); // ElevenLabs Audio Tag 감정
  const [elLanguage, setElLanguage] = useState('auto'); // ElevenLabs 언어 (globalEmotion과 분리)
  const [globalIntensity, setGlobalIntensity] = useState(() => Math.round((activeSpeaker?.emotionIntensity ?? 1.0) * 100));
  const [globalSpeed, setGlobalSpeed] = useState(() => activeSpeaker?.speed ?? 1.0);
  const [globalPitch, setGlobalPitch] = useState(() => activeSpeaker?.pitch ?? 0);
  const [globalModel, setGlobalModel] = useState(() => activeSpeaker?.typecastModel ?? 'ssfm-v30');
  const [tcLanguage, setTcLanguage] = useState(() => activeSpeaker?.language ?? 'ko');
  const [pauseDuration, setPauseDuration] = useState(0.3);

  // 모델별 감정 프리셋 배열
  const activeEmotions = useMemo(() => globalModel === 'ssfm-v21' ? V21_EMOTIONS : V30_EMOTIONS, [globalModel]);

  // 감정 라벨 한국어 매핑
  const emotionLabelKo: Record<string, string> = useMemo(() => ({
    normal: '기본', happy: '행복', sad: '슬픔', angry: '분노',
    whisper: '속삭임', toneup: '톤업', tonedown: '톤다운', tonemid: '톤미드',
  }), []);

  // 툴바 설정 → speaker store 동기화
  useEffect(() => {
    if (!activeSpeaker) return;
    updateSpeaker(activeSpeaker.id, { typecastModel: globalModel });
  }, [globalModel, activeSpeaker?.id]);

  useEffect(() => {
    if (!activeSpeaker) return;
    updateSpeaker(activeSpeaker.id, { emotionMode: smartEmotion ? 'smart' : 'preset' });
  }, [smartEmotion, activeSpeaker?.id]);

  useEffect(() => {
    if (!activeSpeaker) return;
    updateSpeaker(activeSpeaker.id, { pitch: globalPitch });
  }, [globalPitch, activeSpeaker?.id]);

  useEffect(() => {
    if (!activeSpeaker) return;
    updateSpeaker(activeSpeaker.id, { emotionIntensity: globalIntensity / 100 });
  }, [globalIntensity, activeSpeaker?.id]);

  // v21 선택 시 Smart Emotion 자동 비활성화
  useEffect(() => {
    if (globalModel === 'ssfm-v21' && smartEmotion) {
      setSmartEmotion(false);
    }
  }, [globalModel]);

  // 빈 에디터에 직접 입력
  const [newLineText, setNewLineText] = useState('');
  // 다중 선택
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());

  // 줄 텍스트 편집
  const handleTextChange = useCallback((lineId: string, text: string) => {
    updateLine(lineId, { text, audioUrl: undefined, ttsStatus: 'idle' });
  }, [updateLine]);

  // Enter로 줄 추가
  const handleKeyDown = useCallback((e: React.KeyboardEvent, lineId: string, idx: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addLineAfter(lineId, '');
      setTimeout(() => {
        const inputs = document.querySelectorAll('[data-line-input]');
        const next = inputs[idx + 1] as HTMLTextAreaElement;
        next?.focus();
      }, 50);
    }
    if (e.key === 'Backspace' && lines[idx]?.text === '' && lines.length > 1) {
      e.preventDefault();
      removeLine(lineId);
      setTimeout(() => {
        const inputs = document.querySelectorAll('[data-line-input]');
        const prev = inputs[Math.max(0, idx - 1)] as HTMLTextAreaElement;
        prev?.focus();
      }, 50);
    }
    // ⌘+Enter: 재생
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePlayAll();
    }
    // ⌘+A: 전체 선택
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      setSelectedLines(new Set(lines.map((_, i) => i)));
    }
  }, [lines, addLineAfter, removeLine]);

  // 새 줄 추가 (빈 상태에서)
  const handleNewLineKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && newLineText.trim()) {
      e.preventDefault();
      const speakerId = speakers[0]?.id || '';
      // 줄바꿈 기준 분할
      const texts = newLineText.split('\n').filter(t => t.trim());
      const newLines: ScriptLine[] = texts.map((text, i) => ({
        id: `line-${Date.now()}-${i}`,
        speakerId, text: text.trim(), index: lines.length + i,
        ttsStatus: 'idle' as const,
      }));
      setLines([...lines, ...newLines]);
      setNewLineText('');
    }
  }, [newLineText, speakers, lines, setLines]);

  // 붙여넣기
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\n')) return; // 단일 라인은 기본 동작
    e.preventDefault();
    const speakerId = speakers[0]?.id || '';
    const texts = text.split('\n').filter(t => t.trim());
    const newLines: ScriptLine[] = texts.map((t, i) => ({
      id: `line-${Date.now()}-${i}`,
      speakerId, text: t.trim(), index: lines.length + i,
      ttsStatus: 'idle' as const,
    }));
    setLines([...lines, ...newLines]);
  }, [speakers, lines, setLines]);

  // 쉼 추가
  const handleAddPause = useCallback(() => {
    if (activeIdx < 0 || activeIdx >= lines.length) return;
    const line = lines[activeIdx];
    updateLine(line.id, { text: line.text + ` [${pauseDuration}초 쉼]`, audioUrl: undefined, ttsStatus: 'idle' });
  }, [activeIdx, lines, pauseDuration, updateLine]);

  // --- 재생 커서 동기화 (requestAnimationFrame 기반) ---
  // 줄별 오디오 duration 캐시 로드
  const loadLineDurations = useCallback(async () => {
    const currentLines = useSoundStudioStore.getState().lines;
    const durations: number[] = [];
    for (const line of currentLines) {
      if (line.duration && line.duration > 0) {
        durations.push(line.duration);
      } else if (line.audioUrl) {
        try {
          const dur = await new Promise<number>((resolve) => {
            const a = new Audio(line.audioUrl as string);
            a.onloadedmetadata = () => resolve(a.duration);
            a.onerror = () => resolve(0);
          });
          durations.push(dur);
        } catch (e) {
          logger.trackSwallowedError('TypecastEditor:measureLineDuration', e);
          durations.push(0);
        }
      } else {
        durations.push(0);
      }
    }
    lineDurationsRef.current = durations;
  }, []);

  // rAF 기반 smooth currentTime 업데이트
  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const tick = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // 현재 재생 위치에 해당하는 줄 인덱스 계산
  const activeLineIdx = useMemo(() => {
    if (!isPlaying || currentTime <= 0) return -1;
    const durs = lineDurationsRef.current;
    if (durs.length === 0) return -1;
    let cumTime = 0;
    for (let i = 0; i < durs.length; i++) {
      const dur = durs[i] || 0;
      if (currentTime >= cumTime && currentTime < cumTime + dur) return i;
      cumTime += dur;
    }
    return -1;
  }, [currentTime, isPlaying]);

  // 에디터 내 활성 줄 하이라이트 + 자동 스크롤
  useEffect(() => {
    if (!editorRef.current) return;
    // 기존 하이라이트 제거
    editorRef.current.querySelectorAll('p.tc-line-active').forEach(el => {
      el.classList.remove('tc-line-active');
      (el as HTMLElement).style.backgroundColor = '';
    });
    if (activeLineIdx < 0) return;
    // 현재 줄 하이라이트
    const activeLine = editorRef.current.querySelector(
      `p[data-line="${activeLineIdx}"]`
    ) as HTMLElement | null;
    if (activeLine) {
      activeLine.classList.add('tc-line-active');
      activeLine.style.backgroundColor = 'rgba(168, 85, 247, 0.15)';
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLineIdx]);

  // 전체 생성 + 재생
  const handlePlayAll = useCallback(async () => {
    if (lines.length === 0) {
      showToast('나레이션 대본이 없습니다. 대본을 먼저 입력해주세요.');
      return;
    }
    if (!activeSpeaker?.voiceId) {
      showToast('음성을 선택해주세요. 상단 음성 브라우저에서 캐릭터를 클릭하세요.');
      return;
    }
    if (mergedAudioUrl && lines.every(l => l.ttsStatus === 'done')) {
      if (audioRef.current) { audioRef.current.pause(); unregisterAudio(audioRef.current); }
      await loadLineDurations();
      const audio = new Audio(mergedAudioUrl);
      registerAudio(audio);
      audioRef.current = audio;
      audio.onloadedmetadata = () => setPlaybackDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => { setIsPlaying(false); setCurrentTime(0); unregisterAudio(audio); };
      setIsPlaying(true);
      audio.play().catch(() => { setIsPlaying(false); unregisterAudio(audio); });
      return;
    }
    setIsGeneratingAll(true);
    setGenProgress({ current: 0, total: lines.length });
    try {
      const failedLines: number[] = [];
      let haltedByCredit = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.audioUrl || line.ttsStatus !== 'done') {
          let thrownMessage = '';
          try {
            await onGenerateLine(line.id);
          } catch (e) {
            thrownMessage = e instanceof Error ? e.message : String(e);
            logger.trackSwallowedError('TypecastEditor:handlePlayAll/onGenerateLine', e);
          }

          const latestLine = useSoundStudioStore.getState().lines.find((l) => l.id === line.id);
          const hasFailed = !latestLine?.audioUrl || latestLine.ttsStatus === 'error';
          if (hasFailed) {
            failedLines.push(i + 1);
            const toastMessage = useUIStore.getState().toast?.message || '';
            const failureMessage = `${thrownMessage} ${toastMessage}`.trim();
            if (CREDIT_ERROR_RE.test(failureMessage)) {
              haltedByCredit = true;
              setGenProgress({ current: i + 1, total: lines.length });
              break;
            }
          }
        }
        setGenProgress({ current: i + 1, total: lines.length });
      }

      if (failedLines.length > 0) {
        const preview = failedLines.slice(0, 5).join(', ');
        const suffix = failedLines.length > 5 ? ` 외 ${failedLines.length - 5}줄` : '';
        if (haltedByCredit) {
          showToast(`크레딧 부족으로 일괄 생성을 중단했습니다. 실패 줄: ${preview}${suffix}`, 5000);
        } else {
          showToast(`일부 줄 생성 실패 (${failedLines.length}줄): ${preview}${suffix}`, 5000);
        }
        return;
      }

      const urls = useSoundStudioStore.getState().lines.filter(l => l.audioUrl).map(l => l.audioUrl as string);
      if (urls.length > 0) {
        const merged = await mergeAudioFiles(urls);
        setMergedAudio(merged);
        await loadLineDurations();
        const audio = new Audio(merged);
        registerAudio(audio);
        audioRef.current = audio;
        audio.onloadedmetadata = () => setPlaybackDuration(audio.duration);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.onended = () => { setIsPlaying(false); setCurrentTime(0); unregisterAudio(audio); };
        setIsPlaying(true);
        audio.play().catch(() => { setIsPlaying(false); unregisterAudio(audio); });
      }
    } finally { setIsGeneratingAll(false); }
  }, [activeSpeaker, lines, mergedAudioUrl, onGenerateLine, setMergedAudio, loadLineDurations]);

  const handlePauseResume = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  }, [isPlaying]);

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  // 대본 직접 입력 state
  const [directScript, setDirectScript] = useState('');

  const handleApplyDirectScript = useCallback(() => {
    if (!directScript.trim()) return;
    const sentences = splitBySentenceEndings(directScript);
    let speakerId = speakers[0]?.id || '';
    if (!speakerId) {
      const newSpeaker: Speaker = {
        id: `speaker-${Date.now()}`, name: '화자 1', color: '#6366f1',
        engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
        speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
        style: 0, useSpeakerBoost: true, lineCount: sentences.length, totalDuration: 0,
      };
      addSpeaker(newSpeaker);
      speakerId = newSpeaker.id;
    }
    setLines(sentences.map((text, i) => ({
      id: `line-${Date.now()}-${i}`, speakerId, text, index: i, ttsStatus: 'idle' as const,
    })));
    setDirectScript('');
  }, [directScript, speakers, addSpeaker, setLines]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* 아이콘 + 타이틀 */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20 border border-fuchsia-500/20 mb-1">
              <svg className="w-8 h-8 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-100">나레이션 대본을 준비해주세요</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              대본작성 탭에서 작업하면 자동으로 연동됩니다.<br/>
              나레이션만 사용하려면 아래에 대본을 직접 붙여넣으세요.
            </p>
          </div>

          {/* 입력 카드 */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-fuchsia-600/20 to-purple-600/20 rounded-xl blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
            <textarea
              value={directScript}
              onChange={e => setDirectScript(e.target.value)}
              placeholder="대본을 여기에 붙여넣거나 직접 입력하세요..."
              className="relative w-full h-44 bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-fuchsia-500/40 focus:ring-1 focus:ring-fuchsia-500/20 transition-all duration-200"
            />
          </div>

          {/* 버튼 */}
          <button
            type="button"
            onClick={handleApplyDirectScript}
            disabled={!directScript.trim()}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 ${directScript.trim() ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white shadow-lg shadow-fuchsia-900/30 hover:shadow-fuchsia-800/40 hover:-translate-y-0.5' : 'bg-gray-800/60 text-gray-600 border border-gray-700/40 cursor-not-allowed'}`}
          >
            {directScript.trim() ? '🎙️ 대본 적용하기' : '대본을 입력하면 시작할 수 있어요'}
          </button>

          {/* 안내 힌트 */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 10-6.364 6.364L4.343 8.69" /></svg>
              대본작성 탭 연동
            </span>
            <span className="w-px h-3 bg-gray-700/50" />
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
              종결어미 기준 자동 분할
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* CSS: 줄 호버 시 🔄 버튼 표시 */}
      <style>{`.tc-change-btn { opacity: 0; transition: opacity 0.15s; } .tc-line:hover .tc-change-btn { opacity: 1; } .tc-change-btn:hover { background: rgba(147,51,234,0.3) !important; border-color: rgb(147,51,234) !important; } .tc-line-active { transition: background-color 0.2s ease; border-left-color: rgba(168,85,247,0.7) !important; }`}</style>
      {/* === 엔진별 툴바 === */}
      {(() => {
        const engine = currentEngine;

        // Supertonic 2: 속도 + 언어만
        if (engine === 'supertonic') return (
          <div className="px-4 py-2.5 bg-gray-900/80 border-b border-gray-700/50 space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-purple-300 bg-purple-900/30 px-2 py-1 rounded border border-purple-500/30 whitespace-nowrap shrink-0">🧠 Supertonic 2</span>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">속도</span>
                <input type="range" min={0.5} max={2.0} step={0.1} value={globalSpeed} onChange={(e) => setGlobalSpeed(Number(e.target.value))} className="w-24 accent-purple-500" />
                <span className="text-xs text-gray-300 whitespace-nowrap">{globalSpeed}x</span>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">언어</span>
                <select value="ko" className="text-xs bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-gray-300">
                  <option value="ko">한국어</option><option value="en">영어</option><option value="fr">프랑스어</option><option value="es">스페인어</option><option value="pt">포르투갈어</option>
                </select>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <button type="button" onClick={() => { if (lines[activeIdx]) onGenerateLine(lines[activeIdx].id); }}
                disabled={!activeSpeaker?.voiceId || !lines[activeIdx]}
                className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold disabled:opacity-30 whitespace-nowrap shrink-0">🔊 음성 재생성</button>
              <button type="button" onClick={() => { lines.forEach(l => updateLine(l.id, { lineSpeed: globalSpeed, audioUrl: undefined, ttsStatus: 'idle' })); }}
                className="text-xs bg-purple-600/20 text-purple-300 px-3 py-1.5 rounded-lg border border-purple-500/30 font-bold whitespace-nowrap shrink-0">전체 적용</button>
            </div>
            <p className="text-xs text-gray-500">로컬 브라우저 실행 (API 키/비용 불필요). 첫 사용 시 ONNX 모델 ~263MB 다운로드.</p>
          </div>
        );

        // ElevenLabs Dialogue V3: 감정 + Stability + Language + Speed
        if (engine === 'elevenlabs') return (
          <div className="px-4 py-2.5 bg-gray-900/80 border-b border-gray-700/50 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-emerald-300 bg-emerald-900/30 px-2 py-1 rounded border border-emerald-500/30 whitespace-nowrap shrink-0">{'\uD83D\uDD0A'} ElevenLabs V3</span>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">감정</span>
                <select value={elEmotion} onChange={(e) => {
                  setElEmotion(e.target.value);
                  const em = ELEVENLABS_EMOTIONS.find(x => x.id === e.target.value);
                  if (em) setGlobalIntensity(em.stability * 100);
                }}
                  className="text-xs bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-gray-300 cursor-pointer">
                  {ELEVENLABS_EMOTIONS.map(em => <option key={em.id} value={em.id}>{em.icon} {em.label}</option>)}
                </select>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">Stability</span>
                <input type="range" min={0} max={1} step={0.05} value={globalIntensity / 100} onChange={(e) => setGlobalIntensity(Number(e.target.value) * 100)} className="w-20 accent-emerald-500" />
                <span className="text-xs text-gray-300 whitespace-nowrap">{(globalIntensity / 100).toFixed(2)}</span>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">{'\uD83C\uDF10'} 언어</span>
                <select value={elLanguage} onChange={(e) => { setElLanguage(e.target.value); if (activeSpeaker) updateSpeaker(activeSpeaker.id, { language: e.target.value as TTSLanguage }); }}
                  className="text-xs bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-gray-300 cursor-pointer max-w-[120px]">
                  <option value="auto">{'\uD83C\uDF10'} 자동 감지</option>
                  <option value="ko">{'\uD83C\uDDF0\uD83C\uDDF7'} 한국어</option>
                  <option value="en">{'\uD83C\uDDFA\uD83C\uDDF8'} English</option>
                  <option value="ja">{'\uD83C\uDDEF\uD83C\uDDF5'} 日本語</option>
                  <option value="zh">{'\uD83C\uDDE8\uD83C\uDDF3'} 中文</option>
                  <option value="es">{'\uD83C\uDDEA\uD83C\uDDF8'} Espa{'\u00F1'}ol</option>
                  <option value="fr">{'\uD83C\uDDEB\uD83C\uDDF7'} Fran{'\u00E7'}ais</option>
                  <option value="de">{'\uD83C\uDDE9\uD83C\uDDEA'} Deutsch</option>
                  <option value="pt">{'\uD83C\uDDE7\uD83C\uDDF7'} Portugu{'\u00EA'}s</option>
                  <option value="it">{'\uD83C\uDDEE\uD83C\uDDF9'} Italiano</option>
                </select>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500 whitespace-nowrap">속도</span>
                <input type="range" min={0.7} max={1.2} step={0.05} value={globalSpeed} onChange={(e) => setGlobalSpeed(Number(e.target.value))} className="w-20 accent-emerald-500" />
                <span className="text-xs text-gray-300 whitespace-nowrap">{globalSpeed}x</span>
              </div>
              <span className="text-gray-600 shrink-0">|</span>
              <button type="button" onClick={() => { if (lines[activeIdx]) onGenerateLine(lines[activeIdx].id); }}
                disabled={!activeSpeaker?.voiceId || !lines[activeIdx]}
                className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold disabled:opacity-30 whitespace-nowrap shrink-0">{'\uD83D\uDD0A'} 음성 재생성</button>
              <button type="button" onClick={() => { lines.forEach(l => updateLine(l.id, { emotion: elEmotion, lineSpeed: globalSpeed, audioUrl: undefined, ttsStatus: 'idle' })); }}
                className="text-xs bg-emerald-600/20 text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/30 font-bold whitespace-nowrap shrink-0">전체 적용</button>
            </div>
            {elEmotion !== 'none' && (
              <p className="text-xs text-emerald-400/70">
                {ELEVENLABS_EMOTIONS.find(e => e.id === elEmotion)?.icon} Audio Tag: {ELEVENLABS_EMOTIONS.find(e => e.id === elEmotion)?.tag} — 텍스트 앞에 감정 태그가 자동 삽입됩니다
              </p>
            )}
          </div>
        );

        // Typecast (기본)
        return null;
      })()}

      {/* Typecast 전용 툴바 */}
      {(activeSpeaker?.engine || ttsEngine || 'typecast') === 'typecast' && (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900/80 border-b border-gray-700/50 flex-wrap">
        <select value={globalModel} onChange={(e) => setGlobalModel(e.target.value as 'ssfm-v30' | 'ssfm-v21')}
          title={TYPECAST_MODELS.find(m => m.id === globalModel)?.description || ''}
          className={`text-xs font-bold rounded-lg px-2.5 py-1.5 cursor-pointer border transition-colors ${globalModel === 'ssfm-v21' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30'}`}>
          {TYPECAST_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <span className="text-gray-600">|</span>
        <button type="button" onClick={() => { if (globalModel !== 'ssfm-v21') setSmartEmotion(!smartEmotion); }}
          disabled={globalModel === 'ssfm-v21'}
          title={globalModel === 'ssfm-v21' ? '스마트 이모션은 최신 음성(v3.0) 전용입니다' : 'AI가 문맥에 맞게 감정을 자동 조절합니다'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${globalModel === 'ssfm-v21' ? 'bg-gray-800 text-gray-500 border-gray-700 opacity-50 cursor-not-allowed' : smartEmotion ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' : 'bg-gray-800 text-gray-400 border-gray-600'}`}>
          🧠 스마트 이모션
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-500">감정</span>
        <select value={globalEmotion} onChange={(e) => setGlobalEmotion(e.target.value)} disabled={smartEmotion}
          className="text-xs bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-gray-300 cursor-pointer">
          {TYPECAST_EMOTIONS.map(em => <option key={em.id} value={em.id}>{em.icon} {em.labelKo}</option>)}
        </select>
        <div className="relative">
          <button type="button" onClick={() => { setShowIntensityPopover(!showIntensityPopover); setShowSpeedPopover(false); }}
            className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 hover:border-gray-400 cursor-pointer min-w-[48px] text-center">
            {globalIntensity}%
          </button>
          {showIntensityPopover && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 w-64" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">강도</span>
                <input type="number" min={0} max={200} step={10} value={globalIntensity} onChange={e => setGlobalIntensity(Number(e.target.value))}
                  className="w-16 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-300 text-center" />
              </div>
              <input type="range" min={0} max={200} step={10} value={globalIntensity} onChange={e => setGlobalIntensity(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500" />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1 mb-3">
                <span>0%</span><span>100%</span><span>200%</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-3">
                <span>약하게</span><span>보통</span><span>강하게</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                <div>
                  <span className="text-xs text-gray-300 font-bold">최대 모드</span>
                  <p className="text-[10px] text-gray-500 mt-0.5">감정 표현을 최대화하지만 불안정합니다</p>
                </div>
                <button type="button" onClick={() => { setMaxMode(!maxMode); if (!maxMode) setGlobalIntensity(200); }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${maxMode ? 'bg-orange-500' : 'bg-gray-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${maxMode ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-500">속도</span>
        <div className="relative">
          <button type="button" onClick={() => { setShowSpeedPopover(!showSpeedPopover); setShowIntensityPopover(false); }}
            className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 hover:border-gray-400 cursor-pointer min-w-[48px] text-center">
            {globalSpeed}x
          </button>
          {showSpeedPopover && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 w-64" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">속도</span>
                <input type="number" min={0.5} max={2.0} step={0.1} value={globalSpeed} onChange={e => { const v = Number(e.target.value); setGlobalSpeed(v); if (activeSpeaker) updateSpeaker(activeSpeaker.id, { speed: v }); }}
                  className="w-16 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-300 text-center" />
              </div>
              <input type="range" min={0.5} max={2.0} step={0.1} value={globalSpeed} onChange={e => { const v = Number(e.target.value); setGlobalSpeed(v); if (activeSpeaker) updateSpeaker(activeSpeaker.id, { speed: v }); }}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500" />
              <div className="flex justify-between text-[10px] text-gray-500 mt-1 mb-2">
                <span>0.5x</span><span>1.0x</span><span>1.5x</span><span>2.0x</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>느리게</span><span>빠르게</span>
              </div>
            </div>
          )}
        </div>
        <span className="text-gray-600">|</span>
        <div className="relative">
          <button type="button" onClick={() => setShowPitchPopover(!showPitchPopover)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${showPitchPopover ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'}`}>
            피치 {globalPitch}
          </button>
          {showPitchPopover && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 z-50 w-64" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">피치</span>
                <input type="number" min={-12} max={12} step={1} value={globalPitch} onChange={(e) => setGlobalPitch(Number(e.target.value))}
                  className="w-14 text-sm bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-gray-200 text-center" />
              </div>
              <input type="range" min={-12} max={12} step={1} value={globalPitch} onChange={(e) => setGlobalPitch(Number(e.target.value))}
                className="w-full accent-orange-500 mb-2" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>-12</span><span>0</span><span>+12</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                <span>낮게</span><span>높게</span>
              </div>
            </div>
          )}
        </div>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-500">쉼</span>
        <input type="number" min={0.1} max={5} step={0.1} value={pauseDuration} onChange={(e) => setPauseDuration(Number(e.target.value))}
          className="w-12 text-xs bg-gray-800 border border-gray-600 rounded px-1 py-1 text-gray-300 text-center" />
        <span className="text-xs text-gray-500">s</span>
        <button type="button" onClick={handleAddPause} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded border border-gray-600">추가</button>
        <button type="button" onClick={() => { if (lines[activeIdx]) onGenerateLine(lines[activeIdx].id); }}
          disabled={!activeSpeaker?.voiceId || !lines[activeIdx]}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-lg border border-gray-600 font-bold disabled:opacity-40 disabled:cursor-not-allowed">
          음성 재생성
        </button>
        <span className="text-gray-600">|</span>
        <select value={tcLanguage} onChange={(e) => { const lang = e.target.value as TTSLanguage; setTcLanguage(lang); if (activeSpeaker) updateSpeaker(activeSpeaker.id, { language: lang }); }}
          className="text-xs bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-gray-300 cursor-pointer">
          <option value="ko">{'\uD83C\uDDF0\uD83C\uDDF7'} 한국어</option>
          <option value="en">{'\uD83C\uDDFA\uD83C\uDDF8'} English</option>
          <option value="ja">{'\uD83C\uDDEF\uD83C\uDDF5'} 日本語</option>
        </select>
        <span className="text-gray-600">|</span>
        <button type="button" onClick={() => {
          lines.forEach(l => updateLine(l.id, { emotion: globalEmotion, lineSpeed: globalSpeed, audioUrl: undefined, ttsStatus: 'idle' }));
          if (activeSpeaker) updateSpeaker(activeSpeaker.id, { speed: globalSpeed });
          setMergedAudio(null);
        }} className="text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 px-3 py-1 rounded-lg border border-purple-500/30 font-bold">전체 적용</button>
      </div>
      )}
      {(activeSpeaker?.engine || ttsEngine || 'typecast') === 'typecast' && smartEmotion && (
        <div className="px-4 py-1.5 bg-blue-900/10 text-xs text-blue-400/70 flex items-center gap-1.5 border-b border-gray-700/30">
          <span>🧠</span><span>Smart Emotion: 전후 문맥 자동 감정 조절 ({TYPECAST_MODELS.find(m => m.id === globalModel)?.labelShort || '최신 v3.0'})</span>
        </div>
      )}

      {/* === 에디터 본문 (contenteditable) === */}
      <div className="flex flex-1 overflow-hidden min-h-[200px]">
        {/* 좌: contenteditable 에디터 */}
        <div className="flex-1 overflow-auto" ref={editorWrapRef}>
          <div className="relative pl-2">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-700/30" />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => syncEditorToStore()}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handlePlayAll(); }
                // ⌘+A — contenteditable="false" 자식 때문에 네이티브 전체 선택이 불완전할 수 있으므로 수동 처리
                if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                  e.preventDefault();
                  if (!editorRef.current) return;
                  const range = document.createRange();
                  range.selectNodeContents(editorRef.current);
                  const sel = window.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                  return;
                }
                // Delete/Backspace — contenteditable="false" 자식 때문에 네이티브 삭제 불가 → 수동 처리
                if (e.key === 'Backspace' || e.key === 'Delete') {
                  if (!editorRef.current) return;
                  const sel = window.getSelection();
                  if (!sel || sel.rangeCount === 0) return;
                  // 선택이 없으면(커서만) 네이티브에 위임
                  if (sel.isCollapsed) return;
                  e.preventDefault();
                  try {
                    const range = sel.getRangeAt(0);
                    // 전체 선택 여부 체크 1: Range API
                    let isFullSelection = false;
                    try {
                      const fullRange = document.createRange();
                      fullRange.selectNodeContents(editorRef.current);
                      isFullSelection =
                        range.compareBoundaryPoints(Range.START_TO_START, fullRange) <= 0
                        && range.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0;
                    } catch (e) { logger.trackSwallowedError('TypecastEditor:compareBoundaryPoints', e); /* compareBoundaryPoints 실패 시 무시 */ }
                    // 전체 선택 여부 체크 2: <p> 태그 기반 (비편집 요소 텍스트 제외)
                    if (!isFullSelection) {
                      const ps = editorRef.current.querySelectorAll('p');
                      const editableText = Array.from(ps).map(p => getCleanParagraphText(p)).join('').replace(/\s/g, '');
                      const selText = sel.toString().replace(/\s/g, '');
                      isFullSelection = editableText.length > 0 && selText.length >= editableText.length * 0.7;
                    }
                    // 전체 선택 여부 체크 3: 줄 수 비교 (선택 범위가 모든 <p>를 포함하는지)
                    if (!isFullSelection) {
                      const ps = editorRef.current.querySelectorAll('p');
                      if (ps.length > 0) {
                        const firstP = ps[0];
                        const lastP = ps[ps.length - 1];
                        isFullSelection = range.intersectsNode(firstP) && range.intersectsNode(lastP);
                      }
                    }
                    if (isFullSelection) {
                      const spId = lines[0]?.speakerId || speakers[0]?.id || '';
                      setLines([{ id: `line-${Date.now()}-0`, speakerId: spId, text: '', index: 0, ttsStatus: 'idle' as const }]);
                      setTimeout(() => forceRebuildEditor(), 30);
                      return;
                    }
                    // 부분 선택 삭제
                    range.deleteContents();
                    const ps = editorRef.current.querySelectorAll('p');
                    if (ps.length === 0) {
                      editorRef.current.innerHTML = '<p class="py-2 pl-14 pr-2 leading-relaxed border-l-2 border-yellow-400/20 min-h-[2em]"><br></p>';
                    }
                    setTimeout(() => syncEditorToStore(), 30);
                  } catch (err) {
                    // 예외 발생 시 안전하게 전체 삭제
                    console.warn('[TypecastEditor] delete handler fallback:', err);
                    const spId = lines[0]?.speakerId || speakers[0]?.id || '';
                    setLines([{ id: `line-${Date.now()}-0`, speakerId: spId, text: '', index: 0, ttsStatus: 'idle' as const }]);
                    setTimeout(() => forceRebuildEditor(), 30);
                  }
                  return;
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text/plain');
                if (!text.includes('\n')) return;
                e.preventDefault();
                const html = text.split('\n').filter(t => t.trim()).map(t =>
                  `<p class="py-2 pl-14 pr-2 leading-relaxed border-l-2 border-yellow-400/20 hover:border-yellow-400/50 hover:bg-yellow-500/5 min-h-[2em] transition-colors">${t.trim()}</p>`
                ).join('');
                document.execCommand('insertHTML', false, html);
                setTimeout(() => syncEditorToStore(), 50);
              }}
              onClick={(e) => {
                if (!editorRef.current) return;
                // 캐릭터 헤더 클릭 감지
                const target = e.target as HTMLElement;
                const headerEl = target.closest('[data-char-header]') as HTMLElement | null;
                if (headerEl) {
                  const headerIdx = parseInt(headerEl.getAttribute('data-char-header') || '0', 10);
                  openCharacterPicker(headerIdx);
                  return;
                }
                // 🔄 캐릭터 변경 버튼 클릭
                const changeBtn = target.closest('[data-change-char]') as HTMLElement | null;
                if (changeBtn) {
                  const charIdx = parseInt(changeBtn.getAttribute('data-change-char') || '0', 10);
                  openCharacterPicker(charIdx);
                  return;
                }
                // 일반 클릭 — 현재 줄 인덱스 추적
                const sel = window.getSelection();
                if (!sel?.anchorNode) return;
                let node: Node | null = sel.anchorNode;
                while (node && node.parentElement !== editorRef.current) node = node.parentElement;
                if (node) {
                  const lineEl = node as HTMLElement;
                  const dataLine = lineEl.getAttribute?.('data-line');
                  if (dataLine !== null) setActiveIdx(parseInt(dataLine, 10));
                }
              }}
              onFocus={() => {
                if (!editorRef.current || editorRef.current.textContent?.trim()) return;
                editorRef.current.innerHTML = '<p class="py-2 pl-14 pr-2 leading-relaxed border-l-2 border-yellow-400/20 min-h-[2em]"><br></p>';
                const p = editorRef.current.querySelector('p');
                if (p) { const r = document.createRange(); r.setStart(p, 0); r.collapse(true); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(r); }
              }}
              className="min-h-[200px] py-2 text-sm text-gray-100 leading-relaxed focus:outline-none"
              style={{ caretColor: '#f59e0b' }}
            />
          </div>

          {/* Enter 안내 */}
          <div className="flex items-center gap-2 py-3 pl-8">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-400 font-mono text-[10px]">↵ Enter</kbd>
            <span className="text-xs text-gray-500">를 눌러 단락을 추가하세요</span>
          </div>
        </div>

        {/* 우: 줄별 감정/속도 */}
        <div className="w-28 shrink-0 border-l border-gray-700/30 overflow-auto">
          {lines.map((line, idx) => {
            const lineVoiceId = line.voiceId || activeSpeaker?.voiceId || '';
            const prevVoiceId = idx > 0 ? (lines[idx - 1].voiceId || activeSpeaker?.voiceId || '') : '';
            const showHeader = idx === 0 || lineVoiceId !== prevVoiceId;
            return (
              <div key={line.id}>
                {/* 캐릭터 헤더 높이 맞춤 spacer */}
                {showHeader && <div style={{ height: '56px' }} />}
                {/* [FIX #418] 줄별 캐릭터 이름 + 감정/속도 컨트롤 */}
                <div className={`flex flex-col gap-0.5 px-1.5 py-2 border-b border-gray-700/15 ${idx === activeIdx ? 'bg-yellow-500/5' : ''}`}
                  style={{ minHeight: '44px' }}>
                  {/* 줄별 캐릭터 표시 — 클릭 시 피커 열기 */}
                  {line.voiceName && (
                    <button type="button"
                      onClick={() => openCharacterPicker(idx)}
                      className="text-[9px] text-fuchsia-400 truncate max-w-full text-left hover:text-fuchsia-300 transition-colors"
                      title={`${line.voiceName} — 클릭해서 변경`}>
                      🎭 {line.voiceName}
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                  <select value={
                    currentEngine === 'elevenlabs'
                      ? (ELEVENLABS_EMOTIONS.some(em => em.id === line.emotion) ? line.emotion : 'none')
                      : (line.emotion || 'normal')
                    }
                    onChange={(e) => updateLine(line.id, { emotion: e.target.value, audioUrl: undefined, ttsStatus: 'idle' })}
                    className="text-[11px] bg-transparent border-none text-gray-400 cursor-pointer focus:outline-none w-10 truncate">
                    {currentEngine === 'elevenlabs'
                      ? ELEVENLABS_EMOTIONS.map(em => <option key={em.id} value={em.id}>{em.icon} {em.label}</option>)
                      : <>{activeEmotions.map(v => <option key={v} value={v}>{emotionLabelKo[v] || v}</option>)}</>
                    }
                  </select>
                  <select value={line.lineSpeed ?? globalSpeed}
                    onChange={(e) => updateLine(line.id, { lineSpeed: parseFloat(e.target.value), audioUrl: undefined, ttsStatus: 'idle' })}
                    className="text-[11px] bg-transparent border-none text-gray-500 cursor-pointer focus:outline-none">
                    {[0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0].map(s =>
                      <option key={s} value={s}>{s}x</option>
                    )}
                  </select>
                  <span className={`text-[9px] font-mono whitespace-nowrap ${line.text.length > 1800 ? 'text-red-400' : line.text.length > 1500 ? 'text-yellow-400' : 'text-gray-600'}`}
                    title={`${line.text.length}/2000자`}>
                    {line.text.length > 0 ? `${line.text.length}` : ''}
                  </span>
                  </div>
                </div>
              </div>
            );
          })}
          {lines.length > 0 && activeSpeaker?.voiceId && (
            <div className="px-1.5 py-2 border-t border-gray-700/30">
              <button type="button"
                onClick={() => { const e = lines[activeIdx]?.emotion || globalEmotion; const s = lines[activeIdx]?.lineSpeed ?? globalSpeed; lines.forEach(l => updateLine(l.id, { emotion: e, lineSpeed: s })); }}
                className="text-[10px] text-gray-500 hover:text-purple-300 px-2 py-1 rounded border border-gray-700/50 hover:border-purple-500/30 w-full text-center">
                같은 캐릭터에 모두 적용
              </button>
            </div>
          )}
        </div>
      </div>

      {/* === 하단 재생 플레이어 === */}
      <div className="border-t border-gray-700/50 bg-gray-900/90">
        {isGeneratingAll && genProgress.total > 0 && (
          <div className="px-4 py-1">
            <div className="flex items-center gap-2 text-xs text-purple-300"><span className="animate-spin">⟳</span><span>생성 중... {genProgress.current}/{genProgress.total}</span>{elapsedGenAll > 0 && <span className="text-purple-300/60 tabular-nums">{formatElapsed(elapsedGenAll)}</span>}</div>
            <div className="w-full h-1 bg-gray-700 rounded-full mt-1"><div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }} /></div>
          </div>
        )}
        {mergedAudioUrl && (
          <MiniWaveform
            audioUrl={mergedAudioUrl}
            currentTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            onSeek={(t) => { if (audioRef.current) { audioRef.current.currentTime = t; } setCurrentTime(t); }}
          />
        )}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-gray-400 font-mono">{formatTime(currentTime)} / {formatTime(totalDuration || lines.reduce((s, l) => s + (l.duration || l.text.length / 5), 0))}</span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; } setCurrentTime(0); }} className="text-white/60 hover:text-white">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><polygon points="6,4 6,16 4,16 4,4" /><polygon points="8,10 16,4 16,16" /></svg>
            </button>
            <button type="button"
              onClick={() => {
                if (isPlaying) { handlePauseResume(); return; }
                // 선행 조건 미충족 시 안내 토스트
                if (lines.length === 0) { showToast('나레이션 대본이 없습니다. 대본을 먼저 입력해주세요.'); return; }
                if (!activeSpeaker?.voiceId) { showToast('음성을 선택해주세요. 상단 음성 브라우저에서 캐릭터를 클릭하세요.'); return; }
                // 이미 생성 완료면 바로 재생
                if (mergedAudioUrl && lines.every(l => l.ttsStatus === 'done')) { handlePlayAll(); return; }
                // 크레딧 소모 확인 — supertonic(무료 음성)은 크레딧 소모 없으므로 스킵
                if (currentEngine !== 'supertonic') {
                  const totalChars = lines.filter(l => l.ttsStatus !== 'done').reduce((s, l) => s + l.text.length, 0);
                  const credits = totalChars * 2;
                  if (credits > 0 && !window.confirm(`${totalChars.toLocaleString()}자 × 2 = ${credits.toLocaleString()} 크레딧이 소모됩니다.\n계속하시겠습니까?`)) return;
                }
                handlePlayAll();
              }}
              disabled={isGeneratingAll}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg ${isGeneratingAll ? 'bg-purple-600 animate-pulse' : (!activeSpeaker?.voiceId || lines.length === 0) ? 'bg-gray-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 hover:scale-105'} text-white transition-all`}
              title={!activeSpeaker?.voiceId ? '음성을 먼저 선택하세요' : lines.length === 0 ? '대본을 먼저 입력하세요' : '재생하기 (⌘+Enter)'}>
              {isGeneratingAll ? '⟳' : isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
            </button>
            <button type="button" className="text-white/60 hover:text-white">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><polygon points="14,4 14,16 16,16 16,4" /><polygon points="12,10 4,4 4,16" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setShowDownloadModal(true)}
              disabled={!mergedAudioUrl}
              className={`text-sm px-4 py-2 rounded-lg font-bold transition-all ${mergedAudioUrl ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
              ⬇ 다운로드
            </button>
            <button type="button"
              onClick={() => {
                if (!mergedAudioUrl) return;
                useSoundStudioStore.getState().setActiveSubTab('waveform');
              }}
              disabled={!mergedAudioUrl}
              className={`text-sm px-4 py-2 rounded-lg font-bold transition-all ${mergedAudioUrl ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
              ✂️ 무음제거
            </button>
          </div>
        </div>
        {/* 선행 조건 미충족 안내 */}
        {!activeSpeaker?.voiceId && lines.length > 0 && (
          <div className="px-4 py-1.5 text-center text-xs text-yellow-400/80 bg-yellow-900/10 border-t border-yellow-500/20">
            음성이 선택되지 않았습니다 — 상단에서 캐릭터를 클릭하여 음성을 선택해주세요
          </div>
        )}
      </div>

      {/* === 다운로드 모달 === */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6" onClick={() => { setShowDownloadModal(false); setShowDlLineSelect(false); }}>
          <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <span className="text-base font-bold text-white">음성 다운로드</span>
              <button onClick={() => { setShowDownloadModal(false); setShowDlLineSelect(false); }} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>

            {showDlLineSelect ? (
              /* 문장 선택 서브뷰 */
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-700/50 flex items-center justify-between">
                  <button type="button" onClick={() => setShowDlLineSelect(false)} className="text-xs text-gray-400 hover:text-white">← 돌아가기</button>
                  <span className="text-xs text-gray-500">{dlSelectedLines.size}개 선택됨</span>
                </div>
                <div className="flex-1 overflow-auto px-5 py-3 space-y-1 max-h-[50vh]">
                  {lines.map((line, idx) => {
                    const vname = line.voiceName || activeSpeaker?.name || '캐릭터';
                    const isChecked = dlSelectedLines.has(idx);
                    return (
                      <label key={line.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isChecked ? 'bg-orange-500/10 border border-orange-500/30' : 'hover:bg-gray-700/30 border border-transparent'}`}>
                        <input type="checkbox" checked={isChecked}
                          onChange={() => {
                            const next = new Set(dlSelectedLines);
                            if (isChecked) next.delete(idx); else next.add(idx);
                            setDlSelectedLines(next);
                          }}
                          className="w-4 h-4 rounded border-gray-500 accent-orange-500" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-gray-500 font-bold">{vname}</span>
                          <p className="text-xs text-gray-300 truncate">{line.text || '(빈 문장)'}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="px-5 py-3 border-t border-gray-700/50 flex gap-2">
                  <button type="button" onClick={() => setDlSelectedLines(new Set(lines.map((_, i) => i)))}
                    className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-600">전체 선택</button>
                  <button type="button" onClick={() => setDlSelectedLines(new Set())}
                    className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-600">전체 해제</button>
                  <button type="button" onClick={() => setShowDlLineSelect(false)}
                    className="flex-1 text-xs bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 rounded-lg font-bold">확인 ({dlSelectedLines.size}개)</button>
                </div>
              </div>
            ) : (
              /* 메인 다운로드 설정 */
              <div className="px-5 py-4 space-y-4 overflow-auto max-h-[70vh]">
                {/* 오디오 품질 */}
                <div>
                  <label className="text-xs font-bold text-gray-300 mb-1.5 block">오디오 품질</label>
                  <select value={dlQuality} onChange={e => setDlQuality(e.target.value as 'high'|'medium'|'low')}
                    className="w-full text-sm bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-200 cursor-pointer focus:outline-none focus:border-orange-500">
                    <option value="high">높음 (320kbps)</option>
                    <option value="medium">보통 (192kbps)</option>
                    <option value="low">낮음 (128kbps)</option>
                  </select>
                </div>

                {/* 파일 형식 — [FIX #965] Premiere 호환 WAV 고정 */}
                <div>
                  <label className="text-xs font-bold text-gray-300 mb-1.5 block">파일 형식</label>
                  <div className="w-full text-sm bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-200">
                    WAV (48kHz / 16-bit PCM)
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">Premiere Pro / DaVinci / Final Cut 호환 포맷</p>
                </div>

                {/* 다운로드 범위 */}
                <div>
                  <label className="text-xs font-bold text-gray-300 mb-1.5 block">다운로드 범위</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDlRange('all')}
                      className={`flex-1 text-sm px-3 py-2 rounded-lg font-bold border transition-colors ${dlRange === 'all' ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      전체
                    </button>
                    <button type="button" onClick={() => {
                      setDlRange('selected');
                      // 선택 문장으로 전환 시 아직 선택된 문장이 없으면 전체 선택으로 초기화
                      if (dlSelectedLines.size === 0) {
                        setDlSelectedLines(new Set(lines.map((_, i) => i)));
                      }
                    }}
                      className={`flex-1 text-sm px-3 py-2 rounded-lg font-bold border transition-colors ${dlRange === 'selected' ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      선택 문장
                    </button>
                  </div>
                  {dlRange === 'selected' && (
                    <button type="button" onClick={() => setShowDlLineSelect(true)}
                      className="mt-2 w-full text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 px-3 py-2 rounded-lg font-bold transition-colors">
                      문장 선택하기 ({dlSelectedLines.size}개 선택됨)
                    </button>
                  )}
                </div>

                {/* 문장 통합 여부 */}
                <div>
                  <label className="text-xs font-bold text-gray-300 mb-1.5 block">문장 통합 여부</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDlMerge('merge')}
                      className={`flex-1 text-sm px-3 py-2 rounded-lg font-bold border transition-colors ${dlMerge === 'merge' ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      한 파일로 합치기
                    </button>
                    <button type="button" onClick={() => setDlMerge('split')}
                      className={`flex-1 text-sm px-3 py-2 rounded-lg font-bold border transition-colors ${dlMerge === 'split' ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      문장별로 나누기
                    </button>
                  </div>
                </div>

                {/* 예상 차감 시간 */}
                <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">예상 차감 크레딧</span>
                    <span className="text-sm font-bold text-yellow-300">{currentEngine === 'supertonic' ? '무료' : (() => {
                      const targetLines = dlRange === 'selected' ? lines.filter((_, i) => dlSelectedLines.has(i)) : lines;
                      return (targetLines.reduce((s, l) => s + l.text.length, 0) * 2).toLocaleString() + ' 크레딧';
                    })()}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">문장 수</span>
                    <span className="text-xs text-gray-300">{dlRange === 'selected' ? dlSelectedLines.size : lines.length}개</span>
                  </div>
                </div>

                {/* 다운로드 버튼 */}
                <button type="button"
                  disabled={dlDownloading || (dlRange === 'selected' && dlSelectedLines.size === 0)}
                  onClick={async () => {
                    // 선택 문장 모드에서 선택된 문장이 없으면 안내
                    if (dlRange === 'selected' && dlSelectedLines.size === 0) {
                      setDlError('다운로드할 문장을 선택해주세요.');
                      return;
                    }
                    const targetLines = dlRange === 'selected' ? lines.filter((_, i) => dlSelectedLines.has(i)) : lines;
                    const audioLines = targetLines.filter(l => l.audioUrl);
                    if (audioLines.length === 0) {
                      setDlError('음성이 생성된 문장이 없습니다. 먼저 TTS를 생성해주세요.');
                      return;
                    }

                    setDlDownloading(true);
                    setDlError('');

                    /** 파일명 생성: 01_캐릭터명_첫문장 */
                    const makeName = (line: ScriptLine, idx: number, ext: string) => {
                      const num = String(idx + 1).padStart(2, '0');
                      const charName = (line.voiceName || activeSpeaker?.name || '캐릭터').replace(/[/\\?%*:|"<>\s]/g, '');
                      const firstWords = line.text.slice(0, 20).replace(/[/\\?%*:|"<>]/g, '').trim();
                      return `${num}_${charName}_${firstWords}.${ext}`;
                    };

                    try {
                      // [FIX #965] Premiere Pro 호환: WAV 다운로드 시 48kHz PCM 16-bit로 변환
                      // MP3 선택 시에도 WAV로 변환 — 브라우저에서 MP3 인코딩 불가 + 확장자 불일치 방지
                      const premiereWav = dlFormat === 'wav';
                      const actualExt = premiereWav ? 'wav' : 'wav'; // [FIX #965] 항상 WAV로 내보내기 (Premiere 호환)

                      /** 오디오 URL → Premiere 호환 48kHz WAV Blob 변환 */
                      const toPremierBlob = async (url: string): Promise<Blob> => {
                        return ensurePremiereCompatibleWav(url);
                      };

                      if (dlMerge === 'merge' && mergedAudioUrl && dlRange === 'all') {
                        // 전체 + 합치기: mergedAudioUrl 다운로드
                        const charName = (activeSpeaker?.name || '나레이션').replace(/[/\\?%*:|"<>\s]/g, '');
                        const wavBlob = await toPremierBlob(mergedAudioUrl);
                        const wavUrl = URL.createObjectURL(wavBlob);
                        const a = document.createElement('a');
                        a.href = wavUrl;
                        a.download = `${charName}_전체.${actualExt}`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(wavUrl), 3000);
                      } else if (dlMerge === 'split') {
                        // 분할: JSZip으로 각 문장 별 파일
                        const zip = new JSZip();
                        let addedCount = 0;
                        for (let i = 0; i < audioLines.length; i++) {
                          const line = audioLines[i];
                          const fileName = makeName(line, i, actualExt);
                          try {
                            const wavBlob = await toPremierBlob(line.audioUrl as string);
                            zip.file(fileName, wavBlob);
                            addedCount++;
                          } catch (e) {
                            logger.trackSwallowedError('TypecastEditor:fetchAudioForZip', e);
                            console.warn(`[Download] Failed to fetch audio for line ${i}`);
                          }
                        }
                        if (addedCount === 0) {
                          setDlError('오디오 파일을 가져올 수 없습니다.');
                          setDlDownloading(false);
                          return;
                        }
                        const content = await zip.generateAsync({ type: 'blob' });
                        const charName = (activeSpeaker?.name || '나레이션').replace(/[/\\?%*:|"<>\s]/g, '');
                        const a = document.createElement('a');
                        const zipUrl = URL.createObjectURL(content);
                        a.href = zipUrl;
                        a.download = `${charName}_${audioLines.length}문장.zip`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        // 브라우저가 다운로드를 시작할 시간을 확보한 후 URL 해제
                        setTimeout(() => URL.revokeObjectURL(zipUrl), 3000);
                      } else {
                        // 선택 + 합치기: merge selected
                        const urls = audioLines.map(l => l.audioUrl as string);
                        const charName = (activeSpeaker?.name || '나레이션').replace(/[/\\?%*:|"<>\s]/g, '');
                        if (urls.length === 1) {
                          const wavBlob = await toPremierBlob(urls[0]);
                          const wavUrl = URL.createObjectURL(wavBlob);
                          const a = document.createElement('a');
                          a.href = wavUrl;
                          a.download = makeName(audioLines[0], 0, actualExt);
                          document.body.appendChild(a); a.click(); document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(wavUrl), 3000);
                        } else {
                          const merged = await mergeAudioFiles(urls);
                          const wavBlob = await toPremierBlob(merged);
                          const wavUrl = URL.createObjectURL(wavBlob);
                          const a = document.createElement('a');
                          a.href = wavUrl;
                          a.download = `${charName}_선택${audioLines.length}문장.${actualExt}`;
                          document.body.appendChild(a); a.click(); document.body.removeChild(a);
                          setTimeout(() => { URL.revokeObjectURL(wavUrl); URL.revokeObjectURL(merged); }, 3000);
                        }
                      }
                      setShowDownloadModal(false);
                    } catch (err) {
                      setDlError(`다운로드 실패: ${err instanceof Error ? err.message : String(err)}`);
                    } finally {
                      setDlDownloading(false);
                    }
                  }}
                  className={`w-full text-sm px-4 py-3 rounded-xl font-bold shadow-lg transition-all ${(dlDownloading || (dlRange === 'selected' && dlSelectedLines.size === 0)) ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
                  {dlDownloading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      다운로드 중...
                    </span>
                  ) : '다운로드'}
                </button>
                {dlError && <p className="text-xs text-red-400 mt-2">{dlError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === 줄별 캐릭터 선택 모달 (타입캐스트 스타일) === */}
      {pickerLineIdx !== null && (() => {
        const UC_KO: Record<string, string> = {
          'Announcer': '아나운서', 'Anime': '애니메이션', 'Audiobook/Storytelling': '오디오북',
          'Conversational': '대화', 'Documentary': '다큐멘터리', 'E-learning/Explainer': '교육',
          'Rapper': '래퍼', 'Game': '게임', 'TikTok/Reels/Shorts': '숏폼',
          'Ads/Promotion': '광고/마케팅', 'Radio/Podcast': '팟캐스트', 'News Reporter': '뉴스',
          'Voicemail/Voice Assistant': '안내음성',
        };
        const CATEGORIES = [
          { id: 'Anime', label: '#아동' }, { id: 'elder', label: '#장년', isAge: true },
          { id: 'Audiobook/Storytelling', label: '#오디오북' }, { id: 'News Reporter', label: '#뉴스' },
          { id: 'Ads/Promotion', label: '#마케팅' }, { id: 'Anime', label: '#애니메이션' },
          { id: 'Game', label: '#게임' }, { id: 'TikTok/Reels/Shorts', label: '#숏폼' },
          { id: 'Documentary', label: '#다큐멘터리' }, { id: 'E-learning/Explainer', label: '#교육' },
        ];
        const filtered = pickerVoices.filter(v => {
          if (pickerSearch) {
            const q = pickerSearch.toLowerCase();
            if (!v.name.toLowerCase().includes(q) && !v.voice_id.includes(q)) return false;
          }
          if (pickerCategory) {
            if (pickerCategory === 'elder') { if (v.age !== 'elder') return false; }
            else { if (!v.use_cases.includes(pickerCategory)) return false; }
          }
          if (pickerAgeFilters.length > 0 && !pickerAgeFilters.includes(v.age)) return false;
          if (pickerContentFilters.length > 0 && !pickerContentFilters.some(cf => v.use_cases.includes(cf))) return false;
          if (pickerLangFilter && !v.language.includes(pickerLangFilter)) return false;
          return true;
        });
        return (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6" onClick={() => { if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; } setPickerPlayingId(null); setPickerLineIdx(null); }}>
            <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <span className="text-base font-bold text-white">{pickerLineIdx + 1}번째 줄 캐릭터 선택</span>
                <button onClick={() => { if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; } setPickerPlayingId(null); setPickerLineIdx(null); }} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* 카테고리 pill 제거 — 상세 필터에 통합됨 */}

              {/* 검색 */}
              <div className="px-4 py-2 border-b border-gray-700/30">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input type="text" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="캐릭터 이름 검색..." autoFocus
                    className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              {/* 상세 필터 패널 */}
              {(
                <div className="px-3 py-3 border-b border-gray-700/30 space-y-3 bg-gray-900/50 max-h-[250px] overflow-auto">
                  {/* 연령층 */}
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-2">연령층</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'child', label: '아동' }, { id: 'teenager', label: '청소년' },
                        { id: 'young_adult', label: '청년' }, { id: 'middle_age', label: '중년' }, { id: 'elder', label: '장년' },
                      ].map(age => {
                        const active = pickerAgeFilters.includes(age.id);
                        return (
                          <button key={age.id} type="button"
                            onClick={() => setPickerAgeFilters(active ? pickerAgeFilters.filter(a => a !== age.id) : [...pickerAgeFilters, age.id])}
                            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                            {active && <span className="text-purple-400">✓</span>}
                            {age.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* 콘텐츠 */}
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-2">콘텐츠</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'Documentary', label: '다큐멘터리' }, { id: 'Audiobook/Storytelling', label: '오디오북' },
                        { id: 'News Reporter', label: '뉴스 리포터' }, { id: 'Announcer', label: '아나운서' },
                        { id: 'Radio/Podcast', label: '라디오/팟캐스트' }, { id: 'Ads/Promotion', label: '광고/이벤트' },
                        { id: 'E-learning/Explainer', label: '교육/강의' }, { id: 'Voicemail/Voice Assistant', label: '안내음성/ARS' },
                        { id: 'Game', label: '게임' }, { id: 'Anime', label: '애니메이션' },
                        { id: 'Rapper', label: '음악/엔터테인먼트' }, { id: 'TikTok/Reels/Shorts', label: '숏폼 콘텐츠' },
                        { id: 'Conversational', label: '대화' },
                      ].map(ct => {
                        const active = pickerContentFilters.includes(ct.id);
                        return (
                          <button key={ct.id} type="button"
                            onClick={() => setPickerContentFilters(active ? pickerContentFilters.filter(c => c !== ct.id) : [...pickerContentFilters, ct.id])}
                            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                            {active && <span className="text-purple-400">✓</span>}
                            {ct.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* 언어 */}
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-2">언어</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: '', label: '전체' },
                        { id: 'kor', label: '\uD83C\uDDF0\uD83C\uDDF7 한국어' },
                        { id: 'jpn', label: '\uD83C\uDDEF\uD83C\uDDF5 日本語' },
                        { id: 'eng', label: '\uD83C\uDDFA\uD83C\uDDF8 English' },
                      ].map(lang => {
                        const active = pickerLangFilter === lang.id;
                        return (
                          <button key={lang.id} type="button"
                            onClick={() => setPickerLangFilter(active ? '' : lang.id)}
                            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                            {active && <span className="text-blue-400">{'\u2713'}</span>}
                            {lang.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* 초기화 */}
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={() => { setPickerAgeFilters([]); setPickerContentFilters([]); setPickerLangFilter(''); }}
                      className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1 rounded border border-gray-600 transition-colors">초기화</button>
                    <span className="text-xs text-gray-500">적용 결과: {filtered.length}개</span>
                  </div>
                </div>
              )}

              {/* 캐릭터 목록 */}
              <div className="flex-1 overflow-auto">
                {/* 최근 사용 (5개) */}
                {(() => {
                  const recentIds = useSoundStudioStore.getState().favoriteVoices || [];
                  // 최근 사용은 lines에서 voiceId가 있는 것 + activeSpeaker
                  const usedIds = [...new Set([
                    activeSpeaker?.voiceId,
                    ...lines.filter(l => l.voiceId).map(l => l.voiceId),
                  ].filter(Boolean) as string[])].slice(0, 5);
                  const recentVoices = usedIds.map(id => pickerVoices.find(v => v.voice_id === id)).filter(Boolean);
                  if (recentVoices.length === 0) return null;
                  return (
                    <div className="border-b border-gray-700/30 pb-1">
                      <div className="flex items-center justify-between px-4 py-1.5">
                        <span className="text-xs text-gray-500">최근 사용 ({recentVoices.length})</span>
                        <button type="button" onClick={() => {
                          // 최근 사용 비우기: 모든 lines의 voiceId 제거
                          lines.forEach(l => { if (l.voiceId) updateLine(l.id, { voiceId: undefined, voiceName: undefined, voiceImage: undefined }); });
                        }} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">비우기</button>
                      </div>
                      {recentVoices.map(voice => voice && (
                        <div key={voice.voice_id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700/30 transition-colors cursor-pointer"
                          onClick={() => handlePickCharacter(voice)}>
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 shrink-0">
                            {voice.image_url ? <img src={voice.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold bg-gradient-to-br from-purple-500 to-pink-500">{voice.name[0]}</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{voice.name}</p>
                            <p className="text-xs text-gray-500 truncate">#{voice.use_cases.slice(0, 1).map(uc => UC_KO[uc] || uc).join('')} | {(TYPECAST_LANGUAGES.find(l => l.code === voice.language[0]) || TYPECAST_LANGUAGES[0]).flag} {(TYPECAST_LANGUAGES.find(l => l.code === voice.language[0]) || TYPECAST_LANGUAGES[0]).nameKo}</p>
                          </div>
                          {lines[pickerLineIdx]?.voiceId === voice.voice_id && <span className="text-green-400 text-sm">✓</span>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="px-4 py-1.5 text-xs text-gray-500">전체 캐릭터 ({filtered.length})</div>
                {filtered.map(voice => (
                  <div key={voice.voice_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/30 transition-colors">
                    {/* 아바타 — 클릭 시 선택 */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 shrink-0 cursor-pointer"
                      onClick={() => handlePickCharacter(voice)}>
                      {voice.image_url ? <img src={voice.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-white font-bold bg-gradient-to-br from-purple-500 to-pink-500">{voice.name[0]}</div>}
                    </div>
                    {/* 정보 — 클릭 시 선택 */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePickCharacter(voice)}>
                      <p className="text-sm font-bold text-white truncate">{voice.name}
                        {lines[pickerLineIdx]?.voiceId === voice.voice_id && <span className="text-green-400 ml-1">✓</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        #{voice.use_cases.slice(0, 2).map(uc => UC_KO[uc] || uc).join(' · ')} | {(TYPECAST_LANGUAGES.find(l => l.code === voice.language[0]) || TYPECAST_LANGUAGES[0]).flag} {(TYPECAST_LANGUAGES.find(l => l.code === voice.language[0]) || TYPECAST_LANGUAGES[0]).nameKo}{voice.language.length > 1 ? `+${voice.language.length - 1}` : ''}
                      </p>
                    </div>
                    {/* 즐겨찾기 + 미리듣기 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); useSoundStudioStore.getState().toggleFavoriteVoice(voice.voice_id); }}
                        className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors" title="즐겨찾기">
                        {useSoundStudioStore.getState().favoriteVoices.includes(voice.voice_id) ? '★' : '☆'}
                      </button>
                      <button type="button" onClick={(e) => {
                        e.stopPropagation();
                        handlePickerPlay(voice.voice_id, voice.preview_url);
                      }} className={`p-1.5 transition-colors ${pickerPlayingId === voice.voice_id ? 'text-orange-400' : 'text-gray-500 hover:text-white'}`}
                        title={pickerPlayingId === voice.voice_id ? '정지' : '미리듣기'}>
                        {pickerPlayingId === voice.voice_id ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                      </button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">검색 결과가 없습니다</div>
                )}
                {pickerVoices.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">캐릭터를 불러오는 중...</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* === ElevenLabs 캐릭터 선택 모달 === */}
      {elPickerOpen && pickerLineIdx !== null && (() => {
        const ACCENT_FLAGS: Record<string, string> = {
          american: '🇺🇸', british: '🇬🇧', australian: '🇦🇺', indian: '🇮🇳',
          'latin american': '🇲🇽', mexican: '🇲🇽', argentine: '🇦🇷', brazilian: '🇧🇷',
          korean: '🇰🇷', seoul: '🇰🇷', malaysian: '🇲🇾', istanbul: '🇹🇷', 'modern standard': '🇸🇦',
          oslo: '🇳🇴', 'beijing mandarin': '🇨🇳', 'taiwan mandarin': '🇹🇼',
          'singapore mandarin': '🇸🇬', stockholm: '🇸🇪', parisian: '🇫🇷',
          kanto: '🇯🇵', kyushu: '🇯🇵', flemish: '🇧🇪', moscow: '🇷🇺',
          athenian: '🇬🇷', sofia: '🇧🇬', egyptian: '🇪🇬', german: '🇩🇪',
          javanese: '🇮🇩', budapest: '🇭🇺', kiev: '🇺🇦', mazovian: '🇵🇱',
          prague: '🇨🇿', peninsular: '🇪🇸', northern: '🇬🇧', southern: '🇺🇸',
          standard: '🌐',
        };
        const ACCENT_KO: Record<string, string> = {
          american: '미국', british: '영국', australian: '호주', indian: '인도',
          'latin american': '라틴 아메리카', mexican: '멕시코', argentine: '아르헨티나', brazilian: '브라질',
          korean: '한국', seoul: '서울', malaysian: '말레이시아', istanbul: '이스탄불', 'modern standard': '표준 아랍어',
          oslo: '노르웨이', 'beijing mandarin': '베이징', 'taiwan mandarin': '대만',
          'singapore mandarin': '싱가포르', stockholm: '스웨덴', parisian: '파리',
          kanto: '간토', kyushu: '규슈', flemish: '벨기에', moscow: '모스크바',
          athenian: '아테네', sofia: '소피아', egyptian: '이집트', german: '독일',
          javanese: '자바', budapest: '부다페스트', kiev: '키예프', mazovian: '폴란드',
          prague: '프라하', peninsular: '스페인', northern: '북부', southern: '남부',
          standard: '표준',
        };
        const USECASE_KO: Record<string, string> = {
          conversational: '대화', narrative_story: '내레이션/스토리', informative_educational: '교육',
          entertainment_tv: 'TV/엔터테인먼트', social_media: '소셜 미디어', news: '뉴스',
          characters_animation: '캐릭터/애니', meditation_wellness: '명상/웰빙',
          advertisement: '광고',
        };
        const AGE_KO: Record<string, string> = {
          young: '청년', middle_aged: '중년', old: '노년',
        };
        const GENDER_KO: Record<string, string> = {
          male: '남성', female: '여성', neutral: '중성',
        };
        // 영어 설명 → 한국어 번역 매핑
        const DESC_KO: Record<string, string> = {
          'Mature, Reassuring, Confident': '성숙하고 안심을 주는, 자신감 있는',
          'Enthusiast, Quirky Attitude': '열정적이고 독특한 매력',
          'Clear, Engaging Educator': '명확하고 몰입감 있는 교육자',
          'Playful, Bright, Warm': '장난스럽고 밝고 따뜻한',
          'Velvety Actress': '벨벳 같은 부드러운 여배우',
          'Knowledgable, Professional': '전문적이고 지식이 풍부한',
          'Professional, Bright, Warm': '전문적이고 밝고 따뜻한',
          'Laid-Back, Casual, Resonant': '여유롭고 편안한, 울림 있는',
          'Warm, Captivating Storyteller': '따뜻하고 매력적인 이야기꾼',
          'Deep, Confident, Energetic': '깊고 자신감 있는, 에너지 넘치는',
          'Husky Trickster': '허스키한 장난꾸러기',
          'Fierce Warrior': '거친 전사',
          'Energetic, Social Media Creator': '에너지 넘치는 크리에이터',
          'Relaxed Optimist': '편안한 낙천주의자',
          'Smooth, Trustworthy': '부드럽고 신뢰감 있는',
          'Charming, Down-to-Earth': '매력적이고 소탈한',
          'Deep, Resonant and Comforting': '깊고 울림 있고 편안한',
          'Steady Broadcaster': '안정적인 방송인',
          'Dominant, Firm': '지배적이고 단호한',
          'Wise, Mature, Balanced': '지혜롭고 성숙한, 균형 잡힌',
          'Grumpy, Raspy Elder': '투덜거리는 쉰 목소리 어르신',
          'Polished, Articulate, Elegant': '세련되고 또렷한, 우아한',
          'Warm, Wise Storyteller': '따뜻하고 지혜로운 이야기꾼',
          'Friendly, Confident': '친근하고 자신감 있는',
          'Bold, Commanding': '대담하고 위엄 있는',
          'Warm, Heartfelt, Conversational': '따뜻하고 진심 어린 대화체',
          'Cheerful, Enthusiastic': '쾌활하고 열정적인',
          'Rich, Authoritative Narrator': '풍부하고 권위 있는 나레이터',
          'Mysterious, Intense': '신비롭고 강렬한',
          'Gentle, Nurturing': '부드럽고 다정한',
          'Quirky, High-Energy Performer': '독특하고 에너지 넘치는 연기자',
          'Raspy, Weathered Voice': '거칠고 세월의 깊이 있는 목소리',
          'Crisp, Precise Narrator': '선명하고 정확한 나레이터',
          'Soothing, Melodic': '편안하고 선율적인',
          'Passionate, Dramatic': '열정적이고 극적인',
          'Calm, Analytical': '차분하고 분석적인',
          'Charismatic Leader': '카리스마 있는 리더',
          'Soft-spoken, Intimate': '조용하고 친밀한',
          'Authoritative Reporter': '권위 있는 리포터',
          'Warm, Motherly': '따뜻한 어머니 같은',
          'Playful, Mischievous': '장난스럽고 익살맞은',
          'Gravelly, Rugged': '굵직하고 거친',
          'Sophisticated Narrator': '세련된 나레이터',
          'Bright, Optimistic': '밝고 긍정적인',
          'Deep, Philosophical': '깊고 철학적인',
          'Crisp, Professional': '깔끔하고 전문적인',
          'Whimsical, Dreamy': '환상적이고 몽환적인',
          'Commanding Presence': '압도적인 존재감',
        };

        // 고유값 추출
        const uniqueAccents = [...new Set(ELEVENLABS_VOICES.map(v => v.accent).filter(Boolean))].sort();
        const uniqueUseCases = [...new Set(ELEVENLABS_VOICES.map(v => v.useCase).filter(Boolean))].sort();
        const uniqueAges = [...new Set(ELEVENLABS_VOICES.map(v => v.age).filter(Boolean))].sort();

        // 필터링
        const elFiltered = ELEVENLABS_VOICES.filter(v => {
          if (elPickerSearch) {
            const q = elPickerSearch.toLowerCase();
            const koName = elNameKo(v.name).toLowerCase();
            if (!v.name.toLowerCase().includes(q) && !v.description.toLowerCase().includes(q) && !koName.includes(q)) return false;
          }
          if (elPickerGender && v.gender !== elPickerGender) return false;
          if (elPickerAccent && v.accent !== elPickerAccent) return false;
          if (elPickerAge && v.age !== elPickerAge) return false;
          if (elPickerUseCase && v.useCase !== elPickerUseCase) return false;
          return true;
        });

        const closeElPicker = () => {
          if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; }
          setPickerPlayingId(null);
          setElPickerOpen(false);
          setPickerLineIdx(null);
        };

        return (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6" onClick={closeElPicker}>
            <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{pickerLineIdx + 1}번째 줄 음성 선택</span>
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">ElevenLabs</span>
                </div>
                <button onClick={closeElPicker} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* 검색 */}
              <div className="px-4 py-2 border-b border-gray-700/30">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input type="text" value={elPickerSearch} onChange={e => setElPickerSearch(e.target.value)}
                    placeholder="이름 또는 설명으로 검색..." autoFocus
                    className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
              </div>

              {/* 필터 칩 */}
              <div className="px-3 py-3 border-b border-gray-700/30 space-y-2 bg-gray-900/50">
                {/* 성별 */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500 leading-6 mr-1">성별</span>
                  {['male', 'female', 'neutral'].map(g => (
                    <button key={g} type="button"
                      onClick={() => setElPickerGender(elPickerGender === g ? '' : g)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${elPickerGender === g ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      {GENDER_KO[g] || g}
                    </button>
                  ))}
                </div>
                {/* 연령 */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500 leading-6 mr-1">연령</span>
                  {uniqueAges.map(a => (
                    <button key={a} type="button"
                      onClick={() => setElPickerAge(elPickerAge === a ? '' : a)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${elPickerAge === a ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      {AGE_KO[a] || a}
                    </button>
                  ))}
                </div>
                {/* 악센트 */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500 leading-6 mr-1">악센트</span>
                  {uniqueAccents.slice(0, 10).map(ac => (
                    <button key={ac} type="button"
                      onClick={() => setElPickerAccent(elPickerAccent === ac ? '' : ac)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${elPickerAccent === ac ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      {ACCENT_FLAGS[ac] || '🌐'} {ACCENT_KO[ac] || ac}
                    </button>
                  ))}
                  {uniqueAccents.length > 10 && (
                    <select value={elPickerAccent}
                      onChange={e => setElPickerAccent(e.target.value)}
                      className="text-xs px-2 py-1 rounded-full border border-gray-600 bg-gray-800 text-gray-400 focus:outline-none">
                      <option value="">+{uniqueAccents.length - 10}개 더...</option>
                      {uniqueAccents.map(ac => (
                        <option key={ac} value={ac}>{ACCENT_FLAGS[ac] || '🌐'} {ACCENT_KO[ac] || ac}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* 용도 */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500 leading-6 mr-1">용도</span>
                  {uniqueUseCases.map(uc => (
                    <button key={uc} type="button"
                      onClick={() => setElPickerUseCase(elPickerUseCase === uc ? '' : uc)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${elPickerUseCase === uc ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>
                      {USECASE_KO[uc] || uc}
                    </button>
                  ))}
                </div>
                {/* 초기화 + 카운트 */}
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={() => { setElPickerGender(''); setElPickerAccent(''); setElPickerAge(''); setElPickerUseCase(''); }}
                    className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1 rounded border border-gray-600 transition-colors">초기화</button>
                  <span className="text-xs text-gray-500">{ELEVENLABS_VOICES.length}개 중 {elFiltered.length}개 표시</span>
                </div>
              </div>

              {/* 한국어 안내 배너 */}
              <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border border-blue-500/30 rounded-xl p-3 mx-4 mb-2 flex items-start gap-2.5">
                <span className="text-lg flex-shrink-0">{'\uD83C\uDDF0\uD83C\uDDF7'}</span>
                <p className="text-xs text-blue-300/80 leading-relaxed">영어 이름이지만 <strong className="text-blue-200">한국어 텍스트 입력 시 자동으로 한국어 발음</strong>으로 생성돼요.</p>
              </div>

              {/* 음성 목록 */}
              <div className="flex-1 overflow-auto">
                {/* 최근 사용 */}
                {(() => {
                  const usedIds = [...new Set([
                    activeSpeaker?.voiceId,
                    ...lines.filter(l => l.voiceId).map(l => l.voiceId),
                  ].filter(Boolean) as string[])].slice(0, 5);
                  const recentVoices = usedIds.map(id => ELEVENLABS_VOICES.find(v => v.id === id)).filter(Boolean) as ElevenLabsVoice[];
                  if (recentVoices.length === 0) return null;
                  return (
                    <div className="border-b border-gray-700/30 pb-1">
                      <div className="px-4 py-1.5 text-xs text-gray-500">최근 사용 ({recentVoices.length})</div>
                      {recentVoices.map(voice => (
                        <div key={voice.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700/30 transition-colors cursor-pointer"
                          onClick={() => handlePickElevenLabsVoice(voice)}>
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 shrink-0 flex items-center justify-center text-white font-bold text-sm">
                            {elNameKo(voice.name)[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{elNameKo(voice.name)}</p>
                            <p className="text-xs text-gray-500 truncate">{ACCENT_FLAGS[voice.accent] || '🌐'} {ACCENT_KO[voice.accent] || voice.accent} · {GENDER_KO[voice.gender] || voice.gender}</p>
                          </div>
                          {lines[pickerLineIdx]?.voiceId === voice.id && <span className="text-green-400 text-sm">✓</span>}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div className="px-4 py-1.5 text-xs text-gray-500">전체 음성 ({elFiltered.length})</div>
                {elFiltered.map(voice => (
                  <div key={voice.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700/30 transition-colors">
                    {/* 아바타 */}
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 cursor-pointer flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: voice.gender === 'male' ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : voice.gender === 'female' ? 'linear-gradient(135deg, #ec4899, #a855f7)' : 'linear-gradient(135deg, #10b981, #06b6d4)' }}
                      onClick={() => handlePickElevenLabsVoice(voice)}>
                      {elNameKo(voice.name)[0]}
                    </div>
                    {/* 정보 */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePickElevenLabsVoice(voice)}>
                      <p className="text-sm font-bold text-white truncate">
                        {elNameKo(voice.name)}
                        {lines[pickerLineIdx]?.voiceId === voice.id && <span className="text-green-400 ml-1">✓</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {ACCENT_FLAGS[voice.accent] || '🌐'} {ACCENT_KO[voice.accent] || voice.accent} · {GENDER_KO[voice.gender] || voice.gender} · {AGE_KO[voice.age] || voice.age} · {USECASE_KO[voice.useCase] || voice.useCase}
                      </p>
                      <p className="text-[11px] text-gray-600 truncate">{DESC_KO[voice.description] || voice.description}</p>
                    </div>
                    {/* 미리듣기 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={e => { e.stopPropagation(); useSoundStudioStore.getState().toggleFavoriteVoice(voice.id); }}
                        className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors" title="즐겨찾기">
                        {useSoundStudioStore.getState().favoriteVoices.includes(voice.id) ? '★' : '☆'}
                      </button>
                      <button type="button" onClick={e => {
                        e.stopPropagation();
                        handlePickerPlay(voice.id, voice.previewUrl);
                      }} className={`p-1.5 transition-colors ${pickerPlayingId === voice.id ? 'text-orange-400' : 'text-gray-500 hover:text-white'}`}
                        title={pickerPlayingId === voice.id ? '정지' : '미리듣기'}>
                        {pickerPlayingId === voice.id ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                      </button>
                    </div>
                  </div>
                ))}
                {elFiltered.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">검색 결과가 없습니다</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* === Supertonic 캐릭터 선택 모달 === */}
      {stPickerOpen && pickerLineIdx !== null && (() => {
        const femaleVoices = SUPERTONIC_VOICE_INFO.filter(v => v.gender === 'female');
        const maleVoices = SUPERTONIC_VOICE_INFO.filter(v => v.gender === 'male');

        const closeStPicker = () => {
          if (pickerAudioRef.current) { pickerAudioRef.current.pause(); pickerAudioRef.current = null; }
          setPickerPlayingId(null);
          setStPickerOpen(false);
          setPickerLineIdx(null);
        };

        const renderVoice = (voice: typeof SUPERTONIC_VOICE_INFO[0]) => {
          const isActive = lines[pickerLineIdx]?.voiceId === voice.id;
          const isPlaying = pickerPlayingId === voice.id;
          const isLoading = stPreviewLoading === voice.id;
          return (
            <div key={voice.id}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-700/30 transition-colors cursor-pointer rounded-lg border ${isActive ? 'border-purple-500/50 bg-purple-500/10' : 'border-transparent'}`}
              onClick={() => handlePickSupertonicVoice(voice.id, `${voice.name} (${voice.id})`)}>
              {/* 아바타 */}
              <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg"
                style={{ background: voice.gender === 'male' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'linear-gradient(135deg, #ec4899, #f472b6)' }}>
                {voice.id}
              </div>
              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">
                  {voice.name} <span className="text-gray-500 font-normal text-xs">{voice.id}</span>
                  {isActive && <span className="text-green-400 ml-1">✓</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{voice.desc}</p>
                <div className="flex gap-1 mt-1">
                  {voice.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700/50 text-gray-500">#{tag}</span>
                  ))}
                </div>
              </div>
              {/* 미리듣기 */}
              <div className="shrink-0">
                <button type="button" onClick={e => { e.stopPropagation(); handleSupertonicPreview(voice.id); }}
                  disabled={isLoading}
                  className={`p-2 rounded-lg transition-colors ${isPlaying ? 'text-purple-400 bg-purple-500/20' : isLoading ? 'text-gray-600' : 'text-gray-500 hover:text-white hover:bg-gray-700/50'}`}
                  title={isPlaying ? '정지' : isLoading ? '생성 중...' : '미리듣기'}>
                  {isLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  ) : isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6" onClick={closeStPicker}>
            <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{pickerLineIdx + 1}번째 줄 음성 선택</span>
                  <span className="text-xs text-purple-300 bg-purple-900/30 px-2 py-0.5 rounded-full border border-purple-500/30">🧠 Supertonic 2</span>
                </div>
                <button onClick={closeStPicker} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* 안내 */}
              <div className="px-4 py-2 border-b border-gray-700/30 bg-gray-900/50">
                <p className="text-xs text-gray-500">로컬 브라우저 실행 · 10개 음성 (여성 5 + 남성 5) · 한/영/프/스/포 5개 언어</p>
                {!isSupertonicLoaded() && <p className="text-[10px] text-yellow-500/70 mt-0.5">미리듣기 시 ONNX 모델(~263MB)이 자동 다운로드됩니다</p>}
              </div>

              {/* 음성 목록 */}
              <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
                {/* 여성 */}
                <div className="px-2 py-1.5">
                  <span className="text-xs font-bold text-pink-400">👩 여성 ({femaleVoices.length})</span>
                </div>
                {femaleVoices.map(renderVoice)}

                {/* 남성 */}
                <div className="px-2 py-1.5 mt-2">
                  <span className="text-xs font-bold text-indigo-400">👨 남성 ({maleVoices.length})</span>
                </div>
                {maleVoices.map(renderVoice)}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TypecastEditor;
