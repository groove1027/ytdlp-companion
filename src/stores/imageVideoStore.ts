import { create } from 'zustand';
import type { CharacterReference } from '../types';

interface ImageVideoStore {
  // 서브탭 상태
  activeSubTab: 'setup' | 'storyboard';
  // SetupPanel ↔ StoryboardPanel 공유 상태
  style: string;
  characters: CharacterReference[];
  // [NEW] 웹 검색 참조 모드 (Kie: google_search, Evolink: web_search)
  enableWebSearch: boolean;
  // [NEW] 멀티캐릭터 모드 (false=싱글 구버전 레이아웃, true=5슬롯 그리드)
  isMultiCharacter: boolean;

  setActiveSubTab: (tab: 'setup' | 'storyboard') => void;
  setStyle: (v: string) => void;
  setCharacters: (chars: CharacterReference[] | ((prev: CharacterReference[]) => CharacterReference[])) => void;
  addCharacter: (char: CharacterReference) => void;
  removeCharacter: (id: string) => void;
  updateCharacterLabel: (id: string, label: string) => void;
  updateCharacter: (id: string, updates: Partial<CharacterReference>) => void;
  setEnableWebSearch: (v: boolean) => void;
  setIsMultiCharacter: (v: boolean) => void;

  // 프로젝트 로드/리셋 시 일괄 복원
  restoreFromConfig: (data: { style?: string; characters?: CharacterReference[]; enableWebSearch?: boolean; isMultiCharacter?: boolean }) => void;
  resetStore: () => void;
}

// [CRITICAL] imageVideoStore 변경 시 projectStore.config에 자동 싱크
// 순환 의존 방지: lazy import 캐시 패턴 사용
let _projectStoreRef: any = null;
const getProjectStore = () => {
  if (!_projectStoreRef) {
    try { _projectStoreRef = require('./projectStore').useProjectStore; } catch { return null; }
  }
  return _projectStoreRef;
};

const syncToProjectConfig = () => {
  // requestAnimationFrame으로 현재 렌더 사이클 밖에서 실행 (Zustand 업데이트 충돌 방지)
  requestAnimationFrame(() => {
    const ps = getProjectStore();
    if (!ps) return;
    const { style, characters, enableWebSearch, isMultiCharacter } = useImageVideoStore.getState();
    ps.getState().setConfig((prev: any) => {
      if (!prev) return prev;
      return { ...prev, selectedVisualStyle: style, characters, enableWebSearch, isMultiCharacter };
    });
  });
};

export const useImageVideoStore = create<ImageVideoStore>((set) => ({
  activeSubTab: 'setup',
  style: 'custom',
  characters: [],
  enableWebSearch: true,
  isMultiCharacter: false,

  setActiveSubTab: (tab) => set({ activeSubTab: tab }),
  setStyle: (v) => { set({ style: v }); syncToProjectConfig(); },
  setEnableWebSearch: (v) => { set({ enableWebSearch: v }); syncToProjectConfig(); },
  setIsMultiCharacter: (v) => { set({ isMultiCharacter: v }); syncToProjectConfig(); },
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
  restoreFromConfig: (data) => set({
    style: data.style || 'custom',
    characters: data.characters || [],
    enableWebSearch: data.enableWebSearch ?? true,
    isMultiCharacter: data.isMultiCharacter ?? false,
  }),

  // 새 프로젝트 시 초기화
  resetStore: () => set({
    activeSubTab: 'setup',
    style: 'custom',
    characters: [],
    enableWebSearch: true,
    isMultiCharacter: false,
  }),
}));
