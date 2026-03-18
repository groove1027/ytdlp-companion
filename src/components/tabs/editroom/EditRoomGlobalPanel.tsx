import React, { Suspense, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import BgmOverlayPanel from './BgmOverlayPanel';
import MemeAndSfxPanel, { MemeAndSfxSearchModal } from './MemeAndSfxPanel';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useProjectStore } from '../../../stores/projectStore';
import { SUBTITLE_TEMPLATES } from '../../../constants/subtitleTemplates';
import { FONT_LIBRARY, getFontsByCategory, getFontByFamily } from '../../../constants/fontLibrary';
import type { FontCategory, FontEntry } from '../../../constants/fontLibrary';
import { loadFont } from '../../../services/fontLoaderService';
import { evolinkChat } from '../../../services/evolinkService';
import { showToast } from '../../../stores/uiStore';
import type { SubtitleStyle, SubtitleTemplate } from '../../../types';
import { lazyRetry } from '../../../utils/retryImport';

// 기존 전체 에디터들 lazy load
const SubtitleStyleEditor = lazyRetry(() => import('../editor/SubtitleStyleEditor'));
const EffectPresets = lazyRetry(() => import('../editor/EffectPresets'));

type PanelTab = 'effects' | 'subtitle' | 'bgm' | 'meme-sfx';
type FullModal = 'effects' | 'subtitle' | 'meme-sfx' | null;

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-32">
    <div className="flex flex-col items-center gap-2">
      <div className="w-6 h-6 border-2 border-gray-600 border-t-amber-400 rounded-full animate-spin" />
      <span className="text-gray-500 text-sm">로딩 중...</span>
    </div>
  </div>
);

// ─── 자막 퀵 패널 (이미지 효과 탭과 동일 높이, AI 처리 + 글꼴 + 크기) ───
const FONT_CATS: (FontCategory | 'all')[] = ['all', 'gothic', 'serif', 'display', 'handwriting', 'art', 'pixel'];
const FONT_CAT_SHORT: Record<FontCategory | 'all', string> = {
  all: '전체', gothic: '고딕', serif: '명조', display: '장식', handwriting: '손글씨', art: '아트', pixel: '픽셀',
};

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular',
  500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

const AI_SUBTITLE_ESTIMATED_COST_PER_SCENE = 0.015;

const formatAiSubtitleEstimatedCost = (sceneCount: number): string => (sceneCount * AI_SUBTITLE_ESTIMATED_COST_PER_SCENE).toFixed(2);

const isAbortLikeError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && (error.name === 'AbortError' || error.message.includes('취소'));

// ─── 이미지 효과 퀵 패널 (대표 프리셋 + 클릭 적용) ───
const PZ_QUICK = [
  { id: 'fast', label: '빠른', icon: '⚡' },
  { id: 'smooth', label: '부드러움', icon: '🌊' },
  { id: 'cinematic', label: '시네마틱', icon: '🎬' },
  { id: 'dynamic', label: '역동적', icon: '💥' },
  { id: 'dreamy', label: '우아한', icon: '✨' },
  { id: 'dramatic', label: '드라마틱', icon: '🎭' },
  { id: 'zoom', label: '집중', icon: '🔍' },
  { id: 'vintage', label: '빈티지', icon: '📷' },
];
const MO_QUICK = [
  { id: 'none', label: '없음' },
  { id: 'fade', label: '점진' },
  { id: 'pan', label: '팬' },
  { id: 'micro', label: '마이크로' },
  { id: 'slow', label: '느린' },
  { id: 'shake', label: '흔들림' },
  { id: 'rotate', label: '회전' },
  { id: 'glitch', label: '글릿치' },
];
const OV_QUICK = [
  { id: 'film-frame', label: '필름', icon: '🎞' },
  { id: 'snow', label: '눈', icon: '❄' },
  { id: 'rain', label: '비', icon: '🌧' },
  { id: 'bokeh', label: '보케', icon: '🔮' },
  { id: 'cherry-blossom', label: '벚꽃', icon: '🌸' },
  { id: 'fog', label: '안개', icon: '🌁' },
  { id: 'neon-glow', label: '네온', icon: '💜' },
  { id: 'cyberpunk', label: '사이버펑크', icon: '🤖' },
];

const EffectsQuickPanel: React.FC<{ onOpenDetail: () => void }> = ({ onOpenDetail }) => {
  const motionLooping = useEditRoomStore((s) => s.motionLooping);
  const setMotionLooping = useEditRoomStore((s) => s.setMotionLooping);
  const expandedSceneId = useEditRoomStore((s) => s.expandedSceneId);
  const setExpandedSceneId = useEditRoomStore((s) => s.setExpandedSceneId);
  const sceneEffects = useEditRoomStore((s) => s.sceneEffects);
  const setSceneEffect = useEditRoomStore((s) => s.setSceneEffect);
  const addSceneOverlay = useEditRoomStore((s) => s.addSceneOverlay);
  const removeSceneOverlay = useEditRoomStore((s) => s.removeSceneOverlay);
  const sceneOverlays = useEditRoomStore((s) => s.sceneOverlays);
  const scenes = useProjectStore((s) => s.scenes);

  // 타겟 장면: expandedSceneId가 없으면 첫 번째 장면 자동 선택
  const targetId = expandedSceneId || scenes[0]?.id || null;

  const currentEffect = targetId ? sceneEffects[targetId] : undefined;
  const activePZ = currentEffect?.panZoomPreset || 'smooth';
  const activeMO = currentEffect?.motionEffect || 'none';
  const activeOVs = targetId ? (sceneOverlays[targetId] || []).map((o) => o.presetId) : [];

  // 장면 자동 선택 헬퍼: expandedSceneId가 없으면 첫 장면을 자동 선택
  const ensureTarget = useCallback((): string | null => {
    if (expandedSceneId) return expandedSceneId;
    const firstId = scenes[0]?.id;
    if (firstId) {
      setExpandedSceneId(firstId);
      return firstId;
    }
    showToast('장면이 없습니다');
    return null;
  }, [expandedSceneId, scenes, setExpandedSceneId]);

  const applyPZ = useCallback((id: string) => {
    const sid = ensureTarget();
    if (!sid) return;
    // 토글: 이미 선택된 프리셋 클릭 → 기본값으로 해제
    if (sceneEffects[sid]?.panZoomPreset === id) {
      setSceneEffect(sid, { panZoomPreset: 'smooth' });
    } else {
      setSceneEffect(sid, { panZoomPreset: id });
    }
  }, [ensureTarget, sceneEffects, setSceneEffect]);

  const applyMO = useCallback((id: string) => {
    const sid = ensureTarget();
    if (!sid) return;
    // 토글: 이미 선택된 모션 클릭 → none으로 해제
    if (sceneEffects[sid]?.motionEffect === id) {
      setSceneEffect(sid, { motionEffect: 'none' });
    } else {
      setSceneEffect(sid, { motionEffect: id });
    }
  }, [ensureTarget, sceneEffects, setSceneEffect]);

  const applyOV = useCallback((id: string) => {
    const sid = ensureTarget();
    if (!sid) return;
    const overlays = sceneOverlays[sid] || [];
    const existingIdx = overlays.findIndex((o) => o.presetId === id);
    if (existingIdx >= 0) {
      // 토글: 이미 적용된 오버레이 클릭 → 제거
      removeSceneOverlay(sid, existingIdx);
    } else {
      addSceneOverlay(sid, { presetId: id, blendMode: 'normal', opacity: 80, intensity: 70, speed: 1 });
    }
  }, [ensureTarget, sceneOverlays, removeSceneOverlay, addSceneOverlay]);

  // 선택 초기화: 팬&줌 → smooth, 모션 → none, 오버레이 전부 제거
  const handleReset = useCallback(() => {
    const sid = ensureTarget();
    if (!sid) return;
    setSceneEffect(sid, { panZoomPreset: 'smooth', motionEffect: 'none' });
    const overlays = sceneOverlays[sid] || [];
    // 뒤에서부터 제거 (인덱스 안정성)
    for (let i = overlays.length - 1; i >= 0; i--) {
      removeSceneOverlay(sid, i);
    }
    showToast('이미지 효과가 초기화되었습니다');
  }, [ensureTarget, setSceneEffect, sceneOverlays, removeSceneOverlay]);

  const regenerateMotions = useEditRoomStore((s) => s.regenerateMotions);

  const hasAnyEffect = activePZ !== 'smooth' || activeMO !== 'none' || activeOVs.length > 0;

  const handleRegenerate = useCallback(() => {
    regenerateMotions();
    showToast('전체 장면의 모션이 다채롭게 재생성되었습니다');
  }, [regenerateMotions]);

  return (
    <div className="space-y-2.5">
      {/* 모션 재생성 + 루핑 + 초기화 */}
      <div className="flex items-center justify-between bg-gray-900/50 rounded-lg px-3 py-1.5 border border-gray-700">
        <div>
          <p className="text-xs font-bold text-gray-200">모션 루핑</p>
          <p className="text-[10px] text-gray-500">
            {motionLooping ? '반복 재생' : '1회 재생'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyEffect && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/15 border border-red-500/30 text-red-400 hover:bg-red-600/25 hover:border-red-500/50 transition-all"
            >
              초기화
            </button>
          )}
          <button
            type="button"
            onClick={() => setMotionLooping(!motionLooping)}
            className={`relative w-10 h-5 rounded-full transition-colors ${motionLooping ? 'bg-amber-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${motionLooping ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* 모션 재생성 버튼 */}
      <button
        type="button"
        onClick={handleRegenerate}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600/20 to-orange-600/20 hover:from-amber-600/30 hover:to-orange-600/30 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 rounded-lg text-xs font-bold transition-all"
      >
        <span className="text-sm">🎲</span> 전체 모션 재생성
      </button>

      {/* 팬&줌 대표 8종 */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">팬&줌 <span className="text-gray-600 font-normal">8종 / 전체 20+종</span></p>
        <div className="flex flex-wrap gap-1">
          {PZ_QUICK.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPZ(p.id)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold border transition-all ${
                activePZ === p.id
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            ><span className="text-[11px]">{p.icon}</span>{p.label}</button>
          ))}
        </div>
      </div>

      {/* 모션 대표 8종 */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">모션 <span className="text-gray-600 font-normal">8종 / 전체 17종</span></p>
        <div className="flex flex-wrap gap-1">
          {MO_QUICK.map((m) => (
            <button key={m.id} type="button" onClick={() => applyMO(m.id)}
              className={`px-1.5 py-0.5 rounded text-xs font-bold border transition-all ${
                activeMO === m.id
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {/* 오버레이 대표 8종 */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">오버레이 <span className="text-gray-600 font-normal">8종 / 전체 40종</span></p>
        <div className="flex flex-wrap gap-1">
          {OV_QUICK.map((o) => (
            <button key={o.id} type="button" onClick={() => applyOV(o.id)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold border transition-all ${
                activeOVs.includes(o.id)
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-gray-900/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            ><span className="text-[11px]">{o.icon}</span>{o.label}</button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 leading-tight">전체 프리셋 프리뷰, 일괄 적용, 세부 조정은 아래 상세 편집에서 확인하세요.</p>

      {/* 상세 편집 버튼 */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold border border-blue-400/50 shadow-md transition-colors"
      >
        상세 편집 열기
      </button>
    </div>
  );
};

// ─── 자막 퀵 패널 (AI 처리 + 글꼴 + 크기) ───
const SubtitleQuickPanel: React.FC<{ onOpenDetail: () => void }> = ({ onOpenDetail }) => {
  const globalStyle = useEditRoomStore((s) => s.globalSubtitleStyle);
  const setGlobalSubtitleStyle = useEditRoomStore((s) => s.setGlobalSubtitleStyle);
  const sceneOrder = useEditRoomStore((s) => s.sceneOrder);
  const sceneSubtitlesMap = useEditRoomStore((s) => s.sceneSubtitles);
  const setSceneSubtitle = useEditRoomStore((s) => s.setSceneSubtitle);
  const createSubtitleSegments = useEditRoomStore((s) => s.createSubtitleSegments);
  const removeAllSubtitlePunctuation = useEditRoomStore((s) => s.removeAllSubtitlePunctuation);
  const charsPerLine = useEditRoomStore((s) => s.charsPerLine);
  const setCharsPerLine = useEditRoomStore((s) => s.setCharsPerLine);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
  const aiAbortControllerRef = React.useRef<AbortController | null>(null);
  const aiLastStartedSceneRef = React.useRef(0);
  const bottomFade = useEditRoomStore((s) => s.bottomFade);
  const setBottomFade = useEditRoomStore((s) => s.setBottomFade);

  const [fontCat, setFontCat] = useState<FontCategory | 'all'>('all');
  const [fontSearch, setFontSearch] = useState('');
  const [fontDropOpen, setFontDropOpen] = useState(false);
  const [expandedFontId, setExpandedFontId] = useState<string | null>(null);

  const tpl = globalStyle?.template;
  const currentFontFamily = tpl?.fontFamily || 'Pretendard';
  const currentFontWeight = tpl?.fontWeight || 700;
  const currentFontSize = tpl?.fontSize || 48;

  const filteredFonts = React.useMemo(() => {
    let list = getFontsByCategory(fontCat);
    if (fontSearch.trim()) {
      const q = fontSearch.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.fontFamily.toLowerCase().includes(q));
    }
    return list.slice(0, 50);
  }, [fontCat, fontSearch]);

  const updateStyle = useCallback((partial: Partial<SubtitleTemplate>) => {
    const base = tpl || SUBTITLE_TEMPLATES[0];
    const updated = { ...base, ...partial };
    const style: SubtitleStyle = { template: updated, customFont: globalStyle?.customFont, customFontUrl: globalStyle?.customFontUrl };
    setGlobalSubtitleStyle(style);
  }, [tpl, globalStyle, setGlobalSubtitleStyle]);

  const handleFontClick = useCallback((entry: FontEntry) => {
    if (entry.weights.length <= 1) {
      loadFont(entry);
      updateStyle({ fontFamily: entry.fontFamily, fontWeight: entry.weights[0] || 400 });
      setFontDropOpen(false);
      setFontSearch('');
      setExpandedFontId(null);
    } else {
      setExpandedFontId((prev) => (prev === entry.id ? null : entry.id));
    }
  }, [updateStyle]);

  const handleWeightSelect = useCallback((entry: FontEntry, weight: number) => {
    loadFont(entry);
    updateStyle({ fontFamily: entry.fontFamily, fontWeight: weight });
    setFontDropOpen(false);
    setFontSearch('');
    setExpandedFontId(null);
  }, [updateStyle]);

  const handleCancelAiProcess = useCallback(() => {
    aiAbortControllerRef.current?.abort();
  }, []);

  const handleAiProcess = useCallback(async () => {
    const targetSceneIds = sceneOrder.filter((sceneId) => sceneSubtitlesMap[sceneId]?.text?.trim());
    if (targetSceneIds.length === 0) { showToast('자막 텍스트가 없습니다'); return; }
    const estimatedCost = formatAiSubtitleEstimatedCost(targetSceneIds.length);
    const confirmed = window.confirm(`${targetSceneIds.length}개 장면 처리 예정 (예상 비용: ~$${estimatedCost}). 시작하시겠습니까?`);
    if (!confirmed) return;

    const controller = new AbortController();
    aiAbortControllerRef.current = controller;
    aiLastStartedSceneRef.current = 0;
    setAiProgress({ current: 0, total: targetSceneIds.length });
    setAiLoading(true);
    try {
      const payload = targetSceneIds.map((sceneId) => ({
        id: sceneId,
        text: sceneSubtitlesMap[sceneId]?.text?.replace(/\n/g, ' ') || '',
      }));
      const res = await evolinkChat([
        { role: 'system', content: 'You are a subtitle line-break assistant. Return ONLY valid JSON.' },
        { role: 'user', content: `다음 자막 텍스트들을 한 줄당 ${charsPerLine}자에 최대한 가깝게 채워서 자연스럽게 줄바꿈해주세요.\n각 줄이 너무 짧으면 안 됩니다. ${charsPerLine}자의 70~100% 범위를 목표로 하되, 의미 단위/문맥에 맞게 나눠주세요.\n5자 이하의 극단적으로 짧은 줄은 절대 만들지 마세요.\n입력: ${JSON.stringify(payload)}\n출력 포맷: 동일 JSON 배열 [{id, text}] (text에 \\n 삽입)` },
      ], { temperature: 0.2, responseFormat: { type: 'json_object' }, signal: controller.signal, model: 'gemini-3.1-flash-lite-preview' });
      const raw = res.choices?.[0]?.message?.content || '[]';
      const obj = JSON.parse(raw);
      if (controller.signal.aborted) throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
      // [FIX #404] AI가 배열을 객체로 감쌀 수 있음 ({results:[...]}, {items:[...]}, {data:[...]} 등)
      const parsed: { id: string; text: string }[] = Array.isArray(obj)
        ? obj
        : (obj.results || obj.items || obj.data || obj.subtitles || (Array.isArray(Object.values(obj)[0]) ? Object.values(obj)[0] as { id: string; text: string }[] : []));
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach(({ id, text }) => { if (id && text) setSceneSubtitle(id, { text }); });
      }
      if (controller.signal.aborted) throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
      removeAllSubtitlePunctuation();
      const total = await createSubtitleSegments({
        signal: controller.signal,
        onProgress: (current, totalScenes) => {
          aiLastStartedSceneRef.current = current;
          setAiProgress({ current, total: totalScenes });
        },
      });
      showToast(total > 0
        ? `AI 자막 처리 완료: 줄바꿈 → 구두점 제거 → ${total}개 세그먼트`
        : `AI 줄바꿈 + 구두점 제거 완료`
      );
    } catch (err) {
      if (controller.signal.aborted || isAbortLikeError(err)) {
        const completedScenes = Math.max(0, aiLastStartedSceneRef.current - 1);
        showToast(`AI 자막 처리가 취소되었습니다. ${completedScenes}개 장면까지 처리 완료.`);
        return;
      }
      showToast('AI 자막 처리 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      aiAbortControllerRef.current = null;
      aiLastStartedSceneRef.current = 0;
      setAiProgress(null);
      setAiLoading(false);
    }
  }, [sceneOrder, sceneSubtitlesMap, charsPerLine, setSceneSubtitle, removeAllSubtitlePunctuation, createSubtitleSegments]);

  // 선택한 템플릿 중 인기 8개만 표시
  const quickTemplates = React.useMemo(() => SUBTITLE_TEMPLATES.slice(0, 8), []);

  return (
    <div className="space-y-2.5">
      {/* AI 자막 처리 */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-400 font-bold">AI 자막 처리</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-1">
            <input
              type="number"
              min={10} max={40}
              value={charsPerLine}
              onChange={(e) => setCharsPerLine(Math.max(10, Math.min(40, Number(e.target.value))))}
              className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-amber-400 font-mono text-center focus:outline-none focus:border-amber-500/50"
            />
            <span className="text-[10px] text-gray-500">자/줄</span>
          </div>
          {aiLoading ? (
            <button
              type="button"
              onClick={handleCancelAiProcess}
              className="flex-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30"
            >
              <span className="flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-2 border-red-200/40 border-t-red-200 rounded-full animate-spin" />
                처리 중 ({aiProgress?.current ?? 0}/{aiProgress?.total ?? 0}) — 취소
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAiProcess}
              className="flex-1 px-3 py-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-xs font-bold border border-amber-400/50 transition-colors"
            >
              AI 자막 처리
            </button>
          )}
        </div>
        {aiLoading && aiProgress && (
          <p className="text-[10px] text-amber-300 leading-snug">
            진행 상황: {aiProgress.current}/{aiProgress.total} 장면 처리 중
          </p>
        )}
        <p className="text-[10px] text-gray-500 leading-snug">
          AI 줄바꿈({charsPerLine}자 기준) → 구두점(. , ! ? 등) 제거 → 자막 세그먼트 자동 생성
        </p>
      </div>

      {/* 글꼴 선택 */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">글꼴</p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setFontDropOpen(!fontDropOpen)}
            className="w-full flex items-center justify-between px-3 py-1 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 hover:border-gray-500 transition-colors"
          >
            <span style={{ fontFamily: currentFontFamily }} className="truncate text-xs">
              {getFontByFamily(currentFontFamily)?.name || currentFontFamily}
              <span className="text-gray-500 text-[10px] ml-1">{WEIGHT_LABELS[currentFontWeight] || currentFontWeight}</span>
            </span>
            <span className="text-gray-500 text-xs ml-1">{fontDropOpen ? '▲' : '▼'}</span>
          </button>
          {fontDropOpen && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-xl max-h-[240px] overflow-hidden flex flex-col">
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="글꼴 검색..."
                className="w-full px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-0.5 px-2 py-1 border-b border-gray-700/50 flex-shrink-0">
                {FONT_CATS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFontCat(c)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                      fontCat === c ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {FONT_CAT_SHORT[c]}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredFonts.map((f) => (
                  <div key={f.id}>
                    <button
                      type="button"
                      onClick={() => handleFontClick(f)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between ${
                        f.fontFamily === currentFontFamily ? 'bg-amber-600/10 text-amber-300' : 'text-gray-300'
                      }`}
                    >
                      <span style={{ fontFamily: f.fontFamily }}>{f.name}</span>
                      {f.weights.length > 1 && (
                        <span className="text-[10px] text-gray-500 ml-1 flex-shrink-0">
                          {f.weights.length}W {expandedFontId === f.id ? '▼' : '▶'}
                        </span>
                      )}
                    </button>
                    {expandedFontId === f.id && f.weights.length > 1 && (
                      <div className="flex flex-wrap gap-1 px-3 py-1.5 bg-gray-850 border-t border-gray-700/50">
                        {f.weights.map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => handleWeightSelect(f, w)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              f.fontFamily === currentFontFamily && w === currentFontWeight
                                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200 hover:border-gray-500'
                            }`}
                          >
                            {WEIGHT_LABELS[w] || w}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 글꼴 크기 + 자막 위치 한 줄 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-bold">글꼴 크기</p>
            <span className="text-[11px] text-amber-400 font-mono">{currentFontSize}px</span>
          </div>
          <input
            type="range"
            min={20} max={120} step={1}
            value={currentFontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            className="w-full accent-amber-500"
          />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-bold">자막 위치</p>
            <span className="text-[11px] text-amber-400 font-mono">{tpl?.positionY ?? 10}%</span>
          </div>
          <input
            type="range"
            min={0} max={50} step={1}
            value={tpl?.positionY ?? 10}
            onChange={(e) => updateStyle({ positionY: Number(e.target.value) })}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-[9px] text-gray-600"><span>하단</span><span>상단</span></div>
        </div>
      </div>

      {/* 토글 2개 한 줄로 */}
      <div className="flex items-center gap-4">
        {(() => {
          const hasBg = !!(tpl?.backgroundColor && tpl.backgroundColor !== 'transparent');
          return (
            <div className="flex items-center gap-2 flex-1">
              <p className="text-[11px] text-gray-400 font-bold">자막 배경</p>
              <button
                type="button"
                onClick={() => updateStyle({ backgroundColor: hasBg ? 'transparent' : '#000000' })}
                className={`relative w-8 h-4 rounded-full transition-colors ${hasBg ? 'bg-amber-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${hasBg ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          );
        })()}
        {(() => {
          const isOn = bottomFade > 0;
          return (
            <div className="flex items-center gap-2 flex-1">
              <p className="text-[11px] text-gray-400 font-bold">하단 페이드</p>
              <button
                type="button"
                onClick={() => setBottomFade(isOn ? 0 : 50)}
                className={`relative w-8 h-4 rounded-full transition-colors ${isOn ? 'bg-amber-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isOn ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          );
        })()}
      </div>

      {/* 하단 페이드 강도 슬라이더 */}
      {bottomFade > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-bold">페이드 강도</p>
            <span className="text-[11px] text-amber-400 font-mono">{bottomFade}%</span>
          </div>
          <input
            type="range"
            min={10} max={100} step={5}
            value={bottomFade}
            onChange={(e) => setBottomFade(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      )}


      {/* 빠른 템플릿 (4개로 축소) */}
      <div className="space-y-1">
        <p className="text-[11px] text-gray-400 font-bold">빠른 템플릿 <span className="text-gray-600 font-normal">6종 / 전체 140종</span></p>
        <div className="grid grid-cols-2 gap-1">
          {quickTemplates.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const style: SubtitleStyle = { template: t };
                setGlobalSubtitleStyle(style);
              }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border text-left transition-all ${
                tpl?.id === t.id
                  ? 'bg-amber-600/15 border-amber-500/40'
                  : 'bg-gray-900/30 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div
                className="w-8 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: t.backgroundColor || '#111' }}
              >
                <span style={{ fontFamily: t.fontFamily, fontSize: '7px', fontWeight: t.fontWeight, color: t.color, WebkitTextStroke: t.outlineWidth > 0 ? `${Math.min(t.outlineWidth, 1)}px ${t.outlineColor}` : undefined }}>자막</span>
              </div>
              <span className="text-[10px] text-gray-300 truncate">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 leading-tight">색상, 애니메이션, 전체 템플릿은 아래 상세 편집에서 확인하세요.</p>

      {/* 상세 편집 버튼 */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold border border-purple-400/50 shadow-md transition-colors"
      >
        상세 편집 열기
      </button>
    </div>
  );
};

const EditRoomGlobalPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PanelTab>('effects');
  const [fullModal, setFullModal] = useState<FullModal>(null);

  const TABS: { id: PanelTab; label: string; icon: string }[] = [
    { id: 'effects', label: '이미지 효과', icon: '🎬' },
    { id: 'subtitle', label: '자막', icon: '✏' },
    { id: 'bgm', label: 'BGM', icon: '🎵' },
    { id: 'meme-sfx', label: '밈/효과음', icon: '🎨' },
  ];

  return (
    <>
      <div className="h-full flex flex-col">
        {/* 탭 전환 */}
        <div className="flex border-b border-gray-700 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="text-sm">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {/* 패널 내용 — 미리보기 높이에 맞춰 스크롤 */}
        <div className="bg-gray-800/50 rounded-b-xl border border-gray-700 border-t-0 p-4 flex-1 overflow-y-auto min-h-0">
          {/* 이미지 효과 탭 */}
          {activeTab === 'effects' && (
            <EffectsQuickPanel onOpenDetail={() => setFullModal('effects')} />
          )}

          {/* 자막 탭 */}
          {activeTab === 'subtitle' && (
            <SubtitleQuickPanel onOpenDetail={() => setFullModal('subtitle')} />
          )}

          {/* BGM 탭 */}
          {activeTab === 'bgm' && <BgmOverlayPanel />}

          {/* 밈 & 효과음 탭 */}
          {activeTab === 'meme-sfx' && <MemeAndSfxPanel onOpenDetail={() => setFullModal('meme-sfx')} />}
        </div>
      </div>

      {/* 전체화면 모달 — createPortal로 document.body에 렌더링 (Framer Motion transform 간섭 방지) */}
      {fullModal === 'effects' && createPortal(
        <div className="fixed inset-0 z-50 bg-gray-900/95 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎬</span>
              <div>
                <h2 className="text-lg font-bold text-white">이미지 효과</h2>
                <p className="text-sm text-gray-500">팬&줌 12종 | 모션 17종 | 오버레이 40종 | 프리뷰 + 일괄/개별 적용</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFullModal(null)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base font-bold transition-colors"
            >
              닫기 X
            </button>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Suspense fallback={<LoadingFallback />}>
              <EffectPresets />
            </Suspense>
          </div>
        </div>,
        document.body,
      )}

      {/* 전체화면 모달 — 밈 & 효과음 검색 */}
      {fullModal === 'meme-sfx' && createPortal(
        <MemeAndSfxSearchModal onClose={() => setFullModal(null)} />,
        document.body,
      )}

      {/* 전체화면 모달 — 자막 상세 편집 */}
      {fullModal === 'subtitle' && createPortal(
        <div className="fixed inset-0 z-50 bg-gray-900/95 flex flex-col">
          <div className="flex-shrink-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎨</span>
              <div>
                <h2 className="text-lg font-bold text-white">자막 상세 편집</h2>
                <p className="text-sm text-gray-500">140개 템플릿 | 145개 폰트 | 28개 애니메이션 | 색상/그림자/네온 | 라이브 프리뷰</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFullModal(null)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-base font-bold transition-colors"
            >
              닫기 X
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-6">
              <Suspense fallback={<LoadingFallback />}>
                <SubtitleStyleEditor />
              </Suspense>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default EditRoomGlobalPanel;
