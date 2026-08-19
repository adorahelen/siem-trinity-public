import type { Severity } from "./format";

const BASE = ""; // 동일 origin 또는 dev proxy (/api → 192.168.10.232:2027)

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// ── /api/status ─────────────────────────────────────────
export type StatusResponse = {
  is_running: boolean;
  last_run: string | null;
  last_run_result: {
    beacons: number;
    dga_domains: number;
    flow_anomalies: number;
    ip_scores: number;
    elapsed_seconds: number;
    timestamp: string;
  } | null;
  next_run: string | null;
  schedule_interval_minutes: number;
  error: string | null;
  xdr: {
    auto_ban: { enabled: boolean; threshold: number };
    misp: { enabled: boolean; url: string };
    shuffle: { enabled: boolean; webhook_set: boolean };
    thehive: { enabled: boolean; url: string; public_url: string };
  };
};

export const getStatus = () => get<StatusResponse>("/api/status");

export async function runDetectors(hours = 1.0): Promise<{ ok: boolean; status?: number; body?: unknown }> {
  const r = await fetch(`/api/run?hours=${hours}`, { method: "POST" });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

// ── /api/summary ────────────────────────────────────────
export type SummaryResponse = {
  date: string;
  total: number;
  by_detector: Record<string, number>;
  by_verdict: Record<string, number>;
  hourly: Record<string, number>;
  heatmap: Record<string, Record<string, number>>;
  status: StatusResponse;
};

export const getSummary = (date?: string) =>
  get<SummaryResponse>(`/api/summary${date ? `?date=${date}` : ""}`);

// ── /api/alerts ─────────────────────────────────────────
export type RawAlert = {
  timestamp: string;
  detector: string;
  verdict: string;
  attack?: string[];
  ip?: string;
  src_ip?: string;
  dst_ip?: string;
  domain?: string;
  score?: number;
  message?: string;
  reason?: string;
  jail?: string;
  action?: string;
  signals?: Record<string, unknown>;
};

export type AlertsResponse = {
  total: number;
  page: number;
  limit: number;
  alerts: RawAlert[];
};

export const getAlerts = (params: {
  date?: string;
  detector?: string;
  verdict?: string;
  page?: number;
  limit?: number;
}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && q.set(k, String(v)));
  return get<AlertsResponse>(`/api/alerts?${q}`);
};

// ── /api/attack/coverage ────────────────────────────────
export type AttackCoverage = {
  name: string;
  versions: Record<string, string>;
  domain: string;
  description: string;
  techniques: {
    techniqueID: string;
    score: number;
    color: string;
    comment: string;
    enabled: boolean;
  }[];
  _summary: {
    alerts_count: number;
    techniques_count: number;
    days: number;
    top_techniques: {
      id: string;
      count: number;
      max_verdict: string;
      max_score: number;
    }[];
  };
};

export const getAttackCoverage = () =>
  get<AttackCoverage>("/api/attack/coverage");

// ── /api/cases (BFF) ────────────────────────────────────
export type TheHiveCase = {
  id: string;
  number: number | null;
  title: string;
  severity: number | null;
  status: string | null;
  tlp: number | null;
  tags: string[];
  createdAt: number | string | null;
  owner: string | null;
};

export const listCases = (limit = 50) =>
  get<{ total: number; cases: TheHiveCase[] }>(`/api/cases?limit=${limit}`);

// ── /api/intel/lookup/:ip (BFF) ─────────────────────────
export type IntelLookup = {
  ip: string;
  hit: boolean;
  events: number;
  categories: string[];
  tags: string[];
};

export const intelLookup = (ip: string) =>
  get<IntelLookup>(`/api/intel/lookup/${encodeURIComponent(ip)}`);

// ── /api/logs/query (BFF) ───────────────────────────────
export type LogRow = {
  ts: string;
  labels: Record<string, string>;
  line: string;
};

export const logsQuery = (q: string, minutes = 15, limit = 200) => {
  const sp = new URLSearchParams({
    q,
    minutes: String(minutes),
    limit: String(limit),
  });
  return get<{ total: number; rows: LogRow[] }>(`/api/logs/query?${sp}`);
};

// ── /api/health/all (BFF) ───────────────────────────────
export type ServiceHealth = {
  url: string;
  status: "ok" | "warn" | "down" | "unknown";
  code: number | null;
  error?: string;
};

export const healthAll = () =>
  get<{ services: Record<string, ServiceHealth> }>("/api/health/all");

// ── /api/metric/* (Prometheus / Loki) ───────────────────
export const promInstant = (expr: string) =>
  get<{ value: number | null; error?: string }>(
    `/api/metric/prom/instant?expr=${encodeURIComponent(expr)}`,
  );

export type MetricSeries = {
  labels: Record<string, string>;
  points: [number, number][];
};

export const promRange = (expr: string, minutes = 60, step = 60) =>
  get<{ series: MetricSeries[]; error?: string }>(
    `/api/metric/prom/range?expr=${encodeURIComponent(expr)}&minutes=${minutes}&step=${step}`,
  );

export const lokiInstant = (expr: string) =>
  get<{ value: number | null; samples?: number; error?: string }>(
    `/api/metric/loki/instant?expr=${encodeURIComponent(expr)}`,
  );

export const lokiRange = (expr: string, minutes = 60, step = 60) =>
  get<{ series: MetricSeries[]; error?: string }>(
    `/api/metric/loki/range?expr=${encodeURIComponent(expr)}&minutes=${minutes}&step=${step}`,
  );

// ── /api/system/host ────────────────────────────────────
export type HostInfo = {
  cpu: { model: string | null; cores: number; usage_pct: number | null };
  memory: { total_bytes: number | null; used_bytes: number | null };
  disk: {
    total_bytes: number | null;
    used_bytes: number | null;
    device: string | null;
    fstype: string | null;
  };
  host: {
    hostname: string | null;
    kernel: string | null;
    arch: string | null;
  };
};

export const getHostInfo = () => get<HostInfo>("/api/system/host");

export type NetworkInfo = {
  interfaces: { name: string; state: string; addr: string }[];
  public_ip: string | null;
};
export const getNetworkInfo = () => get<NetworkInfo>("/api/system/network");

export type StorageInfo = {
  filesystems: {
    mountpoint: string;
    device: string | null;
    fstype: string | null;
    total_bytes: number;
    used_bytes: number;
    avail_bytes: number;
    use_pct: number;
    inodes_total: number;
    inodes_used: number;
    inodes_use_pct: number;
  }[];
};
export const getStorageInfo = () => get<StorageInfo>("/api/system/storage");

export type PortsInfo = {
  listening: { proto: string; state: string; addr: string; port: string }[];
  error?: string;
};
export const getPortsInfo = () => get<PortsInfo>("/api/system/ports");

export type SensorsInfo = {
  available: boolean;
  reason: string | null;
  temps: { chip: string; label: string; celsius: number }[];
  fans: { chip: string; label: string; rpm: number }[];
  power: { domain: string; watts: number }[];
};
export const getSensorsInfo = () => get<SensorsInfo>("/api/system/sensors");

// ── /api/llm/* ──────────────────────────────────────────
export type LlmHealth = {
  ollama_up: boolean;
  ready: boolean;
  models?: string[];
  required?: string;
  pull_cmd?: string | null;
  error?: string;
  code?: number;
};

export const llmHealth = () => get<LlmHealth>("/api/llm/health");

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function llmChat(
  messages: ChatMessage[],
  opts: { temperature?: number } = {},
): Promise<{ content: string; model?: string; eval_count?: number }> {
  const r = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...opts }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`llm chat ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export const lokiTopk = (expr: string, minutes = 1440) =>
  get<{
    rows: { labels: Record<string, string>; value: number }[];
    error?: string;
  }>(`/api/metric/loki/topk?expr=${encodeURIComponent(expr)}&minutes=${minutes}`);

// ── /api/llm/analyze-alert ───────────────────────────────
export async function llmAnalyzeAlert(alert: RawAlert): Promise<{ analysis: string; model?: string }> {
  const r = await fetch("/api/llm/analyze-alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`analyze ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

// ── /api/actions/* (Alerts 모달용) ───────────────────────
export async function actionCreateCase(payload: {
  title: string;
  description: string;
  severity: number;
  tags?: string[];
}): Promise<{ created: boolean; case_id?: string; reason?: string; raw?: unknown }> {
  const r = await fetch("/api/actions/case", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function actionBanIp(payload: {
  ip: string;
  score?: number;
  signals?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const r = await fetch("/api/actions/ban", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

// ── 헬퍼: verdict → severity 매핑 ─────────────────────────
export function verdictToSeverity(verdict: string): Severity {
  const v = verdict.toLowerCase();
  if (v === "critical") return "critical";
  if (v === "danger" || v === "high") return "high";
  if (v === "medium" || v === "dryrunban") return "medium";
  if (v === "low") return "low";
  return "info";
}
