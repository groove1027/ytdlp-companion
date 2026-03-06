import { create } from 'zustand';
import { TopicRecommendation } from '../types';

interface InstinctStore {
  selectedPartIndex: number;
  searchQuery: string;
  selectedMechanismIds: string[];

  // 소재 추천
  recommendedTopics: TopicRecommendation[];
  selectedTopicId: string | null;
  isRecommending: boolean;
  recommendProgress: { step: string; percent: number };

  setSelectedPartIndex: (index: number) => void;
  setSearchQuery: (query: string) => void;
  toggleMechanism: (id: string) => void;
  setMechanismIds: (ids: string[]) => void;
  clearSelection: () => void;

  // 소재 추천 액션
  setRecommendedTopics: (topics: TopicRecommendation[]) => void;
  selectTopic: (id: string | null) => void;
  clearTopics: () => void;
  setIsRecommending: (v: boolean) => void;
  setRecommendProgress: (progress: { step: string; percent: number }) => void;
}

const MAX_SELECTED = 5;

export const useInstinctStore = create<InstinctStore>((set) => ({
  selectedPartIndex: 0,
  searchQuery: '',
  selectedMechanismIds: [],

  // 소재 추천 초기값
  recommendedTopics: [],
  selectedTopicId: null,
  isRecommending: false,
  recommendProgress: { step: '', percent: 0 },

  setSelectedPartIndex: (index) => set({ selectedPartIndex: index }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleMechanism: (id) => set((state) => {
    const exists = state.selectedMechanismIds.includes(id);
    if (exists) {
      return { selectedMechanismIds: state.selectedMechanismIds.filter(x => x !== id) };
    }
    if (state.selectedMechanismIds.length >= MAX_SELECTED) return state;
    return { selectedMechanismIds: [...state.selectedMechanismIds, id] };
  }),

  setMechanismIds: (ids) => set({ selectedMechanismIds: ids.slice(0, MAX_SELECTED) }),

  clearSelection: () => set({ selectedMechanismIds: [] }),

  // 소재 추천 액션
  setRecommendedTopics: (topics) => set({ recommendedTopics: topics }),
  selectTopic: (id) => set({ selectedTopicId: id }),
  clearTopics: () => set({ recommendedTopics: [], selectedTopicId: null }),
  setIsRecommending: (v) => set({ isRecommending: v }),
  setRecommendProgress: (progress) => set({ recommendProgress: progress }),
}));
