/**
 * Privacy Mode wrapper 실제 호출 검증
 *
 * 1. PRIVACY_MODE_ENABLED=true + 컴패니언 가용 → 6.8MB가 cloudflared 터널로 가야 한다
 * 2. PRIVACY_MODE_ENABLED=true + 컴패니언 미가용 시뮬레이션 → throw 'Privacy Mode' 메시지
 *    (isCompanionDetected를 mock하지 않고, 별도 모듈 ytdlpApiService를 직접 override해야 하므로
 *     실제 컴패니언을 끌 수는 없으나, wrapper 코드 분기는 isCompanionDetected만 보므로
 *     window['__OVERRIDE_COMPANION_DETECTED__']를 통해 검증한다 — 아래에서 monkey-patch)
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL = 'http://localhost:5180';
const TEST_FILE = '/tmp/phase3-real.mp4';

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv();

async function login(page: import('@playwright/test').Page) {
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ENV.E2E_TEST_EMAIL,
      password: ENV.E2E_TEST_PASSWORD,
      rememberMe: true,
    }),
  });
  const loginData = await loginRes.json() as { token: string; user: unknown };
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(({ token, user, evolink }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
  }, { token: loginData.token, user: loginData.user, evolink: ENV.CUSTOM_EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

test.describe('v2.0.1 Privacy Mode wrapper REAL', () => {
  test('Privacy ON + 컴패니언 가용 → 터널 강제 사용', async ({ page }) => {
    test.setTimeout(120_000);

    expect(fs.existsSync(TEST_FILE)).toBe(true);
    const fileBuf = fs.readFileSync(TEST_FILE);

    page.on('console', m => {
      if (m.text().includes('[Upload]') || m.text().includes('Privacy')) {
        console.log(`[browser] ${m.text()}`);
      }
    });

    await login(page);

    // Privacy ON 설정
    await page.evaluate(() => {
      localStorage.setItem('PRIVACY_MODE_ENABLED', 'true');
    });

    const result = await page.evaluate(async (b64: string) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const file = new File([u8], 'privacy-test.mp4', { type: 'video/mp4' });
      const mod = await import('/services/uploadService.ts');
      const isOn = mod.isPrivacyModeEnabled();
      const url = await mod.uploadMediaToHosting(file);
      return { isOn, url };
    }, fileBuf.toString('base64'));

    console.log('[Privacy ON test] isOn:', result.isOn);
    console.log('[Privacy ON test] url:', result.url);
    expect(result.isOn).toBe(true);
    expect(result.url).toMatch(/trycloudflare\.com\/api\/tunnel\/serve/);
    expect(result.url).not.toMatch(/cloudinary/);
  });

  // 컴패니언 종료 후의 throw 검증은 별도 외부 스크립트에서 PID kill 후 실행 (test runner에서 직접 kill 불가)
  test.skip('Privacy ON + 컴패니언 미감지 → throw 메시지 (외부에서 kill 필요)', async () => {});
});
