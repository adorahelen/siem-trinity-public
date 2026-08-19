# XDR 3단계 — Wazuh Active Response

> 이슈 #4 단계 3. 단계 1(Wazuh agent + auditd) 머지(PR #24) 후 진입.
> **운영 영향이 단계 2 보다 더 즉각적** — 잘못 설정하면 운영자가 본인 IP 를 차단당함.

## 목적

Wazuh 룰이 일정 수준 이상의 alert 를 발생시킬 때 호스트 방화벽(`iptables`)에서 출처 IP 를 자동 차단.

| 입력 | 동작 |
|---|---|
| Wazuh alert level ≥ 10 + 매핑된 rule | `firewall-drop` 액션 → 600초 차단 |
| 화이트리스트(Tailscale 100.x, 사설망, localhost) | **무조건 차단 제외** |

## 구성 파일

- [`01-collection/config/wazuh-ossec.conf`](../01-collection/config/wazuh-ossec.conf)
  - `<global><white_list>` 4개 (Tailscale, 사설 3대역, localhost) — **항상 활성**
  - `<active-response>` 블록 — **기본 비활성** (주석)
- 본 문서 — 활성화 절차

## 활성화 절차 (232 또는 운영 호스트)

### A. dry-run 관찰 (1주일 권장)

활성화 전, Wazuh alert level ≥ 10 발생 빈도를 1주일 관찰. log-only:

```bash
# Wazuh alert level 추이 (오늘)
docker exec wazuh-manager grep -E '"level":\s*(1[0-5])' /var/ossec/logs/alerts/alerts.json | wc -l

# 어떤 rule.id 가 발화 중인지
docker exec wazuh-manager sh -c "grep -oE '\"id\":\"[0-9]+\"' /var/ossec/logs/alerts/alerts.json | sort | uniq -c | sort -rn | head -20"
```

기대치: 외부 공격에 의한 발화가 다수, 운영자 정상 활동에 의한 발화 0건.

### B. 화이트리스트 보강

운영자 접속 IP 대역이 누락된 경우 `wazuh-ossec.conf` 에 추가:

```xml
<global>
  ...
  <white_list>1.2.3.4</white_list>          <!-- 회사 고정 IP 등 -->
  <white_list>example.dyndns.org</white_list>  <!-- 동적 IP 도메인 -->
</global>
```

### C. rule_id 검증

`<rules_id>5712,5763,40111,31151,31153</rules_id>` 의 의미:

| rule_id | 의미 |
|---|---|
| 5712 | SSH brute force, level 10 |
| 5763 | SSH multiple authentication failures |
| 40111 | Multiple authentication failures |
| 31151 | Multiple web server errors |
| 31153 | Multiple web server 404 (scanning) |

본인 환경에 맞게 추가/삭제. 모든 룰 id 는 https://documentation.wazuh.com/current/user-manual/ruleset/index.html 에서 확인.

### D. 활성화

```bash
# 232 또는 운영 호스트의 01-collection 컴포즈 디렉토리에서
cd 01-collection

# wazuh-ossec.conf 의 <active-response> 블록 주석 해제
$EDITOR config/wazuh-ossec.conf

# wazuh-manager 재시작
docker compose restart wazuh-manager

# 활성화 확인
docker exec wazuh-manager /var/ossec/bin/wazuh-control status
docker exec wazuh-manager grep -A 3 "<active-response>" /var/ossec/etc/ossec.conf
```

### E. 동작 검증

테스트 환경(232)에서 화이트리스트 미해당 외부 IP 시뮬레이션:

```bash
# 다른 PC에서 232 의 SSH 에 잘못된 비밀번호로 N회 시도
for i in $(seq 1 6); do
  sshpass -p wrong ssh -o StrictHostKeyChecking=no fakeuser@192.168.10.232 exit 2>&1
done

# 232 에서 active-response 트리거 확인
sudo iptables -L INPUT -v -n | grep DROP    # 새 룰 추가됨
docker exec wazuh-manager tail -20 /var/ossec/logs/active-responses.log
```

(주의: 192.168.10.0/24 는 화이트리스트에 포함됨 — 진짜 시뮬레이션은 외부망 IP 가 필요)

### F. 비활성화 (롤백)

```bash
# wazuh-ossec.conf 의 <active-response> 블록 다시 주석 처리
docker compose restart wazuh-manager

# 이미 추가된 iptables 룰 제거 (timeout 600 후 자동 만료되지만 즉시 해제 가능)
sudo iptables -F  # ⚠ 모든 룰 flush — 다른 룰 있으면 사용 금지
# 또는 specific:
sudo iptables -D INPUT -s <BANNED_IP> -j DROP
```

## 성공 기준 (epic #4 단계 3)

- [x] `ossec.conf` 에 `<active-response>` 블록 추가 (주석 상태)
- [x] 화이트리스트: Tailscale 100.64.0.0/10 + 사설망 + localhost — 항상 활성
- [x] 임계치: level ≥ 10 (Wazuh 기본 alert level 매핑)
- [ ] dry-run 1주일 관찰 — 운영 작업
- [ ] 활성화 — 운영 판단 후
- [ ] 외부 IP 시뮬 차단 검증 — 활성화 후

## 연계

- **단계 1(PR #24)** 의 Wazuh agent 등록이 없으면 alert 자체가 발생 안 함 → 활성화 무의미. 단계 1 선행 완료 필수.
- **단계 2(PR #29) + 2b(PR #34)** 의 `auto_ban` 과 **이중 차단** 가능:
  - 02-detection 의 ip_risk_scorer 가 fail2ban-client 로 차단 (애플리케이션 레이어)
  - Wazuh active-response 가 iptables 로 차단 (호스트 레이어)
  - 동시 활성화 시 차단 일관성/추적성에 주의. 단일 IP 가 두 경로에서 차단 기록 남음.
- **단계 5(SOAR)** playbook 2 \"Wazuh critical → active-response → Discord → 케이스\" 의 첫 노드 구현.
