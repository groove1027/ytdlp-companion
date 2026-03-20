import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(ROOT, 'src');
const requireFromSrc = createRequire(path.join(SRC_ROOT, 'package.json'));
const puppeteer = requireFromSrc('puppeteer');
const VERIFY_PORT = Number(process.env.GOOGLE_REF_VERIFY_PORT || 4273);
const LOCAL_APP_URL = `http://127.0.0.1:${VERIFY_PORT}/`;
const APP_URL = process.env.GOOGLE_REF_VERIFY_APP_URL || LOCAL_APP_URL;
const PROXY_BASE_URL = (process.env.GOOGLE_REF_VERIFY_PROXY_URL || 'https://all-in-one-production.pages.dev').replace(/\/$/, '');

const VERIFY_SCENE = {
  id: 'verify-google-reference-scene',
  scriptText: '한옥 마당을 비추는 장면',
  visualPrompt: '',
  visualDescriptionKO: '한옥 마당',
  characterPresent: false,
  isGeneratingImage: false,
  isGeneratingVideo: false,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.ok || res.status === 404) {
        return;
      }
    } catch {}

    await sleep(500);
  }

  throw new Error(`App did not become ready: ${url}`);
}

function startLocalApp() {
  if (APP_URL !== LOCAL_APP_URL) {
    return null;
  }

  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(VERIFY_PORT), '--strictPort'],
    {
      cwd: SRC_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => process.stderr.write(String(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));

  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(3000),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function verifyProxyEndpoint() {
  const emptyResponse = await fetch(`${PROXY_BASE_URL}/api/google-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert(emptyResponse.status === 400, `Expected proxy empty POST to return 400, got ${emptyResponse.status}`);

  const searchResponse = await fetch(`${PROXY_BASE_URL}/api/google-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: 'https://www.google.com/search?tbm=isch&q=%ED%95%9C%EA%B5%AD+%ED%95%9C%EC%98%A5',
    }),
  });

  assert(searchResponse.ok, `Expected proxy search POST to succeed, got ${searchResponse.status}`);
  const html = await searchResponse.text();
  assert(html.length > 1000, 'Expected proxy search POST to return a non-trivial HTML payload');

  const bingResponse = await fetch(`${PROXY_BASE_URL}/api/google-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: 'https://www.bing.com/images/search?q=%ED%95%9C%EA%B5%AD+%ED%95%9C%EC%98%A5',
    }),
  });

  assert(bingResponse.ok, `Expected proxy Bing POST to succeed, got ${bingResponse.status}`);
  const bingHtml = await bingResponse.text();
  assert(bingHtml.length > 1000, 'Expected proxy Bing POST to return a non-trivial HTML payload');
  assert(/class="iusc"|murl|thId/i.test(bingHtml), 'Expected Bing image payload markers in proxy response');

  return {
    emptyStatus: emptyResponse.status,
    searchStatus: searchResponse.status,
    payloadLength: html.length,
    bingStatus: bingResponse.status,
    bingPayloadLength: bingHtml.length,
  };
}

async function verifyBrowserFlow() {
  const launchOptions = { headless: true };
  if (process.env.CHROME_BIN) {
    launchOptions.executablePath = process.env.CHROME_BIN;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async ({ proxyBaseUrl, scene }) => {
      const originalFetch = window.fetch.bind(window);

      window.fetch = (input, init) => {
        if (typeof input === 'string' && input.startsWith('/api/google-proxy')) {
          return originalFetch(`${proxyBaseUrl}${input}`, init);
        }

        return originalFetch(input, init);
      };

      const googleRef = await import('/services/googleReferenceSearchService.ts');
      const workingScene = { ...scene };
      let finalUpdate = null;

      const query = googleRef.buildSearchQuery(workingScene);
      const searchResult = await googleRef.searchGoogleImages(query, 1);
      await googleRef.autoApplyGoogleReferences(
        [workingScene],
        '',
        (id, partial) => {
          if (id !== workingScene.id) return;
          finalUpdate = { id, partial };
          Object.assign(workingScene, partial);
        },
        undefined,
        true,
      );

      return {
        query,
        provider: searchResult.provider,
        resultCount: searchResult.items.length,
        firstLink: searchResult.items[0]?.link || '',
        finalStatus: finalUpdate?.partial?.generationStatus || workingScene.generationStatus || '',
        finalImageUrl: finalUpdate?.partial?.imageUrl || workingScene.imageUrl || '',
      };
    }, {
      proxyBaseUrl: PROXY_BASE_URL,
      scene: VERIFY_SCENE,
    });

    assert(result.resultCount > 0, `Expected at least one reference result, got ${result.resultCount}`);
    assert(
      result.provider === 'google' || result.provider === 'bing',
      `Expected Google or Bing provider before Wikimedia fallback, got ${result.provider}`,
    );
    assert(
      !/wikimedia/i.test(result.firstLink),
      `Expected non-Wikimedia reference source, got ${result.firstLink}`,
    );
    assert(result.finalImageUrl, 'Expected auto-apply to assign an imageUrl');
    assert(
      /(구글|대체) 레퍼런스 적용됨/.test(result.finalStatus),
      `Expected success status after auto-apply, got "${result.finalStatus}"`,
    );

    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const localApp = startLocalApp();

  try {
    await waitForHttp(APP_URL);

    const proxy = await verifyProxyEndpoint();
    const browser = await verifyBrowserFlow();

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      proxyBaseUrl: PROXY_BASE_URL,
      proxy,
      browser,
    }, null, 2));
  } finally {
    await stopProcess(localApp);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
