import { useQueries } from "@tanstack/react-query";
import Card from "./Card";
import Chart from "./Chart";
import { lokiRange, promRange } from "@/lib/api";
import type { EChartsOption } from "echarts";

export type Series = {
  name: string;
  expr: string;
  source: "loki" | "prom";
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  series: Series[];
  minutes?: number;
  step?: number;
  height?: number;
};

export default function TimeSeriesCard({
  title,
  subtitle,
  series,
  minutes = 60,
  step = 60,
  height = 260,
}: Props) {
  const results = useQueries({
    queries: series.map((s) => ({
      queryKey: ["ts", s.source, s.expr, minutes, step],
      queryFn: () =>
        s.source === "loki"
          ? lokiRange(s.expr, minutes, step)
          : promRange(s.expr, minutes, step),
      refetchInterval: 30_000,
    })),
  });

  const ecSeries = series.map((s, i) => {
    const r = results[i].data;
    const pts = (r?.series?.[0]?.points ?? []) as [number, number][];
    return {
      name: s.name,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.08 },
      ...(s.color ? { itemStyle: { color: s.color }, lineStyle: { width: 2, color: s.color } } : {}),
      data: pts.map(([t, v]) => [t * 1000, v]),
    };
  });

  const option: EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, textStyle: { color: "#9aa7bd", fontSize: 11 } },
    grid: { left: 40, right: 16, top: 16, bottom: 36 },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#23304a" } },
      axisLabel: { color: "#9aa7bd", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#23304a" } },
      axisLabel: { color: "#9aa7bd" },
    },
    series: ecSeries,
  };

  return (
    <Card title={title} subtitle={subtitle}>
      <Chart option={option} height={height} />
    </Card>
  );
}
