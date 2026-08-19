# Architecture — SIEM-Trinity

> 이 문서는 저장소 루트의 5축 문서 세트 중 하나다. 더 상세한 내부 설계는 `docs/architecture.md`(수집~알림 파이프라인) 및 `04-ui/docs/ARCHITECTURE.md`(UI 레이어)에도 있으니 함께 참고할 것.

## 1. 파이프라인 개요

```mermaid
flowchart TB
    subgraph c01["01-collection"]
        sensors["Zeek/Suricata/Wazuh-agent<br/>fail2ban/syslog"] --> promtail["Promtail"]
        promtail --> loki[("Loki")]
        promtail --> prom[("Prometheus")]
    end

    subgraph c02["02-detection"]
        detapi["detection-api (FastAPI)<br/>Loki를 LogQL로 30분마다 질의<br/>4개 ML 탐지기 → REST+BFF (27개 엔드포인트)"]
    end

    subgraph c03["03-intelligence"]
        intel["Ollama gemma4 + ChromaDB RAG"]
    end

    subgraph c04["04-ui"]
        ui["TrinitySOC React SPA"]
    end

    loki --> detapi
    prom --> detapi
    detapi -->|"/api/llm/*"| intel
    ui -->|"/api/* 만 호출 (직접 연결 안 함)"| detapi
```

## 2. XDR 대응 단계 (프로필 게이팅, 기본 비활성)
`ip_risk_scorer`에서 분기: fail2ban / Wazuh 능동 대응 / MISP IOC 조회 / Shuffle 웹훅 / TheHive 케이스 생성 — 전부 `01-collection/docker-compose.yml`에 `profiles: ["misp"|"shuffle"|"thehive"]`로 추가되어 기본적으로 기동되지 않는다.

```mermaid
flowchart TB
    scorer["ip_risk_scorer (02-detection)"]
    scorer --> ban["fail2ban-client<br/>auto-ban (단계 2)"]
    scorer --> ar["Wazuh active-response<br/>firewall-drop (단계 3)"]
    scorer --> misp["MISP IOC 매칭 (단계 4)"]
    ban --> shuffle["Shuffle SOAR playbook (단계 5)"]
    ar --> shuffle
    misp --> shuffle
    shuffle --> hive["TheHive 케이스 자동 생성 (단계 6)"]
    hive --> llm["03-intelligence LLM<br/>케이스 코멘트 작성"]
    llm --> discord(["Discord 운영자 알림"])
```

## 3. 포트 (docs/access.md 기준, 전부 `HOST_BIND_IP` 환경변수로 매개변수화)
| 서비스 | 포트 |
|---|---|
| Loki | 3100 |
| Grafana | 3000 |
| Prometheus | 9090 |
| Wazuh | 1514/1515/55000 |
| detection-api | 2027 |
| Ollama | 11434/11435 |
| Streamlit | 8501 |
| TrinitySOC nginx | 5173 (유일한 외부 노출 의도 포트) |
| MISP | 8080/8443 |
| Shuffle | 3001/5001 |
| TheHive | 9000 |
| Elasticsearch/OpenSearch | 9200 |

## 4. 기술 스택 (단계별)
- 01: Zeek, Suricata, Wazuh 4.14.3, fail2ban, ufw, ModSecurity, Promtail→Loki 2.9.4/Grafana 10.3.3/Prometheus
- 02: Python 3.12, FastAPI+uvicorn+APScheduler(30분 주기), scikit-learn(Isolation Forest), SciPy(FFT), pandas/numpy
- 03: Ollama(`gemma4:e2b-it-q4_K_M` + `nomic-embed-text`), LangGraph/LangChain ReAct(13개 도구), ChromaDB(ATT&CK 697개 기법), Streamlit
- 04: React 18 + TypeScript strict + Vite 5, ECharts, react-grid-layout, TanStack Query, Zustand, TailwindCSS, nginx 서빙

## 5. 통합 배경 — 2026-05-22 cutover
이 저장소는 `security-log-monitor`, `siem-ai-detector`, `siem-ai-analyst` 3개 레거시 저장소/스택을 하나의 모노레포로 통합한 것이다(`docs/cutover-2026-05-22.md`). 기존 Docker 볼륨을 compose 프로젝트명(`security-log-monitor`)으로 재사용해 데이터 무손실로 이전했다.
