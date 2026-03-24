import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProjectStore } from '../../../stores/projectStore';
import { useCostStore } from '../../../stores/costStore';
import { useImageVideoStore } from '../../../stores/imageVideoStore';
import { generateSceneImage } from '../../../services/gemini/imageGeneration';
import { generatePromptFromScript } from '../../../services/gemini/imageAnalysis';
import { persistImage } from '../../../services/imageStorageService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { useVideoBatch } from '../../../hooks/useVideoBatch';
import { PRICING, IMAGE_MODELS } from '../../../constants';
import { AspectRatio, ImageModel, CharacterAppearance, VideoFormat, VideoModel } from '../../../types';
import type { Scene } from '../../../types';
import { showToast, useUIStore } from '../../../stores/uiStore';
import { useGoogleCookieStore } from '../../../stores/googleCookieStore';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { retryImport } from '../../../utils/retryImport';
import { useNavigationStore } from '../../../stores/navigationStore';
import ActionButton from '../../ui/ActionButton';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../../hooks/useAuthGuard';
import { useUnifiedTimeline, useTotalDuration } from '../../../hooks/useUnifiedTimeline';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { MOTION_KEYFRAMES } from '../../../services/motionPreviewUtils';
import {
  beginCapCutDirectInstallSelection,
  buildEditRoomNleZip,
  getCapCutManualInstallHint,
  installCapCutZipToDirectory,
  isCapCutDirectInstallSupported,
} from '../../../services/nleExportService';
import type { EditRoomNleTarget } from '../../../services/nleExportService';
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

const REFERENCE_RESULT_PAGE_SIZE = 10;
const MAX_REFERENCE_RESULT_PAGE = 5;

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

function isReferenceImageScene(scene: Scene): boolean {
  return /(구글|대체) 레퍼런스/.test(scene.generationStatus || '') || !!scene.referenceSearchQuery;
}

function getReferenceActionLabel(scene: Scene): string {
  return scene.imageUrl ? '레퍼런스 재검색' : '레퍼런스 검색';
}

function getReferenceActionTooltip(scene: Scene): string {
  return scene.imageUrl
    ? '마음에 안 들면 다시 눌러 새 레퍼런스를 찾습니다'
    : '장면 맥락에 맞는 무료 레퍼런스를 검색합니다';
}

// --- Constants ---

// [FIX #365] 하드코딩 제거 → 프로젝트 config.imageModel 사용 (스토리보드 내 드롭다운으로 변경 가능)

// --- Video Cost Helper ---
const getGrokCost = (duration?: '6' | '10'): number =>
  duration === '6' ? PRICING.VIDEO_GROK_6S : PRICING.VIDEO_GROK_10S;
type SeedanceDuration = '4' | '8' | '12';
const getSeedanceCost = (duration: SeedanceDuration = '8'): number => {
  if (duration === '4') return PRICING.VIDEO_SEEDANCE_4S;
  if (duration === '12') return PRICING.VIDEO_SEEDANCE_12S;
  return PRICING.VIDEO_SEEDANCE_8S;
};
const getNextSeedanceDuration = (duration: SeedanceDuration): SeedanceDuration =>
  duration === '4' ? '8' : duration === '8' ? '12' : '4';

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
  shouldStop?: () => boolean,
) {
  const queue = [...items];
  const active: Promise<void>[] = [];
  while (queue.length > 0 || active.length > 0) {
    while (queue.length > 0 && active.length < limit && !shouldStop?.()) {
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
    if (shouldStop?.() && active.length === 0) break;
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

const getSceneStatusTone = (status?: string): string =>
  /실패|차단|없음/i.test(status || '') ? 'text-amber-300' : 'text-cyan-300';

type SceneTextFallback = {
  narration?: string;
  script?: string;
};

const getSceneNarrationText = (scene: Scene): string => {
  const fallback = scene as SceneTextFallback;
  const candidates = [scene.scriptText, scene.audioScript, fallback.narration, fallback.script];
  const text = candidates
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value.length > 0);
  return text || '';
};

type LongFormExportBannerVariant = 'advisory' | 'required';

const LONG_FORM_EXPORT_COPY: Record<LongFormExportBannerVariant, {
  title: string;
  paragraphs: string[];
  footer?: string;
}> = {
  advisory: {
    title: '🎬 프로 편집 프로그램으로 내보내기',
    paragraphs: [
      '5분 이상 영상의 최종 렌더링은\n캡컷, 프리미어 같은 편집 프로그램에서 하는 것이 정석입니다.',
      'Canva, 캡컷 웹, InVideo 등 모든 웹 서비스가 동일하며,\n이들도 긴 영상은 데스크톱 앱이나 별도 서버에서 렌더링합니다.',
      '걱정 마세요 — 내보내기를 누르면 편집점, 자막, 나레이션이\n자동 배치된 프로젝트 파일이 만들어집니다.\n캡컷/프리미어에서 열고 바로 렌더링만 하면 끝!',
    ],
    footer: '📎 MP4 직접 다운로드 (1~3분 미리보기용)',
  },
  required: {
    title: '🎬 10분 이상 — 캡컷 또는 프리미어 필수',
    paragraphs: [
      '세계 어떤 웹 서비스도 브라우저에서 10분 이상 영상을\n렌더링하지 않습니다. 이건 기술적 한계가 아니라 업계 표준입니다.',
      '넷플릭스도, 유튜브도 영상 인코딩은 전용 서버에서 합니다.\n크리에이터의 최종 렌더링은 편집 프로그램의 몫이에요.',
      '내보내기 한 번이면 모든 편집이 그대로 넘어갑니다 👇',
    ],
  },
};

const LongFormExportBanner: React.FC<{
  variant: LongFormExportBannerVariant;
  exportingTarget: EditRoomNleTarget | null;
  onExport: (target: EditRoomNleTarget) => void;
}> = ({ variant, exportingTarget, onExport }) => {
  const copy = LONG_FORM_EXPORT_COPY[variant];

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-900/30 px-5 py-4">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-lg">
            🎬
          </div>
          <div className="space-y-2">
            <p className="text-base font-bold text-amber-200">{copy.title}</p>
            {copy.paragraphs.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-line text-sm leading-relaxed text-amber-100/90">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {([
            { target: 'capcut' as const, label: '🎬 캡컷으로 내보내기' },
            { target: 'premiere' as const, label: '🎬 프리미어로 내보내기' },
          ]).map(({ target, label }) => (
            <button
              key={target}
              type="button"
              onClick={() => onExport(target)}
              disabled={exportingTarget !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exportingTarget === target && (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-100/30 border-t-amber-100 animate-spin" />
              )}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {copy.footer && (
          <div className="border-t border-amber-500/20 pt-3">
            <p className="text-sm font-semibold text-amber-200">{copy.footer}</p>
          </div>
        )}
      </div>
    </div>
  );
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
  onSeedanceVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onPlaySceneAudio?: (sceneId: string) => void;
  playingSceneId?: string | null;
  sceneProgress?: number;
  onAddAfter: (index: number) => void;
  onSplit: (index: number) => void;
  onMerge: (index: number) => void;
  onAutoPrompt: (id: string) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onOpenDetail: (scene: Scene, index: number) => void;
  onCopyScript?: (sceneId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  totalScenes: number;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, index, onUpdatePrompt, onDelete, onRegenerate, onTransform, onGrokVideo, onSeedanceVideo, onVeoVideo, onPlaySceneAudio, playingSceneId, sceneProgress, onAddAfter, onSplit, onMerge, onAutoPrompt, onReferenceUpload, onUploadImage, onOpenDetail, onCopyScript, isSelected, onToggleSelect, totalScenes }) => {
  const enableGoogleReference = useImageVideoStore((s) => s.enableGoogleReference);
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
          <ActionButton label={enableGoogleReference ? getReferenceActionLabel(scene) : '이미지 생성'} color="orange"
            tooltip={enableGoogleReference ? getReferenceActionTooltip(scene) : '이미지 생성'} disabled={scene.isGeneratingImage}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
            onClick={() => onRegenerate(scene.id)} />
          {!enableGoogleReference && (
            <ActionButton label="변형" color="violet"
              tooltip="다른 구도로 변형" disabled={scene.isGeneratingImage}
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
              onClick={() => onTransform(scene.id)} />
          )}
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          {/* Grok video actions */}
          <ActionButton label="Grok" color="pink"
            tooltip={`Grok 영상 (${scene.grokDuration || '10'}s ${scene.grokSpeechMode ? '나레이션' : 'SFX'}) — ${fmtCost(getGrokCost((scene.grokDuration || '10') as '6'|'10'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
            disabled={!scene.imageUrl || scene.isGeneratingVideo}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
            onClick={() => onGrokVideo(scene.id)} />
          <ActionButton label="Seedance" color="fuchsia"
            tooltip={`Seedance 1.5 Pro ${(scene.seedanceDuration || '8') as SeedanceDuration}초 — ${fmtCost(getSeedanceCost((scene.seedanceDuration || '8') as SeedanceDuration), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)} (애니메이션 최고 퀄리티!)`}
            disabled={!scene.imageUrl || scene.isGeneratingVideo}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
            onClick={() => onSeedanceVideo(scene.id)} />
          <button type="button" title="Seedance 4초/8초/12초 전환"
            onClick={() => useProjectStore.getState().updateScene(scene.id, { seedanceDuration: getNextSeedanceDuration((scene.seedanceDuration || '8') as SeedanceDuration) })}
            className="h-7 px-1.5 rounded-lg border border-orange-500/30 bg-orange-600/10 text-[10px] font-bold text-orange-300 hover:bg-orange-600/20 transition-all whitespace-nowrap">
            {(scene.seedanceDuration || '8')}s
          </button>
          <button type="button" title="Grok 6초/10초 전환"
            onClick={() => useProjectStore.getState().updateScene(scene.id, { grokDuration: scene.grokDuration === '6' ? '10' : '6' })}
            className="h-7 px-1.5 rounded-lg border border-pink-500/20 bg-pink-600/10 text-[10px] font-bold text-pink-300 hover:bg-pink-600/20 transition-all whitespace-nowrap">
            {scene.grokDuration === '6' ? '6s' : '10s'}
          </button>
          <ActionButton label={scene.grokSpeechMode ? '나레이션' : 'SFX'} color="fuchsia"
            tooltip="Grok SFX/나레이션 전환"
            onClick={() => useProjectStore.getState().updateScene(scene.id, { grokSpeechMode: !scene.grokSpeechMode })} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          <ActionButton label="Veo 영상" color="blue"
            tooltip={`Veo 3.1 1080p — ${fmtCost(PRICING.VIDEO_VEO, useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
            disabled={!scene.imageUrl || scene.isGeneratingVideo}
            icon={<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9.5 16.5v-9l7 4.5z"/></svg>}
            onClick={() => onVeoVideo(scene.id)} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
          {/* Utility actions */}
          <ActionButton label="나누기" color="orange"
            tooltip="장면을 반으로 나누기"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h4m-4 5h8M3 3v18M21 3v18"/></svg>}
            onClick={() => onSplit(index)} />
          <ActionButton label="합치기" color="cyan"
            tooltip="다음 장면과 합치기"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>}
            disabled={index >= totalScenes - 1}
            onClick={() => onMerge(index)} />
          <div className="w-px h-5 bg-gray-700 mx-0.5" />
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
          {enableGoogleReference && (
            <p className="w-full text-[10px] text-orange-300/80">
              마음에 안 들면 <span className="font-bold text-orange-200">{getReferenceActionLabel(scene)}</span> 버튼을 다시 누르면 새 레퍼런스를 찾습니다.
            </p>
          )}
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
                <span className="text-[9px] text-orange-300 mt-1 animate-pulse">{enableGoogleReference ? '검색 중' : '생성 중'}</span>
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
                {scene.generationStatus && (
                  <span className={`mt-1 px-2 text-center text-[9px] leading-relaxed ${getSceneStatusTone(scene.generationStatus)}`}>
                    {scene.generationStatus}
                  </span>
                )}
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
  onSeedanceVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onPlaySceneAudio?: (sceneId: string) => void;
  playingSceneId?: string | null;
  sceneProgress?: number;
  onAddAfter: (index: number) => void;
  onSplit: (index: number) => void;
  onMerge: (index: number) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onOpenDetail: (scene: Scene, index: number) => void;
  onCopyScript?: (sceneId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  totalScenes: number;
}

const GridSceneCard: React.FC<GridSceneCardProps> = ({ scene, index, onRegenerate, onDelete, onGrokVideo, onSeedanceVideo, onVeoVideo, onPlaySceneAudio, playingSceneId, sceneProgress, onAddAfter, onSplit, onMerge, onReferenceUpload, onUploadImage, onOpenDetail, onCopyScript, isSelected, onToggleSelect, totalScenes }) => {
  const isThisPlaying = playingSceneId === scene.id;
  const enableGoogleReference = useImageVideoStore((s) => s.enableGoogleReference);
  const gridUploadRef = useRef<HTMLInputElement>(null);
  const arClass = aspectRatioClass(useProjectStore((s) => s.config?.aspectRatio));
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className={`bg-gray-800 border rounded-xl overflow-hidden hover:border-gray-500 transition-colors ${isSelected ? 'border-orange-500/60 ring-1 ring-orange-500/30' : 'border-gray-700'}`}>
      {/* Image/Video area */}
      <div
        className={`relative ${arClass} bg-gray-900 cursor-pointer group ${isDragOver ? 'ring-2 ring-orange-400 ring-inset' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const files = e.dataTransfer.files;
          if (files.length === 1) {
            e.stopPropagation();
            const file = files[0];
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
              onUploadImage(scene.id, file);
            }
          }
          // multiple files: don't stopPropagation — let parent handle batch
        }}
      >
        {/* [#243] 그리드 장면 선택 체크박스 */}
        {onToggleSelect && (
          <div className="absolute top-1.5 left-1.5 z-10" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(scene.id)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900/80 text-orange-500 focus:ring-orange-500/30 cursor-pointer" />
          </div>
        )}
        {/* Drag-drop overlay */}
        {isDragOver && !scene.isGeneratingImage && (
          <div className="absolute inset-0 bg-orange-500/20 border-2 border-dashed border-orange-400 flex items-center justify-center z-20 pointer-events-none">
            <div className="text-center">
              <svg className="w-8 h-8 text-orange-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm font-bold text-orange-300">여기에 놓기</span>
            </div>
          </div>
        )}
        {scene.isGeneratingImage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <div className="relative">
              <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full" />
              <div className="absolute inset-0 animate-ping h-8 w-8 border border-orange-400/30 rounded-full" />
            </div>
            <span className="text-[10px] text-orange-300 mt-2 animate-pulse font-medium">{enableGoogleReference ? '레퍼런스 검색 중...' : '이미지 생성 중...'}</span>
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
            {scene.generationStatus && (
              <span className={`mt-2 max-w-[78%] text-center text-[10px] leading-relaxed ${getSceneStatusTone(scene.generationStatus)}`}>
                {scene.generationStatus}
              </span>
            )}
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
          <div className="flex items-center gap-1 flex-wrap">
            <ActionButton label={enableGoogleReference ? (scene.imageUrl ? '재검색' : '검색') : '이미지'} color="orange" compact
              tooltip={enableGoogleReference ? getReferenceActionTooltip(scene) : '이미지 생성'} disabled={scene.isGeneratingImage}
              icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onRegenerate(scene.id); }} />
            <ActionButton label="Grok" color="pink" compact
              tooltip={`Grok 영상 (${scene.grokDuration || '10'}s) — ${fmtCost(getGrokCost((scene.grokDuration || '10') as '6'|'10'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
              disabled={!scene.imageUrl || scene.isGeneratingVideo}
              icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onGrokVideo(scene.id); }} />
            <ActionButton label="Seedance" color="fuchsia" compact
              tooltip={`Seedance 1.5 Pro ${(scene.seedanceDuration || '8') as SeedanceDuration}초 — ${fmtCost(getSeedanceCost((scene.seedanceDuration || '8') as SeedanceDuration), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}`}
              disabled={!scene.imageUrl || scene.isGeneratingVideo}
              icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
              onClick={(e) => { e.stopPropagation(); onSeedanceVideo(scene.id); }} />
            <button type="button"
              onClick={(e) => { e.stopPropagation(); useProjectStore.getState().updateScene(scene.id, { seedanceDuration: getNextSeedanceDuration((scene.seedanceDuration || '8') as SeedanceDuration) }); }}
              className="h-7 px-1.5 rounded-lg border border-orange-500/30 bg-orange-600/10 text-[10px] font-bold text-orange-300 hover:bg-orange-600/20 transition-all whitespace-nowrap"
              title="Seedance 4초/8초/12초 전환">
              {(scene.seedanceDuration || '8')}s
            </button>
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
            {/* [FIX #421] 그리드에서도 레퍼런스 이미지 업로드 가능 */}
            <button type="button" onClick={(e) => {
              e.stopPropagation();
              const input = document.createElement('input');
              input.type = 'file'; input.accept = 'image/*';
              input.onchange = () => { const f = input.files?.[0]; if (f) onReferenceUpload(scene.id, f); };
              input.click();
            }}
              className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${scene.referenceImage ? 'text-green-400 hover:text-green-300' : 'text-gray-500 hover:text-green-400'}`}
              title={scene.referenceImage ? '레퍼런스 이미지 변경' : '레퍼런스 이미지 추가'}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onSplit(index); }}
              className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-orange-400 transition-colors" title="장면 나누기">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h4m-4 5h8M3 3v18M21 3v18"/></svg>
            </button>
            {index < totalScenes - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onMerge(index); }}
                className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-cyan-400 transition-colors" title="다음 장면과 합치기">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
              </button>
            )}
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
  onSeedanceVideo: (id: string) => void;
  onVeoVideo: (id: string) => void;
  onDelete: (index: number) => void;
  onAutoPrompt: (id: string) => void;
  onReferenceUpload: (id: string, file: File) => void;
  onUploadImage: (id: string, file: File) => void;
  onAddAfter: (index: number) => void;
  onSplit: (index: number) => void;
  onMerge: (index: number) => void;
  totalScenes: number;
}

const SceneDetailModal: React.FC<SceneDetailModalProps> = ({
  scene: sceneProp, index, onClose, onUpdatePrompt, onRegenerate, onTransform, onGrokVideo, onSeedanceVideo, onVeoVideo, onDelete, onAutoPrompt, onReferenceUpload, onUploadImage, onAddAfter, onSplit, onMerge, totalScenes
}) => {
  // 스토어에서 최신 장면 데이터 구독 (stale prop 방지)
  const liveScene = useProjectStore((s) => s.scenes.find((sc) => sc.id === sceneProp.id));
  const scene = liveScene || sceneProp;
  const enableGoogleReference = useImageVideoStore((s) => s.enableGoogleReference);
  const modalArClass = aspectRatioClass(useProjectStore((s) => s.config?.aspectRatio));
  const selectedVideoModel = useProjectStore((s) => s.config?.videoModel);
  const seedanceDuration = (scene.seedanceDuration || '8') as SeedanceDuration;
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
                className={`${enableGoogleReference ? 'col-span-2 ' : ''}flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingImage ? 'bg-orange-600/20 border-orange-500/30 text-orange-300 cursor-wait' : 'bg-orange-600/10 border-orange-500/20 text-orange-300 hover:bg-orange-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingImage ? (
                  <><span className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" /> {enableGoogleReference ? '검색 중' : '생성 중'} {elapsedImage > 0 && <span className="tabular-nums text-xs text-orange-400/70">{formatElapsed(elapsedImage)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg> {enableGoogleReference ? getReferenceActionLabel(scene) : '이미지 생성'}</>
                )}
              </button>
              {!enableGoogleReference && (
                <button type="button" disabled={scene.isGeneratingImage} onClick={() => onTransform(scene.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingImage ? 'bg-blue-600/20 border-blue-500/30 text-blue-300 cursor-wait' : 'bg-blue-600/10 border-blue-500/20 text-blue-300 hover:bg-blue-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                  {scene.isGeneratingImage ? (
                    <><span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> 변형 중 {elapsedImage > 0 && <span className="tabular-nums text-xs text-blue-400/70">{formatElapsed(elapsedImage)}</span>}</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> 변형 생성</>
                  )}
                </button>
              )}
              {enableGoogleReference && (
                <div className="col-span-2 px-3 py-1.5 bg-orange-600/10 border border-orange-500/20 rounded-lg text-xs text-orange-200">
                  마음에 안 들면 <span className="font-bold">{getReferenceActionLabel(scene)}</span> 버튼을 다시 눌러 새 레퍼런스를 찾으세요.
                </div>
              )}
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
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Grok 영상 ({scene.grokDuration || '10'}s {scene.grokSpeechMode ? '나레이션' : 'SFX'}) <span className="text-pink-400/60 text-xs ml-1">{fmtCost(getGrokCost((scene.grokDuration || '10') as '6'|'10'), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}</span></>
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
              <button type="button" disabled={!scene.imageUrl || scene.isGeneratingVideo} onClick={() => onSeedanceVideo(scene.id)}
                className={`col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${scene.isGeneratingVideo ? 'bg-fuchsia-600/20 border-fuchsia-500/30 text-fuchsia-300 cursor-wait' : 'bg-fuchsia-600/10 border-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-600/20 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
                {scene.isGeneratingVideo ? (
                  <><span className="w-4 h-4 border-2 border-fuchsia-400/30 border-t-fuchsia-400 rounded-full animate-spin" /> 생성 중 {elapsedVideo > 0 && <span className="tabular-nums text-xs text-fuchsia-400/70">{formatElapsed(elapsedVideo)}</span>}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Seedance 1.5 Pro {seedanceDuration}초 <span className="text-fuchsia-400/60 text-xs ml-1">{fmtCost(getSeedanceCost(seedanceDuration), useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE)}</span></>
                )}
              </button>
              {/* 애니메이션 Seedance 추천 안내 */}
              <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-fuchsia-900/25 to-violet-900/15 border border-fuchsia-500/30 rounded-lg">
                <span className="text-base flex-shrink-0">🎨</span>
                <p className="text-xs text-fuchsia-200 leading-snug">
                  <span className="font-bold text-fuchsia-300">애니메이션/일러스트</span> 스타일은
                  <span className="font-bold text-white"> Seedance 1.5 Pro</span>가 가장 퀄리티가 좋아요!
                  <span className="text-fuchsia-400/70"> (실사는 Grok/Veo 추천)</span>
                </p>
              </div>
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
                  onClick={() => useProjectStore.getState().updateScene(scene.id, { grokDuration: scene.grokDuration === '6' ? '10' : '6' })}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${scene.grokDuration === '6' ? 'bg-gray-800 border-gray-600 text-gray-400' : 'bg-pink-900/30 border-pink-500/30 text-pink-300'}`}>
                  {scene.grokDuration === '6' ? '6초' : '10초'}
                </button>
                <button type="button"
                  onClick={() => useProjectStore.getState().updateScene(scene.id, { grokSpeechMode: !scene.grokSpeechMode })}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${scene.grokSpeechMode ? 'bg-fuchsia-900/30 border-fuchsia-500/30 text-fuchsia-300' : 'bg-gray-800 border-gray-600 text-gray-400'}`}>
                  {scene.grokSpeechMode ? '나레이션 모드' : 'SFX 모드'}
                </button>
              </div>
              {(selectedVideoModel === VideoModel.SEEDANCE || scene.videoModelUsed === VideoModel.SEEDANCE) && (
                <div className="flex items-center gap-2 col-span-2">
                  <span className="text-xs text-gray-500">Seedance 설정:</span>
                  {(['4', '8', '12'] as SeedanceDuration[]).map((duration) => (
                    <button key={duration} type="button"
                      onClick={() => useProjectStore.getState().updateScene(scene.id, { seedanceDuration: duration })}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        seedanceDuration === duration
                          ? 'bg-orange-900/30 border-orange-500/30 text-orange-300'
                          : 'bg-gray-800 border-gray-600 text-gray-400'
                      }`}>
                      {duration}초
                    </button>
                  ))}
                </div>
              )}
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
            {/* Scene management actions */}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
              <button type="button" onClick={() => { onSplit(index); onClose(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-900/20 border border-orange-500/20 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h4m-4 5h8M3 3v18M21 3v18"/></svg>
                장면 나누기
              </button>
              {index < totalScenes - 1 && (
                <button type="button" onClick={() => { onMerge(index); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-cyan-400 hover:bg-cyan-900/20 border border-cyan-500/20 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                  다음 장면과 합치기
                </button>
              )}
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

// --- Virtual Grid View (TanStack Virtual) ---
const GRID_COLS = 3;
const GRID_GAP = 12;
const GRID_INFO_HEIGHT = 100; // bottom info section approximate height

/** [FIX #468] 비율별 그리드 행 높이 추정 — 9:16에서 겹침 방지 */
function estimateGridRowHeight(ar?: string): number {
  switch (ar) {
    case AspectRatio.PORTRAIT: return 800 + GRID_INFO_HEIGHT; // 9:16 — tall
    case AspectRatio.SQUARE: return 480 + GRID_INFO_HEIGHT;   // 1:1
    case AspectRatio.CLASSIC: return 420 + GRID_INFO_HEIGHT;  // 4:3
    default: return 320 + GRID_INFO_HEIGHT;                   // 16:9
  }
}

const VirtualGridView: React.FC<{
  scenes: Scene[];
  handleGenerateImage: (id: string, hint?: string) => void;
  removeScene: (index: number) => void;
  videoBatch: ReturnType<typeof useVideoBatch>;
  handlePlaySceneAudio: (sceneId: string) => void;
  playingSceneId: string | null;
  sceneProgress: number;
  handleAddSceneAfter: (index: number) => void;
  handleSplitScene: (index: number) => void;
  handleMergeScene: (index: number) => void;
  handleReferenceUpload: (id: string, file: File) => void;
  handleUploadImage: (id: string, file: File) => void;
  setDetailScene: (d: { scene: Scene; index: number }) => void;
  handleCopyScript: (sceneId: string) => void;
  selectedSceneIds: Set<string>;
  toggleSceneSelect: (id: string) => void;
}> = ({ scenes, handleGenerateImage, removeScene, videoBatch, handlePlaySceneAudio, playingSceneId, sceneProgress, handleAddSceneAfter, handleSplitScene, handleMergeScene, handleReferenceUpload, handleUploadImage, setDetailScene, handleCopyScript, selectedSceneIds, toggleSceneSelect }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const aspectRatio = useProjectStore((s) => s.config?.aspectRatio);
  const rowCount = Math.ceil(scenes.length / GRID_COLS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateGridRowHeight(aspectRatio) + GRID_GAP,
    overscan: 3,
  });

  // [FIX #468] 비율 변경 시 virtualizer 캐시 초기화
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * GRID_COLS;
          const rowScenes = scenes.slice(startIdx, startIdx + GRID_COLS);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid grid-cols-3 gap-3"
            >
              {rowScenes.map((scene, colIdx) => {
                const idx = startIdx + colIdx;
                return (
                  <GridSceneCard
                    key={scene.id}
                    scene={scene}
                    index={idx}
                    onRegenerate={(id) => handleGenerateImage(id)}
                    onDelete={removeScene}
                    onGrokVideo={(id) => videoBatch.runSingleGrokHQ(id)}
                    onSeedanceVideo={(id) => videoBatch.runSingleSeedance(id)}
                    onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
                    onPlaySceneAudio={handlePlaySceneAudio}
                    playingSceneId={playingSceneId}
                    sceneProgress={sceneProgress}
                    onAddAfter={handleAddSceneAfter}
                    onSplit={handleSplitScene}
                    onMerge={handleMergeScene}
                    onReferenceUpload={handleReferenceUpload}
                    onUploadImage={handleUploadImage}
                    totalScenes={scenes.length}
                    onOpenDetail={(scene, idx) => setDetailScene({ scene, index: idx })}
                    onCopyScript={handleCopyScript}
                    isSelected={selectedSceneIds.has(scene.id)}
                    onToggleSelect={toggleSceneSelect}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Virtual List View (TanStack Virtual) ---
const LIST_ROW_HEIGHT = 200; // px per list item (estimate)
const LIST_GAP = 12;

const VirtualListView: React.FC<{
  scenes: Scene[];
  handleUpdatePrompt: (id: string, field: 'visualPrompt' | 'videoPrompt', value: string) => void;
  removeScene: (index: number) => void;
  handleGenerateImage: (id: string, hint?: string) => void;
  videoBatch: ReturnType<typeof useVideoBatch>;
  handlePlaySceneAudio: (sceneId: string) => void;
  playingSceneId: string | null;
  sceneProgress: number;
  handleAddSceneAfter: (index: number) => void;
  handleSplitScene: (index: number) => void;
  handleMergeScene: (index: number) => void;
  handleAutoPrompt: (sceneId: string) => void;
  handleReferenceUpload: (id: string, file: File) => void;
  handleUploadImage: (id: string, file: File) => void;
  setDetailScene: (d: { scene: Scene; index: number }) => void;
  handleCopyScript: (sceneId: string) => void;
  selectedSceneIds: Set<string>;
  toggleSceneSelect: (id: string) => void;
}> = ({ scenes, handleUpdatePrompt, removeScene, handleGenerateImage, videoBatch, handlePlaySceneAudio, playingSceneId, sceneProgress, handleAddSceneAfter, handleSplitScene, handleMergeScene, handleAutoPrompt, handleReferenceUpload, handleUploadImage, setDetailScene, handleCopyScript, selectedSceneIds, toggleSceneSelect }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: scenes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LIST_ROW_HEIGHT + LIST_GAP,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const idx = virtualRow.index;
          const scene = scenes[idx];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <SceneCard
                key={scene.id}
                scene={scene}
                index={idx}
                onUpdatePrompt={handleUpdatePrompt}
                onDelete={removeScene}
                onRegenerate={(id) => handleGenerateImage(id)}
                onTransform={(id) => handleGenerateImage(id, '다른 구도와 색감으로 변형해주세요')}
                onGrokVideo={(id) => videoBatch.runSingleGrokHQ(id)}
                onSeedanceVideo={(id) => videoBatch.runSingleSeedance(id)}
                onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
                onPlaySceneAudio={handlePlaySceneAudio}
                playingSceneId={playingSceneId}
                sceneProgress={sceneProgress}
                onAddAfter={handleAddSceneAfter}
                onSplit={handleSplitScene}
                onMerge={handleMergeScene}
                onAutoPrompt={handleAutoPrompt}
                onReferenceUpload={handleReferenceUpload}
                onUploadImage={handleUploadImage}
                onOpenDetail={(scene, idx) => setDetailScene({ scene, index: idx })}
                onCopyScript={handleCopyScript}
                isSelected={selectedSceneIds.has(scene.id)}
                onToggleSelect={toggleSceneSelect}
                totalScenes={scenes.length}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- StoryboardPanel Main ---

const StoryboardPanel: React.FC = () => {
  const scenes = useProjectStore((s) => s.scenes);
  const thumbnails = useProjectStore((s) => s.thumbnails);
  const config = useProjectStore((s) => s.config);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const updateScene = useProjectStore((s) => s.updateScene);
  const removeScene = useProjectStore((s) => s.removeScene);
  const splitScene = useProjectStore((s) => s.splitScene);
  const mergeScene = useProjectStore((s) => s.mergeScene);
  const setScenes = useProjectStore((s) => s.setScenes);
  const addCost = useCostStore((s) => s.addCost);
  const lines = useSoundStudioStore((s) => s.lines);
  const currentStyle = useImageVideoStore((s) => s.style);
  const enableWebSearch = useImageVideoStore((s) => s.enableWebSearch);
  const isMultiCharacter = useImageVideoStore((s) => s.isMultiCharacter);
  const enableGoogleReference = useImageVideoStore((s) => s.enableGoogleReference);
  const timeline = useUnifiedTimeline();
  const totalDuration = useTotalDuration();
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
  const [isAllScriptCopied, setIsAllScriptCopied] = useState(false);
  const [nleExportingTarget, setNleExportingTarget] = useState<EditRoomNleTarget | null>(null);
  // [FIX #365] 이미지 모델 — Zustand 리액티브 셀렉터 (getState()는 UI 반영 안 됨)
  const storyboardImageModel = useProjectStore(s => s.config?.imageModel) || ImageModel.NANO_COST;
  const [isBatchingImages, setIsBatchingImages] = useState(false);
  const [isBatchImageCancelRequested, setIsBatchImageCancelRequested] = useState(false);
  const [batchImageProgress, setBatchImageProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });
  // [#518] 이미지 일괄 업로드 상태
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchUploadProgress, setBatchUploadProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });
  // [#243] 장면 선택 상태
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const { requireAuth } = useAuthGuard();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);
  const allScriptCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BUG#16: ref to track latest batch progress
  const batchImageProgressRef = useRef(batchImageProgress);
  batchImageProgressRef.current = batchImageProgress;
  const batchImageCancelRef = useRef(isBatchImageCancelRequested);
  batchImageCancelRef.current = isBatchImageCancelRequested;
  const batchUploadProgressRef = useRef(batchUploadProgress);
  batchUploadProgressRef.current = batchUploadProgress;
  const batchUploadRef = useRef<HTMLInputElement>(null);

  // 배치 비디오 훅
  const videoBatch = useVideoBatch(scenes, setScenes, config, addCost);

  const completedImages = scenes.filter((s) => s.imageUrl && !s.isGeneratingImage).length;
  const completedVideos = scenes.filter((s) => s.videoUrl && !s.isGeneratingVideo).length;
  const completedThumbnails = thumbnails.filter((t) => t.imageUrl).length;
  const videoEligible = scenes.filter((s) => s.imageUrl && !s.videoUrl && !s.isGeneratingVideo).length;
  const imageEligible = scenes.filter((s) => !s.imageUrl && !s.isGeneratingImage).length;
  const failedVideoCount = useMemo(() => (
    scenes.filter((scene) => videoBatch.failedSceneIds.includes(scene.id) && !scene.videoUrl && !scene.isGeneratingVideo).length
  ), [scenes, videoBatch.failedSceneIds]);
  const exRate = useCostStore.getState().exchangeRate || PRICING.EXCHANGE_RATE;

  const isAnyBatchRunning = isBatchingImages || videoBatch.isBatching || isBatchUploading;
  const elapsedBatch = useElapsedTimer(isAnyBatchRunning);
  const totalScenes = scenes.length;
  const projectAspectRatio = config?.aspectRatio || '16:9';
  const hasDownloadActions = totalScenes > 0 || completedThumbnails > 0 || completedImages > 0 || completedVideos > 0;
  const allSceneScriptText = useMemo(() => scenes
    .map((scene) => getSceneNarrationText(scene))
    .filter((text) => text.length > 0)
    .join('\n\n'), [scenes]);
  const longFormBannerVariant: LongFormExportBannerVariant | null = totalDuration >= 600
    ? 'required'
    : totalDuration >= 300
      ? 'advisory'
      : null;

  const storyboardNarrationLines = useMemo(() => {
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
    const lineNarrations = lines
      .map((line, index) => {
        const scene = line.sceneId ? sceneById.get(line.sceneId) : scenes[index];
        const sceneId = line.sceneId || scene?.id || '';
        let audioUrl = line.audioUrl;

        if ((!audioUrl || audioUrl.startsWith('blob:')) && scene?.audioUrl) {
          audioUrl = scene.audioUrl;
        }

        if (!sceneId || !audioUrl) {
          return null;
        }

        return { sceneId, audioUrl };
      })
      .filter((value): value is { sceneId: string; audioUrl: string } => value !== null);

    if (lineNarrations.length > 0) {
      return lineNarrations;
    }

    return scenes
      .filter((scene) => !!scene.audioUrl)
      .map((scene) => ({ sceneId: scene.id, audioUrl: scene.audioUrl! }));
  }, [lines, scenes]);

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

  const handleExportStoryboardNle = useCallback(async (target: EditRoomNleTarget) => {
    const targetLabel = target === 'premiere' ? 'Premiere Pro' : 'CapCut';
    logger.trackAction(`스토리보드 NLE 내보내기: ${targetLabel}`);

    if (!requireAuth(`${targetLabel} 내보내기`)) {
      return;
    }

    if (timeline.length === 0) {
      showToast('내보낼 장면이 없습니다.');
      return;
    }

    // [FIX #665/#657] CapCut 직접 설치: showDirectoryPicker를 confirm보다 먼저 호출해야 user gesture 유지
    let directInstallSelection: Awaited<ReturnType<typeof beginCapCutDirectInstallSelection>> = null;
    if (target === 'capcut' && isCapCutDirectInstallSupported()) {
      try {
        directInstallSelection = await beginCapCutDirectInstallSelection();
      } catch (pickerErr) {
        console.warn('[StoryboardPanel] CapCut 직접 설치 선택 실패, ZIP으로 진행:', pickerErr);
      }
    }

    // [FIX #652] imageUpdatedAfterVideo이면 이미지로 취급
    const videoSceneCount = scenes.filter((scene) => scene.videoUrl && !scene.imageUpdatedAfterVideo).length;
    if (videoSceneCount < scenes.length) {
      const imageOnlyCount = scenes.length - videoSceneCount;
      const msg = videoSceneCount === 0
        ? `⚠️ 현재 ${scenes.length}개 장면이 모두 이미지입니다.\n\n영상 클립이 하나도 없는 상태에서 내보내면,\n${targetLabel}에서 모든 장면이 정지 이미지로 표시됩니다.\n\n그래도 이미지로 내보내시겠어요?\n(영상이 필요하면 '취소' 후 이미지/영상 탭에서 영상을 먼저 생성해주세요)`
        : `⚠️ 미디어 구성 안내\n\n  🎬 영상: ${videoSceneCount}개\n  🖼️ 이미지: ${imageOnlyCount}개\n  📦 전체: ${scenes.length}개 장면\n\n영상이 없는 ${imageOnlyCount}개 장면은 정지 이미지로 내보내집니다.\n\n이대로 내보내시겠어요?\n(모든 장면을 영상으로 하려면 '취소' 후 이미지/영상 탭에서 나머지 영상을 생성해주세요)`;
      if (!window.confirm(msg)) {
        return;
      }
    }

    setNleExportingTarget(target);

    try {
      showToast(
        target === 'capcut'
          ? directInstallSelection
            ? 'CapCut 프로젝트를 준비 중입니다. 완료되면 선택한 폴더에 바로 설치합니다...'
            : 'CapCut ZIP을 준비하고 있습니다...'
          : `${targetLabel} 프로젝트 파일을 준비하고 있습니다...`,
      );
      const exportTitle = projectTitle || '프로젝트';
      const result = await buildEditRoomNleZip({
        target,
        timeline,
        // [FIX #652] imageUpdatedAfterVideo이면 videoUrl 제외 → 이미지로 내보내기
        scenes: scenes.map((scene) => ({
          id: scene.id,
          imageUrl: scene.imageUrl,
          videoUrl: scene.imageUpdatedAfterVideo ? undefined : scene.videoUrl,
          scriptText: scene.scriptText,
        })),
        narrationLines: storyboardNarrationLines,
        title: exportTitle,
        aspectRatio: projectAspectRatio,
      });
      const downloadFileName = `${exportTitle.replace(/[^\w가-힣\-_ ]/g, '').slice(0, 30) || 'project'}_${target}.zip`;

      const mediaSummary = result.videoCount > 0 && result.imageCount > 0
        ? ` (영상 ${result.videoCount} + 이미지 ${result.imageCount})`
        : result.videoCount > 0
          ? ` (영상 ${result.videoCount}개)`
          : ` (이미지 ${result.imageCount}개)`;

      if (target === 'capcut' && directInstallSelection) {
        try {
          await installCapCutZipToDirectory({
            zipBlob: result.blob,
            draftsRootHandle: directInstallSelection.draftsRootHandle,
            draftsRootPath: directInstallSelection.draftsRootPath,
          });
          showToast(`CapCut 프로젝트를 바로 설치했습니다!${mediaSummary} CapCut에서 프로젝트 카드를 열어 확인해주세요.`, 6000);
          return;
        } catch (installError) {
          const fallbackUrl = URL.createObjectURL(result.blob);
          const fallbackLink = document.createElement('a');
          fallbackLink.href = fallbackUrl;
          fallbackLink.download = downloadFileName;
          fallbackLink.click();
          setTimeout(() => URL.revokeObjectURL(fallbackUrl), 10000);
          showToast(`CapCut 직접 설치에 실패해 ZIP으로 전환했습니다. ${getCapCutManualInstallHint()} (${installError instanceof Error ? installError.message : '알 수 없는 오류'})`, 8000);
          return;
        }
      }

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast(
        target === 'capcut'
          ? `CapCut ZIP 다운로드 완료!${mediaSummary} ${getCapCutManualInstallHint()}`
          : `${targetLabel} 프로젝트 파일 다운로드 완료!${mediaSummary}`,
        target === 'capcut' ? 7000 : undefined,
      );
    } catch (err) {
      showToast(`${targetLabel} 내보내기 실패: ` + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setNleExportingTarget(null);
    }
  }, [projectAspectRatio, projectTitle, requireAuth, scenes, storyboardNarrationLines, timeline]);

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
    // [FIX #605] 재생 끝난 상태에서 버튼 누르면 처음부터, 중간에서 누르면 이어듣기
    if (globalAudioRef.current.ended || globalAudioRef.current.currentTime >= (globalAudioRef.current.duration || 1) - 0.5) {
      globalAudioRef.current.currentTime = 0;
      setGlobalTime(0);
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
    const text = scene ? getSceneNarrationText(scene) : '';
    if (!text) { showToast('대본이 없습니다'); return; }
    navigator.clipboard.writeText(text).then(() => {
      showToast('대본이 클립보드에 복사되었습니다.');
    }).catch(() => {
      showToast('복사 실패');
    });
  }, [scenes]);

  const handleCopyAllScripts = useCallback(async () => {
    if (!allSceneScriptText) {
      showToast('복사할 대본이 없습니다.');
      return;
    }
    try {
      await navigator.clipboard.writeText(allSceneScriptText);
      setIsAllScriptCopied(true);
      if (allScriptCopiedTimerRef.current) {
        clearTimeout(allScriptCopiedTimerRef.current);
      }
      allScriptCopiedTimerRef.current = setTimeout(() => {
        setIsAllScriptCopied(false);
        allScriptCopiedTimerRef.current = null;
      }, 2000);
      showToast('전체 대본이 클립보드에 복사되었습니다.');
    } catch (e: unknown) {
      logger.trackSwallowedError('StoryboardPanel:copyAllScripts/clipboard', e);
      showToast('복사 실패');
    }
  }, [allSceneScriptText]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(globalAnimRef.current);
      cancelAnimationFrame(sceneAnimRef.current);
      if (allScriptCopiedTimerRef.current) {
        clearTimeout(allScriptCopiedTimerRef.current);
      }
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

  // --- 장면 나누기 / 합치기 ---
  const handleSplitScene = useCallback((index: number) => {
    const scene = useProjectStore.getState().scenes[index];
    if (!scene?.scriptText || scene.scriptText.trim().length < 2) {
      showToast('나눌 텍스트가 부족합니다');
      return;
    }
    useProjectStore.getState().splitScene(index);
    showToast(`장면 ${index + 1}을 둘로 나눴습니다`);
  }, []);

  const handleMergeScene = useCallback((index: number) => {
    const total = useProjectStore.getState().scenes.length;
    if (index >= total - 1) return;
    useProjectStore.getState().mergeScene(index);
    showToast(`장면 ${index + 1}과 ${index + 2}를 합쳤습니다`);
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

  // --- [#518] 이미지 일괄 업로드 (드래그 & 드롭 / 파일 선택) ---
  const handleBatchUploadFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (imageFiles.length === 0) {
      showToast('이미지/영상 파일이 없습니다.');
      return;
    }

    const { scenes: currentScenes } = useProjectStore.getState();
    if (currentScenes.length === 0) {
      showToast('장면이 없습니다. 대본 분석을 먼저 실행해주세요.');
      return;
    }

    const count = Math.min(imageFiles.length, currentScenes.length);
    const extra = imageFiles.length > currentScenes.length
      ? `\n(파일 ${imageFiles.length}개 중 장면 수(${currentScenes.length})만큼만 사용됩니다)`
      : '';
    if (!confirm(`${imageFiles.length}개 파일을 파일이름 순서대로 장면 1~${count}에 업로드합니다.${extra}\n이미 이미지가 있는 장면은 덮어씁니다.\n\n계속할까요?`)) {
      return;
    }

    setIsBatchUploading(true);
    setBatchUploadProgress({ current: 0, total: count, success: 0, fail: 0 });

    // Build file → scene mapping
    const fileMap = new Map<string, File>();
    for (let i = 0; i < count; i++) {
      fileMap.set(currentScenes[i].id, imageFiles[i]);
    }

    const targets = currentScenes.slice(0, count);

    await runImageBatch(
      targets,
      5,
      async (scene) => {
        const file = fileMap.get(scene.id);
        if (!file) return false;
        updateScene(scene.id, { isGeneratingImage: true, generationStatus: '업로드 중...' });
        try {
          const url = await uploadMediaToHosting(file);
          const isVideo = file.type.startsWith('video/');
          if (isVideo) {
            updateScene(scene.id, { videoUrl: url, isGeneratingImage: false, generationStatus: undefined });
          } else {
            const sceneNow = useProjectStore.getState().scenes.find(s => s.id === scene.id);
            updateScene(scene.id, { imageUrl: url, isGeneratingImage: false, generationStatus: undefined, imageUpdatedAfterVideo: !!sceneNow?.videoUrl });
          }
          return true;
        } catch {
          updateScene(scene.id, { isGeneratingImage: false, generationStatus: undefined });
          return false;
        }
      },
      () => setBatchUploadProgress(prev => ({ ...prev, current: prev.current + 1, success: prev.success + 1 })),
      () => setBatchUploadProgress(prev => ({ ...prev, current: prev.current + 1, fail: prev.fail + 1 })),
    );

    const finalProgress = batchUploadProgressRef.current;
    if (finalProgress.fail > 0) {
      showToast(`${finalProgress.fail}개 업로드 실패 (${finalProgress.success}개 성공)`, 5000);
    } else {
      showToast(`${finalProgress.success}개 이미지 일괄 업로드 완료`);
    }

    setIsBatchUploading(false);
  }, [updateScene]);

  // --- 프롬프트 수정 ---
  const handleUpdatePrompt = useCallback((id: string, field: 'visualPrompt' | 'videoPrompt', value: string) => {
    if (field === 'visualPrompt') {
      updateScene(id, { visualPrompt: value });
    } else {
      updateScene(id, { videoPrompt: value });
    }
  }, [updateScene]);

  type ImageGenerationOverrides = {
    imageModel?: ImageModel;
    finalStyle?: string;
    preserveCharacterStyle?: boolean;
  };

  // --- 단일 이미지 생성 (스토어에서 style/characters 읽기 — BUG#17 fix) ---
  const handleGenerateImage = useCallback(async (sceneId: string, feedback?: string, overrides?: ImageGenerationOverrides): Promise<boolean> => {
    logger.trackAction('이미지 생성', sceneId);
    if (!requireAuth('이미지 생성')) return false;
    const { scenes: currentScenes, config: currentConfig } = useProjectStore.getState();
    let scene = currentScenes.find(s => s.id === sceneId);
    if (!scene || !currentConfig) return false;

    // [NEW] 무료 레퍼런스 모드 — AI 생성 대신 웹 검색으로 대체
    if (useImageVideoStore.getState().enableGoogleReference && !feedback && !overrides) {
      try {
        const { searchGoogleImages, buildSearchQuery } = await import('../../../services/googleReferenceSearchService');
        const sceneIndex = currentScenes.findIndex(s => s.id === sceneId);
        const prevScene = sceneIndex > 0 ? currentScenes[sceneIndex - 1] : null;
        const nextScene = sceneIndex < currentScenes.length - 1 ? currentScenes[sceneIndex + 1] : null;
        const query = buildSearchQuery(scene, prevScene, nextScene, currentConfig.globalContext);
        const hasExistingReference = !!scene.imageUrl?.trim() && isReferenceImageScene(scene);
        const hasStoredReferencePage = typeof scene.referenceSearchPage === 'number' && scene.referenceSearchPage > 0;
        const safePage = !hasExistingReference
          ? 1
          : scene.referenceSearchQuery && scene.referenceSearchQuery !== query
            ? 1
            : hasStoredReferencePage
              ? (scene.referenceSearchPage! >= MAX_REFERENCE_RESULT_PAGE ? 1 : scene.referenceSearchPage! + 1)
              : 2;
        const startIdx = ((safePage - 1) * REFERENCE_RESULT_PAGE_SIZE) + 1;

        updateScene(sceneId, {
          isGeneratingImage: true,
          generationStatus: hasExistingReference ? `다른 레퍼런스 검색 중... (${safePage}페이지)` : '무료 레퍼런스 검색 중...',
        });

        const result = await searchGoogleImages(query, startIdx, 'large', {
          context: { scene, prevScene, nextScene, globalContext: currentConfig.globalContext },
          rankingMode: 'best',
        });
        if (result.items.length > 0) {
          updateScene(sceneId, {
            imageUrl: result.items[0].link,
            previousImageUrl: scene.imageUrl || undefined,
            isGeneratingImage: false,
            generationStatus: result.provider === 'google' ? '구글 레퍼런스 적용됨' : '대체 레퍼런스 적용됨',
            imageUpdatedAfterVideo: !!scene.videoUrl,
            referenceSearchPage: safePage,
            referenceSearchQuery: query,
          });
          return true;
        }
        updateScene(sceneId, {
          isGeneratingImage: false,
          generationStatus: '검색 결과 없음',
          referenceSearchPage: safePage,
          referenceSearchQuery: query,
        });
        return false;
      } catch (err) {
        updateScene(sceneId, { isGeneratingImage: false, generationStatus: `검색 실패: ${err instanceof Error ? err.message : '오류'}` });
        return false;
      }
    }

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
        // [FIX #525] 배치 생성 시 stale 데이터 방지 — 최신 스토어에서 인접 씬 읽기
        const freshScenes = useProjectStore.getState().scenes;
        const sceneIdx = freshScenes.findIndex(s => s.id === sceneId);
        const prevScene = sceneIdx > 0 ? freshScenes[sceneIdx - 1] : undefined;
        const nextScene = sceneIdx < freshScenes.length - 1 ? freshScenes[sceneIdx + 1] : undefined;
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
      const imageModel = overrides?.imageModel || currentConfig.imageModel || storyboardImageModel || ImageModel.NANO_COST;

      // [FIX BUG#17] Read current style/characters from store getState() — always fresh
      const liveStyle = useImageVideoStore.getState().style;
      const currentCharacters = useImageVideoStore.getState().characters;

      // [CRITICAL FIX] 스타일 결정 — App.tsx 초기 배치 생성과 완전 동일한 로직
      // 1순위: 사용자가 스타일 팔레트에서 선택한 값 (useImageVideoStore.style)
      // 2순위: config.atmosphere (ScriptMode 프리셋 또는 visualTone 자동 저장값)
      // 3순위: config.detectedStyleDescription (SetupPanel Pro 분석 시 저장된 visualTone)
      // 4순위: 캐릭터 분석 예술 스타일 (analysisStyle) — 캐릭터 그림체 보존
      // 5순위: "Cinematic" 기본값
      const charArtStyle = currentCharacters.find(c => c.analysisStyle)?.analysisStyle || '';
      const userSelectedStyle = liveStyle !== 'custom';
      // [FIX] 캐릭터 analysisStyle이 atmosphere/detectedStyle보다 우선 — 그림체 보존
      const effectiveStyle = userSelectedStyle
        ? liveStyle
        : (charArtStyle.trim() !== '')
          ? charArtStyle
          : (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
            ? currentConfig.atmosphere
            : (currentConfig.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
              ? currentConfig.detectedStyleDescription
              : 'Cinematic';
      // [FIX #174] 커스텀 스타일 지시 병합 (handshake 제거, 다큐멘터리 톤 등)
      const customNote = useImageVideoStore.getState().customStyleNote?.trim();
      const computedFinalStyle = customNote ? `${effectiveStyle}. ${customNote}` : effectiveStyle;
      const finalStyle = overrides?.finalStyle && overrides.finalStyle.trim() ? overrides.finalStyle : computedFinalStyle;
      // 사용자가 비주얼 미선택 + 캐릭터 아트 스타일로 폴백된 경우 → 캐릭터 그림체 보존 모드
      const computedPreserveCharStyle = !userSelectedStyle && charArtStyle.trim() !== '' && effectiveStyle === charArtStyle;
      const preserveCharStyle = overrides?.preserveCharacterStyle ?? computedPreserveCharStyle;

      // [FIX #283] characterAppearance가 NONE이면 캐릭터 참조 이미지/분석 결과를 전달하지 않음
      const isCharNone = currentConfig.characterAppearance === CharacterAppearance.NONE;
      const charImages = isCharNone ? [] : (currentCharacters.length > 0
        ? currentCharacters.map(c => c.imageUrl || c.imageBase64).filter((v): v is string => !!v && (v.startsWith('http') || v.startsWith('data:')))
        : currentConfig.characterImage && (currentConfig.characterImage.startsWith('http') || currentConfig.characterImage.startsWith('data:')) ? [currentConfig.characterImage] : []);

      const globalStyleRefs = useImageVideoStore.getState().styleReferenceImages?.filter(Boolean) || [];

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
        globalStyleRefs,
      );

      const imageUrl = result.url;

      // BUG#8: 취소된 생성 결과 폐기
      const afterGen = useProjectStore.getState().scenes.find(s => s.id === sceneId);
      if (afterGen?.generationCancelled) {
        updateScene(sceneId, { generationCancelled: false, isGeneratingImage: false, generationStatus: undefined });
        return false;
      }

      const sceneAfterGen = useProjectStore.getState().scenes.find(s => s.id === sceneId);
      // [#492] 이전 이미지 백업 — 되돌리기 지원
      const prevImg = sceneAfterGen?.imageUrl;
      updateScene(sceneId, {
        imageUrl,
        previousImageUrl: prevImg || undefined,
        isGeneratingImage: false,
        generationStatus: undefined,
        isPromptFiltered: result.isFiltered || false,
        imageUpdatedAfterVideo: !!sceneAfterGen?.videoUrl,
      });

      // [FIX #531] Google Imagen/Whisk (무료 모델) 성공 시 비용 $0 — 폴백(NanoBanana 2)만 과금
      const isFreeModel = imageModel === ImageModel.GOOGLE_IMAGEN || imageModel === ImageModel.GOOGLE_WHISK;
      const cost = (isFreeModel && !result.isFallback) ? 0 : (result.isFallback ? PRICING.IMAGE_GENERATION_FALLBACK : PRICING.IMAGE_GENERATION);
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
    } finally {
      const latestScene = useProjectStore.getState().scenes.find(s => s.id === sceneId);
      if (latestScene?.isGeneratingImage) {
        updateScene(sceneId, { isGeneratingImage: false });
      }
    }
  }, [updateScene, addCost, requireAuth, storyboardImageModel]);

  // --- 배치 이미지 생성 ---
  const handleCancelBatchImageGeneration = useCallback(() => {
    if (!isBatchingImages) return;
    setIsBatchImageCancelRequested(true);
    showToast('이미지 일괄 생성 취소 요청됨 — 진행 중인 작업까지만 완료 후 중지합니다.');
  }, [isBatchingImages]);

  // [#602] 구글 이미지 일괄 적용 — 기존 프로젝트에서도 사용 가능
  const handleBatchGoogleReference = useCallback(async (sceneIds?: string[]) => {
    logger.trackAction('구글 이미지 일괄 적용');
    const { scenes: currentScenes, config: currentConfig } = useProjectStore.getState();
    if (!currentConfig) return;
    const allTargets = sceneIds && sceneIds.length > 0
      ? currentScenes.filter(s => sceneIds.includes(s.id))
      : currentScenes;
    if (allTargets.length === 0) return;
    setIsBatchingImages(true);
    setBatchImageProgress({ current: 0, total: allTargets.length, success: 0, fail: 0 });
    const { autoApplyGoogleReferences } = await import('../../../services/googleReferenceSearchService');
    await autoApplyGoogleReferences(
      allTargets,
      currentConfig.globalContext || '',
      updateScene,
      ({ appliedCount, failedCount, blockedCount, fallbackCount }) => {
        if (appliedCount > 0 && failedCount === 0) {
          showToast(
            `${appliedCount}개 장면에 무료 레퍼런스 이미지를 배치했어요!${fallbackCount > 0 ? ' (대체 소스 포함)' : ''}`,
          );
          return;
        }

        if (appliedCount > 0) {
          showToast(`${appliedCount}개 장면은 적용했고 ${failedCount}개 장면은 비어 있어요.`);
          return;
        }

        showToast(
          blockedCount > 0
            ? '기본 검색 경로가 차단됐고 대체 검색에서도 이미지를 찾지 못했어요. 잠시 후 다시 시도해주세요.'
            : '레퍼런스 이미지를 배치하지 못했어요. 검색어를 줄이거나 직접 업로드해주세요.',
          4500,
        );
      },
      true, // forceReplace — 이미 이미지가 있는 씬도 교체
    );
    setIsBatchingImages(false);
  }, [updateScene]);

  const handleBatchGenerateImages = useCallback(async (sceneIds?: string[]) => {
    logger.trackAction('이미지 일괄 생성');
    if (!requireAuth('이미지 일괄 생성')) return;
    const { scenes: currentScenes, config: currentConfig } = useProjectStore.getState();
    if (!currentConfig) return;
    const allTargets = currentScenes.filter(s => !s.imageUrl && !s.isGeneratingImage);
    // [#243] 선택된 장면만 필터 (sceneIds 제공 시)
    const targets = sceneIds && sceneIds.length > 0 ? allTargets.filter(s => sceneIds.includes(s.id)) : allTargets;
    if (targets.length === 0) return;

    const batchStore = useImageVideoStore.getState();
    const batchCharacters = batchStore.characters;
    const batchCharArtStyle = batchCharacters.find(c => c.analysisStyle)?.analysisStyle || '';
    const batchUserSelectedStyle = batchStore.style !== 'custom';
    const batchEffectiveStyle = batchUserSelectedStyle
      ? batchStore.style
      : (batchCharArtStyle.trim() !== '')
        ? batchCharArtStyle
        : (currentConfig.atmosphere && currentConfig.atmosphere.trim() !== '')
          ? currentConfig.atmosphere
          : (currentConfig.detectedStyleDescription && currentConfig.detectedStyleDescription.trim() !== '')
            ? currentConfig.detectedStyleDescription
            : 'Cinematic';
    const batchCustomNote = batchStore.customStyleNote?.trim();
    const batchFinalStyle = batchCustomNote ? `${batchEffectiveStyle}. ${batchCustomNote}` : batchEffectiveStyle;
    const batchPreserveCharStyle = !batchUserSelectedStyle && batchCharArtStyle.trim() !== '' && batchEffectiveStyle === batchCharArtStyle;
    const batchImageModel = currentConfig.imageModel || storyboardImageModel || ImageModel.NANO_COST;
    const batchOverrides: ImageGenerationOverrides = {
      imageModel: batchImageModel,
      finalStyle: batchFinalStyle,
      preserveCharacterStyle: batchPreserveCharStyle,
    };

    // [FIX #569] 무료 모델은 사전 쿠키 검증 + 동시성 축소 (20→3)
    const isFreeModel = batchImageModel === ImageModel.GOOGLE_IMAGEN || batchImageModel === ImageModel.GOOGLE_WHISK;
    if (isFreeModel) {
      try {
        const { useGoogleCookieStore } = await import('../../../stores/googleCookieStore');
        const gStore = useGoogleCookieStore.getState();
        if (!gStore.canGenerateImage()) {
          showToast('Google 무료 생성 한도 초과 또는 쿠키가 만료되었습니다. API 설정에서 쿠키를 확인해주세요.', 5000);
          return;
        }
      } catch { /* 검증 실패 시 진행 허용 */ }
    }
    const batchConcurrency = isFreeModel ? 3 : 20;

    setIsBatchingImages(true);
    setIsBatchImageCancelRequested(false);
    setBatchImageProgress({ current: 0, total: targets.length, success: 0, fail: 0 });

    await runImageBatch(
      targets,
      batchConcurrency,
      async (scene) => handleGenerateImage(scene.id, undefined, batchOverrides),
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
      () => batchImageCancelRef.current,
    );

    // BUG#16: 배치 완료 후 성공/실패 요약 표시
    const finalProgress = batchImageProgressRef.current;
    if (batchImageCancelRef.current) {
      showToast(`이미지 일괄 생성이 중단되었습니다. (${finalProgress.current}/${finalProgress.total} 완료)`, 5000);
    } else if (finalProgress.fail > 0) {
      showToast(`${finalProgress.fail}개 장면 이미지 생성 실패 (${finalProgress.success}개 성공)`, 5000);
    } else {
      showToast(`${finalProgress.success}개 장면 이미지 생성 완료`);
    }

    setIsBatchingImages(false);
    setIsBatchImageCancelRequested(false);
  }, [handleGenerateImage, requireAuth]);

  // [FIX #175-1] 자동 이미지 생성 제거 — 빈 슬롯으로 시작, 사용자가 직접 생성 버튼 클릭 시에만 생성
  // ⚠️ [절대 규칙] 스토리보드 생성 후 이미지 자동 생성 금지 — 비용 절감을 위해 사용자가 한두 컷 시험 후 일괄 생성하는 설계

  // --- 배치 진행 상태 ---
  const batchCurrent = isBatchUploading ? batchUploadProgress.current : isBatchingImages ? batchImageProgress.current : videoBatch.batchProgress.current;
  const batchTotal = isBatchUploading ? batchUploadProgress.total : isBatchingImages ? batchImageProgress.total : videoBatch.batchProgress.total;
  const batchPercent = batchTotal > 0 ? Math.round((batchCurrent / batchTotal) * 100) : 0;

  return (
    <>
      {/* 모션 프리뷰 CSS 키프레임 (#427) */}
      <style>{MOTION_KEYFRAMES}</style>
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
          isBatchUploading || isBatchingImages
            ? 'bg-orange-900/20 border-orange-500/30'
            : 'bg-blue-900/20 border-blue-500/30'
        }`}>
          {/* 헤더: 스피너 + 라벨 + 카운터 */}
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 border-2 rounded-full animate-spin ${
              isBatchUploading || isBatchingImages
                ? 'border-orange-400 border-t-transparent'
                : 'border-blue-400 border-t-transparent'
            }`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold ${isBatchUploading || isBatchingImages ? 'text-orange-300' : 'text-blue-300'}`}>
                {isBatchUploading ? '이미지 일괄 업로드' : isBatchingImages ? '이미지 일괄 생성' : '영상 일괄 생성'}
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
              <span className={`text-lg font-bold tabular-nums ${isBatchUploading || isBatchingImages ? 'text-orange-300' : 'text-blue-300'}`}>
                {batchCurrent}/{batchTotal}
              </span>
              {((isBatchUploading && batchUploadProgress.fail > 0) || (isBatchingImages && batchImageProgress.fail > 0) || (!isBatchUploading && !isBatchingImages && videoBatch.batchProgress.fail > 0)) && (
                <div className="text-xs text-red-400 mt-0.5">
                  {isBatchUploading ? batchUploadProgress.fail : isBatchingImages ? batchImageProgress.fail : videoBatch.batchProgress.fail}개 실패
                </div>
              )}
              {isBatchingImages && (
                <button
                  type="button"
                  onClick={handleCancelBatchImageGeneration}
                  disabled={isBatchImageCancelRequested}
                  className={`mt-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                    isBatchImageCancelRequested
                      ? 'text-gray-400 border-gray-600/50 cursor-not-allowed'
                      : 'text-red-300 border-red-500/40 bg-red-600/15 hover:bg-red-600/25'
                  }`}
                >
                  {isBatchImageCancelRequested ? '취소 요청됨' : '취소'}
                </button>
              )}
            </div>
          </div>

          {/* 프로그레스 바 */}
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${batchPercent}%` }}
              className={`h-full rounded-full transition-all duration-700 ${
                isBatchUploading
                  ? batchUploadProgress.fail > 0 ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'
                  : isBatchingImages
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
          {isBatchingImages && isBatchImageCancelRequested && (
            <p className="text-xs text-red-300/90">
              취소 처리 중: 완료 {batchImageProgress.current}/{batchImageProgress.total}
            </p>
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

      {longFormBannerVariant && (
        <LongFormExportBanner
          variant={longFormBannerVariant}
          exportingTarget={nleExportingTarget}
          onExport={handleExportStoryboardNle}
        />
      )}

      {/* Header + actions */}
      <div className="mb-4 space-y-2">
        {/* Row 1: Title + View mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white whitespace-nowrap">
              스토리보드 <span className="text-gray-400 text-lg font-normal">({totalScenes}개)</span>
            </h2>
            {/* View mode toggle */}
            <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${viewMode === 'preview' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                미리보기
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                그리드
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                리스트
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Action buttons (wrappable) */}
        <div className="flex flex-wrap items-center gap-2">
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
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              📋 프롬프트 복사
            </button>
          )}
          {/* [#518] 이미지 일괄 업로드 */}
          {totalScenes > 0 && (
            <>
              <button
                type="button"
                onClick={() => batchUploadRef.current?.click()}
                disabled={isAnyBatchRunning}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                일괄 업로드
              </button>
              <input
                type="file"
                ref={batchUploadRef}
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleBatchUploadFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
            </>
          )}
          {/* HTML/ZIP 저장 (30장면 이상이면 ZIP 자동 선택) */}
          <button
            type="button"
            onClick={async () => {
              try {
                if (totalScenes >= 30) {
                  const { exportProjectZip } = await retryImport(() => import('../../../services/exportService'));
                  await exportProjectZip();
                  showToast('ZIP 파일이 저장되었습니다.');
                } else {
                  const { exportProjectHtml } = await retryImport(() => import('../../../services/exportService'));
                  await exportProjectHtml();
                  showToast('HTML 파일이 저장되었습니다.');
                }
              } catch (e: unknown) {
                showToast('저장 실패: ' + (e instanceof Error ? e.message : String(e)));
              }
            }}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            {totalScenes >= 30 ? '📦 스토리보드 저장' : '💾 스토리보드 저장'}
          </button>
          <button
            type="button"
            onClick={handleCopyAllScripts}
            disabled={!allSceneScriptText}
            className="px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-orange-300 text-xs font-medium rounded-lg border border-orange-500/40 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            {isAllScriptCopied ? '✅ 복사됨!' : '📋 대본 복사'}
          </button>
          {/* Download dropdown */}
          <div className="relative" ref={downloadDropdownRef}>
            <button
              type="button"
              onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
              disabled={!hasDownloadActions}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-xs font-medium rounded-lg border border-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
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
                    const { downloadAllMedia } = await retryImport(() => import('../../../services/exportService'));
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
                    const { downloadImages } = await retryImport(() => import('../../../services/exportService'));
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
                    const { downloadImagesAsMp4 } = await retryImport(() => import('../../../services/exportService'));
                    await downloadImagesAsMp4();
                  }}
                  disabled={completedImages === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  title="각 장면 이미지를 개별 MP4 정지 화면 영상으로 변환합니다. NLE 편집기에서 타임라인에 바로 배치할 수 있어요."
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  🎬 이미지→MP4 변환
                  <span className="ml-auto text-[11px] text-gray-400">(편집용 정지 화면)</span>
                  <span className="ml-1 text-[11px] text-gray-500">{completedImages}장</span>
                </button>
                <div className="border-t border-gray-700" />
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadThumbnails } = await retryImport(() => import('../../../services/exportService'));
                    await downloadThumbnails();
                  }}
                  disabled={completedThumbnails === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-orange-200 hover:bg-orange-600/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  🖼️ 썸네일 ZIP
                  <span className="ml-auto text-[11px] text-orange-300/70">{completedThumbnails}장</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { exportVisualPromptsHtml } = await retryImport(() => import('../../../services/exportService'));
                    exportVisualPromptsHtml();
                    showToast('비주얼 프롬프트 HTML이 저장되었습니다.');
                  }}
                  disabled={totalScenes === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-orange-200 hover:bg-orange-600/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-300" />
                  🎨 비주얼 프롬프트
                  <span className="ml-auto text-[11px] text-orange-300/70">{totalScenes}개</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { exportVideoPromptsHtml } = await retryImport(() => import('../../../services/exportService'));
                    exportVideoPromptsHtml();
                    showToast('비디오 프롬프트 HTML이 저장되었습니다.');
                  }}
                  disabled={totalScenes === 0}
                  className="w-full text-left px-4 py-2.5 text-sm text-orange-200 hover:bg-orange-600/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-300" />
                  🎬 비디오 프롬프트
                  <span className="ml-auto text-[11px] text-orange-300/70">{totalScenes}개</span>
                </button>
                <div className="border-t border-gray-700" />
                <button
                  type="button"
                  onClick={async () => {
                    setShowDownloadDropdown(false);
                    const { downloadVideos } = await retryImport(() => import('../../../services/exportService'));
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
          {failedVideoCount > 0 && (
            <button
              type="button"
              onClick={() => videoBatch.retryFailedBatch()}
              disabled={isAnyBatchRunning}
              className="px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 disabled:opacity-40 disabled:cursor-not-allowed text-red-300 text-xs font-medium rounded-lg border border-red-500/40 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="w-2 h-2 rounded-full bg-red-400" />
              실패한 영상 {failedVideoCount}개 재시도
            </button>
          )}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowGenDropdown(!showGenDropdown)}
              disabled={totalScenes === 0 || isAnyBatchRunning}
              className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 whitespace-nowrap"
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
                  {(storyboardImageModel === ImageModel.GOOGLE_IMAGEN || storyboardImageModel === ImageModel.GOOGLE_WHISK) && !useGoogleCookieStore.getState().isValid && (
                    <button
                      type="button"
                      onClick={() => { useUIStore.getState().setShowApiSettings(true); setShowGenDropdown(false); }}
                      className="mt-1.5 w-full text-left flex items-start gap-1.5 bg-amber-900/20 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-300/90 leading-relaxed hover:bg-amber-900/30 transition-colors"
                    >
                      <span className="shrink-0">⚠️</span>
                      <span>Google 쿠키 미연결 — <strong className="text-amber-200">API 설정</strong>에서 등록하기</span>
                    </button>
                  )}
                </div>
                {/* [#243] 선택 모드 안내 */}
                {hasSelection && (
                  <div className="px-4 py-1.5 bg-orange-600/10 border-b border-orange-500/20">
                    <span className="text-[11px] text-orange-300 font-medium">선택한 {selectedSceneIds.size}개 장면만 생성</span>
                  </div>
                )}
                {/* [#602] 구글 이미지 일괄 적용 버튼 */}
                {enableGoogleReference && (
                  <button
                    type="button"
                    onClick={() => { handleBatchGoogleReference(selectedSceneIdsArray); setShowGenDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-base text-gray-200 hover:bg-orange-900/30 transition-colors flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="flex-1">구글 이미지 {hasSelection ? `${selectedSceneIds.size}개` : '일괄'} 적용</span>
                    <span className="text-[10px] text-green-400/70">🆓 무료</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { handleBatchGenerateImages(selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 text-base text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="flex-1">이미지 {hasSelection ? `${selectedImageEligible}개` : '일괄'} 생성</span>
                  <span className="text-[10px] text-orange-400/70">{(storyboardImageModel === ImageModel.GOOGLE_IMAGEN || storyboardImageModel === ImageModel.GOOGLE_WHISK) ? '🆓 무료' : fmtCost(PRICING.IMAGE_GENERATION * selectedImageEligible, exRate)}</span>
                </button>
                {selectedImageEligible > 0 && selectedVideoEligible === 0 && totalScenes > 0 && (
                  <p className="px-4 py-1 text-[10px] text-yellow-400/80 bg-yellow-600/10">⚠️ 이미지가 없는 장면은 영상 생성 불가 — 이미지를 먼저 생성해주세요</p>
                )}
                <div className="border-t border-gray-700" />
                {/* #427 모션 일괄 적용 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowGenDropdown(false);
                    showToast('모션 효과 자동 분석 중...');
                    try {
                      useEditRoomStore.getState().regenerateMotions();
                      showToast(`${scenes.length}개 장면에 모션 효과가 적용되었습니다.`);
                    } catch (e) {
                      showToast('모션 일괄 적용 실패');
                      logger.trackSwallowedError('StoryboardPanel:batchMotion', e);
                    }
                  }}
                  disabled={totalScenes === 0}
                  className="w-full text-left px-4 py-2.5 text-base text-gray-200 hover:bg-amber-600/10 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="flex-1">🎬 모션 일괄 적용</span>
                  <span className="text-[10px] text-amber-400/70">무료</span>
                </button>
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
                  onClick={() => { videoBatch.runGrokHQBatch('10', false, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-pink-400" />
                  <span className="flex-1">Grok SFX Only 10초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-pink-400/70">{fmtCost(PRICING.VIDEO_GROK_10S * selectedVideoEligible, exRate)}</span>
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
                  onClick={() => { videoBatch.runGrokHQBatch('10', true, selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                  <span className="flex-1">Grok 나레이션 10초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-fuchsia-400/70">{fmtCost(PRICING.VIDEO_GROK_10S * selectedVideoEligible, exRate)}</span>
                </button>
                <div className="border-t border-gray-700" />
                <p className="px-4 py-1 text-xs text-gray-500 font-bold uppercase">Seedance 1.5 Pro (Kie)</p>
                {(['4', '8', '12'] as SeedanceDuration[]).map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => { videoBatch.runSeedanceBatch(selectedSceneIdsArray, duration); setShowGenDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                    <span className="flex-1">Seedance 1.5 Pro {duration}초 {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                    <span className="text-[10px] text-orange-400/70">{fmtCost(getSeedanceCost(duration) * selectedVideoEligible, exRate)}</span>
                  </button>
                ))}
                <div className="border-t border-gray-700" />
                <p className="px-4 py-1 text-xs text-gray-500 font-bold uppercase">🆓 Google Veo 3.1 (무료 · 쿠키)</p>
                <button
                  type="button"
                  onClick={() => { videoBatch.runGoogleVeoBatch(selectedSceneIdsArray); setShowGenDropdown(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="flex-1">Veo 3.1 (무료) {hasSelection ? `(${selectedVideoEligible}개)` : '(일괄)'}</span>
                  <span className="text-[10px] text-green-400/70">🆓 무료</span>
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
          {/* 편집실로 이동 */}
          <button
            type="button"
            onClick={() => useNavigationStore.getState().setActiveTab('edit-room')}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 whitespace-nowrap ml-auto"
          >
            편집실로 이동
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
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
          onSeedanceVideo={(id) => videoBatch.runSingleSeedance(id)}
          onVeoVideo={(id) => videoBatch.runSingleVeoFast(id)}
          onDelete={removeScene}
          onAutoPrompt={handleAutoPrompt}
          onReferenceUpload={handleReferenceUpload}
          onUploadImage={handleUploadImage}
          onAddAfter={handleAddSceneAfter}
          onSplit={handleSplitScene}
          onMerge={handleMergeScene}
          totalScenes={totalScenes}
        />
      )}

      {/* Scene list / grid / preview — [#518] grid-level batch drop handler */}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const files = e.dataTransfer.files;
          if (files.length > 1) {
            handleBatchUploadFiles(files);
          } else if (files.length === 1 && totalScenes > 0) {
            showToast('개별 장면 카드에 놓아주세요. 여러 파일을 한번에 놓으면 일괄 업로드됩니다.');
          }
        }}
      >
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
        <VirtualGridView
          scenes={scenes}
          handleGenerateImage={handleGenerateImage}
          removeScene={removeScene}
          videoBatch={videoBatch}
          handlePlaySceneAudio={handlePlaySceneAudio}
          playingSceneId={playingSceneId}
          sceneProgress={sceneProgress}
          handleAddSceneAfter={handleAddSceneAfter}
          handleSplitScene={handleSplitScene}
          handleMergeScene={handleMergeScene}
          handleReferenceUpload={handleReferenceUpload}
          handleUploadImage={handleUploadImage}
          setDetailScene={setDetailScene}
          handleCopyScript={handleCopyScript}
          selectedSceneIds={selectedSceneIds}
          toggleSceneSelect={toggleSceneSelect}
        />
      ) : (
        <VirtualListView
          scenes={scenes}
          handleUpdatePrompt={handleUpdatePrompt}
          removeScene={removeScene}
          handleGenerateImage={handleGenerateImage}
          videoBatch={videoBatch}
          handlePlaySceneAudio={handlePlaySceneAudio}
          playingSceneId={playingSceneId}
          sceneProgress={sceneProgress}
          handleAddSceneAfter={handleAddSceneAfter}
          handleSplitScene={handleSplitScene}
          handleMergeScene={handleMergeScene}
          handleAutoPrompt={handleAutoPrompt}
          handleReferenceUpload={handleReferenceUpload}
          handleUploadImage={handleUploadImage}
          setDetailScene={setDetailScene}
          handleCopyScript={handleCopyScript}
          selectedSceneIds={selectedSceneIds}
          toggleSceneSelect={toggleSceneSelect}
        />
      )}
      </div>
    </>
  );
};

export default StoryboardPanel;
