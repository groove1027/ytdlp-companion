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
# CHECK 3: UI/서비스/스토어/훅/유틸 변경 시 Playwright E2E 검증 필수
# (touch로 우회 불가 — 실제 스크린샷 파일 증거 필요)
# ──────────────────────────────────────────────
# 이번 커밋에 src/ 내 코드 파일이 포함되어 있는지 확인 (components, services, stores, hooks, utils, types 전부)
UI_FILES_STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -cE 'src/.*\.(tsx|ts)$')
UI_FILES_DIFF=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -cE 'src/.*\.(tsx|ts)$')
UI_CHANGED=$(( UI_FILES_STAGED + UI_FILES_DIFF ))

if [ "$UI_CHANGED" -gt 0 ]; then
    # ── 증거 1: test-e2e/ 에 30분 이내 생성된 스크린샷이 2장 이상 있어야 함 ──
    E2E_DIR="$PROJECT_DIR/test-e2e"
    if [ -d "$E2E_DIR" ]; then
        E2E_SCREENSHOTS=$(find "$E2E_DIR" -name "*.png" -mmin -30 2>/dev/null | wc -l | tr -d ' ')
    else
        E2E_SCREENSHOTS=0
    fi

    if [ "$E2E_SCREENSHOTS" -lt 2 ]; then
        ERRORS+=("❌ [E2E 스크린샷 증거 없음] components/ 또는 services/ 파일이 수정됐는데 Playwright 스크린샷이 없다!")
        ERRORS+=("   → test-e2e/ 폴더에 30분 이내 생성된 .png 파일: ${E2E_SCREENSHOTS}장 (최소 2장 필요)")
        ERRORS+=("   → npx playwright test를 실제로 실행하여 before/after 스크린샷을 저장하라")
        ERRORS+=("   → touch .e2e-verified 로 우회하는 것은 금지 — 실제 스크린샷만 인정")
    else
        echo "✅ Playwright E2E 스크린샷 증거 확인됨 (${E2E_SCREENSHOTS}장, 30분 이내)"
    fi

    # ── 증거 2: 다운로드/생성 기능 수정 시 산출물 파일도 확인 ──
    # nleExportService, export 관련 파일이 변경됐으면 dl-* 파일이 있어야 함
    EXPORT_FILES_STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -cE '(nleExport|export|Export).*\.(tsx|ts)$')
    EXPORT_FILES_DIFF=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -cE '(nleExport|export|Export).*\.(tsx|ts)$')
    EXPORT_CHANGED=$(( EXPORT_FILES_STAGED + EXPORT_FILES_DIFF ))

    if [ "$EXPORT_CHANGED" -gt 0 ]; then
        DL_FILES=$(find "$E2E_DIR" -name "dl-*" -mmin -30 2>/dev/null | wc -l | tr -d ' ')
        if [ "$DL_FILES" -lt 1 ]; then
            ERRORS+=("❌ [산출물 증거 없음] export 관련 파일이 수정됐는데 다운로드 산출물(dl-*)이 없다!")
            ERRORS+=("   → test-e2e/dl-* 파일이 30분 이내에 1개 이상 있어야 한다")
            ERRORS+=("   → Playwright에서 download.saveAs()로 실제 파일을 저장하라")
        else
            echo "✅ 다운로드 산출물 증거 확인됨 (${DL_FILES}개, 30분 이내)"
        fi
    fi

    # ── 증거 3: .e2e-verified 게이트 파일도 여전히 필요 (Playwright 실행 후 자동 생성) ──
    if [ ! -f "$GATE_FILE" ]; then
        ERRORS+=("❌ [E2E 게이트 없음] .e2e-verified 파일이 없다")
        ERRORS+=("   → Playwright 테스트 실행 완료 후 생성해야 한다")
    else
        if [ "$(uname)" = "Darwin" ]; then
            GATE_MTIME=$(stat -f %m "$GATE_FILE" 2>/dev/null || echo 0)
        else
            GATE_MTIME=$(stat -c %Y "$GATE_FILE" 2>/dev/null || echo 0)
        fi
        NOW2=$(date +%s)
        GATE_AGE=$((NOW2 - GATE_MTIME))
        if [ "$GATE_AGE" -gt 1800 ]; then
            ERRORS+=("❌ [E2E 만료] .e2e-verified 파일이 30분 이상 지남 — Playwright 재검증 필요")
        else
            echo "✅ E2E 게이트 확인됨 (${GATE_AGE}초 전)"
        fi
    fi
fi

# ──────────────────────────────────────────────
# CHECK 3.5: companion/src-tauri/ 수정 시 cargo build + health check 필수
# ──────────────────────────────────────────────
COMPANION_STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -cE 'companion/src-tauri/src/.*\.rs$')
COMPANION_DIFF=$(cd "$PROJECT_DIR" && git diff --name-only HEAD 2>/dev/null | grep -cE 'companion/src-tauri/src/.*\.rs$')
COMPANION_CHANGED=$(( COMPANION_STAGED + COMPANION_DIFF ))

if [ "$COMPANION_CHANGED" -gt 0 ]; then
    # 증거: .companion-build-verified 파일이 30분 이내에 있어야 함
    COMPANION_GATE="$PROJECT_DIR/.companion-build-verified"
    if [ ! -f "$COMPANION_GATE" ]; then
        ERRORS+=("❌ [컴패니언 빌드 미검증] companion/src-tauri/ Rust 파일이 수정됐는데 빌드 검증 증거가 없다!")
        ERRORS+=("   → cd companion/src-tauri && cargo build 성공 확인")
        ERRORS+=("   → 컴패니언 앱 실행 후 curl http://localhost:9876/health 응답 확인")
        ERRORS+=("   → 검증 완료 후 touch .companion-build-verified")
        ERRORS+=("   ⚠️ cargo build 불가 환경이면 사용자에게 즉시 알릴 것 — 절대 스킵 금지")
    else
        if [ "$(uname)" = "Darwin" ]; then
            CB_MTIME=$(stat -f %m "$COMPANION_GATE" 2>/dev/null || echo 0)
        else
            CB_MTIME=$(stat -c %Y "$COMPANION_GATE" 2>/dev/null || echo 0)
        fi
        CB_NOW=$(date +%s)
        CB_AGE=$((CB_NOW - CB_MTIME))
        if [ "$CB_AGE" -gt 1800 ]; then
            ERRORS+=("❌ [컴패니언 빌드 만료] .companion-build-verified가 30분 이상 지남 — 재검증 필요")
        else
            echo "✅ 컴패니언 빌드 검증 확인됨 (${CB_AGE}초 전)"
        fi
    fi
fi

# ──────────────────────────────────────────────
# CHECK 4: 가짜 E2E 7중 차단
# ──────────────────────────────────────────────
if [ "$UI_CHANGED" -gt 0 ] && [ -d "$E2E_DIR" ]; then
    RECENT_TESTS=$(find "$E2E_DIR" -name "*.test.ts" -mmin -30 2>/dev/null)
    for tf in $RECENT_TESTS; do
        REL_TF=$(echo "$tf" | sed "s|$PROJECT_DIR/||")

        # ── 4-A: page.evaluate() 전용 테스트 차단 ──
        HAS_UI_ACTION=$(grep -cE 'page\.(click|fill|setInputFiles|waitForResponse|waitForDownload|locator.*click|getByRole.*click|getByText.*click)' "$tf" 2>/dev/null || echo 0)
        HAS_EVALUATE=$(grep -cE 'page\.evaluate' "$tf" 2>/dev/null || echo 0)
        if [ "$HAS_EVALUATE" -gt 0 ] && [ "$HAS_UI_ACTION" -eq 0 ]; then
            ERRORS+=("❌ [가짜 E2E 4-A] $REL_TF — page.evaluate()만 있고 실제 UI 액션 없음")
            ERRORS+=("   → 실제 파일 업로드(setInputFiles) → 버튼 클릭(click) → 결과물 다운로드 흐름을 테스트하라")
        fi

        # ── 4-B: route.fulfill() API 모킹 차단 ──
        HAS_MOCK=$(grep -cE 'route\.(fulfill|abort)|page\.route\(' "$tf" 2>/dev/null || echo 0)
        if [ "$HAS_MOCK" -gt 0 ]; then
            ERRORS+=("❌ [가짜 E2E 4-B] $REL_TF — route.fulfill()/page.route()로 API 모킹 사용!")
            ERRORS+=("   → 실제 API를 호출해야 한다. 모킹은 E2E가 아니다")
        fi

        # ── 4-C: waitForResponse 없이 waitForTimeout만 사용 차단 ──
        HAS_WAIT_RESPONSE=$(grep -cE 'waitForResponse|waitForDownload|waitForEvent' "$tf" 2>/dev/null || echo 0)
        HAS_WAIT_TIMEOUT=$(grep -cE 'waitForTimeout' "$tf" 2>/dev/null || echo 0)
        if [ "$HAS_WAIT_TIMEOUT" -gt 2 ] && [ "$HAS_WAIT_RESPONSE" -eq 0 ] && [ "$HAS_UI_ACTION" -gt 0 ]; then
            ERRORS+=("⚠️ [약한 E2E 4-C] $REL_TF — waitForTimeout만 ${HAS_WAIT_TIMEOUT}회 사용, waitForResponse 0회")
            ERRORS+=("   → waitForTimeout 대신 waitForResponse/waitForDownload로 실제 응답을 대기하라")
        fi
    done

    # ── 4-D: 스크린샷 파일 크기 검증 (0바이트/빈 파일 차단) ──
    if [ "$E2E_SCREENSHOTS" -ge 2 ]; then
        EMPTY_SCREENSHOTS=0
        for ss in $(find "$E2E_DIR" -name "*.png" -mmin -30 2>/dev/null); do
            SS_SIZE=$(stat -f %z "$ss" 2>/dev/null || stat -c %s "$ss" 2>/dev/null || echo 0)
            if [ "$SS_SIZE" -lt 1000 ]; then
                EMPTY_SCREENSHOTS=$((EMPTY_SCREENSHOTS + 1))
            fi
        done
        if [ "$EMPTY_SCREENSHOTS" -gt 0 ]; then
            ERRORS+=("❌ [가짜 스크린샷 4-D] test-e2e/에 1KB 미만 스크린샷 ${EMPTY_SCREENSHOTS}장 — touch로 생성한 빈 파일!")
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
    echo "   Phase 3+: UI/서비스 변경 시 → Playwright E2E 실행 → 스크린샷 2장+ 저장 → .e2e-verified 생성"
    echo "   Phase 4: CHECKLIST.md + work-history.md 업데이트"
    echo "   Phase 5: 커밋"
    # exit 2 = Claude Code PreToolUse 차단
    exit 2
fi

echo "✅ 커밋 전 절차 확인 통과"
exit 0
