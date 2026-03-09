import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { CommunityMediaItem, MediaType, MediaSource } from '../../../types';
import { searchMedia, preloadAllMedia } from '../../../services/mediaSearchService';
import { useProjectStore } from '../../../stores/projectStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { showToast } from '../../../stores/uiStore';

const QUICK_CATEGORIES = [
  { label: '반응', icon: '😂', query: 'reaction' },
  { label: '박수', icon: '👏', query: 'clap applause' },
  { label: '놀람', icon: '😱', query: 'surprise shock' },
  { label: '분노', icon: '😡', query: 'angry rage' },
  { label: '슬픔', icon: '😢', query: 'sad cry' },
  { label: '웃음', icon: '🤣', query: 'laugh funny' },
  { label: '칼', icon: '⚔', query: 'sword slash' },
  { label: '폭발', icon: '💥', query: 'explosion boom' },
  { label: '알림', icon: '🔔', query: 'notification bell' },
  { label: '타자', icon: '⌨', query: 'typing keyboard' },
];

const SOURCE_FILTERS: { id: MediaSource | 'all'; label: string; count: string }[] = [
  { id: 'all', label: '전체', count: '60K' },
  { id: 'klipy', label: '밈/GIF', count: '34K' },
  { id: 'irasutoya', label: '일러스트', count: '23K' },
  { id: 'myinstants', label: '밈 효과음', count: '1.8K' },
  { id: 'sfx_lab', label: '전문 SFX', count: '377' },
];

const FAVORITES_KEY = 'MEME_SFX_FAVORITES';
const RECENT_KEY = 'MEME_SFX_RECENT';
const MAX_RECENT = 20;
const MAX_FAVORITES = 50;

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

type ViewMode = 'search' | 'favorites' | 'recent';

const MemeAndSfxPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunityMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [activeType, setActiveType] = useState<MediaType | undefined>(undefined);
  const [activeSource, setActiveSource] = useState<MediaSource | 'all'>('all');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<CommunityMediaItem[]>(() => loadFromStorage(FAVORITES_KEY, []));
  const [recents, setRecents] = useState<CommunityMediaItem[]>(() => loadFromStorage(RECENT_KEY, []));
  const [viewMode, setViewMode] = useState<ViewMode>('search');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preloadedRef = useRef(false);

  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const scenes = useProjectStore((s) => s.scenes);

  useEffect(() => {
    if (!preloadedRef.current) {
      preloadedRef.current = true;
      setIsPreloading(true);
      preloadAllMedia().finally(() => setIsPreloading(false));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const targetScene = useMemo(() => {
    if (expandedSceneId) return scenes.find((s) => s.id === expandedSceneId);
    return scenes[0];
  }, [expandedSceneId, scenes]);

  const targetSceneIndex = useMemo(() => {
    if (!targetScene) return -1;
    return scenes.indexOf(targetScene);
  }, [targetScene, scenes]);

  // -- search (모든 파라미터를 명시적으로 전달 → 클로저 stale 방지) --
  const doSearch = useCallback(async (q: string, type?: MediaType, source?: MediaSource | 'all') => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    setIsLoading(true);
    setViewMode('search');
    try {
      const items = await searchMedia({
        query: trimmed,
        type,
        source: source === 'all' ? undefined : source,
        limit: 40,
      });
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleApplyToScene = useCallback((item: CommunityMediaItem) => {
    const scene = targetScene;
    if (!scene) {
      showToast('장면이 없습니다. 먼저 장면을 생성하세요.');
      return;
    }
    useProjectStore.getState().updateScene(scene.id, {
      imageUrl: item.type === 'image' ? item.url : scene.imageUrl,
      communityMediaItem: item,
    });
    setRecents((prev) => {
      const filtered = prev.filter((r) => r.id !== item.id);
      const updated = [item, ...filtered].slice(0, MAX_RECENT);
      saveToStorage(RECENT_KEY, updated);
      return updated;
    });
    const idx = scenes.indexOf(scene) + 1;
    showToast(`${item.type === 'image' ? '밈' : '효과음'} "${item.title}" → 장면 ${idx}에 적용`);
  }, [targetScene, scenes]);

  const handlePlayAudio = useCallback((e: React.MouseEvent, item: CommunityMediaItem) => {
    e.stopPropagation();
    if (playingAudioId === item.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(item.url);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
    audioRef.current = audio;
    setPlayingAudioId(item.id);
  }, [playingAudioId]);

  const toggleFavorite = useCallback((e: React.MouseEvent, item: CommunityMediaItem) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === item.id);
      const updated = exists
        ? prev.filter((f) => f.id !== item.id)
        : [item, ...prev].slice(0, MAX_FAVORITES);
      saveToStorage(FAVORITES_KEY, updated);
      return updated;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.some((f) => f.id === id), [favorites]);

  const displayItems = viewMode === 'favorites' ? favorites
    : viewMode === 'recent' ? recents
    : results;

  const imageItems = displayItems.filter((r) => r.type === 'image');
  const sfxItems = displayItems.filter((r) => r.type === 'sfx');

  return (
    <div className="space-y-2.5">
      {/* 프리로딩 표시 */}
      {isPreloading && (
        <div className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-1.5 border border-gray-700/50">
          <div className="w-3 h-3 border-2 border-gray-600 border-t-amber-400 rounded-full animate-spin" />
          <span className="text-[11px] text-gray-500">60,000+ 미디어 인덱스 로딩 중...</span>
        </div>
      )}

      {/* 적용 대상 장면 */}
      {targetScene && (
        <div className="flex items-center gap-1.5 bg-gray-900/30 rounded px-2 py-1 border border-gray-700/30">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-gray-500">
            적용 대상: <span className="text-amber-400 font-bold">장면 {targetSceneIndex + 1}</span>
          </span>
        </div>
      )}

      {/* 검색 입력 */}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query, activeType, activeSource); }}
          placeholder="밈, 짤, 효과음 검색..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500/50 outline-none"
        />
        <button
          onClick={() => doSearch(query, activeType, activeSource)}
          disabled={isLoading || !query.trim()}
          className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50"
        >
          {isLoading ? '...' : '검색'}
        </button>
      </div>

      {/* 뷰 모드 탭 (검색 / 즐겨찾기 / 최근) */}
      <div className="flex gap-1">
        {([
          { mode: 'search' as ViewMode, label: '검색', count: results.length },
          { mode: 'favorites' as ViewMode, label: '즐겨찾기', count: favorites.length },
          { mode: 'recent' as ViewMode, label: '최근', count: recents.length },
        ]).map(({ mode, label, count }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
              viewMode === mode
                ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                : 'bg-gray-900/30 border-gray-700/50 text-gray-500 hover:text-gray-300'
            }`}
          >
            {label} {count > 0 ? `(${count})` : ''}
          </button>
        ))}
      </div>

      {/* 타입 필터 */}
      {viewMode === 'search' && (
        <div className="flex flex-wrap gap-1">
          {([
            { type: undefined, label: '전체', icon: '🎯' },
            { type: 'image' as MediaType, label: '밈/짤', icon: '🖼' },
            { type: 'sfx' as MediaType, label: '효과음', icon: '🔊' },
          ]).map(({ type, label, icon }) => (
            <button
              key={label}
              onClick={() => {
                setActiveType(type);
                if (query.trim()) doSearch(query, type, activeSource);
              }}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold border transition-all ${
                activeType === type
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="text-[11px]">{icon}</span>{label}
            </button>
          ))}
        </div>
      )}

      {/* 소스 필터 */}
      {viewMode === 'search' && (
        <div className="flex flex-wrap gap-1">
          {SOURCE_FILTERS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => {
                setActiveSource(id);
                if (query.trim()) doSearch(query, activeType, id);
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
                activeSource === id
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
              }`}
            >
              {label} <span className="text-gray-600">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 빠른 카테고리 */}
      {viewMode === 'search' && results.length === 0 && !isLoading && (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400 font-bold">빠른 검색</p>
          <div className="flex flex-wrap gap-1">
            {QUICK_CATEGORIES.map((cat) => (
              <button
                key={cat.query}
                onClick={() => {
                  setQuery(cat.query);
                  doSearch(cat.query, activeType, activeSource);
                }}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-gray-900/50 border border-gray-700/50 text-xs text-gray-400 hover:text-amber-300 hover:border-amber-500/30 transition-all"
              >
                <span className="text-sm">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 결과 영역 */}
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-0.5 scrollbar-thin">
        {/* 빈 상태 */}
        {displayItems.length === 0 && !isLoading && viewMode === 'search' && query.trim() !== '' && (
          <div className="text-center py-6">
            <span className="text-2xl block mb-1">🔍</span>
            <p className="text-xs text-gray-500">검색 결과가 없습니다</p>
            <p className="text-[10px] text-gray-600 mt-1">영어 키워드도 시도해보세요</p>
          </div>
        )}
        {displayItems.length === 0 && viewMode === 'favorites' && (
          <div className="text-center py-6">
            <span className="text-2xl block mb-1">⭐</span>
            <p className="text-xs text-gray-500">즐겨찾기가 비어있습니다</p>
            <p className="text-[10px] text-gray-600 mt-1">검색 결과에서 ★를 눌러 추가하세요</p>
          </div>
        )}
        {displayItems.length === 0 && viewMode === 'recent' && (
          <div className="text-center py-6">
            <span className="text-2xl block mb-1">🕐</span>
            <p className="text-xs text-gray-500">최근 사용 기록이 없습니다</p>
          </div>
        )}

        {/* 이미지 결과 */}
        {imageItems.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 font-bold mb-1 flex items-center gap-1">
              <span>🖼</span> 이미지/밈 ({imageItems.length})
            </p>
            <div className="grid grid-cols-3 gap-1">
              {imageItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleApplyToScene(item)}
                  className="group/card relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-amber-500/50 transition-all"
                >
                  <div className="aspect-square relative">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/40 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover/card:opacity-100 text-white text-lg font-bold transition-opacity">+</span>
                    </div>
                    <button
                      onClick={(e) => toggleFavorite(e, item)}
                      className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full transition-all ${
                        isFavorite(item.id)
                          ? 'bg-amber-500/80 text-white'
                          : 'bg-black/50 text-gray-400 opacity-0 group-hover/card:opacity-100'
                      }`}
                    >
                      <span className="text-[10px]">{isFavorite(item.id) ? '★' : '☆'}</span>
                    </button>
                  </div>
                  <div className="px-1 py-0.5">
                    <span className="text-[9px] text-gray-400 line-clamp-1">{item.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 효과음 결과 */}
        {sfxItems.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 font-bold mb-1 flex items-center gap-1">
              <span>🔊</span> 효과음 ({sfxItems.length})
            </p>
            <div className="space-y-1">
              {sfxItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 bg-gray-800/50 rounded-lg border border-gray-700/50 px-2 py-1.5 hover:border-amber-500/30 transition-all cursor-pointer group/sfx"
                  onClick={() => handleApplyToScene(item)}
                >
                  <button
                    onClick={(e) => handlePlayAudio(e, item)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
                      playingAudioId === item.id
                        ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {playingAudioId === item.id ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-200 line-clamp-1">{item.title}</span>
                    <span className="text-[10px] text-gray-600">{item.tags.slice(0, 2).join(', ')}</span>
                  </div>
                  <button
                    onClick={(e) => toggleFavorite(e, item)}
                    className={`flex-shrink-0 text-sm transition-colors ${
                      isFavorite(item.id) ? 'text-amber-400' : 'text-gray-600 opacity-0 group-hover/sfx:opacity-100'
                    }`}
                  >
                    {isFavorite(item.id) ? '★' : '☆'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 하단 정보 */}
      <p className="text-[10px] text-gray-600 leading-tight">
        60,000+ 밈/일러스트/효과음 검색 · KLIPY 34K · 이라스토야 23K · 효과음 2.1K
      </p>
    </div>
  );
};

export default MemeAndSfxPanel;
