#!/usr/bin/env node
/**
 * compress-previews.mjs
 *
 * 캐릭터 스타일 미리보기(102장) + 비주얼 스타일 미리보기(75장)를
 * 250×250 JPEG q60 (~10KB)으로 일괄 압축.
 *
 * 사용법: node scripts/compress-previews.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/package.json'));
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  {
    name: 'style-previews (캐릭터)',
    dir: path.resolve(__dirname, '../src/public/style-previews'),
  },
  {
    name: 'visual-previews (비주얼)',
    dir: path.resolve(__dirname, '../src/public/visual-previews'),
  },
];

const SIZE = 512;
const QUALITY = 80;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function collectJpgFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJpgFiles(fullPath));
    } else if (/\.jpe?g$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function compressFile(filePath) {
  const originalBuf = fs.readFileSync(filePath);
  const originalSize = originalBuf.length;

  const compressedBuf = await sharp(originalBuf)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(filePath, compressedBuf);

  return {
    original: originalSize,
    compressed: compressedBuf.length,
  };
}

async function main() {
  log('=== Preview Image Compressor ===');
  log(`Target: ${SIZE}×${SIZE} JPEG q${QUALITY} (mozjpeg)`);

  let grandTotalOriginal = 0;
  let grandTotalCompressed = 0;
  let grandTotalFiles = 0;

  for (const target of TARGETS) {
    log('');
    log(`--- ${target.name} ---`);
    log(`Dir: ${target.dir}`);

    const files = collectJpgFiles(target.dir);
    if (files.length === 0) {
      log('No JPEG files found, skipping.');
      continue;
    }

    log(`Found ${files.length} JPEG files`);

    let totalOriginal = 0;
    let totalCompressed = 0;

    for (let i = 0; i < files.length; i++) {
      const rel = path.relative(target.dir, files[i]);
      try {
        const result = await compressFile(files[i]);
        totalOriginal += result.original;
        totalCompressed += result.compressed;
        log(`✓ ${rel}: ${(result.original / 1024).toFixed(1)}KB → ${(result.compressed / 1024).toFixed(1)}KB`);
      } catch (err) {
        log(`✗ ${rel}: ${err.message}`);
      }
    }

    const ratio = totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : '0';
    log(`Subtotal: ${files.length} files, ${(totalOriginal / 1024 / 1024).toFixed(2)}MB → ${(totalCompressed / 1024 / 1024).toFixed(2)}MB (${ratio}% reduction)`);

    grandTotalOriginal += totalOriginal;
    grandTotalCompressed += totalCompressed;
    grandTotalFiles += files.length;
  }

  log('');
  log('=== Grand Total ===');
  const grandRatio = grandTotalOriginal > 0 ? ((1 - grandTotalCompressed / grandTotalOriginal) * 100).toFixed(1) : '0';
  log(`${grandTotalFiles} files, ${(grandTotalOriginal / 1024 / 1024).toFixed(2)}MB → ${(grandTotalCompressed / 1024 / 1024).toFixed(2)}MB (${grandRatio}% reduction)`);
  log(`Average per file: ${grandTotalFiles > 0 ? (grandTotalCompressed / grandTotalFiles / 1024).toFixed(1) : 0}KB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
