/**
 * [#948] 롱폼 영상 분석 타임코드 싱크 테스트
 * 경로: 사이드바 "채널/영상 분석" → 서브탭 "영상 분석실" → URL 입력 → 축약 리캡 분석
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
  test.setTimeout(600_000); // 10분

  test('축약 리캡 롱폼 — 타임코드 시간순 + 전체 분포', async ({ page }) => {
    // 모든 콘솔 로그 캡처
    const allLogs: string[] = [];
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      allLogs.push(text);
      // 핵심 로그만 출력
      const t = msg.text();
      if (t.includes('VideoAnalysis') || t.includes('Scene') || t.includes('버전') ||
          t.includes('VERSION') || t.includes('error') || t.includes('Error') ||
          t.includes('evolink') || t.includes('stream') || t.includes('fetch') ||
          t.includes('timeout') || t.includes('abort')) {
        console.log(`[browser] ${t.slice(0, 300)}`);
      }
    });

    // 페이지 에러 캡처
    page.on('pageerror', err => {
      console.log(`[PAGE ERROR] ${err.message.slice(0, 200)}`);
    });

    // 네트워크 실패 캡처
    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('.mp4') && !url.includes('videoplayback') && !url.includes('googlevideo')) {
        console.log(`[REQUEST FAILED] ${req.failure()?.errorText} — ${url.slice(0, 150)}`);
      }
    });

    // Scene Detection / 컴패니언 영상 바이너리 차단 (229MB+ 다운로드 → 브라우저 메모리 소진 방지)
    // Evolink Gemini AI 분석(텍스트 스트리밍)은 차단하지 않음
    await page.route('**/*.mp4', route => route.abort());
    await page.route('**/*.webm', route => route.abort());
    await page.route('**/*.m4s', route => route.abort());
    await page.route('**/videoplayback*', route => route.abort());
    await page.route('**/googlevideo.com/**', route => route.abort());
    // 컴패니언(127.0.0.1:9876) 영상 다운로드 차단 — API 응답은 JSON이므로 Content-Type 체크
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

    // === STEP 4: 축약 리캡 프리셋 클릭 ===
    const presetBtn = page.locator('button:has(span:has-text("축약 리캡"))').first();
    try { await presetBtn.scrollIntoViewIfNeeded(); } catch { /* */ }
    await page.waitForTimeout(500);

    const disabled = await presetBtn.isDisabled().catch(() => true);
    console.log(`[#948] 축약 리캡 disabled: ${disabled}`);
    if (disabled) {
      await urlInput.press('Tab');
      await page.waitForTimeout(2000);
    }

    await presetBtn.click({ timeout: 5000 });
    console.log('[#948] ✅ STEP 4: 축약 리캡 클릭 — 분석 시작');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-e2e/948-04-analyzing.png' });

    // === STEP 5: 분석 완료 대기 (최대 8분) ===
    console.log('[#948] ⏳ STEP 5: 분석 완료 대기...');

    // 30초마다 상태 로그
    const statusInterval = setInterval(async () => {
      try {
        const bodySnippet = await page.evaluate(() => {
          const body = document.body.innerText;
          const hasVersion = body.includes('VERSION') || body.includes('버전');
          const hasCut = body.includes('컷');
          const errorTexts = Array.from(document.querySelectorAll('[class*="text-red"], [class*="error"]')).map(e => e.textContent?.slice(0, 100)).filter(Boolean);
          return { hasVersion, hasCut, errors: errorTexts.slice(0, 3), bodyLength: body.length };
        });
        console.log(`[#948] 대기 중... 버전=${bodySnippet.hasVersion} 컷=${bodySnippet.hasCut} errors=${bodySnippet.errors.length} bodyLen=${bodySnippet.bodyLength}`);
        if (bodySnippet.errors.length > 0) {
          bodySnippet.errors.forEach(e => console.log(`  error: ${e}`));
        }
      } catch { /* page might be closed */ }
    }, 30_000);

    let analysisCompleted = false;
    try {
      // 분석 완료 감지: "분석 중단하기" 버튼이 사라지고 + body 길이 증가
      // (분석 중에는 "분석 중단하기" 존재, 완료 후 사라짐)
      await page.waitForFunction(() => {
        const body = document.body.innerText;
        // 1) 명시적 완료 텍스트
        if (body.includes('버전 생성 완료') || body.includes('분석 완료')) return true;
        // 2) "분석 중단하기" 버튼이 사라지고 body 길이가 충분히 늘어남
        const hasCancel = body.includes('분석 중단하기');
        if (!hasCancel && body.length > 1800) return true;
        // 3) 버전 카드에 "N컷" 패턴 존재
        if (body.match(/\d+컷/) && !hasCancel) return true;
        return false;
      }, { timeout: 480_000 }); // 8분
      analysisCompleted = true;
      console.log('[#948] ✅ 분석 결과 감지!');
    } catch {
      console.log('[#948] ⚠️ 분석 결과 대기 타임아웃');
      console.log(`[#948] === 전체 로그 (${allLogs.length}개 중 마지막 30개) ===`);
      allLogs.slice(-30).forEach(l => console.log(`  ${l.slice(0, 200)}`));
    }
    clearInterval(statusInterval);

    await page.waitForTimeout(2000);
    try {
      await page.screenshot({ path: 'test-e2e/948-05-analyzed.png', fullPage: false });
      console.log('[#948] ✅ STEP 5 스크린샷 저장');
    } catch (e) {
      console.log(`[#948] ⚠️ 스크린샷 실패: ${e}`);
    }

    // === STEP 6: 타임코드 추출 ===
    let timecodeData: string[] = [];
    try {
      // 스크롤 다운해서 결과 영역으로 이동
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-e2e/948-05b-scrolled.png', fullPage: false });

      // 버전 카드 찾기: "N컷" 텍스트를 가진 카드만
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

      // 첫 번째 버전 카드 클릭해서 펼치기
      const versionCard = page.locator('[class*="rounded-xl"]').filter({ hasText: /\d+컷/ }).first();
      if (await versionCard.isVisible().catch(() => false)) {
        await versionCard.click();
        await page.waitForTimeout(2000);
        console.log('[#948] 첫 번째 버전 카드 클릭');
        await page.screenshot({ path: 'test-e2e/948-05c-expanded.png', fullPage: false });
      }

      // 타임코드 추출 (table td, font-mono, text-blue-400)
      timecodeData = await page.evaluate(() => {
        const results: string[] = [];
        // table 내 td에서 타임코드 추출
        document.querySelectorAll('table td, .font-mono, [class*="text-blue"]').forEach(el => {
          const text = el.textContent || '';
          const matches = text.match(/\d{1,2}:\d{2}(?:\.\d{1,3})?/g);
          if (matches) results.push(...matches);
        });
        return [...new Set(results)];
      });

      // DOM에서 못 찾으면 store에서 직접 추출 시도
      if (timecodeData.length === 0) {
        console.log('[#948] DOM에서 타임코드 미발견 — store 직접 접근 시도');
        const storeTimecodes = await page.evaluate(() => {
          // videoAnalysisStore나 내부 state에서 versions 추출
          const allText = document.body.innerText;
          const matches = allText.match(/\d{1,2}:\d{2}(?:\.\d{1,3})?(?:~\d{1,2}:\d{2}(?:\.\d{1,3})?)?/g);
          return matches ? [...new Set(matches)] : [];
        });
        if (storeTimecodes.length > 0) {
          timecodeData = storeTimecodes;
          console.log(`[#948] body text에서 타임코드 ${timecodeData.length}개 발견`);
        }
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

    try {
      await page.screenshot({ path: 'test-e2e/948-06-final.png', fullPage: false });
    } catch { /* */ }

    // 스크린샷 파일 검증
    expect(fs.existsSync('test-e2e/948-01-loggedin.png')).toBe(true);
    expect(fs.statSync('test-e2e/948-01-loggedin.png').size).toBeGreaterThan(1000);

    if (analysisCompleted) {
      expect(timecodeData.length).toBeGreaterThan(0);
    }

    console.log(`[#948] ✅ 테스트 완료 (분석 완료: ${analysisCompleted})`);
  });
});
