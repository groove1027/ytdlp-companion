import React from 'react';
import { useEditRoomStore } from '../../../../stores/editRoomStore';
import SceneSubtitleEditor from '../SceneSubtitleEditor';
import type { SceneSubtitleConfig } from '../../../../types';

interface SubtitleInspectorProps {
  sceneId: string;
}

const SubtitleInspector: React.FC<SubtitleInspectorProps> = ({ sceneId }) => {
  const subtitle = useEditRoomStore((s) => s.sceneSubtitles[sceneId]);
  const setSceneSubtitle = useEditRoomStore((s) => s.setSceneSubtitle);

  if (!subtitle) {
    return (
      <div className="p-3 text-xs text-gray-500">
        이 장면에 자막이 없습니다
      </div>
    );
  }

  const handleChange = (partial: Partial<SceneSubtitleConfig>) => {
    setSceneSubtitle(sceneId, partial);
  };

  return (
    <div className="space-y-3">
      <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700/40">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">자막 텍스트</p>
        <textarea
          value={subtitle.text}
          onChange={(e) => handleChange({ text: e.target.value })}
          rows={3}
          className="w-full bg-gray-900/60 border border-gray-700/50 rounded text-xs text-gray-200 p-2 resize-none focus:outline-none focus:border-yellow-500/50"
          placeholder="자막 내용..."
        />
      </div>

      {/* 타이밍 */}
      <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5">타이밍</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[9px] text-gray-500">시작</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={subtitle.startTime.toFixed(1)}
              onChange={(e) => handleChange({ startTime: Number(e.target.value) })}
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded text-[10px] text-gray-200 px-1.5 py-1 font-mono focus:outline-none focus:border-yellow-500/50"
            />
          </div>
          <span className="text-gray-600 text-xs mt-3">~</span>
          <div className="flex-1">
            <label className="text-[9px] text-gray-500">끝</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={subtitle.endTime.toFixed(1)}
              onChange={(e) => handleChange({ endTime: Number(e.target.value) })}
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded text-[10px] text-gray-200 px-1.5 py-1 font-mono focus:outline-none focus:border-yellow-500/50"
            />
          </div>
        </div>
      </div>

      {/* 스타일 오버라이드 */}
      {subtitle.styleOverride && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">개별 스타일 오버라이드</p>
            <button
              type="button"
              onClick={() => handleChange({ styleOverride: undefined })}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              초기화
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500 w-10">색상</span>
              <input
                type="color"
                value={subtitle.styleOverride.color || '#ffffff'}
                onChange={(e) => handleChange({ styleOverride: { ...subtitle.styleOverride, color: e.target.value } })}
                className="w-6 h-5 rounded border-0 cursor-pointer bg-transparent"
              />
              <span className="text-[9px] text-gray-500 w-10">외곽</span>
              <input
                type="color"
                value={subtitle.styleOverride.outlineColor || '#000000'}
                onChange={(e) => handleChange({ styleOverride: { ...subtitle.styleOverride, outlineColor: e.target.value } })}
                className="w-6 h-5 rounded border-0 cursor-pointer bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500 w-10">크기</span>
              <input
                type="range"
                min={20} max={120} step={2}
                value={subtitle.styleOverride.fontSize || 54}
                onChange={(e) => handleChange({ styleOverride: { ...subtitle.styleOverride, fontSize: Number(e.target.value) } })}
                className="flex-1 accent-yellow-500 h-1"
              />
              <span className="text-[9px] text-yellow-400 font-mono w-8 text-right">{subtitle.styleOverride.fontSize || 54}px</span>
            </div>
          </div>
        </div>
      )}

      {/* 스타일 오버라이드 추가 버튼 */}
      {!subtitle.styleOverride && (
        <button
          type="button"
          onClick={() => handleChange({ styleOverride: {} })}
          className="w-full text-[10px] text-yellow-400/70 hover:text-yellow-400 border border-dashed border-yellow-500/20 hover:border-yellow-500/40 rounded-lg py-2 transition-colors"
        >
          + 개별 스타일 오버라이드 추가
        </button>
      )}
    </div>
  );
};

export default SubtitleInspector;
