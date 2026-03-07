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
  /** 프로젝트 미생성으로 리다이렉트된 경우 원래 탭 이름 */
  redirectedFrom: string | null;

  // Actions
  setActiveTab: (tab: AppTab) => void;
  /** 대시보드로 돌아가기 (프로젝트 닫기) */
  goToDashboard: () => void;
  /** 프로젝트 미생성으로 대시보드로 복귀 + 안내 메시지용 원래 탭 기록 */
  goToDashboardWithRedirect: (fromTabLabel: string) => void;
  /** 대시보드 숨기고 프로젝트 편집 화면으로 */
  leaveDashboard: () => void;
  /** 리다이렉트 안내 배너 닫기 */
  clearRedirect: () => void;
}

const initialState = loadSavedState();

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeTab: initialState.activeTab,
  showProjectDashboard: initialState.showProjectDashboard,
  redirectedFrom: null,

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
      redirectedFrom: null,
    });
  },

  goToDashboardWithRedirect: (fromTabLabel) => {
    saveState({ activeTab: 'project', showProjectDashboard: true });
    set({
      activeTab: 'project',
      showProjectDashboard: true,
      redirectedFrom: fromTabLabel,
    });
  },

  leaveDashboard: () => {
    saveState({ showProjectDashboard: false });
    set({
      showProjectDashboard: false,
      redirectedFrom: null,
    });
  },

  clearRedirect: () => set({ redirectedFrom: null }),
}));
