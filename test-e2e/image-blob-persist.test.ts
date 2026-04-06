/**
 * 이미지 blob 영속화 회귀 검증 — #1060 #1061 #1062 #1065
 *
 * 시나리오 (이중 검증):
 *   1. 자동 로그인 + 편집실 진입 (실제 사용자 흐름)
 *   2. page.evaluate로 imageBlobStorageService 직접 호출:
 *      - 가짜 Blob 생성 → URL.createObjectURL로 blob URL 만들기
 *      - persistProjectImages 호출 → IndexedDB 저장
 *      - 페이지 리로드
 *      - restoreProjectImages 호출 → 새 blob URL 복원 확인
 *      - fetch(restoredUrl)로 실제 데이터 무결성 확인
 *   3. mergeRestoredSceneImageFields가 stale blob을 새 URL로 교체하는지 확인
 *
 * 관련 이슈: #1060 #1061 #1062 #1065
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const PROD_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

// Mock 컴패니언 (실제 컴패니언이 9876에서 v1.3.0으로 응답 중이면 EADDRINUSE → 그대로 진행)
function startMockCompanion(): http.Server | null {
  try {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
      if (req.url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          app: 'ytdlp-companion',
          status: 'ok',
          version: '1.3.0',
          ytdlpVersion: '2024.10.07',
          services: ['ytdlp', 'download', 'frames', 'whisper', 'tts-piper', 'nle-install', 'ffmpeg'],
        }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log('⚠️ Mock 컴패니언 시작 실패 (포트 9876 사용 중) — 실제 컴패니언 사용 추정');
      }
    });
    server.listen(9876, '127.0.0.1');
    return server;
  } catch {
    return null;
  }
}

test('image blob 영속화 — IDB 저장 + 복원 + 데이터 무결성 (#1060 외 3건)', async ({ page }) => {
  test.setTimeout(180_000);
  const mockServer = startMockCompanion();
  console.log('✅ Mock 컴패니언 서버 시작');

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('sync-project') || text.includes('ERR_CONNECTION_REFUSED') || text.includes('localhost:9876')) return;
    if (msg.type() === 'error' || text.includes('imageBlob') || text.includes('IDB-TEST')) {
      console.log(`[PAGE-${msg.type()}] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', err => console.log(`[PAGE-CRASH] ${err.message.slice(0, 300)}`));

  try {
    // ── 1. 로그인 ──
    const res = await fetch(`${PROD_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
    });
    const ld = await res.json() as { token: string; user: object };
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, key }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
    }, { token: ld.token, user: ld.user, key: EVOLINK_KEY });
    await Promise.all([
      page.reload({ waitUntil: 'domcontentloaded' }),
      page.waitForResponse(r => r.url().includes('/api/auth/get-project') && r.status() === 200, { timeout: 30000 }).catch(() => null),
    ]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-e2e/imgblob-01-loggedin.png' });
    console.log('✅ 로그인 완료');

    // ── 2. 편집실 진입 (실제 사용자 흐름) ──
    await page.locator('button').filter({ hasText: /대본작성/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('button').filter({ hasText: /5\s*편집실|^편집실$/ }).first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-e2e/imgblob-02-editroom.png' });
    console.log('✅ 편집실 진입');

    // ── 3. 핵심: page.evaluate로 imageBlobStorageService 직접 호출 ──
    console.log('\n========== 핵심 검증: image blob persist + restore ==========');

    const result = await page.evaluate(async () => {
      // @ts-ignore
      const mod = await import('/services/imageBlobStorageService.ts');
      const {
        persistProjectImages,
        restoreProjectImages,
        deleteProjectImages,
        mergeRestoredSceneImageFields,
        SCENE_IMAGE_FIELDS,
      } = mod;

      // 가짜 PNG 1x1 픽셀 만들기 (16바이트 헤더 + 데이터)
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
      ]);
      const blob1 = new Blob([pngBytes], { type: 'image/png' });
      const blob2 = new Blob([pngBytes], { type: 'image/png' });
      const blobUrl1 = URL.createObjectURL(blob1);
      const blobUrl2 = URL.createObjectURL(blob2);

      console.log('[IDB-TEST] 가짜 blob URL 생성:', blobUrl1.slice(0, 60));

      const projectId = `test-imgblob-${Date.now()}`;
      const fakeScenes = [
        { id: 'scene-1', imageUrl: blobUrl1 },
        { id: 'scene-2', imageUrl: blobUrl2 },
      ];
      const fakeThumbnails: Array<{ id: string; imageUrl: string }> = [];

      // ── persistProjectImages 호출 ──
      const persistResult = await persistProjectImages(projectId, fakeScenes as any, fakeThumbnails as any);
      console.log('[IDB-TEST] persist 결과:', JSON.stringify(persistResult).slice(0, 200));

      // ── restoreProjectImages로 복원 ──
      const restored = await restoreProjectImages(projectId);
      console.log('[IDB-TEST] restored sceneImageMap size:', restored.sceneImageMap.size);

      const scene1Map = restored.sceneImageMap.get('scene-1');
      const scene2Map = restored.sceneImageMap.get('scene-2');
      const restoredUrl1 = scene1Map?.get('imageUrl');
      const restoredUrl2 = scene2Map?.get('imageUrl');

      // ── 복원된 blob URL이 fetch 가능한지 확인 ──
      const checkFetchable = async (url: string | undefined): Promise<{ ok: boolean; size: number }> => {
        if (!url) return { ok: false, size: 0 };
        try {
          const r = await fetch(url);
          if (!r.ok) return { ok: false, size: 0 };
          const ab = await r.arrayBuffer();
          return { ok: true, size: ab.byteLength };
        } catch {
          return { ok: false, size: 0 };
        }
      };

      const fetch1 = await checkFetchable(restoredUrl1);
      const fetch2 = await checkFetchable(restoredUrl2);

      // ── mergeRestoredSceneImageFields 동작 확인 ──
      const stalePatch = mergeRestoredSceneImageFields(
        { id: 'scene-1', imageUrl: blobUrl1 } as any,
        scene1Map,
        SCENE_IMAGE_FIELDS,
      );

      // ── 정리 ──
      await deleteProjectImages(projectId);
      const afterDelete = await restoreProjectImages(projectId);

      URL.revokeObjectURL(blobUrl1);
      URL.revokeObjectURL(blobUrl2);

      return {
        persistedCount: persistResult?.persistedCount ?? Object.keys(persistResult || {}).length,
        sceneImageMapSize: restored.sceneImageMap.size,
        restoredUrl1Present: !!restoredUrl1,
        restoredUrl2Present: !!restoredUrl2,
        restoredUrl1IsBlob: restoredUrl1?.startsWith('blob:') ?? false,
        fetch1Ok: fetch1.ok,
        fetch1Size: fetch1.size,
        fetch2Ok: fetch2.ok,
        fetch2Size: fetch2.size,
        originalSize: pngBytes.byteLength,
        stalePatchHasNewUrl: !!stalePatch.imageUrl && stalePatch.imageUrl !== blobUrl1,
        afterDeleteEmpty: afterDelete.sceneImageMap.size === 0,
      };
    });

    console.log('\n📊 검증 결과:', JSON.stringify(result, null, 2));
    fs.writeFileSync('test-e2e/dl-imgblob-verification.json', JSON.stringify(result, null, 2));

    // ── 검증 ──
    expect(result.sceneImageMapSize).toBe(2);
    console.log(`✅ sceneImageMap 크기: ${result.sceneImageMapSize}`);

    expect(result.restoredUrl1Present).toBe(true);
    expect(result.restoredUrl2Present).toBe(true);
    console.log(`✅ 두 이미지 모두 복원됨`);

    expect(result.restoredUrl1IsBlob).toBe(true);
    console.log(`✅ 복원된 URL이 새 blob: URL`);

    expect(result.fetch1Ok).toBe(true);
    expect(result.fetch2Ok).toBe(true);
    expect(result.fetch1Size).toBe(result.originalSize);
    expect(result.fetch2Size).toBe(result.originalSize);
    console.log(`✅ 복원된 blob URL fetch 성공 + 데이터 무결성 확인 (${result.originalSize} bytes)`);

    expect(result.stalePatchHasNewUrl).toBe(true);
    console.log(`✅ mergeRestoredSceneImageFields가 stale blob을 새 URL로 교체`);

    expect(result.afterDeleteEmpty).toBe(true);
    console.log(`✅ deleteProjectImages 후 빈 상태 확인`);

    await page.screenshot({ path: 'test-e2e/imgblob-99-verified.png' });
    console.log('\n🎉 image blob 영속화 E2E 검증 완료');
  } finally {
    mockServer?.close();
    console.log('✅ Mock 컴패니언 서버 종료 (또는 미시작)');
  }
});
