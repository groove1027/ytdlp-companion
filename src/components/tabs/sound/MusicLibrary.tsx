import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { showToast } from '../../../stores/uiStore';
import {
  extendMusic, pollMusicStatus, groupMusicByDate,
  getTimestampedLyrics,
} from '../../../services/musicService';
import type { GeneratedMusic, SunoModel, TimestampedWord } from '../../../types';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { logger } from '../../../services/LoggerService';
import { monitoredFetch } from '../../../services/apiService';

type FilterTab = 'all' | 'completed' | 'favorites';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function sanitizeFileName(value: string, fallback: string): string {
  const sanitized = value.replace(/[/\\?%*:|"<>]/g, '').trim();
  return sanitized || fallback;
}

function getAudioExtension(blob: Blob, url: string): string {
  const mimeType = blob.type.toLowerCase();
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'mp3';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave') return 'wav';
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return 'm4a';
  if (mimeType === 'audio/ogg') return 'ogg';

  const matchedExt = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1]?.toLowerCase();
  return matchedExt || 'mp3';
}

const FILTERS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'completed', label: '완료' }, { id: 'favorites', label: '즐겨찾기' },
];

// ========== 곡 연장 모달 ==========
const ExtendModal: React.FC<{
  track: GeneratedMusic;
  onClose: () => void;
}> = ({ track, onClose }) => {
  const addToLibrary = useSoundStudioStore((s) => s.addToLibrary);
  const [continueAt, setContinueAt] = useState(Math.max(0, track.duration - 10));
  const [model, setModel] = useState<SunoModel>('V5');
  const [extPrompt, setExtPrompt] = useState('');
  const [extStyle, setExtStyle] = useState(track.tags || '');
  const [extTitle, setExtTitle] = useState(`${track.title} (Extended)`);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const elapsedExtend = useElapsedTimer(isRunning);

  const handleExtend = useCallback(async () => {
    logger.trackAction('음악 연장 시작', track.title);
    if (!track.audioId || isRunning) return;
    setIsRunning(true);
    setError('');
    try {
      const taskId = await extendMusic({
        audioId: track.audioId,
        continueAt,
        model,
        prompt: extPrompt || undefined,
        style: extStyle || undefined,
        title: extTitle || undefined,
      });
      const result = await pollMusicStatus(taskId);
      const grouped = groupMusicByDate([result]);
      if (grouped.length > 0) addToLibrary(grouped[0]);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }, [track, continueAt, model, extPrompt, extStyle, extTitle, isRunning, addToLibrary, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-600 p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">🔄 곡 연장</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-lg">&times;</button>
        </div>
        <p className="text-xs text-gray-400">원본: <span className="text-gray-200">{track.title}</span> ({formatTime(track.duration)})</p>

        {!track.audioId && (
          <p className="text-xs text-red-400">이 트랙은 audioId가 없어 연장할 수 없습니다.</p>
        )}

        <div>
          <label className="text-xs text-gray-400 font-semibold block mb-1">연장 시작점 (초)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={track.duration} step={1} value={continueAt}
              onChange={(e) => setContinueAt(Number(e.target.value))} className="flex-1 accent-purple-500" />
            <span className="text-xs text-gray-300 w-14 text-right">{formatTime(continueAt)}</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-semibold block mb-1">모델</label>
          <select value={model} onChange={(e) => setModel(e.target.value as SunoModel)}
            className="w-full px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
            <option value="V5">V5</option>
            <option value="V4_5PLUS">V4.5+</option>
            <option value="V4_5">V4.5</option>
            <option value="V4">V4</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-semibold block mb-1">연장 부분 제목</label>
          <input type="text" value={extTitle} onChange={(e) => setExtTitle(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
        </div>

        <div>
          <label className="text-xs text-gray-400 font-semibold block mb-1">스타일 태그</label>
          <input type="text" value={extStyle} onChange={(e) => setExtStyle(e.target.value)}
            placeholder="원본 스타일 유지 또는 변경"
            className="w-full px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
        </div>

        <div>
          <label className="text-xs text-gray-400 font-semibold block mb-1">추가 가사/설명 (선택)</label>
          <textarea value={extPrompt} onChange={(e) => setExtPrompt(e.target.value)}
            placeholder="연장 부분에 원하는 가사나 방향..." rows={2}
            className="w-full px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button type="button" onClick={handleExtend}
          disabled={!track.audioId || isRunning}
          className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500
            disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2">
          {isRunning ? (<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 연장 중...{elapsedExtend > 0 && <span className="text-xs text-white/60 tabular-nums">{formatElapsed(elapsedExtend)}</span>}</>) : '곡 연장 시작'}
        </button>
      </div>
    </div>
  );
};

// ========== 가사 보기 모달 ==========
const LyricsModal: React.FC<{
  track: GeneratedMusic;
  onClose: () => void;
}> = ({ track, onClose }) => {
  const [words, setWords] = useState<TimestampedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plainLyrics, setPlainLyrics] = useState(track.lyrics || '');

  useEffect(() => {
    if (!track.audioId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await getTimestampedLyrics(track.id, track.audioId!);
        if (!cancelled) setWords(result);
      } catch (e) {
        logger.trackSwallowedError('MusicLibrary:getTimestampedLyrics', e);
        // 타임스탬프 가사 실패 → 일반 가사만 표시
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [track]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-600 p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">📝 가사</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-lg">&times;</button>
        </div>
        <p className="text-xs text-gray-400">{track.title}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="w-5 h-5 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" />
          </div>
        ) : words.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {words.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-[10px] text-gray-600 font-mono shrink-0 w-12 text-right mt-0.5">{formatTime(w.startS)}</span>
                <span className="text-gray-300">{w.word}</span>
              </div>
            ))}
          </div>
        ) : plainLyrics ? (
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto leading-relaxed">{plainLyrics}</pre>
        ) : (
          <p className="text-sm text-gray-500 text-center py-6">가사 정보가 없습니다.</p>
        )}
      </div>
    </div>
  );
};

// ========== 트랙 상세 보기 모달 ==========
const TrackDetailModal: React.FC<{
  track: GeneratedMusic;
  groupTitle: string;
  onClose: () => void;
  onPlay: () => void;
  onExtend: () => void;
  onLyrics: () => void;
  onDownload: () => void;
  isPlaying: boolean;
}> = ({ track, groupTitle, onClose, onPlay, onExtend, onLyrics, onDownload, isPlaying }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-[420px]" style={{ animation: 'fadeIn 0.2s ease-out' }} onClick={(e) => e.stopPropagation()}>
        {/* 닫기 버튼 */}
        <button type="button" onClick={onClose}
          className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full bg-gray-700/90 border border-gray-500/50 text-gray-300 hover:text-white hover:bg-gray-600 flex items-center justify-center transition-all shadow-lg text-lg leading-none">
          &times;
        </button>

        {/* 앨범 커버 — 1:1 원본 비율, 라운드 코너 */}
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60 group">
          {track.imageUrl ? (
            <img src={track.imageUrl} alt={track.title} className="w-full h-full object-contain bg-black" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-950 via-fuchsia-950 to-gray-900 flex items-center justify-center">
              <span className="text-8xl opacity-30 select-none">🎵</span>
            </div>
          )}
          {/* 하단 그라데이션 오버레이 */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
          {/* 재생 버튼 오버레이 */}
          <button type="button" onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
            <div className="w-20 h-20 rounded-full bg-fuchsia-500/90 backdrop-blur-md flex items-center justify-center shadow-xl shadow-fuchsia-500/30 hover:scale-110 transition-transform duration-200">
              {isPlaying ? (
                <svg className="w-8 h-8" viewBox="0 0 12 12" fill="white"><rect x="1.5" y="1" width="3" height="10" rx="0.8" /><rect x="7.5" y="1" width="3" height="10" rx="0.8" /></svg>
              ) : (
                <svg className="w-8 h-8 ml-1" viewBox="0 0 12 12" fill="white"><polygon points="2,0.5 11.5,6 2,11.5" /></svg>
              )}
            </div>
          </button>
          {/* 커버 위 트랙 제목 (하단 오버레이) */}
          <div className="absolute inset-x-0 bottom-0 p-5 pointer-events-none">
            <h3 className="text-xl font-extrabold text-white drop-shadow-lg leading-tight">{track.title}</h3>
            <p className="text-sm text-white/60 mt-1">{groupTitle}</p>
          </div>
        </div>

        {/* 하단 카드 — 메타 + 액션 */}
        <div className="mt-3 bg-gray-800/95 backdrop-blur-md rounded-2xl border border-gray-700/60 p-4 space-y-3.5 shadow-xl">
          {/* 메타 칩 */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 bg-gray-700/50 text-gray-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-gray-600/40">
              <svg className="w-3 h-3 text-fuchsia-400" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /></svg>
              {formatTime(track.duration)}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-gray-700/50 text-gray-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-gray-600/40">
              {track.model || 'Suno'}
            </span>
            {track.tags && (
              <span className="inline-flex items-center bg-purple-900/30 text-purple-300 text-xs font-medium px-2.5 py-1 rounded-full border border-purple-500/20 max-w-[220px] truncate">
                {track.tags}
              </span>
            )}
          </div>

          {track.audioId && (
            <p className="text-[10px] text-gray-500 font-mono truncate px-0.5" title={track.audioId}>
              ID: {track.audioId}
            </p>
          )}

          {/* 액션 버튼 — 주요 */}
          <div className="flex gap-2">
            <button type="button" onClick={onPlay}
              className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-fuchsia-600/20 flex items-center justify-center gap-2">
              {isPlaying ? (
                <><svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="1.5" y="1" width="3" height="10" rx="0.8" /><rect x="7.5" y="1" width="3" height="10" rx="0.8" /></svg> 일시정지</>
              ) : (
                <><svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 12 12" fill="white"><polygon points="2,0.5 11.5,6 2,11.5" /></svg> 재생</>
              )}
            </button>
            <button type="button" onClick={onDownload} disabled={!track.audioUrl}
              className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-bold border border-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 14h10" /></svg>
            </button>
          </div>

          {/* 액션 버튼 — 보조 */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onExtend} disabled={!track.audioId}
              className="py-2 bg-gray-700/40 hover:bg-gray-700/70 text-gray-300 hover:text-white rounded-xl text-xs font-semibold border border-gray-600/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              <span className="text-sm">🔄</span> 곡 연장
            </button>
            <button type="button" onClick={onLyrics}
              className="py-2 bg-gray-700/40 hover:bg-gray-700/70 text-gray-300 hover:text-white rounded-xl text-xs font-semibold border border-gray-600/40 transition-all flex items-center justify-center gap-1.5">
              <span className="text-sm">📝</span> 가사 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== 메인 라이브러리 ==========
const MusicLibrary: React.FC = () => {
  const musicLibrary = useSoundStudioStore((s) => s.musicLibrary);
  const removeFromLibrary = useSoundStudioStore((s) => s.removeFromLibrary);
  const toggleFavorite = useSoundStudioStore((s) => s.toggleFavorite);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState<GeneratedMusic | null>(null);
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [currentTime, setCurrentTime] = useState(0);
  const isSeekingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const [showVolume, setShowVolume] = useState(false);
  const volumeBtnRef = useRef<HTMLDivElement | null>(null);

  // 액션 메뉴
  const [menuTrack, setMenuTrack] = useState<{ track: GeneratedMusic; groupTitle: string } | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // 모달
  const [extendTarget, setExtendTarget] = useState<GeneratedMusic | null>(null);
  const [lyricsTarget, setLyricsTarget] = useState<GeneratedMusic | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ track: GeneratedMusic; groupTitle: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const allTracks = useMemo(() => musicLibrary.flatMap((g) => g.tracks), [musicLibrary]);
  const filteredLibrary = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return musicLibrary.map((group) => {
      let tracks = group.tracks;
      if (filter === 'favorites') tracks = tracks.filter((t) => t.isFavorite);
      else if (filter === 'completed') tracks = tracks.filter((t) => t.audioUrl);
      if (q) tracks = tracks.filter((t) => t.title.toLowerCase().includes(q));
      return { ...group, tracks };
    }).filter((g) => g.tracks.length > 0);
  }, [musicLibrary, filter, searchQuery]);

  // 트랙 변경 시 재생
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audioUrl) return;
    audio.src = currentTrack.audioUrl;
    audio.volume = volume / 100;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  const prevTrackRef = useRef(currentTrack);
  useEffect(() => {
    if (prevTrackRef.current !== currentTrack) { prevTrackRef.current = currentTrack; return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [isPlaying, currentTrack]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100; }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    registerAudio(audio);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onTimeUpdate = () => { if (!isSeekingRef.current) setCurrentTime(audio.currentTime); };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => { audio.removeEventListener('ended', onEnded); audio.removeEventListener('timeupdate', onTimeUpdate); audio.pause(); audio.src = ''; unregisterAudio(audio); };
  }, []);

  // 메뉴 외부 클릭 닫기 + 뷰포트 경계 보정
  useEffect(() => {
    if (!menuTrack) return;
    const close = () => setMenuTrack(null);
    window.addEventListener('click', close);
    // 뷰포트 경계 체크 — 메뉴가 화면 밖으로 넘어가면 위치 보정
    requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let { x, y } = menuPos;
      if (rect.right > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
      if (rect.bottom > window.innerHeight - 8) y = Math.max(8, y - rect.height - 8);
      if (x < 8) x = 8;
      if (x !== menuPos.x || y !== menuPos.y) setMenuPos({ x, y });
    });
    return () => window.removeEventListener('click', close);
  }, [menuTrack, menuPos]);

  // 볼륨 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!showVolume) return;
    const close = (e: MouseEvent) => {
      if (volumeBtnRef.current?.contains(e.target as Node)) return;
      setShowVolume(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showVolume]);

  const seekToRatio = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const dur = currentTrack.duration || audio.duration || 0;
    if (dur > 0) {
      audio.currentTime = Math.max(0, Math.min(dur, ratio * dur));
      setCurrentTime(audio.currentTime);
    }
  }, [currentTrack]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = seekBarRef.current;
    if (!bar) return;
    isSeekingRef.current = true;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToRatio(ratio);

    const onMove = (ev: MouseEvent) => {
      const r = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      seekToRatio(r);
    };
    const onUp = () => {
      isSeekingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [seekToRatio]);

  const handlePlayTrack = useCallback((track: GeneratedMusic, groupTitle: string) => {
    if (currentTrack?.id === track.id) setIsPlaying(!isPlaying);
    else { setCurrentTrack(track); setCurrentGroup(groupTitle); setIsPlaying(true); setCurrentTime(0); }
  }, [currentTrack, isPlaying]);

  const navigate = useCallback((dir: -1 | 1) => {
    if (!currentTrack) return;
    const idx = allTracks.findIndex((t) => t.id === currentTrack.id) + dir;
    if (idx >= 0 && idx < allTracks.length) { setCurrentTrack(allTracks[idx]); setIsPlaying(true); }
  }, [currentTrack, allTracks]);

  const handleToggleFavorite = useCallback((groupTitle: string, trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(groupTitle, trackId);
  }, [toggleFavorite]);

  const handleRemoveGroup = useCallback((groupTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromLibrary(groupTitle);
    if (currentGroup === groupTitle) { setCurrentTrack(null); setIsPlaying(false); }
  }, [removeFromLibrary, currentGroup]);

  const handleContextMenu = useCallback((e: React.MouseEvent, track: GeneratedMusic, groupTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuTrack({ track, groupTitle });
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent, track: GeneratedMusic, groupTitle: string) => {
    e.stopPropagation();
    setMenuTrack({ track, groupTitle });
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleDownload = useCallback((track: GeneratedMusic) => {
    if (!track.audioUrl) return;
    const a = document.createElement('a');
    a.href = track.audioUrl;
    a.download = `${track.title}.mp3`;
    a.click();
  }, []);

  const handleDownloadGroupZip = useCallback(async (groupTitle: string, tracks: GeneratedMusic[]) => {
    const downloadableTracks = tracks.filter((track) => !!track.audioUrl);
    if (downloadableTracks.length === 0) {
      showToast('다운로드할 음악 파일이 없습니다.');
      return;
    }

    try {
      // [v2.5] 컴패니언 ZIP 생성 — 브라우저 메모리 사용 0
      const { createZipViaCompanion } = await import('../../../services/companion/zipService');
      const files = downloadableTracks.map((track, i) => {
        const url = track.audioUrl as string;
        const ext = url.includes('.mp3') ? 'mp3' : url.includes('.wav') ? 'wav' : url.includes('.ogg') ? 'ogg' : 'mp3';
        const fileName = `${String(i + 1).padStart(2, '0')}_${sanitizeFileName(track.title, `track-${i + 1}`)}.${ext}`;
        return { url, filename: fileName };
      });

      const zipBlob = await createZipViaCompanion(files);
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${sanitizeFileName(groupTitle, 'music-library')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 3000);
      showToast(`${downloadableTracks.length}곡 ZIP 다운로드를 시작했습니다.`);
    } catch (e) {
      logger.trackSwallowedError('MusicLibrary:downloadGroupZip', e);
      showToast(`ZIP 다운로드 실패: ${e instanceof Error ? e.message : String(e)}`, 5000);
    }
  }, []);

  // BGM 선택
  const bgmAudioUrl = useEditRoomStore((s) => s.bgmTrack.audioUrl);

  const handleSelectAsBgm = useCallback((track: GeneratedMusic, groupTitle: string) => {
    if (!track.audioUrl) return;
    useEditRoomStore.getState().setBgmTrack({
      audioUrl: track.audioUrl,
      trackTitle: `${groupTitle} - ${track.title}`,
    });
    showToast(`"${track.title}" BGM으로 설정됨`);
  }, []);

  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-5 space-y-5 flex flex-col">
      <audio ref={audioRef} preload="metadata" />

      {/* Player */}
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 space-y-3">
        <div className="flex items-start gap-3">
          {/* 커버 아트 */}
          {currentTrack?.imageUrl && (
            <img src={currentTrack.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{currentTrack?.title ?? '재생 중인 트랙 없음'}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{currentTrack ? formatTime(currentTrack.duration) : '--:--'}</span>
              {currentTrack?.tags && <span className="truncate">· {currentTrack.tags}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="2" height="12" rx="0.5" /><polygon points="14,2 5,8 14,14" /></svg>
          </button>
          <button type="button" onClick={() => currentTrack && setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-colors shadow-lg">{isPlaying ? (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>) : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}</button>
          <button type="button" onClick={() => navigate(1)} className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="13" y="2" width="2" height="12" rx="0.5" /><polygon points="2,2 11,8 2,14" /></svg>
          </button>
        </div>
        {/* Seek bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono w-10 text-right shrink-0">{currentTrack ? formatTime(currentTime) : '--:--'}</span>
          <div ref={seekBarRef} onMouseDown={handleSeekMouseDown}
            className="flex-1 h-1.5 bg-gray-700 rounded-full cursor-pointer relative group">
            <div className="h-full bg-purple-500 rounded-full transition-[width] duration-100"
              style={{ width: `${currentTrack ? Math.min(100, (currentTime / (currentTrack.duration || 1)) * 100) : 0}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${currentTrack ? Math.min(100, (currentTime / (currentTrack.duration || 1)) * 100) : 0}% - 6px)` }} />
          </div>
          <span className="text-xs text-gray-500 font-mono w-10 shrink-0">{currentTrack ? formatTime(currentTrack.duration) : '--:--'}</span>
        </div>
        {/* Volume — 우측 미니멀 버튼 + 세로 팝업 */}
        <div className="flex justify-end">
          <div className="relative" ref={volumeBtnRef}>
            <button type="button" onClick={() => setShowVolume(!showVolume)}
              className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors">
              {volume === 0 ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><polygon points="2,5 5,5 9,2 9,14 5,11 2,11" /><line x1="12" y1="5" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="15" y1="5" x2="12" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <polygon points="2,5 5,5 9,2 9,14 5,11 2,11" />
                  {volume > 30 && <path d="M11,5.5 Q13,8 11,10.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
                  {volume > 65 && <path d="M12.5,3.5 Q15.5,8 12.5,12.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
                </svg>
              )}
            </button>
            {showVolume && (
              <div className="absolute bottom-full right-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 shadow-xl z-20 flex flex-col items-center gap-2"
                onMouseDown={(e) => e.stopPropagation()}>
                <span className="text-[10px] text-gray-400 font-mono tabular-nums">{volume}%</span>
                <div className="relative h-28 w-5 flex items-center justify-center">
                  <input type="range" min={0} max={100} value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="accent-purple-500 absolute"
                    style={{ width: '112px', transform: 'rotate(-90deg)', transformOrigin: 'center center' }} />
                </div>
                <button type="button" onClick={() => setVolume(volume === 0 ? 80 : 0)}
                  className="text-[10px] text-gray-500 hover:text-white transition-colors">{volume === 0 ? 'ON' : 'MUTE'}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Library header */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">음악 라이브러리</h3>
          <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">{allTracks.length}곡</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">트랙을 클릭하면 재생, 우클릭 또는 ⋯ 버튼으로 액션 메뉴</p>
      </div>

      {/* Search */}
      <div className="relative">
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="트랙 검색..."
          className="w-full px-3 py-2 pl-8 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs">&#128269;</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {FILTERS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${filter === tab.id ? 'bg-purple-600/20 text-purple-300 border-purple-500/50' : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Track groups */}
      <div className="flex-1 overflow-y-auto max-h-[360px] space-y-4">
        {filteredLibrary.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {musicLibrary.length === 0 ? '아직 생성된 음악이 없습니다. 왼쪽 패널에서 BGM을 만들어보세요!' : '검색 결과가 없습니다.'}
          </div>
        ) : filteredLibrary.map((group) => (
          <div key={group.groupTitle} className="space-y-1">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs text-gray-400 font-semibold">{group.groupTitle}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">{group.tracks.length}곡</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); void handleDownloadGroupZip(group.groupTitle, group.tracks); }}
                  className="text-xs text-gray-600 hover:text-purple-300 transition-colors" title="그룹 ZIP 다운로드">ZIP</button>
                <button type="button" onClick={(e) => handleRemoveGroup(group.groupTitle, e)}
                  className="text-xs text-gray-600 hover:text-red-400 transition-colors" title="그룹 삭제">&#128465;</button>
              </div>
            </div>
            {group.tracks.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div key={track.id}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left ${isCurrent ? 'bg-purple-600/15 border border-purple-500/30' : 'hover:bg-gray-700/30 border border-transparent'}`}
                  onContextMenu={(e) => handleContextMenu(e, track, group.groupTitle)}>
                  {/* 커버 썸네일 — 클릭 시 상세 모달 */}
                  {track.imageUrl ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDetailTarget({ track, groupTitle: group.groupTitle }); }}
                      className="shrink-0 w-8 h-8 rounded overflow-hidden hover:ring-2 hover:ring-purple-500/50 transition-all cursor-pointer">
                      <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDetailTarget({ track, groupTitle: group.groupTitle }); }}
                      className={`text-xs shrink-0 w-8 h-8 rounded bg-gray-800 flex items-center justify-center hover:ring-2 hover:ring-purple-500/50 transition-all cursor-pointer ${isCurrent && isPlaying ? 'text-purple-400' : 'text-gray-500'}`}>
                      {isCurrent && isPlaying ? '&#128266;' : (<svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>)}
                    </button>
                  )}

                  {/* 트랙 정보 - 클릭으로 재생 */}
                  <button type="button" onClick={() => handlePlayTrack(track, group.groupTitle)}
                    className="flex-1 min-w-0 text-left">
                    <span className="text-sm text-gray-200 truncate block">
                      {track.title}
                      {bgmAudioUrl && bgmAudioUrl === track.audioUrl && (
                        <span className="ml-1.5 text-[10px] bg-green-800 text-green-300 px-1.5 py-0.5 rounded font-semibold align-middle">BGM</span>
                      )}
                    </span>
                    {track.tags && <span className="text-[10px] text-gray-500 truncate block">{track.tags}</span>}
                  </button>

                  {/* 즐겨찾기 */}
                  <button type="button" onClick={(e) => handleToggleFavorite(group.groupTitle, track.id, e)}
                    className={`text-xs shrink-0 transition-colors ${track.isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}>
                    {track.isFavorite ? '\u2605' : '\u2606'}
                  </button>

                  <span className="text-xs text-gray-600 font-mono shrink-0">{formatTime(track.duration)}</span>

                  {/* 더보기 버튼 */}
                  <button type="button" onClick={(e) => handleMoreClick(e, track, group.groupTitle)}
                    className="text-gray-500 hover:text-white text-sm shrink-0 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-700/50 transition-colors"
                    title="더보기">⋯</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 컨텍스트 메뉴 */}
      {menuTrack && (
        <div ref={menuRef} className="fixed z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1.5 min-w-[180px] backdrop-blur-sm"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}>
          <button type="button"
            onClick={() => { setExtendTarget(menuTrack.track); setMenuTrack(null); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
            🔄 곡 연장
          </button>
          <button type="button"
            onClick={() => {
              useSoundStudioStore.getState().setVocalSepTarget(menuTrack.track);
              useSoundStudioStore.getState().setMusicStudioTab('tools');
              setMenuTrack(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
            ♻️ 보컬/MR 분리
          </button>
          <button type="button"
            onClick={() => { setLyricsTarget(menuTrack.track); setMenuTrack(null); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
            📝 가사 보기
          </button>
          <button type="button"
            onClick={() => { handleDownload(menuTrack.track); setMenuTrack(null); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700/50 transition-colors flex items-center gap-2">
            ⬇️ 다운로드
          </button>
          <button type="button"
            onClick={() => { handleSelectAsBgm(menuTrack.track, menuTrack.groupTitle); setMenuTrack(null); }}
            disabled={!menuTrack.track.audioUrl}
            className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
              bgmAudioUrl === menuTrack.track.audioUrl
                ? 'text-green-400 hover:bg-green-900/20'
                : 'text-gray-300 hover:bg-gray-700/50'
            } disabled:opacity-40 disabled:cursor-not-allowed`}>
            {bgmAudioUrl === menuTrack.track.audioUrl ? '✅ BGM 선택됨' : '🎬 BGM으로 선택'}
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button type="button"
            onClick={() => {
              removeFromLibrary(menuTrack.groupTitle);
              if (currentGroup === menuTrack.groupTitle) { setCurrentTrack(null); setIsPlaying(false); }
              setMenuTrack(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-2">
            🗑️ 삭제
          </button>
        </div>
      )}

      {/* 모달들 */}
      {extendTarget && <ExtendModal track={extendTarget} onClose={() => setExtendTarget(null)} />}
      {lyricsTarget && <LyricsModal track={lyricsTarget} onClose={() => setLyricsTarget(null)} />}
      {detailTarget && (
        <TrackDetailModal
          track={detailTarget.track}
          groupTitle={detailTarget.groupTitle}
          onClose={() => setDetailTarget(null)}
          onPlay={() => handlePlayTrack(detailTarget.track, detailTarget.groupTitle)}
          onExtend={() => { setExtendTarget(detailTarget.track); setDetailTarget(null); }}
          onLyrics={() => { setLyricsTarget(detailTarget.track); setDetailTarget(null); }}
          onDownload={() => handleDownload(detailTarget.track)}
          isPlaying={currentTrack?.id === detailTarget.track.id && isPlaying}
        />
      )}
    </div>
  );
};

export default MusicLibrary;
