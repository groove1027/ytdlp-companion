#!/bin/bash
# ============================================================
# Post-Edit Automated Validation Hook
# Runs after every Edit/Write/MultiEdit on .ts/.tsx files
# ============================================================

PROJECT_DIR="/Users/jihoo/Downloads/all-in-one-production-claudecode"
SRC_DIR="$PROJECT_DIR/src"

# Get the edited file path from environment
FILE="${CLAUDE_TOOL_INPUT_FILE_PATH}${CLAUDE_TOOL_INPUT_file_path}"

# Skip non-TypeScript files
if ! echo "$FILE" | grep -qE '\.(ts|tsx)$'; then
    echo "✅ 비-TypeScript 파일 수정 완료"
    exit 0
fi

ERRORS=()
WARNINGS=()

# ──────────────────────────────────────────────
# CHECK 1: TypeScript Compilation
# ──────────────────────────────────────────────
TSC_OUTPUT=$(cd "$SRC_DIR" && npx tsc --noEmit 2>&1)
if echo "$TSC_OUTPUT" | grep -q 'error TS'; then
    ERRORS+=("❌ [TypeScript] 컴파일 에러:")
    while IFS= read -r line; do
        ERRORS+=("   $line")
    done < <(echo "$TSC_OUTPUT" | grep 'error TS' | head -10)
fi

# ──────────────────────────────────────────────
# CHECK 2: Forbidden Patterns (CLAUDE.md 절대 규칙)
# ──────────────────────────────────────────────
if [ -f "$FILE" ]; then
    # 2a: New alert() calls (should use Toast)
    if grep -n 'alert(' "$FILE" | grep -v '// legacy' | grep -v 'node_modules' > /dev/null 2>&1; then
        WARNINGS+=("⚠️ [규칙위반] alert() 사용 감지 → Toast 시스템 사용 필요: $FILE")
    fi

    # 2b: Direct localStorage access (should use apiService.ts getXxxKey())
    if grep -n 'localStorage\.' "$FILE" | grep -v 'storageService\|apiService' > /dev/null 2>&1; then
        BASENAME=$(basename "$FILE")
        if [ "$BASENAME" != "apiService.ts" ] && [ "$BASENAME" != "storageService.ts" ]; then
            WARNINGS+=("⚠️ [규칙위반] localStorage 직접 접근 → apiService.ts의 getXxxKey() 사용 필요: $FILE")
        fi
    fi

    # 2c: New 'any' type additions
    ANY_COUNT=$(grep -cE ': any[^_]|: any$|as any' "$FILE" 2>/dev/null; true)
    if [ "$ANY_COUNT" -gt 0 ] 2>/dev/null; then
        WARNINGS+=("⚠️ [규칙위반] 'any' 타입 ${ANY_COUNT}개 감지 — 구체적 타입 사용 권장: $(basename "$FILE")")
    fi

    # 2d: Direct fetch (should use monitoredFetch)
    FETCH_COUNT=$(grep -c 'fetch(' "$FILE" 2>/dev/null; true)
    MONITORED_COUNT=$(grep -c 'monitoredFetch' "$FILE" 2>/dev/null; true)
    IMPORT_FETCH=$(grep -c 'import.*fetch\|WebFetch\|prefetch' "$FILE" 2>/dev/null; true)
    RAW_FETCH=$((FETCH_COUNT - MONITORED_COUNT - IMPORT_FETCH))
    if [ "$RAW_FETCH" -gt 0 ] 2>/dev/null; then
        BASENAME=$(basename "$FILE")
        if [ "$BASENAME" != "apiService.ts" ]; then
            WARNINGS+=("⚠️ [규칙위반] fetch() 직접 호출 ${RAW_FETCH}건 → monitoredFetch 래퍼 사용 필요: $BASENAME")
        fi
    fi
fi

# ──────────────────────────────────────────────
# CHECK 3: API Casing Rules (VideoGenService only)
# ──────────────────────────────────────────────
if echo "$FILE" | grep -q 'VideoGenService'; then
    # snake_case for base64 request (inline_data, mime_type)
    if grep -n 'inlineData.*data:' "$FILE" | grep -v 'response\|Response\|part\.\|parts' > /dev/null 2>&1; then
        WARNINGS+=("⚠️ [API규칙] Base64 요청에 camelCase(inlineData) 감지 → snake_case(inline_data) 사용 필요")
    fi
fi

# ──────────────────────────────────────────────
# OUTPUT RESULTS
# ──────────────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
    for e in "${ERRORS[@]}"; do echo "$e"; done
    echo ""
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    for w in "${WARNINGS[@]}"; do echo "$w"; done
    echo ""
fi

if [ ${#ERRORS[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo "✅ 자동 검수 통과 (TypeScript OK, 규칙 위반 없음)"
else
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo "🚨 에러 ${#ERRORS[@]}건 — 반드시 수정하세요!"
    fi
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo "⚠️ 경고 ${#WARNINGS[@]}건 — 확인 필요"
    fi
fi

exit 0
