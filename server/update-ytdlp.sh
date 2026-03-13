#!/bin/bash
# ============================================================
# yt-dlp 자동 업데이트 스크립트
# cron에서 매일 새벽 4시에 실행됩니다.
#
# 수동 실행: sudo bash /opt/ytdlp-api/update-ytdlp.sh
# ============================================================

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX yt-dlp 업데이트 시작..."

# 현재 버전
OLD_VER=$(yt-dlp --version 2>/dev/null || echo "unknown")
echo "$LOG_PREFIX 현재 버전: $OLD_VER"

# pip로 업데이트
pip3 install --break-system-packages -U yt-dlp 2>/dev/null || pip3 install -U yt-dlp

# 새 버전 확인
NEW_VER=$(yt-dlp --version 2>/dev/null || echo "unknown")
echo "$LOG_PREFIX 업데이트 후 버전: $NEW_VER"

if [ "$OLD_VER" != "$NEW_VER" ]; then
  echo "$LOG_PREFIX 버전 변경됨! $OLD_VER → $NEW_VER"
  echo "$LOG_PREFIX API 서버 재시작..."
  systemctl restart ytdlp-api
  echo "$LOG_PREFIX 재시작 완료"
else
  echo "$LOG_PREFIX 이미 최신 버전입니다."
fi

echo "$LOG_PREFIX 업데이트 완료."
