/**
 * editPointStore.ts
 * 편집점 매칭 위저드 상태 관리
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
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
  generateEditTableFromNarration,
} from '../services/editPointService';
import { removeSubtitlesWithGhostCut } from '../services/ghostcutService';
import { downloadVideoViaProxy, downloadSocialVideo } from '../services/ytdlpApiService';
import { showToast } from './uiStore';
import { logger } from '../services/LoggerService';

interface EditPointStore {
  // 위저드
  step: EditPointStep;

  // Step 1: 등록
  sourceVideos: SourceVideoFile[];
  rawEditTable: string;
  rawNarration: string;

  // Step 1: URL 입력 모드
  sourceInputMode: 'file' | 'url';
  rawUrls: string;
  isDownloadingUrls: boolean;
  urlDownloadProgress: number;
  urlDownloadMessage: string;

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
  setSourceInputMode: (mode: 'file' | 'url') => void;
  setRawUrls: (text: string) => void;
  /** YouTube/소셜 URL 배열로 영상 다운로드 → 소스 등록 */
  downloadFromUrls: () => Promise<void>;
  /** 대본(내레이션) + 소스 영상 정보로 편집표 자동 생성 */
  autoGenerateEditTable: () => Promise<void>;
  parseEditTable: () => Promise<void>;
  autoMapSources: () => void;
  setSourceMapping: (sourceId: string, videoId: string) => void;
  updateEdlEntry: (id: string, partial: Partial<EdlEntry>) => void;
  refineTimecodes: () => Promise<void>;
  autoCalcSpeed: () => void;
  applyAutoSpeed: () => void;
  setExportMode: (mode: EditPointExportMode) => void;
  /** WebCodecs로 영상을 클립별로 잘라 ZIP 다운로드 (폴백: FFmpeg 스크립트) */
  quickExportClips: () => Promise<void>;
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

/** 비디오 파일에서 duration 추출 (8초 타임아웃) */
function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    logger.registerBlobUrl(url, 'video', 'editPointStore:getVideoDuration');
    video.src = url;

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      logger.unregisterBlobUrl(url);
      URL.revokeObjectURL(url);
    };

    // [FIX #310] 8초 타임아웃 — onloadedmetadata 미발화 시 무한대기 방지
    const timeout = setTimeout(() => {
      if (!settled) {
        console.warn('[EditPoint] getVideoDuration 타임아웃 (8s)');
        cleanup();
        resolve(null);
      }
    }, 8000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const dur = video.duration;
      cleanup();
      resolve(isFinite(dur) ? dur : null);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(null);
    };
  });
}

/** 비디오 첫 프레임 썸네일 생성 — WebCodecs 우선 → Canvas 폴백 (8초 타임아웃) */
async function getVideoThumbnail(file: File): Promise<string | undefined> {
  // ── WebCodecs 정밀 추출 우선 ──
  try {
    const { webcodecExtractFrames, isVideoDecoderSupported } =
      await import('../services/webcodecs/videoDecoder');

    if (isVideoDecoderSupported()) {
      const frames = await webcodecExtractFrames(file, [0.1], { thumbWidth: 160, thumbQuality: 0.6 });
      if (frames.length > 0) return frames[0].url;
    }
  } catch {
    // WebCodecs 실패 → canvas 폴백
  }

  // ── Canvas 폴백 (8초 타임아웃 — onseeked 미발화 시 무한대기 방지) ──
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const url = URL.createObjectURL(file);
    logger.registerBlobUrl(url, 'video', 'editPointStore:getVideoThumbnail');
    video.src = url;
    video.muted = true;
    video.preload = 'auto';

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      logger.unregisterBlobUrl(url);
      URL.revokeObjectURL(url);
    };

    // [FIX #310] 8초 타임아웃 — 특정 코덱/브라우저에서 onseeked 미발화 시 무한대기 방지
    const timeout = setTimeout(() => {
      if (!settled) {
        console.warn('[EditPoint] getVideoThumbnail 타임아웃 (8s)');
        cleanup();
        resolve(undefined);
      }
    }, 8000);

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const vw = video.videoWidth || 160;
      const vh = video.videoHeight || 90;
      const scale = 160 / Math.max(vw, vh);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      cleanup();
      resolve(dataUrl);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(undefined);
    };
  });
}

/** 비디오 파일에서 width/height 추출 (8초 타임아웃) */
function getVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    logger.registerBlobUrl(url, 'video', 'editPointStore:getVideoDimensions');
    video.src = url;

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      logger.unregisterBlobUrl(url);
      URL.revokeObjectURL(url);
    };

    // [FIX #310] 8초 타임아웃 — onloadedmetadata 미발화 시 무한대기 방지
    const timeout = setTimeout(() => {
      if (!settled) {
        console.warn('[EditPoint] getVideoDimensions 타임아웃 (8s)');
        cleanup();
        resolve({ width: 1920, height: 1080 });
      }
    }, 8000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      cleanup();
      resolve({ width: w, height: h });
    };
    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
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
  logger.registerBlobUrl(url, 'other', 'editPointStore:downloadFile');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }, 5000);
}

export const useEditPointStore = create<EditPointStore>()(immer((set, get) => ({
  step: 'register',
  sourceVideos: [],
  rawEditTable: '',
  rawNarration: '',
  sourceInputMode: 'file',
  rawUrls: '',
  isDownloadingUrls: false,
  urlDownloadProgress: 0,
  urlDownloadMessage: '',
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

  setStep: (step) => { logger.trackTabVisit('edit-point', step); set({ step }); },

  addSourceVideos: async (files) => {
    const newVideos: SourceVideoFile[] = [];
    const existingCount = get().sourceVideos.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10;

      // [FIX #310] Promise.allSettled → 하나 실패해도 나머지 결과 사용 (무한대기 방지)
      const results = await Promise.allSettled([
        getVideoDuration(file),
        getVideoThumbnail(file),
        getVideoDimensions(file),
      ]);
      const duration = results[0].status === 'fulfilled' ? results[0].value : null;
      const thumbnail = results[1].status === 'fulfilled' ? results[1].value : undefined;
      const dims = results[2].status === 'fulfilled' ? results[2].value : { width: 1920, height: 1080 };

      const blobUrl = URL.createObjectURL(file);
      logger.registerBlobUrl(blobUrl, 'video', 'editPointStore:addSourceVideos', sizeMB);
      newVideos.push({
        id: `sv-${Date.now()}-${i}`,
        sourceId: `S-${String(existingCount + i + 1).padStart(2, '0')}`,
        file,
        blobUrl,
        fileName: file.name,
        fileSizeMB: sizeMB,
        durationSec: duration,
        width: dims.width,
        height: dims.height,
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
    if (video) {
      logger.unregisterBlobUrl(video.blobUrl);
      URL.revokeObjectURL(video.blobUrl);
    }
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
  setSourceInputMode: (mode) => set({ sourceInputMode: mode }),
  setRawUrls: (text) => set({ rawUrls: text }),

  downloadFromUrls: async () => {
    const { rawUrls, isDownloadingUrls } = get();
    if (isDownloadingUrls) {
      showToast('이미 다운로드 중입니다.');
      return;
    }

    const urls = rawUrls.split('\n').map(l => l.trim()).filter(Boolean);
    if (urls.length === 0) {
      showToast('URL을 한 줄에 하나씩 입력해주세요.');
      return;
    }

    set({ isDownloadingUrls: true, urlDownloadProgress: 0, urlDownloadMessage: `${urls.length}개 영상 다운로드 시작...` });

    const files: File[] = [];
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      set({
        urlDownloadProgress: Math.round((i / urls.length) * 100),
        urlDownloadMessage: `[${i + 1}/${urls.length}] 다운로드 중... (영상당 1~3분 소요)`,
      });

      try {
        const isYoutube = /youtube\.com|youtu\.be/i.test(url);
        if (isYoutube) {
          const { blob, info } = await downloadVideoViaProxy(url, '720p', (p) => {
            set({ urlDownloadProgress: Math.round(((i + p) / urls.length) * 100) });
          });
          const title = info?.title || `video-${i + 1}`;
          const safeName = title.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80);
          files.push(new File([blob], `${safeName}.mp4`, { type: 'video/mp4' }));
        } else {
          const { blob, title } = await downloadSocialVideo(url, '720p', (p) => {
            set({ urlDownloadProgress: Math.round(((i + p) / urls.length) * 100) });
          });
          const safeName = (title || `video-${i + 1}`).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80);
          files.push(new File([blob], `${safeName}.mp4`, { type: 'video/mp4' }));
        }
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        logger.warn(`[EditPoint] URL 다운로드 실패 [${i + 1}]: ${msg}`);
      }
    }

    set({ isDownloadingUrls: false, urlDownloadProgress: 100, urlDownloadMessage: '' });

    if (files.length > 0) {
      await get().addSourceVideos(files);
      const resultMsg = failCount > 0
        ? `${files.length}개 성공, ${failCount}개 실패`
        : `${files.length}개 영상이 등록되었습니다.`;
      showToast(resultMsg);
    } else {
      showToast('모든 URL 다운로드에 실패했습니다. URL을 확인해주세요.');
    }
  },

  autoGenerateEditTable: async () => {
    const { rawNarration, sourceVideos, isProcessing } = get();
    if (isProcessing) {
      showToast('이미 처리 중입니다.');
      return;
    }
    if (!rawNarration.trim()) {
      showToast('내레이션 대본을 먼저 입력해주세요.');
      return;
    }
    if (sourceVideos.length === 0) {
      showToast('소스 영상을 먼저 등록해주세요.');
      return;
    }

    set({
      isProcessing: true,
      processingPhase: 'auto-gen',
      processingProgress: 0,
      processingMessage: 'AI가 대본을 분석해 편집표를 생성하고 있습니다...',
    });

    try {
      const sources = sourceVideos.map(v => ({
        sourceId: v.sourceId,
        fileName: v.fileName,
        durationSec: v.durationSec,
      }));
      const table = await generateEditTableFromNarration(rawNarration, sources);
      set({
        rawEditTable: table,
        isProcessing: false,
        processingPhase: '',
        processingProgress: 100,
        processingMessage: '',
      });
      showToast('편집표가 자동 생성되었습니다! 필요시 수정 후 "AI 파싱 실행"을 눌러주세요.');
    } catch (err) {
      set({ isProcessing: false, processingPhase: '', processingMessage: '' });
      showToast('편집표 자동 생성 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    }
  },

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
      // [FIX #135] 소스 영상 최대 duration 전달 → 타임코드 클램핑
      const { sourceVideos } = get();
      const maxDur = sourceVideos.length === 1 && sourceVideos[0].durationSec
        ? sourceVideos[0].durationSec : undefined;
      const entries = await parseEditTableWithAI(rawEditTable, rawNarration, maxDur, (progress, message) => {
        set({ processingProgress: progress, processingMessage: message });
      });

      // [FIX #192] 소스 매핑을 edlEntries와 동일한 set()에서 원자적으로 처리
      // → Step2Mapping이 "매핑 안 됨" 에러를 잠깐 보여주는 깜빡임 방지
      const { sourceVideos: currentSourceVideos } = get();
      const initialMapping: Record<string, string> = {};
      if (currentSourceVideos.length === 1) {
        const singleVideo = currentSourceVideos[0];
        for (const entry of entries) {
          initialMapping[entry.sourceId] = singleVideo.id;
        }
      }

      set({
        edlEntries: entries,
        sourceMapping: initialMapping,
        isProcessing: false,
        processingPhase: '',
        processingProgress: 100,
        processingMessage: '',
        step: 'mapping',
      });

      // 다중 소스인 경우 정규화 매핑 추가 실행
      if (currentSourceVideos.length !== 1) {
        get().autoMapSources();
      }

      // [FIX #215] 편집표 행 수 vs 파싱 결과 수 비교 → 부분 실패 경고
      const rawLines = rawEditTable.split('\n').filter(l => {
        const t = l.trim();
        return t && !(/^[-=|+:\s]+$/.test(t)) && !/^\|?\s*(순서|order|모드|no\b)/i.test(t);
      });
      // 파이프 구분 데이터 행만 카운트 (숫자로 시작하는 행)
      const dataLineCount = rawLines.filter(l => /^\|?\s*\d/.test(l.trim())).length;
      if (dataLineCount > 0 && entries.length < dataLineCount * 0.8) {
        showToast(`${entries.length}/${dataLineCount}개 항목만 파싱되었습니다. 일부 구간이 누락되었을 수 있어요.`);
      } else {
        showToast(`${entries.length}개 편집 항목을 파싱했습니다.`);
      }
    } catch (err) {
      set({ isProcessing: false, processingPhase: '', processingMessage: '' });
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate') || errMsg.toLowerCase().includes('too many')) {
        showToast('AI 서버가 바빠요. 30초 후 다시 시도해주세요.');
      } else if (errMsg.includes('499') || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out') || errMsg.toLowerCase().includes('failed to fetch')) {
        showToast('서버 응답이 느려 시간이 초과되었어요. 잠시 후 다시 시도해주세요.');
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
    const CONCURRENCY = 4; // 동시 Vision API 호출 수 (rate limit 고려)

    set({
      isProcessing: true,
      processingPhase: 'refining',
      processingProgress: 0,
      processingMessage: 'AI 타임코드 정제 시작...',
    });

    // [FIX] 개별 항목 에러 처리 — 한 항목 실패해도 나머지 계속 진행
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;

    // 병렬 배치 처리 (CONCURRENCY개씩 동시 실행)
    for (let batchStart = 0; batchStart < edlEntries.length; batchStart += CONCURRENCY) {
      const batch = edlEntries.slice(batchStart, batchStart + CONCURRENCY);

      set({
        processingProgress: Math.round((batchStart / edlEntries.length) * 100),
        processingMessage: `${batchStart + 1}~${Math.min(batchStart + CONCURRENCY, edlEntries.length)}/${edlEntries.length} 정제 중 (${CONCURRENCY}개 병렬)`,
      });

      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const videoId = sourceMapping[entry.sourceId];
          const video = sourceVideos.find((v) => v.id === videoId);
          if (!video) throw new Error('NO_VIDEO');

          const result = await refineTimecodeWithVision(entry, video.file);
          return { entry, result, video };
        })
      );

      // 배치 결과 반영
      for (const r of results) {
        completedCount++;
        if (r.status === 'fulfilled') {
          const { entry, result, video } = r.value;
          const dur = video.durationSec;
          const clamp = (v: number) => dur ? Math.max(0, Math.min(v, dur)) : v;

          set((state) => ({
            edlEntries: state.edlEntries.map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    refinedTimecodeStart: clamp(result.refinedStart),
                    refinedTimecodeEnd: clamp(result.refinedEnd),
                    refinedConfidence: result.confidence,
                    referenceFrameUrl: result.referenceFrameUrl,
                  }
                : e
            ),
          }));
          successCount++;
        } else {
          failCount++;
          console.error(`[EditPoint] 정제 실패:`, r.reason);
        }
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

  quickExportClips: async () => {
    const { edlEntries, sourceMapping, sourceVideos, isProcessing } = get();
    if (isProcessing) { showToast('이미 처리 중입니다.'); return; }
    if (edlEntries.length === 0) { showToast('편집 항목이 없습니다.'); return; }

    // WebCodecs 지원 확인 (retryImport: 배포 후 chunk 404 자동 복구)
    const { retryImport } = await import('../utils/retryImport');
    const { isClipCutSupported, cutClips } = await retryImport(() => import('../services/webcodecs/clipCutter'));
    if (!isClipCutSupported()) {
      // 폴백: FFmpeg 스크립트 다운로드
      const fileNameMapping: Record<string, string> = {};
      for (const [sourceId, videoId] of Object.entries(sourceMapping)) {
        const video = sourceVideos.find((v) => v.id === videoId);
        fileNameMapping[sourceId] = video?.fileName || sourceId;
      }
      const script = generateFFmpegScript(edlEntries, fileNameMapping);
      downloadFile(script, 'edit_script.sh', 'text/x-shellscript');
      showToast('WebCodecs 미지원 브라우저입니다. FFmpeg 스크립트로 대체합니다.');
      return;
    }

    // 소스 영상 찾기 (첫 번째 매핑된 영상)
    const firstMappedVideoId = Object.values(sourceMapping)[0];
    const sourceVideo = sourceVideos.find((v) => v.id === firstMappedVideoId);
    if (!sourceVideo?.file) { showToast('소스 영상을 찾을 수 없습니다.'); return; }

    set({
      isProcessing: true,
      processingPhase: 'cutting',
      processingProgress: 0,
      processingMessage: '영상 자르기 준비 중...',
    });

    try {
      const clips = edlEntries.map((e) => ({
        label: e.order,
        startSec: e.refinedTimecodeStart ?? e.timecodeStart,
        endSec: e.refinedTimecodeEnd ?? e.timecodeEnd,
      }));

      const zipBlob = await cutClips(sourceVideo.file, clips, (progress, message) => {
        set({ processingProgress: progress, processingMessage: message });
      });

      // ZIP 다운로드
      const url = URL.createObjectURL(zipBlob);
      logger.registerBlobUrl(url, 'other', 'editPointStore:quickExportClips');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edit_clips.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { logger.unregisterBlobUrl(url); URL.revokeObjectURL(url); }, 5000);

      showToast(`${clips.length}개 클립이 ZIP으로 다운로드되었습니다.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      showToast('영상 자르기 실패: ' + msg);
    } finally {
      set({ isProcessing: false, processingPhase: '', processingProgress: 100, processingMessage: '' });
    }
  },

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
          'ko',
          video.durationSec ?? undefined,
        );

        const cleanedUrl = URL.createObjectURL(cleanedBlob);
        logger.registerBlobUrl(cleanedUrl, 'video', 'editPointStore:runCleanSubtitles');
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
      case 'fcp-xml':
      case 'capcut-pkg':
      case 'vrew-pkg': {
        try {
          const { retryImport } = await import('../utils/retryImport');
          const { buildEdlNlePackageZip } = await retryImport(() => import('../services/nleExportService'));
          const target = exportMode === 'fcp-xml' ? 'premiere' : exportMode === 'capcut-pkg' ? 'capcut' : 'vrew';
          const label = exportMode === 'fcp-xml' ? 'Premiere XML' : exportMode === 'capcut-pkg' ? 'CapCut' : 'VREW';
          showToast(`${label} 패키지 생성 중...`);
          const zipBlob = await buildEdlNlePackageZip({
            target,
            entries: edlEntries,
            sourceVideos,
            sourceMapping,
            title: 'Edit Project',
          });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `edit_project_${target}.zip`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          showToast(`${label} 패키지가 다운로드되었습니다.`);
        } catch (err) {
          showToast('NLE 패키지 생성 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
        }
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

          // [FIX #260] 소스 영상의 실제 비율을 감지하여 프로젝트 config 자동 업데이트
          const firstMappedVideo = sourceVideos.find(v =>
            Object.values(sourceMapping).includes(v.id)
          );
          if (firstMappedVideo?.width && firstMappedVideo?.height) {
            const ratio = firstMappedVideo.width / firstMappedVideo.height;
            let detectedAR: string;
            if (ratio < 0.75) detectedAR = '9:16';       // 세로 (portrait)
            else if (ratio > 1.2) detectedAR = '16:9';   // 가로 (landscape)
            else if (ratio >= 0.9 && ratio <= 1.1) detectedAR = '1:1'; // 정사각
            else detectedAR = '4:3';                       // 클래식
            const currentConfig = useProjectStore.getState().config;
            if (currentConfig && currentConfig.aspectRatio !== detectedAR) {
              useProjectStore.getState().setConfig({
                ...currentConfig,
                aspectRatio: detectedAR as any,
              });
            }
          }

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

    // [FIX #215] 이전 소스 영상/상태 정리 — 버전 전환 시 누적 방지
    get().reset();

    // 편집표 + 나레이션 텍스트 설정
    set({ rawEditTable: editTableText, rawNarration: narrationText });

    // 영상 파일이 있으면 소스로 등록
    if (videoFile) {
      await get().addSourceVideos([videoFile]);
    } else if (videoBlob) {
      const file = new File([videoBlob], 'video-analysis-source.mp4', { type: 'video/mp4' });
      await get().addSourceVideos([file]);
    }
    // [FIX #296] 소스 영상 없어도 편집표만으로 진행 — 편집실 Step 1에서 안내 표시됨

    // [FIX #296] 편집표 자동 파싱 — 비동기 진행하여 탭 전환 차단하지 않음
    // [FIX #310] 파싱 완료 후 frames를 EdlEntry.referenceFrameUrl에 자동 매칭
    if (editTableText.trim()) {
      get().parseEditTable()
        .then(() => {
          // 파싱된 EdlEntry에 영상 분석실 프레임을 타임코드 기반 매칭
          if (frames && frames.length > 0) {
            const sortedFrames = [...frames].sort((a, b) => a.timeSec - b.timeSec);
            set((state) => ({
              edlEntries: state.edlEntries.map(entry => {
                if (entry.referenceFrameUrl) return entry; // 이미 있으면 유지
                // 타임코드 범위에 가장 가까운 프레임 찾기
                const midTime = (entry.timecodeStart + entry.timecodeEnd) / 2;
                let bestFrame = sortedFrames[0];
                let bestDist = Infinity;
                for (const f of sortedFrames) {
                  const dist = Math.abs(f.timeSec - midTime);
                  if (dist < bestDist) { bestDist = dist; bestFrame = f; }
                }
                return bestFrame ? { ...entry, referenceFrameUrl: bestFrame.hdUrl || bestFrame.url } : entry;
              }),
            }));
          }
        })
        .catch(e => console.warn('[EditPoint] 편집표 자동 파싱 실패:', e));
    }
  },

  reset: () => {
    // blob URL 정리
    get().sourceVideos.forEach((v) => {
      logger.unregisterBlobUrl(v.blobUrl);
      URL.revokeObjectURL(v.blobUrl);
      if (v.cleanedBlobUrl) {
        logger.unregisterBlobUrl(v.cleanedBlobUrl);
        URL.revokeObjectURL(v.cleanedBlobUrl);
      }
    });
    set({
      step: 'register',
      sourceVideos: [],
      rawEditTable: '',
      rawNarration: '',
      sourceInputMode: 'file',
      rawUrls: '',
      isDownloadingUrls: false,
      urlDownloadProgress: 0,
      urlDownloadMessage: '',
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
})));
