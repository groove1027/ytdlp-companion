import React, { useState, useRef, useCallback } from 'react';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { logger } from '../../services/LoggerService';
import { isVmakeConfigured, removeVideoWatermark } from '../../services/vmakeService';
import { getVmakeAk } from '../../services/apiService';

const PROCESSING_TIPS = [
  '🧹 Vmake AI가 영상의 모든 프레임을 분석하고 있어요',
  '🎯 자막 영역을 자동으로 찾아서 깔끔하게 지워줍니다',
  '⏳ 영상 길이에 따라 1~3분 정도 걸릴 수 있어요',
  '💡 처리 중에 브라우저를 닫지 마세요 — 결과가 사라져요',
  '✨ AI가 자막 뒤에 숨어있던 원래 배경을 자연스럽게 복원합니다',
  '📱 세로 영상(쇼츠)도 가로 영상과 동일하게 처리할 수 있어요',
  '🔍 워터마크, 로고, 자막 — 화면에 겹쳐진 텍스트를 모두 제거합니다',
  '🎬 처리가 끝나면 원본과 동일한 화질의 영상을 다운로드할 수 있어요',
];

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const SubtitleRemoverTab: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isProcessing = phase === 'uploading' || phase === 'processing';
  const elapsed = useElapsedTimer(isProcessing);
  const vmakeReady = isVmakeConfigured();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 업로드할 수 있습니다. (MP4, MOV, AVI, WebM 등)');
      return;
    }
    if (resultBlobUrl) { logger.unregisterBlobUrl(resultBlobUrl); URL.revokeObjectURL(resultBlobUrl); }
    setResultBlobUrl(null);
    setPhase('idle');
    setError('');
    setProgress('');
    setPercent(0);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    logger.registerBlobUrl(url, 'video', 'SubtitleRemoverTab:handleFileSelect');
    setVideoPreviewUrl(url);

    const video = document.createElement('video');
    video.preload = 'metadata';
    const probeUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(probeUrl, 'video', 'SubtitleRemoverTab:probe');
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      logger.unregisterBlobUrl(probeUrl);
      URL.revokeObjectURL(probeUrl);
    };
    video.src = probeUrl;
  }, [resultBlobUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, []);

  const handleRemove = useCallback(async () => {
    logger.trackAction('자막/워터마크 제거 시작 (Vmake AI)');
    if (!requireAuth('자막 제거')) return;
    if (!videoFile) return;
    if (!isVmakeConfigured()) {
      setError('Vmake API 키가 설정되지 않았습니다.\n\n⚙️ 설정 → API 키 → Vmake AI 섹션에서 키를 입력하세요.');
      return;
    }

    setPhase('uploading');
    setError('');
    setPercent(5);
    setProgress('Vmake 서버에 영상 업로드 중...');

    try {
      const blob = new Blob([await videoFile.arrayBuffer()], { type: videoFile.type });
      const resultBlob = await removeVideoWatermark(blob, (msg, pct) => {
        setProgress(msg);
        if (pct != null) setPercent(pct);
        if (pct && pct > 20) setPhase('processing');
      });
      const url = URL.createObjectURL(resultBlob);
      logger.registerBlobUrl(url, 'video', 'SubtitleRemoverTab:result');
      setResultBlobUrl(url);
      setPhase('done');
      setPercent(100);
      setProgress('자막 제거 완료!');
    } catch (err: unknown) {
      setPhase('error');
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(message);
    }
  }, [videoFile, requireAuth]);

  const handleDownload = useCallback(() => {
    if (!resultBlobUrl) return;
    const a = document.createElement('a');
    a.href = resultBlobUrl;
    a.download = `subtitle_removed_${Date.now()}.mp4`;
    a.click();
  }, [resultBlobUrl]);

  const handleReset = useCallback(() => {
    if (resultBlobUrl) { logger.unregisterBlobUrl(resultBlobUrl); URL.revokeObjectURL(resultBlobUrl); }
    if (videoPreviewUrl) { logger.unregisterBlobUrl(videoPreviewUrl); URL.revokeObjectURL(videoPreviewUrl); }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setResultBlobUrl(null);
    setPhase('idle');
    setProgress('');
    setPercent(0);
    setError('');
    setVideoDuration(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resultBlobUrl, videoPreviewUrl]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span className="text-2xl">🧹</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">자막/워터마크 제거</h1>
          <p className="text-sm text-gray-400">영상을 업로드하면 AI가 자동으로 자막과 워터마크를 감지하고 깔끔하게 제거합니다</p>
        </div>
        <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
      </div>

      {/* Vmake 키 미설정 안내 */}
      {!vmakeReady && (
        <div className="mb-6 p-5 rounded-xl bg-amber-900/20 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">🔑</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300">Vmake AI API 키가 필요합니다</p>
              <p className="text-sm text-amber-200/70 mt-2">
                자막/워터마크 제거는 <span className="text-cyan-400 font-medium">Vmake AI</span> 클라우드 서비스를 사용합니다.
                아래 순서대로 설정하면 바로 사용할 수 있어요:
              </p>
              <ol className="mt-3 text-sm text-amber-200/80 space-y-3">
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">1.</span>
                  <span>
                    <a href="https://vmake.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300 font-medium">vmake.ai</a>에 가입하세요 (무료 크레딧 제공)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">2.</span>
                  <span>
                    로그인 후 <a href="https://vmake.ai/developers" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300 font-medium">Developers 페이지</a>에서 <span className="text-white font-medium">API Key</span>를 생성하세요
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">3.</span>
                  <span>
                    이 앱의 <span className="text-white font-medium">⚙️ API 설정</span> 버튼을 눌러서 <span className="text-cyan-400 font-medium">Vmake AI</span> 섹션에
                    <span className="text-white font-medium"> API Key</span>와 <span className="text-white font-medium">Secret Access Key</span>를 입력하세요
                  </span>
                </li>
              </ol>
              <div className="mt-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <p className="text-xs text-gray-400">
                  Vmake AI는 영상 속 자막, 워터마크, 로고를 AI가 자동으로 감지하고 배경을 자연스럽게 복원합니다.
                  별도의 프로그램 설치 없이 클라우드에서 처리되며, 1분 영상 기준 약 1~2분이면 완료됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vmake 연결됨 */}
      {vmakeReady && (
        <div className="mb-4 p-2 rounded-lg bg-cyan-900/20 border border-cyan-500/20 flex items-center gap-2">
          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
          <span className="text-xs text-cyan-400">Vmake AI 연결됨 — 클라우드 자막/워터마크 제거</span>
          <span className="text-xs text-gray-500 ml-auto">AK: {getVmakeAk().slice(0, 6)}...</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 입력 */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <h2 className="text-base font-bold text-gray-200 mb-3">원본 영상</h2>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                videoFile ? 'border-cyan-500/40 bg-cyan-900/10' : 'border-gray-600 hover:border-cyan-500/50 hover:bg-gray-700/30'
              }`}
            >
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
              {videoPreviewUrl ? (
                <video ref={videoRef} src={videoPreviewUrl} controls className="w-full rounded-lg max-h-64 object-contain" />
              ) : (
                <div className="py-8">
                  <div className="text-4xl mb-3">🎬</div>
                  <p className="text-sm text-gray-400">영상 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-gray-600 mt-1">MP4, MOV, AVI, WebM 등 대부분의 영상 형식을 지원합니다</p>
                </div>
              )}
            </div>

            {videoFile && (
              <div className="mt-3 text-sm text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>파일명</span>
                  <span className="text-gray-300 truncate ml-2 max-w-[200px]">{videoFile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>크기</span>
                  <span className="text-gray-300">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                {videoDuration > 0 && (
                  <div className="flex justify-between">
                    <span>길이</span>
                    <span className="text-gray-300">{Math.floor(videoDuration / 60)}분 {Math.floor(videoDuration % 60)}초</span>
                  </div>
                )}
              </div>
            )}

            {/* 메인 버튼 */}
            <div className="mt-4 flex gap-2">
              {phase === 'idle' && videoFile && vmakeReady && (
                <button
                  onClick={handleRemove}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30"
                >
                  🧹 자막/워터마크 제거 시작
                </button>
              )}
              {phase === 'idle' && videoFile && !vmakeReady && (
                <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-700 text-gray-500 cursor-not-allowed">
                  API 키를 먼저 설정하세요
                </button>
              )}
              {isProcessing && (
                <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-700 text-gray-400 cursor-not-allowed">
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {phase === 'uploading' ? '업로드 중...' : '자막 제거 중...'}
                  </span>
                </button>
              )}
              {videoFile && !isProcessing && (
                <button onClick={handleReset} className="px-4 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 상세 안내 */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-2">이렇게 사용하세요</h3>
            <ul className="text-xs text-gray-500 space-y-2">
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">1.</span>
                <span>위 영역을 클릭하거나 영상을 드래그해서 <span className="text-gray-300">업로드</span>합니다</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">2.</span>
                <span>"<span className="text-cyan-300">자막/워터마크 제거 시작</span>" 버튼을 누르면 Vmake AI가 작업을 시작합니다</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">3.</span>
                <span>AI가 자동으로 자막, 워터마크, 로고를 찾아서 <span className="text-gray-300">깔끔하게 제거</span>합니다</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400 font-bold">4.</span>
                <span>처리가 끝나면 <span className="text-green-400">다운로드 버튼</span>으로 결과 영상을 저장합니다</span>
              </li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-1.5">
              <p className="text-xs text-gray-600">
                <span className="text-gray-500 font-medium">엔진:</span> Vmake ScreenClear AI (클라우드)
              </p>
              <p className="text-xs text-gray-600">
                <span className="text-gray-500 font-medium">처리 방식:</span> 영상을 서버에 업로드 → AI가 자동으로 텍스트 영역 감지 → 프레임별 복원 → 결과 다운로드
              </p>
              <p className="text-xs text-gray-600">
                <span className="text-gray-500 font-medium">소요 시간:</span> 1분 영상 기준 약 <span className="text-cyan-400/80 font-medium">1~2분</span>
              </p>
              <p className="text-xs text-gray-600">
                <span className="text-gray-500 font-medium">지원 형식:</span> MP4, MOV, AVI, WebM 등 대부분의 영상 형식
              </p>
              <p className="text-xs text-gray-600">
                <span className="text-gray-500 font-medium">제거 대상:</span> 자막, 워터마크, 로고, 텍스트 오버레이 등 화면에 겹쳐진 모든 요소
              </p>
            </div>
          </div>
        </div>

        {/* 우측: 진행 + 결과 */}
        <div className="space-y-4">
          {isProcessing && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse" />
                  <h2 className="text-base font-bold text-gray-200">처리 중</h2>
                </div>
                {elapsed > 0 && (
                  <span className="text-sm text-gray-400 tabular-nums font-mono">{formatElapsed(elapsed)}</span>
                )}
              </div>

              <div className="w-full bg-gray-700 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-cyan-500 to-sky-500"
                  style={{
                    width: `${percent}%`,
                    backgroundSize: '200% 100%',
                    animation: 'subtitleShimmer 2s linear infinite',
                  }}
                />
              </div>

              <p className="text-sm text-cyan-400">{progress}</p>

              {elapsed > 0 && (
                <div className="mt-3 text-xs text-gray-500 italic text-center">
                  {PROCESSING_TIPS[Math.floor(elapsed / 8) % PROCESSING_TIPS.length]}
                </div>
              )}

              <style>{`@keyframes subtitleShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
          )}

          {phase === 'error' && (
            <div className="bg-gray-800 rounded-xl border border-red-500/30 p-5">
              <h2 className="text-base font-bold text-red-400 mb-2">❌ 오류 발생</h2>
              <p className="text-sm text-red-300 whitespace-pre-line">{error}</p>
              <button
                onClick={handleRemove}
                className="mt-3 px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600/50 border border-red-500/30 transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 결과 */}
          {phase === 'done' && resultBlobUrl && (
            <div className="bg-gray-800 rounded-xl border border-green-500/30 p-5">
              <h2 className="text-base font-bold text-green-400 mb-3 flex items-center gap-2">
                <span>✅</span> 자막/워터마크 제거 완료!
              </h2>
              <video src={resultBlobUrl} controls className="w-full rounded-lg max-h-80 object-contain bg-black" />
              <p className="text-xs text-gray-500 mt-2">위 영상을 재생해서 결과를 확인한 후 다운로드하세요.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={handleDownload} className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all">
                  💾 MP4 다운로드
                </button>
                <button onClick={handleReset} className="px-4 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                  새 영상
                </button>
              </div>
            </div>
          )}

          {/* idle 안내 */}
          {phase === 'idle' && !videoFile && (
            <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-8 text-center">
              <div className="text-5xl mb-4 opacity-30">🧹</div>
              <p className="text-gray-500 text-sm">영상을 업로드하면 자막/워터마크 제거를 시작할 수 있습니다</p>
              <p className="text-gray-600 text-xs mt-2">영상 업로드 → AI 자동 감지 → 원클릭 제거 → 다운로드</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubtitleRemoverTab;
