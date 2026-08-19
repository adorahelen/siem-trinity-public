# XDR 1단계 — Wazuh Agent + auditd

> 이슈 #4 (XDR 6단계 epic)의 1단계. **Endpoint 가시성** 확보.
> 사용자가 운영 호스트(`kangminlog`) 또는 deploy-test VM에서 직접 실행.

## 목적

현재 SIEM-Trinity는 Network 로그(Zeek/Suricata) 중심. 호스트 내부 이벤트(프로세스·파일·로그인 등)는 syslog/journald 정도만 수집.

**Wazuh Agent + auditd로 다음을 추가 수집:**
- 권한 상승 (suid 실행)
- 중요 파일 변경 (`/etc/passwd`, `/etc/shadow`, `/etc/sudoers`, ssh keys 등)
- 네트워크/커널/Docker 설정 변경
- (Wazuh 자체) FIM, rootcheck, syscheck

→ 이슈 #2 (verification: Wazuh agent 등록 현황) **자동 해소.**

## 사전 조건

| 항목 | 필요 |
|---|---|
| OS | Ubuntu 24.04 (Debian 12 호환) |
| SIEM-Trinity 가동 | `wazuh-manager` 컨테이너 Up 상태 |
| 권한 | sudo |
| 네트워크 | Wazuh manager의 1514/1515 포트 접근 (같은 호스트면 127.0.0.1) |

## 실행

```bash
cd <SIEM-Trinity 모노레포 경로>
sudo bash 01-collection/scripts/setup-wazuh-agent.sh
```

다른 호스트에 manager가 있으면 IP 지정:
```bash
sudo bash 01-collection/scripts/setup-wazuh-agent.sh 192.168.10.232
```

### 스크립트가 자동 처리

1. Wazuh apt repo + GPG key 등록
2. `wazuh-agent` + `auditd` + `audispd-plugins` 설치
3. auditd 룰 적용 (`config/auditd-siem-trinity.rules` → `/etc/audit/rules.d/`)
4. Wazuh agent에 manager IP 설정 + enrollment
5. `systemctl enable --now wazuh-agent auditd`

## 검증

### A. agent 등록 확인 (Manager 측)
```bash
docker exec wazuh-manager /var/ossec/bin/agent_control -l
```
**기대:** `001  <hostname>  active`

→ 이슈 #2 정식 close 가능.

### B. agent 자체 상태
```bash
systemctl status wazuh-agent
journalctl -u wazuh-agent -n 30
```

### C. auditd 룰 적용
```bash
sudo auditctl -l | head -20
```
→ 30+ 룰 출력되어야 함.

### D. Wazuh가 auditd 이벤트 수신
```bash
# 의도적으로 sudo 사용
sudo whoami
# 약 30초 후 Manager 측 로그 확인
docker exec wazuh-manager tail -50 /var/ossec/logs/alerts/alerts.log
```

### E. Loki에 인입
```bash
curl -s -G --data-urlencode 'query={job="wazuh"}' \
  "http://${HOST_BIND_IP}:3100/loki/api/v1/query_range?limit=5"
```

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `agent_control -l`이 비어 있음 | enrollment 실패 | `journalctl -u wazuh-agent` 확인. 보통 manager 1515 포트 접근 불가 |
| 1515 포트 접근 불가 | compose의 `127.0.0.1:1515:1515/tcp` 바인딩 | agent가 같은 호스트면 OK. 다른 호스트면 `HOST_BIND_IP`로 바꿔 재가동 |
| auditd 룰 적용 안 됨 | 기존 룰과 충돌 | `auditctl -D && augenrules --load` |
| Wazuh가 auditd 이벤트 인식 안 함 | audispd-plugins 미설정 | `/etc/audit/plugins.d/af_unix.conf` 확인 |

## 02-detection 연계 (다음 단계)

XDR-1 완료 후, `02-detection/ip_risk_scorer.py`에 Wazuh agent 이벤트를 IP 위험도 가중치로 추가하는 작업이 남음. 이는 별도 PR로 분리 (agent 데이터 수집 시작 후 진행).

## 관련

- 이슈 #4 epic
- 이슈 #2 verification (본 작업으로 해소)
- 다음 단계: XDR-2 (02-detection → fail2ban 자동 연결)
