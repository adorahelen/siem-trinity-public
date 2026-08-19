# OSS 기반 자체 구축 SIEM 아키텍처 분석

> 작성일: 2026-03-16
> 목적: 이 프로젝트가 상용 SIEM과 구조적으로 어떻게 대응되는지 정리

---

## 1. 비유: 보안 장비 vs SIEM

이 프로젝트의 구성 요소를 기업 환경과 대응시키면 다음과 같다.

| 이 프로젝트 | 기업 환경 대응물 | 역할 |
|---|---|---|
| fail2ban + UFW | 방화벽 장비 (Fortinet, Palo Alto) | IP/포트 단위 차단 |
| ModSecurity + nginx | WAF 장비 (F5, Barracuda WAF) | HTTP 페이로드 검사 |
| Suricata | IDS/IPS 장비 (윈스 Sniper, Snort 기반 제품) | 패킷 시그니처 탐지 |
| Zeek | 네트워크 포렌식 장비 (전문 SOC 구성) | 전체 세션 메타데이터 기록 |
| Wazuh Manager + Agent | HIDS + SIEM 엔진 (IBM QRadar, LogRhythm 일부) | 호스트 내부 탐지·상관분석 |
| Promtail (11개 job, 정규식/JSON 파서) | SIEM 수집기 + 로그 정규화 커넥터 | 수집·파싱·정규화 |
| Loki | 로그 저장소 (Elasticsearch 역할) | 검색·보존 |
| Grafana | 분석 화면 (Kibana, 로그프레소 UI) | 시각화·대시보드 |
| collector.py | 커스텀 커넥터 + enricher | GeoIP·UA 분류·suspicious path |

**핵심 비유:**
- **설치된 OSS들 (fail2ban, ModSecurity, Suricata, Zeek, Wazuh)** = 기업이 소유한 보안 장비
- **Promtail + Loki + Grafana + collector.py** = 기업이 판매하는 SIEM 제품

> Wazuh는 "보안 장비"가 아니라 그 자체로 SIEM이다.
> 탐지 룰 수천 개, 상관분석, MITRE ATT&CK 자동 매핑을 제공하며,
> 상용 SIEM이 파는 "해킹 탐지 시나리오 라이브러리"를 오픈소스로 담당한다.

---

## 2. 가시성 레이어 구조

```
[외부 인터넷]
      ↓
[네트워크 레이어]
  ├── Suricata  → 알려진 공격 시그니처 탐지 (IDS/IPS)
  └── Zeek      → 세션/DNS/TLS 메타데이터 전수 기록 (블랙박스)
      ↓
[호스트 경계]
  ├── UFW       → 포트/IP 차단
  ├── fail2ban  → 로그인 실패 자동 차단
  └── ModSecurity + nginx → HTTP 페이로드 WAF 검사
      ↓
[호스트 내부]
  └── Wazuh Agent → 파일 무결성, 프로세스, 로그 감시 (Host-based SIEM)
      ↓
[커널]
  └── auditd / eBPF → execve, setuid, 파일 접근 (미도입)
```

**Suricata vs Zeek 역할 차이:**

```
Suricata = 경보기
  → "이 패턴은 알려진 공격이다" → alert 발생
  → 시그니처에 없으면 무반응

Zeek = 블랙박스 항공기록장치
  → 모든 연결을 conn.log / dns.log / ssl.log에 기록
  → 시그니처 없어도 "누가 언제 어디에 연결했는지" 남김
  → Suricata alert 발생 전 정찰 단계도 역추적 가능
```

Zeek까지 도입되면 **"탐지"** 가 아닌 **"관측"** 수준의 네트워크 가시성이 확보된다.
= Host-based SIEM (Wazuh) + Network-based SIEM (Suricata + Zeek)의 완전한 조합.

---

## 3. 파서 위치 1: `config/promtail-config.yml` — 수집 시점 파싱

각 OSS는 로그 형식이 모두 다르다. Promtail의 `pipeline_stages`가 각 형식에 맞는 파서 역할을 한다.

| job | 로그 경로 | 로그 형식 | 파싱 방식 | 추출 필드 |
|---|---|---|---|---|
| `auth` | `/var/log/auth.log` | 평문 syslog | regex | action, username, src_ip |
| `ufw` | `/var/log/ufw.log` | 커널 평문 | regex | ufw_action, src_ip, dst_ip, proto, dpt |
| `fail2ban` | `/var/log/fail2ban.log` | 평문 | regex | jail, f2b_action, banned_ip |
| `syslog` | `/var/log/syslog` | 평문 | 없음 (raw) | — |
| `modsec` | `/var/log/nginx/modsec_audit.log` | ModSecurity 고유 형식 | regex | modsec_action, rule_id, msg |
| `wazuh` | `/wazuh-data/logs/alerts/alerts.json` | **JSON** | json 파서 | level, rule_id, description, agent_name |
| `dpkg` | `/var/log/dpkg.log` | 평문 | regex | dpkg_action, package |
| `apt` | `/var/log/apt/history.log` | 평문 | 없음 (raw) | — |
| `kern` | `/var/log/kern.log` | 커널 평문 | regex | kern_event, src_ip, proto, dpt |
| `postgresql` | `/var/log/postgresql/...` | PostgreSQL 고유 형식 | regex | pg_level |
| `suricata` | `/var/log/suricata/eve.json` | **JSON** | 쿼리 시점 `\| json` | (라벨 최소화) |
| `zeek_conn` | `/zeek-logs/current/conn.log` | **JSON** | json 파서 | proto, conn_state, service |
| `zeek_dns` | `/zeek-logs/current/dns.log` | **JSON** | json 파서 | qtype_name, rcode_name |
| `zeek_http` | `/zeek-logs/current/http.log` | **JSON** | json 파서 | method, status_code |
| `zeek_ssl` | `/zeek-logs/current/ssl.log` | **JSON** | json 파서 | version, validation_status |
| `zeek_notice` | `/zeek-logs/current/notice.log` | **JSON** | json 파서 | note |
| `zeek_weird` | `/zeek-logs/current/weird.log` | **JSON** | json 파서 | name |

> 상용 SIEM이 "수천 종 장비 파서 내장"이라고 마케팅하는 것을,
> 이 프로젝트에서는 각 소스에 맞게 직접 작성한 것이다.
> 구조는 동일하고, 차이는 커버하는 장비 종류의 수뿐이다.

---

## 4. 파서 위치 2: `exporter/collector.py` — 수집 후 Enrichment

Promtail이 처리하지 못하는 "가공·분류·외부 데이터 결합" 작업을 Python으로 담당한다.

```
[nginx access.log]
      ↓
NGINX_ACCESS_RE (정규식)
  → method, request_path, status_code, user_agent, bytes_sent 추출
      ↓
user_agent_family()
  → Chrome / Safari / Firefox / Edge / curl / bot 분류
      ↓
SUSPICIOUS_PATH_RE
  → wp-login.php / .env / /shell / phpmyadmin 등 의심 경로 플래깅
      ↓
GeoIP (ip-api.com batch API)
  → country, city, isp 추가 (캐시로 API 호출 최소화)
      ↓
[Loki Push API]
  → 정규화·enrichment 완료된 로그 전송
```

추가로 수집하는 항목:
- `ss` 명령 → 현재 열린 포트 현황
- `fail2ban-client` → 현재 차단된 IP 목록
- `lastb` → 로그인 실패 이력
- `tailscale status` → VPN 연결 상태

---

## 5. 전체 데이터 흐름 (Data Flow)

```
┌─────────────────────────────────────────────────────┐
│                   보안 장비 레이어                    │
│  fail2ban · UFW · ModSecurity · Suricata · Zeek      │
│  Wazuh Agent                                         │
└──────────────────────┬──────────────────────────────┘
                       │ 각기 다른 로그 형식으로 출력
                       │ (평문 syslog / JSON / 고유 형식)
          ┌────────────┴────────────┐
          ▼                        ▼
  [promtail-config.yml]    [collector.py]
  pipeline_stages           nginx enrichment
  regex / json 파서         GeoIP · UA분류
  수집 시점 정규화           5분 주기 실행
          │                        │
          └────────────┬───────────┘
                       ▼
               [Loki Push API]
               정규화된 필드로 저장
               보존: 180일
                       │
                       ▼
              [LogQL 쿼리 엔진]
                       │
                       ▼
            [Grafana Dashboard]
            18+ 패널 시각화
            Alert Rules (Slack 연동 예정)
```

---

## 6. 상용 SIEM과의 실제 차이

| 항목 | 이 프로젝트 | 상용 SIEM (로그프레소, eyeCloud 등) |
|---|---|---|
| 로그 파싱 | 직접 Promtail regex/json 작성 | 수천 종 장비 파서 사전 내장 |
| 탐지 룰 | Wazuh 기본 룰 + 커스텀 | 수년치 튜닝된 룰셋 판매 |
| 상관분석 | Wazuh correlation engine | 전용 상관분석 엔진 |
| 자동 대응 (SOAR) | 없음 (Wazuh active response 부분적) | eyeCloud XOAR 등 전용 제품 |
| 컴플라이언스 리포트 | 없음 | ISMS-P, K-ISMS 자동 보고서 |
| 기술 지원 | 커뮤니티 + 구글 | 엔지니어 전화 대응, SLA |
| 타 장비 연동 인증 | 없음 | CC인증, GS인증 보유 |
| 비용 | 전기세 + 시간 | 수천만 원/년 라이선스 |

---

## 7. 핵심 정리

이 프로젝트에서 직접 수행한 것:

| 상용 SIEM의 마케팅 포인트 | 이 프로젝트의 대응 구현 |
|---|---|
| "로그 파싱 지옥 해결" | Promtail 17개 job + pipeline_stages 직접 작성 |
| "탐지 시나리오 라이브러리" | Wazuh 수천 개 기본 룰 + MITRE ATT&CK 매핑 |
| "통합 시각화" | Grafana 18+ 패널 구성 |
| "장기 보존" | Loki 180일 retention |
| "네트워크 레이어 탐지" | Suricata (시그니처) + Zeek (전수 기록) |
| "호스트 내부 탐지" | Wazuh Agent FIM + 프로세스 감시 |

**한 줄 결론:**
이 프로젝트는 상용 SIEM이 파는 구성 요소를 전부 직접 조립한 구조다.
차이는 커버하는 장비 종류의 수, 컴플라이언스 인증, 기술 지원 SLA뿐이다.
