#!/usr/bin/env node
/**
 * TTS 미리듣기 샘플 사전 생성 스크립트
 * 생성된 파일은 src/public/audio/samples/ 에 저장되어 앱에 번들됩니다.
 *
 * 사용법:
 *   node scripts/generate-tts-samples.mjs --kie-key=sk-xxx   # ElevenLabs 전체
 *   node scripts/generate-tts-samples.mjs --kie-key=sk-xxx --engine=elevenlabs
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'public', 'audio', 'samples');

// === 샘플 텍스트 ===
const SAMPLE_TEXTS = {
  ko: '안녕하세요, 저는 AI 나레이션 음성입니다.',
  en: 'Hello, I am an AI narration voice. Nice to meet you.',
  ja: 'こんにちは、AIナレーション音声です。',
};

// === ElevenLabs (Kie API) ===
const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const ELEVENLABS_VOICES = [
  'Rachel', 'Sarah', 'Aria', 'Charlotte', 'Laura', 'Lily', 'Alice', 'Matilda', 'Jessica',
  'Roger', 'George', 'Charlie', 'Callum', 'Liam', 'Will', 'Eric', 'Chris', 'Brian', 'Daniel',
  'River', 'Bill',
  // Community voices (by ID)
  'BIvP0GN1cAtSRTxNHnWS', 'aMSt68OGf4xUZAnLpTU8', 'RILOU7YmBhvwJGDGjNmP',
  'tnSpp4vdxKPjI9w0GnoV', 'NNl6r8mD7vthiJatiJt1', 'KoQQbl9zjAdLgKZjm8Ol',
  'DGTOOUoGpoP6UZ9uSWfA', 'hpp4J3VqNfWAUOO0d1Us', 'pNInz6obpgDQGcFmaJgB',
];

async function generateElevenLabsSample(voiceId, langCode, kieKey) {
  const text = SAMPLE_TEXTS[langCode];
  console.log(`  [ElevenLabs] ${voiceId} (${langCode})...`);

  const submitRes = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kieKey}` },
    body: JSON.stringify({
      model: 'elevenlabs/text-to-speech-multilingual-v2',
      input: { text, voice: voiceId, stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0, timestamps: false, previous_text: '', next_text: '', language_code: '' },
    }),
  });
  if (!submitRes.ok) throw new Error(`Submit failed: ${submitRes.status} ${await submitRes.text()}`);
  const data = await submitRes.json();
  const taskId = data.data?.taskId;
  if (!taskId) throw new Error('No taskId');

  // Poll
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, attempt < 5 ? 2000 : 3000));
    const pollRes = await fetch(`${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${kieKey}` },
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const state = pollData.data?.state;
    if (state === 'success') {
      const resultJson = pollData.data?.resultJson;
      let audioUrl;
      if (typeof resultJson === 'string') {
        try { const p = JSON.parse(resultJson); audioUrl = p.resultUrls?.[0] || p.audio_url || p.url; } catch { audioUrl = resultJson; }
      } else if (resultJson) {
        audioUrl = resultJson.resultUrls?.[0] || resultJson.audio_url || resultJson.url;
      }
      if (!audioUrl) throw new Error('No audio URL');
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
      return Buffer.from(await audioRes.arrayBuffer());
    }
    if (state === 'fail') throw new Error(`Failed: ${pollData.data?.failMsg || 'unknown'}`);
  }
  throw new Error('Timeout');
}

// === Main ===
async function main() {
  const args = process.argv.slice(2);
  const kieKey = args.find(a => a.startsWith('--kie-key='))?.split('=')[1];
  const langFilter = args.find(a => a.startsWith('--lang='))?.split('=')[1];
  const langs = langFilter ? [langFilter] : ['ko'];

  console.log('=== TTS 미리듣기 샘플 생성 (ElevenLabs) ===');
  console.log(`출력 디렉토리: ${OUTPUT_DIR}`);
  console.log(`언어: ${langs.join(', ')}`);

  if (!kieKey) {
    console.error('Kie API 키가 필요합니다. --kie-key=sk-xxx 옵션을 사용하세요.');
    process.exit(1);
  }
  console.log('Kie API 키: 제공됨');

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const dir = join(OUTPUT_DIR, 'elevenlabs');
  mkdirSync(dir, { recursive: true });
  console.log(`\n[ElevenLabs] ${ELEVENLABS_VOICES.length}개 음성 생성 시작...`);
  for (const voice of ELEVENLABS_VOICES) {
    for (const lang of langs) {
      const outPath = join(dir, `${voice}_${lang}.mp3`);
      if (existsSync(outPath)) { console.log(`  건너뜀 (이미 존재): ${voice}_${lang}.mp3`); skipped++; continue; }
      try {
        const buf = await generateElevenLabsSample(voice, lang, kieKey);
        writeFileSync(outPath, buf);
        console.log(`  ✓ ${voice}_${lang}.mp3 (${(buf.length / 1024).toFixed(0)}KB)`);
        generated++;
      } catch (e) {
        console.error(`  ✗ ${voice}_${lang}: ${e.message}`);
        failed++;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`생성: ${generated} | 건너뜀: ${skipped} | 실패: ${failed}`);
  console.log(`파일 위치: ${OUTPUT_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
