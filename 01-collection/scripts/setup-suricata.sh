#!/bin/bash
# Suricata 설치 + 최소 설정 패치 스크립트
# 실행: sudo bash <repo>/01-collection/scripts/setup-suricata.sh
set -euo pipefail

COLLECTION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

IFACE="enp2s0"
SURICATA_CONF="/etc/suricata/suricata.yaml"

echo "[1/4] Suricata 설치..."
apt-get install -y suricata

echo "[2/4] 룰셋 업데이트..."
suricata-update

echo "[3/4] 설정 패치..."

# 캡처 인터페이스 설정 (af-packet, pcap 섹션의 eth0/default → IFACE)
# af-packet 섹션
sed -i "/^af-packet:/,/^[^ ]/{s/- interface: eth0/- interface: ${IFACE}/}" "$SURICATA_CONF"
sed -i "/^af-packet:/,/^[^ ]/{s/- interface: default/- interface: ${IFACE}/}" "$SURICATA_CONF"
# pcap 섹션
sed -i "/^pcap:/,/^[^ ]/{s/- interface: eth0/- interface: ${IFACE}/}" "$SURICATA_CONF"

# EVE JSON 출력 확인 (기본적으로 활성화되어 있지만 명시적으로 보장)
# Suricata 기본 설정에서 eve-log enabled: yes 이므로 별도 패치 불필요

# 로그 디렉토리 권한: promtail(root로 실행) 이 읽을 수 있도록
chmod 755 /var/log/suricata

echo "[4/4] Suricata 서비스 활성화 및 시작..."
systemctl enable suricata
systemctl restart suricata
sleep 3
systemctl status suricata --no-pager | head -15

echo ""
echo "설정 확인:"
echo "  - 인터페이스: $(grep 'interface:' /etc/suricata/suricata.yaml | head -2)"
echo "  - EVE 로그 위치: /var/log/suricata/eve.json"
echo ""
echo "Promtail 재시작 (Loki로 EVE JSON 수집 시작):"
echo "  cd \"$COLLECTION_ROOT\" && docker compose restart promtail"
