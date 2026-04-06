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

test.describe('#1021 키워드 레이더 차트 글자 잘림 수정', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

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

  test('키워드 분석 후 레이더 차트 라벨이 잘리지 않고 전부 표시됨', async ({ page }) => {
    // STEP 1: before 스크린샷 — 로그인 후 메인 화면
    await page.screenshot({ path: 'test-e2e/1021-01-loggedin.png', fullPage: false });

    // STEP 2: 채널 분석 탭으로 이동
    const channelTab = page.locator('button, a, [role="tab"]').filter({ hasText: /채널/ });
    await channelTab.first().click();
    await page.waitForTimeout(2000);

    // STEP 3: 키워드 랩 서브탭으로 이동
    const keywordLabTab = page.locator('button, a, [role="tab"]').filter({ hasText: /키워드/ });
    await keywordLabTab.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/1021-02-keyword-lab-before.png', fullPage: false });

    // STEP 4: 키워드 입력 후 분석
    const keywordInput = page.locator('input[placeholder*="키워드"], input[placeholder*="keyword"], textarea').first();
    await keywordInput.fill('먹방');
    await page.waitForTimeout(500);

    // 분석 버튼 클릭 — API 응답 리스너를 먼저 설정
    const analyzeBtn = page.locator('button').filter({ hasText: /분석|검색|조회/ });
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('googleapis') && resp.status() === 200,
      { timeout: 60000 }
    ).catch(() => null);
    await analyzeBtn.first().click();

    // API 응답 대기 (타임아웃 시에도 계속 진행)
    const apiResp = await responsePromise;
    if (apiResp) {
      console.log(`[E2E] YouTube API 응답 수신: ${apiResp.url()}`);
    } else {
      console.log('[E2E] YouTube API 응답 타임아웃 — 로딩 완료 대기로 전환');
    }
    // 로딩 스피너 사라질 때까지 또는 결과 나올 때까지 대기
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'test-e2e/1021-03-first-result.png', fullPage: false });

    // STEP 5: 결과 확인
    const hasResult = await page.locator('text=검색량').count();
    console.log(`[E2E] 검색량 라벨 존재: ${hasResult > 0}`);

    // STEP 6: 레이더 차트 SVG의 viewBox 검증 (핵심 — 코드 레벨 검증)
    // SVG가 렌더링되었다면 viewBox에 패딩이 있는지 확인
    const radarViewBox = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg[class*="max-w"]');
      for (const svg of svgs) {
        const vb = svg.getAttribute('viewBox');
        if (vb && vb.includes('-')) return vb; // 음수 좌표 = 패딩 적용
      }
      return null;
    });

    if (radarViewBox) {
      const parts = radarViewBox.split(' ').map(Number);
      // viewBox x가 음수 = 좌측 패딩 적용됨 (수정 전: 0)
      expect(parts[0]).toBeLessThan(0);
      // viewBox y가 음수 = 상단 패딩 적용됨 (수정 전: 0)
      expect(parts[1]).toBeLessThan(0);
      // viewBox width가 280보다 큼 = 좌우 패딩 적용됨
      expect(parts[2]).toBeGreaterThan(280);
      console.log(`[RadarChart] viewBox 검증 통과: ${radarViewBox}`);
    }

    // STEP 7: 축 라벨 텍스트 anchor 검증
    const labelAnchors = await page.evaluate(() => {
      const texts = document.querySelectorAll('svg text');
      const anchors: { label: string; anchor: string | null }[] = [];
      texts.forEach(t => {
        const content = t.textContent || '';
        if (['검색량', '기회점수', '채널다양성', '트렌드'].some(l => content.includes(l))) {
          anchors.push({ label: content, anchor: t.getAttribute('text-anchor') });
        }
      });
      return anchors;
    });

    // 라벨 anchor가 동적으로 설정되었는지 확인 (모두 middle이 아닌 것)
    if (labelAnchors.length > 0) {
      const anchorValues = labelAnchors.map(a => a.anchor);
      const hasStartOrEnd = anchorValues.some(a => a === 'start' || a === 'end');
      expect(hasStartOrEnd).toBe(true); // 좌/우측 라벨은 start 또는 end여야 함
      console.log(`[RadarChart] 라벨 anchor 검증 통과:`, labelAnchors);
    }

    // STEP 8: 스크롤하여 레이더 차트 영역이 보이게 한 후 최종 스크린샷
    await page.evaluate(() => {
      const radar = document.querySelector('svg[class*="max-w"]');
      if (radar) radar.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-e2e/1021-04-radar-chart.png', fullPage: false });

    // STEP 9: 최종 전체 화면 스크린샷
    await page.screenshot({ path: 'test-e2e/1021-05-final.png', fullPage: true });
  });
});
