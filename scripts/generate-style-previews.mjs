#!/usr/bin/env node
/**
 * generate-style-previews.mjs
 *
 * 기준 캐릭터 1장 생성 후, CHARACTER_STYLES 100개 스타일 적용 이미지를 배치 생성.
 * 결과물: src/public/style-previews/base.jpg + {catIdx}/{itemIdx}.jpg
 *
 * 사용법: node scripts/generate-style-previews.mjs
 * 재개 가능: 이미 존재하는 파일은 건너뜀
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../src/public/style-previews');

// ─── Config ───
const API_URL = 'https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent';
const API_KEY = 'REDACTED_LAOZHANG_KEY';
const CONCURRENCY = 10;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

// ─── CHARACTER_STYLES inline copy (prompt + label only) ───
const CHARACTER_STYLES = [
  {
    category: "질감 & 소재",
    items: [
      { label: "털실 인형", prompt: "crochet knitted wool texture, amigurumi style, cute, soft lighting" },
      { label: "양모 펠트", prompt: "needle felted texture, fuzzy surface, wool felt, handmade toy look" },
      { label: "플라스틱 토이", prompt: "shiny plastic texture, toy figure, smooth surface, injection molding lines" },
      { label: "레고 블록", prompt: "lego brick construction, voxel art, plastic studs, blocky" },
      { label: "클레이", prompt: "play-doh clay texture, stop motion style, fingerprints, matte finish, cute" },
      { label: "투명 유리", prompt: "transparent glass sculpture, refraction, crystal clear, fragile, caustic lighting" },
      { label: "반투명 젤리", prompt: "translucent slime texture, gooey, dripping, gummy bear material, subsurface scattering" },
      { label: "황금", prompt: "solid gold statue, highly reflective, metallic sheen, luxury, studio lighting" },
      { label: "풍선", prompt: "balloon animal style, inflated latex texture, shiny, round edges, helium" },
      { label: "종이접기", prompt: "folded paper texture, origami style, sharp creases, paper craft, geometric" },
      { label: "골판지", prompt: "corrugated cardboard texture, recycled paper look, boxy, diy craft, rough edges" },
      { label: "원목 조각", prompt: "hand carved wood, wood grain texture, wooden puppet, pinocchio style, varnished" },
      { label: "도자기", prompt: "cracked porcelain doll, ceramic texture, glazed surface, vintage, fragile" },
      { label: "네온 사인", prompt: "glowing neon tubes, light painting, cyberpunk lighting, dark background, glass tubing" },
      { label: "슬라임", prompt: "liquid slime creature, dripping, viscous, wet surface, glossy" },
      { label: "설탕 공예", prompt: "hard candy texture, translucent sugar, glossy, sweet, edible look" },
      { label: "솜 인형", prompt: "plush toy texture, soft cotton stuffing, visible seams, fabric texture" },
      { label: "가죽 스티치", prompt: "stitched leather texture, vintage doll, heavy stitching, worn leather" },
      { label: "얼음 조각", prompt: "carved ice statue, translucent, cold blue lighting, melting details" },
      { label: "비눗방울", prompt: "soap bubble texture, iridescent, transparent film, rainbow reflection" },
    ]
  },
  {
    category: "3D & 렌더링",
    items: [
      { label: "픽사 스타일", prompt: "pixar style 3D, disney animation, cute proportions, perfect lighting, subsurface scattering" },
      { label: "지점토 애니", prompt: "aardman style, stop motion, claymation, plasticine texture, fingerprints, handmade look" },
      { label: "언리얼 엔진 5", prompt: "unreal engine 5 render, lumen, nanite, high fidelity, game cinematic, 8k" },
      { label: "포트나이트", prompt: "fortnite visual style, stylized 3d, vibrant colors, cartoon shader, exaggerated proportions" },
      { label: "로우 폴리", prompt: "low poly 3d, faceted geometry, retro game style, simple shapes, ps1 graphics, jagged edges" },
      { label: "피규어", prompt: "funko pop vinyl figure, big head, black button eyes, box packaging look, plastic" },
      { label: "넨도로이드", prompt: "nendoroid style, chibi anime figure, plastic joint, cute, big head" },
      { label: "구체관절 인형", prompt: "ball jointed doll, realistic resin texture, doll joints, glass eyes, bjd" },
      { label: "블리자드", prompt: "warcraft cinematic style, detailed texture, heroic lighting, epic, blizzard entertainment style" },
      { label: "롤 일러스트", prompt: "riot games splash art style, dynamic duo, painterly 3d, highly detailed, dramatic lighting" },
      { label: "심즈 4", prompt: "the sims 4 style, semi-realistic, game character creator look, smooth skin" },
      { label: "마인크래프트", prompt: "minecraft style, pixelated blocks, square head, 8-bit texture, voxel" },
      { label: "팀 버튼 3D", prompt: "tim burton style 3d, nightmare before christmas, skinny, spooky, dark fantasy" },
      { label: "사이버펑크", prompt: "cyberpunk 2077 character, chrome skin, implants, neon rim light, futuristic" },
      { label: "오버워치", prompt: "overwatch style, blizzard character, clean texture, stylized pbr" },
      { label: "클래시 오브 클랜", prompt: "clash of clans style, supercell art, mobile game 3d, render" },
      { label: "동물의 숲", prompt: "animal crossing style, soft fuzzy texture, cute, round shapes, nintendo style" },
      { label: "메이플 2", prompt: "maplestory 2 style, voxel character, cute, blocky, chibi" },
      { label: "젤다 야숨", prompt: "breath of the wild style, cel shaded 3d, watercolor texture, soft lighting" },
      { label: "아케인", prompt: "arcane series style, netflix animation, painterly texture, 3d mixed with 2d" },
      { label: "Zack D Films", prompt: "hyper-realistic 3D CGI educational animation style, intense subsurface scattering SSS, fleshy soft silicone skin texture, wet specular highlights, microscopic pore details, clinical studio lighting, soft global illumination, bright rim light, rendered in OctaneRender path tracing, grotesque yet clinical realism, clean solid pastel background, 8k resolution" },
    ]
  },
  {
    category: "2D & 일러스트",
    items: [
      { label: "지브리", prompt: "studio ghibli style, hayao miyazaki, anime cel shading, lush colors, hand drawn" },
      { label: "90년대 애니", prompt: "90s anime aesthetic, sailor moon style, grainy vhs effect, cel shaded, retro" },
      { label: "미국 카툰", prompt: "cartoon network style, thick outlines, flat colors, dexter's lab style, simple" },
      { label: "심슨 가족", prompt: "the simpsons style, yellow skin, bulging eyes, matt groening style, flat color" },
      { label: "종이 인형극", prompt: "south park style, construction paper cutout, simple shapes, textured paper" },
      { label: "디즈니 클래식", prompt: "classic disney 2d animation, hand drawn, fluid lines, 1990s disney style" },
      { label: "웹툰 스타일", prompt: "korean webtoon style, digital manhwa, sharp lines, glowing effects, solo leveling style" },
      { label: "도트 픽셀", prompt: "8-bit pixel art, retro game sprite, nes style, limited color palette, blocky" },
      { label: "고해상도 픽셀", prompt: "16-bit pixel art, snes style, detailed pixel shading, octopath traveler style" },
      { label: "벡터 아트", prompt: "vector illustration, flat design, corporate art style, minimalism, clean lines" },
      { label: "그래피티", prompt: "graffiti art, spray paint texture, street wall, drip effect, hip hop style" },
      { label: "팝 아트", prompt: "andy warhol style, pop art, halftone dots, vibrant contrasting colors, comic style" },
      { label: "미국 코믹스", prompt: "american comic book style, heavy black ink, hatching, speech bubbles, marvel style" },
      { label: "우키요에", prompt: "ukiyo-e style, japanese woodblock print, hokusai wave texture, traditional ink" },
      { label: "타로 카드", prompt: "tarot card illustration, art nouveau, mucha style, decorative border, intricate" },
      { label: "크레용 낙서", prompt: "child's drawing, crayon texture, scribbles, rough paper, naive art, colorful" },
      { label: "오일 파스텔", prompt: "oil pastel drawing, textured stroke, vibrant, blending, rough paper" },
      { label: "수채화", prompt: "watercolor painting, wet on wet, paint bleeds, soft pastel colors, artistic" },
      { label: "유화", prompt: "impasto oil painting, thick brush strokes, textured canvas, van gogh style" },
      { label: "스테인드 글라스", prompt: "stained glass window, colorful glass shards, lead lines, church light, translucent" },
      { label: "MS 페인트", prompt: "A crude, MS Paint-style digital illustration characterized by jagged, pixelated black outlines and flat, solid colors without any shading or texture. The drawing has a simplistic, meme-like aesthetic" },
      { label: "컨트리볼", prompt: "Countryball Polandball meme style, perfectly spherical round ball shape, country flag pattern as skin texture, small simple dot eyes (tiny white circles with black pupils), absolutely NO arms NO legs NO limbs NO hands NO feet, crude hand-drawn thick black outlines, simple flat comic look, white background, cute ball character, political satire webcomic aesthetic" },
    ]
  },
  {
    category: "테마 & 컨셉",
    items: [
      { label: "사이버 펑크", prompt: "cyberpunk theme, neon lights, high tech, futuristic, night city background" },
      { label: "스팀 펑크", prompt: "steampunk style, brass goggles, gears, leather, victorian sci-fi, steam engine" },
      { label: "좀비", prompt: "zombie texture, decaying skin, undead, horror movie makeup, scary" },
      { label: "유령", prompt: "ghostly spirit, translucent blue, glowing aura, ethereal, floating" },
      { label: "로봇", prompt: "mecha robot, metal plates, exposed wires, led eyes, mechanical" },
      { label: "돌 석상", prompt: "living stone statue, cracked stone texture, mossy, ancient ruin style" },
      { label: "홀로그램", prompt: "star wars hologram, blue wireframe projection, scanlines, flickering, semi-transparent" },
      { label: "매드맥스", prompt: "post-apocalyptic wasteland style, dusty, dirt, scavenged gear, rusty" },
      { label: "파스텔 고스", prompt: "pastel goth aesthetic, cute but creepy, pink and black, skulls and bows" },
      { label: "외계 생명체", prompt: "alien biological texture, slimy, purple skin, strange eyes, extraterrestrial" },
      { label: "불의 정령", prompt: "made of fire, burning flames, magma skin, glowing, elemental" },
      { label: "물의 정령", prompt: "made of liquid water, splashing, droplets, fluid simulation, blue" },
      { label: "빛의 정령", prompt: "divine being, glowing eyes, halo, golden aura, angelic, ethereal" },
      { label: "어둠의 다크", prompt: "made of shadows, dark aura, red eyes, smoke body, scary" },
      { label: "글리치", prompt: "digital glitch art, datamoshing, rgb split, corrupted file, distorted" },
      { label: "열화상 카메라", prompt: "thermal camera imaging, heat map colors, predator vision, infrared" },
      { label: "적외선", prompt: "infrared photography, dreamy pink and white, false color, surreal" },
      { label: "초콜릿", prompt: "made of chocolate, edible texture, carved cocoa, sweet" },
      { label: "보석", prompt: "made of diamond and ruby, crystal texture, refracting light, expensive" },
      { label: "우주", prompt: "galaxy skin, stars inside body, nebula texture, cosmic entity" },
    ]
  },
  {
    category: "생물 변형",
    items: [
      { label: "고양이 수인", prompt: "cat-folk, cat ears and tail, fur texture, cute whiskers, anthropomorphic" },
      { label: "강아지 수인", prompt: "dog-folk, dog ears, puppy nose, fur texture, anthropomorphic" },
      { label: "토끼 수인", prompt: "bunny-folk, long rabbit ears, cute nose, fluffy tail, anthropomorphic" },
      { label: "여우 수인", prompt: "fox-folk, fluffy fox tail, fox ears, orange fur, anthropomorphic" },
      { label: "늑대 인간", prompt: "werewolf, wolf head, fur body, claws, scary, anthropomorphic" },
      { label: "뱀파이어", prompt: "vampire, pale skin, red eyes, fangs, noble clothes, gothic" },
      { label: "엘프", prompt: "elf, pointy ears, beautiful face, elegant, fantasy style" },
      { label: "오크", prompt: "orc, green skin, tusks, muscular, tribal gear, fantasy style" },
      { label: "천사", prompt: "angel, white feathered wings, halo, holy light, divine" },
      { label: "악마", prompt: "devil, horns, bat wings, red skin, tail, scary" },
      { label: "슬라임 인간", prompt: "slime-folk, translucent jelly body, cute face inside slime" },
      { label: "식물 인간", prompt: "plant-folk, leaves for hair, bark skin, flowers, dryad" },
      { label: "머맨/머메이드", prompt: "merfolk, scales, fins, aquatic features, gills" },
      { label: "드래곤 인간", prompt: "dragon-born, dragon scales, horns, reptile eyes, tail" },
      { label: "새 인간", prompt: "avian-folk, feathers, beak, wings on arms, bird legs" },
      { label: "곰 인형", prompt: "living teddy bear, stitches, button eyes, cute" },
      { label: "진저브레드", prompt: "gingerbread man, cookie texture, icing details, baked" },
      { label: "로봇", prompt: "android, synthetic skin, mechanical joints, artificial" },
      { label: "사이보그", prompt: "cyborg, half human half machine, mechanical eye, metal arm" },
      { label: "미라", prompt: "mummy, wrapped in bandages, glowing eyes, ancient" },
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

// ─── API call: image-to-image (style transfer) ───

async function transformImage(baseImageB64, stylePrompt) {
  const body = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: baseImageB64
          }
        },
        {
          text: `Transform this character into ${stylePrompt} style. Keep full body, front view, white background, 1:1 square aspect ratio.`
        }
      ]
    }],
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

  // Check for safety block
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    throw new Error(`BLOCKED_${finishReason}`);
  }

  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error('No candidates in response');

  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) {
    const textPart = parts.find(p => p.text);
    throw new Error(`No image returned. Text: ${textPart?.text?.slice(0, 200) || 'none'}`);
  }
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

// ─── Fallback: text-only generation (no reference image) ───

async function generateStyleTextOnly(stylePrompt) {
  const prompt = `A simple full-body illustration of a young man in his 20s, standing straight, front view, neutral expression, casual clothes (white t-shirt, blue jeans, sneakers), centered, white background, 1:1 square aspect ratio, rendered in ${stylePrompt} style.`;
  return generateImage(prompt);
}

// ─── Main ───

async function main() {
  log('=== Style Preview Generator ===');
  log(`Output: ${OUTPUT_DIR}`);
  log(`Concurrency: ${CONCURRENCY}`);

  // Ensure output dirs exist
  for (let i = 0; i < 5; i++) {
    fs.mkdirSync(path.join(OUTPUT_DIR, String(i)), { recursive: true });
  }

  // Step 1: Generate base character
  const basePath = path.join(OUTPUT_DIR, 'base.jpg');
  let baseImageB64;

  if (fs.existsSync(basePath)) {
    log('Base image already exists, loading...');
    baseImageB64 = fs.readFileSync(basePath).toString('base64');
  } else {
    log('Generating base character...');
    const basePrompt = "A simple 2D full-body illustration of a young man in his 20s, standing straight, front view, neutral expression, casual clothes (white t-shirt, blue jeans, sneakers), clean flat colors, white background, centered, character design sheet, 1:1 square aspect ratio";
    const buf = await generateImage(basePrompt);
    fs.writeFileSync(basePath, buf);
    baseImageB64 = buf.toString('base64');
    log(`Base character saved (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  // Step 2: Build task list (skip existing)
  const tasks = [];
  for (let catIdx = 0; catIdx < CHARACTER_STYLES.length; catIdx++) {
    const cat = CHARACTER_STYLES[catIdx];
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

  log(`Tasks remaining: ${tasks.length} / 100`);

  // Step 3: Worker pool with work-stealing
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
          // Try image-to-image first, fallback to text-only
          let buf;
          try {
            buf = await transformImage(baseImageB64, item.prompt);
          } catch (e) {
            if (e.message.includes('BLOCKED_') || e.message.includes('No image returned') || e.message.includes('No candidates')) {
              log(`${label} — image-to-image blocked, trying text-only...`);
              buf = await generateStyleTextOnly(item.prompt);
            } else {
              throw e;
            }
          }

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
  if (fs.existsSync(basePath)) totalFiles++;
  const totalExpected = CHARACTER_STYLES.reduce((sum, cat) => sum + cat.items.length, 0);
  for (let c = 0; c < CHARACTER_STYLES.length; c++) {
    for (let i = 0; i < CHARACTER_STYLES[c].items.length; i++) {
      if (fs.existsSync(path.join(OUTPUT_DIR, String(c), `${i}.jpg`))) totalFiles++;
    }
  }
  log(`Total files on disk: ${totalFiles} / ${totalExpected + 1} (including base)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
