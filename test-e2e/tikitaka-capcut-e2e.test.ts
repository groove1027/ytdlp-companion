import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3000';
const YOUTUBE_URL = 'https://www.youtube.com/shorts/S4nf_6SIK5o';
const PREFIX = 'test-e2e/tikitaka-capcut';

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
function envVal(key: string): string {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
}

test('티키타카 → 버전 펼치기 → CapCut 내보내기', async ({ page }) => {
  test.setTimeout(600_000);

  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`));
  page.on('pageerror', err => { console.log(`[PAGE ERROR] ${err.message}`); consoleLogs.push(`[PAGEERROR] ${err.message}`); });
  page.on('crash', () => { console.log('[CRASH] Tab crashed'); consoleLogs.push('[CRASH]'); });

  // ── 1. 로그인 ──
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: envVal('E2E_TEST_EMAIL'), password: envVal('E2E_TEST_PASSWORD'), rememberMe: true }),
  });
  const loginData = await loginRes.json() as { token: string; user: unknown };
  await page.evaluate(({ token, user, keys }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', keys.evolink);
    localStorage.setItem('CUSTOM_KIE_KEY', keys.kie);
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', keys.youtube);
    localStorage.setItem('CUSTOM_CLOUD_NAME', keys.cloudName);
    localStorage.setItem('CUSTOM_UPLOAD_PRESET', keys.uploadPreset);
  }, {
    token: loginData.token, user: loginData.user,
    keys: { evolink: envVal('CUSTOM_EVOLINK_KEY'), kie: envVal('CUSTOM_KIE_KEY'), youtube: envVal('CUSTOM_YOUTUBE_API_KEY'), cloudName: envVal('CUSTOM_CLOUD_NAME'), uploadPreset: envVal('CUSTOM_UPLOAD_PRESET') },
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('[1] 로그인 완료');

  // ── 2. 영상 분석실 ──
  await page.locator('button, [role="tab"], a').filter({ hasText: /채널.*분석|영상.*분석/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button, [role="tab"]').filter({ hasText: '영상 분석실' }).first().click();
  await page.waitForTimeout(1500);
  // 새 분석
  const newBtn = page.locator('button').filter({ hasText: '새 분석' }).first();
  if (await newBtn.isVisible().catch(() => false)) await newBtn.click();
  await page.waitForTimeout(1000);
  console.log('[2] 영상 분석실');

  // ── 3. URL + 1개 버전 + 티키타카 ──
  const linkBtn = page.locator('button').filter({ hasText: '영상 링크' }).first();
  if (await linkBtn.isVisible().catch(() => false)) await linkBtn.click();
  await page.locator('input[placeholder*="URL"], input[placeholder*="영상"]').first().fill(YOUTUBE_URL);
  const v1Btn = page.locator('button').filter({ hasText: '1개' }).first();
  if (await v1Btn.isVisible().catch(() => false)) await v1Btn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${PREFIX}-03-ready.png`, fullPage: true });

  // 티키타카 클릭 = 분석 시작
  await page.locator('button').filter({ hasText: '티키타카' }).first().click();
  console.log('[3] 티키타카 분석 시작');

  // ── 4. 분석 완료 대기 ──
  let done = false;
  for (let s = 15; s <= 480; s += 15) {
    await page.waitForTimeout(15_000);
    if (s % 60 === 0) await page.screenshot({ path: `${PREFIX}-04-wait-${s}.png`, fullPage: true });
    const sendBtn = await page.locator('button').filter({ hasText: '편집실로 보내기' }).count() > 0;
    const spinner = await page.locator('.animate-spin').count() > 0;
    console.log(`[4] ${s}초 — spinner=${spinner}, 편집실=${sendBtn}`);
    if (sendBtn) { done = true; console.log(`[4] ✅ 완료 (${s}초)`); break; }
  }
  if (!done) {
    await page.screenshot({ path: `${PREFIX}-04-timeout.png`, fullPage: true });
    // 콘솔 에러 덤프
    const errLogs = consoleLogs.filter(l => l.includes('error') || l.includes('ERROR') || l.includes('429') || l.includes('timeout') || l.includes('실패'));
    console.log('[콘솔 에러 (최근 20개)]:\n', errLogs.slice(-20).join('\n'));
    throw new Error('분석 타임아웃');
  }
  await page.screenshot({ path: `${PREFIX}-05-result.png`, fullPage: true });

  // ── 5. 첫 번째 버전 카드 펼치기 ──
  // 버전 카드 제목을 클릭하면 expandedId가 설정되고 NLE 버튼이 나타남
  // 제목 버튼: <button onClick={setExpandedId}><span>1</span><span>제목...</span></button>
  // 제목 옆에 "복사" 버튼이 있으므로 "복사"가 아닌 것 중 첫 번째 클릭

  // 결과 영역으로 스크롤
  const resultSection = page.locator('text=/리메이크.*버전/').first();
  if (await resultSection.isVisible().catch(() => false)) {
    await resultSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  // "컷" 배지가 있는 버전 카드의 제목 영역 클릭 (버전 번호 1이 포함된 버튼)
  // 구조: button > span(번호) + span(제목) — 이 버튼을 클릭하면 펼침
  const versionTitleBtns = page.locator('button').filter({ hasText: /컷$/ });
  let expandClicked = false;

  // "N컷" 텍스트가 있는 span 옆의 chevron 버튼 찾기
  // 실제로는 제목 텍스트를 포함하는 긴 버튼을 클릭하면 됨
  // 버전 1의 제목이 뭔지 모르므로, "복사" 버튼이 아닌 첫 번째 긴 제목 버튼 찾기

  // 버전 카드의 제목 영역 전체를 감싸는 div를 찾아서 그 안의 첫 번째 버튼 클릭
  // 가장 확실한 방법: 특정 패턴의 chevron SVG가 있는 버튼
  const chevronPath = 'M19 9l-7 7-7-7';
  const allChevrons = page.locator(`button:has(svg path[d="${chevronPath}"])`);
  const chevCount = await allChevrons.count();
  console.log(`[5] chevron 버튼: ${chevCount}개`);

  // 버전 결과 영역의 chevron만 필터 — "리메이크" 텍스트 아래에 있는 것들
  // 결과 영역 아래에서만 찾기 위해 스크롤 후 위치 기반 필터
  for (let i = 0; i < chevCount; i++) {
    const btn = allChevrons.nth(i);
    const box = await btn.boundingBox();
    // 화면 상단(네비게이션)이 아닌 곳의 chevron만
    if (box && box.y > 300) {
      await btn.click();
      expandClicked = true;
      console.log(`[5] chevron[${i}] 클릭 (y=${Math.round(box.y)})`);
      break;
    }
  }

  if (!expandClicked) {
    console.log('[5] chevron 못 찾음 — 버전 제목 직접 클릭 시도');
    // 복사 버튼이 아니고 길이가 긴 버튼(제목) 찾기
    const allBtns = await page.locator('button').all();
    for (const btn of allBtns) {
      const text = await btn.textContent() || '';
      // 버전 제목은 보통 긴 한국어 텍스트
      if (text.length > 20 && !text.includes('내보내기') && !text.includes('편집실') && !text.includes('HTML') && !text.includes('분석')) {
        const box = await btn.boundingBox();
        if (box && box.y > 400) {
          await btn.click();
          expandClicked = true;
          console.log(`[5] 제목 버튼 클릭: "${text.slice(0, 30)}..." (y=${Math.round(box.y)})`);
          break;
        }
      }
    }
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${PREFIX}-06-expanded.png`, fullPage: true });

  // 펼친 후 스크롤 다운해서 NLE 버튼 보이게
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${PREFIX}-06b-scrolled.png`, fullPage: true });

  // ── 6. CapCut 버튼 클릭 ──
  const capcut = page.locator('button').filter({ hasText: 'CapCut' }).first();

  if (!await capcut.isVisible().catch(() => false)) {
    // 더 스크롤
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }

  // 디버그: CapCut 근처 버튼들
  const nearbyBtns = await page.locator('button').allTextContents();
  const nleRelated = nearbyBtns.filter(t => /Premiere|CapCut|Filmora|VREW|내보내기/i.test(t));
  console.log(`[6] NLE 관련 버튼: ${nleRelated.length > 0 ? nleRelated.join(', ') : '없음'}`);

  await expect(capcut).toBeVisible({ timeout: 10000 });
  console.log('[6] CapCut 버튼 발견!');

  // 컴패니언 확인
  let companion = await fetch('http://127.0.0.1:9876/health').then(r => r.json()).catch(() => null);
  if (!companion) {
    try {
      execSync('nohup /Users/mac_mini/Downloads/all-in-one-production-build4/companion/src-tauri/target/release/all-in-one-helper > /tmp/companion.log 2>&1 &');
      await page.waitForTimeout(4000);
      companion = await fetch('http://127.0.0.1:9876/health').then(r => r.json()).catch(() => null);
    } catch {}
  }
  console.log(`[6] 컴패니언: ${companion ? 'ACTIVE' : 'NOT RUNNING'}`);

  // 다운로드 리스너 + CapCut 클릭
  const dlPromise = page.waitForEvent('download', { timeout: 300_000 }).catch(() => null);
  await capcut.click();
  console.log('[6] CapCut 클릭!');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${PREFIX}-07-after-click.png`, fullPage: true });

  // ── 7. 내보내기 완료 대기 ──
  let exportOk = false;
  for (let w = 5; w <= 300; w += 5) {
    await page.waitForTimeout(5_000);
    const body = await page.textContent('body') || '';
    if (body.includes('설치했습니다') || body.includes('다운로드 완료')) {
      exportOk = true;
      console.log(`[7] ✅ 설치/다운로드 완료! (${w}초)`);
      break;
    }
    if (w % 15 === 0) console.log(`[7] 대기 ${w}초...`);
  }

  await page.screenshot({ path: `${PREFIX}-08-after-export.png`, fullPage: true });

  // ZIP 검증
  const dl = await dlPromise;
  if (dl) {
    const zip = 'test-e2e/dl-tikitaka-capcut.zip';
    await dl.saveAs(zip);
    const size = fs.statSync(zip).size;
    console.log(`[7] ZIP: ${size} bytes`);
    expect(size).toBeGreaterThan(100);
    const contents = execSync(`unzip -l "${zip}"`).toString();
    expect(contents).toContain('draft_content.json');
    console.log('[7] ✅ draft_content.json 확인');
  } else if (exportOk) {
    console.log('[7] ✅ 컴패니언 직접 설치');
  }

  // CapCut 프로젝트 폴더 확인
  const draftsRoot = path.join(process.env.HOME || '', 'Movies/CapCut/User Data/Projects/com.lveditor.draft');
  if (fs.existsSync(draftsRoot)) {
    const projects = fs.readdirSync(draftsRoot).filter(f => !f.startsWith('.'));
    console.log(`[8] CapCut 프로젝트: ${projects.length}개`);
  }

  // CapCut 실행
  try { execSync('open -a "CapCut" 2>/dev/null', { timeout: 5000 }); console.log('[8] CapCut 실행'); } catch { console.log('[8] CapCut 앱 없음'); }

  await page.screenshot({ path: `${PREFIX}-99-final.png`, fullPage: true });
  console.log('✅ 완료');
});
