/**
 * Evolink v1beta vs KIE — 영상 분석 속도 벤치마크 (v2)
 *
 * YouTube URL로 테스트 (실제 앱과 동일한 시나리오)
 */

const EVOLINK_KEY = 'REDACTED_EVOLINK_KEY';
const KIE_KEY = 'REDACTED_KIE_KEY';

// 짧은 YouTube 영상 (공개, ~1분)
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const PROMPT = `이 영상을 분석하여 다음을 JSON으로 응답하세요:
1. 영상 요약 (3줄)
2. 주요 장면 5개 (타임코드 추정 + 설명)
3. 영상의 분위기와 톤
4. 타겟 시청자층`;

const REPEAT = 2;

// ─── Evolink v1beta (Google Native — fileData) ───
async function testEvolinkV1Beta(videoUrl) {
  const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType: 'video/*', fileUri: videoUrl } },
        { text: PROMPT }
      ]
    }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  };

  return await streamTest('Evolink v1beta', url, EVOLINK_KEY, payload, 'google-native');
}

// ─── Evolink v1beta (non-streaming) ───
async function testEvolinkV1BetaNonStream(videoUrl) {
  const url = `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType: 'video/*', fileUri: videoUrl } },
        { text: PROMPT }
      ]
    }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  };

  const start = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${EVOLINK_KEY}` },
    body: JSON.stringify(payload),
  });

  const ttfb = performance.now() - start;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 500) };
  }

  const data = await res.json();
  const total = performance.now() - start;
  const content = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

  return {
    error: false, provider: 'Evolink v1beta (non-stream)',
    ttfb: Math.round(ttfb), total: Math.round(total),
    contentLength: content.length, contentPreview: content.slice(0, 200),
  };
}

// ─── Evolink v1 (OpenAI image_url) ───
async function testEvolinkV1(videoUrl) {
  const url = 'https://api.evolink.ai/v1/chat/completions';

  const payload = {
    model: 'gemini-3.1-pro-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: videoUrl } }
      ]
    }],
    stream: true,
  };

  return await streamTest('Evolink v1', url, EVOLINK_KEY, payload, 'openai');
}

// ─── KIE (OpenAI image_url) ───
async function testKIE(videoUrl) {
  const url = 'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions';

  const payload = {
    model: 'gemini-3.1-pro',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: videoUrl } }
      ]
    }],
    stream: true,
  };

  return await streamTest('KIE', url, KIE_KEY, payload, 'openai');
}

// ─── Generic stream parser ───
async function streamTest(name, url, key, payload, format) {
  const start = performance.now();
  let ttfbTime = 0;
  let fullContent = '';
  let chunks = 0;
  let usage = {};

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { error: true, status: res.status, detail: errText.slice(0, 500) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    buffer += text;

    if (!ttfbTime && text.length > 0) {
      ttfbTime = performance.now() - start;
    }

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

      chunks++;
      try {
        const parsed = JSON.parse(trimmed.slice(6));

        if (format === 'google-native') {
          const parts = parsed.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) fullContent += part.text;
          }
        } else {
          const delta = parsed.choices?.[0]?.delta?.content || '';
          fullContent += delta;
          if (parsed.usage) usage = parsed.usage;
        }
      } catch {}
    }
  }

  const total = performance.now() - start;

  return {
    error: false,
    provider: name,
    ttfb: Math.round(ttfbTime),
    total: Math.round(total),
    chunks,
    contentLength: fullContent.length,
    completionTokens: usage.completion_tokens || 0,
    contentPreview: fullContent.slice(0, 200),
  };
}

// ─── Main ───
async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   영상 분석 벤치마크 v2 — YouTube URL 기반                      ║');
  console.log('║   Evolink v1beta / Evolink v1 / KIE 3가지 경로 비교            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\n🎬 테스트 영상: ${YOUTUBE_URL}`);
  console.log(`🔄 반복: ${REPEAT}회\n`);

  const tests = [
    { name: 'Evolink v1beta (streaming, fileData)', fn: testEvolinkV1Beta },
    { name: 'Evolink v1beta (non-streaming, fileData)', fn: testEvolinkV1BetaNonStream },
    { name: 'Evolink v1 (streaming, image_url)', fn: testEvolinkV1 },
    { name: 'KIE (streaming, image_url)', fn: testKIE },
  ];

  const allResults = {};

  for (const test of tests) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 ${test.name}`);
    console.log(`${'─'.repeat(60)}`);

    const results = [];

    for (let i = 0; i < REPEAT; i++) {
      process.stdout.write(`  라운드 ${i + 1}/${REPEAT}... `);

      try {
        const result = await test.fn(YOUTUBE_URL);

        if (result.error) {
          console.log(`❌ HTTP ${result.status}`);
          console.log(`     ${result.detail}`);
        } else {
          console.log(`✅ 총 ${result.total}ms | TTFB ${result.ttfb}ms | ${result.chunks}청크 | ${result.contentLength}자`);
          if (result.contentLength > 0) {
            console.log(`     미리보기: ${result.contentPreview.replace(/\n/g, ' ').slice(0, 100)}...`);
          }
        }
        results.push(result);
      } catch (err) {
        console.log(`❌ ${err.message}`);
        results.push({ error: true, detail: err.message });
      }

      if (i < REPEAT - 1) await new Promise(r => setTimeout(r, 3000));
    }

    const valid = results.filter(r => !r.error);
    if (valid.length > 0) {
      const avgTotal = Math.round(valid.reduce((s, r) => s + r.total, 0) / valid.length);
      const avgTtfb = Math.round(valid.reduce((s, r) => s + r.ttfb, 0) / valid.length);
      const minTotal = Math.min(...valid.map(r => r.total));
      const maxTotal = Math.max(...valid.map(r => r.total));
      const avgContent = Math.round(valid.reduce((s, r) => s + r.contentLength, 0) / valid.length);

      allResults[test.name] = { avgTotal, avgTtfb, minTotal, maxTotal, errors: results.length - valid.length, count: valid.length, avgContent };
      console.log(`  ── 통계: 평균 ${avgTotal}ms | TTFB ${avgTtfb}ms | 응답 ${avgContent}자 | 에러 ${results.length - valid.length}/${REPEAT}`);
    } else {
      allResults[test.name] = { avgTotal: 0, avgTtfb: 0, errors: REPEAT, count: 0, avgContent: 0 };
      console.log(`  ── ⚠️ 모든 요청 실패`);
    }
  }

  // ─── Summary ───
  console.log(`\n\n${'═'.repeat(75)}`);
  console.log('📋 영상 분석 최종 비교');
  console.log(`${'═'.repeat(75)}`);
  console.log();
  console.log('| 프로바이더                              | 평균(ms) | TTFB(ms) | 응답(자) | 에러   |');
  console.log('|----------------------------------------|---------|----------|---------|--------|');

  for (const [name, r] of Object.entries(allResults)) {
    const status = r.count === 0 ? '전부 실패' : `${r.errors}/${REPEAT}`;
    console.log(`| ${name.padEnd(38)} | ${String(r.avgTotal).padStart(7)} | ${String(r.avgTtfb).padStart(8)} | ${String(r.avgContent).padStart(7)} | ${status.padStart(6)} |`);
  }

  // Winner
  const working = Object.entries(allResults).filter(([, r]) => r.count > 0 && r.avgContent > 0);
  if (working.length >= 2) {
    working.sort((a, b) => a[1].avgTotal - b[1].avgTotal);
    console.log(`\n🏆 영상 분석 최속: ${working[0][0]} (${working[0][1].avgTotal}ms)`);
    console.log(`   최느: ${working[working.length - 1][0]} (${working[working.length - 1][1].avgTotal}ms)`);

    const diff = working[working.length - 1][1].avgTotal - working[0][1].avgTotal;
    const pct = Math.round((diff / working[working.length - 1][1].avgTotal) * 100);
    console.log(`   차이: ${diff}ms (${pct}%)`);
  } else if (working.length === 1) {
    console.log(`\n🏆 유일한 성공: ${working[0][0]} (${working[0][1].avgTotal}ms)`);
  } else {
    console.log('\n⚠️ 응답 내용이 있는 프로바이더 없음');
  }

  console.log('\n✅ 영상 분석 벤치마크 완료');
}

runBenchmark().catch(err => {
  console.error('벤치마크 실패:', err);
  process.exit(1);
});
