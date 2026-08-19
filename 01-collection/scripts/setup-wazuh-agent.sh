#!/usr/bin/env bash
# Wazuh agent + auditd 설치 + 등록 스크립트
# XDR 1단계: Endpoint 가시성 확보
#
# 사용: sudo bash setup-wazuh-agent.sh [MANAGER_IP]
#   MANAGER_IP 기본값: 127.0.0.1 (같은 호스트에 manager 컨테이너가 있는 경우)
#
# 사전 조건:
#   - Ubuntu 24.04 x86_64
#   - SIEM-Trinity 01-collection이 같은 호스트에서 가동 중 (wazuh-manager 컨테이너)
#   - 또는 별도 manager 서버의 IP를 인자로 전달

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
    echo "sudo로 실행하세요"; exit 1
fi

MANAGER_IP="${1:-127.0.0.1}"
COLLECTION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "═══════════════════════════════════════"
echo "  Wazuh Agent + auditd 설치"
echo "═══════════════════════════════════════"
echo "  Manager IP: $MANAGER_IP"
echo "  Collection: $COLLECTION_ROOT"
echo

# ─────────────────────────────────────────────
# [1/5] Wazuh APT repo + key
# ─────────────────────────────────────────────
echo "[1/5] Wazuh apt repo 등록..."
if [ ! -f /usr/share/keyrings/wazuh.gpg ]; then
    curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
    chmod 644 /usr/share/keyrings/wazuh.gpg
fi
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list

# ─────────────────────────────────────────────
# [2/5] wazuh-agent + auditd 설치
# ─────────────────────────────────────────────
echo "[2/5] wazuh-agent + auditd 설치..."
apt-get update -qq
WAZUH_MANAGER="$MANAGER_IP" apt-get install -y wazuh-agent auditd audispd-plugins

# ─────────────────────────────────────────────
# [3/5] auditd 룰 적용
# ─────────────────────────────────────────────
echo "[3/5] auditd 룰 적용..."
cp "$COLLECTION_ROOT/config/auditd-siem-trinity.rules" /etc/audit/rules.d/siem-trinity.rules
augenrules --load
systemctl enable --now auditd

# ─────────────────────────────────────────────
# [4/5] Wazuh agent 등록 + 시작
# ─────────────────────────────────────────────
echo "[4/5] Wazuh agent 등록 + 시작..."
# manager IP 설정 (env로 이미 적용됐지만 명시)
sed -i "s|<address>.*</address>|<address>$MANAGER_IP</address>|g" /var/ossec/etc/ossec.conf

# manager가 컨테이너면 host network에서 1515 포트로 enrollment
if [ "$MANAGER_IP" = "127.0.0.1" ]; then
    echo "  → 같은 호스트의 컨테이너 manager 가정"
    echo "  → 컨테이너 manager의 1515 포트가 127.0.0.1에 바인딩됐는지 확인 필요"
fi

systemctl daemon-reload
systemctl enable --now wazuh-agent

# ─────────────────────────────────────────────
# [5/5] 상태 확인
# ─────────────────────────────────────────────
echo "[5/5] 상태 확인..."
sleep 3
systemctl is-active wazuh-agent && echo "  ✓ wazuh-agent active" || echo "  ✗ wazuh-agent 비활성"
systemctl is-active auditd && echo "  ✓ auditd active" || echo "  ✗ auditd 비활성"

cat <<EOF

✓ 설치 완료

다음 단계 (Manager 측에서 확인):
  docker exec wazuh-manager /var/ossec/bin/agent_control -l

  → 등록된 agent 목록이 보여야 함. 안 보이면:
  docker logs wazuh-manager 2>&1 | tail -20
  journalctl -u wazuh-agent -n 50
EOF
