/**
 * 무료 영상 클립 레퍼런스 패널 v3 — 맥락 분석 + 쇼츠 모드 + 구간 조정 + 편집 가이드
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { useProjectStore } from '../../../stores/projectStore';
import { getCompanionDownloadUrl } from '../../../constants';
import {
  searchAllScenesReferenceVideos,
  cancelVideoReferenceSearch,
  generateEditGuideSheet,
  SHORTS_CUT_RULES,
  downloadAndTrimReferenceClip,
  downloadAllReferenceClips,
  getVideoReferenceScenePrimaryText,
  getVideoReferenceCompanionStatus,
  hasVideoReferenceSceneContent,
  isReferenceClipCompatibilityErrorMessage,
  type VideoReferenceCompanionStatus,
} from '../../../services/youtubeReferenceService';
import { logger } from '../../../services/LoggerService';
import { showToast } from '../../../stores/uiStore';
import type { VideoReference, Scene } from '../../../types';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${checked ? 'bg-red-500' : 'bg-gray-600'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function triggerVideoBlobDownload(
  blob: Blob,
  fileName: string,
  owner: string,
  type: 'video' | 'other' = 'video',
) {
  const url = URL.createObjectURL(blob);
  logger.registerBlobUrl(url, type, owner, blob.size / (1024 * 1024));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => {
    logger.unregisterBlobUrl(url);
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** 쇼츠 모드 추천 클립 길이 계산 */
function getShortsClipDuration(sceneIndex: number, totalScenes: number, audioDuration?: number): number {
  // TTS 길이가 있으면 그것에 맞춤
  if (audioDuration && audioDuration > 0) {
    return Math.max(SHORTS_CUT_RULES.minClipSec, Math.min(audioDuration, SHORTS_CUT_RULES.maxClipSec));
  }
  // 첫 장면은 훅 (짧게)
  if (sceneIndex === 0) return SHORTS_CUT_RULES.hookClipSec;
  // 마지막 장면은 약간 길게
  if (sceneIndex === totalScenes - 1) return SHORTS_CUT_RULES.factClipSec;
  // 기본
  return SHORTS_CUT_RULES.defaultClipSec;
}

function upsertSceneVideoReferences(existing: VideoReference[] | undefined, ref: VideoReference): VideoReference[] {
  return [ref, ...(existing || []).filter((item) => item.videoId !== ref.videoId)].slice(0, 5);
}

const VideoReferencePanel: React.FC = () => {
  const { enableVideoReference, setEnableVideoReference, videoRefShortsMode, setVideoRefShortsMode } = useImageVideoStore();
  const scenes = useProjectStore(s => s.scenes);
  const config = useProjectStore(s => s.config);
  const updateScene = useProjectStore(s => s.updateScene);

  const [isSearching, setIsSearching] = useState(false);
  const [sceneResults, setSceneResults] = useState<Map<string, VideoReference[]>>(new Map());
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [adjustingRef, setAdjustingRef] = useState<{ sceneId: string; refIdx: number; videoId: string } | null>(null);
  const [adjustStart, setAdjustStart] = useState(0);
  const [adjustEnd, setAdjustEnd] = useState(30);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [companionStatus, setCompanionStatus] = useState<VideoReferenceCompanionStatus | null>(null);

  const scenesWithContent = useMemo(
    () => scenes.filter(hasVideoReferenceSceneContent),
    [scenes],
  );

  const globalCtx = useMemo(
    () => config?.globalContext || config?.script?.slice(0, 600) || '',
    [config?.globalContext, config?.script],
  );

  const totalApplied = useMemo(() => {
    return scenes.filter(s => s.videoReferences && s.videoReferences.length > 0).length;
  }, [scenes]);

  const sceneNumberById = useMemo(
    () => new Map(scenes.map((scene, index) => [scene.id, index + 1])),
    [scenes],
  );

  useEffect(() => {
    let alive = true;
    if (!enableVideoReference) return () => { alive = false; };

    void getVideoReferenceCompanionStatus()
      .then((status) => {
        if (alive) setCompanionStatus(status);
      })
      .catch(() => {
        if (alive) setCompanionStatus(null);
      });

    return () => {
      alive = false;
    };
  }, [enableVideoReference]);

  const handleSearchAll = useCallback(async () => {
    if (isSearching || scenesWithContent.length === 0) return;
    setIsSearching(true);
    setSceneResults(new Map());

    try {
      await searchAllScenesReferenceVideos(
        scenesWithContent,
        globalCtx,
        (sceneId, refs) => {
          setSceneResults(prev => {
            const next = new Map(prev);
            next.set(sceneId, refs);
            return next;
          });

          const freshScene = useProjectStore.getState().scenes.find((scene) => scene.id === sceneId);
          if (!freshScene) return;
          updateScene(sceneId, {
            videoReferences: refs.length > 0 ? refs : undefined,
          });
        },
        videoRefShortsMode,
      );
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, scenesWithContent, globalCtx, updateScene, videoRefShortsMode]);

  const handleApply = useCallback((sceneId: string, ref: VideoReference) => {
    const freshScene = useProjectStore.getState().scenes.find((scene) => scene.id === sceneId);
    if (!freshScene) return;
    updateScene(sceneId, {
      videoReferences: upsertSceneVideoReferences(freshScene.videoReferences, ref),
    });
  }, [updateScene]);

  const handleRemoveRef = useCallback((sceneId: string, videoId: string) => {
    const freshScene = useProjectStore.getState().scenes.find((scene) => scene.id === sceneId);
    if (!freshScene) return;
    updateScene(sceneId, {
      videoReferences: (freshScene.videoReferences || []).filter(r => r.videoId !== videoId),
    });
  }, [updateScene]);

  const handleStartAdjust = useCallback((sceneId: string, refIdx: number, ref: VideoReference) => {
    setAdjustingRef({ sceneId, refIdx, videoId: ref.videoId });
    setAdjustStart(ref.startSec);
    setAdjustEnd(ref.endSec);
  }, []);

  const handleSaveAdjust = useCallback(() => {
    if (!adjustingRef) return;
    const freshScene = useProjectStore.getState().scenes.find((scene) => scene.id === adjustingRef.sceneId);
    if (!freshScene) return;

    const appliedRefs = freshScene.videoReferences || [];
    const searchRefs = sceneResults.get(adjustingRef.sceneId) || [];

    const targetRef = searchRefs.find((ref) => ref.videoId === adjustingRef.videoId)
      || appliedRefs.find((ref) => ref.videoId === adjustingRef.videoId)
      || searchRefs[adjustingRef.refIdx]
      || appliedRefs[adjustingRef.refIdx];
    if (!targetRef) { setAdjustingRef(null); return; }

    const adjustedRef: VideoReference = {
      ...targetRef,
      startSec: adjustStart,
      endSec: Math.max(adjustStart + 1, adjustEnd),
    };

    const updatedRefs = upsertSceneVideoReferences(appliedRefs, adjustedRef);

    // 검색 결과도 업데이트
    setSceneResults(prev => {
      const next = new Map(prev);
      const currentRefs = next.get(adjustingRef.sceneId);
      const currentIdx = currentRefs?.findIndex((ref) => ref.videoId === adjustedRef.videoId) ?? -1;
      if (currentRefs && (currentRefs[adjustingRef.refIdx] || currentIdx >= 0)) {
        const updated = [...currentRefs];
        updated[currentIdx >= 0 ? currentIdx : adjustingRef.refIdx] = adjustedRef;
        next.set(adjustingRef.sceneId, updated);
      }
      return next;
    });

    updateScene(adjustingRef.sceneId, { videoReferences: updatedRefs });
    setAdjustingRef(null);
  }, [adjustingRef, adjustStart, adjustEnd, sceneResults, updateScene]);

  const handleExportGuide = useCallback(() => {
    const text = generateEditGuideSheet(scenes);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edit-guide-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scenes]);

  const handleCopyGuide = useCallback(() => {
    const text = generateEditGuideSheet(scenes);
    navigator.clipboard.writeText(text)
      .then(() => showToast('편집 가이드가 클립보드에 복사되었습니다.'))
      .catch(() => showToast('편집 가이드 복사 실패'));
  }, [scenes]);

  const handleReferenceClipAction = useCallback(async (
    scene: Scene,
    ref: VideoReference,
    mode: 'download' | 'apply',
  ) => {
    const actionKey = `${scene.id}:${ref.videoId}:${mode}`;
    setBusyActionKey(actionKey);
    try {
      const clip = await downloadAndTrimReferenceClip(ref.videoId, ref.startSec, ref.endSec, {
        videoTitle: ref.videoTitle,
      });

      if (mode === 'download') {
        triggerVideoBlobDownload(clip.blob, clip.fileName, 'VideoReferencePanel:download');
        showToast('레퍼런스 MP4 다운로드를 시작했습니다.');
        return;
      }

      // 다운로드 중 장면 상태가 변경되었을 수 있으므로 최신 상태 확인
      const freshScene = useProjectStore.getState().scenes.find(s => s.id === scene.id);
      if (!freshScene) {
        showToast('장면이 삭제되어 적용할 수 없습니다.');
        return;
      }

      const objectUrl = URL.createObjectURL(clip.blob);
      logger.registerBlobUrl(objectUrl, 'video', 'VideoReferencePanel:apply', clip.blob.size / (1024 * 1024));
      if (freshScene.videoUrl?.startsWith('blob:') && freshScene.videoUrl !== objectUrl) {
        logger.unregisterBlobUrl(freshScene.videoUrl);
        URL.revokeObjectURL(freshScene.videoUrl);
      }
      updateScene(scene.id, {
        videoUrl: objectUrl,
        imageUpdatedAfterVideo: false,
        videoReferences: upsertSceneVideoReferences(freshScene.videoReferences, ref),
      });
      showToast(`장면 ${sceneNumberById.get(scene.id) || ''}에 레퍼런스 클립을 적용했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      showToast(
        `레퍼런스 클립 ${mode === 'download' ? '다운로드' : '적용'} 실패: ${message}`,
        isReferenceClipCompatibilityErrorMessage(message) ? 8000 : 3000,
      );
    } finally {
      setBusyActionKey(null);
    }
  }, [sceneNumberById, updateScene]);

  const handleDownloadAllApplied = useCallback(async () => {
    const targetScenes = scenes.filter((scene) => (scene.videoReferences || []).length > 0);
    if (targetScenes.length === 0) {
      showToast('다운로드할 레퍼런스 클립이 없습니다.');
      return;
    }

    setIsDownloadingAll(true);
    try {
      const downloaded = await downloadAllReferenceClips(targetScenes);
      if (downloaded.length === 0) {
        showToast('다운로드할 레퍼런스 클립이 없습니다.');
        return;
      }

      // [v2.5] 컴패니언 ZIP 생성
      const { createZipViaCompanion } = await import('../../../services/companion/zipService');
      const { uploadBlobToCompanion } = await import('../../../services/companion/tunnelClient');
      const files = await Promise.all(downloaded.map(async (item) => {
        const sceneNumber = sceneNumberById.get(item.sceneId) || 0;
        const prefix = `scene_${String(sceneNumber).padStart(3, '0')}`;
        const filename = `${prefix}_${item.fileName}`;
        const tempPath = await uploadBlobToCompanion(item.blob, filename);
        return { path: tempPath, filename };
      }));
      const zipBlob = await createZipViaCompanion(files);
      triggerVideoBlobDownload(
        zipBlob,
        `reference-clips-${new Date().toISOString().slice(0, 10)}.zip`,
        'VideoReferencePanel:downloadAll',
        'other',
      );
      showToast(`레퍼런스 클립 ${downloaded.length}개 ZIP 다운로드를 시작했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      showToast(
        `전체 레퍼런스 다운로드 실패: ${message}`,
        isReferenceClipCompatibilityErrorMessage(message) ? 8000 : 3000,
      );
    } finally {
      setIsDownloadingAll(false);
    }
  }, [sceneNumberById, scenes]);

  // ─── 비활성 상태 ───
  if (!enableVideoReference) {
    return (
      <div className="bg-gray-800/40 border border-red-500/30 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📺</span>
            <div>
              <span className="font-bold text-white text-sm">무료 영상 클립 레퍼런스</span>
              <span className="ml-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
            </div>
          </div>
          <Toggle checked={enableVideoReference} onChange={setEnableVideoReference} label="무료 영상 클립 레퍼런스 활성화" />
        </div>
        <p className="text-[11px] text-gray-500 mt-2 ml-10">
          대본 맥락을 분석하여 YouTube에서 관련 영상 클립을 자동 검색하고 타임코드까지 매칭합니다
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/40 border border-red-500/30 rounded-2xl p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📺</span>
          <div>
            <span className="font-bold text-white text-sm">무료 영상 클립 레퍼런스</span>
            <span className="ml-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">v3</span>
          </div>
        </div>
        <Toggle checked={enableVideoReference} onChange={(v) => {
          if (!v) cancelVideoReferenceSearch();
          setEnableVideoReference(v);
        }} label="무료 영상 클립 레퍼런스 활성화" />
      </div>

      {/* 안내 + 쇼츠 모드 */}
      <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-red-300 font-bold">YouTube 자료영상 자동 검색 + AI 맥락 분석</p>
          <p className="text-[11px] text-gray-400 mt-1">
            대본의 <strong className="text-red-300">인물·시기·장소·감정</strong>을 분석하여 관련 YouTube 영상을 검색하고, <strong className="text-red-300">정확한 타임코드</strong>까지 자동 매칭합니다.
          </p>
        </div>

        {companionStatus?.available && companionStatus.needsFfmpegCutUpdate && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 space-y-2">
            <p className="text-xs font-bold text-amber-300">
              컴패니언 v{companionStatus.version || '?'}에서는 MP4 클립 잘라내기를 지원하지 않습니다.
            </p>
            <p className="text-[11px] leading-relaxed text-amber-100/80">
              검색과 후보 확인은 계속 되지만, <strong className="text-amber-200">MP4 다운로드</strong>, <strong className="text-amber-200">장면 영상으로 적용</strong>, <strong className="text-amber-200">영상 없는 장면의 NLE 레퍼런스 폴백</strong>은 작동하지 않습니다. 컴패니언을 v1.3.0 이상으로 업데이트하세요.
            </p>
            <a
              href={getCompanionDownloadUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[11px] font-bold text-amber-200 hover:text-amber-100 underline"
            >
              컴패니언 업데이트 받기
            </a>
          </div>
        )}

        {/* 쇼츠 모드 토글 */}
        <div className="flex items-center justify-between bg-gray-900/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <div>
              <span className="text-xs font-bold text-white">쇼츠 모드</span>
              <span className="text-[10px] text-gray-500 ml-1.5">
                {videoRefShortsMode
                  ? `빠른 컷 ${SHORTS_CUT_RULES.minClipSec}~${SHORTS_CUT_RULES.maxClipSec}초`
                  : '짧은 클립 우선 검색'}
              </span>
            </div>
          </div>
          <Toggle checked={videoRefShortsMode} onChange={setVideoRefShortsMode} label="쇼츠 모드" />
        </div>
      </div>

      {/* 일괄 검색 버튼 */}
      {scenesWithContent.length > 0 && (
        <button
          type="button"
          onClick={handleSearchAll}
          disabled={isSearching}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
            isSearching
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg'
          }`}
        >
          {isSearching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-gray-500 border-t-red-400 rounded-full animate-spin" />
              AI 맥락 분석 + 검색 중... ({sceneResults.size}/{scenesWithContent.length})
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              📺 전체 {scenesWithContent.length}개 장면 영상 클립 검색
              {videoRefShortsMode && <span className="text-[10px] bg-yellow-500/30 text-yellow-300 px-1.5 py-0.5 rounded-full">⚡ 쇼츠</span>}
            </span>
          )}
        </button>
      )}

      {/* 편집 가이드 내보내기 (적용된 클립이 있을 때) */}
      {totalApplied > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportGuide}
            className="flex-1 py-2 rounded-lg text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 transition-colors"
          >
            📋 편집 가이드 시트 다운로드
          </button>
          <button
            type="button"
            onClick={handleCopyGuide}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 transition-colors"
          >
            📎 복사
          </button>
          <button
            type="button"
            onClick={() => { void handleDownloadAllApplied(); }}
            disabled={isDownloadingAll}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-600 text-white border border-red-500/40 transition-colors disabled:opacity-50"
          >
            {isDownloadingAll ? '다운로드 중...' : '📥 전체 클립 다운로드'}
          </button>
        </div>
      )}

      {/* 장면별 결과 */}
      {scenesWithContent.length > 0 && (
        <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
          {scenesWithContent.map((scene, i) => {
            const refs = sceneResults.get(scene.id) || scene.videoReferences || [];
            const appliedRefs = scene.videoReferences || [];
            const isExpanded = expandedScene === scene.id;
            const recommendedClipSec = videoRefShortsMode
              ? getShortsClipDuration(i, scenesWithContent.length, scene.audioDuration)
              : undefined;

            return (
              <div key={scene.id} className="bg-gray-900/60 border border-gray-700/50 rounded-xl overflow-hidden">
                {/* 장면 헤더 */}
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/50 transition-colors text-left"
                  onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-bold text-red-400 bg-red-900/30 border border-red-500/30 rounded px-1.5 py-0.5 flex-shrink-0">
                      #{i + 1}
                    </span>
                    <span className="text-xs text-gray-400 truncate">
                      {getVideoReferenceScenePrimaryText(scene).slice(0, 50) || '(내용 없음)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {recommendedClipSec && (
                      <span className="text-[10px] text-yellow-400 bg-yellow-900/30 border border-yellow-500/30 px-1.5 py-0.5 rounded">
                        ⚡ {recommendedClipSec.toFixed(1)}초
                      </span>
                    )}
                    {scene.audioDuration && (
                      <span className="text-[10px] text-blue-400">🔊 {scene.audioDuration.toFixed(1)}초</span>
                    )}
                    {appliedRefs.length > 0 && (
                      <span className="text-[10px] text-green-400">✅ {appliedRefs.length}개</span>
                    )}
                    {refs.length > 0 && appliedRefs.length === 0 && (
                      <span className="text-[10px] text-orange-400">{refs.length}개 후보</span>
                    )}
                    <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                </button>

                {/* 확장: 영상 결과 목록 */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* 검색어 표시 */}
                    {refs.length > 0 && refs[0].searchQuery && (
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span>🔍</span>
                        <span className="bg-gray-800 px-2 py-0.5 rounded border border-gray-700">{refs[0].searchQuery}</span>
                        {refs[0].publishedAt && (
                          <span className="text-gray-600">| 📅 {formatDate(refs[0].publishedAt)}</span>
                        )}
                      </div>
                    )}

                    {refs.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">
                        {isSearching ? '맥락 분석 + 검색 중...' : '검색 결과 없음 — 위 버튼을 눌러 검색하세요'}
                      </p>
                    ) : (
                      refs.map((ref, j) => {
                        const isAdjusting = adjustingRef?.sceneId === scene.id && adjustingRef?.refIdx === j;
                        const isApplied = appliedRefs.some(r => r.videoId === ref.videoId);
                        const clipDuration = ref.endSec - ref.startSec;
                        const downloadKey = `${scene.id}:${ref.videoId}:download`;
                        const applyKey = `${scene.id}:${ref.videoId}:apply`;

                        return (
                          <div
                            key={`${ref.videoId}-${j}`}
                            className={`bg-gray-800/50 rounded-lg p-3 border transition-colors ${
                              isApplied
                                ? 'border-green-500/40 bg-green-900/10'
                                : 'border-gray-700/30'
                            }`}
                          >
                            <div className="flex gap-3">
                              {/* 썸네일 */}
                              <a
                                href={`https://www.youtube.com/watch?v=${ref.videoId}&t=${ref.startSec}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-gray-950 relative group"
                              >
                                <img
                                  src={ref.thumbnailUrl}
                                  alt={ref.videoTitle}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                  <span className="text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                                </div>
                                {/* 타임코드 배지 */}
                                <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 text-white px-1.5 py-0.5 rounded">
                                  {formatTime(ref.startSec)}~{formatTime(ref.endSec)}
                                </span>
                              </a>

                              {/* 정보 */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <p className="text-xs font-semibold text-white truncate">{ref.videoTitle}</p>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                  <span>{ref.channelTitle}</span>
                                  {ref.publishedAt && <span>• {formatDate(ref.publishedAt)}</span>}
                                </div>
                                <p className="text-[10px] text-gray-400 line-clamp-2">{ref.segmentText}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {/* 관련도 */}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    ref.matchScore >= 0.8
                                      ? 'text-green-300 border-green-500/30 bg-green-500/10'
                                      : ref.matchScore >= 0.5
                                      ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                                      : 'text-gray-400 border-gray-600/30 bg-gray-600/10'
                                  }`}>
                                    {Math.round(ref.matchScore * 100)}%
                                  </span>
                                  {/* 클립 길이 */}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    videoRefShortsMode && clipDuration <= SHORTS_CUT_RULES.maxClipSec
                                      ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                                      : 'text-gray-400 border-gray-600/30 bg-gray-600/10'
                                  }`}>
                                    {clipDuration}초
                                  </span>
                                  {/* 재생 링크 */}
                                  <a
                                    href={`https://www.youtube.com/watch?v=${ref.videoId}&t=${ref.startSec}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-red-400 hover:text-red-300 underline"
                                  >
                                    ▶ 재생
                                  </a>
                                  {/* 구간 조정 */}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleStartAdjust(scene.id, j, ref); }}
                                    className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                  >
                                    ✂️ 구간 조정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); void handleReferenceClipAction(scene, ref, 'download'); }}
                                    disabled={busyActionKey !== null}
                                    className="text-[10px] text-cyan-300 hover:text-cyan-200 underline disabled:opacity-50"
                                  >
                                    {busyActionKey === downloadKey ? '📥 다운로드 중...' : '📥 MP4 다운로드'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); void handleReferenceClipAction(scene, ref, 'apply'); }}
                                    disabled={busyActionKey !== null}
                                    className="text-[10px] text-orange-300 hover:text-orange-200 underline disabled:opacity-50"
                                  >
                                    {busyActionKey === applyKey ? '🎬 적용 중...' : '🎬 장면 영상으로 적용'}
                                  </button>
                                  {/* 적용/해제 */}
                                  {isApplied ? (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveRef(scene.id, ref.videoId); }}
                                      className="text-[10px] text-red-400 hover:text-red-300 underline"
                                    >
                                      ✕ 해제
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleApply(scene.id, ref); }}
                                      className="text-[10px] text-orange-400 hover:text-orange-300 underline"
                                    >
                                      ✅ 적용
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 구간 미세 조정 UI */}
                            {isAdjusting && (
                              <div className="mt-3 bg-gray-900/60 rounded-lg p-3 border border-blue-500/30 space-y-2">
                                <p className="text-[10px] font-bold text-blue-300">✂️ 구간 미세 조정</p>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                                      <span>시작: {formatTime(adjustStart)}</span>
                                      <span>끝: {formatTime(adjustEnd)}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={ref.duration || 300}
                                      value={adjustStart}
                                      onChange={(e) => setAdjustStart(Number(e.target.value))}
                                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <input
                                      type="range"
                                      min={adjustStart + 1}
                                      max={ref.duration || 300}
                                      value={adjustEnd}
                                      onChange={(e) => setAdjustEnd(Number(e.target.value))}
                                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                    />
                                    <p className="text-[10px] text-center text-gray-500">
                                      클립 길이: {adjustEnd - adjustStart}초
                                      {videoRefShortsMode && recommendedClipSec && (
                                        <span className="ml-1 text-yellow-400">(추천: {recommendedClipSec.toFixed(1)}초)</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setAdjustingRef(null)}
                                    className="text-[10px] px-3 py-1 rounded bg-gray-700 text-gray-400 hover:bg-gray-600"
                                  >
                                    취소
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveAdjust}
                                    className="text-[10px] px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 font-bold"
                                  >
                                    저장
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 적용 현황 요약 */}
      {totalApplied > 0 && (
        <div className="bg-green-900/20 border border-green-500/20 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-green-300 font-bold">
              ✅ {totalApplied}/{scenesWithContent.length}개 장면에 영상 클립 적용됨
            </p>
            {videoRefShortsMode && (
              <span className="text-[10px] text-yellow-300 bg-yellow-900/30 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                ⚡ 쇼츠 모드
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoReferencePanel;
