# XDR 2단계 — fail2ban 자동 차단 (첫 R)

> 이슈 #4 (XDR 6단계 epic)의 2단계. **분기점.** 02-detection이 호스트의 fail2ban-client에 *쓰기* 액션을 시작.
> 운영 영향이 있는 첫 단계 — **운영자 자기 차단 = 1순위 리스크.** dry-run 1주일 관찰 후 활성화.

## 목적

`ip_risk_scorer.py` 가 Critical(score ≥ 90) 로 판정한 외부 IP를 `fail2ban-client set <jail> banip <ip>` 로 자동 차단.

## 구성 요소

| 위치 | 역할 |
|---|---|
| `02-detection/auto_ban.py` | 차단 진입점. dry-run/whitelist/Discord 처리 |
| `02-detection/config.py` | env 4종 추가: `AUTO_BAN_ENABLED`, `AUTO_BAN_THRESHOLD`, `AUTO_BAN_JAIL`, `AUTO_BAN_WHITELIST_IPS` |
| `02-detection/ip_risk_scorer.py` | Critical 판정 시 `auto_ban()` 호출 |
| `02-detection/docker-compose.yml` | 위 env 노출 |
| 호스트 `fail2ban` | `siem-trinity` jail 정의 (수동 생성 필요) |

## 사전 조건

1. SIEM-Trinity 단계 1 적용 완료 (Wazuh agent + auditd 가동)
2. 호스트에 `fail2ban` 설치 및 실행 중
3. `02-detection` 컨테이너가 호스트 `fail2ban-client` 를 호출 가능해야 함

### 컨테이너 → 호스트 fail2ban 접근

**구현 완료 (PR #34, 단계 2b).** `02-detection/Dockerfile` 에 `fail2ban` 패키지 포함,
호스트 socket bind-mount 는 별도 override 파일로 분리:

```bash
# 호스트에 fail2ban + siem-trinity jail 셋업 후
docker compose -f docker-compose.yml -f docker-compose.fail2ban.override.yml up -d
```

기본 compose 만 쓰면 fail2ban-client 가 컨테이너에 있지만 socket 미마운트 →
`auto_ban` 호출 시 `fail2ban-client error` 로 안전 fallback (`verdict: AutoBanFailed`).

## 232 서버 검증 절차

다음은 232에서 사용자가 직접 실행. 로컬에서 코드를 작성한 뒤 push → 232에서 pull → 아래 절차.

### A. 코드 반영
```bash
cd ~/SIEM-Trinity
git fetch origin
git checkout xdr/step2-fail2ban-auto-ban     # 또는 머지 후 main
cd 02-detection
docker compose up -d --build
```

### B. dry-run 동작 확인 (AUTO_BAN_ENABLED=false 기본)
```bash
# 1) 컨테이너 진입 후 ip_risk_scorer 즉시 실행
docker exec -it detection-api bash -c "cd /app && python ip_risk_scorer.py --hours 24"

# 2) 오늘자 경보 파일에서 DryRunBan 기록 확인
docker exec -it detection-api bash -c "grep -E 'DryRunBan|AutoBan' /app/reports/alerts_$(date +%F).jsonl | tail -20"
```

기대 결과:
- Critical IP가 있을 경우 `verdict: "DryRunBan"`, `reason: "AUTO_BAN_ENABLED=false"` 레코드 다수
- 실제 fail2ban-client 호출은 **0건** (`docker exec detection-api which fail2ban-client` 가 없어도 정상)

### C. 화이트리스트 검증
운영자 IP·Tailscale 100.x·내부망은 절대 차단되면 안 됨. 강제 테스트:

```bash
# 임시로 사용자 본인 공인 IP 를 Critical 신호와 함께 시뮬레이션하려면,
# 실제 트래픽 대신 jsonl 수동 검사:
docker exec -it detection-api python - <<'PY'
from auto_ban import auto_ban
# 운영자 IP(예시) → whitelist 적중해야 함
print(auto_ban("100.x.x.x", 95, {"ssh_attempts": 999, "is_banned": True}))
print(auto_ban("10.0.0.1",      95, {"ssh_attempts": 999, "is_banned": True}))
PY
```

기대: 두 호출 모두 `action='skipped'`, `reason='whitelist:internal_ip'`.

### D. Discord 알림 (선택)

`02-detection/.env` (또는 `docker-compose.yml` env) 에 `DISCORD_CRITICAL_WEBHOOK_URL` 설정 시 dry-run 도 노란색 embed 로 발송됨. 실제 차단 시 빨강.

### E. dry-run 1주일 관찰

`/app/reports/alerts_YYYY-MM-DD.jsonl` 에서 매일:
- `DryRunBan` 건수 추이
- **오탐 검토**: 내부 사용자/CDN/모니터링 봇 등이 Critical 로 잡혔는지

오탐 IP는 `AUTO_BAN_WHITELIST_IPS` 에 추가 (콤마 구분). 예:
```yaml
AUTO_BAN_WHITELIST_IPS: "100.x.x.x,1.2.3.4,5.6.7.8"
```

### F. 실제 활성화 (관찰 충분 후 별도 PR)

1. 호스트에 `siem-trinity` jail 추가 (`/etc/fail2ban/jail.local`):
   ```ini
   [siem-trinity]
   enabled = true
   filter  = siem-trinity-dummy
   action  = iptables-multiport[name=siem-trinity, port="all", protocol=all]
   maxretry = 999999     # 외부 트리거 전용. 자체 filter 매칭 금지
   bantime  = 86400      # 24h
   ```
   filter 파일 `/etc/fail2ban/filter.d/siem-trinity-dummy.conf`:
   ```ini
   [Definition]
   failregex = ^__SIEM_TRINITY_NEVER_MATCH__
   ```
2. `sudo systemctl restart fail2ban` → `fail2ban-client status siem-trinity` 정상 출력 확인
3. Dockerfile + compose volume 패치 PR (`xdr/step2b-fail2ban-socket`) 머지
4. `02-detection/.env` 에 `AUTO_BAN_ENABLED=true` → `docker compose up -d`
5. 첫 차단 발생 시 Discord 알림 + jsonl 의 `verdict: "AutoBan"` 확인

## 롤백

```bash
# 즉시 끄기
AUTO_BAN_ENABLED=false docker compose up -d

# 잘못 차단된 IP 해제
sudo fail2ban-client set siem-trinity unbanip <IP>
```

## 성공 기준 (epic #4 단계 2)

- [x] `auto_ban()` 함수 추가 (threshold=90)
- [x] dry-run 모드 (env, 기본 OFF)
- [x] 화이트리스트 (내부 IP + 명시 IP)
- [x] 차단 이벤트 Discord 알림
- [ ] fail2ban-client 호출 가능 (Docker socket bind-mount) — step2b PR
- [ ] dry-run 1주일 관찰 후 활성화 — 운영 작업
- [ ] 마스터 README "자동 대응 체인" 표 갱신 — 실제 활성화 후

## 연계

- 단계 3 (Wazuh active-response) 진입은 본 단계 검증 완료 후
- 단계 5 (Shuffle SOAR) playbook 1 "IP 위험도 90+ → fail2ban → Discord → 케이스" 의 첫 두 노드 구현
