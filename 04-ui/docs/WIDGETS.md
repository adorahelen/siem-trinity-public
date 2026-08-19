# TrinitySOC 위젯 카탈로그

14종 위젯. 모두 React + ECharts + TanStack Query 로 구현. 사용자가 추가·편집·삭제 가능.

## 카테고리별 요약

| # | type | 이름 | 용도 |
|---|---|---|---|
| 1 | `metric` | 메트릭 카드 | 단일 값 + threshold tone |
| 2 | `gauge` | 게이지 | 0–100% 원형 |
| 3 | `resource` | 시스템 리소스 | CPU/메모리/디스크 + 모델명·용량 |
| 4 | `thehive_kpi` | TheHive 케이스 | Open + InProgress 카운트 |
| 5 | `uptime` | 가동 시간 | 부팅 후 N days |
| 6 | `xdr_toggles` | XDR 토글 배지 | Auto-Ban/MISP/Shuffle/TheHive ON/OFF |
| 7 | `timeseries` | 시계열 | 멀티 series Loki/Prom range |
| 8 | `topk` | Top-K | Loki topk → 정렬 표 |
| 9 | `log` | 로그 스트림 | LogQL 실시간 표시 |
| 10 | `network` | 네트워크 | 공인 IP + 인터페이스 |
| 11 | `storage` | 스토리지 | 파일시스템 + 사용량 + inode |
| 12 | `ports` | Listen 포트 | TCP/UDP 외부 vs 로컬 |
| 13 | `sensors` | 센서 | 온도·팬·전력 (VM 시 안내) |
| 14 | (없음) | — | (gauge 와 동일) |

## 1. `metric` — 메트릭 카드

단일 수치 + 임계값 색상.

### Config
```ts
{
  label: string;       // "CPU 사용률"
  source: "prom" | "loki";
  expr: string;        // PromQL or LogQL
  unit?: string;       // "%" 또는 "건"
  fixed?: number;      // 소수점 자리
  thresholds?: { value: number; tone: "ok" | "warn" | "crit" }[];
  hint?: string;       // 부가 텍스트 (선택)
}
```

### 예시
```json
{
  "type": "metric",
  "data": {
    "label": "fail2ban 24h",
    "source": "loki",
    "expr": "sum(count_over_time({job=\"fail2ban\", f2b_action=\"Ban\"} [24h]))",
    "thresholds": [
      { "value": 1, "tone": "warn" },
      { "value": 10, "tone": "crit" }
    ]
  }
}
```

## 2. `gauge` — 게이지

0–100% 원형. 디스크·메모리 사용률에 적합.

### Config
```ts
{ label: string; expr: string; unit?: string }
```

## 3. `resource` — 시스템 리소스

CPU/메모리/디스크 카드. 큰 % + 모델명 + 사용/총량 + 디바이스 정보.

### Config
```ts
{ kind: "cpu" | "memory" | "disk" }
```

데이터 출처: `GET /api/system/host` (1회 호출로 3개 카드 데이터 전부 제공).

## 4. `thehive_kpi` — TheHive 케이스 KPI

미해결 (Open + InProgress) 케이스 카운트.

### Config
```ts
{} // 빈 객체
```

데이터 출처: `GET /api/cases`

## 5. `uptime` — 가동 시간

부팅 후 경과. 30일 이상 시 "패치 권장" 표시.

### Config
```ts
{} // 빈 객체
```

데이터 출처: `time() - node_boot_time_seconds`

## 6. `xdr_toggles` — XDR 토글 배지

Auto-Ban / MISP / Shuffle / TheHive 4종 ON/OFF + ON 카운트.

### Config
```ts
{} // 빈 객체
```

데이터 출처: `GET /api/status` 의 `xdr` 객체

## 7. `timeseries` — 시계열 차트

멀티 series 라인 차트. ECharts.

### Config
```ts
{
  title: string;
  subtitle?: string;
  minutes: number;     // 시간 범위
  step: number;        // bucket 초
  series: {
    name: string;
    source: "loki" | "prom";
    expr: string;
    color?: string;
  }[];
}
```

### 예시
```json
{
  "type": "timeseries",
  "data": {
    "title": "SSH + fail2ban + 커널 추이",
    "minutes": 60,
    "step": 300,
    "series": [
      {
        "name": "SSH Invalid",
        "source": "loki",
        "expr": "sum(count_over_time({job=\"auth\"} |= \"Invalid user\" [5m]))",
        "color": "#f87171"
      }
    ]
  }
}
```

## 8. `topk` — Top-K 표

상위 N개 정렬 표. Loki `topk()` 함수 사용.

### Config
```ts
{
  title: string;
  subtitle?: string;
  expr: string;           // topk(...) LogQL
  labelKey: string;       // 그룹 라벨 키 (예: "src_ip")
  labelHeader: string;    // 컬럼 헤더 텍스트
  valueHeader?: string;   // 값 컬럼 헤더 (기본 "건수")
}
```

### 예시
```json
{
  "type": "topk",
  "data": {
    "title": "Top 공격 IP — SSH 24h",
    "expr": "topk(20, sum by (src_ip) (count_over_time({job=\"auth\"} |= \"Invalid user\" [24h])))",
    "labelKey": "src_ip",
    "labelHeader": "공격자 IP"
  }
}
```

## 9. `log` — 로그 스트림

LogQL 결과를 모노스페이스로 실시간 표시.

### Config
```ts
{
  title: string;
  subtitle?: string;
  query: string;       // LogQL 표현식
  minutes: number;     // 시간 범위
  limit: number;       // 최대 행 수
}
```

## 10. `network` — 네트워크 정보

공인 IP + UP 상태 인터페이스 목록.

### Config
```ts
{} // 빈 객체
```

데이터: `GET /api/system/network` (`api.ipify.org` + Prometheus `node_network_info`)

## 11. `storage` — 스토리지 정보

파일시스템별 사용량 + 진행바 + inode%.

### Config
```ts
{} // 빈 객체
```

데이터: `GET /api/system/storage` (`node_filesystem_*`)

## 12. `ports` — Listen 포트

외부 노출 (`0.0.0.0`) vs 로컬 (`127.x`) 분리 표시.

### Config
```ts
{} // 빈 객체
```

데이터: `GET /api/system/ports` (호스트 `/proc/1/net/{tcp,udp}` 직접 파싱)

## 13. `sensors` — 센서

물리 호스트의 온도·팬·RAPL 전력. VM 환경에선 "측정 불가" 안내.

### Config
```ts
{} // 빈 객체
```

데이터: `GET /api/system/sensors` (`/sys/class/hwmon/*`, `/sys/class/powercap/intel-rapl:*`)

## 위젯 추가하기 (개발자용)

### 1. 카탈로그에 타입 등록 ([src/lib/widgets.ts](../src/lib/widgets.ts))
```ts
export type WidgetType = ... | "my_new_widget";

export type MyConfig = { ... };

export type WidgetConfig =
  | ...
  | { type: "my_new_widget"; data: MyConfig };
```

### 2. 컴포넌트 작성 ([src/components/MyWidget.tsx](../src/components/MyWidget.tsx))
```tsx
export default function MyWidget(props: MyConfig) {
  return (
    <div className="flex h-full w-full flex-col rounded-card border border-subtle bg-surface p-4">
      ...
    </div>
  );
}
```

### 3. 렌더러에 분기 추가 ([src/components/WidgetRenderer.tsx](../src/components/WidgetRenderer.tsx))
```tsx
case "my_new_widget":
  return <MyWidget {...config.data} />;
```

### 4. 에디터 카탈로그에 등록 ([src/components/WidgetEditor.tsx](../src/components/WidgetEditor.tsx))
```ts
const TYPE_LABEL: Record<WidgetType, string> = {
  ...
  my_new_widget: "내 새 위젯",
};

const TEMPLATES: Record<WidgetType, WidgetConfig> = {
  ...
  my_new_widget: { type: "my_new_widget", data: { /* 기본값 */ } },
};
```

폼이 필요하면 `WidgetEditor` 의 `{config.type === "my_new_widget" && ...}` 분기에 입력 필드 추가.

### 5. (선택) 기본 레이아웃에 추가
[src/lib/widgets.ts](../src/lib/widgets.ts) 의 `DEFAULT_SECURITY_WIDGETS` 또는 `DEFAULT_INFRA_WIDGETS` 에 항목 추가하고 `KEY_PREFIX` 의 버전을 올려 기존 localStorage 무효화.

## 공통 동작

| 속성 | 동작 |
|---|---|
| **드래그** | 편집 모드에서 위젯 상단 호버 시 드래그 핸들 표시 |
| **리사이즈** | 편집 모드에서 모서리 잡고 늘림 |
| **편집** | 호버 시 우상단 ✏ 클릭 → 동일 모달 |
| **삭제** | 호버 시 우상단 🗑 클릭 → confirm |
| **자동 저장** | 모든 변경 즉시 localStorage |
| **리프레시** | 위젯마다 30~60초 폴링 (개별 설정) |
| **에러** | crit 색 텍스트로 표시, 빈 상태도 명시적으로 |

## localStorage 키

| 키 | 내용 |
|---|---|
| `trinitysoc:overview:layout:v8:security` | 보안 탭 위젯 배열 |
| `trinitysoc:overview:layout:v8:infrastructure` | 인프라 탭 위젯 배열 |

키 prefix 의 버전을 올리면 사용자의 캐시 자동 무효화 → 새 기본값 적용.
