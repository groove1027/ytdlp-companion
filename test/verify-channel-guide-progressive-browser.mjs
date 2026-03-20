import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDistServer } from './helpers/distBrowserHarness.mjs';
import { launchPlaywrightBrowser } from './helpers/playwrightHarness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'test', 'output', 'verify_channel_guide_progressive');

const VIDEO_IDS = Array.from({ length: 10 }, (_, index) => `mockv${String(index + 1).padStart(2, '0')}`);
const VIDEO_FIXTURES = VIDEO_IDS.map((videoId, index) => ({
  id: videoId,
  title: `모의 영상 ${index + 1}`,
  description: `모의 영상 ${index + 1} 설명입니다. 지침서와 스타일 분석에 쓸 설명 텍스트입니다.`,
  publishedAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  viewCount: 100000 - index * 3210,
  duration: 'PT8M12S',
  tags: ['자동화', '유튜브', `실험${index + 1}`],
  thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
}));
const VIDEO_BY_ID = new Map(VIDEO_FIXTURES.map((video) => [video.id, video]));

const BASE_GUIDELINE_JSON = JSON.stringify({
  channelName: 'Mock Channel Lab',
  tone: '문제 제기 후 곧바로 결론을 던지는 빠른 단문형 화법',
  structure: '첫 문장 후킹 -> 사례 압축 -> 즉시 결론 -> 행동 유도',
  topics: ['AI 자동화', '유튜브 운영', '생산성'],
  keywords: ['자동화', '실험', '속도', '지침서'],
  targetAudience: '실무형 크리에이터와 운영자',
  avgLength: 780,
  hookPattern: '첫 줄에서 문제를 정면으로 찌른 뒤 반전을 붙인다',
  closingPattern: '짧은 결론과 바로 실행할 행동 한 줄로 닫는다',
  fullGuidelineText:
    '[페르소나 선언] 빠르게 결론을 말하는 실무형 화자\n' +
    '[사고 회로] 장황한 설명 없이 원인과 해결을 즉시 연결\n' +
    '[문장 구조 규칙] 짧은 문장 위주, 연결어 최소화\n' +
    '[줄바꿈 규칙] 의미 단위마다 줄바꿈\n' +
    '[서사 구조] 문제 -> 압축 사례 -> 결론\n' +
    '[절대 금기] 뜬구름 잡는 서론 금지',
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  };
}

function buildVideoItem(video) {
  return {
    id: video.id,
    snippet: {
      title: video.title,
      description: video.description,
      publishedAt: video.publishedAt,
      tags: video.tags,
      thumbnails: {
        high: { url: video.thumbnailUrl },
        medium: { url: video.thumbnailUrl.replace('hqdefault', 'mqdefault') },
        default: { url: video.thumbnailUrl.replace('hqdefault', 'default') },
      },
    },
    statistics: { viewCount: String(video.viewCount) },
    contentDetails: { duration: video.duration },
    player: { embedWidth: '480', embedHeight: '270' },
  };
}

async function saveFailureArtifact(page, label) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `${label}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}

async function readSavedBenchmark(page, benchmarkId) {
  return page.evaluate(async (id) => {
    return await new Promise((resolve, reject) => {
      const openReq = indexedDB.open('ai-storyboard-v2');
      openReq.onerror = () => reject(openReq.error);
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction('benchmarks', 'readonly');
        const store = tx.objectStore('benchmarks');
        const getReq = store.get(id);
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => {
          const value = getReq.result;
          resolve({
            found: Boolean(value),
            hasGuide: Boolean(value?.guideline?.copyableSystemPrompt),
            guidePrefix: value?.guideline?.copyableSystemPrompt?.slice(0, 60) || '',
          });
        };
      };
    });
  }, benchmarkId);
}

async function main() {
  const distServer = await startDistServer();
  const browser = await launchPlaywrightBrowser({ headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(distServer.baseUrl).origin,
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'verify-channel-guide-token');
    localStorage.setItem('auth_user', JSON.stringify({
      email: 'verifier@example.com',
      displayName: 'Verifier',
    }));
    localStorage.setItem('navigation-state', JSON.stringify({
      activeTab: 'channel-analysis',
      showProjectDashboard: false,
    }));
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/verify') {
        return route.fulfill(jsonResponse({
          valid: true,
          user: { email: 'verifier@example.com', displayName: 'Verifier' },
        }));
      }
      if (url.pathname === '/api/auth/get-settings') {
        return route.fulfill(jsonResponse({ settings: {} }));
      }
      if (url.pathname === '/api/auth/sync-batch') {
        return route.fulfill(jsonResponse({ needsUpload: [], needsDownload: [], deleted: [] }));
      }
      if (url.pathname === '/api/auth/list-projects') {
        return route.fulfill(jsonResponse({ projects: [] }));
      }
      return route.fulfill(jsonResponse({ ok: true }));
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/channels')) {
      const part = url.searchParams.get('part') || '';
      if (part === 'id' && url.searchParams.get('forHandle') === '@mockchannel') {
        return route.fulfill(jsonResponse({ items: [{ id: 'UCMOCK1234567890' }] }));
      }
      if (part === 'snippet,statistics' && url.searchParams.get('id') === 'UCMOCK1234567890') {
        return route.fulfill(jsonResponse({
          items: [{
            id: 'UCMOCK1234567890',
            snippet: {
              title: 'Mock Channel Lab',
              description: '채널 분석실 검증용 모의 채널',
              thumbnails: {
                high: { url: 'https://img.youtube.com/vi/mockchannel/hqdefault.jpg' },
              },
            },
            statistics: {
              subscriberCount: '123456',
              videoCount: '87',
              viewCount: '9876543',
            },
          }],
        }));
      }
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/search')) {
      if (url.searchParams.get('channelId') === 'UCMOCK1234567890' && url.searchParams.get('type') === 'video') {
        return route.fulfill(jsonResponse({
          items: VIDEO_IDS.map((videoId) => ({ id: { videoId } })),
        }));
      }
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/videos')) {
      const ids = (url.searchParams.get('id') || '').split(',').filter(Boolean);
      const part = url.searchParams.get('part') || '';
      if (part.includes('snippet') && ids.length > 0) {
        return route.fulfill(jsonResponse({
          items: ids.map((id) => buildVideoItem(VIDEO_BY_ID.get(id))),
        }));
      }
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/captions')) {
      return route.fulfill(jsonResponse({ items: [] }));
    }

    if (url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext') {
      return route.fulfill({
        status: 200,
        contentType: 'text/xml; charset=utf-8',
        body: '',
      });
    }

    if (url.hostname === 'www.youtube.com' && url.pathname.startsWith('/youtubei/v1/get_transcript')) {
      return route.fulfill(jsonResponse({ actions: [] }));
    }

    if (/invidious|inv\.|piped/i.test(url.hostname)) {
      if (url.pathname.includes('/api/v1/captions/')) {
        return route.fulfill(jsonResponse({ captions: [] }));
      }
      if (url.pathname.includes('/streams/')) {
        return route.fulfill(jsonResponse({ title: 'mock', subtitles: [] }));
      }
      return route.fulfill({
        status: 404,
        contentType: 'application/json; charset=utf-8',
        body: '{}',
      });
    }

    if (url.hostname === 'api.evolink.ai' || url.hostname === 'api.kie.ai') {
      const bodyText = request.postData() || '';
      let parsedBody = {};
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {}
      const bodyStr = JSON.stringify(parsedBody);

      if (url.pathname.includes('/chat/completions')) {
        if (bodyStr.includes('[Raw Data (원본 대본)') && bodyStr.includes('fullGuidelineText')) {
          await sleep(400);
          return route.fulfill(jsonResponse({
            id: 'mock-l1',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: BASE_GUIDELINE_JSON },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 1200, completion_tokens: 800, total_tokens: 2000 },
          }));
        }
        if (bodyStr.includes('[제목 목록 + 조회수]')) {
          await sleep(1800);
          return route.fulfill(jsonResponse({
            id: 'mock-l5',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: '제목 공식: 숫자보다 결론형 제목 선호\n태그 전략: 핵심 키워드 반복\n챕터 구조: 문제-사례-정리',
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 800, completion_tokens: 300, total_tokens: 1100 },
          }));
        }
        if (bodyStr.includes('시각적 스타일 패턴을 분석하세요')) {
          await sleep(4500);
          return route.fulfill(jsonResponse({
            id: 'mock-l2',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: '시각 스타일 DNA: 진한 대비, 굵은 텍스트, 좌우 분할 썸네일',
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 900, completion_tokens: 250, total_tokens: 1150 },
          }));
        }
        if (bodyStr.includes('인기 영상 시청자 댓글입니다')) {
          await sleep(3500);
          return route.fulfill(jsonResponse({
            id: 'mock-l4',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: '시청자 인사이트: 빠른 요약, 실무형 톤, 군더더기 없는 결론을 선호',
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 700, completion_tokens: 220, total_tokens: 920 },
          }));
        }
        if (bodyStr.includes('위 분석을 JSON으로 분리')) {
          await sleep(300);
          return route.fulfill(jsonResponse({
            id: 'mock-l3-split',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  editGuide: '편집 가이드: 컷 속도 빠름, 핵심 문장 확대 자막 사용',
                  audioGuide: '오디오 가이드: 낮은 BGM, 포인트 효과음 최소 사용',
                }),
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 400, completion_tokens: 180, total_tokens: 580 },
          }));
        }
        return route.fulfill(jsonResponse({
          id: 'mock-default',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: '기본 응답' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }));
      }

      if (url.pathname.includes('/models/') && url.pathname.endsWith(':generateContent')) {
        await sleep(2500);
        return route.fulfill(jsonResponse({
          candidates: [{
            content: {
              parts: [{
                text: '편집 스타일 분석 결과\n사운드 디자인 분석 결과\n컷 전환은 빠르고 자막은 크게 강조된다.',
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 },
        }));
      }
    }

    if (url.hostname === 'img.youtube.com') {
      return route.fulfill({ status: 204, body: '' });
    }

    if (url.hostname === '127.0.0.1') {
      return route.continue();
    }

    return route.fulfill({ status: 204, body: '' });
  });

  let failureShot = '';

  try {
    await page.goto(distServer.baseUrl, { waitUntil: 'load', timeout: 120000 });
    await page.getByRole('button', { name: /채널\/영상 분석/ }).click().catch(() => {});
    await page.getByRole('button', { name: '채널 분석실' }).click().catch(() => {});

    const urlInput = page.getByPlaceholder(/YouTube URL/);
    await urlInput.waitFor({ timeout: 20000 });
    await urlInput.fill('https://www.youtube.com/@mockchannel');
    await page.getByRole('button', { name: '분석 시작' }).click();

    await page.getByText('수집된 영상 (10개)').waitFor({ timeout: 15000 });
    const earlyGalleryVisible = await page.getByText('수집된 영상 (10개)').isVisible();
    const earlyProgressVisible = await page.getByText(/수집 진행 중|AI 분석 계속 진행 중/).isVisible();

    await page.getByText('Mock Channel Lab 지침서').waitFor({ timeout: 15000 });
    await page.getByText('지침서 먼저 준비됨').waitFor({ timeout: 15000 });
    await page.getByText('나머지 DNA 분석 계속 진행 중').waitFor({ timeout: 15000 });

    const guideReadyDuringProgress = await page.getByText('지침서 먼저 준비됨').isVisible();
    const loadingStillVisible = await page.getByText(/AI 채널 스타일 DNA 다층 분석 중|AI 채널 스타일 DNA/).isVisible();

    const guideCopyButton = page.getByRole('button', { name: '전체 복사' });
    await guideCopyButton.waitFor({ timeout: 10000 });
    await guideCopyButton.click();
    await page.getByRole('button', { name: '복사됨!' }).waitFor({ timeout: 5000 });
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

    await page.getByText('스타일 분석 결과').waitFor({ timeout: 25000 });
    await sleep(1200);
    const persistedGuide = await readSavedBenchmark(page, 'mock-channel-lab');

    assert(earlyGalleryVisible, '영상 목록이 분석 중 조기 노출되지 않았습니다.');
    assert(earlyProgressVisible, '영상 목록 선공개 시 진행 배지가 보이지 않았습니다.');
    assert(guideReadyDuringProgress, '지침서가 전체 분석 완료 전 노출되지 않았습니다.');
    assert(loadingStillVisible, '지침서 노출 시점에도 로딩 패널이 유지되어야 합니다.');
    assert(clipboardText.includes('[시스템 프롬프트]') && clipboardText.includes('Mock Channel Lab'), '전체 복사 결과가 예상한 지침서 내용이 아닙니다.');
    assert(persistedGuide.found && persistedGuide.hasGuide, '지침서가 벤치마크 IndexedDB에 저장되지 않았습니다.');

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'result.json'),
      JSON.stringify({
        ok: true,
        earlyGalleryVisible,
        earlyProgressVisible,
        guideReadyDuringProgress,
        loadingStillVisible,
        clipboardPreview: clipboardText.slice(0, 120),
        persistedGuide,
      }, null, 2),
      'utf8',
    );

    console.log(JSON.stringify({
      ok: true,
      outputDir: OUTPUT_DIR,
      verified: {
        earlyGalleryVisible,
        earlyProgressVisible,
        guideReadyDuringProgress,
        loadingStillVisible,
        clipboardHasSystemPrompt: clipboardText.includes('[시스템 프롬프트]'),
        persistedGuide,
      },
    }, null, 2));
  } catch (error) {
    failureShot = await saveFailureArtifact(page, 'failure');
    throw new Error(`${error instanceof Error ? error.message : String(error)}${failureShot ? ` | screenshot: ${failureShot}` : ''}`);
  } finally {
    await context.close();
    await browser.close();
    await distServer.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
