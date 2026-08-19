import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Card from "@/components/Card";
import { listCases } from "@/lib/api";
import { fmtNumber, fmtRelative } from "@/lib/format";

const SEVERITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High", 4: "Critical" };
const SEVERITY_TONE: Record<number, string> = {
  1: "text-info",
  2: "text-warn",
  3: "text-sev3",
  4: "text-crit",
};
const STATUS_LABEL: Record<string, string> = {
  Open: "열림",
  InProgress: "진행중",
  Resolved: "해결",
  Duplicated: "중복",
};

const PUBLIC_URL =
  import.meta.env.VITE_THEHIVE_URL ?? "http://192.168.10.232:9000";

export default function Cases() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => listCases(50),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-sm text-text-secondary">불러오는 중…</div>;
  if (isError || !data) {
    return (
      <Card title="연결 실패">
        <p className="text-sm text-crit">
          /api/cases 응답 없음. THEHIVE_ENABLED=true 이고 THEHIVE_API_KEY 가 발급되어야 합니다.
        </p>
        <p className="mt-2 text-xs text-text-secondary">{String(error)}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">케이스</h1>
          <p className="text-sm text-text-secondary">
            TheHive 사고 케이스 {fmtNumber(data.total)}건
          </p>
        </div>
        <a
          href={PUBLIC_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-subtle px-3 py-2 text-sm text-text-primary hover:bg-elevated"
        >
          TheHive 열기 <ExternalLink size={14} />
        </a>
      </div>

      {data.cases.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">
            아직 생성된 케이스가 없습니다. THEHIVE_ENABLED=true + Critical 알람 발생 시
            자동 생성됩니다.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">제목</th>
                  <th className="px-4 py-2 text-left font-medium">심각도</th>
                  <th className="px-4 py-2 text-left font-medium">상태</th>
                  <th className="px-4 py-2 text-left font-medium">담당</th>
                  <th className="px-4 py-2 text-left font-medium">태그</th>
                  <th className="px-4 py-2 text-left font-medium">생성</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.id} className="border-t border-subtle hover:bg-elevated">
                    <td className="px-4 py-2 font-mono text-text-secondary">
                      {c.number ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-text-primary">
                      <a
                        href={`${PUBLIC_URL}/cases/${c.id}/details`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-brand hover:underline"
                      >
                        {c.title}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`font-medium ${SEVERITY_TONE[c.severity ?? 0] ?? "text-text-secondary"}`}
                      >
                        {SEVERITY_LABEL[c.severity ?? 0] ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {STATUS_LABEL[c.status ?? ""] ?? c.status ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{c.owner ?? "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 4).map((t, i) => (
                          <span
                            key={i}
                            className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-brand"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                      {c.createdAt
                        ? fmtRelative(
                            typeof c.createdAt === "number"
                              ? new Date(c.createdAt).toISOString()
                              : c.createdAt,
                          )
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
