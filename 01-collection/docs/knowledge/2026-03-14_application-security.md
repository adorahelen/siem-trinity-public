# Application Security Notes (2026-03-14)

---

## FTP Security

### 현재 프로젝트에 FTP 보안이 없는 이유

```
현재 서버에서 동작 중인 FTP 서비스: 없음
→ 방어할 대상 자체가 없음
→ UFW에서 포트 21 차단 상태면 충분
```

FTP 보안은 **FTP 포트/프로토콜을 실제로 쓸 때만** 의미가 생긴다.

---

### FTP 보안이 필요해지는 시점

**케이스 1: 서버가 FTP 서버 역할**

```
클라이언트 → [FTP 21] → 내 서버
예) vsftpd, proftpd 설치해서 파일 올리고 받을 때
예) WAS(Tomcat 등)가 파일 업로드 경로를 FTP로 제공할 때
```

**케이스 2: 서버가 FTP 클라이언트 역할 (주기적 연결)**

```
내 서버 → [FTP 21] → 외부 서버 (주기적 연결)
예) 백업 스크립트가 외부 NAS/스토리지에 FTP로 파일 전송
예) 앱이 외부 파일 서버에서 주기적으로 파일 가져올 때
```

---

### FTP 대신 써야 하는 프로토콜

FTP는 자격증명이 **평문으로 전송**되므로 사용 금지.
이미 SSH가 열려 있으면 추가 설치 없이 대안 사용 가능.

| 프로토콜 | 암호화 | 포트 | 권장 여부 |
|----------|--------|------|----------|
| FTP | ❌ 평문 | 21 | ❌ 사용 금지 |
| FTPS | ✅ TLS | 21/990 | ⚠️ 구성 복잡 |
| **SFTP** | ✅ SSH | 22 | ✅ 권장 |
| **SCP** | ✅ SSH | 22 | ✅ 권장 |
| **rsync over SSH** | ✅ SSH | 22 | ✅ 주기 전송에 최적 |

---

### 주기적 파일 전송 시 보안 체크리스트

서버가 외부와 주기적으로 파일을 주고받는 경우:

```
✅ 평문 FTP 대신 SFTP / rsync over SSH 사용
✅ 접속 계정은 전용 제한 계정 (chroot 격리)
✅ SSH 키 인증만 허용 (패스워드 인증 비활성)
✅ UFW 아웃바운드 화이트리스트에 해당 포트/IP만 허용
✅ Zeek conn.log에서 주기 연결 패턴 모니터링
✅ 연결 대상 IP 고정 시 UFW에서 특정 IP만 허용
```

---

---

## Email Security

### 현재 프로젝트에 이메일 보안이 없는 이유

FTP와 동일한 논리 — **이메일 서버를 운영하지 않으면 고려 대상이 아님.**

```
현재 이메일 서버(Postfix/Dovecot) 실행 중: 없음
→ 포트 25/587/993/995 UFW 차단 상태면 충분
```

### 이메일 서버 운영 시 필요한 보안 요소

| 보안 요소 | 역할 |
|-----------|------|
| SPF | 발신 도메인 위조 방지 (DNS TXT 레코드) |
| DKIM | 메일 서명 — 발신자 인증 |
| DMARC | SPF+DKIM 정책 정의 및 위반 리포팅 |
| STARTTLS / SSL | 전송 구간 암호화 (평문 전송 금지) |
| fail2ban postfix jail | 브루트포스 자동 차단 |
| Anti-spam (SpamAssassin 등) | 스팸/피싱 필터링 |

> 이메일 서버는 인터넷에서 가장 많이 공격받는 서비스 중 하나.
> 운영 예정이면 SPF → DKIM → DMARC 순서로 설정 필수.

---

## DNS Security

### FTP/이메일과 다른 이유

```
FTP/이메일: 서비스를 직접 운영할 때만 노출
DNS:        서버가 뭔가를 할 때마다 항상 사용
            (apt update, curl, Tailscale, Wazuh 등 전부 DNS 질의)
→ 지금도 신경써야 함
```

### 현재 서버의 DNS 동작 방식

```
앱/시스템
   ↓
systemd-resolved (Ubuntu 24.04 기본)
   ↓ 평문 UDP 53  ← 문제 구간
ISP DNS 서버 (또는 공유기)
   ↓
인터넷 루트 DNS
```

**문제점:**
- DNS 질의가 평문 → 중간에서 스니핑/위조 가능
- ISP가 질의 내용을 볼 수 있음
- 캐시 포이즈닝 공격 시 엉뚱한 IP로 유도 가능

### 현재 프로젝트의 DNS 대응 현황

| 항목 | 현재 상태 | 수준 |
|------|-----------|------|
| Zeek dns.log | ✅ 모든 DNS 질의 기록 | 탐지만 |
| Suricata DNS 룰 | ✅ 이상 DNS 패턴 탐지 | 탐지만 |
| DoT (DNS over TLS) | ❌ 미설정 | 평문 노출 |
| DNSSEC 검증 | ❌ 미설정 | 위조 응답 탐지 못함 |
| 로컬 재귀 리졸버 | ❌ 없음 | ISP DNS 의존 |

### 개선 방법

**1순위 — DoT 활성화 (설정 파일 수정만)**

```ini
# /etc/systemd/resolved.conf
[Resolve]
DNS=1.1.1.1 8.8.8.8
DNSOverTLS=yes
DNSSEC=yes
```

```bash
sudo systemctl restart systemd-resolved
```

**2순위 — Unbound 로컬 리졸버 (Docker 컨테이너 1개)**

```
앱 → Unbound (127.0.0.1:53) → DoT → 1.1.1.1
```

DNSSEC 검증 + 캐시 포이즈닝 방어 + DNS 터널링 탐지 강화.

---

## Database Security

### 현재 운영 중인 DB

```bash
# 현재 실행 상태
PostgreSQL 16  (Docker: dodgers-postgres-1)  포트 5432 — Docker 내부만
Redis 7        (Docker: dodgers-redis-1)      포트 6379 — Docker 내부만
```

포트가 `5432/tcp` 형식 (호스트 바인딩 없음) → **외부에서 직접 접근 불가. 기본 격리 양호.**

---

### PostgreSQL 보안 현황 및 점검

| 항목 | 권장 | 점검 방법 |
|------|------|-----------|
| 외부 포트 노출 | ❌ 노출 없음 ✅ | `docker ps` — `5432/tcp`만 표시되면 안전 |
| 강력한 패스워드 | 확인 필요 | `docker exec -it dodgers-postgres-1 psql -U postgres -c "\du"` |
| 앱 전용 계정 | superuser 사용 금지 | `\du` 로 역할 확인 |
| pg_hba.conf | `scram-sha-256` 인증 | `SHOW hba_file;` 후 내용 확인 |
| 쿼리 로깅 | 이상 쿼리 탐지 | `log_min_duration_statement = 1000` |
| SQL 인젝션 방어 | 앱 + WAF 이중 | ModSecurity CRS 942xxx 룰 활성 |

**실질적 위협 경로:**

```
공격자 → nginx → 웹앱 → DB 쿼리 (SQL 인젝션)
                          ↑
                   ModSecurity CRS가 1차 차단
                   앱의 Prepared Statement가 2차 방어
```

**즉시 점검할 것:**

```bash
# 1. postgres 슈퍼유저로만 운영 중인지 확인
docker exec -it dodgers-postgres-1 psql -U postgres -c "\du"

# 2. 앱 전용 제한 계정 생성 (없으면)
CREATE USER appuser WITH PASSWORD 'strong_pass';
GRANT CONNECT ON DATABASE mydb TO appuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appuser;
# superuser 권한 없이 필요한 것만 부여
```

---

### Redis 보안 현황 및 점검

| 항목 | 권장 | 현재 상태 |
|------|------|-----------|
| 외부 포트 노출 | ❌ 노출 없음 | `6379/tcp` — Docker 내부만 ✅ |
| 인증 (requirepass) | 필수 | 설정 여부 확인 필요 ⚠️ |
| 위험 명령 비활성화 | FLUSHALL, CONFIG 등 | 확인 필요 ⚠️ |
| bind 설정 | 127.0.0.1 또는 Docker 내부 | Docker bridge면 OK |

**Redis는 기본 설정이 인증 없음** — Docker 내부라도 같은 브리지의 컨테이너라면 접근 가능.

```bash
# 인증 설정 여부 확인
docker exec -it dodgers-redis-1 redis-cli CONFIG GET requirepass

# 비어 있으면 인증 없음 → 즉시 설정 필요
# docker-compose.yml 에 추가:
# command: redis-server --requirepass "strong_password"
```

**위험 명령 비활성화 (docker-compose command에 추가):**

```yaml
command: >
  redis-server
  --requirepass "strong_password"
  --rename-command FLUSHALL ""
  --rename-command FLUSHDB ""
  --rename-command CONFIG ""
  --rename-command DEBUG ""
```

---

### ⚠️ 현재 발견된 취약점 (2026-03-14 점검)

| DB | 항목 | 현재 상태 | 위험도 |
|----|------|-----------|--------|
| Redis | requirepass | ❌ 인증 없음 | 중간 (Docker 내부망이지만 같은 브리지 컨테이너 무인증 접근 가능) |
| ClickHouse | default 패스워드 | ❌ 빈값 (`CLICKHOUSE_PASSWORD=`) | 중간 (동일) |
| PostgreSQL | 포트 노출 | ✅ Docker 내부만 | 양호 |

**Redis 인증 추가 권고:**

```yaml
# docker-compose.yml — redis 서비스
redis:
  command: >
    redis-server
    --requirepass "${REDIS_PASSWORD}"
    --rename-command FLUSHALL ""
    --rename-command FLUSHDB ""
    --rename-command CONFIG ""
    --rename-command DEBUG ""
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
```

```bash
# .env 에 추가
REDIS_PASSWORD=$(openssl rand -hex 32)
```

```yaml
# auth-service 환경변수도 함께 수정
- REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
```

**ClickHouse 인증 추가 권고:**

```yaml
# docker-compose.yml — clickhouse 서비스
environment:
  - CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}

# monitor-api 서비스
environment:
  - CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
```

```bash
# .env 에 추가
CLICKHOUSE_PASSWORD=$(openssl rand -hex 16)
```

---

### DB 보안 공통 원칙

```
1. 포트를 호스트에 바인딩하지 않기  (0.0.0.0:5432 → 절대 금지)
2. 앱마다 전용 계정, 최소 권한만 부여
3. 강력한 패스워드 (환경변수 또는 Docker Secret으로 관리)
4. 쿼리 로그 → Promtail로 수집 → Loki 저장
5. 백업 파일은 암호화 후 저장 (평문 덤프 파일 주의)
6. SQL 인젝션 방어는 앱 레벨(Prepared Statement) + WAF(ModSecurity) 이중으로
```

---

---

## 보안 개념 연관성 분석 (FDS / SET / SSL / IPSec / OTP)

| 개념 | 현재 프로젝트 연관성 | 설명 |
|------|---------------------|------|
| **SSL** | ✅ 직접 관련 | nginx가 사용하는 TLS의 전신. 현재 사실상 TLS 1.2/1.3으로 대체됨. "SSL 인증서"라고 부르지만 실제로는 TLS |
| **IPSec** | ⚠️ 간접 관련 | Tailscale(WireGuard)과 같은 목적의 VPN 프로토콜. 현재 스택은 IPSec 대신 WireGuard를 씀 |
| **OTP** | ⚠️ 미적용, 관련 있음 | Grafana/SSH 2FA로 추가 가능. 현재 미설정 |
| **FDS** | ❌ 직접 무관 | 금융 이상거래 탐지 시스템. 개념적으로 Wazuh/Suricata 이상탐지와 유사하나 도메인이 다름 |
| **SET** | ❌ 완전 무관 | 1990년대 Visa/Mastercard 전자결제 표준. 현재는 TLS+3D Secure로 대체되어 사실상 사용 안 함 |

### 핵심 정리

**SSL** — 이미 쓰고 있음 (TLS라는 이름으로)

**IPSec** — Tailscale이 같은 역할을 더 간단하게 대체

**OTP** — 지금 없는데 추가할 수 있는 현실적인 보안 강화 포인트

```
Grafana    → 2FA 플러그인 (TOTP)
SSH        → Google Authenticator PAM 모듈
Wazuh Dashboard → 내장 MFA 설정
```

**FDS** — 도메인이 금융이라 다르지만, 원리(행위 기반 이상 탐지)는 Wazuh/Suricata가 하는 일과 같음

**SET** — 현재 실무에서 쓰이지 않는 레거시 표준. 무관.

---

## 애플리케이션 보안 일반 원칙

### 서비스를 추가할 때마다 점검할 것

1. **포트 노출 최소화** — 서비스에 필요한 포트만 UFW 허용
2. **전용 계정 사용** — 서비스별 전용 시스템 계정, root 실행 금지
3. **암호화 통신 강제** — 평문 프로토콜(FTP, Telnet, HTTP) 사용 금지
4. **아웃바운드 명시적 허용** — 서비스가 외부와 통신하는 포트만 UFW 허용
5. **로그 수집 연결** — 새 서비스 로그를 Promtail job에 추가
6. **fail2ban jail 추가** — 인증 실패가 있는 서비스면 jail 설정

### WAS (Web Application Server) 추가 시 추가 고려사항

```
ModSecurity CRS 룰 적용 대상에 추가
Zeek http.log 모니터링 대상 확인
nginx reverse proxy로 직접 포트 노출 금지
앱 레벨: 세션 재발급(Session Fixation 방지), CSRF 토큰 구현
```
