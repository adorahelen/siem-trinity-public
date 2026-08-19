# Phase 6 - 알림 설정 가이드

## 알림 동작 방식

```
Loki (로그 저장)
    ↓
Grafana Alert Rule (1분마다 조건 체크)
    ↓
조건 충족 → Contact Point(이메일/Slack)로 전송
```

---

## 설정할 알림 규칙

| 규칙명 | 조건 | 심각도 |
|---|---|---|
| SSH 브루트포스 감지 | 5분 내 Invalid user 50건 이상 | 긴급 |
| fail2ban 차단 급증 | 5분 내 Ban 이벤트 10건 이상 | 경고 |
| Nginx 5xx 급증 | 5분 내 5xx 에러 20건 이상 | 경고 |

---

## 선택지 1 - 이메일 알림

### 어떻게 동작하는가
Grafana가 SMTP 서버를 통해 이메일을 발송합니다.
Gmail을 SMTP 서버로 사용하는 방식이 가장 일반적입니다.

### 어디까지 계정 정보를 입력해야 하는가

```
입력 위치: docker-compose.yml → grafana 서비스 environment
```

```yaml
- GF_SMTP_ENABLED=true
- GF_SMTP_HOST=smtp.gmail.com:587
- GF_SMTP_USER=내Gmail주소@gmail.com      # Gmail 계정 아이디
- GF_SMTP_PASSWORD=앱비밀번호16자리        # Gmail 비밀번호 X, 앱 전용 비밀번호
- GF_SMTP_FROM_ADDRESS=내Gmail주소@gmail.com
- GF_SMTP_FROM_NAME=kangminlog Alert
```

### 중요: Gmail 앱 비밀번호란?
- Gmail 계정의 실제 비밀번호를 쓰는 게 아닙니다
- Google 계정 → 보안 → 2단계 인증 활성화 → 앱 비밀번호 생성
- 생성된 16자리 코드를 `GF_SMTP_PASSWORD`에 입력
- 실제 Gmail 비밀번호는 어디에도 입력하지 않아도 됩니다

### 보안 범위
| 항목 | 노출 범위 |
|---|---|
| Gmail 아이디 | docker-compose.yml 내부 (서버 로컬) |
| 앱 비밀번호 | docker-compose.yml 내부 (서버 로컬) |
| 실제 Gmail 비밀번호 | 입력 불필요 |
| 수신 이메일 주소 | Grafana UI에서 설정 |

---

## 선택지 2 - Slack 알림

### 어떻게 동작하는가
Grafana가 Slack Webhook URL로 HTTP 요청을 보내면
지정한 채널에 메시지가 표시됩니다.

### 어디까지 계정 정보를 입력해야 하는가

```
Slack 아이디/비밀번호는 입력하지 않습니다.
Webhook URL 하나만 입력합니다.
```

Webhook URL 발급 순서:
```
1. https://api.slack.com/apps 접속
2. Create New App → From scratch
3. 앱 이름 입력 (예: kangminlog-alert)
4. Incoming Webhooks → Activate
5. Add New Webhook to Workspace → 채널 선택
6. Webhook URL 복사 (https://hooks.slack.com/services/XXX/YYY/ZZZ)
```

발급된 URL을 Grafana UI에서 입력:
```
Grafana → Alerting → Contact points → Add contact point
→ Type: Slack
→ Webhook URL: 복사한 URL 붙여넣기
```

### 보안 범위
| 항목 | 노출 범위 |
|---|---|
| Slack 아이디/비밀번호 | 입력 불필요 |
| Webhook URL | Grafana DB 내부 저장 (서버 로컬) |
| 알림 수신 채널 | Webhook 발급 시 지정한 채널 |

---

## 이메일 vs Slack 비교

| 항목 | 이메일 | Slack |
|---|---|---|
| 설정 난이도 | 중간 (앱 비밀번호 발급 필요) | 쉬움 (URL 하나만 발급) |
| 계정 정보 입력 | Gmail 앱 비밀번호 필요 | Slack 계정 정보 불필요 |
| 즉시성 | 낮음 (수 분 지연 가능) | 높음 (수 초 내 수신) |
| 알림 확인 | 이메일 앱 | Slack 앱/데스크탑 |
| 권장 상황 | 공식 리포트용 | 실시간 모니터링용 |

---

## 권장 방향

둘 다 설정하는 것을 권장합니다.
- **Slack**: 실시간 긴급 알림 수신
- **이메일**: 일별 요약 리포트 수신 (추후 확장)

우선 Slack부터 설정하면 계정 정보 입력 없이 가장 빠르게 구성 가능합니다.

---

## 구현 순서 (결정 후 진행)

```
1. Slack Webhook URL 발급 (또는 Gmail 앱 비밀번호 발급)
2. Grafana Contact Point 등록
3. Notification Policy 설정 (어떤 알림을 어느 채널로)
4. Alert Rule 3개 작성 (SSH / fail2ban / Nginx)
5. 테스트 알림 발송 확인
```
