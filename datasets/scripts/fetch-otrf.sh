#!/usr/bin/env bash
# OTRF Security-Datasets (구 Mordor) — Sysmon/Winlogbeat JSON, ATT&CK 라벨 풍부.
# Wazuh 엔드포인트 이벤트 시뮬 및 XDR 상관분석 검증용.
set -euo pipefail

DEST="$(dirname "$0")/../otrf-security-datasets"
REPO="https://github.com/OTRF/Security-Datasets.git"

if [ -d "$DEST/.git" ]; then
  echo "[+] Updating $DEST"
  git -C "$DEST" pull --ff-only
else
  echo "[+] Cloning $REPO → $DEST"
  git clone --depth 1 "$REPO" "$DEST"
fi

echo "[✓] OTRF Security-Datasets at $DEST"
echo "    데이터셋 카탈로그: $DEST/datasets/"
