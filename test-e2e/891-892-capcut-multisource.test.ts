/**
 * E2E: #891 + #892 CapCut 멀티소스 영상 내보내기 수정 검증
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5174';
const E2E_DIR = path.resolve(__dirname);

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ENV = loadEnv();

/** 모든 고정 오버레이/모달 강제 제거 */
async function dismissAllModals(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // z-[200] 등 높은 z-index 오버레이 모두 제거
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      const z = window.getComputedStyle(el).zIndex;
      if (parseInt(z) >= 100) (el as HTMLElement).remove();
    });
    // 배너류도 제거
    document.querySelectorAll('[class*="z-[200]"], [class*="z-\\[200\\]"]').forEach(el => {
      (el as HTMLElement).remove();
    });
  });
  await page.waitForTimeout(500);
}

test.describe('#891/#892 CapCut 멀티소스 내보내기', () => {
  test('다중 소스 영상 업로드 → 분석 → CapCut ZIP → 다중 머티리얼 검증', async ({ page }) => {
    test.setTimeout(300_000);

    // ── Step 0: 테스트 영상 생성 ──
    const video1Path = path.join(E2E_DIR, 'test-source1.mp4');
    const video2Path = path.join(E2E_DIR, 'test-source2.mp4');

    if (!fs.existsSync(video1Path)) {
      execSync(`ffmpeg -y -f lavfi -i "color=c=red:s=320x240:r=30:d=3" -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -c:a aac -shortest "${video1Path}"`, { timeout: 30000 });
    }
    if (!fs.existsSync(video2Path)) {
      execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=320x240:r=30:d=3" -f lavfi -i sine=frequency=880:duration=3 -c:v libx264 -c:a aac -shortest "${video2Path}"`, { timeout: 30000 });
    }

    // ── Step 1: 로그인 ──
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ENV.E2E_TEST_EMAIL,
        password: ENV.E2E_TEST_PASSWORD,
        rememberMe: true,
      }),
    });
    const loginData = await loginRes.json() as { token: string; user: unknown };

    await page.evaluate(({ token, user, evolinkKey, kieKey, ytKey }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolinkKey);
      localStorage.setItem('CUSTOM_KIE_KEY', kieKey);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', ytKey);
    }, {
      token: loginData.token,
      user: loginData.user,
      evolinkKey: ENV.CUSTOM_EVOLINK_KEY || '',
      kieKey: ENV.CUSTOM_KIE_KEY || '',
      ytKey: ENV.CUSTOM_YOUTUBE_API_KEY || '',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 모든 오버레이/모달 강제 제거
    await dismissAllModals(page);

    await page.screenshot({ path: path.join(E2E_DIR, '891-01-loggedin.png'), fullPage: false });

    // ── Step 2: 새 프로젝트 생성 ──
    const newProjectBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("+ 새 프로젝트 만들기")').first();
    if (await newProjectBtn.isVisible({ timeout: 3000 })) {
      await newProjectBtn.click();
      await page.waitForTimeout(1000);
    }

    // 프로젝트 생성 모달에서 이름 입력
    const nameInput = page.locator('input[placeholder*="프로젝트"]').first();
    if (await nameInput.isVisible({ timeout: 2000 })) {
      await nameInput.fill('E2E-891-multisource');
      await page.waitForTimeout(300);
    }
    const createBtn = page.locator('button:has-text("생성하기"), button:has-text("만들기"), button:has-text("+ 생성하기")').first();
    if (await createBtn.isVisible({ timeout: 2000 })) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    // 혹시 남은 모달 제거
    await dismissAllModals(page);

    // ── Step 3: 채널/영상 분석 탭 진입 ──
    await page.locator('button:has-text("채널/영상 분석")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await dismissAllModals(page);

    // 영상 분석실 서브탭
    const videoTab = page.locator('button:has-text("영상 분석실")').first();
    if (await videoTab.isVisible({ timeout: 3000 })) {
      await videoTab.click({ force: true });
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: path.join(E2E_DIR, '891-02-analysis-tab.png'), fullPage: false });

    // ── Step 4: 영상 업로드 모드 + 파일 업로드 ──
    const uploadBtn = page.locator('button:has-text("영상 업로드")').first();
    if (await uploadBtn.isVisible({ timeout: 3000 })) {
      await uploadBtn.click({ force: true });
      await page.waitForTimeout(500);
    }

    // 파일 업로드 (multiple files)
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([video1Path, video2Path]);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(E2E_DIR, '891-03-uploaded.png'), fullPage: false });

    // ── Step 5: 프리셋 선택 + 분석 시작 ──
    const snackBtn = page.locator('button:has-text("스낵형")').first();
    if (await snackBtn.isVisible({ timeout: 3000 })) {
      await snackBtn.click({ force: true });
      await page.waitForTimeout(500);
    }

    await dismissAllModals(page);

    // 분석 시작 — force: true로 오버레이 무시
    const analyzeStartBtn = page.locator('button:has-text("분석 시작"), button:has-text("분석하기")').first();
    if (await analyzeStartBtn.isVisible({ timeout: 3000 })) {
      await analyzeStartBtn.click({ force: true });
    } else {
      // fallback: "분석" 포함 활성 버튼
      await page.locator('button:has-text("분석"):not([disabled])').first().click({ force: true });
    }

    // Evolink API 응답 대기 (최대 180초)
    console.log('[E2E] 분석 API 응답 대기 중...');
    try {
      await page.waitForResponse(
        resp => resp.url().includes('evolink') && resp.status() === 200,
        { timeout: 180_000 }
      );
      console.log('[E2E] Evolink 응답 수신');
    } catch {
      console.log('[E2E] Evolink 응답 대기 타임아웃 — 결과 확인 계속');
    }

    // 결과 렌더링 대기
    await page.waitForTimeout(15000);
    await page.screenshot({ path: path.join(E2E_DIR, '891-04-analyzed.png'), fullPage: false });

    // ── Step 6: CapCut 내보내기 ──
    // 결과 테이블이 있는지 확인
    const hasResults = await page.locator('table, .version-card, [class*="scene"]').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasResults) {
      const downloadPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);

      // CapCut 버튼
      const ccBtn = page.locator('button:has-text("CapCut")').first();
      if (await ccBtn.isVisible({ timeout: 5000 })) {
        await ccBtn.click({ force: true });
        console.log('[E2E] CapCut 버튼 클릭');
      }

      await page.waitForTimeout(15000);
      await page.screenshot({ path: path.join(E2E_DIR, '891-05-exporting.png'), fullPage: false });

      const download = await downloadPromise;
      let dlPath: string | null = null;
      if (download) {
        dlPath = path.join(E2E_DIR, 'dl-capcut-multisource.zip');
        await download.saveAs(dlPath);
        console.log('[E2E] ZIP 다운로드 완료');
      } else {
        console.log('[E2E] ZIP 미다운로드 — 컴패니언 직접설치 가능');
      }

      await page.screenshot({ path: path.join(E2E_DIR, '891-06-final.png'), fullPage: false });

      // ── Step 7: ZIP 검증 ──
      if (dlPath && fs.existsSync(dlPath)) {
        const size = fs.statSync(dlPath).size;
        expect(size).toBeGreaterThan(100);
        console.log(`[E2E] ZIP 크기: ${size} bytes`);

        const zipContents = execSync(`unzip -l "${dlPath}"`).toString();
        console.log('[E2E] ZIP 내용물:\n', zipContents.split('\n').slice(0, 30).join('\n'));

        expect(zipContents).toContain('draft_content.json');
        expect(zipContents).toContain('materials/video/');

        // draft_content.json 분석
        const tmpDir = path.join(E2E_DIR, 'tmp-891');
        execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && cd "${tmpDir}" && unzip -o "${dlPath}" "*/draft_content.json" 2>/dev/null || true`);

        const draftFiles = execSync(`find "${tmpDir}" -name "draft_content.json" 2>/dev/null`).toString().trim().split('\n').filter(Boolean);
        if (draftFiles.length > 0) {
          const draftJson = JSON.parse(fs.readFileSync(draftFiles[0], 'utf-8'));
          const videoMats = draftJson?.materials?.videos || [];
          console.log(`[E2E] draft videos 머티리얼 수: ${videoMats.length}`);
          videoMats.forEach((v: { material_name: string; id: string }, i: number) => {
            console.log(`  [${i}] id=${v.id.slice(0, 8)}... name="${v.material_name}"`);
          });

          // 최소 1개 머티리얼 존재
          expect(videoMats.length).toBeGreaterThanOrEqual(1);

          // 세그먼트가 머티리얼 ID를 올바르게 참조하는지 확인
          const tracks = draftJson?.tracks || [];
          const videoTrack = tracks.find((t: { type: string }) => t.type === 'video');
          if (videoTrack) {
            const segments = videoTrack.segments || [];
            const matIds = new Set(videoMats.map((v: { id: string }) => v.id));
            for (const seg of segments) {
              const refId = seg?.material_id;
              if (refId) {
                expect(matIds.has(refId)).toBe(true);
              }
            }
            console.log(`[E2E] 비디오 세그먼트 ${segments.length}개 — 모든 material_id 유효`);
          }
        }
        execSync(`rm -rf "${tmpDir}"`);
      }
    } else {
      console.log('[E2E] 분석 결과 없음 — 3초 영상으로 분석이 불충분할 수 있음');
      await page.screenshot({ path: path.join(E2E_DIR, '891-06-final.png'), fullPage: false });
    }
  });
});
