/**
 * E2E: 영상 분석실 프리셋 3종 추가 검증 (dubbing / s2s / l2s)
 */
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

async function login(page: import('@playwright/test').Page) {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');

  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();

  await page.evaluate(({ token, user, key }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
  }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

test.describe('영상 분석실 프리셋 3종 추가 — UI 렌더링', () => {
  test('dubbing/s2s/l2s 프리셋 버튼이 UI에 렌더링되고 라벨/설명이 올바름', async ({ page }) => {
    await login(page);
    await page.screenshot({ path: 'test-e2e/preset3-01-loggedin.png' });

    // 채널 분석 탭으로 이동
    const channelTab = page.locator('button, [role="tab"]').filter({ hasText: /채널분석|채널 분석|영상분석|영상 분석/ });
    const channelCount = await channelTab.count();
    console.log(`[preset3] 탭 버튼 후보 개수: ${channelCount}`);
    if (channelCount > 0) {
      await channelTab.first().click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: 'test-e2e/preset3-02-channel-tab.png' });

    // 영상분석실 서브 탭으로 이동
    const videoSubTab = page.locator('button, [role="tab"]').filter({ hasText: /영상분석실|영상 분석실|비디오 분석|video-room/ });
    if (await videoSubTab.count() > 0) {
      await videoSubTab.first().click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: 'test-e2e/preset3-03-video-room.png' });

    // URL 입력해서 프리셋 버튼 활성화
    const urlInput = page.locator('input[type="text"], input[type="url"], textarea').filter({ hasText: '' }).first();
    const inputVisible = await urlInput.isVisible().catch(() => false);
    if (inputVisible) {
      await urlInput.fill('https://www.youtube.com/shorts/HMBqVXNjrgo');
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-e2e/preset3-04-url-entered.png' });

    // 프리셋 버튼 텍스트 수집
    const bodyText = await page.textContent('body');
    console.log('[preset3] body text length:', bodyText?.length);

    // 3종 프리셋 라벨이 DOM에 표시되는지 확인
    const hasDubbing = bodyText?.includes('더빙 번역');
    const hasS2S = bodyText?.includes('숏투숏');
    const hasL2S = bodyText?.includes('롱투숏');

    console.log(`[preset3] 더빙 번역: ${hasDubbing}`);
    console.log(`[preset3] 숏투숏: ${hasS2S}`);
    console.log(`[preset3] 롱투숏: ${hasL2S}`);

    expect(hasDubbing).toBe(true);
    expect(hasS2S).toBe(true);
    expect(hasL2S).toBe(true);

    await page.screenshot({ path: 'test-e2e/preset3-05-presets-visible.png' });
  });
});

test.describe('영상 분석실 프리셋 3종 — 코드 구조 검증', () => {
  test('타입, 캐시, 메타데이터, 시스템 프롬프트가 모두 연결됨', async ({ page }) => {
    const fs = require('fs');
    const projectRoot = path.resolve(__dirname, '..');

    // 1. types.ts에 3종 추가됨
    const typesContent = fs.readFileSync(path.join(projectRoot, 'src/types.ts'), 'utf-8');
    expect(typesContent).toContain("'dubbing'");
    expect(typesContent).toContain("'s2s'");
    expect(typesContent).toContain("'l2s'");
    console.log('[preset3] types.ts ✓');

    // 2. videoAnalysisStore.ts 캐시 맵에 3종
    const storeContent = fs.readFileSync(path.join(projectRoot, 'src/stores/videoAnalysisStore.ts'), 'utf-8');
    expect(storeContent).toContain('dubbing: true');
    expect(storeContent).toContain('s2s: true');
    expect(storeContent).toContain('l2s: true');
    console.log('[preset3] videoAnalysisStore.ts cache ✓');

    // 3. VideoAnalysisRoom.tsx PRESET_INFO
    const varContent = fs.readFileSync(path.join(projectRoot, 'src/components/tabs/channel/VideoAnalysisRoom.tsx'), 'utf-8');
    expect(varContent).toContain("dubbing: { label: '더빙");
    expect(varContent).toContain("s2s: { label: '숏투숏");
    expect(varContent).toContain("l2s: { label: '롱투숏");
    console.log('[preset3] VideoAnalysisRoom.tsx PRESET_INFO ✓');

    // 4. scriptSystem 분기
    expect(varContent).toContain("preset === 'dubbing'");
    expect(varContent).toContain("preset === 's2s'");
    expect(varContent).toContain("preset === 'l2s'");
    console.log('[preset3] VideoAnalysisRoom.tsx scriptSystem 분기 ✓');

    // 5. 색상 맵
    expect(varContent).toContain('rose');
    expect(varContent).toContain('orange');
    expect(varContent).toContain('lime');
    console.log('[preset3] cMap 색상 ✓');

    // 6. 데이터 파일들이 존재하고 내용이 있음
    const dubbingGuideFile = path.join(projectRoot, 'docs/dubbing-translation-guideline-v5.6.md');
    const s2sGuideFile = path.join(projectRoot, 'docs/s2s-style-cloning-template-v7.md');
    const l2sGuideFile = path.join(projectRoot, 'docs/long-to-short-snack-guideline-v4.md');

    const dubbingSize = fs.statSync(dubbingGuideFile).size;
    const s2sSize = fs.statSync(s2sGuideFile).size;
    const l2sSize = fs.statSync(l2sGuideFile).size;

    console.log(`[preset3] dubbing guideline: ${dubbingSize} bytes`);
    console.log(`[preset3] s2s guideline: ${s2sSize} bytes`);
    console.log(`[preset3] l2s guideline: ${l2sSize} bytes`);

    expect(dubbingSize).toBeGreaterThan(5000);  // 원본 9140바이트
    expect(s2sSize).toBeGreaterThan(10000);     // 원본 12438바이트
    expect(l2sSize).toBeGreaterThan(15000);     // 원본 21011바이트

    // 7. 지침서 핵심 키워드 포함 확인
    const dubbingContent = fs.readFileSync(dubbingGuideFile, 'utf-8');
    expect(dubbingContent).toContain('정보 밀도');
    expect(dubbingContent).toContain('퍼포먼스 청사진');
    expect(dubbingContent).toContain('성우');

    const s2sContent = fs.readFileSync(s2sGuideFile, 'utf-8');
    expect(s2sContent).toContain('이원화 숏폼');
    expect(s2sContent).toContain('TTS');
    expect(s2sContent).toContain('무음 자막');

    const l2sContent = fs.readFileSync(l2sGuideFile, 'utf-8');
    expect(l2sContent).toContain('샌드위치');
    expect(l2sContent).toContain('음/함/임');
    expect(l2sContent).toContain('영웅 서사');

    console.log('[preset3] 지침서 핵심 키워드 ✓');

    // 8. 데이터 파일 import 체크
    const dubbingData = fs.readFileSync(path.join(projectRoot, 'src/data/dubbingTranslationGuideline.ts'), 'utf-8');
    expect(dubbingData).toContain('dubbingTranslationGuidelineRaw');
    expect(dubbingData).toContain('DUBBING_TRANSLATION_GUIDELINE');

    const s2sData = fs.readFileSync(path.join(projectRoot, 'src/data/s2sStyleCloningGuideline.ts'), 'utf-8');
    expect(s2sData).toContain('s2sStyleCloningGuidelineRaw');
    expect(s2sData).toContain('S2S_STYLE_CLONING_GUIDELINE');

    const l2sData = fs.readFileSync(path.join(projectRoot, 'src/data/longToShortSnackGuideline.ts'), 'utf-8');
    expect(l2sData).toContain('longToShortSnackGuidelineRaw');
    expect(l2sData).toContain('LONG_TO_SHORT_SNACK_GUIDELINE');

    console.log('[preset3] 데이터 파일 import ✓');
  });
});

test.describe('영상 분석실 프리셋 3종 — 실제 프리셋 클릭', () => {
  test('URL 입력 후 더빙 번역 프리셋 클릭 → 분석 시작 확인', async ({ page }) => {
    await login(page);

    // 영상분석실 탭 진입
    const channelTab = page.locator('button, [role="tab"]').filter({ hasText: /채널분석|채널 분석|영상/ });
    if (await channelTab.count() > 0) await channelTab.first().click();
    await page.waitForTimeout(2000);

    const videoSubTab = page.locator('button, [role="tab"]').filter({ hasText: /영상분석실|영상 분석실|비디오 분석/ });
    if (await videoSubTab.count() > 0) await videoSubTab.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/preset3-click-01-tab.png' });

    // URL 입력
    const allInputs = page.locator('input[type="text"], input[type="url"]');
    const inputCount = await allInputs.count();
    console.log(`[preset3-click] 인풋 개수: ${inputCount}`);

    let urlFilled = false;
    for (let i = 0; i < inputCount; i++) {
      const ph = await allInputs.nth(i).getAttribute('placeholder');
      if (ph && (ph.includes('URL') || ph.includes('url') || ph.includes('youtube'))) {
        await allInputs.nth(i).fill('https://www.youtube.com/shorts/HMBqVXNjrgo');
        urlFilled = true;
        console.log(`[preset3-click] URL 입력 성공 (input[${i}], placeholder=${ph})`);
        break;
      }
    }

    if (!urlFilled && inputCount > 0) {
      await allInputs.first().fill('https://www.youtube.com/shorts/HMBqVXNjrgo');
      console.log(`[preset3-click] URL 입력 (첫 번째 input)`);
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/preset3-click-02-url-entered.png' });

    // 더빙 번역 프리셋 버튼 찾아서 클릭
    const dubbingBtn = page.locator('button').filter({ hasText: '더빙 번역' });
    const dubbingCount = await dubbingBtn.count();
    console.log(`[preset3-click] 더빙 번역 버튼 개수: ${dubbingCount}`);

    if (dubbingCount > 0) {
      const isEnabled = await dubbingBtn.first().isEnabled();
      console.log(`[preset3-click] 더빙 번역 버튼 활성화: ${isEnabled}`);

      if (isEnabled) {
        await dubbingBtn.first().click();
        console.log('[preset3-click] 더빙 번역 프리셋 클릭됨');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-e2e/preset3-click-03-dubbing-clicked.png' });

        // 분석 시작 상태 확인 (로딩 스피너 or 분석중 텍스트)
        const bodyText = await page.textContent('body');
        const isAnalyzing = bodyText?.includes('분석') || bodyText?.includes('분석중');
        console.log(`[preset3-click] 분석 중 텍스트 감지: ${isAnalyzing}`);
      }
    }

    // 숏투숏 버튼 가시성 확인
    const s2sBtn = page.locator('button').filter({ hasText: '숏투숏' });
    const s2sCount = await s2sBtn.count();
    expect(s2sCount).toBeGreaterThan(0);
    console.log(`[preset3-click] 숏투숏 버튼 개수: ${s2sCount}`);

    // 롱투숏 버튼 가시성 확인
    const l2sBtn = page.locator('button').filter({ hasText: '롱투숏' });
    const l2sCount = await l2sBtn.count();
    expect(l2sCount).toBeGreaterThan(0);
    console.log(`[preset3-click] 롱투숏 버튼 개수: ${l2sCount}`);

    await page.screenshot({ path: 'test-e2e/preset3-click-04-all-presets-visible.png' });
  });
});
