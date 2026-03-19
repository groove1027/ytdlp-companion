import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from '../src/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const CAPCUT_OUTPUT_FOLDER = process.env.CAPCUT_MATRIX_OUTPUT || path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_NLE_MATRIX_CAPCUT');
const PREMIERE_OUTPUT_FOLDER = process.env.PREMIERE_MATRIX_OUTPUT || path.join(process.cwd(), 'test', 'output', 'verify_nle_matrix_premiere');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function toDataUrl(filePath, mime) {
  const buf = await fs.readFile(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
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

async function main() {
  const sourceVideo = await toDataUrl(path.join(SAMPLE_ROOT, '001_scene.mp4'), 'video/mp4');
  const narration1 = await toDataUrl(path.join(SAMPLE_ROOT, '001_narration.mp3'), 'audio/mpeg');
  const narration2 = await toDataUrl(path.join(SAMPLE_ROOT, '002_narration.mp3'), 'audio/mpeg');
  const externalBaseUrl = process.env.CAPCUT_TEST_BASE_URL || '';
  const distServer = externalBaseUrl ? null : await startDistServer();
  const baseUrl = externalBaseUrl || distServer.baseUrl;
  const { appUrl, nleModuleUrl, jszipModuleUrl } = await getBuiltModuleUrls(baseUrl);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(appUrl, { waitUntil: 'load', timeout: 120000 });

    const summary = await page.evaluate(async ({ sourceVideo, narration1, narration2, nleModuleUrl, jszipModuleUrl }) => {
      const nleModule = await import(nleModuleUrl);
      const nleService = nleModule.n || nleModule.default || nleModule;
      const buildNlePackageZip =
        nleService.buildNlePackageZip ||
        nleModule.buildNlePackageZip;
      if (typeof buildNlePackageZip !== 'function') {
        throw new Error(`buildNlePackageZip export not found: ${Object.keys(nleModule).join(', ')}`);
      }
      const zipModule = await import(jszipModuleUrl);
      const JSZipCtor = zipModule.default || zipModule.J || zipModule.j || zipModule;
      const blobToBase64 = async (blob) => {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('Failed to encode blob'));
          reader.readAsDataURL(blob);
        });
        return dataUrl.slice(dataUrl.indexOf(',') + 1);
      };

      const videoBlob = await fetch(sourceVideo).then((response) => response.blob());
      const scenes = [
        {
          cutNum: 1,
          timeline: '00:00.000~00:01.000',
          sourceTimeline: '00:00.000~00:01.000',
          dialogue: '첫 번째 문장은 자연스럽게 줄바꿈 되어야 합니다.',
          effectSub: '강조 자막 첫 장면',
          sceneDesc: '첫 장면 설명',
          mode: 'dialogue',
          audioContent: '첫 번째 문장은 자연스럽게 줄바꿈 되어야 합니다.',
          duration: '1초',
          videoDirection: '정면 샷',
          timecodeSource: '00:00.000~00:01.000',
        },
        {
          cutNum: 2,
          timeline: '00:01.000~00:02.000',
          sourceTimeline: '00:01.000~00:02.000',
          dialogue: '두 번째 장면도 나레이션 길이에 맞춰야 합니다.',
          effectSub: '강조 자막 둘째 장면',
          sceneDesc: '둘째 장면 설명',
          mode: 'dialogue',
          audioContent: '두 번째 장면도 나레이션 길이에 맞춰야 합니다.',
          duration: '1초',
          videoDirection: '측면 샷',
          timecodeSource: '00:01.000~00:02.000',
        },
      ];
      const narrationLines = [
        { audioUrl: narration1, startTime: 0, duration: 2, index: 0 },
        { audioUrl: narration2, startTime: 2, duration: 2, index: 1 },
      ];

      const capcutZipBlob = await buildNlePackageZip({
        target: 'capcut',
        scenes,
        title: 'verify_nle_matrix_capcut',
        videoBlob,
        videoFileName: 'verify_nle_matrix.mp4',
        preset: 'tikitaka',
        width: 1080,
        height: 1920,
        fps: 30,
        videoDurationSec: 4,
        narrationLines,
      });
      const capcutZipBuffer = await capcutZipBlob.arrayBuffer();
      const capcutZip = await JSZipCtor.loadAsync(capcutZipBuffer);
      const capcutDraft = JSON.parse(await capcutZip.file('draft_content.json').async('string'));
      const capcutVideoTrack = capcutDraft.tracks.find((track) => track.type === 'video');
      const capcutAudioTrack = capcutDraft.tracks.find((track) => track.type === 'audio');

      const premiereZipBlob = await buildNlePackageZip({
        target: 'premiere',
        scenes,
        title: 'verify_nle_matrix_premiere',
        videoBlob,
        videoFileName: 'verify_nle_matrix.mp4',
        preset: 'tikitaka',
        width: 1080,
        height: 1920,
        fps: 30,
        videoDurationSec: 4,
        narrationLines,
      });
      const premiereZipBuffer = await premiereZipBlob.arrayBuffer();
      const premiereZip = await JSZipCtor.loadAsync(premiereZipBuffer);
      const premiereXml = await premiereZip.file('verify_nle_matrix_premiere.xml').async('string');
      const premiereSrt = await premiereZip.file('media/verify_nle_matrix.srt').async('string');

      return {
        capcutZipBase64: await blobToBase64(capcutZipBlob),
        premiereZipBase64: await blobToBase64(premiereZipBlob),
        capcut: {
          videoStarts: capcutVideoTrack.segments.map((segment) => segment.target_timerange.start),
          videoDurations: capcutVideoTrack.segments.map((segment) => segment.target_timerange.duration),
          videoSpeeds: capcutVideoTrack.segments.map((segment) => segment.speed),
          audioStarts: capcutAudioTrack?.segments?.map((segment) => segment.target_timerange.start) || [],
          audioDurations: capcutAudioTrack?.segments?.map((segment) => segment.target_timerange.duration) || [],
          audioMaterialPaths: capcutDraft.materials.audios.map((material) => material.path),
          audioTrackCount: capcutAudioTrack?.segments?.length || 0,
        },
        premiere: {
          xml: premiereXml,
          srt: premiereSrt,
        },
      };
    }, { sourceVideo, narration1, narration2, nleModuleUrl, jszipModuleUrl });

    const capcutZip = await JSZip.loadAsync(Buffer.from(summary.capcutZipBase64, 'base64'));
    const premiereZip = await JSZip.loadAsync(Buffer.from(summary.premiereZipBase64, 'base64'));

    assert(summary.capcut.audioTrackCount === 2, `CapCut narration track count mismatch: ${summary.capcut.audioTrackCount}`);
    assert(summary.capcut.videoStarts[0] === 0 && summary.capcut.videoStarts[1] === 2_000_000, `CapCut video starts mismatch: ${summary.capcut.videoStarts.join(', ')}`);
    assert(summary.capcut.audioStarts[0] === 0 && summary.capcut.audioStarts[1] === 2_000_000, `CapCut audio starts mismatch: ${summary.capcut.audioStarts.join(', ')}`);
    assert(summary.capcut.videoDurations.every((duration) => duration === 2_000_000), `CapCut video durations mismatch: ${summary.capcut.videoDurations.join(', ')}`);
    assert(summary.capcut.audioDurations.every((duration) => duration === 2_000_000), `CapCut audio durations mismatch: ${summary.capcut.audioDurations.join(', ')}`);
    assert(summary.capcut.videoSpeeds.every((speed) => speed < 1), `CapCut auto speed should slow clips: ${summary.capcut.videoSpeeds.join(', ')}`);
    assert(summary.capcut.audioMaterialPaths.every((audioPath) => /_narration\.mp3$/.test(audioPath)), `CapCut audio material paths mismatch: ${summary.capcut.audioMaterialPaths.join(', ')}`);
    assert(!!capcutZip.file('001_narration.mp3') && !!capcutZip.file('002_narration.mp3'), 'CapCut ZIP should include root narration files');
    assert(!!capcutZip.file('audio/001_narration.mp3') && !!capcutZip.file('audio/002_narration.mp3'), 'CapCut ZIP should include audio/ narration files');

    assert(summary.premiere.xml.includes('<effectid>timeremap</effectid>'), 'Premiere XML should include timeremap for slowed clips');
    assert(summary.premiere.xml.includes('<parameter><parameterid>speed</parameterid><value>50</value></parameter>'), 'Premiere XML should include 50% speed parameter');
    assert(summary.premiere.xml.includes('<parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>60</value></parameter>'), 'Premiere XML should include 60pt dialogue font size');
    assert(summary.premiere.xml.includes('<parameter><parameterid>origin</parameterid><name>Origin</name><value>0 -0.38</value></parameter>'), 'Premiere XML should keep portrait subtitle origin');
    assert(summary.premiere.xml.includes('<pathurl>audio/001_narration.mp3</pathurl>') && summary.premiere.xml.includes('<pathurl>audio/002_narration.mp3</pathurl>'), 'Premiere XML should reference packaged narration audio');
    assert(summary.premiere.srt.replace(/^\uFEFF/, '').includes('\n'), 'Premiere SRT should contain wrapped subtitle lines');
    assert(!!premiereZip.file('media/verify_nle_matrix.mp4'), 'Premiere ZIP should include media video');
    assert(!!premiereZip.file('media/verify_nle_matrix.srt'), 'Premiere ZIP should include media dialogue SRT');
    assert(!!premiereZip.file('media/verify_nle_matrix_효과.srt'), 'Premiere ZIP should include media effect SRT');

    await extractZipToDirectory(capcutZip, CAPCUT_OUTPUT_FOLDER);
    await extractZipToDirectory(premiereZip, PREMIERE_OUTPUT_FOLDER);

    console.log(JSON.stringify({
      ok: true,
      capcutOutputFolder: CAPCUT_OUTPUT_FOLDER,
      premiereOutputFolder: PREMIERE_OUTPUT_FOLDER,
      capcutVideoSpeeds: summary.capcut.videoSpeeds,
      capcutAudioStarts: summary.capcut.audioStarts,
    }, null, 2));
  } finally {
    await browser.close();
    if (distServer) {
      await distServer.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
