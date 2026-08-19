import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "crit" | "info";
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-text-primary",
  ok: "text-ok",
  warn: "text-warn",
  crit: "text-crit",
  info: "text-info",
};

export default function KpiCard({ label, value, hint, tone = "default" }: Props) {
  return (
    <div className="rounded-card border border-subtle bg-surface p-4">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TONE[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}
