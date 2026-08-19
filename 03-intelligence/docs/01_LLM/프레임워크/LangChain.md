# LangChain 개념 및 이 프로젝트 적용 현황

> 작성일: 2026-03-19
> 관련 파일: `rag_chain.py`

---

## LangChain이란?

LLM을 활용한 애플리케이션을 만들기 위한 **오케스트레이션 프레임워크**입니다.
LLM 단독으로는 할 수 없는 것들(검색, 외부 데이터 연동, 파이프라인 구성 등)을
쉽게 연결할 수 있도록 추상화 레이어를 제공합니다.

```
LangChain = LLM + 외부 도구들을 연결하는 파이프라인 프레임워크
```

---

## LangChain 패키지 구조

LangChain은 현재 역할별로 패키지가 분리되어 있습니다.

| 패키지 | 버전 | 역할 |
|--------|------|------|
| `langchain-core` | 1.2.20 | LCEL 파이프라인, 프롬프트, 파서 등 핵심 인터페이스 |
| `langchain-community` | 0.4.1 | 서드파티 연동 (ChromaDB, 각종 벡터스토어 등) |
| `langchain-ollama` | 1.0.1 | Ollama LLM / 임베딩 전용 어댑터 |
| `langchain` | 1.2.12 | 상위 패키지 (하위 호환성 유지용) |

---

## 이 프로젝트에서 사용된 LangChain 컴포넌트

### 1. `OllamaEmbeddings` (langchain-ollama)

```python
from langchain_community.embeddings import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    model="nomic-embed-text",
    base_url="http://localhost:11434",
)
```

**역할:** 텍스트(로그, 질문) → 숫자 벡터 변환
**실제 동작:** Ollama API를 호출해 `nomic-embed-text` 모델로 임베딩 수행
**사용 위치:** 벡터 검색 시 질문을 벡터로 변환할 때

---

### 2. `Chroma` 벡터스토어 (langchain-community)

```python
from langchain_community.vectorstores import Chroma

vectorstore = Chroma(
    collection_name="security_logs",
    embedding_function=embeddings,
    persist_directory="/Users/user/.xdr/chroma_db",
)

retriever = vectorstore.as_retriever(
    search_type="mmr",           # MMR: 다양성 확보 검색
    search_kwargs={"k": 5, "fetch_k": 20},  # 상위 5개 반환
)
```

**역할:** ChromaDB를 LangChain 인터페이스로 래핑
**실제 동작:** 질문 벡터와 유사한 로그 청크를 ChromaDB에서 검색
**MMR (Maximal Marginal Relevance):** 유사도 높으면서 중복 없는 결과를 가져오는 검색 방식

---

### 3. `OllamaLLM` (langchain-ollama)

```python
from langchain_ollama import OllamaLLM

llm = OllamaLLM(
    model="llama3.1:8b",
    base_url="http://localhost:11434",
    temperature=0.1,    # 낮을수록 일관된 답변 (0=결정론적, 1=창의적)
)
```

**역할:** Ollama에서 실행 중인 LLM을 LangChain 인터페이스로 연결
**실제 동작:** 조립된 프롬프트를 `llama3.1:8b`에 전달하고 답변 수신

---

### 4. `PromptTemplate` (langchain-core)

```python
from langchain_core.prompts import PromptTemplate

prompt = PromptTemplate(
    input_variables=["context", "realtime", "question"],
    template=get_system_prompt(),   # {context}, {realtime}, {question} 자리표시자 포함
)
```

**역할:** 검색된 로그 + 실시간 현황 + 사용자 질문을 하나의 프롬프트로 조립
**실제 동작:** 변수를 받아 최종 프롬프트 문자열 생성 후 LLM에 전달

---

### 5. LCEL 파이프라인 (langchain-core)

**LCEL (LangChain Expression Language):** `|` 연산자로 컴포넌트를 체인으로 연결하는 방식

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

chain = (
    {
        "context":  (lambda x: x["question"]) | retriever | format_docs,
        "realtime": lambda x: x.get("realtime", "없음"),
        "question": lambda x: x["question"],
    }
    | prompt
    | llm
    | StrOutputParser()
)
```

**파이프라인 흐름:**

```
입력 dict {"question": "...", "realtime": "..."}
    │
    ├─ context  → 질문 추출 → retriever(벡터검색) → format_docs(문자열화)
    ├─ realtime → 실시간 현황 문자열 그대로 전달
    └─ question → 질문 문자열 그대로 전달
    │
    ▼
PromptTemplate → {context}, {realtime}, {question} 조립 → 프롬프트 완성
    │
    ▼
OllamaLLM → llama3.1:8b 추론
    │
    ▼
StrOutputParser → 결과를 순수 문자열로 변환
    │
    ▼
최종 답변 (str)
```

---

## LangChain이 없었다면?

직접 구현해야 하는 것들:

```python
# 1. Ollama 임베딩 직접 호출
response = requests.post("http://localhost:11434/api/embeddings",
    json={"model": "nomic-embed-text", "prompt": question})
question_vector = response.json()["embedding"]

# 2. ChromaDB 직접 검색
results = chroma_client.get_collection("security_logs").query(
    query_embeddings=[question_vector], n_results=5)

# 3. 프롬프트 직접 조립
context = "\n\n".join(results["documents"][0])
prompt = f"...\n컨텍스트: {context}\n질문: {question}\n답변:"

# 4. Ollama LLM 직접 호출
response = requests.post("http://localhost:11434/api/generate",
    json={"model": "llama3.1:8b", "prompt": prompt})
answer = response.json()["response"]
```

LangChain은 위의 과정을 추상화하여 `chain.invoke({"question": q, "realtime": r})`
한 줄로 처리할 수 있게 해줍니다.

---

## LangChain이 사용되지 않는 파일

| 파일 | 이유 |
|------|------|
| `loki_client.py` | Loki HTTP API는 `requests`로 직접 호출 |
| `embedder.py` | ChromaDB 저장은 `chromadb` SDK 직접 사용 |
| `report.py` | 보고서 생성은 순수 Python 문자열 처리 |
| `cli.py` | 터미널 UI는 `rich` 라이브러리 |
| `app.py` | Web UI는 `streamlit` |

> LangChain은 `rag_chain.py` **단 하나의 파일**에서만 사용됩니다.

---

## LangChain을 쓰는 이유 — "RAG를 직접 안 구현하려고?"

결론부터: **RAG 로직 자체는 그대로 존재합니다.** LangChain은 RAG를 구성하는 각 단계의 반복적인 배관 코드(boilerplate)를 대신 작성해주는 도구입니다.

### 직접 구현 vs LangChain 비교

**직접 구현하면 (약 20줄):**

```python
# 1. 임베딩 - Ollama API 직접 호출
response = requests.post("http://localhost:11434/api/embeddings",
    json={"model": "nomic-embed-text", "prompt": question})
vector = response.json()["embedding"]

# 2. 벡터 검색 - ChromaDB SDK 직접 조작
results = collection.query(query_embeddings=[vector], n_results=5)
docs = results["documents"][0]

# 3. 프롬프트 조립 - 직접 문자열 처리
context = "\n\n".join(docs)
prompt = f"컨텍스트: {context}\n질문: {question}\n답변:"

# 4. LLM 호출 - Ollama API 직접 호출
response = requests.post("http://localhost:11434/api/generate",
    json={"model": "llama3.1:8b", "prompt": prompt})
answer = response.json()["response"]
```

**LangChain 사용 시 (1줄):**

```python
answer = chain.invoke({"question": question, "realtime": realtime})
```

### LangChain이 추상화해주는 것

| 직접 구현 시 | LangChain 제공 |
|------------|--------------|
| Ollama 임베딩 API 호출 코드 | `OllamaEmbeddings` |
| ChromaDB 쿼리 코드 | `Chroma.as_retriever()` |
| 프롬프트 변수 치환 | `PromptTemplate` |
| LLM API 호출 코드 | `OllamaLLM` |
| 위 4개를 순서대로 실행하는 코드 | LCEL `\|` 파이프라인 |

직접 구현도 완전히 가능하며, 다만 코드량이 5~10배 늘어납니다.
