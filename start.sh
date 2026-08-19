#!/usr/bin/env bash
# SIEM-Trinity 통합 시작 스크립트
#
# 사용법:
#   ./start.sh                        # 대화형 (HOST_BIND_IP 물어봄)
#   ./start.sh 192.168.10.232         # 첫 인자로 IP 지정
#   HOST_BIND_IP=192.168.10.232 ./start.sh   # 환경변수
#
# 동작:
#   1) HOST_BIND_IP 결정 (인자 > env > prompt > 기본값)
#   2) 사용할 6개 포트 점유 사전 점검
#   3) 충돌 발견 시 사용자 선택 (중단/무시/종료)
#   4) .env 자동 생성
#   5) 3 레이어 차례로 docker compose up
#   6) Ollama 모델 자동 pull (첫 실행 시만)
#   7) 4개 UI URL 안내

set -euo pipefail
cd "$(dirname "$0")"

# ─────────────────────────────────────────────
# 색상
# ─────────────────────────────────────────────
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
    BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

# 사용할 포트 정의
declare -A PORTS=(
    [3000]="Grafana"
    [3100]="Loki"
    [9090]="Prometheus"
    [2027]="detection-api"
    [8501]="Streamlit"
    [11434]="Ollama"
)

# ─────────────────────────────────────────────
# 1. HOST_BIND_IP 결정
# ─────────────────────────────────────────────
HOST_BIND_IP="${1:-${HOST_BIND_IP:-}}"

if [ -z "$HOST_BIND_IP" ]; then
    if [ -t 0 ]; then
        # tty: 대화형 prompt + 머신 IP 자동 감지
        AUTO_IP="$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || echo "")"

        echo
        echo "${BOLD}═══════════════════════════════════════════${NC}"
        echo "${BOLD}  SIEM-Trinity 시작${NC}"
        echo "${BOLD}═══════════════════════════════════════════${NC}"
        echo
        echo "서비스를 어떤 IP에 노출할까요?"
        echo "  ${BLUE}127.0.0.1${NC}     로컬 전용 (외부 접속 불가)"
        if [ -n "$AUTO_IP" ]; then
            echo "  ${GREEN}$AUTO_IP${NC}  ← 이 머신의 IP (LAN 노출 권장)"
        fi
        echo "  ${YELLOW}0.0.0.0${NC}       모든 인터페이스 (보안 주의)"
        echo
        default_ip="${AUTO_IP:-127.0.0.1}"
        read -r -p "HOST_BIND_IP [${default_ip}]: " input
        HOST_BIND_IP="${input:-$default_ip}"
    else
        # 비대화형: 기본값
        HOST_BIND_IP="127.0.0.1"
        echo "[non-interactive] HOST_BIND_IP=127.0.0.1 사용"
    fi
fi
export HOST_BIND_IP
echo "${GREEN}✓${NC} HOST_BIND_IP = ${BOLD}$HOST_BIND_IP${NC}"

# ─────────────────────────────────────────────
# 2. 포트 점유 사전 점검
# ─────────────────────────────────────────────
echo
echo "${BOLD}━━ 포트 점유 점검 ━━${NC}"

# SIEM-Trinity 자기 컨테이너 식별 (idempotent: 자기 거면 충돌 아님)
OWN_CONTAINERS=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "^(loki|promtail|grafana|prometheus|node-exporter|wazuh-manager|detection-api|intelligence-ui|intelligence-ollama)$" || true)

conflicts=()
for port in "${!PORTS[@]}"; do
    service="${PORTS[$port]}"

    # 점유 여부 확인 — 특정 IP + 0.0.0.0 둘 다 체크
    in_use=""
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "^(${HOST_BIND_IP}|0\.0\.0\.0|\*):${port}$"; then
        in_use="yes"
    fi

    if [ -z "$in_use" ]; then
        printf "  %-30s %s ${GREEN}✓ 사용 가능${NC}\n" "${HOST_BIND_IP}:${port}" "$service"
        continue
    fi

    # 점유자가 SIEM-Trinity 자기 컨테이너인지 확인
    own=""
    if [ -n "$OWN_CONTAINERS" ]; then
        # docker port mapping에서 우리 포트 찾기
        for c in $OWN_CONTAINERS; do
            if docker port "$c" 2>/dev/null | grep -q ":${port}\b"; then
                own="$c"
                break
            fi
        done
    fi

    if [ -n "$own" ]; then
        printf "  %-30s %s ${YELLOW}↻ SIEM-Trinity ($own) 가동 중${NC}\n" "${HOST_BIND_IP}:${port}" "$service"
    else
        # 외부 충돌 — 점유 프로세스 정보 best-effort
        proc_info=$(ss -tlnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $NF; exit}' || echo "")
        printf "  %-30s %s ${RED}✗ 점유 중${NC} %s\n" "${HOST_BIND_IP}:${port}" "$service" "$proc_info"
        conflicts+=("$port:$service")
    fi
done

# ─────────────────────────────────────────────
# 3. 충돌 시 액션
# ─────────────────────────────────────────────
if [ ${#conflicts[@]} -gt 0 ]; then
    echo
    echo "${RED}${BOLD}⚠ ${#conflicts[@]}개 포트가 외부 프로세스에 점유돼 있습니다.${NC}"
    echo "  점유 프로세스 자세히: ${BLUE}sudo lsof -i :PORT${NC}"
    echo

    if [ -t 0 ]; then
        echo "어떻게 하시겠습니까?"
        echo "  ${BOLD}1)${NC} 종료 (수동으로 정리 후 재시도) — 권장"
        echo "  ${BOLD}2)${NC} 무시하고 진행 (docker가 에러 낼 수 있음)"
        read -r -p "선택 [1]: " choice
        case "${choice:-1}" in
            2) echo "${YELLOW}강제 진행${NC}" ;;
            *) echo "종료. 충돌 정리 후 다시 실행하세요."; exit 1 ;;
        esac
    else
        echo "${RED}비대화형 환경: 충돌 시 중단합니다.${NC}"
        exit 1
    fi
fi

# ─────────────────────────────────────────────
# 4. .env 자동 생성 (루트 단일 출처)
# ─────────────────────────────────────────────
# 모든 compose 호출이 --env-file ../.env 로 루트 .env 만 참조한다.
# 서브디렉토리 .env 는 더 이상 생성하지 않음 (#95 정착).
echo
echo "${BOLD}━━ .env 준비 ━━${NC}"
ROOT_ENV="$(pwd)/.env"
if [ ! -f "$ROOT_ENV" ]; then
    echo "  .env 생성 (루트 단일 출처)"
    GEN_GF_PW="${GF_ADMIN_PASSWORD:-$(openssl rand -base64 24)}"
    cat > "$ROOT_ENV" <<EOF
HOST_BIND_IP=${HOST_BIND_IP}
GF_ADMIN_USER=${GF_ADMIN_USER:-admin}
GF_ADMIN_PASSWORD=${GEN_GF_PW}
LOKI_NETWORK_NAME=${LOKI_NETWORK_NAME:-siem-trinity_default}
EOF
else
    sed -i "s|^HOST_BIND_IP=.*|HOST_BIND_IP=${HOST_BIND_IP}|" "$ROOT_ENV"
    echo "  .env 갱신 (HOST_BIND_IP=${HOST_BIND_IP})"
fi

# 잔존 서브디렉토리 .env 정리 안내 (symlink/실파일 모두 cleanup 권장)
for d in 01-collection 02-detection 03-intelligence; do
    if [ -e "$d/.env" ] && [ ! -L "$d/.env" ]; then
        echo "  ${YELLOW}경고: $d/.env 실파일 존재 — 루트 .env 와 동기화 책임 본인. 정리: rm $d/.env${NC}"
    fi
done

# ─────────────────────────────────────────────
# 5. compose up (3 레이어)
# ─────────────────────────────────────────────
echo
echo "${BOLD}━━ [1/4] 01-collection (수집 인프라) ━━${NC}"
(cd 01-collection && docker compose --env-file ../.env up -d 2>&1 | tail -3)

echo
echo "${BOLD}━━ [2/4] 03-intelligence (LLM 런타임 + 자동 모델 pull) ━━${NC}"
(cd 03-intelligence && docker compose --env-file ../.env up -d 2>&1 | tail -5)
# intelligence-ollama-pull 컨테이너가 gemma4 + nomic-embed 자동 pull (백그라운드)

echo
echo "${BOLD}━━ [3/4] 02-detection (탐지+BFF, 빌드 1-2분) ━━${NC}"
(cd 02-detection && docker compose --env-file ../.env up -d --build 2>&1 | tail -5)

echo
echo "${BOLD}━━ [4/4] 04-ui (TrinitySOC, 빌드 1분) ━━${NC}"
if [ ! -d 04-ui/dist ] || [ ! -f 04-ui/dist/index.html ]; then
    echo "  04-ui/dist 미존재 — npm 빌드 시작"
    if ! command -v npm >/dev/null 2>&1; then
        echo "${RED}✗ Node.js/npm 미설치. https://nodejs.org/ 또는 setup_20.x 스크립트 참고${NC}"
        echo "  04-ui 빌드 건너뜀. detection-api·LLM 은 정상 가동."
    else
        (cd 04-ui && npm install --silent && npm run build 2>&1 | tail -3)
    fi
fi
if [ -d 04-ui/dist ]; then
    (cd 04-ui/deploy && docker compose up -d 2>&1 | tail -3)
fi

# ─────────────────────────────────────────────
# 6. Ollama 모델 pull 상태 확인 (intelligence-ollama-pull 이 백그라운드 처리)
# ─────────────────────────────────────────────
echo
echo "${BOLD}━━ Ollama 모델 확인 ━━${NC}"
echo "intelligence-ollama 준비 대기 (10초)..."
sleep 10

for model in gemma4:e2b-it-q4_K_M nomic-embed-text; do
    if docker exec intelligence-ollama ollama list 2>/dev/null | grep -q "$model"; then
        echo "  ${GREEN}✓${NC} $model 이미 존재"
    else
        echo "  ↓ $model 백그라운드 pull 중 (intelligence-ollama-pull 컨테이너) — 몇 분 소요"
        echo "    진행 상황: ${BLUE}docker logs intelligence-ollama-pull -f${NC}"
    fi
done

# ─────────────────────────────────────────────
# 7. 완료 안내
# ─────────────────────────────────────────────
cat <<EOF

${GREEN}${BOLD}✓ SIEM-Trinity 가동 완료${NC}

${BOLD}🛰 메인 콘솔:${NC}
  TrinitySOC:     ${BLUE}http://${HOST_BIND_IP}:5173${NC}

${BOLD}🔌 백엔드 API:${NC}
  detection-api:  ${BLUE}http://${HOST_BIND_IP}:2027/api/status${NC}
  Loki:           ${BLUE}http://${HOST_BIND_IP}:3100${NC}
  Ollama:         ${BLUE}http://${HOST_BIND_IP}:11434${NC}

${BOLD}📊 (선택) 백업 도구:${NC}
  Grafana:        ${BLUE}http://${HOST_BIND_IP}:3000${NC}    (admin/admin)
  Prometheus:     ${BLUE}http://${HOST_BIND_IP}:9090${NC}

${BOLD}📋 컨테이너:${NC}  docker ps
${BOLD}🛑 중지:${NC}      ./stop.sh
EOF
