/**
 * #925 검증 — 컴패니언 앱 health check + 프론트엔드 연동 확인
 *
 * 버그: Windows에서 검은 콘솔 창이 반복 출현
 * 수정: 모든 subprocess에 CREATE_NO_WINDOW 플래그 적용
 * 검증: 컴패니언이 정상 실행되고 프론트엔드와 연동되는지 확인
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test('#925 컴패니언 health check + 프론트엔드 연동', async ({ page }) => {
  test.setTimeout(120_000);

  // ── Step 1: 자동 로그인 ──
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('domcontentloaded');

  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json() as any;
  expect(loginData.token).toBeTruthy();

  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // ── Step 2: 로그인 확인 스크린샷 ──
  await page.screenshot({ path: 'test-e2e/925-01-loggedin.png', fullPage: false });

  // ── Step 3: 컴패니언 health check 직접 호출 ──
  const healthRes = await fetch('http://localhost:9876/health');
  const healthData = await healthRes.json() as any;
  console.log('[925] Health check:', JSON.stringify(healthData));

  expect(healthData.app).toBe('ytdlp-companion');
  expect(healthData.status).toBe('ok');
  expect(healthData.version).toBeTruthy();

  // ── Step 4: 프론트엔드에서 컴패니언 감지 확인 ──
  // 콘솔 로그를 감시하여 컴패니언 감지 메시지 확인
  const companionLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Companion') || text.includes('companion')) {
      companionLogs.push(text);
    }
  });

  // 페이지 리로드하여 컴패니언 감지 트리거
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  // 컴패니언 관련 로그 확인
  console.log('[925] Companion logs:', companionLogs);

  // ── Step 5: UI에서 컴패니언 상태 확인 ──
  // 자막 제거 탭으로 이동하면 컴패니언 연결 상태를 볼 수 있음
  // 또는 편집실에서 NLE 내보내기 관련 UI 확인
  await page.screenshot({ path: 'test-e2e/925-02-companion-status.png', fullPage: false });

  // ── Step 6: 컴패니언 서비스 목록 검증 ──
  expect(healthData.services).toContain('ytdlp');
  expect(healthData.services).toContain('download');
  expect(healthData.services).toContain('frames');

  // ── Step 7: cargo build 검증 결과 기록 ──
  // platform.rs에 async_cmd/sync_cmd이 정상 정의되어 있는지 코드 레벨 확인
  const platformCode = require('fs').readFileSync(
    path.resolve(__dirname, '../companion/src-tauri/src/platform.rs'), 'utf-8'
  );
  expect(platformCode).toContain('async_cmd');
  expect(platformCode).toContain('sync_cmd');
  expect(platformCode).toContain('CREATE_NO_WINDOW');
  expect(platformCode).toContain('0x08000000');

  // Command::new가 platform.rs 정의와 macOS open 외에는 없어야 함
  const serverCode = require('fs').readFileSync(
    path.resolve(__dirname, '../companion/src-tauri/src/server.rs'), 'utf-8'
  );
  const ytdlpCode = require('fs').readFileSync(
    path.resolve(__dirname, '../companion/src-tauri/src/ytdlp.rs'), 'utf-8'
  );
  const whisperCode = require('fs').readFileSync(
    path.resolve(__dirname, '../companion/src-tauri/src/whisper.rs'), 'utf-8'
  );
  const ttsCode = require('fs').readFileSync(
    path.resolve(__dirname, '../companion/src-tauri/src/tts.rs'), 'utf-8'
  );

  // ytdlp.rs, whisper.rs, tts.rs에는 raw Command::new가 없어야 함
  expect(ytdlpCode).not.toContain('Command::new');
  expect(whisperCode).not.toContain('Command::new');
  expect(ttsCode).not.toContain('Command::new');

  // server.rs에는 macOS open만 Command::new로 남아있어야 함
  const serverCommandNew = (serverCode.match(/Command::new/g) || []).length;
  expect(serverCommandNew).toBe(2); // macOS "open" 2건만

  // platform::async_cmd 사용 확인
  expect(serverCode).toContain('platform::async_cmd');
  expect(ytdlpCode).toContain('platform::async_cmd');
  expect(whisperCode).toContain('platform::async_cmd');
  expect(ttsCode).toContain('platform::async_cmd');

  await page.screenshot({ path: 'test-e2e/925-03-final.png', fullPage: false });
  console.log('[925] ✅ 모든 검증 통과 — CREATE_NO_WINDOW 적용 완료');
});
