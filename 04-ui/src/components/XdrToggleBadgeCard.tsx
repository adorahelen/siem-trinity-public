import { useQuery } from "@tanstack/react-query";
import { Shield, ShieldOff } from "lucide-react";
import { getStatus } from "@/lib/api";

const TOGGLES = [
  { key: "auto_ban", label: "Auto-Ban" },
  { key: "misp", label: "MISP" },
  { key: "shuffle", label: "Shuffle" },
  { key: "thehive", label: "TheHive" },
] as const;

export default function XdrToggleBadgeCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["status-xdr"],
    queryFn: getStatus,
    refetchInterval: 15_000,
  });

  const xdr = data?.xdr;
  const onCount = xdr
    ? TOGGLES.filter((t) => xdr[t.key as keyof typeof xdr].enabled).length
    : 0;

  return (
    <div className="flex h-full w-full flex-col justify-between rounded-card border border-subtle bg-surface p-4">
      <div>
        <div className="text-xs text-text-secondary">XDR 자동대응 토글</div>
        <div className="mt-0.5 text-3xl font-semibold tabular-nums text-text-primary">
          {isLoading ? "…" : `${onCount} / 4`}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {TOGGLES.map((t) => {
          const on = xdr?.[t.key as keyof typeof xdr]?.enabled;
          return (
            <div
              key={t.key}
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10px] ${
                on ? "border border-ok/30 bg-ok/10 text-ok" : "border border-subtle bg-elevated text-text-secondary"
              }`}
            >
              {on ? <Shield size={10} /> : <ShieldOff size={10} />}
              <span className="truncate">{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
