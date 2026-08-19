# 공격자 진입 기준 탐지/로그 데이터 흐름도

> GitHub Markdown 렌더링용 (`Mermaid`)
> 작성일: 2026-03-12

---

## 1) 공격자 관점 침투 경로 + 방어 탐지 지점

```mermaid
flowchart TB
    A["공격자 (Internet)"]
    B["네트워크 경계\n(UFW)"]
    C["접근 제어/차단\n(fail2ban)"]
    D["웹 진입점\n(nginx + ModSecurity)"]
    E["네트워크 IDS/NSM\n(Suricata + Zeek)"]
    F["호스트 내부\n(Ubuntu Host / Service / SSH)"]
    G["호스트 보안 분석\n(Wazuh Agent -> Wazuh Manager)"]
    H["로그 수집\n(Promtail + Python Exporter)"]
    I["저장\n(Loki / Prometheus)"]
    J["관측/알림\n(Grafana Alerting)"]

    A -->|포트 스캔/브루트포스/웹 공격| B
    B -->|허용 트래픽만 통과| C
    C -->|반복 실패 IP 즉시 차단| D
    D -->|HTTP 요청 정밀 검사| E
    E -->|패킷/세션 메타데이터 기록| F
    F -->|파일/프로세스/로그 이벤트 발생| G
    G -->|alerts.json + 보안 이벤트| H
    D -->|access/error/modsec 로그| H
    E -->|eve.json + conn/dns/http/ssl 로그| H
    B -->|ufw.log| H
    C -->|fail2ban.log| H
    H --> I
    I --> J

    K["Slack / Webhook"]
    J -->|임계치 초과/시그니처 탐지| K
```

---

## 2) "뚫고 들어와도 흔적이 남는" 탐지 체인

```mermaid
sequenceDiagram
    autonumber
    participant ATT as 공격자
    participant UFW as UFW
    participant F2B as fail2ban
    participant NGINX as nginx+ModSecurity
    participant SURI as Suricata
    participant ZEEK as Zeek
    participant HOST as Host Service/SSH
    participant WAZUH as Wazuh
    participant PROM as Promtail/Exporter
    participant LOKI as Loki/Prometheus
    participant GRAF as Grafana Alerting

    ATT->>UFW: 포트/서비스 접근 시도
    UFW-->>PROM: ufw.log 기록
    ATT->>F2B: 로그인 실패 반복
    F2B-->>ATT: IP 차단 (조건 충족 시)
    F2B-->>PROM: fail2ban.log 기록

    ATT->>NGINX: HTTP 요청 전송
    NGINX->>NGINX: ModSecurity 룰 검사
    NGINX-->>PROM: access/error/modsec 로그 기록

    ATT->>SURI: 패킷 흐름 지속
    SURI-->>PROM: eve.json(alert/flow/http/dns/tls)
    ATT->>ZEEK: 세션/프로토콜 흔적 남김
    ZEEK-->>PROM: conn/dns/http/ssl/notice 로그

    ATT->>HOST: 일부 요청이 서비스/SSH까지 도달
    HOST-->>WAZUH: 파일/프로세스/권한 이벤트 전달
    WAZUH-->>PROM: wazuh alerts 로그

    PROM->>LOKI: 로그/메트릭 적재
    LOKI->>GRAF: 대시보드/상관분석
    GRAF-->>GRAF: 임계치/규칙 평가
```

---

## 3) 한 줄 요약

공격자가 네트워크-웹-호스트를 따라 깊게 들어와도, 각 계층(UFW/fail2ban/ModSecurity/Suricata/Zeek/Wazuh)에서 이벤트가 남고 최종적으로 `Promtail -> Loki/Prometheus -> Grafana`로 모여 추적/알림이 가능하다.
