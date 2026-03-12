import { create } from 'zustand';
import {
  TimelineSegment,
  SubtitleEntry,
  TimelineSplitMode,
  EffectPresetId,
  SubtitleStyle,
} from '../types';
import { logger } from '../services/LoggerService';

type EditorTab = 'effects' | 'subtitle';

interface EditorStore {
  // State — 타임라인
  timeline: TimelineSegment[];
  selectedSegmentId: string | null;
  splitMode: TimelineSplitMode;

  // State — 자막
  subtitles: SubtitleEntry[];
  subtitleStyle: SubtitleStyle | null;

  // State — 이펙트 프리셋 (장면별)
  effectPresets: Record<string, EffectPresetId>;

  // State — 재생 정보
  totalDuration: number;

  // State — UI
  zoom: number;  // 50~200 (%)
  activeEditorTab: EditorTab;

  // Actions — 타임라인
  setTimeline: (segments: TimelineSegment[] | ((prev: TimelineSegment[]) => TimelineSegment[])) => void;
  updateSegment: (id: string, partial: Partial<TimelineSegment>) => void;
  setSelectedSegmentId: (id: string | null) => void;
  setSplitMode: (mode: TimelineSplitMode) => void;

  // Actions — 자막
  setSubtitles: (entries: SubtitleEntry[] | ((prev: SubtitleEntry[]) => SubtitleEntry[])) => void;
  updateSubtitle: (id: string, partial: Partial<SubtitleEntry>) => void;
  setSubtitleStyle: (style: SubtitleStyle | null) => void;

  // Actions — 이펙트
  applyEffectPreset: (sceneId: string, presetId: EffectPresetId) => void;

  // Actions — 재생 정보
  setTotalDuration: (duration: number) => void;

  // Actions — UI
  setZoom: (zoom: number) => void;
  setActiveEditorTab: (tab: EditorTab) => void;

  reset: () => void;
}

const INITIAL_STATE = {
  timeline: [] as TimelineSegment[],
  selectedSegmentId: null as string | null,
  splitMode: 'equal' as TimelineSplitMode,
  subtitles: [] as SubtitleEntry[],
  subtitleStyle: null as SubtitleStyle | null,
  effectPresets: {} as Record<string, EffectPresetId>,
  totalDuration: 0,
  zoom: 100,
  activeEditorTab: 'effects' as EditorTab,
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...INITIAL_STATE,

  // --- 타임라인 ---
  setTimeline: (segments) => set((state) => ({
    timeline: typeof segments === 'function' ? segments(state.timeline) : segments,
  })),

  updateSegment: (id, partial) => set((state) => ({
    timeline: state.timeline.map((seg) => seg.id === id ? { ...seg, ...partial } : seg),
  })),

  setSelectedSegmentId: (id) => set({ selectedSegmentId: id }),
  setSplitMode: (mode) => set({ splitMode: mode }),

  // --- 자막 ---
  setSubtitles: (entries) => set((state) => ({
    subtitles: typeof entries === 'function' ? entries(state.subtitles) : entries,
  })),

  updateSubtitle: (id, partial) => set((state) => ({
    subtitles: state.subtitles.map((sub) => sub.id === id ? { ...sub, ...partial } : sub),
  })),

  setSubtitleStyle: (style) => set({ subtitleStyle: style }),

  // --- 이펙트 ---
  applyEffectPreset: (sceneId, presetId) => set((state) => ({
    effectPresets: { ...state.effectPresets, [sceneId]: presetId },
  })),

  // --- 재생 정보 ---
  setTotalDuration: (duration) => set({ totalDuration: duration }),

  // --- UI ---
  setZoom: (zoom) => set({ zoom: Math.min(200, Math.max(50, zoom)) }),
  setActiveEditorTab: (tab) => { logger.trackTabVisit('editor', tab); set({ activeEditorTab: tab }); },

  reset: () => set({ ...INITIAL_STATE }),
}));
