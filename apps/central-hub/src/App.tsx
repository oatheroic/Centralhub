import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Input, ThemeToggle } from "@centralhub/ui";
import { appRegistry, type AppRegistryEntry } from "./registry/apps";
import { fetchSession, type SessionUser } from "./lib/auth";
import { IdentityBanner, IdentityBannerSkeleton } from "./components/IdentityBanner";
import { AppCard } from "./components/AppCard";
import { SystemBanner } from "./components/SystemBanner";
import { announcement } from "./config/announcement";
import { getRecentAppIds } from "./lib/recentApps";

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string | null>(null);
  const [recentIds] = useState<string[]>(() => getRecentAppIds());

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

  // Only group/surface "recently used" on the unfiltered "All" view — once
  // a department or search filter narrows the list, it's already narrow
  // enough that grouping would just add noise.
  const isUnfiltered = department === null && query.trim() === "";

  const recentApps = useMemo<AppRegistryEntry[]>(() => {
    if (!isUnfiltered) return [];
    return recentIds
      .map((id) => visibleApps.find((a) => a.id === id))
      .filter((a): a is AppRegistryEntry => !!a);
  }, [isUnfiltered, recentIds, visibleApps]);

  const groupedByDepartment = useMemo(() => {
    if (!isUnfiltered) return null;
    return departments.map((dept) => ({
      department: dept,
      apps: filteredApps.filter((a) => a.department === dept),
    }));
  }, [isUnfiltered, departments, filteredApps]);

  return (
    <main className="min-h-screen bg-bg p-4 text-text sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        <header className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Central Hub</h1>
            <p className="text-text-muted">Entry point for every department mini-app.</p>
          </div>
          <ThemeToggle />
        </header>

        {announcement && <SystemBanner id={announcement.id} message={announcement.message} />}

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
        ) : groupedByDepartment ? (
          <div className="space-y-8">
            {recentApps.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Recently used
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {recentApps.map((app) => (
                    <AppCard key={`recent-${app.id}`} app={app} />
                  ))}
                </div>
              </section>
            )}
            {groupedByDepartment.map((group) => (
              <section key={group.department} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {group.department}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.apps.map((app) => (
                    <AppCard key={app.id} app={app} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
