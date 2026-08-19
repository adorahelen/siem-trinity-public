# 사용된 도구·기술 스택 종합

> SIEM-Trinity 가 사용하는 모든 오픈소스/표준 카탈로그. 라이선스·버전·용도·교체 가능성 명시.
> 본 문서가 SSOT — 다른 README/문서에 도구 목록이 흩어져 있을 때 본 문서 기준으로 정합.

## 1. 로그 파이프라인 (수집·저장·시각화)

| 도구 | 버전 | 라이선스 | 용도 | 교체 가능성 |
|---|---|---|---|---|
| **Grafana Loki** | 2.9 | AGPLv3 | 중앙 로그 저장 (TSDB) | 어려움 — 전체 아키텍처가 Loki LogQL 가정 |
| **Promtail** | 2.9 | Apache-2.0 | 호스트 → Loki | Vector·Fluent Bit 대체 가능 |
| **Prometheus** | latest | Apache-2.0 | 메트릭 | VictoriaMetrics 대체 가능 |
| **Grafana** | 10.x | AGPLv3 | 시각화 (30+ 패널) | 어려움 — 대시보드 JSON 종속 |

## 2. 호스트 보안 (Wazuh / fail2ban / 방화벽)

| 도구 | 버전 | 라이선스 | 용도 | 비고 |
|---|---|---|---|---|
| **Wazuh Manager** | 4.14 | GPLv2 | HIDS rule + active-response (단계 3) | OSSEC fork |
| **fail2ban** | 호스트 systemd | GPLv2 | 자동 차단 데몬 (단계 2) | host-level |
| **auditd** | 호스트 systemd | GPLv2 | 호스트 이벤트 감사 (단계 1) | host-level |
| **ufw / iptables** | 호스트 | GPLv2 | 방화벽 | host-level |
| **ModSecurity** | 3.x (nginx 모듈) | Apache-2.0 | WAF (OWASP CRS 921 rules) | host-level |

## 3. 탐지 (02-detection)

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **Python** | 3.12 | PSF | 탐지기 4종 + auto_ban + attack_map + 클라이언트 4종 |
| **scikit-learn** | 1.4+ | BSD-3 | Isolation Forest (흐름 이상) |
| **SciPy** | 1.11+ | BSD-3 | FFT (비콘) |
| **pandas / numpy** | latest | BSD | 데이터 처리 |
| **FastAPI + uvicorn** | latest | MIT | REST API + APScheduler 30분 |
| **rich** | latest | MIT | CLI 출력 |
| **React + Vite** | 18 + 5 | MIT | 탐지 UI (6 탭) |
| **Recharts** | latest | MIT | 차트 라이브러리 |

## 4. 분석 (03-intelligence)

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **Ollama** | latest | MIT | 로컬 LLM 런타임 |
| **Gemma 4 E2B q4_K_M** | E2B-it | Gemma TOS | 메인 LLM (~7GB) — Issue #11 평가 결과 |
| **nomic-embed-text** | latest | Apache-2.0 | 임베딩 (~274MB) |
| **LangGraph + LangChain** | latest | MIT | ReAct Agent + 13 도구 |
| **ChromaDB** | latest | Apache-2.0 | 벡터 DB (ATT&CK 697기술 임베딩) |
| **Streamlit** | 1.55 | Apache-2.0 | Web UI (5 탭) |

## 5. XDR 단계 4 — 위협 인텔리전스 (MISP)

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **MISP** | latest (NUKIB/upstream `ghcr.io/misp/misp-docker/misp-core`) | AGPLv3 | IOC 카탈로그 + 피드 구독 |
| **MariaDB** | 11.4 | GPLv2 | MISP DB |
| **Redis** | 7 (alpine) | BSD-3 | MISP 큐/캐시 |

## 6. XDR 단계 5 — SOAR (Shuffle)

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **Shuffle** | latest (`ghcr.io/shuffle/shuffle-{backend,frontend,orborus,worker}`) | AGPLv3 (with Shuffle Community Edition) | playbook 엔진 |
| **OpenSearch** | 2.18 | Apache-2.0 | Shuffle DB |
| **Shuffle apps** (auto-spawn) | http, shuffle-tools, shuffle-ai, shuffle-subflow, tenzir-node | MIT/Apache (각각) | 워크플로우 노드 |

## 7. XDR 단계 6 — 케이스 관리 (TheHive)

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **TheHive** | 5.4 (`strangebee/thehive`) | AGPLv3 | 케이스 관리 + ATT&CK tagging |
| **Cassandra** | 4.1 | Apache-2.0 | 케이스 NoSQL DB |
| **Elasticsearch** | 7.17 | Elastic License (server-side) | 케이스 검색 인덱스 (8.x 호환 불가) |

## 8. 표준·지식 자산

| 자산 | 라이선스 | 용도 | 위치 |
|---|---|---|---|
| **MITRE ATT&CK Enterprise STIX 2.1** | CC BY 4.0 | technique tagging + RAG knowledge | [`datasets/attack/`](../datasets/attack/) (in-repo 51MB) |
| **PCAP-ATTACK** (sbousseaden) | MIT | Suricata 룰 회귀 테스트 | [`datasets/scripts/fetch-pcap-attack.sh`](../datasets/scripts/fetch-pcap-attack.sh) |
| **AIT-LDS v2.0 / AIT-ADS** | CC BY 4.0 | 단계 5/6 풀 시나리오 검증 | fetch 스크립트만 |
| **CIC-IDS2017** | UNB 연구용 | SSH brute-force 시나리오 | fetch 스크립트 (등록 필요) |
| **OTRF Security-Datasets** | MIT | ATT&CK 시뮬레이션 (Sysmon) | fetch 스크립트 |
| **AlienVault OTX / abuse.ch URLhaus** (외부) | 각 출처 | MISP 자동 피드 구독 | MISP web UI |

## 9. 인프라·배포

| 도구 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| **Docker Engine** | 29.x | Apache-2.0 | 컨테이너 런타임 |
| **Docker Compose** | v2 | Apache-2.0 | 오케스트레이션 (3 파일 + profile) |
| **Tailscale** (옵션) | latest | BSD-3 (client) | 100.64.0.0/10 CGNAT 화이트리스트 |
| **Discord Webhook** | API | — | 알림 전송 |
| **systemd** | 호스트 | LGPLv2.1 | 호스트 데몬 (fail2ban·auditd·docker) |

## 10. 개발·운영 도구

| 도구 | 용도 |
|---|---|
| **git + GitHub** | VCS, PR/이슈 추적 |
| **gh CLI** | PR/이슈 자동화 (xdr-up.sh / 본 세션 작업) |
| **bash** | `xdr-up.sh`, `bootstrap-xdr.sh`, `preflight.sh` |
| **openssl** | 강한 secret 자동 발급 |
| **sshpass** (검증 환경) | 232 SSH 자동화 |
| **tcpreplay** (옵션) | PCAP 데이터셋 리플레이 |

## 11. 의식적으로 안 채택한 것

| 도구 | 검토했으나 안 함 | 이유 |
|---|---|---|
| **OpenCTI** | 위협 인텔리전스 대안 | RAM 부담 (>8GB). MISP 채택 (epic #4 명시) |
| **Splunk / Elastic Security** | 상용 SIEM | 라이선스 비용 + 외부 종속 |
| **CrowdStrike / SentinelOne** | 상용 XDR | 외부 SaaS — 본 프로젝트의 "외부 API 0회" 원칙 위반 |
| **OpenAI / Anthropic API** | LLM 호출 | 로컬 Ollama 만 사용 |
| **Cortex** (TheHive 와 별도) | 분석기 자동화 | 단계 6 의 LLM 코멘트로 대체 |
| **MISP Modules** | MISP 확장 | 단계 4 의 IOC 매칭에 불필요 |

## 12. 라이선스 종합 (배포 가능성 검토)

- **AGPLv3** (Loki, Grafana, MISP, Shuffle, TheHive): SaaS 형태로 외부 제공 시 소스 공개 의무
- **GPLv2/v3** (Wazuh, fail2ban): 배포 시 소스 동봉 의무
- **Apache-2.0 / BSD / MIT** (Python 생태계 대부분): 별도 제약 적음
- **Elastic License** (Elasticsearch 7.17 server-side): TheHive 서버 측 사용은 허용. 사용자가 ES 를 외부 서비스로 재판매 시 별도 라이선스 필요
- **Gemma TOS**: 학습/연구용 자유, 상업 출력은 별도 조항 검토

→ **개인·홈랩·내부 사용**: 모든 라이선스 호환. **상용 재배포·SaaS 제공**: AGPL 의무 + 본인 검토 필요.
