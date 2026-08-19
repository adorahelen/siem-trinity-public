# MMR 검색 (Maximal Marginal Relevance)

> 작성일: 2026-03-19
> 관련 파일: `rag_chain.py` — `search_type="mmr"`

---

## 왜 일반 유사도 검색을 안 쓰는가?

일반 유사도 검색(Cosine Similarity)의 문제:

```
질문: "SSH 공격 현황"

일반 검색 결과 (상위 5개):
  1. "Invalid user admin from 218.92.0.23" (유사도 0.95)
  2. "Invalid user admin from 218.92.0.23" (유사도 0.94) ← 거의 동일
  3. "Invalid user admin from 218.92.0.23" (유사도 0.93) ← 거의 동일
  4. "Invalid user root from 218.92.0.23"  (유사도 0.91)
  5. "Invalid user admin from 218.92.0.23" (유사도 0.90) ← 또 동일

→ 같은 IP의 반복 로그만 가져옴
→ 다른 공격자 IP, 다른 시간대 정보 누락
```

---

## MMR이란?

**유사도는 높으면서 + 이미 선택된 결과와는 다른** 것을 선택하는 알고리즘.

```
MMR 검색 결과 (상위 5개):
  1. "Invalid user admin from 218.92.0.23" (유사도 높음)
  2. "Invalid user root from 45.134.144.80"  ← 다른 IP
  3. "Invalid user ubuntu from 193.32.162.99" ← 또 다른 IP
  4. "fail2ban Ban 218.92.0.23"               ← 다른 이벤트 유형
  5. "Invalid user admin from 192.241.236.13" ← 다른 IP

→ 다양한 공격자, 다양한 이벤트 유형 → 더 풍부한 컨텍스트
```

---

## 수식으로 보기 (간단히)

```
일반 검색: 점수 = 유사도(질문, 문서)

MMR 점수 = λ × 유사도(질문, 문서)
          - (1-λ) × max(유사도(문서, 이미선택된문서))

λ=1: 순수 유사도 검색
λ=0: 최대 다양성
λ=0.5: 균형 (일반적)
```

---

## 이 프로젝트 설정

```python
retriever = vectorstore.as_retriever(
    search_type="mmr",
    search_kwargs={
        "k": 5,        # 최종 반환 개수
        "fetch_k": 20  # MMR 계산을 위해 먼저 가져올 후보 수
    }
)
```

**동작 순서:**
1. 질문과 유사한 청크 20개(fetch_k)를 먼저 가져옴
2. 20개 중에서 MMR 알고리즘으로 다양성 고려해 5개(k) 선택
3. 선택된 5개를 컨텍스트로 LLM에 전달

---

## fetch_k vs k 튜닝

| 설정 | 효과 |
|------|------|
| fetch_k 크게 (50+) | 더 넓은 후보에서 선택 → 다양성↑ but 속도↓ |
| k 크게 (10+) | 더 많은 컨텍스트 → 풍부한 답변 but 토큰↑ |
| k=5, fetch_k=20 | 현재 설정, 속도와 품질 균형 |
