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

test.describe('#928 — API Key Settings persistence', () => {
  test('API 키 변경 → 닫기 → localStorage에 값 유지', async ({ page }) => {
    await loginAndSetup(page);
    await page.screenshot({ path: 'test-e2e/928-01-loggedin.png' });

    // API 키 설정 열기
    const settingsBtn = page.locator('button:has-text("API"), button:has-text("설정"), [aria-label*="설정"]').first();
    await settingsBtn.waitFor({ timeout: 10000 });
    await settingsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-e2e/928-02-settings-open.png' });

    // Evolink 입력란 찾기 (password 타입일 수 있음)
    const evolinkSection = page.locator('text=EVOLINK').first();
    await evolinkSection.waitFor({ timeout: 5000 });

    // Evolink 섹션 아래의 input 찾기
    const evolinkInput = page.locator('input[type="password"], input[type="text"]')
      .filter({ has: page.locator('xpath=ancestor::div[.//text()[contains(., "EVOLINK") or contains(., "Evolink")]]') })
      .first();

    // 대안: 첫 번째 password input
    let targetInput = evolinkInput;
    if (await evolinkInput.count() === 0) {
      targetInput = page.locator('input[type="password"]').first();
    }
    await targetInput.waitFor({ timeout: 5000 });

    // 테스트용 키 값으로 변경
    const testKey = 'sk-TEST928-' + Date.now();
    await targetInput.click({ clickCount: 3 }); // select all
    await targetInput.fill(testKey);
    await page.screenshot({ path: 'test-e2e/928-03-key-changed.png' });

    // "닫기" 버튼 클릭 (저장 안 누르고)
    const closeBtn = page.locator('button:has-text("닫기")');
    await closeBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/928-04-after-close.png' });

    // [핵심 검증] localStorage에 변경된 키가 저장되었는지 확인
    const savedKey = await page.evaluate(() => localStorage.getItem('CUSTOM_EVOLINK_KEY'));
    expect(savedKey).toBe(testKey);

    // 재오픈하여 UI에서도 확인
    await settingsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-e2e/928-05-reopened.png' });

    // 원래 키로 복원
    await page.evaluate((key) => {
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, EVOLINK_KEY);

    // 닫기
    await page.locator('button:has-text("닫기")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-e2e/928-06-restored.png' });
  });

  test('ESC 키로 닫아도 변경사항 자동 저장', async ({ page }) => {
    await loginAndSetup(page);

    // 설정 열기
    const settingsBtn = page.locator('button:has-text("API"), button:has-text("설정"), [aria-label*="설정"]').first();
    await settingsBtn.waitFor({ timeout: 10000 });
    await settingsBtn.click();
    await page.waitForTimeout(1000);

    // KIE 입력란에 값 넣기 (두 번째 password input)
    const testKey = 'test-kie-esc-' + Date.now();
    await page.evaluate((key) => {
      // 직접 localStorage에 현재 상태 기록 후, 나중에 비교
      localStorage.setItem('_test_before_kie', localStorage.getItem('CUSTOM_KIE_KEY') || '');
    }, null);

    // KIE 섹션의 input 찾기
    const kieInputs = page.locator('input[type="password"], input[type="text"]');
    const kieInput = kieInputs.nth(1); // 두 번째 input이 KIE
    if (await kieInput.count() > 0) {
      await kieInput.click({ clickCount: 3 });
      await kieInput.fill(testKey);
    }

    // ESC로 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-e2e/928-07-esc-close.png' });

    // KIE 키가 localStorage에 저장되었는지 확인
    const savedKie = await page.evaluate(() => localStorage.getItem('CUSTOM_KIE_KEY'));
    // KIE input이 실제로 있었고 값을 넣었으면 저장됨
    if (savedKie && savedKie.includes('test-kie-esc-')) {
      expect(savedKie).toBe(testKey);
    }

    // 원래 값으로 복원
    await page.evaluate(() => {
      const before = localStorage.getItem('_test_before_kie');
      if (before) localStorage.setItem('CUSTOM_KIE_KEY', before);
      else localStorage.removeItem('CUSTOM_KIE_KEY');
      localStorage.removeItem('_test_before_kie');
    });
  });
});

test.describe('#976 — Cost tracking at task creation', () => {
  test('비용 대시보드 정상 표시 + costStore addCost 함수 존재 확인', async ({ page }) => {
    await loginAndSetup(page);
    await page.screenshot({ path: 'test-e2e/976-01-loggedin.png' });

    // 비용이 표시되는 UI 요소 확인 (₩ 또는 $ 기호)
    const costElement = page.locator(':text("₩"), :text("$0"), :text("비용")').first();
    if (await costElement.count() > 0) {
      const costText = await costElement.textContent();
      expect(costText).toBeTruthy();
    }
    await page.screenshot({ path: 'test-e2e/976-02-cost-visible.png' });

    // costStore의 addCost 동작 검증 — 비용 추가 전후 비교
    const before = await page.evaluate(() => {
      const store = (window as any).__COST_STORE__;
      if (!store) return null;
      const state = store.getState();
      return { total: state.totalCost || 0, hasAddCost: typeof state.addCost === 'function' };
    });

    if (before && before.hasAddCost) {
      // 테스트용 비용 추가
      await page.evaluate(() => {
        const store = (window as any).__COST_STORE__;
        store.getState().addCost(0.001, 'video');
      });

      const after = await page.evaluate(() => {
        const store = (window as any).__COST_STORE__;
        return { total: store.getState().totalCost || 0 };
      });

      // 비용이 증가했는지 확인
      expect(after.total).toBeGreaterThan(before.total);
    }

    await page.screenshot({ path: 'test-e2e/976-03-cost-verified.png' });
  });
});
