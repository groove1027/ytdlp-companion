import React, { useState, useCallback } from 'react';
import type { SceneEffectConfig } from '../../../types';
import { showToast } from '../../../stores/uiStore';

interface SceneEffectPickerProps {
  effect: SceneEffectConfig;
  onChange: (partial: Partial<SceneEffectConfig>) => void;
  imageUrl?: string;  // AI 초점 감지용 이미지 URL
}

const PAN_ZOOM_PRESETS = [
  { id: 'none', label: '없음', icon: '⛔' },
  { id: 'fast', label: '빠른', icon: '⚡' },
  { id: 'smooth', label: '부드러움', icon: '🌊' },
  { id: 'cinematic', label: '시네마틱', icon: '🎬' },
  { id: 'dynamic', label: '역동적', icon: '💥' },
  { id: 'dreamy', label: '우아한', icon: '✨' },
  { id: 'dramatic', label: '드라마틱', icon: '🎭' },
  { id: 'zoom', label: '집중', icon: '🔍' },
  { id: 'reveal', label: '공개', icon: '🎪' },
  { id: 'vintage', label: '빈티지', icon: '📷' },
  { id: 'documentary', label: '다큐', icon: '📹' },
  { id: 'timelapse', label: '타임랩스', icon: '⏳' },
  { id: 'vlog', label: '브이로그', icon: '📱' },
];

const MOTION_EFFECTS = [
  { id: 'none', label: '없음' },
  { id: 'fade', label: '점진' },
  { id: 'pan', label: '팬' },
  { id: 'micro', label: '마이크로' },
  { id: 'slow', label: '느린' },
  { id: 'shake', label: '흔들림' },
  { id: 'rotate', label: '회전' },
  { id: 'glitch', label: '글릿치' },
  { id: 'film', label: '필름' },
  { id: 'sepia', label: '세피아' },
  { id: 'crossfade', label: '페이드' },
  { id: 'static', label: '정적' },
];

const SceneEffectPicker: React.FC<SceneEffectPickerProps> = ({ effect, onChange, imageUrl }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  const handleAIDetect = useCallback(async () => {
    if (!imageUrl) { showToast('이미지가 없어 AI 초점 감지를 할 수 없습니다'); return; }
    setIsDetecting(true);
    try {
      const { detectImageFocalPoint } = await import('../../../services/smartMotionMatcher');
      const result = await detectImageFocalPoint(imageUrl);
      onChange({ anchorX: result.anchorX, anchorY: result.anchorY, anchorLabel: result.anchorLabel });
      showToast(`초점 감지 완료: ${result.anchorLabel} (${result.anchorX}%, ${result.anchorY}%)`);
    } catch (e) {
      showToast('AI 초점 감지 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsDetecting(false);
    }
  }, [imageUrl, onChange]);

  return (
    <div className="space-y-2">
      {/* 팬&줌 프리셋 */}
      <div>
        <p className="text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">팬&줌</p>
        <div className="flex flex-wrap gap-1">
          {PAN_ZOOM_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ panZoomPreset: effect.panZoomPreset === p.id ? 'none' : p.id })}
              className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-sm font-bold border transition-all ${
                effect.panZoomPreset === p.id
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="text-sm">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 모션 효과 */}
      <div>
        <p className="text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">모션</p>
        <div className="flex flex-wrap gap-1">
          {MOTION_EFFECTS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ motionEffect: effect.motionEffect === m.id ? 'none' : m.id })}
              className={`px-1.5 py-1 rounded text-sm font-bold border transition-all ${
                effect.motionEffect === m.id
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 앵커 포인트 표시 */}
      {(effect.anchorLabel || effect.anchorX != null) && (
        <div className="flex items-center gap-2 bg-amber-900/15 border border-amber-700/30 rounded-lg px-2 py-1.5">
          <div className="w-3 h-3 border-2 border-amber-400 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-amber-300 font-bold">{effect.anchorLabel || '앵커 포인트'}</span>
            <span className="text-xs text-gray-500 ml-1">({effect.anchorX ?? 50}%, {effect.anchorY ?? 45}%)</span>
          </div>
          <div className="flex gap-1">
            {[
              { label: 'X', val: effect.anchorX ?? 50, key: 'anchorX' as const },
              { label: 'Y', val: effect.anchorY ?? 45, key: 'anchorY' as const },
            ].map((a) => (
              <input
                key={a.key}
                type="number"
                min={0}
                max={100}
                value={a.val}
                onChange={(e) => onChange({ [a.key]: Number(e.target.value) })}
                className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500/50"
                title={`앵커 ${a.label} (0-100%)`}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI 초점 감지 + 초기화 + 세부 설정 */}
      <div className="flex items-center gap-2">
        {imageUrl && (
          <button
            type="button"
            onClick={handleAIDetect}
            disabled={isDetecting}
            className={`text-sm font-bold transition-colors border rounded px-2 py-0.5 ${
              isDetecting
                ? 'text-gray-500 border-gray-600 cursor-wait'
                : 'text-amber-400 hover:text-amber-300 border-amber-500/30 hover:bg-amber-500/10'
            }`}
          >
            {isDetecting ? '감지 중...' : 'AI 초점 감지'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange({
            panZoomPreset: 'cinematic',
            motionEffect: 'none',
            anchorX: 50,
            anchorY: 45,
            anchorLabel: '프레임 중심',
            customParams: { zoomStart: 100, zoomEnd: 110, panX: 0, panY: 0, fadeIn: 0.3, fadeOut: 0.3 },
          })}
          className="text-sm text-red-400 hover:text-red-300 transition-colors border border-red-500/30 rounded px-2 py-0.5 hover:bg-red-500/10"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showDetails ? '▼' : '▶'} 세부 설정
        </button>
      </div>
      {showDetails && (
        <div className="grid grid-cols-3 gap-2 bg-gray-900/50 rounded-lg p-2 border border-gray-700/50">
          {[
            { label: '줌 시작%', key: 'zoomStart', min: 80, max: 150, def: 100 },
            { label: '줌 끝%', key: 'zoomEnd', min: 80, max: 150, def: 110 },
            { label: '팬X', key: 'panX', min: -50, max: 50, def: 0 },
            { label: '팬Y', key: 'panY', min: -50, max: 50, def: 0 },
            { label: '페이드인(초)', key: 'fadeIn', min: 0, max: 2, def: 0.3 },
            { label: '페이드아웃(초)', key: 'fadeOut', min: 0, max: 2, def: 0.3 },
          ].map((s) => (
            <div key={s.key}>
              <label className="text-xs text-gray-500">{s.label}</label>
              <input
                type="number"
                min={s.min}
                max={s.max}
                step={s.min < 1 ? 0.1 : 1}
                defaultValue={effect.customParams?.[s.key as keyof NonNullable<SceneEffectConfig['customParams']>] ?? s.def}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChange({
                    customParams: {
                      zoomStart: 100, zoomEnd: 110, panX: 0, panY: 0, fadeIn: 0.3, fadeOut: 0.3,
                      ...effect.customParams,
                      [s.key]: val,
                    },
                  });
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-sm text-gray-300 font-mono mt-0.5 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SceneEffectPicker;
