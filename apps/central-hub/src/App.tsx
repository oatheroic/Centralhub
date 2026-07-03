import { appRegistry } from "./registry/apps";
import { mockUser } from "./lib/session";
import { IdentityBanner } from "./components/IdentityBanner";
import { AppCard } from "./components/AppCard";

export default function App() {
  const apps = appRegistry.filter((a) => !a.hidden);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Central Hub</h1>
          <p className="text-slate-400">Entry point for every department mini-app.</p>
        </header>

        <IdentityBanner user={mockUser} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </div>
    </main>
  );
}
