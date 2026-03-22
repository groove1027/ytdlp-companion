#!/usr/bin/env node
/**
 * Veo 3.1 영상 생성 재시도 — base64 인코딩 수정
 */
const cookie = process.argv[2] || process.env.GOOGLE_COOKIE;
if (!cookie) { console.error('쿠키 필요'); process.exit(1); }

const { writeFileSync, readFileSync, mkdirSync, existsSync } = await import('fs');
const dir = './test/output';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const HEADERS = {
  'Origin': 'https://labs.google',
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/tools/image-fx',
};

// 인증
const sessionRes = await fetch('https://labs.google/fx/api/auth/session', {
  headers: { ...HEADERS, 'Cookie': cookie },
});
const session = await sessionRes.json();
const token = session.access_token;
console.log(`✅ 인증: ${session.user?.name}`);

// Whisk 프로젝트 + 이미지 생성 (LANDSCAPE 필수 — Veo는 가로만 지원)
console.log('\n🎭 Whisk 이미지 생성 중...');
const projRes = await fetch('https://labs.google/fx/api/trpc/media.createOrUpdateWorkflow', {
  method: 'POST',
  headers: { ...HEADERS, 'Cookie': cookie },
  body: JSON.stringify({ json: { workflowMetadata: { workflowName: 'Veo Test' } } }),
});
const projData = await projRes.json();
const workflowId = projData?.result?.data?.json?.result?.workflowId || projData?.result?.data?.json?.workflowId;
console.log(`   프로젝트: ${workflowId?.slice(0, 20)}...`);

const imgRes = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateImage', {
  method: 'POST',
  headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    clientContext: { workflowId },
    imageModelSettings: { imageModel: 'IMAGEN_3_5', aspectRatio: 'IMAGE_ASPECT_RATIO_LANDSCAPE' },
    seed: 42, prompt: 'A peaceful lake surrounded by mountains at sunset, cinematic wide shot',
    mediaCategory: 'MEDIA_CATEGORY_BOARD',
  }),
});
const imgData = await imgRes.json();
const img = imgData?.imagePanels?.[0]?.generatedImages?.[0];
if (!img) { console.error('이미지 생성 실패'); process.exit(1); }
console.log(`   ✅ 이미지 생성 성공 (${(img.encodedImage?.length / 1024).toFixed(0)}KB)`);

// encodedImage 형식 분석
let rawBytes = img.encodedImage || '';
console.log(`\n📊 encodedImage 형식 분석:`);
console.log(`   시작 10자: "${rawBytes.slice(0, 10)}"`);
console.log(`   data: 접두사: ${rawBytes.startsWith('data:')}`);

// data: 접두사가 없으면 추가, JPEG인지 PNG인지 감지
if (!rawBytes.startsWith('data:')) {
  // /9j/ = JPEG, iVBOR = PNG
  if (rawBytes.startsWith('/9j/')) {
    rawBytes = `data:image/jpeg;base64,${rawBytes}`;
    console.log(`   → JPEG 감지 → data:image/jpeg;base64 추가`);
  } else if (rawBytes.startsWith('iVBOR')) {
    rawBytes = `data:image/png;base64,${rawBytes}`;
    console.log(`   → PNG 감지 → data:image/png;base64 추가`);
  } else {
    rawBytes = `data:image/png;base64,${rawBytes}`;
    console.log(`   → 알 수 없는 형식 → PNG로 가정`);
  }
}

// Veo 3.1 영상 생성
console.log('\n🎬 Veo 3.1 영상 생성 요청...');
const veoRes = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateVideo', {
  method: 'POST',
  headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    promptImageInput: {
      prompt: 'A peaceful lake surrounded by mountains at sunset',
      rawBytes,
    },
    modelNameType: 'VEO_3_1_I2V_12STEP',
    modelKey: '',
    userInstructions: 'Slow camera pan from left to right, gentle water ripples',
    loopVideo: false,
    clientContext: { workflowId },
  }),
});

if (!veoRes.ok) {
  const errText = await veoRes.text();
  console.log(`❌ 요청 실패 (${veoRes.status}):`);
  console.log(errText.slice(0, 500));

  // data: 접두사 없이 순수 base64로 재시도
  console.log('\n🔄 순수 base64로 재시도...');
  let pureBase64 = img.encodedImage || '';
  if (pureBase64.startsWith('data:')) pureBase64 = pureBase64.split(',')[1];

  const retryRes = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateVideo', {
    method: 'POST',
    headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      promptImageInput: {
        prompt: 'A peaceful lake surrounded by mountains at sunset',
        rawBytes: pureBase64,
      },
      modelNameType: 'VEO_3_1_I2V_12STEP',
      modelKey: '',
      userInstructions: 'Slow camera pan from left to right',
      loopVideo: false,
      clientContext: { workflowId },
    }),
  });

  if (!retryRes.ok) {
    console.log(`❌ 재시도도 실패 (${retryRes.status}): ${(await retryRes.text()).slice(0, 500)}`);

    // mediaGenerationId로 시도
    console.log('\n🔄 mediaGenerationId 방식으로 재시도...');
    const retry2Res = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateVideo', {
      method: 'POST',
      headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        promptImageInput: {
          prompt: 'A peaceful lake surrounded by mountains at sunset',
          mediaGenerationId: img.mediaGenerationId,
        },
        modelNameType: 'VEO_3_1_I2V_12STEP',
        modelKey: '',
        userInstructions: 'Slow camera pan from left to right',
        loopVideo: false,
        clientContext: { workflowId },
      }),
    });

    if (!retry2Res.ok) {
      console.log(`❌ 3차 시도 실패 (${retry2Res.status}): ${(await retry2Res.text()).slice(0, 500)}`);
      process.exit(1);
    }

    await pollVideo(token, retry2Res);
  } else {
    await pollVideo(token, retryRes);
  }
} else {
  await pollVideo(token, veoRes);
}

async function pollVideo(token, response) {
  const data = await response.json();
  const opName = data?.operation?.operation?.name;
  if (!opName) { console.log('❌ operation name 없음:', JSON.stringify(data).slice(0, 300)); return; }

  console.log(`⏳ 영상 생성 대기 (operation: ${opName.slice(0, 30)}...)`);

  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 3000));

    const pollRes = await fetch('https://aisandbox-pa.googleapis.com/v1:runVideoFxSingleClipsStatusCheck', {
      method: 'POST',
      headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ operations: [{ operation: { name: opName } }] }),
    });

    const pollData = await pollRes.json();
    const status = pollData?.status;
    process.stdout.write(`   [${i+1}/90] ${status || 'PENDING'}  \r`);

    if (status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
      console.log('\n   ✅ 영상 생성 성공!');
      const videoOp = pollData?.operations?.[0];
      let videoB64 = videoOp?.rawBytes || '';
      if (videoB64.startsWith('data:')) videoB64 = videoB64.split(',')[1];

      if (videoB64) {
        writeFileSync(`${dir}/veo31-test.mp4`, Buffer.from(videoB64, 'base64'));
        console.log(`   💾 저장: ${dir}/veo31-test.mp4`);
      } else {
        // mediaGenerationId로 가져오기
        const mediaId = videoOp?.mediaGenerationId;
        if (mediaId) {
          console.log(`   📥 mediaId로 비디오 가져오기: ${mediaId.slice(0, 30)}...`);
          const mediaRes = await fetch(`https://aisandbox-pa.googleapis.com/v1/media/${mediaId}?key=AIzaSyBtrm0o5ab1c-Ec8ZuLcGt3oJAA5VWt3pY`, {
            headers: { 'Referer': 'https://labs.google/', 'Authorization': `Bearer ${token}` },
          });
          const mediaData = await mediaRes.json();
          let vb64 = mediaData?.video?.encodedVideo || '';
          if (vb64.startsWith('data:')) vb64 = vb64.split(',')[1];
          if (vb64) {
            writeFileSync(`${dir}/veo31-test.mp4`, Buffer.from(vb64, 'base64'));
            console.log(`   💾 저장: ${dir}/veo31-test.mp4`);
          }
        }
      }
      return;
    }

    if (status === 'MEDIA_GENERATION_STATUS_FAILED') {
      console.log('\n   ❌ 영상 생성 실패');
      console.log(JSON.stringify(pollData).slice(0, 500));
      return;
    }
  }
  console.log('\n   ⏰ 타임아웃 (270초)');
}
