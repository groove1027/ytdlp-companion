import React, { useState, useRef, useEffect, useCallback } from 'react';
import { applyCanvasFilters } from '../services/imageProcessingService';

interface ThumbnailPostProcessorProps {
    imageUrl: string;
    onApply: (processedBase64: string) => void;
    onCancel: () => void;
}

const DEFAULT_FILTERS = { brightness: 1, contrast: 1, saturate: 1, vignette: 0 };

const ThumbnailPostProcessor: React.FC<ThumbnailPostProcessorProps> = ({ imageUrl, onApply, onCancel }) => {
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
    const [isApplying, setIsApplying] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    // 이미지 로드 & 실시간 프리뷰
    const renderPreview = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !img.complete) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // CSS filter
        ctx.filter = `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturate})`;
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';

        // Vignette
        if (filters.vignette > 0) {
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const radius = Math.max(cx, cy);
            const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${filters.vignette})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }, [filters]);

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            imgRef.current = img;
            renderPreview();
        };
        img.src = imageUrl;
    }, [imageUrl, renderPreview]);

    useEffect(() => {
        renderPreview();
    }, [filters, renderPreview]);

    const updateFilter = (key: keyof typeof filters, value: number) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleReset = () => {
        setFilters({ ...DEFAULT_FILTERS });
    };

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const result = await applyCanvasFilters(imageUrl, filters);
            onApply(result);
        } catch (err) {
            console.error('Post-processing failed:', err);
            onCancel();
        } finally {
            setIsApplying(false);
        }
    };

    const sliders = [
        { key: 'brightness' as const, label: '밝기', min: 0.5, max: 1.5, step: 0.05, icon: '☀️' },
        { key: 'contrast' as const, label: '대비', min: 0.5, max: 2.0, step: 0.05, icon: '🔲' },
        { key: 'saturate' as const, label: '채도', min: 0, max: 2.0, step: 0.05, icon: '🎨' },
        { key: 'vignette' as const, label: '비네팅', min: 0, max: 1, step: 0.05, icon: '🔘' },
    ];

    return (
        <div className="flex flex-col gap-3 h-full p-1">
            {/* 미리보기 */}
            <div className="relative bg-black rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center" style={{ minHeight: '120px', maxHeight: '200px' }}>
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-[200px] object-contain"
                />
            </div>

            {/* 슬라이더 */}
            <div className="flex flex-col gap-2">
                {sliders.map(s => (
                    <div key={s.key} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">{s.icon}</span>
                        <span className="text-sm text-gray-400 font-bold w-12 shrink-0">{s.label}</span>
                        <input
                            type="range"
                            min={s.min}
                            max={s.max}
                            step={s.step}
                            value={filters[s.key]}
                            onChange={(e) => updateFilter(s.key, parseFloat(e.target.value))}
                            className="flex-1 accent-blue-500"
                        />
                        <span className="text-sm text-gray-300 font-mono w-10 text-right">
                            {filters[s.key].toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 mt-1">
                <button
                    onClick={handleReset}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold text-gray-300"
                >
                    리셋
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-1.5 rounded text-sm font-bold text-gray-300"
                >
                    취소
                </button>
                <button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 py-1.5 rounded text-sm font-bold text-white shadow-lg"
                >
                    {isApplying ? '적용 중...' : '후처리 적용'}
                </button>
            </div>
        </div>
    );
};

export default ThumbnailPostProcessor;
