import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Card from "@/components/Card";
import { intelLookup, type IntelLookup } from "@/lib/api";

export default function Intel() {
  const [ip, setIp] = useState("");
  const [result, setResult] = useState<IntelLookup | null>(null);
  const lookup = useMutation({
    mutationFn: (q: string) => intelLookup(q),
    onSuccess: (r) => setResult(r),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) return;
    lookup.mutate(ip.trim());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">위협 인텔리전스</h1>
        <p className="text-sm text-text-secondary">
          IOC (Indicator of Compromise) 조회 — IP·도메인의 외부 평판
        </p>
      </div>

      <Card title="MISP IOC 조회" subtitle="MISP 의 attributes/restSearch 프록시">
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="IP 또는 도메인"
            className="flex-1 rounded-md border border-subtle bg-elevated px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={lookup.isPending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-base hover:opacity-90 disabled:opacity-50"
          >
            {lookup.isPending ? "조회 중…" : "조회"}
          </button>
        </form>
        {lookup.isError && (
          <p className="mt-3 text-sm text-crit">
            조회 실패. MISP_ENABLED=true 이고 MISP_API_KEY 가 설정되어야 합니다.
          </p>
        )}
      </Card>

      {result && (
        <Card title="결과" subtitle={result.ip}>
          {result.hit ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="rounded-md border border-crit/40 bg-crit/10 px-3 py-1 text-sm font-medium text-crit">
                  매칭됨
                </span>
                <span className="text-sm text-text-secondary">
                  {result.events}개 MISP 이벤트에서 발견
                </span>
              </div>

              {result.categories.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs text-text-secondary">카테고리</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.categories.map((c, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-subtle bg-elevated px-2 py-1 text-xs text-text-primary"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.tags.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs text-text-secondary">태그</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.map((t, i) => (
                      <span
                        key={i}
                        className="rounded border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[11px] text-brand"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-ok/40 bg-ok/10 px-3 py-1 text-sm font-medium text-ok">
                매칭 없음
              </span>
              <span className="text-sm text-text-secondary">
                MISP IOC 데이터베이스에 등록된 위협이 아닙니다.
              </span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
