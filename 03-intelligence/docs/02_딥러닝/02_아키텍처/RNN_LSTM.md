# RNN / LSTM — 순서가 있는 데이터 처리

> 작성일: 2026-03-20
> Transformer 이전 텍스트/시계열 처리의 표준 — 그리고 왜 Transformer에 밀렸는가

---

## 등장 배경

```
CNN의 한계:
  이미지(공간적 패턴)는 잘 처리
  텍스트(순서가 중요한 데이터)는 처리 어려움

"오늘 날씨가 맑다" vs "맑다 날씨가 오늘"
  의미가 다르지만 CNN은 순서를 무시

RNN의 해결책:
  이전 단어를 기억하면서 순서대로 처리
```

---

## RNN (Recurrent Neural Network)

```
핵심 아이디어: 이전 상태를 다음 단계로 전달

time=1: "오늘" 입력 → hidden state h1 생성
time=2: "날씨" + h1 → hidden state h2 생성
time=3: "맑다" + h2 → hidden state h3 생성 → 출력

hidden state = 이전까지의 "기억"
```

---

## RNN의 한계 — 장기 의존성 문제

```
"오늘 서울에서 출발해 부산을 거쳐 제주도에 도착한 여행자는 ___에서 왔다"

정답: "서울"
문제: "서울"은 문장 맨 앞, 정답은 맨 뒤
      문장이 길수록 초반 정보가 소실됨

원인: 역전파 시 기울기 소실
      → 먼 과거 정보가 현재에 영향을 주지 못함
```

---

## LSTM (Long Short-Term Memory)

```
RNN의 장기 의존성 문제를 해결하기 위해 1997년 등장

핵심 아이디어: "기억 셀(cell state)" 추가
              무엇을 기억하고, 무엇을 잊을지 제어하는 게이트

3개의 게이트:
  망각 게이트 (Forget Gate)  : 이전 기억 중 무엇을 잊을지
  입력 게이트 (Input Gate)   : 새 정보 중 무엇을 기억할지
  출력 게이트 (Output Gate)  : 현재 셀에서 무엇을 출력할지
```

---

## GRU (Gated Recurrent Unit)

```
LSTM의 간소화 버전 (2014년)

LSTM 게이트 3개 → GRU 게이트 2개
파라미터 수 감소 → 학습 빠름
성능은 LSTM과 비슷한 수준

소형 모델, 빠른 학습이 필요할 때 선호
```

---

## RNN/LSTM의 한계 — 왜 Transformer에 밀렸나

```
① 순차 처리 → 병렬화 불가
  "나는 오늘 밥을 먹었다" → 나→는→오늘→밥→을→먹→었→다 순서대로 처리
  GPU의 병렬 연산을 활용하지 못함
  긴 문장일수록 학습 느림

② 여전한 장기 의존성 한계
  LSTM이 개선했지만, 매우 긴 문장에서는 여전히 정보 소실

③ 컨텍스트 창 제한
  처리할 수 있는 시퀀스 길이에 실질적 한계

Transformer의 해결:
  모든 토큰을 동시에 처리 (병렬화 가능)
  Attention으로 먼 거리 의존성도 직접 연결
  GPU 활용률 극대화
```

---

## RNN/LSTM 계보

```
1986  RNN 기본 개념 (Backpropagation Through Time)
1997  LSTM 등장 (Hochreiter & Schmidhuber)
2014  GRU 등장 (Cho et al.)
2015  seq2seq (번역 모델의 표준)
2017  Transformer 등장 → RNN 계열 대체 시작
2019~ BERT, GPT 등 Transformer 기반이 NLP 표준 점령
```

---

## 현재 사용 현황

```
대부분의 NLP (텍스트): Transformer로 대체됨

여전히 RNN/LSTM이 쓰이는 곳:
  - 시계열 예측 (주가, 센서 데이터) — 간단한 경우
  - 엣지 디바이스 (경량 모델 필요 시)
  - 오래된 레거시 시스템

보안 도메인:
  시계열 이상탐지 (서버 메트릭 변화 감지)에 LSTM 아직 사용
  → 하지만 Transformer 기반으로 점차 이동 중
```
