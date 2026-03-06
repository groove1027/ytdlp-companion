import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useUploadStore } from '../../../stores/uploadStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
};

const ACCEPT_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const StepVideo: React.FC = () => {
  const videoFile = useUploadStore((s) => s.videoFile);
  const videoUrl = useUploadStore((s) => s.videoUrl);
  const videoDuration = useUploadStore((s) => s.videoDuration);
  const videoSize = useUploadStore((s) => s.videoSize);
  const setVideoFile = useUploadStore((s) => s.setVideoFile);
  const setVideoDuration = useUploadStore((s) => s.setVideoDuration);
  const clearVideo = useUploadStore((s) => s.clearVideo);

  const exportedBlob = useEditRoomStore((s) => s.exportedVideoBlob);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 비디오 메타데이터 추출
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;
    const handler = () => {
      if (el.duration && isFinite(el.duration)) setVideoDuration(el.duration);
    };
    el.addEventListener('loadedmetadata', handler);
    return () => el.removeEventListener('loadedmetadata', handler);
  }, [videoUrl, setVideoDuration]);

  const processFile = useCallback((file: File) => {
    if (!ACCEPT_TYPES.includes(file.type)) {
      alert('MP4, WebM, MOV 파일만 지원합니다.');
      return;
    }
    setVideoFile(file);
  }, [setVideoFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleUseEditRoomExport = useCallback(() => {
    if (!exportedBlob) return;
    const file = new File([exportedBlob], 'editroom-export.mp4', { type: 'video/mp4' });
    setVideoFile(file);
  }, [exportedBlob, setVideoFile]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-white">영상 파일</h3>
          {videoFile && (
            <span className="text-sm font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full">
              준비됨
            </span>
          )}
        </div>
        {videoFile && (
          <button
            type="button"
            onClick={clearVideo}
            className="text-sm text-gray-400 hover:text-red-400 bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-600 transition-colors"
          >
            영상 제거
          </button>
        )}
      </div>

      <p className="text-sm text-gray-400">업로드할 영상 파일을 선택하세요. MP4, WebM, MOV를 지원합니다.</p>

      {/* 편집실 내보내기 배너 */}
      {exportedBlob && !videoFile && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-purple-400 text-lg">🎬</span>
              <div>
                <p className="text-base text-purple-300 font-bold">편집실에서 내보낸 영상이 있습니다</p>
                <p className="text-sm text-purple-400/70">
                  {formatFileSize(exportedBlob.size)} MP4
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUseEditRoomExport}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold transition-colors"
            >
              이 영상 사용
            </button>
          </div>
        </div>
      )}

      {/* 영상 미리보기 */}
      {videoUrl ? (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full max-h-80 bg-black"
            preload="metadata"
          />
          <div className="px-4 py-3 flex items-center gap-4 border-t border-gray-700/50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">파일:</span>
              <span className="text-sm text-gray-300 font-medium truncate max-w-[200px]">{videoFile?.name}</span>
            </div>
            {videoSize && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">크기:</span>
                <span className="text-sm text-amber-400 font-mono">{formatFileSize(videoSize)}</span>
              </div>
            )}
            {videoDuration && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">길이:</span>
                <span className="text-sm text-cyan-400 font-mono">{formatDuration(videoDuration)}</span>
              </div>
            )}
            {videoFile?.type && (
              <span className="text-[11px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                {videoFile.type.split('/')[1]?.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* 드래그 앤 드롭 존 */
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-gray-600 hover:border-purple-500/50 hover:bg-gray-900/30'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-colors ${
              isDragOver ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-700 text-gray-500'
            }`}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-300 text-base font-medium">
                {isDragOver ? '여기에 놓으세요!' : '영상 파일을 드래그하거나 클릭하여 선택'}
              </p>
              <p className="text-gray-500 text-sm mt-1">MP4, WebM, MOV 지원</p>
            </div>
            <button
              type="button"
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium border border-gray-600 transition-colors"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              파일 선택
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default StepVideo;
