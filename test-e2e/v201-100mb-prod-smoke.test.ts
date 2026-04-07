/**
 * GATE 3 prod smoke — 100MB 한도 안내가 production에서 visible
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL = 'https://all-in-one-production.pages.dev';
const MAIN_E2E = process.env.MAIN_E2E_DIR
  || '/Users/mac_mini/Downloads/all-in-one-production-build4/test-e2e';

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv();

test('Phase 4-2 prod — 100MB hint visible in DragDropAIWidget', async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(MAIN_E2E, { recursive: true });

  const r = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ENV.E2E_TEST_EMAIL,
      password: ENV.E2E_TEST_PASSWORD,
      rememberMe: true,
    }),
  });
  const data = await r.json() as { token: string; user: unknown };

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(({ t, u, e }) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', e);
    localStorage.removeItem('PRIVACY_MODE_ENABLED');
  }, { t: data.token, u: data.user, e: ENV.CUSTOM_EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(MAIN_E2E, '100mb-prod-01-loggedin.png') });

  // FAB 클릭 + 파일 드롭 탭
  await page.mouse.click(1280 - 32 - 28, 720 - 32 - 28).catch(() => {});
  await page.waitForTimeout(1000);
  const dropTab = page.locator('button').filter({ hasText: /파일 드롭/ }).last();
  if (await dropTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dropTab.click({ force: true });
    await page.waitForTimeout(500);
  }

  // [data-video-size-hint] visible + 100MB 텍스트
  const hints = page.locator('[data-video-size-hint]');
  const cnt = await hints.count();
  console.log(`[100MB prod] hint count: ${cnt}`);
  expect(cnt).toBeGreaterThanOrEqual(1);

  const texts = await hints.allTextContents();
  console.log(`[100MB prod] texts:`, JSON.stringify(texts));
  for (const t of texts) {
    expect(t).toMatch(/100MB/);
  }

  await page.screenshot({ path: path.join(MAIN_E2E, '100mb-prod-02-hint.png') });

  for (const f of ['100mb-prod-01-loggedin.png', '100mb-prod-02-hint.png']) {
    const p = path.join(MAIN_E2E, f);
    const size = fs.statSync(p).size;
    console.log(`[100MB prod] ${f} = ${size}B`);
    expect(size).toBeGreaterThan(1000);
  }
});
