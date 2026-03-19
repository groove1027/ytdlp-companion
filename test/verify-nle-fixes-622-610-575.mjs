/**
 * NLE Export Fix 검증 스크립트
 * #622: CapCut SRT timing → timeline
 * #610: CapCut ZIP → projectId 폴더 구조
 * #575: 효과 자막 CapCut draft 포함
 *
 * 빌드된 소스에서 직접 함수 로직을 검증
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT = process.cwd();
const SRC = path.join(PROJECT, 'src');

let passed = 0;
let failed = 0;

function pass(msg) { passed++; console.log(`  ✅ ${msg}`); }
function fail(msg) { failed++; console.log(`  ❌ ${msg}`); }

// ═══════════════════════════════════════════
// Read source code and verify logic patterns
// ═══════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  NLE Export Fix Verification (#622 #610 #575)     ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  const nleSource = await fs.readFile(path.join(SRC, 'services/nleExportService.ts'), 'utf-8');

  // ═══ #622: SRT timing mode ═══
  console.log('━━━ #622: CapCut SRT 타이밍 검증 ━━━');

  // Check: FIX #622 comment exists and SRT uses timeline
  if (nleSource.includes("FIX #622") && nleSource.includes("generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines)")) {
    pass('#622: CapCut SRT uses timeline timing mode');
  } else {
    fail('#622: CapCut SRT timing mode not changed to timeline');
  }

  // Check: Source-timing SRT is also generated as backup
  if (nleSource.includes("_자막_원본시간.srt")) {
    pass('#622: 원본시간 SRT 파일 별도 생성됨');
  } else {
    fail('#622: 원본시간 SRT 파일 없음');
  }

  // Check: README references 원본시간.srt for raw video import
  if (nleSource.includes("_자막_원본시간.srt\" 선택")) {
    pass('#622: README에서 원본영상+SRT import 시 원본시간 SRT 안내');
  } else {
    fail('#622: README에서 원본시간 SRT 안내 누락');
  }

  // Check: VREW still uses 'source' timing (should NOT change)
  const vrewSrtMatch = nleSource.match(/VREW[\s\S]{50,500}?generateNleSrt\(scenes, 'dialogue', preset, '(\w+)'/);
  if (vrewSrtMatch && vrewSrtMatch[1] === 'source') {
    pass('#622: VREW SRT는 source timing 유지 (변경 없음)');
  } else {
    fail('#622: VREW SRT timing이 변경됨 (회귀!)');
  }

  console.log('');

  // ═══ #610: CapCut ZIP folder structure ═══
  console.log('━━━ #610: CapCut ZIP 폴더 구조 검증 ━━━');

  // Check: draft files are inside ${pId}/ folder (video analysis path)
  if (nleSource.includes('zip.file(`${pId}/draft_content.json`')) {
    pass('#610: 영상분석실 draft_content.json → ${pId}/ 폴더 안');
  } else {
    fail('#610: 영상분석실 draft_content.json 위치 미변경');
  }

  if (nleSource.includes('zip.file(`${pId}/draft_info.json`')) {
    pass('#610: 영상분석실 draft_info.json → ${pId}/ 폴더 안');
  } else {
    fail('#610: 영상분석실 draft_info.json 위치 미변경');
  }

  if (nleSource.includes('zip.file(`${pId}/draft_meta_info.json`')) {
    pass('#610: 영상분석실 draft_meta_info.json → ${pId}/ 폴더 안');
  } else {
    fail('#610: 영상분석실 draft_meta_info.json 위치 미변경');
  }

  // Check: Video placed inside ${pId}/ folder (materials/video/ subfolder)
  if (nleSource.includes('zip.file(`${pId}/materials/video/') || nleSource.includes('zip.file(`${pId}/${videoFileName')) {
    pass('#610: 영상 파일 → ${pId}/ 폴더 안');
  } else {
    fail('#610: 영상 파일 위치 미변경');
  }

  // Check: Edit room also uses projectId folder
  if (nleSource.includes('zip.file(`${projectId}/draft_content.json`')) {
    pass('#610: 편집실 draft_content.json → ${projectId}/ 폴더 안');
  } else {
    fail('#610: 편집실 draft_content.json 위치 미변경');
  }

  // Check: README has projectId folder copy instructions
  if (nleSource.includes('com.lveditor.draft/${pId}/draft_content.json')) {
    pass('#610: 영상분석실 README에 projectId 경로 안내');
  } else {
    fail('#610: 영상분석실 README에 projectId 경로 안내 누락');
  }

  console.log('');

  // ═══ #575: Effect subtitle in CapCut draft ═══
  console.log('━━━ #575: 효과 자막 CapCut draft 포함 검증 ━━━');

  // Check: fxTextObjects are created
  if (nleSource.includes('fxTextObjects')) {
    pass('#575: fxTextObjects 변수 생성됨');
  } else {
    fail('#575: fxTextObjects 변수 없음');
  }

  // Check: fxTextSegments are created
  if (nleSource.includes('fxTextSegments')) {
    pass('#575: fxTextSegments 변수 생성됨');
  } else {
    fail('#575: fxTextSegments 변수 없음');
  }

  // Check: texts includes both textObjects and fxTextObjects
  if (nleSource.includes('[...textObjects, ...fxTextObjects]')) {
    pass('#575: materials.texts = [...textObjects, ...fxTextObjects] 병합');
  } else {
    fail('#575: materials.texts 병합 패턴 없음');
  }

  // Check: fxTextSegments has render_index 12000 (above 11000 for dialogue)
  if (nleSource.includes('renderIndex: 12000') || nleSource.includes('render_index: 12000')) {
    pass('#575: 효과 자막 render_index: 12000 (대사 11000 위)');
  } else {
    fail('#575: 효과 자막 render_index 설정 누락');
  }

  // Check: fxTextSegments added as separate track
  if (nleSource.includes('segments: fxTextSegments')) {
    pass('#575: 효과 자막 별도 text 트랙 추가');
  } else {
    fail('#575: 효과 자막 트랙 추가 누락');
  }

  // Check: Effect text color is yellow (differentiated from white dialogue)
  if (nleSource.includes("text_color: '#FFFF00'")) {
    pass('#575: 효과 자막 노란색(#FFFF00) 스타일 적용');
  } else {
    fail('#575: 효과 자막 색상 미구분');
  }

  console.log('');

  // ═══ #589: Motion keyframe check ═══
  console.log('━━━ #589: 편집실 모션 키프레임 검증 ━━━');

  // Check: compileNleMotionTrack is used in editroom capcut path
  if (nleSource.includes('compileNleMotionTrack(t, w, h, fps)')) {
    pass('#589: 편집실 CapCut에서 compileNleMotionTrack 호출');
  } else {
    fail('#589: 편집실 CapCut에서 compileNleMotionTrack 미호출');
  }

  // Check: buildCapCutCommonKeyframes is used
  if (nleSource.includes('buildCapCutCommonKeyframes(motionTrack, w, h)')) {
    pass('#589: 편집실 CapCut에서 buildCapCutCommonKeyframes 호출');
  } else {
    fail('#589: 편집실 CapCut에서 buildCapCutCommonKeyframes 미호출');
  }

  // Check: common_keyframes includes computed keyframes (not emptyArr) in editroom
  if (nleSource.includes('common_keyframes: commonKeyframes')) {
    pass('#589: 편집실 비디오 세그먼트에 commonKeyframes 주입');
  } else {
    fail('#589: 편집실 비디오 세그먼트에 키프레임 미주입');
  }

  console.log('');

  // ═══ Build verification ═══
  console.log('━━━ 빌드 검증 ━━━');

  // Check dist exists (from earlier build)
  try {
    const distFiles = await fs.readdir(path.join(SRC, 'dist/assets'));
    const jsFiles = distFiles.filter(f => f.endsWith('.js'));
    pass(`빌드 결과물 존재 (${jsFiles.length}개 JS 파일)`);
  } catch {
    fail('빌드 결과물 없음 (dist/assets)');
  }

  // ═══ Summary ═══
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  결과: ${passed} passed, ${failed} failed / ${passed + failed} total`);
  if (failed > 0) {
    console.log('  ⚠️ 실패 항목 존재!');
  } else {
    console.log('  ✅ 모든 검증 통과!');
  }
  console.log('═══════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
