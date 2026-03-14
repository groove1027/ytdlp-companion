import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { renderShoppingShort, downloadRenderedVideo } from '../../../services/shoppingRenderService';
import { generateTypecastTTS } from '../../../services/typecastService';
import { generateElevenLabsDialogueTTS } from '../../../services/elevenlabsService';
import { generateSupertonicTTS } from '../../../services/ttsService';
import { showToast } from '../../../stores/uiStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import type { ShoppingRenderPhase } from '../../../types';

const RENDER_PHASES: { phase: ShoppingRenderPhase; label: string; icon: string }[] = [
  { phase: 'generating-tts', label: 'TTS 생성', icon: '🎙️' },
  { phase: 'removing-subtitles', label: 'AI 자막 제거', icon: '🤖' },
  { phase: 'overlaying-subtitles', label: '자막 합성', icon: '📝' },
  { phase: 'mixing-audio', label: '오디오 합성', icon: '🔊' },
  { phase: 'encoding', label: '인코딩', icon: '⚙️' },
  { phase: 'done', label: '완료', icon: '✅' },
];

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

const RenderStep: React.FC = () => {
  const { requireAuth } = useAuthGuard();
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
  const renderStartRef = useRef<number>(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  // 경과 시간 타이머
  useEffect(() => {
    if (!isRendering) { setElapsedSec(0); return; }
    renderStartRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - renderStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRendering]);

  const selectedScript = generatedScripts.find(s => s.id === selectedScriptId);

  // 전체 렌더 실행
  const startRender = useCallback(async () => {
    if (!requireAuth('영상 렌더링')) return;
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
          videoWidth: sourceVideo.width,
          videoHeight: sourceVideo.height,
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
  }, [requireAuth, sourceVideo, selectedScript, ttsEngine, ttsVoiceId, ttsSpeed, subtitleTemplate, subtitleRemovalMethod, ctaPreset, ctaText, isRendering, setIsRendering, setResultBlobUrl, setRenderProgress]);

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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-100">렌더링 파이프라인</h3>
          {isRendering && elapsedSec > 0 && (
            <span className="text-xs text-gray-500 font-mono tabular-nums">
              {formatElapsed(elapsedSec)} 경과
            </span>
          )}
        </div>

        {/* 페이즈 커넥터 */}
        <div className="flex items-center justify-between mb-6">
          {RENDER_PHASES.map((phase, i) => {
            const isDone = currentPhaseIndex > i;
            const isCurrent = currentPhaseIndex === i;

            return (
              <React.Fragment key={phase.phase}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-1 transition-all duration-500 ${
                    isDone ? 'bg-green-500' :
                    isCurrent ? 'bg-gradient-to-r from-green-500 to-gray-700' :
                    'bg-gray-700/40'
                  }`} />
                )}
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isDone ? 'bg-green-600 text-white shadow-lg shadow-green-900/30' :
                    isCurrent ? 'bg-lime-500 text-gray-900 animate-pulse shadow-lg shadow-lime-900/30' :
                    'bg-gray-800 text-gray-500 border border-gray-700'
                  }`}>
                    {isDone ? '\u2713' : phase.icon}
                  </div>
                  <span className={`text-[10px] font-medium whitespace-nowrap ${
                    isDone ? 'text-green-400' :
                    isCurrent ? 'text-lime-300' :
                    'text-gray-600'
                  }`}>
                    {phase.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              renderProgress.phase === 'error' ? 'bg-red-500' :
              renderProgress.phase === 'done' ? 'bg-gradient-to-r from-green-500 to-lime-400' :
              'bg-gradient-to-r from-lime-500 to-green-500'
            }`}
            style={{ width: `${renderProgress.percent}%` }}
          />
        </div>

        {/* 메시지 + 퍼센트 */}
        <div className="flex items-center justify-between mt-2">
          <p className={`text-sm ${
            renderProgress.phase === 'error' ? 'text-red-400' :
            renderProgress.phase === 'done' ? 'text-green-400' :
            'text-gray-400'
          }`}>
            {renderProgress.message || '대기 중...'}
          </p>
          {isRendering && renderProgress.percent > 0 && renderProgress.phase !== 'done' && (
            <span className="text-xs text-lime-400 font-mono tabular-nums">
              {renderProgress.percent}%
            </span>
          )}
        </div>
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
