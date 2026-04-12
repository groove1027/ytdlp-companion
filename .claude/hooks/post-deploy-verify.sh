#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# post-deploy-verify.sh — 배포 후 검증 강제 (위반 시 exit 2)
#
# 용도: git push 후 / gh issue comment 전에 실행
# 검증 항목:
#   1. Cloudflare Pages 배포 상태 (웹 코드 변경 시)
#   2. Companion release public 미러링 (companion 태그 시)
#   3. 이슈 코멘트 내 링크 유효성 (private repo 링크 차단)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# ── 1. Private repo 링크 차단 ──
# 인자로 코멘트 텍스트가 전달되면 검사
if [ "${1:-}" = "--check-comment" ] && [ -n "${2:-}" ]; then
  COMMENT="$2"
  # all-in-one-production releases 링크 차단 (private repo)
  if echo "$COMMENT" | grep -q "all-in-one-production/releases"; then
    echo -e "${RED}❌ BLOCKED: 코멘트에 PRIVATE repo(all-in-one-production/releases) 링크 포함${NC}"
    echo -e "${YELLOW}   → 반드시 PUBLIC repo 사용: github.com/groove1027/ytdlp-companion/releases${NC}"
    exit 2
  fi
  echo -e "${GREEN}✅ 코멘트 링크 검증 통과${NC}"
  exit 0
fi

# ── 2. Companion release public 미러 검증 ──
if [ "${1:-}" = "--check-companion-mirror" ]; then
  TAG="${2:-}"
  if [ -z "$TAG" ]; then
    echo -e "${RED}❌ 태그명 필요: --check-companion-mirror companion-vX.Y.Z${NC}"
    exit 2
  fi

  # Private repo에 존재하는지
  PRIVATE_STATUS=$(curl -sI "https://api.github.com/repos/groove1027/all-in-one-production/releases/tags/$TAG" \
    -H "Authorization: token $(gh auth token)" | head -1 | awk '{print $2}')

  # Public repo에 존재하는지
  PUBLIC_STATUS=$(curl -sI "https://api.github.com/repos/groove1027/ytdlp-companion/releases/tags/$TAG" | head -1 | awk '{print $2}')

  echo "Private repo ($TAG): HTTP $PRIVATE_STATUS"
  echo "Public repo  ($TAG): HTTP $PUBLIC_STATUS"

  if [ "$PRIVATE_STATUS" = "200" ] && [ "$PUBLIC_STATUS" != "200" ]; then
    echo -e "${RED}❌ BLOCKED: $TAG 가 private에만 있고 public에 미러링 안 됨!${NC}"
    echo -e "${YELLOW}   → 수동 미러: bash scripts/mirror-companion-release.sh $TAG${NC}"
    echo -e "${YELLOW}   → 또는: gh release create $TAG --repo groove1027/ytdlp-companion (assets 첨부)${NC}"
    ERRORS=$((ERRORS + 1))
  elif [ "$PUBLIC_STATUS" = "200" ]; then
    # Asset 개수도 확인
    PRIVATE_ASSETS=$(gh release view "$TAG" --repo groove1027/all-in-one-production --json assets -q '.assets | length' 2>/dev/null || echo "0")
    PUBLIC_ASSETS=$(gh release view "$TAG" --repo groove1027/ytdlp-companion --json assets -q '.assets | length' 2>/dev/null || echo "0")
    echo "Private assets: $PRIVATE_ASSETS / Public assets: $PUBLIC_ASSETS"
    if [ "$PUBLIC_ASSETS" -lt "$PRIVATE_ASSETS" ]; then
      echo -e "${YELLOW}⚠️  Public mirror에 asset이 부족 ($PUBLIC_ASSETS < $PRIVATE_ASSETS)${NC}"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${GREEN}✅ $TAG public 미러링 정상 (assets: $PUBLIC_ASSETS)${NC}"
    fi
  fi

  [ $ERRORS -gt 0 ] && exit 2
  exit 0
fi

# ── 3. 웹 배포 상태 검증 ──
if [ "${1:-}" = "--check-web-deploy" ]; then
  echo "Cloudflare Pages 배포 상태 확인..."
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "https://all-in-one-production.pages.dev")
  if [ "$HTTP_STATUS" != "200" ]; then
    echo -e "${RED}❌ 웹 배포 실패: HTTP $HTTP_STATUS${NC}"
    exit 2
  fi
  echo -e "${GREEN}✅ 웹 배포 정상 (HTTP $HTTP_STATUS)${NC}"
  exit 0
fi

echo "Usage:"
echo "  $0 --check-comment \"코멘트 텍스트\"    # 코멘트 내 private 링크 차단"
echo "  $0 --check-companion-mirror TAG       # public 미러링 검증"
echo "  $0 --check-web-deploy                 # 웹 배포 상태 확인"