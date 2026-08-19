#!/usr/bin/env bash
# start.sh — security-log-monitor Startup
# Usage:
#   ./start.sh           — 컨테이너 기동 (이미지 캐시 사용)
#   ./start.sh --build   — 이미지 재빌드 후 기동

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[slm]${RESET} $*"; }
success() { echo -e "${GREEN}[slm]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[slm]${RESET} $*"; }
header()  { echo -e "\n${BOLD}── $* ──${RESET}"; }

BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG="--build"
  info "빌드 플래그 감지 — 이미지 재빌드 포함"
fi

echo -e "\n${BOLD}=== security-log-monitor — Startup ===${RESET}"

# ── 1. 컨테이너 기동 ──────────────────────────────────────────────────────────
header "1/2  Starting all containers…"
docker compose -f "$COMPOSE_FILE" up -d $BUILD_FLAG
success "docker compose up — done"

# ── 2. 서비스 헬스 체크 ────────────────────────────────────────────────────────
header "2/2  Health check…"

# Loki 준비 대기 (최대 30초)
LOKI_WAIT=30; loki_elapsed=0
info "Waiting for Loki to be ready…"
until curl -sf http://localhost:3100/ready > /dev/null 2>&1; do
  if (( loki_elapsed >= LOKI_WAIT )); then
    warn "Loki not ready after ${LOKI_WAIT}s — check: docker compose logs loki"
    break
  fi
  sleep 2; (( loki_elapsed += 2 ))
done
if (( loki_elapsed < LOKI_WAIT )); then
  success "Loki: ready (${loki_elapsed}s)"
fi

# Grafana 준비 대기 (최대 30초)
GRAFANA_WAIT=30; grafana_elapsed=0
info "Waiting for Grafana to be ready…"
until curl -sf http://localhost:3000/api/health > /dev/null 2>&1; do
  if (( grafana_elapsed >= GRAFANA_WAIT )); then
    warn "Grafana not ready after ${GRAFANA_WAIT}s — check: docker compose logs grafana"
    break
  fi
  sleep 2; (( grafana_elapsed += 2 ))
done
if (( grafana_elapsed < GRAFANA_WAIT )); then
  success "Grafana: ready (${grafana_elapsed}s)"
fi

# ── 최종 상태 ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}기동 완료.${RESET}"
echo ""
echo -e "  Grafana:    ${BOLD}http://localhost:3000${RESET}  (admin / \$GF_ADMIN_PASSWORD — .env 참조)"
echo -e "  Loki:       ${BOLD}http://localhost:3100${RESET}"
echo -e "  Prometheus: ${BOLD}http://localhost:9090${RESET}"
echo ""
echo -e "  중지:   ${BOLD}./stop.sh${RESET}"
echo -e "  삭제:   ${BOLD}./delete.sh${RESET}"
echo ""
