import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULT_CHROME_PATH =
  process.env.PLAYWRIGHT_CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function loadPlaywright() {
  const playwrightEntry = path.join(PROJECT_ROOT, 'src', 'node_modules', 'playwright-core', 'index.mjs');
  return import(pathToFileURL(playwrightEntry).href);
}

async function resolveChromePath(chromePath = DEFAULT_CHROME_PATH) {
  await fs.access(chromePath);
  return chromePath;
}

function resolveHeadless(headless) {
  if (typeof headless === 'boolean') return headless;
  return process.env.PLAYWRIGHT_HEADFUL !== '1';
}

export async function launchPlaywrightBrowser(options = {}) {
  const { chromium } = await loadPlaywright();
  const executablePath = await resolveChromePath(options.executablePath);
  return chromium.launch({
    executablePath,
    headless: resolveHeadless(options.headless),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(options.args || []),
    ],
  });
}

export async function launchPlaywrightPersistentContext(userDataDir, options = {}) {
  const { chromium } = await loadPlaywright();
  const executablePath = await resolveChromePath(options.executablePath);
  return chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: resolveHeadless(options.headless),
    viewport: options.viewport || null,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(options.args || []),
    ],
  });
}
