# SIEM 로그 기반 AI 서비스 분석

> 작성일: 2026-03-21
> 기반: security-log-monitor Grafana 대시보드 4개 분석 결과

---

## 수집 중인 데이터 전체 피처 맵

```
소스                 피처 타입        주요 필드
────────────────────────────────────────────────────────
zeek_conn           수치+범주형      bytes, packets, duration, proto,
                                    conn_state, src_ip, dst_ip, ports
zeek_dns            텍스트+범주형    query(도메인), rcode_name, answers
zeek_http           수치+텍스트      status_code, uri, version, id_resp_h
zeek_ssl            범주형          version, cipher, ja3 해시
zeek_notice/weird   텍스트          note, name, msg (보안 탐지 서술)
auth                텍스트+수치      src_ip, username, count
fail2ban            범주형+수치      src_ip, f2b_action, count
kern                범주형          kern_event, dpt
suricata            수치+텍스트      alert_severity(1-3), signature, src/dst_ip
wazuh               수치+텍스트      level(1-15), description
nginx               수치+범주형      status_code, client_type, ua_family,
                                    country, lat, lon, request_count
modsec              수치            rule_id
syslog              텍스트          process, ERROR/WARNING/CRON 키워드
prometheus          수치            CPU%, Memory%, Disk%
```

---

## 만들 수 있는 AI 서비스 6가지

### 서비스 1. IP 위험도 실시간 스코어링
```
목적: 접속 IP마다 0~100 위험도 점수 자동 산출
입력: SSH시도횟수, fail2ban이력, Suricata알림수,
      WAF탐지수, Wazuh레벨, 국가, 포트분포
출력: 위험도 점수 + 자동 차단 여부 결정
가치: 현재 fail2ban은 SSH만 막음
      이 서비스는 복합 신호를 종합해 차단
```

### 서비스 2. DGA 도메인 탐지 (zeek_dns)
```
목적: 악성코드가 사용하는 자동생성 도메인 탐지
입력: DNS query 도메인명
피처: 도메인 엔트로피, 길이, 모음/자음 비율,
      n-gram 빈도, 숫자 포함 비율
출력: DGA 여부 (정상/의심/악성)
가치: Suricata 시그니처에 없는 신규 악성코드 탐지
```

### 서비스 3. 네트워크 흐름 이상탐지 (zeek_conn)
```
목적: 정상 범위 벗어난 트래픽 자동 탐지
입력: bytes, packets, duration, proto, conn_state
출력: 이상 점수 + 이상 유형 (포트스캔/대용량전송/비콘)
가치: 알려지지 않은 공격 탐지
      내부 감염 장비의 C2 통신 탐지
```

### 서비스 4. 비콘 탐지 (Beaconing) (zeek_conn)
```
목적: 악성코드의 C2 주기적 통신 탐지
입력: dst_ip별 연결 시간 간격 시퀀스
피처: 평균, 표준편차, CoV(변동계수), FFT 주파수
출력: "이 IP에 5분 간격으로 규칙적 통신 의심"
가치: APT 공격의 핵심 탐지
```

### 서비스 5. 웹 공격 패턴 분류 (nginx + modsec)
```
목적: HTTP 요청을 정상/스캐너/봇/공격으로 분류
입력: status_code, uri, ua_family, request_count,
      country, modsec rule_id
출력: 요청 유형 분류 + 차단 여부
```

### 서비스 6. 자연어 보안 보고서 (LLM)
```
목적: 위 5개 결과 + 통계 → 한국어 보고서
입력: 각 서비스 출력값 + Loki 집계 통계
출력: 일간/주간 보안 보고서 자동 생성
```

---

## Case 1. CPU만 사용할 경우

| 서비스 | 알고리즘 | 라이브러리 | 속도 | 정확도 |
|-------|---------|-----------|------|--------|
| IP 위험도 스코어링 | LightGBM | lightgbm | ★★★★★ | ★★★★ |
| DGA 탐지 | RandomForest + 어휘 피처 | scikit-learn | ★★★★★ | ★★★★ |
| 흐름 이상탐지 | Isolation Forest | scikit-learn | ★★★★★ | ★★★ |
| 비콘 탐지 | 통계 (CoV + FFT) | scipy, numpy | ★★★★★ | ★★★★ |
| 웹 공격 분류 | XGBoost | xgboost | ★★★★★ | ★★★★ |
| 보고서 생성 | Ollama llama3.1:8b | ollama | ★★★ | ★★★★ |

```python
# Isolation Forest (흐름 이상탐지)
from sklearn.ensemble import IsolationForest
model = IsolationForest(contamination=0.01, n_jobs=-1)

# LightGBM (IP 스코어링)
import lightgbm as lgb
model = lgb.LGBMClassifier(n_jobs=-1, device='cpu')

# 비콘 탐지 (수학 기반, 모델 불필요)
from scipy.stats import variation
from scipy.fft import fft
cov = variation(intervals)  # 낮을수록 주기적 = 비콘 의심
```

**CPU 한계:**
- DGA 탐지: 문자 수준 딥러닝 불가 → 어휘 피처로 대체
- 흐름 이상탐지: 복잡한 패턴 학습 한계
- LLM 추론: 3~8 tokens/sec (느림)

---

## Case 2. CPU + GPU 함께 사용할 경우

| 서비스 | CPU 버전 | GPU 버전 | 정확도 향상 |
|-------|---------|---------|-----------|
| IP 위험도 스코어링 | LightGBM | LightGBM-GPU | ★ (차이 적음) |
| DGA 탐지 | RandomForest | CNN (문자 임베딩) | ★★★ |
| 흐름 이상탐지 | Isolation Forest | Autoencoder | ★★★ |
| 비콘 탐지 | 통계 기반 | LSTM 시퀀스 | ★★ |
| 웹 공격 분류 | XGBoost | XGBoost-GPU | ★ |
| 보고서 생성 | llama3.1:8b (5 tok/s) | llama3.1:8b Metal (20 tok/s) | 속도 4배 |

---

## 전체 아키텍처 권장안

```
[실시간 탐지 레이어 — CPU, 현재 서버]
  Zeek conn 스트림 → Isolation Forest → 이상 점수
  Zeek dns 스트림  → RandomForest    → DGA 의심
  연결 타이밍      → CoV + FFT       → 비콘 의심
  복합 IP 신호     → LightGBM        → 위험도 점수
           ↓
        [경보 큐]
           ↓
[설명/보고 레이어 — LLM, 맥북 on-demand]
  경보 + 통계 → llama3.1:8b → 한국어 보고서
```

---

## 개발 우선순위

| 순위 | 서비스 | 이유 | 환경 |
|------|-------|------|------|
| **1** | **비콘 탐지** | 코드 50줄, GPU 불필요, 높은 가치 | 현재 서버 |
| **2** | **DGA 탐지** | zeek_dns 이미 수집 중, RandomForest 가능 | 현재 서버 |
| **3** | **흐름 이상탐지** | Isolation Forest, 바로 적용 가능 | 현재 서버 |
| **4** | **IP 위험도 스코어링** | 위 3개 결과를 통합 | 현재 서버 |
| **5** | **LLM 보고서** | 맥북 on-demand | 맥북 M3 |

**1~4번은 현재 서버 CPU만으로 전부 가능합니다.**
GPU는 정확도를 높이지만 없어도 실용적인 탐지가 됩니다.
