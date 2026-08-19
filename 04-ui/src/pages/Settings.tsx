import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { getStatus } from "@/lib/api";

export default function Settings() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["status"],
    queryFn: getStatus,
    refetchInterval: 15_000,
  });

  if (isLoading) return <div className="text-sm text-text-secondary">불러오는 중…</div>;
  if (isError || !data) {
    return (
      <Card title="연결 실패">
        <p className="text-sm text-crit">/api/status 응답 없음.</p>
      </Card>
    );
  }

  const xdr = data.xdr;
  const toggles = [
    {
      key: "AUTO_BAN_ENABLED",
      label: "Auto Ban",
      desc: "위험점수 ≥ threshold IP 를 fail2ban-client 로 자동 차단",
      enabled: xdr.auto_ban.enabled,
      extra: `threshold ${xdr.auto_ban.threshold}`,
    },
    {
      key: "MISP_ENABLED",
      label: "MISP 위협 인텔",
      desc: "탐지 IP·도메인을 MISP 에 IOC 질의",
      enabled: xdr.misp.enabled,
      extra: xdr.misp.url || "URL 미설정",
    },
    {
      key: "SHUFFLE_ENABLED",
      label: "Shuffle SOAR",
      desc: "탐지 발생 시 Shuffle 워크플로 webhook 트리거",
      enabled: xdr.shuffle.enabled,
      extra: xdr.shuffle.webhook_set ? "webhook 설정됨" : "webhook 미설정",
    },
    {
      key: "THEHIVE_ENABLED",
      label: "TheHive 케이스",
      desc: "탐지 발생 시 TheHive 에 사고 케이스 자동 생성",
      enabled: xdr.thehive.enabled,
      extra: xdr.thehive.public_url,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">설정</h1>
        <p className="text-sm text-text-secondary">
          /api/status 에서 읽어오는 실시간 토글 상태 (읽기 전용)
        </p>
      </div>

      <Card title="XDR 토글" subtitle="root .env 의 ENABLED 플래그 4종">
        <div className="divide-y divide-subtle">
          {toggles.map((t) => (
            <div key={t.key} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {t.label}
                  </span>
                  <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                    {t.key}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-secondary">{t.desc}</p>
                <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                  {t.extra}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  t.enabled
                    ? "border-ok/30 bg-ok/10 text-ok"
                    : "border-subtle bg-elevated text-text-secondary"
                }`}
              >
                {t.enabled ? "ON" : "OFF"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          토글을 ON/OFF 하려면 SIEM-Trinity 의 .env 를 수정하고 detection-api 를 재시작해야 합니다.
          UI 에서 직접 토글하는 기능은 SIEM-Trinity 에 `PATCH /api/config/toggles` 추가 후 가능.
        </p>
      </Card>

      <Card title="스케줄러" subtitle="APScheduler 30분 주기">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="실행중" value={data.is_running ? "예" : "아니오"} />
          <Stat label="마지막 실행" value={data.last_run ?? "-"} />
          <Stat label="다음 실행" value={data.next_run ?? "-"} />
          <Stat label="주기 (분)" value={String(data.schedule_interval_minutes)} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-subtle bg-elevated px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-text-primary">{value}</div>
    </div>
  );
}
