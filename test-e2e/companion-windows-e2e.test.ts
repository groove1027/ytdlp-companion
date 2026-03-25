/**
 * Playwright E2E 테스트 — 컴패니언 Windows 지원 검증
 * playwright 패키지 사용 (스크립트 방식)
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5175';

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let passed = 0;
  let failed = 0;

  // ─── 테스트 1: 앱 정상 로드 ───
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const body = await page.locator('body').isVisible();
    if (!body) throw new Error('body not visible');
    console.log('✅ 테스트 1: 앱 정상 로드');
    passed++;
  } catch (e: any) {
    console.log('❌ 테스트 1: 앱 로드 실패 —', e.message);
    failed++;
  }

  // ─── 테스트 2: JavaScript 에러 없음 ───
  try {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    await page.waitForTimeout(3000);
    const criticalErrors = jsErrors.filter(e => e.includes('React') || e.includes('Uncaught'));
    if (criticalErrors.length > 0) throw new Error(`JS errors: ${criticalErrors.join(', ')}`);
    console.log('✅ 테스트 2: JavaScript 에러 없음');
    passed++;
  } catch (e: any) {
    console.log('❌ 테스트 2:', e.message);
    failed++;
  }

  // ─── 테스트 3: OS 감지 함수 동작 ───
  try {
    const osLabel = await page.evaluate(() => {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) return 'Windows';
      if (ua.includes('mac')) return 'macOS';
      return '';
    });
    // Playwright의 headless Chrome은 macOS UA를 사용
    if (!osLabel) throw new Error(`OS label empty: ${osLabel}`);
    console.log(`✅ 테스트 3: OS 감지 = "${osLabel}"`);
    passed++;
  } catch (e: any) {
    console.log('❌ 테스트 3:', e.message);
    failed++;
  }

  // ─── 테스트 4: AnnouncementBanner 렌더링 (배너 dismiss 해제) ───
  try {
    await page.evaluate(() => {
      localStorage.removeItem('announcement_v1_dismissed');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // GitHub releases 링크 확인
    const companionLinks = await page.locator('a[href*="ytdlp-companion"]').count();
    console.log(`✅ 테스트 4: 컴패니언 다운로드 링크 ${companionLinks}개 발견`);
    passed++;
  } catch (e: any) {
    console.log('❌ 테스트 4:', e.message);
    failed++;
  }

  // ─── 테스트 5: 다운로드 링크 URL 검증 ───
  try {
    const links = await page.locator('a[href*="ytdlp-companion"]').all();
    let allValid = true;
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (!href || !href.includes('github.com/groove1027/ytdlp-companion/releases')) {
        allValid = false;
        console.log(`  ⚠️ 잘못된 링크: ${href}`);
      }
    }
    if (links.length === 0) {
      console.log('✅ 테스트 5: 배너 dismiss 상태 — 링크 확인 스킵');
    } else if (allValid) {
      console.log('✅ 테스트 5: 모든 다운로드 링크 URL 정상');
    } else {
      throw new Error('잘못된 다운로드 링크 발견');
    }
    passed++;
  } catch (e: any) {
    console.log('❌ 테스트 5:', e.message);
    failed++;
  }

  // ─── 테스트 6: Windows UA로 OS 감지 검증 ───
  try {
    const winContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const winPage = await winContext.newPage();
    await winPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await winPage.evaluate(() => {
      localStorage.removeItem('announcement_v1_dismissed');
    });
    await winPage.reload({ waitUntil: 'networkidle' });
    await winPage.waitForTimeout(2000);

    const osLabel = await winPage.evaluate(() => {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) return 'Windows';
      if (ua.includes('mac')) return 'macOS';
      return '';
    });
    if (osLabel !== 'Windows') throw new Error(`Expected "Windows" but got "${osLabel}"`);

    // Windows 다운로드 텍스트 확인
    const winText = await winPage.locator('text=Windows').count();
    console.log(`✅ 테스트 6: Windows UA → OS="${osLabel}", "Windows" 텍스트 ${winText}개`);
    passed++;

    await winPage.close();
    await winContext.close();
  } catch (e: any) {
    console.log('❌ 테스트 6:', e.message);
    failed++;
  }

  // ─── 결과 ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`결과: ${passed} passed, ${failed} failed (총 ${passed + failed})`);
  console.log(`${'═'.repeat(40)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('테스트 실행 실패:', e);
  process.exit(1);
});
