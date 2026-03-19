import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ADOBE_MEDIA_CACHE_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'Common', 'Media Cache');
const CAPCUT_PROCESS_PATTERN = 'CapCut Helper \\(Renderer\\)|CapCut Helper \\(GPU\\)|CapCut Helper --type=utility|CapCut$';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(file, args, options = {}) {
  const { allowFailure = false, cwd = process.cwd(), timeout = 60000 } = options;
  try {
    const result = await execFileAsync(file, args, {
      cwd,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: 0,
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

async function waitFor(predicate, timeoutMs, intervalMs = 2000) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt <= timeoutMs) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await sleep(intervalMs);
  }
  return lastValue;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function collectCacheHits(searchTokens) {
  const hits = {};
  for (const token of searchTokens) {
    const cacheState = await runCommand('rg', ['-a', '-n', token, ADOBE_MEDIA_CACHE_ROOT, '-S'], { allowFailure: true, timeout: 10000 });
    hits[token] = cacheState.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return hits;
}

export async function verifyCapCutProjectOpen(projectPath, options = {}) {
  const waitMs = options.waitMs || Number(process.env.CAPCUT_VERIFY_WAIT_MS || 15000);
  const metaPath = path.join(projectPath, 'draft_meta_info.json');
  const beforeMeta = await readJson(metaPath);

  const capCutProcess = spawn(
    '/Applications/CapCut.app/Contents/MacOS/CapCut',
    [`--draft_path=${projectPath}`, '--draft_type=draft', '--draft_from=default'],
    {
      detached: true,
      stdio: 'ignore',
    },
  );
  capCutProcess.unref();

  const verification = await waitFor(async () => {
    const processState = await runCommand('ps', ['-axo', 'pid,command'], { allowFailure: true, timeout: 5000 });
    const windowState = await runCommand('osascript', ['-e', 'tell application "System Events" to tell process "CapCut" to get name of windows'], { allowFailure: true, timeout: 5000 });
    const processMatched = processState.stdout.includes(projectPath);

    if (processMatched && windowState.stdout.includes('CapCut')) {
      return {
        processState,
        windowState,
      };
    }

    return null;
  }, waitMs);

  return {
    ok: !!verification,
    app: 'CapCut',
    projectPath,
    beforeMeta,
    afterMeta: await readJson(metaPath),
    processOutput: verification?.processState?.stdout || '',
    windowOutput: verification?.windowState?.stdout || '',
    metaRewritten: false,
  };
}

export async function resolvePremiereAppPath() {
  const entries = await fs.readdir('/Applications');
  const candidates = entries
    .filter((entry) => /^Adobe Premiere Pro(?: \d{4})?(?:\.app)?$/.test(entry))
    .sort()
    .reverse();
  if (candidates.length === 0) {
    throw new Error('Adobe Premiere Pro app not found in /Applications');
  }

  const outerPath = path.join('/Applications', candidates[0]);
  if (outerPath.endsWith('.app')) return outerPath;

  const nestedEntries = await fs.readdir(outerPath);
  const nestedApp = nestedEntries.find((entry) => /^Adobe Premiere Pro(?: \d{4})?\.app$/.test(entry));
  if (!nestedApp) {
    throw new Error(`Adobe Premiere Pro app bundle not found inside ${outerPath}`);
  }

  return path.join(outerPath, nestedApp);
}

export async function verifyPremiereXmlImport(xmlPath, options = {}) {
  const waitMs = options.waitMs || Number(process.env.PREMIERE_VERIFY_WAIT_MS || 30000);
  const searchTokens = options.searchTokens && options.searchTokens.length > 0
    ? options.searchTokens
    : [options.searchToken || path.basename(xmlPath).replace(/\.[^.]+$/, '')];
  const premiereAppPath = options.premiereAppPath || await resolvePremiereAppPath();
  const premiereAppName = path.basename(premiereAppPath, '.app');
  const beforeHits = await collectCacheHits(searchTokens);

  await runCommand('open', ['-a', premiereAppPath, xmlPath], { timeout: 10000 });

  const verification = await waitFor(async () => {
    const processState = await runCommand('pgrep', ['-ifl', 'Adobe Premiere Pro'], { allowFailure: true, timeout: 5000 });
    const windowState = await runCommand('osascript', ['-e', `tell application "System Events" to tell process "${premiereAppName}" to get name of windows`], { allowFailure: true, timeout: 5000 });
    const afterHits = await collectCacheHits(searchTokens);
    const cacheIncreased = searchTokens.some((token) => afterHits[token].length > (beforeHits[token]?.length || 0));

    if (processState.stdout.trim() && cacheIncreased) {
      return {
        processState,
        windowState,
        afterHits,
      };
    }

    return null;
  }, waitMs);

  return {
    ok: !!verification,
    app: premiereAppName,
    xmlPath,
    searchTokens,
    processOutput: verification?.processState?.stdout || '',
    windowOutput: verification?.windowState?.stdout || '',
    cacheOutput: searchTokens
      .flatMap((token) => verification?.afterHits?.[token] || [])
      .join('\n'),
  };
}
