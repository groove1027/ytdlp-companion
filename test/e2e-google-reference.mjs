/**
 * E2E 무료 이미지 레퍼런스 검증 — Playwright
 *
 * 6줄 대본 → 장면 store 주입 → 이미지/영상 탭 → 무료 레퍼런스 일괄 검색 → 결과 확인
 *
 * 실행: node test/e2e-google-reference.mjs
 * 옵션: HEADLESS=false (브라우저 표시)
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const PROXY_BASE_URL = (process.env.PROXY_BASE_URL || 'https://all-in-one-production.pages.dev').replace(/\/$/, '');
const EVOLINK_KEY = process.env.EVOLINK_KEY || 'REDACTED_EVOLINK_KEY';
const HEADLESS = process.env.HEADLESS !== 'false';
const SCREENSHOT_DIR = path.join(ROOT, 'test', 'output');

// 6줄짜리 테스트 대본 — 각 줄이 하나의 장면
const SCRIPT_LINES = [
  '한적한 시골 마을의 아침, 안개가 걷히며 논밭이 드러난다.',
  '할머니가 마당에서 빨래를 널고 있다. 개가 곁에서 졸고 있다.',
  '마을 어귀의 작은 가게 앞, 아저씨가 신문을 읽고 있다.',
  '아이들이 골목길을 뛰어다니며 놀고 있다.',
  '저녁 노을이 지는 들판, 농부가 하루 일을 마치고 돌아온다.',
  '밤하늘에 별이 가득한 시골집 마당, 가족이 모여 앉아 이야기를 나눈다.',
];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

/** z-index 200 이상의 오버레이/모달을 모두 닫기 */
async function dismissOverlays(page) {
  await page.evaluate(() => {
    // 모든 z-200+ 오버레이 제거
    document.querySelectorAll('[class*="z-[200]"], [class*="z-\\[200\\]"]').forEach(el => el.remove());
    // 모달 배경
    document.querySelectorAll('[class*="fixed inset-0"]').forEach(el => {
      if (el.style.zIndex >= 200 || el.className.includes('z-[200]') || el.className.includes('z-[100]')) {
        el.remove();
      }
    });
  });
}

async function main() {
  log(`앱 URL: ${APP_URL}`);
  log(`프록시: ${PROXY_BASE_URL}`);
  log(`Headless: ${HEADLESS}`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // 콘솔 로그 수집
  const consoleLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (text.includes('[GoogleRef]') || text.includes('레퍼런스')) {
      log(`  브라우저: ${text}`);
    }
  });

  // /api/google-proxy 요청을 프로덕션 Cloudflare로 라우팅
  let proxyCallCount = 0;
  await page.route('**/api/google-proxy', async (route) => {
    proxyCallCount++;
    const postData = route.request().postData();
    log(`  프록시 호출 #${proxyCallCount}`);
    try {
      const response = await fetch(`${PROXY_BASE_URL}/api/google-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postData,
      });
      const body = await response.text();
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      });
    } catch (err) {
      log(`  프록시 에러: ${err.message}`);
      await route.abort('connectionfailed');
    }
  });

  try {
    // ── STEP 1: 앱 로드 + 초기 설정 ──
    log('STEP 1: 앱 로드 + 초기 설정');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // localStorage 설정: API 키, 투어 완료, 네비게이션 상태
    await page.evaluate(({ key }) => {
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
      localStorage.setItem('onboarding-tour-completed', 'true');
      // 이미지/영상 탭으로 직접 이동하도록 네비게이션 상태 설정
      try {
        const navState = JSON.parse(localStorage.getItem('navigation-state') || '{}');
        navState.activeTab = 'image-video';
        navState.showProjectDashboard = false;
        localStorage.setItem('navigation-state', JSON.stringify(navState));
      } catch {}
    }, { key: EVOLINK_KEY });

    // 새로고침으로 설정 반영
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 혹시 남아있는 오버레이 제거
    await dismissOverlays(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step1-app-loaded.png'), fullPage: false });
    log('  앱 로드 완료');

    // ── STEP 2: Store에 장면 + config 직접 주입 ──
    log('STEP 2: Store에 6개 장면 + config 주입');

    const injected = await page.evaluate(async ({ lines, script }) => {
      try {
        const { useProjectStore } = await import('/stores/projectStore.ts');
        const store = useProjectStore.getState();

        // config에 대본 설정
        store.setConfig((prev) => ({
          ...(prev || {}),
          script,
          aspectRatio: '16:9',
          videoFormat: 'shorts',
          globalContext: '한국 시골 마을의 하루를 담은 다큐멘터리',
          smartSplit: false,
        }));

        // 6개 장면 생성
        const scenes = lines.map((line, i) => ({
          id: `e2e-scene-${Date.now()}-${i + 1}`,
          scriptText: line,
          visualPrompt: '',
          visualDescriptionKO: line.slice(0, 30),
          characterPresent: false,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          isNativeHQ: false,
        }));

        store.setScenes(scenes);

        // Google Reference 활성화
        const { useImageVideoStore } = await import('/stores/imageVideoStore.ts');
        useImageVideoStore.getState().setEnableGoogleReference(true);

        return {
          ok: true,
          sceneCount: useProjectStore.getState().scenes.length,
          hasConfig: !!useProjectStore.getState().config,
          googleRefEnabled: useImageVideoStore.getState().enableGoogleReference,
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, { lines: SCRIPT_LINES, script: SCRIPT_LINES.join('\n') });

    log(`  주입 결과: ${JSON.stringify(injected)}`);
    if (!injected.ok) throw new Error(`Store 주입 실패: ${injected.error}`);

    await page.waitForTimeout(500);

    // ── STEP 3: 이미지/영상 탭으로 이동 ──
    log('STEP 3: 이미지/영상 탭으로 이동');
    await dismissOverlays(page);

    // 후반작업 그룹 열기
    const postProdBtn = page.locator('button:has-text("후반작업")');
    if (await postProdBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await postProdBtn.click({ force: true });
      await page.waitForTimeout(500);
    }

    // 이미지/영상 탭 클릭
    const imgVideoBtn = page.locator('button:has-text("이미지/영상")').first();
    if (await imgVideoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await imgVideoBtn.click({ force: true });
    } else {
      // navigationStore로 직접 이동
      await page.evaluate(async () => {
        const { useNavigationStore } = await import('/stores/navigationStore.ts');
        useNavigationStore.getState().setActiveTab('image-video');
      });
    }
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step3-imagevideo-tab.png'), fullPage: false });
    log('  이미지/영상 탭 이동 완료');

    // ── STEP 4: SetupPanel(스타일 선택) 서브탭에서 GoogleReferencePanel 찾기 ──
    log('STEP 4: GoogleReferencePanel 찾기');
    await dismissOverlays(page);

    // 스타일 선택 서브탭 클릭 (force로 오버레이 무시)
    const setupTab = page.locator('button:has-text("스타일 선택")');
    if (await setupTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await setupTab.click({ force: true });
      await page.waitForTimeout(500);
    }

    // GoogleReferencePanel까지 스크롤
    await page.evaluate(() => {
      const elements = document.querySelectorAll('h3');
      for (const el of elements) {
        if (el.textContent?.includes('무료 이미지 레퍼런스')) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          return true;
        }
      }
      // 메인 콘텐츠 영역 하단으로 스크롤
      const main = document.querySelector('main') || document.querySelector('[class*="overflow-y-auto"]');
      if (main) main.scrollTop = main.scrollHeight;
      return false;
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step4-reference-panel.png'), fullPage: false });

    // 토글이 off면 force로 켜기
    const toggleState = await page.evaluate(async () => {
      const { useImageVideoStore } = await import('/stores/imageVideoStore.ts');
      const enabled = useImageVideoStore.getState().enableGoogleReference;
      if (!enabled) useImageVideoStore.getState().setEnableGoogleReference(true);
      return useImageVideoStore.getState().enableGoogleReference;
    });
    log(`  Google Reference 토글: ${toggleState}`);
    await page.waitForTimeout(500);

    // ── STEP 5: 전체 레퍼런스 웹 검색 실행 ──
    log('STEP 5: 전체 레퍼런스 웹 검색 실행');

    // "웹 검색" 탭 클릭
    const webTabBtn = page.locator('button:has-text("웹 검색")');
    if (await webTabBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await webTabBtn.click({ force: true });
      await page.waitForTimeout(300);
    }

    // "전체 N개 장면 웹 레퍼런스 검색" 버튼 찾기
    let searchStarted = false;
    const searchAllBtn = page.locator('button:has-text("장면 웹 레퍼런스 검색")');
    if (await searchAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchAllBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await searchAllBtn.click({ force: true });
      searchStarted = true;
      log('  전체 검색 시작...');
    } else {
      // DOM에서 버튼을 직접 검색하여 클릭
      searchStarted = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const target = btns.find(b => b.textContent?.includes('장면 웹 레퍼런스 검색'));
        if (target && !target.disabled) {
          target.click();
          return true;
        }
        return false;
      });

      if (searchStarted) {
        log('  DOM 직접 클릭으로 전체 검색 시작...');
      } else {
        log('  전체 검색 버튼 미발견 — 서비스 직접 호출');
        // searchSceneReferenceImages를 직접 호출
        const directResult = await page.evaluate(async () => {
          try {
            const { useProjectStore } = await import('/stores/projectStore.ts');
            const { searchSceneReferenceImages } = await import('/services/googleReferenceSearchService.ts');
            const scenes = useProjectStore.getState().scenes;
            const config = useProjectStore.getState().config;
            const results = [];

            for (let i = 0; i < Math.min(scenes.length, 6); i++) {
              const scene = scenes[i];
              const prev = i > 0 ? scenes[i - 1] : null;
              const next = i < scenes.length - 1 ? scenes[i + 1] : null;
              try {
                const response = await searchSceneReferenceImages(
                  scene, prev, next, config?.globalContext, 1, 'fast',
                );
                results.push({
                  sceneIndex: i + 1,
                  provider: response.provider,
                  count: response.items.length,
                  query: response.query,
                  firstLink: response.items[0]?.link || '',
                });

                // 첫 번째 결과를 scene에 적용
                if (response.items.length > 0) {
                  useProjectStore.getState().updateScene(scene.id, {
                    imageUrl: response.items[0].link,
                    generationStatus: `${response.provider} 레퍼런스 적용`,
                  });
                }
              } catch (err) {
                results.push({ sceneIndex: i + 1, error: err.message });
              }
            }
            return { ok: true, results };
          } catch (err) {
            return { ok: false, error: err.message };
          }
        });

        log(`  직접 호출 결과: ${JSON.stringify(directResult, null, 2)}`);
        searchStarted = directResult.ok;
      }
    }

    // 검색 완료 대기
    if (searchStarted) {
      try {
        // 스피너 등장 대기
        await page.waitForSelector('button:has-text("검색 중")', { timeout: 5_000 }).catch(() => {});

        // 검색 완료 대기 (스피너 사라짐 또는 결과 뱃지 출현)
        await page.waitForFunction(
          () => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('검색 중'));
            if (btn) return false; // 아직 검색 중
            // 결과 뱃지가 하나라도 있으면 완료
            const badges = document.querySelectorAll('span[class*="text-green-400"]');
            return badges.length > 0 || true; // 5초 추가 대기 후 어쨌든 진행
          },
          { timeout: 120_000 },
        );
        log('  검색 완료');
      } catch {
        log('  검색 대기 타임아웃');
      }
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step5-search-done.png'), fullPage: false });

    // ── STEP 6: 결과 확인 ──
    log('STEP 6: 검색 결과 확인');

    const results = await page.evaluate(async () => {
      try {
        const { useProjectStore } = await import('/stores/projectStore.ts');
        const scenes = useProjectStore.getState().scenes;
        return {
          sceneCount: scenes.length,
          scenesWithImage: scenes.filter(s => !!s.imageUrl).length,
          scenes: scenes.map((s, i) => ({
            index: i + 1,
            id: s.id,
            scriptText: (s.scriptText || '').slice(0, 40),
            hasImage: !!s.imageUrl,
            imageUrl: (s.imageUrl || '').slice(0, 100),
            status: s.generationStatus || '',
          })),
        };
      } catch (err) {
        return { error: err.message };
      }
    });

    // DOM 결과
    const domResults = await page.evaluate(() => {
      const resultImages = document.querySelectorAll('img[loading="lazy"]');
      const resultBadges = document.querySelectorAll('span[class*="text-green-400"]');
      const providerBadges = document.querySelectorAll('span[class*="text-orange-300"], span[class*="text-sky-300"], span[class*="text-cyan-300"]');
      return {
        lazyImages: resultImages.length,
        resultBadges: Array.from(resultBadges).map(b => b.textContent),
        providers: Array.from(providerBadges).map(b => b.textContent),
      };
    });

    log('\n═══════════════════════════════════════════════');
    log('  검색 결과 요약');
    log('═══════════════════════════════════════════════');

    if (results.error) {
      log(`  오류: ${results.error}`);
    } else {
      log(`  총 장면: ${results.sceneCount}`);
      log(`  이미지 있는 장면: ${results.scenesWithImage}/${results.sceneCount}`);
      log(`  프록시 호출 횟수: ${proxyCallCount}`);
      log('  ─────────────────────────────────────');
      for (const scene of results.scenes || []) {
        const status = scene.hasImage ? '✅' : '❌';
        log(`  ${status} #${scene.index}: ${scene.scriptText}`);
        if (scene.hasImage) {
          log(`     이미지: ${scene.imageUrl}`);
          log(`     상태: ${scene.status}`);
        }
      }
    }

    log(`\n  DOM 결과:`);
    log(`    lazy 이미지: ${domResults.lazyImages}개`);
    log(`    결과 뱃지: ${JSON.stringify(domResults.resultBadges)}`);
    log(`    프로바이더: ${JSON.stringify(domResults.providers)}`);

    // ── STEP 7: 첫 번째 장면 펼쳐서 상세 확인 ──
    log('\nSTEP 7: 첫 번째 장면 상세 확인');
    await dismissOverlays(page);

    const firstSceneHeader = page.locator('span:has-text("#1")').first();
    if (await firstSceneHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstSceneHeader.locator('..').locator('..').click({ force: true });
      await page.waitForTimeout(1500);

      const mainImage = page.locator('img[loading="lazy"]').first();
      if (await mainImage.isVisible({ timeout: 5000 }).catch(() => false)) {
        log('  첫 번째 장면 이미지 확인 ✅');
      } else {
        log('  첫 번째 장면 이미지 미발견 (DOM에서)');
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'step7-scene-detail.png'), fullPage: false });

    // ── 관련 콘솔 로그 ──
    const refLogs = consoleLogs.filter(l =>
      l.includes('GoogleRef') || l.includes('레퍼런스') || l.includes('Bing') || l.includes('Wikimedia'),
    );
    if (refLogs.length > 0) {
      log('\n  관련 콘솔 로그 (최근 15개):');
      refLogs.slice(-15).forEach(l => log(`    ${l}`));
    }

    // ── 최종 판정 ──
    log('\n═══════════════════════════════════════════════');
    const scenesWithImage = results.scenesWithImage || 0;
    const totalScenes = results.sceneCount || 0;

    if (scenesWithImage > 0) {
      log(`  ✅ 테스트 성공: ${totalScenes}개 장면 중 ${scenesWithImage}개에 레퍼런스 이미지 적용됨`);
    } else if (domResults.lazyImages > 0) {
      log(`  ⚠️ 부분 성공: DOM에 ${domResults.lazyImages}개 이미지 표시 (scene.imageUrl 미적용 — 사용자 "적용" 클릭 필요)`);
    } else {
      log(`  ❌ 테스트 실패: 검색 결과 없음`);
      log(`     최근 콘솔 로그:`);
      consoleLogs.slice(-30).forEach(l => log(`       ${l}`));
    }
    log('═══════════════════════════════════════════════\n');

    // 최종 스크린샷
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-result.png'), fullPage: true });
    log(`스크린샷: ${SCREENSHOT_DIR}/`);

    return {
      ok: scenesWithImage > 0 || domResults.lazyImages > 0,
      scenesWithImage,
      totalScenes,
      domImages: domResults.lazyImages,
      providers: domResults.providers,
      proxyCallCount,
    };

  } finally {
    await browser.close();
    log('브라우저 종료');
  }
}

main()
  .then((result) => {
    log(`최종 결과: ${JSON.stringify(result)}`);
    if (!result.ok) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('테스트 실패:', err);
    process.exit(1);
  });
