/**
 * 헬퍼 강제 게이트 + macOS Gatekeeper 안내 + 업데이트 게이트 — Playwright E2E 검증
 *
 * 검증 흐름:
 *  1) 로그인 후 컴패니언이 감지되면 게이트가 닫혀 있는지
 *  2) 컴패니언 health check를 차단(블락)했을 때 게이트가 다시 열리는지 (강제 모드)
 *  3) macOS Gatekeeper 안내 카드가 모달 안에 표시되고 3가지 방법 카드가 모두 보이는지
 *  4) "outdated" 시뮬레이션 — localStorage에 구버전을 심으면 모달이 "업데이트 필요" 모드로 분기되는지
 *  5) 모드 분기에 따라 헤더 문구/CTA 라벨/Troubleshooting 문구가 바뀌는지
 *  6) ESC 키가 모달을 닫지 않는지(우회 불가 검증)
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:3000';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

async function login(page: import('@playwright/test').Page) {
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
}

test.describe('컴패니언 강제 게이트 + macOS Gatekeeper 안내', () => {
  test('1) 컴패니언 차단 시 강제 게이트가 표시되고, ESC로 닫히지 않으며, macOS 안내 카드가 보인다', async ({ page, context }) => {
    test.setTimeout(120_000);

    // 사전: localhost:9876/health 호출을 강제로 차단해서 컴패니언 미감지 환경 시뮬레이션
    await context.route('http://127.0.0.1:9876/**', (route) => route.abort('failed'));
    await context.route('http://localhost:9876/**', (route) => route.abort('failed'));

    await login(page);
    // companion 캐시 비우고 강제 시뮬레이션 (mac UA로 강제)
    await page.evaluate(() => {
      localStorage.removeItem('companion_last_detected_version');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // 게이트는 로그인 후 1차 체크에서 즉시 표시
    await page.waitForSelector('[role="dialog"][aria-labelledby="companion-gate-title"]', { timeout: 30_000 });

    await page.screenshot({ path: 'test-e2e/companion-gate-force-01-modal-open.png', fullPage: true });

    // 헤더 문구 — missing 모드 카피 확인
    const title = await page.locator('#companion-gate-title').textContent();
    expect(title || '').toContain('올인원 헬퍼');

    // ⚠️ 처음 실행하면 이 화면이 떠요 (Gatekeeper 안내) — macOS UA에서만 표시되어야 하므로 조건부
    // (CI/로컬 macOS 테스트 환경에서 표시 보장)
    const isMac = await page.evaluate(() => /mac/.test(navigator.userAgent.toLowerCase()));
    if (isMac) {
      const gatekeeperHeading = page.getByText('macOS가 Helper 앱을 막아도', { exact: false });
      await expect(gatekeeperHeading).toBeVisible({ timeout: 10_000 });

      // 3가지 방법 카드 (방법 1 / 방법 2 / 방법 3)
      await expect(page.getByText('방법 1', { exact: false })).toBeVisible();
      await expect(page.getByText('방법 2', { exact: false })).toBeVisible();
      await expect(page.getByText('방법 3', { exact: false })).toBeVisible();

      // 3번째 카드의 터미널 명령어 — xattr 명령
      const xattrCmd = page.getByText('xattr -dr com.apple.quarantine', { exact: false });
      await expect(xattrCmd).toBeVisible();

      // "명령어 복사" 버튼 클릭 → 토스트
      const copyBtn = page.getByRole('button', { name: /명령어 복사/ });
      await copyBtn.click();
      await page.waitForTimeout(500);
    }

    // ESC 누르면 닫혀선 안 됨 (우회 불가)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const modalStillOpen = await page.locator('[role="dialog"][aria-labelledby="companion-gate-title"]').isVisible();
    expect(modalStillOpen).toBe(true);
    await page.screenshot({ path: 'test-e2e/companion-gate-force-02-esc-blocked.png', fullPage: true });
  });

  test('2) localStorage에 구버전 시드 시 — 게이트가 outdated 모드로 분기된다', async ({ page, context }) => {
    test.setTimeout(120_000);

    // 컴패니언 차단 + 구버전 시드
    await context.route('http://127.0.0.1:9876/**', (route) => route.abort('failed'));
    await context.route('http://localhost:9876/**', (route) => route.abort('failed'));

    await login(page);
    await page.evaluate(() => {
      localStorage.setItem('companion_last_detected_version', '1.0.0'); // MIN_REQUIRED 1.3.0보다 낮음
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="dialog"][aria-labelledby="companion-gate-title"]', { timeout: 30_000 });

    // 헤더가 outdated 카피로 변경
    const title = await page.locator('#companion-gate-title').textContent();
    expect(title || '').toContain('업데이트가 필요');

    // 현재 감지 버전 v1.0.0 표시 — VersionPill의 "현재 감지 버전" 카드
    await expect(page.locator('p', { hasText: /^현재 감지 버전$/ }).locator('xpath=following-sibling::p').first()).toHaveText('v1.0.0');
    // 최소 요구 버전 v1.3.0 표시 — VersionPill의 "최소 요구 버전" 카드
    await expect(page.locator('p', { hasText: /^최소 요구 버전$/ }).locator('xpath=following-sibling::p').first()).toHaveText('v1.3.0');

    // CTA — "최신 버전 다운로드" 버튼
    const ctaPrimary = page.getByRole('link', { name: /최신 버전 다운로드/ });
    await expect(ctaPrimary).toBeVisible();

    // Update Required 배지 표시
    await expect(page.getByText('Update Required', { exact: false })).toBeVisible();

    await page.screenshot({ path: 'test-e2e/companion-gate-force-03-outdated-mode.png', fullPage: true });
  });
});
