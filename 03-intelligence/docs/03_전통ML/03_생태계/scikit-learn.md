# scikit-learn — 전통 ML 표준 라이브러리

> 작성일: 2026-03-20
> LangChain이 LLM 생태계 표준이듯, scikit-learn은 전통 ML의 표준

---

## 개요

```
이름:     scikit-learn (sklearn)
언어:     Python
출시:     2007년 (INRIA, 프랑스)
라이선스: BSD (상업적 사용 무료)
위치:     전통 ML 분야의 사실상 표준 라이브러리
```

**특징:**
- 통일된 API로 모든 알고리즘 사용 (`fit`, `predict`, `transform`)
- 전처리 → 훈련 → 평가 → 파이프라인까지 한 라이브러리에서 처리
- NumPy, Pandas와 자연스럽게 연동

---

## 핵심 API 구조

모든 알고리즘이 동일한 인터페이스를 따름:

```
모델 생성  → 훈련      → 예측
Model()   → .fit()   → .predict()

예측기(Estimator):  fit() + predict()
변환기(Transformer): fit() + transform()
파이프라인:          여러 단계 연결
```

---

## 제공 기능 범위

### 알고리즘

```
분류:    LogisticRegression, RandomForestClassifier, SVC, KNeighborsClassifier
회귀:    LinearRegression, Ridge, Lasso, SVR
군집화:  KMeans, DBSCAN, AgglomerativeClustering
차원축소: PCA, TruncatedSVD
앙상블:  RandomForest, GradientBoosting, VotingClassifier
```

### 전처리

```
스케일링:    StandardScaler, MinMaxScaler
인코딩:      LabelEncoder, OneHotEncoder
결측값 처리: SimpleImputer
```

### 평가

```
분류:  accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
회귀:  mean_squared_error, r2_score
교차검증: cross_val_score, KFold, StratifiedKFold
```

### 파이프라인

```
여러 단계를 하나로 묶어 실수 방지 + 코드 간결화

단계:
  1. 전처리 (스케일링, 인코딩)
  2. 피처 선택
  3. 모델 훈련
  → Pipeline으로 연결하면 fit/predict 한 번에 처리
```

---

## 생태계 비교

| | scikit-learn | LangChain |
|--|-------------|----------|
| 대상 | 전통 ML | LLM 기반 앱 |
| 핵심 역할 | 알고리즘 + 평가 + 파이프라인 | Chain + Retriever + Agent |
| GPU 필요 | 없음 | 있음 (LLM 실행 시) |
| 출력 | 숫자 (클래스, 확률) | 텍스트 (자연어) |
| 표준 지위 | ML 표준 | LLM 앱 사실상 표준 |

---

## scikit-learn이 다루지 않는 것

```
딥러닝:     PyTorch, TensorFlow, Keras 사용
LLM:        LangChain, Ollama, Hugging Face Transformers
대규모 분산: Spark MLlib
XGBoost:    별도 라이브러리 (XGBoost, LightGBM)
           → sklearn API 호환 인터페이스 제공
```

---

## 관련 전통 ML 생태계

```
데이터 처리:  NumPy, Pandas
시각화:      Matplotlib, Seaborn
고성능 부스팅: XGBoost, LightGBM, CatBoost  (sklearn과 호환)
자동 ML:     AutoML (H2O, AutoSklearn)       (sklearn 기반)
모델 저장:   joblib, pickle
모델 서빙:   FastAPI + joblib               (학습된 모델을 API로 배포)

딥러닝으로 넘어가면:
  PyTorch → Hugging Face Transformers → LangChain / Ollama
```

---

## 이 프로젝트와 관계

```
이 프로젝트:
  scikit-learn: 미사용
  사용 라이브러리: LangChain, ChromaDB, Ollama (langchain-ollama)

만약 전통 ML로 구현했다면:
  scikit-learn으로 Suricata/Wazuh alert 분류기 훈련
  → joblib으로 모델 저장
  → FastAPI로 예측 API 서빙
  → 새 alert를 실시간으로 분류

현재 LLM+RAG 방식과 병행 가능한 시나리오:
  scikit-learn 분류기 → 1차 빠른 필터링 (밀리초)
  LLM+RAG          → 고위험 alert만 상세 분석 (수초)
  → 속도 + 품질 균형
```
