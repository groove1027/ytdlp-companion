/**
 * Motion Master — CEP Panel UI E2E Test
 *
 * Premiere Pro 없이도 패널 HTML을 브라우저에서 열어서
 * UI 렌더링 + 프리셋 선택 + 스마트 랜덤 + 앵커 드래그를 검증한다.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const PANEL_URL = `file://${path.resolve(__dirname, '../premiere-motion-extension/client/index.html')}`;

test.describe('Motion Master Panel UI', () => {
  test('패널 로드 → 프리셋 렌더링 → 클릭 → 앵커 조정 전체 흐름', async ({ page }) => {
    // ── 1. 패널 로드 ──
    await page.goto(PANEL_URL);
    await page.waitForTimeout(1000);

    // 초기 상태 스크린샷
    await page.screenshot({ path: 'test-e2e/motion-master-01-loaded.png', fullPage: true });
    console.log('[TEST] ✅ 패널 로드 완료');

    // ── 2. 헤더 확인 ──
    const header = await page.textContent('h1');
    expect(header).toContain('Motion Master');
    console.log('[TEST] ✅ 헤더: ' + header);

    // ── 3. 프리셋 버튼 렌더링 확인 ──
    const basicPresets = await page.locator('#basic-presets .preset-btn').count();
    expect(basicPresets).toBeGreaterThanOrEqual(9);
    console.log(`[TEST] ✅ 기본 프리셋 ${basicPresets}개 렌더링`);

    // ── 4. 시네마틱 섹션 열기 ──
    const cinematicToggle = page.locator('.section-toggle:has-text("시네마틱")');
    await cinematicToggle.click();
    await page.waitForTimeout(300);

    const cinematicPresets = await page.locator('#cinematic-presets .preset-btn').count();
    expect(cinematicPresets).toBeGreaterThanOrEqual(10);
    console.log(`[TEST] ✅ 시네마틱 프리셋 ${cinematicPresets}개 렌더링`);

    // ── 5. 프리셋 클릭 (dynamic 선택) ──
    const dynamicBtn = page.locator('.preset-btn[data-preset="dynamic"]');
    await dynamicBtn.click();
    await page.waitForTimeout(200);

    // active 클래스 확인
    const isActive = await dynamicBtn.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
    console.log('[TEST] ✅ dynamic 프리셋 선택 (active 클래스 확인)');

    // 선택 후 스크린샷
    await page.screenshot({ path: 'test-e2e/motion-master-02-preset-selected.png', fullPage: true });

    // ── 6. 오버스케일 표시 확인 ──
    const overscaleText = await dynamicBtn.locator('.preset-overscale').textContent();
    expect(overscaleText).toMatch(/\d+%/);
    console.log(`[TEST] ✅ 오버스케일 표시: ${overscaleText}`);

    // ── 7. 세부 조정 섹션 열기 ──
    const adjustToggle = page.locator('.section-toggle:has-text("세부 조정")');
    await adjustToggle.click();
    await page.waitForTimeout(300);

    // ── 8. 앵커 슬라이더 조정 ──
    const anchorX = page.locator('#anchor-x');
    await anchorX.fill('70');
    await anchorX.dispatchEvent('input');
    await page.waitForTimeout(100);

    const anchorY = page.locator('#anchor-y');
    await anchorY.fill('30');
    await anchorY.dispatchEvent('input');
    await page.waitForTimeout(100);

    // 앵커 값 표시 확인
    const xValue = await page.textContent('#anchor-x-value');
    const yValue = await page.textContent('#anchor-y-value');
    expect(xValue).toContain('70');
    expect(yValue).toContain('30');
    console.log(`[TEST] ✅ 앵커 조정: X=${xValue}, Y=${yValue}`);

    // ── 9. 앵커 도트 위치 확인 ──
    const dotStyle = await page.locator('#anchor-dot').evaluate(el => ({
      left: el.style.left,
      top: el.style.top,
    }));
    expect(dotStyle.left).toBe('70%');
    expect(dotStyle.top).toBe('30%');
    console.log(`[TEST] ✅ 앵커 도트 위치: left=${dotStyle.left}, top=${dotStyle.top}`);

    // ── 10. 강도 슬라이더 ──
    const intensity = page.locator('#intensity');
    await intensity.fill('130');
    await intensity.dispatchEvent('input');
    await page.waitForTimeout(100);

    const intensityValue = await page.textContent('#intensity-value');
    expect(intensityValue).toContain('130');
    console.log(`[TEST] ✅ 강도: ${intensityValue}`);

    // 조정 후 스크린샷
    await page.screenshot({ path: 'test-e2e/motion-master-03-adjusted.png', fullPage: true });

    // ── 11. 랜덤 버튼 존재 확인 ──
    const randomBtn = page.locator('#btn-random');
    await expect(randomBtn).toBeVisible();
    console.log('[TEST] ✅ 랜덤 버튼 존재');

    // ── 12. 스마트 버튼 존재 확인 ──
    const smartBtn = page.locator('#btn-smart');
    await expect(smartBtn).toBeVisible();
    console.log('[TEST] ✅ 스마트 버튼 존재');

    // ── 13. 되돌리기 버튼 존재 확인 ──
    const removeBtn = page.locator('#btn-remove');
    await expect(removeBtn).toBeVisible();
    console.log('[TEST] ✅ 되돌리기 버튼 존재');

    // ── 14. 적용 버튼 클릭 (Premiere 미연결이므로 에러 상태 확인) ──
    const applyBtn = page.locator('#btn-apply');
    await applyBtn.click();
    await page.waitForTimeout(500);

    // 상태 메시지 확인 (클립 미선택 또는 Premiere 미연결)
    const status = await page.textContent('#status');
    console.log(`[TEST] ✅ 적용 후 상태: ${status}`);

    // ── 15. 모션 이펙트 섹션 열기 ──
    const motionToggle = page.locator('.section-toggle:has-text("모션 이펙트")');
    await motionToggle.click();
    await page.waitForTimeout(300);

    const motionEffects = await page.locator('#motion-effects .motion-btn').count();
    expect(motionEffects).toBeGreaterThanOrEqual(8);
    console.log(`[TEST] ✅ 모션 이펙트 ${motionEffects}개 렌더링`);

    // 최종 스크린샷
    await page.screenshot({ path: 'test-e2e/motion-master-99-final.png', fullPage: true });
    console.log('[TEST] ✅ 전체 테스트 완료');
  });
});
