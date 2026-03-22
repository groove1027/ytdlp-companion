#!/usr/bin/env node
/**
 * Google ImageFX + Whisk 전체 기능 테스트
 * - Imagen 4 (ImageFX)
 * - Imagen 3.5 (ImageFX)
 * - Whisk 이미지 생성
 * - Whisk 리파인 (이미지 수정)
 * - Whisk Veo 3.1 (이미지→영상)
 */

const cookie = process.argv[2] || process.env.GOOGLE_COOKIE;
if (!cookie) { console.error('쿠키를 인자로 전달하세요'); process.exit(1); }

const HEADERS = {
  'Origin': 'https://labs.google',
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/tools/image-fx',
};

const { writeFileSync, mkdirSync, existsSync } = await import('fs');
const dir = './test/output';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

// ─── 인증 ───
async function auth() {
  console.log('🔐 세션 인증 중...');
  const res = await fetch('https://labs.google/fx/api/auth/session', {
    headers: { ...HEADERS, 'Cookie': cookie },
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('인증 실패: ' + JSON.stringify(data).slice(0, 200));
  console.log(`   ✅ ${data.user?.name} (${data.user?.email})`);
  return data.access_token;
}

// ─── ImageFX 이미지 생성 ───
async function imageFX(token, prompt, model, aspect, label) {
  console.log(`\n🎨 [${label}] ImageFX 생성 중...`);
  console.log(`   모델: ${model} | 프롬프트: "${prompt.slice(0, 50)}..."`);

  const res = await fetch('https://aisandbox-pa.googleapis.com/v1:runImageFx', {
    method: 'POST',
    headers: { ...HEADERS, 'Cookie': cookie, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      userInput: { candidatesCount: 1, prompts: [prompt], seed: 0 },
      clientContext: { sessionId: `;${Date.now()}`, tool: 'IMAGE_FX' },
      modelInput: { modelNameType: model },
      aspectRatio: aspect,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log(`   ❌ 실패 (${res.status}): ${err.slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const img = data?.imagePanels?.[0]?.generatedImages?.[0];
  if (!img) { console.log(`   ❌ 이미지 없음: ${JSON.stringify(data).slice(0, 300)}`); return null; }

  const filename = `${label}.png`;
  let b64 = img.encodedImage || '';
  if (b64.startsWith('data:')) b64 = b64.split(',')[1];
  writeFileSync(`${dir}/${filename}`, Buffer.from(b64, 'base64'));

  console.log(`   ✅ 성공! ${(b64.length / 1024).toFixed(0)}KB → ${dir}/${filename}`);
  console.log(`   🆔 ${img.mediaGenerationId?.slice(0, 40)}...`);
  return img;
}

// ─── Whisk 프로젝트 + 이미지 ───
async function whiskGenerate(token, prompt, aspect, label) {
  console.log(`\n🎭 [${label}] Whisk 이미지 생성 중...`);

  // 프로젝트 생성
  const projRes = await fetch('https://labs.google/fx/api/trpc/media.createOrUpdateWorkflow', {
    method: 'POST',
    headers: { ...HEADERS, 'Cookie': cookie },
    body: JSON.stringify({ json: { workflowMetadata: { workflowName: label } } }),
  });
  const projData = await projRes.json();
  const workflowId = projData?.result?.data?.json?.result?.workflowId || projData?.result?.data?.json?.workflowId;
  if (!workflowId) { console.log('   ❌ 프로젝트 생성 실패'); return null; }

  const res = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateImage', {
    method: 'POST',
    headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      clientContext: { workflowId },
      imageModelSettings: { imageModel: 'IMAGEN_3_5', aspectRatio: aspect },
      seed: 0,
      prompt,
      mediaCategory: 'MEDIA_CATEGORY_BOARD',
    }),
  });

  if (!res.ok) {
    console.log(`   ❌ 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const img = data?.imagePanels?.[0]?.generatedImages?.[0];
  if (!img) { console.log('   ❌ 이미지 없음'); return null; }

  let b64 = img.encodedImage || '';
  if (b64.startsWith('data:')) b64 = b64.split(',')[1];
  writeFileSync(`${dir}/${label}.png`, Buffer.from(b64, 'base64'));

  console.log(`   ✅ 성공! ${(b64.length / 1024).toFixed(0)}KB → ${dir}/${label}.png`);
  return { ...img, workflowId };
}

// ─── Whisk 리파인 ───
async function whiskRefine(token, img, editPrompt, label) {
  console.log(`\n✏️ [${label}] Whisk 리파인 중...`);
  console.log(`   수정 지시: "${editPrompt}"`);

  const res = await fetch('https://labs.google/fx/api/trpc/backbone.editImage', {
    method: 'POST',
    headers: { ...HEADERS, 'Cookie': cookie },
    body: JSON.stringify({
      json: {
        clientContext: { workflowId: img.workflowId || '' },
        imageModelSettings: { aspectRatio: img.aspectRatio, imageModel: 'GEM_PIX' },
        editInput: {
          caption: img.prompt || '',
          userInstruction: editPrompt,
          seed: null,
          safetyMode: null,
          originalMediaGenerationId: img.mediaGenerationId,
          mediaInput: {
            mediaCategory: 'MEDIA_CATEGORY_BOARD',
            rawBytes: img.encodedImage?.startsWith('data:') ? img.encodedImage : `data:image/png;base64,${img.encodedImage}`,
          },
        },
      },
      meta: { values: { 'editInput.seed': ['undefined'], 'editInput.safetyMode': ['undefined'] } },
    }),
  });

  if (!res.ok) {
    console.log(`   ❌ 리파인 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const refined = data?.result?.data?.json?.result?.imagePanels?.[0]?.generatedImages?.[0]
    || data?.imagePanels?.[0]?.generatedImages?.[0];

  if (!refined) {
    console.log(`   ❌ 리파인 이미지 없음: ${JSON.stringify(data).slice(0, 300)}`);
    return null;
  }

  let b64 = refined.encodedImage || '';
  if (b64.startsWith('data:')) b64 = b64.split(',')[1];
  writeFileSync(`${dir}/${label}.png`, Buffer.from(b64, 'base64'));

  console.log(`   ✅ 리파인 성공! ${(b64.length / 1024).toFixed(0)}KB → ${dir}/${label}.png`);
  return { ...refined, workflowId: img.workflowId };
}

// ─── Whisk Veo 3.1 영상 생성 ───
async function whiskAnimate(token, img, script, label) {
  console.log(`\n🎬 [${label}] Veo 3.1 영상 생성 중...`);
  console.log(`   스크립트: "${script}"`);

  const rawBytes = img.encodedImage?.startsWith('data:') ? img.encodedImage : `data:image/png;base64,${img.encodedImage}`;

  const res = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateVideo', {
    method: 'POST',
    headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      promptImageInput: { prompt: img.prompt || script, rawBytes },
      modelNameType: 'VEO_3_1_I2V_12STEP',
      modelKey: '',
      userInstructions: script,
      loopVideo: false,
      clientContext: { workflowId: img.workflowId || '' },
    }),
  });

  if (!res.ok) {
    console.log(`   ❌ 영상 생성 요청 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const opName = data?.operation?.operation?.name;
  if (!opName) {
    console.log(`   ❌ operation name 없음: ${JSON.stringify(data).slice(0, 300)}`);
    return null;
  }

  console.log(`   ⏳ 영상 생성 대기 중... (operation: ${opName.slice(0, 30)}...)`);

  // 폴링 (최대 120초)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write(`   ⏳ 폴링 ${i + 1}/60... `);

    const pollRes = await fetch('https://aisandbox-pa.googleapis.com/v1:runVideoFxSingleClipsStatusCheck', {
      method: 'POST',
      headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ operations: [{ operation: { name: opName } }] }),
    });

    if (!pollRes.ok) { console.log(`실패 (${pollRes.status})`); continue; }

    const pollData = await pollRes.json();
    const status = pollData?.status;
    console.log(status || '대기 중');

    if (status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
      const videoData = pollData?.operations?.[0];
      let videoB64 = videoData?.rawBytes || '';
      if (videoB64.startsWith('data:')) videoB64 = videoB64.split(',')[1];

      if (videoB64) {
        writeFileSync(`${dir}/${label}.mp4`, Buffer.from(videoB64, 'base64'));
        console.log(`   ✅ 영상 생성 성공! → ${dir}/${label}.mp4`);
        return true;
      } else {
        console.log(`   ⚠️ 성공이지만 비디오 데이터 없음`);
        return null;
      }
    }

    if (status === 'MEDIA_GENERATION_STATUS_FAILED') {
      console.log(`   ❌ 영상 생성 실패`);
      return null;
    }
  }

  console.log(`   ⏰ 타임아웃 (120초)`);
  return null;
}

// ═══ 메인 ═══
async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  Google 전체 기능 테스트                            ║');
  console.log('║  Imagen 4 + Imagen 3.5 + Whisk + 리파인 + Veo 3.1  ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  const token = await auth();
  const results = {};

  // ① Imagen 4 테스트
  results.imagen4 = await imageFX(token,
    'A futuristic Tokyo street at night, neon lights reflecting on wet pavement, ultra detailed, 8k',
    'IMAGEN_4',
    'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'imagen4-test'
  );

  // ② Imagen 3.5 테스트 (비교용)
  results.imagen35 = await imageFX(token,
    'A futuristic Tokyo street at night, neon lights reflecting on wet pavement, ultra detailed, 8k',
    'IMAGEN_3_5',
    'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'imagen35-test'
  );

  // ③ 세로 (9:16) 테스트 — 쇼츠용
  results.portrait = await imageFX(token,
    'A beautiful Korean woman in traditional hanbok, standing in a bamboo forest, soft light',
    'IMAGEN_3_5',
    'IMAGE_ASPECT_RATIO_PORTRAIT',
    'portrait-test'
  );

  // ④ Whisk 이미지 생성
  results.whisk = await whiskGenerate(token,
    'A cozy cafe interior with warm lighting, books on shelves, rain outside the window, studio ghibli style',
    'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'whisk-test'
  );

  // ⑤ Whisk 리파인 (이미지 수정)
  if (results.whisk) {
    results.refine = await whiskRefine(token, results.whisk,
      'Add a cat sleeping on the table and make the rain heavier',
      'whisk-refined-test'
    );
  }

  // ⑥ Whisk Veo 3.1 영상 (시간이 오래 걸릴 수 있음)
  if (results.whisk) {
    results.video = await whiskAnimate(token, results.whisk,
      'Camera slowly pans across the cafe, rain drops on the window',
      'veo31-test'
    );
  }

  // ═══ 결과 요약 ═══
  console.log(`
╔═══════════════════════════════════════════════════╗
║                    테스트 결과                      ║
╠═══════════════════════════════════════════════════╣
║  ① Imagen 4 (ImageFX):     ${results.imagen4 ? '✅ 성공' : '❌ 실패'}                ║
║  ② Imagen 3.5 (ImageFX):   ${results.imagen35 ? '✅ 성공' : '❌ 실패'}                ║
║  ③ 세로 9:16 (Portrait):   ${results.portrait ? '✅ 성공' : '❌ 실패'}                ║
║  ④ Whisk 이미지:           ${results.whisk ? '✅ 성공' : '❌ 실패'}                ║
║  ⑤ Whisk 리파인:           ${results.refine ? '✅ 성공' : '❌ 실패/스킵'}           ║
║  ⑥ Veo 3.1 영상:           ${results.video ? '✅ 성공' : '❌ 실패/스킵'}           ║
║                                                   ║
║  생성 파일: test/output/ 폴더 확인                  ║
╚═══════════════════════════════════════════════════╝
`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
