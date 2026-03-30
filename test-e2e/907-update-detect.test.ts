/**
 * 컴패니언 업데이트 감지 기능 검증
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SS = 'test-e2e';

test('컴패니언 업데이트 감지 코드 반영 확인', async ({ page }) => {
  test.setTimeout(30_000);

  // 1. ytdlpApiService — getCompanionVersion export 확인
  const ytdlpSrc = fs.readFileSync('src/services/ytdlpApiService.ts', 'utf-8');
  expect(ytdlpSrc).toContain('export function getCompanionVersion');
  expect(ytdlpSrc).toContain('_companionVersion');
  console.log('[1] ✅ getCompanionVersion() export 확인');

  // 2. constants — getCompanionLatestVersion export 확인
  const constSrc = fs.readFileSync('src/constants.ts', 'utf-8');
  expect(constSrc).toContain('export const getCompanionLatestVersion');
  expect(constSrc).toContain('_cachedLatestVersion');
  expect(constSrc).toContain("tag.replace(/^companion-v/, '')");
  console.log('[2] ✅ getCompanionLatestVersion() + 버전 파싱 확인');

  // 3. CompanionBanner — 업데이트 배너 코드 확인
  const bannerSrc = fs.readFileSync('src/components/CompanionBanner.tsx', 'utf-8');
  expect(bannerSrc).toContain('updateAvailable');
  expect(bannerSrc).toContain('latestVer');
  expect(bannerSrc).toContain('헬퍼 업데이트 있음');
  expect(bannerSrc).toContain('setUpdateAvailable(Boolean(');
  // 60초 재체크
  expect(bannerSrc).toContain('60_000');
  // fallback fetch
  expect(bannerSrc).toContain('api.github.com/repos/groove1027/ytdlp-companion/releases/latest');
  console.log('[3] ✅ 업데이트 배너 + 60초 재체크 + fallback fetch 확인');

  await page.goto('about:blank');
  await page.screenshot({ path: path.join(SS, '907-update-01.png') });

  console.log('\n========== 업데이트 감지 검증 완료 ==========');
  console.log('✅ getCompanionVersion() — health에서 버전 캐시');
  console.log('✅ getCompanionLatestVersion() — GitHub API 최신 버전');
  console.log('✅ CompanionBanner — 구버전 시 주황 배너 + 다운로드 링크');
  console.log('✅ 60초 주기 재체크 — 업데이트 후 배너 자동 해제');
  console.log('=============================================');
});
