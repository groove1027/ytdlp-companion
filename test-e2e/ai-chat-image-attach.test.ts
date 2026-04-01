import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('AI Chat 이미지 첨부', () => {
  test.setTimeout(120_000);

  test('📎 버튼 → 이미지 첨부 → Gemini에 이미지 전송 → 응답 확인', async ({ page }) => {
    // 1. 로그인
    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 2. AI Chat 탭 진입
    const toolboxBtn = page.locator('button:has-text("도구모음")');
    await toolboxBtn.click();
    await page.waitForTimeout(500);
    const aiChatBtn = page.locator('button:has-text("AI Chat")');
    await aiChatBtn.click();
    await page.waitForTimeout(1000);

    // before 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-img-01-before.png', fullPage: false });

    // 3. 📎 버튼으로 이미지 첨부
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-e2e/test-image.png');
    await page.waitForTimeout(500);

    // 이미지 미리보기 확인
    const preview = page.locator('img[alt="첨부 1"]');
    await expect(preview).toBeVisible({ timeout: 5000 });

    // 이미지 첨부 후 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-img-02-attached.png', fullPage: false });

    // 4. 텍스트 입력 + 전송
    const textarea = page.locator('textarea[placeholder*="이미지에 대해"]');
    await textarea.fill('이 이미지의 색상이 무엇인지 한 단어로 대답해줘.');

    const sendBtn = page.locator('button:has-text("전송")');
    await sendBtn.click();

    // 5. API 응답 대기
    await page.waitForResponse(
      resp => resp.url().includes('evolink.ai') || resp.url().includes('kie.ai'),
      { timeout: 60000 }
    );
    await page.waitForTimeout(5000);

    // 6. 응답 확인 — 사용자 메시지에 이미지가 표시되는지
    const userBubble = page.locator('.justify-end .max-w-\\[75\\%\\]').first();
    const userImg = userBubble.locator('img');
    await expect(userImg).toBeVisible({ timeout: 5000 });

    // assistant 응답 존재 확인
    const assistantBubbles = page.locator('.justify-start .max-w-\\[75\\%\\]');
    const count = await assistantBubbles.count();
    expect(count).toBeGreaterThanOrEqual(1);
    const responseText = await assistantBubbles.last().textContent();
    expect(responseText!.length).toBeGreaterThan(1);

    // after 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-img-03-response.png', fullPage: false });

    // 7. Claude 모델로 전환 → 📎 버튼 비활성화 확인
    const modelSelect = page.locator('select');
    await modelSelect.selectOption('claude-sonnet-4-6');
    await page.waitForTimeout(500);

    const clipBtn = page.locator('button[title*="Claude"]');
    await expect(clipBtn).toBeDisabled();

    // Claude 상태 스크린샷
    await page.screenshot({ path: 'test-e2e/ai-chat-img-04-claude-disabled.png', fullPage: false });

    console.log('[AI Chat Image] ✅ 이미지 첨부 전체 흐름 검증 완료');
  });
});
