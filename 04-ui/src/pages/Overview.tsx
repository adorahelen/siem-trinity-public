import { useState } from "react";
import { Shield, Server } from "lucide-react";
import DashboardGrid from "@/components/DashboardGrid";
import type { DashboardTab } from "@/lib/widgets";

const TABS: { key: DashboardTab; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    key: "security",
    label: "보안",
    icon: <Shield size={14} />,
    hint: "탐지·차단·인텔",
  },
  {
    key: "infrastructure",
    label: "인프라",
    icon: <Server size={14} />,
    hint: "CPU·메모리·디스크·네트워크",
  },
];

export default function Overview() {
  const [tab, setTab] = useState<DashboardTab>("security");

  return (
    <div>
      <div className="mb-4 flex items-end justify-between border-b border-subtle">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                <span className="text-[10px] text-text-secondary">· {t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DashboardGrid tab={tab} />
    </div>
  );
}
