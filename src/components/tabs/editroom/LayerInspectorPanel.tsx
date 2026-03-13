import React, { lazy, Suspense } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';

const VideoInspector = lazy(() => import('./inspectors/VideoInspector'));
const SubtitleInspector = lazy(() => import('./inspectors/SubtitleInspector'));
const TransitionInspector = lazy(() => import('./inspectors/TransitionInspector'));
const AudioInspector = lazy(() => import('./inspectors/AudioInspector'));
const BgmInspector = lazy(() => import('./inspectors/BgmInspector'));

const LAYER_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  video: { label: '영상', icon: '🎬', color: 'amber' },
  subtitle: { label: '자막', icon: '✏️', color: 'yellow' },
  transition: { label: '전환', icon: '◆', color: 'amber' },
  narration: { label: '나레이션', icon: '🎙️', color: 'green' },
  bgm: { label: 'BGM', icon: '🎵', color: 'cyan' },
  sfx: { label: 'SFX', icon: '🔊', color: 'fuchsia' },
  origAudio: { label: '원본 오디오', icon: '📢', color: 'rose' },
};

const LayerInspectorPanel: React.FC = () => {
  const selectedLayer = useEditRoomStore((s) => s.selectedLayer);
  const clearSelection = useEditRoomStore((s) => s.clearSelection);

  if (!selectedLayer) return null;

  const { layerType, sceneId } = selectedLayer;
  const meta = LAYER_LABELS[layerType] || { label: layerType, icon: '⚙️', color: 'gray' };

  const renderInspector = () => {
    switch (layerType) {
      case 'video':
        return sceneId ? <VideoInspector sceneId={sceneId} /> : null;
      case 'subtitle':
        return sceneId ? <SubtitleInspector sceneId={sceneId} /> : null;
      case 'transition':
        return sceneId ? <TransitionInspector sceneId={sceneId} /> : null;
      case 'narration':
      case 'origAudio':
      case 'sfx':
        return sceneId ? <AudioInspector layerType={layerType} sceneId={sceneId} /> : null;
      case 'bgm':
        return <BgmInspector />;
      default:
        return <p className="text-xs text-gray-500 p-3">알 수 없는 레이어 타입</p>;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-3 py-2 bg-${meta.color}-600/10 border-b border-${meta.color}-500/20`}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{meta.icon}</span>
          <span className={`text-xs font-bold text-${meta.color}-400`}>{meta.label} 인스펙터</span>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700/60 transition-colors text-[10px]"
          title="닫기 (Esc)"
        >
          ✕
        </button>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-y-auto p-2.5">
        <Suspense fallback={
          <div className="flex items-center justify-center py-6">
            <div className={`w-4 h-4 border-2 border-${meta.color}-500/30 border-t-${meta.color}-400 rounded-full animate-spin`} />
          </div>
        }>
          {renderInspector()}
        </Suspense>
      </div>
    </div>
  );
};

export default LayerInspectorPanel;
