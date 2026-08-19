# PyTorch 기초 — 신경망 직접 구현

> 작성일: 2026-03-20
> 딥러닝 프레임워크 — 수식을 코드로 직접 확인하는 방법

---

## PyTorch란

```
Meta(Facebook AI Research)가 개발한 딥러닝 프레임워크
Python 기반, 직관적 API
연구자와 실무자 모두 사용하는 업계 표준

경쟁 프레임워크:
  TensorFlow (Google): 초기 대세 → 현재 PyTorch에 밀림
  JAX (Google): 연구 커뮤니티 일부 사용
  현재: 연구/프로덕션 모두 PyTorch가 표준
```

---

## 핵심 개념 — Tensor

```
PyTorch의 기본 데이터 구조
= NumPy 배열 + GPU 연산 + 자동 미분

차원:
  0차원 (스칼라): tensor(3.14)
  1차원 (벡터):  tensor([1, 2, 3])
  2차원 (행렬):  tensor([[1,2],[3,4]])
  n차원:         이미지(batch, channel, height, width), 텍스트(batch, seq, dim)

GPU 이동:
  tensor.to("cuda")  → GPU로
  tensor.to("mps")   → Apple Silicon Metal (이 프로젝트 맥북)
```

---

## 자동 미분 (Autograd)

```
PyTorch의 핵심 기능 — 역전파를 자동으로 계산

requires_grad=True 로 설정된 텐서에 대해
연산 그래프를 자동으로 추적
.backward() 호출 시 모든 기울기 자동 계산

원리:
  순전파 시 연산 기록 (계산 그래프)
  역전파 시 연쇄 법칙 자동 적용
  → 직접 미분 계산 불필요
```

---

## 신경망 구조 정의 (nn.Module)

```python
# 개념 설명용 코드

class SimpleNet(nn.Module):
    def __init__(self):
        super().__init__()
        # 레이어 정의 (파라미터 자동 등록)
        self.layer1 = nn.Linear(입력차원, 은닉차원)
        self.layer2 = nn.Linear(은닉차원, 출력차원)
        self.relu = nn.ReLU()

    def forward(self, x):
        # 순전파 정의
        x = self.relu(self.layer1(x))
        x = self.layer2(x)
        return x
```

```
nn.Module:
  모든 신경망의 기본 클래스
  파라미터 자동 관리
  GPU 이동, 저장/불러오기 지원

forward():
  입력 → 출력 변환 정의
  역전파는 Autograd가 자동 처리
```

---

## 학습 루프

```python
# 표준 학습 루프 개념

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(num_epochs):
    for batch in dataloader:
        # 1. 순전파
        output = model(batch.input)

        # 2. 손실 계산
        loss = loss_fn(output, batch.label)

        # 3. 기울기 초기화 (누적 방지)
        optimizer.zero_grad()

        # 4. 역전파 (기울기 계산)
        loss.backward()

        # 5. 파라미터 업데이트
        optimizer.step()
```

---

## Hugging Face Transformers — PyTorch 위에서

```
LLM 사용의 표준 라이브러리
PyTorch를 기반으로 Transformer 모델 추상화

제공:
  수천 개 사전학습 모델 (llama, qwen, bert 등) 바로 사용
  토크나이저 통합
  파인튜닝 파이프라인 (Trainer API)
  LoRA/QLoRA 지원 (PEFT 라이브러리)

이 프로젝트와의 관계:
  langchain-ollama: Ollama를 통해 간접 사용
  직접 PyTorch/Transformers 코드는 없음
  파인튜닝 시 Hugging Face Transformers + PEFT 사용
```

---

## Ollama vs PyTorch/Transformers

```
Ollama:
  목적: 추론 전용 (이미 학습된 모델 실행)
  특징: 단순 API, 최적화된 추론 (llama.cpp 기반)
  사용 시: 모델을 그냥 실행하고 싶을 때

PyTorch + Transformers:
  목적: 학습 + 추론 모두 가능
  특징: 풀 컨트롤, 파인튜닝, 커스텀 모델
  사용 시: 파인튜닝, 실험, 연구할 때

이 프로젝트:
  Ollama → 추론만 (현재)
  파인튜닝 계획 시 → PyTorch + Transformers + PEFT 로 전환
```

---

## 직접 구현해보기 — Attention 수식 검증

```python
# Transformer_논문수식.md 의 수식을 코드로 확인

import torch
import torch.nn.functional as F

def scaled_dot_product_attention(Q, K, V):
    d_k = Q.size(-1)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_k ** 0.5)
    weights = F.softmax(scores, dim=-1)
    output = torch.matmul(weights, V)
    return output

# Attention(Q, K, V) = Softmax(QKᵀ / √d_k) · V
# 논문 수식 그대로 코드로 표현됨
```

```
이것이 PyTorch를 배워야 하는 이유:
  논문의 수식 → 코드로 직접 확인
  블랙박스였던 LLM 내부 동작을 눈으로 검증
  파인튜닝, 실험으로 이어지는 기반
```
