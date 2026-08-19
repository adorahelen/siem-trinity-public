#!/bin/bash
# Zeek Network Security Monitor 설치 + 설정 스크립트
# 실행: sudo bash <repo>/01-collection/scripts/setup-zeek.sh
set -euo pipefail

# 스크립트 위치 기반 자동 감지 (01-collection 루트)
COLLECTION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

IFACE="enp2s0"
ZEEK_PREFIX="/opt/zeek"
ZEEKCTL="$ZEEK_PREFIX/bin/zeekctl"
NODE_CFG="$ZEEK_PREFIX/etc/node.cfg"
LOCAL_ZEEK="$ZEEK_PREFIX/share/zeek/site/local.zeek"

echo "============================================"
echo "  Zeek NIDS 설치 스크립트"
echo "  인터페이스: $IFACE"
echo "============================================"

# Ubuntu 버전 확인
UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "jammy")
echo "[1/6] Ubuntu 코드네임: $UBUNTU_CODENAME"

echo "[2/6] Zeek OBS 저장소 추가..."
echo "deb http://download.opensuse.org/repositories/security:/zeek/xUbuntu_22.04/ /" \
  | tee /etc/apt/sources.list.d/security:zeek.list > /dev/null

curl -fsSL "https://download.opensuse.org/repositories/security:zeek/xUbuntu_22.04/Release.key" \
  | gpg --dearmor \
  | tee /etc/apt/trusted.gpg.d/security_zeek.gpg > /dev/null

apt-get update -qq
apt-get install -y zeek

echo "[3/6] 네트워크 인터페이스 설정 ($IFACE)..."
# standalone 단일 노드 구성
cat > "$NODE_CFG" << EOF
[logger]
type=logger
host=localhost

[manager]
type=manager
host=localhost

[proxy-1]
type=proxy
host=localhost

[worker-1]
type=worker
host=localhost
interface=$IFACE
EOF

echo "[4/6] JSON 로그 + 탐지 정책 설정..."
# 기존 설정 백업
cp "$LOCAL_ZEEK" "${LOCAL_ZEEK}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

# JSON 포맷 + 보안 정책 추가 (중복 방지)
if ! grep -q 'json-logs' "$LOCAL_ZEEK"; then
  cat >> "$LOCAL_ZEEK" << 'EOF'

# ===== SIEM 연동 설정 (setup-zeek.sh에 의해 추가됨) =====

# JSON 포맷으로 로그 출력 (Promtail → Loki 연동)
@load policy/tuning/json-logs

# HTTP 탐지 정책
@load policy/protocols/http/detect-sqli          # SQLi 탐지 → notice.log
@load policy/protocols/http/detect-webapps       # 웹 앱/프레임워크 핑거프린팅

# SSL/TLS 탐지 정책
@load policy/protocols/ssl/expiring-certs        # 만료 예정 인증서 → notice.log
@load policy/protocols/ssl/validate-certs        # 인증서 유효성 검사
@load policy/protocols/ssl/log-hostnames         # SNI 호스트명 로깅

# DNS 탐지 정책
@load policy/protocols/dns/detect-external-names # 내부→외부 DNS 이름 탐지

# 네트워크 탐지 정책
@load policy/misc/detect-traceroute              # Traceroute 탐지 → notice.log
@load policy/misc/scan                           # 포트 스캔 탐지 → notice.log

# =====================================================
EOF
fi

echo "[5/6] zeekctl deploy..."
"$ZEEKCTL" deploy

# 로그 경로 확인
LOG_CURRENT="$ZEEK_PREFIX/logs/current"
echo ""
echo "  로그 경로: $LOG_CURRENT"
ls "$LOG_CURRENT" 2>/dev/null | head -10 || echo "  (로그 아직 생성 중)"

echo "[6/6] cron 등록 (zeekctl cron — 5분마다 rotate/헬스체크)..."
# 기존 zeek cron 제거 후 재등록
crontab -l 2>/dev/null | grep -v zeekctl | crontab - || true
(crontab -l 2>/dev/null; echo "*/5 * * * * $ZEEKCTL cron") | crontab -

echo ""
echo "============================================"
echo "  Zeek 설치 완료"
echo "============================================"
echo ""
echo "  버전: $($ZEEK_PREFIX/bin/zeek --version 2>&1 | head -1)"
echo "  상태 확인:  sudo $ZEEKCTL status"
echo "  로그 위치:  $LOG_CURRENT/"
echo ""
echo "  주요 로그 파일:"
echo "    conn.log    — TCP/UDP/ICMP 연결 기록"
echo "    dns.log     — DNS 쿼리/응답"
echo "    http.log    — HTTP 요청/응답"
echo "    ssl.log     — TLS 핸드셰이크"
echo "    notice.log  — 보안 탐지 이벤트 (SQLi, 포트스캔 등)"
echo "    weird.log   — 프로토콜 이상 행위"
echo ""
echo "다음 단계: docker compose restart promtail"
echo "  cd \"$COLLECTION_ROOT\" && docker compose restart promtail"
