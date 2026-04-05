import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { logger } from '../../../services/LoggerService';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { showToast } from '../../../stores/uiStore';
import { useProjectStore } from '../../../stores/projectStore';
import { generateSupertonicTTS, generateEdgeTTS, mergeAudioFiles } from '../../../services/ttsService';
import { generateTypecastTTS } from '../../../services/typecastService';
import { generateElevenLabsDialogueTTS } from '../../../services/elevenlabsService';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { audioBufferToWav, ensurePremiereCompatibleWav } from '../../../services/ttsService';
import type { Speaker, TTSLanguage, LufsPreset } from '../../../types';
import { LUFS_PRESETS } from '../../../types';
import { runKieBatch } from '../../../utils/kieBatchRunner';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 화자 설정에 따라 개별 라인 TTS 생성 */
async function generateLineTTS(
  text: string,
  speaker: Speaker,
  context?: { previousText?: string; nextText?: string },
): Promise<{ audioUrl: string; format: string }> {
  const lang = (speaker.language || 'ko') as TTSLanguage;

  switch (speaker.engine) {
    case 'elevenlabs':
      return generateElevenLabsDialogueTTS({
        text,
        voiceId: speaker.voiceId,
        stability: speaker.stability ?? 0.5,
        languageCode: speaker.language || 'auto',
      });
    case 'edge':
      return generateEdgeTTS(text, speaker.voiceId || 'ko-KR-SunHiNeural', lang);
    case 'supertonic':
      return generateSupertonicTTS(text, speaker.voiceId, lang, speaker.speed);
    case 'typecast': {
      const result = await generateTypecastTTS(text, {
        voiceId: speaker.voiceId,
        model: speaker.typecastModel || 'ssfm-v30',
        language: speaker.language === 'ko' ? 'kor' : speaker.language === 'ja' ? 'jpn' : 'eng',
        emotionMode: speaker.emotionMode || 'smart',
        emotionPreset: speaker.emotionPreset || 'normal',
        emotionIntensity: speaker.emotionIntensity || 1.0,
        speed: speaker.speed,
        pitch: speaker.pitch,
        volume: speaker.typecastVolume || 100,
        previousText: context?.previousText,
        nextText: context?.nextText,
      });
      return result;
    }
    default:
      // 레거시 엔진(qwen3, kokoro 등) → Edge TTS로 폴백
      return generateEdgeTTS(text, speaker.voiceId || 'ko-KR-SunHiNeural', lang);
  }
}

/** LUFS 정규화 — AudioBuffer를 타겟 LUFS로 정규화하여 새 blob URL 반환 */
async function normalizeLufs(audioUrl: string, targetLufs: number, truePeakDbtp: number): Promise<string> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const resp = await fetch(audioUrl);
    const arrayBuf = await resp.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuf);

    // Pass 1: RMS 측정
    let sumSquares = 0;
    let sampleCount = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
        sampleCount++;
      }
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    if (rms === 0) return audioUrl;

    const currentLufs = 20 * Math.log10(rms) - 0.691;
    const gainDb = targetLufs - currentLufs;
    let gainLinear = Math.pow(10, gainDb / 20);

    // True Peak 리미터
    let maxPeak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]) * gainLinear;
        if (abs > maxPeak) maxPeak = abs;
      }
    }
    const limit = Math.pow(10, truePeakDbtp / 20);
    if (maxPeak > limit) gainLinear *= limit / maxPeak;

    // Pass 2: 게인 적용
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= gainLinear;
    }

    // [FIX #965] 48kHz로 리샘플링하여 Premiere 호환 보장
    const wavBlob = audioBufferToWav(buffer, 48000);
    const normalizedUrl = URL.createObjectURL(wavBlob);
    logger.registerBlobUrl(normalizedUrl, 'audio', 'AudioMerger:normalizeLufs');
    return normalizedUrl;
  } finally {
    await ctx.close();
  }
}

const AudioMerger: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const speakers = useSoundStudioStore((s) => s.speakers);
  const lines = useSoundStudioStore((s) => s.lines);
  const updateLine = useSoundStudioStore((s) => s.updateLine);
  const mergedAudioUrl = useSoundStudioStore((s) => s.mergedAudioUrl);
  const setMergedAudio = useSoundStudioStore((s) => s.setMergedAudio);
  const isGeneratingTTS = useSoundStudioStore((s) => s.isGeneratingTTS);
  const setIsGeneratingTTS = useSoundStudioStore((s) => s.setIsGeneratingTTS);
  const ttsProgress = useSoundStudioStore((s) => s.ttsProgress);
  const setTtsProgress = useSoundStudioStore((s) => s.setTtsProgress);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const elapsedTTS = useElapsedTimer(isGeneratingTTS);

  // LUFS 정규화 상태
  // [FIX #190] LUFS 정규화 기본 활성화 — 나레이션 음량 들쑥날쑥 방지
  const [lufsEnabled, setLufsEnabled] = useState(true);
  const [lufsPreset, setLufsPreset] = useState<LufsPreset>('youtube');
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [lufsApplied, setLufsApplied] = useState(false);

  const segmentCount = useMemo(() => lines.filter((l) => l.audioUrl).length, [lines]);
  const totalDuration = useMemo(() => lines.reduce((sum, l) => sum + (l.duration || 0), 0), [lines]);
  const allUploaded = useMemo(() => lines.length > 0 && lines.every((l) => l.audioSource === 'uploaded'), [lines]);
  const hasAnyUploaded = useMemo(() => lines.some((l) => l.audioSource === 'uploaded'), [lines]);

  // 오디오 시간 업데이트
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const tick = () => {
      setCurrentTime(audio.currentTime);
      if (!audio.paused) animFrameRef.current = requestAnimationFrame(tick);
    };
    const onPlay = () => { animFrameRef.current = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(animFrameRef.current); };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    registerAudio(audio);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      cancelAnimationFrame(animFrameRef.current);
      unregisterAudio(audio);
    };
  }, [mergedAudioUrl]);

  // 전체 TTS 생성 + 병합
  const handleGenerateAll = useCallback(async () => {
    if (!requireAuth('오디오 병합')) return;
    if (isGeneratingTTS || lines.length === 0) return;
    // 업로드 모드가 아닌 경우에만 화자 체크
    const needsTts = lines.some((l) => l.audioSource !== 'uploaded' && !l.audioUrl);
    if (needsTts && speakers.length === 0) return;

    setIsGeneratingTTS(true);
    setError(null);
    setTtsProgress({ current: 0, total: lines.length });

    try {
      // [FIX #920] KIE 레이트 리밋 배치 — 동시 5개로 축소 + 타임아웃/재시도
      const targets = lines
        .map((line, i) => ({ line, idx: i }))
        .filter(({ line }) => !line.audioUrl && line.audioSource !== 'uploaded');
      let done = 0;
      const batchResult = await runKieBatch(targets, async ({ line, idx }) => {
        const baseSpeaker = speakers.find((s) => s.id === line.speakerId) || speakers[0];
        const speaker: Speaker = line.voiceId
          ? { ...baseSpeaker, voiceId: line.voiceId }
          : baseSpeaker;
        const prevText = idx > 0 ? lines[idx - 1]?.text?.slice(-200) : undefined;
        const nextText = idx < lines.length - 1 ? lines[idx + 1]?.text?.slice(0, 200) : undefined;
        const result = await generateLineTTS(line.text, speaker, { previousText: prevText, nextText: nextText });
        updateLine(line.id, { audioUrl: result.audioUrl });
      }, () => { done++; setTtsProgress({ current: lines.length - targets.length + done, total: lines.length }); }, {
        submitPerWindow: 5,     // [FIX #920] 10 → 5로 축소 (rate limit 여유)
        itemTimeoutMs: 180_000,
        retryCount: 1,
        retryDelayMs: 5_000,
      });
      if (batchResult.failed > 0) {
        showToast(`${targets.length}개 중 ${batchResult.failed}개 TTS 생성 실패`, 5000);
      }
      setTtsProgress({ current: lines.length, total: lines.length });

      // 병합
      const allUrls = useSoundStudioStore.getState().lines
        .map((l) => l.audioUrl)
        .filter((url): url is string => !!url);

      if (allUrls.length > 0) {
        const merged = await mergeAudioFiles(allUrls);
        // 이전 blob URL 해제 후 새 URL 설정
        const prevUrl = useSoundStudioStore.getState().mergedAudioUrl;
        if (prevUrl?.startsWith('blob:')) { logger.unregisterBlobUrl(prevUrl); URL.revokeObjectURL(prevUrl); }

        // LUFS 정규화 적용
        let finalMerged = merged;
        if (lufsEnabled) {
          const preset = LUFS_PRESETS[lufsPreset];
          finalMerged = await normalizeLufs(merged, preset.targetLufs, preset.truePeakDbtp);
          if (finalMerged !== merged && merged.startsWith('blob:')) { logger.unregisterBlobUrl(merged); URL.revokeObjectURL(merged); }
          setLufsApplied(true);
        } else {
          setLufsApplied(false);
        }
        setMergedAudio(finalMerged);

        // 타임코드 계산 (순차 배치)
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        try {
          let offset = 0;
          const updatedLines = useSoundStudioStore.getState().lines;
          for (const line of updatedLines) {
            if (!line.audioUrl) continue;
            try {
              const resp = await fetch(line.audioUrl);
              const buf = await resp.arrayBuffer();
              const decoded = await ctx.decodeAudioData(buf);
              const dur = decoded.duration;
              updateLine(line.id, { startTime: offset, endTime: offset + dur, duration: dur });
              offset += dur;
            } catch (e) {
              logger.trackSwallowedError('AudioMerger:measureAudioDuration', e);
              updateLine(line.id, { startTime: offset, endTime: offset + 2, duration: 2 });
              offset += 2;
            }
          }
        } finally {
          await ctx.close();
        }
      }
      // [v4.5] 스마트 제목 — 나레이션 라인 수 기반
      const lineCount = useSoundStudioStore.getState().lines.filter(l => l.audioUrl).length;
      useProjectStore.getState().smartUpdateTitle('sound-studio', `${lineCount}줄 나레이션`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingTTS(false);
      setTtsProgress(null);
    }
  }, [lines, speakers, updateLine, setMergedAudio, isGeneratingTTS, setIsGeneratingTTS, setTtsProgress]);

  // 재생/일시정지
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !mergedAudioUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [isPlaying, mergedAudioUrl]);

  // 시크
  const handleSeek = useCallback((val: number) => {
    setCurrentTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  }, []);

  // 현재 재생 중인 라인 하이라이트
  const activeLineId = useMemo(() => {
    return lines.find((l) => l.startTime !== undefined && l.endTime !== undefined &&
      currentTime >= l.startTime && currentTime < l.endTime)?.id || null;
  }, [lines, currentTime]);

  // [FIX #965] Premiere Pro 호환 48kHz WAV 변환 후 다운로드
  const handleDownload = useCallback(async () => {
    if (!mergedAudioUrl) return;
    const sp = speakers[0];
    const charName = (sp?.name || '나레이션').replace(/[/\\?%*:|"<>\s]/g, '');
    try {
      const wavBlob = await ensurePremiereCompatibleWav(mergedAudioUrl);
      const wavUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = wavUrl;
      a.download = `${charName}_전체.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(wavUrl), 3000);
    } catch {
      // 변환 실패 시 원본 그대로 다운로드 (폴백)
      const a = document.createElement('a');
      a.href = mergedAudioUrl;
      a.download = `${charName}_전체.wav`;
      a.click();
    }
  }, [mergedAudioUrl, speakers]);

  return (
    <div className="space-y-6">
      {mergedAudioUrl && <audio ref={audioRef} src={mergedAudioUrl} preload="metadata" />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center text-sm shadow">
            🔊
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">음성 생성 & 병합</h2>
            <p className="text-sm text-gray-500">
              {hasAnyUploaded
                ? '업로드 오디오 + TTS 음성을 병합합니다'
                : '대본의 각 줄에 TTS 음성을 생성하고 하나의 오디오로 병합합니다'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mergedAudioUrl && (
            <button type="button" onClick={handleDownload}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-bold border border-gray-600 transition-colors">
              다운로드
            </button>
          )}
          <button type="button" onClick={handleGenerateAll} disabled={isGeneratingTTS || lines.length === 0}
            className={`px-4 py-2 rounded-lg text-base font-bold transition-all border shadow-md ${
              isGeneratingTTS ? 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-400/50 hover:from-purple-500 hover:to-pink-500'
            }`}>
            {isGeneratingTTS ? (<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 생성 중...{elapsedTTS > 0 && <span className="text-xs text-white/60 tabular-nums ml-1">{formatElapsed(elapsedTTS)}</span>}</>) : allUploaded ? '병합' : segmentCount > 0 ? '재생성 & 병합' : '전체 생성 & 병합'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {isGeneratingTTS && ttsProgress && (
        <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-400 font-semibold">TTS 생성 중...{elapsedTTS > 0 && <span className="text-purple-300/60 tabular-nums ml-2">{formatElapsed(elapsedTTS)}</span>}</span>
            <span className="text-gray-400">{ttsProgress.current}/{ttsProgress.total}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
              style={{ width: `${(ttsProgress.current / ttsProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-600/30 rounded-lg px-4 py-3 text-base text-red-400">
          {error}
        </div>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/60 rounded-lg border border-gray-700 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-white">{lines.length}</p>
          <p className="text-sm text-gray-500">대사 라인</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg border border-gray-700 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-400">{segmentCount}</p>
          <p className="text-sm text-gray-500">생성 완료</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg border border-gray-700 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-purple-400">{formatTime(totalDuration)}</p>
          <p className="text-sm text-gray-500">총 길이</p>
        </div>
      </div>

      {/* LUFS Normalization Controls */}
      <div className="bg-gray-800/60 rounded-lg border border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lufsEnabled}
                onChange={(e) => { setLufsEnabled(e.target.checked); setLufsApplied(false); }}
                className="w-4 h-4 accent-fuchsia-500 rounded"
              />
              <span className="text-sm font-bold text-white">라우드니스 정규화 (LUFS)</span>
            </label>
            {lufsApplied && (
              <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">적용됨</span>
            )}
          </div>
          {lufsEnabled && (
            <div className="flex items-center gap-2">
              <select
                value={lufsPreset}
                onChange={(e) => { setLufsPreset(e.target.value as LufsPreset); setLufsApplied(false); }}
                className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-1 text-sm text-gray-200 focus:border-fuchsia-500/50"
              >
                {Object.entries(LUFS_PRESETS).filter(([k]) => k !== 'custom').map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
              {mergedAudioUrl && !lufsApplied && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsNormalizing(true);
                    try {
                      const preset = LUFS_PRESETS[lufsPreset];
                      const normalized = await normalizeLufs(mergedAudioUrl, preset.targetLufs, preset.truePeakDbtp);
                      if (normalized !== mergedAudioUrl) {
                        const prevUrl = mergedAudioUrl;
                        setMergedAudio(normalized);
                        if (prevUrl.startsWith('blob:')) { logger.unregisterBlobUrl(prevUrl); URL.revokeObjectURL(prevUrl); }
                      }
                      setLufsApplied(true);
                    } finally {
                      setIsNormalizing(false);
                    }
                  }}
                  disabled={isNormalizing}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-600/30 transition-all disabled:opacity-50"
                >
                  {isNormalizing ? '처리 중...' : '지금 적용'}
                </button>
              )}
            </div>
          )}
        </div>
        {lufsEnabled && (
          <p className="text-xs text-gray-500 mt-1.5">
            병합 시 자동 적용 · {LUFS_PRESETS[lufsPreset].label} · True Peak {LUFS_PRESETS[lufsPreset].truePeakDbtp} dBTP
          </p>
        )}
      </div>

      {/* Merge status */}
      {mergedAudioUrl ? (
        <div className="bg-green-900/20 border border-green-600/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-green-400 text-base font-bold">병합 완료{lufsApplied ? ' + LUFS 정규화' : ''}</span>
          <span className="text-sm text-gray-400">총 {formatTime(totalDuration)} | {segmentCount}개 세그먼트</span>
        </div>
      ) : lines.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 border-dashed rounded-lg px-4 py-3 text-center text-gray-500 text-base">
          설정 탭에서 대본을 불러오고 음성을 선택해주세요.
        </div>
      ) : null}

      {/* Player */}
      {mergedAudioUrl && (
        <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 space-y-3">
          <h3 className="text-base font-bold text-white">대본 싱크 플레이어</h3>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handlePlayPause}
              className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-colors shadow-lg">
              {isPlaying ? (
                <svg className="w-4 h-4" viewBox="0 0 12 12" fill="white"><rect x="1" y="1" width="3.5" height="10" rx="0.5" /><rect x="7.5" y="1" width="3.5" height="10" rx="0.5" /></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 12 12" fill="white"><polygon points="2,1 11,6 2,11" /></svg>
              )}
            </button>
            <div className="flex-1">
              <input type="range" min={0} max={totalDuration || 1} step={0.1} value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))} className="w-full accent-purple-500" />
            </div>
            <span className="text-sm text-gray-400 font-mono w-24 text-right">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>
      )}

      {/* Line-by-line display */}
      <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-white">대사 목록</h3>
          <span className="text-sm text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
            {lines.length}줄
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto space-y-1">
          {lines.length === 0 ? (
            <p className="text-center text-gray-500 text-base py-6">표시할 라인이 없습니다.</p>
          ) : (
            lines.map((line, idx) => {
              const isActive = activeLineId === line.id;
              const hasAudio = !!line.audioUrl;
              return (
                <div key={line.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-gray-700/30'
                  }`}>
                  <span className="text-sm text-gray-600 font-mono w-6 shrink-0 mt-1 text-right">{idx + 1}</span>
                  {hasAudio ? (
                    <span className="text-green-400 text-sm shrink-0 mt-0.5">&#10003;</span>
                  ) : (
                    <span className="text-gray-600 text-sm shrink-0 mt-0.5">&#9675;</span>
                  )}
                  <span className={`text-base flex-1 ${isActive ? 'text-purple-200 font-medium' : 'text-gray-300'}`}>
                    {line.text}
                  </span>
                  {line.startTime !== undefined && (
                    <span className="text-sm text-gray-600 font-mono shrink-0 mt-0.5">
                      {formatTime(line.startTime)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioMerger;
