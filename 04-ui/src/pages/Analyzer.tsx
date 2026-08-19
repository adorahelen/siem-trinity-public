import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import Card from "@/components/Card";
import SeverityBadge from "@/components/SeverityBadge";
import {
  getAlerts,
  llmHealth,
  llmAnalyzeAlert,
  verdictToSeverity,
  type RawAlert,
} from "@/lib/api";
import { fmtRelative } from "@/lib/format";

export default function Analyzer() {
  const health = useQuery({
    queryKey: ["llm-health"],
    queryFn: llmHealth,
    refetchInterval: 15_000,
  });
  const alerts = useQuery({
    queryKey: ["analyzer-alerts"],
    queryFn: () => getAlerts({ limit: 50 }),
    refetchInterval: 30_000,
  });

  const [selected, setSelected] = useState<RawAlert | null>(null);

  const analyze = useMutation({
    mutationFn: (a: RawAlert) => llmAnalyzeAlert(a),
  });

  function pick(a: RawAlert) {
    setSelected(a);
    analyze.reset();
  }

  function runAnalyze() {
    if (selected) analyze.mutate(selected);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI 분석</h1>
        <p className="text-sm text-text-secondary">
          알람 1건을 선택하면 LLM 이 4섹션 (요약·공격체인·위험평가·권장대응) 으로 분석합니다.
        </p>
      </div>

      {!health.data?.ready && (
        <Card>
          <div className="flex items-start gap-2 text-sm text-warn">
            <AlertTriangle size={16} className="mt-0.5" />
            <div>
              <div className="font-medium">LLM 모델 미설치</div>
              <div className="mt-1 text-xs text-text-secondary">
                gemma4 가 pull 되어 있지 않아 분석 실행 시 실패합니다. LLM 채팅 페이지에서 설치
                안내를 확인하세요.
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 좌: 알람 리스트 */}
        <div className="lg:col-span-2">
          <Card title="최근 알람" subtitle={`${alerts.data?.alerts.length ?? 0}건`} className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              {alerts.data?.alerts.map((a, i) => {
                const ip = a.ip || a.src_ip || a.domain || "-";
                const sev = verdictToSeverity(a.verdict);
                const isSel = selected && selected.timestamp === a.timestamp && ip === (selected.ip || selected.src_ip || selected.domain);
                return (
                  <button
                    key={i}
                    onClick={() => pick(a)}
                    className={`flex w-full flex-col items-start gap-1 border-b border-subtle/30 px-4 py-2.5 text-left transition-colors ${
                      isSel
                        ? "bg-brand/10 border-l-2 border-l-brand"
                        : "hover:bg-elevated"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <SeverityBadge level={sev} />
                      <span className="text-[11px] text-text-secondary">
                        {fmtRelative(a.timestamp.replace(" ", "T"))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-text-primary">{ip}</span>
                      <span className="text-text-secondary">·</span>
                      <span className="text-text-secondary">{a.detector}</span>
                    </div>
                    <div className="line-clamp-1 text-xs text-text-secondary">
                      {a.message || a.reason || a.verdict}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* 우: 분석 결과 */}
        <div className="lg:col-span-3">
          {!selected ? (
            <Card>
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-text-secondary">
                <Sparkles size={28} className="text-brand" />
                <p className="text-sm">왼쪽에서 알람을 선택하세요.</p>
              </div>
            </Card>
          ) : (
            <Card
              title={selected.message || selected.verdict}
              subtitle={`${selected.detector} · ${selected.ip || selected.src_ip || "-"}`}
              right={
                <button
                  onClick={runAnalyze}
                  disabled={analyze.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-base hover:opacity-90 disabled:opacity-50"
                >
                  {analyze.isPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> 분석 중
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} /> 분석 실행
                    </>
                  )}
                </button>
              }
            >
              <details className="mb-3" open>
                <summary className="cursor-pointer text-xs text-text-secondary hover:text-text-primary">
                  원본 알람 JSON
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-subtle bg-elevated p-3 font-mono text-[11px] text-text-secondary">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </details>

              {analyze.isError && (
                <div className="rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
                  {String(analyze.error)}
                </div>
              )}
              {analyze.data && (
                <div className="rounded-md border border-subtle bg-base p-4 text-sm">
                  <div className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
                    <Sparkles size={10} className="text-brand" /> LLM 분석 ({analyze.data.model})
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-text-primary">
                    {analyze.data.analysis}
                  </div>
                </div>
              )}
              {!analyze.data && !analyze.isError && !analyze.isPending && (
                <p className="text-sm text-text-secondary">
                  "분석 실행" 을 누르면 LLM 이 이 알람을 4섹션으로 분석합니다.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
