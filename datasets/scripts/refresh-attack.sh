#!/usr/bin/env bash
# MITRE ATT&CK Enterprise STIX 번들 최신화.
# 4개월 주기 신규 릴리스에 맞춰 수동 실행.
set -euo pipefail

DEST="$(dirname "$0")/../attack/enterprise-attack.json"
URL="https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json"

echo "[+] Fetching $URL"
curl -fL -o "$DEST.tmp" "$URL"
mv "$DEST.tmp" "$DEST"

SIZE=$(du -h "$DEST" | cut -f1)
COUNT=$(python3 -c "import json; print(sum(1 for o in json.load(open('$DEST'))['objects'] if o.get('type')=='attack-pattern' and not o.get('x_mitre_deprecated') and not o.get('revoked')))")

echo "[✓] $DEST ($SIZE, $COUNT active techniques)"
echo "    → 변경 사항 있으면: git add $DEST && git commit -m 'chore: refresh ATT&CK Enterprise STIX'"
