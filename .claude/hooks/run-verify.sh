#!/bin/bash
# ============================================================
# Verification Loop Script — 검증 1회 실행 + 로그 기록
#
# 사용법:
#   bash .claude/hooks/run-verify.sh
#
# 하는 일:
#   1. .phase-ready에서 검색어 읽기
#   2. grep 전수 재검색 (빠진 연결점 확인)
#   3. tsc --noEmit (타입 에러 0개 확인)
#   4. vite build (빌드 성공 확인)
#   5. 모두 통과 시 .verify-log에 타임스탬프 기록
#   6. 현재 검증 횟수 표시
#
# pre-commit-check.sh가 .verify-log의 엔트리 수를 확인하여
# 10회 미만이면 커밋을 물리적으로 차단 (exit 2)
# ============================================================

PROJECT_DIR="/Users/mac_mini/Downloads/all-in-one-production-build4"
SRC_DIR="$PROJECT_DIR/src"
GATE_FILE="$PROJECT_DIR/.phase-ready"
VERIFY_LOG="$PROJECT_DIR/.verify-log"

# ──────────────────────────────────────────────
# 사전 조건: .phase-ready 존재 확인
# ──────────────────────────────────────────────
if [ ! -f "$GATE_FILE" ]; then
    echo "❌ .phase-ready가 없다 — prepare-work.sh를 먼저 실행하라"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     검증 루프 실행 중                              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

ERRORS=()

# ──────────────────────────────────────────────
# STEP 1: grep 전수 재검색
# ──────────────────────────────────────────────
SEARCH_TERMS=$(head -1 "$GATE_FILE" | sed 's/^# Phase-Ready: //')
echo "🔍 grep 재검증: $SEARCH_TERMS"

for TERM in $SEARCH_TERMS; do
    RESULTS=$(grep -rn --include="*.ts" --include="*.tsx" "$TERM" "$SRC_DIR" 2>/dev/null | grep -v node_modules)
    MATCH_COUNT=$(echo "$RESULTS" | grep -c '.' 2>/dev/null || echo 0)
    echo "   [$TERM] ${MATCH_COUNT}건"
done
echo "   ✅ grep 완료"
echo ""

# ──────────────────────────────────────────────
# STEP 2: tsc --noEmit
# ──────────────────────────────────────────────
echo "🔧 tsc --noEmit 실행 중..."
TSC_OUTPUT=$(cd "$SRC_DIR" && ./node_modules/typescript/bin/tsc --noEmit 2>&1)
TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -c 'error TS' || true)

if [ "$TSC_ERRORS" -gt 0 ] 2>/dev/null; then
    ERRORS+=("❌ tsc 에러 ${TSC_ERRORS}건:")
    while IFS= read -r line; do
        ERRORS+=("   $line")
    done < <(echo "$TSC_OUTPUT" | grep 'error TS' | head -5)
else
    echo "   ✅ tsc 통과 (에러 0건)"
fi
echo ""

# ──────────────────────────────────────────────
# STEP 3: vite build
# ──────────────────────────────────────────────
echo "📦 vite build 실행 중..."
BUILD_OUTPUT=$(cd "$SRC_DIR" && npx vite build 2>&1)
BUILD_SUCCESS=$(echo "$BUILD_OUTPUT" | grep -c '✓ built in')

if [ "$BUILD_SUCCESS" -eq 0 ]; then
    ERRORS+=("❌ vite build 실패:")
    while IFS= read -r line; do
        ERRORS+=("   $line")
    done < <(echo "$BUILD_OUTPUT" | grep -iE 'error|fail' | head -5)
else
    BUILD_TIME=$(echo "$BUILD_OUTPUT" | grep '✓ built in' | sed 's/.*built in //')
    echo "   ✅ build 성공 ($BUILD_TIME)"
fi
echo ""

# ──────────────────────────────────────────────
# 결과 판정
# ──────────────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "🚨 검증 실패 — 아래 에러를 수정하라:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for e in "${ERRORS[@]}"; do echo "$e"; done
    echo ""
    echo "❌ .verify-log에 기록하지 않음 (실패)"
    exit 1
fi

# ──────────────────────────────────────────────
# 성공 → .verify-log에 기록
# ──────────────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
EPOCH=$(date +%s)
echo "PASS | $TIMESTAMP | epoch=$EPOCH | terms=$SEARCH_TERMS | tsc=0 | build=ok" >> "$VERIFY_LOG"

# 현재 검증 횟수 카운트 (최근 60분 이내 엔트리만)
NOW=$(date +%s)
VALID_COUNT=0
if [ -f "$VERIFY_LOG" ]; then
    while IFS= read -r line; do
        LINE_EPOCH=$(echo "$line" | grep -o 'epoch=[0-9]*' | cut -d= -f2)
        if [ -n "$LINE_EPOCH" ]; then
            AGE=$((NOW - LINE_EPOCH))
            if [ "$AGE" -le 3600 ]; then
                VALID_COUNT=$((VALID_COUNT + 1))
            fi
        fi
    done < "$VERIFY_LOG"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ "$VALID_COUNT" -ge 10 ]; then
    echo "║  ✅ 검증 ${VALID_COUNT}/10 완료 — 커밋 가능!            ║"
else
    REMAINING=$((10 - VALID_COUNT))
    echo "║  🔄 검증 ${VALID_COUNT}/10 — 아직 ${REMAINING}회 남음              ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""

exit 0
