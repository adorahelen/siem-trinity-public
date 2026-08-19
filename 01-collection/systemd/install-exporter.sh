#!/usr/bin/env bash
# security-log-exporter systemd unit 설치 스크립트
# 템플릿(__USER__, __COLLECTION_ROOT__)을 현재 환경에 맞게 치환해 설치
#
# 사용: sudo bash install-exporter.sh
#       또는: SYSTEM_USER=myuser sudo -E bash install-exporter.sh

set -euo pipefail

SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTION_ROOT="${COLLECTION_ROOT:-$(cd "$TEMPLATE_DIR/.." && pwd)}"
SYSTEM_USER="${SYSTEM_USER:-${SUDO_USER:-$USER}}"

if [ "$EUID" -ne 0 ]; then
    echo "sudo로 실행하세요"; exit 1
fi

# 사용자 확인
if ! id "$SYSTEM_USER" >/dev/null 2>&1; then
    echo "사용자 '$SYSTEM_USER' 가 존재하지 않습니다. SYSTEM_USER env로 지정하세요."
    exit 1
fi

# 경로 확인
if [ ! -f "$COLLECTION_ROOT/exporter/collector.py" ]; then
    echo "collector.py를 찾을 수 없음: $COLLECTION_ROOT/exporter/collector.py"
    exit 1
fi

echo "사용자: $SYSTEM_USER"
echo "collection root: $COLLECTION_ROOT"

# 템플릿 치환 후 설치
sed -e "s|__USER__|$SYSTEM_USER|g" \
    -e "s|__COLLECTION_ROOT__|$COLLECTION_ROOT|g" \
    "$TEMPLATE_DIR/security-log-exporter.service.template" \
    > "$SYSTEMD_DIR/security-log-exporter.service"

# Timer 파일도 있으면 같이 복사 (기존 *.timer 보존)
for timer in "$TEMPLATE_DIR"/*.timer "$TEMPLATE_DIR"/security-log-exporter-failure@.service; do
    [ -f "$timer" ] && cp "$timer" "$SYSTEMD_DIR/"
done

systemctl daemon-reload
echo "✓ 설치 완료: $SYSTEMD_DIR/security-log-exporter.service"
echo "  활성화: sudo systemctl enable --now security-log-exporter.timer"
