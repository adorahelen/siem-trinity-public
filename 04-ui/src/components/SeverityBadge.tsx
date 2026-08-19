import { SEVERITY_LABEL, SEVERITY_TONE, type Severity } from "@/lib/format";

export default function SeverityBadge({ level }: { level: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[level]}`}
    >
      {SEVERITY_LABEL[level]}
    </span>
  );
}
