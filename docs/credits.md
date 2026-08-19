# Credits & Open-Source Catalog

> SIEM-Trinity가 사용하는 모든 오픈소스를 한 곳에 모은 카탈로그.
> 2026-05-13 기준 코드/설정에서 직접 추출. 자동 갱신되지 않으므로 의존성 변경 시 수동 갱신 필요.

---

## 📡 01-collection — SIEM 인프라

### Docker 컨테이너

| 컴포넌트 | 버전 | 라이선스 | 공식 | 역할 |
|---|---|---|---|---|
| [Grafana Loki](https://grafana.com/oss/loki/) | 2.9.4 | AGPL-3.0 | [grafana/loki](https://github.com/grafana/loki) | 로그 저장 (LogQL 쿼리) |
| [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) | 2.9.4 | AGPL-3.0 | [grafana/loki](https://github.com/grafana/loki) | 로그 수집 에이전트 |
| [Grafana](https://grafana.com/) | 10.3.3 | AGPL-3.0 | [grafana/grafana](https://github.com/grafana/grafana) | 시각화·대시보드 |
| [Prometheus](https://prometheus.io/) | latest | Apache 2.0 | [prometheus/prometheus](https://github.com/prometheus/prometheus) | 메트릭 수집·저장 |
| [Node Exporter](https://github.com/prometheus/node_exporter) | latest | Apache 2.0 | [prometheus/node_exporter](https://github.com/prometheus/node_exporter) | 호스트 메트릭 |
| [Wazuh Manager](https://wazuh.com/) | 4.14.3 | GPL-2.0 | [wazuh/wazuh](https://github.com/wazuh/wazuh) | HIDS (FIM·이상 탐지) |

### 호스트 통합

| 컴포넌트 | 라이선스 | 공식 | 역할 |
|---|---|---|---|
| [nginx](https://nginx.org/) | BSD-2-Clause | [nginx/nginx](https://github.com/nginx/nginx) | 리버스 프록시 + WAF 호스트 |
| [ModSecurity](https://modsecurity.org/) | Apache 2.0 | [owasp-modsecurity/ModSecurity](https://github.com/owasp-modsecurity/ModSecurity) | WAF (OWASP CRS 921 규칙) |
| [OWASP CRS](https://coreruleset.org/) | Apache 2.0 | [coreruleset/coreruleset](https://github.com/coreruleset/coreruleset) | WAF 규칙 세트 |
| [fail2ban](https://www.fail2ban.org/) | GPL-2.0 | [fail2ban/fail2ban](https://github.com/fail2ban/fail2ban) | IPS (로그인 실패 자동 차단) |
| [UFW (Uncomplicated Firewall)](https://launchpad.net/ufw) | GPL-3.0 | [Canonical](https://launchpad.net/ufw) | 호스트 방화벽 |
| [Tailscale](https://tailscale.com/) | BSD-3-Clause | [tailscale/tailscale](https://github.com/tailscale/tailscale) | VPN mesh |
| [Zeek](https://zeek.org/) | BSD-3-Clause | [zeek/zeek](https://github.com/zeek/zeek) | 네트워크 분석 (conn·dns·http·ssl) |
| [Suricata](https://suricata.io/) | GPL-2.0 | [OISF/suricata](https://github.com/OISF/suricata) | NIDS (룰 기반 탐지) |

---

## 🤖 02-detection — AI 위협 탐지

### Python ML / 데이터

| 패키지 | 라이선스 | 공식 | 역할 |
|---|---|---|---|
| [scikit-learn](https://scikit-learn.org/) | BSD-3-Clause | [scikit-learn/scikit-learn](https://github.com/scikit-learn/scikit-learn) | Isolation Forest · Random Forest |
| [SciPy](https://scipy.org/) | BSD-3-Clause | [scipy/scipy](https://github.com/scipy/scipy) | FFT (비콘 탐지) · 통계 |
| [NumPy](https://numpy.org/) | BSD-3-Clause | [numpy/numpy](https://github.com/numpy/numpy) | 수치 연산 |
| [pandas](https://pandas.pydata.org/) | BSD-3-Clause | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | 데이터프레임 |
| [LightGBM](https://lightgbm.readthedocs.io/) | MIT | [microsoft/LightGBM](https://github.com/microsoft/LightGBM) | Gradient boosting (옵션) |
| [joblib](https://joblib.readthedocs.io/) | BSD-3-Clause | [joblib/joblib](https://github.com/joblib/joblib) | 모델 직렬화 |

### Backend / Frontend

| 패키지 | 라이선스 | 공식 | 역할 |
|---|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | MIT | [tiangolo/fastapi](https://github.com/tiangolo/fastapi) | REST API (siem-api) |
| [APScheduler](https://apscheduler.readthedocs.io/) | MIT | [agronholm/apscheduler](https://github.com/agronholm/apscheduler) | 30분 주기 자동 실행 |
| [Uvicorn](https://www.uvicorn.org/) | BSD-3-Clause | [encode/uvicorn](https://github.com/encode/uvicorn) | ASGI 서버 |
| [React](https://react.dev/) | MIT | [facebook/react](https://github.com/facebook/react) | UI 프레임워크 |
| [Recharts](https://recharts.org/) | MIT | [recharts/recharts](https://github.com/recharts/recharts) | 차트 라이브러리 |
| [Vite](https://vitejs.dev/) | MIT | [vitejs/vite](https://github.com/vitejs/vite) | 프론트엔드 빌드 |
| [Rich](https://rich.readthedocs.io/) | MIT | [Textualize/rich](https://github.com/Textualize/rich) | 콘솔 출력 |

---

## 🧠 03-intelligence — LLM Agent

### LLM 오케스트레이션

| 패키지 | 버전 | 라이선스 | 공식 | 역할 |
|---|---|---|---|---|
| [LangChain](https://www.langchain.com/) | 1.2.12 | MIT | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | LLM 체인 프레임워크 |
| [LangGraph](https://langchain-ai.github.io/langgraph/) | 1.1.3 | MIT | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | ReAct Agent 그래프 |
| [langchain-ollama](https://pypi.org/project/langchain-ollama/) | 1.0.1 | MIT | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | Ollama 통합 |

### 로컬 LLM / 임베딩

| 컴포넌트 | 라이선스 | 공식 | 역할 |
|---|---|---|---|
| [Ollama](https://ollama.com/) | MIT | [ollama/ollama](https://github.com/ollama/ollama) | 로컬 LLM 추론 엔진 |
| [llama.cpp](https://github.com/ggerganov/llama.cpp) | MIT | [ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) | (Ollama 내부) GGUF 추론 |
| **Google Gemma 4** (E2B q4_K_M) | Apache 2.0 | [google/gemma-4-E2B](https://huggingface.co/google/gemma-4-E2B) | **현재 사용 모델** (2026-05 고정) |
| [nomic-embed-text](https://blog.nomic.ai/posts/nomic-embed-text-v1) | Apache 2.0 | [nomic-ai/nomic](https://github.com/nomic-ai/nomic) | 텍스트 임베딩 |

### 벡터 DB / UI

| 패키지 | 버전 | 라이선스 | 공식 | 역할 |
|---|---|---|---|---|
| [ChromaDB](https://www.trychroma.com/) | 1.5.5 | Apache 2.0 | [chroma-core/chroma](https://github.com/chroma-core/chroma) | 벡터 저장소 (KISA/MITRE RAG) |
| [Streamlit](https://streamlit.io/) | 1.55.0 | Apache 2.0 | [streamlit/streamlit](https://github.com/streamlit/streamlit) | Web UI |
| [pypdf](https://pypdf.readthedocs.io/) | 6.9.1 | BSD-3-Clause | [py-pdf/pypdf](https://github.com/py-pdf/pypdf) | PDF 파싱 (지식 문서 적재) |

---

## 🌐 외부 데이터 소스

| 소스 | 라이선스 | URL | 용도 |
|---|---|---|---|
| ip-api.com | 무료 (속도 제한) | [ip-api.com](https://ip-api.com/) | GeoIP 위치 조회 (01의 exporter) |
| KISA 보안 지식 | KISA 자료 | [www.kisa.or.kr](https://www.kisa.or.kr/) | 03 RAG 컬렉션 |
| MITRE ATT&CK | Apache 2.0 | [attack.mitre.org](https://attack.mitre.org/) | 03 RAG 컬렉션 |

---

## 📋 라이선스 호환성 요약

| 카테고리 | 라이선스 | 비고 |
|---|---|---|
| 가장 강한 copyleft | AGPL-3.0 | Loki·Promtail·Grafana — 서비스로 제공 시 소스 공개 의무 |
| 약한 copyleft | GPL-2.0 / GPL-3.0 | Wazuh·Suricata·fail2ban·UFW |
| 허용형 | MIT / BSD / Apache 2.0 | 대부분의 Python·JS 패키지 |
| 모델 라이선스 | Apache 2.0 (Gemma 4) | 상용 가능, 제약 없음 |

> **SIEM-Trinity는 개인 홈서버 운영용으로, 상업 배포 시엔 위 라이선스 의무사항을 별도 검토해야 합니다.**

---

## 🔄 갱신 정책

이 카탈로그는 **수동 갱신**됩니다. 의존성 추가/변경 시:

```bash
# 갱신 후 차이 확인
git diff -- docs/credits.md
```

자동 갱신 후보 (미구현):
- `pip-licenses --format=markdown` → `03-intelligence/`
- `npm-license-crawler` → `02-detection/ui/`
- `docker image inspect` → 01의 이미지 라이선스
