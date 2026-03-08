/* [v4.5] CharacterMode 주석처리 - 추후 복원 가능 */

// [v4.5] Placeholder export - CharacterMode 비활성화됨
import React from 'react';
export default function CharacterMode() { return null; }

// === ORIGINAL CharacterMode START ===
// 아래는 원본 코드의 주석 처리본입니다. 복원 시 주석을 해제하고 위의 placeholder를 삭제하세요.
// import React, { useState, useRef, useEffect, useMemo } from 'react';
// import { AspectRatio, ProjectConfig, ImageModel, VideoFormat, VideoModel, CharacterAppearance, VoiceName, CharacterDraft } from '../../types';
// import { CHARACTER_LIBRARY, IMAGE_MODELS, PRICING, CHARACTER_STYLES } from '../../constants';
// import { uploadMediaToHosting } from '../../services/uploadService';
// // [REMOVED] Direct image generation import — uses Kie/Evolink via CharacterGenCard
// import { generateCharacterVariations, analyzeImageUnified } from '../../services/geminiService';
// import ImageLightbox from '../ImageLightbox';
// import { logger } from '../../services/LoggerService';
// import { CharacterGenCard } from './CharacterGenCard'; // [NEW] Import Child Component
// // JSZip loaded dynamically at usage site
// import { resizeImage, base64ToFile } from '../../services/imageProcessingService'; 
// import { getRemoveBgKey } from '../../services/apiService';
// import { removeBackground } from '../../services/removeBgService';
// 
// interface CharacterModeProps {
//     onNext: (config: ProjectConfig) => void;
//     isLoading: boolean;
//     onSetProcessing: (active: boolean, message?: string, mode?: string) => void;
//     onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void;
//     onLinkToScript: (image: string, publicUrl?: string) => void; 
//     onSaveDraft?: (draftConfig: Partial<ProjectConfig>) => void;
//     initialDraft?: CharacterDraft | null;
// }
// 
// type CharacterPath = 'LIBRARY' | 'MIXER' | 'TWIST';
// 
// // [NEW] Context-Aware Loading Messages
// const TWIST_MESSAGES = [
//     "🌀 1단계: 원본의 얼굴 특징(눈, 코, 입)을 정밀 분석하고 있습니다...",
//     "🎭 2단계: 기존 화풍은 유지하되, 헤어스타일과 의상에 새로운 변주를 주고 있습니다...",
//     "💃 3단계: 캐릭터의 자세(Pose)를 자연스럽게 조정하여 전신을 스케치 중입니다...",
//     "👢 4단계: 머리부터 발끝까지 잘림 없는 풀샷(Full-body)으로 렌더링합니다..."
// ];
// 
// const MIXER_MESSAGES = [
//     "⚗️ 1단계: 두 가지 키워드(A+B)의 화학적 결합을 시뮬레이션 중입니다...",
//     "🦁 2단계: 전혀 새로운 종족(Chimera)의 외형을 디자인하고 있습니다...",
//     "👗 3단계: 독창적인 실루엣과 의상 디테일을 생성하고 있습니다...",
//     "👠 4단계: 전신이 온전히 보이도록 구도를 최적화하고 있습니다..."
// ];
// 
// const LIBRARY_MESSAGES = [
//     "📖 1단계: 선택하신 캐릭터의 핵심 특징(Signature)을 불러오고 있습니다...",
//     "💡 2단계: 가장 매력적인 조명과 배경을 세팅하여 촬영을 준비 중입니다...",
//     "🕺 3단계: 캐릭터의 성격이 드러나는 포즈를 연출하고 있습니다...",
//     "👟 4단계: 머리부터 신발까지 디테일을 놓치지 않고 렌더링합니다..."
// ];
// 
// const PLANNING_MESSAGE = "🧠 AI가 4가지 독창적인 컨셉을 구상 중입니다... (창의성 발휘 중)";
// 
// const getCategoryGuide = (categoryName: string) => {
//     if (categoryName.includes('밈')) return { tone: '🤣 코미디/예능', desc: "유튜브 쇼츠, 틱톡 패러디, 병맛 더빙 영상에 최적화되어 있습니다.", colors: "from-yellow-600 to-orange-600" };
//     if (categoryName.includes('히어로')) return { tone: '🦸‍♂️ 액션/블록버스터', desc: "압도적인 스케일과 영웅적인 서사에 어울리는 캐릭터들입니다.", colors: "from-blue-600 to-red-600" };
//     if (categoryName.includes('빌런')) return { tone: '🦹 다크/느와르', desc: "강렬한 카리스마와 어두운 분위기를 연출하기 좋습니다.", colors: "from-purple-800 to-gray-900" };
//     if (categoryName.includes('호러') || categoryName.includes('몬스터') || categoryName.includes('슬래셔')) return { tone: '👻 공포/스릴러', desc: "긴장감 넘치는 공포물이나 할로윈 콘텐츠에 적합합니다.", colors: "from-red-900 to-black" };
//     if (categoryName.includes('동화')) return { tone: '🧚 판타지/동화', desc: "몽환적이고 아름다운 이야기, 혹은 잔혹 동화에 어울립니다.", colors: "from-pink-500 to-purple-400" };
//     if (categoryName.includes('SF') || categoryName.includes('로봇') || categoryName.includes('외계인')) return { tone: '👽 SF/미래', desc: "미래지향적이고 기술적인 분위기의 콘텐츠에 최적화되어 있습니다.", colors: "from-cyan-600 to-blue-800" };
//     return { tone: '✨ 다목적 캐릭터', desc: "다양한 장르에 무난하게 어울리는 캐릭터들입니다.", colors: "from-gray-600 to-gray-800" };
// };
// 
// // [NEW] Helper for Category Emoji
// const getCategoryEmoji = (category: string) => {
//     if (category.includes('밈')) return '🤣';
//     if (category.includes('히어로')) return '🦸‍♂️';
//     if (category.includes('빌런')) return '🦹';
//     if (category.includes('애니메이션')) return '📺';
//     if (category.includes('게임')) return '🎮';
//     if (category.includes('판타지')) return '🧚';
//     if (category.includes('몬스터')) return '👹';
//     if (category.includes('슬래셔')) return '🔪';
//     if (category.includes('로봇')) return '🤖';
//     if (category.includes('공상과학')) return '👽';
//     if (category.includes('동물')) return '🐾';
//     if (category.includes('음식')) return '🍔';
//     if (category.includes('사물')) return '📦';
//     if (category.includes('직업')) return '👮';
//     if (category.includes('스포츠')) return '⚽';
//     if (category.includes('신화')) return '⚡';
//     if (category.includes('특수부대')) return '🔫';
//     if (category.includes('동화')) return '👸';
//     if (category.includes('장난감')) return '🧸';
//     if (category.includes('아포칼립스')) return '☢️';
//     return '📁';
// };
// 
// // Interface for Generation Config
// interface GenResult {
//     id: string; 
//     url: string;
//     prompt: string;
// }
// 
// // [NEW] Remove.bg Tip Component (Updated)
// const RemoveBgTip = () => {
//     const hasKey = !!getRemoveBgKey();
//     return (
//         <div className={`mt-3 border rounded-lg p-3 flex flex-col md:flex-row items-center justify-between gap-3 animate-fade-in ${hasKey ? 'bg-green-900/30 border-green-500/30' : 'bg-amber-900/30 border-amber-500/30'}`}>
//             <div className={`text-xs leading-relaxed ${hasKey ? 'text-green-100/90' : 'text-amber-100/90'}`}>
//                 <span className="text-lg mr-1">{hasKey ? '✅' : '💡'}</span>
//                 {hasKey 
//                     ? <>
//                         <strong>자동 누끼 제거 활성화됨:</strong> 이미지 업로드 시 AI가 자동으로 배경을 지워줍니다. (월 50회 무료)<br/>
//                         <span className="block mt-1 opacity-80">* 자주 사용하는 캐릭터는 <strong>[PNG 저장]</strong>을 눌러 보관해 주세요!</span>
//                       </>
//                     : <><strong>꿀팁:</strong> 배경이 제거된 캐릭터 이미지를 사용하면, AI 인식률이 대폭 상승합니다! (API 설정에서 키 등록)</>
//                 }
//             </div>
//             {!hasKey && (
//                 <button 
//                     onClick={() => window.open('https://www.remove.bg/ko', '_blank')}
//                     className="flex-shrink-0 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg transition-colors flex items-center gap-1 whitespace-nowrap"
//                 >
//                     ✂️ 무료 누끼 따기 (remove.bg)
//                 </button>
//             )}
//         </div>
//     );
// };
// 
// const CharacterMode: React.FC<CharacterModeProps> = ({ onNext, isLoading, onSetProcessing, onCostAdd, onLinkToScript, onSaveDraft, initialDraft }) => {
//     // === STATE: MAIN FLOW ===
//     const [selectedPath, setSelectedPath] = useState<CharacterPath>('TWIST'); 
//     
//     // [UPDATED] State stores only configuration and final results
//     const [generatedResults, setGeneratedResults] = useState<GenResult[]>([]); 
//     const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null);
//     
//     // === STATE: LIGHTBOX ===
//     const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
// 
//     // === STATE: STYLE SELECTOR ===
//     const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
//     const [activeStyleCategory, setActiveStyleCategory] = useState<string>(CHARACTER_STYLES[0].category);
//     
//     // === STATE: LIBRARY MODE ===
//     const [selectedCategory, setSelectedCategory] = useState<string>(Object.keys(CHARACTER_LIBRARY)[0]);
//     const [searchQuery, setSearchQuery] = useState('');
//     const [librarySelection, setLibrarySelection] = useState<string>('');
//     
//     // [NEW] Imported Image State (Drag & Drop / Paste)
//     const [uploadedLibraryImage, setUploadedLibraryImage] = useState<string | null>(null);
//     const [uploadedLibraryPublicUrl, setUploadedLibraryPublicUrl] = useState<string | null>(null); 
//     const [isDragOverLibrary, setIsDragOverLibrary] = useState(false);
//     
//     // === STATE: MIXER MODE ===
//     const [mixerKeyword1, setMixerKeyword1] = useState('');
//     const [mixerKeyword2, setMixerKeyword2] = useState('');
// 
//     // === STATE: TWIST MODE ===
//     const [twistImageBase64, setTwistImageBase64] = useState<string | null>(null);
//     const [twistPublicUrl, setTwistPublicUrl] = useState<string | null>(null);
//     const [twistMode, setTwistMode] = useState<'RANDOM' | 'CUSTOM'>('RANDOM');
//     const [twistCustomStyle, setTwistCustomStyle] = useState('');
//     const [isDragOverTwist, setIsDragOverTwist] = useState(false);
//     
//     // === STATE: ANALYSIS ===
//     const [isAnalyzing, setIsAnalyzing] = useState(false);
//     const [detectedStyle, setDetectedStyle] = useState<string>('');
//     const [detectedCharacter, setDetectedCharacter] = useState<string>('');
// 
//     // [NEW] Background Removal States
//     const [isRemovingBgTwist, setIsRemovingBgTwist] = useState(false);
//     const [isRemovingBgLibrary, setIsRemovingBgLibrary] = useState(false);
//     
//     // === SHARED OPTIONS ===
//     // [UPDATED] Default AspectRatio is now PORTRAIT (9:16) for full body shots
//     const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.PORTRAIT);
//     const [imageModel, setImageModel] = useState<ImageModel>(ImageModel.NANO_COST); 
//     
//     const isInitialLoadDone = useRef(false);
//     const fileInputRef = useRef<HTMLInputElement>(null);
//     const latestResultsRef = useRef<GenResult[]>([]);
// 
//     // Keep ref in sync for unmount cleanup
//     useEffect(() => {
//         latestResultsRef.current = generatedResults;
//     }, [generatedResults]);
// 
//     // Generate a meaningful project title based on current mode
//     const generateCharacterTitle = (): string => {
//         if (selectedPath === 'LIBRARY' && librarySelection) {
//             return `캐릭터: ${librarySelection}`;
//         }
//         if (selectedPath === 'MIXER' && mixerKeyword1 && mixerKeyword2) {
//             return `하이브리드: ${mixerKeyword1} × ${mixerKeyword2}`;
//         }
//         if (selectedPath === 'TWIST' && detectedCharacter) {
//             return `변형: ${detectedCharacter.substring(0, 30)}`;
//         }
//         if (selectedPath === 'TWIST') {
//             return '캐릭터 변형';
//         }
//         return '캐릭터 디자인';
//     };
// 
//     // Immediate save helper (no debounce)
//     const saveDraftImmediate = (results: GenResult[]) => {
//         if (results.length > 0 && onSaveDraft) {
//             onSaveDraft({
//                 characterDraft: {
//                     results,
//                     selectedIndex: selectedResultIndex,
//                     uploadedImage: twistImageBase64 || uploadedLibraryImage || undefined,
//                     mode: selectedPath,
//                     aspectRatio: aspectRatio,
//                     characterTitle: generateCharacterTitle(),
//                 } as any
//             });
//         }
//     };
// 
//     useEffect(() => {
//         if (initialDraft && !isInitialLoadDone.current) {
//             // [COMPATIBILITY] Map old draft format
//             const safeResults = (initialDraft.results || []).map((r: any, idx: number) => ({
//                 id: r.id || `draft-${Date.now()}-${idx}`,
//                 url: r.url || '',
//                 prompt: r.prompt || ''
//             }));
//             
//             setGeneratedResults(safeResults);
//             setSelectedResultIndex(initialDraft.selectedIndex);
//             
//             if ((initialDraft as any).aspectRatio) {
//                 setAspectRatio((initialDraft as any).aspectRatio);
//             }
// 
//             if (initialDraft.uploadedImage) {
//                 if (initialDraft.mode === 'TWIST') {
//                     setTwistImageBase64(initialDraft.uploadedImage);
//                     setSelectedPath('TWIST');
//                 } else if (initialDraft.mode === 'LIBRARY') {
//                     setUploadedLibraryImage(initialDraft.uploadedImage);
//                     setSelectedPath('LIBRARY');
//                 }
//             }
//             isInitialLoadDone.current = true;
//         }
//     }, [initialDraft]);
// 
//     // Unmount: flush latest results to prevent data loss on back navigation
//     useEffect(() => {
//         return () => {
//             if (latestResultsRef.current.length > 0 && onSaveDraft) {
//                 onSaveDraft({
//                     characterDraft: {
//                         results: latestResultsRef.current,
//                         selectedIndex: selectedResultIndex,
//                         uploadedImage: twistImageBase64 || uploadedLibraryImage || undefined,
//                         mode: selectedPath,
//                         aspectRatio: aspectRatio,
//                         characterTitle: generateCharacterTitle(),
//                     } as any
//                 });
//             }
//         };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, []);
// 
//     // Save Draft Logic (debounced backup — immediate save handles critical moments)
//     useEffect(() => {
//         const timer = setTimeout(() => {
//             if (generatedResults.length > 0 && onSaveDraft) {
//                 onSaveDraft({
//                     characterDraft: {
//                         results: generatedResults,
//                         selectedIndex: selectedResultIndex,
//                         uploadedImage: twistImageBase64 || uploadedLibraryImage || undefined,
//                         mode: selectedPath,
//                         aspectRatio: aspectRatio,
//                         characterTitle: generateCharacterTitle(),
//                     } as any
//                 });
//             }
//         }, 2000);
//         return () => clearTimeout(timer);
//     }, [generatedResults, selectedResultIndex, onSaveDraft, twistImageBase64, uploadedLibraryImage, selectedPath, aspectRatio]);
// 
//     const filteredItems = useMemo(() => {
//         return (CHARACTER_LIBRARY as any)[selectedCategory]
//             .filter((c: string) => c.toLowerCase().includes(searchQuery.toLowerCase()));
//     }, [selectedCategory, searchQuery]);
// 
//     const downloadImage = (base64: string, filename: string) => {
//         const link = document.createElement('a');
//         link.href = base64;
//         link.download = filename;
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//     };
// 
//     const handleLibraryImageProcess = async (file: File) => {
//         try {
//             // [OPTIMISTIC UI] 1. 즉시 원본 표시
//             const originalBase64 = await resizeImage(file, 768, 'image/png');
//             setUploadedLibraryImage(originalBase64);
// 
//             let processedFile = file;
//             
//             // 2. 배경 제거 시도
//             if (getRemoveBgKey()) {
//                 setIsRemovingBgLibrary(true);
//                 try {
//                     processedFile = await removeBackground(file);
//                     // [OPTIMISTIC UI] 3. 이미지 교체 (Silent Swap)
//                     const processedBase64 = await resizeImage(processedFile, 768, 'image/png');
//                     setUploadedLibraryImage(processedBase64);
//                 } catch (bgError) {
//                     console.warn("Background removal failed, using original.", bgError);
//                 } finally {
//                     setIsRemovingBgLibrary(false);
//                 }
//             }
// 
//             // 4. 업로드
//             //processedFile이 원본이든 배경제거본이든 현재 상태의 파일을 사용
//             // Base64를 다시 만들어서 업로드용으로 씀 (resizeImage 결과물 재사용)
//             // 위에서 만든 Base64가 있으니 그것을 업로드 하는게 더 효율적일 수 있으나
//             // resizeImage를 한번 더 호출해서 확실하게 base64 얻음 (캐싱됨)
//             const finalBase64 = await resizeImage(processedFile, 768, 'image/png');
//             const transparentFile = base64ToFile(finalBase64, "library_char.png");
//             const url = await uploadMediaToHosting(transparentFile);
//             setUploadedLibraryPublicUrl(url);
//         } catch (e) {
//             console.error("Library image process failed", e);
//             alert("이미지 처리 실패");
//             setIsRemovingBgLibrary(false);
//         }
//     };
// 
//     // Helper for grid column layout based on aspect ratio
//     const getGridColumnsClass = () => {
//         if (aspectRatio === AspectRatio.LANDSCAPE) {
//             return "grid grid-cols-1 md:grid-cols-2 gap-6"; // Larger items for landscape
//         }
//         return "grid grid-cols-2 md:grid-cols-4 gap-6"; // Standard
//     };
// 
//     useEffect(() => {
//         const handlePaste = (e: ClipboardEvent) => {
//             if (selectedPath !== 'LIBRARY' && selectedPath !== 'TWIST') return;
//             const items = e.clipboardData?.items;
//             if (!items) return;
// 
//             for (let i = 0; i < items.length; i++) {
//                 if (items[i].type.indexOf('image') !== -1) {
//                     const blob = items[i].getAsFile();
//                     if (blob) {
//                         e.preventDefault();
//                         if (selectedPath === 'LIBRARY') {
//                             handleLibraryImageProcess(blob).then(() => {
//                                 alert("✅ 이미지가 붙여넣기 되었습니다! (도서관 모드)");
//                             });
//                         } else {
//                             handleImageUpload(blob);
//                         }
//                     }
//                     break;
//                 }
//             }
//         };
//         window.addEventListener('paste', handlePaste);
//         return () => window.removeEventListener('paste', handlePaste);
//     }, [selectedPath]);
// 
//     const handleImageUpload = async (file: File) => {
//         try {
//             // [OPTIMISTIC UI] 1. 즉시 원본 표시
//             const originalBase64 = await resizeImage(file, 768, 'image/png');
//             setTwistImageBase64(originalBase64);
// 
//             let processedFile = file;
//             
//             // 2. 배경 제거 시도
//             if (getRemoveBgKey()) {
//                 setIsRemovingBgTwist(true);
//                 try {
//                     processedFile = await removeBackground(file);
//                     // [OPTIMISTIC UI] 3. 이미지 교체 (Silent Swap)
//                     const processedBase64 = await resizeImage(processedFile, 768, 'image/png');
//                     setTwistImageBase64(processedBase64);
//                 } catch (bgError) {
//                     console.warn("Background removal failed, using original.", bgError);
//                 } finally {
//                     setIsRemovingBgTwist(false);
//                 }
//             }
// 
//             // 4. 분석 시작
//             setIsAnalyzing(true);
//             const finalBase64 = await resizeImage(processedFile, 768, 'image/png');
//             
//             try {
//                 // [FIXED] Using await inside try-catch for better error handling
//                 const result = await analyzeImageUnified(finalBase64);
//                 setDetectedStyle(result.style);
//                 setDetectedCharacter(result.character);
//             } catch (analysisError) {
//                 console.warn("Analysis failed, using defaults", analysisError);
//                 // Fallback values so the user can proceed even if analysis fails
//                 setDetectedStyle("Custom Art Style");
//                 setDetectedCharacter("Original Character");
//             } finally {
//                 setIsAnalyzing(false);
//             }
// 
//             // 5. 업로드
//             const transparentFile = base64ToFile(finalBase64, "twist_char.png");
//             const url = await uploadMediaToHosting(transparentFile);
//             setTwistPublicUrl(url);
//             
//         } catch (e) { 
//             alert("이미지 처리 실패"); 
//             setIsAnalyzing(false); 
//             setIsRemovingBgTwist(false);
//         }
//     };
// 
//     const handleLibraryDrop = (e: React.DragEvent) => {
//         e.preventDefault();
//         setIsDragOverLibrary(false);
//         const file = e.dataTransfer.files?.[0];
//         if (file && file.type.startsWith('image/')) {
//             handleLibraryImageProcess(file);
//         }
//     };
// 
//     const handleTwistDrop = (e: React.DragEvent) => {
//         e.preventDefault();
//         setIsDragOverTwist(false);
//         const file = e.dataTransfer.files?.[0];
//         if (file && file.type.startsWith('image/')) {
//             handleImageUpload(file);
//         }
//     };
// 
//     // ... (Keep handleQuickPreview, handleGenerate, etc. as is) ...
//     const handleQuickPreview = (term: string, type: 'CHARACTER' | 'STYLE', e: React.MouseEvent) => {
//         e.stopPropagation();
//         const cleanTerm = term.replace(/\(.*\)/, '').trim(); 
//         let query = cleanTerm;
//         if (type === 'STYLE') {
//             query = `${cleanTerm} style art`;
//         } else {
//             query = `${cleanTerm} character`;
//         }
//         const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
//         window.open(url, '_blank', 'width=1280,height=900,scrollbars=yes,resizable=yes');
//     };
// 
//     const handleGenerate = async () => {
//         if (selectedPath === 'LIBRARY' && !librarySelection) return alert("캐릭터를 선택해주세요 (필수).");
//         if (selectedPath === 'MIXER' && (!mixerKeyword1 || !mixerKeyword2)) return alert("두 가지 키워드를 모두 입력해주세요 (필수).");
//         if (selectedPath === 'TWIST' && !twistImageBase64) return alert("이미지를 업로드해주세요 (필수).");
// 
//         logger.info(`[CharacterMode] Starting Planning Phase. Path: ${selectedPath}`);
// 
//         // 1. Reset results to empty to trigger initialization
//         setGeneratedResults([]);
//         setSelectedResultIndex(null);
// 
//         // Prepare placeholder slots
//         const timestamp = Date.now();
//         const baseResults: GenResult[] = Array(4).fill(null).map((_, idx) => ({ 
//             id: `char-gen-${timestamp}-${idx}`, 
//             url: '', 
//             prompt: '', 
//         }));
//         setGeneratedResults(baseResults);
// 
//         if (onCostAdd) onCostAdd(PRICING.ANALYSIS_INITIAL, 'analysis');
// 
//         try {
//             let baseConcept = "";
//             let twistType: 'RANDOM' | 'CUSTOM' = 'RANDOM';
//             let customStyle = "";
//             
//             let referenceImageSource: string | undefined = undefined;
//             if (selectedPath === 'TWIST') {
//                 referenceImageSource = twistImageBase64 || undefined;
//             } else if (selectedPath === 'LIBRARY') {
//                 referenceImageSource = uploadedLibraryImage || undefined;
//             }
// 
//             let stylePrompt = "";
//             if (selectedStyle) {
//                 for (const cat of CHARACTER_STYLES) {
//                     const found = cat.items.find(item => item.label === selectedStyle);
//                     if (found) {
//                         stylePrompt = `[Target Style: ${found.prompt}]`;
//                         break;
//                     }
//                 }
//             }
// 
//             if (selectedPath === 'LIBRARY') {
//                 baseConcept = `Character: ${librarySelection}`;
//                 if (uploadedLibraryImage) {
//                     baseConcept += " (Refer to the attached image for visual appearance)";
//                 }
//                 if (selectedStyle) {
//                     twistType = 'CUSTOM';
//                     customStyle = stylePrompt;
//                 } else {
//                     twistType = 'RANDOM';
//                 }
//             } else if (selectedPath === 'MIXER') {
//                 baseConcept = `Hybrid Concept: Mix of ${mixerKeyword1} and ${mixerKeyword2}`;
//                 if (selectedStyle) {
//                     twistType = 'CUSTOM';
//                     customStyle = stylePrompt;
//                 } else {
//                     twistType = 'RANDOM';
//                 }
//             } else if (selectedPath === 'TWIST') {
//                 let currentStyle = detectedStyle;
//                 let currentChar = detectedCharacter;
//                 
//                 if (!currentStyle || !currentChar) {
//                     currentStyle = "Same as original image";
//                     currentChar = "Same as original character";
//                 }
// 
//                 let analysisInjection = "";
//                 if (currentStyle) analysisInjection += `[ORIGINAL ART STYLE TO KEEP: ${currentStyle}] `;
//                 if (currentChar) analysisInjection += `[ORIGINAL CHARACTER BASE: ${currentChar}] `;
//                 
//                 const adherenceInstruction = `
//                 [MODE: EXAGGERATED FEATURE TWIST]
//                 1. **ART STYLE**: STRICTLY LOCK the original art style. The rendering, brush strokes, and coloring must be identical to the original.
//                 2. **CORE IDENTITY**: Keep the base species and gender (e.g. if it's a human boy, keep it a human boy).
//                 3. **DRAMATIC VARIATION**: Change 3-4 features simultaneously.
//                 4. **GOAL**: Create 4 HIGHLY DISTINCT variations.
//                 `;
// 
//                 if (twistMode === 'RANDOM') {
//                     baseConcept = `${analysisInjection} TASK: Create 4 heavily exaggerated variations. ${adherenceInstruction}`;
//                     twistType = 'RANDOM'; 
//                 } else {
//                     baseConcept = `${analysisInjection} TASK: Modify character: "${twistCustomStyle || selectedStyle}". ${adherenceInstruction}`;
//                     twistType = 'CUSTOM';
//                     customStyle = twistCustomStyle || selectedStyle || "";
//                 }
//             }
// 
//             logger.info("[CharacterMode] Requesting Variation Prompts");
//             let variationPrompts = await generateCharacterVariations(baseConcept, twistType, customStyle);
//             
//             if (!variationPrompts || variationPrompts.length === 0) {
//                 variationPrompts = [baseConcept, baseConcept, baseConcept, baseConcept];
//             }
//             while (variationPrompts.length < 4) {
//                 variationPrompts.push(variationPrompts[0] || baseConcept);
//             }
//             variationPrompts = variationPrompts.slice(0, 4);
//             
//             // [CRITICAL UPDATE] Enforce Full Body constraints more aggressively
//             const naturalConstraints = "(FULL BODY SHOT: 1.5), (HEAD TO TOE), (SHOWING SHOES), wide angle, standing pose, front view, simple white background. [Negative: Close up, Portrait, Upper body only, Cropped head, Cut off feet, Half body].";
// 
//             // [FIXED] STAGGERED INJECTION LOGIC: Assign prompts one by one with delay to prevent network burst
//             for (let i = 0; i < variationPrompts.length; i++) {
//                 const promptContent = variationPrompts[i];
//                 const strictAdherence = referenceImageSource 
//                         ? `(STRICTLY FOLLOW THE REFERENCE IMAGE COMPOSITION, STYLE, AND COLOR.) ` 
//                         : "";
//                 
//                 const finalPrompt = strictAdherence + promptContent + " " + naturalConstraints;
// 
//                 setGeneratedResults(prev => {
//                     const newResults = [...prev];
//                     if (newResults[i]) {
//                         newResults[i] = { ...newResults[i], prompt: finalPrompt };
//                     }
//                     return newResults;
//                 });
// 
//                 // Wait 1 second before triggering next card's generation to prevent infinite simultaneous loading
//                 if (i < variationPrompts.length - 1) {
//                     await new Promise(resolve => setTimeout(resolve, 1000));
//                 }
//             }
// 
//         } catch (e: any) {
//             alert(`기획 단계 실패: ${e.message}`);
//             logger.error("[CharacterMode] Planning Phase Failed", e);
//             setGeneratedResults([]);
//         }
//     };
// 
//     // [NEW] Callback from Child — saves immediately on each image generation
//     const handleImageUpdate = (index: number, url: string) => {
//         setGeneratedResults(prev => {
//             const newArr = [...prev];
//             if (newArr[index]) {
//                 newArr[index] = { ...newArr[index], url };
//             }
//             // Immediate save: persist to ProjectStore without waiting for debounce
//             if (url) {
//                 saveDraftImmediate(newArr);
//             }
//             return newArr;
//         });
//     };
// 
//     // [NEW] Determine Loading Messages for current mode
//     const getLoadingMessages = () => {
//         switch (selectedPath) {
//             case 'TWIST': return TWIST_MESSAGES;
//             case 'MIXER': return MIXER_MESSAGES;
//             case 'LIBRARY': return LIBRARY_MESSAGES;
//             default: return undefined;
//         }
//     };
// 
//     const handleBatchDownload = async () => {
//         const validResults = generatedResults.filter(r => r.url);
//         if (validResults.length === 0) return alert("다운로드할 이미지가 없습니다.");
//         onSetProcessing(true, "이미지 압축 중...", 'CHARACTER');
//         const { default: JSZip } = await import('jszip');
//         const zip = new JSZip();
//         await Promise.all(validResults.map(async (res, idx) => {
//             try {
//                 if (res.url.startsWith('data:')) {
//                     const base64Data = res.url.split(',')[1];
//                     zip.file(`character_variant_${idx + 1}.png`, base64Data, { base64: true });
//                 } else {
//                     const response = await fetch(res.url);
//                     const blob = await response.blob();
//                     zip.file(`character_variant_${idx + 1}.png`, blob);
//                 }
//             } catch (e) { console.error("Batch download error", e); }
//         }));
//         const content = await zip.generateAsync({ type: "blob" });
//         const link = document.createElement('a');
//         link.href = URL.createObjectURL(content);
//         link.download = `character_set_${Date.now()}.zip`;
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         onSetProcessing(false);
//     };
// 
//     const handleConfirm = () => {
//         if (selectedResultIndex === null) return alert("마음에 드는 캐릭터를 선택해주세요.");
//         const selected = generatedResults[selectedResultIndex];
//         if (!selected || !selected.url) return;
//         
//         onLinkToScript(selected.url, undefined); 
//     };
// 
//     const getModeDescription = (mode: CharacterPath) => {
//         switch (mode) {
//             case 'TWIST': return "원본 이미지의 구도와 화풍은 그대로 유지하고, 캐릭터의 세부 특징(머리색, 안경 등)만 살짝 변주합니다.";
//             case 'LIBRARY': return "미리 준비된 다양한 캐릭터 프롬프트 도서관에서 원하는 대상을 골라 생성합니다.";
//             case 'MIXER': return "두 가지 서로 다른 키워드를 혼합하여 전혀 새로운 키메라(Chimera) 만듭니다.";
//             default: return "";
//         }
//     };
// 
//     const getCategoryLabel = (catKey: string) => {
//         return catKey.replace(/^\d+\.\s*/, ''); 
//     };
// 
//     // ... (Keep renderStyleSelector and renderSettingsPanel as is) ...
//     const renderStyleSelector = () => (
//         <div className="space-y-4 animate-fade-in">
//             {/* Header */}
//             <div className="flex items-center gap-2 mb-1">
//                 <span className="text-xl">🎨</span>
//                 <h3 className="text-lg font-bold text-white">
//                     캐릭터 재질/스타일 (미리보기 포함)
//                 </h3>
//                 <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">
//                     선택사항
//                 </span>
//             </div>
// 
//             {/* Current Selection Status Box */}
//             <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
//                 <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${selectedStyle ? 'bg-blue-600 shadow-lg' : 'bg-gray-800 text-gray-600'}`}>
//                     {selectedStyle ? CHARACTER_STYLES.flatMap(c => c.items).find(i => i.label === selectedStyle)?.emoji : '🎲'}
//                 </div>
//                 <div>
//                     <div className="font-bold text-sm text-white mb-1">
//                         {selectedStyle ? `선택됨: ${selectedStyle}` : '현재: AI 랜덤 모드'}
//                     </div>
//                     <p className="text-xs text-gray-500 leading-tight">
//                         {selectedStyle 
//                             ? '이 스타일이 캐릭터 생성 프롬프트에 적용됩니다.' 
//                             : '스타일을 선택하지 않으면 AI가 캐릭터의 컨셉에 가장 잘 어울리는 스타일을 자동으로 제안합니다.'}
//                     </p>
//                 </div>
//                 {selectedStyle && (
//                     <button 
//                         onClick={() => setSelectedStyle(null)}
//                         className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
//                     >
//                         취소
//                     </button>
//                 )}
//             </div>
// 
//             {/* Category Tabs */}
//             <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
//                 {CHARACTER_STYLES.map((cat) => (
//                     <button
//                         key={cat.category}
//                         onClick={() => setActiveStyleCategory(cat.category)}
//                         className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
//                             activeStyleCategory === cat.category 
//                             ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-md' 
//                             : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-gray-200'
//                         }`}
//                     >
//                         {cat.items[0].emoji} {cat.category.split(' ')[1] || cat.category}
//                     </button>
//                 ))}
//             </div>
// 
//             {/* Grid */}
//             <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
//                 {CHARACTER_STYLES.find(c => c.category === activeStyleCategory)?.items.map((item) => (
//                     <button
//                         key={item.label}
//                         onClick={() => setSelectedStyle(prev => prev === item.label ? null : item.label)}
//                         className={`relative p-3 rounded-xl border text-center transition-all group flex flex-col items-center justify-center gap-2 aspect-square ${
//                             selectedStyle === item.label 
//                             ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500 shadow-lg' 
//                             : 'bg-gray-800 border-gray-600 hover:bg-gray-750 hover:border-gray-500'
//                         }`}
//                     >
//                         <span className="text-3xl filter drop-shadow-md group-hover:scale-110 transition-transform">{item.emoji}</span>
//                         <span className={`text-xs font-bold block leading-tight ${selectedStyle === item.label ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
//                             {item.label}
//                         </span>
//                         
//                         {/* Quick Look Button */}
//                         <div 
//                             onClick={(e) => handleQuickPreview(item.label, 'STYLE', e)}
//                             className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-600"
//                         >
//                             🔍
//                         </div>
//                     </button>
//                 ))}
//             </div>
//         </div>
//     );
// 
//     const renderSettingsPanel = () => (
//         <div className="space-y-6">
//             <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-700 pb-2">⚙️ 생성 설정</h3>
//             
//             <div>
//                 <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">화면 비율 (Aspect Ratio)</label>
//                 <div className="grid grid-cols-3 gap-2">
//                     {[
//                         { id: AspectRatio.PORTRAIT, label: '9:16 (추천)', desc: '쇼츠/전신 샷' },
//                         { id: AspectRatio.SQUARE, label: '1:1', desc: '프로필/인스타' },
//                         { id: AspectRatio.LANDSCAPE, label: '16:9', desc: '유튜브/영화' }
//                     ].map(r => (
//                         <button
//                             key={r.id}
//                             onClick={() => setAspectRatio(r.id)}
//                             className={`py-3 px-2 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
//                                 aspectRatio === r.id 
//                                 ? 'bg-purple-600 border-purple-400 text-white shadow-lg' 
//                                 : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
//                             }`}
//                         >
//                             <span className="font-black text-sm">{r.label}</span>
//                             <span className="text-[11px] opacity-80">{r.desc}</span>
//                         </button>
//                     ))}
//                 </div>
//             </div>
// 
//             <div>
//                 <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">이미지 모델 (AI Model)</label>
//                 <div className="space-y-2">
//                     {IMAGE_MODELS.map(m => (
//                         <button
//                             key={m.id}
//                             onClick={() => setImageModel(m.id)}
//                             className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-all ${
//                                 imageModel === m.id 
//                                 ? 'bg-blue-900/40 border-blue-500 text-blue-100 shadow-inner' 
//                                 : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
//                             }`}
//                         >
//                             <span className="text-xs font-bold">{m.label}</span>
//                             {imageModel === m.id && <span className="text-blue-400">✔</span>}
//                         </button>
//                     ))}
//                 </div>
//                 <p className="text-xs text-gray-500 mt-2">
//                     * <strong>현존하는 최고의 이미지 생성 모델인 Nano Banana Pro를 사용합니다!!</strong>
//                 </p>
//             </div>
//         </div>
//     );
// 
//     return (
//         <div className="space-y-8 animate-fade-in relative min-h-[600px]">
//             {/* ... (Header and Buttons unchanged) ... */}
//             {lightboxUrl && <ImageLightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
// 
//             <div className="text-center space-y-2">
//                 <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
//                     창의적 캐릭터 연구소
//                 </h2>
//                 <p className="text-gray-300 font-medium text-sm">
//                     상상 속의 존재를 현실로. 3가지 창조의 길 중 하나를 선택하세요.
//                 </p>
//                 <div className="mt-4 bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-lg p-3 inline-flex items-center gap-2 shadow-lg animate-pulse-slow max-w-xl mx-auto">
//                      <span className="text-xl">💡</span>
//                      <span className="text-sm text-blue-100 font-bold">
//                          여기서 만든 캐릭터를 선택하면, <span className="text-yellow-300 border-b-2 border-yellow-300 font-black">대본 작성 단계로 자동 연동</span>됩니다!
//                      </span>
//                 </div>
//             </div>
// 
//             {generatedResults.length === 0 && (
//                 <div className="bg-gray-800 rounded-2xl p-6 md:p-8 border border-gray-700 shadow-2xl relative animate-fade-in-up">
//                     
//                     <div className="mb-6">
//                         <div className="grid grid-cols-3 gap-1 bg-gray-900 p-1 rounded-xl border border-gray-700 w-full mb-4">
//                             <button 
//                                 onClick={() => setSelectedPath('TWIST')}
//                                 className={`w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all ${
//                                     selectedPath === 'TWIST' 
//                                     ? 'bg-orange-600 text-white shadow-lg' 
//                                     : 'text-gray-400 hover:text-white hover:bg-gray-800'
//                                 }`}
//                             >
//                                 <span className="text-lg">🌀</span> 차원 비틀기
//                             </button>
//                             <button 
//                                 onClick={() => setSelectedPath('LIBRARY')}
//                                 className={`w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all ${
//                                     selectedPath === 'LIBRARY' 
//                                     ? 'bg-blue-600 text-white shadow-lg' 
//                                     : 'text-gray-400 hover:text-white hover:bg-gray-800'
//                                 }`}
//                             >
//                                 <span className="text-lg">📖</span> <span className="hidden sm:inline">캐릭터</span> 도서관
//                             </button>
//                             <button 
//                                 onClick={() => setSelectedPath('MIXER')}
//                                 className={`w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap transition-all ${
//                                     selectedPath === 'MIXER' 
//                                     ? 'bg-purple-600 text-white shadow-lg' 
//                                     : 'text-gray-400 hover:text-white hover:bg-gray-800'
//                                 }`}
//                             >
//                                 <span className="text-lg">🧪</span> 키워드 믹서
//                             </button>
//                         </div>
// 
//                         <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-center animate-fade-in">
//                             <p className="text-sm text-blue-100 font-medium leading-relaxed">
//                                 {getModeDescription(selectedPath)}
//                             </p>
//                         </div>
//                     </div>
// 
//                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-gray-700 pt-6">
//                         <div className="lg:col-span-7 space-y-6">
//                             
//                             {selectedPath === 'LIBRARY' && (
//                                 <>
//                                     <div className="animate-fade-in h-[750px] flex flex-col border border-gray-700 rounded-xl overflow-hidden bg-gray-900 shadow-lg relative">
//                                         <div 
//                                             onDragOver={(e) => { e.preventDefault(); setIsDragOverLibrary(true); }}
//                                             onDragLeave={(e) => { e.preventDefault(); setIsDragOverLibrary(false); }}
//                                             onDrop={handleLibraryDrop}
//                                             className={`transition-all duration-300 relative overflow-hidden flex-shrink-0 flex flex-col ${
//                                                 uploadedLibraryImage 
//                                                 ? 'bg-gray-900 p-0 border-b border-gray-700 h-[300px]' 
//                                                 : isDragOverLibrary 
//                                                     ? 'bg-blue-900/40 border-b-4 border-blue-500 h-[250px] justify-center' 
//                                                     : 'bg-gradient-to-b from-gray-800 to-gray-900 border-b border-gray-700 h-[250px] justify-center'
//                                             }`}
//                                         >
//                                             {uploadedLibraryImage ? (
//                                                 <div className="w-full h-full flex">
//                                                     <div className="w-1/2 h-full bg-black relative group overflow-hidden">
//                                                         <img src={uploadedLibraryImage} className="w-full h-full object-cover" alt="Imported" />
//                                                         
//                                                         {(isRemovingBgLibrary) && (
//                                                             <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center text-center p-4 backdrop-blur-sm animate-fade-in">
//                                                                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-green-500 border-b-transparent border-l-green-500 border-r-green-500 mb-4"></div>
//                                                                  <p className="text-sm font-bold text-green-400 animate-pulse">✂️ 배경 제거 중...</p>
//                                                             </div>
//                                                         )}
// 
//                                                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => { setUploadedLibraryImage(null); setUploadedLibraryPublicUrl(null); }}>
//                                                             <span className="text-sm text-white font-bold border border-white/50 px-3 py-1 rounded-full backdrop-blur-sm">🗑️ 이미지 제거</span>
//                                                         </div>
//                                                         <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm border border-gray-600">
//                                                             📸 원본 이미지
//                                                         </div>
//                                                         
//                                                         {!isRemovingBgLibrary && (
//                                                             <button
//                                                                 onClick={(e) => { 
//                                                                     e.stopPropagation(); 
//                                                                     downloadImage(uploadedLibraryImage, `library_base_${Date.now()}.png`); 
//                                                                 }}
//                                                                 className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white text-[11px] px-2 py-1 rounded-full border border-gray-500 shadow-lg z-30 font-bold"
//                                                             >
//                                                                 💾 저장
//                                                             </button>
//                                                         )}
//                                                     </div>
// 
//                                                     <div className="w-1/2 h-full bg-gray-800 p-4 flex flex-col gap-4 border-l border-gray-700 overflow-y-auto custom-scrollbar">
//                                                         <div>
//                                                             <h4 className="text-indigo-400 font-bold text-sm mb-1 flex items-center gap-2">
//                                                                 ✨ 이미지 참조 모드 ON
//                                                             </h4>
//                                                             <p className="text-[13px] text-gray-400 leading-tight">
//                                                                 이 얼굴과 구도를 베이스로, 아래에서 선택한 캐릭터의 특징을 입힙니다.
//                                                             </p>
//                                                         </div>
// 
//                                                         <div className="mt-auto pt-3 border-t border-gray-700">
//                                                             <p className="text-xs text-gray-500 font-bold mb-1">현재 선택된 캐릭터:</p>
//                                                             {librarySelection ? (
//                                                                 <div className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm text-center shadow-lg animate-pulse-slow truncate">
//                                                                     {librarySelection}
//                                                                 </div>
//                                                             ) : (
//                                                                 <div className="bg-red-900/30 text-red-300 border border-red-500/30 px-3 py-2 rounded-lg font-bold text-xs text-center animate-pulse">
//                                                                     🔴 아래 목록에서 선택하세요
//                                                                 </div>
//                                                             )}
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                             ) : (
//                                                 <div className="flex flex-col items-center justify-center text-center group h-full px-6 relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
//                                                     <div className={`transition-transform duration-300 ${isDragOverLibrary ? 'scale-110' : 'group-hover:scale-105'}`}>
//                                                         <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-3 mx-auto shadow-lg border border-gray-600">
//                                                             <span className="text-3xl">➕</span>
//                                                         </div>
//                                                     </div>
//                                                     <h3 className="text-lg font-bold text-white mb-2">이미지 업로드</h3>
//                                                     <p className="text-xs text-gray-500 mt-2 max-w-xs leading-relaxed">
//                                                         캐릭터의 <strong>얼굴, 포즈, 구도</strong>를 유지하고 싶다면 이미지를 업로드하세요.<br/>
//                                                         <span className="text-blue-400 font-bold">클릭하여 업로드</span> 또는 <span className="text-gray-400 font-bold">드래그 앤 드롭</span>
//                                                     </p>
//                                                     <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleLibraryImageProcess(e.target.files[0])} accept="image/*" className="hidden" />
//                                                 </div>
//                                             )}
//                                         </div>
// 
//                                         <div className="p-3 bg-gray-800 border-y border-gray-700 flex items-center justify-between gap-3 shrink-0 z-20 relative shadow-sm">
//                                             {/* ... (Keep list filters) ... */}
//                                             <div className="font-bold text-gray-300 text-sm flex items-center gap-2 overflow-hidden">
//                                                 <span className="shrink-0">📖 캐릭터 리스트:</span>
//                                                 {librarySelection && !uploadedLibraryImage && (
//                                                     <span className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full shadow-sm truncate max-w-[150px]">
//                                                         {librarySelection}
//                                                     </span>
//                                                 )}
//                                             </div>
//                                             <input 
//                                                 type="text" 
//                                                 placeholder="이름 검색..." 
//                                                 value={searchQuery}
//                                                 onChange={(e) => setSearchQuery(e.target.value)}
//                                                 className="w-32 sm:w-48 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500 outline-none transition-all focus:bg-gray-900"
//                                             />
//                                         </div>
//                                         
//                                         <div className="flex-grow flex overflow-hidden relative z-0">
//                                                 {/* ... (Keep list content) ... */}
//                                                 <div className="w-1/3 border-r border-gray-700 overflow-y-auto custom-scrollbar bg-gray-900/50">
//                                                 {Object.keys(CHARACTER_LIBRARY).map((cat) => (
//                                                     <button
//                                                         key={cat}
//                                                         onClick={() => setSelectedCategory(cat)}
//                                                         className={`w-full text-left px-3 py-3 text-xs font-medium border-b border-gray-800 transition-all ${
//                                                             selectedCategory === cat 
//                                                             ? 'bg-blue-900/30 text-blue-300 border-l-4 border-l-blue-500 pl-2' 
//                                                             : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
//                                                         }`}
//                                                     >
//                                                         {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
//                                                     </button>
//                                                 ))}
//                                                 </div>
// 
//                                                 <div className="flex-1 bg-gray-800 overflow-y-auto custom-scrollbar flex flex-col relative">
//                                                     <div className={`p-3 bg-gradient-to-r ${getCategoryGuide(selectedCategory).colors} bg-opacity-10 shrink-0 border-b border-white/10 sticky top-0 z-10 shadow-md backdrop-blur-md`}>
//                                                         <div className="flex items-start gap-2">
//                                                             <span className="text-xl">💡</span>
//                                                             <div>
//                                                                 <h4 className="text-xs font-black text-white uppercase tracking-wider mb-1 flex items-center gap-2">
//                                                                     이 카테고리 활용 팁
//                                                                     <span className="bg-black/30 px-2 py-0.5 rounded text-xs font-normal border border-white/20">
//                                                                         {getCategoryGuide(selectedCategory).tone}
//                                                                     </span>
//                                                                 </h4>
//                                                                 <p className="text-[13px] text-white/90 leading-tight">
//                                                                     {getCategoryGuide(selectedCategory).desc}
//                                                                 </p>
//                                                             </div>
//                                                         </div>
//                                                     </div>
// 
//                                                     <div className="grid grid-cols-2 gap-2 p-3 min-h-[300px]">
//                                                     {filteredItems.map((char: string) => {
//                                                             const match = char.match(/^(.*?)\s*(\(.*\))$/);
//                                                             const mainName = match ? match[1] : char;
//                                                             const subName = match ? match[2] : null;
// 
//                                                             return (
//                                                                 <div key={char} className="relative group h-24 z-0">
//                                                                     <button
//                                                                         onClick={() => setLibrarySelection(prev => prev === char ? '' : char)}
//                                                                         className={`w-full h-full rounded-xl transition-all border relative flex flex-col items-center justify-center p-2 ${
//                                                                             librarySelection === char 
//                                                                             ? 'bg-gray-700 border-blue-500 ring-2 ring-blue-500 shadow-lg' 
//                                                                             : 'bg-gray-800 border-gray-600 hover:border-gray-400 hover:bg-gray-700'
//                                                                         }`}
//                                                                     >
//                                                                         <div className="text-center w-full">
//                                                                             <span className="block font-bold leading-tight break-keep text-gray-200 text-xs">
//                                                                                 {mainName}
//                                                                             </span>
//                                                                             {subName && (
//                                                                                 <span className="block text-xs text-gray-500 mt-1 truncate w-full px-2">
//                                                                                     {subName}
//                                                                                 </span>
//                                                                             )}
//                                                                         </div>
//                                                                         
//                                                                         {librarySelection === char && (
//                                                                             <div className="absolute top-2 left-2 text-blue-500">
//                                                                                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
//                                                                             </div>
//                                                                         )}
//                                                                     </button>
// 
//                                                                     <button
//                                                                         onClick={(e) => handleQuickPreview(mainName, 'CHARACTER', e)}
//                                                                         className="absolute top-2 right-2 p-1.5 bg-gray-900/90 hover:bg-blue-600 text-gray-300 hover:text-white rounded-lg border border-gray-600 hover:border-blue-500 transition-all z-20 shadow-md group-hover:opacity-100 opacity-60"
//                                                                         title="🔍 구글 이미지 검색 (참고용)"
//                                                                     >
//                                                                         <span className="text-xs font-bold flex items-center gap-1">
//                                                                             🔍
//                                                                         </span>
//                                                                     </button>
//                                                                 </div>
//                                                             );
//                                                         })
//                                                     }
//                                                     </div>
//                                                 </div>
//                                         </div>
//                                     </div>
//                                     <RemoveBgTip />
//                                     {renderStyleSelector()}
//                                 </>
//                             )}
// 
//                             {selectedPath === 'MIXER' && (
//                                 <div className="animate-fade-in">
//                                     {/* ... (Keep Mixer as is) ... */}
//                                     <label className="block text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
//                                         키워드 조합 (A + B) 
//                                         <span className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded border border-red-500/50">🔴 필수</span>
//                                     </label>
//                                     <div className="flex flex-col gap-4 p-6 bg-gray-900 rounded-xl border border-gray-700">
//                                         <div className="relative">
//                                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🅰️</span>
//                                             <input 
//                                                 type="text" 
//                                                 value={mixerKeyword1} 
//                                                 onChange={(e) => setMixerKeyword1(e.target.value)}
//                                                 placeholder="첫 번째 키워드 (예: 사무라이)"
//                                                 className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 pl-12 text-lg focus:border-purple-500 outline-none text-white placeholder-gray-500"
//                                             />
//                                         </div>
//                                         <div className="flex items-center justify-center">
//                                             <span className="text-2xl font-black text-purple-500">+</span>
//                                         </div>
//                                         <div className="relative">
//                                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🅱️</span>
//                                             <input 
//                                                 type="text" 
//                                                 value={mixerKeyword2} 
//                                                 onChange={(e) => setMixerKeyword2(e.target.value)}
//                                                 placeholder="두 번째 키워드 (예: 푸딩)"
//                                                 className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 pl-12 text-lg focus:border-purple-500 outline-none text-white placeholder-gray-500"
//                                             />
//                                         </div>
//                                     </div>
//                                     {renderStyleSelector()}
//                                 </div>
//                             )}
// 
//                             {selectedPath === 'TWIST' && (
//                                 <div className="space-y-6 animate-fade-in">
//                                     <div>
//                                         <label className="block text-sm font-bold text-gray-400 mb-2">1. 원본 이미지 업로드</label>
//                                         <div 
//                                             onClick={() => fileInputRef.current?.click()}
//                                             onDragOver={(e) => { e.preventDefault(); setIsDragOverTwist(true); }}
//                                             onDragLeave={(e) => { e.preventDefault(); setIsDragOverTwist(false); }}
//                                             onDrop={handleTwistDrop}
//                                             className={`w-full aspect-video rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden relative group transition-all duration-200 ${
//                                                 isDragOverTwist 
//                                                 ? 'border-orange-500 bg-orange-900/20 scale-[1.02]' 
//                                                 : 'bg-gray-900 border-gray-600 hover:border-orange-500'
//                                             }`}
//                                         >
//                                             {twistImageBase64 ? (
//                                                 <>
//                                                     <img src={twistImageBase64} className="w-full h-full object-contain" />
//                                                     
//                                                     {(isAnalyzing || isRemovingBgTwist) && (
//                                                         <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm animate-fade-in">
//                                                             <div className="w-10 h-10 border-4 border-t-purple-500 border-b-transparent border-l-transparent border-r-purple-500 rounded-full animate-spin mb-3"></div>
//                                                             {isRemovingBgTwist ? (
//                                                                 <p className="text-green-400 font-bold text-sm animate-pulse">✂️ 배경 제거(누끼) 중...</p>
//                                                             ) : (
//                                                                 <>
//                                                                     <p className="text-white font-bold text-sm">✨ 캐릭터 상세 분석 중...</p>
//                                                                     <p className="text-xs text-purple-300">잠시만 기다려주세요...</p>
//                                                                 </>
//                                                             )}
//                                                         </div>
//                                                     )}
// 
//                                                     {!isAnalyzing && !isRemovingBgTwist && (
//                                                         <button
//                                                             onClick={(e) => { 
//                                                                 e.stopPropagation(); 
//                                                                 downloadImage(twistImageBase64, `twist_base_${Date.now()}.png`); 
//                                                             }}
//                                                             className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-3 py-1.5 rounded-full border border-gray-500 shadow-lg z-30 font-bold flex items-center gap-1"
//                                                         >
//                                                             <span>💾</span> PNG 저장
//                                                         </button>
//                                                     )}
//                                                 </>
//                                             ) : (
//                                                 <div className="text-center text-gray-500">
//                                                     <span className="text-4xl block mb-2">📸</span>
//                                                     <span className={`text-sm font-bold ${isDragOverTwist ? 'text-orange-300' : ''}`}>
//                                                         {isDragOverTwist ? '이미지 놓기!' : '클릭 또는 드래그하여 업로드'}
//                                                     </span>
//                                                 </div>
//                                             )}
//                                             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
//                                                 <span className="text-white font-bold border border-white px-3 py-1 rounded-full">이미지 변경</span>
//                                             </div>
//                                         </div>
//                                         <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} accept="image/*" className="hidden" />
//                                         
//                                         <RemoveBgTip />
// 
//                                         {(detectedStyle || detectedCharacter) && (
//                                             <div className="mt-4 bg-gray-800 rounded-xl border border-purple-500/30 p-4 shadow-lg animate-fade-in">
//                                                 {/* ... (Keep analysis report) ... */}
//                                                 <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
//                                                     <h3 className="font-bold text-sm text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 flex items-center gap-2">
//                                                         ✨ AI 분석 리포트
//                                                         <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700 font-normal">수정 가능</span>
//                                                     </h3>
//                                                 </div>
//                                                 
//                                                 <div className="space-y-4">
//                                                     {/* Style Section */}
//                                                     <div className="relative group">
//                                                         <div className="flex justify-between items-end mb-1">
//                                                             <label className="text-xs font-bold text-purple-400 flex items-center gap-1">
//                                                                 🎨 감지된 화풍 (Art Style)
//                                                             </label>
//                                                             <button 
//                                                                 onClick={(e) => {
//                                                                     e.stopPropagation();
//                                                                     navigator.clipboard.writeText(detectedStyle);
//                                                                     alert("✅ 스타일 프롬프트가 복사되었습니다.");
//                                                                 }}
//                                                                 className="text-xs bg-gray-700 hover:bg-purple-600 text-gray-300 hover:text-white px-2 py-1 rounded transition-colors border border-gray-600 flex items-center gap-1"
//                                                             >
//                                                                 📋 복사
//                                                             </button>
//                                                         </div>
//                                                         <textarea 
//                                                             value={detectedStyle}
//                                                             onChange={(e) => setDetectedStyle(e.target.value)}
//                                                             className="w-full bg-black/40 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none leading-relaxed h-20 custom-scrollbar shadow-inner"
//                                                             placeholder="스타일 분석 결과가 여기에 표시됩니다."
//                                                         />
//                                                     </div>
// 
//                                                     {/* Character Section */}
//                                                     <div className="relative group">
//                                                         <div className="flex justify-between items-end mb-1">
//                                                             <label className="text-xs font-bold text-blue-400 flex items-center gap-1">
//                                                                 👤 감지된 캐릭터 (Character)
//                                                             </label>
//                                                             <button 
//                                                                 onClick={(e) => {
//                                                                     e.stopPropagation();
//                                                                     navigator.clipboard.writeText(detectedCharacter);
//                                                                     alert("✅ 캐릭터 설명이 복사되었습니다.");
//                                                                 }}
//                                                                 className="text-xs bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white px-2 py-1 rounded transition-colors border border-gray-600 flex items-center gap-1"
//                                                             >
//                                                                 📋 복사
//                                                             </button>
//                                                         </div>
//                                                         <textarea 
//                                                             value={detectedCharacter}
//                                                             onChange={(e) => setDetectedCharacter(e.target.value)}
//                                                             className="w-full bg-black/40 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none leading-relaxed h-20 custom-scrollbar shadow-inner"
//                                                             placeholder="캐릭터 분석 결과가 여기에 표시됩니다."
//                                                         />
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         )}
//                                     </div>
//                                     
//                                     <div>
//                                         <label className="block text-sm font-bold text-gray-400 mb-2">2. 비틀기 방식 선택</label>
//                                         <div className="grid grid-cols-1 gap-3">
//                                             <button
//                                                 onClick={() => setTwistMode('RANDOM')}
//                                                 className={`w-full p-4 rounded-xl border text-left flex items-center gap-4 transition-all ${twistMode === 'RANDOM' ? 'bg-orange-900/30 border-orange-500 shadow-lg' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
//                                             >
//                                                 <span className="text-2xl">🎲</span>
//                                                 <div>
//                                                     <div className={`font-bold ${twistMode === 'RANDOM' ? 'text-orange-300' : 'text-gray-300'}`}>AI 랜덤 비틀기</div>
//                                                     <p className="text-xs text-gray-500">캐릭터의 본질은 유지하고, 세부 특징만 창의적으로 변주합니다.</p>
//                                                 </div>
//                                             </button>
// 
//                                             <button
//                                                 onClick={() => setTwistMode('CUSTOM')}
//                                                 className={`w-full p-4 rounded-xl border text-left flex items-start gap-4 transition-all ${twistMode === 'CUSTOM' ? 'bg-orange-900/30 border-orange-500 shadow-lg' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
//                                             >
//                                                 <span className="text-2xl mt-1">✏️</span>
//                                                 <div className="w-full">
//                                                     <div className={`font-bold ${twistMode === 'CUSTOM' ? 'text-orange-300' : 'text-gray-300'}`}>직접 스타일 입력</div>
//                                                     <p className="text-xs text-gray-500 mb-2">바꾸고 싶은 특정 요소(머리색, 소품 등)를 지시합니다.</p>
//                                                     {twistMode === 'CUSTOM' && (
//                                                         <input 
//                                                             type="text" 
//                                                             value={twistCustomStyle}
//                                                             onChange={(e) => setTwistCustomStyle(e.target.value)}
//                                                             placeholder="예: 안경을 벗겨줘, 티셔츠를 파란색으로 바꿔줘"
//                                                             className="w-full bg-gray-800 border border-orange-500/50 rounded p-2 text-sm text-white focus:outline-none animate-fade-in"
//                                                             onClick={(e) => e.stopPropagation()}
//                                                         />
//                                                     )}
//                                                 </div>
//                                             </button>
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>
// 
//                         <div className="lg:col-span-5 flex flex-col h-full">
//                             <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-6 flex flex-col gap-8 h-full shadow-inner">
//                                 {renderSettingsPanel()} 
//                                 
//                                 <div className="mt-auto pt-6 border-t border-gray-700">
//                                     <button
//                                         onClick={handleGenerate}
//                                         className="w-full py-5 rounded-xl font-bold text-xl shadow-2xl transition-all transform hover:scale-[1.02] active:scale-95 bg-gradient-to-r from-blue-600 to-purple-600 text-white flex flex-col items-center justify-center gap-1 group"
//                                     >
//                                         <div className="flex items-center gap-2">
//                                             <span>✨ 4가지 변주 생성하기</span>
//                                         </div>
//                                         <span className="text-xs bg-black/20 px-2 py-0.5 rounded font-normal opacity-80 group-hover:opacity-100 transition-opacity">($0.20 소요)</span>
//                                     </button>
//                                     <p className="text-center text-xs text-gray-500 mt-3 leading-relaxed">
//                                         Gemini 3 Pro가 창의적인 프롬프트를 설계하고,<br/>
//                                         4장의 고품질 이미지를 <strong>순차적으로 안정되게</strong> 생성합니다.
//                                     </p>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             )}
// 
//             {/* ... (Keep results grid unchanged) ... */}
//             {generatedResults.length > 0 && (
//                 <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-2xl animate-fade-in-up">
//                     <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
//                         <div className="flex flex-col">
//                             <h3 className="text-xl font-bold text-white">🎉 마음에 드는 캐릭터를 선택하세요!</h3>
//                             <p className="text-sm text-gray-400">선택한 캐릭터로 영상 프로젝트를 시작합니다.</p>
//                         </div>
//                         <div className="flex gap-2">
//                             <button 
//                                 onClick={handleBatchDownload} 
//                                 className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-lg"
//                             >
//                                 <span>📦</span> 일괄 저장
//                             </button>
//                             <button 
//                                 onClick={handleGenerate} 
//                                 className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
//                             >
//                                 <span>↻</span> 다시 생성하기
//                             </button>
//                         </div>
//                     </div>
// 
//                     <div className={getGridColumnsClass()}>
//                         {generatedResults.map((res, idx) => (
//                             <CharacterGenCard
//                                 key={res.id} // Stable ID
//                                 id={res.id}
//                                 index={idx}
//                                 prompt={res.prompt} // Trigger
//                                 aspectRatio={aspectRatio}
//                                 referenceImage={selectedPath === 'TWIST' ? (twistPublicUrl || twistImageBase64 || undefined) : (uploadedLibraryPublicUrl || uploadedLibraryImage || undefined)}
//                                 onImageGenerated={handleImageUpdate}
//                                 onCostAdd={onCostAdd}
//                                 onSelect={setSelectedResultIndex}
//                                 isSelected={selectedResultIndex === idx}
//                                 onLightbox={setLightboxUrl}
//                                 isPlanning={!res.prompt} // Prompt empty = Planning phase
//                                 loadingMessages={getLoadingMessages()} // [NEW] Pass Custom Messages
//                                 planningMessage={PLANNING_MESSAGE}     // [NEW] Pass Custom Planning Msg
//                             />
//                         ))}
//                     </div>
// 
//                     <div className="mt-8 flex justify-center gap-4">
//                         <button
//                             onClick={() => setGeneratedResults([])}
//                             className="px-6 py-4 rounded-xl font-bold text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors"
//                         >
//                             취소하고 다시 설정
//                         </button>
//                         
//                         <button
//                             onClick={handleConfirm}
//                             className={`px-10 py-4 rounded-xl font-bold text-lg shadow-xl transition-all flex items-center gap-2 ${selectedResultIndex !== null ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white hover:scale-105' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
//                         >
//                             <span>📝</span> 이 캐릭터로 대본 쓰러 가기 (연동)
//                         </button>
//                     </div>
//                 </div>
//             )}
// 
//             <style dangerouslySetInnerHTML={{ __html: `
//                 @keyframes scan-line {
//                     0% { top: 0; }
//                     100% { top: 100%; }
//                 }
//                 .animate-scan-line {
//                     animation: scan-line 2.5s linear infinite;
//                 }
//             `}} />
//         </div>
//     );
// };
// 
// export default CharacterMode;
// === ORIGINAL CharacterMode END ===
