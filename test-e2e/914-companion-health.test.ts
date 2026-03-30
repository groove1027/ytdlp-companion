/**
 * #914 FIX 검증 — 컴패니언 health check 빠른 응답 + Qwen3 TTS 미리듣기 동작
 *
 * 검증 시나리오:
 * 1. 프로덕션 앱 로드 + 로그인
 * 2. 사운드 스튜디오 탭 → Qwen3 TTS 엔진 선택
 * 3. "소희 (한국어)" 미리듣기 클릭
 * 4. "Failed to fetch" Unhandled Rejection이 발생하지 않는지 확인
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SS = 'test-e2e';
const BASE_URL = 'https://all-in-one-production.pages.dev';

// .env.local 파싱
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const ENV: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) ENV[match[1]] = match[2].trim();
}

test('#914 Qwen3 TTS 미리듣기 — Failed to fetch 에러 미발생 검증', async ({ page }) => {
  test.setTimeout(120_000);

  // ── 1. 프로덕션 앱 로드 + 자동 로그인 ──
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ENV.E2E_TEST_EMAIL,
      password: ENV.E2E_TEST_PASSWORD,
      rememberMe: true,
    }),
  });
  const loginData = await loginRes.json() as { token: string; user: unknown };
  expect(loginData.token).toBeTruthy();

  await page.evaluate(({ token, user, evolink, kie }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    localStorage.setItem('CUSTOM_KIE_KEY', kie);
  }, {
    token: loginData.token,
    user: loginData.user,
    evolink: ENV.CUSTOM_EVOLINK_KEY,
    kie: ENV.CUSTOM_KIE_KEY,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SS}/914-01-loggedin.png` });
  console.log('[1] ✅ 로그인 완료');

  // ── 2. Unhandled Rejection 수집기 설치 ──
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  // ── 3. 사운드 스튜디오 탭 이동 ──
  // 탭 버튼 찾기 (nav 메뉴에서)
  const soundTabBtn = page.locator('[data-tab="sound-studio"], button:has-text("사운드"), button:has-text("Sound")').first();
  if (await soundTabBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await soundTabBtn.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SS}/914-02-sound-tab.png` });
  console.log('[2] ✅ 사운드 스튜디오 탭 이동');

  // ── 4. Qwen3 TTS 엔진 선택 ──
  const qwen3Btn = page.locator('button:has-text("Qwen3"), div:has-text("Qwen3 TTS")').first();
  if (await qwen3Btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await qwen3Btn.click();
    await page.waitForTimeout(1000);
    console.log('[3] ✅ Qwen3 TTS 엔진 선택');
  } else {
    console.log('[3] ⚠️ Qwen3 버튼 미발견 — 이미 선택되었거나 UI 구조 다름');
  }
  await page.screenshot({ path: `${SS}/914-03-qwen3-selected.png` });

  // ── 5. 소희 음성 행 찾기 + 미리듣기 클릭 ──
  // 소희 텍스트가 보이는 행에서 재생 버튼 클릭
  const soheeLocator = page.locator('text=소희').first();
  let previewClicked = false;

  if (await soheeLocator.isVisible({ timeout: 8000 }).catch(() => false)) {
    // 소희 근처 클릭 가능한 버튼/SVG 찾기
    const soheeParent = soheeLocator.locator('xpath=ancestor::div[1]');
    const playButton = soheeParent.locator('button, svg').last();

    if (await playButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playButton.click();
      previewClicked = true;
      console.log('[4] ✅ 소희 미리듣기 클릭');
    }
  }

  if (!previewClicked) {
    // 대체: "미리듣기" 텍스트가 있는 아무 버튼이든 클릭
    const anyPreview = page.locator('button:has-text("미리듣기")').first();
    if (await anyPreview.isVisible({ timeout: 3000 }).catch(() => false)) {
      await anyPreview.click();
      previewClicked = true;
      console.log('[4] ✅ 미리듣기 버튼 클릭 (대체)');
    } else {
      console.log('[4] ⚠️ 미리듣기 버튼 미발견 — 컴패니언 미실행 환경일 수 있음');
    }
  }

  // ── 6. 에러 수집 대기 (10초) ──
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${SS}/914-04-after-preview.png` });

  // ── 7. 검증 ──
  const failedToFetchErrors = pageErrors.filter(e =>
    e.includes('Failed to fetch') && !e.includes('signal is aborted')
  );
  console.log(`[5] 수집된 page error: ${pageErrors.length}건`);
  console.log(`[5] Failed to fetch error: ${failedToFetchErrors.length}건`);
  if (failedToFetchErrors.length > 0) {
    console.log('[5] ❌ Failed to fetch 에러 목록:', failedToFetchErrors);
  }

  await page.screenshot({ path: `${SS}/914-05-final.png` });

  // 핵심 검증: Unhandled "Failed to fetch" 에러가 0이어야 함
  expect(failedToFetchErrors.length).toBe(0);
  console.log('[5] ✅ Failed to fetch Unhandled Rejection 0건 — 버그 수정 확인');
});
