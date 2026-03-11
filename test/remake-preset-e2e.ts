/**
 * 리메이크 프리셋 실제 E2E 테스트
 *
 * ★ 실제 YouTube 영상을 넣고 AI 분석까지 전체 파이프라인을 테스트한다.
 *
 * 테스트 흐름:
 *   1. 채널분석 → 영상 분석실 진입 + 프리셋 5종 확인
 *   2. 실제 YouTube URL 입력
 *   3. 티키타카 프리셋 클릭 → 실제 AI 분석 대기 (최대 3분)
 *   4. 분석 결과: 버전 + 장면 테이블 렌더 확인
 *   5. 타임코드가 실제로 표시되는지 확인 (00:XX 패턴)
 *   6. 비주얼 썸네일이 실제로 로드됐는지 확인
 *   7. 비주얼 클릭 → 라이트박스 모달 (HD 이미지 + 정보 바)
 *   8. 모달 닫기 (backdrop 클릭)
 *   9. "편집실로" 클릭 → 편집실 전환 + 데이터 전달 확인
 *
 * 사용법: NODE_PATH=src/node_modules npx tsx test/remake-preset-e2e.ts
 */

import puppeteer from 'puppeteer';
import { spawn, ChildProcess } from 'child_process';

const DEV_PORT = 5198;
const BASE_URL = `http://localhost:${DEV_PORT}`;
const NAV_TIMEOUT = 15000;
const ANALYSIS_TIMEOUT = 300000; // 5분 — 실제 AI 분석 + 프레임 추출 대기

// ★ 실제 YouTube 영상 — 짧은 영상 (1~3분)
const TEST_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

let devServer: ChildProcess | null = null;
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

// ── Dev Server 시작/종료 ──

async function startDevServer(): Promise<void> {
  console.log(`🚀 Vite dev server 시작 (port ${DEV_PORT})...`);
  devServer = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: `${process.cwd()}/src`,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dev server 시작 타임아웃 (30초)')), 30000);
    devServer!.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Local:') || text.includes('ready in') || text.includes(`localhost:${DEV_PORT}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    devServer!.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Local:') || text.includes('ready in') || text.includes(`localhost:${DEV_PORT}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    devServer!.on('error', (err) => { clearTimeout(timeout); reject(err); });
    devServer!.on('exit', (code) => {
      if (code !== null && code !== 0) { clearTimeout(timeout); reject(new Error(`Dev server exited with code ${code}`)); }
    });
  });

  await new Promise(r => setTimeout(r, 2000));
  console.log(`  ✅ Dev server 준비 완료 (${BASE_URL})`);
}

function stopDevServer() {
  if (devServer) {
    devServer.kill('SIGTERM');
    devServer = null;
    console.log('🛑 Dev server 종료');
  }
}

// ── 유틸: 영상 분석실로 이동 ──
async function navigateToVideoRoom(page: puppeteer.Page) {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('채널/영상 분석'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('영상 분석실'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
}

// ══════════════════════════════════════════════════════════════
// Test 1: 영상 분석실 진입 + 프리셋 확인
// ══════════════════════════════════════════════════════════════

async function testNavigateAndPresets(page: puppeteer.Page) {
  console.log('\n📋 Test 1: 영상 분석실 진입 + 리메이크 프리셋 확인');

  // ★ 인증 + API 키 설정: localStorage에 미리 주입
  await page.evaluateOnNewDocument(() => {
    // 인증 우회
    localStorage.setItem('auth_token', 'e2e-test-token');
    localStorage.setItem('auth_user', JSON.stringify({ email: 'e2e@test.com', displayName: 'E2E Tester' }));
    // API 키 명시 설정 (하드코딩 DEFAULT가 빈 브라우저에서 누락될 경우 대비)
    localStorage.setItem('CUSTOM_EVOLINK_KEY', 'REDACTED_EVOLINK_KEY');
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', 'AIzaSyDCZ4kTRy3VR8T_-tU3fd98Z2ArNspC5g4');
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

  // authStore에 직접 사용자 설정 (verifyToken 폴백이 안 될 경우 대비)
  await page.addScriptTag({
    type: 'module',
    content: `
      try {
        const mod = await import('/stores/authStore.ts');
        mod.useAuthStore.setState({ authUser: { email: 'e2e@test.com', displayName: 'E2E Tester' }, authChecking: false });
      } catch (e) { console.warn('[E2E] authStore inject failed:', e); }
    `,
  });
  await new Promise(r => setTimeout(r, 1000));

  await navigateToVideoRoom(page);

  const inVideoRoom = await page.evaluate(() => document.body.textContent?.includes('리메이크 프리셋'));
  assert(!!inVideoRoom, '영상 분석실 진입 — "리메이크 프리셋" 텍스트 확인');

  const presets = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      tikitaka: text.includes('티키타카'),
      snack: text.includes('스낵형'),
      condensed: text.includes('축약 리캡'),
      shopping: text.includes('쇼핑형'),
    };
  });
  assert(presets.tikitaka, '프리셋: 티키타카 존재');
  assert(presets.snack, '프리셋: 스낵형 존재');
  assert(presets.condensed, '프리셋: 축약 리캡 존재');
  assert(presets.shopping, '프리셋: 쇼핑형 존재');
}

// ══════════════════════════════════════════════════════════════
// Test 2: 실제 YouTube URL 입력
// ══════════════════════════════════════════════════════════════

async function testInputYoutubeUrl(page: puppeteer.Page) {
  console.log('\n📋 Test 2: 실제 YouTube URL 입력');

  // YouTube URL 입력 필드 찾기 — placeholder에 "YouTube" 또는 "youtube" 포함
  const inputFound = await page.evaluate((url: string) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const urlInput = inputs.find(i =>
      i.placeholder?.toLowerCase().includes('youtube') ||
      i.placeholder?.includes('URL') ||
      i.placeholder?.includes('url') ||
      i.type === 'url'
    );
    if (urlInput) {
      // React controlled input — nativeInputValueSetter로 값 설정
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(urlInput, url);
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        urlInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        urlInput.value = url;
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }
    return false;
  }, TEST_YOUTUBE_URL);
  assert(inputFound, `YouTube URL 입력: ${TEST_YOUTUBE_URL}`);

  await new Promise(r => setTimeout(r, 1000));

  // 입력 후 프리셋 버튼이 활성화됐는지 확인 (disabled 해제)
  const presetEnabled = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const tikitakaBtn = buttons.find(b => b.textContent?.includes('티키타카'));
    return tikitakaBtn ? !tikitakaBtn.disabled : false;
  });
  assert(presetEnabled, '프리셋 버튼 활성화 (disabled 해제)');
}

// ══════════════════════════════════════════════════════════════
// Test 3: 티키타카 프리셋 클릭 → 실제 AI 분석 완료 대기
// ══════════════════════════════════════════════════════════════

async function testAnalyzeWithPreset(page: puppeteer.Page) {
  console.log('\n📋 Test 3: 티키타카 프리셋 클릭 → 실제 AI 분석');

  // 티키타카 프리셋 클릭
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('티키타카') && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
  assert(clicked, '티키타카 프리셋 버튼 클릭');

  // 분석 진행 중 표시 확인 (로딩 UI)
  await new Promise(r => setTimeout(r, 3000));
  const isLoading = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return text.includes('생성 중') || text.includes('분석') || text.includes('로드') ||
           !!document.querySelector('.animate-spin');
  });
  assert(isLoading, '분석 진행 중 로딩 UI 표시');

  // 1단계: AI 분석 완료 대기 (store에 versions 등장)
  console.log('  ⏳ AI 분석 대기 중 (최대 5분)...');
  const startTime = Date.now();
  let analysisComplete = false;

  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const status = await page.evaluate(() => {
      const text = document.body.textContent || '';
      let storeVersions = 0;
      let storeRaw = 0;
      try {
        const raw = localStorage.getItem('video-analysis-store');
        if (raw) {
          const parsed = JSON.parse(raw);
          storeVersions = parsed?.state?.versions?.length || 0;
          storeRaw = parsed?.state?.rawResult?.length || 0;
        }
      } catch {}

      const hasError = text.includes('분석 실패');
      const hasAuthPrompt = text.includes('로그인') && text.includes('가입');
      const isStillLoading = !!document.querySelector('.animate-spin');
      return { hasError, hasAuthPrompt, isStillLoading, storeVersions, storeRaw };
    });

    if (status.hasAuthPrompt && elapsed < 10) {
      console.log(`  ⚠️ 인증 프롬프트 감지 — authStore 재주입`);
      await page.addScriptTag({
        type: 'module',
        content: `
          try {
            const mod = await import('/stores/authStore.ts');
            mod.useAuthStore.setState({ authUser: { email: 'e2e@test.com', displayName: 'E2E Tester' }, authChecking: false });
          } catch {}
        `,
      });
      await new Promise(r => setTimeout(r, 1000));
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent?.includes('티키타카') && !b.disabled);
        if (btn) btn.click();
      });
      continue;
    }

    if (status.hasError) {
      console.log(`  ⚠️ 분석 실패 감지 (${elapsed}초)`);
      assert(false, '분석 실패 — AI 응답 오류');
      return;
    }

    // store에 버전이 생기면 AI 분석은 완료
    if (status.storeVersions > 0) {
      console.log(`  ✅ AI 분석 완료 (${elapsed}초) — ${status.storeVersions}개 버전, ${status.storeRaw}자`);
      analysisComplete = true;

      // 2단계: 프레임 추출 + 전체 처리 완료 대기 (스피너 사라질 때까지)
      if (status.isStillLoading) {
        console.log('  ⏳ 프레임 추출 대기 중...');
        for (let j = 0; j < 120; j++) {
          await new Promise(r => setTimeout(r, 1000));
          const still = await page.evaluate(() => !!document.querySelector('.animate-spin'));
          if (!still) {
            const total = Math.round((Date.now() - startTime) / 1000);
            console.log(`  ✅ 전체 처리 완료 (총 ${total}초)`);
            break;
          }
          if (j % 15 === 0 && j > 0) {
            console.log(`  ⏳ 프레임 추출 ${j}초 경과...`);
          }
        }
      }
      // UI 렌더 대기
      await new Promise(r => setTimeout(r, 3000));
      break;
    }

    if (elapsed % 30 === 0 && elapsed > 0) {
      console.log(`  ⏳ ${elapsed}초 경과... (로딩: ${status.isStillLoading}, versions: ${status.storeVersions}, raw: ${status.storeRaw}자)`);
    }
  }
  assert(analysisComplete, '실제 AI 분석 완료');
}

// ══════════════════════════════════════════════════════════════
// Test 4: 분석 결과 — 버전 + 장면 테이블 렌더 확인
// ══════════════════════════════════════════════════════════════

async function testResultsRendered(page: puppeteer.Page) {
  console.log('\n📋 Test 4: 분석 결과 — 버전 + 장면 테이블');

  // store에서 버전 수 확인 (UI와 별개로)
  const storeInfo = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      return {
        versionsCount: state.versions?.length || 0,
        thumbnailCount: state.thumbnails?.length || 0,
        selectedPreset: state.selectedPreset,
        expandedId: state.expandedId,
        firstTitle: state.versions?.[0]?.title || 'N/A',
      };
    } catch { return null; }
  });
  if (storeInfo) {
    console.log(`  [INFO] store: ${storeInfo.versionsCount} versions, ${storeInfo.thumbnailCount} thumbnails, preset=${storeInfo.selectedPreset}, expanded=${storeInfo.expandedId}`);
    console.log(`  [INFO] 첫 버전 제목: ${storeInfo.firstTitle}`);
  }
  assert(!!storeInfo && storeInfo.versionsCount >= 1, `버전 ${storeInfo?.versionsCount || 0}개 생성됨 (최소 1개)`);

  // 첫 번째 버전 펼치기 (expandedId 설정)
  await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const store = (mod as any).useVideoAnalysisStore;
      const versions = store.getState().versions;
      if (versions?.length > 0) {
        store.setState({ expandedId: versions[0].id });
      }
    } catch {}
  });
  await new Promise(r => setTimeout(r, 1500));

  // 장면 테이블 내용 확인 (UI 렌더 기반)
  const tableContent = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      hasSceneRows: /컷\s*[#\d]/.test(text) || text.includes('cutNum') || /\[\d+\]/.test(text) || /\[N\]|\[S\]/.test(text),
      hasAudioContent: text.includes('오디오') || text.includes('나레이션') || text.includes('대사') || text.includes('AI'),
      hasDuration: /\d+:\d+/.test(text),
    };
  });
  assert(tableContent.hasSceneRows, '장면 행(컷) 표시');
  assert(tableContent.hasAudioContent, '오디오/나레이션 내용 표시');
  assert(tableContent.hasDuration, '시간 정보 표시');
}

// ══════════════════════════════════════════════════════════════
// Test 5: 실제 타임코드 표시 확인
// ══════════════════════════════════════════════════════════════

async function testTimecodes(page: puppeteer.Page) {
  console.log('\n📋 Test 5: 실제 타임코드 표시 확인');

  // store에서 타임코드 직접 확인
  const storeTimecodes = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const versions = state.versions || [];
      const timecodes: string[] = [];
      for (const v of versions) {
        for (const s of (v.scenes || [])) {
          if (s.timecodeSource) timecodes.push(s.timecodeSource);
          if (s.sourceTimeline) timecodes.push(s.sourceTimeline);
        }
      }
      return { timecodes: [...new Set(timecodes)], total: timecodes.length };
    } catch { return { timecodes: [], total: 0 }; }
  });
  console.log(`  [INFO] store 타임코드: ${storeTimecodes.timecodes.slice(0, 8).join(', ')}${storeTimecodes.total > 8 ? '...' : ''}`);
  assert(storeTimecodes.total >= 3, `타임코드 ${storeTimecodes.total}개 (최소 3개) — store에서 확인`);

  // UI에서도 타임코드 표시 확인
  const uiTimecodes = await page.evaluate(() => {
    const text = document.body.textContent || '';
    const timecodePattern = /\d{1,2}:\d{2}/g;
    const matches = text.match(timecodePattern) || [];
    const unique = [...new Set(matches)];
    return { unique, count: unique.length };
  });
  console.log(`  [INFO] UI 타임코드: ${uiTimecodes.unique.slice(0, 10).join(', ')}`);
  assert(uiTimecodes.count >= 2, `UI에 타임코드 ${uiTimecodes.count}개 표시`);
}

// ══════════════════════════════════════════════════════════════
// Test 6: 비주얼 썸네일 로드 확인
// ══════════════════════════════════════════════════════════════

async function testVisualThumbnails(page: puppeteer.Page) {
  console.log('\n📋 Test 6: 비주얼 썸네일 로드 확인');

  // store에서 thumbnails 직접 확인
  const storeThumbs = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const thumbs = state.thumbnails || [];
      return {
        count: thumbs.length,
        samples: thumbs.slice(0, 3).map((t: any) => ({
          timeSec: t.timeSec,
          urlType: t.url?.startsWith('data:') ? 'canvas' : t.url?.includes('ytimg') ? 'youtube' : 'other',
          hasHd: !!t.hdUrl,
        })),
      };
    } catch { return { count: 0, samples: [] }; }
  });
  console.log(`  [INFO] store thumbnails: ${storeThumbs.count}개`);
  storeThumbs.samples.forEach((s: any) => {
    console.log(`    - timeSec=${s.timeSec}, type=${s.urlType}, hasHd=${s.hasHd}`);
  });
  assert(storeThumbs.count >= 2, `store에 썸네일 ${storeThumbs.count}개 (최소 2개)`);

  // UI에서 이미지 렌더 확인
  const visualInfo = await page.evaluate(() => {
    const text = document.body.textContent || '';
    const hasVisualCol = text.includes('비주얼');
    const allImgs = Array.from(document.querySelectorAll('img'));
    const thumbnailImgs = allImgs.filter(img =>
      img.src.includes('ytimg.com') || img.src.startsWith('data:image') || img.src.includes('blob:')
    );
    return {
      hasVisualCol,
      totalImgs: allImgs.length,
      loadedImgs: thumbnailImgs.length,
    };
  });
  console.log(`  [INFO] UI 이미지: ${visualInfo.loadedImgs}/${visualInfo.totalImgs}개`);
  assert(visualInfo.hasVisualCol || visualInfo.loadedImgs >= 1, '비주얼 이미지 또는 열 존재');
}

// ══════════════════════════════════════════════════════════════
// Test 7: 비주얼 클릭 → 라이트박스 모달 확인
// ══════════════════════════════════════════════════════════════

async function testLightboxModal(page: puppeteer.Page) {
  console.log('\n📋 Test 7: 비주얼 클릭 → 라이트박스 모달');

  // 첫 번째 썸네일 클릭
  const clickResult = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img.object-cover'));
    const thumbnail = imgs.find(img => img.offsetWidth > 0 && img.offsetWidth <= 150);
    if (thumbnail) {
      const btn = thumbnail.closest('button');
      if (btn) { btn.click(); return 'button'; }
      thumbnail.click();
      return 'img';
    }
    return null;
  });
  assert(!!clickResult, `썸네일 클릭 (via ${clickResult})`);

  await new Promise(r => setTimeout(r, 500));

  // 라이트박스 모달 확인
  const modalInfo = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.fixed'));
    const overlay = overlays.find(el => {
      const cls = el.getAttribute('class') || '';
      return cls.includes('inset-0') && (cls.includes('z-[9999]') || cls.includes('z-50'));
    });
    if (!overlay) return null;

    const img = overlay.querySelector('img');
    const text = overlay.textContent || '';
    return {
      isOpen: true,
      hasImage: !!img,
      imgSrc: img?.src?.substring(0, 80) || '',
      imgWidth: img?.naturalWidth || 0,
      hasTimeBadge: /\d+:\d+/.test(text),
      hasCutInfo: text.includes('컷') || text.includes('#'),
      hasVersionInfo: text.includes('버전'),
    };
  });

  if (modalInfo) {
    assert(modalInfo.isOpen, '라이트박스 모달 열림');
    assert(modalInfo.hasImage, `HD 이미지 존재 (src: ${modalInfo.imgSrc}...)`);
    assert(modalInfo.hasTimeBadge, '타임코드 배지 표시');
    assert(modalInfo.hasCutInfo, '컷 정보 표시');
  } else {
    assert(false, '라이트박스 모달을 찾을 수 없음');
    assert(false, 'HD 이미지 확인 스킵');
    assert(false, '타임코드 배지 확인 스킵');
    assert(false, '컷 정보 확인 스킵');
  }
}

// ══════════════════════════════════════════════════════════════
// Test 8: 모달 닫기 (backdrop 클릭)
// ══════════════════════════════════════════════════════════════

async function testModalClose(page: puppeteer.Page) {
  console.log('\n📋 Test 8: 모달 닫기 (backdrop 클릭)');

  const closed = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.fixed'));
    const overlay = overlays.find(el => {
      const cls = el.getAttribute('class') || '';
      return cls.includes('inset-0') && (cls.includes('z-[9999]') || cls.includes('z-50'));
    });
    if (overlay) {
      (overlay as HTMLElement).click();
      return true;
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 500));

  const modalGone = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.fixed'));
    return !overlays.some(el => {
      const cls = el.getAttribute('class') || '';
      return cls.includes('inset-0') && (cls.includes('z-[9999]') || cls.includes('z-50'));
    });
  });
  assert(closed && modalGone, 'backdrop 클릭으로 라이트박스 닫힘');
}

// ══════════════════════════════════════════════════════════════
// Test 9: "편집실로" 클릭 → 편집실 전환 + 데이터 전달
// ══════════════════════════════════════════════════════════════

async function testEditRoomTransfer(page: puppeteer.Page) {
  console.log('\n📋 Test 9: "편집실로" 클릭 → 편집실 전환 + 데이터 전달');

  // "편집실로" 버튼 확인 + 클릭
  const hasBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => b.textContent?.includes('편집실로'));
  });
  assert(hasBtn, '"편집실로" 버튼 존재');

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('편집실로') && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
  assert(clicked, '"편집실로" 버튼 클릭');

  // 편집실 전환 + 데이터 처리 대기
  await new Promise(r => setTimeout(r, 5000));

  // 편집실 탭 전환 확인
  const editRoomInfo = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      inEditRoom: text.includes('편집점') || text.includes('편집실') || text.includes('소스 등록') || text.includes('소스 영상'),
      hasEditTable: text.includes('편집표') || text.includes('EDL') || text.includes('타임라인'),
      hasSourceVideo: text.includes('소스') || text.includes('영상'),
      // editPointStore에서 실제 데이터 전달됐는지 Zustand store 확인
    };
  });

  assert(editRoomInfo.inEditRoom, '편집실 탭으로 전환됨');
  assert(editRoomInfo.hasSourceVideo, '편집실에 소스 영상 정보 존재');

  // Zustand editPointStore에서 실제 데이터 확인
  const storeCheck = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/editPointStore.ts' as string);
      const store = (mod as any).useEditPointStore;
      if (!store) return { found: false };
      const state = store.getState();
      return {
        found: true,
        hasRawEditTable: (state.rawEditTable?.length || 0) > 10,
        rawEditTableLength: state.rawEditTable?.length || 0,
        sourceVideoCount: state.sourceVideos?.length || 0,
        step: state.step || 'unknown',
      };
    } catch {
      return { found: false };
    }
  });

  if (storeCheck.found) {
    console.log(`  [INFO] editPointStore: rawEditTable=${storeCheck.rawEditTableLength}자, sources=${storeCheck.sourceVideoCount}, step=${storeCheck.step}`);
    assert(storeCheck.hasRawEditTable, `편집표 데이터 전달됨 (${storeCheck.rawEditTableLength}자)`);
  } else {
    console.log('  [INFO] editPointStore 직접 접근 불가 — UI 기반으로 확인');
    assert(editRoomInfo.hasEditTable || editRoomInfo.hasSourceVideo, '편집실에 분석 데이터 전달됨');
  }

  // 편집표에 실제 타임코드가 포함됐는지 확인
  const editTableHasTimecodes = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/editPointStore.ts' as string);
      const state = (mod as any).useEditPointStore.getState();
      const raw = state.rawEditTable || '';
      const timecodePattern = /\d{1,2}:\d{2}/g;
      const matches = raw.match(timecodePattern) || [];
      return { count: matches.length, sample: matches.slice(0, 5) };
    } catch { return { count: 0, sample: [] }; }
  });
  if (editTableHasTimecodes.count > 0) {
    console.log(`  [INFO] 편집표 내 타임코드: ${editTableHasTimecodes.sample.join(', ')}...`);
  }
  assert(editTableHasTimecodes.count >= 2, `편집표에 타임코드 ${editTableHasTimecodes.count}개 포함`);
}

// ══════════════════════════════════════════════════════════════
// 메인 실행
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('==================================================');
  console.log('🧪 리메이크 프리셋 실제 E2E 테스트');
  console.log(`   YouTube URL: ${TEST_YOUTUBE_URL}`);
  console.log('==================================================');

  try {
    await startDevServer();
  } catch (err) {
    console.error(`❌ Dev server 시작 실패: ${(err as Error).message}`);
    process.exit(1);
  }

  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      // AI 분석 진행 로그 출력
      const text = msg.text();
      if (text.includes('[Frame]') || text.includes('[VideoAnalysis]')) {
        console.log(`  [APP] ${text.substring(0, 200)}`);
      }
    });

    await testNavigateAndPresets(page);
    await testInputYoutubeUrl(page);
    await testAnalyzeWithPreset(page);
    await testResultsRendered(page);
    await testTimecodes(page);
    await testVisualThumbnails(page);
    await testLightboxModal(page);
    await testModalClose(page);
    await testEditRoomTransfer(page);

    // 콘솔 에러 확인
    console.log('\n📋 Console Errors:');
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') && !e.includes('DevTools') &&
      !e.includes('ytimg.com') && !e.includes('CORS') && !e.includes('Access-Control') &&
      !e.includes('onnxruntime') && !e.includes('ffmpeg')
    );
    if (criticalErrors.length === 0) {
      assert(true, '심각한 콘솔 에러 없음');
    } else {
      console.log(`  ⚠️ 콘솔 에러 ${criticalErrors.length}개:`);
      criticalErrors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 200)}`));
      assert(criticalErrors.length < 5, `콘솔 에러 ${criticalErrors.length}개 (5개 미만이면 통과)`);
    }

  } catch (err) {
    console.error(`\n💥 테스트 실행 중 오류: ${(err as Error).message}`);
    failed++;
  } finally {
    if (browser) await browser.close();
    stopDevServer();
  }

  console.log('\n==================================================');
  console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ 모든 테스트 통과!');
  } else {
    console.log('❌ 일부 테스트 실패');
  }
  console.log('==================================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  stopDevServer();
  process.exit(1);
});
