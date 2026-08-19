# 모바일 감시/모니터링 기술 구조 (방어·수사·공부 목적)

> 작성일: 2026-03-13
> 목적: "어떻게 동작하는지 알아야 막거나 수사할 수 있다" — 기술 메커니즘 중심 정리

---

## 감시 기술의 계층 구조

모바일 감시/모니터링은 어느 계층에서 개입하느냐에 따라 기술과 한계가 완전히 달라진다.

```
┌─────────────────────────────────────────────┐
│  L7: 앱 콘텐츠 계층                          │  ← SNS 내용, 메시지 본문
│  (앱 내부, E2E 암호화가 있으면 여기서 끝)    │
├─────────────────────────────────────────────┤
│  L6: 앱 이벤트/메타데이터 계층              │  ← 앱 사용 시간, 로그인 여부
├─────────────────────────────────────────────┤
│  L5: OS/런타임 계층                          │  ← 접근성 서비스, 시스템 콜
├─────────────────────────────────────────────┤
│  L4: 네트워크 메타데이터 계층               │  ← 접속 IP, 도메인, 시간
├─────────────────────────────────────────────┤
│  L3: 네트워크 페이로드 계층                 │  ← TLS로 암호화되면 불가
├─────────────────────────────────────────────┤
│  L2: 이동통신망 계층 (통신사/기지국)        │  ← IMSI, 위치, 통화 메타데이터
├─────────────────────────────────────────────┤
│  L1: 하드웨어/펌웨어 계층                   │  ← 베이스밴드 취약점, 물리 접근
└─────────────────────────────────────────────┘
```

각 계층마다 접근 가능한 주체, 기술, 법적 요건이 다르다.

---

## 1. OS/런타임 계층 — 단말에서 직접 동작하는 감시

### 1-1. Android 접근성 서비스 (Accessibility Service)

**동작 원리:**
Android의 Accessibility API는 원래 장애인 보조 목적으로 설계됐지만, 사실상 화면에 표시되는 모든 텍스트/이벤트를 읽을 수 있다.

```
앱 A (카카오톡) → 화면에 텍스트 렌더링
         ↓
AccessibilityService (백그라운드 상주)
         ↓
onAccessibilityEvent() 콜백으로 텍스트 수신
         ↓
다른 서버로 전송 or 로컬 저장
```

탐지 방법:
- `설정 → 접근성 → 설치된 앱` 에서 접근성 권한을 가진 앱 목록 확인
- `adb shell settings get secure enabled_accessibility_services`
- 정상 앱이 아닌 것이 접근성 권한을 가지고 있으면 의심

---

### 1-2. 오버레이 공격 (Overlay Attack)

`SYSTEM_ALERT_WINDOW` 권한을 가진 앱이 다른 앱 위에 투명한 레이어를 올려서 입력을 가로채거나 화면을 기록하는 방식.

탐지 방법:
- `설정 → 앱 → 특별한 앱 액세스 → 다른 앱 위에 표시`
- ADB: `adb shell dumpsys window | grep -i overlay`

---

### 1-3. MediaProjection API (화면 녹화)

Android 5.0+부터 공식 API로 화면 전체를 실시간 캡처 가능. 사용자에게 권한 요청 팝업이 반드시 뜨지만, 이미 수락되어 있으면 백그라운드에서 계속 동작.

탐지 방법:
- `adb shell dumpsys media.camera`
- 화면 녹화 중이면 상태바 아이콘 표시 (Android 10+)

---

### 1-4. 키로거 (Keylogger)

Android에서 일반 앱이 글로벌 키 입력을 가로채는 건 샌드박스 때문에 어렵다. 그러나:
- 커스텀 키보드 앱으로 교체된 경우 → 모든 입력 가로채기 가능
- 루팅된 단말에서 커널 레벨 키로거 삽입

탐지 방법:
- `설정 → 언어 및 입력 → 현재 키보드` 확인
- 출처 불명의 키보드 앱 주의

---

### 1-5. 루팅 + Root 레벨 스파이웨어

루팅이 되면 샌드박스 제약이 없어지고, 다음이 가능해진다:
- `/proc/` 파일시스템 직접 읽기 (다른 프로세스 메모리)
- `ptrace()` 시스템 콜로 다른 프로세스 attach
- `iptables`로 모든 트래픽 리다이렉션
- 시스템 파티션(`/system/`) 에 앱 설치 (삭제 불가)

대표 사례: **Pegasus (NSO Group)**
- 제로클릭 익스플로잇으로 루트 권한 획득
- 메모리 상에만 존재 (재부팅 전까지)
- iMessage, WhatsApp 등 암호화 앱 내부 데이터를 메모리에서 직접 읽음
- 단말에서 서버로 암호화 채널로 유출

탐지 도구: [Mobile Verification Toolkit (MVT)](https://github.com/mvt-project/mvt) — Amnesty International 개발, Pegasus 감염 여부 포렌식 분석

---

## 2. 네트워크 계층 — 통신 경로에서의 감시

### 2-1. 이동통신망 계층 (통신사/기지국)

통신사가 볼 수 있는 것:
- 통화 메타데이터: 발신/수신 번호, 시간, 통화 시간
- SMS 내용 (SMS는 암호화가 없음)
- 데이터 접속 IP, 접속 도메인 (SNI 기준)
- 위치 정보: 연결된 기지국 ID → 삼각측량으로 위치 추정

일반인이 볼 수 없음. 수사기관이 법원 영장 기반으로 요청.

---

### 2-2. IMSI Catcher (Stingray)

가짜 기지국 역할을 하는 장비. 주변 단말이 가짜 기지국에 접속하도록 유도.

수집 가능한 것:
- IMSI (단말 고유 식별자)
- IMEI
- 통화 메타데이터
- 구형 프로토콜(2G/3G)에서는 음성 통화 내용까지

방어 방법:
- LTE/5G Only 설정 (2G fallback 차단)
- SRSUE 같은 도구로 주변 기지국 신호 이상 탐지 (고급)

---

### 2-3. SSL/TLS 인터셉션 (중간자 공격)

단말에 공격자의 루트 인증서가 설치되어 있으면 TLS 트래픽을 복호화해서 볼 수 있다.

```
단말 → [가짜 TLS 세션] → 중간자 → [실제 TLS 세션] → 서버
```

MDM이 이 방식으로 기업망 트래픽 검사를 합법적으로 수행.

탐지 방법:
- `설정 → 보안 → 인증서` 에서 신뢰 인증서 목록 확인
- 사용자 설치 CA가 있으면 의심
- Android 7.0+부터 앱이 명시적으로 허용하지 않으면 사용자 CA 무시

---

### 2-4. Wi-Fi 수준 트래픽 감시

동일 AP에 연결되어 있는 경우 (예: 공유기 관리자 입장):
- DNS 쿼리 로그 → 어떤 도메인 접속했는지
- 접속 시간, 트래픽 양
- (TLS면) 페이로드는 불가, SNI는 평문

공유기 레벨에서 볼 수 있는 도구: Pi-hole, ntopng, 공유기 DHCP/접속 로그

---

## 3. 앱 메타데이터 계층 — 서버가 보는 것

서비스 운영자(앱 서버)가 합법적으로 볼 수 있는 것:
- 로그인/로그아웃 시간
- 사용한 기능, 화면 전환
- 에러/크래시 로그
- IP 주소, User-Agent, OS 버전
- 푸시 알림 수신 여부

E2E 암호화 메신저라도 서버는 "누가 언제 메시지를 보냈는지"의 메타데이터는 볼 수 있다 (Signal조차도 최소한 이 정보는 존재).

---

## 4. MDM/UEM 계층 — 기업 관리형 감시

### 동작 원리

```
단말 (Android Enterprise / iOS DEP 등록)
        ↓
MDM 에이전트 (시스템 앱 or 관리 프로파일)
        ↓
MDM 서버 (MobileIron, Jamf, Microsoft Intune 등)
        ↓
관리자 대시보드
```

MDM이 볼 수 있는 것 (API 기준):
- 설치된 앱 목록
- OS 버전, 패치 레벨
- 루팅/탈옥 여부
- 위치 정보 (허용 시)
- 정책 준수 상태 (암호화, 잠금 설정 등)
- 인증서 설치 (TLS 인터셉션 가능)

MDM이 볼 수 없는 것 (정책상):
- E2E 암호화 메시지 내용
- 개인 앱 내용 (BYOD 프로파일 분리 시)
- 마이크/카메라 실시간 피드

---

## 5. 디지털 포렌식 관점

수사기관이 단말을 물리적으로 확보했을 때:

### Android 포렌식 아티팩트 주요 위치

| 항목 | 경로 |
|---|---|
| 통화 기록 | `/data/data/com.android.providers.contacts/databases/contacts2.db` |
| SMS/MMS | `/data/data/com.android.providers.telephony/databases/mmssms.db` |
| 앱 데이터 | `/data/data/<패키지명>/` |
| 사진/영상 | `/sdcard/DCIM/` |
| 다운로드 파일 | `/sdcard/Download/` |
| 카카오톡 | `/sdcard/Android/data/com.kakao.talk/` (미디어), DB는 `/data/data/` |
| Wi-Fi 접속 이력 | `/data/misc/wifi/WifiConfigStore.xml` |
| 위치 이력 | `/data/data/com.google.android.gms/` |

루팅 없이는 `/data/data/` 직접 접근 불가 → 포렌식 도구(Cellebrite UFED, Oxygen Forensics)는 취약점 또는 ADB 백업을 이용해 우회.

### 삭제된 데이터 복원 가능성

- SQLite DB: 삭제된 레코드는 `VACUUM`이 실행되기 전까지 물리적으로 남아있음
- 포렌식 도구가 free page를 파싱해서 복원
- 플래시 메모리 특성상 OS가 즉시 덮어쓰지 않음 (TRIM 타이밍 의존)

---

## 6. 탐지 — "내가 감시당하고 있는지" 확인하는 방법

| 의심 증상 | 확인 방법 |
|---|---|
| 배터리 이상 소모 | 설정 → 배터리 사용량 → 비정상 앱 확인 |
| 데이터 사용량 급증 | 설정 → 데이터 사용량 → 백그라운드 데이터 앱 확인 |
| 비정상 접근성 앱 | `adb shell settings get secure enabled_accessibility_services` |
| 불명 CA 인증서 | 설정 → 보안 → 사용자 인증서 |
| 백그라운드 마이크/카메라 | Android 12+: 상태바 초록 점 표시 / Privacy Dashboard |
| 루팅 탐지 | `adb shell su` 시도, RootBeer 라이브러리 기반 앱 |
| 네트워크 이상 연결 | `adb shell ss -tulpen` or `netstat` |
| 스파이웨어 포렌식 | MVT(Mobile Verification Toolkit)으로 IOC 점검 |

---

## 7. 핵심 정리

| 계층 | 접근 주체 | 기술 | 막는 방법 |
|---|---|---|---|
| 앱 콘텐츠 (E2E 암호화) | 사실상 불가 | — | E2E 암호화 사용 |
| 앱 메타데이터 | 서비스 운영자 | 서버 로그 | 최소 권한 앱 사용 |
| OS 레벨 | 스파이웨어/루팅 | Accessibility, Root API | 루팅 금지, 앱 권한 관리 |
| 네트워크 메타데이터 | 통신사, AP 관리자 | DNS 로그, SNI | DoH, VPN |
| 네트워크 페이로드 | 중간자 (CA 설치 시) | TLS 인터셉션 | 인증서 피닝, CA 관리 |
| 이동통신망 | 통신사/수사기관 | 기지국 로그, IMSI Catcher | 암호화 메신저, 2G 비활성화 |
| 물리 포렌식 | 수사기관/물리 접근자 | Cellebrite 등 | 전체 디스크 암호화, 강한 잠금 |

---

## 참고 도구 및 리소스 (방어/연구 목적)

| 도구 | 용도 |
|---|---|
| [MVT](https://github.com/mvt-project/mvt) | Pegasus 등 스파이웨어 감염 여부 분석 |
| [Wireshark + Android tcpdump](https://developer.android.com/studio/command-line/adb) | 단말 트래픽 캡처 (디버그 목적) |
| [Frida](https://frida.re/) | 앱 런타임 후킹 및 동적 분석 |
| [apktool](https://ibotpeaches.github.io/Apktool/) | APK 역공학 |
| [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF) | 모바일 앱 정적/동적 분석 |
| [JADX](https://github.com/skylot/jadx) | DEX → Java 디컴파일 |
| [ADB](https://developer.android.com/studio/command-line/adb) | 단말 직접 디버깅/분석 |
