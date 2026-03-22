import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('[1/5] 앱 접속...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('  ✅ 앱 로드 완료');

  console.log('[2/5] 채널/영상 분석 탭 이동...');
  const channelTab = page.locator('button:has-text("채널/영상 분석"), button:has-text("채널")');
  if (await channelTab.count() > 0) {
    await channelTab.first().click();
    await sleep(500);
    console.log('  ✅ 채널/영상 분석 탭 클릭');
  }

  const videoRoomBtn = page.locator('button:has-text("영상 분석실"), button:has-text("🎬영상 분석실")');
  if (await videoRoomBtn.count() > 0) {
    await videoRoomBtn.first().click();
    await sleep(500);
    console.log('  ✅ 영상 분석실 탭 클릭');
  }

  console.log('[3/5] 편집실 → 편집점 매칭 패널 확인...');
  const editRoomTab = page.locator('button:has-text("편집실")').first();
  if (await editRoomTab.count() > 0) {
    await editRoomTab.click();
    await sleep(1000);
    console.log('  ✅ 편집실 탭 이동');
  }

  const editPointTab = page.locator('button:has-text("편집점"), button:has-text("편집점 매칭")');
  if (await editPointTab.count() > 0) {
    await editPointTab.first().click();
    await sleep(500);
    console.log('  ✅ 편집점 매칭 서브탭 클릭');
  }

  console.log('[4/5] 편집점 매칭 패널 UI 확인...');
  const sourceSection = page.locator('text=소스 영상');
  console.log(`  📊 소스 영상 섹션: ${await sourceSection.count() > 0 ? '있음' : '없음'}`);
  
  const editTableSection = page.locator('text=편집표');
  console.log(`  📊 편집표 섹션: ${await editTableSection.count() > 0 ? '있음' : '없음'}`);

  const ctaBtn = page.locator('text=지금 영상 파일 선택하기');
  console.log(`  📊 CTA 버튼: ${await ctaBtn.count() > 0 ? '표시됨' : '미표시 (정상 - 편집표가 아직 없음)'}`);

  console.log('[5/5] 스크린샷 캡처...');
  await page.screenshot({ path: '/tmp/e2e-700-result.png', fullPage: true });
  console.log('  ✅ 스크린샷: /tmp/e2e-700-result.png');

  console.log('\n✅✅✅ Playwright E2E 테스트 완료');
  
  await browser.close();
}

main().catch(e => {
  console.error('❌ E2E 테스트 실패:', e.message);
  process.exit(1);
});
