# LLM Evaluation — 답변 품질 평가

> 작성일: 2026-03-19
> 이 프로젝트 답변이 좋은지 나쁜지 판단하는 기준

---

## 왜 평가가 필요한가?

```
"최근 SSH 공격 현황은?"

답변 A: "최근 24시간 SSH 공격 시도가 18건 탐지되었으며,
         주요 공격 IP는 218.92.0.23 (12건)입니다. 위험도: 중간"

답변 B: "SSH 공격이 있었던 것 같습니다. 주의하세요."

어느 쪽이 더 좋은가? → 기준 없이는 판단 불가
```

---

## RAG 평가 핵심 지표 (RAGAS 프레임워크)

| 지표 | 의미 | 이 프로젝트 기준 |
|------|------|----------------|
| **Faithfulness** | 답변이 검색된 로그에 근거하는가 | 로그에 없는 IP 언급 = 낮음 |
| **Answer Relevancy** | 질문에 맞는 답변인가 | "SSH 현황" 질문에 WAF 답변 = 낮음 |
| **Context Recall** | 관련 로그를 빠짐없이 가져왔는가 | 중요한 로그 누락 = 낮음 |
| **Context Precision** | 가져온 로그가 실제로 유용한가 | 무관한 로그 포함 = 낮음 |

---

## 수동 평가 방법

```
체크리스트:
□ 구체적인 수치(건수, IP, 시간)가 포함되어 있는가?
□ 위험도 [낮음/중간/높음/심각]이 명시되었는가?
□ 권고 조치가 실행 가능한가?
□ 실제 로그에 있는 내용만 언급하는가?
□ 질문과 관련 없는 내용이 없는가?
```

---

## 자동 평가 도구

| 도구 | 방식 | 특징 |
|------|------|------|
| **RAGAS** | LLM이 LLM 답변을 평가 | 오픈소스, LangChain 연동 쉬움 |
| **LangSmith** | LangChain 공식 평가/추적 도구 | 유료, 강력한 시각화 |
| **TruLens** | RAG 특화 평가 | 오픈소스 |
| **Phoenix (Arize)** | LLM 옵저버빌리티 + 평가 | 오픈소스 |

---

## 이 프로젝트에 간단히 적용하는 방법

```python
# RAGAS 예시
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

# 테스트 데이터
test_data = {
    "question": ["최근 SSH 공격 현황은?"],
    "answer": [rag_chain.query("최근 SSH 공격 현황은?")],
    "contexts": [retrieved_docs],  # 검색된 로그
}

results = evaluate(test_data, metrics=[faithfulness, answer_relevancy])
print(results)
# → {"faithfulness": 0.87, "answer_relevancy": 0.91}
```

---

## 현실적인 평가 기준

평가 도구 없이도 이것만 확인해도 충분합니다:

```
1. 같은 질문을 3번 해서 답변이 일관적인가? (Temperature=0.1이면 대부분 일관적)
2. 로그에 없는 IP/이벤트를 언급하지 않는가? (Hallucination 체크)
3. 위험도 판단이 실제 로그 건수와 비례하는가?
4. 한국어가 자연스러운가? (qwen2.5:14b 전환 시 체감 가능)
```
