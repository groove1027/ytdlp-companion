#!/usr/bin/env node
/**
 * generate-visual-previews.mjs
 *
 * VISUAL_STYLES 75개 비주얼 스타일 미리보기 이미지를 배치 생성.
 * 기준 장면 + 각 스타일 프롬프트를 결합하여 text-to-image 생성.
 * 결과물: src/public/visual-previews/{catIdx}/{itemIdx}.jpg
 *
 * 사용법: node scripts/generate-visual-previews.mjs
 * 재개 가능: 이미 존재하는 파일은 건너뜀
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../src/public/visual-previews');

// ─── Config ───
const API_URL = 'https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent';
const API_KEY = 'REDACTED_LAOZHANG_KEY';
const CONCURRENCY = 10;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

// 기준 장면 프롬프트 (모든 스타일에 동일 적용)
const BASE_SCENE = 'A cozy small cafe in a quiet street, a woman sitting at a window table reading a book, warm afternoon light, medium wide shot';

// ─── VISUAL_STYLES inline copy (TypeScript import 불가) ───
const VISUAL_STYLES = [
  {
    category: '영화 & 드라마',
    items: [
      { label: '시네마틱', prompt: 'Hyper realistic, 8k resolution, teal and orange color grading, epic scale, blockbuster movie tone, cinematic lighting, highly detailed' },
      { label: '느와르/범죄 스릴러', prompt: 'Film noir style, high contrast, black and white, dramatic shadows, rough skin texture, cold blue tone, crime thriller vibe' },
      { label: '사극/시대극', prompt: 'Historical drama style, Hanbok, armor details, palace or nature background, heavy and classic tone, 8k, masterpiece' },
      { label: '빈티지 필름', prompt: 'Vintage film style, A24 movie vibe, emotional film grain, noise, unique color grading, analog feel, retro aesthetic' },
      { label: '다큐멘터리', prompt: 'Documentary style, handheld camera shake effect, natural lighting, raw and unpolished realism, 4k, truth' },
      { label: '서부극/웨스턴', prompt: 'Western movie style, sepia tone, wilderness, rough sandstorm, leather texture, sunset duel, cowboy vibe' },
      { label: '첩보/스파이', prompt: 'Spy movie style, 007 vibe, cold blue and grey suit, sophisticated European background, clean look, action' },
      { label: '하이틴/청춘물', prompt: 'Netflix teen drama style, colorful outfits, energetic, popping colors, vibrant, high school vibe, lovely' },
      { label: 'K-드라마', prompt: 'K-Drama style, bright and warm lighting, soft skin correction, romantic atmosphere, Seoul city background, 8k, beauty' },
      { label: 'SF 퓨처리스틱', prompt: 'Sci-fi futuristic style, cyberpunk neon, hologram, metallic texture, future city, spaceship, high tech' },
      { label: '중세 판타지', prompt: 'Medieval fantasy, Game of Thrones style, candle light, stone texture, majestic castle, knight, epic' },
      { label: '호러/공포', prompt: 'Horror movie style, low saturation, gloomy fog, green and blue eerie lighting, tension, scary, cinematic' },
      { label: '전쟁/밀리터리', prompt: 'War movie style, dust, explosion effects, rough and desaturated, bleak battlefield atmosphere, saving private ryan style' },
      { label: '뮤지컬/연극', prompt: 'Musical stage style, pin lighting, exaggerated stage makeup, dramatic contrast, stage set feel, spotlight' },
      { label: '좀비/아포칼립스', prompt: 'Post-apocalypse style, ruined city, grey tone, dust and soot, desperate survival atmosphere, cinematic' },
      { label: '웨스 앤더슨', prompt: 'Wes Anderson style, symmetrical composition, pastel color palette, quirky set design, whimsical, centered framing, vintage aesthetic' },
      { label: '왕가위', prompt: 'Wong Kar-wai style, neon-lit Hong Kong night, motion blur, melancholic mood, saturated red and green, grainy film, romantic loneliness' },
      { label: '북유럽 미니멀', prompt: 'Scandinavian minimalist film style, cold natural light, muted earth tones, vast empty landscapes, quiet contemplation, hygge atmosphere' },
      { label: '볼리우드', prompt: 'Bollywood style, vibrant saturated colors, ornate costumes, dramatic expressions, grand dance scene, festive, celebratory, extravagant' },
      { label: '누벨바그', prompt: 'French New Wave style, black and white with occasional color, jump cuts feel, existential mood, Parisian streets, Godard aesthetic' },
    ]
  },
  {
    category: 'CF & 커머셜',
    items: [
      { label: 'K-광고', prompt: 'Korean beverage commercial style, blue sky, high saturation, clear and clean feeling, Korean city background, refreshing' },
      { label: '럭셔리 패션', prompt: 'Luxury fashion brand editorial, artistic pose, strong contrast, premium vibe, high fashion, vogue style' },
      { label: '푸드 씨즐', prompt: 'Food porn style, steaming hot, water droplets, glossy, high resolution food photography, delicious, macro shot' },
      { label: '라이프스타일', prompt: 'Lifestyle vlog style, IKEA concept, natural sunlight in living room, cozy and comfortable atmosphere, interior design' },
      { label: '키즈/장난감', prompt: 'Kids toy commercial, vivid primary colors, soft lighting, energetic and playful atmosphere, cute' },
      { label: '에코/친환경', prompt: 'Eco-friendly brand style, beige and green tones, linen texture, warm natural sunlight, organic, nature' },
      { label: '뷰티/코스메틱', prompt: 'Cosmetic commercial, ultra high resolution skin texture, glow, soft studio lighting, beauty portrait, flawless' },
      { label: '테크 미니멀리즘', prompt: 'Tech minimalism, Apple style, white or black background, product focus, extremely refined, clean, sleek' },
      { label: '스포츠/다이내믹', prompt: 'Sports commercial, Nike style, sweat droplets, dynamic muscles, high contrast, motion blur, energetic, action' },
      { label: '기업/비즈니스', prompt: 'Corporate business style, trustworthy blue tone, suit professional, bright and clean office, success' },
      { label: '메디컬/헬스케어', prompt: 'Medical commercial, university hospital, clean white and sky blue, professional trust, sterile environment, health' },
      { label: '페스티벌/이벤트', prompt: 'Festival event style, fireworks in night sky, cheering crowd, dynamic laser lights, exciting, concert' },
      { label: '여행/관광', prompt: 'Travel tourism commercial, golden hour landscape, wanderlust vibe, drone aerial view, adventure, bucket list destination, vivid' },
      { label: '자동차 광고', prompt: 'Car commercial style, sleek vehicle on wet road, dramatic reflections, dynamic motion, studio lighting, luxury automotive, speed' },
      { label: '향수/주류', prompt: 'Perfume liquor advertisement, dark moody lighting, golden liquid splash, elegant glass bottle, sensual luxury, mysterious, premium' },
      { label: '부동산/인테리어', prompt: 'Real estate interior design, bright airy space, floor-to-ceiling windows, modern furniture, architectural photography, clean luxury living' },
    ]
  },
  {
    category: '애니메이션 & 3D',
    items: [
      { label: '디즈니/픽사 3D', prompt: 'Disney Pixar 3D style, adorable character proportions, warm lighting, soft texture, 8k render, animation' },
      { label: '90s 레트로 애니', prompt: '90s anime style, cel shading, 4:3 aspect ratio vibe, slight noise, Sailor Moon style, retro aesthetic, vhs glitch' },
      { label: '신카이 마코토', prompt: 'Makoto Shinkai style, lens flare, hyper-realistic high quality background, vibrant blue sky, emotional anime' },
      { label: '클레이/스톱모션', prompt: 'Claymation style, stop motion, fingerprint textures on clay, jerky movement, cute, Aardman style, handmade' },
      { label: '팀 버튼', prompt: 'Tim Burton style, grotesque but cute, skinny limbs, dark and dreamy atmosphere, gothic, stop motion' },
      { label: '글래스모피즘', prompt: 'Glassmorphism 3D, translucent glass material, light refraction, stylish 3D icon look, clean, modern' },
      { label: '니트/털실 공예', prompt: 'Knitted wool texture, soft plush toy feel, crochet texture, cozy, handmade vibe, cute' },
      { label: '지브리', prompt: 'Studio Ghibli style, watercolor background, lush green nature, healing fluffy clouds, hand drawn, Miyazaki vibe' },
      { label: '현대 액션 애니', prompt: 'Modern action anime, Demon Slayer style, sharp lines, flashy effects, dynamic composition, high contrast' },
      { label: '아케인', prompt: 'Arcane style, oil painting brush texture on 3D, rough and trendy style, artistic, league of legends vibe' },
      { label: '로우 폴리', prompt: 'Low poly art, visible angular polygons, simple and cute game graphics, retro 3D, minimalist' },
      { label: '페이퍼 아트', prompt: 'Paper cut art, layered paper texture, shadow effects, fairytale depth, craft style, diorama' },
      { label: '복셀 아트', prompt: 'Voxel art, Minecraft style, world made of square cubes, 8-bit 3D, isometric' },
      { label: '스파이더버스', prompt: 'Spider-Verse style, mixed media animation, halftone dots, comic book panels, glitch effects, bold graphic pop, vibrant' },
      { label: '에지러너스', prompt: 'Cyberpunk Edgerunners style, neon-soaked anime, aggressive linework, high contrast, chrome and neon, fast-paced action, futuristic' },
      { label: '중국 3D 애니', prompt: 'Chinese 3D animation style, donghua, ethereal xianxia aesthetic, flowing robes, qi energy effects, mystical mountains, epic fantasy' },
      { label: '미니어처/틸트시프트', prompt: 'Miniature tilt-shift effect, tiny world diorama, selective focus blur, toy-like scene, vivid saturated colors, cute small scale' },
      { label: '이세카이 판타지', prompt: 'Isekai fantasy anime, vibrant magical world, RPG game UI overlay, adventurer party, glowing magic circles, colorful fantasy landscape' },
    ]
  },
  {
    category: '웹툰 & 코믹',
    items: [
      { label: 'K-웹툰', prompt: 'Korean webtoon style, clean digital coloring, trendy fashion, sophisticated lines, manhwa, solo leveling style' },
      { label: '미국 코믹스', prompt: 'American comic book style, Marvel/DC vibe, thick ink lines, exaggerated muscles, dynamic angles, bold colors' },
      { label: '흑백 출판 만화', prompt: 'Black and white manga, screentones, pen pressure details, speed lines, Slam Dunk style, high contrast' },
      { label: '4컷 인스타툰', prompt: '4-cut instatoon style, simple round lines, cute SD characters, daily life comic vibe, relatable' },
      { label: '감성 에세이 툰', prompt: 'Emotional essay toon, fragile lines, pastel coloring, book illustration feel, soft, healing' },
      { label: '로판', prompt: 'Romantic fantasy manhwa, fancy dresses, sparkling jewel eyes, roses and lace details, shoujo, royalty' },
      { label: '그래픽 노블', prompt: 'Graphic novel style, Sin City vibe, high contrast black and white with red point color, noir comic' },
      { label: '팝아트', prompt: 'Pop art style, Roy Lichtenstein, halftone dots, speech bubbles, vivid primary colors, comic art' },
      { label: '고전 명랑 만화', prompt: 'Classic Korean comic style, Dooly, thick simple lines, rough coloring, retro cartoon, funny' },
      { label: '호러/이토 준지', prompt: 'Ito Junji style, grotesque line touch, spiral patterns, creepy black and white horror, scary' },
      { label: '치비/SD', prompt: 'Chibi super deformed style, big head small body, 2-3 head proportions, cute exaggerated expressions, kawaii, adorable' },
      { label: '소녀만화', prompt: 'Shoujo manga style, sparkling eyes, flower backgrounds, soft pastel tones, romantic atmosphere, bishoujo, delicate linework' },
      { label: 'BL 만화', prompt: 'BL manga style, beautiful androgynous characters, dramatic emotional scenes, soft lighting, elegant composition, yaoi aesthetic' },
      { label: '무협 만화', prompt: 'Wuxia comic style, dynamic martial arts action, ink splash effects, flowing robes and hair, Chinese calligraphy, mountain scenery' },
    ]
  },
  {
    category: '스케치 & 스토리보드',
    items: [
      { label: '러프 펜슬 스케치', prompt: 'Rough pencil sketch, graphite texture, loose lines, initial idea storyboard style, messy but artistic' },
      { label: '마커 렌더링', prompt: 'Industrial design marker rendering, shading and point colors, product sketch style, copic marker' },
      { label: '실루엣', prompt: 'Silhouette art, strong backlight, character pose in black, dramatic contrast, mysterious' },
      { label: '목탄/차콜', prompt: 'Charcoal drawing, focus on light and shadow mass rather than line details, artistic, smudge' },
      { label: '고지도/양피지', prompt: 'Old map style, parchment paper texture, ink pen drawing, treasure map, fantasy map, vintage' },
      { label: '잉크 펜화', prompt: 'Ink pen drawing, architectural sketch style, clean and continuous black lines, hatching' },
      { label: '블루프린트', prompt: 'Blueprint style, white lines on blue background, architectural or mechanical structure, diagram' },
      { label: '스토리보드 썸네일', prompt: 'Storyboard thumbnail style, rough composition in boxes, scene flow visualization, cinematic plan' },
      { label: '칠판/초크 아트', prompt: 'Chalk art on blackboard, chalk texture, educational and analog feel, rough, dusty' },
      { label: '패션 크로키', prompt: 'Fashion croquis, exaggerated body proportions, focus on outfit texture, stylish line drawing, runway' },
    ]
  },
  {
    category: '아트 & 컨셉',
    items: [
      { label: '유화/임파스토', prompt: 'Impasto oil painting, thick paint texture, Van Gogh style, vivid colors, artistic, masterpiece' },
      { label: '동양 수묵화', prompt: 'Oriental ink wash painting, sumi-e, brush strokes, Korean landscape painting vibe, void space, artistic' },
      { label: '콜라주 아트', prompt: 'Collage art, cut-out magazine style, kitsch and hip, mixed media vibe, abstract' },
      { label: '픽셀 아트', prompt: 'Pixel art, retro game aesthetic, dot graphics, 8-bit style, arcade, colorful' },
      { label: '그래피티', prompt: 'Graffiti art, spray paint texture, street wall background, hiphop vibe, bold typography, street art' },
      { label: '지오메트릭', prompt: 'Geometric art, modern art pattern, repetition and arrangement of shapes, abstract, colorful' },
      { label: '80s 신스웨이브', prompt: '80s synthwave, purple sunset, palm trees, VHS noise, disco aesthetic, retro futuristic, neon' },
      { label: '1920s 아르데코', prompt: '1920s Art Deco, golden geometric patterns, Great Gatsby vibe, luxury, ornamental, elegant' },
      { label: '수채화', prompt: 'Watercolor painting, wet-on-wet effect, negative space, soft and lyrical atmosphere, artistic' },
      { label: '게임 컨셉 아트', prompt: 'Game concept art, matte painting, dense coloring, majestic fantasy/SF background, epic, high detail' },
      { label: '초현실주의', prompt: 'Surrealism, Dali/Magritte style, strange object arrangement, dreamlike scene, bizarre, artistic' },
      { label: '스테인드글라스', prompt: 'Stained glass art, colorful glass shards, lead lines, church light, translucent, holy' },
      { label: '네온 사인 아트', prompt: 'Neon sign art, shapes made only of glowing neon tubes, dark background, light painting, vibrant' },
      { label: '우키요에', prompt: 'Ukiyo-e style, Japanese woodblock print, wave patterns, unique perspective, traditional texture' },
      { label: '스팀펑크', prompt: 'Steampunk style, 19th century industrial revolution, brass gears, goggles, steam engine, SF, mechanical' },
      { label: '아르누보', prompt: 'Art Nouveau style, Alphonse Mucha, flowing organic lines, floral ornamental borders, elegant feminine figures, decorative, vintage poster' },
      { label: '점묘법', prompt: 'Pointillism style, Georges Seurat, tiny dots of pure color, impressionist landscape, vibrant optical mixing, scientific art' },
      { label: '바우하우스', prompt: 'Bauhaus design style, primary colors, geometric shapes, clean typography, modernist composition, functional art, minimalist graphic' },
      { label: '보태니컬 일러스트', prompt: 'Botanical illustration, scientific accuracy, delicate watercolor plants, vintage herbarium style, detailed leaves and flowers, natural history art' },
      { label: '고대 벽화', prompt: 'Ancient mural style, Egyptian hieroglyphics meets Aztec patterns, flat perspective, gold and turquoise, ceremonial, mythological scenes' },
      { label: '사이키델릭', prompt: 'Psychedelic art, trippy swirling patterns, rainbow gradient colors, 1960s counterculture, kaleidoscope effect, mind-bending visuals, groovy' },
      { label: 'MS 페인트', prompt: 'A crude, MS Paint-style digital illustration characterized by jagged, pixelated black outlines and flat, solid colors without any shading or texture. The drawing has a simplistic, meme-like aesthetic' },
      { label: '컨트리볼', prompt: 'Countryball Polandball meme art style, all characters are perfectly spherical round balls with national flag patterns painted on sphere surface, simple dot eyes (white circles with black outlines), NO arms NO legs NO limbs NO hands NO feet, crude hand-drawn thick black outlines, simple flat comic look, minimalist background, cute ball characters, political satire webcomic aesthetic, each country represented as a flag-painted sphere' },
    ]
  },
  {
    category: '포토그래피',
    items: [
      { label: '드론 에어리얼', prompt: 'Drone aerial photography, birds eye view, stunning landscape from above, geometric patterns in nature, golden hour, cinematic wide angle' },
      { label: '스트리트 스냅', prompt: 'Street photography, candid urban moments, decisive moment, high contrast black and white, raw city life, documentary, Henri Cartier-Bresson' },
      { label: '패션 에디토리얼', prompt: 'Fashion editorial photography, high-end studio lighting, avant-garde styling, bold poses, Vogue magazine cover, dramatic fashion portrait' },
      { label: '매크로 포토', prompt: 'Macro photography, extreme close-up, shallow depth of field, water droplets on petals, insect details, bokeh background, ultra sharp' },
      { label: '장노출', prompt: 'Long exposure photography, silky smooth water, light trails at night, star trails in sky, ethereal motion blur, dreamy, time-lapse feel' },
      { label: '필름 카메라', prompt: 'Film camera photography, Kodak Portra 400 film look, warm skin tones, natural grain, slightly overexposed, nostalgic analog feel, 35mm' },
    ]
  }
];

// ─── Helpers ───

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── API call: text-to-image ───

async function generateImage(prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      imageMimeType: "image/jpeg"
    }
  };

  const res = await fetchWithTimeout(`${API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.status === 402) throw new Error('INSUFFICIENT_BALANCE');
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error('No candidates in response');

  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) {
    const textPart = parts.find(p => p.text);
    throw new Error(`No image returned. Text: ${textPart?.text?.slice(0, 200) || 'none'}`);
  }
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

// ─── Main ───

async function main() {
  log('=== Visual Style Preview Generator ===');
  log(`Output: ${OUTPUT_DIR}`);
  log(`Concurrency: ${CONCURRENCY}`);

  // Ensure output dirs exist
  for (let i = 0; i < VISUAL_STYLES.length; i++) {
    fs.mkdirSync(path.join(OUTPUT_DIR, String(i)), { recursive: true });
  }

  // Build task list (skip existing)
  const tasks = [];
  for (let catIdx = 0; catIdx < VISUAL_STYLES.length; catIdx++) {
    const cat = VISUAL_STYLES[catIdx];
    for (let itemIdx = 0; itemIdx < cat.items.length; itemIdx++) {
      const outPath = path.join(OUTPUT_DIR, String(catIdx), `${itemIdx}.jpg`);
      if (fs.existsSync(outPath)) continue;
      tasks.push({ catIdx, itemIdx, item: cat.items[itemIdx], outPath });
    }
  }

  if (tasks.length === 0) {
    log('All images already exist! Nothing to do.');
    return;
  }

  const totalItems = VISUAL_STYLES.reduce((sum, cat) => sum + cat.items.length, 0);
  log(`Tasks remaining: ${tasks.length} / ${totalItems}`);

  // Worker pool with work-stealing
  let completed = 0;
  let failed = 0;
  const failures = [];

  const taskIter = tasks[Symbol.iterator]();

  async function worker() {
    for (const task of taskIter) {
      const { catIdx, itemIdx, item, outPath } = task;
      const label = `[${catIdx}/${itemIdx}] ${item.label}`;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const prompt = `${BASE_SCENE}. Visual style: ${item.prompt}. 1:1 square.`;
          const buf = await generateImage(prompt);

          fs.writeFileSync(outPath, buf);
          completed++;
          log(`✓ ${label} (${(buf.length / 1024).toFixed(1)} KB) [${completed}/${tasks.length}]`);
          break;

        } catch (err) {
          if (err.message === 'INSUFFICIENT_BALANCE') {
            log(`✗ ${label} — INSUFFICIENT BALANCE! 충전이 필요합니다.`);
            process.exit(1);
          }

          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            log(`⟳ ${label} — retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s: ${err.message.slice(0, 100)}`);
            await sleep(delay);
          } else {
            failed++;
            failures.push({ label, error: err.message.slice(0, 100) });
            log(`✗ ${label} — FAILED after ${MAX_RETRIES} attempts: ${err.message.slice(0, 100)}`);
          }
        }
      }
    }
  }

  const workers = Array(CONCURRENCY).fill(null).map(() => worker());
  await Promise.all(workers);

  // Summary
  log('');
  log('=== Summary ===');
  log(`Total: ${tasks.length} | Success: ${completed} | Failed: ${failed}`);
  if (failures.length > 0) {
    log('Failed items:');
    failures.forEach(f => log(`  - ${f.label}: ${f.error}`));
  }

  // Verify total files
  let totalFiles = 0;
  const expectedCounts = VISUAL_STYLES.map(cat => cat.items.length);
  for (let c = 0; c < expectedCounts.length; c++) {
    for (let i = 0; i < expectedCounts[c]; i++) {
      if (fs.existsSync(path.join(OUTPUT_DIR, String(c), `${i}.jpg`))) totalFiles++;
    }
  }
  const totalExpected = expectedCounts.reduce((a, b) => a + b, 0);
  log(`Total files on disk: ${totalFiles} / ${totalExpected}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
