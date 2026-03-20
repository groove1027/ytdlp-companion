import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchPlaywrightBrowser } from './helpers/playwrightHarness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(ROOT, 'src');
const VERIFY_PORT = Number(process.env.GOOGLE_REF_VERIFY_PORT || 4302);
const APP_URL = `http://127.0.0.1:${VERIFY_PORT}/`;
const PROXY_BASE_URL = (process.env.GOOGLE_REF_VERIFY_PROXY_URL || 'https://all-in-one-production.pages.dev').replace(/\/$/, '');
const LOW_SIGNAL_DOMAINS = ['facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'ytimg.com', 'pinterest.', 'x.com', 'twitter.com', 'tistory.com', 'blogspot.com', 'tv.zum.com', 'blog.naver.com', 'post.naver.com', 'cafe.naver.com'];

const SCENES = [
  {
    id: 'scene-1',
    scriptText: '한옥 마당에서 아침 햇살이 비치는 장면',
    visualDescriptionKO: '전통 한옥 마당으로 부드러운 아침 햇살이 들어오는 장면',
    sceneLocation: '한옥 마당',
    sceneCulture: '한국 전통',
    sceneEra: '현대',
    entityName: '한옥',
    visualPrompt: '',
    characterPresent: false,
    isGeneratingImage: false,
    isGeneratingVideo: false,
  },
  {
    id: 'scene-2',
    scriptText: '서울 궁궐 복도를 천천히 걷는 장면',
    visualDescriptionKO: '서울 궁궐 복도를 따라 천천히 이동하는 장면',
    sceneLocation: '서울 궁궐',
    sceneCulture: '한국 전통',
    sceneEra: '조선 시대',
    entityName: '궁궐',
    visualPrompt: '',
    characterPresent: true,
    isGeneratingImage: false,
    isGeneratingVideo: false,
  },
  {
    id: 'scene-3',
    scriptText: '전통 시장 골목에서 상인이 물건을 정리하는 장면',
    visualDescriptionKO: '전통 시장 골목에서 상인이 물건을 진열하며 정리하는 장면',
    sceneLocation: '전통 시장',
    sceneCulture: '한국 전통',
    sceneEra: '현대',
    entityName: '상인',
    visualPrompt: '',
    characterPresent: true,
    isGeneratingImage: false,
    isGeneratingVideo: false,
  },
];

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

function isLowSignalDomain(domain) {
  return LOW_SIGNAL_DOMAINS.some((pattern) => domain.includes(pattern));
}

async function main() {
  const localApp = startLocalApp();

  try {
    await waitForHttp(APP_URL);
    const browser = await launchPlaywrightBrowser({ headless: true });

    try {
      const page = await browser.newPage();

      await page.addInitScript(({ proxyBaseUrl }) => {
        const originalFetch = window.fetch.bind(window);
        window.__referenceFetchLog = [];

        window.fetch = async (input, init) => {
          const rawUrl = typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
          const resolvedUrl = rawUrl.startsWith('/api/google-proxy')
            ? `${proxyBaseUrl}${rawUrl}`
            : rawUrl;
          const response = await originalFetch(
            resolvedUrl !== rawUrl ? resolvedUrl : input,
            resolvedUrl !== rawUrl ? init : init,
          );

          if (/api\.evolink\.ai|api\.kie\.ai/i.test(rawUrl)) {
            let body = '';
            if (typeof init?.body === 'string') {
              body = init.body;
            } else if (input instanceof Request) {
              try {
                body = await input.clone().text();
              } catch {
                body = '';
              }
            }

            window.__referenceFetchLog.push({
              url: rawUrl,
              status: response.status,
              body,
            });
          }

          return response;
        };
      }, { proxyBaseUrl: PROXY_BASE_URL });

      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

      const result = await page.evaluate(async ({ scenes }) => {
        const service = await import('/services/googleReferenceSearchService.ts');
        const globalContext = '한국 전통 문화와 공간의 분위기를 소개하는 다큐멘터리 풍 영상';
        const outputs = [];

        for (let index = 0; index < scenes.length; index += 1) {
          const scene = scenes[index];
          const prevScene = index > 0 ? scenes[index - 1] : null;
          const nextScene = index < scenes.length - 1 ? scenes[index + 1] : null;
          const response = await service.searchSceneReferenceImages(
            scene,
            prevScene,
            nextScene,
            globalContext,
            1,
            'best',
          );

          outputs.push({
            sceneText: scene.scriptText,
            query: response.query,
            provider: response.provider,
            topResults: response.items.slice(0, 5).map((item) => ({
              title: item.title,
              domain: item.displayLink,
              contextLink: item.contextLink,
            })),
          });
        }

        return {
          outputs,
          fetchLog: window.__referenceFetchLog || [],
        };
      }, { scenes: SCENES });

      assert(result.outputs.length === SCENES.length, 'Expected output for every verification scene');

      for (const output of result.outputs) {
        assert(output.topResults.length > 0, `Expected at least one result for "${output.sceneText}"`);
        const lowSignalTop3 = output.topResults.slice(0, 3).filter((item) => isLowSignalDomain((item.domain || '').toLowerCase()));
        assert(lowSignalTop3.length === 0, `Expected no low-signal domains in top 3 for "${output.sceneText}", got ${lowSignalTop3.map((item) => item.domain).join(', ')}`);
      }

      const aiRequests = result.fetchLog.filter((entry) => (
        /api\.evolink\.ai|api\.kie\.ai/i.test(entry.url)
          && /gemini-3\.1-flash-lite-preview|gemini-3-flash/i.test(entry.body || '')
      ));
      assert(aiRequests.length > 0, 'Expected at least one AI rerank request in best mode');
      assert(aiRequests.some((entry) => entry.status >= 200 && entry.status < 300), 'Expected an AI rerank request to succeed');

      console.log(JSON.stringify({
        ok: true,
        appUrl: APP_URL,
        proxyBaseUrl: PROXY_BASE_URL,
        aiRequests: aiRequests.map(({ url, status }) => ({ url, status })),
        outputs: result.outputs,
      }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(localApp);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
