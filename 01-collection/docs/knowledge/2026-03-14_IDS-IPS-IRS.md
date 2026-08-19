# 침입 탐지 / 차단 / 대응 시스템 현황 (2026-03-14)

## 개요

보안 시스템은 크게 3개 레이어로 구분됩니다.

| 레이어 | 개념 | 현재 상태 |
|--------|------|-----------|
| IDS (침입 탐지 시스템) | 공격을 감지하고 기록 | ✅ 잘 구현됨 |
| IPS (침입 차단 시스템) | 공격을 실시간 차단 | ⚠️ 일부만 구현 |
| IRS (침입 대응 시스템) | 탐지 후 자동/수동 대응 | ❌ 미구현 |

---

## 1. 침입 탐지 (IDS) — ✅ 잘 되어 있음

| 도구 | 유형 | 역할 |
|------|------|------|
| Zeek | NIDS | 네트워크 행위 분석 (conn/dns/http/ssl/notice/weird 로그) |
| Suricata | NIDS | 시그니처 기반 네트워크 위협 탐지 (EVE JSON) |
| Wazuh | HIDS | 호스트 로그 분석, FIM, 프로세스 모니터링, sudo 감시 |
| Promtail + Loki + Grafana | 로그 SIEM | 전체 로그 수집·가시화·알람 |

NIDS(네트워크 기반)와 HIDS(호스트 기반) 모두 오픈소스로 구현된 상태.

---

## 2. 침입 차단 (IPS) — ⚠️ 일부만

| 도구 | 차단 여부 | 비고 |
|------|-----------|------|
| UFW + ipset KR-ONLY | ✅ 차단 | L3 방화벽. 비한국 IP 원천 차단 |
| fail2ban | ✅ 차단 | 로그 기반 자동 IP 밴 (SSH, nginx 등) |
| ModSecurity WAF | ✅ 차단 | HTTP 요청 레벨 차단 (OWASP CRS) |
| Suricata | ❌ 탐지만 | **IDS 모드** 실행 중. IPS 모드 전환 가능 |
| Zeek | ❌ 탐지만 | 분석 전용 설계. 차단 기능 없음 |
| Wazuh Active Response | ❌ 미설정 | 기능은 내장되어 있으나 활성화 안 됨 |

### Suricata IPS 모드 전환 방법 (참고)

현재 IDS 모드 → IPS 모드로 전환 시 Suricata가 실시간 패킷 차단 가능.

```bash
# af-packet inline 모드 (suricata.yaml)
af-packet:
  - interface: eth0
    copy-mode: ips
    copy-iface: eth0
```

> 주의: IPS 모드는 네트워크 구조 변경이 필요하고 오탐 시 서비스 차단 위험이 있음.
> 홈서버 환경에서는 신중하게 전환 권장.

---

## 3. 침입 대응 (IRS / SOAR) — ❌ 미구현

현재 프로젝트에 없는 레이어. 오픈소스 도구 목록:

| 도구 | 역할 | RAM 사용량 | 특징 |
|------|------|-----------|------|
| **Wazuh Active Response** | 즉각 대응 (내장) | 추가 없음 | 이미 설치된 Wazuh에서 설정만 추가. 가장 현실적 |
| **Shuffle** | SOAR (보안 자동화) | ~2GB | 드래그&드롭 플레이북, Wazuh/Suricata 연동 |
| **TheHive** | 인시던트 관리 플랫폼 | ~3~4GB | Alert → Case → Task 워크플로우 |
| **Cortex** | 자동 분석/대응 엔진 | ~2GB | TheHive 연동, IP 평판 조회, 자동 차단 |
| **MISP** | 위협 인텔리전스 | ~2GB | IOC(침해지표) DB, Suricata 룰 자동 생성 |
| **Velociraptor** | DFIR (디지털 포렌식) | ~1GB | 침해 후 증거 수집·분석 |

### 현실적 다음 단계 (서버 RAM 15GB 기준)

**1순위 — Wazuh Active Response 활성화 (추가 리소스 없음)**

```xml
<!-- /var/ossec/etc/ossec.conf -->
<active-response>
  <command>firewall-drop</command>
  <location>local</location>
  <rules_id>5710,5712</rules_id>  <!-- SSH 브루트포스 -->
  <timeout>600</timeout>
</active-response>
```

탐지(Wazuh rule 발동) → 자동 차단(iptables DROP) 파이프라인 완성.

**2순위 — Shuffle SOAR (Docker, ~2GB 추가)**

Wazuh webhook → Shuffle → Slack 알람 + IP 자동 차단 플레이북.

**3순위 — TheHive + Cortex (여유 있을 때)**

인시던트 티켓 관리, 사후 분석 필요 시.

---

## 종합 평가

```
탐지 (IDS):  ████████████████████ 80%  ← 잘 되어 있음
차단 (IPS):  ████████████░░░░░░░░ 60%  ← 방화벽/WAF는 있으나 NIDS 연계 차단 미완
대응 (IRS):  ████░░░░░░░░░░░░░░░░ 20%  ← Wazuh 설정만 남은 상태
```

> 현재 구조는 "보고 기록하는" 시스템은 잘 갖춰져 있으나,
> "보고 즉시 막고 대응하는" 자동화 파이프라인이 부족한 상태.
> Wazuh Active Response 설정이 가장 빠른 개선 방법.
