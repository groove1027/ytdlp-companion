/**
 * Playwright E2E Test — Issue #674
 * 사운드 스튜디오 오디오 업로드 → 전사 시작 버그 수정 검증
 * 인증 API 모킹 + 실제 KIE/Cloudinary API 호출
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output';

function createTestWav() {
  const sampleRate = 44100, duration = 1, numSamples = sampleRate * duration;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  const path = join(SCREENSHOT_DIR, 'test-audio.wav');
  writeFileSync(path, buffer);
  return path;
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[class*="fixed inset-0"]').forEach(el => {
      if (el.querySelector('rect') || el.querySelector('[mask]')) el.remove();
    });
    localStorage.setItem('onboarding-tour-completed', 'true');
    document.querySelectorAll('[data-announce-banner]').forEach(el => el.remove());
  });
  // 닫기/확인 버튼 클릭
  for (const text of ['닫기', '확인', '건너뛰기']) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(300);
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // 인증 API 모킹 — verifyToken이 성공하도록
  const fakeUser = { id: 'e2e-test', email: 'test@test.com', displayName: 'E2E Tester', role: 'user' };
  await page.route('**/api/auth/**', route => {
    const url = route.request().url();
    if (url.includes('/verify')) {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ valid: true, user: fakeUser }),
      });
    } else if (url.includes('/sync-project') || url.includes('/save-settings') || url.includes('/get-settings')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    } else {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 'e2e-token', user: fakeUser }),
      });
    }
  });

  // STT 관련 로그 수집
  const sttLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('STT') || text.includes('전사') || text.includes('Cloudinary') || text.includes('createTask') || text.includes('kie.ai')) {
      sttLogs.push(`[${msg.type()}] ${text.substring(0, 200)}`);
    }
  });

  try {
    console.log('=== Issue #674 Playwright E2E Test ===\n');

    // 1. 페이지 로드 + API 키/인증 주입
    console.log('STEP 1: 페이지 로드 + 인증 주입...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem('CUSTOM_KIE_KEY', 'REDACTED_EVOLINK_KEY');
      localStorage.setItem('CUSTOM_CLOUD_NAME', 'deucky7it');
      localStorage.setItem('CUSTOM_UPLOAD_PRESET', 'ml_default');
      localStorage.setItem('onboarding-tour-completed', 'true');
      localStorage.setItem('auth_token', 'e2e-test-token');
      localStorage.setItem('auth_user', JSON.stringify({ id: 'e2e-test', email: 'test@test.com', name: 'E2E Tester' }));
    });
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    console.log('  ✅ 완료');

    // 2. 오버레이 제거
    console.log('STEP 2: 오버레이 제거...');
    await dismissOverlays(page);
    console.log('  ✅ 완료');

    // 3. 사운드 스튜디오
    console.log('STEP 3: 사운드 스튜디오 탭...');
    await page.locator('button[title="사운드"]').first().click({ force: true });
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
    console.log('  ✅ 완료');

    // 4. 오디오 업로드 탭
    console.log('STEP 4: 오디오 업로드 탭...');
    await page.locator('button:has-text("오디오 업로드")').first().click({ force: true });
    await page.waitForTimeout(500);
    console.log('  ✅ 완료');

    // 5. 파일 업로드
    console.log('STEP 5: 테스트 오디오 파일 업로드...');
    const wavPath = createTestWav();
    const dropZone = page.locator('.border-dashed.rounded-xl').first();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      dropZone.click({ force: true }),
    ]);
    await fileChooser.setFiles(wavPath);
    await page.waitForTimeout(3000);

    const fileNameVisible = await page.locator('text=test-audio.wav').isVisible({ timeout: 3000 }).catch(() => false);
    const btnVisible = await page.locator('button:has-text("전사 시작")').isVisible({ timeout: 3000 }).catch(() => false);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '674-03-file-uploaded.png') });
    console.log(`  ✅ 파일 업로드 완료 (파일명: ${fileNameVisible}, 전사버튼: ${btnVisible})`);

    if (!btnVisible) {
      console.log('  ❌ 전사 시작 버튼 미표시');
      await page.screenshot({ path: join(SCREENSHOT_DIR, '674-error-no-btn.png') });
      return;
    }

    // 6. 전사 시작 클릭
    console.log('STEP 6: 전사 시작 클릭 (실제 API 호출)...');

    // API 응답 감시
    const apiResponses = [];
    page.on('response', resp => {
      const url = resp.url();
      if (url.includes('kie.ai') || url.includes('cloudinary.com')) {
        resp.text().then(body => {
          apiResponses.push({
            url: url.substring(0, 100),
            status: resp.status(),
            bodyPreview: body.substring(0, 200),
          });
        }).catch(() => {
          apiResponses.push({ url: url.substring(0, 100), status: resp.status(), bodyPreview: '[binary]' });
        });
      }
    });

    await page.locator('button:has-text("전사 시작")').click({ force: true });

    // Cloudinary 업로드 완료 대기 (최대 30초)
    console.log('  Cloudinary 업로드 + KIE createTask 대기 (최대 30초)...');

    // 진행 표시 관찰
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);

      // 진행 메시지 확인
      const progressEl = page.locator('text=/전사 중|업로드 중|태스크 생성/');
      const progressVisible = await progressEl.isVisible({ timeout: 500 }).catch(() => false);
      if (progressVisible) {
        const txt = await progressEl.textContent().catch(() => '');
        console.log(`  [${(i+1)*2}s] 진행: ${txt}`);
      }

      // 완료/에러 확인
      const done = await page.locator('text=전사 완료').isVisible({ timeout: 500 }).catch(() => false);
      if (done) {
        console.log(`  ✅ [${(i+1)*2}s] 전사 완료!`);
        break;
      }

      const errorEl = page.locator('[class*="text-red"]');
      if (await errorEl.isVisible({ timeout: 500 }).catch(() => false)) {
        const errText = await errorEl.textContent().catch(() => '');
        console.log(`  ⚠️ [${(i+1)*2}s] 에러 표시: "${errText?.substring(0, 100)}"`);
        break;
      }

      // 로그인 모달 확인
      const authModal = page.locator('text=회원가입');
      if (await authModal.isVisible({ timeout: 300 }).catch(() => false)) {
        console.log(`  ⚠️ [${(i+1)*2}s] 로그인 모달 표시 — 인증 우회 실패`);
        break;
      }

      if (apiResponses.length > 0 && i >= 5) break; // API 응답 있으면 충분히 대기
    }

    await page.screenshot({ path: join(SCREENSHOT_DIR, '674-04-result.png') });

    // API 응답 분석
    console.log(`\n  API 응답 (${apiResponses.length}개):`);
    for (const r of apiResponses) {
      console.log(`    ${r.status} ${r.url}`);
      if (r.bodyPreview && r.bodyPreview !== '[binary]') {
        console.log(`      body: ${r.bodyPreview.substring(0, 150)}`);
      }
    }

    // 핵심 검증
    const pageText = await page.textContent('body');

    // 1. 이전 버그 메시지 확인
    const oldBug = pageText.includes('전사 태스크 ID를 받지 못했습니다.');
    console.log(`\n  === 핵심 검증 ===`);
    console.log(`  ${!oldBug ? '✅ PASS' : '❌ FAIL'} 이전 버그 메시지 없음`);

    // 2. 사용자 친화적 메시지 확인 (에러 시)
    const hasError = await page.locator('[class*="text-red"]').isVisible({ timeout: 500 }).catch(() => false);
    if (hasError) {
      const errText = await page.locator('[class*="text-red"]').textContent().catch(() => '');
      const isTechnical = /taskId|response\.json|TypeError|code.*N\/A|createTask|recordInfo/.test(errText);
      console.log(`  ${!isTechnical ? '✅ PASS' : '❌ FAIL'} 에러 메시지가 비기술적`);
      console.log(`    메시지: "${errText?.substring(0, 100)}"`);
    } else {
      const isTranscribing = pageText.includes('전사 중');
      const isComplete = pageText.includes('전사 완료');
      if (isComplete) {
        console.log('  ✅ PASS 전사 완료 성공');
      } else if (isTranscribing) {
        console.log('  ✅ PASS 전사 진행 중 (정상 동작)');
      } else {
        console.log('  ℹ️ 특별한 상태 없음');
      }
    }

    // 결과 요약
    console.log('\n  =============================');
    console.log('  Issue #674 E2E 결과 요약');
    console.log('  =============================');
    console.log('  사운드 스튜디오 진입: ✅');
    console.log('  오디오 업로드 탭: ✅');
    console.log(`  파일 업로드: ${fileNameVisible ? '✅' : '❌'}`);
    console.log(`  전사 시작 버튼: ${btnVisible ? '✅' : '❌'}`);
    console.log(`  이전 버그 수정: ${!oldBug ? '✅' : '❌'}`);
    console.log(`  스크린샷: test/output/674-*.png`);

    if (sttLogs.length > 0) {
      console.log(`\n  STT 콘솔 로그 (${sttLogs.length}개):`);
      for (const log of sttLogs.slice(-10)) {
        console.log(`    ${log}`);
      }
    }

    console.log('\n=== 테스트 완료 ===');

  } catch (err) {
    console.error(`\n❌ 테스트 실패: ${err.message}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '674-error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
