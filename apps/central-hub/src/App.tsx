import { useEffect, useState } from "react";
import { appRegistry } from "./registry/apps";
import { fetchSession, type SessionUser } from "./lib/auth";
import { IdentityBanner } from "./components/IdentityBanner";
import { AppCard } from "./components/AppCard";

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const apps = appRegistry.filter(
    (a) => !a.hidden && (!a.requiresRole || user?.roles.includes(a.requiresRole)),
  );

  useEffect(() => {
    fetchSession().then(setUser);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Central Hub</h1>
          <p className="text-slate-400">Entry point for every department mini-app.</p>
        </header>

        {user && <IdentityBanner user={user} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </div>
    </main>
  );
}
