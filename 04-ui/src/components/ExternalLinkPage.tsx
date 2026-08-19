import { ExternalLink } from "lucide-react";
import Card from "./Card";

type Props = {
  title: string;
  description: string;
  url: string;
  service: string;
  upcoming: string[];
  apiHint?: string;
  credentials?: { label: string; value: string }[];
};

export default function ExternalLinkPage({
  title,
  description,
  url,
  service,
  upcoming,
  apiHint,
  credentials,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>

      <Card title={`${service} 외부 UI`} subtitle="현재는 원본 도구로 이동">
        <p className="text-sm text-text-secondary">
          이 페이지의 데이터는 추후 TrinitySOC 안에 직접 임베드될 예정입니다. 현재는{" "}
          {service} 의 자체 UI 로 이동해 사용하세요.
        </p>

        {credentials && credentials.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {credentials.map((c) => (
              <div
                key={c.label}
                className="rounded-md border border-subtle bg-elevated px-3 py-2"
              >
                <dt className="text-text-secondary">{c.label}</dt>
                <dd className="mt-0.5 font-mono text-text-primary">{c.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-base hover:opacity-90"
        >
          {service} 열기 <ExternalLink size={14} />
        </a>
        <p className="mt-2 font-mono text-[11px] text-text-secondary">{url}</p>
      </Card>

      <Card title="구현 예정 기능">
        <ul className="list-inside list-disc space-y-1 text-sm text-text-secondary">
          {upcoming.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {apiHint && (
          <p className="mt-4 text-xs text-text-secondary">
            필요 API: <span className="font-mono text-info">{apiHint}</span>
          </p>
        )}
      </Card>
    </div>
  );
}
