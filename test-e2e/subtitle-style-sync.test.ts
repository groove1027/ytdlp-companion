/**
 * 자막 스타일 동기화 검증 — 타임라인 미리보기와 상세 편집기 간 폰트 크기 일치
 *
 * 검증 항목:
 * 1. 상세 편집기 열 때 현재 선택된 장면에서 시작하는지
 * 2. 9:16 세로 모드에서 폰트 크기 스케일이 캔버스 렌더러와 일치하는지
 * 3. 상세 편집기에서 폰트 변경 → 타임라인에도 즉시 반영되는지
 */
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

const RED_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function main() {
  console.log('\n========================================');
  console.log('  자막 스타일 동기화 검증 (타임라인 ↔ 상세편집)');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let passed = 0;
  let failed = 0;

  const check = (ok: boolean, msg: string) => {
    if (ok) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
  };

  try {
    // ═══════════════════════════════════════
    // STEP 1: 로그인 + 프로젝트 세팅
    // ═══════════════════════════════════════
    console.log('\n── STEP 1: 로그인 ──');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: object };
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-e2e/sub-sync-01-loggedin.png', fullPage: false });
    console.log('  📸 스크린샷 저장: sub-sync-01-loggedin.png');

    // ═══════════════════════════════════════
    // STEP 2: 9:16 세로 프로젝트 생성 + 장면 데이터 주입
    // ═══════════════════════════════════════
    console.log('\n── STEP 2: 9:16 세로 프로젝트 + 장면 주입 ──');

    // 프로젝트 스토어에 9:16 설정 + 장면 3개 주입
    await page.evaluate((img) => {
      const ps = (window as any).__PROJECT_STORE__;
      if (!ps) throw new Error('__PROJECT_STORE__ not found');
      const store = ps.getState();
      // 9:16 세로 프로젝트
      store.setConfig({ ...store.config, aspectRatio: '9:16' });
      // 3개 장면 세팅
      const scenes = [
        { id: 'scene-1', scriptText: '첫 번째 장면의 자막 텍스트입니다.', imageUrl: img, prompt: '' },
        { id: 'scene-2', scriptText: '두 번째 장면의 자막 텍스트.', imageUrl: img, prompt: '' },
        { id: 'scene-3', scriptText: '세 번째 장면 마지막 텍스트.', imageUrl: img, prompt: '' },
      ];
      store.setScenes(scenes);
    }, RED_PIXEL);
    await page.waitForTimeout(1000);

    // 편집실 탭으로 이동
    const editRoomTab = page.locator('button, a, [role="tab"]').filter({ hasText: /편집실/ });
    if (await editRoomTab.count() > 0) {
      await editRoomTab.first().click();
      await page.waitForTimeout(2000);
    }

    // editRoomStore에 sceneSubtitles + globalSubtitleStyle 세팅
    // sceneOrder는 immer 기반이라 직접 setState 사용
    await page.evaluate(() => {
      const ers = (window as any).__EDIT_ROOM_STORE__;
      if (!ers) throw new Error('__EDIT_ROOM_STORE__ not found');
      const store = ers.getState();

      // setState로 sceneOrder 직접 설정
      ers.setState({ sceneOrder: ['scene-1', 'scene-2', 'scene-3'] });

      store.setSceneSubtitle('scene-1', { text: '첫 번째 장면의 자막 텍스트입니다.' });
      store.setSceneSubtitle('scene-2', { text: '두 번째 장면의 자막 텍스트.' });
      store.setSceneSubtitle('scene-3', { text: '세 번째 장면 마지막 텍스트.' });

      // 3번째 장면 선택
      store.setExpandedSceneId('scene-3');

      // 글로벌 자막 스타일 설정 (54px, Pretendard Bold)
      store.setGlobalSubtitleStyle({
        template: {
          id: 'default', name: '기본', category: 'basic',
          fontFamily: 'Pretendard', fontSize: 54, fontWeight: 700, fontStyle: 'normal',
          color: '#ffffff', outlineColor: '#000000', outlineWidth: 2,
          shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
          letterSpacing: 0, lineHeight: 1.4, positionY: 10, textAlign: 'center',
        },
      });
    });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-e2e/sub-sync-02-editroom.png', fullPage: false });
    console.log('  📸 스크린샷 저장: sub-sync-02-editroom.png');

    // ═══════════════════════════════════════
    // STEP 3: 자막 탭 클릭 → "상세 편집 열기" 클릭
    // ═══════════════════════════════════════
    console.log('\n── STEP 3: 자막 탭 → 상세 편집 열기 ──');

    // 자막 탭 클릭
    const subtitleTab = page.locator('button, [role="tab"]').filter({ hasText: /자막/ }).first();
    if (await subtitleTab.isVisible()) {
      await subtitleTab.click();
      await page.waitForTimeout(1000);
    }

    // "상세 편집 열기" 버튼 클릭
    const openDetailBtn = page.locator('button').filter({ hasText: /상세 편집 열기/ });
    if (await openDetailBtn.count() > 0) {
      await openDetailBtn.first().click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-e2e/sub-sync-03-detail-editor.png', fullPage: false });
    console.log('  📸 스크린샷 저장: sub-sync-03-detail-editor.png');

    // ═══════════════════════════════════════
    // STEP 4: 상세 편집기에서 3번째 장면 표시 검증
    // ═══════════════════════════════════════
    console.log('\n── STEP 4: 장면 동기화 검증 ──');

    // 상세 편집기 내 장면 탐색기 확인 (3 / 3 표시)
    const sceneNav = await page.textContent('body');
    const hasScene3 = sceneNav?.includes('3 / 3') || sceneNav?.includes('3/3');
    check(hasScene3 || false, '상세 편집기가 3번째 장면(3/3)에서 시작됨');

    // ═══════════════════════════════════════
    // STEP 5: 폰트 크기 스케일링 검증 (CSS fontScale)
    // ═══════════════════════════════════════
    console.log('\n── STEP 5: 폰트 스케일링 검증 (9:16 모드) ──');

    // 세로 모드 버튼 클릭 (있으면)
    const verticalBtn = page.locator('button').filter({ hasText: /세로/ });
    if (await verticalBtn.count() > 0) {
      await verticalBtn.first().click();
      await page.waitForTimeout(500);
    }

    // 자막 프리뷰 영역의 p 태그에서 실제 적용된 fontSize 확인
    const subtitleParagraph = page.locator('.max-w-\\[90\\%\\]').first();
    if (await subtitleParagraph.count() > 0) {
      const computedFontSize = await subtitleParagraph.evaluate((el) => {
        return parseFloat(window.getComputedStyle(el).fontSize);
      });

      // 프리뷰 영역 너비 가져오기
      const previewContainer = page.locator('[class*="aspect-"][class*="9/16"], [class*="aspect-\\[9\\/16\\]"]').first();
      let previewWidth = 320; // default max-w-xs
      if (await previewContainer.count() > 0) {
        const box = await previewContainer.boundingBox();
        if (box) previewWidth = box.width;
      }

      // 기대값 계산: fontScale = displayScale * (1920/1080) = (previewWidth/1080) * 1.778
      // fontSize = 54 * fontScale
      const displayScale = previewWidth / 1080;
      const fontScale = displayScale * (1920 / 1080);
      const expectedFontSize = 54 * fontScale;

      console.log(`  ℹ️ previewWidth: ${previewWidth}px`);
      console.log(`  ℹ️ computedFontSize: ${computedFontSize.toFixed(1)}px`);
      console.log(`  ℹ️ expectedFontSize: ${expectedFontSize.toFixed(1)}px`);

      // ±15% 허용 (CSS 렌더링 반올림 등)
      const tolerance = expectedFontSize * 0.15;
      const sizeMatch = Math.abs(computedFontSize - expectedFontSize) < tolerance;
      check(sizeMatch, `9:16 폰트 크기 스케일 일치 (실제: ${computedFontSize.toFixed(1)}px, 기대: ${expectedFontSize.toFixed(1)}px ±15%)`);

      // 이전 버그 검증: fontScale = previewWidth/1080 (resScale 미적용) 이면 너무 작음
      const oldBugFontSize = 54 * displayScale; // 이전 버그: height 스케일 미적용
      const isNotOldBug = computedFontSize > oldBugFontSize * 1.3;
      check(isNotOldBug, `이전 버그(크기 1.778x 감소) 수정됨 (이전: ${oldBugFontSize.toFixed(1)}px, 현재: ${computedFontSize.toFixed(1)}px)`);
    } else {
      console.log('  ⚠️ 자막 프리뷰 p 태그를 찾을 수 없음 — 스크린샷으로 시각 확인 필요');
    }

    await page.screenshot({ path: 'test-e2e/sub-sync-04-scale-verified.png', fullPage: false });
    console.log('  📸 스크린샷 저장: sub-sync-04-scale-verified.png');

    // ═══════════════════════════════════════
    // STEP 6: 상세 편집기에서 폰트 크기 변경 → 타임라인 반영 확인
    // ═══════════════════════════════════════
    console.log('\n── STEP 6: 폰트 크기 변경 → 스토어 동기화 검증 ──');

    // 글자 크기 슬라이더 찾기
    const fontSizeSlider = page.locator('input[type="range"]').first();
    if (await fontSizeSlider.count() > 0) {
      // 슬라이더를 80으로 변경
      await fontSizeSlider.fill('80');
      await fontSizeSlider.dispatchEvent('input');
      await fontSizeSlider.dispatchEvent('change');
      await page.waitForTimeout(500);

      // editRoomStore의 globalSubtitleStyle 확인
      const storeSize = await page.evaluate(() => {
        const ers = (window as any).__EDIT_ROOM_STORE__;
        if (!ers) return null;
        return ers.getState().globalSubtitleStyle?.template?.fontSize;
      });

      check(storeSize === 80, `상세 편집기에서 폰트 크기 80 변경 → store 반영 (store: ${storeSize})`);
    } else {
      console.log('  ⚠️ 폰트 크기 슬라이더를 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-e2e/sub-sync-05-final.png', fullPage: false });
    console.log('  📸 스크린샷 저장: sub-sync-05-final.png');

  } catch (err) {
    console.error('\n❌ 테스트 중 에러:', err);
    await page.screenshot({ path: 'test-e2e/sub-sync-error.png', fullPage: false });
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n========================================`);
  console.log(`  결과: ✅ ${passed} passed / ❌ ${failed} failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
