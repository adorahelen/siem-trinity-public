# 운영 설치 가이드

> 마스터 README 의 [🚀 빠른 시작](../README.md#-빠른-시작) 은 **컨테이너 가동** 까지. 본 문서는 **호스트 보안 패키지 (Suricata/Zeek/fail2ban) 설치** 와 **XDR 6단계 자동 대응 활성화** 까지 다룹니다.
>
> XDR 6단계 인프라는 epic #4 (closed) 완료. 본 문서의 시나리오 분류는 "호스트 통합 깊이" 축으로 README 의 시나리오 (XDR 활성화 깊이) 와는 다른 축임에 주의.

---

## 📊 설치 시나리오 3종

| 시나리오 | 소요 시간 | 결과 | 적합 대상 |
|---|---|---|---|
| **A. 데모/PoC** | 5-15분 | 컨테이너 가동, 호스트 보안 패키지 미설치 → 데이터 없음 | 발표·시연·구조 학습 |
| **B. 데이터 수집** | 1-2시간 | 호스트 보안 패키지 설치 + 실데이터 흐름 + XDR 6단계 dry-run | 자기 서버 운영, 친구 서버 |
| **C. 실운영 SIEM/XDR** | 수일~수주 | HTTPS·인증·백업·SLA + XDR 활성화 (`AUTO_BAN_ENABLED=true` 등) | 고객사 인계, 24/7 운영 |

본 문서는 **B**까지 다룹니다. C 는 별도 `operate-production.md` (미작성).

> **README quickstart 시나리오 A/B 와 혼동 금지**:
> - README A (`./xdr-up.sh --core-only`): 컨테이너 단계 1-3 만 (RAM ~3GB)
> - README B (`./xdr-up.sh`): 컨테이너 단계 1-6 (RAM ~8GB) — **본 문서의 시나리오 B 와 호환**
> - 본 문서는 추가로 **호스트 보안 패키지 설치** 까지 다룸.

---

## 📋 공통 사전 조건 (시나리오 A·B 모두 필요)

| 항목 | 시나리오 A (데모) | 시나리오 B (데이터 수집) |
|---|---|---|
| OS | **Ubuntu 24.04 x86_64** (Debian 12 호환) | 동일 |
| 권한 | sudo | sudo |
| 디스크 | ~10GB (이미지 + 모델) | 30GB+ (Loki 보존 90일 포함) |
| **Docker + compose plugin** | **필수** | 필수 |
| 네트워크 | — | 외부 노출 시 공인 IP 또는 Tailscale |

---

### Step 0. Docker 설치 (A·B 공통)

`start.sh`는 `docker compose up`을 호출하므로 Docker가 없으면 첫 줄에서 멈춥니다. 직접 설치:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker $USER
newgrp docker

# 검증
docker --version
docker run --rm hello-world
```

---

## 🟢 시나리오 A — 데모

Step 0 완료 후:

```bash
git clone https://github.com/adorahelen/siem-trinity-public.git
cd siem-trinity-public
./start.sh
```

✅ 9개 컨테이너 + 4 UI 가동.
⚠️ **`/var/log/auth.log`, fail2ban.log, suricata.log 등 호스트 보안 로그가 없으면 패널/탐지 결과 비어있음.**

데모 이상이 필요하면 ↓ 시나리오 B로 진행.

---

## 🟡 시나리오 B — 데이터 수집까지

> Step 0 (Docker 설치) 완료 + 시나리오 A 가동 상태에서 시작.

### Step 1. SIEM-Trinity 가동 (시나리오 A와 동일)

```bash
git clone https://github.com/adorahelen/siem-trinity-public.git
cd siem-trinity-public
./start.sh
```

→ 4 UI 접속 가능 상태 (단, 아직 실데이터 없음).

---

### Step 2. 호스트 보안 패키지 설치 (실데이터 생성)

각 컴포넌트는 **호스트에 직접 설치**되며, 자기 로그를 `/var/log/*`에 기록합니다. Promtail이 이를 수집해 Loki에 전송합니다.

#### 2-1. fail2ban (SSH 공격 자동 차단)

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban

# 기본 SSH jail 활성화 — /etc/fail2ban/jail.local
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status
```

→ **이슈 #3 자동 해소.**

#### 2-2. UFW (방화벽)

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000   # Grafana (필요 시)
# 추가 포트 허용
sudo ufw enable
sudo ufw status
```

#### 2-3. Suricata (NIDS)

```bash
cd <SIEM-Trinity>
sudo bash 01-collection/scripts/setup-suricata.sh
```

**스크립트가 자동 처리:**
- `apt install suricata`
- 인터페이스(`enp2s0` 등) 설정
- 룰 활성화
- `systemctl start suricata`

⚠️ `IFACE` 변수가 `enp2s0` 하드코딩. 본인 환경의 NIC 이름이 다르면(`ip link`로 확인) 스크립트 수정 필요.

#### 2-4. Zeek (네트워크 분석)

```bash
sudo bash 01-collection/scripts/setup-zeek.sh
```

⚠️ Suricata와 동일하게 `IFACE` 확인 필요.

#### 2-5. Wazuh agent + auditd (HIDS, XDR 1단계)

```bash
sudo bash 01-collection/scripts/setup-wazuh-agent.sh
```

상세: [docs/xdr-step1-wazuh-agent.md](xdr-step1-wazuh-agent.md)

→ **이슈 #2 자동 해소.**

#### 2-6. ModSecurity WAF (웹사이트 운영 시만 필요)

```bash
sudo bash 01-collection/scripts/apply-modsecurity.sh
```

- nginx 사용자만 의미 있음
- OWASP CRS 921 룰 적용

---

### Step 3. promtail 재시작 (새 로그 인식)

```bash
cd <SIEM-Trinity>
docker compose -f 01-collection/docker-compose.yml restart promtail
```

→ 새로 설치된 `/var/log/fail2ban.log`, `/var/log/suricata/eve.json`, `/opt/zeek/spool/logger/` 등 인식.

---

### Step 4. Discord 알림 설정 (선택)

```bash
# Discord webhook URL 환경변수
sudo tee /etc/security-digest.env > /dev/null <<'EOF'
DISCORD_CRITICAL_WEBHOOK_URL=https://discord.com/api/webhooks/XXXX/YYYY
EOF

# realtime alert cron 등록 (예: 5분 주기)
sudo crontab -e
# 추가:
# */5 * * * * /path/to/SIEM-Trinity/01-collection/scripts/run-realtime-alert.sh
```

---

### Step 5. Grafana admin 비번 회전 (보안 필수)

```bash
docker exec -it grafana grafana-cli admin reset-admin-password '<강한 비번>'
```

→ **이슈 #13 즉시처리 부분 해소.**

---

### Step 6. 검증 (시나리오 B 완료 확인)

```bash
# A. 호스트 보안 패키지 가동
systemctl status fail2ban suricata zeek wazuh-agent auditd

# B. Loki에 데이터 들어가는지 (각 job별 건수)
HOST_IP=192.168.0.42   # 본인 IP
for job in auth fail2ban suricata wazuh zeek_conn modsec; do
    count=$(curl -s -G --data-urlencode "query={job=\"$job\"}" \
        "http://$HOST_IP:3100/loki/api/v1/query_range?limit=1000" \
        | jq '.data.result[0].values | length // 0')
    printf "  %-15s %s\n" "$job" "$count"
done

# C. Grafana 패널에 그래프 표시 확인 (대시보드 열어보기)
# D. AI 탐지 결과 (1시간 후)
docker compose -f 02-detection/docker-compose.yml logs detection-api | tail -20

# E. Streamlit Agent 자연어 질의 시도
# http://$HOST_IP:8501 → "최근 24시간 SSH 공격 IP 5개" 입력
```

---

## 🔴 시나리오 C — 실운영 (별도 가이드 필요)

본 문서 범위 밖. 항목만 나열:

| 항목 | 필요 작업 |
|---|---|
| **HTTPS** | nginx reverse proxy + Let's Encrypt 또는 Cloudflare Tunnel |
| **인증** | Grafana SSO, Streamlit basic auth, fail2ban WAF |
| **외부 접근 제한** | UFW 정책, Tailscale VPN |
| **백업** | Loki TSDB·ChromaDB·Grafana data 정기 백업 (예: borgbackup) |
| **로그 보존 정책** | Loki retention 조정 (`loki-config.yml`), 디스크 알림 |
| **자체 모니터링** | Uptime Kuma 등으로 SIEM-Trinity 자체 죽음 감지 |
| **Public repo 공개 시** | 이슈 #13 — git history sanitization (`git filter-repo`) |
| **컴플라이언스** | KISA·MITRE 룰 매핑, 보고서 자동 생성 (XDR 6단계 epic) |

→ `docs/operate-production.md` (미작성, 수요 발생 시 작성).

---

## 🎯 시나리오별 검증 체크리스트

### 시나리오 A 완료 기준
- [ ] `docker ps` → 9개 컨테이너 Up
- [ ] 4 UI 모두 HTTP 200
- [ ] `ollama list` → 2개 모델

### 시나리오 B 완료 기준
- [ ] 위 A 전체
- [ ] `systemctl is-active fail2ban suricata zeek wazuh-agent auditd` 모두 active
- [ ] Loki 6개 job(`auth, fail2ban, suricata, wazuh, zeek_conn, modsec`) 데이터 ≥ 1건
- [ ] Grafana 패널에 그래프 표시
- [ ] AI 탐지 30분 후 결과 (있어야 정상)
- [ ] Streamlit Agent가 실데이터로 답변
- [ ] (선택) Discord 테스트 알림 수신

### 시나리오 C 완료 기준
- [ ] HTTPS 적용 + 인증서 자동 갱신
- [ ] Grafana SSO
- [ ] 정기 백업 동작 + 복원 테스트
- [ ] SLA 정의 + 모니터링
- [ ] 운영 매뉴얼 인계

---

## 🚨 자주 묻는 질문

### Q. README에 "한 줄로 끝"이라는데 왜 이렇게 복잡한가요?
> 한 줄(`./start.sh`)로 **인프라**는 뜹니다. **데이터**는 호스트 보안 패키지가 생성합니다. 데모 vs 운영의 차이.

### Q. 호스트 패키지 없이 SIEM-Trinity만으로 의미 있나요?
> 데모 용도(구조 학습·발표)엔 충분. 보안 분석엔 데이터가 없어 의미 약함.

### Q. ARM64 서버나 macOS에 깔 수 있나요?
> 이슈 #9 close 결정대로 **Linux x86_64 전용**. 다른 환경은 정책상 미지원.

### Q. 고객사 서버에 인계하면 끝인가요?
> 시나리오 C 영역. HTTPS·인증·백업·SLA가 추가 필요. 본 문서는 그 전 단계까지만 다룸.

### Q. 우리가 deploy-test VM에서 검증한 게 시나리오 B인가요?
> **아닙니다, 시나리오 A만 검증.** VM엔 fail2ban·Suricata·Zeek·Wazuh agent 미설치. 실데이터 검증은 운영 호스트에서만 가능.
