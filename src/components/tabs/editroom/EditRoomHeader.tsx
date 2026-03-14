import React from 'react';
import { useProjectStore } from '../../../stores/projectStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';

interface EditRoomHeaderProps {
  sceneCount: number;
  onExportSrt: () => void;
  onExportZip: () => void;
  onExportMp4: () => void;
}

const EditRoomHeader: React.FC<EditRoomHeaderProps> = ({
  sceneCount,
  onExportSrt,
  onExportZip,
  onExportMp4,
}) => {
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const isExporting = useEditRoomStore((s) => s.isExporting);
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center text-xl shadow-lg">
          🎞
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">편집실</h1>
            <span className="text-sm font-bold text-amber-400 bg-amber-900/30 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {sceneCount}개 장면
            </span>
          </div>
          <p className="text-gray-400 text-base">
            {projectTitle || '프로젝트'} — 장면별 자막, 효과, 오디오를 편집하세요
          </p>
        </div>
      </div>

      {/* 내보내기 드롭다운 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={isExporting}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-base font-bold border border-blue-400/50 shadow-md transition-colors disabled:opacity-50"
        >
          {isExporting ? '내보내는 중...' : '내보내기 ▾'}
        </button>
        {showExportMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[200px]">
              <button
                type="button"
                onClick={() => { onExportSrt(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-base text-gray-200 flex items-center gap-2 rounded-t-lg"
              >
                <span className="text-base">📝</span> SRT 자막 파일
              </button>
              <button
                type="button"
                onClick={() => { onExportZip(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-base text-gray-200 flex items-center gap-2"
              >
                <span className="text-base">📦</span> SRT + 에셋 ZIP
              </button>
              <div className="border-t border-gray-700" />
              <button
                type="button"
                onClick={() => { onExportMp4(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-base text-gray-200 flex items-center gap-2 rounded-b-lg"
              >
                <span className="text-base">🎬</span> MP4 영상
                <span className="text-sm text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded ml-auto">WebCodecs</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditRoomHeader;
