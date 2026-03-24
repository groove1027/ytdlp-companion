import React, { useState, useRef, useCallback, useEffect } from 'react';
import { isInpaintAvailable, detectTextRegions, removeSubtitlesWithInpaint, resetInpaintCache } from '../../services/companionInpaintService';
import type { TextRegion, InpaintMask } from '../../services/companionInpaintService';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { logger } from '../../services/LoggerService';
import { COMPANION_DOWNLOAD_URL } from '../../constants';

const REMOVAL_TIPS = [
  '🎬 ProPainter가 영상의 모든 프레임에서 마스크 영역을 처리하고 있어요',
  '🧹 마스크 영역의 배경을 자연스럽게 복원합니다',
  '⏳ 영상 길이에 따라 1~5분 소요될 수 있어요',
  '🔍 프레임 단위로 인페인팅 중 — 고품질 결과를 위한 과정이에요',
  '💡 처리 중 브라우저를 닫지 마세요',
  '🎯 PaddleOCR로 감지된 영역을 정확하게 제거합니다',
  '📱 세로 영상도 가로 영상과 동일하게 처리할 수 있어요',
  '✨ ProPainter 인페인팅으로 자막 뒤 배경을 자연스럽게 채웁니다',
];

type Phase = 'idle' | 'detecting' | 'ready' | 'processing' | 'done' | 'error';

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
  const [companionReady, setCompanionReady] = useState<boolean | null>(null);
  const [detectedRegions, setDetectedRegions] = useState<TextRegion[]>([]);
  const [masks, setMasks] = useState<InpaintMask[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });

  const isProcessing = phase === 'detecting' || phase === 'processing';
  const elapsed = useElapsedTimer(isProcessing);

  // 컴패니언 상태 확인
  useEffect(() => {
    isInpaintAvailable().then(setCompanionReady);
    const interval = setInterval(() => isInpaintAvailable().then(setCompanionReady), 30_000);
    return () => clearInterval(interval);
  }, []);

  // 컴패니언이 나중에 연결되면, 이미 업로드된 영상에 대해 자동 감지 재실행
  useEffect(() => {
    if (companionReady && videoFile && phase === 'idle' && videoDims.width > 0) {
      runDetection(videoFile, videoDims);
    }
  }, [companionReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // OCR 자동 감지 (내부 함수 — 업로드 후 자동 호출)
  const runDetection = useCallback(async (file: File, dims: { width: number; height: number }) => {
    const available = await isInpaintAvailable();
    if (!available || !file) return;

    setPhase('detecting');
    setError('');
    setProgress('자막 영역 자동 감지 중...');
    setPercent(10);

    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      const regions = await detectTextRegions(blob);
      setDetectedRegions(regions);
      const autoMasks: InpaintMask[] = regions.map(r => ({
        x: r.x, y: r.y, width: r.width, height: r.height,
      }));
      setMasks(autoMasks);
      setPhase('ready');
      setPercent(20);
      setProgress(`${regions.length}개 텍스트 영역 자동 감지 완료`);
    } catch {
      // OCR 실패 시 하단 20% 폴백 (메타데이터 확인)
      if (dims.width > 0 && dims.height > 0) {
        setMasks([{
          x: 0,
          y: Math.round(dims.height * 0.8),
          width: dims.width,
          height: Math.round(dims.height * 0.2),
        }]);
        setPhase('ready');
        setPercent(20);
        setProgress('자동 감지 실패 — 하단 20% 기본 영역 사용. 고급 옵션에서 수정 가능.');
      } else {
        setPhase('error');
        setError('영상 로드 중입니다. 잠시 후 다시 시도해주세요.');
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 업로드할 수 있습니다.');
      return;
    }
    if (resultBlobUrl) { logger.unregisterBlobUrl(resultBlobUrl); URL.revokeObjectURL(resultBlobUrl); }
    setResultBlobUrl(null);
    setPhase('idle');
    setError('');
    setProgress('');
    setPercent(0);
    setDetectedRegions([]);
    setMasks([]);
    setVideoDims({ width: 0, height: 0 });
    setShowAdvanced(false);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    logger.registerBlobUrl(url, 'video', 'SubtitleRemoverTab:handleFileSelect');
    setVideoPreviewUrl(url);

    // 메타데이터 로드 후 OCR 자동 실행
    const video = document.createElement('video');
    video.preload = 'metadata';
    const durationProbeUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(durationProbeUrl, 'video', 'SubtitleRemoverTab:durationProbe');
    video.onloadedmetadata = () => {
      const dims = { width: video.videoWidth, height: video.videoHeight };
      setVideoDuration(video.duration);
      setVideoDims(dims);
      logger.unregisterBlobUrl(durationProbeUrl);
      URL.revokeObjectURL(durationProbeUrl);
      // 자동 OCR 감지 트리거
      runDetection(file, dims);
    };
    video.src = durationProbeUrl;
  }, [resultBlobUrl, runDetection]);

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

  // 캔버스에 마스크 그리기
  const drawMasksOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    for (const mask of masks) {
      ctx.fillRect(mask.x, mask.y, mask.width, mask.height);
      ctx.strokeRect(mask.x, mask.y, mask.width, mask.height);
    }
  }, [masks]);

  useEffect(() => {
    if (showAdvanced && phase === 'ready') drawMasksOnCanvas();
  }, [showAdvanced, phase, masks, drawMasksOnCanvas]);

  // 마우스로 마스크 추가
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    setIsDrawing(true);
    setDrawStart({
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    });
  }, []);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const endX = Math.round((e.clientX - rect.left) * scaleX);
    const endY = Math.round((e.clientY - rect.top) * scaleY);
    const newMask: InpaintMask = {
      x: Math.min(drawStart.x, endX),
      y: Math.min(drawStart.y, endY),
      width: Math.abs(endX - drawStart.x),
      height: Math.abs(endY - drawStart.y),
    };
    if (newMask.width > 10 && newMask.height > 10) {
      setMasks(prev => [...prev, newMask]);
    }
    setIsDrawing(false);
    setDrawStart(null);
  }, [isDrawing, drawStart]);

  // 원클릭 자막 제거 (감지 완료 후 바로 실행)
  const handleRemove = useCallback(async () => {
    logger.trackAction('자막/워터마크 제거 시작 (ProPainter)');
    if (!requireAuth('자막 제거')) return;
    if (!videoFile || masks.length === 0) return;

    setPhase('processing');
    setError('');
    setPercent(25);
    setProgress('ProPainter 인페인팅 시작...');

    try {
      const blob = new Blob([await videoFile.arrayBuffer()], { type: videoFile.type });
      const resultBlob = await removeSubtitlesWithInpaint(blob, masks, (msg, pct) => {
        setProgress(msg);
        if (pct != null) setPercent(pct);
      });
      const url = URL.createObjectURL(resultBlob);
      logger.registerBlobUrl(url, 'video', 'SubtitleRemoverTab:handleRemove');
      setResultBlobUrl(url);
      setPhase('done');
      setPercent(100);
      setProgress('자막 제거 완료!');
    } catch (err: unknown) {
      setPhase('error');
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(message);
    }
  }, [videoFile, masks, requireAuth]);

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
    setDetectedRegions([]);
    setMasks([]);
    setShowAdvanced(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resultBlobUrl, videoPreviewUrl]);

  const handleRetryCompanion = useCallback(() => {
    resetInpaintCache();
    isInpaintAvailable().then(setCompanionReady);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span className="text-2xl">🧹</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">자막/워터마크 제거</h1>
          <p className="text-sm text-gray-400">영상을 업로드하면 AI가 자동으로 자막을 감지하고 제거합니다 — 무료</p>
        </div>
        <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
      </div>

      {/* 컴패니언 미연결: 다운로드 링크 + 설치 가이드 */}
      {companionReady === false && (
        <div className="mb-6 p-5 rounded-xl bg-amber-900/20 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300">컴패니언 앱이 감지되지 않습니다</p>
              <p className="text-sm text-amber-200/70 mt-1">
                자막 제거는 컴패니언 앱의 ProPainter 엔진으로 작동합니다. 아래 순서대로 설정해주세요:
              </p>
              <ol className="mt-3 text-sm text-amber-200/80 space-y-2">
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">1.</span>
                  <span>컴패니언 앱을 <a href={COMPANION_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300 font-medium">여기서 다운로드</a>하세요</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">2.</span>
                  <span>다운로드한 앱을 설치하고 실행하세요</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">3.</span>
                  <span>시스템 트레이에 컴패니언 아이콘이 보이면 준비 완료!</span>
                </li>
              </ol>
              <button
                onClick={handleRetryCompanion}
                className="mt-3 px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-600/30 text-amber-300 hover:bg-amber-600/50 border border-amber-500/30 transition-colors"
              >
                다시 감지
              </button>
            </div>
          </div>
        </div>
      )}

      {companionReady && (
        <div className="mb-4 p-2 rounded-lg bg-green-900/20 border border-green-500/20 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-400">컴패니언 연결됨 — 무료 로컬 처리</span>
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
                <video ref={videoRef} src={videoPreviewUrl} controls className="w-full rounded-lg max-h-64 object-contain" onLoadedData={drawMasksOnCanvas} />
              ) : (
                <div className="py-8">
                  <div className="text-4xl mb-3">🎬</div>
                  <p className="text-sm text-gray-400">영상 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-gray-600 mt-1">업로드하면 자동으로 자막을 감지합니다</p>
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
                  <>
                    <div className="flex justify-between">
                      <span>길이</span>
                      <span className="text-gray-300">{Math.floor(videoDuration / 60)}분 {Math.floor(videoDuration % 60)}초</span>
                    </div>
                    <div className="flex justify-between">
                      <span>비용</span>
                      <span className="text-green-400 font-bold">무료 (로컬 처리)</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 감지 결과 요약 + 원클릭 제거 버튼 */}
            {phase === 'ready' && masks.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-cyan-900/15 border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-cyan-400 text-sm">✅</span>
                  <span className="text-sm text-cyan-300 font-medium">{masks.length}개 자막 영역 감지됨</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  {detectedRegions.length > 0
                    ? detectedRegions.map(r => `"${r.text}"`).slice(0, 3).join(', ') + (detectedRegions.length > 3 ? ` 외 ${detectedRegions.length - 3}개` : '')
                    : '하단 영역 기본 마스크 적용됨'}
                </p>
              </div>
            )}

            {/* 메인 버튼 영역 */}
            <div className="mt-4 flex gap-2">
              {/* 원클릭 제거 (감지 완료 후) */}
              {phase === 'ready' && masks.length > 0 && (
                <button
                  onClick={handleRemove}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30"
                >
                  🧹 자막 제거 시작
                </button>
              )}
              {/* idle + 영상 있음 + 컴패니언 없음 */}
              {phase === 'idle' && videoFile && !companionReady && (
                <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-700 text-gray-500 cursor-not-allowed">
                  컴패니언 앱 필요
                </button>
              )}
              {/* 처리 중 */}
              {isProcessing && (
                <button disabled className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-700 text-gray-400 cursor-not-allowed">
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {phase === 'detecting' ? '자막 감지 중...' : '제거 처리 중...'}
                  </span>
                </button>
              )}
              {videoFile && !isProcessing && (
                <button onClick={handleReset} className="px-4 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                  초기화
                </button>
              )}
            </div>

            {/* 고급 옵션 토글 (마스크 편집) */}
            {phase === 'ready' && (
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="mt-2 w-full text-xs text-gray-500 hover:text-gray-400 text-center py-1 transition-colors"
              >
                {showAdvanced ? '▲ 고급 옵션 접기' : '▼ 고급 옵션 (제거 영역 수동 편집)'}
              </button>
            )}
          </div>

          {/* 고급: 마스크 편집 (접히는 패널) */}
          {showAdvanced && phase === 'ready' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <h2 className="text-base font-bold text-gray-200 mb-3">제거 영역 수동 편집</h2>
              <p className="text-xs text-gray-500 mb-3">빨간 영역이 제거됩니다. 캔버스를 드래그해서 영역을 추가하세요.</p>
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg cursor-crosshair border border-gray-600"
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">{masks.length}개 마스크 영역</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMasks([]); }}
                    className="text-xs px-3 py-1 rounded bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
                  >
                    전체 삭제
                  </button>
                  <button
                    onClick={() => { setMasks(prev => prev.slice(0, -1)); }}
                    disabled={masks.length === 0}
                    className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600 disabled:opacity-40"
                  >
                    마지막 삭제
                  </button>
                  <button
                    onClick={() => videoFile && runDetection(videoFile, videoDims)}
                    className="text-xs px-3 py-1 rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30"
                  >
                    다시 감지
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 안내 */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-2">사용 안내</h3>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li className="flex gap-2"><span className="text-cyan-400">1.</span> 영상을 업로드하면 AI가 자동으로 자막 영역을 감지합니다</li>
              <li className="flex gap-2"><span className="text-cyan-400">2.</span> "자막 제거 시작" 버튼을 클릭하면 바로 처리됩니다</li>
              <li className="flex gap-2"><span className="text-cyan-400">3.</span> 필요시 "고급 옵션"에서 제거 영역을 수동으로 조절할 수 있습니다</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600 space-y-1">
              <p>엔진: ProPainter (ICCV 2023) + PaddleOCR</p>
              <p>비용: 무료 (로컬 GPU 처리)</p>
              <p>처리 시간: 영상 길이에 따라 <span className="text-cyan-400/80 font-medium">1~5분</span></p>
            </div>
          </div>
        </div>

        {/* 우측: 진행 + 결과 */}
        <div className="space-y-4">
          {(phase === 'detecting' || phase === 'processing' || phase === 'error') && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isProcessing && <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse" />}
                  <h2 className="text-base font-bold text-gray-200">처리 상태</h2>
                </div>
                {isProcessing && elapsed > 0 && (
                  <span className="text-sm text-gray-400 tabular-nums font-mono">{formatElapsed(elapsed)}</span>
                )}
              </div>

              <div className="w-full bg-gray-700 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    phase === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-500 to-sky-500'
                  }`}
                  style={{
                    width: `${percent}%`,
                    ...(isProcessing ? { backgroundSize: '200% 100%', animation: 'subtitleShimmer 2s linear infinite' } : {}),
                  }}
                />
              </div>

              <p className={`text-sm ${phase === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>
                {phase === 'error' ? '❌ 오류 발생' : progress}
              </p>

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                  <p className="text-sm text-red-300 whitespace-pre-line">{error}</p>
                  <button
                    onClick={masks.length > 0 ? handleRemove : () => videoFile && runDetection(videoFile, videoDims)}
                    className="mt-2 px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600/50 border border-red-500/30 transition-colors"
                  >
                    {masks.length > 0 ? '다시 시도' : '다시 감지'}
                  </button>
                </div>
              )}

              {isProcessing && elapsed > 0 && (
                <div className="mt-3 text-xs text-gray-500 italic text-center">
                  {REMOVAL_TIPS[Math.floor(elapsed / 8) % REMOVAL_TIPS.length]}
                </div>
              )}

              <style>{`@keyframes subtitleShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
          )}

          {/* 결과 */}
          {phase === 'done' && resultBlobUrl && (
            <div className="bg-gray-800 rounded-xl border border-green-500/30 p-5">
              <h2 className="text-base font-bold text-green-400 mb-3 flex items-center gap-2">
                <span>✅</span> 자막 제거 완료
              </h2>
              <video src={resultBlobUrl} controls className="w-full rounded-lg max-h-80 object-contain bg-black" />
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
              <p className="text-gray-500 text-sm">영상을 업로드하면 자동으로 자막을 감지합니다</p>
              <p className="text-gray-600 text-xs mt-2">업로드 → 자동 감지 → 원클릭 제거</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubtitleRemoverTab;
