/**
 * E2E: #891/#892 — localhost + 컴패니언 → YouTube 분석 → CapCut ZIP → draft_content.json 검증
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BASE_URL = 'https://all-in-one-production.pages.dev';
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

test.describe('#891/#892 CapCut (localhost + companion)', () => {
  test('YouTube → 스낵형 분석 → CapCut ZIP → 다중 머티리얼 검증', async ({ page }) => {
    test.setTimeout(300_000);

    // 모든 콘솔 로그 캡처 (디버깅용)
    const allLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(`[${msg.type()}] ${text}`);
      // 핵심 로그만 출력
      if (text.includes('[VideoAnalysis]') || text.includes('[NLE]') || text.includes('evolink') ||
          text.includes('[Scene]') || text.includes('ERROR') || text.includes('분석')) {
        console.log(`[BROWSER] ${text.slice(0, 300)}`);
      }
    });
    page.on('pageerror', err => {
      console.log(`[PAGE_ERROR] ${err.message.slice(0, 200)}`);
    });

    // 네트워크 요청 모니터링
    page.on('request', req => {
      const url = req.url();
      if (url.includes('evolink') || url.includes('kie.ai') || url.includes('127.0.0.1:9876')) {
        console.log(`[REQ] ${req.method()} ${url.slice(0, 120)}`);
      }
    });
    page.on('response', resp => {
      const url = resp.url();
      if (url.includes('evolink') || url.includes('kie.ai') || url.includes('127.0.0.1:9876')) {
        console.log(`[RES] ${resp.status()} ${url.slice(0, 120)}`);
      }
    });

    // ── 컴패니언 확인 ──
    const companionCheck = await fetch('http://127.0.0.1:9876/health').then(r => r.json()).catch(() => null);
    console.log(`[E2E] 컴패니언: ${companionCheck ? '✅ ' + (companionCheck as {version:string}).version : '❌ 미실행'}`);
    expect(companionCheck, '컴패니언이 실행 중이어야 합니다').toBeTruthy();

    // ── 로그인 ──
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ENV.E2E_TEST_EMAIL, password: ENV.E2E_TEST_PASSWORD, rememberMe: true }),
    });
    const loginData = await loginRes.json() as { token: string; user: unknown };

    await page.evaluate(({ token, user, evolinkKey, kieKey, ytKey, cloudName, uploadPreset }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolinkKey);
      localStorage.setItem('CUSTOM_KIE_KEY', kieKey);
      localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', ytKey);
      localStorage.setItem('CUSTOM_CLOUD_NAME', cloudName);
      localStorage.setItem('CUSTOM_UPLOAD_PRESET', uploadPreset);
    }, {
      token: loginData.token, user: loginData.user,
      evolinkKey: ENV.CUSTOM_EVOLINK_KEY || '',
      kieKey: ENV.CUSTOM_KIE_KEY || '',
      ytKey: ENV.CUSTOM_YOUTUBE_API_KEY || '',
      cloudName: ENV.CUSTOM_CLOUD_NAME || '',
      uploadPreset: ENV.CUSTOM_UPLOAD_PRESET || '',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await dismissAllModals(page);

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-01-loggedin.png') });

    // ── 프로젝트 생성 ──
    const newProjBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("+ 새 프로젝트 만들기")').first();
    if (await newProjBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newProjBtn.click();
      await page.waitForTimeout(1000);
    }
    const nameIn = page.locator('input[placeholder*="프로젝트"]').first();
    if (await nameIn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameIn.fill('E2E-891-' + Date.now());
    }
    const createBtn = page.locator('button:has-text("생성하기"), button:has-text("만들기"), button:has-text("+ 생성하기")').first();
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }
    await dismissAllModals(page);

    // ── 채널/영상 분석 탭 ──
    await page.locator('[data-tour="tab-channel-analysis"]').first().click({ force: true });
    await page.waitForTimeout(1500);
    await dismissAllModals(page);

    const videoTab = page.locator('button:has-text("영상 분석실")').first();
    if (await videoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await videoTab.click({ force: true });
      await page.waitForTimeout(1000);
    }
    await dismissAllModals(page);

    // ── URL 입력 ──
    const urlInput = page.locator('input[placeholder*="영상 URL"]').first();
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    await urlInput.click();
    await urlInput.fill(TEST_YOUTUBE_URL);
    await page.waitForTimeout(2000);

    const val = await urlInput.inputValue();
    console.log(`[E2E] URL: "${val}"`);
    expect(val).toContain('youtube.com');

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-02-url-entered.png') });

    // ── 스낵형 클릭 → 분석 ──
    const snackBtn = page.locator('button:has-text("스낵형"):not([disabled])').first();
    await expect(snackBtn).toBeVisible({ timeout: 5000 });
    await snackBtn.click({ force: true });
    console.log('[E2E] 스낵형 클릭');

    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-03-analyzing.png') });

    // ── API 응답 대기 ──
    console.log('[E2E] Evolink/Gemini API 응답 대기 (240초)...');
    let gotApiResponse = false;
    try {
      await page.waitForResponse(
        resp => {
          const url = resp.url();
          return (url.includes('evolink.ai') || url.includes('generativelanguage.googleapis.com')) && resp.status() === 200;
        },
        { timeout: 240_000 }
      );
      gotApiResponse = true;
      console.log('[E2E] ✅ AI API 첫 응답 수신');
    } catch {
      console.log('[E2E] ⚠️ API 타임아웃 240초');
      // 마지막 20개 로그 출력
      console.log('[E2E] 마지막 브라우저 로그:');
      allLogs.slice(-20).forEach(l => console.log('  ', l.slice(0, 200)));
    }

    // 스트리밍/분석 완료 대기
    if (gotApiResponse) {
      console.log('[E2E] 결과 대기 중...');
      try {
        await page.locator('button:has-text("CapCut"), button:has-text("Premiere")').first().waitFor({ timeout: 120_000 });
        console.log('[E2E] ✅ NLE 내보내기 버튼 출현');
      } catch {
        console.log('[E2E] 내보내기 버튼 120초 내 미출현');
        await page.waitForTimeout(30000);
      }
    }

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-04-analyzed.png') });

    // ── 결과 확인 ──
    const capBtn = page.locator('button:has-text("CapCut")').first();
    const hasCapCut = await capBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[E2E] CapCut 버튼: ${hasCapCut}`);

    if (!hasCapCut) {
      await page.screenshot({ path: path.join(E2E_DIR, '891-yt-05-no-results.png') });
      console.log('[E2E] ❌ 분석 실패 — CapCut 버튼 없음');
      console.log('[E2E] 최근 에러:', allLogs.filter(l => l.includes('[error]') || l.includes('ERROR')).slice(-10).join('\n'));
      expect(hasCapCut, 'CapCut 내보내기 버튼이 보여야 합니다').toBe(true);
      return;
    }

    // ── CapCut 내보내기 ──
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await capBtn.click({ force: true });
    console.log('[E2E] CapCut 클릭');

    // NLE 패키징 진행 대기
    await page.waitForTimeout(45000);
    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-05-exporting.png') });

    const download = await downloadPromise;
    let dlPath: string | null = null;
    if (download) {
      dlPath = path.join(E2E_DIR, 'dl-capcut-891-yt.zip');
      await download.saveAs(dlPath);
      console.log('[E2E] ✅ ZIP 저장');
    } else {
      console.log('[E2E] ZIP 미다운로드 — 컴패니언 직접설치');
    }

    await page.screenshot({ path: path.join(E2E_DIR, '891-yt-06-final.png') });

    // ── ZIP 검증 ──
    if (dlPath && fs.existsSync(dlPath)) {
      const size = fs.statSync(dlPath).size;
      expect(size).toBeGreaterThan(100);
      console.log(`[E2E] ZIP: ${(size / 1024 / 1024).toFixed(2)}MB`);

      const zipList = execSync(`unzip -l "${dlPath}"`).toString();
      expect(zipList).toContain('draft_content.json');
      expect(zipList).toContain('materials/video/');
      console.log('[E2E] ✅ ZIP 구조 OK');

      // draft_content.json 파싱
      const tmpDir = path.join(E2E_DIR, 'tmp-891-yt');
      execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && cd "${tmpDir}" && unzip -o "${dlPath}" "*/draft_content.json" 2>/dev/null || true`);
      const dp = execSync(`find "${tmpDir}" -name "draft_content.json"`).toString().trim().split('\n').filter(Boolean);
      expect(dp.length).toBeGreaterThan(0);

      const draft = JSON.parse(fs.readFileSync(dp[0], 'utf-8'));
      const vMats = draft?.materials?.videos || [];
      const vTrack = (draft?.tracks || []).find((t: { type: string }) => t.type === 'video');
      const segs = vTrack?.segments || [];

      console.log(`[E2E] materials.videos=${vMats.length}, segments=${segs.length}`);
      vMats.forEach((v: { id: string; material_name: string }, i: number) => {
        console.log(`  [${i}] ${v.material_name} (${v.id.slice(0, 8)}...)`);
      });

      expect(vMats.length).toBe(1); // 단일 YouTube URL → 1개 머티리얼
      expect(segs.length).toBeGreaterThan(0);

      // 세그먼트 material_id 유효성
      const ids = new Set(vMats.map((v: { id: string }) => v.id));
      for (const s of segs) {
        if (s.material_id) expect(ids.has(s.material_id)).toBe(true);
      }
      console.log('[E2E] ✅✅ 전체 검증 완료 — material_id 유효 ✅✅');

      execSync(`rm -rf "${tmpDir}"`);
    }
  });
});
