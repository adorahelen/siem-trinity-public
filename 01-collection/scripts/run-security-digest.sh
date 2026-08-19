#!/bin/bash
# security-digest cron wrapper
# /etc/security-digest.env 에서 webhook URL 등 환경변수 로드 후 daily_summary.py 실행
# 작성일: 2026-04-25
#
# 사용:
#   /usr/local/bin/run-security-digest.sh           # 일간 (24h)
#   /usr/local/bin/run-security-digest.sh --weekly  # 주간 (7d)

set -euo pipefail

ENV_FILE="/etc/security-digest.env"
# 스크립트 위치 기반 자동 감지 (01-collection/scripts/)
SCRIPT="${SECURITY_DIGEST_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/daily_summary.py}"
LOG="/var/log/security-digest.log"

if [ ! -f "$ENV_FILE" ]; then
    echo "[$(date -Iseconds)] $ENV_FILE 없음 — 설정 후 다시 실행" >> "$LOG"
    exit 1
fi

# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

echo "[$(date -Iseconds)] start (args=$*)" >> "$LOG"
/usr/bin/python3 "$SCRIPT" "$@" >> "$LOG" 2>&1
echo "[$(date -Iseconds)] end (exit=$?)" >> "$LOG"
