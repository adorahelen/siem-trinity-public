import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  Target,
  Brain,
  ScrollText,
  Folder,
  Globe,
  Workflow,
  ShieldAlert,
  Settings as SettingsIcon,
  Cpu,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type Item = { to: string; label: string; icon: ReactNode };
type Group = { heading?: string; items: Item[] };

const GROUPS: Group[] = [
  {
    items: [{ to: "/", label: "Overview", icon: <LayoutDashboard size={18} /> }],
  },
  {
    heading: "수집",
    items: [{ to: "/logs", label: "로그", icon: <ScrollText size={18} /> }],
  },
  {
    heading: "탐지",
    items: [
      { to: "/alerts", label: "알람", icon: <Bell size={18} /> },
      { to: "/detector", label: "AI 탐지", icon: <Cpu size={18} /> },
      { to: "/attack", label: "ATT&CK", icon: <Target size={18} /> },
    ],
  },
  {
    heading: "분석",
    items: [
      { to: "/analyzer", label: "AI 분석", icon: <Sparkles size={18} /> },
      { to: "/llm", label: "LLM 채팅", icon: <Brain size={18} /> },
    ],
  },
  {
    heading: "대응",
    items: [
      { to: "/cases", label: "케이스", icon: <Folder size={18} /> },
      { to: "/intel", label: "위협 인텔", icon: <Globe size={18} /> },
      { to: "/workflows", label: "워크플로", icon: <Workflow size={18} /> },
      { to: "/actions", label: "능동대응", icon: <ShieldAlert size={18} /> },
    ],
  },
  {
    heading: "시스템",
    items: [
      { to: "/settings", label: "설정", icon: <SettingsIcon size={18} /> },
    ],
  },
];

export default function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // 라우트 변경 시 모바일 사이드바 자동 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      {/* 모바일 오버레이 배경 */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 shrink-0 overflow-y-auto border-r border-subtle bg-surface px-3 py-4 transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-4">
          <div className="text-lg font-semibold tracking-tight text-text-primary">
            Trinity<span className="text-brand">SOC</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-text-secondary hover:bg-elevated md:hidden"
            aria-label="사이드바 닫기"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-4">
          {GROUPS.map((g, i) => (
            <div key={i}>
              {g.heading && (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70">
                  {g.heading}
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-elevated text-text-primary"
                          : "text-text-secondary hover:bg-elevated hover:text-text-primary"
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col overflow-auto">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-subtle bg-surface px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-text-secondary hover:bg-elevated md:hidden"
              aria-label="사이드바 열기"
            >
              <Menu size={20} />
            </button>
            <div className="text-sm text-text-secondary">SIEM-Trinity 통합 콘솔</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              <span>online</span>
            </span>
          </div>
        </header>
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
