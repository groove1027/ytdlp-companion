#!/usr/bin/env node
/**
 * Google ImageFX + Whisk API 테스트 스크립트
 *
 * 사용법:
 *   1. Google 쿠키를 환경변수로 설정:
 *      export GOOGLE_COOKIE="쿠키값..."
 *
 *   2. 스크립트 실행:
 *      node test/test-google-image.mjs
 *
 *   또는 쿠키를 직접 전달:
 *      node test/test-google-image.mjs "쿠키값..."
 */

const cookie = process.argv[2] || process.env.GOOGLE_COOKIE;

if (!cookie) {
  console.error(`
╔══════════════════════════════════════════════════════════╗
║  Google 쿠키가 필요합니다!                                ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  방법 1: Cookie Editor 확장 프로그램                       ║
║    1. labs.google 접속 (Google 로그인)                     ║
║    2. Cookie Editor 아이콘 → Export → Header String       ║
║    3. 복사한 값을 아래처럼 실행:                            ║
║                                                          ║
║  node test/test-google-image.mjs "복사한_쿠키_값"          ║
║                                                          ║
║  방법 2: 개발자 도구                                       ║
║    1. labs.google/fx/tools/image-fx 접속                   ║
║    2. F12 → Network 탭 → 새로고침                          ║
║    3. image-fx 요청 → Headers → Cookie 값 복사            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

// ─── 공통 상수 ───
const HEADERS = {
  'Origin': 'https://labs.google',
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/tools/image-fx',
};

// ─── STEP 1: 세션 인증 (쿠키 → Bearer 토큰) ───
async function getAccessToken(cookie) {
  console.log('\n🔐 [1/4] 세션 인증 중...');

  const res = await fetch('https://labs.google/fx/api/auth/session', {
    headers: { ...HEADERS, 'Cookie': cookie },
  });

  if (!res.ok) {
    throw new Error(`세션 인증 실패 (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`세션 에러: ${data.error} — 쿠키를 갱신해주세요`);
  }

  if (!data.access_token) {
    throw new Error('access_token이 없습니다. 쿠키가 유효한지 확인해주세요.');
  }

  console.log(`   ✅ 인증 성공!`);
  console.log(`   👤 ${data.user?.name || '(이름 없음)'} (${data.user?.email || '(이메일 없음)'})`);
  console.log(`   🕐 토큰 만료: ${data.expires}`);

  return data.access_token;
}

// ─── STEP 2: ImageFX로 이미지 생성 (Imagen 3.5) ───
async function generateImageFX(cookie, token, prompt, model = 'IMAGEN_3_5', aspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE') {
  console.log(`\n🎨 [2/4] ImageFX 이미지 생성 중...`);
  console.log(`   📝 프롬프트: "${prompt}"`);
  console.log(`   🤖 모델: ${model}`);
  console.log(`   📐 화면비: ${aspectRatio}`);

  const body = {
    userInput: {
      candidatesCount: 1,
      prompts: [prompt],
      seed: 0,
    },
    clientContext: {
      sessionId: `;${Date.now()}`,
      tool: 'IMAGE_FX',
    },
    modelInput: {
      modelNameType: model,
    },
    aspectRatio: aspectRatio,
  };

  const res = await fetch('https://aisandbox-pa.googleapis.com/v1:runImageFx', {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Cookie': cookie,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ImageFX 생성 실패 (${res.status}): ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const images = data?.imagePanels?.[0]?.generatedImages;

  if (!images || images.length === 0) {
    throw new Error('생성된 이미지가 없습니다. 응답: ' + JSON.stringify(data).slice(0, 500));
  }

  const img = images[0];
  const base64Length = (img.encodedImage || '').length;

  console.log(`   ✅ 이미지 생성 성공!`);
  console.log(`   📦 Base64 크기: ${(base64Length / 1024).toFixed(1)} KB`);
  console.log(`   🆔 Media ID: ${img.mediaGenerationId}`);
  console.log(`   🌱 Seed: ${img.seed}`);

  return img;
}

// ─── STEP 3: Whisk로 이미지 생성 ───
async function generateWhisk(cookie, token, prompt, aspectRatio = 'IMAGE_ASPECT_RATIO_LANDSCAPE') {
  console.log(`\n🎭 [3/4] Whisk 이미지 생성 중...`);
  console.log(`   📝 프롬프트: "${prompt}"`);

  // 먼저 프로젝트 생성
  const projectRes = await fetch('https://labs.google/fx/api/trpc/media.createOrUpdateWorkflow', {
    method: 'POST',
    headers: { ...HEADERS, 'Cookie': cookie },
    body: JSON.stringify({
      json: { workflowMetadata: { workflowName: 'Test Project' } }
    }),
  });

  if (!projectRes.ok) {
    console.log(`   ⚠️ Whisk 프로젝트 생성 실패 (${projectRes.status}) — 스킵`);
    return null;
  }

  const projectData = await projectRes.json();
  const workflowId = projectData?.result?.data?.json?.result?.workflowId || projectData?.result?.data?.json?.workflowId;

  if (!workflowId) {
    console.log(`   ⚠️ workflowId를 받지 못함 — 스킵`);
    return null;
  }

  console.log(`   📁 프로젝트 생성 완료 (${workflowId.slice(0, 20)}...)`);

  // 이미지 생성
  const body = {
    clientContext: { workflowId },
    imageModelSettings: {
      imageModel: 'IMAGEN_3_5',
      aspectRatio: aspectRatio,
    },
    seed: 0,
    prompt: prompt,
    mediaCategory: 'MEDIA_CATEGORY_BOARD',
  };

  const res = await fetch('https://aisandbox-pa.googleapis.com/v1/whisk:generateImage', {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.log(`   ⚠️ Whisk 이미지 생성 실패 (${res.status}): ${errText.slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const images = data?.imagePanels?.[0]?.generatedImages;

  if (!images || images.length === 0) {
    console.log(`   ⚠️ 생성된 이미지 없음`);
    return null;
  }

  const img = images[0];
  console.log(`   ✅ Whisk 이미지 생성 성공!`);
  console.log(`   📦 Base64 크기: ${((img.encodedImage || '').length / 1024).toFixed(1)} KB`);
  console.log(`   🆔 Media ID: ${img.mediaGenerationId}`);

  return img;
}

// ─── STEP 4: 이미지 저장 ───
async function saveImage(img, filename) {
  const { writeFileSync, mkdirSync, existsSync } = await import('fs');
  const dir = './test/output';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let base64 = img.encodedImage || '';
  // data:image/png;base64, 접두사 제거
  if (base64.startsWith('data:')) {
    base64 = base64.split(',')[1] || base64;
  }

  const buffer = Buffer.from(base64, 'base64');
  const path = `${dir}/${filename}`;
  writeFileSync(path, buffer);
  console.log(`   💾 저장됨: ${path} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return path;
}

// ─── 메인 실행 ───
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Google ImageFX + Whisk API 테스트            ║');
  console.log('╚══════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // 1. 인증
    const token = await getAccessToken(cookie);

    // 2. ImageFX 테스트 (Imagen 3.5)
    const fxImage = await generateImageFX(
      cookie, token,
      'A serene Japanese garden with cherry blossoms, golden hour lighting, highly detailed, cinematic composition',
      'IMAGEN_3_5',
      'IMAGE_ASPECT_RATIO_LANDSCAPE'
    );

    // 3. Whisk 테스트
    const whiskImage = await generateWhisk(
      cookie, token,
      'A dramatic scene of a warrior standing on a cliff overlooking a vast ocean, anime style, vibrant colors'
    );

    // 4. 이미지 저장
    console.log(`\n💾 [4/4] 이미지 저장 중...`);
    if (fxImage) await saveImage(fxImage, 'imagefx-test.png');
    if (whiskImage) await saveImage(whiskImage, 'whisk-test.png');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`
╔══════════════════════════════════════════════╗
║  ✅ 테스트 완료! (${elapsed}초)                    ║
╠══════════════════════════════════════════════╣
║  ImageFX (Imagen 3.5): ${fxImage ? '✅ 성공' : '❌ 실패'}               ║
║  Whisk (Imagen 3.5):   ${whiskImage ? '✅ 성공' : '❌ 실패 (선택적)'}          ║
║                                              ║
║  생성된 이미지: test/output/ 폴더 확인         ║
║                                              ║
║  → 이 테스트가 성공하면 올인원 통합 가능!      ║
╚══════════════════════════════════════════════╝
`);

  } catch (err) {
    console.error(`\n❌ 테스트 실패: ${err.message}`);
    if (err.message.includes('쿠키') || err.message.includes('token') || err.message.includes('세션')) {
      console.error('\n💡 쿠키가 만료되었거나 유효하지 않습니다. 새 쿠키를 가져와주세요.');
    }
    process.exit(1);
  }
}

main();
