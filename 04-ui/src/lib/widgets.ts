import { nanoid } from "./uid";

export type WidgetType =
  | "metric"
  | "gauge"
  | "timeseries"
  | "topk"
  | "log"
  | "resource"
  | "network"
  | "storage"
  | "ports"
  | "sensors"
  | "xdr_toggles"
  | "thehive_kpi"
  | "uptime";

export type ResourceConfig = {
  kind: "cpu" | "memory" | "disk";
};
export type SystemInfoConfig = Record<string, never>;

export type MetricConfig = {
  label: string;
  source: "prom" | "loki";
  expr: string;
  unit?: string;
  fixed?: number;
  thresholds?: { value: number; tone: "ok" | "warn" | "crit" }[];
};

export type GaugeConfig = {
  label: string;
  expr: string;
  unit?: string;
};

export type TimeSeriesSeries = {
  name: string;
  expr: string;
  source: "loki" | "prom";
  color?: string;
};
export type TimeSeriesConfig = {
  title: string;
  subtitle?: string;
  minutes: number;
  step: number;
  series: TimeSeriesSeries[];
};

export type TopkConfig = {
  title: string;
  subtitle?: string;
  expr: string;
  labelKey: string;
  labelHeader: string;
  valueHeader?: string;
};

export type LogConfig = {
  title: string;
  subtitle?: string;
  query: string;
  minutes: number;
  limit: number;
};

export type WidgetConfig =
  | { type: "metric"; data: MetricConfig }
  | { type: "gauge"; data: GaugeConfig }
  | { type: "timeseries"; data: TimeSeriesConfig }
  | { type: "topk"; data: TopkConfig }
  | { type: "log"; data: LogConfig }
  | { type: "resource"; data: ResourceConfig }
  | { type: "network"; data: SystemInfoConfig }
  | { type: "storage"; data: SystemInfoConfig }
  | { type: "ports"; data: SystemInfoConfig }
  | { type: "sensors"; data: SystemInfoConfig }
  | { type: "xdr_toggles"; data: SystemInfoConfig }
  | { type: "thehive_kpi"; data: SystemInfoConfig }
  | { type: "uptime"; data: SystemInfoConfig };

export type WidgetInstance = {
  id: string;
  config: WidgetConfig;
  layout: { x: number; y: number; w: number; h: number };
};

export const newWidgetId = () => nanoid();

// ── 기본 레이아웃 (kangminlog MASTER 16 패널) ────────────
const m = (label: string, source: "prom" | "loki", expr: string, opts: Partial<MetricConfig> = {}): WidgetConfig => ({
  type: "metric",
  data: { label, source, expr, ...opts },
});

const ts = (title: string, minutes: number, step: number, series: TimeSeriesSeries[]): WidgetConfig => ({
  type: "timeseries",
  data: { title, minutes, step, series },
});

const log = (title: string, query: string, minutes: number, limit: number): WidgetConfig => ({
  type: "log",
  data: { title, query, minutes, limit },
});

// ═══ 🛡️ 보안 탭 기본 위젯 ═══════════════════════════════
export const DEFAULT_SECURITY_WIDGETS: WidgetInstance[] = [
  // ─── 보안 KPI (y=0) — 6개 ───
  {
    id: "s-ban",
    config: m("fail2ban 24h", "loki", `sum(count_over_time({job="fail2ban", f2b_action="Ban"} [24h])) - sum(count_over_time({job="fail2ban", f2b_action="Unban"} [24h]))`, {
      thresholds: [{ value: 1, tone: "warn" }, { value: 10, tone: "crit" }],
    }),
    layout: { x: 0, y: 0, w: 2, h: 2 },
  },
  {
    id: "s-wazuh",
    config: m("Wazuh High+ 24h", "loki", `sum(count_over_time({job="wazuh", level=~"([7-9]|1[0-5])"}[24h]))`, {
      thresholds: [{ value: 1, tone: "warn" }, { value: 50, tone: "crit" }],
    }),
    layout: { x: 2, y: 0, w: 2, h: 2 },
  },
  {
    id: "s-suricata",
    config: m("Suricata 24h", "loki", `sum(count_over_time({job="suricata"} | json | event_type="alert" [24h]))`, {
      thresholds: [{ value: 1, tone: "warn" }, { value: 100, tone: "crit" }],
    }),
    layout: { x: 4, y: 0, w: 2, h: 2 },
  },
  {
    id: "s-thehive",
    config: { type: "thehive_kpi", data: {} },
    layout: { x: 6, y: 0, w: 2, h: 2 },
  },
  {
    id: "s-ssh-fail",
    config: m("SSH 실패 24h", "loki", `sum(count_over_time({job="auth"} |= "Invalid user" [24h]))`, {
      thresholds: [{ value: 100, tone: "warn" }, { value: 1000, tone: "crit" }],
    }),
    layout: { x: 8, y: 0, w: 2, h: 2 },
  },
  {
    id: "s-xdr-toggles",
    config: { type: "xdr_toggles", data: {} },
    layout: { x: 10, y: 0, w: 2, h: 2 },
  },

  // ─── 공격 탐지 시계열 (y=2) ───
  {
    id: "s-ssh-ts",
    config: ts("SSH + fail2ban + 커널 추이", 60, 300, [
      { name: "SSH Invalid", source: "loki", expr: `sum(count_over_time({job="auth"} |= "Invalid user" [5m]))`, color: "#f87171" },
      { name: "fail2ban Ban", source: "loki", expr: `sum(count_over_time({job="fail2ban", f2b_action="Ban"} [5m]))`, color: "#fbbf24" },
      { name: "kern KR-BLOCK", source: "loki", expr: `sum(count_over_time({job="kern", kern_event="[KR-BLOCK]"} [5m]))`, color: "#a78bfa" },
    ]),
    layout: { x: 0, y: 2, w: 6, h: 5 },
  },
  {
    id: "s-ids-ts",
    config: ts("Wazuh + Suricata 추이", 60, 300, [
      { name: "Wazuh High+", source: "loki", expr: `sum(count_over_time({job="wazuh", level=~"([7-9]|1[0-5])"}[5m]))`, color: "#fb923c" },
      { name: "Suricata sev=1", source: "loki", expr: `sum(count_over_time({job="suricata"} | json | event_type="alert" | alert_severity="1" [5m]))`, color: "#f87171" },
      { name: "Suricata sev=2", source: "loki", expr: `sum(count_over_time({job="suricata"} | json | event_type="alert" | alert_severity="2" [5m]))`, color: "#fbbf24" },
    ]),
    layout: { x: 6, y: 2, w: 6, h: 5 },
  },

  // ─── Top-K (y=7) ───
  {
    id: "s-topip",
    config: {
      type: "topk",
      data: {
        title: "Top 공격 IP — SSH 24h",
        expr: `topk(20, sum by (src_ip) (count_over_time({job="auth"} |= "Invalid user" [24h])))`,
        labelKey: "src_ip",
        labelHeader: "공격자 IP",
      },
    },
    layout: { x: 0, y: 7, w: 4, h: 6 },
  },
  {
    id: "s-banned-ip",
    config: {
      type: "topk",
      data: {
        title: "활성 차단 IP Top 15",
        expr: `topk(15, sum by (ip) (count_over_time({job="fail2ban", f2b_action="Ban"} [24h])))`,
        labelKey: "ip",
        labelHeader: "차단된 IP",
      },
    },
    layout: { x: 4, y: 7, w: 4, h: 6 },
  },
  {
    id: "s-topdns",
    config: {
      type: "topk",
      data: {
        title: "Top 15 DNS 도메인 24h",
        expr: `topk(15, sum by (query) (count_over_time({job="zeek_dns"} | json | __error__="" [24h])))`,
        labelKey: "query",
        labelHeader: "도메인",
      },
    },
    layout: { x: 8, y: 7, w: 4, h: 6 },
  },

  // ─── 로그 스트림 (y=13) ───
  {
    id: "s-wazuh-log",
    config: log("Wazuh High+ 알림", `{job="wazuh"} |~ "level\\":(1[0-5]|[7-9])"`, 60, 20),
    layout: { x: 0, y: 13, w: 6, h: 5 },
  },
  {
    id: "s-kern-log",
    config: log("커널 치명 이벤트", `{job="kern"} |~ "OOM|segfault|Call Trace|BUG:|panic|Out of memory"`, 1440, 20),
    layout: { x: 6, y: 13, w: 6, h: 5 },
  },
];

// ═══ 🖥️ 인프라 탭 기본 위젯 ═════════════════════════════
export const DEFAULT_INFRA_WIDGETS: WidgetInstance[] = [
  // ─── 인프라 KPI (y=0) — 4개 ───
  {
    id: "i-cpu",
    config: { type: "resource", data: { kind: "cpu" } },
    layout: { x: 0, y: 0, w: 3, h: 2 },
  },
  {
    id: "i-mem",
    config: { type: "resource", data: { kind: "memory" } },
    layout: { x: 3, y: 0, w: 3, h: 2 },
  },
  {
    id: "i-disk",
    config: { type: "resource", data: { kind: "disk" } },
    layout: { x: 6, y: 0, w: 3, h: 2 },
  },
  {
    id: "i-uptime",
    config: { type: "uptime", data: {} },
    layout: { x: 9, y: 0, w: 3, h: 2 },
  },

  // ─── 디스크 I/O + 네트워크 트래픽 (y=2) ───
  {
    id: "i-io-ts",
    config: ts("디스크 I/O · CPU 부하 추이", 60, 60, [
      { name: "I/O time", source: "prom", expr: `sum(rate(node_disk_io_time_seconds_total[5m]))`, color: "#a78bfa" },
      { name: "CPU iowait", source: "prom", expr: `avg(rate(node_cpu_seconds_total{mode="iowait"}[5m])) * 100`, color: "#fbbf24" },
      { name: "CPU usage", source: "prom", expr: `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`, color: "#38bdf8" },
    ]),
    layout: { x: 0, y: 2, w: 6, h: 5 },
  },
  {
    id: "i-net-ts",
    config: ts("네트워크 트래픽 (Mbps)", 60, 60, [
      { name: "RX (수신)", source: "prom", expr: `sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|br-.*|veth.*"}[5m])) * 8 / 1000000`, color: "#34d399" },
      { name: "TX (송신)", source: "prom", expr: `sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|br-.*|veth.*"}[5m])) * 8 / 1000000`, color: "#f87171" },
    ]),
    layout: { x: 6, y: 2, w: 6, h: 5 },
  },

  // ─── 시스템 정보 (y=7) ───
  {
    id: "i-network",
    config: { type: "network", data: {} },
    layout: { x: 0, y: 7, w: 3, h: 4 },
  },
  {
    id: "i-storage",
    config: { type: "storage", data: {} },
    layout: { x: 3, y: 7, w: 3, h: 4 },
  },
  {
    id: "i-ports",
    config: { type: "ports", data: {} },
    layout: { x: 6, y: 7, w: 3, h: 4 },
  },
  {
    id: "i-sensors",
    config: { type: "sensors", data: {} },
    layout: { x: 9, y: 7, w: 3, h: 4 },
  },
];

// 단일 dashboard 시절 alias (기존 코드 호환용 — 사용 안 함)
export const DEFAULT_WIDGETS = DEFAULT_SECURITY_WIDGETS;

// ── localStorage 영속화 (탭 별로 분리) ──────────────────
export type DashboardTab = "security" | "infrastructure";

const KEY_PREFIX = "trinitysoc:overview:layout:v8";

const DEFAULTS: Record<DashboardTab, WidgetInstance[]> = {
  security: DEFAULT_SECURITY_WIDGETS,
  infrastructure: DEFAULT_INFRA_WIDGETS,
};

const KNOWN_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  "metric", "gauge", "timeseries", "topk", "log",
  "resource", "network", "storage", "ports", "sensors",
  "xdr_toggles", "thehive_kpi", "uptime",
]);

function isValidWidget(x: unknown): x is WidgetInstance {
  if (!x || typeof x !== "object") return false;
  const w = x as Record<string, unknown>;
  if (typeof w.id !== "string" || !w.id) return false;
  const cfg = w.config as Record<string, unknown> | undefined;
  if (!cfg || typeof cfg !== "object") return false;
  if (typeof cfg.type !== "string") return false;
  if (!KNOWN_WIDGET_TYPES.has(cfg.type as WidgetType)) return false;
  const layout = w.layout as Record<string, unknown> | undefined;
  if (!layout || typeof layout !== "object") return false;
  return ["x", "y", "w", "h"].every((k) => typeof layout[k] === "number");
}

export function loadLayout(tab: DashboardTab = "security"): WidgetInstance[] {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}:${tab}`);
    if (!raw) return DEFAULTS[tab];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULTS[tab];
    if (!parsed.every(isValidWidget)) {
      // Stale schema 감지 — 기본 레이아웃으로 폴백, 캐시는 다음 saveLayout 에서 갱신됨
      console.warn(`[widgets] stale layout detected for tab=${tab}, falling back to defaults`);
      return DEFAULTS[tab];
    }
    return parsed;
  } catch {
    return DEFAULTS[tab];
  }
}

export function saveLayout(tab: DashboardTab, widgets: WidgetInstance[]) {
  try {
    localStorage.setItem(`${KEY_PREFIX}:${tab}`, JSON.stringify(widgets));
  } catch {
    /* ignore quota */
  }
}

export function resetLayout(tab: DashboardTab) {
  localStorage.removeItem(`${KEY_PREFIX}:${tab}`);
}
