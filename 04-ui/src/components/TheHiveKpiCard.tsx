import { useQuery } from "@tanstack/react-query";
import { listCases } from "@/lib/api";

export default function TheHiveKpiCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["thehive-cases"],
    queryFn: () => listCases(100),
    refetchInterval: 30_000,
  });

  const total = data?.total ?? 0;
  const open = data?.cases.filter((c) => c.status === "Open" || c.status === "InProgress").length ?? 0;
  const tone = open > 5 ? "text-crit" : open > 0 ? "text-warn" : "text-ok";

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-card border border-subtle bg-surface p-4">
      <div>
        <div className="text-xs text-text-secondary">미해결 케이스</div>
        <div className={`mt-0.5 text-3xl font-semibold tabular-nums ${tone}`}>
          {isLoading ? "…" : isError ? "-" : open}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-text-secondary">
        총 {total} · TheHive
      </div>
    </div>
  );
}
