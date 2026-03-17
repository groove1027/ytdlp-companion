import React, { useState, useCallback, useMemo, useRef, Suspense } from 'react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Scene, ScriptLine, UnifiedSceneTiming, SceneEffectConfig, SceneSubtitleConfig, SceneAudioConfig, SceneOverlayConfig, CommunityMediaItem } from '../../../types';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { showToast } from '../../../stores/uiStore';
import SceneMediaPreview from './SceneMediaPreview';
import SceneTextInfo from './SceneTextInfo';
import SceneNarrationPlayer from './SceneNarrationPlayer';
import SceneSubtitleEditor from './SceneSubtitleEditor';
import SceneEffectPicker from './SceneEffectPicker';
import OverlayPicker, { OVERLAY_PRESETS } from './OverlayPicker';
import { lazyRetry } from '../../../utils/retryImport';

const MediaSearchModal = lazyRetry(() => import('../../MediaSearchModal'));

// 접힌 상태 배지용 한국어 레이블
const PZ_LABELS: Record<string, string> = {
  fast: '⚡빠른', smooth: '🌊부드러움', cinematic: '🎬시네마틱', dynamic: '💥역동적',
  dreamy: '✨우아한', dramatic: '🎭드라마틱', zoom: '🔍집중', reveal: '🎪공개',
  vintage: '📷빈티지', documentary: '📹다큐', timelapse: '⏳타임랩스', vlog: '📱브이로그',
};

const MO_LABELS: Record<string, string> = {
  fade: '점진', pan: '팬', micro: '마이크로', slow: '느린', shake: '흔들림',
  rotate: '회전', glitch: '글릿치', film: '필름', sepia: '세피아', crossfade: '페이드', static: '정적',
};

interface EditRoomSceneCardProps {
  scene: Scene;
  sceneIndex: number;
  timing: UnifiedSceneTiming;
  line: ScriptLine | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSplit: () => void;
  onMergeNext: () => void;
  isLast: boolean;
  dragListeners?: SyntheticListenerMap;
}

const EditRoomSceneCard: React.FC<EditRoomSceneCardProps> = ({
  scene,
  sceneIndex,
  timing,
  line,
  isExpanded,
  onToggleExpand,
  onSplit,
  onMergeNext,
  isLast,
  dragListeners,
}) => {
  const [showMediaSearch, setShowMediaSearch] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const setSceneSubtitle = useEditRoomStore((s) => s.setSceneSubtitle);
  const setSceneAudioSettings = useEditRoomStore((s) => s.setSceneAudioSettings);
  const addSceneOverlay = useEditRoomStore((s) => s.addSceneOverlay);
  const updateSceneOverlay = useEditRoomStore((s) => s.updateSceneOverlay);
  const removeSceneOverlay = useEditRoomStore((s) => s.removeSceneOverlay);
  const sceneEffects = useEditRoomStore((s) => s.sceneEffects);
  const sceneSubtitles = useEditRoomStore((s) => s.sceneSubtitles);
  const sceneAudioSettings = useEditRoomStore((s) => s.sceneAudioSettings);
  const sceneOverlays = useEditRoomStore((s) => s.sceneOverlays);

  const effect = useMemo<SceneEffectConfig>(() =>
    sceneEffects[scene.id] || { panZoomPreset: 'smooth', motionEffect: 'none' },
    [sceneEffects, scene.id]
  );

  const subtitle = useMemo<SceneSubtitleConfig>(() =>
    sceneSubtitles[scene.id] || { text: scene.scriptText || '', startTime: 0, endTime: 0 },
    [sceneSubtitles, scene.id, scene.scriptText]
  );

  const audioSettings = useMemo<SceneAudioConfig>(() =>
    sceneAudioSettings[scene.id] || { volume: 100, speed: 1.0 },
    [sceneAudioSettings, scene.id]
  );

  const handleEffectChange = useCallback((partial: Partial<SceneEffectConfig>) => {
    setSceneEffect(scene.id, partial);
  }, [scene.id, setSceneEffect]);

  const handleSubtitleChange = useCallback((partial: Partial<SceneSubtitleConfig>) => {
    setSceneSubtitle(scene.id, partial);
  }, [scene.id, setSceneSubtitle]);

  const handleAudioChange = useCallback((partial: Partial<SceneAudioConfig>) => {
    setSceneAudioSettings(scene.id, partial);
  }, [scene.id, setSceneAudioSettings]);

  const overlays = useMemo<SceneOverlayConfig[]>(() =>
    sceneOverlays[scene.id] || [],
    [sceneOverlays, scene.id]
  );

  // 나레이션 ↔ 영상 길이 불일치 감지
  const lines = useSoundStudioStore((s) => s.lines);
  const matchedLine = useMemo(() => {
    return lines.find((l) => l.sceneId === scene.id) || lines[sceneIndex] || null;
  }, [lines, scene.id, sceneIndex]);

  const narrationDuration = matchedLine?.duration ?? 0;
  const isVideo = !!scene.videoUrl;
  const durationMismatch = isVideo && narrationDuration > 0
    && Math.abs(narrationDuration - timing.imageDuration) > 1.0;

  const handleAddOverlay = useCallback((overlay: SceneOverlayConfig) => {
    addSceneOverlay(scene.id, overlay);
  }, [scene.id, addSceneOverlay]);

  const handleUpdateOverlay = useCallback((index: number, partial: Partial<SceneOverlayConfig>) => {
    updateSceneOverlay(scene.id, index, partial);
  }, [scene.id, updateSceneOverlay]);

  const handleRemoveOverlay = useCallback((index: number) => {
    removeSceneOverlay(scene.id, index);
  }, [scene.id, removeSceneOverlay]);

  // 이미지 다운로드
  const handleDownloadImage = useCallback(async () => {
    const url = scene.imageUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scene-${sceneIndex + 1}.${blob.type.includes('png') ? 'png' : 'jpg'}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }, [scene.imageUrl, sceneIndex]);

  // 이미지 교체 (로컬 파일 업로드)
  const handleReplaceImage = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const url = await uploadMediaToHosting(file);
      useProjectStore.getState().updateScene(scene.id, {
        imageUrl: url,
        imageUpdatedAfterVideo: !!scene.videoUrl,
      });
      showToast('이미지 교체 완료');
    } catch (err: unknown) {
      showToast(`이미지 교체 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setIsUploading(false);
    }
  }, [scene.id, scene.videoUrl]);

  return (
    <div className={`bg-gray-800/50 rounded-xl border transition-all ${
      isExpanded ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-gray-700 hover:border-gray-600'
    }`}>
      {/* 상단 요약 행 (항상 표시) */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* 드래그 핸들 */}
        <div
          className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-lg"
          title="드래그하여 순서 변경"
          {...dragListeners}
        >
          ⠿
        </div>

        {/* 미디어 미리보기 */}
        <SceneMediaPreview scene={scene} sceneIndex={sceneIndex} overlays={overlays} effect={effect} />

        {/* 대본 + 프롬프트 */}
        <SceneTextInfo scene={scene} />

        {/* 타이밍 + 효과 배지 */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-mono text-amber-400 bg-amber-900/20 px-2 py-0.5 rounded border border-amber-500/20">
              {timing.imageDuration.toFixed(1)}s
            </span>
            {durationMismatch && (
              <span
                className="text-xs text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-500/20 cursor-help"
                title={`나레이션 ${narrationDuration.toFixed(1)}초 vs 영상 구간 ${timing.imageDuration.toFixed(1)}초 — 차이가 1초 이상입니다. 영상이 짧으면 자동 루프됩니다.`}
              >
                ⚠ 싱크
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5 rounded border border-cyan-500/20">
              {PZ_LABELS[effect.panZoomPreset] || effect.panZoomPreset}
            </span>
            {effect.motionEffect && effect.motionEffect !== 'none' && (
              <span className="text-xs text-purple-400 bg-purple-900/20 px-1.5 py-0.5 rounded border border-purple-500/20">
                {MO_LABELS[effect.motionEffect] || effect.motionEffect}
              </span>
            )}
            {overlays.length > 0 && (
              <span className="text-xs text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-500/20"
                title={overlays.map((o) => OVERLAY_PRESETS.find((p) => p.id === o.presetId)?.label || o.presetId).join(', ')}
              >
                🎨 {overlays.length}
              </span>
            )}
          </div>
        </div>

        {/* 펼침 화살표 */}
        <span className={`text-gray-500 transition-transform ml-1 ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </div>

      {/* 하단 확장 영역 (펼침 시) */}
      {isExpanded && (
        <div className="border-t border-gray-700/50 px-4 py-3 space-y-4">
          {/* 3열 레이아웃: 자막 | 오디오 | 효과 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 자막 편집 */}
            <div>
              <h4 className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">자막</h4>
              <SceneSubtitleEditor subtitle={subtitle} onChange={handleSubtitleChange} onSplit={(pos) => {
                // 커서 위치 기반 자막 분리: editRoomStore.splitScene 호출
                useEditRoomStore.getState().splitScene(scene.id, pos);
              }} />
            </div>

            {/* 나레이션 재생 + 오디오 설정 */}
            <div>
              <h4 className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">나레이션</h4>
              <SceneNarrationPlayer
                line={line}
                audioSettings={audioSettings}
                onChangeAudio={handleAudioChange}
              />
            </div>

            {/* 이미지 효과 */}
            <div>
              <h4 className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">효과</h4>
              <SceneEffectPicker effect={effect} onChange={handleEffectChange} imageUrl={scene.imageUrl || scene.videoUrl} />
            </div>
          </div>

          {/* 오버레이 효과 */}
          <div>
            <h4 className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-2">오버레이</h4>
            <OverlayPicker
              overlays={overlays}
              onAdd={handleAddOverlay}
              onUpdate={handleUpdateOverlay}
              onRemove={handleRemoveOverlay}
            />
          </div>

          {/* 장면 조작 버튼 */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-700/30 flex-wrap">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSplit(); }}
              className="text-sm text-gray-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
            >
              ✂ 장면 분할
            </button>
            {!isLast && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMergeNext(); }}
                className="text-sm text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
              >
                🔗 다음 장면 병합
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {scene.imageUrl && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDownloadImage(); }}
                  className="text-sm text-gray-500 hover:text-green-400 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
                >
                  📥 다운로드
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); uploadInputRef.current?.click(); }}
                disabled={isUploading}
                className="text-sm text-gray-500 hover:text-orange-400 transition-colors px-2 py-1 rounded hover:bg-gray-700/50 disabled:opacity-50"
              >
                {isUploading ? '⏳ 업로드 중...' : '📤 이미지 교체'}
              </button>
              <input
                type="file"
                ref={uploadInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReplaceImage(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowMediaSearch(true); }}
                className="text-sm text-gray-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
              >
                🔍 미디어 검색
              </button>
            </div>
          </div>
        </div>
      )}
      {showMediaSearch && (
        <Suspense fallback={null}>
          <MediaSearchModal
            isOpen={showMediaSearch}
            onClose={() => setShowMediaSearch(false)}
            onSelect={(item: CommunityMediaItem) => {
              useProjectStore.getState().updateScene(scene.id, {
                imageUrl: item.type === 'image' ? item.url : scene.imageUrl,
                communityMediaItem: item,
              });
            }}
            initialQuery={scene.scriptText?.split(/[,.\s]+/).slice(0, 3).join(' ') || ''}
          />
        </Suspense>
      )}
    </div>
  );
};

export default EditRoomSceneCard;
