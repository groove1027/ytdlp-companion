import React, { useState, useRef, useCallback } from 'react';
import { logger } from '../../../services/LoggerService';
import { evolinkFrameAnalysisStream } from '../../../services/evolinkService';
import { downloadFromUrl } from '../../../services/videoDownloadService';
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

interface UploadedVideo {
  file: File;
  preview: string;
  duration: number;
  frames: { base64: string; mimeType: string; timeSec: number }[];
}

const MAX_IMAGES = 10;
const VIDEO_FRAME_COUNT = 8;
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/x-msvideo';

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
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 영상에서 균등 간격 프레임 추출 */
function extractVideoFrames(file: File, count: number): Promise<{ frames: { base64: string; mimeType: string; timeSec: number }[]; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const blobUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(blobUrl, 'video', 'SocialAnalysisRoom:extractVideoFrames');
    video.src = blobUrl;

    video.onloadedmetadata = async () => {
      const dur = video.duration;
      if (!dur || dur < 0.5) {
        logger.unregisterBlobUrl(blobUrl);
        URL.revokeObjectURL(blobUrl);
        reject(new Error('영상 길이를 읽을 수 없습니다.'));
        return;
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      // 최대 640px 너비로 스케일
      const scale = Math.min(1, 640 / vw);
      const outW = Math.round(vw * scale);
      const outH = Math.round(vh * scale);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;

      const frames: { base64: string; mimeType: string; timeSec: number }[] = [];
      // 균등 간격 타임코드 (첫/끝 약간 안쪽)
      const step = dur / (count + 1);
      const timecodes = Array.from({ length: count }, (_, i) => Math.min(dur - 0.1, step * (i + 1)));

      for (const tc of timecodes) {
        try {
          video.currentTime = tc;
          await new Promise<void>((res) => { video.onseeked = () => res(); });
          ctx.drawImage(video, 0, 0, outW, outH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const b64 = dataUrl.split(',')[1] || '';
          if (b64) frames.push({ base64: b64, mimeType: 'image/jpeg', timeSec: Math.round(tc * 10) / 10 });
        } catch {
          // 프레임 추출 실패 시 건너뜀
        }
      }

      logger.unregisterBlobUrl(blobUrl);
      URL.revokeObjectURL(blobUrl);
      resolve({ frames, duration: dur });
    };

    video.onerror = () => {
      logger.unregisterBlobUrl(blobUrl);
      URL.revokeObjectURL(blobUrl);
      reject(new Error('영상 파일을 로드할 수 없습니다.'));
    };
  });
}

const SocialAnalysisRoom: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  // 입력 상태
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);

  // 분석 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisDone, setAnalysisDone] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
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
      const imgPreview = URL.createObjectURL(file);
      logger.registerBlobUrl(imgPreview, 'image', 'SocialAnalysisRoom:handleAddImages');
      newImages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: imgPreview,
        base64,
        mimeType: file.type,
      });
    }
    setImages(prev => [...prev, ...newImages]);
  }, [images.length]);

  // 영상 업로드
  const handleAddVideo = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('영상 파일만 업로드할 수 있습니다.');
      return;
    }
    // 100MB 제한
    if (file.size > 100 * 1024 * 1024) {
      showToast('100MB 이하 영상만 업로드할 수 있습니다.');
      return;
    }

    setIsExtractingFrames(true);
    try {
      const { frames, duration } = await extractVideoFrames(file, VIDEO_FRAME_COUNT);
      if (frames.length === 0) {
        showToast('영상에서 프레임을 추출할 수 없습니다.');
        return;
      }
      const videoPreview = URL.createObjectURL(file);
      logger.registerBlobUrl(videoPreview, 'video', 'SocialAnalysisRoom:handleAddVideo');
      setVideo({
        file,
        preview: videoPreview,
        duration,
        frames,
      });
      showToast(`영상에서 ${frames.length}개 프레임 추출 완료`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '영상 로드 실패');
    } finally {
      setIsExtractingFrames(false);
    }
  }, []);

  // 영상 삭제
  const handleRemoveVideo = useCallback(() => {
    if (video) { logger.unregisterBlobUrl(video.preview); URL.revokeObjectURL(video.preview); }
    setVideo(null);
  }, [video]);

  // 이미지 삭제
  const handleRemoveImage = useCallback((id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) { logger.unregisterBlobUrl(target.preview); URL.revokeObjectURL(target.preview); }
      return prev.filter(img => img.id !== id);
    });
  }, []);

  // 드래그&드롭 (이미지+영상 모두 지원)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(f => f.type.startsWith('video/'));
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (videoFile && !video) handleAddVideo(videoFile);
    if (imageFiles.length > 0) handleAddImages(imageFiles);
  }, [handleAddImages, handleAddVideo, video]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // TikTok URL → 영상 다운로드 + 프레임 추출
  const handleTiktokUrlDownload = useCallback(async () => {
    if (!tiktokUrl.trim() || video || isDownloadingUrl) return;
    setIsDownloadingUrl(true);
    try {
      const result = await downloadFromUrl(tiktokUrl.trim());
      const file = new File([result.blob], result.filename, { type: result.blob.type || 'video/mp4' });
      await handleAddVideo(file);
      showToast('TikTok 영상 다운로드 완료');
      setTiktokUrl('');
    } catch {
      showToast('URL 다운로드에 실패했습니다. 영상을 직접 저장한 후 파일로 업로드해주세요.', 5000);
    } finally {
      setIsDownloadingUrl(false);
    }
  }, [tiktokUrl, video, isDownloadingUrl, handleAddVideo]);

  // 분석 실행
  const handleAnalyze = useCallback(async () => {
    const hasContent = images.length > 0 || video || captionText.trim() || commentText.trim();
    if (!hasContent) {
      showToast('스크린샷, 영상, 캡션, 또는 댓글 중 하나 이상 입력해주세요.');
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
사용자가 제공한 ${platformLabel} 콘텐츠(스크린샷, 영상 프레임, 캡션, 댓글)를 종합적으로 분석해주세요.

분석 항목 (해당하는 것만):
1. **콘텐츠 형식 분석**: 릴스/쇼츠/피드/스토리 등 형식, 영상 길이 추정, 편집 스타일
2. **훅 & 구조 분석**: 첫 3초 훅 기법, 스토리 전개 구조, CTA(행동 유도) 방식
3. **비주얼 스타일**: 색감/필터, 자막 스타일, 썸네일/커버 디자인, 화면 구도, 전환 효과
4. **캡션 & 해시태그 전략**: 캡션 길이/톤, 해시태그 수/유형, 이모지 활용
5. **댓글 반응 분석**: 핵심 반응 키워드, 감성 분포(긍정/부정/질문), 시청자 관심 포인트
6. **벤치마킹 인사이트**: 이 콘텐츠의 강점, 내 채널에 적용할 수 있는 포인트, 리메이크 아이디어 3가지

영상 프레임이 포함된 경우, 프레임 간 변화를 분석해 편집 패턴(컷 전환, 자막 타이밍, 화면 구성 변화)도 분석하세요.
결과는 한국어로 작성하세요. 마크다운 형식으로, 각 섹션에 이모지 헤딩을 사용하세요.`;

      const userParts: string[] = [`플랫폼: ${platformLabel}`];
      if (video) userParts.push(`\n[영상 정보] 길이: ${Math.round(video.duration)}초, 추출 프레임: ${video.frames.length}장`);
      if (captionText.trim()) userParts.push(`\n[캡션/대본]\n${captionText.trim()}`);
      if (commentText.trim()) userParts.push(`\n[댓글]\n${commentText.trim()}`);
      if (images.length === 0 && !video) userParts.push('\n(비주얼 자료 없음 — 텍스트만 분석해주세요)');

      const userPrompt = userParts.join('\n');

      try {
        // 스크린샷 프레임
        const screenshotFrames = images.map((img, i) => ({
          base64: img.base64,
          mimeType: img.mimeType,
          label: `[스크린샷 ${i + 1}/${images.length}]`,
        }));

        // 영상 프레임
        const videoFrames = video
          ? video.frames.map((f, i) => ({
              base64: f.base64,
              mimeType: f.mimeType,
              label: `[영상 프레임 ${i + 1}/${video.frames.length} — ${f.timeSec}초]`,
            }))
          : [];

        const allFrames = [...screenshotFrames, ...videoFrames];

        const result = await evolinkFrameAnalysisStream(
          allFrames,
          systemPrompt,
          userPrompt,
          (_chunk, accumulated) => setStreamText(accumulated),
          { temperature: 0.5, maxOutputTokens: 8000 },
        );

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
  }, [images, video, captionText, commentText, platform, requireAuth]);

  // 초기화
  const handleReset = useCallback(() => {
    images.forEach(img => { logger.unregisterBlobUrl(img.preview); URL.revokeObjectURL(img.preview); });
    if (video) { logger.unregisterBlobUrl(video.preview); URL.revokeObjectURL(video.preview); }
    setImages([]);
    setVideo(null);
    setCaptionText('');
    setCommentText('');
    setTiktokUrl('');
    setStreamText('');
    setAnalysisResult('');
    setAnalysisDone(false);
  }, [images, video]);

  const displayText = analysisResult || streamText;
  const hasAnyInput = images.length > 0 || video || captionText || commentText;

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
            <p className="text-xs text-gray-400">인스타/틱톡 스크린샷·영상 + 캡션 + 댓글 → AI 종합 분석</p>
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

        {/* 플랫폼별 안내 */}
        {platform === 'instagram' && (
          <div className="mt-3 flex items-start gap-2 bg-amber-900/20 border border-amber-600/30 rounded-lg px-3 py-2.5">
            <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
            <p className="text-xs text-amber-300/90 leading-relaxed">
              <strong>Instagram은 URL 직접 접근이 불가합니다.</strong><br />
              게시물 스크린샷을 캡처하고, 영상은 릴스 저장 후 파일로 업로드해주세요.
            </p>
          </div>
        )}
        {platform === 'tiktok' && (
          <div className="mt-3 flex items-start gap-2 bg-cyan-900/20 border border-cyan-600/30 rounded-lg px-3 py-2.5">
            <span className="text-cyan-400 text-sm mt-0.5">💡</span>
            <p className="text-xs text-cyan-300/90 leading-relaxed">
              TikTok 영상 URL을 아래에 붙여넣으면 자동 다운로드를 시도합니다. 실패 시 영상을 직접 저장한 후 아래에서 파일 업로드해주세요.
            </p>
          </div>
        )}
      </div>

      {/* TikTok URL 입력 (TikTok 선택 시만) */}
      {platform === 'tiktok' && !video && (
        <div className="bg-gray-800/40 rounded-xl border border-cyan-700/30 p-4 space-y-2">
          <h3 className="text-sm font-bold text-white">🔗 TikTok URL 다운로드</h3>
          <div className="flex gap-2">
            <input
              type="url"
              value={tiktokUrl}
              onChange={e => setTiktokUrl(e.target.value)}
              placeholder="TikTok 영상 URL (예: https://www.tiktok.com/@user/video/...)"
              className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              onKeyDown={e => { if (e.key === 'Enter') handleTiktokUrlDownload(); }}
            />
            <button
              type="button"
              onClick={handleTiktokUrlDownload}
              disabled={!tiktokUrl.trim() || isDownloadingUrl}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                !tiktokUrl.trim() || isDownloadingUrl
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isDownloadingUrl ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-cyan-300 rounded-full animate-spin" />
                  다운로드 중
                </span>
              ) : '다운로드'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500">vm.tiktok.com, vt.tiktok.com 단축 URL도 지원</p>
        </div>
      )}

      {/* 입력 영역 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 좌측: 미디어 업로드 */}
        <div className="space-y-3">
          {/* 스크린샷 업로드 */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">📷 스크린샷 ({images.length}/{MAX_IMAGES})</h3>
              {images.length > 0 && (
                <button
                  type="button"
                  onClick={() => { images.forEach(img => { logger.unregisterBlobUrl(img.preview); URL.revokeObjectURL(img.preview); }); setImages([]); }}
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
              onClick={() => imageInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 hover:border-blue-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors"
            >
              <p className="text-gray-400 text-sm">클릭하거나 이미지/영상을 드래그해서 업로드</p>
              <p className="text-gray-500 text-xs mt-1">이미지: JPG, PNG, WebP · 최대 {MAX_IMAGES}장</p>
            </div>
            <input
              ref={imageInputRef}
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

          {/* 영상 업로드 */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">🎬 영상 {video ? '(1/1)' : '(0/1)'}</h3>
              {video && (
                <button type="button" onClick={handleRemoveVideo} className="text-xs text-red-400 hover:text-red-300">
                  삭제
                </button>
              )}
            </div>

            {!video && !isExtractingFrames && (
              <>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-600 hover:border-violet-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors"
                >
                  <p className="text-gray-400 text-sm">클릭하여 영상 업로드</p>
                  <p className="text-gray-500 text-xs mt-1">MP4, WebM, MOV · 최대 100MB</p>
                </button>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={VIDEO_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAddVideo(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}

            {isExtractingFrames && (
              <div className="flex items-center gap-3 p-4 bg-gray-900/40 rounded-lg">
                <span className="w-5 h-5 border-2 border-gray-600 border-t-violet-400 rounded-full animate-spin" />
                <span className="text-sm text-gray-400">프레임 추출 중...</span>
              </div>
            )}

            {video && (
              <div className="space-y-2">
                {/* 영상 미리보기 */}
                <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-black">
                  <video
                    src={video.preview}
                    controls
                    className="w-full max-h-48 object-contain"
                    preload="metadata"
                  />
                  <div className="absolute top-2 left-2 bg-black/70 text-gray-300 text-[10px] px-2 py-0.5 rounded font-mono">
                    {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
                  </div>
                </div>

                {/* 추출된 프레임 미리보기 */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">추출된 프레임 ({video.frames.length}장)</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {video.frames.map((f, i) => (
                      <div key={i} className="relative aspect-video rounded overflow-hidden border border-gray-700/50">
                        <img src={`data:${f.mimeType};base64,${f.base64}`} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-gray-300 text-[9px] px-1 rounded font-mono">
                          {f.timeSec}s
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
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
              className="w-full h-32 bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* 댓글 */}
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/30 p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">💬 댓글</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="주요 댓글들을 붙여넣으세요... (선택)"
              className="w-full h-32 bg-gray-900/60 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* 분석 버튼 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || isExtractingFrames}
          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg flex items-center gap-2 ${
            isAnalyzing || isExtractingFrames
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

        {(analysisDone || hasAnyInput) && !isAnalyzing && (
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-semibold transition-all"
          >
            초기화
          </button>
        )}

        <span className="text-xs text-gray-500">
          {[
            images.length > 0 ? `스크린샷 ${images.length}장` : '',
            video ? `영상 1개 (${video.frames.length}프레임)` : '',
            captionText ? '캡션' : '',
            commentText ? '댓글' : '',
          ].filter(Boolean).join(' + ')}
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
            인스타그램 / 틱톡 게시물의 스크린샷이나 영상을 업로드하고,<br />
            캡션이나 댓글을 복사해서 붙여넣으면 AI가 콘텐츠 전략을 분석합니다.
          </p>
          <div className="flex justify-center gap-4 text-xs text-gray-600">
            <span>📸 스크린샷 → 비주얼 분석</span>
            <span>🎬 영상 → 편집 패턴 분석</span>
            <span>📝 캡션 → 훅/구조 분석</span>
            <span>💬 댓글 → 반응 분석</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialAnalysisRoom;
