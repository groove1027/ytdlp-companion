import React, { useState, useRef, useCallback } from 'react';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { generateSfx, SFX_PRESETS } from '../../../services/sfxService';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import type { SfxItem } from '../../../types';

function formatDuration(sec: number): string {
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const SfxPanel: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const sfxItems = useSoundStudioStore((s) => s.sfxItems);
  const addSfxItem = useSoundStudioStore((s) => s.addSfxItem);
  const updateSfxItem = useSoundStudioStore((s) => s.updateSfxItem);
  const removeSfxItem = useSoundStudioStore((s) => s.removeSfxItem);

  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = useCallback(async (sfxPrompt?: string) => {
    if (!requireAuth('SFX 생성')) return;
    const finalPrompt = sfxPrompt || prompt.trim();
    if (!finalPrompt) return;

    const id = `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item: SfxItem = {
      id,
      prompt: finalPrompt,
      duration,
      createdAt: Date.now(),
      status: 'generating',
    };
    addSfxItem(item);

    try {
      const audioUrl = await generateSfx(finalPrompt, duration, (state) => {
        updateSfxItem(id, { status: 'generating', errorMsg: state });
      });
      updateSfxItem(id, { status: 'done', audioUrl, errorMsg: undefined });
    } catch (err) {
      updateSfxItem(id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : String(err),
      });
    }
  }, [prompt, duration, addSfxItem, updateSfxItem, requireAuth]);

  const handlePlay = useCallback((item: SfxItem) => {
    if (!item.audioUrl) return;

    // 같은 아이템 재생 중이면 정지
    if (playingId === item.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      unregisterAudio(audioRef.current);
      setPlayingId(null);
      return;
    }

    // 이전 오디오 정리
    if (audioRef.current) {
      audioRef.current.pause();
      unregisterAudio(audioRef.current);
    }

    const audio = new Audio(item.audioUrl);
    audioRef.current = audio;
    registerAudio(audio);
    setPlayingId(item.id);

    audio.onended = () => {
      unregisterAudio(audio);
      setPlayingId(null);
    };
    audio.onerror = () => {
      unregisterAudio(audio);
      setPlayingId(null);
    };
    audio.play().catch(() => setPlayingId(null));
  }, [playingId]);

  const handleDownload = useCallback((item: SfxItem) => {
    if (!item.audioUrl) return;
    const a = document.createElement('a');
    a.href = item.audioUrl;
    a.download = `sfx_${item.prompt.slice(0, 30).replace(/\s+/g, '_')}.mp3`;
    a.click();
  }, []);

  const generatingCount = sfxItems.filter(s => s.status === 'generating').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center text-xl shadow-lg">
          🔊
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">AI 효과음 생성</h2>
          <p className="text-sm text-gray-400">
            ElevenLabs Sound Effects V2 — 텍스트 프롬프트로 효과음을 생성합니다
          </p>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">효과음 설명 (영어 권장)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: cinematic explosion with debris, gentle rain on window..."
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-base resize-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">{prompt.length}/500</span>
          </div>
        </div>

        {/* Duration slider */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-gray-300 shrink-0">길이</label>
          <input
            type="range"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />
          <span className="text-sm text-amber-400 font-bold w-10 text-right">{duration}초</span>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={!prompt.trim() || generatingCount > 0}
          className={`w-full py-3 rounded-lg text-base font-bold transition-all border shadow-md ${
            !prompt.trim() || generatingCount > 0
              ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-400/50 hover:from-amber-500 hover:to-orange-500'
          }`}
        >
          {generatingCount > 0 ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              생성 중...
            </span>
          ) : '효과음 생성'}
        </button>
      </div>

      {/* Quick Presets */}
      <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
        <h3 className="text-sm font-bold text-gray-300 mb-3">빠른 프리셋</h3>
        <div className="flex flex-wrap gap-2">
          {SFX_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setPrompt(preset.prompt);
                handleGenerate(preset.prompt);
              }}
              disabled={generatingCount > 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/60 hover:bg-amber-600/20 text-gray-300 hover:text-amber-300 rounded-lg text-sm border border-gray-600 hover:border-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{preset.icon}</span>
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Generated SFX List */}
      {sfxItems.length > 0 && (
        <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">생성된 효과음</h3>
            <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
              {sfxItems.length}개
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...sfxItems].reverse().map((item) => (
              <div
                key={item.id}
                className={`relative bg-gray-900/60 rounded-lg border p-4 space-y-2 transition-all ${
                  item.status === 'error'
                    ? 'border-red-600/30'
                    : item.status === 'generating'
                    ? 'border-amber-500/30 animate-pulse'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    item.status === 'done' ? 'bg-green-600/20 text-green-400' :
                    item.status === 'generating' ? 'bg-amber-600/20 text-amber-400' :
                    item.status === 'error' ? 'bg-red-600/20 text-red-400' :
                    'bg-gray-600/20 text-gray-400'
                  }`}>
                    {item.status === 'done' ? '완료' :
                     item.status === 'generating' ? '생성 중...' :
                     item.status === 'error' ? '실패' : '대기'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSfxItem(item.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                    title="삭제"
                  >
                    &#10005;
                  </button>
                </div>

                {/* Prompt */}
                <p className="text-sm text-gray-300 line-clamp-2" title={item.prompt}>
                  {item.prompt}
                </p>

                {/* Duration */}
                <p className="text-xs text-gray-500">{formatDuration(item.duration)}</p>

                {/* Error message */}
                {item.status === 'error' && item.errorMsg && (
                  <p className="text-xs text-red-400 line-clamp-2">{item.errorMsg}</p>
                )}

                {/* Play/Download controls */}
                {item.status === 'done' && item.audioUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePlay(item)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-all border ${
                        playingId === item.id
                          ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
                          : 'bg-gray-700/60 text-gray-300 border-gray-600 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {playingId === item.id ? '■ 정지' : '▶ 재생'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-700/60 text-gray-300 border border-gray-600 hover:bg-gray-700 hover:text-white transition-all"
                      title="다운로드"
                    >
                      ⬇
                    </button>
                  </div>
                )}

                {/* Generating spinner */}
                {item.status === 'generating' && (
                  <div className="flex items-center justify-center py-2">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-amber-400 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SfxPanel;
