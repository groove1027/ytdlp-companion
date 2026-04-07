/**
 * Privacy Mode + 컴패니언 종료 상태에서 throw 검증
 *
 * 사전 준비 (외부 스크립트에서):
 *   1. 워크트리 v2.0.1 binary가 실행 중이어야 했음 → 본 테스트 시작 직전에 종료
 *   2. 종료 후 충분한 시간 (health 캐시가 무효화될 시간) 대기
 *
 * 본 테스트는 단독 실행:
 *   PRIVACY_NO_COMPANION_TEST=1 npx playwright test test-e2e/v201-privacy-no-companion.test.ts
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL = 'http://localhost:5180';

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

test('Privacy ON + 컴패니언 health 차단 시뮬레이션 → throw', async ({ page }) => {
  test.setTimeout(120_000);

  // page.route로 모든 127.0.0.1:9876 요청 차단 (네트워크 레이어에서 막아 ES module 외부에서 우회)
  await page.route('http://127.0.0.1:9876/**', route => route.abort('failed'));

  page.on('console', m => {
    if (m.text().includes('[Upload]') || m.text().includes('Privacy') || m.type() === 'error') {
      console.log(`[browser] ${m.text()}`);
    }
  });

  // 로그인
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
    localStorage.setItem('PRIVACY_MODE_ENABLED', 'true');
  }, { token: loginData.token, user: loginData.user, evolink: ENV.CUSTOM_EVOLINK_KEY });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // recheck 강제 — fetch가 page.route로 차단되므로 false로 떨어져야 함
  const recheck = await page.evaluate(async () => {
    const ytdlp = await import('/services/ytdlpApiService.ts');
    const result = await ytdlp.recheckCompanion();
    return { result, detected: ytdlp.isCompanionDetected() };
  });
  console.log('[recheck]', JSON.stringify(recheck));
  expect(recheck.detected).toBe(false);

  // 작은 파일로 우회 분기 차단 (5MB threshold 무시 — Privacy ON이면 무조건 터널 강제)
  const small = Buffer.alloc(512 * 1024, 0);
  const result = await page.evaluate(async (b64: string) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], 'priv-no-companion.bin', { type: 'application/octet-stream' });
    const mod = await import('/services/uploadService.ts');
    try {
      const url = await mod.uploadMediaToHosting(file);
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, small.toString('base64'));

  console.log('[no-companion result]', JSON.stringify(result));
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/사적|Privacy|컴패니언|companion|v2/i);
});
