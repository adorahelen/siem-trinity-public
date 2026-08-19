# 네트워크 접근 보안 가이드

- 작성 일시: 2026-03-07 KST
- 대상: Grafana, Loki 포트 외부 노출 차단

---

## 문제 상황

### Docker가 UFW를 우회하는 구조

Docker는 컨테이너 포트를 외부에 노출할 때 UFW를 거치지 않고 **iptables를 직접 수정**합니다.
따라서 UFW에 차단 규칙을 추가해도 Docker가 연 포트는 막히지 않습니다.

```
[외부 요청]
    ↓
iptables (Docker가 직접 수정)  ← UFW 규칙 무시됨
    ↓
Docker 컨테이너 (Grafana :3000)
```

### 변경 전 상태

```yaml
# docker-compose.yml
ports:
  - "3000:3000"   # 0.0.0.0:3000 → 모든 인터페이스에 바인딩
```

- `0.0.0.0:3000` = 공인 IP, Tailscale IP, 로컬 모두 수신
- `http://203.0.113.55:3000` (공인 IP)으로 외부에서 접속 가능한 상태
- UFW 규칙이 있어도 Docker iptables 규칙이 우선 적용되어 차단 불가

---

## 해결 방법

### 1단계: 포트 바인딩을 localhost로 제한

`docker-compose.yml`에서 포트 앞에 `127.0.0.1:`을 붙입니다.

```yaml
# 변경 전
ports:
  - "3000:3000"

# 변경 후
ports:
  - "127.0.0.1:3000:3000"
```

적용 대상:

| 서비스 | 변경 전 | 변경 후 |
|---|---|---|
| Grafana | `0.0.0.0:3000` | `127.0.0.1:3000` |
| Loki | `0.0.0.0:3100` | `127.0.0.1:3100` |

`127.0.0.1`로 바인딩하면 로컬호스트에서만 포트가 열리고,
외부 IP(공인 IP 포함)에서는 Docker 포트 자체가 보이지 않습니다.

### 2단계: Tailscale 인터페이스에 포트 허용 (UFW)

Tailscale 경유 접속은 허용해야 하므로 UFW에 규칙 추가:

```bash
sudo ufw allow in on tailscale0 to any port 3000 proto tcp
```

| UFW 규칙 | 의미 |
|---|---|
| `in on tailscale0` | tailscale0 인터페이스로 들어오는 트래픽만 |
| `to any port 3000` | 3000 포트 대상 |
| `proto tcp` | TCP 프로토콜 |

### 3단계: 컨테이너 재생성

`restart`가 아닌 `--force-recreate`로 컨테이너를 재생성해야 포트 바인딩 변경이 적용됩니다.

```bash
sg docker -c "docker compose up -d --force-recreate grafana loki"
```

> **주의**: `docker compose restart`는 기존 컨테이너 설정을 그대로 유지합니다.
> 포트/볼륨 변경 시에는 반드시 `--force-recreate`를 사용해야 합니다.

---

## 변경 후 상태

```bash
$ ss -tlnp | grep 3000
LISTEN 0  4096  127.0.0.1:3000  0.0.0.0:*
```

포트가 `127.0.0.1`에만 바인딩된 것을 확인할 수 있습니다.

| 접근 경로 | 변경 전 | 변경 후 |
|---|---|---|
| 공인 IP `203.0.113.55:3000` | 접속 가능 | 차단 |
| Tailscale `100.x.x.x:3000` | 접속 가능 | 접속 가능 |
| 로컬 `127.0.0.1:3000` | 접속 가능 | 접속 가능 |

---

## 현재 UFW 규칙 전체

```
To                              Action      From
--                              ------      ----
2026/tcp                        ALLOW IN    Anywhere
2222/tcp on tailscale0          ALLOW IN    Anywhere
3000/tcp on tailscale0          ALLOW IN    Anywhere    ← 이번에 추가
2026/tcp (v6)                   ALLOW IN    Anywhere (v6)
2222/tcp (v6) on tailscale0     ALLOW IN    Anywhere (v6)
3000/tcp (v6) on tailscale0     ALLOW IN    Anywhere (v6) ← 이번에 추가
```

---

## 핵심 교훈

| 상황 | 잘못된 접근 | 올바른 접근 |
|---|---|---|
| Docker 포트 외부 차단 | UFW 규칙 추가 | 포트를 `127.0.0.1`로 바인딩 |
| 설정 변경 후 적용 | `docker compose restart` | `docker compose up -d --force-recreate` |
| Tailscale 경유 허용 | - | `ufw allow in on tailscale0` |

---

## 관련 파일

| 파일 | 변경 내용 |
|---|---|
| `docker-compose.yml` | Grafana/Loki 포트 `127.0.0.1` 바인딩 |
| UFW 규칙 (`sudo ufw status`) | tailscale0 인터페이스 3000 포트 허용 |
