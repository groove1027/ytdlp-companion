import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyCapCutProjectOpen, verifyPremiereXmlImport } from './helpers/nativeNleAppVerifier.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPCUT_PROJECTS_ROOT = path.join(os.homedir(), 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');

const capcutOutputs = {
  videoRoom: path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_CAPCUT_VIDEO_ROOM'),
  issue574: path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_574_FINAL_CAPCUT'),
  matrix: path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_NLE_MATRIX_CAPCUT'),
  bridge: path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_VIDEO_ANALYSIS_NARRATION_BRIDGE'),
  motion: path.join(CAPCUT_PROJECTS_ROOT, 'VERIFY_EDITROOM_MOTION_EXPORT'),
};

const premiereOutputs = {
  matrix: path.join(ROOT, 'test', 'output', 'verify_nle_matrix_premiere_playwright'),
  motion: path.join(ROOT, 'test', 'output', 'verify_editroom_motion_export_premiere'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runNodeScript(scriptName, env = {}) {
  const scriptPath = path.join(ROOT, 'test', scriptName);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${scriptName} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function ensurePathExists(targetPath) {
  await fs.access(targetPath);
  return targetPath;
}

async function resolveCapCutDraftPath(baseOutputPath) {
  const directDraft = path.join(baseOutputPath, 'draft_content.json');
  try {
    await fs.access(directDraft);
    return baseOutputPath;
  } catch {}

  const children = await fs.readdir(baseOutputPath, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const candidate = path.join(baseOutputPath, child.name, 'draft_content.json');
    try {
      await fs.access(candidate);
      return path.join(baseOutputPath, child.name);
    } catch {}
  }

  throw new Error(`CapCut draft folder not found under ${baseOutputPath}`);
}

async function main() {
  await runNodeScript('verify-capcut-video-room.mjs', {
    CAPCUT_VIDEO_ROOM_OUTPUT: capcutOutputs.videoRoom,
  });
  await runNodeScript('verify-capcut-issue574.mjs', {
    CAPCUT_ISSUE574_OUTPUT: capcutOutputs.issue574,
  });
  await runNodeScript('verify-video-analysis-narration-bridge-browser.mjs', {
    CAPCUT_VIDEO_ANALYSIS_BRIDGE_OUTPUT: capcutOutputs.bridge,
  });
  await runNodeScript('verify-editroom-motion-export-browser.mjs', {
    CAPCUT_EDITROOM_MOTION_OUTPUT: capcutOutputs.motion,
    PREMIERE_EDITROOM_MOTION_OUTPUT: premiereOutputs.motion,
  });
  await runNodeScript('verify-nle-export-matrix-browser.mjs', {
    CAPCUT_MATRIX_OUTPUT: capcutOutputs.matrix,
    PREMIERE_MATRIX_OUTPUT: premiereOutputs.matrix,
  });

  const capcutChecks = [];
  for (const [name, outputPath] of Object.entries(capcutOutputs)) {
    await ensurePathExists(outputPath);
    const projectPath = await resolveCapCutDraftPath(outputPath);
    const result = await verifyCapCutProjectOpen(projectPath);
    assert(result.ok, `CapCut actual open verification failed for ${name}`);
    capcutChecks.push({
      name,
      projectPath,
      metaRewritten: result.metaRewritten,
      windowOutput: result.windowOutput.trim(),
    });
  }

  const premiereChecks = [];
  const premiereTargets = [
    {
      name: 'matrix',
      xmlPath: path.join(premiereOutputs.matrix, 'verify_nle_matrix_premiere.xml'),
      searchTokens: ['verify_nle_matrix_premiere_playwright', 'verify_nle_matrix'],
    },
    {
      name: 'motion',
      xmlPath: path.join(premiereOutputs.motion, 'verify_editroom_motion_export.xml'),
      searchTokens: ['verify_editroom_motion_export_premiere', 'verify_editroom_motion_export'],
    },
  ];

  for (const target of premiereTargets) {
    await ensurePathExists(target.xmlPath);
    const result = await verifyPremiereXmlImport(target.xmlPath, { searchTokens: target.searchTokens });
    assert(result.ok, `Premiere actual import verification failed for ${target.name}`);
    premiereChecks.push({
      name: target.name,
      xmlPath: target.xmlPath,
      app: result.app,
      cacheHit: result.cacheOutput.trim().split('\n')[0] || '',
    });
  }

  console.log(JSON.stringify({
    ok: true,
    browserEngine: 'playwright-core',
    capcutChecks,
    premiereChecks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
