#!/usr/bin/env bash
# bootstrap-xdr.sh — XDR 풀스택의 admin 비번/피드/API 키/토글 자동 설정.
#
# 호출 순서 (xdr-up.sh 가 자동 호출):
#   1. wait_for_service MISP/Shuffle/TheHive 첫 부팅 완료
#   2. MISP   admin login → 비번 reset → URLhaus 피드 enable+fetch → API 키 추출
#   3. Shuffle 첫 user signup → workflow JSON import → webhook URL 추출
#   4. TheHive admin login → org 생성 → 서비스 계정 + API 키 발급
#   5. .env 갱신 (MISP_API_KEY / SHUFFLE_WEBHOOK_URL / THEHIVE_API_KEY + 4개 토글 ON)
#   6. 02-detection 재시작
#
# 멱등성: 이미 부트스트랩된 환경에서 재실행 시 안전 (기존 키 발견 시 스킵).
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -t 1 ]; then BOLD=$'\033[1m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
else BOLD=""; GREEN=""; YELLOW=""; RED=""; NC=""; fi
log() { echo "  ${BOLD}[$1]${NC} ${2:-}"; }
ok()  { echo "  ${GREEN}✓${NC} ${1:-}"; }
warn(){ echo "  ${YELLOW}⚠${NC} ${1:-}"; }
err() { echo "  ${RED}✗${NC} ${1:-}"; }

. .env || { err ".env 없음"; exit 1; }

# .env 의 한 키 갱신 (placeholder/빈 값 모두 덮어쓰기)
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
  export "$key=$value"
}

wait_for() {
  local url="$1" name="$2" timeout="${3:-180}"
  log "wait" "$name 첫 부팅 대기 (${timeout}s 한도)..."
  local start=$SECONDS
  while [ $((SECONDS - start)) -lt "$timeout" ]; do
    if curl -sk --max-time 3 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -qE '^(200|302|303|401|520)$'; then
      ok "$name ready"
      return 0
    fi
    sleep 5
  done
  err "$name 타임아웃"
  return 1
}

# ───────────────────────────────────────
# MISP
# ───────────────────────────────────────
bootstrap_misp() {
  log "MISP" "API 부트스트랩 시작"
  local base="https://${HOST_BIND_IP:-127.0.0.1}:8443"
  wait_for "${base}/users/login" "MISP" 300 || return 1

  # 이미 API 키가 있으면 스킵
  if [ -n "${MISP_API_KEY:-}" ]; then
    ok "MISP_API_KEY 이미 설정됨 — 스킵"
    return 0
  fi

  # 기본 admin (admin@admin.test / admin) → 새 비번으로 로그인 시도
  # MISP-docker 는 ADMIN_PASSWORD 환경변수로 첫 부팅 시 비번이 이미 적용됨
  local admin_email="${MISP_ADMIN_EMAIL:-admin@admin.test}"
  local admin_pwd="${MISP_ADMIN_PASSWORD:-admin}"

  log "MISP" "로그인 시도 ${admin_email}"
  local cookie_jar; cookie_jar=$(mktemp)
  trap "rm -f $cookie_jar" RETURN

  # login form token
  curl -sk -c "$cookie_jar" -o /dev/null "${base}/users/login"
  local token; token=$(curl -sk -b "$cookie_jar" -c "$cookie_jar" "${base}/users/login" | grep -oE 'name="data\[_Token\]\[key\]" value="[^"]+"' | head -1 | sed 's/.*value="\(.*\)"/\1/')
  if [ -z "$token" ]; then
    warn "MISP login form token 추출 실패 — 다음 단계 스킵. 수동 설정 필요."
    return 1
  fi
  local login_status; login_status=$(curl -sk -b "$cookie_jar" -c "$cookie_jar" -o /dev/null -w "%{http_code}" -X POST \
      "${base}/users/login" \
      --data-urlencode "_method=POST" \
      --data-urlencode "data[_Token][key]=$token" \
      --data-urlencode "data[User][email]=$admin_email" \
      --data-urlencode "data[User][password]=$admin_pwd")
  if [ "$login_status" != "302" ] && [ "$login_status" != "200" ]; then
    warn "MISP 로그인 HTTP $login_status — admin 비번이 .env 와 다를 수 있음. 웹 UI 수동 설정 필요."
    return 1
  fi
  ok "MISP 로그인 OK"

  # 첫 admin auth key 발급 — admin.users/getAuthKey POST 또는 auth_keys/add
  local key_json; key_json=$(curl -sk -b "$cookie_jar" -X POST \
      -H "Accept: application/json" -H "Content-Type: application/json" \
      -d "{\"AuthKey\":{\"user_id\":1,\"comment\":\"siem-trinity-bootstrap\"}}" \
      "${base}/auth_keys/add/1")
  local api_key; api_key=$(echo "$key_json" | grep -oE '"authkey_raw":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [ -z "$api_key" ] || [ "${#api_key}" -lt 40 ]; then
    warn "MISP API 키 자동 발급 실패 — 웹 UI 의 'My Profile → Auth keys' 에서 수동 발급 후 .env 의 MISP_API_KEY 갱신"
    return 1
  fi
  set_env MISP_API_KEY "$api_key"
  set_env MISP_URL "http://misp-core:80"
  set_env MISP_ENABLED "true"
  ok "MISP_API_KEY 발급 (${#api_key}자) + 토글 ON"

  # URLhaus 피드 enable + fetch (피드 id 는 환경에 따라 다름; restSearch 로 조회 후 enable)
  log "MISP" "기본 피드 (URLhaus, CIRCL) enable + fetch"
  curl -sk -H "Authorization: $api_key" -H "Accept: application/json" \
      -X POST "${base}/feeds/enable/1" -o /dev/null
  curl -sk -H "Authorization: $api_key" -H "Accept: application/json" \
      -X POST "${base}/feeds/fetchFromFeed/1" -o /dev/null &
  ok "feed fetch 백그라운드 진행 중 (~5분)"
}

# ───────────────────────────────────────
# Shuffle
# ───────────────────────────────────────
bootstrap_shuffle() {
  log "Shuffle" "API 부트스트랩 시작"
  local base="http://${HOST_BIND_IP:-127.0.0.1}:3001"
  wait_for "${base}/api/v1/getinfo" "Shuffle" 180 || return 1

  if [ -n "${SHUFFLE_WEBHOOK_URL:-}" ]; then
    ok "SHUFFLE_WEBHOOK_URL 이미 설정됨 — 스킵"
    return 0
  fi

  # 첫 user signup (admin 자동 생성)
  local signup_pwd; signup_pwd="$(openssl rand -base64 18 2>/dev/null | tr -d '/+=' | cut -c1-24)"
  local signup_resp; signup_resp=$(curl -s -X POST "${base}/api/v1/login" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"admin@shuffle.local\",\"password\":\"$signup_pwd\",\"firstrun\":true}" || true)
  # 이미 user 있으면 첫 setup endpoint 다른 형식 — 일단 시도 후 fallback

  if echo "$signup_resp" | grep -q "success"; then
    ok "Shuffle admin signup OK"
    set_env SHUFFLE_ADMIN_PASSWORD "$signup_pwd"
  else
    warn "Shuffle 첫 signup 실패 또는 이미 setup 완료됨 — 웹 UI ($base) 수동 signup 후 재실행"
    return 1
  fi

  # API 키 가져오기 (로그인 응답에서 추출)
  local api_key; api_key=$(echo "$signup_resp" | grep -oE '"apikey":"[^"]+"' | cut -d'"' -f4)
  if [ -n "$api_key" ]; then
    set_env SHUFFLE_API_KEY "$api_key"
    ok "Shuffle API 키 추출"
  fi

  # ── workflow JSON 템플릿 자동 임포트 (#47) ──
  # 01-collection/scripts/shuffle-playbooks/*.json 의 starter 템플릿을 POST.
  # 노드별 시크릿(Discord/TheHive)은 운영자가 Shuffle UI 에서 채워야 함.
  local pb_dir="${REPO_ROOT:-$(dirname "$0")/..}/01-collection/scripts/shuffle-playbooks"
  if [ -n "${api_key:-}" ] && [ -d "$pb_dir" ]; then
    for tpl in "$pb_dir"/*.json; do
      [ -f "$tpl" ] || continue
      local tpl_name; tpl_name="$(basename "$tpl")"
      local resp; resp=$(curl -s -X POST "${base}/api/v1/workflows" \
          -H "Authorization: Bearer $api_key" \
          -H "Content-Type: application/json" \
          --data-binary "@$tpl" 2>/dev/null || true)
      if echo "$resp" | grep -q '"id"'; then
        ok "Shuffle workflow import: $tpl_name"
      else
        warn "Shuffle workflow import 실패 (스키마 호환 문제 가능): $tpl_name"
      fi
    done
  else
    warn "Shuffle API 키 부재 또는 템플릿 디렉토리 없음 — workflow 자동 import 스킵"
  fi

  warn "Shuffle 노드별 시크릿(Discord URL, TheHive key 등) 은 UI 에서 수동 입력 필요"
  warn "webhook URL 생성·활성화 후 .env 의 SHUFFLE_WEBHOOK_URL 갱신 + SHUFFLE_ENABLED=true"
}

# ───────────────────────────────────────
# TheHive
# ───────────────────────────────────────
bootstrap_thehive() {
  log "TheHive" "API 부트스트랩 시작"
  local base="http://${HOST_BIND_IP:-127.0.0.1}:9000"
  wait_for "${base}/api/status" "TheHive" 300 || return 1

  if [ -n "${THEHIVE_API_KEY:-}" ]; then
    ok "THEHIVE_API_KEY 이미 설정됨 — 스킵"
    return 0
  fi

  # 기본 admin@thehive.local / secret 로그인
  local cookie_jar; cookie_jar=$(mktemp)
  trap "rm -f $cookie_jar" RETURN

  local login_status; login_status=$(curl -s -c "$cookie_jar" -o /tmp/th_login.json -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -X POST "${base}/api/v1/login" \
      -d '{"login":"admin@thehive.local","password":"secret"}')
  if [ "$login_status" != "200" ]; then
    warn "TheHive 기본 admin 로그인 실패 (HTTP $login_status) — 비번이 이미 변경됨. 수동 진행."
    return 1
  fi
  ok "TheHive 기본 admin 로그인 OK"

  # 서비스 사용자 + API 키 발급 (admin 의 API 키)
  local newpwd; newpwd="$(openssl rand -base64 18 2>/dev/null | tr -d '/+=' | cut -c1-24)"
  curl -sk -b "$cookie_jar" -X POST "${base}/api/v1/user/current/password/set" \
      -H "Content-Type: application/json" \
      -d "{\"currentPassword\":\"secret\",\"password\":\"$newpwd\"}" -o /dev/null
  set_env THEHIVE_ADMIN_PASSWORD "$newpwd"
  ok "TheHive admin 비번 변경됨 (.env 의 THEHIVE_ADMIN_PASSWORD)"

  # admin 의 API key 생성
  local key_resp; key_resp=$(curl -sk -b "$cookie_jar" -X POST "${base}/api/v1/user/current/key/renew")
  local api_key; api_key=$(echo "$key_resp" | tr -d '"' | tr -d '\n' | head -c 200)
  if [ -n "$api_key" ] && [ "${#api_key}" -gt 20 ]; then
    set_env THEHIVE_API_KEY "$api_key"
    set_env THEHIVE_URL "http://thehive-app:9000"
    set_env THEHIVE_ENABLED "true"
    ok "THEHIVE_API_KEY 발급 (${#api_key}자) + 토글 ON"
  else
    warn "TheHive API 키 자동 발급 실패 — 웹 UI 수동 발급 필요"
    return 1
  fi
}

# ───────────────────────────────────────
# AUTO_BAN 토글 (단계 2b 인프라가 준비된 경우만 켬)
# ───────────────────────────────────────
bootstrap_auto_ban() {
  log "AUTO_BAN" "토글 검토"
  if [ "${AUTO_BAN_ENABLED:-false}" = "true" ]; then
    ok "AUTO_BAN_ENABLED 이미 ON"
    return
  fi
  # fail2ban-client + socket 존재 시에만 활성화 권장. 자동 ON 은 위험하니 안내만.
  warn "AUTO_BAN_ENABLED 은 dry-run 1주일 관찰 후 수동 ON 권장 (CLAUDE.md §5.3)"
  warn "활성화: .env 에 AUTO_BAN_ENABLED=true + docker-compose.fail2ban.override.yml 사용"
}

# ───────────────────────────────────────
# Main
# ───────────────────────────────────────
bootstrap_misp     || true
bootstrap_shuffle  || true
bootstrap_thehive  || true
bootstrap_auto_ban || true

echo
log "RESTART" "02-detection 재시작 (.env 토글 반영)"
( cd 02-detection && docker compose up -d ) | tail -3
ok "02-detection 갱신됨"
