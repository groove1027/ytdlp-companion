/**
 * Premiere .prproj &#10; 엔티티 보존 검증
 * 템플릿 파일을 직접 로드 → sentinel 라운드트립 → &#10; 보존 확인
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { gunzipSync } from 'zlib';

const SS = 'test-e2e';

test('Premiere .prproj sentinel 라운드트립 — &#10; 보존 검증', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('about:blank');
  await page.screenshot({ path: path.join(SS, 'prproj-01-before.png') });

  // 템플릿 파일을 Node.js에서 읽어서 브라우저에 전달
  const templatePath = path.resolve('src/assets/premiere-native-template.prproj');
  const gzBytes = fs.readFileSync(templatePath);
  const xmlBuffer = gunzipSync(gzBytes);
  const templateXml = xmlBuffer.toString('utf-8');

  // Node.js에서 원본 &#10; 개수 확인
  const originalEntityCount = (templateXml.match(/&#10;/g) || []).length;
  console.log(`[1] 원본 &#10; 개수: ${originalEntityCount}`);
  expect(originalEntityCount).toBeGreaterThan(2000);

  // 브라우저에서 DOMParser + XMLSerializer 라운드트립 수행
  const result = await page.evaluate((xml: string) => {
    const SENTINEL = '\uE000';

    // 원본에 sentinel 없는지 확인
    if (xml.includes(SENTINEL)) {
      return { error: 'template already contains sentinel', entityCount: 0, hasSentinel: true, xmlLength: 0 };
    }

    // Step 1: &#10; → sentinel
    const preserved = xml.replace(/&#10;/g, SENTINEL);
    const sentinelCount = (preserved.match(new RegExp(SENTINEL, 'g')) || []).length;

    // Step 2: DOMParser 파싱
    const doc = new DOMParser().parseFromString(preserved, 'application/xml');
    const hasParseError = !!doc.querySelector('parsererror');
    if (hasParseError) {
      return { error: 'DOMParser parse error', entityCount: 0, hasSentinel: false, xmlLength: 0 };
    }

    // Step 3: XMLSerializer 직렬화
    const serialized = new XMLSerializer().serializeToString(doc);
    const withoutDecl = serialized.replace(/^<\?xml[^?]*\?>\s*/, '');

    // Step 4: sentinel → &#10; 복원
    const restored = withoutDecl.replace(new RegExp(SENTINEL, 'g'), '&#10;');
    const finalXml = `<?xml version="1.0" encoding="UTF-8" ?>\n${restored}`;

    // 검증
    const restoredEntityCount = (finalXml.match(/&#10;/g) || []).length;
    const hasSentinelRemaining = finalXml.includes(SENTINEL);
    const hasPremiereData = finalXml.includes('<PremiereData');
    const hasMetadataSchema = finalXml.includes('Project.Metadata.Schema');
    const hasExportSettings = finalXml.includes('ExportSettings.ExportedPreset.SaveAsFile');

    return {
      error: null,
      sentinelCount,
      entityCount: restoredEntityCount,
      hasSentinel: hasSentinelRemaining,
      xmlLength: finalXml.length,
      hasPremiereData,
      hasMetadataSchema,
      hasExportSettings,
    };
  }, templateXml);

  console.log(`[2] 브라우저 라운드트립 결과:`);
  console.log(`    - 에러: ${result.error || '없음'}`);
  console.log(`    - sentinel 치환 수: ${(result as any).sentinelCount || 'N/A'}`);
  console.log(`    - 복원된 &#10; 개수: ${result.entityCount}`);
  console.log(`    - sentinel 잔존: ${result.hasSentinel}`);
  console.log(`    - XML 길이: ${(result as any).xmlLength || 0}`);
  console.log(`    - PremiereData: ${(result as any).hasPremiereData}`);
  console.log(`    - Schema: ${(result as any).hasMetadataSchema}`);
  console.log(`    - ExportSettings: ${(result as any).hasExportSettings}`);

  expect(result.error).toBeNull();
  expect(result.entityCount).toBe(originalEntityCount);
  expect(result.hasSentinel).toBe(false);
  expect((result as any).hasPremiereData).toBe(true);
  expect((result as any).hasMetadataSchema).toBe(true);
  expect((result as any).hasExportSettings).toBe(true);

  await page.screenshot({ path: path.join(SS, 'prproj-02-verified.png') });

  // ── 비교 테스트: 기존 regex 방식의 실패 증명 ──
  const oldRegexResult = await page.evaluate((xml: string) => {
    // 기존 방식: DOMParser → XMLSerializer → regex 복원
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return { error: 'parse error', entityCount: 0 };

    const serialized = new XMLSerializer().serializeToString(doc);
    const withoutDecl = serialized.replace(/^<\?xml[^?]*\?>\s*/, '');

    // 기존 regex 방식
    const restored = withoutDecl.replace(/>([^<]+)</g, (_match: string, text: string) => {
      if (!text.includes('\n') || text.trim().length === 0) return _match;
      const leadWs = text.match(/^(\s*)/)?.[1] || '';
      const trailWs = text.match(/(\n[\t ]+)$/)?.[1] || '';
      const inner = text.slice(leadWs.length, text.length - trailWs.length);
      if (!inner.includes('\n')) return _match;
      return '>' + leadWs + inner.replace(/\n/g, '&#10;') + trailWs + '<';
    });

    const restoredCount = (restored.match(/&#10;/g) || []).length;
    return { error: null, entityCount: restoredCount };
  }, templateXml);

  console.log(`\n[3] 기존 regex 방식 결과:`);
  console.log(`    - &#10; 복원 수: ${oldRegexResult.entityCount} (원본: ${originalEntityCount})`);
  console.log(`    - 손실: ${originalEntityCount - oldRegexResult.entityCount}개`);

  // sentinel 방식이 기존 regex보다 정확함을 증명
  expect(result.entityCount).toBeGreaterThanOrEqual(oldRegexResult.entityCount);

  await page.screenshot({ path: path.join(SS, 'prproj-03-comparison.png') });

  console.log('\n========== 최종 결과 ==========');
  console.log(`✅ sentinel 방식: ${result.entityCount}/${originalEntityCount} &#10; 보존 (100%)`);
  console.log(`⚠️ 기존 regex 방식: ${oldRegexResult.entityCount}/${originalEntityCount} &#10; 보존 (${Math.round(oldRegexResult.entityCount / originalEntityCount * 100)}%)`);
  console.log('================================');
});
