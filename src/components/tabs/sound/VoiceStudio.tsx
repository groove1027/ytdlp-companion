import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { logger } from '../../../services/LoggerService';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { useUIStore, showToast } from '../../../stores/uiStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import {
  getAvailableVoices,
  generateSupertonicTTS,
  generateEdgeTTS,
  generateCloneTTS,
  getCustomVoices,
  saveCustomVoice,
  deleteCustomVoice,
  splitTextForTTS,
  splitBySentenceEndings,
  normalizeAudioUrl,
} from '../../../services/ttsService';
import type { CustomVoice } from '../../../services/ttsService';
import { generateElevenLabsDialogueTTS, ELEVENLABS_VOICES, ELEVENLABS_LANGUAGES, elNameKo } from '../../../services/elevenlabsService';
import { transcribeAudio, segmentsToScriptLines, alignTranscriptSegmentsToParagraphs } from '../../../services/transcriptionService';
import { isModelLoaded, isModelLoading, onLoadProgress } from '../../../services/supertonicService';
import { getCachedPreview, cachePreview } from '../../../services/ttsPreviewCache';
import { fetchTypecastVoices, clearTypecastVoiceCache, generateTypecastTTS, getKoreanUseCases, TYPECAST_LANGUAGES, TYPECAST_TOP_LANGUAGES } from '../../../services/typecastService';
import { mergeAudioFiles } from '../../../services/ttsService';
import type { TypecastVoice } from '../../../services/typecastService';
import { TYPECAST_EMOTIONS, TYPECAST_MODELS, PRICING } from '../../../constants';
import { useCostStore } from '../../../stores/costStore';
import { getTypecastKey } from '../../../services/apiService';
import type { VoiceOption } from '../../../services/ttsService';
import type { TTSEngine, TTSLanguage, ScriptLine, Speaker, WhisperTranscriptResult, AudioSourceType } from '../../../types';
import TypecastEditor from './TypecastEditor';
// VoiceClonePanel 제거 — CosyVoice 미사용으로 Voice Clone 비활성화
import { useProjectStore } from '../../../stores/projectStore';
import { transferSoundToImageVideo } from '../../../utils/soundToImageBridge';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { runKieBatch } from '../../../utils/kieBatchRunner';
import { getSceneNarrationText } from '../../../utils/sceneText';

const SPEAKER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

// ElevenLabs Audio Tag 감정 → 텍스트 프리픽스 매핑
const EL_EMOTION_TAGS: Record<string, string> = {
  none: '', happy: '[happily] ', sad: '[sad] ', angry: '[angry] ',
  excited: '[excited] ', calm: '[calm] ', whisper: '[whispers] ',
  dramatic: '[dramatic] ', sarcastic: '[sarcastically] ', nervous: '[nervous] ',
  cheerful: '[cheerfully] ', crying: '[crying] ',
};

const TTS_ENGINES: { id: TTSEngine; label: string; voiceCount: number; icon: string; iconColor: string; description: string; badge?: string }[] = [
  {
    id: 'edge' as TTSEngine,
    label: 'Edge TTS',
    voiceCount: 22,
    icon: '🎙️',
    iconColor: '#f59e0b',
    description: 'Microsoft Neural TTS — 한국어(선희/인준/현수) 고품질 + 영/일/중/독/불/스 22개 음성. 인터넷 필요, API 키 불필요. 컴패니언 앱 필요.',
    badge: '무료',
  },
  {
    id: 'supertonic',
    label: 'Supertonic 2',
    voiceCount: 10,
    icon: '🧠',
    iconColor: '#8b5cf6',
    description: '한국어 전용 10개 음성. 브라우저에서 로컬 실행 — 인터넷/컴패니언 앱 불필요. 첫 사용 시 ONNX 모델(~263MB) 다운로드.',
    badge: '로컬 무료',
  },
  {
    id: 'typecast' as TTSEngine,
    label: 'Typecast',
    voiceCount: 542,
    icon: '🎭',
    iconColor: '#3b82f6',
    description: 'AI 음성. ssfm-v30: 다양한 감정 + Smart Emotion / ssfm-v21: 빠르고 안정적. 글자당 2크레딧.',
    badge: 'API 키',
  },
  {
    id: 'elevenlabs' as TTSEngine,
    label: 'ElevenLabs',
    voiceCount: 0,
    icon: '🔊',
    iconColor: '#10b981',
    description: 'ElevenLabs Text-to-Dialogue V3 — 70개 언어 자동 감지, Stability 조절로 감정/안정성 제어. Kie API 경유로 별도 키 없이 사용 가능합니다.',
    badge: 'Kie 키',
  },
];

const LANGUAGES: { id: TTSLanguage; label: string; flag: string }[] = [
  { id: 'ko', label: '\uD55C\uAD6D\uC5B4', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  { id: 'en', label: 'English', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { id: 'ja', label: '\u65E5\u672C\u8A9E', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { id: 'zh', label: '\u4E2D\u6587', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  { id: 'es', label: 'Espa\u00F1ol', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  { id: 'fr', label: 'Fran\u00E7ais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { id: 'de', label: 'Deutsch', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  { id: 'hi', label: '\u0939\u093F\u0928\u094D\u0926\u0940', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { id: 'it', label: 'Italiano', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  { id: 'pt', label: 'Portugu\u00EAs', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  { id: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
];

const LANG_FLAGS: Record<string, string> = {
  ko: '\uD83C\uDDF0\uD83C\uDDF7',
  en: '\uD83C\uDDFA\uD83C\uDDF8',
  ja: '\uD83C\uDDEF\uD83C\uDDF5',
  zh: '\uD83C\uDDE8\uD83C\uDDF3',
  es: '\uD83C\uDDEA\uD83C\uDDF8',
  fr: '\uD83C\uDDEB\uD83C\uDDF7',
  de: '\uD83C\uDDE9\uD83C\uDDEA',
  hi: '\uD83C\uDDEE\uD83C\uDDF3',
  it: '\uD83C\uDDEE\uD83C\uDDF9',
  pt: '\uD83C\uDDE7\uD83C\uDDF7',
  ru: '\uD83C\uDDF7\uD83C\uDDFA',
};

// ElevenLabs accent → 국기 매핑
const ACCENT_FLAGS: Record<string, string> = {
  american: '\uD83C\uDDFA\uD83C\uDDF8',
  british: '\uD83C\uDDEC\uD83C\uDDE7',
  australian: '\uD83C\uDDE6\uD83C\uDDFA',
  indian: '\uD83C\uDDEE\uD83C\uDDF3',
  'latin american': '\uD83C\uDDF2\uD83C\uDDFD',
  mexican: '\uD83C\uDDF2\uD83C\uDDFD',
  argentine: '\uD83C\uDDE6\uD83C\uDDF7',
  brazilian: '\uD83C\uDDE7\uD83C\uDDF7',
  korean: '\uD83C\uDDF0\uD83C\uDDF7',
  seoul: '\uD83C\uDDF0\uD83C\uDDF7',
  malaysian: '\uD83C\uDDF2\uD83C\uDDFE',
  istanbul: '\uD83C\uDDF9\uD83C\uDDF7',
  'modern standard': '\uD83C\uDDF8\uD83C\uDDE6',
  oslo: '\uD83C\uDDF3\uD83C\uDDF4',
  'beijing mandarin': '\uD83C\uDDE8\uD83C\uDDF3',
  'taiwan mandarin': '\uD83C\uDDF9\uD83C\uDDFC',
  'singapore mandarin': '\uD83C\uDDF8\uD83C\uDDEC',
  stockholm: '\uD83C\uDDF8\uD83C\uDDEA',
  parisian: '\uD83C\uDDEB\uD83C\uDDF7',
  kanto: '\uD83C\uDDEF\uD83C\uDDF5',
  kyushu: '\uD83C\uDDEF\uD83C\uDDF5',
  flemish: '\uD83C\uDDE7\uD83C\uDDEA',
  moscow: '\uD83C\uDDF7\uD83C\uDDFA',
  athenian: '\uD83C\uDDEC\uD83C\uDDF7',
  sofia: '\uD83C\uDDE7\uD83C\uDDEC',
  egyptian: '\uD83C\uDDEA\uD83C\uDDEC',
  moroccan: '\uD83C\uDDF2\uD83C\uDDE6',
  jutlandic: '\uD83C\uDDE9\uD83C\uDDF0',
  zealandic: '\uD83C\uDDF3\uD83C\uDDF1',
  helsinki: '\uD83C\uDDEB\uD83C\uDDEE',
  peninsular: '\uD83C\uDDEA\uD83C\uDDF8',
  northern: '\uD83C\uDDEC\uD83C\uDDE7',
  southern: '\uD83C\uDDFA\uD83C\uDDF8',
  german: '\uD83C\uDDE9\uD83C\uDDEA',
  javanese: '\uD83C\uDDEE\uD83C\uDDE9',
  budapest: '\uD83C\uDDED\uD83C\uDDFA',
  kiev: '\uD83C\uDDFA\uD83C\uDDE6',
  mazovian: '\uD83C\uDDF5\uD83C\uDDF1',
  prague: '\uD83C\uDDE8\uD83C\uDDFF',
  moravian: '\uD83C\uDDE8\uD83C\uDDFF',
  bergen: '\uD83C\uDDF3\uD83C\uDDF4',
  central: '\uD83C\uDDEA\uD83C\uDDFA',
  western: '\uD83C\uDDEA\uD83C\uDDFA',
  standard: '\uD83C\uDF10',
};

// ElevenLabs 한글화 매핑
const EL_ACCENT_KO: Record<string, string> = {
  american: '미국', british: '영국', australian: '호주', indian: '인도',
  'latin american': '라틴 아메리카', mexican: '멕시코', argentine: '아르헨티나', brazilian: '브라질',
  korean: '한국', seoul: '서울', malaysian: '말레이시아', istanbul: '이스탄불', 'modern standard': '표준 아랍어',
  oslo: '노르웨이', 'beijing mandarin': '베이징', 'taiwan mandarin': '대만',
  'singapore mandarin': '싱가포르', stockholm: '스웨덴', parisian: '파리',
  kanto: '간토', kyushu: '규슈', flemish: '벨기에', moscow: '모스크바',
  athenian: '아테네', sofia: '소피아', egyptian: '이집트', german: '독일',
  javanese: '자바', budapest: '부다페스트', kiev: '키예프', mazovian: '폴란드',
  prague: '프라하', peninsular: '스페인', northern: '북부', southern: '남부',
  standard: '표준', central: '중부', western: '서부',
};
const EL_GENDER_KO: Record<string, string> = { male: '남성', female: '여성', neutral: '중성' };
const EL_AGE_KO: Record<string, string> = { young: '청년', middle_aged: '중년', old: '노년' };
const EL_USECASE_KO: Record<string, string> = {
  conversational: '대화', narrative_story: '내레이션/스토리', informative_educational: '교육',
  entertainment_tv: 'TV/엔터테인먼트', social_media: '소셜 미디어', news: '뉴스',
  characters_animation: '캐릭터/애니', meditation_wellness: '명상/웰빙', advertisement: '광고',
};
const EL_DESC_KO: Record<string, string> = {
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

const SAMPLE_TEXTS: Record<string, string> = {
  ko: '\uC548\uB155\uD558\uC138\uC694, \uC800\uB294 AI \uB098\uB808\uC774\uC158 \uC74C\uC131\uC785\uB2C8\uB2E4.',
  en: 'Hello, I am an AI narration voice. Nice to meet you.',
  ja: '\u3053\u3093\u306B\u3061\u306F\u3001AI\u30CA\u30EC\u30FC\u30B7\u30E7\u30F3\u97F3\u58F0\u3067\u3059\u3002',
};


// [FIX #989] 프로젝트 전환 감지용 모듈 레벨 변수 (unmount/remount 시에도 유지)
let _lastKnownProjectId: string | null = null;

const VoiceStudio: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const addCost = useCostStore((s) => s.addCost);
  const speakers = useSoundStudioStore((s) => s.speakers);
  const lines = useSoundStudioStore((s) => s.lines);
  const setLines = useSoundStudioStore((s) => s.setLines);
  const addSpeaker = useSoundStudioStore((s) => s.addSpeaker);
  const updateSpeaker = useSoundStudioStore((s) => s.updateSpeaker);
  const ttsEngine = useSoundStudioStore((s) => s.ttsEngine);
  const setTtsEngine = useSoundStudioStore((s) => s.setTtsEngine);
  const removeLine = useSoundStudioStore((s) => s.removeLine);
  const addLineAfter = useSoundStudioStore((s) => s.addLineAfter);
  const mergeLineWithNext = useSoundStudioStore((s) => s.mergeLineWithNext);
  const updateLine = useSoundStudioStore((s) => s.updateLine);
  const favoriteVoices = useSoundStudioStore((s) => s.favoriteVoices);
  const toggleFavoriteVoice = useSoundStudioStore((s) => s.toggleFavoriteVoice);

  const finalScript = useScriptWriterStore((s) => s.finalScript);
  const generatedScriptContent = useScriptWriterStore((s) => s.generatedScript?.content);
  const storeScript = finalScript || generatedScriptContent || '';
  // [FIX #1162] splitResult 구독 — 단락 나누기 결과 변경 시 라인 재동기화용
  const splitResultFromWriter = useScriptWriterStore((s) => s.splitResult);

  // [FIX #989] 프로젝트 전환 시 이전 프로젝트의 나레이션 라인 + 대본 초기화
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const skipSyncRef = React.useRef(false);
  useEffect(() => {
    if (_lastKnownProjectId && currentProjectId && _lastKnownProjectId !== currentProjectId) {
      const currentSceneIds = new Set(useProjectStore.getState().scenes.map(s => s.id));
      const currentLines = useSoundStudioStore.getState().lines;
      const hasMatchingLines = currentLines.length > 0 &&
        currentLines.some(l => l.sceneId && currentSceneIds.has(l.sceneId));
      if (!hasMatchingLines) {
        setLines([]);
        // 새 프로젝트에 장면이 없으면 대본도 초기화 + 재동기화 방지
        if (useProjectStore.getState().scenes.length === 0) {
          useScriptWriterStore.getState().clearPreviousContent();
          skipSyncRef.current = true;
          // 다음 렌더 사이클에서 skipSync 해제
          requestAnimationFrame(() => { skipSyncRef.current = false; });
        }
      }
    }
    _lastKnownProjectId = currentProjectId;
  }, [currentProjectId, setLines]);

  // [FIX #1162] splitResult(단락 나누기 결과) 변경 시 사운드 라인 즉시 재동기화
  // — 기존 라인이 있고, splitResult의 개수나 경계가 바뀌면 재동기화
  // — fingerprint를 ref로 기억해 setLines 후 재실행되어도 무한 루프를 막는다
  const prevSplitFingerprintRef = React.useRef('');
  useEffect(() => {
    const splitTexts = splitResultFromWriter.map((text) => text.trim()).filter(Boolean);
    const splitFingerprint = `${currentProjectId || 'no-project'}:${JSON.stringify(splitTexts)}`;
    const prevFingerprint = prevSplitFingerprintRef.current;
    prevSplitFingerprintRef.current = splitFingerprint;
    if (splitTexts.length === 0 || splitFingerprint === prevFingerprint) return;
    // 현재 라인이 없으면 메인 useEffect에서 처리
    if (lines.length === 0) return;
    const currentLineTexts = lines.map((line) => line.text.trim());
    const alreadySynced = currentLineTexts.length === splitTexts.length
      && currentLineTexts.every((text, index) => text === splitTexts[index]);
    if (alreadySynced) return;
    const hasExternallyManagedLines = lines.some((line) =>
      line.sceneId?.startsWith('video-analysis:')
      || line.audioSource === 'uploaded'
      || !!line.uploadedAudioId,
    ) || useProjectStore.getState().config?.narrationSource === 'uploaded-audio';
    const hasLineAudio = lines.some((line) => !!line.audioUrl);
    const scenesHaveAudio = useProjectStore.getState().scenes.some((scene) => !!scene.audioUrl);
    if (hasExternallyManagedLines || hasLineAudio || scenesHaveAudio) return;
    // splitResult가 현재 대본과 매칭하는지 확인
    const splitJoined = splitResultFromWriter.join('').replace(/\s+/g, '');
    const scriptClean = storeScript.replace(/\s+/g, '');
    if (splitJoined.length === 0 || scriptClean.length === 0) return;
    const matches = scriptClean.includes(splitJoined.slice(0, 50)) || splitJoined.includes(scriptClean.slice(0, 50));
    if (!matches) return;
    let defaultSpeakerId = speakers[0]?.id || '';
    if (speakers.length === 0) {
      const newSpeaker: Speaker = {
        id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
        engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
        speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
        style: 0, useSpeakerBoost: true, lineCount: splitTexts.length, totalDuration: 0,
      };
      addSpeaker(newSpeaker);
      defaultSpeakerId = newSpeaker.id;
    }
    setLines(splitTexts.map((text: string, i: number) => ({
      id: `line-${Date.now()}-${i}`,
      speakerId: defaultSpeakerId,
      text,
      index: i,
    })));
  }, [addSpeaker, currentProjectId, lines, setLines, speakers, splitResultFromWriter, storeScript]);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [directScript, setDirectScript] = useState('');
  const [browsedEngine, setBrowsedEngine] = useState<TTSEngine | null>(null);
  const [browseLanguage, setBrowseLanguage] = useState<TTSLanguage>('ko');
  // 커스텀 음성 목록 (Voice Clone — browseVoices에 합치기 위해)
  const [customVoicesForBrowse, setCustomVoicesForBrowse] = useState<VoiceOption[]>([]);
  useEffect(() => {
    if (browsedEngine === ('edge' as TTSEngine)) {
      getCustomVoices().then(voices => {
        setCustomVoicesForBrowse(voices.map(v => ({
          id: v.id, name: `🎙️ ${v.name}`, language: 'ko' as TTSLanguage,
          gender: 'custom' as 'male' | 'female', engine: 'edge' as TTSEngine,
        })));
      }).catch(() => {});
    }
  }, [browsedEngine]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleCacheRef = useRef<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [supertonicProgress, setSupertonicProgress] = useState<{ step: string; current: number; total: number } | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState(1.0);
  const playIdRef = useRef(0); // 재생 세대 카운터 — 레이스 컨디션 방지
  const [systemVoicesReady, setSystemVoicesReady] = useState(false);

  // --- 오디오 업로드 관련 상태 ---
  const [narrationSource, setNarrationSource] = useState<AudioSourceType>('tts');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedBlobUrl, setUploadedBlobUrl] = useState<string | null>(null);
  const [uploadedDuration, setUploadedDuration] = useState<number>(0);
  const [transcriptResult, setTranscriptResult] = useState<WhisperTranscriptResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPlayingUpload, setIsPlayingUpload] = useState(false);
  const uploadAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isTranscribing = useSoundStudioStore((s) => s.isTranscribing);
  const setIsTranscribing = useSoundStudioStore((s) => s.setIsTranscribing);
  const transcriptionProgress = useSoundStudioStore((s) => s.transcriptionProgress);
  const setTranscriptionProgress = useSoundStudioStore((s) => s.setTranscriptionProgress);
  const addUploadedAudio = useSoundStudioStore((s) => s.addUploadedAudio);
  const mergedAudioUrl = useSoundStudioStore((s) => s.mergedAudioUrl);
  const setMergedAudio = useSoundStudioStore((s) => s.setMergedAudio);

  // ElevenLabs Dialogue V3 브라우즈 파라미터
  const [browseElevenLabsStability, setBrowseElevenLabsStability] = useState(0.5);
  const [browseElevenLabsLanguage, setBrowseElevenLabsLanguage] = useState('auto');

  // ElevenLabs 검색/필터
  const [elSearchQuery, setElSearchQuery] = useState('');
  const [elFilterAccent, setElFilterAccent] = useState('');
  const [elFilterGender, setElFilterGender] = useState('');
  const [elFilterAge, setElFilterAge] = useState('');
  const [elFilterUseCase, setElFilterUseCase] = useState('');
  const [elOpenDropdown, setElOpenDropdown] = useState<string | null>(null);

  // Typecast 검색
  const [typecastSearch, setTypecastSearch] = useState('');

  // Typecast 브라우즈 레벨 파라미터
  const [typecastVoices, setTypecastVoices] = useState<TypecastVoice[]>([]);
  const [isLoadingTypecastVoices, setIsLoadingTypecastVoices] = useState(false);
  const [typecastVoiceError, setTypecastVoiceError] = useState<string | null>(null);
  const [browseEmotionMode, setBrowseEmotionMode] = useState<'smart' | 'preset'>('smart');
  const [browseEmotionPreset, setBrowseEmotionPreset] = useState('normal');
  const [browseEmotionIntensity, setBrowseEmotionIntensity] = useState(1.0);
  const [browseTypecastModel, setBrowseTypecastModel] = useState('ssfm-v30');
  const [browseTypecastVolume, setBrowseTypecastVolume] = useState(100);
  const [browseTypecastPitch, setBrowseTypecastPitch] = useState(0);
  const [typecastCategoryFilter, setTypecastCategoryFilter] = useState<string | null>(null);
  const [typecastLanguageFilter, setTypecastLanguageFilter] = useState<string | null>(null); // Typecast 언어 코드 (e.g. 'ko-kr') or null=전체
  const [typecastGenderFilter, setTypecastGenderFilter] = useState<string | null>(null);
  const [typecastAgeFilter, setTypecastAgeFilter] = useState<string | null>(null);
  const [typecastModelFilter, setTypecastModelFilter] = useState<string | null>(null);
  // showAllTypecastLanguages 제거 → 가로 스크롤로 대체
  const [recentTypecastVoiceIds, setRecentTypecastVoiceIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('TYPECAST_RECENT_VOICES') || '[]'); } catch (e) { logger.trackSwallowedError('VoiceStudio:loadRecentTypecastVoices', e); return []; }
  });

  // Typecast 카테고리 태그 — 모든 음성의 use_cases에서 집계
  const typecastCategoryTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of typecastVoices) {
      for (const uc of getKoreanUseCases(v.use_cases)) {
        counts.set(uc, (counts.get(uc) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [typecastVoices]);

  // ElevenLabs 필터 옵션 동적 추출
  const elFilterOptions = useMemo(() => {
    const accents = new Map<string, number>();
    const useCases = new Map<string, number>();
    const ages = new Map<string, number>();
    for (const v of ELEVENLABS_VOICES) {
      if (v.accent) accents.set(v.accent, (accents.get(v.accent) || 0) + 1);
      if (v.useCase) useCases.set(v.useCase, (useCases.get(v.useCase) || 0) + 1);
      if (v.age) ages.set(v.age, (ages.get(v.age) || 0) + 1);
    }
    const sortDesc = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return {
      accents: sortDesc(accents),
      useCases: sortDesc(useCases),
      ages: sortDesc(ages),
    };
  }, []);

  const elActiveFilterCount = [elFilterAccent, elFilterGender, elFilterAge, elFilterUseCase].filter(Boolean).length;

  // ElevenLabs 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!elOpenDropdown) return;
    const handler = () => setElOpenDropdown(null);
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [elOpenDropdown]);

  // 최근 사용 음성 추적 (Typecast)
  const trackRecentTypecastVoice = useCallback((voiceId: string) => {
    setRecentTypecastVoiceIds(prev => {
      const next = [voiceId, ...prev.filter(id => id !== voiceId)].slice(0, 10);
      localStorage.setItem('TYPECAST_RECENT_VOICES', JSON.stringify(next));
      return next;
    });
  }, []);

  // 대본이 있고 라인이 비어있으면 자동 동기화
  // 1순위: projectStore scenes에서 파생 (sceneId 연결, 기존 오디오 복원)
  // 2순위 폴백: storeScript 단락 분할
  // [FIX #532] 대본이 변경되면 기존 라인도 갱신 (이전 대본이 남는 버그 수정)
  const prevStoreScriptRef = React.useRef(storeScript);
  useEffect(() => {
    // [FIX #989] 프로젝트 전환 직후 재동기화 방지 — clearPreviousContent 반영 대기
    if (skipSyncRef.current) return;
    // [FIX #1079] 영상 분석/업로드 오디오에서 넘어온 라인은 scriptWriter 대본으로 덮어쓰지 않음
    const hasExternallyManagedLines = lines.some((line) =>
      line.sceneId?.startsWith('video-analysis:')
      || line.audioSource === 'uploaded'
      || !!line.uploadedAudioId,
    ) || useProjectStore.getState().config?.narrationSource === 'uploaded-audio';
    if (hasExternallyManagedLines) {
      prevStoreScriptRef.current = storeScript;
      return;
    }
    // 대본 내용이 실질적으로 변경된 경우 라인 초기화하여 재동기화
    if (lines.length > 0 && storeScript && prevStoreScriptRef.current !== storeScript) {
      const currentText = lines.map(l => l.text).join('\n');
      // 기존 라인 텍스트와 새 대본이 다르면 초기화
      if (currentText.replace(/\s+/g, '') !== storeScript.replace(/\s+/g, '')) {
        prevStoreScriptRef.current = storeScript;
        setLines([]);
        return; // 다음 렌더에서 빈 lines로 재진입하여 새 대본으로 동기화
      }
    }
    prevStoreScriptRef.current = storeScript;
    if (lines.length > 0) return;

    // [FIX #1162] splitResult·scenes 동시 확인 — 단락 나누기 결과를 우선 반영
    const scenes = useProjectStore.getState().scenes;
    const sceneNarrationTexts = scenes.map((scene) => getSceneNarrationText(scene).trim());
    const scenesText = sceneNarrationTexts.join('');
    const scriptTextClean = storeScript.replace(/\s+/g, '');
    const scenesTextClean = scenesText.replace(/\s+/g, '');
    const scenesMatchScript = scenesTextClean.length > 0 && (
      scriptTextClean.includes(scenesTextClean.slice(0, 100)) || scenesTextClean.includes(scriptTextClean.slice(0, 100))
    );

    // [FIX #591/#590/#780/#820/#1162] splitResult 매칭 확인
    const splitResult = splitResultFromWriter;
    const splitTexts = splitResult.filter((t: string) => t.trim());
    const splitJoined = splitResult ? splitResult.join('').replace(/\s+/g, '') : '';
    const splitMatchesScript = splitJoined.length > 0 && (
      scriptTextClean.includes(splitJoined.slice(0, 50)) || splitJoined.includes(scriptTextClean.slice(0, 50))
    );

    // [FIX #1162] 1순위: splitResult가 scenes와 수/내용이 다르고, scenes에 오디오 없으면 splitResult 우선
    // — "단락 나누기"로 다시 쪼갠 최신 경계가 scenes보다 항상 우선되도록 한다
    const scenesHaveAudio = scenes.some(s => !!s.audioUrl);
    const splitDiffersFromScenes = splitTexts.length > 0 && (
      splitTexts.length !== sceneNarrationTexts.length
      || splitTexts.some((text, index) => text !== sceneNarrationTexts[index])
    );
    if (splitDiffersFromScenes && splitMatchesScript && !scenesHaveAudio) {
      if (splitTexts.length > 0) {
        let defaultSpeakerId = speakers[0]?.id || '';
        if (speakers.length === 0) {
          const newSpeaker: Speaker = {
            id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
            engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
            speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
            style: 0, useSpeakerBoost: true, lineCount: splitTexts.length, totalDuration: 0,
          };
          addSpeaker(newSpeaker);
          defaultSpeakerId = newSpeaker.id;
        }
        setLines(splitTexts.map((text: string, i: number) => ({
          id: `line-${Date.now()}-${i}`,
          speakerId: defaultSpeakerId,
          text,
          index: i,
        })));
        return;
      }
    }

    // 2순위: scenes에서 파생 (단, 현재 대본과 일치하는 경우에만)
    if (scenes.length > 0 && scenesMatchScript) {
      let defaultSpeakerId = speakers[0]?.id || '';
      if (speakers.length === 0) {
        const newSpeaker: Speaker = {
          id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
          engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
          speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
          style: 0, useSpeakerBoost: true, lineCount: scenes.length, totalDuration: 0,
        };
        addSpeaker(newSpeaker);
        defaultSpeakerId = newSpeaker.id;
      }
      setLines(scenes.map((scene, i) => ({
        id: `line-${Date.now()}-${i}`,
        speakerId: defaultSpeakerId,
        text: getSceneNarrationText(scene),
        index: i,
        sceneId: scene.id,
        audioUrl: scene.audioUrl,
        duration: scene.audioDuration,
        startTime: scene.startTime,
        endTime: scene.endTime,
      })));
      return;
    }

    // 3순위: splitResult (scenes가 없거나 불일치할 때)
    if (splitResult && splitResult.length > 0 && splitMatchesScript) {
      if (splitTexts.length > 0) {
        let defaultSpeakerId2 = speakers[0]?.id || '';
        if (speakers.length === 0) {
          const newSpeaker: Speaker = {
            id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
            engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
            speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
            style: 0, useSpeakerBoost: true, lineCount: splitTexts.length, totalDuration: 0,
          };
          addSpeaker(newSpeaker);
          defaultSpeakerId2 = newSpeaker.id;
        }
        setLines(splitTexts.map((text: string, i: number) => ({
          id: `line-${Date.now()}-${i}`,
          speakerId: defaultSpeakerId2,
          text,
          index: i,
        })));
        return;
      }
    }

    // 3순위 폴백: storeScript를 자연스러운 문장 단위로 분할 (나레이션 TTS용)
    if (!storeScript.trim()) return;
    const rawParts = splitBySentenceEndings(storeScript);
    if (rawParts.length === 0) return;
    const MAX_LINE_CHARS = 4000;
    const parts: string[] = [];
    for (const part of rawParts) {
      if (part.length <= MAX_LINE_CHARS) {
        parts.push(part);
      } else {
        parts.push(...splitTextForTTS(part, MAX_LINE_CHARS));
      }
    }
    if (parts.length === 0) return;
    let defaultSpeakerId = speakers[0]?.id || '';
    if (speakers.length === 0) {
      const newSpeaker: Speaker = {
        id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
        engine: 'typecast' as TTSEngine, voiceId: '', language: 'ko',
        speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
        style: 0, useSpeakerBoost: true, lineCount: parts.length, totalDuration: 0,
      };
      addSpeaker(newSpeaker);
      defaultSpeakerId = newSpeaker.id;
    }
    setLines(parts.map((text, i) => ({
      id: `line-${Date.now()}-${i}`,
      speakerId: defaultSpeakerId,
      text,
      index: i,
    })));
  }, [addSpeaker, currentProjectId, lines, setLines, speakers, splitResultFromWriter, storeScript]); // 대본/프로젝트/단락 변경 시 재동기화

  // [Microsoft 제거됨] 시스템 음성 감지 불필요 — ElevenLabs는 서버 사이드 생성
  useEffect(() => { setSystemVoicesReady(true); }, []);

  // Supertonic 모델 로딩 진행률 구독
  useEffect(() => {
    const unsub = onLoadProgress((step, current, total) => {
      setSupertonicProgress({ step, current, total });
    });
    return unsub;
  }, []);

  // Typecast 음성 목록 로드 (마운트 시 즉시)
  // API 키 없어도 내장 카탈로그 487명이 즉시 표시됨
  const loadTypecastVoices = useCallback((force = false) => {
    if (!force && (typecastVoices.length > 0 || isLoadingTypecastVoices)) return;
    if (force) clearTypecastVoiceCache();
    setIsLoadingTypecastVoices(true);
    setTypecastVoiceError(null);
    fetchTypecastVoices(force)
      .then(voices => {
        setTypecastVoices(voices);
        setTypecastVoiceError(null);
      })
      .catch(err => setTypecastVoiceError(err.message))
      .finally(() => setIsLoadingTypecastVoices(false));
  }, [typecastVoices.length, isLoadingTypecastVoices]);

  useEffect(() => { loadTypecastVoices(); }, []);

  // API 키 변경 감지 → 자동 리로드 (같은 탭 + 다른 탭)
  useEffect(() => {
    const handleKeyChange = () => loadTypecastVoices(true);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'CUSTOM_TYPECAST_KEY') handleKeyChange();
    };
    window.addEventListener('typecast-key-changed', handleKeyChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('typecast-key-changed', handleKeyChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadTypecastVoices]);

  // 언마운트 시 재생 중인 오디오 정리
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        unregisterAudio(audioRef.current);
        if (audioRef.current.src?.startsWith('blob:')) { logger.unregisterBlobUrl(audioRef.current.src); URL.revokeObjectURL(audioRef.current.src); }
        audioRef.current = null;
      }
      if (uploadAudioRef.current) {
        uploadAudioRef.current.pause();
        unregisterAudio(uploadAudioRef.current);
        uploadAudioRef.current = null;
      }
      Object.values(sampleCacheRef.current).forEach(url => {
        if (url.startsWith('blob:')) { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }
      });
      sampleCacheRef.current = {};
    };
  }, []);

  // 내부적으로 단일 화자를 사용 (UI에 노출하지 않음)
  const activeSpeaker = speakers[0] ?? null;
  const avgChars = useMemo(() => {
    if (lines.length === 0) return 0;
    return Math.round(lines.reduce((sum, l) => sum + l.text.length, 0) / lines.length);
  }, [lines]);
  const estimatedDuration = useMemo(() => {
    const sec = Math.round(lines.reduce((sum, l) => sum + l.text.length, 0) / 5);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, [lines]);


  /** 라인 편집 시작 */
  const startEdit = useCallback((line: ScriptLine) => {
    setEditingLineId(line.id);
    setEditText(line.text);
  }, []);

  /** 라인 편집 확정 */
  const confirmEdit = useCallback(() => {
    if (editingLineId && editText.trim()) {
      updateLine(editingLineId, { text: editText.trim() });
    }
    setEditingLineId(null);
    setEditText('');
  }, [editingLineId, editText, updateLine]);

  /** 대본 직접 입력 적용 */
  const handleApplyDirectScript = useCallback(() => {
    if (!directScript.trim()) return;
    const sentences = splitBySentenceEndings(directScript);
    let speakerId = speakers[0]?.id || '';
    if (!speakerId) {
      const newSpeaker: Speaker = {
        id: `speaker-${Date.now()}`, name: '화자 1', color: SPEAKER_COLORS[0],
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

  // === TTS 생성 ===
  const [isGeneratingLine, setIsGeneratingLine] = useState<string | null>(null);
  const [changingLineIndex, setChangingLineIndex] = useState<number | null>(null);

  // 줄별 캐릭터 변경: 음성 브라우저 열기 (현재 선택된 엔진 유지)
  const handleOpenVoiceBrowserForLine = useCallback((lineIndex?: number) => {
    if (lineIndex !== undefined) setChangingLineIndex(lineIndex);
    setBrowsedEngine(activeSpeaker?.engine || ttsEngine || ('typecast' as TTSEngine));
    // 스크롤해서 음성 브라우저가 보이게
    setTimeout(() => {
      document.querySelector('[data-voice-browser]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [activeSpeaker?.engine, ttsEngine]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ current: 0, total: 0 });

  // Elapsed timers for async operations
  const elapsedGen = useElapsedTimer(isGeneratingAll);
  const elapsedTranscribe = useElapsedTimer(isTranscribing);
  const elapsedTypecastLoad = useElapsedTimer(isLoadingTypecastVoices);

  const handleGenerateLine = useCallback(async (lineId: string) => {
    logger.trackAction('나레이션 생성 시작', lineId);
    if (!requireAuth('TTS 음성 생성')) return;
    // [FIX #944] stale closure 방지 — store에서 최신 lines/speakers를 직접 읽음
    const freshLines = useSoundStudioStore.getState().lines;
    const freshSpeakers = useSoundStudioStore.getState().speakers;
    const lineIdx = freshLines.findIndex(l => l.id === lineId);
    if (lineIdx < 0) return;
    const line = freshLines[lineIdx];
    const speaker = (line.speakerId ? freshSpeakers.find(s => s.id === line.speakerId) : null) || freshSpeakers[0];
    // [FIX #783] 줄별 voiceId도 확인 — 개별 캐릭터 선택 시 speaker.voiceId 없어도 진행 가능
    if (!line.voiceId && !speaker?.voiceId) {
      showToast('음성을 선택해주세요.');
      return;
    }
    if (speaker.engine === 'typecast' && !getTypecastKey()) {
      showToast('Typecast API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.');
      return;
    }
    if (!line.text?.trim()) {
      showToast('텍스트가 비어있습니다.');
      return;
    }

    const usesUploadedNarration = line.audioSource === 'uploaded' || !!line.uploadedAudioId;
    setIsGeneratingLine(lineId);
    updateLine(lineId, usesUploadedNarration
      ? {
          audioUrl: undefined,
          audioSource: 'tts',
          uploadedAudioId: undefined,
          startTime: undefined,
          endTime: undefined,
          duration: undefined,
          ttsStatus: 'generating',
        }
      : { ttsStatus: 'generating' });

    try {
      const prevText = lineIdx > 0 ? freshLines[lineIdx - 1]?.text?.slice(-200) : undefined;
      const nextText = lineIdx < freshLines.length - 1 ? freshLines[lineIdx + 1]?.text?.slice(0, 200) : undefined;

      let result: { audioUrl: string };

      if (speaker.engine === 'elevenlabs') {
        // ElevenLabs Dialogue V3 — 감정 Audio Tag 삽입
        const emotionTag = EL_EMOTION_TAGS[line.emotion || ''] || '';
        result = await generateElevenLabsDialogueTTS({
          text: emotionTag + line.text,
          voiceId: line.voiceId || speaker.voiceId,
          stability: speaker.stability ?? 0.5,
          languageCode: speaker.language || 'auto',
        });
      } else if (speaker.engine === ('edge' as TTSEngine)) {
        const vid = line.voiceId || speaker.voiceId || 'ko-KR-SunHiNeural';
        if (vid.startsWith('custom_')) {
          result = await generateCloneTTS(line.text, vid, speaker.language || 'ko');
        } else {
          result = await generateEdgeTTS(line.text, vid, speaker.language || 'ko');
        }
      } else if (speaker.engine === 'supertonic') {
        result = await generateSupertonicTTS(line.text, line.voiceId || speaker.voiceId, speaker.language || 'ko', line.lineSpeed ?? speaker.speed ?? 1.0);
      } else {
        // Typecast (기본)
        result = await generateTypecastTTS(line.text, {
          voiceId: line.voiceId || speaker.voiceId,
          model: speaker.typecastModel || 'ssfm-v30',
          language: speaker.language === 'ko' ? 'kor' : speaker.language === 'ja' ? 'jpn' : 'eng',
          emotionMode: speaker.emotionMode || 'smart',
          emotionPreset: (line.emotion || speaker.emotionPreset || 'normal') as 'normal' | 'happy' | 'sad' | 'angry' | 'whisper' | 'toneup' | 'tonedown',
          speed: line.lineSpeed ?? speaker.speed ?? 1.0,
          pitch: speaker.pitch,
          volume: speaker.typecastVolume,
          previousText: prevText,
          nextText: nextText,
        });
      }

      // [FIX #918] 개별 클립 음량 정규화 — 멀티 캐릭터 음량 편차 제거
      // [FIX #920] 30초 타임아웃 추가 — tempfile CDN 장애 시 교착 방지
      try {
        const normalizePromise = normalizeAudioUrl(result.audioUrl);
        const normalizeTimeout = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('normalizeAudioUrl 타임아웃 (30초)')), 30_000));
        result.audioUrl = await Promise.race([normalizePromise, normalizeTimeout]);
      } catch (e) { logger.trackSwallowedError('VoiceStudio:generateTTS/normalizeAudio', e); }

      // [FIX] TTS 오디오 디코딩 → 실제 duration 측정
      // [FIX #920] 15초 타임아웃 추가 — 오디오 URL 페치 교착 방지
      let realDuration: number | undefined;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const resp = await fetch(result.audioUrl, { signal: AbortSignal.timeout(15_000) });
        const buf = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        realDuration = decoded.duration;
        ctx.close();
      } catch (e) { logger.trackSwallowedError('VoiceStudio:generateTTS/decodeDuration', e); }

      const hasFixedTimeline = !usesUploadedNarration &&
        typeof line.startTime === 'number' &&
        typeof line.endTime === 'number' &&
        Number.isFinite(line.startTime) &&
        Number.isFinite(line.endTime) &&
        line.endTime > line.startTime;
      const fixedDuration = hasFixedTimeline
        ? Math.max(0.1, line.endTime - line.startTime)
        : undefined;

      updateLine(lineId, {
        audioUrl: result.audioUrl,
        audioSource: 'tts',
        uploadedAudioId: undefined,
        ttsStatus: 'done',
        ...(fixedDuration != null
          ? { duration: fixedDuration }
          : (realDuration != null ? { duration: realDuration } : {})),
      });

      // Scene 오디오/타이밍 동기화 (sceneId 기반)
      if (line.sceneId) {
        useProjectStore.getState().updateScene(line.sceneId, {
          audioUrl: result.audioUrl,
          ...(fixedDuration != null
            ? {
                startTime: line.startTime,
                endTime: line.endTime,
                audioDuration: fixedDuration,
              }
            : (realDuration != null ? { audioDuration: realDuration } : {})),
        });
      }

      // TTS 비용 추적
      const charCount = line.text.length;
      if (speaker.engine === 'elevenlabs') {
        addCost((charCount / 1000) * PRICING.TTS_ELEVENLABS_TURBO_PER_1K, 'tts');
      } else if (speaker.engine !== 'supertonic' && speaker.engine !== ('edge' as TTSEngine)) {
        // Typecast (기본) — 모델에 따라 단가 다름
        const costPer1K = speaker.typecastModel === 'ssfm-v21' ? PRICING.TTS_TYPECAST_V21_PER_1K : PRICING.TTS_TYPECAST_V30_PER_1K;
        addCost((charCount / 1000) * costPer1K, 'tts');
      }
    } catch (err) {
      console.error('[VoiceStudio] TTS 생성 실패:', err);
      updateLine(lineId, { ttsStatus: 'error' });
      const errMsg = err instanceof Error ? err.message : String(err);
      useUIStore.getState().setToast({ show: true, message: `TTS 생성 실패: ${errMsg}` });
      setTimeout(() => useUIStore.getState().setToast(null), 4000);
    } finally {
      setIsGeneratingLine(null);
    }
  }, [updateLine, addCost]);

  const handleGenerateAll = useCallback(async () => {
    logger.trackAction('나레이션 일괄 생성 시작');
    if (!requireAuth('TTS 일괄 생성')) return;
    if (isGeneratingAll) return;
    // [FIX #783] 멀티캐릭터: speaker 또는 개별 줄에 voiceId가 있으면 진행 가능
    const hasAnyVoice = speakers.some(s => s.voiceId) || lines.some(l => l.voiceId);
    if (!hasAnyVoice) {
      showToast('음성을 선택해주세요. 음성 브라우저에서 캐릭터를 클릭하세요.');
      return;
    }
    if (lines.length === 0) {
      showToast('나레이션 대본이 없습니다. 대본을 먼저 입력해주세요.');
      return;
    }

    setIsGeneratingAll(true);
    setGenerateProgress({ current: 0, total: lines.length });

    try {
      // [FIX #920] KIE 레이트 리밋 배치 — 동시 5개로 축소 (43개 중 42에서 멈춤 방지)
      // 개별 항목 타임아웃 + 1회 재시도로 교착 없이 완료 보장
      const targets = lines.filter(l => !l.audioUrl || l.ttsStatus !== 'done');
      let done = 0;
      const batchResult = await runKieBatch(targets, async (line) => {
        await handleGenerateLine(line.id);
        // [FIX #920] handleGenerateLine이 에러를 삼키므로, store에서 실제 상태 확인
        const latestLine = useSoundStudioStore.getState().lines.find(l => l.id === line.id);
        if (!latestLine?.audioUrl || latestLine.ttsStatus === 'error') {
          throw new Error(`TTS 생성 실패: line ${line.id}`);
        }
      }, () => {
        done++;
        setGenerateProgress({ current: lines.length - targets.length + done, total: lines.length });
      }, {
        submitPerWindow: 5,     // [FIX #920] 10 → 5로 축소 (rate limit 여유)
        itemTimeoutMs: 180_000, // 3분 타임아웃
        retryCount: 1,          // 1회 재시도
        retryDelayMs: 5_000,    // 5초 후 재시도
      });
      setGenerateProgress({ current: lines.length, total: lines.length });

      // [FIX #920] 실패 항목 사용자 알림
      if (batchResult.failed > 0) {
        const failCount = batchResult.failed;
        showToast(`${targets.length}개 중 ${failCount}개 TTS 생성 실패 — 나머지는 정상 완료`, 5000);
        logger.warn('[VoiceStudio] 배치 TTS 부분 실패', { total: targets.length, failed: failCount, succeeded: batchResult.succeeded });
      }

      // 전체 병합 (실패한 항목 제외, 성공한 항목만)
      const updatedLines = useSoundStudioStore.getState().lines;
      const audioUrls = updatedLines.filter(l => l.audioUrl).map(l => l.audioUrl as string);
      if (audioUrls.length > 0) {
        const mergedUrl = await mergeAudioFiles(audioUrls);
        useSoundStudioStore.getState().setMergedAudio(mergedUrl);
      }
    } catch (err) {
      console.error('[VoiceStudio] 전체 생성 실패:', err);
      showToast('전체 TTS 생성 중 오류 발생', 3000);
    } finally {
      setIsGeneratingAll(false);
      setGenerateProgress({ current: 0, total: 0 });
    }
  }, [lines, speakers, isGeneratingAll, handleGenerateLine]);

  /** 현재 엔진+언어에 맞는 음성 목록 (화자 패널용) */

  /** 엔진 브라우저용 음성 목록 (화자 없이도 동작) */
  const browseVoices = useMemo((): VoiceOption[] => {
    if (!browsedEngine) return [];
    // Typecast: API에서 가져온 음성 목록 매핑
    if (browsedEngine === 'typecast') {
      return typecastVoices.map(v => ({
        id: v.voice_id,
        name: v.name,
        language: 'ko' as TTSLanguage,
        gender: (v.gender === 'male' ? 'male' : 'female') as 'male' | 'female',
        engine: 'typecast' as TTSEngine,
        preview: v.preview_url,
      })).sort((a, b) => (a.gender === 'female' ? 0 : 1) - (b.gender === 'female' ? 0 : 1));
    }
    // ElevenLabs: elevenlabsService에서 직접 음성 목록 사용 + 검색/필터
    if (browsedEngine === 'elevenlabs') {
      const q = elSearchQuery.toLowerCase().trim();
      return ELEVENLABS_VOICES
        .filter(v => {
          if (q && !v.name.toLowerCase().includes(q) && !v.description.toLowerCase().includes(q) && !elNameKo(v.name).toLowerCase().includes(q)) return false;
          if (elFilterAccent && v.accent !== elFilterAccent) return false;
          if (elFilterGender && v.gender !== elFilterGender) return false;
          if (elFilterAge && v.age !== elFilterAge) return false;
          if (elFilterUseCase && v.useCase !== elFilterUseCase) return false;
          return true;
        })
        .map(v => ({
          id: v.id,
          name: v.name,
          language: 'ko' as TTSLanguage,
          gender: v.gender,
          engine: 'elevenlabs' as TTSEngine,
          preview: v.previewUrl || undefined,
          description: v.description || undefined,
          accent: v.accent || undefined,
        }))
        .sort((a, b) => (a.gender === 'female' ? 0 : 1) - (b.gender === 'female' ? 0 : 1));
    }
    const skipLangFilter = browsedEngine === 'supertonic' || browsedEngine === ('edge' as TTSEngine);
    const voices = getAvailableVoices(browsedEngine, skipLangFilter ? undefined : browseLanguage);
    // 커스텀 음성도 목록에 추가
    const allVoices = browsedEngine === ('edge' as TTSEngine)
      ? [...voices, ...customVoicesForBrowse]
      : voices;
    // 여성 → 남성 → 중성 → 커스텀 순서로 정렬
    const genderOrder: Record<string, number> = { female: 0, male: 1, neutral: 2, custom: 3 };
    return [...allVoices].sort((a, b) => (genderOrder[a.gender] ?? 3) - (genderOrder[b.gender] ?? 3));
  }, [browsedEngine, browseLanguage, systemVoicesReady, typecastVoices, elSearchQuery, elFilterAccent, elFilterGender, elFilterAge, elFilterUseCase, customVoicesForBrowse]);

  /** 모든 재생 즉시 중단 (Audio + speechSynthesis) */
  const stopAllPlayback = useCallback(() => {
    playIdRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      unregisterAudio(audioRef.current);
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setPlayingVoiceId(null);
  }, []);

  /** Audio 엘리먼트를 생성하고 재생 + 상태 추적 연결 */
  const playAudio = useCallback((url: string, voiceId: string, staleCheck: () => boolean, speed: number = 1.0) => {
    const audio = new Audio(url);
    registerAudio(audio);
    audio.playbackRate = speed;
    audioRef.current = audio;
    audio.onended = () => { if (!staleCheck()) setPlayingVoiceId(null); unregisterAudio(audio); };
    audio.onerror = () => { if (!staleCheck()) { setSampleError('오디오 재생 실패'); setPlayingVoiceId(null); } unregisterAudio(audio); };
    audio.play().catch(() => { if (!staleCheck()) { setSampleError('오디오 재생 실패 (자동 재생 차단)'); setPlayingVoiceId(null); } unregisterAudio(audio); });
  }, []);

  /**
   * 음성 샘플 재생 — 4단계 캐시 체인 + 속도 조절
   * 1. 인메모리 캐시 (즉시)
   * 2. Cache API 영구 캐시 (세션 간 유지)
   * 3. 프리빌트 정적 파일 (/audio/samples/)
   * 4. API 생성 (최후 수단)
   * 속도는 Audio.playbackRate로 적용 (캐시 무효화 없이 즉시 변경)
   */
  const handlePlaySample = useCallback(async (voice: VoiceOption) => {
    setSampleError(null);
    stopAllPlayback();

    const thisPlayId = playIdRef.current;
    const isStale = () => thisPlayId !== playIdRef.current;
    const speed = previewSpeed;
    const lang = browseLanguage;
    const sampleText = SAMPLE_TEXTS[lang] || SAMPLE_TEXTS['ko'];

    // (Microsoft Edge TTS 제거됨 — ElevenLabs Dialogue V3로 대체)

    // 캐시 키: 엔진+음성+언어 (속도 미포함 — playbackRate로 적용)
    const cacheKey = `${voice.engine}_${voice.id}_${lang}`;

    // 1단계: 인메모리 캐시 (즉시)
    const memCached = sampleCacheRef.current[cacheKey];
    if (memCached) {
      setPlayingVoiceId(voice.id);
      playAudio(memCached, voice.id, isStale, speed);
      return;
    }

    // 2단계: Cache API 영구 캐시 (세션 간 유지)
    const persistent = await getCachedPreview(cacheKey);
    if (persistent) {
      sampleCacheRef.current[cacheKey] = persistent;
      if (isStale()) return;
      setPlayingVoiceId(voice.id);
      playAudio(persistent, voice.id, isStale, speed);
      return;
    }

    // 3단계: 프리빌트 정적 파일 (/audio/samples/{engine}/{voiceId}_ko.wav)
    if (voice.preview) {
      try {
        const res = await fetch(voice.preview);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          logger.registerBlobUrl(url, 'audio', 'VoiceStudio:playVoiceSample');
          sampleCacheRef.current[cacheKey] = url;
          cachePreview(cacheKey, voice.preview);
          if (isStale()) return;
          setPlayingVoiceId(voice.id);
          playAudio(url, voice.id, isStale, speed);
          return;
        }
      } catch (e) { logger.trackSwallowedError('VoiceStudio:previewVoice/staticFile', e); }
    }

    // 4단계: API 생성 (기본 속도 1.0으로 생성, playbackRate로 속도 적용 — 이중 적용 방지)
    setPlayingVoiceId(voice.id);
    setSampleError(`⏳ ${voice.engine === 'edge' ? 'Edge' : voice.engine} 음성 생성 중...`);
    try {
      let result: { audioUrl: string } | undefined;
      switch (voice.engine) {
        case 'edge' as TTSEngine:
          result = await generateEdgeTTS(sampleText, voice.id, lang as TTSLanguage);
          break;
        case 'elevenlabs':
          result = await generateElevenLabsDialogueTTS({
            text: sampleText,
            voiceId: voice.id,
            stability: 0.5,
            languageCode: lang || 'auto',
          });
          break;
        case 'typecast': {
          const tcResult = await generateTypecastTTS(sampleText, {
            voiceId: voice.id,
            model: browseTypecastModel as 'ssfm-v30' | 'ssfm-v21',
            emotionMode: browseEmotionMode,
            emotionPreset: browseEmotionPreset as 'normal' | 'happy' | 'sad' | 'angry' | 'whisper' | 'toneup' | 'tonedown',
            emotionIntensity: browseEmotionIntensity,
            pitch: browseTypecastPitch,
            volume: browseTypecastVolume,
          });
          result = { audioUrl: tcResult.audioUrl };
          break;
        }
      }
      if (isStale()) return;
      setSampleError(null); // 로딩 메시지 클리어
      if (result) {
        sampleCacheRef.current[cacheKey] = result.audioUrl;
        cachePreview(cacheKey, result.audioUrl);
        playAudio(result.audioUrl, voice.id, isStale, speed);
      }
    } catch (e: unknown) {
      if (isStale()) return;
      const msg = e instanceof Error ? e.message : '샘플 생성 실패';
      setSampleError(msg);
      setPlayingVoiceId(null);
    }
  }, [browseLanguage, previewSpeed, stopAllPlayback, playAudio, browseTypecastModel, browseEmotionMode, browseEmotionPreset, browseEmotionIntensity, browseTypecastPitch, browseTypecastVolume]);

  // --- 오디오 업로드 핸들러 ---
  const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm'];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadError(null);
    setTranscriptResult(null);

    if (!ACCEPTED_AUDIO_TYPES.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|webm|aac)$/i)) {
      setUploadError('지원하지 않는 파일 형식입니다. mp3, wav, m4a, ogg, webm 파일을 사용해주세요.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('파일 크기가 100MB를 초과합니다.');
      return;
    }

    // blob URL 생성
    if (uploadedBlobUrl) { logger.unregisterBlobUrl(uploadedBlobUrl); URL.revokeObjectURL(uploadedBlobUrl); }
    const blobUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(blobUrl, 'audio', 'VoiceStudio:handleFileUpload');
    setUploadedFile(file);
    setUploadedBlobUrl(blobUrl);

    // 오디오 길이 측정
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const buf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      setUploadedDuration(decoded.duration);
    } catch (e) {
      logger.trackSwallowedError('VoiceStudio:measureUploadedDuration', e);
      setUploadedDuration(0);
    } finally {
      await ctx.close();
    }
  }, [uploadedBlobUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleRemoveUpload = useCallback(() => {
    if (uploadedBlobUrl) { logger.unregisterBlobUrl(uploadedBlobUrl); URL.revokeObjectURL(uploadedBlobUrl); }
    if (uploadAudioRef.current) {
      uploadAudioRef.current.pause();
      unregisterAudio(uploadAudioRef.current);
      uploadAudioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setUploadedFile(null);
    setUploadedBlobUrl(null);
    setUploadedDuration(0);
    setTranscriptResult(null);
    setUploadError(null);
    setIsPlayingUpload(false);
  }, [uploadedBlobUrl]);

  const handlePlayUpload = useCallback(() => {
    if (!uploadedBlobUrl) return;
    if (isPlayingUpload && uploadAudioRef.current) {
      uploadAudioRef.current.pause();
      unregisterAudio(uploadAudioRef.current);
      setIsPlayingUpload(false);
      return;
    }
    const audio = new Audio(uploadedBlobUrl);
    registerAudio(audio);
    uploadAudioRef.current = audio;
    audio.onended = () => { setIsPlayingUpload(false); unregisterAudio(audio); };
    audio.play().then(() => setIsPlayingUpload(true)).catch(() => { setIsPlayingUpload(false); unregisterAudio(audio); });
  }, [uploadedBlobUrl, isPlayingUpload]);

  const handleStartTranscription = useCallback(async () => {
    logger.trackAction('음성 텍스트 변환 시작');
    if (!requireAuth('음성 텍스트 변환')) return;
    if (!uploadedFile || isTranscribing) return;
    setIsTranscribing(true);
    setUploadError(null);
    setTranscriptResult(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await transcribeAudio(uploadedFile, {
        signal: abort.signal,
        onProgress: (msg) => setTranscriptionProgress(msg),
      });
      useCostStore.getState().addCost(PRICING.STT_SCRIBE_PER_CALL, 'tts');
      setTranscriptResult(result);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setUploadError((err as Error).message || '전사 실패');
      }
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(null);
      abortRef.current = null;
    }
  }, [uploadedFile, isTranscribing, setIsTranscribing, setTranscriptionProgress]);

  const handleApplyTranscription = useCallback(() => {
    if (!transcriptResult || !uploadedFile || !uploadedBlobUrl) return;

    const audioId = `upload-${Date.now()}`;
    const resolvedSourceDuration = uploadedDuration > 0 ? uploadedDuration : transcriptResult.duration;
    addUploadedAudio({
      id: audioId,
      fileName: uploadedFile.name,
      audioUrl: uploadedBlobUrl,
      duration: resolvedSourceDuration,
      fileSize: uploadedFile.size,
      mimeType: uploadedFile.type,
      uploadedAt: Date.now(),
    });

    const splitResult = useScriptWriterStore.getState().splitResult.filter((text) => text.trim());
    const splitJoined = splitResult.join('').replace(/\s+/g, '');
    const storeScriptClean = storeScript.replace(/\s+/g, '');
    const splitMatchesCurrentScript = splitJoined.length > 0 && (
      storeScriptClean.includes(splitJoined.slice(0, Math.min(60, splitJoined.length)))
      || splitJoined.includes(storeScriptClean.slice(0, Math.min(60, storeScriptClean.length)))
    );
    const fallbackParagraphs = storeScript
      .split(/\n+/)
      .map((text) => text.trim())
      .filter(Boolean);
    const preferredParagraphs = splitMatchesCurrentScript && splitResult.length > 0
      ? splitResult
      : fallbackParagraphs;
    const alignedSegments = preferredParagraphs.length > 1
      ? alignTranscriptSegmentsToParagraphs(transcriptResult.segments, preferredParagraphs)
      : transcriptResult.segments.filter((segment) => segment.text.trim());

    const defaultSpeakerId = speakers[0]?.id || '';
    const existingSceneIds = useProjectStore.getState().scenes.map((scene) => scene.id);
    const linkedSceneIds = existingSceneIds.length === alignedSegments.length
      ? existingSceneIds
      : undefined;
    const newLines = segmentsToScriptLines(alignedSegments, audioId, defaultSpeakerId, linkedSceneIds);
    setLines(newLines);
    setMergedAudio(uploadedBlobUrl);
    const rawSegments = transcriptResult.segments.filter((segment) => segment.text.trim());
    useProjectStore.getState().setConfig((prev) => prev ? {
      ...prev,
      script: alignedSegments.map((segment) => segment.text).join('\n'),
      mergedAudioUrl: uploadedBlobUrl,
      narrationSource: 'uploaded-audio',
      uploadedAudioId: audioId,
      targetSceneCount: undefined,
      sourceNarrationDurationSec: resolvedSourceDuration || undefined,
      transcriptDurationSec: transcriptResult.duration || undefined,
      rawUploadedTranscriptSegments: rawSegments,
      uploadedTranscriptParagraphSegments: alignedSegments,
    } : prev);
  }, [transcriptResult, uploadedFile, uploadedBlobUrl, uploadedDuration, speakers, addUploadedAudio, setLines, setMergedAudio, storeScript]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-white text-sm font-black shadow-lg">나</div>
          <div>
            <h2 className="text-lg font-bold text-white">나레이션</h2>
            <p className="text-sm text-gray-500">음성 설정</p>
          </div>
        </div>
        <p className="text-base text-gray-400">음성 엔진과 목소리를 선택하고 나레이션을 생성합니다</p>
      </div>

      {/* Narration source toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 font-semibold mr-1">나레이션 소스</span>
        {([
          { id: 'tts' as AudioSourceType, label: 'AI 음성 생성', icon: '🤖' },
          { id: 'uploaded' as AudioSourceType, label: '오디오 업로드', icon: '📁' },
        ]).map((src) => (
          <button
            key={src.id}
            type="button"
            onClick={() => setNarrationSource(src.id)}
            className={`px-4 py-2 rounded-lg text-base font-bold transition-all border ${
              narrationSource === src.id
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-md'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            <span className="mr-1.5">{src.icon}</span>
            {src.label}
          </button>
        ))}
      </div>

      {/* Audio upload section */}
      {narrationSource === 'uploaded' && (
        <div className="space-y-4">
          {/* Drop zone */}
          {!uploadedFile && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-purple-400 bg-purple-600/10'
                  : 'border-gray-600 bg-gray-800/40 hover:border-gray-500 hover:bg-gray-800/60'
              }`}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.mp3,.wav,.m4a,.ogg,.webm,.aac';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileSelect(file);
                };
                input.click();
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-gray-700/60 flex items-center justify-center text-2xl">
                  {isDragging ? '⬇' : '🎙'}
                </div>
                <p className="text-base text-gray-300 font-medium">
                  {isDragging ? '여기에 놓으세요' : '오디오 파일을 드래그하거나 클릭하여 업로드'}
                </p>
                <p className="text-sm text-gray-500">
                  mp3, wav, m4a, ogg, webm (최대 100MB)
                </p>
              </div>
            </div>
          )}

          {/* Uploaded file info */}
          {uploadedFile && (
            <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">🎵</div>
                  <div>
                    <p className="text-base font-bold text-white truncate max-w-[280px]">{uploadedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {uploadedDuration > 0 && <span>{formatDuration(uploadedDuration)}</span>}
                      {uploadedDuration > 0 && ' · '}
                      {formatFileSize(uploadedFile.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handlePlayUpload}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                      isPlayingUpload
                        ? 'bg-yellow-600/20 border-yellow-500/40 text-yellow-400'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}>
                    {isPlayingUpload ? (<><svg className="w-3.5 h-3.5 inline-block align-middle" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg> 일시정지</>) : (<><svg className="w-3.5 h-3.5 inline-block align-middle" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg> 미리듣기</>)}
                  </button>
                  <button type="button" onClick={handleStartTranscription}
                    disabled={isTranscribing}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                      isTranscribing
                        ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-violet-600 border-blue-400/50 text-white hover:from-blue-500 hover:to-violet-500'
                    }`}>
                    {isTranscribing ? '전사 중...' : '🔄 전사 시작'}
                  </button>
                  <button type="button" onClick={handleRemoveUpload}
                    className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:text-red-400 bg-gray-800 border border-gray-700 hover:border-red-500/40 transition-colors">
                    ✕
                  </button>
                </div>
              </div>

              {/* Transcription progress */}
              {isTranscribing && transcriptionProgress && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/20 border border-blue-500/20 rounded-lg">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-blue-400">{transcriptionProgress}</span>
                  {elapsedTranscribe > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedTranscribe)}</span>}
                </div>
              )}

              {/* Transcription result */}
              {transcriptResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-green-900/20 border border-green-500/20 rounded-lg">
                    <span className="text-sm text-green-400 font-bold">
                      전사 완료 — {transcriptResult.segments.length}개 문장, 언어: {transcriptResult.language}
                    </span>
                    <button type="button" onClick={handleApplyTranscription}
                      className="px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-bold border border-green-400/50 hover:from-green-500 hover:to-emerald-500 transition-all">
                      대본 라인에 적용
                    </button>
                  </div>
                  {/* Preview segments */}
                  <div className="max-h-[200px] overflow-y-auto bg-gray-900/50 rounded-lg border border-gray-700/50 p-2 space-y-1">
                    {transcriptResult.segments.slice(0, 20).map((seg, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1 text-sm">
                        <span className="text-gray-600 font-mono w-14 shrink-0">
                          {formatDuration(seg.startTime)}~{formatDuration(seg.endTime)}
                        </span>
                        <span className="text-gray-300">{seg.text}</span>
                      </div>
                    ))}
                    {transcriptResult.segments.length > 20 && (
                      <p className="text-xs text-gray-600 text-center py-1">
                        ...외 {transcriptResult.segments.length - 20}개 문장
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div className="bg-red-900/20 border border-red-600/30 rounded-lg px-4 py-3 text-base text-red-400">
              {uploadError}
            </div>
          )}
        </div>
      )}

      {/* Engine selection cards (card grid UI) — TTS 모드에서만 표시 */}
      {narrationSource === 'tts' && <div>
        <label className="text-sm text-gray-400 font-semibold block mb-2">음성 엔진 선택 — 카드를 클릭하면 개별 음성을 미리 들어볼 수 있습니다</label>
        <div className="grid grid-cols-4 gap-3">
          {TTS_ENGINES.map((eng) => {
            const isBrowsing = browsedEngine === eng.id;
            const isActive = ttsEngine === eng.id;
            return (
              <button
                key={eng.id}
                type="button"
                onClick={() => {
                  setBrowsedEngine(isBrowsing ? null : eng.id);
                  setTtsEngine(eng.id);
                  // 에디터 툴바가 선택한 엔진에 맞게 전환되도록 speaker.engine 동기화
                  if (activeSpeaker) {
                    updateSpeaker(activeSpeaker.id, { engine: eng.id });
                  } else {
                    // speaker가 없으면 생성
                    addSpeaker({
                      id: `speaker-${Date.now()}`,
                      name: '화자 1',
                      color: SPEAKER_COLORS[0],
                      engine: eng.id,
                      voiceId: '',
                      language: 'ko',
                      speed: 1.0,
                      pitch: 0,
                      stability: 0.5,
                      similarityBoost: 0.75,
                      style: 0,
                      useSpeakerBoost: true,
                      lineCount: 0,
                      totalDuration: 0,
                    });
                  }
                }}
                className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all border ${
                  isBrowsing
                    ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 border-purple-400/60 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/30'
                    : isActive
                      ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-400/40'
                      : 'bg-gray-800/80 border-gray-700 hover:border-gray-500 hover:bg-gray-700/60'
                }`}
              >
                <span className="text-xl shrink-0" style={{ filter: isBrowsing || isActive ? 'none' : 'grayscale(0.3)' }}>{eng.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-base font-bold truncate ${isBrowsing ? 'text-white' : isActive ? 'text-cyan-200' : 'text-gray-300'}`}>{eng.label}</span>
                    {eng.badge && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                        eng.id === 'supertonic' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40' :
                        eng.id === 'elevenlabs' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' :
                        eng.id === 'typecast' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' :
                        'bg-gray-700 text-gray-400 border border-gray-600'
                      }`}>{eng.badge}</span>
                    )}
                  </div>
                  <span className={`text-sm ${isBrowsing ? 'text-purple-300' : isActive ? 'text-cyan-400' : 'text-gray-500'}`}>{eng.id === 'elevenlabs' ? ELEVENLABS_VOICES.length : eng.id === 'typecast' ? typecastVoices.length : eng.voiceCount}개 음성</span>
                  {/* Supertonic 로딩 프로그레스 */}
                  {eng.id === 'supertonic' && isModelLoading() && supertonicProgress && (
                    <div className="mt-1">
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${(supertonicProgress.current / supertonicProgress.total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-purple-400">{supertonicProgress.step} ({supertonicProgress.current}/{supertonicProgress.total})</span>
                    </div>
                  )}
                  {eng.id === 'supertonic' && isModelLoaded() && (
                    <span className="text-xs text-green-400 block mt-0.5">모델 로드 완료</span>
                  )}
                </div>
                {isActive && !isBrowsing && (
                  <span className="text-cyan-400 text-xs shrink-0">&#10003;</span>
                )}
                {isBrowsing && (
                  <span className="text-purple-400 text-xs shrink-0">&#9660;</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 타입캐스트 요금 안내 */}
        {browsedEngine === 'typecast' && (
          <div className="mt-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl overflow-hidden">
            <details className="group">
              <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-blue-900/10 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-sm">💰</span>
                  <span className="text-sm font-bold text-blue-300">Typecast API 요금 안내</span>
                </div>
                <span className="text-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
                {/* 크레딧 계산 */}
                <div className="bg-gray-900/50 rounded-lg p-3 space-y-1.5">
                  <p className="text-gray-300 font-bold">1글자 = 2크레딧</p>
                  <p className="text-gray-400">200,000 크레딧 ÷ 2 = <span className="text-cyan-300 font-bold">100,000글자</span> 사용 가능</p>
                  <p className="text-gray-400">실측 정배속 기준 ~500자/분 → <span className="text-cyan-300 font-bold">약 200분 ≈ 3.3시간</span></p>
                </div>

                {/* 비교 테이블 */}
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-1.5 text-gray-500 font-medium">구분</th>
                      <th className="text-center py-1.5 text-blue-300 font-bold">API 라이트</th>
                      <th className="text-center py-1.5 text-purple-300 font-bold">정액제 프로</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-700/50">
                      <td className="py-1.5 text-gray-400">월 요금</td>
                      <td className="text-center text-gray-200">~22,125원</td>
                      <td className="text-center text-gray-200">39,000원</td>
                    </tr>
                    <tr className="border-b border-gray-700/50">
                      <td className="py-1.5 text-gray-400">음성 분량</td>
                      <td className="text-center text-green-300 font-bold">약 3~3.5시간</td>
                      <td className="text-center text-gray-200">2시간</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-gray-400">시간당 단가</td>
                      <td className="text-center text-green-300 font-bold">~6,500~7,000원</td>
                      <td className="text-center text-gray-200">19,500원</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-green-300/80 font-medium">→ API가 시간당 단가 기준 약 3배 저렴</p>

                <div className="bg-gray-900/50 rounded-lg p-3 text-gray-400 leading-relaxed">
                  <p>정액제는 무제한 생성/재생(다운로드만 2시간 제한), 감정 세부 조절 UI, 보이스 클로닝, 4K 영상 등 부가기능 포함.</p>
                  <p className="mt-1">API는 순수 음성 파일만 받는 구조 — <span className="text-cyan-300">숏폼 자동화 파이프라인처럼 음성 파일만 뽑아 쓰는 경우 API가 확실히 가성비 좋음.</span></p>
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Voice Clone 비활성화 — CosyVoice 미사용 */}

        {/* 펼쳐진 음성 브라우저 */}
        {browsedEngine && (
          <div data-voice-browser className="mt-3 bg-gray-800/70 rounded-xl border border-purple-500/30 p-4 space-y-3">
            {/* 엔진 설명 + 언어 필터 */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold text-white">{TTS_ENGINES.find(e => e.id === browsedEngine)?.label}</span>
                  <span className="text-sm text-purple-300 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-500/30">{browseVoices.length}개 음성</span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {TTS_ENGINES.find(e => e.id === browsedEngine)?.description.split('. ').map((sentence, i, arr) => (
                    <span key={i}>{sentence}{i < arr.length - 1 ? '.' : ''}{i < arr.length - 1 && <br />}</span>
                  ))}
                </p>
              </div>
              {/* 언어 선택 — Supertonic만 (ElevenLabs는 70개 언어 자동 감지이므로 불필요) */}
              {(browsedEngine === 'supertonic' || browsedEngine === ('edge' as TTSEngine)) && (
                <div className="flex gap-1.5 shrink-0">
                  {LANGUAGES.map((lang) => (
                    <button key={lang.id} type="button" onClick={() => setBrowseLanguage(lang.id)}
                      className={`px-2.5 py-1 rounded-lg text-sm font-semibold transition-all border ${
                        browseLanguage === lang.id
                          ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                          : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}>
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Typecast: 검색 + 언어 필터 (별도 행) */}
            {browsedEngine === 'typecast' && (
              <div className="space-y-2">
                {/* 검색 바 */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input
                    type="text"
                    value={typecastSearch}
                    onChange={(e) => setTypecastSearch(e.target.value)}
                    placeholder="캐릭터 이름으로 검색... (예: 필재, 아리, Athena)"
                    className="w-full pl-9 pr-8 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  {typecastSearch && (
                    <button type="button" onClick={() => setTypecastSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm">&times;</button>
                  )}
                </div>
                {/* 필터 드롭다운 — 언어 / 성별 / 연령층 / 모델 + 결과 카운트 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 필터 결과 카운트 */}
                  {(() => {
                    let cnt = typecastVoices.length;
                    if (typecastLanguageFilter && (typecastLanguageFilter === 'ko-kr' || typecastLanguageFilter === 'en-us')) {
                      cnt = typecastVoices.filter(v => v.language.some(l => l === typecastLanguageFilter || l.startsWith(typecastLanguageFilter?.split('-')[0] || ''))).length;
                    }
                    if (typecastGenderFilter) cnt = typecastVoices.filter(v => v.gender === typecastGenderFilter && (!(typecastLanguageFilter === 'ko-kr' || typecastLanguageFilter === 'en-us') || v.language.some(l => l === typecastLanguageFilter || l.startsWith(typecastLanguageFilter?.split('-')[0] || '')))).length;
                    return (
                      <span className="text-xs font-bold text-purple-300 bg-purple-900/30 px-2 py-1 rounded-lg border border-purple-500/20">
                        {(typecastLanguageFilter || typecastGenderFilter || typecastAgeFilter || typecastModelFilter) ? `필터 결과: ${cnt}명` : `전체 ${typecastVoices.length}명`}
                      </span>
                    );
                  })()}
                  {/* 언어 */}
                  <select value={typecastLanguageFilter || ''} onChange={(e) => setTypecastLanguageFilter(e.target.value || null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="">언어 (전체)</option>
                    <option value="ko-kr">🇰🇷 한국어</option>
                    <option value="en-us">🇺🇸 영어</option>
                    <option value="ja-jp">🇯🇵 일본어</option>
                    <option value="zh-cn">🇨🇳 중국어</option>
                    <option value="es-es">🇪🇸 스페인어</option>
                    <option value="fr-fr">🇫🇷 프랑스어</option>
                    <option value="de-de">🇩🇪 독일어</option>
                    <option value="it-it">🇮🇹 이탈리아어</option>
                    <option value="pt-pt">🇵🇹 포르투갈어</option>
                    <option value="vi-vn">🇻🇳 베트남어</option>
                    <option value="th-th">🇹🇭 태국어</option>
                    <option value="id-id">🇮🇩 인도네시아어</option>
                    <option value="hi-in">🇮🇳 힌디어</option>
                    <option value="ar-sa">🇸🇦 아랍어</option>
                    <option value="ru-ru">🇷🇺 러시아어</option>
                    <option value="tr-tr">🇹🇷 터키어</option>
                    <option value="pl-pl">🇵🇱 폴란드어</option>
                    <option value="nl-nl">🇳🇱 네덜란드어</option>
                    <option value="sv-se">🇸🇪 스웨덴어</option>
                    <option value="da-dk">🇩🇰 덴마크어</option>
                    <option value="no-no">🇳🇴 노르웨이어</option>
                    <option value="fi-fi">🇫🇮 핀란드어</option>
                    <option value="el-gr">🇬🇷 그리스어</option>
                    <option value="cs-cz">🇨🇿 체코어</option>
                    <option value="hu-hu">🇭🇺 헝가리어</option>
                    <option value="ro-ro">🇷🇴 루마니아어</option>
                    <option value="sk-sk">🇸🇰 슬로바키아어</option>
                    <option value="hr-hr">🇭🇷 크로아티아어</option>
                    <option value="bg-bg">🇧🇬 불가리아어</option>
                    <option value="uk-ua">🇺🇦 우크라이나어</option>
                    <option value="ms-my">🇲🇾 말레이어</option>
                    <option value="tl-ph">🇵🇭 타갈로그어</option>
                    <option value="bn-bd">🇧🇩 벵골어</option>
                    <option value="pa-in">🇮🇳 펀자브어</option>
                    <option value="ta-in">🇮🇳 타밀어</option>
                  </select>
                  {typecastLanguageFilter && typecastLanguageFilter !== 'ko-kr' && typecastLanguageFilter !== 'en-us' && (
                    <span className="text-xs text-yellow-300/70 font-medium">모든 캐릭터가 다국어 TTS를 지원합니다</span>
                  )}

                  {/* 성별 */}
                  <select value={typecastGenderFilter || ''} onChange={(e) => setTypecastGenderFilter(e.target.value || null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="">성별 (전체)</option>
                    <option value="male">남성</option>
                    <option value="female">여성</option>
                  </select>

                  {/* 연령층 */}
                  <select value={typecastAgeFilter || ''} onChange={(e) => setTypecastAgeFilter(e.target.value || null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="">연령층 (전체)</option>
                    <option value="child">어린이</option>
                    <option value="teenager">청소년</option>
                    <option value="young_adult">청년</option>
                    <option value="middle_age">중년</option>
                    <option value="elder">장년</option>
                  </select>

                  {/* 모델 */}
                  <select value={typecastModelFilter || ''} onChange={(e) => setTypecastModelFilter(e.target.value || null)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-purple-500 cursor-pointer">
                    <option value="">모델 (전체)</option>
                    <option value="ssfm-v30">ssfm-v30 (다양한 감정)</option>
                    <option value="ssfm-v21">ssfm-v21 (빠르고 안정)</option>
                  </select>
                </div>

                {/* 카테고리 아이콘 — use_cases 기반 */}
                {/* 카테고리 아이콘 — 타입캐스트 스타일 (좌우 화살표 스크롤) */}
                {(() => {
                  const categories = [
                    { id: 'Announcer', label: '아나운서', icon: '📺' },
                    { id: 'Anime', label: '애니메이션', icon: '🎭' },
                    { id: 'Audiobook/Storytelling', label: '오디오북', icon: '📖' },
                    { id: 'Conversational', label: '대화', icon: '💬' },
                    { id: 'Documentary', label: '다큐멘터리', icon: '🎬' },
                    { id: 'E-learning/Explainer', label: '교육', icon: '🎓' },
                    { id: 'Rapper', label: '래퍼', icon: '🎤' },
                    { id: 'Game', label: '게임', icon: '🎮' },
                    { id: 'TikTok/Reels/Shorts', label: '숏폼', icon: '📱' },
                    { id: 'News Reporter', label: '뉴스', icon: '📰' },
                    { id: 'Radio/Podcast', label: '팟캐스트', icon: '🎙️' },
                    { id: 'Voicemail/Voice Assistant', label: '안내음성', icon: '📞' },
                    { id: 'Ads/Promotion', label: '광고/마케팅', icon: '📢' },
                  ];
                  return (
                    <div className="flex items-stretch justify-between w-full border-b border-gray-700/30 pb-1">
                      <button type="button" onClick={() => setTypecastCategoryFilter(null)}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-bold transition-all border ${
                          !typecastCategoryFilter ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-500 hover:text-gray-300 border-transparent hover:bg-gray-800/50'
                        }`}>
                        <span className="text-lg">📋</span>
                        <span>전체</span>
                      </button>
                      {categories.map(cat => {
                        const count = typecastVoices.filter(v => v.use_cases.includes(cat.id)).length;
                        if (count === 0) return null;
                        return (
                          <button key={cat.id} type="button" onClick={() => setTypecastCategoryFilter(typecastCategoryFilter === cat.id ? null : cat.id)}
                            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-bold transition-all border ${
                              typecastCategoryFilter === cat.id ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-gray-500 hover:text-gray-300 border-transparent hover:bg-gray-800/50'
                            }`}>
                            <span className="text-lg">{cat.icon}</span>
                            <span>{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {sampleError && (
              <p className="text-xs text-red-400 px-1">{sampleError}</p>
            )}

            {/* Typecast 로딩/에러 상태 */}
            {browsedEngine === 'typecast' && isLoadingTypecastVoices && (
              <div className="flex items-center justify-center gap-2 py-6">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-blue-400">Typecast 음성 목록을 불러오는 중...</span>
                {elapsedTypecastLoad > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedTypecastLoad)}</span>}
              </div>
            )}
            {browsedEngine === 'typecast' && typecastVoiceError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-900/20 border border-red-500/20 rounded-lg">
                <span className="text-sm">⚠</span>
                <span className="text-sm text-red-400">{typecastVoiceError}</span>
                <button type="button" onClick={() => { clearTypecastVoiceCache(); setTypecastVoices([]); setTypecastVoiceError(null); }}
                  className="ml-auto text-xs text-gray-500 hover:text-blue-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 transition-colors">
                  다시 시도
                </button>
              </div>
            )}

            {/* ===== Typecast 전용 음성 브라우저 (카드 UI) ===== */}
            {browsedEngine === 'typecast' && !isLoadingTypecastVoices && !typecastVoiceError && (() => {
              // 검색 + 카테고리 필터 + 언어 필터 적용
              let filtered = typecastVoices as TypecastVoice[];
              if (typecastSearch.trim()) {
                const q = typecastSearch.trim().toLowerCase();
                filtered = filtered.filter(v => v.name.toLowerCase().includes(q) || v.voice_id.toLowerCase().includes(q));
              }
              if (typecastCategoryFilter) {
                filtered = filtered.filter(v => v.use_cases.includes(typecastCategoryFilter));
              }
              if (typecastLanguageFilter) {
                // ko-kr, en-us만 native_language로 필터. 그 외 언어는 모든 캐릭터가 지원하므로 필터링 안 함
                if (typecastLanguageFilter === 'ko-kr' || typecastLanguageFilter === 'en-us') {
                  filtered = filtered.filter(v => {
                    const lang = typecastLanguageFilter;
                    return v.language.some(l => l === lang || l.startsWith(lang?.split('-')[0] || ''));
                  });
                }
                // 다른 언어는 모든 캐릭터가 지원하므로 필터링하지 않음
              }
              if (typecastGenderFilter) {
                filtered = filtered.filter(v => v.gender === typecastGenderFilter);
              }
              if (typecastAgeFilter) {
                filtered = filtered.filter(v => v.age === typecastAgeFilter);
              }
              if (typecastModelFilter) {
                filtered = filtered.filter(v => v.models.includes(typecastModelFilter));
              }
              const recentVoices = filtered.filter(v => recentTypecastVoiceIds.includes(v.voice_id))
                .sort((a, b) => recentTypecastVoiceIds.indexOf(a.voice_id) - recentTypecastVoiceIds.indexOf(b.voice_id))
                .slice(0, 5);
              const otherVoices = filtered.filter(v => !recentTypecastVoiceIds.includes(v.voice_id));

              const AVATAR_GRADIENTS = [
                'from-blue-400 to-indigo-500',
                'from-pink-400 to-rose-500',
                'from-emerald-400 to-teal-500',
                'from-amber-400 to-orange-500',
                'from-violet-400 to-purple-500',
                'from-cyan-400 to-blue-500',
                'from-rose-400 to-pink-500',
                'from-lime-400 to-green-500',
              ];

              const renderTypecastCard = (tcVoice: TypecastVoice) => {
                const voiceOpt: VoiceOption = {
                  id: tcVoice.voice_id,
                  name: tcVoice.name,
                  language: 'ko' as TTSLanguage,
                  gender: tcVoice.gender,
                  engine: 'typecast' as TTSEngine,
                  preview: tcVoice.preview_url,
                };
                const isPlaying = playingVoiceId === tcVoice.voice_id;
                const isActiveVoice = activeSpeaker?.voiceId === tcVoice.voice_id && activeSpeaker?.engine === 'typecast';
                const isFavVoice = favoriteVoices.includes(tcVoice.voice_id);
                const koUseCases = getKoreanUseCases(tcVoice.use_cases);
                const langCount = tcVoice.language.length;
                const gradientIdx = Math.abs(tcVoice.name.charCodeAt(0)) % AVATAR_GRADIENTS.length;

                return (
                  <div
                    key={tcVoice.voice_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isActiveVoice
                        ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
                        : isFavVoice
                          ? 'bg-yellow-900/10 border-yellow-500/20 hover:border-yellow-400/40'
                          : 'bg-gray-900/60 border-gray-700/50 hover:border-gray-500 hover:bg-gray-800/70'
                    }`}
                    onClick={() => {
                      if (isActiveVoice) return;
                      // speaker가 없으면 자동 생성
                      let speaker = activeSpeaker;
                      if (!speaker) {
                        const newSpeaker: Speaker = {
                          id: `speaker-${Date.now()}`, name: tcVoice.name, color: SPEAKER_COLORS[0],
                          engine: 'typecast' as TTSEngine, voiceId: tcVoice.voice_id,
                          language: 'ko', speed: 1.0, pitch: 0,
                          stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: true,
                          lineCount: 0, totalDuration: 0,
                        };
                        addSpeaker(newSpeaker);
                        speaker = newSpeaker;
                      }
                      const update: Partial<Speaker> = {
                        engine: 'typecast' as TTSEngine, voiceId: tcVoice.voice_id,
                        name: tcVoice.name,
                        imageUrl: tcVoice.image_url,
                        emotionMode: browseEmotionMode,
                        emotionPreset: browseEmotionPreset as Speaker['emotionPreset'],
                        emotionIntensity: browseEmotionIntensity,
                        typecastModel: browseTypecastModel as Speaker['typecastModel'],
                        typecastVolume: browseTypecastVolume,
                        pitch: browseTypecastPitch,
                      };
                      updateSpeaker(speaker.id, update);
                      // 줄별 변경 또는 전체 적용
                      const storeLines = useSoundStudioStore.getState().lines;
                      if (changingLineIndex !== null && storeLines[changingLineIndex]) {
                        // 특정 줄만 캐릭터 변경
                        updateLine(storeLines[changingLineIndex].id, { speakerId: speaker!.id });
                        setChangingLineIndex(null);
                        const { setToast } = useUIStore.getState();
                        setToast({ show: true, message: `${changingLineIndex + 1}번째 줄: "${tcVoice.name}" 적용됨` });
                        setTimeout(() => setToast(null), 3000);
                      } else {
                        // 전체 라인 적용
                        storeLines.forEach(l => updateLine(l.id, { speakerId: speaker!.id }));
                        const { setToast } = useUIStore.getState();
                        setToast({ show: true, message: `"${tcVoice.name}" 전체 적용됨` });
                        setTimeout(() => setToast(null), 3000);
                      }
                      trackRecentTypecastVoice(tcVoice.voice_id);
                    }}
                  >
                    {/* Avatar + 호버 재생 오버레이 */}
                    <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIdx]} flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-md overflow-hidden group/avatar`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPlaying) {
                          // 재생 중이면 중지
                          stopAllPlayback();
                        } else {
                          handlePlaySample(voiceOpt);
                        }
                      }}>
                      {tcVoice.image_url
                        ? <img src={tcVoice.image_url} alt={tcVoice.name}
                            className="w-full h-full object-cover"
                          />
                        : <span className="text-lg">{tcVoice.name[0]}</span>}
                      {/* 호버 시 재생 오버레이 */}
                      <div className={`absolute inset-0 flex items-center justify-center rounded-xl transition-all ${
                        isPlaying
                          ? 'bg-black/50'
                          : 'bg-black/0 group-hover/avatar:bg-black/50'
                      }`}>
                        <span className={`text-white text-xl transition-all ${
                          isPlaying
                            ? 'opacity-100 animate-pulse'
                            : 'opacity-0 group-hover/avatar:opacity-100'
                        }`}>
                          {isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                        </span>
                      </div>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-white text-base truncate">{tcVoice.name}</p>
                        {tcVoice.gender === 'female'
                          ? <span className="text-xs text-pink-400 bg-pink-500/10 px-1 py-0.5 rounded">&#9792;</span>
                          : <span className="text-xs text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">&#9794;</span>}
                        {isActiveVoice && <span className="text-green-400 text-xs ml-0.5">&#10003;</span>}
                      </div>
                      <p className="text-sm text-gray-500 truncate mt-0.5">
                        {tcVoice.use_cases.slice(0, 2).map((uc, i) => {
                          const UC_KO: Record<string, string> = {
                            'Announcer': '아나운서', 'Anime': '애니메이션', 'Audiobook/Storytelling': '오디오북',
                            'Conversational': '대화', 'Documentary': '다큐멘터리', 'E-learning/Explainer': '교육',
                            'Rapper': '래퍼', 'Game': '게임', 'TikTok/Reels/Shorts': '숏폼',
                            'Ads/Promotion': '광고', 'Radio/Podcast': '팟캐스트', 'News Reporter': '뉴스',
                            'Voicemail/Voice Assistant': '안내음성',
                          };
                          return <span key={uc}>{i > 0 ? ' · ' : '#'}{UC_KO[uc] || uc}</span>;
                        })}
                        {/* 언어 국기 원형 겹침 + 갯수 */}
                        {tcVoice.language.length > 0 && (() => {
                          const LANG_FLAG: Record<string, string> = {
                            'ko-kr': '\uD83C\uDDF0\uD83C\uDDF7', 'en-us': '\uD83C\uDDFA\uD83C\uDDF8', 'ja-jp': '\uD83C\uDDEF\uD83C\uDDF5', 'zh-cn': '\uD83C\uDDE8\uD83C\uDDF3',
                            'es-es': '\uD83C\uDDEA\uD83C\uDDF8', 'fr-fr': '\uD83C\uDDEB\uD83C\uDDF7', 'de-de': '\uD83C\uDDE9\uD83C\uDDEA', 'it-it': '\uD83C\uDDEE\uD83C\uDDF9',
                            'pt-pt': '\uD83C\uDDF5\uD83C\uDDF9', 'vi-vn': '\uD83C\uDDFB\uD83C\uDDF3', 'th-th': '\uD83C\uDDF9\uD83C\uDDED', 'id-id': '\uD83C\uDDEE\uD83C\uDDE9',
                            'hi-in': '\uD83C\uDDEE\uD83C\uDDF3', 'ar-sa': '\uD83C\uDDF8\uD83C\uDDE6', 'ru-ru': '\uD83C\uDDF7\uD83C\uDDFA', 'tr-tr': '\uD83C\uDDF9\uD83C\uDDF7',
                            'pl-pl': '\uD83C\uDDF5\uD83C\uDDF1', 'nl-nl': '\uD83C\uDDF3\uD83C\uDDF1', 'kor': '\uD83C\uDDF0\uD83C\uDDF7', 'eng': '\uD83C\uDDFA\uD83C\uDDF8',
                          };
                          const LANG_NAME: Record<string, string> = {
                            'ko-kr': '한국어', 'en-us': '영어', 'ja-jp': '일본어', 'zh-cn': '중국어',
                            'es-es': '스페인어', 'fr-fr': '프랑스어', 'de-de': '독일어', 'it-it': '이탈리아어',
                            'pt-pt': '포르투갈어', 'vi-vn': '베트남어', 'th-th': '태국어', 'id-id': '인도네시아어',
                            'ar-sa': '아랍어', 'ru-ru': '러시아어', 'tr-tr': '터키어',
                            'kor': '한국어', 'eng': '영어',
                          };
                          const langs = tcVoice.language;
                          const mainLang = langs[0] || '';
                          const mainFlag = LANG_FLAG[mainLang] || '\uD83C\uDF10';
                          const mainName = LANG_NAME[mainLang] || mainLang;
                          return (
                            <span className="ml-1.5 inline-flex items-center cursor-help" title={`지원 언어: ${langs.map(l => LANG_NAME[l] || l).join(', ')}`}>
                              <span className="inline-flex -space-x-1">
                                {langs.slice(0, 3).map((l, li) => (
                                  <span key={li} className="inline-block w-4 h-4 rounded-full bg-gray-700 border border-gray-600 text-[8px] leading-4 text-center"
                                    style={{ zIndex: 3 - li }}>{LANG_FLAG[l] || '\uD83C\uDF10'}</span>
                                ))}
                              </span>
                              <span className="ml-1 text-xs">{mainName}{langs.length > 1 ? `+${langs.length - 1}` : ''}</span>
                            </span>
                          );
                        })()}
                        {/* 모델 정보 */}
                        <span className="ml-1.5 text-xs text-gray-600">
                          모델: {tcVoice.models.join(' · ')}
                        </span>
                      </p>
                    </div>
                    {/* 적용 버튼 */}
                    {!isActiveVoice && (
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-cyan-400 bg-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors font-bold"
                        title="이 음성을 현재 화자에 적용"
                      >
                        적용
                      </button>
                    )}
                    {/* 즐겨찾기 별표 (크게) */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteVoice(tcVoice.voice_id); }}
                      className={`p-2 rounded-lg transition-all text-lg shrink-0 ${isFavVoice ? 'text-yellow-400 hover:text-yellow-300 bg-yellow-500/10' : 'text-gray-600 hover:text-yellow-400 hover:bg-gray-700/50'}`}
                      title={isFavVoice ? '즐겨찾기 해제' : '즐겨찾기'}>
                      {isFavVoice ? '\u2605' : '\u2606'}
                    </button>
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {/* Voice list — 좌:여성 / 우:남성 2열 */}
                  <div className="max-h-[480px] overflow-y-auto pr-1">
                    {/* 즐겨찾기 캐릭터 (최상단) */}
                    {(() => {
                      const favVoices = filtered.filter(v => favoriteVoices.includes(v.voice_id));
                      if (favVoices.length === 0) return null;
                      return (
                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-yellow-500/20">
                            <span className="text-yellow-400 text-sm">★</span>
                            <span className="text-sm font-bold text-yellow-400">즐겨찾기 ({favVoices.length})</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {favVoices.map(renderTypecastCard)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 최근 사용 캐릭터 */}
                    {recentVoices.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-blue-500/20">
                          <span className="text-blue-400 text-sm">&#128337;</span>
                          <span className="text-sm font-bold text-blue-400">최근 사용 ({recentVoices.length})</span>
                          <button type="button" onClick={() => { setRecentTypecastVoiceIds([]); try { localStorage.removeItem('TYPECAST_RECENT_VOICES'); } catch (e) { logger.trackSwallowedError('VoiceStudio:clearRecentVoices', e); } }}
                            className="text-[10px] text-gray-500 hover:text-red-400 ml-auto transition-colors">비우기</button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {recentVoices.map(renderTypecastCard)}
                        </div>
                      </div>
                    )}

                    {/* 여성 / 남성 2열 */}
                    {(() => {
                      const femaleVoices = otherVoices.filter(v => v.gender === 'female');
                      const maleVoices = otherVoices.filter(v => v.gender === 'male');
                      const showFemale = !typecastGenderFilter || typecastGenderFilter === 'female';
                      const showMale = !typecastGenderFilter || typecastGenderFilter === 'male';
                      const singleGender = typecastGenderFilter != null;
                      return (
                        <div className={singleGender ? 'space-y-1.5' : 'grid grid-cols-2 gap-3'}>
                          {/* 여성 */}
                          {showFemale && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-pink-500/20">
                                <span className="text-pink-400 text-sm">&#9792;</span>
                                <span className="text-sm font-bold text-pink-400">여성</span>
                                <span className="text-xs text-gray-600 ml-auto">{femaleVoices.length}명</span>
                              </div>
                              {femaleVoices.map(renderTypecastCard)}
                            </div>
                          )}
                          {/* 남성 */}
                          {showMale && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-blue-500/20">
                                <span className="text-blue-400 text-sm">&#9794;</span>
                                <span className="text-sm font-bold text-blue-400">남성</span>
                                <span className="text-xs text-gray-600 ml-auto">{maleVoices.length}명</span>
                              </div>
                              {maleVoices.map(renderTypecastCard)}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {filtered.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-6">
                        {typecastSearch ? `"${typecastSearch}" 검색 결과가 없습니다.` : '해당 카테고리에 음성이 없습니다.'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ===== ElevenLabs: 검색 + 필터 칩 ===== */}
            {browsedEngine === 'elevenlabs' && (
              <div className="space-y-2">
                {/* 검색 바 */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input
                    type="text"
                    value={elSearchQuery}
                    onChange={(e) => setElSearchQuery(e.target.value)}
                    placeholder="이름 또는 설명으로 검색..."
                    className="w-full pl-9 pr-8 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                  />
                  {elSearchQuery && (
                    <button type="button" onClick={() => setElSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm">&times;</button>
                  )}
                </div>

                {/* 필터 칩 행 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 결과 카운트 */}
                  <span className="text-xs font-bold text-green-300 bg-green-900/30 px-2 py-1 rounded-lg border border-green-500/20">
                    {(elSearchQuery || elActiveFilterCount > 0)
                      ? `${browseVoices.length} / ${ELEVENLABS_VOICES.length}개`
                      : `전체 ${ELEVENLABS_VOICES.length}개`}
                  </span>

                  {/* Accent 필터 */}
                  <div className="relative">
                    <button type="button"
                      onClick={() => setElOpenDropdown(elOpenDropdown === 'accent' ? null : 'accent')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        elFilterAccent
                          ? 'bg-white text-gray-900 border-white'
                          : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
                      }`}>
                      {elFilterAccent ? <span className="mr-0.5" onClick={(e) => { e.stopPropagation(); setElFilterAccent(''); setElOpenDropdown(null); }}>&times;</span> : <span className="text-[10px]">+</span>}
                      악센트{elFilterAccent ? `: ${EL_ACCENT_KO[elFilterAccent] || elFilterAccent}` : ''}
                    </button>
                    {elOpenDropdown === 'accent' && (
                      <div className="absolute z-50 top-full mt-1 left-0 bg-gray-900 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto min-w-[180px]">
                        <button type="button" onClick={() => { setElFilterAccent(''); setElOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${!elFilterAccent ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                          전체 악센트
                        </button>
                        {elFilterOptions.accents.map(([val, cnt]) => (
                          <button key={val} type="button"
                            onClick={() => { setElFilterAccent(val); setElOpenDropdown(null); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${elFilterAccent === val ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                            {ACCENT_FLAGS[val] || '\uD83C\uDF10'} {EL_ACCENT_KO[val] || val} <span className="text-gray-600">({cnt})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Gender 필터 */}
                  <div className="relative">
                    <button type="button"
                      onClick={() => setElOpenDropdown(elOpenDropdown === 'gender' ? null : 'gender')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        elFilterGender
                          ? 'bg-white text-gray-900 border-white'
                          : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
                      }`}>
                      {elFilterGender ? <span className="mr-0.5" onClick={(e) => { e.stopPropagation(); setElFilterGender(''); setElOpenDropdown(null); }}>&times;</span> : <span className="text-[10px]">+</span>}
                      성별{elFilterGender ? `: ${EL_GENDER_KO[elFilterGender] || elFilterGender}` : ''}
                    </button>
                    {elOpenDropdown === 'gender' && (
                      <div className="absolute z-50 top-full mt-1 left-0 bg-gray-900 border border-gray-600 rounded-lg shadow-xl min-w-[140px]">
                        <button type="button" onClick={() => { setElFilterGender(''); setElOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${!elFilterGender ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                          전체 성별
                        </button>
                        {['female', 'male', 'neutral'].map(g => (
                          <button key={g} type="button"
                            onClick={() => { setElFilterGender(g); setElOpenDropdown(null); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${elFilterGender === g ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                            {EL_GENDER_KO[g] || g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Age 필터 */}
                  <div className="relative">
                    <button type="button"
                      onClick={() => setElOpenDropdown(elOpenDropdown === 'age' ? null : 'age')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        elFilterAge
                          ? 'bg-white text-gray-900 border-white'
                          : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
                      }`}>
                      {elFilterAge ? <span className="mr-0.5" onClick={(e) => { e.stopPropagation(); setElFilterAge(''); setElOpenDropdown(null); }}>&times;</span> : <span className="text-[10px]">+</span>}
                      연령{elFilterAge ? `: ${EL_AGE_KO[elFilterAge] || elFilterAge}` : ''}
                    </button>
                    {elOpenDropdown === 'age' && (
                      <div className="absolute z-50 top-full mt-1 left-0 bg-gray-900 border border-gray-600 rounded-lg shadow-xl min-w-[140px]">
                        <button type="button" onClick={() => { setElFilterAge(''); setElOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${!elFilterAge ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                          전체 연령
                        </button>
                        {elFilterOptions.ages.map(([val, cnt]) => (
                          <button key={val} type="button"
                            onClick={() => { setElFilterAge(val); setElOpenDropdown(null); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${elFilterAge === val ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                            {EL_AGE_KO[val] || val} <span className="text-gray-600">({cnt})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* UseCase 필터 */}
                  <div className="relative">
                    <button type="button"
                      onClick={() => setElOpenDropdown(elOpenDropdown === 'useCase' ? null : 'useCase')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        elFilterUseCase
                          ? 'bg-white text-gray-900 border-white'
                          : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
                      }`}>
                      {elFilterUseCase ? <span className="mr-0.5" onClick={(e) => { e.stopPropagation(); setElFilterUseCase(''); setElOpenDropdown(null); }}>&times;</span> : <span className="text-[10px]">+</span>}
                      용도{elFilterUseCase ? `: ${EL_USECASE_KO[elFilterUseCase] || elFilterUseCase}` : ''}
                    </button>
                    {elOpenDropdown === 'useCase' && (
                      <div className="absolute z-50 top-full mt-1 left-0 bg-gray-900 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto min-w-[200px]">
                        <button type="button" onClick={() => { setElFilterUseCase(''); setElOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${!elFilterUseCase ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                          전체 용도
                        </button>
                        {elFilterOptions.useCases.map(([val, cnt]) => (
                          <button key={val} type="button"
                            onClick={() => { setElFilterUseCase(val); setElOpenDropdown(null); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${elFilterUseCase === val ? 'text-green-400 font-bold' : 'text-gray-300'}`}>
                            {EL_USECASE_KO[val] || val} <span className="text-gray-600">({cnt})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 필터 전체 초기화 */}
                  {elActiveFilterCount > 0 && (
                    <button type="button"
                      onClick={() => { setElFilterAccent(''); setElFilterGender(''); setElFilterAge(''); setElFilterUseCase(''); setElSearchQuery(''); setElOpenDropdown(null); }}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                      전체 초기화
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ElevenLabs 한국어 안내 배너 */}
            {browsedEngine === 'elevenlabs' && (
              <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border border-blue-500/30 rounded-xl p-3.5 mx-1 mb-3 flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{'\uD83C\uDDF0\uD83C\uDDF7'}</span>
                <div>
                  <p className="text-sm font-bold text-blue-200 mb-1">한국어 나레이션도 가능해요!</p>
                  <p className="text-xs text-blue-300/80 leading-relaxed">영어 이름의 음성이지만 <strong className="text-blue-200">한국어 텍스트를 입력하면 자동으로 한국어 발음</strong>으로 생성됩니다. 70개 이상의 언어를 자동 감지해요.</p>
                </div>
              </div>
            )}

            {/* ===== 기타 엔진 음성 목록 — 좌 여성 / 우 남성 ===== */}
            {browsedEngine !== 'typecast' && (() => {
              const sortByFav = (arr: VoiceOption[]) => [...arr].sort((a, b) => {
                const aF = favoriteVoices.includes(a.id) ? 0 : 1;
                const bF = favoriteVoices.includes(b.id) ? 0 : 1;
                return aF - bF;
              });
              const femaleVoices = sortByFav(browseVoices.filter(v => v.gender === 'female'));
              const maleVoices = sortByFav(browseVoices.filter(v => v.gender === 'male'));
              const neutralVoices = sortByFav(browseVoices.filter(v => v.gender === 'neutral'));
              const renderVoiceCard = (voice: VoiceOption) => {
                const isPlaying = playingVoiceId === voice.id;
                const flag = voice.accent ? (ACCENT_FLAGS[voice.accent] || '\uD83C\uDF10') : (LANG_FLAGS[voice.language] || '\uD83C\uDF10');
                const isActiveVoice = activeSpeaker?.voiceId === voice.id && activeSpeaker?.engine === browsedEngine;
                const isFavVoice = favoriteVoices.includes(voice.id);
                return (
                  <div
                    key={voice.id}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
                      isActiveVoice
                        ? 'bg-purple-600/20 border-purple-500/50'
                        : isFavVoice
                          ? 'bg-yellow-900/10 border-yellow-500/30 hover:border-yellow-400'
                          : 'bg-gray-900/80 border-gray-700/50 hover:border-gray-500 hover:bg-gray-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteVoice(voice.id); }}
                      className={`text-base shrink-0 transition-colors leading-none ${isFavVoice ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
                      title={isFavVoice ? '즐겨찾기 해제' : '즐겨찾기'}>
                      {isFavVoice ? '\u2605' : '\u2606'}
                    </button>
                    <span className="text-sm shrink-0">{flag}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-base font-semibold truncate block ${isActiveVoice ? 'text-purple-300' : 'text-gray-200'}`}>
                        {voice.engine === 'elevenlabs' ? elNameKo(voice.name) : voice.name}
                        {voice.engine === 'supertonic' && <span className="text-xs text-gray-500 font-normal ml-1">({voice.id})</span>}
                      </span>
                      {voice.description && <span className="text-[10px] text-gray-500 truncate block">{voice.engine === 'elevenlabs' ? (EL_DESC_KO[voice.description] || voice.description) : voice.description}</span>}
                    </div>
                    {isActiveVoice && <span className="text-green-400 text-xs shrink-0">&#10003;</span>}
                    {activeSpeaker && !isActiveVoice && (
                      <button
                        type="button"
                        onClick={() => {
                          const voiceDisplayName = voice.engine === 'elevenlabs' ? elNameKo(voice.name) : voice.name;
                          const storeLines = useSoundStudioStore.getState().lines;
                          // [FIX #867] 전체 라인에 speakerId 할당 (Typecast와 동일하게)
                          if (changingLineIndex !== null && storeLines[changingLineIndex]) {
                            // 특정 줄만 변경 — 전용 speaker 생성하여 engine 일관성 보장
                            const lineSpeaker: Speaker = {
                              id: `speaker-${Date.now()}-line`,
                              name: voiceDisplayName,
                              color: SPEAKER_COLORS[useSoundStudioStore.getState().speakers.length % SPEAKER_COLORS.length],
                              engine: browsedEngine!,
                              voiceId: voice.id,
                              language: browseLanguage,
                              speed: 1.0, pitch: 0,
                              stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: true,
                              lineCount: 0, totalDuration: 0,
                            };
                            addSpeaker(lineSpeaker);
                            updateLine(storeLines[changingLineIndex].id, {
                              speakerId: lineSpeaker.id,
                              voiceId: voice.id,
                              voiceName: voiceDisplayName,
                              audioUrl: undefined,
                              ttsStatus: 'idle',
                              duration: undefined,
                              startTime: undefined,
                              endTime: undefined,
                            });
                            setChangingLineIndex(null);
                            const { setToast } = useUIStore.getState();
                            setToast({ show: true, message: `${changingLineIndex + 1}번째 줄: "${voiceDisplayName}" 적용됨` });
                            setTimeout(() => setToast(null), 3000);
                          } else {
                            // 전체 적용 — speaker 업데이트 + 모든 라인에 speakerId 할당 + 개별 voiceId 초기화
                            const update: Partial<Speaker> = { engine: browsedEngine!, voiceId: voice.id };
                            updateSpeaker(activeSpeaker.id, update);
                            // 같은 speaker 또는 미할당 라인만 업데이트 (다른 캐릭터 보존)
                            storeLines.forEach(l => {
                              if (l.speakerId && l.speakerId !== activeSpeaker.id) return;
                              updateLine(l.id, {
                                speakerId: activeSpeaker.id,
                                voiceId: undefined,
                                voiceName: undefined,
                                voiceImage: undefined,
                                audioUrl: undefined,
                                ttsStatus: 'idle',
                                duration: undefined,
                                startTime: undefined,
                                endTime: undefined,
                              });
                            });
                            const { setToast } = useUIStore.getState();
                            setToast({ show: true, message: `"${voiceDisplayName}" 전체 적용됨` });
                            setTimeout(() => setToast(null), 3000);
                          }
                        }}
                        className="text-xs text-gray-500 hover:text-cyan-400 bg-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded px-1.5 py-0.5 shrink-0 transition-colors"
                        title="이 음성을 현재 화자에 적용"
                      >
                        적용
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => isPlaying ? stopAllPlayback() : handlePlaySample(voice)}
                      className={`w-8 h-8 rounded-full border text-xs flex items-center justify-center transition-all shrink-0 ${
                        isPlaying
                          ? 'bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/40'
                          : 'bg-purple-600/20 border-purple-500/40 text-purple-400 hover:bg-purple-600/40 hover:text-white'
                      }`}
                      title={isPlaying ? '정지' : `${voice.engine === 'elevenlabs' ? elNameKo(voice.name) : voice.name} 미리듣기`}
                    >
                      {isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                    </button>
                  </div>
                );
              };
              if (browseVoices.length === 0) {
                return <p className="text-sm text-gray-500 text-center py-4">선택한 언어에 해당하는 음성이 없습니다.</p>;
              }
              return (
                <div className="max-h-[380px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    {/* 좌: 여성 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-pink-500/20">
                        <span className="text-pink-400 text-sm">&#9792;</span>
                        <span className="text-sm font-bold text-pink-400">여성</span>
                        <span className="text-xs text-gray-600 ml-auto">{femaleVoices.length}명</span>
                      </div>
                      {femaleVoices.map(renderVoiceCard)}
                    </div>
                    {/* 우: 남성 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-blue-500/20">
                        <span className="text-blue-400 text-sm">&#9794;</span>
                        <span className="text-sm font-bold text-blue-400">남성</span>
                        <span className="text-xs text-gray-600 ml-auto">{maleVoices.length}명</span>
                      </div>
                      {maleVoices.map(renderVoiceCard)}
                    </div>
                  </div>
                  {/* 중성 (있을 경우) */}
                  {neutralVoices.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-purple-500/20">
                        <span className="text-purple-400 text-sm">&#9895;</span>
                        <span className="text-sm font-bold text-purple-400">중성</span>
                        <span className="text-xs text-gray-600 ml-auto">{neutralVoices.length}명</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {neutralVoices.map(renderVoiceCard)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-gray-600 px-1">&#9654; 버튼을 눌러 각 음성의 샘플을 들어보세요. 결과는 캐시되어 반복 재생 시 크레딧이 소모되지 않습니다.</p>

            {/* ElevenLabs Dialogue V3 설정 — 에디터 툴바로 통합됨 (중복 제거) */}

            {/* 캐릭터 선택 안내 — Typecast + ElevenLabs 공통 */}
            {(browsedEngine === 'typecast' || browsedEngine === 'elevenlabs') && changingLineIndex !== null && (
              <div className="mt-2 px-3 py-2 bg-orange-900/20 border border-orange-500/40 rounded-lg animate-pulse">
                <span className="text-sm text-orange-300 font-bold">{'\uD83D\uDD04'} {changingLineIndex + 1}{'\uBC88\uC9F8 \uC904\uC758 \uCE90\uB9AD\uD130\uB97C \uC120\uD0DD\uD558\uC138\uC694'} {'\u2014'} {'\uC704 \uBAA9\uB85D\uC5D0\uC11C \uCE90\uB9AD\uD130\uB97C \uD074\uB9AD\uD558\uBA74 \uC801\uC6A9\uB429\uB2C8\uB2E4'}</span>
              </div>
            )}
            {(browsedEngine === 'typecast' || browsedEngine === 'elevenlabs') && changingLineIndex === null && activeSpeaker?.voiceId && (
              <div className="mt-2 px-3 py-2 bg-green-900/20 border border-green-500/30 rounded-lg flex items-center justify-between">
                <span className="text-sm text-green-300 font-bold">{'\u2705'} {activeSpeaker.name} {'\uC801\uC6A9\uB428'}</span>
                <span className="text-xs text-gray-500">{'\uCE90\uB9AD\uD130\uB97C \uD074\uB9AD\uD558\uBA74 \uC804\uCCB4 \uC801\uC6A9\uB429\uB2C8\uB2E4'}</span>
              </div>
            )}
            {(browsedEngine === 'typecast' || browsedEngine === 'elevenlabs') && changingLineIndex === null && !activeSpeaker?.voiceId && (
              <div className="mt-2 px-3 py-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <span className="text-sm text-yellow-300 font-bold">{'\u26A0\uFE0F'} {'\uC704 \uBAA9\uB85D\uC5D0\uC11C \uCE90\uB9AD\uD130\uB97C \uD074\uB9AD\uD558\uC5EC \uC120\uD0DD\uD558\uC138\uC694'}</span>
              </div>
            )}
            {/* 기존 타입캐스트 설정 바 제거 — TypecastEditor의 스마트 이모션 툴바로 통합됨 */}
          </div>
        )}
      </div>}

      <div className="space-y-4">
          {/* 타입캐스트 스타일 에디터 */}
          <div className="bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden" style={{ minHeight: '350px' }}>
            <TypecastEditor
              onGenerateLine={handleGenerateLine}
              isGeneratingLine={isGeneratingLine}
              onOpenVoiceBrowser={handleOpenVoiceBrowserForLine}
              changingLineIndex={changingLineIndex}
            />
          </div>

          {/* 크레딧 정보 */}
          {lines.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-gray-500">
              <span className="text-blue-300 font-bold">{lines.length}개 단락</span>
              <span className="text-yellow-300/70">{ttsEngine === 'supertonic' || ttsEngine === ('edge' as TTSEngine) ? '🆓 무료 음성' : `💰 ${lines.reduce((s, l) => s + l.text.length, 0).toLocaleString()}자 × 2 = ${(lines.reduce((s, l) => s + l.text.length, 0) * 2).toLocaleString()} 크레딧`}</span>
              <span>평균 {avgChars}자 · 예상 {estimatedDuration}</span>
            </div>
          )}

          {/* 이미지/영상으로 전송 버튼 */}
          {lines.length > 0 && (mergedAudioUrl || lines.some((l) => l.audioUrl)) && (
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={transferSoundToImageVideo}
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400
                  text-white rounded-xl text-sm font-bold border border-orange-400/40 shadow-lg
                  transition-all flex items-center justify-center gap-2"
              >
                <span>이미지/영상으로 전송</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <p className="text-center text-xs text-orange-300/60 font-medium mt-1.5">
                {lines.length}개 단락 + 오디오를 이미지/영상 탭으로 전송합니다
              </p>
            </div>
          )}
      </div>

      {/* 전체 생성은 하단 재생 버튼에서 처리됨 (TypecastEditor) */}

    </div>
  );
};

export default VoiceStudio;
