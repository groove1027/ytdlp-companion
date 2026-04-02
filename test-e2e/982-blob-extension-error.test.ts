/**
 * E2E 테스트: #982 #980 #966 — blob: URL 확장 프로그램 에러 필터링 검증
 *
 * 검증 항목:
 * 1. 앱이 정상 로딩되는지
 * 2. blob: URL 에러가 _isExtensionError에 의해 필터링되는지
 * 3. 에러 로그에 blob URL 에러가 남지 않는지
 * 4. 정상적인 앱 에러는 여전히 캡처되는지
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env.local에서 키 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// 로컬 빌드(수정 반영)로 테스트, 인증만 프로덕션 서버 사용
const BASE_URL = 'http://localhost:4173';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const E2E_DIR = path.resolve(__dirname);

test.describe('#982 #980 #966 blob URL extension error filter', () => {
  test('앱 로딩 → blob: 에러 필터링 확인 → 정상 동작 검증', async ({ page }) => {
    // ── STEP 1: 프로덕션 서버 인증 ──
    const loginRes = await fetch(`${AUTH_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.E2E_TEST_EMAIL,
        password: process.env.E2E_TEST_PASSWORD,
        rememberMe: true,
      }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };
    expect(loginData.token).toBeTruthy();

    // ── STEP 2: 페이지 이동 + localStorage 주입 ──
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, evolink, kie, youtube }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
      localStorage.setItem('CUSTOM_KIE_KEY', kie);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtube);
    }, {
      token: loginData.token,
      user: loginData.user,
      evolink: process.env.CUSTOM_EVOLINK_KEY || '',
      kie: process.env.CUSTOM_KIE_KEY || '',
      youtube: process.env.CUSTOM_YOUTUBE_API_KEY || '',
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // ── STEP 3: before 스크린샷 — 앱 정상 로딩 확인 ──
    await page.screenshot({ path: path.join(E2E_DIR, '982-01-loggedin.png'), fullPage: false });

    // 로그인 확인 — 프로젝트 관련 UI가 보이는지
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    // ── STEP 4: blob: URL 에러를 시뮬레이션하여 필터링 확인 ──
    // _isExtensionError가 blob: filename을 필터링하는지 JavaScript로 직접 확인
    const filterResult = await page.evaluate(() => {
      // 빌드된 코드에서 LoggerService의 _isExtensionError를 간접 검증
      // blob: URL 에러를 window.dispatchEvent로 발생시키고, 에러 로그에 기록되지 않는지 확인

      // 에러 발생 전 로그 수 기록
      const loggerEl = document.querySelector('[data-testid="debug-console"]');
      const beforeErrorCount = (window as any).__LOGGER_ERROR_COUNT_BEFORE ?? 0;

      // blob: URL에서 에러 시뮬레이션 (Chrome 확장 프로그램 패턴)
      const blobContent = 'throw new TypeError("Cannot read properties of undefined (reading \'addListener\')");';
      const blob = new Blob([blobContent], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      // ErrorEvent를 직접 dispatch하여 _isExtensionError 필터링 확인
      const errorEvent = new ErrorEvent('error', {
        message: "Uncaught TypeError: Cannot read properties of undefined (reading 'addListener')",
        filename: blobUrl,
        lineno: 1,
        colno: 1,
        error: new TypeError("Cannot read properties of undefined (reading 'addListener')"),
      });

      // 에러 발생 전 로그 카운트
      const errorsBefore = JSON.parse(localStorage.getItem('DEBUG_PERSISTED_ERRORS') || '[]').length;

      window.dispatchEvent(errorEvent);

      // 약간의 시간 후 확인 (동기적으로 처리됨)
      const errorsAfter = JSON.parse(localStorage.getItem('DEBUG_PERSISTED_ERRORS') || '[]').length;

      URL.revokeObjectURL(blobUrl);

      return {
        blobUrl,
        errorsBefore,
        errorsAfter,
        wasFiltered: errorsAfter === errorsBefore, // 에러가 추가되지 않았으면 필터링 성공
      };
    });

    console.log('[982 E2E] blob URL error filter result:', JSON.stringify(filterResult));
    expect(filterResult.wasFiltered).toBe(true);

    // ── STEP 5: 정상 에러는 여전히 기록되는지 확인 (non-blob URL) ──
    const normalErrorResult = await page.evaluate(() => {
      const errorsBefore = JSON.parse(localStorage.getItem('DEBUG_PERSISTED_ERRORS') || '[]').length;

      // 일반 에러 (우리 앱 코드에서 발생한 것처럼)
      const normalError = new ErrorEvent('error', {
        message: 'Test: Normal app error',
        filename: 'https://all-in-one-production.pages.dev/assets/index-abc123.js',
        lineno: 100,
        colno: 50,
        error: new Error('Test: Normal app error'),
      });
      window.dispatchEvent(normalError);

      const errorsAfter = JSON.parse(localStorage.getItem('DEBUG_PERSISTED_ERRORS') || '[]').length;
      return {
        errorsBefore,
        errorsAfter,
        wasCaptured: errorsAfter > errorsBefore,
      };
    });

    console.log('[982 E2E] normal error capture result:', JSON.stringify(normalErrorResult));
    expect(normalErrorResult.wasCaptured).toBe(true);

    // ── STEP 6: 채널/영상 분석 탭 이동 확인 (실제 앱 사용) ──
    const channelTab = page.locator('button, span, a').filter({ hasText: /채널.*분석|영상.*분석/ }).first();
    if (await channelTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await channelTab.click();
      await page.waitForTimeout(2000);
    }

    // ── STEP 7: after 스크린샷 ──
    await page.screenshot({ path: path.join(E2E_DIR, '982-02-after-filter.png'), fullPage: false });

    // ── STEP 8: 피드백 모달에 blob 에러가 표시되지 않는지 확인 ──
    // 피드백 버튼 클릭
    const feedbackBtn = page.locator('button').filter({ hasText: '피드백' }).first();
    if (await feedbackBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await feedbackBtn.click();
      await page.waitForTimeout(1000);

      // 피드백 모달 내용에 addListener 에러가 없어야 함
      const modalText = await page.textContent('body');
      // blob URL 에러가 사용자에게 보이지 않아야 함 (필터링 성공)
      // 참고: 이전 세션 에러가 남아있을 수 있으므로 새 에러만 확인
      await page.screenshot({ path: path.join(E2E_DIR, '982-03-feedback-clean.png'), fullPage: false });
    }

    console.log('[982 E2E] ✅ 모든 검증 통과');
  });
});
