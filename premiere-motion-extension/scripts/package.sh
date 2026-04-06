#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

bash scripts/build.sh

mkdir -p releases
OUTPUT_FILE="releases/motion-master-premiere-uxp-2.0.0.ccx"

if [ -n "${UDT_PATH:-}" ]; then
  UDT_BIN="$UDT_PATH"
elif command -v udt >/dev/null 2>&1; then
  UDT_BIN="$(command -v udt)"
elif [ -x "/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/Adobe UXP Developer Tool" ]; then
  UDT_BIN="/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/Adobe UXP Developer Tool"
else
  echo "UDT v2.2.1 was not found. Set UDT_PATH to the Adobe UXP Developer Tool binary."
  exit 1
fi

echo "Packaging build/ with UDT: $UDT_BIN"
"$UDT_BIN" package build "$OUTPUT_FILE" || {
  echo "UDT packaging command failed. Verify the CLI syntax for your UDT installation."
  exit 1
}

echo "Created $OUTPUT_FILE"
