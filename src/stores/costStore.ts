import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CostStats } from '../types';

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

interface CostStore {
  costStats: CostStats;
  exchangeRate: number;
  exchangeDate: string;
  /** 마지막 비용 업데이트 시각 (디버깅/일별 추적용) */
  lastUpdatedAt: number;

  addCost: (amount: number, type: 'image' | 'video' | 'analysis' | 'tts' | 'music') => void;
  setCostStats: (stats: CostStats) => void;
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
      })),
      setCostStats: (stats) => set({ costStats: stats, lastUpdatedAt: Date.now() }),
      setExchangeRate: (rate, date) => set({ exchangeRate: rate, exchangeDate: date }),
      resetCosts: () => set({ costStats: { ...INITIAL_COST_STATS }, lastUpdatedAt: Date.now() }),
    }),
    {
      name: COST_STORAGE_KEY,
      partialize: (state) => ({
        costStats: state.costStats,
        exchangeRate: state.exchangeRate,
        exchangeDate: state.exchangeDate,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    },
  ),
);
