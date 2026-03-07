/**
 * 슬라이드 디자인 스타일 미리보기 이미지 배치 생성 스크립트
 *
 * 실행: node scripts/generate-slide-previews.mjs
 *
 * Evolink API (gemini-3.1-flash-image-preview) 비동기 태스크 기반
 * 생성 결과: src/public/slide-previews/{styleId}.jpg
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY = 'REDACTED_EVOLINK_KEY';
const BASE_URL = 'https://api.evolink.ai/v1';
const OUTPUT_DIR = path.resolve('src/public/slide-previews');

const DESIGN_STYLES = [
  {
    id: 'neo-brutalism',
    prompt: '프레젠테이션 슬라이드 디자인, 네오 브루탈리즘 스타일, 굵은 검정 테두리, 선명한 노란색과 빨간색 고대비 배색, "혁신 전략" 한글 굵은 타이포그래피, 떠다니는 기하학적 도형, 힙하고 현대적인 테크 감성, 흰색 배경, 16:9 가로 비율',
  },
  {
    id: 'clean-minimal',
    prompt: '미니멀리스트 프레젠테이션 슬라이드, 애플 키노트 스타일, 얇은 회색 선, 넓은 여백, 부드러운 파란색 포인트, 심플한 선형 아이콘, "핵심 요약" 한글 제목, 우아하고 전문적인 디자인, 흰색 배경, 16:9 가로 비율',
  },
  {
    id: 'glassmorphism',
    prompt: '미래적 프레젠테이션 슬라이드, 글래스모피즘 스타일, 반투명 젖빛 유리 카드가 겹쳐진 구성, 보라색과 분홍색 배경 블러, 빛나는 파스텔 그라디언트, 떠다니는 3D 아이콘, "데이터 분석" 한글 텍스트, 16:9 가로 비율',
  },
  {
    id: 'bento-grid',
    prompt: '벤토 그리드 레이아웃 프레젠테이션 슬라이드, 도시락처럼 정리된 직사각형 구획, 각 칸에 깔끔한 UI 요소, 둥근 모서리, 부드러운 그림자, "분기별 실적" 한글 제목, 데이터 시각화 차트, 밝은 배경, 16:9 가로 비율',
  },
  {
    id: 'claymorphism',
    prompt: '클레이모피즘 스타일 프레젠테이션 슬라이드, 귀여운 3D 말랑한 플라스틱 질감, 둥글게 부풀어 오른 형태, 친근한 파스텔 핑크와 파란색, "우리의 목표" 한글 텍스트, 3D 클레이 캐릭터가 화이트보드에 발표하는 장면, 16:9 가로 비율',
  },
  {
    id: 'dark-tech',
    prompt: '다크 모드 테크 프레젠테이션 슬라이드, 짙은 차콜 검정 배경, 네온 시안과 보라색 빛나는 선, 미래적 HUD 홀로그램 요소, "AI 기술 동향" 한글 텍스트, 데이터 스트림 시각화, 정교한 AI 네트워크, 16:9 가로 비율',
  },
  {
    id: 'gradient-mesh',
    prompt: '프레젠테이션 슬라이드, 선명한 메시 그라디언트 배경, 유기적으로 흐르는 추상 형태, 짙은 파란색 보라색 핑크색의 부드러운 전환, "창의적 접근" 한글 흰색 텍스트 영역, 몽환적이고 창의적인 디자인, 16:9 가로 비율',
  },
  {
    id: 'hand-drawn',
    prompt: '창의적 프레젠테이션 슬라이드, 손으로 그린 스케치 스타일, 종이 질감 위 연필 낙서, 화살표와 전구 아이콘 스케치, "아이디어 회의" 한글 손글씨 타이포그래피, 브레인스토밍 무드보드 느낌, 따뜻하고 인간적인, 16:9 가로 비율',
  },
  {
    id: 'node-link',
    prompt: '데이터 사이언스 프레젠테이션 슬라이드, 서로 연결된 빛나는 노드와 선의 지식 그래프, 점을 잇는 개념, 짙은 파란 배경, 은색과 시안색 데이터 포인트, "연결 분석" 한글 텍스트, 전문적 네트워크 시각화, 16:9 가로 비율',
  },
  {
    id: 'retro-modern',
    prompt: '레트로 모던 80년대 테크 프레젠테이션 슬라이드, 필름 그레인 질감, 빈티지 오렌지와 틸 색상, 기하학적 형태, "미래 전망" 한글 텍스트, 옛날 CRT 컴퓨터 감성과 현대적 AI의 만남, 신스웨이브, 16:9 가로 비율',
  },
  {
    id: 'toss-style',
    prompt: '토스 핀테크 앱 스타일 깔끔한 프레젠테이션 슬라이드, 상징적인 3D 광택 파란 구형 아이콘, 순백색 배경 위 선명한 파란색 포인트, "간편 송금" 한글 텍스트, 극도로 심플하고 친근한 레이아웃, 프리미엄 모바일 앱 UI, 16:9 가로 비율',
  },
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function fetchJSON(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        ...options.headers,
      },
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`JSON parse error: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function createImageTask(prompt) {
  const body = JSON.stringify({
    model: 'gemini-3.1-flash-image-preview',
    prompt,
    size: '16:9',
    quality: '2K',
  });

  const data = await fetchJSON(`${BASE_URL}/images/generations`, {
    method: 'POST',
    body,
  });

  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (!data.id) throw new Error(`No task ID: ${JSON.stringify(data).slice(0, 200)}`);
  return data.id;
}

async function pollTask(taskId, maxAttempts = 60, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));

    const data = await fetchJSON(`${BASE_URL}/tasks/${taskId}`);

    if (data.status === 'completed' || data.status === 'succeeded') {
      // Find result URL — Evolink returns results[] array
      const url = data.results?.[0]
        || data.output?.image_url
        || data.output?.url
        || data.result?.url
        || data.data?.[0]?.url;
      if (url) return url;
      throw new Error(`Completed but no URL: ${JSON.stringify(data).slice(0, 300)}`);
    }

    if (data.status === 'failed' || data.status === 'error') {
      throw new Error(`Task failed: ${data.error || data.message || JSON.stringify(data).slice(0, 200)}`);
    }

    // Still processing
    if (i % 5 === 0) process.stdout.write('.');
  }
  throw new Error(`Timeout after ${maxAttempts} attempts`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function generateOne(style) {
  const outPath = path.join(OUTPUT_DIR, `${style.id}.jpg`);

  // Skip if already exists
  if (fs.existsSync(outPath)) {
    console.log(`  [SKIP] ${style.id} (already exists)`);
    return;
  }

  console.log(`  [GEN]  ${style.id} — creating task...`);
  const taskId = await createImageTask(style.prompt);
  console.log(`  [POLL] ${style.id} — taskId: ${taskId}`);

  const imageUrl = await pollTask(taskId);
  console.log(`  [DL]   ${style.id} — downloading...`);
  await downloadFile(imageUrl, outPath);

  const stats = fs.statSync(outPath);
  console.log(`  [OK]   ${style.id} (${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log(`\n=== Slide Preview Image Generator (Evolink Async) ===`);
  console.log(`Generating ${DESIGN_STYLES.length} images...\n`);

  // Generate 2 at a time to avoid rate limiting
  const CONCURRENCY = 2;
  for (let i = 0; i < DESIGN_STYLES.length; i += CONCURRENCY) {
    const batch = DESIGN_STYLES.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(style => generateOne(style).catch(err => {
      console.error(`  [FAIL] ${style.id}: ${err.message}`);
    })));
  }

  // List generated files
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log(`\nGenerated ${files.length} files in ${OUTPUT_DIR}:`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log();
}

main().catch(console.error);
