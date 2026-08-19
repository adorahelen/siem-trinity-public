# Semantic Search vs Keyword Search

> 작성일: 2026-03-19
> 관련 파일: `embedder.py`, `rag_chain.py`

---

## 한 줄 요약

```
Keyword Search: 단어가 일치하는지 찾음 ("SSH" → "SSH" 있는 것만)
Semantic Search: 의미가 비슷한지 찾음 ("SSH" → "Secure Shell", "port 22" 도 찾음)
```

---

## Keyword Search (키워드 검색)

전통적인 검색 방식. `grep`, `LIKE`, `CONTAINS` 등.

```bash
# 예시: Loki에서 키워드 검색
{job="auth"} |= "Invalid user"

# 장점: 빠름, 정확한 문자열 매칭
# 단점: 단어가 조금만 달라도 못 찾음
```

```
"Invalid user" 검색 →  "Invalid user admin"  ✅ 찾음
                    →  "failed login attempt" ❌ 못 찾음 (같은 의미지만 단어 다름)
```

---

## Semantic Search (의미 검색)

임베딩 기반 벡터 검색. 이 프로젝트의 ChromaDB 검색 방식.

```
"SSH 공격 IP 알려줘" 검색
→ 임베딩 변환 → 벡터 공간에서 유사한 것 찾기
→ "Invalid user admin from 218.92.0.23" ✅
→ "brute force detected port 22"         ✅ (단어 달라도 의미 유사)
→ "fail2ban Ban 218.92.0.23"             ✅
```

---

## 이 프로젝트에서 두 방식의 역할 분담

```
Loki API 쿼리 (loki_client.py):
  → Keyword Search 방식
  → {job="auth"} |= "Invalid user"
  → 정확한 이벤트 타입, 라벨로 필터링
  → 빠르고 정확한 집계에 강함

ChromaDB 검색 (rag_chain.py):
  → Semantic Search 방식
  → "최근 이상한 패턴 있어?" 같은 자연어 질문
  → 의미 기반으로 관련 로그 검색
  → RAG 컨텍스트 구성에 사용
```

---

## BM25 — Keyword와 Semantic 사이

BM25는 키워드 검색이지만 단순 일치보다 스마트합니다.

```
특징:
- 자주 등장하는 단어보다 희귀한 단어에 높은 점수 (IDF)
- 문서 길이 보정
- 엘라스틱서치의 기본 검색 알고리즘

Semantic 보다 나은 점:
  "218.92.0.23" 같은 정확한 IP → BM25가 정확히 찾음
  의미 벡터에서는 IP 주소 구분이 약할 수 있음
```

---

## 하이브리드 검색 (2024+ 트렌드)

```
BM25 점수 + 벡터 유사도 점수 → RRF(Reciprocal Rank Fusion)로 통합

사용자: "218.92.0.23 이 뭘 했어?"
  BM25:   "218.92.0.23" 정확히 포함된 로그 → 높은 점수
  Vector: "공격 시도" 의미와 유사한 로그 → 높은 점수
  통합:   두 방식 모두에서 높은 점수 받은 로그 최상위
```
