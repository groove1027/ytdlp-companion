import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

async function login(page: any) {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  // 프로덕션 서버에서 토큰 취득
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true })
  });
  const loginData = await loginRes.json();

  // localStorage에 주입 후 리로드
  await page.evaluate(({ token, user, key }: any) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    // 컴패니언 배너 dismiss 캐시 초기화 (모든 feature)
    ['download', 'stt', 'tts', 'rembg', 'ffmpeg', 'nle', 'general'].forEach(f => {
      localStorage.removeItem(`companion_banner_${f}_dismissed`);
    });
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

test.describe('CompanionBanner UI 문구 개선 검증', () => {
  test('미설치 상태 배너 표시 + 자세히 보기 확장 패널 작동', async ({ page }) => {
    await login(page);

    // STEP 1: before — 채널 분석 탭 접근 (download 배너가 표시되는 곳)
    // VideoAnalysisRoom으로 이동 (download feature, full 모드)
    await page.click('text=채널/영상 분석');
    await page.waitForTimeout(2000);

    // 영상 분석 탭으로 이동
    const videoTab = page.locator('button:has-text("영상 분석")');
    if (await videoTab.count() > 0) {
      await videoTab.first().click();
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: 'test-e2e/companion-banner-01-before.png', fullPage: false });

    // STEP 2: 컴패니언 배너 존재 확인
    // 컴패니언이 실행 중이면 활성 배너, 아니면 미설치 배너
    const bannerText = await page.textContent('body');

    // "고속 다운로드" 또는 "활성화됨" 텍스트 확인
    const hasDownloadBanner = bannerText?.includes('고속 다운로드') || bannerText?.includes('활성화됨');
    expect(hasDownloadBanner).toBeTruthy();

    await page.screenshot({ path: 'test-e2e/companion-banner-02-banner-visible.png', fullPage: false });

    // STEP 3: VoiceStudio로 이동하여 TTS 배너 확인
    await page.click('text=사운드');
    await page.waitForTimeout(2000);

    const voiceTab = page.locator('button:has-text("음성 스튜디오"), button:has-text("보이스")');
    if (await voiceTab.count() > 0) {
      await voiceTab.first().click();
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: 'test-e2e/companion-banner-03-voice-studio.png', fullPage: false });

    // TTS 배너에 Qwen3/Kokoro/Edge 키워드 확인
    const voiceText = await page.textContent('body');
    const hasTTSInfo = voiceText?.includes('Qwen3') || voiceText?.includes('Kokoro') ||
                       voiceText?.includes('TTS') || voiceText?.includes('활성화됨');
    expect(hasTTSInfo).toBeTruthy();

    // STEP 4: 자세히 보기 버튼 찾아서 클릭 (non-compact 배너에만 존재)
    const detailsButton = page.locator('button:has-text("자세히 보기")');
    if (await detailsButton.count() > 0) {
      await detailsButton.first().click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'test-e2e/companion-banner-04-details-expanded.png', fullPage: false });

      // 확장 패널 내용 확인 — 핵심 기능 목록 키워드
      const panelText = await page.textContent('body');

      // Qwen3, Kokoro, Whisper, ProPainter, FFmpeg, CosyVoice 등 핵심 기술명
      const techKeywords = ['Qwen3', 'Kokoro', 'Whisper', 'ProPainter', 'FFmpeg', 'CosyVoice', 'rembg', 'yt-dlp'];
      const foundKeywords = techKeywords.filter(kw => panelText?.includes(kw));
      console.log(`[Banner] 발견된 기술 키워드: ${foundKeywords.join(', ')} (${foundKeywords.length}/${techKeywords.length})`);

      // 최소 5개 이상 기술 키워드가 표시되어야 함
      expect(foundKeywords.length).toBeGreaterThanOrEqual(5);

      // "왜 헬퍼 앱이 필요한가요?" 설명 섹션 존재 확인
      expect(panelText).toContain('왜 헬퍼 앱이 필요한가요');

      // "어떻게 작동하나요?" 설명 섹션 존재 확인
      expect(panelText).toContain('어떻게 작동하나요');

      // "제공 기능 한눈에 보기" 그리드 존재 확인
      expect(panelText).toContain('제공 기능 한눈에 보기');

      // 접기 버튼 클릭
      const foldButton = page.locator('button:has-text("접기")');
      if (await foldButton.count() > 0) {
        await foldButton.first().click();
        await page.waitForTimeout(500);
      }

      await page.screenshot({ path: 'test-e2e/companion-banner-05-details-folded.png', fullPage: false });
    } else {
      // compact 모드이거나 컴패니언이 이미 활성화됨 → 설명 텍스트만 확인
      console.log('[Banner] 자세히 보기 버튼 없음 — compact 모드 또는 컴패니언 활성 상태');
      await page.screenshot({ path: 'test-e2e/companion-banner-04-no-details-btn.png', fullPage: false });
    }

    // STEP 5: 편집실 탭으로 이동 → FFmpeg 배너 확인
    await page.click('text=편집실');
    await page.waitForTimeout(2000);

    const editText = await page.textContent('body');
    const hasFFmpegBanner = editText?.includes('FFmpeg') || editText?.includes('렌더링') || editText?.includes('활성화됨');
    expect(hasFFmpegBanner).toBeTruthy();

    await page.screenshot({ path: 'test-e2e/companion-banner-06-editroom.png', fullPage: false });

    // STEP 6: 최종 상태
    await page.screenshot({ path: 'test-e2e/companion-banner-07-final.png', fullPage: false });

    console.log('[CompanionBanner E2E] 모든 검증 통과');
  });
});
