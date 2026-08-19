# 인프라 운영 주의사항 및 디스크 모니터링 논의

---

## 현재 프로젝트 주의사항

### 1. TTL 미설정 (디스크 누수)

`config/loki-config.yml`에 `retention_period`가 없어 로그가 무기한 쌓인다.

```yaml
# 현재: 없음
# 추가 필요:
table_manager:
  retention_deletes_enabled: true
  retention_period: 720h  # 30일
```

### 2. WAL 디렉터리 중복 적재

`/loki/wal`, `/loki/index`, `/loki/chunks`, `/loki/compactor` 4개 경로가 모두
같은 Docker 볼륨(`loki-data`)에 쌓인다. 볼륨 하나가 커지면 전부 영향을 받는다.

### 3. 수집 주기 누적

`collector.py`가 5분마다 `ss`, `lastb`, `tailscale status` 출력을 통째로 Loki에 push한다.
내용이 바뀌지 않아도 매번 저장되므로 중복 데이터가 쌓인다.

### 4. Grafana 비밀번호 하드코딩

`docker-compose.yml` 에 Grafana 비밀번호 기본값이 평문으로 존재했다. → `.env` 필수 주입으로 해소.

---

## 디스크 모니터링 현황

현재 Grafana 대시보드 8개 패널 전부 보안 이벤트(SSH, fail2ban, UFW, nginx) 전용이다.
디스크/시스템 리소스 관련 패널은 하나도 없다 → **현재 불가능**.

### 추가 방법 (현재 스택 기준)

**방법 A — collector.py에 `df` 출력 추가 (빠름)**
```python
def collect_disk():
    result = subprocess.run(['df', '-h', '/'], capture_output=True, text=True)
    push_to_loki(result.stdout, {"job": "disk_usage"})
```
→ Grafana Logs 패널로 raw 출력 확인 가능

**방법 B — Prometheus + Node Exporter 추가 (정석)**
```yaml
# docker-compose.yml에 추가
node-exporter:
  image: prom/node-exporter
prometheus:
  image: prom/prometheus
```
→ Grafana에서 디스크 사용률 Timeseries 그래프로 확인 가능. 단, 스택이 커짐.

---

## 디스크 모니터링, 어디에 구현해야 하나?

→ 별도 논의 문서 참고
