#!/usr/bin/env bash
# xdr-up.sh — 단일 명령으로 XDR 6단계 풀스택 활성화.
#
# 흐름:
#   1. 사전조건 검사 (scripts/preflight.sh)
#   2. .env 자동 생성 / 보강 (없으면 강한 secret 자동 생성)
#   3. 6 profile 동시 기동 (01-collection · 02-detection · 03-intelligence)
#   4. MISP / Shuffle / TheHive 첫 부팅 대기 + API 자동 부트스트랩
#   5. .env 의 토글 4종 자동 ON (AUTO_BAN/MISP/SHUFFLE/THEHIVE)
#   6. 02-detection 재시작 → 활성화 반영
#
# 사용:
#   ./xdr-up.sh                       대화형 (HOST_BIND_IP prompt)
#   ./xdr-up.sh 192.168.10.232        IP 지정
#   ./xdr-up.sh --skip-bootstrap      컨테이너만 띄우고 API 자동화 생략
#   ./xdr-up.sh --core-only           단계 1-3 만 (XDR 전체 아닌 기본 SIEM)
set -euo pipefail
cd "$(dirname "$0")"

if [ -t 1 ]; then BOLD=$'\033[1m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
else BOLD=""; GREEN=""; YELLOW=""; RED=""; NC=""; fi

SKIP_BOOTSTRAP=0
CORE_ONLY=0
HOST_BIND_IP_ARG=""

for arg in "$@"; do
  case "$arg" in
    --skip-bootstrap) SKIP_BOOTSTRAP=1 ;;
    --core-only)      CORE_ONLY=1 ;;
    --help|-h)        sed -n '2,17p' "$0"; exit 0 ;;
    *)                HOST_BIND_IP_ARG="$arg" ;;
  esac
done

# ── 1. preflight
bash scripts/preflight.sh

# ── 2. .env 보강
if [ ! -f .env ]; then
  cp .env.example .env
  echo "${YELLOW}new .env 생성됨${NC}"
fi

# HOST_BIND_IP 결정
if [ -n "$HOST_BIND_IP_ARG" ]; then
  HOST_BIND_IP="$HOST_BIND_IP_ARG"
elif [ -n "${HOST_BIND_IP:-}" ]; then
  :
else
  HOST_BIND_IP=$(grep '^HOST_BIND_IP=' .env | head -1 | cut -d= -f2- | tr -d '"')
  if [ -z "$HOST_BIND_IP" ] || [ "$HOST_BIND_IP" = "127.0.0.1" ]; then
    DEFAULT_IP=$(ip -4 addr show | awk '/inet / && !/127\.0\.0\.1/ {print $2; exit}' | cut -d/ -f1)
    read -rp "HOST_BIND_IP [${DEFAULT_IP:-127.0.0.1}]: " HOST_BIND_IP
    HOST_BIND_IP="${HOST_BIND_IP:-${DEFAULT_IP:-127.0.0.1}}"
  fi
fi
echo "${BOLD}HOST_BIND_IP=${HOST_BIND_IP}${NC}"

# secret 자동 생성 (.env 에 빈 값이거나 placeholder 면 채움)
gen_secret() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32; }
gen_pass()   { openssl rand -base64 18 2>/dev/null | tr -d '/+=' | cut -c1-24 ; }

ensure_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    local cur; cur=$(grep "^${key}=" .env | head -1 | cut -d= -f2-)
    if [ -z "$cur" ] || echo "$cur" | grep -qiE 'change_me|please|admin_change|misp_change'; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
      echo "  → ${key} 자동 생성"
    fi
  else
    echo "${key}=${value}" >> .env
    echo "  → ${key} 신규 추가"
  fi
}

echo "${BOLD}━━ .env 자동 보강 ━━${NC}"
ensure_env HOST_BIND_IP                  "$HOST_BIND_IP"
ensure_env MISP_ADMIN_PASSWORD           "$(gen_pass)"
ensure_env MISP_DB_PASSWORD              "$(gen_pass)"
ensure_env MISP_DB_ROOT_PASSWORD         "$(gen_pass)"
ensure_env MISP_BASE_URL                 "https://${HOST_BIND_IP}:8443"
ensure_env SHUFFLE_OPENSEARCH_PASSWORD   "$(gen_pass)"
ensure_env THEHIVE_SECRET                "$(gen_secret)"

# ── 3. 스택 기동
PROFILES=()
if [ "$CORE_ONLY" -eq 0 ]; then
  PROFILES=(--profile misp --profile shuffle --profile thehive)
fi

echo
echo "${BOLD}━━ 01-collection 기동 ━━${NC}"
( cd 01-collection && docker compose "${PROFILES[@]}" up -d ) | tail -5

echo
echo "${BOLD}━━ 02-detection 기동 ━━${NC}"
( cd 02-detection && docker compose up -d --build ) | tail -5

echo
echo "${BOLD}━━ 03-intelligence 기동 ━━${NC}"
( cd 03-intelligence && docker compose up -d ) | tail -5

# ── 4. 부트스트랩
if [ "$CORE_ONLY" -eq 1 ] || [ "$SKIP_BOOTSTRAP" -eq 1 ]; then
  echo
  echo "${YELLOW}부트스트랩 생략됨 (--core-only 또는 --skip-bootstrap).${NC}"
else
  echo
  echo "${BOLD}━━ XDR 부트스트랩 (MISP/Shuffle/TheHive API 자동화) ━━${NC}"
  bash scripts/bootstrap-xdr.sh
fi

# ── 5. 완료 안내
. .env
echo
echo "${GREEN}${BOLD}✓ XDR 가동 완료${NC}"
echo
echo "${BOLD}브라우저 UI:${NC}"
echo "  Grafana          http://${HOST_BIND_IP}:3000"
echo "  detection-api    http://${HOST_BIND_IP}:2027"
echo "  Streamlit (LLM)  http://${HOST_BIND_IP}:8501"
if [ "$CORE_ONLY" -eq 0 ]; then
echo "  MISP             https://${HOST_BIND_IP}:8443   (admin@admin.test / 자동생성 비밀번호는 .env 의 MISP_ADMIN_PASSWORD)"
echo "  Shuffle          http://${HOST_BIND_IP}:3001"
echo "  TheHive          http://${HOST_BIND_IP}:9000   (admin@thehive.local / secret — 첫 로그인 후 변경)"
fi
echo
echo "${BOLD}자동 차단 활성화 상태:${NC}"
for v in AUTO_BAN_ENABLED MISP_ENABLED SHUFFLE_ENABLED THEHIVE_ENABLED; do
  val=$(grep "^${v}=" .env | head -1 | cut -d= -f2- | tr -d '"')
  echo "  $v=${val:-false}"
done
