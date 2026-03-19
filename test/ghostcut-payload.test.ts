import assert from 'node:assert/strict';
import { buildGhostCutSubmitPayload } from '../src/services/ghostcutPayload.ts';

const defaultPayload = buildGhostCutSubmitPayload(
  'https://example.com/source.mp4',
  'https://example.com/api/ghostcut/callback',
  'ko',
);

assert.equal(defaultPayload.needChineseOcclude, 1, '자동 OCR 텍스트 제거 플래그는 항상 1이어야 함');
assert.equal(defaultPayload.needMask, 0, '자동 텍스트 제거 모드는 수동 마스킹을 켜지 않아야 함');
assert.equal(defaultPayload.videoInpaintLang, 'ko', '선택한 언어 코드가 그대로 전달되어야 함');
assert.deepEqual(defaultPayload.urls, ['https://example.com/source.mp4'], '원본 URL이 그대로 전달되어야 함');
assert.equal(defaultPayload.callback, 'https://example.com/api/ghostcut/callback', '콜백 URL이 그대로 전달되어야 함');

const allPayload = buildGhostCutSubmitPayload(
  'https://example.com/source.mp4',
  'https://example.com/api/ghostcut/callback',
  'all',
);

assert.equal(allPayload.videoInpaintLang, 'all', '중국어+영어 동시 모드는 all로 전달되어야 함');
assert.equal(allPayload.music, 0, '음악 재가공은 비활성 상태를 유지해야 함');
assert.equal(allPayload.resolution, '1080p', '고정 해상도는 1080p를 유지해야 함');

console.log('ghostcut-payload.test.ts: ok');
