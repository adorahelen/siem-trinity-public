import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import { lokiTopk } from "@/lib/api";
import { fmtNumber } from "@/lib/format";

type Props = {
  title: string;
  subtitle?: string;
  expr: string;
  labelKey: string;
  labelHeader: string;
  valueHeader?: string;
};

export default function TopkTable({
  title,
  subtitle,
  expr,
  labelKey,
  labelHeader,
  valueHeader = "건수",
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["topk", expr],
    queryFn: () => lokiTopk(expr),
    refetchInterval: 60_000,
  });

  return (
    <Card title={title} subtitle={subtitle} className="p-0">
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-elevated text-xs uppercase text-text-secondary">
            <tr>
              <th className="px-2 py-2 md:px-4 text-left font-medium">#</th>
              <th className="px-2 py-2 md:px-4 text-left font-medium">{labelHeader}</th>
              <th className="px-2 py-2 md:px-4 text-right font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-2 py-4 md:px-4 text-center text-text-secondary">
                  불러오는 중…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={3} className="px-2 py-4 md:px-4 text-center text-crit">
                  쿼리 실패
                </td>
              </tr>
            )}
            {!isLoading &&
              data?.rows.map((r, i) => (
                <tr key={i} className="border-t border-subtle">
                  <td className="px-2 py-1.5 md:px-4 font-mono text-text-secondary">{i + 1}</td>
                  <td className="px-2 py-1.5 md:px-4 font-mono text-text-primary">
                    {r.labels[labelKey] ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 md:px-4 text-right font-mono tabular-nums text-text-primary">
                    {fmtNumber(r.value)}
                  </td>
                </tr>
              ))}
            {!isLoading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 md:px-4 text-center text-text-secondary">
                  결과 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
