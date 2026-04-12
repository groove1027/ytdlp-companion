import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CostMutationSource, CostStats } from '../types';

const INITIAL_COST_STATS: CostStats = {
  totalUsd: 0,
  imageCount: 0,
  videoCount: 0,
  analysisCount: 0,
  ttsCount: 0,
  musicCount: 0,
};

/** [FIX #776/#775/#826] localStorage 키 — 비용 데이터 영속화용 */
const COST_STORAGE_KEY = 'cost-stats-persistent';

const normalizeCostStats = (stats?: Partial<CostStats> | null): CostStats => ({
  totalUsd: stats?.totalUsd ?? 0,
  imageCount: stats?.imageCount ?? 0,
  videoCount: stats?.videoCount ?? 0,
  analysisCount: stats?.analysisCount ?? 0,
  ttsCount: stats?.ttsCount ?? 0,
  musicCount: stats?.musicCount ?? 0,
});

interface CostStore {
  costStats: CostStats;
  exchangeRate: number;
  exchangeDate: string;
  /** 마지막 비용 업데이트 시각 (디버깅/일별 추적용) */
  lastUpdatedAt: number;
  /** 마지막 실제 과금(addCost) 시각 */
  lastChargedAt: number;
  /** 마지막 복원 시각 */
  lastRestoredAt: number;
  /** 현재 표시중인 비용 상태가 어떤 경로로 갱신됐는지 */
  lastMutationSource: CostMutationSource;

  addCost: (amount: number, type: 'image' | 'video' | 'analysis' | 'tts' | 'music') => void;
  restoreCostStats: (stats?: Partial<CostStats> | null) => void;
  setExchangeRate: (rate: number, date: string) => void;
  resetCosts: () => void;
}

export const useCostStore = create<CostStore>()(
  persist(
    (set) => ({
      costStats: { ...INITIAL_COST_STATS },
      exchangeRate: 1450,
      exchangeDate: '',
      lastUpdatedAt: 0,
      lastChargedAt: 0,
      lastRestoredAt: 0,
      lastMutationSource: 'init',

      addCost: (amount, type) => set((state) => ({
        costStats: {
          totalUsd: state.costStats.totalUsd + amount,
          imageCount: type === 'image' ? state.costStats.imageCount + 1 : state.costStats.imageCount,
          videoCount: type === 'video' ? state.costStats.videoCount + 1 : state.costStats.videoCount,
          analysisCount: type === 'analysis' ? state.costStats.analysisCount + 1 : state.costStats.analysisCount,
          ttsCount: type === 'tts' ? state.costStats.ttsCount + 1 : state.costStats.ttsCount,
          musicCount: type === 'music' ? state.costStats.musicCount + 1 : state.costStats.musicCount,
        },
        lastUpdatedAt: Date.now(),
        lastChargedAt: Date.now(),
        lastMutationSource: 'charge',
      })),
      restoreCostStats: (stats) => {
        const nextCostStats = normalizeCostStats(stats);
        const now = Date.now();
        set({
          costStats: nextCostStats,
          lastUpdatedAt: now,
          lastRestoredAt: nextCostStats.totalUsd > 0 ? now : 0,
          lastMutationSource: nextCostStats.totalUsd > 0 ? 'restore' : 'init',
        });
      },
      setExchangeRate: (rate, date) => set({ exchangeRate: rate, exchangeDate: date }),
      resetCosts: () => set({
        costStats: { ...INITIAL_COST_STATS },
        lastUpdatedAt: Date.now(),
        lastMutationSource: 'reset',
      }),
    }),
    {
      name: COST_STORAGE_KEY,
      partialize: (state) => ({
        costStats: state.costStats,
        exchangeRate: state.exchangeRate,
        exchangeDate: state.exchangeDate,
        lastUpdatedAt: state.lastUpdatedAt,
        lastChargedAt: state.lastChargedAt,
        lastRestoredAt: state.lastRestoredAt,
        lastMutationSource: state.lastMutationSource,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.restoreCostStats(state.costStats);
      },
    },
  ),
);
