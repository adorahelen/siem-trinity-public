# Context Window & Token

> 작성일: 2026-03-19
> 관련 파일: `embedder.py` — 청킹이 필요한 근본 이유

---

## Token이란?

LLM이 텍스트를 처리하는 **최소 단위**. 단어와 비슷하지만 다릅니다.

```
"SSH attack detected from 218.92.0.23"
→ ["SSH", " attack", " detected", " from", " 218", ".", "92", ".", "0", ".", "23"]
→ 11 tokens

한국어는 영어보다 토큰 수가 많음:
"공격이 탐지되었습니다" → 약 8~12 tokens
```

**1 token ≈ 영어 단어 0.75개 / 한국어 글자 1~2개**

---

## Context Window란?

LLM이 **한번에 처리할 수 있는 최대 토큰 수**.
이 범위를 넘으면 앞부분이 잘리거나 에러 발생.

```
[프롬프트 + 검색된 로그 + 질문] 전체가 Context Window 안에 들어와야 함
```

---

## 모델별 Context Window 비교

| 모델 | Context Window | 한국어 로그 기준 |
|------|---------------|----------------|
| `llama3.1:8b` | 128,000 tokens | 약 6~10만 줄 |
| `qwen2.5:14b` | 128,000 tokens | 약 6~10만 줄 |
| `nomic-embed-text` | 8,192 tokens | 청크 하나의 한계 |
| GPT-4o | 128,000 tokens | — |
| Claude Sonnet | 200,000 tokens | — |

---

## 왜 Chunking이 필요한가?

```
전체 로그 100,000줄 → 임베딩 모델(nomic-embed-text)에 넣으면?
→ nomic-embed-text Context Window: 8,192 tokens
→ 100,000줄 = 수백만 tokens → 완전 초과 → 에러

해결: 20줄씩 잘라서 (청킹) 각각 임베딩
→ 청크 하나 = 20줄 ≈ 수백 tokens → 8,192 이내 → 정상
```

---

## 이 프로젝트의 토큰 흐름

```
[시스템 프롬프트]     약 300 tokens
[검색된 로그 5청크]   약 2,000 tokens  (청크당 400 tokens × 5)
[실시간 현황]         약 100 tokens
[사용자 질문]         약 50 tokens
─────────────────────────────────────
총계                  약 2,450 tokens  ← llama3.1:8b 128K 이내 여유
```

---

## Context Window 한계 시 발생하는 문제

```
문제 1: Lost in the Middle
  컨텍스트가 길어질수록 LLM이 중간 부분을 무시하는 경향
  → 검색 결과를 5개로 제한 (k=5)한 이유 중 하나

문제 2: 앞부분 잘림
  초과 시 오래된 대화 기록부터 삭제됨
  → 긴 대화 세션에서 초반 로그를 잊어버리는 현상

문제 3: 속도 저하
  토큰이 많을수록 추론 시간 증가
```

---

## 토큰 비용 (클라우드 LLM 사용 시)

```
OpenAI GPT-4o 기준:
  입력: $2.50 / 1M tokens
  출력: $10.00 / 1M tokens

이 프로젝트가 로컬(Ollama)을 쓰는 이유 중 하나:
  토큰 비용 $0 + 보안 로그를 외부로 전송하지 않음
```
