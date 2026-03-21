import React, { useState, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../../stores/projectStore';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { searchSceneReferenceImages, buildSearchQuery, SCENE_REFERENCE_BATCH_CONCURRENCY } from '../../../services/googleReferenceSearchService';
import type { GoogleImageResult, ReferenceSearchProvider } from '../../../services/googleReferenceSearchService';
import { searchMedia } from '../../../services/mediaSearchService';
import type { CommunityMediaItem } from '../../../types';
import type { Scene } from '../../../types';
import { showToast } from '../../../stores/uiStore';

/* ── Toggle Switch (SetupPanel과 동일 패턴) ── */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${checked ? 'bg-orange-500' : 'bg-gray-600'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

/* ── 비율 CSS 클래스 매핑 ── */
const ASPECT_CLASS: Record<string, string> = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
};

const PROVIDER_LABELS: Record<ReferenceSearchProvider, string> = {
  google: 'Google',
  bing: 'Bing',
  wikimedia: 'Wikimedia',
};

const PROVIDER_BADGE_STYLES: Record<ReferenceSearchProvider, string> = {
  google: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  bing: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  wikimedia: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
};

interface ScenePreview {
  scene: Scene;
  index: number;
  results: GoogleImageResult[];
  selectedIdx: number;
  loading: boolean;
  error: string;
  searchQuery: string;
  resultPage: number;
  provider?: ReferenceSearchProvider;
}

// [FIX #681] 밈/일러스트 소스 탭 타입
type ReferenceSourceTab = 'web' | 'meme' | 'illust';

const SOURCE_TAB_CONFIG: { id: ReferenceSourceTab; label: string; icon: string; desc: string }[] = [
  { id: 'web', label: '웹 검색', icon: '🌐', desc: '실사 사진' },
  { id: 'meme', label: '밈/GIF', icon: '😂', desc: '34K 밈' },
  { id: 'illust', label: '일러스트', icon: '🎨', desc: '23K 일러스트' },
];

const GoogleReferencePanel: React.FC = () => {
  const enableGoogleReference = useImageVideoStore((s) => s.enableGoogleReference);
  const setEnableGoogleReference = useImageVideoStore((s) => s.setEnableGoogleReference);
  const scenes = useProjectStore((s) => s.scenes);
  const config = useProjectStore((s) => s.config);
  const updateScene = useProjectStore((s) => s.updateScene);
  const aspectRatio = config?.aspectRatio || '16:9';

  const [scenePreviews, setScenePreviews] = useState<Map<string, ScenePreview>>(new Map());
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  // [FIX #681] 밈/일러스트 소스 탭
  const [activeSourceTab, setActiveSourceTab] = useState<ReferenceSourceTab>('web');
  const [memeResults, setMemeResults] = useState<Map<string, CommunityMediaItem[]>>(new Map());

  const hasScenes = scenes.length > 0 && scenes.some(s => !!s.scriptText || !!s.visualPrompt);
  const aspectClass = ASPECT_CLASS[aspectRatio] || 'aspect-video';

  // [FIX #681] 밈/일러스트 검색
  const searchMemeForScene = useCallback(async (scene: Scene, source: 'klipy' | 'irasutoya') => {
    const keywords = (scene.scriptText || scene.visualDescriptionKO || scene.visualPrompt || '').slice(0, 60);
    if (!keywords.trim()) return;
    try {
      const rawResults = await searchMedia({ query: keywords, type: 'image', source, limit: 20 });
      // [FIX #681] Klipy mp4 클립 필터링 — imageUrl에 비디오 형식 저장 방지
      const results = rawResults.filter((item) => !/(mp4|webm|mov)$/i.test(item.format || ''));
      setMemeResults((prev) => new Map(prev).set(`${scene.id}:${source}`, results.slice(0, 10)));
    } catch {
      // 밈 검색 실패는 무시 — 웹 검색이 메인
    }
  }, []);

  const applyMemeImage = useCallback((sceneId: string, item: CommunityMediaItem) => {
    const targetScene = scenes.find(s => s.id === sceneId);
    updateScene(sceneId, {
      imageUrl: item.url,
      isGeneratingImage: false,
      generationStatus: `${item.source === 'klipy' ? '밈' : '일러스트'} 레퍼런스 적용`,
      imageUpdatedAfterVideo: !!targetScene?.videoUrl,
      communityMediaItem: item,
      // [FIX #681] stale 웹 검색 메타데이터 초기화 — 이전 웹 검색 쿼리/페이지 제거
      referenceSearchQuery: undefined,
      referenceSearchPage: undefined,
    });
    showToast(`${item.source === 'klipy' ? '밈' : '일러스트'} 이미지가 적용되었어요!`);
  }, [scenes, updateScene]);

  // 개별 장면 검색
  const searchScene = useCallback(async (
    scene: Scene,
    sceneIndex: number,
    page: number = 1,
    rankingMode: 'fast' | 'best' = 'best',
  ) => {
    const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : null;
    const nextScene = sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null;

    setScenePreviews(prev => {
      const next = new Map(prev);
      const existing = next.get(scene.id);
      next.set(scene.id, {
        scene,
        index: sceneIndex,
        results: existing?.results || [],
        selectedIdx: existing?.selectedIdx ?? 0,
        loading: true,
        error: '',
        searchQuery: buildSearchQuery(scene, prevScene, nextScene, config?.globalContext),
        resultPage: page,
        provider: existing?.provider,
      });
      return next;
    });

    try {
      const startIndex = (page - 1) * 10 + 1;
      const response = await searchSceneReferenceImages(
        scene, prevScene, nextScene, config?.globalContext, startIndex, rankingMode,
      );

      setScenePreviews(prev => {
        const next = new Map(prev);
        next.set(scene.id, {
          scene,
          index: sceneIndex,
          results: response.items,
          selectedIdx: 0,
          loading: false,
          error: response.items.length === 0 ? '검색 결과가 없습니다' : '',
          searchQuery: response.query,
          resultPage: page,
          provider: response.provider,
        });
        return next;
      });

      return {
        ok: response.items.length > 0,
        provider: response.provider,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '검색 실패';
      setScenePreviews(prev => {
        const next = new Map(prev);
        const existing = next.get(scene.id);
        next.set(scene.id, {
          ...(existing || { scene, index: sceneIndex, results: [], selectedIdx: 0, searchQuery: '', resultPage: 1, provider: undefined }),
          loading: false,
          error: message,
        });
        return next;
      });

      return {
        ok: false,
        blocked: /차단|captcha|429/i.test(message),
      };
    }
  }, [scenes, config?.globalContext]);

  // 전체 장면 일괄 검색
  const searchAllScenes = useCallback(async () => {
    if (!hasScenes) { showToast('장면 분석을 먼저 실행하세요.'); return; }
    setIsSearchingAll(true);
    try {
      const validScenes = scenes.filter(s => !!s.scriptText || !!s.visualPrompt);
      let successCount = 0;
      let blockedCount = 0;
      let fallbackCount = 0;
      const queue = validScenes.map((scene) => ({ scene, sceneIndex: scenes.indexOf(scene) }));
      let cursor = 0;

      const worker = async () => {
        while (true) {
          const current = queue[cursor];
          cursor += 1;
          if (!current) return;

          const result = await searchScene(current.scene, current.sceneIndex, 1, 'fast');
          if (result.ok) {
            successCount++;
            if (result.provider && result.provider !== 'google') fallbackCount++;
          } else if (result.blocked) {
            blockedCount++;
          }
        }
      };

      const workerCount = Math.min(SCENE_REFERENCE_BATCH_CONCURRENCY, queue.length || 1);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (successCount === validScenes.length) {
        showToast(
          `${successCount}개 장면의 무료 레퍼런스 이미지를 가져왔어요!${fallbackCount > 0 ? ' (대체 소스 포함)' : ''}`,
        );
        return;
      }

      if (successCount > 0) {
        showToast(`${successCount}개 장면은 가져왔고 ${validScenes.length - successCount}개 장면은 비어 있어요.`);
        return;
      }

      showToast(
        blockedCount > 0
          ? '기본 검색 경로가 차단됐고 대체 검색에서도 이미지를 찾지 못했어요. 잠시 후 다시 시도하거나 직접 업로드해주세요.'
          : '레퍼런스 이미지를 가져오지 못했어요. 검색어를 짧게 바꾸거나 직접 업로드해주세요.',
        4500,
      );
    } finally {
      setIsSearchingAll(false);
    }
  }, [hasScenes, scenes, searchScene]);

  // 이미지 선택 → scene.imageUrl에 적용
  const applyImage = useCallback((sceneId: string, imageUrl: string, provider: ReferenceSearchProvider = 'google') => {
    const targetScene = scenes.find(s => s.id === sceneId);
    const preview = scenePreviews.get(sceneId);
    updateScene(sceneId, {
      imageUrl,
      isGeneratingImage: false,
      generationStatus: provider === 'google' ? '구글 레퍼런스 이미지 적용' : '대체 레퍼런스 이미지 적용',
      imageUpdatedAfterVideo: !!targetScene?.videoUrl,
      referenceSearchPage: preview?.resultPage || 1,
      referenceSearchQuery: preview?.searchQuery,
    });
    showToast('레퍼런스 이미지가 적용되었어요!');
  }, [scenePreviews, scenes, updateScene]);

  // 결과 내 다음/이전 이미지 전환
  const navigateResult = useCallback((sceneId: string, direction: 'prev' | 'next') => {
    setScenePreviews(prev => {
      const next = new Map(prev);
      const sp = next.get(sceneId);
      if (!sp || sp.results.length === 0) return prev;
      let newIdx = sp.selectedIdx + (direction === 'next' ? 1 : -1);
      if (newIdx < 0) newIdx = sp.results.length - 1;
      if (newIdx >= sp.results.length) newIdx = 0;
      next.set(sceneId, { ...sp, selectedIdx: newIdx });
      return next;
    });
  }, []);

  // 재생성 (다음 페이지)
  const regenerate = useCallback(async (sceneId: string) => {
    const sp = scenePreviews.get(sceneId);
    if (!sp) return;
    const nextPage = sp.resultPage + 1;
    await searchScene(sp.scene, sp.index, nextPage, 'best');
  }, [scenePreviews, searchScene]);

  // 검색어 편집 후 재검색
  const [editingQuery, setEditingQuery] = useState<{ sceneId: string; query: string } | null>(null);

  const searchWithCustomQuery = useCallback(async (sceneId: string, customQuery: string) => {
    const sceneIdx = scenes.findIndex(s => s.id === sceneId);
    if (sceneIdx < 0) return;
    const scene = scenes[sceneIdx];

    setScenePreviews(prev => {
      const next = new Map(prev);
      next.set(sceneId, {
        scene,
        index: sceneIdx,
        results: [],
        selectedIdx: 0,
        loading: true,
        error: '',
        searchQuery: customQuery,
        resultPage: 1,
        provider: undefined,
      });
      return next;
    });

    try {
      const { searchGoogleImages } = await import('../../../services/googleReferenceSearchService');
      const response = await searchGoogleImages(customQuery, 1, 'large', { rankingMode: 'best' });
      setScenePreviews(prev => {
        const next = new Map(prev);
        next.set(sceneId, {
          scene,
          index: sceneIdx,
          results: response.items,
          selectedIdx: 0,
          loading: false,
          error: response.items.length === 0 ? '검색 결과가 없습니다' : '',
          searchQuery: customQuery,
          resultPage: 1,
          provider: response.provider,
        });
        return next;
      });
    } catch (err) {
      setScenePreviews(prev => {
        const next = new Map(prev);
        next.set(sceneId, {
          scene,
          index: sceneIdx,
          results: [],
          selectedIdx: 0,
          loading: false,
          error: err instanceof Error ? err.message : '검색 실패',
          searchQuery: customQuery,
          resultPage: 1,
          provider: undefined,
        });
        return next;
      });
    }
    setEditingQuery(null);
  }, [scenes]);

  const scenesWithContent = useMemo(() =>
    scenes.filter(s => !!s.scriptText || !!s.visualPrompt),
  [scenes]);

  return (
    <div className="bg-gray-800/60 border border-orange-500/30 rounded-2xl p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-sm">
            <span>🔍</span>
          </div>
          <h3 className="text-base font-bold text-white">무료 이미지 레퍼런스</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-green-900/30 text-green-300 border-green-500/30">
            무료
          </span>
        </div>
        <Toggle checked={enableGoogleReference} onChange={setEnableGoogleReference} />
      </div>

      {enableGoogleReference && (
        <div className="space-y-4">
          {/* [FIX #681] 안내 — 단독 모드임을 명확히 + 캐릭터/화풍 미적용 경고 */}
          <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-sm mt-0.5">⚠️</span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-300">레퍼런스 전용 모드</p>
                <p className="text-[11px] text-amber-200/70 leading-relaxed">
                  웹에서 실제 사진·이미지를 검색해 <span className="text-amber-300 font-bold">시안용</span>으로 배치합니다.
                  캐릭터 설정, 비주얼 스타일(화풍)은 반영되지 않습니다.
                </p>
                <p className="text-[10px] text-gray-500">
                  AI로 직접 이미지를 생성하려면 다른 모델(NanoBanana, Imagen 등)을 선택하세요.
                </p>
              </div>
            </div>
          </div>

          {/* [FIX #681] 소스 탭 — 웹 검색 / 밈 / 일러스트 */}
          <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1">
            {SOURCE_TAB_CONFIG.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSourceTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeSourceTab === tab.id
                    ? 'bg-orange-600/30 text-orange-300 border border-orange-500/40'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className="text-[9px] text-gray-600 font-normal">{tab.desc}</span>
              </button>
            ))}
          </div>

          {/* 장면 없을 때 */}
          {!hasScenes && (
            <div className="text-center py-6 text-gray-500 text-sm">
              장면 분석을 먼저 실행하면 각 장면에 맞는 레퍼런스 이미지를 자동으로 가져올 수 있어요.
            </div>
          )}

          {/* 일괄 검색 버튼 — 선택된 소스 탭에 맞게 동작 */}
          {hasScenes && activeSourceTab === 'web' && (
            <button
              type="button"
              onClick={searchAllScenes}
              disabled={isSearchingAll}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                isSearchingAll
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg'
              }`}
            >
              {isSearchingAll ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-gray-500 border-t-orange-400 rounded-full animate-spin" />
                  검색 중...
                </span>
              ) : (
                `🌐 전체 ${scenesWithContent.length}개 장면 웹 레퍼런스 검색`
              )}
            </button>
          )}
          {hasScenes && activeSourceTab !== 'web' && (
            <p className="text-center text-[11px] text-gray-500 py-2">
              {activeSourceTab === 'meme' ? '😂 밈/GIF' : '🎨 일러스트'}는 각 장면을 펼쳐서 개별 검색해주세요
            </p>
          )}

          {/* 장면별 결과 */}
          {scenesWithContent.length > 0 && (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {scenesWithContent.map((scene, i) => {
                const sceneIndex = scenes.indexOf(scene);
                const preview = scenePreviews.get(scene.id);
                const isExpanded = expandedScene === scene.id;

                return (
                  <div
                    key={scene.id}
                    className="bg-gray-900/60 border border-gray-700/50 rounded-xl overflow-hidden"
                  >
                    {/* 장면 헤더 */}
                    <div
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/50 transition-colors"
                      onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-orange-400 bg-orange-900/30 border border-orange-500/30 rounded px-1.5 py-0.5 flex-shrink-0">
                          #{i + 1}
                        </span>
                        <span className="text-xs text-gray-400 truncate">
                          {scene.scriptText?.slice(0, 50) || scene.visualDescriptionKO?.slice(0, 50) || '(내용 없음)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {preview?.results && preview.results.length > 0 && (
                          <span className="text-[10px] text-green-400">{preview.results.length}장</span>
                        )}
                        {preview?.provider && preview.results.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_STYLES[preview.provider]}`}>
                            {PROVIDER_LABELS[preview.provider]}
                          </span>
                        )}
                        {!preview && activeSourceTab === 'web' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); searchScene(scene, sceneIndex); }}
                            className="text-xs text-orange-400 hover:text-orange-300 underline"
                          >
                            검색
                          </button>
                        )}
                        <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* 확장 내용 */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* [FIX #681] 밈/일러스트 탭 결과 */}
                        {activeSourceTab !== 'web' && (() => {
                          const sourceKey = activeSourceTab === 'meme' ? 'klipy' : 'irasutoya';
                          const items = memeResults.get(`${scene.id}:${sourceKey}`) || [];
                          return (
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={() => searchMemeForScene(scene, sourceKey as 'klipy' | 'irasutoya')}
                                className="w-full py-2 rounded-lg text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-all"
                              >
                                {activeSourceTab === 'meme' ? '😂 밈/GIF 검색' : '🎨 일러스트 검색'}
                              </button>
                              {items.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                  {items.slice(0, 9).map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => applyMemeImage(scene.id, item)}
                                      className="group relative rounded-lg overflow-hidden border border-gray-700 hover:border-orange-500/50 transition-all"
                                    >
                                      <div className={`${aspectClass} w-full bg-gray-950`}>
                                        <img
                                          src={item.thumbnailUrl || item.url}
                                          alt={item.title}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                        />
                                      </div>
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">적용</span>
                                      </div>
                                      <p className="text-[9px] text-gray-500 truncate px-1 py-0.5">{item.title}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {items.length === 0 && (
                                <p className="text-center text-xs text-gray-600 py-4">
                                  위 버튼을 눌러 장면에 맞는 {activeSourceTab === 'meme' ? '밈/GIF' : '일러스트'}를 검색하세요
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* 웹 검색 결과 — 기존 UI */}
                        {activeSourceTab === 'web' && preview?.searchQuery && (
                          <div className="flex items-center gap-2">
                            {editingQuery?.sceneId === scene.id ? (
                              <form
                                className="flex gap-2 flex-1"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  searchWithCustomQuery(scene.id, editingQuery.query);
                                }}
                              >
                                <input
                                  type="text"
                                  value={editingQuery.query}
                                  onChange={(e) => setEditingQuery({ sceneId: scene.id, query: e.target.value })}
                                  className="flex-1 bg-gray-800 border border-orange-500/30 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-400"
                                  autoFocus
                                />
                                <button type="submit" className="text-xs text-orange-400 hover:text-orange-300 font-bold px-2">
                                  검색
                                </button>
                                <button type="button" onClick={() => setEditingQuery(null)} className="text-xs text-gray-500 hover:text-gray-400 px-2">
                                  취소
                                </button>
                              </form>
                            ) : (
                              <>
                                <span className="text-[10px] text-gray-500">검색어:</span>
                                <span className="text-xs text-orange-300 flex-1 truncate">{preview.searchQuery}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingQuery({ sceneId: scene.id, query: preview.searchQuery })}
                                  className="text-[10px] text-gray-500 hover:text-orange-400 underline flex-shrink-0"
                                >
                                  편집
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* 로딩 */}
                        {activeSourceTab === 'web' && preview?.loading && (
                          <div className="flex items-center justify-center py-6">
                            <span className="w-5 h-5 border-2 border-gray-600 border-t-orange-400 rounded-full animate-spin" />
                          </div>
                        )}

                        {/* 에러 */}
                        {activeSourceTab === 'web' && preview?.error && !preview.loading && (
                          <div className="text-center py-4">
                            <p className="text-xs text-red-400">{preview.error}</p>
                            <button
                              type="button"
                              onClick={() => searchScene(scene, sceneIndex)}
                              className="text-xs text-orange-400 hover:text-orange-300 underline mt-2"
                            >
                              다시 시도
                            </button>
                          </div>
                        )}

                        {/* 결과 — 메인 프리뷰 + 네비게이션 */}
                        {activeSourceTab === 'web' && preview && preview.results.length > 0 && !preview.loading && (
                          <div className="space-y-3">
                            {/* 메인 이미지 */}
                            <div className="relative">
                              <div className={`${aspectClass} w-full rounded-xl overflow-hidden bg-gray-950 border border-gray-700`}>
                                <img
                                  src={preview.results[preview.selectedIdx]?.link}
                                  alt={preview.results[preview.selectedIdx]?.title || ''}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    // 원본 실패 시 썸네일로 폴백
                                    const thumb = preview.results[preview.selectedIdx]?.thumbnailLink;
                                    if (thumb && target.src !== thumb) {
                                      target.src = thumb;
                                    }
                                  }}
                                />
                              </div>
                              {/* 좌우 네비게이션 */}
                              {preview.results.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => navigateResult(scene.id, 'prev')}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white text-sm transition-colors"
                                  >
                                    ‹
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigateResult(scene.id, 'next')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white text-sm transition-colors"
                                  >
                                    ›
                                  </button>
                                </>
                              )}
                              {/* 인덱스 표시 */}
                              <span className="absolute bottom-2 right-2 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full">
                                {preview.selectedIdx + 1}/{preview.results.length}
                              </span>
                              {/* 출처 */}
                              <span className="absolute bottom-2 left-2 text-[10px] bg-black/70 text-gray-300 px-2 py-0.5 rounded-full truncate max-w-[60%]">
                                {preview.results[preview.selectedIdx]?.displayLink}
                              </span>
                            </div>

                            {/* 썸네일 그리드 */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {preview.results.map((img, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setScenePreviews(prev => {
                                    const next = new Map(prev);
                                    const sp = next.get(scene.id);
                                    if (sp) next.set(scene.id, { ...sp, selectedIdx: idx });
                                    return next;
                                  })}
                                  className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                                    idx === preview.selectedIdx
                                      ? 'border-orange-400 ring-1 ring-orange-400/50'
                                      : 'border-gray-700 hover:border-gray-500'
                                  }`}
                                >
                                  <img
                                    src={img.thumbnailLink || img.link}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>

                            {/* 액션 버튼 */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => applyImage(scene.id, preview.results[preview.selectedIdx]?.link, preview.provider || 'google')}
                                className="flex-1 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-lg text-xs font-bold transition-all"
                              >
                                이 이미지 적용
                              </button>
                              <button
                                type="button"
                                onClick={() => regenerate(scene.id)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-lg text-xs font-bold transition-colors"
                              >
                                재검색
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 아직 검색 안 한 경우 */}
                        {!preview && (
                          <button
                            type="button"
                            onClick={() => searchScene(scene, sceneIndex)}
                            className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-xl text-xs font-bold transition-colors"
                          >
                            이 장면 레퍼런스 검색
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleReferencePanel;
