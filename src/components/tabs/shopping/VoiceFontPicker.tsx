import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { fetchTypecastVoices } from '../../../services/typecastService';
import type { TypecastVoice } from '../../../services/typecastService';
import type { TTSEngine, ShoppingCTAPreset } from '../../../types';
import { FONT_LIBRARY, type FontEntry, type FontCategory } from '../../../constants/fontLibrary';

// --- TTS 엔진 카드 ---
const TTS_ENGINES: { id: TTSEngine; label: string; desc: string; icon: string }[] = [
  { id: 'typecast', label: 'Typecast', desc: '한국어 특화 감정 AI', icon: '🎭' },
  { id: 'elevenlabs', label: 'ElevenLabs', desc: '자연스러운 다국어 음성', icon: '🌍' },
  { id: 'supertonic', label: 'Supertonic', desc: '빠른 한국어 TTS', icon: '⚡' },
];

// --- CTA 프리셋 ---
const CTA_PRESETS: { id: ShoppingCTAPreset; label: string; desc: string }[] = [
  { id: 'comment', label: '고정댓글', desc: '댓글로 구매 링크 안내' },
  { id: 'profile', label: '프로필 링크', desc: '프로필에서 확인 유도' },
  { id: 'link', label: '하단 링크', desc: '하단 링크 클릭 유도' },
];

// --- 폰트 카테고리 ---
const FONT_CATEGORIES: { id: FontCategory | 'all'; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'gothic', label: '고딕' },
  { id: 'serif', label: '명조' },
  { id: 'display', label: '디스플레이' },
  { id: 'handwriting', label: '손글씨' },
];

interface VoiceFontPickerProps {
  showCta?: boolean;
}

const VoiceFontPicker: React.FC<VoiceFontPickerProps> = ({ showCta = true }) => {
  const {
    ttsEngine, setTtsEngine,
    ttsVoiceId, setTtsVoiceId,
    ttsSpeed, setTtsSpeed,
    fontFamily, setFontFamily,
    fontSize, setFontSize,
    ctaPreset, setCtaPreset,
    ctaText, setCtaText,
  } = useShoppingShortStore();

  const [voices, setVoices] = useState<TypecastVoice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [fontCategoryFilter, setFontCategoryFilter] = useState<FontCategory | 'all'>('all');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Typecast 보이스 로드
  useEffect(() => {
    if (ttsEngine === 'typecast') {
      setIsLoadingVoices(true);
      fetchTypecastVoices()
        .then((v) => {
          setVoices(v);
          if (!ttsVoiceId && v.length > 0) setTtsVoiceId(v[0].voice_id);
        })
        .catch(() => setVoices([]))
        .finally(() => setIsLoadingVoices(false));
    }
  }, [ttsEngine, ttsVoiceId, setTtsVoiceId]);

  // 필터된 보이스
  const filteredVoices = useMemo(() => {
    if (ttsEngine !== 'typecast') return [];
    const q = voiceSearch.toLowerCase();
    return voices.filter(v =>
      !q || v.name.toLowerCase().includes(q) || v.gender.includes(q)
    );
  }, [voices, voiceSearch, ttsEngine]);

  // 필터된 폰트
  const filteredFonts = useMemo(() => {
    if (fontCategoryFilter === 'all') return FONT_LIBRARY.slice(0, 30);
    return FONT_LIBRARY.filter(f => f.category === fontCategoryFilter).slice(0, 30);
  }, [fontCategoryFilter]);

  const handleEngineSelect = useCallback((engine: TTSEngine) => {
    setTtsEngine(engine);
    setTtsVoiceId('');
  }, [setTtsEngine, setTtsVoiceId]);

  return (
    <div className="space-y-6">
      {/* TTS 엔진 선택 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-3">TTS 엔진</h4>
        <div className="grid grid-cols-3 gap-3">
          {TTS_ENGINES.map(eng => (
            <button
              key={eng.id}
              onClick={() => handleEngineSelect(eng.id)}
              className={`p-3 rounded-xl text-left transition-all ${
                ttsEngine === eng.id
                  ? 'bg-lime-600/20 border border-lime-500/40 text-lime-300'
                  : 'bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="text-lg mb-1">{eng.icon}</div>
              <div className="text-sm font-bold">{eng.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{eng.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 보이스 선택 (Typecast) */}
      {ttsEngine === 'typecast' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">보이스</h4>
          <input
            type="text"
            value={voiceSearch}
            onChange={e => setVoiceSearch(e.target.value)}
            placeholder="보이스 검색..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 mb-2"
          />
          {isLoadingVoices ? (
            <div className="text-center text-gray-500 text-sm py-4">보이스 로딩 중...</div>
          ) : (
            <select
              value={ttsVoiceId}
              onChange={e => setTtsVoiceId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
            >
              <option value="">보이스 선택</option>
              {filteredVoices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} ({v.gender === 'female' ? '여' : '남'})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ElevenLabs / Supertonic 보이스 입력 */}
      {ttsEngine !== 'typecast' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">보이스 ID</h4>
          <input
            type="text"
            value={ttsVoiceId}
            onChange={e => setTtsVoiceId(e.target.value)}
            placeholder={ttsEngine === 'elevenlabs' ? 'ElevenLabs Voice ID' : 'Supertonic Voice ID'}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
          />
        </div>
      )}

      {/* 속도 슬라이더 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">속도: {ttsSpeed.toFixed(1)}x</h4>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={ttsSpeed}
          onChange={e => setTtsSpeed(parseFloat(e.target.value))}
          className="w-full accent-lime-500"
        />
      </div>

      {/* 폰트 선택 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">자막 폰트</h4>
        <div className="flex gap-2 mb-3 flex-wrap">
          {FONT_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFontCategoryFilter(cat.id)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                fontCategoryFilter === cat.id
                  ? 'bg-lime-600/30 text-lime-300 border border-lime-500/40'
                  : 'bg-gray-800/60 text-gray-400 border border-gray-700/40 hover:border-gray-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {filteredFonts.map((font: FontEntry) => (
            <button
              key={font.id}
              onClick={() => setFontFamily(font.fontFamily)}
              className={`px-3 py-2 rounded-lg text-left text-sm transition-all ${
                fontFamily === font.fontFamily
                  ? 'bg-lime-600/20 border border-lime-500/40 text-lime-300'
                  : 'bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600'
              }`}
            >
              {font.name}
            </button>
          ))}
        </div>
      </div>

      {/* 폰트 크기 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">폰트 크기: {fontSize}px</h4>
        <input
          type="range"
          min={24}
          max={72}
          step={2}
          value={fontSize}
          onChange={e => setFontSize(parseInt(e.target.value))}
          className="w-full accent-lime-500"
        />
      </div>

      {/* CTA 프리셋 */}
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
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200"
            placeholder="CTA 문구 직접 입력"
          />
        </div>
      )}
    </div>
  );
};

export default VoiceFontPicker;
