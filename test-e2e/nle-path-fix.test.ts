/**
 * NLE 내보내기 경로 수정 검증 E2E 테스트
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:3000';
const PROD_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const KIE_KEY = process.env.CUSTOM_KIE_KEY || '';
const YT_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

async function login(page: any) {
  const res = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const data = await res.json();
  await page.evaluate(({ token, user, evolink, kie }: any) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    if (kie) localStorage.setItem('CUSTOM_KIE_KEY', kie);
  }, { token: data.token, user: data.user, evolink: EVOLINK_KEY, kie: KIE_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

test.describe('NLE 내보내기 경로 수정 검증', () => {
  test('Premiere — .prproj FilePath + 컴패니언 절대경로 패치', async ({ page }) => {
    test.setTimeout(600_000);

    // 1. 로그인
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await login(page);
    await page.screenshot({ path: 'test-e2e/nle-fix-01-loggedin.png' });

    // 2. 기존 프로젝트 클릭 (프로젝트 카드 첫 번째)
    const projectCard = page.locator('.group.bg-gray-800.rounded-xl.cursor-pointer').first();
    if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectCard.click();
      console.log('[TEST] 기존 프로젝트 클릭');
    } else {
      await page.locator('button').filter({ hasText: /새 프로젝트/ }).first().click();
      await page.waitForTimeout(1500);
      await page.keyboard.press('Enter');
      console.log('[TEST] 새 프로젝트 Enter 제출');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/nle-fix-02-project.png' });

    // 3. 채널/영상 분석 탭 → 영상 분석실 서브탭
    await page.locator('[data-tour="tab-channel-analysis"]').click({ force: true });
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: '영상 분석실' }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/nle-fix-03-analysis.png' });

    // 4. YouTube URL 입력
    const urlInput = page.locator('input[placeholder*="영상 URL"]').first();
    await urlInput.waitFor({ timeout: 10000 });
    await urlInput.fill(YT_URL);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-e2e/nle-fix-04-url.png' });

    // 5. 프리셋 카드 클릭 → 분석 시작 ("스낵형" — 가장 빠름)
    await page.waitForTimeout(1000);
    const presetCard = page.locator('button:not([disabled])').filter({
      hasText: /스낵형/
    }).first();
    await presetCard.waitFor({ timeout: 15000 });
    await presetCard.click();
    console.log('[TEST] 스낵형 프리셋 클릭 → 분석 시작');
    await page.screenshot({ path: 'test-e2e/nle-fix-05-start.png' });

    // 6. 분석 완료 대기 — 버전 카드(번호가 있는 원형 배지)가 나타날 때까지
    //    Premiere 버튼은 버전 카드를 확장해야만 DOM에 존재함
    console.log('[TEST] 분석 완료 대기...');
    let analysisComplete = false;
    for (let i = 0; i < 20; i++) {  // 20 × 30s = 600s
      // 버전 카드의 "재생성" 버튼이 나타나면 분석 완료
      const hasVersions = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).some(b =>
          /재생성/.test(b.textContent || '')
        );
      });
      if (hasVersions) {
        console.log(`[TEST] 분석 완료! (${(i + 1) * 30}초 경과)`);
        analysisComplete = true;
        break;
      }
      if (i % 2 === 0) {
        await page.screenshot({ path: `test-e2e/nle-fix-06-wait-${i}.png` });
        console.log(`[TEST] 대기 중... ${(i + 1) * 30}초`);
      }
      await page.waitForTimeout(30_000);
    }

    if (!analysisComplete) {
      await page.screenshot({ path: 'test-e2e/nle-fix-99-timeout.png' });
      expect(analysisComplete).toBe(true);  // 분석 미완료
      return;
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/nle-fix-06-analyzed.png' });

    // 7. 분석 완료 후 자동 이동했을 수 있음 → 채널/영상 분석 탭으로 복귀
    //    사이드바에서 "채널/영상 분석" 클릭 → "영상 분석실" 서브탭 클릭
    await page.locator('[data-tour="tab-channel-analysis"]').click({ force: true });
    await page.waitForTimeout(2000);
    await page.locator('button').filter({ hasText: '영상 분석실' }).click();
    await page.waitForTimeout(3000);
    console.log('[TEST] 영상 분석실로 복귀');
    await page.screenshot({ path: 'test-e2e/nle-fix-07-back.png' });

    // 8. 버전 카드 확장 — w-7 h-7 배지는 버전 카드 전용 (사이드바 아님)
    //    버전 카드 내부의 "컷" 배지 옆 제목을 클릭
    const versionCardBtn = page.locator('button.flex.items-center.gap-3.flex-1').first();
    await versionCardBtn.scrollIntoViewIfNeeded();
    await versionCardBtn.click();
    console.log('[TEST] 버전 카드 확장');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/nle-fix-07-expanded.png' });

    // 9. Premiere 버튼 찾기
    const premiereBtn = page.locator('button').filter({ hasText: /Premiere/i }).first();
    const premiereBtnCount = await premiereBtn.count();
    console.log(`[TEST] Premiere 버튼 count: ${premiereBtnCount}`);

    if (premiereBtnCount > 0) {
      await premiereBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
    }

    if (!await premiereBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // 디버깅: 현재 페이지의 모든 버튼 텍스트 출력
      const allBtnTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().slice(0, 50))
      );
      console.log('[TEST] 현재 페이지 버튼 목록:', allBtnTexts.filter(Boolean).join(' | '));
      await page.screenshot({ path: 'test-e2e/nle-fix-99-no-btn.png' });
    }
    expect(await premiereBtn.isVisible({ timeout: 10_000 })).toBe(true);

    const dlPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await premiereBtn.click();
    console.log('[TEST] Premiere 클릭');
    await page.screenshot({ path: 'test-e2e/nle-fix-08-clicked.png' });

    // 내보내기 대기
    await page.waitForTimeout(60000);
    await page.screenshot({ path: 'test-e2e/nle-fix-09-done.png' });
    const dl = await dlPromise;

    // ---- 검증 ----
    let verified = false;

    // Case A: ZIP 다운로드
    if (dl) {
      const dlPath = path.resolve('test-e2e/dl-premiere-nle.zip');
      await dl.saveAs(dlPath);
      const size = fs.statSync(dlPath).size;
      console.log(`[TEST] ZIP: ${size} bytes`);
      expect(size).toBeGreaterThan(100);

      const tmpDir = '/tmp/nle-test';
      execSync(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}`);
      // macOS ditto handles Korean filenames correctly (unzip mangles them)
      execSync(`ditto -x -k "${dlPath}" ${tmpDir}`);
      const prproj = execSync(`find ${tmpDir} -name "*.prproj" | head -1`).toString().trim();
      if (prproj) {
        // .prproj is gzipped XML — 플랫 구조: FilePath에 파일명만 (media/ 없음)
        const filePathVal = execSync(`gunzip -c "${prproj}" | grep -oE '<FilePath>[^<]*\\.mp4</FilePath>' | head -1`).toString().trim();
        console.log(`[TEST] FilePath: ${filePathVal}`);
        // media/ 경로가 아닌 파일명만 있어야 함
        expect(filePathVal).not.toContain('media/');
        expect(filePathVal).toContain('.mp4');
        // Project Version="43" 확인
        const versionHits = execSync(`gunzip -c "${prproj}" | grep -c '<Project ObjectID="1" ClassID="62ad66dd-0dcd-42da-a660-6d8fbde94876" Version="43">'`).toString().trim();
        console.log(`[TEST] Project Version="43" hits: ${versionHits}`);
        expect(parseInt(versionHits)).toBeGreaterThan(0);
        const sequenceVersionHits = execSync(`gunzip -c "${prproj}" | grep -c '<Sequence ObjectUID=.*ClassID="6a15d903-8739-11d5-af2d-9b7855ad8974" Version="11">'`).toString().trim();
        console.log(`[TEST] Sequence Version="11" hits: ${sequenceVersionHits}`);
        expect(parseInt(sequenceVersionHits)).toBeGreaterThan(0);
        const openSequenceHits = execSync(`gunzip -c "${prproj}" | grep -c 'MZ.PrefixKey.OpenSequenceGuidList.1>'`).toString().trim();
        console.log(`[TEST] OpenSequence GUID hits: ${openSequenceHits}`);
        expect(parseInt(openSequenceHits)).toBeGreaterThan(0);
        const cutbackHits = execSync(`gunzip -c "${prproj}" | grep -c 'Cutback-221f16c1-02d7-45e4-b3b6-4856e94a6fe0' || true`).toString().trim();
        console.log(`[TEST] stale Cutback placeholder hits: ${cutbackHits}`);
        expect(parseInt(cutbackHits)).toBe(0);
        // BuildVersion 확인
        const bvHits = execSync(`gunzip -c "${prproj}" | grep -c 'MZ.BuildVersion.Created>26'`).toString().trim();
        console.log(`[TEST] BuildVersion hits: ${bvHits}`);
        expect(parseInt(bvHits)).toBeGreaterThan(0);
        const staleSequenceDurationHits = execSync(`gunzip -c "${prproj}" | grep -c '<OriginalDuration>9285893568000000</OriginalDuration>' || true`).toString().trim();
        console.log(`[TEST] stale #render OriginalDuration hits: ${staleSequenceDurationHits}`);
        expect(parseInt(staleSequenceDurationHits)).toBe(0);
        const staleRenderFrameRateHits = execSync(`gunzip -c "${prproj}" | grep -c '<MediaFrameRate>9223372036854775807</MediaFrameRate>' || true`).toString().trim();
        console.log(`[TEST] stale #render MediaFrameRate hits: ${staleRenderFrameRateHits}`);
        expect(parseInt(staleRenderFrameRateHits)).toBe(0);
        console.log('[TEST] ✅ 플랫 구조 + V43 sequence metadata + #렌더 metadata + BuildVersion 확인');
        verified = true;
      }
    }

    // Case B: 컴패니언 설치 시 절대경로 검증 (보너스 — Case A 통과했으면 스킵 가능)
    if (!verified) {
      const exportDir = path.join(process.env.HOME || '/Users/mac_mini', 'Documents/All In One NLE Export');
      if (fs.existsSync(exportDir)) {
        const dirs = fs.readdirSync(exportDir).filter(d => fs.statSync(path.join(exportDir, d)).isDirectory()).sort().reverse();
        if (dirs.length > 0) {
          const latest = path.join(exportDir, dirs[0]);
          const prprojs = fs.readdirSync(latest).filter(f => f.endsWith('.prproj'));
          if (prprojs.length > 0) {
            const prprojPath = path.join(latest, prprojs[0]);
            const absPathHits = execSync(`gunzip -c "${prprojPath}" | grep -c '${latest}/' || true`).toString().trim();
            console.log(`[TEST] 컴패니언 절대경로 hits: ${absPathHits}`);
            if (parseInt(absPathHits) > 0) {
              console.log(`[TEST] ✅ 컴패니언 절대경로 prefix: ${latest}/`);
              verified = true;
            }
          }
        }
      }
    }

    expect(verified).toBe(true);
    await page.screenshot({ path: 'test-e2e/nle-fix-99-final.png' });
  });
});
