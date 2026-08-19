# TrinitySOC 페이지 맵

## 라우트 구조

| 라우트 | 컴포넌트 | 역할 | 데이터 |
|---|---|---|---|
| `/` | Overview (2탭) | 보안·인프라 대시보드 | 14종 위젯 |
| `/alerts` | Alerts | 탐지 알람 페이지네이션 + 상세 모달 | `/api/alerts` |
| `/detector` | Detector | 4 탐지기 탭 (IP/흐름/비콘/DGA) + 즉시실행 | `/api/alerts?detector=...` |
| `/attack` | Attack | MITRE ATT&CK 커버리지 + Navigator JSON | `/api/attack/coverage` |
| `/analyzer` | Analyzer | 알람 1건 선택 → LLM 4섹션 분석 | `/api/alerts` + `/api/llm/analyze-alert` |
| `/llm` | Llm | 자유 대화 채팅 UI | `/api/llm/health` + `/api/llm/chat` |
| `/logs` | Logs | LogQL 프리셋 8종 + 사용자 입력 | `/api/logs/query` |
| `/cases` | Cases | TheHive 사고 케이스 목록 | `/api/cases` |
| `/intel` | Intel | IP/도메인 IOC 검색 | `/api/intel/lookup/:ip` |
| `/workflows` | Workflows | Shuffle 외부링크 | (없음) |
| `/actions` | Actions | auto-ban 이력 + 토글 상태 | `/api/alerts?detector=auto_ban` + `/api/status` |
| `/settings` | Settings | XDR 토글 + 스케줄러 상태 | `/api/status` |

## Overview 탭 구조

### 🛡 보안 탭 (기본 14위젯)

| 행 | 위젯 | 종류 |
|---|---|---|
| KPI | fail2ban 24h · Wazuh High+ 24h · Suricata 24h · TheHive 케이스 · SSH 실패 · XDR 토글 4종 | metric × 4 + thehive_kpi + xdr_toggles |
| 시계열 | SSH+f2b+kern 추이 / Wazuh+Suricata 추이 | timeseries × 2 |
| Top-K | 공격 IP / 차단 IP / DNS 도메인 | topk × 3 |
| 로그 | Wazuh High+ / 커널 치명 | log × 2 |

### 🖥 인프라 탭 (기본 9위젯)

| 행 | 위젯 | 종류 |
|---|---|---|
| KPI | CPU · 메모리 · 디스크 · 가동시간 | resource × 3 + uptime |
| 시계열 | I/O·CPU 부하 / 네트워크 Mbps | timeseries × 2 |
| 정보 | 네트워크 / 스토리지 / 포트 / 센서 | network · storage · ports · sensors |

## BFF 엔드포인트 (SIEM-Trinity `02-detection/api/bff.py`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/status` | XDR 토글 + 스케줄러 |
| GET | `/api/summary` | 알람 요약 (by_verdict, by_detector, hourly) |
| GET | `/api/alerts` | 알람 페이지네이션 + 필터 |
| POST | `/api/run` | 탐지기 즉시 실행 |
| GET | `/api/attack/coverage` | MITRE ATT&CK 매핑 (Navigator JSON) |
| GET | `/api/cases` | TheHive 케이스 목록 |
| GET | `/api/cases/:id` | TheHive 케이스 상세 |
| POST | `/api/actions/case` | TheHive 케이스 즉시 생성 |
| POST | `/api/actions/ban` | fail2ban 강제 차단 |
| GET | `/api/intel/lookup/:ip` | MISP IOC 매칭 |
| GET | `/api/logs/query` | Loki query_range 프록시 |
| GET | `/api/metric/prom/instant` | PromQL 단일 값 |
| GET | `/api/metric/prom/range` | PromQL 시계열 |
| GET | `/api/metric/loki/instant` | LogQL 집계 단일 값 |
| GET | `/api/metric/loki/range` | LogQL 시계열 |
| GET | `/api/metric/loki/topk` | LogQL topk |
| GET | `/api/system/host` | CPU 모델·메모리·디스크·호스트 |
| GET | `/api/system/network` | 인터페이스 + 공인 IP |
| GET | `/api/system/storage` | 파일시스템·inode·fstype |
| GET | `/api/system/ports` | listen TCP/UDP 포트 |
| GET | `/api/system/sensors` | 온도·팬·전력 (VM 시 unavailable) |
| GET | `/api/health/all` | 의존 서비스 헬스 |
| GET | `/api/llm/health` | Ollama up + 모델 존재 |
| POST | `/api/llm/chat` | 자유 대화 |
| POST | `/api/llm/analyze-alert` | 알람 1건 4섹션 분석 |

## 인증

- 1차 (현재): 없음 — 내부망 전용 (Tailscale·LAN)
- 2차 (예정): detection-api 의 JWT 단일 로그인
- 3차 (예정): SSO/OIDC, RBAC

## 네트워크 구조

```
브라우저 → TrinitySOC nginx :5173
              │
              ├── / → React SPA 정적 파일
              ├── /api/* → detection-api:8000 (docker network 내부)
              ├── /_detector/* → detection-api:8000 (iframe 프록시, 미사용)
              └── /_analyzer/* → intelligence-ui:8501 (Streamlit 임베드, 미사용)
```

`02-detection_siem-internal` + `03-intelligence_intelligence-internal` 양쪽 docker network 에 attach.
