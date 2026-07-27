import type { AppRegistryEntry } from "../registry/apps";
import { recordAppOpen } from "../lib/recentApps";
import { iconFor } from "../lib/icons";
import { deptColorStyle } from "../lib/deptColor";

// Not part of the wire shape (services/auth-gateway/src/apps.ts) — derived
// from id the same way both the server and the old static registry always
// meant it, avoiding a redundant, driftable field.
function appPath(id: string): string {
  return id === "central-hub" ? "/" : `/apps/${id}/`;
}

export function AppCard({ app }: { app: AppRegistryEntry }) {
  const Icon = iconFor(app.icon);

  function handleOpen() {
    recordAppOpen(app.id);
    // Real session cookies (chub_session) travel automatically on any
    // same-origin navigation — no manual cookie-setting needed anymore.
    window.location.href = appPath(app.id);
  }

  return (
    <button
      onClick={handleOpen}
      style={deptColorStyle(app.department)}
      className="group relative flex w-full flex-col items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface p-5 pl-6 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg"
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--dept-color)]" />
      <span className="rounded-lg bg-[var(--dept-color)]/15 p-2.5 text-[var(--dept-color)] transition group-hover:scale-110">
        <Icon size={22} />
      </span>
      <div>
        <p className="font-medium text-text">{app.name}</p>
        <p className="text-xs uppercase tracking-wide text-[var(--dept-color)]">{app.department}</p>
      </div>
      {app.description && <p className="text-sm text-text-muted">{app.description}</p>}
    </button>
  );
}
