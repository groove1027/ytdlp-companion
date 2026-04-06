/**
 * Premiere Pro 2024 호환성 E2E 회귀 테스트
 *
 * 시나리오 (브라우저 직접 호출 — 8분 분석 우회):
 *   1. 자동 로그인 (실제 API 응답 wait)
 *   2. 편집실 진입 → 실제 UI 클릭 흐름 검증
 *   3. 편집실에서 Premiere "프로젝트 파일" 클릭 → ZIP 다운로드 캡처 (FCP XML 경로)
 *   4. 추가로 page.evaluate로 buildPremiereNativeProjectXml 직접 호출 (우리 v43 fix 경로)
 *   5. 출력 XML을 디스크 저장 → Project Version="43" 등 검증
 *
 * 관련 이슈: #1056 #1054 #1048 #1047 #995 #969 #968
 *
 * 이중 검증:
 *   - 편집실 ZIP: 실제 사용자 흐름 (UI 클릭 → 다운로드) 보장
 *   - buildPremiereNativeProjectXml 직접 호출: 우리가 수정한 v43 코드 경로 검증
 *
 * (영상 분석실 → Premiere 흐름은 8분+ AI 분석이 필요해서 제외. 동일한 코드 경로를
 *  직접 호출로 검증하므로 결과는 동등하다.)
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as http from 'http';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE_URL = 'http://localhost:5173';
const PROD_URL = 'https://all-in-one-production.pages.dev';
const EMAIL = process.env.E2E_TEST_EMAIL!;
const PASSWORD = process.env.E2E_TEST_PASSWORD!;
const EVOLINK_KEY = process.env.CUSTOM_EVOLINK_KEY!;

// ── Mock 컴패니언 HTTP 서버 (CompanionGate 우회 + ZIP 다운로드 폴백 유도) ──
function startMockCompanion(): http.Server {
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
    if (req.url === '/api/nle/install') {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'mock-fallback-to-zip-download' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(9876, '127.0.0.1');
  return server;
}

test('Premiere 2024 호환 v43 export 회귀 검증 (#1056 외 6건)', async ({ page }) => {
  test.setTimeout(180_000); // 3분

  const mockServer = startMockCompanion();
  console.log('✅ Mock 컴패니언 서버 시작 (127.0.0.1:9876)');

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('sync-project') || text.includes('ERR_CONNECTION_REFUSED') || text.includes('localhost:9876')) return;
    if (msg.type() === 'error' || text.includes('DL-HOOK') || text.includes('Premiere')) {
      console.log(`[PAGE-${msg.type()}] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', err => console.log(`[PAGE-CRASH] ${err.message.slice(0, 300)}`));
  page.on('dialog', d => { console.log(`[DIALOG] ${d.message().slice(0, 150)}`); d.accept(); });

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

    // 로그인 후 첫 리로드 + 인증 응답 대기
    const reloadPromise = page.reload({ waitUntil: 'domcontentloaded' });
    await Promise.all([
      reloadPromise,
      page.waitForResponse(r => r.url().includes('/api/auth/get-project') && r.status() === 200, { timeout: 30000 }).catch(() => null),
    ]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-e2e/premiere2024-01-loggedin.png' });
    console.log('✅ 로그인 완료');

    // ── 2. blob 다운로드 후킹 ──
    await page.evaluate(() => {
      (window as Window & { __DL_RESULTS__?: Array<{ name: string; size: number; data: number[]; time: number }> }).__DL_RESULTS__ = [];
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        const a = this as HTMLAnchorElement;
        if (a.download && a.href && a.href.startsWith('blob:')) {
          fetch(a.href).then((r) => r.arrayBuffer()).then((ab) => {
            const win = window as Window & { __DL_RESULTS__?: Array<{ name: string; size: number; data: number[]; time: number }> };
            win.__DL_RESULTS__!.push({ name: a.download, size: ab.byteLength, data: Array.from(new Uint8Array(ab)), time: Date.now() });
            console.log(`[DL-HOOK] ✅ ${a.download} (${ab.byteLength}B)`);
          }).catch(() => {});
        }
        return origClick.call(this);
      };
    });

    // ── 3. 장면 fixture 주입 + 편집실 진입 (실제 UI 클릭 흐름 검증) ──
    await page.evaluate(() => {
      const ps = (window as unknown as { __PROJECT_STORE__: { getState: () => { setScenes: (s: unknown) => void; setProjectTitle?: (t: string) => void } } }).__PROJECT_STORE__;
      if (!ps) throw new Error('window.__PROJECT_STORE__가 없습니다');
      const placeholderImg = 'https://placehold.co/1080x1920/222/fff.png?text=Test';
      ps.getState().setScenes([
        { id: 's1', cutNum: 1, timeline: '1', sourceTimeline: '00:00~00:03', dialogue: '첫 장면 자막', effectSub: '팡', sceneDesc: '도시 일출', mode: 'storyboard', audioContent: '첫 장면 자막', duration: '3초', videoDirection: '고정 샷', timecodeSource: '00:00~00:03', imageUrl: placeholderImg, narration: '도시의 일출을 바라보는 주인공', visualPrompt: 'sunrise city skyline', subtitle: '첫 장면 자막', scriptText: '도시의 일출을 바라보는 주인공.' },
        { id: 's2', cutNum: 2, timeline: '2', sourceTimeline: '00:03~00:06', dialogue: '두번째 장면 자막', effectSub: '쾅', sceneDesc: '카페 작업', mode: 'storyboard', audioContent: '두번째 장면 자막', duration: '3초', videoDirection: '클로즈업', timecodeSource: '00:03~00:06', imageUrl: placeholderImg, narration: '카페에서 노트북 작업', visualPrompt: 'cozy cafe laptop warm', subtitle: '두번째 장면 자막', scriptText: '카페에서 노트북 작업.' },
        { id: 's3', cutNum: 3, timeline: '3', sourceTimeline: '00:06~00:09', dialogue: '세번째 장면 자막', effectSub: '쨘', sceneDesc: '산 정상', mode: 'storyboard', audioContent: '세번째 장면 자막', duration: '3초', videoDirection: '와이드 샷', timecodeSource: '00:06~00:09', imageUrl: placeholderImg, narration: '산 정상에서 풍경 감상', visualPrompt: 'mountain summit panoramic', subtitle: '세번째 장면 자막', scriptText: '산 정상에서 풍경을 감상.' },
      ]);
      ps.getState().setProjectTitle?.('Premiere2024Test');
      const es = (window as unknown as { __EDIT_ROOM_STORE__?: { setState: (s: unknown) => void } }).__EDIT_ROOM_STORE__;
      if (es) es.setState({ initialized: false, sceneOrder: [] });
    });
    console.log('✅ 장면 3개 주입');

    // 편집실 진입 (실제 사용자 클릭)
    await page.locator('button').filter({ hasText: /대본작성/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('button').filter({ hasText: /5\s*편집실|^편집실$/ }).first().click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-e2e/premiere2024-02-editroom.png' });
    console.log('✅ 편집실 진입');

    // ── 4. "프로젝트 파일" → Premiere 클릭 (편집실 FCP XML 경로 — 회귀 검증) ──
    const nleBtn = page.locator('button').filter({ hasText: /프로젝트.*파일/ }).first();
    await expect(nleBtn).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await nleBtn.click({ force: true });
    await page.waitForTimeout(800);
    const premiereBtn = page.locator('button').filter({ hasText: /Premiere/ }).first();
    await expect(premiereBtn).toBeVisible({ timeout: 5000 });
    await premiereBtn.click({ force: true });
    console.log('✅ 편집실 Premiere 클릭');
    await page.screenshot({ path: 'test-e2e/premiere2024-03-after-click.png' });

    // 다운로드 캡처 대기 (waitForFunction — waitForTimeout 대체)
    await page.waitForFunction(
      () => ((window as Window & { __DL_RESULTS__?: unknown[] }).__DL_RESULTS__ || []).length > 0,
      { timeout: 60000 },
    );
    const editRoomCaptured = await page.evaluate(() =>
      ((window as Window & { __DL_RESULTS__?: Array<{ name: string; size: number; data: number[] }> }).__DL_RESULTS__ || [])[0],
    );
    expect(editRoomCaptured).toBeDefined();
    console.log(`✅ 편집실 ZIP 캡처: ${editRoomCaptured.name} (${editRoomCaptured.size}B)`);

    // 디스크 저장 + 내용물 확인
    const editRoomZipPath = path.join('test-e2e', 'dl-premiere-2024-editroom.zip');
    fs.writeFileSync(editRoomZipPath, Buffer.from(editRoomCaptured.data));
    expect(fs.statSync(editRoomZipPath).size).toBeGreaterThan(100);
    const editRoomZipList = execSync(`unzip -l "${editRoomZipPath}"`).toString();
    console.log(`📦 편집실 ZIP 내용물:\n${editRoomZipList.slice(0, 800)}`);
    expect(editRoomZipList).toMatch(/\.xml/i); // 편집실은 FCP XML 출력
    expect(editRoomZipList).toMatch(/\.srt/i);
    await page.screenshot({ path: 'test-e2e/premiere2024-04-zip-saved.png' });

    // ── 5. ★핵심: page.evaluate로 buildPremiereNativeProjectXml 직접 호출 ──
    // (영상 분석실 → Premiere ZIP 경로의 핵심 함수 — 우리 v43 fix 코드)
    console.log('\n========== 핵심 검증: v43 .prproj 직접 호출 ==========');

    // legacy 템플릿을 base64로 페이지에 전달
    const legacyTemplateGzPath = path.resolve(__dirname, '../src/assets/premiere-native-template.prproj');
    const legacyTemplateGz = fs.readFileSync(legacyTemplateGzPath);
    const legacyTemplateXml = zlib.gunzipSync(legacyTemplateGz).toString('utf8');

    const v43Xml = await page.evaluate(async (templateXml) => {
      // Vite dev server가 모듈 그래프를 캐시하므로 동적 import 가능
      // @ts-ignore
      const mod = await import('/services/nleExportService.ts');
      const fn = mod.buildPremiereNativeProjectXml;
      if (typeof fn !== 'function') {
        throw new Error('buildPremiereNativeProjectXml가 export되지 않음');
      }
      const xml = await fn({
        scenes: [
          {
            id: 'scene-1',
            cutNum: 1,
            timeline: '1',
            sourceTimeline: '00:00~00:03',
            dialogue: '프리미어 v43 호환성 검증 자막',
            effectSub: '팡',
            sceneDesc: '테스트 장면',
            mode: 'storyboard',
            audioContent: '프리미어 v43 호환성 검증 자막',
            duration: '3초',
            videoDirection: '고정 샷',
            timecodeSource: '00:00~00:03',
          },
        ],
        title: 'Premiere2024Test',
        videoFileName: 'sample-video.mp4',
        width: 1080,
        height: 1920,
        fps: 30,
        videoDurationSec: 3,
        hasAudioTrack: true,
        templateXmlOverride: templateXml,
        prototypeTemplateXmlOverride: templateXml,
      });
      return xml;
    }, legacyTemplateXml);

    // 디스크 저장
    const v43XmlPath = path.join('test-e2e', 'dl-premiere-2024-v43.prproj.xml');
    fs.writeFileSync(v43XmlPath, v43Xml);
    expect(fs.statSync(v43XmlPath).size).toBeGreaterThan(1000);
    console.log(`📄 v43 XML 저장: ${v43XmlPath} (${v43Xml.length} bytes)`);

    // ── 6. 검증 1: Project Version="43" ──
    const versionMatch = v43Xml.match(/<Project ObjectID="1"[^>]*Version="(\d+)"/);
    expect(versionMatch).not.toBeNull();
    expect(versionMatch![1]).toBe('43');
    console.log(`✅ Project Version="43" 확인`);

    // ── 7. 검증 2: BuildVersion 24.x ──
    const buildVersionMatches = v43Xml.match(/<MZ\.BuildVersion\.(?:Created|Modified)>([^<]+)</g) || [];
    expect(buildVersionMatches.length).toBeGreaterThan(0);
    buildVersionMatches.forEach((m) => {
      const inner = m.replace(/<MZ\.BuildVersion\.(?:Created|Modified)>/, '');
      expect(inner).toMatch(/^24\./);
    });
    console.log(`✅ BuildVersion 24.x 확인 (${buildVersionMatches.length}건)`);

    // ── 8. 검증 3: FilePath 상대경로 ──
    expect(v43Xml).toContain('<FilePath>./sample-video.mp4</FilePath>');
    console.log(`✅ FilePath ./sample-video.mp4 상대경로 확인`);

    // ── 9. 검증 4: 절대경로 0건 ──
    const hasUserPath = /\/Users\/[a-zA-Z]|[A-Z]:\\Users\\/.test(v43Xml);
    expect(hasUserPath).toBe(false);
    console.log(`✅ 절대경로 0건 확인`);

    // ── 10. 검증 5: ImporterPrefs + AudioStream 존재 ──
    expect(v43Xml).toContain('<ImporterPrefs');
    expect(v43Xml).toContain('<AudioStream');
    console.log(`✅ ImporterPrefs + AudioStream 노드 존재 확인`);

    await page.screenshot({ path: 'test-e2e/premiere2024-99-verified.png' });
    console.log('\n🎉 Premiere 2024 호환성 E2E 검증 완료 — 모든 단계 통과');
  } finally {
    mockServer.close();
    console.log('✅ Mock 컴패니언 서버 종료');
  }
});
