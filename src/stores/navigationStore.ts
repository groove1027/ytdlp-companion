import { create } from 'zustand';
import { AppTab } from '../types';

const NAV_STORAGE_KEY = 'navigation-state';

/** localStorage에서 저장된 네비게이션 상태 복원 */
const loadSavedState = (): { activeTab: AppTab; showProjectDashboard: boolean } => {
  try {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        activeTab: parsed.activeTab || 'project',
        showProjectDashboard: parsed.showProjectDashboard ?? true,
      };
    }
  } catch (e) {
    console.warn('[navigationStore] Failed to load saved state:', e);
  }
  return { activeTab: 'project' as AppTab, showProjectDashboard: true };
};

/** 네비게이션 상태를 localStorage에 저장 */
const saveState = (state: Partial<{ activeTab: string; showProjectDashboard: boolean }>) => {
  try {
    const current = JSON.parse(localStorage.getItem(NAV_STORAGE_KEY) || '{}');
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ ...current, ...state }));
  } catch (e) {
    console.warn('[navigationStore] Failed to save state:', e);
  }
};

interface NavigationStore {
  // State
  activeTab: AppTab;
  /** true이면 프로젝트 탭에서 대시보드 표시, false이면 ConfigForm/Storyboard 표시 */
  showProjectDashboard: boolean;

  // Actions
  setActiveTab: (tab: AppTab) => void;
  /** 대시보드로 돌아가기 (프로젝트 닫기) */
  goToDashboard: () => void;
  /** 대시보드 숨기고 프로젝트 편집 화면으로 */
  leaveDashboard: () => void;
}

const initialState = loadSavedState();

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeTab: initialState.activeTab,
  showProjectDashboard: initialState.showProjectDashboard,

  setActiveTab: (tab) => {
    // 프로젝트 탭 클릭 시 항상 대시보드 표시 (구버전 ConfigForm 방지)
    if (tab === 'project') {
      saveState({ activeTab: tab, showProjectDashboard: true });
      set({ activeTab: tab, showProjectDashboard: true });
    } else {
      saveState({ activeTab: tab });
      set({ activeTab: tab });
    }
  },

  goToDashboard: () => {
    saveState({ activeTab: 'project', showProjectDashboard: true });
    set({
      activeTab: 'project',
      showProjectDashboard: true,
    });
  },

  leaveDashboard: () => {
    saveState({ showProjectDashboard: false });
    set({
      showProjectDashboard: false,
    });
  },
}));
