import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { fetchTypecastVoices } from '../../../services/typecastService';
import type { TypecastVoice } from '../../../services/typecastService';
import { SUBTITLE_TEMPLATES, SUBTITLE_CAT_TABS } from '../../../constants/subtitleTemplates';
import type { SubtitleCategoryId } from '../../../constants/subtitleTemplates';
import type { TTSEngine, ShoppingCTAPreset, SubtitleTemplate } from '../../../types';

// --- TTS 엔진 카드 (VoiceStudio와 동일한 상세 정보) ---
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

interface VoiceFontPickerProps {
  showCta?: boolean;
}

const VoiceFontPicker: React.FC<VoiceFontPickerProps> = ({ showCta = true }) => {
  const {
    ttsEngine, setTtsEngine,
    ttsVoiceId, setTtsVoiceId,
    ttsSpeed, setTtsSpeed,
    subtitleTemplate, setSubtitleTemplate,
    ctaPreset, setCtaPreset,
    ctaText, setCtaText,
  } = useShoppingShortStore();

  const [voices, setVoices] = useState<TypecastVoice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [subtitleCat, setSubtitleCat] = useState<SubtitleCategoryId>('all');
  const [subtitleSearch, setSubtitleSearch] = useState('');

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

  // 필터된 자막 템플릿 (기존 140개 SUBTITLE_TEMPLATES 재활용)
  const filteredTemplates = useMemo(() => {
    let list = SUBTITLE_TEMPLATES;
    if (subtitleCat !== 'all') list = list.filter(t => t.category === subtitleCat);
    if (subtitleSearch.trim()) {
      const q = subtitleSearch.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.fontFamily.toLowerCase().includes(q));
    }
    return list;
  }, [subtitleCat, subtitleSearch]);

  const handleEngineSelect = useCallback((engine: TTSEngine) => {
    setTtsEngine(engine);
    setTtsVoiceId('');
  }, [setTtsEngine, setTtsVoiceId]);

  const handleSelectTemplate = useCallback((template: SubtitleTemplate) => {
    setSubtitleTemplate(template);
  }, [setSubtitleTemplate]);

  return (
    <div className="space-y-6">
      {/* ── TTS 엔진 선택 ── */}
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
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{eng.icon}</span>
                <span className="text-[10px] bg-gray-700/60 px-1.5 py-0.5 rounded text-gray-400">{eng.badge}</span>
              </div>
              <div className="text-sm font-bold">{eng.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{eng.desc}</div>
              <div className="text-[10px] text-gray-500 mt-1">{eng.voiceCount}개 음성</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 보이스 선택 (Typecast) ── */}
      {ttsEngine === 'typecast' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">보이스</h4>
          <input
            type="text"
            value={voiceSearch}
            onChange={e => setVoiceSearch(e.target.value)}
            placeholder="보이스 검색..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 mb-2 focus:outline-none focus:border-lime-500/50"
          />
          {isLoadingVoices ? (
            <div className="text-center text-gray-500 text-sm py-4">
              <span className="animate-spin inline-block h-4 w-4 border-2 border-gray-600 border-t-lime-400 rounded-full mr-2" />
              보이스 로딩 중...
            </div>
          ) : (
            <select
              value={ttsVoiceId}
              onChange={e => setTtsVoiceId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200"
            >
              <option value="">보이스 선택 ({filteredVoices.length}개)</option>
              {filteredVoices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} ({v.gender === 'female' ? '여' : '남'})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── ElevenLabs / Supertonic 보이스 ── */}
      {ttsEngine !== 'typecast' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">보이스 ID</h4>
          <input
            type="text"
            value={ttsVoiceId}
            onChange={e => setTtsVoiceId(e.target.value)}
            placeholder={ttsEngine === 'elevenlabs' ? 'ElevenLabs Voice ID' : 'Supertonic Voice ID'}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50"
          />
        </div>
      )}

      {/* ── 속도 슬라이더 ── */}
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

      {/* ── 자막 스타일 (기존 140개 템플릿 재활용) ── */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">자막 스타일</h4>

        {/* 검색 */}
        <input
          type="text"
          value={subtitleSearch}
          onChange={e => setSubtitleSearch(e.target.value)}
          placeholder="템플릿 검색..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-lime-500/50 placeholder-gray-600 mb-2"
        />

        {/* 카테고리 탭 */}
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

        {/* 선택됨 표시 */}
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

        {/* 템플릿 그리드 */}
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
              {/* 미니 프리뷰 */}
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
    </div>
  );
};

export default VoiceFontPicker;
