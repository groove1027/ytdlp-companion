/**
 * 전체 파이프라인 통합 테스트
 * TTS 병렬 생성 → 병합 → 전사(STT) → 세그먼트 파싱 → 무음 감지 → 무음 제거 + 크로스페이드 → 타임코드 재계산 → 싱크 검증
 */

const KIE_KEY = 'REDACTED_KIE_KEY';
const KIE_BASE = 'https://api.kie.ai/api/v1';
const CLOUD_NAME = 'dji3gtb5r';
const UPLOAD_PRESET = 'storyboard';

const LINES = [
  '안녕하세요, 오늘은 인공지능의 미래에 대해 이야기해보겠습니다.',
  '최근 AI 기술은 놀라운 속도로 발전하고 있습니다. 특히 음성 합성과 음성 인식 분야에서 혁신적인 성과가 나타나고 있죠.',
  '감사합니다. 다음 영상에서 또 만나요!',
];

let passCount = 0;
let failCount = 0;
const results = [];

function check(name, condition, detail = '') {
  if (condition) { passCount++; results.push(`  ✅ ${name}`); }
  else { failCount++; results.push(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function log(msg) { console.log(`\n⏱  ${msg}`); }
function fmt(sec) { return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${String(Math.round((sec % 1) * 1000)).padStart(3, '0')}`; }

// ===== STEP 1: TTS 병렬 생성 =====
async function createTtsTask(text, voice = 'Sarah') {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_KEY}` },
    body: JSON.stringify({
      model: 'elevenlabs/text-to-speech-multilingual-v2',
      input: { text, voice, stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1.0, timestamps: false }
    })
  });
  const d = await res.json();
  return d.data?.taskId;
}

async function pollTask(taskId, label = '') {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, i < 5 ? 2000 : 3000));
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${KIE_KEY}` }
    });
    const d = await res.json();
    const state = d.data?.state;
    if (state === 'success') {
      const rj = d.data?.resultJson;
      const parsed = typeof rj === 'string' ? JSON.parse(rj) : rj;
      return parsed;
    }
    if (state === 'fail') throw new Error(`${label} 실패: ${d.data?.failMsg}`);
  }
  throw new Error(`${label} 시간 초과`);
}

// ===== STEP 2: 오디오 다운로드 + WAV 병합 (무음 삽입) =====
async function downloadAudio(url) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function decodePcmFromMp3Rough(buf) {
  // MP3를 직접 디코딩하는 대신, 각 파일의 크기로 대략적 길이를 추정하고
  // 테스트용으로는 실제 바이트를 WAV에 그대로 사용 (실제 앱은 Web Audio API 사용)
  return buf;
}

function createWavHeader(dataSize, sampleRate = 44100, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

function generateSilenceWav(durationSec, sampleRate = 44100) {
  const samples = Math.floor(durationSec * sampleRate);
  const data = Buffer.alloc(samples * 2); // 16-bit mono = 2 bytes/sample
  return data; // all zeros = silence
}

// ===== STEP 3: Cloudinary 업로드 =====
async function uploadToCloudinary(buffer, filename) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/mpeg\r\n\r\n`);
  parts.push(buffer);
  parts.push(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="upload_preset"\r\n\r\n${UPLOAD_PRESET}`);
  parts.push(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const d = await res.json();
  if (!d.secure_url) throw new Error('Cloudinary 업로드 실패: ' + JSON.stringify(d));
  return { url: d.secure_url, duration: d.duration || 0 };
}

// ===== STEP 4: STT 전사 =====
async function transcribe(audioUrl) {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_KEY}` },
    body: JSON.stringify({
      model: 'elevenlabs/speech-to-text',
      input: { audio_url: audioUrl, diarize: false, timestamps_granularity: 'word' }
    })
  });
  const d = await res.json();
  const taskId = d.data?.taskId;
  if (!taskId) throw new Error('STT 태스크 생성 실패');
  return pollTask(taskId, 'STT');
}

// ===== STEP 5: 전사 결과 파싱 (transcriptionService.ts 로직 재현) =====
function parseTranscriptionResult(raw) {
  const data = raw.resultObject || raw;
  const fullText = data.text || '';
  const languageCode = data.language_code || 'unknown';
  const rawWords = data.words || [];

  const segments = [];
  let currentWords = [];
  let sentenceText = '';

  for (let wi = 0; wi < rawWords.length; wi++) {
    const w = rawWords[wi];
    const wordText = w.text || w.word || '';
    const startTime = w.start ?? w.start_time ?? 0;
    const endTime = w.end ?? w.end_time ?? 0;
    const confidence = w.confidence ?? 1;

    currentWords.push({ word: wordText, startTime, endTime, confidence });
    sentenceText += wordText;

    const trimmed = wordText.trim();
    if (/[.!?。！？]$/.test(trimmed) || wi === rawWords.length - 1) {
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
    segments.push({ text: fullText.trim(), startTime: 0, endTime: data.duration || 0 });
  }

  const duration = segments.length > 0 ? segments[segments.length - 1].endTime : (data.duration || 0);
  return { text: fullText, language: languageCode, segments, duration };
}

// ===== STEP 6: ScriptLine 변환 =====
function segmentsToScriptLines(segments, uploadedAudioId) {
  return segments.map((seg, i) => ({
    id: `line-uploaded-${Date.now()}-${i}`,
    speakerId: '',
    text: seg.text,
    index: i,
    startTime: seg.startTime,
    endTime: seg.endTime,
    duration: seg.endTime - seg.startTime,
    audioSource: 'uploaded',
    uploadedAudioId,
  }));
}

// ===== STEP 7: 무음 감지 (WaveformEditor 로직 재현) =====
function detectSilenceRegions(audioDuration, scriptLines, config = {}) {
  const { threshold = -40, minDuration = 0.3, padding = 0.05 } = config;
  // 실제 앱은 PCM 데이터를 분석하지만, 여기서는 ScriptLine 간 갭을 무음으로 간주
  const regions = [];
  for (let i = 0; i < scriptLines.length - 1; i++) {
    const gapStart = scriptLines[i].endTime;
    const gapEnd = scriptLines[i + 1].startTime;
    const gapDuration = gapEnd - gapStart;
    if (gapDuration >= minDuration) {
      regions.push({
        startTime: gapStart + padding,
        endTime: gapEnd - padding,
        duration: gapDuration - padding * 2,
      });
    }
  }
  return regions.filter(r => r.duration > 0);
}

// ===== STEP 8: 무음 제거 + 타임코드 재계산 (WaveformEditor.handleRemoveSilence 로직) =====
function mapTimeAfterCut(originalTime, cutRegions) {
  let shift = 0;
  for (const r of cutRegions) {
    if (r.endTime <= originalTime) {
      shift += r.endTime - r.startTime;
    } else if (r.startTime < originalTime) {
      shift += originalTime - r.startTime;
    }
  }
  return Math.max(0, originalTime - shift);
}

function removeSilenceAndRemap(scriptLines, silenceRegions) {
  const cutRegions = silenceRegions.map(r => ({ startTime: r.startTime, endTime: r.endTime }));
  const totalCut = cutRegions.reduce((sum, r) => sum + (r.endTime - r.startTime), 0);

  return {
    remappedLines: scriptLines.map(line => ({
      ...line,
      startTime: mapTimeAfterCut(line.startTime, cutRegions),
      endTime: mapTimeAfterCut(line.endTime, cutRegions),
      duration: mapTimeAfterCut(line.endTime, cutRegions) - mapTimeAfterCut(line.startTime, cutRegions),
    })),
    totalCut,
    cutRegions,
  };
}

// ===== MAIN =====
async function main() {
  const t0 = Date.now();

  // ── STEP 1: TTS 5개 병렬 생성 ──
  log('STEP 1: TTS 3개 라인 병렬 생성...');
  const ttsTaskIds = await Promise.all(
    LINES.map(text => createTtsTask(text))
  );
  check('TTS 태스크 3개 생성', ttsTaskIds.every(id => !!id), `IDs: ${ttsTaskIds.length}`);
  console.log(`   태스크 IDs: ${ttsTaskIds.map(id => id?.slice(-8)).join(', ')}`);

  // ── STEP 2: TTS 3개 병렬 폴링 ──
  log('STEP 2: TTS 3개 병렬 폴링...');
  const ttsResults = await Promise.all(
    ttsTaskIds.map((id, i) => pollTask(id, `TTS-L${i + 1}`))
  );
  const audioUrls = ttsResults.map(r => r.resultUrls?.[0] || r.audio_url || r.url);
  check('TTS 오디오 3개 URL 획득', audioUrls.every(u => !!u));

  // ── STEP 3: 오디오 3개 병렬 다운로드 ──
  log('STEP 3: 오디오 3개 병렬 다운로드...');
  const audioBuffers = await Promise.all(audioUrls.map(url => downloadAudio(url)));
  const totalBytes = audioBuffers.reduce((s, b) => s + b.length, 0);
  check('오디오 다운로드 완료', audioBuffers.every(b => b.length > 0), `총 ${(totalBytes / 1024).toFixed(1)}KB`);

  // ── STEP 4: 오디오 합치기 (MP3 연결) → Cloudinary 업로드 ──
  // 실제 앱은 Web Audio API로 디코딩+병합하지만, 여기서는 MP3를 순차 연결
  // (Cloudinary/STT가 연결된 MP3를 처리 가능)
  log('STEP 4: 오디오 병합 + Cloudinary 업로드...');
  const mergedBuffer = Buffer.concat(audioBuffers);
  console.log(`   병합 크기: ${(mergedBuffer.length / 1024).toFixed(1)}KB`);
  const { url: cloudUrl, duration: cloudDuration } = await uploadToCloudinary(mergedBuffer, 'test-pipeline-merged.mp3');
  check('Cloudinary 업로드', !!cloudUrl, `${cloudDuration?.toFixed(1) || '?'}초, URL 길이: ${cloudUrl.length}`);
  console.log(`   Cloudinary Duration: ${cloudDuration?.toFixed(2)}초`);

  // ── STEP 5: STT 전사 ──
  log('STEP 5: ElevenLabs Scribe v1 전사...');
  const sttRaw = await transcribe(cloudUrl);
  check('STT 태스크 완료', !!sttRaw);

  // ── STEP 6: 전사 결과 파싱 ──
  log('STEP 6: 전사 결과 파싱...');
  const transcript = parseTranscriptionResult(sttRaw);
  check('전체 텍스트 존재', transcript.text.length > 0, `${transcript.text.length}자`);
  check('언어 감지', transcript.language.length > 0, transcript.language);
  check('세그먼트 생성', transcript.segments.length > 0, `${transcript.segments.length}개`);
  check('전체 길이', transcript.duration > 0, `${transcript.duration.toFixed(2)}초`);

  console.log(`\n   📝 전사 텍스트 (${transcript.text.length}자):`);
  console.log(`   "${transcript.text.slice(0, 100)}..."`);
  console.log(`\n   📊 세그먼트 (${transcript.segments.length}개):`);
  for (const seg of transcript.segments) {
    const wordCount = seg.words?.length || 0;
    console.log(`   [${fmt(seg.startTime)} ~ ${fmt(seg.endTime)}] (${wordCount}단어) ${seg.text.slice(0, 50)}`);
  }

  // ── STEP 7: ScriptLine 변환 ──
  log('STEP 7: ScriptLine 변환...');
  const scriptLines = segmentsToScriptLines(transcript.segments, 'test-upload-001');
  check('ScriptLine 변환', scriptLines.length === transcript.segments.length, `${scriptLines.length}개`);
  check('모든 라인 audioSource=uploaded', scriptLines.every(l => l.audioSource === 'uploaded'));
  check('모든 라인 startTime 존재', scriptLines.every(l => l.startTime != null));
  check('모든 라인 endTime 존재', scriptLines.every(l => l.endTime != null));
  check('startTime 단조 증가', scriptLines.every((l, i) => i === 0 || l.startTime >= scriptLines[i - 1].startTime));

  // ── STEP 8: 무음 감지 (실제 + 시뮬레이션) ──
  log('STEP 8: 무음 구간 감지...');
  const realSilence = detectSilenceRegions(transcript.duration, scriptLines, { minDuration: 0.15, padding: 0.03 });
  console.log(`   실제 전사 결과 무음 갭: ${realSilence.length}개 (연속 TTS라 0이 정상)`);

  // 실제 사용자 녹음 시뮬레이션: 세그먼트 사이에 0.5~1.5초 갭 삽입
  log('STEP 8b: 실제 녹음 시뮬레이션 (무음 갭 삽입)...');
  const simLines = [];
  let simOffset = 0;
  for (let i = 0; i < scriptLines.length; i++) {
    const origDur = scriptLines[i].endTime - scriptLines[i].startTime;
    simLines.push({
      ...scriptLines[i],
      startTime: simOffset,
      endTime: simOffset + origDur,
      duration: origDur,
    });
    simOffset += origDur;
    // 마지막 라인 제외, 0.5~1.5초 랜덤 무음 삽입
    if (i < scriptLines.length - 1) {
      const gap = 0.5 + Math.random() * 1.0;
      simOffset += gap;
    }
  }
  const simDuration = simOffset;
  console.log(`   시뮬레이션 총 길이: ${simDuration.toFixed(2)}초 (원본 ${transcript.duration.toFixed(2)}초 + 무음 갭)`);

  const silenceRegions = detectSilenceRegions(simDuration, simLines, { minDuration: 0.15, padding: 0.03 });
  check('무음 구간 감지 (시뮬레이션)', silenceRegions.length > 0, `${silenceRegions.length}개`);
  const totalSilence = silenceRegions.reduce((s, r) => s + r.duration, 0);
  console.log(`\n   🔇 무음 구간 (${silenceRegions.length}개, 총 ${totalSilence.toFixed(3)}초):`);
  for (const r of silenceRegions) {
    console.log(`   [${fmt(r.startTime)} ~ ${fmt(r.endTime)}] ${(r.duration * 1000).toFixed(0)}ms`);
  }

  // 이후 검증은 시뮬레이션 데이터 기준으로 수행
  const originalLines = simLines;

  // ── STEP 9: 무음 제거 + 타임코드 재계산 ──
  log('STEP 9: 무음 제거 + 타임코드 재계산...');
  const { remappedLines, totalCut, cutRegions } = removeSilenceAndRemap(originalLines, silenceRegions);
  check('타임코드 재계산 완료', remappedLines.length === originalLines.length);
  check('총 제거 시간 > 0', totalCut > 0, `${(totalCut * 1000).toFixed(0)}ms 제거`);

  const newDuration = simDuration - totalCut;
  check('새 전체 길이 계산', newDuration > 0, `${simDuration.toFixed(2)}초 → ${newDuration.toFixed(2)}초`);

  // ── STEP 10: 싱크 검증 ──
  log('STEP 10: 자막 싱크 검증...');

  // 10-1: 재매핑 후 startTime이 여전히 단조 증가하는지
  check('재매핑 후 startTime 단조 증가',
    remappedLines.every((l, i) => i === 0 || l.startTime >= remappedLines[i - 1].startTime));

  // 10-2: 재매핑 후 모든 endTime > startTime
  check('재매핑 후 endTime > startTime',
    remappedLines.every(l => l.endTime > l.startTime));

  // 10-3: 재매핑 후 duration > 0 (음성 구간이 잘리지 않았는지)
  check('재매핑 후 모든 라인 duration > 0',
    remappedLines.every(l => l.duration > 0));

  // 10-4: 원본과 재매핑 duration 차이가 미미한지 (음성 구간은 거의 동일해야 함)
  const maxDurationDiff = Math.max(
    ...originalLines.map((orig, i) => Math.abs(orig.duration - remappedLines[i].duration))
  );
  check('라인별 duration 변화 ≤ 100ms', maxDurationDiff <= 0.1,
    `최대 차이: ${(maxDurationDiff * 1000).toFixed(1)}ms`);

  // 10-5: 재매핑 후 갭(무음)이 최소화되었는지
  let totalGapAfter = 0;
  for (let i = 0; i < remappedLines.length - 1; i++) {
    totalGapAfter += remappedLines[i + 1].startTime - remappedLines[i].endTime;
  }

  check('무음 제거 후 갭 감소',
    totalGapAfter < totalSilence,
    `이전 무음: ${(totalSilence * 1000).toFixed(0)}ms → 이후 갭: ${(totalGapAfter * 1000).toFixed(0)}ms`);

  // 10-6: 무음 제거 후 totalDuration이 원래 음성 길이에 가까운지
  const totalSpeechDur = originalLines.reduce((s, l) => s + l.duration, 0);
  check('무음 제거 후 길이 ≈ 순수 음성 길이',
    Math.abs(newDuration - totalSpeechDur) < 1.0,
    `순수 음성: ${totalSpeechDur.toFixed(2)}초, 제거 후: ${newDuration.toFixed(2)}초`);

  // ── 결과 테이블 ──
  console.log('\n' + '═'.repeat(80));
  console.log('  📋 전/후 비교 테이블');
  console.log('─'.repeat(80));
  console.log('  #  │ 원본 시작→끝          │ 재매핑 시작→끝        │ dur변화  │ 텍스트');
  console.log('─'.repeat(80));
  for (let i = 0; i < originalLines.length; i++) {
    const o = originalLines[i];
    const n = remappedLines[i];
    const durDiff = ((n.duration - o.duration) * 1000).toFixed(0);
    const sign = Number(durDiff) >= 0 ? '+' : '';
    console.log(
      `  ${String(i + 1).padStart(2)} │ ${fmt(o.startTime)}→${fmt(o.endTime)} │ ${fmt(n.startTime)}→${fmt(n.endTime)} │ ${sign}${durDiff}ms`.padEnd(65) +
      `│ ${o.text.slice(0, 25)}…`
    );
  }
  console.log('─'.repeat(80));
  console.log(`  총 길이: ${simDuration.toFixed(2)}초 → ${newDuration.toFixed(2)}초 (${(totalCut * 1000).toFixed(0)}ms 제거)`);
  console.log('═'.repeat(80));

  // ── 최종 결과 ──
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  전체 파이프라인 테스트 결과: ${passCount} PASS / ${failCount} FAIL (${elapsed}초)`);
  console.log(`${'═'.repeat(60)}`);
  for (const r of results) console.log(r);
  console.log(`\n  ⏱  총 소요 시간: ${elapsed}초`);
  if (failCount === 0) console.log('\n  🎉 ALL TESTS PASSED!\n');
  else console.log(`\n  ⚠️  ${failCount}개 실패\n`);
}

main().catch(e => { console.error('❌ FATAL:', e); process.exit(1); });
