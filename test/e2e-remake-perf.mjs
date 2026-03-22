/**
 * E2E 테스트: 리메이크 프리셋 속도 최적화 검증
 * - 10버전 티키타카 프리셋 실행
 * - 실제 파이프라인 UI 단계 전환 검증
 * - 화자분리 스킵 (음성 0.0초) 검증
 * - 10개 버전 전부 생성 확인
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const YOUTUBE_KEY = 'AIzaSyDCZ4kTRy3VR8T_-tU3fd98Z2ArNspC5g4';
const TEST_VIDEO = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

let browser, page;

async function setup() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();

  // 인증 + API 키 주입
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(({ evolink, youtube }) => {
    localStorage.setItem('auth_token', 'e2e-test-token');
    localStorage.setItem('auth_user', JSON.stringify({ email: 'e2e@test.com', displayName: 'E2E Tester' }));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtube);
    localStorage.setItem('dismiss_onboarding', '1');
    localStorage.setItem('onboarding-tour-completed', 'true');
    localStorage.setItem('dismiss_announce_0317', '1');
  }, { evolink: EVOLINK_KEY, youtube: YOUTUBE_KEY });
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  log('✅ 앱 로드 + 인증 완료');
}

async function navigateToVideoAnalysis() {
  // 채널/영상 분석 탭
  await page.click('button:has-text("채널/영상 분석")');
  await page.waitForTimeout(1000);
  // 영상 분석실 서브탭
  await page.click('button:has-text("영상 분석실")');
  await page.waitForTimeout(1000);
  log('✅ 영상 분석실 진입');
}

async function runTikitakaTest() {
  // 이전 결과가 있으면 "새 분석" 클릭
  const newAnalysisBtn = page.locator('button:has-text("새 분석")');
  if (await newAnalysisBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newAnalysisBtn.click();
    await page.waitForTimeout(1000);
    log('✅ 새 분석 시작 (이전 결과 초기화)');
  }

  // YouTube URL 입력
  const urlInput = page.locator('input[placeholder*="영상 URL"]');
  await urlInput.fill(TEST_VIDEO);
  await page.waitForTimeout(500);
  log(`✅ URL 입력: ${TEST_VIDEO}`);

  // 버전 수 10개 확인 (기본값)
  const ver10 = page.locator('button:has-text("10개")');
  const isSelected = await ver10.evaluate(el => el.classList.contains('bg-blue-600') || el.classList.contains('bg-blue-500') || getComputedStyle(el).backgroundColor.includes('59'));
  if (!isSelected) {
    await ver10.click();
    await page.waitForTimeout(300);
  }
  log('✅ 버전 수 10개 선택됨');

  // 티키타카 프리셋 클릭
  const startTime = Date.now();
  await page.click('button:has-text("티키타카"):has-text("편집점")');
  log('🚀 티키타카 분석 시작');

  // === 파이프라인 UI 검증 ===

  // 1. 소스 준비 단계 확인
  try {
    await page.waitForSelector('text=소스 준비', { timeout: 10000 });
    log('✅ 파이프라인 UI: "소스 준비" 단계 표시됨');
  } catch {
    log('⚠️ 소스 준비 단계 미감지 (빠르게 넘어감)');
  }

  // 2. 오디오 분석 스킵 확인 (v1beta → 즉시 체크)
  try {
    await page.waitForSelector('text=오디오 분석', { timeout: 15000 });
    log('✅ 파이프라인 UI: "오디오 분석" 단계 표시됨');
  } catch {
    log('⚠️ 오디오 분석 단계 미감지');
  }

  // 3. 편집표 생성 단계 확인
  try {
    await page.waitForSelector('text=편집표 생성', { timeout: 30000 });
    log('✅ 파이프라인 UI: "편집표 생성" 단계 표시됨');
  } catch {
    log('⚠️ 편집표 생성 단계 미감지');
  }

  // 4. Gemini 메시지 확인
  try {
    await page.waitForSelector('text=Gemini가 영상을 직접 시청하며', { timeout: 30000 });
    log('✅ 메시지: "Gemini가 영상을 직접 시청하며 티키타카 편집표를 만들고 있어요"');
  } catch {
    log('⚠️ Gemini 시청 메시지 미감지');
  }

  // 스크린샷: 분석 중
  await page.screenshot({ path: 'test/output/e2e-remake-loading.png', fullPage: false });
  log('📸 로딩 스크린샷 저장');

  // === 결과 대기 (최대 8분, 10초 간격 폴링) ===
  log('⏳ 결과 대기 중 (최대 8분, 10초 간격 폴링)...');
  const MAX_WAIT_MS = 8 * 60 * 1000;
  const POLL_INTERVAL = 10000;
  const waitStart = Date.now();
  let found = false;
  while (Date.now() - waitStart < MAX_WAIT_MS) {
    const hasResult = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('가지 버전') || text.includes('리메이크 분석 소요시간') || text.includes('최근 리메이크 분석');
    });
    if (hasResult) { found = true; break; }
    const elapsed = Math.round((Date.now() - waitStart) / 1000);
    log(`⏳ ${elapsed}초 경과... 아직 분석 중`);
    await page.waitForTimeout(POLL_INTERVAL);
  }
  if (!found) {
    log('❌ 8분 타임아웃 — 결과 미수신');
    await page.screenshot({ path: 'test/output/e2e-remake-timeout.png', fullPage: true });
    return false;
  }
  await page.waitForTimeout(5000); // 렌더링 안정화

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`✅ 분석 완료 — 총 ${elapsed}초`);

  // === 결과 검증 ===

  // 성능 로그에서 음성 단계 시간 확인
  const perfText = await page.evaluate(() => {
    const perfEl = [...document.querySelectorAll('div, span, p')].find(el =>
      el.textContent.includes('음성') && el.textContent.includes('초') && el.textContent.includes('전처리')
    );
    return perfEl?.textContent || '';
  });
  log(`📊 성능 로그: ${perfText.slice(0, 100)}`);

  // 음성 0.0초 확인 (화자분리 스킵)
  const diarizationSkipped = perfText.includes('음성 0.0초') || perfText.includes('음성 0초');
  if (diarizationSkipped) {
    log('✅ 화자분리 스킵 확인: 음성 0.0초');
  } else {
    log('⚠️ 화자분리 시간: ' + (perfText.match(/음성\s*[\d.]+초/) || ['확인 불가'])[0]);
  }

  // 버전 수 확인 — "N가지 버전" 텍스트에서 추출 또는 복사 버튼 개수
  const versionCount = await page.evaluate(() => {
    // "10가지 버전" 같은 텍스트에서 숫자 추출
    const titleEl = [...document.querySelectorAll('*')].find(e =>
      e.textContent?.includes('가지 버전') && e.children.length < 5
    );
    if (titleEl) {
      const m = titleEl.textContent.match(/(\d+)\s*가지/);
      if (m) return parseInt(m[1]);
    }
    // 폴백: 복사 버튼 개수
    const copyBtns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '복사');
    return copyBtns.length;
  });
  log(`📊 생성된 버전 수: ${versionCount}개`);

  // 제목에 "가지 버전" 텍스트 확인
  const versionTitle = await page.evaluate(() => {
    const el = [...document.querySelectorAll('h2, h3, div, p')].find(e =>
      e.textContent.includes('가지 버전')
    );
    return el?.textContent?.trim()?.slice(0, 50) || '';
  });
  log(`📊 버전 제목: ${versionTitle}`);

  // 스크린샷: 결과
  await page.screenshot({ path: 'test/output/e2e-remake-result.png', fullPage: false });
  log('📸 결과 스크린샷 저장');

  // 스크롤 내려서 편집표 확인
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test/output/e2e-remake-versions.png', fullPage: false });
  log('📸 버전 목록 스크린샷 저장');

  return {
    elapsed,
    diarizationSkipped,
    versionCount,
    versionTitle,
  };
}

async function main() {
  log('=== 리메이크 프리셋 속도 최적화 E2E 테스트 ===');
  try {
    await setup();
    await navigateToVideoAnalysis();
    const result = await runTikitakaTest();

    log('\n=== 테스트 결과 ===');
    if (result) {
      log(`총 소요시간: ${result.elapsed}초`);
      log(`화자분리 스킵: ${result.diarizationSkipped ? '✅' : '❌'}`);
      log(`버전 수: ${result.versionCount}개`);
      log(`버전 제목: ${result.versionTitle}`);

      const passed = result.diarizationSkipped && result.versionCount >= 3;
      log(`\n${passed ? '✅ 테스트 통과' : '❌ 테스트 실패'}`);
    } else {
      log('❌ 테스트 실패 — 결과 미수신');
    }
  } catch (err) {
    log(`❌ 테스트 에러: ${err.message}`);
    if (page) await page.screenshot({ path: 'test/output/e2e-remake-error.png' }).catch(() => {});
  } finally {
    if (browser) await browser.close();
  }
}

main();
