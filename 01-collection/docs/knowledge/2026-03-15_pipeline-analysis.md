# 로그 수집 파이프라인 전체 분석 (2026-03-15)

---

## 1. 런타임 설정 확인

### 두 파이프라인 분리 구조

현재 두 개의 독립적인 파이프라인이 **목적이 달라** 공존한다.

| 구분 | 파이프라인 A (app-stack) | 파이프라인 B (security-log-monitor) |
|------|----------------------|--------------------------------------|
| 에이전트 | OTel Log Agent | Promtail |
| 백엔드 | ClickHouse (30일 TTL) | Loki (180일 TTL) |
| 소비자 | monitor-api (FastAPI) | Grafana 대시보드 |
| 목적 | 애플리케이션 가시성 | 보안 감사 / 인시던트 대응 |
| nginx access.log | ✅ 수집 (OTel → ClickHouse) | ✅ 수집 (Promtail → Loki) |

> nginx access.log는 양쪽 모두 수집 중이나 목적이 다르므로 중복이 아님.

### 런타임 설정 이슈 체크

| 항목 | 설정값 | 상태 |
|------|--------|------|
| MODSEC_RULE_ENGINE | `On` (docker-compose.yml env) | ✅ 차단 모드 |
| MODSEC_AUDIT_LOG | `/var/log/nginx/modsec_audit.log` | ✅ 파일 기록 확인 (2.3K) |
| MODSEC_AUDIT_ENGINE | `RelevantOnly` | ✅ 차단/탐지 이벤트만 기록 |
| MODSEC_AUDIT_LOG_FORMAT | `Native` | ✅ |
| nginx bind mount | `/var/log/nginx:/var/log/nginx` | ✅ 호스트 직접 마운트 |
| logrotate postrotate | `docker exec dodgers-nginx-1 nginx -s reopen` | ✅ 적용됨 |
| OTel Log Agent source | `/var/log/nginx/access.log` | ✅ |
| Promtail modsec source | `/var/log/nginx/modsec_audit.log` | ✅ |
| Loki retention | 180일 (통신사 법적 요건 준수) | ✅ |
| ClickHouse TTL | 30일 (애플리케이션 관찰 목적) | ✅ |

**발견된 불일치**: 없음. 설정 정합성 유지됨.

---

## 2. Promtail 수집 현황

### 수집 중 (17개 소스)

| Job | 경로 | 파싱 방식 | 추출 필드 |
|-----|------|-----------|-----------|
| auth | `/var/log/auth.log` | regex | action, username, src_ip |
| ufw | `/var/log/ufw.log` | regex | ufw_action, src_ip, dst_ip, proto, dpt |
| fail2ban | `/var/log/fail2ban.log` | regex | jail, f2b_action, banned_ip |
| syslog | `/var/log/syslog` | 없음 | — |
| modsec | `/var/log/nginx/modsec_audit.log` | regex | modsec_action, rule_id, msg |
| wazuh | `/wazuh-data/logs/alerts/alerts.json` | JSON | level, rule_id, description, agent_name, src_ip |
| dpkg | `/var/log/dpkg.log` | regex | dpkg_action, package |
| apt | `/var/log/apt/history.log` | 없음 | — |
| kern | `/var/log/kern.log` | regex | kern_event, src_ip, dst_ip, proto, dpt |
| postgresql | `/var/log/postgresql/postgresql-16-main.log` | regex | pg_level |
| suricata | `/var/log/suricata/eve.json` | JSON | EVE 표준 필드 |
| zeek_conn | `/zeek-logs/current/conn.log` | JSON | proto, src_ip, dst_ip, conn_state, service |
| zeek_dns | `/zeek-logs/current/dns.log` | JSON | qtype_name, rcode_name |
| zeek_http | `/zeek-logs/current/http.log` | JSON | method, status_code |
| zeek_ssl | `/zeek-logs/current/ssl.log` | JSON | version, validation_status |
| zeek_notice | `/zeek-logs/current/notice.log` | JSON | note |
| zeek_weird | `/zeek-logs/current/weird.log` | JSON | name |

### 미수집 (정책적 결정 또는 미구현)

| 소스 | 이유 |
|------|------|
| Docker 컨테이너 stdout (auth-service, frontend 등) | 방식 A(파일 scrape) 유지 정책 |
| nginx error.log | Promtail에 미설정 (필요 시 추가 가능) |
| nginx access.log (Loki 쪽) | 현재 OTel Log Agent → ClickHouse만 수집; Loki 쪽 미추가 (필요 없음) |
| Redis 로그 | Redis stdout 수집 안 됨 |
| ClickHouse 로그 | 내부 컨테이너 stdout 수집 안 됨 |

> Docker 컨테이너 stdout 미수집은 방식 A(파일 scrape) 유지 정책에 따른 의도적 결정.
> 침해 조사 시 `docker logs <container>` 로 직접 확인 필요.

---

## 3. 문서 / 대시보드 정합 확인

### 대시보드 ↔ Loki 라벨 매핑

| 대시보드 패널 | 사용 Loki job 라벨 | 실제 Promtail 설정 | 정합 |
|--------------|--------------------|--------------------|------|
| SSH Attack timeline | `job="auth"` | auth.log → labels: job=auth | ✅ |
| fail2ban Ban/Unban | `job="fail2ban"` | fail2ban.log → labels: job=fail2ban | ✅ |
| WAF (ModSecurity) events | `job="modsec"` | modsec_audit.log → labels: job=modsec | ✅ (2026-03-15 수정 후) |
| UFW block events | `job="ufw"` | ufw.log → labels: job=ufw | ✅ |
| Wazuh High alerts | `job="wazuh"` | wazuh alerts.json → labels: job=wazuh | ✅ |
| Suricata alerts | `job="suricata"` | eve.json → labels: job=suricata | ✅ |
| Zeek network analysis | `job=~"zeek.*"` | zeek_conn/dns/http/ssl/notice/weird | ✅ |
| PostgreSQL errors | `job="postgresql"` | pg logs → labels: job=postgresql | ✅ |
| dpkg/apt changes | `job="dpkg"`, `job="apt"` | dpkg.log, apt/history.log | ✅ |
| Kernel fatal events | `job="kern"` | kern.log → labels: job=kern | ✅ |
| System metrics (CPU/Mem/Disk) | Prometheus `job="node"` | node-exporter:9100 | ✅ |

**2026-03-15 이전 불일치 (해결됨)**:
- modsec 패널: `job="modsec"` 쿼리했으나 실제 로그가 /dev/stdout으로 나가 파일 0 bytes → 수정 완료

---

## 4. stdout 전수 수집 — 장단점 vs 현 정책 비교

### 현 정책 (방식 A: 파일 scrape 중심)

```
nginx → 파일 → Promtail file scrape → Loki
앱 컨테이너 → OTLP → OTel Collector → ClickHouse
Docker stdout → 미수집 (Loki 기준)
```

**장점**:
- Promtail 설정이 이미 파일 기반으로 완성됨
- modsec_audit.log, auth.log 등 호스트 로그와 통합 가능
- 로그 포맷 커스터마이징(regex, json) 자유도 높음
- ClickHouse ↔ Loki 역할 분리 명확

**단점**:
- Docker 컨테이너 app stdout (auth-service, frontend 등) 미수집 → 침해 조사 시 `docker logs` 직접 실행 필요
- nginx -s reopen 같은 운영 이슈 존재

### 대안 (방식 B: Docker stdout scrape)

```
Docker 컨테이너 stdout → Promtail Docker socket 또는 log driver → Loki
```

**장점**:
- 모든 컨테이너 로그 자동 수집 (설정 한 번으로)
- nginx logrotate/reopen 이슈 완전히 제거 가능

**단점**:
- 현재 Promtail이 file scrape 중심 → 전환 비용 발생
- 파일 기반 파싱(regex)을 Docker 라벨 기반으로 재설계 필요
- 컨테이너 재시작/업데이트 시 로그 유실 가능성
- 모든 컨테이너 stdout이 다 들어오면 노이즈 증가

### 현 정책 유지 이유

1. Promtail이 파일 scrape 중심으로 완성 구성됨
2. 앱 컨테이너(auth-service 등) 로그는 OTel OTLP로 이미 ClickHouse에 수집 중
3. 보안 로그(auth.log, modsec, zeek, wazuh 등)는 파일이 정답
4. 전환 비용 대비 실익이 현 구조에서 낮음

**결론**: 현 방식 A 유지. 필요 시 개별 컨테이너 stdout Promtail 추가는 선택지.

---

## 5. 전체 데이터 수집 파이프라인 순서도

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  파이프라인 A — app-stack 애플리케이션 가시성 (OTel → ClickHouse)              │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  App Services (Docker, kangmin-net)                             │         │
│  │  ├─ auth-service   :8090  (FastAPI + OTLP)                     │         │
│  │  ├─ privacy-shield :8080  (FastAPI + OTLP)                     │         │
│  │  ├─ doc-forensics  :8081  (FastAPI + OTLP)                     │         │
│  │  └─ secure-llm     :3000  (Node + OTLP)                        │         │
│  └─────────────────┬───────────────────────────────────────────────┘         │
│                    │ OTLP gRPC :4317 / HTTP :4318                             │
│                    ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  OTel Collector (otel-collector)                                │         │
│  │  ├─ [memory_limiter] 512 MiB                                   │         │
│  │  ├─ [filter/logs] DEBUG 제거, health probe 제거                 │         │
│  │  └─ [batch] 5000건 / 10s                                        │         │
│  └──────────────────────┬──────────────────────────────────────────┘         │
│                         │ tcp:9000                                            │
│                         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  ClickHouse (otel DB, 30일 TTL)                                 │         │
│  │  ├─ otel_traces   (TraceId, SpanId, ServiceName, Duration ...)  │         │
│  │  ├─ otel_logs     (Timestamp, Severity, Body, Attributes ...)   │         │
│  │  └─ otel_metrics  (MetricName, Value, ResourceAttributes ...)   │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                         ▲                                                     │
│  ┌──────────────────────┘                                                     │
│  │  OTel Log Agent (log-agent)                                                │
│  │  └─ [filelog] /var/log/nginx/access.log                                   │
│  │      └─ [regex_parser] method, path, status, remote_addr                  │
│  │      └─ OTLP gRPC → otel-collector:4317                                   │
│  │                                                                            │
│  │  nginx (/var/log/nginx) bind mount                                         │
│  │  ├─ 컨테이너 내부: /var/log/nginx/*.log                                   │
│  │  └─ 호스트:       /var/log/nginx/*.log  (동일 경로)                        │
│  │                                                                            │
│  │  Prometheus                                                                │
│  │  ├─ scrape otel-collector :8888 (내부 메트릭)                              │
│  │  └─ scrape otel-collector :8889 (앱 메트릭)                                │
│  │                                                                            │
│  │  monitor-api (FastAPI)                                                     │
│  │  └─ SELECT from ClickHouse → /api/monitor/ 엔드포인트                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  파이프라인 B — 보안 로그 모니터링 (Promtail → Loki → Grafana)               │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  로그 소스 (호스트 파일 기반)                                          │  │
│  │                                                                         │  │
│  │  [시스템]         [보안]              [네트워크]                       │  │
│  │  /var/log/        /var/log/           /zeek-logs/current/               │  │
│  │  ├─ auth.log      ├─ fail2ban.log     ├─ conn.log                      │  │
│  │  ├─ syslog        ├─ ufw.log          ├─ dns.log                       │  │
│  │  ├─ kern.log      └─ nginx/           ├─ http.log                      │  │
│  │  ├─ dpkg.log          ├─ modsec_      ├─ ssl.log                       │  │
│  │  └─ apt/history.log   │   audit.log   ├─ notice.log                    │  │
│  │                       └─ access.log   └─ weird.log                     │  │
│  │  [SIEM]                                                                  │  │
│  │  /wazuh-data/logs/alerts/alerts.json                                   │  │
│  │  /var/log/suricata/eve.json                                            │  │
│  │  /var/log/postgresql/postgresql-16-main.log                            │  │
│  └────────────────────────────┬───────────────────────────────────────────┘  │
│                               │ file scrape (tail -f 방식)                    │
│                               ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Promtail (log agent)                                                   │ │
│  │  ├─ [regex_parser]  syslog 계열 (auth, ufw, fail2ban, kern)            │ │
│  │  ├─ [json_parser]   구조적 로그 (wazuh, suricata, zeek_*)              │ │
│  │  └─ label 부착 → job, action, src_ip, rule_id, ...                     │ │
│  └────────────────────────────┬────────────────────────────────────────────┘ │
│                               │ HTTP push → loki:3100                         │
│                               ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Loki                                                                   │ │
│  │  ├─ 저장: filesystem (/loki/chunks)                                    │ │
│  │  ├─ 인덱스: boltdb-shipper                                             │ │
│  │  └─ 보존 기간: 180일 (통신사 법적 요건)                                │ │
│  └────────────────────────────┬────────────────────────────────────────────┘ │
│                               │ LogQL 쿼리                                    │
│  Prometheus ──────────────────┤                                               │
│  └─ node-exporter:9100        │ PromQL 쿼리                                   │
│                               ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Grafana 대시보드                                                       │ │
│  │  ├─ Master Dashboard     (헬스 + 상위 공격 + 통합 뷰)                  │ │
│  │  ├─ Security Dashboard   (SSH, fail2ban, WAF, Wazuh, Suricata)         │ │
│  │  ├─ Zeek Dashboard       (네트워크 행위 분석)                          │ │
│  │  └─ Syslog Dashboard     (시스템 이벤트)                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  nginx 로그 로테이션 (두 파이프라인 교차점)                                   │
│                                                                               │
│  자정 logrotate                                                               │
│  ├─ access.log → access.log.1 (파일명 변경)                                  │
│  └─ postrotate:                                                               │
│      ├─ invoke-rc.d nginx rotate (호스트 nginx 시그널 — disabled이지만 무해)  │
│      └─ docker exec dodgers-nginx-1 nginx -s reopen                          │
│          └─ Docker nginx가 새 access.log 파일 디스크립터 열기               │
│                                                                               │
│  재개 후:                                                                     │
│  ├─ OTel Log Agent: 새 access.log tail → ClickHouse 계속 기록                │
│  └─ Promtail modsec: 새 modsec_audit.log tail → Loki 계속 기록              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 로그 보존 정책 — 저장소별 정리

### 보존 기간 비교

| 저장소 | 실행 위치 | 보존 기간 | 설정 위치 | 이유 |
|--------|-----------|-----------|-----------|------|
| **Loki** (security-log-monitor) | Docker 내부 | **180일** | `config/loki-config.yml` → `retention_period` | 통신사 법적 요건 (최소 3개월, 6개월 권고) |
| **ClickHouse** (app-stack) | Docker 내부 | **30일** | `observability/init-db/01_create_tables.sql` → `TTL ... + INTERVAL 720 HOUR` | 애플리케이션 관찰 목적, 장기 보관 불필요 |
| **logrotate** | **호스트 시스템** | 통상 7일치 압축 | `/etc/logrotate.d/nginx` → `rotate N` | 파일 자체 디스크 관리 (데이터는 이미 Loki/ClickHouse에 수집됨) |

> **왜 logrotate만 호스트인가?**
> nginx 로그가 bind mount 구조이기 때문이다.
>
> ```
> Docker nginx (컨테이너) → 파일 write
>         ↕ bind mount (/var/log/nginx:/var/log/nginx)
> 호스트 /var/log/nginx/ ← logrotate가 여기 파일을 관리
>         ↕
> Promtail / OTel Log Agent → 호스트 파일 read → Loki / ClickHouse
> ```
>
> Loki와 ClickHouse는 순수 Docker 내부 데이터 보존이고, logrotate는 bind mount로 노출된 호스트 파일의 디스크 관리다. 개념이 다르다.
> stdout 방식(방식 B)으로 전환하면 logrotate는 파이프라인에서 제거된다.

### 통합 관리 여부

**현재는 통합 관리 불가.** 각 오픈소스 툴이 자체 설정 파일에 개별적으로 정의되어 있음.

```
Loki      → /home/user/security-log-monitor/config/loki-config.yml
ClickHouse → /home/user/app-stack/observability/init-db/01_create_tables.sql
logrotate  → /etc/logrotate.d/nginx
```

툴마다 보존 정책 구현 방식이 다르기 때문에 단일 설정 파일로 통합하는 것은 불가능하다.
환경변수로 추상화하거나, Ansible/IaC 툴로 일괄 적용하는 방법은 있으나 현재 규모에서는 오버엔지니어링.

### 보존 기간 수정 방법

#### Loki 보존 기간 변경 (`/home/user/security-log-monitor/config/loki-config.yml`)

```yaml
limits_config:
  retention_period: 180d   # ← 여기 수정 (예: 90d, 365d)
```

변경 후 Loki 컨테이너 재시작 필요:
```bash
docker compose restart loki
```

#### ClickHouse TTL 변경 (`/home/user/app-stack/observability/init-db/01_create_tables.sql`)

SQL의 `INTERVAL 720 HOUR` (= 30일) 부분이 TTL이다.
단, init-db SQL은 최초 컨테이너 생성 시에만 실행된다.
**이미 운영 중인 테이블**은 ALTER로 직접 수정해야 한다:

```sql
-- 예: 60일로 변경
ALTER TABLE otel.otel_logs MODIFY TTL toDateTime(Timestamp) + INTERVAL 1440 HOUR;
ALTER TABLE otel.otel_traces MODIFY TTL toDateTime(Timestamp) + INTERVAL 1440 HOUR;
ALTER TABLE otel.otel_metrics MODIFY TTL toDateTime(Timestamp) + INTERVAL 1440 HOUR;
```

#### logrotate 보관 개수 변경 (`/etc/logrotate.d/nginx`)

```
rotate 7   # ← 여기 수정 (파일 개수 기준, daily이면 7일치)
```

---

## 요약: 현재 구조의 핵심 판단

| 항목 | 판단 |
|------|------|
| 두 파이프라인 공존 | 정상. 목적(관찰 vs 보안 감사)이 다름 |
| Docker stdout 미수집 | 의도적 정책. 앱 로그는 OTel OTLP로 ClickHouse에 수집 중 |
| modsec 로그 수집 | 2026-03-15 수정 완료. Loki에 정상 수집 중 |
| Loki 180일 보존 | 법적 요건 충족 |
| ClickHouse 30일 보존 | 애플리케이션 관찰 목적으로 적정 |
| 대시보드 정합 | 전체 일치 확인 |
