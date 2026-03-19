import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  SceneEffectConfig,
  SceneSubtitleConfig,
  SubtitleSegment,
  SceneAudioConfig,
  SceneOverlayConfig,
  SceneTransitionConfig,
  BgmConfig,
  SubtitleStyle,
  ExportProgress,
  SafeZoneConfig,
  AudioTrackId,
  TrackEffectConfig,
  TrackAudioEffect,
  TrackMixerConfig,
  RenderSettings,
  EditRoomSubTab,
  TimelineLayerSelection,
  TimelineContextMenuState,
} from '../types';
import type { TimelineLayerType } from '../types';
import { useProjectStore } from './projectStore';
import { useSoundStudioStore } from './soundStudioStore';
import { useCostStore } from './costStore';
import { PRICING } from '../constants';
import { assignSmartMotions } from '../services/smartMotionMatcher';
import { splitAudioAtTime } from '../services/ttsService';
import { evolinkChat } from '../services/evolinkService';
import { transcribeAudio } from '../services/transcriptionService';
import type { WhisperWord } from '../types';
import { logger } from '../services/LoggerService';

type GlobalPanel = 'subtitle-style' | 'bgm' | 'export' | null;

/** projectStore.config에 sceneOrder를 영속화 */
const persistSceneOrder = (order: string[]) => {
  useProjectStore.getState().setConfig((prev) =>
    prev ? { ...prev, sceneOrder: order } : prev
  );
};

/**
 * 오디오 파형 무음 구간 감지 → 가장 가까운 자연스러운 분할 시점 반환
 * TTS 오디오의 문장/구 사이 무음을 찾아 정밀 분할 (Web Audio API, 로컬 처리)
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
  }
}

async function findNearestSilenceGap(audioUrl: string, estimatedTime: number, totalDuration: number, signal?: AbortSignal): Promise<number> {
  let ctx: AudioContext | null = null;
  try {
    throwIfAborted(signal);
    const response = await fetch(audioUrl, signal ? { signal } : undefined);
    throwIfAborted(signal);
    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    throwIfAborted(signal);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // 50ms 윈도우로 RMS(음량) 분석
    const windowSize = Math.floor(sampleRate * 0.05);
    const silenceThreshold = 0.02;
    const minSilenceDuration = 0.08; // 80ms 이상 무음이어야 인식

    const gaps: number[] = [];
    let silenceStart = -1;

    for (let i = 0; i < channelData.length; i += windowSize) {
      const end = Math.min(i + windowSize, channelData.length);
      let rms = 0;
      for (let j = i; j < end; j++) rms += channelData[j] * channelData[j];
      rms = Math.sqrt(rms / (end - i));

      const time = i / sampleRate;

      if (rms < silenceThreshold) {
        if (silenceStart < 0) silenceStart = time;
      } else {
        if (silenceStart >= 0) {
          if (time - silenceStart >= minSilenceDuration) {
            gaps.push((silenceStart + time) / 2); // 무음 구간 중앙점
          }
          silenceStart = -1;
        }
      }
    }

    if (gaps.length === 0) return estimatedTime;

    // 추정 시간에 가장 가까운 무음 구간
    let nearest = gaps[0];
    let minDist = Math.abs(nearest - estimatedTime);
    for (const mid of gaps) {
      const dist = Math.abs(mid - estimatedTime);
      if (dist < minDist) { nearest = mid; minDist = dist; }
    }

    // 전체 길이의 30% 이내에서만 보정 (너무 멀면 문자비례 유지)
    return minDist <= totalDuration * 0.3 ? nearest : estimatedTime;
  } catch (e) {
    if (signal?.aborted) throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
    logger.trackSwallowedError('editRoomStore:snapToSilence', e);
    return estimatedTime;
  } finally {
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // close 실패는 분할 처리 흐름을 막지 않음
      }
    }
  }
}

/** AI 실패 시 글자수 기반 분할 포인트 계산 (CJK/영어 자동 판별) */
function fallbackSplitPoints(text: string, cpl: number): number[] {
  const points: number[] = [];
  // [FIX #404] 띄어쓰기 있으면 단어 기반 분할 (한국어 포함), 없으면 글자 수 기반
  if (text.includes(' ')) {
    const words = text.split(' ');
    let pos = 0;
    let lineLen = 0;
    for (const w of words) {
      const wLen = w.length + (lineLen > 0 ? 1 : 0);
      if (lineLen > 0 && lineLen + wLen > cpl) {
        points.push(pos);
        lineLen = w.length;
      } else {
        lineLen += wLen;
      }
      pos += w.length + 1; // +1 for space
    }
  } else {
    for (let i = cpl; i < text.length; i += cpl) {
      points.push(i);
    }
  }
  return points;
}

/** Whisper 단어 타임스탬프에서 splitPoint(글자 위치)에 해당하는 단어 경계 시간 반환 */
function findWordBoundaryTime(words: WhisperWord[], splitCharIndex: number, fullText: string): number {
  let charCount = 0;
  for (const word of words) {
    charCount += word.word.length;
    // 공백 포함 (단어 사이)
    if (charCount < fullText.length) charCount += 1;
    if (charCount >= splitCharIndex) {
      return word.endTime;
    }
  }
  return words[words.length - 1]?.endTime ?? 0;
}

/** 오디오 URL에서 Blob을 가져와 Whisper 전사 수행 */
async function tryWhisperTranscribe(audioUrl: string, signal?: AbortSignal): Promise<WhisperWord[] | null> {
  try {
    if (!audioUrl || audioUrl.startsWith('blob:invalid')) return null;
    throwIfAborted(signal);
    const response = await fetch(audioUrl, signal ? { signal } : undefined);
    throwIfAborted(signal);
    const blob = await response.blob();
    const result = await transcribeAudio(blob, { signal });
    throwIfAborted(signal);
    useCostStore.getState().addCost(PRICING.STT_SCRIBE_PER_CALL, 'tts');
    const allWords: WhisperWord[] = [];
    for (const seg of result.segments) {
      if (seg.words) {
        // 공백 토큰 필터링 (ElevenLabs Scribe는 " "를 별도 토큰으로 반환)
        for (const w of seg.words) {
          if (w.word.trim()) allWords.push({ ...w, word: w.word.trim() });
        }
      }
    }
    return allWords.length > 0 ? allWords : null;
  } catch (e) {
    if (signal?.aborted) throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
    logger.trackSwallowedError('editRoomStore:parseWhisperWords', e);
    return null;
  }
}

type SubtitleSegmentProcessOptions = {
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
};

interface EditRoomStore {
  // 장면별 설정 (Record<sceneId, config>)
  sceneEffects: Record<string, SceneEffectConfig>;
  sceneSubtitles: Record<string, SceneSubtitleConfig>;
  effectSubs: Record<string, string>;
  sceneAudioSettings: Record<string, SceneAudioConfig>;
  sceneOverlays: Record<string, SceneOverlayConfig[]>;
  sceneTransitions: Record<string, SceneTransitionConfig>;

  // 글로벌
  globalSubtitleStyle: SubtitleStyle | null;
  sceneOrder: string[];
  bgmTrack: BgmConfig;

  // UI
  expandedSceneId: string | null;
  activeGlobalPanel: GlobalPanel;

  // FFmpeg / 내보내기
  ffmpegLoaded: boolean;
  isExporting: boolean;
  exportProgress: ExportProgress | null;
  exportedVideoBlob: Blob | null; // 내보낸 MP4 blob (Upload탭 연동)

  // 안전 영역
  safeZone: SafeZoneConfig;

  // 트랙별 오디오 이펙트
  trackEffects: Record<AudioTrackId, TrackEffectConfig>;

  // 트랙 믹서 (mute/solo)
  trackMixer: Record<AudioTrackId, TrackMixerConfig>;
  sfxVolume: number;
  origAudioVolume: number;

  // 렌더 설정
  renderSettings: RenderSettings;

  // 자막 세그먼트
  charsPerLine: number;
  activeSubtitleText: string;

  // Whisper 단어 타임스탬프 캐시 (sceneId → WhisperWord[])
  _whisperCache: Record<string, WhisperWord[]>;

  // 모션 루핑 (ON=반복, OFF=장면 길이에 맞춰 1회)
  motionLooping: boolean;

  // 하단 페이드 강도 (0=OFF, 1~100=강도 %)
  bottomFade: number;

  // 타임라인 재생 상태
  isTimelinePlaying: boolean;

  // 서브탭
  editRoomSubTab: EditRoomSubTab;

  // 초기화 플래그
  initialized: boolean;

  // 타임라인 레이어 선택
  selectedLayer: TimelineLayerSelection | null;
  contextMenu: TimelineContextMenuState | null;

  // Actions
  selectLayer: (layerType: TimelineLayerType, sceneId: string | null) => void;
  clearSelection: () => void;
  setContextMenu: (menu: TimelineContextMenuState | null) => void;
  deleteSelectedLayer: () => void;
  initFromProject: () => void;
  setCharsPerLine: (v: number) => void;
  setActiveSubtitleText: (text: string) => void;
  setMotionLooping: (v: boolean) => void;
  setBottomFade: (v: number) => void;
  setIsTimelinePlaying: (v: boolean) => void;
  splitSubtitlesByCharsPerLine: () => number;
  createSubtitleSegments: (options?: SubtitleSegmentProcessOptions) => Promise<number>;
  setSceneEffect: (sceneId: string, effect: Partial<SceneEffectConfig>) => void;
  setSceneSubtitle: (sceneId: string, subtitle: Partial<SceneSubtitleConfig>) => void;
  setSceneAudioSettings: (sceneId: string, audio: Partial<SceneAudioConfig>) => void;
  setGlobalSubtitleStyle: (style: SubtitleStyle | null) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  splitScene: (sceneId: string, splitPoint: number) => Promise<void>;
  mergeScenes: (sceneIdA: string, sceneIdB: string) => void;
  setBgmTrack: (config: Partial<BgmConfig>) => void;
  setExpandedSceneId: (id: string | null) => void;
  setActiveGlobalPanel: (panel: GlobalPanel) => void;
  setFfmpegLoaded: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;
  setExportProgress: (progress: ExportProgress | null) => void;
  setExportedVideoBlob: (blob: Blob | null) => void;
  setSceneTransition: (fromSceneId: string, config: SceneTransitionConfig) => void;
  addSceneOverlay: (sceneId: string, overlay: SceneOverlayConfig) => void;
  updateSceneOverlay: (sceneId: string, index: number, partial: Partial<SceneOverlayConfig>) => void;
  removeSceneOverlay: (sceneId: string, index: number) => void;
  setSafeZone: (config: Partial<SafeZoneConfig>) => void;
  setTrackEffect: (trackId: AudioTrackId, config: Partial<TrackEffectConfig>) => void;
  addTrackEffect: (trackId: AudioTrackId, effect: TrackAudioEffect) => void;
  removeTrackEffect: (trackId: AudioTrackId, index: number) => void;
  updateTrackEffect: (trackId: AudioTrackId, index: number, partial: Partial<TrackAudioEffect>) => void;
  setTrackMixer: (trackId: AudioTrackId, config: Partial<TrackMixerConfig>) => void;
  setSfxVolume: (volume: number) => void;
  setOrigAudioVolume: (volume: number) => void;
  setRenderSettings: (config: Partial<RenderSettings>) => void;
  applySubtitleStyleToAll: (style: SubtitleStyle) => void;
  applySubtitleStyleToRange: (start: number, end: number, style: SubtitleStyle) => void;
  removeAllSubtitlePunctuation: () => void;
  mergeSubtitlesToSingleLine: () => void;
  splitMultiLineSubtitles: () => number;
  /** 마그넷 인서트: sceneOrder에서 클립 이동 후 갭 없이 타이밍 재배치 */
  reorderAndPack: (fromIndex: number, toIndex: number) => void;
  /** sceneOrder 순서대로 갭 없이 타이밍 재계산 */
  packTimingsSequential: () => void;
  /** 클립 타이밍 수정 (드래그/리사이즈) — ripple 모드: 후속 클립 자동 밀림 */
  updateSceneTiming: (sceneId: string, newStart: number, newDuration: number, ripple: boolean) => void;
  /** 자막 타이밍만 독립 수정 (영상 클립 타이밍은 유지) */
  updateSubtitleTiming: (sceneId: string, newStart: number, newEnd: number) => void;
  /** 블레이드 도구: 시간 기준 장면 분할 */
  splitSceneAtTime: (sceneId: string, time: number) => Promise<void>;
  /** Undo/Redo (전체 타임라인 상태 스냅샷) */
  _undoStack: Array<{ sceneSubtitles: Record<string, SceneSubtitleConfig>; sceneOrder: string[]; scenesJson: string; linesJson: string }>;
  _redoStack: Array<{ sceneSubtitles: Record<string, SceneSubtitleConfig>; sceneOrder: string[]; scenesJson: string; linesJson: string }>;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  regenerateMotions: () => void;
  reset: () => void;
  /** 프리뷰 전환 콜백 — ScenePreviewPanel이 등록, VisualTimeline이 호출 */
  _navigateToSceneFn: ((targetId: string) => void) | null;
  setNavigateToSceneFn: (fn: ((targetId: string) => void) | null) => void;
  setEditRoomSubTab: (tab: EditRoomSubTab) => void;
}

const DEFAULT_BGM: BgmConfig = {
  audioUrl: null,
  trackTitle: '',
  volume: 18,          // -15dB (100 × 10^(-15/20) ≈ 18)
  fadeIn: 2,
  fadeOut: 3,
  mixBalance: -30,     // 나레이션 우선 (기본)
  duckingDb: -12,      // 나레이션 구간 BGM 12dB 감소
  masterPreset: 'none',
  compressorBands: [
    { threshold: -24, ratio: 3, attack: 10, release: 100, gain: 2 },    // Low (20-200Hz)
    { threshold: -20, ratio: 2.5, attack: 5, release: 80, gain: 1 },    // Low-Mid (200-2kHz)
    { threshold: -18, ratio: 2, attack: 3, release: 60, gain: 0 },      // Hi-Mid (2k-6kHz)
    { threshold: -16, ratio: 2, attack: 1, release: 40, gain: -1 },     // High (6k-20kHz)
  ],
};

const DEFAULT_TRACK_EFFECTS: Record<AudioTrackId, TrackEffectConfig> = {
  narration: { effects: [], bypass: false },
  bgm: { effects: [], bypass: false },
  sfx: { effects: [], bypass: false },
  origAudio: { effects: [], bypass: false },
  master: { effects: [
    { type: 'compressor', enabled: true, params: { threshold: -20, ratio: 4, attack: 10, release: 100, gain: 0 } },
  ], bypass: false },
};

const INITIAL_STATE = {
  sceneEffects: {} as Record<string, SceneEffectConfig>,
  sceneSubtitles: {} as Record<string, SceneSubtitleConfig>,
  effectSubs: {} as Record<string, string>,
  sceneAudioSettings: {} as Record<string, SceneAudioConfig>,
  sceneOverlays: {} as Record<string, SceneOverlayConfig[]>,
  sceneTransitions: {} as Record<string, SceneTransitionConfig>,
  globalSubtitleStyle: null as SubtitleStyle | null,
  sceneOrder: [] as string[],
  bgmTrack: { ...DEFAULT_BGM },
  expandedSceneId: null as string | null,
  activeGlobalPanel: null as GlobalPanel,
  ffmpegLoaded: false,
  isExporting: false,
  exportProgress: null as ExportProgress | null,
  exportedVideoBlob: null as Blob | null,
  safeZone: {
    platform: 'youtube-shorts',
    showGuide: false,
    showUiSimulation: false,
  } as SafeZoneConfig,
  trackEffects: { ...DEFAULT_TRACK_EFFECTS } as Record<AudioTrackId, TrackEffectConfig>,
  trackMixer: {
    narration: { mute: false, solo: false, crossfadeMs: 50, pan: 0 },
    bgm: { mute: false, solo: false, crossfadeMs: 30, pan: 0 },
    sfx: { mute: false, solo: false, crossfadeMs: 30, pan: 0 },
    origAudio: { mute: false, solo: false, crossfadeMs: 0, pan: 0 },
    master: { mute: false, solo: false, crossfadeMs: 0, pan: 0 },
  } as Record<AudioTrackId, TrackMixerConfig>,
  sfxVolume: 80,
  origAudioVolume: 80,
  renderSettings: {
    loudness: { enabled: true, targetLufs: -14, truePeakDbtp: -1, lra: 11 },
    masterPresetOverride: null,
    renderMode: 'unified',
    includeSubtitles: true,
    videoBitrate: 20,
  } as RenderSettings,
  charsPerLine: 20,
  activeSubtitleText: '',
  _whisperCache: {},
  motionLooping: false,
  bottomFade: 0,
  isTimelinePlaying: false,
  editRoomSubTab: 'timeline' as EditRoomSubTab,
  initialized: false,
  selectedLayer: null as TimelineLayerSelection | null,
  contextMenu: null as TimelineContextMenuState | null,
  _navigateToSceneFn: null as ((targetId: string) => void) | null,
  _undoStack: [] as Array<{ sceneSubtitles: Record<string, SceneSubtitleConfig>; sceneOrder: string[]; scenesJson: string; linesJson: string }>,
  _redoStack: [] as Array<{ sceneSubtitles: Record<string, SceneSubtitleConfig>; sceneOrder: string[]; scenesJson: string; linesJson: string }>,
};

export const useEditRoomStore = create<EditRoomStore>()(immer((set, get) => ({
  ...INITIAL_STATE,

  initFromProject: () => {
    const scenes = useProjectStore.getState().scenes;
    const lines = useSoundStudioStore.getState().lines;
    const savedOrder = useProjectStore.getState().config?.sceneOrder;
    const newIds = scenes.map((s) => s.id);

    // BUG #4 fix: 새 프로젝트 감지 — 기존 sceneOrder와 겹치는 ID가 없으면 전체 리셋
    // ★ editRoomSubTab은 보존 — "편집실로" 버튼에서 설정한 서브탭이 리셋되는 문제 방지
    if (get().initialized && get().sceneOrder.length > 0) {
      const overlap = get().sceneOrder.filter((id) => newIds.includes(id));
      if (overlap.length === 0) {
        const currentSubTab = get().editRoomSubTab;
        set({ ...INITIAL_STATE, editRoomSubTab: currentSubTab });
      }
    }

    // BUG #2 fix: 재초기화 시 기존 순서 보존, 삭제된 것 제거, 새 것 끝에 추가
    let sceneOrder: string[];
    if (get().initialized) {
      const existing = get().sceneOrder;
      const preserved = existing.filter((id) => newIds.includes(id));
      const added = newIds.filter((id) => !existing.includes(id));
      sceneOrder = [...preserved, ...added];
    } else if (savedOrder && savedOrder.length > 0) {
      // 영속화된 순서 복원: 유효한 ID만 보존 + 새 ID 추가
      const preserved = savedOrder.filter((id) => newIds.includes(id));
      const added = newIds.filter((id) => !savedOrder.includes(id));
      sceneOrder = [...preserved, ...added];
    } else {
      sceneOrder = newIds;
    }

    // 장면별 기본 설정 초기화
    const sceneEffects: Record<string, SceneEffectConfig> = {};
    const sceneSubtitles: Record<string, SceneSubtitleConfig> = {};
    const effectSubs: Record<string, string> = {};
    const sceneAudioSettings: Record<string, SceneAudioConfig> = {};
    const sceneOverlays: Record<string, SceneOverlayConfig[]> = {};
    const sceneTransitions: Record<string, SceneTransitionConfig> = { ...get().sceneTransitions };

    // [FIX #400] sceneOrder 기반 lookupMap — 타이밍 계산을 반드시 sceneOrder 순서로 수행
    const sceneMap = new Map(scenes.map((s) => [s.id, s]));

    // Smart Motion 매칭: sceneOrder 순서로 계산 (연속 중복 회피가 표시 순서 기준이어야 정확)
    const orderedScenes = sceneOrder.map((id) => sceneMap.get(id)).filter(Boolean) as typeof scenes;
    const smartMotions = assignSmartMotions(
      orderedScenes.map((s) => ({
        visualPrompt: s.visualPrompt || '',
        scriptText: s.scriptText || '',
        sceneType: s.sceneType,
        castType: s.castType,
        shotSize: s.shotSize,
        cameraAngle: s.cameraAngle,
        entityComposition: s.entityComposition,
        characterPresent: s.characterPresent,
        cameraMovement: s.cameraMovement,
      }))
    );

    // [CRITICAL FIX #400] 누적 타이밍을 sceneOrder 순서로 계산
    // 이전 버그: scenes 배열 순서로 계산했지만 sceneOrder가 다르면 타이밍 불일치 → 갭/씽크 깨짐
    let cumTime = 0;

    // sceneId → line 빠른 검색용 맵 (index 폴백 포함)
    const lineByScene = new Map(lines.filter(l => l.sceneId).map(l => [l.sceneId!, l]));
    const lineByIndex = new Map(lines.map(l => [l.index, l]));

    // sceneOrder 순서로 반복 — useUnifiedTimeline과 동일한 순서로 타이밍 계산
    sceneOrder.forEach((sceneId, idx) => {
      const scene = sceneMap.get(sceneId);
      if (!scene) return;

      // 효과 기본값: Smart Motion 매칭 결과 적용 (앵커 포인트 포함)
      if (!get().sceneEffects[sceneId]) {
        const motion = smartMotions[idx];
        sceneEffects[sceneId] = {
          panZoomPreset: motion?.panZoomPreset || 'smooth',
          motionEffect: motion?.motionEffect || 'none',
          anchorX: motion?.anchorX ?? 50,
          anchorY: motion?.anchorY ?? 45,
          anchorLabel: motion?.anchorLabel || '프레임 중심',
        };
      } else {
        sceneEffects[sceneId] = get().sceneEffects[sceneId];
      }

      // [FIX #421] ScriptLine ↔ Scene 매칭: sceneId → sceneOrder 인덱스 폴백
      // 이전: scenes 배열 원래 인덱스(origIdx) 사용 → sceneOrder와 불일치 시 싱크 깨짐
      // 이후: sceneOrder 인덱스(idx) 사용 → useUnifiedTimeline과 동일한 매칭 규칙
      const matchedLine = lineByScene.get(sceneId) || lineByIndex.get(idx) || null;

      // [CRITICAL FIX] 장면별 순차 타이밍 계산
      let startT: number, endT: number;
      if (matchedLine?.startTime != null && matchedLine.startTime >= 0 &&
          matchedLine?.duration != null && matchedLine.duration > 0) {
        // 1순위: TTS 타이밍 (sound studio에서 전송된 정확한 시간)
        startT = matchedLine.startTime;
        // [BUG FIX] 항상 startTime + duration으로 계산 — endTime 필드 불일치 방지
        endT = matchedLine.startTime + matchedLine.duration;
      } else if (scene.startTime != null && scene.endTime != null && scene.endTime > scene.startTime) {
        // 2순위: Scene 저장 타이밍 (사운드 스튜디오 전송값)
        startT = scene.startTime;
        endT = scene.endTime;
      } else if (matchedLine?.duration != null && matchedLine.duration > 0) {
        // 3순위: duration만 있고 startTime 없음 → 누적 시간 기반
        startT = cumTime;
        endT = cumTime + matchedLine.duration;
      } else if (scene.audioDuration && scene.audioDuration > 0) {
        // 4순위: Scene audioDuration → 누적 시간 기반
        startT = cumTime;
        endT = cumTime + scene.audioDuration;
      } else {
        // 5순위: 기본 3초
        startT = cumTime;
        endT = cumTime + 3;
      }
      cumTime = endT;

      // 자막: 항상 최신 타이밍으로 갱신 (텍스트/세그먼트/스타일 등 기존 사용자 편집 보존)
      const existingSub = get().sceneSubtitles[sceneId];
      sceneSubtitles[sceneId] = {
        ...existingSub,
        // [FIX #499] 나레이션(matchedLine) 우선 — generatedDialogue는 영상용 대사이므로 자막과 충돌
        text: existingSub?.text || matchedLine?.text || scene.generatedDialogue || scene.scriptText || '',
        startTime: startT,
        endTime: endT,
        animationPreset: existingSub?.animationPreset || 'none',
      };

      // 오디오 기본값 — 나레이션 +4dB (100 × 10^(4/20) ≈ 158)
      if (!get().sceneAudioSettings[sceneId]) {
        sceneAudioSettings[sceneId] = {
          volume: 158,
          speed: 1.0,
        };
      } else {
        sceneAudioSettings[sceneId] = get().sceneAudioSettings[sceneId];
      }

      // 효과자막 hydrate — Scene에 effectSub가 있으면 store에 반영
      const sceneRecord = scene as unknown as Record<string, unknown>;
      if (typeof sceneRecord['effectSub'] === 'string' && sceneRecord['effectSub']) {
        effectSubs[sceneId] = sceneRecord['effectSub'] as string;
      }

      // 오버레이 기본값 (빈 배열 유지)
      sceneOverlays[sceneId] = get().sceneOverlays[sceneId] || [];

      // ScriptLine에 sceneId 연결 (부수 효과)
      if (matchedLine && matchedLine.sceneId !== sceneId) {
        useSoundStudioStore.getState().updateLine(matchedLine.id, { sceneId });
      }
    });

    // [FIX] BGM 설정 복원 — 첫 초기화 시 projectStore.config의 bgmConfig 복원
    const savedBgm = useProjectStore.getState().config?.bgmConfig;
    const bgmUpdate = (!get().initialized && savedBgm?.audioUrl)
      ? { bgmTrack: { ...DEFAULT_BGM, ...savedBgm } }
      : {};

    set({
      sceneOrder,
      sceneEffects,
      sceneSubtitles,
      effectSubs,
      sceneAudioSettings,
      sceneOverlays,
      sceneTransitions,
      initialized: true,
      ...bgmUpdate,
    });
    persistSceneOrder(sceneOrder);

    // [FIX] audioUrl은 있지만 duration이 없는 라인 → 비동기 디코딩으로 실제 길이 측정
    // 기존 프로젝트에서 TTS는 생성됐지만 duration이 저장 안 된 경우 대응
    const linesNeedingDuration = lines.filter(
      (l) => l.audioUrl && (!l.duration || l.duration <= 0)
    );
    if (linesNeedingDuration.length > 0) {
      (async () => {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          let offset = 0;
          const allLines = useSoundStudioStore.getState().lines;

          for (const line of allLines) {
            if (!line.audioUrl) {
              offset += line.duration || 3;
              continue;
            }
            let dur = line.duration;
            if (!dur || dur <= 0) {
              try {
                const resp = await fetch(line.audioUrl);
                const buf = await resp.arrayBuffer();
                const decoded = await ctx.decodeAudioData(buf);
                dur = decoded.duration;
              } catch (e) {
                logger.trackSwallowedError('editRoomStore:recalcAudioOffsets', e);
                dur = 3;
              }
            }
            useSoundStudioStore.getState().updateLine(line.id, {
              duration: dur,
              startTime: offset,
              endTime: offset + dur,
            });
            // Scene에도 동기화
            if (line.sceneId) {
              useProjectStore.getState().updateScene(line.sceneId, {
                audioDuration: dur,
                startTime: offset,
                endTime: offset + dur,
              });
            }
            offset += dur;
          }
          ctx.close();
        } catch (e) {
          console.warn('[editRoomStore] 오디오 디코딩 실패:', e);
        }
      })();
    }
  },

  setSceneEffect: (sceneId, effect) => set((state) => ({
    sceneEffects: {
      ...state.sceneEffects,
      [sceneId]: { ...state.sceneEffects[sceneId], ...effect } as SceneEffectConfig,
    },
  })),

  setSceneSubtitle: (sceneId, subtitle) => set((state) => ({
    sceneSubtitles: {
      ...state.sceneSubtitles,
      [sceneId]: { ...state.sceneSubtitles[sceneId], ...subtitle } as SceneSubtitleConfig,
    },
  })),

  setSceneAudioSettings: (sceneId, audio) => set((state) => ({
    sceneAudioSettings: {
      ...state.sceneAudioSettings,
      [sceneId]: { ...state.sceneAudioSettings[sceneId], ...audio } as SceneAudioConfig,
    },
  })),

  setGlobalSubtitleStyle: (style) => set((state) => {
    // 글로벌 스타일 변경 시 per-scene styleOverride 제거 (전역 설정이 즉시 반영되도록)
    if (style) {
      const updated = { ...state.sceneSubtitles };
      Object.keys(updated).forEach((key) => {
        if (updated[key]?.styleOverride) {
          const { styleOverride: _, ...rest } = updated[key];
          updated[key] = rest as SceneSubtitleConfig;
        }
      });
      return { globalSubtitleStyle: style, sceneSubtitles: updated };
    }
    return { globalSubtitleStyle: style };
  }),

  reorderScenes: (fromIndex, toIndex) => {
    const state = get();
    const newOrder = [...state.sceneOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    set({ sceneOrder: newOrder });
    persistSceneOrder(newOrder);
    get().packTimingsSequential();
  },

  reorderAndPack: (fromIndex, toIndex) => {
    get().reorderScenes(fromIndex, toIndex);
  },

  splitScene: async (sceneId, splitPoint) => {
    const state = get();
    const orderIdx = state.sceneOrder.indexOf(sceneId);
    if (orderIdx < 0) return;

    const subtitle = state.sceneSubtitles[sceneId];
    if (!subtitle) return;

    // 텍스트 분할
    const textBefore = subtitle.text.slice(0, splitPoint).trim();
    const textAfter = subtitle.text.slice(splitPoint).trim();
    if (!textBefore || !textAfter) return;

    // 1차: 텍스트 비례 타이밍 추정
    const totalDuration = subtitle.endTime - subtitle.startTime;
    const ratio = textBefore.length / subtitle.text.length;
    let audioSplitSec = totalDuration * ratio;

    const soundLines = useSoundStudioStore.getState().lines;
    const scenes = useProjectStore.getState().scenes;
    const sceneIdx = scenes.findIndex((s) => s.id === sceneId);
    if (sceneIdx < 0) return;
    const earlyMatchedLine = soundLines.find((l) => l.sceneId === sceneId) || soundLines[sceneIdx] || null;

    // 2차: Whisper 단어 경계 캐시 활용 (createSubtitleSegments에서 저장된 데이터)
    let usedWordBoundary = false;
    const cachedWords = state._whisperCache[sceneId];
    if (cachedWords && cachedWords.length > 0) {
      audioSplitSec = findWordBoundaryTime(cachedWords, splitPoint, subtitle.text);
      usedWordBoundary = true;
    }

    // 3차: 나레이션 오디오 무음 구간 감지로 보정 (Whisper 캐시 없을 때 폴백)
    if (!usedWordBoundary && earlyMatchedLine?.audioUrl && !earlyMatchedLine.audioUrl.startsWith('blob:invalid')) {
      const lineDuration = earlyMatchedLine.duration || totalDuration;
      const estimated = lineDuration * ratio;
      audioSplitSec = await findNearestSilenceGap(earlyMatchedLine.audioUrl, estimated, lineDuration);
    }

    const splitTime = subtitle.startTime + audioSplitSec;
    const durationBefore = audioSplitSec;
    const durationAfter = totalDuration - audioSplitSec;

    // 원본 장면의 이미지/영상 URL 보존 (splitScene이 새 장면에서 제거하므로)
    const sourceScene = scenes[sceneIdx];
    const sourceImageUrl = sourceScene?.imageUrl;
    const sourceVideoUrl = sourceScene?.videoUrl;

    useProjectStore.getState().splitScene(sceneIdx);

    // 새 장면 ID 가져오기
    const updatedScenes = useProjectStore.getState().scenes;
    const newScene = updatedScenes[sceneIdx + 1];
    if (!newScene) return;

    const newSceneId = newScene.id;

    // [FIX] projectStore 장면의 scriptText를 자막 분할 기준으로 정확히 덮어쓰기
    // (projectStore.splitScene은 문장 경계로 분할하므로 자막 분할 지점과 다를 수 있음)
    useProjectStore.getState().updateScene(sceneId, {
      scriptText: textBefore,
      startTime: subtitle.startTime,
      endTime: splitTime,
      audioDuration: durationBefore,
    });
    // 새 장면: 원본 이미지/영상 복제 (자막만 분리, 이미지/영상은 유지)
    useProjectStore.getState().updateScene(newSceneId, {
      scriptText: textAfter,
      imageUrl: sourceImageUrl,
      videoUrl: sourceVideoUrl,
      startTime: splitTime,
      endTime: subtitle.endTime,
      audioDuration: durationAfter,
    });

    // [FIX] soundStudioStore 나레이션 라인 분리 — 무음 구간 감지로 정밀 오디오 싱크
    // (earlyMatchedLine은 위에서 미리 조회한 것을 재사용 — splitScene 이후 재조회)
    const currentSoundLines = useSoundStudioStore.getState().lines;
    const matchedLine = currentSoundLines.find((l) => l.sceneId === sceneId) || currentSoundLines[sceneIdx] || null;

    if (matchedLine) {
      const lineDuration = matchedLine.duration || totalDuration;
      // audioSplitSec: 무음 구간 감지로 보정된 분할 시점 (위에서 계산 완료)
      const audioSplitTime = audioSplitSec;

      // 원본 라인 업데이트 (앞쪽 텍스트 + 타이밍)
      useSoundStudioStore.getState().updateLine(matchedLine.id, {
        text: textBefore,
        sceneId: sceneId,
        duration: audioSplitTime,
        startTime: matchedLine.startTime ?? subtitle.startTime,
        endTime: (matchedLine.startTime ?? subtitle.startTime) + audioSplitTime,
      });

      // 새 ScriptLine 생성 (뒤쪽 텍스트)
      const newLineId = `line-${Date.now()}-split`;
      const newLineStartTime = (matchedLine.startTime ?? subtitle.startTime) + audioSplitTime;
      const newLine = {
        id: newLineId,
        speakerId: matchedLine.speakerId || '',
        text: textAfter,
        index: matchedLine.index + 1,
        sceneId: newSceneId,
        duration: lineDuration - audioSplitTime,
        startTime: newLineStartTime,
        endTime: newLineStartTime + (lineDuration - audioSplitTime),
        ttsStatus: 'idle' as const,
        voiceId: matchedLine.voiceId,
        voiceName: matchedLine.voiceName,
        voiceImage: matchedLine.voiceImage,
        emotion: matchedLine.emotion,
        lineSpeed: matchedLine.lineSpeed,
      };

      // soundStudioStore.lines에 새 라인 삽입
      useSoundStudioStore.getState().setLines((prev) => {
        const idx = prev.findIndex((l) => l.id === matchedLine.id);
        const next = [...prev];
        next.splice(idx + 1, 0, newLine);
        // 인덱스 재정렬
        return next.map((l, i) => ({ ...l, index: i }));
      });

      // [FIX] 오디오 blob 분할 (비동기) — 나레이션 오디오가 있으면 정확하게 분할
      if (matchedLine.audioUrl && !matchedLine.audioUrl.startsWith('blob:invalid')) {
        splitAudioAtTime(matchedLine.audioUrl, audioSplitTime).then((result) => {
          if (!result) return;
          const [url1, url2] = result;

          // 원본 라인 오디오 업데이트
          useSoundStudioStore.getState().updateLine(matchedLine.id, {
            audioUrl: url1,
            ttsStatus: 'done',
          });
          // 새 라인 오디오 업데이트
          useSoundStudioStore.getState().updateLine(newLineId, {
            audioUrl: url2,
            ttsStatus: 'done',
          });

          // projectStore 장면에도 오디오 URL 동기화
          useProjectStore.getState().updateScene(sceneId, { audioUrl: url1 });
          useProjectStore.getState().updateScene(newSceneId, { audioUrl: url2 });
        });
      }
    }

    // editRoomStore 상태 업데이트
    set((prev) => {
      const newOrder = [...prev.sceneOrder];
      newOrder.splice(orderIdx + 1, 0, newSceneId);
      persistSceneOrder(newOrder);

      return {
        sceneOrder: newOrder,
        sceneSubtitles: {
          ...prev.sceneSubtitles,
          [sceneId]: { ...subtitle, text: textBefore, endTime: splitTime },
          [newSceneId]: {
            text: textAfter,
            startTime: splitTime,
            endTime: subtitle.endTime,
            animationPreset: subtitle.animationPreset,
          },
        },
        sceneEffects: {
          ...prev.sceneEffects,
          [newSceneId]: { ...prev.sceneEffects[sceneId] },
        },
        sceneAudioSettings: {
          ...prev.sceneAudioSettings,
          [newSceneId]: { ...prev.sceneAudioSettings[sceneId] },
        },
        sceneOverlays: {
          ...prev.sceneOverlays,
          [newSceneId]: (prev.sceneOverlays[sceneId] || []).map((o) => ({ ...o })),
        },
        sceneTransitions: {
          ...prev.sceneTransitions,
          [newSceneId]: prev.sceneTransitions[sceneId] ? { ...prev.sceneTransitions[sceneId] } : { preset: 'none', duration: 0.5 },
        },
      };
    });
  },

  mergeScenes: (sceneIdA, sceneIdB) => {
    const state = get();
    const idxA = state.sceneOrder.indexOf(sceneIdA);
    const idxB = state.sceneOrder.indexOf(sceneIdB);
    if (idxA < 0 || idxB < 0 || Math.abs(idxA - idxB) !== 1) return;

    // 순서 보장 (A가 먼저)
    const [firstId, secondId] = idxA < idxB ? [sceneIdA, sceneIdB] : [sceneIdB, sceneIdA];

    const subA = state.sceneSubtitles[firstId];
    const subB = state.sceneSubtitles[secondId];
    if (!subA || !subB) return;

    // projectStore에서 뒤 장면 제거
    const scenes = useProjectStore.getState().scenes;
    const removeIdx = scenes.findIndex((s) => s.id === secondId);
    if (removeIdx >= 0) {
      useProjectStore.getState().removeScene(removeIdx);
    }

    // soundStudioStore에서 제거된 장면의 orphan 라인 정리
    const soundLines = useSoundStudioStore.getState().lines;
    const orphanIdx = soundLines.findIndex(l => l.sceneId === secondId);
    if (orphanIdx >= 0) {
      useSoundStudioStore.getState().removeLine(soundLines[orphanIdx].id);
    }

    set((prev) => {
      const newOrder = prev.sceneOrder.filter((id) => id !== secondId);
      persistSceneOrder(newOrder);

      // 자막 병합
      const mergedSubtitle: SceneSubtitleConfig = {
        text: subA.text + ' ' + subB.text,
        startTime: Math.min(subA.startTime, subB.startTime),
        endTime: Math.max(subA.endTime, subB.endTime),
        animationPreset: subA.animationPreset,
      };

      const newSubtitles = { ...prev.sceneSubtitles };
      newSubtitles[firstId] = mergedSubtitle;
      delete newSubtitles[secondId];

      // 효과/오디오 설정은 첫 번째 장면 것 유지
      const newEffects = { ...prev.sceneEffects };
      delete newEffects[secondId];

      const newAudio = { ...prev.sceneAudioSettings };
      delete newAudio[secondId];

      const newOverlays = { ...prev.sceneOverlays };
      delete newOverlays[secondId];

      const newTransitions = { ...prev.sceneTransitions };
      delete newTransitions[secondId];

      return {
        sceneOrder: newOrder,
        sceneSubtitles: newSubtitles,
        sceneEffects: newEffects,
        sceneAudioSettings: newAudio,
        sceneOverlays: newOverlays,
        sceneTransitions: newTransitions,
      };
    });
  },

  setBgmTrack: (config) => {
    set((state) => ({
      bgmTrack: { ...state.bgmTrack, ...config },
    }));
    // Persist BGM config to projectStore for save/load survival
    const updated = { ...get().bgmTrack, ...config };
    useProjectStore.getState().setConfig((prev) =>
      prev ? { ...prev, bgmConfig: updated } : prev
    );
  },

  setExpandedSceneId: (id) => set({ expandedSceneId: id }),
  setNavigateToSceneFn: (fn) => set({ _navigateToSceneFn: fn }),
  setEditRoomSubTab: (tab) => { logger.trackTabVisit('edit-room', tab); set({ editRoomSubTab: tab }); },
  setActiveGlobalPanel: (panel) => { logger.trackTabVisit('edit-room-panel', panel || 'closed'); set({ activeGlobalPanel: panel }); },
  setFfmpegLoaded: (v) => set({ ffmpegLoaded: v }),
  setIsExporting: (v) => set({ isExporting: v }),
  setExportProgress: (progress) => set({ exportProgress: progress }),
  setExportedVideoBlob: (blob) => set({ exportedVideoBlob: blob }),

  setSafeZone: (config) => set((state) => ({
    safeZone: { ...state.safeZone, ...config },
  })),

  setSceneTransition: (fromSceneId, config) => set((state) => ({
    sceneTransitions: { ...state.sceneTransitions, [fromSceneId]: config },
  })),

  addSceneOverlay: (sceneId, overlay) => set((state) => {
    const current = state.sceneOverlays[sceneId] || [];
    if (current.length >= 5) return {};
    return {
      sceneOverlays: { ...state.sceneOverlays, [sceneId]: [...current, overlay] },
    };
  }),

  updateSceneOverlay: (sceneId, index, partial) => set((state) => {
    const current = state.sceneOverlays[sceneId] || [];
    if (index < 0 || index >= current.length) return {};
    return {
      sceneOverlays: {
        ...state.sceneOverlays,
        [sceneId]: current.map((o, i) => i === index ? { ...o, ...partial } : o),
      },
    };
  }),

  removeSceneOverlay: (sceneId, index) => set((state) => {
    const current = state.sceneOverlays[sceneId] || [];
    return {
      sceneOverlays: {
        ...state.sceneOverlays,
        [sceneId]: current.filter((_, i) => i !== index),
      },
    };
  }),

  setTrackEffect: (trackId, config) => set((state) => ({
    trackEffects: {
      ...state.trackEffects,
      [trackId]: { ...state.trackEffects[trackId], ...config },
    },
  })),

  addTrackEffect: (trackId, effect) => set((state) => ({
    trackEffects: {
      ...state.trackEffects,
      [trackId]: {
        ...state.trackEffects[trackId],
        effects: [...state.trackEffects[trackId].effects, effect],
      },
    },
  })),

  removeTrackEffect: (trackId, index) => set((state) => ({
    trackEffects: {
      ...state.trackEffects,
      [trackId]: {
        ...state.trackEffects[trackId],
        effects: state.trackEffects[trackId].effects.filter((_, i) => i !== index),
      },
    },
  })),

  updateTrackEffect: (trackId, index, partial) => set((state) => ({
    trackEffects: {
      ...state.trackEffects,
      [trackId]: {
        ...state.trackEffects[trackId],
        effects: state.trackEffects[trackId].effects.map((fx, i) =>
          i === index ? { ...fx, ...partial } : fx
        ),
      },
    },
  })),

  setTrackMixer: (trackId, config) => set((state) => ({
    trackMixer: {
      ...state.trackMixer,
      [trackId]: { ...state.trackMixer[trackId], ...config },
    },
  })),

  setSfxVolume: (volume) => set({ sfxVolume: volume }),
  setOrigAudioVolume: (volume) => set({ origAudioVolume: volume }),

  setRenderSettings: (config) => set((state) => ({
    renderSettings: { ...state.renderSettings, ...config },
  })),

  applySubtitleStyleToAll: (style) => set((state) => {
    const updated = { ...state.sceneSubtitles };
    // sceneOrder 기반으로 ALL 장면에 styleOverride 적용 (엔트리 없는 장면도 포함)
    state.sceneOrder.forEach((key) => {
      updated[key] = {
        ...(updated[key] || { text: '', startTime: 0, endTime: 0 }),
        styleOverride: style.template,
      };
    });
    return { sceneSubtitles: updated, globalSubtitleStyle: style };
  }),

  applySubtitleStyleToRange: (start, end, style) => set((state) => {
    const updated = { ...state.sceneSubtitles };
    const keys = state.sceneOrder.slice(start, end + 1);
    keys.forEach((key) => {
      if (updated[key]) {
        updated[key] = { ...updated[key], styleOverride: style.template };
      }
    });
    return { sceneSubtitles: updated };
  }),

  removeAllSubtitlePunctuation: () => set((state) => {
    const updated = { ...state.sceneSubtitles };
    const rx = /[.,!?;:…·。、！？；：「」『』\u201C\u201D\u2018\u2019~\-\u2013\u2014()（）[\]【】<>《》]/g;
    Object.keys(updated).forEach((key) => {
      if (updated[key]?.text) {
        updated[key] = { ...updated[key], text: updated[key].text.replace(rx, '') };
      }
    });
    return { sceneSubtitles: updated };
  }),

  mergeSubtitlesToSingleLine: () => set((state) => {
    const updated = { ...state.sceneSubtitles };
    Object.keys(updated).forEach((key) => {
      if (updated[key]?.text) {
        updated[key] = { ...updated[key], text: updated[key].text.replace(/\n/g, ' ') };
      }
    });
    return { sceneSubtitles: updated };
  }),

  splitMultiLineSubtitles: () => {
    const state = get();

    // [FIX #141] 줄바꿈이 포함된 자막을 한 줄로 합침 (장면 분할 안 함 — 토글 시 장면 폭증 방지)
    const updated = { ...state.sceneSubtitles };
    let count = 0;

    state.sceneOrder.forEach((sceneId) => {
      const sub = updated[sceneId];
      if (!sub?.text?.includes('\n')) return;
      const lines = sub.text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) return;
      // 줄바꿈 제거하고 한 줄로 합침
      updated[sceneId] = { ...sub, text: lines.join(' ') };
      count++;
    });

    if (count === 0) return 0;
    set({ sceneSubtitles: updated });
    return count;
  },

  selectLayer: (layerType, sceneId) => {
    set({
      selectedLayer: { layerType, sceneId },
      contextMenu: null,
    });
    // 영상 레이어 선택 시 프리뷰 동기화
    if (sceneId && (layerType === 'video' || layerType === 'subtitle' || layerType === 'narration' || layerType === 'origAudio' || layerType === 'sfx' || layerType === 'transition')) {
      const realSceneId = sceneId.replace(/^(va-|sfx-)/, '');
      set({ expandedSceneId: realSceneId });
    }
  },

  clearSelection: () => set({ selectedLayer: null, contextMenu: null }),

  setContextMenu: (menu) => set({ contextMenu: menu }),

  deleteSelectedLayer: () => {
    const { selectedLayer } = get();
    if (!selectedLayer) return;
    const { layerType, sceneId } = selectedLayer;
    if (!sceneId) return;
    const realId = sceneId.replace(/^(va-|sfx-)/, '');
    switch (layerType) {
      case 'subtitle':
        get().setSceneSubtitle(realId, { text: '' });
        break;
      case 'transition':
        get().setSceneTransition(realId, { preset: 'none', duration: 0.5 });
        break;
      case 'video':
        get().setSceneEffect(realId, { panZoomPreset: 'none', motionEffect: 'none' });
        break;
      default:
        break;
    }
    set({ selectedLayer: null });
  },

  setCharsPerLine: (v) => set({ charsPerLine: v }),

  setActiveSubtitleText: (text) => set({ activeSubtitleText: text }),

  setMotionLooping: (v) => set({ motionLooping: v }),
  setBottomFade: (v) => set({ bottomFade: v }),

  setIsTimelinePlaying: (v) => set({ isTimelinePlaying: v }),

  createSubtitleSegments: async (options) => {
    const { signal, onProgress } = options || {};
    const state = get();
    const cpl = state.charsPerLine;
    const soundLines = useSoundStudioStore.getState().lines;
    let totalSegments = 0;
    const updated = { ...state.sceneSubtitles };
    const targetSceneIds = state.sceneOrder.filter((sceneId) => updated[sceneId]?.text?.trim());
    const totalScenes = targetSceneIds.length;

    for (let sceneIndex = 0; sceneIndex < targetSceneIds.length; sceneIndex++) {
      throwIfAborted(signal);
      onProgress?.(sceneIndex + 1, totalScenes);

      const sceneId = targetSceneIds[sceneIndex];
      const sub = updated[sceneId];
      if (!sub?.text?.trim()) continue;
      // AI 분할 / Whisper 타이밍 계산용 + 세그먼트 텍스트 슬라이싱용 (줄바꿈→공백으로 평탄화)
      // [FIX #320] rawText로 통일 — preservedText와의 인덱스 불일치(줄바꿈 문자 차이)로 단어 중간 끊김 발생하던 버그 수정
      const rawText = sub.text.replace(/\n/g, ' ').trim();
      if (rawText.length <= cpl) continue;

      // ── Step 1: 분할점 결정 ──
      // [FIX #399] 이미 \n 줄바꿈이 있으면 (AI자막처리 Step 1에서 설정됨) 그 위치를 그대로 사용
      // → AI 재호출 시 텍스트 박스와 다른 위치에서 분할되는 버그 방지
      let splitPoints: number[];
      const textLines = sub.text.split('\n').map(l => l.trim()).filter(Boolean);
      if (textLines.length > 1) {
        // \n 위치를 rawText 기준 인덱스로 변환 (+1은 \n→공백 치환 보정)
        splitPoints = [];
        let cum = 0;
        for (let i = 0; i < textLines.length - 1; i++) {
          cum += textLines[i].length;
          splitPoints.push(cum);
          cum += 1; // rawText에서 \n이 공백으로 치환된 1글자 보정
        }
      } else {
        // 줄바꿈 없으면 AI 의미 단위 분할
        try {
          const resp = await evolinkChat([
            { role: 'system', content: `자막 텍스트를 자연스러운 줄 단위로 나눠라.\n각 줄 최대 ${cpl}자. 문맥/구두점/조사 경계에서 분할.\nJSON 응답: {"lines":["줄1","줄2",...]}` },
            { role: 'user', content: rawText }
          ], { temperature: 0.1, responseFormat: { type: 'json_object' }, signal, model: 'gemini-3.1-flash-lite-preview' });
          throwIfAborted(signal);
          const parsed = JSON.parse(resp.choices[0].message.content || '{}');
          if (Array.isArray(parsed.lines) && parsed.lines.length > 1) {
            splitPoints = [];
            let cum = 0;
            for (let i = 0; i < parsed.lines.length - 1; i++) {
              cum += parsed.lines[i].length;
              splitPoints.push(cum);
            }
          } else {
            splitPoints = fallbackSplitPoints(rawText, cpl);
          }
        } catch (e) {
          if (signal?.aborted) throw new DOMException('AI 자막 처리가 취소되었습니다.', 'AbortError');
          logger.trackSwallowedError('editRoomStore:aiSubtitleSplit', e);
          splitPoints = fallbackSplitPoints(rawText, cpl);
        }
      }

      if (splitPoints.length === 0) continue;

      // ── Step 2: Whisper 단어 타임스탬프 → 정확한 분할점, 실패 시 무음 감지 폴백 ──
      const matchedLine = soundLines.find(l => l.sceneId === sceneId);
      const audioUrl = matchedLine?.audioUrl;
      const totalDur = sub.endTime - sub.startTime;
      const lineDuration = matchedLine?.duration || totalDur;
      const totalChars = rawText.length;

      const boundaries: number[] = [0];

      // Whisper 전사 시도 (단어별 타임스탬프) + 캐시 저장
      const whisperWords = audioUrl ? await tryWhisperTranscribe(audioUrl, signal) : null;
      throwIfAborted(signal);
      if (whisperWords) {
        set(prev => ({ _whisperCache: { ...prev._whisperCache, [sceneId]: whisperWords } }));
      }

      for (const sp of splitPoints) {
        if (whisperWords) {
          // Whisper 단어 경계 기반 정확한 타이밍
          boundaries.push(findWordBoundaryTime(whisperWords, sp, rawText));
        } else {
          const ratio = sp / totalChars;
          const estimated = lineDuration * ratio;
          if (audioUrl && !audioUrl.startsWith('blob:invalid')) {
            const actual = await findNearestSilenceGap(audioUrl, estimated, lineDuration, signal);
            throwIfAborted(signal);
            boundaries.push(actual);
          } else {
            boundaries.push(lineDuration * ratio);
          }
        }
      }
      boundaries.push(lineDuration);

      // 오디오 상대시간 → 절대 타임라인 시간 변환
      // [FIX #320] rawText 기준으로 슬라이싱 — splitPoints가 rawText 길이 기준이므로
      // preservedText(줄바꿈 포함)와 인덱스 불일치로 단어 중간 끊김 발생하던 버그 수정
      const segments: SubtitleSegment[] = [];
      let textStart = 0;
      for (let i = 0; i <= splitPoints.length; i++) {
        const textEnd = i < splitPoints.length ? splitPoints[i] : rawText.length;
        const segText = rawText.slice(textStart, textEnd).trim();
        if (segText) {
          segments.push({
            text: segText,
            startTime: sub.startTime + boundaries[i],
            endTime: sub.startTime + boundaries[i + 1],
          });
        }
        textStart = textEnd;
      }

      updated[sceneId] = { ...sub, segments };
      totalSegments += segments.length;
    }

    set({ sceneSubtitles: updated });
    return totalSegments;
  },

  updateSceneTiming: (sceneId, newStart, newDuration, ripple) => {
    const state = get();
    const orderIdx = state.sceneOrder.indexOf(sceneId);
    if (orderIdx < 0) return;

    const sub = state.sceneSubtitles[sceneId];
    if (!sub) return;

    const newEnd = newStart + newDuration;
    const updated = { ...state.sceneSubtitles };
    // _userTiming 플래그: useUnifiedTimeline에서 TTS보다 우선 적용하도록
    updated[sceneId] = { ...sub, startTime: newStart, endTime: newEnd, _userTiming: true } as typeof sub & { _userTiming: boolean };

    // projectStore 동기화
    useProjectStore.getState().updateScene(sceneId, {
      startTime: newStart,
      endTime: newEnd,
      audioDuration: newDuration,
    });

    // soundStudioStore 라인 타이밍도 동기화 (TTS 타이밍 우선순위 충돌 방지)
    const soundLines = useSoundStudioStore.getState().lines;
    const matchedLine = soundLines.find(l => l.sceneId === sceneId);
    if (matchedLine) {
      useSoundStudioStore.getState().updateLine(matchedLine.id, {
        startTime: newStart,
        endTime: newEnd,
        duration: newDuration,
      });
    }

    if (ripple) {
      // 리플 편집: 후속 클립들의 시작/끝 시간을 자동 조정
      let cursor = newEnd;
      for (let i = orderIdx + 1; i < state.sceneOrder.length; i++) {
        const nextId = state.sceneOrder[i];
        const nextSub = updated[nextId] || state.sceneSubtitles[nextId];
        if (!nextSub) continue;
        const dur = nextSub.endTime - nextSub.startTime;
        updated[nextId] = { ...nextSub, startTime: cursor, endTime: cursor + dur, _userTiming: true } as typeof nextSub & { _userTiming: boolean };
        useProjectStore.getState().updateScene(nextId, {
          startTime: cursor,
          endTime: cursor + dur,
        });
        // 후속 라인 타이밍도 동기화
        const nextLine = soundLines.find(l => l.sceneId === nextId);
        if (nextLine) {
          useSoundStudioStore.getState().updateLine(nextLine.id, {
            startTime: cursor,
            endTime: cursor + dur,
            duration: dur,
          });
        }
        cursor += dur;
      }
    }

    set({ sceneSubtitles: updated });
  },

  updateSubtitleTiming: (sceneId, newStart, newEnd) => {
    const state = get();
    const sub = state.sceneSubtitles[sceneId];
    if (!sub) return;
    const dur = newEnd - newStart;

    // [FIX #421] _userTiming 플래그 추가 — 드래그 타이밍이 TTS 타이밍보다 우선되도록
    const newSub = { ...sub, startTime: newStart, endTime: newEnd, _userTiming: true } as typeof sub & { _userTiming: boolean };

    // segments가 있으면 timeShift만큼 함께 이동
    if (sub.segments && sub.segments.length > 0) {
      const timeShift = newStart - sub.startTime;
      newSub.segments = sub.segments.map(seg => ({
        ...seg,
        startTime: seg.startTime + timeShift,
        endTime: seg.endTime + timeShift,
      }));
    }

    set({
      sceneSubtitles: {
        ...state.sceneSubtitles,
        [sceneId]: newSub,
      },
    });

    // [FIX #421] projectStore + soundStudioStore 동기화 — 싱크 불일치 방지
    useProjectStore.getState().updateScene(sceneId, {
      startTime: newStart,
      endTime: newEnd,
    });
    const soundLines = useSoundStudioStore.getState().lines;
    const matchedLine = soundLines.find(l => l.sceneId === sceneId);
    if (matchedLine) {
      useSoundStudioStore.getState().updateLine(matchedLine.id, {
        startTime: newStart,
        endTime: newEnd,
        duration: dur,
      });
    }
  },

  packTimingsSequential: () => {
    const state = get();
    const updated = { ...state.sceneSubtitles };
    const soundLines = useSoundStudioStore.getState().lines;
    let cursor = 0;

    for (const sceneId of state.sceneOrder) {
      const sub = updated[sceneId];
      if (!sub) continue;
      const dur = sub.endTime - sub.startTime;
      const oldStart = sub.startTime;
      const timeShift = cursor - oldStart;

      // 자막 타이밍 갱신
      const newSub = { ...sub, startTime: cursor, endTime: cursor + dur, _userTiming: true } as typeof sub & { _userTiming: boolean };

      // segments가 있으면 timeShift만큼 함께 이동
      if (sub.segments && sub.segments.length > 0) {
        newSub.segments = sub.segments.map(seg => ({
          ...seg,
          startTime: seg.startTime + timeShift,
          endTime: seg.endTime + timeShift,
        }));
      }

      updated[sceneId] = newSub;

      // projectStore 동기화
      useProjectStore.getState().updateScene(sceneId, {
        startTime: cursor,
        endTime: cursor + dur,
        audioDuration: dur,
      });

      // soundStudioStore 동기화
      const matchedLine = soundLines.find(l => l.sceneId === sceneId);
      if (matchedLine) {
        useSoundStudioStore.getState().updateLine(matchedLine.id, {
          startTime: cursor,
          endTime: cursor + dur,
          duration: dur,
        });
      }

      cursor += dur;
    }

    set({ sceneSubtitles: updated });
  },

  splitSceneAtTime: async (sceneId, time) => {
    const state = get();
    const sub = state.sceneSubtitles[sceneId];
    if (!sub || !sub.text) return;
    const duration = sub.endTime - sub.startTime;
    if (duration <= 0) return;
    const ratio = Math.max(0.05, Math.min(0.95, (time - sub.startTime) / duration));
    const charPos = Math.max(1, Math.min(sub.text.length - 1, Math.round(ratio * sub.text.length)));
    // pushUndo는 호출부에서 미리 실행
    await state.splitScene(sceneId, charPos);
  },

  pushUndo: () => {
    const state = get();
    const snapshot = {
      sceneSubtitles: JSON.parse(JSON.stringify(state.sceneSubtitles)),
      sceneOrder: [...state.sceneOrder],
      scenesJson: JSON.stringify(useProjectStore.getState().scenes),
      linesJson: JSON.stringify(useSoundStudioStore.getState().lines),
    };
    const stack = [...state._undoStack, snapshot];
    if (stack.length > 50) stack.shift();
    set({ _undoStack: stack, _redoStack: [] });
  },

  undo: () => {
    const state = get();
    if (state._undoStack.length === 0) return;
    const stack = [...state._undoStack];
    const snapshot = stack.pop()!;
    // 현재 상태를 redo 스택에 저장
    const currentSnapshot = {
      sceneSubtitles: JSON.parse(JSON.stringify(state.sceneSubtitles)),
      sceneOrder: [...state.sceneOrder],
      scenesJson: JSON.stringify(useProjectStore.getState().scenes),
      linesJson: JSON.stringify(useSoundStudioStore.getState().lines),
    };
    // projectStore scenes 전체 복원 (분할로 추가된 장면 제거 포함)
    useProjectStore.getState().setScenes(JSON.parse(snapshot.scenesJson));
    // soundStudioStore lines 전체 복원
    useSoundStudioStore.getState().setLines(JSON.parse(snapshot.linesJson));
    set({
      sceneSubtitles: snapshot.sceneSubtitles,
      sceneOrder: snapshot.sceneOrder,
      _undoStack: stack,
      _redoStack: [...state._redoStack, currentSnapshot],
    });
    persistSceneOrder(snapshot.sceneOrder);
  },

  redo: () => {
    const state = get();
    if (state._redoStack.length === 0) return;
    const stack = [...state._redoStack];
    const snapshot = stack.pop()!;
    const currentSnapshot = {
      sceneSubtitles: JSON.parse(JSON.stringify(state.sceneSubtitles)),
      sceneOrder: [...state.sceneOrder],
      scenesJson: JSON.stringify(useProjectStore.getState().scenes),
      linesJson: JSON.stringify(useSoundStudioStore.getState().lines),
    };
    useProjectStore.getState().setScenes(JSON.parse(snapshot.scenesJson));
    useSoundStudioStore.getState().setLines(JSON.parse(snapshot.linesJson));
    set({
      sceneSubtitles: snapshot.sceneSubtitles,
      sceneOrder: snapshot.sceneOrder,
      _undoStack: [...state._undoStack, currentSnapshot],
      _redoStack: stack,
    });
    persistSceneOrder(snapshot.sceneOrder);
  },

  splitSubtitlesByCharsPerLine: () => {
    const state = get();
    const cpl = state.charsPerLine;
    let totalSegments = 0;

    const updated = { ...state.sceneSubtitles };

    state.sceneOrder.forEach((sceneId) => {
      const sub = updated[sceneId];
      if (!sub?.text?.trim()) return;

      // 줄바꿈 제거 후 분할
      const rawText = sub.text.replace(/\n/g, ' ').trim();
      if (rawText.length <= cpl) return; // 분할 불필요

      // [FIX #410/#415] 한국어 자막 분할 — 단어 중간 절단 방지
      let lines: string[];
      if (rawText.includes(' ')) {
        // 띄어쓰기가 있으면 단어 기반 분할
        const words = rawText.split(' ');
        lines = [];
        let cur = '';
        for (const w of words) {
          if (cur && (cur + ' ' + w).length > cpl) { lines.push(cur); cur = w; }
          else cur = cur ? cur + ' ' + w : w;
        }
        if (cur) lines.push(cur);
      } else {
        // 공백 없는 텍스트 (한국어) → 문장 부호/종결 어미 기준 분할
        lines = [];
        let remaining = rawText;
        while (remaining.length > cpl) {
          let breakIdx = -1;
          // cpl 범위 내에서 자연스러운 분할점 탐색 (뒤에서부터)
          const searchEnd = Math.min(remaining.length, cpl + 5); // 약간의 여유
          for (let k = Math.min(searchEnd, remaining.length) - 1; k >= Math.max(0, cpl - 8); k--) {
            const ch = remaining[k];
            // 문장부호 또는 한국어 종결 어미 뒤에서 분할
            if ('.!?。！？,，、;；:：)）」』'.includes(ch)) { breakIdx = k + 1; break; }
            // 한국어 종결 어미: 다, 요, 죠, 고, 며, 서, 는, 을, 를, 에, 로
            if (k > 0 && '다요죠고며서'.includes(ch) && k < searchEnd - 1) { breakIdx = k + 1; break; }
          }
          if (breakIdx <= 0 || breakIdx > cpl + 5) breakIdx = cpl; // 적절한 분할점 없으면 글자 수 기반
          lines.push(remaining.slice(0, breakIdx).trim());
          remaining = remaining.slice(breakIdx).trim();
        }
        if (remaining) lines.push(remaining);
      }

      if (lines.length <= 1) return;

      // 시간 균등 분배
      const totalDur = sub.endTime - sub.startTime;
      const segDur = totalDur / lines.length;
      const segments: SubtitleSegment[] = lines.map((text, i) => ({
        text,
        startTime: sub.startTime + segDur * i,
        endTime: sub.startTime + segDur * (i + 1),
      }));

      updated[sceneId] = { ...sub, segments };
      totalSegments += segments.length;
    });

    set({ sceneSubtitles: updated });
    return totalSegments;
  },

  regenerateMotions: () => {
    const scenes = useProjectStore.getState().scenes;
    const sceneOrder = get().sceneOrder;
    if (scenes.length === 0) return;

    // 기존 효과에 랜덤 시드를 주입하여 다른 결과가 나오도록 셔플
    const shuffled = scenes.map((s) => ({
      visualPrompt: s.visualPrompt || '',
      scriptText: s.scriptText || '',
      sceneType: s.sceneType,
      castType: s.castType,
      shotSize: s.shotSize,
      cameraAngle: s.cameraAngle,
      entityComposition: s.entityComposition,
      characterPresent: s.characterPresent,
      cameraMovement: s.cameraMovement,
    }));

    const newMotions = assignSmartMotions(shuffled);
    const currentEffects = get().sceneEffects;
    const updated: Record<string, SceneEffectConfig> = {};

    // sceneOrder 기준으로 매칭
    const ordered = sceneOrder.length > 0
      ? sceneOrder.map((id) => scenes.find((s) => s.id === id)).filter(Boolean) as typeof scenes
      : scenes;

    ordered.forEach((scene, idx) => {
      const motion = newMotions[idx];
      const prev = currentEffects[scene.id];
      // 이전과 동일한 프리셋이면 대안에서 선택
      let pz = motion?.panZoomPreset || 'smooth';
      let mo = motion?.motionEffect || 'none';
      if (prev && pz === prev.panZoomPreset) {
        // 풀에서 이전과 다른 프리셋 선택
        const pool = ['smooth', 'cinematic', 'documentary', 'dreamy', 'dramatic', 'vintage',
          'zoom', 'reveal', 'dynamic', 'fast', 'timelapse', 'vlog', 'noir',
          'diagonal-drift', 'orbit', 'parallax', 'tilt-shift',
          'spiral-in', 'push-pull', 'dolly-zoom', 'crane-up'];
        const candidates = pool.filter((p) => p !== prev.panZoomPreset);
        pz = candidates[(idx * 7 + Date.now()) % candidates.length];
      }
      if (prev && mo === prev.motionEffect) {
        const mPool = ['fade', 'micro', 'slow', 'pan', 'crossfade', 'film',
          'rotate', 'shake', 'sepia', 'glitch', 'rotate-plus',
          'high-contrast', 'multi-bright', 'rain', 'vintage-style'];
        const mCandidates = mPool.filter((m) => m !== prev.motionEffect);
        mo = mCandidates[(idx * 7 + Date.now()) % mCandidates.length];
      }
      updated[scene.id] = {
        panZoomPreset: pz,
        motionEffect: mo,
        anchorX: motion?.anchorX ?? prev?.anchorX ?? 50,
        anchorY: motion?.anchorY ?? prev?.anchorY ?? 45,
        anchorLabel: motion?.anchorLabel || prev?.anchorLabel || '프레임 중심',
      };
    });

    set({ sceneEffects: updated });
  },

  reset: () => set({ ...INITIAL_STATE }),
})));
