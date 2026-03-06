#!/usr/bin/env node

/**
 * test-tts-stt-integration.mjs
 *
 * Real integration test: TTS (ElevenLabs via Kie) → Cloudinary upload → STT (ElevenLabs Scribe via Kie)
 *
 * Flow:
 *   1. Generate TTS audio from Korean text via Kie API (elevenlabs/text-to-speech-multilingual-v2)
 *   2. Poll for TTS result → get audio URL
 *   3. Download audio to local file (for verification)
 *   4. Upload audio to Cloudinary (STT requires a URL)
 *   5. Create STT task via Kie API (elevenlabs/speech-to-text)
 *   6. Poll for STT result → validate transcription
 *
 * Usage:
 *   node test-tts-stt-integration.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────────────────

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
const KIE_API_KEY = 'REDACTED_KIE_KEY';

const CLOUDINARY_CLOUD_NAME = 'dji3gtb5r';
const CLOUDINARY_UPLOAD_PRESET = 'storyboard';

const TEST_TEXT = '안녕하세요, 저는 AI 나레이션 음성입니다. 오늘 날씨가 정말 좋네요.';
const TEST_VOICE = 'Sarah'; // ElevenLabs premade voice (multilingual)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log = (tag, msg, data) => {
  const ts = new Date().toISOString().slice(11, 19);
  const extra = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${tag}] ${msg}${extra}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Step 1: Generate TTS ────────────────────────────────────────────────────

async function createTtsTask() {
  log('TTS', `Creating TTS task for text: "${TEST_TEXT}" voice: ${TEST_VOICE}`);

  const response = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'elevenlabs/text-to-speech-multilingual-v2',
      input: {
        text: TEST_TEXT,
        voice: TEST_VOICE,
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
        speed: 1.0,
        timestamps: false,
        previous_text: '',
        next_text: '',
        language_code: '',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`TTS createTask failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const taskId = data.data?.taskId;
  if (!taskId) {
    throw new Error(`TTS createTask returned no taskId. Response: ${JSON.stringify(data)}`);
  }

  log('TTS', `Task created`, { taskId });
  return taskId;
}

// ─── Step 2: Poll TTS Task ──────────────────────────────────────────────────

async function pollTtsTask(taskId, maxAttempts = 60) {
  log('TTS', `Polling task ${taskId} (max ${maxAttempts} attempts)...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = attempt < 5 ? 2000 : 3000;
    await sleep(delay);

    const response = await fetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
    );

    if (!response.ok) {
      if (response.status === 429) {
        log('TTS', 'Rate limited, waiting 5s...');
        await sleep(5000);
        continue;
      }
      throw new Error(`TTS poll error (${response.status})`);
    }

    const data = await response.json();
    const state = data.data?.state;

    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      let audioUrl;

      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson);
          audioUrl = parsed.resultUrls?.[0] || parsed.audio_url || parsed.url;
        } catch {
          audioUrl = resultJson;
        }
      } else if (resultJson) {
        audioUrl = resultJson.resultUrls?.[0] || resultJson.audio_url || resultJson.url;
      }

      if (!audioUrl) {
        throw new Error(`TTS success but no audio URL found. resultJson: ${JSON.stringify(resultJson)}`);
      }

      log('TTS', `Completed!`, { audioUrl: audioUrl.slice(0, 80) + '...', attempt });
      return audioUrl;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || 'unknown error';
      throw new Error(`TTS task failed: ${failMsg}`);
    }

    if (attempt % 5 === 0) {
      log('TTS', `Still polling... (attempt ${attempt + 1}/${maxAttempts}, state: ${state})`);
    }
  }

  throw new Error(`TTS polling timed out after ${maxAttempts} attempts`);
}

// ─── Step 3: Download Audio ─────────────────────────────────────────────────

async function downloadAudio(audioUrl) {
  log('DOWNLOAD', `Downloading audio from: ${audioUrl.slice(0, 80)}...`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Audio download failed (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const localPath = path.join(__dirname, 'test-tts-output.mp3');
  fs.writeFileSync(localPath, Buffer.from(buffer));

  const sizeKb = (buffer.byteLength / 1024).toFixed(1);
  log('DOWNLOAD', `Saved to ${localPath} (${sizeKb} KB)`);
  return { localPath, buffer: Buffer.from(buffer) };
}

// ─── Step 4: Upload to Cloudinary ───────────────────────────────────────────

async function uploadToCloudinary(fileBuffer, filename = 'test-audio.mp3') {
  log('UPLOAD', `Uploading ${filename} to Cloudinary (cloud: ${CLOUDINARY_CLOUD_NAME}, preset: ${CLOUDINARY_UPLOAD_PRESET})`);

  // Use FormData with Blob-like approach for Node.js
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
  formData.append('file', blob, filename);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(`Cloudinary upload failed: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  log('UPLOAD', `Cloudinary upload success`, { url: data.secure_url, format: data.format, duration: data.duration });
  return data.secure_url;
}

// ─── Step 5: Create STT Task ────────────────────────────────────────────────

async function createSttTask(audioUrl) {
  log('STT', `Creating STT task for audio: ${audioUrl.slice(0, 80)}...`);

  const response = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'elevenlabs/speech-to-text',
      input: {
        audio_url: audioUrl,
        diarize: false,
        timestamps_granularity: 'word',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`STT createTask failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const taskId = data.data?.taskId;
  if (!taskId) {
    throw new Error(`STT createTask returned no taskId. Response: ${JSON.stringify(data)}`);
  }

  log('STT', `Task created`, { taskId });
  return taskId;
}

// ─── Step 6: Poll STT Task ──────────────────────────────────────────────────

async function pollSttTask(taskId, maxAttempts = 120) {
  log('STT', `Polling task ${taskId} (max ${maxAttempts} attempts)...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = attempt < 5 ? 2000 : 3000;
    await sleep(delay);

    const response = await fetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
    );

    if (!response.ok) {
      if (response.status === 429) {
        log('STT', 'Rate limited, waiting 5s...');
        await sleep(5000);
        continue;
      }
      throw new Error(`STT poll error (${response.status})`);
    }

    const data = await response.json();
    const state = data.data?.state;

    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      const parsed = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
      log('STT', `Completed!`, { attempt });
      return parsed;
    }

    if (state === 'fail') {
      const failMsg = data.data?.failMsg || 'unknown error';
      throw new Error(`STT task failed: ${failMsg}`);
    }

    if (attempt % 5 === 0) {
      log('STT', `Still polling... (attempt ${attempt + 1}/${maxAttempts}, state: ${state})`);
    }
  }

  throw new Error(`STT polling timed out after ${maxAttempts} attempts`);
}

// ─── Step 7: Parse and Validate ─────────────────────────────────────────────

function parseTranscriptionResult(raw) {
  // Mirrors transcriptionService.ts parseTranscriptionResult()
  // Kie wraps ElevenLabs response in 'resultObject' — unwrap if present
  const data = raw.resultObject || raw;
  const fullText = data.text || '';
  const languageCode = data.language_code || 'unknown';
  const rawWords = data.words || [];

  const segments = [];
  let currentWords = [];
  let sentenceText = '';

  // Filter out spacing-only entries from ElevenLabs Scribe response
  const significantWords = rawWords.filter(w => w.type !== 'spacing');

  for (let idx = 0; idx < significantWords.length; idx++) {
    const w = significantWords[idx];
    const wordText = w.text || w.word || '';
    const startTime = w.start ?? w.start_time ?? 0;
    const endTime = w.end ?? w.end_time ?? 0;
    const confidence = w.confidence ?? 1;

    currentWords.push({ word: wordText, startTime, endTime, confidence });
    sentenceText += (idx > 0 ? ' ' : '') + wordText;

    const trimmed = wordText.trim();
    if (/[.!?。！？]$/.test(trimmed) || idx === significantWords.length - 1) {
      if (currentWords.length > 0 && sentenceText.trim()) {
        segments.push({
          text: sentenceText.trim(),
          startTime: currentWords[0].startTime,
          endTime: currentWords[currentWords.length - 1].endTime,
          words: [...currentWords],
        });
      }
      currentWords = [];
      sentenceText = '';
    }
  }

  if (segments.length === 0 && fullText.trim()) {
    const duration = data.duration || 0;
    segments.push({
      text: fullText.trim(),
      startTime: 0,
      endTime: duration,
    });
  }

  const duration = segments.length > 0
    ? segments[segments.length - 1].endTime
    : (data.duration || 0);

  return { text: fullText, language: languageCode, segments, duration };
}

function validateResult(result, rawSttResponse) {
  const errors = [];
  const warnings = [];

  // --- Structural validation ---
  if (!result.text || typeof result.text !== 'string') {
    errors.push('result.text is missing or not a string');
  }
  if (!result.language || typeof result.language !== 'string') {
    errors.push('result.language is missing or not a string');
  }
  if (!Array.isArray(result.segments) || result.segments.length === 0) {
    errors.push('result.segments is empty or not an array');
  }
  if (typeof result.duration !== 'number' || result.duration <= 0) {
    errors.push(`result.duration is invalid: ${result.duration}`);
  }

  // --- Segment validation ---
  for (let i = 0; i < result.segments.length; i++) {
    const seg = result.segments[i];
    if (!seg.text || typeof seg.text !== 'string') {
      errors.push(`segments[${i}].text is missing`);
    }
    if (typeof seg.startTime !== 'number') {
      errors.push(`segments[${i}].startTime is not a number`);
    }
    if (typeof seg.endTime !== 'number') {
      errors.push(`segments[${i}].endTime is not a number`);
    }
    if (seg.endTime < seg.startTime) {
      errors.push(`segments[${i}].endTime (${seg.endTime}) < startTime (${seg.startTime})`);
    }
    // Check timestamps are monotonically increasing
    if (i > 0 && seg.startTime < result.segments[i - 1].startTime) {
      warnings.push(`segments[${i}].startTime (${seg.startTime}) < segments[${i - 1}].startTime (${result.segments[i - 1].startTime}) — non-monotonic`);
    }
    // Word-level validation
    if (seg.words && Array.isArray(seg.words)) {
      for (let j = 0; j < seg.words.length; j++) {
        const w = seg.words[j];
        if (!w.word && w.word !== '') {
          errors.push(`segments[${i}].words[${j}].word is missing`);
        }
        if (typeof w.startTime !== 'number' || typeof w.endTime !== 'number') {
          errors.push(`segments[${i}].words[${j}] has invalid timestamps`);
        }
      }
    }
  }

  // --- Content validation (fuzzy — Korean TTS/STT is not 100% exact) ---
  const normalizedText = result.text.replace(/\s+/g, '');
  const normalizedInput = TEST_TEXT.replace(/\s+/g, '').replace(/[,.\s]/g, '');

  // Check if key Korean words appear in the transcription
  const keyWords = ['안녕하세요', '나레이션', '음성', '날씨'];
  let matchedKeywords = 0;
  for (const kw of keyWords) {
    if (normalizedText.includes(kw)) {
      matchedKeywords++;
    }
  }

  if (matchedKeywords === 0) {
    errors.push(`No Korean keywords from original text found in transcription. Got: "${result.text}"`);
  } else if (matchedKeywords < 2) {
    warnings.push(`Only ${matchedKeywords}/${keyWords.length} keywords matched. Transcription: "${result.text}"`);
  }

  // --- Language check ---
  if (result.language && !['ko', 'kor', 'korean', 'ko-KR'].includes(result.language.toLowerCase())) {
    warnings.push(`Language detected as "${result.language}", expected Korean variant`);
  }

  return { errors, warnings, matchedKeywords, totalKeywords: keyWords.length };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  TTS → STT Integration Test');
  console.log('  Text: ' + TEST_TEXT);
  console.log('  Voice: ' + TEST_VOICE);
  console.log('='.repeat(70));
  console.log();

  const startTime = Date.now();

  try {
    // Step 1: Create TTS task
    console.log('--- STEP 1: Generate TTS Audio ---');
    const ttsTaskId = await createTtsTask();

    // Step 2: Poll TTS
    console.log('\n--- STEP 2: Poll TTS Result ---');
    const audioUrl = await pollTtsTask(ttsTaskId);

    // Step 3: Download audio
    console.log('\n--- STEP 3: Download Audio ---');
    const { localPath, buffer } = await downloadAudio(audioUrl);

    // Step 4: Upload to Cloudinary
    console.log('\n--- STEP 4: Upload to Cloudinary ---');
    const cloudinaryUrl = await uploadToCloudinary(buffer, 'test-tts-korean.mp3');

    // Step 5: Create STT task
    console.log('\n--- STEP 5: Create STT Task ---');
    const sttTaskId = await createSttTask(cloudinaryUrl);

    // Step 6: Poll STT
    console.log('\n--- STEP 6: Poll STT Result ---');
    const rawSttResult = await pollSttTask(sttTaskId);

    // Step 7: Parse and validate
    console.log('\n--- STEP 7: Parse & Validate ---');
    console.log('\nRaw STT response:');
    console.log(JSON.stringify(rawSttResult, null, 2));

    const parsedResult = parseTranscriptionResult(rawSttResult);

    console.log('\nParsed result:');
    console.log(`  text: "${parsedResult.text}"`);
    console.log(`  language: "${parsedResult.language}"`);
    console.log(`  duration: ${parsedResult.duration}s`);
    console.log(`  segments: ${parsedResult.segments.length}`);

    for (let i = 0; i < parsedResult.segments.length; i++) {
      const seg = parsedResult.segments[i];
      const wordCount = seg.words ? seg.words.length : 0;
      console.log(`    [${i}] ${seg.startTime.toFixed(2)}s - ${seg.endTime.toFixed(2)}s: "${seg.text}" (${wordCount} words)`);
    }

    // Validate
    const validation = validateResult(parsedResult, rawSttResult);

    console.log('\n--- VALIDATION RESULTS ---');
    console.log(`  Keywords matched: ${validation.matchedKeywords}/${validation.totalKeywords}`);

    if (validation.warnings.length > 0) {
      console.log(`\n  Warnings (${validation.warnings.length}):`);
      for (const w of validation.warnings) {
        console.log(`    [WARN] ${w}`);
      }
    }

    if (validation.errors.length > 0) {
      console.log(`\n  Errors (${validation.errors.length}):`);
      for (const e of validation.errors) {
        console.log(`    [FAIL] ${e}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(70));

    if (validation.errors.length === 0) {
      console.log(`  TEST PASSED (${elapsed}s elapsed)`);
      console.log(`  - TTS generated and downloaded to: ${localPath}`);
      console.log(`  - Cloudinary URL: ${cloudinaryUrl}`);
      console.log(`  - Transcription: "${parsedResult.text}"`);
      console.log(`  - ${parsedResult.segments.length} segment(s), duration: ${parsedResult.duration.toFixed(2)}s`);
      console.log(`  - Keywords: ${validation.matchedKeywords}/${validation.totalKeywords} matched`);
    } else {
      console.log(`  TEST FAILED (${elapsed}s elapsed)`);
      console.log(`  ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`);
    }

    console.log('='.repeat(70));

    // Cleanup local file
    // (Leave it for manual inspection — user can delete later)

    process.exit(validation.errors.length > 0 ? 1 : 0);

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[FATAL] Test crashed after ${elapsed}s:`);
    console.error(err);
    process.exit(2);
  }
}

main();
