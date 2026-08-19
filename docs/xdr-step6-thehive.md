# XDR 6단계 — TheHive 케이스 관리

> 이슈 #4 단계 6, 마지막 단계. 단계 5 (Shuffle) 의존.
> 자동 차단·알림이 발생한 사건을 **케이스(티켓)** 단위로 추적 → 분석가 SOC 워크플로우.

## 목적

지금까지: alert jsonl 만 쌓임. "어떤 사건이 어떻게 끝났는지" 추적 불가.
변화: Critical IP → TheHive 케이스 자동 생성 → ATT&CK technique 자동 태깅 →
03-intelligence LLM 이 자연어 분석을 케이스 코멘트로 추가.

epic 성공 기준 충족: **사람 개입 없이 시나리오 end-to-end 자동화 1건**.

## 구성 요소

| 위치 | 역할 |
|---|---|
| `01-collection/docker-compose.yml` | thehive-{app, cassandra, elasticsearch} 3종 (`profiles: ["thehive"]`) |
| `02-detection/thehive_client.py` | `create_case()`, `add_comment()` 함수 |
| `02-detection/config.py` | `THEHIVE_{ENABLED,URL,API_KEY,AUTO_CASE_VERDICTS}` |
| `02-detection/ip_risk_scorer.py` | Critical IP → `thehive_create_case()` (ATT&CK tag 자동 매핑) |
| `03-intelligence/scripts/thehive_llm_comment.py` | 케이스 ID → LLM 분석 → 코멘트 POST |

## ⚠️ 시스템 요구사항

| 컴포넌트 | RAM | 비고 |
|---|---|---|
| Cassandra | 1.5GB (heap 1g + JVM 메타) | THEHIVE_CASSANDRA_HEAP |
| Elasticsearch 7.17 | 1.5GB (heap 1g + JVM 메타) | THEHIVE_ES_HEAP, **8.x 안 됨** |
| TheHive 5.x | 1GB | THEHIVE_HEAP |
| **합계** | **~4GB** | 232 의 15GB 로 충분 |

첫 부팅 시 **3-5분** 소요 (Cassandra schema 초기화 + ES green 대기).

## 활성화 절차

### A. 스택 기동

```bash
cd 01-collection

# .env 의 THEHIVE_SECRET 을 강한 값으로 변경 (인증 토큰 서명용)
$EDITOR ../.env

# vm.max_map_count 확인 (ES 필수)
sysctl vm.max_map_count   # >= 262144 이어야 함
sudo sysctl -w vm.max_map_count=262144   # 모자르면

docker compose --profile thehive up -d \
  thehive-cassandra thehive-elasticsearch thehive-app

# 첫 부팅 진행 (3-5분)
docker compose logs -f thehive-app | grep -E "Service ready|Listening"
```

### B. 첫 접속 + admin 비밀번호 변경

`http://<HOST_BIND_IP>:9000` 접속:
- 기본 계정: `admin@thehive.local` / `secret` (TheHive 5 기본값)
- 즉시 비밀번호 변경 (Issue #13 교훈)

### C. 조직 + API key 발급

1. `Organisation → Users` 에서 신규 사용자 추가 (service account 권장)
2. 사용자 상세 → `API key` → Generate → 64자 키 복사
3. `.env` 갱신:
   ```
   THEHIVE_ENABLED=true
   THEHIVE_API_KEY=<64자_키>
   THEHIVE_URL=http://thehive-app:9000
   ```

### D. 02-detection 재기동 + 검증

```bash
cd ../02-detection
docker compose up -d

# 강제 케이스 생성 테스트
docker exec detection-api python -c "
from thehive_client import create_case
r = create_case(
    title='[PROBE] TheHive 연동 테스트',
    description='SIEM-Trinity 단계 6 검증용 수동 케이스',
    verdict='High',
    tags=['probe', 'attack:T1110'],
)
print(r)
"
```

기대: `{'created': True, 'case_id': '~123456', 'url': 'http://thehive-app:9000/cases/...'}`.
웹 UI 의 Cases 탭에서 해당 케이스 확인.

### E. LLM 코멘트 자동 추가 (03-intelligence 의존)

03-intelligence 스택 가동 중 (intelligence-ui 컨테이너):

```bash
docker exec intelligence-ui python /app/scripts/thehive_llm_comment.py ~123456
```

(컨테이너에 스크립트가 마운트되거나 docker cp 필요)

기대: 케이스에 "🤖 03-intelligence 자동 분석" 헤더 + 5항목 요약 코멘트 추가.

### F. Shuffle 와 연동 (단계 5+6 묶기)

Shuffle workflow 의 마지막 노드를 다음으로 변경:
```
[Webhook] → [Shell: fail2ban-client banip] → [HTTP: TheHive case API]
                                           ↓
                                  [HTTP: thehive_llm_comment.py 호출]
```

→ Critical IP 발생 시 1초 안에: 차단 + 케이스 + LLM 분석 모두 자동.

## 안전장치

- `THEHIVE_ENABLED=false` 기본
- 5초 타임아웃 + silent fail
- `THEHIVE_AUTO_CASE_VERDICTS=Critical` 기본 — Critical 만 자동 케이스 (High/Danger 는 alert 만)
- ip_risk_scorer 가 케이스 생성 실패해도 fail2ban/Shuffle/Discord 는 계속 동작

## 단계 2 / 5 와의 관계 정리

이제 Critical IP 한 건 발생 시 동시 트리거 흐름:

```
Critical IP detected (verdict=Critical)
   │
   ├─→ auto_ban()           [단계 2]  fail2ban set banip
   ├─→ shuffle_trigger()    [단계 5]  workflow webhook
   ├─→ thehive_create_case() [단계 6] 케이스 생성 + ATT&CK tag
   └─→ send_alert()         [기존]    alerts_*.jsonl 기록
```

**중복 처리**: Shuffle workflow 도 차단·케이스 가능 → 정착 후 둘 중 한 경로로 일원화 권장.
권장: 단계 5 (Shuffle) 가 차단·케이스를 책임지고, ip_risk_scorer 의 직접 호출은 fallback 으로만.

## 성공 기준 (epic #4 단계 6)

- [x] TheHive 5 컨테이너 추가 (Cassandra+ES 의존)
- [ ] Shuffle playbook 이 자동 케이스 생성 — workflow 수정 (운영자 작업)
- [x] 03-intelligence 자연어 분석을 케이스 코멘트로 자동 추가 — 스크립트 제공

## 비활성화 / 롤백

```bash
# 02-detection 의 TheHive 호출만 끄기 (스택은 그대로)
echo "THEHIVE_ENABLED=false" >> ../.env
docker compose -f ../02-detection/docker-compose.yml up -d

# TheHive 컨테이너 정지
cd 01-collection
docker compose --profile thehive stop

# 데이터까지 제거
docker compose --profile thehive down -v
```

## 연계 마무리

단계 6 머지 시 epic #4 의 모든 단계가 끝남. 마지막 잔여 작업:
- 마스터 `README.md` 의 "🛡️ 자동 대응 체인" 표 갱신 — "수동 검토만" → "자동 격리·차단·케이스 생성"
- 운영 호스트에 단계 1-2-3 활성화 → 실데이터에서 첫 자동 케이스 발생 확인
