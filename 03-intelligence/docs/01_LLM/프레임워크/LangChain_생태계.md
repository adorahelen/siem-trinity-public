# LangChain 생태계 — 타사 적용 사례 및 Ollama 관계

> 작성일: 2026-03-19

---

## 1. 타사에서 LangChain이 사용되는 방식

### 엔터프라이즈 / 상용 제품

| 회사 / 제품 | 적용 방식 |
|------------|---------|
| **Notion AI** | 문서 검색 + LLM 답변 (RAG) |
| **Elastic (검색엔진)** | ElasticSearch + LangChain RAG 공식 연동 |
| **Databricks** | LLM 파이프라인 오케스트레이션 |
| **MongoDB Atlas** | 벡터 검색 + LangChain 공식 파트너 |
| **Salesforce Einstein** | CRM 데이터 기반 LLM 답변 |
| **LinkedIn** | 채용 추천, 프로필 요약 |

### 적용 패턴별 분류

```
① RAG (검색 증강 생성) — 가장 많이 쓰임
   사내 문서 / DB → 벡터화 → LLM 답변
   예: 사내 챗봇, 고객센터 자동 응답

② Agent (자율 실행)
   LLM이 스스로 도구(검색, API, 코드 실행)를 선택하고 순서대로 실행
   예: AutoGPT, Devin(AI 개발자)

③ Chain (순차 파이프라인)
   문서 요약 → 번역 → 이메일 초안 작성 처럼 단계별 처리
   예: 법률 문서 자동 요약 서비스

④ Multi-modal
   이미지 + 텍스트를 함께 처리하는 파이프라인
   예: 제품 사진 → 설명 자동 생성
```

---

## 2. LangChain과 경쟁/대안 프레임워크

LangChain이 유일한 선택지는 아닙니다.

| 프레임워크 | 특징 | 주요 사용처 |
|-----------|------|-----------|
| **LangChain** | 가장 범용, 생태계 최대 | 스타트업, 사이드 프로젝트 |
| **LlamaIndex** | 문서/데이터 인덱싱에 특화 | 기업 내부 문서 RAG |
| **Haystack** | 엔터프라이즈 검색 특화 | 대규모 검색 시스템 |
| **DSPy** | 프롬프트 자동 최적화 | 연구, 학술 |
| **AutoGen** | 멀티 에이전트 협업 | Microsoft 생태계 |
| **CrewAI** | 역할 기반 멀티 에이전트 | 복잡한 자동화 워크플로우 |

---

## 3. LangChain과 Ollama는 다른 생태계인가?

**다른 레이어에 존재하는 별개의 도구**입니다. 함께 쓰이지만 서로 독립적입니다.

```
┌─────────────────────────────────────────────┐
│              애플리케이션 레이어               │
│  LangChain / LlamaIndex / 직접 구현 등        │
│  (파이프라인 오케스트레이션)                   │
└────────────────────┬────────────────────────┘
                     │ API 호출
┌────────────────────▼────────────────────────┐
│               모델 서빙 레이어                │
│  Ollama / vLLM / llama.cpp / LM Studio 등   │
│  (모델을 HTTP API로 서빙)                    │
└────────────────────┬────────────────────────┘
                     │ 실행
┌────────────────────▼────────────────────────┐
│                 모델 레이어                   │
│  llama3.1:8b / qwen2.5:14b / mistral 등     │
│  (실제 가중치 파일 .gguf)                    │
└─────────────────────────────────────────────┘
```

### 각각 교체 가능

```
LangChain  →  LlamaIndex로 교체해도 Ollama는 그대로
Ollama     →  vLLM으로 교체해도 LangChain은 그대로
llama3.1   →  qwen2.5로 교체해도 둘 다 그대로
```

### 이 프로젝트에서의 관계

```
LangChain (rag_chain.py)
    │
    │  HTTP POST http://localhost:11434/api/...
    ▼
Ollama (로컬 서버)
    │
    ├─ /api/embeddings → nomic-embed-text 실행
    └─ /api/generate   → llama3.1:8b 실행
```

LangChain은 Ollama의 HTTP API를 `OllamaLLM`, `OllamaEmbeddings` 클래스로 래핑해서 호출할 뿐입니다. Ollama가 없으면 LangChain도 동작하지 않고, LangChain이 없어도 Ollama는 독립적으로 실행됩니다.

---

## 4. Ollama 생태계

Ollama는 **로컬 모델 서빙 도구**로, 자체적인 생태계를 가지고 있습니다.

```
Ollama 생태계
├── 모델 라이브러리  ollama.com/library (llama, qwen, mistral, phi 등 수백 종)
├── REST API        /api/generate, /api/embeddings, /api/chat
├── CLI             ollama run llama3.1:8b
└── 연동 도구
    ├── Open WebUI    → ChatGPT 같은 UI
    ├── LangChain     → RAG 파이프라인 (이 프로젝트)
    ├── LlamaIndex    → 문서 검색
    ├── Continue.dev  → VSCode AI 코딩 보조
    └── Obsidian      → 노트 앱 AI 연동
```

### Ollama 대안 도구

| 도구 | 특징 |
|------|------|
| **LM Studio** | GUI 기반, 초보자 친화적 |
| **llama.cpp** | Ollama의 기반, 가장 가볍고 raw |
| **vLLM** | 서버용, 고성능 (GPU 서버에서 사용) |
| **Jan** | 오프라인 ChatGPT 클론 UI 포함 |

---

## 5. 정리

| 질문 | 답변 |
|------|------|
| LangChain과 Ollama는 같은 건가? | 아니다. 다른 레이어의 독립 도구 |
| Ollama 없이 LangChain만 쓸 수 있나? | 가능 — OpenAI, Anthropic API 등으로 대체 |
| LangChain 없이 Ollama만 쓸 수 있나? | 가능 — `requests`로 직접 API 호출 |
| 이 프로젝트에서 둘의 관계는? | LangChain이 Ollama의 HTTP API를 호출하는 클라이언트 |
