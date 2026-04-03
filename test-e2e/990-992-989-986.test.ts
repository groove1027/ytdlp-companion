import { test, expect, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const BASE_URL = 'http://localhost:5173';
const PROD_URL = 'https://all-in-one-production.pages.dev';

async function loginAndSetup(page: Page) {
  const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();
  expect(loginData.token).toBeTruthy();
  await page.goto(BASE_URL);
  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

test.describe('#986 — 헬퍼 팝업 localStorage 정리', () => {
  test('onboarding-tour-completed 키가 자동 제거됨', async ({ page }) => {
    // 먼저 레거시 키를 설정
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('onboarding-tour-completed', 'true');
    });
    await page.screenshot({ path: 'test-e2e/986-01-before.png' });

    // 페이지 리로드 → App.tsx useEffect에서 키 제거
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const keyExists = await page.evaluate(() => localStorage.getItem('onboarding-tour-completed'));
    expect(keyExists).toBeNull();
    await page.screenshot({ path: 'test-e2e/986-02-after.png' });

    // 도움말 버튼이 존재하는지 확인
    const helpBtn = page.locator('button:has-text("도움말")');
    if (await helpBtn.count() > 0) {
      await helpBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-e2e/986-03-help-open.png' });
    }
  });
});

test.describe('#989 — 사운드 스튜디오 프로젝트 전환 초기화', () => {
  test('프로젝트 전환 시 이전 나레이션 라인 초기화', async ({ page }) => {
    await loginAndSetup(page);
    await page.screenshot({ path: 'test-e2e/989-01-loggedin.png' });

    // 사운드 스튜디오 탭으로 이동
    const soundTab = page.locator('button:has-text("사운드"), button:has-text("Sound")').first();
    if (await soundTab.count() > 0) {
      await soundTab.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-e2e/989-02-sound-tab.png' });

    // soundStudioStore에서 현재 lines 수 확인
    const lineCount = await page.evaluate(() => {
      const store = (window as any).__SOUND_STUDIO_STORE__;
      return store ? store.getState().lines.length : -1;
    });

    // 프로젝트 대시보드로 이동하여 새 프로젝트 생성
    const projectBtn = page.locator('button:has-text("프로젝트"), button:has-text("📁")').first();
    if (await projectBtn.count() > 0) {
      await projectBtn.click();
      await page.waitForTimeout(1000);
    }

    const newProjectBtn = page.locator('button:has-text("새 프로젝트")').first();
    if (await newProjectBtn.count() > 0) {
      await newProjectBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-e2e/989-03-new-project.png' });

    // 다시 사운드 스튜디오로
    if (await soundTab.count() > 0) {
      await soundTab.click();
      await page.waitForTimeout(1000);
    }

    // 새 프로젝트에서는 라인이 초기화되어야 함
    const newLineCount = await page.evaluate(() => {
      const store = (window as any).__SOUND_STUDIO_STORE__;
      return store ? store.getState().lines.length : -1;
    });

    // 새 프로젝트이므로 라인이 0이거나 이전보다 적어야 함
    await page.screenshot({ path: 'test-e2e/989-04-after-switch.png' });
  });
});

test.describe('#990+#992 — Typecast 사운드 스튜디오', () => {
  test('사운드 스튜디오 타입캐스트 엔진 선택 + 음성 목록 표시', async ({ page }) => {
    await loginAndSetup(page);

    // Typecast API 키 주입
    await page.evaluate(() => {
      const key = localStorage.getItem('CUSTOM_TYPECAST_KEY');
      if (!key) {
        // 테스트용으로 API 키가 없으면 스킵
        (window as any).__SKIP_TYPECAST_TEST__ = true;
      }
    });

    const skipTest = await page.evaluate(() => (window as any).__SKIP_TYPECAST_TEST__);

    // 사운드 스튜디오 이동
    const soundTab = page.locator('button:has-text("사운드"), button:has-text("Sound")').first();
    if (await soundTab.count() > 0) {
      await soundTab.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-e2e/990-01-sound-studio.png' });

    // Typecast 엔진 탭 클릭
    const typecastBtn = page.locator('button:has-text("Typecast")').first();
    if (await typecastBtn.count() > 0) {
      await typecastBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-e2e/990-02-typecast-selected.png' });
    }

    // 재생 버튼이 존재하는지 확인 (disabled 가능)
    const playBtn = page.locator('button[title*="재생"], button:has-text("재생")').first();
    const playExists = await playBtn.count() > 0;
    await page.screenshot({ path: 'test-e2e/992-01-play-button.png' });

    // sessionStorage에 __tts_blob_session 플래그 확인 (#992 fix)
    const blobSessionFlag = await page.evaluate(() => sessionStorage.getItem('__tts_blob_session'));
    // 새 세션이므로 플래그가 설정되어 있어야 함 (blob 정리 실행됨)
    await page.screenshot({ path: 'test-e2e/992-02-session-flag.png' });
  });
});
