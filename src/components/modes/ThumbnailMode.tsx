
import React, { useState, useRef } from 'react';
import { ProjectConfig, AspectRatio, VideoFormat, VideoModel, ImageModel, VoiceName } from '../../types';
import VisualStylePicker, { getVisualStyleLabel } from '../VisualStylePicker';
import { resizeImage } from '../../services/imageProcessingService';
import { showToast } from '../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';

interface ThumbnailModeProps {
    onSubmit: (config: ProjectConfig) => void;
    isLoading: boolean;
}

const ThumbnailMode: React.FC<ThumbnailModeProps> = ({ onSubmit, isLoading }) => {
    const elapsed = useElapsedTimer(isLoading);

    // 대본 입력
    const [script, setScript] = useState('');

    // 영상 형식 (롱폼 16:9 / 숏폼 9:16)
    const [videoFormat, setVideoFormat] = useState<'long' | 'short'>('long');

    // 스타일 선택
    const [atmosphere, setAtmosphere] = useState('');
    // expandedStyleCategory state moved into VisualStylePicker

    // 캐릭터 이미지 (선택)
    const [charImageBase64, setCharImageBase64] = useState<string | undefined>();
    const [charDescription, setCharDescription] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processImageFile = async (file: File) => {
        try {
            const base64 = await resizeImage(file, 768, 'image/png');
            setCharImageBase64(base64);
        } catch (e) {
            console.error("Image processing failed", e);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalScript = script.trim();
        if (!finalScript) { showToast("썸네일에 사용할 대본을 입력해주세요."); return; }

        onSubmit({
            mode: 'THUMBNAIL',
            script: finalScript,
            videoFormat: videoFormat === 'long' ? VideoFormat.LONG : VideoFormat.SHORT,
            atmosphere: atmosphere.trim(),
            characterImage: charImageBase64,
            detectedCharacterDescription: charDescription,
            isThumbnailOnlyMode: true,
            // 기본값 설정 (ThumbnailGenerator에서 필요)
            detectedStyleDescription: atmosphere.trim() || 'Cinematic',
            imageModel: ImageModel.NANO_COST,
            videoModel: VideoModel.VEO,
            aspectRatio: videoFormat === 'long' ? AspectRatio.LANDSCAPE : AspectRatio.PORTRAIT,
            voice: VoiceName.KORE,
        });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* 안내 배너 */}
            <div className="bg-pink-900/20 border border-pink-700/50 rounded-lg p-4 text-base text-pink-200">
                <span className="text-lg mr-1">🖼️</span>
                <strong>썸네일 전용 모드:</strong> 영상 없이 바이럴 썸네일만 빠르게 생성합니다.
                대본과 스타일을 설정하면 AI가 4가지 컨셉을 제안하고, 원하는 썸네일을 고퀄리티로 생성합니다.
            </div>

            {/* 1. 대본 입력 */}
            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2 flex items-center gap-2">
                    1. 대본 입력
                    <span className="text-sm bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">필수</span>
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                    영상의 주제나 대본을 입력하세요. AI가 대본을 분석하여 바이럴 썸네일 컨셉을 생성합니다.
                </p>
                <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="썸네일에 반영할 대본이나 영상 주제를 입력하세요...&#10;&#10;예시: 오늘 드디어 테슬라 모델Y를 출고했습니다. 3개월간의 기다림 끝에..."
                    className="w-full h-48 bg-gray-900 border border-gray-600 rounded-lg p-4 text-white focus:border-pink-500 outline-none resize-none text-base leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                    <span className="text-sm text-gray-500">{script.length}자</span>
                </div>
            </div>

            {/* 2. 영상 형식 */}
            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
                    2. 썸네일 형식
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => setVideoFormat('long')}
                        className={`p-4 rounded-xl border-2 transition-all text-center ${
                            videoFormat === 'long'
                                ? 'border-pink-500 bg-pink-900/20 shadow-[0_0_15px_rgba(236,72,153,0.2)]'
                                : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                        }`}
                    >
                        <div className="text-3xl mb-2">🖥️</div>
                        <div className={`text-base font-bold ${videoFormat === 'long' ? 'text-pink-300' : 'text-gray-300'}`}>
                            가로형 (16:9)
                        </div>
                        <div className="text-sm text-gray-400 mt-1">유튜브 썸네일</div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setVideoFormat('short')}
                        className={`p-4 rounded-xl border-2 transition-all text-center ${
                            videoFormat === 'short'
                                ? 'border-pink-500 bg-pink-900/20 shadow-[0_0_15px_rgba(236,72,153,0.2)]'
                                : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                        }`}
                    >
                        <div className="text-3xl mb-2">📱</div>
                        <div className={`text-base font-bold ${videoFormat === 'short' ? 'text-pink-300' : 'text-gray-300'}`}>
                            세로형 (9:16)
                        </div>
                        <div className="text-sm text-gray-400 mt-1">쇼츠/릴스 썸네일</div>
                    </button>
                </div>
            </div>

            {/* 3. 비주얼 스타일 */}
            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
                    3. 비주얼 스타일 (선택)
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                    썸네일의 분위기를 결정합니다. 선택하지 않으면 대본 내용에 맞게 자동 결정됩니다. 🔍 미리보기 이미지를 클릭하면 크게 확인할 수 있습니다.
                </p>

                {atmosphere && (
                    <div className="bg-pink-900/20 border border-pink-500/30 rounded-lg p-3 flex justify-between items-center animate-fade-in mb-4">
                        <span className="text-sm text-pink-200 font-bold truncate pr-4">
                            🎨 선택됨: {getVisualStyleLabel(atmosphere) || "직접 입력"}
                        </span>
                        <button onClick={() => setAtmosphere('')} className="text-sm text-red-400 hover:text-red-300 underline shrink-0">초기화</button>
                    </div>
                )}

                <VisualStylePicker value={atmosphere} onChange={setAtmosphere} colorTheme="pink" />

                <textarea
                    value={atmosphere}
                    onChange={(e) => setAtmosphere(e.target.value)}
                    placeholder="스타일 버튼을 클릭하거나, 원하는 분위기를 직접 묘사하세요..."
                    className="w-full h-20 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-base focus:border-pink-500 outline-none resize-none leading-relaxed"
                />
            </div>

            {/* 4. 캐릭터 이미지 (선택) */}
            <div className="border border-gray-700 rounded-xl p-6 bg-gray-800">
                <h3 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-2">
                    4. 캐릭터 이미지 (선택)
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                    썸네일에 등장시킬 캐릭터가 있다면 이미지를 업로드하세요. 없으면 건너뛰어도 됩니다.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                        onDrop={(e) => {
                            e.preventDefault(); setIsDragOver(false);
                            if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]);
                        }}
                        className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${
                            isDragOver ? 'border-pink-500 bg-pink-900/20' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800'
                        }`}
                    >
                        {charImageBase64 ? (
                            <div className="relative w-full h-full">
                                <img src={charImageBase64} className="w-full h-full object-contain" alt="Character" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); setCharImageBase64(undefined); }}
                                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-md z-10"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className="text-4xl mb-2">📸</span>
                                <span className="text-base font-bold text-gray-400">이미지 드래그 또는 클릭</span>
                                <span className="text-sm text-gray-500 mt-1">PNG, JPG 지원</span>
                            </>
                        )}
                    </div>
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processImageFile(e.target.files[0])} accept="image/*" className="hidden" />

                    <div>
                        <label className="block text-base font-bold text-gray-400 mb-2">캐릭터 설명 (선택)</label>
                        <textarea
                            value={charDescription}
                            onChange={(e) => setCharDescription(e.target.value)}
                            placeholder="캐릭터의 특징을 간단히 설명하세요...&#10;예: 30대 남성, 검은 정장, 짧은 머리"
                            className="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-base focus:border-pink-500 outline-none resize-none"
                        />
                    </div>
                </div>
            </div>

            {/* 시작 버튼 */}
            <button
                type="submit"
                onClick={handleSubmit}
                disabled={isLoading || !script.trim()}
                className={`w-full py-4 rounded-xl font-bold text-lg shadow-2xl transition-all flex items-center justify-center gap-2 ${
                    isLoading || !script.trim()
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white transform hover:scale-[1.02]'
                }`}
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        썸네일 준비 중...
                        {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
                    </>
                ) : (
                    <>
                        <span>🖼️</span> 썸네일 생성 시작
                    </>
                )}
            </button>
        </div>
    );
};

export default ThumbnailMode;
