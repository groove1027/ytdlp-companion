import { create } from 'zustand';
import type { CharacterReference, DialogueTone } from '../types';
import { logger } from '../services/LoggerService';
import { cancelAutoApply } from '../services/googleReferenceSearchService';

interface ImageVideoStore {
  // 서브탭 상태
  activeSubTab: 'setup' | 'storyboard' | 'remake';
  // SetupPanel ↔ StoryboardPanel 공유 상태
  style: string;
  characters: CharacterReference[];
  // [NEW] 웹 검색 참조 모드 (Kie: google_search, Evolink: web_search)
  enableWebSearch: boolean;
  // [NEW] 멀티캐릭터 모드 (false=싱글 구버전 레이아웃, true=5슬롯 그리드)
  isMultiCharacter: boolean;
  // [FIX #174] 비주얼 스타일 커스텀 지시 (handshake 제거 등)
  customStyleNote: string;
  // [v4.7] 대사 품질 고도화
  dialogueTone: DialogueTone;
  referenceDialogue: string;
  dialogueMode: boolean;
  // [#177] 목표 컷 수 — 사용자가 원하는 장면 수 오버라이드
  targetSceneCount: number | null;
  // [#391] 글로벌 스타일 레퍼런스 이미지
  styleReferenceImages: string[];
  // [NEW] 구글 이미지 검색 레퍼런스 모드
  enableGoogleReference: boolean;

  setActiveSubTab: (tab: 'setup' | 'storyboard' | 'remake') => void;
  setStyle: (v: string) => void;
  setCustomStyleNote: (v: string) => void;
  setCharacters: (chars: CharacterReference[] | ((prev: CharacterReference[]) => CharacterReference[])) => void;
  addCharacter: (char: CharacterReference) => void;
  removeCharacter: (id: string) => void;
  updateCharacterLabel: (id: string, label: string) => void;
  updateCharacter: (id: string, updates: Partial<CharacterReference>) => void;
  setEnableWebSearch: (v: boolean) => void;
  setIsMultiCharacter: (v: boolean) => void;
  setDialogueTone: (v: DialogueTone) => void;
  setReferenceDialogue: (v: string) => void;
  setDialogueMode: (v: boolean) => void;
  setTargetSceneCount: (v: number | null) => void;
  setStyleReferenceImages: (v: string[]) => void;
  addStyleReferenceImage: (img: string) => void;
  removeStyleReferenceImage: (index: number) => void;
  setEnableGoogleReference: (v: boolean) => void;

  // 프로젝트 로드/리셋 시 일괄 복원
  restoreFromConfig: (data: { style?: string; characters?: CharacterReference[]; enableWebSearch?: boolean; isMultiCharacter?: boolean; dialogueTone?: DialogueTone; referenceDialogue?: string; dialogueMode?: boolean; customStyleNote?: string; targetSceneCount?: number | null; styleReferenceImages?: string[]; enableGoogleReference?: boolean }) => void;
  resetStore: () => void;
}

// [CRITICAL] imageVideoStore 변경 시 projectStore.config에 자동 싱크
// 순환 의존 방지: lazy import 캐시 패턴 사용
let _projectStoreRef: any = null;
import('./projectStore').then(m => { _projectStoreRef = m.useProjectStore; }).catch(() => {});
const getProjectStore = () => _projectStoreRef;

const applyProjectConfigSync = () => {
  const ps = getProjectStore();
  if (!ps) return;
  const { style, characters, enableWebSearch, isMultiCharacter, dialogueTone, referenceDialogue, dialogueMode, customStyleNote, targetSceneCount, styleReferenceImages, enableGoogleReference } = useImageVideoStore.getState();
  ps.getState().setConfig((prev: any) => {
    if (!prev) return prev;
    return { ...prev, selectedVisualStyle: style, characters, enableWebSearch, isMultiCharacter, dialogueTone, referenceDialogue, dialogueMode, customStyleNote, targetSceneCount, styleReferenceImages, enableGoogleReference };
  });
};

const syncToProjectConfig = (options?: { immediate?: boolean }) => {
  if (options?.immediate || typeof requestAnimationFrame !== 'function') {
    applyProjectConfigSync();
    return;
  }

  // requestAnimationFrame으로 현재 렌더 사이클 밖에서 실행 (Zustand 업데이트 충돌 방지)
  requestAnimationFrame(applyProjectConfigSync);
};

export const useImageVideoStore = create<ImageVideoStore>((set) => ({
  activeSubTab: 'setup',
  style: 'custom',
  characters: [],
  enableWebSearch: true,
  isMultiCharacter: false,
  customStyleNote: '',
  dialogueTone: 'none' as DialogueTone,
  referenceDialogue: '',
  dialogueMode: false,
  targetSceneCount: null,
  styleReferenceImages: [],
  enableGoogleReference: false,

  setActiveSubTab: (tab) => { logger.trackTabVisit('image-video', tab); set({ activeSubTab: tab }); },
  setStyle: (v) => { const prev = useImageVideoStore.getState().style; logger.trackSettingChange('iv.style', prev, v); set({ style: v }); syncToProjectConfig(); },
  setCustomStyleNote: (v) => { set({ customStyleNote: v }); syncToProjectConfig(); },
  setEnableWebSearch: (v) => { const prev = useImageVideoStore.getState().enableWebSearch; logger.trackSettingChange('iv.webSearch', prev, v); set({ enableWebSearch: v }); syncToProjectConfig(); },
  setIsMultiCharacter: (v) => { const prev = useImageVideoStore.getState().isMultiCharacter; logger.trackSettingChange('iv.multiChar', prev, v); set({ isMultiCharacter: v }); syncToProjectConfig(); },
  setDialogueTone: (v) => { const prev = useImageVideoStore.getState().dialogueTone; logger.trackSettingChange('iv.dialogueTone', prev, v); set({ dialogueTone: v }); syncToProjectConfig(); },
  setReferenceDialogue: (v) => { set({ referenceDialogue: v }); syncToProjectConfig(); },
  setDialogueMode: (v) => { const prev = useImageVideoStore.getState().dialogueMode; logger.trackSettingChange('iv.dialogueMode', prev, v); set({ dialogueMode: v }); syncToProjectConfig(); },
  setTargetSceneCount: (v) => { const prev = useImageVideoStore.getState().targetSceneCount; logger.trackSettingChange('iv.targetSceneCount', prev, v); set({ targetSceneCount: v }); syncToProjectConfig(); },
  setStyleReferenceImages: (v) => { set({ styleReferenceImages: v }); syncToProjectConfig({ immediate: true }); },
  addStyleReferenceImage: (img) => { set((s) => ({ styleReferenceImages: [...s.styleReferenceImages, img] })); syncToProjectConfig({ immediate: true }); },
  removeStyleReferenceImage: (index) => { set((s) => ({ styleReferenceImages: s.styleReferenceImages.filter((_, i) => i !== index) })); syncToProjectConfig({ immediate: true }); },
  setEnableGoogleReference: (v) => { const prev = useImageVideoStore.getState().enableGoogleReference; logger.trackSettingChange('iv.googleRef', prev, v); if (!v) cancelAutoApply(); set({ enableGoogleReference: v }); syncToProjectConfig(); },
  setCharacters: (chars) => {
    set((s) => ({ characters: typeof chars === 'function' ? chars(s.characters) : chars }));
    syncToProjectConfig();
  },
  addCharacter: (char) => { set((s) => ({ characters: [...s.characters, char] })); syncToProjectConfig(); },
  removeCharacter: (id) => { set((s) => ({ characters: s.characters.filter(c => c.id !== id) })); syncToProjectConfig(); },
  updateCharacterLabel: (id, label) => {
    set((s) => ({ characters: s.characters.map(c => c.id === id ? { ...c, label } : c) }));
    syncToProjectConfig();
  },
  updateCharacter: (id, updates) => {
    set((s) => ({ characters: s.characters.map(c => c.id === id ? { ...c, ...updates } : c) }));
    syncToProjectConfig();
  },

  // 프로젝트 로드 시 config에서 복원
  // [FIX #407] isAnalyzing은 런타임 전용 — 복원 시 항상 false로 리셋
  restoreFromConfig: (data) => set({
    style: data.style || 'custom',
    characters: (data.characters || []).map(c => ({ ...c, isAnalyzing: false })),
    enableWebSearch: data.enableWebSearch ?? true,
    isMultiCharacter: data.isMultiCharacter ?? false,
    customStyleNote: data.customStyleNote || '',
    dialogueTone: data.dialogueTone || 'none',
    referenceDialogue: data.referenceDialogue || '',
    dialogueMode: data.dialogueMode ?? false,
    targetSceneCount: data.targetSceneCount ?? null,
    styleReferenceImages: data.styleReferenceImages || [],
    enableGoogleReference: data.enableGoogleReference ?? false,
  }),

  // 새 프로젝트 시 초기화
  resetStore: () => set({
    activeSubTab: 'setup',
    style: 'custom',
    characters: [],
    enableWebSearch: true,
    isMultiCharacter: false,
    customStyleNote: '',
    dialogueTone: 'none' as DialogueTone,
    referenceDialogue: '',
    dialogueMode: false,
    targetSceneCount: null,
    styleReferenceImages: [],
    enableGoogleReference: false,
  }),
}));
