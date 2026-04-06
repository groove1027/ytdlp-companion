#!/usr/bin/env node
/**
 * verify-companion-release-sync.mjs
 *
 * 목적:
 *   src/constants.ts의 MIN_REQUIRED_COMPANION_VERSION이 public companion 저장소
 *   (groove1027/ytdlp-companion)의 GitHub Releases에 실제로 존재하는지 검증.
 *
 *   웹앱이 v1.3.0을 요구하는데 public 저장소에는 v1.2.0만 있는 상황을 사전에 차단한다.
 *   (이런 상태가 prod에 배포되면 모든 사용자가 무한 다운로드 루프에 빠진다.)
 *
 * 사용법:
 *   node scripts/verify-companion-release-sync.mjs
 *   exit 0: OK
 *   exit 1: drift 감지 (CI/pre-commit이 차단)
 *
 * CI 통합:
 *   .github/workflows/test.yml의 "Run Vitest" step 다음에 추가
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'groove1027/ytdlp-companion';
const CONSTANTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'constants.ts',
);

// ─────────────────────────────────────────────
// 1) constants.ts에서 MIN_REQUIRED 추출
// ─────────────────────────────────────────────
function extractMinRequiredVersion(filePath) {
  const src = readFileSync(filePath, 'utf-8');
  const match = src.match(/MIN_REQUIRED_COMPANION_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`MIN_REQUIRED_COMPANION_VERSION을 ${filePath}에서 찾을 수 없습니다.`);
  }
  return match[1].trim();
}

// ─────────────────────────────────────────────
// 2) Semver 비교 (constants.ts와 같은 normalize 규칙)
// ─────────────────────────────────────────────
function compareVersions(a, b) {
  const normalize = (v) => v.replace(/^(companion-)?v/, '');
  const pa = normalize(a).split('.').map(Number);
  const pb = normalize(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// ─────────────────────────────────────────────
// 3) GitHub Releases 조회 (companion-v* 태그만, draft/prerelease 제외)
// ─────────────────────────────────────────────
async function fetchPublicCompanionReleases() {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'verify-companion-release-sync' };
  // CI에서 GITHUB_TOKEN이 있으면 rate limit 회피용으로 사용 (public read는 인증 불필요)
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // 네트워크 에러 (DNS 실패, 연결 불가, 타임아웃 등) — false alarm 방지를 위해 스킵
    console.warn(`⚠️  Network error (${err.message || 'unknown'}) — verification skipped`);
    return null;
  }
  if (res.status === 403 || res.status === 429) {
    // rate limit — 검증 스킵 (false negative보다 false alarm이 위험)
    console.warn(`⚠️  GitHub API rate limit (${res.status}) — verification skipped`);
    return null;
  }
  // [FIX] 5xx (GitHub 일시 장애) + 기타 transport-level 에러도 fail-safe 처리.
  // 진짜 release drift는 200 OK에서만 확실히 판정 가능하므로, 그 외는 모두 스킵.
  if (res.status >= 500 && res.status < 600) {
    console.warn(`⚠️  GitHub API server error (${res.status}) — verification skipped`);
    return null;
  }
  if (!res.ok) {
    // 4xx 클라이언트 에러 (404 repo missing, 401 auth 등)는 진짜 문제이므로 차단
    throw new Error(`GitHub API ${url} → HTTP ${res.status}`);
  }
  let list;
  try {
    list = await res.json();
  } catch (err) {
    console.warn(`⚠️  Invalid JSON response from GitHub API — verification skipped`);
    return null;
  }
  if (!Array.isArray(list)) {
    console.warn(`⚠️  GitHub API response is not an array — verification skipped`);
    return null;
  }
  return list
    .filter(r => typeof r.tag_name === 'string'
              && r.tag_name.startsWith('companion-v')
              && !r.draft
              && !r.prerelease);
}

// ─────────────────────────────────────────────
// 4) 자산 무결성 검사 (DMG + EXE/MSI 모두 있는지)
// ─────────────────────────────────────────────
function checkAssets(release) {
  const names = (release.assets || []).map(a => a.name.toLowerCase());
  const hasMacDmg = names.some(n => n.endsWith('.dmg'));
  const hasWinExe = names.some(n => n.endsWith('.exe'));
  return { hasMacDmg, hasWinExe, assetNames: names };
}

// ─────────────────────────────────────────────
// main
// ─────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Companion Release Sync Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const minRequired = extractMinRequiredVersion(CONSTANTS_PATH);
  console.log(`✅ MIN_REQUIRED_COMPANION_VERSION = v${minRequired}`);
  console.log(`🔍 Checking public mirror: https://github.com/${REPO}/releases`);

  const releases = await fetchPublicCompanionReleases();
  if (releases === null) {
    console.log('⚠️  Skipped due to rate limit.');
    process.exit(0);
  }

  if (releases.length === 0) {
    console.error('❌ No companion-v* releases found in public mirror!');
    process.exit(1);
  }

  // semver 최대값 선택
  releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  const latest = releases[0];
  const latestVersion = latest.tag_name.replace(/^companion-v/, '');
  console.log(`📦 Public latest: v${latestVersion} (${latest.tag_name})`);

  const cmp = compareVersions(latestVersion, minRequired);
  if (cmp < 0) {
    console.error('');
    console.error('🚨🚨🚨 RELEASE DRIFT DETECTED 🚨🚨🚨');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`  웹앱 MIN_REQUIRED:  v${minRequired}`);
    console.error(`  Public mirror latest: v${latestVersion}`);
    console.error('');
    console.error('  이 상태로 prod에 배포하면 모든 사용자가 무한 다운로드 루프에 빠집니다.');
    console.error('  사용자가 다운받은 v' + latestVersion + '도 MIN_REQUIRED 미만이라 outdated 처리됨.');
    console.error('');
    console.error('  해결 방법 (둘 중 하나):');
    console.error('    A) MIN_REQUIRED_COMPANION_VERSION을 v' + latestVersion + '로 낮추기');
    console.error('       → src/constants.ts:6 수정');
    console.error('');
    console.error('    B) v' + minRequired + ' 빌드를 public 미러에 배포하기');
    console.error('       → bash scripts/mirror-companion-release.sh companion-v' + minRequired);
    console.error('       → 이 스크립트가 private 저장소(all-in-one-production)에서');
    console.error('         자산을 다운로드해 ytdlp-companion에 미러 게시함');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }

  // 자산 무결성 검사
  const { hasMacDmg, hasWinExe, assetNames } = checkAssets(latest);
  if (!hasMacDmg || !hasWinExe) {
    console.error('');
    console.error('🚨 ASSET MISSING — public release v' + latestVersion + '에 OS별 자산이 누락');
    console.error(`   macOS DMG: ${hasMacDmg ? '✅' : '❌'}`);
    console.error(`   Windows EXE: ${hasWinExe ? '✅' : '❌'}`);
    console.error(`   현재 자산: ${assetNames.join(', ') || '(없음)'}`);
    process.exit(1);
  }

  console.log(`✅ Assets OK — DMG + EXE 모두 게시됨`);
  console.log(`✅ Sync OK — public mirror v${latestVersion} >= MIN_REQUIRED v${minRequired}`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ verification failed:', err.message);
  // 네트워크 에러는 검증 스킵 (CI는 통과시키되 경고만)
  if (err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
    console.warn('⚠️  Network error — verification skipped');
    process.exit(0);
  }
  process.exit(1);
});
