import type { AppRegistryEntry } from "../registry/apps";
import { recordAppOpen } from "../lib/recentApps";
import { iconFor } from "../lib/icons";

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
      className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg"
    >
      <span className="rounded-lg bg-accent/10 p-2.5 text-accent transition group-hover:scale-110">
        <Icon size={22} />
      </span>
      <div>
        <p className="font-medium text-text">{app.name}</p>
        <p className="text-xs uppercase tracking-wide text-text-muted">{app.department}</p>
      </div>
      {app.description && <p className="text-sm text-text-muted">{app.description}</p>}
    </button>
  );
}
