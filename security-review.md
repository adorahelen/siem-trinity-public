# Security Review — SIEM-Trinity

## 1. 2026-05-21 옵저버빌리티 감사 결과

> 원본 감사 보고서는 운영 호스트의 자산 정보(호스트명·계정·공인 IP)를 담고 있어 **공개판에서 제외**했다. 아래는 결론만 옮긴 것이다.
| 항목 | 상태 |
|---|---|
| SSH | `0.0.0.0:22` 노출, 정책 미확인 |
| 방화벽 | ufw/iptables 설치되어 있으나 상태 미확인 — 8개 이상 포트(SMTP/POP3/IMAP/Docker Swarm 2377/4789/7946 포함)가 열려있어 느슨할 가능성 |
| fail2ban | **데몬이 호스트에서 비활성 상태** — 탐지 코드는 실행 중이라고 가정하고 있어 불일치 |
| VPN | Tailscale 미설정(SEC4) |
| `.env` 권한 | 664(그룹 읽기 가능 — 시크릿 노출) |
| TLS | 없음 — TrinitySOC(:5173) 평문 HTTP로 서빙 |
| 이미지 스캔 | Trivy/Grype 등 부재 |
| 파일 무결성 모니터링 | AIDE/etckeeper 등 부재 |
| 헬스체크/알림 스택 | Uptime Kuma, Alertmanager 등 부재 — 죽은 컨테이너를 감지 못함 |
| 긍정 요인 | unattended-upgrades 활성, Prometheus+Grafana+Loki 정상 작동, 외부 노출 포트를 5173 하나로 설계 |

## 2. 인증 모델 (`docs/access.md`)
- 대부분의 읽기 API(detection-api, Loki, Prometheus, Ollama): **무인증**
- Grafana: admin + env 비밀번호
- TheHive: 기본 `admin@thehive.local`/`secret` — **반드시 로테이션 필요**
- MISP: `admin@admin.test` + 생성된 비밀번호
- 쓰기 액션 BFF 엔드포인트(`/actions/*`): 선택적 API 키 게이팅(미설정 시 사실상 무방비)

## 3. 안전장치
XDR 자동 대응(자동 차단/능동 대응/SOAR)은 기본적으로 전부 비활성화(`AUTO_BAN_ENABLED` 등) — `CLAUDE.md`가 "운영자 자가 락아웃"을 최상위 리스크로 명시하고, 활성화 전 최소 1주 드라이런 관찰을 권장.

## 4. 권고사항 (우선순위 순)
1. **최우선**: fail2ban 데몬을 호스트에서 실제로 활성화(탐지 코드의 전제와 실제 상태 불일치 해소)
2. TrinitySOC(:5173)에 TLS 적용
3. TheHive/MISP 기본 자격증명 즉시 교체
4. `.env` 파일 권한을 600으로 축소
5. ufw/iptables 상태를 명시적으로 확인하고 불필요한 포트(SMTP/POP3/IMAP/Docker Swarm) 차단
6. Tailscale을 설정해 관리 인터페이스(Grafana/Loki/Wazuh 등)를 VPN 전용으로 제한
