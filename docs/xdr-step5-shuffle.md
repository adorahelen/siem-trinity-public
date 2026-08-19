# XDR 5단계 — Shuffle SOAR (Security Orchestration)

> 이슈 #4 단계 5. 단계 2 (auto_ban) 검증 완료 가정.
> 02-detection 이 Critical 사건을 발견하면 Shuffle webhook 으로 위임 →
> Shuffle workflow 가 "차단·알림·티켓팅" 체인을 자동 실행.

## 목적

지금까지: 02-detection 이 직접 `fail2ban-client` 호출 + Discord 알림 → **로직이 코드 안에 매장**.
변화: Shuffle workflow 가 같은 일을 GUI playbook 으로 운영 → **운영자가 코드 변경 없이 분기 수정 가능.**

## 구성 요소

| 위치 | 역할 |
|---|---|
| `01-collection/docker-compose.yml` | shuffle-{opensearch,backend,frontend,orborus} 4종, `profiles: ["shuffle"]` |
| `02-detection/shuffle_client.py` | 단일 함수 `trigger(event_type, payload)` — Shuffle webhook POST |
| `02-detection/ip_risk_scorer.py` | Critical IP → `shuffle_trigger("ip_critical", entry)` |
| `02-detection/config.py` | `SHUFFLE_ENABLED` (기본 false), `SHUFFLE_WEBHOOK_URL` |
| `.env.example` | OpenSearch heap/admin 비밀번호 + 02-detection 토글 |

## 활성화 절차

### A. Shuffle 스택 기동

```bash
cd 01-collection

# .env 의 SHUFFLE_OPENSEARCH_PASSWORD 를 강한 값으로 변경
$EDITOR ../.env

docker compose --profile shuffle up -d \
  shuffle-opensearch shuffle-backend shuffle-frontend shuffle-orborus

# 첫 부팅 ~1분 (OpenSearch cluster_state green 대기)
docker compose logs -f shuffle-backend | grep -E "ready|listening"
```

### B. 웹 UI 첫 접속 + admin 계정 생성

`http://<HOST_BIND_IP>:3001` 접속:
- 첫 부팅 시 admin 회원가입 페이지 표시 (signup form)
- email/password 설정 → Shuffle 가 admin 계정 생성
- 이후 동일 URL 로 로그인

### C. Webhook 트리거 생성 (playbook 1: IP 위험도 90+ 자동 차단 체인)

Shuffle UI 에서:

1. **Create Workflow** → 이름 "IP Critical Auto-response"
2. 좌측 패널의 **Triggers** → **Webhook** 드래그
3. 우측 패널에서 Webhook URL 확인 (`/api/v1/hooks/<hook-id>`)
4. Workflow 그래프 작성 예시 (논리적 흐름):

```
[Webhook]
   │
   ├─→ [HTTP Request]   (Discord 알림 — DISCORD_CRITICAL_WEBHOOK_URL)
   │
   ├─→ [Shell] sudo fail2ban-client set siem-trinity banip {{event.ip}}
   │
   └─→ [HTTP Request]   (단계 6 TheHive 케이스 생성 — 단계 6 머지 후)
```

5. **Save & Activate**

### D. 02-detection 측 연동

`.env` 에 추가:
```
SHUFFLE_ENABLED=true
SHUFFLE_WEBHOOK_URL=http://shuffle-backend:5001/api/v1/hooks/<hook-id>
```

(docker network 내부 통신 — `shuffle-backend` 호스트명 직접 사용)

02-detection 재시작:
```bash
cd ../02-detection
docker compose up -d
```

### E. 동작 검증

```bash
docker exec detection-api python -c "
from shuffle_client import trigger
print('triggered:', trigger('ip_critical', {
    'ip': '203.0.113.99',
    'score': 95,
    'verdict': 'Critical',
    'signals': {'ssh_attempts': 200, 'is_banned': True},
}))
"
```

Shuffle UI 의 workflow execution history 에 실행 1건이 보여야 함.

## 안전장치

- `SHUFFLE_ENABLED=false` 기본 — 인프라 비활성 환경에서도 detection-api 정상
- 5초 타임아웃 + silent fail → Shuffle 다운 시 탐지 차단 안 함
- Shuffle workflow 의 fail2ban 분기는 **호스트 fail2ban-client 의존** — 단계 2b 활성화 선행
- workflow 의 Discord 호출은 `.env` 의 `DISCORD_CRITICAL_WEBHOOK_URL` 재사용 가능

## 단계 2 (auto_ban) 와의 관계

| 책임 | 단계 2 (`auto_ban.py`) | 단계 5 (Shuffle) |
|---|---|---|
| Critical IP 발견 시 fail2ban 차단 | ✅ 직접 호출 | ✅ workflow 호출 |
| Discord 알림 | △ alert_manager 로 jsonl 기록만 | ✅ workflow 호출 |
| 케이스 생성 (단계 6) | ❌ 불가 | ✅ workflow 다음 노드 |
| 분기/조건 수정 | 코드 변경 → 빌드 | UI 클릭 |

**중복 차단 주의**: 둘 다 활성화 시 동일 IP 가 두 번 차단 시도됨. fail2ban-client 는 idempotent 라 두 번째 호출이 에러 안 내지만, 로깅은 이중 발생. 정착되면 **단계 2 의 `AUTO_BAN_ENABLED=false` 로 두고 단계 5 workflow 에 차단 로직 일원화** 권장.

## RAM/디스크 예상 (232 측정 예정)

| 컨테이너 | 예상 RAM |
|---|---|
| shuffle-opensearch (heap 1g) | ~1.2GB |
| shuffle-backend | ~150MB |
| shuffle-frontend (nginx) | ~30MB |
| shuffle-orborus | ~50MB |
| **합계** | **~1.5GB** |

OpenSearch 가 RAM 의 대부분. heap 을 줄이거나 (`SHUFFLE_OPENSEARCH_HEAP=512m`), 메모리 부족 시 swap 활용.

## 성공 기준 (epic #4 단계 5)

- [x] Shuffle 컨테이너 추가
- [ ] playbook 1 "IP 위험도 90+ → fail2ban → Discord → 케이스 생성" — workflow 작성 (운영자 작업)
- [ ] playbook 2 "Wazuh critical → active-response → Discord → 케이스" — 단계 6 머지 후

## 연계

- **단계 2 (auto_ban)**: workflow 안에 fail2ban-client shell 노드 → 동일 효과
- **단계 4 (MISP)**: workflow 에 "신규 IOC 등록" 노드 추가 가능
- **단계 6 (TheHive)**: workflow 마지막 노드로 "케이스 생성" 추가 → epic 성공 기준 충족
