import React, { useState, useEffect, useRef } from 'react';
import { AspectRatio } from '../../types';
import { PRICING } from '../../constants';
import { generateKieImage, generateEvolinkImageWrapped } from '../../services/VideoGenService';
import { logger } from '../../services/LoggerService';
import { showToast } from '../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';

interface CharacterGenCardProps {
    id: string;
    index: number;
    prompt: string;
    aspectRatio: AspectRatio;
    referenceImage?: string;
    onImageGenerated: (index: number, url: string) => void;
    onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void;
    onSelect: (index: number) => void;
    isSelected: boolean;
    onLightbox: (url: string) => void;
    isPlanning: boolean;
    loadingMessages?: string[];
    planningMessage?: string;
}

const DEFAULT_LOADING_MESSAGES = [
    "1단계: 원본의 스타일과 구도를 분석하고 있습니다...",
    "2단계: 요청하신 컨셉을 픽셀 단위로 재구성 중입니다...",
    "3단계: 조명과 질감을 다듬어 생명력을 불어넣고 있습니다...",
    "4단계: 최종 디테일 업스케일링을 진행 중입니다..."
];

export const CharacterGenCard: React.FC<CharacterGenCardProps> = ({
    id,
    index,
    prompt,
    aspectRatio,
    referenceImage,
    onImageGenerated,
    onCostAdd,
    onSelect,
    isSelected,
    onLightbox,
    isPlanning,
    loadingMessages,
    planningMessage
}) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const elapsed = useElapsedTimer(isLoading);
    const [error, setError] = useState<string | null>(null);
    const [msgIndex, setMsgIndex] = useState(0);
    const [statusOverride, setStatusOverride] = useState<string | null>(null);
    const hasStartedRef = useRef(false);

    const activeMessages = loadingMessages || DEFAULT_LOADING_MESSAGES;

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isLoading) {
            interval = setInterval(() => {
                setMsgIndex((prev) => (prev + 1) % activeMessages.length);
            }, 3000);
        } else {
            setMsgIndex(0);
        }
        return () => clearInterval(interval);
    }, [isLoading, activeMessages]);

    const generateImage = async () => {
        if (!prompt || isPlanning) return;

        setIsLoading(true);
        setError(null);
        setStatusOverride(null);
        hasStartedRef.current = true;

        logger.info(`[Card #${index}] Generating Image...`, { id, promptLen: prompt.length });

        try {
            const url = await generateKieImage(prompt, aspectRatio, referenceImage, undefined, "nano-banana-2");
            if (!url) throw new Error("Empty URL returned");

            setImageUrl(url);
            logger.success(`[Card #${index}] Image Ready`, { id, urlLen: url.length });
            onImageGenerated(index, url);
            if (onCostAdd) onCostAdd(PRICING.IMAGE_GENERATION, 'image');
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.warn(`[Card #${index}] Kie Nanobanana 2 failed, trying Evolink fallback:`, errMsg);
            setStatusOverride("⚠️ 기본 엔진 실패. Evolink 엔진으로 우회 중...");

            try {
                const fallbackUrl = await generateEvolinkImageWrapped(prompt, aspectRatio, referenceImage, undefined, "2K");
                if (!fallbackUrl) throw new Error("Fallback Empty URL");

                setImageUrl(fallbackUrl);
                onImageGenerated(index, fallbackUrl);
                if (onCostAdd) onCostAdd(PRICING.IMAGE_GENERATION_FALLBACK, 'image');
                logger.success(`[Card #${index}] Fallback Image Ready`);
            } catch (fallbackError: unknown) {
                console.error(`[Card #${index}] All engines failed:`, fallbackError);
                setError(`생성 실패 (모든 엔진): ${errMsg}`);
            }
        } finally {
            setIsLoading(false);
            setStatusOverride(null);
        }
    };

    useEffect(() => {
        if (!imageUrl && prompt && !isPlanning && !hasStartedRef.current) {
            generateImage();
        }
    }, [prompt, isPlanning]);

    const handleRegenerate = (e: React.MouseEvent) => {
        e.stopPropagation();
        setImageUrl(null);
        hasStartedRef.current = false;
        generateImage();
    };

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!imageUrl) return;
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `character_variant_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getAspectRatioStyle = (): React.CSSProperties => {
        switch (aspectRatio) {
            case AspectRatio.PORTRAIT: return { aspectRatio: '9 / 16' };
            case AspectRatio.LANDSCAPE: return { aspectRatio: '16 / 9' };
            case AspectRatio.CLASSIC: return { aspectRatio: '4 / 3' };
            default: return { aspectRatio: '1 / 1' };
        }
    };

    const isPortrait = aspectRatio === AspectRatio.PORTRAIT;

    return (
        <div className={`flex flex-col rounded-xl overflow-hidden border-2 transition-all ${
            isSelected
            ? 'border-green-500 ring-2 ring-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] transform scale-[1.02]'
            : 'border-gray-700 hover:border-gray-500 bg-gray-900'
        }`}>
            <div
                onClick={() => imageUrl && onLightbox(imageUrl)}
                className={`relative bg-black group/img ${imageUrl ? 'cursor-zoom-in' : 'cursor-wait'}`}
                style={getAspectRatioStyle()}
            >
                {imageUrl ? (
                    <>
                        <img src={imageUrl} className={`w-full h-full ${isPortrait ? 'object-contain' : 'object-cover'} animate-fade-in`} alt={`Variant ${index+1}`} />
                        <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 overflow-hidden bg-gray-900">
                        {referenceImage && (
                            <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-md scale-110" style={{ backgroundImage: `url(${referenceImage})` }} />
                        )}
                        <div className="absolute inset-0 bg-black/40 animate-pulse" />
                        {error ? (
                            <div className="relative z-30 flex flex-col items-center p-4 text-center">
                                <span className="text-2xl mb-2">⚠️</span>
                                <span className="text-xs text-red-400 font-bold break-keep">{error}</span>
                                <button onClick={handleRegenerate} className="mt-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-xs text-white">다시 시도</button>
                            </div>
                        ) : (
                            <div className="relative z-30 flex flex-col items-center p-4 text-center w-full px-6">
                                <div className="relative w-12 h-12 mb-4">
                                    <div className="absolute inset-0 border-4 border-t-purple-500 border-r-blue-500 border-b-transparent border-l-transparent rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center text-xl animate-pulse">✨</div>
                                </div>
                                <span className={`text-xs font-bold text-white bg-black/60 px-3 py-2 rounded-lg backdrop-blur-md animate-fade-in-up border border-white/10 shadow-lg leading-relaxed break-keep ${statusOverride ? 'text-yellow-300 border-yellow-500/50' : ''}`}>
                                    {statusOverride || (isPlanning ? (planningMessage || "🧠 AI가 독창적인 컨셉을 구상 중입니다...") : activeMessages[msgIndex])}
                                </span>
                                {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums mt-1">{formatElapsed(elapsed)}</span>}
                            </div>
                        )}
                    </div>
                )}
                {imageUrl && isLoading && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-white border-b-transparent mb-2" />
                        <span className="text-xs text-white font-bold">{statusOverride || "재생성 중..."}</span>
                        {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums mt-1">{formatElapsed(elapsed)}</span>}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-4 border-t border-gray-700 bg-gray-800 divide-x divide-gray-700">
                <button onClick={() => imageUrl && onLightbox(imageUrl)} className="p-3 hover:bg-gray-700 flex justify-center text-gray-400 hover:text-white transition-colors disabled:opacity-30" title="크게 보기" disabled={!imageUrl}>🔍</button>
                <button onClick={handleRegenerate} className="p-3 hover:bg-gray-700 flex justify-center text-gray-400 hover:text-green-400 transition-colors disabled:opacity-30" title="재생성" disabled={isLoading || isPlanning}>🔄</button>
                <button onClick={handleDownload} className="p-3 hover:bg-gray-700 flex justify-center text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-30" title="다운로드" disabled={!imageUrl}>⬇️</button>
                <button onClick={() => { navigator.clipboard.writeText(prompt); showToast("프롬프트가 클립보드에 복사되었습니다.", 2000); }} className="p-3 hover:bg-gray-700 flex justify-center text-gray-400 hover:text-yellow-400 transition-colors" title="프롬프트 복사">📝</button>
            </div>

            <button
                onClick={() => onSelect(index)}
                disabled={!imageUrl}
                className={`w-full py-3 font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                    isSelected
                    ? 'bg-green-600 text-white hover:bg-green-500'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border-t border-gray-700 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed'
                }`}
            >
                {isSelected ? (<><span className="text-lg">✅</span> 선택됨</>) : (<><span className="w-4 h-4 rounded-full border border-current" /> 이 캐릭터 선택</>)}
            </button>
        </div>
    );
};
