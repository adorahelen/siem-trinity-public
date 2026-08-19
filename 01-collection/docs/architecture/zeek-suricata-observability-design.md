# Zeek + Suricata 네트워크 가시성 설계안

> 작성일: 2026-03-12
> 대상: `security-log-monitor` (단일 홈서버 + 웹서비스)

---

## 1. 목적

현재 스택은 호스트/애플리케이션 로그 중심이다.  
이번 설계의 목표는 네트워크 레이어까지 확장해 아래 질문에 답할 수 있게 만드는 것이다.

- 누가: 어떤 `src_ip`/ASN/국가에서
- 언제: 어떤 시간대에, 얼마나 자주
- 어떻게: 어떤 프로토콜/DNS/TLS/HTTP 특성으로
- 무슨 목적으로: 스캔/브루트포스/C2 추정/정상 트래픽 여부

핵심 원칙:
- 탐지(차단)는 `Suricata`
- 행위 가시성/포렌식 메타데이터는 `Zeek`
- 원본 패킷(Full PCAP)은 선택적으로 최소 보관

---

## 2. 현재 스택 대비 보완 포인트

현재 보유:
- `UFW + fail2ban + ModSecurity + Wazuh + Loki/Promtail/Grafana`

현재 공백:
- 패킷/세션 단위 네트워크 행위 기록 부재
- 애플리케이션 로그에 남지 않는 스캔/정찰 트래픽 관측 한계
- HTTPS 환경에서 L7 페이로드는 못 보더라도, 접속 메타데이터를 체계적으로 남기는 계층 부재

---

## 3. 목표 아키텍처

```text
[NIC]
  ├─ Suricata (IDS/IPS) -> eve.json
  ├─ Zeek (NSM)         -> conn/dns/http/ssl/weird/*.log
  └─ (선택) tcpdump     -> rolling pcap
            ↓
        Promtail
            ↓
          Loki
            ↓
         Grafana
```

역할 분리:
- `Suricata`: 룰 기반 공격 탐지/차단(alert, drop)
- `Zeek`: 네트워크 세션/프로토콜 메타데이터 생산
- `Promtail`: JSON/TSV 로그 수집 및 라벨링
- `Loki/Grafana`: 쿼리, 대시보드, 알림

---

## 4. 배포 모드 결정

### 4.1 권장 1단계 (안전)

- Suricata: `IDS 모드(alert-only)`
- Zeek: `로깅 모드`
- 차단 정책 없음 (운영 안정성 우선)

### 4.2 권장 2단계 (검증 후)

- Suricata: `IPS 모드(drop)` 일부 룰만 점진 적용
- Zeek: notice 정책(과도 스캔/비정상 DNS 패턴) 알림 연동

주의:
- IPS를 바로 활성화하면 오탐으로 정상 트래픽 차단 가능성이 높다.
- 최소 1~2주 baseline 관측 후 drop 룰을 제한적으로 적용한다.

---

## 5. 수집 데이터 설계

### 5.1 Suricata (eve.json)

필수 이벤트 타입:
- `alert`
- `flow`
- `http`
- `dns`
- `tls`

최소 라벨/필드:
- `src_ip`, `src_port`, `dest_ip`, `dest_port`, `proto`
- `event_type`, `alert.signature`, `alert.severity`, `flow.state`
- `http.hostname`, `url`, `http_user_agent`
- `dns.rrname`, `dns.rrtype`
- `tls.sni`, `tls.version`

### 5.2 Zeek (JSON 출력 권장)

필수 로그:
- `conn.log`
- `dns.log`
- `http.log`
- `ssl.log`
- `notice.log`
- `weird.log`

최소 라벨/필드:
- `id.orig_h`, `id.orig_p`, `id.resp_h`, `id.resp_p`
- `service`, `duration`, `orig_bytes`, `resp_bytes`, `conn_state`
- `query`, `qtype_name`, `answers`
- `host`, `uri`, `method`, `status_code`, `user_agent`
- `server_name(SNI)`, `ja3/ja3s(가능 시)`

### 5.3 (선택) PCAP

용도:
- 사건 발생 시 원본 재분석(Wireshark, Arkime)

권장 보관:
- rolling 방식 24~72시간
- 예시: 1GB x N개 로테이션
- 디스크 초과 방지를 위해 자동 삭제 필수

---

## 6. Promtail 연동 설계

새 job 추가:
- `suricata_eve`
- `zeek_conn`, `zeek_dns`, `zeek_http`, `zeek_ssl`, `zeek_notice`, `zeek_weird`

라벨링 원칙:
- 고카디널리티 억제: `src_ip`를 라벨로 직접 승격하지 말고 로그 필드로 유지
- 라벨은 저카디널리티 중심: `job`, `event_type`, `proto`, `service`, `severity`

파싱 원칙:
- Suricata/Zeek 모두 JSON으로 통일해 `| json` 쿼리 비용 최소화
- 필요 필드만 drop/keep 하여 Loki 저장량 제어

---

## 7. 대시보드 설계 (Grafana)

패널 그룹 A: 공격 탐지 (Suricata)
- 시간대별 alert 건수
- 시그니처 Top N
- 심각도 분포
- src_ip Top N (테이블)

패널 그룹 B: 접속 행위 가시성 (Zeek)
- conn 상태 분포(`S0`, `REJ`, `SF` 등)
- DNS 쿼리 Top N / NXDOMAIN 비율
- TLS SNI Top N / 희귀 도메인
- HTTP URI/UA 이상 패턴

패널 그룹 C: 상관분석
- 동일 `src_ip` 기준 Suricata alert + Zeek conn + nginx access 연계
- `wazuh alert`와 네트워크 이벤트 타임라인 매칭

---

## 8. 알림 설계

초기 알림 룰:
- Suricata `severity <= 2` 급증 (5분)
- 동일 IP의 다양한 포트 스캔 감지
- NXDOMAIN 비율 급증 (DNS tunneling 의심)
- 새벽 시간대 비정상 대역폭/세션 수 급증

알림 채널:
- 기존 Grafana Alerting(Slack Webhook) 재사용

---

## 9. 성능/보안/개인정보 고려

성능:
- 홈서버 기준 패킷 처리량에 따라 CPU 사용 증가 가능
- BPF 캡처 필터로 불필요 트래픽 제외 검토

보안:
- 로그 디렉터리 권한 최소화
- Suricata/Zeek 업데이트 주기 관리

개인정보/규정:
- Full PCAP는 민감정보 포함 가능성이 높음
- 기본은 메타데이터 중심(Zeek/Suricata JSON), PCAP는 단기 보관만

---

## 10. 단계별 구현 로드맵

1단계 (이번 분기 권장):
- Suricata 설치 + eve.json 수집
- Grafana 탐지 패널/기본 알림 구성

2단계:
- Zeek 설치 + 핵심 로그 수집(conn/dns/http/ssl)
- Suricata 이벤트와 상관분석 패널 추가

3단계:
- Suricata IPS 제한 적용(drop 룰 화이트리스트 기반)
- 선택적 PCAP 롤링 저장 운영

---

## 11. 완료 기준 (Definition of Done)

- `누가/언제/어떻게` 질문에 대해 Grafana에서 5분 내 추적 가능
- Suricata alert 발생 시 관련 Zeek conn/dns/http 증거를 같은 대시보드에서 확인 가능
- Loki 저장량/서버 부하가 운영 허용 범위 내 유지
- 오탐으로 인한 정상 서비스 장애 없이 2주 이상 안정 운영

---

## 12. 구현 현황 (2026-03-13 기준)

### ✅ 구현 완료

| 항목 | 근거 파일 |
|---|---|
| Suricata 설치 스크립트 | `scripts/setup-suricata.sh` |
| Suricata eve.json → Promtail 수집 | `config/promtail-config.yml` (suricata job) |
| Suricata Grafana 패널 5종 | `grafana/dashboards/security-dashboard.json` (id 19~23) |
| `src_ip` 고카디널리티 라벨 억제 | promtail suricata job: 라벨 job/host만 유지, `| json` 파싱 |
| Wazuh Manager 컨테이너 실행 | `docker-compose.yml` (wazuh-manager 4.14.3) |
| Wazuh alerts.json → Promtail 수집 | `config/promtail-config.yml` (wazuh job) |
| Wazuh Grafana 패널 2종 | `grafana/dashboards/security-dashboard.json` (id 13~14) |

### ❌ 미구현

| 항목 | 비고 |
|---|---|
| Suricata IPS 모드 (drop) | 현재 IDS 모드 (alert-only)만 적용 |
| Suricata flow/http/dns/tls 이벤트 별도 파싱 | eve.json은 수집 중이나 `| json` 전체 파싱 |
| **Zeek 전체** | 설치 없음, Promtail job 없음, 대시보드 패널 없음 |
| Zeek Grafana 패널 그룹 B (conn/dns/tls/http 가시성) | Zeek 미도입으로 전면 미구현 |
| 상관분석 패널 그룹 C | Zeek 미도입으로 전면 미구현 |
| rolling PCAP | 미구현 |
| Suricata notice 정책 알림 | 2단계 이후 |
| NXDOMAIN 비율/DNS tunneling 알림 | Zeek 의존 |

### 🔄 진행 중

| 항목 | 상태 |
|---|---|
| Wazuh Agent 등록 | 트러블슈팅 기록 있음, 정상 이벤트 수신 미확인 |
| Grafana Alerting (Slack Webhook) | URL 확보 대기 중 |

---

## 13. 결론

현재 프로젝트의 다음 단계는 `Suricata -> Zeek` 순이 가장 실용적이다.

- Suricata: 탐지/차단 기능 확보
- Zeek: Wireshark에 가까운 행위 가시성 확보(메타데이터 중심)
- PCAP: 사건 대응이 필요할 때만 제한적으로 보강

즉, "지금 당장 필수는 아님"이었던 Zeek는  
목표가 "접근 행위를 구체적으로 기록/분석"으로 확장된 시점부터는 도입 가치가 충분하다.
