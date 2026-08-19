# 03-intelligence — Claude Code 개발 지시서

> SIEM Intelligence Layer. 02-detection 이 만든 탐지 결과 + 보안 지식 RAG 로
> Loki 로그를 자연어 분석. **XDR/EDR 가 아니다** — read-only, on-demand.

## 1. 실행 환경 (현재)

| 항목 | 값 |
|---|---|
| 배포 형태 | Docker Compose (`intelligence-ollama` 만) |
| 진입점 | repo 루트 [`./start.sh`](../start.sh) — 01·02·03·04 통합 기동 |
| OS | Linux x86_64 (Ubuntu 24.04 기준) |
| LLM 런타임 | Ollama 컨테이너 (CPU only) |
| Web UI | 없음 — `04-ui` (TrinitySOC) 가 모든 UI 흡수 |
| Ollama 포트 | `${HOST_BIND_IP}:11434` |

### 컨테이너 간 네트워크
```
intelligence-internal  ← intelligence-ui ↔ intelligence-ollama
loki-net (external)    ← intelligence-ui → Loki (01-collection 의 siem-trinity_default)
```

### 핵심 env (`docker-compose.yml` 에 박힘)
```
LOKI_URL     = http://loki:3100                      # docker network 내부
OLLAMA_URL   = http://intelligence-ollama:11434      # docker network 내부
OLLAMA_MODEL = gemma4:e2b-it-q4_K_M                  # 고정 (Issue #11 평가 결과)
EMBED_MODEL  = nomic-embed-text
CHROMA_PATH  = /app/chroma_db                        # 컨테이너 내부, chroma-data 볼륨에 영속
REPORTS_PATH = /app/reports                          # bind-mount ./reports
```

## 2. 디렉토리 구조

```
03-intelligence/
├── CLAUDE.md                   # 이 파일
├── README.md
├── Dockerfile                  # Python 3.12-slim 기반 단일 stage
├── docker-compose.yml
├── requirements.txt
│
├── loki_client.py              # Loki HTTP API 클라이언트
├── knowledge_loader.py         # PDF/TXT/MD → ChromaDB security_knowledge
├── agent.py                    # LangGraph ReAct Agent + 13개 Loki 도구
├── rag_chain.py                # security_knowledge 검색 체인
├── report.py                   # 일간/주간 보고서 (.md)
├── cli.py                      # rich 기반 CLI (디버그용)
│
├── scripts/
│   └── build_attack_knowledge.py   # MITRE ATT&CK STIX → ChromaDB
│
└── docs/
    ├── 01_LLM/ 02_딥러닝/ 03_전통ML/ 04_수학기초/ 05_정보보안/
    └── (학습 노트 — knowledge_loader 로 임베딩 가능한 후보)
```

## 3. ChromaDB 컬렉션

| 컬렉션 | 채우는 주체 | 내용 |
|---|---|---|
| `security_knowledge` | `knowledge_loader.embed_knowledge()` | KISA/MITRE/CVE/플레이북 + ATT&CK 기술 |
| ~~`security_logs`~~ | (Phase 1 폐기) | Agent 가 Loki 직접 쿼리로 대체 |

### ATT&CK 임베딩 (Repo 표준)
```bash
docker exec intelligence-ui python scripts/build_attack_knowledge.py \
  --stix /app/datasets/attack/enterprise-attack.json
# 697 active techniques → security_knowledge
```

(컨테이너에 `datasets/` 가 마운트되어야 함. compose 미반영 시 호스트에서 직접 실행하거나
`docker cp` 로 STIX 를 컨테이너에 넣어 실행.)

## 4. Agent 도구 (`agent.py`)

```
get_ssh_attacks(hours)          get_fail2ban_bans(hours)
get_suricata_alerts(hours, severity)   get_wazuh_alerts(hours, min_level)
get_kr_blocks(hours)            get_zeek_dns(hours, rcode)
get_zeek_notice(hours)          get_zeek_http(hours)
get_zeek_ssl(hours)             get_modsec_alerts(hours)
get_nginx_geo(hours)            get_top_attack_ips(hours)
search_security_knowledge(query)
```

## 5. 운영 원칙 (불변)

1. **Loki HTTP API 읽기 전용.** 로그 파일 직접 접근 금지.
2. **서버 측 서비스 변경 금지** — 01-collection 컨테이너 건드리지 않음.
3. **컨테이너 내부 ChromaDB** — `chroma-data` 볼륨에 영속. 호스트 `~/.xdr` 사용하지 않음.
4. **CPU only** — Metal/CUDA 가속 없음. Linux x86_64 한정 (Issue #16).
5. 모든 출력은 한국어.

## 6. 운영 명령

```bash
# 통합 기동 (권장)
./start.sh                       # repo 루트

# 03 단독 기동
cd 03-intelligence
docker compose up -d --build

# 모델 pull (intelligence-ollama 가동 후 최초 1회)
docker exec intelligence-ollama ollama pull gemma4:e2b-it-q4_K_M
docker exec intelligence-ollama ollama pull nomic-embed-text

# 지식 문서 추가 (PDF/MD)
docker cp my-doc.pdf intelligence-ui:/tmp/
docker exec intelligence-ui python knowledge_loader.py /tmp/my-doc.pdf

# 상태
docker compose ps
docker compose logs -f intelligence-ui
```

## 7. 디버그용 호스트 직접 실행 (예외)

`requirements.txt` 로 venv 만들면 호스트에서도 동작하지만 **운영 형태는 아님.**
모델은 그래도 컨테이너 ollama (`http://localhost:11434`) 또는 호스트 ollama 둘 다 가능.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
LOKI_URL=http://localhost:3100 OLLAMA_URL=http://localhost:11434 python cli.py
```

## 8. 완료 기준 (현재 정착)

- [x] `intelligence-ui`, `intelligence-ollama` 컨테이너 Up
- [x] `gemma4:e2b-it-q4_K_M` + `nomic-embed-text` ollama 보유
- [x] Streamlit UI `http://${HOST_BIND_IP}:8501` 200
- [x] Agent 모드에서 자연어 질의 → Loki 도구 호출 → 답변
- [x] 보고서 `reports/YYYY-MM-DD_daily.md` 생성
- [ ] **(예정)** `security_knowledge` 컬렉션에 ATT&CK 697 techniques 임베딩 — `build_attack_knowledge.py` 실 실행 (Issue #4 후속)

## 9. 변경 이력

- 2026-03-18 최초 작성 (맥북 네이티브 가정, Phase 1)
- 2026-03-22 Phase 2 완료 (Agent + RAG)
- 2026-05-14 Docker 화 (PR #19, #20)
- 2026-05-19 본 문서 전면 갱신 — 맥북/Metal/macOS 경로 등 stale 표현 제거
