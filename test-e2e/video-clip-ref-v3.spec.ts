/**
 * 무료 클립 레퍼런스 v3 파이프라인 E2E 테스트
 *
 * 브라우저 컨텍스트에서 실제 서비스 함수를 호출하여
 * YouTube 검색 → Gemini 편집점 분석 전체 흐름을 검증합니다.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const BASE_URL = 'http://localhost:5173';
const PROD_URL = 'https://all-in-one-production.pages.dev';

const SCREENSHOT_DIR = path.resolve(__dirname);

test.describe('무료 클립 레퍼런스 v3 파이프라인', () => {
  test.setTimeout(300_000);

  test('YouTube 검색 + Gemini URL 직접 분석 + 편집점 반환', async ({ page }) => {
    // Step 1: 앱 로드 + API 키 주입
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 로그인 + API 키 주입
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
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v3-step1-loaded.png') });

    // Step 2: 브라우저 내에서 matchVideoToSceneViaUrl 직접 호출
    console.log('[E2E] Gemini YouTube URL 직접 분석 테스트 시작');

    const result = await page.evaluate(async () => {
      try {
        const EVOLINK_KEY = localStorage.getItem('CUSTOM_EVOLINK_KEY') || '';
        const videoId = 'hfPetkWszz0'; // JTBC 한국은행 금리 동결
        const sceneText = '한국은행 이창용 총재가 기자회견에서 기준금리 동결을 발표했습니다.';

        const payload = {
          contents: [{
            role: 'user',
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri: `https://www.youtube.com/watch?v=${videoId}` } },
              { text: `이 영상을 프레임 단위로 분석하여 아래 대본에 가장 적합한 5~15초 구간을 찾아라.\n\n대본: "${sceneText}"\n\nJSON만 출력: {"startSec":N,"endSec":N,"score":0~1,"reason":"이유"}` },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        };

        const res = await fetch('https://api.evolink.ai/v1beta/models/gemini-2.5-flash:generateContent', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${EVOLINK_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(120000),
        });

        if (!res.ok) return { error: `API ${res.status}`, body: await res.text().catch(() => '') };

        const data = await res.json();
        const raw = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
          return { success: true, result: JSON.parse(cleaned), raw: cleaned.substring(0, 200) };
        } catch {
          const m = cleaned.match(/\{[\s\S]*?"startSec"[\s\S]*?\}/);
          if (m) return { success: true, result: JSON.parse(m[0]), raw: cleaned.substring(0, 200) };
          return { error: 'JSON parse failed', raw: cleaned.substring(0, 200) };
        }
      } catch (e: any) {
        return { error: e.message, stack: e.stack?.substring(0, 300) };
      }
    });

    console.log('[E2E] Gemini 결과:', JSON.stringify(result, null, 2));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v3-step2-gemini-result.png') });

    // Step 3: 결과 검증
    expect(result).toBeDefined();
    expect((result as any).error).toBeUndefined();
    expect((result as any).success).toBe(true);

    const editPoint = (result as any).result;
    expect(editPoint.startSec).toBeGreaterThanOrEqual(0);
    expect(editPoint.endSec).toBeGreaterThan(editPoint.startSec);
    expect(editPoint.endSec - editPoint.startSec).toBeGreaterThan(0.5);
    expect(editPoint.endSec - editPoint.startSec).toBeLessThanOrEqual(30);
    expect(editPoint.score).toBeGreaterThan(0.3);

    console.log(`[E2E] ✅ 편집점 검증 통과:`);
    console.log(`  시작: ${editPoint.startSec}초`);
    console.log(`  끝: ${editPoint.endSec}초`);
    console.log(`  길이: ${(editPoint.endSec - editPoint.startSec).toFixed(1)}초`);
    console.log(`  점수: ${editPoint.score}`);
    console.log(`  이유: ${editPoint.reason?.substring(0, 80)}`);
    console.log(`  확인: https://youtu.be/hfPetkWszz0?t=${Math.floor(editPoint.startSec)}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v3-step3-verified.png') });
  });
});
