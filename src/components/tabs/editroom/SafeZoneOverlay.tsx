import React from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import type { SafeZonePlatform, SafeZoneMargins } from '../../../types';

// 플랫폼별 안전 영역 마진 (% of frame)
const PLATFORM_MARGINS: Record<Exclude<SafeZonePlatform, 'custom'>, SafeZoneMargins> = {
  'youtube-shorts': { top: 11.5, bottom: 20.8, left: 5.6, right: 11.1 },
  'instagram-reels': { top: 10, bottom: 25, left: 5, right: 12 },
  'tiktok': { top: 12, bottom: 22, left: 5, right: 13 },
};

const DEFAULT_CUSTOM: SafeZoneMargins = { top: 10, bottom: 20, left: 5, right: 10 };

export function getSafeZoneMargins(platform: SafeZonePlatform, custom?: SafeZoneMargins): SafeZoneMargins {
  if (platform === 'custom') return custom || DEFAULT_CUSTOM;
  return PLATFORM_MARGINS[platform];
}

/* ═══════════════════════════════════════════
   플랫폼 UI 시뮬레이션 — 실제 앱 UI를 최대한 재현
   ═══════════════════════════════════════════ */

// SVG 아이콘 (작은 크기에서도 선명)
const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);
const CommentIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);
const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px]">
    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
  </svg>
);
const ThumbDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[12px] h-[12px]">
    <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/>
  </svg>
);
const RemixIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[12px] h-[12px]">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
  </svg>
);
const MusicIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[10px] h-[10px]">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>
);

const IconBtn: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <div className="flex flex-col items-center gap-[2px]">
    <div className="w-[22px] h-[22px] flex items-center justify-center text-white/80 drop-shadow-md">
      {children}
    </div>
    {label && <span className="text-[6px] text-white/70 font-semibold drop-shadow-sm">{label}</span>}
  </div>
);

// ── YouTube Shorts ──
const YoutubeShortsUI: React.FC = () => (
  <>
    <div className="absolute right-[2.5%] bottom-[22%] flex flex-col items-center gap-[10px]">
      <IconBtn label="42K"><HeartIcon /></IconBtn>
      <IconBtn><ThumbDownIcon /></IconBtn>
      <IconBtn label="1.2K"><CommentIcon /></IconBtn>
      <IconBtn label="Share"><ShareIcon /></IconBtn>
      <IconBtn><RemixIcon /></IconBtn>
    </div>
    <div className="absolute bottom-[3%] left-[3.5%] right-[14%]">
      <div className="flex items-center gap-[5px] mb-[3px]">
        <div className="w-[16px] h-[16px] rounded-full bg-gradient-to-br from-gray-300/50 to-gray-500/50 border border-white/20" />
        <span className="text-[7px] text-white/90 font-bold drop-shadow-sm">@channel_name</span>
        <span className="text-[5.5px] bg-white/90 text-black font-bold px-[5px] py-[1.5px] rounded-sm">SUBSCRIBE</span>
      </div>
      <p className="text-[6px] text-white/70 leading-tight truncate drop-shadow-sm">Video description goes here... #shorts</p>
    </div>
  </>
);

// ── Instagram Reels ──
const InstagramReelsUI: React.FC = () => (
  <>
    <div className="absolute right-[2.5%] bottom-[26%] flex flex-col items-center gap-[10px]">
      <IconBtn label="12.5K"><HeartIcon /></IconBtn>
      <IconBtn label="843"><CommentIcon /></IconBtn>
      <IconBtn><ShareIcon /></IconBtn>
      <IconBtn><BookmarkIcon /></IconBtn>
      <div className="w-[18px] h-[18px] rounded-[4px] border-[1.5px] border-white/60 bg-gradient-to-br from-purple-400/30 to-pink-400/30 mt-1" />
    </div>
    <div className="absolute bottom-[3%] left-[3.5%] right-[14%]">
      <div className="flex items-center gap-[5px] mb-[3px]">
        <div className="w-[16px] h-[16px] rounded-full bg-gradient-to-br from-purple-400/50 to-pink-400/50 border border-white/30" />
        <span className="text-[7px] text-white/90 font-bold drop-shadow-sm">username</span>
        <span className="text-[5.5px] bg-transparent text-white/90 font-bold px-[5px] py-[1.5px] rounded-[3px] border border-white/60">Follow</span>
      </div>
      <p className="text-[6px] text-white/70 leading-tight truncate drop-shadow-sm">Reel caption with #hashtags</p>
      <div className="flex items-center gap-[3px] mt-[2px]">
        <MusicIcon />
        <span className="text-[5.5px] text-white/60 truncate">Original audio - artist</span>
      </div>
    </div>
  </>
);

// ── TikTok ──
const TikTokUI: React.FC = () => (
  <>
    <div className="absolute right-[2.5%] bottom-[22%] flex flex-col items-center gap-[10px]">
      <div className="w-[20px] h-[20px] rounded-full bg-gradient-to-br from-gray-300/50 to-gray-500/50 border-[1.5px] border-white/40 mb-1">
        <div className="w-[8px] h-[8px] rounded-full bg-red-500 absolute -bottom-[2px] left-1/2 -translate-x-1/2 flex items-center justify-center text-white text-[5px] font-bold">+</div>
      </div>
      <IconBtn label="88.5K"><HeartIcon /></IconBtn>
      <IconBtn label="3.2K"><CommentIcon /></IconBtn>
      <IconBtn label="5.1K"><BookmarkIcon /></IconBtn>
      <IconBtn><ShareIcon /></IconBtn>
      <div className="w-[18px] h-[18px] rounded-full bg-gradient-to-br from-gray-600/60 to-gray-800/60 border border-white/30 animate-[spin_3s_linear_infinite] flex items-center justify-center mt-1">
        <MusicIcon />
      </div>
    </div>
    <div className="absolute bottom-[3%] left-[3.5%] right-[14%]">
      <span className="text-[7px] text-white/90 font-bold drop-shadow-sm">@username</span>
      <p className="text-[6px] text-white/70 leading-tight truncate mt-[2px] drop-shadow-sm">Video caption with #fyp #viral</p>
      <div className="flex items-center gap-[3px] mt-[2px]">
        <MusicIcon />
        <div className="overflow-hidden max-w-[60%]">
          <span className="text-[5.5px] text-white/60 whitespace-nowrap">Original sound - creator name</span>
        </div>
      </div>
    </div>
  </>
);

const UI_COMPONENTS: Record<Exclude<SafeZonePlatform, 'custom'>, React.FC> = {
  'youtube-shorts': YoutubeShortsUI,
  'instagram-reels': InstagramReelsUI,
  'tiktok': TikTokUI,
};

/* ═══════════════════════════════════════════
   메인 오버레이
   ═══════════════════════════════════════════ */
const SafeZoneOverlay: React.FC = () => {
  const { platform, showGuide, showUiSimulation, customMargins } = useEditRoomStore((s) => s.safeZone);

  if (!showGuide && !showUiSimulation) return null;

  const margins = getSafeZoneMargins(platform, customMargins);

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* ── 안전 영역 가이드 ── */}
      {showGuide && (
        <>
          {/* 상단 위험 영역 */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: `${margins.top}%`,
              background: 'linear-gradient(to bottom, rgba(239,68,68,0.2), rgba(239,68,68,0.08))',
              borderBottom: '1.5px dashed rgba(239,68,68,0.6)',
            }}
          >
            <span className="absolute bottom-[2px] right-[6px] text-[6px] text-red-400/80 font-mono font-bold bg-black/30 px-[3px] rounded-sm">
              {margins.top}%
            </span>
          </div>

          {/* 하단 위험 영역 */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: `${margins.bottom}%`,
              background: 'linear-gradient(to top, rgba(239,68,68,0.2), rgba(239,68,68,0.08))',
              borderTop: '1.5px dashed rgba(239,68,68,0.6)',
            }}
          >
            <span className="absolute top-[2px] right-[6px] text-[6px] text-red-400/80 font-mono font-bold bg-black/30 px-[3px] rounded-sm">
              {margins.bottom}%
            </span>
          </div>

          {/* 좌측 위험 영역 */}
          <div
            className="absolute left-0"
            style={{
              top: `${margins.top}%`,
              bottom: `${margins.bottom}%`,
              width: `${margins.left}%`,
              background: 'linear-gradient(to right, rgba(239,68,68,0.12), transparent)',
              borderRight: '1px dashed rgba(239,68,68,0.3)',
            }}
          />

          {/* 우측 위험 영역 */}
          <div
            className="absolute right-0"
            style={{
              top: `${margins.top}%`,
              bottom: `${margins.bottom}%`,
              width: `${margins.right}%`,
              background: 'linear-gradient(to left, rgba(239,68,68,0.12), transparent)',
              borderLeft: '1px dashed rgba(239,68,68,0.3)',
            }}
          />

          {/* 안전 영역 박스 — 초록 점선 */}
          <div
            className="absolute"
            style={{
              top: `${margins.top}%`,
              bottom: `${margins.bottom}%`,
              left: `${margins.left}%`,
              right: `${margins.right}%`,
              border: '1.5px dashed rgba(74,222,128,0.5)',
              borderRadius: '2px',
            }}
          >
            <span
              className="absolute top-[3px] left-[4px] text-[6px] font-bold"
              style={{
                color: 'rgba(74,222,128,0.8)',
                background: 'rgba(0,0,0,0.5)',
                padding: '1px 4px',
                borderRadius: '2px',
              }}
            >
              안전 영역
            </span>
          </div>
        </>
      )}

      {/* ── 플랫폼 UI 시뮬레이션 ── */}
      {showUiSimulation && platform !== 'custom' && (() => {
        const UiComponent = UI_COMPONENTS[platform];
        return <UiComponent />;
      })()}
    </div>
  );
};

export default SafeZoneOverlay;
