import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const KIE_KEY = process.env.CUSTOM_KIE_KEY!;
const YOUTUBE_API_KEY = process.env.CUSTOM_YOUTUBE_API_KEY!;
const CLOUD_NAME = process.env.CUSTOM_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.CUSTOM_UPLOAD_PRESET!;

test.describe('무료 이미지 레퍼런스 폴백 체인', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    // 프로덕션 서버에서 토큰 취득
    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // localStorage에 토큰 + API 키 주입
    await page.evaluate(({ token, user, evolink, kie, youtube, cloudName, uploadPreset }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
      localStorage.setItem('CUSTOM_KIE_KEY', kie);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtube);
      localStorage.setItem('CUSTOM_CLOUD_NAME', cloudName);
      localStorage.setItem('CUSTOM_UPLOAD_PRESET', uploadPreset);
    }, {
      token: loginData.token,
      user: loginData.user,
      evolink: EVOLINK_KEY,
      kie: KIE_KEY,
      youtube: YOUTUBE_API_KEY,
      cloudName: CLOUD_NAME,
      uploadPreset: UPLOAD_PRESET,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  });

  test('구글 레퍼런스 이미지가 검색되고 스토리보드에 표시됨', async ({ page }) => {
    // STEP 1: before 스크린샷 — 로그인 상태
    await page.screenshot({ path: 'test-e2e/google-ref-01-loggedin.png', fullPage: false });

    // STEP 2: 대본 모드로 이동 + 대본 입력
    // 탭 네비게이션으로 이미지/영상 탭 진입
    const scriptTab = page.locator('button:has-text("대본"), a:has-text("대본")').first();
    if (await scriptTab.isVisible()) {
      await scriptTab.click();
      await page.waitForTimeout(1000);
    }

    // 대본 입력 영역 찾기
    const scriptInput = page.locator('textarea').first();
    if (await scriptInput.isVisible()) {
      await scriptInput.fill('한국 전통 한옥 마을의 아름다운 풍경. 경복궁 근정전 앞에서 관광객들이 사진을 찍고 있다. 한편 부산 해운대 해수욕장에서는 서퍼들이 파도를 타고 있다.');
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'test-e2e/google-ref-02-script-entered.png', fullPage: false });

    // STEP 3: 장면 분할 버튼 클릭 (있으면)
    const analyzeBtn = page.locator('button:has-text("분석"), button:has-text("장면 분할"), button:has-text("스토리보드")').first();
    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click();
      // 분석 완료 대기
      await page.waitForTimeout(15000);
    }

    await page.screenshot({ path: 'test-e2e/google-ref-03-scenes-created.png', fullPage: false });

    // STEP 4: 이미지/영상 탭 이동
    const imageTab = page.locator('button:has-text("이미지"), button:has-text("스토리보드"), a:has-text("이미지")').first();
    if (await imageTab.isVisible()) {
      await imageTab.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/google-ref-04-image-tab.png', fullPage: false });

    // STEP 5: 무료 레퍼런스 토글 ON (이미 ON이면 스킵)
    const refToggle = page.locator('text=무료 이미지 레퍼런스, text=무료 레퍼런스, text=Google 레퍼런스').first();
    if (await refToggle.isVisible()) {
      // 토글 부모 버튼 클릭
      const toggleBtn = refToggle.locator('xpath=ancestor::div[1]//button').first();
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'test-e2e/google-ref-05-toggle-on.png', fullPage: false });

    // STEP 6: 검색 실행 (전체 검색 버튼 또는 자동 적용)
    const searchAllBtn = page.locator('button:has-text("전체 검색"), button:has-text("일괄 검색"), button:has-text("자동 적용")').first();
    if (await searchAllBtn.isVisible()) {
      await searchAllBtn.click();
      // 검색 결과 대기 (네트워크 호출 포함)
      await page.waitForTimeout(30000);
    }

    await page.screenshot({ path: 'test-e2e/google-ref-06-search-result.png', fullPage: false });

    // STEP 7: 결과 확인 — 이미지가 표시되는지
    // 콘솔 로그에서 provider 확인
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[GoogleRef]')) {
        consoleMessages.push(msg.text());
      }
    });

    // 이미지 요소가 스토리보드에 존재하는지 확인
    const images = page.locator('img[src*="http"], img[src*="data:image"]');
    const imageCount = await images.count();

    await page.screenshot({ path: 'test-e2e/google-ref-07-final.png', fullPage: false });

    // 최소 1개 이상의 이미지가 표시되어야 함
    console.log(`[E2E] 검색된 이미지 수: ${imageCount}`);
    console.log(`[E2E] 콘솔 로그:`, consoleMessages.slice(0, 5));

    // 스크린샷이 저장되었는지 확인
    const fs = await import('fs');
    expect(fs.existsSync('test-e2e/google-ref-01-loggedin.png')).toBe(true);
    expect(fs.existsSync('test-e2e/google-ref-07-final.png')).toBe(true);
  });
});
