#!/usr/bin/env bash
# SIEM-Trinity 통합 중지 스크립트
# XDR profile (misp, shuffle, thehive) 컨테이너도 함께 정지.
set -euo pipefail
cd "$(dirname "$0")"

# 03-intelligence 먼저 (loki-net external 의존)
(cd 03-intelligence && docker compose down) || true
(cd 02-detection && docker compose down) || true
# 01-collection 은 profile 컨테이너까지 함께 멈춤 (MISP/Shuffle/TheHive)
(cd 01-collection && docker compose --profile misp --profile shuffle --profile thehive down) || true

echo "✅ SIEM-Trinity 중지 완료 (XDR profile 포함)"
