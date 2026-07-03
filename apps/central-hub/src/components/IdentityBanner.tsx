import type { SessionUser } from "../lib/auth";

export function IdentityBanner({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-5 py-3">
      <div>
        <p className="text-sm font-medium text-slate-100">{user.name}</p>
        <p className="text-xs text-slate-500">{user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          {user.roles.join(", ")}
        </span>
        <a href="/auth/logout" className="text-xs text-slate-400 hover:text-slate-200">
          Log out
        </a>
      </div>
    </div>
  );
}
