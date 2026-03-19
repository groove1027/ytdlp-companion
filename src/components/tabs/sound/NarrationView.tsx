import React, { useState, useCallback, useRef, Suspense } from 'react';
import { logger } from '../../../services/LoggerService';
import { useSoundStudioStore, registerAudio, unregisterAudio } from '../../../stores/soundStudioStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useCostStore } from '../../../stores/costStore';
import { showToast } from '../../../stores/uiStore';
import type { Scene } from '../../../types';
import { generateTypecastTTS } from '../../../services/typecastService';
import { mergeAudioFiles, splitBySentenceEndings } from '../../../services/ttsService';
import { transferSoundToImageVideo } from '../../../utils/soundToImageBridge';
import { PRICING } from '../../../constants';
import NarrationToolbar from './NarrationToolbar';
import NarrationLineItem from './NarrationLineItem';
import NarrationCreditBar from './NarrationCreditBar';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { runKieBatch } from '../../../utils/kieBatchRunner';
import { lazyRetry } from '../../../utils/retryImport';

const VoiceStudio = lazyRetry(() => import('./VoiceStudio'));

const NarrationView: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const addCost = useCostStore((s) => s.addCost);

  // --- Local UI state ---
  const [showVoiceBrowser, setShowVoiceBrowser] = useState(false);
  const [globalEmotion, setGlobalEmotion] = useState('normal');
  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [smartEmotion, setSmartEmotion] = useState(true);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [directScript, setDirectScript] = useState('');

  // 현재 재생 중인 Audio 인스턴스 참조
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mergedAudioRef = useRef<HTMLAudioElement | null>(null);

  // --- Store connections ---
  const lines = useSoundStudioStore((s) => s.lines);
  const speakers = useSoundStudioStore((s) => s.speakers);
  const setLines = useSoundStudioStore((s) => s.setLines);
  const updateLine = useSoundStudioStore((s) => s.updateLine);
  const addLineAfter = useSoundStudioStore((s) => s.addLineAfter);
  const mergeLineWithNext = useSoundStudioStore((s) => s.mergeLineWithNext);
  const removeLine = useSoundStudioStore((s) => s.removeLine);
  const isGeneratingTTS = useSoundStudioStore((s) => s.isGeneratingTTS);
  const ttsProgress = useSoundStudioStore((s) => s.ttsProgress);
  const mergedAudioUrl = useSoundStudioStore((s) => s.mergedAudioUrl);
  const setIsGeneratingTTS = useSoundStudioStore((s) => s.setIsGeneratingTTS);
  const setTtsProgress = useSoundStudioStore((s) => s.setTtsProgress);
  const setMergedAudio = useSoundStudioStore((s) => s.setMergedAudio);

  // 현재 화자 (첫 번째 스피커 사용)
  const activeSpeaker = speakers.length > 0 ? speakers[0] : null;

  // ===============================
  // 단일 라인 TTS 생성
  // ===============================
  const handleGenerateLine = useCallback(
    async (lineId: string) => {
      if (!requireAuth('나레이션 생성')) return;
      const lineIndex = lines.findIndex((l) => l.id === lineId);
      if (lineIndex < 0) return;
      const line = lines[lineIndex];
      const speaker = speakers.find(s => s.id === line.speakerId) || activeSpeaker;
      if (!speaker) return;

      const usesUploadedNarration = line.audioSource === 'uploaded' || !!line.uploadedAudioId;
      // 상태: generating
      updateLine(lineId, usesUploadedNarration
        ? {
            audioUrl: undefined,
            audioSource: 'tts',
            uploadedAudioId: undefined,
            startTime: undefined,
            endTime: undefined,
            duration: undefined,
            ttsStatus: 'generating',
          }
        : { ttsStatus: 'generating' });

      try {
        // Smart Prompt 컨텍스트
        const previousText = lineIndex > 0 ? lines[lineIndex - 1].text : undefined;
        const nextText = lineIndex < lines.length - 1 ? lines[lineIndex + 1].text : undefined;

        const effectiveEmotion = line.emotion || globalEmotion;
        const effectiveSpeed = line.lineSpeed ?? globalSpeed;

        const result = await generateTypecastTTS(line.text, {
          voiceId: line.voiceId || speaker.voiceId,
          model: speaker.typecastModel,
          language: speaker.language === 'ko' ? 'kor' : speaker.language === 'en' ? 'eng' : speaker.language === 'ja' ? 'jpn' : 'kor',
          emotionMode: smartEmotion ? 'smart' : 'preset',
          emotionPreset: smartEmotion ? undefined : (effectiveEmotion as 'normal' | 'happy' | 'sad' | 'angry' | 'whisper' | 'toneup' | 'tonedown'),
          speed: effectiveSpeed,
          pitch: speaker.pitch,
          volume: speaker.typecastVolume,
          previousText,
          nextText,
        });

        // [FIX] TTS 오디오 디코딩 → 실제 duration 측정 (3초 하드코드 방지)
        let realDuration: number | undefined;
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          const resp = await fetch(result.audioUrl);
          const buf = await resp.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          realDuration = decoded.duration;
          ctx.close();
        } catch (e) { logger.trackSwallowedError('NarrationView:generateTTS/decodeDuration', e); /* 디코딩 실패 시 duration 없이 진행 */ }

        updateLine(lineId, {
          audioUrl: result.audioUrl,
          audioSource: 'tts',
          uploadedAudioId: undefined,
          ttsStatus: 'done',
          ...(realDuration != null ? { duration: realDuration } : {}),
        });

        // Scene 오디오 동기화 (sceneId 기반)
        if (line.sceneId) {
          useProjectStore.getState().updateScene(line.sceneId, {
            audioUrl: result.audioUrl,
            ...(realDuration != null ? { audioDuration: realDuration } : {}),
          });
        }

        // Typecast TTS 비용 추적 (글자수 기반, 모델에 따라 단가 다름)
        const charCount = line.text.length;
        const costPer1K = speaker?.typecastModel === 'ssfm-v21' ? PRICING.TTS_TYPECAST_V21_PER_1K : PRICING.TTS_TYPECAST_V30_PER_1K;
        addCost((charCount / 1000) * costPer1K, 'tts');
      } catch (err) {
        console.error('[NarrationView] TTS 생성 실패:', err);
        updateLine(lineId, { ttsStatus: 'error' });
      }
    },
    [lines, speakers, activeSpeaker, globalEmotion, globalSpeed, smartEmotion, updateLine, addCost],
  );

  // ===============================
  // 전체 라인 TTS 생성 & 병합
  // ===============================
  const handleGenerateAll = useCallback(async () => {
    if (!requireAuth('나레이션 일괄 생성')) return;
    if (isGeneratingTTS || lines.length === 0) return;
    if (!activeSpeaker) {
      showToast('음성을 먼저 선택해주세요.');
      return;
    }

    setIsGeneratingTTS(true);
    setTtsProgress({ current: 0, total: lines.length });

    try {
      // KIE 레이트 리밋 배치: 10개/10초 병렬 제출 (미생성 라인만)
      const targets = lines.filter(l => {
        const fresh = useSoundStudioStore.getState().lines.find(fl => fl.id === l.id);
        return !(fresh?.audioUrl && fresh?.ttsStatus === 'done');
      });
      let done = 0;
      await runKieBatch(targets, async (line) => {
        await handleGenerateLine(line.id);
      }, () => { done++; setTtsProgress({ current: lines.length - targets.length + done, total: lines.length }); });
      // 이미 완료된 라인까지 포함한 최종 진행률
      setTtsProgress({ current: lines.length, total: lines.length });

      // 최신 lines 가져오기 (store에서)
      const updatedLines = useSoundStudioStore.getState().lines;
      const audioUrls = updatedLines
        .filter((l) => l.audioUrl)
        .map((l) => l.audioUrl as string);

      if (audioUrls.length > 0) {
        const mergedUrl = await mergeAudioFiles(audioUrls);
        setMergedAudio(mergedUrl);

        // [FIX] 각 라인의 실제 오디오 길이 디코딩 (3초 하드코드 폴백 제거)
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        let currentTime = 0;
        const freshLines = useSoundStudioStore.getState().lines;
        const timedLines = [];
        for (const line of freshLines) {
          let duration = line.duration || 3;
          if (line.audioUrl) {
            try {
              const resp = await fetch(line.audioUrl);
              const buf = await resp.arrayBuffer();
              const decoded = await ctx.decodeAudioData(buf);
              duration = decoded.duration;
            } catch {
              // [FIX #496] fetch/decode 실패 시 Audio element로 duration 재시도
              try {
                const audio = new Audio(line.audioUrl);
                duration = await new Promise<number>((resolve) => {
                  audio.onloadedmetadata = () => resolve(audio.duration || line.duration || 3);
                  audio.onerror = () => resolve(line.duration || 3);
                  setTimeout(() => resolve(line.duration || 3), 5000); // 5초 타임아웃
                });
              } catch { /* 최종 폴백: 기존 duration 유지 */ }
            }
          }
          const startTime = currentTime;
          const endTime = currentTime + duration;
          currentTime = endTime;
          timedLines.push({ ...line, duration, startTime, endTime });
        }
        try { ctx.close(); } catch (e) { logger.trackSwallowedError('NarrationView:buildTimeline/ctxClose', e); }
        setLines(timedLines);

        // Scene 타이밍 동기화
        for (const tl of timedLines) {
          if (tl.sceneId) {
            useProjectStore.getState().updateScene(tl.sceneId, {
              audioDuration: tl.duration, startTime: tl.startTime, endTime: tl.endTime,
            });
          }
        }
      }
    } catch (err) {
      console.error('[NarrationView] 전체 생성 실패:', err);
    } finally {
      setIsGeneratingTTS(false);
      setTtsProgress(null);
    }
  }, [
    isGeneratingTTS,
    lines,
    activeSpeaker,
    handleGenerateLine,
    setIsGeneratingTTS,
    setTtsProgress,
    setMergedAudio,
    setLines,
  ]);

  // ===============================
  // 개별 라인 재생
  // ===============================
  const handlePlayLine = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line?.audioUrl) return;

      // 이전 재생 중지
      if (audioRef.current) {
        audioRef.current.pause();
        unregisterAudio(audioRef.current);
        audioRef.current = null;
      }

      const audio = new Audio(line.audioUrl);
      registerAudio(audio);
      audioRef.current = audio;
      setPlayingLineId(lineId);

      audio.onended = () => {
        setPlayingLineId(null);
        unregisterAudio(audio);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingLineId(null);
        unregisterAudio(audio);
        audioRef.current = null;
      };
      audio.play().catch(() => {
        setPlayingLineId(null);
        unregisterAudio(audio);
        audioRef.current = null;
      });
    },
    [lines],
  );

  // ===============================
  // 전체 재생
  // ===============================
  const handlePlayAll = useCallback(() => {
    if (!mergedAudioUrl) return;

    if (mergedAudioRef.current) {
      mergedAudioRef.current.pause();
      unregisterAudio(mergedAudioRef.current);
      mergedAudioRef.current = null;
    }

    const audio = new Audio(mergedAudioUrl);
    registerAudio(audio);
    mergedAudioRef.current = audio;
    audio.onended = () => { unregisterAudio(audio); mergedAudioRef.current = null; };
    audio.play().catch(() => { unregisterAudio(audio); mergedAudioRef.current = null; });
  }, [mergedAudioUrl]);

  // ===============================
  // 다운로드
  // ===============================
  const handleDownload = useCallback(() => {
    if (!mergedAudioUrl) return;
    const charName = (activeSpeaker?.name || '나레이션').replace(/[/\\?%*:|"<>\s]/g, '');
    const a = document.createElement('a');
    a.href = mergedAudioUrl;
    a.download = `${charName}_전체.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mergedAudioUrl, activeSpeaker]);

  // ===============================
  // 라인 편집 핸들러
  // ===============================
  const handleEditLine = useCallback(
    (lineId: string, text: string) => {
      // 텍스트가 바뀌면 audioUrl 초기화 (재생성 필요)
      updateLine(lineId, { text, audioUrl: undefined, ttsStatus: 'idle' });
    },
    [updateLine],
  );

  const handleAddAfter = useCallback(
    (lineId: string) => {
      addLineAfter(lineId, '(새 문장을 입력하세요)');
    },
    [addLineAfter],
  );

  const handleMergeNext = useCallback(
    (lineId: string) => {
      mergeLineWithNext(lineId);
    },
    [mergeLineWithNext],
  );

  const handleRemoveLine = useCallback(
    (lineId: string) => {
      removeLine(lineId);
    },
    [removeLine],
  );

  const handleUpdateEmotion = useCallback(
    (lineId: string, emotion: string) => {
      updateLine(lineId, { emotion, audioUrl: undefined, ttsStatus: 'idle' });
    },
    [updateLine],
  );

  const handleUpdateSpeed = useCallback(
    (lineId: string, speed: number) => {
      updateLine(lineId, { lineSpeed: speed, audioUrl: undefined, ttsStatus: 'idle' });
    },
    [updateLine],
  );

  // ===============================
  // 줄별 화자 변경 (#418)
  // ===============================
  const handleChangeSpeaker = useCallback(
    (lineId: string, speakerId: string) => {
      updateLine(lineId, { speakerId, audioUrl: undefined, ttsStatus: 'idle' });
    },
    [updateLine],
  );

  const handleApplyDirectScript = useCallback(() => {
    if (!directScript.trim()) return;
    const sentences = splitBySentenceEndings(directScript);
    const store = useSoundStudioStore.getState();
    let speakerId = store.speakers[0]?.id || '';
    if (!speakerId) {
      const newSpeaker = {
        id: `speaker-${Date.now()}`, name: '화자 1', color: '#6366f1',
        engine: 'typecast' as const, voiceId: '', language: 'ko' as const,
        speed: 1.0, pitch: 0, stability: 0.5, similarityBoost: 0.75,
        style: 0, useSpeakerBoost: true, lineCount: sentences.length, totalDuration: 0,
      };
      store.addSpeaker(newSpeaker);
      speakerId = newSpeaker.id;
    }
    const ts = Date.now();
    // Scene[] + ScriptLine[] 동시 생성 (sceneId로 1:1 연결)
    const newScenes: Scene[] = sentences.map((text, i) => ({
      id: `scene-${ts}-${i}`,
      scriptText: text, audioScript: text, visualPrompt: '',
      visualDescriptionKO: '', characterPresent: false,
      isGeneratingImage: false, isGeneratingVideo: false, isNativeHQ: false,
    }));
    useProjectStore.getState().setScenes(newScenes);
    setLines(sentences.map((text, i) => ({
      id: `line-${ts}-${i}`, speakerId, text, index: i,
      ttsStatus: 'idle' as const, sceneId: `scene-${ts}-${i}`,
    })));
  }, [directScript, setLines]);

  // ===============================
  // 수정된 라인만 재생성 & 병합
  // ===============================
  const handleRegenerateModified = useCallback(async () => {
    if (!requireAuth('나레이션 재생성')) return;
    if (isGeneratingTTS || lines.length === 0) return;
    if (!activeSpeaker) return;

    const modifiedLines = lines.filter((l) => !l.audioUrl || l.ttsStatus === 'idle' || l.ttsStatus === 'error');
    if (modifiedLines.length === 0) return;

    setIsGeneratingTTS(true);
    setTtsProgress({ current: 0, total: modifiedLines.length });

    try {
      for (let i = 0; i < modifiedLines.length; i++) {
        await handleGenerateLine(modifiedLines[i].id);
        setTtsProgress({ current: i + 1, total: modifiedLines.length });
      }

      // 전체 병합 (기존+신규 모두)
      const updatedLines = useSoundStudioStore.getState().lines;
      const audioUrls = updatedLines
        .filter((l) => l.audioUrl)
        .map((l) => l.audioUrl as string);

      if (audioUrls.length > 0) {
        const mergedUrl = await mergeAudioFiles(audioUrls);
        setMergedAudio(mergedUrl);

        let currentTime = 0;
        const timedLines = updatedLines.map((line) => {
          const duration = line.duration || 3;
          const startTime = currentTime;
          const endTime = currentTime + duration;
          currentTime = endTime;
          return { ...line, startTime, endTime };
        });
        setLines(timedLines);

        // Scene 타이밍 동기화
        for (const tl of timedLines) {
          if (tl.sceneId) {
            useProjectStore.getState().updateScene(tl.sceneId, {
              audioDuration: tl.duration, startTime: tl.startTime, endTime: tl.endTime,
            });
          }
        }
      }
    } catch (err) {
      console.error('[NarrationView] 수정 재생성 실패:', err);
    } finally {
      setIsGeneratingTTS(false);
      setTtsProgress(null);
    }
  }, [
    isGeneratingTTS,
    lines,
    activeSpeaker,
    handleGenerateLine,
    setIsGeneratingTTS,
    setTtsProgress,
    setMergedAudio,
    setLines,
  ]);

  const handleGoToImageVideo = useCallback(() => {
    transferSoundToImageVideo();
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* 툴바 */}
      <NarrationToolbar
        speaker={activeSpeaker}
        onOpenVoiceBrowser={() => setShowVoiceBrowser((v) => !v)}
        globalEmotion={globalEmotion}
        setGlobalEmotion={setGlobalEmotion}
        globalSpeed={globalSpeed}
        setGlobalSpeed={setGlobalSpeed}
        smartEmotion={smartEmotion}
        setSmartEmotion={setSmartEmotion}
        isGenerating={isGeneratingTTS}
        onGenerateAll={handleGenerateAll}
        onPlayAll={handlePlayAll}
        onDownload={handleDownload}
        mergedAudioUrl={mergedAudioUrl}
      />

      {/* 안내 배너 */}
      {lines.length > 0 && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700/50 text-xs text-gray-400 flex items-center gap-2">
          <span className="text-purple-400 font-semibold">{lines.length}개</span>
          <span>문장 - 종결어미 기준 분할</span>
          {activeSpeaker && (
            <span className="ml-auto text-gray-500">
              음성: {activeSpeaker.name} ({activeSpeaker.voiceId})
            </span>
          )}
        </div>
      )}

      {/* 음성 브라우저 패널 (VoiceStudio 전체 임베드) */}
      {showVoiceBrowser && (
        <div className="border-b border-gray-700 max-h-[60vh] overflow-auto">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700/50 sticky top-0 z-10">
            <span className="text-sm font-bold text-purple-300">🎭 음성 브라우저 — 캐릭터를 선택하세요</span>
            <button type="button" onClick={() => setShowVoiceBrowser(false)}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-600/50 transition-colors">
              닫기 ✕
            </button>
          </div>
          <Suspense fallback={<div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin" /></div>}>
            <VoiceStudio />
          </Suspense>
        </div>
      )}

      {/* 대본 직접 입력 */}
      {lines.length === 0 && (
        <div className="px-4 py-4 border-b border-gray-700/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-gray-400">📝 대본 직접 입력</span>
            <span className="text-sm text-cyan-300/70 font-medium">대본을 입력하면 종결어미 기준으로 자동 분할됩니다</span>
          </div>
          <textarea
            value={directScript}
            onChange={(e) => setDirectScript(e.target.value)}
            placeholder="대본을 여기에 입력하세요. 종결어미(~다/~죠/~요/~습니다) 기준으로 자동 분할됩니다."
            rows={6}
            className="w-full bg-gray-800/30 text-gray-200 p-4 text-base leading-relaxed rounded-xl border border-gray-700/40 focus:outline-none focus:border-blue-500/30 resize-none placeholder-gray-600"
          />
          <button onClick={handleApplyDirectScript} disabled={!directScript.trim()}
            className="mt-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white rounded-lg text-sm font-bold transition-all">
            대본 적용 (종결어미 기준 분할)
          </button>
        </div>
      )}

      {/* 라인 목록 */}
      <div className="flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-4xl mb-3 opacity-30">&#127908;</div>
            <p className="text-sm font-medium">나레이션 문장이 없습니다</p>
            <p className="text-xs mt-1">대본 작성 탭에서 대본을 전송하면 자동 분할됩니다</p>
          </div>
        ) : (
          lines.map((line, idx) => {
            // 캐릭터 음성 라인은 행 번호에서 제외
            const lineNumber = line.voiceName
              ? null
              : lines.slice(0, idx).filter(l => !l.voiceName).length + 1;
            return (<NarrationLineItem
              key={line.id}
              line={line}
              index={idx}
              lineNumber={lineNumber}
              isLast={idx === lines.length - 1}
              speaker={speakers.find(s => s.id === line.speakerId) || activeSpeaker}
              speakers={speakers}
              globalEmotion={globalEmotion}
              globalSpeed={globalSpeed}
              smartEmotion={smartEmotion}
              onGenerateLine={handleGenerateLine}
              onPlayLine={handlePlayLine}
              onEditLine={handleEditLine}
              onAddAfter={handleAddAfter}
              onMergeNext={handleMergeNext}
              onRemoveLine={handleRemoveLine}
              onUpdateEmotion={handleUpdateEmotion}
              onUpdateSpeed={handleUpdateSpeed}
              onChangeSpeaker={handleChangeSpeaker}
            />);
          })
        )}
      </div>

      {/* 크레딧 바 */}
      <NarrationCreditBar
        lines={lines}
        isGenerating={isGeneratingTTS}
        progress={ttsProgress}
        onGenerateAll={handleGenerateAll}
        onRegenerateModified={handleRegenerateModified}
      />

      {/* 다음 단계: 이미지/영상으로 이동 */}
      {lines.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700/30 bg-gray-800/30 space-y-2">
          {/* 완료 상태 표시 */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className={lines.filter(l => l.ttsStatus === 'done').length === lines.length ? 'text-green-400' : 'text-yellow-400'}>
              TTS: {lines.filter(l => l.ttsStatus === 'done').length}/{lines.length}
            </span>
            {mergedAudioUrl && <span className="text-green-400">병합 ✓</span>}
            {useSoundStudioStore.getState().pendingEditedAudioUrl && (
              <span className="text-yellow-400">무음 제거 미적용 (자동 적용됨)</span>
            )}
          </div>
          {/* 미리듣기 */}
          {mergedAudioUrl && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handlePlayAll}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-bold border border-gray-600 transition-colors flex items-center gap-1.5">
                ▶ 전체 미리듣기
              </button>
            </div>
          )}
          {/* 전환 버튼 */}
          <button onClick={handleGoToImageVideo}
            disabled={lines.filter(l => l.ttsStatus === 'done').length === 0}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500
              disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold
              border border-blue-400/40 shadow-lg transition-all flex items-center justify-center gap-2">
            🎬 이미지/영상 생성으로 이동 ({lines.length}개 장면) →
          </button>
          <p className="text-center text-xs text-cyan-300/60 font-medium">
            {lines.length}개 단락 = {lines.length}개 장면, 오디오+자막 매칭 상태로 이동
          </p>
        </div>
      )}
    </div>
  );
};

export default NarrationView;
