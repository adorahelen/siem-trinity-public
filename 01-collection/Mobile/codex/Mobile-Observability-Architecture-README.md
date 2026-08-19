# Mobile Observability Architecture README

- 작성 일시: 2026-03-13 KST
- 목적: 현재 `security-log-monitor` 프로젝트를 기반으로 모바일 앱의 합법적 보안 이벤트 및 네트워크 메타데이터를 수집/시각화하기 위한 아키텍처 설계
- 범위: `통신 내용 감청`이 아닌 `본인 앱의 보안 이벤트`, `앱 네트워크 메타데이터`, `서버/API 접근 흔적` 수집

---

## 1. 목표

이 설계의 목표는 아래와 같다.

1. 안드로이드 앱이 자기 자신의 보안 이벤트와 네트워크 메타데이터를 수집한다.
2. 수집한 이벤트를 미니PC의 현재 프로젝트 스택으로 보낸다.
3. `Loki + Grafana`에서 모바일 앱 보안 이벤트를 함께 관제한다.

중요한 전제:

- 수집 대상은 `본인 앱`의 이벤트다.
- 수집 대상은 `메타데이터`다.
- 메시지 본문, SNS 내용, 브라우저 평문 내용 같은 `콘텐츠 감청`은 범위 밖이다.

---

## 2. 전체 아키텍처

```text
[MacBook 개발 환경]
  - Android Studio
  - JDK
  - adb
  - Git
        |
        |  빌드 / 배포 / 디버깅
        v
[Android Phone]
  - Kotlin App
  - OkHttp / Retrofit
  - Security Event Logger
  - Room (오프라인 큐)
  - WorkManager (배치 전송)
  - ConnectivityManager (네트워크 상태 수집)
        |
        |  HTTPS / OTLP or JSON
        v
[Mini PC]
  - nginx (선택: reverse proxy / TLS / auth)
  - OTel Collector 또는 간단한 수집 API
  - Loki
  - Grafana
  - Promtail (기존 로그 수집용)
        |
        v
[Dashboards / Alerting]
  - API 실패율
  - TLS 오류 / pinning 실패
  - 네트워크 타입별 오류율
  - 앱 버전별 장애
  - 루팅 탐지 / 무결성 이벤트
```

---

## 3. 기술 스택

### MacBook 개발 환경

- `Android Studio`
- `JDK 17`
- `adb` (Android Platform Tools)
- `Git`
- `VS Code` 또는 `Zed` 또는 `IntelliJ IDEA`

권장:

- 모바일 앱 개발과 디버깅은 `Android Studio`가 사실상 기본이다.
- 문서, 설정 파일, 서버 코드 편집은 `VS Code` 또는 `Zed`로도 충분하다.

최소 권장 설치:

- `Android Studio`
- `Android SDK Platform Tools`
- `JDK 17`
- `Git`

있으면 좋은 도구:

- `VS Code`
- `Postman` 또는 `Insomnia`
- `jq`
- `curl`

### Android 앱

- 언어: `Kotlin`
- 네트워크: `OkHttp`, `Retrofit`
- 로컬 저장: `Room`
- 백그라운드 작업: `WorkManager`
- 직렬화: `kotlinx.serialization` 또는 `Moshi`
- 로그/관측:
  - `OpenTelemetry Android` 또는
  - 초기 MVP에서는 커스텀 JSON logger

### Mini PC 서버

- `nginx`
- `OpenTelemetry Collector` 또는 `간단한 수집 API`
- `Loki`
- `Grafana`
- 기존 `Promtail`

### 보안/운영

- `HTTPS`
- 앱 인증용 `API key` 또는 `device registration token`
- rate limit
- log redaction

---

## 4. 권장 구현 단계

### 단계 A. 빠른 MVP

가장 먼저 구현할 때는 복잡도를 낮춘다.

구성:

- 안드로이드 앱이 JSON 이벤트를 `POST /mobile-events`로 전송
- 미니PC에서 간단한 수집 엔드포인트가 JSON을 파일 로그로 저장
- Promtail이 그 파일을 읽어서 Loki로 전송
- Grafana에서 조회

장점:

- 구현이 단순하다.
- 기존 프로젝트와 가장 빨리 연결된다.

### 단계 B. 정식 구조

이후 고도화 단계에서는 표준 관측 구조로 이동한다.

구성:

- 안드로이드 앱에 `OpenTelemetry Android`
- 미니PC에 `OpenTelemetry Collector`
- Collector가 가공 후 Loki로 export

장점:

- 벤더 중립적이다.
- 추후 trace, metric, log 확장에 유리하다.
- 모바일/서버를 하나의 observability 체계로 묶기 좋다.

---

## 5. 앱이 수집해야 할 이벤트

### 앱 네트워크 메타데이터

- 요청 시각
- 응답 시각
- endpoint
- HTTP method
- status code
- latency
- retry 횟수
- network type (`WIFI`, `CELLULAR`, `VPN`, `OFFLINE`)
- bytes sent / received

### 앱 보안 이벤트

- 루팅 탐지
- 디버깅 활성화 탐지
- 에뮬레이터 탐지
- 위변조 탐지
- TLS 오류
- pinning 실패
- 인증 실패
- 토큰 갱신 실패

### 앱 환경 메타데이터

- app version
- Android version
- device model
- manufacturer
- install id
- session id

중요:

- 비밀번호 저장 금지
- access token 원문 저장 금지
- 쿠키 원문 저장 금지
- 메시지/SNS 본문 저장 금지
- request body 전체 저장 금지

---

## 6. 안드로이드 앱 내부 구조

```text
app/
 ├─ network/
 │   ├─ ApiService
 │   ├─ OkHttpClient
 │   ├─ NetworkLoggingInterceptor
 │   └─ Pinning/TLS handling
 ├─ security/
 │   ├─ RootDetection
 │   ├─ DebuggerDetection
 │   ├─ EmulatorDetection
 │   └─ IntegrityEventProducer
 ├─ telemetry/
 │   ├─ EventRepository
 │   ├─ EventQueue(Room)
 │   ├─ EventUploader
 │   └─ ConnectivityObserver
 ├─ worker/
 │   └─ UploadWorker(WorkManager)
 └─ ui/
```

핵심 역할:

- `NetworkLoggingInterceptor`
  - API 호출 메타데이터 수집
- `ConnectivityObserver`
  - Wi-Fi / 셀룰러 / VPN / 오프라인 상태 수집
- `EventQueue(Room)`
  - 네트워크가 없을 때 이벤트 임시 저장
- `UploadWorker`
  - 배치 업로드
- `RootDetection`
  - 루팅/디버깅/무결성 관련 이벤트 생성

---

## 7. Mini PC에서 해야 할 일

현재 프로젝트가 이미 돌고 있는 미니PC는 모바일 이벤트의 중앙 수집기 역할을 한다.

해야 할 일:

1. 모바일 이벤트 수집용 엔드포인트를 추가한다.
2. 수집 이벤트를 구조화 로그로 저장한다.
3. Loki로 보낸다.
4. Grafana 대시보드를 만든다.

### 선택지 1. 간단한 HTTP 수집 API

가능한 구현:

- `Python FastAPI`
- `Node.js + Express`
- `Go`

권장:

- 현재 프로젝트 분위기상 `Python FastAPI`가 가장 가볍다.

예상 역할:

- `/mobile-events`
- JSON 수신
- 필수 필드 검증
- 민감정보 차단
- 파일 또는 stdout 로그 출력

### 선택지 2. OpenTelemetry Collector

가능한 구현:

- Collector 컨테이너 추가
- 앱이 OTLP/HTTP 또는 OTLP/gRPC로 전송
- Collector에서 Loki export

장점:

- 장기적으로 더 정석적
- 모바일/서버 observability 통합에 유리

### 미니PC 추가 작업 목록

- `docker-compose.yml`에 collector 또는 수집 API 추가
- `nginx` reverse proxy 경로 추가
- `config/promtail-config.yml`에 모바일 이벤트 파일 경로 추가
- Grafana 대시보드 JSON에 모바일 패널 추가
- 알림 규칙 추가

---

## 8. MacBook에서 해야 할 일

개발용 맥북은 앱 개발과 테스트 중심이다.

필수:

- `Android Studio`
- `JDK 17`
- `adb`
- `Git`

권장:

- `VS Code` 또는 `Zed`
- `Postman` 또는 `Insomnia`

개발 흐름:

1. Android Studio에서 앱 프로젝트 생성
2. Retrofit / OkHttp / Room / WorkManager 구성
3. 디바이스 연결 후 `adb`로 디버깅
4. 미니PC의 테스트 수집 엔드포인트로 이벤트 전송
5. Grafana에서 확인

맥북에서 확인할 항목:

- 앱 빌드 성공 여부
- HTTPS 연결 여부
- 이벤트 payload 형식
- 오프라인 큐 동작 여부
- 네트워크 복구 후 재전송 여부

---

## 9. 휴대폰 준비 사항

대상은 `안드로이드`, 특히 `갤럭시`를 가정한다.

### 공통 준비

- 개발자 옵션 활성화
- USB 디버깅 허용
- 테스트 앱 설치 허용
- 배터리 최적화에서 테스트 앱 예외 처리 고려

### USIM 없는 공기계

특징:

- 셀룰러 데이터는 보통 사용하지 않음
- Wi-Fi가 있으면 온라인 테스트 가능
- Wi-Fi도 없으면 오프라인/에어갭 테스트 중심

준비 시나리오:

#### A. Wi-Fi 연결 O

- 앱이 미니PC 서버로 바로 이벤트 전송 가능
- 가장 테스트하기 쉬운 구성

#### B. Wi-Fi 연결 X

- 이벤트는 `Room`에 임시 저장
- USB 디버깅 후 로그 확인
- 나중에 Wi-Fi 연결 시 일괄 업로드

의미:

- 공기계는 `안전한 테스트 단말`로 쓰기 좋다.
- 셀룰러 변수 없이 앱 이벤트 설계를 검증하기 좋다.

### USIM 장착 일반 휴대폰

특징:

- 셀룰러 데이터 사용 가능
- Wi-Fi와 셀룰러를 오가며 테스트 가능
- 실제 사용자 환경과 더 유사

준비 시나리오:

#### A. Wi-Fi 연결 O

- 내부 테스트 환경에 붙이기 가장 편하다.
- 미니PC와 같은 네트워크 또는 Tailscale 경로로 연결 가능

#### B. Wi-Fi 연결 X / 셀룰러 O

- 외부 네트워크에서 미니PC 접근이 필요하다.
- 이 경우 직접 공인 노출보다 `Tailscale`, VPN, 또는 안전한 reverse proxy가 더 적절하다.

주의:

- 테스트용이라면 셀룰러보다 Wi-Fi 우선이 운영/디버깅에 훨씬 쉽다.
- 셀룰러 테스트는 실제 현장성과는 좋지만 복잡도가 올라간다.

### 완전 오프라인 상태

- USIM 없음
- Wi-Fi 없음
- Bluetooth/NFC도 끄는 것이 바람직

이 상태에서는:

- 실시간 서버 전송 불가
- 앱 내부 큐 저장만 가능
- 관제보다는 `오프라인 로깅 + 나중 업로드` 구조가 필요

즉, 완전 오프라인 단말은 실시간 관제 대상이 아니라 `지연 업로드 대상`에 가깝다.

---

## 10. USIM / Wi-Fi 조합별 권장 전략

| 단말 상태 | 실시간 전송 | 적합한 용도 | 권장 여부 |
|---|---|---|---|
| 공기계 + Wi-Fi O | 가능 | MVP 개발/내부 테스트 | 매우 권장 |
| 공기계 + Wi-Fi X | 불가 | 오프라인 큐 테스트 | 보조용 |
| USIM O + Wi-Fi O | 가능 | 실사용 유사 테스트 | 권장 |
| USIM O + Wi-Fi X | 가능하나 복잡 | 셀룰러 환경 테스트 | 후순위 |
| USIM X + Wi-Fi X + 에어갭 | 불가 | 오프라인 보안 실험 | 특수 목적 |

현실적인 추천 순서:

1. `공기계 + Wi-Fi`
2. `USIM 장착 기기 + Wi-Fi`
3. `셀룰러 단독 테스트`
4. `완전 오프라인 테스트`

---

## 11. 보안 설계 원칙

- 앱은 `메타데이터`만 전송한다.
- 민감정보는 로깅하지 않는다.
- 모든 업로드는 `HTTPS`를 사용한다.
- 이벤트 전송 endpoint는 인증한다.
- 로그량 제한과 rate limit을 둔다.
- 오프라인 큐는 크기 제한을 둔다.
- 재전송 시 중복 방지용 `event_id`를 둔다.

---

## 12. 추천 구현 조합

### 가장 쉬운 MVP

- 앱:
  - `Kotlin`
  - `Retrofit`
  - `OkHttp`
  - `Room`
  - `WorkManager`
- 미니PC:
  - `FastAPI`
  - `Promtail`
  - `Loki`
  - `Grafana`

### 장기 권장형

- 앱:
  - `Kotlin`
  - `OkHttp`
  - `Room`
  - `WorkManager`
  - `OpenTelemetry Android`
- 미니PC:
  - `OpenTelemetry Collector`
  - `Loki`
  - `Grafana`
  - `nginx`

---

## 13. 구현 순서 제안

1. `MacBook`에 Android Studio + adb + JDK 설치
2. 공기계 또는 테스트용 갤럭시에 앱 설치
3. 앱에서 API 메타데이터 로깅 구현
4. 미니PC에 `/mobile-events` 수집 API 추가
5. Promtail/Loki/Grafana 연동
6. 루팅 탐지/디버깅 탐지 같은 보안 이벤트 추가
7. 이후 필요 시 OTel Collector 구조로 확장

---

## 14. 현재 결론

이 프로젝트와 가장 잘 맞는 방향은 아래다.

- 모바일 앱은 `본인 앱 이벤트`만 수집한다.
- 미니PC는 중앙 수집/시각화 역할을 한다.
- 초기에는 `FastAPI + Loki + Grafana`로 빠르게 시작한다.
- 이후 `OpenTelemetry Collector`로 확장한다.
- 테스트 단말은 `공기계 + Wi-Fi`가 가장 적합하다.

즉, 모바일 보안 이벤트 관제는 가능하다.
다만 그 출발점은 `휴대폰 전체 감청`이 아니라 `앱 중심 메타데이터 수집`이다.

---

## 15. 가능한 것 / 불가능한 것 / 전제조건이 필요한 것

아래 표는 다음과 같은 확장 구조를 가정한다.

- `VpnService`
- `UsageStatsManager`
- `ConnectivityManager`
- `PackageManager`
- `WorkManager`
- `Room`
- 수집 결과를 미니PC의 `Loki/Grafana`로 전송

### 가능한 것

| 항목 | 가능 여부 | 설명 |
|---|---|---|
| 내 앱의 API 호출 메타데이터 | 가능 | endpoint, 상태코드, 지연시간, 재시도 등 |
| 단말 네트워크 상태 변화 | 가능 | Wi-Fi/셀룰러/VPN/오프라인 전환 |
| 앱 포그라운드/백그라운드 사용 이력 일부 | 가능 | `UsageStatsManager` 권한 필요 |
| 설치 앱 목록과 버전 정보 | 가능 | `PackageManager` 기반 |
| 앱 서명/무결성 점검 일부 | 가능 | 설치 패키지 기준 점검 |
| 루팅/디버깅/개발자 옵션 탐지 일부 | 가능 | 앱 내부 보안 체크 로직으로 구현 |
| 오프라인 상태에서 이벤트 버퍼링 후 업로드 | 가능 | `Room + WorkManager` 구조 |
| 연결 메타데이터 일부 수집 | 가능 | `VpnService` 기반, 목적지/포트/프로토콜/바이트 수 등 |

### 불가능한 것

| 항목 | 가능 여부 | 설명 |
|---|---|---|
| 모든 앱의 HTTPS 평문 내용 확인 | 불가 | 일반 앱 권한과 이 구조만으로는 불가 |
| SNS 메시지 본문 실시간 확인 | 불가 | 범위 밖 |
| 브라우저에서 본 웹페이지 평문 내용 확인 | 불가 | 전체 콘텐츠 감청 구조가 아님 |
| 전화 통화 내용 확인 | 불가 | 이 아키텍처 범위 밖 |
| SMS/RCS 메시지 내용 전체 수집 | 불가 | 일반 관제 구조로는 다루지 않음 |
| 다른 앱 내부 DB/파일 직접 열람 | 불가 | 일반 권한으로 접근 불가 |
| 안드로이드 단말 전체를 서버처럼 완전 가시화 | 불가 | 모바일 OS 권한 모델상 한계 |

### 전제조건 또는 권한이 필요한 것

| 항목 | 조건 | 설명 |
|---|---|---|
| 앱 사용 이력 수집 | 사용자 권한 허용 | `UsageStatsManager`는 사용자가 접근 허용 필요 |
| 연결 메타데이터 수집 | `VpnService` 활성화 | 사용자가 VPN 연결을 허용해야 함 |
| 백그라운드 안정 수집 | 배터리 최적화 예외 고려 | 제조사 정책에 따라 제한될 수 있음 |
| 셀룰러 환경 테스트 | `USIM` 또는 셀룰러 가능 단말 | 공기계는 보통 Wi-Fi 위주 |
| 장기 안정 수집 | 앱 항상 실행 또는 worker 정책 설계 | 백그라운드 제한 대응 필요 |
| 보안 설정 상태의 깊은 수집 | 관리형 단말 정책 필요 가능 | `DevicePolicyManager`는 일반 앱 한계 존재 |
| 시스템 깊은 영역 조사 | `root` 또는 특수 포렌식 절차 필요 | 일반 관제와는 다른 영역 |

---

## 16. 이 구조로 현실적으로 보게 되는 것

Grafana에서 현실적으로 볼 수 있는 대표 항목:

- 앱별 API 실패율
- 앱 버전별 TLS 오류 추이
- Wi-Fi / 셀룰러 전환 이력
- 오프라인 상태 누적 시간
- 루팅 탐지 이벤트 수
- 디버깅/개발자 옵션 활성 탐지 수
- 설치 앱 변경 이력
- 목적지 도메인/IP 메타데이터 일부
- 앱 포그라운드 사용 패턴

즉, 이 구조는 `휴대폰 전체 내용을 읽는 구조`가 아니라
`단말 보안 상태 + 앱 네트워크 메타데이터 + 사용 행태 일부`를 중앙 관제하는 구조다.

---

## 17. 사용자 관점 유즈 케이스

아래 예시는 `안드로이드 단말 + 앱 로그 + VpnService 메타데이터 + UsageStatsManager + ConnectivityManager` 구조를 기준으로 한다.

### 유즈 케이스 1. 사용자가 우리 앱으로 로그인한다

행동:

- 사용자가 앱을 실행한다.
- 로그인 화면에서 ID/PW를 입력한다.
- 앱이 `/login` API를 호출한다.

관측 가능한 것:

- 앱 실행 시각
- 앱이 포그라운드로 올라온 시점
- `/login` 호출 여부
- 성공/실패 여부
- HTTP 상태코드
- 지연시간
- Wi-Fi/셀룰러 여부
- 토큰 발급 실패 이벤트

관측 불가능한 것:

- 사용자가 입력한 실제 ID/PW 값
- 로그인 화면에 입력한 평문 내용

### 유즈 케이스 2. 사용자가 우리 앱에서 게시글을 조회한다

행동:

- 사용자가 피드/게시판 화면을 연다.
- 앱이 게시글 목록 API를 호출한다.

관측 가능한 것:

- 게시글 조회 API 호출 횟수
- 응답 시간
- 실패율
- 특정 앱 버전에서만 에러가 많은지 여부
- 네트워크 타입별 오류율

관측 불가능한 것:

- 게시글 본문 전체
- 사용자가 실제로 어떤 글 내용을 읽었는지의 세부 콘텐츠

### 유즈 케이스 3. 사용자가 우리 앱을 오프라인 상태에서 연다

행동:

- 휴대폰이 Wi-Fi/셀룰러 모두 끊긴 상태다.
- 사용자가 앱을 열고 기능을 시도한다.

관측 가능한 것:

- `OFFLINE` 상태 진입
- 네트워크 미연결 이벤트
- 요청 실패 이벤트
- 이벤트가 로컬 `Room` 큐에 쌓였다는 사실
- 나중에 온라인 복구 후 재전송 여부

관측 불가능한 것:

- 오프라인 상태에서 사용자가 화면에서 본 모든 로컬 데이터 상세 내용

### 유즈 케이스 4. 사용자가 Wi-Fi에서 셀룰러로 전환한다

행동:

- 사용자가 이동 중이거나 Wi-Fi가 끊긴다.
- 단말이 셀룰러 데이터로 전환된다.

관측 가능한 것:

- Wi-Fi disconnect 시각
- 셀룰러 전환 시각
- 전환 직후 API 실패/재시도
- 네트워크 타입별 지연시간 차이

관측 불가능한 것:

- 사용자의 실제 위치 정확한 좌표
- 이동 경로 상세

### 유즈 케이스 5. 사용자가 앱을 장시간 포그라운드에서 사용한다

행동:

- 사용자가 우리 앱을 여러 분 동안 열어 둔다.

관측 가능한 것:

- 앱 포그라운드 체류 시간 일부
- 백그라운드 전환 시점
- 사용량 패턴

관측 불가능한 것:

- 사용자가 화면에서 어떤 텍스트를 읽었는지
- 어떤 버튼을 몇 번 눌렀는지의 상세 UI 행위

### 유즈 케이스 6. 사용자가 카카오톡이나 인스타그램을 사용한다

행동:

- 사용자가 제3자 앱을 실행한다.

관측 가능한 것:

- 해당 앱이 포그라운드였다는 사실 일부
- 네트워크 상태 변화와 시점 일부
- `VpnService` 기반 목적지 메타데이터 일부

관측 불가능한 것:

- 카카오톡 메시지 본문
- 인스타그램 DM 내용
- 앱 내부 세션 정보
- 앱 내부 데이터베이스 내용

즉, 제3자 앱은 `일부 메타데이터` 수준만 보이고 `내용`은 보이지 않는다.

### 유즈 케이스 7. 사용자가 크롬 브라우저로 웹사이트를 방문한다

행동:

- 사용자가 브라우저를 열고 사이트를 방문한다.

관측 가능한 것:

- 브라우저 앱이 활성화된 시점 일부
- 네트워크 연결 메타데이터 일부
- 목적지 도메인/IP 일부
- 연결 성공/실패 시각

관측 불가능한 것:

- 사용자가 본 웹페이지의 전체 HTML 내용
- 입력한 검색어
- 로그인한 계정 정보
- 폼 입력값

### 유즈 케이스 8. 사용자가 전화 통화를 한다

행동:

- 사용자가 음성 통화를 시도하거나 수신한다.

관측 가능한 것:

- 일반 앱 수준에서는 매우 제한적이다.
- 일부 상태 변화나 시스템 이벤트가 간접적으로 보일 수는 있어도 신뢰성은 낮다.

관측 불가능한 것:

- 통화 내용
- 통화 음성
- 통화 상대방 내용 전체

즉, 이 아키텍처는 전화 통화 관제 구조가 아니다.

### 유즈 케이스 9. 사용자가 SMS/메시지를 보낸다

행동:

- 사용자가 문자 또는 메시지 앱을 사용한다.

관측 가능한 것:

- 일부 앱 사용 메타데이터
- 네트워크 상태 일부

관측 불가능한 것:

- 메시지 본문
- 첨부파일 내용
- 상대방과의 대화 상세

### 유즈 케이스 10. 사용자가 개발자 옵션을 켜거나 ADB를 활성화한다

행동:

- 사용자가 개발자 옵션 또는 디버깅 환경을 건드린다.

관측 가능한 것:

- 개발자 옵션 활성 상태 일부
- 디버깅 탐지 이벤트
- 보안 정책 위반 이벤트

관측 불가능한 것:

- 사용자가 설정 앱에서 실제로 어떤 화면을 몇 단계 거쳐 바꿨는지의 상세 화면 기록

### 유즈 케이스 11. 단말이 루팅되었거나 무결성이 손상되었다

행동:

- 루팅되었거나 루팅 흔적이 존재한다.
- 앱 위변조 또는 서명 이상이 있다.

관측 가능한 것:

- 루팅 탐지 이벤트
- su binary 흔적
- test-keys 흔적
- 앱 서명 무결성 실패
- 디버거/후킹 의심 이벤트 일부

관측 불가능한 것:

- 루팅 이후 단말 전체 내부 상태를 완전하게 재구성하는 것
- 다른 앱의 모든 내부 데이터 직접 열람

### 유즈 케이스 12. 사용자가 완전 오프라인 공기계를 사용한다

행동:

- USIM 없음
- Wi-Fi 없음
- 앱만 실행

관측 가능한 것:

- 앱 내부 보안 이벤트
- 오프라인 상태 이벤트
- 로컬 큐 적재

관측 불가능한 것:

- 실시간 서버 대시보드 반영
- 외부 네트워크 메타데이터

즉, 완전 오프라인 상태에서는 `실시간 관제`가 아니라 `사후 업로드형 기록`에 가깝다.

---

## 18. 유즈 케이스 요약

한 줄로 정리하면:

- `우리 앱`은 비교적 잘 보인다.
- `단말 상태`는 일부 보인다.
- `제3자 앱`은 메타데이터 일부만 보인다.
- `통신 내용`, `메시지 본문`, `전화 내용`, `브라우저 본문`은 이 구조로 보이지 않는다.
