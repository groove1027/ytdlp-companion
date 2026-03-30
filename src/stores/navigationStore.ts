import { create } from 'zustand';
import { AppTab } from '../types';
import { useProjectStore, autoRestoreOrCreateProject } from './projectStore';
import { logger } from '../services/LoggerService';

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
    // 사용자 액션 추적
    logger.trackAction('탭 전환', tab);
    logger.trackTabVisit(tab);

    // 프로젝트 탭 클릭 시 항상 대시보드 표시 (구버전 ConfigForm 방지)
    if (tab === 'project') {
      saveState({ activeTab: tab, showProjectDashboard: true });
      set({ activeTab: tab, showProjectDashboard: true });
    } else {
      // [UX] 프로젝트 미생성 시 기존 프로젝트 복원 시도 (비동기) — 빈 프로젝트 무한 생성 방지
      const { config } = useProjectStore.getState();
      if (!config) {
        // 탭 전환은 즉시 반영, 프로젝트 복원은 백그라운드
        saveState({ activeTab: tab, showProjectDashboard: false });
        set({ activeTab: tab, showProjectDashboard: false });
        autoRestoreOrCreateProject().catch(() => { /* swallowed */ });
      } else {
        saveState({ activeTab: tab });
        set({ activeTab: tab });
      }
      // [v4.5] 탭 전환 시 lastActiveTab 추적 + 파이프라인 단계 마킹
      useProjectStore.getState().setLastActiveTab(tab);
      const PIPELINE_MAP: Record<string, string> = {
        'channel-analysis': 'channelAnalysis',
        'script-writer': 'scriptWriting',
        'sound-studio': 'soundStudio',
        'image-video': 'imageVideo',
        'edit-room': 'editRoom',
        'upload': 'upload',
      };
      const step = PIPELINE_MAP[tab];
      if (step) {
        useProjectStore.getState().markPipelineStep(step as any);
      }
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
