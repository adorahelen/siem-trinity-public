export function fmtNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const SEVERITY_TONE: Record<Severity, string> = {
  info: "bg-sev0/10 text-sev0 border-sev0/30",
  low: "bg-sev1/10 text-sev1 border-sev1/30",
  medium: "bg-sev2/10 text-sev2 border-sev2/30",
  high: "bg-sev3/10 text-sev3 border-sev3/30",
  critical: "bg-sev4/10 text-sev4 border-sev4/30",
};
