# Docker nginx 파일 로그 운영 패턴 (2026-03-15)

## 핵심 구조 이해

복잡해 보이는 이유는 4가지 주체가 섞여 있기 때문입니다.

```
[1] 컨테이너 nginx → /var/log/nginx/*.log 에 씀
[2] bind mount     → 호스트 /var/log/nginx/ 와 동일 경로
[3] 호스트 logrotate → 파일명 변경 (access.log → access.log.1)
[4] 컨테이너 nginx → 새 파일을 다시 열어야 정상 기록 계속
```

이게 4단계로 나뉘어 있어서 어렵게 느껴지지만,
**어려운 보안 이슈가 아니라 Docker 파일 로그 운영 이슈**입니다.

---

## 선택지 2가지

### 방식 A — 파일 로그 (현재 적용)

```
컨테이너 nginx → 파일 write
     ↓ bind mount
호스트 /var/log/nginx/*.log
     ↓ logrotate (daily)
postrotate → docker exec ... nginx -s reopen
     ↓
Promtail file scrape → Loki
```

**장점:** Promtail file scrape 구조와 자연스럽게 맞음.
**단점:** logrotate postrotate에 docker exec 추가 필요.

### 방식 B — stdout 로그

```
컨테이너 nginx → stdout/stderr
     ↓ Docker log driver
Promtail Docker log scrape → Loki
```

**장점:** logrotate/reopen 불필요. 구조 단순.
**단점:** Promtail이 Docker 로그 수집 방식으로 전환 필요. 현재 프로젝트는 file scrape 중심이라 전환 비용 있음.

---

## 현재 프로젝트 결론

**방식 A (파일 로그 + reopen)** 유지가 맞습니다.

이유: Promtail이 이미 파일 scrape 중심 구조이기 때문입니다.

---

## 핵심 설정 3줄 요약

```yaml
# 1. docker-compose.yml — bind mount
volumes:
  - /var/log/nginx:/var/log/nginx

# 2. docker-compose.yml — ModSec 로그 파일로
environment:
  - MODSEC_AUDIT_LOG=/var/log/nginx/modsec_audit.log
```

```bash
# 3. /etc/logrotate.d/nginx — postrotate
postrotate
    invoke-rc.d nginx rotate >/dev/null 2>&1 || true
    docker exec dodgers-nginx-1 nginx -s reopen >/dev/null 2>&1 || true
endscript
```

---

## 로그 Source of Truth

| 로그 종류 | 생성 위치 | 저장 경로 | 수집 주체 | Loki job |
|-----------|-----------|-----------|-----------|----------|
| nginx access | Docker nginx | `/var/log/nginx/access.log` | Promtail | nginx |
| nginx error | Docker nginx | `/var/log/nginx/error.log` | Promtail | nginx |
| ModSecurity audit | Docker nginx | `/var/log/nginx/modsec_audit.log` | Promtail | modsec |
| 컨테이너 앱 로그 | 각 컨테이너 stdout | Docker log driver | **미수집** | — |

> 컨테이너 앱(auth-service, frontend 등) stdout 로그는 현재 Loki에 수집 안 됨.
> 침해 조사 시 `docker logs <container>` 로 직접 확인 필요.
> 전수 수집이 필요하면 방식 B(stdout scrape)로 전환 고려.
