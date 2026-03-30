/**
 * #909 E2E 테스트: 영상 업로드 후 Evolink 잔액 부족 시 사용자 친화적 에러 표시 검증
 *
 * 시나리오:
 * 1. 로그인 → 채널/영상 분석 → 영상 분석실
 * 2. 테스트 영상 업로드 → All TTS 프리셋 선택 → 분석 실행
 * 3. 분석 결과 또는 에러 메시지 확인
 *    - 잔액 부족 시: "AI 분석 크레딧이 부족합니다" 메시지 (raw API 에러 아님)
 *    - 정상 시: 분석 결과 표시
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

// .env.local 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

test.describe('#909 Evolink 잔액 부족 시 에러 메시지 개선', () => {
  test('영상 업로드 + All TTS 분석 — 에러 메시지에 raw API 노출 없음', async ({ page }) => {
    test.setTimeout(180_000); // 3분

    // ── Step 0: 테스트 영상 생성 (FFmpeg) ──
    const testVideoPath = path.resolve(__dirname, 'test-video-909.mp4');
    if (!fs.existsSync(testVideoPath)) {
      try {
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=red:s=320x240:r=29.97:d=1.5,format=yuv420p[v0];color=c=blue:s=320x240:r=29.97:d=1.5,format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0" -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -c:a aac -shortest "${testVideoPath}"`,
          { timeout: 30_000 }
        );
      } catch {
        // FFmpeg 없으면 최소 MP4 생성
        execSync(
          `ffmpeg -y -f lavfi -i testsrc=duration=3:size=320x240:rate=30 -c:v libx264 "${testVideoPath}"`,
          { timeout: 30_000 }
        );
      }
    }
    expect(fs.existsSync(testVideoPath)).toBe(true);

    // ── Step 1: 로그인 ──
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 프로덕션 서버 토큰 취득
    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json();
    expect(loginData.token).toBeTruthy();

    // localStorage 주입
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 로그인 확인
    await page.screenshot({ path: path.resolve(__dirname, '909-01-loggedin.png') });

    // ── Step 2: 채널/영상 분석 탭 이동 ──
    const channelTab = page.locator('button, [role="tab"]').filter({ hasText: /채널.*영상.*분석|영상.*분석/i });
    if (await channelTab.count() > 0) {
      await channelTab.first().click();
      await page.waitForTimeout(1000);
    }

    // 영상 분석실 하위 탭
    const videoRoomTab = page.locator('button, [role="tab"]').filter({ hasText: /영상 분석실|영상분석실/i });
    if (await videoRoomTab.count() > 0) {
      await videoRoomTab.first().click();
      await page.waitForTimeout(1000);
    }

    // 영상 업로드 모드 선택
    const uploadMode = page.locator('button, [role="tab"]').filter({ hasText: /영상 업로드/i });
    if (await uploadMode.count() > 0) {
      await uploadMode.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.resolve(__dirname, '909-02-video-room.png') });

    // ── Step 3: 영상 파일 업로드 ──
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(testVideoPath);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.resolve(__dirname, '909-03-uploaded.png') });

    // ── Step 4: All TTS 프리셋 선택 ──
    const allttsBtn = page.locator('button, div[role="button"]').filter({ hasText: /All TTS/i });
    if (await allttsBtn.count() > 0) {
      await allttsBtn.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.resolve(__dirname, '909-04-preset-selected.png') });

    // ── Step 5: 분석 실행 ──
    const analyzeBtn = page.locator('button').filter({ hasText: /분석|시작|실행|Analyze/i });
    if (await analyzeBtn.count() > 0) {
      await analyzeBtn.first().click();
    }

    // API 응답 대기 (최대 120초)
    try {
      await page.waitForResponse(
        resp => resp.url().includes('evolink') || resp.url().includes('kie.ai'),
        { timeout: 120_000 }
      );
    } catch {
      // 타임아웃 허용 — 에러 메시지만 확인하면 됨
    }

    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.resolve(__dirname, '909-05-after-analysis.png') });

    // ── Step 6: 결과 검증 ──
    // 에러가 발생한 경우 → raw API 에러가 아닌 사용자 친화적 메시지인지 확인
    const errorPanel = page.locator('[class*="red"], [class*="error"]').filter({ hasText: /분석|오류|실패|에러/i });
    const bodyText = await page.textContent('body') || '';

    // ▶ 핵심 검증: raw API 에러가 UI에 노출되지 않아야 함
    const rawApiPatterns = [
      'request id:',
      'evo_api_error',
      'insufficient_user_quota',
      'v1beta 프레임 분석 오류',
      'v1beta 비디오 분석 오류',
    ];

    for (const pattern of rawApiPatterns) {
      expect(bodyText).not.toContain(pattern);
    }

    // 에러가 있다면 사용자 친화적 메시지여야 함
    if (await errorPanel.count() > 0) {
      const errorText = await errorPanel.first().textContent() || '';
      console.log('[909] 에러 메시지:', errorText);

      // 잔액 부족 에러라면 친화적 메시지 확인
      if (errorText.includes('크레딧') || errorText.includes('잔액')) {
        expect(errorText).toContain('크레딧이 부족합니다');
        // raw 에러 패턴 없어야 함
        expect(errorText).not.toContain('request id');
        expect(errorText).not.toContain('evo_api_error');
      }
    }

    // 분석이 성공한 경우 → 결과가 표시되어야 함
    const hasResult = bodyText.includes('버전') || bodyText.includes('편집점') || bodyText.includes('장면');
    const hasError = bodyText.includes('분석 실패') || bodyText.includes('오류');

    // 결과든 에러든 하나는 있어야 함 (아무 반응 없으면 문제)
    expect(hasResult || hasError).toBe(true);

    await page.screenshot({ path: path.resolve(__dirname, '909-06-final.png') });

    // 스크린샷 파일 크기 검증
    const screenshots = [
      '909-01-loggedin.png', '909-02-video-room.png', '909-03-uploaded.png',
      '909-04-preset-selected.png', '909-05-after-analysis.png', '909-06-final.png'
    ];
    for (const ss of screenshots) {
      const ssPath = path.resolve(__dirname, ss);
      if (fs.existsSync(ssPath)) {
        const size = fs.statSync(ssPath).size;
        expect(size).toBeGreaterThan(1000); // 1KB 이상
      }
    }

    console.log('[909] 테스트 완료 — raw API 에러 노출 없음 확인');
  });
});
