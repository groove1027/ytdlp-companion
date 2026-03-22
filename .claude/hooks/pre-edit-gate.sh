#!/bin/bash
# ============================================================
# Pre-Edit Gate Hook (PreToolUse → Edit/Write/MultiEdit)
# src/ 코드 수정 시도 시 준비 단계 미완료면 차단 (exit 2)
# ============================================================

PROJECT_DIR="/Users/mac_mini/Downloads/all-in-one-production-build4"
FILE="${CLAUDE_TOOL_INPUT_FILE_PATH}${CLAUDE_TOOL_INPUT_file_path}"
GATE_FILE="$PROJECT_DIR/.phase-ready"

# ──────────────────────────────────────────────
# src/ 내 .ts/.tsx 파일만 게이트 적용
# (CLAUDE.md, CHECKLIST.md, memory 등은 자유롭게 수정 가능)
# ──────────────────────────────────────────────
if ! echo "$FILE" | grep -qE 'src/.*\.(ts|tsx)$'; then
    exit 0
fi

# ──────────────────────────────────────────────
# CHECK 1: .phase-ready 게이트 파일 존재 여부
# ──────────────────────────────────────────────
if [ ! -f "$GATE_FILE" ]; then
    echo ""
    echo "🚨🚨🚨 코드 수정 차단 — 전수 조사 프로토콜 미완료 🚨🚨🚨"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "코드를 수정하기 전에 반드시 아래 순서를 따라라:"
    echo ""
    echo "  STEP 1: memory/MEMORY.md 읽기"
    echo "  STEP 2: 관련 .claude/skills/ 파일 읽기"
    echo "  STEP 3: 수정할 함수/변수명 grep 전수 조사"
    echo "  STEP 4: 영향 받는 파일 목록 작성"
    echo ""
    echo "준비 완료 후 아래 명령 실행:"
    echo "  bash $PROJECT_DIR/.claude/hooks/prepare-work.sh \"검색어1\" \"검색어2\" ..."
    echo ""
    echo "⚠️ touch .phase-ready 금지 — prepare-work.sh만 사용할 것"
    exit 2
fi

# ──────────────────────────────────────────────
# CHECK 2: 게이트 파일 만료 확인 (60분)
# ──────────────────────────────────────────────
if [ "$(uname)" = "Darwin" ]; then
    GATE_MTIME=$(stat -f %m "$GATE_FILE" 2>/dev/null || echo 0)
else
    GATE_MTIME=$(stat -c %Y "$GATE_FILE" 2>/dev/null || echo 0)
fi
NOW=$(date +%s)
AGE=$((NOW - GATE_MTIME))

if [ "$AGE" -gt 3600 ]; then
    echo ""
    echo "🚨 게이트 만료 — .phase-ready가 ${AGE}초 전 (60분 초과)"
    echo "   → prepare-work.sh를 다시 실행하라"
    rm -f "$GATE_FILE"
    exit 2
fi

# ──────────────────────────────────────────────
# CHECK 3: 게이트 파일에 실제 grep 결과가 있는지
# (빈 파일이나 너무 짧으면 무효 — touch 방지)
# ──────────────────────────────────────────────
GATE_SIZE=$(wc -c < "$GATE_FILE" 2>/dev/null | tr -d ' ')
if [ "$GATE_SIZE" -lt 50 ]; then
    echo ""
    echo "🚨 게이트 무효 — .phase-ready 내용이 부실 (${GATE_SIZE} bytes)"
    echo "   → touch로 만들지 마라. prepare-work.sh를 실행하라"
    rm -f "$GATE_FILE"
    exit 2
fi

# 통과
SEARCH_TERMS=$(head -1 "$GATE_FILE" | sed 's/^# Phase-Ready: //')
echo "✅ 전수 조사 완료 확인 (검색어: ${SEARCH_TERMS}, ${AGE}초 전)"
exit 0
