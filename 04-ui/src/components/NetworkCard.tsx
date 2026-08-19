import { useQuery } from "@tanstack/react-query";
import { getNetworkInfo } from "@/lib/api";

export default function NetworkCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["network"],
    queryFn: getNetworkInfo,
    refetchInterval: 60_000,
  });

  const ifaces = (data?.interfaces ?? []).filter(
    (i) => i.name !== "lo" && i.state === "UP",
  );

  return (
    <div className="flex h-full w-full flex-col rounded-card border border-subtle bg-surface p-4">
      <div className="text-xs text-text-secondary">네트워크</div>
      <div className="mt-1 flex flex-col gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">
            공인 IP
          </div>
          <div className="font-mono text-info">
            {isLoading ? "…" : (data?.public_ip ?? "-")}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">
            인터페이스 ({ifaces.length})
          </div>
          <div className="mt-0.5 space-y-0.5 font-mono text-[11px]">
            {ifaces.slice(0, 8).map((i) => (
              <div key={i.name} className="flex items-center gap-2">
                <span className="text-text-secondary">{i.name}</span>
                <span className="text-text-primary">{i.addr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
