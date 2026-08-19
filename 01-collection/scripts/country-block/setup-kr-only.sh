#!/bin/bash
# =============================================================================
# setup-kr-only.sh
# 대한민국 IP 대역만 허용, 나머지 전체 차단 (ipset + iptables)
# Tailscale (100.64.0.0/10) 및 localhost는 항상 허용
#
# 사용법: sudo bash setup-kr-only.sh
# =============================================================================

set -euo pipefail

# ── 색상 출력 ──────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 권한 확인 ──────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "root 권한으로 실행해주세요: sudo bash $0"

# ── 설정 변수 ──────────────────────────────────────────────────────────────
IPSET_NAME="kr_whitelist"
KR_ZONE_URL="https://www.ipdeny.com/ipblocks/data/countries/kr.zone"
KR_ZONE_FILE="/etc/kr-block/kr.zone"
IPSET_SAVE_FILE="/etc/kr-block/kr_whitelist.ipset"
SCRIPT_DIR="/etc/kr-block"

# Tailscale CGNAT 대역 (해외에서도 VPN으로 접속 가능하도록 항상 허용)
TAILSCALE_RANGE="100.64.0.0/10"

# ── 패키지 설치 ────────────────────────────────────────────────────────────
info "ipset, curl 설치 확인 중..."
apt-get install -y ipset curl iptables-persistent netfilter-persistent 2>/dev/null | grep -E "(installed|already)" || true

mkdir -p "$SCRIPT_DIR"

# ── KR IP 목록 다운로드 ────────────────────────────────────────────────────
info "대한민국 IP 목록 다운로드 중... (출처: ipdeny.com)"
curl -sS --max-time 30 "$KR_ZONE_URL" -o "$KR_ZONE_FILE" || error "KR IP 목록 다운로드 실패"
KR_COUNT=$(wc -l < "$KR_ZONE_FILE")
info "KR CIDR 블록 수: ${KR_COUNT}개"

# ── ipset 생성 ─────────────────────────────────────────────────────────────
info "ipset 생성 중: $IPSET_NAME"

# 기존 ipset 제거 (있으면)
if ipset list "$IPSET_NAME" &>/dev/null; then
    ipset flush "$IPSET_NAME"
    ipset destroy "$IPSET_NAME"
fi

# hash:net 타입으로 CIDR 블록 저장 (최대 65536 엔트리)
ipset create "$IPSET_NAME" hash:net maxelem 65536 comment

# ── KR IP 대역 ipset에 추가 ────────────────────────────────────────────────
info "KR IP 대역 ipset에 추가 중..."
while IFS= read -r cidr; do
    [[ -z "$cidr" || "$cidr" == \#* ]] && continue
    ipset add "$IPSET_NAME" "$cidr" 2>/dev/null || warn "추가 실패: $cidr"
done < "$KR_ZONE_FILE"

# Tailscale 대역 추가 (VPN 원격 접속 보장)
ipset add "$IPSET_NAME" "$TAILSCALE_RANGE" comment "Tailscale VPN"
info "Tailscale 대역 추가됨: $TAILSCALE_RANGE"

# ── ipset 저장 ─────────────────────────────────────────────────────────────
ipset save "$IPSET_NAME" > "$IPSET_SAVE_FILE"
info "ipset 저장됨: $IPSET_SAVE_FILE"

# ── iptables 규칙 적용 ─────────────────────────────────────────────────────
info "iptables 규칙 적용 중..."

# 기존 KR-ONLY 체인 정리
iptables -D INPUT -j KR-ONLY 2>/dev/null || true
iptables -F KR-ONLY 2>/dev/null || true
iptables -X KR-ONLY 2>/dev/null || true

# KR-ONLY 체인 생성
iptables -N KR-ONLY

# 1. loopback 허용
iptables -A KR-ONLY -i lo -j RETURN

# 2. 이미 확립된 연결 허용 (기존 세션 끊기지 않게)
iptables -A KR-ONLY -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

# 3. Tailscale 인터페이스 허용 (tailscale0)
iptables -A KR-ONLY -i tailscale0 -j RETURN

# 4. KR ipset에 있는 IP 허용
iptables -A KR-ONLY -m set --match-set "$IPSET_NAME" src -j RETURN

# 5. 나머지 DROP + 로그
iptables -A KR-ONLY -m limit --limit 5/min -j LOG \
    --log-prefix "[KR-BLOCK] " --log-level 4

iptables -A KR-ONLY -j DROP

# INPUT 체인에 KR-ONLY 연결
iptables -I INPUT 1 -j KR-ONLY

info "iptables 규칙 적용 완료"

# ── 규칙 영구 저장 ─────────────────────────────────────────────────────────
info "iptables 규칙 영구 저장 중..."
netfilter-persistent save 2>/dev/null || iptables-save > /etc/iptables/rules.v4

# ── 갱신 스크립트 생성 ─────────────────────────────────────────────────────
info "자동 갱신 스크립트 생성 중..."
cat > "$SCRIPT_DIR/update-kr-ips.sh" << 'UPDATESCRIPT'
#!/bin/bash
# KR IP 목록 갱신 스크립트 (cron/systemd timer로 주 1회 실행 권장)

IPSET_NAME="kr_whitelist"
KR_ZONE_URL="https://www.ipdeny.com/ipblocks/data/countries/kr.zone"
KR_ZONE_FILE="/etc/kr-block/kr.zone"
IPSET_SAVE_FILE="/etc/kr-block/kr_whitelist.ipset"
TAILSCALE_RANGE="100.64.0.0/10"

echo "[$(date)] KR IP 목록 갱신 시작"

# 새 목록 다운로드 (임시 파일로)
TMP_FILE=$(mktemp)
if ! curl -sS --max-time 30 "$KR_ZONE_URL" -o "$TMP_FILE"; then
    echo "[$(date)] ERROR: 다운로드 실패, 기존 목록 유지"
    rm -f "$TMP_FILE"
    exit 1
fi

# 임시 ipset 생성 후 swap (atomic 교체)
ipset create "${IPSET_NAME}_new" hash:net maxelem 65536 2>/dev/null || ipset flush "${IPSET_NAME}_new"

while IFS= read -r cidr; do
    [[ -z "$cidr" || "$cidr" == \#* ]] && continue
    ipset add "${IPSET_NAME}_new" "$cidr" 2>/dev/null || true
done < "$TMP_FILE"

ipset add "${IPSET_NAME}_new" "$TAILSCALE_RANGE" 2>/dev/null || true

# atomic swap
ipset swap "${IPSET_NAME}_new" "$IPSET_NAME"
ipset destroy "${IPSET_NAME}_new"

# 저장
mv "$TMP_FILE" "$KR_ZONE_FILE"
ipset save "$IPSET_NAME" > "$IPSET_SAVE_FILE"

echo "[$(date)] KR IP 목록 갱신 완료 ($(wc -l < "$KR_ZONE_FILE")개 CIDR)"
UPDATESCRIPT
chmod +x "$SCRIPT_DIR/update-kr-ips.sh"

# ── systemd 서비스: 부팅 시 ipset 복원 ────────────────────────────────────
info "systemd 서비스 생성 중 (부팅 시 ipset 자동 복원)..."
cat > /etc/systemd/system/kr-ipset-restore.service << 'SYSTEMD'
[Unit]
Description=Restore KR country whitelist ipset
Before=netfilter-persistent.service
After=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'ipset restore -! < /etc/kr-block/kr_whitelist.ipset'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable kr-ipset-restore.service

# ── systemd 타이머: 주 1회 자동 갱신 ──────────────────────────────────────
cat > /etc/systemd/system/kr-ip-update.service << 'SVC'
[Unit]
Description=Update KR country IP whitelist

[Service]
Type=oneshot
ExecStart=/etc/kr-block/update-kr-ips.sh
StandardOutput=journal
StandardError=journal
SVC

cat > /etc/systemd/system/kr-ip-update.timer << 'TIMER'
[Unit]
Description=Weekly KR IP whitelist update
After=network-online.target

[Timer]
OnCalendar=Mon *-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now kr-ip-update.timer

# ── 결과 요약 ─────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "대한민국 IP 전용 화이트리스트 설정 완료!"
echo ""
echo "  허용된 대역:"
echo "    - 대한민국 IP 대역: ${KR_COUNT}개 CIDR"
echo "    - Tailscale VPN: $TAILSCALE_RANGE"
echo "    - localhost (lo)"
echo "    - 기존 확립된 연결 (ESTABLISHED/RELATED)"
echo ""
echo "  차단 로그 확인:"
echo "    sudo journalctl -k --grep='KR-BLOCK' -f"
echo "    또는: sudo dmesg | grep KR-BLOCK"
echo ""
echo "  수동 IP 목록 갱신:"
echo "    sudo /etc/kr-block/update-kr-ips.sh"
echo ""
echo "  자동 갱신: 매주 월요일 03:00 (systemd timer)"
echo ""
echo "  ⚠️  해외에서 SSH 접속이 필요하면 Tailscale VPN 사용"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
