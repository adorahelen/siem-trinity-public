import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Card from "@/components/Card";
import SeverityBadge from "@/components/SeverityBadge";
import { fmtRelative } from "@/lib/format";
import {
  getAlerts,
  verdictToSeverity,
  actionCreateCase,
  actionBanIp,
  intelLookup,
  type RawAlert,
  type IntelLookup,
} from "@/lib/api";

export default function Alerts() {
  const [page, setPage] = useState(1);
  const limit = 50;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["alerts", page],
    queryFn: () => getAlerts({ page, limit }),
    refetchInterval: 30_000,
  });

  const [selected, setSelected] = useState<RawAlert | null>(null);

  if (isLoading) {
    return <div className="text-sm text-text-secondary">불러오는 중…</div>;
  }
  if (isError || !data) {
    return (
      <Card title="연결 실패">
        <p className="text-sm text-crit">/api/alerts 응답 없음.</p>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">알람</h1>
          <p className="text-sm text-text-secondary">
            전체 {data.total.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm text-text-primary disabled:opacity-30 hover:bg-elevated"
          >
            이전
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm text-text-primary disabled:opacity-30 hover:bg-elevated"
          >
            다음
          </button>
        </div>
      </div>

      {/* 데스크탑: 7열 테이블 */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-left font-medium">시간</th>
                <th className="px-4 py-2 text-left font-medium">심각도</th>
                <th className="px-4 py-2 text-left font-medium">점수</th>
                <th className="px-4 py-2 text-left font-medium">IP</th>
                <th className="px-4 py-2 text-left font-medium">탐지기</th>
                <th className="px-4 py-2 text-left font-medium">ATT&CK</th>
                <th className="px-4 py-2 text-left font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((a, idx) => {
                const sev = verdictToSeverity(a.verdict);
                const ip = a.ip || a.src_ip || a.dst_ip || a.domain || "-";
                return (
                  <tr
                    key={idx}
                    onClick={() => setSelected(a)}
                    className="cursor-pointer border-t border-subtle transition-colors hover:bg-elevated"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                      {fmtRelative(a.timestamp.replace(" ", "T"))}
                    </td>
                    <td className="px-4 py-2">
                      <SeverityBadge level={sev} />
                    </td>
                    <td className="px-4 py-2 font-mono tabular-nums text-text-primary">
                      {a.score ?? "-"}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-primary">{ip}</td>
                    <td className="px-4 py-2 text-text-secondary">{a.detector}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(a.attack ?? []).map((t, i) => (
                          <span
                            key={i}
                            className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-brand"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="max-w-md truncate px-4 py-2 text-text-primary">
                      {a.message || a.reason || a.verdict}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 모바일: 카드 리스트 (progressive disclosure) */}
      <div className="space-y-2 md:hidden">
        {data.alerts.map((a, idx) => {
          const sev = verdictToSeverity(a.verdict);
          const ip = a.ip || a.src_ip || a.dst_ip || a.domain || "-";
          return (
            <button
              key={idx}
              onClick={() => setSelected(a)}
              className="block w-full rounded-card border border-subtle bg-surface px-3 py-2.5 text-left transition-colors hover:bg-elevated"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge level={sev} />
                  <span className="font-mono text-sm text-text-primary">{ip}</span>
                </div>
                <span className="shrink-0 text-xs text-text-secondary">
                  {fmtRelative(a.timestamp.replace(" ", "T"))}
                </span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
                {a.message || a.reason || a.verdict}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-text-secondary">
                  {a.detector} · 점수 {a.score ?? "-"}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {(a.attack ?? []).slice(0, 3).map((t, i) => (
                    <span
                      key={i}
                      className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-brand"
                    >
                      {t}
                    </span>
                  ))}
                  {(a.attack ?? []).length > 3 && (
                    <span className="text-text-secondary">+{(a.attack ?? []).length - 3}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && <AlertModal alert={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AlertModal({ alert, onClose }: { alert: RawAlert; onClose: () => void }) {
  const sev = verdictToSeverity(alert.verdict);
  const ip = alert.ip || alert.src_ip || alert.dst_ip || alert.domain || "-";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-card border border-subtle bg-surface p-6"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-text-secondary">{alert.timestamp}</div>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">
              {alert.message || alert.verdict}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
              <SeverityBadge level={sev} />
              {alert.score != null && <span>점수 {alert.score}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-subtle px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            닫기
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="IP" value={<span className="font-mono">{ip}</span>} />
          <Field label="탐지기" value={alert.detector} />
          <Field label="판정" value={alert.verdict} />
          <Field label="액션" value={alert.action ?? "-"} />
        </dl>

        {alert.attack && alert.attack.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-text-secondary">MITRE ATT&CK</div>
            <div className="flex flex-wrap gap-2">
              {alert.attack.map((t, i) => (
                <span
                  key={i}
                  className="rounded-md border border-brand/30 bg-brand/10 px-2 py-1 font-mono text-xs text-brand"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {alert.signals && (
          <div className="mt-4">
            <div className="mb-1 text-xs text-text-secondary">Signals</div>
            <pre className="overflow-auto rounded-md border border-subtle bg-elevated p-3 font-mono text-[11px] text-text-primary">
              {JSON.stringify(alert.signals, null, 2)}
            </pre>
          </div>
        )}

        {alert.reason && (
          <p className="mt-3 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
            {alert.reason}
          </p>
        )}

        <ActionButtons alert={alert} ip={ip} />
      </div>
    </div>
  );
}

function ActionButtons({ alert, ip }: { alert: RawAlert; ip: string }) {
  const sev = verdictToSeverity(alert.verdict);
  const severityNum = sev === "critical" ? 4 : sev === "high" ? 3 : sev === "medium" ? 2 : 1;

  const caseM = useMutation({
    mutationFn: () =>
      actionCreateCase({
        title: `[${alert.verdict}] ${alert.detector} ${ip}`,
        description: alert.message || alert.reason || "manual case from TrinitySOC",
        severity: severityNum,
        tags: alert.attack ?? [],
      }),
  });
  const banM = useMutation({
    mutationFn: () =>
      actionBanIp({
        ip,
        score: alert.score ?? 95,
        signals: (alert.signals as Record<string, unknown>) ?? {},
      }),
  });
  const intelM = useMutation<IntelLookup>({
    mutationFn: () => intelLookup(ip),
  });

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => caseM.mutate()}
          disabled={caseM.isPending || ip === "-"}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-base hover:opacity-90 disabled:opacity-50"
        >
          {caseM.isPending ? "생성 중…" : "TheHive 케이스 생성"}
        </button>
        <button
          onClick={() => intelM.mutate()}
          disabled={intelM.isPending || ip === "-"}
          className="rounded-md border border-subtle px-3 py-1.5 text-sm text-text-primary hover:bg-elevated disabled:opacity-50"
        >
          {intelM.isPending ? "조회 중…" : "MISP 조회"}
        </button>
        <button
          onClick={() => {
            if (confirm(`정말 ${ip} 를 fail2ban 으로 차단할까요?`)) banM.mutate();
          }}
          disabled={banM.isPending || ip === "-"}
          className="rounded-md border border-crit/40 px-3 py-1.5 text-sm text-crit hover:bg-crit/10 disabled:opacity-50"
        >
          {banM.isPending ? "차단 중…" : "IP 차단"}
        </button>
      </div>

      {caseM.data && (
        <ResultBox tone={caseM.data.created ? "ok" : "warn"}>
          {caseM.data.created
            ? `케이스 생성 완료 (ID: ${caseM.data.case_id ?? "-"})`
            : `생성 실패: ${caseM.data.reason ?? JSON.stringify(caseM.data).slice(0, 200)}`}
        </ResultBox>
      )}
      {banM.data && (
        <ResultBox tone={String(banM.data.action) === "banned" ? "crit" : "warn"}>
          {String(banM.data.action ?? "")}: {String(banM.data.reason ?? "")}
        </ResultBox>
      )}
      {intelM.data && (
        <ResultBox tone={intelM.data.hit ? "crit" : "ok"}>
          {intelM.data.hit
            ? `MISP HIT — ${intelM.data.events}개 이벤트 (${intelM.data.categories.join(", ")})`
            : "MISP 매칭 없음 (등록된 IOC 아님)"}
        </ResultBox>
      )}
      {(caseM.isError || banM.isError || intelM.isError) && (
        <ResultBox tone="crit">
          요청 실패. 토글이 OFF 이거나 인증키가 없을 수 있습니다.
        </ResultBox>
      )}
    </div>
  );
}

function ResultBox({ tone, children }: { tone: "ok" | "warn" | "crit"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-ok/40 bg-ok/10 text-ok"
      : tone === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-crit/40 bg-crit/10 text-crit";
  return <div className={`rounded-md border px-3 py-2 text-xs ${cls}`}>{children}</div>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-subtle bg-elevated px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-text-primary">{value}</div>
    </div>
  );
}
