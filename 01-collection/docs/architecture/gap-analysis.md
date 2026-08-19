# 보안 스택 공백 분석 및 도입 검토

> 최종 업데이트: 2026-03-12

---

## 현재 스택 vs 오픈소스 보안 지형도 비교

| 분야 | 대표 도구 (외부 기준) | 현재 프로젝트 | 상태 | 비고 |
|------|----------------|--------------|------|------|
| **SIEM / 로그 분석** | Wazuh, ELK Stack | Wazuh + Loki + Grafana | 커버됨 | ELK 대신 Loki로 대체. 경량화 선택 |
| **시스템 메트릭** | — | Prometheus + Node Exporter | 커버됨 | 제시 목록에 없지만 보유 중 |
| **웹 방화벽 (WAF)** | ModSecurity, SafeLine | ModSecurity + nginx | 커버됨 | SafeLine은 불필요 (중복) |
| **네트워크 IDS/IPS** | Snort, Suricata | 없음 | **미보유** | 네트워크 레벨 패킷 감시 공백 |
| **컨테이너 취약점 스캔** | Trivy, Falco | 없음 | **미보유** | 컨테이너 이미지 점검 공백 |
| **코드 보안 (SAST)** | Semgrep, Gitleaks | 없음 | 불필요 | CI/CD 파이프라인 없으면 실익 없음 |
| **인증 (IAM)** | Keycloak, FreeIPA | Tailscale (VPN 인증) | 부분 커버 | 단일 서버 구성엔 과한 솔루션 |
| **호스트 자동 차단** | — | fail2ban + UFW | 커버됨 | 보유 중 |

---

## Trivy 도입 검토

### 역할

컨테이너 이미지, OS 패키지, 의존성 파일에서 **알려진 CVE 취약점을 스캔**하는 도구.
Aqua Security에서 개발. Apache 2.0 라이센스.

### 현재 프로젝트에 뭐가 달라지나

현재 운영 중인 컨테이너:

```
loki:2.9.4 / promtail:2.9.4 / grafana:10.3.3
prometheus:latest / node-exporter:latest / wazuh-manager:4.14.3
```

이 이미지들 안에 깔린 OS 패키지, 라이브러리 중 CVE가 등록된 취약점이 얼마나 있는지
현재는 **전혀 모르는 상태**다. Trivy를 추가하면:

- 각 이미지별 CVE 목록, 심각도(CRITICAL/HIGH/MEDIUM/LOW) 확인 가능
- `latest` 태그로 고정된 prometheus, node-exporter의 실제 취약점 여부 파악
- 이미지 업데이트 시점 근거 데이터 확보

### 구체적 효과

| 항목 | 도입 전 | 도입 후 |
|------|--------|--------|
| 컨테이너 내부 취약점 인지 | 불가 | CVE ID + 심각도 + 수정 버전 확인 |
| 이미지 업데이트 근거 | 감(感)에 의존 | 데이터 기반 판단 |
| 공급망 공격 대응 | 없음 | 악의적으로 패키징된 라이브러리 탐지 가능 |
| 컴플라이언스 증거 | 없음 | 스캔 결과 리포트 보관 가능 |

### 수정 범위 — 매우 작음

Trivy는 **에이전트 없이 CLI 단독 실행** 가능. 현재 구조 변경 없이 추가 가능.

```bash
# 즉시 사용 가능 (설치 후)
trivy image grafana/grafana:10.3.3
trivy image wazuh/wazuh-manager:4.14.3
```

정기 스캔이 필요하다면 systemd timer 또는 cron으로 스케줄링 후 결과를 파일로 저장.
Loki로 스캔 결과 로그를 흘려보내면 Grafana 대시보드에서 시각화도 가능.

**변경이 필요한 파일: 없음 (docker-compose.yml 수정 불필요)**
선택적으로 systemd timer 1개 추가 정도.

### 현재 프로젝트와의 통합성

매우 높음. 특히:

- Wazuh SCA(보안 구성 평가)가 OS 레벨 취약점을 보는 반면, Trivy는 **컨테이너 이미지 레벨**을 봄 → 서로 사각지대 없이 보완
- 스캔 결과 JSON을 Promtail로 수집 → Loki 저장 → Grafana 알람으로 연결 가능

---

## Suricata 도입 검토

### 역할

네트워크 인터페이스를 통과하는 **패킷을 실시간 분석**해서 침입 시도, 이상 트래픽, 알려진 공격 패턴을 탐지하는 NIDS/NIPS.
OISF(Open Information Security Foundation) 운영. GPL v2 라이센스.

### 현재 프로젝트에 뭐가 달라지나

현재 Wazuh는 **호스트 내부**(파일, 프로세스, 로그)를 봄.
하지만 네트워크 레벨에서 무슨 패킷이 오가는지는 **아무도 보지 않고 있음**.

예를 들어 지금 구조에서 탐지 불가능한 시나리오:

- 포트 스캔 (nmap)이 들어와도 fail2ban은 인증 실패가 없으면 무반응
- C2(Command & Control) 통신 패턴
- DNS exfiltration (데이터를 DNS 쿼리에 숨겨서 유출)
- 알려진 익스플로잇 패턴 (CVE 기반 공격 시그니처)

Suricata를 추가하면 이 모든 것을 **네트워크 레이어에서** 탐지 가능.

### 구체적 효과

| 항목 | 도입 전 | 도입 후 |
|------|--------|--------|
| 포트 스캔 탐지 | fail2ban (인증 실패 기반만) | 패킷 레벨 즉시 탐지 |
| 알려진 공격 패턴 | 없음 | ET(Emerging Threats) 룰셋 기반 시그니처 탐지 |
| 이상 트래픽 탐지 | 없음 | 비정상 프로토콜, 비정상 대역폭 탐지 |
| 아웃바운드 이상 탐지 | 없음 | C2 통신, 데이터 유출 시도 탐지 |
| 네트워크 가시성 | 없음 | 전체 트래픽 플로우 기록 (eve.json) |

### 수정 범위 — 중간 수준

호스트에 직접 설치해야 함 (컨테이너 내부로 넣기엔 네트워크 인터페이스 접근 권한 문제).

```
# 추가/수정 필요 항목
1. 호스트에 suricata 패키지 설치
2. 네트워크 인터페이스 설정 (eth0 또는 실제 NIC 이름 확인 필요)
3. 룰셋 설정 (suricata-update로 ET 룰셋 다운로드)
4. eve.json 로그 → Promtail 수집 설정 추가 (promtail-config.yml 수정)
5. Grafana 대시보드 패널 추가
```

**변경이 필요한 파일:**
- `config/promtail-config.yml` — eve.json 수집 경로 추가
- Grafana 대시보드 JSON — Suricata 이벤트 패널 추가
- systemd 유닛 파일 — suricata.service 관리

### 현재 프로젝트와의 통합성

높음. 단 주의할 점:

- **Wazuh와 역할 분리가 명확함** → Wazuh(호스트 내부) + Suricata(네트워크) 완전 보완 관계
- eve.json 포맷이 구조화된 JSON이라 **Loki + Grafana 파이프라인에 자연스럽게 통합됨**
- 단, 리소스 사용량 증가 (패킷 캡처는 CPU/메모리 부담 있음). 소규모 서버라면 성능 모니터링 필요

---

## 도입 우선순위 정리

| 도구 | 도입 난이도 | 효과 | 현재 프로젝트 통합성 | 권장 여부 |
|------|------------|------|-------------------|----------|
| **Trivy** | 낮음 (CLI 추가) | 컨테이너 CVE 가시성 확보 | 매우 높음 | **즉시 도입 권장** |
| **Suricata** | 중간 (호스트 설치 + 설정) | 네트워크 사각지대 해소 | 높음 | **여유 있을 때 도입 권장** |

---

## 도입 후 전체 아키텍처 변화

```
[네트워크 레이어]
  Suricata (NIC 감시) → eve.json
        ↓
[호스트 레이어]
  Wazuh Agent (파일/프로세스/로그) → Wazuh Manager
  fail2ban + UFW (자동 차단)
  nginx + ModSecurity (WAF)
        ↓
[수집/저장 레이어]
  Promtail (로그 수집: syslog, nginx, suricata, wazuh)
  Node Exporter (메트릭 수집)
        ↓
[저장소]
  Loki (로그) / Prometheus (메트릭)
        ↓
[시각화/알람]
  Grafana Dashboard + Alerting

[정적 분석]
  Trivy (스케줄 스캔: 컨테이너 CVE)
```


## 추가 질의

```

1. Root 따이면 끝
맞습니다. 그 이후는 보안의 영역이 아니라 사고 대응(IR) 의 영역입니다. 현실적으로 할 수 있는 건 사전에 스냅샷/백업을 주기적으로 떠두는 것 정도고, 보안 도구로 막을 수 있는 수준이 아닙니다.

2. 알림/리포트
코드 없습니다. Grafana Alerting에서 SMTP 설정만 추가하면 메일 알림은 붙일 수 있습니다. 별도로 구현하신 게 있으면 가져와서 붙이면 됩니다.

3. 위협 인텔리전스
네, 맞습니다. AbuseIPDB, Emerging Threats 같은 곳에서 전 세계에서 수집된 악성 IP/도메인 피드를 실시간으로 받아서 차단하는 구조입니다. Suricata가 ET 룰셋을 쓰는 게 이미 이 개념의 일부입니다.

4. 제로데이
맞습니다. 시그니처 기반 도구로는 원천 불가능하고, 국가 단위 APT도 제로데이 앞에서는 탐지가 사후에나 됩니다. 현실적인 목표는 "막는 것"이 아니라 "빨리 아는 것"입니다.

```