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
import { extractFramesForAnalysis, analyzeVideoProduct, generateShoppingScripts, analyzeCoupangProduct, generateCoupangShoppingScripts } from '../../../services/shoppingScriptService';
import { crawlCoupangProduct, validateCoupangUrl, testProxyConnection } from '../../../services/coupangCrawlService';
import { generateDeeplink, hasCoupangAffiliateKeys } from '../../../services/coupangAffiliateService';
import { getCoupangProxyUrl, saveCoupangKeys, getCoupangAccessKey, getCoupangSecretKey } from '../../../services/apiService';
import { showToast } from '../../../stores/uiStore';
import { detectNarration } from '../../../services/shoppingScriptService';
import type { ShoppingSourceType } from '../../../types';

// ═══════════════════════════════════════════════════════════════
// 소스 타입 토글
// ═══════════════════════════════════════════════════════════════

const SOURCE_TYPES: { id: ShoppingSourceType; label: string; icon: string; desc: string }[] = [
  { id: 'video', label: '해외 영상', icon: '🎬', desc: 'TikTok / Douyin / 파일' },
  { id: 'coupang', label: '쿠팡 링크', icon: '🛒', desc: '쿠팡 상품 URL' },
];

const SourceInputStep: React.FC = () => {
  const {
    sourceType, setSourceType,
    // Video
    sourceUrl, setSourceUrl,
    sourceVideo, setSourceVideo,
    isDownloading, setIsDownloading,
    downloadError, setDownloadError,
    proxyUrl, setProxyUrl,
    // Coupang
    coupangUrl, setCoupangUrl,
    coupangCrawlResult, setCoupangCrawlResult,
    isCrawling, setIsCrawling,
    crawlError, setCrawlError,
    affiliateLink, setAffiliateLink,
    // Common
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
  const [showCoupangSettings, setShowCoupangSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [crawlProgress, setCrawlProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 쿠팡 설정 로컬 상태
  const [cpAccessKey, setCpAccessKey] = useState(getCoupangAccessKey());
  const [cpSecretKey, setCpSecretKey] = useState(getCoupangSecretKey());
  const [cpProxyUrl, setCpProxyUrl] = useState(getCoupangProxyUrl());
  const [proxyTestResult, setProxyTestResult] = useState<boolean | null>(null);

  const platform = sourceUrl ? detectPlatform(sourceUrl) : 'unknown';
  const platformInfo = getPlatformInfo(platform);

  // ═══════════════════════════════════════════════════════════════
  // Video 소스 핸들러 (기존 로직 유지)
  // ═══════════════════════════════════════════════════════════════

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // 영상 기반 분석
  const handleVideoAnalyze = useCallback(async () => {
    if (!sourceVideo?.videoBlob) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress('나레이션 감지 중...');
    try {
      const narration = await detectNarration(sourceVideo.videoBlob, (msg) => setAnalysisProgress(msg));
      setNarrationText(narration);
      setAnalysisProgress(narration ? '나레이션 감지됨! 프레임 추출 중...' : '프레임 기반 분석 진행...');
      const frames = await extractFramesForAnalysis(sourceVideo.videoBlob, 6);
      setAnalysisProgress('AI 상품 프리셋 생성 중...');
      const analysis = await analyzeVideoProduct(frames, narration);
      setProductAnalysis(analysis);
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
  }, [sourceVideo, ctaPreset, setIsAnalyzing, setAnalysisError, setProductAnalysis, setGeneratedScripts, setSelectedScriptId, goToStep, setNarrationText]);

  // ═══════════════════════════════════════════════════════════════
  // 쿠팡 소스 핸들러
  // ═══════════════════════════════════════════════════════════════

  const handleCoupangCrawl = useCallback(async () => {
    const validation = validateCoupangUrl(coupangUrl);
    if (!validation.valid) {
      setCrawlError(validation.message || '잘못된 URL');
      return;
    }
    setIsCrawling(true);
    setCrawlError(null);
    setCrawlProgress('크롤링 시작...');
    try {
      const result = await crawlCoupangProduct(coupangUrl, (msg) => setCrawlProgress(msg));
      setCoupangCrawlResult(result);
      setCrawlProgress('크롤링 완료!');
      showToast(`${result.product.productName} — 크롤링 완료!`);
    } catch (e) {
      const msg = (e as Error).message;
      setCrawlError(msg);
      showToast(`크롤링 실패: ${msg}`);
    } finally {
      setIsCrawling(false);
      setCrawlProgress('');
    }
  }, [coupangUrl, setIsCrawling, setCrawlError, setCoupangCrawlResult]);

  // 쿠팡 데이터 기반 분석 + 대본 생성
  const handleCoupangAnalyze = useCallback(async () => {
    if (!coupangCrawlResult) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress('AI 상품 분석 중...');
    try {
      const analysis = await analyzeCoupangProduct(coupangCrawlResult);
      setProductAnalysis(analysis);
      setNarrationText(null); // 쿠팡은 나레이션 없음

      setAnalysisProgress('v31.0 대본 생성 중...');
      const scripts = await generateCoupangShoppingScripts(analysis, coupangCrawlResult, ctaPreset);
      setGeneratedScripts(scripts);
      if (scripts.length > 0) setSelectedScriptId(scripts[0].id);

      // 딥링크 생성 시도 (키가 있으면)
      if (hasCoupangAffiliateKeys()) {
        setAnalysisProgress('어필리에이트 딥링크 생성 중...');
        try {
          const links = await generateDeeplink([coupangCrawlResult.product.productUrl]);
          if (links.length > 0) setAffiliateLink(links[0]);
        } catch {
          // 딥링크 실패는 치명적이지 않음
        }
      }

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
  }, [coupangCrawlResult, ctaPreset, setIsAnalyzing, setAnalysisError, setProductAnalysis, setNarrationText, setGeneratedScripts, setSelectedScriptId, setAffiliateLink, goToStep]);

  // 쿠팡파트너스 설정 저장
  const handleSaveCoupangKeys = useCallback(() => {
    saveCoupangKeys(cpAccessKey, cpSecretKey, cpProxyUrl);
    showToast('쿠팡파트너스 설정 저장 완료!');
    setShowCoupangSettings(false);
  }, [cpAccessKey, cpSecretKey, cpProxyUrl]);

  // 프록시 연결 테스트
  const handleTestProxy = useCallback(async () => {
    saveCoupangKeys(cpAccessKey, cpSecretKey, cpProxyUrl);
    const ok = await testProxyConnection();
    setProxyTestResult(ok);
    showToast(ok ? '프록시 연결 성공!' : '프록시 연결 실패 — URL을 확인해주세요.');
  }, [cpAccessKey, cpSecretKey, cpProxyUrl]);

  return (
    <div className="space-y-6">
      {/* ═══ 소스 타입 토글 ═══ */}
      <div className="flex gap-3">
        {SOURCE_TYPES.map(st => (
          <button
            key={st.id}
            onClick={() => setSourceType(st.id)}
            className={`flex-1 p-4 rounded-2xl text-center transition-all border ${
              sourceType === st.id
                ? 'bg-lime-600/15 border-lime-500/40 ring-1 ring-lime-500/20'
                : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600/60'
            }`}
          >
            <div className="text-2xl mb-1">{st.icon}</div>
            <div className={`text-sm font-bold ${sourceType === st.id ? 'text-lime-300' : 'text-gray-300'}`}>
              {st.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{st.desc}</div>
          </button>
        ))}
      </div>

      {/* ═══ 쿠팡파트너스 설정 (공통) ═══ */}
      <button
        onClick={() => setShowCoupangSettings(!showCoupangSettings)}
        className="text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
      >
        <span>{showCoupangSettings ? '▼' : '▶'}</span>
        쿠팡파트너스 설정
      </button>

      {showCoupangSettings && (
        <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/40 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Access Key</label>
            <input
              type="password"
              value={cpAccessKey}
              onChange={e => setCpAccessKey(e.target.value)}
              placeholder="쿠팡파트너스 Access Key"
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/40 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-lime-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Secret Key</label>
            <input
              type="password"
              value={cpSecretKey}
              onChange={e => setCpSecretKey(e.target.value)}
              placeholder="쿠팡파트너스 Secret Key"
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/40 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-lime-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">CORS 프록시 URL (필수)</label>
            <input
              type="text"
              value={cpProxyUrl}
              onChange={e => setCpProxyUrl(e.target.value)}
              placeholder="https://my-proxy.workers.dev"
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/40 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-lime-500/50 focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              Cloudflare Worker 무료 배포 → docs/cloudflare-worker-proxy.js 참조
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTestProxy}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 border border-gray-600/40 transition-all"
            >
              연결 테스트
            </button>
            {proxyTestResult !== null && (
              <span className={`text-xs flex items-center ${proxyTestResult ? 'text-green-400' : 'text-red-400'}`}>
                {proxyTestResult ? '✅ 연결 성공' : '❌ 연결 실패'}
              </span>
            )}
            <button
              onClick={handleSaveCoupangKeys}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-lime-600/20 text-lime-300 hover:bg-lime-600/30 border border-lime-500/40 transition-all ml-auto"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 소스 타입: 해외 영상 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {sourceType === 'video' && (
        <>
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
            {downloadError && <p className="mt-2 text-sm text-red-400">{downloadError}</p>}

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

          {/* 비디오 미리보기 + 분석 시작 */}
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
              <button
                onClick={handleVideoAnalyze}
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
              {analysisError && <p className="mt-2 text-sm text-red-400">{analysisError}</p>}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 소스 타입: 쿠팡 링크 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {sourceType === 'coupang' && (
        <>
          {/* 쿠팡 URL 입력 */}
          <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/40">
            <h3 className="text-lg font-bold text-gray-100 mb-2">쿠팡 상품 URL 입력</h3>
            <p className="text-xs text-gray-500 mb-4">상품 상세페이지 URL을 붙여넣으세요</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={coupangUrl}
                onChange={e => { setCoupangUrl(e.target.value); setCrawlError(null); }}
                placeholder="https://www.coupang.com/vp/products/..."
                className="flex-1 px-4 py-3 bg-gray-900/60 border border-gray-600/40 rounded-xl text-gray-200 text-sm placeholder-gray-500 focus:border-orange-500/50 focus:outline-none"
              />
              <button
                onClick={handleCoupangCrawl}
                disabled={!coupangUrl.trim() || isCrawling}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  isCrawling
                    ? 'bg-orange-600/30 text-orange-300 cursor-wait'
                    : !coupangUrl.trim()
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white'
                }`}
              >
                {isCrawling ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    크롤링 중
                  </span>
                ) : '크롤링'}
              </button>
            </div>
            {crawlError && <p className="mt-2 text-sm text-red-400">{crawlError}</p>}
            {isCrawling && crawlProgress && (
              <p className="mt-2 text-sm text-orange-400">{crawlProgress}</p>
            )}
          </div>

          {/* 크롤링 결과 프리뷰 */}
          {coupangCrawlResult && (
            <div className="bg-gray-800/40 rounded-2xl p-6 border border-orange-500/20">
              <h3 className="text-lg font-bold text-gray-100 mb-4">상품 정보</h3>

              <div className="flex gap-4">
                {/* 상품 이미지 */}
                {coupangCrawlResult.product.mainImageUrl && (
                  <div className="w-32 h-32 rounded-xl overflow-hidden bg-white flex-shrink-0">
                    <img
                      src={coupangCrawlResult.product.mainImageUrl}
                      alt={coupangCrawlResult.product.productName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* 상품 정보 */}
                <div className="flex-1 space-y-2">
                  <h4 className="text-base font-bold text-gray-100 line-clamp-2">
                    {coupangCrawlResult.product.productName}
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-orange-400">
                      {coupangCrawlResult.product.price.toLocaleString()}원
                    </span>
                    {coupangCrawlResult.product.originalPrice && (
                      <>
                        <span className="text-sm text-gray-500 line-through">
                          {coupangCrawlResult.product.originalPrice.toLocaleString()}원
                        </span>
                        <span className="text-sm font-bold text-red-400">
                          {coupangCrawlResult.product.discountRate}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    {coupangCrawlResult.product.rating > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-600/15 text-yellow-300 border border-yellow-500/20">
                        ⭐ {coupangCrawlResult.product.rating} ({coupangCrawlResult.product.reviewCount.toLocaleString()})
                      </span>
                    )}
                    {coupangCrawlResult.product.isRocketDelivery && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-300 border border-blue-500/20">
                        🚀 로켓배송
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-gray-600/15 text-gray-400 border border-gray-600/20">
                      {coupangCrawlResult.product.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* 리뷰 요약 */}
              {coupangCrawlResult.reviews.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700/40">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-300">리뷰 분석</span>
                    <span className="text-xs text-gray-500">{coupangCrawlResult.reviews.length}건 수집</span>
                  </div>
                  {coupangCrawlResult.topPositiveReviews.length > 0 && (
                    <div className="space-y-1">
                      {coupangCrawlResult.topPositiveReviews.slice(0, 2).map((review, i) => (
                        <p key={i} className="text-xs text-gray-400 line-clamp-1">
                          <span className="text-green-400 mr-1">👍</span>
                          &ldquo;{review}&rdquo;
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 어필리에이트 링크 */}
              {affiliateLink && (
                <div className="mt-4 pt-4 border-t border-gray-700/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">어필리에이트 링크:</span>
                    <input
                      type="text"
                      readOnly
                      value={affiliateLink}
                      className="flex-1 px-2 py-1 bg-gray-900/60 border border-gray-600/40 rounded text-xs text-green-400 font-mono"
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(affiliateLink); showToast('링크 복사 완료!'); }}
                      className="px-2 py-1 rounded text-xs font-bold bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/30"
                    >
                      복사
                    </button>
                  </div>
                </div>
              )}

              {/* 분석 시작 버튼 */}
              <button
                onClick={handleCoupangAnalyze}
                disabled={isAnalyzing}
                className={`mt-4 w-full py-4 rounded-xl font-bold text-base transition-all ${
                  isAnalyzing
                    ? 'bg-orange-600/30 text-orange-300 cursor-wait'
                    : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white shadow-lg shadow-orange-900/30'
                }`}
              >
                {isAnalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                    {analysisProgress || 'AI 분석 중...'}
                  </span>
                ) : '바이럴 대본 생성 (AI 분석 → 동적 타겟팅 → v31.0 대본)'}
              </button>
              {analysisError && <p className="mt-2 text-sm text-red-400">{analysisError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SourceInputStep;
