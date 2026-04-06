#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

rm -rf build
mkdir -p build/icons

node_modules/.bin/tsc --noEmit

node_modules/.bin/esbuild src/main.tsx \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2020 \
  --outfile=build/bundle.js \
  --jsx=automatic \
  --external:premierepro \
  --external:uxp \
  --loader:.css=text \
  --define:process.env.NODE_ENV='"production"' \
  --minify

cp index.html build/index.html
cp manifest.json build/manifest.json
cp -r icons/* build/icons/ 2>/dev/null || true
cp src/styles/globals.css build/globals.css

echo "✅ Build complete: $(pwd)/build"
echo "→ Load build/ in UDT v2.2.1"
