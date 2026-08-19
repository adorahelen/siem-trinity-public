import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Card from "@/components/Card";
import { logsQuery, type LogRow } from "@/lib/api";
import { fmtNumber } from "@/lib/format";

const PRESETS = [
  { label: "fail2ban Ban", q: `{job="fail2ban"} |= "Ban"` },
  { label: "SSH 무차별 대입", q: `{job="auth"} |= "Invalid user"` },
  { label: "Suricata alert", q: `{job="suricata"} |= "alert"` },
  { label: "Wazuh High+", q: `{job="wazuh"} |~ "level\\":(1[0-5]|[7-9])"` },
  { label: "kernel 차단/거부", q: `{job="kern"} |~ "(?i)(deny|drop|block)"` },
  { label: "ModSecurity WAF", q: `{job="modsec"}` },
  { label: "syslog ERROR", q: `{job="syslog"} |~ "(?i)error"` },
  { label: "Zeek 연결", q: `{job="zeek_conn"}` },
];

export default function Logs() {
  const [q, setQ] = useState(PRESETS[0].q);
  const [minutes, setMinutes] = useState(15);
  const [limit, setLimit] = useState(10);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);

  const run = useMutation({
    mutationFn: ({ q, m, l }: { q: string; m: number; l: number }) =>
      logsQuery(q, m, l),
    onSuccess: (r) => {
      setRows(r.rows);
      setTotal(r.total);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    run.mutate({ q: q.trim(), m: minutes, l: limit });
  }

  function fmtNs(ns: string) {
    const ms = Math.floor(Number(ns) / 1_000_000);
    return new Date(ms).toLocaleString("ko-KR", { hour12: false });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">로그</h1>
        <p className="text-sm text-text-secondary">
          Loki LogQL 직접 검색
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setQ(p.q)}
                className="rounded-md border border-subtle bg-elevated px-2.5 py-1 text-xs text-text-primary hover:bg-base"
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-subtle bg-elevated px-3 py-2 font-mono text-sm text-text-primary focus:border-brand focus:outline-none"
            placeholder='{job="auth"} |= "failed"'
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-text-secondary">최근</label>
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="rounded-md border border-subtle bg-elevated px-2 py-1 text-sm text-text-primary"
            >
              <option value={5}>5분</option>
              <option value={15}>15분</option>
              <option value={60}>1시간</option>
              <option value={360}>6시간</option>
              <option value={1440}>24시간</option>
            </select>
            <label className="text-xs text-text-secondary">최대</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-md border border-subtle bg-elevated px-2 py-1 text-sm text-text-primary"
            >
              <option value={10}>10건</option>
              <option value={30}>30건</option>
              <option value={50}>50건</option>
              <option value={100}>100건</option>
              <option value={300}>300건</option>
              <option value={1000}>1000건</option>
            </select>
            <button
              type="submit"
              disabled={run.isPending}
              className="ml-auto rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-base hover:opacity-90 disabled:opacity-50"
            >
              {run.isPending ? "쿼리 중…" : "쿼리 실행"}
            </button>
          </div>
        </form>
        {run.isError && (
          <div className="mt-3 space-y-1 rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-xs">
            <div className="font-semibold text-crit">쿼리 실패</div>
            <pre className="overflow-auto whitespace-pre-wrap break-all text-text-secondary">
              {String(run.error)}
            </pre>
            <div className="text-text-secondary">
              팁: 시간 범위·건수를 줄여보세요. 정규식 (<span className="font-mono">|~</span>) 사용 시
              따옴표/이스케이프를 확인하세요.
            </div>
          </div>
        )}
      </Card>

      {run.isSuccess && rows.length === 0 && (
        <Card title="결과" subtitle="0건">
          <div className="py-8 text-center">
            <div className="text-sm text-text-secondary">
              쿼리는 정상 실행됐지만, 매치되는 로그가 0건입니다.
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              팁: 시간 범위를 늘리거나 (24시간) 필터를 완화해보세요. 또는 다른 프리셋을
              시도해보세요.
            </div>
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <Card
          title="결과"
          subtitle={`${fmtNumber(total)}건 매치, ${fmtNumber(rows.length)}건 표시`}
          className="p-0"
        >
          <div className="overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-elevated text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">시간</th>
                  <th className="px-3 py-2 text-left font-medium">job</th>
                  <th className="px-3 py-2 text-left font-medium">로그</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-subtle align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-text-secondary">
                      {fmtNs(r.ts)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-text-secondary">
                      {r.labels.job ?? "-"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-text-primary">
                      <div className="max-w-3xl truncate">{r.line}</div>
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
