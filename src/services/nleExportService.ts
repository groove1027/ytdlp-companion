/**
 * nleExportService.ts
 *
 * NLE(Non-Linear Editor) 프로젝트 내보내기 서비스
 * - Premiere Pro / DaVinci Resolve: FCP XML (xmeml v5)
 * - CapCut / VREW: SRT + 영상 ZIP 패키지
 */

import type { VideoSceneRow, VideoAnalysisPreset, EdlEntry, SourceVideoFile, UnifiedSceneTiming } from '../types';

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

/**
 * 파일명에서 이모지·특수문자 제거 — NLE(Premiere/CapCut/VREW) pathurl 호환성 보장.
 * 허용: 영문, 숫자, 한글(가-힣), 일본어(ぁ-ヶ), 중국어(一-龥), 하이픈, 언더스코어
 * 공백 → 언더스코어, 연속 언더스코어 → 단일, 양쪽 trim, 확장자 보장
 * [FIX] 공백을 언더스코어로 변환하여 NLE pathurl 깨짐 방지
 */
function sanitizeFileName(name: string): string {
  // 확장자 분리
  const extMatch = name.match(/\.[a-zA-Z0-9]{2,5}$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const cleaned = base
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'video';
  return cleaned + ext;
}

/**
 * 프로젝트명/ZIP 파일명 정제 — NLE 소프트웨어 호환성 보장
 * sanitizeFileName과 동일 로직이나 확장자 없이 프로젝트명 전용
 * [FIX] 공백→언더스코어, 이모지/특수문자 제거, 빈 결과 폴백
 */
export function sanitizeProjectName(name: string, maxLen = 40): string {
  return name
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen)
    || 'project';
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

/** UUID v4 생성 (캡컷 프로젝트용) */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }).toUpperCase();
}

/** 초 → 마이크로초 (캡컷 시간 단위) */
function toUs(sec: number): number {
  return Math.round(sec * 1_000_000);
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
  const { scenes, title, videoFileName: rawVideoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
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
    const mTag = s.mode ? `[${s.mode.replace(/[\[\]]/g, '')}] ` : '';
    const markerName = `${mTag}#${i + 1} ${(s.audioContent || s.dialogue || '').slice(0, 50)}`;
    const markerComment = [s.effectSub, s.videoDirection]
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
    // [FIX #316] 클립 이름에 모드+오디오 내용 표시 — Premiere 타임라인에서 즉시 확인 가능
    const modeTag = s.mode ? `${s.mode.replace(/[\[\]]/g, '')}` : '';
    const clipName = `${modeTag ? `[${modeTag}] ` : ''}#${i + 1} ${(s.audioContent || s.dialogue || s.sceneDesc || '').slice(0, 50)}`;
    const fileTag = i === 0
      ? `<file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>media/${escXml(videoFileName)}</pathurl>
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

  // ── V2 자막 트랙 (generatoritem — 나레이션/대사 텍스트) ──
  const subtitleClips = timings.filter(t => t.text).map((t, i) => {
    const s = scenes[timings.indexOf(t)];
    const mTag = s?.mode ? `[${s.mode.replace(/[\[\]]/g, '')}] ` : '';
    return `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(`${mTag}${t.text.slice(0, 40)}`)}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.durationSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(t.text)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>0 0.38</value></parameter>
            </effect>
          </generatoritem>`;
  }).join('');

  // ── V3 효과자막 트랙 ──
  const effectSubClips = timings.filter(t => t.effectText).map((t, i) => `
          <generatoritem id="fx-${i + 1}">
            <name>${escXml(t.effectText.slice(0, 40))}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.durationSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(t.effectText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>60</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>4</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16776960</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>0 0.2</value></parameter>
            </effect>
          </generatoritem>`).join('');

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
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}${effectSubClips ? `
        <track>
          <enabled>TRUE</enabled>${effectSubClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

// ──────────────────────────────────────────────
// CapCut 프로젝트 (draft_content.json)
// ──────────────────────────────────────────────

export function generateCapCutDraftJson(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
  videoDurationSec?: number;
}): string {
  const { scenes, title, videoFileName: rawVideoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
  const timings = extractTimings(scenes, preset);
  if (timings.length === 0) return '';

  const totalDurUs = toUs(timings[timings.length - 1].tlEndSec);
  const maxEnd = Math.max(...timings.map(t => t.endSec));
  const srcDurUs = toUs(Math.max(videoDurationSec || 0, maxEnd));

  const projectId = uuid();
  const materialVideoId = uuid();
  const speedId = uuid();
  const trackVideoId = uuid();

  // 빈 배열 필드 (캡컷 필수 구조)
  const emptyArr: never[] = [];

  // ── 비디오 세그먼트 (편집점 = 실제 컷) ──
  const videoSegments = timings.map(t => ({
    cartoon: false,
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    },
    common_keyframes: emptyArr,
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: [speedId],
    group_id: '',
    hdr_settings: null,
    id: uuid(),
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: emptyArr,
    last_nonzero_volume: 1.0,
    material_id: materialVideoId,
    render_index: 0,
    responsive_layout: {
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: '',
      vertical_pos_layout: 0,
    },
    reverse: false,
    source_timerange: {
      duration: toUs(t.durationSec),
      start: toUs(t.startSec),
    },
    speed: 1.0,
    target_timerange: {
      duration: toUs(t.durationSec),
      start: toUs(t.tlStartSec),
    },
    template_id: '',
    template_scene: '',
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  }));

  // ── 텍스트 자막 머티리얼 + 세그먼트 (CapCut 네이티브 자막) ──
  const textMaterials = timings.filter(t => t.text).map(t => {
    const tid = uuid();
    return { id: tid, text: t.text, effectText: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });
  const fxMaterials = timings.filter(t => t.effectText).map(t => {
    const tid = uuid();
    return { id: tid, text: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });

  const textObjects = textMaterials.map(m => ({
    add_type: 0,
    alignment: 1,
    background_alpha: 0.0,
    background_color: '',
    background_height: 0.14,
    background_horizontal_offset: 0.0,
    background_round_radius: 0.0,
    background_style: 0,
    background_vertical_offset: 0.004,
    background_width: 0.14,
    bold_width: 0.0,
    border_alpha: 1.0,
    border_color: '',
    border_width: 0.08,
    check_flag: 7,
    content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
    fixed_height: -1.0,
    fixed_width: -1.0,
    font_category_id: '',
    font_category_name: '',
    font_id: '',
    font_name: '',
    font_path: '',
    font_resource_id: '',
    font_size: 8.0,
    font_source_platform: 0,
    font_team_id: '',
    font_title: 'default',
    font_url: '',
    fonts: [],
    force_apply_line_max_width: false,
    global_alpha: 1.0,
    has_shadow: false,
    id: m.id,
    initial_scale: 1.0,
    inner_padding: -1.0,
    is_rich_text: false,
    italic_degree: 0,
    ktv_color: '',
    language: '',
    layer_weight: 1,
    letter_spacing: 0.0,
    line_feed: 1,
    line_max_width: 0.82,
    line_spacing: 0.02,
    multi_language_current: 'none',
    name: '',
    original_size: [],
    preset_category: '',
    preset_category_id: '',
    preset_has_set_alignment: false,
    preset_id: '',
    preset_index: 0,
    preset_name: '',
    recognize_task_id: '',
    recognize_type: 0,
    relevance_segment: [],
    shadow_alpha: 0.9,
    shadow_angle: -45.0,
    shadow_color: '',
    shadow_distance: 0.04,
    shadow_point: { x: 0.6363961031, y: -0.6363961031 },
    shadow_smoothing: 0.45,
    shape_clip_x: false,
    shape_clip_y: false,
    style_name: '',
    sub_type: 0,
    subtitle_keywords: null,
    subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0,
    text_color: '#FFFFFF',
    text_curve: null,
    text_preset_resource_id: '',
    text_size: 30,
    text_to_audio_ids: [],
    tts_auto_update: false,
    type: 'subtitle',
    typesetting: 0,
    underline: false,
    underline_offset: 0.22,
    underline_width: 0.05,
    use_effect_default_color: true,
    words: null,
  }));

  const textSegments = textMaterials.map(m => ({
    cartoon: false,
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    common_keyframes: emptyArr,
    enable_adjust: false,
    enable_color_correct_adjust: false,
    enable_color_curves: false,
    enable_color_match_adjust: false,
    enable_color_wheels: false,
    enable_lut: false,
    enable_smart_color_adjust: false,
    extra_material_refs: emptyArr,
    group_id: '',
    hdr_settings: null,
    id: uuid(),
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: emptyArr,
    last_nonzero_volume: 1.0,
    material_id: m.id,
    render_index: 11000,
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 },
    reverse: false,
    source_timerange: { duration: toUs(m.durationSec), start: 0 },
    speed: 1.0,
    target_timerange: { duration: toUs(m.durationSec), start: toUs(m.tlStartSec) },
    template_id: '',
    template_scene: '',
    track_attribute: 0,
    track_render_index: 11000,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  }));

  const trackTextId = uuid();

  const draft = {
    canvas_config: {
      height,
      ratio: 'original',
      width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: emptyArr,
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: false,
      lyrics_taskinfo: emptyArr,
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: false,
      subtitle_taskinfo: emptyArr,
      system_font_list: emptyArr,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: Math.floor(Date.now() / 1000),
    duration: totalDurUs,
    extra_info: '',
    fps: fps,
    free_render_index_mode_on: false,
    group_container: null,
    id: projectId,
    keyframe_graph_list: emptyArr,
    last_modified_platform: {
      app_id: 3704,
      app_source: '',
      app_version: '5.0.0',
      device_id: '',
      hard_disk_id: '',
      mac_address: '',
      os: 'mac',
      os_version: '',
    },
    materials: {
      audios: emptyArr,
      canvases: emptyArr,
      drafts: emptyArr,
      effects: emptyArr,
      flowers: emptyArr,
      handwrites: emptyArr,
      head_animations: emptyArr,
      images: emptyArr,
      log_color_wheels: emptyArr,
      loudnesses: emptyArr,
      manual_deformations: emptyArr,
      material_animations: emptyArr,
      material_colors: emptyArr,
      placeholders: emptyArr,
      plugin_effects: emptyArr,
      realtime_denoises: emptyArr,
      shapes: emptyArr,
      smart_crops: emptyArr,
      smart_relayouts: emptyArr,
      speeds: [{
        curve_speed: null,
        id: speedId,
        mode: 0,
        name: '',
        speed: 1.0,
        type: 'speed',
      }],
      stickers: emptyArr,
      tail_animations: emptyArr,
      text_templates: emptyArr,
      texts: textObjects,
      transitions: emptyArr,
      video_effects: emptyArr,
      video_trackings: emptyArr,
      videos: [{
        audio_fade: null,
        category_id: '',
        category_name: 'local',
        check_flag: 0,
        crop: {
          lower_left_x: 0.0, lower_left_y: 1.0,
          lower_right_x: 1.0, lower_right_y: 1.0,
          upper_left_x: 0.0, upper_left_y: 0.0,
          upper_right_x: 1.0, upper_right_y: 0.0,
        },
        duration: srcDurUs,
        extra_type_option: 0,
        formula_id: '',
        freeze: null,
        has_audio: true,
        height,
        id: materialVideoId,
        intensifies_audio_path: '',
        intensifies_path: '',
        is_ai_generate_content: false,
        is_copyright: false,
        is_text_edit_overdub: false,
        is_unified_beauty_mode: false,
        local_id: '',
        local_material_id: '',
        material_id: '',
        material_name: videoFileName,
        material_url: '',
        media_path: '',
        music_id: '',
        object_locked: null,
        origin_material_id: '',
        path: videoFileName,
        request_id: '',
        reverse_path: '',
        roughcut_time_range: null,
        smart_motion: null,
        source: 0,
        source_platform: 0,
        stable: null,
        team_id: '',
        type: 'video',
        video_algorithm: null,
        width,
      }],
      vocal_beautifys: emptyArr,
      vocal_separations: emptyArr,
    },
    mutable_config: null,
    name: title,
    new_version: '81.0.0',
    platform: {
      app_id: 3704,
      app_source: '',
      app_version: '5.0.0',
      device_id: '',
      hard_disk_id: '',
      mac_address: '',
      os: 'mac',
      os_version: '',
    },
    relationships: emptyArr,
    render_index_track_mode_on: false,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    tracks: [{
      attribute: 0,
      flag: 0,
      id: trackVideoId,
      is_default_name: true,
      name: '',
      segments: videoSegments,
      type: 'video',
    }, ...(textSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackTextId,
      is_default_name: true,
      name: '',
      segments: textSegments,
      type: 'text',
    }] : [])],
    update_time: Math.floor(Date.now() / 1000),
    version: 360000,
  };

  return JSON.stringify(draft);
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
  const { target, scenes, title, videoBlob, videoFileName: rawVideoFileName, preset, width, height, fps, videoDurationSec } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName || 'video.mp4');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  if (target === 'premiere') {
    // FCP XML
    const xml = generateFcpXml({ scenes, title, videoFileName, preset, width, height, fps, videoDurationSec });
    zip.file(`${safeName}.xml`, xml);

    // [FIX #328] 영상 파일을 media/ 하위폴더에 배치 — XML pathurl과 일치
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }

    // [FIX #316] SRT를 sidecar 방식으로 media/ 폴더에 배치 — Premiere Captions 자동 인식
    // 영상 파일명과 동일한 이름.srt → Premiere가 자동으로 Captions 트랙에 로드
    const videoBase = (videoFileName || 'video.mp4').replace(/\.[^.]+$/, '');
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, true);
    if (dlgSrt) zip.file(`media/${videoBase}.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset, true);
    if (fxSrt) zip.file(`media/${videoBase}_효과.srt`, BOM + fxSrt);

    // 루트에도 SRT 복사 (수동 import 폴백용)
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
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
      '4. media/ 폴더의 영상+자막이 자동 연결됩니다.',
      '',
      '[ 자막 (Captions) ]',
      `• media/${videoBase}.srt 가 영상과 같은 이름으로 배치되어 있습니다.`,
      '• Premiere에서 자동 인식되지 않을 경우:',
      '  File > Import > Captions > media/ 폴더의 .srt 선택',
      '• 자막 타임코드는 편집 타임라인 기준입니다.',
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 장면마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 파랑(나레이션) / 초록(대사) / 청록(원본나레이션) / 주황(액션)',
      '• 메타데이터: Window > Metadata 패널에서 장면 설명·대사 확인',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${scenes.length}개`,
      `• 프리셋: ${presetLabel[preset || ''] || '기본'}`,
      `• 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else if (target === 'capcut') {
    // [FIX #316] CapCut — FCP XML (편집점 보존) + draft JSON + SRT
    // CapCut 2025+ File > Import > XML 지원 → 편집점이 타임라인에 바로 적용됨

    // 1. FCP XML (가장 확실한 편집점 import 방법)
    const capCutXml = generateFcpXml({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec });
    zip.file(`${safeName}.xml`, capCutXml);

    // 2. draft JSON (프로젝트 폴더 복사 방식 — 보조)
    const draftJson = generateCapCutDraftJson({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec });
    zip.file('draft_content.json', draftJson);
    zip.file('draft_info.json', draftJson);
    const draftMeta = JSON.stringify({
      draft_fold_path: '', draft_id: '', draft_name: title, draft_root_path: '',
      tm_draft_create: Math.floor(Date.now() / 1000), tm_draft_modified: Math.floor(Date.now() / 1000),
      tm_duration: Math.ceil((extractTimings(scenes, preset).at(-1)?.tlEndSec || 0) * 1_000_000),
    });
    zip.file('draft_meta_info.json', draftMeta);

    // 3. 영상 파일 (media/ 하위 — XML pathurl과 일치)
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
      // 루트에도 복사 (draft JSON용)
      zip.file(videoFileName || 'video.mp4', videoBlob);
    }

    // 4. SRT 폴백
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, true);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, true);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — CapCut ===`,
      '',
      '★ 추천: XML import (편집점 + 컷 자동 적용)',
      '1. CapCut 데스크톱을 열고 새 프로젝트를 생성합니다.',
      '2. File > Import > XML File 클릭',
      `3. "${safeName}.xml" 선택`,
      '4. media/ 폴더 영상이 자동 연결되면서 편집점이 바로 적용됩니다.',
      '',
      '[ 대안: 프로젝트 폴더 복사 ]',
      '1. ZIP 압축 해제한 폴더를 아래 경로에 복사:',
      '   • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/',
      '   • Win: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\',
      '2. CapCut 재시작 → 프로젝트 목록에서 선택',
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else {
    // [FIX #316] VREW — FCP XML (편집점 보존) + SRT + 영상
    // VREW도 Premiere XML import 지원 (File > Import > XML)

    // 1. FCP XML
    const vrewXml = generateFcpXml({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec });
    zip.file(`${safeName}.xml`, vrewXml);

    // 2. 영상 파일 (media/ — XML pathurl 일치)
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }

    // 3. SRT
    const srt = generateNleSrt(scenes, 'dialogue', preset, true);
    if (srt) zip.file(`${safeName}_자막.srt`, BOM + srt);
    const narSrt = generateNleSrt(scenes, 'narration', preset, true);
    if (narSrt) zip.file(`${safeName}_나레이션.srt`, BOM + narSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, true);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '★ 추천: XML import (편집점 + 컷 자동 적용)',
      '1. VREW에서 File > 가져오기 > XML 파일',
      `2. "${safeName}.xml" 선택 → 편집점 타임라인 자동 생성`,
      '3. media/ 폴더 영상이 자동 연결됩니다.',
      '',
      '[ 대안: SRT 자막만 가져오기 ]',
      '1. VREW에서 영상 파일을 불러옵니다.',
      `2. 자막 > SRT 불러오기 > "${safeName}_자막.srt"`,
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
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
        name: sanitizeFileName(sv?.fileName || `source_${fileIdx}.mp4`),
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

  // ── V2 나레이션 자막 트랙 (편집실 — narrationText 기반) ──
  const edlSubtitleClips = clips.filter(c => c.entry.narrationText).map((c, i) => {
    const durFrames = toFrames(c.recEnd - c.recStart);
    return `
          <generatoritem id="edl-sub-${i + 1}">
            <name>${escXml(c.entry.narrationText.slice(0, 40))}</name>
            <duration>${durFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${durFrames}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(c.entry.narrationText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>0 0.38</value></parameter>
            </effect>
          </generatoritem>`;
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
        </track>${edlSubtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${edlSubtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
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
  const safeName = sanitizeProjectName(title);
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

// ──────────────────────────────────────────────
// 편집실 타임라인 → NLE 내보내기 (CapCut / Premiere / VREW)
// ──────────────────────────────────────────────

export type EditRoomNleTarget = 'premiere' | 'capcut' | 'vrew';

interface EditRoomScene {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  scriptText?: string;
}

interface EditRoomNarrationLine {
  sceneId: string;
  audioUrl?: string;
}

/** 편집실 타임라인 → SRT 문자열 */
function buildEditRoomSrt(timeline: UnifiedSceneTiming[]): string {
  let idx = 1;
  const entries: string[] = [];
  for (const t of timeline) {
    for (const seg of t.subtitleSegments) {
      if (!seg.text.trim()) continue;
      entries.push(`${idx}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      idx++;
    }
  }
  return entries.join('\n\n');
}

/** 편집실 타임라인 → FCP XML (xmeml v5) — 이미지/영상 클립 시퀀스 + 오디오 트랙 */
function buildEditRoomFcpXml(params: {
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  title: string;
  fps: number;
  width: number;
  height: number;
  /** 실제 ZIP에 들어간 미디어 파일명 맵 (index → 파일명). 없으면 scene.videoUrl 기준 추정 */
  mediaFileMap?: Map<number, string>;
  /** [FIX #473] 실제 ZIP에 들어간 나레이션 오디오 파일명 맵 (index → 파일명) */
  narrationFileMap?: Map<number, string>;
}): string {
  const { timeline, scenes, title, fps, width, height, mediaFileMap, narrationFileMap } = params;
  if (timeline.length === 0) return '';

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps);
  const totalDurSec = timeline[timeline.length - 1].imageEndTime;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);

  // 마커 (장면 경계)
  const markers = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    const label = scene?.scriptText?.slice(0, 50) || `장면 ${i + 1}`;
    return `
    <marker>
      <name>${escXml(`#${i + 1} ${label}`)}</name>
      <comment></comment>
      <in>${toFrames(t.imageStartTime)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // 비디오 클립 (장면마다 별도 파일 + 오디오 미디어 스펙 포함)
  const videoClips = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    // [FIX #472] mediaFileMap이 있으면 실제 다운로드된 파일 기준, 없으면 기존 로직
    const actualFile = mediaFileMap?.get(i);
    const ext = actualFile ? actualFile.split('.').pop()! : (scene?.videoUrl ? 'mp4' : 'jpg');
    const fileName = actualFile ? `media/${actualFile}` : `media/${String(i + 1).padStart(3, '0')}_scene.${ext}`;
    const clipDurFrames = toFrames(t.imageDuration);
    const clipLabel = (scene?.scriptText || `장면 ${i + 1}`).slice(0, 40);
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`#${i + 1} ${clipLabel}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>
            <file id="file-${i + 1}">
              <name>${escXml(`${String(i + 1).padStart(3, '0')}_scene.${ext}`)}</name>
              <pathurl>${escXml(fileName)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>
            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Iris</label2></labels>
            <logginginfo>
              <description>${escXml(scene?.scriptText || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
            </logginginfo>
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

  // 오디오 클립 (비디오 클립에 링크)
  const audioClips = timeline.map((t, i) => {
    const clipDurFrames = toFrames(t.imageDuration);
    return `
          <clipitem id="audio-${i + 1}">
            <name>${escXml(`Audio ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>
            <file id="file-${i + 1}"/>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
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

  // 자막 트랙
  const subtitleClips = timeline
    .flatMap(t => t.subtitleSegments.filter(seg => seg.text.trim()))
    .map((seg, i) => `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(seg.text.slice(0, 40))}</name>
            <duration>${toFrames(seg.endTime - seg.startTime)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(seg.endTime - seg.startTime)}</out>
            <start>${toFrames(seg.startTime)}</start>
            <end>${toFrames(seg.endTime)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(seg.text)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>0 0.38</value></parameter>
            </effect>
          </generatoritem>`).join('');

  // [FIX #473] 나레이션 오디오 트랙 (A2) — 장면별 나레이션 MP3를 타임라인 올바른 위치에 자동 배치
  const narrationClips = timeline.map((t, i) => {
    const narFile = narrationFileMap?.get(i);
    if (!narFile) return '';
    const clipDurFrames = toFrames(t.imageDuration);
    return `
          <clipitem id="narration-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`Narration ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>
            <file id="narfile-${i + 1}">
              <name>${escXml(narFile)}</name>
              <pathurl>${escXml(`audio/${narFile}`)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Caribbean</label2></labels>
          </clipitem>`;
  }).join('');
  const hasNarrationTrack = narrationClips.replace(/\s/g, '').length > 0;

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
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>${hasNarrationTrack ? `
        <track>
          <outputchannelindex>1</outputchannelindex>${narrationClips}
        </track>` : ''}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** 이미지/영상 URL에서 Blob으로 fetch (data: / blob: / https: 모두 지원) */
async function fetchAssetBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  // data: URL → 직접 디코딩 (fetch 폴백 포함)
  if (url.startsWith('data:')) {
    try {
      const arr = url.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch {
      // atob 실패 시 fetch 폴백
      try { const r = await fetch(url); return await r.blob(); } catch { return null; }
    }
  }
  // blob: URL
  if (url.startsWith('blob:')) {
    try { const r = await fetch(url); return await r.blob(); } catch { return null; }
  }
  // https / http URL
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch { /* CORS 실패 시 무시 */ }
  return null;
}

/** 편집실 타임라인 → CapCut 네이티브 SRT (장면별 통합 자막 — 가장 안정적 import 방법) */
function buildEditRoomSceneSrt(timeline: UnifiedSceneTiming[], scenes: EditRoomScene[]): string {
  const entries: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    // 자막 세그먼트가 있으면 사용, 없으면 대본 텍스트 사용
    const segs = t.subtitleSegments.filter(seg => seg.text.trim());
    if (segs.length > 0) {
      for (const seg of segs) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      }
    } else {
      const scene = scenes.find(s => s.id === t.sceneId);
      if (scene?.scriptText?.trim()) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(t.imageStartTime)} --> ${secondsToSrtTime(t.imageEndTime)}\n${breakLines(scene.scriptText)}`);
      }
    }
  }
  return entries.join('\n\n');
}

/** NLE 내보내기 결과 (ZIP + 미디어 통계) */
export interface NleExportResult {
  blob: Blob;
  videoCount: number;
  imageCount: number;
  totalScenes: number;
}

/** 편집실 타임라인 → NLE 패키지 ZIP (CapCut / Premiere / VREW) */
export async function buildEditRoomNleZip(params: {
  target: EditRoomNleTarget;
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  narrationLines: EditRoomNarrationLine[];
  title: string;
  aspectRatio: string;
  fps?: number;
}): Promise<NleExportResult> {
  const { target, timeline, scenes, narrationLines, title, aspectRatio, fps = 30 } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  // 해상도 결정
  let w = 1920, h = 1080;
  if (aspectRatio === '9:16') { w = 1080; h = 1920; }
  else if (aspectRatio === '1:1') { w = 1080; h = 1080; }
  else if (aspectRatio === '4:3') { w = 1440; h = 1080; }

  // SRT 자막 (모든 타겟에서 생성)
  const srtContent = buildEditRoomSrt(timeline);
  if (srtContent) zip.file(`${safeName}_자막.srt`, BOM + srtContent);

  // 장면별 통합 SRT (CapCut용 — 대본 텍스트 폴백 포함)
  const sceneSrt = buildEditRoomSceneSrt(timeline, scenes);
  if (sceneSrt && target === 'capcut') {
    zip.file(`${safeName}_장면자막.srt`, BOM + sceneSrt);
  }

  // [FIX #472] 미디어 에셋 수집 — 영상 다운로드 실패 시 이미지 폴백 + 실제 파일명 추적
  const mediaFileMap = new Map<number, string>(); // index → 실제 파일명
  const narrationFileMap = new Map<number, string>(); // index → 나레이션 오디오 파일명
  let videoCount = 0;
  let imageCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const scene = scenes.find(s => s.id === t.sceneId);
    if (!scene) continue;

    const idx = String(i + 1).padStart(3, '0');
    let added = false;

    // 영상 우선 시도
    if (scene.videoUrl) {
      const blob = await fetchAssetBlob(scene.videoUrl);
      if (blob && blob.size > 0) {
        const fileName = `${idx}_scene.mp4`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        videoCount++;
        added = true;
      }
      // 영상 다운로드 실패 → 이미지 폴백
    }

    if (!added && scene.imageUrl) {
      const blob = await fetchAssetBlob(scene.imageUrl);
      if (blob) {
        const ext = scene.imageUrl.includes('.png') || scene.imageUrl.startsWith('data:image/png') ? 'png' : 'jpg';
        const fileName = `${idx}_scene.${ext}`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        imageCount++;
      }
    }

    // 나레이션 오디오
    const narration = narrationLines.find(l => l.sceneId === t.sceneId);
    if (narration?.audioUrl) {
      const blob = await fetchAssetBlob(narration.audioUrl);
      if (blob) {
        const narFileName = `${idx}_narration.mp3`;
        zip.file(`audio/${narFileName}`, blob);
        narrationFileMap.set(i, narFileName);
      }
    }
  }

  // [FIX #472] FCP XML — mediaFileMap 전달하여 실제 파일명 기준으로 XML 생성
  // [FIX #473] narrationFileMap 전달하여 나레이션 오디오를 A2 트랙에 자동 배치
  const xml = buildEditRoomFcpXml({ timeline, scenes, title, fps, width: w, height: h, mediaFileMap, narrationFileMap });
  zip.file(`${safeName}.xml`, xml);

  // CapCut 전용: draft_content.json (이미지+자막+나레이션 타임라인 자동 배치)
  if (target === 'capcut') {
    const totalDurUs = toUs(timeline[timeline.length - 1]?.imageEndTime || 0);
    const projectId = uuid();
    const speedId = uuid();
    const emptyArr: never[] = [];

    // ── 미디어 머티리얼: 장면별 이미지/영상 ──
    const videoMaterials: { id: string; path: string; dur: number; isPhoto: boolean }[] = [];
    const audioMaterials: { id: string; path: string; dur: number }[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const fileName = mediaFileMap.get(i);
      if (!fileName) continue;
      const isVideo = fileName.endsWith('.mp4');
      videoMaterials.push({
        id: uuid(),
        path: `media/${fileName}`,
        dur: toUs(timeline[i].imageDuration),
        isPhoto: !isVideo,
      });
    }

    for (let i = 0; i < timeline.length; i++) {
      const narFileName = narrationFileMap.get(i);
      if (!narFileName) continue;
      audioMaterials.push({
        id: uuid(),
        path: `audio/${narFileName}`,
        dur: toUs(timeline[i].imageDuration),
      });
    }

    // ── 비디오 세그먼트 (메인 트랙) ──
    const videoSegments = timeline.map((t, i) => {
      const mat = videoMaterials[i];
      if (!mat) return null;
      return {
        cartoon: false,
        clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
        common_keyframes: emptyArr,
        enable_adjust: true,
        enable_color_correct_adjust: false,
        enable_color_curves: true,
        enable_color_match_adjust: false,
        enable_color_wheels: true,
        enable_lut: true,
        enable_smart_color_adjust: false,
        extra_material_refs: [speedId],
        group_id: '',
        hdr_settings: null,
        id: uuid(),
        intensifies_audio: false,
        is_placeholder: false,
        is_tone_modify: false,
        keyframe_refs: emptyArr,
        last_nonzero_volume: 1.0,
        material_id: mat.id,
        render_index: 0,
        responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 },
        reverse: false,
        source_timerange: { duration: toUs(t.imageDuration), start: 0 },
        speed: 1.0,
        target_timerange: { duration: toUs(t.imageDuration), start: toUs(t.imageStartTime) },
        template_id: '',
        template_scene: '',
        track_attribute: 0,
        track_render_index: 0,
        uniform_scale: { on: true, value: 1.0 },
        visible: true,
        volume: 1.0,
      };
    }).filter(Boolean);

    // ── 텍스트 머티리얼 + 세그먼트 (자막 트랙) ──
    const textMaterials: { id: string; text: string; start: number; dur: number }[] = [];
    for (const t of timeline) {
      for (const seg of t.subtitleSegments) {
        if (!seg.text.trim()) continue;
        textMaterials.push({ id: uuid(), text: seg.text, start: toUs(seg.startTime), dur: toUs(seg.endTime - seg.startTime) });
      }
    }

    const textObjects = textMaterials.map(m => ({
      add_type: 0, alignment: 1, background_alpha: 0.0, background_color: '', background_height: 0.14,
      background_horizontal_offset: 0.0, background_round_radius: 0.0, background_style: 0,
      background_vertical_offset: 0.004, background_width: 0.14, bold_width: 0.0, border_alpha: 1.0,
      border_color: '', border_width: 0.08, check_flag: 7,
      content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
      fixed_height: -1.0, fixed_width: -1.0, font_category_id: '', font_category_name: '', font_id: '',
      font_name: '', font_path: '', font_resource_id: '', font_size: 8.0, font_source_platform: 0,
      font_team_id: '', font_title: 'default', font_url: '', fonts: [],
      force_apply_line_max_width: false, global_alpha: 1.0, has_shadow: false, id: m.id,
      initial_scale: 1.0, inner_padding: -1.0, is_rich_text: false, italic_degree: 0,
      ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0.0, line_feed: 1,
      line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '',
      original_size: [], preset_category: '', preset_category_id: '', preset_has_set_alignment: false,
      preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
      relevance_segment: [], shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: '',
      shadow_distance: 0.04, shadow_point: { x: 0.6363961031, y: -0.6363961031 },
      shadow_smoothing: 0.45, shape_clip_x: false, shape_clip_y: false, style_name: '',
      sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0.0,
      text_alpha: 1.0, text_color: '#FFFFFF', text_curve: null, text_preset_resource_id: '',
      text_size: 30, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle',
      typesetting: 0, underline: false, underline_offset: 0.22, underline_width: 0.05,
      use_effect_default_color: true, words: null,
    }));

    const textSegments = textMaterials.map(m => ({
      cartoon: false,
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      common_keyframes: emptyArr, enable_adjust: false, enable_color_correct_adjust: false,
      enable_color_curves: false, enable_color_match_adjust: false, enable_color_wheels: false,
      enable_lut: false, enable_smart_color_adjust: false, extra_material_refs: emptyArr,
      group_id: '', hdr_settings: null, id: uuid(), intensifies_audio: false,
      is_placeholder: false, is_tone_modify: false, keyframe_refs: emptyArr,
      last_nonzero_volume: 1.0, material_id: m.id, render_index: 11000,
      responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 },
      reverse: false, source_timerange: { duration: m.dur, start: 0 },
      speed: 1.0, target_timerange: { duration: m.dur, start: m.start },
      template_id: '', template_scene: '', track_attribute: 0, track_render_index: 11000,
      uniform_scale: { on: true, value: 1.0 }, visible: true, volume: 1.0,
    }));

    // ── 오디오 세그먼트 (나레이션 트랙) ──
    const audioSegments = timeline.map((t, i) => {
      const mat = audioMaterials.find((_, ai) => {
        // i번째 타임라인의 나레이션 찾기
        let count = 0;
        for (let j = 0; j < timeline.length; j++) {
          if (narrationFileMap.has(j)) {
            if (j === i) return count === ai;
            count++;
          }
        }
        return false;
      });
      const narIdx = [...narrationFileMap.keys()].indexOf(i);
      if (narIdx === -1 || !audioMaterials[narIdx]) return null;
      const aMat = audioMaterials[narIdx];
      return {
        cartoon: false,
        clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
        common_keyframes: emptyArr, enable_adjust: false, enable_color_correct_adjust: false,
        enable_color_curves: false, enable_color_match_adjust: false, enable_color_wheels: false,
        enable_lut: false, enable_smart_color_adjust: false, extra_material_refs: emptyArr,
        group_id: '', hdr_settings: null, id: uuid(), intensifies_audio: false,
        is_placeholder: false, is_tone_modify: false, keyframe_refs: emptyArr,
        last_nonzero_volume: 1.0, material_id: aMat.id, render_index: 0,
        responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 },
        reverse: false, source_timerange: { duration: toUs(t.imageDuration), start: 0 },
        speed: 1.0, target_timerange: { duration: toUs(t.imageDuration), start: toUs(t.imageStartTime) },
        template_id: '', template_scene: '', track_attribute: 0, track_render_index: 0,
        uniform_scale: { on: true, value: 1.0 }, visible: true, volume: 1.0,
      };
    }).filter(Boolean);

    // ── draft_content.json 조립 ──
    const draft = {
      canvas_config: { height: h, ratio: 'original', width: w },
      color_space: 0,
      config: {
        adjust_max_index: 1, attachment_info: emptyArr, combination_max_index: 1,
        export_range: null, extract_audio_last_index: 1, lyrics_recognition_id: '',
        lyrics_sync: false, lyrics_taskinfo: emptyArr, maintrack_adsorb: true,
        material_save_mode: 0, original_sound_last_index: 1, record_audio_last_index: 1,
        sticker_max_index: 1, subtitle_keywords_config: null, subtitle_recognition_id: '',
        subtitle_sync: false, subtitle_taskinfo: emptyArr, system_font_list: emptyArr,
        video_mute: false, zoom_info_params: null,
      },
      cover: null,
      create_time: Math.floor(Date.now() / 1000),
      duration: totalDurUs,
      extra_info: '',
      fps: fps,
      free_render_index_mode_on: false,
      group_container: null,
      id: projectId,
      keyframe_graph_list: emptyArr,
      last_modified_platform: { app_id: 3704, app_source: '', app_version: '5.9.0', device_id: '', hard_disk_id: '', mac_address: '', os: 'mac', os_version: '' },
      materials: {
        audios: audioMaterials.map(m => ({
          app_id: 0, category_id: '', category_name: 'local', check_flag: 0,
          duration: m.dur, effect_id: '', formula_id: '', id: m.id,
          intensifies_path: '', local_material_id: '', music_id: '', name: m.path.split('/').pop() || '',
          path: m.path, request_id: '', resource_id: '', source_platform: 0,
          team_id: '', text_id: '', tone_category_id: '', tone_category_name: '',
          tone_effect_id: '', tone_effect_name: '', tone_platform: '', tone_second_category_id: '',
          tone_second_category_name: '', tone_speaker: '', tone_type: '', type: 'extract_music',
          video_id: '', wave_points: [],
        })),
        canvases: emptyArr, drafts: emptyArr, effects: emptyArr, flowers: emptyArr,
        handwrites: emptyArr, head_animations: emptyArr, images: emptyArr,
        log_color_wheels: emptyArr, loudnesses: emptyArr, manual_deformations: emptyArr,
        material_animations: emptyArr, material_colors: emptyArr, placeholders: emptyArr,
        plugin_effects: emptyArr, realtime_denoises: emptyArr, shapes: emptyArr,
        smart_crops: emptyArr, smart_relayouts: emptyArr,
        speeds: [{ curve_speed: null, id: speedId, mode: 0, name: '', speed: 1.0, type: 'speed' }],
        stickers: emptyArr, tail_animations: emptyArr, text_templates: emptyArr,
        texts: textObjects,
        transitions: emptyArr, video_effects: emptyArr, video_trackings: emptyArr,
        videos: videoMaterials.map(m => ({
          audio_fade: null, category_id: '', category_name: 'local', check_flag: 0,
          crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
          duration: m.dur, extra_type_option: 0, formula_id: '', freeze: null,
          has_audio: !m.isPhoto, height: h, id: m.id,
          intensifies_audio_path: '', intensifies_path: '', is_ai_generate_content: false,
          is_copyright: false, is_text_edit_overdub: false, is_unified_beauty_mode: false,
          local_id: '', local_material_id: '', material_id: '', material_name: m.path.split('/').pop() || '',
          material_url: '', media_path: '', music_id: '', object_locked: null,
          origin_material_id: '', path: m.path, request_id: '', reverse_path: '',
          roughcut_time_range: null, smart_motion: null, source: 0, source_platform: 0,
          stable: null, team_id: '', type: m.isPhoto ? 'photo' : 'video',
          video_algorithm: null, width: w,
        })),
        vocal_beautifys: emptyArr, vocal_separations: emptyArr,
      },
      mutable_config: null,
      name: title,
      new_version: '110.0.0',
      platform: { app_id: 3704, app_source: '', app_version: '5.9.0', device_id: '', hard_disk_id: '', mac_address: '', os: 'mac', os_version: '' },
      relationships: emptyArr,
      render_index_track_mode_on: false,
      retouch_cover: null,
      source: 'default',
      static_cover_image_path: '',
      tracks: [
        { attribute: 0, flag: 0, id: uuid(), is_default_name: true, name: '', segments: videoSegments, type: 'video' },
        ...(textSegments.length > 0 ? [{ attribute: 0, flag: 0, id: uuid(), is_default_name: true, name: '', segments: textSegments, type: 'text' }] : []),
        ...(audioSegments.length > 0 ? [{ attribute: 0, flag: 0, id: uuid(), is_default_name: true, name: '', segments: audioSegments, type: 'audio' }] : []),
      ],
      update_time: Math.floor(Date.now() / 1000),
      version: 360000,
    };

    const draftJson = JSON.stringify(draft);
    zip.file('draft_content.json', draftJson);
    zip.file('draft_info.json', draftJson);
    zip.file('draft_meta_info.json', JSON.stringify({
      draft_fold_path: '', draft_id: projectId, draft_name: title, draft_root_path: '',
      tm_draft_create: Math.floor(Date.now() / 1000),
      tm_draft_modified: Math.floor(Date.now() / 1000),
      tm_duration: totalDurUs,
    }));
  }

  // README (CapCut은 SRT import 가장 안정적이라 SRT 중심으로 안내)
  if (target === 'premiere') {
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '4. media/ 폴더의 이미지/영상이 자동 연결됩니다.',
      '',
      '[ 자막 ]',
      `• "${safeName}_자막.srt" → Captions 트랙으로 가져올 수 있습니다.`,
      '',
      '[ 나레이션 ]',
      narrationFileMap.size > 0
        ? `• 나레이션 ${narrationFileMap.size}개가 A2 오디오 트랙에 자동 배치됩니다.`
        : '• audio/ 폴더의 나레이션 MP3를 오디오 트랙에 배치하세요.',
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  } else if (target === 'capcut') {
    zip.file('README.txt', [
      `=== ${title} — CapCut 프로젝트 파일 ===`,
      '',
      '★ 추천: 프로젝트 폴더 복사 (이미지+자막+나레이션 자동 배치!)',
      '1. CapCut 데스크톱을 완전히 종료합니다.',
      '2. ZIP 압축을 해제합니다.',
      '3. 압축 해제한 폴더를 아래 경로에 복사합니다:',
      '   • Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\',
      '   • Mac: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/',
      '4. CapCut을 다시 실행하면 프로젝트 목록에 자동으로 나타납니다!',
      '5. 이미지/영상, 자막, 나레이션이 모두 타임라인에 배치되어 있습니다.',
      '',
      '[ 대안 1: SRT 자막 가져오기 ]',
      '1. CapCut에서 새 프로젝트 생성 후 media/ 이미지를 타임라인에 배치',
      `2. 자막 > 자막 가져오기 > "${safeName}_자막.srt" 선택`,
      '',
      '[ 대안 2: XML 가져오기 ]',
      `• File > Import > XML File > "${safeName}.xml"`,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
      narrationFileMap.size > 0
        ? `• 나레이션 ${narrationFileMap.size}개 자동 배치`
        : '',
    ].filter(Boolean).join('\n'));
  } else {
    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '★ 추천: XML 가져오기',
      '1. VREW에서 File > 가져오기 > XML 파일',
      `2. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '3. media/ 폴더 이미지/영상이 자동 연결됩니다.',
      '',
      '[ 대안: SRT 자막만 가져오기 ]',
      '1. media/ 이미지/영상을 VREW에 import 후',
      `2. 자막 > SRT 불러오기 > "${safeName}_자막.srt"`,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, videoCount, imageCount, totalScenes: timeline.length };
}
