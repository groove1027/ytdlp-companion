import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { buildEditRoomNleZip } from '../src/services/nleExportService.ts';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const OUTPUT_FOLDER = process.env.CAPCUT_VERIFY_OUTPUT || path.join(process.cwd(), 'test', 'output', 'verify_574_final_capcut');

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.error = null;
      this.onload = null;
      this.onerror = null;
    }

    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onload?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      }
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function toDataUrl(filePath, mime) {
  const buf = await fs.readFile(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function parseSrtEntries(content) {
  return content
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split('\n');
      return {
        index: Number(lines[0]),
        timecode: lines[1],
        text: lines.slice(2).join('\n'),
      };
    });
}

async function extractZipToDirectory(zip, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const destPath = path.join(targetDir, entry.name);
    if (entry.dir) {
      await fs.mkdir(destPath, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const data = await entry.async('nodebuffer');
    await fs.writeFile(destPath, data);
  }
}

async function writeDraftSettings(targetDir) {
  const nowSec = Math.floor(Date.now() / 1000);
  const content = [
    '[General]',
    `draft_create_time=${nowSec}`,
    `draft_last_edit_time=${nowSec}`,
    'real_edit_keys=1',
    'real_edit_seconds=0',
    '',
  ].join('\n');
  await fs.writeFile(path.join(targetDir, 'draft_settings'), content, 'utf8');
}

async function main() {
  const scene1Video = await toDataUrl(path.join(SAMPLE_ROOT, '001_scene.mp4'), 'video/mp4');
  const scene2Video = await toDataUrl(path.join(SAMPLE_ROOT, '002_scene.mp4'), 'video/mp4');
  const narration1 = await toDataUrl(path.join(SAMPLE_ROOT, '001_narration.mp3'), 'audio/mpeg');
  const narration2 = await toDataUrl(path.join(SAMPLE_ROOT, '002_narration.mp3'), 'audio/mpeg');

  // 의도적으로 순서와 절대 시간이 뒤틀린 입력.
  // export가 제대로 정규화되면 scene-b가 0초, scene-a가 2초에 와야 한다.
  const timeline = [
    {
      sceneId: 'scene-b',
      sceneIndex: 0,
      imageStartTime: 2,
      imageEndTime: 4,
      imageDuration: 2,
      subtitleSegments: [{ lineId: 'sub-b', text: '둘째 장면', startTime: 2, endTime: 4 }],
      effectPreset: 'smooth',
      volume: 100,
      speed: 1,
    },
    {
      sceneId: 'scene-a',
      sceneIndex: 1,
      imageStartTime: 0,
      imageEndTime: 2,
      imageDuration: 2,
      subtitleSegments: [{ lineId: 'sub-a', text: '첫째 장면', startTime: 0, endTime: 2 }],
      effectPreset: 'smooth',
      volume: 100,
      speed: 1,
    },
  ];

  const scenes = [
    { id: 'scene-b', videoUrl: scene2Video, imageUrl: undefined, scriptText: '둘째 장면' },
    { id: 'scene-a', videoUrl: scene1Video, imageUrl: undefined, scriptText: '첫째 장면' },
  ];

  const narrationLines = [
    { sceneId: 'scene-b', audioUrl: narration2, startTime: 2, duration: 2, index: 1 },
    { sceneId: 'scene-a', audioUrl: narration1, startTime: 0, duration: 2, index: 0 },
  ];

  const result = await buildEditRoomNleZip({
    target: 'capcut',
    timeline,
    scenes,
    narrationLines,
    title: 'verify_574_final',
    aspectRatio: '16:9',
    fps: 30,
  });

  const zipBuffer = Buffer.from(await result.blob.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);

  const draftContent = JSON.parse(await zip.file('draft_content.json').async('string'));
  const draftInfo = JSON.parse(await zip.file('draft_info.json').async('string'));
  const srtContent = await zip.file('verify_574_final_자막.srt').async('string');
  const xmlContent = await zip.file('verify_574_final.xml').async('string');

  const videoTrack = draftContent.tracks.find((track) => track.type === 'video');
  const textTrack = draftContent.tracks.find((track) => track.type === 'text');
  const audioTrack = draftContent.tracks.find((track) => track.type === 'audio');

  assert(videoTrack?.segments?.length === 2, 'CapCut draft video segments should contain 2 scenes');
  assert(textTrack?.segments?.length === 2, 'CapCut draft text segments should contain 2 subtitles');
  assert(audioTrack?.segments?.length === 2, 'CapCut draft audio segments should contain 2 narrations');

  const videoStarts = videoTrack.segments.map((segment) => segment.target_timerange.start);
  const textStarts = textTrack.segments.map((segment) => segment.target_timerange.start);
  const audioStarts = audioTrack.segments.map((segment) => segment.target_timerange.start);

  assert(videoStarts[0] === 0 && videoStarts[1] === 2_000_000, `Unexpected video segment starts: ${videoStarts.join(', ')}`);
  assert(textStarts[0] === 0 && textStarts[1] === 2_000_000, `Unexpected text segment starts: ${textStarts.join(', ')}`);
  assert(audioStarts[0] === 0 && audioStarts[1] === 2_000_000, `Unexpected audio segment starts: ${audioStarts.join(', ')}`);

  const textPayloads = draftContent.materials.texts.map((material) => JSON.parse(material.content).text);
  assert(textPayloads[0] === '둘째 장면' && textPayloads[1] === '첫째 장면', `Unexpected text material order: ${textPayloads.join(' / ')}`);

  const srtEntries = parseSrtEntries(srtContent.replace(/^\uFEFF/, ''));
  assert(srtEntries.length === 2, `Unexpected SRT entry count: ${srtEntries.length}`);
  assert(srtEntries[0].text === '둘째 장면' && srtEntries[1].text === '첫째 장면', `Unexpected SRT order: ${srtEntries.map((entry) => entry.text).join(' / ')}`);
  assert(srtEntries[0].timecode.startsWith('00:00:00,000 --> 00:00:02,000'), `Unexpected first SRT timecode: ${srtEntries[0].timecode}`);
  assert(srtEntries[1].timecode.startsWith('00:00:02,000 --> 00:00:04,000'), `Unexpected second SRT timecode: ${srtEntries[1].timecode}`);

  assert(xmlContent.includes('<start>0</start>') && xmlContent.includes('<start>60</start>'), 'FCP XML should contain 0f and 60f starts for 30fps timeline');
  assert(xmlContent.indexOf('#1 둘째 장면') !== -1 && xmlContent.indexOf('#2 첫째 장면') !== -1, 'FCP XML clip order should follow sceneOrder');

  await extractZipToDirectory(zip, OUTPUT_FOLDER);
  await writeDraftSettings(OUTPUT_FOLDER);

  console.log(JSON.stringify({
    ok: true,
    outputFolder: OUTPUT_FOLDER,
    draftId: draftInfo.draft_id,
    draftPath: draftInfo.draft_fold_path,
    videoStarts,
    textStarts,
    audioStarts,
    srtOrder: srtEntries.map((entry) => entry.text),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
