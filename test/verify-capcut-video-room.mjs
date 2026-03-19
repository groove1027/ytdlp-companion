import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from '../src/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const OUTPUT_FOLDER = process.env.CAPCUT_VIDEO_ROOM_OUTPUT || path.join(process.cwd(), 'test', 'output', 'verify_capcut_video_room');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

    const summary = await page.evaluate(async ({ sourceVideo, nleModuleUrl, jszipModuleUrl }) => {
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

      const sourceVideoBlob = await fetch(sourceVideo).then((response) => response.blob());
      const scenes = [
        {
          cutNum: 1,
          timeline: '00:00.000~00:02.000',
          sourceTimeline: '00:00.000~00:02.000',
          dialogue: '첫 장면 대사',
          effectSub: '첫 장면 효과',
          sceneDesc: '첫 장면 설명',
          mode: 'dialogue',
          audioContent: '첫 장면 대사',
          duration: '00:02.000',
          videoDirection: '정면 샷',
          timecodeSource: '00:00.000~00:02.000',
        },
        {
          cutNum: 2,
          timeline: '00:02.000~00:04.000',
          sourceTimeline: '00:02.000~00:04.000',
          dialogue: '둘 장면 대사',
          effectSub: '둘 장면 효과',
          sceneDesc: '둘 장면 설명',
          mode: 'dialogue',
          audioContent: '둘 장면 대사',
          duration: '00:02.000',
          videoDirection: '측면 샷',
          timecodeSource: '00:02.000~00:04.000',
        },
      ];

      const zipBlob = await buildNlePackageZip({
        target: 'capcut',
        scenes,
        title: 'verify_capcut_video_room',
        videoBlob: sourceVideoBlob,
        videoFileName: 'verify_video_room.mp4',
        preset: 'tikitaka',
        width: 1920,
        height: 1080,
        fps: 30,
        videoDurationSec: 4,
      });

      const zipBuffer = await zipBlob.arrayBuffer();
      const zipInstance = await JSZipCtor.loadAsync(zipBuffer);
      const draftContent = JSON.parse(await zipInstance.file('draft_content.json').async('string'));
      const draftInfo = JSON.parse(await zipInstance.file('draft_info.json').async('string'));
      const draftMetaInfo = JSON.parse(await zipInstance.file('draft_meta_info.json').async('string'));
      const timelineProject = JSON.parse(await zipInstance.file('Timelines/project.json').async('string'));
      const draftSettings = await zipInstance.file('draft_settings').async('string');
      const videoTrack = draftContent.tracks.find((track) => track.type === 'video');

      return {
        zipBase64: await blobToBase64(zipBlob),
        draftId: draftMetaInfo.draft_id,
        draftInfoId: draftInfo.id,
        draftContentId: draftContent.id,
        mainTimelineId: timelineProject.main_timeline_id,
        draftSettings,
        draftVideoCount: draftInfo.materials.videos.length,
        hasRootVideo: !!zipInstance.file('verify_video_room.mp4'),
        hasMediaVideo: !!zipInstance.file('media/verify_video_room.mp4'),
        videoStarts: videoTrack.segments.map((segment) => segment.target_timerange.start),
      };
    }, { sourceVideo, nleModuleUrl, jszipModuleUrl });

    const zipBuffer = Buffer.from(summary.zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    assert(summary.draftSettings.includes('draft_create_time='), 'CapCut ZIP should include draft_settings');
    assert(summary.draftSettings.includes('real_edit_keys=1'), 'draft_settings should preserve edit metadata');
    assert(summary.hasRootVideo, 'CapCut ZIP should include root-level video file');
    assert(summary.hasMediaVideo, 'CapCut ZIP should include media/ video file');
    assert(summary.draftVideoCount === 1, `Unexpected draft video count: ${summary.draftVideoCount}`);
    assert(summary.draftInfoId === summary.draftContentId, 'draft_info.json should contain the same project timeline as draft_content.json');
    assert(summary.mainTimelineId === summary.draftContentId, 'Timelines/project.json should point at the draft timeline id');
    assert(summary.videoStarts[0] === 0 && summary.videoStarts[1] === 2_000_000, `Unexpected video starts: ${summary.videoStarts.join(', ')}`);

    await extractZipToDirectory(zip, OUTPUT_FOLDER);

    console.log(JSON.stringify({
      ok: true,
      outputFolder: OUTPUT_FOLDER,
      draftId: summary.draftId,
      videoStarts: summary.videoStarts,
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
