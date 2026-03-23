/**
 * E2E Test: /api/download 오디오 포함 검증
 *
 * YouTube 쇼츠 영상을 서버 프록시로 다운로드 → 오디오 트랙 존재 여부 확인
 * 테스트 대상: server/index.js /api/download ffmpeg 머지 수정
 *
 * 실행: node test/e2e-download-audio-fix.mjs
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';

const SERVER_URL = 'http://localhost:3199';
const TEST_VIDEO_URL = 'https://www.youtube.com/shorts/HMBqVXNjrgo';
const VIDEO_ID = 'HMBqVXNjrgo';
const TMP_DIR = '/tmp';

let passed = 0;
let failed = 0;

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

function assert(condition, testName) {
  if (condition) {
    passed++;
    log('✅', `PASS: ${testName}`);
  } else {
    failed++;
    log('❌', `FAIL: ${testName}`);
  }
}

async function testServerHealth() {
  log('🔍', '=== Test 1: 서버 Health Check ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(`${SERVER_URL}/health`);
    const body = await response.json();
    assert(response.status() === 200, '서버 응답 200 OK');
    assert(body.status === 'ok', '서버 status: ok');
  } finally {
    await browser.close();
  }
}

async function testStreamExtraction() {
  log('🔍', '=== Test 2: 스트림 URL 추출 (audioUrl 포함 확인) ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(
      `${SERVER_URL}/api/extract?url=${encodeURIComponent(VIDEO_ID)}&quality=720p`,
      { timeout: 60000 }
    );
    const body = await response.json();

    assert(response.status() === 200, 'stream API 응답 200 OK');
    assert(!!body.url, 'videoUrl 존재');
    assert(!!body.audioUrl, 'audioUrl 존재 (분리 스트림 확인)');
    assert(body.audioUrl !== null, 'audioUrl이 null이 아님');

    // audioCodec, audioExt 확인 (새로 추가된 필드)
    log('📝', `  audioCodec: ${body.audioCodec || 'N/A'}`);
    log('📝', `  audioExt: ${body.audioExt || 'N/A'}`);
    log('📝', `  title: ${body.title || 'N/A'}`);

    return body;
  } finally {
    await browser.close();
  }
}

async function testMergedDownload() {
  log('🔍', '=== Test 3: 머지 다운로드 (오디오 포함 MP4) ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const tmpFile = path.join(TMP_DIR, `test-merged-${Date.now()}.mp4`);

  try {
    // 직접 다운로드 → Blob으로 받기
    log('⏳', '  영상 다운로드 중 (ffmpeg 머지)... 최대 3분 대기');

    const downloadUrl = `${SERVER_URL}/api/download?url=${encodeURIComponent(VIDEO_ID)}&quality=720p`;

    const result = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (!response.ok) return { error: `HTTP ${response.status}`, size: 0 };

        const blob = await response.blob();
        const contentType = response.headers.get('content-type');
        const contentDisposition = response.headers.get('content-disposition');

        return {
          size: blob.size,
          type: blob.type || contentType,
          contentType,
          contentDisposition,
          error: null,
        };
      } catch (e) {
        return { error: e.message, size: 0 };
      }
    }, downloadUrl);

    assert(!result.error, `다운로드 성공 (에러 없음): ${result.error || 'OK'}`);
    assert(result.size > 0, `파일 크기 > 0 (${(result.size / 1024 / 1024).toFixed(1)}MB)`);
    assert(result.size > 50000, `파일 크기 > 50KB (너무 작으면 비디오만인 가능성)`);

    log('📝', `  Content-Type: ${result.contentType}`);
    log('📝', `  Content-Disposition: ${result.contentDisposition}`);
    log('📝', `  Size: ${(result.size / 1024 / 1024).toFixed(2)}MB`);

    // 서버에서 직접 다운로드해서 ffprobe로 오디오 트랙 확인
    log('⏳', '  ffprobe로 오디오 트랙 검증 중...');

    try {
      execSync(`curl -s -o "${tmpFile}" "${downloadUrl}"`, { timeout: 180000 });

      // ffprobe로 오디오 스트림 확인
      const probeOutput = execSync(
        `ffprobe -v quiet -show_streams -print_format json "${tmpFile}" 2>/dev/null`,
        { encoding: 'utf8', timeout: 30000 }
      );
      const probeData = JSON.parse(probeOutput);

      const audioStreams = probeData.streams.filter(s => s.codec_type === 'audio');
      const videoStreams = probeData.streams.filter(s => s.codec_type === 'video');

      assert(videoStreams.length > 0, `비디오 트랙 존재 (${videoStreams.length}개)`);
      assert(audioStreams.length > 0, `오디오 트랙 존재 (${audioStreams.length}개) ★ 핵심 검증 ★`);

      if (videoStreams.length > 0) {
        log('📝', `  비디오 코덱: ${videoStreams[0].codec_name} (${videoStreams[0].width}x${videoStreams[0].height})`);
      }
      if (audioStreams.length > 0) {
        log('📝', `  오디오 코덱: ${audioStreams[0].codec_name} (${audioStreams[0].sample_rate}Hz, ${audioStreams[0].channels}ch)`);
      }
    } catch (probeErr) {
      log('⚠️', `  ffprobe 검증 실패: ${probeErr.message}`);
      failed++;
    }

  } finally {
    // 임시 파일 정리
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
    await browser.close();
  }
}

async function testVideoOnlyDownload() {
  log('🔍', '=== Test 4: videoOnly=true 다운로드 (오디오 없어야 정상) ===');

  const tmpFile = path.join(TMP_DIR, `test-videoonly-${Date.now()}.mp4`);

  try {
    const downloadUrl = `${SERVER_URL}/api/download?url=${encodeURIComponent(VIDEO_ID)}&quality=720p&videoOnly=true`;

    log('⏳', '  videoOnly 다운로드 중...');
    execSync(`curl -s -o "${tmpFile}" "${downloadUrl}"`, { timeout: 180000 });

    const probeOutput = execSync(
      `ffprobe -v quiet -show_streams -print_format json "${tmpFile}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const probeData = JSON.parse(probeOutput);

    const audioStreams = probeData.streams.filter(s => s.codec_type === 'audio');
    const videoStreams = probeData.streams.filter(s => s.codec_type === 'video');

    assert(videoStreams.length > 0, 'videoOnly: 비디오 트랙 존재');
    assert(audioStreams.length === 0, 'videoOnly: 오디오 트랙 없음 (정상 — 비디오만 요청)');

    if (videoStreams.length > 0) {
      log('📝', `  비디오 코덱: ${videoStreams[0].codec_name}`);
    }
    log('📝', `  오디오 트랙: ${audioStreams.length}개 (0이어야 정상)`);

  } catch (err) {
    log('⚠️', `  videoOnly 테스트 실패: ${err.message}`);
    failed++;
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════
async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  E2E Test: /api/download 오디오 포함 검증     ║');
  console.log('║  Video: HMBqVXNjrgo (YouTube Shorts)         ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  try {
    await testServerHealth();
    await testStreamExtraction();
    await testMergedDownload();
    await testVideoOnlyDownload();
  } catch (err) {
    log('💥', `테스트 실행 오류: ${err.message}`);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  결과: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
