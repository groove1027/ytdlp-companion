import React, { useState, useCallback, useRef } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import {
  downloadFromUrl,
  detectPlatform,
  validateVideoUrl,
  getPlatformInfo,
  extractVideoMetadata,
  extractBlobVideoMetadata,
} from '../../../services/videoDownloadService';
import { extractFramesForAnalysis, analyzeVideoProduct, generateShoppingScripts, detectNarration } from '../../../services/shoppingScriptService';
import { showToast } from '../../../stores/uiStore';

const SourceInputStep: React.FC = () => {
  const {
    sourceUrl, setSourceUrl,
    sourceVideo, setSourceVideo,
    isDownloading, setIsDownloading,
    downloadError, setDownloadError,
    proxyUrl, setProxyUrl,
    isAnalyzing, setIsAnalyzing,
    analysisError, setAnalysisError,
    ctaPreset,
    setProductAnalysis,
    setNarrationText,
    setGeneratedScripts,
    setSelectedScriptId,
    goToStep,
  } = useShoppingShortStore();

  const [showProxySettings, setShowProxySettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platform = sourceUrl ? detectPlatform(sourceUrl) : 'unknown';
  const platformInfo = getPlatformInfo(platform);

  // URL 다운로드
  const handleUrlDownload = useCallback(async () => {
    const validation = validateVideoUrl(sourceUrl);
    if (!validation.valid) {
      setDownloadError(validation.message || '잘못된 URL');
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadFromUrl(sourceUrl, { proxyUrl: proxyUrl || undefined });
      const meta = await extractBlobVideoMetadata(result.blob);
      setSourceVideo({
        originUrl: sourceUrl,
        videoBlob: result.blob,
        videoBlobUrl: URL.createObjectURL(result.blob),
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        thumbnailDataUrl: meta.thumbnailDataUrl,
      });
      showToast('영상 다운로드 완료!');
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setIsDownloading(false);
    }
  }, [sourceUrl, proxyUrl, setIsDownloading, setDownloadError, setSourceVideo]);

  // 파일 업로드 핸들러
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('영상 파일만 업로드 가능합니다.');
      return;
    }
    try {
      const meta = await extractVideoMetadata(file);
      setSourceVideo({
        localFile: file,
        videoBlob: file,
        videoBlobUrl: URL.createObjectURL(file),
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        thumbnailDataUrl: meta.thumbnailDataUrl,
      });
      showToast('파일 로드 완료!');
    } catch (e) {
      showToast((e as Error).message);
    }
  }, [setSourceVideo]);

  // 드래그 & 드롭
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // 분석 시작
  const handleAnalyze = useCallback(async () => {
    if (!sourceVideo?.videoBlob) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress('나레이션 감지 중...');
    try {
      // 1. 나레이션 감지 (원본 영상에 나레이션이 있으면 전사)
      const narration = await detectNarration(
        sourceVideo.videoBlob,
        (msg) => setAnalysisProgress(msg),
      );
      setNarrationText(narration);

      if (narration) {
        setAnalysisProgress('나레이션 감지됨! 프레임 추출 중...');
      } else {
        setAnalysisProgress('나레이션 없음 — 프레임 기반 분석 진행...');
      }

      // 2. 프레임 추출
      const frames = await extractFramesForAnalysis(sourceVideo.videoBlob, 6);

      // 3. 상품 분석 → 프리셋 생성 (나레이션 있으면 함께 전달)
      setAnalysisProgress('AI 상품 프리셋 생성 중...');
      const analysis = await analyzeVideoProduct(frames, narration);
      setProductAnalysis(analysis);

      // 4. v31.0 대본 생성 (나레이션 참고)
      setAnalysisProgress('v31.0 대본 생성 중...');
      const scripts = await generateShoppingScripts(analysis, sourceVideo.duration, ctaPreset, narration);
      setGeneratedScripts(scripts);
      if (scripts.length > 0) setSelectedScriptId(scripts[0].id);

      showToast('프리셋 + 대본 생성 완료!');
      goToStep('script');
    } catch (e) {
      const msg = (e as Error).message;
      setAnalysisError(msg);
      showToast(`분석 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress('');
    }
  }, [sourceVideo, ctaPreset, setIsAnalyzing, setAnalysisError, setProductAnalysis, setGeneratedScripts, setSelectedScriptId, goToStep]);

  return (
    <div className="space-y-6">
      {/* URL 입력 */}
      <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/40">
        <h3 className="text-lg font-bold text-gray-100 mb-4">영상 URL 입력</h3>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={sourceUrl}
              onChange={e => { setSourceUrl(e.target.value); setDownloadError(null); }}
              placeholder="TikTok / Douyin / Xiaohongshu URL 붙여넣기"
              className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/40 rounded-xl text-gray-200 text-sm placeholder-gray-500 focus:border-lime-500/50 focus:outline-none"
            />
            {sourceUrl && platform !== 'unknown' && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${platformInfo.color}`}>
                {platformInfo.label}
              </span>
            )}
          </div>
          <button
            onClick={handleUrlDownload}
            disabled={!sourceUrl.trim() || isDownloading}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
              isDownloading
                ? 'bg-lime-600/30 text-lime-300 cursor-wait'
                : !sourceUrl.trim()
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500 text-white'
            }`}
          >
            {isDownloading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                다운로드 중
              </span>
            ) : '다운로드'}
          </button>
        </div>
        {downloadError && (
          <p className="mt-2 text-sm text-red-400">{downloadError}</p>
        )}

        {/* 프록시 설정 */}
        <button
          onClick={() => setShowProxySettings(!showProxySettings)}
          className="mt-3 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          {showProxySettings ? '▼' : '▶'} 프록시 설정
        </button>
        {showProxySettings && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              placeholder="프록시 URL (선택사항)"
              className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-700/40 rounded-lg text-sm text-gray-300 placeholder-gray-600"
            />
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-gray-700/60" />
        <span className="text-gray-500 text-sm font-bold">OR</span>
        <div className="flex-1 h-px bg-gray-700/60" />
      </div>

      {/* 파일 드래그 & 드롭 */}
      <div
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-lime-500/60 bg-lime-900/10'
            : 'border-gray-600/40 bg-gray-800/20 hover:border-gray-500/60'
        }`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
        <div className="text-4xl mb-3">📁</div>
        <p className="text-gray-300 font-semibold">파일을 드래그하거나 클릭하여 업로드</p>
        <p className="text-gray-500 text-sm mt-1">MP4, MOV, WebM 지원</p>
      </div>

      {/* 비디오 미리보기 */}
      {sourceVideo?.videoBlobUrl && (
        <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/40">
          <h3 className="text-lg font-bold text-gray-100 mb-4">영상 미리보기</h3>
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video
              src={sourceVideo.videoBlobUrl}
              controls
              className="w-full max-h-[400px]"
              style={{ objectFit: 'contain' }}
            />
          </div>
          <div className="flex gap-4 mt-3 text-sm text-gray-400">
            <span>길이: {Math.round(sourceVideo.duration)}초</span>
            <span>해상도: {sourceVideo.width}x{sourceVideo.height}</span>
          </div>

          {/* 분석 시작 버튼 */}
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={`mt-4 w-full py-4 rounded-xl font-bold text-base transition-all ${
              isAnalyzing
                ? 'bg-lime-600/30 text-lime-300 cursor-wait'
                : 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500 text-white shadow-lg shadow-lime-900/30'
            }`}
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                {analysisProgress || 'AI 분석 중...'}
              </span>
            ) : '분석 시작 (나레이션 감지 → 상품 분석 → 대본 생성)'}
          </button>

          {analysisError && (
            <p className="mt-2 text-sm text-red-400">{analysisError}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SourceInputStep;
