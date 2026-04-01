/**
 * Motion Master — CEP Panel UI E2E Test (v1.1 — new minimal UI)
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const PANEL_URL = `file://${path.resolve(__dirname, '../premiere-motion-extension/client/index.html')}`;

test.describe('Motion Master Panel UI', () => {
  test('패널 로드 → 프리셋 렌더링 → 클릭 → 앵커 조정 전체 흐름', async ({ page }) => {
    await page.goto(PANEL_URL);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-e2e/motion-master-01-loaded.png', fullPage: true });
    console.log('[TEST] 01 패널 로드 완료');

    // 헤더
    const header = await page.textContent('h1');
    expect(header).toContain('Motion Master');

    // 기본 프리셋 렌더링
    const basicPresets = await page.locator('#basic-presets .preset-btn').count();
    expect(basicPresets).toBeGreaterThanOrEqual(9);
    console.log(`[TEST] 02 기본 프리셋 ${basicPresets}개`);

    // 시네마틱 섹션 열기
    const cineHead = page.locator('.sec-head:has-text("Cinematic")');
    await cineHead.click();
    await page.waitForTimeout(300);
    const cinePresets = await page.locator('#cinematic-presets .preset-btn').count();
    expect(cinePresets).toBeGreaterThanOrEqual(10);
    console.log(`[TEST] 03 시네마틱 ${cinePresets}개`);

    // 프리셋 클릭
    const dynamicBtn = page.locator('.preset-btn[data-preset="dynamic"]');
    await dynamicBtn.click();
    await page.waitForTimeout(200);
    const isActive = await dynamicBtn.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
    console.log('[TEST] 04 dynamic 선택 확인');
    await page.screenshot({ path: 'test-e2e/motion-master-02-preset-selected.png', fullPage: true });

    // Fine Tune 열기
    const tuneHead = page.locator('.sec-head:has-text("Fine Tune")');
    await tuneHead.click();
    await page.waitForTimeout(300);

    // 앵커 슬라이더
    const anchorX = page.locator('#anchor-x');
    await anchorX.fill('70');
    await anchorX.dispatchEvent('input');
    const anchorY = page.locator('#anchor-y');
    await anchorY.fill('30');
    await anchorY.dispatchEvent('input');
    await page.waitForTimeout(100);

    const xVal = await page.textContent('#anchor-x-value');
    const yVal = await page.textContent('#anchor-y-value');
    expect(xVal).toContain('70');
    expect(yVal).toContain('30');
    console.log(`[TEST] 05 앵커 X=${xVal} Y=${yVal}`);

    // 강도
    const intensity = page.locator('#intensity');
    await intensity.fill('130');
    await intensity.dispatchEvent('input');
    await page.waitForTimeout(100);
    console.log('[TEST] 06 강도 130%');
    await page.screenshot({ path: 'test-e2e/motion-master-03-adjusted.png', fullPage: true });

    // 액션 버튼 존재
    await expect(page.locator('#btn-random')).toBeVisible();
    await expect(page.locator('#btn-smart')).toBeVisible();
    await expect(page.locator('#btn-remove')).toBeVisible();
    await expect(page.locator('#btn-apply')).toBeVisible();
    console.log('[TEST] 07 액션 버튼 4개 확인');

    // Effects 섹션
    const fxHead = page.locator('.sec-head:has-text("Effects")');
    await fxHead.click();
    await page.waitForTimeout(300);
    const fxBtns = await page.locator('#motion-effects .tag-btn').count();
    expect(fxBtns).toBeGreaterThanOrEqual(8);
    console.log(`[TEST] 08 모션 이펙트 ${fxBtns}개`);

    // 스크롤 테스트 — Apply 버튼이 항상 보이는지
    const applyVisible = await page.locator('#btn-apply').isVisible();
    expect(applyVisible).toBe(true);
    console.log('[TEST] 09 Apply 버튼 항상 가시');

    await page.screenshot({ path: 'test-e2e/motion-master-99-final.png', fullPage: true });
    console.log('[TEST] PASS');
  });
});
