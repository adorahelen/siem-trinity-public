import { useQuery } from "@tanstack/react-query";
import { getPortsInfo } from "@/lib/api";

export default function PortsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["ports"],
    queryFn: getPortsInfo,
    refetchInterval: 60_000,
  });

  const list = data?.listening ?? [];
  const external = list.filter((p) => p.addr === "0.0.0.0" || p.addr === "*" || p.addr.startsWith("[::]"));
  const localOnly = list.filter((p) => p.addr.startsWith("127.") || p.addr.startsWith("[::1]"));

  return (
    <div className="flex h-full w-full flex-col rounded-card border border-subtle bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-text-secondary">Listen 포트</div>
        <div className="text-[10px] text-text-secondary">
          외부 {external.length} · 내부 {localOnly.length}
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-auto font-mono text-[11px]">
        {isLoading && <div className="text-text-secondary">…</div>}
        {external.length > 0 && (
          <>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-crit">
              외부 노출
            </div>
            {external.map((p, i) => (
              <div key={`e${i}`} className="flex items-center gap-2 py-0.5">
                <span className="rounded bg-crit/10 px-1 text-[10px] text-crit">
                  {p.proto}
                </span>
                <span className="text-text-primary">{p.port}</span>
                <span className="text-text-secondary">{p.addr}</span>
              </div>
            ))}
          </>
        )}
        {localOnly.length > 0 && (
          <>
            <div className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-text-secondary">
              로컬만
            </div>
            {localOnly.slice(0, 10).map((p, i) => (
              <div key={`l${i}`} className="flex items-center gap-2 py-0.5 text-text-secondary">
                <span className="rounded bg-elevated px-1 text-[10px]">{p.proto}</span>
                <span>{p.port}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
