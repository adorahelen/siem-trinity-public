#!/usr/bin/env bash
# 사전조건 체커 — XDR 전체 가동 가능 여부 검증.
# bootstrap-xdr.sh / start.sh 시작 시 호출. exit 1 이면 가동 중단.
set -euo pipefail

if [ -t 1 ]; then RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else RED=""; GREEN=""; YELLOW=""; BOLD=""; NC=""; fi

ok()    { echo "  ${GREEN}✓${NC} $1"; }
warn()  { echo "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo "  ${RED}✗${NC} $1"; FAILED=1; }
FAILED=0

echo "${BOLD}━━ 사전조건 검사 ━━${NC}"

# Docker
if command -v docker >/dev/null 2>&1; then
  ok "docker ($(docker --version 2>&1 | head -1))"
else
  fail "docker 미설치 — 'sudo apt install docker.io' 또는 https://docs.docker.com/engine/install/"
fi

# docker compose v2
if docker compose version >/dev/null 2>&1; then
  ok "docker compose v2 ($(docker compose version 2>&1 | head -1))"
else
  fail "docker compose v2 미설치 — 'sudo apt install docker-compose-plugin'"
fi

# docker 그룹 가입
if id -nG "$USER" 2>&1 | grep -qw docker; then
  ok "현재 사용자 '$USER' 가 docker 그룹 소속"
else
  warn "현재 사용자가 docker 그룹 비소속 — 'sudo usermod -aG docker $USER && newgrp docker' 후 재로그인"
fi

# vm.max_map_count — Elasticsearch / OpenSearch 필수
MAX_MAP=$(sysctl -n vm.max_map_count 2>/dev/null || echo "0")
if [ "$MAX_MAP" -ge 262144 ]; then
  ok "vm.max_map_count=$MAX_MAP (>= 262144)"
else
  fail "vm.max_map_count=$MAX_MAP < 262144 — 'sudo sysctl -w vm.max_map_count=262144' (영구: /etc/sysctl.d 에 기록)"
fi

# 디스크 여유
AVAIL_G=$(df -BG --output=avail . 2>/dev/null | tail -1 | tr -dc '0-9')
if [ "${AVAIL_G:-0}" -ge 30 ]; then
  ok "디스크 여유 ${AVAIL_G}GB (>= 30GB)"
elif [ "${AVAIL_G:-0}" -ge 15 ]; then
  warn "디스크 여유 ${AVAIL_G}GB — XDR 풀스택 권장 30GB+, 단계 1-3 만이면 15GB 로 충분"
else
  fail "디스크 여유 ${AVAIL_G}GB — 최소 15GB 필요"
fi

# RAM
MEM_G=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo "0")
if [ "${MEM_G:-0}" -ge 16 ]; then
  ok "RAM ${MEM_G}GB (>= 16GB) — 6단계 풀스택 가능"
elif [ "${MEM_G:-0}" -ge 8 ]; then
  warn "RAM ${MEM_G}GB — 단계 1-5 까지만 권장 (TheHive+Cassandra+ES 가 4GB 소모)"
else
  fail "RAM ${MEM_G}GB < 8GB — 최소 8GB 필요"
fi

# 인터넷 (이미지 pull)
if curl -fsS --max-time 5 -o /dev/null https://registry-1.docker.io/v2/ 2>/dev/null \
   || curl -fsS --max-time 5 -o /dev/null https://ghcr.io/v2/ 2>/dev/null; then
  ok "registry 도달 가능"
else
  warn "Docker registry 접근 불가 — 첫 부팅 시 이미지 pull 실패"
fi

# Tailscale (옵션)
if command -v tailscale >/dev/null 2>&1; then
  TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
  [ -n "$TS_IP" ] && ok "tailscale IP=$TS_IP (단계 3 화이트리스트 자동 포함됨)" || warn "tailscale 설치되었으나 IP 없음"
else
  warn "tailscale 미설치 — 외부 접근 시 추가 화이트리스트 필요"
fi

echo
if [ "$FAILED" -eq 1 ]; then
  echo "${RED}${BOLD}사전조건 미충족.${NC} 위 ✗ 항목을 해결한 뒤 재실행하세요."
  exit 1
fi
echo "${GREEN}${BOLD}모든 필수 조건 충족.${NC}"
