import React, { useState, useRef, useCallback } from 'react';
import { removeSubtitlesWithGhostCut } from '../../services/ghostcutService';
import { getGhostCutKeys } from '../../services/apiService';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { useCostStore } from '../../stores/costStore';
// GhostCut 자막 제거 비용은 건당 고정 (PRICING 불필요)
import { logger } from '../../services/LoggerService';

const REMOVAL_TIPS = [
  '🎬 AI가 영상의 모든 프레임에서 텍스트를 탐지하고 있어요',
  '🧹 자막 영역을 감지한 뒤 배경을 자연스럽게 복원합니다',
  '⏳ 영상 길이에 따라 5~15분 이상 소요될 수 있어요',
  '🔍 프레임 단위로 OCR 분석 중 — 고품질 결과를 위한 과정이에요',
  '💡 처리 중 브라우저를 닫지 마세요. 서버에서 작업이 진행됩니다',
  '🎯 워터마크도 텍스트 기반이면 함께 제거됩니다',
  '📱 세로 영상도 가로 영상과 동일하게 처리할 수 있어요',
  '✨ AI 인페인팅으로 자막 뒤 배경을 자연스럽게 채웁니다',
];

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const SubtitleRemoverTab: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const addCost = useCostStore((s) => s.addCost);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = phase === 'uploading' || phase === 'processing';
  const elapsed = useElapsedTimer(isProcessing);

  const hasKeys = (() => {
    const { appKey, appSecret } = getGhostCutKeys();
    return !!(appKey && appSecret);
  })();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 업로드할 수 있습니다.');
      return;
    }
    // 이전 결과 초기화
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

    // 영상 길이 추출 (별도의 임시 video 엘리먼트 사용)
    const video = document.createElement('video');
    video.preload = 'metadata';
    const durationProbeUrl = URL.createObjectURL(file);
    logger.registerBlobUrl(durationProbeUrl, 'video', 'SubtitleRemoverTab:durationProbe');
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      logger.unregisterBlobUrl(durationProbeUrl);
      URL.revokeObjectURL(durationProbeUrl);
    };
    video.src = durationProbeUrl;
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
    logger.trackAction('자막/워터마크 제거 시작');
    if (!requireAuth('자막 제거')) return;
    if (!videoFile) return;

    setPhase('uploading');
    setError('');
    setPercent(5);
    setProgress('영상 업로드 준비 중...');

    try {
      const blob = new Blob([await videoFile.arrayBuffer()], { type: videoFile.type });

      const resultBlob = await removeSubtitlesWithGhostCut(
        blob,
        0,
        0,
        (msg, elapsedSec) => {
          setProgress(msg);
          if (msg.includes('업로드')) {
            setPercent(15);
          } else if (msg.includes('시작')) {
            setPercent(30);
            setPhase('processing');
          } else if (msg.includes('대기열')) {
            setPercent(35);
          } else if (msg.includes('재시도')) {
            // 네트워크 오류 재시도 — 퍼센트 유지
          } else if (msg.includes('다운로드')) {
            setPercent(90);
          } else if (elapsedSec != null) {
            // 경과 시간 기반 진행률 (30~85% 범위, 최대 예상시간 기반)
            // [FIX #486] GhostCut은 영상 1초당 약 15~25초 처리 소요 (롱폼 실측 반영)
            const estimatedTotal = Math.max(videoDuration * 20, 180);
            const ratio = Math.min(elapsedSec / estimatedTotal, 1);
            setPercent(Math.round(30 + ratio * 55)); // 30% ~ 85%
          }
        },
        videoDuration,
      );

      // 비용 추가 (GhostCut 자막 제거 — 건당 고정 비용)
      const cost = 0.10;
      addCost(cost, 'video');

      const url = URL.createObjectURL(resultBlob);
      logger.registerBlobUrl(url, 'video', 'SubtitleRemoverTab:handleRemove');
      setResultBlobUrl(url);
      setPhase('done');
      setPercent(100);
      setProgress('자막 제거 완료!');
    } catch (err: unknown) {
      setPhase('error');
      const raw = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      // "Failed to fetch"는 CORS/네트워크 오류 — 사용자에게 구체적 안내
      const message = raw.includes('Failed to fetch')
        ? 'GhostCut 서버 연결 실패 — 네트워크 상태를 확인하거나 잠시 후 다시 시도해주세요.'
        : raw;
      setError(message);
      // 진행률 유지 (어디서 실패했는지 사용자에게 표시)
    }
  }, [videoFile, requireAuth, addCost, videoDuration, percent]);

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

  const estimatedCost = videoDuration > 0 ? 0.10 : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <span className="text-2xl">🧹</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">자막/워터마크 제거</h1>
          <p className="text-sm text-gray-400">GhostCut AI로 영상의 자막과 워터마크를 자동 제거합니다</p>
        </div>
        <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
      </div>

      {/* API 키 미설정 경고 */}
      {!hasKeys && (
        <div className="mb-6 p-4 rounded-xl bg-amber-900/20 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-300">GhostCut API 키가 설정되지 않았습니다</p>
              <p className="text-sm text-amber-200/70 mt-1">
                API 설정에서 GhostCut App Key와 App Secret을 입력해주세요.
                GhostCut 공식 사이트에서 발급받을 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 입력 */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <h2 className="text-base font-bold text-gray-200 mb-3">원본 영상</h2>

            {/* 드래그앤드롭 영역 */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                videoFile
                  ? 'border-cyan-500/40 bg-cyan-900/10'
                  : 'border-gray-600 hover:border-cyan-500/50 hover:bg-gray-700/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  controls
                  className="w-full rounded-lg max-h-64 object-contain"
                />
              ) : (
                <div className="py-8">
                  <div className="text-4xl mb-3">🎬</div>
                  <p className="text-sm text-gray-400">영상 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-gray-600 mt-1">MP4, MOV, AVI, WebM 등</p>
                </div>
              )}
            </div>

            {/* 영상 정보 */}
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
                      <span>예상 비용</span>
                      <span className="text-cyan-400 font-bold">${estimatedCost.toFixed(3)} (~{Math.round(estimatedCost * 1450)}원)</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 15초 초과 영상 — 무료 플랜 제한 경고 */}
            {videoFile && videoDuration > 15 && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-900/20 border border-amber-500/30">
                <p className="text-xs text-amber-300 font-medium">
                  영상 길이가 {Math.floor(videoDuration / 60)}분 {Math.floor(videoDuration % 60)}초입니다.
                  GhostCut 무료 플랜은 15초까지만 처리됩니다.
                </p>
                <p className="text-[11px] text-amber-400/70 mt-1">
                  전체 영상을 처리하려면 GhostCut 유료 플랜이 필요합니다.
                </p>
              </div>
            )}

            {/* 대용량 파일 경고 */}
            {videoFile && videoFile.size > 500 * 1024 * 1024 && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-900/20 border border-amber-500/30">
                <p className="text-xs text-amber-300">
                  파일 크기가 {(videoFile.size / 1024 / 1024).toFixed(0)}MB입니다.
                  업로드와 처리에 시간이 상당히 오래 걸릴 수 있습니다 (최대 20~30분).
                </p>
              </div>
            )}

            {/* 자동 감지 안내 */}
            {videoFile && (
              <div className="mt-3">
                <p className="text-[11px] text-gray-500">
                  GhostCut이 자막 언어를 자동 감지합니다. 한국어/영어/중국어가 섞인 영상도 그대로 시도해보세요.
                </p>
              </div>
            )}

            {/* 예상 소요시간 + 주의사항 안내 */}
            {videoFile && videoDuration > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-blue-900/15 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 text-sm mt-0.5">&#9432;</span>
                  <div className="space-y-1">
                    <p className="text-xs text-blue-300 font-medium">
                      예상 소요시간: 약 {
                        videoDuration < 15 ? '2~5분'
                        : videoDuration < 60 ? '3~8분'
                        : videoDuration < 180 ? '5~12분'
                        : videoDuration < 600 ? '10~20분'
                        : '15~30분'
                      }
                    </p>
                    <p className="text-[11px] text-blue-400/70 leading-relaxed">
                      자막 제거는 AI 서버에서 프레임 단위로 처리하므로 시간이 오래 걸립니다.
                      {videoDuration >= 60 && ' 긴 영상일수록 더 오래 소요됩니다.'}
                      {' '}처리 중 브라우저를 닫지 마세요.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 실행 버튼 */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleRemove}
                disabled={!videoFile || !hasKeys || phase === 'uploading' || phase === 'processing'}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'uploading' || phase === 'processing' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    처리 중...
                  </span>
                ) : '🧹 자막/워터마크 제거 시작'}
              </button>
              {videoFile && phase !== 'uploading' && phase !== 'processing' && (
                <button
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 안내 */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <h3 className="text-sm font-bold text-gray-300 mb-2">사용 안내</h3>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li className="flex gap-2"><span className="text-cyan-400">1.</span> 자막이나 워터마크가 있는 영상을 업로드합니다</li>
              <li className="flex gap-2"><span className="text-cyan-400">2.</span> GhostCut AI가 자동으로 텍스트 영역을 감지합니다</li>
              <li className="flex gap-2"><span className="text-cyan-400">3.</span> AI가 텍스트를 제거하고 배경을 자연스럽게 복원합니다</li>
              <li className="flex gap-2"><span className="text-cyan-400">4.</span> 완성된 영상을 미리보기하고 다운로드합니다</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600 space-y-1">
              <p>엔진: GhostCut AI (OCR 기반 텍스트 감지 + 인페인팅)</p>
              <p>비용: 약 $0.01/초 (최소 $0.05)</p>
              <p>처리 시간: 영상 길이에 따라 <span className="text-amber-400/80 font-medium">최소 3분 ~ 최대 30분</span></p>
              <p className="text-gray-600/80">
                AI가 프레임마다 자막을 탐지하고 제거하는 고품질 처리이므로 시간이 오래 걸리는 것이 정상입니다.
              </p>
            </div>
          </div>
        </div>

        {/* 우측: 진행 + 결과 */}
        <div className="space-y-4">
          {/* 진행 상태 */}
          {phase !== 'idle' && (
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

              {/* 프로그레스 바 */}
              <div className="w-full bg-gray-800 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    phase === 'error' ? 'bg-red-500' :
                    phase === 'done' ? 'bg-green-500' :
                    'bg-gradient-to-r from-cyan-500 to-sky-500'
                  }`}
                  style={{
                    width: `${percent}%`,
                    ...(isProcessing ? { backgroundSize: '200% 100%', animation: 'subtitleShimmer 2s linear infinite' } : {}),
                  }}
                />
              </div>

              <div className="flex justify-between items-center">
                <p className={`text-sm ${
                  phase === 'error' ? 'text-red-400' :
                  phase === 'done' ? 'text-green-400' :
                  'text-cyan-400'
                }`}>
                  {phase === 'error' ? '❌ 오류 발생' : progress}
                </p>
                <span className="text-sm text-gray-500 font-mono">{percent}%</span>
              </div>

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-900/20 border border-red-500/30">
                  <p className="text-sm text-red-300 whitespace-pre-line">{error}</p>
                  {/* KV 설정 오류는 관리자 안내, 나머지는 재시도 버튼 */}
                  {error.includes('KV') ? (
                    <p className="text-xs text-red-400/70 mt-2">
                      관리자에게 Cloudflare KV 바인딩 설정을 요청하세요.
                    </p>
                  ) : (
                    <button
                      onClick={handleRemove}
                      className="mt-2 px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600/50 border border-red-500/30 transition-colors"
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}

              {/* 단계 표시 */}
              {(phase === 'uploading' || phase === 'processing') && (
                <div className="mt-4 space-y-2">
                  {[
                    { label: '영상 업로드 (Cloudinary)', threshold: 20 },
                    { label: 'GhostCut AI 서버에 작업 요청', threshold: 32 },
                    { label: 'AI 자막 감지 및 배경 복원 (5~15분 소요 — 정상)', threshold: 85 },
                    { label: '처리 완료된 영상 다운로드', threshold: 95 },
                  ].map((step, i, arr) => {
                    const done = percent >= step.threshold;
                    const active = !done && (i === 0 || percent >= arr[i - 1].threshold);
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {done ? (
                          <span className="text-green-400">✓</span>
                        ) : active ? (
                          <svg className="w-4 h-4 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <span className="text-gray-600">○</span>
                        )}
                        <span className={done ? 'text-gray-300' : active ? 'text-cyan-300' : 'text-gray-600'}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 처리 중 안내 메시지 */}
              {phase === 'processing' && percent < 85 && (
                <div className="mt-3 p-2.5 rounded-lg bg-cyan-900/10 border border-cyan-500/15">
                  <p className="text-[11px] text-cyan-400/80 leading-relaxed">
                    AI가 영상의 모든 프레임을 분석하고 자막을 제거합니다.
                    이 과정은 서버에서 처리되며 영상 길이에 따라 5~15분 이상 소요됩니다.
                    페이지를 닫거나 새로고침하지 마세요.
                  </p>
                </div>
              )}

              {/* 대기 중 회전 팁 */}
              {isProcessing && elapsed > 0 && (
                <div className="mt-3 text-xs text-gray-500 italic text-center transition-opacity duration-500">
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

              <video
                src={resultBlobUrl}
                controls
                className="w-full rounded-lg max-h-80 object-contain bg-black"
              />

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all"
                >
                  💾 MP4 다운로드
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  새 영상
                </button>
              </div>
            </div>
          )}

          {/* idle 상태 안내 */}
          {phase === 'idle' && !videoFile && (
            <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-8 text-center">
              <div className="text-5xl mb-4 opacity-30">🧹</div>
              <p className="text-gray-500 text-sm">영상을 업로드하면 여기에 결과가 표시됩니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubtitleRemoverTab;
