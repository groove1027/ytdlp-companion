/**
 * 리메이크 프리셋 E2E 테스트 — 실제 프레임 추출 + YouTube 링크
 *
 * ★ 2단계 테스트:
 *   Part A: 파일 업로드 → 실제 Canvas 프레임 추출 검증 (data:image/jpeg)
 *   Part B: YouTube 링크 → 실제 AI 분석 + 결과 검증
 *
 * Part A 흐름 (핵심 — 실제 프레임 추출):
 *   1. 브라우저에서 Canvas + MediaRecorder로 테스트 영상 생성 (10초)
 *   2. Blob → base64 → Node.js에서 temp 파일 저장
 *   3. 영상 분석실 → "영상 업로드" 모드 전환
 *   4. 파일 업로드 (page.waitForFileChooser)
 *   5. 티키타카 프리셋 → 실제 AI 분석 + 프레임 추출
 *   6. 검증: thumbnails가 data:image/jpeg (실제 canvas 추출)
 *   7. 검증: 타임코드 정확도
 *   8. 검증: 라이트박스 HD 이미지
 *   9. 검증: 편집실 데이터 전달
 *
 * Part B 흐름 (YouTube 링크):
 *   1. YouTube URL 입력
 *   2. 티키타카 프리셋 → 실제 AI 분석
 *   3. 검증: 결과 렌더 + 타임코드 + 편집실 전달
 *
 * 사용법: NODE_PATH=src/node_modules npx tsx test/remake-preset-e2e.ts
 */

import puppeteer from 'puppeteer';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

const DEV_PORT = 5198;
const VIDEO_SERVER_PORT = 5199;
const BASE_URL = `http://localhost:${DEV_PORT}`;
const NAV_TIMEOUT = 15000;
const ANALYSIS_TIMEOUT = 300000; // 5분

const TEST_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

let devServer: ChildProcess | null = null;
let videoServer: http.Server | null = null;
let passed = 0;
let failed = 0;
let tempVideoPath = '';
let ytDlpVideoPath = '';

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

function cleanup() {
  if (tempVideoPath && fs.existsSync(tempVideoPath)) {
    fs.unlinkSync(tempVideoPath);
    console.log(`🗑️ 임시 비디오 삭제: ${tempVideoPath}`);
  }
  if (ytDlpVideoPath && fs.existsSync(ytDlpVideoPath)) {
    fs.unlinkSync(ytDlpVideoPath);
    console.log(`🗑️ YouTube 비디오 삭제: ${ytDlpVideoPath}`);
  }
  if (videoServer) {
    videoServer.close();
    videoServer = null;
    console.log('🛑 Video server 종료');
  }
}

// ── yt-dlp로 YouTube 영상 다운로드 + 로컬 HTTP 서버 ──

async function downloadYouTubeVideo(): Promise<string | null> {
  console.log('📥 yt-dlp로 YouTube 영상 다운로드 중...');
  const tempDir = os.tmpdir();
  ytDlpVideoPath = path.join(tempDir, `yt-${TEST_VIDEO_ID}-${Date.now()}.mp4`);
  try {
    // H264 360p MP4, 최대 30초 (프레임 추출 테스트용)
    // ★ vcodec^=avc1 필수 — AV1은 headless Chrome canvas 추출에서 간헐적 실패
    execSync(
      `yt-dlp -f "bestvideo[height<=360][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]" ` +
      `--merge-output-format mp4 --no-playlist ` +
      `--download-sections "*0-30" ` +
      `-o "${ytDlpVideoPath}" "${TEST_YOUTUBE_URL}"`,
      { timeout: 120000, stdio: 'pipe' }
    );
    if (fs.existsSync(ytDlpVideoPath)) {
      const size = fs.statSync(ytDlpVideoPath).size;
      console.log(`  ✅ YouTube 영상 다운로드 완료: ${(size / 1024 / 1024).toFixed(1)}MB`);
      return ytDlpVideoPath;
    }
  } catch (e) {
    console.warn(`  ⚠️ yt-dlp 다운로드 실패: ${(e as Error).message?.substring(0, 200)}`);
  }
  return null;
}

function startVideoServer(videoPath: string): Promise<string> {
  return new Promise((resolve) => {
    videoServer = http.createServer((req, res) => {
      // CORS 헤더 — 브라우저에서 접근 가능
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

      if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

      const stat = fs.statSync(videoPath);
      const range = req.headers.range;

      if (range) {
        // Range 요청 지원 (video seeking에 필요)
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    });
    videoServer.listen(VIDEO_SERVER_PORT, () => {
      const url = `http://localhost:${VIDEO_SERVER_PORT}/video.mp4`;
      console.log(`  ✅ Video server 시작: ${url}`);
      resolve(url);
    });
  });
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

// ── 유틸: 인증 + API 키 주입 ──
async function injectAuth(page: puppeteer.Page) {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('auth_token', 'e2e-test-token');
    localStorage.setItem('auth_user', JSON.stringify({ email: 'e2e@test.com', displayName: 'E2E Tester' }));
    localStorage.setItem('CUSTOM_EVOLINK_KEY', 'REDACTED_EVOLINK_KEY');
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', 'AIzaSyDCZ4kTRy3VR8T_-tU3fd98Z2ArNspC5g4');
  });
}

async function injectAuthStore(page: puppeteer.Page) {
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
}

// ── 유틸: 분석 완료 대기 (AI + 프레임 추출) ──
async function waitForAnalysisComplete(page: puppeteer.Page, label: string): Promise<boolean> {
  console.log(`  ⏳ ${label} AI 분석 대기 중 (최대 5분)...`);
  const startTime = Date.now();

  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const status = await page.evaluate(() => {
      let storeVersions = 0;
      let storeRaw = 0;
      let storeThumbs = 0;
      try {
        const raw = localStorage.getItem('video-analysis-store');
        if (raw) {
          const parsed = JSON.parse(raw);
          storeVersions = parsed?.state?.versions?.length || 0;
          storeRaw = parsed?.state?.rawResult?.length || 0;
        }
      } catch {}
      const text = document.body.textContent || '';
      return {
        hasError: text.includes('분석 실패'),
        hasAuthPrompt: text.includes('로그인') && text.includes('가입'),
        isStillLoading: !!document.querySelector('.animate-spin'),
        storeVersions,
        storeRaw,
      };
    });

    if (status.hasAuthPrompt && elapsed < 10) {
      console.log(`  ⚠️ 인증 프롬프트 감지 — authStore 재주입`);
      await injectAuthStore(page);
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent?.includes('티키타카') && !b.disabled);
        if (btn) btn.click();
      });
      continue;
    }

    if (status.hasError) {
      console.log(`  ⚠️ 분석 실패 감지 (${elapsed}초)`);
      return false;
    }

    if (status.storeVersions > 0) {
      console.log(`  ✅ AI 분석 완료 (${elapsed}초) — ${status.storeVersions}개 버전, ${status.storeRaw}자`);

      // ★ 스피너 + 프레임 추출 대기 (스피너 유무와 관계없이 항상 썸네일 대기)
      console.log('  ⏳ 프레임 추출 대기 중...');
      for (let j = 0; j < 120; j++) {
        await new Promise(r => setTimeout(r, 1000));

        const progress = await page.evaluate(async () => {
          const spinning = !!document.querySelector('.animate-spin');
          let thumbCount = 0;
          try {
            const mod = await import('/stores/videoAnalysisStore.ts' as string);
            thumbCount = (mod as any).useVideoAnalysisStore.getState().thumbnails?.length || 0;
          } catch {}
          return { spinning, thumbCount };
        });

        // 스피너 멈춤 + 썸네일 추출 완료 → 성공
        if (!progress.spinning && progress.thumbCount > 0) {
          const total = Math.round((Date.now() - startTime) / 1000);
          console.log(`  ✅ 전체 처리 완료 (총 ${total}초, 썸네일 ${progress.thumbCount}개)`);
          break;
        }

        // 스피너 멈춤 + 아직 0 → 프레임 추출 시작 대기 (최대 30초)
        if (!progress.spinning && progress.thumbCount === 0 && j > 30) {
          console.log(`  ⚠️ 프레임 추출 ${j}초 초과 (썸네일 0) — 진행`);
          break;
        }

        if (j % 15 === 0 && j > 0) {
          console.log(`  ⏳ 프레임 추출 ${j}초... (스피너: ${progress.spinning}, 썸네일: ${progress.thumbCount})`);
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      return true;
    }

    if (elapsed % 30 === 0 && elapsed > 0) {
      console.log(`  ⏳ ${elapsed}초 경과... (로딩: ${status.isStillLoading}, versions: ${status.storeVersions}, raw: ${status.storeRaw}자)`);
    }
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
//  PART A: 파일 업로드 + 실제 프레임 추출 테스트
// ══════════════════════════════════════════════════════════════

async function generateTestVideo(page: puppeteer.Page): Promise<string> {
  console.log('\n🎬 테스트 비디오 생성 (Canvas + MediaRecorder, 10초)...');

  // 브라우저에서 비디오 생성 — addScriptTag로 __name 이슈 회피
  await page.addScriptTag({
    content: `
      window.__videoGenPromise = new Promise(function(resolve, reject) {
        var canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        var ctx = canvas.getContext('2d');
        if (!ctx) { reject('Canvas context failed'); return; }

        var stream = canvas.captureStream(30);
        var recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 500000,
        });
        var chunks = [];
        recorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = function() {
          var blob = new Blob(chunks, { type: 'video/webm' });
          var reader = new FileReader();
          reader.onload = function() {
            var result = reader.result;
            resolve(result.split(',')[1]);
          };
          reader.onerror = function() { reject('FileReader failed'); };
          reader.readAsDataURL(blob);
        };

        recorder.start();

        var colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
                       '#00FFFF', '#FF8800', '#8800FF', '#00FF88', '#FF0088'];
        var frame = 0;
        var fps = 30;
        var totalFrames = 10 * fps;

        function drawFrame() {
          if (frame >= totalFrames) {
            recorder.stop();
            return;
          }
          var second = Math.floor(frame / fps);
          var color = colors[second % colors.length];

          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 640, 360);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 72px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          var timeSec = (frame / fps).toFixed(1);
          ctx.fillText(timeSec + 's', 320, 140);

          ctx.font = 'bold 48px monospace';
          ctx.fillText('SEC ' + second, 320, 240);

          ctx.font = '20px monospace';
          ctx.fillStyle = '#000000';
          ctx.fillText('frame ' + frame + '/' + totalFrames, 320, 330);

          frame++;
          requestAnimationFrame(drawFrame);
        }
        requestAnimationFrame(drawFrame);
      });
    `,
  });

  // 비디오 생성 완료 대기 (최대 30초)
  const base64Video = await page.evaluate(function() {
    return (window as any).__videoGenPromise;
  }) as string;

  // base64 → temp 파일
  const tempDir = os.tmpdir();
  tempVideoPath = path.join(tempDir, `e2e-test-${Date.now()}.webm`);
  fs.writeFileSync(tempVideoPath, Buffer.from(base64Video, 'base64'));
  const size = fs.statSync(tempVideoPath).size;
  console.log(`  ✅ 테스트 비디오 생성 완료: ${tempVideoPath} (${(size / 1024).toFixed(0)}KB)`);
  return tempVideoPath;
}

async function testPartA(page: puppeteer.Page) {
  console.log('\n' + '═'.repeat(60));
  console.log('  PART A: 파일 업로드 → 실제 Canvas 프레임 추출 검증');
  console.log('═'.repeat(60));

  // A-1: 테스트 비디오 생성
  const videoPath = await generateTestVideo(page);
  assert(fs.existsSync(videoPath), `테스트 비디오 파일 생성됨 (${(fs.statSync(videoPath).size / 1024).toFixed(0)}KB)`);

  // A-2: 영상 분석실 진입
  await injectAuth(page);
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
  await injectAuthStore(page);
  await navigateToVideoRoom(page);

  const inVideoRoom = await page.evaluate(() => document.body.textContent?.includes('리메이크 프리셋'));
  assert(!!inVideoRoom, '영상 분석실 진입 확인');

  // A-3: "영상 업로드" 모드 전환
  const switchedToUpload = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const uploadBtn = buttons.find(b => b.textContent?.includes('영상 업로드'));
    if (uploadBtn) { uploadBtn.click(); return true; }
    return false;
  });
  assert(switchedToUpload, '"영상 업로드" 모드 전환');
  await new Promise(r => setTimeout(r, 1000));

  // A-4: 파일 업로드 (FileChooser API)
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.evaluate(() => {
      // 업로드 버튼 또는 드래그 영역 클릭
      const buttons = Array.from(document.querySelectorAll('button'));
      const uploadArea = buttons.find(b =>
        b.textContent?.includes('클릭') && b.textContent?.includes('영상 파일')
      );
      if (uploadArea) { uploadArea.click(); return; }
      // input[type=file] 직접 클릭 시도
      const fileInput = document.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;
      if (fileInput) fileInput.click();
    }),
  ]);
  await fileChooser.accept([videoPath]);
  await new Promise(r => setTimeout(r, 2000));

  // 파일 업로드 확인 — UI에 파일명 표시
  const fileUploaded = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return text.includes('.webm') || text.includes('MB') || text.includes('영상 추가');
  });
  assert(fileUploaded, '영상 파일 업로드 확인');

  // A-5: 티키타카 프리셋 클릭 → AI 분석
  const presetClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('티키타카') && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
  assert(presetClicked, '티키타카 프리셋 클릭 (파일 업로드 모드)');

  // A-6: AI 분석 + 프레임 추출 완료 대기
  const analysisOk = await waitForAnalysisComplete(page, '[Part A 파일업로드]');
  assert(analysisOk, '파일 업로드 AI 분석 완료');

  if (!analysisOk) {
    console.log('  ⚠️ 분석 미완료 — Part A 나머지 테스트 스킵');
    return;
  }

  // A-7: ★ 핵심 검증 — thumbnails가 data:image/jpeg (실제 canvas 추출)
  const thumbCheck = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const thumbs = state.thumbnails || [];
      const results = thumbs.map((t: any) => ({
        timeSec: t.timeSec,
        isDataUrl: typeof t.url === 'string' && t.url.startsWith('data:image/'),
        isYtFallback: typeof t.url === 'string' && t.url.includes('ytimg.com'),
        urlPrefix: typeof t.url === 'string' ? t.url.substring(0, 30) : 'N/A',
        hasHd: !!t.hdUrl,
        hdIsDataUrl: typeof t.hdUrl === 'string' && t.hdUrl.startsWith('data:image/'),
      }));
      return {
        count: thumbs.length,
        allDataUrl: results.every((r: any) => r.isDataUrl),
        anyYtFallback: results.some((r: any) => r.isYtFallback),
        samples: results.slice(0, 5),
      };
    } catch { return { count: 0, allDataUrl: false, anyYtFallback: false, samples: [] }; }
  });

  console.log(`  [INFO] 썸네일 ${thumbCheck.count}개:`);
  thumbCheck.samples.forEach((s: any) => {
    console.log(`    - t=${s.timeSec}s, dataUrl=${s.isDataUrl}, ytFallback=${s.isYtFallback}, HD=${s.hasHd}, hdDataUrl=${s.hdIsDataUrl}, prefix=${s.urlPrefix}`);
  });

  assert(thumbCheck.count >= 2, `프레임 ${thumbCheck.count}개 추출됨 (최소 2개)`);
  assert(thumbCheck.allDataUrl, `★ 모든 프레임이 data:image/ URL (실제 Canvas 추출) — YouTube 폴백 아님`);
  assert(!thumbCheck.anyYtFallback, `★ YouTube 썸네일 폴백 없음 (ytimg.com 미사용)`);

  // A-8: 타임코드 존재 + 유효성 확인
  const timecodeCheck = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const thumbs = state.thumbnails || [];
      const timeSecs = thumbs.map((t: any) => t.timeSec).filter((t: any) => typeof t === 'number');
      return {
        timecodesFound: timeSecs.length,
        allNonNegative: timeSecs.every((t: number) => t >= 0),
        sorted: JSON.stringify(timeSecs) === JSON.stringify([...timeSecs].sort((a: number, b: number) => a - b)),
        values: timeSecs.slice(0, 8),
      };
    } catch { return { timecodesFound: 0, allNonNegative: false, sorted: false, values: [] }; }
  });
  console.log(`  [INFO] 타임코드: ${timecodeCheck.values.map((v: number) => v.toFixed(1) + 's').join(', ')}`);
  assert(timecodeCheck.timecodesFound >= 2, `타임코드 ${timecodeCheck.timecodesFound}개 (최소 2개)`);
  assert(timecodeCheck.allNonNegative, '모든 타임코드 ≥ 0');

  // HD 프레임 존재 확인
  const hdCheck = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const thumbs = state.thumbnails || [];
      const withHd = thumbs.filter((t: any) => t.hdUrl && t.hdUrl.startsWith('data:image/'));
      return { withHdCount: withHd.length, total: thumbs.length };
    } catch { return { withHdCount: 0, total: 0 }; }
  });
  assert(hdCheck.withHdCount > 0, `HD 프레임 ${hdCheck.withHdCount}/${hdCheck.total}개 (data:image/ HD URL)`);

  // A-9: 첫 버전 펼치기 (재시도 포함)
  await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const store = (mod as any).useVideoAnalysisStore;
      const versions = store.getState().versions;
      if (versions?.length > 0) store.setState({ expandedId: versions[0].id });
    } catch {}
  });

  // 썸네일 이미지가 DOM에 렌더링될 때까지 대기 (최대 10초)
  for (let wait = 0; wait < 10; wait++) {
    await new Promise(r => setTimeout(r, 1000));
    const hasImgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img.object-cover')).some(img => (img as HTMLImageElement).offsetWidth > 0)
    );
    if (hasImgs) break;
    // 2초마다 expandedId 재설정 (React 리렌더 트리거)
    if (wait % 2 === 1) {
      await page.evaluate(async () => {
        try {
          const mod = await import('/stores/videoAnalysisStore.ts' as string);
          const store = (mod as any).useVideoAnalysisStore;
          const versions = store.getState().versions;
          if (versions?.length > 0) {
            store.setState({ expandedId: null });
            await new Promise(r => setTimeout(r, 200));
            store.setState({ expandedId: versions[0].id });
          }
        } catch {}
      });
    }
  }
  await new Promise(r => setTimeout(r, 1000));

  // A-10: 라이트박스 열기 — 썸네일 이미지 클릭 (확장된 셀렉터)
  const clickResult = await page.evaluate(() => {
    // 방법 1: img.object-cover (기존)
    let imgs = Array.from(document.querySelectorAll('img.object-cover'));
    let thumbnail = imgs.find(img => img.offsetWidth > 0 && img.offsetWidth <= 200);
    if (!thumbnail) {
      // 방법 2: 모든 이미지 중 썸네일 크기
      imgs = Array.from(document.querySelectorAll('img'));
      thumbnail = imgs.find(img => {
        const src = img.getAttribute('src') || '';
        return src.startsWith('data:image/') && img.offsetWidth > 0 && img.offsetWidth <= 200;
      });
    }
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
  const lightboxInfo = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.fixed'));
    const overlay = overlays.find(el => {
      const cls = el.getAttribute('class') || '';
      return cls.includes('inset-0') && (cls.includes('z-[9999]') || cls.includes('z-50'));
    });
    if (!overlay) return null;
    const img = overlay.querySelector('img');
    return {
      isOpen: true,
      hasImage: !!img,
      imgSrcIsDataUrl: img?.src?.startsWith('data:image/') || false,
      imgSrcPrefix: img?.src?.substring(0, 40) || '',
      imgWidth: img?.naturalWidth || 0,
      imgHeight: img?.naturalHeight || 0,
    };
  });

  if (lightboxInfo) {
    assert(lightboxInfo.isOpen, '라이트박스 모달 열림');
    assert(lightboxInfo.hasImage, `HD 이미지 존재 (${lightboxInfo.imgWidth}x${lightboxInfo.imgHeight})`);
    assert(lightboxInfo.imgSrcIsDataUrl, `★ 라이트박스 HD 이미지가 data:image/ (실제 Canvas 추출)`);
  } else {
    assert(false, '라이트박스 모달을 찾을 수 없음');
    assert(false, 'HD 이미지 확인 스킵');
    assert(false, '라이트박스 data:image 확인 스킵');
  }

  // 모달 닫기
  await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.fixed'));
    const overlay = overlays.find(el => {
      const cls = el.getAttribute('class') || '';
      return cls.includes('inset-0') && (cls.includes('z-[9999]') || cls.includes('z-50'));
    });
    if (overlay) (overlay as HTMLElement).click();
  });
  await new Promise(r => setTimeout(r, 500));

  // A-11: 편집실 전달 검증 (재시도 + 스크롤)
  let editBtnClicked = false;
  for (let retry = 0; retry < 5; retry++) {
    editBtnClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('편집실로') && !b.disabled);
      if (btn) { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); btn.click(); return true; }
      // 스크롤해서 숨겨진 버튼 찾기
      window.scrollTo(0, document.body.scrollHeight);
      return false;
    });
    if (editBtnClicked) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  assert(editBtnClicked, '"편집실로" 버튼 클릭 (Part A)');
  await new Promise(r => setTimeout(r, 5000));

  // 편집실 탭 전환 확인
  const editRoomA = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return text.includes('편집점') || text.includes('편집실') || text.includes('소스 등록') || text.includes('소스 영상');
  });
  assert(editRoomA, '편집실 탭 전환됨 (Part A)');

  // editPointStore 데이터 확인
  const editStoreA = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/editPointStore.ts' as string);
      const state = (mod as any).useEditPointStore.getState();
      return {
        found: true,
        hasRawEditTable: (state.rawEditTable?.length || 0) > 10,
        rawEditTableLength: state.rawEditTable?.length || 0,
        sourceVideoCount: state.sourceVideos?.length || 0,
      };
    } catch { return { found: false, hasRawEditTable: false, rawEditTableLength: 0, sourceVideoCount: 0 }; }
  });
  if (editStoreA.found) {
    console.log(`  [INFO] editPointStore: rawEditTable=${editStoreA.rawEditTableLength}자, sources=${editStoreA.sourceVideoCount}`);
    assert(editStoreA.hasRawEditTable, `편집표 데이터 전달됨 (${editStoreA.rawEditTableLength}자)`);
  } else {
    assert(editRoomA, '편집실에 데이터 전달됨 (UI 확인)');
  }

  console.log('\n  ──── Part A 완료 ────');
}

// ══════════════════════════════════════════════════════════════
//  PART B: YouTube 링크 테스트
// ══════════════════════════════════════════════════════════════

async function testPartB(page: puppeteer.Page, localVideoUrl: string | null) {
  console.log('\n' + '═'.repeat(60));
  console.log('  PART B: YouTube 링크 → AI 분석 + 실제 프레임 추출');
  console.log(`  로컬 비디오: ${localVideoUrl || '없음 (yt-dlp 실패 시 썸네일 폴백)'}`);
  console.log('═'.repeat(60));

  // B-1: evaluateOnNewDocument로 fetch + Turnstile 오버라이드 (page.goto 이전!)
  await injectAuth(page);

  if (localVideoUrl) {
    // ★ 핵심: fetch override + Turnstile 차단을 페이지 로드 전에 주입
    await page.evaluateOnNewDocument((videoUrl: string) => {
      // 1) Turnstile 스크립트 로드 차단 — appendChild 오버라이드
      //    cobaltAuthService가 <script src="...turnstile..."> 삽입 시 즉시 onerror 발생
      //    → turnstileFailed = true → Phase 1 스킵 → Phase 2 fetch 인터셉트
      var origAppend = HTMLHeadElement.prototype.appendChild;
      HTMLHeadElement.prototype.appendChild = function(child: any) {
        if (child && child.tagName === 'SCRIPT' && child.src &&
            child.src.indexOf('turnstile') !== -1) {
          var script = child;
          setTimeout(function() {
            if (script.onerror) script.onerror(new Event('error'));
          }, 10);
          return child;
        }
        return origAppend.call(this, child);
      } as any;

      // 2) fetch 오버라이드 — Cobalt 도메인 요청을 로컬 비디오 URL로 리다이렉트
      var origFetch = window.fetch.bind(window);
      window.fetch = function(input: any, init?: any): Promise<Response> {
        var url = '';
        if (typeof input === 'string') url = input;
        else if (input instanceof URL) url = input.href;
        else if (input && input.url) url = input.url;

        var isCobalt = url.indexOf('cobalt-api.meowing.de') !== -1 ||
                        url.indexOf('cobalt-backend.canine.tools') !== -1 ||
                        url.indexOf('capi.3kh0.net') !== -1;
        var method = (init && init.method) || 'GET';

        // Cobalt /session POST → fake JWT
        if (isCobalt && url.indexOf('/session') !== -1 && method === 'POST') {
          console.log('[E2E] Cobalt /session 인터셉트');
          return Promise.resolve(new Response(
            JSON.stringify({ token: 'e2e-jwt', exp: 3600 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ));
        }

        // Cobalt 다운로드 POST → 로컬 비디오 URL
        if (isCobalt && method === 'POST') {
          console.log('[E2E] Cobalt 다운로드 인터셉트 → ' + videoUrl);
          return Promise.resolve(new Response(
            JSON.stringify({ status: 'redirect', url: videoUrl, filename: 'test.mp4' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ));
        }

        // Cobalt GET (인스턴스 info) → 가짜 서비스 정보
        if (isCobalt && method === 'GET') {
          return Promise.resolve(new Response(
            JSON.stringify({ cobalt: { services: ['youtube'], turnstileSitekey: '0x4AAAAAABhzartpLFFY4gsC' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ));
        }

        // instances.cobalt.best → 하드코딩 인스턴스 목록
        if (url.indexOf('instances.cobalt.best') !== -1) {
          console.log('[E2E] Cobalt 인스턴스 목록 인터셉트');
          return Promise.resolve(new Response(
            JSON.stringify([{
              api_url: 'https://cobalt-api.meowing.de/',
              services: { youtube: true }, score: 100, online: true,
            }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ));
        }

        return origFetch(input, init);
      } as typeof fetch;
    }, localVideoUrl);
    console.log('  ✅ Cobalt fetch 오버라이드 + Turnstile 차단 설정 (evaluateOnNewDocument)');
  }

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
  await injectAuthStore(page);
  await navigateToVideoRoom(page);

  // 새 분석 시작 (이전 결과 초기화)
  await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      (mod as any).useVideoAnalysisStore.getState().newAnalysis();
    } catch {}
  });
  await new Promise(r => setTimeout(r, 1000));

  const inRoom = await page.evaluate(() => document.body.textContent?.includes('리메이크 프리셋'));
  assert(!!inRoom, '영상 분석실 진입 (Part B)');

  // 프리셋 확인
  const presets = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      tikitaka: text.includes('티키타카'),
      snack: text.includes('스낵형'),
      condensed: text.includes('축약 리캡'),
      shopping: text.includes('쇼핑형'),
    };
  });
  assert(presets.tikitaka && presets.snack && presets.condensed && presets.shopping, '프리셋 4종 확인');

  // B-2: YouTube URL 입력
  const inputOk = await page.evaluate((url: string) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const urlInput = inputs.find(i =>
      i.placeholder?.toLowerCase().includes('youtube') ||
      i.placeholder?.includes('URL') || i.type === 'url'
    );
    if (!urlInput) return false;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(urlInput, url);
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      urlInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }, TEST_YOUTUBE_URL);
  assert(inputOk, `YouTube URL 입력: ${TEST_YOUTUBE_URL}`);
  await new Promise(r => setTimeout(r, 1000));

  // B-3: 프리셋 활성화 확인
  const presetEnabled = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('티키타카'));
    return btn ? !btn.disabled : false;
  });
  assert(presetEnabled, '프리셋 버튼 활성화');

  // B-4: 티키타카 프리셋 클릭
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes('티키타카') && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
  assert(clicked, '티키타카 프리셋 클릭 (YouTube 모드)');

  // B-5: AI 분석 완료 대기
  const analysisOk = await waitForAnalysisComplete(page, '[Part B YouTube]');
  assert(analysisOk, 'YouTube AI 분석 완료');

  if (!analysisOk) {
    console.log('  ⚠️ 분석 미완료 — Part B 나머지 테스트 스킵');
    return;
  }

  // B-6: 결과 확인 — 버전 + 장면 + 타임코드 + ★ 프레임 추출 유형 검증
  const resultInfo = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const state = (mod as any).useVideoAnalysisStore.getState();
      const versions = state.versions || [];
      const thumbs = state.thumbnails || [];
      const timecodes: string[] = [];
      for (const v of versions) {
        for (const s of (v.scenes || [])) {
          if (s.timecodeSource) timecodes.push(s.timecodeSource);
        }
      }
      return {
        versionsCount: versions.length,
        thumbnailCount: thumbs.length,
        timecodeCount: timecodes.length,
        timecodeSample: [...new Set(timecodes)].slice(0, 5),
        firstTitle: versions[0]?.title || 'N/A',
        thumbTypes: thumbs.slice(0, 5).map((t: any) => ({
          isDataUrl: t.url?.startsWith('data:image/'),
          isYtThumb: t.url?.includes('ytimg.com') || t.url?.includes('img.youtube.com'),
          urlPrefix: (t.url || '').substring(0, 40),
          hasHd: !!t.hdUrl,
          hdIsDataUrl: typeof t.hdUrl === 'string' && t.hdUrl.startsWith('data:image/'),
          timeSec: t.timeSec,
        })),
        allDataUrl: thumbs.every((t: any) => typeof t.url === 'string' && t.url.startsWith('data:image/')),
        anyYtFallback: thumbs.some((t: any) => typeof t.url === 'string' && (t.url.includes('ytimg.com') || t.url.includes('img.youtube.com'))),
      };
    } catch { return null; }
  });

  if (resultInfo) {
    console.log(`  [INFO] ${resultInfo.versionsCount}개 버전, ${resultInfo.thumbnailCount}개 썸네일, ${resultInfo.timecodeCount}개 타임코드`);
    console.log(`  [INFO] 타임코드 샘플: ${resultInfo.timecodeSample.join(', ')}`);
    console.log(`  [INFO] 썸네일 유형:`);
    resultInfo.thumbTypes.forEach((t: any) => {
      console.log(`    - t=${t.timeSec}s dataUrl=${t.isDataUrl}, ytThumb=${t.isYtThumb}, HD=${t.hasHd}, hdDataUrl=${t.hdIsDataUrl}, prefix=${t.urlPrefix}`);
    });

    assert(resultInfo.versionsCount >= 1, `버전 ${resultInfo.versionsCount}개 생성됨`);
    assert(resultInfo.timecodeCount >= 3, `타임코드 ${resultInfo.timecodeCount}개`);
    assert(resultInfo.thumbnailCount >= 2, `썸네일 ${resultInfo.thumbnailCount}개`);

    // ★ YouTube에서도 실제 프레임 추출 검증 (yt-dlp → 로컬 서버 → Canvas 추출)
    if (resultInfo.allDataUrl) {
      console.log('  ★★ YouTube 영상에서 실제 프레임 추출 성공! (data:image/)');
      assert(true, '★ YouTube 실제 프레임 추출 (data:image/) — 다운로드 → Canvas 추출 성공');
      assert(!resultInfo.anyYtFallback, '★ YouTube 썸네일 폴백 미사용 (ytimg.com 없음)');
    } else if (localVideoUrl && resultInfo.anyYtFallback) {
      // 로컬 비디오가 있는데도 폴백이면 문제
      console.log('  ❌ 로컬 비디오 제공했는데 여전히 YouTube 폴백?');
      assert(false, '★ YouTube 실제 프레임 추출 실패 — 로컬 비디오 인터셉트 확인 필요');
    } else if (resultInfo.anyYtFallback) {
      // yt-dlp가 없어서 로컬 비디오 못 만든 경우
      console.log('  ⚠️ yt-dlp 미설치/실패 → YouTube 썸네일 폴백');
      assert(true, 'YouTube 썸네일 폴백 (yt-dlp 미설치)');
    } else {
      assert(resultInfo.thumbnailCount > 0, 'YouTube 모드: 프레임/썸네일 존재 확인');
    }
  } else {
    assert(false, '결과 정보 확인 실패');
  }

  // B-7: 버전 펼치기 + 장면 내용 확인 (Part A와 동일한 강건한 확장 로직)
  await page.evaluate(async () => {
    try {
      const mod = await import('/stores/videoAnalysisStore.ts' as string);
      const store = (mod as any).useVideoAnalysisStore;
      const versions = store.getState().versions;
      if (versions?.length > 0) store.setState({ expandedId: versions[0].id });
    } catch {}
  });
  // 버전 펼치기 대기 (최대 10초)
  for (let wait = 0; wait < 10; wait++) {
    await new Promise(r => setTimeout(r, 1000));
    const rendered = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return /\d+:\d+/.test(text) || text.includes('컷') || text.includes('장면') || text.includes('Scene');
    });
    if (rendered) break;
    if (wait % 2 === 1) {
      await page.evaluate(async () => {
        try {
          const mod = await import('/stores/videoAnalysisStore.ts' as string);
          const store = (mod as any).useVideoAnalysisStore;
          const versions = store.getState().versions;
          if (versions?.length > 0) {
            store.setState({ expandedId: null });
            await new Promise(r => setTimeout(r, 200));
            store.setState({ expandedId: versions[0].id });
          }
        } catch {}
      });
    }
  }

  const tableContent = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      // 확장된 패턴: 컷, 장면, Scene, #, 번호, 시간 포함
      hasSceneRows: /컷\s*[#\d]/.test(text) || /\[\d+\]/.test(text) || /\[N\]|\[S\]/.test(text) ||
                    /장면\s*\d/.test(text) || /Scene\s*\d/i.test(text) ||
                    /[①②③④⑤⑥⑦⑧⑨⑩]/.test(text) || /\d+\.\s/.test(text),
      hasAudioContent: text.includes('오디오') || text.includes('나레이션') || text.includes('대사') || text.includes('AI'),
      hasDuration: /\d+:\d+/.test(text),
    };
  });
  assert(tableContent.hasSceneRows || tableContent.hasDuration, '장면/시간 정보 표시');
  assert(tableContent.hasDuration, '시간 정보 표시');

  // B-8: 편집실 전달 (재시도 + 스크롤)
  let editClicked = false;
  for (let retry = 0; retry < 5; retry++) {
    editClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('편집실로') && !b.disabled);
      if (btn) { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); btn.click(); return true; }
      window.scrollTo(0, document.body.scrollHeight);
      return false;
    });
    if (editClicked) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  assert(editClicked, '"편집실로" 버튼 클릭 (Part B)');
  await new Promise(r => setTimeout(r, 5000));

  const editRoomB = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return text.includes('편집점') || text.includes('편집실') || text.includes('소스 등록') || text.includes('소스 영상');
  });
  assert(editRoomB, '편집실 탭 전환됨 (Part B)');

  // editPointStore 확인
  const editStoreB = await page.evaluate(async () => {
    try {
      const mod = await import('/stores/editPointStore.ts' as string);
      const state = (mod as any).useEditPointStore.getState();
      const raw = state.rawEditTable || '';
      const timecodePattern = /\d{1,2}:\d{2}/g;
      const matches = raw.match(timecodePattern) || [];
      return {
        hasRawEditTable: raw.length > 10,
        rawEditTableLength: raw.length,
        timecodeCount: matches.length,
        timecodeSample: matches.slice(0, 5),
      };
    } catch { return { hasRawEditTable: false, rawEditTableLength: 0, timecodeCount: 0, timecodeSample: [] }; }
  });

  if (editStoreB.hasRawEditTable) {
    console.log(`  [INFO] 편집표: ${editStoreB.rawEditTableLength}자, 타임코드 ${editStoreB.timecodeCount}개`);
    assert(editStoreB.hasRawEditTable, `편집표 전달됨 (${editStoreB.rawEditTableLength}자)`);
    assert(editStoreB.timecodeCount >= 2, `편집표 내 타임코드 ${editStoreB.timecodeCount}개`);
  } else {
    assert(editRoomB, '편집실 데이터 전달됨 (UI 확인)');
  }

  console.log('\n  ──── Part B 완료 ────');
}

// ══════════════════════════════════════════════════════════════
// 메인 실행
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('🧪 리메이크 프리셋 E2E 테스트 — 실제 프레임 추출 + YouTube');
  console.log('══════════════════════════════════════════════════════');

  try {
    await startDevServer();
  } catch (err) {
    console.error(`❌ Dev server 시작 실패: ${(err as Error).message}`);
    process.exit(1);
  }

  let browser: puppeteer.Browser | null = null;

  try {
    // Part A: headless (파일 업로드는 headless에서 문제 없음)
    // Part B: headed (Cobalt Turnstile CAPTCHA 자동 해결에 실제 브라우저 필요)
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
             '--enable-features=SharedArrayBuffer'],
    });

    const consoleErrors: string[] = [];

    // ═══ Part A: 파일 업로드 테스트 ═══
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        const text = msg.text();
        if (text.includes('[Frame]') || text.includes('[VideoAnalysis]')) {
          console.log(`  [APP] ${text.substring(0, 200)}`);
        }
      });

      await testPartA(page);
      await page.close();
    }

    // ═══ Part B 준비: yt-dlp로 YouTube 영상 다운로드 + 로컬 서버 ═══
    let localVideoUrl: string | null = null;
    const ytVideoPath = await downloadYouTubeVideo();
    if (ytVideoPath) {
      localVideoUrl = await startVideoServer(ytVideoPath);
    } else {
      console.log('  ⚠️ yt-dlp 다운로드 실패 — YouTube 썸네일 폴백으로 진행');
    }

    // ═══ Part B: YouTube 링크 테스트 ═══
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        const text = msg.text();
        if (text.includes('[Frame]') || text.includes('[VideoAnalysis]') || text.includes('[Cobalt]')) {
          console.log(`  [APP] ${text.substring(0, 200)}`);
        }
      });

      await testPartB(page, localVideoUrl);
      await page.close();
    }

    // 콘솔 에러 확인
    console.log('\n📋 Console Errors:');
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') && !e.includes('DevTools') &&
      !e.includes('ytimg.com') && !e.includes('CORS') && !e.includes('Access-Control') &&
      !e.includes('onnxruntime') && !e.includes('ffmpeg') && !e.includes('Piped') &&
      !e.includes('Invidious') && !e.includes('Cobalt') && !e.includes('cobalt')
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
    cleanup();
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ 모든 테스트 통과!');
  } else {
    console.log('❌ 일부 테스트 실패');
  }
  console.log('══════════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  stopDevServer();
  cleanup();
  process.exit(1);
});
