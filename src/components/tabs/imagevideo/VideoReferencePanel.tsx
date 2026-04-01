/**
 * 무료 영상 클립 레퍼런스 패널 v3 — 맥락 분석 + 쇼츠 모드 + 구간 조정 + 편집 가이드
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { useProjectStore } from '../../../stores/projectStore';
import {
  searchAllScenesReferenceVideos,
  cancelVideoReferenceSearch,
  generateEditGuideSheet,
  SHORTS_CUT_RULES,
} from '../../../services/youtubeReferenceService';
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

const VideoReferencePanel: React.FC = () => {
  const { enableVideoReference, setEnableVideoReference, videoRefShortsMode, setVideoRefShortsMode } = useImageVideoStore();
  const scenes = useProjectStore(s => s.scenes);
  const config = useProjectStore(s => s.config);
  const updateScene = useProjectStore(s => s.updateScene);

  const [isSearching, setIsSearching] = useState(false);
  const [sceneResults, setSceneResults] = useState<Map<string, VideoReference[]>>(new Map());
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [adjustingRef, setAdjustingRef] = useState<{ sceneId: string; refIdx: number } | null>(null);
  const [adjustStart, setAdjustStart] = useState(0);
  const [adjustEnd, setAdjustEnd] = useState(30);

  const scenesWithContent = useMemo(
    () => scenes.filter(s => s.scriptText || s.visualDescriptionKO),
    [scenes],
  );

  const globalCtx = useMemo(
    () => config?.globalContext || config?.script?.slice(0, 100) || '',
    [config?.globalContext, config?.script],
  );

  const totalApplied = useMemo(() => {
    return scenes.filter(s => s.videoReferences && s.videoReferences.length > 0).length;
  }, [scenes]);

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
        },
        videoRefShortsMode,
      );
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, scenesWithContent, globalCtx, videoRefShortsMode]);

  const handleApply = useCallback((sceneId: string, ref: VideoReference) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const existing = scene.videoReferences || [];
    const filtered = existing.filter(r => r.videoId !== ref.videoId);
    updateScene(sceneId, {
      videoReferences: [ref, ...filtered].slice(0, 5),
    });
  }, [scenes, updateScene]);

  const handleRemoveRef = useCallback((sceneId: string, videoId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    updateScene(sceneId, {
      videoReferences: (scene.videoReferences || []).filter(r => r.videoId !== videoId),
    });
  }, [scenes, updateScene]);

  const handleStartAdjust = useCallback((sceneId: string, refIdx: number, ref: VideoReference) => {
    setAdjustingRef({ sceneId, refIdx });
    setAdjustStart(ref.startSec);
    setAdjustEnd(ref.endSec);
  }, []);

  const handleSaveAdjust = useCallback(() => {
    if (!adjustingRef) return;
    const scene = scenes.find(s => s.id === adjustingRef.sceneId);
    if (!scene) return;

    const appliedRefs = scene.videoReferences || [];
    const searchRefs = sceneResults.get(adjustingRef.sceneId) || [];

    // 검색 결과에서 조정 중인 ref 찾기
    const targetRef = searchRefs[adjustingRef.refIdx] || appliedRefs[adjustingRef.refIdx];
    if (!targetRef) { setAdjustingRef(null); return; }

    const adjustedRef: VideoReference = {
      ...targetRef,
      startSec: adjustStart,
      endSec: Math.max(adjustStart + 1, adjustEnd),
    };

    // 이미 적용된 항목이면 업데이트, 아니면 새로 적용
    const existingIdx = appliedRefs.findIndex(r => r.videoId === adjustedRef.videoId);
    let updatedRefs: VideoReference[];
    if (existingIdx >= 0) {
      updatedRefs = [...appliedRefs];
      updatedRefs[existingIdx] = adjustedRef;
    } else {
      updatedRefs = [adjustedRef, ...appliedRefs].slice(0, 5);
    }

    // 검색 결과도 업데이트
    setSceneResults(prev => {
      const next = new Map(prev);
      const currentRefs = next.get(adjustingRef.sceneId);
      if (currentRefs && currentRefs[adjustingRef.refIdx]) {
        const updated = [...currentRefs];
        updated[adjustingRef.refIdx] = adjustedRef;
        next.set(adjustingRef.sceneId, updated);
      }
      return next;
    });

    updateScene(adjustingRef.sceneId, { videoReferences: updatedRefs });
    setAdjustingRef(null);
  }, [adjustingRef, adjustStart, adjustEnd, scenes, sceneResults, updateScene]);

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
    navigator.clipboard.writeText(text).catch(() => {});
  }, [scenes]);

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
                      {scene.scriptText?.slice(0, 50) || '(내용 없음)'}
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
