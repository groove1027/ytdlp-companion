/* [v4.5] RemakeMode 주석처리 - 추후 복원 가능 */

// [v4.5] Placeholder export - RemakeMode 비활성화됨
import React from 'react';
export default function RemakeMode() { return null; }

// === ORIGINAL RemakeMode START ===
// 아래는 원본 코드의 주석 처리본입니다. 복원 시 주석을 해제하고 위의 placeholder를 삭제하세요.
// import React, { useState, useRef } from 'react';
// import { ProjectConfig, VideoFormat, VoiceName, ImageModel, VideoModel, AspectRatio } from '../../types';
// import { getXaiKey } from '../../services/apiService';
// import { splitVideoIntoSegments } from '../../utils/videoSegmentUtils';
// import { PRICING } from '../../constants';
// 
// interface RemakeModeProps {
//     onNext: (config: ProjectConfig) => void;
//     isLoading: boolean;
// }
// 
// const detectAspectRatio = (width: number, height: number): AspectRatio => {
//     const ratio = width / height;
//     if (ratio < 0.7) return AspectRatio.PORTRAIT;
//     if (ratio > 1.5) return AspectRatio.LANDSCAPE;
//     if (Math.abs(ratio - 1) < 0.15) return AspectRatio.SQUARE;
//     return ratio > 1 ? AspectRatio.CLASSIC : AspectRatio.PORTRAIT;
// };
// 
// const QUICK_STYLES = [
//     { label: '지브리 풍', prompt: 'Studio Ghibli anime style, hand-painted backgrounds, soft watercolor lighting' },
//     { label: '픽사 3D', prompt: 'Pixar 3D animation style, vibrant colors, smooth rendering' },
//     { label: '수채화', prompt: 'Delicate watercolor painting style, soft edges, flowing pigments' },
//     { label: '사이버펑크', prompt: 'Cyberpunk neon style, dark urban atmosphere, glowing lights' },
//     { label: '필름 누아르', prompt: 'Black and white film noir style, high contrast, dramatic shadows' },
//     { label: '레트로 애니', prompt: '90s retro anime style, cel-shaded, nostalgic color grading' },
//     { label: '유화', prompt: 'Classical oil painting style, rich textures, Renaissance lighting' },
// ];
// 
// const RemakeMode: React.FC<RemakeModeProps> = ({ onNext, isLoading }) => {
//     const [videoFile, setVideoFile] = useState<File | null>(null);
//     const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
//     const [v2vPrompt, setV2vPrompt] = useState('');
//     const [resolution, setResolution] = useState<'480p' | '720p'>('720p');
//     const [isDragOver, setIsDragOver] = useState(false);
//     const [detectedAspectRatio, setDetectedAspectRatio] = useState<AspectRatio | null>(null);
//     const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
// 
//     const videoInputRef = useRef<HTMLInputElement>(null);
// 
//     const hasXaiKey = !!getXaiKey();
// 
//     const processVideoFile = (file: File) => {
//         if (file.size > 200 * 1024 * 1024) return alert("200MB 이하 파일만 업로드할 수 있습니다.");
//         setVideoFile(file);
//         const url = URL.createObjectURL(file);
//         setVideoPreviewUrl(url);
// 
//         const video = document.createElement('video');
//         video.preload = 'metadata';
//         video.src = url;
//         video.onloadedmetadata = () => {
//             const detected = detectAspectRatio(video.videoWidth, video.videoHeight);
//             setDetectedAspectRatio(detected);
//             setDetectedDuration(isFinite(video.duration) ? video.duration : null);
//         };
//     };
// 
//     const handleClearVideo = () => {
//         setVideoFile(null);
//         setVideoPreviewUrl(null);
//         setDetectedAspectRatio(null);
//         setDetectedDuration(null);
//         if (videoInputRef.current) videoInputRef.current.value = '';
//     };
// 
//     const handleQuickStyle = (prompt: string) => {
//         setV2vPrompt(prev => prev ? `${prev}, ${prompt}` : prompt);
//     };
// 
//     const handleSubmit = (e: React.FormEvent) => {
//         e.preventDefault();
//         if (!videoFile) return alert("영상 파일을 업로드해주세요.");
//         if (!v2vPrompt.trim()) return alert("변환 스타일을 입력해주세요.");
// 
//         onNext({
//             mode: 'REMAKE',
//             script: v2vPrompt.trim(),
//             detectedStyleDescription: "",
//             detectedCharacterDescription: "",
//             imageModel: ImageModel.NANO_COST,
//             videoModel: VideoModel.GROK,
//             aspectRatio: detectedAspectRatio || AspectRatio.LANDSCAPE,
//             voice: VoiceName.KORE,
//             videoFormat: VideoFormat.SHORT,
//             creationMode: 'HYBRID',
//             allowInfographics: false,
//             uploadedVideoFile: videoFile,
//             v2vPrompt: v2vPrompt.trim(),
//             v2vResolution: resolution,
//             v2vOriginalDuration: detectedDuration || undefined,
//         });
//     };
// 
//     const canSubmit = videoFile && v2vPrompt.trim() && hasXaiKey && !isLoading;
// 
//     return (
//         <div className="space-y-6 animate-fade-in">
//             {/* Header */}
//             <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-xl p-5 shadow-lg">
//                 <h4 className="font-bold text-xl mb-2 text-white flex items-center gap-2">
//                     영상 스타일 변환 (V2V)
//                 </h4>
//                 <p className="text-sm text-gray-300 leading-relaxed">
//                     영상을 업로드하고 원하는 스타일을 설명하세요. AI가 영상 전체를 구간별로 스타일 변환합니다.
//                     긴 영상은 ~8초 단위로 자동 분할되어 병렬 변환됩니다.
//                 </p>
//             </div>
// 
//             <div className="space-y-6">
//                 {/* Step 1: Video Upload */}
//                 <div>
//                     <label className="block text-lg font-bold text-purple-400 mb-3">
//                         1단계. 원본 영상
//                     </label>
//                     <div
//                         onClick={() => videoInputRef.current?.click()}
//                         onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
//                         onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
//                         onDrop={(e) => {
//                             e.preventDefault(); setIsDragOver(false);
//                             if (e.dataTransfer.files?.[0]) processVideoFile(e.dataTransfer.files[0]);
//                         }}
//                         className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden bg-gray-900 ${isDragOver ? 'border-purple-500 bg-purple-900/20' : 'border-gray-600 hover:border-gray-400 hover:bg-gray-800'}`}
//                     >
//                         {videoPreviewUrl ? (
//                             <div className="relative w-full h-full">
//                                 <video src={videoPreviewUrl} className="w-full h-full object-contain" controls />
//                                 <button
//                                     onClick={(e) => { e.stopPropagation(); handleClearVideo(); }}
//                                     className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 hover:bg-red-700 shadow-md"
//                                 >
//                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
//                                 </button>
//                             </div>
//                         ) : (
//                             <div className="text-center p-6">
//                                 <p className="text-4xl mb-3">🎥</p>
//                                 <p className="text-lg font-bold text-gray-300">MP4/MOV 파일을 드래그하거나 클릭</p>
//                                 <p className="text-sm text-gray-500 mt-1">모든 길이의 영상 업로드 가능 (자동 구간 분할)</p>
//                             </div>
//                         )}
//                     </div>
//                     <input type="file" ref={videoInputRef} onChange={(e) => e.target.files?.[0] && processVideoFile(e.target.files[0])} accept="video/mp4,video/quicktime" className="hidden" />
// 
//                     {detectedAspectRatio && videoFile && (
//                         <div className="flex items-center gap-3 p-3 mt-3 bg-green-900/20 border border-green-500/30 rounded-lg">
//                             <span className="text-green-400 font-bold text-sm">화면 비율 자동 감지:</span>
//                             <span className="text-white font-bold">{detectedAspectRatio}</span>
//                         </div>
//                     )}
//                     {detectedDuration !== null && detectedDuration > 0 && videoFile && (() => {
//                         const segments = splitVideoIntoSegments('', detectedDuration);
//                         const segCount = segments.length;
//                         return (
//                             <div className="p-3 mt-3 bg-purple-900/20 border border-purple-500/30 rounded-lg space-y-1">
//                                 <p className="text-purple-300 font-bold text-sm">
//                                     영상 길이: {detectedDuration.toFixed(1)}초 → {segCount}개 구간으로 분할 변환됩니다
//                                 </p>
//                                 <p className="text-xs text-gray-400">
//                                     각 구간 ~8초 단위 · 병렬 변환으로 빠른 처리
//                                 </p>
//                             </div>
//                         );
//                     })()}
//                 </div>
// 
//                 {/* Step 2: Style Prompt */}
//                 <div>
//                     <label className="block text-lg font-bold text-purple-400 mb-3">
//                         2단계. 변환 스타일
//                     </label>
//                     <textarea
//                         value={v2vPrompt}
//                         onChange={(e) => setV2vPrompt(e.target.value)}
//                         placeholder="어떤 스타일로 바꿀까요? 예: Studio Ghibli anime style with soft watercolor lighting"
//                         rows={3}
//                         className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none resize-none transition-colors"
//                     />
// 
//                     <div className="mt-3">
//                         <p className="text-xs text-gray-400 mb-2">빠른 스타일 프리셋:</p>
//                         <div className="flex flex-wrap gap-2">
//                             {QUICK_STYLES.map((style) => (
//                                 <button
//                                     key={style.label}
//                                     type="button"
//                                     onClick={() => handleQuickStyle(style.prompt)}
//                                     className="px-3 py-1.5 text-xs rounded-full border border-purple-500/40 bg-purple-900/20 text-purple-300 hover:bg-purple-800/40 hover:border-purple-400 transition-all"
//                                 >
//                                     {style.label}
//                                 </button>
//                             ))}
//                         </div>
//                     </div>
//                 </div>
// 
//                 {/* Step 3: Resolution */}
//                 <div>
//                     <label className="block text-lg font-bold text-purple-400 mb-3">
//                         3단계. 해상도
//                     </label>
//                     <div className="flex gap-3">
//                         {(['480p', '720p'] as const).map((res) => (
//                             <button
//                                 key={res}
//                                 type="button"
//                                 onClick={() => setResolution(res)}
//                                 className={`px-6 py-2.5 rounded-lg border font-bold text-sm transition-all ${
//                                     resolution === res
//                                         ? 'bg-purple-600/30 border-purple-500 text-white'
//                                         : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
//                                 }`}
//                             >
//                                 {res} {resolution === res && '✓'}
//                             </button>
//                         ))}
//                     </div>
//                 </div>
// 
//                 {/* Cost Info */}
//                 <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-sm text-gray-300">
//                     {detectedDuration && detectedDuration > 0 ? (() => {
//                         const segments = splitVideoIntoSegments('', detectedDuration);
//                         const totalCost = segments.length * PRICING.VIDEO_XAI_V2V_PER_SEC * 8;
//                         return <p>💰 ${PRICING.VIDEO_XAI_V2V_PER_SEC}/초 × {segments.length}개 구간 ≈ ${totalCost.toFixed(2)} (총 {detectedDuration.toFixed(1)}초)</p>;
//                     })() : (
//                         <p>💰 약 ${PRICING.VIDEO_XAI_V2V_PER_SEC}/초 (구간당 약 8초)</p>
//                     )}
//                 </div>
//             </div>
// 
//             {/* Submit */}
//             <div className="pt-4 border-t border-gray-700 space-y-3">
//                 <button
//                     onClick={handleSubmit}
//                     disabled={!canSubmit}
//                     className={`w-full py-4 rounded-xl font-bold text-xl shadow-2xl transition-all transform flex items-center justify-center gap-3 ${
//                         canSubmit ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02]' : 'bg-gray-700 text-gray-400 cursor-not-allowed'
//                     }`}
//                 >
//                     {isLoading ? '변환 준비 중...' : '🚀 변환 시작'}
//                 </button>
//                 {!hasXaiKey && (
//                     <p className="text-center text-xs text-yellow-400">
//                         ⚠️ xAI API 키가 필요합니다. 좌측 메뉴(≡) → [⚙️ API 설정]에서 입력하세요.
//                     </p>
//                 )}
//             </div>
//         </div>
//     );
// };
// 
// export default RemakeMode;
// === ORIGINAL RemakeMode END ===
