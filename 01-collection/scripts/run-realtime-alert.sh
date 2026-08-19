#!/bin/bash
# realtime-alert cron wrapper
# /etc/security-digest.env 에서 webhook URL 로드 후 realtime_alert.py 실행
# 작성일: 2026-04-25

set -euo pipefail

ENV_FILE="/etc/security-digest.env"
SCRIPT="${REALTIME_ALERT_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/realtime_alert.py}"
LOG="/var/log/security-realtime.log"

if [ ! -f "$ENV_FILE" ]; then
    echo "[$(date -Iseconds)] $ENV_FILE 없음 — 설정 후 다시 실행" >> "$LOG"
    exit 1
fi

# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

/usr/bin/python3 "$SCRIPT" >> "$LOG" 2>&1
