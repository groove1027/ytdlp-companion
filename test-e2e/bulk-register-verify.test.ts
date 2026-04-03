import { test, expect } from '@playwright/test';

const PRODUCTION_URL = 'https://all-in-one-production.pages.dev';

// 일괄 가입 검증: 실제 로그인 테스트
// basic 2명 + premium 2명 = 총 4명 샘플 로그인

const SAMPLE_USERS = [
  { email: 'minkwon6637@gmail.com', password: 'switching-premium', tier: 'premium', nickname: '권벤자민' },
  { email: '100healthgift@naver.com', password: 'switching-basic', tier: 'basic', nickname: '리치리치' },
  { email: 'eggboyjun@gmail.com', password: 'switching-premium', tier: 'premium', nickname: '계란보이' },
  { email: 'tricoti@naver.com', password: 'switching-basic', tier: 'basic', nickname: '트리코티' },
];

test.describe('일괄 가입 검증 — 실제 로그인 테스트', () => {
  for (const user of SAMPLE_USERS) {
    test(`${user.nickname} (${user.tier}) 로그인 성공`, async ({ page }) => {
      // 1. 프로덕션 접속
      await page.goto(PRODUCTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.screenshot({ path: `test-e2e/bulk-01-landing-${user.tier}.png` });

      // 2. API로 로그인 토큰 취득
      const loginRes = await page.evaluate(async (u) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email, password: u.password, rememberMe: true }),
        });
        return { status: res.status, data: await res.json() };
      }, user);

      // 3. 로그인 성공 확인
      expect(loginRes.status).toBe(200);
      expect(loginRes.data.success).toBe(true);
      expect(loginRes.data.user.tier).toBe(user.tier);
      expect(loginRes.data.user.email).toBe(user.email.toLowerCase());

      // 4. 토큰으로 localStorage 주입 후 리로드
      await page.evaluate(({ token, userData }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(userData));
      }, { token: loginRes.data.token, userData: loginRes.data.user });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 5. 로그인 후 화면 — 닉네임 또는 대시보드 요소 확인
      await page.screenshot({ path: `test-e2e/bulk-02-loggedin-${user.tier}.png` });

      // 6. 로그인된 상태 확인 (로그인 버튼이 사라지거나 닉네임이 표시되는지)
      const bodyText = await page.textContent('body');
      // 로그인 화면이 아닌 메인 화면이 표시되어야 함
      const isLoggedIn = !bodyText?.includes('로그인') || bodyText?.includes(user.nickname) || bodyText?.includes('프로젝트');
      expect(isLoggedIn).toBe(true);
    });
  }
});
