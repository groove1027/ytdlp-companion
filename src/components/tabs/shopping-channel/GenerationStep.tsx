import React, { useCallback, useRef, useState } from 'react';
import { useShoppingChannelStore } from '../../../stores/shoppingChannelStore';
import { runPipeline, generateSceneImage, generateSceneVideo, SECTION_LABELS } from '../../../services/shoppingChannelService';
import { useCostStore } from '../../../stores/costStore';
import { logger } from '../../../services/LoggerService';
import { showToast } from '../../../stores/uiStore';

const PHASE_LABELS: Record<string, string> = {
  idle: '대기',
  uploading: '업로드 중',
  analyzing: '분석 중',
  'generating-scripts': '대본 생성 중',
  'generating-images': '이미지 생성 중',
  'generating-videos': '영상 생성 중',
  done: '완료',
  error: '오류 발생',
};

const GenerationStep: React.FC = () => {
  const {
    scenes, product, characterConfig, videoModel, aspectRatio,
    isGenerating, generationPhase,
    updateScene, setScenes, setIsGenerating, setGenerationPhase, goToStep,
  } = useShoppingChannelStore();
  const { costStats, exchangeRate } = useCostStore();

  const abortRef = useRef<AbortController | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setIsGenerating(true);
    setGenerationPhase('generating-images');
    abortRef.current = new AbortController();

    try {
      await runPipeline(
        scenes,
        product.imageUrls.filter(Boolean),
        characterConfig.referenceImageUrl,
        videoModel,
        aspectRatio,
        abortRef.current.signal,
        (id, patch) => updateScene(id, patch),
        (phase) => setGenerationPhase(phase as ReturnType<typeof useShoppingChannelStore.getState>['generationPhase']),
      );
    } catch (err) {
      if (err instanceof Error && err.message !== 'Cancelled') {
        showToast(err.message);
        setGenerationPhase('error');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [scenes, product, characterConfig, videoModel, aspectRatio, updateScene, setIsGenerating, setGenerationPhase]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setGenerationPhase('idle');
    showToast('생성이 취소되었습니다.');
  }, [setIsGenerating, setGenerationPhase]);

  const handleRetryImage = useCallback(async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setRetryingId(sceneId);
    updateScene(sceneId, { isGeneratingImage: true, imageError: null });
    try {
      const url = await generateSceneImage(scene, product.imageUrls.filter(Boolean), characterConfig.referenceImageUrl, aspectRatio);
      updateScene(sceneId, { imageUrl: url, isGeneratingImage: false });
    } catch (err) {
      updateScene(sceneId, { isGeneratingImage: false, imageError: err instanceof Error ? err.message : '재시도 실패' });
    } finally {
      setRetryingId(null);
    }
  }, [scenes, product, characterConfig, aspectRatio, updateScene]);

  const handleRetryVideo = useCallback(async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.imageUrl) return;
    setRetryingId(sceneId);
    updateScene(sceneId, { isGeneratingVideo: true, videoError: null, progress: 0 });
    try {
      const url = await generateSceneVideo(scene, videoModel, aspectRatio, undefined, (p) => updateScene(sceneId, { progress: p }));
      updateScene(sceneId, { videoUrl: url, isGeneratingVideo: false, progress: 100 });
    } catch (err) {
      updateScene(sceneId, { isGeneratingVideo: false, videoError: err instanceof Error ? err.message : '재시도 실패' });
    } finally {
      setRetryingId(null);
    }
  }, [scenes, videoModel, aspectRatio, updateScene]);

  const handleDownload = useCallback(async (url: string, filename: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      logger.trackSwallowedError('GenerationStep:downloadFile', e);
      window.open(url, '_blank');
    }
  }, []);

  const totalScenes = scenes.length;
  const doneImages = scenes.filter(s => s.imageUrl).length;
  const doneVideos = scenes.filter(s => s.videoUrl).length;
  const estimatedCost = totalScenes * (videoModel === 'veo' ? 0.25 : 0.21);
  const allDone = doneVideos === totalScenes && totalScenes > 0;

  return (
    <div className="space-y-6">
      {/* 전체 진행 상태 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">🚀</span>
            영상 생성
          </h3>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
              generationPhase === 'done' ? 'bg-green-600/20 text-green-400 border border-green-500/30' :
              generationPhase === 'error' ? 'bg-red-600/20 text-red-400 border border-red-500/30' :
              isGenerating ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' :
              'bg-gray-700/50 text-gray-400 border border-gray-600/30'
            }`}>
              {PHASE_LABELS[generationPhase] || generationPhase}
            </span>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">이미지</div>
            <div className="text-lg font-bold text-white">{doneImages}/{totalScenes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">영상</div>
            <div className="text-lg font-bold text-white">{doneVideos}/{totalScenes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">예상 비용</div>
            <div className="text-lg font-bold text-cyan-400">~${estimatedCost.toFixed(2)}</div>
            <div className="text-[10px] text-gray-500">≈ {Math.round(estimatedCost * exchangeRate).toLocaleString()}원</div>
          </div>
        </div>

        {/* 시작/취소 버튼 */}
        {!isGenerating && !allDone && (
          <button
            onClick={handleStart}
            className="w-full py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30 transition-all"
          >
            전체 생성 시작 ({totalScenes}장면)
          </button>
        )}
        {isGenerating && (
          <button
            onClick={handleCancel}
            className="w-full py-4 rounded-xl text-lg font-bold bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-all"
          >
            생성 취소
          </button>
        )}
      </div>

      {/* 장면별 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene) => (
          <div key={scene.id} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
            {/* 장면 헤더 */}
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-cyan-600/30 text-cyan-400 rounded-full flex items-center justify-center text-xs font-bold">
                  {scene.sceneIndex + 1}
                </span>
                <span className="text-sm font-bold text-white">{SECTION_LABELS[scene.section]}</span>
              </div>
              {scene.videoUrl && (
                <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-[10px] rounded border border-green-500/30">완료</span>
              )}
            </div>

            {/* 미디어 미리보기 */}
            <div className="aspect-video bg-gray-900/50 relative">
              {scene.videoUrl ? (
                <video src={scene.videoUrl} controls className="w-full h-full object-cover" />
              ) : scene.imageUrl ? (
                <img src={scene.imageUrl} alt={scene.section} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  {scene.isGeneratingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" />
                      <span className="text-xs">이미지 생성 중...</span>
                    </div>
                  ) : scene.isGeneratingVideo ? (
                    <div className="flex flex-col items-center gap-2 w-full px-6">
                      <div className="w-6 h-6 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" />
                      <span className="text-xs">영상 생성 중... {scene.progress}%</span>
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                          className="bg-cyan-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${scene.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs">대기 중</span>
                  )}
                </div>
              )}

              {/* 에러 오버레이 */}
              {(scene.imageError || scene.videoError) && (
                <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
                  <span className="text-xs text-red-300 px-2 text-center">{scene.imageError || scene.videoError}</span>
                </div>
              )}
            </div>

            {/* 대본 스니펫 + 액션 */}
            <div className="p-3">
              <p className="text-xs text-gray-400 line-clamp-2 mb-2">{scene.scriptText}</p>
              <div className="flex gap-1.5">
                {scene.imageError && (
                  <button
                    onClick={() => handleRetryImage(scene.id)}
                    disabled={retryingId === scene.id}
                    className="px-2 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded text-xs hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    이미지 재시도
                  </button>
                )}
                {scene.videoError && scene.imageUrl && (
                  <button
                    onClick={() => handleRetryVideo(scene.id)}
                    disabled={retryingId === scene.id}
                    className="px-2 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded text-xs hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    영상 재시도
                  </button>
                )}
                {scene.videoUrl && (
                  <button
                    onClick={() => handleDownload(scene.videoUrl!, `scene_${scene.sceneIndex + 1}_${scene.section}.mp4`)}
                    className="px-2 py-1 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded text-xs hover:bg-cyan-600/30 transition-colors"
                  >
                    다운로드
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 완료 시 비용 요약 */}
      {allDone && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6 text-center">
          <div className="text-2xl mb-2">🎉</div>
          <p className="text-green-400 font-bold text-lg mb-1">모든 장면 생성 완료!</p>
          <p className="text-gray-400 text-sm">
            총 비용: ${costStats.totalUsd.toFixed(2)} (≈ {Math.round(costStats.totalUsd * exchangeRate).toLocaleString()}원)
          </p>
        </div>
      )}

      {/* 네비게이션 */}
      <div className="flex justify-between">
        <button
          onClick={() => goToStep('script')}
          disabled={isGenerating}
          className="px-6 py-3 bg-gray-700 text-gray-300 border border-gray-600 rounded-xl font-bold hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          ← 이전
        </button>
      </div>
    </div>
  );
};

export default GenerationStep;
