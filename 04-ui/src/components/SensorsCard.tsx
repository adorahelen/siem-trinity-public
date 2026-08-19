import { useQuery } from "@tanstack/react-query";
import { Thermometer, Wind, Zap, AlertCircle } from "lucide-react";
import { getSensorsInfo } from "@/lib/api";

export default function SensorsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["sensors"],
    queryFn: getSensorsInfo,
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="h-full w-full rounded-card border border-subtle bg-surface p-4">
        <div className="text-xs text-text-secondary">센서</div>
        <div className="mt-2 text-sm text-text-secondary">…</div>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="flex h-full w-full flex-col rounded-card border border-warn/30 bg-warn/5 p-4">
        <div className="flex items-center gap-1.5 text-xs text-warn">
          <AlertCircle size={12} /> 센서 측정 불가
        </div>
        <div className="mt-2 text-[11px] text-text-secondary">{data.reason}</div>
        <div className="mt-3 space-y-1 text-[11px] text-text-secondary">
          <div className="flex items-center gap-1">
            <Thermometer size={11} /> 온도: VM 은 hwmon 미제공
          </div>
          <div className="flex items-center gap-1">
            <Wind size={11} /> 팬: 동일
          </div>
          <div className="flex items-center gap-1">
            <Zap size={11} /> 전력 (RAPL): VM 은 MSR 미노출
          </div>
        </div>
        <div className="mt-auto text-[10px] text-text-secondary">
          물리 호스트에 배포 시 자동 활성화됩니다.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col rounded-card border border-subtle bg-surface p-4">
      <div className="text-xs text-text-secondary">센서</div>
      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto text-[11px]">
        {data.power.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
              <Zap size={10} /> 전력 (W)
            </div>
            {data.power.map((p) => (
              <div key={p.domain} className="flex justify-between font-mono">
                <span className="text-text-secondary">{p.domain}</span>
                <span className="text-info">{p.watts.toFixed(1)} W</span>
              </div>
            ))}
          </div>
        )}
        {data.temps.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
              <Thermometer size={10} /> 온도
            </div>
            {data.temps.slice(0, 6).map((t, i) => {
              const tone =
                t.celsius >= 80
                  ? "text-crit"
                  : t.celsius >= 65
                    ? "text-warn"
                    : "text-ok";
              return (
                <div key={i} className="flex justify-between font-mono">
                  <span className="text-text-secondary">
                    {t.chip}/{t.label}
                  </span>
                  <span className={tone}>{t.celsius.toFixed(1)} °C</span>
                </div>
              );
            })}
          </div>
        )}
        {data.fans.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
              <Wind size={10} /> 팬 RPM
            </div>
            {data.fans.map((f, i) => (
              <div key={i} className="flex justify-between font-mono">
                <span className="text-text-secondary">
                  {f.chip}/{f.label}
                </span>
                <span className="text-text-primary">{f.rpm}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
