# 보안 커버리지 평가 프레임워크 (Security Coverage Assessment Frameworks)

> 기준일: 2026-03-13
> 목적: OWASP Top 10 외 현재 아키텍처 대비 보안 커버리지를 평가할 수 있는 기준점 정리

---

## 개요 (Overview)

| 프레임워크 | 관점 | 현재 프로젝트 적용성 | 난이도 |
|---|---|:---:|:---:|
| MITRE ATT&CK | 공격자 전술/기법 단계별 탐지 여부 | 높음 | 중간 |
| Cyber Kill Chain | 7단계 공격 체인 방어 계층 확인 | 높음 | 낮음 |
| CIS Benchmarks | OS/소프트웨어 하드닝 체크리스트 | 높음 (Wazuh SCA 연동) | 낮음 |
| NIST CSF | 조직 수준 보안 성숙도 5개 기능 평가 | 중간 | 낮음 |
| Pyramid of Pain | 탐지 지표의 질적 수준 평가 | 중간 | 중간 |

> **참고:** OWASP Top 10 평가는 [docs/architecture/owasp-top10-coverage.md](../architecture/owasp-top10-coverage.md) 에 별도 기록.

---

## 1. MITRE ATT&CK

공격자의 **전술(Tactic) × 기법(Technique)** 매트릭스. OWASP가 "웹 취약점 방어율"을 보는 것과 달리, ATT&CK는 "공격자의 행동 단계별로 탐지 가능한가"를 본다.

### 현재 스택 매핑

| ATT&CK 전술 | 현재 탐지 가능 | 공백 |
|---|---|---|
| Reconnaissance (정찰) | Suricata 포트스캔 탐지 | Zeek 없으면 세부 정찰 패턴 불가 |
| Initial Access (초기 침투) | ModSecurity, fail2ban | 제로데이, 피싱 불가 |
| Execution (실행) | Wazuh FIM | auditd 미연동으로 execve 추적 미완성 |
| Persistence (지속성) | Wazuh FIM, crontab 감시 | systemd 유닛 변조 탐지 취약 |
| Privilege Escalation (권한 상승) | Wazuh (sudo 로그) | auditd setuid 탐지 미연동 |
| Defense Evasion (방어 우회) | Wazuh 로그 삭제 감지 | 로그 변조 탐지 한계 |
| Credential Access (자격 증명 탈취) | fail2ban, Wazuh auth 로그 | 메모리 덤프 류 탐지 불가 |
| Discovery (내부 탐색) | Suricata, Wazuh | auditd 없으면 내부 명령 실행 미탐지 |
| Command and Control — C2 (명령제어) | Suricata ET 룰 | DNS 터널링, HTTPS C2는 탐지 제한 |
| Exfiltration (데이터 유출) | Suricata 대역폭 이상 | 암호화 채널 유출 불가 |

### 활용 방법

ATT&CK Navigator(<https://mitre-attack.github.io/attack-navigator/>)에 현재 스택을 색칠하면 시각적으로 어디가 비어있는지 바로 확인 가능.

---

## 2. Cyber Kill Chain (Lockheed Martin)

7단계 공격 체인으로 방어 계층을 확인하는 모델. ATT&CK보다 단순해서 전체 흐름 파악용으로 적합.

### 현재 스택 매핑

```
① Reconnaissance (정찰)      → Suricata 포트스캔 탐지, Zeek(미구현)
② Weaponization (무기화)     → 방어 불가 (공격자 로컬 작업)
③ Delivery (전달)            → ModSecurity, Suricata ET 룰
④ Exploitation (익스플로잇)  → ModSecurity CRS, Suricata CVE 시그니처
⑤ Installation (설치)        → Wazuh FIM, auditd(미연동)
⑥ C2 (명령제어)              → Suricata (일부), Zeek DNS/TLS(미구현)
⑦ Actions on Objectives      → Wazuh, auditd(미연동)
```

### OWASP와의 차이점

- OWASP: "어떤 취약점 유형을 방어하는가"
- Kill Chain: "공격의 어느 단계를 차단하는가"
- 두 프레임워크는 서로 보완적이며 병행 사용 권장

---

## 3. CIS Benchmarks (Center for Internet Security)

OS, 소프트웨어, 클라우드 환경에 대한 하드닝 체크리스트. **Wazuh SCA(Security Configuration Assessment)가 CIS 기준으로 자동 점검**을 수행하므로 현재 프로젝트와 가장 즉시 연결 가능한 프레임워크.

### 현재 프로젝트 관련 벤치마크

| 벤치마크 | 현재 상태 | 확인 방법 |
|---|---|---|
| CIS Ubuntu Linux | Wazuh SCA가 자동 점검 중 | Wazuh → Security Configuration Assessment 탭 |
| CIS Docker | Wazuh SCA Docker 정책 포함 | 동일 |
| CIS nginx | 별도 점검 필요 | 수동 또는 별도 스크립트 |

### 활용 방법

```
Wazuh 대시보드 → Security Configuration Assessment
→ CIS 준수율 확인
→ 점수 낮은 항목 = 즉시 개선 가능한 하드닝 포인트
```

---

## 4. NIST CSF (Cybersecurity Framework)

미국 국립표준기술연구소(NIST)의 5개 기능으로 보안 역량을 평가하는 상위 관점 프레임워크. ATT&CK/OWASP가 기술적 세부 평가라면, CSF는 "조직 수준의 보안 성숙도"를 본다.

### 현재 스택 매핑

| 기능 | 현재 상태 | 평가 |
|---|---|:---:|
| **Identify** (자산/위험 식별) | 인벤토리 없음, Trivy 미도입 | 취약 |
| **Protect** (보호) | UFW, fail2ban, ModSecurity | 보통 |
| **Detect** (탐지) | Suricata, Wazuh, Grafana | 강점 (이 프로젝트의 핵심) |
| **Respond** (대응) | 알림 미완성 (Slack 미연결) | 취약 |
| **Recover** (복구) | 스냅샷/백업 계획 없음 | 공백 |

### 주요 시사점

- **Identify** 강화: Trivy 도입으로 컨테이너 자산 취약점 파악
- **Respond** 강화: Slack Webhook 연결 시 즉시 개선
- **Recover** 강화: 정기 스냅샷 정책 수립 필요 (현재 완전 공백)

---

## 5. Pyramid of Pain

David Bianco의 모델. 탐지 지표(IoC)의 질적 수준을 계층으로 표현. 위로 갈수록 공격자가 바꾸기 어렵고, 탐지 가치가 높다.

```
┌─────────────────────────────────┐
│    TTPs (전술/기법)             │ ← 가장 가치 높음, 공격자 변경 어려움
├─────────────────────────────────┤
│    Tools (도구 특징)            │
├─────────────────────────────────┤
│    Network/Host Artifacts       │
├─────────────────────────────────┤
│    Domain Names                 │
├─────────────────────────────────┤
│    IP Addresses                 │
├─────────────────────────────────┤
│    Hash Values                  │ ← 가장 낮음, 공격자가 쉽게 바꿈
└─────────────────────────────────┘
```

### 현재 스택의 탐지 수준

| 계층 | 현재 탐지 수단 | 수준 |
|---|---|:---:|
| TTPs | Suricata ET 룰셋 일부, Wazuh MITRE 매핑 | 부분 |
| Tools | Suricata UA/도구 시그니처 | 부분 |
| Network Artifacts | Suricata flow/http/dns, Zeek(미구현) | 중간 |
| Domain Names | Suricata DNS, Zeek dns.log(미구현) | 부분 |
| IP Addresses | fail2ban, UFW, Suricata src_ip | 강함 |
| Hash Values | Wazuh FIM (파일 해시) | 강함 |

**현재 스택은 IP/해시/네트워크 아티팩트 수준의 탐지가 주를 이룬다.** auditd + Zeek가 더해져야 Tool/TTP 레벨 탐지가 강해진다.

---

## 프레임워크별 다음 액션

| 프레임워크 | 즉시 가능한 개선 |
|---|---|
| MITRE ATT&CK | ATT&CK Navigator에서 현재 커버리지 색칠 후 공백 기법 목록화 |
| Cyber Kill Chain | ⑤ Installation 단계 강화를 위해 auditd 연동 |
| CIS Benchmarks | Wazuh SCA 탭에서 점수 낮은 항목 즉시 확인 및 수정 |
| NIST CSF | Slack Webhook 연결(Respond), 스냅샷 정책 수립(Recover) |
| Pyramid of Pain | Zeek 도입으로 Network Artifact 레벨 탐지 강화 |
