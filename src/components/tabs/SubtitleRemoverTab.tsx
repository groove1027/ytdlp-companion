import React, { useState, useRef, useCallback } from 'react';
import { removeSubtitlesWithGhostCut } from '../../services/ghostcutService';
import { getGhostCutKeys } from '../../services/apiService';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useCostStore } from '../../stores/costStore';
import { PRICING } from '../../constants';

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
    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    setResultBlobUrl(null);
    setPhase('idle');
    setError('');
    setProgress('');
    setPercent(0);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);

    // 영상 길이 추출
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
      URL.revokeObjectURL(video.src);
    };
    video.src = url;
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
        (msg) => {
          setProgress(msg);
          if (msg.includes('업로드')) setPercent(15);
          else if (msg.includes('시작')) { setPercent(30); setPhase('processing'); }
          else if (msg.includes('대기')) setPercent(35);
          else if (msg.includes('처리 중')) setPercent(Math.min(percent + 5, 85));
          else if (msg.includes('다운로드')) setPercent(90);
        },
      );

      // 비용 추가
      const cost = Math.max(videoDuration * PRICING.WAVESPEED_PER_SEC, 0.05);
      addCost(cost, 'video');

      const url = URL.createObjectURL(resultBlob);
      setResultBlobUrl(url);
      setPhase('done');
      setPercent(100);
      setProgress('자막 제거 완료!');
    } catch (err: unknown) {
      setPhase('error');
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setPercent(0);
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
    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
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

  const estimatedCost = videoDuration > 0
    ? Math.max(videoDuration * PRICING.WAVESPEED_PER_SEC, 0.05)
    : 0;

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
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600">
              <p>엔진: GhostCut AI (OCR 기반 텍스트 감지 + 인페인팅)</p>
              <p>비용: 약 $0.01/초 (최소 $0.05)</p>
              <p>처리 시간: 영상 길이에 따라 1~15분</p>
            </div>
          </div>
        </div>

        {/* 우측: 진행 + 결과 */}
        <div className="space-y-4">
          {/* 진행 상태 */}
          {phase !== 'idle' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <h2 className="text-base font-bold text-gray-200 mb-3">처리 상태</h2>

              {/* 프로그레스 바 */}
              <div className="w-full bg-gray-700 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    phase === 'error' ? 'bg-red-500' :
                    phase === 'done' ? 'bg-green-500' :
                    'bg-gradient-to-r from-cyan-500 to-blue-500'
                  }`}
                  style={{ width: `${percent}%` }}
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
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* 단계 표시 */}
              {(phase === 'uploading' || phase === 'processing') && (
                <div className="mt-4 space-y-2">
                  {[
                    { label: 'Cloudinary 업로드', done: percent > 20 },
                    { label: 'GhostCut 작업 제출', done: percent > 30 },
                    { label: 'AI 자막 감지 & 제거', done: percent > 85 },
                    { label: '결과 영상 다운로드', done: percent >= 100 },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {step.done ? (
                        <span className="text-green-400">✓</span>
                      ) : percent > (i * 25) ? (
                        <svg className="w-4 h-4 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <span className="text-gray-600">○</span>
                      )}
                      <span className={step.done ? 'text-gray-300' : percent > (i * 25) ? 'text-cyan-300' : 'text-gray-600'}>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}
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
