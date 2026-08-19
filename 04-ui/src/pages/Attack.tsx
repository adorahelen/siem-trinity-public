import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import Chart from "@/components/Chart";
import KpiCard from "@/components/KpiCard";
import AttackMatrix, { type DetectionMap } from "@/components/AttackMatrix";
import { getAttackCoverage } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import type { EChartsOption } from "echarts";

const VERDICT_COLOR: Record<string, string> = {
  Critical: "#f87171",
  Danger: "#f87171",
  High: "#fb923c",
  Medium: "#fbbf24",
  DryRunBan: "#fbbf24",
  Low: "#60a5fa",
};

export default function Attack() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attackCoverage"],
    queryFn: getAttackCoverage,
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="text-sm text-text-secondary">불러오는 중…</div>;
  if (isError || !data) {
    return (
      <Card title="연결 실패">
        <p className="text-sm text-crit">/api/attack/coverage 응답 없음.</p>
      </Card>
    );
  }

  const top = [...data._summary.top_techniques].reverse();
  const barOption: EChartsOption = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 90, right: 30, top: 12, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: { color: "#9aa7bd" },
      splitLine: { lineStyle: { color: "#23304a" } },
    },
    yAxis: {
      type: "category",
      data: top.map((t) => t.id),
      axisLabel: { color: "#e6edf7", fontFamily: "JetBrains Mono", fontSize: 12 },
      axisLine: { lineStyle: { color: "#23304a" } },
    },
    series: [
      {
        type: "bar",
        data: top.map((t) => ({
          value: t.count,
          itemStyle: { color: VERDICT_COLOR[t.max_verdict] ?? "#a78bfa" },
        })),
        barWidth: "60%",
        label: {
          show: true,
          position: "right",
          color: "#9aa7bd",
          fontSize: 11,
          formatter: (p) => fmtNumber(Number(p.value)),
        },
      },
    ],
  };

  function downloadLayer() {
    const layer = { ...data, _summary: undefined };
    delete (layer as { _summary?: unknown })._summary;
    const blob = new Blob([JSON.stringify(layer, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attack-navigator-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">MITRE ATT&CK</h1>
          <p className="text-sm text-text-secondary">
            최근 {data._summary.days}일 탐지 결과를 ATT&CK 기술별로 매핑
          </p>
        </div>
        <button
          onClick={downloadLayer}
          className="shrink-0 self-start whitespace-nowrap rounded-md bg-brand px-3 py-2 text-sm font-medium text-base hover:opacity-90"
        >
          Navigator JSON 다운로드
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard
          label="매핑된 알람"
          value={fmtNumber(data._summary.alerts_count)}
          hint={`최근 ${data._summary.days}일`}
        />
        <KpiCard
          label="탐지된 기술"
          value={fmtNumber(data._summary.techniques_count)}
          hint="MITRE ATT&CK techniques"
        />
        <KpiCard
          label="최고 Verdict"
          value={data._summary.top_techniques[0]?.max_verdict ?? "-"}
          tone={
            data._summary.top_techniques[0]?.max_verdict === "Critical" ? "crit" : "warn"
          }
          hint={data._summary.top_techniques[0]?.id ?? ""}
        />
      </div>

      <Card title="Top ATT&CK 기술" subtitle="탐지 빈도 순">
        <Chart option={barOption} height={Math.max(220, top.length * 40 + 60)} />
      </Card>

      <AttackMatrix
        detected={data.techniques.reduce<DetectionMap>((acc, t) => {
          acc[t.techniqueID] = { score: t.score, color: t.color, comment: t.comment };
          return acc;
        }, {})}
      />

      <Card
        title="Navigator JSON 사용법"
        subtitle="다운로드한 JSON 을 MITRE Navigator 에 import"
      >
        <ol className="list-inside list-decimal space-y-1 text-sm text-text-secondary">
          <li>
            <a
              href="https://mitre-attack.github.io/attack-navigator/"
              target="_blank"
              rel="noreferrer"
              className="text-info hover:underline"
            >
              MITRE ATT&CK Navigator
            </a>{" "}
            접속
          </li>
          <li>"Open Existing Layer" → "Upload from local" 선택</li>
          <li>위 버튼으로 받은 JSON 파일 업로드</li>
          <li>매트릭스 위에 탐지 결과가 색상으로 표시됨</li>
        </ol>
      </Card>

      <Card title="전체 기술 목록">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-left font-medium">기술 ID</th>
                <th className="px-4 py-2 text-left font-medium">점수</th>
                <th className="px-4 py-2 text-left font-medium">설명</th>
              </tr>
            </thead>
            <tbody>
              {data.techniques.map((t) => (
                <tr key={t.techniqueID} className="border-t border-subtle">
                  <td className="px-4 py-2 font-mono text-brand">{t.techniqueID}</td>
                  <td className="px-4 py-2 font-mono tabular-nums text-text-primary">
                    {fmtNumber(t.score)}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{t.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
