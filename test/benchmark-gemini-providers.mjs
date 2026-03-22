/**
 * Evolink vs KIE — Gemini 3.1 Pro 속도 벤치마크
 *
 * 테스트 항목:
 *  1. 짧은 프롬프트 (단문 응답)
 *  2. 중간 프롬프트 (장면 분석 시뮬레이션)
 *  3. 긴 프롬프트 + JSON 출력 (실제 앱 유사 시나리오)
 *  4. 스트리밍 TTFB (첫 토큰 도달 시간)
 *
 * 각 테스트를 3회 반복하여 평균/최소/최대 측정
 */

const EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const KIE_KEY = 'REDACTED_KIE_KEY';

const EVOLINK_URL = 'https://api.evolink.ai/v1/chat/completions';
const KIE_URL = 'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions';

const REPEAT = 3;

// ─── Test Prompts ───

const PROMPT_SHORT = [
  { role: 'user', content: '한국의 수도는 어디인가요? 한 문장으로 답하세요.' }
];

const PROMPT_MEDIUM = [
  { role: 'system', content: '당신은 영상 제작 전문가입니다. 대본을 분석하여 장면을 분할합니다.' },
  { role: 'user', content: `다음 대본을 3개의 장면으로 분할하고, 각 장면에 대해 비주얼 설명을 작성하세요:

"서울의 아침이 밝았다. 한강 위로 안개가 피어오르고, 조깅하는 사람들이 하나둘 나타난다.
카페 골목에서는 커피 향이 퍼지고, 바리스타가 정성스럽게 라떼아트를 완성한다.
저녁이 되면 남산타워에 불이 켜지고, 연인들이 사랑의 자물쇠를 걸며 야경을 감상한다."

JSON 형식으로 응답하세요: { "scenes": [{ "id": 1, "title": "...", "description": "...", "visual_prompt": "..." }] }` }
];

const PROMPT_LONG = [
  { role: 'system', content: '당신은 AI 영상 스토리보드 전문가입니다. 주어진 대본을 분석하여 상세한 스토리보드를 생성합니다. 각 장면에 대해 카메라 앵글, 색감, 분위기, 소품, 배경음악 제안까지 포함해야 합니다.' },
  { role: 'user', content: `다음 유튜브 영상 대본을 분석하여 7-10개의 스토리보드 장면을 생성하세요. 각 장면에는 다음 정보를 포함해야 합니다:
- 장면 번호, 제목
- 나레이션 텍스트
- 비주얼 프롬프트 (이미지 생성용, 영어)
- 카메라 앵글 (wide/medium/close-up/aerial)
- 색감 팔레트 (hex 코드 3개)
- 배경음악 장르 제안
- 예상 장면 길이 (초)

대본:
"여러분, 오늘은 제가 직접 일본 도쿄를 3일 동안 여행하면서 발견한 숨겨진 맛집 TOP 10을 소개합니다.
첫 번째는 시부야 뒷골목에 있는 30년 된 라멘집인데요, 이 집은 돈코츠 라멘으로 유명합니다.
국물이 18시간 동안 끓여져서 정말 진한 맛이 나요.
두 번째는 긴자의 스시 오마카세인데, 장인이 눈앞에서 직접 스시를 만들어줍니다.
참치 뱃살이 입에서 녹는 순간, 정말 감동이었습니다.
세 번째는 하라주쿠의 크레페 가게, 딸기와 생크림의 조합이 환상적이에요.
네 번째는 아사쿠사의 장어덮밥집, 100년 전통의 비법 소스가 비결입니다.
다섯 번째부터 열 번째까지는 영상에서 확인하세요!
구독과 좋아요 부탁드립니다."

반드시 JSON 형식으로 응답하세요.` }
];

// ─── Helpers ───

async function testNonStreaming(name, url, key, messages, model) {
  const body = {
    model,
    messages,
    stream: false,
    ...(name === 'KIE' ? {} : {}),
  };

  const start = performance.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const ttfb = performance.now() - start;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, ttfb, detail: errText.slice(0, 200) };
  }

  const data = await res.json();
  const total = performance.now() - start;

  const usage = data.usage || {};
  const content = data.choices?.[0]?.message?.content || '';

  return {
    error: false,
    ttfb: Math.round(ttfb),
    total: Math.round(total),
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    contentLength: content.length,
    tokensPerSec: usage.completion_tokens ? Math.round(usage.completion_tokens / (total / 1000)) : 0,
  };
}

async function testStreaming(name, url, key, messages, model) {
  const body = {
    model,
    messages,
    stream: true,
  };

  const start = performance.now();
  let ttfbTime = 0;
  let chunks = 0;
  let fullContent = '';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 200) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let usage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });

    if (!ttfbTime && text.length > 0) {
      ttfbTime = performance.now() - start;
    }

    // Parse SSE chunks
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        chunks++;
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content || '';
          fullContent += delta;
          if (parsed.usage) usage = parsed.usage;
        } catch {}
      }
    }
  }

  const total = performance.now() - start;

  return {
    error: false,
    ttfb: Math.round(ttfbTime),
    total: Math.round(total),
    chunks,
    contentLength: fullContent.length,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    tokensPerSec: usage.completion_tokens ? Math.round(usage.completion_tokens / (total / 1000)) : 0,
  };
}

function stats(results) {
  const valid = results.filter(r => !r.error);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, errors: results.length };

  const totals = valid.map(r => r.total);
  const ttfbs = valid.map(r => r.ttfb);
  const tps = valid.map(r => r.tokensPerSec);

  return {
    avgTotal: Math.round(totals.reduce((a, b) => a + b, 0) / valid.length),
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    avgTtfb: Math.round(ttfbs.reduce((a, b) => a + b, 0) / valid.length),
    minTtfb: Math.min(...ttfbs),
    maxTtfb: Math.max(...ttfbs),
    avgTps: Math.round(tps.reduce((a, b) => a + b, 0) / valid.length),
    avgTokens: Math.round(valid.map(r => r.completionTokens).reduce((a, b) => a + b, 0) / valid.length),
    errors: results.length - valid.length,
    count: valid.length,
  };
}

// ─── Main ───

async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Evolink vs KIE — Gemini 3.1 Pro 속도 벤치마크            ║');
  console.log('║   반복 횟수: ' + REPEAT + '회 × 4 테스트 × 2 프로바이더                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  const providers = [
    { name: 'Evolink', url: EVOLINK_URL, key: EVOLINK_KEY, model: 'gemini-3.1-pro-preview' },
    { name: 'KIE',     url: KIE_URL,     key: KIE_KEY,     model: 'gemini-3.1-pro' },
  ];

  const tests = [
    { label: '1. 짧은 프롬프트 (Non-Streaming)', messages: PROMPT_SHORT, streaming: false },
    { label: '2. 중간 프롬프트 — 장면 분할 (Non-Streaming)', messages: PROMPT_MEDIUM, streaming: false },
    { label: '3. 긴 프롬프트 — 스토리보드 생성 (Non-Streaming)', messages: PROMPT_LONG, streaming: false },
    { label: '4. 중간 프롬프트 — 스트리밍 TTFB', messages: PROMPT_MEDIUM, streaming: true },
  ];

  const allResults = {};

  for (const test of tests) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 ${test.label}`);
    console.log(`${'─'.repeat(60)}`);

    for (const provider of providers) {
      const results = [];

      for (let i = 0; i < REPEAT; i++) {
        process.stdout.write(`  ${provider.name} 라운드 ${i + 1}/${REPEAT}...`);

        try {
          const result = test.streaming
            ? await testStreaming(provider.name, provider.url, provider.key, test.messages, provider.model)
            : await testNonStreaming(provider.name, provider.url, provider.key, test.messages, provider.model);

          if (result.error) {
            console.log(` ❌ HTTP ${result.status} — ${result.detail}`);
          } else {
            console.log(` ✅ ${result.total}ms (TTFB: ${result.ttfb}ms, ${result.completionTokens || '?'}tok, ${result.tokensPerSec}tok/s)`);
          }
          results.push(result);
        } catch (err) {
          console.log(` ❌ ${err.message}`);
          results.push({ error: true, detail: err.message });
        }

        // 요청 간 1초 대기 (레이트 리밋 방지)
        if (i < REPEAT - 1) await new Promise(r => setTimeout(r, 1000));
      }

      const s = stats(results);
      const key = `${test.label}|${provider.name}`;
      allResults[key] = { ...s, provider: provider.name, test: test.label };

      console.log(`  ── ${provider.name} 통계: 평균 ${s.avgTotal}ms (${s.minTotal}~${s.maxTotal}ms) | TTFB 평균 ${s.avgTtfb}ms | ${s.avgTps}tok/s | 에러 ${s.errors}/${REPEAT}`);
    }
  }

  // ─── Summary Table ───
  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('📋 최종 비교 요약표');
  console.log(`${'═'.repeat(70)}`);
  console.log();
  console.log('| 테스트 | 프로바이더 | 평균 응답(ms) | TTFB(ms) | tok/s | 에러 |');
  console.log('|--------|-----------|-------------|----------|-------|------|');

  for (const key of Object.keys(allResults)) {
    const r = allResults[key];
    const testShort = r.test.replace(/^\d+\.\s*/, '').slice(0, 30);
    console.log(`| ${testShort.padEnd(30)} | ${r.provider.padEnd(9)} | ${String(r.avgTotal).padStart(11)} | ${String(r.avgTtfb).padStart(8)} | ${String(r.avgTps).padStart(5)} | ${r.errors}/${REPEAT}  |`);
  }

  // ─── Winner Analysis ───
  console.log(`\n${'═'.repeat(70)}`);
  console.log('🏆 승자 분석');
  console.log(`${'═'.repeat(70)}`);

  for (const test of tests) {
    const evoKey = `${test.label}|Evolink`;
    const kieKey = `${test.label}|KIE`;
    const evo = allResults[evoKey];
    const kie = allResults[kieKey];

    if (!evo || !kie) continue;
    if (evo.errors === REPEAT || kie.errors === REPEAT) {
      console.log(`\n${test.label}: ⚠️ 한쪽 또는 양쪽 에러`);
      continue;
    }

    const fasterTotal = evo.avgTotal < kie.avgTotal ? 'Evolink' : 'KIE';
    const diffTotal = Math.abs(evo.avgTotal - kie.avgTotal);
    const pctTotal = Math.round((diffTotal / Math.max(evo.avgTotal, kie.avgTotal)) * 100);

    const fasterTtfb = evo.avgTtfb < kie.avgTtfb ? 'Evolink' : 'KIE';
    const diffTtfb = Math.abs(evo.avgTtfb - kie.avgTtfb);

    const fasterTps = evo.avgTps > kie.avgTps ? 'Evolink' : 'KIE';

    console.log(`\n${test.label}:`);
    console.log(`  총 응답: ${fasterTotal} 승 (${diffTotal}ms 빠름, ${pctTotal}% 차이)`);
    console.log(`  TTFB: ${fasterTtfb} 승 (${diffTtfb}ms 빠름)`);
    console.log(`  처리량: ${fasterTps} 승 (Evolink ${evo.avgTps} vs KIE ${kie.avgTps} tok/s)`);
  }

  console.log('\n\n✅ 벤치마크 완료');
}

runBenchmark().catch(err => {
  console.error('벤치마크 실패:', err);
  process.exit(1);
});
