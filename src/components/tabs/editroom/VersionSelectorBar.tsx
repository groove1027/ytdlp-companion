import React, { useCallback } from 'react';
import { useVideoAnalysisStore } from '../../../stores/videoAnalysisStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { showToast } from '../../../stores/uiStore';
import type { VideoVersionItem } from '../../../types';
import { buildVideoAnalysisEditTableText } from '../../../utils/videoAnalysisText';

/** 버전 텍스트 생성 (VideoAnalysisRoom과 동일 포맷) */
function buildVersionText(v: VideoVersionItem, preset: ReturnType<typeof useVideoAnalysisStore.getState>['selectedPreset']): string {
  return buildVideoAnalysisEditTableText(v, preset);
}

const VersionSelectorBar: React.FC = () => {
  const versions = useVideoAnalysisStore(s => s.versions);
  const selectedIdx = useVideoAnalysisStore(s => s.editRoomSelectedVersionIdx);
  const selectedPreset = useVideoAnalysisStore(s => s.selectedPreset);
  const thumbnails = useVideoAnalysisStore(s => s.thumbnails);

  const handleSelect = useCallback(async (idx: number) => {
    if (idx === selectedIdx) return;
    const v = versions[idx];
    if (!v) return;

    const videoStore = useVideoAnalysisStore.getState();
    const versionText = buildVersionText(v, selectedPreset);

    // [FIX #296] try-catch로 감싸 실패해도 버전 전환 반영
    // [FIX #700] import가 가드에 의해 스킵되면 (isImportingFromVideoAnalysis) 전환하지 않음
    const wasImporting = useEditPointStore.getState().isImportingFromVideoAnalysis;
    if (wasImporting) {
      showToast('이전 버전을 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    try {
      await useEditPointStore.getState().importFromVideoAnalysis({
        frames: thumbnails,
        videoBlob: videoStore.videoBlob,
        videoFile: null,
        editTableText: versionText,
        narrationText: '', // [FIX #215] 편집표에 이미 내레이션 포함 — 중복 전송 시 토큰 2배 + 429 유발
      });
    } catch (e) { console.warn('[VersionSelector] 데이터 전달 실패:', e); }

    useVideoAnalysisStore.getState().setEditRoomSelectedVersionIdx(idx);
    showToast(`버전 ${idx + 1} 로딩 완료: ${v.title}`);
  }, [versions, selectedIdx, thumbnails, selectedPreset]);

  if (versions.length === 0 || selectedIdx == null) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/60 border-b border-gray-700/50 overflow-x-auto">
      <span className="text-[10px] text-gray-500 font-bold flex-shrink-0 uppercase tracking-wider">버전</span>
      {versions.map((v, i) => (
        <button
          key={v.id}
          type="button"
          onClick={() => handleSelect(i)}
          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
            i === selectedIdx
              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40 ring-1 ring-amber-500/20'
              : 'bg-gray-700/40 text-gray-400 border border-gray-600/30 hover:bg-gray-700/60 hover:text-gray-300'
          }`}
          title={v.title}
        >
          <span className="font-bold">{i + 1}</span>
          <span className="ml-1 max-w-[60px] truncate inline-block align-bottom">{v.title.slice(0, 8)}</span>
        </button>
      ))}
    </div>
  );
};

export default VersionSelectorBar;
