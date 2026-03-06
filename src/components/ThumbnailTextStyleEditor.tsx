import React, { useState } from 'react';
import { Thumbnail } from '../types';
import { THUMBNAIL_TEXT_PRESETS, THUMBNAIL_FONT_HINTS } from '../constants';

const FIXED_NEON_COLORS = ["#68ff34", "#41fff6", "#fefc15", "#FFFFFF", "#ff3366", "#ff9900"];

const POSITION_OPTIONS = [
    { id: 'bottom-center', label: '하단 중앙', icon: '⬇️' },
    { id: 'top', label: '상단', icon: '⬆️' },
    { id: 'center', label: '중앙', icon: '🎯' },
    { id: 'right', label: '우측', icon: '➡️' },
];

interface ThumbnailTextStyleEditorProps {
    thumb: Thumbnail;
    onSubmit: (text: string, presetId: string, fontHintId: string, color: string, position: string, scale: number) => void;
    onCancel: () => void;
}

const ThumbnailTextStyleEditor: React.FC<ThumbnailTextStyleEditorProps> = ({ thumb, onSubmit, onCancel }) => {
    const [text, setText] = useState(thumb.textOverlay || '');
    const [presetId, setPresetId] = useState(thumb.textPreset || 'sticker');
    const [fontHintId, setFontHintId] = useState(thumb.fontHint || 'gothic');
    const [color, setColor] = useState(thumb.primaryColorHex || '#FFFFFF');
    const [customColor, setCustomColor] = useState('');
    const [position, setPosition] = useState(thumb.textPosition || 'bottom-center');
    const [scale, setScale] = useState(thumb.textScale || 1.2);

    const handleSubmit = () => {
        if (!text.trim()) return;
        onSubmit(text.trim(), presetId, fontHintId, customColor || color, position, scale);
    };

    return (
        <div className="flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar p-1">
            {/* 문구 입력 */}
            <div>
                <label className="text-sm text-gray-400 font-bold mb-1 block">문구</label>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="썸네일에 표시할 문구..."
                    rows={2}
                    className="w-full bg-gray-800 border border-orange-500/50 rounded p-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
            </div>

            {/* 텍스트 이펙트 프리셋 */}
            <div>
                <label className="text-sm text-gray-400 font-bold mb-1 block">텍스트 이펙트</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {THUMBNAIL_TEXT_PRESETS.map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => setPresetId(preset.id)}
                            className={`text-left px-2 py-1.5 rounded border text-sm font-bold transition-all flex items-center gap-1.5 ${
                                presetId === preset.id
                                    ? 'border-orange-500 bg-orange-600/20 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.3)]'
                                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                            }`}
                        >
                            <span className="text-sm">{preset.emoji}</span>
                            <span>{preset.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 폰트 힌트 */}
            <div>
                <label className="text-sm text-gray-400 font-bold mb-1 block">폰트 스타일</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {THUMBNAIL_FONT_HINTS.map(hint => (
                        <button
                            key={hint.id}
                            onClick={() => setFontHintId(hint.id)}
                            className={`shrink-0 px-2.5 py-1 rounded-full border text-sm font-bold transition-all ${
                                fontHintId === hint.id
                                    ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500'
                            }`}
                        >
                            {hint.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 색상 선택 */}
            <div>
                <label className="text-sm text-gray-400 font-bold mb-1 block">텍스트 색상</label>
                <div className="flex items-center gap-2">
                    {FIXED_NEON_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); setCustomColor(''); }}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                                color === c && !customColor
                                    ? 'border-white scale-125 shadow-[0_0_8px_rgba(255,255,255,0.5)]'
                                    : 'border-gray-600 hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    <input
                        type="color"
                        value={customColor || color}
                        onChange={(e) => setCustomColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border border-gray-600"
                        title="커스텀 색상"
                    />
                    {customColor && (
                        <span className="text-xs text-gray-400 font-mono">{customColor}</span>
                    )}
                </div>
            </div>

            {/* 위치 + 스케일 */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-sm text-gray-400 font-bold mb-1 block">위치</label>
                    <div className="grid grid-cols-2 gap-1">
                        {POSITION_OPTIONS.map(pos => (
                            <button
                                key={pos.id}
                                onClick={() => setPosition(pos.id)}
                                className={`px-2 py-1 rounded border text-xs font-bold transition-all flex items-center gap-1 ${
                                    position === pos.id
                                        ? 'border-purple-500 bg-purple-600/20 text-purple-300'
                                        : 'border-gray-700 bg-gray-800/50 text-gray-500 hover:border-gray-500'
                                }`}
                            >
                                <span>{pos.icon}</span> {pos.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1">
                    <label className="text-sm text-gray-400 font-bold mb-1 block">
                        크기 <span className="text-orange-400">{scale.toFixed(1)}x</span>
                    </label>
                    <input
                        type="range"
                        min="0.8"
                        max="2.0"
                        step="0.1"
                        value={scale}
                        onChange={(e) => setScale(parseFloat(e.target.value))}
                        className="w-full accent-orange-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>작게</span>
                        <span>크게</span>
                    </div>
                </div>
            </div>

            {/* 안내 */}
            <div className="bg-yellow-900/20 border border-yellow-700/30 p-2 rounded text-xs text-yellow-200 leading-tight">
                AI가 선택한 이펙트/폰트/색상을 프롬프트에 반영하여 직접 렌더링합니다. 결과는 AI 해석에 따라 다를 수 있습니다.
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 mt-1">
                <button
                    onClick={onCancel}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-sm font-bold text-gray-300"
                >
                    취소
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!text.trim()}
                    className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 py-2 rounded text-sm font-bold text-white shadow-lg transition-all"
                >
                    스타일 적용 생성
                </button>
            </div>
        </div>
    );
};

export default ThumbnailTextStyleEditor;
