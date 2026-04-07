import React, { useCallback, useRef } from 'react';
import { useShoppingChannelStore } from '../../../stores/shoppingChannelStore';
import { CHARACTER_PRESETS } from '../../../services/shoppingChannelService';
import { uploadMediaPermanent } from '../../../services/uploadService';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';
import { AspectRatio } from '../../../types';
import type { ShoppingCharacterPreset, ShoppingSceneTemplate } from '../../../types';

const CHARACTER_CARDS: { id: ShoppingCharacterPreset; icon: string; name: string; desc: string }[] = [
  { id: 'friendly-sister', icon: '👩', name: '친근한 언니', desc: '일상 톤으로 솔직한 리뷰' },
  { id: 'expert-reviewer', icon: '🧑‍💼', name: '전문 리뷰어', desc: '스펙 중심 분석적 리뷰' },
  { id: 'aesthetic-vlogger', icon: '🌸', name: '감성 브이로거', desc: '감성적 분위기 리뷰' },
  { id: 'trusted-expert', icon: '👨‍🔬', name: '신뢰 전문가', desc: '권위 있는 전문가 리뷰' },
];

const TEMPLATE_CARDS: { id: ShoppingSceneTemplate; icon: string; name: string; desc: string }[] = [
  { id: 'general-review', icon: '🎬', name: '일반 리뷰', desc: '자연스러운 제품 소개 구성' },
  { id: 'unboxing', icon: '📦', name: '언박싱', desc: '택배 수령 → 개봉 → 사용기' },
  { id: 'comparison', icon: '⚖️', name: '비교 리뷰', desc: '다른 제품과 비교 장점 부각' },
];

const RATIO_OPTIONS = [
  { id: AspectRatio.LANDSCAPE, label: '16:9', desc: '유튜브 최적화' },
  { id: AspectRatio.PORTRAIT, label: '9:16', desc: '숏폼/릴스 최적화' },
];

const ENGINE_OPTIONS: { id: 'veo' | 'grok'; label: string; desc: string; cost: string; badge: string }[] = [
  { id: 'veo', label: 'Veo 3.1', desc: '고품질 1080p', cost: '$0.17/편', badge: '추천' },
  { id: 'grok', label: 'Grok', desc: '빠른 생성', cost: '$0.10~0.20/편', badge: '경제적' },
];

const ConceptSetupStep: React.FC = () => {
  const {
    characterConfig, sceneTemplate, aspectRatio, videoModel,
    setCharacterConfig, setSceneTemplate, setAspectRatio, setVideoModel, goToStep,
  } = useShoppingChannelStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCharacterImage = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    try {
      const url = await uploadMediaPermanent(file);
      setCharacterConfig({ referenceImageUrl: url });
      showToast('캐릭터 참조 이미지가 업로드되었습니다.');
    } catch (err) {
      logger.warn('[ShoppingChannel] 캐릭터 이미지 업로드 실패', { error: err });
      showToast('이미지 업로드에 실패했습니다.');
    }
  }, [setCharacterConfig]);

  return (
    <div className="space-y-6">
      {/* 캐릭터 프리셋 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">🎭</span>
          캐릭터 프리셋
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CHARACTER_CARDS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCharacterConfig({ presetId: c.id })}
              className={`p-4 rounded-xl text-left transition-all ${
                characterConfig.presetId === c.id
                  ? 'bg-cyan-600/20 border-2 border-cyan-500/50 ring-1 ring-cyan-500/20'
                  : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="text-sm font-bold text-white">{c.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{c.desc}</div>
            </button>
          ))}
        </div>

        {/* 캐릭터 참조 이미지 */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-bold text-gray-300 mb-1.5">캐릭터 참조 이미지 (선택)</label>
            <p className="text-xs text-gray-500">실제 캐릭터 외형을 참조하여 이미지 생성에 반영됩니다</p>
          </div>
          <div className="flex items-center gap-3">
            {characterConfig.referenceImageUrl && (
              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-cyan-500/30">
                <img src={characterConfig.referenceImageUrl} alt="캐릭터" className="w-full h-full object-cover" />
                <button
                  onClick={() => setCharacterConfig({ referenceImageUrl: null })}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white text-[8px]"
                >
                  ✕
                </button>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg text-sm hover:bg-gray-600 transition-colors"
            >
              {characterConfig.referenceImageUrl ? '변경' : '업로드'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleCharacterImage(e.target.files)}
            className="hidden"
          />
        </div>

        {/* 커스텀 설명 */}
        <div className="mt-4">
          <label className="block text-sm font-bold text-gray-300 mb-1.5">캐릭터 추가 설명 (선택)</label>
          <input
            type="text"
            value={characterConfig.customDescription}
            onChange={(e) => setCharacterConfig({ customDescription: e.target.value })}
            placeholder="예: 짧은 단발 머리, 밝은 톤의 목소리"
            className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-colors text-sm"
          />
        </div>
      </div>

      {/* 장면 템플릿 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">🎬</span>
          장면 템플릿
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATE_CARDS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSceneTemplate(t.id)}
              className={`p-4 rounded-xl text-left transition-all ${
                sceneTemplate === t.id
                  ? 'bg-cyan-600/20 border-2 border-cyan-500/50 ring-1 ring-cyan-500/20'
                  : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">{t.icon}</div>
              <div className="text-sm font-bold text-white">{t.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 화면비 + 영상 엔진 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 화면비 */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
          <h3 className="text-sm font-bold text-white mb-3">화면 비율</h3>
          <div className="flex gap-2">
            {RATIO_OPTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setAspectRatio(r.id)}
                className={`flex-1 p-3 rounded-lg text-center transition-all ${
                  aspectRatio === r.id
                    ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-gray-900/50 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="text-sm font-bold">{r.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 영상 엔진 */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
          <h3 className="text-sm font-bold text-white mb-3">영상 엔진</h3>
          <div className="flex gap-2">
            {ENGINE_OPTIONS.map((e) => (
              <button
                key={e.id}
                onClick={() => setVideoModel(e.id)}
                className={`flex-1 p-3 rounded-lg text-center transition-all ${
                  videoModel === e.id
                    ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-gray-900/50 text-gray-400 border border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="text-sm font-bold flex items-center justify-center gap-1">
                  {e.label}
                  {e.badge && (
                    <span className="px-1.5 py-0.5 bg-cyan-600/30 text-cyan-300 text-[10px] rounded">{e.badge}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{e.desc}</div>
                <div className="text-xs text-cyan-400/70 mt-0.5">{e.cost}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <div className="flex justify-between">
        <button
          onClick={() => goToStep('product')}
          className="px-6 py-3 bg-gray-700 text-gray-300 border border-gray-600 rounded-xl font-bold hover:bg-gray-600 transition-colors"
        >
          ← 이전
        </button>
        <button
          onClick={() => goToStep('script')}
          className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-900/30"
        >
          다음: 대본 확인 →
        </button>
      </div>
    </div>
  );
};

export default ConceptSetupStep;
