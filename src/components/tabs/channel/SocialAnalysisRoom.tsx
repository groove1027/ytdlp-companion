import React, { useState, useRef, useCallback } from 'react';
import { evolinkFrameAnalysisStream } from '../../../services/evolinkService';
import { showToast } from '../../../stores/uiStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

type Platform = 'instagram' | 'tiktok' | 'other';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
}

const MAX_IMAGES = 10;

const PLATFORM_OPTIONS: { id: Platform; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'other', label: '기타 SNS', icon: '🌐' },
];

/** 파일 → base64 (data URI prefix 제거) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const SocialAnalysisRoom: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  // 입력 상태
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [captionText, setCaptionText] = useState('');
  const [commentText, setCommentText] = useState('');

  // 분석 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisDone, setAnalysisDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 이미지 추가
  const handleAddImages = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      showToast(`최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.`);
      return;
    }
    const toAdd = fileArr.slice(0, remaining);

    const newImages: UploadedImage[] = [];
    for (const file of toAdd) {
      const base64 = await fileToBase64(file);
      newImages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
        base64,
        mimeType: file.type,
      });
    }
    setImages(prev => [...prev, ...newImages]);
  }, [images.length]);

  // 이미지 삭제
  const handleRemoveImage = useCallback((id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter(img => img.id !== id);
    });
  }, []);

  // 드래그&드롭
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleAddImages(e.dataTransfer.files);
    }
  }, [handleAddImages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 분석 실행
  const handleAnalyze = useCallback(async () => {
    if (images.length === 0 && !captionText.trim() && !commentText.trim()) {
      showToast('스크린샷, 캡션, 또는 댓글 중 하나 이상 입력해주세요.');
      return;
    }

    if (!requireAuth('소셜 콘텐츠 AI 분석')) return;

    const run = async () => {
      setIsAnalyzing(true);
      setStreamText('');
      setAnalysisResult('');
      setAnalysisDone(false);

      const platformLabel = PLATFORM_OPTIONS.find(p => p.id === platform)?.label || platform;

      const systemPrompt = `당신은 소셜 미디어 콘텐츠 분석 전문가입니다.
사용자가 제공한 ${platformLabel} 콘텐츠(스크린샷, 캡션, 댓글)를 종합적으로 분석해주세요.

분석 항목 (해당하는 것만):
1. **콘텐츠 형식 분석**: 릴스/쇼츠/피드/스토리 등 형식, 영상 길이 추정, 편집 스타일
2. **훅 & 구조 분석**: 첫 3초 훅 기법, 스토리 전개 구조, CTA(행동 유도) 방식
3. **비주얼 스타일**: 색감/필터, 자막 스타일, 썸네일/커버 디자인, 화면 구도
4. **캡션 & 해시태그 전략**: 캡션 길이/톤, 해시태그 수/유형, 이모지 활용
5. **댓글 반응 분석**: 핵심 반응 키워드, 감성 분포(긍정/부정/질문), 시청자 관심 포인트
6. **벤치마킹 인사이트**: 이 콘텐츠의 강점, 내 채널에 적용할 수 있는 포인트, 리메이크 아이디어 3가지

결과는 한국어로 작성하세요. 마크다운 형식으로, 각 섹션에 이모지 헤딩을 사용하세요.
이미지가 없으면 텍스트만으로 분석하세요.`;

      const userParts: string[] = [`플랫폼: ${platformLabel}`];
      if (captionText.trim()) userParts.push(`\n[캡션/대본]\n${captionText.trim()}`);
      if (commentText.trim()) userParts.push(`\n[댓글]\n${commentText.trim()}`);
      if (images.length === 0) userParts.push('\n(스크린샷 없음 — 텍스트만 분석해주세요)');

      const userPrompt = userParts.join('\n');

      try {
        const frames = images.map((img, i) => ({
          base64: img.base64,
          mimeType: img.mimeType,
          label: `[스크린샷 ${i + 1}/${images.length}]`,
        }));

        let result: string;
        if (frames.length > 0) {
          result = await evolinkFrameAnalysisStream(
            frames,
            systemPrompt,
            userPrompt,
            (_chunk, accumulated) => setStreamText(accumulated),
            { temperature: 0.5, maxOutputTokens: 8000 },
          );
        } else {
          // 이미지 없이 텍스트만 — evolinkFrameAnalysisStream에 빈 프레임 전달
          result = await evolinkFrameAnalysisStream(
            [],
            systemPrompt,
            userPrompt,
            (_chunk, accumulated) => setStreamText(accumulated),
            { temperature: 0.5, maxOutputTokens: 8000 },
          );
        }

        setAnalysisResult(result);
        setAnalysisDone(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        showToast(`분석 실패: ${msg}`, 5000);
      } finally {
        setIsAnalyzing(false);
      }
    };

    run();
  }, [images, captionText, commentText, platform, requireAuth]);

  // 초기화
  const handleReset = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setCaptionText('');
    setCommentText('');
    setStreamText('');
    setAnalysisResult('');
    setAnalysisDone(false);
  }, [images]);

  const displayText = analysisResult || streamText;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gray-800/40 rounded-xl border border-blue-700/30 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-lg shadow-lg">
            📱
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">소셜 콘텐츠 분석실</h2>
            <p className="text-xs text-gray-400">인스타/틱톡 스크린샷 + 캡션 + 댓글 → AI 종합 분석</p>
          </div>
        </div>

        {/* 플랫폼 선택 */}
        <div className="flex gap-2">
          {PLATFORM_OPTIONS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all border ${
                platform === p.id
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
              }`}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 입력 영역 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 좌측: 스크린샷 업로드 */}
        <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">📷 스크린샷 ({images.length}/{MAX_IMAGES})</h3>
            {images.length > 0 && (
              <button
                type="button"
                onClick={() => { images.forEach(img => URL.revokeObjectURL(img.preview)); setImages([]); }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                전체 삭제
              </button>
            )}
          </div>

          {/* 드롭존 */}
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-600 hover:border-blue-500/50 rounded-lg p-6 text-center cursor-pointer transition-colors"
          >
            <p className="text-gray-400 text-sm">클릭하거나 이미지를 드래그해서 업로드</p>
            <p className="text-gray-500 text-xs mt-1">JPG, PNG, WebP · 최대 {MAX_IMAGES}장</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) handleAddImages(e.target.files); e.target.value = ''; }}
          />

          {/* 이미지 미리보기 그리드 */}
          {images.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-700">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 우측: 텍스트 입력 */}
        <div className="space-y-3">
          {/* 캡션/대본 */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">📝 캡션 / 대본</h3>
            <textarea
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="게시물 캡션이나 영상 대본을 붙여넣으세요..."
              className="w-full h-28 bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* 댓글 */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">💬 댓글</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="주요 댓글들을 붙여넣으세요... (선택)"
              className="w-full h-28 bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* 분석 버튼 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg flex items-center gap-2 ${
            isAnalyzing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white'
          }`}
        >
          {isAnalyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
              AI 분석 중...
            </>
          ) : (
            <>🔍 AI 분석 시작</>
          )}
        </button>

        {(analysisDone || images.length > 0 || captionText || commentText) && !isAnalyzing && (
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-semibold transition-all"
          >
            초기화
          </button>
        )}

        <span className="text-xs text-gray-500">
          {images.length > 0 ? `스크린샷 ${images.length}장` : ''}
          {images.length > 0 && (captionText || commentText) ? ' + ' : ''}
          {captionText ? '캡션' : ''}{captionText && commentText ? ' + ' : ''}{commentText ? '댓글' : ''}
        </span>
      </div>

      {/* 분석 결과 */}
      {displayText && (
        <div className="bg-gray-800/40 rounded-xl border border-blue-700/30 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
            <h3 className="text-sm font-bold text-white">분석 결과</h3>
            {isAnalyzing && <span className="w-3 h-3 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />}
          </div>

          <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
            {displayText}
          </div>
        </div>
      )}

      {/* 안내 카드 (분석 전) */}
      {!displayText && !isAnalyzing && (
        <div className="bg-gray-800/20 rounded-xl border border-gray-700/20 p-6 text-center space-y-3">
          <p className="text-gray-500 text-sm">
            인스타그램 / 틱톡 게시물의 스크린샷을 캡처하고,<br />
            캡션이나 댓글을 복사해서 붙여넣으면 AI가 콘텐츠 전략을 분석합니다.
          </p>
          <div className="flex justify-center gap-6 text-xs text-gray-600">
            <span>📸 스크린샷 → 비주얼 분석</span>
            <span>📝 캡션 → 훅/구조 분석</span>
            <span>💬 댓글 → 반응 분석</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialAnalysisRoom;
