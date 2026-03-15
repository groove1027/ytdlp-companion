/**
 * nleExportService.ts
 *
 * NLE(Non-Linear Editor) 프로젝트 내보내기 서비스
 * - Premiere Pro / DaVinci Resolve: FCP XML (xmeml v5)
 * - CapCut / VREW: SRT + 영상 ZIP 패키지
 */

import type { VideoSceneRow, VideoAnalysisPreset } from '../types';

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
  const { scenes, title, videoFileName, fps = 30, width = 1920, height = 1080, preset } = params;
  const timings = extractTimings(scenes, preset);
  if (timings.length === 0) return '';

  const totalDurSec = timings[timings.length - 1].endSec;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);
  const safeFileName = escXml(videoFileName);

  const toFrames = (sec: number) => Math.round(sec * fps);

  // 비디오 클립 아이템 (V1 트랙)
  const videoClips = timings.map((t, i) => `
          <clipitem id="clip-${i + 1}">
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.startSec)}</start>
            <end>${toFrames(t.endSec)}</end>
            <file id="file-1"/>
          </clipitem>`).join('');

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
            <pixelaspectratio>square</pixelaspectratio>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <codec>
              <name>Apple ProRes 422</name>
            </codec>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem id="clip-master">
            <name>${safeFileName}</name>
            <duration>${totalFrames}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>0</in>
            <out>${totalFrames}</out>
            <start>0</start>
            <end>${totalFrames}</end>
            <file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>file://localhost/media/${encodeURIComponent(videoFileName)}</pathurl>
              <duration>${totalFrames}</duration>
              <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>${width}</width>
                    <height>${height}</height>
                  </samplecharacteristics>
                </video>
                <audio>
                  <samplecharacteristics>
                    <samplerate>48000</samplerate>
                    <depth>16</depth>
                  </samplecharacteristics>
                </audio>
              </media>
            </file>
            <labels>
              <label2>Iris</label2>
            </labels>
          </clipitem>${videoClips}
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
        <track>
          <clipitem id="audio-master">
            <name>${safeFileName} Audio</name>
            <duration>${totalFrames}</duration>
            <rate><ntsc>FALSE</ntsc><timebase>${fps}</timebase></rate>
            <in>0</in>
            <out>${totalFrames}</out>
            <start>0</start>
            <end>${totalFrames}</end>
            <file id="file-1"/>
          </clipitem>${audioClips}
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
}): Promise<Blob> {
  const { target, scenes, title, videoBlob, videoFileName, preset } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40) || 'project';
  const BOM = '\uFEFF';

  if (target === 'premiere') {
    // FCP XML
    const xml = generateFcpXml({ scenes, title, videoFileName, preset });
    zip.file(`${safeName}.xml`, xml);

    // SRT (자막 레이어 분리)
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '1. Premiere Pro를 열고 File > Import를 클릭하세요.',
      `2. "${safeName}.xml" 파일을 선택하면 타임라인이 자동 생성됩니다.`,
      '3. 자막 트랙(V2)이 자동으로 배치되어 있습니다.',
      '4. 추가 SRT 파일은 별도 import할 수 있습니다.',
      '',
      '* 영상 파일은 별도로 같은 폴더의 media/ 에 배치하세요.',
      `* 원본 파일명: ${videoFileName}`,
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
