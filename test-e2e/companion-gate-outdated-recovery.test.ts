/**
 * 컴패니언 게이트 — outdated 모드 + OutdatedRecoveryGuide UI 검증
 *
 * 검증 시나리오:
 *  1) 헬퍼 v1.2.0(< MIN 1.3.0)이 detected/last-known인 상태 → outdated 모드
 *  2) OutdatedRecoveryGuide 컴포넌트가 모달 본문 최상단에 표시
 *  3) 4단계 카드 (1️⃣ 트레이 quit / 2️⃣ 다운로드 / 3️⃣ 설치 / 4️⃣ 실행) 모두 표시
 *  4) "🛑 Required" 빨강 배지 + "다운로드만으로는 절대 갱신 안 됩니다" 제목
 *  5) v1.3.1 take-over 자동화 안내 문구
 *  6) macOS UA에서 macOS 분기 카피 표시
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY || '';

async function login(page: import('@playwright/test').Page) {
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    if (key) localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
}

test.describe('companion gate — outdated mode + OutdatedRecoveryGuide', () => {
  test('localStorage 시드된 v1.2.0 → outdated 모드 + 4단계 가이드 전체 검증', async ({ page, context }) => {
    test.setTimeout(120_000);

    // 헬퍼 health 차단 (outdated lastKnown만 있는 상태)
    await context.route('http://127.0.0.1:9876/**', (route) => route.abort('failed'));
    await context.route('http://localhost:9876/**', (route) => route.abort('failed'));

    // GitHub 정상 응답 (v1.3.0 → release-pending이 아님 → outdated 모드)
    const okPayload = [{
      tag_name: 'companion-v1.3.0',
      draft: false,
      prerelease: false,
      body: '',
      assets: [
        { name: 'All.In.One.Helper_1.3.0_universal.dmg', browser_download_url: 'https://example.com/v1.3.0.dmg' },
        { name: 'All.In.One.Helper_1.3.0_x64-setup.exe', browser_download_url: 'https://example.com/v1.3.0.exe' },
      ],
    }];
    await context.route(/api\.github\.com\/repos\/groove1027\/ytdlp-companion\/releases/, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(okPayload) });
    });

    await login(page);
    await page.evaluate(() => {
      // localStorage에 v1.2.0 시드 → mode='outdated'
      localStorage.setItem('companion_last_detected_version', '1.2.0');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 게이트 모달 열림 대기
    await page.waitForSelector('[role="dialog"][aria-labelledby="companion-gate-title"]', { timeout: 30_000 });

    // outdated 모드 분기 안정화 (release-pending이 아닌 정상 outdated)
    await page.waitForFunction(() => {
      const t = document.getElementById('companion-gate-title');
      return !!t && t.textContent?.includes('업데이트가 필요합니다');
    }, { timeout: 15_000 });

    await page.screenshot({ path: 'test-e2e/companion-gate-outdated-recovery-01.png', fullPage: true });

    // (1) "Update Required" 배지
    await expect(page.getByText('Update Required', { exact: false })).toBeVisible();

    // (2) OutdatedRecoveryGuide 빨강 배지
    await expect(page.getByText('🛑 Required', { exact: false })).toBeVisible();

    // (3) "다운로드만으로는 절대 갱신 안 됩니다" 제목
    await expect(page.getByText('다운로드만으로는 절대 갱신 안 됩니다', { exact: false })).toBeVisible();

    // (4) 4단계 카드 (각 단계 헤딩 텍스트)
    await expect(page.getByText('옛 헬퍼 완전 종료', { exact: false })).toBeVisible();
    await expect(page.getByText('아래 "최신 버전 다운로드" 버튼 클릭', { exact: false })).toBeVisible();
    await expect(page.getByText('DMG 마운트 → .app을 Applications 폴더로 드래그', { exact: false })).toBeVisible();
    await expect(page.getByText('Applications 폴더에서 새 헬퍼 더블클릭', { exact: false })).toBeVisible();

    // (5) v1.3.1 자동화 안내 문구
    await expect(page.getByText('v1.3.1부터는 새 헬퍼가 시작될 때 옛 헬퍼를 자동 종료합니다', { exact: false })).toBeVisible();

    // (6) 트레이 fallback 안내 (Spotlight 또는 작업 관리자)
    const macFallback = page.getByText(/활성 상태 보기|Spotlight/, { exact: false });
    const winFallback = page.getByText(/작업 관리자|Ctrl \+ Shift \+ Esc/, { exact: false });
    const fallbackVisible = (await macFallback.count()) > 0 || (await winFallback.count()) > 0;
    expect(fallbackVisible).toBe(true);

    // (7) version pills
    await expect(page.locator('p', { hasText: /^현재 감지 버전$/ }).locator('xpath=following-sibling::p').first()).toHaveText('v1.2.0');
    await expect(page.locator('p', { hasText: /^최소 요구 버전$/ }).locator('xpath=following-sibling::p').first()).toHaveText('v1.3.0');

    // (8) 다운로드 버튼 노출 (release-pending이 아니므로)
    const ctaPrimary = page.getByRole('link', { name: /최신 버전 다운로드/ });
    await expect(ctaPrimary).toBeVisible();

    await page.screenshot({ path: 'test-e2e/companion-gate-outdated-recovery-02-final.png', fullPage: true });

    console.log('✅ outdated 모드 + OutdatedRecoveryGuide 4단계 카드 전체 검증 완료');
  });
});
