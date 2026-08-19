# Android 보안 모니터링 앱 설계

> 작성일: 2026-03-13
> 목적: 본인 소유 Galaxy/Android 단말의 네트워크 행위 및 보안 상태를 수집해 기존 security-log-monitor(Loki/Grafana)에 통합

---

## 전체 아키텍처

```
[Android 단말]
  ├── VpnService (로컬 VPN 터널)
  │     └── DNS 쿼리, 연결 메타데이터 캡처
  ├── UsageStatsManager
  │     └── 앱별 사용 시간, 포그라운드/백그라운드 기록
  ├── ConnectivityManager
  │     └── Wi-Fi/셀룰러 전환, 네트워크 상태
  ├── PackageManager
  │     └── 설치 앱 목록, 서명 무결성
  ├── BatteryManager + DevicePolicyManager
  │     └── 보안 설정 상태 (루팅, 개발자 옵션, ADB)
  └── WorkManager (백그라운드 주기 수집)
          ↓
  [로컬 Room DB (오프라인 버퍼)]
          ↓
  [Loki Push API] → 기존 security-log-monitor 서버
          ↓
  [Grafana 대시보드]
```

---

## 수집 가능한 데이터 (루팅 불필요)

| 데이터 | Android API | 권한 |
|---|---|---|
| DNS 쿼리 / 연결 도메인 | `VpnService` | `BIND_VPN_SERVICE` |
| 연결 목적지 IP:Port | `VpnService` | 동일 |
| 앱별 사용 시간/이벤트 | `UsageStatsManager` | `PACKAGE_USAGE_STATS` (수동 허용) |
| 네트워크 전환 이벤트 | `ConnectivityManager` | `ACCESS_NETWORK_STATE` |
| Wi-Fi SSID/BSSID | `WifiManager` | `ACCESS_FINE_LOCATION` |
| 설치된 앱 목록 | `PackageManager` | `QUERY_ALL_PACKAGES` |
| 배터리/충전 상태 | `BatteryManager` | 없음 |
| 개발자 옵션 활성화 여부 | `Settings.Global` | 없음 |
| ADB 디버깅 활성화 | `Settings.Global` | 없음 |
| 보안 패치 레벨 | `Build.VERSION` | 없음 |
| 화면 켜짐/꺼짐 이벤트 | `BroadcastReceiver` | 없음 |

---

## 핵심 기술: VpnService 로컬 터널

외부 VPN 서버 없이 단말 내부에서만 동작하는 로컬 루프백 VPN. 모든 트래픽이 앱을 통과하므로 DNS/IP 메타데이터를 캡처할 수 있다. NetGuard, Blokada가 동일 방식.

```
앱 트래픽 → [VpnService 터널 (tun0)] → 앱 내부 파싱
                                              ↓
                                    DNS 쿼리: query, type, response IP
                                    TCP/UDP: src_port, dst_ip, dst_port, proto
                                    TLS SNI: 서버 이름 (평문 필드)
                                              ↓
                                        실제 인터넷으로 포워딩
```

> TLS 페이로드(내용)는 볼 수 없지만 SNI는 평문이므로 어떤 도메인에 연결했는지 확인 가능.

---

## 기술 스택

### 언어/프레임워크

| 항목 | 선택 | 이유 |
|---|---|---|
| 언어 | Kotlin | Android 공식 권장 |
| UI | Jetpack Compose | 선언형 UI, 최신 표준 |
| 아키텍처 | MVVM + Clean Architecture | 관심사 분리 |
| 백그라운드 | WorkManager | 배터리 최적화 준수 |
| 로컬 DB | Room (SQLite) | 오프라인 버퍼, 이력 저장 |
| 네트워크 | OkHttp + Retrofit | Loki API 전송 |
| DI | Hilt | 의존성 주입 |

### 핵심 라이브러리

```kotlin
// build.gradle.kts

// Jetpack Compose
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.material3:material3")
implementation("androidx.lifecycle:lifecycle-viewmodel-compose")

// 백그라운드
implementation("androidx.work:work-runtime-ktx:2.9.0")

// 로컬 DB
implementation("androidx.room:room-runtime:2.6.1")
ksp("androidx.room:room-compiler:2.6.1")

// DI
implementation("com.google.dagger:hilt-android:2.51")
ksp("com.google.dagger:hilt-compiler:2.51")

// 네트워크 (Loki 전송)
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.squareup.retrofit2:retrofit:2.9.0")
implementation("com.squareup.retrofit2:converter-gson:2.9.0")

// 루트 탐지 (자기 단말 보안 상태 체크)
implementation("com.scottyab:rootbeer:0.1.0")

// IP/TCP/UDP/DNS 헤더 파싱 → 직접 구현 or pcap4j (Android 호환 확인 필요)
```

---

## 디렉터리 구조

```
app/src/main/
├── java/com/example/androidmonitor/
│   ├── data/
│   │   ├── local/
│   │   │   ├── db/           # Room DB 엔티티 및 DAO
│   │   │   │   ├── NetworkEventEntity.kt
│   │   │   │   ├── AppUsageEntity.kt
│   │   │   │   └── SecurityStateEntity.kt
│   │   │   └── prefs/        # DataStore (서버 주소, 수집 주기 설정)
│   │   └── remote/
│   │       └── loki/         # Loki Push API client
│   │           ├── LokiApi.kt
│   │           └── LokiPushBody.kt
│   ├── domain/
│   │   ├── model/
│   │   │   ├── NetworkEvent.kt
│   │   │   ├── AppUsageEvent.kt
│   │   │   └── SecurityState.kt
│   │   └── usecase/
│   │       ├── CollectNetworkEventsUseCase.kt
│   │       └── SendLogsToLokiUseCase.kt
│   ├── service/
│   │   ├── MonitorVpnService.kt      # VpnService 구현 (핵심)
│   │   ├── PacketParser.kt           # IP/TCP/UDP/DNS 헤더 파싱
│   │   └── LogCollectorWorker.kt     # WorkManager worker
│   └── ui/
│       ├── dashboard/                # 실시간 이벤트 뷰
│       ├── settings/                 # 서버 주소, 수집 항목 설정
│       └── status/                   # 보안 상태 체크 결과
└── AndroidManifest.xml
```

---

## AndroidManifest.xml 권한

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
    tools:ignore="ProtectedPermissions" />
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES"
    tools:ignore="QueryAllPackagesPermission" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<service
    android:name=".service.MonitorVpnService"
    android:permission="android.permission.BIND_VPN_SERVICE">
    <intent-filter>
        <action android:name="android.net.VpnService" />
    </intent-filter>
</service>
```

---

## Loki 연동 포맷

기존 `security-log-monitor` Loki에 직접 푸시. Grafana에서 `job="android_monitor"` 패널 추가하면 서버 로그와 통합 조회 가능.

```json
{
  "streams": [
    {
      "stream": {
        "job": "android_monitor",
        "device": "galaxy_s24",
        "event_type": "dns_query"
      },
      "values": [
        [
          "1710288000000000000",
          "{\"query\":\"example.com\",\"type\":\"A\",\"response_ip\":\"93.184.216.34\",\"src_app\":\"com.kakao.talk\"}"
        ]
      ]
    }
  ]
}
```

**엔드포인트:** `POST http://<서버IP>:3100/loki/api/v1/push`

---

## 루팅 시 추가 가능한 것

| 기능 | 방법 |
|---|---|
| 전체 패킷 캡처 (PCAP) | `tcpdump` 바이너리 root 실행 후 파일 수집 |
| 다른 앱 프로세스 분석 | `/proc/<pid>/` 직접 읽기 |
| 시스템 앱 포함 전체 트래픽 | `iptables` NFQUEUE 훅 |
| 시스템 파티션 앱 설치 | `/system/app/` 에 설치 (재부팅 후에도 유지) |

---

## 개발 순서 (권장)

```
1단계: VpnService 뼈대 + DNS 쿼리 파싱 + Loki 전송
   → "어떤 도메인에 접속했는지" 바로 Grafana에서 확인

2단계: UsageStatsManager 앱 사용 이벤트 수집
   → "언제 어떤 앱을 썼는지" 타임라인

3단계: 보안 상태 체크 (루팅/개발자옵션/ADB/인증서 목록)
   → 단말 보안 상태 대시보드

4단계: WorkManager로 주기 수집 + Room DB 오프라인 버퍼
   → Wi-Fi 없을 때 로컬 저장 후 연결 시 일괄 전송

5단계: Compose UI + 설정 화면
   → 서버 주소 입력, 수집 항목 토글, 실시간 이벤트 뷰
```

---

## 참고 오픈소스 (구조 참고용)

| 프로젝트 | 참고 포인트 |
|---|---|
| [NetGuard](https://github.com/M66B/NetGuard) | VpnService 기반 DNS/트래픽 차단 구현 |
| [PCAPdroid](https://github.com/emanuele-f/PCAPdroid) | VpnService로 PCAP 생성 |
| [Blokada](https://github.com/blokadaorg/blokada) | DNS 기반 광고 차단, VPN 구조 |
| [RootBeer](https://github.com/scottyab/rootbeer) | 루트 탐지 라이브러리 |
