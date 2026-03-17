import React, { useState, useRef, useCallback } from 'react';
import { PRICING } from '../../../constants';
import { useCostStore } from '../../../stores/costStore';
import { createWanV2VTask, pollKieTask } from '../../../services/VideoGenService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { downloadFromUrl } from '../../../services/videoDownloadService';
import { logger } from '../../../services/LoggerService';
import { formatElapsed } from '../../../hooks/useElapsedTimer';

const QUICK_STYLES = [
  { label: '지브리 풍', prompt: 'Studio Ghibli anime style, hand-painted backgrounds, soft watercolor lighting' },
  { label: '픽사 3D', prompt: 'Pixar 3D animation style, vibrant colors, smooth rendering' },
  { label: '수채화', prompt: 'Delicate watercolor painting style, soft edges, flowing pigments' },
  { label: '사이버펑크', prompt: 'Cyberpunk neon style, dark urban atmosphere, glowing lights' },
  { label: '필름 누아르', prompt: 'Black and white film noir style, high contrast, dramatic shadows' },
  { label: '레트로 애니', prompt: '90s retro anime style, cel-shaded, nostalgic color grading' },
  { label: '유화', prompt: 'Classical oil painting style, rich textures, Renaissance lighting' },
];

type RemakePhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

type InputMode = 'file' | 'url';

const VideoRemakePanel: React.FC = () => {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [v2vPrompt, setV2vPrompt] = useState('');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [isDragOver, setIsDragOver] = useState(false);
  const [phase, setPhase] = useState<RemakePhase>('idle');
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const videoInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // 타이머 효과
  React.useEffect(() => {
    if (!isTimerActive) { setElapsedSec(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isTimerActive]);

  const addCost = useCostStore((s) => s.addCost);
  const exchangeRate = useCostStore((s) => s.exchangeRate) || PRICING.EXCHANGE_RATE;

  const fmtCost = (usd: number) => `$${usd.toFixed(3)} (${Math.round(usd * exchangeRate).toLocaleString()}원)`;

  const processVideoFile = useCallback((file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setError('100MB 이하 파일만 업로드할 수 있습니다.');
      return;
    }
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setError('');
    setPhase('idle');
    setResultUrl(null);
  }, []);

  const handleClear = useCallback(() => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setUrlInput('');
    setV2vPrompt('');
    setPhase('idle');
    setProgress('');
    setResultUrl(null);
    setError('');
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [videoPreviewUrl]);

  const handleQuickStyle = (prompt: string) => {
    setV2vPrompt(prev => prev ? `${prev}, ${prompt}` : prompt);
  };

  const handleUrlDownload = useCallback(async () => {
    if (!urlInput.trim()) return;
    setIsDownloading(true);
    setError('');
    try {
      const result = await downloadFromUrl(urlInput.trim());
      processVideoFile(new File([result.blob], result.filename, { type: 'video/mp4' }));
      logger.info(`[Remake] URL 다운로드 성공: ${result.filename} (${(result.blob.size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err: unknown) {
      setError((err as Error).message || '영상 다운로드에 실패했습니다. 파일을 직접 업로드해주세요.');
    } finally {
      setIsDownloading(false);
    }
  }, [urlInput, processVideoFile]);

  const handleStart = useCallback(async () => {
    if (!videoFile || !v2vPrompt.trim()) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setPhase('uploading');
      setProgress('영상을 업로드하고 있어요...');
      setIsTimerActive(true);

      // 1. Cloudinary에 영상 업로드
      const publicUrl = await uploadMediaToHosting(videoFile);
      logger.info(`[Remake] Video uploaded: ${publicUrl}`);

      // 2. Wan V2V 태스크 생성
      setPhase('processing');
      setProgress('AI가 영상을 변환하고 있어요. 약 2~3분 걸려요...');

      const taskId = await createWanV2VTask(publicUrl, v2vPrompt.trim(), '10', resolution);

      // 3. 폴링
      const result = await pollKieTask(taskId, controller.signal, (pct) => {
        setProgress(`변환 중... ${pct}%`);
      });

      // 4. 완료
      setIsTimerActive(false);
      setResultUrl(result);
      setPhase('done');
      setProgress('변환 완료!');

      // 비용 추가
      const cost = resolution === '1080p'
        ? 10 * PRICING.VIDEO_WAN_V2V_1080P_PER_SEC
        : 10 * PRICING.VIDEO_WAN_V2V_720P_PER_SEC;
      addCost(cost, 'video');

    } catch (err: unknown) {
      setIsTimerActive(false);
      if ((err as Error).message === 'Cancelled') {
        setPhase('idle');
        setProgress('');
        return;
      }
      setPhase('error');
      setError((err as Error).message || '변환 중 오류가 발생했습니다.');
    }
  }, [videoFile, v2vPrompt, resolution, addCost]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsTimerActive(false);
    setPhase('idle');
    setProgress('');
  }, []);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `remake_${Date.now()}.mp4`;
    a.target = '_blank';
    a.click();
  }, [resultUrl]);

  const isWorking = phase === 'uploading' || phase === 'processing';
  const canStart = videoFile && v2vPrompt.trim() && !isWorking;
  const estimatedCost = resolution === '1080p'
    ? 10 * PRICING.VIDEO_WAN_V2V_1080P_PER_SEC
    : 10 * PRICING.VIDEO_WAN_V2V_720P_PER_SEC;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-xl p-5 shadow-lg">
        <h4 className="font-bold text-xl mb-2 text-white flex items-center gap-2">
          <span className="text-2xl">🔄</span> 영상 리메이크 (Wan V2V)
        </h4>
        <p className="text-sm text-gray-300 leading-relaxed">
          기존 영상을 업로드하면 AI가 스타일을 완전히 바꿔줘요.
          실사를 애니메이션으로, 주간을 야간으로, 의상이나 배경을 자유롭게 변환할 수 있어요.
          원본의 자막은 자동으로 제거됩니다.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="bg-purple-800/30 rounded-lg p-2 text-center">
            <div className="text-purple-300 font-bold">해상도</div>
            <div className="text-gray-400">720p / 1080p</div>
          </div>
          <div className="bg-purple-800/30 rounded-lg p-2 text-center">
            <div className="text-purple-300 font-bold">소리</div>
            <div className="text-gray-400">AI 자동 생성</div>
          </div>
          <div className="bg-purple-800/30 rounded-lg p-2 text-center">
            <div className="text-purple-300 font-bold">비용</div>
            <div className="text-gray-400">720p ₩{Math.round(10 * PRICING.VIDEO_WAN_V2V_720P_PER_SEC * exchangeRate).toLocaleString()}/10초</div>
          </div>
        </div>
      </div>

      {/* Step 1: Video Input */}
      <div>
        <label className="block text-lg font-bold text-purple-400 mb-3">1. 원본 영상</label>

        {/* 입력 모드 탭 */}
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setInputMode('file')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'file' ? 'bg-purple-600/30 border border-purple-500 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500'}`}>
            📁 파일 업로드
          </button>
          <button type="button" onClick={() => setInputMode('url')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'url' ? 'bg-purple-600/30 border border-purple-500 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500'}`}>
            🔗 URL 링크
          </button>
        </div>

        {/* 영상이 이미 로드된 경우 — 프리뷰 */}
        {videoPreviewUrl ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-700">
            <video src={videoPreviewUrl} className="w-full h-full object-contain" controls />
            {!isWorking && (
              <button onClick={handleClear}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 hover:bg-red-700 shadow-md">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        ) : inputMode === 'file' ? (
          /* 파일 업로드 모드 */
          <div
            onClick={() => !isWorking && videoInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.[0]) processVideoFile(e.dataTransfer.files[0]); }}
            className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-900 ${isDragOver ? 'border-purple-500 bg-purple-900/20' : 'border-gray-600 hover:border-gray-400 hover:bg-gray-800'}`}
          >
            <div className="text-center p-6">
              <p className="text-4xl mb-3">🎥</p>
              <p className="text-lg font-bold text-gray-300">MP4/MOV 파일을 드래그하거나 클릭</p>
              <p className="text-sm text-gray-500 mt-1">최대 100MB</p>
            </div>
          </div>
        ) : (
          /* URL 입력 모드 */
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlDownload()}
                placeholder="YouTube, TikTok, 더우인 등 영상 URL 붙여넣기"
                disabled={isDownloading || isWorking}
                className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleUrlDownload}
                disabled={!urlInput.trim() || isDownloading || isWorking}
                className="px-5 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDownloading ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 다운로드 중...</>
                ) : '📥 다운로드'}
              </button>
            </div>
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300 leading-relaxed">
              <p className="font-bold mb-1">💡 쇼츠/숏폼 영상을 권장합니다!</p>
              <p className="text-amber-400/80">
                리메이크는 10초 단위로 처리되므로, 60초 이내의 쇼츠(Shorts) 영상이 가장 적합해요.
                긴 영상은 비용이 많이 들고 처리 시간도 오래 걸립니다.
              </p>
              <p className="text-gray-500 mt-1">지원: YouTube, TikTok, 더우인, 샤오홍슈 등</p>
            </div>
          </div>
        )}
        <input type="file" ref={videoInputRef} onChange={(e) => e.target.files?.[0] && processVideoFile(e.target.files[0])} accept="video/mp4,video/quicktime" className="hidden" />
      </div>

      {/* Step 2: Style */}
      <div>
        <label className="block text-lg font-bold text-purple-400 mb-3">2. 변환 스타일</label>
        <textarea
          value={v2vPrompt}
          onChange={(e) => setV2vPrompt(e.target.value)}
          placeholder="어떤 스타일로 바꿀까요? 예: Studio Ghibli anime style with soft watercolor lighting"
          rows={3}
          disabled={isWorking}
          className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none resize-none transition-colors disabled:opacity-50"
        />
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-2">빠른 스타일 프리셋:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_STYLES.map((style) => (
              <button
                key={style.label}
                type="button"
                disabled={isWorking}
                onClick={() => handleQuickStyle(style.prompt)}
                className="px-3 py-1.5 text-xs rounded-full border border-purple-500/40 bg-purple-900/20 text-purple-300 hover:bg-purple-800/40 hover:border-purple-400 transition-all disabled:opacity-30"
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 3: Resolution */}
      <div>
        <label className="block text-lg font-bold text-purple-400 mb-3">3. 해상도</label>
        <div className="flex gap-3">
          {(['720p', '1080p'] as const).map((res) => (
            <button
              key={res}
              type="button"
              disabled={isWorking}
              onClick={() => setResolution(res)}
              className={`px-6 py-2.5 rounded-lg border font-bold text-sm transition-all ${
                resolution === res
                  ? 'bg-purple-600/30 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              } disabled:opacity-50`}
            >
              {res} {resolution === res && '✓'}
            </button>
          ))}
        </div>
      </div>

      {/* Cost Info */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 flex items-center justify-between">
        <span>예상 비용 (10초 기준)</span>
        <span className="font-bold text-purple-300">{fmtCost(estimatedCost)}</span>
      </div>

      {/* Progress */}
      {isWorking && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
          <div className="flex-1">
            <p className="text-purple-300 font-bold text-sm">{progress}</p>
            {elapsedSec > 0 && <p className="text-xs text-gray-400 mt-0.5">경과 시간: {formatElapsed(elapsedSec)}</p>}
          </div>
          <button onClick={handleCancel} className="px-3 py-1.5 text-xs bg-red-600/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-600/30">
            취소
          </button>
        </div>
      )}

      {/* Result */}
      {phase === 'done' && resultUrl && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 space-y-3">
          <p className="text-green-400 font-bold flex items-center gap-2">✅ 변환 완료!</p>
          <video src={resultUrl} className="w-full rounded-lg" controls autoPlay={false} />
          <button onClick={handleDownload} className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold transition-all">
            📥 다운로드
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => { setPhase('idle'); setError(''); }} className="mt-2 text-xs text-gray-400 hover:text-white">다시 시도</button>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={isWorking ? handleCancel : handleStart}
        disabled={!canStart && !isWorking}
        className={`w-full py-4 rounded-xl font-bold text-xl shadow-2xl transition-all transform flex items-center justify-center gap-3 ${
          isWorking
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : canStart
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02]'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        {isWorking ? '⏹ 변환 중지' : '🚀 변환 시작'}
      </button>
    </div>
  );
};

export default VideoRemakePanel;
