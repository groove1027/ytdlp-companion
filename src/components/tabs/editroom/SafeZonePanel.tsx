/**
 * SafeZonePanel — SubtitleStyleEditor 우측 패널 안에 삽입되는 안전 영역 설정 섹션.
 * 기존 에디터 스타일(SliderRow, 토글, 버튼)에 완벽히 맞춤.
 */
import React, { useMemo, useCallback } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { getSafeZoneMargins } from './SafeZoneOverlay';
import type { SafeZonePlatform } from '../../../types';

const PLATFORMS: { id: SafeZonePlatform; label: string; icon: string }[] = [
  { id: 'youtube-shorts', label: 'Shorts', icon: '▶' },
  { id: 'instagram-reels', label: 'Reels', icon: '📷' },
  { id: 'tiktok', label: 'TikTok', icon: '♪' },
  { id: 'custom', label: '직접 설정', icon: '⚙' },
];

const PLATFORM_NAMES: Record<SafeZonePlatform, string> = {
  'youtube-shorts': 'YouTube Shorts',
  'instagram-reels': 'Instagram Reels',
  'tiktok': 'TikTok',
  'custom': '직접 설정',
};

interface SafeZonePanelProps {
  posY: number;
  setPosY: (v: number) => void;
}

const SafeZonePanel: React.FC<SafeZonePanelProps> = ({ posY, setPosY }) => {
  const safeZone = useEditRoomStore((s) => s.safeZone);
  const setSafeZone = useEditRoomStore((s) => s.setSafeZone);

  const margins = useMemo(
    () => getSafeZoneMargins(safeZone.platform, safeZone.customMargins),
    [safeZone.platform, safeZone.customMargins]
  );

  const status = useMemo(() => {
    if (posY < margins.bottom) return 'bottom' as const;
    if (posY > 100 - margins.top) return 'top' as const;
    return 'safe' as const;
  }, [posY, margins]);

  const moveToSafe = useCallback(() => {
    if (status === 'bottom') setPosY(Math.ceil(margins.bottom + 2));
    else if (status === 'top') setPosY(Math.floor(100 - margins.top - 5));
  }, [status, margins, setPosY]);

  return (
    <div className="space-y-2.5">
      {/* 제목 + 가이드 토글 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">안전 영역</span>
        <button
          type="button"
          onClick={() => setSafeZone({ showGuide: !safeZone.showGuide })}
          className={`relative w-9 h-5 rounded-full transition-colors ${safeZone.showGuide ? 'bg-amber-500' : 'bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${safeZone.showGuide ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* 플랫폼 선택 */}
      <div className="flex gap-0.5">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSafeZone({ platform: p.id })}
            className={`flex-1 px-0.5 py-1.5 rounded text-xs font-bold transition-all border ${
              safeZone.platform === p.id
                ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                : 'bg-gray-900 text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="block text-center">{p.icon}</span>
            <span className="block text-center mt-0.5">{p.label}</span>
          </button>
        ))}
      </div>

      {/* UI 모의 토글 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300 font-medium">UI 요소 모의</span>
        <button
          type="button"
          onClick={() => setSafeZone({ showUiSimulation: !safeZone.showUiSimulation })}
          className={`relative w-9 h-5 rounded-full transition-colors ${safeZone.showUiSimulation ? 'bg-amber-500' : 'bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${safeZone.showUiSimulation ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* 직접 설정 마진 조정 */}
      {safeZone.platform === 'custom' && (
        <div className="space-y-1 bg-gray-900/40 rounded-lg p-2">
          {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
            const val = safeZone.customMargins?.[side] ?? (side === 'bottom' ? 20 : side === 'top' ? 10 : 5);
            const sideLabels: Record<string, string> = { top: '상단', bottom: '하단', left: '좌측', right: '우측' };
            return (
              <div key={side} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
                <span className="text-sm text-gray-400 w-6">{sideLabels[side]}</span>
                <input
                  type="range"
                  min={0} max={40} step={0.5}
                  value={val}
                  onChange={(e) => {
                    const prev = safeZone.customMargins ?? { top: 10, bottom: 20, left: 5, right: 10 };
                    setSafeZone({ customMargins: { ...prev, [side]: Number(e.target.value) } });
                  }}
                  className="w-full h-1 accent-amber-500"
                />
                <span className="text-xs text-amber-400 font-mono w-10 text-right">{val}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 마진 정보 + 위치 상태 */}
      {safeZone.showGuide && (
        <>
          <div className="bg-gray-900/40 rounded-lg px-2.5 py-1.5">
            <p className="text-xs text-gray-500 font-bold mb-1">{PLATFORM_NAMES[safeZone.platform]} 안전 영역</p>
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: '상단', val: margins.top },
                { label: '하단', val: margins.bottom },
                { label: '좌측', val: margins.left },
                { label: '우측', val: margins.right },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <span className="text-xs text-gray-500 block">{m.label}</span>
                  <span className="text-sm text-amber-400 font-mono font-bold">{m.val}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* 위치 상태 배지 */}
          {status !== 'safe' ? (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <span className="text-sm">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-400 font-bold leading-tight">
                  {status === 'bottom' ? '하단 위험 영역 침범' : '상단 위험 영역 침범'}
                </p>
                <p className="text-xs text-red-400/60 font-mono">
                  {'현재 ' + posY + '% — ' + (status === 'bottom' ? '안전: ' + margins.bottom + '% 이상' : '안전: ' + (100 - margins.top) + '% 이하')}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-green-900/15 border border-green-500/20 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <span className="text-sm text-green-400">✓</span>
              <span className="text-sm text-green-400/80">{'안전 영역 내 위치 (' + posY + '%)'}</span>
            </div>
          )}

          {/* 빠른 위치 이동 */}
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: '상단 안전', posY: Math.floor(100 - margins.top - 5) },
              { label: '중앙', posY: 50 },
              { label: '하단 안전', posY: Math.ceil(margins.bottom + 2) },
              { label: '권장 위치', posY: Math.ceil(margins.bottom + 3) },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => setPosY(btn.posY)}
                className={`px-1 py-1.5 rounded text-xs font-bold transition-all border ${
                  Math.abs(posY - btn.posY) < 2
                    ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                    : 'bg-gray-900 text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* 자동 이동 버튼 */}
          {status !== 'safe' && (
            <button
              type="button"
              onClick={moveToSafe}
              className="w-full px-3 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-green-600/80 to-emerald-600/80 hover:from-green-500 hover:to-emerald-500 text-white border border-green-400/30 shadow transition-all"
            >
              안전 영역으로 자동 이동
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default SafeZonePanel;
