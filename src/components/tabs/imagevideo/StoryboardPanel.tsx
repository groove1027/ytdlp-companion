import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../../stores/projectStore';
import { useCostStore } from '../../../stores/costStore';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { generateSceneImage } from '../../../services/gemini/imageGeneration';
import { generatePromptFromScript } from '../../../services/gemini/imageAnalysis';
import { persistImage } from '../../../services/imageStorageService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { useVideoBatch } from '../../../hooks/useVideoBatch';
import { PRICING, IMAGE_MODELS } from '../../../constants';
import { AspectRatio, ImageModel, CharacterAppearance, VideoFormat } from '../../../types';
import type { Scene } from '../../../types';
import { showToast, useUIStore } from '../../../stores/uiStore';
import { useNavigationStore } from '../../../stores/navigationStore';
import ActionButton from '../../ui/ActionButton';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { logger } from '../../../services/LoggerService';

// --- 배치 진행 중 로테이팅 팁 ---
const BATCH_TIPS: string[] = [
  '이미지 한 장당 약 15~60초 정도 소요됩니다',
  '생성된 이미지가 마음에 안 들면 개별 장면에서 재생성할 수 있어요',
  '다른 구도로 변형 버튼으로 같은 장면의 다양한 앵글을 시도해보세요',
  '이미지 생성 후 영상으로 변환하면 더 생동감 있는 결과물을 얻을 수 있어요',
  '스타일 프리셋을 바꾸면 같은 대본도 완전히 다른 분위기로 표현됩니다',
  '배치 생성 중에도 완료된 장면은 바로 확인할 수 있어요',
];

// --- Aspect Ratio Helper ---

/** 프로젝트 설정의 AspectRatio → Tailwind CSS 클래스 */
function aspectRatioClass(ar?: string): string {
  switch (ar) {
    case AspectRatio.PORTRAIT: return 'aspect-[9/16]';
    case AspectRatio.SQUARE: return 'aspect-square';
    case AspectRatio.CLASSIC: return 'aspect-[4/3]';
    default: return 'aspect-video';
  }
}

// --- Constants ---

// [FIX #365] 하드코딩 제거 → 프로젝트 config.imageModel 사용 (스토리보드 내 드롭다운으로 변경 가능)

// --- Video Cost Helper ---
const getGrokCost = (duration?: '6' | '10' | '15'): number =>
  duration === '15' ? PRICING.VIDEO_GROK_15S : duration === '6' ? PRICING.VIDEO_GROK_6S : PRICING.VIDEO_GROK_10S;

const fmtCost = (usd: number, rate: number): string => {
  const krw = Math.round(usd * rate);
  return `$${usd.toFixed(2)} (~₩${krw.toLocaleString()})`;
};

// --- Helper: Sliding window batch runner ---

async function runImageBatch(
  items: Scene[],
  limit: number,
  fn: (scene: Scene) => Promise<boolean>,
  onSuccess: () => void,
  onFail: () => void,
) {
  const queue = [...items];
  const active: Promise<void>[] = [];
  while (queue.length > 0 || active.length > 0) {
    while (queue.length > 0 && active.length < limit) {
      const item = queue.shift()!;
      const p = fn(item).then((ok) => {
        if (ok) onSuccess(); else onFail();
      }).catch(() => {
        onFail();
      }).finally(() => {
        const idx = active.indexOf(p);
        if (idx > -1) active.splice(idx, 1);
      });
      active.push(p);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (active.length > 0) await Promise.race(active);
  }
}

// --- Small Action Button ---

const ActionBtn: React.FC<{
  title: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ title, disabled, className = '', onClick, children }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`w-7 h-7 rounded-lg border border-gray-700 bg-gray-900 flex items-center justify-center text-gray-400 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all ${className}`}
  >
    {children}
  </button>
);

// --- Utility ---

const fmtTime = (sec: number): string => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
};

// --- Scene Card ---

interface SceneCardProps {
  scene: Scene;
  index: number;
  onUpdatePrompt: (id: string, field: 'visualPrompt' | 'videoPrompt', value: string) => void;
  onDelete: (index: number) => void;
  onRegenerate: (id: string) => void;
  onTransform: (id: string) => void;
  onGrokVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onPlaySceneAudio?: (sceneId: string) => void;
  playingSceneId?: string | null;
  sceneProgress?: number;
  onAddAfter: (index: number) => void;
  onAutoPrompt: (id: string) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onOpenDetail: (scene: Scene, index: number) => void;
  onCopyScript?: (sceneId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, index, onUpdatePrompt, onDelete, onRegenerate, onTransform, onGrokVideo, onVeoVideo, onPlaySceneAudio, playingSceneId, sceneProgress, onAddAfter, onAutoPrompt, onReferenceUpload, onUploadImage, onOpenDetail, onCopyScript, isSelected, onToggleSelect }) => {
  const refInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  return (
  <div className={`bg-gray-800 border rounded-xl p-4 hover:border-gray-600 transition-colors ${isSelected ? 'border-orange-500/60 ring-1 ring-orange-500/30' : 'border-gray-700'}`}>
    <div className="flex gap-4">
      {/* Left: scene info */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Scene header */}
        <div className="flex items-center gap-2">
          {/* [#243] 장면 선택 체크박스 */}
          {onToggleSelect && (
            <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(scene.id)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-orange-500 focus:ring-orange-500/30 cursor-pointer flex-shrink-0" />
          )}
          <span className="text-base font-bold text-gray-200">장면 {index + 1}</span>
          {scene.startTime !== undefined && (
            <span className="text-xs bg-gray-900 text-gray-400 px-2 py-0.5 rounded border border-gray-700 font-mono">
              {fmtTime(scene.startTime)}{scene.endTime !== undefined ? ` ~ ${fmtTime(scene.endTime)}` : ''}
            </span>
          )}
          {scene.characterPresent && (
            <span className="text-sm bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
              char_1
            </span>
          )}
          {scene.castType && (
            <span className={`text-sm px-2 py-0.5 rounded-full border ${scene.castType === 'KEY_ENTITY' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
              {scene.castType === 'KEY_ENTITY' ? (scene.entityName || 'ENTITY') : scene.castType}
              {scene.entityComposition && scene.castType === 'KEY_ENTITY' && (
                <span className="ml-1 opacity-70 text-xs">
                  {scene.entityComposition === 'ENTITY_SOLO' ? '단독' : scene.entityComposition === 'ENTITY_WITH_MAIN' ? '동반' : scene.entityComposition === 'MAIN_OBSERVING' ? '관찰' : scene.entityComposition === 'ENTITY_FG_MAIN_BG' ? '전경' : '후경'}
                </span>
              )}
            </span>
          )}
          {scene.isPromptFiltered && (
            <span className="text-[10px] bg-yellow-600/20 text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 rounded" title="금칙어 필터됨">필터됨</span>
          )}
          {/* [#329] 장면별 인포그래픽 토글 */}
          {useProjectStore.getState().config?.allowInfographics && (
            <button type="button"
              onClick={() => useProjectStore.getState().updateScene(scene.id, { isInfographic: !scene.isInfographic })}
              className={`text-[10px] px-1.5 py-0.5 rounded border font-bold transition-colors ${scene.isInfographic ? 'bg-blue-600/20 text-blue-300 border-blue-500/30' : 'bg-gray-700/30 text-gray-500 border-gray-600 hover:text-gray-300 hover:border-gray-500'}`}
              title={scene.isInfographic ? '인포그래픽 모드 해제' : '인포그래픽 모드 켜기'}>
              {scene.isInfographic ? '📊 Info' : '📊 Off'}
            </button>
          )}
          <button type="button" onClick={() => onOpenDetail(scene, index)}
            className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-1.5 py-0.5 rounded transition-colors" title="모달에서 보기">
            상세
          </button>
        </div>

        {/* Narration + copy button */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">나레이션</span>
            {scene.scriptText && onCopyScript && (
              <button type="button" onClick={() => onCopyScript(scene.id)}
                className="text-[10px] text-gray-400 hover:text-cyan-400 border border-gray-700 hover:border-cyan-500/30 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                title="대본 복사">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                복사
              </button>
            )}
          </div>
          <p className="text-sm text-gray-300 mt-0.5 max-h-24 overflow-y-auto">{scene.scriptText || '(나레이션 없음)'}</p>
        </div>

        {/* 대사 미리보기 (v4.7) */}
        {scene.generatedDialogue && (
          <div className="bg-fuchsia-900/20 border border-fuchsia-500/20 rounded-lg px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider">💬 대사</span>
              {scene.dialogueSpeaker && <span className="text-[10px] text-fuchsia-300/70">— {scene.dialogueSpeaker}</span>}
              {scene.dialogueEmotion && <span className="text-[9px] bg-fuchsia-600/20 text-fuchsia-300 px-1.5 py-0.5 rounded-full border border-fuchsia-500/20">{scene.dialogueEmotion}</span>}
            </div>
            <p className="text-sm text-fuchsia-200/90 leading-relaxed">&ldquo;{scene.generatedDialogue}&rdquo;</p>
            {scene.dialogueSfx && <p className="text-[10px] text-gray-500">SFX: {scene.dialogueSfx}</p>}
          </div>
        )}

        {/* Audio strip — always visible when scene has audio or script */}
        {(scene.audioUrl || scene.scriptText) && onPlaySceneAudio && (
          <div className="flex items-center gap-2 bg-gray-900/40 rounded-lg px-2.5 py-1.5 border border-gray-700/50">
            <button type="button" onClick={(e) => { e.stopPropagation(); onPlaySceneAudio(scene.id); }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-colors ${
                scene.audioUrl ? 'bg-cyan-600/80 hover:bg-cyan-500' : 'bg-gray-600/80 hover:bg-gray-500'
              }`}
              title={scene.audioUrl ? '나레이션 재생' : 'TTS 재생'}>
              {playingSceneId === scene.id ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg className="w-3 h-3 ml-px" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500/60 rounded-full"
                style={{ width: playingSceneId === scene.id ? `${sceneProgress || 0}%` : '0%', transition: playingSceneId === scene.id ? 'none' : 'width 0.3s' }} />
            </div>
            <span className="text-xs text-gray-500 font-mono flex-shrink-0">
              {scene.audioDuration ? `${scene.audioDuration.toFixed(1)}s` : scene.audioUrl ? '' : 'TTS'}
            </span>
          </div>
        )}

        {/* Image prompt + auto prompt button */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">이미지 프롬프트</span>
            <button type="button" onClick={() => onAutoPrompt(scene.id)}
              className="text-[10px] text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-500/50 px-1.5 py-0.5 rounded transition-colors"
              title="대본 → 프롬프트 자동 변환">
              AI 프롬프트
            </button>
          </div>
          <textarea
            value={scene.visualPrompt}
            onChange={(e) => onUpdatePrompt(scene.id, 'visualPrompt', e.target.value)}
            rows={2}
            className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
            placeholder="이미지 프롬프트를 입력하세요..."
          />
        </div>

        {/* Reference image */}
        <div className="flex items-center gap-2">
          <input type="file" ref={refInputRef} accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onReferenceUpload(scene.id, f); e.target.value = ''; }} />
          <button type="button" onClick={() => refInputRef.current?.click()}
            className="text-[10px] text-gray-400 hover:text-gray-300 border border-gray-600 hover:border-gray-500 px-2 py-1 rounded transition-colors">
            레퍼런스 이미지
          </button>
          {scene.referenceImage && (
            <>
              <img src={scene.referenceImage} className="w-8 h-8 rounded border border-gray-600 object-cover" alt="ref" />
              <button type="button" onClick={() => useProjectStore.getState().updateScene(scene.id, { referenceImage: undefined })}
                className="text-[10px] text-red-400 hover:text-red-300">제거</button>
            </>
          )}
        </div>

        {/* Video prompt */}
        <div>
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">동영상 프롬프트</span>
          <textarea
            value={scene.videoPrompt ?? ''}
            onChange={(e) => onUpdatePrompt(scene.id, 'videoPrompt', e.target.value)}
            rows={2}
            className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            placeholder="동영상 프롬프트를 입력하세요..."
          />
        </div>

        {/* Action buttons — categorized with dividers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Image actions */}
          <ActionButton label="이미지 생성" color="orange"
            tooltip="이미지 생성" disabled={scene.isGeneratingImage}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
            onClick={() => onRegenerate(scene.id)} />
          <ActionButton label="변형" color="violet"
            tooltip="다른 구도로 변형" disabled={scene.isGeneratingImage}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
            onClick={() => onTransform(scene.id)} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          {/* Grok video actions */}
          <ActionButton label="Grok" color="pink"
            tooltip={`Grok 영상 (${scene.grokDuration || '15'}s ${scene.grokSpeechMode ? '나레이션' : 'SFX'}) — ${fmtCost(getGrokCost((scene.grokDuration || '15') as '6'|'10'|'15'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
            disabled={!scene.imageUrl || scene.isGeneratingVideo}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
            onClick={() => onGrokVideo(scene.id)} />
          <button type="button" title="Grok 6초/10초/15초 전환"
            onClick={() => useProjectStore.getState().updateScene(scene.id, { grokDuration: (scene.grokDuration === '6' ? '10' : scene.grokDuration === '10' ? '15' : '6') as '6' | '10' | '15' })}
            className="h-7 px-1.5 rounded-lg border border-pink-500/20 bg-pink-600/10 text-[10px] font-bold text-pink-300 hover:bg-pink-600/20 transition-all">
            {scene.grokDuration === '15' ? '15s' : scene.grokDuration === '6' ? '6s' : '10s'}
          </button>
          <ActionButton label={scene.grokSpeechMode ? '나레이션' : 'SFX'} color="fuchsia"
            tooltip="Grok SFX/나레이션 전환"
            onClick={() => useProjectStore.getState().updateScene(scene.id, { grokSpeechMode: !scene.grokSpeechMode })} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          {/* Veo video */}
          <ActionButton label="Veo 영상" color="blue"
            tooltip={`Veo 3.1 1080p — ${fmtCost(PRICING.VIDEO_VEO, useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
            disabled={!scene.imageUrl || scene.isGeneratingVideo}
            icon={<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 16.5v-9l7 4.5z"/></svg>}
            onClick={() => onVeoVideo(scene.id)} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          {/* Utility actions */}
          <ActionButton label="추가" color="green"
            tooltip="뒤에 장면 추가"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>}
            onClick={() => onAddAfter(index)} />
          <ActionButton label="상세" color="gray"
            tooltip="모달에서 상세보기"
            onClick={() => onOpenDetail(scene, index)} />
          <ActionButton label="삭제" color="red"
            tooltip="장면 삭제"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>}
            onClick={() => onDelete(index)} />
        </div>
      </div>

      {/* Right: thumbnail / video */}
      <div className="flex-shrink-0 w-40">
        {scene.videoUrl && !scene.isGeneratingVideo && !scene.imageUpdatedAfterVideo ? (
          <div className="relative group">
            <video
              src={scene.videoUrl}
              poster={scene.imageUrl}
              className="w-full h-24 object-cover rounded-lg border border-green-500/50 cursor-pointer"
              controls
              muted
              loop
              playsInline
            />
            <div className="absolute top-1 right-1 bg-green-500/80 text-white text-[9px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 pointer-events-none">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              영상
            </div>
          </div>
        ) : scene.imageUrl ? (
          <div className="relative group">
            <img
              src={scene.imageUrl}
              alt={`Scene ${index + 1}`}
              className={`w-full h-24 object-cover rounded-lg border ${scene.imageUpdatedAfterVideo ? 'border-orange-500/50' : 'border-gray-700'} cursor-pointer`}
              onClick={() => scene.imageUrl && useUIStore.getState().openLightbox(scene.imageUrl)}
            />
            {scene.imageUpdatedAfterVideo && scene.videoUrl && (
              <div className="absolute top-1 right-1 bg-orange-500/80 text-white text-[9px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 pointer-events-none">
                🖼 새 이미지
              </div>
            )}
            {scene.isGeneratingImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg">
                <div className="w-5 h-5 border-2 border-gray-500 border-t-orange-400 rounded-full animate-spin" />
                <span className="text-[9px] text-orange-300 mt-1 animate-pulse">생성 중</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="w-full h-24 bg-gray-900 border border-gray-700 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/40 hover:bg-gray-800/50 transition-colors"
            onClick={() => !scene.isGeneratingImage && uploadInputRef.current?.click()}
          >
            {scene.isGeneratingImage ? (
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 border-2 border-gray-500 border-t-orange-400 rounded-full animate-spin" />
                <span className="text-[9px] text-orange-300 mt-1 animate-pulse">생성 중</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5 text-gray-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span className="text-gray-600 text-[10px]">클릭하여 업로드</span>
              </>
            )}
          </div>
        )}
        <input type="file" ref={uploadInputRef} accept="image/*,video/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(scene.id, f); e.target.value = ''; }} />
        {scene.isGeneratingVideo && (
          <div className="mt-2 flex items-center gap-1.5 bg-blue-900/20 border border-blue-500/20 rounded-lg px-2 py-1">
            <div className="w-3 h-3 border border-gray-500 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-xs text-blue-400 animate-pulse font-medium">영상 생성중...</span>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

// --- Grid Scene Card (compact view) ---

interface GridSceneCardProps {
  scene: Scene;
  index: number;
  onRegenerate: (id: string) => void;
  onDelete: (index: number) => void;
  onGrokVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onPlaySceneAudio?: (sceneId: string) => void;
  playingSceneId?: string | null;
  sceneProgress?: number;
  onAddAfter: (index: number) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onOpenDetail: (scene: Scene, index: number) => void;
  onCopyScript?: (sceneId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const GridSceneCard: React.FC<GridSceneCardProps> = ({ scene, index, onRegenerate, onDelete, onGrokVideo, onVeoVideo, onPlaySceneAudio, playingSceneId, sceneProgress, onAddAfter, onReferenceUpload, onUploadImage, onOpenDetail, onCopyScript, isSelected, onToggleSelect }) => {
  const isThisPlaying = playingSceneId === scene.id;
  const gridUploadRef = useRef<HTMLInputElement>(null);
  const arClass = aspectRatioClass(useProjectStore((s) => s.config?.aspectRatio));

  return (
    <div className={`bg-gray-800 border rounded-xl overflow-hidden hover:border-gray-500 transition-colors ${isSelected ? 'border-orange-500/60 ring-1 ring-orange-500/30' : 'border-gray-700'}`}>
      {/* Image/Video area */}
      <div
        className={`relative ${arClass} bg-gray-900 cursor-pointer group`}
      >
        {/* [#243] 그리드 장면 선택 체크박스 */}
        {onToggleSelect && (
          <div className="absolute top-1.5 left-1.5 z-10" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(scene.id)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900/80 text-orange-500 focus:ring-orange-500/30 cursor-pointer" />
          </div>
        )}
        {scene.isGeneratingImage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <div className="relative">
              <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full" />
              <div className="absolute inset-0 animate-ping h-8 w-8 border border-orange-400/30 rounded-full" />
            </div>
            <span className="text-[10px] text-orange-300 mt-2 animate-pulse font-medium">이미지 생성 중...</span>
          </div>
        ) : scene.videoUrl && !scene.isGeneratingVideo && !scene.imageUpdatedAfterVideo ? (
          <video
            src={scene.videoUrl}
            poster={scene.imageUrl}
            className="w-full h-full object-cover"
            controls
            muted
            loop
            playsInline
          />
        ) : scene.imageUrl ? (
          <img
            src={scene.imageUrl}
            className="w-full h-full object-cover"
            alt={`Scene ${index + 1}`}
            onClick={() => scene.imageUrl && useUIStore.getState().openLightbox(scene.imageUrl)}
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 hover:text-orange-400/60 transition-colors"
            onClick={() => gridUploadRef.current?.click()}
          >
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span className="text-[10px]">클릭하여 업로드</span>
          </div>
        )}
        <input type="file" ref={gridUploadRef} accept="image/*,video/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(scene.id, f); e.target.value = ''; }} />
        {scene.videoUrl && !scene.isGeneratingVideo && (
          <div className="absolute top-1.5 right-1.5 bg-green-500/80 text-white text-[9px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 pointer-events-none">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            영상
          </div>
        )}
        {scene.isGeneratingVideo && (
          <div className="absolute top-1.5 right-1.5">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Audio play/pause overlay button — always visible when scene has audio or script */}
        {(scene.audioUrl || scene.scriptText) && onPlaySceneAudio && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPlaySceneAudio(scene.id); }}
            className={`absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-white transition-all z-10 ${
              isThisPlaying
                ? 'bg-cyan-500 shadow-lg shadow-cyan-500/30'
                : scene.audioUrl
                  ? 'bg-black/60 hover:bg-cyan-600/80'
                  : 'bg-black/60 hover:bg-gray-500/80'
            }`}
            title={isThisPlaying ? '정지' : scene.audioUrl ? '나레이션 재생' : 'TTS 재생'}
          >
            {isThisPlaying ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-3 h-3 ml-px" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
      {/* Audio progress bar (항상 표시) */}
      {(scene.audioUrl || scene.scriptText) && (
        <div className="h-1 bg-gray-700/60">
          <div
            className={`h-full rounded-r ${isThisPlaying ? 'bg-cyan-400' : 'bg-gray-600'}`}
            style={{ width: isThisPlaying ? `${sceneProgress || 0}%` : '0%', transition: isThisPlaying ? 'none' : 'width 0.3s' }}
          />
        </div>
      )}
      {/* Bottom info */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-300">#{index + 1}</span>
            {scene.audioUrl && (
              <span className="text-[10px] text-cyan-400/70 font-mono">
                {scene.audioDuration ? `${scene.audioDuration.toFixed(1)}s` : ''}
              </span>
            )}
            {scene.isPromptFiltered && <span className="text-[9px] bg-yellow-600/20 text-yellow-300 border border-yellow-500/30 px-1 rounded" title="금칙어 필터됨">필터</span>}
            {scene.characterPresent && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="캐릭터 출연" />}
            {scene.videoUrl && !scene.isGeneratingVideo && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="영상 완료" />}
            {/* [#329] 그리드 인포그래픽 토글 */}
            {useProjectStore.getState().config?.allowInfographics && (
              <button type="button" onClick={(e) => { e.stopPropagation(); useProjectStore.getState().updateScene(scene.id, { isInfographic: !scene.isInfographic }); }}
                className={`w-1.5 h-1.5 rounded-full ${scene.isInfographic ? 'bg-blue-400' : 'bg-gray-600'}`}
                title={scene.isInfographic ? '📊 인포그래픽 ON (클릭하여 끄기)' : '📊 인포그래픽 OFF (클릭하여 켜기)'} />
            )}
          </div>
          <div className="flex items-center gap-1">
            <ActionButton label="이미지" color="orange" compact
              tooltip="이미지 생성" disabled={scene.isGeneratingImage}
              icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onRegenerate(scene.id); }} />
            <ActionButton label="Grok" color="pink" compact
              tooltip={`Grok 영상 (${scene.grokDuration || '15'}s) — ${fmtCost(getGrokCost((scene.grokDuration || '15') as '6'|'10'|'15'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
              disabled={!scene.imageUrl || scene.isGeneratingVideo}
              icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onGrokVideo(scene.id); }} />
            <ActionButton label="Veo" color="blue" compact
              tooltip={`Veo 3.1 영상 — ${fmtCost(PRICING.VIDEO_VEO, useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
              disabled={!scene.imageUrl || scene.isGeneratingVideo}
              icon={<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 16.5v-9l7 4.5z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onVeoVideo(scene.id); }} />
            <ActionButton label="상세보기" color="gray" compact
              tooltip="상세보기"
              onClick={(e) => { e.stopPropagation(); onOpenDetail(scene, index); }} />
          </div>
        </div>
        {/* Narration text + copy + add scene */}
        <div className="flex items-start justify-between">
          <p className="text-[11px] text-gray-400 leading-snug flex-1 max-h-24 overflow-y-auto">{scene.scriptText || '(나레이션 없음)'}</p>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {scene.scriptText && onCopyScript && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onCopyScript(scene.id); }}
                className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-cyan-400 transition-colors" title="대본 복사">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            )}
            {scene.referenceImage && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="레퍼런스 이미지" />}
            <button type="button" onClick={(e) => { e.stopPropagation(); onAddAfter(index); }}
              className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-green-400 transition-colors" title="장면 추가">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`장면 #${index + 1}을 삭제할까요?`)) onDelete(index); }}
              className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors" title="장면 삭제">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Scene Detail Modal ---

interface SceneDetailModalProps {
  scene: Scene;
  index: number;
  onClose: () => void;
  onUpdatePrompt: (id: string, field: 'visualPrompt' | 'videoPrompt', value: string) => void;
  onRegenerate: (id: string) => void;
  onTransform: (id: string) => void;
  onGrokVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onDelete: (index: number) => void;
  onAutoPrompt: (id: string) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onAddAfter: (index: number) => void;
}

const SceneDetailModal: React.FC<SceneDetailModalProps> = ({
  scene: sceneProp, index, onClose, onUpdatePrompt, onRegenerate, onTransform, onGrokVideo, onVeoVideo, onDelete, onAutoPrompt, onReferenceUpload, onUploadImage, onAddAfter
}) => {
  // 스토어에서 최신 장면 데이터 구독 (stale prop 방지)
  const liveScene = useProjectStore((s) => s.scenes.find((sc) => sc.id === sceneProp.id));
  const scene = liveScene || sceneProp;
  const modalArClass = aspectRatioClass(useProjectStore((s) => s.config?.aspectRatio));
  const refInputRef = useRef<HTMLInputElement>(null);
  const modalUploadRef = useRef<HTMLInputElement>(null);

  // 경과 시간 타이머
  const isPrompting = !!scene.generationStatus && !scene.isGeneratingImage && !scene.isGeneratingVideo;
  const elapsedPrompt = useElapsedTimer(isPrompting);
  const elapsedImage = useElapsedTimer(scene.isGeneratingImage);
  const elapsedVideo = useElapsedTimer(scene.isGeneratingVideo);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-[720px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white">장면 #{index + 1}</span>
            {scene.startTime !== undefined && (
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded border border-gray-700 font-mono">
                {fmtTime(scene.startTime)}{scene.endTime !== undefined ? ` ~ ${fmtTime(scene.endTime)}` : ''}
              </span>
            )}
            {scene.characterPresent && (
              <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">캐릭터</span>
            )}
            {scene.castType && scene.castType !== 'MAIN' && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${scene.castType === 'KEY_ENTITY' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : scene.castType === 'NOBODY' ? 'bg-gray-600/20 text-gray-400 border-gray-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                {scene.castType === 'KEY_ENTITY' ? (scene.entityName || 'ENTITY') : scene.castType === 'NOBODY' ? '배경' : scene.castType === 'EXTRA' ? '엑스트라' : scene.castType}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Image & Video Preview */}
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">이미지</p>
                <div className="flex items-center gap-1.5">
                  <input type="file" ref={modalUploadRef} accept="image/*,video/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(scene.id, f); e.target.value = ''; }} />
                  <button type="button" onClick={() => modalUploadRef.current?.click()}
                    className="text-[10px] text-orange-400 hover:text-orange-300 border border-orange-500/30 hover:border-orange-500/50 px-2 py-0.5 rounded transition-colors">
                    직접 업로드
                  </button>
                  {(scene.imageUrl || scene.videoUrl) && (
                    <button type="button" onClick={() => {
                      useProjectStore.getState().updateScene(scene.id, { imageUrl: '', videoUrl: undefined });
                      showToast('이미지/영상 삭제됨');
                    }}
                      className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 px-2 py-0.5 rounded transition-colors">
                      삭제
                    </button>
                  )}
                </div>
              </div>
              {scene.imageUrl ? (
                <img src={scene.imageUrl} className="w-full rounded-xl border border-gray-700 cursor-pointer" alt="scene"
                  onClick={() => useUIStore.getState().openLightbox(scene.imageUrl!)}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const ar = useProjectStore.getState().config?.aspectRatio;
                    if (img.naturalWidth > 0 && ar) {
                      logger.trackMediaDimension({ sceneId: scene.id, type: 'image', requestedRatio: ar, actualWidth: img.naturalWidth, actualHeight: img.naturalHeight });
                    }
                  }} />
              ) : (
                <div
                  className={`w-full ${modalArClass} bg-gray-800 border border-gray-700 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/40 hover:bg-gray-800/80 transition-colors`}
                  onClick={() => modalUploadRef.current?.click()}
                >
                  <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span className="text-gray-600 text-sm">클릭하여 이미지/영상 업로드</span>
                </div>
              )}
            </div>
            {scene.videoUrl && (
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">영상</p>
                <video src={scene.videoUrl} controls className="w-full rounded-xl border border-gray-700" />
              </div>
            )}
          </div>

          {/* Narration */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">나레이션</p>
            <p className="text-sm text-gray-300 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">{scene.scriptText || '(나레이션 없음)'}</p>
          </div>

          {/* Image Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase">이미지 프롬프트</p>
              <button type="button" onClick={() => onAutoPrompt(scene.id)} disabled={isPrompting}
                className={`text-[10px] border px-2 py-0.5 rounded transition-colors ${isPrompting ? 'text-amber-400 border-amber-500/30 cursor-wait' : 'text-violet-400 hover:text-violet-300 border-violet-500/30 hover:border-violet-500/50'}`}>
                {isPrompting ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 border border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                    생성 중 {elapsedPrompt > 0 && <span className="tabular-nums">{formatElapsed(elapsedPrompt)}</span>}
                  </span>
                ) : 'AI 자동 생성'}
              </button>
            </div>
            {isPrompting && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-600/10 border border-violet-500/20 rounded-lg mb-1">
                <span className="w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                <span className="text-xs text-violet-300">{scene.generationStatus}</span>
              </div>
            )}
            <textarea value={scene.visualPrompt} onChange={(e) => onUpdatePrompt(scene.id, 'visualPrompt', e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
              placeholder="이미지 프롬프트를 입력하세요..." />
          </div>

          {/* Video Prompt */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">영상 프롬프트</p>
            <textarea value={scene.videoPrompt ?? ''} onChange={(e) => onUpdatePrompt(scene.id, 'videoPrompt', e.target.value)} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="영상 프롬프트를 입력하세요..." />
          </div>

          {/* Reference Image */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">레퍼런스 이미지</p>
            <div className="flex items-center gap-3">
              <input type="file" ref={refInputRef} accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onReferenceUpload(scene.id, f); e.target.value = ''; }} />
              <button type="button" onClick={() => refInputRef.current?.click()}
                className="text-xs text-gray-400 hover:text-gray-300 border border-gray-600 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
                파일 선택
              </button>
              {scene.referenceImage && (
                <>
                  <img src={scene.referenceImage} className="w-12 h-12 rounded-lg border border-gray-600 object-cover" alt="ref" />
                  <button type="button" onClick={() => useProjectStore.getState().updateScene(scene.id, { referenceImage: undefined })}
                    className="text-xs text-red-400 hover:text-red-300">제거</button>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons — unified, labeled */}
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">액션</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Image actions */}
              <button type="button" disabled={scene.isGeneratingImage} onClick={() => onRegenerate(scene.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingImage ? 'bg-orange-600/20 border-orange-500/30 text-orange-300 cursor-wait' : 'bg-orange-600/10 border-orange-500/20 text-orange-300 hover:bg-orange-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingImage ? (
                  <><span className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" /> 생성 중 {elapsedImage > 0 && <span className="tabular-nums text-xs text-orange-400/70">{formatElapsed(elapsedImage)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg> 이미지 생성</>
                )}
              </button>
              <button type="button" disabled={scene.isGeneratingImage} onClick={() => onTransform(scene.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingImage ? 'bg-blue-600/20 border-blue-500/30 text-blue-300 cursor-wait' : 'bg-blue-600/10 border-blue-500/20 text-blue-300 hover:bg-blue-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingImage ? (
                  <><span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> 변형 중 {elapsedImage > 0 && <span className="tabular-nums text-xs text-blue-400/70">{formatElapsed(elapsedImage)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> 변형 생성</>
                )}
              </button>
              {/* Image generation status */}
              {scene.isGeneratingImage && scene.generationStatus && (
                <div className="col-span-2 flex items-center gap-2 px-3 py-1.5 bg-orange-600/10 border border-orange-500/20 rounded-lg">
                  <span className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                  <span className="text-xs text-orange-300">{scene.generationStatus}</span>
                  {elapsedImage > 0 && <span className="text-xs text-orange-400/60 tabular-nums ml-auto">{formatElapsed(elapsedImage)}</span>}
                </div>
              )}
              {/* Video actions */}
              <button type="button" disabled={!scene.imageUrl || scene.isGeneratingVideo} onClick={() => onGrokVideo(scene.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingVideo ? 'bg-pink-600/20 border-pink-500/30 text-pink-300 cursor-wait' : 'bg-pink-600/10 border-pink-500/20 text-pink-300 hover:bg-pink-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingVideo ? (
                  <><span className="w-4 h-4 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin" /> 생성 중 {elapsedVideo > 0 && <span className="tabular-nums text-xs text-pink-400/70">{formatElapsed(elapsedVideo)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Grok 영상 ({scene.grokDuration || '15'}s {scene.grokSpeechMode ? '나레이션' : 'SFX'}) <span className="text-pink-400/60 text-xs ml-1">{fmtCost(getGrokCost((scene.grokDuration || '15') as '6'|'10'|'15'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}</span></>
                )}
              </button>
              <button type="button" disabled={!scene.imageUrl || scene.isGeneratingVideo} onClick={() => onVeoVideo(scene.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingVideo ? 'bg-blue-600/20 border-blue-500/30 text-blue-300 cursor-wait' : 'bg-blue-600/10 border-blue-500/20 text-blue-300 hover:bg-blue-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingVideo ? (
                  <><span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> 생성 중 {elapsedVideo > 0 && <span className="tabular-nums text-xs text-blue-400/70">{formatElapsed(elapsedVideo)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Veo 3.1 1080p <span className="text-blue-400/60 text-xs ml-1">{fmtCost(PRICING.VIDEO_VEO, useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}</span></>
                )}
              </button>
              {/* Video generation status */}
              {scene.isGeneratingVideo && (
                <div className="col-span-2 flex items-center gap-2 px-3 py-1.5 bg-pink-600/10 border border-pink-500/20 rounded-lg">
                  <span className="w-3 h-3 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin" />
                  <span className="text-xs text-pink-300">영상 생성 중...</span>
                  {elapsedVideo > 0 && <span className="text-xs text-pink-400/60 tabular-nums ml-auto">{formatElapsed(elapsedVideo)}</span>}
                </div>
              )}
              {/* Grok options row */}
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-xs text-gray-500">Grok 설정:</span>
                <button type="button"
                  onClick={() => useProjectStore.getState().updateScene(scene.id, { grokDuration: (scene.grokDuration === '6' ? '10' : scene.grokDuration === '10' ? '15' : '6') as '6' | '10' | '15' })}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${scene.grokDuration === '15' ? 'bg-pink-900/50 border-pink-400/40 text-pink-200' : scene.grokDuration === '6' ? 'bg-gray-800 border-gray-600 text-gray-400' : 'bg-pink-900/30 border-pink-500/30 text-pink-300'}`}>
                  {scene.grokDuration === '15' ? '15초' : scene.grokDuration === '6' ? '6초' : '10초'}
                </button>
                <button type="button"
                  onClick={() => useProjectStore.getState().updateScene(scene.id, { grokSpeechMode: !scene.grokSpeechMode })}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${scene.grokSpeechMode ? 'bg-fuchsia-900/30 border-fuchsia-500/30 text-fuchsia-300' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>
                  {scene.grokSpeechMode ? '나레이션 모드' : 'SFX 모드'}
                </button>
              </div>
              {/* [#329] 장면별 인포그래픽 토글 */}
              {useProjectStore.getState().config?.allowInfographics && (
                <div className="flex items-center gap-2 col-span-2">
                  <span className="text-xs text-gray-500">인포그래픽:</span>
                  <button type="button"
                    onClick={() => useProjectStore.getState().updateScene(scene.id, { isInfographic: !scene.isInfographic })}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${scene.isInfographic ? 'bg-blue-900/30 border-blue-500/30 text-blue-300' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>
                    {scene.isInfographic ? '📊 인포그래픽 ON' : '📊 인포그래픽 OFF'}
                  </button>
                </div>
              )}
            </div>
            {/* Destructive actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
              <button type="button" onClick={() => onAddAfter(index)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-400 hover:bg-green-900/20 border border-green-500/20 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                뒤에 장면 추가
              </button>
              <button type="button" onClick={() => { onDelete(index); onClose(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 border border-red-500/20 rounded-lg transition-colors ml-auto">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                장면 삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- StoryboardPanel Main ---

const StoryboardPanel: React.FC = () => {
  const scenes = useProjectStore((s) => s.scenes);
  const config = useProjectStore((s) => s.config);
  const updateScene = useProjectStore((s) => s.updateScene);
  const removeScene = useProjectStore((s) => s.removeScene);
  const setScenes = useProjectStore((s) => s.setScenes);
  const addCost = useCostStore((s) => s.addCost);
  const currentStyle = useImageVideoStore((s) => s.style);
  const enableWebSearch = useImageVideoStore((s) => s.enableWebSearch);
  const isMultiCharacter = useImageVideoStore((s) => s.isMultiCharacter);
  // 오디오 재생 상태
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const globalAnimRef = useRef<number>(0);
  const sceneAnimRef = useRef<number>(0);
  const globalSeekBarRef = useRef<HTMLDivElement | null>(null);
  const globalSeekingRef = useRef(false);
  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const [globalTime, setGlobalTime] = useState(0);
  const [globalDuration, setGlobalDuration] = useState(0);
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'preview'>('grid');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [detailScene, setDetailScene] = useState<{ scene: Scene; index: number } | null>(null);
  const [showGenDropdown, setShowGenDropdown] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  // [FIX #365] 이미지 모델 — Zustand 리액티브 셀렉터 (getState()는 UI 반영 안 됨)
  const storyboardImageModel = useProjectStore(s => s.config?.imageModel) || ImageModel.NANO_COST;
  const [isBatchingImages, setIsBatchingImages] = useState(false);
  const [batchImageProgress, setBatchImageProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });
  // [#243] 장면 선택 상태
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const { requireAuth } = useAuthGuard();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);

  // BUG#16: ref to track latest batch progress
  const batchImageProgressRef = useRef(batchImageProgress);
  batchImageProgressRef.current = batchImageProgress;

  // 배치 비디오 훅
  const videoBatch = useVideoBatch(scenes, setScenes, config, addCost);

  const completedImages = scenes.filter((s) => s.imageUrl && !s.isGeneratingImage).length;
  const completedVideos = scenes.filter((s) => s.videoUrl && !s.isGeneratingVideo).length;
  const videoEligible = scenes.filter((s) => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo).length;
  const imageEligible = scenes.filter((s) => !s.imageUrl && !s.isGeneratingImage).length;
  const exRate = useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE;

  const isAnyBatchRunning = isBatchingImages || videoBatch.isBatching;
  const elapsedBatch = useElapsedTimer(isAnyBatchRunning);
  const totalScenes = scenes.length;

  // [#243] 장면 선택 헬퍼
  const hasSelection = selectedSceneIds.size > 0;
  const toggleSceneSelect = useCallback((id: string) => {
    setSelectedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllScenes = useCallback(() => {
    setSelectedSceneIds(new Set(scenes.map(s => s.id)));
  }, [scenes]);
  const deselectAllScenes = useCallback(() => {
    setSelectedSceneIds(new Set());
  }, []);
  // 선택된 장면 기준 eligible 카운트 (선택 있으면 선택 내에서만, 없으면 전체)
  const selectedVideoEligible = hasSelection
    ? scenes.filter(s => selectedSceneIds.has(s.id) && s.imageUrl && !s.videoUrl && !s.isGeneratingVideo).length
    : videoEligible;
  const selectedImageEligible = hasSelection
    ? scenes.filter(s => selectedSceneIds.has(s.id) && !s.imageUrl && !s.isGeneratingImage).length
    : imageEligible;
  const selectedSceneIdsArray = useMemo(() => hasSelection ? Array.from(selectedSceneIds) : undefined, [selectedSceneIds, hasSelection]);

  // 배치 진행 중 로테이팅 팁
  const batchTip = useMemo(() => {
    const idx = Math.floor(elapsedBatch / 8) % BATCH_TIPS.length;
    return BATCH_TIPS[idx];
  }, [Math.floor(elapsedBatch / 8)]);

  // [#243] scenes 변경 시 없어진 장면 ID 정리
  useEffect(() => {
    const sceneIdSet = new Set(scenes.map(s => s.id));
    setSelectedSceneIds(prev => {
      const filtered = new Set([...prev].filter(id => sceneIdSet.has(id)));
      return filtered.size !== prev.size ? filtered : prev;
    });
  }, [scenes]);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showGenDropdown && !showDownloadDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showGenDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowGenDropdown(false);
      }
      if (showDownloadDropdown && downloadDropdownRef.current && !downloadDropdownRef.current.contains(e.target as Node)) {
        setShowDownloadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGenDropdown, showDownloadDropdown]);

  // --- 전체 오디오 재생 ---
  const startGlobalTick = useCallback(() => {
    const tick = () => {
      const audio = globalAudioRef.current;
      if (audio && !audio.paused && !globalSeekingRef.current) {
        setGlobalTime(audio.currentTime);
      }
      if (audio && !audio.paused) {
        globalAnimRef.current = requestAnimationFrame(tick);
      }
    };
    cancelAnimationFrame(globalAnimRef.current);
    globalAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const toggleGlobalPlay = useCallback(() => {
    const url = config?.mergedAudioUrl;
    if (!url) return;
    if (isGlobalPlaying && globalAudioRef.current) {
      globalAudioRef.current.pause();
      setIsGlobalPlaying(false);
      cancelAnimationFrame(globalAnimRef.current);
      return;
    }
    if (!globalAudioRef.current || globalAudioRef.current.src !== url) {
      globalAudioRef.current = new Audio(url);
      globalAudioRef.current.onloadedmetadata = () => setGlobalDuration(globalAudioRef.current!.duration);
      globalAudioRef.current.onended = () => { setIsGlobalPlaying(false); setGlobalTime(0); cancelAnimationFrame(globalAnimRef.current); };
    }
    globalAudioRef.current.play().then(() => { setIsGlobalPlaying(true); startGlobalTick(); }).catch((e) => { logger.trackSwallowedError('StoryboardPanel:globalPlay', e); });
  }, [config?.mergedAudioUrl, isGlobalPlaying, startGlobalTick]);

  const seekGlobalTo = useCallback((clientX: number) => {
    const bar = globalSeekBarRef.current;
    const audio = globalAudioRef.current;
    if (!bar || !audio) return;
    const dur = audio.duration || 0;
    if (dur <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * dur;
    setGlobalTime(ratio * dur);
  }, []);

  const handleGlobalSeekDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    globalSeekingRef.current = true;
    seekGlobalTo(e.clientX);
    const onMove = (ev: MouseEvent) => seekGlobalTo(ev.clientX);
    const onUp = () => {
      globalSeekingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [seekGlobalTo]);

  // --- 개별 장면 오디오 재생 (audioUrl 우선, 없으면 TTS 폴백) ---
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handlePlaySceneAudio = useCallback((sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    // 이미 재생 중이면 정지
    if (playingSceneId === sceneId) {
      sceneAudioRef.current?.pause();
      window.speechSynthesis.cancel();
      speechRef.current = null;
      setPlayingSceneId(null);
      setSceneProgress(0);
      cancelAnimationFrame(sceneAnimRef.current);
      return;
    }

    // 기존 재생 정지
    sceneAudioRef.current?.pause();
    window.speechSynthesis.cancel();
    speechRef.current = null;
    cancelAnimationFrame(sceneAnimRef.current);

    if (scene.audioUrl) {
      // audioUrl이 있으면 오디오 재생
      const audio = new Audio(scene.audioUrl);
      audio.preload = 'auto';
      sceneAudioRef.current = audio;
      setPlayingSceneId(sceneId);
      setSceneProgress(0);
      const tick = () => {
        if (audio && !audio.paused) {
          const dur = audio.duration || scene.audioDuration || 1;
          setSceneProgress(Math.min(100, (audio.currentTime / dur) * 100));
          sceneAnimRef.current = requestAnimationFrame(tick);
        }
      };
      audio.onended = () => { setPlayingSceneId(null); setSceneProgress(0); cancelAnimationFrame(sceneAnimRef.current); };
      audio.play().then(() => { sceneAnimRef.current = requestAnimationFrame(tick); }).catch(() => setPlayingSceneId(null));
    } else if (scene.scriptText) {
      // audioUrl 없으면 브라우저 TTS 폴백
      const utterance = new SpeechSynthesisUtterance(scene.scriptText);
      utterance.lang = 'ko-KR';
      speechRef.current = utterance;
      setPlayingSceneId(sceneId);
      setSceneProgress(0);
      utterance.onend = () => { setPlayingSceneId(null); setSceneProgress(0); speechRef.current = null; };
      utterance.onerror = () => { setPlayingSceneId(null); setSceneProgress(0); speechRef.current = null; };
      window.speechSynthesis.speak(utterance);
    }
  }, [scenes, playingSceneId]);

  // --- 대본 복사 ---
  const handleCopyScript = useCallback((sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene?.scriptText) { showToast('대본이 없습니다'); return; }
    navigator.clipboard.writeText(scene.scriptText).then(() => {
      showToast('대본이 클립보드에 복사되었습니다.');
    }).catch(() => {
      showToast('복사 실패');
    });
  }, [scenes]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(globalAnimRef.current);
      cancelAnimationFrame(sceneAnimRef.current);
      globalAudioRef.current?.pause();
      sceneAudioRef.current?.pause();
      window.speechSynthesis.cancel();
    };
  }, []);

  // --- 장면 추가 ---
  const handleAddSceneAfter = useCallback((index: number) => {
    useProjectStore.getState().addSceneAfter(index);
    showToast(`장면 ${index + 2} 추가됨`);
  }, []);

  // --- 대본 → 프롬프트 자동 변환 ---
  const handleAutoPrompt = useCallback(async (sceneId: string) => {
    logger.trackAction('프롬프트 자동 생성', sceneId);
    if (!requireAuth('AI 프롬프트 생성')) return;
    const scene = useProjectStore.getState().scenes.find(s => s.id === sceneId);
    if (!scene?.scriptText) { showToast('나레이션 텍스트가 없습니다'); return; }
    const currentConfig = useProjectStore.getState().config;
    // [CRITICAL FIX] 스타일 결정 — handleGenerateImage와 동일한 폴백 체인
    const rawStyle = useImageVideoStore.getState().style;
    const promptChars = useImageVideoStore.getState().characters;
    const promptCharArtStyle = promptChars.find(c => c.analysisStyle)?.analysisStyle || '';
    // [FIX] 캐릭터 analysisStyle이 atmosphere/detectedStyle보다 우선 — 그림체 보존
    const currentStyle = (rawStyle && rawStyle !== 'custom')
      ? rawStyle
      : (promptCharArtStyle.trim() !== '')
        ? promptCharArtStyle
        : (currentConfig?.atmosphere && currentConfig.atmosphere.trim() !== '')
          ? currentConfig.atmosphere
          : (currentConfig?.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
            ? currentConfig.detectedStyleDescription
            : 'Cinematic';
    try {
      updateScene(sceneId, { generationStatus: 'AI 프롬프트 생성 중...' });
      const allScenes = useProjectStore.getState().scenes;
      const idx = allScenes.findIndex(s => s.id === sceneId);
      const prevScene = idx > 0 ? allScenes[idx - 1] : undefined;
      const nextScene = idx < allScenes.length - 1 ? allScenes[idx + 1] : undefined;
      const chars = useImageVideoStore.getState().characters;
      const charDesc = chars.filter(c => c.analysisResult).map((c, i) => `[Character ${i + 1}: "${c.label}"]\n${c.analysisResult}`).join('\n\n') || undefined;
      const prompt = await generatePromptFromScript(scene.scriptText, currentStyle, currentConfig?.textForceLock, {
        prevSceneText: prevScene?.scriptText,
        nextSceneText: nextScene?.scriptText,
        prevScenePrompt: prevScene?.visualPrompt,
        nextScenePrompt: nextScene?.visualPrompt,
        globalContext: currentConfig?.globalContext,
        characterDesc: charDesc,
      });
      // [FIX] 프롬프트 재생성 시 — 기존 castType 보존 (AUTO 빈도 규칙 유지)
      // KEY_ENTITY 메타데이터만 리셋 (새 프롬프트와 맞지 않을 수 있음)
      updateScene(sceneId, {
        visualPrompt: prompt,
        generationStatus: undefined,
        entityName: scene.castType === 'KEY_ENTITY' ? undefined : scene.entityName,
        entityComposition: scene.castType === 'KEY_ENTITY' ? undefined : scene.entityComposition,
        characterAction: undefined,
      });
      showToast('프롬프트 생성 완료');
    } catch (e) {
      updateScene(sceneId, { generationStatus: undefined });
      showToast('프롬프트 생성 실패');
    }
  }, [updateScene, requireAuth]);

  // --- 레퍼런스 이미지 업로드 ---
  const handleReferenceUpload = useCallback((sceneId: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      updateScene(sceneId, { referenceImage: reader.result as string });
      showToast('레퍼런스 이미지 추가됨');
    };
    reader.readAsDataURL(file);
  }, [updateScene]);

  // --- 이미지/영상 직접 업로드 ---
  const handleUploadImage = useCallback(async (sceneId: string, file: File) => {
    const isVideo = file.type.startsWith('video/');
    updateScene(sceneId, { isGeneratingImage: true, generationStatus: '업로드 중...' });
    try {
      const url = await uploadMediaToHosting(file);
      if (isVideo) {
        updateScene(sceneId, { videoUrl: url, isGeneratingImage: false, generationStatus: undefined });
        showToast('영상 업로드 완료');
      } else {
        const sceneForUpload = useProjectStore.getState().scenes.find(s => s.id === sceneId);
        updateScene(sceneId, { imageUrl: url, isGeneratingImage: false, generationStatus: undefined, imageUpdatedAfterVideo: !!sceneForUpload?.videoUrl });
        showToast('이미지 업로드 완료');
      }
    } catch (err: unknown) {
      updateScene(sceneId, { isGeneratingImage: false, generationStatus: undefined });
      showToast(`업로드 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    }
  }, [updateScene]);

  // --- 프롬프트 수정 ---
  const handleUpdatePrompt = useCallback((id: string, field: 'visualPrompt' | 'videoPrompt', value: string) => {
    if (field === 'visualPrompt') {
      updateScene(id, { visualPrompt: value });
    } else {
      updateScene(id, { videoPrompt: value });
    }
  }, [updateScene]);

  // --- 단일 이미지 생성 (스토어에서 style/characters 읽기 — BUG#17 fix) ---
  const handleGenerateImage = useCallback(async (sceneId: string, feedback?: string): Promise<boolean> => {
    logger.trackAction('이미지 생성', sceneId);
    if (!requireAuth('이미지 생성')) return false;
    const { scenes: currentScenes, config: currentConfig } = useProjectStore.getState();
    let scene = currentScenes.find(s => s.id === sceneId);
    if (!scene || !currentConfig) return false;

    // [FIX] visualPrompt가 비어있으면 자동 생성 (대본 내용 기반)
    if (!feedback && (!scene.visualPrompt || !scene.visualPrompt.trim()) && scene.scriptText) {
      updateScene(sceneId, { generationStatus: '비주얼 프롬프트 자동 생성 중...' });
      try {
        const rawAutoStyle = useImageVideoStore.getState().style;
        const autoChars = useImageVideoStore.getState().characters;
        const autoCharArtStyle = autoChars.find(c => c.analysisStyle)?.analysisStyle || '';
        // [FIX] 캐릭터 analysisStyle이 atmosphere/detectedStyle보다 우선 — 그림체 보존
        const autoStyle = (rawAutoStyle && rawAutoStyle !== 'custom')
          ? rawAutoStyle
          : (autoCharArtStyle.trim() !== '')
            ? autoCharArtStyle
            : (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
              ? currentConfig.atmosphere
              : (currentConfig.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
                ? currentConfig.detectedStyleDescription
                : 'Cinematic';
        const sceneIdx = currentScenes.findIndex(s => s.id === sceneId);
        const prevScene = sceneIdx > 0 ? currentScenes[sceneIdx - 1] : undefined;
        const nextScene = sceneIdx < currentScenes.length - 1 ? currentScenes[sceneIdx + 1] : undefined;
        const currentCharactersForCtx = useImageVideoStore.getState().characters;
        const charDesc = currentCharactersForCtx.filter(c => c.analysisResult).map((c, i) => `[Character ${i + 1}: "${c.label}"]\n${c.analysisResult}`).join('\n\n') || undefined;
        const autoPrompt = await generatePromptFromScript(scene.scriptText, autoStyle, currentConfig.textForceLock, {
          prevSceneText: prevScene?.scriptText,
          nextSceneText: nextScene?.scriptText,
          prevScenePrompt: prevScene?.visualPrompt,
          nextScenePrompt: nextScene?.visualPrompt,
          globalContext: currentConfig.globalContext,
          characterDesc: charDesc,
        });
        updateScene(sceneId, { visualPrompt: autoPrompt });
        // 최신 장면 데이터 재읽기
        scene = useProjectStore.getState().scenes.find(s => s.id === sceneId)!;
      } catch (e) {
        logger.trackSwallowedError('StoryboardPanel:generateAutoPrompt', e);
        // 폴백: scriptText 자체를 visualPrompt로 사용
        updateScene(sceneId, { visualPrompt: scene.scriptText });
        scene = useProjectStore.getState().scenes.find(s => s.id === sceneId)!;
      }
    }

    updateScene(sceneId, { isGeneratingImage: true, generationStatus: '이미지 생성 중...', generationCancelled: false });

    try {
      const imageModel = currentConfig.imageModel || ImageModel.NANO_COST;

      // [FIX BUG#17] Read current style/characters from store getState() — always fresh
      const currentStyle = useImageVideoStore.getState().style;
      const currentCharacters = useImageVideoStore.getState().characters;

      // [CRITICAL FIX] 스타일 결정 — App.tsx 초기 배치 생성과 완전 동일한 로직
      // 1순위: 사용자가 스타일 팔레트에서 선택한 값 (useImageVideoStore.style)
      // 2순위: config.atmosphere (ScriptMode 프리셋 또는 visualTone 자동 저장값)
      // 3순위: config.detectedStyleDescription (SetupPanel Pro 분석 시 저장된 visualTone)
      // 4순위: 캐릭터 분석 예술 스타일 (analysisStyle) — 캐릭터 그림체 보존
      // 5순위: "Cinematic" 기본값
      const charArtStyle = currentCharacters.find(c => c.analysisStyle)?.analysisStyle || '';
      const userSelectedStyle = currentStyle !== 'custom';
      // [FIX] 캐릭터 analysisStyle이 atmosphere/detectedStyle보다 우선 — 그림체 보존
      const effectiveStyle = userSelectedStyle
        ? currentStyle
        : (charArtStyle.trim() !== '')
          ? charArtStyle
          : (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
            ? currentConfig.atmosphere
            : (currentConfig.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
              ? currentConfig.detectedStyleDescription
              : 'Cinematic';
      // [FIX #174] 커스텀 스타일 지시 병합 (handshake 제거, 다큐멘터리 톤 등)
      const customNote = useImageVideoStore.getState().customStyleNote?.trim();
      const finalStyle = customNote ? `${effectiveStyle}. ${customNote}` : effectiveStyle;
      // 사용자가 비주얼 미선택 + 캐릭터 아트 스타일로 폴백된 경우 → 캐릭터 그림체 보존 모드
      const preserveCharStyle = !userSelectedStyle && charArtStyle.trim() !== '' && effectiveStyle === charArtStyle;

      // [FIX #283] characterAppearance가 NONE이면 캐릭터 참조 이미지/분석 결과를 전달하지 않음
      const isCharNone = currentConfig.characterAppearance === CharacterAppearance.NONE;
      const charImages = isCharNone ? [] : (currentCharacters.length > 0
        ? currentCharacters.map(c => c.imageUrl || c.imageBase64).filter((v): v is string => !!v && (v.startsWith('http') || v.startsWith('data:')))
        : currentConfig.characterImage && (currentConfig.characterImage.startsWith('http') || currentConfig.characterImage.startsWith('data:')) ? [currentConfig.characterImage] : []);

      // [#391] 글로벌 스타일 레퍼런스 이미지 병합
      const globalStyleRefs = useImageVideoStore.getState().styleReferenceImages?.filter(Boolean) || [];
      if (globalStyleRefs.length > 0) {
        charImages.push(...globalStyleRefs);
      }

      // [NEW] Combine all character analysis results for visual consistency
      // [FIX #319] 캐릭터 이름(label)을 분석 결과에 포함하여 장면별 매칭 정확도 향상
      const combinedAnalysis = isCharNone ? '' : currentCharacters
        .filter(c => c.analysisResult)
        .map((c, i) => `[Character ${i + 1}: "${c.label}"]\n${c.analysisResult}`)
        .join('\n\n');

      // [NEW] Derive scene index for shot size auto-rotation
      const currentSceneIndex = currentScenes.findIndex(s => s.id === sceneId);

      // [NEW] 웹 검색 참조 모드 — store에서 읽기
      const currentWebSearch = useImageVideoStore.getState().enableWebSearch;

      const result = await generateSceneImage(
        scene,
        finalStyle,
        currentConfig.aspectRatio || AspectRatio.LANDSCAPE,
        imageModel,
        charImages,
        currentConfig.productImage,
        feedback,
        currentConfig.baseAge,
        false,
        (s: string) => updateScene(sceneId, { generationStatus: s }),
        currentConfig.isMixedMedia,
        currentConfig.detectedStyleDescription,
        currentConfig.textForceLock,
        currentConfig.globalContext,
        {
          lang: currentConfig.detectedLanguage,
          locale: currentConfig.detectedLocale,
          nuance: currentConfig.culturalNuance,
          langName: currentConfig.detectedLanguageName,
        },
        scene.shotSize,
        undefined,
        currentConfig.suppressText,
        combinedAnalysis || undefined,
        currentSceneIndex >= 0 ? currentSceneIndex : undefined,
        currentWebSearch,
        preserveCharStyle,
      );

      const imageUrl = result.url;

      // BUG#8: 취소된 생성 결과 폐기
      const afterGen = useProjectStore.getState().scenes.find(s => s.id === sceneId);
      if (afterGen?.generationCancelled) {
        updateScene(sceneId, { generationCancelled: false, isGeneratingImage: false, generationStatus: undefined });
        return false;
      }

      const sceneAfterGen = useProjectStore.getState().scenes.find(s => s.id === sceneId);
      updateScene(sceneId, {
        imageUrl,
        isGeneratingImage: false,
        generationStatus: undefined,
        isPromptFiltered: result.isFiltered || false,
        imageUpdatedAfterVideo: !!sceneAfterGen?.videoUrl,
      });

      const cost = result.isFallback
        ? PRICING.IMAGE_GENERATION_FALLBACK
        : PRICING.IMAGE_GENERATION;
      addCost(cost, 'image');

      // Background: Base64 → Cloudinary
      persistImage(imageUrl).then(persistedUrl => {
        const current = useProjectStore.getState().scenes.find(s => s.id === sceneId);
        if (current && current.imageUrl === imageUrl && persistedUrl !== imageUrl) {
          updateScene(sceneId, { imageUrl: persistedUrl });
        }
      }).catch(() => { /* keep original URL fallback */ });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateScene(sceneId, { isGeneratingImage: false, generationStatus: `실패: ${msg}` });
      return false;
    }
  }, [updateScene, addCost, requireAuth]);

  // --- 배치 이미지 생성 ---
  const handleBatchGenerateImages = useCallback(async (sceneIds?: string[]) => {
    logger.trackAction('이미지 일괄 생성');
    if (!requireAuth('이미지 일괄 생성')) return;
    const { scenes: currentScenes } = useProjectStore.getState();
    const allTargets = currentScenes.filter(s => !s.imageUrl && !s.isGeneratingImage);
    // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
    const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
    if (targets.length === 0) return;

    setIsBatchingImages(true);
    setBatchImageProgress({ current: 0, total: targets.length, success: 0, fail: 0 });

    await runImageBatch(
      targets,
      20,
      async (scene) => handleGenerateImage(scene.id),
      () => setBatchImageProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        success: prev.success + 1,
      })),
      () => setBatchImageProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        fail: prev.fail + 1,
      })),
    );

    // BUG#16: 배치 완료 후 성공/실패 요약 표시
    const finalProgress = batchImageProgressRef.current;
    if (finalProgress.fail > 0) {
      showToast(`${finalProgress.fail}개 장면 이미지 생성 실패 (${finalProgress.success}개 성공)`, 5000);
    } else {
      showToast(`${finalProgress.success}개 장면 이미지 생성 완료`);
    }

    setIsBatchingImages(false);
  }, [handleGenerateImage, requireAuth]);

  // [FIX #175-1] 자동 이미지 생성 제거 — 빈 슬롯으로 시작, 사용자가 직접 생성 버튼 클릭 시에만 생성
  // ⚠️ [절대 규칙] 스토리보드 생성 후 이미지 자동 생성 금지 — 비용 절감을 위해 사용자가 한두 컷 시험 후 일괄 생성하는 설계

  // --- 배치 진행 상태 ---
  const batchCurrent = isBatchingImages ? batchImageProgress.current : videoBatch.batchProgress.current;
  const batchTotal = isBatchingImages ? batchImageProgress.total : videoBatch.batchProgress.total;
  const batchPercent = batchTotal > 0 ? Math.round((batchCurrent / batchTotal) * 100) : 0;

  return (
    <>
      {/* Top status */}
      {totalScenes > 0 && (completedImages > 0 || completedVideos > 0) && (
        <div className="mb-4 flex items-center gap-4">
          {completedImages > 0 && (
            <span className="text-base text-green-400 font-medium">
              이미지 ({completedImages}/{totalScenes})
            </span>
          )}
          {completedVideos > 0 && (
            <span className="text-base text-blue-400 font-medium">
              영상 ({completedVideos}/{totalScenes})
            </span>
          )}
        </div>
      )}

      {/* [FIX #266] 이미지 미생성 시 안내 배너 — 비용 절감을 위해 자동 생성하지 않음 */}
      {totalScenes > 0 && completedImages === 0 && !isAnyBatchRunning && (
        <div className="mb-4 bg-gradient-to-r from-orange-900/30 to-amber-900/20 border border-orange-500/40 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-300 mb-1">이미지를 먼저 한두 컷 시험해보세요!</p>
              <p className="text-xs text-orange-200/70 leading-relaxed">
                비용 절감을 위해 이미지는 자동 생성되지 않습니다.
                장면 카드의 <span className="font-semibold text-orange-300">이미지</span> 버튼을 눌러 한두 컷 먼저 확인한 뒤,
                마음에 들면 상단의 <span className="font-semibold text-orange-300">이미지/영상 생성 &gt; 이미지 일괄 생성</span>으로
                전체를 한번에 만들 수 있어요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Batch progress bar — 향상된 진행 패널 */}
      {isAnyBatchRunning && (
        <div className={`mb-4 rounded-xl border p-4 space-y-3 ${
          isBatchingImages
            ? 'bg-orange-900/20 border-orange-500/30'
            : 'bg-blue-900/20 border-blue-500/30'
        }`}>
          {/* 헤더: 스피너 + 라벨 + 카운터 */}
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 border-2 rounded-full animate-spin ${
              isBatchingImages
                ? 'border-orange-400 border-t-transparent'
                : 'border-blue-400 border-t-transparent'
            }`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold ${isBatchingImages ? 'text-orange-300' : 'text-blue-300'}`}>
                {isBatchingImages ? '이미지 일괄 생성' : '영상 일괄 생성'}
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <span className="tabular-nums">{formatElapsed(elapsedBatch)} 경과</span>
                {batchCurrent > 0 && elapsedBatch > 0 && (
                  <span className="text-gray-500">
                    · 예상 남은 시간 <span className={`font-medium ${isBatchingImages ? 'text-orange-400' : 'text-blue-400'}`}>
                      {formatElapsed(Math.max(0, Math.round((elapsedBatch / batchCurrent) * (batchTotal - batchCurrent))))}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`text-lg font-bold tabular-nums ${isBatchingImages ? 'text-orange-300' : 'text-blue-300'}`}>
                {batchCurrent}/{batchTotal}
              </span>
              {isBatchingImages && batchImageProgress.fail > 0 && (
                <div className="text-xs text-red-400 mt-0.5">{batchImageProgress.fail}개 실패</div>
              )}
            </div>
          </div>

          {/* 프로그레스 바 */}
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${batchPercent}%` }}
              className={`h-full rounded-full transition-all duration-700 ${
                isBatchingImages
                  ? batchImageProgress.fail > 0 ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'
                  : 'bg-gradient-to-r from-blue-500 to-violet-500'
              }`}
            />
          </div>

          {/* 로테이팅 팁 (이미지 배치 시만) */}
          {isBatchingImages && (
            <div className="flex items-start gap-2 pt-1">
              <span className="text-xs text-orange-400 flex-shrink-0 mt-px">💡</span>
              <p className="text-xs text-gray-400">{batchTip}</p>
            </div>
          )}
        </div>
      )}

      {/* 전체 오디오 플레이어 (사운드 스튜디오에서 전송된 경우) */}
      {config?.mergedAudioUrl && (
        <div className="mb-4 bg-gray-800/60 border border-cyan-500/20 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggleGlobalPlay}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 transition-all flex-shrink-0">
              {isGlobalPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <div ref={globalSeekBarRef} onMouseDown={handleGlobalSeekDown}
              className="flex-1 h-2 bg-gray-700/50 rounded-full cursor-pointer relative group">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                style={{ width: `${globalDuration > 0 ? (globalTime / globalDuration) * 100 : 0}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `calc(${globalDuration > 0 ? (globalTime / globalDuration) * 100 : 0}% - 6px)` }} />
            </div>
            <span className="text-sm text-gray-400 font-mono flex-shrink-0">
              {fmtTime(globalTime)} / {fmtTime(globalDuration)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">전체 나레이션 오디오 ({totalScenes}개 장면 매핑)</p>
        </div>
      )}

      {/* Header + actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">
            스토리보드 <span className="text-gray-400 text-lg font-normal">({totalScenes}개)</span>
          </h2>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'preview' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              미리보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              그리드
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              리스트
            </button>
          </div>
          {/* [#344] 전체 선택 체크박스 */}
          {totalScenes > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedSceneIds.size === totalScenes && totalScenes > 0}
                ref={(el) => { if (el) el.indeterminate = hasSelection && selectedSceneIds.size !== totalScenes; }}
                onChange={(e) => e.target.checked ? selectAllScenes() : deselectAllScenes()}
                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-orange-500 focus:ring-orange-500/30 cursor-pointer"
              />
              <span className={`text-xs transition-colors ${hasSelection ? 'text-orange-300' : 'text-gray-400 group-hover:text-gray-200'}`}>
                {hasSelection ? `${selectedSceneIds.size}/${totalScenes} 선택` : '전체 선택'}
              </span>
            </label>
          )}
          {/* [#346] 전체 프롬프트 복사 */}
          {totalScenes > 0 && (
            <button
              type="button"
              onClick={async () => {
                const promptText = scenes
                  .map((s, i) => `[장면 ${i + 1}]\n${s.visualPrompt || '(프롬프트 없음)'}`)
                  .join('\n\n');
                await navigator.clipboard.writeText(promptText);
                showToast(`${scenes.length}개 장면의 프롬프트가 복사되었습니다.`);
              }}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5"
            >
              📋 프롬프트 복사
            </button>
          )}
          {/* HTML/ZIP 저장 (30장면 이상이면 ZIP 자동 선택) */}
          <button
            type="button"
            onClick={async () => {
              try {
                if (totalScenes >= 30) {
                  const { exportProjectZip } = await import('../../../services/exportService');
                  await exportProjectZip();
                  showToast('ZIP 파일이 저장되었습니다.');
                } else {
                  const { exportProjectHtml } = await import('../../../services/exportService');
                  await exportProjectHtml();
                  showToast('HTML 파일이 저장되었습니다.');
                }
              } catch (e: unknown) {
                showToast('저장 실패: ' + (e instanceof Error ? e.message : String(e)));
              }
            }}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5"
          >
            {totalScenes >= 30 ? '📦 스토리보드 저장' : '💾 스토리보드 저장'}
          </button>
          {/* Download dropdown */}
          <div className="relative" ref={downloadDropdownRef}>
            <button
              type="button"
              onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
              disabled={completedImages === 0 && completedVideos === 0}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5"
            >
              ⬇️ 다운로드
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {showDownloadDropdown && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadAllMedia } = await import('../../../services/exportService');
                    await downloadAllMedia();
                  }}
                  disabled={completedImages === 0 && completedVideos === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-gradient-to-r hover:from-orange-600/20 hover:to-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-bold"
                >
                  <span className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-400 to-blue-400" />
                  📦 통합 다운로드
                  <span className="ml-auto text-[11px] text-gray-400">{completedImages + completedVideos}개</span>
                </button>
                <div className="border-t border-gray-700" />
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadImages } = await import('../../../services/exportService');
                    await downloadImages();
                  }}
                  disabled={completedImages === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  이미지 일괄 다운로드
                  <span className="ml-auto text-[11px] text-gray-500">{completedImages}장</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadImagesAsMp4 } = await import('../../../services/exportService');
                    await downloadImagesAsMp4();
                  }}
                  disabled={completedImages === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  🎬 이미지→MP4 변환
                  <span className="ml-auto text-[11px] text-gray-500">{completedImages}장</span>
                </button>
                <div className="border-t border-gray-700" />
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadVideos } = await import('../../../services/exportService');
                    await downloadVideos();
                  }}
                  disabled={completedVideos === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  영상 일괄 다운로드
                  <span className="ml-auto text-[11px] text-gray-500">{completedVideos}편</span>
                </button>
                <div className="border-t border-gray-700" />
                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadDropdown(false);
                    if (confirm('모든 이미지를 삭제할까요? (대본은 유지됩니다)')) {
                      useProjectStore.getState().clearAllSceneImages();
                    }
                  }}
                  disabled={completedImages === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  이미지 전체 삭제
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadDropdown(false);
                    if (confirm('모든 영상을 삭제할까요? (이미지와 대본은 유지됩니다)')) {
                      useProjectStore.getState().clearAllSceneVideos();
                    }
                  }}
                  disabled={completedVideos === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  영상 전체 삭제
                </button>
              </div>
            )}
          </div>
          {/* Generate dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowGenDropdown(!showGenDropdown)}
              disabled={totalScenes === 0 || isAnyBatchRunning}
              className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-bold px-4 py-2.5 rounded-lg transition-all shadow-lg flex items-center gap-1.5"
            >
              {isAnyBatchRunning ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 생성 중...{elapsedBatch > 0 && <span className="text-xs text-white/60 tabular-nums">{formatElapsed(elapsedBatch)}</span>}</>
              ) : (
                <>
                  이미지/영상 생성
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </>
              )}
            </button>

            {showGenDropdown && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* [FIX #365] 이미지 모델 선택 */}
                <div className="px-4 py-2.5 border-b border-gray-700">
                  <label className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1.5 block">이미지 모델</label>
                  <select
                    value={storyboardImageModel}
                    onChange={(e) => useProjectStore.getState().setConfig(prev => prev ? { ...prev, imageModel: e.target.value as ImageModel } : prev)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                  >
                    {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                {/* [#243] 선택 모드 안내 */}
                {hasSelection && (
                  <div className="px-4 py-1.5 bg-orange-600/10 border-b border-orange-500/20">
                    <span className="text-[11px] text-orange-300 font-medium">선택한 {selectedSceneIds.size}개 장면만 생성</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { handleBatchGenerateImages(selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 text-base text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="flex-1">이미지 {hasSelection ? `${selectedImageEligible}개` : '일괄'} 생성</span>
                  <span className="text-[10px] text-orange-400/70">{fmtCost(PRICING.IMAGE_GENERATION * selectedImageEligible, exRate)}</span>
                </button>
                {selectedImageEligible > 0 && selectedVideoEligible === 0 && totalScenes > 0 && (
                  <p className="px-4 py-1 text-[10px] text-yellow-400/80 bg-yellow-600/10">⚠️ 이미지가 없는 장면은 영상 생성 불가 — 이미지를 먼저 생성해주세요</p>
                )}
                <div className="border-t border-gray-700" />
                <p className="px-4 py-1 text-xs text-gray-500 font-bold uppercase">Grok 720p (Kie)</p>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('6', false, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-pink-400" />
                  <span className="flex-1">Grok SFX Only 6초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-pink-400/70">{fmtCost(PRICING.VIDEO_GROK_6S * selectedVideoEligible, exRate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('10', false, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-pink-400" />
                  <span className="flex-1">Grok SFX Only 10초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-pink-400/70">{fmtCost(PRICING.VIDEO_GROK_10S * selectedVideoEligible, exRate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('15', false, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-pink-400" />
                  <span className="flex-1">Grok SFX Only 15초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-pink-400/70">{fmtCost(PRICING.VIDEO_GROK_15S * selectedVideoEligible, exRate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('6', true, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                  <span className="flex-1">Grok 나레이션 6초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-fuchsia-400/70">{fmtCost(PRICING.VIDEO_GROK_6S * selectedVideoEligible, exRate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('10', true, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                  <span className="flex-1">Grok 나레이션 10초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-fuchsia-400/70">{fmtCost(PRICING.VIDEO_GROK_10S * selectedVideoEligible, exRate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGrokHQBatch('15', true, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                  <span className="flex-1">Grok 나레이션 15초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-fuchsia-400/70">{fmtCost(PRICING.VIDEO_GROK_15S * selectedVideoEligible, exRate)}</span>
                </button>
                <div className="border-t border-gray-700" />
                <p className="px-4 py-1 text-xs text-gray-500 font-bold uppercase">Veo 3.1 1080p (Evolink)</p>
                <button
                  type="button"
                  onClick={() => { videoBatch.runVeoFastBatch(selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="flex-1">Veo 3.1 1080p {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-blue-400/70">{fmtCost(PRICING.VIDEO_VEO * selectedVideoEligible, exRate)}</span>
                </button>
                {selectedVideoEligible > 0 && (
                  <p className="px-4 py-1.5 text-[10px] text-gray-500 border-t border-gray-700/50">
                    {hasSelection ? `선택 ${selectedSceneIds.size}개 중 ` : ''}대상 {selectedVideoEligible}개 장면 × 건당 비용 = 예상 합계
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {/* 편집실로 이동 — 이미지/영상 생성 버튼과 같은 행, 같은 크기 */}
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => useNavigationStore.getState().setActiveTab('edit-room')}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-base font-bold px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            편집실로 이동
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>
        </div>
      </div>

      {/* 설정 옵션 배지 */}
      {totalScenes > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {/* 비주얼 스타일 */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-600/20 text-orange-300 border border-orange-500/30">
            🎨 {currentStyle === 'custom' ? '자동 스타일' : currentStyle.length > 15 ? currentStyle.slice(0, 15) + '…' : currentStyle}
          </span>
          {/* 캐릭터 빈도 */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30">
            👤 {config?.characterAppearance === CharacterAppearance.ALWAYS ? '항상 출연' : config?.characterAppearance === CharacterAppearance.MINIMAL ? '최소 출연' : config?.characterAppearance === CharacterAppearance.NONE ? '출연 안함' : '자동'}
          </span>
          {/* 조건부 ON 배지들 */}
          {config?.allowInfographics && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-600/20 text-green-300 border border-green-500/30">
              🎬 인포그래픽
            </span>
          )}
          {config?.textForceLock && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30">
              🔤 텍스트 언어 고정
            </span>
          )}
          {config?.suppressText && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-600/20 text-red-300 border border-red-500/30">
              🚫 텍스트 금지
            </span>
          )}
          {enableWebSearch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
              🔍 웹 검색 참조
            </span>
          )}
          {config?.isMixedMedia && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
              🎭 스타일 독립
            </span>
          )}
          {isMultiCharacter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-600/20 text-violet-300 border border-violet-500/30">
              👥 멀티캐릭터
            </span>
          )}
        </div>
      )}

      {/* Scene Detail Modal */}
      {detailScene && (
        <SceneDetailModal
          scene={detailScene.scene}
          index={detailScene.index}
          onClose={() => setDetailScene(null)}
          onUpdatePrompt={handleUpdatePrompt}
          onRegenerate={(id) => handleGenerateImage(id)}
          onTransform={(id) => handleGenerateImage(id, '다른 구도와 색감으로 변형해주세요')}
          onGrokVideo={(id) => videoBatch.runSingleGrokHQ(id)}
          onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
          onDelete={removeScene}
          onAutoPrompt={handleAutoPrompt}
          onReferenceUpload={handleReferenceUpload}
          onUploadImage={handleUploadImage}
          onAddAfter={handleAddSceneAfter}
        />
      )}

      {/* Scene list / grid / preview */}
      {totalScenes === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg mb-2">장면이 없습니다</p>
          <p className="text-sm">대본작성 탭에서 장면 분석을 먼저 실행하세요.</p>
        </div>
      ) : viewMode === 'preview' ? (
        <div className="space-y-4">
          {/* 메인 미리보기 (현재 장면 크게) */}
          {scenes[previewIndex] && (
            <div className="relative bg-black rounded-2xl overflow-hidden border border-gray-700 shadow-2xl">
              {/* 장면 번호 + 자막 오버레이 */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black/70 text-white text-sm font-bold rounded-lg backdrop-blur-sm">
                  장면 {previewIndex + 1} / {totalScenes}
                </span>
                {scenes[previewIndex].videoUrl && (
                  <span className="px-2 py-0.5 bg-blue-600/80 text-white text-xs font-bold rounded backdrop-blur-sm">영상</span>
                )}
              </div>
              {/* 좌우 네비게이션 */}
              {previewIndex > 0 && (
                <button type="button" onClick={() => setPreviewIndex(previewIndex - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all backdrop-blur-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                </button>
              )}
              {previewIndex < scenes.length - 1 && (
                <button type="button" onClick={() => setPreviewIndex(previewIndex + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-all backdrop-blur-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
              )}
              {/* 메인 미디어 */}
              {scenes[previewIndex].videoUrl ? (
                <video key={scenes[previewIndex].id} src={scenes[previewIndex].videoUrl} controls playsInline autoPlay muted className="w-full max-h-[70vh] object-contain bg-black" />
              ) : scenes[previewIndex].imageUrl ? (
                <img src={scenes[previewIndex].imageUrl} alt={`장면 ${previewIndex + 1}`} className="w-full max-h-[70vh] object-contain" />
              ) : (
                <div className="w-full h-80 flex items-center justify-center text-gray-500 text-lg">이미지 없음</div>
              )}
              {/* 하단 자막 오버레이 */}
              {scenes[previewIndex].scriptText && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 py-4">
                  <p className="text-white text-base leading-relaxed text-center drop-shadow-lg">{scenes[previewIndex].scriptText}</p>
                </div>
              )}
            </div>
          )}
          {/* 하단 필름스트립 (나머지 장면 작게) */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
              {scenes.map((scene, idx) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setPreviewIndex(idx)}
                  className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                    idx === previewIndex
                      ? 'border-orange-500 ring-2 ring-orange-500/40 scale-105'
                      : 'border-gray-700 hover:border-gray-500 opacity-70 hover:opacity-100'
                  }`}
                  style={{ width: 120, height: 68 }}
                >
                  {scene.videoUrl || scene.imageUrl ? (
                    <img
                      src={scene.videoUrl ? scene.imageUrl || '' : scene.imageUrl || ''}
                      alt={`${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
                      {idx + 1}
                    </div>
                  )}
                  <span className={`absolute bottom-0.5 left-0.5 px-1 py-0.5 text-[9px] font-bold rounded ${
                    idx === previewIndex ? 'bg-orange-500 text-white' : 'bg-black/60 text-gray-300'
                  }`}>
                    {idx + 1}
                  </span>
                  {scene.videoUrl && (
                    <span className="absolute top-0.5 right-0.5 text-[8px] bg-blue-600/80 text-white px-1 rounded">V</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-3">
          {scenes.map((scene, idx) => (
            <GridSceneCard
              key={scene.id}
              scene={scene}
              index={idx}
              onRegenerate={(id) => handleGenerateImage(id)}
              onDelete={removeScene}
              onGrokVideo={(id) => videoBatch.runSingleGrokHQ(id)}
              onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
              onPlaySceneAudio={handlePlaySceneAudio}
              playingSceneId={playingSceneId}
              sceneProgress={sceneProgress}
              onAddAfter={handleAddSceneAfter}
              onReferenceUpload={handleReferenceUpload}
              onUploadImage={handleUploadImage}
              onOpenDetail={(scene, idx) => setDetailScene({ scene, index: idx })}
              onCopyScript={handleCopyScript}
              isSelected={selectedSceneIds.has(scene.id)}
              onToggleSelect={toggleSceneSelect}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, idx) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={idx}
              onUpdatePrompt={handleUpdatePrompt}
              onDelete={removeScene}
              onRegenerate={(id) => handleGenerateImage(id)}
              onTransform={(id) => handleGenerateImage(id, '다른 구도와 색감으로 변형해주세요')}
              onGrokVideo={(id) => videoBatch.runSingleGrokHQ(id)}
              onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
              onPlaySceneAudio={handlePlaySceneAudio}
              playingSceneId={playingSceneId}
              sceneProgress={sceneProgress}
              onAddAfter={handleAddSceneAfter}
              onAutoPrompt={handleAutoPrompt}
              onReferenceUpload={handleReferenceUpload}
              onUploadImage={handleUploadImage}
              onOpenDetail={(scene, idx) => setDetailScene({ scene, index: idx })}
              onCopyScript={handleCopyScript}
              isSelected={selectedSceneIds.has(scene.id)}
              onToggleSelect={toggleSceneSelect}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default StoryboardPanel;
