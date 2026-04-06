#!/bin/bash
# ============================================================
# mirror-companion-release.sh
#
# 목적:
#   private 저장소(groove1027/all-in-one-production)에 build-companion.yml CI가
#   자동으로 만든 companion 릴리스를 public 저장소(groove1027/ytdlp-companion)로
#   미러 게시한다.
#
# 사용법:
#   bash scripts/mirror-companion-release.sh companion-v1.3.0
#   bash scripts/mirror-companion-release.sh companion-v1.3.1 --notes "fix: ..."
#
# 사전 조건:
#   - gh CLI 설치 + 두 저장소 모두에 write 권한
#   - private 저장소에 해당 태그의 릴리스가 이미 build-companion.yml로 빌드되어 있어야 함
#
# 검증:
#   미러 후 scripts/verify-companion-release-sync.mjs 자동 실행
# ============================================================

set -euo pipefail

PRIVATE_REPO="groove1027/all-in-one-production"
PUBLIC_REPO="groove1027/ytdlp-companion"

if [ $# -lt 1 ]; then
  echo "사용법: bash scripts/mirror-companion-release.sh <tag> [--notes-file PATH]"
  echo "예시:  bash scripts/mirror-companion-release.sh companion-v1.3.0"
  exit 1
fi

TAG="$1"
shift || true

# tag 형식 검증
if ! echo "$TAG" | grep -qE '^companion-v[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "❌ tag 형식 오류 — 'companion-vX.Y.Z' 형태여야 함 (예: companion-v1.3.0)"
  exit 1
fi

VERSION=$(echo "$TAG" | sed 's/^companion-v//')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Companion Release Mirror"
echo "  $TAG  ($PRIVATE_REPO → $PUBLIC_REPO)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 사전 조건 — gh CLI
if ! command -v gh > /dev/null 2>&1; then
  echo "❌ gh CLI가 필요합니다. https://cli.github.com/"
  exit 1
fi
if ! gh auth status > /dev/null 2>&1; then
  echo "❌ gh CLI 인증이 필요합니다. 'gh auth login'을 실행하세요."
  exit 1
fi

# 1) private 저장소에 해당 릴리스가 있는지 확인
echo "🔍 Checking private release: $PRIVATE_REPO @ $TAG"
if ! gh release view "$TAG" --repo "$PRIVATE_REPO" > /dev/null 2>&1; then
  echo "❌ private 저장소 $PRIVATE_REPO에 릴리스 $TAG가 없습니다."
  echo ""
  echo "  build-companion.yml CI가 아직 실행되지 않았을 수 있습니다."
  echo "  태그를 푸시했는지 확인:  git push origin $TAG"
  echo "  CI 상태 확인:           gh run list --workflow=build-companion.yml --repo $PRIVATE_REPO"
  exit 1
fi

# 2) public 저장소에 이미 같은 태그가 있으면 중단 (덮어쓰기 사고 방지)
if gh release view "$TAG" --repo "$PUBLIC_REPO" > /dev/null 2>&1; then
  echo "⚠️  public 저장소 $PUBLIC_REPO에 이미 $TAG가 있습니다."
  echo "    삭제 후 재미러링하려면:  gh release delete $TAG --repo $PUBLIC_REPO --yes"
  exit 1
fi

# 3) 자산 다운로드
WORKDIR=$(mktemp -d -t companion-mirror-XXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT
cd "$WORKDIR"

echo "⬇️  Downloading assets to $WORKDIR"
gh release download "$TAG" --repo "$PRIVATE_REPO" --clobber

ls -la
echo ""

# 4) 해시 출력
echo "🔐 SHA256:"
shasum -a 256 *.dmg *.exe *.msi 2>/dev/null || true
echo ""

# 5) 릴리스 노트 (private에서 가져오기, 없으면 자동 생성)
NOTES_FILE="$WORKDIR/_notes.md"
gh release view "$TAG" --repo "$PRIVATE_REPO" --json body --jq '.body' > "$NOTES_FILE" 2>/dev/null || true
if [ ! -s "$NOTES_FILE" ]; then
  cat > "$NOTES_FILE" <<EOF
# All In One Helper v$VERSION

Mirrored from private build pipeline (\`$PRIVATE_REPO\`).

## SHA256
\`\`\`
$(shasum -a 256 *.dmg *.exe *.msi 2>/dev/null || true)
\`\`\`
EOF
fi

# 6) 미러 릴리스 생성
echo "📤 Creating mirror release on $PUBLIC_REPO"
gh release create "$TAG" \
  --repo "$PUBLIC_REPO" \
  --title "All In One Helper v$VERSION" \
  --notes-file "$NOTES_FILE" \
  *.dmg *.exe *.msi

echo ""
echo "✅ Mirror complete: https://github.com/$PUBLIC_REPO/releases/tag/$TAG"
echo ""

# 7) 검증 스크립트 자동 실행
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
if [ -f "$SCRIPT_DIR/verify-companion-release-sync.mjs" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Verifying sync after mirror..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  node "$SCRIPT_DIR/verify-companion-release-sync.mjs"
fi
