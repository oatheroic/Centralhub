import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button, EmptyState, Input, Skeleton, ThemeToggle } from "@centralhub/ui";
import type { AppRegistryEntry } from "./registry/apps";
import { useAppRegistry } from "./lib/useAppRegistry";
import { fetchSession, type SessionUser } from "./lib/auth";
import { IdentityBanner, IdentityBannerSkeleton } from "./components/IdentityBanner";
import { AppCard } from "./components/AppCard";
import { SystemBanner } from "./components/SystemBanner";
import { announcement } from "./config/announcement";
import { getRecentAppIds } from "./lib/recentApps";
import { deptColorStyle } from "./lib/deptColor";

const CARD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
const RECENT_ROW = "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1";
const TAP_TARGET = "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-4";

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const { apps } = useAppRegistry();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string | null>(null);
  const [recentIds] = useState<string[]>(() => getRecentAppIds());
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSession().then(setUser);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  const visibleApps = useMemo(
    () =>
      (apps ?? []).filter(
        (a) => !a.hidden && (!a.requiresRole || user?.roles.includes(a.requiresRole)),
      ),
    [apps, user],
  );

  // Order used for the filter tabs — unaffected by the signed-in user's own
  // department, so the tab list doesn't reorder itself based on identity.
  const departments = useMemo(
    () => Array.from(new Set(visibleApps.map((a) => a.department))),
    [visibleApps],
  );

  // Order used only for the grouped/unfiltered section view: the signed-in
  // user's own department (if it's one with visible apps) is pulled to the
  // front, right after Recently used; everything else keeps its existing
  // relative order behind it. No special-casing needed for "no department
  // set" or "department has zero visible apps" — both fall out naturally
  // since `departments` only ever contains departments with visible apps.
  const groupedDepartmentOrder = useMemo(() => {
    const myDept = user?.department;
    if (myDept && departments.includes(myDept)) {
      return [myDept, ...departments.filter((d) => d !== myDept)];
    }
    return departments;
  }, [departments, user?.department]);

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
    return groupedDepartmentOrder.map((dept) => ({
      department: dept,
      apps: filteredApps.filter((a) => a.department === dept),
    }));
  }, [isUnfiltered, groupedDepartmentOrder, filteredApps]);

  function clearFilters() {
    setQuery("");
    setDepartment(null);
    setMobileSearchOpen(false);
  }

  return (
    <main
      className="min-h-screen bg-bg text-text"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
        <header
          className="flex items-center justify-between gap-3"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold sm:text-3xl">Central Hub</h1>
            <p className="hidden text-text-muted sm:block">
              Entry point for every department mini-app.
            </p>
          </div>
          <ThemeToggle />
        </header>

        {announcement && <SystemBanner id={announcement.id} message={announcement.message} />}

        {user === undefined ? <IdentityBannerSkeleton /> : user && <IdentityBanner user={user} />}

        {/* Search + filter tabs stick to the top of the viewport so they stay
            reachable while scrolling a long, stacked department list. */}
        <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-border bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps..."
              className="hidden max-w-xs sm:block"
            />
            <Button
              variant="secondary"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search apps"
              className={`sm:hidden ${TAP_TARGET}`}
            >
              <Search size={16} />
            </Button>
            <nav className="flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto">
              <Button
                variant={department === null ? "primary" : "secondary"}
                onClick={() => setDepartment(null)}
                className={`shrink-0 snap-start ${TAP_TARGET}`}
              >
                All
              </Button>
              {departments.map((dept) => (
                <Button
                  key={dept}
                  variant={department === dept ? "primary" : "secondary"}
                  onClick={() => setDepartment(dept)}
                  className={`shrink-0 snap-start ${TAP_TARGET}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--dept-color)]"
                    style={deptColorStyle(dept)}
                  />
                  {dept}
                </Button>
              ))}
            </nav>
          </div>

          {mobileSearchOpen && (
            <div className="flex items-center gap-2 sm:hidden">
              <Input
                ref={mobileSearchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setMobileSearchOpen(false);
                }}
                className={`shrink-0 px-2 text-sm text-text-muted hover:text-text ${TAP_TARGET}`}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {apps === undefined ? (
          <div className={CARD_GRID}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <EmptyState
            title="No apps match your search"
            description="Try a different search term or clear the department filter."
            action={
              <Button variant="secondary" onClick={clearFilters}>
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
                <div className={RECENT_ROW}>
                  {recentApps.map((app) => (
                    <div key={`recent-${app.id}`} className="w-[200px] shrink-0 snap-start">
                      <AppCard app={app} />
                    </div>
                  ))}
                </div>
              </section>
            )}
            {groupedByDepartment.map((group) => (
              <section key={group.department} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className="inline-block h-3 w-[3px] rounded-full bg-[var(--dept-color)]"
                    style={deptColorStyle(group.department)}
                  />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {group.department}
                  </h2>
                  {group.department === user?.department && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Your team
                    </span>
                  )}
                </div>
                <div className={CARD_GRID}>
                  {group.apps.map((app) => (
                    <AppCard key={app.id} app={app} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={CARD_GRID}>
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
