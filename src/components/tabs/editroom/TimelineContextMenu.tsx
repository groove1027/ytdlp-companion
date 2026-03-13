import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import type { TimelineLayerType } from '../../../types';

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  danger?: boolean;
}

const TimelineContextMenu: React.FC = () => {
  const contextMenu = useEditRoomStore((s) => s.contextMenu);
  const setContextMenu = useEditRoomStore((s) => s.setContextMenu);
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const setSceneSubtitle = useEditRoomStore((s) => s.setSceneSubtitle);
  const setSceneTransition = useEditRoomStore((s) => s.setSceneTransition);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);
  const trackMixer = useEditRoomStore((s) => s.trackMixer);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const { x, y, layerType, sceneId } = contextMenu;
  const realId = sceneId?.replace(/^(va-|sfx-)/, '') ?? '';

  const getMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];

    // 뮤트/솔로 for audio tracks
    const audioTrackMap: Partial<Record<TimelineLayerType, 'narration' | 'bgm' | 'sfx' | 'origAudio'>> = {
      narration: 'narration',
      bgm: 'bgm',
      sfx: 'sfx',
      origAudio: 'origAudio',
    };
    const trackId = audioTrackMap[layerType];

    switch (layerType) {
      case 'video':
        items.push({
          label: '효과 초기화',
          icon: '🔄',
          action: () => setSceneEffect(realId, { panZoomPreset: 'none', motionEffect: 'none' }),
        });
        break;

      case 'subtitle':
        items.push({
          label: '자막 지우기',
          icon: '🗑️',
          action: () => setSceneSubtitle(realId, { text: '' }),
          danger: true,
        });
        break;

      case 'transition':
        items.push({
          label: '전환 초기화 (컷)',
          icon: '🔄',
          action: () => setSceneTransition(realId, { preset: 'none', duration: 0.5 }),
        });
        break;

      case 'bgm':
        items.push({
          label: 'BGM 볼륨 초기화',
          icon: '🔄',
          action: () => setBgmTrack({ volume: 60, duckingDb: -6, fadeIn: 1, fadeOut: 2 }),
        });
        break;

      default:
        break;
    }

    // 오디오 트랙 공통: 뮤트/솔로
    if (trackId) {
      const mx = trackMixer[trackId];
      items.push({
        label: mx?.mute ? '뮤트 해제' : '뮤트',
        icon: mx?.mute ? '🔊' : '🔇',
        action: () => setTrackMixer(trackId, { mute: !mx?.mute }),
      });
      items.push({
        label: mx?.solo ? '솔로 해제' : '솔로',
        icon: mx?.solo ? '🎵' : '🎧',
        action: () => setTrackMixer(trackId, { solo: !mx?.solo }),
      });
    }

    return items;
  };

  const items = getMenuItems();
  if (items.length === 0) return null;

  // 뷰포트 바운드 보정
  const menuWidth = 180;
  const menuHeight = items.length * 32 + 8;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[99999] bg-gray-900 border border-gray-600 rounded-lg shadow-2xl py-1 overflow-hidden"
      style={{ left: adjustedX, top: adjustedY, width: menuWidth }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            item.action();
            setContextMenu(null);
          }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
            item.danger
              ? 'text-red-400 hover:bg-red-600/15'
              : 'text-gray-300 hover:bg-gray-700/60'
          }`}
        >
          <span className="text-sm">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
};

export default TimelineContextMenu;
