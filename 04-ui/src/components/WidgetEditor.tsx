import { useState } from "react";
import { X } from "lucide-react";
import type { WidgetConfig, WidgetType } from "@/lib/widgets";

type Props = {
  initial?: WidgetConfig;
  onSave: (cfg: WidgetConfig) => void;
  onClose: () => void;
};

const TYPE_LABEL: Record<WidgetType, string> = {
  resource: "시스템 리소스 (CPU/메모리/디스크)",
  network: "네트워크 정보 (공인IP/인터페이스)",
  storage: "스토리지 (파일시스템·inode)",
  ports: "Listen 포트",
  sensors: "센서 (온도·팬·전력)",
  xdr_toggles: "XDR 토글 배지 (4종 ON/OFF)",
  thehive_kpi: "TheHive 미해결 케이스",
  uptime: "가동 시간 (uptime)",
  metric: "메트릭 카드 (단일 값)",
  gauge: "게이지 (0-100%)",
  timeseries: "시계열 차트",
  topk: "Top-K 표",
  log: "로그 스트림",
};

const TEMPLATES: Record<WidgetType, WidgetConfig> = {
  metric: {
    type: "metric",
    data: { label: "새 메트릭", source: "loki", expr: `sum(count_over_time({job="auth"} [5m]))` },
  },
  gauge: {
    type: "gauge",
    data: {
      label: "게이지",
      expr: `100 * (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}))`,
    },
  },
  timeseries: {
    type: "timeseries",
    data: {
      title: "새 시계열",
      minutes: 60,
      step: 300,
      series: [
        { name: "series1", source: "loki", expr: `sum(count_over_time({job="auth"} [5m]))`, color: "#a78bfa" },
      ],
    },
  },
  topk: {
    type: "topk",
    data: {
      title: "Top K",
      expr: `topk(10, sum by (src_ip) (count_over_time({job="auth"} |= "Invalid user" [24h])))`,
      labelKey: "src_ip",
      labelHeader: "IP",
    },
  },
  log: {
    type: "log",
    data: { title: "로그", query: `{job="auth"}`, minutes: 15, limit: 20 },
  },
  resource: { type: "resource", data: { kind: "cpu" } },
  network: { type: "network", data: {} },
  storage: { type: "storage", data: {} },
  ports: { type: "ports", data: {} },
  sensors: { type: "sensors", data: {} },
  xdr_toggles: { type: "xdr_toggles", data: {} },
  thehive_kpi: { type: "thehive_kpi", data: {} },
  uptime: { type: "uptime", data: {} },
};

export default function WidgetEditor({ initial, onSave, onClose }: Props) {
  const [config, setConfig] = useState<WidgetConfig>(initial ?? TEMPLATES.metric);

  function changeType(t: WidgetType) {
    setConfig(TEMPLATES[t]);
  }

  function update<T extends WidgetConfig>(updater: (prev: T) => T) {
    setConfig((c) => updater(c as T) as WidgetConfig);
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-card border border-subtle bg-surface p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {initial ? "위젯 편집" : "새 위젯 추가"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-text-secondary">종류</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_LABEL) as WidgetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => changeType(t)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    config.type === t
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-subtle bg-elevated text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 종류별 폼 */}
          {config.type === "metric" && (
            <>
              <FormField label="라벨">
                <input
                  value={config.data.label}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, label: e.target.value } }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="데이터 소스">
                <select
                  value={config.data.source}
                  onChange={(e) =>
                    update<typeof config>((c) => ({
                      ...c,
                      data: { ...c.data, source: e.target.value as "prom" | "loki" },
                    }))
                  }
                  className={inputCls}
                >
                  <option value="loki">Loki (LogQL)</option>
                  <option value="prom">Prometheus (PromQL)</option>
                </select>
              </FormField>
              <FormField label="쿼리">
                <textarea
                  rows={2}
                  value={config.data.expr}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, expr: e.target.value } }))}
                  className={`${inputCls} font-mono`}
                />
              </FormField>
              <FormField label="단위 (선택)">
                <input
                  value={config.data.unit ?? ""}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, unit: e.target.value } }))}
                  className={inputCls}
                  placeholder="% 또는 건"
                />
              </FormField>
            </>
          )}

          {config.type === "gauge" && (
            <>
              <FormField label="라벨">
                <input
                  value={config.data.label}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, label: e.target.value } }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="PromQL (0-100)">
                <textarea
                  rows={2}
                  value={config.data.expr}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, expr: e.target.value } }))}
                  className={`${inputCls} font-mono`}
                />
              </FormField>
            </>
          )}

          {config.type === "timeseries" && (
            <>
              <FormField label="제목">
                <input
                  value={config.data.title}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, title: e.target.value } }))}
                  className={inputCls}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="범위(분)">
                  <input
                    type="number"
                    value={config.data.minutes}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, minutes: Number(e.target.value) || 60 },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
                <FormField label="bucket(초)">
                  <input
                    type="number"
                    value={config.data.step}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, step: Number(e.target.value) || 300 },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
              </div>
              <FormField label="시리즈 (JSON)">
                <textarea
                  rows={5}
                  value={JSON.stringify(config.data.series, null, 2)}
                  onChange={(e) => {
                    try {
                      const arr = JSON.parse(e.target.value);
                      if (Array.isArray(arr)) {
                        update<typeof config>((c) => ({ ...c, data: { ...c.data, series: arr } }));
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                  className={`${inputCls} font-mono`}
                />
              </FormField>
            </>
          )}

          {config.type === "topk" && (
            <>
              <FormField label="제목">
                <input
                  value={config.data.title}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, title: e.target.value } }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="LogQL (topk(N, sum by (label) ...))">
                <textarea
                  rows={2}
                  value={config.data.expr}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, expr: e.target.value } }))}
                  className={`${inputCls} font-mono`}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="그룹 라벨 key">
                  <input
                    value={config.data.labelKey}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, labelKey: e.target.value },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
                <FormField label="컬럼 헤더">
                  <input
                    value={config.data.labelHeader}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, labelHeader: e.target.value },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
              </div>
            </>
          )}

          {config.type === "resource" && (
            <FormField label="리소스 종류">
              <select
                value={config.data.kind}
                onChange={(e) =>
                  update<typeof config>((c) => ({
                    ...c,
                    data: { kind: e.target.value as "cpu" | "memory" | "disk" },
                  }))
                }
                className={inputCls}
              >
                <option value="cpu">CPU</option>
                <option value="memory">메모리</option>
                <option value="disk">디스크 /</option>
              </select>
            </FormField>
          )}

          {config.type === "log" && (
            <>
              <FormField label="제목">
                <input
                  value={config.data.title}
                  onChange={(e) => update<typeof config>((c) => ({ ...c, data: { ...c.data, title: e.target.value } }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="LogQL">
                <textarea
                  rows={2}
                  value={config.data.query}
                  onChange={(e) =>
                    update<typeof config>((c) => ({ ...c, data: { ...c.data, query: e.target.value } }))
                  }
                  className={`${inputCls} font-mono`}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="범위(분)">
                  <input
                    type="number"
                    value={config.data.minutes}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, minutes: Number(e.target.value) || 15 },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
                <FormField label="최대 건수">
                  <input
                    type="number"
                    value={config.data.limit}
                    onChange={(e) =>
                      update<typeof config>((c) => ({
                        ...c,
                        data: { ...c.data, limit: Number(e.target.value) || 20 },
                      }))
                    }
                    className={inputCls}
                  />
                </FormField>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-subtle px-3 py-1.5 text-xs text-text-secondary hover:bg-elevated"
          >
            취소
          </button>
          <button
            onClick={() => onSave(config)}
            className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-base hover:opacity-90"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-subtle bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-text-secondary">{label}</div>
      {children}
    </label>
  );
}
