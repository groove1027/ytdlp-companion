/**
 * srtService.ts
 * SRT 자막 파일 생성 / 다운로드 / ZIP 묶음 서비스
 */

import { SrtEntry, UnifiedSceneTiming, RationalFps } from '../types';
import { logger } from './LoggerService';
import { cropBlobToAspectRatio } from '../utils/fileHelpers';
import { secondsToFrame, frameToSeconds } from './sceneDetection';

interface SrtZipNarrationClip {
  sceneId?: string;
  audioUrl?: string;
}

interface SrtZipNarrationAssets {
  clips?: SrtZipNarrationClip[];
  mergedAudioUrl?: string;
  mergedFileName?: string;
}

/**
 * 초(seconds)를 SRT 타임코드로 변환
 * v2.0: fps를 전달하면 프레임 경계에 스냅하여 NLE 클립과 완벽 동기화
 * @example formatSrtTime(65.42) → "00:01:05,420"
 * @example formatSrtTime(7.234, { num: 30000, den: 1001, display: 29.97 }) → "00:00:07,238"
 */
export function formatSrtTime(seconds: number, fps?: RationalFps): string {
  // v2.0: fps가 주어지면 프레임 경계로 스냅 (NLE 클립과 동기화)
  let snapped = seconds;
  if (fps) {
    const frame = secondsToFrame(seconds, fps);
    snapped = frameToSeconds(frame, fps);
  }

  // [FIX M16] Handle carry-over when ms rounds to 1000 (e.g., 59.9995 → ms=1000)
  let ms = Math.round((snapped % 1) * 1000);
  let totalSeconds = Math.floor(snapped);
  if (ms >= 1000) {
    ms -= 1000;
    totalSeconds += 1;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}

/**
 * SrtEntry 배열 → SRT 파일 텍스트 생성
 */
export function generateSrtContent(entries: SrtEntry[]): string {
  return entries
    .map((entry) =>
      `${entry.index}\n${formatSrtTime(entry.startTime)} --> ${formatSrtTime(entry.endTime)}\n${entry.text}`
    )
    .join('\n\n') + '\n';
}

/**
 * UnifiedSceneTiming 배열 → SrtEntry 배열 변환
 * 각 장면의 subtitleSegments를 순서대로 SRT 인덱스를 부여
 */
export function buildSrtEntries(timeline: UnifiedSceneTiming[]): SrtEntry[] {
  const entries: SrtEntry[] = [];
  let index = 1;

  for (const scene of timeline) {
    for (const seg of scene.subtitleSegments) {
      if (!seg.text.trim()) continue;
      entries.push({
        index,
        startTime: seg.startTime,
        endTime: seg.endTime,
        text: seg.text,
      });
      index++;
    }
  }

  return entries;
}

/**
 * SRT 파일 브라우저 다운로드
 */
export function downloadSrtFile(
  timeline: UnifiedSceneTiming[],
  filename = 'subtitles.srt'
): void {
  const entries = buildSrtEntries(timeline);
  if (entries.length === 0) {
    throw new Error('내보낼 자막이 없습니다.');
  }

  const content = generateSrtContent(entries);
  const blob = new Blob(['\uFEFF' + content], { type: 'text/srt;charset=utf-8' });
  triggerDownload(blob, filename);
}

/**
 * SRT + 이미지/영상 에셋을 ZIP으로 묶어 다운로드
 * (jszip 동적 임포트)
 */
export async function downloadSrtWithAssetsZip(
  timeline: UnifiedSceneTiming[],
  scenes: { id: string; imageUrl?: string; videoUrl?: string }[],
  filename = 'project-assets.zip',
  narrationAssets?: SrtZipNarrationClip[] | SrtZipNarrationAssets,
  aspectRatio?: string,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const narration = normalizeNarrationAssets(narrationAssets);

  // SRT 파일 추가
  const entries = buildSrtEntries(timeline);
  if (entries.length === 0) {
    throw new Error('내보낼 자막이 없습니다.');
  }
  const srtContent = generateSrtContent(entries);
  zip.file('subtitles.srt', '\uFEFF' + srtContent);

  // [FIX M21] 장면별 에셋 다운로드 + ZIP에 추가 (실패 시 경고 수집)
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const fetchPromises: Promise<void>[] = [];
  const failedAssets: string[] = [];

  for (const timing of timeline) {
    const scene = sceneMap.get(timing.sceneId);
    if (!scene) continue;

    const idx = String(timing.sceneIndex + 1).padStart(3, '0');

    // 이미지 — [FIX #183] 설정된 비율로 중앙 크롭 적용
    if (scene.imageUrl) {
      const imgUrl = scene.imageUrl;
      const label = `Scene ${idx} image`;
      fetchPromises.push(
        fetchAsBlob(imgUrl, label).then(async (blob) => {
          if (blob) {
            const cropped = aspectRatio ? await cropBlobToAspectRatio(blob, aspectRatio) : blob;
            const ext = guessBlobExtension(cropped, imgUrl, aspectRatio ? 'jpg' : 'png');
            zip.file(`images/${idx}_scene.${ext}`, cropped);
          } else {
            failedAssets.push(label);
          }
        })
      );
    }

    // 영상
    if (scene.videoUrl) {
      const vidUrl = scene.videoUrl;
      const label = `Scene ${idx} video`;
      fetchPromises.push(
        fetchAsBlob(vidUrl, label).then((blob) => {
          if (blob) {
            const ext = guessBlobExtension(blob, vidUrl, 'mp4');
            zip.file(`videos/${idx}_scene.${ext}`, blob);
          } else {
            failedAssets.push(label);
          }
        })
      );
    }
  }

  // [FIX #76] 나레이션 오디오 포함 — CapCut 등 외부 편집기에서 오디오 사용 가능
  const usedAudioFileNames = new Set<string>();
  if (narration.clips.length > 0) {
    const audioSet = new Set<string>(); // 중복 방지
    let audioIdx = 0;
    for (const line of narration.clips) {
      if (!line.audioUrl || audioSet.has(line.audioUrl)) continue;
      audioSet.add(line.audioUrl);
      audioIdx++;

      const audioUrl = line.audioUrl;
      const sceneIdx = line.sceneId
        ? timeline.findIndex((t) => t.sceneId === line.sceneId)
        : -1;
      const label = sceneIdx >= 0
        ? `Scene ${String(sceneIdx + 1).padStart(3, '0')} narration`
        : `Narration ${audioIdx}`;
      const filePrefix = sceneIdx >= 0
        ? String(sceneIdx + 1).padStart(3, '0')
        : String(audioIdx).padStart(3, '0');
      const urlExt = guessExtension(audioUrl, '');

      fetchPromises.push(
        fetchAsBlob(audioUrl, label).then((blob) => {
          if (blob) {
            const ext = guessBlobExtension(blob, audioUrl, urlExt || 'mp3');
            const reservedFileName = ensureUniqueAudioFileName(
              `${filePrefix}_narration.${ext}`,
              usedAudioFileNames,
            );
            zip.file(`audio/${reservedFileName}`, blob);
          } else {
            failedAssets.push(label);
          }
        })
      );
    }
  }

  await Promise.allSettled(fetchPromises);

  if (narration.mergedAudioUrl) {
    const label = 'Merged narration';
    const blob = await fetchAsBlob(narration.mergedAudioUrl, label);
    if (blob) {
      const ext = guessBlobExtension(blob, narration.mergedAudioUrl, 'mp3');
      const reservedFileName = ensureUniqueAudioFileName(
        normalizeNarrationFileName(narration.mergedFileName, ext),
        usedAudioFileNames,
      );
      zip.file(reservedFileName, blob);
      zip.file(`audio/${reservedFileName}`, blob);
    } else {
      failedAssets.push(label);
    }
  }

  if (failedAssets.length > 0) {
    console.warn(`[ZIP Export] ${failedAssets.length} asset(s) failed to fetch and were omitted: ${failedAssets.join(', ')}`);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, filename);
}

// --- 내부 유틸 ---

function normalizeNarrationAssets(
  narrationAssets?: SrtZipNarrationClip[] | SrtZipNarrationAssets,
): Required<SrtZipNarrationAssets> {
  if (!narrationAssets) {
    return { clips: [], mergedAudioUrl: '', mergedFileName: '' };
  }
  if (Array.isArray(narrationAssets)) {
    return { clips: narrationAssets, mergedAudioUrl: '', mergedFileName: '' };
  }
  return {
    clips: narrationAssets.clips || [],
    mergedAudioUrl: narrationAssets.mergedAudioUrl || '',
    mergedFileName: narrationAssets.mergedFileName || '',
  };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// [FIX M21] Log warnings when asset fetch fails instead of silently returning null
async function fetchAsBlob(url: string, label?: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`Asset fetch failed (${label ?? url}): HTTP ${resp.status}`);
      return null;
    }
    return await resp.blob();
  } catch (err) {
    console.warn(`Asset fetch failed (${label ?? url}):`, err);
    return null;
  }
}

function guessBlobExtension(blob: Blob, url: string, fallback: string): string {
  const mimeExt = mimeTypeToExtension(blob.type);
  return mimeExt || guessExtension(url, fallback);
}

function guessExtension(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext;
  } catch (e) {
    logger.trackSwallowedError('srtService:guessExtension', e);
    // URL 파싱 실패 시 fallback
  }
  return fallback;
}

function mimeTypeToExtension(mimeType: string): string | null {
  switch (mimeType.toLowerCase()) {
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/webm':
      return 'webm';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

function normalizeNarrationFileName(fileName: string | undefined, ext: string): string {
  const baseName = (fileName || '_full_narration').split('/').pop()?.trim() || '_full_narration';
  const normalizedBaseName = baseName.replace(/\.[a-z0-9]+$/i, '') || '_full_narration';
  return `${normalizedBaseName}.${ext}`;
}

function ensureUniqueAudioFileName(fileName: string, usedFileNames: Set<string>): string {
  const trimmed = fileName.trim() || 'audio.mp3';
  if (!usedFileNames.has(trimmed)) {
    usedFileNames.add(trimmed);
    return trimmed;
  }

  const extMatch = trimmed.match(/\.[a-z0-9]+$/i);
  const ext = extMatch?.[0] || '';
  const base = ext ? trimmed.slice(0, -ext.length) : trimmed;
  let counter = 2;
  let candidate = `${base}_${counter}${ext}`;
  while (usedFileNames.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}${ext}`;
  }
  usedFileNames.add(candidate);
  return candidate;
}
