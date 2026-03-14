import { create } from 'zustand';
import type { ContentStyle, DesignStyle, DetailLevel } from '../data/slideStylePresets';
import { CONTENT_STYLES, DESIGN_STYLES } from '../data/slideStylePresets';

// ─── Types (PptMasterTab 내부 타입 미러) ───

interface SlideData {
  slideNumber: number;
  title: string;
  body: string;
  keyPoints: string[];
  visualHint: string;
  speakerNote?: string;
  imageUrl?: string;
  isGeneratingImage?: boolean;
}

type Step = 1 | 2 | 3 | 4;

// ─── Store ───

interface PptMasterState {
  // Wizard state
  step: Step;
  inputText: string;
  selectedContentStyleId: string;
  selectedDesignStyleId: string;
  detailLevel: DetailLevel;
  slideCount: number;

  // Generated slides
  slides: SlideData[];
  previewMode: boolean;

  // File
  uploadedFileName: string;

  // Actions
  setStep: (step: Step) => void;
  setInputText: (text: string) => void;
  setSelectedContentStyleId: (id: string) => void;
  setSelectedDesignStyleId: (id: string) => void;
  setDetailLevel: (level: DetailLevel) => void;
  setSlideCount: (count: number) => void;
  setSlides: (slides: SlideData[] | ((prev: SlideData[]) => SlideData[])) => void;
  setPreviewMode: (mode: boolean) => void;
  setUploadedFileName: (name: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  step: 1 as Step,
  inputText: '',
  selectedContentStyleId: CONTENT_STYLES[0].id,
  selectedDesignStyleId: DESIGN_STYLES[0].id,
  detailLevel: 'standard' as DetailLevel,
  slideCount: 8,
  slides: [] as SlideData[],
  previewMode: false,
  uploadedFileName: '',
};

export const usePptMasterStore = create<PptMasterState>((set) => ({
  ...INITIAL_STATE,

  setStep: (step) => set({ step }),
  setInputText: (inputText) => set({ inputText }),
  setSelectedContentStyleId: (id) => set({ selectedContentStyleId: id }),
  setSelectedDesignStyleId: (id) => set({ selectedDesignStyleId: id }),
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  setSlideCount: (slideCount) => set({ slideCount }),
  setSlides: (slidesOrUpdater) => set((state) => ({
    slides: typeof slidesOrUpdater === 'function'
      ? slidesOrUpdater(state.slides)
      : slidesOrUpdater,
  })),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setUploadedFileName: (uploadedFileName) => set({ uploadedFileName }),
  reset: () => set(INITIAL_STATE),
}));

// ─── Selectors (computed) ───

export function getSelectedContentStyle(id: string): ContentStyle {
  return CONTENT_STYLES.find(s => s.id === id) || CONTENT_STYLES[0];
}

export function getSelectedDesignStyle(id: string): DesignStyle {
  return DESIGN_STYLES.find(s => s.id === id) || DESIGN_STYLES[0];
}
