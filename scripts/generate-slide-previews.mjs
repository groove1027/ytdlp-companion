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
    prompt: 'A presentation slide design in Neo-brutalism style, bold black outlines, high contrast vibrant yellow and red colors, thick typography saying "INNOVATION", floating geometric shapes, edgy modern tech aesthetic, white background, 16:9 aspect ratio',
  },
  {
    id: 'clean-minimal',
    prompt: 'A minimalist presentation slide, Apple keynote style clean aesthetics, thin grey lines, vast negative space, soft blue accents, simple line icons, elegant professional design, white background, subtle gradient, 16:9 aspect ratio',
  },
  {
    id: 'glassmorphism',
    prompt: 'A futuristic presentation slide design, Glassmorphism style, semi-transparent frosted glass cards overlapping, soft purple and pink background blur, glowing pastel gradients, floating 3D icons, high-end software aesthetic, 16:9',
  },
  {
    id: 'bento-grid',
    prompt: 'A bento grid layout presentation slide, organized rectangular sections like Japanese lunchbox, clean UI elements in each box, rounded corners, soft shadows, data visualization charts, modern web design trend, light background, 16:9',
  },
  {
    id: 'claymorphism',
    prompt: 'A claymorphism style presentation slide, cute 3D soft plastic textures, rounded inflated shapes, friendly pastel pink and blue colors, 3D clay characters presenting data on a whiteboard, playful design, 16:9',
  },
  {
    id: 'dark-tech',
    prompt: 'A dark mode tech presentation slide, deep charcoal black background, neon cyan and violet glowing lines, futuristic HUD hologram elements, data stream visualizations, matrix-like digital rain, sophisticated AI network, 16:9',
  },
  {
    id: 'gradient-mesh',
    prompt: 'A presentation slide with vibrant mesh gradient background, organic flowing abstract shapes, soft dreamy transitions of deep blue purple and pink, minimalist white text placeholder area, ethereal creative design, 16:9',
  },
  {
    id: 'hand-drawn',
    prompt: 'A creative presentation slide in hand-drawn sketch style, pencil doodles on white paper texture, scribbled arrows and lightbulb icons, organic handwritten typography, brainstorming mood board feel, warm and human, 16:9',
  },
  {
    id: 'node-link',
    prompt: 'A data science presentation slide, knowledge graph with interconnected glowing nodes and lines, connecting the dots concept, dark blue background, silver and cyan data points, professional network visualization, 16:9',
  },
  {
    id: 'retro-modern',
    prompt: 'A retro-modern 80s tech presentation slide, grainy film texture, vintage muted orange and teal colors, geometric shapes, old CRT computer aesthetic meets modern AI, synthwave vaporwave, nostalgic design, 16:9',
  },
  {
    id: 'toss-style',
    prompt: 'A Toss fintech app style clean presentation slide, iconic 3D glossy blue sphere icons, vivid blue accents on pure white background, extremely simple friendly layout, soft card shadows, premium mobile app UI aesthetic, 16:9',
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
