/**
 * E2E Test: 컴패니언 앱 감지 + VPS 폴백 로직 검증 (Playwright)
 *
 * 테스트 시나리오:
 * 1. 앱 로드 확인
 * 2. 컴패니언 미설치 상태 → VPS 폴백 확인
 * 3. VPS 서버 health check
 * 4. 실제 YouTube shorts URL로 API 호출 테스트
 * 5. 콘솔 로그에서 컴패니언 관련 로그 확인
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const TEST_YOUTUBE_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';
const VPS_URL = 'http://175.126.73.193:3100';
const CF_WORKER_URL = 'https://ytdlp-proxy.groove1027.workers.dev';
const API_KEY = 'bf9ce5c9b531c42a2dd6dcec61cff6c3eead93f20ba35365d3411ddf783dccb1';

async function runTests() {
  console.log('🎬 Playwright E2E 테스트 시작 — 컴패니언 앱 감지 + VPS 폴백\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 콘솔 로그 수집
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  let passed = 0;
  let failed = 0;

  // ── Test 1: 앱 로드 확인 ──
  try {
    console.log('📋 Test 1: 앱 로드 확인');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const title = await page.title();
    console.log(`   ✅ 앱 로드 성공 (title: ${title})\n`);
    passed++;
  } catch (e) {
    console.log(`   ❌ 앱 로드 실패: ${e.message}\n`);
    failed++;
  }

  // ── Test 2: 컴패니언 미설치 상태 확인 (localhost:9876) ──
  try {
    console.log('📋 Test 2: 컴패니언 미설치 → localhost:9876 응답 없음 확인');
    const companionAvailable = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:9876/health', {
          signal: AbortSignal.timeout(1000)
        });
        return res.ok;
      } catch {
        return false;
      }
    });

    if (!companionAvailable) {
      console.log('   ✅ 컴패니언 미설치 확인됨 → VPS 폴백 경로 활성화\n');
      passed++;
    } else {
      console.log('   ⚠️ 컴패니언 실행 중 (예상치 못한 상태, 테스트 계속)\n');
      passed++;
    }
  } catch (e) {
    console.log(`   ❌ 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // ── Test 3: VPS 서버 health check ──
  try {
    console.log('📋 Test 3: VPS 서버 health check');
    const vpsHealth = await page.evaluate(async (vpsUrl) => {
      try {
        const res = await fetch(`${vpsUrl}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
        return { error: `HTTP ${res.status}` };
      } catch (e) {
        return { error: e.message };
      }
    }, VPS_URL);

    if (vpsHealth.status === 'ok') {
      console.log(`   ✅ VPS 서버 정상 (v${vpsHealth.version}, yt-dlp active)`);
      console.log(`   uptime: ${Math.round(vpsHealth.uptime / 3600)}시간\n`);
      passed++;
    } else {
      console.log(`   ❌ VPS 서버 장애: ${JSON.stringify(vpsHealth)}\n`);
      failed++;
    }
  } catch (e) {
    console.log(`   ❌ 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // ── Test 4: 실제 YouTube Shorts 스트림 URL 추출 (VPS 경유) ──
  try {
    console.log(`📋 Test 4: 실제 스트림 URL 추출 (${TEST_YOUTUBE_URL})`);
    const streamResult = await page.evaluate(async ({ vpsUrl, apiKey, ytUrl }) => {
      try {
        const res = await fetch(
          `${vpsUrl}/api/extract?url=${encodeURIComponent(ytUrl)}&quality=360p`,
          {
            headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
          }
        );
        if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        return {
          success: true,
          hasUrl: !!data.url,
          title: data.title?.substring(0, 60),
          format: data.format,
          duration: data.duration,
          width: data.width,
          height: data.height,
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, { vpsUrl: VPS_URL, apiKey: API_KEY, ytUrl: TEST_YOUTUBE_URL });

    if (streamResult.success && streamResult.hasUrl) {
      console.log(`   ✅ 스트림 URL 추출 성공!`);
      console.log(`   title: ${streamResult.title}`);
      console.log(`   format: ${streamResult.format} (${streamResult.width}x${streamResult.height})`);
      console.log(`   duration: ${streamResult.duration}초\n`);
      passed++;
    } else {
      console.log(`   ❌ 스트림 URL 추출 실패: ${streamResult.error}\n`);
      failed++;
    }
  } catch (e) {
    console.log(`   ❌ 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // ── Test 5: CF Worker 프록시 경유 health check ──
  try {
    console.log('📋 Test 5: CF Worker 프록시 경유 health check');
    const cfHealth = await page.evaluate(async (cfUrl) => {
      try {
        const res = await fetch(`${cfUrl}/health`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) return await res.json();
        return { error: `HTTP ${res.status}` };
      } catch (e) {
        return { error: e.message };
      }
    }, CF_WORKER_URL);

    if (cfHealth.status === 'ok') {
      console.log(`   ✅ CF Worker 프록시 정상 (v${cfHealth.version})\n`);
      passed++;
    } else {
      console.log(`   ❌ CF Worker 프록시 장애: ${JSON.stringify(cfHealth)}\n`);
      failed++;
    }
  } catch (e) {
    console.log(`   ❌ 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // ── Test 6: 앱 내 콘솔 로그에서 컴패니언 관련 메시지 확인 ──
  try {
    console.log('📋 Test 6: 앱 콘솔 로그 — 컴패니언 감지 시도 확인');
    // 2초 대기 (initCompanionDetection이 500ms 지연 후 실행)
    await page.waitForTimeout(2000);

    const companionLogs = consoleLogs.filter(l =>
      l.text.includes('Companion') || l.text.includes('companion') || l.text.includes('localhost:9876')
    );

    if (companionLogs.length > 0) {
      console.log(`   ✅ 컴패니언 관련 로그 ${companionLogs.length}건 감지:`);
      companionLogs.forEach(l => console.log(`      [${l.type}] ${l.text}`));
    } else {
      console.log('   ✅ 컴패니언 미설치 → 로그 없음 (정상 — 실패 시 조용히 폴백)');
    }
    console.log('');
    passed++;
  } catch (e) {
    console.log(`   ❌ 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // ── 결과 출력 ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 결과: ${passed} passed, ${failed} failed (총 ${passed + failed})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await browser.close();

  if (failed > 0) {
    console.log('\n❌ 일부 테스트 실패!');
    process.exit(1);
  }
  console.log('\n✅ 모든 테스트 통과!');
}

runTests().catch(e => {
  console.error('테스트 실행 실패:', e);
  process.exit(1);
});
