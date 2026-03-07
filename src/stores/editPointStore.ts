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
} from '../types';
import {
  parseEditTableWithAI,
  refineTimecodeWithVision,
  generateFFmpegScript,
  generateEdlFile,
  generateNarrationSrt,
} from '../services/editPointService';
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
  setExportMode: (mode: EditPointExportMode) => void;
  exportResult: () => void;
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

/** 파일 다운로드 헬퍼 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
    const { rawEditTable, rawNarration } = get();
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
      showToast('편집표 파싱 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  },

  autoMapSources: () => {
    const { edlEntries, sourceVideos } = get();
    const mapping: Record<string, string> = {};

    for (const entry of edlEntries) {
      // sourceId가 일치하는 비디오 찾기
      const match = sourceVideos.find((v) => v.sourceId === entry.sourceId);
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

    try {
      for (let i = 0; i < edlEntries.length; i++) {
        const entry = edlEntries[i];
        const videoId = sourceMapping[entry.sourceId];
        const video = sourceVideos.find((v) => v.id === videoId);

        set({
          processingProgress: Math.round((i / edlEntries.length) * 100),
          processingMessage: `${i + 1}/${edlEntries.length} 정제 중: ${entry.order}`,
        });

        if (!video) continue;

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
      }

      set({
        isProcessing: false,
        processingPhase: '',
        processingProgress: 100,
        processingMessage: '',
      });

      showToast('타임코드 정제 완료!');
    } catch (err) {
      set({ isProcessing: false, processingPhase: '', processingMessage: '' });
      showToast('타임코드 정제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  },

  setExportMode: (mode) => set({ exportMode: mode }),

  exportResult: () => {
    const { exportMode, edlEntries, sourceMapping, sourceVideos } = get();

    // 파일명 매핑 (videoId → fileName)
    const fileNameMapping: Record<string, string> = {};
    for (const [sourceId, videoId] of Object.entries(sourceMapping)) {
      const video = sourceVideos.find((v) => v.id === videoId);
      fileNameMapping[sourceId] = video?.fileName || sourceId;
    }

    switch (exportMode) {
      case 'ffmpeg-script': {
        const script = generateFFmpegScript(edlEntries, fileNameMapping);
        downloadFile(script, 'edit_script.sh', 'text/x-shellscript');
        showToast('FFmpeg 스크립트가 다운로드되었습니다.');
        break;
      }
      case 'edl-file': {
        const edl = generateEdlFile(edlEntries, fileNameMapping);
        const srt = generateNarrationSrt(edlEntries);
        downloadFile(edl, 'edit_decision_list.edl', 'text/plain');
        downloadFile(srt, 'narration.srt', 'text/plain');
        showToast('EDL + SRT 파일이 다운로드되었습니다.');
        break;
      }
      case 'push-to-timeline': {
        showToast('타임라인으로 전송되었습니다.');
        break;
      }
      case 'direct-mp4': {
        showToast('브라우저 MP4 합성은 준비 중입니다.');
        break;
      }
    }
  },

  reset: () => {
    // blob URL 정리
    get().sourceVideos.forEach((v) => URL.revokeObjectURL(v.blobUrl));
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
    });
  },
}));
