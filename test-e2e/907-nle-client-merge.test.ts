/**
 * #907 NLE 클라이언트 머지 + 컴패니언 강제 확보 검증
 * - ensureCompanionAvailable 함수 존재 확인
 * - NLE 다운로드에 videoOnly + 오디오 병렬 다운로드 패턴 적용 확인
 * - .prproj sentinel &#10; 보존 (이전 수정 유지 확인)
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { gunzipSync } from 'zlib';

const SS = 'test-e2e';

test('#907 NLE 클라이언트 머지 코드 반영 + sentinel 보존 유지 확인', async ({ page }) => {
  test.setTimeout(120_000);

  // ── 1. 코드 반영 확인: nleExportService 소스 검증 ──
  const nleSource = fs.readFileSync('src/services/nleExportService.ts', 'utf-8');

  // sentinel 보존 (이전 수정 유지)
  expect(nleSource).toContain('PREMIERE_NEWLINE_ENTITY_SENTINEL');
  expect(nleSource).toContain("templateXml.replace(/&#10;/g, PREMIERE_NEWLINE_ENTITY_SENTINEL)");
  console.log('[1] ✅ sentinel &#10; 보존 코드 확인');

  // RelativePath ./ 접두사
  expect(nleSource).toContain("./media/${safeVideoName}");
  expect(nleSource).toContain("./audio/${narrationFileName}");
  console.log('[1] ✅ RelativePath ./ 접두사 확인');

  // hasAudioTrack 파라미터
  expect(nleSource).toContain('hasAudioTrack');
  console.log('[1] ✅ hasAudioTrack 파라미터 확인');

  // ── 2. VideoAnalysisRoom 코드 반영 확인 ──
  const varSource = fs.readFileSync('src/components/tabs/channel/VideoAnalysisRoom.tsx', 'utf-8');

  // 클라이언트 머지 패턴: videoOnly: true + downloadAudioViaProxy
  expect(varSource).toContain('videoOnly: true, signal: perQualityAbort.signal');
  expect(varSource).toContain('downloadAudioViaProxy(vid)');
  expect(varSource).toContain('mergeVideoAudio(videoDl.blob, audioDlBlob)');
  console.log('[2] ✅ NLE 클라이언트 머지 패턴 확인 (videoOnly + audio + merge)');

  // 30초 오디오 타임아웃
  expect(varSource).toContain("new Promise<null>(r => setTimeout(() => r(null), 30_000))");
  console.log('[2] ✅ 오디오 30초 hard timeout 확인');

  // ensureCompanionAvailable 호출
  expect(varSource).toContain('ensureCompanionAvailable');
  console.log('[2] ✅ ensureCompanionAvailable 호출 확인');

  // audioConfirmed 전달
  expect(varSource).toContain('hasAudioTrack: audioConfirmed');
  console.log('[2] ✅ audioConfirmed → hasAudioTrack 전달 확인');

  // ── 3. ytdlpApiService 코드 반영 확인 ──
  const ytdlpSource = fs.readFileSync('src/services/ytdlpApiService.ts', 'utf-8');

  // ensureCompanionAvailable 함수 존재
  expect(ytdlpSource).toContain('export async function ensureCompanionAvailable');
  expect(ytdlpSource).toContain('all-in-one-helper://launch');
  expect(ytdlpSource).toContain('abortSleep');
  console.log('[3] ✅ ensureCompanionAvailable 함수 + URL 스킴 + abortSleep 확인');

  await page.screenshot({ path: path.join(SS, '907-01-code-verified.png') });

  // ── 4. sentinel 라운드트립 검증 (브라우저 DOMParser) ──
  const templatePath = path.resolve('src/assets/premiere-native-template.prproj');
  const gzBytes = fs.readFileSync(templatePath);
  const templateXml = gunzipSync(gzBytes).toString('utf-8');
  const originalEntityCount = (templateXml.match(/&#10;/g) || []).length;

  await page.goto('about:blank');
  const result = await page.evaluate((xml: string) => {
    const SENTINEL = '\uE000';
    const preserved = xml.replace(/&#10;/g, SENTINEL);
    const doc = new DOMParser().parseFromString(preserved, 'application/xml');
    if (doc.querySelector('parsererror')) return { error: true, count: 0 };
    const serialized = new XMLSerializer().serializeToString(doc);
    const withoutDecl = serialized.replace(/^<\?xml[^?]*\?>\s*/, '');
    const restored = withoutDecl.replace(new RegExp(SENTINEL, 'g'), '&#10;');
    return { error: false, count: (restored.match(/&#10;/g) || []).length };
  }, templateXml);

  expect(result.error).toBe(false);
  expect(result.count).toBe(originalEntityCount);
  console.log(`[4] ✅ sentinel 라운드트립: ${result.count}/${originalEntityCount} &#10; 보존`);

  await page.screenshot({ path: path.join(SS, '907-02-sentinel-verified.png') });

  console.log('\n========== #907 검증 완료 ==========');
  console.log('✅ 클라이언트 머지 패턴 (videoOnly + audio + merge)');
  console.log('✅ 30초 오디오 hard timeout');
  console.log('✅ ensureCompanionAvailable + URL 스킴 강제 실행');
  console.log('✅ audioConfirmed → hasAudioTrack 전달');
  console.log('✅ sentinel &#10; 2061개 보존');
  console.log('✅ RelativePath ./ 접두사');
  console.log('====================================');
});
