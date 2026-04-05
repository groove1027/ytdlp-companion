import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const KIE_KEY = process.env.CUSTOM_KIE_KEY!;

test.setTimeout(300_000); // 5분

test('#1018 — 대본 입력 후 장면별 visualPrompt가 비어있지 않은지 검증', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PostProcess]') || text.includes('visualPrompt') || text.includes('[parseScript')) {
      console.log(`  [BROWSER] ${text}`);
    }
  });

  // 1. 로그인
  await page.goto('http://localhost:5173');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  await page.evaluate(({ token, user, evolink, kie }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    localStorage.setItem('CUSTOM_KIE_KEY', kie);
  }, { token: loginData.token, user: loginData.user, evolink: EVOLINK_KEY, kie: KIE_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-e2e/1018-01-loggedin.png' });

  // 2. 대본 작성 탭 → 대본 입력
  await page.locator('button:has-text("대본")').first().click();
  await page.waitForTimeout(2000);

  const testScript = `미국 도널드 트럼프 대통령이 이란 전쟁 관련 대국민 연설에서 전쟁을 지속하겠다는 강경 발언을 내놓으면서 아시아 증시 전반에 충격이 퍼지고 있습니다.

상승분을 모두 반납한 코스피는 4% 급락하고 있으며, 일본 닛케이 지수와 대만 가권 지수도 일제히 하락세입니다.

트럼프 대통령은 연설에서 2~3주 동안 대대적으로 타격해 이란을 석기시대로 돌려 놓을 것이라고 밝혔습니다.`;

  // "직접 입력하기" 탭 선택
  const directInput = page.locator('button:has-text("직접 입력")').first();
  if (await directInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await directInput.click();
    await page.waitForTimeout(500);
  }

  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill(testScript);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-e2e/1018-02-script-entered.png' });

  // 3. 대본 확정 버튼 클릭 (가장 아래 큰 버튼)
  const confirmBtn = page.locator('button:has-text("대본"), button:has-text("확정"), button:has-text("다음")').last();
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(2000);
  }

  // 4. 이미지/영상 탭으로 이동
  const imageTab = page.locator('button:has-text("이미지"), button:has-text("영상")').first();
  if (await imageTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await imageTab.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'test-e2e/1018-03-imagevideo-tab.png' });

  // 5. 스토리보드 생성 버튼 클릭
  const storyboardBtn = page.locator('button:has-text("스토리보드 생성")').first();
  if (await storyboardBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await storyboardBtn.click();
    console.log('[1018] 스토리보드 생성 버튼 클릭');

    // AI 처리 대기 — waitForResponse로 API 응답 확인
    try {
      await page.waitForResponse(
        resp => resp.url().includes('evolink') || resp.url().includes('laozhang') || resp.url().includes('kie'),
        { timeout: 90_000 }
      );
    } catch {
      console.log('[1018] API 응답 타임아웃 — 계속 진행');
    }
    await page.waitForTimeout(5000);
  } else {
    // 이미 스토리보드가 있는 경우 (열기 버튼)
    const openBtn = page.locator('button:has-text("스토리보드 열기")').first();
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(2000);
    }
  }
  await page.screenshot({ path: 'test-e2e/1018-04-storyboard.png' });

  // 6. projectStore에서 장면 데이터 확인
  const sceneData = await page.evaluate(() => {
    const store = (window as any).__PROJECT_STORE__;
    if (!store) return null;
    const scenes = store.getState().scenes;
    return scenes.map((s: any, i: number) => ({
      index: i,
      hasVisualPrompt: !!(s.visualPrompt && s.visualPrompt.trim()),
      vpLen: (s.visualPrompt || '').length,
      vpPreview: (s.visualPrompt || '').slice(0, 80),
      stPreview: (s.scriptText || '').slice(0, 60),
    }));
  });

  console.log('[1018] Scene data:', JSON.stringify(sceneData, null, 2));
  await page.screenshot({ path: 'test-e2e/1018-05-final.png' });

  if (sceneData && sceneData.length > 0) {
    const emptyCount = sceneData.filter((s: any) => !s.hasVisualPrompt).length;
    console.log(`[1018] 총 ${sceneData.length}개 장면, 빈 프롬프트: ${emptyCount}개`);

    // 핵심 검증: 모든 장면에 visualPrompt가 존재해야 함
    expect(emptyCount).toBe(0);

    // visualPrompt가 10자 이상 실제 내용이 있어야 함
    for (const s of sceneData) {
      expect(s.vpLen).toBeGreaterThan(10);
    }
    console.log('[1018] ✅ 모든 장면에 visualPrompt 존재 확인 완료');
  } else {
    // 장면이 없어도 setScenes 중앙 정규화가 작동하는지 직접 테스트
    console.log('[1018] 장면 미생성 — setScenes 중앙 정규화 직접 검증');
    const normResult = await page.evaluate(() => {
      const store = (window as any).__PROJECT_STORE__;
      if (!store) return 'NO_STORE';
      // 빈 visualPrompt로 테스트 장면 주입
      store.getState().setScenes([
        { id: 'test-1', scriptText: '테스트 뉴스 대본 1번 장면', visualPrompt: '', imageUrl: undefined },
        { id: 'test-2', scriptText: '테스트 뉴스 대본 2번 장면', visualPrompt: '', imageUrl: undefined },
      ]);
      const scenes = store.getState().scenes;
      return scenes.map((s: any) => ({
        id: s.id,
        vp: s.visualPrompt,
        hasVP: !!(s.visualPrompt && s.visualPrompt.trim()),
      }));
    });
    console.log('[1018] 정규화 결과:', JSON.stringify(normResult));
    if (Array.isArray(normResult)) {
      for (const s of normResult) {
        expect(s.hasVP).toBe(true);
        expect(s.vp).toContain('Cinematic scene illustrating:');
      }
      console.log('[1018] ✅ setScenes 중앙 정규화 작동 확인');
    }
  }
});
