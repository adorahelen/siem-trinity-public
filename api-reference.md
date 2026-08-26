# API Reference — SIEM-Trinity

> 표준 5축 문서 ③ 인터페이스 · 최종 확인 **2026-08-26** (소스 라우트 데코레이터 전수)
> **총 28개.** `02-detection/api/main.py` 8개 + `02-detection/api/bff.py` 20개.
> BFF 라우터는 `APIRouter(prefix="/api")` 로 정의되어 `main.py` 에 `include_router` 됩니다. 따라서 아래 BFF 경로는 전부 `/api` 하위입니다.

## 인증 표기

| 표기 | 의미 |
|---|---|
| `없음` | 무인증. 호출 제한 없음 |
| `Key` | `X-API-Key` 헤더 검사(`require_actions_key`). **`ACTIONS_API_KEY` 미설정 시 통과(no-op)** |

---

## 1. `02-detection/api/main.py` — 탐지 코어 (8)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 1 | GET | `/health` | 없음 | 헬스체크 |
| 2 | GET | `/api/status` | 없음 | 스케줄러/실행 상태 |
| 3 | POST | `/api/run` | 없음 | 즉시 탐지 실행 |
| 4 | GET | `/api/summary` | 없음 | 알림 요약 |
| 5 | GET | `/api/compare` | 없음 | 두 날짜 비교 |
| 6 | GET | `/api/alerts` | 없음 | 필터링된 알림 목록 |
| 7 | GET | `/api/attack/coverage` | 없음 | ATT&CK 커버리지 |
| 8 | GET | `/api/history` | 없음 | 알림 존재 날짜 목록 |

## 2. `02-detection/api/bff.py` — TrinitySOC 콘솔 백엔드 (20)

### 2.1 시스템 (5)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 9 | GET | `/api/system/host` | 없음 | 호스트 정보(CPU·메모리·디스크) |
| 10 | GET | `/api/system/sensors` | 없음 | 센서 상태 |
| 11 | GET | `/api/system/network` | 없음 | 네트워크 인터페이스 |
| 12 | GET | `/api/system/storage` | 없음 | 스토리지 |
| 13 | GET | `/api/system/ports` | 없음 | 리스닝 포트 |

### 2.2 LLM (3)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 14 | GET | `/api/llm/health` | 없음 | LLM 런타임 상태 |
| 15 | POST | `/api/llm/analyze-alert` | 없음 | 알림 LLM 분석(4섹션 고정 프롬프트) |
| 16 | POST | `/api/llm/chat` | 없음 | Ollama 프록시 채팅 |

### 2.3 메트릭·로그 (6)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 17 | GET | `/api/metric/prom/instant` | 없음 | Prometheus 즉시 질의 |
| 18 | GET | `/api/metric/prom/range` | 없음 | Prometheus 구간 질의 |
| 19 | GET | `/api/metric/loki/instant` | 없음 | Loki 즉시 질의 |
| 20 | GET | `/api/metric/loki/range` | 없음 | Loki 구간 질의 |
| 21 | GET | `/api/metric/loki/topk` | 없음 | Loki 상위 K |
| 22 | GET | `/api/logs/query` | **Key** | 로그 질의 |

### 2.4 케이스·인텔·액션 (5)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 23 | GET | `/api/cases` | 없음 | TheHive 케이스 목록 |
| 24 | GET | `/api/cases/{case_id}` | 없음 | 케이스 상세 |
| 25 | POST | `/api/actions/case` | **Key** | 케이스 액션 |
| 26 | POST | `/api/actions/ban` | **Key** | 차단 액션 |
| 27 | GET | `/api/intel/lookup/{ip}` | 없음 | MISP IOC 조회 |

### 2.5 통합 헬스 (1)

| # | Method | Path | 인증 | 설명 |
|---:|---|---|:---:|---|
| 28 | GET | `/api/health/all` | 없음 | 4계층 통합 헬스체크 |

---

## 3. 인증 현황과 한계

`Key` 표시 3개(`/api/logs/query`, `/api/actions/case`, `/api/actions/ban`)는 `require_actions_key` 의존성을 갖습니다. 다만 **`ACTIONS_API_KEY` 환경변수가 설정되지 않으면 검사가 통과(no-op)** 하므로 기본 배포 상태에서는 사실상 무인증입니다.

나머지 25개는 인증이 없습니다. `POST /api/run`(즉시 탐지 실행)이 무인증이라는 점을 특히 유의하십시오.

detection-api 는 `127.0.0.1:2027` 에 바인딩되고 외부 노출은 TrinitySOC(5173) 한 곳뿐이므로, 현재 위험은 **호스트 접근 권한을 가진 주체**로 한정됩니다. 그럼에도 신뢰할 수 없는 망에서는 `ACTIONS_API_KEY` 설정과 리버스 프록시 인증을 권장합니다.

상세는 [security-review.md](security-review.md) 참고. Grafana·TheHive·MISP 는 각자의 기본 자격증명을 사용하므로 운영 전 교체가 필요합니다.

## 4. 04-ui 소비 원칙

TrinitySOC UI 는 오직 detection-api(BFF 포함)만 호출하며 TheHive/MISP/Shuffle 을 직접 호출하지 않습니다(`04-ui/docs/ARCHITECTURE.md`, `page-map.md`).

## 5. 검증 방법

```bash
# 라우트 전수 재확인 (문서와 코드가 어긋났는지)
grep -cE '^@(app|router)\.(get|post|put|delete)' 02-detection/api/main.py   # 8
grep -cE '^@(app|router)\.(get|post|put|delete)' 02-detection/api/bff.py    # 20

# 실행 중이면 OpenAPI 스키마로 직접
curl -s http://127.0.0.1:2027/openapi.json | jq '.paths | keys | length'
```
