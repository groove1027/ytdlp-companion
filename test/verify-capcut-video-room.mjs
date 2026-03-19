import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from '../src/node_modules/jszip/lib/index.js';
import { getBuiltModuleUrls, startDistServer } from './helpers/distBrowserHarness.mjs';
import { launchPlaywrightBrowser } from './helpers/playwrightHarness.mjs';

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

  const browser = await launchPlaywrightBrowser();

  try {
    const page = await browser.newPage();
    await page.goto(appUrl, { waitUntil: 'load', timeout: 120000 });

    const summary = await page.evaluate(async ({ sourceVideo, nleModuleUrl, jszipModuleUrl }) => {
      const nleModule = await import(nleModuleUrl);
      const nleService = nleModule.n || nleModule.default || nleModule;
      const buildNlePackageZip =
        nleService.buildNlePackageZip ||
        nleModule.buildNlePackageZip;
      const installCapCutZipToDirectory =
        nleService.installCapCutZipToDirectory ||
        nleModule.installCapCutZipToDirectory;
      if (typeof buildNlePackageZip !== 'function') {
        throw new Error(`buildNlePackageZip export not found: ${Object.keys(nleModule).join(', ')}`);
      }
      if (typeof installCapCutZipToDirectory !== 'function') {
        throw new Error(`installCapCutZipToDirectory export not found: ${Object.keys(nleModule).join(', ')}`);
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
      const draftEntryName = Object.keys(zipInstance.files).find((entryName) => entryName.endsWith('/draft_content.json'));
      const draftPrefix = draftEntryName ? draftEntryName.slice(0, -'draft_content.json'.length) : '';
      const readZipText = async (entryName) => {
        const entry = zipInstance.file(entryName) || zipInstance.file(`${draftPrefix}${entryName}`);
        if (!entry) {
          throw new Error(`Missing ZIP entry "${entryName}". Entries: ${Object.keys(zipInstance.files).join(', ')}`);
        }
        return entry.async('string');
      };
      const hasZipEntry = (entryName) => !!(zipInstance.file(entryName) || zipInstance.file(`${draftPrefix}${entryName}`));
      const draftContent = JSON.parse(await readZipText('draft_content.json'));
      const draftInfo = JSON.parse(await readZipText('draft_info.json'));
      const draftMetaInfo = JSON.parse(await readZipText('draft_meta_info.json'));
      const timelineProject = JSON.parse(await readZipText('Timelines/project.json'));
      const draftSettings = await readZipText('draft_settings');
      const readme = await zipInstance.file('README.txt').async('string');
      const videoTrack = draftContent.tracks.find((track) => track.type === 'video');
      const opfsRoot = await navigator.storage.getDirectory();
      if (typeof opfsRoot.removeEntry === 'function') {
        await opfsRoot.removeEntry('capcut-direct-install-video-room', { recursive: true }).catch(() => {});
      }
      const directInstallRoot = await opfsRoot.getDirectoryHandle('capcut-direct-install-video-room', { create: true });
      const directInstallResult = await installCapCutZipToDirectory({
        zipBlob,
        draftsRootHandle: directInstallRoot,
        draftsRootPath: '/Users/tester/Movies/CapCut/User Data/Projects/com.lveditor.draft',
      });
      const directProjectHandle = await directInstallRoot.getDirectoryHandle(directInstallResult.projectId);
      const directDraftContentText = await (await (await directProjectHandle.getFileHandle('draft_content.json')).getFile()).text();
      const directDraftMetaText = await (await (await directProjectHandle.getFileHandle('draft_meta_info.json')).getFile()).text();
      const directDraftContent = JSON.parse(directDraftContentText);
      const directDraftMetaInfo = JSON.parse(directDraftMetaText);
      await (await (await (await directProjectHandle.getDirectoryHandle('materials')).getDirectoryHandle('video')).getFileHandle('verify_video_room.mp4')).getFile();

      return {
        zipBase64: await blobToBase64(zipBlob),
        draftId: draftMetaInfo.draft_id,
        draftInfoId: draftInfo.id,
        draftContentId: draftContent.id,
        mainTimelineId: timelineProject.main_timeline_id,
        draftSettings,
        draftVideoCount: draftInfo.materials.videos.length,
        draftFoldPath: draftMetaInfo.draft_fold_path,
        draftRootPath: draftMetaInfo.draft_root_path,
        draftPath: draftInfo.materials.videos[0]?.path || '',
        hasMaterialsVideo: hasZipEntry('materials/video/verify_video_room.mp4'),
        hasDraftCover: hasZipEntry('draft_cover.jpg'),
        hasDraftExtra: hasZipEntry('draft.extra'),
        hasCryptoKeyStore: hasZipEntry('crypto_key_store.dat'),
        hasAttachmentScriptVideo: hasZipEntry('common_attachment/attachment_script_video.json'),
        hasTimelineDraftInfo: hasZipEntry(`Timelines/${timelineProject.main_timeline_id}/draft_info.json`),
        hasTimelineAttachmentPcCommon: hasZipEntry(`Timelines/${timelineProject.main_timeline_id}/attachment_pc_common.json`),
        hasTimelineAttachmentEditing: hasZipEntry(`Timelines/${timelineProject.main_timeline_id}/attachment_editing.json`),
        hasTimelineAttachmentPcTimeline: hasZipEntry(`Timelines/${timelineProject.main_timeline_id}/common_attachment/attachment_pc_timeline.json`),
        hasTimelineTemplate2: hasZipEntry(`Timelines/${timelineProject.main_timeline_id}/template-2.tmp`),
        hasMacInstaller: !!zipInstance.file('install_capcut_project.command'),
        hasWindowsBatchInstaller: !!zipInstance.file('install_capcut_project.bat'),
        hasWindowsPowerShellInstaller: !!zipInstance.file('install_capcut_project.ps1'),
        readme,
        hasMediaVideo: !!zipInstance.file('media/verify_video_room.mp4'),
        videoStarts: videoTrack.segments.map((segment) => segment.target_timerange.start),
        directInstallProjectId: directInstallResult.projectId,
        directInstallDraftPath: directDraftContent.materials.videos[0]?.path || '',
        directInstallDraftFoldPath: directDraftMetaInfo.draft_fold_path,
        directInstallDraftRootPath: directDraftMetaInfo.draft_root_path,
      };
    }, { sourceVideo, nleModuleUrl, jszipModuleUrl });

    const zipBuffer = Buffer.from(summary.zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    assert(summary.draftSettings.includes('draft_create_time='), 'CapCut ZIP should include draft_settings');
    assert(summary.draftSettings.includes('real_edit_keys='), 'draft_settings should preserve edit metadata');
    assert(summary.hasMaterialsVideo, 'CapCut ZIP should include materials/video self-contained media');
    assert(summary.hasMediaVideo, 'CapCut ZIP should include media/ video file');
    assert(summary.hasDraftCover && summary.hasDraftExtra && summary.hasCryptoKeyStore, 'CapCut ZIP should include desktop scaffold files');
    assert(summary.hasAttachmentScriptVideo, 'CapCut ZIP should include common attachment scaffold files');
    assert(summary.hasTimelineDraftInfo && summary.hasTimelineAttachmentPcCommon && summary.hasTimelineAttachmentEditing && summary.hasTimelineAttachmentPcTimeline && summary.hasTimelineTemplate2, 'CapCut ZIP should mirror main timeline scaffold under Timelines/<id>');
    assert(summary.hasMacInstaller && summary.hasWindowsBatchInstaller && summary.hasWindowsPowerShellInstaller, 'CapCut ZIP should include installer scripts for path patching');
    assert(summary.draftFoldPath.startsWith('/com.lveditor.draft/'), `draft_fold_path mismatch: ${summary.draftFoldPath}`);
    assert(summary.draftRootPath === '/com.lveditor.draft', `draft_root_path mismatch: ${summary.draftRootPath}`);
    assert(summary.draftPath.includes('/materials/video/verify_video_room.mp4'), `draft media path mismatch: ${summary.draftPath}`);
    assert(summary.directInstallDraftPath === `/Users/tester/Movies/CapCut/User Data/Projects/com.lveditor.draft/${summary.directInstallProjectId}/materials/video/verify_video_room.mp4`, `direct install media path mismatch: ${summary.directInstallDraftPath}`);
    assert(summary.directInstallDraftFoldPath === `/Users/tester/Movies/CapCut/User Data/Projects/com.lveditor.draft/${summary.directInstallProjectId}`, `direct install draft_fold_path mismatch: ${summary.directInstallDraftFoldPath}`);
    assert(summary.directInstallDraftRootPath === '/Users/tester/Movies/CapCut/User Data/Projects/com.lveditor.draft', `direct install draft_root_path mismatch: ${summary.directInstallDraftRootPath}`);
    assert(summary.readme.includes('install_capcut_project.command') && summary.readme.includes('install_capcut_project.bat'), 'README should guide users to run the installer scripts');
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
