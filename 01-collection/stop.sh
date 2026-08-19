#!/usr/bin/env bash
# stop.sh — security-log-monitor Shutdown
# Usage: ./stop.sh
#
# 컨테이너만 정지합니다. 볼륨(Loki 로그, Grafana 설정 등)은 보존됩니다.
# 데이터까지 전부 삭제하려면: ./delete.sh

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[slm]${RESET} $*"; }
success() { echo -e "${GREEN}[slm]${RESET} $*"; }

echo -e "\n${BOLD}=== security-log-monitor — Shutdown ===${RESET}"

info "Stopping containers (volumes preserved)…"
docker compose -f "$COMPOSE_FILE" down

success "All containers stopped. Data volumes intact."
echo ""
echo -e "  재시작:  ${BOLD}./start.sh${RESET}"
echo -e "  완전 삭제: ${BOLD}./delete.sh${RESET}"
echo ""
