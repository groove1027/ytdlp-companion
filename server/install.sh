#!/bin/bash
# ============================================================
# yt-dlp API Server — 원클릭 설치 스크립트
#
# Oracle Cloud Ubuntu 22.04/24.04 기준
# 사용법: sudo bash install.sh
# ============================================================

set -e

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  yt-dlp API Server 설치 시작${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# root 확인
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[오류] root 권한이 필요합니다. sudo bash install.sh 으로 실행해주세요.${NC}"
  exit 1
fi

# ──────────────────────────────────────────────
# 1. 시스템 업데이트 + 기본 패키지 설치
# ──────────────────────────────────────────────
echo -e "${YELLOW}[1/7] 시스템 업데이트 중...${NC}"
apt update -y && apt upgrade -y
apt install -y curl wget git python3 python3-pip ffmpeg ufw

# ──────────────────────────────────────────────
# 2. Node.js 20 LTS 설치
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Node.js 20 LTS 설치 중...${NC}"
if command -v node &> /dev/null; then
  NODE_VER=$(node --version)
  echo -e "  이미 설치됨: ${NODE_VER}"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  echo -e "  설치 완료: $(node --version)"
fi

# ──────────────────────────────────────────────
# 3. yt-dlp 설치 (최신 버전)
# ──────────────────────────────────────────────
echo -e "${YELLOW}[3/7] yt-dlp 설치 중...${NC}"
# pip 방식으로 설치 (자동 업데이트 용이)
pip3 install --break-system-packages -U yt-dlp 2>/dev/null || pip3 install -U yt-dlp

# 심볼릭 링크 확인
YTDLP_BIN=$(which yt-dlp)
echo -e "  설치 완료: ${YTDLP_BIN}"
echo -e "  버전: $(yt-dlp --version)"

# /usr/local/bin에 없으면 심볼릭 링크 생성
if [ "$YTDLP_BIN" != "/usr/local/bin/yt-dlp" ]; then
  ln -sf "$YTDLP_BIN" /usr/local/bin/yt-dlp
  echo -e "  심볼릭 링크: /usr/local/bin/yt-dlp → ${YTDLP_BIN}"
fi

# ──────────────────────────────────────────────
# 4. 앱 디렉토리 설정
# ──────────────────────────────────────────────
echo -e "${YELLOW}[4/7] 앱 디렉토리 설정 중...${NC}"
APP_DIR="/opt/ytdlp-api"
mkdir -p "$APP_DIR"

# 현재 스크립트 디렉토리에서 파일 복사
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
cp "$SCRIPT_DIR/index.js" "$APP_DIR/"
cp "$SCRIPT_DIR/.env.example" "$APP_DIR/"
cp "$SCRIPT_DIR/update-ytdlp.sh" "$APP_DIR/"
chmod +x "$APP_DIR/update-ytdlp.sh"

# .env 파일 생성 (없으면)
if [ ! -f "$APP_DIR/.env" ]; then
  # 랜덤 API 키 생성
  RANDOM_KEY=$(openssl rand -hex 32)
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  sed -i "s/여기에-랜덤-키를-넣으세요/${RANDOM_KEY}/" "$APP_DIR/.env"
  echo -e "${GREEN}  API 키가 자동 생성되었습니다.${NC}"
  echo -e "  ${YELLOW}키: ${RANDOM_KEY}${NC}"
  echo -e "  ${YELLOW}이 키를 안전한 곳에 복사해두세요!${NC}"
fi

# npm 패키지 설치
cd "$APP_DIR"
npm install --production
echo -e "  앱 설치 완료: ${APP_DIR}"

# ──────────────────────────────────────────────
# 5. systemd 서비스 등록
# ──────────────────────────────────────────────
echo -e "${YELLOW}[5/7] systemd 서비스 등록 중...${NC}"
cat > /etc/systemd/system/ytdlp-api.service << 'SYSTEMD_EOF'
[Unit]
Description=yt-dlp API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ytdlp-api
ExecStart=/usr/bin/node /opt/ytdlp-api/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# 보안 강화
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ytdlp-api /tmp
PrivateTmp=true

# 로그
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ytdlp-api

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

systemctl daemon-reload
systemctl enable ytdlp-api
systemctl start ytdlp-api

echo -e "  서비스 등록 완료 (자동 시작)"

# ──────────────────────────────────────────────
# 6. 방화벽 설정
# ──────────────────────────────────────────────
echo -e "${YELLOW}[6/7] 방화벽 설정 중...${NC}"
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Cloudflare)
ufw allow 443/tcp   # HTTPS (Cloudflare)
ufw allow 3100/tcp  # API 서버 (직접 접속용, 나중에 닫아도 됨)

# 이미 활성화되어 있으면 재설정 불필요
ufw --force enable
echo -e "  방화벽 설정 완료"

# ──────────────────────────────────────────────
# 7. yt-dlp 자동 업데이트 cron 등록
# ──────────────────────────────────────────────
echo -e "${YELLOW}[7/7] yt-dlp 자동 업데이트 cron 등록 중...${NC}"

# 매일 새벽 4시에 yt-dlp 업데이트
CRON_LINE="0 4 * * * /opt/ytdlp-api/update-ytdlp.sh >> /var/log/ytdlp-update.log 2>&1"
(crontab -l 2>/dev/null | grep -v "update-ytdlp"; echo "$CRON_LINE") | crontab -
echo -e "  cron 등록 완료 (매일 새벽 4시 자동 업데이트)"

# ──────────────────────────────────────────────
# 완료!
# ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  설치 완료!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  서버 상태 확인: ${BLUE}systemctl status ytdlp-api${NC}"
echo -e "  서버 로그 보기: ${BLUE}journalctl -u ytdlp-api -f${NC}"
echo -e "  서버 재시작:    ${BLUE}systemctl restart ytdlp-api${NC}"
echo ""
echo -e "  API 테스트:"
echo -e "    ${BLUE}curl http://localhost:3100/health${NC}"
echo -e "    ${BLUE}curl -H 'X-API-Key: YOUR_KEY' 'http://localhost:3100/api/extract?url=VIDEO_ID&quality=720p'${NC}"
echo ""
echo -e "  설정 파일: ${BLUE}/opt/ytdlp-api/.env${NC}"
echo ""
echo -e "${YELLOW}  다음 단계:${NC}"
echo -e "  1. /opt/ytdlp-api/.env 에서 ALLOWED_ORIGINS 를 실제 도메인으로 변경"
echo -e "  2. Cloudflare에서 도메인 설정 (docs/vps-setup-guide.md 참고)"
echo -e "  3. 프론트엔드에서 API 연동"
echo ""
