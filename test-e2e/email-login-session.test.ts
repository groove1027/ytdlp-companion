import { test, expect } from '@playwright/test';

const PRODUCTION_URL = 'https://all-in-one-production.pages.dev';

test.describe('이메일 로그인 + 세션 제한 검증', () => {
  test('이메일만으로 로그인 성공 (API 직접 호출)', async ({ page }) => {
    // 1. 프로덕션 접속
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: 'test-e2e/email-login-01-landing.png' });

    // 2. email-login API 호출
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'minkwon6637@gmail.com' }),
      });
      return { status: res.status, data: await res.json() };
    });

    // 3. 성공 확인
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    expect(result.data.user.tier).toBe('premium');
    expect(result.data.token).toBeTruthy();

    // 4. 토큰으로 로그인
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }, { token: result.data.token, user: result.data.user });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/email-login-02-loggedin.png' });

    // 5. 로그인 상태 확인
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('프로젝트');
  });

  test('미등록 이메일로 로그인 실패', async ({ page }) => {
    await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent_user_test_12345@gmail.com' }),
      });
      return { status: res.status, data: await res.json() };
    });

    expect(result.status).toBe(401);
    expect(result.data.error).toContain('등록되지 않은');
    await page.screenshot({ path: 'test-e2e/email-login-03-failed.png' });
  });
});
