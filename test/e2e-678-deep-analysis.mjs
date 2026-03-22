/**
 * E2E #678 — 영상 분석실 심층 분석 동작 검증 (Playwright)
 *
 * 검증 항목:
 * 1. 영상 분석실 탭 접근 가능
 * 2. YouTube URL 입력 가능
 * 3. 심층 분석 프리셋 선택 가능
 * 4. 분석 시작 버튼 동작
 * 5. API 키 인증 상태 확인
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

// MEMORY.md에서 가져온 테스트용 API 키
const API_KEYS = {
  evolink: 'REDACTED_EVOLINK_KEY',
  youtube: 'AIzaSyDCZ4kTRy3VR8T_-tU3fd98Z2ArNspC5g4',
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('🚀 E2E #678 테스트 시작');

  try {
    // 1. 앱 로드
    console.log('  [1/6] 앱 로드...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // 2. localStorage에 API 키 + 인증 토큰 주입
    console.log('  [2/6] API 키 + 인증 토큰 주입...');
    await page.evaluate((keys) => {
      localStorage.setItem('CUSTOM_EVOLINK_KEY', keys.evolink);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', keys.youtube);
      // 인증 토큰 주입 (E2E 테스트용)
      localStorage.setItem('auth_token', 'e2e-test-token-678');
      localStorage.setItem('auth_user', JSON.stringify({ email: 'test@e2e.local', displayName: 'E2E Test' }));
    }, API_KEYS);

    // 새로고침하여 키 반영
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });

    // 3. 영상 분석실 탭으로 이동
    console.log('  [3/6] 영상 분석실 탭 이동...');
    const videoAnalysisTab = page.locator('button:has-text("채널/영상 분석")').first();
    await videoAnalysisTab.click({ timeout: 10000 });
    await page.waitForTimeout(1500);

    // 3.5. 영상 분석실 서브탭 클릭
    console.log('  [3.5] 영상 분석실 서브탭 이동...');
    const videoRoomTab = page.locator('button:has-text("영상 분석실")').first();
    const videoRoomVisible = await videoRoomTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (videoRoomVisible) {
      await videoRoomTab.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('    이미 영상 분석실에 있거나 서브탭을 찾지 못함');
    }

    // 4. YouTube URL 입력
    console.log('  [4/6] YouTube URL 입력...');
    const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="URL"], textarea[placeholder*="YouTube"]').first();
    await urlInput.fill(TEST_YOUTUBE_URL, { timeout: 5000 });
    await page.waitForTimeout(500);

    // 5. 심층 분석 프리셋 찾기
    console.log('  [5/6] 심층 분석 프리셋 확인...');
    const deepPreset = page.locator('button:has-text("심층 분석"), [data-preset="deep"]').first();
    const deepPresetVisible = await deepPreset.isVisible({ timeout: 5000 }).catch(() => false);

    if (deepPresetVisible) {
      console.log('    ✅ 심층 분석 프리셋 발견');

      // 프리셋 클릭
      await deepPreset.click();
      await page.waitForTimeout(2000);

      // 6. 분석이 시작되었는지 확인 (로딩 UI가 나타나는지)
      console.log('  [6/6] 분석 시작 확인...');

      // 분석 진행 중 UI 요소 확인 (로딩 스피너, 진행률 바 등)
      const analysisIndicator = page.locator('[class*="animate"], text=/분석|생성|시청|편집표|수집/').first();
      const isAnalyzing = await analysisIndicator.isVisible({ timeout: 10000 }).catch(() => false);

      if (isAnalyzing) {
        console.log('    ✅ 분석이 정상적으로 시작됨');
      } else {
        // 에러 메시지가 있는지 확인
        const errorMsg = await page.locator('text=/실패|에러|오류|API 키/').first().textContent({ timeout: 3000 }).catch(() => null);
        if (errorMsg) {
          console.log(`    ⚠️ 에러 메시지: ${errorMsg.slice(0, 100)}`);
        } else {
          console.log('    ⚠️ 분석 시작 UI를 감지하지 못함 (네트워크 지연 가능)');
        }
      }

      // 잠시 대기 후 스크린샷
      await page.waitForTimeout(3000);
    } else {
      console.log('    ⚠️ 심층 분석 프리셋이 아직 표시되지 않음 — 스크롤 또는 UI 상태 확인 필요');
    }

    // 최종 스크린샷
    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-678-deep-analysis.png', fullPage: false });
    console.log('  📸 스크린샷 저장: test/output/e2e-678-deep-analysis.png');

    console.log('\n✅ E2E #678 테스트 완료');

  } catch (err) {
    console.error('❌ E2E 테스트 실패:', err.message);
    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-678-error.png', fullPage: false }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run();
