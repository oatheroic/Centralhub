import type { AppRegistryEntry } from "../registry/apps";
import { mockUser, setHandoffCookie } from "../lib/session";

export function AppCard({ app }: { app: AppRegistryEntry }) {
  const Icon = app.icon;

  function handleOpen() {
    setHandoffCookie(mockUser);
    window.location.href = app.path;
  }

  return (
    <button
      onClick={handleOpen}
      className="group flex flex-col items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-950"
    >
      <span className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-400 transition group-hover:scale-110">
        <Icon size={22} />
      </span>
      <div>
        <p className="font-medium text-slate-100">{app.name}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">{app.department}</p>
      </div>
      {app.description && <p className="text-sm text-slate-400">{app.description}</p>}
    </button>
  );
}
