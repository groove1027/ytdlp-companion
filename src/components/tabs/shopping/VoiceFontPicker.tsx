import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { fetchTypecastVoices, generateTypecastTTS, getKoreanUseCases } from '../../../services/typecastService';
import type { TypecastVoice } from '../../../services/typecastService';
import { ELEVENLABS_VOICES } from '../../../services/elevenlabsService';
import type { ElevenLabsVoice } from '../../../services/elevenlabsService';
import { getAvailableVoices } from '../../../services/ttsService';
import type { VoiceOption } from '../../../services/ttsService';
import { generateSpeech as generateSupertonicSpeech } from '../../../services/supertonicService';
import { getCachedPreview, cachePreview } from '../../../services/ttsPreviewCache';
import { logger } from '../../../services/LoggerService';
import { SUBTITLE_TEMPLATES, SUBTITLE_CAT_TABS } from '../../../constants/subtitleTemplates';
import type { SubtitleCategoryId } from '../../../constants/subtitleTemplates';
import type { TTSEngine, ShoppingCTAPreset, SubtitleTemplate } from '../../../types';

// --- TTS 엔진 정보 ---
const TTS_ENGINES: { id: TTSEngine; label: string; voiceCount: number; icon: string; desc: string; badge: string }[] = [
  { id: 'typecast', label: 'Typecast', voiceCount: 542, icon: '🎭', desc: 'AI 음성. 다양한 감정 + Smart Emotion', badge: 'API 키' },
  { id: 'elevenlabs', label: 'ElevenLabs', voiceCount: 30, icon: '🔊', desc: '70개 언어 자동 감지, Stability 조절', badge: 'Kie 키' },
  { id: 'supertonic', label: 'Supertonic 2', voiceCount: 10, icon: '🧠', desc: '로컬 ONNX 모델, API 키 불필요', badge: '로컬 무료' },
];

// --- CTA 프리셋 ---
const CTA_PRESETS: { id: ShoppingCTAPreset; label: string; desc: string }[] = [
  { id: 'comment', label: '고정댓글', desc: '댓글로 구매 링크 안내' },
  { id: 'profile', label: '프로필 링크', desc: '프로필에서 확인 유도' },
  { id: 'link', label: '하단 링크', desc: '하단 링크 클릭 유도' },
];

// 자막 카테고리 (favorite 제외)
const CATEGORIES = SUBTITLE_CAT_TABS.filter(c => c.id !== 'favorite');

// 성별 필터 탭
const GENDER_TABS = [
  { id: 'all', label: '전체' },
  { id: 'female', label: '여성' },
  { id: 'male', label: '남성' },
] as const;

// 미리듣기 샘플 텍스트
const PREVIEW_TEXT = '안녕하세요, 이 음성으로 나레이션을 녹음합니다.';

type GenderFilter = 'all' | 'female' | 'male';

interface VoiceFontPickerProps {
  showCta?: boolean;
}

// ═══════════════════════════════════════════════════
// TTS 보이스 선택 모달
// ═══════════════════════════════════════════════════
interface TTSVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (engine: TTSEngine, voiceId: string, voiceName: string, speed: number) => void;
  initialEngine: TTSEngine;
  initialVoiceId: string;
  initialSpeed: number;
}

const TTSVoiceModal: React.FC<TTSVoiceModalProps> = ({
  isOpen, onClose, onApply,
  initialEngine, initialVoiceId, initialSpeed,
}) => {
  // 로컬 상태 (적용 전까지 store에 반영 안 함)
  const [engine, setEngine] = useState<TTSEngine>(initialEngine);
  const [voiceId, setVoiceId] = useState(initialVoiceId);
  const [voiceName, setVoiceName] = useState('');
  const [speed, setSpeed] = useState(initialSpeed);
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');

  // Typecast 보이스 로딩
  const [typecastVoices, setTypecastVoices] = useState<TypecastVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // 미리듣기 상태
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playIdRef = useRef(0);

  // 초기화 (모달 열릴 때)
  useEffect(() => {
    if (isOpen) {
      setEngine(initialEngine);
      setVoiceId(initialVoiceId);
      setSpeed(initialSpeed);
      setSearch('');
      setGender('all');
      stopPreview();
    }
  }, [isOpen, initialEngine, initialVoiceId, initialSpeed]);

  // Typecast 보이스 로드
  useEffect(() => {
    if (engine === 'typecast' && typecastVoices.length === 0) {
      setIsLoadingVoices(true);
      fetchTypecastVoices()
        .then(v => setTypecastVoices(v))
        .catch(() => setTypecastVoices([]))
        .finally(() => setIsLoadingVoices(false));
    }
  }, [engine, typecastVoices.length]);

  // 엔진 변경 시 voiceId 리셋
  const handleEngineChange = useCallback((newEngine: TTSEngine) => {
    stopPreview();
    setEngine(newEngine);
    setVoiceId('');
    setVoiceName('');
    setSearch('');
    setGender('all');
  }, []);

  // ── 필터된 보이스 목록 ──
  const filteredVoices = useMemo(() => {
    const q = search.toLowerCase();

    if (engine === 'typecast') {
      return typecastVoices.filter(v => {
        if (gender !== 'all' && v.gender !== gender) return false;
        if (q && !v.name.toLowerCase().includes(q) && !v.gender.includes(q)) return false;
        return true;
      });
    }

    if (engine === 'elevenlabs') {
      return ELEVENLABS_VOICES.filter(v => {
        if (gender !== 'all' && v.gender !== gender) return false;
        if (q && !v.name.toLowerCase().includes(q) && !v.description.toLowerCase().includes(q)) return false;
        return true;
      });
    }

    if (engine === 'supertonic') {
      const voices = getAvailableVoices('supertonic');
      return voices.filter(v => {
        if (gender !== 'all' && v.gender !== gender) return false;
        if (q && !v.name.toLowerCase().includes(q) && !(v.description || '').toLowerCase().includes(q)) return false;
        return true;
      });
    }

    return [];
  }, [engine, search, gender, typecastVoices]);

  // ── 미리듣기 ──
  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlayingId(null);
    setIsGeneratingPreview(false);
  }, []);

  const playAudioUrl = useCallback((url: string, id: string) => {
    stopPreview();
    const audio = new Audio(url);
    audio.playbackRate = speed;
    audioRef.current = audio;
    setPlayingId(id);
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingId(null); audioRef.current = null; };
    audio.play().catch(() => { setPlayingId(null); audioRef.current = null; });
  }, [speed, stopPreview]);

  const handlePreview = useCallback(async (id: string, previewUrl?: string) => {
    // 같은 보이스면 토글 (정지)
    if (playingId === id) { stopPreview(); return; }

    const currentPlayId = ++playIdRef.current;

    // 1. previewUrl이 있으면 바로 재생
    if (previewUrl) {
      playAudioUrl(previewUrl, id);
      return;
    }

    // 2. 캐시 체크
    const cacheKey = `shopping-${engine}-${id}`;
    const cached = await getCachedPreview(cacheKey);
    if (currentPlayId !== playIdRef.current) return;
    if (cached) { playAudioUrl(cached, id); return; }

    // 3. API로 생성
    setIsGeneratingPreview(true);
    setPlayingId(id);
    try {
      let audioUrl: string;

      if (engine === 'typecast') {
        const result = await generateTypecastTTS(PREVIEW_TEXT, {
          voiceId: id, speed, model: 'ssfm-v30', language: 'kor',
          emotionMode: 'smart', audioFormat: 'mp3',
        });
        audioUrl = result.audioUrl;
      } else if (engine === 'supertonic') {
        const result = await generateSupertonicSpeech(PREVIEW_TEXT, 'ko', id, speed);
        audioUrl = result.audioUrl;
      } else {
        return; // ElevenLabs는 항상 previewUrl이 있음
      }

      if (currentPlayId !== playIdRef.current) return;

      // 캐시 저장 (fire-and-forget)
      cachePreview(cacheKey, audioUrl).catch((e) => { logger.trackSwallowedError('VoiceFontPicker:cachePreview', e); });
      playAudioUrl(audioUrl, id);
    } catch {
      // 에러 시 무시
    } finally {
      if (currentPlayId === playIdRef.current) setIsGeneratingPreview(false);
    }
  }, [engine, playingId, speed, stopPreview, playAudioUrl]);

  // 모달 닫힐 때 오디오 정리
  useEffect(() => {
    return () => { stopPreview(); };
  }, [stopPreview]);

  // ESC 키
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 적용
  const handleApply = useCallback(() => {
    stopPreview();
    onApply(engine, voiceId, voiceName, speed);
  }, [engine, voiceId, voiceName, speed, onApply, stopPreview]);

  if (!isOpen) return null;

  // ── 보이스 카드 렌더링 ──
  const renderTypecastCard = (v: TypecastVoice) => {
    const isSelected = voiceId === v.voice_id;
    const isPlaying = playingId === v.voice_id;
    return (
      <button
        key={v.voice_id}
        onClick={() => { setVoiceId(v.voice_id); setVoiceName(v.name); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
          isSelected
            ? 'bg-lime-600/20 border-lime-500/40 ring-1 ring-lime-500/20'
            : 'bg-gray-800/60 border-gray-700/40 hover:border-gray-500/60 hover:bg-gray-800/80'
        }`}
      >
        {/* 아바타 */}
        {v.image_url ? (
          <img src={v.image_url} alt={v.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-gray-600" loading="lazy" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-lg">
            {v.gender === 'female' ? '👩' : '👨'}
          </div>
        )}

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isSelected ? 'text-lime-300' : 'text-gray-200'}`}>{v.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
              {v.gender === 'female' ? '여' : '남'}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {getKoreanUseCases(v.use_cases).slice(0, 3).join(' · ')}
          </p>
        </div>

        {/* 미리듣기 */}
        <button
          onClick={e => { e.stopPropagation(); handlePreview(v.voice_id, v.preview_url); }}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            isPlaying
              ? 'bg-lime-500/20 text-lime-400'
              : 'bg-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-600/60'
          }`}
          title="미리듣기"
        >
          {isPlaying && isGeneratingPreview ? (
            <span className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-lime-400 rounded-full" />
          ) : isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        {/* 선택 표시 */}
        {isSelected && <span className="text-lime-400 text-sm flex-shrink-0">✓</span>}
      </button>
    );
  };

  const renderElevenLabsCard = (v: ElevenLabsVoice) => {
    const isSelected = voiceId === v.id;
    const isPlaying = playingId === v.id;
    const accentFlag = v.accent.includes('british') ? '🇬🇧' : v.accent.includes('american') ? '🇺🇸' : v.accent.includes('australian') ? '🇦🇺' : v.accent.includes('indian') ? '🇮🇳' : v.accent.includes('latin') ? '🌎' : '🌐';
    return (
      <button
        key={v.id}
        onClick={() => { setVoiceId(v.id); setVoiceName(v.name); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
          isSelected
            ? 'bg-lime-600/20 border-lime-500/40 ring-1 ring-lime-500/20'
            : 'bg-gray-800/60 border-gray-700/40 hover:border-gray-500/60 hover:bg-gray-800/80'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-lg">
          {v.gender === 'female' ? '👩' : v.gender === 'male' ? '👨' : '🧑'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isSelected ? 'text-lime-300' : 'text-gray-200'}`}>{v.name}</span>
            <span className="text-xs">{accentFlag}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
              {v.gender === 'female' ? '여' : v.gender === 'male' ? '남' : '중성'}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{v.description}</p>
        </div>

        <button
          onClick={e => { e.stopPropagation(); handlePreview(v.id, v.previewUrl); }}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            isPlaying
              ? 'bg-lime-500/20 text-lime-400'
              : 'bg-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-600/60'
          }`}
          title="미리듣기"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        {isSelected && <span className="text-lime-400 text-sm flex-shrink-0">✓</span>}
      </button>
    );
  };

  const renderSupertonicCard = (v: VoiceOption) => {
    const isSelected = voiceId === v.id;
    const isPlaying = playingId === v.id;
    return (
      <button
        key={v.id}
        onClick={() => { setVoiceId(v.id); setVoiceName(v.name); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
          isSelected
            ? 'bg-lime-600/20 border-lime-500/40 ring-1 ring-lime-500/20'
            : 'bg-gray-800/60 border-gray-700/40 hover:border-gray-500/60 hover:bg-gray-800/80'
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white">
          {v.id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isSelected ? 'text-lime-300' : 'text-gray-200'}`}>{v.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
              {v.gender === 'female' ? '여' : '남'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600/20 text-violet-300 border border-violet-500/30">로컬</span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{v.description}</p>
        </div>

        <button
          onClick={e => { e.stopPropagation(); handlePreview(v.id); }}
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            isPlaying
              ? 'bg-lime-500/20 text-lime-400'
              : 'bg-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-600/60'
          }`}
          title="미리듣기"
        >
          {isPlaying && isGeneratingPreview ? (
            <span className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-lime-400 rounded-full" />
          ) : isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        {isSelected && <span className="text-lime-400 text-sm flex-shrink-0">✓</span>}
      </button>
    );
  };

  const engineInfo = TTS_ENGINES.find(e => e.id === engine)!;

  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center text-xl">
              🎙️
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">보이스 선택</h2>
              <p className="text-xs text-gray-500">미리듣기 후 원하는 음성을 선택하세요</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── 엔진 탭 ── */}
        <div className="flex gap-2 px-6 pt-4 pb-2">
          {TTS_ENGINES.map(eng => (
            <button
              key={eng.id}
              onClick={() => handleEngineChange(eng.id)}
              className={`flex-1 px-3 py-2.5 rounded-xl text-center transition-all border ${
                engine === eng.id
                  ? 'bg-lime-600/20 border-lime-500/40 text-lime-300'
                  : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              <span className="text-lg block">{eng.icon}</span>
              <span className="text-xs font-bold block mt-0.5">{eng.label}</span>
              <span className="text-[10px] opacity-60 block">{eng.voiceCount}개</span>
            </button>
          ))}
        </div>

        {/* ── 검색 + 필터 ── */}
        <div className="px-6 py-2 flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`${engineInfo.label} 보이스 검색...`}
              className="w-full px-3 py-2 pl-8 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50 placeholder-gray-600"
              autoFocus
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {GENDER_TABS.map(g => (
              <button
                key={g.id}
                onClick={() => setGender(g.id)}
                className={`px-3 py-2 text-xs font-bold transition-colors ${
                  gender === g.id
                    ? 'bg-lime-600/20 text-lime-300'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 보이스 리스트 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1.5 scrollbar-thin" style={{ minHeight: 0 }}>
          {isLoadingVoices && engine === 'typecast' ? (
            <div className="flex items-center justify-center py-12">
              <span className="animate-spin h-6 w-6 border-2 border-gray-600 border-t-lime-400 rounded-full mr-3" />
              <span className="text-gray-400 text-sm">보이스 로딩 중...</span>
            </div>
          ) : filteredVoices.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">🔇</div>
              <p className="text-gray-500 text-sm">검색 결과가 없습니다</p>
            </div>
          ) : (
            <>
              {engine === 'typecast' && (filteredVoices as TypecastVoice[]).map(v => renderTypecastCard(v))}
              {engine === 'elevenlabs' && (filteredVoices as ElevenLabsVoice[]).map(v => renderElevenLabsCard(v))}
              {engine === 'supertonic' && (filteredVoices as VoiceOption[]).map(v => renderSupertonicCard(v))}
            </>
          )}
        </div>

        {/* ── 하단: 속도 + 적용 ── */}
        <div className="px-6 py-4 border-t border-gray-700/60 bg-gray-900/80">
          {/* 속도 슬라이더 */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs text-gray-400 font-bold w-20 flex-shrink-0">속도 {speed.toFixed(1)}x</span>
            <input
              type="range"
              min={0.5} max={2.0} step={0.1}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-lime-500 h-1.5"
            />
            <div className="flex gap-1">
              {[0.8, 1.0, 1.2, 1.5].map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                    speed === s
                      ? 'bg-lime-600/20 text-lime-300 border border-lime-500/40'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* 선택된 보이스 요약 + 버튼 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {voiceId ? (
                <div className="flex items-center gap-2">
                  <span className="text-lime-400 text-sm">✓</span>
                  <span className="text-sm font-bold text-gray-200 truncate">
                    {voiceName || voiceId}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
                    {engineInfo.label}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-500">보이스를 선택해주세요</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 border border-gray-600/40 transition-all"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={!voiceId}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                voiceId
                  ? 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500 text-white shadow-lg shadow-lime-900/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════
// 메인 컴포넌트: VoiceFontPicker
// ═══════════════════════════════════════════════════
const VoiceFontPicker: React.FC<VoiceFontPickerProps> = ({ showCta = true }) => {
  const {
    ttsEngine, setTtsEngine,
    ttsVoiceId, setTtsVoiceId,
    ttsSpeed, setTtsSpeed,
    subtitleTemplate, setSubtitleTemplate,
    ctaPreset, setCtaPreset,
    ctaText, setCtaText,
  } = useShoppingShortStore();

  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [displayVoiceName, setDisplayVoiceName] = useState('');
  const [subtitleCat, setSubtitleCat] = useState<SubtitleCategoryId>('all');
  const [subtitleSearch, setSubtitleSearch] = useState('');

  // 보이스 이름 초기 로드 (이미 선택된 경우)
  useEffect(() => {
    if (!ttsVoiceId) { setDisplayVoiceName(''); return; }
    if (ttsEngine === 'elevenlabs') {
      const voice = ELEVENLABS_VOICES.find(v => v.id === ttsVoiceId);
      if (voice) setDisplayVoiceName(voice.name);
    } else if (ttsEngine === 'supertonic') {
      const voices = getAvailableVoices('supertonic');
      const voice = voices.find(v => v.id === ttsVoiceId);
      if (voice) setDisplayVoiceName(voice.name);
    } else if (ttsEngine === 'typecast' && !displayVoiceName) {
      fetchTypecastVoices().then(voices => {
        const voice = voices.find(v => v.voice_id === ttsVoiceId);
        if (voice) setDisplayVoiceName(voice.name);
      }).catch((e) => { logger.trackSwallowedError('VoiceFontPicker:fetchVoiceName', e); });
    }
  }, [ttsEngine, ttsVoiceId]);

  // 모달 적용 핸들러
  const handleVoiceApply = useCallback((engine: TTSEngine, vid: string, name: string, spd: number) => {
    setTtsEngine(engine);
    setTtsVoiceId(vid);
    setTtsSpeed(spd);
    setDisplayVoiceName(name);
    setShowVoiceModal(false);
  }, [setTtsEngine, setTtsVoiceId, setTtsSpeed]);

  // 필터된 자막 템플릿
  const filteredTemplates = useMemo(() => {
    let list = SUBTITLE_TEMPLATES;
    if (subtitleCat !== 'all') list = list.filter(t => t.category === subtitleCat);
    if (subtitleSearch.trim()) {
      const q = subtitleSearch.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.fontFamily.toLowerCase().includes(q));
    }
    return list;
  }, [subtitleCat, subtitleSearch]);

  const handleSelectTemplate = useCallback((template: SubtitleTemplate) => {
    setSubtitleTemplate(template);
  }, [setSubtitleTemplate]);

  const engineInfo = TTS_ENGINES.find(e => e.id === ttsEngine);

  return (
    <div className="space-y-6">
      {/* ── 보이스 설정 (요약 카드 + 모달 열기) ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-3">TTS 보이스</h4>
        <button
          onClick={() => setShowVoiceModal(true)}
          className="w-full p-4 rounded-xl border border-gray-700/40 bg-gray-800/40 hover:border-lime-500/40 hover:bg-gray-800/60 transition-all text-left group"
        >
          {ttsVoiceId ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lime-500/20 to-green-600/20 border border-lime-500/30 flex items-center justify-center text-2xl flex-shrink-0">
                {engineInfo?.icon || '🎙️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-lime-300">{displayVoiceName || ttsVoiceId}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">{engineInfo?.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">속도 {ttsSpeed.toFixed(1)}x</p>
              </div>
              <div className="flex-shrink-0 text-gray-500 group-hover:text-lime-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-700/40 border border-dashed border-gray-600 flex items-center justify-center text-2xl flex-shrink-0">
                🎙️
              </div>
              <div className="flex-1">
                <span className="text-sm font-bold text-gray-400">보이스 선택하기</span>
                <p className="text-xs text-gray-600 mt-0.5">미리듣기로 음성을 비교하고 선택하세요</p>
              </div>
              <div className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-lime-600/20 text-lime-300 text-xs font-bold border border-lime-500/30 group-hover:bg-lime-600/30 transition-colors">
                선택
              </div>
            </div>
          )}
        </button>
      </div>

      {/* ── 자막 스타일 (기존 140개 템플릿 재활용) ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">자막 스타일</h4>

        <input
          type="text"
          value={subtitleSearch}
          onChange={e => setSubtitleSearch(e.target.value)}
          placeholder="템플릿 검색..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-lime-500/50 placeholder-gray-600 mb-2"
        />

        <div className="flex flex-wrap gap-1 mb-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSubtitleCat(cat.id)}
              className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                subtitleCat === cat.id
                  ? 'bg-lime-600/20 text-lime-300 border-lime-500/50'
                  : 'bg-gray-900/50 text-gray-500 border-gray-700 hover:text-gray-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {subtitleTemplate && (
          <div className="flex items-center gap-2 bg-lime-900/20 border border-lime-500/30 rounded-lg px-3 py-1.5 mb-2">
            <div
              className="w-12 h-6 rounded flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: subtitleTemplate.backgroundColor || '#111' }}
            >
              <span style={{
                fontFamily: subtitleTemplate.fontFamily,
                fontSize: '9px',
                fontWeight: subtitleTemplate.fontWeight,
                color: subtitleTemplate.color,
                textShadow: subtitleTemplate.textShadowCSS || undefined,
              }}>자막</span>
            </div>
            <span className="text-sm text-lime-300 font-bold truncate">{subtitleTemplate.name}</span>
            <button
              onClick={() => setSubtitleTemplate(null)}
              className="ml-auto text-sm text-gray-500 hover:text-red-400"
            >해제</button>
          </div>
        )}

        <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
          {filteredTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => handleSelectTemplate(t)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
                subtitleTemplate?.id === t.id
                  ? 'bg-lime-600/15 border-lime-500/40'
                  : 'bg-gray-900/30 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div
                className="w-16 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: t.backgroundColor || '#111' }}
              >
                <span style={{
                  fontFamily: t.fontFamily,
                  fontSize: '11px',
                  fontWeight: t.fontWeight,
                  color: t.color,
                  textShadow: t.textShadowCSS || undefined,
                  WebkitTextStroke: t.outlineWidth > 0 ? `${Math.min(t.outlineWidth, 1)}px ${t.outlineColor}` : undefined,
                }}>자막</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{t.name}</p>
                <p className="text-xs text-gray-500 truncate">{t.fontFamily}</p>
              </div>
              {subtitleTemplate?.id === t.id && (
                <span className="text-lime-400 text-sm flex-shrink-0">✓</span>
              )}
            </button>
          ))}
          {filteredTemplates.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-4">검색 결과 없음</p>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1">총 {SUBTITLE_TEMPLATES.length}개 템플릿 | 현재 {filteredTemplates.length}개 표시</p>
      </div>

      {/* ── CTA 프리셋 ── */}
      {showCta && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-3">CTA 프리셋</h4>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {CTA_PRESETS.map(cta => (
              <button
                key={cta.id}
                onClick={() => setCtaPreset(cta.id)}
                className={`p-3 rounded-xl text-left transition-all ${
                  ctaPreset === cta.id
                    ? 'bg-lime-600/20 border border-lime-500/40 text-lime-300'
                    : 'bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="text-sm font-bold">{cta.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{cta.desc}</div>
              </button>
            ))}
          </div>
          <input
            type="text"
            value={ctaText}
            onChange={e => setCtaText(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50"
            placeholder="CTA 문구 직접 입력"
          />
        </div>
      )}

      {/* ── 보이스 선택 모달 ── */}
      <TTSVoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onApply={handleVoiceApply}
        initialEngine={ttsEngine}
        initialVoiceId={ttsVoiceId}
        initialSpeed={ttsSpeed}
      />
    </div>
  );
};

export default VoiceFontPicker;
