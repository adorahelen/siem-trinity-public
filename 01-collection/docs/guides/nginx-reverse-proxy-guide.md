# nginx 리버스 프록시 설정 가이드

- 작성 일시: 2026-03-07 KST
- 목적: Tailscale IP 경유 Grafana 접근 허용 + 공인 IP 완전 차단

---

## 문제 상황

### 127.0.0.1 바인딩만으로는 Tailscale 접근 불가

Docker 포트를 `127.0.0.1:3000`으로 바인딩하면 공인 IP 노출은 막을 수 있지만,
Tailscale 트래픽도 함께 차단됩니다.

```
Tailscale 요청 (100.x.x.x)
    ↓
tailscale0 인터페이스
    ↓
3000 포트 → 127.0.0.1만 수신 중 → 연결 거절 (curl exit code 7)
```

| 접근 경로 | 바인딩 변경 후 상태 |
|---|---|
| 공인 IP `203.0.113.55:3000` | 차단 |
| Tailscale `100.x.x.x:3000` | 차단 (의도하지 않은 결과) |
| 로컬 `127.0.0.1:3000` | 접속 가능 |

---

## 해결 방법: nginx 리버스 프록시

nginx가 Tailscale 인터페이스에서 요청을 받아 로컬 Grafana로 전달합니다.

### 최종 트래픽 흐름

```
[사용자 브라우저]
    ↓  Tailscale VPN
100.x.x.x:3000
    ↓
nginx (tailscale0 인터페이스 수신)
    ↓  내부 전달 (proxy_pass)
127.0.0.1:3000
    ↓
Grafana 컨테이너
```

---

## 설정 파일

### config/nginx-grafana.conf

```nginx
server {
    listen 100.x.x.x:3000;  # Tailscale IP에서만 수신

    location / {
        proxy_pass http://127.0.0.1:3000;  # Grafana로 전달
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Grafana WebSocket (Live 기능) 지원
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**설정 포인트:**

| 항목 | 값 | 의미 |
|---|---|---|
| `listen 100.x.x.x:3000` | Tailscale IP | 이 IP로 오는 요청만 수신 |
| `proxy_pass http://127.0.0.1:3000` | Grafana 로컬 주소 | 내부로 요청 전달 |
| `proxy_set_header X-Real-IP` | 클라이언트 실제 IP | Grafana 로그에 원본 IP 기록 |
| `Upgrade / Connection` | WebSocket 헤더 | Grafana Live 패널 실시간 업데이트 지원 |

---

## 적용 절차

### 1. 설정 파일 복사 및 활성화

```bash
sudo cp /home/user/security-log-monitor/config/nginx-grafana.conf /etc/nginx/sites-available/grafana
sudo ln -s /etc/nginx/sites-available/grafana /etc/nginx/sites-enabled/grafana
```

### 2. 문법 검사

```bash
sudo nginx -t
```

정상 출력:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 3. nginx 리로드

```bash
sudo systemctl reload nginx
```

> `restart` 대신 `reload`를 사용합니다.
> `reload`는 기존 연결을 끊지 않고 설정만 다시 읽습니다.

---

## 적용 후 검증

### Tailscale 접속 확인

```bash
curl -s -o /dev/null -w "%{http_code}" http://100.x.x.x:3000
```

결과: `302` (Grafana 로그인 페이지로 리다이렉트 = 정상)

### 공인 IP 차단 확인

```bash
curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://203.0.113.55:3000
```

결과: `000` (연결 자체 불가 = 차단 성공)

---

## 최종 접근 권한 정리

| 접근 경로 | 결과 | 이유 |
|---|---|---|
| 공인 IP `203.0.113.55:3000` | 차단 | Docker 포트가 127.0.0.1 바인딩, nginx도 해당 IP 미수신 |
| Tailscale `100.x.x.x:3000` | 허용 | nginx가 tailscale0 인터페이스에서 수신 후 프록시 |
| 로컬 `127.0.0.1:3000` | 허용 | Grafana 직접 수신 (서버 내부 전용) |

---

## 관련 파일 위치

| 파일 | 경로 |
|---|---|
| nginx 설정 (프로젝트) | `config/nginx-grafana.conf` |
| nginx 설정 (서버 적용) | `/etc/nginx/sites-available/grafana` |
| nginx 심볼릭 링크 | `/etc/nginx/sites-enabled/grafana` |
| Docker 포트 바인딩 | `docker-compose.yml` |

---

## 핵심 교훈

| 상황 | 잘못된 접근 | 올바른 접근 |
|---|---|---|
| Tailscale만 허용 | UFW 규칙만 추가 | nginx로 특정 인터페이스 수신 |
| nginx 설정 반영 | `systemctl restart nginx` | `systemctl reload nginx` (무중단) |
| 공인 IP 차단 | UFW 의존 | Docker 바인딩을 127.0.0.1로 제한 |
