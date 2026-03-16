import React, { useState, useEffect, useCallback } from 'react';
import { VISUAL_STYLES } from '../constants';
import { logger } from '../services/LoggerService';

// ─── Utils ───

const CATEGORY_EMOJIS = ['🎬', '📺', '🎨', '📖', '✏️', '🖼️', '📷'];

function isFeaturedStyle(label: string): boolean {
  return label.includes('MS 페인트');
}

function extractEmoji(label: string): string {
  const emojiMatch = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u);
  return emojiMatch ? emojiMatch[0] : '';
}

export function getVisualStyleLabel(prompt: string): string {
  for (const cat of VISUAL_STYLES) {
    for (const item of cat.items) {
      if (item.prompt === prompt) return item.label;
    }
  }
  return '';
}

// ─── Types ───

interface VisualStylePickerProps {
  value: string;
  onChange: (prompt: string) => void;
  colorTheme: 'blue' | 'pink';
  compact?: boolean;
}

interface LightboxState {
  catIdx: number;
  itemIdx: number;
}

// ─── Color maps ───

const COLORS = {
  blue: {
    activeBg: 'bg-blue-900/30',
    activeText: 'text-blue-200',
    selectedBg: 'bg-purple-900/50',
    selectedBorder: 'border-purple-500',
    badgeBg: 'bg-purple-900/20',
    badgeBorder: 'border-purple-500/30',
    badgeText: 'text-purple-200',
    focusBorder: 'focus:border-purple-500',
    focusRing: 'focus:ring-purple-500',
  },
  pink: {
    activeBg: 'bg-pink-900/30',
    activeText: 'text-pink-200',
    selectedBg: 'bg-pink-900/50',
    selectedBorder: 'border-pink-500',
    badgeBg: 'bg-pink-900/20',
    badgeBorder: 'border-pink-500/30',
    badgeText: 'text-pink-200',
    focusBorder: 'focus:border-pink-500',
    focusRing: 'focus:ring-pink-500',
  },
};

// ─── VisualStyleThumbnail ───

function VisualStyleThumbnail({ catIdx, itemIdx, label, onZoom }: {
  catIdx: number;
  itemIdx: number;
  label: string;
  onZoom: () => void;
}) {
  const [error, setError] = useState(false);
  const emoji = extractEmoji(label);
  const src = `/visual-previews/${catIdx}/${itemIdx}.jpg`;

  if (error) {
    return (
      <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center text-lg shrink-0">
        {emoji || '🎨'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      loading="lazy"
      className="w-10 h-10 rounded object-cover shrink-0 cursor-zoom-in hover:ring-2 hover:ring-white/50 transition-all"
      onClick={(e) => { e.stopPropagation(); onZoom(); }}
      onError={() => setError(true)}
    />
  );
}

// ─── StylePreviewLightbox ───

function StylePreviewLightbox({ state, onClose, value, onChange, isFav, toggleFav }: {
  state: LightboxState;
  onClose: () => void;
  value: string;
  onChange: (prompt: string) => void;
  isFav: (prompt: string) => boolean;
  toggleFav: (prompt: string) => void;
}) {
  const [current, setCurrent] = useState(state);
  const [imgError, setImgError] = useState(false);

  const allItems: { catIdx: number; itemIdx: number; label: string; prompt: string; desc: string }[] = [];
  VISUAL_STYLES.forEach((cat, ci) => {
    cat.items.forEach((item, ii) => {
      allItems.push({ catIdx: ci, itemIdx: ii, ...item });
    });
  });

  const flatIndex = allItems.findIndex(
    (it) => it.catIdx === current.catIdx && it.itemIdx === current.itemIdx
  );
  const currentItem = allItems[flatIndex];

  const navigate = useCallback((dir: 1 | -1) => {
    const next = flatIndex + dir;
    if (next >= 0 && next < allItems.length) {
      setCurrent({ catIdx: allItems[next].catIdx, itemIdx: allItems[next].itemIdx });
      setImgError(false);
    }
  }, [flatIndex, allItems]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onClose]);

  if (!currentItem) return null;

  const src = `/visual-previews/${current.catIdx}/${current.itemIdx}.jpg`;
  const emoji = extractEmoji(currentItem.label);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 rounded-2xl max-w-lg w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl z-10"
        >
          &times;
        </button>

        <div className="aspect-square rounded-xl overflow-hidden bg-gray-800 mb-3">
          {imgError ? (
            <div className="w-full h-full flex items-center justify-center text-6xl">
              {emoji || '🎨'}
            </div>
          ) : (
            <img
              src={src}
              alt={currentItem.label}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-2">
            <div className="text-xl font-bold text-white">{currentItem.label}</div>
            <button
              type="button"
              onClick={() => toggleFav(currentItem.prompt)}
              className={`text-xl transition-all hover:scale-125 ${isFav(currentItem.prompt) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
              title={isFav(currentItem.prompt) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            >★</button>
          </div>
          <div className="text-sm text-gray-400 mt-1">{currentItem.desc}</div>
        </div>

        {value === currentItem.prompt ? (
          <button
            type="button"
            onClick={() => { onChange(''); }}
            className="w-full mb-3 py-2.5 rounded-xl bg-green-600/20 border border-green-500/50 text-green-300 font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-600/30 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            적용됨 — 해제하기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { onChange(currentItem.prompt); onClose(); }}
            className="w-full mb-3 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            이 스타일 적용하기
          </button>
        )}

        <div className="flex justify-between items-center">
          <button
            onClick={() => navigate(-1)}
            disabled={flatIndex === 0}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            ← 이전
          </button>
          <span className="text-sm text-gray-500">{flatIndex + 1} / {allItems.length}</span>
          <button
            onClick={() => navigate(1)}
            disabled={flatIndex === allItems.length - 1}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Favorites ───

const FAVORITES_KEY = 'FAVORITE_VISUAL_STYLES';

function useFavorites(key: string) {
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { logger.trackSwallowedError('VisualStylePicker:useFavorites', e); return []; }
  });
  const toggle = (id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };
  return { favs, toggle, has: (id: string) => favs.includes(id) };
}

// ─── Main Component ───

export default function VisualStylePicker({ value, onChange, colorTheme, compact }: VisualStylePickerProps) {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const c = COLORS[colorTheme];
  const { favs, toggle: toggleFav, has: isFav } = useFavorites(FAVORITES_KEY);

  const pad = compact ? 'p-2' : 'p-3';
  const gap = compact ? 'gap-1.5' : 'gap-3';
  const itemPad = compact ? 'p-2' : 'p-2.5';
  const labelSize = compact ? 'text-sm' : 'text-base';
  const descSize = compact ? 'text-xs' : 'text-sm';
  const catPad = compact ? 'p-2' : 'p-3';
  const arrowSize = compact ? 'text-sm' : 'text-lg';

  // Collect favorited items with original indices
  const favItems: { catIdx: number; itemIdx: number; label: string; prompt: string; desc: string }[] = [];
  favs.forEach(prompt => {
    for (let ci = 0; ci < VISUAL_STYLES.length; ci++) {
      for (let ii = 0; ii < VISUAL_STYLES[ci].items.length; ii++) {
        if (VISUAL_STYLES[ci].items[ii].prompt === prompt) {
          favItems.push({ catIdx: ci, itemIdx: ii, ...VISUAL_STYLES[ci].items[ii] });
        }
      }
    }
  });

  const renderItem = (item: { label: string; prompt: string; desc: string }, catIdx: number, itemIdx: number) => {
    const featured = isFeaturedStyle(item.label);
    const faved = isFav(item.prompt);
    const isSelected = value === item.prompt;
    return (
      <div
        key={`${catIdx}-${itemIdx}`}
        className={`${itemPad} rounded-lg border text-left transition-all flex items-center gap-2 relative cursor-pointer ${
          isSelected
            ? 'bg-blue-600/15 border-blue-500/50 ring-1 ring-blue-500/30'
            : featured
              ? 'bg-gradient-to-r from-amber-900/30 to-orange-900/20 border-amber-500/70 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
              : 'bg-gray-900/60 border-gray-700/50 hover:border-gray-500 hover:bg-gray-800/70'
        }`}
        onClick={() => onChange(isSelected ? '' : item.prompt)}
      >
        {featured && (
          <span className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-black px-1.5 py-0.5 rounded-full shadow-lg animate-pulse z-10">HOT</span>
        )}
        <VisualStyleThumbnail
          catIdx={catIdx}
          itemIdx={itemIdx}
          label={item.label}
          onZoom={() => setLightbox({ catIdx, itemIdx })}
        />
        <div className="flex-1 min-w-0">
          <div className={`${labelSize} font-bold mb-0.5 ${featured ? 'text-amber-200' : 'text-white'}`}>{item.label}</div>
          <div className={`${descSize} leading-tight ${featured ? 'text-amber-300/70' : 'text-gray-400'}`}>{item.desc}</div>
        </div>
        {!isSelected ? (
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-cyan-400 bg-gray-800 border border-gray-700 hover:border-cyan-500/50 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors font-bold"
            title="이 스타일을 적용"
            onClick={(e) => { e.stopPropagation(); onChange(item.prompt); }}
          >
            적용
          </button>
        ) : (
          <span className="text-xs text-blue-400 bg-blue-600/20 border border-blue-500/30 rounded-lg px-2.5 py-1.5 shrink-0 font-bold">
            적용됨
          </span>
        )}
        <span
          onClick={(e) => { e.stopPropagation(); toggleFav(item.prompt); }}
          className={`shrink-0 text-base cursor-pointer hover:scale-125 transition-transform ${faved ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
        >★</span>
      </div>
    );
  };

  return (
    <>
      <div className={`grid grid-cols-1 ${gap} mb-4`}>
        {/* Favorites Section */}
        {favItems.length > 0 && (
          <div className="border border-yellow-600/50 rounded-lg overflow-hidden bg-gray-900/50">
            <div className={`w-full flex items-center justify-between ${catPad} font-bold text-base text-yellow-300 bg-yellow-900/20`}>
              <span>⭐ 즐겨찾기 ({favItems.length})</span>
            </div>
            <div className={`${pad} bg-gray-800/80`}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${gap}`}>
                {favItems.map(item => renderItem(item, item.catIdx, item.itemIdx))}
              </div>
            </div>
          </div>
        )}

        {VISUAL_STYLES.map((cat, idx) => (
          <div key={idx} className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/50">
            <button
              type="button"
              onClick={() => setExpandedCategory(expandedCategory === idx ? null : idx)}
              className={`w-full flex items-center justify-between ${catPad} font-bold text-left text-base transition-colors ${
                expandedCategory === idx ? `${c.activeBg} ${c.activeText}` : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <span>{CATEGORY_EMOJIS[idx] || '🎨'} {cat.category.split('(')[0].trim()}</span>
              <span
                className={`${arrowSize} transform transition-transform duration-200`}
                style={{ transform: expandedCategory === idx ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▼
              </span>
            </button>
            {expandedCategory === idx && (
              <div className={`${pad} bg-gray-800/80`}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${gap}`}>
                {cat.items.map((item, i) => renderItem(item, idx, i))}
              </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {lightbox && (
        <StylePreviewLightbox state={lightbox} onClose={() => setLightbox(null)} value={value} onChange={onChange} isFav={isFav} toggleFav={toggleFav} />
      )}
    </>
  );
}
