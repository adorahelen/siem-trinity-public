import { useQuery } from "@tanstack/react-query";
import { getStorageInfo } from "@/lib/api";

function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function bar(pct: number): string {
  if (pct >= 90) return "bg-crit";
  if (pct >= 75) return "bg-warn";
  return "bg-ok";
}

export default function StorageCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["storage"],
    queryFn: getStorageInfo,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-full w-full flex-col rounded-card border border-subtle bg-surface p-4">
      <div className="text-xs text-text-secondary">스토리지</div>
      <div className="mt-2 space-y-3 text-sm">
        {isLoading && <div className="text-text-secondary">…</div>}
        {data?.filesystems.map((fs) => (
          <div key={fs.mountpoint}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-mono text-text-primary">{fs.mountpoint}</span>
              <span className="text-text-secondary">
                {fs.fstype} · {fmtBytes(fs.total_bytes)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-elevated">
              <div className={`h-full ${bar(fs.use_pct)}`} style={{ width: `${fs.use_pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-text-secondary">
              <span>
                {fmtBytes(fs.used_bytes)} / {fmtBytes(fs.total_bytes)} ({fs.use_pct.toFixed(1)}%)
              </span>
              <span>inode {fs.inodes_use_pct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
