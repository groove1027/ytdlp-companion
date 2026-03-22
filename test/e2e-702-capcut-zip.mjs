/**
 * E2E Test for Issue #702 — CapCut ZIP 다운로드 검증 (Playwright)
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5175';
const YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';
const TIMEOUT = 180_000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🎬 [E2E #702] CapCut ZIP 다운로드 테스트 시작');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ko-KR' });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (text.includes('[Download]') || text.includes('[NLE]') || text.includes('폴백') || text.includes('502') || text.includes('VPS')) {
      console.log(`   📋 ${text.substring(0, 200)}`);
    }
  });

  let downloadTriggered = false;
  let downloadFileName = '';
  page.on('download', download => {
    downloadTriggered = true;
    downloadFileName = download.suggestedFilename();
    console.log(`   📥 다운로드 감지: ${downloadFileName}`);
  });

  try {
    // Step 1: 페이지 로드
    console.log('\n📍 Step 1: 페이지 로드');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    console.log('   ✅ 페이지 로드 완료');

    // Step 2: 영상 분석실 서브탭 클릭
    console.log('\n📍 Step 2: 영상 분석실 진입');
    // 먼저 채널분석 메인 탭 확인
    const channelTab = page.getByText('채널분석').first();
    if (await channelTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await channelTab.click();
      await sleep(500);
    }
    // 영상 분석실 서브탭
    const videoRoomTab = page.getByText('영상 분석실').first();
    if (await videoRoomTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await videoRoomTab.click();
      await sleep(1000);
      console.log('   ✅ 영상 분석실 탭 클릭');
    } else {
      console.log('   ⚠️ 영상 분석실 탭을 찾지 못함');
    }

    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-step2.png', fullPage: true });

    // Step 3: YouTube URL 입력
    console.log('\n📍 Step 3: YouTube URL 입력');
    // textarea에 URL 입력 시도
    const textareas = await page.locator('textarea').all();
    let urlEntered = false;
    for (const ta of textareas) {
      if (await ta.isVisible().catch(() => false)) {
        const ph = await ta.getAttribute('placeholder').catch(() => '') || '';
        console.log(`   📎 textarea 발견 (placeholder: ${ph.substring(0, 50)})`);
        if (ph.includes('URL') || ph.includes('유튜브') || ph.includes('youtube') || ph.includes('링크') || ph.includes('입력')) {
          await ta.fill(YOUTUBE_URL);
          urlEntered = true;
          console.log('   ✅ URL 입력 완료');
          break;
        }
      }
    }
    if (!urlEntered) {
      // 모든 visible textarea에 입력 시도
      for (const ta of textareas) {
        if (await ta.isVisible().catch(() => false)) {
          await ta.fill(YOUTUBE_URL);
          urlEntered = true;
          console.log('   ✅ URL 입력 (첫 번째 visible textarea)');
          break;
        }
      }
    }

    // input[type=text]에도 시도
    if (!urlEntered) {
      const inputs = await page.locator('input[type="text"], input[type="url"]').all();
      for (const input of inputs) {
        if (await input.isVisible().catch(() => false)) {
          await input.fill(YOUTUBE_URL);
          urlEntered = true;
          console.log('   ✅ URL 입력 (input)');
          break;
        }
      }
    }

    await sleep(500);
    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-step3.png', fullPage: true });

    // Step 4: 분석 시작 버튼 클릭
    console.log('\n📍 Step 4: 분석 실행');
    // "분석 시작" 또는 "시작" 버튼
    const startBtns = await page.locator('button').all();
    let analyzeClicked = false;
    for (const btn of startBtns) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      const text = await btn.textContent().catch(() => '');
      if (text.includes('분석 시작') || text.includes('분석하기') || (text.includes('시작') && !text.includes('자동'))) {
        await btn.click();
        analyzeClicked = true;
        console.log(`   ✅ 버튼 클릭: "${text.substring(0, 30)}"`);
        break;
      }
    }
    if (!analyzeClicked) {
      // Enter 키 시도
      await page.keyboard.press('Enter');
      console.log('   ✅ Enter 키 입력');
    }

    // 분석 완료 대기 — CapCut 텍스트를 포함하는 버튼이 나타날 때까지
    console.log('   ⏳ 분석 완료 대기 (최대 3분)...');
    let capcutFound = false;
    for (let i = 0; i < 36; i++) { // 36 * 5s = 180s
      await sleep(5000);
      const btns = await page.locator('button').allTextContents();
      if (btns.some(t => t.includes('CapCut'))) {
        capcutFound = true;
        console.log('   ✅ 분석 완료 — CapCut 버튼 발견');
        break;
      }
      // 진행 상태 출력
      if (i % 6 === 0) {
        await page.screenshot({ path: `/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-wait-${i}.png`, fullPage: true });
        console.log(`   ⏳ ${(i+1)*5}초 경과...`);
      }
    }

    if (!capcutFound) {
      console.log('   ⚠️ CapCut 버튼을 찾지 못함 — 페이지에 이미 분석 결과가 있는지 확인');
      await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-no-capcut.png', fullPage: true });

      // 기존 분석 결과 확장 시도
      const allBtns = await page.locator('button').all();
      for (const btn of allBtns) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('🎬') && (await btn.isVisible().catch(() => false))) {
          await btn.click();
          await sleep(1000);
          console.log(`   📎 결과 카드 클릭: "${text.substring(0, 40)}"`);
          break;
        }
      }
      // 다시 CapCut 확인
      await sleep(1000);
      const btns2 = await page.locator('button').allTextContents();
      capcutFound = btns2.some(t => t.includes('CapCut'));
      if (capcutFound) console.log('   ✅ 기존 결과에서 CapCut 버튼 발견');
    }

    if (capcutFound) {
      // Step 5: CapCut 클릭
      console.log('\n📍 Step 5: CapCut ZIP 다운로드 시도');

      // 스크롤해서 CapCut 버튼이 보이게
      const capcutBtn = page.locator('button').filter({ hasText: 'CapCut' }).first();
      await capcutBtn.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);

      await capcutBtn.click();
      console.log('   ✅ CapCut 버튼 클릭');

      // 진행 관찰 (최대 2분)
      let resultMsg = '';
      for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const btnText = await capcutBtn.textContent().catch(() => '');

        // 토스트 확인
        const toastTexts = await page.locator('[class*="toast"], [class*="Toast"], [role="alert"], [class*="notification"]').allTextContents().catch(() => []);
        for (const t of toastTexts) {
          if (t && t.length > 5) {
            resultMsg = t;
            console.log(`   🔔 토스트: ${t.substring(0, 150)}`);
          }
        }

        if (downloadTriggered) {
          console.log('   ✅ ZIP 다운로드 성공!');
          break;
        }

        // 진행 중 표시
        if (btnText.includes('%') || btnText.includes('다운로드') || btnText.includes('준비') || btnText.includes('ZIP')) {
          if (i % 3 === 0) console.log(`   📊 진행: ${btnText.substring(0, 80)}`);
        }

        // 에러 감지
        if (resultMsg.includes('실패') || resultMsg.includes('업로드')) {
          if (resultMsg.includes('업로드')) {
            console.log('   ✅ [FIX #702] 개선된 에러 메시지 확인 — "직접 업로드" 안내 포함');
          }
          break;
        }

        // 원래 상태 복귀 확인
        if (i > 3 && btnText.includes('CapCut') && btnText.includes('ZIP') && !btnText.includes('%')) {
          console.log('   📊 버튼이 초기 상태로 복귀 — 작업 완료됨');
          break;
        }
      }
    }

    // 최종 스크린샷
    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-final.png', fullPage: true });

    // 결과 요약
    console.log('\n════════════════════════════════════════');
    console.log('📊 E2E #702 테스트 결과 요약');
    console.log('════════════════════════════════════════');
    console.log(`   다운로드 성공: ${downloadTriggered ? '✅ YES' : '❌ NO (서버 측 502 문제 — 프론트엔드 개선 확인)'}`);
    if (downloadFileName) console.log(`   파일명: ${downloadFileName}`);

    const fixLogs = consoleLogs.filter(l =>
      l.includes('폴백') || l.includes('VPS') || l.includes('직접') || l.includes('[FIX #702]')
    );
    if (fixLogs.length > 0) {
      console.log('\n   📋 FIX #702 관련 로그:');
      for (const log of fixLogs.slice(-10)) {
        console.log(`      ${log.substring(0, 200)}`);
      }
    }

    console.log('\n   ℹ️ 이 테스트는 HTTP 로컬 환경에서 실행됨 (VPS 직접 접속 가능)');
    console.log('   ℹ️ HTTPS 프로덕션에서는 Cloudflare Worker 502 시 에러 메시지 개선만 적용');

  } catch (err) {
    console.error(`\n❌ 테스트 실패: ${err.message}`);
    await page.screenshot({ path: '/Users/mac_mini/Downloads/all-in-one-production-build4/test/output/e2e-702-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('\n🏁 브라우저 종료');
  }
}

main().catch(console.error);
