/**
 * Evolink v1beta vs KIE — 영상 분석 속도 벤치마크
 *
 * Evolink: Google Native v1beta (fileData 방식)
 * KIE: OpenAI 호환 (image_url 방식)
 *
 * 동일한 영상 URL + 동일한 프롬프트로 비교
 */

const EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const KIE_KEY = 'REDACTED_KIE_KEY';

// 짧은 공개 영상 (테스트용)
const VIDEO_URL = 'https://storage.googleapis.com/generativeai-downloads/data/ShortVideo1080p.mp4';

const SYSTEM_PROMPT = `당신은 영상 분석 전문가입니다. 주어진 영상을 분석하여 다음을 작성하세요:
1. 영상 요약 (3줄)
2. 주요 장면 5개 (타임코드 + 설명)
3. 영상의 분위기/톤
4. 타겟 시청자층
JSON 형식으로 응답하세요.`;

const USER_PROMPT = '이 영상을 분석해주세요. 반드시 JSON으로 응답하세요.';

const REPEAT = 2;

// ─── Evolink v1beta (Google Native — fileData) ───

async function testEvolinkV1Beta(videoUrl) {
  const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
        { text: SYSTEM_PROMPT + '\n\n' + USER_PROMPT }
      ]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 8192
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  };

  const start = performance.now();
  let ttfbTime = 0;
  let fullContent = '';
  let chunks = 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EVOLINK_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 300) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });

    if (!ttfbTime && text.length > 0) {
      ttfbTime = performance.now() - start;
    }

    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        chunks++;
        try {
          const parsed = JSON.parse(line.slice(6));
          const parts = parsed.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) fullContent += part.text;
          }
        } catch {}
      }
    }
  }

  const total = performance.now() - start;

  return {
    error: false,
    provider: 'Evolink v1beta',
    ttfb: Math.round(ttfbTime),
    total: Math.round(total),
    chunks,
    contentLength: fullContent.length,
    contentPreview: fullContent.slice(0, 200),
  };
}

// ─── KIE (OpenAI 호환 — image_url 방식) ───

async function testKIE(videoUrl) {
  const url = 'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions';

  const payload = {
    model: 'gemini-3.1-pro',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT },
          { type: 'image_url', image_url: { url: videoUrl } }
        ]
      }
    ],
    stream: true,
  };

  const start = performance.now();
  let ttfbTime = 0;
  let fullContent = '';
  let chunks = 0;
  let usage = {};

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 300) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });

    if (!ttfbTime && text.length > 0) {
      ttfbTime = performance.now() - start;
    }

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
    provider: 'KIE',
    ttfb: Math.round(ttfbTime),
    total: Math.round(total),
    chunks,
    contentLength: fullContent.length,
    completionTokens: usage.completion_tokens || 0,
    contentPreview: fullContent.slice(0, 200),
  };
}

// ─── Evolink v1 (OpenAI 호환 — 비교용 추가) ───

async function testEvolinkV1(videoUrl) {
  const url = 'https://api.evolink.ai/v1/chat/completions';

  const payload = {
    model: 'gemini-3.1-pro-preview',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: USER_PROMPT },
          { type: 'image_url', image_url: { url: videoUrl } }
        ]
      }
    ],
    stream: true,
  };

  const start = performance.now();
  let ttfbTime = 0;
  let fullContent = '';
  let chunks = 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EVOLINK_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 300) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });

    if (!ttfbTime && text.length > 0) {
      ttfbTime = performance.now() - start;
    }

    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        chunks++;
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content || '';
          fullContent += delta;
        } catch {}
      }
    }
  }

  const total = performance.now() - start;

  return {
    error: false,
    provider: 'Evolink v1',
    ttfb: Math.round(ttfbTime),
    total: Math.round(total),
    chunks,
    contentLength: fullContent.length,
    contentPreview: fullContent.slice(0, 200),
  };
}

// ─── Main ───

async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   영상 분석 벤치마크 — Evolink v1beta vs KIE vs Evolink v1 ║');
  console.log('║   영상: Google AI 공개 테스트 영상 (1080p)                  ║');
  console.log('║   반복: ' + REPEAT + '회                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n영상 URL: ${VIDEO_URL}\n`);

  const tests = [
    { name: 'Evolink v1beta (Google Native fileData)', fn: testEvolinkV1Beta },
    { name: 'Evolink v1 (OpenAI image_url)', fn: testEvolinkV1 },
    { name: 'KIE (OpenAI image_url)', fn: testKIE },
  ];

  const allResults = {};

  for (const test of tests) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 ${test.name}`);
    console.log(`${'─'.repeat(60)}`);

    const results = [];

    for (let i = 0; i < REPEAT; i++) {
      process.stdout.write(`  라운드 ${i + 1}/${REPEAT}...`);

      try {
        const result = await test.fn(VIDEO_URL);

        if (result.error) {
          console.log(` ❌ HTTP ${result.status}`);
          console.log(`     ${result.detail}`);
        } else {
          console.log(` ✅ 총 ${result.total}ms | TTFB ${result.ttfb}ms | ${result.chunks}청크 | ${result.contentLength}자`);
        }
        results.push(result);
      } catch (err) {
        console.log(` ❌ ${err.message}`);
        results.push({ error: true, detail: err.message });
      }

      // 요청 간 2초 대기
      if (i < REPEAT - 1) await new Promise(r => setTimeout(r, 2000));
    }

    const valid = results.filter(r => !r.error);
    if (valid.length > 0) {
      const avgTotal = Math.round(valid.reduce((s, r) => s + r.total, 0) / valid.length);
      const avgTtfb = Math.round(valid.reduce((s, r) => s + r.ttfb, 0) / valid.length);
      const minTotal = Math.min(...valid.map(r => r.total));
      const maxTotal = Math.max(...valid.map(r => r.total));

      allResults[test.name] = { avgTotal, avgTtfb, minTotal, maxTotal, errors: results.length - valid.length, count: valid.length };

      console.log(`  ── 통계: 평균 ${avgTotal}ms (${minTotal}~${maxTotal}ms) | TTFB 평균 ${avgTtfb}ms | 에러 ${results.length - valid.length}/${REPEAT}`);
    } else {
      allResults[test.name] = { avgTotal: 0, avgTtfb: 0, errors: REPEAT, count: 0 };
      console.log(`  ── ⚠️ 모든 요청 실패`);
    }
  }

  // ─── Summary ───
  console.log(`\n\n${'═'.repeat(65)}`);
  console.log('📋 영상 분석 최종 비교');
  console.log(`${'═'.repeat(65)}`);
  console.log();
  console.log('| 프로바이더                        | 평균 응답(ms) | TTFB(ms) | 범위(ms)         | 에러 |');
  console.log('|----------------------------------|-------------|----------|-----------------|------|');

  for (const [name, r] of Object.entries(allResults)) {
    const range = r.count > 0 ? `${r.minTotal}~${r.maxTotal}` : 'N/A';
    console.log(`| ${name.padEnd(32)} | ${String(r.avgTotal).padStart(11)} | ${String(r.avgTtfb).padStart(8)} | ${range.padStart(15)} | ${r.errors}/${REPEAT}  |`);
  }

  // Winner
  const working = Object.entries(allResults).filter(([, r]) => r.count > 0);
  if (working.length >= 2) {
    working.sort((a, b) => a[1].avgTotal - b[1].avgTotal);
    const fastest = working[0];
    const slowest = working[working.length - 1];
    const diff = slowest[1].avgTotal - fastest[1].avgTotal;
    const pct = Math.round((diff / slowest[1].avgTotal) * 100);

    console.log(`\n🏆 영상 분석 최속: ${fastest[0]}`);
    console.log(`   ${slowest[0]} 대비 ${diff}ms (${pct}%) 빠름`);

    // TTFB winner
    working.sort((a, b) => a[1].avgTtfb - b[1].avgTtfb);
    console.log(`\n⚡ 첫 응답(TTFB) 최속: ${working[0][0]} (${working[0][1].avgTtfb}ms)`);
  }

  console.log('\n✅ 영상 분석 벤치마크 완료');
}

runBenchmark().catch(err => {
  console.error('벤치마크 실패:', err);
  process.exit(1);
});
