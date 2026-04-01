#!/bin/bash
# ============================================================
# Motion Master — 개발용 설치 스크립트
# Premiere Pro의 CEP 확장 폴더에 심볼릭 링크를 생성한다.
#
# 사용법:
#   bash scripts/install-dev.sh
#
# ⚠️ Premiere Pro를 재시작해야 확장이 나타남
# ============================================================

EXTENSION_ID="com.groovelab.motionmaster"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Motion Master — 개발 설치               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# OS 감지
if [ "$(uname)" = "Darwin" ]; then
    # macOS
    CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"

    # macOS Sonoma+에서 PlayerDebugMode 설정 (unsigned 확장 허용)
    echo "→ PlayerDebugMode 활성화 중..."
    defaults write com.adobe.CSXS.12 PlayerDebugMode 1
    defaults write com.adobe.CSXS.11 PlayerDebugMode 1
    echo "  ✅ PlayerDebugMode = 1"
else
    # Windows
    CEP_DIR="$APPDATA/Adobe/CEP/extensions"

    echo "→ PlayerDebugMode 활성화 (레지스트리)..."
    reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f 2>/dev/null
    reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f 2>/dev/null
    echo "  ✅ 레지스트리 설정 완료"
fi

# 확장 폴더 생성
mkdir -p "$CEP_DIR"

# 기존 링크/폴더 제거
if [ -L "$CEP_DIR/$EXTENSION_ID" ] || [ -d "$CEP_DIR/$EXTENSION_ID" ]; then
    echo "→ 기존 설치 제거: $CEP_DIR/$EXTENSION_ID"
    rm -rf "$CEP_DIR/$EXTENSION_ID"
fi

# 심볼릭 링크 생성
ln -s "$EXTENSION_DIR" "$CEP_DIR/$EXTENSION_ID"
echo "→ 심볼릭 링크 생성:"
echo "  $CEP_DIR/$EXTENSION_ID → $EXTENSION_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ 설치 완료!                           ║"
echo "║                                          ║"
echo "║  Premiere Pro를 재시작하면                ║"
echo "║  Window → Extensions → Motion Master     ║"
echo "║  에서 패널을 열 수 있습니다.               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
