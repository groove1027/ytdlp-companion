#!/bin/bash
# ============================================================
# Pre-Commit Validation Hook (PreToolUse → Bash)
# Blocks git commit/push unless ALL verification phases are done
#
# Exit codes:
#   0 = pass (allow commit)
#   2 = block (Claude Code PreToolUse blocking)
# ============================================================

PROJECT_DIR="/Users/mac_mini/Downloads/all-in-one-production-build4"
COMMAND="${CLAUDE_TOOL_INPUT_command}"
GATE_FILE="$PROJECT_DIR/.e2e-verified"

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
MEMORY_DIR="$HOME/.claude/projects/-Users-mac_mini-Downloads-all-in-one-production-build4/memory"
WORKHIST="$MEMORY_DIR/work-history.md"

if [ -f "$WORKHIST" ]; then
    if [ "$(uname)" = "Darwin" ]; then
        MTIME=$(stat -f %m "$WORKHIST" 2>/dev/null || echo 0)
    else
        MTIME=$(stat -c %Y "$WORKHIST" 2>/dev/null || echo 0)
    fi
    NOW=$(date +%s)
    DIFF=$((NOW - MTIME))
    if [ "$DIFF" -gt 1800 ]; then
        ERRORS+=("❌ [절차 누락] work-history.md가 이번 세션에서 업데이트되지 않았다 — 작업 기록을 남겨라")
    fi
fi

# ──────────────────────────────────────────────
# CHECK 3: UI 변경 시 E2E 검증 필수
# ──────────────────────────────────────────────
# 이번 커밋에 components/ 파일이 포함되어 있는지 확인
UI_FILES_STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -cE 'components/.*\.(tsx|ts)$')
UI_FILES_DIFF=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -cE 'components/.*\.(tsx|ts)$')
UI_CHANGED=$(( UI_FILES_STAGED + UI_FILES_DIFF ))

if [ "$UI_CHANGED" -gt 0 ]; then
    # UI 파일이 변경됨 → .e2e-verified 게이트 파일 확인
    if [ ! -f "$GATE_FILE" ]; then
        ERRORS+=("❌ [E2E 누락] components/ 파일이 수정됐는데 E2E 검증이 안 됐다!")
        ERRORS+=("   → Puppeteer로 localhost:5173 접속해서 UI 동작 확인 후")
        ERRORS+=("   → touch $GATE_FILE 실행하라 (검증 완료 증거)")
    else
        # 게이트 파일이 10분 이내인지 확인 (너무 오래된 건 무효)
        if [ "$(uname)" = "Darwin" ]; then
            GATE_MTIME=$(stat -f %m "$GATE_FILE" 2>/dev/null || echo 0)
        else
            GATE_MTIME=$(stat -c %Y "$GATE_FILE" 2>/dev/null || echo 0)
        fi
        NOW2=$(date +%s)
        GATE_AGE=$((NOW2 - GATE_MTIME))
        if [ "$GATE_AGE" -gt 600 ]; then
            ERRORS+=("❌ [E2E 만료] .e2e-verified 파일이 10분 이상 지남 — E2E 재검증 필요")
            ERRORS+=("   → Puppeteer로 다시 확인 후 touch $GATE_FILE")
        else
            echo "✅ E2E 검증 확인됨 (${GATE_AGE}초 전)"
        fi
    fi
fi

# ──────────────────────────────────────────────
# OUTPUT + BLOCK (exit 2)
# ──────────────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "🚨 커밋/푸시 차단 — 절차 미완료"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for e in "${ERRORS[@]}"; do echo "$e"; done
    echo ""
    echo "📋 필수 절차:"
    echo "   Phase 1: grep 전수조사"
    echo "   Phase 2: 코드 수정"
    echo "   Phase 3: tsc + build + grep 재검증"
    echo "   Phase 3+: UI 변경 시 → Puppeteer E2E → touch .e2e-verified"
    echo "   Phase 4: CHECKLIST.md + work-history.md 업데이트"
    echo "   Phase 5: 커밋"
    # exit 2 = Claude Code PreToolUse 차단
    exit 2
fi

echo "✅ 커밋 전 절차 확인 통과"
exit 0
