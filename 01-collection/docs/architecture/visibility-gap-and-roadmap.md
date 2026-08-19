## 현재 상태 vs 전수 조사(근접) 로드맵

> 기준: 2026-03-13
> 참고: 기술적으로 **절대 100%는 불가**(암호화/TLS, 드롭, 성능 한계).
> 실무 목표는 **90% 내외 고가시성**.

| 영역 | 현재 상태 | 현재 커버(추정) | 90%+로 가기 위한 추가 |
|---|---|---:|---|
| 네트워크 패킷 탐지 | Suricata IDS 구현 완료, Zeek 미구현 | 40~50% | Suricata IPS(drop 룰 점진 적용), Zeek(conn/dns/http/ssl) |
| 웹 공격 가시성 | nginx + ModSecurity 로그 수집 중 | 60~75% | WAF 규칙 튜닝, false positive 정리, 상관분석 패널 |
| 호스트 행위 가시성 | Wazuh Manager 실행 중, Agent 등록 확인 필요 | 35~50% | Wazuh Agent 안정화 확인, auditd, eBPF(Falco/Tetragon) |
| 원본 포렌식(재현성) | Full PCAP 없음 | 0~10% | rolling PCAP(24~72h) + Arkime 인덱싱 |
| 관측/알림 파이프라인 | Promtail/Loki/Grafana 운영 중, Slack 알림 URL 대기 | 65~80% | 드롭 모니터링, 버퍼링/재전송, 알림 룰 고도화 |

## 전체 가시성 단계

| 단계 | 조건 | 예상 가시성 |
|---|---|---:|
| A. 현재 | Suricata IDS 완료, Wazuh 연동 진행 중 | 40~55% |
| B. 1차 완성 | Wazuh Agent 안정화 + Zeek 도입 | 60~75% |
| C. 고가시성 | B + auditd/eBPF + rolling PCAP + Arkime | 80~90%+ |

## 실행 체크리스트 (우선순위)

- [ ] Wazuh Agent 등록/정상 이벤트 수신 확인
- [x] Suricata `eve.json` 수집 및 Grafana 패널 생성 _(완료: setup-suricata.sh, promtail job, 대시보드 패널 5종)_
- [ ] Suricata IPS 모드 점진 적용 (1~2주 baseline 관측 후)
- [ ] Zeek `conn/dns/http/ssl/notice` 수집 추가
- [x] `src_ip` 고카디널리티 라벨 억제(로그 필드 유지) _(완료: Suricata job에서 적용)_
- [ ] Grafana Alerting Slack Webhook 연동 (URL 확보 후)
- [ ] auditd 룰 적용(`/etc/passwd`, `sudoers`, `execve`)
- [ ] eBPF 런타임 탐지(Falco 또는 Tetragon)
- [ ] rolling PCAP + Arkime(선택) 구축
- [ ] 알림 튜닝(심각도, 급증, 상관분석)
