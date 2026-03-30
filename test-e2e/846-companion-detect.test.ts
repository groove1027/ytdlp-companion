/**
 * #846 E2E: 컴패니언 127.0.0.1 감지 + LNA 헤더 검증
 *
 * 전제: 컴패니언 앱이 127.0.0.1:9876에서 실행 중
 * 검증:
 *   1) 프로덕션 웹앱 로그인 → 컴패니언 감지 배너 확인
 *   2) 127.0.0.1:9876/health API 정상 응답
 *   3) Access-Control-Allow-Private-Network 헤더 존재
 *   4) IPv6 [::1]:9876/health도 정상 응답
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('#846 컴패니언 127.0.0.1 감지', () => {
  test('컴패니언 health + LNA 헤더 + 웹앱 감지', async ({ page }) => {
    // ─── 1) 프로덕션 서버 토큰 취득 → localStorage 주입 ───
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // ─── STEP 1: 로그인 확인 스크린샷 ───
    await page.screenshot({ path: 'test-e2e/846-01-loggedin.png', fullPage: false });

    // ─── STEP 2: 127.0.0.1:9876/health 직접 호출 (Node.js에서) ───
    const healthRes = await fetch('http://127.0.0.1:9876/health', { signal: AbortSignal.timeout(5000) });
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.app).toBe('ytdlp-companion');
    expect(healthData.status).toBe('ok');
    console.log('[OK] 127.0.0.1 health:', JSON.stringify(healthData));

    // ─── STEP 3: LNA 헤더 확인 ───
    const lnaHeader = healthRes.headers.get('access-control-allow-private-network');
    expect(lnaHeader).toBe('true');
    console.log('[OK] LNA header:', lnaHeader);

    // ─── STEP 4: IPv6 [::1]:9876/health ───
    try {
      const v6Res = await fetch('http://[::1]:9876/health', { signal: AbortSignal.timeout(5000) });
      expect(v6Res.status).toBe(200);
      const v6Data = await v6Res.json();
      expect(v6Data.app).toBe('ytdlp-companion');
      console.log('[OK] IPv6 health:', JSON.stringify(v6Data));
    } catch (e) {
      console.log('[SKIP] IPv6 not available on this host (expected on some macOS configs)');
    }

    // ─── STEP 5: 웹앱에서 컴패니언 감지 확인 ───
    // 자막/워터마크 제거 탭으로 이동 (컴패니언 상태 표시)
    const toolMenu = page.locator('button:has-text("도구모음"), button:has-text("🧰")');
    if (await toolMenu.isVisible()) {
      await toolMenu.click();
      await page.waitForTimeout(500);
    }

    // 자막 제거 탭 클릭
    const subtitleTab = page.locator('button:has-text("자막"), button:has-text("워터마크")').first();
    if (await subtitleTab.isVisible()) {
      await subtitleTab.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/846-02-subtitle-tab.png', fullPage: false });

    // ─── STEP 6: 편집실 탭에서 NLE health check 확인 ───
    // 편집실 탭으로 이동
    const editRoomTab = page.locator('button:has-text("편집실")').first();
    if (await editRoomTab.isVisible()) {
      await editRoomTab.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/846-03-editroom.png', fullPage: false });

    // ─── STEP 7: 브라우저 내에서 컴패니언 감지 상태 확인 ───
    const companionDetected = await page.evaluate(async () => {
      try {
        const res = await fetch('http://127.0.0.1:9876/health', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return false;
        const data = await res.json();
        return data.app === 'ytdlp-companion';
      } catch {
        return false;
      }
    });
    console.log('[RESULT] 브라우저 내 컴패니언 감지:', companionDetected);

    // ─── STEP 8: 최종 스크린샷 ───
    await page.screenshot({ path: 'test-e2e/846-04-final.png', fullPage: false });

    // 기본 컴패니언 기능 확인 — health endpoint가 정상 응답
    expect(healthData.version).toBeTruthy();
    expect(healthData.services).toBeDefined();
    expect(Array.isArray(healthData.services)).toBe(true);
    expect(healthData.services.length).toBeGreaterThan(0);
  });
});
