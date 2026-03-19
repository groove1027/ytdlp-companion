import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';
import { launchPlaywrightBrowser } from './helpers/playwrightHarness.mjs';

const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
const SAMPLE_ROOT = path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_MATCH_CAPCUT');
const OUTPUT_FOLDER = process.env.CAPCUT_ISSUE574_OUTPUT || path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_574_FINAL_CAPCUT');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function main() {
  const scene1Video = await toDataUrl(path.join(SAMPLE_ROOT, '001_scene.mp4'), 'video/mp4');
  const scene2Video = await toDataUrl(path.join(SAMPLE_ROOT, '002_scene.mp4'), 'video/mp4');
  const narration1 = await toDataUrl(path.join(SAMPLE_ROOT, '001_narration.mp3'), 'audio/mpeg');
  const narration2 = await toDataUrl(path.join(SAMPLE_ROOT, '002_narration.mp3'), 'audio/mpeg');
  const externalBaseUrl = process.env.CAPCUT_TEST_BASE_URL || '';
  const distServer = externalBaseUrl ? null : await startDistServer();
  const baseUrl = externalBaseUrl || distServer.baseUrl;
  const { appUrl, nleModuleUrl, jszipModuleUrl } = await getBuiltModuleUrls(baseUrl);

  const browser = await launchPlaywrightBrowser();

  try {
    const page = await browser.newPage();
    await page.goto(appUrl, { waitUntil: 'load', timeout: 120000 });

    const summary = await page.evaluate(async ({ scene1Video, scene2Video, narration1, narration2, nleModuleUrl, jszipModuleUrl }) => {
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

      const zipBuffer = await result.blob.arrayBuffer();
      const zipInstance = await JSZipCtor.loadAsync(zipBuffer);
      const draftEntryName = Object.keys(zipInstance.files).find((entryName) => entryName.endsWith('/draft_content.json'));
      const draftPrefix = draftEntryName ? draftEntryName.slice(0, -'draft_content.json'.length) : '';
      const readZipText = async (entryName) => {
        const entry = zipInstance.file(entryName) || zipInstance.file(`${draftPrefix}${entryName}`);
        if (!entry) {
          throw new Error(`Missing ZIP entry "${entryName}". Entries: ${Object.keys(zipInstance.files).join(', ')}`);
        }
        return entry.async('string');
      };
      const draftContent = JSON.parse(await readZipText('draft_content.json'));
      const draftInfo = JSON.parse(await readZipText('draft_info.json'));
      const draftMetaInfo = JSON.parse(await readZipText('draft_meta_info.json'));
      const timelineProject = JSON.parse(await readZipText('Timelines/project.json'));
      const draftSettings = await readZipText('draft_settings');
      const readme = await zipInstance.file('README.txt').async('string');
      const srtContent = await zipInstance.file('verify_574_final_자막.srt').async('string');
      const xmlContent = await zipInstance.file('verify_574_final.xml').async('string');

      const videoTrack = draftContent.tracks.find((track) => track.type === 'video');
      const textTrack = draftContent.tracks.find((track) => track.type === 'text');
      const audioTrack = draftContent.tracks.find((track) => track.type === 'audio');
      const textPayloads = draftContent.materials.texts.map((material) => JSON.parse(material.content).text);

      return {
        zipBase64: await blobToBase64(result.blob),
        draftId: draftMetaInfo.draft_id,
        draftInfoId: draftInfo.id,
        draftContentId: draftContent.id,
        draftInfoTrackCount: draftInfo.tracks.length,
        draftContentTrackCount: draftContent.tracks.length,
        mainTimelineId: timelineProject.main_timeline_id,
        videoStarts: videoTrack.segments.map((segment) => segment.target_timerange.start),
        textStarts: textTrack.segments.map((segment) => segment.target_timerange.start),
        audioStarts: audioTrack.segments.map((segment) => segment.target_timerange.start),
        textPayloads,
        draftFoldPath: draftMetaInfo.draft_fold_path,
        draftRootPath: draftMetaInfo.draft_root_path,
        firstVideoPath: draftContent.materials.videos[0]?.path || '',
        hasMaterialsVideo1: !!(zipInstance.file(`${draftPrefix}materials/video/001_scene.mp4`) || zipInstance.file('materials/video/001_scene.mp4')),
        hasMaterialsVideo2: !!(zipInstance.file(`${draftPrefix}materials/video/002_scene.mp4`) || zipInstance.file('materials/video/002_scene.mp4')),
        hasMaterialsAudio1: !!(zipInstance.file(`${draftPrefix}materials/audio/001_narration_01.mp3`) || zipInstance.file('materials/audio/001_narration_01.mp3')),
        hasDraftCover: !!(zipInstance.file(`${draftPrefix}draft_cover.jpg`) || zipInstance.file('draft_cover.jpg')),
        hasTimelineDraftInfo: !!(zipInstance.file(`${draftPrefix}Timelines/${timelineProject.main_timeline_id}/draft_info.json`) || zipInstance.file(`Timelines/${timelineProject.main_timeline_id}/draft_info.json`)),
        hasTimelineAttachmentPcCommon: !!(zipInstance.file(`${draftPrefix}Timelines/${timelineProject.main_timeline_id}/attachment_pc_common.json`) || zipInstance.file(`Timelines/${timelineProject.main_timeline_id}/attachment_pc_common.json`)),
        hasTimelineAttachmentEditing: !!(zipInstance.file(`${draftPrefix}Timelines/${timelineProject.main_timeline_id}/attachment_editing.json`) || zipInstance.file(`Timelines/${timelineProject.main_timeline_id}/attachment_editing.json`)),
        hasTimelineAttachmentPcTimeline: !!(zipInstance.file(`${draftPrefix}Timelines/${timelineProject.main_timeline_id}/common_attachment/attachment_pc_timeline.json`) || zipInstance.file(`Timelines/${timelineProject.main_timeline_id}/common_attachment/attachment_pc_timeline.json`)),
        hasTimelineTemplate2: !!(zipInstance.file(`${draftPrefix}Timelines/${timelineProject.main_timeline_id}/template-2.tmp`) || zipInstance.file(`Timelines/${timelineProject.main_timeline_id}/template-2.tmp`)),
        hasMacInstaller: !!zipInstance.file('install_capcut_project.command'),
        hasWindowsBatchInstaller: !!zipInstance.file('install_capcut_project.bat'),
        hasWindowsPowerShellInstaller: !!zipInstance.file('install_capcut_project.ps1'),
        draftSettings,
        readme,
        srtContent,
        xmlContent,
      };
    }, { scene1Video, scene2Video, narration1, narration2, nleModuleUrl, jszipModuleUrl });

    const zipBuffer = Buffer.from(summary.zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    assert(summary.videoStarts[0] === 0 && summary.videoStarts[1] === 2_000_000, `Unexpected video starts: ${summary.videoStarts.join(', ')}`);
    assert(summary.textStarts[0] === 0 && summary.textStarts[1] === 2_000_000, `Unexpected text starts: ${summary.textStarts.join(', ')}`);
    assert(summary.audioStarts[0] === 0 && summary.audioStarts[1] === 2_000_000, `Unexpected audio starts: ${summary.audioStarts.join(', ')}`);
    assert(summary.textPayloads[0] === '둘째 장면' && summary.textPayloads[1] === '첫째 장면', `Unexpected text order: ${summary.textPayloads.join(' / ')}`);
    assert(summary.draftInfoId === summary.draftContentId, 'draft_info.json should contain the same project timeline as draft_content.json');
    assert(summary.draftInfoTrackCount === summary.draftContentTrackCount, 'draft_info.json should expose CapCut tracks directly');
    assert(summary.mainTimelineId === summary.draftContentId, 'Timelines/project.json should point at the draft timeline id');
    assert(summary.draftFoldPath.startsWith('/com.lveditor.draft/'), `draft_fold_path mismatch: ${summary.draftFoldPath}`);
    assert(summary.draftRootPath === '/com.lveditor.draft', `draft_root_path mismatch: ${summary.draftRootPath}`);
    assert(summary.firstVideoPath.includes('/materials/video/001_scene.mp4'), `Unexpected first video path: ${summary.firstVideoPath}`);
    assert(summary.hasMaterialsVideo1 && summary.hasMaterialsVideo2, 'CapCut ZIP should include materials/video scene files');
    assert(summary.hasMaterialsAudio1, 'CapCut ZIP should include materials/audio narration files');
    assert(summary.hasDraftCover, 'CapCut ZIP should include draft cover scaffold');
    assert(summary.hasTimelineDraftInfo && summary.hasTimelineAttachmentPcCommon && summary.hasTimelineAttachmentEditing && summary.hasTimelineAttachmentPcTimeline && summary.hasTimelineTemplate2, 'CapCut ZIP should mirror main timeline scaffold under Timelines/<id>');
    assert(summary.hasMacInstaller && summary.hasWindowsBatchInstaller && summary.hasWindowsPowerShellInstaller, 'CapCut ZIP should include installer scripts for path patching');
    assert(summary.readme.includes('install_capcut_project.command') && summary.readme.includes('install_capcut_project.bat'), 'README should guide users to run the installer scripts');

    const srtEntries = parseSrtEntries(summary.srtContent.replace(/^\uFEFF/, ''));
    assert(srtEntries.length === 2, `Unexpected SRT count: ${srtEntries.length}`);
    assert(srtEntries[0].text === '둘째 장면' && srtEntries[1].text === '첫째 장면', `Unexpected SRT order: ${srtEntries.map((entry) => entry.text).join(' / ')}`);
    assert(srtEntries[0].timecode.startsWith('00:00:00,000 --> 00:00:02,000'), `Unexpected first SRT timecode: ${srtEntries[0].timecode}`);
    assert(srtEntries[1].timecode.startsWith('00:00:02,000 --> 00:00:04,000'), `Unexpected second SRT timecode: ${srtEntries[1].timecode}`);
    assert(summary.draftSettings.includes('draft_create_time='), 'CapCut ZIP should include draft_settings');
    assert(summary.draftSettings.includes('real_edit_keys='), 'draft_settings should preserve basic CapCut edit metadata');

    assert(summary.xmlContent.includes('<start>0</start>') && summary.xmlContent.includes('<start>60</start>'), 'FCP XML should contain 0f and 60f starts');
    assert(summary.xmlContent.indexOf('#1 둘째 장면') !== -1 && summary.xmlContent.indexOf('#2 첫째 장면') !== -1, 'FCP XML clip order should follow sceneOrder');

    await extractZipToDirectory(zip, OUTPUT_FOLDER);

    console.log(JSON.stringify({
      ok: true,
      outputFolder: OUTPUT_FOLDER,
      draftId: summary.draftId,
      videoStarts: summary.videoStarts,
      textStarts: summary.textStarts,
      audioStarts: summary.audioStarts,
      srtOrder: srtEntries.map((entry) => entry.text),
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
