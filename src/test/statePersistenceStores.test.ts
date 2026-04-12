import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelGuideline } from '../types';

const mocks = vi.hoisted(() => ({
  clearTransientStorageCaches: vi.fn(async () => ({
    clearedLocalKeys: [],
    removedEmptyProjects: 0,
    removedAutosaveSlot: false,
    estimate: { usedMB: 0, totalMB: 0, percent: 0 },
  })),
  deleteSavedBenchmark: vi.fn(async () => undefined),
  deleteSavedMusic: vi.fn(async () => undefined),
  deleteVideoAnalysisSlot: vi.fn(async () => undefined),
  getAllSavedBenchmarks: vi.fn(async () => []),
  getAllSavedMusic: vi.fn(async () => []),
  getAllVideoAnalysisSlots: vi.fn(async () => []),
  saveBenchmarkData: vi.fn(async () => undefined),
  saveMusicGroup: vi.fn(async () => undefined),
  saveVideoAnalysisSlot: vi.fn(async () => undefined),
  showToast: vi.fn(),
  trackSwallowedError: vi.fn(),
}));

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

vi.mock('../services/LoggerService', () => ({
  logger: {
    trackSwallowedError: mocks.trackSwallowedError,
    trackTabVisit: vi.fn(),
  },
}));

vi.mock('../services/youtubeAnalysisService', () => ({
  getQuotaUsage: () => ({ used: 0, limit: 10000, date: '2026-04-12' }),
}));

vi.mock('../stores/uiStore', () => ({
  showToast: mocks.showToast,
}));

vi.mock('../services/storageService', () => ({
  clearTransientStorageCaches: mocks.clearTransientStorageCaches,
  deleteSavedBenchmark: mocks.deleteSavedBenchmark,
  deleteSavedMusic: mocks.deleteSavedMusic,
  deleteVideoAnalysisSlot: mocks.deleteVideoAnalysisSlot,
  getAllSavedBenchmarks: mocks.getAllSavedBenchmarks,
  getAllSavedMusic: mocks.getAllSavedMusic,
  getAllVideoAnalysisSlots: mocks.getAllVideoAnalysisSlots,
  safeLocalStorageGetItem: (key: string) => globalThis.localStorage.getItem(key),
  safeLocalStorageRemoveItem: (key: string) => {
    globalThis.localStorage.removeItem(key);
    return true;
  },
  safeLocalStorageSetItem: (key: string, value: string) => {
    globalThis.localStorage.setItem(key, value);
    return true;
  },
  saveBenchmarkData: mocks.saveBenchmarkData,
  saveMusicGroup: mocks.saveMusicGroup,
  saveVideoAnalysisSlot: mocks.saveVideoAnalysisSlot,
}));

const makeGuideline = (channelName: string): ChannelGuideline => ({
  channelName,
  tone: 'tone',
  structure: 'structure',
  topics: ['topic'],
  keywords: ['keyword'],
  targetAudience: 'audience',
  avgLength: 1200,
  hookPattern: 'hook',
  closingPattern: 'closing',
  fullGuidelineText: `${channelName} guideline`,
});

describe('state persistence regressions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it('soundStudioStore reset keeps the latest favorite voices from localStorage', async () => {
    localStorage.setItem('SOUND_FAVORITE_VOICES', JSON.stringify(['voice-old']));

    const { useSoundStudioStore } = await import('../stores/soundStudioStore');

    useSoundStudioStore.getState().toggleFavoriteVoice('voice-new');
    useSoundStudioStore.getState().reset();

    expect(useSoundStudioStore.getState().favoriteVoices).toEqual(['voice-old', 'voice-new']);
  });

  it('channelAnalysisStore reset preserves loaded benchmarks and refreshes presets from storage', async () => {
    localStorage.setItem('CHANNEL_PRESETS', JSON.stringify([makeGuideline('preset-a')]));

    const { useChannelAnalysisStore } = await import('../stores/channelAnalysisStore');

    useChannelAnalysisStore.setState({
      savedBenchmarks: [{
        id: 'bench-1',
        channelName: 'saved-channel',
        scripts: [],
        guideline: makeGuideline('saved-channel'),
        savedAt: Date.now(),
      }],
    });

    localStorage.setItem('CHANNEL_PRESETS', JSON.stringify([makeGuideline('preset-b')]));
    useChannelAnalysisStore.getState().reset();

    expect(useChannelAnalysisStore.getState().savedBenchmarks).toHaveLength(1);
    expect(useChannelAnalysisStore.getState().savedBenchmarks[0]?.id).toBe('bench-1');
    expect(useChannelAnalysisStore.getState().savedPresets.map((preset) => preset.channelName)).toEqual(['preset-b']);
  });

  it('videoAnalysisStore reset preserves saved slots while clearing active analysis state', async () => {
    const { useVideoAnalysisStore } = await import('../stores/videoAnalysisStore');

    useVideoAnalysisStore.setState({
      savedSlots: [{
        id: 'slot-1',
        name: 'saved slot',
        youtubeUrl: 'https://youtu.be/testvideo01',
        youtubeUrls: ['https://youtu.be/testvideo01'],
        inputMode: 'youtube',
        selectedPreset: 'snack',
        rawResult: 'raw',
        versions: [],
        resultCache: {},
        savedAt: Date.now(),
      }],
      activeSlotId: 'slot-1',
      versions: [{
        id: 1,
        title: 'version',
        concept: 'concept',
        scenes: [],
      }],
    });

    useVideoAnalysisStore.getState().reset();

    expect(useVideoAnalysisStore.getState().savedSlots).toHaveLength(1);
    expect(useVideoAnalysisStore.getState().savedSlots[0]?.id).toBe('slot-1');
    expect(useVideoAnalysisStore.getState().activeSlotId).toBeNull();
    expect(useVideoAnalysisStore.getState().versions).toHaveLength(0);
  });
});
