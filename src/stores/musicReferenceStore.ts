/**
 * musicReferenceStore.ts — 뮤직 레퍼런스 분석 Zustand 스토어 (#154)
 */

import { create } from 'zustand';
import type {
    YouTubeUrlParseResult,
    MusicReferenceVideo,
    PerVideoMusicDNA,
    ChannelMusicDNA,
    ChannelVisualDNA,
    MusicReferenceFusionConcept,
    MusicReferencePhase,
} from '../types';

interface MusicReferenceStore {
    // 입력
    inputUrl: string;
    parseResult: YouTubeUrlParseResult | null;
    sourceName: string;

    // 수집된 영상
    videos: MusicReferenceVideo[];

    // 분석 결과
    perVideoMusicDNA: PerVideoMusicDNA[];
    channelMusicDNA: ChannelMusicDNA | null;
    channelVisualDNA: ChannelVisualDNA | null;

    // 퓨전 컨셉
    fusionConcepts: MusicReferenceFusionConcept[];

    // 진행 상태
    phase: MusicReferencePhase;
    progress: { current: number; total: number; label: string };
    error: string | null;

    // 리포트 UI 토글
    expandedSection: 'music' | 'visual' | 'both' | 'none';

    // 액션
    setInputUrl: (url: string) => void;
    setParseResult: (result: YouTubeUrlParseResult | null) => void;
    setSourceName: (name: string) => void;
    setVideos: (videos: MusicReferenceVideo[]) => void;
    setPerVideoMusicDNA: (dna: PerVideoMusicDNA[]) => void;
    setChannelMusicDNA: (dna: ChannelMusicDNA | null) => void;
    setChannelVisualDNA: (dna: ChannelVisualDNA | null) => void;
    setFusionConcepts: (concepts: MusicReferenceFusionConcept[]) => void;
    updateFusionConcept: (id: string, patch: Partial<MusicReferenceFusionConcept>) => void;
    setPhase: (phase: MusicReferencePhase) => void;
    setProgress: (current: number, total: number, label: string) => void;
    setError: (error: string | null) => void;
    setExpandedSection: (section: 'music' | 'visual' | 'both' | 'none') => void;
    reset: () => void;
}

const initialState = {
    inputUrl: '',
    parseResult: null as YouTubeUrlParseResult | null,
    sourceName: '',
    videos: [] as MusicReferenceVideo[],
    perVideoMusicDNA: [] as PerVideoMusicDNA[],
    channelMusicDNA: null as ChannelMusicDNA | null,
    channelVisualDNA: null as ChannelVisualDNA | null,
    fusionConcepts: [] as MusicReferenceFusionConcept[],
    phase: 'idle' as MusicReferencePhase,
    progress: { current: 0, total: 0, label: '' },
    error: null as string | null,
    expandedSection: 'none' as 'music' | 'visual' | 'both' | 'none',
};

export const useMusicReferenceStore = create<MusicReferenceStore>((set) => ({
    ...initialState,

    setInputUrl: (url) => set({ inputUrl: url }),
    setParseResult: (result) => set({ parseResult: result }),
    setSourceName: (name) => set({ sourceName: name }),
    setVideos: (videos) => set({ videos }),
    setPerVideoMusicDNA: (dna) => set({ perVideoMusicDNA: dna }),
    setChannelMusicDNA: (dna) => set({ channelMusicDNA: dna }),
    setChannelVisualDNA: (dna) => set({ channelVisualDNA: dna }),
    setFusionConcepts: (concepts) => set({ fusionConcepts: concepts }),
    updateFusionConcept: (id, patch) => set((state) => ({
        fusionConcepts: state.fusionConcepts.map((c) =>
            c.id === id ? { ...c, ...patch } : c
        ),
    })),
    setPhase: (phase) => set({ phase }),
    setProgress: (current, total, label) => set({ progress: { current, total, label } }),
    setError: (error) => set({ error, phase: error ? 'error' : 'idle' }),
    setExpandedSection: (section) => set({ expandedSection: section }),
    reset: () => set({ ...initialState }),
}));
