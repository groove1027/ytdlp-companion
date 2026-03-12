import React, { useCallback, useRef } from 'react';
import { useShoppingChannelStore } from '../../../stores/shoppingChannelStore';
import { analyzeProductPhotos } from '../../../services/shoppingChannelService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';

const MAX_IMAGES = 3;

const ProductInputStep: React.FC = () => {
  const {
    product, productAnalysis, isAnalyzing, analysisError,
    setProduct, setProductAnalysis, setIsAnalyzing, setAnalysisError, goToStep,
  } = useShoppingChannelStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_IMAGES - product.images.length;
    if (remaining <= 0) {
      showToast(`최대 ${MAX_IMAGES}장까지 업로드 가능합니다.`);
      return;
    }

    const newImages: string[] = [];
    const newUrls: string[] = [];

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      newImages.push(base64);

      try {
        const url = await uploadMediaToHosting(file);
        newUrls.push(url);
      } catch (err) {
        logger.warn('[ShoppingChannel] Cloudinary 업로드 실패, base64 유지', { error: err });
        newUrls.push('');
      }
    }

    setProduct({
      images: [...product.images, ...newImages],
      imageUrls: [...product.imageUrls, ...newUrls],
    });
  }, [product, setProduct]);

  const removeImage = useCallback((index: number) => {
    setProduct({
      images: product.images.filter((_, i) => i !== index),
      imageUrls: product.imageUrls.filter((_, i) => i !== index),
    });
    setProductAnalysis(null);
  }, [product, setProduct, setProductAnalysis]);

  const handleAnalyze = useCallback(async () => {
    if (product.images.length === 0) {
      showToast('제품 사진을 1장 이상 업로드해주세요.');
      return;
    }
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const analysis = await analyzeProductPhotos(product.images, product.name, product.description);
      setProductAnalysis(analysis);
      showToast('제품 분석이 완료되었습니다!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 실패';
      setAnalysisError(msg);
      showToast(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [product, setIsAnalyzing, setAnalysisError, setProductAnalysis]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleImageUpload(e.dataTransfer.files);
  }, [handleImageUpload]);

  const canProceed = productAnalysis !== null;

  return (
    <div className="space-y-6">
      {/* 이미지 업로드 영역 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">📷</span>
          제품 사진 업로드
        </h3>

        {product.images.length === 0 ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-900/10 transition-all"
          >
            <div className="text-4xl mb-3">📸</div>
            <p className="text-gray-300 font-semibold mb-1">제품 사진을 드래그하거나 클릭하여 업로드</p>
            <p className="text-gray-500 text-sm">최대 {MAX_IMAGES}장 · JPG, PNG, WebP</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {product.images.map((img, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-700">
                  <img src={img} alt={`제품 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    ✕
                  </button>
                  {product.imageUrls[i] && (
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-green-600/80 text-white text-[10px] rounded">
                      업로드됨
                    </div>
                  )}
                </div>
              ))}
              {product.images.length < MAX_IMAGES && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500/50 transition-colors"
                >
                  <span className="text-2xl text-gray-500">+</span>
                  <span className="text-xs text-gray-500 mt-1">추가</span>
                </div>
              )}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleImageUpload(e.target.files)}
          className="hidden"
        />
      </div>

      {/* 제품 정보 (선택) */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">📝</span>
          제품 정보 <span className="text-sm text-gray-500 font-normal">(선택)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-1.5">제품명</label>
            <input
              type="text"
              value={product.name}
              onChange={(e) => setProduct({ name: e.target.value })}
              placeholder="예: 프리미엄 히알루론산 세럼"
              className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-1.5">제품 설명</label>
            <input
              type="text"
              value={product.description}
              onChange={(e) => setProduct({ description: e.target.value })}
              placeholder="예: 보습에 좋은 세럼, 30ml"
              className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* AI 분석 버튼 */}
      <button
        onClick={handleAnalyze}
        disabled={product.images.length === 0 || isAnalyzing}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
          product.images.length > 0 && !isAnalyzing
            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isAnalyzing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-cyan-400 rounded-full animate-spin" />
            AI 분석 중...
          </span>
        ) : 'AI 제품 분석 시작'}
      </button>

      {analysisError && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {analysisError}
        </div>
      )}

      {/* 분석 결과 카드 */}
      {productAnalysis && (
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6 space-y-4">
          <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <span>✅</span> 분석 결과
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">제품명</span>
              <p className="text-white font-semibold mt-0.5">{productAnalysis.productName}</p>
            </div>
            <div>
              <span className="text-gray-500">카테고리</span>
              <p className="text-white font-semibold mt-0.5">{productAnalysis.category}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500">타겟 고객</span>
              <p className="text-white font-semibold mt-0.5">{productAnalysis.targetAudience}</p>
            </div>
          </div>
          <div>
            <span className="text-gray-500 text-sm">핵심 기능</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {productAnalysis.keyFeatures.map((f, i) => (
                <span key={i} className="px-2.5 py-1 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-gray-500 text-sm">매력 포인트</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {productAnalysis.appealPoints.map((p, i) => (
                <span key={i} className="px-2.5 py-1 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg text-xs">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 다음 단계 */}
      {canProceed && (
        <div className="flex justify-end">
          <button
            onClick={() => goToStep('concept')}
            className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-900/30"
          >
            다음: 컨셉 설정 →
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductInputStep;
