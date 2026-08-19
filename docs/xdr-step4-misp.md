# XDR 4단계 — MISP (위협 인텔리전스 플랫폼)

> 이슈 #4 단계 4. 단계 1·2 와 무관, 병렬 진입 가능.
> ip_risk_scorer 가 외부 위협 정보 (전세계 보안 커뮤니티의 IOC) 를 가중치 +30 신호로 활용.

## 목적

자체 신호 (SSH/fail2ban/Suricata/Wazuh) 만으로 위험도를 판정하는 한계를 보완.
**다른 곳에서 이미 봇넷/스캐너로 신고된 IP** 가 우리 호스트를 건드릴 때 즉시 인지.

| 자체 신호 → 점수 | + MISP IOC 매칭 | 최종 |
|---|---|---|
| Suricata Critical 1건 (15) | + 30 | **45 (Medium → High)** |
| SSH 200회 + Suricata High (40) | + 30 | **70 (High → 동일)** |
| SSH 1000회 + fail2ban + Wazuh (50) | + 30 | **80 (Danger)** |

## 구성 요소

| 위치 | 역할 |
|---|---|
| `01-collection/docker-compose.yml` | misp-core + misp-db + misp-redis (`profiles: ["misp"]` 격리) |
| `.env.example` | MISP_* 환경변수 7종 |
| `02-detection/misp_client.py` | REST API 클라이언트 (`/attributes/restSearch`) |
| `02-detection/ip_risk_scorer.py` | Medium(30+) 이상 IP 만 MISP 조회 → `misp_hit` 신호 |
| `02-detection/config.py` | `MISP_ENABLED`, `MISP_URL`, `MISP_API_KEY`, `MISP_IOC_WEIGHT` |

## 활성화 절차 (232 또는 운영 호스트)

### A. MISP 스택 기동 (첫 부팅 ~3분)

```bash
cd 01-collection

# .env 의 MISP_* 값을 본인 환경에 맞게 수정 (특히 패스워드)
$EDITOR ../.env

# profile 활성화로 MISP 만 띄움 (다른 서비스는 그대로)
docker compose --profile misp up -d misp-db misp-redis misp-core

# 컨테이너 상태
docker compose ps misp-db misp-redis misp-core

# 첫 부팅 진행 (GPG 키 생성 + DB 초기화 ~3분)
docker compose logs -f misp-core   # "Starting Apache..." 가 나오면 완료
```

### B. MISP 웹 UI 첫 접속 + admin 비밀번호 변경

브라우저로 `https://<HOST_BIND_IP>:8443` 접속 (자체서명 인증서 경고 통과):
- 기본 계정: `admin@admin.test` / `admin` (또는 .env 의 `MISP_ADMIN_PASSWORD`)
- 즉시 비밀번호 변경 (Issue #13 의 Grafana 기본 비밀번호 교훈)

### C. 위협 피드 구독

MISP 가 자동으로 외부 피드를 받아 IOC DB 를 채우도록 설정:

```
Sync Actions → List Feeds → 다음 피드를 enable + fetch:
  - CIRCL OSINT Feed                  (기본 포함)
  - abuse.ch URLhaus                  (Malicious URLs)
  - abuse.ch Feodo Tracker            (Banking trojan C2)
  - AlienVault OTX (API key 발급 시)  (Open Threat Exchange)
```

각 피드 옆 `▶ fetch` 버튼 클릭. 첫 fetch ~5분.

### D. API 키 발급 + 02-detection 연동

```
MISP 웹 UI: admin → My Profile → Auth keys → Add authentication key
  → 발급된 40자 키 복사
```

`.env` 에 추가:
```bash
MISP_ADMIN_KEY=<위에서_발급한_40자>
MISP_API_KEY=<동일_키_또는_별도_읽기_전용_계정의_키>
MISP_ENABLED=true
MISP_URL=http://misp-core:80         # docker network 내부
```

02-detection 재시작:
```bash
cd ../02-detection
docker compose up -d
```

### E. 검증

```bash
# 1) 컨테이너 내부에서 MISP API 직접 호출
docker exec detection-api python -c "
from misp_client import lookup_ip
# 알려진 악성 IP (실제 IOC) — abuse.ch URLhaus 가 fetch 됐다면 hit
print(lookup_ip('185.220.101.1'))
"

# 2) ip_risk_scorer 가 misp_hit 신호를 반영하는지
docker exec detection-api python -c "
from ip_risk_scorer import calculate_risk_score
s = {'ssh_attempts': 200, 'is_banned': True}
print('no MISP:', calculate_risk_score(s)['score'])
print('+ MISP:',  calculate_risk_score(s, misp_hit=True)['score'])
"
```

기대: MISP hit 적용 시 점수 +30 (최대 100 clamp).

## 안전장치

- **MISP_ENABLED=false 기본** — 인프라 비활성 환경에서도 detection-api 정상 동작
- 타임아웃 3초 + 예외 silent fail — MISP 다운 시 탐지 파이프라인 차단 안 함
- 점수 30 미만 IP 는 MISP 조회 스킵 (rate-limit/비용 절감)
- 운영자 IP·Tailscale 100.x 등은 `is_internal_ip()` 단계에서 이미 제외됨

## 비활성화 / 롤백

```bash
# 1) 02-detection 의 MISP 호출만 끄기 (스택은 그대로)
echo "MISP_ENABLED=false" >> ../.env
docker compose -f ../02-detection/docker-compose.yml up -d

# 2) MISP 컨테이너 자체 정지 (RAM 회수)
cd 01-collection
docker compose --profile misp stop

# 3) 완전 제거 (볼륨 보존)
docker compose --profile misp rm -f

# 4) 데이터까지 제거 (주의)
docker compose --profile misp down -v
```

## RAM/디스크 예상

| 항목 | 사용량 |
|---|---|
| misp-core (PHP/Apache) | ~500MB |
| misp-db (MariaDB) | ~300MB (innodb_buffer_pool 256MB) |
| misp-redis | ~30MB |
| **합계 RAM** | **~830MB** |
| 디스크 (피드 fetch 후) | ~2-3GB |

## 성공 기준 (epic #4 단계 4)

- [x] MISP 컨테이너 추가 (OpenCTI 는 무거워서 보류)
- [ ] AlienVault OTX / abuse.ch URLhaus 피드 구독 — D 단계 (UI 작업)
- [x] ip_risk_scorer 에 \"IOC 매칭\" 신호 추가 (가중치 +30)
- [ ] 232 에서 MISP 스택 up + 첫 부팅 성공 — 운영 작업

## 연계

- **단계 2 (auto_ban)**: MISP hit IP 는 점수가 +30 → Critical 진입 빨라짐 → 더 빠른 차단
- **단계 5 (Shuffle)**: playbook "MISP hit 신규 → fail2ban + Discord 알림" 가능
- **단계 6 (TheHive)**: 케이스에 MISP event_id 자동 첨부 → 분석가가 원 IOC 확인 가능
