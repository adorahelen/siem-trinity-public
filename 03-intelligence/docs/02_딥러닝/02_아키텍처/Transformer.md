# Transformer

> 작성일: 2026-03-20
> "Attention is All You Need" (2017, Google) — 모든 LLM의 기반 구조

---

## 등장 배경

```
2017년 이전:
  텍스트 처리 = RNN/LSTM
  문제: 순차 처리 → GPU 병렬화 불가 → 느림
        긴 문장의 앞부분 정보 소실

Transformer의 해결:
  순차 처리 완전 제거
  모든 토큰을 동시에 처리 (완전 병렬)
  Attention으로 모든 위치 간 직접 연결
```

---

## 핵심 혁신 — Self-Attention

```
RNN: "나는 오늘 서울에서 출발해 ... 왔다" → 순서대로 읽음
Transformer: 모든 단어를 한 번에 보고 서로의 관계를 계산

"나는 오늘 서울에서 출발해 부산을 거쳐 제주도에 도착한 여행자는 [?]에서 왔다"

Attention이 계산하는 것:
  "[?]" 토큰이 "서울"을 가장 강하게 참조해야 함
  거리에 관계없이 직접 연결
```

---

## Transformer 전체 구조

```
원본 논문의 구조 (번역 태스크):

인코더 (Encoder)          디코더 (Decoder)
  입력 텍스트 처리           출력 텍스트 생성
  "나는 밥을 먹었다"    →    "I ate rice"
```

### 현대 LLM은 디코더만 사용

```
GPT 계열 (Decoder-only):
  llama3.1:8b, GPT-4, Claude, qwen2.5
  "다음 토큰 예측"에 최적화
  → 대화, 텍스트 생성에 적합

BERT 계열 (Encoder-only):
  문장 이해, 분류, 임베딩에 최적화
  nomic-embed-text 같은 임베딩 모델
  → 검색, 분류에 적합

T5, BART (Encoder-Decoder):
  번역, 요약에 적합
```

---

## 주요 구성 요소

### 토크나이저 (Tokenizer)

```
텍스트 → 숫자(토큰) 변환

"안녕하세요" → [12456, 8901, 234]

토큰 ≠ 단어
  "unhappiness" → ["un", "happiness"] (2 토큰)
  한국어: "안녕" → ["안", "##녕"] (서브워드 분리)

어휘 크기: llama3.1 = 128,000 토큰
```

### 포지셔널 인코딩 (Positional Encoding)

```
Attention은 순서 정보가 없음
→ 각 토큰에 위치 정보를 직접 추가

"나는 밥을 먹었다" vs "밥을 나는 먹었다"
→ 위치 인코딩으로 순서 구분
```

### Multi-Head Attention

```
Attention을 여러 개(헤드) 병렬로 수행

각 헤드가 서로 다른 관계에 집중:
  헤드 1: 문법적 관계 (주어-동사)
  헤드 2: 의미적 관계 (동의어)
  헤드 3: 참조 관계 (대명사 → 명사)

llama3.1:8b: 32개 헤드
```

### Feed-Forward Network

```
Attention 후 각 토큰에 독립적으로 적용
비선형 변환 → 패턴 강화
```

### 레이어 정규화 (Layer Norm)

```
각 레이어 전후에 정규화
학습 안정화, 기울기 소실 방지
```

---

## Transformer의 스케일링 법칙

```
더 많은 파라미터 + 더 많은 데이터 + 더 많은 계산
= 예측 가능하게 성능 향상

이것이 GPT-3(175B) → GPT-4(추정 1.8T) 방향의 근거

한계도 있음:
  단순히 크기만 늘려서는 특정 추론 능력 미획득
  → 데이터 품질, 다양성도 중요
```

---

## 주요 Transformer 모델 계보

```
2017  Transformer 원본 (Google, 번역)
2018  BERT (Google, 양방향 인코더)
2018  GPT-1 (OpenAI, 디코더)
2019  GPT-2 (OpenAI, 15억 파라미터)
2020  GPT-3 (OpenAI, 1,750억 파라미터)
2022  ChatGPT (GPT-3.5 + RLHF)
2023  LLaMA (Meta, 오픈소스)
2023  GPT-4 (OpenAI, 멀티모달)
2024  LLaMA 3, Qwen2.5, Mistral
2025  추론 모델 (o3, DeepSeek-R1, QwQ)
```
