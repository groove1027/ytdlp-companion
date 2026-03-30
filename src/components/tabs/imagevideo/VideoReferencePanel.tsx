/**
 * 자료영상 레퍼런스 패널 — YouTube 영상 + 타임코드 매칭 결과 표시
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { useProjectStore } from '../../../stores/projectStore';
import {
  searchAllScenesReferenceVideos,
  cancelVideoReferenceSearch,
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

const VideoReferencePanel: React.FC = () => {
  const { enableVideoReference, setEnableVideoReference } = useImageVideoStore();
  const scenes = useProjectStore(s => s.scenes);
  const config = useProjectStore(s => s.config);
  const updateScene = useProjectStore(s => s.updateScene);

  const [isSearching, setIsSearching] = useState(false);
  const [sceneResults, setSceneResults] = useState<Map<string, VideoReference[]>>(new Map());
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  const scenesWithContent = useMemo(
    () => scenes.filter(s => s.scriptText || s.visualDescriptionKO),
    [scenes],
  );

  const globalCtx = useMemo(
    () => config?.globalContext || config?.script?.slice(0, 100) || '',
    [config?.globalContext, config?.script],
  );

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
      );
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, scenesWithContent, globalCtx]);

  const handleApply = useCallback((sceneId: string, ref: VideoReference) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const existing = scene.videoReferences || [];
    const filtered = existing.filter(r => r.videoId !== ref.videoId);
    // [FIX codex-review] imageUrl에 썸네일을 넣지 않음 — AI 이미지 생성 흐름 차단 방지
    // 썸네일은 ref.thumbnailUrl에 이미 있으므로 EditRoomTab 배지에서 직접 참조
    updateScene(sceneId, {
      videoReferences: [ref, ...filtered].slice(0, 5),
    });
  }, [scenes, updateScene]);

  if (!enableVideoReference) {
    return (
      <div className="bg-gray-800/40 border border-red-500/30 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📺</span>
            <div>
              <span className="font-bold text-white text-sm">자료영상 레퍼런스</span>
              <span className="ml-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
            </div>
          </div>
          <Toggle checked={enableVideoReference} onChange={setEnableVideoReference} label="자료영상 레퍼런스 활성화" />
        </div>
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
            <span className="font-bold text-white text-sm">자료영상 레퍼런스</span>
            <span className="ml-2 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
          </div>
        </div>
        <Toggle checked={enableVideoReference} onChange={(v) => {
          if (!v) cancelVideoReferenceSearch();
          setEnableVideoReference(v);
        }} label="자료영상 레퍼런스 활성화" />
      </div>

      {/* 안내 */}
      <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3">
        <p className="text-xs text-red-300 font-bold">YouTube 자료영상 자동 검색</p>
        <p className="text-[11px] text-gray-400 mt-1">
          대본의 맥락을 분석하여 관련 YouTube 영상을 검색하고, 해당 영상 내 <strong className="text-red-300">관련 타임코드</strong>까지 자동 매칭합니다.
        </p>
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
              검색 중... ({sceneResults.size}/{scenesWithContent.length})
            </span>
          ) : (
            `📺 전체 ${scenesWithContent.length}개 장면 자료영상 검색`
          )}
        </button>
      )}

      {/* 장면별 결과 */}
      {scenesWithContent.length > 0 && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {scenesWithContent.map((scene, i) => {
            const refs = sceneResults.get(scene.id) || scene.videoReferences || [];
            const isExpanded = expandedScene === scene.id;

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
                    {refs.length > 0 && (
                      <span className="text-[10px] text-green-400">{refs.length}개 영상</span>
                    )}
                    <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                </button>

                {/* 확장: 영상 결과 목록 */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {refs.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">
                        {isSearching ? '검색 중...' : '검색 결과 없음 — 위 버튼을 눌러 검색하세요'}
                      </p>
                    ) : (
                      refs.map((ref, j) => (
                        <div key={`${ref.videoId}-${j}`} className="flex gap-3 bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
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
                            <p className="text-[10px] text-gray-500">{ref.channelTitle}</p>
                            <p className="text-[10px] text-gray-400 line-clamp-2">{ref.segmentText}</p>
                            <div className="flex items-center gap-2 mt-1">
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
                              {/* 재생 링크 */}
                              <a
                                href={`https://www.youtube.com/watch?v=${ref.videoId}&t=${ref.startSec}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-red-400 hover:text-red-300 underline"
                              >
                                ▶ 재생
                              </a>
                              {/* 적용 */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleApply(scene.id, ref); }}
                                className="text-[10px] text-orange-400 hover:text-orange-300 underline"
                              >
                                적용
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VideoReferencePanel;
