import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('Voice Clone 기능', () => {
  test('사운드 탭에서 Voice Clone 패널이 표시되고 커스텀 음성이 보임', async ({ page }) => {
    // 1) 로그인
    const loginRes = await fetch(`${AUTH_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };
    expect(loginData.token).toBeTruthy();

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 2) 프로젝트 선택
    const projBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("프로젝트")').first();
    if (await projBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projBtn.click();
      await page.waitForTimeout(2000);
    }

    // 3) 사운드 탭
    const soundTab = page.locator('button:has-text("사운드"), button:has-text("3사운드")').first();
    if (await soundTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await soundTab.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/clone-01-sound-tab.png', fullPage: true });

    // 4) Qwen3 TTS 선택
    const qwen3Btn = page.locator('button:has-text("Qwen3"), button:has-text("qwen3")').first();
    await qwen3Btn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-e2e/clone-02-qwen3-selected.png', fullPage: true });

    // 5) Voice Clone 패널 확인
    const clonePanel = page.locator('text=내 목소리로 TTS');
    const hasClonePanel = await clonePanel.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[Test] Voice Clone 패널: ${hasClonePanel}`);
    expect(hasClonePanel).toBeTruthy();

    // 6) Voice Clone 패널 펼치기
    await clonePanel.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-e2e/clone-03-panel-open.png', fullPage: true });

    // 7) 녹음/업로드 버튼 확인
    const recordBtn = page.locator('button:has-text("녹음 시작")');
    const hasRecordBtn = await recordBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] 녹음 시작 버튼: ${hasRecordBtn}`);
    expect(hasRecordBtn).toBeTruthy();

    const uploadLabel = page.locator('text=파일 선택');
    const hasUpload = await uploadLabel.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] 파일 선택: ${hasUpload}`);
    expect(hasUpload).toBeTruthy();

    // 8) 이전에 저장한 커스텀 음성이 보이는지 확인
    const customVoice = page.locator('text=테스트 음성');
    const hasCustomVoice = await customVoice.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] 커스텀 음성 "테스트 음성": ${hasCustomVoice}`);
    expect(hasCustomVoice).toBeTruthy();

    // 9) 컴패니언 API로 커스텀 음성 목록 확인 (브라우저 내)
    const apiResult = await page.evaluate(async () => {
      const res = await fetch('http://localhost:9876/api/tts/voices/custom');
      return res.json();
    });
    console.log(`[Test] 커스텀 음성 API:`, JSON.stringify(apiResult));
    expect(apiResult.voices.length).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-e2e/clone-04-final.png', fullPage: true });
  });
});
