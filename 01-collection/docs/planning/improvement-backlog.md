# 수정/보완 백로그

> 현재 프로젝트 전체 검토 후 도출한 개선 사항 목록

---

## 🔴 즉시 대응 필요

### 1. Grafana 비밀번호 하드코딩
- **위치:** `docker-compose.yml` — Grafana 비밀번호 기본값 (해소됨: `.env` 필수 주입)
- **위험:** 레포가 public이라면 현재 노출 상태
- **조치:** 환경변수 파일(`.env`)로 분리, `.gitignore`에 추가
- **상태:** ⚠️ 개발 단계 유예 (최종 배포 전 처리 예정)

### 2. Loki TTL 미설정 ✅ 완료 (2026-03-10)
- **적용된 설정:** `limits_config.retention_period: 180d` + `compactor.retention_enabled: true`
- **기준:** 정보통신망법 시행령 (최소 3개월), 실무 권고 6개월

---

## 🟡 운영 중 문제가 될 수 있음

### 3. collector.py 중복 데이터 누적 ✅ 완료 (2026-03-10)
- **적용:** SHA-256 해시 비교 → 변경 시에만 Loki 전송
- **캐시 위치:** `/tmp/security-log-exporter-cache/*.hash`

### 4. reject_old_samples_max_age: 168h (7일)
- **위치:** `config/loki-config.yml`
- **문제:** 서버가 7일 이상 다운 후 복구되면 그 기간 로그를 Loki가 거부
- **조치:** 운영 중 장기 다운 시 이 설정 인지 필요. 필요시 값 조정

### 5. collector.py 실패 시 무통보 ✅ 완료 (2026-03-10)
- **적용:** `sys.exit(1)` + systemd `OnFailure=security-log-exporter-failure@%n.service`
- **파일:** `systemd/security-log-exporter-failure@.service` — 실패 시 syslog 기록

---

## 🟢 기능 개선 (Phase 6 이후)

### 6. 알림 미구현 (Phase 6) 🔄 진행 중
- Outlook SMTP 실패 → Slack Webhook으로 전환
- `.env`에 `SLACK_WEBHOOK_URL` 관리, `.gitignore` 등록 완료
- **남은 작업:** Slack Webhook URL 확보 → Contact Point 생성 → Alert Rules 3개 생성
  - SSH Invalid user ≥ 50회 / 5분
  - fail2ban Ban ≥ 10회 / 5분
  - Nginx 5xx ≥ 20회 / 5분

### 7. 디스크/시스템 모니터링 패널 없음 ✅ 완료 (2026-03-10)
- **적용:** Prometheus + Node Exporter 추가 (Panel 10~12)
  - CPU 사용률 (timeseries, 5분 평균)
  - 메모리 사용률 (timeseries)
  - 디스크 사용률 /  (gauge, 임계값 70%/90%)

### 8. loki-data 볼륨 백업 전략 없음
- **문제:** `loki-data` Docker 볼륨 소실 시 로그 전체 소실
- **조치:** 주기적 `docker run --volumes-from` 백업 스크립트 또는 외부 스토리지 마운트
- **상태:** ❌ 미구현

---

## 🔵 소소한 개선

### 9. Docker Compose version 필드 미명시
- **위치:** `docker-compose.yml`
- **문제:** 구버전 Docker Compose 환경에서 경고 발생 가능
- **조치:** `version: "3.8"` 상단 추가 (최신 Compose는 무시함)

### 10. nginx WebSocket 헤더 필요 여부 재확인
- **위치:** `config/nginx-grafana.conf`
- **내용:** Upgrade/Connection 헤더 설정되어 있으나 Grafana Live 미사용 시 불필요
- **조치:** 현재 유지해도 무해하나 사용 여부 확인

---

## 우선순위 요약

| 순위 | 항목 | 긴급도 | 상태 |
|---|---|---|---|
| 1 | Grafana 비밀번호 변경 | 🔴 즉시 | ⚠️ 개발 단계 유예 |
| 2 | Loki TTL 설정 | 🔴 즉시 | ✅ 완료 |
| 3 | Phase 6 알림 구현 | 🟡 단기 | 🔄 진행 중 (Slack URL 대기) |
| 4 | 디스크 모니터링 패널 추가 | 🟡 단기 | ✅ 완료 (Prometheus + Node Exporter) |
| 5 | collector.py 중복 방지 | 🟡 단기 | ✅ 완료 |
| 6 | loki-data 볼륨 백업 | 🟢 장기 | ❌ 미구현 |
| 7 | collector.py 실패 알림 | 🟢 장기 | ✅ 완료 (OnFailure handler) |
