# 대한민국 전용 IP 차단 시스템

## 구성 요소

```
┌─────────────────────────────────────────────────────┐
│               인터넷 트래픽                          │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   Layer 3: ipset/iptables  │  ← 모든 포트 (SSH, HTTP 등)
         │   KR IP 화이트리스트       │    비KR IP → DROP + 로그
         └─────────────┬─────────────┘
                       │ (KR IP 또는 Tailscale만 통과)
         ┌─────────────▼─────────────┐
         │   Layer 7: nginx GeoIP2   │  ← HTTP/HTTPS만
         │   추가 국가코드 검증       │    이중 보호
         └─────────────┬─────────────┘
                       │
              [kangminlog 서버]
```

## 설치 방법

### Step 1: ipset 화이트리스트 (필수)

```bash
sudo bash setup-kr-only.sh
```

완료 후 확인:
```bash
# 차단 로그 실시간 확인
sudo journalctl -k --grep='KR-BLOCK' -f

# ipset 내용 확인
sudo ipset list kr_whitelist | head -20

# iptables 규칙 확인
sudo iptables -L KR-ONLY -v --line-numbers

# 타이머 상태
sudo systemctl status kr-ip-update.timer
```

### Step 2: nginx GeoIP2 (선택, HTTP 이중 차단)

```bash
# 1. 패키지 설치
sudo apt install -y libnginx-mod-http-geoip2

# 2. GeoIP DB 다운로드 (db-ip.com 무료, 월 1회 업데이트)
sudo mkdir -p /etc/nginx/geoip
YEAR_MONTH=$(date +%Y-%m)
sudo wget -q -O /tmp/dbip.mmdb.gz \
  "https://download.db-ip.com/free/dbip-country-lite-${YEAR_MONTH}.mmdb.gz"
sudo gunzip -c /tmp/dbip.mmdb.gz > /etc/nginx/geoip/dbip-country-lite.mmdb

# 3. nginx.conf http {} 블록에 geoip2 설정 추가 (nginx-geoip-kr.conf 참고)
# 4. 각 server {} 블록에 if ($allow_country = 0) { return 444; } 추가
sudo nginx -t && sudo systemctl reload nginx
```

## 주요 허용 대역

| 대역 | 이유 |
|------|------|
| 대한민국 IP (kr.zone) | 허용 대상 |
| 100.64.0.0/10 | Tailscale VPN (해외 원격접속용) |
| 127.0.0.0/8 | localhost |
| lo 인터페이스 | 로컬 루프백 |
| ESTABLISHED/RELATED | 기존 연결 유지 |

## 자동화

| 작업 | 방식 | 주기 |
|------|------|------|
| KR IP 목록 갱신 | systemd timer | 매주 월요일 03:00 |
| 부팅 시 ipset 복원 | systemd service | 부팅 시 |
| iptables 규칙 복원 | netfilter-persistent | 부팅 시 |

## 롤백 (차단 해제)

```bash
# iptables에서 KR-ONLY 체인 제거
sudo iptables -D INPUT -j KR-ONLY
sudo iptables -F KR-ONLY
sudo iptables -X KR-ONLY

# ipset 제거
sudo ipset destroy kr_whitelist

# 영구 저장
sudo netfilter-persistent save

# systemd 서비스 비활성화
sudo systemctl disable kr-ipset-restore.service kr-ip-update.timer
```

## 특정 해외 IP 추가 허용

```bash
# 임시 허용
sudo ipset add kr_whitelist 1.2.3.4/32

# 영구 저장
sudo ipset save kr_whitelist > /etc/kr-block/kr_whitelist.ipset
```

## 구성 요약 (차단 구조 전체)

```
인터넷 → [ipset/iptables: 비KR DROP] → [nginx GeoIP2] → 서버
           ↑ 커널 레벨, 모든 포트          ↑ HTTP 레이어
           KR IP + Tailscale만 통과
```

### 허용 대역 한눈에 보기

| 대역 | 대상 | 비고 |
|------|------|------|
| KR IP 대역 (~3,500개 CIDR) | 대한민국 IP 전체 | ipdeny.com 주 1회 자동 갱신 |
| `100.64.0.0/10` | Tailscale 전체 | 서버·맥북·폰 모두 포함 |
| `127.0.0.0/8` + lo | localhost | |
| ESTABLISHED/RELATED | 기존 연결 세션 | 설치 중 SSH 끊김 방지 |

### Tailscale 기기별 IP

```
100.64.0.0  ~  100.127.255.255   ← 100.64.0.0/10 커버 범위
                │
                ├─ 100.x.x.x   kangminlog 서버 ✓
                └─ 100.x.x.x   맥북 ✓
```

두 기기 모두 `100.64.0.0/10` 안에 있으므로 별도 추가 불필요.

---

## 한국 IP 대역 (KR IP Block) 이란?

### IP 할당 체계

```
IANA → APNIC (아시아-태평양) → KRNIC (한국인터넷진흥원) → KT / SKT / LGU+ / 기관
```

ipdeny.com 기준 약 **3,500개 CIDR 블록**이 한국에 할당되어 있음.

### 국가 단위 vs 지역(시/도) 단위 비교

| 구분 | 국가(KR) | 도시/지역 |
|------|---------|----------|
| 정확도 | ~99% | ~55~75% |
| 제공 DB | GeoLite2-Country, kr.zone | GeoLite2-City, db-ip City |
| 실용성 | 높음 ✅ | 낮음 ⚠️ |

### 지역 단위가 부정확한 이유

- KT·SKT·LGU+ 등 주요 ISP가 **전국 단위**로 IP 블록을 보유·할당
- 서울 IP를 부산 고객에게 할당하는 경우 발생
- VPN, AWS 서울 리전 등 클라우드 IP는 지역 오판 많음

### 결론

> 국가 단위(`kr.zone`) 차단이 가장 정확하고 실용적.
> 지역별 차단은 기술적으로 가능하나 오탐률이 높아 권장하지 않음.

---

## Grafana/Loki 연동

차단 로그를 `/var/log/kern.log`(또는 journald)로 수집하면 기존 Promtail이 자동으로
수집합니다. kern job에 `KR-BLOCK` 패턴으로 필터링하면 Grafana 대시보드에서 확인 가능.

LogQL 예시:
```
{job="kern"} |= "KR-BLOCK"
| regexp `SRC=(?P<src_ip>[0-9.]+)`
```
