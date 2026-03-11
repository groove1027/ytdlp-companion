/**
 * editPointStore.ts
 * 편집점 매칭 위저드 상태 관리
 */

import { create } from 'zustand';
import {
  EditPointStep,
  EditPointExportMode,
  SourceVideoFile,
  EdlEntry,
  VideoTimedFrame,
} from '../types';
import {
  parseEditTableWithAI,
  refineTimecodeWithVision,
  generateFFmpegScript,
  generateEdlFile,
  generateNarrationSrt,
  estimateNarrationDuration,
  calcAutoSpeedFactor,
} from '../services/editPointService';
import { removeSubtitlesWithGhostCut } from '../services/ghostcutService';
import { showToast } from './uiStore';

interface EditPointStore {
  // 위저드
  step: EditPointStep;

  // Step 1: 등록
  sourceVideos: SourceVideoFile[];
  rawEditTable: string;
  rawNarration: string;

  // Step 2: 매핑
  edlEntries: EdlEntry[];
  sourceMapping: Record<string, string>; // sourceId → videoId

  // 처리 상태
  processingPhase: string;
  processingProgress: number;
  processingMessage: string;
  isProcessing: boolean;

  // Step 3: 내보내기
  exportMode: EditPointExportMode;
  totalSourceSizeMB: number;

  // 자막 제거
  cleanSubtitles: boolean;
  cleanProgress: number; // 0~100
  cleanMessage: string;
  isCleaning: boolean;

  // Actions
  setStep: (step: EditPointStep) => void;
  addSourceVideos: (files: File[]) => Promise<void>;
  removeSourceVideo: (id: string) => void;
  setSourceId: (videoId: string, sourceId: string) => void;
  setRawEditTable: (text: string) => void;
  setRawNarration: (text: string) => void;
  parseEditTable: () => Promise<void>;
  autoMapSources: () => void;
  setSourceMapping: (sourceId: string, videoId: string) => void;
  updateEdlEntry: (id: string, partial: Partial<EdlEntry>) => void;
  refineTimecodes: () => Promise<void>;
  autoCalcSpeed: () => void;
  applyAutoSpeed: () => void;
  setExportMode: (mode: EditPointExportMode) => void;
  setCleanSubtitles: (enabled: boolean) => void;
  runCleanSubtitles: () => Promise<void>;
  exportResult: () => Promise<void>;
  /** 영상분석실에서 편집점 데이터 임포트 */
  importFromVideoAnalysis: (data: {
    frames: VideoTimedFrame[];
    videoBlob: Blob | null;
    videoFile: File | null;
    editTableText: string;
    narrationText: string;
  }) => Promise<void>;
  reset: () => void;
}

/** 비디오 파일에서 duration 추출 */
function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      const dur = video.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(dur) ? dur : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

/** 비디오 첫 프레임 썸네일 생성 */
function getVideoThumbnail(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.preload = 'auto';

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      canvas.width = 160;
      canvas.height = 90;
      ctx?.drawImage(video, 0, 0, 160, 90);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

/** 비디오 파일에서 width/height 추출 */
function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1920, height: 1080 });
    };
  });
}

/** 파일 다운로드 헬퍼 */
function downloadFile(content: string, filename: string, mimeType: string, addBom = false) {
  // BOM은 EDL/SRT 전용 — sh/txt 등에는 붙이면 안 됨
  const prefix = addBom ? '\uFEFF' : '';
  const blob = new Blob([prefix + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const useEditPointStore = create<EditPointStore>((set, get) => ({
  step: 'register',
  sourceVideos: [],
  rawEditTable: '',
  rawNarration: '',
  edlEntries: [],
  sourceMapping: {},
  processingPhase: '',
  processingProgress: 0,
  processingMessage: '',
  isProcessing: false,
  exportMode: 'edl-file',
  totalSourceSizeMB: 0,
  cleanSubtitles: false,
  cleanProgress: 0,
  cleanMessage: '',
  isCleaning: false,

  setStep: (step) => set({ step }),

  addSourceVideos: async (files) => {
    const newVideos: SourceVideoFile[] = [];
    const existingCount = get().sourceVideos.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      const [duration, thumbnail] = await Promise.all([
        getVideoDuration(file),
        getVideoThumbnail(file),
      ]);

      newVideos.push({
        id: `sv-${Date.now()}-${i}`,
        sourceId: `S-${String(existingCount + i + 1).padStart(2, '0')}`,
        file,
        blobUrl: URL.createObjectURL(file),
        fileName: file.name,
        fileSizeMB: sizeMB,
        durationSec: duration,
        thumbnailDataUrl: thumbnail,
      });
    }

    set((state) => {
      const all = [...state.sourceVideos, ...newVideos];
      const total = all.reduce((sum, v) => sum + v.fileSizeMB, 0);
      return { sourceVideos: all, totalSourceSizeMB: Math.round(total * 10) / 10 };
    });
  },

  removeSourceVideo: (id) => {
    const video = get().sourceVideos.find((v) => v.id === id);
    if (video) URL.revokeObjectURL(video.blobUrl);
    set((state) => {
      const filtered = state.sourceVideos.filter((v) => v.id !== id);
      const total = filtered.reduce((sum, v) => sum + v.fileSizeMB, 0);
      return { sourceVideos: filtered, totalSourceSizeMB: Math.round(total * 10) / 10 };
    });
  },

  setSourceId: (videoId, sourceId) => {
    set((state) => ({
      sourceVideos: state.sourceVideos.map((v) =>
        v.id === videoId ? { ...v, sourceId } : v
      ),
    }));
  },

  setRawEditTable: (text) => set({ rawEditTable: text }),
  setRawNarration: (text) => set({ rawNarration: text }),

  parseEditTable: async () => {
    const { rawEditTable, rawNarration, isProcessing } = get();

    // 중복 요청 방지
    if (isProcessing) {
      showToast('이미 파싱이 진행 중입니다. 잠시 기다려주세요.');
      return;
    }

    if (!rawEditTable.trim()) {
      showToast('편집표를 입력해주세요.');
      return;
    }

    set({
      isProcessing: true,
      processingPhase: 'parsing',
      processingProgress: 0,
      processingMessage: 'AI가 편집표를 분석하고 있습니다...',
    });

    try {
      const entries = await parseEditTableWithAI(rawEditTable, rawNarration);
      set({
        edlEntries: entries,
        isProcessing: false,
        processingPhase: '',
        processingProgress: 100,
        processingMessage: '',
        step: 'mapping',
      });

      // 자동 소스 매핑 실행
      get().autoMapSources();

      showToast(`${entries.length}개 편집 항목을 파싱했습니다.`);
    } catch (err) {
      set({ isProcessing: false, processingPhase: '', processingMessage: '' });
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate') || errMsg.toLowerCase().includes('too many')) {
        showToast('AI 서버가 바빠요. 30초 후 다시 시도해주세요.');
      } else if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out')) {
        showToast('편집표가 너무 크거나 서버 응답이 느립니다. 잠시 후 다시 시도해주세요.');
      } else {
        showToast('편집표 파싱 실패: ' + errMsg);
      }
    }
  },

  autoMapSources: () => {
    const { edlEntries, sourceVideos } = get();
    const mapping: Record<string, string> = {};

    // [FIX] 소스 영상이 1개면 모든 EDL 항목을 해당 영상에 자동 매핑
    if (sourceVideos.length === 1) {
      const singleVideo = sourceVideos[0];
      for (const entry of edlEntries) {
        mapping[entry.sourceId] = singleVideo.id;
      }
      set({ sourceMapping: mapping });
      return;
    }

    // [FIX] sourceId 정규화: "S-1", "S-01", "s-01", "S01" → "S-01" 통일
    const normalizeSourceId = (id: string): string => {
      const cleaned = id.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const match = cleaned.match(/^([A-Z]*)(\d+)$/);
      if (match) {
        const prefix = match[1] || 'S';
        const num = match[2].padStart(2, '0');
        return `${prefix}-${num}`;
      }
      return id.trim().toUpperCase();
    };

    for (const entry of edlEntries) {
      const normalizedEntry = normalizeSourceId(entry.sourceId);
      // 정확 매칭 → 정규화 매칭 순서
      const match = sourceVideos.find((v) => v.sourceId === entry.sourceId)
        || sourceVideos.find((v) => normalizeSourceId(v.sourceId) === normalizedEntry);
      if (match) {
        mapping[entry.sourceId] = match.id;
      }
    }

    set({ sourceMapping: mapping });
  },

  setSourceMapping: (sourceId, videoId) => {
    set((state) => ({
      sourceMapping: { ...state.sourceMapping, [sourceId]: videoId },
    }));
  },

  updateEdlEntry: (id, partial) => {
    set((state) => ({
      edlEntries: state.edlEntries.map((e) =>
        e.id === id ? { ...e, ...partial } : e
      ),
    }));
  },

  refineTimecodes: async () => {
    const { edlEntries, sourceMapping, sourceVideos } = get();

    set({
      isProcessing: true,
      processingPhase: 'refining',
      processingProgress: 0,
      processingMessage: 'AI 타임코드 정제 시작...',
    });

    // [FIX] 개별 항목 에러 처리 — 한 항목 실패해도 나머지 계속 진행
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < edlEntries.length; i++) {
      const entry = edlEntries[i];
      const videoId = sourceMapping[entry.sourceId];
      const video = sourceVideos.find((v) => v.id === videoId);

      set({
        processingProgress: Math.round((i / edlEntries.length) * 100),
        processingMessage: `${i + 1}/${edlEntries.length} 정제 중: ${entry.order}`,
      });

      if (!video) {
        failCount++;
        continue;
      }

      try {
        const result = await refineTimecodeWithVision(entry, video.file);

        set((state) => ({
          edlEntries: state.edlEntries.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  refinedTimecodeStart: result.refinedStart,
                  refinedTimecodeEnd: result.refinedEnd,
                  refinedConfidence: result.confidence,
                  referenceFrameUrl: result.referenceFrameUrl,
                }
              : e
          ),
        }));
        successCount++;
      } catch (entryErr) {
        failCount++;
        console.error(`[EditPoint] 정제 실패 (${entry.order}):`, entryErr);
      }
    }

    set({
      isProcessing: false,
      processingPhase: '',
      processingProgress: 100,
      processingMessage: '',
    });

    if (failCount > 0) {
      showToast(`타임코드 정제: ${successCount}개 성공, ${failCount}개 실패`);
    } else {
      showToast('타임코드 정제 완료!');
    }
  },

  autoCalcSpeed: () => {
    const { edlEntries } = get();
    const updated = edlEntries.map((entry) => {
      const narDur = estimateNarrationDuration(entry.narrationText);
      const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
      const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
      const autoFactor = calcAutoSpeedFactor(narDur, start, end);
      return {
        ...entry,
        narrationDurationSec: Math.round(narDur * 10) / 10,
        autoSpeedFactor: autoFactor,
      };
    });
    set({ edlEntries: updated });

    const adjusted = updated.filter((e) => e.autoSpeedFactor !== undefined && e.autoSpeedFactor < 1.0);
    if (adjusted.length > 0) {
      showToast(`${adjusted.length}개 클립에 슬로우 배속이 필요합니다. "적용" 버튼을 눌러 반영하세요.`);
    } else {
      showToast('모든 클립이 나레이션 길이 이내입니다. 속도 조절이 필요 없습니다.');
    }
  },

  applyAutoSpeed: () => {
    const { edlEntries } = get();
    const updated = edlEntries.map((entry) => {
      if (entry.autoSpeedFactor != null && entry.autoSpeedFactor < 1.0) {
        return { ...entry, speedFactor: entry.autoSpeedFactor };
      }
      return entry;
    });
    set({ edlEntries: updated });
    const count = updated.filter((e) => e.autoSpeedFactor != null && e.autoSpeedFactor < 1.0).length;
    showToast(`${count}개 클립에 자동 슬로우 배속이 적용되었습니다.`);
  },

  setExportMode: (mode) => set({ exportMode: mode }),

  setCleanSubtitles: (enabled) => set({ cleanSubtitles: enabled }),

  runCleanSubtitles: async () => {
    const { sourceVideos, sourceMapping } = get();

    // 매핑된 고유 소스 비디오만 추출
    const mappedVideoIds = new Set(Object.values(sourceMapping));
    const videosToClean = sourceVideos.filter(
      (v) => mappedVideoIds.has(v.id) && !v.cleanedBlobUrl
    );

    if (videosToClean.length === 0) {
      showToast('정리할 소스 영상이 없습니다.');
      return;
    }

    set({
      isCleaning: true,
      cleanProgress: 0,
      cleanMessage: `자막 제거 준비 중... (총 ${videosToClean.length}개, 영상당 5~15분 소요)`,
    });

    try {
      for (let i = 0; i < videosToClean.length; i++) {
        const video = videosToClean[i];
        const pct = Math.round((i / videosToClean.length) * 100);
        set({
          cleanProgress: pct,
          cleanMessage: `[${i + 1}/${videosToClean.length}] ${video.fileName} — AI 자막 제거 진행 중 (영상당 5~15분 소요)`,
        });

        // 비디오 메타 정보로 width/height 추출
        const dims = await getVideoDimensions(video.file);
        const blob = new Blob([await video.file.arrayBuffer()], { type: video.file.type });

        const cleanedBlob = await removeSubtitlesWithGhostCut(
          blob,
          dims.width,
          dims.height,
          (msg) => set({ cleanMessage: `[${i + 1}/${videosToClean.length}] ${msg}` }),
        );

        const cleanedUrl = URL.createObjectURL(cleanedBlob);
        set((state) => ({
          sourceVideos: state.sourceVideos.map((v) =>
            v.id === video.id ? { ...v, cleanedBlobUrl: cleanedUrl } : v
          ),
        }));
      }

      set({ cleanProgress: 100, cleanMessage: '모든 소스 자막 제거 완료!', isCleaning: false });
      showToast('소스 영상 자막 제거가 완료되었습니다.');
    } catch (err) {
      set({ isCleaning: false, cleanMessage: '' });
      showToast('자막 제거 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  },

  exportResult: async () => {
    const { exportMode, edlEntries, sourceMapping, sourceVideos } = get();

    // 파일명 매핑 (videoId → fileName)
    const fileNameMapping: Record<string, string> = {};
    for (const [sourceId, videoId] of Object.entries(sourceMapping)) {
      const video = sourceVideos.find((v) => v.id === videoId);
      fileNameMapping[sourceId] = video?.fileName || sourceId;
    }

    switch (exportMode) {
      case 'ffmpeg-script': {
        try {
          const script = generateFFmpegScript(edlEntries, fileNameMapping);
          downloadFile(script, 'edit_script.sh', 'text/x-shellscript');
          showToast('FFmpeg 스크립트가 다운로드되었습니다.');
        } catch (err) {
          showToast('FFmpeg 스크립트 생성 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
        }
        break;
      }
      case 'edl-file': {
        const edl = generateEdlFile(edlEntries, fileNameMapping);
        const srt = generateNarrationSrt(edlEntries);
        downloadFile(edl, 'edit_decision_list.edl', 'text/plain', true);
        downloadFile(srt, 'narration.srt', 'text/plain', true);
        showToast('EDL + SRT 파일이 다운로드되었습니다.');
        break;
      }
      case 'push-to-timeline':
      case 'direct-mp4': {
        // [FIX #98] require() → ES dynamic import (프로덕션 빌드 호환)
        try {
          const [
            { useProjectStore },
            { useSoundStudioStore },
            { useEditRoomStore },
            { useNavigationStore },
          ] = await Promise.all([
            import('./projectStore'),
            import('./soundStudioStore'),
            import('./editRoomStore'),
            import('./navigationStore'),
          ]);

          const now = Date.now();
          const newScenes = edlEntries.map((entry, i) => {
            const mappedVideoId = sourceMapping[entry.sourceId];
            const sourceVideo = sourceVideos.find(v => v.id === mappedVideoId);
            const videoUrl = sourceVideo?.cleanedBlobUrl || sourceVideo?.blobUrl;
            const duration = (entry.refinedTimecodeEnd ?? entry.timecodeEnd) - (entry.refinedTimecodeStart ?? entry.timecodeStart);

            return {
              id: `s-${now}-${i + 1}`,
              scriptText: entry.narrationText || '',
              visualPrompt: '',
              visualDescriptionKO: entry.sourceDescription || '',
              characterPresent: false,
              isGeneratingImage: false,
              isGeneratingVideo: false,
              videoUrl,
              startTime: entry.refinedTimecodeStart ?? entry.timecodeStart,
              endTime: entry.refinedTimecodeEnd ?? entry.timecodeEnd,
              audioDuration: entry.narrationDurationSec || duration,
              referenceImage: entry.referenceFrameUrl,
              imageUrl: entry.referenceFrameUrl || sourceVideo?.thumbnailDataUrl,
            };
          });

          useProjectStore.getState().setScenes(newScenes);

          const newLines = newScenes.map((scene, i) => ({
            id: `line-${now}-${i}`,
            speakerId: '',
            text: scene.scriptText,
            index: i,
            sceneId: scene.id,
            audioUrl: undefined as string | undefined,
            duration: scene.audioDuration,
            startTime: scene.startTime,
            endTime: scene.endTime,
            ttsStatus: 'idle' as const,
          }));
          useSoundStudioStore.getState().setLines(newLines);

          useEditRoomStore.getState().setEditRoomSubTab('timeline');
          useNavigationStore.getState().setActiveTab('edit-room');

          const msg = exportMode === 'direct-mp4'
            ? '타임라인으로 전송되었습니다. 내보내기 버튼으로 MP4를 생성하세요!'
            : '편집점이 타임라인으로 전송되었습니다! 미리보기 후 MP4로 내보낼 수 있습니다.';
          showToast(msg);
        } catch (err) {
          showToast('타임라인 전송 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
        }
        break;
      }
    }
  },

  importFromVideoAnalysis: async (data) => {
    const { frames, videoBlob, videoFile, editTableText, narrationText } = data;

    // 편집표 + 나레이션 텍스트 설정
    set({ rawEditTable: editTableText, rawNarration: narrationText });

    // 영상 파일이 있으면 소스로 등록
    if (videoFile) {
      await get().addSourceVideos([videoFile]);
    } else if (videoBlob) {
      const file = new File([videoBlob], 'video-analysis-source.mp4', { type: 'video/mp4' });
      await get().addSourceVideos([file]);
    } else {
      showToast('소스 영상이 없습니다. 편집점 매칭 Step 1에서 영상을 직접 업로드해주세요.');
    }

    // 편집표 자동 파싱
    if (editTableText.trim()) {
      await get().parseEditTable();
    }
  },

  reset: () => {
    // blob URL 정리
    get().sourceVideos.forEach((v) => {
      URL.revokeObjectURL(v.blobUrl);
      if (v.cleanedBlobUrl) URL.revokeObjectURL(v.cleanedBlobUrl);
    });
    set({
      step: 'register',
      sourceVideos: [],
      rawEditTable: '',
      rawNarration: '',
      edlEntries: [],
      sourceMapping: {},
      processingPhase: '',
      processingProgress: 0,
      processingMessage: '',
      isProcessing: false,
      exportMode: 'edl-file',
      totalSourceSizeMB: 0,
      cleanSubtitles: false,
      cleanProgress: 0,
      cleanMessage: '',
      isCleaning: false,
    });
  },
}));
