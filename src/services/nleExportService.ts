/**
 * nleExportService.ts
 *
 * NLE(Non-Linear Editor) 프로젝트 내보내기 서비스
 * - Premiere Pro / DaVinci Resolve: FCP XML (xmeml v5)
 * - CapCut / VREW: SRT + 영상 ZIP 패키지
 */

import type { VideoSceneRow, VideoAnalysisPreset, EdlEntry, SourceVideoFile } from '../types';

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*초/);
  return m ? parseFloat(m[1]) : 3;
}

function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** 초 → SRT 타임코드 (00:00:03,000) */
function secondsToSrtTime(s: number): string {
  const total = Math.max(0, s);
  let ms = Math.round((total % 1) * 1000);
  let sec = Math.floor(total % 60);
  if (ms >= 1000) { ms -= 1000; sec += 1; }
  const m = Math.floor((total % 3600) / 60);
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** 초 → FCP 타임코드 (HH:MM:SS:FF) */
function secondsToFcpTc(s: number, fps: number): string {
  const total = Math.max(0, s);
  const f = Math.floor((total % 1) * fps);
  const sec = Math.floor(total % 60);
  const m = Math.floor((total % 3600) / 60);
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 숏폼 자막 줄바꿈 */
function breakLines(text: string, maxChars: number = 14): string {
  if (text.length <= maxChars) return text;
  const mid = Math.ceil(text.length / 2);
  const spaceAfter = text.indexOf(' ', mid);
  const spaceBefore = text.lastIndexOf(' ', mid);
  const breakAt = spaceAfter !== -1 && spaceAfter - mid < 8 ? spaceAfter
    : spaceBefore > 0 ? spaceBefore : mid;
  return text.slice(0, breakAt).trim() + '\n' + text.slice(breakAt).trim();
}

// ──────────────────────────────────────────────
// 장면 → 타이밍 정보 추출
// ──────────────────────────────────────────────

interface SceneTiming {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;        // 나레이션/대사
  effectText: string;  // 효과자막
}

function extractTimings(scenes: VideoSceneRow[], preset?: VideoAnalysisPreset): SceneTiming[] {
  const result: SceneTiming[] = [];
  let accTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = parseDuration(s.duration);

    // 보정된 소스 타임코드가 있으면 우선 사용
    const srcTc = s.timecodeSource || s.sourceTimeline || '';
    const range = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);

    let startSec: number;
    let endSec: number;

    if (range) {
      startSec = timecodeToSeconds(range[1]);
      endSec = timecodeToSeconds(range[2]);
    } else {
      startSec = accTime;
      endSec = accTime + dur;
    }

    const mainText = preset === 'snack'
      ? (s.dialogue || s.audioContent || s.sceneDesc)
      : (s.audioContent || s.dialogue || s.sceneDesc);

    result.push({
      index: i,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      text: mainText || '',
      effectText: s.effectSub || '',
    });

    accTime = endSec;
  }
  return result;
}

// ──────────────────────────────────────────────
// FCP XML (xmeml v5) — Premiere Pro / DaVinci
// ──────────────────────────────────────────────

export function generateFcpXml(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
}): string {
  // [FIX #316] 기본값을 9:16(1080x1920)으로 변경 — 대부분 쇼츠/릴스 분석이므로
  const { scenes, title, videoFileName, fps = 30, width = 1080, height = 1920, preset } = params;
  const timings = extractTimings(scenes, preset);
  if (timings.length === 0) return '';

  const totalDurSec = timings[timings.length - 1].endSec;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);
  const safeFileName = escXml(videoFileName);

  const toFrames = (sec: number) => Math.round(sec * fps);

  // 비디오 클립 아이템 (V1 트랙 — 순차 배치, 첫 클립에 file 정의)
  const videoClips = timings.map((t, i) => {
    const fileTag = i === 0
      ? `<file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>file://localhost/media/${encodeURIComponent(videoFileName)}</pathurl>
              <duration>${totalFrames}</duration>
              <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>`
      : '<file id="file-1"/>';
    return `
          <clipitem id="clip-${i + 1}">
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.startSec)}</start>
            <end>${toFrames(t.endSec)}</end>
            ${fileTag}
          </clipitem>`;
  }).join('');

  // 자막 아이템 (V2 트랙 — generatoritem)
  const subtitleClips = timings.filter(t => t.text).map((t, i) => `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(t.text.slice(0, 40))}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.durationSec)}</out>
            <start>${toFrames(t.startSec)}</start>
            <end>${toFrames(t.endSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter>
                <parameterid>str</parameterid>
                <name>Text</name>
                <value>${escXml(t.text)}</value>
              </parameter>
              <parameter>
                <parameterid>fontsize</parameterid>
                <name>Font Size</name>
                <value>42</value>
              </parameter>
              <parameter>
                <parameterid>fontstyle</parameterid>
                <name>Font Style</name>
                <value>1</value>
              </parameter>
              <parameter>
                <parameterid>fontcolor</parameterid>
                <name>Font Color</name>
                <value>16777215</value>
              </parameter>
              <parameter>
                <parameterid>origin</parameterid>
                <name>Origin</name>
                <value>0 0.38</value>
              </parameter>
            </effect>
          </generatoritem>`).join('');

  // 오디오 클립 아이템 (A1 트랙)
  const audioClips = timings.map((t, i) => `
          <clipitem id="audio-${i + 1}">
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')} Audio`)}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.startSec)}</start>
            <end>${toFrames(t.endSec)}</end>
            <file id="file-1"/>
          </clipitem>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <ntsc>FALSE</ntsc>
      <timebase>${fps}</timebase>
    </rate>
    <timecode>
      <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <colordepth>24</colordepth>
            <codec>
              <name>Apple ProRes 422</name>
            </codec>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>
      </video>
      <audio>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <track>${audioClips}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

// ──────────────────────────────────────────────
// SRT 생성 (NLE 패키지용)
// ──────────────────────────────────────────────

export function generateNleSrt(
  scenes: VideoSceneRow[],
  layer: 'dialogue' | 'effect' | 'narration' = 'dialogue',
  preset?: VideoAnalysisPreset,
): string {
  const timings = extractTimings(scenes, preset);
  let idx = 1;
  const entries: string[] = [];

  for (const t of timings) {
    let text = '';
    switch (layer) {
      case 'dialogue':
        text = t.text;
        break;
      case 'effect':
        text = t.effectText;
        break;
      case 'narration':
        text = t.text; // 나레이션 = 메인 텍스트
        break;
    }
    if (!text.trim()) continue;

    const lineText = breakLines(text);
    entries.push(`${idx}\n${secondsToSrtTime(t.startSec)} --> ${secondsToSrtTime(t.endSec)}\n${lineText}`);
    idx++;
  }

  return entries.join('\n\n');
}

// ──────────────────────────────────────────────
// ZIP 패키지 빌더
// ──────────────────────────────────────────────

export type NleTarget = 'premiere' | 'capcut' | 'vrew';

export async function buildNlePackageZip(params: {
  target: NleTarget;
  scenes: VideoSceneRow[];
  title: string;
  videoBlob: Blob | null;
  videoFileName: string;
  preset?: VideoAnalysisPreset;
  width?: number;
  height?: number;
  fps?: number;
}): Promise<Blob> {
  const { target, scenes, title, videoBlob, videoFileName, preset, width, height, fps } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40) || 'project';
  const BOM = '\uFEFF';

  if (target === 'premiere') {
    // FCP XML
    const xml = generateFcpXml({ scenes, title, videoFileName, preset, width, height, fps });
    zip.file(`${safeName}.xml`, xml);

    // [FIX #316] 영상 파일 포함 — CapCut/VREW와 동일하게 videoBlob ZIP에 포함
    if (videoBlob) {
      zip.file(videoFileName || 'video.mp4', videoBlob);
    }

    // SRT (자막 레이어 분리)
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '1. ZIP을 압축 해제하세요.',
      '2. Premiere Pro를 열고 File > Import를 클릭하세요.',
      `3. "${safeName}.xml" 파일을 선택하면 타임라인이 자동 생성됩니다.`,
      `4. 영상 파일(${videoFileName})이 같은 폴더에 있어야 자동 연결됩니다.`,
      '5. 추가 SRT 파일은 별도 import할 수 있습니다.',
    ].join('\n'));

  } else {
    // CapCut / VREW — SRT + 영상
    if (videoBlob) {
      zip.file(videoFileName || 'video.mp4', videoBlob);
    }

    const srt = generateNleSrt(scenes, 'dialogue', preset);
    if (srt) zip.file(`${safeName}_자막.srt`, BOM + srt);

    const narSrt = generateNleSrt(scenes, 'narration', preset);
    if (narSrt) zip.file(`${safeName}_나레이션.srt`, BOM + narSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    const appName = target === 'capcut' ? 'CapCut' : 'VREW';
    zip.file('README.txt', [
      `=== ${title} — ${appName} ===`,
      '',
      `1. ${appName}을 열고 새 프로젝트를 생성하세요.`,
      `2. "${videoFileName || 'video.mp4'}" 영상 파일을 import하세요.`,
      `3. 자막 > SRT 파일 불러오기 > "${safeName}_자막.srt"를 선택하세요.`,
      '4. 자막이 타임라인에 자동 배치됩니다.',
      '',
      '* 나레이션/효과자막 SRT도 별도 레이어로 추가 import 가능합니다.',
      `* 총 ${scenes.length}개 편집점이 포함되어 있습니다.`,
    ].join('\n'));
  }

  return zip.generateAsync({ type: 'blob' });
}

// ──────────────────────────────────────────────
// 편집실(EditPoint) EdlEntry 기반 — FCP XML + ZIP
// ──────────────────────────────────────────────

/** EdlEntry[] → FCP XML (xmeml v5) — 편집실의 정밀 편집점 기반 */
export function generateFcpXmlFromEdl(params: {
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
}): string {
  // [FIX #316] 기본값을 9:16(1080x1920)으로 변경
  const { entries, sourceVideos, sourceMapping, title = 'Edit Project', fps = 30, width = 1080, height = 1920 } = params;
  if (entries.length === 0) return '';

  const toFrames = (sec: number) => Math.round(sec * fps);
  const safeTitle = escXml(title);

  // 소스 파일 정보 (중복 제거)
  const fileMap = new Map<string, { id: string; name: string; dur: number }>();
  let fileIdx = 1;
  for (const entry of entries) {
    const videoId = sourceMapping[entry.sourceId];
    if (videoId && !fileMap.has(videoId)) {
      const sv = sourceVideos.find(v => v.id === videoId);
      fileMap.set(videoId, {
        id: `file-${fileIdx}`,
        name: sv?.fileName || `source_${fileIdx}.mp4`,
        dur: sv?.durationSec || 300,
      });
      fileIdx++;
    }
  }

  // 총 길이 계산 (누적)
  let recordIn = 0;
  const clips: { entry: EdlEntry; recStart: number; recEnd: number; fileInfo: { id: string; name: string; dur: number } }[] = [];
  for (const entry of entries) {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const dur = (end - start) / entry.speedFactor;
    const videoId = sourceMapping[entry.sourceId];
    const fileInfo = fileMap.get(videoId || '') || { id: 'file-1', name: 'source.mp4', dur: 300 };
    clips.push({ entry, recStart: recordIn, recEnd: recordIn + dur, fileInfo });
    recordIn += dur;
  }

  const totalFrames = toFrames(recordIn);

  // 파일 정의 XML (인라인 정의용 — 각 file의 첫 참조 시 전체 정의)
  const fileDefs = new Map<string, string>();
  for (const f of fileMap.values()) {
    fileDefs.set(f.id, `
              <name>${escXml(f.name)}</name>
              <pathurl>file://localhost/media/${encodeURIComponent(f.name)}</pathurl>
              <duration>${toFrames(f.dur)}</duration>
              <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>`);
  }

  // V1 비디오 클립 — 각 file의 첫 등장 시 전체 정의, 이후 빈 참조 (xmeml v5 스펙)
  const definedFiles = new Set<string>();
  const videoClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const fid = c.fileInfo.id;
    let fileTag: string;
    if (!definedFiles.has(fid) && fileDefs.has(fid)) {
      fileTag = `<file id="${fid}">${fileDefs.get(fid)!}\n            </file>`;
      definedFiles.add(fid);
    } else {
      fileTag = `<file id="${fid}"/>`;
    }
    return `
          <clipitem id="clip-${i + 1}">
            <name>${escXml(`${c.entry.order} ${c.entry.sourceDescription.slice(0, 30)}`)}</name>
            <duration>${toFrames(end - start)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            ${fileTag}
          </clipitem>`;
  }).join('');

  // V2 자막 트랙
  const subtitleClips = clips.filter(c => c.entry.narrationText).map((c, i) => `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(c.entry.narrationText.slice(0, 40))}</name>
            <duration>${toFrames(c.recEnd - c.recStart)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>0</in>
            <out>${toFrames(c.recEnd - c.recStart)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <enabled>TRUE</enabled>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(c.entry.narrationText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>0 0.38</value></parameter>
            </effect>
          </generatoritem>`).join('');

  // A1 오디오 클립
  const audioClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    return `
          <clipitem id="audio-${i + 1}">
            <name>${escXml(`Audio ${c.entry.order}`)}</name>
            <duration>${toFrames(end - start)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <file id="${c.fileInfo.id}"/>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
    <timecode>
      <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>
        <track><enabled>TRUE</enabled>${subtitleClips}
        </track>
      </video>
      <audio>
        <format><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></format>
        <track>${audioClips}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** EdlEntry[] → 나레이션 SRT (편집실용, 누적 타임코드) */
export function generateEdlNarrationSrt(entries: EdlEntry[]): string {
  let cumTime = 0;
  let idx = 1;
  const parts: string[] = [];
  for (const e of entries) {
    const start = e.refinedTimecodeStart ?? e.timecodeStart;
    const end = e.refinedTimecodeEnd ?? e.timecodeEnd;
    const dur = (end - start) / e.speedFactor;
    if (e.narrationText.trim()) {
      parts.push(`${idx}\n${secondsToSrtTime(cumTime)} --> ${secondsToSrtTime(cumTime + dur)}\n${breakLines(e.narrationText)}`);
      idx++;
    }
    cumTime += dur;
  }
  return parts.join('\n\n');
}

/** 편집실 EdlEntry → NLE ZIP 패키지 (Premiere/CapCut/VREW) */
export async function buildEdlNlePackageZip(params: {
  target: NleTarget;
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
}): Promise<Blob> {
  const { target, entries, sourceVideos, sourceMapping, title = 'Edit Project' } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40) || 'project';
  const BOM = '\uFEFF';

  const srt = generateEdlNarrationSrt(entries);

  if (target === 'premiere') {
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '1. Premiere Pro: File > Import > XML 파일 선택',
      '2. 타임라인에 편집점+자막이 자동 배치됩니다.',
      '3. 소스 영상은 media/ 폴더에 배치하세요.',
      `* ${entries.length}개 편집점, Vision AI 정제 타임코드 반영`,
    ].join('\n'));
  } else {
    // CapCut / VREW — 소스 영상 포함 불가(다중 소스), SRT만 제공
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    const appName = target === 'capcut' ? 'CapCut' : 'VREW';
    zip.file('README.txt', [
      `=== ${title} — ${appName} ===`,
      '',
      `1. ${appName}에서 소스 영상을 import하세요.`,
      `2. 자막 > SRT 불러오기 > "${safeName}_나레이션.srt" 선택`,
      `* ${entries.length}개 편집점 기반 나레이션 SRT`,
    ].join('\n'));
  }

  return zip.generateAsync({ type: 'blob' });
}
