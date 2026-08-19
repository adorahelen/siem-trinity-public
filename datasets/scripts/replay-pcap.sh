#!/usr/bin/env bash
# PCAP → 더미 NIC → 호스트의 Suricata/Zeek 가 캡처.
# 운영 NIC 에 흘리면 진짜 트래픽으로 전파되므로 dummy0 로만 보낸다.
set -euo pipefail

PCAP="${1:-}"
IFACE="${2:-dummy0}"
SPEED="${3:---topspeed}"

if [ -z "$PCAP" ] || [ ! -f "$PCAP" ]; then
  echo "usage: $0 <pcap-file> [iface=dummy0] [speed=--topspeed]"
  exit 1
fi

if ! command -v tcpreplay >/dev/null; then
  echo "[!] tcpreplay 미설치. sudo apt install tcpreplay"
  exit 1
fi

# dummy0 가 없으면 생성
if ! ip link show "$IFACE" >/dev/null 2>&1; then
  echo "[+] Creating $IFACE"
  sudo ip link add "$IFACE" type dummy
  sudo ip link set "$IFACE" up
fi

echo "[+] Replaying $PCAP → $IFACE ($SPEED)"
sudo tcpreplay -i "$IFACE" "$SPEED" "$PCAP"
echo "[✓] Done. Suricata/Zeek 로그를 promtail 가 픽업했는지 확인:"
echo "    docker logs promtail 2>&1 | tail -20"
