import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('AI Chat 플레이그라운드', () => {
  test.setTimeout(120_000);

  test('도구모음 → AI Chat 탭 진입 → 메시지 전송 → 스트리밍 응답 확인', async ({ page }) => {
    // 1. 프로덕션 서버에서 토큰 취득
    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();

    // 2. 앱 접속 + localStorage 주입
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // before 스크린샷 — 로그인 완료 상태
    await page.screenshot({ path: 'test-e2e/ai-chat-01-loggedin.png', fullPage: false });

    // 3. 도구모음 열기
    const toolboxBtn = page.locator('button:has-text("도구모음")');
    await toolboxBtn.click();
    await page.waitForTimeout(500);

    // 4. AI Chat 클릭
    const aiChatBtn = page.locator('button:has-text("AI Chat")');
    await expect(aiChatBtn).toBeVisible({ timeout: 5000 });
    await aiChatBtn.click();
    await page.waitForTimeout(1000);

    // AI Chat 탭 진입 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-02-tab-entered.png', fullPage: false });

    // 5. 빈 상태 확인 — "AI Chat 플레이그라운드" 텍스트
    const heading = page.locator('h2:has-text("AI Chat 플레이그라운드")');
    await expect(heading).toBeVisible({ timeout: 5000 });

    // 6. 메시지 입력 + 전송
    const textarea = page.locator('textarea[placeholder*="메시지를 입력"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('안녕! 1+1은 뭐야? 한 줄로 대답해줘.');

    // 전송 전 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-03-before-send.png', fullPage: false });

    // 전송 버튼 클릭
    const sendBtn = page.locator('button:has-text("전송")');
    await sendBtn.click();

    // 7. 스트리밍 응답 대기 — assistant 메시지 DOM 생성 확인
    // 실제 API 호출이므로 충분히 대기
    await page.waitForResponse(
      resp => resp.url().includes('evolink.ai') || resp.url().includes('kie.ai'),
      { timeout: 60000 }
    );

    // 응답 내용이 나타날 때까지 대기
    await page.waitForTimeout(5000);

    // 8. 응답 확인 — assistant 메시지 bubble이 존재하고 내용이 있는지
    const assistantBubbles = page.locator('.justify-start .max-w-\\[75\\%\\]');
    const count = await assistantBubbles.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const lastBubble = assistantBubbles.last();
    const responseText = await lastBubble.textContent();
    expect(responseText!.length).toBeGreaterThan(5); // 실질적 응답 있는지

    // after 스크린샷 — 응답 표시됨
    await page.screenshot({ path: 'test-e2e/ai-chat-04-response.png', fullPage: false });

    // 9. 모델 선택 변경 확인
    const modelSelect = page.locator('select');
    await modelSelect.selectOption('gemini-3.1-flash-lite-preview');
    await page.waitForTimeout(500);

    // 모델 변경 후 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-05-model-changed.png', fullPage: false });

    // 10. 새 대화 버튼 클릭
    const newChatBtn = page.locator('button:has-text("새 대화")').first();
    await newChatBtn.click();
    await page.waitForTimeout(500);

    // 11. 대화 기록 열기
    const historyBtn = page.locator('button[title="대화 기록"]');
    await historyBtn.click();
    await page.waitForTimeout(500);

    // 기록에 이전 대화가 보이는지 확인
    const sessionItems = page.locator('.w-64 .truncate');
    const sessionCount = await sessionItems.count();
    expect(sessionCount).toBeGreaterThanOrEqual(1);

    // 최종 스크린샷 — 대화 기록 패널 + 전체 UI
    await page.screenshot({ path: 'test-e2e/ai-chat-99-final.png', fullPage: false });

    console.log('[AI Chat E2E] ✅ 전체 흐름 검증 완료');
  });
});
