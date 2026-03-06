#!/bin/bash
# ============================================
# 🌙 Overnight Autonomous Worker
# ============================================
# 사용법: ./scripts/overnight.sh
# 중단: Ctrl+C 또는 kill $(cat /tmp/claude-overnight.pid)
#
# 이 스크립트는 tasks.md의 작업 목록을 순서대로 처리합니다.
# 각 작업 완료 후 결과를 logs/에 기록합니다.
# ============================================

set -euo pipefail

PROJECT_DIR="/Users/jihoo/Downloads/all-in-one-production-claudecode"
TASKS_FILE="$PROJECT_DIR/scripts/tasks.md"
LOG_DIR="$PROJECT_DIR/scripts/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# PID 기록 (외부에서 중단할 수 있도록)
echo $$ > /tmp/claude-overnight.pid

mkdir -p "$LOG_DIR"

# tasks.md에서 미완료 작업 읽기 (- [ ] 로 시작하는 줄)
if [ ! -f "$TASKS_FILE" ]; then
    echo "❌ $TASKS_FILE 파일이 없습니다. 먼저 작업 목록을 작성하세요."
    exit 1
fi

echo "🌙 ===== Overnight Worker 시작 ($TIMESTAMP) ====="
echo "📋 작업 파일: $TASKS_FILE"
echo ""

TASK_NUM=0
TOTAL_SUCCESS=0
TOTAL_FAIL=0

while IFS= read -r line; do
    # "- [ ] " 로 시작하는 줄만 처리 (미완료 작업)
    if [[ "$line" =~ ^-\ \[\ \]\ (.+)$ ]]; then
        TASK="${BASH_REMATCH[1]}"
        TASK_NUM=$((TASK_NUM + 1))
        TASK_LOG="$LOG_DIR/task_${TASK_NUM}_${TIMESTAMP}.log"

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🔄 Task #$TASK_NUM: $TASK"
        echo "⏰ 시작: $(date '+%H:%M:%S')"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        # Claude Code headless 실행
        if claude -p "$TASK" \
            --dangerously-skip-permissions \
            --max-turns 30 \
            --output-format text \
            > "$TASK_LOG" 2>&1; then

            echo "✅ Task #$TASK_NUM 완료"
            TOTAL_SUCCESS=$((TOTAL_SUCCESS + 1))

            # tasks.md에서 해당 작업을 완료로 표시
            sed -i '' "s|- \[ \] ${TASK}|- [x] ${TASK}|" "$TASKS_FILE"
        else
            echo "❌ Task #$TASK_NUM 실패 (로그: $TASK_LOG)"
            TOTAL_FAIL=$((TOTAL_FAIL + 1))
        fi

        echo "📝 로그: $TASK_LOG"
        echo ""

        # 작업 간 30초 쿨다운 (API rate limit 방지)
        sleep 30
    fi
done < "$TASKS_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌙 Overnight Worker 완료!"
echo "   성공: $TOTAL_SUCCESS / 실패: $TOTAL_FAIL / 총: $TASK_NUM"
echo "   로그: $LOG_DIR/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -f /tmp/claude-overnight.pid
