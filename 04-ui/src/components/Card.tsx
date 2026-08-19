import type { ReactNode } from "react";

type Props = {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Card({ title, subtitle, right, children, className }: Props) {
  return (
    <section
      className={`rounded-card border border-subtle bg-surface p-4 ${className ?? ""}`}
    >
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between">
          <div>
            {title && (
              <h3 className="text-sm font-medium text-text-primary">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
