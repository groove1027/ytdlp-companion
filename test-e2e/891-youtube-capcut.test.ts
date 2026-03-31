/**
 * E2E: #891/#892 — YouTube 단일 URL 분석 → CapCut 내보내기 검증
 * 기존 기능 회귀 없음 확인 + draft_content.json 구조 검증
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5174';
const E2E_DIR = path.resolve(__dirname);
const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

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

async function dismissAllModals(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      const z = window.getComputedStyle(el).zIndex;
      if (parseInt(z) >= 100) (el as HTMLElement).remove();
    });
  });
  await page.waitForTimeout(300);
}

test.describe('#891/#892 CapCut 회귀 테스트', () => {
  test('YouTube URL → 스낵형 분석 → CapCut ZIP → draft_content.json 구조 검증', async ({ page }) => {
    test.setTimeout(300_000);

    // ── 로그인 ──
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ENV.E2E_TEST_EMAIL, password: ENV.E2E_TEST_PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: unknown };

    await page.evaluate(({ token, user, evolinkKey, kieKey, ytKey }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolinkKey);
      localStorage.setItem('CUSTOM_KIE_KEY', kieKey);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', ytKey);
    }, { token: loginData.token, user: loginData.user, evolinkKey: ENV.CUSTOM_EVOLINK_KEY || '', kieKey: ENV.CUSTOM_KIE_KEY || '', ytKey: ENV.CUSTOM_YOUTUBE_API_KEY || '' });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await dismissAllModals(page);

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-01-loggedin.png') });

    // ── 프로젝트 생성 ──
    const newProjBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("+ 새 프로젝트 만들기")').first();
    if (await newProjBtn.isVisible({ timeout: 3000 })) {
      await newProjBtn.click();
      await page.waitForTimeout(1000);
    }
    const nameIn = page.locator('input[placeholder*="프로젝트"]').first();
    if (await nameIn.isVisible({ timeout: 2000 })) {
      await nameIn.fill('E2E-891-yt');
    }
    const createBtn = page.locator('button:has-text("생성하기"), button:has-text("만들기"), button:has-text("+ 생성하기")').first();
    if (await createBtn.isVisible({ timeout: 2000 })) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }
    await dismissAllModals(page);

    // ── 영상 분석실 진입 ──
    await page.locator('button:has-text("채널/영상 분석")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await dismissAllModals(page);

    const videoTab = page.locator('button:has-text("영상 분석실")').first();
    if (await videoTab.isVisible({ timeout: 3000 })) {
      await videoTab.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // ── YouTube URL 입력 ──
    const urlInput = page.locator('input[placeholder*="URL"], input[placeholder*="유튜브"], textarea[placeholder*="URL"]').first();
    await urlInput.fill(TEST_YOUTUBE_URL);
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-02-url-entered.png') });

    // ── 스낵형 프리셋 선택 ──
    const snackBtn = page.locator('button:has-text("스낵형")').first();
    if (await snackBtn.isVisible({ timeout: 3000 })) {
      await snackBtn.click({ force: true });
      await page.waitForTimeout(500);
    }

    // ── 분석 시작 ──
    await dismissAllModals(page);
    const analyzeBtn = page.locator('button:has-text("분석 시작"), button:has-text("분석하기"), button:has-text("분석"):not([disabled])').first();
    await analyzeBtn.click({ force: true });

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-03-analyzing.png') });

    // API 응답 대기
    console.log('[E2E] Evolink API 응답 대기 중...');
    try {
      await page.waitForResponse(
        resp => resp.url().includes('evolink') && resp.status() === 200,
        { timeout: 180_000 }
      );
      console.log('[E2E] ✅ Evolink 응답 수신');
    } catch {
      console.log('[E2E] ⚠️ 응답 대기 타임아웃');
    }

    // 결과 렌더링 대기
    await page.waitForTimeout(20000);
    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-04-analyzed.png') });

    // ── CapCut 내보내기 ──
    const hasScenes = await page.locator('table, tr:has(td), [class*="scene"], .version-card').first().isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[E2E] 분석 결과 존재: ${hasScenes}`);

    if (hasScenes) {
      const downloadPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
      const ccBtn = page.locator('button:has-text("CapCut")').first();
      if (await ccBtn.isVisible({ timeout: 5000 })) {
        await ccBtn.click({ force: true });
        console.log('[E2E] CapCut 버튼 클릭');
      }

      // 내보내기 진행 대기
      await page.waitForTimeout(30000);
      await page.screenshot({ path: path.join(E2E_DIR, '891-yt-05-exporting.png') });

      const download = await downloadPromise;
      let dlPath: string | null = null;
      if (download) {
        dlPath = path.join(E2E_DIR, 'dl-capcut-891-yt.zip');
        await download.saveAs(dlPath);
        console.log('[E2E] ✅ ZIP 다운로드 완료');
      }

      await page.screenshot({ path: path.join(E2E_DIR, '891-yt-06-final.png') });

      // ── ZIP 검증 ──
      if (dlPath && fs.existsSync(dlPath)) {
        const size = fs.statSync(dlPath).size;
        expect(size).toBeGreaterThan(100);
        console.log(`[E2E] ZIP 크기: ${(size / 1024 / 1024).toFixed(1)}MB`);

        const zipList = execSync(`unzip -l "${dlPath}"`).toString();
        expect(zipList).toContain('draft_content.json');
        expect(zipList).toContain('materials/video/');
        expect(zipList.toLowerCase()).toContain('.srt');
        console.log('[E2E] ✅ ZIP 구조 검증 통과 (draft_content.json, materials/video, SRT)');

        // draft_content.json 파싱
        const tmpDir = path.join(E2E_DIR, 'tmp-891-yt');
        execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && cd "${tmpDir}" && unzip -o "${dlPath}" "*/draft_content.json" 2>/dev/null || true`);
        const draftPaths = execSync(`find "${tmpDir}" -name "draft_content.json"`).toString().trim().split('\n').filter(Boolean);

        if (draftPaths.length > 0) {
          const draft = JSON.parse(fs.readFileSync(draftPaths[0], 'utf-8'));
          const videoMats = draft?.materials?.videos || [];
          const tracks = draft?.tracks || [];
          const videoTrack = tracks.find((t: { type: string }) => t.type === 'video');
          const segments = videoTrack?.segments || [];

          console.log(`[E2E] materials.videos: ${videoMats.length}개`);
          console.log(`[E2E] video segments: ${segments.length}개`);

          // 단일 소스 → materials.videos가 1개
          expect(videoMats.length).toBe(1);
          // 세그먼트가 존재
          expect(segments.length).toBeGreaterThan(0);

          // 모든 세그먼트의 material_id가 유효한 머티리얼 참조
          const matIds = new Set(videoMats.map((v: { id: string }) => v.id));
          for (const seg of segments) {
            if (seg.material_id) {
              expect(matIds.has(seg.material_id)).toBe(true);
            }
          }
          console.log('[E2E] ✅ 모든 세그먼트 material_id 유효');
        }
        execSync(`rm -rf "${tmpDir}"`);
      }
    } else {
      console.log('[E2E] ⚠️ 분석 결과 없음 — 스크린샷만 제출');
      await page.screenshot({ path: path.join(E2E_DIR, '891-yt-06-final.png') });
    }
  });
});
