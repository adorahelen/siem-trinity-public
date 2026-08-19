import { useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type Props = {
  option: EChartsOption;
  height?: number | string;
};

const PALETTE = ["#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#fb923c"];

export default function Chart({ option, height = 280 }: Props) {
  const ref = useRef<ReactECharts>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 컨테이너 크기 변화 → echarts.resize()
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      ref.current?.getEchartsInstance().resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 모바일 (<640px) 에서는 축 라벨/범례 fontSize 살짝 키워서 가독성 확보
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const baseFont = isMobile ? 13 : 12;

  const merged: EChartsOption = {
    color: PALETTE,
    backgroundColor: "transparent",
    textStyle: { color: "#9aa7bd", fontFamily: "Inter", fontSize: baseFont },
    tooltip: {
      backgroundColor: "#1b2433",
      borderColor: "#23304a",
      textStyle: { color: "#e6edf7", fontSize: baseFont },
    },
    legend: { textStyle: { color: "#9aa7bd", fontSize: baseFont } },
    ...option,
  };
  return (
    <div ref={wrapRef} style={{ height, width: "100%" }}>
      <ReactECharts
        ref={ref}
        option={merged}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        lazyUpdate
      />
    </div>
  );
}
