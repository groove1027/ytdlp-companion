import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import sharp from '../src/node_modules/sharp/lib/index.js';
import { launchPlaywrightPersistentContext } from './helpers/playwrightHarness.mjs';

const DEV_PORT = 5187;
const BASE_URL = `http://127.0.0.1:${DEV_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), 'test', 'output', 'verify_editroom_overlay');
const SCENE_ID = 'verify-overlay-scene';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(value) {
  return value.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
}

function svgDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1d4ed8" />
          <stop offset="50%" stop-color="#0f766e" />
          <stop offset="100%" stop-color="#18181b" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bg)" />
      <circle cx="1460" cy="250" r="180" fill="rgba(255,255,255,0.12)" />
      <circle cx="480" cy="760" r="260" fill="rgba(255,255,255,0.08)" />
      <rect x="270" y="190" width="1380" height="700" rx="54" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.30)" stroke-width="8" />
      <text x="960" y="470" text-anchor="middle" font-size="138" font-family="Arial" font-weight="700" fill="#ffffff">Overlay Verify</text>
      <text x="960" y="610" text-anchor="middle" font-size="64" font-family="Arial" fill="rgba(255,255,255,0.85)">EditRoom Main Preview</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function startDevServer() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const devServer = spawn('./node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: path.join(process.cwd(), 'src'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Vite dev server timed out on port ${DEV_PORT}`)), 30000);

    const onReady = (data) => {
      const text = data.toString();
      if (text.includes(`127.0.0.1:${DEV_PORT}`) || text.includes(`localhost:${DEV_PORT}`) || text.includes('ready in')) {
        clearTimeout(timer);
        resolve();
      }
    };

    devServer.stdout?.on('data', onReady);
    devServer.stderr?.on('data', onReady);
    devServer.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    devServer.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Vite dev server exited with code ${code}`));
      }
    });
  });

  await sleep(1500);
  return devServer;
}

async function stopDevServer(devServer) {
  if (!devServer || devServer.killed) return;
  devServer.kill('SIGTERM');
  await new Promise((resolve) => {
    devServer.once('exit', () => resolve());
    setTimeout(resolve, 3000);
  });
}

async function seedEditRoom(page, sceneImage) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 120000 });

  await page.evaluate(async ({ sceneId, sceneImage }) => {
    localStorage.setItem('dismiss_announce_0317', '1');

    const [{ useProjectStore }, { useEditRoomStore }, { useNavigationStore }] = await Promise.all([
      import('/stores/projectStore.ts'),
      import('/stores/editRoomStore.ts'),
      import('/stores/navigationStore.ts'),
    ]);
    window.__EDITROOM_OVERLAY_VERIFY__ = {
      useProjectStore,
      useEditRoomStore,
      useNavigationStore,
    };

    useProjectStore.getState().newProject('Overlay Verify');
    const config = useProjectStore.getState().config;
    if (!config) throw new Error('Project config was not created');

    useProjectStore.getState().setConfig({
      ...config,
      aspectRatio: '16:9',
      sceneOrder: [sceneId],
    });

    useProjectStore.getState().setScenes([
      {
        id: sceneId,
        imageUrl: sceneImage,
        scriptText: '오버레이가 실제로 보이는지 확인합니다.',
        visualPrompt: 'overlay verification scene',
      },
    ]);

    useNavigationStore.getState().setActiveTab('edit-room');

    // 편집실 초기화 이후 검증 기준을 고정
    useEditRoomStore.getState().reset();
  }, { sceneId: SCENE_ID, sceneImage });

  await page.waitForFunction(({ sceneId }) => {
    const verify = window.__EDITROOM_OVERLAY_VERIFY__;
    if (!verify) return false;

    return verify.useProjectStore.getState().scenes.some((scene) => scene.id === sceneId)
      && verify.useEditRoomStore.getState().initialized
      && !!document.querySelector('[data-base-layer]');
  }, { timeout: 20000 }, { sceneId: SCENE_ID });

  await page.evaluate(({ sceneId }) => {
    const verify = window.__EDITROOM_OVERLAY_VERIFY__;
    if (!verify) throw new Error('Overlay verify stores were not initialized');

    verify.useEditRoomStore.setState((state) => ({
      ...state,
      expandedSceneId: sceneId,
      sceneEffects: {
        ...state.sceneEffects,
        [sceneId]: {
          ...(state.sceneEffects[sceneId] || {}),
          panZoomPreset: 'none',
          motionEffect: 'none',
          anchorX: 50,
          anchorY: 45,
          anchorLabel: '중앙',
        },
      },
      sceneSubtitles: {
        ...state.sceneSubtitles,
        [sceneId]: {
          ...(state.sceneSubtitles[sceneId] || {}),
          text: '',
          startTime: 0,
          endTime: 3,
          animationPreset: 'none',
        },
      },
      sceneOverlays: {
        ...state.sceneOverlays,
        [sceneId]: [],
      },
    }));
  }, { sceneId: SCENE_ID });

  await sleep(700);
}

async function setSceneOverlays(page, overlays) {
  await page.evaluate(({ sceneId, overlays }) => {
    const verify = window.__EDITROOM_OVERLAY_VERIFY__;
    if (!verify) throw new Error('Overlay verify stores were not initialized');

    verify.useEditRoomStore.setState((state) => ({
      ...state,
      sceneOverlays: {
        ...state.sceneOverlays,
        [sceneId]: overlays,
      },
    }));
  }, { sceneId: SCENE_ID, overlays });

  await page.waitForFunction(({ sceneId, expected }) => {
    const verify = window.__EDITROOM_OVERLAY_VERIFY__;
    if (!verify) return false;

    return (verify.useEditRoomStore.getState().sceneOverlays[sceneId] || []).length === expected;
  }, { timeout: 5000 }, { sceneId: SCENE_ID, expected: overlays.length });

  await sleep(500);
}

async function getPreviewHandle(page) {
  const handle = await page.evaluateHandle(() => {
    const baseLayer = document.querySelector('[data-base-layer]');
    return baseLayer ? baseLayer.parentElement : null;
  });

  const element = handle.asElement();
  assert(element, 'EditRoom preview container not found');
  return element;
}

async function screenshotElement(page, element, filename) {
  const box = await element.boundingBox();
  assert(box && box.width > 10 && box.height > 10, 'Invalid preview clip');

  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.floor(box.width),
    height: Math.floor(box.height),
  };

  const filePath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filePath, clip });
  return filePath;
}

async function diffImages(aPath, bPath) {
  const a = await sharp(aPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  assert(a.info.width === b.info.width && a.info.height === b.info.height, 'Screenshot sizes do not match');

  const totalPixels = a.info.width * a.info.height;
  let changedPixels = 0;
  let totalDiff = 0;

  for (let i = 0; i < a.data.length; i += 4) {
    const diff =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);

    totalDiff += diff;
    if (diff > 24) changedPixels += 1;
  }

  return {
    changedRatio: changedPixels / totalPixels,
    meanRgbDiff: totalDiff / (totalPixels * 3),
    width: a.info.width,
    height: a.info.height,
  };
}

async function inspectPreviewState(page) {
  return page.evaluate(() => {
    const baseLayer = document.querySelector('[data-base-layer]');
    const preview = baseLayer?.parentElement;
    if (!preview) return null;

    const mixBlendModes = Array.from(preview.querySelectorAll('div'))
      .map((node) => getComputedStyle(node).mixBlendMode)
      .filter((mode) => mode && mode !== 'normal');

    return {
      isolation: getComputedStyle(preview).isolation,
      mixBlendModes,
      overlayNodeCount: preview.querySelectorAll('div').length,
    };
  });
}

async function getOverlayPresets(page) {
  return page.evaluate(async () => {
    const { OVERLAY_PRESETS } = await import('/components/tabs/editroom/OverlayPicker.tsx');
    return OVERLAY_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      category: preset.category,
      defaultBlendMode: preset.defaultBlendMode,
    }));
  });
}

function getThreshold(category) {
  switch (category) {
    case 'particle':
      return { changedRatio: 0.001, meanRgbDiff: 0.03 };
    case 'color':
      return { changedRatio: 0.03, meanRgbDiff: 0.6 };
    case 'texture':
      return { changedRatio: 0.004, meanRgbDiff: 0.12 };
    case 'atmosphere':
    default:
      return { changedRatio: 0.003, meanRgbDiff: 0.09 };
  }
}

async function main() {
  const sceneImage = svgDataUrl();
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'editroom-overlay-'));
  const devServer = await startDevServer();
  let context = null;

  try {
    context = await launchPlaywrightPersistentContext(tempProfileDir, {
      headless: true,
      viewport: { width: 1600, height: 1200 },
      args: [
        '--window-size=1600,1200',
      ],
    });

    const page = context.pages()[0] || await context.newPage();
    await seedEditRoom(page, sceneImage);

    const preview = await getPreviewHandle(page);
    const baselinePath = await screenshotElement(page, preview, 'baseline.png');
    const presetCatalog = await getOverlayPresets(page);

    await setSceneOverlays(page, [
      { presetId: 'warm-tone', intensity: 200, opacity: 100, blendMode: 'screen', speed: 1 },
    ]);
    const warmTonePath = await screenshotElement(page, preview, 'warm-tone-screen.png');
    const warmToneDiff = await diffImages(baselinePath, warmTonePath);

    await setSceneOverlays(page, [
      { presetId: 'rain', intensity: 200, opacity: 100, blendMode: 'screen', speed: 1 },
    ]);
    const rainPath = await screenshotElement(page, preview, 'rain-screen.png');
    const rainDiff = await diffImages(baselinePath, rainPath);
    const previewState = await inspectPreviewState(page);

    await setSceneOverlays(page, []);

    const presetResults = [];
    for (const preset of presetCatalog) {
      await setSceneOverlays(page, [{
        presetId: preset.id,
        intensity: 200,
        opacity: 100,
        blendMode: preset.defaultBlendMode,
        speed: 2,
      }]);

      const screenshotPath = await screenshotElement(page, preview, `${sanitizeFilename(preset.id)}.png`);
      const diff = await diffImages(baselinePath, screenshotPath);
      const threshold = getThreshold(preset.category);
      const passed = diff.changedRatio >= threshold.changedRatio || diff.meanRgbDiff >= threshold.meanRgbDiff;

      presetResults.push({
        ...preset,
        screenshotPath,
        diff,
        threshold,
        passed,
      });
    }

    const failedPresets = presetResults.filter((preset) => !preset.passed);
    const weakestPresets = [...presetResults]
      .sort((a, b) => (a.diff.changedRatio + a.diff.meanRgbDiff / 10) - (b.diff.changedRatio + b.diff.meanRgbDiff / 10))
      .slice(0, 10)
      .map((preset) => ({
        id: preset.id,
        label: preset.label,
        category: preset.category,
        changedRatio: Number(preset.diff.changedRatio.toFixed(6)),
        meanRgbDiff: Number(preset.diff.meanRgbDiff.toFixed(6)),
      }));

    const screenCheckFailures = [];
    if (!previewState) {
      screenCheckFailures.push('Preview DOM inspection failed');
    } else {
      if (previewState.isolation !== 'isolate') {
        screenCheckFailures.push(`Preview container isolation mismatch: ${previewState.isolation}`);
      }
      if (!previewState.mixBlendModes.includes('screen')) {
        screenCheckFailures.push(`Expected screen blend mode inside preview, got: ${previewState.mixBlendModes.join(', ') || '(none)'}`);
      }
    }
    if (warmToneDiff.changedRatio <= 0.2) {
      screenCheckFailures.push(`Warm tone overlay too weak: changedRatio=${warmToneDiff.changedRatio.toFixed(4)}`);
    }
    if (rainDiff.changedRatio <= 0.01) {
      screenCheckFailures.push(`Rain overlay too weak: changedRatio=${rainDiff.changedRatio.toFixed(4)}`);
    }

    const summary = {
      ok: screenCheckFailures.length === 0 && failedPresets.length === 0,
      outputDir: OUTPUT_DIR,
      checkedPresetCount: presetCatalog.length,
      baselinePath,
      warmTonePath,
      rainPath,
      warmToneDiff,
      rainDiff,
      previewState,
      screenCheckFailures,
      weakestPresets,
      failedPresetIds: failedPresets.map((preset) => preset.id),
      presetResults,
    };

    await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    assert(summary.ok, [
      ...screenCheckFailures,
      ...failedPresets.map((preset) => `Overlay visibility failure: ${preset.id}(${preset.diff.changedRatio.toFixed(4)}/${preset.diff.meanRgbDiff.toFixed(4)})`),
    ].join('\n'));
  } finally {
    if (context) await context.close();
    await stopDevServer(devServer);
    await fs.rm(tempProfileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
