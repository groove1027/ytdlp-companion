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
  const m = dur.match(/([\d.]+)\s*(?:초|s(?:ec(?:onds?)?)?)/i);
  return m && parseFloat(m[1]) > 0 ? parseFloat(m[1]) : 3;
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

/** 장면 모드 → Premiere Pro 라벨 색상 (타임라인 시각 구분) */
function modeToLabelColor(mode: string): string {
  const m = (mode || '').toUpperCase().replace(/[\[\]]/g, '').trim();
  if (m.includes('S-내레이션') || m.includes('S-나레이션') || m === 'SN') return 'Caribbean';
  if (m.includes('S')) return 'Forest';
  if (m.includes('N')) return 'Cerulean';
  if (m.includes('A')) return 'Mango';
  return 'Iris';
}

/** 실측 FPS → xmeml v5 timebase + NTSC 플래그 매핑 */
function fpsToNtsc(fps: number): { ntsc: boolean; timebase: number } {
  // 임계값 0.01 — 23.976(NTSC)과 24.000(non-NTSC)의 차이=0.024이므로 0.05는 너무 넓음
  if (Math.abs(fps - 23.976) < 0.01) return { ntsc: true, timebase: 24 };
  if (Math.abs(fps - 29.97) < 0.01) return { ntsc: true, timebase: 30 };
  if (Math.abs(fps - 59.94) < 0.01) return { ntsc: true, timebase: 60 };
  return { ntsc: false, timebase: Math.round(fps) };
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
  startSec: number;      // 소스 영상 내 시작점
  endSec: number;        // 소스 영상 내 종료점
  durationSec: number;   // 클립 길이
  tlStartSec: number;    // 타임라인 누적 시작점
  tlEndSec: number;      // 타임라인 누적 종료점
  text: string;          // 나레이션/대사
  effectText: string;    // 효과자막
}

function extractTimings(scenes: VideoSceneRow[], preset?: VideoAnalysisPreset): SceneTiming[] {
  const result: SceneTiming[] = [];
  let accTime = 0;
  let cumTime = 0; // 타임라인 누적 위치

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
      // [FIX] 단일 타임코드 ("00:26.000")도 소스 시작점으로 사용
      const singleTc = srcTc.match(/(\d+:\d+(?:\.\d+)?)/);
      if (singleTc) {
        startSec = timecodeToSeconds(singleTc[1]);
        endSec = startSec + dur;
      } else {
        startSec = accTime;
        endSec = accTime + dur;
      }
    }

    // [FIX] 음수/0 클립 방지 — endSec 교정 후 clipDur 계산
    if (endSec <= startSec) {
      endSec = startSec + Math.max(0.1, dur);
    }
    const clipDur = endSec - startSec;
    const mainText = preset === 'snack'
      ? (s.dialogue || s.audioContent || s.sceneDesc)
      : (s.audioContent || s.dialogue || s.sceneDesc);

    result.push({
      index: i,
      startSec,
      endSec,
      durationSec: clipDur,
      tlStartSec: cumTime,
      tlEndSec: cumTime + clipDur,
      text: mainText || '',
      effectText: s.effectSub || '',
    });

    accTime = endSec;
    cumTime += clipDur;
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
  videoDurationSec?: number;
}): string {
  const { scenes, title, videoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec } = params;
  const timings = extractTimings(scenes, preset);
  if (timings.length === 0) return '';

  const totalDurSec = timings[timings.length - 1].tlEndSec;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);
  const safeFileName = escXml(videoFileName);
  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps);
  // [FIX] 소스 영상 전체 길이 = max(실제 비디오 길이, 최대 타임코드 끝점)
  const maxTimecodeEnd = Math.max(...timings.map(t => t.endSec));
  const srcTotalFrames = Math.ceil(Math.max(videoDurationSec || 0, maxTimecodeEnd) * fps);

  // ── 시퀀스 마커 (장면 경계 — Shift+M으로 즉시 네비게이션) ──
  const markers = timings.map((t, i) => {
    const s = scenes[i];
    const markerName = s.sceneDesc
      ? `#${i + 1} ${s.sceneDesc.slice(0, 50)}`
      : `Scene ${i + 1}`;
    const markerComment = [s.dialogue, s.effectSub, s.audioContent]
      .filter(Boolean).join(' | ').slice(0, 200);
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(markerComment)}</comment>
      <in>${toFrames(t.tlStartSec)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
  const videoClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    const clipName = s.sceneDesc
      ? `Scene ${String(i + 1).padStart(3, '0')}: ${s.sceneDesc.slice(0, 40)}`
      : `Scene ${String(i + 1).padStart(3, '0')}`;
    const fileTag = i === 0
      ? `<file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>media/${encodeURIComponent(videoFileName)}</pathurl>
              <duration>${srcTotalFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>`
      : '<file id="file-1"/>';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(clipName)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            ${fileTag}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(s.sceneDesc || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
              <shottake>${escXml(s.videoDirection || '')}</shottake>
              <lognote>${escXml(t.text)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml([s.dialogue, s.effectSub].filter(Boolean).join(' / '))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')} Audio`)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <file id="file-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <ntsc>${ntscStr}</ntsc>
      <timebase>${timebase}</timebase>
    </rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
            <codec>
              <name>Apple ProRes 422</name>
            </codec>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
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
  cumulativeTiming?: boolean,
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

    // [FIX] Premiere용 SRT는 편집 타임라인 기준, CapCut/VREW는 원본 소스 기준
    const srtStart = cumulativeTiming ? t.tlStartSec : t.startSec;
    const srtEnd = cumulativeTiming ? t.tlEndSec : t.endSec;

    const lineText = breakLines(text);
    entries.push(`${idx}\n${secondsToSrtTime(srtStart)} --> ${secondsToSrtTime(srtEnd)}\n${lineText}`);
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
  videoDurationSec?: number;
}): Promise<Blob> {
  const { target, scenes, title, videoBlob, videoFileName, preset, width, height, fps, videoDurationSec } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40) || 'project';
  const BOM = '\uFEFF';

  if (target === 'premiere') {
    // FCP XML
    const xml = generateFcpXml({ scenes, title, videoFileName, preset, width, height, fps, videoDurationSec });
    zip.file(`${safeName}.xml`, xml);

    // [FIX #328] 영상 파일을 media/ 하위폴더에 배치 — XML pathurl과 일치
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }

    // [FIX] SRT 타임코드를 편집 타임라인 기준으로 생성 (Premiere XML과 일치)
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, true);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset, true);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    const presetLabel: Record<string, string> = {
      tikitaka: '티키타카 리메이크', snack: '스낵 편집', condensed: '컨덴스드',
      deep: '딥 분석', shopping: '쇼핑 리뷰', alltts: 'All TTS',
    };
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '4. media/ 폴더 영상이 자동 연결됩니다.',
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 장면마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 파랑(나레이션) / 초록(대사) / 청록(원본나레이션) / 주황(액션)',
      '• 메타데이터: Window > Metadata 패널에서 장면 설명·대사 확인',
      '• 비디오+오디오 연결됨: 함께 이동·트림됩니다.',
      '',
      '[ 자막 추가 (선택) ]',
      `• File > Import > "${safeName}_자막.srt" → 타임라인에 드래그`,
      '• SRT 타임코드는 편집 타임라인 기준입니다.',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${scenes.length}개`,
      `• 프리셋: ${presetLabel[preset || ''] || '기본'}`,
      `• 해상도: ${width}x${height} / ${fps}fps`,
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

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
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

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
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
              <pathurl>${escXml(f.name)}</pathurl>
              <duration>${toFrames(f.dur)}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>`);
  }

  // ── 시퀀스 마커 (편집점마다 — Shift+M으로 즉시 네비게이션) ──
  const markers = clips.map((c, i) => {
    const markerName = `${c.entry.order} ${c.entry.sourceDescription.slice(0, 50)}`;
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(c.entry.narrationText.slice(0, 200))}</comment>
      <in>${toFrames(c.recStart)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
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
    // 배속 기반 색상: 정배속=Iris, 고속=Mango, 저속=Lavender
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-${fid.replace('file-', '')}</masterclipid>
            <name>${escXml(`${c.entry.order} ${c.entry.sourceDescription.slice(0, 35)}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            ${fileTag}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(c.entry.sourceDescription)}</description>
              <scene>${escXml(c.entry.order)}</scene>
              <lognote>${escXml(c.entry.narrationText)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml(c.entry.narrationText.slice(0, 200))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-${c.fileInfo.id.replace('file-', '')}</masterclipid>
            <name>${escXml(`Audio ${c.entry.order}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <file id="${c.fileInfo.id}"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
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

    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 편집점마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 보라(정배속) / 주황(고속) / 연보라(슬로우)',
      '• 메타데이터: Window > Metadata에서 나레이션 텍스트 확인',
      '• 비디오+오디오 연결됨: 함께 이동·트림됩니다.',
      '',
      '[ 자막 추가 (선택) ]',
      `• File > Import > "${safeName}_나레이션.srt" → 타임라인에 드래그`,
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
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

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
