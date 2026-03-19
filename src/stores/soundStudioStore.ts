import { create } from 'zustand';
import {
  Speaker,
  ScriptLine,
  TTSEngine,
  MusicGenerationConfig,
  MusicLibraryItem,
  GeneratedMusic,
  UserUploadedAudio,
  SunoModel,
  LyricsResult,
  VocalSeparationResult,
  SfxItem,
} from '../types';
import type { MusicAnalysisResult } from '../services/musicService';
import { saveMusicGroup, getAllSavedMusic, deleteSavedMusic } from '../services/storageService';
import { logger } from '../services/LoggerService';

// --- 전역 오디오 제어 (Zustand 상태 외부 — 리렌더 방지) ---
const _activeAudios = new Set<HTMLAudioElement>();

/** 재생 중인 Audio 엘리먼트를 등록 */
export function registerAudio(audio: HTMLAudioElement): void {
  _activeAudios.add(audio);
}

/** Audio 엘리먼트 등록 해제 */
export function unregisterAudio(audio: HTMLAudioElement): void {
  _activeAudios.delete(audio);
}

/** 모든 등록된 Audio 재생을 즉시 중단 + speechSynthesis 취소 */
export function stopAllAudio(): void {
  _activeAudios.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {
      logger.trackSwallowedError('soundStudioStore:stopAllAudio', e);
      // 이미 해제된 오디오 무시
    }
  });
  _activeAudios.clear();
  window.speechSynthesis?.cancel();
}

// --- 즐겨찾기 localStorage 영속화 ---
const FAVORITE_MODELS_KEY = 'SOUND_FAVORITE_MODELS';
const FAVORITE_VOICES_KEY = 'SOUND_FAVORITE_VOICES';

const loadFavoriteModels = (): SunoModel[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITE_MODELS_KEY) || '[]'); }
  catch (e) { logger.trackSwallowedError('soundStudioStore:loadFavoriteModels', e); return []; }
};

const loadFavoriteVoices = (): string[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITE_VOICES_KEY) || '[]'); }
  catch (e) { logger.trackSwallowedError('soundStudioStore:loadFavoriteVoices', e); return []; }
};

const isUploadedLine = (line: Pick<ScriptLine, 'audioSource' | 'uploadedAudioId'> | undefined): boolean =>
  !!line && (line.audioSource === 'uploaded' || !!line.uploadedAudioId);

function shouldInvalidateUploadedSetLines(prevLines: ScriptLine[], nextLines: ScriptLine[]): boolean {
  if (!prevLines.some(isUploadedLine)) return false;
  if (prevLines.length !== nextLines.length) return true;

  return prevLines.some((prevLine, index) => {
    if (!isUploadedLine(prevLine)) return false;
    const nextLine = nextLines[index];
    if (!nextLine || !isUploadedLine(nextLine)) return true;

    return nextLine.text !== prevLine.text
      || (nextLine.startTime ?? null) !== (prevLine.startTime ?? null)
      || (nextLine.endTime ?? null) !== (prevLine.endTime ?? null);
  });
}

type SoundSubTab = 'narration' | 'waveform';
type MusicStudioTab = 'generate' | 'lyrics' | 'tools';

interface SoundStudioStore {
  // State
  speakers: Speaker[];
  lines: ScriptLine[];
  ttsEngine: TTSEngine;
  isGeneratingTTS: boolean;
  ttsProgress: { current: number; total: number } | null;
  mergedAudioUrl: string | null;
  musicConfig: MusicGenerationConfig | null;
  musicLibrary: MusicLibraryItem[];
  isGeneratingMusic: boolean;
  activeSubTab: SoundSubTab;

  // 뮤직 스튜디오 탭
  musicStudioTab: MusicStudioTab;

  // 음악 생성 탭 상태 (탭 이동 시 보존)
  genTabState: {
    sunoModel: SunoModel;
    scriptSource: 'from-script' | 'manual';
    manualScript: string;
    title: string;
    prompt: string;
    musicType: 'vocal' | 'instrumental';
    bpm: number;
    duration: number;
    batchCount: number;
    selectedGenres: string[];
    selectedMoods: string[];
    selectedEnergy: string;
    selectedInstruments: string[];
    selectedVocalTags: string[];
    selectedProduction: string[];
    customTags: string;
    negativeTags: string;
    styleWeight: number;
    weirdnessConstraint: number;
    audioWeight: number;
    analysis: MusicAnalysisResult | null;
    isAnalyzing: boolean;
  };

  // 즐겨찾기
  favoriteModels: SunoModel[];
  favoriteVoices: string[];

  // 가사 에디터 상태
  lyricsPrompt: string;
  generatedLyrics: LyricsResult[];
  isGeneratingLyrics: boolean;

  // 곡 연장 상태
  extendTarget: GeneratedMusic | null;
  isExtending: boolean;

  // 보컬 분리 상태
  vocalSepTarget: GeneratedMusic | null;
  vocalSepResult: VocalSeparationResult | null;
  isVocalSeparating: boolean;

  // 업로드 오디오
  uploadedAudios: UserUploadedAudio[];
  isTranscribing: boolean;
  transcriptionProgress: string | null;

  // Actions — 화자 관리
  addSpeaker: (speaker: Speaker) => void;
  removeSpeaker: (id: string) => void;
  updateSpeaker: (id: string, partial: Partial<Speaker>) => void;
  assignVoice: (lineId: string, speakerId: string) => void;

  // Actions — 라인 관리
  setLines: (lines: ScriptLine[] | ((prev: ScriptLine[]) => ScriptLine[])) => void;
  updateLine: (id: string, partial: Partial<ScriptLine>) => void;
  removeLine: (id: string) => void;
  addLineAfter: (afterId: string, text: string) => void;
  mergeLineWithNext: (id: string) => void;
  changeSpeakerWithPropagation: (lineId: string, speakerId: string) => ScriptLine[];

  // Actions — TTS
  setTtsEngine: (engine: TTSEngine) => void;
  setIsGeneratingTTS: (v: boolean) => void;
  setTtsProgress: (progress: { current: number; total: number } | null) => void;
  setMergedAudio: (url: string | null) => void;

  // Actions — 음악 생성
  setMusicConfig: (config: MusicGenerationConfig | null) => void;
  addToLibrary: (item: MusicLibraryItem) => void;
  removeFromLibrary: (groupTitle: string) => void;
  toggleFavorite: (groupTitle: string, trackId: string) => void;
  setIsGeneratingMusic: (v: boolean) => void;
  loadMusicLibrary: () => Promise<void>;

  // Actions — 뮤직 스튜디오 탭
  setMusicStudioTab: (tab: MusicStudioTab) => void;

  // Actions — 가사 에디터
  setLyricsPrompt: (prompt: string) => void;
  setGeneratedLyrics: (lyrics: LyricsResult[]) => void;
  setIsGeneratingLyrics: (v: boolean) => void;

  // Actions — 곡 연장
  setExtendTarget: (track: GeneratedMusic | null) => void;
  setIsExtending: (v: boolean) => void;

  // Actions — 보컬 분리
  setVocalSepTarget: (track: GeneratedMusic | null) => void;
  setVocalSepResult: (result: VocalSeparationResult | null) => void;
  setIsVocalSeparating: (v: boolean) => void;

  // Actions — 즐겨찾기
  toggleFavoriteModel: (modelId: SunoModel) => void;
  toggleFavoriteVoice: (voiceId: string) => void;

  // Actions — 업로드 오디오
  addUploadedAudio: (audio: UserUploadedAudio) => void;
  removeUploadedAudio: (id: string) => void;
  setIsTranscribing: (v: boolean) => void;
  setTranscriptionProgress: (msg: string | null) => void;

  // Actions — 음악 생성 탭 상태
  updateGenTabState: (partial: Partial<SoundStudioStore['genTabState']>) => void;

  // Actions — 파형 편집 (WaveformEditor ↔ 탭 전환 연동)
  pendingEditedAudioUrl: string | null;
  setPendingEditedAudioUrl: (url: string | null) => void;
  commitPendingEdits: () => void;

  // --- SFX (효과음) ---
  sfxItems: SfxItem[];
  addSfxItem: (item: SfxItem) => void;
  updateSfxItem: (id: string, partial: Partial<SfxItem>) => void;
  removeSfxItem: (id: string) => void;

  // Actions — UI
  setActiveSubTab: (tab: SoundSubTab) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  speakers: [] as Speaker[],
  lines: [] as ScriptLine[],
  ttsEngine: 'typecast' as TTSEngine,
  isGeneratingTTS: false,
  ttsProgress: null as { current: number; total: number } | null,
  mergedAudioUrl: null as string | null,
  musicConfig: null as MusicGenerationConfig | null,
  musicLibrary: [] as MusicLibraryItem[],
  isGeneratingMusic: false,
  activeSubTab: 'narration' as SoundSubTab,
  musicStudioTab: 'generate' as MusicStudioTab,
  favoriteModels: loadFavoriteModels(),
  favoriteVoices: loadFavoriteVoices(),
  // 가사 에디터
  lyricsPrompt: '',
  generatedLyrics: [] as LyricsResult[],
  isGeneratingLyrics: false,
  // 곡 연장
  extendTarget: null as GeneratedMusic | null,
  isExtending: false,
  // 보컬 분리
  vocalSepTarget: null as GeneratedMusic | null,
  vocalSepResult: null as VocalSeparationResult | null,
  isVocalSeparating: false,
  // 업로드 오디오
  uploadedAudios: [] as UserUploadedAudio[],
  isTranscribing: false,
  transcriptionProgress: null as string | null,
  pendingEditedAudioUrl: null as string | null,
  // SFX (효과음)
  sfxItems: [] as SfxItem[],
  // 음악 생성 탭 상태 (탭 이동 시 보존)
  genTabState: {
    sunoModel: 'V5' as SunoModel,
    scriptSource: 'from-script' as 'from-script' | 'manual',
    manualScript: '',
    title: '',
    prompt: '',
    musicType: 'instrumental' as 'vocal' | 'instrumental',
    bpm: 120,
    duration: 30,
    batchCount: 1,
    selectedGenres: [] as string[],
    selectedMoods: [] as string[],
    selectedEnergy: '',
    selectedInstruments: [] as string[],
    selectedVocalTags: [] as string[],
    selectedProduction: [] as string[],
    customTags: '',
    negativeTags: '',
    styleWeight: 0.5,
    weirdnessConstraint: 0.5,
    audioWeight: 0.5,
    analysis: null as MusicAnalysisResult | null,
    isAnalyzing: false,
  },
};

export const useSoundStudioStore = create<SoundStudioStore>((set) => ({
  ...INITIAL_STATE,

  // --- 화자 ---
  addSpeaker: (speaker) => set((state) => ({
    speakers: [...state.speakers, speaker],
  })),

  removeSpeaker: (id) => set((state) => ({
    speakers: state.speakers.filter((s) => s.id !== id),
    lines: state.lines.map((l) => l.speakerId === id ? { ...l, speakerId: '' } : l),
  })),

  updateSpeaker: (id, partial) => set((state) => ({
    speakers: state.speakers.map((s) => s.id === id ? { ...s, ...partial } : s),
  })),

  assignVoice: (lineId, speakerId) => set((state) => ({
    lines: state.lines.map((l) => l.id === lineId ? { ...l, speakerId } : l),
  })),

  // --- 라인 ---
  setLines: (lines) => set((state) => {
    const nextLines = typeof lines === 'function' ? lines(state.lines) : lines;
    const shouldInvalidateUploaded = shouldInvalidateUploadedSetLines(state.lines, nextLines);
    return {
      lines: nextLines,
      ...(shouldInvalidateUploaded ? { mergedAudioUrl: null, uploadedAudios: [] } : {}),
    };
  }),

  updateLine: (id, partial) => set((state) => {
    let shouldInvalidateUploaded = false;
    const nextLines = state.lines.map((line) => {
      if (line.id !== id) return line;

      const lineWasUploaded = isUploadedLine(line);
      const clearsAudio = Object.prototype.hasOwnProperty.call(partial, 'audioUrl') && partial.audioUrl === undefined;
      const changesUploadedContent =
        (partial.text !== undefined && partial.text !== line.text)
        || partial.voiceId !== undefined
        || partial.voiceName !== undefined
        || partial.voiceImage !== undefined
        || partial.emotion !== undefined
        || partial.lineSpeed !== undefined
        || partial.audioSource === 'tts';

      shouldInvalidateUploaded = lineWasUploaded && (clearsAudio || changesUploadedContent);

      if (!shouldInvalidateUploaded) return { ...line, ...partial };

      return {
        ...line,
        ...partial,
        audioSource: partial.audioSource,
        uploadedAudioId: partial.uploadedAudioId,
        startTime: partial.startTime,
        endTime: partial.endTime,
        duration: partial.duration,
      };
    });

    return {
      lines: nextLines,
      ...(shouldInvalidateUploaded ? { mergedAudioUrl: null, uploadedAudios: [] } : {}),
    };
  }),

  removeLine: (id) => set((state) => {
    const removedLine = state.lines.find((line) => line.id === id);
    const shouldInvalidateUploaded = isUploadedLine(removedLine);
    return {
      lines: state.lines.filter((l) => l.id !== id).map((l, i) => ({ ...l, index: i })),
      ...(shouldInvalidateUploaded ? { mergedAudioUrl: null, uploadedAudios: [] } : {}),
    };
  }),

  addLineAfter: (afterId, text) => set((state) => {
    const idx = state.lines.findIndex((l) => l.id === afterId);
    const anchor = idx >= 0 ? state.lines[idx] : state.lines[state.lines.length - 1];
    const insertAt = idx >= 0 ? idx + 1 : state.lines.length;
    const newLine: ScriptLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      speakerId: anchor?.speakerId || '',
      text,
      index: insertAt,
      sceneId: anchor?.sceneId,
    };
    const next = [...state.lines];
    next.splice(insertAt, 0, newLine);
    return {
      lines: next.map((l, i) => ({ ...l, index: i })),
      ...(isUploadedLine(anchor) ? { mergedAudioUrl: null, uploadedAudios: [] } : {}),
    };
  }),

  mergeLineWithNext: (id) => set((state) => {
    const idx = state.lines.findIndex((l) => l.id === id);
    if (idx < 0 || idx >= state.lines.length - 1) return state;
    const current = state.lines[idx];
    const nextLine = state.lines[idx + 1];
    const shouldInvalidateUploaded = isUploadedLine(current) || isUploadedLine(nextLine);
    const merged = shouldInvalidateUploaded
      ? {
          ...current,
          text: current.text + ' ' + nextLine.text,
          audioUrl: undefined,
          duration: undefined,
          startTime: undefined,
          endTime: undefined,
          audioSource: undefined,
          uploadedAudioId: undefined,
          ttsStatus: 'idle' as const,
        }
      : { ...current, text: current.text + ' ' + nextLine.text };
    const next = [...state.lines];
    next.splice(idx, 2, merged);
    return {
      lines: next.map((l, i) => ({ ...l, index: i })),
      ...(shouldInvalidateUploaded ? { mergedAudioUrl: null, uploadedAudios: [] } : {}),
    };
  }),

  // --- 화자 전파 (선택한 줄부터 다음 명시적 화자가 나올 때까지 전파) ---
  changeSpeakerWithPropagation: (lineId, speakerId) => {
    const affectedLines: ScriptLine[] = [];
    let didChange = false;
    let shouldInvalidateUploaded = false;

    set((state) => {
      const startIndex = state.lines.findIndex((l) => l.id === lineId);
      if (startIndex < 0) return state;

      const previousSpeakerId = state.lines[startIndex].speakerId || '';
      if (previousSpeakerId === speakerId) return state;

      const nextLines = [...state.lines];

      for (let i = startIndex; i < nextLines.length; i++) {
        const current = state.lines[i];

        // 캐릭터 음성 라인(voiceName이 있는)은 건너뜀
        if (current.voiceName) continue;

        // 시작 줄이 아닌 경우: 빈 speakerId이거나 이전과 같은 speakerId일 때만 전파
        if (i > startIndex) {
          const canPropagate = !current.speakerId || current.speakerId === previousSpeakerId;
          if (!canPropagate) break;
        }

        const wasUploaded = isUploadedLine(current);
        shouldInvalidateUploaded = shouldInvalidateUploaded || wasUploaded;

        const updated: ScriptLine = wasUploaded
          ? {
              ...current,
              speakerId,
              audioUrl: undefined,
              audioSource: undefined,
              uploadedAudioId: undefined,
              startTime: undefined,
              endTime: undefined,
              duration: undefined,
              ttsStatus: 'idle' as const,
            }
          : {
              ...current,
              speakerId,
              audioUrl: undefined,
              ttsStatus: 'idle' as const,
            };

        nextLines[i] = updated;
        affectedLines.push(updated);
        didChange = true;
      }

      if (!didChange) return state;

      return {
        lines: nextLines,
        mergedAudioUrl: null,
        ...(shouldInvalidateUploaded ? { uploadedAudios: [] } : {}),
      };
    });

    return affectedLines;
  },

  // --- TTS ---
  setTtsEngine: (engine) => set({ ttsEngine: engine }),
  setIsGeneratingTTS: (v) => set({ isGeneratingTTS: v }),
  setTtsProgress: (progress) => set({ ttsProgress: progress }),
  setMergedAudio: (url) => set({ mergedAudioUrl: url }),

  // --- 음악 ---
  setMusicConfig: (config) => set({ musicConfig: config }),

  addToLibrary: (item) => {
    set((state) => ({ musicLibrary: [...state.musicLibrary, item] }));
    saveMusicGroup(item).catch((e) => console.warn('[Music] IndexedDB save failed:', e));
  },

  removeFromLibrary: (groupTitle) => {
    set((state) => ({ musicLibrary: state.musicLibrary.filter((m) => m.groupTitle !== groupTitle) }));
    deleteSavedMusic(groupTitle).catch((e) => console.warn('[Music] IndexedDB delete failed:', e));
  },

  toggleFavorite: (groupTitle, trackId) => {
    set((state) => {
      const updated = state.musicLibrary.map((group) =>
        group.groupTitle === groupTitle
          ? {
              ...group,
              tracks: group.tracks.map((t: GeneratedMusic) =>
                t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t
              ),
            }
          : group
      );
      // 즐겨찾기 변경도 IndexedDB에 반영
      const target = updated.find((g) => g.groupTitle === groupTitle);
      if (target) saveMusicGroup(target).catch((e) => console.warn('[Music] IndexedDB update failed:', e));
      return { musicLibrary: updated };
    });
  },

  loadMusicLibrary: async () => {
    try {
      const saved = await getAllSavedMusic();
      if (saved.length > 0) {
        set({ musicLibrary: saved });
      }
    } catch (e) {
      console.warn('[Music] IndexedDB load failed:', e);
    }
  },

  setIsGeneratingMusic: (v) => set({ isGeneratingMusic: v }),

  // --- 뮤직 스튜디오 탭 ---
  setMusicStudioTab: (tab) => { logger.trackTabVisit('music-studio', tab); set({ musicStudioTab: tab }); },

  // --- 가사 에디터 ---
  setLyricsPrompt: (prompt) => set({ lyricsPrompt: prompt }),
  setGeneratedLyrics: (lyrics) => set({ generatedLyrics: lyrics }),
  setIsGeneratingLyrics: (v) => set({ isGeneratingLyrics: v }),

  // --- 곡 연장 ---
  setExtendTarget: (track) => set({ extendTarget: track }),
  setIsExtending: (v) => set({ isExtending: v }),

  // --- 보컬 분리 ---
  setVocalSepTarget: (track) => set({ vocalSepTarget: track }),
  setVocalSepResult: (result) => set({ vocalSepResult: result }),
  setIsVocalSeparating: (v) => set({ isVocalSeparating: v }),

  // --- 즐겨찾기 ---
  toggleFavoriteModel: (modelId) => set((state) => {
    const updated = state.favoriteModels.includes(modelId)
      ? state.favoriteModels.filter(m => m !== modelId)
      : [...state.favoriteModels, modelId];
    localStorage.setItem(FAVORITE_MODELS_KEY, JSON.stringify(updated));
    return { favoriteModels: updated };
  }),

  toggleFavoriteVoice: (voiceId) => set((state) => {
    const updated = state.favoriteVoices.includes(voiceId)
      ? state.favoriteVoices.filter(v => v !== voiceId)
      : [...state.favoriteVoices, voiceId];
    localStorage.setItem(FAVORITE_VOICES_KEY, JSON.stringify(updated));
    return { favoriteVoices: updated };
  }),

  // --- 업로드 오디오 ---
  addUploadedAudio: (audio) => set((state) => ({
    uploadedAudios: [...state.uploadedAudios, audio],
  })),

  removeUploadedAudio: (id) => set((state) => ({
    uploadedAudios: state.uploadedAudios.filter((a) => a.id !== id),
  })),

  setIsTranscribing: (v) => set({ isTranscribing: v }),
  setTranscriptionProgress: (msg) => set({ transcriptionProgress: msg }),

  // --- 음악 생성 탭 상태 ---
  updateGenTabState: (partial) => set((state) => ({
    genTabState: { ...state.genTabState, ...partial },
  })),

  // --- 파형 편집 (WaveformEditor 연동) ---
  setPendingEditedAudioUrl: (url) => set({ pendingEditedAudioUrl: url }),
  commitPendingEdits: () => set((state) => {
    if (state.pendingEditedAudioUrl) {
      return { mergedAudioUrl: state.pendingEditedAudioUrl, pendingEditedAudioUrl: null };
    }
    return state;
  }),

  // --- SFX (효과음) ---
  addSfxItem: (item) => set((state) => ({ sfxItems: [...state.sfxItems, item] })),
  updateSfxItem: (id, partial) => set((state) => ({
    sfxItems: state.sfxItems.map((s) => s.id === id ? { ...s, ...partial } : s),
  })),
  removeSfxItem: (id) => set((state) => ({
    sfxItems: state.sfxItems.filter((s) => s.id !== id),
  })),

  // --- UI ---
  setActiveSubTab: (tab) => { logger.trackTabVisit('sound-studio', tab); set({ activeSubTab: tab }); },

  reset: () => set({ ...INITIAL_STATE }),
}));
