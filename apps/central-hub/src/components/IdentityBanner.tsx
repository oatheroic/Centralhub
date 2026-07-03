import type { MockUser } from "../lib/session";

export function IdentityBanner({ user }: { user: MockUser }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-5 py-3">
      <div>
        <p className="text-sm font-medium text-slate-100">{user.name}</p>
        <p className="text-xs text-slate-500">{user.role}</p>
      </div>
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
        Logged in via Gateway Middleware
      </span>
    </div>
  );
}
