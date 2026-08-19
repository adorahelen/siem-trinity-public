import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import { getAlerts, getStatus } from "@/lib/api";
import { fmtNumber, fmtRelative } from "@/lib/format";

const VERDICT_TONE: Record<string, string> = {
  Banned: "text-crit",
  DryRunBan: "text-warn",
  Skipped: "text-text-secondary",
};

const ACTION_LABEL: Record<string, string> = {
  banned: "차단",
  dry_run: "DryRun",
  skipped: "스킵",
};

export default function Actions() {
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus });
  const alerts = useQuery({
    queryKey: ["actions"],
    queryFn: () => getAlerts({ detector: "auto_ban", limit: 100 }),
    refetchInterval: 30_000,
  });

  if (alerts.isLoading) {
    return <div className="text-sm text-text-secondary">불러오는 중…</div>;
  }
  if (alerts.isError || !alerts.data) {
    return (
      <Card title="연결 실패">
        <p className="text-sm text-crit">/api/alerts?detector=auto_ban 응답 없음.</p>
      </Card>
    );
  }

  const data = alerts.data;
  const banned = data.alerts.filter((a) => a.verdict === "Banned").length;
  const dryRun = data.alerts.filter((a) => a.verdict === "DryRunBan").length;
  const skipped = data.alerts.filter((a) => a.verdict === "Skipped").length;

  const xdr = status.data?.xdr.auto_ban;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">능동대응</h1>
        <p className="text-sm text-text-secondary">
          fail2ban auto-ban 이력 (Wazuh Active Response 연동은 추후)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="AUTO_BAN 토글"
          value={xdr?.enabled ? "ON" : "OFF"}
          tone={xdr?.enabled ? "ok" : "warn"}
          hint={`threshold ${xdr?.threshold ?? "?"}`}
        />
        <KpiCard label="실제 차단" value={fmtNumber(banned)} tone="crit" />
        <KpiCard
          label="DryRun (토글 OFF)"
          value={fmtNumber(dryRun)}
          tone="warn"
          hint="실제 차단 안 됨"
        />
        <KpiCard label="스킵 (화이트리스트 등)" value={fmtNumber(skipped)} />
      </div>

      {!xdr?.enabled && (
        <Card title="안내">
          <p className="text-sm text-warn">
            <span className="font-semibold">AUTO_BAN_ENABLED=false</span> 상태입니다. 위
            DryRun 건수만큼 실제로는 차단이 일어나지 않았습니다. .env 에서 토글을 켠 뒤
            detection-api 를 재시작하면 활성화됩니다.
          </p>
        </Card>
      )}

      <Card
        title="auto-ban 이력"
        subtitle={`최근 ${data.alerts.length}건`}
        className="p-0"
      >
        {/* 데스크탑: 7열 테이블 */}
        <div className="hidden overflow-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-elevated text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-left font-medium">시간</th>
                <th className="px-4 py-2 text-left font-medium">결과</th>
                <th className="px-4 py-2 text-left font-medium">액션</th>
                <th className="px-4 py-2 text-left font-medium">IP</th>
                <th className="px-4 py-2 text-left font-medium">점수</th>
                <th className="px-4 py-2 text-left font-medium">Jail</th>
                <th className="px-4 py-2 text-left font-medium">사유</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((a, i) => (
                <tr key={i} className="border-t border-subtle">
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {fmtRelative(a.timestamp.replace(" ", "T"))}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`font-medium ${VERDICT_TONE[a.verdict] ?? "text-text-primary"}`}
                    >
                      {a.verdict}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-primary">
                    {ACTION_LABEL[a.action ?? ""] ?? a.action ?? "-"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-primary">
                    {a.ip ?? "-"}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums text-text-primary">
                    {a.score ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{a.jail ?? "-"}</td>
                  <td className="max-w-md truncate px-4 py-2 text-text-secondary">
                    {a.reason ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일: 카드 리스트 */}
        <div className="space-y-2 p-2 md:hidden">
          {data.alerts.map((a, i) => (
            <div key={i} className="rounded-md border border-subtle bg-elevated px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${VERDICT_TONE[a.verdict] ?? "text-text-primary"}`}
                  >
                    {a.verdict}
                  </span>
                  <span className="font-mono text-sm text-text-primary">{a.ip ?? "-"}</span>
                </div>
                <span className="shrink-0 text-xs text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
                <span>{ACTION_LABEL[a.action ?? ""] ?? a.action ?? "-"}</span>
                <span>·</span>
                <span>점수 {a.score ?? "-"}</span>
                {a.jail && (
                  <>
                    <span>·</span>
                    <span>jail {a.jail}</span>
                  </>
                )}
              </div>
              {a.reason && (
                <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{a.reason}</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
