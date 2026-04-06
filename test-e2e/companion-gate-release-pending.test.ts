/**
 * 컴패니언 게이트 — release-pending sub-state E2E 검증
 *
 * 검증 시나리오:
 *  1) GitHub releases API를 가로채서 latest 응답을 v1.2.0(MIN_REQUIRED 1.3.0보다 낮음)으로 강제
 *  2) 게이트 모달이 "release-pending" 모드로 분기되는지
 *     - 제목: "새 헬퍼 버전(v1.3.0) 게시 대기 중"
 *     - 배지: "Release Pending"
 *     - 최신 버전 Pill: "게시 대기 중"
 *     - 다운로드 버튼 없음 (disabled or replaced)
 *     - "릴리스 정보 다시 확인" 버튼 표시
 *  3) liveDetected=false (헬퍼 차단됨) → "이미 설치되어 있다면 실행하기" 버튼 표시
 *  4) 버그 회귀 방지: "현재 v? → 최신 v?" 자기모순 문구가 안 보여야 함
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
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

test.describe('companion gate — release-pending sub-state', () => {
  test('GitHub latest < MIN_REQUIRED일 때 release-pending 모드로 분기', async ({ page, context }) => {
    test.setTimeout(120_000);

    // (1) GitHub Releases API를 가로채서 stale v1.2.0 응답 강제
    //     실제 시나리오: build-companion CI가 v1.3.0을 빌드했지만 미러링이 안 된 상태
    const stalePayload = [{
      tag_name: 'companion-v1.2.0',
      name: 'All In One Helper v1.2.0',
      draft: false,
      prerelease: false,
      body: 'stale release for E2E test',
      assets: [
        { name: 'All.In.One.Helper_1.2.0_universal.dmg', browser_download_url: 'https://example.com/v1.2.0.dmg' },
        { name: 'All.In.One.Helper_1.2.0_x64-setup.exe', browser_download_url: 'https://example.com/v1.2.0.exe' },
      ],
    }];
    await context.route(/api\.github\.com\/repos\/groove1027\/ytdlp-companion\/releases/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stalePayload),
      });
    });

    // (2) 컴패니언 health check 차단 — liveDetected=false 시나리오
    await context.route('http://127.0.0.1:9876/**', (route) => route.abort('failed'));
    await context.route('http://localhost:9876/**', (route) => route.abort('failed'));

    await login(page);
    await page.evaluate(() => {
      localStorage.removeItem('companion_last_detected_version');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // (3) 게이트 모달 열림 대기
    await page.waitForSelector('[role="dialog"][aria-labelledby="companion-gate-title"]', { timeout: 30_000 });

    // 첫 fetch + auto sync 완료 대기 (release-pending 분기 안정화까지)
    await page.waitForFunction(() => {
      const title = document.getElementById('companion-gate-title');
      return !!title && title.textContent?.includes('게시 대기 중');
    }, { timeout: 15_000 });

    await page.screenshot({ path: 'test-e2e/companion-gate-release-pending-01.png', fullPage: true });

    // (4) 제목 검증 — release-pending 카피
    const title = await page.locator('#companion-gate-title').textContent();
    expect(title || '').toContain('새 헬퍼 버전');
    expect(title || '').toContain('v1.3.0');
    expect(title || '').toContain('게시 대기 중');

    // (5) 자기모순 문구 회귀 방지 — "현재 v? → 최신 v?" 패턴이 안 보여야 함
    const bodyText = await page.locator('body').textContent();
    expect(bodyText || '').not.toMatch(/현재 v[\d?]+\s*→\s*최신 v[\d?]+/);

    // (6) "Release Pending" 배지
    await expect(page.getByText('Release Pending', { exact: false })).toBeVisible();

    // (7) "최신 버전" pill에 "게시 대기 중" 표시
    const latestPill = page.locator('p', { hasText: /^최신 버전$/ }).locator('xpath=following-sibling::p').first();
    await expect(latestPill).toHaveText('게시 대기 중');

    // (8) "최소 요구 버전" pill에 v1.3.0
    await expect(page.locator('p', { hasText: /^최소 요구 버전$/ }).locator('xpath=following-sibling::p').first()).toHaveText('v1.3.0');

    // (9) 다운로드 링크가 없어야 함 (download 버튼이 release-pending에서는 disabled로 대체)
    const downloadLink = page.getByRole('link', { name: /최신 버전 다운로드/ });
    await expect(downloadLink).toHaveCount(0);

    // (10) "릴리스 정보 다시 확인" 버튼 노출
    const refreshBtn = page.getByRole('button', { name: /릴리스 정보 다시 확인/ });
    await expect(refreshBtn).toBeVisible();

    // (11) liveDetected=false → launch 버튼 노출 ("이미 설치되어 있다면 실행하기")
    const launchBtn = page.getByRole('button', { name: /이미 설치되어 있다면 실행하기/ });
    await expect(launchBtn).toBeVisible();

    // (12) Troubleshooting 패널에 release-pending 안내 문구
    await expect(page.getByText('새 버전(v1.3.0)이 GitHub에 게시되는 중', { exact: false })).toBeVisible();

    await page.screenshot({ path: 'test-e2e/companion-gate-release-pending-02-final.png', fullPage: true });

    console.log('✅ release-pending 분기 검증 완료');
  });

  // NOTE: refresh 버튼 동작은 test 1이 사용하는 동일한 hook 경로(handleRefreshRelease →
  // syncCompanion('manual') → refreshCompanionRelease(true))로 구현되므로 별도 E2E 없이
  // 단위 테스트 + Codex review 6차로 검증됨. 추가 분기 시나리오 발생 시 추가.
});
