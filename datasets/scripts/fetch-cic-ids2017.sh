#!/usr/bin/env bash
# CIC-IDS2017 — UNB. PCAP + labeled CSV. ~50GB.
# 단계 2 (fail2ban auto_ban) 검증의 SSH brute-force 시나리오에 사용.
#
# ⚠️ 공식 배포처는 이메일 등록을 요구한다. 본 스크립트는 등록 후 받은 URL 을 환경변수로 받는다.
set -euo pipefail

DEST="$(dirname "$0")/../cic-ids2017"
mkdir -p "$DEST"

if [ -z "${CIC_IDS2017_URL:-}" ]; then
  cat <<EOF
[!] CIC_IDS2017_URL 환경변수가 비어있다.

1. https://www.unb.ca/cic/datasets/ids-2017.html 에서 이메일 등록 후 다운로드 URL 수신
2. 다음과 같이 실행:
     export CIC_IDS2017_URL="https://..../GeneratedLabelledFlows.zip"
     bash $0

또는 Kaggle 미러를 쓰려면:
     pip install kaggle && kaggle datasets download -d cicdataset/cicids2017 -p $DEST
EOF
  exit 1
fi

echo "[+] Downloading: $CIC_IDS2017_URL"
cd "$DEST"
wget --continue --content-disposition "$CIC_IDS2017_URL"

echo "[✓] $DEST 에 파일 확인:"
ls -lh "$DEST"
echo
echo "다음 단계: tcpreplay 로 Suricata/Zeek 에 흘리기"
echo "  sudo tcpreplay -i dummy0 --topspeed $DEST/Tuesday-WorkingHours.pcap"
