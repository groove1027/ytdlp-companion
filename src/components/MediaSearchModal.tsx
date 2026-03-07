import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CommunityMediaItem, MediaType } from '../types';
import { searchMedia, preloadAllMedia } from '../services/mediaSearchService';

interface MediaSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: CommunityMediaItem) => void;
  initialQuery?: string;
  filterType?: MediaType;
}

const MediaSearchModal: React.FC<MediaSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialQuery = '',
  filterType,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CommunityMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeType, setActiveType] = useState<MediaType | undefined>(filterType);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preloadedRef = useRef(false);

  // Preload media index on first open
  useEffect(() => {
    if (isOpen && !preloadedRef.current) {
      preloadedRef.current = true;
      preloadAllMedia();
    }
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (initialQuery) {
        setQuery(initialQuery);
        handleSearch(initialQuery, activeType);
      }
    }
    return () => {
      // Stop audio on close
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSearch = useCallback(async (q: string, type?: MediaType) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    setIsLoading(true);
    try {
      const items = await searchMedia({ query: trimmed, type, limit: 30 });
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(query, activeType);
    }
  };

  const handleTypeToggle = (type: MediaType | undefined) => {
    setActiveType(type);
    if (query.trim()) handleSearch(query, type);
  };

  const handlePlayAudio = (e: React.MouseEvent, item: CommunityMediaItem) => {
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
  };

  const handleSelect = (item: CommunityMediaItem) => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingAudioId(null);
    onSelect(item);
    onClose();
  };

  if (!isOpen) return null;

  const imageResults = results.filter(r => r.type === 'image');
  const sfxResults = results.filter(r => r.type === 'sfx');
  const showImages = !activeType || activeType === 'image';
  const showSfx = !activeType || activeType === 'sfx';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-base">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            미디어 검색
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1">✕</button>
        </div>

        {/* Search Bar */}
        <div className="px-5 py-3 border-b border-gray-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="키워드 검색 (예: 놀람, 박수, 웃음, 고양이...)"
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
            />
            <button
              onClick={() => handleSearch(query, activeType)}
              disabled={isLoading}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
            >
              {isLoading ? '...' : '검색'}
            </button>
          </div>
          {/* Type Filter */}
          <div className="flex gap-2 mt-2">
            {[
              { type: undefined, label: '전체' },
              { type: 'image' as MediaType, label: '이미지/짤' },
              { type: 'sfx' as MediaType, label: '효과음' },
            ].map(({ type, label }) => (
              <button
                key={label}
                onClick={() => handleTypeToggle(type)}
                className={`px-3 py-1 text-xs rounded-full border font-bold transition-all ${
                  activeType === type
                    ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-5">
          {results.length === 0 && !isLoading && query.trim() && (
            <div className="text-center text-gray-500 py-12">
              <span className="text-3xl block mb-2">🔍</span>
              검색 결과가 없습니다
            </div>
          )}
          {results.length === 0 && !isLoading && !query.trim() && (
            <div className="text-center text-gray-500 py-12">
              <span className="text-3xl block mb-2">🎨</span>
              키워드를 입력하고 검색하세요<br />
              <span className="text-xs text-gray-600 mt-1 block">밈, GIF, 일러스트, 효과음 60,000+ 인덱스</span>
            </div>
          )}

          {/* Image Results */}
          {showImages && imageResults.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-1">
                <span>🖼️</span> 이미지/짤 ({imageResults.length})
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {imageResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="group/card relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/10"
                  >
                    <div className="aspect-square relative">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/30 transition-all flex items-center justify-center">
                        <span className="opacity-0 group-hover/card:opacity-100 text-white text-xl transition-opacity">+</span>
                      </div>
                    </div>
                    <div className="px-1.5 py-1">
                      <span className="text-[11px] text-gray-400 line-clamp-1">{item.title}</span>
                      <span className="text-[10px] text-gray-600 block">{item.source}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SFX Results */}
          {showSfx && sfxResults.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-1">
                <span>🔊</span> 효과음 ({sfxResults.length})
              </h3>
              <div className="space-y-1.5">
                {sfxResults.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-gray-800 rounded-lg border border-gray-700 px-3 py-2 hover:border-cyan-500/50 transition-all cursor-pointer group/sfx"
                    onClick={() => handleSelect(item)}
                  >
                    <button
                      onClick={(e) => handlePlayAudio(e, item)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
                        playingAudioId === item.id
                          ? 'bg-cyan-600 border-cyan-400 text-white animate-pulse'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                      }`}
                      title={playingAudioId === item.id ? '정지' : '미리듣기'}
                    >
                      {playingAudioId === item.id ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium line-clamp-1">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.source} · {item.tags.slice(0, 2).join(', ')}</span>
                    </div>
                    <span className="text-xs text-cyan-400 opacity-0 group-hover/sfx:opacity-100 transition-opacity font-bold flex-shrink-0">
                      선택
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaSearchModal;
