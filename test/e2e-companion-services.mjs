/**
 * E2E Test — 컴패니언 확장 서비스 검증 (Node.js + Playwright 혼합)
 * Node.js fetch: 컴패니언 API 직접 테스트 (CORS 무관)
 * Playwright: 웹앱 로드 + UI 확인
 */
import { chromium } from 'playwright';

const COMPANION = 'http://localhost:9876';

async function runTests(runNumber) {
  console.log(`\n🔄 검증 ${runNumber}/3 시작\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Health + 서비스 목록 (Node.js fetch)
  try {
    const r = await fetch(`${COMPANION}/health`);
    const health = await r.json();
    if (health?.app === 'ytdlp-companion' && health.services?.length > 0) {
      console.log(`   ✅ Health OK — 서비스: ${health.services.join(', ')}`);
      passed++;
    } else {
      console.log('   ❌ Health 실패'); failed++;
    }
  } catch (e) { console.log(`   ❌ Health 에러: ${e.message}`); failed++; }

  // Test 2: yt-dlp extract (Node.js fetch)
  try {
    const r = await fetch(`${COMPANION}/api/extract?url=https://www.youtube.com/shorts/HMBqVXNjrgo&quality=best`);
    const result = await r.json();
    if ((result?.url || result?.audioUrl) && result?.title) {
      console.log(`   ✅ yt-dlp extract — "${result.title?.slice(0,30)}", ${result.duration}s`);
      passed++;
    } else {
      console.log(`   ❌ yt-dlp extract 실패: ${JSON.stringify(result).slice(0, 80)}`); failed++;
    }
  } catch (e) { console.log(`   ❌ yt-dlp extract 에러: ${e.message}`); failed++; }

  // Test 3: FFmpeg transcode (Node.js fetch)
  try {
    // 1초 무음 WAV
    const sampleRate = 8000, duration = 1;
    const dataSize = sampleRate * duration * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const b64 = buffer.toString('base64');
    const r = await fetch(`${COMPANION}/api/ffmpeg/transcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: b64, inputFormat: 'wav', outputFormat: 'mp3' }),
    });
    const result = await r.json();
    if (result?.data && result?.size > 0) {
      console.log(`   ✅ FFmpeg transcode — WAV→MP3, ${result.size} bytes`);
      passed++;
    } else {
      console.log(`   ❌ FFmpeg transcode 실패`); failed++;
    }
  } catch (e) { console.log(`   ❌ FFmpeg transcode 에러: ${e.message}`); failed++; }

  // Test 4: 웹앱 로드 (Playwright)
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle', timeout: 15000 });
    const title = await page.title();
    console.log(`   ✅ 웹앱 로드 — ${title}`);
    passed++;
    await browser.close();
  } catch (e) { console.log(`   ❌ 웹앱 로드 에러: ${e.message}`); failed++; }

  console.log(`\n   📊 Run ${runNumber}: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function main() {
  console.log('🎬 3회 반복 검증 시작');
  let totalPassed = 0, totalFailed = 0;

  for (let i = 1; i <= 3; i++) {
    const { passed, failed } = await runTests(i);
    totalPassed += passed;
    totalFailed += failed;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 전체: ${totalPassed} passed, ${totalFailed} failed (총 ${totalPassed + totalFailed})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (totalFailed > 0) { console.log('\n❌ 일부 실패!'); process.exit(1); }
  console.log('\n✅ 3회 모두 통과!');
}

main().catch(e => { console.error(e); process.exit(1); });
