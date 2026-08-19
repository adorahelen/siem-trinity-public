#!/usr/bin/env bash
# PCAP-ATTACK (sbousseaden) — MITRE ATT&CK 태그된 소형 PCAP 모음.
# 룰 회귀 테스트용.
set -euo pipefail

DEST="$(dirname "$0")/../pcap-attack"
REPO="https://github.com/sbousseaden/PCAP-ATTACK.git"

if [ -d "$DEST/.git" ]; then
  echo "[+] Updating $DEST"
  git -C "$DEST" pull --ff-only
else
  echo "[+] Cloning $REPO → $DEST"
  git clone --depth 1 "$REPO" "$DEST"
fi

echo "[✓] PCAP-ATTACK at $DEST"
echo "    PCAP 개수: $(find "$DEST" -name '*.pcap' -o -name '*.pcapng' | wc -l)"
