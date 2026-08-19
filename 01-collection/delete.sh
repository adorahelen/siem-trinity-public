#!/usr/bin/env bash
# delete.sh — security-log-monitor Full Cleanup
# Usage:
#   ./delete.sh           — 컨테이너 + 볼륨 삭제 (베이스이미지 캐시 유지)
#   ./delete.sh --all     — 위 + 빌드캐시까지 완전 삭제
#
# ⚠️  이 작업은 되돌릴 수 없습니다:
#   - Loki 로그 데이터 (보존 중인 180일치 로그)
#   - Grafana 대시보드 설정 및 Alert Rules
#   - Prometheus 메트릭 데이터 (보존 중인 180일치)
#   - Wazuh Manager 에이전트 등록 정보 및 데이터
#
# 다음 실행 시 ./start.sh 로 재기동 (볼륨만 초기화, 이미지 유지)

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[slm]${RESET} $*"; }
success() { echo -e "${GREEN}[slm]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[slm]${RESET} $*"; }

PURGE_CACHE=false
if [[ "${1:-}" == "--all" ]]; then
  PURGE_CACHE=true
fi

echo -e "\n${BOLD}${RED}=== security-log-monitor — Full Cleanup ===${RESET}"
echo ""
warn "삭제 대상:"
warn "  • 컨테이너 및 네트워크"
warn "  • 볼륨: loki-data, grafana-data, prometheus-data, wazuh-data"
if [[ "$PURGE_CACHE" == "true" ]]; then
  warn "  • 빌드캐시 (--all 지정됨)"
fi
echo ""
read -r -p "$(echo -e "${RED}모든 데이터가 삭제됩니다. 계속하려면 'yes' 입력: ${RESET}")" confirm
if [[ "$confirm" != "yes" ]]; then
  info "취소됨 — 변경사항 없음."
  exit 0
fi
echo ""

# ── 1. 컨테이너 + 볼륨 정지 및 삭제 ─────────────────────────────────────────
info "컨테이너 및 볼륨 삭제 중…"
docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
success "컨테이너 및 볼륨 삭제 완료"

# ── 2. 빌드 캐시 (--all 옵션 시) ─────────────────────────────────────────────
if [[ "$PURGE_CACHE" == "true" ]]; then
  info "빌드 캐시 삭제 중…"
  docker builder prune -f
  success "빌드 캐시 삭제 완료"
fi

# ── 요약 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}정리 완료.${RESET}"
echo ""
echo -e "  다음 기동:  ${BOLD}./start.sh${RESET}"
if [[ "$PURGE_CACHE" == "false" ]]; then
  echo -e "  캐시까지 삭제:  ${BOLD}./delete.sh --all${RESET}"
fi
echo ""
