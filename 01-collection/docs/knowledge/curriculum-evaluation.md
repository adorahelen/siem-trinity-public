# 보안 교육 커리큘럼 프로젝트 적용성 평가

> 작성일: 2026-03-10
> 평가 기준: 현재 security-log-monitor 프로젝트(Promtail → Loki → Grafana 스택)에 직접 기여하는가

---

## 평가 요약표

| 커리큘럼 | 핵심 도구 | 전반적 관련성 | 비고 |
|---------|---------|------------|------|
| Snort IDS/IPS (10일) | Snort | 🔶 낮음 | 아키텍처 레이어 불일치 |
| Post Exploitation + 웹 보안 (10일) | nmap, SQLmap, Burp | 🔶 낮음~🟡 중간 | 웹 공격 섹션은 ModSecurity 도입 후 연결 |
| OPNSense + ModSecurity (10일) | OPNSense, ModSecurity | 🟡 중간~✅ 높음 | ModSecurity 섹션은 직접 적용 가능 |
| Wazuh XDR (10일) | Wazuh | ✅ 높음 | FuturePlan 6순위와 직접 연결 |
| MITRE ATT&CK + CALDERA (10일) | CALDERA | 🔶 낮음~🟡 중간 | Wazuh 도입 후 검증 용도로 유효 |

---

## 1. Snort IDS/IPS 커리큘럼

### 내용
- Snort 룰 기본 구조, 실습 환경 구성
- 관리자 페이지 접근 탐지, HTTP 페이로드 탐지
- 브라우저 익스플로잇, PCRE 기반 C2 탐지
- Threshold 옵션으로 DDoS·포트스캔·브루트포스 탐지

### 평가: 🔶 낮음

현재 스택과 아키텍처 레이어가 다름.

| 항목 | 판단 |
|------|------|
| 관리자 페이지 탐지 | Nginx access.log로 이미 수집 중, ModSecurity가 더 적합 |
| Threshold 탐지 | Fail2Ban이 동일 역할 수행 중 |
| C2/DGA 탐지 | Tailscale(WireGuard 암호화) 환경에서 패킷 내용 열람 불가 |
| 네트워크 인라인 배치 | 홈서버 단일 노드, 토폴로지 변경 불가 |

> 자세한 내용 → [snort-overview.md](snort-overview.md)

---

## 2. Post Exploitation + 윈도우 UAC + 웹 보안 커리큘럼

### 내용
- ARP/포트 스캐닝, 프로토콜 터널링, SSH 포워딩
- Fodhelper UAC Bypass (Windows)
- HTTP 구조, SQLi, XSS, LFI/RFI, 파일 업로드 취약점

### 평가별 분류

**Windows UAC Bypass (2일): ❌ 없음**
대상 서버가 Ubuntu 24.04.3 LTS. Windows 전용 기법으로 적용 불가.

**Post Exploitation 네트워크 스캐닝 (2일): 🔶 낮음**

| 주제 | 현재 스택과의 관계 |
|------|-----------------|
| ARP 스캐닝 | 네트워크 패킷 레이어 → 현재 스택 탐지 불가 |
| 포트 스캐닝 | UFW 로그에 일부 흔적 → 이미 수집 중 |
| SSH 포워딩/터널링 | auth.log에 세션 기록되나 터널링 자체 구분 불가 |

**웹 보안 (6일): 🟡 중간**

| 공격 유형 | 현재 로그에서 보이는 것 | 한계 |
|----------|----------------------|------|
| SQL Injection | URL에 SELECT, UNION 포함 요청 → access.log에 남음 | 성공/실패 구분 불가 |
| LFI | `../../etc/passwd` 형태 경로 → access.log에 남음 | 탐지 룰 없으면 지나침 |
| 파일 업로드 | POST 요청 → access.log에 남음 | 업로드 성공 여부 모름 |
| XSS | 응답 단에서 발생 → 로그에 거의 안 남음 | 현재 스택 탐지 어려움 |

웹 공격 섹션은 **ModSecurity 도입 후** CRS 룰 이해와 커스텀 룰 작성에 직접 활용 가능.

---

## 3. OPNSense + ModSecurity 커리큘럼

### 내용
- OPNSense 방화벽: IP 기반 접근 통제, IPS 플러그인, Outbound NAT
- ModSecurity WAF: 개요, 룰셋 문법(ARGS, REQUEST_URI), XSS·명령어 삽입·LFI/RFI 탐지

### 평가별 분류

**OPNSense (3일): 🔶 낮음**

OPNSense는 전용 네트워크 어플라이언스 OS. 현재 UFW로 커버 중이며 별도 배치 불가.

| 조건 | 현재 상황 |
|------|---------|
| 네트워크 앞단 배치 필요 | 홈서버 단일 노드, 토폴로지 변경 불가 |
| 방화벽 역할 | UFW가 이미 담당 |
| IPS 플러그인 (Suricata) | Snort와 동일한 이유로 현재 환경 부적합 |

**ModSecurity (7일): ✅ 높음**

FuturePlan.md 5순위 항목이 ModSecurity 도입. 커리큘럼 내용이 직접 매핑됨.

| 커리큘럼 내용 | 프로젝트 적용 지점 |
|------------|----------------|
| WAF 개요 | ModSecurity + nginx 모듈 구조 이해 |
| 룰셋 문법 (ARGS, REQUEST_URI) | 커스텀 룰 작성에 직접 필요 |
| XSS 탐지 | nginx 앞단 스크립트 삽입 차단 |
| 명령어 삽입 탐지 | 웹셸 실행 시도 차단 |
| LFI/RFI 탐지 | 경로 탐색 공격 차단 |

ModSecurity 도입 후 로그 → Promtail 수집 → Loki 저장 → Grafana 시각화로 현재 스택에 자연스럽게 연결.

---

## 4. Wazuh XDR 커리큘럼

### 내용
- Wazuh 소개, 아키텍처, 에이전트 설치
- Windows/Linux 로그 수집·분석
- 디코더·룰 이해 및 실습
- MITRE ATT&CK 매핑, FIM(파일 무결성 감시) 실습
- 공격 시나리오 실습

### 평가: ✅ 높음

FuturePlan.md 6순위 항목이 Wazuh(HIDS) 도입. 커리큘럼 전체가 직접 연결됨.

| 섹션 | 기여도 | 비고 |
|------|--------|------|
| 아키텍처·에이전트 설치 | ✅ 높음 | Ubuntu 서버에 직접 설치 |
| Linux 로그 수집·분석 | ✅ 높음 | 현재 수집 중인 로그와 동일 소스 |
| Windows 로그 | ❌ 없음 | OS 미스매치 |
| 디코더·룰 | ✅ 높음 | 커스텀 탐지 룰 작성에 필요 |
| FIM 실습 | ✅ 매우 높음 | 현재 스택의 핵심 공백 해소 |
| MITRE ATT&CK 매핑 | 🟡 중간 | 탐지 이벤트 해석에 필요한 컨텍스트 |
| 시나리오 실습 | ✅ 높음 | 실제 환경 적용 준비 |

**Wazuh 도입 시 고려사항:**

```
옵션 A: Wazuh 단독 운영
  → Wazuh 대시보드(OpenSearch)로 HIDS 이벤트 확인
  → 현재 Grafana는 네트워크/OS 로그 담당 (UI 분리)

옵션 B: Wazuh → Loki → Grafana 통합
  → Wazuh 에이전트 로그를 Promtail로 수집
  → 기존 Grafana 대시보드에서 통합 확인 (구성 복잡)
```

---

## 5. MITRE ATT&CK + BAS + CALDERA 커리큘럼

### 내용
- MITRE ATT&CK 프레임워크 이해·활용
- BAS(Breach and Attack Simulation) 솔루션 개요
- CALDERA: 공격 시뮬레이션 시나리오 (정보수집 → 권한상승 → 측면이동 → 데이터 유출)

### 평가: 🔶 낮음 (지금) → 🟡 중간 (Wazuh 도입 후)

**MITRE ATT&CK (1일): 🟡 중간**
Wazuh가 탐지 이벤트를 ATT&CK 전술에 자동 매핑하므로, Wazuh 도입 후 필수 선행 지식.

**BAS 솔루션 (1일): 🔶 낮음**
엔터프라이즈 도입 전략 중심. 개념 이해는 유용하나 홈서버에 직접 적용 어려움.

**CALDERA (8일): 🔶 낮음 → 🟡 중간**

CALDERA는 공격을 시뮬레이션해서 방어 도구가 탐지하는지 검증하는 도구.

현재 스택 대상 CALDERA 시나리오 탐지 가능 여부:

| 시나리오 | 현재 탐지 가능? | Wazuh 도입 후 |
|---------|--------------|-------------|
| 정보수집 (포트스캔, 계정 열거) | 부분적 | ✅ |
| 권한상승·퍼시스턴스 | ❌ | ✅ |
| 측면이동 (Lateral Movement) | ❌ | ❌ (단일 서버, 의미 없음) |
| 데이터 수집·유출 | ❌ | 부분적 |

> Wazuh 설치 완료 후 CALDERA로 시뮬레이션을 돌리면, 어떤 공격이 탐지되고 어떤 공격이 누락되는지 직접 확인 가능 → 탐지 룰 개선에 활용.

---

## 프로젝트 로드맵과 커리큘럼 연결

```
현재 즉시 착수:
  Phase 6 알림 설정 (Grafana Contact Point / Alert Rules)
  → 어떤 커리큘럼과도 직접 연결 없음, 지금 바로 실행 가능

ModSecurity 도입 후 (5순위):
  → OPNSense+ModSecurity 커리큘럼 Day 4~10 직접 활용
  → 웹 보안 커리큘럼 (SQLi, LFI 등) 내용도 연결

Wazuh 도입 후 (6순위):
  → Wazuh XDR 커리큘럼 전체 활용
  → MITRE ATT&CK 커리큘럼 선행 학습 후 Wazuh 대시보드 해석
  → CALDERA로 탐지 룰 검증 가능
```
