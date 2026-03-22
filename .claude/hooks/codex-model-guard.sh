#!/bin/bash
# ============================================================
# Codex MCP Model Guard Hook (PreToolUse → mcp__codex__codex)
# Codex MCP 호출 시 model 파라미터가 gpt-5.4가 아니면 차단
# ============================================================

TOOL_NAME="${CLAUDE_TOOL_NAME}"

# mcp__codex__codex 또는 mcp__codex__review만 검사
if ! echo "$TOOL_NAME" | grep -qE '^mcp__codex__(codex|review)$'; then
    exit 0
fi

# model 파라미터 추출 (CLAUDE_TOOL_INPUT_model 환경변수)
MODEL="${CLAUDE_TOOL_INPUT_model}"

# model이 비어있거나 gpt-5.4가 아니면 차단
if [ -z "$MODEL" ] || [ "$MODEL" != "gpt-5.4" ]; then
    echo ""
    echo "🚨🚨🚨 CODEX MCP 모델 강제 차단 🚨🚨🚨"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  현재 model: \"${MODEL:-<비어있음>}\""
    echo "  필수 model: \"gpt-5.4\""
    echo ""
    echo "  ❌ gpt-5.3-codex, o3, o4-mini, opus 등 절대 금지"
    echo "  ✅ 반드시 model: \"gpt-5.4\" 로 재호출하라"
    echo ""
    echo "  CLAUDE.md + MEMORY.md + feedback_use_codex_mcp.md 참조"
    echo ""
    exit 2
fi

echo "✅ Codex MCP 모델 확인: ${MODEL}"
exit 0
