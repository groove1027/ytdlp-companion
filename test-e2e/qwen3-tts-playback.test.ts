import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('Qwen3 TTS 재생 테스트', () => {
  test('사운드 탭에서 Qwen3 TTS 생성 + 재생 확인', async ({ page }) => {
    // 콘솔 로그 캡처
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('TTS') || text.includes('audio') || text.includes('Companion') || text.includes('Error') || text.includes('error')) {
        consoleLogs.push(`[${msg.type()}] ${text}`);
      }
    });

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

    await page.screenshot({ path: 'test-e2e/tts-01-loggedin.png', fullPage: true });

    // 2) 프로젝트 선택
    const projBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("프로젝트")').first();
    if (await projBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projBtn.click();
      await page.waitForTimeout(2000);
    }

    // 3) 사운드 탭 클릭
    const soundTab = page.locator('button:has-text("사운드"), button:has-text("3사운드"), [data-tab="sound"]').first();
    if (await soundTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await soundTab.click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'test-e2e/tts-02-sound-tab.png', fullPage: true });

    // 4) 음성 엔진 목록 확인
    const allBtns = await page.locator('button').allTextContents();
    const ttsRelated = allBtns.filter(t =>
      t.includes('Qwen') || t.includes('Kokoro') || t.includes('Typecast') ||
      t.includes('ElevenLabs') || t.includes('Supertonic') || t.includes('음성') ||
      t.includes('TTS') || t.includes('생성') || t.includes('재생')
    );
    console.log('[Debug] TTS 관련 버튼:', ttsRelated.join(' | '));

    // 5) Qwen3 엔진 선택 시도
    const qwen3Btn = page.locator('button:has-text("Qwen"), button:has-text("qwen3")').first();
    const hasQwen3 = await qwen3Btn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Test] Qwen3 버튼 발견: ${hasQwen3}`);

    if (hasQwen3) {
      await qwen3Btn.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/tts-03-engine-selected.png', fullPage: true });

    // 6) 음성 목록 확인
    // 음성 선택 영역의 모든 텍스트
    const voiceItems = await page.locator('[class*="voice"], [data-voice], button:has-text("Sohee"), button:has-text("Ryan"), button:has-text("소희")').allTextContents();
    console.log(`[Test] 음성 항목들: ${voiceItems.join(' | ')}`);

    // 7) 콘솔 로그 출력
    console.log('[Test] 콘솔 로그:');
    consoleLogs.forEach(l => console.log('  ', l));

    // 8) 컴패니언 TTS 직접 호출 테스트 (브라우저 내에서)
    const ttsResult = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:9876/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '안녕하세요 테스트입니다', language: 'ko', engine: 'qwen3', voice: 'Sohee' }),
        });
        if (!res.ok) return { error: `HTTP ${res.status}`, size: 0 };
        const blob = await res.blob();

        // 오디오 재생 테스트
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise<{ error: string | null; size: number; duration: number; canPlay: boolean }>(resolve => {
          audio.onloadedmetadata = () => {
            resolve({ error: null, size: blob.size, duration: audio.duration, canPlay: true });
          };
          audio.onerror = (e) => {
            resolve({ error: `Audio error: ${(e as any)?.message || 'unknown'}`, size: blob.size, duration: 0, canPlay: false });
          };
          setTimeout(() => resolve({ error: 'timeout', size: blob.size, duration: 0, canPlay: false }), 30000);
        });
      } catch (e) {
        return { error: (e as Error).message, size: 0, duration: 0, canPlay: false };
      }
    });
    console.log(`[Test] 브라우저 내 TTS 결과:`, JSON.stringify(ttsResult));

    await page.screenshot({ path: 'test-e2e/tts-04-result.png', fullPage: true });

    // TTS가 작동하는지 확인
    expect(ttsResult.size).toBeGreaterThan(100);
    expect(ttsResult.canPlay).toBeTruthy();

    await page.screenshot({ path: 'test-e2e/tts-05-final.png', fullPage: true });
  });
});
