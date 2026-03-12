/**
 * MusicReferenceRoom.tsx — 뮤직 레퍼런스 분석실 (#154)
 *
 * YouTube 채널/플레이리스트 URL → 음악 DNA + 비주얼 DNA → 퓨전 썸네일 생성
 */

import React, { useState, useCallback, useRef } from 'react';
import { useMusicReferenceStore } from '../../../stores/musicReferenceStore';
import { useUIStore } from '../../../stores/uiStore';
import {
    parseAnyYoutubeUrl,
    resolveUrlToVideos,
    analyzeMusicDNABatch,
    synthesizeChannelMusicDNA,
    analyzeVisualDNA,
    generateFusionConcepts,
} from '../../../services/musicReferenceService';
import { generateHighQualityThumbnail } from '../../../services/geminiService';
import { logger } from '../../../services/LoggerService';
import { AspectRatio } from '../../../types';
import type { MusicReferenceFusionConcept } from '../../../types';

// === 진행 메시지 ===
const PHASE_MESSAGES: Record<string, string[]> = {
    collecting: ['영상 목록을 수집하고 있어요...', '채널 정보를 불러오는 중...', '플레이리스트를 탐색하고 있어요...'],
    'music-analysis': ['음악 DNA를 추출하고 있어요...', '장르, BPM, 악기를 분석 중...', '프로덕션 스타일을 해독하고 있어요...'],
    'visual-analysis': ['썸네일 디자인을 분석하고 있어요...', '색상 팔레트를 추출 중...', '비주얼 브랜드 DNA를 해독 중...'],
    'thumbnail-gen': ['퓨전 썸네일을 생성하고 있어요...', '음악+비주얼 DNA를 결합 중...', '독창적 디자인을 만들고 있어요...'],
};

const MusicReferenceRoom: React.FC = () => {
    const store = useMusicReferenceStore();
    const showToast = useUIStore((s) => s.setToast);
    const [rollingIdx, setRollingIdx] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    // 롤링 메시지
    React.useEffect(() => {
        if (store.phase === 'idle' || store.phase === 'done' || store.phase === 'error') return;
        const timer = setInterval(() => setRollingIdx((i) => i + 1), 3000);
        return () => clearInterval(timer);
    }, [store.phase]);

    const getRollingMessage = () => {
        const msgs = PHASE_MESSAGES[store.phase] || ['분석 중...'];
        return msgs[rollingIdx % msgs.length];
    };

    // === 전체 분석 실행 ===
    const handleAnalyze = useCallback(async () => {
        const url = store.inputUrl.trim();
        if (!url) {
            showToast({ show: true, message: 'YouTube URL을 입력해주세요.' });
            setTimeout(() => showToast(null), 3000);
            return;
        }

        // URL 파싱
        const parseResult = parseAnyYoutubeUrl(url);
        if (parseResult.type === 'unknown') {
            showToast({ show: true, message: '인식할 수 없는 URL 형식이에요. YouTube 채널, 플레이리스트, 영상 URL을 넣어주세요.' });
            setTimeout(() => showToast(null), 4000);
            return;
        }

        // 리셋 + 시작
        store.setParseResult(parseResult);
        store.setError(null);
        store.setPhase('collecting');
        store.setProgress(0, 4, '영상 수집');

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            // Phase 1: 영상 수집
            logger.info('[MusicRefUI] 분석 시작', { url, parseResult });
            const { videos, sourceName } = await resolveUrlToVideos(parseResult, 15);

            if (videos.length === 0) {
                throw new Error('수집된 영상이 없습니다. URL을 확인해주세요.');
            }

            store.setVideos(videos);
            store.setSourceName(sourceName);
            store.setProgress(1, 4, '영상 수집 완료');

            // Phase 2: 음악 DNA 분석
            store.setPhase('music-analysis');
            store.setProgress(1, 4, '음악 DNA 분석');

            const perVideoDNA = await analyzeMusicDNABatch(videos, undefined, controller.signal);
            store.setPerVideoMusicDNA(perVideoDNA);

            const channelMusicDNA = await synthesizeChannelMusicDNA(perVideoDNA, sourceName, controller.signal);
            store.setChannelMusicDNA(channelMusicDNA);
            store.setProgress(2, 4, '음악 DNA 완료');

            // Phase 3: 비주얼 DNA 분석
            store.setPhase('visual-analysis');
            store.setProgress(2, 4, '비주얼 DNA 분석');

            const visualDNA = await analyzeVisualDNA(videos, controller.signal);
            store.setChannelVisualDNA(visualDNA);
            store.setProgress(3, 4, '비주얼 DNA 완료');

            // Phase 4: 퓨전 컨셉 생성
            store.setPhase('thumbnail-gen');
            store.setProgress(3, 4, '썸네일 컨셉 생성');

            const concepts = await generateFusionConcepts(channelMusicDNA, visualDNA, sourceName, controller.signal);
            store.setFusionConcepts(concepts);
            store.setProgress(4, 4, '완료');
            store.setPhase('done');
            store.setExpandedSection('both');

            logger.success('[MusicRefUI] 분석 완료', { sourceName, videoCount: videos.length });
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const msg = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.';
            store.setError(msg);
            logger.error('[MusicRefUI] 분석 실패', { error: msg });
        }
    }, [store, showToast]);

    // === 썸네일 이미지 생성 ===
    const handleGenerateThumbnail = useCallback(async (concept: MusicReferenceFusionConcept) => {
        const visualDNA = store.channelVisualDNA;
        if (!visualDNA) return;

        store.updateFusionConcept(concept.id, { isGenerating: true });

        try {
            const result = await generateHighQualityThumbnail(
                concept.textOverlay,
                concept.visualDescription,
                visualDNA.stylePromptForGeneration,
                AspectRatio.LANDSCAPE
            );
            store.updateFusionConcept(concept.id, { imageUrl: result.url, isGenerating: false });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '이미지 생성 실패';
            store.updateFusionConcept(concept.id, { isGenerating: false });
            showToast({ show: true, message: msg });
            setTimeout(() => showToast(null), 3000);
        }
    }, [store, showToast]);

    // === 전체 컨셉 일괄 생성 ===
    const handleGenerateAll = useCallback(async () => {
        const concepts = store.fusionConcepts.filter((c) => !c.imageUrl && !c.isGenerating);
        for (const c of concepts) {
            await handleGenerateThumbnail(c);
        }
    }, [store.fusionConcepts, handleGenerateThumbnail]);

    // === 중단 ===
    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
        store.setPhase('idle');
        store.setError(null);
    }, [store]);

    const isAnalyzing = store.phase !== 'idle' && store.phase !== 'done' && store.phase !== 'error';

    return (
        <div className="space-y-6">
            {/* URL 입력 */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-violet-600 rounded-lg flex items-center justify-center text-xl shadow-lg">
                        🎵
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">뮤직 레퍼런스 분석실</h2>
                        <p className="text-gray-400 text-sm">인기 뮤직 채널의 음악 + 비주얼 DNA를 분석하고 독창적 썸네일을 만들어요</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <input
                        type="text"
                        value={store.inputUrl}
                        onChange={(e) => store.setInputUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && handleAnalyze()}
                        placeholder="YouTube 채널, 플레이리스트, 영상 URL을 붙여넣으세요"
                        className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500 transition-colors"
                        disabled={isAnalyzing}
                    />
                    {isAnalyzing ? (
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="px-6 py-3 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 font-bold transition-all whitespace-nowrap"
                        >
                            중단
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleAnalyze}
                            className="px-6 py-3 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white font-bold transition-all whitespace-nowrap shadow-lg"
                        >
                            분석 시작
                        </button>
                    )}
                </div>

                {/* URL 형식 힌트 */}
                <div className="mt-3 flex flex-wrap gap-2">
                    {['채널 (@handle)', '플레이리스트', '영상 URL', '쇼츠'].map((hint) => (
                        <span key={hint} className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                            {hint}
                        </span>
                    ))}
                    <span className="text-xs text-gray-600 ml-1">어떤 형식이든 OK</span>
                </div>
            </div>

            {/* 진행 상태 */}
            {isAnalyzing && (
                <div className="bg-gray-800/50 rounded-xl p-6 border border-fuchsia-500/30">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-6 h-6 border-2 border-gray-600 border-t-fuchsia-400 rounded-full animate-spin" />
                        <span className="text-fuchsia-300 font-semibold">{getRollingMessage()}</span>
                    </div>

                    {/* 4단계 프로그레스 */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: '영상 수집', phase: 'collecting', step: 1 },
                            { label: '음악 DNA', phase: 'music-analysis', step: 2 },
                            { label: '비주얼 DNA', phase: 'visual-analysis', step: 3 },
                            { label: '썸네일 컨셉', phase: 'thumbnail-gen', step: 4 },
                        ].map((s) => {
                            const isDone = store.progress.current >= s.step;
                            const isCurrent = store.phase === s.phase;
                            return (
                                <div key={s.phase} className="text-center">
                                    <div className={`h-2 rounded-full mb-1 transition-all ${isDone ? 'bg-fuchsia-500' : isCurrent ? 'bg-fuchsia-500/50 animate-pulse' : 'bg-gray-700'}`} />
                                    <span className={`text-xs ${isDone ? 'text-fuchsia-400' : isCurrent ? 'text-fuchsia-300' : 'text-gray-600'}`}>
                                        {s.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 에러 */}
            {store.phase === 'error' && store.error && (
                <div className="bg-red-900/20 rounded-xl p-4 border border-red-500/30">
                    <p className="text-red-400 text-sm">{store.error}</p>
                    <button
                        type="button"
                        onClick={() => { store.setPhase('idle'); store.setError(null); }}
                        className="mt-2 text-xs text-red-300 underline hover:text-red-200"
                    >
                        다시 시도
                    </button>
                </div>
            )}

            {/* 수집된 영상 목록 */}
            {store.videos.length > 0 && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-300 mb-3">
                        {store.sourceName && <span className="text-fuchsia-400">{store.sourceName}</span>}
                        {' '}수집된 영상 ({store.videos.length}개)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
                        {store.videos.map((v) => (
                            <div key={v.videoId} className="group relative rounded-lg overflow-hidden">
                                <img
                                    src={v.thumbnailUrl}
                                    alt={v.title}
                                    className="w-full aspect-video object-cover rounded-lg"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                                    <span className="text-[10px] text-white leading-tight line-clamp-2">{v.title}</span>
                                </div>
                                <span className="absolute top-1 right-1 text-[9px] bg-black/70 text-gray-300 px-1 rounded">
                                    {v.duration}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 음악 DNA 리포트 */}
            {store.channelMusicDNA && (
                <div className="bg-gray-800/50 rounded-xl border border-fuchsia-500/20 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => store.setExpandedSection(
                            store.expandedSection === 'music' || store.expandedSection === 'both' ? 'visual' : 'both'
                        )}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🎵</span>
                            <span className="font-bold text-fuchsia-300">음악 DNA 리포트</span>
                        </div>
                        <span className="text-gray-500 text-sm">
                            {store.expandedSection === 'music' || store.expandedSection === 'both' ? '접기' : '펼치기'}
                        </span>
                    </button>

                    {(store.expandedSection === 'music' || store.expandedSection === 'both') && (
                        <div className="px-4 pb-4 space-y-4">
                            {/* 핵심 지표 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <MetricCard label="대표 장르" value={store.channelMusicDNA.primaryGenre} accent="fuchsia" />
                                <MetricCard label="BPM 범위" value={`${store.channelMusicDNA.bpmRange.min}-${store.channelMusicDNA.bpmRange.max} (avg ${store.channelMusicDNA.bpmRange.avg})`} accent="violet" />
                                <MetricCard label="키 선호" value={store.channelMusicDNA.keyPreference.join(', ')} accent="purple" />
                                <MetricCard label="유사 아티스트" value={store.channelMusicDNA.similarArtists.slice(0, 3).join(', ')} accent="pink" />
                            </div>

                            {/* 장르 분포 */}
                            {Object.keys(store.channelMusicDNA.genreDistribution).length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-gray-400 mb-2">장르 분포</h4>
                                    <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                                        {Object.entries(store.channelMusicDNA.genreDistribution)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([genre, pct], i) => {
                                                const colors = ['bg-fuchsia-500', 'bg-violet-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
                                                return (
                                                    <div
                                                        key={genre}
                                                        className={`${colors[i % colors.length]} flex items-center justify-center`}
                                                        style={{ width: `${Math.max(pct, 5)}%` }}
                                                        title={`${genre}: ${pct}%`}
                                                    >
                                                        <span className="text-[9px] text-white font-bold truncate px-1">
                                                            {genre} {pct}%
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* 시그니처 사운드 */}
                            <div className="flex flex-wrap gap-1.5">
                                {store.channelMusicDNA.signatureSounds.map((s) => (
                                    <span key={s} className="text-xs bg-fuchsia-600/20 text-fuchsia-300 px-2 py-1 rounded-full border border-fuchsia-500/30">
                                        {s}
                                    </span>
                                ))}
                                {store.channelMusicDNA.instrumentProfile.map((s) => (
                                    <span key={s} className="text-xs bg-violet-600/20 text-violet-300 px-2 py-1 rounded-full border border-violet-500/30">
                                        {s}
                                    </span>
                                ))}
                            </div>

                            {/* 상세 리포트 */}
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                    {store.channelMusicDNA.fullReport}
                                </p>
                            </div>

                            {/* Suno 프롬프트 */}
                            {store.channelMusicDNA.sunoStylePrompt && (
                                <div className="bg-fuchsia-900/20 rounded-lg p-3 border border-fuchsia-500/20">
                                    <h4 className="text-xs font-bold text-fuchsia-400 mb-1">Suno 음악 생성 프롬프트</h4>
                                    <p className="text-sm text-gray-300 font-mono">{store.channelMusicDNA.sunoStylePrompt}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 비주얼 DNA 리포트 */}
            {store.channelVisualDNA && (
                <div className="bg-gray-800/50 rounded-xl border border-violet-500/20 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => store.setExpandedSection(
                            store.expandedSection === 'visual' || store.expandedSection === 'both' ? 'music' : 'both'
                        )}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🎨</span>
                            <span className="font-bold text-violet-300">비주얼 DNA 리포트</span>
                        </div>
                        <span className="text-gray-500 text-sm">
                            {store.expandedSection === 'visual' || store.expandedSection === 'both' ? '접기' : '펼치기'}
                        </span>
                    </button>

                    {(store.expandedSection === 'visual' || store.expandedSection === 'both') && (
                        <div className="px-4 pb-4 space-y-4">
                            {/* 핵심 지표 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <MetricCard label="아트 스타일" value={store.channelVisualDNA.dominantStyle} accent="violet" />
                                <MetricCard label="일관성" value={`${store.channelVisualDNA.styleConsistency}/10`} accent="purple" />
                                <MetricCard label="폰트 스타일" value={store.channelVisualDNA.fontStyle} accent="indigo" />
                                <MetricCard label="피사체 유형" value={store.channelVisualDNA.subjectType} accent="blue" />
                            </div>

                            {/* 색상 팔레트 */}
                            {store.channelVisualDNA.primaryColors.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-gray-400 mb-2">브랜드 색상 팔레트</h4>
                                    <div className="flex gap-2">
                                        {store.channelVisualDNA.primaryColors.map((color) => (
                                            <div key={color} className="flex flex-col items-center gap-1">
                                                <div
                                                    className="w-10 h-10 rounded-lg border border-gray-600 shadow-inner"
                                                    style={{ backgroundColor: color }}
                                                />
                                                <span className="text-[10px] text-gray-500 font-mono">{color}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 스타일 키워드 */}
                            <div className="flex flex-wrap gap-1.5">
                                {store.channelVisualDNA.styleKeywords.map((kw) => (
                                    <span key={kw} className="text-xs bg-violet-600/20 text-violet-300 px-2 py-1 rounded-full border border-violet-500/30">
                                        {kw}
                                    </span>
                                ))}
                            </div>

                            {/* 상세 리포트 */}
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                    {store.channelVisualDNA.fullReport}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 퓨전 썸네일 컨셉 */}
            {store.fusionConcepts.length > 0 && (
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🖼</span>
                            <h3 className="font-bold text-white">퓨전 썸네일 컨셉</h3>
                        </div>
                        <button
                            type="button"
                            onClick={handleGenerateAll}
                            disabled={store.fusionConcepts.every((c) => c.imageUrl || c.isGenerating)}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-all"
                        >
                            전체 생성
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {store.fusionConcepts.map((concept) => (
                            <FusionConceptCard
                                key={concept.id}
                                concept={concept}
                                onGenerate={() => handleGenerateThumbnail(concept)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// === 서브 컴포넌트 ===

const MetricCard: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
    <div className={`bg-${accent}-600/10 rounded-lg p-3 border border-${accent}-500/20`}>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-sm font-bold text-${accent}-300 line-clamp-2`}>{value || '-'}</p>
    </div>
);

const FusionConceptCard: React.FC<{
    concept: MusicReferenceFusionConcept;
    onGenerate: () => void;
}> = ({ concept, onGenerate }) => (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
        {/* 이미지 영역 */}
        <div className="aspect-video bg-gray-800 relative flex items-center justify-center">
            {concept.imageUrl ? (
                <img src={concept.imageUrl} alt={concept.fullTitle} className="w-full h-full object-cover" />
            ) : concept.isGenerating ? (
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-gray-600 border-t-fuchsia-400 rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">생성 중...</span>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onGenerate}
                    className="flex flex-col items-center gap-2 text-gray-500 hover:text-fuchsia-400 transition-colors"
                >
                    <span className="text-3xl">+</span>
                    <span className="text-xs">클릭하여 생성</span>
                </button>
            )}

            {/* 텍스트 오버레이 미리보기 */}
            {concept.textOverlay && (
                <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-sm font-black text-white drop-shadow-lg bg-black/40 px-2 py-0.5 rounded">
                        {concept.textOverlay}
                    </span>
                </div>
            )}
        </div>

        {/* 컨셉 정보 */}
        <div className="p-3 space-y-2">
            <p className="text-sm font-bold text-white">{concept.fullTitle}</p>
            <p className="text-xs text-gray-400 line-clamp-2">{concept.musicMoodMapping}</p>

            {/* 색상 팔레트 */}
            {concept.colorPalette.length > 0 && (
                <div className="flex gap-1">
                    {concept.colorPalette.map((c) => (
                        <div key={c} className="w-5 h-5 rounded border border-gray-600" style={{ backgroundColor: c }} />
                    ))}
                </div>
            )}
        </div>
    </div>
);

export default MusicReferenceRoom;
