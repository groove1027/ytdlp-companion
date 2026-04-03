import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { gunzipSync } from 'zlib';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const KIE_KEY = process.env.CUSTOM_KIE_KEY || '';
const YOUTUBE_API_KEY = process.env.CUSTOM_YOUTUBE_API_KEY || '';
const CLOUD_NAME = process.env.CUSTOM_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.CUSTOM_UPLOAD_PRESET || '';

// 짧은 Shorts 영상 (15초 이하)
const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

test.setTimeout(900_000); // 15분 — 분석+다운로드+내보내기 전체

test('Premiere 내보내기 전체 검증 — 오디오 스트림 + FilePath + ZIP 구조', async ({ page }) => {
  // ── 1. 로그인 ──
  await page.goto('http://localhost:5173');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();
  expect(loginData.token, '로그인 실패').toBeTruthy();

  await page.evaluate(({ token, user, evolink, kie, youtube, cloudName, uploadPreset }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    if (kie) localStorage.setItem('CUSTOM_KIE_KEY', kie);
    if (youtube) localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtube);
    if (cloudName) localStorage.setItem('CUSTOM_CLOUD_NAME', cloudName);
    if (uploadPreset) localStorage.setItem('CUSTOM_UPLOAD_PRESET', uploadPreset);
  }, { token: loginData.token, user: loginData.user, evolink: EVOLINK_KEY, kie: KIE_KEY, youtube: YOUTUBE_API_KEY, cloudName: CLOUD_NAME, uploadPreset: UPLOAD_PRESET });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/prem-01-loggedin.png' });
  console.log('[E2E] ✅ 로그인 완료');

  // ── 콘솔 캡처 ──
  const logs: string[] = [];
  page.on('console', msg => {
    const t = msg.text();
    logs.push(t);
    // 모든 로그 출력 (다운로드 문제 디버깅)
    if (t.length > 0 && !t.includes('로컬 헬퍼 감지됨')) {
      console.log(`  [BROWSER:${msg.type()}] ${t.slice(0, 300)}`);
    }
  });
  page.on('pageerror', err => {
    console.error(`  [PAGE_ERROR] ${err.message}`);
    logs.push(`[PAGE_ERROR] ${err.message}`);
  });

  // ── 2. 영상 분석실 진입 ──
  await page.click('button:has-text("채널/영상 분석")');
  await page.waitForTimeout(1500);
  const videoTab = page.locator('button:has-text("영상 분석실")');
  await videoTab.waitFor({ state: 'visible', timeout: 10_000 });
  await videoTab.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-e2e/prem-02-analysis-room.png' });

  // ── 3. YouTube URL 입력 ──
  const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="URL"], input[placeholder*="url"], textarea[placeholder*="URL"]').first();
  await urlInput.click();
  await urlInput.fill('');
  await page.keyboard.type(TEST_YOUTUBE_URL, { delay: 10 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-e2e/prem-03-url-entered.png' });

  // ── 4. 프리셋 선택 (1개 버전 + 티키타카) ──
  const oneBtn = page.locator('button:has-text("1개")').first();
  if (await oneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await oneBtn.click();
    await page.waitForTimeout(500);
  }

  // 프리셋 활성화 대기
  await page.waitForFunction(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.includes('티키타카') && !btn.disabled) return true;
    }
    return false;
  }, { timeout: 15_000 });

  const tikitakaBtn = page.locator('button:has-text("티키타카")').first();
  await tikitakaBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/prem-04-preset-clicked.png' });
  console.log('[E2E] ✅ 티키타카 프리셋 클릭');

  // ── 5. 분석 시작 확인 ──
  const started = await page.waitForFunction(() => {
    const body = document.body.innerText;
    return body.includes('다운로드') || body.includes('분석 중') || body.includes('Gemini')
      || body.includes('전처리') || body.includes('영상 정보')
      || document.querySelector('progress, [role="progressbar"], .animate-spin') !== null;
  }, { timeout: 60_000 }).catch(() => null);

  if (!started) {
    // 분석이 안 시작됐으면 버튼 다시 클릭 시도
    console.warn('[E2E] ⚠️ 분석 미시작 — 다시 클릭 시도');
    await tikitakaBtn.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-e2e/prem-04b-retry.png' });
  }

  console.log('[E2E] 분석 진행 중... 완료 대기');

  // ── 6. 분석 완료 대기 (최대 12분) ──
  const result = await page.waitForFunction(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;

    const h2s = document.querySelectorAll('h2');
    for (const h2 of h2s) {
      const t = h2.textContent || '';
      if (t.includes('리메이크') && t.includes('버전')) return 'ok';
    }
    // 프리셋 버튼이 보이면 (분석 결과가 아래에)
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if ((btn.textContent || '').includes('Premiere')) return 'ok-premiere';
    }
    const body = document.body.innerText;
    if (body.includes('분석 오류') || body.includes('분석 실패')) return 'fail';
    return '';
  }, { timeout: 720_000, polling: 5000 }); // 12분

  const resultVal = await result.jsonValue();
  await page.screenshot({ path: 'test-e2e/prem-05-analyzed.png' });
  console.log(`[E2E] 분석 결과: ${resultVal}`);

  if (resultVal === 'fail') {
    throw new Error('분석 실패');
  }
  console.log('[E2E] ✅ 분석 완료');

  // ── 7. 버전 펼치기 ──
  await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if ((span.textContent || '').includes('컷')) {
        const parent = span.parentElement;
        if (parent) {
          const btns = parent.querySelectorAll('button');
          const chevron = btns[btns.length - 1];
          if (chevron) {
            chevron.scrollIntoView({ behavior: 'smooth', block: 'center' });
            chevron.click();
            return;
          }
        }
      }
    }
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/prem-06-expanded.png' });

  // ── 8. Premiere 버튼 찾기 + 클릭 ──
  await page.waitForFunction(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if ((btn.textContent || '').includes('Premiere')) return true;
    }
    return false;
  }, { timeout: 30_000 });

  const premiereBtn = page.locator('button', { hasText: 'Premiere' }).first();
  await premiereBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-e2e/prem-07-before-export.png' });

  // [FIX] 컴패니언 NLE 설치 엔드포인트 차단 → ZIP 다운로드 경로 강제
  // 이유: 컴패니언이 18MB+ 영상을 base64→JSON으로 보내느라 수 분 걸림
  await page.route('**/api/nle/install', route => {
    console.log('[E2E] ⛔ 컴패니언 NLE 설치 차단 → ZIP 다운로드로 폴백');
    route.abort('connectionrefused');
  });

  // 다운로드 대기 설정 + 클릭
  const downloadPromise = page.waitForEvent('download', { timeout: 600_000 });
  await premiereBtn.click();
  console.log('[E2E] ✅ Premiere 내보내기 클릭');

  // 내보내기 진행 중 주기적 스크린샷 + 상태 모니터링
  let dlReady = false;
  const monitor = (async () => {
    for (let i = 0; i < 40; i++) { // 최대 400초
      await page.waitForTimeout(10_000);
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.log(`[E2E] 내보내기 상태 (${(i+1)*10}s): ${bodyText.includes('패키지') ? '패키지 생성 중' : bodyText.includes('다운로드') ? '다운로드 중' : bodyText.includes('오디오') ? '오디오 확인 중' : '대기 중...'}`);
      if (i === 0) await page.screenshot({ path: 'test-e2e/prem-08-exporting.png' });
      if (i === 5) await page.screenshot({ path: 'test-e2e/prem-08b-exporting-60s.png' });
      if (i === 10) await page.screenshot({ path: 'test-e2e/prem-08c-exporting-120s.png' });
      if (dlReady) break;
    }
  })();

  // ── 9. 다운로드 완료 대기 ──
  const dl = await downloadPromise;
  dlReady = true;
  await monitor.catch(() => {});
  const dlPath = path.resolve(__dirname, 'dl-premiere-export.zip');
  await dl.saveAs(dlPath);
  console.log('[E2E] ✅ ZIP 다운로드 완료');

  // ── 10. ZIP 검증 ──
  const stat = fs.statSync(dlPath);
  console.log(`[E2E] ZIP 크기: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  expect(stat.size, 'ZIP 파일이 비어있음').toBeGreaterThan(1000);
  await page.screenshot({ path: 'test-e2e/prem-09-downloaded.png' });

  // ZIP 내용물
  const zipList = execSync(`unzip -l "${dlPath}"`).toString();
  console.log('[E2E] ZIP 내용물:\n', zipList);

  // .prproj 존재
  expect(zipList, '.prproj 파일 없음').toContain('.prproj');
  // 영상 파일 존재
  expect(zipList.toLowerCase(), '영상 파일 없음').toMatch(/\.mp4/);

  // ── 11. .prproj 내부 XML 검증 (Node.js JSZip으로 — macOS unzip은 한글 깨짐) ──
  const JSZip = require(path.resolve(__dirname, '../src/node_modules/jszip'));
  const zipData = fs.readFileSync(dlPath);
  const zip = await JSZip.loadAsync(zipData);
  const zipFileNames = Object.keys(zip.files);
  console.log('[E2E] ZIP 파일 목록:', zipFileNames.join(', '));

  const prprojEntry = zipFileNames.find(f => f.endsWith('.prproj'));
  expect(prprojEntry, '.prproj 파일을 ZIP에서 찾을 수 없음').toBeTruthy();

  const prprojBuffer = await zip.file(prprojEntry!)!.async('nodebuffer');
  const prprojXml = gunzipSync(prprojBuffer).toString('utf-8');

  // ── 11a. gzip OS byte 확인 ──
  const osByte = prprojBuffer[9];
  console.log(`[E2E] gzip OS byte: 0x${osByte.toString(16)} (expected 0x13)`);
  expect(osByte, 'gzip OS byte가 0x13이 아님 → Premiere 열기 실패').toBe(0x13);

  // ── 11b. AudioStream 존재 ──
  const audioStreamCount = (prprojXml.match(/<AudioStream/g) || []).length;
  console.log(`[E2E] AudioStream 개수: ${audioStreamCount}`);
  expect(audioStreamCount, 'AudioStream이 없음 → 오디오 재생 불가').toBeGreaterThan(0);

  // ── 11c. FilePath 검증 — ./상대경로 형식 ──
  const filePathMatches = prprojXml.match(/<FilePath>([^<]*\.(mp4|mp3|wav|m4a|webm))<\/FilePath>/g) || [];
  console.log(`[E2E] 미디어 FilePath 개수: ${filePathMatches.length}`);
  for (const match of filePathMatches) {
    const val = match.replace(/<\/?FilePath>/g, '');
    console.log(`  FilePath: ${val}`);
    // 절대경로(/Users, C:\)가 아닌지 확인
    expect(val, `절대경로 발견: ${val}`).not.toMatch(/^(\/Users|\/Applications|[A-Z]:\\)/);
    // ./파일명 형식인지 확인
    expect(val, `./접두사 없음: ${val}`).toMatch(/^\.\//);
  }

  // ── 11d. RelativePath 검증 ──
  const relPathMatches = prprojXml.match(/<RelativePath>([^<]*\.(mp4|mp3|wav|m4a|webm))<\/RelativePath>/g) || [];
  console.log(`[E2E] 미디어 RelativePath 개수: ${relPathMatches.length}`);
  for (const match of relPathMatches) {
    const val = match.replace(/<\/?RelativePath>/g, '');
    console.log(`  RelativePath: ${val}`);
    expect(val, `RelativePath ./접두사 없음: ${val}`).toMatch(/^\.\//);
  }

  // ── 11e. ActualMediaFilePath 검증 ──
  const actualPathMatches = prprojXml.match(/<ActualMediaFilePath>([^<]*\.(mp4|mp3|wav|m4a|webm))<\/ActualMediaFilePath>/g) || [];
  console.log(`[E2E] ActualMediaFilePath 개수: ${actualPathMatches.length}`);
  for (const match of actualPathMatches) {
    const val = match.replace(/<\/?ActualMediaFilePath>/g, '');
    console.log(`  ActualMediaFilePath: ${val}`);
    expect(val, `절대경로 발견: ${val}`).not.toMatch(/^(\/Users|\/Applications|[A-Z]:\\)/);
  }

  // ── 11f. ImporterPrefs 존재 ──
  const hasImporterPrefs = prprojXml.includes('<ImporterPrefs');
  console.log(`[E2E] ImporterPrefs 존재: ${hasImporterPrefs}`);
  // ImporterPrefs는 선택사항이지만 있으면 더 좋음

  // ── 11g. 가짜 절대경로 남아있지 않은지 ──
  const fakePathMatch = prprojXml.match(/<FilePath>\/Volumes\/[^<]+<\/FilePath>/);
  expect(fakePathMatch, '가짜 절대경로 /Volumes/ 발견').toBeNull();

  // ── 11h. ConformedAudioPath/PeakFilePath 제거 확인 ──
  const conformedCount = (prprojXml.match(/<ConformedAudioPath/g) || []).length;
  const peakCount = (prprojXml.match(/<PeakFilePath/g) || []).length;
  console.log(`[E2E] ConformedAudioPath: ${conformedCount}, PeakFilePath: ${peakCount}`);
  expect(conformedCount, 'ConformedAudioPath가 남아있음').toBe(0);
  expect(peakCount, 'PeakFilePath가 남아있음').toBe(0);

  // ── 11i. ZIP 내 영상 파일이 .prproj와 같은 레벨인지 ──
  const mp4Files = zipFileNames.filter(f => f.toLowerCase().endsWith('.mp4'));
  for (const fileName of mp4Files) {
    expect(fileName, `영상이 하위 폴더에 있음: ${fileName}`).not.toContain('/');
    console.log(`[E2E] ✅ 영상 파일 ${fileName} — .prproj와 같은 레벨`);
  }
  await page.screenshot({ path: 'test-e2e/prem-99-final.png' });

  // 콘솔 로그 저장
  fs.writeFileSync(
    path.resolve(__dirname, 'prem-console-log.txt'),
    logs.join('\n'),
    'utf-8'
  );

  console.log('[E2E] ✅ Premiere 내보내기 전체 검증 완료!');
  console.log('[E2E] 검증 항목:');
  console.log('  ✅ ZIP 다운로드 + 크기 확인');
  console.log('  ✅ .prproj 파일 존재');
  console.log('  ✅ .mp4 영상 파일 존재');
  console.log(`  ✅ gzip OS byte = 0x13`);
  console.log(`  ✅ AudioStream ${audioStreamCount}개 존재`);
  console.log(`  ✅ FilePath ./상대경로 ${filePathMatches.length}개`);
  console.log(`  ✅ RelativePath ./상대경로 ${relPathMatches.length}개`);
  console.log('  ✅ 가짜 절대경로 없음');
  console.log('  ✅ ConformedAudioPath/PeakFilePath 제거됨');
  console.log('  ✅ 영상 파일 .prproj와 같은 레벨');
});
