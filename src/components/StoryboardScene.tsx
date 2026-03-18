
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { Scene, AspectRatio, VideoFormat, VideoModel } from '../types';
import type { CommunityMediaItem } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useEditRoomStore } from '../stores/editRoomStore';
import { useUIStore, showToast } from '../stores/uiStore';
import { logger } from '../services/LoggerService';
import { COMPACT_PAN_ZOOM_PRESETS, computeMotionStyle } from '../services/motionPreviewUtils';
import { lazyRetry } from '../utils/retryImport';

const MediaSearchModal = lazyRetry(() => import('./MediaSearchModal'));

interface StoryboardSceneProps {
  scene: Scene;
  index: number;
  aspectRatio: AspectRatio;
  videoFormat: VideoFormat;
  onGenerateImage: (id: string, feedback?: string) => void;
  onGenerateGrokHQ: (id: string) => void;
  onGenerateVeoFast: (id: string) => void;
  onGenerateVeoQuality: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onCancelGeneration: (id: string) => void;
  onInjectCharacter: (id: string) => void;
  onAutoPrompt?: (id: string) => Promise<void>;
  variant: 'default';
}

// A-5: Aspect ratio style constants (avoid re-creation per render)
const ASPECT_STYLES: Record<string, React.CSSProperties> = {
  '9:16': { aspectRatio: '9 / 16' },
  '1:1': { aspectRatio: '1 / 1' },
  '4:3': { aspectRatio: '4 / 3' },
  '16:9': { aspectRatio: '16 / 9' },
};

const StoryboardSceneInner: React.FC<StoryboardSceneProps> = ({
  scene,
  index,
  aspectRatio,
  onGenerateImage,
  onGenerateGrokHQ,
  onGenerateVeoFast,
  onGenerateVeoQuality,
  onUploadImage,
  onCancelGeneration,
  onInjectCharacter,
  onAutoPrompt,
  variant
}) => {
  const [isAutoPrompting, setIsAutoPrompting] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [showMediaSearch, setShowMediaSearch] = useState(false);
  const [editPromptText, setEditPromptText] = useState(scene.visualPrompt);
  const [showVisualPrompt, setShowVisualPrompt] = useState(false);
  const [showMotionPicker, setShowMotionPicker] = useState(false);

  // 모션 효과 상태 (editRoomStore 공유)
  const sceneEffect = useEditRoomStore((s) => s.sceneEffects[scene.id]);
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const hasMotionEffect = sceneEffect && sceneEffect.panZoomPreset !== 'none';
  const motionStyle = hasMotionEffect ? computeMotionStyle(sceneEffect) : undefined;

  const handleMotionPresetChange = useCallback((presetId: string) => {
    const current = sceneEffect?.panZoomPreset;
    setSceneEffect(scene.id, {
      panZoomPreset: current === presetId ? 'none' : presetId,
      motionEffect: sceneEffect?.motionEffect || 'none',
    });
  }, [scene.id, sceneEffect, setSceneEffect]);

  const handleAIMotionDetect = useCallback(async () => {
    try {
      const { matchMotionToContent } = await import('../services/smartMotionMatcher');
      const result = matchMotionToContent({
        visualPrompt: scene.visualPrompt,
        scriptText: scene.scriptText,
        castType: scene.castType,
        shotSize: scene.shotSize,
        cameraAngle: scene.cameraAngle,
        entityComposition: scene.entityComposition,
        characterPresent: scene.characterPresent,
      });
      setSceneEffect(scene.id, {
        panZoomPreset: result.panZoomPreset,
        motionEffect: result.motionEffect,
        anchorX: result.anchorX,
        anchorY: result.anchorY,
        anchorLabel: result.anchorLabel,
      });
      showToast(`모션 자동 설정: ${result.panZoomPreset} (${Math.round(result.confidence * 100)}% 확신)`);
    } catch (e) {
      showToast('모션 자동 감지 실패');
      logger.trackSwallowedError('StoryboardScene:handleAIMotionDetect', e);
    }
  }, [scene, setSceneEffect]);

  // A-3: Debounced local state for scriptText
  const [localScriptText, setLocalScriptText] = useState(scene.scriptText);
  const [localVisualPrompt, setLocalVisualPrompt] = useState(scene.visualPrompt);

  // M11: Sync editPromptText when visualPrompt changes externally and edit modal is closed
  useEffect(() => {
    if (!isEditingPrompt) {
      setEditPromptText(scene.visualPrompt);
    }
  }, [scene.visualPrompt, isEditingPrompt]);

  // A-3: Sync local state when scene prop changes externally
  useEffect(() => { setLocalScriptText(scene.scriptText); }, [scene.scriptText]);
  useEffect(() => { setLocalVisualPrompt(scene.visualPrompt); }, [scene.visualPrompt]);

  // A-3: Debounce scriptText updates to store (300ms)
  useEffect(() => {
    if (localScriptText === scene.scriptText) return;
    const timer = setTimeout(() => {
      useProjectStore.getState().updateScene(scene.id, { scriptText: localScriptText });
    }, 300);
    return () => clearTimeout(timer);
  }, [localScriptText, scene.id, scene.scriptText]);

  // A-3: Debounce visualPrompt updates to store (300ms)
  // [FIX] Also set isUserEditedPrompt when user types in the prompt textarea
  useEffect(() => {
    if (localVisualPrompt === scene.visualPrompt) return;
    const timer = setTimeout(() => {
      useProjectStore.getState().updateScene(scene.id, { visualPrompt: localVisualPrompt, isUserEditedPrompt: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [localVisualPrompt, scene.id, scene.visualPrompt]);

  const progress = scene.progress || 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);

  // Per-scene reference image upload handler
  const handleReferenceImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      useProjectStore.getState().updateScene(scene.id, { referenceImage: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleClearReferenceImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    useProjectStore.getState().updateScene(scene.id, { referenceImage: undefined });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) onUploadImage(scene.id, e.dataTransfer.files[0]); };
  const handleMagicClick = async () => { if (!onAutoPrompt) return; setIsAutoPrompting(true); await onAutoPrompt(scene.id); setIsAutoPrompting(false); setShowVisualPrompt(true); };
  const handleEditSubmit = () => {
    // 수정된 프롬프트를 store에 먼저 저장 → 이미지 생성 시 반영 (isUserEditedPrompt 플래그 설정)
    useProjectStore.getState().updateScene(scene.id, { visualPrompt: editPromptText, isUserEditedPrompt: true });
    setLocalVisualPrompt(editPromptText);
    onGenerateImage(scene.id, editPromptText);
    setIsEditingPrompt(false);
  };
  // [#492] 이전 이미지로 되돌리기
  const handleRevertImage = useCallback(() => {
    if (scene.previousImageUrl) {
      useProjectStore.getState().updateScene(scene.id, {
        imageUrl: scene.previousImageUrl,
        previousImageUrl: scene.imageUrl,  // 현재→이전으로 스왑 (다시 되돌리기 가능)
      });
      showToast('이전 이미지로 되돌렸어요');
    }
  }, [scene.id, scene.imageUrl, scene.previousImageUrl]);

  // [FIX] Flush debounce and generate with current local prompt value
  // Prevents race condition where 300ms debounce hasn't written to store yet
  const flushAndGenerate = () => {
    // Flush localVisualPrompt to store immediately (bypass debounce)
    if (localVisualPrompt !== scene.visualPrompt) {
      useProjectStore.getState().updateScene(scene.id, { visualPrompt: localVisualPrompt, isUserEditedPrompt: true });
    }
    // Pass localVisualPrompt as feedback so generateSceneImage uses the CURRENT value
    onGenerateImage(scene.id, localVisualPrompt);
  };

  const handleNativeHQToggle = () => { useProjectStore.getState().updateScene(scene.id, { isNativeHQ: !scene.isNativeHQ }); };
  const handleDownloadImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scene.imageUrl) return;
    try {
      const res = await fetch(scene.imageUrl);
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `scene_${index + 1}_image.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 30000); // 30 seconds for large images
    } catch (e) {
      logger.trackSwallowedError('StoryboardScene:handleDownloadImage', e);
      // Fallback: open in new tab
      window.open(scene.imageUrl, '_blank');
    }
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case AspectRatio.PORTRAIT: return 'aspect-[9/16]';
      case AspectRatio.SQUARE: return 'aspect-square';
      case AspectRatio.CLASSIC: return 'aspect-[4/3]';
      default: return 'aspect-video';
    }
  };

  // A-5: Use pre-computed constant styles
  const getAspectRatioStyle = (): React.CSSProperties => {
    return ASPECT_STYLES[aspectRatio] || ASPECT_STYLES['16:9'];
  };

  const isPortrait = aspectRatio === AspectRatio.PORTRAIT;

  const getModelBadge = (model?: VideoModel, isNativeHQ?: boolean) => {
      if (!model) return null;
      switch (model) {
          case VideoModel.VEO:
              return <span className="text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-2 py-0.5 rounded border border-violet-400/50 font-bold flex-shrink-0">💎 Veo 1080p</span>;
          // VEO_FAST removed — Evolink 1080p로 통합
          case VideoModel.GROK:
              if (isNativeHQ) return <span className="text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 rounded font-bold shadow-sm flex-shrink-0">🚀 Grok 720p</span>;
              return <span className="text-sm bg-pink-900/80 text-pink-200 px-2 py-0.5 rounded border border-pink-700 font-bold flex-shrink-0">🚀 Grok (Basic)</span>;
          default: return null;
      }
  };

  const isVeo = scene.videoModelUsed === VideoModel.VEO || scene.videoModelUsed === VideoModel.VEO_QUALITY;

  const formatTime = (seconds?: number) => {
      if (seconds === undefined) return '';
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const renderRegenMessage = () => {
      if (scene.isUpscaling) {
          return (
              <div className="bg-black/80 backdrop-blur text-white text-sm px-2 py-1 rounded-l-full border-y border-l border-purple-500/50 flex items-center gap-1 animate-pulse shadow-lg select-none">
                  <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_5px_#a855f7]"></div>
                  <span className="drop-shadow-md font-medium tracking-tight">✨ 1080p 업그레이드 중... ({Math.round(progress)}%)</span>
              </div>
          );
      } else if (scene.videoModelUsed === VideoModel.VEO) {
          return (
              <div className="bg-black/80 backdrop-blur text-white text-sm px-2 py-1 rounded-l-full border-y border-l border-violet-500/50 flex items-center gap-1 shadow-lg select-none">
                  <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_5px_#8b5cf6]"></div>
                  <span className="drop-shadow-md font-medium tracking-tight">💎 Veo 1080p 재생성 중... ({Math.round(progress)}%)</span>
              </div>
          );
      } else if (scene.videoModelUsed === VideoModel.GROK) {
          return (
              <div className="bg-black/80 backdrop-blur text-white text-sm px-2 py-1 rounded-l-full border-y border-l border-orange-500/50 flex items-center gap-1 shadow-lg select-none">
                  <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_#f97316]"></div>
                  <span className="drop-shadow-md font-medium tracking-tight">🚀 Grok 720p 재생성 중... ({Math.round(progress)}%)</span>
              </div>
          );
      }
      return null;
  };

  return (
    <div className={`bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden flex flex-col group transition-all hover:border-blue-500/50`}>

      <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center h-10">
        <div className="flex items-center gap-2 overflow-hidden">
           <span className={`text-sm font-bold px-2 py-0.5 rounded bg-blue-600 text-white flex-shrink-0`}>#{index + 1}</span>
           {scene.startTime !== undefined && (
               <span className="text-sm bg-black/60 text-gray-300 px-2 py-0.5 rounded border border-gray-600 font-mono tracking-tighter flex-shrink-0">
                   ⏱️ {formatTime(scene.startTime)} {scene.endTimeStamp ? `~ ${formatTime(scene.endTimeStamp)}` : ''}
               </span>
           )}
           {scene.isNativeHQ && <span className="text-sm bg-orange-600/20 text-orange-300 px-2 py-0.5 rounded border border-orange-500/30 font-bold flex-shrink-0">🚀 Native HQ</span>}
           {scene.isInfographic && <span className="text-sm bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 font-bold flex-shrink-0">📊 Info</span>}
           {scene.communityMediaItem && (
             <span className="text-sm bg-cyan-600/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-bold flex-shrink-0 inline-flex items-center gap-1" title={scene.communityMediaItem.title}>
               🎨 {scene.communityMediaItem.source}
               <button type="button" onClick={(e) => { e.stopPropagation(); useProjectStore.getState().updateScene(scene.id, { communityMediaItem: undefined }); }} className="ml-0.5 w-4 h-4 rounded-full bg-cyan-500/30 hover:bg-red-500/50 text-cyan-200 hover:text-white flex items-center justify-center text-[10px] transition-colors" title="적용 해제">✕</button>
             </span>
           )}
           {scene.isLoopMode && <span className="text-sm bg-teal-600/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30 font-bold flex-shrink-0 flex items-center gap-1">🔄 Loop</span>}
           {scene.v2vTotalSegments && scene.v2vTotalSegments > 1 && (
               <span className="text-sm bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 font-bold flex-shrink-0">
                   구간 {(scene.v2vSegmentIndex ?? 0) + 1}/{scene.v2vTotalSegments} ({scene.v2vSegmentStartSec ?? 0}s~{scene.v2vSegmentEndSec ?? 0}s)
               </span>
           )}
           {scene.videoUrl ? (getModelBadge(scene.videoModelUsed, scene.isNativeHQ) || <span className="text-sm bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">VIDEO</span>) : null}

           {/* [NEW] Grounding Badge + Entity Composition */}
           {scene.castType === 'KEY_ENTITY' && scene.entityName && (
               <div className="relative group/badge">
                   <span className="text-sm bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 font-bold flex items-center gap-1 cursor-help flex-shrink-0">
                       🔍 {scene.entityName}
                       {scene.entityComposition && (
                           <span className="text-blue-400/70 text-xs ml-0.5">
                               {scene.entityComposition === 'ENTITY_SOLO' ? '(단독)' : scene.entityComposition === 'ENTITY_WITH_MAIN' ? '(동반)' : scene.entityComposition === 'MAIN_OBSERVING' ? '(관찰)' : scene.entityComposition === 'ENTITY_FG_MAIN_BG' ? '(전경)' : '(후경)'}
                           </span>
                       )}
                   </span>
               </div>
           )}
        </div>
        <div className="flex gap-1 flex-shrink-0 ml-auto">
            <button onClick={() => useProjectStore.getState().splitScene(index)} className="p-1 hover:bg-gray-700 rounded text-gray-400 text-sm" title="장면 나누기">✂️</button>
            <button onClick={() => { const st = useProjectStore.getState(); if (index < st.scenes.length - 1) st.mergeScene(index); }} disabled={useProjectStore.getState().scenes.length <= 1} className="p-1 hover:bg-gray-700 rounded text-gray-400 text-sm disabled:opacity-30 disabled:cursor-not-allowed" title="다음 장면과 합치기">🔗</button>
            <button onClick={() => useProjectStore.getState().addSceneAfter(index)} className="p-1 hover:bg-gray-700 rounded text-gray-400 text-sm" title="장면 추가">➕</button>
            <button onClick={() => useProjectStore.getState().removeScene(index)} className="p-1 bg-red-900/20 hover:bg-red-900/80 text-red-400 rounded transition-colors text-sm" title="삭제">🗑️</button>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col gap-3">
          <div
             className={`relative w-full ${getAspectRatioClass()} bg-black rounded-lg overflow-hidden border border-gray-700 group/image cursor-pointer`}
             style={getAspectRatioStyle()}
             onDragOver={handleDragOver} onDrop={handleDrop}
             onClick={() => !isEditingPrompt && scene.imageUrl && useUIStore.getState().openLightbox(scene.imageUrl)}
          >
              {scene.isGeneratingImage ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-20">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                      <span className="text-sm text-blue-300 font-bold mb-3 animate-pulse">{scene.generationStatus || (scene.isNativeHQ ? '네이티브 텍스트 엔진 가동 중...' : '이미지 생성 중...')}</span>
                      <button onClick={(e) => { e.stopPropagation(); useProjectStore.getState().updateScene(scene.id, { isGeneratingImage: false, generationStatus: undefined, generationCancelled: true }); }} className="px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white text-sm font-bold rounded flex items-center gap-1 border border-red-400/50 shadow-lg">❌ 취소 (중단)</button>
                  </div>
              ) : scene.imageUrl ? (
                  <>
                      {/* B-1: lazy loading + async decoding, B-2: fade-in transition, 모션 프리뷰 (#427) */}
                      <div className="absolute inset-[-10%] w-[120%] h-[120%]" style={motionStyle}>
                        <img src={scene.imageUrl} className={`w-full h-full ${isPortrait ? 'object-contain' : 'object-cover'} opacity-0 transition-opacity duration-300`} alt="Scene" loading="lazy" decoding="async" onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} />
                      </div>
                      {hasMotionEffect && (
                        <div className="absolute top-2 left-2 z-30 bg-amber-600/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
                          {COMPACT_PAN_ZOOM_PRESETS.find(p => p.id === sceneEffect?.panZoomPreset)?.icon || '🎬'} 모션
                        </div>
                      )}
                      <button onClick={handleDownloadImage} className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white p-1.5 rounded-full border border-white/20 opacity-0 group-hover/image:opacity-100 transition-opacity z-40" title="이미지 다운로드">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      </button>
                      {!isEditingPrompt && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-2 flex justify-center gap-2 translate-y-full group-hover/image:translate-y-0 transition-transform duration-200 z-30">
                               <button onClick={(e) => { e.stopPropagation(); flushAndGenerate(); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded flex items-center gap-1 border border-gray-600">🔄 재생성</button>
                               {scene.previousImageUrl && (
                                 <button onClick={(e) => { e.stopPropagation(); handleRevertImage(); }} className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-sm font-bold rounded flex items-center gap-1 border border-amber-500/50" title="이전 이미지로 되돌리기">↩️ 되돌리기</button>
                               )}
                               <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded flex items-center gap-1 border border-gray-600">📤 업로드</button>
                               <button onClick={(e) => { e.stopPropagation(); setShowMediaSearch(true); }} className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold rounded flex items-center gap-1 border border-cyan-500/50 shadow-lg">🔍 미디어</button>
                               <button onClick={(e) => { e.stopPropagation(); setEditPromptText(scene.visualPrompt); setIsEditingPrompt(true); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded flex items-center gap-1 border border-blue-500 shadow-lg">✏️ 수정하기</button>
                          </div>
                      )}
                      {isEditingPrompt && (
                          <div className="absolute inset-0 bg-black/95 z-40 flex flex-col p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                              <h4 className="text-white font-bold text-base mb-2 flex items-center gap-2">✏️ 프롬프트 수정</h4>
                              <textarea value={editPromptText} onChange={(e) => setEditPromptText(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white resize-none focus:border-blue-500 outline-none mb-2" />
                              <div className="flex gap-2 h-8"><button onClick={() => setIsEditingPrompt(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded font-bold">취소</button><button onClick={handleEditSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg">수정 적용</button></div>
                          </div>
                      )}
                  </>
              ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-900">
                      <span className="text-2xl mb-2">🖼️</span>
                      {scene.generationStatus ? (
                          <span className="text-sm text-red-400 px-3 text-center leading-relaxed mb-2">{scene.generationStatus}</span>
                      ) : (
                          <span className="text-sm">이미지 없음</span>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button onClick={(e) => { e.stopPropagation(); flushAndGenerate(); }} className="px-3 py-1 bg-blue-900/30 hover:bg-blue-800/50 text-blue-300 text-sm rounded border border-blue-800">생성하기</button>
                        <button onClick={(e) => { e.stopPropagation(); setShowMediaSearch(true); }} className="px-3 py-1 bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-300 text-sm rounded border border-cyan-800">🔍 미디어</button>
                      </div>
                  </div>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onUploadImage(scene.id, e.target.files[0])} />
          </div>

          {/* Per-scene reference image */}
          <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); refImageInputRef.current?.click(); }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${scene.referenceImage ? 'bg-amber-900/40 border-amber-600/60 text-amber-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
                title="장면별 레퍼런스 이미지 첨부"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                {scene.referenceImage ? '레퍼런스' : '레퍼런스 첨부'}
              </button>
              {scene.referenceImage && (
                <div className="relative group/ref">
                  <img src={scene.referenceImage} alt="Ref" className="w-8 h-8 rounded border border-amber-600/50 object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); useUIStore.getState().openLightbox(scene.referenceImage!); }} />
                  <button onClick={handleClearReferenceImage} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity" title="레퍼런스 제거">✕</button>
                </div>
              )}
              <input type="file" ref={refImageInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleReferenceImageUpload(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {(scene.videoUrl || scene.isGeneratingVideo || scene.videoGenerationError) && (
              <div className={`relative w-full ${getAspectRatioClass()} bg-black rounded-lg overflow-hidden border border-purple-700 shadow-lg group/video mt-1`} style={getAspectRatioStyle()}>
                  {scene.isGeneratingVideo && !scene.videoUrl && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm z-30 p-4 text-center">
                           {scene.isUpscaling ? (
                               <>
                                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                                 <span className="text-base text-green-300 font-bold mb-1 animate-pulse">2단계: 고화질(HQ) 변환 중...</span>
                                 {progress > 0 && (
                                   <div className="w-full max-w-[80%] mt-2">
                                     <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                       <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${Math.round(progress)}%` }} />
                                     </div>
                                     <p className="text-xs text-green-400/80 mt-1 tabular-nums">{Math.round(progress)}%</p>
                                   </div>
                                 )}
                               </>
                           ) : (
                               <>
                                 <div className="w-full max-w-[85%] space-y-2">
                                   {/* Phase label */}
                                   <div className="flex items-center justify-center gap-2 mb-1">
                                     <div className={`w-5 h-5 flex-shrink-0 border-2 rounded-full animate-spin ${
                                       scene.videoModelUsed === VideoModel.VEO || scene.videoModelUsed === VideoModel.VEO_QUALITY
                                         ? 'border-violet-400 border-t-transparent'
                                         : 'border-blue-400 border-t-transparent'
                                     }`} />
                                     <span className={`text-sm font-bold ${
                                       scene.videoModelUsed === VideoModel.VEO || scene.videoModelUsed === VideoModel.VEO_QUALITY
                                         ? 'text-violet-300' : 'text-blue-300'
                                     }`}>
                                       {scene.generationStatus || (progress < 5 ? '📤 업로드 및 요청 중...' : progress < 30 ? '⏳ 대기열 처리 중...' : progress < 80 ? '🎬 영상 생성 중...' : '📦 인코딩 마무리 중...')}
                                     </span>
                                   </div>
                                   {/* Animated progress bar */}
                                   <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                     <div className={`h-full rounded-full transition-all duration-700 ease-out ${
                                       scene.videoModelUsed === VideoModel.VEO || scene.videoModelUsed === VideoModel.VEO_QUALITY
                                         ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                                         : 'bg-gradient-to-r from-blue-500 to-violet-500'
                                     }`} style={{ width: `${Math.max(2, Math.round(progress))}%` }} />
                                   </div>
                                   <div className="flex justify-between text-[10px] text-gray-500">
                                     <span>{progress < 5 ? '준비' : progress < 30 ? '대기' : progress < 80 ? '생성' : '마무리'}</span>
                                     <span className="tabular-nums font-medium text-white/70">{Math.round(progress)}%</span>
                                   </div>
                                 </div>
                               </>
                           )}
                           <button onClick={() => onCancelGeneration(scene.id)} className="mt-3 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm border border-gray-600 text-gray-400">작업 취소</button>
                      </div>
                  )}
                  {scene.videoUrl ? (
                      <div className="relative w-full h-full">
                          {scene.isGeneratingVideo && <div className="absolute top-2 left-2 z-40 flex items-center gap-1">{renderRegenMessage()}<button onClick={(e) => { e.stopPropagation(); onCancelGeneration(scene.id); }} className="bg-red-600 hover:bg-red-500 text-white text-sm px-2.5 py-1 rounded-r-full font-bold">✕</button></div>}
                          <video src={scene.videoUrl} className="w-full h-full object-contain bg-black" controls loop />
                          <a href={scene.videoUrl} target="_blank" rel="noopener noreferrer" download={`scene_${index+1}.mp4`} className="absolute top-2 right-2 bg-blue-600/80 p-1.5 rounded text-white text-sm hover:bg-blue-500 font-bold flex items-center gap-1 z-30">⬇️ 저장</a>
                      </div>
                  ) : scene.videoGenerationError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-30 p-4 text-center"><span className="text-2xl mb-2">⚠️</span><span className="text-sm text-red-400 font-bold mb-2">생성 실패</span><span className="text-xs text-gray-400">{scene.videoGenerationError}</span></div>
                  ) : null}
              </div>
          )}

          <div className="p-2 bg-gray-900/50 rounded-lg border border-gray-700 flex flex-col gap-2">

              {/* [UPDATED LAYOUT] Row 1: Grok (Full Width with settings) */}
              <div className="flex gap-1 h-9">
                   <button
                      onClick={() => onGenerateGrokHQ(scene.id)}
                      disabled={scene.isGeneratingVideo}
                      className={`flex-1 bg-gradient-to-r from-pink-700 to-rose-600 text-white text-sm font-bold rounded border border-pink-500/50 hover:from-pink-600 hover:to-rose-500 shadow-md flex items-center justify-center gap-1 transition-all ${scene.isGeneratingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                      {scene.videoUrl ? '🔄 Grok HQ' : '🚀 Grok HQ (720p)'}
                  </button>
                  <button onClick={() => useProjectStore.getState().updateScene(scene.id, { grokDuration: scene.grokDuration === '6' ? '10' : '6' })} className={`w-[20%] text-xs px-1 rounded font-mono border flex items-center justify-center ${scene.grokDuration === '6' ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-indigo-900/80 border-indigo-500 text-indigo-200'}`}>⏱️ {scene.grokDuration || '10'}s</button>
                  <button onClick={() => useProjectStore.getState().updateScene(scene.id, { grokSpeechMode: !scene.grokSpeechMode })} className={`w-[20%] text-xs px-1 rounded border flex items-center justify-center ${scene.grokSpeechMode ? 'bg-green-900/50 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>{scene.grokSpeechMode ? '🗣️ 대사' : '🔇 SFX'}</button>
              </div>

              <hr className="border-gray-700 my-0.5" />

              {/* [UPDATED LAYOUT] Row 2: Split Veo Fast / Veo Quality */}
              <div className="flex gap-1 h-9">
                  {/* Left: Veo 720p (Evolink) */}
                  <button
                       onClick={() => onGenerateVeoFast(scene.id)}
                       disabled={scene.isGeneratingVideo}
                       className={`flex-1 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white text-sm font-bold rounded border border-violet-400/50 shadow-md transition-all flex items-center justify-center gap-1 ${scene.isGeneratingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                       ⚡ Veo 720p (Fast)
                   </button>

                   {/* Right: Veo 1080p (Apimart) */}
                   <button
                       onClick={() => onGenerateVeoQuality(scene.id)}
                       disabled={scene.isGeneratingVideo}
                       className={`flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold rounded border border-violet-400/50 shadow-md transition-all flex items-center justify-center gap-1 ${scene.isGeneratingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                       💎 Veo 1080p (HQ)
                   </button>
              </div>

              {/* 이미지 모션 효과 — #427 */}
              <hr className="border-gray-700 my-0.5" />
              <div>
                <button
                  type="button"
                  onClick={() => setShowMotionPicker(!showMotionPicker)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm font-bold border transition-all ${
                    hasMotionEffect
                      ? 'bg-amber-900/30 border-amber-600/50 text-amber-300'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    🎬 이미지 모션
                    {hasMotionEffect && <span className="text-xs bg-amber-600/30 px-1 rounded">{sceneEffect?.panZoomPreset}</span>}
                  </span>
                  <span className="text-xs">{showMotionPicker ? '▲' : '▼'}</span>
                </button>
                {showMotionPicker && (
                  <div className="mt-1 space-y-1.5 animate-fade-in">
                    <div className="flex flex-wrap gap-1">
                      {COMPACT_PAN_ZOOM_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleMotionPresetChange(p.id)}
                          className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-bold border transition-all ${
                            sceneEffect?.panZoomPreset === p.id
                              ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                              : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                          }`}
                        >
                          <span>{p.icon}</span>
                          <span>{p.label}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAIMotionDetect}
                      disabled={!scene.scriptText?.trim()}
                      className="w-full py-1 text-xs font-bold rounded border border-amber-700/50 text-amber-400 hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      ✨ AI 자동 감지
                    </button>
                  </div>
                )}
              </div>
          </div>

          <div className="p-4 border-t border-gray-700 bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
              <button onClick={handleNativeHQToggle} className={`px-2 py-2 rounded text-sm border font-bold flex items-center justify-center gap-1 transition-all ${scene.isNativeHQ ? 'bg-orange-900/60 border-orange-500 text-orange-200' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>{scene.isNativeHQ ? '🚀 HQ ON' : '🚀 HQ OFF'}</button>
              <button onClick={() => useProjectStore.getState().updateScene(scene.id, { isInfographic: !scene.isInfographic })} className={`px-2 py-2 rounded text-sm border font-bold flex items-center justify-center gap-1 transition-all ${scene.isInfographic ? 'bg-blue-900/60 border-blue-500 text-blue-200' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>{scene.isInfographic ? '📊 Info ON' : '📊 Info OFF'}</button>
          </div>
          <div>
              <label className="text-sm font-bold text-gray-500 uppercase mb-1 flex items-center gap-2">📝 대본 (내레이션) {scene.audioScript && <span className="text-xs bg-green-600/20 text-green-300 px-1.5 py-0.5 rounded border border-green-500/30">🔊 Audio</span>}</label>
              {/* A-3: Debounced textarea — uses localScriptText */}
              <textarea value={localScriptText} onChange={(e) => setLocalScriptText(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-300 focus:border-blue-500 outline-none resize-none leading-relaxed" rows={4} title={scene.scriptText} />
          </div>
          {scene.scriptTextKO && (
          <div>
              <label className="text-sm font-bold text-blue-400 uppercase mb-1 flex items-center gap-2">🇰🇷 한국어 번역</label>
              <textarea
                  value={scene.scriptTextKO}
                  onChange={(e) => useProjectStore.getState().updateScene(scene.id, { scriptTextKO: e.target.value })}
                  className="w-full bg-blue-950/30 border border-blue-800/50 rounded-lg p-3 text-sm text-blue-200 focus:border-blue-500 outline-none resize-none leading-relaxed"
                  rows={3}
              />
          </div>
          )}
          <div className="flex justify-center"><button onClick={handleMagicClick} disabled={isAutoPrompting || !scene.scriptText.trim()} className={`w-full py-1.5 text-sm font-bold rounded flex items-center justify-center gap-1 ${isAutoPrompting ? 'bg-gray-700 text-gray-500' : 'bg-blue-900/30 text-blue-300 border border-blue-800 hover:bg-blue-800/50'}`}>{isAutoPrompting ? '✨ 변환 중...' : '✨ 대본 → 프롬프트 자동 변환'}</button></div>
          {scene.requiresTextRendering && (<div><label className="text-sm font-bold text-green-400 uppercase mb-1 block">Text Overlay</label><textarea value={scene.textToRender || ""} onChange={(e) => useProjectStore.getState().updateScene(scene.id, { textToRender: e.target.value })} className="w-full bg-gray-900 border border-green-700 rounded p-2 text-sm text-green-200 resize-none" rows={1} /></div>)}
          {/* A-3: Debounced visualPrompt textarea */}
          <div className="pt-1"><button onClick={() => setShowVisualPrompt(!showVisualPrompt)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-bold transition-all ${showVisualPrompt ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-gray-900/50 border-gray-700 text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}><span className="flex items-center gap-2">🎨 비주얼 프롬프트 (Visual Prompt)</span><span>{showVisualPrompt ? '▲ 숨기기' : '▼ 확인/수정'}</span></button>{showVisualPrompt && (<div className="mt-2 animate-fade-in"><textarea value={localVisualPrompt} onChange={(e) => setLocalVisualPrompt(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded p-3 text-sm text-gray-300 focus:border-purple-500 outline-none h-32 leading-relaxed" placeholder="AI에게 지시할 그림 묘사..." title={scene.visualPrompt}/></div>)}</div>
          <div className="flex justify-end gap-2 pt-1 flex-wrap"><button onClick={() => useProjectStore.getState().updateScene(scene.id, { requiresTextRendering: !scene.requiresTextRendering })} className={`px-2 py-1 rounded text-xs border ${scene.requiresTextRendering ? 'bg-green-900/30 border-green-600 text-green-400' : 'bg-gray-800 border-gray-600 text-gray-500'}`}>{scene.requiresTextRendering ? '텍스트 모드 ON' : '텍스트 모드 OFF'}</button><button onClick={() => onInjectCharacter(scene.id)} className="px-2 py-1 rounded text-xs border bg-gray-800 border-gray-600 text-gray-400 hover:text-white">캐릭터 고정</button></div>
      </div>
    </div>
    {showMediaSearch && (
      <Suspense fallback={null}>
        <MediaSearchModal
          isOpen={showMediaSearch}
          onClose={() => setShowMediaSearch(false)}
          onSelect={(item: CommunityMediaItem) => {
            useProjectStore.getState().updateScene(scene.id, {
              imageUrl: item.type === 'image' ? item.url : scene.imageUrl,
              communityMediaItem: item,
            });
          }}
          initialQuery={scene.scriptText.split(/[,.\s]+/).slice(0, 3).join(' ')}
        />
      </Suspense>
    )}
  </div>
  );
};

// A-1: Wrap with React.memo to prevent unnecessary re-renders
export const StoryboardScene = React.memo(StoryboardSceneInner);
