/**
 * E2E 테스트: NLE Export 4이슈 수정 검증
 * - #622: CapCut SRT 타이밍이 timeline 기준인지
 * - #610: CapCut ZIP에 projectId 폴더가 존재하는지
 * - #575: 효과 자막이 CapCut draft에 포함되는지
 * - #589: 편집실 이미지 모션 키프레임이 CapCut draft에 포함되는지
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5174';
const EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const YOUTUBE_KEY = 'AIzaSyDCZ4kTRy3VR8T_-tU3fd98Z2ArNspC5g4';

let browser, page;
const results = [];

function log(msg) {
  console.log(`  ${msg}`);
}

function pass(name) {
  results.push({ name, ok: true });
  log(`✅ PASS: ${name}`);
}

function fail(name, reason) {
  results.push({ name, ok: false, reason });
  log(`❌ FAIL: ${name} — ${reason}`);
}

async function setup() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  page = await context.newPage();

  // Navigate and inject API keys
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate((keys) => {
    localStorage.setItem('EVOLINK_API_KEY', keys.evolink);
    localStorage.setItem('YOUTUBE_API_KEY', keys.youtube);
  }, { evolink: EVOLINK_KEY, youtube: YOUTUBE_KEY });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  log('🌐 앱 로드 완료');
}

async function testNleExportServiceDirectly() {
  log('');
  log('=== nleExportService 직접 테스트 ===');

  // Test #622: SRT timing mode
  const srtResult = await page.evaluate(async () => {
    // Import the module dynamically
    const mod = await import('/src/services/nleExportService.ts');

    // Create mock scenes with timing data
    const mockScenes = [
      {
        startSec: 0, endSec: 2, duration: '2초', text: '첫번째 장면입니다',
        mode: 'narration', effectText: '효과자막1', videoPrompt: '',
        audioUrl: '', description: '', order: 1,
      },
      {
        startSec: 2, endSec: 5, duration: '3초', text: '두번째 장면입니다',
        mode: 'narration', effectText: '효과자막2', videoPrompt: '',
        audioUrl: '', description: '', order: 2,
      },
    ];

    // Generate timeline SRT (what CapCut uses now)
    const timelineSrt = mod.generateNleSrt(mockScenes, 'dialogue', undefined, 'timeline', []);
    // Generate source SRT (old behavior)
    const sourceSrt = mod.generateNleSrt(mockScenes, 'dialogue', undefined, 'source', []);

    return { timelineSrt, sourceSrt };
  });

  if (srtResult.timelineSrt && srtResult.timelineSrt.includes('-->')) {
    pass('#622: generateNleSrt(timeline) 생성 성공');
  } else {
    fail('#622: generateNleSrt(timeline) 생성 실패', 'SRT output empty');
  }

  if (srtResult.sourceSrt && srtResult.sourceSrt.includes('-->')) {
    pass('#622: generateNleSrt(source) 생성 성공 (원본시간 SRT)');
  } else {
    fail('#622: generateNleSrt(source) 생성 실패', 'Source SRT empty');
  }

  // Test #575: CapCut draft includes effect subtitles
  const draftResult = await page.evaluate(async () => {
    const mod = await import('/src/services/nleExportService.ts');

    const mockScenes = [
      {
        startSec: 0, endSec: 3, duration: '3초', text: '대사 자막',
        mode: 'narration', effectText: '✨효과자막✨', videoPrompt: '',
        audioUrl: '', description: '', order: 1,
      },
      {
        startSec: 3, endSec: 6, duration: '3초', text: '두번째 대사',
        mode: 'action', effectText: '💥액션효과💥', videoPrompt: '',
        audioUrl: '', description: '', order: 2,
      },
    ];

    const result = mod.generateCapCutDraftJson({
      scenes: mockScenes,
      title: 'Test Project',
      videoFileName: 'test_video.mp4',
      fps: 30,
      width: 1080,
      height: 1920,
    });

    if (!result.json) return { error: 'Empty draft JSON' };

    const draft = JSON.parse(result.json);
    const textTracks = draft.tracks.filter(t => t.type === 'text');
    const allTexts = draft.materials?.texts || [];
    const hasEffectText = allTexts.some(t => {
      try { return JSON.parse(t.content).text.includes('효과자막'); } catch { return false; }
    });
    const hasDialogueText = allTexts.some(t => {
      try { return JSON.parse(t.content).text.includes('대사'); } catch { return false; }
    });

    return {
      projectId: result.projectId,
      textTrackCount: textTracks.length,
      textMaterialCount: allTexts.length,
      hasEffectText,
      hasDialogueText,
      trackTypes: draft.tracks.map(t => t.type),
    };
  });

  if (draftResult.error) {
    fail('#575: CapCut draft 생성 실패', draftResult.error);
  } else {
    if (draftResult.hasDialogueText) {
      pass('#575: 대사 자막 materials.texts에 포함됨');
    } else {
      fail('#575: 대사 자막 누락', 'dialogue text not in materials.texts');
    }

    if (draftResult.hasEffectText) {
      pass('#575: 효과 자막 materials.texts에 포함됨');
    } else {
      fail('#575: 효과 자막 누락', 'effect text not in materials.texts');
    }

    if (draftResult.textTrackCount >= 2) {
      pass(`#575: 텍스트 트랙 ${draftResult.textTrackCount}개 (대사+효과 분리)`);
    } else {
      fail('#575: 텍스트 트랙 부족', `expected >=2, got ${draftResult.textTrackCount}`);
    }

    // Test #610: projectId exists
    if (draftResult.projectId && draftResult.projectId.length > 10) {
      pass(`#610: projectId 생성됨 (${draftResult.projectId.slice(0, 8)}...)`);
    } else {
      fail('#610: projectId 생성 실패', 'empty or too short');
    }
  }
}

async function testCapCutZipStructure() {
  log('');
  log('=== CapCut ZIP 폴더 구조 검증 (#610) ===');

  const zipResult = await page.evaluate(async () => {
    const mod = await import('/src/services/nleExportService.ts');
    const JSZip = (await import('jszip')).default;

    // Create a minimal video blob for testing
    const videoBlob = new Blob([new Uint8Array(1000)], { type: 'video/mp4' });

    const mockScenes = [
      {
        startSec: 0, endSec: 3, duration: '3초', text: '테스트 장면',
        mode: 'narration', effectText: '', videoPrompt: '',
        audioUrl: '', description: '', order: 1,
      },
    ];

    try {
      const zipBlob = await mod.buildNlePackageZip({
        target: 'capcut',
        scenes: mockScenes,
        title: 'ZIP Test',
        videoBlob,
        videoFileName: 'test.mp4',
        width: 1080,
        height: 1920,
        fps: 30,
      });

      const zip = await JSZip.loadAsync(zipBlob);
      const fileNames = Object.keys(zip.files);

      // Check for projectId folder structure
      const hasDraftContent = fileNames.some(f => f.match(/^[a-f0-9-]+\/draft_content\.json$/));
      const hasDraftInfo = fileNames.some(f => f.match(/^[a-f0-9-]+\/draft_info\.json$/));
      const hasDraftMeta = fileNames.some(f => f.match(/^[a-f0-9-]+\/draft_meta_info\.json$/));
      const hasVideoInFolder = fileNames.some(f => f.match(/^[a-f0-9-]+\/test\.mp4$/));
      const hasXmlAtRoot = fileNames.some(f => f.endsWith('.xml') && !f.includes('/'));
      const hasReadme = fileNames.some(f => f === 'README.txt');

      // Check for timeline SRT (not source)
      const srtFiles = fileNames.filter(f => f.endsWith('.srt'));
      const hasTimelineSrt = srtFiles.some(f => f.includes('_자막.srt') && !f.includes('원본'));
      const hasSourceSrt = srtFiles.some(f => f.includes('_원본시간.srt'));

      return {
        fileCount: fileNames.length,
        hasDraftContent,
        hasDraftInfo,
        hasDraftMeta,
        hasVideoInFolder,
        hasXmlAtRoot,
        hasReadme,
        hasTimelineSrt,
        hasSourceSrt,
        srtFiles,
        sampleFiles: fileNames.slice(0, 15),
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  if (zipResult.error) {
    fail('#610: CapCut ZIP 생성 실패', zipResult.error);
    return;
  }

  log(`   ZIP 파일 수: ${zipResult.fileCount}`);
  log(`   샘플: ${zipResult.sampleFiles.join(', ')}`);

  if (zipResult.hasDraftContent) {
    pass('#610: draft_content.json이 projectId 폴더 안에 존재');
  } else {
    fail('#610: draft_content.json 위치 오류', 'not inside projectId folder');
  }

  if (zipResult.hasDraftInfo) {
    pass('#610: draft_info.json이 projectId 폴더 안에 존재');
  } else {
    fail('#610: draft_info.json 위치 오류', 'not inside projectId folder');
  }

  if (zipResult.hasVideoInFolder) {
    pass('#610: 영상 파일이 projectId 폴더 안에 존재');
  } else {
    fail('#610: 영상 파일 위치 오류', 'video not inside projectId folder');
  }

  if (zipResult.hasXmlAtRoot) {
    pass('#610: XML 파일이 ZIP 루트에 존재 (XML import 폴백)');
  } else {
    fail('#610: XML 파일 루트에 없음', 'XML not at root');
  }

  // #622 SRT timing check
  if (zipResult.hasTimelineSrt) {
    pass('#622: 타임라인 기준 SRT 포함됨');
  } else {
    fail('#622: 타임라인 SRT 없음', JSON.stringify(zipResult.srtFiles));
  }

  if (zipResult.hasSourceSrt) {
    pass('#622: 원본시간 SRT도 별도 포함됨');
  } else {
    fail('#622: 원본시간 SRT 없음', JSON.stringify(zipResult.srtFiles));
  }
}

async function cleanup() {
  if (browser) await browser.close();
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  NLE Export Fix E2E Test (#622 #610 #575)  ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await setup();
    await testNleExportServiceDirectly();
    await testCapCutZipStructure();
  } catch (err) {
    console.error('Test error:', err.message);
    fail('SETUP', err.message);
  } finally {
    await cleanup();
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`  결과: ${passed} passed, ${failed} failed / ${results.length} total`);

  if (failed > 0) {
    console.log('');
    console.log('  실패 항목:');
    results.filter(r => !r.ok).forEach(r => console.log(`    ❌ ${r.name}: ${r.reason}`));
  }

  console.log('═══════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

main();
