import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;
const KIE_KEY = process.env.CUSTOM_KIE_KEY!;
const YOUTUBE_API_KEY = process.env.CUSTOM_YOUTUBE_API_KEY!;
const CLOUD_NAME = process.env.CUSTOM_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.CUSTOM_UPLOAD_PRESET!;

const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';

test.setTimeout(600_000); // 10분

test('#974 — YouTube 분석 + NLE 내보내기 (컴패니언 + 오디오 보존)', async ({ page }) => {
  // 1. 로그인
  await page.goto('http://localhost:5173');
  const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const loginData = await loginRes.json();
  await page.evaluate(({ token, user, evolink, kie, youtube, cloudName, uploadPreset }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    localStorage.setItem('CUSTOM_KIE_KEY', kie);
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', youtube);
    localStorage.setItem('CUSTOM_CLOUD_NAME', cloudName);
    localStorage.setItem('CUSTOM_UPLOAD_PRESET', uploadPreset);
  }, {
    token: loginData.token, user: loginData.user,
    evolink: EVOLINK_KEY, kie: KIE_KEY, youtube: YOUTUBE_API_KEY,
    cloudName: CLOUD_NAME, uploadPreset: UPLOAD_PRESET,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/974-01-loggedin.png' });

  // 콘솔 로그 캡처
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (text.includes('[NLE]') || text.includes('[Companion]') || text.includes('[Download]') || text.includes('[Scene]') || text.includes('Error') || text.includes('error')) {
      console.log(`  [BROWSER] ${text}`);
    }
  });

  // 2. 영상 분석실 진입 (사이드바 → 서브탭 순서)
  await page.click('button:has-text("채널/영상 분석")');
  await page.waitForTimeout(1500);
  // 영상 분석실 서브탭 클릭
  const videoAnalysisTab = page.locator('button:has-text("영상 분석실")');
  await videoAnalysisTab.waitFor({ state: 'visible', timeout: 10_000 });
  await videoAnalysisTab.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-e2e/974-02-analysis-room.png' });

  // 3. YouTube URL 입력 — 붙여넣기로 입력 (React state 업데이트 보장)
  const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="URL"], input[placeholder*="url"], textarea[placeholder*="URL"]').first();
  await urlInput.click();
  await urlInput.fill('');
  await page.keyboard.type(TEST_YOUTUBE_URL, { delay: 10 });
  await page.waitForTimeout(2000); // React state 업데이트 대기
  await page.screenshot({ path: 'test-e2e/974-03-url-entered.png' });

  // 4. 프리셋 선택 → 분석 시작
  // 먼저 "1개" 버전 선택
  const oneVersionBtn = page.locator('button:has-text("1개")').first();
  if (await oneVersionBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await oneVersionBtn.click();
    await page.waitForTimeout(500);
  }

  // 프리셋 버튼이 활성화될 때까지 대기
  const tikitakaBtn2 = page.locator('button:has-text("티키타카")').first();
  await tikitakaBtn2.waitFor({ state: 'visible', timeout: 10_000 });
  // disabled 상태가 풀릴 때까지 대기
  await page.waitForFunction(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.includes('티키타카') && !btn.disabled) return true;
    }
    return false;
  }, { timeout: 10_000 });
  await page.screenshot({ path: 'test-e2e/974-04-preset-enabled.png' });

  // 티키타카 프리셋 클릭 → 분석 즉시 시작
  await tikitakaBtn2.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-e2e/974-04-analyzing.png' });
  console.log('[E2E] 티키타카 클릭 완료, 분석 진행 대기...');

  // 5. 분석 실제 시작 확인 — 프로그레스바 또는 "분석 중" 표시 감지
  console.log('[E2E] 분석 시작 확인 대기...');
  const analysisStarted = await page.waitForFunction(() => {
    const body = document.body.innerText;
    // 분석 진행 중 표시: 프로그레스바, "영상 다운로드", "분석 중", "Gemini"
    return body.includes('다운로드') || body.includes('분석 중') || body.includes('Gemini')
      || body.includes('전처리') || body.includes('영상 정보')
      || document.querySelector('progress, [role="progressbar"], .animate-spin') !== null;
  }, { timeout: 30_000 }).catch(() => null);

  if (!analysisStarted) {
    console.error('[E2E] ❌ 분석이 시작되지 않음 — 프리셋 버튼이 disabled일 수 있음');
    await page.screenshot({ path: 'test-e2e/974-05-NOT-STARTED.png' });

    // 디버그: 모든 버튼의 disabled 상태 출력
    const btnStates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => ({
        text: (b.textContent || '').slice(0, 50),
        disabled: b.disabled,
        opacity: getComputedStyle(b).opacity,
      }));
    });
    console.log('[E2E] 버튼 상태:', JSON.stringify(btnStates, null, 2));
    throw new Error('분석이 시작되지 않았습니다');
  }

  await page.screenshot({ path: 'test-e2e/974-05-in-progress.png' });

  // 분석 완료 대기 — h2 "리메이크" 제목이 나타나면 완료 (이전 캐시가 아닌 새 결과)
  console.log('[E2E] 분석 완료 대기 중...');

  // 주기적으로 스크롤 + 상태 확인 (결과가 뷰포트 밖에 있을 수 있음)
  const analysisResult = await page.waitForFunction(() => {
    // 메인 콘텐츠 스크롤
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;

    const h2s = document.querySelectorAll('h2');
    for (const h2 of h2s) {
      const t = h2.textContent || '';
      if (t.includes('리메이크') && t.includes('버전')) return 'ok';
    }
    // 실패 체크
    const body = document.body.innerText;
    if (body.includes('분석 오류') || body.includes('분석 실패')) return 'fail';
    return '';
  }, { timeout: 480_000, polling: 5000 }); // 8분, 5초 간격

  const resultValue = await analysisResult.jsonValue();
  await page.screenshot({ path: 'test-e2e/974-05-analyzed.png' });

  if (resultValue === 'fail') {
    console.error('[E2E] ❌ 분석 실패');
    expect(resultValue).toBe('ok');
  }
  console.log('[E2E] ✅ 분석 완료 — 버전 결과 확인!');

  // 6. 버전 펼치기 — "컷" 옆의 chevron 버튼을 evaluate로 직접 클릭
  console.log('[E2E] 버전 펼치기...');

  await page.evaluate(() => {
    // "컷"을 포함한 span 찾기
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if ((span.textContent || '').includes('컷')) {
        // 이 span의 부모에서 마지막 button = chevron 펼침 버튼
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
  await page.screenshot({ path: 'test-e2e/974-06-expanded.png' });

  // 7. Premiere 버튼 대기 (펼친 후 나타남)
  console.log('[E2E] Premiere 내보내기 버튼 대기...');
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
  await page.screenshot({ path: 'test-e2e/974-06-before-export.png' });

  // 다운로드 이벤트 대기 + 클릭
  const downloadPromise = page.waitForEvent('download', { timeout: 300_000 });
  await premiereBtn.click();
  console.log('[E2E] Premiere 내보내기 클릭!');

  // NLE 내보내기 진행 상태 대기 (영상 다운로드 → 패키지 생성 → ZIP)
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: 'test-e2e/974-07-exporting.png' });

  const dl = await downloadPromise;

  const dlPath = path.resolve(__dirname, 'dl-974-premiere.zip');
  await dl.saveAs(dlPath);

  // 7. ZIP 파일 검증
  const stat = fs.statSync(dlPath);
  console.log(`[E2E] ZIP 크기: ${stat.size} bytes`);
  expect(stat.size).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-e2e/974-08-downloaded.png' });

  // ZIP 내용물 확인
  const { execSync } = require('child_process');
  const zipContents = execSync(`unzip -l "${dlPath}"`).toString();
  console.log('[E2E] ZIP 내용물:\n', zipContents);

  // .prproj 파일 존재 확인
  expect(zipContents).toContain('.prproj');

  // 영상 파일 존재 확인
  expect(zipContents.toLowerCase()).toMatch(/\.mp4/);

  // 8. .prproj 파일 내부 검증 — AudioStream 존재 확인
  const tmpDir = path.resolve(__dirname, 'tmp-974');
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && cd "${tmpDir}" && unzip -o "${dlPath}"`);
  const prprojFile = fs.readdirSync(tmpDir).find(f => f.endsWith('.prproj'));
  if (prprojFile) {
    const prprojPath = path.join(tmpDir, prprojFile);
    const { gunzipSync } = require('zlib');
    const prprojXml = gunzipSync(fs.readFileSync(prprojPath)).toString('utf-8');

    // AudioStream이 존재하는지 확인 (핵심!)
    const hasAudioStream = prprojXml.includes('<AudioStream');
    console.log(`[E2E] .prproj AudioStream 존재: ${hasAudioStream}`);
    expect(hasAudioStream, '.prproj에 AudioStream이 있어야 함 — 없으면 오디오 재생 불가').toBe(true);

    // FilePath가 ./상대경로인지 확인
    const filePathMatch = prprojXml.match(/<FilePath>([^<]*\.mp4)<\/FilePath>/);
    if (filePathMatch) {
      console.log(`[E2E] FilePath: ${filePathMatch[1]}`);
      expect(filePathMatch[1]).toMatch(/^\.\//);
    }

    // RelativePath 확인
    const relPathMatch = prprojXml.match(/<RelativePath>([^<]*\.mp4)<\/RelativePath>/);
    if (relPathMatch) {
      console.log(`[E2E] RelativePath: ${relPathMatch[1]}`);
      expect(relPathMatch[1]).toMatch(/^\.\//);
    }
  }

  // 정리
  execSync(`rm -rf "${tmpDir}"`);

  await page.screenshot({ path: 'test-e2e/974-99-final.png' });
  console.log('[E2E] ✅ #974 테스트 완료');
});
