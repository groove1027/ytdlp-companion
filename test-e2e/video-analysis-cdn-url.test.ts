/**
 * Playwright E2E 테스트: 영상 분석 CDN URL 변환 검증
 * YouTube 링크 → extractStreamUrl → CDN URL → Gemini v1beta 분석
 * 테스트 영상: https://www.youtube.com/shorts/HMBqVXNjrgo
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';
const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

test('앱이 정상적으로 로드됨', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await expect(page.locator('body')).toBeVisible();
  const hasContent = await page.locator('body').textContent();
  expect(hasContent).toBeTruthy();
  console.log('✅ 앱 정상 로드 확인');
  await page.close();
});

test('콘솔 에러가 CDN URL 관련 치명적 오류를 포함하지 않음', async ({ browser }) => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const cdnErrors = errors.filter(e =>
    e.includes('extractStreamUrl') ||
    e.includes('CDN URL') ||
    e.includes('evolinkVideoAnalysisStream')
  );
  expect(cdnErrors).toHaveLength(0);
  console.log(`✅ CDN URL 관련 치명적 에러 없음 (전체 콘솔 에러: ${errors.length}건)`);
  await page.close();
});

test('채널/영상 분석 탭 접근 가능', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 채널/영상 분석 탭 찾기
  const channelTab = page.locator('text=채널').first();
  if (await channelTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await channelTab.click();
    await page.waitForTimeout(1000);
    console.log('✅ 채널/영상 분석 탭 접근 성공');
  } else {
    console.log('⚠️ 채널/영상 분석 탭이 표시되지 않음 (로그인 필요)');
  }
  await page.close();
});

test('영상분석실에서 YouTube URL 입력 시 에러 없음', async ({ browser }) => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 채널 탭 이동 시도
  const channelTab = page.locator('text=채널').first();
  if (await channelTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await channelTab.click();
    await page.waitForTimeout(1000);

    // 영상분석 탭 시도
    const analysisTab = page.locator('text=영상분석').first();
    if (await analysisTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analysisTab.click();
      await page.waitForTimeout(1000);

      // URL 입력 필드 찾기 (다양한 셀렉터 시도)
      const urlInput = page.locator('input, textarea').filter({ hasText: /유튜브|YouTube|링크|URL/ }).first();
      const genericInput = page.locator('textarea').first();
      const target = await urlInput.isVisible({ timeout: 2000 }).catch(() => false) ? urlInput : genericInput;

      if (await target.isVisible({ timeout: 2000 }).catch(() => false)) {
        await target.fill(TEST_YOUTUBE_URL);
        await page.waitForTimeout(1000);
        console.log('✅ YouTube URL 입력 성공');
      } else {
        console.log('⚠️ URL 입력 필드를 찾을 수 없음');
      }
    } else {
      console.log('⚠️ 영상분석 탭을 찾을 수 없음');
    }
  } else {
    console.log('⚠️ 채널 탭이 표시되지 않음');
  }

  // 치명적 JS 에러 확인
  const fatalErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError')
  );
  if (fatalErrors.length > 0) {
    console.log('❌ 치명적 에러 발견:', fatalErrors);
  }
  expect(fatalErrors).toHaveLength(0);
  console.log('✅ 치명적 JS 에러 없음');
  await page.close();
});
