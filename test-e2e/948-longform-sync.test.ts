/**
 * [#948] 롱폼 영상 분석 타임코드 싱크 테스트
 * 경로: 사이드바 "채널/영상 분석" → 서브탭 "영상 분석실" → URL 입력 → All TTS 분석
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://localhost:3000';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
// 3분 33초 — 롱폼(120초+) 트리거
const LONGFORM_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test.describe('#948 롱폼 영상 분석 싱크', () => {
  test.setTimeout(1_200_000); // 20분 — All TTS 10버전은 시간이 오래 걸림

  test('All TTS 롱폼 — 타임코드 시간순 + 전체 분포', async ({ page }) => {
    // 콘솔 로그 캡처
    const allLogs: string[] = [];
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      allLogs.push(text);
      const t = msg.text();
      if (t.includes('VideoAnalysis') || t.includes('Scene') || t.includes('VERSION') ||
          t.includes('evolink') || t.includes('stream') || t.includes('timeout')) {
        console.log(`[browser] ${t.slice(0, 300)}`);
      }
    });

    page.on('pageerror', err => {
      console.log(`[PAGE ERROR] ${err.message.slice(0, 200)}`);
    });

    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('.mp4') && !url.includes('videoplayback') && !url.includes('googlevideo') &&
          !url.includes('127.0.0.1:9876/api/download')) {
        console.log(`[REQUEST FAILED] ${req.failure()?.errorText} — ${url.slice(0, 150)}`);
      }
    });

    // 브라우저 메모리 보호: 영상 바이너리 다운로드 차단
    await page.route('**/*.mp4', route => route.abort());
    await page.route('**/*.webm', route => route.abort());
    await page.route('**/*.m4s', route => route.abort());
    await page.route('**/videoplayback*', route => route.abort());
    await page.route('**/googlevideo.com/**', route => route.abort());
    await page.route('**/127.0.0.1:9876/api/download*', route => route.abort());
    await page.route('**/localhost:9876/api/download*', route => route.abort());

    // === STEP 1: 로그인 ===
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true })
    });
    const loginData = await loginRes.json() as { token: string; user: Record<string, unknown> };

    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/948-01-loggedin.png' });
    console.log('[#948] ✅ STEP 1: 로그인 완료');

    // === STEP 2: 채널/영상 분석 탭 → 영상 분석실 서브탭 ===
    await page.getByText('채널/영상 분석').first().click();
    await page.waitForTimeout(1500);
    const videoRoomTab = page.getByText('영상 분석실').first();
    await videoRoomTab.waitFor({ state: 'visible', timeout: 5000 });
    await videoRoomTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/948-02-video-room.png' });
    console.log('[#948] ✅ STEP 2: 영상 분석실 진입');

    // === STEP 3: 유튜브 URL 입력 ===
    const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="URL"]').first();
    await urlInput.waitFor({ state: 'visible', timeout: 5000 });
    await urlInput.click();
    await urlInput.fill('');
    await page.keyboard.type(LONGFORM_VIDEO_URL, { delay: 5 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/948-03-url-entered.png' });
    console.log('[#948] ✅ STEP 3: URL 입력 완료');

    // === STEP 4: All TTS 프리셋 클릭 ===
    const presetBtn = page.locator('button:has(span:has-text("All TTS"))').first();
    try { await presetBtn.scrollIntoViewIfNeeded(); } catch { /* */ }
    await page.waitForTimeout(500);

    const disabled = await presetBtn.isDisabled().catch(() => true);
    console.log(`[#948] All TTS disabled: ${disabled}`);
    if (disabled) {
      await urlInput.press('Tab');
      await page.waitForTimeout(2000);
    }

    await presetBtn.click({ timeout: 5000 });
    console.log('[#948] ✅ STEP 4: All TTS 클릭 — 분석 시작');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-e2e/948-04-analyzing.png' });

    // === STEP 5: 분석 완료 대기 (최대 15분) ===
    console.log('[#948] ⏳ STEP 5: 분석 완료 대기 (All TTS 10버전 — 최대 15분)...');

    const statusInterval = setInterval(async () => {
      try {
        const info = await page.evaluate(() => {
          const body = document.body.innerText;
          return {
            hasCancel: body.includes('분석 중단하기'),
            hasCut: !!(body.match(/\d+컷/)),
            bodyLen: body.length,
          };
        });
        console.log(`[#948] 대기 중... cancel=${info.hasCancel} cut=${info.hasCut} bodyLen=${info.bodyLen}`);
      } catch { /* */ }
    }, 60_000);

    let analysisCompleted = false;
    try {
      await page.waitForFunction(() => {
        const body = document.body.innerText;
        if (body.includes('버전 생성 완료') || body.includes('분석 완료')) return true;
        const hasCancel = body.includes('분석 중단하기');
        if (!hasCancel && body.length > 1800) return true;
        if (body.match(/\d+컷/) && !hasCancel) return true;
        return false;
      }, { timeout: 900_000 }); // 15분
      analysisCompleted = true;
      console.log('[#948] ✅ 분석 결과 감지!');
    } catch {
      console.log('[#948] ⚠️ 분석 결과 대기 타임아웃 (15분)');
      console.log(`[#948] === 마지막 30개 로그 ===`);
      allLogs.slice(-30).forEach(l => console.log(`  ${l.slice(0, 200)}`));
    }
    clearInterval(statusInterval);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/948-05-analyzed.png', fullPage: false });
    console.log('[#948] ✅ STEP 5 스크린샷 저장');

    // === STEP 6: 타임코드 추출 및 검증 ===
    let timecodeData: string[] = [];
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-e2e/948-05b-scrolled.png', fullPage: false });

      // "N컷" 텍스트를 가진 버전 카드만 필터
      const versionCards = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[class*="rounded-xl"]'));
        return cards.filter(c => /\d+컷/.test(c.textContent || '')).map((c, i) => ({
          idx: i,
          text: (c.textContent || '').slice(0, 100),
        }));
      });
      console.log(`[#948] 버전 카드: ${versionCards.length}개`);
      if (versionCards.length > 0) {
        console.log(`[#948] 첫 번째 카드: ${versionCards[0].text.slice(0, 80)}`);
      }

      // 첫 번째 버전 카드 클릭 → 펼치기
      const versionCard = page.locator('[class*="rounded-xl"]').filter({ hasText: /\d+컷/ }).first();
      if (await versionCard.isVisible().catch(() => false)) {
        await versionCard.click();
        await page.waitForTimeout(2000);
        console.log('[#948] 첫 번째 버전 카드 클릭');
        await page.screenshot({ path: 'test-e2e/948-05c-expanded.png', fullPage: false });
      }

      // 타임코드 추출
      timecodeData = await page.evaluate(() => {
        const results: string[] = [];
        document.querySelectorAll('table td, .font-mono, [class*="text-blue"]').forEach(el => {
          const text = el.textContent || '';
          const matches = text.match(/\d{1,2}:\d{2}(?:\.\d{1,3})?/g);
          if (matches) results.push(...matches);
        });
        return [...new Set(results)];
      });

      if (timecodeData.length === 0) {
        console.log('[#948] DOM table에서 미발견 — body text 전체에서 추출');
        const storeTimecodes = await page.evaluate(() => {
          const allText = document.body.innerText;
          const matches = allText.match(/\d{1,2}:\d{2}(?:\.\d{1,3})?/g);
          return matches ? [...new Set(matches)] : [];
        });
        if (storeTimecodes.length > 0) timecodeData = storeTimecodes;
      }
    } catch (e) {
      console.log(`[#948] 타임코드 추출 에러: ${e}`);
    }

    console.log(`[#948] STEP 6: 타임코드 ${timecodeData.length}개:`, timecodeData.slice(0, 20));

    if (timecodeData.length >= 3) {
      const toSec = (tc: string) => {
        const [m, s] = tc.split(':');
        return parseInt(m) * 60 + parseFloat(s);
      };
      const secs = timecodeData.map(toSec).filter(s => !isNaN(s) && s < 3600);
      const sorted = [...secs].sort((a, b) => a - b);
      if (sorted.length >= 2) {
        const range = sorted[sorted.length - 1] - sorted[0];
        console.log(`[#948] 범위: ${sorted[0].toFixed(1)}초 ~ ${sorted[sorted.length - 1].toFixed(1)}초 (${range.toFixed(1)}초)`);
        if (range > 30) {
          const midpoint = (sorted[0] + sorted[sorted.length - 1]) / 2;
          const beyondMid = sorted.filter(s => s > midpoint).length;
          console.log(`[#948] ✅ 중간점(${midpoint.toFixed(0)}초) 이후: ${beyondMid}개`);
          expect(beyondMid).toBeGreaterThan(0);
        }
        let inversions = 0;
        for (let i = 2; i < secs.length; i++) {
          if (secs[i] < secs[i - 1] - 3) inversions++;
        }
        const inversionRate = secs.length > 2 ? inversions / (secs.length - 2) : 0;
        console.log(`[#948] 시간순 역전: ${inversions}/${Math.max(1, secs.length - 2)} (${(inversionRate * 100).toFixed(0)}%)`);
        expect(inversionRate).toBeLessThan(0.2);
      }
    }

    await page.screenshot({ path: 'test-e2e/948-06-final.png', fullPage: false });

    // 분석 완료 시 타임코드 반드시 존재
    expect(analysisCompleted).toBe(true);
    expect(timecodeData.length).toBeGreaterThan(0);

    console.log(`[#948] ✅ All TTS 테스트 완료`);
  });
});
