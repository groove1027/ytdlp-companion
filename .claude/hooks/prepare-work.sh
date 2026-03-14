#!/bin/bash
# ============================================================
# Prepare Work Script — 전수 조사 프로토콜 STEP 3~4 자동화
#
# 사용법:
#   bash .claude/hooks/prepare-work.sh "함수명" "변수명" "상태명" ...
#
# 하는 일:
#   1. MEMORY.md 존재 확인
#   2. 각 검색어로 프로젝트 전체 grep
#   3. 영향 받는 파일 목록 생성
#   4. .phase-ready 게이트 파일 생성 (pre-edit-gate.sh가 확인)
# ============================================================

PROJECT_DIR="/Users/jihoo/Downloads/all-in-one-production-build4"
SRC_DIR="$PROJECT_DIR/src"
GATE_FILE="$PROJECT_DIR/.phase-ready"
MEMORY_DIR="$HOME/.claude/projects/-Users-jihoo-Downloads-all-in-one-production-build4/memory"

# ──────────────────────────────────────────────
# 검색어 필수
# ──────────────────────────────────────────────
if [ $# -eq 0 ]; then
    echo "❌ 사용법: bash prepare-work.sh \"함수명\" \"변수명\" ..."
    echo "   검색어를 1개 이상 지정하라"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     전수 조사 프로토콜 — Phase 1 실행 중         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────────
# STEP 1: MEMORY.md 존재 확인
# ──────────────────────────────────────────────
if [ -f "$MEMORY_DIR/MEMORY.md" ]; then
    echo "✅ MEMORY.md 확인됨"
else
    echo "⚠️ MEMORY.md를 찾을 수 없음 — 계속 진행하되 반드시 수동으로 읽을 것"
fi

# ──────────────────────────────────────────────
# STEP 2: 각 검색어로 grep 전수 조사
# ──────────────────────────────────────────────
SEARCH_TERMS="$*"
ALL_FILES=""
TOTAL_MATCHES=0

echo ""
echo "━━━ grep 전수 조사 시작 ━━━"
echo ""

for TERM in "$@"; do
    echo "🔍 검색어: \"$TERM\""
    echo "───────────────────────────────────"

    # src/ 전체 검색 (node_modules 제외)
    RESULTS=$(grep -rn --include="*.ts" --include="*.tsx" "$TERM" "$SRC_DIR" 2>/dev/null | grep -v node_modules)

    if [ -z "$RESULTS" ]; then
        echo "   (결과 없음)"
    else
        # 파일별 매치 수 출력
        FILES=$(echo "$RESULTS" | cut -d: -f1 | sort -u)
        MATCH_COUNT=$(echo "$RESULTS" | wc -l | tr -d ' ')
        FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
        TOTAL_MATCHES=$((TOTAL_MATCHES + MATCH_COUNT))

        echo "   📁 파일 ${FILE_COUNT}개, 매치 ${MATCH_COUNT}건:"
        echo "$FILES" | while IFS= read -r f; do
            REL=$(echo "$f" | sed "s|$PROJECT_DIR/||")
            COUNT=$(echo "$RESULTS" | grep -c "^$f:")
            echo "      - $REL (${COUNT}건)"
        done

        ALL_FILES="$ALL_FILES
$FILES"
    fi
    echo ""
done

# 중복 제거
UNIQUE_FILES=$(echo "$ALL_FILES" | sort -u | grep -v '^$')
UNIQUE_COUNT=$(echo "$UNIQUE_FILES" | grep -c '.' 2>/dev/null || echo 0)

echo "━━━ 전수 조사 결과 요약 ━━━"
echo ""
echo "  검색어: $SEARCH_TERMS"
echo "  총 매치: ${TOTAL_MATCHES}건"
echo "  영향 파일: ${UNIQUE_COUNT}개"
echo ""

if [ "$UNIQUE_COUNT" -gt 0 ]; then
    echo "📋 영향 받는 파일 목록 (이 파일들을 모두 확인/수정해야 함):"
    echo "$UNIQUE_FILES" | while IFS= read -r f; do
        REL=$(echo "$f" | sed "s|$PROJECT_DIR/||")
        echo "  → $REL"
    done
fi

# ──────────────────────────────────────────────
# STEP 3: .phase-ready 게이트 파일 생성
# ──────────────────────────────────────────────
{
    echo "# Phase-Ready: $SEARCH_TERMS"
    echo "# Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "# Total matches: $TOTAL_MATCHES"
    echo "# Affected files: $UNIQUE_COUNT"
    echo "#"
    echo "# ── 영향 받는 파일 목록 ──"
    if [ -n "$UNIQUE_FILES" ]; then
        echo "$UNIQUE_FILES" | while IFS= read -r f; do
            echo "$f"
        done
    else
        echo "# (매치 없음 — 새로운 함수/변수 추가 작업일 수 있음)"
    fi
    echo "#"
    echo "# ── Phase 2 수정 후 이 파일들을 Phase 3에서 재검증할 것 ──"
} > "$GATE_FILE"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ Phase 1 완료 — 이제 코드 수정 가능           ║"
echo "║  게이트 유효시간: 60분                            ║"
echo "║  .phase-ready 생성됨                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "다음 단계:"
echo "  Phase 2: 위 목록의 모든 파일을 수정"
echo "  Phase 3: tsc + vite build + grep 재검증"
echo "  Phase 4: CHECKLIST.md + work-history.md 업데이트"
echo "  Phase 5: 커밋 + 푸시"

exit 0
