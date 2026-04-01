#!/bin/bash
# ============================================================
# Motion Master — ZXP 패키징 스크립트
#
# 사전 요구:
#   - ZXPSignCmd가 PATH에 있거나 signing/ 폴더에 있어야 함
#   - signing/cert.p12 인증서 파일 필요
#
# 사용법:
#   bash scripts/package.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$EXTENSION_DIR/dist"
CERT_FILE="$EXTENSION_DIR/signing/cert.p12"
CERT_PASS="motionmaster2026"
TIMESTAMP_URL="http://time.certum.pl/"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Motion Master — ZXP 패키징              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ZXPSignCmd 찾기
ZXPSIGN=""
if command -v ZXPSignCmd &> /dev/null; then
    ZXPSIGN="ZXPSignCmd"
elif [ -f "$EXTENSION_DIR/signing/ZXPSignCmd" ]; then
    ZXPSIGN="$EXTENSION_DIR/signing/ZXPSignCmd"
elif [ -f "/Applications/ZXPSignCmd" ]; then
    ZXPSIGN="/Applications/ZXPSignCmd"
else
    echo "❌ ZXPSignCmd를 찾을 수 없습니다."
    echo "   다운로드: https://github.com/nicolerenee/CEP-Resources/tree/master/ZXPSignCMD"
    exit 1
fi
echo "→ ZXPSignCmd: $ZXPSIGN"

# 인증서 확인/생성
if [ ! -f "$CERT_FILE" ]; then
    echo "→ 인증서가 없습니다. 자체 서명 인증서를 생성합니다..."
    mkdir -p "$EXTENSION_DIR/signing"
    "$ZXPSIGN" -selfSignedCert \
        KR Seoul GrooveLab MotionMaster "$CERT_PASS" "$CERT_FILE" \
        -validityDays 1825
    echo "  ✅ cert.p12 생성 완료 (5년 유효)"
fi

# 출력 폴더
mkdir -p "$OUTPUT_DIR"

# .debug 파일 임시 제거 (배포 빌드에 포함하지 않음)
DEBUG_FILE="$EXTENSION_DIR/.debug"
DEBUG_BACKUP=""
if [ -f "$DEBUG_FILE" ]; then
    DEBUG_BACKUP="$EXTENSION_DIR/.debug.bak"
    mv "$DEBUG_FILE" "$DEBUG_BACKUP"
    echo "→ .debug 파일 임시 제거 (배포 빌드)"
fi

# ZXP 패키징 + 서명
OUTPUT_FILE="$OUTPUT_DIR/MotionMaster.zxp"
echo "→ 패키징 중..."
"$ZXPSIGN" -sign "$EXTENSION_DIR" "$OUTPUT_FILE" "$CERT_FILE" "$CERT_PASS" -tsa "$TIMESTAMP_URL"

# .debug 복원
if [ -n "$DEBUG_BACKUP" ]; then
    mv "$DEBUG_BACKUP" "$DEBUG_FILE"
fi

# 결과 확인
if [ -f "$OUTPUT_FILE" ]; then
    SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║  ✅ 패키징 완료!                         ║"
    echo "║                                          ║"
    echo "║  출력: dist/MotionMaster.zxp ($SIZE)     ║"
    echo "╚══════════════════════════════════════════╝"

    # 서명 검증
    echo ""
    echo "→ 서명 검증..."
    "$ZXPSIGN" -verify "$OUTPUT_FILE" -certinfo
else
    echo ""
    echo "❌ 패키징 실패!"
    exit 1
fi
