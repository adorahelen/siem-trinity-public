# OWASP Top 10 방어력 평가 (Coverage Assessment)

> 기준일: 2026-03-13
> 대상 스택: `UFW` + `fail2ban` + `nginx + ModSecurity` + `Suricata(IDS)` + `Wazuh` + `Loki/Promtail/Grafana`

---

## 종합 요약 (Summary)

| # | 항목 (Item) | 방어 수준 | 핵심 도구 | 주요 공백 |
|---|---|:---:|---|---|
| A01 | Broken Access Control (접근 제어 실패) | 35% | ModSecurity, Wazuh FIM | 앱 로직 레벨 IDOR |
| A02 | Cryptographic Failures (암호화 실패) | 30% | nginx TLS | Zeek 없으면 TLS 가시성 없음 |
| A03 | Injection (인젝션) | **65%** | **ModSecurity CRS** | 오탐 튜닝 필요 |
| A04 | Insecure Design (안전하지 않은 설계) | 0% | — | 설계 레벨, 도구로 불가 |
| A05 | Security Misconfiguration (보안 설정 오류) | 45% | Wazuh SCA | Trivy 미도입 |
| A06 | Vulnerable and Outdated Components (취약하고 오래된 컴포넌트) | 20% | Wazuh (OS) | **Trivy 없음** |
| A07 | Identification and Authentication Failures (인증 실패) | 55% | fail2ban, Tailscale | 세션 탈취, MFA 없음 |
| A08 | Software and Data Integrity Failures (소프트웨어 및 데이터 무결성 실패) | 45% | Wazuh FIM | auditd 미연동 |
| A09 | Security Logging and Monitoring Failures (보안 로깅 및 모니터링 실패) | **70%** | **Loki + Grafana** | Slack 미연결, Wazuh Agent 불안정 |
| A10 | Server-Side Request Forgery — SSRF (서버 사이드 요청 위조) | 35% | ModSecurity | UFW 아웃바운드 미설정 |

**전체 평균: ~40%**

---

## 항목별 상세

### A01 — Broken Access Control (접근 제어 실패)

| 방어 수단 | 역할 |
|---|---|
| ModSecurity (CRS) | 경로 순회(`../`), 강제 브라우징 탐지 |
| UFW | 미오픈 포트 원천 차단 |
| Wazuh FIM | 민감 파일(`/etc/passwd`, sudoers) 무단 변경 탐지 |

**공백:** 애플리케이션 레벨 권한 로직(인증 우회, IDOR)은 WAF로 탐지 불가. 코드가 없으면 방어도 없다.

**방어 수준: 35%** — 탐지(경로 순회, 파일 변경)만 가능, 앱 로직 레벨은 사각지대

---

### A02 — Cryptographic Failures (암호화 실패)

| 방어 수단 | 역할 |
|---|---|
| nginx TLS 설정 | TLS 1.2/1.3, 강한 cipher suite 강제 가능 |
| Suricata | 알려진 취약 TLS 패턴(SSLv3, 만료 인증서 등) alert |
| Zeek (미구현) | TLS 버전/cipher/JA3 fingerprint 가시성 확보 예정 |

**공백:** nginx TLS 설정이 실제로 올바른지 검증하는 도구 없음. Zeek 없으면 "어떤 TLS 버전으로 접속했는지" 볼 수 없음.

**방어 수준: 30%** — 인프라 TLS는 nginx 설정에 달려있고, 앱 내부 암호화 취약점은 탐지 불가

---

### A03 — Injection (인젝션)

| 방어 수단 | 역할 |
|---|---|
| **ModSecurity CRS** | SQL Injection, XSS, Command Injection, LDAP Injection 룰셋 내장 |
| Suricata ET 룰셋 | 알려진 익스플로잇 페이로드 패턴 탐지 |
| Wazuh | 웹 로그 기반 인젝션 시도 상관분석 |

**핵심:** CRS가 정상 활성화되어 있다면 이 항목은 가장 잘 방어된다. ModSecurity는 이를 위해 만들어진 도구다.

**방어 수준: 65%** — ModSecurity CRS가 대부분의 알려진 패턴 차단. 오탐 튜닝이 충분히 되어있다는 전제 하에

---

### A04 — Insecure Design (안전하지 않은 설계)

방어 가능한 도구 없음. 설계 단계의 문제로, 런타임 보안 도구는 이를 탐지하거나 방어할 수 없다.

**방어 수준: 0%** — 구조적 문제는 코드/설계 레벨에서만 해결 가능

---

### A05 — Security Misconfiguration (보안 설정 오류)

| 방어 수단 | 역할 |
|---|---|
| Wazuh SCA | OS, SSH, Docker 등 잘못된 설정 자동 탐지 |
| UFW | 불필요 포트 노출 방지 |
| ModSecurity | HTTP 헤더 노출, 디버그 페이지 노출 탐지 |
| Trivy (미구현) | 컨테이너 이미지 내 잘못된 패키지/설정 탐지 |

**공백:** Grafana, Loki, Prometheus 자체의 설정 오류(무인증 노출 등)를 감시하는 도구 없음. Trivy 없으면 컨테이너 설정 취약점 모름.

**방어 수준: 45%** — Wazuh SCA가 OS 레벨은 커버, 컨테이너/앱 레벨은 Trivy 없이 공백

---

### A06 — Vulnerable and Outdated Components (취약하고 오래된 컴포넌트)

| 방어 수단 | 역할 |
|---|---|
| Wazuh | OS 패키지 CVE 탐지(SCA/vulnerability detection) |
| Trivy (미구현) | 컨테이너 이미지 내 CVE 목록 제공 |
| Suricata ET 룰셋 | 알려진 CVE 기반 공격 시그니처 탐지 |

**공백:** `loki:2.9.4`, `grafana:10.3.3`, `wazuh:4.14.3` 등 현재 운영 중인 컨테이너 이미지의 CVE 현황을 **전혀 모르는 상태**. Trivy 하나로 즉시 해결 가능.

**방어 수준: 20%** — Trivy 미도입이 가장 큰 공백. 이 항목에서 가장 빠른 개선 가능

---

### A07 — Identification and Authentication Failures (인증 실패)

| 방어 수단 | 역할 |
|---|---|
| fail2ban | 브루트포스 자동 IP 차단 |
| Wazuh | 인증 실패 반복 패턴 탐지, 로그 상관분석 |
| Tailscale | VPN 기반 접근 통제(관리 인터페이스 보호) |
| ModSecurity | 일부 세션/쿠키 조작 탐지 |

**공백:** MFA 없음. 세션 탈취(세션 고정, JWT 조작)는 탐지 불가. 앱 레벨 인증 로직 우회는 WAF로 잡을 수 없음.

**방어 수준: 55%** — 브루트포스 방어는 강함. 세션/토큰 기반 공격은 사각지대

---

### A08 — Software and Data Integrity Failures (소프트웨어 및 데이터 무결성 실패)

| 방어 수단 | 역할 |
|---|---|
| **Wazuh FIM** | 핵심 파일/바이너리 변경 즉시 탐지(해시 비교) |
| Suricata | 알려진 웹쉘 업로드, 악성 다운로드 패턴 탐지 |
| UFW | 아웃바운드 연결 제한으로 악성 스크립트 다운로드 일부 차단 |

**공백:** CI/CD 파이프라인 없으므로 공급망 공격(dependency confusion 등) 방어 없음. 웹쉘 업로드 후 실행은 Wazuh가 `execve` 추적(auditd 연동 시)으로 탐지 가능.

**방어 수준: 45%** — FIM은 이 항목에서 가장 직접적인 방어. auditd 연동 시 60%까지 상승

---

### A09 — Security Logging and Monitoring Failures (보안 로깅 및 모니터링 실패)

이 항목은 이 프로젝트의 **핵심 목적**이다.

| 방어 수단 | 역할 |
|---|---|
| Loki + Promtail | 전체 로그 중앙 수집 |
| Grafana Alerting | 임계치 기반 실시간 알림 |
| Wazuh | 호스트 이벤트 상관분석, 자동 분류 |
| Suricata | 네트워크 레벨 탐지/기록 |

**공백:** Slack Webhook URL 미연결로 알림 파이프라인 미완성. Wazuh Agent 정상 수신 미확인.

**방어 수준: 70%** — 인프라는 갖춰짐. Slack 연동 + Wazuh Agent 안정화 시 85%+

---

### A10 — Server-Side Request Forgery — SSRF (서버 사이드 요청 위조)

| 방어 수단 | 역할 |
|---|---|
| ModSecurity CRS | SSRF 패턴(내부 IP 요청, cloud metadata 엔드포인트) 탐지 |
| UFW 아웃바운드 제한 | 서버에서 내부/외부 임의 요청 제한 가능 |
| Suricata | 비정상 아웃바운드 연결 탐지 |

**공백:** UFW 아웃바운드가 기본적으로 허용 상태라면 SSRF 성공 시 내부 메타데이터 서버(AWS 169.254.169.254 등)로의 접근 가능.

**방어 수준: 35%** — 탐지는 가능하나 차단은 UFW 아웃바운드 룰 설정에 달려있음

---

## 빠른 개선 순서 (Quick Wins)

| 우선순위 | 작업 | 영향 항목 | 난이도 |
|:---:|---|---|:---:|
| 1 | **Trivy 도입** (CLI 추가) | A06 0%→50%+ | 낮음 |
| 2 | **auditd 룰 적용** (`/etc/passwd`, `sudoers`, `execve`) | A01, A08 +15~20%p | 낮음 |
| 3 | **Wazuh Agent 안정화** (정상 이벤트 수신 확인) | A09 완성 | 중간 |
| 4 | **Slack Webhook 연결** | A09 마무리 | 낮음 |
| 5 | **UFW 아웃바운드 제한** | A10 +20%p | 중간 (서비스 영향 검토 필요) |
