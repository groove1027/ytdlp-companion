import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { logger } from '../../../services/LoggerService';
import type { BgmConfig, GeneratedMusic, AudioMasterPreset, CompressorBandSettings, TrackMixerConfig, RenderSettings, AudioTrackId } from '../../../types';

const AUDIO_PRESETS_KEY = 'AUDIO_USER_PRESETS';
const MAX_PRESETS = 10;

interface AudioPresetData {
  bgmTrack: Partial<BgmConfig>;
  trackMixer: Record<string, TrackMixerConfig>;
  sfxVolume: number;
  renderSettings: RenderSettings;
}

interface SavedAudioPreset {
  id: string;
  name: string;
  data: AudioPresetData;
  createdAt: number;
}

function loadAudioPresets(): SavedAudioPreset[] {
  try {
    const raw = localStorage.getItem(AUDIO_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { logger.trackSwallowedError('BgmOverlayPanel:loadAudioPresets', e); return []; }
}

function saveAudioPresets(presets: SavedAudioPreset[]): void {
  localStorage.setItem(AUDIO_PRESETS_KEY, JSON.stringify(presets));
}

const MASTER_PRESETS: { id: AudioMasterPreset; label: string; desc: string }[] = [
  { id: 'none', label: '없음', desc: '원본 그대로' },
  { id: 'broadcast', label: '방송', desc: '멀티밴드 컴프레서 + 리미터' },
  { id: 'podcast', label: '팟캐스트', desc: '보이스 부스트 + 디에서' },
  { id: 'music', label: '뮤직', desc: '넓은 다이나믹 레인지' },
  { id: 'cinema', label: '시네마', desc: '서라운드 + 리버브' },
  { id: 'loudness', label: '라우드니스', desc: '-14 LUFS 표준화' },
];

const BAND_LABELS = [
  { name: '저역 (Low)', freq: '20-200Hz', color: 'text-red-400' },
  { name: '중저역 (Low-Mid)', freq: '200-2kHz', color: 'text-orange-400' },
  { name: '중고역 (Hi-Mid)', freq: '2k-6kHz', color: 'text-yellow-400' },
  { name: '고역 (High)', freq: '6k-20kHz', color: 'text-cyan-400' },
];

const DEFAULT_BANDS: CompressorBandSettings[] = [
  { threshold: -24, ratio: 3, attack: 10, release: 100, gain: 2 },
  { threshold: -20, ratio: 2.5, attack: 5, release: 80, gain: 1 },
  { threshold: -18, ratio: 2, attack: 3, release: 60, gain: 0 },
  { threshold: -16, ratio: 2, attack: 1, release: 40, gain: -1 },
];

/** 멀티밴드 컴프레서 상세 옵션 패널 */
const MultibandCompressorPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);

  const bands = bgmTrack.compressorBands ?? DEFAULT_BANDS;

  const updateBand = (idx: number, key: keyof CompressorBandSettings, value: number) => {
    const newBands = bands.map((b, i) => i === idx ? { ...b, [key]: value } : b);
    setBgmTrack({ compressorBands: newBands });
  };

  const resetToDefault = () => setBgmTrack({ compressorBands: DEFAULT_BANDS.map(b => ({ ...b })) });

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors"
      >
        <span>{isOpen ? '▼' : '▶'}</span>
        <span>멀티밴드 컴프레서 상세</span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3 bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
          {/* 비주얼 EQ 바 */}
          <div className="flex items-end gap-1 h-16 px-1">
            {bands.map((band, idx) => {
              const barHeight = Math.max(8, ((band.gain + 12) / 24) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-t transition-all ${
                      idx === 0 ? 'bg-red-500/60' : idx === 1 ? 'bg-orange-500/60' : idx === 2 ? 'bg-yellow-500/60' : 'bg-cyan-500/60'
                    }`}
                    style={{ height: `${barHeight}%` }}
                  />
                  <span className="text-[8px] text-gray-600 truncate w-full text-center">
                    {BAND_LABELS[idx].freq.split('-')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 밴드별 상세 설정 */}
          {bands.map((band, idx) => (
            <div key={idx} className="space-y-1">
              <p className={`text-xs font-bold ${BAND_LABELS[idx].color}`}>
                {BAND_LABELS[idx].name}
                <span className="text-gray-600 font-normal ml-1">{BAND_LABELS[idx].freq}</span>
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <label className="text-[10px] text-gray-600">Threshold {band.threshold}dB</label>
                  <input type="range" min={-60} max={0} step={1} value={band.threshold}
                    onChange={e => updateBand(idx, 'threshold', Number(e.target.value))}
                    className="w-full accent-cyan-500 h-1" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-600">Ratio {band.ratio}:1</label>
                  <input type="range" min={1} max={20} step={0.5} value={band.ratio}
                    onChange={e => updateBand(idx, 'ratio', Number(e.target.value))}
                    className="w-full accent-cyan-500 h-1" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-600">Attack {band.attack}ms</label>
                  <input type="range" min={0.1} max={100} step={0.5} value={band.attack}
                    onChange={e => updateBand(idx, 'attack', Number(e.target.value))}
                    className="w-full accent-cyan-500 h-1" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-600">Release {band.release}ms</label>
                  <input type="range" min={10} max={1000} step={10} value={band.release}
                    onChange={e => updateBand(idx, 'release', Number(e.target.value))}
                    className="w-full accent-cyan-500 h-1" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-600">Gain {band.gain > 0 ? '+' : ''}{band.gain}dB</label>
                <input type="range" min={-12} max={12} step={0.5} value={band.gain}
                  onChange={e => updateBand(idx, 'gain', Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1" />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={resetToDefault}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            기본값 초기화
          </button>
        </div>
      )}
    </div>
  );
};

/** BGM 상세 설정 모달 */
const BgmDetailModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleChange = useCallback((partial: Partial<BgmConfig>) => {
    setBgmTrack(partial);
  }, [setBgmTrack]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); } else { el.volume = bgmTrack.volume / 100; el.play().catch((e) => { logger.trackSwallowedError('BgmOverlayPanel:togglePlay', e); }); }
  }, [isPlaying, bgmTrack.volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = bgmTrack.volume / 100;
  }, [bgmTrack.volume]);

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!bgmTrack.audioUrl) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              {isPlaying ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
              )}
            </button>
            <div>
              <h3 className="text-sm font-bold text-white">BGM 상세 설정</h3>
              <p className="text-xs text-gray-500 truncate max-w-[280px]">{bgmTrack.trackTitle || 'BGM 트랙'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <audio
          ref={audioRef}
          src={bgmTrack.audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        <div className="px-5 py-4 space-y-5">
          {/* 볼륨 */}
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1 block">볼륨 {bgmTrack.volume}%</label>
            <input
              type="range"
              min={0} max={100} step={5}
              value={bgmTrack.volume}
              onChange={(e) => handleChange({ volume: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          {/* 페이드 인/아웃 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1 block">페이드 인 {bgmTrack.fadeIn}초</label>
              <input
                type="range"
                min={0} max={10} step={0.5}
                value={bgmTrack.fadeIn}
                onChange={(e) => handleChange({ fadeIn: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1 block">페이드 아웃 {bgmTrack.fadeOut}초</label>
              <input
                type="range"
                min={0} max={10} step={0.5}
                value={bgmTrack.fadeOut}
                onChange={(e) => handleChange({ fadeOut: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>

          {/* 나레이션 vs BGM 믹스 밸런스 */}
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1 block">
              믹스 밸런스 {bgmTrack.mixBalance > 0 ? `BGM +${bgmTrack.mixBalance}` : bgmTrack.mixBalance < 0 ? `나레이션 +${Math.abs(bgmTrack.mixBalance)}` : '균등'}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">나레이션</span>
              <input
                type="range"
                min={-100} max={100} step={5}
                value={bgmTrack.mixBalance}
                onChange={(e) => handleChange({ mixBalance: Number(e.target.value) })}
                className="flex-1 accent-cyan-500"
              />
              <span className="text-xs text-gray-600">BGM</span>
            </div>
          </div>

          {/* 덕킹 */}
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1 block">
              덕킹 {bgmTrack.duckingDb === 0 ? '없음' : `${bgmTrack.duckingDb}dB`}
            </label>
            <input
              type="range"
              min={-24} max={0} step={3}
              value={bgmTrack.duckingDb}
              onChange={(e) => handleChange({ duckingDb: Number(e.target.value) })}
              className="w-full accent-cyan-500"
            />
            <p className="text-[11px] text-gray-600 mt-1">나레이션 구간에서 BGM 자동 감소</p>
          </div>

          {/* 오디오 마스터링 프리셋 */}
          <div>
            <label className="text-xs font-bold text-gray-400 mb-2 block">오디오 마스터링</label>
            <div className="flex flex-wrap gap-1.5">
              {MASTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleChange({ masterPreset: p.id })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    bgmTrack.masterPreset === p.id
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  }`}
                  title={p.desc}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {bgmTrack.masterPreset !== 'none' && (
              <p className="text-xs text-cyan-400/70 mt-1.5">
                {MASTER_PRESETS.find((p) => p.id === bgmTrack.masterPreset)?.desc}
              </p>
            )}
          </div>

          {/* 멀티밴드 컴프레서 */}
          <MultibandCompressorPanel />

          {/* 트랙 제거 */}
          <button
            type="button"
            onClick={() => { handleChange({ audioUrl: null, trackTitle: '' }); onClose(); }}
            className="w-full py-2 rounded-lg text-sm font-bold text-red-400 bg-red-600/10 border border-red-500/30 hover:bg-red-600/20 transition-colors"
          >
            BGM 제거
          </button>
        </div>
      </div>
    </div>
  );
};

/** 트랙 목록 — 개별 미리듣기 재생/멈춤/볼륨 + 적용/상세 버튼 */
const TrackListWithPreview: React.FC<{
  tracks: (GeneratedMusic & { groupTitle: string })[];
  selectedUrl: string | null;
  onSelect: (track: GeneratedMusic & { groupTitle: string }) => void;
  onOpenDetail: () => void;
}> = ({ tracks, selectedUrl, onSelect, onOpenDetail }) => {
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewVol, setPreviewVol] = useState(80);
  const [showVolume, setShowVolume] = useState(false);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current = null;
      }
    };
  }, []);

  const togglePreview = useCallback((track: GeneratedMusic & { groupTitle: string }) => {
    if (playingId === track.id) {
      previewRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (previewRef.current) {
      previewRef.current.pause();
    }
    const audio = new Audio(track.audioUrl);
    audio.volume = previewVol / 100;
    audio.onended = () => setPlayingId(null);
    audio.onpause = () => { if (previewRef.current === audio) setPlayingId(null); };
    audio.play().catch((e) => { logger.trackSwallowedError('BgmOverlayPanel:previewPlay', e); });
    previewRef.current = audio;
    setPlayingId(track.id);
  }, [playingId, previewVol]);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.volume = previewVol / 100;
    }
  }, [previewVol]);

  return (
    <div className="space-y-1.5">
      {/* 미리듣기 볼륨 컨트롤 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400">트랙 목록</span>
        <button
          type="button"
          onClick={() => setShowVolume(!showVolume)}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {previewVol === 0 ? (
              <><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
            ) : previewVol < 50 ? (
              <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 010 7.07" /></>
            ) : (
              <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" /></>
            )}
          </svg>
          <span>{previewVol}%</span>
        </button>
      </div>
      {showVolume && (
        <div className="flex items-center gap-2 bg-gray-900/50 rounded px-2 py-1 border border-gray-700/50">
          <span className="text-[10px] text-gray-600">미리듣기 볼륨</span>
          <input
            type="range"
            min={0} max={100} step={5}
            value={previewVol}
            onChange={(e) => setPreviewVol(Number(e.target.value))}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-[10px] text-cyan-400 font-mono w-8 text-right">{previewVol}%</span>
        </div>
      )}

      <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
        {tracks.map((track) => {
          const isSelected = selectedUrl === track.audioUrl;
          const isPlaying = playingId === track.id;
          return (
            <div
              key={track.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-cyan-600/15 border-cyan-500/40'
                  : 'bg-gray-900/30 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              {/* 재생/멈춤 버튼 */}
              <button
                type="button"
                onClick={() => togglePreview(track)}
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  isPlaying
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-600/50'
                }`}
              >
                {isPlaying ? (
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="white"><rect x="1.5" y="1.5" width="3" height="9" rx="0.5" /><rect x="7.5" y="1.5" width="3" height="9" rx="0.5" /></svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><polygon points="3,1 10,6 3,11" /></svg>
                )}
              </button>

              {/* 트랙 정보 */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isSelected ? 'text-cyan-300 font-bold' : 'text-gray-200'}`}>{track.title}</p>
                <p className="text-[10px] text-gray-500 truncate">{track.groupTitle} | {Math.round(track.duration)}s</p>
              </div>

              {/* 적용 버튼 */}
              {!isSelected ? (
                <button
                  type="button"
                  onClick={() => onSelect(track)}
                  className="px-2 py-1 rounded text-[10px] font-bold bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors flex-shrink-0"
                >
                  적용
                </button>
              ) : (
                <span className="text-cyan-400 text-xs font-bold flex-shrink-0 px-1">적용됨</span>
              )}

              {/* 상세 설정 아이콘 */}
              {isSelected && (
                <button
                  type="button"
                  onClick={onOpenDetail}
                  className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 flex items-center justify-center transition-colors flex-shrink-0 border border-gray-700/50"
                  title="상세 설정"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BgmOverlayPanel: React.FC = () => {
  const musicLibrary = useSoundStudioStore((s) => s.musicLibrary);
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);
  const setBgmTrack = useEditRoomStore((s) => s.setBgmTrack);
  const trackMixer = useEditRoomStore((s) => s.trackMixer);
  const setTrackMixer = useEditRoomStore((s) => s.setTrackMixer);
  const sfxVolume = useEditRoomStore((s) => s.sfxVolume);
  const setSfxVolume = useEditRoomStore((s) => s.setSfxVolume);
  const renderSettings = useEditRoomStore((s) => s.renderSettings);
  const setRenderSettings = useEditRoomStore((s) => s.setRenderSettings);

  const [presets, setPresets] = useState<SavedAudioPreset[]>(() => loadAudioPresets());
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);

  const allTracks = React.useMemo(() => {
    const tracks: (GeneratedMusic & { groupTitle: string })[] = [];
    musicLibrary.forEach((group) => {
      group.tracks.forEach((t) => {
        tracks.push({ ...t, groupTitle: group.groupTitle });
      });
    });
    return tracks;
  }, [musicLibrary]);

  const handleSelectTrack = useCallback((track: GeneratedMusic & { groupTitle: string }) => {
    setBgmTrack({
      audioUrl: track.audioUrl,
      trackTitle: `${track.groupTitle} - ${track.title}`,
    });
  }, [setBgmTrack]);

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const { audioUrl, trackTitle, ...bgmSettings } = bgmTrack;
    const newPreset: SavedAudioPreset = {
      id: `ap_${Date.now()}`,
      name,
      data: {
        bgmTrack: bgmSettings,
        trackMixer: { ...trackMixer },
        sfxVolume,
        renderSettings: { ...renderSettings },
      },
      createdAt: Date.now(),
    };
    const updated = [newPreset, ...presets].slice(0, MAX_PRESETS);
    setPresets(updated);
    saveAudioPresets(updated);
    setPresetName('');
    setShowPresetInput(false);
  }, [presetName, bgmTrack, trackMixer, sfxVolume, renderSettings, presets]);

  const handleLoadPreset = useCallback((preset: SavedAudioPreset) => {
    const { data } = preset;
    setBgmTrack(data.bgmTrack);
    for (const [trackId, config] of Object.entries(data.trackMixer)) {
      setTrackMixer(trackId as AudioTrackId, config);
    }
    setSfxVolume(data.sfxVolume);
    setRenderSettings(data.renderSettings);
  }, [setBgmTrack, setTrackMixer, setSfxVolume, setRenderSettings]);

  const handleDeletePreset = useCallback((id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    saveAudioPresets(updated);
  }, [presets]);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-white">BGM 오버레이</h3>

      {/* 오디오 프리셋 */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300">내 프리셋</span>
          <button
            type="button"
            onClick={() => setShowPresetInput(!showPresetInput)}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {showPresetInput ? '취소' : '현재 설정 저장'}
          </button>
        </div>
        {showPresetInput && (
          <div className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
              placeholder="프리셋 이름..."
              maxLength={20}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                presetName.trim()
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              저장
            </button>
          </div>
        )}
        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleLoadPreset(p)}
                onContextMenu={(e) => { e.preventDefault(); handleDeletePreset(p.id); }}
                className="group px-2.5 py-1 rounded-full text-xs font-bold bg-gray-900/60 text-gray-300 border border-gray-700 hover:border-cyan-500/50 hover:text-cyan-300 transition-all flex items-center gap-1.5"
                title="클릭: 불러오기 | 우클릭: 삭제"
              >
                <span>{p.name}</span>
                <span
                  className="hidden group-hover:inline text-gray-600 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                >
                  x
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-600">저장된 프리셋이 없습니다</p>
        )}
      </div>

      {/* 현재 선택된 트랙 — 컴팩트 바 */}
      {bgmTrack.audioUrl ? (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0 animate-pulse" />
          <p className="text-sm text-gray-200 truncate flex-1">{bgmTrack.trackTitle || 'BGM 트랙'}</p>
          <span className="text-[10px] text-gray-500 flex-shrink-0">{bgmTrack.volume}%</span>
          <button
            type="button"
            onClick={() => setShowDetailModal(true)}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 flex items-center justify-center transition-colors flex-shrink-0 border border-gray-700/50"
            title="상세 설정"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setBgmTrack({ audioUrl: null, trackTitle: '' })}
            className="text-xs text-gray-600 hover:text-red-400 flex-shrink-0 transition-colors"
          >
            제거
          </button>
        </div>
      ) : (
        <div className="bg-gray-900/30 border border-dashed border-gray-700 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-500">BGM 트랙을 선택하세요</p>
          <p className="text-sm text-gray-600 mt-1">뮤직 스튜디오에서 생성한 트랙이 여기에 표시됩니다</p>
        </div>
      )}

      {/* 트랙 목록 */}
      {allTracks.length > 0 ? (
        <TrackListWithPreview
          tracks={allTracks}
          selectedUrl={bgmTrack.audioUrl}
          onSelect={handleSelectTrack}
          onOpenDetail={() => setShowDetailModal(true)}
        />
      ) : (
        <p className="text-sm text-gray-600">
          뮤직 스튜디오에서 음악을 먼저 생성하세요.
        </p>
      )}

      {/* 상세 설정 모달 */}
      {showDetailModal && bgmTrack.audioUrl && (
        <BgmDetailModal onClose={() => setShowDetailModal(false)} />
      )}
    </div>
  );
};

export default BgmOverlayPanel;
