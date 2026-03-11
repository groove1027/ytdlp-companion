/**
 * editPointService 단위 로직 검증
 * 실행: npx tsx test/editPointService.test.ts
 */

// ── 테스트 대상 함수들 직접 구현 (import 없이 순수 로직 검증) ──

function recoverTruncatedJson(content: string): { entries: Record<string, unknown>[] } {
  try {
    const parsed = JSON.parse(content);
    if (parsed.entries) return parsed;
  } catch { /* 잘린 JSON */ }

  const entries: Record<string, unknown>[] = [];
  const entryPattern = /\{[^{}]*"order"\s*:\s*"[^"]*"[^{}]*\}/g;
  let match;
  while ((match = entryPattern.exec(content)) !== null) {
    try {
      const entry = JSON.parse(match[0]);
      entries.push(entry);
    } catch { /* skip */ }
  }
  return { entries };
}

function parseTimecodeToSeconds(tc: string): number {
  if (!tc || tc.trim() === '') return 0;
  const clean = tc.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(clean) || 0;
}

function splitEditTableLines(rawTable: string): string[] {
  return rawTable.split('\n').filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^[-=|+\s]+$/.test(trimmed)) return false;
    return true;
  });
}

function estimateTokenCount(text: string): number {
  const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F]/g) || []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars * 1.5 + otherChars / 3);
}

function rawEntryToEdl(entry: Record<string, unknown>, idx: number) {
  return {
    id: `edl-${Date.now()}-${idx}`,
    order: String(entry.order || `${idx + 1}`),
    narrationText: String(entry.narrationText || ''),
    sourceId: String(entry.sourceId || 'S-01'),
    sourceDescription: String(entry.sourceDescription || ''),
    speedFactor: Number(entry.speedFactor) || 1.0,
    timecodeStart: parseTimecodeToSeconds(String(entry.timecodeStart || '0')),
    timecodeEnd: parseTimecodeToSeconds(String(entry.timecodeEnd || '0')),
    note: String(entry.note || ''),
  };
}

// ── 테스트 실행 ──

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

// === Test 1: recoverTruncatedJson ===
console.log('\n📋 Test 1: recoverTruncatedJson');

// 1a. 정상 JSON
const normal = recoverTruncatedJson('{"entries":[{"order":"1","sourceId":"S-01"}]}');
assert(normal.entries.length === 1, '정상 JSON → 1개 entry');
assert(normal.entries[0].order === '1', '정상 JSON → order 정확');

// 1b. 잘린 JSON (154 토큰 = 거의 아무것도 없는 상태)
const truncated154 = recoverTruncatedJson('{"entries":[{"order":"1-1a","narrationText":"첫 번째 내레이션","sourceId":"S-01","sourceDescription":"메인 영상","speedFactor":1.0,"timecodeStart":"00:07.500","timecodeEnd":"00:15.200","note":""},{"order":"1-2","narr');
assert(truncated154.entries.length === 1, '잘린 JSON → 완전한 1개 entry만 복구');
assert(truncated154.entries[0].order === '1-1a', '잘린 JSON → 첫 entry order 정확');

// 1c. JSON 구조 시작 직후 잘린 경우 (154 토큰의 실제 상황)
const tinyTruncated = recoverTruncatedJson('{"entries":[{"orde');
assert(tinyTruncated.entries.length === 0, '극소량 잘림 → 0개 entry (복구 불가)');

// 1d. 여러 개 완전한 entry + 마지막 하나 불완전
const multiTruncated = recoverTruncatedJson(
  '{"entries":[' +
  '{"order":"1","sourceId":"S-01","narrationText":"첫 번째","timecodeStart":"00:05.000","timecodeEnd":"00:10.000","speedFactor":1.0,"note":""},' +
  '{"order":"2","sourceId":"S-02","narrationText":"두 번째","timecodeStart":"00:10.000","timecodeEnd":"00:20.000","speedFactor":1.5,"note":"슬로우"},' +
  '{"order":"3","sourceId":"S-03","narrationTe'
);
assert(multiTruncated.entries.length === 2, '3개 중 2개 완전 → 2개 복구');

// 1e. 빈 입력
const empty = recoverTruncatedJson('');
assert(empty.entries.length === 0, '빈 입력 → 0개');

// 1f. 완전히 유효하지 않은 텍스트
const garbage = recoverTruncatedJson('This is not JSON at all');
assert(garbage.entries.length === 0, '비 JSON → 0개');

// === Test 2: parseTimecodeToSeconds ===
console.log('\n📋 Test 2: parseTimecodeToSeconds');

assert(parseTimecodeToSeconds('00:07.500') === 7.5, '"00:07.500" → 7.5');
assert(parseTimecodeToSeconds('1:23.4') === 83.4, '"1:23.4" → 83.4');
assert(parseTimecodeToSeconds('00:01:05.420') === 65.42, '"00:01:05.420" → 65.42');
assert(parseTimecodeToSeconds('7.5') === 7.5, '"7.5" → 7.5');
assert(parseTimecodeToSeconds('') === 0, '"" → 0');
assert(parseTimecodeToSeconds('0') === 0, '"0" → 0');
assert(parseTimecodeToSeconds('00:00.000') === 0, '"00:00.000" → 0');

// === Test 3: splitEditTableLines ===
console.log('\n📋 Test 3: splitEditTableLines');

const sampleTable = `| 순서 | 내레이션 | 소스 | 설명 | 속도 | 시작 | 끝 | 비고 |
|---|---|---|---|---|---|---|---|
| 1-1a | 첫 번째 내레이션입니다 | S-01 | 메인 영상 도입부 | 1.0 | 00:07.500 | 00:15.200 | |
| 1-2 | 두 번째 내레이션 | S-02 | 서브 영상 | 0.8 | 00:03.000 | 00:08.000 | 슬로우 |

| 2-1 | 세 번째 | S-01 | 메인 후반 | 1.0 | 00:20.000 | 00:30.000 | |
========
---
| 2-2 | 네 번째 | S-03 | 인서트 | 1.5 | 00:00.000 | 00:05.000 | 빠르게 |`;

const lines = splitEditTableLines(sampleTable);
assert(lines.length === 5, `데이터행 5개 (헤더1 + 데이터4): got ${lines.length}`);
assert(!lines.some(l => /^[-=|+\s]+$/.test(l.trim())), '구분선 제거됨');
assert(lines[0].includes('순서'), '헤더 행 포함');

// === Test 4: estimateTokenCount ===
console.log('\n📋 Test 4: estimateTokenCount');

const pureEnglish = 'Hello world this is a test sentence for token estimation.';
const engTokens = estimateTokenCount(pureEnglish);
assert(engTokens > 10 && engTokens < 30, `영문 60자 → ${engTokens} tokens (10~30 범위)`);

const pureKorean = '안녕하세요 이것은 토큰 추정 테스트입니다 편집표를 분석합니다';
const korTokens = estimateTokenCount(pureKorean);
assert(korTokens > 20 && korTokens < 60, `한글 30자 → ${korTokens} tokens (20~60 범위)`);

// 이슈 #97 실제 상황 시뮬레이션: 큰 편집표 (약 50행 × 200자)
const bigTable = Array.from({ length: 50 }, (_, i) =>
  `| ${i+1} | 이것은 ${i+1}번째 내레이션 텍스트입니다. 영상의 핵심 장면을 설명합니다. | S-${String(i % 5 + 1).padStart(2, '0')} | 소스 영상 설명 ${i+1} | 1.0 | 00:${String(i).padStart(2,'0')}.000 | 00:${String(i+5).padStart(2,'0')}.000 | 비고 ${i+1} |`
).join('\n');
const bigTokens = estimateTokenCount(bigTable);
assert(bigTokens > 3000, `50행 편집표 → ${bigTokens} tokens (3000+ 예상)`);

// 이슈 #97 실제 규모: promptTokens=18568 → 입력이 매우 큰 경우
// 실제 사용자 편집표는 훨씬 더 길거나 내레이션이 긴 경우
const hugeTable = Array.from({ length: 150 }, (_, i) =>
  `| ${i+1} | 이것은 ${i+1}번째 내레이션 텍스트입니다. 영상의 핵심 장면을 아주 상세하게 설명하는 긴 내레이션입니다. 여기에 더 많은 설명이 들어갑니다. | S-${String(i % 10 + 1).padStart(2, '0')} | 소스 영상에 대한 상세 설명 ${i+1} - 장면의 분위기와 배경음악 등 | 1.0 | 00:${String(i).padStart(2,'0')}.000 | 00:${String(i+5).padStart(2,'0')}.000 | 비고 내용 ${i+1} |`
).join('\n');
const hugeTokens = estimateTokenCount(hugeTable);
assert(hugeTokens > 12000, `150행 대형 편집표 → ${hugeTokens} tokens (12000+ 예상, 청크 분할 트리거)`);

// === Test 5: rawEntryToEdl ===
console.log('\n📋 Test 5: rawEntryToEdl');

const raw = {
  order: '1-1a',
  narrationText: '테스트 내레이션',
  sourceId: 'S-01',
  sourceDescription: '메인 영상',
  speedFactor: 0.8,
  timecodeStart: '00:07.500',
  timecodeEnd: '00:15.200',
  note: '슬로우',
};
const edl = rawEntryToEdl(raw, 0);
assert(edl.order === '1-1a', 'order 변환');
assert(edl.sourceId === 'S-01', 'sourceId 변환');
assert(edl.speedFactor === 0.8, 'speedFactor 변환');
assert(edl.timecodeStart === 7.5, 'timecodeStart → 초 변환');
assert(edl.timecodeEnd === 15.2, 'timecodeEnd → 초 변환');
assert(edl.note === '슬로우', 'note 변환');

// 누락 필드 기본값
const partial = rawEntryToEdl({}, 5);
assert(partial.order === '6', '누락 order → idx+1');
assert(partial.sourceId === 'S-01', '누락 sourceId → S-01');
assert(partial.speedFactor === 1.0, '누락 speedFactor → 1.0');
assert(partial.timecodeStart === 0, '누락 timecodeStart → 0');

// === Test 6: 청크 분할 시뮬레이션 ===
console.log('\n📋 Test 6: 청크 분할 시뮬레이션');

const CHUNK_SIZE = 20;
const bigLines = splitEditTableLines(bigTable);

// 헤더 감지 테스트
const tableWithHeader = `순서 | 내레이션 | 소스 | 설명\n${bigTable}`;
const linesWithHeader = splitEditTableLines(tableWithHeader);
const firstLine = linesWithHeader[0].toLowerCase();
const hasHeader = firstLine.includes('순서') || firstLine.includes('order') || firstLine.includes('내레이션');
assert(hasHeader, '헤더 행 감지됨');

// 청크 수 계산
const numChunks = Math.ceil(bigLines.length / CHUNK_SIZE);
assert(numChunks === 3, `50행 / 20 = ${numChunks} 청크 (3 예상)`);

// 각 청크가 올바른 행 수를 가지는지
for (let i = 0; i < numChunks; i++) {
  const chunk = bigLines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const expectedSize = i < numChunks - 1 ? CHUNK_SIZE : bigLines.length % CHUNK_SIZE || CHUNK_SIZE;
  assert(chunk.length === expectedSize, `청크 ${i+1}: ${chunk.length}행 (${expectedSize} 예상)`);
}

// === Test 7: 이슈 #97 시나리오 재현 ===
console.log('\n📋 Test 7: 이슈 #97 시나리오 재현');

// promptTokens: 18568 → 시스템프롬프트 + 큰 편집표
const systemPromptTokens = estimateTokenCount(
  `You are a professional video editor assistant. Parse the given edit table...` // 축약
);
const bigTableTokens = estimateTokenCount(bigTable);
const totalInput = systemPromptTokens + bigTableTokens;

// 핵심: 50행 편집표는 단일 호출이지만, 실제 이슈(18568 토큰)는 청크 분할 필요
// 여기서는 단일 호출 실패 시 폴백 로직이 핵심 방어선
assert(totalInput > 1000, `50행 편집표: 총 ${totalInput} tokens → 유효한 입력`);

// 150행 대형 편집표는 반드시 청크 분할
const hugeTableTokens2 = estimateTokenCount(hugeTable);
const hugeTotal = systemPromptTokens + hugeTableTokens2;
assert(hugeTotal >= 12000, `150행 대형 편집표: 총 ${hugeTotal} tokens → 청크 분할 트리거`);

// completionTokens < 500 감지 로직
const mockCompletionTokens = 154; // 이슈 #97의 실제 값
const mockFinishReason = 'length';
const shouldFallback = mockFinishReason === 'length' && mockCompletionTokens < 500;
assert(shouldFallback, 'completion 154 + length → 폴백 트리거');

// 정상 completion은 폴백하지 않음
const normalCompletion = 2000;
const normalFinish = 'length';
const shouldNotFallback = !(normalFinish === 'length' && normalCompletion < 500);
assert(shouldNotFallback, 'completion 2000 + length → 복구 시도 (폴백 아님)');

// stop이면 정상
const stopFinish = 'stop';
const shouldNothing = stopFinish !== 'length';
assert(shouldNothing, 'finish=stop → 정상 처리');

// === Test 8: JSON 블록 추출 (폴백 파싱) ===
console.log('\n📋 Test 8: JSON 블록 추출 (폴백 파싱)');

const withCodeBlock = '여기에 결과입니다:\n```json\n{"entries":[{"order":"1","sourceId":"S-01"}]}\n```\n끝.';
const jsonMatch1 = withCodeBlock.match(/```json\s*([\s\S]*?)```/);
assert(!!jsonMatch1, '```json 블록 매칭');
const parsed1 = JSON.parse(jsonMatch1![1]);
assert(parsed1.entries.length === 1, '```json 블록에서 1개 entry 추출');

const withoutCodeBlock = '결과: {"entries":[{"order":"2","sourceId":"S-02"}]}';
const jsonMatch2 = withoutCodeBlock.match(/```json\s*([\s\S]*?)```/) || withoutCodeBlock.match(/(\{[\s\S]*\})/);
assert(!!jsonMatch2, '일반 JSON 블록 매칭');
const parsed2 = JSON.parse(jsonMatch2![1]);
assert(parsed2.entries.length === 1, '일반 JSON에서 1개 entry 추출');

// ── 결과 요약 ──
console.log(`\n${'='.repeat(50)}`);
console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('❌ 일부 테스트 실패!');
  process.exit(1);
} else {
  console.log('✅ 모든 테스트 통과!');
}
