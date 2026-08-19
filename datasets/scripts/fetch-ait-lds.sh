#!/usr/bin/env bash
# AIT Log Data Set v2.0 + AIT Alert Data Set
# 우리 스택 (Suricata eve.json + Wazuh + Apache/auth/syslog + PCAP) 과 1:1 매칭.
#
# ⚠️ ~20GB. 다운로드 전 디스크 여유 확인.
# Zenodo direct download 는 가끔 느림 — wget --continue 권장.
set -euo pipefail

DEST="$(dirname "$0")/../ait-lds"
mkdir -p "$DEST"

# Zenodo record IDs (2024 latest)
LDS_RECORD="5789064"
ADS_RECORD="8263181"

echo "[+] AIT-LDS v2.0 ($LDS_RECORD)"
echo "    landing: https://zenodo.org/records/$LDS_RECORD"
echo "    NOTE: Zenodo 가 직접 wget 차단할 수 있음. 브라우저로 .tar.gz 받아 $DEST/ 에 넣는 것 권장."

read -p "지금 wget 시도? [y/N] " yn
if [[ "${yn,,}" == "y" ]]; then
  cd "$DEST"
  wget --continue --content-disposition \
    "https://zenodo.org/records/$LDS_RECORD/files-archive"
  wget --continue --content-disposition \
    "https://zenodo.org/records/$ADS_RECORD/files-archive"
else
  echo "수동 다운로드 후 $DEST/ 에 풀고 다음 단계 진행:"
  echo "  tar xf $DEST/<archive>.tar.gz -C $DEST/"
fi

echo "[✓] 완료 시 $DEST/ 안에:"
echo "    auth.log, suricata-eve.json, wazuh-alerts.json, *.pcap 등이 있어야 정상"
