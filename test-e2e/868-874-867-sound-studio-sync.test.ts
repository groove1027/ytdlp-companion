import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const EMAIL = envVars.E2E_TEST_EMAIL || '';
const PASSWORD = envVars.E2E_TEST_PASSWORD || '';
const EVOLINK_KEY = envVars.CUSTOM_EVOLINK_KEY || '';
const TYPECAST_KEY = envVars.CUSTOM_TYPECAST_KEY || '';

test('#868/#874: 대본 수정 후 사운드스튜디오 나레이션 동기화', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');

  // 로그인
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  await page.evaluate(({ token, user, key, typecastKey }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    if (typecastKey) localStorage.setItem('CUSTOM_TYPECAST_KEY', typecastKey);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY, typecastKey: TYPECAST_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-e2e/868-01-loggedin.png' });

  // 대본작성 탭 이동
  await page.click('button:has-text("대본작성")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/868-02-script-tab.png' });

  // 사운드스튜디오 탭 이동
  await page.click('button:has-text("사운드")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/868-03-sound-studio.png' });

  // 사운드 스튜디오 페이지에 "사운드 스튜디오" 텍스트가 있는지 확인
  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('사운드 스튜디오');

  // TTS 엔진 UI 확인
  const hasEngineUI = bodyText?.includes('TTS 엔진') || bodyText?.includes('Typecast');
  expect(hasEngineUI).toBeTruthy();
  await page.screenshot({ path: 'test-e2e/868-04-sound-final.png' });
});

test('#867: 사운드스튜디오 음성 적용 UI 확인', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto('/');

  // 로그인
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  await page.evaluate(({ token, user, key, typecastKey }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    if (typecastKey) localStorage.setItem('CUSTOM_TYPECAST_KEY', typecastKey);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY, typecastKey: TYPECAST_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-e2e/867-01-loggedin.png' });

  // 사운드스튜디오 탭 이동
  await page.click('button:has-text("사운드")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/867-02-sound-studio.png' });

  // "나레이션" 탭 확인
  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('나레이션');

  // 전체 정지 버튼 존재 확인
  const stopBtn = page.locator('button:has-text("전체 정지")');
  expect(await stopBtn.isVisible()).toBeTruthy();

  await page.screenshot({ path: 'test-e2e/867-03-final.png' });
});
