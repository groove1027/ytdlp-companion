import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore } from '../../../stores/projectStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useUnifiedTimeline } from '../../../hooks/useUnifiedTimeline';
import EditRoomSceneCard from './EditRoomSceneCard';
import type { Scene, ScriptLine, UnifiedSceneTiming } from '../../../types';

// --- Sortable 래퍼 ---
interface SortableSceneProps {
  id: string;
  scene: Scene;
  sceneIndex: number;
  timing: UnifiedSceneTiming;
  line: ScriptLine | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSplit: () => void;
  onMergeNext: () => void;
  isLast: boolean;
}

const SortableScene: React.FC<SortableSceneProps> = ({
  id,
  scene,
  sceneIndex,
  timing,
  line,
  isExpanded,
  onToggleExpand,
  onSplit,
  onMergeNext,
  isLast,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <EditRoomSceneCard
        scene={scene}
        sceneIndex={sceneIndex}
        timing={timing}
        line={line}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onSplit={onSplit}
        onMergeNext={onMergeNext}
        isLast={isLast}
        dragListeners={listeners}
      />
    </div>
  );
};

// --- 메인 리스트 ---
const EditRoomSceneList: React.FC = () => {
  const scenes = useProjectStore((s) => s.scenes);
  const lines = useSoundStudioStore((s) => s.lines);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const setExpandedSceneId = useEditRoomStore((s) => s.setExpandedSceneId);
  const splitScene = useEditRoomStore((s) => s.splitScene);
  const mergeScenes = useEditRoomStore((s) => s.mergeScenes);
  const reorderScenes = useEditRoomStore((s) => s.reorderScenes);
  const timeline = useUnifiedTimeline();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sceneMap = React.useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const lineByScene = React.useMemo(() => {
    const m = new Map<string, ScriptLine>();
    lines.forEach((l) => { if (l.sceneId) m.set(l.sceneId, l); });
    return m;
  }, [lines]);
  const lineByIndex = React.useMemo(() => new Map(lines.map((l) => [l.index, l])), [lines]);
  const timingMap = React.useMemo(() => new Map(timeline.map((t) => [t.sceneId, t])), [timeline]);

  const orderedIds = sceneOrder.length > 0 ? sceneOrder : scenes.map((s) => s.id);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = useEditRoomStore.getState().sceneOrder;
    const oldIdx = currentOrder.indexOf(active.id as string);
    const newIdx = currentOrder.indexOf(over.id as string);
    if (oldIdx >= 0 && newIdx >= 0) {
      reorderScenes(oldIdx, newIdx);
    }
  }, [reorderScenes]);

  const handleToggleExpand = useCallback((sceneId: string) => {
    setExpandedSceneId(expandedSceneId === sceneId ? null : sceneId);
  }, [expandedSceneId, setExpandedSceneId]);

  const handleSplit = useCallback((sceneId: string) => {
    const sub = useEditRoomStore.getState().sceneSubtitles[sceneId];
    if (!sub || !sub.text) return;
    const mid = Math.floor(sub.text.length / 2);
    let splitPoint = mid;
    let bestForward = -1;
    let bestBackward = -1;
    const isDelimiter = (ch: string) =>
      ch === ' ' || ch === '.' || ch === ',' || ch === '!' || ch === '?';

    // 앞쪽 검색
    for (let i = mid; i < sub.text.length; i++) {
      if (isDelimiter(sub.text[i])) {
        bestForward = i + 1;
        break;
      }
    }

    // 뒤쪽 검색 (한국어 문장 끝: 다. 요. 니다. 등 대응)
    for (let i = mid - 1; i >= 0; i--) {
      if (isDelimiter(sub.text[i])) {
        bestBackward = i + 1;
        break;
      }
    }

    // mid에서 가장 가까운 구분점 선택
    if (bestForward >= 0 && bestBackward >= 0) {
      splitPoint = (bestForward - mid) <= (mid - bestBackward) ? bestForward : bestBackward;
    } else if (bestForward >= 0) {
      splitPoint = bestForward;
    } else if (bestBackward >= 0) {
      splitPoint = bestBackward;
    }
    splitScene(sceneId, splitPoint);
  }, [splitScene]);

  const handleMergeNext = useCallback((sceneId: string, idx: number) => {
    if (idx >= orderedIds.length - 1) return;
    const nextId = orderedIds[idx + 1];
    mergeScenes(sceneId, nextId);
  }, [orderedIds, mergeScenes]);

  if (orderedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <span className="text-4xl mb-3">🎬</span>
        <p className="text-base">장면이 없습니다</p>
        <p className="text-sm text-gray-600 mt-1">이미지/영상 탭에서 장면을 먼저 생성하세요</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {orderedIds.map((sceneId, idx) => {
            const scene = sceneMap.get(sceneId);
            if (!scene) return null;

            const line = lineByScene.get(sceneId) || lineByIndex.get(idx) || null;
            const timing = timingMap.get(sceneId) || {
              sceneId, sceneIndex: idx,
              imageStartTime: 0, imageEndTime: 0, imageDuration: 0,
              subtitleSegments: [], effectPreset: 'smooth', volume: 100, speed: 1.0,
            };

            return (
              <SortableScene
                key={sceneId}
                id={sceneId}
                scene={scene}
                sceneIndex={idx}
                timing={timing}
                line={line}
                isExpanded={expandedSceneId === sceneId}
                onToggleExpand={() => handleToggleExpand(sceneId)}
                onSplit={() => handleSplit(sceneId)}
                onMergeNext={() => handleMergeNext(sceneId, idx)}
                isLast={idx === orderedIds.length - 1}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default EditRoomSceneList;
