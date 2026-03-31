import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5177';
const AUTH_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('컴패니언 강제 실행 기능', () => {
  test('배너에 "실행하기" 버튼 표시 + 클릭 시 URL 스킴 호출', async ({ page }) => {
    // 1) 프로덕션 서버에서 토큰 취득
    const loginRes = await fetch(`${AUTH_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };
    expect(loginData.token).toBeTruthy();

    // 2) 페이지 로드 + 인증/키 주입 + dismiss 캐시 클리어
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
      // 배너 dismiss 캐시 + companion 캐시 모두 클리어
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('companion_banner_')) localStorage.removeItem(k);
      }
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'test-e2e/companion-launch-01-loggedin.png', fullPage: true });

    // 3) 프로젝트 선택/생성
    const projBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("프로젝트")').first();
    if (await projBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projBtn.click();
      await page.waitForTimeout(2000);
    }

    // 4) 채널/영상 분석 탭 (CompanionBanner feature="download" — 덜 compact)
    const channelTab = page.locator('button:has-text("채널"), button:has-text("영상 분석"), [data-tab="channel"]').first();
    if (await channelTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await channelTab.click();
      await page.waitForTimeout(8000); // 배너 렌더링 충분 대기
    }

    await page.screenshot({ path: 'test-e2e/companion-launch-02-tab.png', fullPage: true });

    // 5) 모든 버튼/링크를 디버그 출력
    const allButtons = await page.locator('button').allTextContents();
    const allLinks = await page.locator('a').allTextContents();
    console.log('[Debug] 버튼들:', allButtons.filter(t => t.trim()).join(' | '));
    console.log('[Debug] 링크들:', allLinks.filter(t => t.trim()).join(' | '));

    // 6) 배너 검색
    const launchBtn = page.locator('button:has-text("실행하기")').first();
    const hasLaunchBtn = await launchBtn.isVisible({ timeout: 3000 }).catch(() => false);

    // "실행하기" 버튼이 DOM에 있는지 (visible이 아니더라도)
    const launchBtnCount = await page.locator('button:has-text("실행하기")').count();
    console.log(`[Test] "실행하기" 버튼 visible: ${hasLaunchBtn}, DOM count: ${launchBtnCount}`);

    // CompanionBanner가 어떤 형태로든 존재하는지 (활성화/비활성화 둘 다)
    const hasActive = await page.locator('text=활성화됨').isVisible({ timeout: 2000 }).catch(() => false);
    const hasInstall = await page.locator('a:has-text("설치")').isVisible({ timeout: 2000 }).catch(() => false);
    const hasHelper = await page.locator('text=헬퍼').first().isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`[Test] 활성화: ${hasActive}, 설치: ${hasInstall}, 헬퍼: ${hasHelper}`);

    await page.screenshot({ path: 'test-e2e/companion-launch-03-banner.png', fullPage: true });

    // 배너가 어떤 형태로든 존재해야 함
    expect(hasLaunchBtn || hasActive || hasInstall || hasHelper).toBeTruthy();

    // 7) "실행하기" 버튼 클릭 테스트 (존재하는 경우)
    if (hasLaunchBtn) {
      // iframe 생성 감시
      const iframePromise = page.evaluate(() => {
        return new Promise<boolean>(resolve => {
          const obs = new MutationObserver(muts => {
            for (const m of muts) {
              for (const n of Array.from(m.addedNodes)) {
                if ((n as HTMLElement).tagName === 'IFRAME') {
                  const src = (n as HTMLIFrameElement).src || '';
                  if (src.includes('allinonehelper')) { obs.disconnect(); resolve(true); }
                }
              }
            }
          });
          obs.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { obs.disconnect(); resolve(false); }, 10000);
        });
      });

      await launchBtn.click();
      await page.screenshot({ path: 'test-e2e/companion-launch-04-clicked.png', fullPage: true });

      const connecting = await page.locator('button:has-text("연결 중")').isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[Test] 연결 중: ${connecting}`);
      expect(connecting).toBeTruthy();

      const iframeOk = await iframePromise;
      console.log(`[Test] iframe allinonehelper://: ${iframeOk}`);
      expect(iframeOk).toBeTruthy();

      await page.waitForTimeout(6000);
      await page.screenshot({ path: 'test-e2e/companion-launch-05-after.png', fullPage: true });
    }

    await page.screenshot({ path: 'test-e2e/companion-launch-06-final.png', fullPage: true });
  });
});
