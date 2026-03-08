import React, { useState, useRef, useEffect } from 'react';
import { AspectRatio } from '../types';
import { PRICING, CHARACTER_STYLES } from '../constants';
import { generateCharacterVariations, analyzeImageUnified } from '../services/geminiService';
import { uploadMediaToHosting } from '../services/uploadService';
import { resizeImage, base64ToFile } from '../services/imageProcessingService';
// import { getRemoveBgKey } from '../services/apiService';
// import { removeBackground } from '../services/removeBgService';
import { logger } from '../services/LoggerService';
import { showToast } from '../stores/uiStore';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useCostStore } from '../stores/costStore';
import ImageLightbox from './ImageLightbox';
import { CharacterGenCard } from './modes/CharacterGenCard';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';

interface GenResult { id: string; url: string; prompt: string; }

const StyleThumbnail: React.FC<{
    catIdx: number; itemIdx: number; emoji: string;
    onPreview: (catIdx: number, itemIdx: number) => void;
}> = ({ catIdx, itemIdx, emoji, onPreview }) => {
    const [err, setErr] = useState(false);
    if (err) return <span className="text-2xl">{emoji}</span>;
    return (
        <img
            src={`/style-previews/${catIdx}/${itemIdx}.jpg`}
            alt=""
            loading="lazy"
            className="w-12 h-12 rounded-md object-cover cursor-zoom-in hover:ring-2 hover:ring-white/50 transition-all"
            onError={() => setErr(true)}
            onClick={(e) => { e.stopPropagation(); onPreview(catIdx, itemIdx); }}
        />
    );
};

const TWIST_MESSAGES = [
    "🌀 1단계: 원본의 얼굴 특징(눈, 코, 입)을 정밀 분석하고 있습니다...",
    "🎭 2단계: 기존 화풍은 유지하되, 헤어스타일과 의상에 새로운 변주를 주고 있습니다...",
    "💃 3단계: 캐릭터의 자세(Pose)를 자연스럽게 조정하여 전신을 스케치 중입니다...",
    "👢 4단계: 머리부터 발끝까지 잘림 없는 풀샷(Full-body)으로 렌더링합니다..."
];
const PLANNING_MESSAGE = "🧠 AI가 4가지 독창적인 컨셉을 구상 중입니다... (창의성 발휘 중)";

const CHAR_STYLE_FAV_KEY = 'FAVORITE_CHARACTER_STYLES';

function useCharStyleFavorites() {
    const [favs, setFavs] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(CHAR_STYLE_FAV_KEY) || '[]'); }
        catch { return []; }
    });
    const toggle = (label: string) => {
        setFavs(prev => {
            const next = prev.includes(label) ? prev.filter(f => f !== label) : [...prev, label];
            localStorage.setItem(CHAR_STYLE_FAV_KEY, JSON.stringify(next));
            return next;
        });
    };
    return { favs, toggle, has: (label: string) => favs.includes(label) };
}

const CharacterTwistLab: React.FC = () => {
    const { requireAuth } = useAuthGuard();
    // Image & Analysis
    const [twistImageBase64, setTwistImageBase64] = useState<string | null>(null);
    const [twistPublicUrl, setTwistPublicUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isRemovingBg, setIsRemovingBg] = useState(false);
    const [detectedStyle, setDetectedStyle] = useState('');
    const [detectedCharacter, setDetectedCharacter] = useState('');

    // Twist Settings
    const [twistMode, setTwistMode] = useState<'RANDOM' | 'CUSTOM'>('RANDOM');
    const [twistCustomStyle, setTwistCustomStyle] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.PORTRAIT);
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
    const [activeStyleCategory, setActiveStyleCategory] = useState(CHARACTER_STYLES[0].category);
    const { favs: charFavs, toggle: toggleCharFav, has: isCharFav } = useCharStyleFavorites();

    // Results
    const [results, setResults] = useState<GenResult[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [previewPos, setPreviewPos] = useState<{ catIdx: number; itemIdx: number } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const elapsedAnalyze = useElapsedTimer(isAnalyzing);
    const elapsedBg = useElapsedTimer(isRemovingBg);

    const handleImageUpload = async (file: File) => {
        try {
            const originalBase64 = await resizeImage(file, 768, 'image/png');
            setTwistImageBase64(originalBase64);

            const processedFile = file;
            // [DISABLED] Remove.bg 배경 제거 비활성화
            // if (getRemoveBgKey()) {
            //     setIsRemovingBg(true);
            //     try {
            //         processedFile = await removeBackground(file);
            //         useCostStore.getState().addCost(PRICING.REMOVE_BG_PER_IMAGE, 'image');
            //         const processedBase64 = await resizeImage(processedFile, 768, 'image/png');
            //         setTwistImageBase64(processedBase64);
            //     } catch (bgError) {
            //         console.warn("Background removal failed, using original.", bgError);
            //     } finally {
            //         setIsRemovingBg(false);
            //     }
            // }

            setIsAnalyzing(true);
            const finalBase64 = await resizeImage(processedFile, 768, 'image/png');
            try {
                const result = await analyzeImageUnified(finalBase64);
                setDetectedStyle(result.style);
                setDetectedCharacter(result.character);
            } catch (err) {
                logger.warn("[CharacterTwistLab] Image analysis failed, using defaults", err);
                setDetectedStyle("Custom Art Style");
                setDetectedCharacter("Original Character");
            } finally {
                setIsAnalyzing(false);
            }

            const transparentFile = base64ToFile(finalBase64, "twist_char.png");
            const url = await uploadMediaToHosting(transparentFile);
            setTwistPublicUrl(url);
        } catch (err) {
            logger.error("[CharacterTwistLab] Image processing failed", err);
            showToast('이미지 처리에 실패했습니다. 다른 이미지를 시도해주세요.', 4000);
            setIsAnalyzing(false);
            setIsRemovingBg(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) handleImageUpload(file);
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) { e.preventDefault(); handleImageUpload(blob); }
                    break;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const handleGenerate = async () => {
        if (!requireAuth('캐릭터 생성')) return;
        if (!twistImageBase64) { showToast("이미지를 업로드해주세요 (필수)."); return; }

        logger.info("[CharacterTwistLab] Starting generation");
        setResults([]);
        setSelectedIdx(null);

        const timestamp = Date.now();
        const baseResults: GenResult[] = Array(4).fill(null).map((_, idx) => ({
            id: `twist-${timestamp}-${idx}`, url: '', prompt: ''
        }));
        setResults(baseResults);

        try {
            let currentStyle = detectedStyle || "Same as original image";
            let currentChar = detectedCharacter || "Same as original character";

            let analysisInjection = `[ORIGINAL ART STYLE TO KEEP: ${currentStyle}] [ORIGINAL CHARACTER BASE: ${currentChar}] `;

            let stylePrompt = "";
            if (selectedStyle) {
                for (const cat of CHARACTER_STYLES) {
                    const found = cat.items.find(item => item.label === selectedStyle);
                    if (found) { stylePrompt = `[Target Style: ${found.prompt}]`; break; }
                }
            }

            const adherenceInstruction = `
            [MODE: EXAGGERATED FEATURE TWIST]
            1. **ART STYLE**: STRICTLY LOCK the original art style. The rendering, brush strokes, and coloring must be identical to the original.
            2. **CORE IDENTITY**: Keep the base species and gender (e.g. if it's a human boy, keep it a human boy).
            3. **DRAMATIC VARIATION**: Change 3-4 features simultaneously.
            4. **GOAL**: Create 4 HIGHLY DISTINCT variations.
            `;

            let baseConcept: string;
            let twistType: 'RANDOM' | 'CUSTOM';
            let customStyle = "";

            if (twistMode === 'RANDOM') {
                baseConcept = `${analysisInjection} TASK: Create 4 heavily exaggerated variations. ${adherenceInstruction}`;
                if (selectedStyle && stylePrompt) {
                    baseConcept += ` ${stylePrompt}`;
                    twistType = 'CUSTOM';
                    customStyle = stylePrompt;
                } else {
                    twistType = 'RANDOM';
                }
            } else {
                baseConcept = `${analysisInjection} TASK: Modify character: "${twistCustomStyle || selectedStyle || ''}". ${adherenceInstruction}`;
                twistType = 'CUSTOM';
                customStyle = twistCustomStyle || selectedStyle || "";
            }

            let variationPrompts = await generateCharacterVariations(baseConcept, twistType!, customStyle);
            if (!variationPrompts || variationPrompts.length === 0) {
                variationPrompts = [baseConcept, baseConcept, baseConcept, baseConcept];
            }
            while (variationPrompts.length < 4) variationPrompts.push(variationPrompts[0] || baseConcept);
            variationPrompts = variationPrompts.slice(0, 4);

            const naturalConstraints = "(FULL BODY SHOT: 1.5), (HEAD TO TOE), (SHOWING SHOES), wide angle, standing pose, front view, simple white background. [Negative: Close up, Portrait, Upper body only, Cropped head, Cut off feet, Half body].";

            for (let i = 0; i < variationPrompts.length; i++) {
                const strictAdherence = twistImageBase64 ? `(STRICTLY FOLLOW THE REFERENCE IMAGE COMPOSITION, STYLE, AND COLOR.) ` : "";
                const finalPrompt = strictAdherence + variationPrompts[i] + " " + naturalConstraints;

                setResults(prev => {
                    const newResults = [...prev];
                    if (newResults[i]) newResults[i] = { ...newResults[i], prompt: finalPrompt };
                    return newResults;
                });
                if (i < variationPrompts.length - 1) await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            showToast(`기획 단계 실패: ${errMsg}`, 4000);
            setResults([]);
        }
    };

    const handleImageUpdate = (index: number, url: string) => {
        setResults(prev => {
            const arr = [...prev];
            if (arr[index]) arr[index] = { ...arr[index], url };
            return arr;
        });
    };

    const handleBatchDownload = async () => {
        const valid = results.filter(r => r.url);
        if (valid.length === 0) { showToast("다운로드할 이미지가 없습니다."); return; }
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        await Promise.all(valid.map(async (res, idx) => {
            try {
                if (res.url.startsWith('data:') && res.url.includes(',')) {
                    zip.file(`twist_variant_${idx + 1}.png`, res.url.split(',')[1], { base64: true });
                } else {
                    const response = await fetch(res.url);
                    const blob = await response.blob();
                    zip.file(`twist_variant_${idx + 1}.png`, blob);
                }
            } catch (e) { console.error("Batch download error", e); }
        }));
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `twist_set_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getGridClass = () => aspectRatio === AspectRatio.LANDSCAPE ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "grid grid-cols-2 md:grid-cols-4 gap-6";

    // const hasKey = !!getRemoveBgKey();

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in-up space-y-8">
            {lightboxUrl && <ImageLightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

            {/* Style Preview Gallery Lightbox */}
            {previewPos && (() => {
                const cat = CHARACTER_STYLES[previewPos.catIdx];
                if (!cat) return null;
                const item = cat.items[previewPos.itemIdx];
                if (!item) return null;
                const total = cat.items.length;
                const goPrev = () => setPreviewPos(p => p ? { ...p, itemIdx: (p.itemIdx - 1 + total) % total } : null);
                const goNext = () => setPreviewPos(p => p ? { ...p, itemIdx: (p.itemIdx + 1) % total } : null);
                return (
                    <div className="fixed inset-0 bg-black/95 z-[99999] flex items-center justify-center p-4" onClick={() => setPreviewPos(null)}
                        onKeyDown={(e) => { if (e.key === 'ArrowLeft') goPrev(); else if (e.key === 'ArrowRight') goNext(); else if (e.key === 'Escape') setPreviewPos(null); }}
                        tabIndex={0} ref={(el) => el?.focus()}>
                        {/* Close */}
                        <button onClick={() => setPreviewPos(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-[100000]" title="닫기 (ESC)">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {/* Prev */}
                        <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors z-[100000]">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        {/* Next */}
                        <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors z-[100000]">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                        </button>
                        {/* Image */}
                        <img src={`/style-previews/${previewPos.catIdx}/${previewPos.itemIdx}.jpg`} alt={item?.label || ''} className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                        {/* Label + Counter */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                            <span className="text-white text-lg font-bold bg-black/60 px-4 py-1.5 rounded-full">{item?.emoji} {item?.label}</span>
                            <span className="text-gray-400 text-sm">{previewPos.itemIdx + 1} / {total} &middot; {cat.category}</span>
                        </div>
                    </div>
                );
            })()}

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-2xl shadow-lg">🌀</div>
                <div>
                    <h1 className="text-3xl font-bold text-white">캐릭터 비틀기 (Character Twist)</h1>
                    <p className="text-gray-400 text-base">원본 이미지의 화풍은 유지하고, 캐릭터의 세부 특징만 창의적으로 변주합니다.</p>
                </div>
                <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
            </div>

            {results.length === 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left: Upload & Settings */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* Image Upload */}
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                            <label className="block text-base font-bold text-gray-400 mb-2">1. 원본 이미지 업로드</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                                onDrop={handleDrop}
                                className={`w-full aspect-video rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden relative group transition-all duration-200 ${
                                    isDragOver ? 'border-orange-500 bg-orange-900/20 scale-[1.02]' : 'bg-gray-900 border-gray-600 hover:border-orange-500'
                                }`}
                            >
                                {twistImageBase64 ? (
                                    <>
                                        <img src={twistImageBase64} className="w-full h-full object-contain" />
                                        {isAnalyzing && (
                                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm animate-fade-in">
                                                <div className="w-10 h-10 border-4 border-t-red-400 border-b-transparent border-l-transparent border-r-red-400 rounded-full animate-spin mb-3" />
                                                <p className="text-white font-bold text-base">✨ 캐릭터 상세 분석 중...</p>
                                                <p className="text-sm text-purple-300">잠시만 기다려주세요...</p>
                                                {elapsedAnalyze > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedAnalyze)}</span>}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center text-gray-500">
                                        <span className="text-4xl block mb-2">📸</span>
                                        <span className={`text-base font-bold ${isDragOver ? 'text-orange-300' : ''}`}>
                                            {isDragOver ? '이미지 놓기!' : '클릭, 드래그 또는 Ctrl+V로 업로드'}
                                        </span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                                    <span className="text-white font-bold border border-white px-3 py-1 rounded-full">이미지 변경</span>
                                </div>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} accept="image/*" className="hidden" />

                            {/* [DISABLED] Remove.bg Tip */}
                        </div>

                        {/* AI Analysis Report */}
                        {(detectedStyle || detectedCharacter) && (
                            <div className="bg-gray-800 rounded-xl border border-purple-500/30 p-5 shadow-lg animate-fade-in">
                                <h3 className="font-bold text-base text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-4">✨ AI 분석 리포트</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-bold text-purple-400 mb-1 block">🎨 감지된 화풍</label>
                                        <textarea value={detectedStyle} onChange={(e) => setDetectedStyle(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 focus:border-purple-500 outline-none resize-none h-16" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-bold text-blue-400 mb-1 block">👤 감지된 캐릭터</label>
                                        <textarea value={detectedCharacter} onChange={(e) => setDetectedCharacter(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 focus:border-blue-500 outline-none resize-none h-16" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Twist Mode */}
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                            <label className="block text-base font-bold text-gray-400 mb-3">2. 비틀기 방식 선택</label>
                            <div className="grid grid-cols-1 gap-3">
                                <button onClick={() => setTwistMode('RANDOM')} className={`w-full p-4 rounded-xl border text-left flex items-center gap-4 transition-all ${twistMode === 'RANDOM' ? 'bg-orange-900/30 border-orange-500 shadow-lg' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}>
                                    <span className="text-2xl">🎲</span>
                                    <div>
                                        <div className={`font-bold ${twistMode === 'RANDOM' ? 'text-orange-300' : 'text-gray-300'}`}>AI 랜덤 비틀기</div>
                                        <p className="text-sm text-gray-500">캐릭터의 본질은 유지하고, 세부 특징만 창의적으로 변주합니다.</p>
                                    </div>
                                </button>
                                <button onClick={() => setTwistMode('CUSTOM')} className={`w-full p-4 rounded-xl border text-left flex items-start gap-4 transition-all ${twistMode === 'CUSTOM' ? 'bg-orange-900/30 border-orange-500 shadow-lg' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}>
                                    <span className="text-2xl mt-1">✏️</span>
                                    <div className="w-full">
                                        <div className={`font-bold ${twistMode === 'CUSTOM' ? 'text-orange-300' : 'text-gray-300'}`}>직접 스타일 입력</div>
                                        <p className="text-sm text-gray-500 mb-2">바꾸고 싶은 특정 요소(머리색, 소품 등)를 지시합니다.</p>
                                        {twistMode === 'CUSTOM' && (
                                            <input
                                                type="text"
                                                value={twistCustomStyle}
                                                onChange={(e) => setTwistCustomStyle(e.target.value)}
                                                placeholder="예: 안경을 벗겨줘, 티셔츠를 파란색으로 바꿔줘"
                                                className="w-full bg-gray-800 border border-orange-500/50 rounded p-2 text-base text-white focus:outline-none animate-fade-in"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        )}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Style + Settings + Generate */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Style Selector */}
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xl">🎨</span>
                                <h3 className="text-base font-bold text-white">캐릭터 스타일</h3>
                                <span className="text-sm bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">선택사항</span>
                            </div>
                            <div className="flex overflow-x-auto gap-2 pb-2 mb-3">
                                {charFavs.length > 0 && (
                                    <button onClick={() => setActiveStyleCategory('__favorites__')} className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${activeStyleCategory === '__favorites__' ? 'bg-yellow-600 text-white border-transparent' : 'bg-gray-900 text-yellow-400 border-yellow-700/50 hover:bg-gray-700'}`}>
                                        ⭐ 즐겨찾기
                                    </button>
                                )}
                                {CHARACTER_STYLES.map((cat) => (
                                    <button key={cat.category} onClick={() => setActiveStyleCategory(cat.category)} className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${activeStyleCategory === cat.category ? 'bg-blue-600 text-white border-transparent' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-700'}`}>
                                        {cat.items[0].emoji} {cat.category.split(' ')[1] || cat.category}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                                {(() => {
                                    if (activeStyleCategory === '__favorites__') {
                                        // Render favorited items from all categories
                                        const items: { catIdx: number; itemIdx: number; item: typeof CHARACTER_STYLES[0]['items'][0] }[] = [];
                                        charFavs.forEach(label => {
                                            for (let ci = 0; ci < CHARACTER_STYLES.length; ci++) {
                                                const ii = CHARACTER_STYLES[ci].items.findIndex(it => it.label === label);
                                                if (ii !== -1) { items.push({ catIdx: ci, itemIdx: ii, item: CHARACTER_STYLES[ci].items[ii] }); break; }
                                            }
                                        });
                                        return items.map(({ catIdx, itemIdx, item }) => {
                                            const isFeatured = item.label === 'MS 페인트';
                                            return (
                                            <button key={item.label} onClick={() => setSelectedStyle(prev => prev === item.label ? null : item.label)} className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 relative ${selectedStyle === item.label ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500' : isFeatured ? 'bg-gradient-to-b from-amber-900/30 to-orange-900/20 border-amber-500/70 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-gray-900 border-gray-600 hover:border-gray-500'}`}>
                                                <span onClick={(e) => { e.stopPropagation(); toggleCharFav(item.label); }} className="absolute top-0.5 left-0.5 text-xs cursor-pointer z-10 hover:scale-125 transition-transform text-yellow-400">★</span>
                                                {isFeatured && <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[7px] font-black px-1 py-0.5 rounded-full shadow-lg animate-pulse z-10">HOT</span>}
                                                <StyleThumbnail catIdx={catIdx} itemIdx={itemIdx} emoji={item.emoji} onPreview={(c, i) => setPreviewPos({ catIdx: c, itemIdx: i })} />
                                                <span className={`text-xs font-bold ${selectedStyle === item.label ? 'text-white' : isFeatured ? 'text-amber-200' : 'text-gray-400'}`}>{item.label}</span>
                                            </button>
                                            );
                                        });
                                    }
                                    const catIdx = CHARACTER_STYLES.findIndex(c => c.category === activeStyleCategory);
                                    return CHARACTER_STYLES[catIdx]?.items.map((item, itemIdx) => {
                                        const isFeatured = item.label === 'MS 페인트';
                                        const faved = isCharFav(item.label);
                                        return (
                                        <button key={item.label} onClick={() => setSelectedStyle(prev => prev === item.label ? null : item.label)} className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 relative ${selectedStyle === item.label ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500' : isFeatured ? 'bg-gradient-to-b from-amber-900/30 to-orange-900/20 border-amber-500/70 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-gray-900 border-gray-600 hover:border-gray-500'}`}>
                                            <span onClick={(e) => { e.stopPropagation(); toggleCharFav(item.label); }} className={`absolute top-0.5 left-0.5 text-xs cursor-pointer z-10 hover:scale-125 transition-transform ${faved ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}>★</span>
                                            {isFeatured && <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[7px] font-black px-1 py-0.5 rounded-full shadow-lg animate-pulse z-10">HOT</span>}
                                            <StyleThumbnail catIdx={catIdx} itemIdx={itemIdx} emoji={item.emoji} onPreview={(c, i) => setPreviewPos({ catIdx: c, itemIdx: i })} />
                                            <span className={`text-xs font-bold ${selectedStyle === item.label ? 'text-white' : isFeatured ? 'text-amber-200' : 'text-gray-400'}`}>{item.label}</span>
                                        </button>
                                        );
                                    });
                                })()}
                            </div>
                            {selectedStyle && <button onClick={() => setSelectedStyle(null)} className="mt-2 text-sm text-red-400 hover:text-red-300 underline">스타일 선택 취소</button>}
                        </div>

                        {/* Aspect Ratio */}
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                            <label className="block text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">화면 비율</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: AspectRatio.PORTRAIT, label: '9:16 (추천)', desc: '쇼츠/전신' },
                                    { id: AspectRatio.SQUARE, label: '1:1', desc: '프로필' },
                                    { id: AspectRatio.LANDSCAPE, label: '16:9', desc: '유튜브' }
                                ].map(r => (
                                    <button key={r.id} onClick={() => setAspectRatio(r.id)} className={`py-3 px-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${aspectRatio === r.id ? 'bg-purple-600 border-purple-400 text-white shadow-lg' : 'bg-gray-900 border-gray-600 text-gray-400 hover:bg-gray-800'}`}>
                                        <span className="font-black text-base">{r.label}</span>
                                        <span className="text-xs opacity-80">{r.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button onClick={handleGenerate} disabled={!twistImageBase64 || isAnalyzing || isRemovingBg} className={`w-full py-5 rounded-xl font-bold text-xl shadow-2xl transition-all flex flex-col items-center gap-1 ${!twistImageBase64 || isAnalyzing || isRemovingBg ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white hover:scale-[1.02] active:scale-95'}`}>
                            <div className="flex items-center gap-2">🌀 4가지 변주 생성하기</div>
                            <span className="text-sm bg-black/20 px-2 py-0.5 rounded font-normal opacity-80">AI 프롬프트 기획 + 이미지 4장 생성</span>
                        </button>
                    </div>
                </div>
            ) : (
                /* Results Grid */
                <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-2xl animate-fade-in-up">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white">🎉 마음에 드는 변주를 선택하세요!</h3>
                            <p className="text-base text-gray-400">원본의 화풍을 유지하면서 세부 특징이 변주되었습니다.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleBatchDownload} className="text-base bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-lg">
                                <span>📦</span> 일괄 저장
                            </button>
                            <button onClick={() => { setResults([]); setSelectedIdx(null); }} className="text-base bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2">
                                <span>↩️</span> 다시 설정
                            </button>
                        </div>
                    </div>

                    <div className={getGridClass()}>
                        {results.map((res, idx) => (
                            <CharacterGenCard
                                key={res.id}
                                id={res.id}
                                index={idx}
                                prompt={res.prompt}
                                aspectRatio={aspectRatio}
                                referenceImage={twistPublicUrl || twistImageBase64 || undefined}
                                onImageGenerated={handleImageUpdate}
                                onSelect={setSelectedIdx}
                                isSelected={selectedIdx === idx}
                                onLightbox={setLightboxUrl}
                                isPlanning={!res.prompt}
                                loadingMessages={TWIST_MESSAGES}
                                planningMessage={PLANNING_MESSAGE}
                            />
                        ))}
                    </div>

                    <div className="mt-8 flex justify-center">
                        <button onClick={handleGenerate} className="px-8 py-4 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-xl transition-all hover:scale-105 flex items-center gap-2">
                            🔄 다시 생성하기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CharacterTwistLab;
