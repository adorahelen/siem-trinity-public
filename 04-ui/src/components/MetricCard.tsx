import { useQuery } from "@tanstack/react-query";
import { promInstant, lokiInstant } from "@/lib/api";

type Props = {
  label: string;
  source: "prom" | "loki";
  expr: string;
  unit?: string;
  fixed?: number;
  thresholds?: { value: number; tone: "ok" | "warn" | "crit" }[];
  refetchMs?: number;
  hint?: string;
};

const TONE: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
};

export default function MetricCard({
  label,
  source,
  expr,
  unit = "",
  fixed = 0,
  thresholds = [],
  refetchMs = 30_000,
  hint,
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["metric", source, expr],
    queryFn: () => (source === "prom" ? promInstant(expr) : lokiInstant(expr)),
    refetchInterval: refetchMs,
  });

  const v = data?.value ?? null;
  let tone = "ok";
  if (v != null) {
    for (const t of thresholds) {
      if (v >= t.value) tone = t.tone;
    }
  }

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-card border border-subtle bg-surface p-4">
      <div>
        <div className="text-xs text-text-secondary">{label}</div>
        <div className={`mt-0.5 text-3xl font-semibold tabular-nums ${TONE[tone]}`}>
          {isLoading
            ? "…"
            : isError || v == null
              ? "-"
              : `${v.toFixed(fixed)}${unit}`}
        </div>
      </div>
      {hint && (
        <div className="mt-1 truncate text-[11px] text-text-secondary">{hint}</div>
      )}
    </div>
  );
}
