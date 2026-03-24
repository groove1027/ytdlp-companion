import assert from 'node:assert/strict';
import { buildGhostCutSubmitPayload } from '../src/services/ghostcutPayload.ts';

const defaultPayload = buildGhostCutSubmitPayload(
  'https://example.com/source.mp4',
  'https://example.com/api/ghostcut/callback',
);

assert.equal(defaultPayload.needChineseOcclude, 1, '자동 OCR 텍스트 제거 플래그는 항상 1이어야 함');
assert.equal(defaultPayload.needMask, 0, '자동 텍스트 제거 모드는 수동 마스킹을 켜지 않아야 함');
assert.equal('videoInpaintLang' in defaultPayload, false, 'Smart Text Removal은 언어 강제값 없이 자동 감지로 보내야 함');
assert.deepEqual(defaultPayload.urls, ['https://example.com/source.mp4'], '원본 URL이 그대로 전달되어야 함');
assert.equal(defaultPayload.callback, 'https://example.com/api/ghostcut/callback', '콜백 URL이 그대로 전달되어야 함');

const secondPayload = buildGhostCutSubmitPayload(
  'https://example.com/source.mp4',
  'https://example.com/api/ghostcut/callback',
);

assert.equal('videoInpaintLang' in secondPayload, false, '반복 생성 시에도 언어 강제값이 붙지 않아야 함');
assert.equal(secondPayload.music, 0, '음악 재가공은 비활성 상태를 유지해야 함');
assert.equal(secondPayload.resolution, '1080p', '고정 해상도는 1080p를 유지해야 함');

console.log('ghostcut-payload.test.ts: ok');
