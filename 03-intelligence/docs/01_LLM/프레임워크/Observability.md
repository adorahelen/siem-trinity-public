# LLM Observability — AI 앱 모니터링

> 작성일: 2026-03-19
> LangChain RAG 체인이 내부에서 어떻게 동작하는지 추적/디버깅

---

## Observability란?

LLM 앱에서 **무슨 일이 일어나고 있는지 들여다보는 것**.

```
현재 이 프로젝트:
  질문 → (블랙박스) → 답변

Observability 적용 시:
  질문 → [검색 쿼리 기록] → [검색 결과 기록] → [프롬프트 기록] → [토큰 수] → 답변
          ↕ 추적 가능        ↕ 품질 확인        ↕ 디버깅          ↕ 비용 계산
```

---

## 왜 필요한가?

```
문제 상황:
  "왜 이 질문에 엉뚱한 답변이 나왔지?"
  → 검색이 잘못됐나? 프롬프트가 잘못됐나? LLM이 틀렸나?
  → Observability 없으면 원인 파악 불가

Observability 있으면:
  → 어떤 로그가 검색됐는지 확인
  → 실제 LLM에 넣은 프롬프트 전체 확인
  → 어느 단계에서 잘못됐는지 즉시 파악
```

---

## 대표 도구

| 도구 | 특징 | 비용 |
|------|------|------|
| **LangSmith** | LangChain 공식, 체인 전체 추적 | 무료 플랜 있음 |
| **Phoenix (Arize)** | 오픈소스, 로컬 실행 가능 | 무료 |
| **LangFuse** | 오픈소스, 자체 호스팅 가능 | 무료 |
| **Helicone** | 프록시 방식, 간단 | 부분 유료 |
| **Weave (W&B)** | MLflow 계열, 실험 추적 | 부분 유료 |

---

## LangSmith 연동 방법 (가장 쉬움)

```python
# .env 에 추가
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=xdr-rag

# 코드 변경 없음 — 환경변수만 설정하면 자동 추적
```

설정 후 `app.langchain.com` 에서 확인 가능:
- 각 질문별 체인 실행 흐름
- 검색된 문서 내용
- 실제 LLM 입력/출력 전문
- 토큰 수, 응답 시간

---

## Phoenix (로컬 오픈소스) 연동

```bash
pip install arize-phoenix
```

```python
import phoenix as px
px.launch_app()  # http://localhost:6006 에서 UI 확인

from phoenix.otel import register
register(project_name="xdr-rag")
```

---

## 이 프로젝트에서 추적하면 유용한 것

```
1. 어떤 로그 청크가 검색됐는가?
   → 검색 품질 평가

2. 실제 LLM에 넣은 프롬프트 전체
   → 프롬프트 엔지니어링 디버깅

3. 응답 시간 분포
   → 검색 vs LLM 중 어느 쪽이 병목인지

4. 토큰 사용량 추이
   → 청크 크기 최적화 참고
```
