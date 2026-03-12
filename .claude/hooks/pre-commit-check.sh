#!/bin/bash
# ============================================================
# Pre-Commit Validation Hook
# Runs before Bash tool — blocks git commit/push if
# CHECKLIST.md or work-history.md were not updated
# ============================================================

PROJECT_DIR="/Users/jihoo/Downloads/all-in-one-production-build4"
COMMAND="${CLAUDE_TOOL_INPUT_command}"

# Only check git commit/push commands
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
    exit 0
fi

ERRORS=()

# ──────────────────────────────────────────────
# CHECK 1: CHECKLIST.md must have been modified
# ──────────────────────────────────────────────
CHECKLIST_MODIFIED=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -c 'docs/CHECKLIST.md')
CHECKLIST_STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -c 'docs/CHECKLIST.md')
CHECKLIST_UNSTAGED=$(cd "$PROJECT_DIR" && git diff --name-only 2>/dev/null | grep -c 'docs/CHECKLIST.md')

if [ "$CHECKLIST_MODIFIED" -eq 0 ] && [ "$CHECKLIST_STAGED" -eq 0 ] && [ "$CHECKLIST_UNSTAGED" -eq 0 ]; then
    ERRORS+=("❌ [절차 누락] docs/CHECKLIST.md가 수정되지 않았다 — 작업 내용을 CHECKLIST에 기록하라")
fi

# ──────────────────────────────────────────────
# CHECK 2: work-history.md must have been modified
# ──────────────────────────────────────────────
MEMORY_DIR="$HOME/.claude/projects/-Users-jihoo-Downloads-all-in-one-production-build4/memory"
WORKHIST="$MEMORY_DIR/work-history.md"

if [ -f "$WORKHIST" ]; then
    # Check if work-history.md was modified since last commit (mtime within last 30 min)
    if [ "$(uname)" = "Darwin" ]; then
        MTIME=$(stat -f %m "$WORKHIST" 2>/dev/null || echo 0)
    else
        MTIME=$(stat -c %Y "$WORKHIST" 2>/dev/null || echo 0)
    fi
    NOW=$(date +%s)
    DIFF=$((NOW - MTIME))
    # If work-history.md wasn't touched in the last 30 minutes, warn
    if [ "$DIFF" -gt 1800 ]; then
        ERRORS+=("❌ [절차 누락] work-history.md가 이번 세션에서 업데이트되지 않았다 — 작업 기록을 남겨라")
    fi
fi

# ──────────────────────────────────────────────
# OUTPUT RESULTS
# ──────────────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "🚨 커밋/푸시 차단 — 절차 미완료"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for e in "${ERRORS[@]}"; do echo "$e"; done
    echo ""
    echo "📋 필수 절차: Phase 1(grep 전수조사) → Phase 2(수정) → Phase 3(검증) → CHECKLIST.md 업데이트 → work-history.md 기록 → 커밋"
    exit 1
fi

echo "✅ 커밋 전 절차 확인 통과 (CHECKLIST + work-history 업데이트 확인됨)"
exit 0
