import { useQuery } from "@tanstack/react-query";
import { promInstant } from "@/lib/api";

function fmtUptime(seconds: number): { days: number; hours: number; minutes: number } {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return { days: d, hours: h, minutes: m };
}

export default function UptimeCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["uptime"],
    queryFn: () => promInstant("time() - node_boot_time_seconds"),
    refetchInterval: 60_000,
  });

  const sec = data?.value ?? 0;
  const { days, hours, minutes } = fmtUptime(sec);
  const tone = days >= 30 ? "text-warn" : "text-text-primary"; // 30일 넘으면 패치 권장

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-card border border-subtle bg-surface p-4">
      <div>
        <div className="text-xs text-text-secondary">가동 시간</div>
        <div className={`mt-0.5 text-3xl font-semibold tabular-nums ${tone}`}>
          {isLoading ? "…" : `${days}d`}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-text-secondary">
        {isLoading ? "" : `${hours}h ${minutes}m`}
        {days >= 30 && <span className="ml-2 text-warn">패치 권장</span>}
      </div>
    </div>
  );
}
