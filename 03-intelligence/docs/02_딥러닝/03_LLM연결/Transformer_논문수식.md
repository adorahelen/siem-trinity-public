# Transformer 논문 수식 추적

> 작성일: 2026-03-20
> "Attention is All You Need" (2017) 핵심 수식을 직접 따라가기

---

## 논문 정보

```
제목: Attention Is All You Need
저자: Vaswani et al. (Google Brain)
발표: NeurIPS 2017
링크: https://arxiv.org/abs/1706.03762

역사적 의의:
  RNN/LSTM 없이 순수 Attention만으로
  번역 태스크 SOTA 달성
  이후 모든 LLM의 기반 구조
```

---

## 핵심 수식 1 — Scaled Dot-Product Attention

```
Attention(Q, K, V) = Softmax(QKᵀ / √d_k) · V
```

### 각 항 설명

```
Q (Query):  현재 위치에서 "무엇을 찾는가"
K (Key):    각 위치의 "나는 무엇인가"
V (Value):  각 위치의 "실제 정보"

QKᵀ:
  Q와 K의 행렬 곱 (전치)
  → 각 Query-Key 쌍의 유사도 점수 행렬
  → (sequence_length × sequence_length) 행렬

/ √d_k:
  d_k = Key 벡터의 차원 수
  왜 나누는가?
  → d_k가 크면 내적 값이 커져 Softmax가 극단적으로 날카로워짐
  → 기울기 소실 방지
  → 안정적인 학습

Softmax(·):
  점수 행렬을 확률로 변환 (행별 합 = 1)
  → "각 위치에 얼마나 집중할지" 가중치

· V:
  가중치 × Value의 가중 합
  → 각 위치의 새로운 표현 (문맥 정보 반영됨)
```

---

## 핵심 수식 2 — Multi-Head Attention

```
MultiHead(Q, K, V) = Concat(head₁, ..., headₕ) · Wᴼ

head_i = Attention(Q·Wᵢᴼ, K·Wᵢᴷ, V·Wᵢᵛ)
```

### 각 항 설명

```
h: 헤드 수 (논문: 8개, llama3.1:8b: 32개)

Wᵢᴼ, Wᵢᴷ, Wᵢᵛ:
  각 헤드마다 별도의 선형 변환 행렬 (학습 파라미터)
  → 원본 Q,K,V를 더 작은 차원으로 투영

head_i:
  i번째 헤드의 Attention 결과
  서로 다른 W를 가지므로 서로 다른 관계 포착

Concat:
  모든 헤드의 결과를 이어붙임

· Wᴼ:
  이어붙인 결과를 원래 차원으로 투영 (출력 선형 변환)
```

---

## 핵심 수식 3 — Position-wise Feed-Forward

```
FFN(x) = max(0, xW₁ + b₁)W₂ + b₂
```

### 각 항 설명

```
xW₁ + b₁:
  첫 번째 선형 변환 (차원 확장: d_model → d_ff)
  논문: d_model=512 → d_ff=2048 (4배 확장)

max(0, ·):
  ReLU 활성화 함수 (비선형성 추가)
  현대 LLM: ReLU 대신 GELU, SwiGLU 사용

W₂ + b₂:
  두 번째 선형 변환 (차원 복원: d_ff → d_model)

각 토큰에 독립적으로 적용:
  Attention이 "토큰 간 관계"를 다루면
  FFN은 "각 토큰의 표현 변환"을 담당
```

---

## 핵심 수식 4 — Positional Encoding

```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

### 직관

```
pos: 토큰의 위치 (0, 1, 2, ...)
i: 차원 인덱스
d_model: 모델 차원

왜 sin/cos인가?
  → 서로 다른 주파수의 사인파
  → 각 위치가 고유한 벡터 패턴을 가짐
  → 학습 없이도 위치 정보 인코딩
  → 학습 시 보지 못한 길이에도 일반화 가능

현대 LLM:
  원본 sin/cos → RoPE (Rotary Position Embedding)으로 대체
  더 긴 컨텍스트 처리에 효과적
```

---

## 전체 레이어 구조

```
입력 임베딩 + Positional Encoding
      │
      ▼
┌─────────────────────────────┐
│  Encoder Layer (N번 반복)   │
│  ┌──────────────────────┐   │
│  │ Multi-Head Attention  │   │
│  └──────────────────────┘   │
│           + (residual)      │
│      Layer Norm             │
│  ┌──────────────────────┐   │
│  │  Feed-Forward Network │   │
│  └──────────────────────┘   │
│           + (residual)      │
│      Layer Norm             │
└─────────────────────────────┘

residual connection:
  output = LayerNorm(x + sublayer(x))
  → x를 더함으로써 기울기 소실 방지
  → ResNet의 Skip Connection과 동일 아이디어
```

---

## 논문 하이퍼파라미터

```
원본 Transformer (번역 모델):
  N (레이어 수): 6
  d_model: 512
  d_ff: 2048
  h (헤드 수): 8
  d_k = d_v: 64

llama3.1:8b:
  N: 32
  d_model: 4096
  d_ff: 14336
  h: 32
  → 원본 대비 규모 대폭 확장
```
