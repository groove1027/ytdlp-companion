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
        </track>
        <track><enabled>TRUE</enabled>${subtitleClips}
        </track>${effectSubClips ? `
        <track><enabled>TRUE</enabled>${effectSubClips}
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
        <track>${audioClips}
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
  const { scenes, title, videoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec } = params;
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
      texts: emptyArr,
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
    }],
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
