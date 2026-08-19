import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import { logsQuery } from "@/lib/api";

type Props = {
  title: string;
  subtitle?: string;
  query: string;
  minutes?: number;
  limit?: number;
  height?: string;
};

export default function LogStream({
  title,
  subtitle,
  query,
  minutes = 60,
  limit = 30,
  height = "260px",
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["log", query, minutes, limit],
    queryFn: () => logsQuery(query, minutes, limit),
    refetchInterval: 30_000,
  });

  function fmtNs(ns: string) {
    const ms = Math.floor(Number(ns) / 1_000_000);
    return new Date(ms).toLocaleTimeString("ko-KR", { hour12: false });
  }

  return (
    <Card title={title} subtitle={subtitle}>
      <div
        className="overflow-auto rounded-md border border-subtle bg-base font-mono text-[11px] leading-snug"
        style={{ height }}
      >
        {isLoading && (
          <div className="p-3 text-text-secondary">불러오는 중…</div>
        )}
        {isError && <div className="p-3 text-crit">쿼리 실패</div>}
        {!isLoading && data?.rows.length === 0 && (
          <div className="p-3 text-text-secondary">결과 없음</div>
        )}
        {data?.rows.map((r, i) => (
          <div
            key={i}
            className="border-b border-subtle/30 px-3 py-1 hover:bg-elevated"
          >
            <span className="mr-2 text-text-secondary">{fmtNs(r.ts)}</span>
            <span className="text-text-primary">{r.line}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
