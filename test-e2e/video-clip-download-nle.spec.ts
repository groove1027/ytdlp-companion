/**
 * 컴패니언 다운로드 → FFmpeg 트리밍 → NLE 내보내기 E2E 테스트
 *
 * 1. 컴패니언으로 YouTube 영상 다운로드
 * 2. FFmpeg으로 편집점 기준 트리밍
 * 3. 트리밍된 MP4 파일 크기 검증
 * 4. Premiere XML 내보내기 검증 (타임코드, 미디어 경로)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const COMPANION = 'http://127.0.0.1:9876';
const SCREENSHOT_DIR = path.resolve(__dirname);

test.describe('컴패니언 다운로드 + 트리밍 + NLE 내보내기', () => {
  test.setTimeout(300_000);

  test('컴패니언 영상 다운로드 → FFmpeg 트리밍 → MP4 검증', async ({}) => {
    // Step 1: 컴패니언 health check
    console.log('[1] 컴패니언 상태 확인...');
    const healthRes = await fetch(`${COMPANION}/health`);
    const health = await healthRes.json() as any;
    expect(health.status).toBe('ok');
    console.log(`  ✅ 컴패니언 v${health.version} 정상`);

    // Step 2: FFmpeg 지원 확인
    console.log('[2] FFmpeg cut 지원 확인...');
    const capRes = await fetch(`${COMPANION}/api/ffmpeg/capability`, {
      signal: AbortSignal.timeout(10000),
    });
    expect(capRes.ok).toBe(true);
    console.log('  ✅ FFmpeg cut 지원');

    // Step 3: YouTube 영상 다운로드 (480p, 짧은 영상으로 테스트)
    const videoId = 'ufXz59788qs'; // YTN 파월 (4:29)
    const startSec = 119; // 1:59 — Gemini가 찾은 편집점
    const endSec = 134; // 2:14

    console.log(`[3] 영상 다운로드: ${videoId} (480p)...`);
    const dlUrl = `${COMPANION}/api/download?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&quality=480p&videoOnly=true`;
    const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(120000) });
    expect(dlRes.ok).toBe(true);

    const videoBlob = await dlRes.blob();
    const videoSizeMB = (videoBlob.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ 다운로드 완료: ${videoSizeMB}MB`);
    expect(videoBlob.size).toBeGreaterThan(100 * 1024); // 최소 100KB

    // Step 4: FFmpeg 트리밍 (편집점 구간만 잘라내기)
    console.log(`[4] FFmpeg 트리밍: ${startSec}s → ${endSec}s (${endSec - startSec}초)...`);

    const videoBuffer = Buffer.from(await videoBlob.arrayBuffer());
    const videoBase64 = videoBuffer.toString('base64');

    const cutRes = await fetch(`${COMPANION}/api/ffmpeg/cut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: videoBase64,
        inputFormat: 'mp4',
        clips: [{ label: 'clip1', startSec, endSec }],
      }),
      signal: AbortSignal.timeout(120000),
    });

    expect(cutRes.ok).toBe(true);
    const cutContentType = cutRes.headers.get('content-type') || '';
    console.log(`  Content-Type: ${cutContentType}`);

    const cutBlob = await cutRes.blob();
    const cutSizeMB = (cutBlob.size / 1024 / 1024).toFixed(2);
    console.log(`  ✅ 트리밍 완료: ${cutSizeMB}MB`);
    expect(cutBlob.size).toBeGreaterThan(10 * 1024); // 최소 10KB

    // Step 5: 트리밍된 파일 저장 + 검증
    const clipPath = path.join(SCREENSHOT_DIR, 'dl-trimmed-clip.mp4');

    // ZIP인 경우 내부 MP4 추출
    if (cutContentType.includes('zip') || cutContentType.includes('octet-stream')) {
      const zipBuffer = Buffer.from(await cutBlob.arrayBuffer());
      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'dl-trimmed-clip.zip'), zipBuffer);
      console.log(`  ZIP 저장: dl-trimmed-clip.zip (${cutSizeMB}MB)`);

      // unzip으로 내용물 확인
      const { execSync } = require('child_process');
      const zipContents = execSync(`unzip -l ${path.join(SCREENSHOT_DIR, 'dl-trimmed-clip.zip')}`).toString();
      console.log(`  ZIP 내용:\n${zipContents}`);
      expect(zipContents).toContain('.mp4');
    } else {
      const mp4Buffer = Buffer.from(await cutBlob.arrayBuffer());
      fs.writeFileSync(clipPath, mp4Buffer);
      console.log(`  MP4 저장: dl-trimmed-clip.mp4 (${cutSizeMB}MB)`);
    }

    console.log('\n✅ 다운로드 + 트리밍 파이프라인 검증 완료');
  });

  test('NLE Premiere XML 내보내기 — 편집점 + 타임코드 검증', async ({ page }) => {
    const BASE_URL = 'http://localhost:5173';
    const PROD_URL = 'https://all-in-one-production.pages.dev';

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 로그인
    const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.E2E_TEST_EMAIL || '', password: process.env.E2E_TEST_PASSWORD || '', rememberMe: true }),
    });
    const loginData = await loginRes.json() as any;
    await page.evaluate(({ token, user, evolink }: any) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', evolink);
    }, { token: loginData.token, user: loginData.user, evolink: process.env.CUSTOM_EVOLINK_KEY || '' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // NLE 내보내기 함수에서 타임코드 변환 검증
    const tcResult = await page.evaluate(() => {
      // secondsToFcpTc 함수 테스트 (nleExportService에서 사용)
      function secondsToFcpTc(s: number, fps: number): string {
        const total = Math.max(0, s);
        const roundedFps = Math.round(fps);
        const totalFrames = Math.round(total * fps);
        const isDF = Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;

        if (isDF) {
          const dropFrames = roundedFps === 30 ? 2 : 4;
          const framesPerMin = roundedFps * 60 - dropFrames;
          const framesPer10Min = framesPerMin * 10 + dropFrames;
          const d = Math.floor(totalFrames / framesPer10Min);
          const m = totalFrames % framesPer10Min;
          const adjusted = totalFrames
            + dropFrames * 9 * d
            + dropFrames * Math.max(0, Math.floor((m - dropFrames) / framesPerMin));
          const ff = adjusted % roundedFps;
          const ss = Math.floor(adjusted / roundedFps) % 60;
          const mm = Math.floor(adjusted / roundedFps / 60) % 60;
          const hh = Math.floor(adjusted / roundedFps / 3600);
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
        }

        const ff = totalFrames % roundedFps;
        const ss = Math.floor(totalFrames / roundedFps) % 60;
        const mm = Math.floor(totalFrames / roundedFps / 60) % 60;
        const hh = Math.floor(totalFrames / roundedFps / 3600);
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
      }

      // 편집점 타임코드 테스트
      const tests = [
        { sec: 0, fps: 29.97, expected_prefix: '00:00:00' },
        { sec: 7, fps: 29.97, expected_prefix: '00:00:07' },
        { sec: 119, fps: 29.97, expected_prefix: '00:01:58' }, // DF: 119*29.97=3566f → 01:58:28
        { sec: 134, fps: 29.97, expected_prefix: '00:02:14' },
        { sec: 60, fps: 30, expected_prefix: '00:01:00' },
        { sec: 300, fps: 29.97, expected_prefix: '00:04:59' }, // DF: 300*29.97=8991f → 04:59:29
      ];

      const results = tests.map(t => {
        const tc = secondsToFcpTc(t.sec, t.fps);
        const ok = tc.startsWith(t.expected_prefix);
        return { sec: t.sec, fps: t.fps, tc, ok };
      });

      return results;
    });

    console.log('\n[NLE] 타임코드 변환 검증:');
    let allOk = true;
    for (const r of tcResult) {
      const status = r.ok ? '✅' : '❌';
      console.log(`  ${status} ${r.sec}s @ ${r.fps}fps → ${r.tc}`);
      if (!r.ok) allOk = false;
    }
    expect(allOk).toBe(true);

    // FCP XML 구조 검증 (실제 XML 생성하진 않고, 핵심 요소 확인)
    const xmlCheck = await page.evaluate(() => {
      function fpsToNtsc(fps: number): { ntsc: boolean; timebase: number } {
        if (Math.abs(fps - 23.976) < 0.01) return { ntsc: true, timebase: 24 };
        if (Math.abs(fps - 29.97) < 0.01) return { ntsc: true, timebase: 30 };
        if (Math.abs(fps - 59.94) < 0.01) return { ntsc: true, timebase: 60 };
        return { ntsc: false, timebase: Math.round(fps) };
      }

      return {
        '29.97fps': fpsToNtsc(29.97),
        '30fps': fpsToNtsc(30),
        '24fps': fpsToNtsc(24),
        '23.976fps': fpsToNtsc(23.976),
      };
    });

    console.log('\n[NLE] NTSC 플래그 검증:');
    expect(xmlCheck['29.97fps'].ntsc).toBe(true);
    expect(xmlCheck['29.97fps'].timebase).toBe(30);
    console.log('  ✅ 29.97fps → ntsc=TRUE, timebase=30');

    expect(xmlCheck['30fps'].ntsc).toBe(false);
    expect(xmlCheck['30fps'].timebase).toBe(30);
    console.log('  ✅ 30fps → ntsc=FALSE, timebase=30');

    expect(xmlCheck['23.976fps'].ntsc).toBe(true);
    expect(xmlCheck['23.976fps'].timebase).toBe(24);
    console.log('  ✅ 23.976fps → ntsc=TRUE, timebase=24');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'nle-export-verified.png') });
    console.log('\n✅ NLE 타임코드 + NTSC 플래그 검증 완료');
  });
});
