# 홈서버 보안 모니터링 - 현황 분석 및 향후 계획

> 작성일: 2026-03-09
> 대상 서버: kangminlog (Ubuntu 24.04.3 LTS)

---

## 1. 홈서버 보안 모니터링의 가능성

수백만 원짜리 전용 보안 장비 없이도, **리눅스 커널 내부의 기능**과 **오픈소스 소프트웨어**가 그 역할을 완벽하게 대신할 수 있다. SIEM 입장에서는 "물리 장비"냐 "소프트웨어 로그"냐의 차이일 뿐, 분석하는 데이터의 성격은 동일하다.

---

## 2. 이상적인 홈서버 보안 스택 (목표 구성)

### 2-1. 로그 데이터 소스

| 로그 경로 | 내용 |
|----------|------|
| `/var/log/auth.log` | SSH 접속 시도, 비밀번호 실패, sudo 사용 기록 (해킹 시도 파악 1순위) |
| `/var/log/kern.log` / `syslog` | ufw/iptables가 차단한 패킷 정보, 어떤 IP가 어떤 포트를 스캔했는지 |
| `/var/log/nginx/access.log` | 외부 접근 URL, HTTP 상태코드, 공격용 스크립트 요청 여부 |
| `/var/log/nginx/error.log` | 웹서버 오류 기록 |
| Docker 컨테이너 로그 | 직접 올린 서비스의 애플리케이션 로그 |

### 2-2. 보안 소프트웨어 역할 분담

| 물리 장비 역할 | 오픈소스 대체 | 핵심 기능 |
|--------------|-------------|---------|
| 방화벽 (Firewall) | `ufw` / `iptables` | 포트 제어, 차단 IP 로그 → SIEM으로 보내면 "전 세계 공격자 IP 지도" 작성 가능 |
| 침입 차단 시스템 (IPS) | `Fail2Ban` | 로그인 N회 실패 시 IP 자동 차단, 차단 이력 수집 → "공격자 순위" 추출 가능 |
| 웹 방화벽 (WAF) | `ModSecurity` (Nginx 모듈) | SQL Injection, XSS 등 웹 공격 패턴 탐지 및 차단 |
| 호스트 침입 탐지 (HIDS) | `Wazuh` 또는 `Osquery` | 파일 무결성 감시, 비정상 프로세스 탐지, 서버 내부 침입 후 행동 탐지 |

### 2-3. SIEM 아키텍처 흐름

```
[로그 생성] Ubuntu 내부 (ufw, auth.log, Nginx, Fail2Ban, ModSecurity, Wazuh)
     ↓
[로그 수집] Promtail / Filebeat (로그를 SIEM으로 전달)
     ↓
[저장/분석] Loki (로그 저장 및 쿼리)
     ↓
[시각화/알림] Grafana (대시보드, 알림 규칙)
```

---

## 3. 현재 프로젝트 구현 현황

### 3-1. 로그 수집 현황

| 로그 소스 | 목표 | 현재 상태 |
|----------|------|---------|
| `/var/log/auth.log` | ✅ 필수 | ✅ promtail job "auth" 수집 중 |
| `/var/log/ufw.log` | ✅ 필수 | ✅ promtail job "ufw" 수집 중 |
| `/var/log/kern.log` | ✅ 권장 | ⚠️ 별도 job 없음 (syslog에 일부만 포함) |
| `/var/log/nginx/access.log` | ✅ 필수 | ✅ promtail job "nginx_access" 수집 중 |
| `/var/log/nginx/error.log` | ✅ 권장 | ✅ promtail job "nginx_error" 수집 중 |
| `/var/log/fail2ban.log` | ✅ 필수 | ✅ promtail job "fail2ban" 수집 중 |
| systemd journal (SSH) | ✅ 권장 | ✅ promtail job "ssh_journal" 수집 중 |
| Docker 컨테이너 로그 | ✅ 권장 | ✅ Promtail docker_sd_configs로 수집 중 |

### 3-2. 보안 소프트웨어 설치 현황

| 소프트웨어 | 역할 | 현재 상태 |
|----------|------|---------|
| `ufw` | 방화벽 | ✅ 운영 중, 로그 수집 중 |
| `Fail2Ban` | IPS | ✅ 운영 중, 로그 수집 중 |
| `ModSecurity` | WAF | ✅ 완료 (DetectionOnly 모드, OWASP CRS 921개 규칙) |
| `Wazuh` / `Osquery` | HIDS | 🔄 진행 중 (Manager 4.14.3 실행 중, Agent 등록 대기) |

### 3-3. 시각화/알림 현황

| 기능 | 현재 상태 |
|------|---------|
| Grafana 대시보드 (8개 패널) | ✅ 운영 중 |
| SSH 공격 시도 시계열 | ✅ 구현됨 |
| Fail2Ban Ban/Unban 이벤트 | ✅ 구현됨 |
| KR-BLOCK 차단 이벤트 | ✅ 구현됨 |
| Nginx 상태코드 분포 | ✅ 구현됨 |
| Top 공격 IP 테이블 | ✅ 구현됨 |
| GeoIP 기반 공격자 세계 지도 | ✅ 완료 (ip-api.com batch API + Geomap 패널) |
| Grafana 알림 (Contact Point) | 🔄 진행 중 (Slack Webhook URL 대기) |
| Grafana 알림 (Alert Rules) | ❌ 미생성 |

---

## 4. 서버에 없는 것 (Server-side Gap)

### ✅ ModSecurity (WAF) — 완료 (2026-03-10)
- `libnginx-mod-http-modsecurity` + OWASP CRS 921개 규칙 설치
- SQL Injection (Rule 942100), XSS 등 탐지 확인
- 현재 **DetectionOnly 모드** — 로그만, 차단 없음 (안정화 후 `SecRuleEngine On` 전환 예정)
- 감사 로그: `/var/log/nginx/modsec_audit.log` → Promtail `job=modsec`으로 Loki 수집 중

### 🔄 Wazuh (HIDS) — 진행 중 (2026-03-10)
- `wazuh-manager:4.14.3` Docker 컨테이너 실행 중
- FIM 대상 설정 완료: `/etc/passwd`, `/etc/shadow`, `/etc/sudoers`, `/etc/ssh/sshd_config`, nginx 설정 등
- `wazuh-agent 4.14.3` 호스트 설치 완료
- **남은 작업:** Agent 키 주입 + systemd 시작 확인 → Promtail `alerts.json` 수집 → Grafana 패널 추가

---

## 5. 프로젝트에 부족한 것 (Project-side Gap)

### 🔄 Phase 6 알림 설정 (진행 중)
- Outlook SMTP 인증 실패 → Slack Webhook 방식으로 전환
- `.env`에 `SLACK_WEBHOOK_URL` 관리 (`.gitignore` 등록 완료)
- **남은 작업:** Slack Webhook URL 확보 → Contact Point 생성 → Alert Rules 3개 생성

**설정해야 할 Alert Rules:**

| 규칙 | 조건 | 심각도 |
|------|------|--------|
| SSH 브루트포스 | 5분 내 "Invalid user" 50회 이상 | Critical |
| Fail2Ban 급증 | 5분 내 Ban 이벤트 10회 이상 | Warning |
| Nginx 5xx 급증 | 5분 내 5xx 에러 20회 이상 | Warning |

### ✅ GeoIP 기반 공격자 세계 지도 — 완료 (2026-03-10)
- ip-api.com batch API로 fail2ban 차단 IP → 위경도 변환
- `collector.py`에 `collect_geo_attacks()` 추가, 캐시로 중복 API 호출 방지
- Grafana Panel 9: Geomap 패널, KV extractFields transform으로 lat/lon 파싱

### ✅ Docker 컨테이너 로그 수집 — 완료 (2026-03-10)
- Promtail `docker_sd_configs`로 loki/promtail/grafana 컨테이너 자동 감지
- `container`, `stream`, `service` 라벨 추출
- Loki `max_streams_per_user: 50000` 상향 (429 해결)

### ✅ `/var/log/kern.log` 별도 수집
- `KR-BLOCK` 커널 차단 로그를 `kern` job으로 수집 중
- `src_ip`, `dst_ip`, `proto`, `dpt`, `kern_event` 라벨 추출 적용됨
- Grafana 보안 대시보드가 kern.log 기반 차단 이벤트를 사용함

---

## 6. 향후 구현 우선순위

```
🔴 1순위 (즉시): Phase 6 알림 설정 완료
   → Slack Webhook URL 확보
   → Grafana Contact Point 생성
   → Notification Policy 설정
   → Alert Rules 3개 생성

🔴 2순위 (즉시): Phase 8 Wazuh Agent 등록 완료
   → Agent 키 주입 + systemd 시작 확인
   → Promtail에 alerts.json 수집 설정
   → Grafana Wazuh 알림 패널 추가

🟠 3순위 (중기): kern.log 별도 수집 job 추가

🟢 4순위 (장기): Suricata (네트워크 레이어 IDS)

🟢 5순위 (장기): Trivy cron (Docker 이미지 취약점 스캔)

✅ 완료: GeoIP 공격자 세계 지도 (2026-03-10)
✅ 완료: Docker 컨테이너 로그 수집 (2026-03-10)
✅ 완료: ModSecurity WAF (2026-03-10)
✅ 완료: Prometheus + Node Exporter (2026-03-10)
```

---

## 7. 현재 구성의 핵심 한계

> **"탐지는 되지만, 알림이 없다"** (Slack URL 대기 중)
> 대시보드를 직접 열어봐야만 이상 징후를 알 수 있는 상태.
> Phase 6 알림 설정(Slack Webhook)이 완료되어야 비로소 실용적인 보안 모니터링 시스템이 된다.

> **"내부 침입 탐지는 Wazuh Agent 등록 후 완성"** (Agent 등록 대기 중)
> Wazuh Manager + ModSecurity WAF는 구동 중.
> Wazuh Agent 등록 완료 시 파일 무결성 감시, 프로세스 이상 탐지, MITRE ATT&CK 매핑까지 활성화됨.
