/**
 * Debug helper: 영상 분석 UI flow 진단 — 어디서 막히는지 단계별 화면 + 버튼 구조 추적
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5174';
const E2E_DIR = path.resolve(__dirname);

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    // [FIX] 숫자도 허용 (E2E_TEST_EMAIL의 '2' 등)
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv();

async function dismissAllModals(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0').forEach((el) => {
      const z = window.getComputedStyle(el).zIndex;
      if (parseInt(z) >= 100) (el as HTMLElement).remove();
    });
  });
  await page.waitForTimeout(300);
}

async function snapButtons(page: import('@playwright/test').Page, label: string) {
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map((b, i) => ({
      idx: i,
      text: (b.textContent || '').trim().slice(0, 60),
      visible: !(b as HTMLElement).hidden && (b as HTMLElement).offsetParent !== null,
      disabled: (b as HTMLButtonElement).disabled,
    })).filter(b => b.text && b.visible);
  });
  console.log(`[Debug ${label}] visible buttons (${buttons.length}):`);
  buttons.slice(0, 30).forEach(b => {
    console.log(`  [${b.idx}] ${b.disabled ? '⊘' : ' '} "${b.text}"`);
  });
}

test.describe('UI Debug', () => {
  test('영상 분석 UI flow 단계별 추적', async ({ page }) => {
    test.setTimeout(300_000);

    // 브라우저 console 캡처
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('Analy')) {
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => console.log('[Browser pageerror]', err.message));

    // ── 0. 로그인 ──
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
    console.log('[Debug] login status:', loginRes.status);
    const loginText = await loginRes.text();
    console.log('[Debug] login body:', loginText.slice(0, 200));
    console.log('[Debug] env email:', JSON.stringify(ENV.E2E_TEST_EMAIL));
    console.log('[Debug] env password length:', (ENV.E2E_TEST_PASSWORD || '').length);
    const loginData = JSON.parse(loginText) as { token: string; user: unknown };
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
    await dismissAllModals(page);

    // 단계별 token 확인
    const t0 = await page.evaluate(() => ({
      auth_token: !!localStorage.getItem('auth_token'),
      auth_user: !!localStorage.getItem('auth_user'),
    }));
    console.log('[Debug T0 reload 직후]:', JSON.stringify(t0));

    await page.screenshot({ path: path.join(E2E_DIR, 'debug-01-loggedin.png') });
    await snapButtons(page, '01-loggedin');

    // ── 1. 새 프로젝트 ──
    const t1 = await page.evaluate(() => ({
      auth_token: !!localStorage.getItem('auth_token'),
      sessAuth: !!sessionStorage.getItem('auth_token'),
    }));
    console.log('[Debug T1 새 프로젝트 진입 직전]:', JSON.stringify(t1));

    // 새 프로젝트 버튼 단계별 검증
    const newProjectBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("+ 새 프로젝트 만들기")').first();
    const np_visible = await newProjectBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[Debug T1] newProject visible=${np_visible}`);
    if (np_visible) {
      await newProjectBtn.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(E2E_DIR, 'debug-T1a-newproject-clicked.png') });
    }

    // 모달이 떴는지 확인 + 모든 input 출력
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map((inp, i) => ({
        idx: i,
        type: inp.type,
        placeholder: inp.placeholder,
        visible: (inp as HTMLElement).offsetParent !== null,
      })).filter(i => i.visible);
    });
    console.log('[Debug T1] visible inputs:', JSON.stringify(inputs));

    const nameInput = page.locator('input[placeholder*="프로젝트"], input[placeholder*="이름"]').first();
    const ni_visible = await nameInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Debug T1] nameInput visible=${ni_visible}`);
    if (ni_visible) {
      await nameInput.fill('Debug-1066');
      await page.waitForTimeout(300);
    }

    const createBtn = page.locator('button:has-text("생성하기"), button:has-text("만들기"), button:has-text("+ 생성하기"), button:has-text("프로젝트 생성")').first();
    const cb_visible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Debug T1] createBtn visible=${cb_visible}`);
    if (cb_visible) {
      await createBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }
    await dismissAllModals(page);
    await page.screenshot({ path: path.join(E2E_DIR, 'debug-T1b-after-create.png') });

    // ── 2. 채널/영상 분석 탭 ──
    await page.locator('button:has-text("채널/영상 분석")').first().click({ force: true });
    await page.waitForTimeout(1500);
    await dismissAllModals(page);
    const videoTab = page.locator('button:has-text("영상 분석실")').first();
    if (await videoTab.isVisible({ timeout: 3000 })) {
      await videoTab.click({ force: true });
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: path.join(E2E_DIR, 'debug-02-analysis-room.png') });
    await snapButtons(page, '02-analysis-room');

    // ── 3. 영상 업로드 모드 ──
    const uploadBtn = page.locator('button:has-text("영상 업로드")').first();
    if (await uploadBtn.isVisible({ timeout: 3000 })) {
      await uploadBtn.click({ force: true });
      await page.waitForTimeout(500);
    }

    // 영상 분석실의 file input 디버그 — 어떤 input들이 있는지 먼저 출력
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="file"]')).map((inp, i) => ({
        idx: i,
        accept: (inp as HTMLInputElement).accept || '(none)',
        multiple: (inp as HTMLInputElement).multiple,
        hidden: (inp as HTMLElement).className.includes('hidden') || (inp as HTMLElement).hidden,
      }));
    });
    console.log('[Debug 03] file inputs:', JSON.stringify(allInputs));

    // 영상 input은 첫 번째 video accept input 또는 multiple
    const videoInputIdx = allInputs.findIndex(i => i.accept.includes('video'));
    console.log(`[Debug 03] video input index: ${videoInputIdx}`);

    if (videoInputIdx >= 0) {
      // setInputFiles는 nth로 (locator.nth)
      const fileInput = page.locator('input[type="file"]').nth(videoInputIdx);
      await fileInput.setInputFiles({
        name: '1066-test-small.mp4',
        mimeType: 'video/mp4',
        buffer: fs.readFileSync(path.join(E2E_DIR, '1066-test-small.mp4')),
      });
      await page.waitForTimeout(3000);
      console.log('[Debug 03] 영상 set 완료');
    } else {
      console.log('[Debug 03] video input 못 찾음 — 영상 업로드 모드 진입 안 됨?');
    }

    // hasInput state 확인 — uploadedFiles 검증
    const stateCheck = await page.evaluate(() => {
      const cards = document.querySelectorAll('button[type="button"]');
      const cardStates = Array.from(cards).slice(35, 45).map((c, i) => ({
        idx: 35 + i,
        text: (c.textContent || '').slice(0, 40),
        disabled: (c as HTMLButtonElement).disabled,
      }));
      return cardStates;
    });
    console.log('[Debug] 카드 상태:', JSON.stringify(stateCheck, null, 2));

    await page.screenshot({ path: path.join(E2E_DIR, 'debug-03-uploaded.png') });
    await snapButtons(page, '03-uploaded');

    // ── 4. 프리셋 선택 + 분석 시작 후보 모두 출력 ──
    // 모든 텍스트가 "분석"을 포함하는 버튼 출력
    const analyzeButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((b, i) => ({
        idx: i,
        text: (b.textContent || '').trim().slice(0, 80),
        visible: (b as HTMLElement).offsetParent !== null,
        disabled: (b as HTMLButtonElement).disabled,
      })).filter(b => b.visible && (b.text.includes('분석') || b.text.includes('티키') || b.text.includes('스낵') || b.text.includes('리메')));
    });
    console.log(`[Debug 04] 분석/프리셋 관련 버튼 (${analyzeButtons.length}):`);
    analyzeButtons.forEach(b => {
      console.log(`  [${b.idx}] ${b.disabled ? '⊘' : ' '} "${b.text}"`);
    });

    // 페이지 스크롤 다운 — 프리셋 카드 영역 노출
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(E2E_DIR, 'debug-03b-scrolled.png'), fullPage: true });

    // (방법 1) Playwright locator로 직접 — 더 정확
    console.log('[Debug 04] 티키타카 카드 locator로 클릭 시도');
    const tikiCard = page.locator('button:has-text("티키타카")').first();
    const isVisible = await tikiCard.isVisible({ timeout: 5000 });
    const isDisabled = await tikiCard.isDisabled({ timeout: 1000 }).catch(() => null);
    console.log(`[Debug 04] 티키타카 visible=${isVisible} disabled=${isDisabled}`);

    if (isVisible) {
      await tikiCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(E2E_DIR, 'debug-03c-tiki-visible.png') });

      // localStorage 키 + uploadedFiles 상태 확인
      const preCheck = await page.evaluate(() => {
        return {
          evolinkKey: !!localStorage.getItem('CUSTOM_EVOLINK_KEY'),
          kieKey: !!localStorage.getItem('CUSTOM_KIE_KEY'),
          authToken: !!localStorage.getItem('auth_token'),
          fileInputCount: (document.querySelector('input[type="file"]') as HTMLInputElement)?.files?.length || 0,
        };
      });
      console.log('[Debug 04] preCheck:', JSON.stringify(preCheck));

      // disabled 상태에서도 강제 click 시도
      await tikiCard.click({ force: true, timeout: 5000 });
      console.log('[Debug 04] 티키타카 click 완료');
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: path.join(E2E_DIR, 'debug-04-after-tiki-click.png') });
    await snapButtons(page, '04-after-tiki-click');

    // 분석이 시작됐는지 확인 — "분석 중" 또는 progress indicator
    const isAnalyzing = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        analyzing: text.includes('분석 중') || text.includes('분석중'),
        loading: text.includes('로딩') || text.includes('처리'),
        ready: text.includes('준비') || text.includes('완료'),
      };
    });
    console.log('[Debug 04] 분석 상태:', JSON.stringify(isAnalyzing));

    // 30초 더 기다려서 evolink 응답 대기
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes('evolink') && resp.status() === 200,
        { timeout: 120_000 },
      );
      console.log('[Debug 04] Evolink 응답 수신!');
    } catch {
      console.log('[Debug 04] Evolink 응답 대기 타임아웃');
    }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(E2E_DIR, 'debug-05-final.png') });
    await snapButtons(page, '05-final');

    // 다시 분석 관련 버튼 확인 (프리셋 선택 후 분석 시작 버튼이 나타나는 경우)
    const analyzeButtons2 = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((b, i) => ({
        idx: i,
        text: (b.textContent || '').trim().slice(0, 80),
        visible: (b as HTMLElement).offsetParent !== null,
        disabled: (b as HTMLButtonElement).disabled,
      })).filter(b => b.visible && b.text.includes('분석'));
    });
    console.log(`[Debug 04b] 분석 관련 버튼 (${analyzeButtons2.length}):`);
    analyzeButtons2.forEach(b => {
      console.log(`  [${b.idx}] ${b.disabled ? '⊘' : ' '} "${b.text}"`);
    });
  });
});
