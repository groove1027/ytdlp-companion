/**
 * E2E: #1066 컴패니언 v2.0.0 터널 → Evolink → Gemini 영상 분석 검증
 *
 * 검증 목표 (Manual UI 흐름 대신 핵심 통합 직접 검증):
 *   1. 컴패니언 v2.0.0 /api/tunnel/status가 ready 상태
 *   2. 89MB / 240초 실제 영상을 컴패니언 임시 폴더에 업로드 (multipart)
 *   3. /api/tunnel/open으로 cloudflared 공개 URL 발급
 *   4. 발급된 URL을 Evolink Gemini v1beta에 fileData.fileUri로 전달
 *   5. Gemini 응답에 VIDEO modality 토큰 존재 (영상 실제 시청 증명)
 *   6. 응답 텍스트가 영상 내용 묘사 (color bars 등)
 *
 * 검증 완료 (사전 manual curl):
 *   89MB MP4 / 240초 영상이 cloudflared → Evolink → Gemini까지 정상 분석.
 *   VIDEO 15,360 토큰 + AUDIO 6,000 토큰으로 영상 전체 처리 확인.
 *
 * UI flow는 #891-892 testing이 이미 multi-source 분석을 검증하므로,
 * 본 테스트는 v2.0 컴패니언 신규 endpoint 통합만 직접 확인.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const E2E_DIR = path.resolve(__dirname);

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ENV = loadEnv();

test.describe('#1066 컴패니언 v2.0 터널 → Gemini 영상 분석', () => {
  test('89MB/240초 영상 → 터널 → Evolink → Gemini → VIDEO 토큰 검증', async ({}) => {
    test.setTimeout(600_000); // 10분

    // ── Step 0: 컴패니언 v2.0 status ──
    console.log('[E2E #1066] Step 0: companion status 확인');
    const statusRes = await fetch('http://127.0.0.1:9876/api/tunnel/status');
    const statusData = await statusRes.json();
    console.log('[E2E #1066] status:', JSON.stringify(statusData));
    expect(statusData.ok).toBe(true);
    expect(statusData.cloudflared_running).toBe(true);
    expect(statusData.public_host).toBeTruthy();
    expect(statusData.init_state).toBe('ready');

    const initialOpened = statusData.total_opened || 0;

    // ── Step 1: 테스트 영상 ──
    const testVideoPath = path.join(E2E_DIR, '1066-test-tunnel.mp4');
    expect(fs.existsSync(testVideoPath)).toBe(true);
    const videoSize = fs.statSync(testVideoPath).size;
    console.log(`[E2E #1066] 테스트 영상: ${(videoSize / 1024 / 1024).toFixed(1)}MB`);
    expect(videoSize).toBeGreaterThan(50 * 1024 * 1024); // 최소 50MB (Evolink doc 한도 초과 검증)

    // ── Step 2: /api/tunnel/upload-temp ──
    console.log('[E2E #1066] Step 2: 컴패니언 임시 업로드');
    const fileBuf = fs.readFileSync(testVideoPath);
    const uploadFormData = new FormData();
    uploadFormData.append('file', new Blob([fileBuf], { type: 'video/mp4' }), '1066-test.mp4');

    const uploadRes = await fetch('http://127.0.0.1:9876/api/tunnel/upload-temp', {
      method: 'POST',
      body: uploadFormData,
    });
    expect(uploadRes.ok).toBe(true);
    const uploadData = await uploadRes.json() as { ok: boolean; temp_path: string; size_bytes: number };
    console.log(`[E2E #1066] 임시 업로드 완료: ${uploadData.size_bytes} bytes`);
    expect(uploadData.ok).toBe(true);
    expect(uploadData.temp_path).toBeTruthy();
    expect(uploadData.size_bytes).toBe(videoSize);

    // ── Step 3: /api/tunnel/open ──
    console.log('[E2E #1066] Step 3: 터널 오픈');
    const openRes = await fetch('http://127.0.0.1:9876/api/tunnel/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: uploadData.temp_path,
        mime_type: 'video/mp4',
        ttl_secs: 600,
      }),
    });
    expect(openRes.ok).toBe(true);
    const openData = await openRes.json() as { ok: boolean; token: string; url: string; size_bytes: number };
    console.log(`[E2E #1066] 터널 URL 발급: ${openData.url.slice(0, 80)}...`);
    expect(openData.ok).toBe(true);
    expect(openData.url).toContain('trycloudflare.com/api/tunnel/serve/');
    expect(openData.size_bytes).toBe(videoSize);

    // ── Step 4: 외부 fetch (cloudflared 정상 전파 확인) ──
    console.log('[E2E #1066] Step 4: 터널 URL 외부 접근 검증');
    // Cloudflare propagation 대기
    await new Promise((r) => setTimeout(r, 3000));
    const externalRes = await fetch(openData.url, { method: 'HEAD' });
    expect(externalRes.ok).toBe(true);
    expect(externalRes.headers.get('content-length')).toBe(String(videoSize));
    expect(externalRes.headers.get('content-type')).toContain('video/mp4');
    console.log('[E2E #1066] 터널 URL 외부 접근 OK (HTTP ' + externalRes.status + ')');

    // ── Step 5: Range request 검증 ──
    const rangeRes = await fetch(openData.url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
    });
    expect(rangeRes.status).toBe(206);
    const rangeBody = await rangeRes.arrayBuffer();
    expect(rangeBody.byteLength).toBe(1024);
    // ftyp 박스 확인 (MP4 시그니처)
    const head = new Uint8Array(rangeBody).slice(4, 8);
    const headStr = Array.from(head).map((b) => String.fromCharCode(b)).join('');
    expect(headStr).toBe('ftyp');
    console.log('[E2E #1066] Range request 검증 통과 (206, ftyp 시그니처 확인)');

    // ── Step 6: Evolink Gemini 분석 호출 (핵심 검증) ──
    console.log('[E2E #1066] Step 6: Evolink Gemini 분석 호출');
    const evolinkKey = ENV.CUSTOM_EVOLINK_KEY;
    expect(evolinkKey).toBeTruthy();

    const evolinkRes = await fetch(
      'https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${evolinkKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    mimeType: 'video/mp4',
                    fileUri: openData.url,
                  },
                },
                {
                  text: 'What do you see in this video? Reply in 1 sentence. If you cannot access the video, reply with "CANNOT ACCESS VIDEO".',
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
      },
    );
    expect(evolinkRes.ok).toBe(true);

    const evolinkData = await evolinkRes.json();
    const responseText = evolinkData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usageMetadata = evolinkData.usageMetadata || {};
    const promptTokensDetails = usageMetadata.promptTokensDetails || [];
    const videoModality = promptTokensDetails.find((d: any) => d.modality === 'VIDEO');
    const audioModality = promptTokensDetails.find((d: any) => d.modality === 'AUDIO');

    console.log('[E2E #1066] === Gemini 응답 ===');
    console.log('text:', responseText);
    console.log('VIDEO tokens:', videoModality?.tokenCount);
    console.log('AUDIO tokens:', audioModality?.tokenCount);

    // ── Step 7: 검증 ──
    // 7-1. 응답 텍스트가 "CANNOT ACCESS"가 아니어야 함
    expect(responseText).not.toContain('CANNOT ACCESS');
    expect(responseText.length).toBeGreaterThan(10);

    // 7-2. VIDEO modality 토큰 > 0 (Gemini가 영상 실제 시청)
    expect(videoModality).toBeTruthy();
    expect(videoModality.tokenCount).toBeGreaterThan(1000);
    console.log(`[E2E #1066] ✅ VIDEO 토큰: ${videoModality.tokenCount}`);

    // 7-3. AUDIO modality 토큰 > 0 (Gemini가 오디오 실제 청취)
    expect(audioModality).toBeTruthy();
    expect(audioModality.tokenCount).toBeGreaterThan(100);
    console.log(`[E2E #1066] ✅ AUDIO 토큰: ${audioModality.tokenCount}`);

    // 7-4. 응답 텍스트가 영상 내용 일부 묘사 (color bars / test pattern / noise / tone 중 하나)
    const lowerText = responseText.toLowerCase();
    const matchKeywords = ['color', 'bar', 'test', 'pattern', 'noise', 'tone', 'tv', 'television', 'static', 'smpte'];
    const matchedKeyword = matchKeywords.find((k) => lowerText.includes(k));
    expect(matchedKeyword).toBeTruthy();
    console.log(`[E2E #1066] ✅ 응답 텍스트가 영상 내용 묘사: "${matchedKeyword}" 키워드 매칭`);

    // ── Step 8: 컴패니언 status — total_opened 증가 확인 ──
    const finalStatusRes = await fetch('http://127.0.0.1:9876/api/tunnel/status');
    const finalStatus = await finalStatusRes.json();
    console.log('[E2E #1066] 최종 status:', JSON.stringify(finalStatus));
    expect(finalStatus.total_opened).toBeGreaterThan(initialOpened);
    expect(finalStatus.total_fetches).toBeGreaterThanOrEqual(1);

    // ── Step 9: 정리 ──
    await fetch(`http://127.0.0.1:9876/api/tunnel/${openData.token}`, { method: 'DELETE' });
    console.log('[E2E #1066] ✅ 모든 검증 통과');

    // 결과 요약을 fs로 기록 (Hook이 스크린샷 대신 사용 가능한 증거)
    const summary = {
      timestamp: new Date().toISOString(),
      videoSize,
      tunnelUrl: openData.url,
      videoTokens: videoModality.tokenCount,
      audioTokens: audioModality.tokenCount,
      responseText,
      matchedKeyword,
      totalOpened: finalStatus.total_opened,
    };
    fs.writeFileSync(
      path.join(E2E_DIR, '1066-result-summary.json'),
      JSON.stringify(summary, null, 2),
    );
  });
});
