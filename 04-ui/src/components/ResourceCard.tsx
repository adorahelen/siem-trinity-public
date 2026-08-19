import { useQuery } from "@tanstack/react-query";
import { getHostInfo, type HostInfo } from "@/lib/api";

type Kind = "cpu" | "memory" | "disk";

type Props = {
  kind: Kind;
};

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function pickInfo(info: HostInfo, kind: Kind) {
  if (kind === "cpu") {
    const pct = info.cpu.usage_pct ?? 0;
    return {
      label: "CPU",
      pct,
      sub1: info.cpu.cores ? `${info.cpu.cores} cores` : null,
      sub2: info.cpu.model,
      sub3: info.host.hostname,
      thresholdWarn: 70,
      thresholdCrit: 90,
    };
  }
  if (kind === "memory") {
    const total = info.memory.total_bytes ?? 0;
    const used = info.memory.used_bytes ?? 0;
    const pct = total > 0 ? (used / total) * 100 : 0;
    return {
      label: "메모리",
      pct,
      sub1: `${fmtBytes(used)} / ${fmtBytes(total)}`,
      sub2: null,
      sub3: null,
      thresholdWarn: 75,
      thresholdCrit: 90,
    };
  }
  const total = info.disk.total_bytes ?? 0;
  const used = info.disk.used_bytes ?? 0;
  const pct = total > 0 ? (used / total) * 100 : 0;
  return {
    label: "디스크 /",
    pct,
    sub1: `${fmtBytes(used)} / ${fmtBytes(total)}`,
    sub2: info.disk.device,
    sub3: info.disk.fstype,
    thresholdWarn: 75,
    thresholdCrit: 90,
  };
}

export default function ResourceCard({ kind }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["host-info"],
    queryFn: getHostInfo,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="h-full w-full rounded-card border border-subtle bg-surface p-4">
        <div className="text-xs text-text-secondary">…</div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="h-full w-full rounded-card border border-subtle bg-surface p-4">
        <div className="text-xs text-crit">불러오기 실패</div>
      </div>
    );
  }

  const info = pickInfo(data, kind);
  const toneCls =
    info.pct >= info.thresholdCrit
      ? "text-crit"
      : info.pct >= info.thresholdWarn
        ? "text-warn"
        : "text-ok";

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-card border border-subtle bg-surface p-4">
      <div>
        <div className="text-xs text-text-secondary">{info.label}</div>
        <div className={`mt-0.5 text-3xl font-semibold tabular-nums ${toneCls}`}>
          {info.pct.toFixed(1)}%
        </div>
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-text-secondary">
        {info.sub1 && <div className="font-mono">{info.sub1}</div>}
        {info.sub2 && (
          <div className="truncate" title={info.sub2}>
            {info.sub2}
          </div>
        )}
        {info.sub3 && <div className="font-mono">{info.sub3}</div>}
      </div>
    </div>
  );
}
