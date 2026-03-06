import React from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useProjectStore } from '../../../stores/projectStore';
import { ImageModel, VideoModel } from '../../../types';
import type { ExportProgress } from '../../../types';

interface EditRoomExportBarProps {
  onExportSrt: () => void;
  onExportZip: () => void;
  onExportMp4: () => void;
  onCancelExport?: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

const IMAGE_MODEL_LABELS: Record<string, string> = {
  [ImageModel.FLASH]: 'Flash',
  [ImageModel.NANO_COST]: 'Nanobanana 2',
  [ImageModel.NANO_SPEED]: 'Nanobanana 2 Fast',
};

const VIDEO_MODEL_LABELS: Record<string, string> = {
  [VideoModel.VEO]: 'Veo 3.1 1080p',
  [VideoModel.GROK]: 'Grok',
  [VideoModel.VEO_QUALITY]: 'Veo 3.1 Quality',
};

const PHASE_LABELS: Record<ExportProgress['phase'], string> = {
  'initializing': '초기화',
  'loading-ffmpeg': 'FFmpeg 로딩',
  'writing-assets': '에셋 준비',
  'composing': '합성 중',
  'encoding': '인코딩',
  'done': '완료',
};

const EditRoomExportBar: React.FC<EditRoomExportBarProps> = ({
  onExportSrt,
  onExportZip,
  onExportMp4,
  onCancelExport,
}) => {
  const isExporting = useEditRoomStore((s) => s.isExporting);
  const exportProgress = useEditRoomStore((s) => s.exportProgress);
  const scenes = useProjectStore((s) => s.scenes);
  const config = useProjectStore((s) => s.config);
  const hasVideos = scenes.some((s) => !!s.videoUrl);
  const imgLabel = config ? (IMAGE_MODEL_LABELS[config.imageModel] ?? config.imageModel) : '';
  const vidLabel = config ? (VIDEO_MODEL_LABELS[config.videoModel] ?? config.videoModel) : '';

  return (
    <div className="fixed bottom-0 left-56 right-0 z-30 bg-gray-900/95 backdrop-blur border-t border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* 진행률 바 */}
        {isExporting && exportProgress && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-400">
                {PHASE_LABELS[exportProgress.phase]} — {exportProgress.message}
              </span>
              <div className="flex items-center gap-3">
                {exportProgress.elapsedSec != null && exportProgress.elapsedSec > 0 && (
                  <span className="text-xs text-gray-500 font-mono">
                    {formatTime(exportProgress.elapsedSec)}
                    {exportProgress.etaSec != null && exportProgress.etaSec > 0 && (
                      <> / ~{formatTime(exportProgress.elapsedSec + exportProgress.etaSec)}</>
                    )}
                  </span>
                )}
                <span className="text-sm text-amber-400 font-mono">{Math.min(100, Math.max(0, exportProgress.percent))}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, exportProgress.percent))}%` }}
              />
            </div>
          </div>
        )}

        {/* 버튼 행 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">내보내기:</span>

            <button
              type="button"
              onClick={onExportSrt}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              📝 SRT 자막
            </button>

            <button
              type="button"
              onClick={onExportZip}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              📦 SRT + 에셋 ZIP
            </button>

            {isExporting ? (
              <button
                type="button"
                onClick={onCancelExport}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-700/80 hover:bg-red-600 border border-red-500/50 text-white rounded-lg text-sm font-bold transition-colors"
              >
                취소
              </button>
            ) : (
              <button
                type="button"
                onClick={onExportMp4}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold border border-blue-400/50 shadow-md transition-colors"
              >
                🎬 MP4 영상
                <span className="text-xs text-amber-200/70 bg-amber-800/30 px-1 py-0.5 rounded">FFmpeg</span>
              </button>
            )}
          </div>

          <div className="text-sm text-gray-600 text-right">
            <p className="text-gray-500">
              {hasVideos ? (
                <span className="text-amber-400/80">
                  {vidLabel} · {scenes.filter(s => !!s.videoUrl).length}개 클립
                </span>
              ) : (
                <span className="text-gray-500">이미지: {imgLabel}</span>
              )}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {scenes.length}개 장면 · 브라우저 다운로드
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditRoomExportBar;
