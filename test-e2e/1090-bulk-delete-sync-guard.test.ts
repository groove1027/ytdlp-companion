import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.setTimeout(180_000); // 3분

/**
 * #1090 회귀 테스트 — 동기화 진행 중 bulk delete 잠금 검증
 *
 * 버그: 사용자가 백그라운드 sync 도중 "전체 선택 → 선택 삭제"를 누르면,
 * pauseSync는 진행 중 sync 완료까지 대기하기만 하고, 그 사이에 sync가
 * 새 프로젝트들을 다운로드해 IndexedDB가 갑자기 늘어남. 사용자에겐
 * "지운 게 갑자기 다시 생긴 것"처럼 보임.
 *
 * 수정: 동기화 중에는 bulk delete/select-all 버튼을 disabled로 잠그고,
 * 안내 배너를 노출. handleBulkDelete 진입 시에도 isSyncing 가드.
 *
 * 검증 순서:
 *   A. 로그인 → 대시보드 진입
 *   B. "동기화" 버튼 클릭으로 의도적으로 sync 트리거
 *   C. 즉시 캡처 → 다음을 검증:
 *      1) "동기화 중..." 배너 visible
 *      2) "선택 삭제" 버튼 disabled
 *      3) "전체 선택" 버튼 disabled
 *   D. sync 완료 대기 → 버튼이 다시 활성화되는지 검증 (선택지 size > 0이면)
 */
test('#1090 — 동기화 중 bulk delete 버튼 잠금 + 배너 노출', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());

  // 1) 로그인
  await page.goto('http://localhost:3000');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  expect(loginData.token).toBeTruthy();

  await page.evaluate(({ token, user, evolink }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
  }, { token: loginData.token, user: loginData.user, evolink: EVOLINK_KEY });

  await page.reload({ waitUntil: 'domcontentloaded' });
  // 초기 sync 완료 대기 (verifyToken → performFullSync)
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'test-e2e/1090-01-loggedin.png', fullPage: true });

  // 2) 프로젝트 대시보드로 이동
  const dashboardVisible = await page
    .locator('text=모든 프로젝트, text=총')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!dashboardVisible) {
    await page.evaluate(() => {
      const navStore = (window as any).__NAVIGATION_STORE__;
      if (navStore) navStore.getState().goToDashboard();
    });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: 'test-e2e/1090-02-dashboard.png', fullPage: true });

  // 3) 동기화 버튼 찾기
  const syncBtn = page.locator('button:has-text("동기화")').first();
  await expect(syncBtn).toBeVisible({ timeout: 5000 });

  // 4) 동기화 트리거 — sync 진행 중에 dashboard 가드가 작동하는지 검증
  await syncBtn.click();
  // React 리렌더 + isSyncing 반영 대기
  await page.waitForTimeout(150);

  // 5) [핵심] 동기화 진행 중 banner 노출 확인
  const syncBanner = page.locator('text=클라우드에서 프로젝트를 동기화 중입니다').first();
  await expect(syncBanner).toBeVisible({ timeout: 3000 });
  await page.screenshot({ path: 'test-e2e/1090-03-sync-banner-visible.png', fullPage: true });
  console.log('[1090] ✅ 동기화 배너 노출 확인');

  // 6) [핵심] "선택 삭제" 버튼이 disabled인지 확인
  const deleteBtn = page.locator('button:has-text("선택 삭제"), button:has-text("삭제 중")').first();
  await expect(deleteBtn).toBeVisible();
  const deleteDisabled = await deleteBtn.isDisabled();
  expect(deleteDisabled).toBe(true);
  console.log('[1090] ✅ 선택 삭제 버튼 disabled 확인');

  // 7) [핵심] "전체 선택" 버튼도 disabled인지 확인
  const selectAllBtn = page.locator('button:has-text("전체 선택"), button:has-text("전체 해제")').first();
  await expect(selectAllBtn).toBeVisible();
  const selectAllDisabled = await selectAllBtn.isDisabled();
  expect(selectAllDisabled).toBe(true);
  console.log('[1090] ✅ 전체 선택 버튼 disabled 확인');

  // 8) [방어] disabled 버튼을 force-click해도 handleBulkDelete가 실행되지 않아야 함
  // (만약 selectedIds가 0이면 어차피 진입 안하지만, 가드가 걸렸는지 별도 검증)
  // 여기선 force click 후 toast가 뜨거나 confirm 다이얼로그가 안 뜨는지로 간접 검증.
  // (selectedIds가 0인 상태라 가드보다 size 체크에서 먼저 return 되므로 toast 검증은 생략)

  // 9) sync 완료 대기 → 배너 사라지고 버튼 재활성화 확인
  // 58개 프로젝트 다운로드는 1~2분 걸릴 수 있으므로 충분한 timeout
  await syncBanner.waitFor({ state: 'hidden', timeout: 120_000 });
  // banner가 사라진 직후에도 React 리렌더 한 사이클 대기
  await page.waitForFunction(
    () => {
      const btns = Array.from(document.querySelectorAll('button')).filter(
        b => b.textContent?.includes('전체 선택') || b.textContent?.includes('전체 해제')
      );
      return btns.length > 0 && !(btns[0] as HTMLButtonElement).disabled;
    },
    { timeout: 10_000 }
  );
  await page.screenshot({ path: 'test-e2e/1090-04-after-sync.png', fullPage: true });

  // sync 완료 후 selectAll 버튼이 다시 활성화되어야 함
  const filteredCount = await page
    .locator('text=총')
    .first()
    .textContent()
    .catch(() => '');
  console.log(`[1090] 동기화 완료 후 표시: "${filteredCount}"`);
  const selectAllReenabled = await selectAllBtn.isDisabled();
  console.log(`[1090] sync 종료 후 전체 선택 disabled: ${selectAllReenabled}`);
  expect(selectAllReenabled).toBe(false);
  console.log('[1090] ✅ 동기화 종료 후 전체 선택 재활성화 확인');

  // 마지막 스크린샷
  await page.screenshot({ path: 'test-e2e/1090-05-final.png', fullPage: true });
  console.log('[1090] ✅ 모든 검증 통과');
});
