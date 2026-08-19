# Requirements — SIEM-Trinity

## 1. 목적 & 대상 사용자
"자작 XDR"(TrinitySOC) — SIEM(로그→탐지), EDR(Wazuh 기반 엔드포인트), SOAR(자동 대응), 케이스 관리(TheHive), 로컬 LLM 분석(Ollama/gemma4)을 하나의 콘솔로 통합한 자체 호스팅 단일 홈랩 서버용 XDR/SIEM 스택. SSH 무차별대입, C2 비콘, DGA 도메인, 네트워크 플로우 이상, 웹/호스트 공격(ModSecurity/Suricata/Wazuh HIDS)을 방어 대상으로 하며, 1인 운영자를 대상으로 한다. 명시적 비목표: 외부 SaaS 의존 0(오픈소스만 사용).

## 2. 기능 요구사항 (4단계 파이프라인 + SOAR 6단계)
- **수집(01)**: 15개 이상 로그 소스(auth/syslog/kern/ufw/fail2ban/modsec/apt/dpkg/zeek/suricata/wazuh) → Promtail → Loki(11개 활성 잡), Prometheus+node-exporter 메트릭
- **탐지(02)**: 비콘(CoV+FFT), DGA(엔트로피+어휘), 플로우 이상(Isolation Forest), IP 위험 점수(가중 신호 0-100) — `run_all.py` 오케스트레이션, FastAPI BFF로 결과 노출
- **인텔리전스(03)**: Loki 로그 + MITRE ATT&CK/KISA 지식 기반 RAG 채팅/알림 분석, 4섹션 환각 방지 프롬프트(요약/공격체인/위험도/대응)
- **UI(04, TrinitySOC)**: 2탭(보안 14위젯, 인프라 9위젯) + 전용 페이지들(알림/탐지기/공격/분석기/LLM/로그/케이스/인텔/워크플로우/액션/설정)
- **SOAR(xdr-step1~6)**: ① Wazuh 에이전트+auditd 엔드포인트 가시성 → ② IP 위험 Critical(≥90) 시 fail2ban 자동 차단(드라이런 우선) → ③ Wazuh alert level≥10 시 방화벽 드롭 능동 대응 → ④ MISP IOC 매치 시 위험 가중치 +30 → ⑤ Shuffle SOAR 플레이북이 Critical 이벤트 처리 인계 → ⑥ TheHive 자동 케이스 생성 + ATT&CK 태깅, LLM이 케이스 코멘트 추가

## 3. 비기능 요구사항 / 제약
- Linux x86_64 전용(Ubuntu 22.04+/Debian 12+ — fail2ban/ufw/systemd/node-exporter가 Linux 전용)
- CPU 전용 ML(GPU 없음), 풀스택 기준 약 16GB RAM/60GB 디스크
- 모든 자동 대응 토글(`AUTO_BAN_ENABLED`, `MISP_ENABLED`, `SHUFFLE_ENABLED`, `THEHIVE_ENABLED`) 기본값 `false` — "운영자 자가 락아웃"이 최상위 리스크로 취급됨
- Tailscale CGNAT(100.64.0.0/10) + RFC1918은 항상 자동 차단 화이트리스트 대상
- 외부 LLM API 호출 0(로컬 Ollama만)
- Loki는 01의 하위 스트림으로 읽기 전용 — 02/03이 여기에 쓰기 금지

## 4. 범위 외
- SaaS/클라우드 보안 서비스 연동
- 다중 조직/멀티테넌시
