import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { CommunityMediaItem, MediaType, MediaSource } from '../../../types';
import { searchMedia, preloadAllMedia } from '../../../services/mediaSearchService';
import { useProjectStore } from '../../../stores/projectStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';

// ─── 상수 ───
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
  { label: '고양이', icon: '🐱', query: 'cat' },
  { label: '강아지', icon: '🐶', query: 'dog' },
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
  } catch (e) { logger.trackSwallowedError('MemeAndSfxPanel:loadFromStorage', e); return fallback; }
}

function saveToStorage(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { logger.trackSwallowedError('MemeAndSfxPanel:saveToStorage', e); }
}

// ─── 퀵 패널 (탭 내부 컴팩트 패널) ───
// QuickPanel은 localStorage에서 직접 읽어 상태 중복 방지
const MemeAndSfxPanel: React.FC<{ onOpenDetail: () => void }> = ({ onOpenDetail }) => {
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const scenes = useProjectStore((s) => s.scenes);

  const recents = useMemo(() => loadFromStorage<CommunityMediaItem[]>(RECENT_KEY, []), []);
  const favorites = useMemo(() => loadFromStorage<CommunityMediaItem[]>(FAVORITES_KEY, []), []);

  const targetScene = useMemo(() => {
    if (expandedSceneId) return scenes.find((s) => s.id === expandedSceneId);
    return scenes[0];
  }, [expandedSceneId, scenes]);

  const targetIndex = useMemo(() => {
    if (!targetScene) return -1;
    return scenes.indexOf(targetScene);
  }, [targetScene, scenes]);

  const recentImages = recents.filter((r) => r.type === 'image').slice(0, 6);
  const recentSfx = recents.filter((r) => r.type === 'sfx').slice(0, 3);
  const favImages = favorites.filter((r) => r.type === 'image').slice(0, 6);

  return (
    <div className="space-y-2.5">
      {/* 적용 대상 장면 */}
      {targetScene && (
        <div className="flex items-center gap-1.5 bg-gray-900/30 rounded px-2 py-1 border border-gray-700/30">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-gray-500">
            적용 대상: <span className="text-amber-400 font-bold">장면 {targetIndex + 1}</span>
          </span>
        </div>
      )}

      {/* 빠른 카테고리 */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">빠른 검색 <span className="text-gray-600 font-normal">12종 카테고리</span></p>
        <div className="flex flex-wrap gap-1">
          {QUICK_CATEGORIES.slice(0, 8).map((cat) => (
            <button
              key={cat.query}
              type="button"
              onClick={onOpenDetail}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-gray-900/50 border border-gray-700/50 text-gray-500 hover:text-amber-300 hover:border-amber-500/30 transition-all"
            >
              <span className="text-[11px]">{cat.icon}</span>{cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 최근 사용 이미지 */}
      {recentImages.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400 font-bold">최근 사용 <span className="text-gray-600 font-normal">{recents.length}개</span></p>
          <div className="grid grid-cols-3 gap-1">
            {recentImages.map((item) => (
              <div key={item.id} className="aspect-square rounded-lg overflow-hidden border border-gray-700/50 bg-gray-800">
                <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 사용 SFX */}
      {recentSfx.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400 font-bold">최근 효과음</p>
          {recentSfx.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 bg-gray-900/30 rounded px-2 py-1 border border-gray-700/30">
              <span className="text-[11px]">🔊</span>
              <span className="text-[11px] text-gray-400 truncate">{item.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* 즐겨찾기 미리보기 */}
      {favImages.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400 font-bold">즐겨찾기 <span className="text-gray-600 font-normal">{favorites.length}개</span></p>
          <div className="grid grid-cols-3 gap-1">
            {favImages.map((item) => (
              <div key={item.id} className="aspect-square rounded-lg overflow-hidden border border-amber-500/30 bg-gray-800">
                <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-600 leading-tight">
        밈 34,000+ · 일러스트 23,000+ · 효과음 2,100+ · 즐겨찾기/최근 사용 지원
      </p>

      {/* 전체 검색 모달 열기 CTA */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold border border-blue-400/50 shadow-md transition-colors"
      >
        미디어 검색 열기
      </button>
    </div>
  );
};

// ─── 전체화면 검색 모달 ───
export const MemeAndSfxSearchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const scenes = useProjectStore((s) => s.scenes);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunityMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeType, setActiveType] = useState<MediaType | undefined>(undefined);
  const [activeSource, setActiveSource] = useState<MediaSource | 'all'>('all');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'search' | 'favorites' | 'recent'>('search');
  const [favorites, setFavorites] = useState<CommunityMediaItem[]>(() => loadFromStorage(FAVORITES_KEY, []));
  const [recents, setRecents] = useState<CommunityMediaItem[]>(() => loadFromStorage(RECENT_KEY, []));
  const [previewItem, setPreviewItem] = useState<CommunityMediaItem | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preloadedRef = useRef(false);
  const searchSeqRef = useRef(0);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetScene = useMemo(() => {
    if (expandedSceneId) return scenes.find((s) => s.id === expandedSceneId);
    return scenes[0];
  }, [expandedSceneId, scenes]);

  const targetIndex = useMemo(() => {
    if (!targetScene) return -1;
    return scenes.indexOf(targetScene);
  }, [targetScene, scenes]);

  // 프리로드 + 포커스
  useEffect(() => {
    if (!preloadedRef.current) {
      preloadedRef.current = true;
      preloadAllMedia();
    }
    focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  // ESC 키 + 오디오 정리
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewItem) { setPreviewItem(null); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [onClose, previewItem]);

  const doSearch = useCallback(async (q: string, type?: MediaType, source?: MediaSource | 'all') => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    setIsLoading(true);
    setViewMode('search');
    const seq = ++searchSeqRef.current;
    try {
      const srcOpt = source === 'all' ? undefined : source;
      // 타입 필터 없으면 이미지/SFX 각각 검색 (SFX가 이미지에 밀리지 않도록)
      if (!type && !srcOpt) {
        const [images, sfx] = await Promise.all([
          searchMedia({ query: trimmed, type: 'image', limit: 48 }),
          searchMedia({ query: trimmed, type: 'sfx', limit: 24 }),
        ]);
        if (seq === searchSeqRef.current) setResults([...images, ...sfx]);
      } else {
        const items = await searchMedia({ query: trimmed, type, source: srcOpt, limit: 60 });
        if (seq === searchSeqRef.current) setResults(items);
      }
    } catch {
      if (seq === searchSeqRef.current) setResults([]);
    } finally {
      if (seq === searchSeqRef.current) setIsLoading(false);
    }
  }, []);

  const applyToScene = useCallback((item: CommunityMediaItem) => {
    if (!targetScene) {
      showToast('장면이 없습니다. 먼저 장면을 생성하세요.');
      return;
    }
    useProjectStore.getState().updateScene(targetScene.id, {
      imageUrl: item.type === 'image' ? item.url : targetScene.imageUrl,
      communityMediaItem: item,
    });
    setRecents((prev) => {
      const filtered = prev.filter((r) => r.id !== item.id);
      const updated = [item, ...filtered].slice(0, MAX_RECENT);
      saveToStorage(RECENT_KEY, updated);
      return updated;
    });
    const idx = scenes.indexOf(targetScene) + 1;
    showToast(`${item.type === 'image' ? '밈' : '효과음'} "${item.title}" → 장면 ${idx}에 적용`);
  }, [targetScene, scenes]);

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

  const handlePlayAudio = useCallback((e: React.MouseEvent, item: CommunityMediaItem) => {
    e.stopPropagation();
    if (playingAudioId === item.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
    }
    // SFX Lab: hotlink protection으로 직접 재생 불가 → 새 탭에서 열기
    if (item.source === 'sfx_lab') {
      window.open(item.url, '_blank', 'noopener');
      showToast('SFX Lab 사운드를 새 탭에서 재생합니다');
      return;
    }
    const audio = new Audio(item.url);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => {
      setPlayingAudioId(null);
      showToast('재생 실패 — 외부 서버 제한일 수 있습니다');
    };
    audio.play().catch(() => {
      setPlayingAudioId(null);
      showToast('재생 실패 — 외부 서버 제한일 수 있습니다');
    });
    audioRef.current = audio;
    setPlayingAudioId(item.id);
  }, [playingAudioId]);

  /** 빠른 카테고리 클릭 (토글) */
  const handleCategoryClick = useCallback((cat: typeof QUICK_CATEGORIES[number]) => {
    if (activeCategory === cat.query) {
      // 같은 카테고리 재클릭 → 해제
      setActiveCategory(null);
      setQuery('');
      setResults([]);
      inputRef.current?.focus();
    } else {
      setActiveCategory(cat.query);
      setQuery(cat.query);
      doSearch(cat.query, activeType, activeSource);
    }
  }, [activeCategory, activeType, activeSource, doSearch]);

  /** 소스 필터 클릭 시 타입 자동 연동 */
  const handleSourceClick = useCallback((id: MediaSource | 'all') => {
    setActiveSource(id);
    let newType = activeType;
    if (id === 'klipy' || id === 'irasutoya') newType = 'image';
    else if (id === 'myinstants' || id === 'sfx_lab') newType = 'sfx';
    else if (id === 'all') newType = undefined;
    setActiveType(newType);
    if (query.trim()) doSearch(query, newType, id);
  }, [activeType, query, doSearch]);

  /** 검색 + 필터 전체 초기화 */
  const resetSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setActiveType(undefined);
    setActiveSource('all');
    setActiveCategory(null);
    setViewMode('search');
    inputRef.current?.focus();
  }, []);

  const displayItems = viewMode === 'favorites' ? favorites
    : viewMode === 'recent' ? recents
    : results;

  const imageItems = displayItems.filter((r) => r.type === 'image');
  const gifItems = imageItems.filter((r) => r.format?.toLowerCase() === 'gif');
  const staticImageItems = imageItems.filter((r) => r.format?.toLowerCase() !== 'gif');
  const sfxItems = displayItems.filter((r) => r.type === 'sfx');

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/95 overflow-y-auto">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎨</span>
            <div>
              <h2 className="text-lg font-bold text-white">밈 · 짤 · 효과음 검색</h2>
              <p className="text-sm text-gray-500">
                KLIPY 34K · 이라스토야 23K · 효과음 2.1K
                {targetScene && (
                  <span className="ml-2 text-amber-400">→ 장면 {targetIndex + 1}에 적용</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 현재 적용된 미디어 표시 + 초기화 */}
            {targetScene?.communityMediaItem && (
              <button
                type="button"
                onClick={() => {
                  useProjectStore.getState().updateScene(targetScene.id, {
                    communityMediaItem: undefined,
                  });
                  showToast(`장면 ${targetIndex + 1}의 밈/효과음을 제거했습니다.`);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-red-600/10 text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                적용 해제
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base font-bold transition-colors"
            >
              닫기 X
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-5">
        {/* 검색 바 + 필터 */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSearch(query, activeType, activeSource); }}
                placeholder="한글 또는 영어로 검색 (예: 웃음, 폭발, 고양이, funny, explosion...)"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-5 py-3 pr-10 text-base text-white placeholder-gray-500 focus:border-amber-500/50 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={resetSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white transition-colors"
                  title="검색 초기화"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <button
              onClick={() => doSearch(query, activeType, activeSource)}
              disabled={isLoading || !query.trim()}
              className="px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-base font-bold rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  검색 중...
                </span>
              ) : '검색'}
            </button>
          </div>

          {/* 필터 행 */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* 뷰 모드 */}
            <div className="flex gap-1.5">
              {([
                { mode: 'search' as const, label: '검색', icon: '🔍', count: results.length },
                { mode: 'favorites' as const, label: '즐겨찾기', icon: '⭐', count: favorites.length },
                { mode: 'recent' as const, label: '최근 사용', icon: '🕐', count: recents.length },
              ]).map(({ mode, label, icon, count }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all whitespace-nowrap ${
                    viewMode === mode
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  {icon} {label}{count > 0 ? ` (${count})` : ''}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-gray-700" />

            {/* 타입 필터 */}
            <div className="flex gap-1.5">
              {([
                { type: undefined, label: '전체' },
                { type: 'image' as MediaType, label: '이미지/밈' },
                { type: 'sfx' as MediaType, label: '효과음' },
              ]).map(({ type, label }) => (
                <button
                  key={label}
                  onClick={() => {
                    setActiveType(type);
                    if (query.trim()) doSearch(query, type, activeSource);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all whitespace-nowrap ${
                    activeType === type
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-gray-700" />

            {/* 소스 필터 */}
            <div className="flex gap-1.5">
              {SOURCE_FILTERS.map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => handleSourceClick(id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                    activeSource === id
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {label} <span className="text-gray-600">{count}</span>
                </button>
              ))}
            </div>

            {/* 필터 초기화 (활성 필터가 있을 때만 표시) */}
            {(activeType !== undefined || activeSource !== 'all' || activeCategory || query.trim()) && (
              <>
                <div className="w-px h-6 bg-gray-700" />
                <button
                  onClick={resetSearch}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/10 text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-all whitespace-nowrap"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  초기화
                </button>
              </>
            )}
          </div>
        </div>

        {/* 빠른 카테고리 (항상 표시, 검색 결과 없을 때 확장) */}
        {viewMode === 'search' && (results.length === 0 || activeCategory) && !isLoading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400 font-bold">빠른 카테고리</p>
              {activeCategory && (
                <button
                  onClick={() => {
                    setActiveCategory(null);
                    setQuery('');
                    setResults([]);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600/10 text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  선택 해제
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat.query}
                  onClick={() => handleCategoryClick(cat)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                    activeCategory === cat.query
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-amber-300 hover:border-amber-500/40 hover:bg-gray-800/80'
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  <span className="font-bold">{cat.label}</span>
                </button>
              ))}
            </div>
            {!query.trim() && (
              <div className="text-center py-12">
                <span className="text-5xl block mb-3">🎨</span>
                <p className="text-gray-400 text-base">키워드를 입력하거나 카테고리를 선택하세요</p>
                <p className="text-gray-600 text-sm mt-1">60,000+ 밈 · 짤 · 일러스트 · 효과음 인덱스</p>
              </div>
            )}
          </div>
        )}

        {/* 빈 상태 */}
        {displayItems.length === 0 && !isLoading && viewMode === 'search' && query.trim() !== '' && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">🔍</span>
            <p className="text-gray-400 text-lg font-bold">검색 결과가 없습니다</p>
            <p className="text-gray-600 text-sm mt-2">한글/영어 모두 검색 가능합니다 (예: 웃음, 폭발, funny, explosion)</p>
            <p className="text-gray-600 text-xs mt-1">팁: 빠른 카테고리 버튼도 활용해보세요</p>
          </div>
        )}
        {/* 즐겨찾기/최근 사용 초기화 버튼 */}
        {viewMode === 'favorites' && favorites.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!confirm(`즐겨찾기 ${favorites.length}개를 전부 삭제하시겠습니까?`)) return;
                setFavorites([]);
                saveToStorage(FAVORITES_KEY, []);
                showToast('즐겨찾기가 초기화되었습니다.');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/10 text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              즐겨찾기 전체 삭제
            </button>
          </div>
        )}
        {viewMode === 'recent' && recents.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!confirm(`최근 사용 기록 ${recents.length}개를 전부 삭제하시겠습니까?`)) return;
                setRecents([]);
                saveToStorage(RECENT_KEY, []);
                showToast('최근 사용 기록이 초기화되었습니다.');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/10 text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              기록 전체 삭제
            </button>
          </div>
        )}

        {displayItems.length === 0 && viewMode === 'favorites' && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">⭐</span>
            <p className="text-gray-400 text-lg font-bold">즐겨찾기가 비어있습니다</p>
            <p className="text-gray-600 text-sm mt-2">검색 결과에서 ★를 눌러 추가하세요</p>
          </div>
        )}
        {displayItems.length === 0 && viewMode === 'recent' && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">🕐</span>
            <p className="text-gray-400 text-lg font-bold">최근 사용 기록이 없습니다</p>
            <p className="text-gray-600 text-sm mt-2">미디어를 선택하면 여기에 기록됩니다</p>
          </div>
        )}

        {/* GIF/움짤 결과 */}
        {gifItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-gray-300 flex items-center gap-2">
              <span>🎞</span> GIF / 움짤
              <span className="text-xs text-gray-600 font-normal">({gifItems.length})</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {gifItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreviewItem(item)}
                  className="group/card relative bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all"
                >
                  <div className="aspect-square relative">
                    <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/40 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover/card:opacity-100 bg-white/90 text-gray-900 text-sm font-bold px-3 py-1.5 rounded-lg transition-opacity shadow-lg">미리보기</span>
                    </div>
                    <button onClick={(e) => toggleFavorite(e, item)} className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full transition-all ${isFavorite(item.id) ? 'bg-amber-500 text-white shadow-md' : 'bg-black/60 text-gray-300 opacity-0 group-hover/card:opacity-100 hover:bg-amber-500 hover:text-white'}`}>
                      <span className="text-sm">{isFavorite(item.id) ? '★' : '☆'}</span>
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/70 text-[10px] text-gray-300 px-1.5 py-0.5 rounded font-bold">
                      {item.source === 'klipy' ? 'KLIPY' : item.source === 'irasutoya' ? 'IRASU' : item.source}
                    </span>
                    <span className="absolute bottom-1 right-1 bg-emerald-600/80 text-[10px] text-white px-1.5 py-0.5 rounded font-bold">GIF</span>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-gray-300 line-clamp-1 font-medium">{item.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 이미지(PNG/JPG/WEBP) 결과 */}
        {staticImageItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-gray-300 flex items-center gap-2">
              <span>🖼</span> 이미지 / 일러스트
              <span className="text-xs text-gray-600 font-normal">({staticImageItems.length})</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {staticImageItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreviewItem(item)}
                  className="group/card relative bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all"
                >
                  <div className="aspect-square relative">
                    <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/40 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover/card:opacity-100 bg-white/90 text-gray-900 text-sm font-bold px-3 py-1.5 rounded-lg transition-opacity shadow-lg">미리보기</span>
                    </div>
                    <button onClick={(e) => toggleFavorite(e, item)} className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full transition-all ${isFavorite(item.id) ? 'bg-amber-500 text-white shadow-md' : 'bg-black/60 text-gray-300 opacity-0 group-hover/card:opacity-100 hover:bg-amber-500 hover:text-white'}`}>
                      <span className="text-sm">{isFavorite(item.id) ? '★' : '☆'}</span>
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/70 text-[10px] text-gray-300 px-1.5 py-0.5 rounded font-bold">
                      {item.source === 'klipy' ? 'KLIPY' : item.source === 'irasutoya' ? 'IRASU' : item.source}
                    </span>
                    <span className="absolute bottom-1 right-1 bg-blue-600/80 text-[10px] text-white px-1.5 py-0.5 rounded font-bold">
                      {item.format?.toUpperCase() || 'IMG'}
                    </span>
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-gray-300 line-clamp-1 font-medium">{item.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 효과음 결과 */}
        {sfxItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-gray-300 flex items-center gap-2">
              <span>🔊</span> 효과음
              <span className="text-xs text-gray-600 font-normal">({sfxItems.length})</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sfxItems.map((item) => {
                const isSfxLab = item.source === 'sfx_lab';
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-gray-800 rounded-xl border border-gray-700 px-4 py-3 hover:border-amber-500/40 transition-all cursor-pointer group/sfx"
                    onClick={() => applyToScene(item)}
                  >
                    <button
                      onClick={(e) => handlePlayAudio(e, item)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                        isSfxLab
                          ? 'bg-gray-700 border-violet-500/50 text-violet-300 hover:bg-violet-900/40 hover:border-violet-400'
                          : playingAudioId === item.id
                            ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                            : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
                      }`}
                      title={isSfxLab ? '새 탭에서 듣기' : playingAudioId === item.id ? '정지' : '미리듣기'}
                    >
                      {isSfxLab ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      ) : playingAudioId === item.id ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium line-clamp-1">{item.title}</p>
                      <p className="text-xs text-gray-500">
                        {isSfxLab ? 'SFX Lab' : 'MyInstants'} · {item.tags.slice(0, 3).join(', ')}
                        {isSfxLab && <span className="ml-1 text-violet-400/60">(새 탭 재생)</span>}
                      </p>
                    </div>
                    <button
                      onClick={(e) => toggleFavorite(e, item)}
                      className={`flex-shrink-0 text-lg transition-colors ${
                        isFavorite(item.id) ? 'text-amber-400' : 'text-gray-600 opacity-0 group-hover/sfx:opacity-100 hover:text-amber-400'
                      }`}
                    >
                      {isFavorite(item.id) ? '★' : '☆'}
                    </button>
                    <span className="text-sm text-amber-400 opacity-0 group-hover/sfx:opacity-100 transition-opacity font-bold flex-shrink-0">
                      적용 →
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 로딩 */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-gray-600 border-t-amber-400 rounded-full animate-spin" />
              <span className="text-gray-500 text-sm">검색 중...</span>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 미리보기 오버레이 */}
      {previewItem && previewItem.type === 'image' && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-w-3xl w-full mx-4 bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 미리보기 이미지 */}
            <div className="relative bg-gray-950 flex items-center justify-center min-h-[300px] max-h-[70vh]">
              <img
                src={previewItem.url}
                alt={previewItem.title}
                className="max-w-full max-h-[70vh] object-contain"
              />
              {/* 소스 뱃지 */}
              <span className="absolute top-3 left-3 bg-black/70 text-xs text-gray-300 px-2 py-1 rounded-lg font-bold">
                {previewItem.source === 'klipy' ? 'KLIPY' : previewItem.source === 'irasutoya' ? 'IRASUTOYA' : previewItem.source}
              </span>
              {/* 포맷 뱃지 */}
              <span className="absolute top-3 right-3 bg-black/70 text-xs text-amber-400 px-2 py-1 rounded-lg font-bold">
                {previewItem.format?.toUpperCase()}
              </span>
            </div>

            {/* 하단 정보 + 액션 */}
            <div className="px-5 py-4 border-t border-gray-800">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-base text-white font-bold truncate">{previewItem.title}</p>
                  {previewItem.tags.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                      {previewItem.tags.slice(0, 8).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => toggleFavorite(e, previewItem)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                      isFavorite(previewItem.id)
                        ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-amber-300 hover:border-amber-500/50'
                    }`}
                  >
                    {isFavorite(previewItem.id) ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
                  </button>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => {
                      applyToScene(previewItem);
                      setPreviewItem(null);
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-sm font-bold transition-all shadow-md"
                  >
                    장면에 적용
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemeAndSfxPanel;
