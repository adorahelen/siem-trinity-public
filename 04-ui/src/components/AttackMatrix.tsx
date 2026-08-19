import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Card from "./Card";
import Chart from "./Chart";
import catalogRaw from "@/data/attack-catalog.json";
import type { EChartsOption } from "echarts";

type Tactic = { shortname: string; name: string };
type Tech = { id: string; name: string; tactics: string[]; parent: string | null };

const catalog = catalogRaw as { version: string; tactics: Tactic[]; techniques: Tech[] };

export type Detection = { score: number; color: string; comment?: string };
export type DetectionMap = Record<string, Detection>;

type Props = { detected: DetectionMap };

export default function AttackMatrix({ detected }: Props) {
  const baseTechs = catalog.techniques.filter((t) => !t.parent);
  const detectedIds = new Set(Object.keys(detected));

  // 부모 또는 자식 중 하나라도 탐지된 base 기법
  const isCovered = (t: Tech) =>
    detectedIds.has(t.id) ||
    catalog.techniques.some((c) => c.parent === t.id && detectedIds.has(c.id));

  // tactic 별 그룹 + 통계
  const byTactic = catalog.tactics.map((t) => {
    const techs = baseTechs.filter((tech) => tech.tactics.includes(t.shortname));
    const covered = techs.filter(isCovered);
    return { ...t, techs, covered: covered.length, total: techs.length };
  });

  const baseCovered = baseTechs.filter(isCovered);
  const pct = ((baseCovered.length / baseTechs.length) * 100).toFixed(1);

  // ECharts 레이더 — 15전술 coverage % 한눈에
  const radarOption: EChartsOption = {
    radar: {
      indicator: byTactic.map((t) => ({ name: t.name, max: 100 })),
      radius: "65%",
      splitArea: { show: true, areaStyle: { color: ["#0f1626", "#1b2433"] } },
      axisName: { color: "#9aa7bd", fontSize: 10 },
      splitLine: { lineStyle: { color: "#23304a" } },
      axisLine: { lineStyle: { color: "#23304a" } },
    },
    tooltip: {
      formatter: (params) => {
        const p = params as { value: number[] };
        return byTactic
          .map((t, i) => `${t.name}: ${t.covered}/${t.total} (${p.value[i].toFixed(0)}%)`)
          .join("<br/>");
      },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            name: "탐지 커버리지",
            value: byTactic.map((t) =>
              t.total > 0 ? (t.covered / t.total) * 100 : 0,
            ),
            areaStyle: { color: "rgba(167,139,250,0.25)" },
            lineStyle: { color: "#a78bfa", width: 2 },
            itemStyle: { color: "#a78bfa" },
          },
        ],
      },
    ],
  };

  return (
    <Card
      title="전체 ATT&CK Enterprise 매트릭스"
      subtitle={`커버리지 ${baseCovered.length}/${baseTechs.length} (${pct}%) · v${catalog.version} · 모바일은 전술별 펼침`}
    >
      {/* 공통: 전술별 coverage 레이더 차트 — 모바일·데스크탑 모두 글랜스 뷰 */}
      <div className="mb-4">
        <Chart option={radarOption} height={320} />
      </div>

      {/* 데스크탑 (md+): 15컬럼 가로 그리드 */}
      <div className="hidden overflow-x-auto md:block">
        <div className="flex min-w-max gap-1">
          {byTactic.map((t) => (
            <div key={t.shortname} className="flex w-36 shrink-0 flex-col gap-0.5">
              <div className="sticky top-0 z-10 rounded bg-elevated px-2 py-1.5 text-xs font-semibold text-text-primary">
                {t.name}
                <span className="ml-1 font-normal text-text-secondary">
                  ({t.covered}/{t.total})
                </span>
              </div>
              {t.techs.map((tech) => {
                const direct = detected[tech.id];
                const subHits = catalog.techniques
                  .filter((c) => c.parent === tech.id && detectedIds.has(c.id))
                  .map((c) => detected[c.id]);
                const hit = direct ?? subHits[0];
                const totalScore =
                  (direct?.score ?? 0) + subHits.reduce((s, d) => s + (d?.score ?? 0), 0);
                const cellStyle = hit
                  ? {
                      backgroundColor: hit.color + "33",
                      borderLeft: `3px solid ${hit.color}`,
                    }
                  : undefined;
                return (
                  <div
                    key={tech.id}
                    className={`rounded px-1.5 py-1 text-[10px] leading-tight ${
                      hit ? "" : "bg-base/40 opacity-50"
                    }`}
                    style={cellStyle}
                    title={`${tech.id} ${tech.name}${
                      hit ? ` · ${hit.comment ?? ""}` : " · 미탐지"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-text-secondary">{tech.id}</span>
                      {totalScore > 0 && (
                        <span className="font-mono text-text-primary">×{totalScore}</span>
                      )}
                    </div>
                    <div className="truncate text-text-primary">{tech.name}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 모바일 (<md): 전술 accordion — progressive disclosure */}
      <div className="space-y-1 md:hidden">
        {byTactic.map((t) => (
          <TacticAccordion
            key={t.shortname}
            tactic={t}
            detected={detected}
            detectedIds={detectedIds}
          />
        ))}
      </div>
    </Card>
  );
}

function TacticAccordion({
  tactic,
  detected,
  detectedIds,
}: {
  tactic: Tactic & { techs: Tech[]; covered: number; total: number };
  detected: DetectionMap;
  detectedIds: Set<string>;
}) {
  // 탐지된 게 있으면 기본 펼침
  const [open, setOpen] = useState(tactic.covered > 0);
  return (
    <div className="rounded border border-subtle bg-elevated">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={16} className="text-text-secondary" />
          ) : (
            <ChevronRight size={16} className="text-text-secondary" />
          )}
          <span className="text-sm font-semibold text-text-primary">{tactic.name}</span>
        </span>
        <span
          className={`text-xs font-mono ${
            tactic.covered > 0 ? "text-brand" : "text-text-secondary"
          }`}
        >
          {tactic.covered}/{tactic.total}
        </span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-subtle p-2">
          {tactic.techs.map((tech) => {
            const direct = detected[tech.id];
            const subHits = catalog.techniques
              .filter((c) => c.parent === tech.id && detectedIds.has(c.id))
              .map((c) => detected[c.id]);
            const hit = direct ?? subHits[0];
            const totalScore =
              (direct?.score ?? 0) + subHits.reduce((s, d) => s + (d?.score ?? 0), 0);
            const cellStyle = hit
              ? {
                  backgroundColor: hit.color + "33",
                  borderLeft: `3px solid ${hit.color}`,
                }
              : undefined;
            return (
              <div
                key={tech.id}
                className={`rounded px-2 py-1.5 text-xs ${
                  hit ? "" : "bg-base/40 opacity-60"
                }`}
                style={cellStyle}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-text-secondary">{tech.id}</span>
                  {totalScore > 0 && (
                    <span className="font-mono text-text-primary">×{totalScore}</span>
                  )}
                </div>
                <div className="text-text-primary">{tech.name}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
