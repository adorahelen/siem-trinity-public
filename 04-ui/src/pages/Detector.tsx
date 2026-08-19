import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Loader2 } from "lucide-react";
import Card from "@/components/Card";
import SeverityBadge from "@/components/SeverityBadge";
import KpiCard from "@/components/KpiCard";
import {
  getAlerts,
  getSummary,
  getStatus,
  runDetectors,
  verdictToSeverity,
  type RawAlert,
} from "@/lib/api";
import { fmtNumber, fmtRelative } from "@/lib/format";

type DetectorKey = "ip_risk_scorer" | "flow_anomaly_detector" | "beacon_detector" | "dga_detector";

const TABS: { key: DetectorKey; label: string; hint: string }[] = [
  { key: "ip_risk_scorer", label: "IP 위험도", hint: "가중치 합산 스코어링" },
  { key: "flow_anomaly_detector", label: "흐름 이상", hint: "Isolation Forest" },
  { key: "beacon_detector", label: "비콘 (C2)", hint: "CoV + FFT" },
  { key: "dga_detector", label: "DGA 도메인", hint: "Shannon Entropy" },
];

export default function Detector() {
  const [tab, setTab] = useState<DetectorKey>("ip_risk_scorer");
  const qc = useQueryClient();

  const summary = useQuery({
    queryKey: ["det-summary"],
    queryFn: () => getSummary(),
    refetchInterval: 30_000,
  });
  const status = useQuery({
    queryKey: ["det-status"],
    queryFn: getStatus,
    refetchInterval: 5_000,
  });
  const run = useMutation({
    mutationFn: () => runDetectors(1.0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["det-status"] });
      qc.invalidateQueries({ queryKey: ["det-summary"] });
      qc.invalidateQueries({ queryKey: ["det-alerts"] });
    },
  });

  const isRunning = status.data?.is_running ?? false;
  const lastRun = status.data?.last_run;
  const nextRun = status.data?.next_run;
  const interval = status.data?.schedule_interval_minutes ?? 30;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">AI 탐지</h1>
          <p className="text-sm text-text-secondary">
            4종 탐지기 — IP 위험도 · 흐름 이상 · 비콘 · DGA · {interval}분 자동 실행
          </p>
        </div>
        <button
          onClick={() => run.mutate()}
          disabled={isRunning || run.isPending}
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap self-start rounded-md bg-brand px-4 py-2 text-sm font-medium text-base hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning || run.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              실행 중…
            </>
          ) : (
            <>
              <Play size={16} />
              즉시 실행 (최근 1시간)
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-card border border-subtle bg-surface px-4 py-3 text-xs">
        <div>
          <div className="text-text-secondary">상태</div>
          <div className={`mt-0.5 font-medium ${isRunning ? "text-warn" : "text-ok"}`}>
            {isRunning ? "탐지 실행 중" : "대기"}
          </div>
        </div>
        <div>
          <div className="text-text-secondary">마지막 실행</div>
          <div className="mt-0.5 font-mono text-text-primary">
            {lastRun ? fmtRelative(lastRun) : "-"}
          </div>
        </div>
        <div>
          <div className="text-text-secondary">다음 실행</div>
          <div className="mt-0.5 font-mono text-text-primary">
            {nextRun ? fmtRelative(nextRun) : "-"}
          </div>
        </div>
      </div>

      {run.isError && (
        <div className="rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
          실행 요청 실패. 이미 실행 중이거나 API 연결 문제일 수 있습니다.
        </div>
      )}
      {run.data?.status === 409 && (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          이미 탐지가 실행 중입니다 (409).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TABS.map((t) => (
          <KpiCard
            key={t.key}
            label={t.label}
            value={fmtNumber(summary.data?.by_detector?.[t.key] ?? 0)}
            hint={t.hint}
            tone={(summary.data?.by_detector?.[t.key] ?? 0) > 0 ? "info" : "default"}
          />
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap border-b border-subtle">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-brand text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ip_risk_scorer" && <IpRiskTab />}
      {tab === "flow_anomaly_detector" && <FlowTab />}
      {tab === "beacon_detector" && <BeaconTab />}
      {tab === "dga_detector" && <DgaTab />}
    </div>
  );
}

function useDetectorAlerts(detector: DetectorKey) {
  return useQuery({
    queryKey: ["det-alerts", detector],
    queryFn: () => getAlerts({ detector, limit: 100 }),
    refetchInterval: 30_000,
  });
}

function EmptyOrLoading({ q }: { q: ReturnType<typeof useDetectorAlerts> }) {
  if (q.isLoading)
    return <div className="px-4 py-6 text-sm text-text-secondary">불러오는 중…</div>;
  if (q.isError)
    return <div className="px-4 py-6 text-sm text-crit">쿼리 실패</div>;
  if (!q.data || q.data.alerts.length === 0)
    return (
      <div className="px-4 py-6 text-sm text-text-secondary">
        탐지된 항목이 없습니다.
      </div>
    );
  return null;
}

// ── IP 위험도 ─────────────────────────────────────────────
function IpRiskTab() {
  const q = useDetectorAlerts("ip_risk_scorer");
  const empty = <EmptyOrLoading q={q} />;
  if (!q.data?.alerts.length) {
    return <Card>{empty}</Card>;
  }

  return (
    <Card title={`IP 위험도 ${q.data.total}건`} className="p-0">
      <div className="hidden overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2 text-left font-medium">시간</th>
              <th className="px-4 py-2 text-left font-medium">심각도</th>
              <th className="px-4 py-2 text-right font-medium">점수</th>
              <th className="px-4 py-2 text-left font-medium">IP</th>
              <th className="px-4 py-2 text-left font-medium">SSH</th>
              <th className="px-4 py-2 text-left font-medium">차단</th>
              <th className="px-4 py-2 text-left font-medium">Suricata</th>
              <th className="px-4 py-2 text-left font-medium">Wazuh</th>
              <th className="px-4 py-2 text-left font-medium">MISP</th>
              <th className="px-4 py-2 text-left font-medium">메시지</th>
            </tr>
          </thead>
          <tbody>
            {q.data.alerts.map((a, i) => {
              const sig = (a.signals ?? {}) as Record<string, unknown>;
              return (
                <tr key={i} className="border-t border-subtle">
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {fmtRelative(a.timestamp.replace(" ", "T"))}
                  </td>
                  <td className="px-4 py-2">
                    <SeverityBadge level={verdictToSeverity(a.verdict)} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-text-primary">
                    {a.score ?? "-"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-primary">{a.ip ?? "-"}</td>
                  <td className="px-4 py-2 font-mono tabular-nums text-text-secondary">
                    {String(sig.ssh_attempts ?? 0)}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {sig.is_banned ? <span className="text-warn">Y</span> : "-"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {String(sig.suricata_critical ?? 0)}/{String(sig.suricata_high ?? 0)}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {String(sig.wazuh_alerts ?? 0)}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {sig.misp_hit ? <span className="text-crit">HIT</span> : "-"}
                  </td>
                  <td className="max-w-md truncate px-4 py-2 text-text-secondary">
                    {a.message ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 (10 필드 압축 — 시간·심각도·IP·점수, 신호는 칩으로) */}
      <div className="space-y-2 p-2 md:hidden">
        {q.data.alerts.map((a, i) => {
          const sig = (a.signals ?? {}) as Record<string, unknown>;
          return (
            <div key={i} className="rounded-md border border-subtle bg-elevated px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge level={verdictToSeverity(a.verdict)} />
                  <span className="font-mono text-sm text-text-primary">{a.ip ?? "-"}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-text-primary">
                    {a.score ?? "-"}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                <span className="rounded bg-base/60 px-1.5 py-0.5 font-mono text-text-secondary">
                  SSH {String(sig.ssh_attempts ?? 0)}
                </span>
                {sig.is_banned ? (
                  <span className="rounded bg-warn/15 px-1.5 py-0.5 text-warn">차단됨</span>
                ) : null}
                <span className="rounded bg-base/60 px-1.5 py-0.5 font-mono text-text-secondary">
                  Sur {String(sig.suricata_critical ?? 0)}/{String(sig.suricata_high ?? 0)}
                </span>
                <span className="rounded bg-base/60 px-1.5 py-0.5 font-mono text-text-secondary">
                  Waz {String(sig.wazuh_alerts ?? 0)}
                </span>
                {sig.misp_hit ? (
                  <span className="rounded bg-crit/15 px-1.5 py-0.5 font-semibold text-crit">
                    MISP HIT
                  </span>
                ) : null}
              </div>
              {a.message && (
                <div className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
                  {a.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── 흐름 이상 ─────────────────────────────────────────────
function FlowTab() {
  const q = useDetectorAlerts("flow_anomaly_detector");
  if (!q.data?.alerts.length) return <Card><EmptyOrLoading q={q} /></Card>;

  type FlowAlert = RawAlert & {
    src_ip?: string;
    dst_ip?: string;
    dst_port?: number;
    proto?: string;
    conn_state?: string;
    anomaly_score?: number;
    orig_bytes?: number;
    orig_pkts?: number;
    anomaly_type?: string;
  };

  return (
    <Card title={`흐름 이상 ${q.data.total}건`} className="p-0">
      <div className="hidden overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2 text-left font-medium">시간</th>
              <th className="px-4 py-2 text-left font-medium">심각도</th>
              <th className="px-4 py-2 text-left font-medium">출발</th>
              <th className="px-4 py-2 text-left font-medium">목적</th>
              <th className="px-4 py-2 text-left font-medium">포트/proto</th>
              <th className="px-4 py-2 text-left font-medium">유형</th>
              <th className="px-4 py-2 text-right font-medium">score</th>
              <th className="px-4 py-2 text-right font-medium">bytes</th>
              <th className="px-4 py-2 text-right font-medium">pkts</th>
            </tr>
          </thead>
          <tbody>
            {(q.data.alerts as FlowAlert[]).map((a, i) => (
              <tr key={i} className="border-t border-subtle">
                <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </td>
                <td className="px-4 py-2">
                  <SeverityBadge level={verdictToSeverity(a.verdict)} />
                </td>
                <td className="px-4 py-2 font-mono text-text-primary">{a.src_ip ?? "-"}</td>
                <td className="px-4 py-2 font-mono text-text-primary">{a.dst_ip ?? "-"}</td>
                <td className="px-4 py-2 font-mono text-text-secondary">
                  {a.dst_port ?? "-"}/{a.proto ?? "-"}
                </td>
                <td className="px-4 py-2 text-text-primary">{a.anomaly_type ?? "-"}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.anomaly_score?.toFixed(3) ?? "-"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {fmtNumber(a.orig_bytes ?? 0)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {fmtNumber(a.orig_pkts ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-2 md:hidden">
        {(q.data.alerts as FlowAlert[]).map((a, i) => (
          <div key={i} className="rounded-md border border-subtle bg-elevated px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <SeverityBadge level={verdictToSeverity(a.verdict)} />
                <span className="font-mono text-xs text-text-primary">
                  {a.src_ip ?? "-"} → {a.dst_ip ?? "-"}
                </span>
              </div>
              <span className="shrink-0 text-xs text-text-secondary">
                {fmtRelative(a.timestamp.replace(" ", "T"))}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-text-secondary">
              <span className="font-mono">
                :{a.dst_port ?? "-"}/{a.proto ?? "-"}
              </span>
              <span>· {a.anomaly_type ?? "-"}</span>
              <span className="font-mono">· score {a.anomaly_score?.toFixed(3) ?? "-"}</span>
              <span className="font-mono">
                · {fmtNumber(a.orig_bytes ?? 0)}B / {fmtNumber(a.orig_pkts ?? 0)}pkt
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 비콘 ─────────────────────────────────────────────────
function BeaconTab() {
  const q = useDetectorAlerts("beacon_detector");
  if (!q.data?.alerts.length) return <Card><EmptyOrLoading q={q} /></Card>;

  type Beacon = RawAlert & {
    src_ip?: string;
    dst_ip?: string;
    cov?: number;
    interval?: number;
    connections?: number;
  };

  return (
    <Card title={`비콘 ${q.data.total}건`} className="p-0">
      <div className="hidden overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2 text-left font-medium">시간</th>
              <th className="px-4 py-2 text-left font-medium">심각도</th>
              <th className="px-4 py-2 text-left font-medium">출발</th>
              <th className="px-4 py-2 text-left font-medium">목적</th>
              <th className="px-4 py-2 text-right font-medium">CoV</th>
              <th className="px-4 py-2 text-right font-medium">간격(s)</th>
              <th className="px-4 py-2 text-right font-medium">연결수</th>
            </tr>
          </thead>
          <tbody>
            {(q.data.alerts as Beacon[]).map((a, i) => (
              <tr key={i} className="border-t border-subtle">
                <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </td>
                <td className="px-4 py-2">
                  <SeverityBadge level={verdictToSeverity(a.verdict)} />
                </td>
                <td className="px-4 py-2 font-mono text-text-primary">{a.src_ip ?? "-"}</td>
                <td className="px-4 py-2 font-mono text-text-primary">{a.dst_ip ?? "-"}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.cov?.toFixed(3) ?? "-"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.interval ?? "-"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.connections ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-2 md:hidden">
        {(q.data.alerts as Beacon[]).map((a, i) => (
          <div key={i} className="rounded-md border border-subtle bg-elevated px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <SeverityBadge level={verdictToSeverity(a.verdict)} />
                <span className="font-mono text-xs text-text-primary">
                  {a.src_ip ?? "-"} → {a.dst_ip ?? "-"}
                </span>
              </div>
              <span className="shrink-0 text-xs text-text-secondary">
                {fmtRelative(a.timestamp.replace(" ", "T"))}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-mono text-text-secondary">
              <span>CoV {a.cov?.toFixed(3) ?? "-"}</span>
              <span>· 간격 {a.interval ?? "-"}s</span>
              <span>· 연결 {a.connections ?? "-"}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── DGA ─────────────────────────────────────────────────
function DgaTab() {
  const q = useDetectorAlerts("dga_detector");
  if (!q.data?.alerts.length) return <Card><EmptyOrLoading q={q} /></Card>;

  type Dga = RawAlert & {
    domain?: string;
    entropy?: number;
    length?: number;
    score?: number;
  };

  return (
    <Card title={`DGA ${q.data.total}건`} className="p-0">
      <div className="hidden overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2 text-left font-medium">시간</th>
              <th className="px-4 py-2 text-left font-medium">심각도</th>
              <th className="px-4 py-2 text-left font-medium">도메인</th>
              <th className="px-4 py-2 text-right font-medium">엔트로피</th>
              <th className="px-4 py-2 text-right font-medium">길이</th>
              <th className="px-4 py-2 text-right font-medium">점수</th>
            </tr>
          </thead>
          <tbody>
            {(q.data.alerts as Dga[]).map((a, i) => (
              <tr key={i} className="border-t border-subtle">
                <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </td>
                <td className="px-4 py-2">
                  <SeverityBadge level={verdictToSeverity(a.verdict)} />
                </td>
                <td className="px-4 py-2 font-mono text-text-primary">{a.domain ?? "-"}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.entropy?.toFixed(2) ?? "-"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.length ?? "-"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-text-secondary">
                  {a.score ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 p-2 md:hidden">
        {(q.data.alerts as Dga[]).map((a, i) => (
          <div key={i} className="rounded-md border border-subtle bg-elevated px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <SeverityBadge level={verdictToSeverity(a.verdict)} />
                <span className="break-all font-mono text-xs text-text-primary">
                  {a.domain ?? "-"}
                </span>
              </div>
              <span className="shrink-0 text-xs text-text-secondary">
                {fmtRelative(a.timestamp.replace(" ", "T"))}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-mono text-text-secondary">
              <span>엔트 {a.entropy?.toFixed(2) ?? "-"}</span>
              <span>· 길이 {a.length ?? "-"}</span>
              <span>· 점수 {a.score ?? "-"}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
