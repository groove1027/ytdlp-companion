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

/** 내보내기 진행 표시용 페이즈 순서 */
const EXPORT_PHASE_ORDER: { phase: ExportProgress['phase']; label: string; icon: string }[] = [
  { phase: 'initializing', label: '준비', icon: '📦' },
  { phase: 'composing', label: '합성', icon: '🎬' },
  { phase: 'encoding', label: '인코딩', icon: '⚙️' },
  { phase: 'done', label: '완료', icon: '✅' },
];

/** loading-ffmpeg, writing-assets → initializing 그룹에 매핑 */
function mapPhaseToIndex(phase: ExportProgress['phase']): number {
  if (phase === 'loading-ffmpeg' || phase === 'writing-assets' || phase === 'initializing') return 0;
  if (phase === 'composing') return 1;
  if (phase === 'encoding') return 2;
  if (phase === 'done') return 3;
  return 0;
}

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
        {/* 진행률 바 + 페이즈 커넥터 */}
        {isExporting && exportProgress && (
          <div className="mb-2">
            {/* 페이즈 커넥터 */}
            <div className="flex items-center gap-1 mb-2">
              {EXPORT_PHASE_ORDER.map((ep, i) => {
                const activeIdx = mapPhaseToIndex(exportProgress.phase);
                const isDone = i < activeIdx;
                const isCurrent = i === activeIdx;
                return (
                  <React.Fragment key={ep.phase}>
                    {i > 0 && (
                      <div className={`flex-1 h-0.5 transition-all duration-500 ${
                        isDone ? 'bg-amber-500' :
                        isCurrent ? 'bg-gradient-to-r from-amber-500 to-gray-700' :
                        'bg-gray-700'
                      }`} />
                    )}
                    <div className="flex items-center gap-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-all duration-300 ${
                        isDone ? 'bg-amber-600 text-white' :
                        isCurrent ? 'bg-amber-500 text-gray-900 animate-pulse' :
                        'bg-gray-700 text-gray-500'
                      }`}>
                        {isDone ? '\u2713' : ep.icon}
                      </div>
                      <span className={`text-[10px] font-medium hidden sm:inline ${
                        isDone ? 'text-amber-400' :
                        isCurrent ? 'text-amber-300' :
                        'text-gray-600'
                      }`}>
                        {ep.label}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* 메시지 + 시간 + 퍼센트 */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-400">
                {PHASE_LABELS[exportProgress.phase]} — {exportProgress.message}
              </span>
              <div className="flex items-center gap-3">
                {exportProgress.elapsedSec != null && exportProgress.elapsedSec > 0 && (
                  <span className="text-xs text-gray-500 font-mono tabular-nums">
                    {formatTime(exportProgress.elapsedSec)}
                    {exportProgress.etaSec != null && exportProgress.etaSec > 0 && (
                      <> / ~{formatTime(exportProgress.elapsedSec + exportProgress.etaSec)}</>
                    )}
                  </span>
                )}
                <span className="text-sm text-amber-400 font-mono tabular-nums">{Math.min(100, Math.max(0, exportProgress.percent))}%</span>
              </div>
            </div>

            {/* 프로그레스 바 */}
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700 ease-out"
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
