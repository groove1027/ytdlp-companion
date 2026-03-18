
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCostStore } from '../stores/costStore';

const CostDashboard: React.FC = () => {
    const costStats = useCostStore((s) => s.costStats);
    const exchangeRate = useCostStore((s) => s.exchangeRate);
    const exchangeDate = useCostStore((s) => s.exchangeDate);
    const resetCosts = useCostStore((s) => s.resetCosts);

    const [highlight, setHighlight] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    // [FIX #561] 비용 초기화
    const handleReset = useCallback(() => {
        if (!confirmReset) { setConfirmReset(true); return; }
        resetCosts();
        setConfirmReset(false);
    }, [confirmReset, resetCosts]);

    useEffect(() => {
        if (confirmReset) {
            const t = setTimeout(() => setConfirmReset(false), 3000);
            return () => clearTimeout(t);
        }
    }, [confirmReset]);

    useEffect(() => {
        setHighlight(true);
        const timer = setTimeout(() => { setHighlight(false); }, 500);
        return () => clearTimeout(timer);
    }, [costStats.totalUsd]);

    // D-3: Memoize formatted values to avoid recalculation on every render
    const totalKRW = useMemo(() => costStats.totalUsd * exchangeRate, [costStats.totalUsd, exchangeRate]);
    const formattedKRW = useMemo(() => totalKRW.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [totalKRW]);
    const formattedExchangeRate = useMemo(() => exchangeRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [exchangeRate]);
    const formattedUsd = useMemo(() => costStats.totalUsd.toFixed(3), [costStats.totalUsd]);

    return (
        <div
            className="relative group flex items-center gap-2"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className={`
                flex items-center gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 rounded-full border transition-all duration-300 cursor-help select-none backdrop-blur-md
                ${highlight
                    ? 'bg-emerald-900/60 border-emerald-400 scale-105 shadow-[0_0_15px_rgba(52,211,153,0.4)]'
                    : 'bg-black/40 border-emerald-500/30 hover:bg-gray-800 hover:border-emerald-500/60'
                }
            `}>
                <span className="text-base md:text-lg animate-pulse-slow">💸</span>
                <span className="text-sm md:text-sm font-bold text-emerald-400 whitespace-nowrap hidden sm:inline-block">
                    실시간 제작 비용 :
                </span>
                <div className="flex items-baseline gap-0.5 md:gap-1 text-white font-mono font-bold">
                    <span className="text-emerald-500 text-sm md:text-base">￦</span>
                    <span className="text-base md:text-xl tracking-tight">{formattedKRW}</span>
                </div>
            </div>

            <span className="text-sm font-bold text-emerald-400 hidden md:inline-block border border-emerald-500/30 bg-emerald-900/20 px-2 py-1 rounded">
                ✓ 자동 저장됨
            </span>

            <div className={`
                absolute top-full left-0 mt-3 w-72 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl p-4 z-50 origin-top-left transition-all duration-200
                ${showTooltip ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}
            `}>
                <div className="absolute -top-1.5 left-6 w-3 h-3 bg-gray-700 border-t border-l border-gray-600 transform rotate-45"></div>
                <div className="flex justify-between items-start mb-3 pb-2 border-b border-gray-700">
                    <span className="text-sm font-bold text-white flex items-center gap-1 mt-1">
                        📊 상세 내역
                    </span>
                    <div className="flex flex-col items-end">
                        <span className="text-sm text-emerald-300 font-bold font-mono tracking-tight">
                            $1 = ￦{formattedExchangeRate}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium leading-tight mt-0.5 whitespace-pre-line text-right">
                            {exchangeDate || '환율 로딩 중...'}
                        </span>
                    </div>
                </div>

                <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">💵 USD 환산</span>
                        <span className="font-mono text-emerald-300 font-bold tracking-wide">$ {formattedUsd}</span>
                    </div>
                    <div className="w-full h-px bg-gray-800"></div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 flex items-center gap-1">🖼️ 이미지 생성</span>
                        <span className="font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full">{costStats.imageCount}장</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 flex items-center gap-1">🎬 영상 생성</span>
                        <span className="font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full">{costStats.videoCount}개</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 flex items-center gap-1">🧠 AI 기획/분석</span>
                        <span className="font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full">{costStats.analysisCount}회</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 flex items-center gap-1">🎤 TTS 음성</span>
                        <span className="font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full">{costStats.ttsCount ?? 0}건</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 flex items-center gap-1">🎵 음악 생성</span>
                        <span className="font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full">{costStats.musicCount ?? 0}곡</span>
                    </div>
                </div>
                {/* [FIX #561] 비용 초기화 버튼 */}
                {costStats.totalUsd > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-700">
                        <button
                            type="button"
                            onClick={handleReset}
                            className={`w-full text-xs py-1.5 rounded-lg font-bold transition-all ${
                                confirmReset
                                    ? 'bg-red-600/30 border border-red-500/50 text-red-300 hover:bg-red-600/50'
                                    : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
                            }`}
                        >
                            {confirmReset ? '정말 초기화할까요? (다시 클릭)' : '🔄 비용 초기화'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CostDashboard;
