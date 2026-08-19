import { useQuery } from "@tanstack/react-query";
import { promInstant } from "@/lib/api";
import Chart from "./Chart";
import type { EChartsOption } from "echarts";

type Props = {
  label: string;
  expr: string;
  unit?: string;
  refetchMs?: number;
};

export default function GaugeCard({ label, expr, unit = "%", refetchMs = 30_000 }: Props) {
  const { data } = useQuery({
    queryKey: ["gauge", expr],
    queryFn: () => promInstant(expr),
    refetchInterval: refetchMs,
  });

  const v = data?.value ?? 0;
  const option: EChartsOption = {
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        radius: "85%",
        progress: { show: true, width: 10 },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.6, "#34d399"],
              [0.85, "#fbbf24"],
              [1, "#f87171"],
            ],
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          formatter: `{value}${unit}`,
          fontSize: 18,
          color: "#e6edf7",
          offsetCenter: [0, "0%"],
        },
        title: {
          fontSize: 10,
          color: "#9aa7bd",
          offsetCenter: [0, "50%"],
        },
        data: [{ value: Number(v.toFixed(1)), name: label }],
      },
    ],
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-card border border-subtle bg-surface">
      <Chart option={option} height="100%" />
    </div>
  );
}
