# 아키텍처 비교 및 설계 논의

> security-log-monitor vs otel_project 비교 + 설계 결정 근거

---

## 1. 포지셔닝 (가장 큰 차이)

| 항목 | security-log-monitor | otel_project |
|---|---|---|
| **목적** | 개인 서버 보안 이벤트 모니터링 | 범용 온프레미스 APM 제품 |
| **타겟** | 단일 서버 (kangminlog) | 다수 서비스 → OTel SDK 계장 |
| **신호 종류** | 로그만 (파일 + 명령 출력) | 로그 + 트레이스 + 메트릭 (3-in-1) |
| **라이선스 의식** | 없음 (오픈소스 그대로 사용) | AGPL 회피 → 상업용 독점 제품화 |
| **HA 구성** | 없음 (단일 서버) | HAProxy + Collector A/B 라운드로빈 |

---

## 2. otel_project가 바퀴를 다시 만든 이유

otel_project는 이미 오픈소스로 풀려있는 도구들을 직접 재구현했다:

| 오픈소스 도구 | otel_project 재구현 |
|---|---|
| Grafana (시각화) | React 커스텀 프론트엔드 |
| Jaeger (트레이싱 UI/API) | Go 백엔드 + React |
| Loki (로그 저장/쿼리) | ClickHouse + Go API |

이유는 단 하나: **AGPL 라이선스.**
Grafana, Loki 등을 임베딩해서 상업적으로 판매하면 소스코드를 공개해야 한다.
그걸 피하기 위해 수개월치 개발을 투입해서 재구현한 것이다.

**결론:**
- otel_project → "라이선스 문제를 개발로 해결한 상업용 제품"
- security-log-monitor → "목적에 맞는 도구를 골라 쓴 정상적인 엔지니어링"

---

## 3. 수집 계층 비교

security-log-monitor는 **두 가지 수집 경로**를 가진다:

```
파일 로그    →  [Promtail]  →  Loki
명령 출력    →  [collector.py → Loki Push API]  →  Loki
  (ss, fail2ban-client, lastb, tailscale status)
```

otel_project는 **단일 경로**:

```
앱 OTel SDK  →  OTLP push  →  [HAProxy]  →  [OTel Collector A/B]  →  ClickHouse
```

| | Promtail (현재) | OTel Collector (otel_project) |
|---|---|---|
| 수집 방식 | 파일 tail (pull) | OTLP push (앱이 직접 전송) |
| 지원 신호 | 로그만 | 로그 + 트레이스 + 메트릭 |
| 프로토콜 | Loki Push API | OTLP (gRPC / HTTP) |
| 필터링 | pipeline_stages (regex) | processor (filter/transform) |

---

## 4. 저장 계층 비교

| | Loki (현재) | ClickHouse (otel_project) |
|---|---|---|
| 쿼리 언어 | LogQL | SQL |
| 트레이스 연동 | 불가 | `trace_id` JOIN 1개 |
| 집계 분석 | `count_over_time` 정도 | GROUP BY, window function 전부 |
| 현재 한계 | "Top 공격 IP" 쿼리가 LogQL로 억지로 집계됨 | 자연스러운 SQL |

---

## 5. 시각화 계층 비교

| | Grafana (현재) | otel_project React |
|---|---|---|
| 라이선스 | AGPL v3 (상업용 임베딩 제한) | 완전한 소유권 |
| 커스터마이징 | 패널/플러그인 개발 필요 | React 컴포넌트 자유 구현 |
| 개인 모니터링 적합성 | ✅ 충분 | 과잉 |

이 프로젝트에서 Grafana를 React로 교체할 이유는 없다 — 개인 보안 모니터링이므로 AGPL 라이선스 이슈가 없고, APM 특화 UX(서비스맵, Flame Graph)도 필요 없다.

---

## 6. Jaeger는 왜 없나

트레이싱은 **분산 서비스 간 요청 흐름**을 추적하는 도구다. 이 프로젝트의 목적은 단일 서버의 OS/보안 이벤트 관찰이므로 — 분산 서비스 구조 자체가 없어서 트레이싱할 대상이 없다.

**Jaeger가 필요해지는 시점:**
- 직접 개발한 마이크로서비스가 여러 개 생기고
- 그 서비스 간 latency / 에러 흐름을 추적해야 할 때

---

## 7. 전체 아키텍처 비교

### security-log-monitor (현재)

```
kangminlog 서버
  │
  ├── /var/log/auth.log, ufw.log, nginx/*, modsec_audit.log → [Promtail] ─┐
  ├── systemd journal (ssh.service)                          → [Promtail] ─┤
  ├── Docker containers (loki/promtail/grafana)              → [Promtail] ─┤
  │                                                                         │
  └── systemd timer 5분 [collector.py] ────────────────────────────────── ─┤
        ss / fail2ban-client / lastb / tailscale / geo_attacks              │
                                                                            ▼
                                                                          [Loki]
                                                                            │
                                                              [Prometheus] ─┤
                                                               Node Exporter│
                                                                            ▼
                                                                        [Grafana]
                                                                     12개 패널
                                                                            │
                                              nginx (Tailscale IP) ◀───────┘
                                                        │
                                              Tailscale VPN 경유 브라우저
```

### otel_project

```
앱 서비스들 (OTel SDK 계장)
  │ OTLP (traces + logs + metrics)
  ▼
[HAProxy] ──라운드로빈──▶ [OTel Collector A]
                      └──▶ [OTel Collector B]
                                  │
                          [ClickHouse]
                        otel.otel_traces   (30일)
                        otel.otel_logs     (30일)
                        otel.otel_metrics  (90일)
                                  │
                          [Go 백엔드 API]
                                  │
                          [React 프론트엔드]
                          [Python ML 엔진] (HDBSCAN + UMAP)
```

---

## 8. 역할 대응 요약

| 역할 | security-log-monitor | otel_project |
|---|---|---|
| 로그 수집 (파일) | Promtail | OTel Collector (`filelog` receiver) |
| 로그 수집 (명령) | collector.py → Loki Push API | OTel SDK (앱 계장) |
| 로그 저장소 | Loki | ClickHouse |
| 트레이스 수집 | 없음 | OTel Collector |
| 메트릭 수집/저장 | Prometheus + Node Exporter | OTel Collector → ClickHouse |
| 시각화 | Grafana | React 커스텀 프론트엔드 |
| 백엔드 쿼리 API | 없음 (Grafana가 직접 쿼리) | Go REST API |
| 이상 탐지 | 없음 (임계값 알림, 진행 중) | Python ML 엔진 (HDBSCAN + UMAP) |
| HA / 로드밸런싱 | 없음 | HAProxy |
| 접근 제어 | nginx + Tailscale | 고객사 네트워크 |

---

## 9. 만약 전부 직접 구현한다면

공수 추정 (현재 → otel_project 방식 전환):

| 컴포넌트 전환 | 난이도 | 비고 |
|---|---|---|
| Loki → ClickHouse + Go 쿼리 API | 중간 | SQL 집계 이득 있음 |
| Grafana → React 커스텀 UI | 매우 큰 작업 | 패널 8개 → 전부 컴포넌트 재구현 |
| Promtail → OTel Collector | 상대적으로 작음 | config YAML 교체 수준 |

```
현재 코드베이스:      파일 ~10개, 설정 중심
전부 직접 구현 시:   Go 백엔드 + React 프론트엔드 + ClickHouse 스키마
                    → 코드베이스 10배 이상 증가
```

만약 진행한다면 추천 스택:

| 컴포넌트 | 추천 | 이유 |
|---|---|---|
| 로그 저장소 | **ClickHouse** | SQL 집계, 압축 효율 최고 |
| 백엔드 API | **Python + FastAPI** | collector.py와 같은 언어, ML 연계 쉬움 |
| 프론트엔드 | **React + Recharts** | 장기 유지보수 유리 |
| ML 이상 탐지 | **Python + HDBSCAN + APScheduler** | otel_project와 동일 스택 |

**결론:** 현재 규모에서는 전환보다 Phase 6 알림 완료 → Wazuh 마무리가 우선이다.

---

## 한 줄 요약

> **security-log-monitor**는 otel_project가 "이전 스택"으로 분류한 Promtail + Loki + Grafana 조합을 단일 서버 보안 모니터링 목적으로 구현한 프로젝트다. otel_project가 이 스택을 직접 재구현한 이유(AGPL 라이선스 회피, 상업적 판매)는 이 프로젝트의 요구사항에 전혀 해당되지 않는다.
