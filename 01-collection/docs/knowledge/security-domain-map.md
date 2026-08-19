# 보안 3대 영역과 이 프로젝트의 위치

> 작성일: 2026-03-10

---

## 1. 보안 3대 영역 (성의 관점)

보안 업무는 크게 세 가지 영역으로 나뉜다. 각 영역은 역할, 사고방식, 사용 도구가 근본적으로 다르다.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   성 밖              성 자체               성 안                  │
│  (공격자 시점)       (방어 구조 구축)      (침입 후 분석)          │
│                                                                  │
│  공성 태세           축성 및 수비          사후 분석 및 전략        │
│  Offensive Sec.      Sec. Engineering      Incident Response     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### 성 밖: 공성태세 (Offensive Security)

**핵심 질문:** "어디가 약할까?"

성 밖에서 해커보다 먼저 성벽의 균열을 찾거나, 실제로 사다리를 타고 넘어가 보는 역할.

| 항목 | 내용 |
|------|------|
| 전문 직무 | 모의해킹(Penetration Testing), 레드팀(Red Team), 취약점 분석 |
| 주요 도구 | nmap, Metasploit, Burp Suite, SQLmap, CALDERA |
| 사고방식 | 공격적, 창의적 — "막혀 있어도 다른 방법을 찾는다" |
| 결과물 | 취약점 보고서, 침투 테스트 결과, PoC(개념 증명) |

---

### 성 자체: 축성 및 수비 운영 (Security Engineering & Ops)

**핵심 질문:** "어떻게 막을까? 이상 징후가 생기면 어떻게 알 수 있을까?"

성벽을 높이 쌓고, CCTV를 설치하고, 문지기를 배치하고, 이상 징후를 실시간으로 모니터링하는 역할.

| 항목 | 내용 |
|------|------|
| 전문 직무 | 보안 솔루션 엔지니어, 보안 인프라 운영, 클라우드 보안 |
| 주요 도구 | 방화벽(UFW), WAF(ModSecurity), IPS(Fail2Ban), SIEM(Loki+Grafana), HIDS(Wazuh) |
| 사고방식 | 꼼꼼함, 인프라 지향 — "끊기지 않고 안전하게 돌아가게 하자" |
| 결과물 | 보안 아키텍처, 대시보드, 알림 규칙, 자동 차단 정책 |

---

### 성 안: 사후 분석 및 전략 (Incident Response & Governance)

**핵심 질문:** "어떻게 뚫렸고, 다음에는 어떻게 막을까?"

도둑이 들었을 때 즉시 출동하고, 발자국을 분석해 침입 경로를 파악하며, 법규를 고치는 역할.

| 항목 | 내용 |
|------|------|
| 전문 직무 | 침해사고 대응(CERT/CSIRT), 디지털 포렌식(DFIR), 보안 컨설팅(GRC) |
| 주요 도구 | Volatility, Autopsy, ELK(포렌식용), Splunk |
| 사고방식 | 논리적 추론, 차분함 — "사실에서 경로를 역추적한다" |
| 결과물 | 침해 분석 보고서, 사후 조치 계획, 보안 정책/컨설팅 |

---

### 한 발짝 더: 설계자 역할

세 영역을 연결하거나 전체 구조를 먼저 설계하는 역할.

| 역할 | 비유 | 하는 일 |
|------|------|--------|
| 보안 아키텍트 | 성의 설계도를 그리는 사람 | "이 성은 습지에 지으면 안 된다" — 전체 보안 구조 설계 |
| DevSecOps | 성을 짓는 중에 벽돌 강도를 검사하는 자동화 시스템 | 개발 단계에서 보안 테스트 자동화 (CI/CD 파이프라인에 보안 통합) |

---

## 2. 이 프로젝트의 위치

### 결론: 성 자체 (Security Engineering & Ops)

```
현재 프로젝트 = 성을 짓고, CCTV를 달고, 이상 징후를 모니터링하는 것
```

성벽(방화벽)은 이미 있다. 문지기(IPS)도 있다. 지금 하고 있는 작업은
**성 전체에 CCTV 네트워크를 구축하고, 관제실(대시보드)에서 영상을 통합 모니터링하는 것**이다.

---

### 프로젝트 구성 요소 매핑

```
성의 구조물                   이 프로젝트에서
─────────────────────────────────────────────────────────────────
성벽 (Firewall)               UFW — 포트/IP 단위 접근 차단
문지기 (IPS)                  Fail2Ban — 로그인 실패 N회 시 자동 차단
성문 검문소 (WAF)              ModSecurity ✅ — nginx 모듈, OWASP CRS 921개 룰 (DetectionOnly)
CCTV (로그 수집)              Promtail — auth.log, ufw.log, nginx, modsec, Docker 수집
영상 저장소 (로그 저장)         Loki — 로그 저장 및 쿼리 엔진 (보존 180일)
관제실 (시각화/알림)           Grafana — 대시보드 12개 패널, 알림 [Slack URL 대기]
내부 감시 카메라 (HIDS)        Wazuh 🔄 — Manager 운영 중, Agent 등록 대기
```

---

### 수집 중인 로그 (CCTV 위치)

| 위치 (로그 소스) | 수집 방식 | Promtail job | 파싱 레이블 |
|----------------|---------|------------|-----------|
| 성문 출입 기록 (auth.log) | Promtail file | `auth` | action, username, src_ip |
| 성벽 차단 기록 (ufw.log) | Promtail file | `ufw` | ufw_action, src_ip, proto, dpt |
| 외곽 차단 기록 (kern.log / KR-BLOCK) | Promtail file | `kern` | kern_event, src_ip, dst_ip, proto, dpt |
| 정문 통행 기록 (nginx access) | Promtail file | `nginx_access` | remote_addr, method, status_code |
| 정문 오류 기록 (nginx error) | Promtail file | `nginx_error` | — |
| 문지기 조치 기록 (fail2ban) | Promtail file | `fail2ban` | jail, f2b_action, banned_ip |
| 시스템 기록 (syslog) | Promtail file | `syslog` | — |
| SSH 서비스 기록 (journal) | Promtail journal | `ssh_journal` | — |
| 포트 현황, 마지막 실패 이력 | Python exporter (5분 주기) | ss, lastb, tailscale | — |

---

### 관제실 현황 (Grafana 대시보드)

| 패널 | 상태 |
|------|------|
| SSH Invalid user 시도 타임라인 | ✅ 구현됨 |
| Fail2Ban Ban/Unban 이벤트 타임라인 | ✅ 구현됨 |
| KR-BLOCK 차단 이벤트 타임라인 | ✅ 구현됨 |
| Nginx 상태코드 분포 (2xx/4xx/5xx) | ✅ 구현됨 |
| Top 공격 IP 테이블 | ✅ 구현됨 |
| 최근 로그인 실패 이력 (lastb) | ✅ 구현됨 |
| 포트 노출 현황 (ss) | ✅ 구현됨 |
| Fail2Ban 차단 현황 | ✅ 구현됨 |
| GeoIP 공격자 세계 지도 | ✅ 완료 (ip-api.com batch API) |
| Grafana 알림 (Contact Point / Alert Rules) | 🔄 진행 중 (Slack URL 대기) |

---

## 3. 3대 영역과의 비교 및 대조

### 이 프로젝트가 커버하는 것 vs 커버하지 않는 것

```
성 밖 (Offensive)         성 자체 (Engineering)      성 안 (IR)
────────────────           ──────────────────────     ──────────────────
❌ 이 프로젝트의            ✅ 이 프로젝트의 핵심        △ 이 프로젝트의
   영역이 아님                                           부분적 커버
                           방어 도구 운영:              로그 보존:
취약점을 찾거나              UFW ✅                     Loki에 로그 축적 ✅
공격을 시뮬레이션            Fail2Ban ✅
하는 작업은                 Nginx ✅                   타임라인 재구성:
이 프로젝트 범위             ModSecurity ❌ (예정)       Grafana로 가능 △
밖이다.                     Wazuh ❌ (예정)
                                                        포렌식 수준 분석:
단, 공격자가                SIEM 구축:                  ❌ 현재 불가
어떤 공격을 하는지           Promtail ✅                (Wazuh 도입 후
이해하면                    Loki ✅                     일부 가능)
ModSecurity 룰을            Grafana ✅
더 잘 작성할 수                                         자동 대응:
있다는 점에서               알림 시스템:                 ❌ 미설정
간접 연결됨.                 Phase 6 미완료 ⚠️           (Phase 6 완료 후)
```

---

### 이 프로젝트의 현재 한계 (영역별)

**성 밖 관점에서 보면:**
- 실제 공격자가 무엇을 시도하는지는 로그에서 볼 수 있지만
- "이 공격이 성공했는가?" 는 현재 스택으로 판단 불가
- ModSecurity 없이는 SQLi, LFI 시도가 access.log에 "일반 요청"으로만 기록됨

**성 자체 관점에서 보면:**
- 외부 공격 시도 탐지: ✅ 충분히 커버됨
- WAF 레이어 공백: ❌ ModSecurity 미설치 (웹 공격 패턴 탐지 불가)
- 알림 부재: ⚠️ 대시보드를 직접 열어야만 이상 징후 파악 가능
- 내부 감시 공백: ❌ Wazuh 미설치 (파일 변조, 권한 상승 탐지 불가)

**성 안 관점에서 보면:**
- 로그가 Loki에 축적되므로 사후 타임라인 재구성은 가능
- 그러나 "공격자가 성 안에서 무엇을 했는가"는 추적 불가
- Wazuh 없이는 침입 후 행동(파일 변조, 백도어 설치, 권한 상승)이 보이지 않음

---

## 4. 향후 로드맵 (영역별 관점)

```
현재 (성 자체 기본 구축 완료):
  Phase 1~5 ✅
  UFW + Fail2Ban + Nginx + Promtail + Loki + Grafana (8 패널)

Phase 6 — 관제실 완성 (성 자체 완성):
  Grafana 알림 설정 (Contact Point + Alert Rules)
  → 이상 징후 발생 시 자동 알림

GeoIP 지도 — 관제 품질 향상 (성 자체):
  MaxMind GeoLite2 + Grafana Geomap 패널
  → "중국/러시아 IP에서 집중 공격 중" 직관적 시각화

ModSecurity 도입 — 성문 검문소 설치 (성 자체 확장):
  Nginx 모듈로 WAF 레이어 추가
  → 웹 공격 패턴 탐지/차단 + 로그 → Promtail 수집

Wazuh 도입 — 내부 감시 카메라 설치 (성 안 감시 시작):
  HIDS 에이전트 설치
  → 파일 무결성 감시, 프로세스 이상 탐지
  → MITRE ATT&CK 전술 자동 매핑
  → 성 자체에서 성 안 경계로 진입

CALDERA 활용 — 성 밖에서 성 자체를 테스트 (영역 연결):
  Wazuh 설치 후 공격 시뮬레이션 실행
  → 탐지 누락 룰 식별 → 커스텀 룰 보강
  → "성 밖" 지식이 "성 자체" 강화에 기여하는 구조
```

---

## 5. 정리

| 질문 | 답 |
|------|---|
| 이 프로젝트는 어떤 영역인가? | 성 자체 — Security Engineering & Ops |
| 지금 무엇을 만들고 있는가? | 성 전체 CCTV 네트워크 + 관제실 (SIEM) |
| 성 밖(공격) 커리큘럼은 왜 간접적으로 유용한가? | 공격 기법을 알아야 ModSecurity 룰을 제대로 작성할 수 있다 |
| 성 안(IR) 커리큘럼은 언제부터 유효한가? | Wazuh 도입 이후 — 내부 침입 행동이 보여야 분석 대상이 생긴다 |
| 현재 가장 급한 작업은? | Phase 6 알림 설정 — 지금은 관제실에 화면만 있고 경보음이 없다 |
