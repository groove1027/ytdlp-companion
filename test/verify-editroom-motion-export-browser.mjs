import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from '../src/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const OUTPUT_FOLDER = path.join(process.cwd(), 'test', 'output', 'verify_editroom_motion_export');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function toDataUrl(filePath, mime) {
  const buf = await fs.readFile(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function svgDataUrl(fill, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="${fill}"/><circle cx="960" cy="540" r="240" fill="rgba(255,255,255,0.28)"/><text x="960" y="570" text-anchor="middle" font-size="120" fill="#ffffff" font-family="Arial">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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
  const image1 = svgDataUrl('#0f766e', 'M1');
  const image2 = svgDataUrl('#9a3412', 'M2');
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

    const summary = await page.evaluate(async ({ image1, image2, narration1, narration2, nleModuleUrl, jszipModuleUrl }) => {
      const nleModule = await import(nleModuleUrl);
      const nleService = nleModule.n || nleModule.default || nleModule;
      const buildEditRoomNleZip =
        nleService.buildEditRoomNleZip ||
        nleModule.buildEditRoomNleZip ||
        nleModule.b;
      if (typeof buildEditRoomNleZip !== 'function') {
        throw new Error(`buildEditRoomNleZip export not found: ${Object.keys(nleModule).join(', ')}`);
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

      const timeline = [
        {
          sceneId: 'motion-1',
          sceneIndex: 0,
          imageStartTime: 0,
          imageEndTime: 3,
          imageDuration: 3,
          subtitleSegments: [{ lineId: 'sub-1', text: '첫 장면', startTime: 0, endTime: 3 }],
          effectPreset: 'zoom',
          motionEffect: 'rotate',
          anchorX: 64,
          anchorY: 38,
          volume: 100,
          speed: 1,
        },
        {
          sceneId: 'motion-2',
          sceneIndex: 1,
          imageStartTime: 3,
          imageEndTime: 6,
          imageDuration: 3,
          subtitleSegments: [{ lineId: 'sub-2', text: '둘 장면', startTime: 3, endTime: 6 }],
          effectPreset: 'smooth',
          motionEffect: 'fade',
          anchorX: 50,
          anchorY: 45,
          volume: 100,
          speed: 1,
        },
      ];

      const scenes = [
        { id: 'motion-1', imageUrl: image1, scriptText: '첫 장면' },
        { id: 'motion-2', imageUrl: image2, scriptText: '둘 장면' },
      ];

      const narrationLines = [
        { sceneId: 'motion-1', audioUrl: narration1, startTime: 0, duration: 2, index: 0 },
        { sceneId: 'motion-2', audioUrl: narration2, startTime: 3, duration: 2, index: 1 },
      ];

      const result = await buildEditRoomNleZip({
        target: 'capcut',
        timeline,
        scenes,
        narrationLines,
        title: 'verify_editroom_motion_export',
        aspectRatio: '16:9',
        fps: 30,
      });

      const zipBuffer = await result.blob.arrayBuffer();
      const zipInstance = await JSZipCtor.loadAsync(zipBuffer);
      const draftContent = JSON.parse(await zipInstance.file('draft_content.json').async('string'));
      const xmlContent = await zipInstance.file('verify_editroom_motion_export.xml').async('string');
      const draftSettings = await zipInstance.file('draft_settings').async('string');

      const videoTrack = draftContent.tracks.find((track) => track.type === 'video');
      const segments = videoTrack.segments;
      const firstSegment = segments[0];
      const secondSegment = segments[1];
      const firstTypes = firstSegment.common_keyframes.map((entry) => entry.property_type).sort();
      const secondTypes = secondSegment.common_keyframes.map((entry) => entry.property_type).sort();
      const firstPosX = firstSegment.common_keyframes.find((entry) => entry.property_type === 'KFTypePositionX');
      const firstScaleX = firstSegment.common_keyframes.find((entry) => entry.property_type === 'KFTypeScaleX');
      const secondAlpha = secondSegment.common_keyframes.find((entry) => entry.property_type === 'KFTypeGlobalAlpha');

      return {
        zipBase64: await blobToBase64(result.blob),
        draftSettings,
        xmlContent,
        firstClip: firstSegment.clip,
        firstPosXValues: firstPosX?.keyframe_list?.map((keyframe) => keyframe.values[0]) || [],
        firstScaleXValues: firstScaleX?.keyframe_list?.map((keyframe) => keyframe.values[0]) || [],
        firstTypes,
        firstUniformScale: firstSegment.uniform_scale,
        secondAlphaValues: secondAlpha?.keyframe_list?.map((keyframe) => keyframe.values[0]) || [],
        secondTypes,
      };
    }, { image1, image2, narration1, narration2, nleModuleUrl, jszipModuleUrl });

    const zipBuffer = Buffer.from(summary.zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    assert(summary.draftSettings.includes('draft_create_time='), 'CapCut ZIP should include draft_settings');
    assert(summary.firstTypes.includes('KFTypePositionX'), `Missing KFTypePositionX: ${summary.firstTypes.join(', ')}`);
    assert(summary.firstTypes.includes('KFTypePositionY'), `Missing KFTypePositionY: ${summary.firstTypes.join(', ')}`);
    assert(summary.firstTypes.includes('KFTypeRotation'), `Missing KFTypeRotation: ${summary.firstTypes.join(', ')}`);
    assert(summary.firstTypes.includes('KFTypeScaleX') && summary.firstTypes.includes('KFTypeScaleY'), `Missing scale keyframes: ${summary.firstTypes.join(', ')}`);
    assert(summary.secondTypes.includes('KFTypeGlobalAlpha'), `Missing opacity keyframes: ${summary.secondTypes.join(', ')}`);
    assert(summary.firstPosXValues.length >= 3, `Expected multiple position keyframes, got ${summary.firstPosXValues.length}`);
    assert(new Set(summary.firstPosXValues.map((value) => value.toFixed(4))).size >= 3, 'Position X keyframes should vary');
    assert(summary.firstScaleXValues.some((value) => Math.abs(value - 1) > 0.01), 'Scale keyframes should differ from 1.0');
    assert(summary.secondAlphaValues.some((value) => value < 0.95), 'Opacity keyframes should include fade values');
    assert(summary.firstUniformScale.on === false, 'Animated scale should disable CapCut uniform_scale');
    assert(Math.abs(summary.firstClip.rotation) > 0.01 || Math.abs(summary.firstClip.transform.x) > 0.001, 'First clip base motion should not stay at defaults');

    assert(summary.xmlContent.includes('<stillframe>TRUE</stillframe>'), 'FCP XML should mark image clips as stillframe');
    assert(summary.xmlContent.includes('<effect id="basicmotion">'), 'FCP XML should include basic motion filter');
    assert(summary.xmlContent.includes('<parameterid>center</parameterid>'), 'FCP XML should include center keyframes');
    assert(summary.xmlContent.includes('<parameterid>scale</parameterid>'), 'FCP XML should include scale keyframes');
    assert(summary.xmlContent.includes('<parameterid>rotation</parameterid>'), 'FCP XML should include rotation keyframes');
    assert(summary.xmlContent.includes('<parameterid>opacity</parameterid>'), 'FCP XML should include opacity keyframes');

    await extractZipToDirectory(zip, OUTPUT_FOLDER);

    console.log(JSON.stringify({
      ok: true,
      outputFolder: OUTPUT_FOLDER,
      firstTypes: summary.firstTypes,
      secondTypes: summary.secondTypes,
      firstPosXValues: summary.firstPosXValues,
      secondAlphaValues: summary.secondAlphaValues,
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
