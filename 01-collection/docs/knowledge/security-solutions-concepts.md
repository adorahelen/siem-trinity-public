# 보안 솔루션 개념 정리

> 작성일: 2026-03-10

---

## 보안 레이어 전체 구조

```
[인터넷]
    ↓
[방화벽 / Firewall]     ← 포트/IP 단위 접근 제어 (UFW, iptables, OPNSense)
    ↓
[IDS/IPS]              ← 패킷 내용 검사, 공격 패턴 탐지/차단 (Snort, Suricata)
    ↓
[WAF]                  ← HTTP 페이로드 검사 (ModSecurity)
    ↓
[서버 / 엔드포인트]
    ↓
[EDR]                  ← 서버 내부 행동 감시 (Wazuh, CrowdStrike)
```

각 도구는 담당 레이어가 다르며, 단일 도구로 전부 커버하는 올인원은 없다.
보안의 기본 원칙은 **레이어를 겹쳐 쌓는 구조(Defense in Depth)**.

---

## EDR (Endpoint Detection and Response)

단일 호스트 내부를 들여다보는 도구.

- 프로세스 생성/종료, 파일 접근, 레지스트리 변경, 네트워크 연결 등 **엔드포인트 행동** 수집
- 악성 행위 패턴 탐지 → 격리(quarantine), 프로세스 강제 종료
- 대표 제품: CrowdStrike Falcon, SentinelOne, Microsoft Defender for Endpoint
- 오픈소스: **Wazuh** (이 프로젝트 6순위 도입 예정)

EDR이 못 하는 것: 네트워크 경계 밖, 패킷이 들어오기 전 단계

---

## XDR (Extended Detection and Response)

EDR을 여러 보안 레이어로 확장한 개념.

```
EDR:  [엔드포인트] 만 봄

XDR:  [엔드포인트]
    + [네트워크 트래픽 (NDR)]
    + [이메일]
    + [클라우드 워크로드]
    + [ID/인증 시스템]
    → 이 모든 데이터를 하나의 플랫폼에서 연관 분석
```

핵심 차별점: **상관 분석(Correlation)**

| 상황 | EDR만 있을 때 | XDR이 있을 때 |
|------|------------|------------|
| 피싱 메일 → VPN 로그인 → 파일 유출 | 각 도구가 따로 경보, 연결 못 함 | 하나의 공격 체인으로 묶어서 경보 |
| 내부 호스트 A → B → C 횡이동 | 각 EDR이 개별 이벤트만 봄 | 네트워크 + 호스트 데이터 합쳐서 경로 추적 |

---

## SIEM vs XDR

| | SIEM | XDR |
|--|------|-----|
| 주 목적 | 로그 수집·저장·검색·규정 준수 | 위협 탐지·자동 대응 |
| 데이터 소스 | 뭐든 다 받음 (로그 파일, syslog 등) | 전용 에이전트가 수집한 구조화 데이터 |
| 대응 | 알림만, 사람이 조사 | 자동 격리·차단·프로세스 킬 |
| 상관 분석 | 룰 직접 작성 필요 | AI/ML 기반 자동 분석 |
| 대표 제품 | Splunk, Elastic SIEM, Grafana+Loki | CrowdStrike, SentinelOne, Microsoft XDR |

```
SIEM:  로그 수집 → 분석 → 알림 → [사람이 조사 후 조치]
XDR:   데이터 수집 → 분석 → 알림 → [자동으로 격리/차단]
```

> XDR은 "자동 대응이 붙은 SIEM"이라고 봐도 크게 틀리지 않음.

---

## SOAR (Security Orchestration, Automation and Response)

| | SOAR | XDR |
|--|------|-----|
| 핵심 역할 | **워크플로우 자동화** | **탐지 + 대응** |
| 데이터 수집 | 직접 안 함, 다른 도구에서 받음 | 전용 에이전트로 직접 수집 |
| 자동화 방식 | Playbook (사람이 로직 작성) | AI/ML이 판단 |
| 통합 범위 | SIEM, 티켓, Slack, 방화벽 API 등 외부 도구 연결 | 자체 플랫폼 내에서 처리 |
| 대표 제품 | Splunk SOAR, Palo Alto XSOAR | CrowdStrike, SentinelOne |

비유:
```
SIEM:  CCTV 녹화실 (다 기록함)
XDR:   CCTV + 경비원 (보고 바로 잡음)
SOAR:  경비원 업무 매뉴얼 자동화
       (침입 감지 시 → 경찰 신고 → 티켓 생성 → Slack 알림 → 방화벽 차단 API 호출)
```

XDR이 "공격 탐지" → SOAR가 이어받아 크로스 플랫폼 워크플로우 실행.
대기업 SOC에서는 XDR + SOAR를 함께 사용.

---

## 이 프로젝트의 현재 위치

```
현재:   SIEM (Loki + Grafana)
         → 로그 수집, 시각화, 알림 (Phase 6 완료 시)
         → 대응은 사람이 직접

확장 시: Wazuh 추가 → SIEM + EDR 혼합 구성
         ModSecurity 추가 → WAF 레이어 추가
         → XDR 방향으로 점진적 발전
```

> Snort 개요 및 프로젝트 적용 판단 → [snort-overview.md](snort-overview.md) 참고
