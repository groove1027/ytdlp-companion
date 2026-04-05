import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = process.env.E2E_BASE_URL || 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;

async function login(page: import('@playwright/test').Page) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const data = await res.json();
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }, { token: data.token, user: data.user });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

test.describe('CompanionGateModal', () => {
  test('컴패니언 미감지 시 전체화면 블로킹 게이트가 표시됨', async ({ page }) => {
    // 1) 로그인 전 상태 캡처
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/companion-gate-01-before-login.png' });

    // 2) 로그인
    await login(page);
    await page.waitForTimeout(5000); // 컴패니언 체크 대기

    // 3) CompanionGateModal이 표시되는지 확인
    // z-[10050] 클래스를 가진 전체화면 오버레이
    const gate = page.locator('.fixed.inset-0');
    const gateVisible = await gate.first().isVisible().catch(() => false);

    await page.screenshot({ path: 'test-e2e/companion-gate-02-after-login.png' });

    // 4) 게이트 내 핵심 요소 확인
    // "올인원 헬퍼" 텍스트가 있는지
    const helperText = page.locator('text=올인원 헬퍼');
    const hasHelperText = await helperText.first().isVisible({ timeout: 5000 }).catch(() => false);

    // "실행하기" 버튼이 있는지
    const launchBtn = page.locator('button:has-text("실행하기")');
    const hasLaunchBtn = await launchBtn.first().isVisible({ timeout: 3000 }).catch(() => false);

    // "다운로드" 링크가 있는지
    const downloadLink = page.locator('a:has-text("다운로드")');
    const hasDownloadLink = await downloadLink.first().isVisible({ timeout: 3000 }).catch(() => false);

    // 9가지 기능 목록 확인
    const features = page.locator('text=yt-dlp 고속 다운로드');
    const hasFeatures = await features.first().isVisible({ timeout: 3000 }).catch(() => false);

    // 트러블슈팅 텍스트 확인
    const troubleshoot = page.locator('text=포트 9876');
    const hasTroubleshoot = await troubleshoot.first().isVisible({ timeout: 3000 }).catch(() => false);

    await page.screenshot({ path: 'test-e2e/companion-gate-03-gate-detail.png' });

    // 5) 스크롤해서 하단도 캡처
    await page.evaluate(() => {
      const scrollable = document.querySelector('.fixed.inset-0 .overflow-y-auto');
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-e2e/companion-gate-04-scrolled.png' });

    // 6) 결과 검증
    console.log(`[Gate] gateVisible=${gateVisible}, helperText=${hasHelperText}, launchBtn=${hasLaunchBtn}, downloadLink=${hasDownloadLink}, features=${hasFeatures}, troubleshoot=${hasTroubleshoot}`);

    expect(hasHelperText).toBe(true);
    expect(hasLaunchBtn).toBe(true);
    expect(hasDownloadLink).toBe(true);
    expect(hasFeatures).toBe(true);
    expect(hasTroubleshoot).toBe(true);
  });

  test('CompanionBanner가 완전히 제거되었는지 확인', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await login(page);
    await page.waitForTimeout(5000);

    // CompanionBanner 관련 텍스트가 없어야 함
    const body = await page.textContent('body') || '';

    // 기존 CompanionBanner에만 있던 텍스트들
    const bannerOnlyTexts = [
      '고속 다운로드 활성화됨',
      '로컬 음성 인식 활성화됨',
      '로컬 TTS 활성화됨',
      '네이티브 렌더링 활성화됨',
      'NLE 직접 연동 활성화됨',
    ];

    for (const text of bannerOnlyTexts) {
      expect(body).not.toContain(text);
    }

    // Qwen3/Kokoro 참조도 없어야 함
    expect(body).not.toContain('Qwen3');
    expect(body).not.toContain('Kokoro');

    await page.screenshot({ path: 'test-e2e/companion-gate-05-no-banner.png' });
  });
});
