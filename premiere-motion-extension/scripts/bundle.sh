#!/bin/bash
# Motion Master — Module Bundler
# ES module import/export를 제거하고 모든 모듈을 단일 IIFE 스크립트로 합친다.
# CEP file:// 로딩에서 ES module이 MIME/CORS 이슈로 막히는 것을 방지.

set -e

SRC_DIR="$(cd "$(dirname "$0")/../client/src" && pwd)"
OUT_FILE="$SRC_DIR/bundle.js"

echo "Bundling Motion Master modules..."

cat > "$OUT_FILE" <<'HEADER'
/**
 * Motion Master — Bundled CEP Panel Script
 * 자동 생성됨 — 직접 수정하지 말 것. bundle.sh를 실행하여 재생성.
 *
 * ES module import/export를 제거하고 IIFE로 래핑하여
 * CEP file:// 로딩 호환성을 보장한다.
 */
(function() {
'use strict';

HEADER

# presets.js 추가 (export 키워드 제거)
echo "// ═══ presets.js ═══" >> "$OUT_FILE"
sed -e 's/^export //g' "$SRC_DIR/presets.js" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"

# smartRandom.js 추가 (import/export 제거)
echo "// ═══ smartRandom.js ═══" >> "$OUT_FILE"
sed -e '/^import /d' -e 's/^export //g' "$SRC_DIR/smartRandom.js" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"

# focalDetector.js 추가 (export 제거)
echo "// ═══ focalDetector.js ═══" >> "$OUT_FILE"
sed -e 's/^export //g' "$SRC_DIR/focalDetector.js" >> "$OUT_FILE"
echo "" >> "$OUT_FILE"

# app.js 추가 (import 제거)
echo "// ═══ app.js ═══" >> "$OUT_FILE"
sed -e '/^import /d' "$SRC_DIR/app.js" >> "$OUT_FILE"

cat >> "$OUT_FILE" <<'FOOTER'

})();
FOOTER

echo "✅ Bundle created: $OUT_FILE"
wc -l "$OUT_FILE"
