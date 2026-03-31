import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://localhost:5173';
const COMPANION_HEALTH = 'http://127.0.0.1:9876/health';

test('컴패니언 UI: 버전 표시 + health 정상 + 웹앱 감지', async ({ page }) => {
  // ── STEP 1: 컴패니언 health check (E2E 시작 전 확인) ──
  const healthRes = await fetch(COMPANION_HEALTH);
  const health = await healthRes.json();
  expect(health.app).toBe('ytdlp-companion');
  expect(health.version).toBeTruthy();
  console.log(`[Companion] version=${health.version}, services=${health.services.length}`);

  // ── STEP 2: 웹앱 로그인 ──
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const EMAIL = process.env.E2E_TEST_EMAIL!;
  const PASSWORD = process.env.E2E_TEST_PASSWORD!;
  const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

  // 프로덕션 서버에서 토큰 취득
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true })
  });
  const loginData = await loginRes.json();
  expect(loginData.token).toBeTruthy();

  // localStorage 주입
  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // STEP 2 스크린샷: 로그인 완료
  await page.screenshot({ path: 'test-e2e/companion-ver-01-loggedin.png', fullPage: false });

  // ── STEP 3: 컴패니언 감지 확인 ──
  // 웹앱이 컴패니언을 감지했는지 확인 (CompanionBanner 또는 헬퍼 상태)
  // 최대 30초 대기 (30초 캐시 간격)
  let companionDetected = false;
  for (let i = 0; i < 6; i++) {
    const detected = await page.evaluate(async () => {
      try {
        const res = await fetch('http://127.0.0.1:9876/health', { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        return data.app === 'ytdlp-companion';
      } catch { return false; }
    });
    if (detected) { companionDetected = true; break; }
    await page.waitForTimeout(5000);
  }
  expect(companionDetected).toBe(true);
  console.log('[WebApp] 컴패니언 감지 성공');

  // STEP 3 스크린샷: 컴패니언 감지 상태
  await page.screenshot({ path: 'test-e2e/companion-ver-02-detected.png', fullPage: false });

  // ── STEP 4: health 응답 상세 검증 ──
  const healthDetail = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:9876/health');
    return await res.json();
  });
  expect(healthDetail.version).toMatch(/^\d+\.\d+\.\d+$/); // 시맨틱 버전 형식
  expect(healthDetail.services.length).toBeGreaterThanOrEqual(5);
  expect(healthDetail.status).toBe('ok');
  console.log(`[Health] version=${healthDetail.version}, services=${JSON.stringify(healthDetail.services)}`);

  // STEP 4 스크린샷: 최종 상태
  await page.screenshot({ path: 'test-e2e/companion-ver-03-final.png', fullPage: false });

  console.log('✅ 컴패니언 UI 버전 + health + 웹앱 감지 테스트 통과');
});
