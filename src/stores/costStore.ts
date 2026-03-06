import { create } from 'zustand';
import { CostStats } from '../types';

const INITIAL_COST_STATS: CostStats = {
  totalUsd: 0,
  imageCount: 0,
  videoCount: 0,
  analysisCount: 0,
  ttsCount: 0,
  musicCount: 0,
};

interface CostStore {
  costStats: CostStats;
  exchangeRate: number;
  exchangeDate: string;

  addCost: (amount: number, type: 'image' | 'video' | 'analysis' | 'tts' | 'music') => void;
  setCostStats: (stats: CostStats) => void;
  setExchangeRate: (rate: number, date: string) => void;
  resetCosts: () => void;
}

export const useCostStore = create<CostStore>((set) => ({
  costStats: { ...INITIAL_COST_STATS },
  exchangeRate: 1450,
  exchangeDate: '',

  addCost: (amount, type) => set((state) => ({
    costStats: {
      totalUsd: state.costStats.totalUsd + amount,
      imageCount: type === 'image' ? state.costStats.imageCount + 1 : state.costStats.imageCount,
      videoCount: type === 'video' ? state.costStats.videoCount + 1 : state.costStats.videoCount,
      analysisCount: type === 'analysis' ? state.costStats.analysisCount + 1 : state.costStats.analysisCount,
      ttsCount: type === 'tts' ? state.costStats.ttsCount + 1 : state.costStats.ttsCount,
      musicCount: type === 'music' ? state.costStats.musicCount + 1 : state.costStats.musicCount,
    },
  })),
  setCostStats: (stats) => set({ costStats: stats }),
  setExchangeRate: (rate, date) => set({ exchangeRate: rate, exchangeDate: date }),
  resetCosts: () => set({ costStats: { ...INITIAL_COST_STATS } }),
}));
