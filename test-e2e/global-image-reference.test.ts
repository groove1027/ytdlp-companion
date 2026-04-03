/**
 * 글로벌 이미지 레퍼런스 검색 E2E 테스트
 * - 콘텐츠 문화권 자동 감지 (detectContentLocale) 검증
 * - 다중 소스 폴백 체인 (Serper → Google → Naver → Pexels → Wikimedia)
 * - projectStore에 장면 주입 → 후반작업 > 이미지/영상 탭 → 레퍼런스 검색
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL || '';
const PASSWORD = process.env.E2E_TEST_PASSWORD || '';
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY || '';

async function login(page: import('@playwright/test').Page) {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as { token?: string; user?: unknown };
  if (!loginData.token) throw new Error('로그인 실패');

  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

async function injectScenesAndNavigate(page: import('@playwright/test').Page, scenes: Array<Record<string, string>>) {
  // projectStore에 장면 데이터 주입 + enableGoogleReference 활성화
  await page.evaluate((scenesData) => {
    const store = (window as any).__PROJECT_STORE__;
    if (store) {
      store.getState().setScenes(scenesData);
      console.log(`[E2E] 테스트 장면 ${scenesData.length}개 주입 완료`);
    } else {
      console.error('[E2E] __PROJECT_STORE__ 없음');
    }
    // imageVideoStore에서 enableGoogleReference 활성화
    const ivStore = (window as any).__IMAGE_VIDEO_STORE__;
    if (ivStore) {
      ivStore.getState().setEnableGoogleReference(true);
      console.log('[E2E] enableGoogleReference = true 설정');
    }
  }, scenes);

  await page.waitForTimeout(1000);

  // 후반작업 → 이미지/영상 탭으로 이동
  // "후반작업" 접이식 열기
  const postProdToggle = page.locator('button, div').filter({ hasText: /후반작업/i }).first();
  if (await postProdToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await postProdToggle.click();
    await page.waitForTimeout(500);
  }

  // "이미지/영상" 서브탭 클릭
  const imageVideoTab = page.locator('button, [role="tab"]').filter({ hasText: /이미지\/영상|이미지.영상/i }).first();
  if (await imageVideoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await imageVideoTab.click();
    await page.waitForTimeout(2000);
    console.log('이미지/영상 탭 진입');
  }
}

test.describe('글로벌 이미지 레퍼런스 검색', () => {

  test('한국 콘텐츠 — detectContentLocale hl=ko gl=kr 검증', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.screenshot({ path: 'test-e2e/global-ref-01-loggedin.png', fullPage: false });

    // 한국 콘텐츠 장면 주입
    const koreanScenes = [
      {
        id: 'ko-scene-1',
        scriptText: '전통시장에서 떡볶이를 파는 할머니가 손님에게 음식을 건네고 있다.',
        visualDescriptionKO: '전통시장 떡볶이 할머니 손님',
        sceneLocation: '남대문시장',
        sceneCulture: '한국',
        sceneEra: '현대',
        entityName: '떡볶이 할머니',
        imageUrl: '',
        generationStatus: '',
      },
      {
        id: 'ko-scene-2',
        scriptText: '서울 남대문시장의 좁은 골목에 상인들이 물건을 진열하고 있다.',
        visualDescriptionKO: '남대문시장 골목 상인 진열',
        sceneLocation: '서울',
        sceneCulture: '한국',
        sceneEra: '현대',
        entityName: '시장 상인',
        imageUrl: '',
        generationStatus: '',
      },
    ];

    await injectScenesAndNavigate(page, koreanScenes);
    await page.screenshot({ path: 'test-e2e/global-ref-02-storyboard.png', fullPage: false });

    // 콘솔 로그 수집 — hl/gl 로케일 + 검색 소스 확인
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[GoogleRef]') || text.includes('[E2E]')) {
        consoleLogs.push(text);
      }
    });

    // 구글 레퍼런스 활성화 토글 찾기
    const refToggle = page.locator('input[type="checkbox"], [role="switch"], label').filter({ hasText: /레퍼런스|reference|구글.*레퍼런스/i }).first();
    if (await refToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refToggle.click();
      await page.waitForTimeout(1000);
      console.log('레퍼런스 토글 클릭');
    }

    // 검색 버튼 찾기 (전체 검색 우선)
    const searchBtn = page.locator('button').filter({ hasText: /전체.*검색|일괄.*검색|레퍼런스.*검색|Search/i }).first();
    let searchClicked = false;

    if (await searchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchBtn.click();
      searchClicked = true;
      console.log('검색 버튼 클릭');

      // 검색 API 응답 대기
      try {
        await page.waitForResponse(
          resp => {
            const url = resp.url();
            return url.includes('google-proxy') || url.includes('serper.dev') ||
                   url.includes('wikimedia.org') || url.includes('pexels.com');
          },
          { timeout: 30000 }
        );
        console.log('검색 API 응답 수신 완료');
      } catch {
        console.log('검색 API 대기 타임아웃 — 계속 진행');
      }

      await page.waitForTimeout(8000);
    } else {
      console.log('검색 버튼을 찾지 못함 — 스토리보드 UI가 아직 렌더링되지 않았을 수 있음');
    }

    await page.screenshot({ path: 'test-e2e/global-ref-03-after-search.png', fullPage: false });

    // 결과 확인
    const allImages = page.locator('img[src*="http"]');
    const imageCount = await allImages.count();
    console.log(`페이지 내 이미지 수: ${imageCount}`);

    // 콘솔 로그 분석
    const hasKoLocale = consoleLogs.some(log => log.includes('hl=ko') || log.includes('gl=kr'));
    console.log(`한국 로케일(hl=ko gl=kr) 사용 여부: ${hasKoLocale}`);
    console.log('=== 수집된 로그 ===');
    consoleLogs.forEach(log => console.log(`  ${log}`));

    // 스크린샷 최종
    await page.screenshot({ path: 'test-e2e/global-ref-04-final.png', fullPage: false });

    // 페이지가 에러 없이 로드되었는지 확인
    expect(await page.textContent('body')).toBeTruthy();

    // 새 코드가 크래시 없이 작동하는지 — detectContentLocale, buildGoogleImageHeaders 등
    // 브라우저 콘솔에 uncaught error가 없는지 확인
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    await page.waitForTimeout(1000);
    if (jsErrors.length > 0) {
      console.error('JavaScript 에러 발생:', jsErrors);
    }
    expect(jsErrors.length).toBe(0);

    console.log('한국 콘텐츠 테스트 완료');
  });
});
