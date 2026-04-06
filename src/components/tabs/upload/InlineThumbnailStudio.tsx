import React, { useState, useRef, useCallback, Suspense } from 'react';
import type { Thumbnail, VideoFormat } from '../../../types';
import { analyzeStyleReference } from '../../../services/geminiService';
import { resizeImage } from '../../../services/imageProcessingService';
import { useCostStore } from '../../../stores/costStore';
import { useUploadStore } from '../../../stores/uploadStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useUIStore, showToast } from '../../../stores/uiStore';
import { extractYouTubeVideoId, fetchYouTubeThumbnail } from '../../../utils/thumbnailUtils';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { logger } from '../../../services/LoggerService';
import { lazyRetry } from '../../../utils/retryImport';
import { getSceneNarrationText } from '../../../utils/sceneText';

const ThumbnailGenerator = lazyRetry(() => import('../../ThumbnailGenerator'));

// --- 컴포넌트 ---

interface InlineThumbnailStudioProps {
  onClose: () => void;
}

const InlineThumbnailStudio: React.FC<InlineThumbnailStudioProps> = ({ onClose }) => {
  const setThumbnail = useUploadStore((s) => s.setThumbnail);
  const addCost = useCostStore((s) => s.addCost);

  const finalScript = useScriptWriterStore((s) => s.finalScript);
  const scenes = useProjectStore((s) => s.scenes);
  const config = useProjectStore((s) => s.config);

  // Phase
  const [phase, setPhase] = useState<'setup' | 'studio'>('setup');
  const [mode, setMode] = useState<'random' | 'reference'>('reference');

  // Reference state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | undefined>();
  const [extractedStyle, setExtractedStyle] = useState<string | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const elapsed = useElapsedTimer(isAnalyzing);
  const [isFetchingThumb, setIsFetchingThumb] = useState(false);

  // Thumbnails
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  // 대본 자동 연동
  const scriptText = finalScript?.trim()
    ? finalScript
    : scenes.map((scene) => getSceneNarrationText(scene)).filter(Boolean).join('\n');

  const videoFormat = config?.videoFormat === 'short-form'
    ? ('short-form' as VideoFormat)
    : ('long-form' as VideoFormat);

  const atmosphere = config?.atmosphere || config?.detectedStyleDescription || 'Cinematic';

  // YouTube 썸네일 가져오기
  const handleFetchYouTube = useCallback(async () => {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) { showToast('유효한 YouTube URL을 입력해주세요.'); return; }
    setIsFetchingThumb(true);
    try {
      const base64 = await fetchYouTubeThumbnail(videoId);
      setReferenceImage(base64);
      setExtractedStyle(undefined);
    } catch (e) {
      logger.trackSwallowedError('InlineThumbnailStudio:fetchYouTubeThumbnail', e);
      showToast('YouTube 썸네일을 가져올 수 없습니다.');
    } finally {
      setIsFetchingThumb(false);
    }
  }, [youtubeUrl]);

  // 파일 업로드
  const handleRefFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImage(file, 1024);
      setReferenceImage(resized);
      setExtractedStyle(undefined);
    } catch (e) {
      logger.trackSwallowedError('InlineThumbnailStudio:handleRefFileChange', e);
      showToast('이미지를 처리할 수 없습니다.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // AI 스타일 분석
  const handleAnalyze = useCallback(async () => {
    if (!referenceImage) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeStyleReference(referenceImage);
      setExtractedStyle(analysis);
      // Cost is auto-tracked inside evolinkChat()
    } catch (e) {
      logger.trackSwallowedError('InlineThumbnailStudio:handleAnalyze', e);
      showToast('스타일 분석에 실패했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [referenceImage, addCost]);

  // 스튜디오 시작
  const handleStartStudio = useCallback(() => {
    if (mode === 'reference' && !extractedStyle && referenceImage) {
      showToast('레퍼런스 이미지를 먼저 AI 분석해주세요.');
      return;
    }
    setPhase('studio');
  }, [mode, extractedStyle, referenceImage]);

  // 썸네일 선택 → 업로드 썸네일로 적용
  const handleThumbnailSelect = useCallback((url: string) => {
    setThumbnail(url);
    useUIStore.getState().openLightbox(url);
  }, [setThumbnail]);

  // --- Setup Phase ---
  if (phase === 'setup') {
    return (
      <div className="mt-4 border border-purple-500/30 rounded-xl p-5 bg-gray-900/50 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            썸네일 스튜디오
            {mode === 'reference' && (
              <span className="text-[11px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">레퍼런스 카피</span>
            )}
          </h4>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">닫기</button>
        </div>

        {/* 모드 선택 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('random')}
            className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${
              mode === 'random'
                ? 'border-pink-500/50 bg-pink-500/10 text-pink-300'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            AI 랜덤 기획
          </button>
          <button
            type="button"
            onClick={() => setMode('reference')}
            className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all ${
              mode === 'reference'
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            레퍼런스 카피
          </button>
        </div>

        {/* 레퍼런스 모드: 이미지 입력 */}
        {mode === 'reference' && (
          <div className="space-y-3">
            {/* YouTube URL */}
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="YouTube URL 입력 → 썸네일 자동 가져오기"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={handleFetchYouTube}
                disabled={isFetchingThumb || !youtubeUrl.trim()}
                className="px-3 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                {isFetchingThumb ? '...' : '가져오기'}
              </button>
            </div>

            {/* 또는 파일 업로드 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">또는</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-sm text-blue-400 hover:text-blue-300 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
              >
                레퍼런스 이미지 업로드
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleRefFileChange} className="hidden" />
            </div>

            {/* 레퍼런스 이미지 미리보기 + AI 분석 */}
            {referenceImage && (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
                <div className="flex gap-3">
                  <img src={referenceImage} alt="Reference" className="w-32 h-auto rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    {extractedStyle ? (
                      <div className="bg-green-900/10 border border-green-500/20 rounded-lg p-2">
                        <p className="text-sm text-green-400 font-bold mb-1">AI 스타일 분석 완료</p>
                        <p className="text-sm text-gray-400 line-clamp-4">{extractedStyle.slice(0, 200)}...</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                      >
                        {isAnalyzing ? (<>AI 스타일 분석 중... {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</>) : 'AI 스타일 분석'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setReferenceImage(undefined); setExtractedStyle(undefined); }}
                      className="text-sm text-gray-500 hover:text-red-400"
                    >
                      레퍼런스 제거
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 대본 연동 상태 */}
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
          scriptText.trim()
            ? 'bg-green-900/10 border-green-500/20 text-green-400'
            : 'bg-yellow-900/10 border-yellow-500/20 text-yellow-400'
        }`}>
          <span>{scriptText.trim() ? '\u2713' : '!'}</span>
          <span>
            {scriptText.trim()
              ? `대본 자동 연동됨 (${scriptText.length}자)`
              : '대본 없음 — 대본 작성 탭에서 먼저 대본을 완성하세요'}
          </span>
        </div>

        {/* 시작 버튼 */}
        <button
          type="button"
          onClick={handleStartStudio}
          disabled={!scriptText.trim()}
          className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-lg text-base font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          썸네일 생성 시작
        </button>
      </div>
    );
  }

  // --- Studio Phase ---
  return (
    <div className="mt-4 border border-purple-500/30 rounded-xl bg-gray-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="text-sm text-gray-400 hover:text-gray-200 bg-gray-700 px-2 py-1 rounded border border-gray-600"
          >
            &larr; 설정
          </button>
          <span className="text-base font-bold text-white">썸네일 스튜디오</span>
          {mode === 'reference' && (
            <span className="text-[11px] bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">레퍼런스 카피</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-400">썸네일 클릭 시 자동 적용</span>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">닫기</button>
        </div>
      </div>

      <div className="p-4">
        <Suspense fallback={
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
            <span className="ml-3 text-gray-400 text-sm">썸네일 스튜디오 로딩 중...</span>
          </div>
        }>
          <ThumbnailGenerator
            script={scriptText}
            styleDescription={atmosphere}
            characterImageBase64={config?.characterImage}
            characterDescription={config?.detectedCharacterDescription || undefined}
            thumbnails={thumbnails}
            setThumbnails={setThumbnails}
            videoFormat={videoFormat}
            onImageClick={handleThumbnailSelect}
            onCostAdd={addCost}
            languageContext={{
              lang: config?.detectedLanguage,
              langName: config?.detectedLanguageName,
              locale: config?.detectedLocale,
              nuance: config?.culturalNuance,
            }}
            globalContext={config?.globalContext}
            initialReferenceImage={mode === 'reference' ? referenceImage : undefined}
            initialExtractedStyle={mode === 'reference' ? extractedStyle : undefined}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default InlineThumbnailStudio;
