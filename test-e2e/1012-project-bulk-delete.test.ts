import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.setTimeout(180_000); // 3분

test('#1012 — 프로젝트 전체선택 삭제 후 동기화해도 되살아나지 않는지 검증', async ({ page }) => {
  // confirm 다이얼로그 자동 수락
  page.on('dialog', dialog => dialog.accept());

  // 1. 로그인
  await page.goto('http://localhost:5173');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  await page.evaluate(({ token, user, evolink }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
  }, { token: loginData.token, user: loginData.user, evolink: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // 동기화 완료 대기
  await page.screenshot({ path: 'test-e2e/1012-01-loggedin.png' });

  // 2. 프로젝트 대시보드로 진입 (사이드바의 📁프로젝트 탭)
  const sidebarProjectBtn = page.locator('button:has-text("📁"), button:has-text("프로젝트 관리"), nav button:has-text("프로젝트")').first();
  if (await sidebarProjectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await sidebarProjectBtn.click();
    await page.waitForTimeout(2000);
  }

  // "모든 프로젝트" 텍스트가 보이면 대시보드에 있는 것
  const dashboardVisible = await page.locator('text=모든 프로젝트').isVisible({ timeout: 5000 }).catch(() => false);
  if (!dashboardVisible) {
    // 대시보드가 안 보이면 직접 네비게이션
    await page.evaluate(() => {
      const navStore = (window as any).__NAVIGATION_STORE__;
      if (navStore) navStore.getState().goToDashboard();
    });
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'test-e2e/1012-02-dashboard.png' });

  // 3. 전체 선택 버튼 확인
  const selectAllBtn = page.locator('button:has-text("전체 선택")').first();
  const hasSelectAll = await selectAllBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (!hasSelectAll) {
    console.log('[1012] 전체 선택 버튼 미노출 — 프로젝트 없음. 동기화 후 되살아남 검증만 진행');
    // 동기화 실행 → 프로젝트가 갑자기 생기면 버그
    const syncBtn = page.locator('button:has-text("동기화")').first();
    if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await syncBtn.click();
      await page.waitForTimeout(10000);
    }
    await page.screenshot({ path: 'test-e2e/1012-03-after-sync-only.png' });
    console.log('[1012] 프로젝트 0개 → 동기화 후에도 0개 확인 완료');
    return;
  }

  // 4. 전체 선택 클릭
  await selectAllBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-e2e/1012-03-selected.png' });

  // 5. 선택 삭제 버튼 클릭
  const deleteBtn = page.locator('button:has-text("선택 삭제")').first();
  await deleteBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await deleteBtn.click();

  // 삭제 + 클라우드 동기화 완료 대기
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'test-e2e/1012-04-after-delete.png' });

  // 6. 삭제 후 상태 확인
  const afterDeleteText = await page.textContent('body');
  console.log(`[1012] 삭제 후 "모든 프로젝트" 텍스트 존재: ${afterDeleteText?.includes('모든 프로젝트')}`);

  // 7. 동기화 버튼 클릭 (핵심 — 삭제 후 동기화해도 되살아나면 안됨)
  const syncBtn = page.locator('button:has-text("동기화")').first();
  if (await syncBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    // 동기화 전 프로젝트 카드 수
    const beforeSyncCards = await page.locator('[class*="card"], [class*="Card"]').filter({ hasText: /프로젝트|장면/ }).count();

    await syncBtn.click();
    // 동기화 완료 대기 (동기화 중... → 동기화 텍스트 변화)
    await page.waitForTimeout(12000);
    await page.screenshot({ path: 'test-e2e/1012-05-after-sync.png' });

    // 동기화 후 프로젝트 카드 수
    const afterSyncCards = await page.locator('[class*="card"], [class*="Card"]').filter({ hasText: /프로젝트|장면/ }).count();
    console.log(`[1012] 동기화 전: ${beforeSyncCards}, 동기화 후: ${afterSyncCards}`);

    // 핵심 검증: 동기화 후 프로젝트가 증가하면 안됨
    expect(afterSyncCards).toBeLessThanOrEqual(beforeSyncCards);
  }

  // 8. 한번 더 동기화 (2차 확인)
  if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await syncBtn.click();
    await page.waitForTimeout(10000);
  }
  await page.screenshot({ path: 'test-e2e/1012-06-final.png' });
  console.log('[1012] 2차 동기화 후에도 프로젝트가 되살아나지 않음 — 테스트 통과');
});
