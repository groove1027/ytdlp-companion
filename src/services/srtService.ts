/**
 * srtService.ts
 * SRT 자막 파일 생성 / 다운로드 / ZIP 묶음 서비스
 */

import { SrtEntry, UnifiedSceneTiming } from '../types';
import { logger } from './LoggerService';
import { cropBlobToAspectRatio } from '../utils/fileHelpers';

/**
 * 초(seconds)를 SRT 타임코드로 변환
 * @example formatSrtTime(65.42) → "00:01:05,420"
 */
export function formatSrtTime(seconds: number): string {
  // [FIX M16] Handle carry-over when ms rounds to 1000 (e.g., 59.9995 → ms=1000)
  let ms = Math.round((seconds % 1) * 1000);
  let totalSeconds = Math.floor(seconds);
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
  narrationLines?: { sceneId?: string; audioUrl?: string }[],
  aspectRatio?: string,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

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
            const ext = aspectRatio ? 'jpg' : guessExtension(imgUrl, 'png');
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
            const ext = guessExtension(vidUrl, 'mp4');
            zip.file(`videos/${idx}_scene.${ext}`, blob);
          } else {
            failedAssets.push(label);
          }
        })
      );
    }
  }

  // [FIX #76] 나레이션 오디오 포함 — CapCut 등 외부 편집기에서 오디오 사용 가능
  if (narrationLines && narrationLines.length > 0) {
    const audioSet = new Set<string>(); // 중복 방지
    let audioIdx = 0;
    for (const line of narrationLines) {
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

      fetchPromises.push(
        fetchAsBlob(audioUrl, label).then((blob) => {
          if (blob) {
            const ext = guessExtension(audioUrl, 'mp3');
            zip.file(`audio/${filePrefix}_narration.${ext}`, blob);
          } else {
            failedAssets.push(label);
          }
        })
      );
    }
  }

  await Promise.allSettled(fetchPromises);

  if (failedAssets.length > 0) {
    console.warn(`[ZIP Export] ${failedAssets.length} asset(s) failed to fetch and were omitted: ${failedAssets.join(', ')}`);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, filename);
}

// --- 내부 유틸 ---

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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
