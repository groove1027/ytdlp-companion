import React, { useState, useMemo } from 'react';
import type { SceneOverlayConfig, OverlayPreset, OverlayBlendMode, OverlayCategory } from '../../../types';

// --- 프리셋 데이터 (40종) ---
const OVERLAY_PRESETS: OverlayPreset[] = [
  // 텍스처 (10)
  { id: 'film-frame', label: '필름 프레임', labelEn: 'Film Frame', category: 'texture', icon: '🎞', defaultBlendMode: 'normal', description: '클래식 필름 테두리 + 비네팅' },
  { id: 'film-damage', label: '필름 손상', labelEn: 'Film Damage', category: 'texture', icon: '📼', defaultBlendMode: 'normal', description: '먼지/스크래치 노이즈' },
  { id: 'prism-retro', label: '프리즘 레트로', labelEn: 'Prism Retro', category: 'texture', icon: '🌈', defaultBlendMode: 'normal', description: 'RGB 프리즘 분산' },
  { id: 'grunge-crack', label: '그런지 크랙', labelEn: 'Grunge Crack', category: 'texture', icon: '🪨', defaultBlendMode: 'normal', description: '거친 균열 텍스처' },
  { id: 'retro-film', label: '레트로 필름', labelEn: 'Retro Film', category: 'texture', icon: '📷', defaultBlendMode: 'normal', description: '세피아 톤 + 그레인' },
  { id: 'noise-grain', label: '노이즈 그레인', labelEn: 'Noise Grain', category: 'texture', icon: '📺', defaultBlendMode: 'normal', description: '미세 필름 그레인' },
  { id: 'halftone', label: '하프톤', labelEn: 'Halftone', category: 'texture', icon: '⚫', defaultBlendMode: 'normal', description: '도트 패턴 인쇄 효과' },
  { id: 'scanlines', label: '스캔라인', labelEn: 'Scanlines', category: 'texture', icon: '📟', defaultBlendMode: 'normal', description: 'CRT 수평선 효과' },
  { id: 'crosshatch', label: '크로스해치', labelEn: 'Crosshatch', category: 'texture', icon: '🔲', defaultBlendMode: 'normal', description: '교차 빗금 패턴' },
  { id: 'paper-texture', label: '종이 질감', labelEn: 'Paper', category: 'texture', icon: '📄', defaultBlendMode: 'normal', description: '종이 그레인 텍스처' },
  // 파티클 (11)
  { id: 'speed-lines', label: '스피드 라인', labelEn: 'Speed Lines', category: 'particle', icon: '💨', defaultBlendMode: 'normal', description: '방사형 집중선' },
  { id: 'snow', label: '눈', labelEn: 'Snow', category: 'particle', icon: '❄', defaultBlendMode: 'normal', description: '떨어지는 눈 파티클' },
  { id: 'rain', label: '비', labelEn: 'Rain', category: 'particle', icon: '🌧', defaultBlendMode: 'normal', description: '떨어지는 빗방울' },
  { id: 'sparkle', label: '반짝임', labelEn: 'Sparkle', category: 'particle', icon: '✨', defaultBlendMode: 'normal', description: '글리터/스파클' },
  { id: 'dust', label: '먼지', labelEn: 'Dust', category: 'particle', icon: '🌫', defaultBlendMode: 'normal', description: '떠다니는 먼지 입자' },
  { id: 'fireflies', label: '반딧불', labelEn: 'Fireflies', category: 'particle', icon: '🪲', defaultBlendMode: 'normal', description: '떠다니는 빛 입자' },
  { id: 'bubbles', label: '거품', labelEn: 'Bubbles', category: 'particle', icon: '🫧', defaultBlendMode: 'normal', description: '떠오르는 물방울' },
  { id: 'confetti', label: '색종이', labelEn: 'Confetti', category: 'particle', icon: '🎊', defaultBlendMode: 'normal', description: '떨어지는 색종이 조각' },
  { id: 'cherry-blossom', label: '벚꽃', labelEn: 'Cherry Blossom', category: 'particle', icon: '🌸', defaultBlendMode: 'normal', description: '흩날리는 벚꽃잎' },
  { id: 'embers', label: '불씨', labelEn: 'Embers', category: 'particle', icon: '🔥', defaultBlendMode: 'normal', description: '떠오르는 불꽃 입자' },
  { id: 'stars', label: '별', labelEn: 'Stars', category: 'particle', icon: '⭐', defaultBlendMode: 'normal', description: '반짝이는 별빛' },
  // 대기 (11)
  { id: 'fog', label: '안개', labelEn: 'Fog', category: 'atmosphere', icon: '🌁', defaultBlendMode: 'normal', description: '흐릿한 안개 효과' },
  { id: 'light-leak', label: '라이트 릭', labelEn: 'Light Leak', category: 'atmosphere', icon: '🔆', defaultBlendMode: 'normal', description: '빛 번짐 효과' },
  { id: 'bokeh', label: '보케', labelEn: 'Bokeh', category: 'atmosphere', icon: '🔮', defaultBlendMode: 'normal', description: '원형 보케 빛' },
  { id: 'vignette', label: '비네팅', labelEn: 'Vignette', category: 'atmosphere', icon: '🖤', defaultBlendMode: 'normal', description: '가장자리 어둡게' },
  { id: 'lens-flare', label: '렌즈 플레어', labelEn: 'Lens Flare', category: 'atmosphere', icon: '☀', defaultBlendMode: 'normal', description: '빛 반사 플레어' },
  { id: 'smoke', label: '연기', labelEn: 'Smoke', category: 'atmosphere', icon: '💨', defaultBlendMode: 'normal', description: '피어오르는 연기' },
  { id: 'aurora', label: '오로라', labelEn: 'Aurora', category: 'atmosphere', icon: '🌌', defaultBlendMode: 'normal', description: '북극 오로라 빛' },
  { id: 'underwater', label: '수중', labelEn: 'Underwater', category: 'atmosphere', icon: '🌊', defaultBlendMode: 'normal', description: '수중 물결 + 푸른빛' },
  { id: 'god-rays', label: '빛줄기', labelEn: 'God Rays', category: 'atmosphere', icon: '🌤', defaultBlendMode: 'normal', description: '위에서 내려오는 빛줄기' },
  { id: 'heat-haze', label: '아지랑이', labelEn: 'Heat Haze', category: 'atmosphere', icon: '🏜', defaultBlendMode: 'normal', description: '열기로 인한 공기 흔들림' },
  { id: 'chromatic-aberration', label: '색수차', labelEn: 'Chromatic', category: 'atmosphere', icon: '🔴', defaultBlendMode: 'normal', description: 'RGB 색수차 효과' },
  // 색보정 (8)
  { id: 'warm-tone', label: '따뜻한 톤', labelEn: 'Warm Tone', category: 'color', icon: '🟠', defaultBlendMode: 'normal', description: '따뜻한 오렌지 색감' },
  { id: 'cool-tone', label: '차가운 톤', labelEn: 'Cool Tone', category: 'color', icon: '🔵', defaultBlendMode: 'normal', description: '차가운 블루 색감' },
  { id: 'sunset-glow', label: '석양 빛', labelEn: 'Sunset Glow', category: 'color', icon: '🌅', defaultBlendMode: 'normal', description: '오렌지/핑크 석양 그라데이션' },
  { id: 'midnight-blue', label: '심야 블루', labelEn: 'Midnight', category: 'color', icon: '🌙', defaultBlendMode: 'normal', description: '어두운 블루 야간 톤' },
  { id: 'neon-glow', label: '네온 글로우', labelEn: 'Neon Glow', category: 'color', icon: '💜', defaultBlendMode: 'normal', description: '사이버펑크 네온 색감' },
  { id: 'golden-hour', label: '골든 아워', labelEn: 'Golden Hour', category: 'color', icon: '🌞', defaultBlendMode: 'normal', description: '황금빛 자연광' },
  { id: 'cyberpunk', label: '사이버펑크', labelEn: 'Cyberpunk', category: 'color', icon: '🤖', defaultBlendMode: 'normal', description: '틸 + 마젠타 색분리' },
  { id: 'vintage-warm', label: '빈티지 웜', labelEn: 'Vintage Warm', category: 'color', icon: '🟤', defaultBlendMode: 'normal', description: '갈색 따뜻한 레트로 색감' },
];

export { OVERLAY_PRESETS };

const BLEND_LABELS: Record<OverlayBlendMode, string> = {
  normal: '일반', screen: '스크린', overlay: '오버레이',
  'soft-light': '소프트 라이트', 'hard-light': '하드 라이트',
  multiply: '곱하기', lighten: '밝게',
};

const BLEND_OPTIONS: OverlayBlendMode[] = ['normal', 'screen', 'overlay', 'soft-light', 'hard-light', 'multiply', 'lighten'];

type CategoryFilter = 'all' | OverlayCategory;
const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'texture', label: '텍스처' },
  { id: 'particle', label: '파티클' },
  { id: 'atmosphere', label: '대기' },
  { id: 'color', label: '색보정' },
];

interface OverlayPickerProps {
  overlays: SceneOverlayConfig[];
  onAdd: (overlay: SceneOverlayConfig) => void;
  onUpdate: (index: number, partial: Partial<SceneOverlayConfig>) => void;
  onRemove: (index: number) => void;
}

const OverlayPicker: React.FC<OverlayPickerProps> = ({ overlays, onAdd, onUpdate, onRemove }) => {
  const [category, setCategory] = useState<CategoryFilter>('all');

  const filteredPresets = useMemo(() =>
    category === 'all' ? OVERLAY_PRESETS : OVERLAY_PRESETS.filter((p) => p.category === category),
    [category]
  );

  const activePresetIds = useMemo(() => new Set(overlays.map((o) => o.presetId)), [overlays]);

  const handleTogglePreset = (preset: OverlayPreset) => {
    const existingIdx = overlays.findIndex((o) => o.presetId === preset.id);
    if (existingIdx >= 0) {
      onRemove(existingIdx);
    } else {
      if (overlays.length >= 5) return;
      onAdd({
        presetId: preset.id,
        intensity: 80,
        opacity: 90,
        blendMode: preset.defaultBlendMode,
        speed: 1.0,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* 카테고리 탭 */}
      <div className="flex gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`px-2 py-1 rounded text-sm font-bold border transition-all ${
              category === cat.id
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 프리셋 그리드 */}
      <div className="flex flex-wrap gap-1.5">
        {filteredPresets.map((preset) => {
          const isActive = activePresetIds.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleTogglePreset(preset)}
              disabled={!isActive && overlays.length >= 5}
              title={preset.description}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                isActive
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30'
                  : overlays.length >= 5
                    ? 'bg-gray-900/30 border-gray-800/50 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-900/50 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              <span className="text-sm">{preset.icon}</span>
              <span>{preset.label}</span>
              {isActive && <span className="text-emerald-400 text-xs ml-0.5">ON</span>}
            </button>
          );
        })}
      </div>

      {/* 활성 오버레이 컨트롤 */}
      {overlays.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-700/50">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            적용된 오버레이 ({overlays.length}/5)
          </p>
          {overlays.map((overlay, idx) => {
            const preset = OVERLAY_PRESETS.find((p) => p.id === overlay.presetId);
            if (!preset) return null;
            return (
              <div key={`${overlay.presetId}-${idx}`} className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-2.5 space-y-2">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-200">
                    {preset.icon} {preset.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="text-gray-600 hover:text-red-400 text-sm transition-colors px-1"
                  >
                    X
                  </button>
                </div>

                {/* 강도 (확장 범위: 0~200%) */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10 flex-shrink-0">강도</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={overlay.intensity}
                    onChange={(e) => onUpdate(idx, { intensity: Number(e.target.value) })}
                    className="flex-1 h-1 accent-emerald-500"
                  />
                  <span className="text-xs text-gray-400 font-mono w-8 text-right">{overlay.intensity}%</span>
                </div>

                {/* 불투명도 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10 flex-shrink-0">투명도</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={overlay.opacity}
                    onChange={(e) => onUpdate(idx, { opacity: Number(e.target.value) })}
                    className="flex-1 h-1 accent-emerald-500"
                  />
                  <span className="text-xs text-gray-400 font-mono w-8 text-right">{overlay.opacity}%</span>
                </div>

                {/* 블렌드 + 속도 */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">블렌드</span>
                    <select
                      value={overlay.blendMode}
                      onChange={(e) => onUpdate(idx, { blendMode: e.target.value as OverlayBlendMode })}
                      className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500/50"
                    >
                      {BLEND_OPTIONS.map((bm) => (
                        <option key={bm} value={bm}>{BLEND_LABELS[bm]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-xs text-gray-500">속도</span>
                    <input
                      type="range"
                      min={0.2}
                      max={5}
                      step={0.1}
                      value={overlay.speed}
                      onChange={(e) => onUpdate(idx, { speed: Number(e.target.value) })}
                      className="flex-1 h-1 accent-emerald-500"
                    />
                    <span className="text-xs text-gray-400 font-mono w-8 text-right">{overlay.speed.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {overlays.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-2">
          오버레이를 선택하면 장면에 시각 효과가 적용됩니다
        </p>
      )}
    </div>
  );
};

export default OverlayPicker;
