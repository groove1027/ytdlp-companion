import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('Edge TTS 최종 검증', () => {
  test('Edge TTS 엔진 표시 + 한국어 샘플 재생 + Supertonic 복구', async ({ page }) => {
    const loginRes = await fetch(`${AUTH_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 프로젝트 선택
    const projBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("프로젝트")').first();
    if (await projBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projBtn.click();
      await page.waitForTimeout(2000);
    }

    // 사운드 탭
    await page.locator('button:has-text("사운드"), button:has-text("3사운드")').first().click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-e2e/edge-01-sound.png', fullPage: true });

    // 1) Qwen3/Kokoro 제거 + Edge/Supertonic 존재 확인
    const allBtns = await page.locator('button').allTextContents();
    const hasQwen3 = allBtns.some(t => t.includes('Qwen3'));
    const hasKokoro = allBtns.some(t => t.includes('Kokoro'));
    const hasEdge = allBtns.some(t => t.includes('Edge'));
    const hasSupertonic = allBtns.some(t => t.includes('Supertonic'));
    console.log(`[Test] Qwen3: ${hasQwen3}(기대:false) | Kokoro: ${hasKokoro}(기대:false) | Edge: ${hasEdge}(기대:true) | Supertonic: ${hasSupertonic}(기대:true)`);
    expect(hasQwen3).toBeFalsy();
    expect(hasKokoro).toBeFalsy();
    expect(hasEdge).toBeTruthy();
    expect(hasSupertonic).toBeTruthy();

    // 2) Edge TTS 선택
    await page.locator('button:has-text("Edge")').first().click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-e2e/edge-02-selected.png', fullPage: true });

    // 3) 한국어 음성 확인 (선희, 인준, 현수)
    const bodyText = await page.textContent('body') || '';
    const hasSunhi = bodyText.includes('선희');
    const hasInjoon = bodyText.includes('인준');
    const hasHyunsu = bodyText.includes('현수');
    console.log(`[Test] 선희: ${hasSunhi} | 인준: ${hasInjoon} | 현수: ${hasHyunsu}`);
    expect(hasSunhi).toBeTruthy();

    // 4) ▶ 미리듣기 버튼 클릭 → TTS API 호출
    const playBtns = page.locator('button[title*="미리듣기"]');
    const playCount = await playBtns.count();
    console.log(`[Test] 미리듣기 버튼 수: ${playCount}`);
    expect(playCount).toBeGreaterThan(0);

    const ttsPromise = page.waitForResponse(
      resp => resp.url().endsWith('/api/tts') && resp.request().method() === 'POST' && resp.status() === 200,
      { timeout: 30000 }
    );

    await playBtns.first().click();
    console.log('[Test] ▶ 클릭');

    await page.screenshot({ path: 'test-e2e/edge-03-clicked.png', fullPage: true });

    const ttsResp = await ttsPromise;
    const contentLength = parseInt(ttsResp.headers()['content-length'] || '0', 10);
    console.log(`[Test] TTS 응답: HTTP ${ttsResp.status()} | Size: ${contentLength} bytes`);

    expect(ttsResp.status()).toBe(200);
    expect(contentLength).toBeGreaterThan(1000);

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/edge-04-playing.png', fullPage: true });

    // 5) Voice Clone 패널 확인
    const clonePanel = page.locator('text=내 목소리로 TTS');
    const hasClone = await clonePanel.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] Voice Clone 패널: ${hasClone}`);
    expect(hasClone).toBeTruthy();

    await page.screenshot({ path: 'test-e2e/edge-05-final.png', fullPage: true });
    console.log('[Test] ✅ 전체 검증 완료');
  });
});
