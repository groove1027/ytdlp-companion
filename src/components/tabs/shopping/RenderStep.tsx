import React, { useEffect, useCallback, useRef } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { renderShoppingShort, downloadRenderedVideo } from '../../../services/shoppingRenderService';
import { generateTypecastTTS } from '../../../services/typecastService';
import { generateElevenLabsDialogueTTS } from '../../../services/elevenlabsService';
import { generateSupertonicTTS } from '../../../services/ttsService';
import { showToast } from '../../../stores/uiStore';
import type { ShoppingRenderPhase } from '../../../types';

const RENDER_PHASES: { phase: ShoppingRenderPhase; label: string; icon: string }[] = [
  { phase: 'generating-tts', label: 'TTS 생성', icon: '🎙️' },
  { phase: 'removing-subtitles', label: '자막 제거', icon: '🔲' },
  { phase: 'overlaying-subtitles', label: '자막 합성', icon: '📝' },
  { phase: 'mixing-audio', label: '오디오 합성', icon: '🔊' },
  { phase: 'encoding', label: '인코딩', icon: '⚙️' },
  { phase: 'done', label: '완료', icon: '✅' },
];

const RenderStep: React.FC = () => {
  const {
    sourceVideo,
    generatedScripts,
    selectedScriptId,
    ttsEngine, ttsVoiceId, ttsSpeed,
    subtitleTemplate,
    subtitleRemovalMethod,
    ctaPreset, ctaText,
    renderProgress, setRenderProgress,
    resultBlobUrl, setResultBlobUrl,
    isRendering, setIsRendering,
    goToStep,
  } = useShoppingShortStore();

  const hasStarted = useRef(false);

  const selectedScript = generatedScripts.find(s => s.id === selectedScriptId);

  // 전체 렌더 실행
  const startRender = useCallback(async () => {
    if (!sourceVideo?.videoBlob || !selectedScript) return;
    if (isRendering) return;

    setIsRendering(true);
    setResultBlobUrl(null);

    try {
      // 1. TTS 생성
      setRenderProgress({ phase: 'generating-tts', percent: 5, message: 'TTS 음성 생성 중...' });

      let ttsAudioUrl: string;
      const text = selectedScript.fullText;

      if (ttsEngine === 'typecast') {
        const result = await generateTypecastTTS(text, {
          voiceId: ttsVoiceId,
          speed: ttsSpeed,
        });
        ttsAudioUrl = result.audioUrl;
      } else if (ttsEngine === 'elevenlabs') {
        const result = await generateElevenLabsDialogueTTS({
          text,
          voiceId: ttsVoiceId || undefined,
        });
        ttsAudioUrl = result.audioUrl;
      } else {
        const result = await generateSupertonicTTS(text, ttsVoiceId, 'ko', ttsSpeed);
        ttsAudioUrl = result.audioUrl;
      }

      setRenderProgress({ phase: 'removing-subtitles', percent: 25, message: '렌더 파이프라인 시작...' });

      // 2. 렌더 실행
      const resultBlob = await renderShoppingShort(
        sourceVideo.videoBlob,
        selectedScript,
        ttsAudioUrl,
        {
          subtitleRemovalMethod,
          fontFamily: subtitleTemplate?.fontFamily || 'Pretendard',
          fontSize: subtitleTemplate?.fontSize || 40,
          ctaPreset,
          ctaText,
        },
        (progress) => setRenderProgress(progress),
      );

      const blobUrl = URL.createObjectURL(resultBlob);
      setResultBlobUrl(blobUrl);
      setRenderProgress({ phase: 'done', percent: 100, message: '렌더링 완료!' });
      showToast('렌더링 완료!');

    } catch (e) {
      const msg = (e as Error).message;
      setRenderProgress({ phase: 'error', percent: 0, message: `오류: ${msg}` });
      showToast(`렌더 실패: ${msg}`);
    } finally {
      setIsRendering(false);
    }
  }, [sourceVideo, selectedScript, ttsEngine, ttsVoiceId, ttsSpeed, subtitleTemplate, subtitleRemovalMethod, ctaPreset, ctaText, isRendering, setIsRendering, setResultBlobUrl, setRenderProgress]);

  // 자동 시작 (렌더 스텝 진입 시 1회)
  useEffect(() => {
    if (!hasStarted.current && sourceVideo?.videoBlob && selectedScript) {
      hasStarted.current = true;
      startRender();
    }
  }, [sourceVideo, selectedScript, startRender]);

  const currentPhaseIndex = RENDER_PHASES.findIndex(p => p.phase === renderProgress.phase);

  const handleDownload = useCallback(() => {
    if (!resultBlobUrl) return;
    fetch(resultBlobUrl)
      .then(r => r.blob())
      .then(blob => downloadRenderedVideo(blob, `shopping-short-${Date.now()}.mp4`));
  }, [resultBlobUrl]);

  return (
    <div className="space-y-6">
      {/* 뒤로 버튼 (렌더 중이 아닐 때만) */}
      {!isRendering && (
        <button
          onClick={() => { hasStarted.current = false; goToStep('script'); }}
          className="text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
        >
          ← 대본 선택으로
        </button>
      )}

      {/* 파이프라인 진행 표시 */}
      <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/40">
        <h3 className="text-lg font-bold text-gray-100 mb-6">렌더링 파이프라인</h3>

        <div className="flex items-center justify-between mb-6">
          {RENDER_PHASES.map((phase, i) => {
            const isDone = currentPhaseIndex > i;
            const isCurrent = currentPhaseIndex === i;

            return (
              <React.Fragment key={phase.phase}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                    isDone ? 'bg-green-600/30 border border-green-500/50' :
                    isCurrent ? 'bg-lime-600/30 border border-lime-500/50 animate-pulse' :
                    'bg-gray-800/60 border border-gray-700/40'
                  }`}>
                    {phase.icon}
                  </div>
                  <span className={`text-xs font-medium ${
                    isDone ? 'text-green-400' :
                    isCurrent ? 'text-lime-300' :
                    'text-gray-600'
                  }`}>
                    {phase.label}
                  </span>
                </div>
                {i < RENDER_PHASES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    isDone ? 'bg-green-500/50' :
                    isCurrent ? 'bg-lime-500/30' :
                    'bg-gray-700/40'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full bg-gray-700/40 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              renderProgress.phase === 'error' ? 'bg-red-500' :
              renderProgress.phase === 'done' ? 'bg-green-500' :
              'bg-gradient-to-r from-lime-500 to-green-500'
            }`}
            style={{ width: `${renderProgress.percent}%` }}
          />
        </div>
        <p className={`mt-2 text-sm ${
          renderProgress.phase === 'error' ? 'text-red-400' :
          renderProgress.phase === 'done' ? 'text-green-400' :
          'text-gray-400'
        }`}>
          {renderProgress.message || '대기 중...'}
        </p>
      </div>

      {/* 결과 미리보기 */}
      {resultBlobUrl && (
        <div className="bg-gray-800/40 rounded-2xl p-6 border border-green-500/20">
          <h3 className="text-lg font-bold text-green-300 mb-4">완성된 영상</h3>
          <div className="rounded-xl overflow-hidden bg-black mb-4">
            <video
              src={resultBlobUrl}
              controls
              className="w-full max-h-[450px]"
              style={{ objectFit: 'contain' }}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-green-600 to-lime-600 hover:from-green-500 hover:to-lime-500 text-white transition-all"
            >
              MP4 다운로드
            </button>
            <button
              onClick={() => { hasStarted.current = false; goToStep('script'); }}
              className="px-6 py-3 rounded-xl font-bold text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 transition-all"
            >
              다시 설정
            </button>
          </div>
        </div>
      )}

      {/* 에러 시 재시도 */}
      {renderProgress.phase === 'error' && !isRendering && (
        <button
          onClick={() => { hasStarted.current = false; startRender(); }}
          className="w-full py-3 rounded-xl font-bold text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 transition-all"
        >
          다시 시도
        </button>
      )}
    </div>
  );
};

export default RenderStep;
