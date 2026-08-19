# 접속 URL · 포트 · 인증 종합

> SIEM-Trinity 풀 가동 시 노출되는 모든 UI/API. 인증·기본 자격증명·바인딩 IP·접근 경로.

## 1. 포트 종합표

| 포트 | 서비스 | 섹터 | 프로토콜 | 인증 |
|---|---|---|---|---|
| 1514 / 1515 | Wazuh agent ↔ manager | 01 | TCP/UDP | agent key |
| 2027 | **detection-api** (FastAPI + React) | 02 | HTTP | 없음 |
| 3000 | **Grafana** | 01 | HTTP | `admin` / `.env` 의 `GF_ADMIN_PASSWORD` |
| 3001 | **Shuffle frontend** | 04 | HTTP | 첫 signup (web UI) |
| 3100 | Loki API | 01 | HTTP | 없음 |
| 5001 | Shuffle backend API | 04 | HTTP | 내부용 |
| 8080 | MISP HTTP (대체) | 04 | HTTP | `admin@admin.test` / `.env` 의 `MISP_ADMIN_PASSWORD` |
| 8443 | **MISP HTTPS** (자체서명) | 04 | HTTPS | 동일 |
| 8501 | **Streamlit** (LLM Agent UI) | 03 | HTTP | 없음 |
| 9000 | **TheHive Web/API** | 04 | HTTP | `admin@thehive.local` / **`secret` (첫 부팅 후 변경 필수)** |
| 9090 | **Prometheus** | 01 | HTTP | 없음 |
| 9200 | Elasticsearch (TheHive) | 04 | HTTP | 내부용 |
| 9200 | OpenSearch (Shuffle) | 04 | HTTP | 내부용 (다른 컨테이너) |
| 11434 | **Ollama API** | 03 | HTTP | 없음 |
| 55000 | Wazuh API | 01 | HTTPS | 내부용 |

→ **굵게** 표시된 7개 = **운영자가 직접 접속하는 UI**.

## 2. HOST_BIND_IP 별 노출 정책

`docker-compose.yml` 의 모든 포트 매핑이 `${HOST_BIND_IP:-127.0.0.1}` 사용 → 환경 변수 한 곳으로 노출 범위 제어.

| HOST_BIND_IP 값 | 의미 | 적합 환경 |
|---|---|---|
| `127.0.0.1` (기본) | 로컬호스트만 — SSH 포워딩 필요 | 운영 호스트 (kangminlog), 안전 |
| `192.168.x.x` | LAN 노출 | 홈/테스트 VM, 가족·친구만 접근 |
| `100.x.x.x` | Tailscale CGNAT — Tailnet 내부만 | 외부 노출 없이 어디서나 접근 |
| `0.0.0.0` | **모든 인터페이스 (위험)** | 권장 안 함 |

## 3. SSH 포트 포워딩 — `127.0.0.1` 노출 시 외부 접속

```bash
ssh -L 8443:127.0.0.1:8443 \
    -L 9000:127.0.0.1:9000 \
    -L 3001:127.0.0.1:3001 \
    -L 8501:127.0.0.1:8501 \
    -L 3000:127.0.0.1:3000 \
    -L 2027:127.0.0.1:2027 \
    user@<server>

# 이후 클라이언트에서 http://127.0.0.1:8443 등으로 접속
```

## 4. 자격증명 정책

### 자동 생성 (`./xdr-up.sh` 가 처리)
- `MISP_ADMIN_PASSWORD`: 24자 base64 자동 발급
- `MISP_DB_PASSWORD` / `MISP_DB_ROOT_PASSWORD`: 동일
- `THEHIVE_SECRET`: 32바이트 hex
- `SHUFFLE_OPENSEARCH_PASSWORD`: 24자 base64

### 운영자 수동 설정 권장
- `GF_ADMIN_PASSWORD`: Grafana — `.env` 필수 항목. 미설정 시 스택 기동 실패 (Issue #13)
- TheHive `secret` 비번: 첫 web UI 로그인 후 즉시 변경
- API 키 4종: `MISP_API_KEY`, `THEHIVE_API_KEY`, `SHUFFLE_API_KEY`, `SHUFFLE_WEBHOOK_URL` — 부트스트랩이 자동 발급하지만 운영자 검증 권장

## 5. 활성화 토글 4종 (자동 대응)

`.env` 에 직접 편집 — 자동 OFF, 운영자 판단 후 ON:

```env
AUTO_BAN_ENABLED=false      # 단계 2: ip_risk_scorer → fail2ban (1주일 dry-run 후 권장)
MISP_ENABLED=false          # 단계 4: 02-detection 의 MISP IOC 조회
SHUFFLE_ENABLED=false       # 단계 5: Critical 사건 → Shuffle webhook
THEHIVE_ENABLED=false       # 단계 6: Critical IP → TheHive 케이스 자동 생성
```

상태 확인:
```bash
docker exec detection-api env | grep -E "(AUTO_BAN|MISP|SHUFFLE|THEHIVE)_ENABLED"
```

## 6. 외부 접근 흐름 (운영 권장)

```
인터넷
   ↓ (Tailscale)
운영자 PC ← Tailnet → 100.x (Tailscale IP)
                              ↓ HTTP/HTTPS
                       호스트 (HOST_BIND_IP=100.x)
                              ↓ docker network
                       SIEM-Trinity 컨테이너들
```

- **인터넷 직접 노출 0개 권장** — Grafana 만 외부 노출 시 nginx reverse proxy + HTTPS (Let's Encrypt) + Basic Auth 필수
- 운영 환경 가이드: [docs/install-production.md](install-production.md) §시나리오 C

## 7. Discord webhook (외부 송신)

`DISCORD_CRITICAL_WEBHOOK_URL`, `DISCORD_REPORT_WEBHOOK_URL` 등 — `.env` 에 설정 시:
- 01-collection 의 [`realtime_alert.py`](../01-collection/scripts/realtime_alert.py): 8종 알림
- 02-detection 의 [`auto_ban.py`](../02-detection/auto_ban.py): dry-run/실 차단 알림
- (단계 5) Shuffle workflow 의 HTTP 노드도 동일 webhook 재사용 가능

## 8. 정합성 검증 명령

```bash
# 노출 포트 직접 확인
ss -tlnp | grep -E ":(2027|3000|3001|3100|5001|8080|8443|8501|9000|9090|11434)"

# 컨테이너 별 포트 매핑
docker ps --format "table {{.Names}}\t{{.Ports}}"

# 활성화 토글 4종 상태
grep -E "^(AUTO_BAN|MISP|SHUFFLE|THEHIVE)_ENABLED" .env
```
