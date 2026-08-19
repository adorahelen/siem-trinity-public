# SIEM AI Detector — Claude Code 개발 지시서

> 이 문서는 Claude Code가 읽고 개발을 시작하기 위한 컨텍스트 문서입니다.
> 최초 작성: 2026-03-21 | 최종 업데이트: 2026-03-22
> 실행 환경: Ubuntu Server (Ryzen 5 5500GT, 16GB RAM, 256GB NVMe)
> **현재 상태: 구현 완료 + Docker 배포 운영 중 (UI Phase 2 완료)**

---

## 1. 프로젝트 개요

### 목적
`security-log-monitor`가 수집하는 Zeek/Suricata/auth/fail2ban 로그를 기반으로
**CPU만으로 실시간 동작하는 AI 위협 탐지 엔진**을 운영한다.

### 핵심 원칙
- `security-log-monitor` 스택은 **절대 건드리지 않는다** (Suricata, Zeek, Loki, Grafana 등)
- **Loki HTTP API 읽기 전용** — 로그 파일 직접 접근 금지
- **CPU only** — GPU 없이 동작 (scikit-learn, scipy)
- **독립 실행 가능** — 각 탐지기는 단독으로도 실행 가능
- **한국어 출력** — 모든 경보/보고서는 한국어

### 구현 완료 목록
1. ✅ **비콘 탐지기** (beacon_detector.py) — CoV + FFT
2. ✅ **DGA 탐지기** (dga_detector.py) — Shannon Entropy + 어휘 분석
3. ✅ **흐름 이상탐지기** (flow_anomaly_detector.py) — Isolation Forest
4. ✅ **IP 위험도 스코어러** (ip_risk_scorer.py) — 가중치 합산
5. ✅ **FastAPI 백엔드** (api/main.py) — REST API + APScheduler 30분 자동 실행
6. ✅ **React UI** (ui/) — Recharts 대시보드, 6탭 구조, 날짜 선택, 즉시 실행 버튼

---

## 2. 서버 환경

### 스펙
```
OS:  Ubuntu Server
CPU: AMD Ryzen 5 5500GT (6코어 12스레드)
RAM: 16GB
SSD: NVMe 256GB
```

### Loki 접근 정보
```
Docker 컨테이너 내부: http://loki:3100
  (security-log-monitor_default 네트워크로 접근)

호스트 직접 실행 시: http://localhost:3100

Loki 상태 확인:
  curl http://localhost:3100/ready

주의: Loki가 "Ingester not ready" 응답할 때도
      query_range는 정상 동작함
```

### Loki labels 구조 (Zeek conn 기준)
```
Promtail이 Zeek JSON 필드를 labels로 파싱함:
  id_orig_h  → 출발 IP  (src_ip 아님)
  id_resp_h  → 목적지 IP (dst_ip 아님)
  id_resp_p  → 목적지 포트 (dst_port 아님)
  proto, conn_state, orig_bytes, resp_bytes 등

코드에서 반드시 labels 우선 조회:
  labels.get("id_orig_h") or line_data.get("src_ip")
```

### 사용 가능한 Loki job 목록
```
zeek_conn    → id_orig_h, id_resp_h, id_resp_p, proto, conn_state,
               orig_bytes, resp_bytes, orig_pkts, resp_pkts, duration
zeek_dns     → query(도메인), rcode_name, answers
zeek_notice  → note, msg, src_ip
zeek_weird   → name, src_ip
auth         → SSH 로그인 시도 (|= "Invalid user")
fail2ban     → f2b_action="Ban" | f2b_action="Unban"
suricata     → alert_severity, alert_signature (| json | event_type="alert")
wazuh        → level=~"([7-9]|1[0-5])"
kern         → kern_event="[KR-BLOCK]", dpt
nginx_access_enriched → client_type, status_code, src_ip
modsec       → rule_id
```

### 운영 중인 Docker 서비스
```
[건드리지 말 것 — security-log-monitor 스택]
loki, grafana, prometheus, promtail
suricata (호스트 직접), zeek (호스트 직접)
wazuh, fail2ban (호스트 직접)

[건드리지 말 것 — app-stack 스택]
dodgers-nginx-1, dodgers-frontend-1, dodgers-secure-llm-1 등

[이 프로젝트]
siem-api  → http://100.x.x.x:2027  (Tailscale 내부망 전용)
```

### 서버 전체 접근 구조
```
외부망 (인터넷)
  └── <your-domain>:<port>  →  포트폴리오 사이트

내부망 (Tailscale 100.x.x.x)
  ├── :2027  →  siem-ai-detector (이 프로젝트)
  ├── :3000  →  Grafana
  └── :9090  →  Prometheus

localhost only
  ├── :3100  →  Loki API
  ├── :11434 →  Ollama API
  └── :55000 →  Wazuh API
```

---

## 3. 프로젝트 디렉토리 구조

```
~/siem-ai-detector/
├── CLAUDE.md                    # 이 파일
├── README.md                    # 프로젝트 문서
├── AI_서비스_분석.md             # 서비스/알고리즘 분석 문서
│
├── Dockerfile                   # 멀티스테이지 빌드 (Node 20 → Python 3.12-slim)
├── docker-compose.yml           # 배포 설정
├── .dockerignore
├── requirements.txt             # 호스트 직접 실행용
├── requirements.docker.txt      # Docker 빌드용 (lightgbm 제외, fastapi/uvicorn/apscheduler 포함)
├── .env                         # 호스트 실행용 (LD_LIBRARY_PATH 포함)
├── config.py                    # 공통 설정 (env 로드, is_internal_ip)
├── run.sh                       # 호스트 직접 실행 래퍼 (LD_LIBRARY_PATH 설정)
│
├── loki_client.py               # Loki API 공통 클라이언트
├── beacon_detector.py           # [1] 비콘 탐지 (CoV + FFT)
├── dga_detector.py              # [2] DGA 탐지 (Entropy + 어휘 분석)
├── flow_anomaly_detector.py     # [3] 흐름 이상탐지 (Isolation Forest)
├── ip_risk_scorer.py            # [4] IP 위험도 스코어링 (가중치 합산)
├── alert_manager.py             # 경보 통합 관리 (stdout + JSONL 파일)
├── run_all.py                   # 전체 탐지기 일괄 실행 (API에서 호출)
│
├── api/
│   ├── __init__.py
│   └── main.py                  # FastAPI + APScheduler (30분 자동 실행)
│
├── ui/                          # React + Recharts 대시보드 (6탭)
│   ├── package.json             # recharts, react, vite
│   ├── vite.config.js           # dev proxy → localhost:8000
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # 메인 상태 관리 (탭 6개, 날짜, 필터, 폴링, 모달)
│       ├── api.js               # fetch 유틸 (fetchSummary, fetchAlerts, fetchCompare 등)
│       └── components/
│           ├── Header.jsx       # 날짜 드롭다운 + 상태 + 실행 버튼
│           ├── SummaryCards.jsx # Critical/High/Medium 카운트 카드
│           ├── Charts.jsx       # 바차트 + 파이차트 + 라인차트 + 히트맵(시간×심각도)
│           ├── AlertTable.jsx   # 필터 + 페이지네이션 테이블 (행 클릭 → AlertModal)
│           ├── AlertModal.jsx   # 경보 상세 모달 (위험 원인 설명 + 탐지기별 분석 데이터)
│           ├── DetectorView.jsx # 탐지기별 전용 테이블 (비콘/DGA/흐름이상 고유 컬럼)
│           ├── IPRiskView.jsx   # IP 위험도 전용 뷰 (수평 바차트 + 신호 상세 테이블)
│           └── CompareView.jsx  # 날짜 비교 뷰 (두 날짜 요약·추이·탐지기/심각도 비교)
│
├── models/                      # Docker 볼륨 (./models:/app/models)
│   └── isolation_forest.pkl     # 최초 실행 시 학습, 이후 재사용
│
├── data/                        # 학습용 데이터 캐시 (gitignore)
└── reports/                     # Docker 볼륨 (./reports:/app/reports)
    └── alerts_YYYY-MM-DD.jsonl  # 탐지 결과 (JSONL 형식)
```

---

## 4. Docker 배포

### 환경 변수 (docker-compose.yml)
```env
TZ=Asia/Seoul
LOKI_URL=http://loki:3100
ALERT_LOG_PATH=/app/reports
BEACON_THRESHOLD_COV=0.3
BEACON_MIN_CONNECTIONS=10
DGA_ENTROPY_THRESHOLD=3.5
FLOW_CONTAMINATION=0.01
IP_RISK_HIGH_THRESHOLD=70
IP_RISK_CRITICAL_THRESHOLD=90
```

### 주요 명령
```bash
# 빌드 및 시작
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 재시작 (환경 변수 변경 시)
docker compose up -d

# 컨테이너 접속
docker exec -it siem-api bash
```

### API 엔드포인트
```
GET  /api/status          → 실행 상태, 마지막/다음 실행 시간
GET  /api/summary         → 경보 요약 (by_detector, by_verdict, hourly, heatmap{"HH":{"verdict":N}})
GET  /api/alerts          → 경보 목록 (날짜/탐지기/심각도 필터, 페이지네이션, limit 최대 200)
GET  /api/history         → 경보 기록이 있는 날짜 목록
GET  /api/compare         → 두 날짜 요약 비교 (?date1=YYYY-MM-DD&date2=YYYY-MM-DD)
POST /api/run             → 즉시 탐지기 실행 (이미 실행 중이면 409)
```

### 자동 실행 스케줄
```
APScheduler (컨테이너 내부):
  - 30분 간격 (Ryzen 5 5500GT CPU only 기준)
  - run_all.run_all(hours=1.0) 호출
  - 실행 중 POST /api/run 요청 시 409 반환 (중복 방지)
```

---

## 5. 공통 모듈: loki_client.py

Loki HTTP API를 쿼리하는 기반 모듈. 모든 탐지기가 import해서 사용.

### 주요 함수
```python
query_range(logql, start, end, limit)  # Loki range 쿼리
query_instant(logql, time)             # Loki instant 쿼리
get_zeek_conn(hours)                   # Zeek 연결 로그
get_zeek_dns(hours)                    # Zeek DNS 로그
get_ssh_attacks(hours)                 # SSH Invalid user 로그
get_fail2ban_bans(hours)               # fail2ban Ban 이력
get_suricata_alerts(hours)             # Suricata IDS 경보
get_wazuh_alerts(hours)                # Wazuh HIDS 경보
get_kr_blocks(hours)                   # 커널 KR-BLOCK 이벤트
get_modsec(hours)                      # ModSecurity WAF
get_nginx(hours)                       # Nginx 접근 로그
parse_json_line(line)                  # 로그 라인 JSON 파싱 (에러 시 {} 반환)
```

### 반환 형식
```python
[{"timestamp": "...", "labels": {...}, "line": "..."}, ...]
```

---

## 6. beacon_detector.py — C2 비콘 탐지

### 알고리즘
```
1. Zeek conn에서 (src_ip, dst_ip) 쌍별 연결 타임스탬프 수집
   - labels["id_orig_h"], labels["id_resp_h"] 사용
2. 연결 간격(interval) 시퀀스 계산
3. CoV = 표준편차 / 평균 (낮을수록 규칙적 = 비콘 의심)
4. FFT로 지배 주파수 확인 (강화)
5. 최소 연결 수: N ≥ 10

판정:
  CoV < 0.1 → Critical
  CoV < 0.3 → High
  CoV < 0.5 → Medium
```

### 주요 함수
```python
detect_beacons(hours) → list[dict]   # API에서 호출
run(hours)                           # 콘솔 출력 + send_alert
```

---

## 7. dga_detector.py — DGA 도메인 탐지

### 알고리즘
```
피처: Shannon Entropy, 도메인 길이, 숫자 비율, 모음 비율, 자음-모음 전환 비율
화이트리스트: google.com, cloudflare.com, 본인 도메인 등 85개+

1차: NXDOMAIN 우선 처리
2차: Entropy > 3.5 + 길이 > 12 → DGA 의심
점수 0.4 이상 시 탐지
```

### 주요 함수
```python
detect_dga_domains(hours) → list[dict]
run(hours)
```

---

## 8. flow_anomaly_detector.py — 흐름 이상탐지

### 알고리즘
```
모델: Isolation Forest (contamination=0.01)
피처: orig_bytes, resp_bytes, orig_pkts, resp_pkts,
      duration, dst_port, proto_enc, conn_state_enc

이상 유형 (후처리):
  - 포트스캔: S0/REJ + orig_pkts ≤ 2
  - 대용량 전송: orig_bytes > 평균 + 3σ
  - 알려진 C2 포트: 4444, 1337, 31337 등
  - 네트워크 이상: 기타

모델 영속성:
  models/isolation_forest.pkl, models/scaler.pkl
  최초 실행 시 학습 → 이후 재사용
```

### 주의 사항
```
- 빈 IP(파싱 실패) 행은 제외: if not src_ip and not dst_ip: continue
- labels["id_orig_h"], labels["id_resp_h"], labels["id_resp_p"] 사용
- _get() 헬퍼: labels 우선 → line_data 보조
```

### 주요 함수
```python
extract_flow_features(zeek_logs) → pd.DataFrame
detect_anomalies(hours, retrain) → list[dict]
run(hours, retrain)
```

---

## 9. ip_risk_scorer.py — IP 위험도 통합 스코어링

### 알고리즘
```
신호                          가중치
─────────────────────────────────────
SSH 공격 시도 횟수              20점 (100회 이상 만점)
fail2ban 차단 이력              20점 (차단 이력 있으면 만점)
Suricata Critical (severity=1)  15점
Suricata High (severity=2)      10점
Wazuh High 알림                 10점
KR-BLOCK 커널 차단              10점
WAF (ModSecurity) 탐지           5점
비콘 탐지 연계                   5점
DGA 연관 연계                    5점

점수 구간:
   0~29  Low      — 정상
  30~59  Medium   — 모니터링
  60~79  High     — 주의 (send_alert 호출)
  80~89  Danger   — 경보 (send_alert 호출)
  90~100 Critical — 자동 차단 권고 (send_alert 호출)
```

### 주요 함수
```python
collect_all_signals(hours) → dict[str, dict]   # IP별 신호 수집
calculate_risk_score(signals, beacon_hit, dga_hit) → dict
score_all_active_ips(hours) → list[dict]
run(hours)
```

---

## 10. alert_manager.py

```python
send_alert(detector, verdict, details)
# - stderr: Rich 컬러 출력
# - reports/alerts_YYYY-MM-DD.jsonl: JSONL append

load_today_alerts() → list[dict]
# - 오늘 날짜 경보 파일 로드
```

### JSONL 레코드 형식
```json
{
  "timestamp": "2026-03-22 16:47:52",
  "detector": "beacon_detector",
  "verdict": "Critical",
  "src_ip": "203.0.113.55",
  "dst_ip": "185.220.101.47",
  "message": "..."
}
```

---

## 11. run_all.py

```python
run_all(hours, output_json) → dict
# 실행 순서:
#   1. beacon_detector.detect_beacons() + run()
#   2. dga_detector.detect_dga_domains() + run()
#   3. flow_anomaly_detector.detect_anomalies() + run()
#   4. ip_risk_scorer: collect_all_signals → calculate_risk_score
#      High/Danger/Critical → send_alert("ip_risk_scorer", ...)
#   5. ip_risk_scorer.run() (콘솔 테이블 출력)
```

---

## 12. api/main.py — FastAPI 백엔드

### 구조
```python
lifespan:
  - APScheduler 시작 (30분 IntervalTrigger)
  - 컨테이너 종료 시 scheduler.shutdown()

_execute():
  - _state["is_running"] 체크 (중복 방지)
  - ThreadPoolExecutor에서 run_all.run_all() 동기 실행
  - 완료 후 _state 업데이트

라우트:
  GET  /api/status
  POST /api/run
  GET  /api/summary
  GET  /api/alerts
  GET  /api/history
  GET  /{path}  → React SPA (ui/dist/index.html)
```

---

## 13. 호스트 직접 실행 (개발/디버그용)

```bash
cd ~/siem-ai-detector

# LD_LIBRARY_PATH 포함 실행 (lightgbm libgomp 해결)
bash run.sh loki_client.py          # Loki 연결 테스트
bash run.sh beacon_detector.py
bash run.sh dga_detector.py
bash run.sh flow_anomaly_detector.py
bash run.sh ip_risk_scorer.py
bash run.sh run_all.py --hours 1

# LOKI_URL은 .env에서 localhost:3100 사용
```

---

## 14. 완료 기준

- [x] `curl http://localhost:3100/ready` → 정상 응답
- [x] `loki_client.py` → 각 소스별 로그 건수 출력
- [x] `beacon_detector.py` → 비콘 의심 IP 목록 출력
- [x] `dga_detector.py` → DGA 의심 도메인 목록 출력
- [x] `flow_anomaly_detector.py` → 이상 흐름 목록 출력 (IP 파싱 정상)
- [x] `ip_risk_scorer.py` → 위험 IP 스코어링 + High+ 경보 기록
- [x] `run_all.py` → 전체 파이프라인 정상 실행
- [x] Docker Compose 배포 (http://100.x.x.x:2027/)
- [x] APScheduler 30분 자동 실행
- [x] React UI 6탭 (개요/비콘/DGA/흐름이상/IP위험도/날짜비교)
- [x] AlertModal (경보 클릭 시 위험 원인 설명 + 탐지기별 상세 데이터)
- [x] 히트맵 (시간대 × 심각도 격자)
- [x] /api/compare 엔드포인트 + CompareView

---

## 15. 주의 사항

1. **Loki URL**: Docker 내부 = `http://loki:3100`, 호스트 직접 = `http://localhost:3100`
2. **Docker 네트워크**: `security-log-monitor_default` (external) + `siem-internal`
3. **Zeek labels 필드명**: `id_orig_h` / `id_resp_h` / `id_resp_p` (점 → 언더스코어)
4. **빈 IP 필터**: `if not src_ip and not dst_ip: continue` — 파싱 실패 행 제외
5. **모델 영속성**: `models/` 볼륨 — 재빌드해도 pkl 유지됨
6. **Loki 쿼리 limit**: 기본 5,000건 — 시간 범위 나눠서 호출
7. **에러 처리**: Loki 응답 실패 시 예외 발생 금지, 빈 리스트 반환
8. **화이트리스트**: 본인 서비스 도메인은 DGA 탐지 제외
9. **내부 IP 제외**: `10.x`, `192.168.x`, `100.x`(Tailscale), `127.x` 분석 대상 제외
10. **LD_LIBRARY_PATH**: 호스트 실행 시 `.env`에 scikit_learn.libs 경로 설정 필요
    Docker 환경에서는 `libgomp1` apt 패키지로 해결 (별도 설정 불필요)
