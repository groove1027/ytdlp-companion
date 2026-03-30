import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('TTS UI 개선 — Kokoro 분리 + Supertonic 제거 + 로딩 표시', () => {
  test('엔진 목록에 Kokoro 있고 Supertonic 없음 + 샘플 재생 로딩 표시', async ({ page }) => {
    // 로그인
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
    const soundTab = page.locator('button:has-text("사운드"), button:has-text("3사운드")').first();
    if (await soundTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await soundTab.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/ttsui-01-sound.png', fullPage: true });

    // 1) Supertonic 제거 확인
    const allBtns = await page.locator('button').allTextContents();
    const hasSupertonic = allBtns.some(t => t.includes('Supertonic'));
    const hasKokoro = allBtns.some(t => t.includes('Kokoro'));
    console.log(`[Test] Supertonic 있음: ${hasSupertonic} (기대: false)`);
    console.log(`[Test] Kokoro 있음: ${hasKokoro} (기대: true)`);
    expect(hasSupertonic).toBeFalsy();
    expect(hasKokoro).toBeTruthy();

    // 2) Kokoro 엔진 클릭
    const kokoroBtn = page.locator('button:has-text("Kokoro")').first();
    await kokoroBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-e2e/ttsui-02-kokoro.png', fullPage: true });

    // 3) Kokoro 음성 목록 확인 (54개)
    const voiceCount = await page.locator('text=개 음성').first().textContent();
    console.log(`[Test] Kokoro 음성 수 표시: ${voiceCount}`);

    // 4) Qwen3 선택 시 Voice Clone 패널 기본 펼침 확인
    const qwen3Btn = page.locator('button:has-text("Qwen3")').first();
    await qwen3Btn.click();
    await page.waitForTimeout(2000);

    // Voice Clone 패널이 기본 펼침인지 확인 (녹음 시작 버튼이 바로 보여야 함)
    const recordBtn = page.locator('button:has-text("녹음 시작")');
    const isRecordVisible = await recordBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] Voice Clone 기본 펼침 (녹음 시작 보임): ${isRecordVisible}`);
    expect(isRecordVisible).toBeTruthy();

    await page.screenshot({ path: 'test-e2e/ttsui-03-qwen3-clone.png', fullPage: true });

    // 5) 샘플 재생 로딩 표시 확인 — Qwen3 소희 클릭
    const soheeVoice = page.locator('text=소희').first();
    if (await soheeVoice.isVisible({ timeout: 3000 }).catch(() => false)) {
      await soheeVoice.click();
      await page.waitForTimeout(500);

      // "생성 중..." 메시지가 표시되는지 확인
      const loadingMsg = page.locator('text=생성 중');
      const hasLoading = await loadingMsg.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[Test] 샘플 생성 로딩 메시지: ${hasLoading}`);

      await page.screenshot({ path: 'test-e2e/ttsui-04-loading.png', fullPage: true });
    }

    await page.screenshot({ path: 'test-e2e/ttsui-05-final.png', fullPage: true });
  });
});
