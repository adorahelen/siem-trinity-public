# API Reference — SIEM-Trinity

## 02-detection/api/main.py
| Method | Path | 설명 |
|---|---|---|
| GET | /health | 헬스체크 |
| GET | /api/status | 스케줄러/실행 상태 |
| POST | /api/run | 즉시 탐지 실행 |
| GET | /api/summary | 알림 요약 |
| GET | /api/compare | 두 날짜 비교 |
| GET | /api/alerts | 필터링된 알림 목록 |
| GET | /api/attack/coverage | ATT&CK 커버리지 |
| GET | /api/history | 알림 존재 날짜 목록 |

## 02-detection/api/bff.py (TrinitySOC UI가 소비하는 BFF, `/api` 하위 마운트)
| Method | Path | 설명 |
|---|---|---|
| GET | /system/host, /system/sensors, /system/network, /system/storage, /system/ports | 시스템 상태 |
| GET | /llm/health | LLM 상태 |
| POST | /llm/analyze-alert | 알림 LLM 분석 |
| POST | /llm/chat | Ollama(gemma4) 프록시 채팅 |
| GET | /metric/prom/instant\|range | Prometheus 메트릭 |
| GET | /metric/loki/instant\|range\|topk | Loki 메트릭/로그 |
| GET | /cases, /cases/{case_id} | TheHive 케이스 조회 |
| POST | /actions/case | 케이스 액션(키 보호) |
| POST | /actions/ban | 차단 액션(키 보호) |
| GET | /intel/lookup/{ip} | MISP IOC 조회 |
| GET | /logs/query | 로그 질의 |
| GET | /health/all | 전체 헬스체크 |

## 인증
`POST /actions/*`는 선택적 `X-API-Key` 헤더로 게이팅(`require_actions_key`) — `ACTIONS_API_KEY` 미설정 시 사실상 무인증(no-op). 그 외 대부분의 읽기 API(detection-api, Loki, Prometheus, Ollama)는 인증 없음. Grafana는 admin/env 비밀번호, TheHive/MISP는 기본 자격증명 사용(security-review.md 참고).

## 04-ui 소비 원칙
TrinitySOC UI는 오직 detection-api(BFF 포함)만 호출하며 TheHive/MISP/Shuffle을 직접 호출하지 않는다(`04-ui/docs/ARCHITECTURE.md`, `page-map.md`).
