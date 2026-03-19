import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from '../src/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const OUTPUT_FOLDER = path.join(process.cwd(), 'test', 'output', 'verify_video_analysis_narration_bridge');

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

  for (const entry of Object.values(zip.files)) {
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
      const buildNlePackageZip = nleService.buildNlePackageZip || nleModule.buildNlePackageZip;
      const buildVideoAnalysisNarrationLines = nleService.buildVideoAnalysisNarrationLines || nleModule.buildVideoAnalysisNarrationLines;
      const buildVideoAnalysisSceneLineId = nleService.buildVideoAnalysisSceneLineId || nleModule.buildVideoAnalysisSceneLineId;
      if (
        typeof buildNlePackageZip !== 'function'
        || typeof buildVideoAnalysisNarrationLines !== 'function'
        || typeof buildVideoAnalysisSceneLineId !== 'function'
      ) {
        throw new Error(`video-analysis narration bridge exports not found: ${Object.keys(nleModule).join(', ')}`);
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
          dialogue: '첫 장면 나레이션',
          effectSub: '',
          sceneDesc: '첫 장면 설명',
          mode: 'dialogue',
          audioContent: '첫 장면 나레이션',
          duration: '1초',
          videoDirection: '정면 샷',
          timecodeSource: '00:00.000~00:01.000',
        },
        {
          cutNum: 2,
          timeline: '00:01.000~00:02.000',
          sourceTimeline: '00:01.000~00:02.000',
          dialogue: '',
          effectSub: '',
          sceneDesc: '브릿지 장면',
          mode: 'visual',
          audioContent: '',
          duration: '1초',
          videoDirection: '브릿지 샷',
          timecodeSource: '00:01.000~00:02.000',
        },
        {
          cutNum: 3,
          timeline: '00:02.000~00:03.000',
          sourceTimeline: '00:02.000~00:03.000',
          dialogue: '세 번째 장면 나레이션',
          effectSub: '',
          sceneDesc: '세 번째 장면 설명',
          mode: 'dialogue',
          audioContent: '세 번째 장면 나레이션',
          duration: '1초',
          videoDirection: '측면 샷',
          timecodeSource: '00:02.000~00:03.000',
        },
      ];
      const legacyScenes = [
        {
          cutNum: 1,
          timeline: '00:00.000~00:01.000',
          sourceTimeline: '00:00.000~00:01.000',
          dialogue: '레거시 첫 장면',
          effectSub: '',
          sceneDesc: '레거시 첫 장면 설명',
          mode: 'dialogue',
          audioContent: '레거시 첫 장면',
          duration: '1초',
          videoDirection: '정면 샷',
          timecodeSource: '00:00.000~00:01.000',
        },
        {
          cutNum: 2,
          timeline: '00:01.000~00:02.000',
          sourceTimeline: '00:01.000~00:02.000',
          dialogue: '레거시 둘 장면',
          effectSub: '',
          sceneDesc: '레거시 둘 장면 설명',
          mode: 'dialogue',
          audioContent: '레거시 둘 장면',
          duration: '1초',
          videoDirection: '측면 샷',
          timecodeSource: '00:01.000~00:02.000',
        },
      ];

      const sceneIdLines = [
        {
          text: '첫 장면 나레이션',
          sceneId: buildVideoAnalysisSceneLineId(7, 0),
          audioUrl: narration1,
          startTime: 0,
          duration: 2,
          ttsStatus: 'done',
        },
        {
          text: '브릿지 장면',
          sceneId: buildVideoAnalysisSceneLineId(7, 1),
          ttsStatus: 'idle',
        },
        {
          text: '세 번째 장면 나레이션',
          sceneId: buildVideoAnalysisSceneLineId(7, 2),
          audioUrl: narration2,
          startTime: 3,
          duration: 2,
          ttsStatus: 'done',
        },
      ];

      const legacyLines = [
        { text: '레거시 첫 장면', audioUrl: narration1, startTime: 0, duration: 2, ttsStatus: 'done' },
        { text: '레거시 둘 장면', audioUrl: narration2, startTime: 2, duration: 2, ttsStatus: 'done' },
      ];

      const duplicateSceneIdLines = [
        { text: '첫 장면 나레이션 A', sceneId: buildVideoAnalysisSceneLineId(7, 0), audioUrl: narration1, startTime: 0, duration: 1, ttsStatus: 'done' },
        { text: '첫 장면 나레이션 B', sceneId: buildVideoAnalysisSceneLineId(7, 0), audioUrl: narration2, startTime: 1, duration: 1, ttsStatus: 'done' },
      ];

      const sceneIdNarrationLines = buildVideoAnalysisNarrationLines({ scenes, soundLines: sceneIdLines, versionId: 7 });
      const legacyNarrationLines = buildVideoAnalysisNarrationLines({ scenes: legacyScenes, soundLines: legacyLines, versionId: 7 });
      const duplicateNarrationLines = buildVideoAnalysisNarrationLines({ scenes, soundLines: duplicateSceneIdLines, versionId: 7 });

      const zipBlob = await buildNlePackageZip({
        target: 'capcut',
        scenes,
        title: 'verify_video_analysis_narration_bridge',
        videoBlob,
        videoFileName: 'verify_video_analysis_narration_bridge.mp4',
        preset: 'tikitaka',
        width: 1080,
        height: 1920,
        fps: 30,
        videoDurationSec: 5,
        narrationLines: sceneIdNarrationLines,
      });
      const zipBuffer = await zipBlob.arrayBuffer();
      const zipInstance = await JSZipCtor.loadAsync(zipBuffer);
      const draftContent = JSON.parse(await zipInstance.file('draft_content.json').async('string'));
      const audioTrack = draftContent.tracks.find((track) => track.type === 'audio');
      const videoTrack = draftContent.tracks.find((track) => track.type === 'video');

      return {
        zipBase64: await blobToBase64(zipBlob),
        sceneIdNarrationLines,
        legacyNarrationLines,
        duplicateNarrationLines,
        audioStarts: audioTrack?.segments?.map((segment) => segment.target_timerange.start) || [],
        videoDurations: videoTrack?.segments?.map((segment) => segment.target_timerange.duration) || [],
        videoSpeeds: videoTrack?.segments?.map((segment) => segment.speed) || [],
      };
    }, { sourceVideo, narration1, narration2, nleModuleUrl, jszipModuleUrl });

    const zip = await JSZip.loadAsync(Buffer.from(summary.zipBase64, 'base64'));

    assert(summary.sceneIdNarrationLines.length === 3, `sceneId bridge count mismatch: ${summary.sceneIdNarrationLines.length}`);
    assert(summary.sceneIdNarrationLines[0].audioUrl && !summary.sceneIdNarrationLines[1].audioUrl && summary.sceneIdNarrationLines[2].audioUrl, 'sceneId bridge should preserve narrated/non-narrated scenes');
    assert(summary.legacyNarrationLines.length === 2, `legacy bridge count mismatch: ${summary.legacyNarrationLines.length}`);
    assert(summary.legacyNarrationLines[0].audioUrl && summary.legacyNarrationLines[1].audioUrl, 'legacy index bridge should preserve matched audio lines');
    assert(summary.duplicateNarrationLines.length === 0, 'duplicate sceneId lines should be rejected as ambiguous');
    assert(summary.audioStarts[0] === 0 && summary.audioStarts[1] === 3_000_000, `audio starts mismatch: ${summary.audioStarts.join(', ')}`);
    assert(summary.videoDurations[0] === 2_000_000 && summary.videoDurations[1] === 1_000_000 && summary.videoDurations[2] === 2_000_000, `video durations mismatch: ${summary.videoDurations.join(', ')}`);
    assert(summary.videoSpeeds[0] < 1 && summary.videoSpeeds[1] === 1 && summary.videoSpeeds[2] < 1, `video speeds mismatch: ${summary.videoSpeeds.join(', ')}`);
    assert(!!zip.file('001_narration.mp3') && !!zip.file('003_narration.mp3'), 'CapCut ZIP should include matched narration files');

    await extractZipToDirectory(zip, OUTPUT_FOLDER);

    console.log(JSON.stringify({
      ok: true,
      outputFolder: OUTPUT_FOLDER,
      audioStarts: summary.audioStarts,
      videoDurations: summary.videoDurations,
      videoSpeeds: summary.videoSpeeds,
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
