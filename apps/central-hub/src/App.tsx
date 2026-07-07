import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Input } from "@centralhub/ui";
import { appRegistry } from "./registry/apps";
import { fetchSession, type SessionUser } from "./lib/auth";
import { IdentityBanner, IdentityBannerSkeleton } from "./components/IdentityBanner";
import { AppCard } from "./components/AppCard";

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string | null>(null);

  useEffect(() => {
    fetchSession().then(setUser);
  }, []);

  const visibleApps = useMemo(
    () =>
      appRegistry.filter(
        (a) => !a.hidden && (!a.requiresRole || user?.roles.includes(a.requiresRole)),
      ),
    [user],
  );

  const departments = useMemo(
    () => Array.from(new Set(visibleApps.map((a) => a.department))),
    [visibleApps],
  );

  const filteredApps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleApps.filter((app) => {
      if (department && app.department !== department) return false;
      if (!needle) return true;
      return (
        app.name.toLowerCase().includes(needle) ||
        (app.description?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [visibleApps, department, query]);

  return (
    <main className="min-h-screen bg-bg p-8 text-text">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Central Hub</h1>
          <p className="text-text-muted">Entry point for every department mini-app.</p>
        </header>

        {user === undefined ? <IdentityBannerSkeleton /> : user && <IdentityBanner user={user} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps..."
            className="max-w-xs"
          />
          <nav className="flex flex-wrap gap-2">
            <Button
              variant={department === null ? "primary" : "secondary"}
              onClick={() => setDepartment(null)}
            >
              All
            </Button>
            {departments.map((dept) => (
              <Button
                key={dept}
                variant={department === dept ? "primary" : "secondary"}
                onClick={() => setDepartment(dept)}
              >
                {dept}
              </Button>
            ))}
          </nav>
        </div>

        {filteredApps.length === 0 ? (
          <EmptyState
            title="No apps match your search"
            description="Try a different search term or clear the department filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setDepartment(null);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
