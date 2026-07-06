import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function AppShell({
  title,
  actions,
  children,
  hubHref = "/",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  hubHref?: string;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <a
            href={hubHref}
            className="flex items-center gap-1.5 text-sm text-text-muted transition hover:text-text"
          >
            <ArrowLeft size={16} />
            Central Hub
          </a>
          <span className="text-border">/</span>
          <h1 className="text-sm font-medium text-text">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
